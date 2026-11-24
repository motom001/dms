/**
 * Stufe eines Pakets für „Was Ablago darf“ (#1562): aus dem Code im Manifest bzw. der Installation, und ob es ein
 * eingebauter Helfer von Ablago ist (läuft auf jeder Antwort). Die Antworten selbst stehen in shared/src/darf.ts.
 */
import type { PaketStufe } from '../darf';
import { hauptpaket, istOffiziellerHerausgeber } from '../kennungen';
import { hatSchnittstelle } from './rechtepunkte';
import { hatNetz, type PaketCode, type Schnittstelle } from './schnittstellen';

/** Stufe eines Pakets aus seinem Code (Manifest bzw. installiert): ohne Code Vorlagen, mit Netz Internet, sonst nur hier. */
export function paketStufe(code: PaketCode | null | undefined): PaketStufe {
  if (!code) return 'vorlagen';
  return hatNetz(code) ? 'netz' : 'lokal';
}

/** Schnittstellen der eingebauten Helfer von Ablago (#1562: laufen auf jeder Antwort). */
const EINGEBAUTE_SCHNITTSTELLEN: readonly Schnittstelle[] = ['dms:texterkennung', 'dms:archivfassung', 'dms:volltext', 'dms:umwandeln'];

/** Was über ein Paket bekannt sein muss, um zu sagen, ob es ein eingebauter Helfer ist. */
export interface PaketHerkunftAngabe {
  id: string;
  /** Herausgeber, wie die Paketverwaltung ihn bestimmt (Manifest oder Katalog). */
  herausgeber: string | null | undefined;
  /** Herausgeber belegt (offizieller Katalog bzw. Prüfsumme dort). */
  geprueft: boolean;
  code: PaketCode | null | undefined;
}

/**
 * Eingebauter Helfer (#1562): vom offiziellen, belegten Herausgeber, ohne Netz, und er übernimmt eine eingebaute
 * Aufgabe (Texterkennung, PDF/A, Volltext, Umwandeln) – oder er ergänzt so einen Helfer (z. B. eine Sprache der
 * Texterkennung, `texterkennung.fra`). `haupt` sagt, ob das Hauptpaket eines Zusatzes ein eingebauter Helfer ist.
 */
export function eingebauterHelfer(p: PaketHerkunftAngabe, haupt?: (id: string) => boolean): boolean {
  if (!istOffiziellerHerausgeber(p.herausgeber) || !p.geprueft || hatNetz(p.code ?? undefined)) return false;
  if (EINGEBAUTE_SCHNITTSTELLEN.some((s) => hatSchnittstelle(p.code ?? undefined, s))) return true;
  const h = hauptpaket(p.id);
  return !!h && !!haupt?.(h);
}
