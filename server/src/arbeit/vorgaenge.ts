/**
 * Was ein Arbeiter erledigen kann (#542): alle PDF-Vorgänge der PDF-Stelle (#541) und die Tabellen großer
 * Exporte (Excel, CSV). Jeder Vorgang nimmt und liefert einfache Daten. Diese Datei lädt nur der Arbeiter –
 * oder der Hauptfaden selbst, wenn der Pool ausgeschaltet ist (`DMS_ARBEITER=0`).
 */
import { mappenPdfZeichnen } from '../pdf/export';
import { aufkleberbogenPdf } from '../pdf/aufkleber';
import { notfallblattPdf } from '../pdf/notfallblatt';
import { liesPdfA, textebeneWoerter } from '../pdf/archiv';
import { bereinigePdf } from '../pdf/anzeige';
import { eingebetteteERechnung } from '../pdf/erechnung';
import { erzeugeDokument, type MappenInhalt } from '../pdf/demo-dokumente';
import { textdokumentPdf } from '../pdf/schreiber';
import { briefPdf } from '../pdf/brief';
import { analysiere as analysiereSchwaerzen, arbeitsPdf, schwaerze, seitenbild as schwaerzSeitenbild } from '../pdf/schwaerzen';
import { baueSeiten, bilderZuPdf, bildSeitePdf, fuegeZusammen, seitenInfo, teileSeiten } from '../pdf/seiten';
import { bildAlsA4Pdf, stempelePdf } from '../pdf/stempel';
import { fehlendeZeichen } from '../pdf/schrift';
import { analysiere as analysiereVerkleinern, verkleinere as verkleinerePdf } from '../pdf/verkleinern';
import { csvAus, xlsxAus, type Zelle } from '../xlsx';
import { readFile } from 'node:fs/promises';
import { Zufall } from '../zufall';
import { setzeZeitzone } from '../../../shared/src/region';
import type { Dokumentart } from '../../../shared/src/demodaten';

/** Demo-Dokument mit dem Stand des Zufalls: Der Hauptfaden übernimmt den neuen Stand danach. */
async function demoDokument(zustand: { startwert: string; s: number }, art: Dokumentart, m: MappenInhalt, kennung: string, rastern: boolean) {
  const z = Zufall.aus(zustand);
  const dokument = await erzeugeDokument(z, art, m, kennung, rastern);
  return { dokument, zustand: z.zustand() };
}

/**
 * Tabelle eines Exports als Excel und/oder CSV. `zeitzone` (#726): Zeitpunkte in Excel stehen in der Zeitzone der
 * Ablage – der Arbeiter kennt die Einstellung sonst nicht (seit #746 mitgegeben).
 */
function exportTabellen(t: { titel: string; kopf: string[]; text?: string[][]; werte?: Zelle[][]; zeitzone?: string }) {
  if (t.zeitzone) setzeZeitzone(t.zeitzone);
  return { xlsx: t.werte ? xlsxAus(t.titel, t.kopf, t.werte) : null, csv: t.text ? csvAus(t.kopf, t.text) : null };
}

/**
 * Excel-Tabelle des Vollexports (#746): Die Zeilen liegen als JSON Lines in einer Datei, die der Hauptfaden als Strom
 * geschrieben hat. Der Arbeiter liest sie selbst – so muss der Hauptfaden keine Tabelle mit zehntausenden Zeilen an die
 * Nachricht übergeben (das hielt ihn bei 30.000 Zeilen fast eine Sekunde fest).
 */
async function exportTabelleAusDatei(t: { titel: string; kopf: string[]; datei: string; zeitzone?: string }) {
  if (t.zeitzone) setzeZeitzone(t.zeitzone);
  const text = await readFile(t.datei, 'utf8');
  const werte = text ? text.split('\n').filter(Boolean).map((z) => JSON.parse(z) as Zelle[]) : [];
  return xlsxAus(t.titel, t.kopf, werte);
}

export const VORGAENGE = {
  seitenInfo, baueSeiten, teileSeiten, fuegeZusammen, bilderZuPdf, bildSeitePdf,
  stempelePdf, bildAlsA4Pdf,
  analysiereVerkleinern, verkleinerePdf,
  analysiereSchwaerzen, schwaerze, schwaerzSeitenbild, arbeitsPdf,
  textdokumentPdf, mappenPdfZeichnen, aufkleberbogenPdf, notfallblattPdf, briefPdf,
  liesPdfA, textebeneWoerter, bereinigePdf, eingebetteteERechnung,
  demoDokument, exportTabellen, exportTabelleAusDatei,
};

/** Zeichen, die seit dem letzten Aufruf in einem PDF fehlten (#826) – der Arbeiter fragt nach jedem Auftrag. */
export { fehlendeZeichen };

export type Vorgaenge = typeof VORGAENGE;
export type Vorgang = keyof Vorgaenge;
