import { relative, sep } from 'node:path';
import { hilfeAntwort, hilfeSenden } from './hilfe';
import { t } from './sprache';

/**
 * Ausweichregel für die Oberfläche (#932) – gleich in allen Betriebsarten (normal, Einrichtungsmodus, Lasttestmodus).
 *
 * Seiten der Oberfläche (`/ablage/…`, `/werkbank/…`) gibt es nur im Browser: Ein unbekannter Pfad bekommt index.html.
 * Eine fehlende **Datei** der Oberfläche dagegen bekommt 404 – sonst lädt der Browser die Startseite als Skript oder
 * Stylesheet, meldet nur einen MIME-Fehler, und die Oberfläche erkennt nicht, dass sie zu einer anderen Version gehört.
 *
 * Als Datei gilt alles unter `/assets/` und jeder Pfad, dessen letzter Abschnitt auf eine Endung der Oberfläche endet.
 * Bewusst eine feste Liste statt „irgendein Punkt“: Seiten der Oberfläche enthalten Punkte (`/ablage/email/lena@example.org`,
 * Kennungen von Paketen), die keine Dateien sind.
 */
const ENDUNGEN = new Set(['js', 'mjs', 'cjs', 'css', 'map', 'json', 'webmanifest', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'wasm', 'txt', 'xml', 'bcmap', 'pfb']);

export function istDateipfad(url: string): boolean {
  const pfad = url.split('?', 1)[0].split('#', 1)[0];
  if (pfad === '/assets' || pfad.startsWith('/assets/')) return true;
  const letztes = pfad.slice(pfad.lastIndexOf('/') + 1);
  const punkt = letztes.lastIndexOf('.');
  return punkt >= 0 && ENDUNGEN.has(letztes.slice(punkt + 1).toLowerCase());
}

type Antwort = Parameters<typeof hilfeSenden>[0];

/** Für `setNotFoundHandler`: Handbuch (eigene Regeln), fehlende Datei (404) oder index.html. */
export function oberflaecheSenden(url: string, reply: Antwort, webDir: string | undefined) {
  const hilfe = hilfeAntwort(url, webDir);
  if (hilfe) return hilfeSenden(reply, hilfe);
  if (istDateipfad(url)) return reply.code(404).type('text/plain; charset=utf-8').send(t('meldungen.http.diese-datei-gibt-es'));
  return reply.sendFile('index.html');
}

/** Ein Jahr: Dateien unter /assets/ tragen ihren Inhalt im Namen (Vite) und ändern sich nie. */
export const ASSETS_CACHE = 'public, max-age=31536000, immutable';
/** Alles andere (index.html, Symbole, Manifest): jedes Mal beim Server nachfragen (ETag), nie ungefragt aus dem Cache. */
export const SEITE_CACHE = 'no-cache';

/**
 * Optionen für @fastify/static (#1198), gleich in allen Betriebsarten: `index.html` mit `Cache-Control: no-cache` – ein
 * Browser verwendet sie nie, ohne nachzufragen, und findet so immer die Dateien der laufenden Version –, Dateien unter
 * `/assets/` lange. Vorher setzte @fastify/static `public, max-age=0` für alles.
 */
export function statischeDateien(root: string) {
  return {
    cacheControl: false,
    setHeaders: (res: { setHeader(n: string, v: string): unknown } | { header(n: string, v: string): unknown }, pfad: string) => {
      const rel = relative(root, pfad);
      const wert = rel === 'assets' || rel.startsWith(`assets${sep}`) ? ASSETS_CACHE : SEITE_CACHE;
      if ('header' in res) res.header('cache-control', wert); else res.setHeader('cache-control', wert);
    },
  };
}
