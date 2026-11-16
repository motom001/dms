import { t } from './texte';
/**
 * Umgebungsvariablen, die nicht mehr nötig sind (#115, #119, #478): je Variable der passende Grund
 * und der Text für den Hinweis in Werkbank → Übersicht. Server-Protokoll (index.ts, mandant.ts)
 * und Oberfläche sollen dieselbe Begründung nennen.
 */

export type VariablenArt = 'ordner' | 'datenbank' | 'haushalt';

export interface UeberfluessigeVariable {
  name: string;
  art: VariablenArt;
  /** Warum die Variable nicht mehr nötig ist (ganzer Satz). */
  grund: string;
}

export const VARIABLEN_GRUND: Record<VariablenArt, string> = {
  ordner: t('gemeinsam.umgebungsvariablen.die-ordner-im-container'),
  datenbank: t('gemeinsam.umgebungsvariablen.die-datenbank-anbindung-steht'),
  haushalt: t('gemeinsam.umgebungsvariablen.die-ablage-id-ist'),
};

/** Kurzform für den Hinweis („… – die Datenbank-Anbindung steht jetzt in einer Datei“). */
const KURZ: Record<VariablenArt, string> = {
  ordner: t('gemeinsam.umgebungsvariablen.die-ordner-im-container-2'),
  datenbank: t('gemeinsam.umgebungsvariablen.die-datenbank-anbindung-steht-2'),
  haushalt: t('gemeinsam.umgebungsvariablen.die-ablage-id-ist-2'),
};

/** Liste der überflüssigen Variablen in fester Reihenfolge: Ordner, DATABASE_URL, HAUSHALT_ID. */
export function ueberfluessigeVariablen(e: { ordner?: string[]; datenbank?: boolean; haushalt?: boolean }): UeberfluessigeVariable[] {
  return [
    ...(e.ordner ?? []).map((name) => ({ name, art: 'ordner' as const, grund: VARIABLEN_GRUND.ordner })),
    ...(e.datenbank ? [{ name: 'DATABASE_URL', art: 'datenbank' as const, grund: VARIABLEN_GRUND.datenbank }] : []),
    ...(e.haushalt ? [{ name: 'HAUSHALT_ID', art: 'haushalt' as const, grund: VARIABLEN_GRUND.haushalt }] : []),
  ];
}

export interface VariablenHinweis {
  /** Fett gesetzter Anfang. */
  titel: string;
  /** Je Variable eine Zeile: Name und Kurzgrund. */
  zeilen: Array<{ name: string; grund: string }>;
  /** Was zu tun ist. */
  schluss: string;
  ziel: string;
  knopf: string;
}

/** Text für den Hinweis; null, wenn nichts zu tun ist. */
export function variablenHinweis(v: UeberfluessigeVariable[]): VariablenHinweis | null {
  if (!v.length) return null;
  const eine = v.length === 1;
  // Nur DATABASE_URL: direkt zur Datenbank-Anbindung, sonst zur Technik (dort stehen alle Variablen).
  const nurDatenbank = v.every((x) => x.art === 'datenbank');
  return {
    titel: t('gemeinsam.umgebungsvariablen.nicht-mehr-noetig'),
    zeilen: v.map((x) => ({ name: x.name, grund: KURZ[x.art] })),
    schluss: eine
      ? t('gemeinsam.umgebungsvariablen.entferne-die-variable-beim')
      : t('gemeinsam.umgebungsvariablen.entferne-diese-variablen-beim'),
    ziel: nurDatenbank ? '/werkbank/anbindung' : '/werkbank/systemzustand#version',
    knopf: nurDatenbank ? t('gemeinsam.umgebungsvariablen.zur-anbindung') : t('gemeinsam.umgebungsvariablen.zur-technik'),
  };
}
