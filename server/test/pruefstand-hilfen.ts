/**
 * Prüfstand (#1679): erfundener Mini-Satz (Personas, example.org) und die Typen der Werkzeug-Module für die Tests.
 * Aufbau wie der Satz „Lebensläufe“: gemeinsam/, <persona>/<lebenslauf>/, ausgabe/, pruefstand.yaml.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATEIEN: Record<string, string> = {
  'pruefstand.yaml': 'paketAlias: { rechnungen: rechnung_bestellung }\n',
  'gemeinsam/organisationen.yaml': [
    'strom: { name: Beispiel Strom AG, strasse: Am Werk, hausnummer: "1", plz: "12345", ort: Musterstadt, email: kundenservice@strom.example.org }',
    'wasserwerk: { name: Wasserwerk Musterstadt, email: info@wasser.example.org }',
    '',
  ].join('\n'),
  'lena/a1-strom/lebenslauf.yaml': [
    'mappen:',
    '  - { typ: basis:organisation, schluessel: org_strom, werte: { name: Beispiel Strom AG, email: kundenservice@strom.example.org } }',
    '  - { typ: haus:immobilie, schluessel: haus_becker, werte: { bezeichnung: Wohnung Lena } }',
    '  - { typ: vertraege:vertrag, schluessel: vertrag_strom, werte: { von: { beispiel: org_strom }, vertragsnummer: ST-100, beginn: "2025-01-01" } }',
    '',
  ].join('\n'),
  'lena/a1-strom/01-vertrag.md': [
    '---',
    'id: a1-01',
    "datum: '2025-01-02'",
    'form: pdf',
    'seltenheit: haeufig',
    'absender: strom',
    'empfaenger: lena',
    'dokumentart: Vertrag',
    'titel: Stromvertrag',
    'erwartung:',
    '  mappe: vertrag_strom',
    '  felder: { vertrag_strom: { vertragsnummer: ST-100, beginn: "2025-01-01" } }',
    '  kurzfassung: Stromvertrag ab 01.01.2025.',
    '---',
    '',
    '**Vertragsbestätigung** Vertragsnummer ST-100',
    'Lieferbeginn 01.01.2025, Abschlag 48,00 € im Monat.',
    '',
    '| Datum | Buchung | Betrag |',
    '|---|---|---:|',
    '| 02.01.2025 | Grundpreis | 12,00 € |',
    '| 03.01.2025 | Arbeitspreis | 36,00 € |',
    '',
  ].join('\n'),
  'lena/a1-strom/02-preis.md':
    "---\nid: a1-02\ndatum: '2025-06-01'\nform: scan\nseltenheit: selten\nabsender: strom\nempfaenger: lena\ndokumentart: Mitteilung\ntitel: Preisänderung\nerwartung:\n  mappe: vertrag_strom\n  kurzfassung: Neuer Preis.\n---\n\nPreisänderung zum 01.07.2025.\n",
  'lena/a1-strom/03-ohne-datei.md':
    "---\nid: a1-03\ndatum: '2025-07-01'\nform: pdf\nseltenheit: selten\nabsender: strom\nempfaenger: lena\ndokumentart: Mitteilung\ntitel: Ohne Datei\nerwartung:\n  mappe: vertrag_strom\n  kurzfassung: Fehlt.\n---\n\nText.\n",
  'lena/b1-wasser/lebenslauf.yaml': [
    'mappen:',
    '  - { typ: basis:organisation, schluessel: org_wasser, werte: { name: Wasserwerk Musterstadt } }',
    '  - { typ: rechnungen:rechnung, schluessel: re_wasser, werte: { von: { beispiel: org_wasser }, rechnungsnummer: W-7, betrag: 80.5 } }',
    '',
  ].join('\n'),
  'lena/b1-wasser/01-rechnung.md':
    "---\nid: b1-01\ndatum: '2025-03-01'\nform: pdf\nseltenheit: haeufig\nabsender: wasserwerk\nempfaenger: lena\ndokumentart: Rechnung\ntitel: Wasserrechnung\nerwartung:\n  mappe: re_wasser\n  felder: { re_wasser: { rechnungsnummer: W-7, betrag: { betrag: 80.5, waehrung: EUR } } }\n  kurzfassung: Wasser.\n---\n\nRechnung W-7 über 80,50 €.\n",
  'ausgabe/lena/a1-strom/01-vertrag.pdf': '%PDF-1.4 Probe Vertrag',
  'ausgabe/lena/a1-strom/02-preis.pdf': '%PDF-1.4 Probe Scan',
  'ausgabe/lena/b1-wasser/01-rechnung.pdf': '%PDF-1.4 Probe Rechnung',
};

/** Mini-Satz unter `wurzel` anlegen; liefert `wurzel`. */
export function miniSatz(wurzel: string): string {
  for (const [n, inhalt] of Object.entries(DATEIEN)) {
    mkdirSync(dirname(join(wurzel, n)), { recursive: true });
    writeFileSync(join(wurzel, n), inhalt);
  }
  return wurzel;
}

/* ---------- Typen der Module (die Module sind .mjs ohne Typen) ---------- */

interface Kennzahl {
  ja: number;
  von: number;
}
interface Beleg {
  weg: string;
  sicherheit: number;
}
export interface Ergebnis {
  id: string;
  form?: string;
  seltenheit?: string;
  erwartet: { typ: string | null; typId: string | null; mappe: string; mappeDa?: boolean; absenderMappe?: string | null };
  typen?: Array<{ typ: string; sicherheit: number; belege: Beleg[] }>;
  vorschlag?: string | null;
  absender?: string[];
  ziele?: string[];
  felder?: Record<string, string>;
  /** Je Feld Feldart und Sicherheit des Vorschlags (#1693). */
  feldInfo?: Record<string, { art: string; sicherheit: string | null }>;
  text?: { zeichen: number };
  fuellTyp?: string;
  fehler?: string[];
}
interface SatzDokument {
  id: string;
  seltenheit: string;
  md: string;
  erwartung: { mappe: string };
}
interface Satz {
  dokumente: SatzDokument[];
  fehler: string[];
  commit: string;
}
interface Auswertung {
  gesamt: Record<string, Kennzahl>;
  wege: Record<string, { geliefert: number; typ1: Kennzahl; typ3: Kennzahl }>;
  ohneText: number;
  typFehlt: number;
}
export interface Pruefstand {
  satz: {
    liesSatz(w: string): Satz;
    entstehung(s: Satz): { grund: string[]; mitDokument: Map<string, string> };
    absenderMappe(s: Satz, a: string): string | null;
    typKennung(s: Satz, t: string): string;
    noetigePakete(s: Satz): string[];
  };
  wertung: {
    gleich(a: unknown, b: unknown): boolean;
    auswerten(e: Ergebnis[]): Auswertung;
    bewerte(e: Ergebnis): Record<string, unknown>;
    anteil(k: Kennzahl): number | null;
    feldart(f: Record<string, unknown> | undefined): string;
    feldarten(e: Ergebnis[]): Record<string, { richtig: number; falsch: number; fehlt: number; sicherFalsch: number }>;
  };
  bericht: object;
  fuellen: {
    datenZurueck(t: string, um: number): string;
    zeilenAusMarkdown(md: string): string[];
    vorlagen(s: Satz, typ: string): SatzDokument[];
    abwandlung(
      v: SatzDokument,
      i: number,
      o: { werte?: Record<string, unknown>; kopf?: string[] },
    ): { zeilen: string[]; werte: Record<string, unknown> };
  };
  pdf: { winAnsi(t: string): Buffer; pdfAusZeilen(z: string[], o?: { titel?: string }): Buffer };
  cli: {
    auswahl(s: Satz, o: Record<string, unknown>, fuellTyp: string | null): Array<{ d: SatzDokument; messen: boolean }>;
    bericht(o: { ordner: string; dateien: string[] }, jetzt?: Date): { stamm: string; hinweise: string[] };
    lauf(o: Record<string, unknown>): Promise<void>;
  };
}
