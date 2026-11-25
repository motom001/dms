# Adding something new { #neues-einbauen }

Checklists for the most common extensions. Most gaps are already reported by `npm run typecheck` and the tests named here – the lists tell you where to look before they turn red. Where the files are is shown on the [map](aufbau.md).

## New page in the workbench { #neue-werkbank-seite }

All workbench pages are in **one** list: `EINTRAEGE` in `shared/src/werkbankansicht.ts` (#1281). Sidebar, permission in the interface (`darfSeite`), middle column, numbers, help and the tables in the administrator manual read from it.

1. **Entry in the list** `EINTRAEGE`, at the place where the page should appear in the sidebar:
    - `pfad` – at the same time address (`/werkbank/<pfad>`), identifier and administration permission;
    - `gruppe` – group of the sidebar (`ablage`, `benutzer`, `datenschutz`, `post`, `sichern`, `einstellungen`, `wartung`);
    - `ab` – from which level the page appears in the sidebar;
    - `hilfe` – key of the help location in `HILFE` (`shared/src/hilfe.ts`), for example `'werkbank.<pfad>': admin('<seite>/', '<Titel>')`;
    - if needed `mitte` (list in the middle), `auchMit` (further areas whose permission opens the page) and `zaehler` (number in the sidebar until the page has loaded – then `server/src/werkbank/werkbankzahlen.ts` delivers this number).
2. **Component** in the partial table of its group (`web/src/werkbank/rahmen/inhalt.tsx`, `inhalt-ablage.tsx` or `inhalt-betrieb.tsx`); `rahmen/seiten.ts` puts them together. An identifier the list does not know is reported by tsc.
3. **Building blocks instead of parts of your own:** actions with `Knopf` (special forms with `art="eigen"`), ways with `KnopfLink` or `Link`, labels with `Etikett`, inputs in `Feld`, plus `Reiter`, `Aufklapper`, `Zahl`, `Kachel` … ([design and building blocks](bausteine.md)). Classes of your own go into the stylesheet of the area, colours only via tokens, `z-index` only as a level `--ebene-…` ([style](stil.md#klassen)).
4. **Texts** de and en: `werkbank.bereich.<pfad>.name` and `.wann` in `shared/src/sprachen/<sprache>/werkbank/rahmen.json`, the other texts of the page in the partial file of its group ([where a new key belongs](texte.md#texte-und-sprachdateien)).
5. **Routes** of the page with `zugang: 'admin'` and one rule each in `REGELN` in `server/src/werkbank/verwaltungsbereiche.ts` (`R(…)`, with `auchMit` `S(…)`); see [new route](#neue-route).
6. **Phone:** if the page belongs to what people really do on the go, it goes into `HANDY_SCHWERPUNKT` after agreement; if it is for building things up and tedious on a phone, into `HANDY_BEQUEMER` (hint "Easier on a computer or tablet."). Both in `shared/src/werkbankansicht.ts`.
7. **Manual** de and en: a page in the administrator manual (`docs/handbuch/admin/docs/<seite>.md` and `docs-en/<seite>.md`) in the menu of **both** languages (`mkdocs.yml` and `mkdocs.en.yml`). The tables of the areas in `uebersicht.md` are rewritten by `python3 docs/handbuch/werkzeuge/werkbank_bereiche.py`.
8. **Anchors:** the entry in the sidebar carries `werkbank.bereich:<pfad>` by itself. Further targets for tours and tips are added as new anchors ([anchor points](entdecken.md#anker)) – never rename existing ones.
9. **Smoke test** in the matching area under `web/rauchtest/bereiche/` (for example `werkbank.mjs`) if the page brings a new way to a result ([smoke tests](loslegen.md#rauchtests-der-oberflache)).
10. **Check:** `npm run typecheck`, `npm run test:datei -w server -- test/werkbank-liste.test.ts` (texts, manual including menu, routes, counters) and `npm run test:datei -w web -- test/werkbank-liste.test.ts` (a component for every entry).

## New route { #neue-route }

1. **Place:** into the route file of the subject folder, `server/src/<ordner>/<ordner>.routen.ts`, as an entry of a function `(k: RoutenKontext) => Route[]`. Types from `http/routen-typen.ts`, helpers from `http/routen-hilfen.ts` and `http/routen-kontext.ts` – never from `http/routen.ts`. A new function goes at the end of the list `BEREICHE` in `http/routen.ts` ([registering new routes](stil.md#abhaengigkeiten-pruefen)).
2. **State the access:** `zugang: 'angemeldet'` is the normal case. `'admin'` means workbench: only in administration mode and only with a rule in `server/src/werkbank/verwaltungsbereiche.ts` – otherwise only people with "Full administration" may use it, and `verwaltungsmodus.test.ts` fails. Sensitive actions that need a fresh sign-in are additionally listed there in `heikleHandlung`. `'offen'` (without sign-in) only with a good reason: the route goes into the list `OFFEN` in `server/test/routen-liste.test.ts` with one sentence of justification.
3. **No business logic in the route:** the handler reads the input, gets the access (`await zg(a)`) and calls the subject service (`dienst.<fach>.…`). The subject service checks permissions via [checking permissions](fachbereiche.md#zugriff); understandable errors with `Fachfehler(status, t('meldungen.…'))`, texts in `shared/src/sprachen/<sprache>/meldungen/`.
4. **Data:** if the route needs a new method on the repo, it goes into the interface (`server/src/repo/schnittstelle/`) and into the same subject file of `repo/pg/` **and** `repo/speicher/` ([repos twice](server.md#muster)). New tables or columns only via a new migration in `server/migrations/`; never change existing migrations.
5. **Public API:** if the route should also be there for programs, it gets an entry in the table of `/api/v1` (`server/src/http/api-v1/tabelle-*.ts`, with a schema in `schemas-*.ts`); the OpenAPI description is made from it.
6. **Interface:** the request as a function in the module of the subject area under `web/src/api/` (via `anfrage()`); components call this function, not `fetch`.
7. **Tests:** a test under `server/test/`, in memory and – where something is stored – also against PostgreSQL ([tests with PostgreSQL](loslegen.md#tests-mit-postgresql-eigene-datenbank)). Also rewrite the route table: `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/routen-tabelle-charakter.test.ts`, then check the difference in `server/test/charakter/routen-tabelle.json` – the new route appears there as a line of its own with its access level. There is no longer a route count to raise (#1665).

## Before the pull request { #vor-dem-pull-request }

What every contribution brings along – tests, manual de and en, release snippet `docs/releases/neu/<branch>.md` – is under [Submitting a contribution](beitrag.md).
