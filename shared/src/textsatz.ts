/**
 * Text setzen (#1040): eine Text-Vorlage (Markdown, #1038) mit Platzhaltern wird zu einem Brief – Briefkopf,
 * Anschrift, Datum, Betreff, Text. Hier steht nur, was Server und Oberfläche gleich sehen müssen: Platzhalter einsetzen,
 * Markdown in Blöcke für den Satz zerlegen, den ausgefüllten Text bilden. Werte lesen (mit den Rechten der Person) und
 * das PDF zeichnen macht der Server (`server/src/textsatz/`, `server/src/pdf/brief.ts`).
 *
 * Regeln (Ergänzung Sicherheit):
 * - **Werte sind Text, kein Markdown.** Erst wird die Vorlage zerlegt, dann kommen die Werte als fertige Textstücke in
 *   die Blöcke. Ein Wert wie `**fett**`, `[Link](…)` oder `{anderes_feld}` erscheint so, wie er ist – keine
 *   Formatierung aus Daten, keine Platzhalter in Platzhaltern. Ersetzt wird in einem Durchgang.
 * - Im ausgefüllten Text (Markdown, liegt neben dem PDF) sind die Werte mit `\` maskiert, damit auch er sie als Text liest.
 * - Fehlt ein Wert oder darf die Person ihn nicht sehen, steht die sichtbare Lücke „[Vertragsnummer]“ da.
 * - Links werden Text mit der Adresse in Klammern – im PDF gibt es nichts zum Anklicken.
 */
import { zerlege, type Block, type Inline } from './markdown';

/** Ab dieser Version bietet Ablago Paketen „Text setzen“ (`POST /api/v1/mappen/{id}/vorlagen/{dokument}/setzen`). */
export const DMS_TEXTSATZ_AB = '0.241.0';

/** Ein Stück Text gleicher Schrift. `luecke`: fehlender Wert („[Vertragsnummer]“). */
export interface Lauf { text: string; fett?: boolean; kursiv?: boolean; mono?: boolean; luecke?: boolean }

export type BriefBlock =
  | { art: 'ueberschrift'; stufe: 1 | 2 | 3; laeufe: Lauf[] }
  | { art: 'absatz'; laeufe: Lauf[] }
  | { art: 'liste'; nummeriert: boolean; punkte: Lauf[][] }
  | { art: 'zitat'; bloecke: BriefBlock[] }
  /** Mehrere Leerzeilen hintereinander: so viele Zeilen Platz (z. B. für die Unterschrift). */
  | { art: 'abstand'; zeilen: number };

/** Alles, was der Satz für einen Brief braucht – einfache Daten, damit es in den Arbeiter darf. */
export interface Brief {
  /** Sprache des Briefs als Gebietsschema („de-DE“) – steht im PDF (/Lang). */
  sprache: string;
  /** Titel des PDFs (Betreff bzw. Name der Vorlage). */
  titel: string;
  /** Woher das PDF kommt (Metadaten, „erzeugt von Paket … mit Vorlage …“). */
  herkunft: string;
  /** Briefkopf oben rechts: erste Zeile der Name. Leer: kein Briefkopf. */
  absender: string[];
  /** Kleine Absenderzeile über der Anschrift (Rücksendeangabe). */
  ruecksende: string;
  /** Anschrift des Empfängers, je Zeile; Lücken als Lauf mit `luecke`. */
  anschrift: Lauf[][];
  /** Ort und Datum („Dresden, 11.11.2026“). */
  datum: string;
  betreff: Lauf[] | null;
  bloecke: BriefBlock[];
  /** Fußzeile ab zwei Seiten, mit {seite} und {seiten}. */
  seitenText: string;
  /** Höchstzahl der Seiten (grenzen.ts). */
  seitenMax: number;
}

/** Wert eines Platzhalters: Text oder sichtbare Lücke mit der Beschriftung des Felds. */
export type Platzhalterwert = { text: string } | { luecke: string };

/** Platzhalter `{feld}` bzw. `{feld.feld}` – dieselbe Schreibweise wie die Prüfung der Vorlagen (#1038). */
const PLATZHALTER = /\{([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\}/g;
/** Zeichen aus dem privaten Bereich: Marken für Platzhalter beim Zerlegen; in der Vorlage selbst entfernt. */
const PRIVAT = /[\uE000-\uF8FF]/g;
const MARKE = /\uE000(\d+)\uE001/g;
/** Marke für zusätzliche Leerzeilen (Anzahl als geschützte Leerzeichen dahinter). */
const ABSTAND = '\uE002';

/** Lücke für einen fehlenden Wert: „[Vertragsnummer]“. */
export const lueckenText = (beschriftung: string) => `[${beschriftung}]`;

/** Maskiert einen Wert für Markdown: Steuerzeichen mit `\`, Zeilenanfänge, die eine Liste oder Überschrift wären. */
export function mdMaskiert(wert: string): string {
  return wert.replace(/[\\`*_{}[\]()<>!#|~]/g, '\\$&')
    .replace(/(^|\n)(\s*)([-+])(?=\s|$)/g, '$1$2\\$3')
    .replace(/(^|\n)(\s*)(\d{1,9})([.)])(?=\s|$)/g, '$1$2$3\\$4');
}

export interface Gesetzt {
  /** Betreff aus der ersten Überschrift (#), sonst null. */
  betreff: Lauf[] | null;
  bloecke: BriefBlock[];
  /** Ausgefüllter Text (Markdown, Werte maskiert). */
  text: string;
}

/**
 * Setzt die Werte ein: Vorlage zerlegen (mit Marken statt Platzhaltern), dann jede Marke durch ihren Wert als
 * Textstück ersetzen. `wert` wird je Platzhalter einmal gefragt.
 */
export function setzeVorlage(vorlage: string, wert: (name: string) => Platzhalterwert): Gesetzt {
  const namen: string[] = [];
  const werte: Platzhalterwert[] = [];
  const mitMarken = vorlage.replace(/\r\n?/g, '\n').replace(PRIVAT, '').replace(PLATZHALTER, (_, name: string) => {
    namen.push(name);
    werte.push(wert(name));
    return `\uE000${namen.length - 1}\uE001`;
  });
  const text = mitMarken.replace(MARKE, (_, i: string) => { const w = werte[Number(i)]; return 'text' in w ? mdMaskiert(w.text) : mdMaskiert(lueckenText(w.luecke)); });
  // Zwei und mehr Leerzeilen hintereinander bleiben als Abstand (Platz für die Unterschrift).
  const mitAbstand = mitMarken.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, (m) => `\n\n${ABSTAND}${'\u00a0'.repeat(Math.min(10, m.split('\n').length - 3))}\n\n`);
  const bloecke = zerlege(mitAbstand).map((b) => block(b, werte));
  const erster = bloecke[0];
  const betreff = erster?.art === 'ueberschrift' && erster.stufe === 1 ? erster.laeufe : null;
  return { betreff, bloecke: betreff ? bloecke.slice(1) : bloecke, text };
}

type Stil = Pick<Lauf, 'fett' | 'kursiv' | 'mono'>;

function block(b: Block, werte: Platzhalterwert[]): BriefBlock {
  switch (b.art) {
    case 'ueberschrift': return { art: 'ueberschrift', stufe: b.stufe, laeufe: laeufe(b.inhalt, werte) };
    case 'absatz': {
      const roh = b.inhalt.length === 1 && b.inhalt[0].art === 'text' ? b.inhalt[0].text : '';
      if (roh.startsWith(ABSTAND)) return { art: 'abstand', zeilen: roh.length };
      return { art: 'absatz', laeufe: laeufe(b.inhalt, werte) };
    }
    case 'liste': return { art: 'liste', nummeriert: b.nummeriert, punkte: b.punkte.map((p) => laeufe(p, werte)) };
    case 'zitat': return { art: 'zitat', bloecke: b.bloecke.map((x) => block(x, werte)) };
  }
}

/** Inline-Teile in Läufe: Marken werden zu Werten (gleiche Schrift wie drumherum), Links zu Text mit Adresse. */
function laeufe(teile: Inline[], werte: Platzhalterwert[], stil: Stil = {}): Lauf[] {
  const aus: Lauf[] = [];
  const text = (s: string, st: Stil) => {
    let pos = 0;
    for (const m of s.matchAll(MARKE)) {
      if (m.index > pos) aus.push({ text: s.slice(pos, m.index), ...st });
      const w = werte[Number(m[1])];
      if (w) aus.push('text' in w ? { text: w.text, ...st } : { text: lueckenText(w.luecke), ...st, luecke: true });
      pos = m.index + m[0].length;
    }
    if (pos < s.length) aus.push({ text: s.slice(pos), ...st });
  };
  for (const t of teile) {
    switch (t.art) {
      case 'text': text(t.text, stil); break;
      case 'code': text(t.text, { ...stil, mono: true }); break;
      case 'erwaehnung': text(`@${t.name}`, stil); break;
      case 'fett': aus.push(...laeufe(t.kinder, werte, { ...stil, fett: true })); break;
      case 'kursiv': aus.push(...laeufe(t.kinder, werte, { ...stil, kursiv: true })); break;
      case 'link': aus.push(...laeufe(t.kinder, werte, stil)); text(` (${t.ziel})`, stil); break;
    }
  }
  return aus;
}

/** Reiner Text der Läufe (Titel, Tests). */
export const laufText = (l: Lauf[]) => l.map((x) => x.text).join('');

/* ---------- Schnittstelle ---------- */

/** Ein Platzhalter einer Vorlage, wie die Person ihn sieht: Name, Beschriftung, fehlt der Wert? `feld`: zum Hinspringen. */
export interface PlatzhalterStand { name: string; beschriftung: string; fehlt: boolean; feld?: string }

/** Eine Vorlage, die zu einer Mappe passt (GET /api/mappen/{id}/vorlagen). */
export interface VorlageEintrag {
  dokumentId: string;
  /** Name ohne .md („Kündigung Mietvertrag“). */
  name: string;
  /** Mappe, an der die Vorlage liegt (die Mappe selbst oder eine, auf die sie verweist, z. B. die Vertragsart). */
  quelle: { mappeId: string; titel: string };
  /** Paket, das sie mitgebracht hat; null bei eigenen Vorlagen (Register „Vorlagen“). */
  paket: { id: string; name: string } | null;
  platzhalter: PlatzhalterStand[];
  /** Briefkopf aus der eigenen Organisation bzw. der Person („an“), Empfänger aus „von“ – null: fehlt. */
  absender: string | null;
  empfaenger: string | null;
}

export interface VorlagenListe {
  vorlagen: VorlageEintrag[];
  /** Dokumentenregister der Mappe zum Ablegen (Kennung, Name); leer: ablegen geht nicht. */
  register: Array<{ key: string; name: string }>;
  /** Darf die Person hier ein Dokument hinzufügen (Recht Bearbeiten)? */
  ablegen: boolean;
  /** Darf die Person das PDF herunterladen (Lesen und Exportrecht E)? */
  herunterladen: boolean;
}

/** Ergebnis von „Als Dokument ablegen“: das PDF und der ausgefüllte Text. */
export interface TextGesetzt {
  pdf: import('./model').Dokument;
  text: import('./model').Dokument;
  /** Platzhalter, die als Lücke im Brief stehen. */
  luecken: string[];
}

/** Dateiname des Ergebnisses: „Kündigung Mietvertrag 2026-11-11“ (ohne Endung, ohne Schrägstriche). */
export function ergebnisName(vorlage: string, heute: string): string {
  const stamm = vorlage.replace(/\.md$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Brief';
  return `${stamm} ${heute}`;
}
