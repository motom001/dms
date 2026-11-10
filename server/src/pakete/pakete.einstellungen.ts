import { Fachfehler } from '../fehler';
import { t } from '../sprache';
import type { PaketEntwurf } from '../../../shared/src/paketerstellung';
import type { Kern } from '../kern';

/* ---------- Ablage der Pakete in den Einstellungen (#189, #197, #338, #374, #534, #594, #652) ---------- */

/** Bestätigter bzw. neuer (gesperrter) Schlüssel eines eigenen Katalogs (#594). */
export interface KatalogSchluessel { pem: string; fingerabdruck: string; von: string | null; am: string }
/** Eine weitere Katalogquelle (#189) mit Schlüssel des Anbieters (#594). */
export interface PaketQuelleEintrag { url: string; aktiv: boolean; von: string | null; am: string; schluessel?: KatalogSchluessel | null; gesperrt?: KatalogSchluessel | null }
/** Was die Funktionen hier vom Kern brauchen. */
export type Paketablage = Pick<Kern, 'einstellungen'>;

/**
 * Weitere Katalogadressen (#189), global; der offizielle Katalog steht nicht darin. Mit bestätigtem
 * Schlüssel des Anbieters bzw. Sperre nach einem Schlüsselwechsel (#594).
 */
export async function paketQuellen(k: Paketablage): Promise<PaketQuelleEintrag[]> {
  const v = await k.einstellungen?.lies('paket_kataloge');
  const schluessel = (x: unknown) => (x && typeof x === 'object' && typeof (x as { fingerabdruck?: unknown }).fingerabdruck === 'string' ? x as never : null);
  return Array.isArray(v) ? v.filter((q) => q && typeof q.url === 'string').map((q) => ({
    url: q.url, aktiv: q.aktiv !== false, von: q.von ?? null, am: String(q.am ?? ''),
    schluessel: schluessel(q.schluessel), gesperrt: schluessel(q.gesperrt),
  })) : [];
}
export async function setzePaketQuellen(k: Paketablage, liste: PaketQuelleEintrag[]) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe('paket_kataloge', liste.length ? liste : null);
}
/** Neuester gesehener Stand (`erstellt`) je signiertem Katalog (#594) – gegen das Zurückdrehen auf ältere Kataloge. */
export async function paketKatalogStaende(k: Paketablage): Promise<Record<string, string>> {
  const v = await k.einstellungen?.lies('paket_katalog_staende');
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Record<string, string> : {};
}
export async function setzePaketKatalogStand(k: Paketablage, url: string, stand: string) {
  if (!k.einstellungen) return;
  await k.einstellungen.schreibe('paket_katalog_staende', { ...(await paketKatalogStaende(k)), [url]: stand });
}

/** Umwandlungen Text → Verweis nach Paket-Updates (#534): die letzten Vorgänge zum Rückgängigmachen (Einstellung, Teil der Sicherung). */
export async function paketUmwandlungen(k: Paketablage): Promise<unknown[]> {
  const v = await k.einstellungen?.lies('paket_umwandlungen');
  return Array.isArray(v) ? v : [];
}
export async function setzePaketUmwandlungen(k: Paketablage, liste: unknown[]) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe('paket_umwandlungen', liste.length ? liste : null);
}

/** Selbst erstellte Pakete (#374): Angaben des letzten Exports je Paket-Id (Einstellung, Teil der Sicherung). */
export async function paketEntwuerfe(k: Paketablage): Promise<PaketEntwurf[]> {
  const v = await k.einstellungen?.lies('paket_entwuerfe');
  return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && typeof e.version === 'string').map((e) => ({ typen: [], sichten: [], beispiele: [], schluessel: {}, verlauf: [], aenderungen: '', ...e })) : [];
}
export async function setzePaketEntwuerfe(k: Paketablage, liste: PaketEntwurf[]) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe('paket_entwuerfe', liste.length ? liste : null);
}

/** Gemerkte Archive selbst erstellter Pakete (#652): je Paket-Id eine Einstellung (Teil der Sicherung). */
export async function paketArchive(k: Paketablage, id: string): Promise<unknown> { return (await k.einstellungen?.lies(`paket_erstellt_${id}`)) ?? null; }
export async function setzePaketArchive(k: Paketablage, id: string, liste: unknown[] | null) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe(`paket_erstellt_${id}`, liste?.length ? liste : null);
}

/** Paket-Einstellungen (#197): je Paket getrennt in den Einstellungen (Teil der Sicherung, Schlüsselwechsel inklusive). */
export async function paketEinstellungen(k: Paketablage, id: string): Promise<{ werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null> {
  const v = await k.einstellungen?.lies(`paket:${id}`);
  return v && typeof v === 'object' ? v as { werte: Record<string, unknown> } : null;
}
export async function setzePaketEinstellungen(k: Paketablage, id: string, v: { werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe(`paket:${id}`, v);
}
/** Kleiner eigener Speicher eines Pakets mit Code (#338), getrennt von den Einstellungen. */
export async function paketSpeicher(k: Paketablage, id: string): Promise<Record<string, string>> {
  const v = await k.einstellungen?.lies(`paketspeicher:${id}`);
  return v && typeof v === 'object' ? v as Record<string, string> : {};
}
export async function setzePaketSpeicher(k: Paketablage, id: string, werte: Record<string, string> | null) {
  if (!k.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
  await k.einstellungen.schreibe(`paketspeicher:${id}`, werte);
}
