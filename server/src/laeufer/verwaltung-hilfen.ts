/** Paket-Läufer, Seite des DMS (#1278 aus verwaltung.ts): Typen, Grenzen, Netzprotokoll und Hilfen ohne die Klasse. */
import type { Zugang, AktionsDatei } from '../paketaktionen';
import { protokoll } from '../protokoll/protokoll';
import type { Grenzen, NetzEintrag, VomLaeufer, NetzMessung } from './prozess';
import { WIEDERHOLEN_MIN } from '../../../shared/src/ereignisse';
import { WEITER_MAX_BYTES, KB, MB, GB } from '../grundlagen/grenzen';
import { gebietsschema } from '../../../shared/src/sprache';
import { t } from '../sprache/sprache';
import { type PaketCode, hatSchnittstelle, type InstalliertesPaket, istKiPaket } from '../../../shared/src/pakete';
import type { Dienst } from '../dienst/dienst';
import type { Konten } from '../konten';
import type { ApiSchluesselDienst } from '../anmeldung/apischluessel';
import { extern } from '../system/externmessung';

/** Eingeschränkter Zugriff eines laufenden Aufrufs einer Paket-Aktion (#1039). */
export interface AktionsZugang {
  paket: string;
  zugang: Zugang;
  dateien: AktionsDatei[];
}

/** Meldungen des Paket-Läufers und des Paket-Codes im Modul „pakete“ (#1490). */
export const log = protokoll.modul('pakete');

export const STANDARD_GRENZEN: Grenzen = { speicherMB: 256, sekunden: 120, parallel: 2 };
/** Wiederholungen nach Fehlschlag: 1, 5, 30 Minuten, 2, 6 Stunden – danach aufgegeben. */
export const WARTEN_MIN = WIEDERHOLEN_MIN;
/** Höchstens so viele Fortsetzungen je Ereignis (#458) – danach gilt es als zugestellt. */
export const WEITER_MAX = 500;

/**
 * Fortsetzung eines Ereignisses (#458): Antwortet ein Paket mit `{"weiter": {…}}` (Ergebnis als JSON, Code 0), ist es
 * noch nicht fertig – z. B. ein langes Dokument, das nicht in die Zeitgrenze eines Aufrufs passt. Der Läufer ruft es
 * gleich wieder auf, mit denselben Daten und zusätzlich `weiter` (was das Paket mitgegeben hat) und `abschnitt`.
 * null: keine Fortsetzung (auch bei zu großen Daten).
 */
export function liesWeiter(text: string): Record<string, unknown> | null {
  if (!text.startsWith('{') || !text.includes('"weiter"') || text.length > WEITER_MAX_BYTES) return null;
  try {
    const j = JSON.parse(text) as { weiter?: unknown };
    return j.weiter && typeof j.weiter === 'object' && !Array.isArray(j.weiter) ? (j.weiter as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const LETZTE = 20;
/** Protokollzeilen eines Pakets im Verlauf (#1003): höchstens so viele je Stunde. */
export const VERLAUF_ZEILEN = 60;
/** Zeitgrenze der Prüffunktion der Einstellungen (#996). */
export const PRUEF_MS = 10_000;
/** Nachberechnung der Vektoren (#442): alle so viele ms höchstens so viele Dokumente – nur, wenn das Paket nichts offen hat. */
export const NACHLAUF_MS = 30_000;
export const NACHLAUF_JE_RUNDE = 50;
/** Nach einem vollständigen Durchgang erst nach dieser Zeit wieder von vorn (Dokumente, deren Vektor fehlschlug). */
export const NACHLAUF_PAUSE_MS = 6 * 3600_000;
/** Gleiche Netzaufrufe (#807) so kurz hintereinander – auch über mehrere Aufrufe – stehen in einem Eintrag. */
export const NETZ_ZUSAMMEN_MS = 60_000;
/** So viele Einträge im Protokoll eines Pakets (Ausgaben und Netzaufrufe) höchstens. */
export const PROTOKOLL_MAX = 50;

/** „0 B“, „512 B“, „3,4 KB“, „12,1 MB“ – in der Sprache der Oberfläche. */
export function bytesText(n: number): string {
  const z = (x: number) => x.toLocaleString(gebietsschema(), { maximumFractionDigits: 1 });
  return n < KB ? `${n} B` : n < MB ? `${z(n / KB)} KB` : n < GB ? `${z(n / MB)} MB` : `${z(n / GB)} GB`;
}

/** Text eines Netzaufrufs im Protokoll des Pakets (#807): Anzahl, Methode, Host, Status, Bytes – nie Inhalte. */
export function netzText(e: NetzEintrag): string {
  if (e.abgelehnt) return t('meldungen.verwaltung.netz-abgelehnt', { anzahl: e.anzahl, methode: e.methode, host: e.host });
  return t('meldungen.verwaltung.netz-aufruf', {
    anzahl: e.anzahl,
    methode: e.methode,
    host: e.host,
    status: e.status ?? t('meldungen.verwaltung.netz-ohne-antwort'),
    hin: bytesText(e.hin),
    zurueck: bytesText(e.zurueck),
  });
}

type Protokolleintrag = { zeit: string; stufe: number; text: string; netz?: NetzEintrag };

/**
 * Netzaufrufe eines Aufrufs ins Protokoll eines Pakets (#807): Gleiche (Methode, Host, Status, abgelehnt) innerhalb von
 * NETZ_ZUSAMMEN_MS zählen in den vorhandenen Eintrag – so fluten Teile-Uploads das Protokoll nicht. Abgelehnte als Warnung.
 */
export function merkeNetz(protokoll: Protokolleintrag[], neu: NetzEintrag[], max = PROTOKOLL_MAX): void {
  const gleich = (a: NetzEintrag, b: NetzEintrag) =>
    a.methode === b.methode && a.host === b.host && a.status === b.status && !!a.abgelehnt === !!b.abgelehnt;
  for (const n of neu) {
    let i = protokoll.length - 1;
    while (
      i >= 0 &&
      !(protokoll[i].netz && gleich(protokoll[i].netz!, n) && Date.parse(n.zeit) - Date.parse(protokoll[i].netz!.bis) <= NETZ_ZUSAMMEN_MS)
    )
      i--;
    const e: NetzEintrag =
      i >= 0
        ? {
            ...protokoll[i].netz!,
            anzahl: protokoll[i].netz!.anzahl + n.anzahl,
            hin: protokoll[i].netz!.hin + n.hin,
            zurueck: protokoll[i].netz!.zurueck + n.zurueck,
            bis: n.bis,
          }
        : { ...n };
    if (i >= 0) protokoll.splice(i, 1);
    protokoll.push({ zeit: e.bis, stufe: e.abgelehnt ? 2 : 1, text: netzText(e), netz: e });
  }
  if (protokoll.length > max) protokoll.splice(0, protokoll.length - max);
}

/** Anfrage an die eigene API (im Betrieb über fastify.inject, ohne Netz). */
export type ApiAufruf = (a: {
  methode: string;
  pfad: string;
  kopf: Record<string, string>;
  body?: Buffer;
}) => Promise<{ status: number; kopf: Record<string, string>; body: Buffer }>;

/**
 * Recht des API-Schlüssels eines Dienstkontos: „lesen und schreiben“, sobald das Paket irgendetwas schreiben darf –
 * Mappen, Dokumente, Vektoren (#442), Fassungen (#577, dms:umwandeln), Volltext (#614, dms:volltext), Archivfassungen (#631). Pakete für die Kopie außer
 * Haus (#585, dms:sicherung-lesen) lesen nur: Ihren Stand melden sie in der Antwort auf das Ereignis (#636). Was es genau darf, prüft die Route je Recht.
 */
export const schluesselRecht = (c: PaketCode): 'lesen' | 'schreiben' =>
  c.rechte.schreiben.length ||
  c.rechte.dokumente === 'schreiben' ||
  hatSchnittstelle(c, 'dms:vektoren') ||
  hatSchnittstelle(c, 'dms:hinweise') ||
  hatSchnittstelle(c, 'dms:leerseiten') ||
  hatSchnittstelle(c, 'dms:umwandeln') ||
  hatSchnittstelle(c, 'dms:volltext') ||
  hatSchnittstelle(c, 'dms:archivfassung')
    ? 'schreiben'
    : 'lesen';

export interface LaeuferOptionen {
  dienst: Dienst;
  konten: Konten;
  schluessel: ApiSchluesselDienst;
  api: ApiAufruf;
  /** Einstellungen eines Pakets im Klartext (nur für das Paket selbst). */
  einstellungen: (paket: string) => Promise<Record<string, unknown>>;
  /** Kleiner eigener Speicher je Paket (Schlüssel → Wert). */
  speicher: { lies(paket: string): Promise<Record<string, string>>; schreibe(paket: string, werte: Record<string, string>): Promise<void> };
  /** Im Wartungsmodus keine Aufrufe. */
  pausiert?: () => boolean;
  grenzen?: Partial<Grenzen>;
  /** Tests: kürzere Abstände. */
  abrufMs?: number;
  /** Tests: weniger Fortsetzungen je Ereignis (#458, Standard WEITER_MAX). */
  weiterMax?: number;
  nachlaufMs?: number;
  /** Tests (#900): erste Nachberechnung nach dem Laden der Pakete (Standard 1 s); lang = nur ausdrücklich aufgerufen. */
  nachlaufErstMs?: number;
}

export interface PaketStand {
  id: string;
  name: string;
  version: string;
  dienstkonto: string | null;
  geladen: boolean;
  fehler: string | null;
  aufrufe: number;
  fehlgeschlagen: number;
  letzterAufruf: string | null;
  dauerMs: number | null;
  speicherMB: number | null;
  ereignisse: { offen: number; aufgegeben: number; zugestellt: number };
  letzte: Array<{ zeit: string; art: string; ok: boolean; text: string }>;
  /** Ausgaben des Pakets und seine Netzaufrufe (#807, mit `netz`). */
  protokoll: Array<{ zeit: string; stufe: number; text: string; netz?: NetzEintrag }>;
}

export interface Aufruf {
  ok: (r: Extract<VomLaeufer, { art: 'ergebnis' }>) => void;
  teil?: (text: string) => void;
}
export type Ergebnis = Extract<VomLaeufer, { art: 'ergebnis' }> & { ohneVersuch?: boolean };
/** Ergebnis ohne Aufruf (Läufer beendet, abgestürzt, Zeit abgelaufen). ohneVersuch: zählt nicht als Versuch des Ereignisses. */
export const abbruch = (fehler: string, ohneVersuch = false): Ergebnis => ({
  art: 'ergebnis',
  nr: 0,
  paket: '',
  ok: false,
  rc: null,
  text: '',
  ms: 0,
  speicherMB: 0,
  fehler,
  ohneVersuch,
});

/**
 * Externe Dienste (#565): Dauer, Bytes und Token der Netzaufrufe eines Aufrufs, im Läufer gemessen. KI-Dienst ist ein
 * Paket mit Inhalten und Netz (#796); Funktion ist die Schnittstelle bzw. die Art des Ereignisses –
 * nie ein Text des Pakets. Ereignisse laufen im Hintergrund: ohne Anfrage und Person.
 */
export function erfasseNetz(p: InstalliertesPaket, a: { ereignis: boolean; funktion?: string; art: string }, m: NetzMessung | undefined) {
  if (!m?.anzahl) return;
  extern.erfasse(
    {
      dienst: istKiPaket(p.laeufer) ? 'ki' : 'netz',
      paket: p.id,
      funktion: a.ereignis ? a.art : (a.funktion ?? 'aktion'),
      ersteMs: m.ersteMs,
      ms: m.ms,
      hin: m.hin,
      zurueck: m.zurueck,
      ergebnis: m.zeit ? 'zeit' : m.fehler ? 'fehler' : 'ok',
      tokenEin: m.tokenEin,
      tokenAus: m.tokenAus,
    },
    { hintergrund: a.ereignis },
  );
}
