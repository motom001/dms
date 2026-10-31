import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HANDBUCH_BASIS, handbuchVersion } from '../../shared/src/hilfe';
import { eigeneVersion } from './system';

/**
 * Offline-Hilfe (#219): Die Handbücher liegen im Image unter web/dist/hilfe und werden wie die
 * Oberfläche ausgeliefert – ohne Anmeldung, auch im Einrichtungsmodus. Hier steht, was mit
 * Adressen unter /hilfe passiert, die keine Datei treffen:
 *  - Seite ohne Schrägstrich am Ende → Umleitung mit Schrägstrich (wie bei GitHub Pages),
 *  - Ordner mit index.html → diese Datei,
 *  - unbekannt → 404 (nicht die Oberfläche),
 *  - ohne Offline-Hilfe (Entwicklung ohne gebaute Handbücher) → dieselbe Seite online, passende Version.
 */
export type HilfeAntwort = { umleiten: string; status: 301 | 302 } | { datei: string } | { fehlt: true };

export function hilfeAntwort(url: string, webDir: string | undefined): HilfeAntwort | null {
  const [pfad, abfrage] = url.split('?', 2);
  if (pfad !== '/hilfe' && !pfad.startsWith('/hilfe/')) return null;
  const teile = pfad.slice('/hilfe'.length).split('/').filter(Boolean);
  if (teile.some((t) => t === '..' || t === '.' || t.includes('\\'))) return { fehlt: true };

  const lokal = !!webDir && existsSync(join(webDir, 'hilfe', 'index.html'));
  if (!lokal) {
    const [handbuch, ...seite] = teile;
    if (!handbuch) return { umleiten: `${HANDBUCH_BASIS}/`, status: 302 };
    const rest = seite.join('/');
    const schluss = rest && !rest.includes('.') ? '/' : '';
    return { umleiten: `${HANDBUCH_BASIS}/${handbuch}/${handbuchVersion(eigeneVersion())}/${rest}${schluss}`, status: 302 };
  }
  const letztes = teile[teile.length - 1] ?? '';
  if (!pfad.endsWith('/') && !letztes.includes('.')) return { umleiten: `/hilfe/${teile.map((t) => `${t}/`).join('')}${abfrage ? `?${abfrage}` : ''}`, status: 301 };
  const index = join('hilfe', ...teile, 'index.html');
  if (pfad.endsWith('/') && existsSync(join(webDir!, index))) return { datei: index };
  return { fehlt: true };
}

/** Antwort für Fastify (reply mit @fastify/static). */
export function hilfeSenden(reply: { redirect(url: string, code: number): unknown; sendFile(p: string): unknown; code(c: number): { type(t: string): { send(b: string): unknown } } }, a: HilfeAntwort) {
  if ('umleiten' in a) return reply.redirect(a.umleiten, a.status);
  if ('datei' in a) return reply.sendFile(a.datei);
  return reply.code(404).type('text/plain; charset=utf-8').send('Diese Seite gibt es in der Hilfe nicht.');
}
