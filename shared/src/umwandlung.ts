/**
 * Paket-Update: Text in Verweis umwandeln (#534). Reine Hilfen für Server und Oberfläche – Namen aus dem
 * alten Textfeld lesen, mit vorhandenen Mappen des Zieltyps (meist Person) abgleichen, Werte für eine neue
 * Person bilden und die Titel-Vorlage bzw. Trefferlisten auf das Verweisfeld umstellen.
 * Grundsatz: Updates ändern nichts heimlich. Das DMS schlägt nur vor; umgewandelt wird nach der Vorschau.
 */
import { vorlageFelder, type Feld, type Mappe, type Mappentyp, type Trefferliste, type Werte } from './model';

/** Was mit einem Namen geschehen soll. */
export type Entscheidung = { art: 'person'; id: string } | { art: 'neu' } | { art: 'ueberspringen' };

export interface UmwandlungsFeld {
  typId: string; typName: string; feldKey: string; feldLabel: string; ausKey: string; ausLabel: string;
  mehrfach: boolean; zielTypId: string; zielTypName: string;
  /** Angaben im alten Textfeld, deren Verweis noch leer ist. */
  anzahl: number;
}
export interface VorschauZeile {
  /** Name, wie er im Text steht (bei mehreren Namen je Mappe ein Teil). */
  name: string; schluessel: string;
  /** In so vielen Mappen kommt er vor. */
  mappen: number;
  vorschlag: Entscheidung;
  /** Alle Mappen des Zieltyps mit genau diesem Namen (mehr als eine: bitte wählen). */
  passend: string[];
}
export interface UmwandlungsVorschau {
  feld: UmwandlungsFeld;
  zeilen: VorschauZeile[];
  /** Mappen, die nicht umgewandelt werden – mit Grund. */
  ausgelassen: Array<{ mappeId: string; titel: string; grund: string }>;
  /** Mappen des Zieltyps zur Auswahl. */
  kandidaten: Array<{ id: string; titel: string }>;
  /** Das alte Textfeld ist Pflicht – nach dem Umwandeln nicht mehr. */
  pflichtAus: boolean;
  /** Titel-Vorlage bzw. Trefferlisten nennen das alte Feld und zeigen danach den Verweis. */
  vorlage: boolean; spalten: boolean;
}

/** Was am Mappentyp geändert wurde – zum Zurücknehmen. */
export interface TypAenderung {
  pflicht: boolean;
  titelVorlage?: { vorher: string; nachher: string };
  trefferlisten?: { vorher: Trefferliste[]; nachher: Trefferliste[] };
  /** Felder je Feldregister vorher und nachher. */
  register?: { vorher: Record<string, string[]>; nachher: Record<string, string[]> };
  /** Reihenfolge der Felder (bestimmt die Reihenfolge im Formular) vorher und nachher. */
  reihenfolge?: { vorher: string[]; nachher: string[] };
}
export interface Umwandlungsvorgang {
  id: string; paket: string; typId: string; typName: string; feldKey: string; feldLabel: string; ausKey: string; ausLabel: string;
  zeit: string; von: string | null;
  mappen: Array<{ id: string; alt: string; neu: string[] }>;
  neuePersonen: string[];
  typ: TypAenderung;
  rueckgaengig?: { zeit: string; von: string | null; zurueck: number; ausgelassen: number };
}


/** Vergleichsform eines Namens: ohne Groß- und Kleinschreibung und ohne Leerzeichen. */
export const namensSchluessel = (s: string) => s.normalize('NFC').toLocaleLowerCase('de-DE').replace(/\s+/g, '');

const TRENNER = /\s*(?:[,;/&+]|\bund\b|\bu\.)\s*/i;

/**
 * Namen aus dem Text eines alten Felds. Bei einem Mehrfachverweis (Inhaber, Versicherte) wird an „und“, Komma,
 * Schrägstrich, & oder + geteilt; ein einzelner Vorname bekommt den Nachnamen des letzten Teils
 * („Lena und Tom Muster“ → „Lena Muster“, „Tom Muster“). Passt der ganze Text zu einer Mappe, bleibt er ganz.
 */
export function teileNamen(text: string, mehrfach: boolean, bekannt: (name: string) => boolean = () => false): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (!mehrfach || bekannt(t)) return [t];
  const teile = t.split(TRENNER).map((x) => x.trim()).filter(Boolean);
  if (teile.length < 2) return [t];
  const letzter = teile[teile.length - 1].split(' ');
  const nachname = letzter.length >= 2 ? letzter[letzter.length - 1] : '';
  return [...new Set(teile.map((x) => (nachname && !x.includes(' ') && !bekannt(x) ? `${x} ${nachname}` : x)))];
}

/** Sieht der Text wie ein Name aus (mindestens zwei Wörter, jedes mit Großbuchstaben, keine Ziffern)? Dann „neu“ statt „überspringen“. */
export function wieEinName(name: string): boolean {
  const w = name.trim().split(/\s+/);
  return w.length >= 2 && w.length <= 5 && w.every((x) => /^[\p{Lu}][\p{L}.'-]*$/u.test(x));
}

/** Vergleichsformen, unter denen eine Mappe des Zieltyps gefunden wird: Titel und Vorname/Nachname in beiden Reihenfolgen. */
export function namenVon(m: Pick<Mappe, 'werte'> & { titel?: string }): string[] {
  const s = (k: string) => (typeof m.werte[k] === 'string' ? (m.werte[k] as string).trim() : '');
  const vor = s('vorname'), nach = s('nachname');
  const formen = [m.titel ?? '', s('name'), vor && nach ? `${vor} ${nach}` : '', vor && nach ? `${nach} ${vor}` : '', vor && nach ? `${nach}, ${vor}` : ''];
  return [...new Set(formen.filter(Boolean).map(namensSchluessel))];
}

/** Vorschlag für einen Namen: genau die passenden Mappen (gleicher Name), sonst neu bzw. überspringen. */
export function vorschlag(name: string, kandidaten: Array<{ id: string; namen: string[] }>): { entscheidung: Entscheidung; passend: string[] } {
  const k = namensSchluessel(name);
  const passend = kandidaten.filter((x) => x.namen.includes(k)).map((x) => x.id);
  if (passend.length) return { entscheidung: { art: 'person', id: passend[0] }, passend };
  return { entscheidung: wieEinName(name) ? { art: 'neu' } : { art: 'ueberspringen' }, passend };
}

/**
 * Werte für eine neue Mappe des Zieltyps aus einem Namen: Vorname/Nachname, wenn es die Felder gibt (Person aus
 * dem Paket Basis), sonst das Feld „name“ bzw. das erste Textfeld.
 */
export function neueMappeWerte(ziel: Pick<Mappentyp, 'felder'>, name: string): Werte {
  const hat = (k: string) => ziel.felder.some((f) => f.key === k && f.typ === 'text');
  const w = name.trim().split(/\s+/);
  if (hat('nachname')) return w.length > 1 && hat('vorname') ? { vorname: w.slice(0, -1).join(' '), nachname: w[w.length - 1] } : { nachname: name.trim() };
  const f = ziel.felder.find((x) => x.key === 'name' && x.typ === 'text') ?? ziel.felder.find((x) => x.typ === 'text');
  return f ? { [f.key]: name.trim() } : {};
}

/** Titel-Vorlage: `{alt}` (auch mit Filtern) wird `{neu}` – nur, wenn `{neu}` noch nicht vorkommt. */
export function vorlageUmstellen(vorlage: string, alt: string, neu: string): string {
  if (!vorlageFelder(vorlage).includes(alt) || vorlageFelder(vorlage).includes(neu)) return vorlage;
  return vorlage.replace(new RegExp(`\\{${alt}(?=[|}])`, 'g'), `{${neu}`);
}

/** Spalten einer Trefferliste: `alt` wird `neu` (an derselben Stelle); steht `neu` schon darin, fällt `alt` weg. */
export function spaltenUmstellen(spalten: string[], alt: string, neu: string): string[] {
  if (!spalten.includes(alt)) return spalten;
  return spalten.includes(neu) ? spalten.filter((k) => k !== alt) : spalten.map((k) => (k === alt ? neu : k));
}

/** Feldregister: das Verweisfeld rückt an die Stelle direkt vor dem alten Textfeld. */
export function registerUmstellen(felderListe: string[], alt: string, neu: string): string[] {
  if (!felderListe.includes(alt)) return felderListe;
  const ohne = felderListe.filter((k) => k !== neu);
  const i = ohne.indexOf(alt);
  return [...ohne.slice(0, i), neu, ...ohne.slice(i)];
}

/** Ein leeres altes Textfeld blendet die Ablage aus (#534) – solange es keine Pflicht ist. */
export function altesFeldAusblenden(f: Feld, gespeichert: unknown, verweis: Feld | undefined): boolean {
  if (!verweis || f.pflicht) return false;
  return gespeichert === null || gespeichert === undefined || (typeof gespeichert === 'string' && !gespeichert.trim());
}
