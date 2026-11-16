/**
 * Schritte beim Anlegen bzw. Ergänzen eines Pakets (#1278, Schritt 6a; vorher Teil von `legeIntern`): neue Typen,
 * Update vorhandener Typen, Ansichten, Vorgaben und Umbau. Die Reihenfolge bestimmt `legeIntern` in `anlegen.ts`.
 */
import { type Feld, type Register } from '../../../../shared/src/model';
import { type Anzeigeregel } from '../../../../shared/src/anzeige';
import { typKennung } from '../../../../shared/src/kennungen';
import { kinderVon, type Sicht } from '../../../../shared/src/sichten';
import { Fachfehler } from '../../grundlagen/fehler';
import { protokoll } from '../../protokoll/protokoll';
import { t } from '../../sprache/sprache';
import { KB, VORLAGE_MAX } from '../../grundlagen/grenzen';
import { legeVorgaben, passwortFelder } from '../index';
import { fuehreUmbauAus, uebernahmeDaten } from '../index';
import { fremderTyp, type PaketSicht, type PaketTyp } from './format';
import { meldungen, nachEltern, sichtAusPaket } from './hilfen';
import { log } from './optionen';
import { type SichtPlan, type TypPlan } from './plan';
import {
  abschnitteNeu,
  berechnetAenderung,
  beschriftungenNeu,
  erkennungNeu,
  formatNeu,
  neueFelderAuf,
  typAngabenNeu,
  vorbelegenNeu,
  wiederfindenNeu,
} from './update-neu';
import { anzeige, type AnlegeLauf, typEingabe, vorgabeId, ziel, zieltypenIn } from './anlegen-lauf';
import { PaketErgaenzen } from './ergaenzen';

/** Bringt das Update für einen vorhandenen Typ nichts mit (keine neuen Felder, Register, Angaben …)? */
const nichtsNeu = (p: TypPlan, berechnetNeu: Map<string, string | null>) =>
  !p.neueFelder.length &&
  !p.neueRegister.length &&
  !p.erkennung?.length &&
  !p.wiederfinden?.length &&
  !p.vorbelegen?.length &&
  !p.typAngaben &&
  !p.formate?.length &&
  !p.beschriftungen &&
  !p.abschnitte?.length &&
  !berechnetNeu.size;

/** Ersetzt das Update eine vorhandene Ansicht (#1125): aktualisiert, oder geändert bzw. unbekannt und so gewünscht. */
const ersetzt = (sp: SichtPlan, gewuenscht: Set<string>, schluessel: string) =>
  sp.zustand === 'aktualisiert' || ((sp.zustand === 'geaendert' || sp.zustand === 'unbekannt') && gewuenscht.has(schluessel));

/** Schritte beim Anlegen bzw. ergänzen. */
export abstract class PaketAnlegenSchritte extends PaketErgaenzen {
  /**
   * Umbau (#1041): Alles läuft in einer Transaktion (legeMitUmbau). Was andere Verbindungen lesen (Läufer, Sprachen,
   * Arbeit im Hintergrund), erst nach dem Speichern anstoßen – sonst sähen sie den alten Stand.
   */
  protected spaeter(f: () => Promise<unknown>): Promise<unknown> {
    return this.d.kern.inEigenerTransaktion()
      ? (this.d.kern.danach(() => {
          void f();
        }),
        Promise.resolve())
      : f();
  }

  /** Stand der Typen beim Anlegen (#1122) auffrischen. */
  private async auffrischen(l: AnlegeLauf) {
    for (const x of await this.d.mappentypen.listeTypen()) l.stand.set(x.id, x);
  }

  /** 1. Neue Typen: Ziele zuerst; Verweise auf noch fehlende Typen dieses Pakets im zweiten Durchgang. */
  protected async legeNeueTypen(l: AnlegeLauf) {
    const { m, ids, angelegt, typMap, vorher, geaendert, kennungZurueck, lage } = l;
    const uebernimmt = (s: string) => lage.schritte.find((g) => g.plan.art === 'uebernehmen' && g.eigenerZiel === s);
    const rest = [...l.neueTypen];
    const nachtragen: PaketTyp[] = [];
    while (rest.length) {
      const i = rest.findIndex((t) => !typEingabe(l, t, true).unvollstaendig);
      const paketTyp = rest.splice(i < 0 ? 0 : i, 1)[0];
      const x = typEingabe(l, paketTyp, true);
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
      await this.auffrischen(l);
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
    await this.ergaenzeOptionaleZiele(l.a.paket, typMap, geaendert);
    await this.auffrischen(l);
    // Tabellen (#1030) zuletzt: Ihre Quelle braucht das Verweisfeld des anderen Typs, das vielleicht erst hier dazukommt.
    nachtragen.sort((a, b) => Number(a.felder.some((f) => f.typ === 'tabelle')) - Number(b.felder.some((f) => f.typ === 'tabelle')));
    for (const paketTyp of nachtragen) {
      const ueber = uebernimmt(paketTyp.schluessel);
      try {
        await this.d.mappentypen.aendereTyp(
          ids.get(paketTyp.schluessel)!,
          ueber ? uebernahmeDaten(ueber, typEingabe(l, paketTyp, false).daten) : typEingabe(l, paketTyp, false).daten,
          m.id,
        );
      } catch (f) {
        throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: paketTyp.name, meldungen: meldungen(f) }));
      }
    }
  }

  /** 2. Update: vorhandene Typen um neue Felder und Register ergänzen – sonst nichts ändern. */
  protected async ergaenzeTypen(l: AnlegeLauf) {
    for (const paketTyp of l.a.paket.typen) await this.ergaenzeTyp(l, paketTyp);
  }

  private async ergaenzeTyp(l: AnlegeLauf, paketTyp: PaketTyp) {
    const { m, ids, vorher, geaendert, abschnittRegister } = l;
    const p = l.a.plan.typen.find((x) => x.schluessel === paketTyp.schluessel)!;
    // Berechnete Felder (#1034): Das Update gilt auch für vorhandene Felder – neu berechnet oder nicht mehr.
    const vorab = p.vorhanden ? vorher.get(ids.get(paketTyp.schluessel)!) : undefined;
    const berechnetNeu = vorab ? berechnetAenderung(paketTyp, vorab, m.id) : new Map<string, string | null>();
    if (!p.vorhanden || nichtsNeu(p, berechnetNeu)) return;
    const aktuell = vorher.get(ids.get(paketTyp.schluessel)!)!;
    const neu = typEingabe(l, paketTyp, false).daten;
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
              .map((a) => (a.anzeigen ? { ...a, anzeigen: anzeige(l, a.anzeigen, paketTyp.felder) as Anzeigeregel } : a)),
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

  /** Übernahme (#883): Der frühere Ablageort gehört jetzt dem Paket und heißt wie dessen Typ (#1084: basis:ablageort). */
  protected async uebergibAblageort(l: AnlegeLauf) {
    const { m, ueb, vorher, kennungZurueck } = l;
    for (const [s, id] of Object.entries(ueb?.typen ?? {})) {
      const vorKennung = vorher.get(id)?.schluessel;
      if (vorKennung === typKennung(m.id, s)) continue;
      await this.d.kern.repo.setzeTypKennung(id, typKennung(m.id, s));
      if (vorKennung) kennungZurueck.set(id, vorKennung);
    }
  }

  /**
   * 3. Neue Sichten, Elternsichten zuerst, am Ende ihrer Ebene. Vorhandene (#1125): unverändert (Prüfwert) bzw. auf
   * Wunsch → durch die neue Fassung ersetzt; was der Administrator geändert hat, bleibt sonst.
   */
  protected async legeSichten(l: AnlegeLauf) {
    const { m, ersetzteSichten } = l;
    for (const s of nachEltern(l.a.paket.sichten)) await this.legeSicht(l, s);
    if (ersetzteSichten.length)
      log.info('Paket: Ansichten durch die neue Fassung ersetzt', {
        paket: m.id,
        version: m.version,
        ansichten: ersetzteSichten.map((x) => x.name),
      });
  }

  private async legeSicht(l: AnlegeLauf, s: PaketSicht) {
    const { sichtMap, ersetzenGewuenscht, installierte } = l;
    const sp = l.a.plan.sichten.find((x) => x.schluessel === s.schluessel)!;
    if (sp.ausgelassen) return;
    const ersetzen = ersetzt(sp, ersetzenGewuenscht, s.schluessel);
    if (sp.vorhanden && !ersetzen) return;
    const alle = await this.d.sichtenVerwaltung.listeSichten();
    const vorhanden = sp.vorhanden ? alle.find((x) => x.id === sichtMap[s.schluessel]) : undefined;
    if (sp.vorhanden && !vorhanden) return;
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
      typId: (vw) => ziel(l, vw, false),
      fremd: (s.fremdeTypen ?? []).map((f) => fremderTyp(f.kennung, jetzt, installierte)?.id).filter((x): x is string => !!x),
      zieltypenIn: (b) => zieltypenIn(l, b),
    });
    if (!daten.typen.length && (s.fremdeTypen ?? []).length) return;
    try {
      await this.schreibeSicht(l, s, sp, { alle, vorhanden, elternId, position, daten });
    } catch (f) {
      throw new Fachfehler(422, t('meldungen.pakete.ansicht', { name: sp.name, meldungen: meldungen(f) }));
    }
  }

  /** Ansicht ersetzen bzw. neu anlegen; merkt sich, was zum Zurückrollen und für den Stand nötig ist. */
  private async schreibeSicht(
    l: AnlegeLauf,
    s: PaketSicht,
    sp: SichtPlan,
    x: { alle: Sicht[]; vorhanden: Sicht | undefined; elternId: string | null; position: number; daten: ReturnType<typeof sichtAusPaket> },
  ) {
    const { sichtMap, ersetzteSichten, neueSichten, sichtGeschrieben } = l;
    const { alle, vorhanden, elternId, position, daten } = x;
    if (vorhanden) {
      // Name des Pakets, außer er gibt es unter derselben Elternsicht schon; Rechte an der Ansicht (#148) bleiben.
      const name = kinderVon(alle, elternId).some(
        (y) => y.id !== vorhanden.id && y.name.trim().toLowerCase() === s.name.trim().toLowerCase(),
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
  }

  /**
   * 3b. Vorgaben (#1038): immer (keine Wahl wie bei Beispielen), ohne Ereignisse; Ersteller ist das Dienstkonto des
   * Pakets. Updates ergänzen; was der Administrator geändert oder gelöscht hat, bleibt so.
   */
  protected async legeVorgabenAn(l: AnlegeLauf) {
    const { m, a, vorgabenJetzt, vorgabenErg } = l;
    const { paket, alt, von } = a;
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
          typId: (vw) => ziel(l, vw, false),
          vorgabeId: async (vw) => vorgabeId(l, vw) ?? (await this.vorgabeMappe(vw, m.id))?.id ?? null,
          geheim: passwortFelder([...(await this.d.mappentypen.listeTypen()), ...paket.typen]),
          maxText: `${VORLAGE_MAX / KB} KB`,
        },
        vorgabenErg,
      );
      if (vorgabenErg.ausgelassen.length)
        log.info('Paket: Vorlagen für Vorgaben, die es nicht gibt, ausgelassen', { paket: m.id, ziele: vorgabenErg.ausgelassen });
    }
  }

  /**
   * 3c. Umbau (#1041): Werte umziehen, Typen zusammenlegen, Rechte mitnehmen, Verweise umleiten – nach Typen und
   * Vorgaben (die `setzen` nennen kann). Frühere eigene Typen, die dabei aufgehen, fallen aus dem Eintrag.
   */
  protected async bauUm(l: AnlegeLauf) {
    const { m, lage, typMap, ids, a } = l;
    const { paket, von } = a;
    if (lage.schritte.length) {
      l.umbauErg = await fuehreUmbauAus(this.d, {
        lage,
        paket: { id: m.id, name: m.name, version: m.version },
        von,
        typId: (s) => typMap[s] ?? ids.get(s),
        vorgabeId: async (vw) => vorgabeId(l, vw) ?? (await this.vorgabeMappe(vw, m.id))?.id ?? null,
      });
      const umbauErg = l.umbauErg;
      for (const s of umbauErg.eigeneWeg) if (!paket.typen.some((x) => x.schluessel === s)) delete typMap[s];
      // Automatisierungen liegen in einem eigenen Speicher: erst nach dem Speichern auf den Zieltyp umleiten.
      for (const u of umbauErg.umgeleitet)
        void this.spaeter(() =>
          Promise.resolve(this.d.typUmgebaut?.(u.alt, u.neu, u.felder)).catch((e: Error) =>
            log.error('Umbau: Automatisierungen nicht umgeleitet', { paket: m.id, typ: u.alt, fehler: e.message }),
          ),
        );
    }
  }
}
