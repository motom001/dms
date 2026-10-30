# Aufbau

```
shared/   Fachmodell, Prüfregeln, Hilfe-Tabelle – von Server und Oberfläche genutzt
server/   Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen, Tests
web/      React-Oberfläche (Vite)
deploy/   Compose-Vorlagen für NAS und Server
docs/     Handbücher (MkDocs), Screenshot-Skript, Release-Notizen
```

Das DMS ist ein **modularer Monolith**: ein Prozess, ein Image, eine Datenbank. Wichtige Muster:

- **Repos doppelt:** Jede Datenzugriffs-Schnittstelle gibt es für PostgreSQL (`repo-pg.ts`, `pg…`-Funktionen) und für den Arbeitsspeicher (`repo-speicher.ts`, `speicher…`). Die meisten Tests laufen schnell im Arbeitsspeicher, die Tests mit `TEST_DATABASE_URL` decken PostgreSQL ab. Neue Funktionen brauchen beides, und beide müssen sich gleich verhalten.
- **Routen** stehen gesammelt in `server/src/routen.ts`, je mit `zugang: 'offen' | 'angemeldet' | 'admin'`. Die öffentliche API für Programme liegt unter `/api/v1` (`api-v1.ts`, OpenAPI).
- **Migrationen** sind nummerierte SQL-Dateien in `server/migrations/`. Sie laufen beim Start in einer Transaktion und werden nie nachträglich geändert, sondern immer durch eine neue ergänzt.
- **Einstellungen** des Mandanten stehen als JSON je Schlüssel in der Tabelle `einstellungen`. `null` löscht einen Eintrag.
- **Hilfe:** Jedes ?-Symbol in der Oberfläche zeigt auf eine Stelle im Handbuch. Die Tabelle dazu steht in `shared/src/hilfe.ts`, und die CI prüft, dass jeder Anker existiert.
- **Sicherung und Wiederherstellung** sichern alle Tabellen. Eine neue Tabelle ist automatisch dabei. Daten außerhalb der Datenbank brauchen einen Gedanken: Wo liegen sie, und kommen sie mit?

Mehr Hintergrund im Administratorhandbuch: [Technik](https://motom001.github.io/dms/admin/aktuell/technik/) und [Entscheidungen](https://motom001.github.io/dms/admin/aktuell/entscheidungen/).
