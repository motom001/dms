# Neues einbauen { #neues-einbauen }

Checklisten für die häufigsten Erweiterungen. Was fehlt, melden meist schon `npm run typecheck` und die genannten Tests – die Listen sagen, wo man hinschaut, bevor sie rot werden. Wo die Dateien liegen, zeigt die [Karte](aufbau.md).

## Neue Seite in der Werkbank { #neue-werkbank-seite }

Alle Seiten der Werkbank stehen in **einer** Liste: `EINTRAEGE` in `shared/src/werkbankansicht.ts` (#1281). Leiste, Recht in der Oberfläche (`darfSeite`), Mitte, Zahlen, Hilfe und die Tabellen im Administratorhandbuch lesen daraus.

1. **Eintrag in der Liste** `EINTRAEGE`, an der Stelle, an der die Seite in der Leiste stehen soll:
    - `pfad` – zugleich Adresse (`/werkbank/<pfad>`), Kennung und Verwaltungsrecht;
    - `gruppe` – Gruppe der Leiste (`ablage`, `benutzer`, `datenschutz`, `post`, `sichern`, `einstellungen`, `wartung`);
    - `ab` – ab welcher Stufe die Seite in der Leiste steht;
    - `hilfe` – Schlüssel der Hilfestelle in `HILFE` (`shared/src/hilfe.ts`), etwa `'werkbank.<pfad>': admin('<seite>/', '<Titel>')`;
    - bei Bedarf `mitte` (Liste in der Mitte), `auchMit` (weitere Bereiche, deren Recht die Seite öffnet) und `zaehler` (Zahl in der Leiste, bis die Seite geladen ist – dann liefert `server/src/werkbank/werkbankzahlen.ts` diese Zahl).
2. **Komponente** in der Teiltabelle ihrer Gruppe (`web/src/werkbank/rahmen/inhalt.tsx`, `inhalt-ablage.tsx` oder `inhalt-betrieb.tsx`); `rahmen/seiten.ts` führt sie zusammen. Eine Kennung, die die Liste nicht kennt, meldet tsc.
3. **Bausteine statt eigener Teile:** Handlungen mit `Knopf` (Sonderformen mit `art="eigen"`), Wege mit `KnopfLink` bzw. `Link`, Kennzeichen mit `Etikett`, Eingaben in `Feld`, dazu `Reiter`, `Aufklapper`, `Zahl`, `Kachel` … ([Gestaltung und Bausteine](bausteine.md)). Eigene Klassen in die Stildatei des Bereichs, Farben nur über Tokens, `z-index` nur als Stufe `--ebene-…` ([Stil](stil.md#klassen)).
4. **Texte** de und en: `werkbank.bereich.<pfad>.name` und `.wann` in `shared/src/sprachen/<sprache>/werkbank/rahmen.json`, die übrigen Texte der Seite in die Teildatei ihrer Gruppe ([Wohin ein neuer Schlüssel gehört](texte.md#texte-und-sprachdateien)).
5. **Routen** der Seite mit `zugang: 'admin'` und je einer Regel in `REGELN` in `server/src/werkbank/verwaltungsbereiche.ts` (`R(…)`, bei `auchMit` `S(…)`); siehe [Neue Route](#neue-route).
6. **Handy:** Gehört die Seite zu dem, was man unterwegs wirklich tut, kommt sie nach Absprache in `HANDY_SCHWERPUNKT`; ist sie zum Aufbauen da und am Handy mühsam, in `HANDY_BEQUEMER` (Hinweis „Am Rechner oder Tablet bequemer“). Beides in `shared/src/werkbankansicht.ts`.
7. **Handbuch** de und en: eine Seite im Administratorhandbuch (`docs/handbuch/admin/docs/<seite>.md` und `docs-en/<seite>.md`) im Menü **beider** Sprachen (`mkdocs.yml` und `mkdocs.en.yml`). Die Tabellen der Bereiche in `uebersicht.md` schreibt `python3 docs/handbuch/werkzeuge/werkbank_bereiche.py` neu.
8. **Anker:** Der Eintrag in der Leiste trägt von selbst `werkbank.bereich:<pfad>`. Weitere Ziele für Rundgänge und Tipps kommen als neue Anker dazu ([Ankerpunkte](entdecken.md#anker)) – vorhandene nie umbenennen.
9. **Rauchtest** im passenden Bereich unter `web/rauchtest/bereiche/` (etwa `werkbank.mjs`), wenn die Seite einen neuen Weg zu einem Ergebnis bringt ([Rauchtests](loslegen.md#rauchtests-der-oberflache)).
10. **Prüfen:** `npm run typecheck`, `npm run test:datei -w server -- test/werkbank-liste.test.ts` (Texte, Handbuch samt Menü, Routen, Zähler) und `npm run test:datei -w web -- test/werkbank-liste.test.ts` (Komponente zu jedem Eintrag).

## Neue Route { #neue-route }

1. **Ort:** in die Routendatei des Fachordners, `server/src/<ordner>/<ordner>.routen.ts`, als Eintrag einer Funktion `(k: RoutenKontext) => Route[]`. Typen aus `http/routen-typen.ts`, Hilfen aus `http/routen-hilfen.ts` und `http/routen-kontext.ts` – nie aus `http/routen.ts`. Eine neue Funktion kommt ans Ende der Liste `BEREICHE` in `http/routen.ts` ([Neue Routen anmelden](stil.md#abhaengigkeiten-pruefen)).
2. **Zugang** angeben: `zugang: 'angemeldet'` ist der Normalfall. `'admin'` heißt Werkbank: nur im Verwaltungsmodus und nur mit einer Regel in `server/src/werkbank/verwaltungsbereiche.ts` – sonst dürfen sie nur Personen mit „Gesamte Verwaltung“, und `verwaltungsmodus.test.ts` schlägt fehl. Heikle Handlungen mit frischer Anmeldung kommen dort zusätzlich in `heikleHandlung`. `'offen'` (ohne Anmeldung) nur mit gutem Grund: Die Route kommt mit einem Satz Begründung in die Liste `OFFEN` in `server/test/routen-liste.test.ts`.
3. **Keine Fachlogik in der Route:** Der Handler liest die Eingaben, holt den Zugriff (`await zg(a)`) und ruft den Fachdienst (`dienst.<fach>.…`). Rechte prüft der Fachdienst über [Rechte prüfen](fachbereiche.md#zugriff); verständliche Fehler mit `Fachfehler(status, t('meldungen.…'))`, Texte in `shared/src/sprachen/<sprache>/meldungen/`.
4. **Daten:** Braucht die Route eine neue Methode am Repo, kommt sie in die Schnittstelle (`server/src/repo/schnittstelle/`) und in dieselbe Fachgebiet-Datei von `repo/pg/` **und** `repo/speicher/` ([Repos doppelt](server.md#muster)). Neue Tabellen oder Spalten nur über eine neue Migration in `server/migrations/`; bestehende Migrationen nie ändern.
5. **Öffentliche API:** Soll die Route auch für Programme da sein, bekommt sie einen Eintrag in der Tabelle von `/api/v1` (`server/src/http/api-v1/tabelle-*.ts`, mit Schema in `schemas-*.ts`); daraus entsteht die OpenAPI-Beschreibung.
6. **Oberfläche:** die Anfrage als Funktion im Modul des Fachbereichs unter `web/src/api/` (über `anfrage()`); Komponenten rufen diese Funktion, nicht `fetch`.
7. **Tests:** ein Test unter `server/test/`, im Arbeitsspeicher und – wo gespeichert wird – auch gegen PostgreSQL ([Tests mit PostgreSQL](loslegen.md#tests-mit-postgresql-eigene-datenbank)). Dazu die Routentabelle neu schreiben: `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/routen-tabelle-charakter.test.ts`, danach den Unterschied in `server/test/charakter/routen-tabelle.json` prüfen – die neue Route steht dort als eigene Zeile mit ihrer Zugriffsstufe. Eine Zahl der Routen gibt es nicht mehr zu erhöhen (#1665).

## Vor dem Pull Request { #vor-dem-pull-request }

Was jeder Beitrag mitbringt – Tests, Handbuch de und en, Release-Schnipsel `docs/releases/neu/<branch>.md` –, steht unter [Beitrag einreichen](beitrag.md).
