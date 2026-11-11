/**
 * Nachrichten zwischen Hauptfaden und Arbeiter (#542). Über die Grenze gehen nur einfache Daten
 * (structured clone): Ein Buffer kommt als Uint8Array an und wird auf beiden Seiten wieder zum Buffer,
 * ein Fehler als einfaches Objekt und wird wieder zum Fachfehler.
 */
import { Fachfehler } from '../fehler';

export interface Auftrag { id: number; vorgang: string; args: unknown[] }
/** `zeichen`: Zeichen, die die Schrift eines erzeugten PDFs nicht hatte (#826) – der Pool meldet sie im Protokoll. */
export type Antwort = { id: number; ok: true; ergebnis: unknown; zeichen?: string[] } | { id: number; ok: false; fehler: FehlerDaten };
export interface FehlerDaten { message: string; status?: number; details?: unknown; stack?: string }

/** Uint8Array → Buffer (ohne Kopie), in Listen und einfachen Objekten auch tiefer. */
export function alsBuffer<T>(x: T): T {
  if (x instanceof Uint8Array) return (Buffer.isBuffer(x) ? x : Buffer.from(x.buffer, x.byteOffset, x.byteLength)) as T;
  if (Array.isArray(x)) return x.map(alsBuffer) as T;
  if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
    const o = x as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = alsBuffer(o[k]);
  }
  return x;
}

export function fehlerDaten(e: unknown): FehlerDaten {
  const x = e as Partial<Fachfehler> & Error;
  let details: unknown;
  try { details = x?.details === undefined ? undefined : structuredClone(x.details); } catch { details = undefined; }
  return { message: x?.message ?? String(e), status: typeof x?.status === 'number' ? x.status : undefined, details, stack: x?.stack };
}

export function fehlerAus(d: FehlerDaten): Error {
  const e = d.status ? new Fachfehler(d.status, d.message, d.details) : new Error(d.message);
  if (d.stack) e.stack = `${e.stack}\n--- im Arbeiter ---\n${d.stack}`;
  return e;
}
