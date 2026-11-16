import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HANDBUCH_BASIS, HANDBUCH_ONLINE_ORDNER, HANDBUCH_SPRACHEN } from '../../../shared/src/hilfe';
import { t } from '../sprache/sprache';

/**
 * Offline-Hilfe (#219): Die Handbücher liegen im Image unter web/dist/hilfe und werden wie die
 * Oberfläche ausgeliefert – ohne Anmeldung, auch im Einrichtungsmodus. Hier steht, was mit
 * Adressen unter /hilfe passiert, die keine Datei treffen:
 *  - Seite ohne Schrägstrich am Ende → Umleitung mit Schrägstrich (wie bei GitHub Pages),
 *  - Ordner mit index.html → diese Datei,
 *  - unbekannt → 404 (nicht die Oberfläche) mit der Seite „nicht gefunden“ samt Suche über alle Handbücher (#841),
 *    falls die Offline-Hilfe sie mitbringt (hilfe/404.html), sonst ein kurzer Text,
 *  - ohne Offline-Hilfe (Entwicklung ohne gebaute Handbücher) → dieselbe Seite online, passende Version;
 *    Übersetzungen (#730) liegen dabei wie offline unter /hilfe/<handbuch>/<sprache>/.
 */
export type HilfeAntwort = { umleiten: string; status: 301 | 302 } | { datei: string } | { fehlt: true; seite?: string };

export function hilfeAntwort(url: string, webDir: string | undefined): HilfeAntwort | null {
  const [pfad, abfrage] = url.split('?', 2);
  if (pfad !== '/hilfe' && !pfad.startsWith('/hilfe/')) return null;
  const teile = pfad.slice('/hilfe'.length).split('/').filter(Boolean);
  if (teile.some((t) => t === '..' || t === '.' || t.includes('\\'))) return { fehlt: true };

  const lokal = !!webDir && existsSync(join(webDir, 'hilfe', 'index.html'));
  if (!lokal) {
    const [handbuch, ...seite] = teile;
    if (!handbuch) return { umleiten: `${HANDBUCH_BASIS}/`, status: 302 };
    // Startseite einer weiteren Sprache (#730): /hilfe/en/ → help.ablago.app/en/
    if (handbuch !== 'de' && (HANDBUCH_SPRACHEN as readonly string[]).includes(handbuch) && !seite.length)
      return { umleiten: `${HANDBUCH_BASIS}/${handbuch}/`, status: 302 };
    const rest = seite.join('/');
    const schluss = rest && !rest.includes('.') ? '/' : '';
    return { umleiten: `${HANDBUCH_BASIS}/${handbuch}/${HANDBUCH_ONLINE_ORDNER}/${rest}${schluss}`, status: 302 };
  }
  const letztes = teile[teile.length - 1] ?? '';
  if (!pfad.endsWith('/') && !letztes.includes('.'))
    return { umleiten: `/hilfe/${teile.map((t) => `${t}/`).join('')}${abfrage ? `?${abfrage}` : ''}`, status: 301 };
  const index = join('hilfe', ...teile, 'index.html');
  if (pfad.endsWith('/') && existsSync(join(webDir!, index))) return { datei: index };
  return nichtGefunden(webDir!, letztes);
}

/** Unbekannte Adresse (#841): die Seite „nicht gefunden“ nur für Seitenadressen – ein fehlendes Bild oder Skript bekommt den kurzen Text. */
function nichtGefunden(webDir: string, letztes: string): HilfeAntwort {
  const seite = join(webDir, 'hilfe', '404.html');
  return (!letztes.includes('.') || letztes.endsWith('.html')) && existsSync(seite) ? { fehlt: true, seite } : { fehlt: true };
}

/** Antwort für Fastify (reply mit @fastify/static). */
export function hilfeSenden(
  reply: {
    redirect(url: string, code: number): unknown;
    sendFile(p: string): unknown;
    code(c: number): { type(t: string): { send(b: string): unknown } };
  },
  a: HilfeAntwort,
) {
  if ('umleiten' in a) return reply.redirect(a.umleiten, a.status);
  if ('datei' in a) return reply.sendFile(a.datei);
  if (a.seite) return reply.code(404).type('text/html; charset=utf-8').send(readFileSync(a.seite, 'utf8'));
  return reply.code(404).type('text/plain; charset=utf-8').send(t('meldungen.hilfe.diese-seite-gibt-es'));
}
