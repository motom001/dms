/**
 * Anlegen bzw. ergänzen (`legeIntern`): Typen, Felder, Register, Ansichten, Automatisierungen und Vorgaben eines Pakets.
 */
import { randomUUID } from 'node:crypto';
import { type Feld, type Mappentyp, type Register } from '../../../../shared/src/model';
import { type Anzeigeregel } from '../../../../shared/src/anzeige';
import { typBild, type TypBild } from '../../../../shared/src/typvergleich';
import { type BeispielStand, hatSchnittstelle, DMS_ALIAS, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { typKennung } from '../../../../shared/src/kennungen';
import { kinderVon, type Bedingung, type Sicht } from '../../../../shared/src/sichten';
import { ueberfuehre } from '../../../../shared/src/paketeinstellungen';
import { Fachfehler } from '../../fehler';
import { protokoll } from '../../protokoll';
import { t } from '../../sprache';
import { anzahlTexte } from '../../../../shared/src/sprachpaket';
import { KB, VORLAGE_MAX } from '../../grenzen';
import {
  anzeigeMitVorgaben,
  anzeigeVorgaben,
  legeVorgaben,
  paketEinstellungen,
  passwortFelder,
  setzePaketEinstellungen,
  type VorgabenErgebnis,
} from '../index';
import { fuehreUmbauAus, nimmEinstellungenZurueck, uebernahmeDaten, type UmbauErgebnis, type UmbauLage } from '../index';
import { sichtStandNach } from '../index';
import { mitkommtVon } from '../index';
import { anzeigeTypIds, anzeigeWartet, quelleAnlegbar } from '../index';
import { vorgabeVerweis } from '../../../../shared/src/vorgaben';
import {
  BASIS_ABLAGEORT_AB,
  DMS_VERWEISE_AB,
  fremderTyp,
  istObjekt,
  type PaketFeld,
  type PaketTyp,
  paketZiele,
  str,
  tabellenTyp,
} from './format';
import { archivOhneName, meldungen, modulInfo, nachEltern, sichtAusPaket } from './hilfen';
import { log } from './optionen';
import { type LegeAuftrag } from './plan';
import {
  abschnitteNeu,
  berechnetAenderung,
  beschriftungenNeu,
  erkennungNeu,
  formatNeu,
  neueFelderAuf,
  typAngabenNeu,
  vorbelegenNeu,
  wiederfindenAus,
  wiederfindenNeu,
} from './update-neu';
import { PaketErgaenzen } from './ergaenzen';

/** Anlegen bzw. ergänzen. */
export abstract class PaketAnlegen extends PaketErgaenzen {
  protected async legeIntern({ paket, herkunft, v, plan, beispiele, von, alt, ein }: LegeAuftrag): Promise<InstalliertesPaket> {
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    const vorher = new Map((await this.d.mappentypen.listeTypen()).map((t) => [t.id, t] as const));
    // Übernahme des früheren Ablageorts (#883): gleiche Id, gilt als vorhanden (die Vorschau zählt ihn genauso).
    const ueb = await this.uebernahme(paket, alt);
    // Umbau (#1041): geplant in der Vorschau, die Antworten auf die Rückfragen schon eingetragen. Übernommene Typen
    // behalten ihre Id.
    const lage: UmbauLage = this.umbauLagen.get(plan) ?? { schritte: [], uebernahme: {} };
    const uebernimmt = (s: string) => lage.schritte.find((g) => g.plan.art === 'uebernehmen' && g.eigenerZiel === s);
    const ids = new Map<string, string>(Object.entries({ ...alt?.typen, ...ueb?.typen, ...lage.uebernahme }));
    for (const t of paket.typen) if (!ids.has(t.schluessel)) ids.set(t.schluessel, randomUUID());
    const neueTypen = paket.typen.filter(
      (t) =>
        !plan.typen.find((x) => x.schluessel === t.schluessel)?.vorhanden &&
        !plan.typen.find((x) => x.schluessel === t.schluessel)?.geloescht,
    );
    const angelegt = new Set<string>();
    const beispielIds = new Map<string, string>();
    const dmsTypen = await this.dmsTypen();
    // Vorgaben (#1038): Ihre Ids stehen vor den Typen fest – Anzeige-Bedingungen „zeigt auf die Vorgabe …“ nennen sie schon.
    const vorgabenJetzt = await this.vorgabenLage(paket, alt);
    const fremdeVorgaben = new Map<string, string | null>();
    for (const ty of paket.typen) {
      for (const vw of anzeigeVorgaben(ty).flatMap((b) => b.verweise)) {
        if (vorgabeVerweis(vw, m.id).paket !== m.id && !fremdeVorgaben.has(vw))
          fremdeVorgaben.set(vw, (await this.vorgabeMappe(vw, m.id))?.id ?? null);
      }
    }
    const vorgabeId = (vw: string): string | null => {
      const v = vorgabeVerweis(vw, m.id);
      if (v.paket !== m.id) return fremdeVorgaben.get(vw) ?? null;
      const l = vorgabenJetzt.je.get(v.schluessel);
      return l && l.zustand !== 'geloescht' ? l.id : null;
    };
    const vorgabenErg: VorgabenErgebnis = { vorgaben: {}, ergaenzungen: [], angelegt: [], rueck: [], ausgelassen: [] };
    const ziel = (vw: string, nurAngelegt: boolean): string | null => {
      const [p, s] = vw.includes(':') ? vw.split(':') : [m.id, vw];
      if (p === 'dms') {
        const eintrag = dmsTypen.get(s);
        if (!eintrag && DMS_ALIAS[s])
          throw new Fachfehler(422, t('meldungen.pakete.alias-ohne-ziel', { vw, neu: DMS_ALIAS[s], version: BASIS_ABLAGEORT_AB }));
        if (!eintrag) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich', { vw, DMS_VERWEISE_AB }));
        return eintrag.id;
      }
      if (p !== m.id) {
        const fremd = installierte.find((x) => x.id === p)?.typen[s];
        if (!fremd || !vorher.has(fremd)) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-laesst-sich-2', { vw, p, s }));
        return fremd;
      }
      const id = ids.get(s);
      if (!id) throw new Fachfehler(422, t('meldungen.pakete.der-verweis-zeigt-auf', { vw }));
      return !nurAngelegt || angelegt.has(s) || vorher.has(id) ? id : null;
    };
    // „zeigt auf Mappe vom Typ …“ in Ansichten (#1036): Typverweise → Ids; optionale (eines nicht installierten Pakets) fallen weg.
    const zieltypenIn = (b: Bedingung): Bedingung => {
      if (b.art !== 'feld' || b.op !== 'zeigtAufTyp' || b.wert?.art !== 'fest' || !Array.isArray(b.wert.wert)) return b;
      const ids = b.wert.wert
        .map((vw) => {
          try {
            return ziel(str(vw), false);
          } catch {
            return str(vw).includes(':') ? optional(str(vw)) : null;
          }
        })
        .filter((x): x is string => !!x);
      return { ...b, wert: { art: 'fest', wert: ids } };
    };
    // Optionale Ziele (#1036): ein Typ eines anderen Pakets, wenn es ihn schon gibt – sonst still nichts.
    const optional = (vw: string): string | null => {
      const [p, sl] = vw.split(':');
      const id = installierte.find((x) => x.id === p)?.typen[sl];
      return id && vorher.has(id) ? id : null;
    };
    // Anzeigen, wenn … (#1033): „zeigt auf eine Mappe vom Typ …“ (verweistyp, zeigtAufTyp) nennt im Paket Typverweise –
    // hier Ids; ein optionales Ziel, dessen Paket fehlt, bleibt als Kennung und trifft nie zu (#1122). „zeigt auf die
    // Vorgabe …“ (#1038) nennt die feste Kennung – hier die Id der Mappe („zeigt auf“).
    const anzeige = (roh: unknown, felder: PaketFeld[]) =>
      anzeigeTypIds(anzeigeMitVorgaben(roh, vorgabeId), felder, (vw) => ziel(vw, false)!, optional);
    // Stand der Typen beim Anlegen (#1122): Eine Quelle kommt erst dazu, wenn ihr Feld auf den neuen Typ zeigen darf.
    const stand = new Map(vorher);
    const auffrischen = async () => {
      for (const x of await this.d.mappentypen.listeTypen()) stand.set(x.id, x);
    };
    const eigen = (vw: string) => !vw.includes(':') || vw.startsWith(`${m.id}:`);
    // Erster Durchgang (#1122): Was auf einen Typ dieses Pakets zeigt, den es noch nicht gibt (außer auf sich selbst), wartet.
    const typFehlt = (t: PaketTyp, nurAngelegt: boolean) => (vw: string) =>
      nurAngelegt && eigen(vw) && vw.split(':').pop() !== t.schluessel && ziel(vw, true) === null;
    // Quellen (#1122): erst, wenn das Feld des anderen Typs auf diesen zeigen darf – sonst fiele die Quelle beim Speichern still weg.
    const quelleId = (t: PaketTyp, q: { typ: string; feld: string }, nurAngelegt: boolean, felder: Feld[]) => {
      const typId = ziel(q.typ, nurAngelegt);
      return typId && (!nurAngelegt || quelleAnlegbar({ typId, feldKey: q.feld }, ids.get(t.schluessel)!, stand, felder)) ? typId : null;
    };
    const eingabe = (t: PaketTyp, nurAngelegt: boolean) => {
      // Tabellen (#1030) auf einen Typ, den es noch nicht gibt, kommen im zweiten Durchgang – wie Verweise.
      const offen = new Set(
        t.felder
          .filter((f) =>
            [...paketZiele(f), ...tabellenTyp(f)].some(
              (z) => !(eigen(z) && z.split(':').pop() === t.schluessel) && ziel(z, nurAngelegt) === null,
            ),
          )
          .map((f) => f.key),
      );
      // Anzeige-Bedingungen (#1122) auf Felder oder Typen, die erst im zweiten Durchgang kommen, ebenso.
      const wartet = (roh: unknown) => !!roh && anzeigeWartet(roh, offen, typFehlt(t, nurAngelegt));
      const felder = t.felder
        .filter((f) => !offen.has(f.key))
        .map(({ ziel: z, zielOptional: opt, berechnet, quelle: q, ...f }) => {
          const ziele = [
            ...paketZiele({ ziel: z }).map((x) => ziel(x, false)!),
            ...(opt ?? []).map(optional).filter((x): x is string => !!x),
          ];
          // Tabelle (#1030): Typverweis → Id; „standard“ ist die Standard-Trefferliste (Pakete bringen nur sie mit).
          const quelle =
            f.typ === 'tabelle' && q
              ? { typId: ziel(str(q.typ), false)!, feldKey: str(q.feld), ...(q.neu ? { neu: str(q.neu) } : {}) }
              : undefined;
          // Berechnet (#1034): gehört dem Paket, das den Typ mitbringt; null gibt ein Feld frei, das das Paket nicht mehr berechnet.
          // Beim Auswählen übernehmen (#1037): Zielfelder, die erst im zweiten Durchgang kommen, auch erst dann.
          const vorbelegen = f.vorbelegen?.filter((p) => !offen.has(p.nach));
          return {
            ...f,
            ...(vorbelegen ? { vorbelegen } : {}),
            wiederfinden: wiederfindenAus(f as PaketFeld),
            ...(f.typ === 'referenz' ? { zielTypen: [...new Set(ziele)] } : {}),
            ...(opt?.length ? { zielOptional: opt } : {}),
            ...(f.anzeigen ? { anzeigen: wartet(f.anzeigen) ? undefined : anzeige(f.anzeigen, t.felder) } : {}),
            ...(quelle ? { quelle } : {}),
            berechnetVon: berechnet === true ? m.id : null,
          };
        });
      const register = t.register.map((r) => ({
        ...r,
        ...(r.quellen
          ? {
              quellen: r.quellen
                .map((q) => ({ typId: quelleId(t, q, nurAngelegt, felder as Feld[]), feldKey: q.feld }))
                .filter((q) => q.typId),
            }
          : {}),
        ...(Array.isArray(r.abschnitte)
          ? {
              abschnitte: (r.abschnitte as unknown[]).map((x) =>
                istObjekt(x) && x.anzeigen
                  ? wartet(x.anzeigen)
                    ? { ...x, anzeigen: undefined }
                    : { ...x, anzeigen: anzeige(x.anzeigen, t.felder) }
                  : x,
              ),
            }
          : {}),
      }));
      const unvollstaendig =
        offen.size > 0 ||
        t.register.some((r) => (r.quellen ?? []).some((q) => quelleId(t, q, nurAngelegt, felder as Feld[]) === null)) ||
        t.felder.some((f) => wartet(f.anzeigen)) ||
        t.register.some((r) => Array.isArray(r.abschnitte) && (r.abschnitte as unknown[]).some((x) => istObjekt(x) && wartet(x.anzeigen)));
      const name = plan.typen.find((x) => x.schluessel === t.schluessel)!.name;
      return {
        unvollstaendig,
        daten: {
          id: ids.get(t.schluessel),
          name,
          schluessel: typKennung(m.id, t.schluessel),
          beschreibung: t.beschreibung,
          titelVorlage: t.titelVorlage ?? '',
          felder,
          register,
          ...(t.trefferliste ? { trefferliste: t.trefferliste.filter((k) => !offen.has(k)) } : {}),
          ...(t.beschriftungen ? { beschriftungen: t.beschriftungen } : {}),
          ...(t.ausPost !== undefined ? { ausPost: t.ausPost } : {}),
          ...(t.erkennbarAn ? { erkennbarAn: t.erkennbarAn } : {}),
          ...(t.inSuche !== undefined ? { inSuche: t.inSuche } : {}),
          // Ist Teil einer anderen Mappe (#1031): erst, wenn das Feld dabei ist (sonst im zweiten Durchgang).
          teilVon: t.gehoertZu && !offen.has(t.gehoertZu) ? t.gehoertZu : null,
          // Archivmodus (#1051) wie in der Vorschau – zählt nur beim Anlegen (und im zweiten Durchgang desselben neuen Typs);
          // das Update übernimmt den Archivmodus des vorhandenen Typs.
          archiv: plan.typen.find((x) => x.schluessel === t.schluessel)?.archiv
            ? archivOhneName(plan.typen.find((x) => x.schluessel === t.schluessel)!.archiv!)
            : null,
          sichtAnlegen: false,
        },
      };
    };
    // Zurückrollen: angelegte Mappen, Sichten, Typen; geänderte Typen auf den alten Stand.
    const mappen: string[] = [];
    let beispielStaende: BeispielStand[] = [];
    const neueSichten: string[] = [];
    // Ansichten (#1125): ersetzte (alter Stand zum Zurückrollen), geschriebene (Schlüssel, für den Stand), gewünschte.
    const ersetzteSichten: Sicht[] = [];
    const sichtGeschrieben = new Set<string>();
    const ersetzenGewuenscht = this.sichtenErsetzen.get(plan) ?? new Set<string>();
    const geaendert: Mappentyp[] = [];
    // Abschnitte aus dem Update (#890) je Typ: gehören zum Paketstand (#653), nicht zu den eigenen Änderungen.
    const abschnittRegister = new Map<string, Set<string>>();
    const kennungZurueck = new Map<string, string>();
    const zurueck = async () => {
      for (const [id, k] of kennungZurueck) await this.d.kern.repo.setzeTypKennung(id, k).catch(() => {});
      // Vorgaben (#1038): Vorlagen und geänderte Werte zurück, neue Vorgaben weg (nach den Beispielen, die auf sie zeigen).
      for (const r of vorgabenErg.rueck) await r().catch(() => {});
      await this.d.loeschen.entferneMappenEndgueltig(mappen).catch(() => {});
      await this.d.loeschen.entferneMappenEndgueltig(vorgabenErg.angelegt).catch(() => {});
      for (const s of ersetzteSichten) await this.d.sichtenVerwaltung.aendereSicht(s.id, s).catch(() => {});
      for (const s of [...neueSichten].reverse()) await this.d.sichtenVerwaltung.loescheSicht(s).catch(() => {});
      for (let runde = 0; runde < 3; runde++)
        for (const s of [...angelegt].reverse()) {
          const id = ids.get(s)!;
          await this.d.mappentypen.loescheTyp(id).then(
            () => angelegt.delete(s),
            () => {},
          );
        }
      for (const t of geaendert) await this.d.mappentypen.aendereTyp(t.id, t).catch(() => {});
    };
    const alteEinstellungen = await paketEinstellungen(this.d.kern, m.id);
    let einstellungenGeschrieben = false;
    // Wortlisten (#356): ersetzen die des Pakets; bei einem Fehler kommen die alten zurück.
    const alteWortlisten = alt ? await this.d.suche.paketSynonyme(m.id) : [];
    let wortlistenGeschrieben = false;
    // Code (#403): Der alte Code kommt bei einem Fehler zurück – sonst liefe das alte Paket mit dem neuen Modul.
    const alterCode = alt?.laeufer ? await this.d.kern.repo.paketCode(m.id) : [];
    let codeGeschrieben = false;
    // Sprachpaket (#731): Die alten Texte kommen bei einem Fehler zurück.
    const alteSprache = alt?.sprache ? ((await this.d.kern.repo.sprachpakete()).find((x) => x.paketId === m.id) ?? null) : null;
    let spracheGeschrieben = false;
    const typMap: Record<string, string> = { ...(alt?.typen ?? {}), ...ueb?.typen };
    const sichtMap: Record<string, string> = { ...(alt?.sichten ?? {}), ...ueb?.sichten };
    let umbauErg = null as UmbauErgebnis | null;
    // Umbau (#1041): Alles läuft in einer Transaktion (legeMitUmbau). Was andere Verbindungen lesen (Läufer, Sprachen,
    // Arbeit im Hintergrund), erst nach dem Speichern anstoßen – sonst sähen sie den alten Stand.
    const spaeter = (f: () => Promise<unknown>): Promise<unknown> =>
      this.d.kern.inEigenerTransaktion()
        ? (this.d.kern.danach(() => {
            void f();
          }),
          Promise.resolve())
        : f();
    try {
      // 1. Neue Typen: Ziele zuerst; Verweise auf noch fehlende Typen dieses Pakets im zweiten Durchgang.
      const rest = [...neueTypen];
      const nachtragen: PaketTyp[] = [];
      while (rest.length) {
        const i = rest.findIndex((t) => !eingabe(t, true).unvollstaendig);
        const paketTyp = rest.splice(i < 0 ? 0 : i, 1)[0];
        const x = eingabe(paketTyp, true);
        // Umbau (#1041): Den übernommenen Typ gibt es schon – er wird mit seiner Id zum Typ des Pakets.
        const ueber = uebernimmt(paketTyp.schluessel);
        try {
          if (ueber)
            await this.uebernimmTyp(ueber.alt.id, typKennung(m.id, paketTyp.schluessel), uebernahmeDaten(ueber, x.daten), m.id, {
              vorher,
              geaendert,
              kennungZurueck,
            });
          else await this.d.mappentypen.legeTypAn(x.daten, m.id);
        } catch (f) {
          throw new Fachfehler(
            (f as Fachfehler).status ?? 422,
            t('meldungen.pakete.mappentyp', { name: x.daten.name, meldungen: meldungen(f) }),
          );
        }
        if (!ueber) angelegt.add(paketTyp.schluessel);
        typMap[paketTyp.schluessel] = ids.get(paketTyp.schluessel)!;
        await auffrischen();
        // Archivmodus aus dem Paket (#1051): im Protokoll wie beim Einschalten in der Werkbank.
        if (x.daten.archiv)
          protokoll.modul('werkbank').info('Archivmodus eingeschaltet', {
            typ: x.daten.name,
            paket: m.id,
            vorher: { an: false },
            nachher: {
              an: true,
              jahre: x.daten.archiv.jahre,
              stichtag: x.daten.archiv.stichtag ?? 'Anlagedatum',
              ...(x.daten.archiv.leererStichtag ? { leererStichtag: 'läuft noch nicht ab' } : {}),
            },
          });
        if (x.unvollstaendig) nachtragen.push(paketTyp);
      }
      // Optionale Ziele (#1036) vor dem zweiten Durchgang (#1122): Verweisfelder anderer Pakete zeigen jetzt auch auf die
      // neuen Typen – erst dann gehen Quellen über diese Felder (Fahrzeug ← Rechnung „Betrifft“).
      await this.ergaenzeOptionaleZiele(paket, typMap, geaendert);
      await auffrischen();
      // Tabellen (#1030) zuletzt: Ihre Quelle braucht das Verweisfeld des anderen Typs, das vielleicht erst hier dazukommt.
      nachtragen.sort((a, b) => Number(a.felder.some((f) => f.typ === 'tabelle')) - Number(b.felder.some((f) => f.typ === 'tabelle')));
      for (const paketTyp of nachtragen) {
        const ueber = uebernimmt(paketTyp.schluessel);
        try {
          await this.d.mappentypen.aendereTyp(
            ids.get(paketTyp.schluessel)!,
            ueber ? uebernahmeDaten(ueber, eingabe(paketTyp, false).daten) : eingabe(paketTyp, false).daten,
            m.id,
          );
        } catch (f) {
          throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: paketTyp.name, meldungen: meldungen(f) }));
        }
      }
      // 2. Update: vorhandene Typen um neue Felder und Register ergänzen – sonst nichts ändern.
      for (const paketTyp of paket.typen) {
        const p = plan.typen.find((x) => x.schluessel === paketTyp.schluessel)!;
        // Berechnete Felder (#1034): Das Update gilt auch für vorhandene Felder – neu berechnet oder nicht mehr.
        const vorab = p.vorhanden ? vorher.get(ids.get(paketTyp.schluessel)!) : undefined;
        const berechnetNeu = vorab ? berechnetAenderung(paketTyp, vorab, m.id) : new Map<string, string | null>();
        if (
          !p.vorhanden ||
          (!p.neueFelder.length &&
            !p.neueRegister.length &&
            !p.erkennung?.length &&
            !p.wiederfinden?.length &&
            !p.vorbelegen?.length &&
            !p.typAngaben &&
            !p.formate?.length &&
            !p.beschriftungen &&
            !p.abschnitte?.length &&
            !berechnetNeu.size)
        )
          continue;
        const aktuell = vorher.get(ids.get(paketTyp.schluessel)!)!;
        const neu = eingabe(paketTyp, false).daten;
        // Erkennung (#336): Markierung des Pakets an vorhandene Felder, an denen der Administrator nichts eingestellt hat.
        const markiert = new Map(erkennungNeu(paketTyp, aktuell).map((f) => [f.key, f.erkennung]));
        // Zum Wiederfinden (#938) und die Angaben am Typ (#937) genauso: nur, wo noch nichts eingestellt ist.
        const wiederfinden = new Set(wiederfindenNeu(paketTyp, aktuell).map((f) => f.key));
        // Beim Auswählen übernehmen (#1037) genauso: nur an Verweisfeldern ohne eigene Paare.
        const vorbelegen = new Map(vorbelegenNeu(paketTyp, aktuell).map((f) => [f.key, f.vorbelegen] as const));
        // Formate und Datumsgrenzen (#535) genauso: nur an Feldern ohne eigene Einstellung.
        const vorgaben = new Map(formatNeu(paketTyp, aktuell).map((f) => [f.key, f.vorgaben]));
        // Beschriftungen (#728) genauso: ergänzt, was der Administrator noch nicht beschriftet hat.
        const besch = beschriftungenNeu(paketTyp, aktuell);
        // Ausblenden (#655): Was der Administrator ausgeblendet hat, bleibt so; was das Update neu bringt, ist sichtbar.
        const felder = [
          ...besch.typ.felder.map((f) => ({
            ...f,
            ...(markiert.has(f.key) ? { erkennung: markiert.get(f.key) } : {}),
            ...(wiederfinden.has(f.key) ? { wiederfinden: true } : {}),
            ...(vorbelegen.has(f.key) ? { vorbelegen: vorbelegen.get(f.key) } : {}),
            ...vorgaben.get(f.key),
            ...(berechnetNeu.has(f.key) ? { berechnetVon: berechnetNeu.get(f.key) } : {}),
          })),
          ...neu.felder.filter((f) => !aktuell.felder.some((g) => g.key === f.key)).map(({ ausgeblendet: _a, ...f }) => f),
        ];
        // Abschnitte (#890) nur an Feldregistern, die noch keine haben.
        const abschnitte = new Map(
          abschnitteNeu(paketTyp, aktuell, (r) => [...(r.felder ?? []), ...neueFelderAuf(paketTyp, aktuell, r)]).map(
            (r) => [r.key, r.abschnitte] as const,
          ),
        );
        if (abschnitte.size) abschnittRegister.set(aktuell.id, new Set(abschnitte.keys()));
        const register = besch.typ.register.map((r) => {
          const dazu = neueFelderAuf(paketTyp, aktuell, r);
          const mit = dazu.length ? { ...r, felder: [...(r.felder ?? []), ...dazu] } : r;
          return abschnitte.has(r.key)
            ? {
                ...mit,
                abschnitte: abschnitte
                  .get(r.key)!
                  .map((a) => (a.anzeigen ? { ...a, anzeigen: anzeige(a.anzeigen, paketTyp.felder) as Anzeigeregel } : a)),
              }
            : mit;
        });
        for (const r of neu.register)
          if (!register.some((g) => g.key === r.key)) {
            const { ausgeblendet: _a, ...ohne } = r as Register;
            register.push(ohne);
          }
        geaendert.push(aktuell);
        try {
          await this.d.mappentypen.aendereTyp(
            aktuell.id,
            {
              ...aktuell,
              ...typAngabenNeu(paketTyp, { ...aktuell, felder: felder as unknown as Feld[] }),
              felder,
              register,
              beschriftungen: besch.typ.beschriftungen ?? null,
            },
            m.id,
          );
        } catch (f) {
          throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: aktuell.name, meldungen: meldungen(f) }));
        }
      }
      // Übernahme (#883): Der frühere Ablageort gehört jetzt dem Paket und heißt wie dessen Typ (#1084: basis:ablageort).
      for (const [s, id] of Object.entries(ueb?.typen ?? {})) {
        const vorKennung = vorher.get(id)?.schluessel;
        if (vorKennung === typKennung(m.id, s)) continue;
        await this.d.kern.repo.setzeTypKennung(id, typKennung(m.id, s));
        if (vorKennung) kennungZurueck.set(id, vorKennung);
      }
      // 2b. Optionale Ziele (#1036): Vorhandene Felder dieses Pakets lernen neue optionale Ziele aus dem Update; dann nimmt
      // jedes Feld (auch anderer Pakete) die optionalen Ziele auf, die es jetzt gibt – etwa die Fahrzeuge, wenn das Paket
      // Fahrzeuge nach den Rechnungen kommt. Entfernt wird dabei nichts.
      await this.ergaenzeOptionaleZiele(paket, typMap, geaendert);
      // 2c. Quellen (#1122): Was jetzt geht, nachtragen; was das Paket vorsieht und nicht geht, ist ein Fehler mit Stelle.
      await this.quellenNachtragen(paket, {
        ids,
        neu: new Set(neueTypen.map((x) => x.schluessel)),
        vorher,
        geaendert,
        typId: (vw) => ziel(vw, false)!,
      });
      // 3. Neue Sichten, Elternsichten zuerst, am Ende ihrer Ebene. Vorhandene (#1125): unverändert (Prüfwert) bzw. auf
      // Wunsch → durch die neue Fassung ersetzt; was der Administrator geändert hat, bleibt sonst.
      for (const s of nachEltern(paket.sichten)) {
        const sp = plan.sichten.find((x) => x.schluessel === s.schluessel)!;
        if (sp.ausgelassen) continue;
        const ersetzen =
          sp.zustand === 'aktualisiert' ||
          ((sp.zustand === 'geaendert' || sp.zustand === 'unbekannt') && ersetzenGewuenscht.has(s.schluessel));
        if (sp.vorhanden && !ersetzen) continue;
        const alle = await this.d.sichtenVerwaltung.listeSichten();
        const vorhanden = sp.vorhanden ? alle.find((x) => x.id === sichtMap[s.schluessel]) : undefined;
        if (sp.vorhanden && !vorhanden) continue;
        const elternId = s.eltern ? (sichtMap[s.eltern] ?? vorhanden?.elternId ?? null) : null;
        if (s.eltern && !elternId)
          throw new Fachfehler(422, t('meldungen.pakete.ansicht-elternsicht-fehlt', { name: s.name, eltern: s.eltern }));
        const position =
          vorhanden && vorhanden.elternId === elternId
            ? vorhanden.position
            : Math.max(0, ...kinderVon(alle, elternId).map((x) => x.position)) + 10;
        // „*“ (#725): Ansicht über alle Mappentypen – bleibt, wie es ist.
        const jetzt = await this.d.mappentypen.listeTypen();
        const daten = sichtAusPaket(s, {
          typId: (vw) => ziel(vw, false),
          fremd: (s.fremdeTypen ?? []).map((f) => fremderTyp(f.kennung, jetzt, installierte)?.id).filter((x): x is string => !!x),
          zieltypenIn,
        });
        if (!daten.typen.length && (s.fremdeTypen ?? []).length) continue;
        try {
          if (vorhanden) {
            // Name des Pakets, außer er gibt es unter derselben Elternsicht schon; Rechte an der Ansicht (#148) bleiben.
            const name = kinderVon(alle, elternId).some(
              (x) => x.id !== vorhanden.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase(),
            )
              ? vorhanden.name
              : s.name;
            await this.d.sichtenVerwaltung.aendereSicht(vorhanden.id, {
              ...vorhanden,
              ...daten,
              name,
              elternId,
              position,
              beschriftungen: { ...vorhanden.beschriftungen, ...s.beschriftungen },
            });
            ersetzteSichten.push(vorhanden);
          } else {
            const neu = await this.d.sichtenVerwaltung.legeSichtAn({
              name: sp.name,
              ...daten,
              ...(s.beschriftungen ? { beschriftungen: s.beschriftungen } : {}),
              elternId,
              position,
            });
            neueSichten.push(neu.id);
            sichtMap[s.schluessel] = neu.id;
          }
          sichtGeschrieben.add(s.schluessel);
        } catch (f) {
          throw new Fachfehler(422, t('meldungen.pakete.ansicht', { name: sp.name, meldungen: meldungen(f) }));
        }
      }
      if (ersetzteSichten.length)
        log.info('Paket: Ansichten durch die neue Fassung ersetzt', {
          paket: m.id,
          version: m.version,
          ansichten: ersetzteSichten.map((x) => x.name),
        });
      // 3b. Vorgaben (#1038): immer (keine Wahl wie bei Beispielen), ohne Ereignisse; Ersteller ist das Dienstkonto des
      // Pakets. Updates ergänzen; was der Administrator geändert oder gelöscht hat, bleibt so.
      if (paket.vorgaben?.length || paket.ergaenzungen?.length) {
        await legeVorgaben(
          this.d,
          {
            paketId: m.id,
            teil: {
              vorgaben: paket.vorgaben ?? [],
              ergaenzungen: paket.ergaenzungen ?? [],
              vorlagenDateien: paket.vorlagenDateien ?? new Map(),
            },
            lage: vorgabenJetzt,
            alt,
            sprache: await this.sprache(),
            von: await this.ersteller(m, !!paket.code, von),
            typId: (vw) => ziel(vw, false),
            vorgabeId: async (vw) => vorgabeId(vw) ?? (await this.vorgabeMappe(vw, m.id))?.id ?? null,
            geheim: passwortFelder([...(await this.d.mappentypen.listeTypen()), ...paket.typen]),
            maxText: `${VORLAGE_MAX / KB} KB`,
          },
          vorgabenErg,
        );
        if (vorgabenErg.ausgelassen.length)
          log.info('Paket: Vorlagen für Vorgaben, die es nicht gibt, ausgelassen', { paket: m.id, ziele: vorgabenErg.ausgelassen });
      }
      // 3c. Umbau (#1041): Werte umziehen, Typen zusammenlegen, Rechte mitnehmen, Verweise umleiten – nach Typen und
      // Vorgaben (die `setzen` nennen kann). Frühere eigene Typen, die dabei aufgehen, fallen aus dem Eintrag.
      if (lage.schritte.length) {
        umbauErg = await fuehreUmbauAus(this.d, {
          lage,
          paket: { id: m.id, name: m.name, version: m.version },
          von,
          typId: (s) => typMap[s] ?? ids.get(s),
          vorgabeId: async (vw) => vorgabeId(vw) ?? (await this.vorgabeMappe(vw, m.id))?.id ?? null,
        });
        for (const s of umbauErg.eigeneWeg) if (!paket.typen.some((x) => x.schluessel === s)) delete typMap[s];
        // Automatisierungen liegen in einem eigenen Speicher: erst nach dem Speichern auf den Zieltyp umleiten.
        for (const u of umbauErg.umgeleitet)
          void spaeter(() =>
            Promise.resolve(this.d.typUmgebaut?.(u.alt, u.neu, u.felder)).catch((e: Error) =>
              log.error('Umbau: Automatisierungen nicht umgeleitet', { paket: m.id, typ: u.alt, fehler: e.message }),
            ),
          );
      }
      // 4. Beispiele (nur bei der Installation, auf Wunsch).
      if (beispiele && !alt) {
        await this.legeBeispielMappen({ paket, ziel: (vw) => ziel(vw, false)!, vorgabeId, installierte, von, mappen, beispielIds });
        // Stand direkt nach dem Anlegen (#878): Unveränderte Beispiele lassen sich später samt Dokumenten entfernen.
        beispielStaende = await this.d.beispielMappen.beispielStand(mappen);
      }
      // Einstellungen (#197): Vorgaben setzen bzw. überführen; nach dem Entfernen behaltene Werte zählen.
      if (paket.einstellungen) {
        const vorher = alteEinstellungen ?? { werte: {} };
        const { werte } = ueberfuehre(paket.einstellungen, alteEinstellungen ? vorher.werte : {});
        await setzePaketEinstellungen(this.d.kern, m.id, { ...vorher, werte });
        einstellungenGeschrieben = true;
      } else if (alteEinstellungen && alt) {
        await setzePaketEinstellungen(this.d.kern, m.id, null);
        einstellungenGeschrieben = true;
      }
      if (paket.wortlisten.length || alteWortlisten.length) {
        wortlistenGeschrieben = true;
        await this.d.suche.setzePaketSynonyme(m.id, paket.wortlisten);
      }
      const jetzt = new Date().toISOString();
      // Paketstand der Mappentypen (#653): neue Typen so, wie sie angelegt wurden; beim Update bleibt der alte Stand,
      // nur was das Update hinzufügt (Felder, Register), kommt dazu – eigene Änderungen gehören nicht dazu.
      const nachher = new Map((await this.d.mappentypen.listeTypen()).map((t) => [t.id, t] as const));
      const typStand: Record<string, TypBild> = {};
      for (const tid of Object.values(typMap)) {
        const t = nachher.get(tid);
        if (!t) continue;
        const jetztBild = typBild(t, (id) => nachher.get(id)?.schluessel);
        const vorBild = alt?.typStand?.[tid];
        typStand[tid] = !vorBild
          ? jetztBild
          : {
              ...vorBild,
              felder: [
                ...vorBild.felder,
                ...jetztBild.felder.filter(
                  (f) => !vorBild.felder.some((g) => g.key === f.key) && !vorher.get(tid)?.felder.some((g) => g.key === f.key),
                ),
              ],
              register: [
                ...vorBild.register.map((r) => {
                  if (!abschnittRegister.get(tid)?.has(r.key)) return r;
                  const jetzt = jetztBild.register.find((g) => g.key === r.key);
                  return jetzt?.werte.abschnitte ? { ...r, werte: { ...r.werte, abschnitte: jetzt.werte.abschnitte } } : r;
                }),
                ...jetztBild.register.filter(
                  (r) => !vorBild.register.some((g) => g.key === r.key) && !vorher.get(tid)?.register.some((g) => g.key === r.key),
                ),
              ],
            };
      }
      const datensatz: InstalliertesPaket = {
        id: m.id,
        name: m.name,
        version: m.version,
        beschreibung: m.beschreibung,
        lizenz: m.lizenz,
        autor: m.autor,
        herkunft,
        // Herausgeber (#1084): einmal gespeichert, gilt er für alle weiteren Updates.
        ...(plan.paket.herausgeber ? { herausgeber: plan.paket.herausgeber } : alt?.herausgeber ? { herausgeber: alt.herausgeber } : {}),
        // Ohne Herausgeber aus dem offiziellen Katalog, aber ohne gültige Signatur (#1351): nicht später doch `app.ablago`.
        ...(plan.paket.herausgeberGeprueft
          ? { herausgeberGeprueft: true }
          : !plan.paket.herausgeber && !alt?.herausgeber && herkunft.art === 'katalog' && herkunft.url === this.katalogUrl
            ? { herausgeberGeprueft: false }
            : {}),
        // Weiterer signierter Katalog: Herausgeber an dessen Schlüssel gebunden (Sicherheit C); bei geordnetem Wechsel der neue.
        ...(plan.herausgeberSchluessel
          ? { herausgeberSchluessel: plan.herausgeberSchluessel }
          : alt?.herausgeberSchluessel
            ? { herausgeberSchluessel: alt.herausgeberSchluessel }
            : {}),
        // Ersetzte Ids (#1084): für mitgelieferte Automatisierungen und spätere Updates unter dieser Id.
        ...(() => {
          const f = [...new Set([...(alt?.ersetzt ?? []), ...(m.ersetzt ?? [])])].filter((x) => x !== m.id);
          return f.length ? { ersetzt: f } : {};
        })(),
        // Nötige DMS-Version (#458): bestimmt u. a., ob das Paket „Volltext fertig“ auch ohne Text bekommt.
        ...(m.dms ? { dms: m.dms } : {}),
        installiert: alt?.installiert ?? jetzt,
        installiertVon: alt ? alt.installiertVon : von.email,
        aktualisiert: alt ? jetzt : null,
        aktualisiertVon: alt ? von.email : null,
        typen: typMap,
        sichten: sichtMap,
        abhaengigkeiten: m.abhaengigkeiten,
        // Ansichten mit Prüfwert (#1125): ein späteres Update ersetzt nur, was noch so ist.
        sichtStand: sichtStandNach({
          sichten: paket.sichten,
          alt,
          ids: sichtMap,
          geschrieben: sichtGeschrieben,
          zustand: (k) => plan.sichten.find((x) => x.schluessel === k)?.zustand,
          jetzt: await this.d.sichtenVerwaltung.listeSichten(),
          umbau: umbauErg?.sichten,
        }),
        // Beispiel-Mappen mit Schlüssel (#347), damit spätere Pakete auf sie verweisen können.
        ...(beispielIds.size ? { beispiele: Object.fromEntries(beispielIds) } : alt?.beispiele ? { beispiele: alt.beispiele } : {}),
        ...(beispielStaende.length
          ? { beispielMappen: beispielStaende }
          : alt?.beispielMappen?.length
            ? { beispielMappen: alt.beispielMappen }
            : {}),
        // Vorgaben (#1038): auch die, die die neue Version nicht mehr nennt – sie bleiben und gehören weiter zum Paket.
        ...(() => {
          const v = { ...alt?.vorgaben, ...vorgabenErg.vorgaben };
          return Object.keys(v).length ? { vorgaben: v } : {};
        })(),
        ...(vorgabenErg.ergaenzungen.length
          ? { ergaenzungen: vorgabenErg.ergaenzungen }
          : alt?.ergaenzungen?.length
            ? { ergaenzungen: alt.ergaenzungen }
            : {}),
        einstellungen: paket.einstellungen,
        code: m.code !== undefined,
        ...(paket.automatisierungen.length ? { automatisierungen: paket.automatisierungen.map((a) => a.schluessel) } : {}),
        ...(paket.code
          ? {
              laeufer: {
                ...paket.code.info,
                modul: modulInfo(paket.code),
                daten: paket.code.dateien.filter((d) => d.name !== 'modul.wasm').map((d) => d.name),
              },
            }
          : {}),
        ...(v ? { links: { readme: v.readme, changelog: v.changelog, quelle: v.quelle } } : alt?.links ? { links: alt.links } : {}),
        ...(paket.sprache
          ? {
              sprache: {
                ...paket.sprache.angabe,
                texte: anzahlTexte(paket.sprache.texte),
                uebergangen: paket.sprache.uebergangen.length,
                beschriftungen: Object.keys(paket.sprache.beschriftungen),
              },
            }
          : {}),
        // Aktionen im Menü „Mappe“ (#1039): wie diese Version sie nennt; ausgeschaltete merkt sich die Werkbank getrennt.
        ...(paket.mappenaktionen?.length ? { mappenaktionen: paket.mappenaktionen } : {}),
        // Was mitkommt und Kurzanleitung (#1047): für die Paketseite, wie diese Version sie mitbringt.
        mitkommt: mitkommtVon(
          paket,
          plan,
          this.mitkommtNamen(paket, await this.d.kern.repo.listePakete(), await this.d.mappentypen.listeTypen()),
          false,
        ),
        ...(paket.kurzanleitung ? { kurzanleitung: paket.kurzanleitung } : {}),
        // Rundgänge und Tipps (#831, #832): wie diese Version sie mitbringt; vorher = Version vor diesem Update.
        ...(paket.entdecken ? { entdecken: { ...paket.entdecken, vorher: alt?.version ?? null } } : {}),
        typStand,
      };
      // Code (#338): ersetzt den bisherigen; ohne Code im neuen Paket fällt er weg.
      if (paket.code || alt?.laeufer) codeGeschrieben = true;
      if (paket.code) await this.d.kern.repo.speicherePaketCode(m.id, paket.code.dateien);
      else if (alt?.laeufer) await this.d.kern.repo.loeschePaketCode(m.id);
      // Sprachpaket (#731): Texte und Beschriftungen neben dem Eintrag; ersetzt die der alten Version.
      if (paket.sprache || alt?.sprache) spracheGeschrieben = true;
      if (paket.sprache)
        await this.d.kern.repo.speichereSprachpaket(m.id, {
          kennung: paket.sprache.angabe.kennung,
          texte: paket.sprache.texte,
          beschriftungen: paket.sprache.beschriftungen,
        });
      else if (alt?.sprache) await this.d.kern.repo.loescheSprachpaket(m.id);
      await this.d.kern.repo.speicherePaket(datensatz);
      if (ueb) log.info('Ablageort an das Paket übergeben', { paket: m.id, typ: ueb.name, ansichten: Object.keys(ueb.sichten).length });
      // #712: mitgelieferte Automatisierungen – aus, außer denen, die beim Installieren angehakt wurden (nach dem
      // Speichern, damit Typen und Herkunft stimmen).
      await Promise.resolve(this.d.paketAutomatisierungen?.(datensatz, paket.automatisierungen, ein)).catch((e: Error) =>
        log.warn('Automatisierungen des Pakets nicht angelegt', { paket: m.id, fehler: e.message }),
      );
      // #1044: mitgelieferte Automatisierungsvorlagen – sofort im Menü „Mappe“; überlagert eine die Kern-Vorgabe, gilt sie.
      await this.d.ablaeufe
        .ausPaket(datensatz, paket.ablaufvorlagen ?? [])
        .catch((e: Error) => log.warn('Automatisierungsvorlagen des Pakets nicht angelegt', { paket: m.id, fehler: e.message }));
      if (paket.code || alt?.laeufer) await spaeter(() => Promise.resolve(this.o.laeufer?.codeGeaendert?.()).catch(() => {}));
      // Sprachpaket (#731): Sprache sofort in diesem Prozess (die anderen lesen sie binnen einer Minute), dann Beschriftungen
      // der Standardpakete – beim Sprachpaket für alle installierten Pakete, sonst die installierten Sprachen für dieses.
      if (paket.sprache || alt?.sprache)
        await spaeter(() =>
          Promise.resolve(this.o.sprachen?.geaendert()).catch((e: Error) =>
            log.warn('Sprachpaket nicht geladen', { paket: m.id, fehler: e.message }),
          ),
        );
      await this.sprachBeschriftungen(paket.sprache ? undefined : [m.id]).catch((e: Error) =>
        log.warn('Beschriftungen aus Sprachpaketen nicht übernommen', { paket: m.id, fehler: e.message }),
      );
      // Texterkennung als Paket (#459): Was ohne Paket wartete, geht jetzt an das neue Paket.
      if (hatSchnittstelle(datensatz.laeufer, 'dms:texterkennung') && !hatSchnittstelle(alt?.laeufer, 'dms:texterkennung')) {
        void spaeter(() =>
          this.d.volltexte
            .texterkennungPaketDa()
            .catch((e: Error) => log.warn('Wartende Dokumente nicht an die Texterkennung gegeben', { paket: m.id, fehler: e.message })),
        );
      }
      // Dateien umwandeln (#577): Vorhandene Dateien der (neuen) Dateitypen gehen an das Paket.
      const neueDateitypen = (datensatz.laeufer?.umwandeln ?? []).filter(
        (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:umwandeln') && alt?.laeufer?.umwandeln?.includes(x)),
      );
      if (hatSchnittstelle(datensatz.laeufer, 'dms:umwandeln') && neueDateitypen.length) {
        void spaeter(() =>
          this.d.dokumentUmwandlung
            .umwandelPaketDa(neueDateitypen)
            .catch((e: Error) => log.warn('Vorhandene Dateien nicht zum Umwandeln gemeldet', { paket: m.id, fehler: e.message })),
        );
      }
      // Volltext aus Paketen (#614): Vorhandene Dateien der (neuen) Dateitypen ohne Text gehen an das Paket.
      const neueVolltextTypen = (datensatz.laeufer?.volltext ?? []).filter(
        (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:volltext') && alt?.laeufer?.volltext?.includes(x)),
      );
      if (hatSchnittstelle(datensatz.laeufer, 'dms:volltext') && neueVolltextTypen.length) {
        void spaeter(() =>
          this.d.volltextAusPaketen
            .volltextPaketDa(neueVolltextTypen)
            .catch((e: Error) =>
              log.warn('Vorhandene Dateien nicht zum Volltext an das Paket gegeben', { paket: m.id, fehler: e.message }),
            ),
        );
      }
      // Archivfassung (#631): Bestand der (neuen) Dateitypen mit fertigem Volltext geht an das Paket.
      const neueArchivTypen = (datensatz.laeufer?.archivfassung?.typen ?? []).filter(
        (x) => !(hatSchnittstelle(alt?.laeufer, 'dms:archivfassung') && alt?.laeufer?.archivfassung?.typen.includes(x)),
      );
      if (hatSchnittstelle(datensatz.laeufer, 'dms:archivfassung') && neueArchivTypen.length) {
        void spaeter(() =>
          this.d.dokumentArchiv
            .archivPaketDa(neueArchivTypen)
            .catch((e: Error) => log.warn('Vorhandene Dokumente nicht zur Archivfassung gemeldet', { paket: m.id, fehler: e.message })),
        );
      }
      return datensatz;
    } catch (f) {
      // Mit Umbau nimmt die Transaktion alles in der Datenbank zurück; außerhalb liegen nur die Einstellungen.
      if (!lage.schritte.length) await zurueck();
      if (umbauErg)
        await nimmEinstellungenZurueck(this.d, umbauErg.einstellungenVorher).catch((e) =>
          log.error('Umbau: Einstellungen nicht zurückgenommen', { paket: m.id, fehler: (e as Error).message }),
        );
      if (codeGeschrieben)
        await (alterCode.length ? this.d.kern.repo.speicherePaketCode(m.id, alterCode) : this.d.kern.repo.loeschePaketCode(m.id)).catch(
          (e) => log.error('Paket: alten Code nicht wiederhergestellt', { paket: m.id, fehler: (e as Error).message }),
        );
      if (spracheGeschrieben)
        await (alteSprache ? this.d.kern.repo.speichereSprachpaket(m.id, alteSprache) : this.d.kern.repo.loescheSprachpaket(m.id)).catch(
          (e) => log.error('Sprachpaket: alte Texte nicht wiederhergestellt', { paket: m.id, fehler: (e as Error).message }),
        );
      if (einstellungenGeschrieben) await setzePaketEinstellungen(this.d.kern, m.id, alteEinstellungen).catch(() => {});
      if (wortlistenGeschrieben) await this.d.suche.setzePaketSynonyme(m.id, alteWortlisten).catch(() => {});
      throw f;
    }
  }
}
