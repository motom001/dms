/**
 * Demo-Daten (#248, #365): Mischung, Grenzen und Abschätzung als reine Funktionen –
 * die Oberfläche rechnet damit live beim Schieben, der Server prüft und schätzt
 * mit denselben Werten.
 */
import type { Mappentyp } from './model';

export const DOKUMENTARTEN = ['brief', 'mehrseitig', 'scan', 'bild', 'gross'] as const;
export type Dokumentart = (typeof DOKUMENTARTEN)[number];
export type Mischung = Record<Dokumentart, number>;
export const STUFEN = ['leicht', 'realistisch', 'schwer'] as const;
export type Stufe = (typeof STUFEN)[number];

/** Anteile in Prozent je Stufe (Summe jeweils 100). */
export const MISCHUNGEN: Record<Stufe, Mischung> = {
  leicht: { brief: 70, mehrseitig: 25, scan: 5, bild: 0, gross: 0 },
  realistisch: { brief: 45, mehrseitig: 20, scan: 20, bild: 14, gross: 1 },
  schwer: { brief: 20, mehrseitig: 25, scan: 30, bild: 20, gross: 5 },
};

/** Erwartete Größe und Seiten für die Texterkennung je Datei – für die Abschätzung vor dem Start. */
export const ERWARTUNG: Record<Dokumentart, { bytes: number; ocrSeiten: number; seiten: number }> = {
  brief: { bytes: 3_000, ocrSeiten: 0, seiten: 1 },
  mehrseitig: { bytes: 80_000, ocrSeiten: 0, seiten: 30 },
  scan: { bytes: 600_000, ocrSeiten: 2.2, seiten: 2.2 },
  bild: { bytes: 1_500_000, ocrSeiten: 1, seiten: 1 },
  gross: { bytes: 60 * 1024 * 1024, ocrSeiten: 0, seiten: 1 },
};

/** Mappen je Lauf. */
export const MAX_DEMO = 50_000;
/** Dokumente je Mappe höchstens (Stresstest: viele Dokumente in einer Mappe). */
export const MAX_JE_MAPPE = 250;
/** Erwartete Dokumente je Lauf höchstens (Mappen × Anteil × Dokumente je Mappe). */
export const MAX_DEMO_DOKUMENTE = 250_000;
/** Ab hier warnt die Abschätzung: das dauert auf einem NAS Stunden. */
export const VIELE_DOKUMENTE = 20_000;
export const VIELE_BYTES = 20 * 1024 ** 3;
export const MAX_DUPLIKATE = 50;

/** Stufen des Reglers „Dokumente je Mappe“: nicht linear, damit kleine Werte gut einstellbar bleiben. */
export const JE_MAPPE_STUFEN = [1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250] as const;

/** Nächstgelegene Stufe (Index) zu einer Zahl. */
export function stufeVon(n: number): number {
  let best = 0;
  JE_MAPPE_STUFEN.forEach((s, i) => { if (Math.abs(s - n) < Math.abs(JE_MAPPE_STUFEN[best] - n)) best = i; });
  return best;
}

/** Ganzzahlen, die zusammen genau `summe` ergeben (größte Reste). */
function aufteilen(gewichte: number[], summe: number): number[] {
  const ges = gewichte.reduce((a, b) => a + b, 0);
  if (ges <= 0) return gewichte.map(() => 0);
  const roh = gewichte.map((g) => (summe * g) / ges);
  const teil = roh.map(Math.floor);
  let rest = summe - teil.reduce((a, b) => a + b, 0);
  for (const i of roh.map((_, i) => i).sort((i, j) => (roh[j] - teil[j]) - (roh[i] - teil[i]) || i - j)) { if (rest-- <= 0) break; teil[i]++; }
  return teil;
}

const ganz = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/** Beliebige Gewichte als Prozent mit Summe 100 (ohne Gewicht: gleich verteilt). */
export function normiereMischung(m: Partial<Mischung>): Mischung {
  const g = DOKUMENTARTEN.map((a) => Math.max(0, Number(m[a]) || 0));
  const p = aufteilen(g.some((x) => x > 0) ? g : g.map(() => 1), 100);
  return Object.fromEntries(DOKUMENTARTEN.map((a, i) => [a, p[i]])) as Mischung;
}

/**
 * Ein Regler der Mischung wird bewegt: Er bekommt `wert` (0–100), die anderen teilen
 * sich den Rest im bisherigen Verhältnis – die Summe bleibt immer 100.
 */
export function stelleMischung(m: Mischung, art: Dokumentart, wert: number): Mischung {
  const w = ganz(wert, 0, 100);
  const andere = DOKUMENTARTEN.filter((a) => a !== art);
  const g = andere.map((a) => Math.max(0, m[a] || 0));
  const p = aufteilen(g.some((x) => x > 0) ? g : g.map(() => 1), 100 - w);
  return { ...Object.fromEntries(andere.map((a, i) => [a, p[i]])), [art]: w } as Mischung;
}

/** „von“ oder „bis“ wird bewegt; der andere Wert gibt nach, sodass immer von ≤ bis gilt. */
export function stelleVonBis(x: { von: number; bis: number }, welcher: 'von' | 'bis', wert: number): { von: number; bis: number } {
  const w = ganz(wert, 1, MAX_JE_MAPPE);
  return welcher === 'von' ? { von: w, bis: Math.max(w, x.bis) } : { von: Math.min(w, x.von), bis: w };
}

export interface DokumentOptionen {
  /** Anteil der neuen Mappen (mit Dokumentenregister), die Dokumente bekommen, in Prozent. */
  anteil: number;
  von: number;
  bis: number;
  /** Gewichte je Art; die Oberfläche schickt Prozent mit Summe 100. */
  mischung: Mischung;
  /** Anteil gewollter Duplikate in Prozent (gleiche Datei in mehreren Mappen). */
  duplikate: number;
}

export interface Abschaetzung { dokumente: number; bytes: number; ocrSeiten: number; seiten: number; jeArt: Mischung }

/** Erwartungswerte für eine Anzahl Mappen mit Dokumentenregister. */
export function schaetze(mappenMitRegister: number, o: DokumentOptionen): Abschaetzung {
  const dokumente = Math.round(mappenMitRegister * (o.anteil / 100) * ((o.von + o.bis) / 2));
  const summe = DOKUMENTARTEN.reduce((a, k) => a + o.mischung[k], 0) || 1;
  const jeArt = Object.fromEntries(DOKUMENTARTEN.map((k) => [k, Math.round((dokumente * o.mischung[k]) / summe)])) as Mischung;
  const neu = 1 - o.duplikate / 100;
  let bytes = 0, ocrSeiten = 0, seiten = 0;
  for (const k of DOKUMENTARTEN) {
    bytes += jeArt[k] * ERWARTUNG[k].bytes * neu;
    ocrSeiten += jeArt[k] * ERWARTUNG[k].ocrSeiten;
    seiten += jeArt[k] * ERWARTUNG[k].seiten;
  }
  return { dokumente, bytes: Math.round(bytes), ocrSeiten: Math.round(ocrSeiten), seiten: Math.round(seiten), jeArt };
}

export const dokumentRegister = (t: Mappentyp) => t.register.filter((r) => r.art === 'dokumente');

/** Wie viele Mappen bekommt jeder Typ? Stammdaten (wenig Verweise) weniger als Belege; Summe genau n. */
export function verteilung(typen: Mappentyp[], n: number): Map<string, number> {
  const gewicht = (t: Mappentyp) => 1 + 2 * t.felder.filter((f) => f.typ === 'referenz' && f.zielTyp !== t.id).length;
  const anzahl = aufteilen(typen.map(gewicht), n);
  // Jeder Typ bekommt mindestens eine Mappe (bei sehr kleinen Anzahlen also etwas mehr als n).
  return new Map(typen.map((t, i) => [t.id, Math.max(1, anzahl[i])]));
}

export interface Menge { mappen: number; mappenMitRegister: number; dokumente: Abschaetzung | null }

/** Abschätzung ohne Speicherplatz: aus den Mappentypen (ohne Systemtypen) und den Optionen. */
export function schaetzeMenge(typen: Mappentyp[], o: { anzahl: number; dokumente?: DokumentOptionen | null }): Menge {
  const eigene = typen.filter((t) => !t.system);
  const ziel = verteilung(eigene, o.anzahl);
  const mappen = [...ziel.values()].reduce((a, b) => a + b, 0);
  const mappenMitRegister = eigene.filter((t) => dokumentRegister(t).length).reduce((a, t) => a + (ziel.get(t.id) ?? 0), 0);
  return { mappen, mappenMitRegister, dokumente: o.dokumente ? schaetze(mappenMitRegister, o.dokumente) : null };
}

/** Deutliche Warnung bei großen Mengen, sonst null. */
export function mengenWarnung(m: Menge): string | null {
  const d = m.dokumente;
  if (!d) return null;
  if (d.dokumente > MAX_DEMO_DOKUMENTE) return `Mehr als ${MAX_DEMO_DOKUMENTE.toLocaleString('de-DE')} Dokumente je Lauf sind nicht möglich – weniger Mappen, einen kleineren Anteil oder weniger Dokumente je Mappe wählen.`;
  if (d.dokumente >= VIELE_DOKUMENTE || d.bytes >= VIELE_BYTES) return 'Das sind sehr viele Daten – das Erzeugen dauert auf einem NAS Stunden, die Texterkennung danach eher Tage. Sicherungen werden entsprechend größer.';
  return null;
}
