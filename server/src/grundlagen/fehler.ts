import { isIP } from 'node:net';
import { t } from '../sprache/sprache';

/** Fachlicher Fehler mit HTTP-Status und optionalen Details für die Oberfläche. */
export class Fachfehler extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Codes, bei denen eine IPv6-Zieladresse auf ein Netz ohne IPv6-Route nach außen hindeutet (#1588). */
const OHNE_IPV6 = /^(ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EADDRNOTAVAIL)$/;

function ursacheText(code: string, adresse: string): string {
  if (adresse && isIP(adresse) === 6 && OHNE_IPV6.test(code)) return t('meldungen.netz.ursache.ipv6', { adresse });
  if (code === 'ERR_ACCESS_DENIED') return t('meldungen.netz.ursache.verweigert', { code });
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return t('meldungen.netz.ursache.name', { code });
  return adresse ? t('meldungen.netz.ursache.adresse', { code, adresse }) : code;
}

/**
 * Ursache eines Netzfehlers in Worten (#1588): „fetch failed“ allein sagt nichts. Liest `code` und Zieladresse aus dem
 * Fehler, seiner `cause` und – wenn alle Adressen eines Namens scheiterten (Happy Eyeballs) – aus jedem Einzelfehler.
 * Leer, wenn der Fehler keinen Code trägt.
 */
export function netzUrsache(e: unknown): string {
  const teile = new Map<string, string>();
  const sieh = (x: unknown, tiefe: number): void => {
    if (!x || typeof x !== 'object' || tiefe > 5) return;
    const f = x as { code?: unknown; address?: unknown; errors?: unknown; cause?: unknown };
    if (Array.isArray(f.errors) && f.errors.length) {
      for (const y of f.errors) sieh(y, tiefe + 1);
      return;
    }
    if (typeof f.code === 'string') {
      const adresse = typeof f.address === 'string' ? f.address : '';
      teile.set(`${f.code}|${adresse}`, ursacheText(f.code, adresse));
      return;
    }
    sieh(f.cause, tiefe + 1);
  };
  sieh(e, 0);
  return [...teile.values()].join(' ');
}

/** Meldung eines Netzfehlers samt Ursache (#1588), z. B. „fetch failed (Keine Verbindung zu 2001:db8::1 – Netz ohne IPv6?)“. */
export function mitNetzUrsache(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const u = netzUrsache(e);
  return u && !m.includes(u) ? (m ? `${m} (${u})` : u) : m;
}
