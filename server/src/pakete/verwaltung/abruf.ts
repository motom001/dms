/**
 * Daten über HTTP holen (Kataloge, Pakete) mit Grenzen für Größe und Weiterleitungen.
 */
import { inMB } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../fehler';
import { t } from '../../sprache';
import { ARCHIV_MAX } from '../../grenzen';

/** Höchstens so viele Weiterleitungen folgt holeDaten. */
const WEITERLEITUNGEN_MAX = 5;

/**
 * Holt eine Adresse mit Zeitlimit und Größengrenze; nur HTTPS (bzw. HTTP für localhost).
 * Weiterleitungen folgt es selbst und nur auf `https://`-Adressen (#594) – auch von localhost aus.
 */
export async function holeDaten(url: string, max = ARCHIV_MAX): Promise<Buffer> {
  let u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
    throw new Fachfehler(422, t('meldungen.pakete.pakete-gibt-es-nur'));
  // 20 s bis zur Antwort; große Archive (#644) dürfen danach bis zu 5 Minuten laden. Die 20 s gelten nur bis zu
  // den Köpfen (eigene Uhr, nach der Antwort gelöscht) – AbortSignal.timeout bräche sonst auch das Lesen ab.
  const gesamt = new AbortController();
  const uhr = setTimeout(() => gesamt.abort(new Error('Zeitgrenze beim Laden erreicht.')), 300_000);
  try {
    for (let n = 0; ; n++) {
      const kopf = new AbortController();
      const kopfUhr = setTimeout(() => kopf.abort(new Error('Keine Antwort in 20 Sekunden.')), 20_000);
      const r = await fetch(u, {
        signal: AbortSignal.any([kopf.signal, gesamt.signal]),
        redirect: 'manual',
        headers: { 'user-agent': 'dms-paketverwaltung (https://github.com/motom001/dms)' },
      }).finally(() => clearTimeout(kopfUhr));
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        await r.body?.cancel().catch(() => {});
        if (n >= WEITERLEITUNGEN_MAX) throw new Fachfehler(502, t('pakete.herkunft.fehler.weiterleitungen', { url }));
        const ziel = new URL(r.headers.get('location')!, u);
        if (ziel.protocol !== 'https:') throw new Fachfehler(502, t('pakete.herkunft.fehler.weiterleitung', { url, ziel: ziel.href }));
        u = ziel;
        continue;
      }
      // Status in den Details: Eine fehlende Datei (404/410) ist etwas anderes als ein gescheiterter Abruf (#1351).
      if (!r.ok) throw new Fachfehler(502, `${url}: ${r.status} ${r.statusText}`.trim(), { status: r.status });
      const laenge = Number(r.headers.get('content-length') ?? NaN);
      const zuGross = (bytes: number) => new Fachfehler(422, t('pakete.groesse.zuGross', { groesse: inMB(bytes), max: inMB(max) }));
      if (laenge > max) {
        await r.body?.cancel().catch(() => {});
        throw zuGross(laenge);
      }
      // Stückweise lesen und früh abbrechen, statt erst alles in den Speicher zu holen.
      const teile: Buffer[] = [];
      let zusammen = 0;
      if (r.body)
        for await (const s of r.body as unknown as AsyncIterable<Uint8Array>) {
          zusammen += s.length;
          if (zusammen > max) {
            gesamt.abort();
            throw zuGross(zusammen);
          }
          teile.push(Buffer.from(s));
        }
      return Buffer.concat(teile, zusammen);
    }
  } finally {
    clearTimeout(uhr);
  }
}

export const TAG_MS = 86_400_000;

/** Datei neben einem Katalog, z. B. katalog.sig neben katalog.json. */
export const daneben = (url: string, datei: string) => new URL(datei, url).href;
