/**
 * Einstellungen von Paketen (#197): Das Paket beschreibt sie im Manifest (code.einstellungen,
 * code.aktionen; Format: motom001/dms-registry), das DMS baut daraus ein Formular, prüft und speichert.
 * Höchstens zwei Ebenen: Abschnitte mit Feldern und Listen gleich aufgebauter Einträge.
 * Server und Oberfläche teilen diese Datei.
 */

export const EINSTELLUNG_TYPEN = {
  text: 'Text', mehrzeilig: 'Mehrzeiliger Text', zahl: 'Zahl', janein: 'Ja/Nein', datum: 'Datum',
  auswahl: 'Auswahl', mehrfachauswahl: 'Mehrfachauswahl', geheim: 'Geheimnis',
  mappentyp: 'Mappentyp', feld: 'Feld eines Mappentyps', benutzer: 'Benutzer', rolle: 'Rolle', sicht: 'Ansicht',
} as const;
export type EinstellungTyp = keyof typeof EINSTELLUNG_TYPEN;
const VERWEISE: EinstellungTyp[] = ['mappentyp', 'feld', 'benutzer', 'rolle', 'sicht'];

export interface EinstellungFeld {
  schluessel: string; name: string; typ: EinstellungTyp;
  hilfe?: string; pflicht?: boolean; standard?: unknown; optionen?: string[]; min?: number; max?: number;
  /** Beim Typ feld: Mappentyp (lokal oder <paket>:<schluessel>), aus dem ein Feld gewählt wird. */
  mappentyp?: string;
}
export type EinstellungBlock =
  | { art: 'abschnitt'; titel: string; hilfe?: string; felder: EinstellungFeld[] }
  | { art: 'liste'; schluessel: string; name: string; eintrag: string; hilfe?: string; sortierbar: boolean; felder: EinstellungFeld[] };
export interface PaketAktion { schluessel: string; name: string; hilfe?: string; bestaetigen?: boolean }
export interface Einstellungsbeschreibung { bloecke: EinstellungBlock[]; aktionen: PaketAktion[] }

/** Gespeicherter Wert eines Felds vom Typ feld: Mappentyp-Id und Feldschlüssel. */
export interface FeldVerweis { typ: string; feld: string }
/** Geheimnis in der Oberfläche: nie der Wert, nur ob einer gesetzt ist. */
export interface GeheimStand { gesetzt: boolean }
/** Eingabe für ein Geheimnis: neuer Wert (Text), behalten oder löschen (null). */
export type GeheimEingabe = string | { behalten: true } | null;
/** Einträge einer Liste tragen eine feste Id, damit Geheimnisse beim Sortieren beim richtigen Eintrag bleiben. */
export const EINTRAG_ID = '_id';

const SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Liest die Beschreibung aus code.einstellungen und code.aktionen; null = das Paket hat keine. */
export function liesBeschreibung(code: unknown): { beschreibung: Einstellungsbeschreibung | null; fehler: string[] } {
  const fehler: string[] = [];
  if (!istObjekt(code) || (!Array.isArray(code.einstellungen) && !Array.isArray(code.aktionen))) return { beschreibung: null, fehler };
  const feld = (f: unknown, wo: string): EinstellungFeld | null => {
    if (!istObjekt(f)) { fehler.push(`${wo}: Feld ungültig.`); return null; }
    const typ = str(f.typ) as EinstellungTyp;
    if (!SCHLUESSEL.test(str(f.schluessel))) fehler.push(`${wo}: ungültiger Schlüssel „${str(f.schluessel)}“.`);
    if (!(typ in EINSTELLUNG_TYPEN)) { fehler.push(`${wo}/${str(f.schluessel)}: unbekannter Typ „${typ}“.`); return null; }
    if ((typ === 'auswahl' || typ === 'mehrfachauswahl') && !(Array.isArray(f.optionen) && f.optionen.length)) fehler.push(`${wo}/${str(f.schluessel)}: ${typ} braucht optionen.`);
    if (typ === 'geheim' && f.standard !== undefined) fehler.push(`${wo}/${str(f.schluessel)}: geheim hat keine Vorgabe.`);
    return {
      schluessel: str(f.schluessel), name: str(f.name) || str(f.schluessel), typ,
      ...(f.hilfe ? { hilfe: str(f.hilfe) } : {}), ...(f.pflicht === true ? { pflicht: true } : {}),
      ...(f.standard !== undefined && typ !== 'geheim' && !VERWEISE.includes(typ) ? { standard: f.standard } : {}),
      ...(Array.isArray(f.optionen) ? { optionen: f.optionen.map(str) } : {}),
      ...(typeof f.min === 'number' ? { min: f.min } : {}), ...(typeof f.max === 'number' ? { max: f.max } : {}),
      ...(typ === 'feld' && f.mappentyp ? { mappentyp: str(f.mappentyp) } : {}),
    };
  };
  const bloecke: EinstellungBlock[] = [];
  const oben = new Set<string>();
  const einmal = (s: string, menge: Set<string>, wo: string) => { if (menge.has(s)) fehler.push(`${wo}: Schlüssel „${s}“ doppelt.`); menge.add(s); };
  for (const [i, b] of (Array.isArray(code.einstellungen) ? code.einstellungen : []).entries()) {
    if (!istObjekt(b)) continue;
    const felder = (Array.isArray(b.felder) ? b.felder : []).map((f, j) => feld(f, `einstellungen[${i + 1}].felder[${j + 1}]`)).filter((f): f is EinstellungFeld => !!f);
    if (b.liste !== undefined) {
      if (!SCHLUESSEL.test(str(b.liste))) fehler.push(`einstellungen[${i + 1}]: ungültiger Schlüssel der Liste.`);
      einmal(str(b.liste), oben, 'einstellungen');
      const innen = new Set<string>();
      for (const f of felder) einmal(f.schluessel, innen, `Liste ${str(b.liste)}`);
      bloecke.push({ art: 'liste', schluessel: str(b.liste), name: str(b.name) || str(b.liste), eintrag: str(b.eintrag) || 'Eintrag', ...(b.hilfe ? { hilfe: str(b.hilfe) } : {}), sortierbar: b.sortierbar === true, felder });
    } else {
      for (const f of felder) einmal(f.schluessel, oben, 'einstellungen');
      bloecke.push({ art: 'abschnitt', titel: str(b.abschnitt), ...(b.hilfe ? { hilfe: str(b.hilfe) } : {}), felder });
    }
  }
  const aktionen: PaketAktion[] = [];
  const ak = new Set<string>();
  for (const a of Array.isArray(code.aktionen) ? code.aktionen : []) {
    if (!istObjekt(a) || !SCHLUESSEL.test(str(a.schluessel))) { fehler.push('aktionen: ungültige Aktion.'); continue; }
    einmal(str(a.schluessel), ak, 'aktionen');
    aktionen.push({ schluessel: str(a.schluessel), name: str(a.name) || str(a.schluessel), ...(a.hilfe ? { hilfe: str(a.hilfe) } : {}), ...(a.bestaetigen === true ? { bestaetigen: true } : {}) });
  }
  return { beschreibung: { bloecke, aktionen }, fehler };
}

/** Alle Felder der obersten Ebene (Abschnitte) und die Listen. */
export const abschnittsfelder = (b: Einstellungsbeschreibung) => b.bloecke.flatMap((x) => (x.art === 'abschnitt' ? x.felder : []));
export const listen = (b: Einstellungsbeschreibung) => b.bloecke.filter((x): x is Extract<EinstellungBlock, { art: 'liste' }> => x.art === 'liste');

/** Vorgaben: Felder mit standard; Listen leer. */
export function vorgaben(b: Einstellungsbeschreibung): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  for (const f of abschnittsfelder(b)) if (f.standard !== undefined) w[f.schluessel] = f.standard;
  for (const l of listen(b)) w[l.schluessel] = [];
  return w;
}

/**
 * Nach einem Update: neue Felder bekommen ihre Vorgabe, vorhandene Werte bleiben, wegfallende
 * Felder (auch in Listeneinträgen) werden entfernt.
 */
export function ueberfuehre(b: Einstellungsbeschreibung, alt: Record<string, unknown>): { werte: Record<string, unknown>; weg: string[] } {
  const werte = vorgaben(b);
  const weg: string[] = [];
  const oben = new Set([...abschnittsfelder(b).map((f) => f.schluessel), ...listen(b).map((l) => l.schluessel)]);
  for (const [k, v] of Object.entries(alt)) {
    if (!oben.has(k)) { weg.push(k); continue; }
    const l = listen(b).find((x) => x.schluessel === k);
    if (!l) { werte[k] = v; continue; }
    const keys = new Set([EINTRAG_ID, ...l.felder.map((f) => f.schluessel)]);
    werte[k] = (Array.isArray(v) ? v : []).filter(istObjekt).map((e) => {
      const n: Record<string, unknown> = {};
      for (const [ek, ev] of Object.entries(e)) { if (keys.has(ek)) n[ek] = ev; else if (!weg.includes(`${k}.${ek}`)) weg.push(`${k}.${ek}`); }
      for (const f of l.felder) if (!(f.schluessel in n) && f.standard !== undefined) n[f.schluessel] = f.standard;
      return n;
    });
  }
  return { werte, weg };
}

/** Welche Felder in einer neuen Beschreibung gegenüber einer alten dazukommen bzw. wegfallen (für die Vorschau). */
export function einstellungsAenderung(alt: Einstellungsbeschreibung | null, neu: Einstellungsbeschreibung | null): { neu: string[]; weg: string[] } {
  const namen = (b: Einstellungsbeschreibung | null) => new Map(b ? [
    ...abschnittsfelder(b).map((f) => [f.schluessel, f.name] as const),
    ...listen(b).flatMap((l) => [[l.schluessel, l.name] as const, ...l.felder.map((f) => [`${l.schluessel}.${f.schluessel}`, `${l.name} › ${f.name}`] as const)]),
  ] : []);
  const a = namen(alt), n = namen(neu);
  return { neu: [...n].filter(([k]) => !a.has(k)).map(([, v]) => v), weg: [...a].filter(([k]) => !n.has(k)).map(([, v]) => v) };
}

const leer = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Pflichtfelder ohne Wert (lesbar); Geheimnisse zählen als gesetzt, wenn ein verschlüsselter Wert da ist. */
export function fehlendePflicht(b: Einstellungsbeschreibung, werte: Record<string, unknown>): string[] {
  const erg: string[] = [];
  for (const f of abschnittsfelder(b)) if (f.pflicht && leer(werte[f.schluessel])) erg.push(f.name);
  for (const l of listen(b)) {
    for (const [i, e] of (Array.isArray(werte[l.schluessel]) ? werte[l.schluessel] as Record<string, unknown>[] : []).entries()) {
      for (const f of l.felder) if (f.pflicht && leer(e?.[f.schluessel])) erg.push(`${l.eintrag} ${i + 1} › ${f.name}`);
    }
  }
  return erg;
}

/** Was es im DMS gibt – zum Prüfen der Verweise. */
export interface Verweisquelle {
  typen: Array<{ id: string; felder: Array<{ key: string }> }>;
  benutzer: string[]; rollen: string[]; sichten: string[];
  /** Mappentyp-Verweis aus dem Manifest (lokal oder <paket>:<schluessel>) → Id; null = unbekannt. */
  typVon(verweis: string): string | null;
}

/**
 * Prüft die Eingabe gegen die Beschreibung: Typ, Pflicht, Auswahlwerte, Grenzen, ob Verweise existieren.
 * Geheimnisse bleiben, wie sie kommen (Text, {behalten}, null) – verschlüsselt wird auf dem Server.
 * Fehler je Feld: „schluessel“ bzw. „liste.<nr>.schluessel“ (nr ab 1).
 */
export function pruefeWerte(b: Einstellungsbeschreibung, eingabe: unknown, q: Verweisquelle): { werte: Record<string, unknown>; fehler: Record<string, string> } {
  const e = istObjekt(eingabe) ? eingabe : {};
  const fehler: Record<string, string> = {};
  const werte: Record<string, unknown> = {};
  const eins = (f: EinstellungFeld, v: unknown, pfad: string): unknown => {
    if (f.typ === 'geheim') {
      if (v === null || v === undefined || v === '') return null;
      if (istObjekt(v) && v.behalten === true) return { behalten: true };
      if (typeof v !== 'string') { fehler[pfad] = 'Ungültiger Wert.'; return null; }
      return v;
    }
    if (leer(v)) { if (f.pflicht) fehler[pfad] = 'Pflichtfeld.'; return f.typ === 'mehrfachauswahl' ? [] : null; }
    switch (f.typ) {
      case 'text': case 'mehrzeilig': {
        if (typeof v !== 'string') { fehler[pfad] = 'Text erwartet.'; return null; }
        if (v.length > (f.typ === 'text' ? 500 : 10000)) { fehler[pfad] = 'Zu lang.'; return null; }
        return f.typ === 'text' ? v.trim() : v;
      }
      case 'zahl': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n)) { fehler[pfad] = 'Keine Zahl.'; return null; }
        if (f.min !== undefined && n < f.min) { fehler[pfad] = `Mindestens ${f.min}.`; return null; }
        if (f.max !== undefined && n > f.max) { fehler[pfad] = `Höchstens ${f.max}.`; return null; }
        return n;
      }
      case 'janein': return v === true || v === 'true';
      case 'datum': if (typeof v !== 'string' || !DATUM.test(v) || Number.isNaN(Date.parse(v))) { fehler[pfad] = 'Kein Datum.'; return null; } return v;
      case 'auswahl': if (!f.optionen?.includes(String(v))) { fehler[pfad] = `„${String(v)}“ steht nicht zur Auswahl.`; return null; } return String(v);
      case 'mehrfachauswahl': {
        const l = (Array.isArray(v) ? v : [v]).map(String);
        const falsch = l.filter((x) => !f.optionen?.includes(x));
        if (falsch.length) { fehler[pfad] = `„${falsch[0]}“ steht nicht zur Auswahl.`; return null; }
        return [...new Set(l)];
      }
      case 'mappentyp': if (!q.typen.some((t) => t.id === v)) { fehler[pfad] = 'Diesen Mappentyp gibt es nicht.'; return null; } return v;
      case 'benutzer': if (!q.benutzer.includes(String(v))) { fehler[pfad] = 'Diesen Benutzer gibt es nicht.'; return null; } return v;
      case 'rolle': if (!q.rollen.includes(String(v))) { fehler[pfad] = 'Diese Rolle gibt es nicht.'; return null; } return v;
      case 'sicht': if (!q.sichten.includes(String(v))) { fehler[pfad] = 'Diese Ansicht gibt es nicht.'; return null; } return v;
      case 'feld': {
        const x = v as Partial<FeldVerweis>;
        const soll = f.mappentyp ? q.typVon(f.mappentyp) : null;
        const typ = q.typen.find((t) => t.id === x?.typ);
        if (!typ || !typ.felder.some((g) => g.key === x?.feld) || (f.mappentyp && typ.id !== soll)) { fehler[pfad] = 'Dieses Feld gibt es nicht.'; return null; }
        return { typ: typ.id, feld: String(x.feld) };
      }
    }
    return null;
  };
  for (const f of abschnittsfelder(b)) werte[f.schluessel] = eins(f, e[f.schluessel], f.schluessel);
  for (const l of listen(b)) {
    const roh = Array.isArray(e[l.schluessel]) ? (e[l.schluessel] as unknown[]).filter(istObjekt).slice(0, 500) : [];
    werte[l.schluessel] = roh.map((x, i) => {
      const n: Record<string, unknown> = { [EINTRAG_ID]: typeof x[EINTRAG_ID] === 'string' && x[EINTRAG_ID] ? String(x[EINTRAG_ID]).slice(0, 64) : `e${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}` };
      for (const f of l.felder) n[f.schluessel] = eins(f, x[f.schluessel], `${l.schluessel}.${i + 1}.${f.schluessel}`);
      return n;
    });
  }
  return { werte, fehler };
}
