/**
 * Berechnete Felder und Hinweise von Paketen an Mappen (#1034). Eigene Datei ohne Abhängigkeiten zur Laufzeit, damit
 * Modell, Server und Oberfläche sie ohne Kreis nutzen.
 *
 * - **Berechnet:** Ein Feld eines Mappentyps aus einem Paket trägt `berechnetVon` (Id des Pakets, im Paketformat
 *   `berechnet: true`). Nur der Code dieses Pakets schreibt den Wert – über die Schnittstelle, mit seinen Rechten und
 *   denselben Prüfungen wie alle anderen. Oberfläche, Schnittstelle (andere Schlüssel), Automatisierungen, „Aus Dokument
 *   ausfüllen“, Erkennung und Vorschläge lassen es aus; wer es trotzdem schreibt, bekommt 400 mit dem Namen des Pakets.
 * - **Nicht mehr berechnet:** Ist das Paket entfernt oder rechnet es nicht mehr (kein Code, kein Schreibrecht auf den
 *   Typ), bleibt der letzte Wert stehen und das Feld nur lesbar – bis der Administrator es freigibt.
 * - **Hinweise:** Ein Paket mit `dms:hinweise` setzt an Mappen, die es schreiben darf, kurze Hinweise (nur Text) unter
 *   einem eigenen Schlüssel. Sie stehen in der Hinweiszeile über den Registern, immer mit dem Namen des Pakets, und
 *   halten das Speichern nie auf.
 */
import type { Feld, Mappentyp } from './model';
import type { InstalliertesPaket } from './pakete';

/** Ab dieser Version kennt Ablago berechnete Felder und `dms:hinweise` (#1034). */
export const DMS_BERECHNET_AB = '0.231.0';
/** Höchstlänge eines Hinweises (Zeichen, Ergänzung Sicherheit). */
export const HINWEIS_MAX = 300;
/** Höchstens so viele Hinweise je Paket und Mappe (Ergänzung Sicherheit). */
export const HINWEISE_JE_PAKET = 3;

/** Ein Hinweis eines Pakets an einer Mappe, wie ihn die Mappe mitliefert. */
export interface PaketHinweis {
  /** Id des Pakets. */
  paket: string;
  /** Name des Pakets – steht immer neben dem Hinweis. */
  paketName: string;
  /** Schlüssel, unter dem das Paket ihn setzt (je Paket eigener Namensraum). */
  schluessel: string;
  text: string;
  /** Zeitpunkt (ISO) des letzten Setzens. */
  gesetzt: string;
}

/** Wer ein berechnetes Feld schreibt (je Paket-Id am Mappentyp, nur beim Lesen ergänzt). */
export interface Berechnung {
  /** Name des Pakets; bei einem entfernten Paket seine Id. */
  name: string;
  /** Rechnet das Paket noch? Sonst „nicht mehr berechnet“ – der letzte Wert bleibt. */
  aktiv: boolean;
}

/** Das Paket, das dieses Feld berechnet – oder undefined. */
export const berechnetVon = (f: Pick<Feld, 'berechnetVon'> | undefined): string | undefined => f?.berechnetVon || undefined;

/**
 * Darf ein Weg außer dem Paket selbst das Feld füllen – „Aus Dokument ausfüllen“, Erkennung, „folgt aus“,
 * Automatisierungen, Vorschläge aus der verwiesenen Mappe (#1037)? Nie bei berechneten Feldern (Hinweis Qualität:
 * „nie überschreiben“). Neue Wege fragen hier, der Server prüft beim Speichern ohnehin (mappen/berechnet.ts).
 */
export const vonAussenFuellbar = (f: Pick<Feld, 'berechnetVon'>): boolean => !f.berechnetVon;

/** Felder des Typs, die ein Paket berechnet. */
export const berechneteFelder = (typ: Pick<Mappentyp, 'felder'>): Feld[] => typ.felder.filter((f) => !!f.berechnetVon);

/**
 * Rechnet das Paket für diesen Typ noch? Installiert, mit Code und mit Schreibrecht auf den Typ (eigener Schlüssel,
 * `paket:schluessel` oder „*“). `schluessel` ist die Kennung des Typs in Ablago (`vertraege:vertrag`).
 */
export function berechnungAktiv(p: Pick<InstalliertesPaket, 'id' | 'laeufer'> | undefined, typ: Pick<Mappentyp, 'schluessel'>): boolean {
  if (!p?.laeufer) return false;
  const kennung = typ.schluessel ?? '';
  const eigen = kennung.startsWith(`${p.id}:`) ? kennung.slice(p.id.length + 1) : null;
  return p.laeufer.rechte.schreiben.some((v) => v === '*' || v === kennung || (eigen !== null && v === eigen));
}

/** Je Paket-Id, die an Feldern des Typs steht: Name und ob es noch rechnet. Leer, wenn der Typ keine berechneten Felder hat. */
export function berechnungVon(typ: Pick<Mappentyp, 'felder' | 'schluessel'>, pakete: Array<Pick<InstalliertesPaket, 'id' | 'name' | 'laeufer'>>): Record<string, Berechnung> {
  const r: Record<string, Berechnung> = {};
  for (const id of new Set(berechneteFelder(typ).map((f) => f.berechnetVon!))) {
    const p = pakete.find((x) => x.id === id);
    r[id] = { name: p?.name ?? id, aktiv: berechnungAktiv(p, typ) };
  }
  return r;
}

/** Gründe, aus denen ein Hinweistext abgelehnt wird. */
export type HinweisFehler = 'leer' | 'lang' | 'html' | 'markdown' | 'link';

/**
 * Hinweistext prüfen (Ergänzung Sicherheit): nur Text, kein HTML, kein Markdown, keine Links, höchstens
 * {@link HINWEIS_MAX} Zeichen. Zeilenumbrüche und Steuerzeichen werden zu Leerzeichen, mehrere Leerzeichen zu einem.
 */
export function pruefeHinweistext(roh: unknown): { text: string } | { fehler: HinweisFehler } {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen gehören nicht in einen Hinweis
  const text = typeof roh === 'string' ? roh.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) return { fehler: 'leer' };
  if ([...text].length > HINWEIS_MAX) return { fehler: 'lang' };
  if (/[<>]|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(text)) return { fehler: 'html' };
  if (/\]\(|`|\*\*|__|^\s*(?:#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/.test(text)) return { fehler: 'markdown' };
  if (/\b(?:https?|ftp|mailto|file|javascript|data|tel):|\bwww\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S/i.test(text)) return { fehler: 'link' };
  return { text };
}
