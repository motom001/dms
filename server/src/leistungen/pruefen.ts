/**
 * Prüfungen der Leistungen (#1569): eindeutige Antworten je Fall (Code `leistung.<code>` in `details`), Eingabe und
 * Ausgabe gegen Schema und Formate, Dokumente der Eingabe zu Dateien auflösen.
 */
import {
  anzeigeSchluessel,
  istDatei,
  katalogAdresse,
  pruefe,
  type Datei,
  type Fehlercode,
  type KeinAnbieterGrund,
  type Leistung,
  type Leistungsname,
  type Schema,
  type Schemafehler,
} from '../../../shared/src/leistungen';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import type { Anbieterergebnis } from './anbieter';

const STATUS: Record<Fehlercode, number> = {
  unbekannt: 404,
  'eingabe-ungueltig': 422,
  'ausgabe-ungueltig': 502,
  'kein-anbieter': 409,
  'kein-schreibrecht': 403,
  'kein-leserecht': 404,
  'ziel-noetig': 422,
  'nur-verwaltung': 403,
  zeitgrenze: 504,
  'anbieter-fehler': 502,
  abgebrochen: 500,
};

/** Fehler einer Leistung: Status je Code, Code und weitere Angaben in `details`. */
export class Leistungsfehler extends Fachfehler {
  constructor(
    public code: Fehlercode,
    text: string,
    mehr: Record<string, unknown> = {},
  ) {
    super(STATUS[code], text, { code: `leistung.${code}`, ...mehr });
  }
}

export const anzeigename = (n: Leistungsname) => t.frei(anzeigeSchluessel(n));

const grundText = (f: Schemafehler) => t.frei(`meldungen.leistungen.grund.${f.grund}`, { pfad: f.pfad });

export function eingabeFehler(n: Leistungsname, f: Schemafehler): Leistungsfehler {
  return new Leistungsfehler(
    'eingabe-ungueltig',
    t('meldungen.leistungen.eingabe-ungueltig', { name: anzeigename(n), grund: grundText(f) }),
    {
      pfad: f.pfad,
      grund: f.grund,
    },
  );
}

export function keinAnbieter(n: Leistungsname, grund: KeinAnbieterGrund, mime?: string): Leistungsfehler {
  const katalog = katalogAdresse(n);
  return new Leistungsfehler(
    'kein-anbieter',
    t.frei(`meldungen.leistungen.kein-anbieter.${grund}`, { name: anzeigename(n), mime: mime ?? '', katalog }),
    {
      leistung: n,
      grund,
      katalog,
    },
  );
}

/** Ausgabe des Anbieters prüfen: Daten nach Schema, Datei genau dann, wenn die Leistung Formate hat, im erlaubten Format. */
export function pruefeAusgabe(l: Leistung, anbieter: string, r: Anbieterergebnis): void {
  const falsch = (grund: string) =>
    new Leistungsfehler('ausgabe-ungueltig', t('meldungen.leistungen.ausgabe-ungueltig', { anbieter, grund }), { anbieter });
  if (!r || typeof r !== 'object') throw falsch(t('meldungen.leistungen.grund.typ', { pfad: '.' }));
  const f = pruefe(l.ausgabe, r.daten);
  if (f) throw falsch(grundText(f));
  if (!l.formate.length) {
    if (r.datei !== undefined) throw falsch(t('meldungen.leistungen.ohne-datei'));
    return;
  }
  if (!istDatei(r.datei)) throw falsch(t('meldungen.leistungen.datei-fehlt'));
  const mime = r.datei.mime.toLowerCase().split(';')[0].trim();
  if (!l.formate.includes(mime)) throw falsch(t('meldungen.leistungen.format', { mime: r.datei.mime }));
}

/**
 * Alle Felder mit `format: 'dokument'` durch `f` ersetzen (Dokument-Id → Datei); Dateien, die schon da sind (nur im
 * Kern), bleiben. Die Eingabe ist zu diesem Zeitpunkt schon gegen das Schema geprüft.
 */
export async function loeseDokumente(s: Schema, w: unknown, f: (id: string) => Promise<Datei>): Promise<unknown> {
  if (s.type === 'string') return s.format === 'dokument' && typeof w === 'string' ? f(w) : w;
  if (s.type === 'array' && Array.isArray(w)) {
    const r: unknown[] = [];
    for (const x of w) r.push(await loeseDokumente(s.items, x, f));
    return r;
  }
  if (s.type === 'object' && w && typeof w === 'object' && !istDatei(w)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(w)) o[k] = s.properties[k] ? await loeseDokumente(s.properties[k], v, f) : v;
    return o;
  }
  return w;
}

/** Enthält der Wert irgendwo eine Datei (statt einer Dokument-Id)? Dann geht er nicht in die Datenbank. */
export function hatDatei(w: unknown): boolean {
  if (istDatei(w)) return true;
  if (Array.isArray(w)) return w.some(hatDatei);
  return !!w && typeof w === 'object' && Object.values(w).some(hatDatei);
}
