/**
 * Rauchtests mit zwei Prozessen (QS-Runde 11/2026): eine schnelle Teilmenge von rauchtest.mjs gegen ein Ablago mit
 * `DMS_PROZESSE=2`. Seit #1309 nimmt Ablago ohne die Variable ab 4 Kernen und 8 GB zwei Prozesse; der volle Lauf in der
 * CI bleibt bei einem (vergleichbar mit früheren Läufen). Hier geht jede Anfrage reihum an einen der beiden Prozesse –
 * was einer schreibt, muss der andere beim nächsten Lesen sehen (Zwischenspeicher, Sitzungen, Einstellungen).
 *
 * Ausgewählt sind Bereiche, die schreiben und gleich danach lesen, in der Reihenfolge von rauchtest.mjs und zusammen in
 * etwa einer Minute: Einrichtung mit Neustart in den Verbund, Start und Suche, Werkbank (Einstellungen, Mappentypen),
 * Post und Erwähnungen. Der erste Test hier prüft, dass wirklich zwei Prozesse laufen.
 *
 *   DMS_URL=http://localhost:3000 DMS_DATENWURZEL=… DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/zwei-prozesse.mjs [fehlerordner]
 *
 * Erwartet wie rauchtest.mjs ein frisch gestartetes Ablago ohne Datenbank-Anbindung, hier mit `DMS_PROZESSE=2`.
 */
import assert from 'node:assert/strict';
import './einrichtung.mjs';
import { api, LENA, rauchtest, sitzung } from './hilfen.mjs';

rauchtest('Zwei Prozesse: der Verbund läuft mit DMS_PROZESSE=2', { als: LENA }, async () => {
  const cookie = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
  const last = (await api('GET', '/api/werkbank/systemlast', { cookie })).daten;
  assert.equal(last.grenzen?.prozesse?.wert, 2, JSON.stringify(last.grenzen?.prozesse));
  // Die Liste nennt dazu den Hauptprozess, der nur verteilt (Rolle „haupt“).
  const arbeitend = (last.prozesse ?? []).filter((p) => p.rolle !== 'haupt');
  assert.equal(arbeitend.length, 2, JSON.stringify(last.prozesse));
});

await import('./bereiche/start-und-suche.mjs');
await import('./bereiche/werkbank.mjs');
await import('./bereiche/werkbank-post.mjs');
await import('./bereiche/erwaehnen.mjs');
