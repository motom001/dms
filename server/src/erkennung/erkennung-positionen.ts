/** Erkennung (#1278 aus erkennung.ts): E-Rechnung, Positionen und Nummern im Text, Abgleich mit vorhandenen Mappen. */
import { ErkennungBasis } from './erkennung-basis';
import { type ERechnung, erechnungText, positionAusERechnung } from '../../../shared/src/erechnung';
import { istXmlDatei, liesERechnung } from './erechnung';
import { ERECHNUNG_XML_MAX } from '../grundlagen/grenzen';
import { log, type TypVorschlaege, MAX_MAPPEN, TEXT_MAX } from './erkennung-hilfen';
import { eingebetteteERechnung } from '../pdf';
import { t } from '../sprache/sprache';
import { Fachfehler } from '../grundlagen/fehler';
import { type Mappentyp, type Mappe, type Feld, type MappenBezug, zieleVon } from '../../../shared/src/model';
import type { Zugriff } from '../kern';
import { pruefeVorschlaege, type Vorschlaege, type Abgleich, type Vergleichsmappe, gleicheAb } from '../../../shared/src/erkennung';
import { stehtImText } from '../../../shared/src/klassifizierung';
import { jedeMappe } from '../../../shared/src/verweisziele';
import type { SchwaerzSeite } from '../../../shared/src/schwaerzen';
import { textformen, stelleVon } from '../../../shared/src/uebernehmen';

export abstract class ErkennungPositionen extends ErkennungBasis {
  /**
   * E-Rechnung aus einer Datei bzw. einem Dokument (#1043): XML direkt, PDF über den Anhang (PDF-Stelle, im Arbeiter).
   * `lies` holt den Inhalt erst, wenn die Art passt; zu große XML-Dateien werden nicht gelesen. Fehler beim Lesen sind
   * kein Fehler der Anfrage – dann gibt es eben keine E-Rechnung (protokolliert ohne Inhalt).
   */
  async erechnungAus(lies: () => Promise<Buffer>, name: string, mime: string, groesse?: number): Promise<ERechnung | null> {
    try {
      if (istXmlDatei(name, mime)) {
        if (groesse != null && groesse > ERECHNUNG_XML_MAX) return null;
        const inhalt = await lies();
        if (inhalt.length > ERECHNUNG_XML_MAX) return null;
        const r = liesERechnung(inhalt.toString('utf8'));
        if (r.fehler) log.info('E-Rechnung nicht gelesen', { grund: r.fehler });
        return r.er;
      }
      if (mime !== 'application/pdf') return null;
      const xml = await eingebetteteERechnung(await lies());
      if (!xml) return null;
      const r = liesERechnung(xml);
      if (r.fehler) log.info('E-Rechnung im PDF nicht gelesen', { grund: r.fehler });
      return r.er;
    } catch (x) {
      log.info('E-Rechnung nicht gelesen', { grund: (x as Error).message.slice(0, 200) });
      return null;
    }
  }

  /**
   * Datei für „Aus Dokument ausfüllen“ (#391, #1043): E-Rechnung lesen und den Text holen. Eine XML-E-Rechnung braucht
   * keine Texterkennung (ihr Text ist der lesbare Auszug); ein PDF mit E-Rechnung geht ohne Texterkennung auch.
   */
  async dateiLesen(inhalt: Buffer, name: string, mime: string): Promise<{ text: string; info: string; erechnung: ERechnung | null }> {
    const pdf = mime === 'application/pdf' || inhalt.subarray(0, 5).toString('latin1') === '%PDF-';
    const er = await this.erechnungAus(async () => inhalt, name, pdf ? 'application/pdf' : mime, inhalt.length);
    if (er && istXmlDatei(name, mime)) return { text: erechnungText(er), info: t('meldungen.erkennung.erechnung-gelesen'), erechnung: er };
    if (istXmlDatei(name, mime)) throw new Fachfehler(415, t('meldungen.erkennung.xml-keine-erechnung'));
    try {
      return { ...(await this.d.dokumente.textAusDatei(inhalt, name, mime)), erechnung: er };
    } catch (x) {
      if (er && x instanceof Fachfehler && x.status === 503)
        return { text: erechnungText(er), info: t('meldungen.erkennung.erechnung-gelesen'), erechnung: er };
      throw x;
    }
  }

  /**
   * Positionen der E-Rechnung (#1043) für die erste Tabelle des Typs (#1030), deren Zeilen Teile sind (#1031) – nur,
   * wenn die Person Mappen dieses Typs anlegen darf. Jede Zeile geht durch dieselbe Prüfung wie Eingaben.
   */
  protected async positionen(
    typ: Mappentyp,
    er: ERechnung,
    z: Zugriff | undefined,
    mappe: Mappe | undefined,
    ausdruecklich: boolean,
  ): Promise<TypVorschlaege['positionen']> {
    if (!er.positionen.length) return undefined;
    for (const f of typ.felder.filter((x) => x.typ === 'tabelle' && x.quelle?.typId && x.quelle.feldKey)) {
      const pt = z ? z.typen.get(f.quelle!.typId) : await this.repo().holeTyp(f.quelle!.typId);
      if (!pt || pt.system) continue;
      if (
        z &&
        !(
          await this.d.rechtepruefung.rechteAn(
            z,
            { id: '', typId: pt.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe,
            true,
          )
        ).C
      )
        continue;
      const erlaubt = (x: Feld) => x.key !== f.quelle!.feldKey && this.erlaubteFelder(pt)(x);
      const zeilen = er.positionen
        .map((p) => {
          const roh = Object.fromEntries(
            Object.entries(positionAusERechnung(pt, p, er, f.quelle!.feldKey)).map(([k, w]) => [k, { wert: w }]),
          );
          return Object.fromEntries(Object.entries(pruefeVorschlaege(pt, roh, erlaubt).vorschlaege).map(([k, v]) => [k, v.wert]));
        })
        .filter((w) => Object.keys(w).length > 0);
      if (!zeilen.length) continue;
      // Hat die Mappe schon Positionen, gibt es neue nur auf ausdrücklichen Wunsch (`positionen: true`) – sonst doppelt.
      const vorhanden = mappe ? await this.vorhandenePositionen(mappe.id, pt.id, f.quelle!.feldKey, z) : 0;
      const basis = {
        feld: f.key,
        typId: pt.id,
        feldKey: f.quelle!.feldKey,
        ...(er.weiterePositionen ? { weitere: er.weiterePositionen } : {}),
        ...(vorhanden ? { vorhanden } : {}),
      };
      return vorhanden && !ausdruecklich ? { ...basis, zeilen: [], zurueckgehalten: zeilen.length } : { ...basis, zeilen };
    }
    return undefined;
  }

  /** Lesbare Mappen des Teiltyps, die über `feldKey` schon zu dieser Mappe gehören. */
  private async vorhandenePositionen(mappeId: string, typId: string, feldKey: string, z?: Zugriff): Promise<number> {
    const ids = (await this.repo().rueckverweise(mappeId))
      .filter((r) => r.quelleTypId === typId && r.feldKey === feldKey)
      .map((r) => r.quelleId);
    return ids.length ? (await this.d.rechtepruefung.lesbare(z, [...new Set(ids)])).size : 0;
  }

  /**
   * Gehört dazu (#1043): vorhandene, lesbare Mappen anderer Typen, die im Dokument stehen und über ein leeres Verweisfeld
   * zu einer Mappe dieses Typs gehören könnten – der Lieferschein, dessen Nummer auf der Rechnung steht. Ohne die Mappe
   * selbst und ohne Mappen, die schon auf sie zeigen.
   */
  protected async dazu(text: string, typ: Mappentyp, mappe: Mappe | undefined, z?: Zugriff): Promise<NonNullable<TypVorschlaege['dazu']>> {
    const a = await this.abgleich(text, typ.id, z).catch(() => null);
    return (a?.dazu ?? [])
      .filter((x) => x.mappeId !== mappe?.id)
      .map((x) => ({
        mappeId: x.mappeId,
        typId: x.typId,
        titel: a!.bezuege[x.mappeId]?.titel ?? '',
        feldKey: x.feldKey,
        feld: x.feld,
        gruende: x.belege
          .filter((b) => b.stark && !b.ueber)
          .map((b) => `${b.feld} ${b.wert}`)
          .slice(0, 3),
      }));
  }

  /**
   * Umgekehrt (#1043): Ein Verweisfeld ohne Vorschlag bekommt die Mappe seines Zieltyps, in deren Dokumenten die Nummer
   * dieses Belegs steht – etwa die Rechnung, die die Lieferscheinnummer nennt, für „Gehört zu Rechnung“ am Lieferschein.
   * Die Nummer ist der Vorschlag für ein Feld mit „Zum Wiederfinden nutzen“ (mindestens 4 Zeichen, mit Ziffer). Nur bei
   * genau einer lesbaren Mappe; die Nummer muss wörtlich im Volltext stehen (nicht nur nach der Volltextsuche).
   */
  /** Steht `wert` wörtlich im Volltext eines der Dokumente der Mappe (höchstens 20)? */
  private async nennt(mappeId: string, wert: string): Promise<boolean> {
    const texte = await this.repo().volltexte((await this.repo().listeDokumente(mappeId)).map((d) => d.id).slice(0, 20));
    return [...texte.values()].some((x) => stehtImText(x, wert));
  }

  /** Die eine lesbare Mappe dieser Typen, deren Dokumente `wert` nennen (Volltextsuche, dann wörtlich geprüft); sonst null. */
  private async einzigeMitNummer(typen: string[], wert: string, z?: Zugriff): Promise<Mappe | null> {
    const gefunden: Mappe[] = [];
    for (const typId of typen) {
      const s = await this.repo()
        .seite({ typId, textfilter: { text: wert, dokumente: true, notizen: false }, von: 0, anzahl: 5 })
        .catch(() => null);
      for (const m of s?.mappen ?? []) if (await this.nennt(m.id, wert)) gefunden.push(m);
    }
    const lesbar = await this.d.rechtepruefung.lesbare(
      z,
      gefunden.map((m) => m.id),
    );
    const da = gefunden.filter((m) => lesbar.has(m.id));
    return da.length === 1 ? da[0] : null;
  }

  protected async nenntNummer(
    typ: Mappentyp,
    vorschlaege: Vorschlaege,
    bezuege: Record<string, MappenBezug>,
    erlaubt: (f: Feld) => boolean,
    z?: Zugriff,
  ) {
    const nummern = typ.felder
      .filter((f) => f.wiederfinden && (f.typ === 'text' || f.typ === 'zahl') && vorschlaege[f.key])
      .map((f) => ({ f, w: String(vorschlaege[f.key].wert).trim() }))
      .filter((x) => x.w.length >= 4 && /\d/.test(x.w));
    if (!nummern.length) return;
    // Nur „gehört zu“-Verweise (Lieferschein → Rechnung, Rechnung → Vertrag), nie „von“ oder „an“.
    for (const f of typ.felder.filter(
      (x) =>
        x.typ === 'referenz' &&
        x.verweisart === 'zugehoerigkeit' &&
        !vorschlaege[x.key] &&
        erlaubt(x) &&
        !jedeMappe(x) &&
        zieleVon(x).length,
    )) {
      for (const { f: nf, w } of nummern) {
        const m = await this.einzigeMitNummer(
          zieleVon(f).filter((x) => x !== typ.id && (!z || z.typen.has(x))),
          w,
          z,
        );
        if (!m) continue;
        vorschlaege[f.key] = {
          wert: f.mehrfach ? [m.id] : m.id,
          sicherheit: 'mittel',
          fundstelle: t('meldungen.erkennung.nennt-nummer', { titel: m.titel ?? '', feld: nf.label || nf.key, wert: w }),
        };
        bezuege[m.id] = { titel: m.titel ?? '', typId: m.typId };
        break;
      }
    }
  }

  /**
   * Fundstellen in der Textebene suchen (#939): je Vorschlag die erste Stelle, an der der Wert (in einer seiner
   * Schreibweisen) innerhalb der Fundstelle steht – sonst der Wert allein, sonst die kurze Fundstelle selbst
   * (`stelleVon`, wie die Seite „Dokument übernehmen“). Dokumente ohne Wörter mit Lage geben keine Stelle; Verweise
   * bekommen ihre Stellen über die Belege des Abgleichs. Setzt `stelle` an den Vorschlägen.
   */
  protected async stellen(typ: Mappentyp, vorschlaege: Vorschlaege, dokIds: string[]) {
    const seiten: Array<{ id: string; seiten: SchwaerzSeite[] }> = [];
    for (const id of dokIds) {
      try {
        const w = await this.d.dokumentArchiv.wortpositionen(id);
        const s = w.seiten.map((x) => ({ breite: x.breite ?? 1, hoehe: x.hoehe ?? 1, woerter: x.woerter }));
        if (s.some((x) => x.woerter.length)) seiten.push({ id, seiten: s });
      } catch {
        /* ohne Wortpositionen: Werte ohne Rahmen */
      }
    }
    if (!seiten.length) return;
    for (const [k, v] of Object.entries(vorschlaege)) {
      const f = typ.felder.find((x) => x.key === k);
      if (!f || f.typ === 'referenz') continue;
      const formen = textformen(f, v.wert);
      for (const d of seiten) {
        const b = stelleVon(d.seiten, formen, v.fundstelle);
        if (b?.length) {
          v.stelle = { dokument: d.id, bereiche: b };
          break;
        }
      }
    }
  }

  /**
   * Abgleich im Kern, ohne KI (#938): vorhandene Mappen, die sich im Text über ihre Felder mit „Zum Wiederfinden
   * nutzen“ wiederfinden – mit Belegen (Feld, Wert, Fundstelle). Mit `zielTyp` dazu Vorschläge für dessen Verweisfelder
   * und die Warnung, wenn es die Mappe schon gibt. Nur Mappen, die die Person lesen darf; nichts wird gespeichert.
   * Grundlage für „Dokument übernehmen“ (#934); die KI-Klassifizierung (#939) sieht die Ablage nie.
   */
  async abgleich(text: string, zielTyp?: string, z?: Zugriff): Promise<Abgleich & { bezuege: Record<string, MappenBezug> }> {
    const ziel = zielTyp ? (z ? z.typen.get(zielTyp) : await this.repo().holeTyp(zielTyp)) : undefined;
    if (zielTyp && !ziel) throw new Fachfehler(404, t('meldungen.erkennung.diesen-mappentyp-gibt-es'));
    const sichtbar = (await this.repo().listeTypen()).filter((x) => x.system !== 'post' && (!z || z.typen.has(x.id)));
    const typen = sichtbar.filter((x) => x.felder.some((f) => f.wiederfinden));
    const alle: Vergleichsmappe[] = [];
    for (const x of typen) {
      for (const m of await this.repo().listeMappen(x.id)) {
        alle.push({ id: m.id, typId: m.typId, werte: m.werte });
        if (alle.length >= MAX_MAPPEN) break;
      }
      if (alle.length >= MAX_MAPPEN) break;
    }
    const lesbar = await this.d.rechtepruefung.lesbare(
      z,
      alle.map((m) => m.id),
    );
    const mappen = alle.filter((m) => lesbar.has(m.id));
    const erg = gleicheAb(text.slice(0, TEXT_MAX), typen, mappen, ziel);
    // Eigene Organisation und Haushalt (#1043): nie als „von“ vorgeschlagen, nie „gehört dazu“; als Beleg für einen
    // Mappentyp zählen sie auch nicht (sie stehen auf fast jedem Dokument) – `eigene` nennt sie für die Klassifizierung.
    const eigen = await this.eigeneLage();
    if (erg.verweise.von) {
      erg.verweise.von = erg.verweise.von.filter((x) => !eigen.ids.has(x.mappeId));
      if (!erg.verweise.von.length) delete erg.verweise.von;
    }
    if (erg.dazu) erg.dazu = erg.dazu.filter((x) => !eigen.ids.has(x.mappeId));
    const eigene = erg.treffer.filter((x) => eigen.ids.has(x.mappeId)).map((x) => x.mappeId);
    if (eigene.length) erg.eigene = eigene;
    const bezuege = Object.fromEntries(await this.repo().bezuege(erg.treffer.map((x) => x.mappeId)));
    log.info('Abgleich mit vorhandenen Mappen', {
      zeichen: text.length,
      mappen: mappen.length,
      treffer: erg.treffer.length,
      doppelt: erg.doppelt.length,
      ...(ziel ? { typ: ziel.name } : {}),
    });
    return { ...erg, bezuege };
  }
}
