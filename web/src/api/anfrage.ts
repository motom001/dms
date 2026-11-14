/** Kern der Schnittstelle: Anfrage mit Fehlerbehandlung, Einrichtungscode, Bestätigung im Verwaltungsmodus, Dateien laden und senden. */
import { messung } from '../messung';
import type { Pruefergebnis } from '../../../shared/src/model';
import { merkeAnfrage } from '../diagnose';
import { erreichbarkeit, NICHT_ERREICHBAR } from '../erreichbar';
import { istAusfall, istDatenbankAusfall } from '../../../shared/src/erreichbarkeit';
import { t } from '../sprache';
import { sprache } from '../../../shared/src/sprache';

export class ApiFehler extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
  /** Prüfergebnis, wenn der Server Eingaben abgelehnt hat (422). */
  get pruefung(): Pruefergebnis | undefined {
    const d = this.details as Pruefergebnis | undefined;
    return d && Array.isArray(d.allgemein) ? d : undefined;
  }
  get gruende(): string[] {
    const d = this.details as { gruende?: string[] } | undefined;
    return d?.gruende ?? [];
  }
}
/** Wird ausgelöst, wenn der Server die Sitzung nicht (mehr) kennt. */
export const ABGEMELDET = 'dms:abgemeldet';
/** Einrichtungscode (#119): solange das DMS nicht eingerichtet ist, bei jeder Anfrage mitschicken. */
let einrichtungscode: string | null = (() => { try { return sessionStorage.getItem('dms:einrichtungscode'); } catch { return null; } })();
export function setzeEinrichtungscode(c: string | null) {
  einrichtungscode = c;
  try { if (c) sessionStorage.setItem('dms:einrichtungscode', c); else sessionStorage.removeItem('dms:einrichtungscode'); } catch { /* egal */ }
}
export const hatEinrichtungscode = () => !!einrichtungscode;
/** Datei vom Server holen und im Browser speichern (#153) – POST mit JSON, Antwort als Datei. */
export async function speichereDatei(url: string, body: unknown, ersatzname: string): Promise<{ name: string; bytes: number; ausgelassen: number }> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'x-dms': '1', 'x-sprache': sprache(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new ApiFehler(0, NICHT_ERREICHBAR); }
  if (!r.ok) {
    const d = await r.json().catch(() => null) as { fehler?: string; details?: unknown } | null;
    throw new ApiFehler(r.status, d?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }), d?.details);
  }
  const kopf = r.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(kopf);
  const name = m ? decodeURIComponent(m[1]) : ersatzname;
  const blob = await r.blob();
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return { name, bytes: blob.size, ausgelassen: Number(r.headers.get('x-dms-ausgelassen')) || 0 };
}
/**
 * Verwaltungsmodus (#819): Aktivität für den Server. Nur eine Eingabe (Klick, Taste, Tippen) in der letzten Minute
 * verlängert den Modus – Abfragen im Hintergrund (Fortschritt, Stand) nicht.
 */
let letzteEingabe = 0;
if (typeof window !== 'undefined') for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => { letzteEingabe = Date.now(); }, { capture: true, passive: true });
const aktiv = () => Date.now() - letzteEingabe < 60_000;
/**
 * Endet der Verwaltungsmodus während der Arbeit oder braucht eine heikle Handlung eine frische Anmeldung (#819), fragt
 * die Oberfläche nur erneut nach der Anmeldung und schickt dieselbe Anfrage danach noch einmal – nichts geht verloren.
 * `true` = bestätigt, noch einmal versuchen.
 */
export type Bestaetigung = (art: 'modus' | 'frisch', details: { heuteBestaetigt?: boolean; frisch?: boolean; handlung?: string }) => Promise<boolean>;
let bestaetigung: Bestaetigung | null = null;
export function setzeBestaetigung(f: Bestaetigung | null) { bestaetigung = f; }
const MODUS_URL = /^\/api\/konto\/verwaltung/;
export async function anfrage<T>(methode: string, url: string, body?: unknown, nochmal = true): Promise<T> {
  try { return await anfrageEinmal<T>(methode, url, body); } catch (e) {
    const d = e instanceof ApiFehler && e.status === 403 ? e.details as { verwaltungsmodus?: boolean; frisch?: boolean; heuteBestaetigt?: boolean; handlung?: string } | undefined : undefined;
    if (!nochmal || !bestaetigung || !d || MODUS_URL.test(url) || !(d.verwaltungsmodus || d.frisch)) throw e;
    if (!(await bestaetigung(d.verwaltungsmodus ? 'modus' : 'frisch', d))) throw e;
    return anfrage<T>(methode, url, body, false);
  }
}
/**
 * Eine heikle Datei herunterladen (#819, #821: Notfallblatt): wie `anfrage` mit Rückfrage, wenn der Verwaltungsmodus
 * fehlt oder eine frische Anmeldung nötig ist – ein Link könnte diese Antwort des Servers nicht abfangen. Danach
 * speichert der Browser die Datei. Höchstens zwei Rückfragen (erst der Modus, dann die frische Anmeldung).
 */
export async function heikleDatei(url: string, ersatzname: string, rueckfragen = 2): Promise<void> {
  let r: Response;
  try {
    r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { 'x-dms': '1', 'x-sprache': sprache(), ...(aktiv() ? { 'x-dms-aktiv': '1' } : {}) } });
  } catch { erreichbarkeit.ausfall(); throw new ApiFehler(0, NICHT_ERREICHBAR); }
  if (!r.ok) {
    const d = await r.json().catch(() => null) as { fehler?: string; details?: { verwaltungsmodus?: boolean; frisch?: boolean; heuteBestaetigt?: boolean; handlung?: string } } | null;
    const x = r.status === 403 ? d?.details : undefined;
    if (rueckfragen > 0 && bestaetigung && x && (x.verwaltungsmodus || x.frisch) && await bestaetigung(x.verwaltungsmodus ? 'modus' : 'frisch', x)) return heikleDatei(url, ersatzname, rueckfragen - 1);
    if (r.status === 401) dispatchEvent(new Event(ABGEMELDET));
    throw new ApiFehler(r.status, d?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }), d?.details);
  }
  const m = /filename\*=UTF-8''([^;]+)/i.exec(r.headers.get('content-disposition') ?? '');
  const blob = await r.blob();
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: m ? decodeURIComponent(m[1]) : ersatzname });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
/**
 * Abfrage im Hintergrund (#919, #921): ohne Kennzeichen „aktiv“ (zählt nie als Aktivität, auch kurz nach einer Eingabe)
 * und ohne Rückfrage nach der Anmeldung, wenn der Verwaltungsmodus inzwischen abgelaufen ist – fragt die Oberfläche von
 * selbst, darf sie niemanden unterbrechen. Der Server behandelt die Route ebenso (`still`).
 */
export const stilleAnfrage = <T>(url: string) => anfrageEinmal<T>('GET', url, undefined, true);
async function anfrageEinmal<T>(methode: string, url: string, body?: unknown, still = false): Promise<T> {
  let r: Response;
  const start = performance.now();
  const seite = messung.seite;
  try {
    r = await fetch(url, {
      method: methode,
      credentials: 'same-origin',
      // X-DMS kennzeichnet Anfragen der eigenen Oberfläche (Schutz vor fremden Seiten).
      headers: {
        'x-dms': '1', 'x-sprache': sprache(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(einrichtungscode ? { 'x-einrichtungscode': einrichtungscode } : {}),
        ...(aktiv() && !still ? { 'x-dms-aktiv': '1' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    erreichbarkeit.ausfall();
    merkeAnfrage(methode, url, 0, NICHT_ERREICHBAR);
    throw new ApiFehler(0, NICHT_ERREICHBAR);
  }
  const kopf = performance.now();
  const daten = r.status === 204 ? null : await r.json().catch(() => null);
  messung.erfasse(seite, methode, url, r, start, kopf, performance.now());
  // Update, Neustart (#122): Antwort vom Proxy statt vom DMS.
  if (istAusfall(r.status, daten)) {
    erreichbarkeit.ausfall(istDatenbankAusfall(r.status, daten));
    merkeAnfrage(methode, url, r.status, NICHT_ERREICHBAR);
    throw new ApiFehler(r.status, NICHT_ERREICHBAR);
  }
  erreichbarkeit.antwort();
  if (r.status === 401 && !url.startsWith('/api/konto/')) dispatchEvent(new Event(ABGEMELDET));
  if (!r.ok) {
    merkeAnfrage(methode, url, r.status, daten?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }));
    throw new ApiFehler(r.status, daten?.fehler ?? t('oberflaeche.api.fehler', { status: r.status }), daten?.details);
  }
  return daten as T;
}
export async function sendeDatei(url: string, datei: Blob): Promise<unknown> {
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST', credentials: 'same-origin', body: datei,
        headers: { 'x-dms': '1', 'x-sprache': sprache(), 'content-type': 'application/octet-stream' },
      });
    } catch { erreichbarkeit.ausfall(); throw new ApiFehler(0, NICHT_ERREICHBAR); }
    const d = await r.json().catch(() => null);
    if (istAusfall(r.status, d)) { erreichbarkeit.ausfall(); throw new ApiFehler(r.status, NICHT_ERREICHBAR); }
    if (r.status === 401) dispatchEvent(new Event(ABGEMELDET));
    if (!r.ok) throw new ApiFehler(r.status, d?.fehler ?? (r.status === 413 ? t('oberflaeche.api.die-datei-ist-zu') : t('oberflaeche.api.fehler', { status: r.status })), d?.details);
    return d;
}
