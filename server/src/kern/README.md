# Kern (#961)

**Zweck:** Was alle Fachbereiche des Servers brauchen, an einer Stelle – damit Fachbereiche nur nach unten rufen.

- `kern.ts` – `Kern`: Repo (in einer Transaktion deren Repo), `inTransaktion`, `inEinemZug`, `danach`,
  `nachDerAntwort`, `ereignis` (Ausgangskorb), `system()` (Systemtypen nur nachschlagen, #963), `typen()`,
  `zugriff(ich)`, `name`, `papierkorbTage`, `paketVerwehrt`, `ablageortId`, `liesGanz`; `einstellungen`, `dateien`,
  `stand`.
- `anlaesse.ts` – Anschlusspunkte (#962) `mappeGeaendert`, `typGeaendert`, `typAngelegt`, `benutzerGespiegelt`: was
  sofort, in derselben Transaktion, zu einer Änderung gehört. Empfänger meldet nur der Dienst beim Zusammenbau an;
  `melde()` nur in einer Transaktion, kein `emit()`. Regeln im Kopf der Datei.
- `historie.ts` – Historie einer Mappe **schreiben** (`kern.historie.schreibe`). Lesen bleibt bei den Mappen.
- `loeschprotokoll.ts` – Löschprotokoll **schreiben** (`kern.loeschprotokoll.schreibe` samt Einträgen). Lesen bleibt
  beim Löschen.
- `index.ts` – die einzige Tür. Von außen nur über sie importieren.

**Regeln**

- In den Kern kommt nur, was **alle** brauchen. Neues nur mit Begründung im Pull Request.
- Der Kern importiert **nichts** aus `dienst.ts`, Routen, `http/` oder Fachordnern – nur sich selbst, `shared/` und die
  Basis (Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler). Geprüft mit `npm run lint:abh`
  (`kern-nur-abwaerts`, `kern-nur-ueber-index` in `.dependency-cruiser.cjs`).
- Was er noch nicht selbst kann (Zugriff bilden; Systemtypen anlegen als Rückfall, wenn beim Nachschlagen etwas
  fehlt – das Anlegen selbst ist die Systemausstattung, `server/src/systemausstattung/`), bekommt er beim Zusammenbau.
- `kern.repo` bei jedem Aufruf neu holen, nie zwischenspeichern: Nur so landet, was ein Fachbereich in einer
  Transaktion schreibt, auch in dieser Transaktion.
- Neuer Code hier ohne Ausnahmen in `eslint-suppressions.json`.

Mehr im Entwicklerhandbuch unter *Aufbau → Kern*.
