/**
 * Werkbank → Rundgänge (#941): eigene Rundgänge schreiben, alle sehen, ein- und ausschalten.
 *
 * Eigene Rundgänge sind YAML-Text im Format von `shared/entdecken/rundgaenge.yaml` (ein Rundgang je Datei, Texte direkt
 * darin). Sie stehen mit dem An/aus aller Rundgänge in der Einstellung `entdecken_werkbank` der Ablage – damit sind sie
 * in der Sicherung; der Vollexport schreibt sie nach struktur/entdecken.json. Gespeichert wird nur, was die Prüfung
 * besteht (dieselbe wie beim Installieren eines Pakets); gleichzeitiges Bearbeiten schützt der Stand (`geaendert`, #917).
 *
 * Eigene Rundgänge starten nie von selbst (`start` ist immer `manuell`), Texte sind reiner Text.
 */
import { LineCounter, parseDocument, stringify, isMap, isSeq, type Document, type Node } from 'yaml';
import { pruefeRundgaenge, SCHLUESSEL, type Anker, type Pfad, type Rundgang, type TypInfo } from '../../shared/src/entdecken';
import { ausSchluessel, EIGEN, type WerkbankRundgang, type ZeilenFehler } from '../../shared/src/entdecken-werkbank';
import { Fachfehler } from './fehler';
import { t } from './sprache';

/** Einstellung der Ablage mit allem, was die Werkbank zu Rundgängen (und Tipps, #942) speichert. */
export const WERKBANK_EINSTELLUNG = 'entdecken_werkbank';
/** So viele eigene Rundgänge höchstens – die Einstellung bleibt klein. */
export const EIGENE_RUNDGAENGE_MAX = 50;
/** So lang höchstens ist die Datei eines Rundgangs (Zeichen). */
export const RUNDGANG_DATEI_MAX = 20_000;

export interface EigenerRundgang { schluessel: string; yaml: string; geaendert: string; von: string | null }
export interface EntdeckenWerkbank {
  rundgaenge: EigenerRundgang[];
  /** Ausgeschaltet: `rundgang:<schluessel>` bzw. `tipp:<schluessel>` (volle Schlüssel, z. B. rundgang:vertraege:kennenlernen). */
  aus: string[];
}

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Gespeicherten Stand lesen; Unbekanntes fällt weg. */
export function werkbankAus(x: unknown): EntdeckenWerkbank {
  const o = istObjekt(x) ? x : {};
  const rundgaenge = (Array.isArray(o.rundgaenge) ? o.rundgaenge : []).filter(istObjekt)
    .filter((r) => typeof r.schluessel === 'string' && typeof r.yaml === 'string')
    .map((r) => ({ schluessel: String(r.schluessel), yaml: String(r.yaml), geaendert: String(r.geaendert ?? ''), von: typeof r.von === 'string' ? r.von : null }));
  return { ...o, rundgaenge, aus: (Array.isArray(o.aus) ? o.aus : []).filter((y): y is string => typeof y === 'string') };
}

/** Zeile (1-basiert) eines Ortes in der Datei: der tiefste Knoten, den es gibt. */
function zeileVon(doc: Document, lc: LineCounter, pfad: Pfad): number | null {
  for (let n = pfad.length; n >= 0; n--) {
    const knoten = (n === 0 ? doc.contents : doc.getIn(pfad.slice(0, n), true)) as Node | null | undefined;
    const von = knoten && 'range' in knoten ? knoten.range?.[0] : undefined;
    if (typeof von === 'number') return lc.linePos(von).line;
  }
  return null;
}

/**
 * Datei eines Rundgangs prüfen wie beim Installieren eines Pakets. Erlaubt ist ein Rundgang als Eintrag (oder eine
 * Liste mit genau einem). `typ`: Mappentyp nach Kennung (eigene Typen ohne Präfix, Typen aus Paketen paket:schluessel).
 */
export function pruefeRundgangDatei(yaml: string, o: { anker: readonly Anker[]; typ: (kennung: string) => TypInfo | null }): { fehler: ZeilenFehler[]; rundgang: Rundgang | null; roh: Record<string, unknown> | null } {
  if (yaml.length > RUNDGANG_DATEI_MAX) return { fehler: [{ zeile: null, text: t('werkbank.rundgaenge.fehler.lang', { max: RUNDGANG_DATEI_MAX }) }], rundgang: null, roh: null };
  const lc = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter: lc, prettyErrors: false });
  if (doc.errors.length) return { fehler: doc.errors.slice(0, 5).map((e) => ({ zeile: e.linePos?.[0]?.line ?? null, text: t('werkbank.rundgaenge.fehler.yaml', { grund: e.message.split('\n')[0] }) })), rundgang: null, roh: null };
  const liste = isSeq(doc.contents);
  if (!isMap(doc.contents) && !(liste && (doc.contents as { items: unknown[] }).items.length === 1)) return { fehler: [{ zeile: null, text: t('werkbank.rundgaenge.fehler.einer') }], rundgang: null, roh: null };
  const js = doc.toJS({ maxAliasCount: 0 }) as unknown;
  const roh = (liste ? (js as unknown[])[0] : js) as Record<string, unknown>;
  const r = pruefeRundgaenge([roh], { herkunft: EIGEN, anker: o.anker, typ: o.typ });
  const fehler = r.fehler.map((text, i) => ({ zeile: zeileVon(doc, lc, liste ? r.orte[i] : r.orte[i].slice(1)), text: text.replace(/^Rundgang (\d+|„[^“]*“)(, |: )/, '') }));
  return { fehler, rundgang: r.rundgaenge[0] ?? null, roh: istObjekt(roh) ? roh : null };
}

/** Rundgang (geprüft) zurück in das Dateiformat – zum Ansehen und als Vorlage für „Als eigenen kopieren“. */
export function rundgangAlsYaml(r: Rundgang): string {
  const lokal = (s: string) => s.slice(s.lastIndexOf(':') + 1);
  const oeffne = !r.oeffne ? undefined : 'seite' in r.oeffne ? r.oeffne : 'mappe' in r.oeffne ? { mappe: { typ: r.oeffne.mappe } } : { neu: { typ: r.oeffne.neu } };
  const roh = {
    schluessel: lokal(r.schluessel), titel: r.titel, beschreibung: r.beschreibung, start: r.start, fuer: r.fuer,
    ...(oeffne ? { oeffne } : {}), ...(r.ersatz ? { ersatz: r.ersatz } : {}), ...(r.ende ? { ende: r.ende } : {}),
    schritte: r.schritte.map((s) => ({
      schluessel: s.schluessel, ...(s.ziel.length ? { ziel: s.ziel.length === 1 ? s.ziel[0] : s.ziel } : {}), ...(s.bild ? { bild: s.bild } : {}), ...(s.fuer !== 'lesen' ? { fuer: s.fuer } : {}),
      titel: s.titel, text: s.text, ...(s.textHandy ? { text_handy: s.textHandy } : {}), ...(s.textVerwalten ? { text_verwalten: s.textVerwalten } : {}),
      ...(s.ort ? { ort: s.ort } : {}), ...(s.handbuch ? { handbuch: s.handbuch } : {}), ...(s.sonstVerwalten ? { sonst_verwalten: s.sonstVerwalten } : {}),
    })),
  };
  return stringify(roh, { lineWidth: 0 });
}

/** Eigene Rundgänge prüfen (für „Ablago entdecken“): Schlüssel `eigen:<schluessel>`; fehlerhafte fallen weg. */
export function eigeneRundgaenge(w: EntdeckenWerkbank, o: { anker: readonly Anker[]; typ: (kennung: string) => TypInfo | null }): { rundgaenge: Rundgang[]; fehler: Map<string, string[]> } {
  const fehler = new Map<string, string[]>();
  const rundgaenge: Rundgang[] = [];
  for (const e of w.rundgaenge) {
    const x = pruefeRundgangDatei(e.yaml, o);
    if (x.rundgang) rundgaenge.push({ ...x.rundgang, schluessel: `${EIGEN}:${x.rundgang.schluessel}` });
    else fehler.set(e.schluessel, x.fehler.map((f) => f.text));
  }
  return { rundgaenge, fehler };
}

/** Speicher der Werkbank: lesen und mit Vergleich schreiben (gleichzeitig zwei Verwaltende). */
export interface WerkbankSpeicher { lies(): Promise<unknown>; schreibe(wert: unknown): Promise<void>; tausche?(alt: unknown, neu: unknown): Promise<boolean> }

/**
 * Werkbank-Seite der Rundgänge. `pruefe` liefert die Prüfung mit den Mappentypen der Ablage, `alle` die Liste wie in
 * „Ablago entdecken“ (ohne An/aus), `alsYaml` die Datei eines Rundgangs.
 */
export class RundgaengeWerkbank {
  constructor(private readonly o: {
    speicher: WerkbankSpeicher;
    pruefung(): Promise<{ anker: readonly Anker[]; typ: (kennung: string) => TypInfo | null }>;
    jetzt?(): Date;
  }) {}

  async lies(): Promise<EntdeckenWerkbank> { return werkbankAus(await this.o.speicher.lies()); }

  /** Schreiben; gab es inzwischen einen anderen Stand, 409 (#917) – nichts wird überschrieben. */
  private async aendere(f: (w: EntdeckenWerkbank) => EntdeckenWerkbank): Promise<EntdeckenWerkbank> {
    for (let versuch = 0; versuch < 3; versuch++) {
      const roh = await this.o.speicher.lies();
      const neu = f(werkbankAus(roh));
      if (!this.o.speicher.tausche) { await this.o.speicher.schreibe(neu); return neu; }
      if (await this.o.speicher.tausche(roh ?? null, neu)) return neu;
    }
    throw new Fachfehler(409, t('werkbank.rundgaenge.fehler.konflikt'), { konflikt: true });
  }

  async pruefe(yaml: unknown) {
    if (typeof yaml !== 'string') throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.yaml', { grund: '–' }));
    return pruefeRundgangDatei(yaml, await this.o.pruefung());
  }

  /** Neu (`alt` = null) oder ändern; `stand` = `geaendert`, wie gelesen. Liefert den gespeicherten Eintrag. */
  async speichere(alt: string | null, e: unknown, von: string | null): Promise<EigenerRundgang> {
    const x = istObjekt(e) ? e : {};
    const p = await this.pruefe(x.yaml);
    if (p.fehler.length || !p.rundgang) throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.pruefung'), { fehler: p.fehler });
    const schluessel = p.rundgang.schluessel;
    if (!SCHLUESSEL.test(schluessel)) throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.pruefung'));
    const eintrag: EigenerRundgang = { schluessel, yaml: String(x.yaml), geaendert: (this.o.jetzt?.() ?? new Date()).toISOString(), von };
    await this.aendere((w) => {
      const vorher = alt ? w.rundgaenge.find((r) => r.schluessel === alt) : undefined;
      if (alt && !vorher) throw new Fachfehler(404, t('werkbank.rundgaenge.fehler.gibt-es-nicht'));
      if (vorher && typeof x.stand === 'string' && vorher.geaendert !== x.stand) throw new Fachfehler(409, t('werkbank.rundgaenge.fehler.konflikt'), { konflikt: true });
      if (w.rundgaenge.some((r) => r.schluessel === schluessel && r.schluessel !== alt)) throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.doppelt', { schluessel }));
      if (!vorher && w.rundgaenge.length >= EIGENE_RUNDGAENGE_MAX) throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.viele', { max: EIGENE_RUNDGAENGE_MAX }));
      // Umbenannt: An/aus geht mit.
      const aus = alt && alt !== schluessel ? w.aus.map((k) => (k === ausSchluessel('rundgang', `${EIGEN}:${alt}`) ? ausSchluessel('rundgang', `${EIGEN}:${schluessel}`) : k)) : w.aus;
      return { ...w, aus, rundgaenge: vorher ? w.rundgaenge.map((r) => (r === vorher ? eintrag : r)) : [...w.rundgaenge, eintrag] };
    });
    return eintrag;
  }

  async loesche(schluessel: string): Promise<void> {
    await this.aendere((w) => {
      if (!w.rundgaenge.some((r) => r.schluessel === schluessel)) throw new Fachfehler(404, t('werkbank.rundgaenge.fehler.gibt-es-nicht'));
      return { ...w, rundgaenge: w.rundgaenge.filter((r) => r.schluessel !== schluessel), aus: w.aus.filter((k) => k !== ausSchluessel('rundgang', `${EIGEN}:${schluessel}`)) };
    });
  }

  /** Rundgang (voller Schlüssel) bzw. Tipp ein- oder ausschalten – für alle Personen. */
  async schalte(art: 'rundgang' | 'tipp', schluessel: string, an: unknown): Promise<void> {
    if (typeof an !== 'boolean') throw new Fachfehler(422, t('werkbank.rundgaenge.fehler.an'));
    const k = ausSchluessel(art, schluessel);
    await this.aendere((w) => ({ ...w, aus: an ? w.aus.filter((x) => x !== k) : [...new Set([...w.aus, k])] }));
  }

  /** Liste für die Werkbank aus allen Rundgängen (wie „Ablago entdecken“, ungefiltert) und den eigenen Dateien. */
  async liste(alle: Rundgang[], paketName: (id: string) => string | undefined, fehler: Map<string, string[]>): Promise<WerkbankRundgang[]> {
    const w = await this.lies();
    const aus = new Set(w.aus);
    const eintrag = (r: Rundgang): WerkbankRundgang => {
      const eigen = r.herkunft === EIGEN ? w.rundgaenge.find((x) => `${EIGEN}:${x.schluessel}` === r.schluessel) : undefined;
      const paket = r.herkunft.startsWith('paket:') ? r.herkunft.slice(6) : null;
      return {
        schluessel: r.schluessel, herkunft: r.herkunft, ...(paket ? { paketName: paketName(paket) ?? paket } : {}), titel: r.titel, beschreibung: r.beschreibung,
        start: r.start, fuer: r.fuer, schritte: r.schritte.length, an: !aus.has(ausSchluessel('rundgang', r.schluessel)),
        yaml: eigen?.yaml ?? rundgangAlsYaml(r), ...(eigen ? { geaendert: eigen.geaendert, von: eigen.von } : {}),
      };
    };
    const liste = alle.map(eintrag);
    // Eigene, die gerade nicht gelten (z. B. Mappentyp gelöscht): trotzdem zeigen, zum Reparieren.
    for (const e of w.rundgaenge) {
      if (liste.some((x) => x.schluessel === `${EIGEN}:${e.schluessel}`)) continue;
      liste.push({ schluessel: `${EIGEN}:${e.schluessel}`, herkunft: EIGEN, titel: e.schluessel, beschreibung: '', start: 'manuell', fuer: 'lesen', schritte: 0,
        an: !aus.has(ausSchluessel('rundgang', `${EIGEN}:${e.schluessel}`)), yaml: e.yaml, geaendert: e.geaendert, von: e.von, fehler: fehler.get(e.schluessel) ?? [] });
    }
    return liste;
  }
}

/**
 * Eigenen Rundgang (bzw. Tipp, #942) für „Paket erstellen“ umschreiben: Mappentypen (`oeffne.mappe.typ`,
 * `oeffne.neu.typ`, `typ`) werden zum Schlüssel im Paket bzw. zu `paket:typ` einer Abhängigkeit. `kennung` liefert das
 * neue Ziel oder null, wenn der Typ weder ins Paket kommt noch aus einem Paket stammt – dann steht er in `fehlt`.
 */
export function insPaket(roh: Record<string, unknown>, kennung: (k: string) => string | null): { roh: Record<string, unknown>; fehlt: string[] } {
  const fehlt: string[] = [];
  const um = (k: unknown) => { if (typeof k !== 'string') return k; const n = kennung(k); if (n === null) fehlt.push(k); return n ?? k; };
  const x: Record<string, unknown> = structuredClone(roh);
  const o = x.oeffne;
  if (istObjekt(o)) for (const art of ['mappe', 'neu']) { const innen = o[art]; if (istObjekt(innen)) innen.typ = um(innen.typ); }
  if (x.typ !== undefined) x.typ = um(x.typ);
  return { roh: x, fehlt };
}
