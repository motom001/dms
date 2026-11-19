/**
 * Benutzer von Ablago im Container (#1466): Wahl, Herkunft und Änderungen des Start-Skripts lesen
 * (deploy/image/start-hilfen.sh). Das Skript gibt die Wahl in der Umgebung mit (PUID, PGID, DMS_KENNUNG_HERKUNFT,
 * DMS_KENNUNG_GRUND) und schreibt Änderungen und Schreibfehler in den Merker des Containers (DMS_RECHTE_MERKER,
 * gehört root, für alle lesbar). Für Startseite (auch im Vorstart) und Systemzustand.
 *
 * Alles wird streng geprüft: Nur bekannte Arten, Zahlen und Pfade unter /data bzw. /eingang gehen weiter.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  kennungVorschlag,
  type Aenderungsart,
  type Dienstbenutzer,
  type KennungAenderung,
  type Kennungsherkunft,
  type Rechtefehler,
  type Vorgabegrund,
} from '../../../shared/src/dienstbenutzer';

/** Was die Startseite zum Benutzer von Ablago zeigt. */
export interface Rechtestand {
  fehler: Rechtefehler[];
  vorschlag: ReturnType<typeof kennungVorschlag>;
}

type Umgebung = Readonly<Record<string, string | undefined>>;
type Lesen = (pfad: string) => string;

const HERKUNFT: readonly Kennungsherkunft[] = ['daten', 'vorgabe', 'gesetzt'];
const GRUND: readonly Vorgabegrund[] = ['root', 'system', 'ohne'];
const ARTEN: readonly Aenderungsart[] = ['besitzer-root', 'besitzer', 'rechte', 'geheim'];
const ORDNER = /^\/(?:data|eingang)(?:\/[\w.-]{1,60}){0,3}$/;
const NAMEN = ['files', 'geheim', 'sicherung', 'export'];
const KENNUNG = /^\d{1,10}:\d{1,10}$/;
/** So viele Änderungen zeigt der Systemzustand höchstens (je Ordner und Art eine Zeile, plus Neustarts). */
const AENDERUNGEN_MAX = 40;

const lies: Lesen = (p) => readFileSync(p, 'utf8');
const merker = (env: Umgebung) => env.DMS_RECHTE_MERKER || null;

function zeilen(env: Umgebung, datei: string, lesen: Lesen): string[] {
  const m = merker(env);
  if (!m) return [];
  try {
    return lesen(join(m, datei)).split('\n').slice(0, 200);
  } catch {
    return [];
  }
}

const zahl = (w: string | undefined) => (w && /^\d{1,10}$/.test(w) ? Number(w) : null);

/** Änderungen beim Start (Merker „aenderungen“): Zeit, Art, Ordner, Anzahl, neuer Besitzer. */
function kennungAenderungen(env: Umgebung, lesen: Lesen = lies): KennungAenderung[] {
  const aus: KennungAenderung[] = [];
  for (const z of zeilen(env, 'aenderungen', lesen)) {
    const [zeit, art, ordner, anzahl, nach] = z.trim().split(/\s+/);
    const s = zahl(zeit);
    const n = zahl(anzahl);
    if (s === null || n === null || !ARTEN.includes(art as Aenderungsart) || !ORDNER.test(ordner ?? '') || !KENNUNG.test(nach ?? ''))
      continue;
    aus.push({ zeit: new Date(s * 1000).toISOString(), art: art as Aenderungsart, ordner: ordner!, anzahl: n, nach: nach! });
  }
  return aus.slice(-AENDERUNGEN_MAX);
}

/** Benutzer und Gruppe von Ablago, Herkunft und Änderungen. */
export function dienstbenutzer(env: Umgebung = process.env, lesen: Lesen = lies): Dienstbenutzer {
  const [hb, hg] = (env.DMS_KENNUNG_HERKUNFT ?? '').trim().split(/\s+/);
  const herkunft =
    HERKUNFT.includes(hb as Kennungsherkunft) && HERKUNFT.includes(hg as Kennungsherkunft)
      ? { benutzer: hb as Kennungsherkunft, gruppe: hg as Kennungsherkunft }
      : null;
  const grund = GRUND.includes(env.DMS_KENNUNG_GRUND as Vorgabegrund) ? (env.DMS_KENNUNG_GRUND as Vorgabegrund) : null;
  return {
    benutzer: process.getuid?.() ?? null,
    gruppe: process.getgid?.() ?? null,
    herkunft,
    grund,
    aenderungen: herkunft ? kennungAenderungen(env, lesen) : [],
  };
}

/** Ordner, in die Ablago nicht schreiben kann (Merker „fehler“), und der Vorschlag des Skripts für PUID/PGID. */
export function rechtefehler(env: Umgebung = process.env, lesen: Lesen = lies): Rechtestand {
  const fehler: Rechtefehler[] = [];
  for (const z of zeilen(env, 'fehler', lesen)) {
    const [ordner, besitzer, rechte, ro] = z.trim().split(/\s+/);
    if (!NAMEN.includes(ordner ?? '') || !KENNUNG.test(besitzer ?? '') || !/^[0-7]{3,4}$/.test(rechte ?? '')) continue;
    fehler.push({ ordner: ordner!, besitzer: besitzer!, rechte: rechte!, schreibgeschuetzt: ro === '1' });
  }
  const vorschlag = kennungVorschlag(zeilen(env, 'vorschlag', lesen)[0]);
  return { fehler, vorschlag };
}

/** Alles für die Startseite (Startmodus, Vorstart): Wahl, Änderungen, Schreibfehler. */
export function startseitenKennung(env: Umgebung = process.env, lesen: Lesen = lies) {
  return { stand: dienstbenutzer(env, lesen), ...rechtefehler(env, lesen) };
}
export type StartseitenKennung = ReturnType<typeof startseitenKennung>;
