/**
 * Debug-Modus über Neustarts und Prozesse hinweg (#1528). Zwei Quellen, beide mit Zeitpunkt in der Datenbank und nach
 * 24 Stunden von selbst zu Ende:
 *
 * - **`LOG_LEVEL=debug`** in der Compose-Datei: Sieht Ablago die Variable zum ersten Mal, merkt es sich den Zeitpunkt
 *   (`debug_variable`). Bis zur ersten Datenbankverbindung schreibt jeder Prozess mit der Stufe aus der Variable, damit
 *   Fehler beim Start vollständig im Protokoll stehen. Nach 24 Stunden gilt wieder „info“; Systemzustand und Protokoll
 *   nennen, dass die Variable entfernt werden sollte. Wird sie entfernt und später wieder gesetzt, beginnen die 24
 *   Stunden von vorn.
 * - **Schalter der Werkbank** (`debug_werkbank`): gilt für alle Prozesse, auch für neu gestartete.
 *
 * Jeder Prozess gleicht sich jede Minute mit der Datenbank ab (start/hintergrund.ts); wer einen Übergang (begonnen,
 * abgelaufen) als Erster einträgt, schreibt die Zeile ins Protokoll.
 */
import type { Einstellungen } from '../einstellungen/einstellungen';
import { DEBUG_DAUER_MS, protokoll, STUFEN, type Stufe } from './protokoll';
import { tDe } from '../sprache/sprache';

const VARIABLE = 'debug_variable';
const WERKBANK = 'debug_werkbank';
const log = protokoll.modul('system');

interface Merker {
  seit: string;
  bis: string;
  /** Nur Variable: seit wann sie abgelaufen ist (sie steht noch in der Compose-Datei). */
  beendet?: string | null;
  /** Nur Werkbank: wer eingeschaltet hat. */
  von?: string;
}
const merker = (v: unknown): Merker | null => (v && typeof v === 'object' && typeof (v as Merker).bis === 'string' ? (v as Merker) : null);

/** Grundstufe aus der Umgebung (ohne Datenbank), wie beim Start. */
const ausUmgebung = (env: NodeJS.ProcessEnv): Stufe =>
  (STUFEN as readonly string[]).includes(env.LOG_LEVEL ?? '') ? (env.LOG_LEVEL as Stufe) : 'info';

/** Eintragen nur, wenn noch `alt` drinsteht; ohne `tausche` (Tests im Arbeitsspeicher) einfach schreiben. */
async function tausche(e: Einstellungen, k: string, alt: unknown, neu: unknown): Promise<boolean> {
  if (e.tausche) return e.tausche(k, alt, neu);
  await e.schreibe(k, neu);
  return true;
}

/** Merker der Variable nachführen: neu gesetzt, entfernt oder abgelaufen. */
async function variableAbgleich(e: Einstellungen, variableGesetzt: boolean, jetzt: number): Promise<Merker | null> {
  let v = merker(await e.lies(VARIABLE));
  if (!variableGesetzt && v) {
    // Entfernt: Beim nächsten Setzen beginnen die 24 Stunden von vorn.
    if (await tausche(e, VARIABLE, v, null)) log.info(tDe('meldungen.system.debug.variable-entfernt'));
    v = null;
  } else if (variableGesetzt && !v) {
    const neu: Merker = { seit: new Date(jetzt).toISOString(), bis: new Date(jetzt + DEBUG_DAUER_MS).toISOString(), beendet: null };
    if (await tausche(e, VARIABLE, null, neu)) log.warn(tDe('meldungen.system.debug.variable-an'), { bis: neu.bis });
    v = merker(await e.lies(VARIABLE));
  }
  if (v && !v.beendet && Date.parse(v.bis) <= jetzt) {
    const neu = { ...v, beendet: new Date(jetzt).toISOString() };
    if (await tausche(e, VARIABLE, v, neu)) log.warn(tDe('meldungen.system.debug.variable-aus'));
    v = neu;
  }
  return v;
}

/** Mit der Datenbank abgleichen und auf das Protokoll dieses Prozesses anwenden. */
export async function debugAbgleich(e: Einstellungen, env: NodeJS.ProcessEnv = process.env, jetzt = Date.now()) {
  const variableGesetzt = env.LOG_LEVEL === 'debug';
  const v = await variableAbgleich(e, variableGesetzt, jetzt);
  let w = merker(await e.lies(WERKBANK));
  if (w && Date.parse(w.bis) <= jetzt) {
    if (await tausche(e, WERKBANK, w, null)) log.info(tDe('meldungen.protokoll.debug-modus-nach-einer'));
    w = null;
  }
  const variableAktiv = !!v && !v.beendet && Date.parse(v.bis) > jetzt;
  const grund: Stufe = variableGesetzt ? (variableAktiv ? 'debug' : 'info') : ausUmgebung(env);
  protokoll.wendeDebugAn({
    grund,
    werkbankBis: w ? Date.parse(w.bis) : 0,
    variable: v ? { bis: Date.parse(v.bis), beendet: v.beendet ?? null } : null,
  });
  return protokoll.debugStand;
}

/**
 * Schalter der Werkbank: ein (24 Stunden ab jetzt) oder aus. „Aus“ beendet auch einen laufenden Debug-Modus aus
 * `LOG_LEVEL=debug` – die anderen Prozesse folgen spätestens beim nächsten Abgleich.
 */
export async function debugWerkbank(e: Einstellungen, an: boolean, von: string, jetzt = Date.now()) {
  const neu: Merker | null = an ? { seit: new Date(jetzt).toISOString(), bis: new Date(jetzt + DEBUG_DAUER_MS).toISOString(), von } : null;
  await e.schreibe(WERKBANK, neu);
  const v = merker(await e.lies(VARIABLE));
  if (!an && v && !v.beendet) await e.schreibe(VARIABLE, { ...v, beendet: new Date(jetzt).toISOString() });
}
