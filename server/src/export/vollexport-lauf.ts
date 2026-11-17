/**
 * Gemeinsamer Stand beim Schreiben eines Vollexports (#1278, Schritt 6b-2; vorher Teil von `schreibeExport`): Quelle,
 * Schreiber, Mappentypen und Mappen, die Listen über alle Mappen und was die Schritte nach und nach zählen.
 */
import type { Mappe, Mappentyp } from '../../../shared/src/model';
import type { ExportOptionen, ExportQuelle } from './vollexport-quelle';
import { BOM, csvZeile, type Schreiber, type Zeilen } from './vollexport-formate';

/** Pfad (relativ zum Export) je Mappe (Ordner) und je Dokument (Datei) – für Übersichten, die darauf verlinken (#396). */
export interface ExportPfade {
  mappen: Map<string, string>;
  dokumente: Map<string, string>;
}

/** Listen über alle Mappen (#746): beim Durchgang Zeile für Zeile geschrieben, nicht erst gesammelt. */
export interface ExportListen {
  verweise: Zeilen;
  dokumente: Zeilen;
  notizen: Zeilen;
  aufgaben: Zeilen;
  historie: Zeilen;
}

export interface ExportLauf {
  q: ExportQuelle;
  w: Schreiber;
  opt: ExportOptionen;
  typen: Mappentyp[];
  typVon: Map<string, Mappentyp>;
  alleMappen: Map<string, Mappe>;
  jeTyp: Map<string, Mappe[]>;
  titel: (id: string | null | undefined) => string;
  /** Mappentypen und Titel für `zeile` (export.ts). */
  quelle: { typen: Map<string, Mappentyp>; titel: (id: string | null | undefined) => string };
  /** Fortschritt: eine Mappe fertig. */
  weiter: () => void;
  listen: ExportListen;
  zahl: { verweise: number; notizen: number; aufgaben: number; historie: number };
  dokumente: number;
  /** Für den Kalender: nur offene Aufgaben mit Datum. */
  termine: Array<{ id: string; datum: string; text: string; mappeId: string }>;
  passwoerter: string[][];
  pfade: ExportPfade;
}

/** Mappentypen und alle Mappen je Typ. */
export async function ladeMappen(q: ExportQuelle) {
  const typen = await q.typen();
  const typVon = new Map(typen.map((t) => [t.id, t] as const));
  const alleMappen = new Map<string, Mappe>();
  const jeTyp = new Map<string, Mappe[]>();
  for (const t of typen) {
    const ms = await q.mappen(t.id);
    jeTyp.set(t.id, ms);
    for (const m of ms) alleMappen.set(m.id, m);
  }
  return { typen, typVon, alleMappen, jeTyp };
}

const DOKUMENT_SPALTEN = [
  'dokument_id',
  'mappe_id',
  'register',
  'dateiname',
  'typ',
  'groesse',
  'sha256',
  'erstellt',
  'erstellt_von',
  'version',
  'stand',
  'pfad',
  'fassung',
  'archivfassung',
  'anlage_zu',
  'anlage_nr',
  'eingang_nr',
  'original_email',
];

/** Die Listen über alle Mappen öffnen; ins Manifest kommen sie am Ende in der bisherigen Reihenfolge. */
export async function oeffneListen(w: Schreiber): Promise<ExportListen> {
  const verweise = await w.oeffne('daten/verweise.csv');
  await verweise.schreibe(BOM + csvZeile(['quelle_id', 'feld', 'feld_schluessel', 'ziel_id', 'ziel_titel']));
  const dokumente = await w.oeffne('daten/dokumente.csv');
  await dokumente.schreibe(BOM + csvZeile(DOKUMENT_SPALTEN));
  const notizen = await w.oeffne('daten/notizen.jsonl');
  const aufgaben = await w.oeffne('daten/aufgaben.jsonl');
  const historie = await w.oeffne('daten/historie.jsonl');
  return { verweise, dokumente, notizen, aufgaben, historie };
}
