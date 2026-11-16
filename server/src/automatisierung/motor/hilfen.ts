/**
 * Abhängigkeiten und Hilfen des Motors (#1278): was `Automatisierungen` bekommt, Anlass eines Laufs, feste Ids,
 * Fassungsstand, mitgelieferte Automatisierungen und Platzhalter der Werkbank-Karten.
 */
import { createHash } from 'node:crypto';
import type { Dienst } from '../../dienst/dienst';
import type { AutomatisierungRepo } from './repo';
import type { SystemWerkbank } from '../automatisierung-werkbank';
import type { AufrufRepo } from '../aufruf';
import type { Kurzzustand } from '../../zwischenspeicher/kurzzustand';
import type { AusgangRepo, AussenGeheimnisRepo } from '../ausleitung';
import type { Mailer } from '../../mail/mail';
import type { SichererAbruf } from '../sicherer-abruf';
import { type KatalogEreignis, istBetriebWenn } from '../../../../shared/src/ereignisse';
import { datumsformat } from '../../../../shared/src/region';
import { gebietsschema } from '../../../../shared/src/sprache';
import {
  type AutomatisierungDaten,
  bereinigeAutomatisierung,
  werkbankBereiche,
  istAufruf,
  aussenKarten,
  type Automatisierung,
} from '../../../../shared/src/automatisierung';
import type { PaketAutomatisierung } from '../../pakete/verwaltung/index';
import { log } from './gemeinsam';
import type { InstalliertesPaket } from '../../../../shared/src/pakete';
import { heuteIn } from '../../../../shared/src/sichten';

/* ---------- Motor ---------- */

export interface AutomatisierungDeps {
  dienst: Dienst;
  repo: AutomatisierungRepo;
  /** Läuft gerade eine Wartung oder Wiederherstellung? Dann ruht der Zeitplan (der Verteiler ruht von selbst). */
  pause?: () => string | null;
  uhr?: () => number;
  /** Werkbank-Rechte des Systemkontos (#677): Sicherung anstoßen, neue Version, gemeldete Fehler, Protokoll. */
  werkbank?: SystemWerkbank;
  /**
   * „Aufruf von außen“ (#679): Speicher der Adressen, Kurzzustand (Bremse, Wiederholschutz über alle Prozesse),
   * Ver- und Entschlüsseln des Geheimnisses, Adresse von Ablago. Ohne: im Arbeitsspeicher, Tresor des Dienstes.
   */
  aufruf?: {
    repo?: AufrufRepo;
    zustand?: () => Kurzzustand;
    verschluessele?: (k: string) => string;
    entschluessele?: (w: string) => string | null;
    basis?: () => string;
  };
  /**
   * Karten nach außen (#671): Ausgangskorb und Geheimnisse (Datenbank), Einstellungen (freigegebene Ziele), Mailversand,
   * Adresse von Ablago; `abruf` nur für Tests. Ohne: im Arbeitsspeicher, Einstellungen des Kerns, ohne Mailversand.
   */
  aussen?: {
    repo?: AusgangRepo;
    geheimnisse?: AussenGeheimnisRepo;
    mailer?: () => Mailer | null;
    basis?: () => string;
    abruf?: SichererAbruf;
    verschluessele?: (k: string) => string;
    entschluessele?: (w: string) => string | null;
  };
}

/** Ereignis, wie der Motor es verarbeitet (aus dem Katalog oder vom Zeitplan). */
export interface Anlass {
  id: string;
  art: string;
  daten: Record<string, unknown>;
  kette: number;
  ausloeser?: KatalogEreignis['ausloeser'];
}

/**
 * Mappe eines Anlasses: die Mappe bzw. der Benutzer (Benutzer sind Mappen). Werkbank-Karten (#677) haben keine – auch
 * wenn „Fehler gemeldet“ die meldende Person nennt.
 */
export const mappeVon = (anlass: Pick<Anlass, 'art' | 'daten'>): string | null =>
  istBetriebWenn(anlass.art)
    ? null
    : typeof anlass.daten.mappe === 'string'
      ? anlass.daten.mappe
      : typeof anlass.daten.benutzer === 'string'
        ? anlass.daten.benutzer
        : null;

/** Feste UUID aus einem Text (gleiche Eingabe = gleiche Id; mehrere Server legen nichts doppelt an). */
export const uuidAus = (s: string) => {
  const h = createHash('sha256').update(s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const UHR_FORMAT = () => datumsformat(gebietsschema(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Stand einer Automatisierung in einer Fassung (#1006). */
export const fassungsStand = (a: AutomatisierungDaten & { aktiv: boolean }) => ({
  name: a.name,
  beschreibung: a.beschreibung,
  reihenfolge: a.reihenfolge,
  aktiv: a.aktiv,
  wenn: a.wenn,
  und: a.und,
  dann: a.dann,
  sonst: a.sonst,
});

/** Gleicher Stand unabhängig von der Reihenfolge der Schlüssel (Wenn-Karte vor und nach dem Speichern). */
export function gleicherStand(a: unknown, b: unknown): boolean {
  const sortiert = (w: unknown): unknown =>
    Array.isArray(w)
      ? w.map(sortiert)
      : w && typeof w === 'object'
        ? Object.fromEntries(
            Object.entries(w as Record<string, unknown>)
              .filter(([, v]) => v !== undefined)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, v]) => [k, sortiert(v)]),
          )
        : w;
  return JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
}

/**
 * Bringt eine mitgelieferte Automatisierung eine Werkbank-Karte (#677) oder die Wenn-Karte „Aufruf von außen“ (#679)
 * mit? Dann wird sie übergangen – eine Adresse ohne Anmeldung legt nur die Verwaltung selbst an.
 */
export function mitWerkbankKarte(paket: string, x: PaketAutomatisierung): boolean {
  const d = bereinigeAutomatisierung({ wenn: x.wenn, dann: x.dann, sonst: (x as { sonst?: unknown }).sonst });
  // Karten nach außen (#671): Ausleiten bleibt eine bewusste Entscheidung der Verwaltung – nie aus einem Paket.
  const ja = werkbankBereiche(d).length > 0 || istAufruf(d.wenn) || aussenKarten(d).length > 0;
  if (ja) log.warn('Mitgelieferte Automatisierung mit Werkbank-Karte übergangen', { paket, automatisierung: x.schluessel });
  return ja;
}

/** Id einer mitgelieferten Automatisierung – nach einem Umzug (#1084, `ersetzt`) die aus der früheren Paket-Id. */
export function paketAutomatisierungId(p: InstalliertesPaket, schluessel: string, vorhanden: Automatisierung[]): string {
  return (
    [p.id, ...(p.ersetzt ?? [])].map((k) => uuidAus(`paket|${k}|${schluessel}`)).find((k) => vorhanden.some((a) => a.id === k)) ??
    uuidAus(`paket|${p.id}|${schluessel}`)
  );
}

export type WennDatum = Automatisierung['wenn'];
export type WennZeitplan = Extract<WennDatum, { art: 'zeitplan' }>;

/** Werkbank-Karten (#677): Text aus dem Ereignis (sonst leer), Zeitpunkt kurz in der Sprache der Ablage, Stufe. */
export const alsText = (v: unknown) => (typeof v === 'string' ? v : '');
export const zeitpunktText = (v: unknown) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v))
    ? datumsformat(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))
    : '';
export const istStufe = (v: unknown): v is 'warn' | 'error' => v === 'warn' || v === 'error';

/** Tage von `ab` (Vorgabe heute) bis zum Datum – Platzhalter {tage}; leer ohne Datum. */
export function tageBis(datum: unknown, ab = heuteIn()): number | null {
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${ab}T12:00:00Z`)) / 86_400_000);
}
