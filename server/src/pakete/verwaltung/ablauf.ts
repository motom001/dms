/**
 * Mehrere Pakete in einem Ablauf (#405): planen, Startwerte, offene Pflichtangaben, Verweisquellen.
 */
import { createHash } from 'node:crypto';
import {
  type HerkunftPruefung,
  rechteZeilen,
  nachAbhaengigkeiten,
  PAKET_ID,
  passt,
  VERSION,
  type InstalliertesPaket,
  type Katalog,
  type KatalogVersion,
  auswahlMitAbhaengigkeiten,
  katalogPaketZu,
  type AblaufPlan,
  type AblaufAusgelassen,
  haengenAn,
  type AblaufEingabe,
} from '../../../../shared/src/pakete';
import { ueberfuehre, abschnittsfelder, type EinstellungFeld, type Verweisquelle } from '../../../../shared/src/paketeinstellungen';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { paketEinstellungen } from '../index';
import { type Manifest, type Paket } from './format';
import { meldungen, sammelKennungen } from './hilfen';
import { log } from './optionen';
import { mitPruefung, type Vorschau } from './plan';
import { SAMMEL_PAKETE_MAX } from './sammeldatei';
import { PaketInstallieren } from './installieren';

/** Ablauf über mehrere Pakete. */
export abstract class PaketAblauf extends PaketInstallieren {
  /**
   * Plan für einen gemeinsamen Ablauf (#405): alle Pakete samt Abhängigkeiten in der Reihenfolge der Installation, je
   * eine Vorschau (Namenskonflikte auch zwischen den Paketen), die Pflicht-Einstellungen, eine Herkunft und ein Prüfwert
   * aller zu bestätigenden Rechte. Es wird nichts gespeichert – die Installation rechnet den Plan neu.
   */
  async ablaufPlan(e: AblaufEingabe): Promise<AblaufPlan<Vorschau>> {
    return (await this.ablaufIntern(e)).plan;
  }

  protected async ablaufIntern(
    e: AblaufEingabe,
    namen: Record<string, Record<string, string>> = {},
    sichtNamen: Record<string, Record<string, string>> = {},
  ) {
    const installierte = await this.d.kern.repo.listePakete();
    const dms = this.o.version();
    const probleme: string[] = [];
    type Teil = {
      schluessel: string;
      paket: Paket;
      v?: KatalogVersion;
      katalog?: Katalog;
      herkunft: InstalliertesPaket['herkunft'];
      gewaehlt: boolean;
      fuer: string[];
      pruefung: HerkunftPruefung;
      upload?: string;
    };
    const teile: Teil[] = [];
    const ausgelassen: AblaufAusgelassen[] = [];
    let herkunft: HerkunftPruefung | null = null;
    const uploads = Array.isArray(e.uploads) ? [...new Set(e.uploads.map(String))] : [];
    if (uploads.length) {
      // Sammeldatei (#461): die hochgeladenen Pakete; Abhängigkeiten müssen installiert oder in der Datei sein.
      if (uploads.length > SAMMEL_PAKETE_MAX) throw new Fachfehler(422, t('pakete.ablauf.fehler.zuviele', { max: SAMMEL_PAKETE_MAX }));
      const gelesen = await Promise.all(
        uploads.map(async (token) => {
          const u = await this.hochgeladen(token);
          return { token, u, id: u.paket.manifest.id, abhaengigkeiten: u.paket.manifest.abhaengigkeiten };
        }),
      );
      for (const g of gelesen)
        if (gelesen.filter((x) => x.id === g.id).length > 1)
          throw new Fachfehler(422, t('pakete.ablauf.fehler.doppelt', { name: g.u.paket.manifest.name }));
      const ordnung = nachAbhaengigkeiten(gelesen);
      if (!ordnung) probleme.push(t('pakete.ablauf.fehler.kreis'));
      for (const g of ordnung ?? gelesen) {
        // Ein Paket aus einem Katalog bekommt Updates nur von dort (wie beim einzelnen Hochladen).
        const da = installierte.find((x) => x.id === g.id);
        if (da && da.herkunft.art !== 'hochgeladen') probleme.push(t('pakete.ablauf.fehler.katalogupdate', { name: da.name }));
        for (const [a, bereich] of Object.entries(g.abhaengigkeiten)) {
          const mit = gelesen.find((x) => x.id === a);
          if (mit && !passt(mit.u.paket.manifest.version, bereich))
            probleme.push(
              t('pakete.ablauf.fehler.version', {
                name: g.u.paket.manifest.name,
                abh: mit.u.paket.manifest.name,
                bereich,
                version: mit.u.paket.manifest.version,
              }),
            );
          else if (!mit && !installierte.some((x) => x.id === a))
            probleme.push(t('pakete.ablauf.fehler.sammelfehlt', { name: g.u.paket.manifest.name, abh: a, bereich }));
        }
        const fuer = gelesen.filter((x) => x !== g && g.id in x.abhaengigkeiten).map((x) => x.id);
        teile.push({
          schluessel: g.token,
          paket: g.u.paket,
          herkunft: { art: 'hochgeladen', von: g.u.von.email, am: g.u.am },
          gewaehlt: true,
          fuer,
          pruefung: g.u.pruefung,
          upload: g.token,
        });
      }
      herkunft = teile.find((x) => x.pruefung.bestaetigen)?.pruefung ?? teile[0]?.pruefung ?? null;
    } else {
      // „id“ oder „id@1.2.0“ (bestimmte Version, z. B. aus der Versionsauswahl in der Werkbank).
      const versionen: Record<string, string> = {};
      const ids = [
        ...new Set(
          (Array.isArray(e.pakete) ? e.pakete : []).map((x) => {
            const [id, ver] = String(x).split('@');
            if (ver !== undefined) versionen[id] = ver;
            return id;
          }),
        ),
      ];
      if (!ids.length) throw new Fachfehler(422, t('pakete.ablauf.fehler.leer'));
      if (ids.length > SAMMEL_PAKETE_MAX) throw new Fachfehler(422, t('pakete.ablauf.fehler.zuviele', { max: SAMMEL_PAKETE_MAX }));
      for (const id of ids)
        if (!PAKET_ID.test(id) || (versionen[id] !== undefined && !VERSION.test(versionen[id])))
          throw new Fachfehler(422, t('pakete.ablauf.fehler.id', { id }));
      const { katalog, url, pruefung } = await this.aktuellerKatalog(e.quelle ? String(e.quelle) : undefined);
      herkunft = pruefung;
      // Ältere Listen (Einrichtungsdatei, gemerkte Auswahl) mit einer umgezogenen Id (#1084): das Paket, das sie ersetzt.
      for (const [i, id] of ids.entries()) {
        const neu = katalog.pakete.some((p) => p.id === id) ? null : katalogPaketZu(katalog, id)?.id;
        if (neu) {
          ids[i] = neu;
          if (versionen[id] !== undefined) {
            versionen[neu] = versionen[id];
            delete versionen[id];
          }
        }
      }
      // Neu installiert wird hier nur, was fehlt – Updates gehen über „Aktualisieren“.
      // Umgezogen (#1084): Unter einer früheren Id installiert zählt als schon installiert – das Update zieht es um.
      const schonDa = (id: string) =>
        installierte.find((x) => x.id === id) ?? installierte.find((x) => katalog.pakete.find((p) => p.id === id)?.ersetzt?.includes(x.id));
      for (const id of ids) {
        const da = schonDa(id);
        if (da) probleme.push(t('pakete.ablauf.fehler.schon', { name: da.name, version: da.version }));
      }
      // Herausgeber (#1084): Ist die Id schon von jemand anderem installiert, sagt der Plan das ausdrücklich.
      for (const id of ids) {
        const da = installierte.find((x) => x.id === id);
        const kp = da ? katalog.pakete.find((x) => x.id === id) : undefined;
        const fremd =
          da && kp
            ? this.andererHerausgeber({ id, herausgeber: kp.herausgeber } as Manifest, da, { herkunft: { art: 'katalog', url }, pruefung })
            : null;
        if (fremd) probleme.push(fremd);
      }
      const aus = auswahlMitAbhaengigkeiten(
        katalog,
        ids.filter((id) => !schonDa(id)),
        dms,
        installierte,
        versionen,
      );
      probleme.push(...aus.probleme);
      // Lässt sich ein Paket nicht laden, fällt nur es weg – und was es braucht (#646); die übrigen bleiben im Plan.
      const nichtLadbar: string[] = [];
      for (const a of aus.pakete) {
        try {
          const { paket, v } = await this.lade(a.id, a.version, url);
          teile.push({
            schluessel: a.id,
            paket,
            v,
            katalog,
            herkunft: { art: 'katalog', url },
            gewaehlt: a.gewaehlt,
            fuer: a.fuer,
            pruefung,
          });
        } catch (f) {
          const kp = katalog.pakete.find((x) => x.id === a.id);
          nichtLadbar.push(a.id);
          ausgelassen.push({ id: a.id, name: kp?.name ?? a.id, version: a.version, grund: (f as Error).message });
          log.warn('Ablauf: Paket lässt sich nicht laden', { paket: a.id, version: a.version, fehler: meldungen(f) });
        }
      }
      if (nichtLadbar.length) {
        const mitAbh = aus.pakete.map((a) => ({
          id: a.id,
          abhaengigkeiten: katalog.pakete.find((x) => x.id === a.id)?.versionen.find((v) => v.version === a.version)?.abhaengigkeiten ?? {},
        }));
        for (const [id, an] of haengenAn(mitAbh, nichtLadbar)) {
          const i = teile.findIndex((x) => x.schluessel === id);
          if (i < 0) continue;
          const [x] = teile.splice(i, 1);
          ausgelassen.push({
            id,
            name: x.paket.manifest.name,
            version: x.paket.manifest.version,
            grund: t('pakete.ablauf.braucht.gescheitert', { name: katalog.pakete.find((k) => k.id === an)?.name ?? an }),
          });
        }
      }
    }
    const geplant = { typen: new Set<string>(), sichten: new Set<string>() };
    const offizieller = await this.offiziell();
    const pakete: AblaufPlan<Vorschau>['pakete'] = [];
    for (const x of teile) {
      const id = x.paket.manifest.id;
      const vorschau = mitPruefung(
        await this.plane(x.paket, x.v, x.katalog ?? offizieller, namen[id] ?? {}, sichtNamen[id] ?? {}, {
          geplant,
          quelle: { herkunft: x.herkunft, pruefung: x.pruefung },
          ablauf: true,
          ...(x.upload ? { sammel: sammelKennungen(teile.map((y) => y.paket)) } : {}),
        }),
        x.pruefung,
      );
      // Abhängigkeiten im selben Ablauf fehlen noch nicht – sie kommen vorher dran.
      vorschau.abhaengigkeiten = vorschau.abhaengigkeiten.map((a) => {
        const mit = teile.find((y) => y.paket.manifest.id === a.id);
        return mit && !a.installiert ? { ...a, verfuegbar: mit.paket.manifest.version } : a;
      });
      pakete.push({
        schluessel: x.schluessel,
        id,
        name: x.paket.manifest.name,
        version: x.paket.manifest.version,
        gewaehlt: x.gewaehlt,
        fuer: x.fuer,
        ergaenzt: x.paket.manifest.ergaenzt ?? null,
        vorschau,
        einstellungen: await this.offenePflicht(x.paket),
      });
    }
    // Ein Haken für alle Rechte: gilt nur für genau die Rechte, die der Administrator gesehen hat.
    const zuBestaetigen = pakete
      .filter((p) => p.vorschau.laeufer?.bestaetigen)
      .map((p) => [p.id, p.version, rechteZeilen(p.vorschau.laeufer!.rechte)]);
    const q = await this.verweisquelle(null);
    const plan: AblaufPlan<Vorschau> = {
      pakete,
      probleme,
      ...(ausgelassen.length ? { ausgelassen } : {}),
      herkunft,
      herkunftBestaetigen: teile.some((x) => x.pruefung.bestaetigen),
      rechte: { bestaetigen: zuBestaetigen.length > 0, stand: createHash('sha256').update(JSON.stringify(zuBestaetigen)).digest('hex') },
      auswahl: { typen: q.anzeige.typen, benutzer: q.anzeige.benutzer, rollen: q.anzeige.rollen, sichten: q.anzeige.sichten },
    };
    return { plan, teile };
  }

  /** Werte, mit denen ein Paket nach der Installation startet: Vorgaben, ggf. behaltene Werte (wie lege). */
  protected async startwerte(paket: Paket): Promise<Record<string, unknown>> {
    if (!paket.einstellungen) return {};
    const alt = await paketEinstellungen(this.d.kern, paket.manifest.id);
    return ueberfuehre(paket.einstellungen, alt?.werte ?? {}).werte;
  }

  /** Pflichtfelder in Abschnitten, die nach den Vorgaben leer bleiben (#405); Listen beginnen leer und fehlen nie. */
  private async offenePflicht(paket: Paket): Promise<EinstellungFeld[]> {
    if (!paket.einstellungen) return [];
    const w = await this.startwerte(paket);
    return abschnittsfelder(paket.einstellungen).filter(
      (f) =>
        f.pflicht &&
        (w[f.schluessel] === undefined ||
          w[f.schluessel] === null ||
          w[f.schluessel] === '' ||
          (Array.isArray(w[f.schluessel]) && !(w[f.schluessel] as unknown[]).length)),
    );
  }

  /** Auswahl für Verweise in Einstellungen; paket: für Mappentyp-Verweise ohne Präfix. */
  protected async verweisquelle(paket: string | null): Promise<Verweisquelle & { anzeige: AblaufPlan<Vorschau>['auswahl'] }> {
    const typen = await this.d.mappentypen.listeTypen();
    const installierte = await this.d.kern.repo.listePakete();
    const dmsTypen = await this.dmsTypen();
    const anzeige = {
      typen: typen.map((x) => ({
        id: x.id,
        name: x.name,
        felder: x.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label })),
      })),
      benutzer: this.o.benutzer ? await this.o.benutzer() : [],
      rollen: (await this.d.postSystemmappen.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
      sichten: (await this.d.sichtenVerwaltung.listeSichten()).map((x) => ({ id: x.id, name: x.name })),
    };
    return {
      anzeige,
      typen: anzeige.typen,
      benutzer: anzeige.benutzer.map((x) => x.id),
      rollen: anzeige.rollen.map((x) => x.id),
      sichten: anzeige.sichten.map((x) => x.id),
      typVon: (vw: string) => {
        const [p, s] = vw.includes(':') ? vw.split(':') : [paket ?? '', vw];
        if (p === 'dms') return dmsTypen.get(s)?.id ?? null;
        return installierte.find((x) => x.id === p)?.typen[s] ?? null;
      },
    };
  }
}
