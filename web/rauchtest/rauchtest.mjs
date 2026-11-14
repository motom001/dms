/**
 * Rauchtests für die Oberfläche (#897): die wichtigsten Wege einmal im echten Browser.
 *
 * Erwartet ein frisch gestartetes Ablago ohne Datenbank-Anbindung (Einrichtungsmodus), wie im Job „pruefen“:
 * Der erste Test geht den Einrichtungsassistenten durch (die Datenbank legt er selbst an), danach legt das Skript
 * über die Schnittstelle ein paar Daten an (Beispiele, zwei Briefe in „Neue Post“, ein zweites Konto). Jeder
 * weitere Test öffnet einen eigenen Browser-Kontext und prüft
 *   - das sichtbare Ergebnis seines Wegs (Überschrift, Meldung, gespeicherter Wert),
 *   - keine Fehler in der Konsole und keine Fehler im Skript der Seite,
 *   - keine fehlgeschlagene Anfrage und keine Antwort ab 400 von Ablago (außer den beim Test erwarteten).
 *
 *   DMS_URL=http://localhost:3000 DMS_DATENWURZEL=… DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/rauchtest.mjs [fehlerordner] [musterordner]
 *
 * Ablago muss als Testbau gebaut sein (`VITE_MUSTER=1 npm run build`): Der Test „Musterseite der Bausteine“ (#967)
 * fotografiert /muster nach [musterordner] (Vorgabe rauchtest-muster) und prüft die Seite mit axe-core.
 *
 * Weitere Variablen: DB_NAME (Vorgabe dms_rauchtest), DB_BENUTZER (Vorgabe dms), DMS_EINRICHTUNGSCODE (statt der
 * Datei unter DMS_DATENWURZEL/geheim). Bei einem Fehler liegt ein Bild der Seite im Fehlerordner.
 *
 * Braucht Playwright mit Chromium (im Workflow: npm install --no-save playwright im Ordner web/rauchtest).
 * Gewartet wird immer auf Elemente oder Ereignisse, nie eine feste Zeit – sonst wackeln die Tests.
 * Neue Abläufe bekommen ihren Rauchtest im selben PR: einen Block `rauchtest(…)` in der Datei ihres Bereichs unter
 * bereiche/ ergänzen (Entwicklerhandbuch, Seite „Tests“).
 *
 * Aufbau (#1234): Diese Datei startet alle Bereiche nacheinander in fester Reihenfolge – sie teilen sich ein Ablago
 * und eine Datenbank, spätere Bereiche bauen auf dem Zustand der früheren auf. Gemeinsame Hilfen (Anmelden, Rahmen
 * `rauchtest`, Knopf-Wächter, Verwaltungsmodus) stehen in hilfen.mjs, axe und Tippflächen in muster.mjs, die
 * Einrichtung in einrichtung.mjs. Jeder Bereich bindet einrichtung.mjs zuerst ein und lässt sich gegen ein frisch
 * gestartetes Ablago auch allein starten, z. B. `node web/rauchtest/bereiche/pakete.mjs [fehlerordner]`. Nicht
 * `node --test` über den Ordner: Das startet die Dateien parallel gegen dasselbe Ablago.
 * Höchstens 400 Zeilen je Datei (ESLint max-lines) – ein wachsender Bereich wird geteilt und hier eingereiht.
 */

// Die Einrichtung zuerst, dann die Bereiche in der Reihenfolge, in der sie aufeinander aufbauen.
import './einrichtung.mjs';
import './bereiche/start-und-suche.mjs';
import './bereiche/pakete.mjs';
import './bereiche/werkbank.mjs';
import './bereiche/handy-und-tabellen.mjs';
import './bereiche/dokument-uebernehmen.mjs';
import './bereiche/bausteine-und-knoepfe.mjs';
import './bereiche/dreiteilung-und-systemzustand.mjs';
import './bereiche/werkbank-suche-und-archiv.mjs';
import './bereiche/aus-bausteinen.mjs';
import './bereiche/startbild-und-vorschlaege.mjs';
import './bereiche/automatisierungen.mjs';
