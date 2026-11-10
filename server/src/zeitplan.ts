import { zeitzone } from '../../shared/src/region';
import { verschiebe } from '../../shared/src/sichten';
import type { Einstellungen } from './einstellungen';

/**
 * Der eine Zeitplan-Baustein (#724): Wann ist ein täglicher Lauf fällig, was wird nachgeholt, wer macht ihn?
 * Sicherung, Probe-Wiederherstellung, Tägliche Zusammenfassung und „Datum erreicht“ nutzen ihn; die Wenn-Karte
 * „Zeitplan“ (Stufe 2) setzt darauf auf.
 *
 * **Eine Regel zum Nachholen:** Fällig ist jeder Tag nach dem zuletzt gelaufenen, an dem der Takt gilt, sobald seine
 * Uhrzeit erreicht ist – höchstens `nachholenTage` zurück (0 = nur heute). Das gilt auch nach einem Neustart: Was
 * heute (bzw. in den letzten Tagen) zur Uhrzeit nicht lief, läuft beim nächsten Blick. Ein neuer Takt (noch nie
 * gelaufen) beginnt heute, nichts rückwirkend.
 *
 * **Mehrere Server:** Wer den Tag im Merker einträgt (vergleichen und tauschen in der Datenbank), macht den Lauf.
 */
export interface Takt {
  /** Uhrzeit „HH:MM“ (Zeitzone des Haushalts). */
  uhrzeit: string;
  /** Gilt der Takt an diesem Tag (Wochentag, Feiertag …)? Ohne: jeden Tag. */
  an?: (datum: string) => boolean;
  /** So viele Tage zurück holt der Baustein verpasste Läufe nach (0 = nur heute). */
  nachholenTage?: number;
}

/** Ortszeit als Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM). */
export interface Jetzt { datum: string; uhr: string }

/** Die Regel: fällige Tage (älteste zuerst) nach dem zuletzt gelaufenen. */
export function faelligeTage(zuletzt: string | null, jetzt: Jetzt, t: Takt): string[] {
  const bis = jetzt.uhr >= t.uhrzeit ? jetzt.datum : verschiebe(jetzt.datum, -1);
  const fruehestens = verschiebe(jetzt.datum, -(t.nachholenTage ?? 0));
  let tag = zuletzt ? verschiebe(zuletzt, 1) : jetzt.datum;
  if (tag < fruehestens) tag = fruehestens;
  const erg: string[] = [];
  for (; tag <= bis && erg.length < 400; tag = verschiebe(tag, 1)) if (!t.an || t.an(tag)) erg.push(tag);
  return erg;
}

/** Wo ein Takt sich merkt, bis wann er gelaufen ist. */
export interface Merker {
  lies(): Promise<string | null>;
  /** Tag eintragen, wenn noch `alt` drinsteht; true = dieser Server macht den Lauf. */
  beanspruche(alt: string | null, tag: string): Promise<boolean>;
}

/** Merker in den Einstellungen (Schlüssel wie bisher, z. B. `sicherung_zuletzt_auto`). */
export function einstellungsMerker(e: Einstellungen, schluessel: string): Merker {
  return {
    async lies() { const v = await e.lies(schluessel); return typeof v === 'string' ? v : null; },
    async beanspruche(alt, tag) {
      if (e.tausche) return e.tausche(schluessel, alt, tag);
      if (((await e.lies(schluessel)) ?? null) !== alt) return false;
      await e.schreibe(schluessel, tag); return true;
    },
  };
}

/**
 * Fällige Läufe eines Takts nacheinander: je Tag erst eintragen, dann `lauf(tag)`. Liefert die gelaufenen Tage.
 * Scheitert ein Lauf, bleibt der Tag eingetragen (kein Dauerversuch); der Aufrufer meldet den Fehler.
 */
export async function laufeFaellige(m: Merker, jetzt: Jetzt, t: Takt, lauf: (tag: string) => Promise<void>): Promise<string[]> {
  let zuletzt = await m.lies();
  const erledigt: string[] = [];
  for (const tag of faelligeTage(zuletzt, jetzt, t)) {
    if (!(await m.beanspruche(zuletzt, tag))) break;
    zuletzt = tag;
    erledigt.push(tag);
    await lauf(tag);
  }
  return erledigt;
}

/** Wochentag eines Datums JJJJ-MM-TT: 1 = Montag … 7 = Sonntag (wie in den Einstellungen). */
export const wochentagVon = (datum: string) => ((new Date(`${datum}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/**
 * Zeitpunkt (ISO, UTC) eines Tags JJJJ-MM-TT und einer Uhrzeit HH:MM in der Zeitzone der Ablage (#1082: `zeitpunkt` im
 * Ereignis `zeitplan.ausgefuehrt`). Gibt es die Uhrzeit wegen der Zeitumstellung nicht, gilt die Stunde danach; gibt es
 * sie zweimal, die erste.
 */
export function zeitpunktIn(tag: string, uhrzeit: string, zone = zeitzone()): string {
  const [j, m, d] = tag.split('-').map(Number);
  const [h, min] = uhrzeit.split(':').map(Number);
  const wunsch = Date.UTC(j, m - 1, d, h, min);
  const teile = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Abstand der Ortszeit zu UTC an einem Zeitpunkt (in ms).
  const versatz = (ms: number) => {
    const x = Object.fromEntries(teile.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return Date.UTC(Number(x.year), Number(x.month) - 1, Number(x.day), Number(x.hour), Number(x.minute)) - Math.floor(ms / 60_000) * 60_000;
  };
  // Kandidaten mit dem Versatz vor und nach einer möglichen Zeitumstellung; passend ist, was als Ortszeit den Wunsch ergibt.
  const kandidaten = [...new Set([wunsch - versatz(wunsch - 432e5), wunsch - versatz(wunsch + 432e5)])].sort((a, b) => a - b);
  const passend = kandidaten.filter((c) => c + versatz(c) === wunsch);
  return new Date(passend.length ? passend[0] : kandidaten[kandidaten.length - 1]).toISOString();
}
