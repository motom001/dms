# Kern (#961)

**Zweck:** Was alle Fachbereiche des Servers brauchen, an einer Stelle – damit Fachbereiche nur nach unten rufen.

- `kern.ts` – `Kern`: Repo (in einer Transaktion deren Repo), `inTransaktion`, `inEinemZug`, `danach`,
  `nachDerAntwort`, `ereignis` (Ausgangskorb), `system()` (Systemtypen nachschlagen), `typen()`, `zugriff(ich)`,
  `name`, `papierkorbTage`, `liesGanz`; `einstellungen`, `dateien`, `stand`.
- `historie.ts` – Historie einer Mappe **schreiben** (`kern.historie.schreibe`). Lesen bleibt bei den Mappen.
- `loeschprotokoll.ts` – Löschprotokoll **schreiben** (`kern.loeschprotokoll.schreibe` samt Einträgen). Lesen bleibt
  beim Löschen.
- `index.ts` – die einzige Tür. Von außen nur über sie importieren.

**Regeln**

- In den Kern kommt nur, was **alle** brauchen. Neues nur mit Begründung im Pull Request.
- Der Kern importiert **nichts** aus `dienst.ts`, Routen, `http/` oder Fachordnern – nur sich selbst, `shared/` und die
  Basis (Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler). Geprüft mit `npm run lint:abh`
  (`kern-nur-abwaerts`, `kern-nur-ueber-index` in `.dependency-cruiser.cjs`).
- Was er noch nicht selbst kann (Zugriff bilden, Systemtypen anlegen), bekommt er beim Zusammenbau vom Dienst.
- `kern.repo` bei jedem Aufruf neu holen, nie zwischenspeichern: Nur so landet, was ein Fachbereich in einer
  Transaktion schreibt, auch in dieser Transaktion.
- Neuer Code hier ohne Ausnahmen in `eslint-suppressions.json`.

Mehr im Entwicklerhandbuch unter *Aufbau → Kern*.
