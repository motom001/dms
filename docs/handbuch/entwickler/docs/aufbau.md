# Aufbau

```
shared/           Fachmodell, Prüfregeln, Hilfe-Tabelle – von Server und Oberfläche genutzt
server/           Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen, Tests
web/              React-Oberfläche (Vite)
deploy/           Compose-Vorlagen für NAS und Server, Start-Skript und Probe für dms-komplett
docs/             Handbücher (MkDocs), Screenshot-Skript, Release-Notizen
docs/glossar.yml  Glossar – die eine Quelle für alle Begriffe (daraus entsteht die Seite „Begriffe“)
.github/          Workflows (Prüfen, Images, Release, Handbuch …), Dependabot, Vorlagen für Issues und PRs
```

Das DMS ist ein **modularer Monolith**: ein Prozess, eine Datenbank. Server und Oberfläche stecken zusammen in einem Image – als `dms` oder, mit PostgreSQL im selben Container, als `dms-komplett`. Wichtige Muster:

- **Repos doppelt:** Jede Datenzugriffs-Schnittstelle gibt es für PostgreSQL (`repo-pg.ts`, `pg…`-Funktionen) und für den Arbeitsspeicher (`repo-speicher.ts`, `speicher…`). Die meisten Tests laufen schnell im Arbeitsspeicher, die Tests mit `TEST_DATABASE_URL` decken PostgreSQL ab. Neue Funktionen brauchen beides, und beide müssen sich gleich verhalten.
- **Routen** stehen gesammelt in `server/src/routen.ts`, je mit `zugang: 'offen' | 'angemeldet' | 'admin'`. Zwei Merkmale kommen dazu: `api: true` macht eine Route zum Teil der öffentlichen API (Anmeldung auch mit API-Schlüssel); `konsole: true` erlaubt sie nur über den Befehl `dms` im Container. Die öffentliche API für Programme liegt unter `/api/v1` (`api-v1.ts`, OpenAPI).
- **Öffentliche Links ohne Anmeldung** gibt es bisher nur für die Abrufseite einer Auskunft (#455, `server/src/abruf.ts`, `web/src/abruf.tsx`): Schlüssel nur im Fragment (`/abruf#…`), in der Datenbank nur Hashes (SHA-256 für den Schlüssel, scrypt für den Code), Fehlversuche im Anmeldeschutz je IP und am Link, Download über ein Einmal-Ticket. Weitere Freigabelinks sollten diesem Muster folgen.
- **Migrationen** sind nummerierte SQL-Dateien in `server/migrations/`. Sie laufen beim Start in einer Transaktion und werden nie nachträglich geändert, sondern immer durch eine neue ergänzt.
- **Einstellungen** stehen als JSON je Schlüssel in der Tabelle `einstellungen`. `null` löscht einen Eintrag.
- **Hilfe:** Jedes ?-Symbol in der Oberfläche zeigt auf eine Stelle im Handbuch. Die Tabelle dazu steht in `shared/src/hilfe.ts`, und die CI prüft, dass jeder Anker existiert.
- **Sicherung und Wiederherstellung** sichern alle Tabellen außer dem Inhalt von `sitzungen` und `schema_migrationen` (`OHNE_INHALT` in `server/src/datenbankabzug.ts`). Eine neue Tabelle ist automatisch dabei. Daten außerhalb der Datenbank brauchen einen Gedanken: Wo liegen sie, und kommen sie mit?


## Baum über Verweise

Alles, was über Verweise an einer Mappe hängt, sammelt **ein** Modul – genutzt von der Auskunft nach Art. 15 DSGVO (#396) und von „Mappe mit allen verknüpften Mappen löschen“ (#424). Neue Funktionen, die „alles zu dieser Mappe“ brauchen, nehmen es statt eigener Schleifen.

- **Typen und Optionen:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = Mappen, die auf den Knoten verweisen, „nach unten“; `verweistAuf` = Mappen, auf die er verweist; `tiefe` 1–10; `max` bis 5000; `seitwaerts`; `ohneTypen`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, Hilfen `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithmus:** `server/src/baum.ts` – `sammleBaum(quelle, startId, optionen)`: Breitensuche, je Ebene ein Zugriff auf Verweise (`Repo.kantenVon`), Mappen und Lesbarkeit. Ohne `seitwaerts` geht ein Knoten nur in der Richtung weiter, über die er erreicht wurde (die Start-Mappe in alle gewählten). Kreise und mehrfache Wege landen in `auchUeber` und `kreise`, jeder Knoten steht einmal da. Über `max` hinaus: `abgeschnitten`.
- **Rechte:** Die `BaumQuelle` baut `Dienst.baumQuelle(zugriff)`; nur lesbare Mappen werden aufgenommen **und** weiterverfolgt, nicht lesbare zählen nur in `verborgen`. Zum Aufrufen: `await dienst.baum(startId, eingabe, zugriff)` (Benutzer und Rollen sind ohne `ohneTypen` ausgenommen), über HTTP `GET /api/v1/mappen/{id}/baum`.
- **Je Knoten:** `typ`, `titel`, `ebene`, `ueber` (Elternknoten, Richtung, Feld), `dokumente`, `aussen` (Verweise zu Mappen außerhalb des Baums je Richtung, nicht lesbare ohne Titel), `aufbewahrenBis`/`gesperrt` (Archivmodus #212) und `rechte` (CRUDP des Aufrufers).

Für #424 heißt das: 🔒 = `gesperrt`, ⛔ = `!rechte.D`, 🔗 = `haengtAuchAnderswo(k)` (der Knoten verweist noch auf eine Mappe außerhalb – nur den Verweis entfernen), und `wirdAnderswoGebraucht(k)` zeigt, dass eine Mappe außerhalb auf ihn verweist (Löschen würde dort einen Verweis kappen). Tests: `server/test/auskunft.test.ts` (Kreise, Rechte, Obergrenze, seitwärts).

Mehr Hintergrund im Administratorhandbuch: [Technik](https://motom001.github.io/dms/admin/aktuell/technik/) und [Entscheidungen](https://motom001.github.io/dms/admin/aktuell/entscheidungen/).
