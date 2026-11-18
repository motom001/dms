# Subject areas of the server { #fachbereiche }

For each subject folder in `server/src/`: what it contains, what it gets and whom it may call. The order of the layers is in the [map](aufbau.md#schichten).

## Core (#961) { #kern }

`server/src/kern/` holds what **all** subject areas need, with one door (`kern/index.ts`). The service builds it and passes it on as `dienst.kern`; building blocks such as packages will in future take only the core instead of the whole service.

- `kern.repo` – the repo; inside a transaction of the core, that transaction's repo. Fetch it on every call, never keep it – otherwise a package writes past the transaction.
- `kern.repoOhneTransaktion` – the repo outside any transaction (#1072, previously `grundRepo` via hooks). Only for what is valid across transactions and never belongs to a change: caches (the search's vectors), the event dispatcher, background follow-up work.
- `inTransaktion`, `inEinemZug` (retries on deadlock), `danach`, `nachDerAntwort`, `inEigenerTransaktion()`.
- `ereignis(art, daten, von?)` into the outbox, `mitAusloeser`, `ohneEreignisse`.
- `anlaesse` – the [hook points](#anschlusspunkte) for what happens immediately (#962, `kern/anlaesse.ts`).
- `system()` – **only looks up** the user, role and post folder types and the system roles (#963; if something is missing, the fallback creates the [system setup](#systemausstattung)), `typen()`, `zugriff(ich)`, `name(id)`, `papierkorbTage()`, `paketVerwehrt()`, `ablageortId()`, `liesGanz(sha)`.
- `historie.schreibe(…)` (`kern/historie.ts`) and `loeschprotokoll.schreibe(…)` (`kern/loeschprotokoll.ts`). **Reading** stays with folders and deletion respectively.
- `einstellungen`, `dateien`, `stand`.

**Rule:** only what everyone needs goes into the core – anything new only with a reason in the pull request. The core imports nothing from `dienst.ts`, routes or subject folders, only `shared/` and the base (repo, database, log, texts, settings, files, counters); `npm run lint:abh` checks this ([rules](stil.md#abhaengigkeiten-pruefen)). Since #1079 the service is only the assembly: routes, modules and tests call the subject services on its fields ([what stays](#dienst-rest)). What the core does not build itself (access – that is [checking permissions](#zugriff), one layer above –, the fallback of the system setup), it gets from the service when it is assembled.

### System setup (#963) { #systemausstattung }

`server/src/systemausstattung/` creates what every library needs: the system folder types “Role”, “User” and “Post” with their system fields and labels, the system roles and the views that ship with Ablago. It is a flow **above** the subject areas: `sicherstellen()` calls, one after the other, folder types (types and roles), views (own view of a type just created), post (the post views) and views (“Favourites”); it gets these steps from the service when it is assembled. Each step only creates what is missing.

- **At start-up** (`dienst.postSystemmappen.gleicheBenutzerAb`, leader only) and so after every restore, which restarts.
- **As a fallback**: if `kern.system()` does not find everything, it calls `systemausstattung.anlegen()` – for paths without a start (tests, restore, removing load test data). Concurrent calls share one run.
- Whoever only needs ids uses `kern.system()`; start-up calls `dienst.systemausstattung.sicherstellen()`. The core keeps the ids only if it looked them up outside a transaction.

### Hook points (#962) { #anschlusspunkte }

What belongs to a change **immediately** – in the same transaction, an error rolls everything back – runs through the typed hook points in `server/src/kern/anlaesse.ts`: `kern.anlaesse.mappeGeaendert`, `typGeaendert`, `typAngelegt`, `benutzerGespiegelt`. Whoever changes something calls `melde(…)`; what may happen **later** (at least once, with retries, errors only in the log) still goes into the outbox with `kern.ereignis(…)`.

- **Registered in one place:** `Dienst.schliesseEmpfaengerAn()` when assembling, in a fixed order; after that the list is closed. A different order is a pull request of its own (test `server/test/anlaesse.test.ts`).
- **One after the other:** the `EventEmitter` only serves as the list of receivers; `melde()` awaits each with `for … await`. `emit()` is forbidden and throws.
- **Only inside a transaction:** `melde()` throws outside `inTransaktion`/`inEinemZug`. A receiver may report another occasion (depth at most 2), never the one whose receiver is running.
- **Receivers** only do database work via `kern.repo` and `kern.danach(…)` – on a deadlock `inEinemZug` repeats the whole change including the receivers. No caches, mails or files directly.
- **Immediate** are only the receivers that were already called directly before. Anything new goes into the outbox.

Occasion → receivers (in order; subject area.task):

<!-- anlaesse:anfang (erzeugt von server/test/anlaesse.test.ts) -->
- `mappeGeaendert` → 1. `mappentypen.passung` 2. `aufgaben.erwaehnungen` 3. `aufgaben.fristen` 4. `post.aufgaben`
- `typGeaendert` → 1. `sichten.umbenennen` 2. `sichten.teile` 3. `mappen.titel` 4. `mappentypen.passung` 5. `aufgaben.fristen`
- `typAngelegt` → 1. `sichten.eigeneSicht`
- `benutzerGespiegelt` → 1. `aufgaben.abwesenheit`
<!-- anlaesse:ende -->

## Search (#964) { #suche }

The first subject area with its own business logic in its subject folder (trial run of the target structure): `server/src/suche/suche.dienst.ts` with the class `SucheDienst` – fuzzy search (typos, words with the same meaning, word index), vectors for documents and similar documents. The service builds it as `dienst.suche`; whoever searches calls it there (also `dienst.suche.vektorAnbieter`).

- **Door:** `suche/index.ts`; only `routen.ts` fetches the routes (`suche.routen.ts`) directly.
- **Gets the core**, not the whole service (`kern.repoOhneTransaktion` for the vector cache), plus [permission checking](#zugriff) (`lesbare`, `pruefeRecht`) and a `SucheAnschluss` with `konten` (service account of a package).
- **Downwards only:** search (layer 3) imports itself, lower subject folders and the core (each via `index.ts`), `shared/`, the base and `vektoren.ts` – checked with the rule `fachordner` ([rules](stil.md#abhaengigkeiten-pruefen)). `suche/vektoren.ts` (in the folder since #1278) imports nothing itself and has no door (`OHNE_TUER`): the package runner also reads a package's vectors with it and imports the file directly, not `suche/index.ts`.
- **Still in the service:** the search in the folder list (`listeMappen`). Since #1078 `vektorNachlauf` lives with the [events](#ereignisse).


## Checking permissions (#1072) { #zugriff }

`server/src/zugriff/zugriff.dienst.ts` with the class `ZugriffDienst` checks who may do what – in one place: `zugriff(ich)` once per request (people by the rules on the folder type, package service accounts by their confirmed permissions, system accounts by their role, read access for a limited time), `rechteAn`, `rechteAnVielen`, `pruefeRecht`, `lesbare`, `mitPasswortRecht`, `sichtbarFuer`, `kannLesen`, `wasSieht`, `mappeVon`. The service builds it as `dienst.rechtepruefung`; routes and modules call it there.

- **Door:** `zugriff/index.ts` (plus `maskiert` and `NICHT_SICHTBAR` for titles of folders the user cannot read).
- **Gets the core** and a `ZugriffAnschluss` from the service: `kiSperre` (AI setting of packages) and `konten`.
- **Layer 1:** imports only itself, the core, `shared/`, the base and `messung.ts`. Subject folders above get the `ZugriffDienst` when assembled (like search) and import it via `zugriff/index.ts`. The core does not import it; `kern.zugriff(ich)` calls what the service passes in.
- Since #1078 `regulaerSichtbarFuer` lives with the [tasks](#aufgaben) (`ohne-leserecht.ts`). Since #1076 the Workbench pages for permissions live in [permissions](#berechtigungen). Since #1073 `paketSiehtNicht` lives with the [folder types](#mappentypen) (`pakete-am-typ.ts`).

## Folder types (#1073) { #mappentypen }

`server/src/mappentypen/` (layer 2) gathers what makes up a folder type – one class per topic, each getting the core; the service builds them and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `mappentypen.dienst.ts` | `MappentypenDienst` (`dienst.mappentypen`) | `listeTypen`, `typenFuer`, `rechteUebersicht`, `legeTypAn`, `aendereTyp`, `loescheTyp`, `belegteTypen`, `ausDokumentVon`, `typErkennungen` |
| `eingabe.ts` | – | cleaning input: `bereinigeTyp`, `bereinigeFeld`, `behalte…`, `liesStand` |
| `passung.ts` | `Passung` (`dienst.passung`) | `pruefePassung`, `passungFuer`, `pruefeUnpassende`, `passungNachziehen` |
| `nummernkreise.ts` | `Nummernkreise` (`dienst.nummernkreise`) | number ranges (#171), `ARCHIV_KREIS` |
| `systemtypen.ts` | `Systemtypen` (`dienst.systemtypen`) | `sichereSystemtypen` (step of the [system setup](#systemausstattung)), `benutzerspiegel`, `weitereRollen`, `ablageortTyp`, trail in administration mode |
| `pakete-am-typ.ts` | `TypPakete` (`dienst.typpakete`) | `paketeAmTyp`, `setzePaketVerwehrt`, `paketSiehtNicht` |

- **Door:** `mappentypen/index.ts`; only `routen.ts` loads the routes (`mappentypen.routen.ts`) directly.
- **Gets the core**, `TypPakete` and `Systemtypen` also the [permission check](#zugriff), and per class a connector for what is still in the service (stamp, recognition and permissions on the type, tasks, titles, jobs, writing system folders).
- Since #1078 `ausPostZiele` (#937) lives in `mappentypen.dienst.ts`, the AI approval of folder types (#796) in `ki-typen.ts` (`KiTypen`, `dienst.ki`). Since #1077 the stamp on the type (`mitStempel`) is worked out by [outgoing](#ausgang), checking and saving it by the stamp templates in [editing PDFs](#pdf-bearbeiten) – both through the connector. Since #1076 `berechtigungenAusEingabe` lives in [permissions](#berechtigungen) and still comes through the connector. Since #1074 `titel` lives with the [folders](#mappen) (`titel.ts`).

## Folders (#1074) { #mappen }

`server/src/mappen/` (layer 2) gathers what makes up a single folder – one class per topic, each getting the core; the service builds them and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `mappen.dienst.ts` | `MappenDienst` (`dienst.mappen`) | `holeMappe`, `legeMappeAn`, `aendereMappe`, `verweisende`, `listeMappen`, `notizen`, `setzeFavorit`, `gesehen`, `persoenlicheEinstellungen` |
| `eingaben.ts` | `MappenEingaben` (`dienst.mappenEingaben`) | `pruefeWerte`, `unpassendeFormate`, selection filters, “follows from” (`folgen`, `folgeVorschlaege`), `rechteVorschau`, `feldkonflikte`; `bereinigeWerte` |
| `titel.ts` | `MappenTitel` (`dienst.mappenTitel`) | `aktualisiereTitel`, `titelVorab`, `titelNachziehen` and further maintenance at start-up, `absenderBereinigen` |
| `historie.ts` | `MappenHistorie` (`dienst.mappenHistorie`) | `historie`, `notiereAbruf`, `historieTage`; `notiere` writes via `kern.historie` |
| `passwortfelder.ts` | `Passwortfelder` (`dienst.passwortfelder`) | `zeigePasswort`, `entschluesselePasswoerter`, `unlesbarePasswoerter` |
| `archiv.ts` | `MappenArchiv` (`dienst.mappenArchiv`) | archive number (#345), archive mode (#212: `darfWeg`, `archivVorschau`), `pruefeDateien` |

- **Door:** `mappen/index.ts`; only `routen.ts` loads the routes (`mappen.routen.ts`) directly. The input helpers for folder types stay in `mappentypen/eingabe.ts`.
- **Gets the core**, `MappenDienst`, `MappenEingaben` and `MappenArchiv` also the [permission check](#zugriff), and per class a connector for what is still in the service or comes through it (accounts, tasks without read permission, archive version and PDF protection from the [documents](#dokumente), data protection, `loeschPruefung`, `meldeVerknuepft`, key, labels, jobs).
- **Immediate work:** `legeMappeAn` and `aendereMappe` report `kern.anlaesse.mappeGeaendert` at the end of their transaction – the [hook points](#anschlusspunkte) and their order are unchanged.
- Since #1078 writing notes lives in `notizen.ts` (`MappenNotizen`, `dienst.mappenNotizen`; mentions and translations through the connector). Deleting and the Bin live in [deleting](#loeschen), tasks and deadlines in [tasks](#aufgaben), `meldeVerknuepft` with the [events](#ereignisse) – all still through the connector.

## Documents (#1075) { #dokumente }

`server/src/dokumente/` (layer 2) gathers everything about the files in a folder – one class per topic, each getting the core; the service builds them (`baueDokumente()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `dokumente.dienst.ts` | `DokumenteDienst` (`dienst.dokumente`) | `ladeHoch`, `loescheDokument`, `holeDokument`, `dokumentInhalt`, `textAusDatei`, connecting text recognition and previews, `neueDateien`, `raeumeAuf`; `dateiname`, `erkenneAnzeigbar` |
| `versionen.ts` | `DokumentVersionen` (`dienst.dokumentVersionen`) | `ersetzeDokument`, `holeVersionZurueck`, `nachNeuerVersion`, `versionen`, `versionInhalt`, `beruehre` |
| `anlagen.ts` | `DokumentAnlagen` (`dienst.dokumentAnlagen`) | Enclosures (#998): `liste`, `haengeAn` (“As enclosure to …”), `loese` (“Make it a document of its own”), `sortiere`, `benenne`, `alsAnlagen` (when splitting a post); going along is done by the repo (`verschiebeDokument`), `loescheDokument` and the bin |
| `umwandeln.ts` | `DokumentUmwandlung` (`dienst.dokumentUmwandlung`) | converting files (#577): `nachFassung`, `umwandelPaketDa`, `setzeFassung`, `fassungVon`, `umwandlungStand` |
| `archivfassung.ts` | `DokumentArchivfassung` (`dienst.dokumentArchiv`) | archive version (#631): `archivNachVolltext`, `archivPaketDa`, `setzeArchivfassung`, `wortpositionen`, `archivStand` |
| `geschuetzte-pdf.ts` | `GeschuetztePdfs` (`dienst.geschuetztePdfs`) | protected PDFs (#827): `entsperreDokument`, `nachEntsperren`, `mitPdfSchutz` |
| `fehlende-dateien.ts` | `FehlendeDateien` (`dienst.dateienFehlen`) | missing files (#877): `merkeFehlendeDatei`, `fehlendeDateien`, `dokumenteOhneDatei`, `pruefeVorhanden` |

- **Door:** `dokumente/index.ts`; only `routen.ts` loads the routes (`dokumente.routen.ts`, since #1278 with the parts `dokumente-*.routen.ts`) directly. The technology of the versions (`dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`) stays outside and is a tool for subject folders (see [layers](aufbau.md#schichten)).
- **Gets the core** and the classes of this folder it calls, and per class a connector for what is still in the service or would run in a circle (event and titles – `kern.ereignis`, `mappenTitel` –, archive mode, shrinking, full text, jobs for packages, package settings, folder types, text recognition).
- **Order:** `ladeHoch` writes history, “last changed”, document, full text and `dokument.hochgeladen` in one transaction; preview, converting and unlocking run afterwards. `nachFassung`, `nachEntsperren`, `archivNachVolltext` and `nachNeuerVersion` are unchanged and called from the same places.
- Since #1078 `entsperrtZu` lives in `geschuetzte-pdf.ts`. Since #1077 editing PDFs, shrinking and redacting live in [editing PDFs](#pdf-bearbeiten). Since #1076 the documents call the [full text](#volltext) (`volltextFertig`, `volltextAn`) through their connector on the service.

## Views (#1076) { #sichten }

`server/src/sichten/` (layer 3) gathers the views of the Library – one class per topic, each getting the core; the service builds them (`baueSichtenUndVolltext()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `sichten.dienst.ts` | `SichtenDienst` (`dienst.sichten`) | `seite`, `trefferIds`, `zaehler`, `zaehlerRahmen`, `zaehlerAbruf` (#625), `ablageStand` (#919), `beiAenderung`, `aktualisiereStatistik`; the caches of the counts, `sortierungAus` |
| `verwalten.ts` | `SichtenVerwaltung` (`dienst.sichtenVerwaltung`) | `listeSichten`, `verborgeneSichten` (#148), `sichtTestlauf`, create, change (#917), delete, order, move, `sichtVorschau`, `sichtFuerTyp`, `belegung` |
| `systemsichten.ts` | `Systemsichten` (`dienst.systemsichten`) | creating and looking up “New post”, “Received”, “Sent” (#192) and “Favourites” (#725) |

- **Door:** `sichten/index.ts`; only `routen.ts` loads the routes (`sichten.routen.ts`) directly.
- **Gets the core**, `SichtenDienst` also the [permission check](#zugriff), the [folders](#mappen) and the [search](#suche), and a connector for what is still in the service (validity of the counts – `mindestensMs` stays on the service –, tasks without recipient and without read permission, dates, accounts).
- **Counts:** the caches hang on the same states as before (folder state or household state, #742, #918); the caches of the dates stay with the tasks in the service.
- **Immediate:** the service still registers the receivers `sichten.umbenennen` and `sichten.eigeneSicht` at the [connection points](#anschlusspunkte), in unchanged order; `sichten.teile` (#1031) takes a type out of the views when "Is part of another folder" is switched on and gives it its view back when it is switched off.
- **Parts (#1031, `shared/src/teile.ts`):** `klauselnFuer` leaves out part types – so they are missing from every view and its counts; the advanced search likewise. With a search, `SichtenDienst.seite` first searches the part types (same term, same variants, **same read filter**, at most `TEIL_TREFFER_MAX`) and hands the parent folders to the repo as `auchIds`: they count as hits there, while type, conditions and read filter still apply. The hit is in `ausschnitte[id].teil`.
- **Show in the general search (#1220, `inSuche` on the folder type, migration 116):** `suchTypen()` in `sichten.dienst.ts` leaves out types with `inSuche: false` in the advanced search **without** a chosen type (which is also the search from the header, including similar hits); with a chosen type they count. `FragenAnDieAblage.ausschnitte` never uses them as a source. Views, choice and link fields (`feld:`/`typ:`), API and export are unaffected. `null` = default (yes); a package update only sets `inSuche` while it is `null` (`typAngabenNeu`).

## Permissions (#1076) { #berechtigungen }

`server/src/berechtigungen/berechtigungen.dienst.ts` with the class `BerechtigungenDienst` (`dienst.berechtigungen`) is the Workbench page for permissions (#123–#127): `berechtigungenListe`, `niemandLesbar`, `setzeBerechtigungen` (with `pruefeBerechtigungen` and `protokolliereBerechtigungen`), `berechtigungenAusEingabe` (#142), `kopiereRegel`, `testlauf` (#125, #710, #798) and `laufwerkMappe` (#346). What someone may do is still worked out by the [permission check](#zugriff).

- **Door:** `berechtigungen/index.ts`; there are no own routes.
- **Gets the core**, the permission check and a connector with the accounts.
- **Layer 2:** needs only the core and the permission check; the [folder types](#mappentypen) (also layer 2) check the rules with it when a type is saved – today still through their connector on the service.

## Full text (#1076) { #volltext }

`server/src/volltext/` (layer 3, above the [documents](#dokumente)):

| File | Class (in the service) | Content |
|---|---|---|
| `volltext.dienst.ts` | `VolltextDienst` (`dienst.volltexte`) | `beiVolltextFertig`, `volltextFertig`, `volltextAusgelassen` (#946), `volltextAn`, catching up and recreating (#458), text recognition as a package (#459), `nachEreignisAufruf`, `nachTexterkennungsEreignis`, `volltext`, `schreibeVolltext`, `setzeDokumentSprache`, `teilenHinweisAus`; `VOLLTEXT_MAX`, `VolltextMeldung`, `EreignisAufruf` |
| `aus-paketen.ts` | `VolltextAusPaketen` (`dienst.volltextAusPaketen`) | full text from packages (#614): `volltextPaketDa`, `paketWegFuerDateien`, `pruefeVolltextRecht`, `nachVolltextEreignis` |

- **Door:** `volltext/index.ts`. Which package is responsible for a file type is still worked out by `paketvolltext.ts` (a tool, also for the documents).
- **Gets the core** and the documents (text recognition, converting, archive version), plus a connector for the event (`kern.ereignis`), jobs, `paketVolltext` and the off-site backup.
- **Order:** `volltextFertig` first puts `volltext.fertig` into the outbox, then reports to the archive version and only with text calls the listeners (recognition) one after the other; `nachTexterkennungsEreignis` hands on as before to converting, archive version, full text from packages and backup.

## Post (#1077) { #post }

`server/src/post/` (layer 3) groups everything that comes in – one class per topic that gets the core; the service builds them (`bauePdfPostAusgang()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `post.dienst.ts` | `PostDienst` (`dienst.post`) | `legePostAn`, `ordneZu` (#192), `automatischZuordnen`, `automatikRueckgaengig` (#337), `postAufgaben` (completes “post for you”; since #1001 the automation creates it) |
| `aufloesen.ts` | `PostAufloesen` (`dienst.postAufloesen`) | dissolving and splitting off post (#934, #936): `loesePostAuf`, `trennePostAb`, `verschiebeInRegister` |
| `systemmappen.ts` | `PostSystemmappen` (`dienst.postSystemmappen`) | `schreibeSystemMappe`, `spiegleBenutzer`, `gleicheBenutzerAb`, roles, system accounts (#673); `SystemkontoEintrag` |
| `eingangskanaele.ts` | `Eingangskanaele` (`dienst.eingangskanaele`) | what inbox folders and mailboxes need (#195, #196), identical files and `fundstellen` (#333); `Fundstelle` |
| `foto.ts` | `PostFotos` (`dienst.postFotos`) | photographing post (#490): `postAusFotos`, `fotosAnMappe`, `legePostZusammen` |
| `leerseiten.ts` | `PostLeerseiten` (`dienst.postLeerseiten`) | blank pages (#997): `lies`, `markiere` (packages with `dms:leerseiten` only), `waehleSeite` (people only); when taking over `plane` (before moving) and `lasseWeg` (new version, original kept as an earlier version) |

- **Door:** `post/index.ts`; only `routen.ts` loads the mailbox routes (`post.routen.ts`) directly. Since #1073 `wandleZuPost` and `ergaenzeSystemfelder` live with the [folder types](#mappentypen).
- **Gets the core**, [checking permissions](#zugriff), [folder types](#mappentypen), [folders](#mappen), [documents](#dokumente) and the classes of this folder, `PostFotos` also [editing PDFs](#pdf-bearbeiten). Through the connector: event (`kern.ereignis`), `meldeVerknuepft`, tasks, accounts, fit, system setup, deleting folders and `sichereZuordnung` from `erkennung.ts` (recognition still gets the whole service and so does not sit below layer 3).
- **Order:** `legePostAn` writes folder, history, title, `post.angelegt` and the links in one transaction (since #1001 the automation creates the “post for you” task afterwards – When `mappe.geaendert` with `angelegt`); the receiver `post.aufgaben` at the connection point `mappeGeaendert` stays last in line and calls `post.postAufgaben`.

## Outgoing (#1077) { #ausgang }

`server/src/ausgang/` (layer 3) groups the [routes to the outside](nach-draussen.md#wege-nach-draussen) on which files and data leave Ablago – download, email, export, WebDAV drive – and their **shared checkpoint** (#723):

| File | Class (in the service) | Content |
|---|---|---|
| `pruefstelle.ts` | – | the rule “R means view, E means take along” (formerly `ausgang.ts`): `mitnehmbar`, `pruefeAlle`, messages |
| `ausgang.dienst.ts` | `AusgangDienst` (`dienst.ausgang`) | `exportierbar` (#294), `mitnehmbar`, `pruefeAusgang`; stamps (`mitStempel`, `stempelPlan`, `laufwerkStempel`, `laufwerkAusgabe`), `notiereWeitergabe`, original or archive version, `dokumentFuerAusgabe`, `fassungFuerAusgabe`, `gestempelteSeiten` (#799) |
| `email.ts` | `AusgangEmail` (`dienst.ausgangEmail`) | `versendeMappen`, `versendeMappe` (#58, #151), `emailKopf` (also for access requests) |
| `export.ts` | `AusgangExport` (`dienst.ausgangExport`) | `exportiere` (#152, #153) |

- **Door:** `ausgang/index.ts`; only `routen.ts` loads the routes (`ausgang.routen.ts`) directly.
- **One checkpoint:** every route asks `dienst.ausgang.pruefeAusgang` or `dienst.ausgang.mitnehmbar` – routes (`http/routen-kontext.ts`, `sichten.routen.ts`), `webdav/webdav-basis.ts` and also email and export in this folder (through their connector). `ausgang.test.ts` replaces both on `dienst.ausgang` and checks that download, email (one, several), export and drive ask them. A new route to the outside asks them before anything else happens.
- **Gets the core**, checking permissions, folder types, folders, documents, the [views](#sichten), the stamp templates ([editing PDFs](#pdf-bearbeiten)) and – for email – the system folders of [post](#post); `entsperrtZu` through the connector.

## Editing PDFs (#1077) { #pdf-bearbeiten }

`server/src/pdf-bearbeiten/` (layer 3) is the business logic around PDFs; the [PDF place](pdf.md#pdf-stelle) `pdf/` with pdf-lib stays technology and unchanged:

| File | Class (in the service) | Content |
|---|---|---|
| `pdf-bearbeiten.dienst.ts` | `PdfBearbeiten` (`dienst.pdfBearbeiten`) | page images, `seiteAlsGraubild` (#338), `pdfSeiten`, `bearbeitePdf` (split, for post one post per part, #335), `fuegePdfZusammen` |
| `verkleinern.ts` | `PdfVerkleinern` (`dienst.pdfVerkleinern`) | shrinking PDFs (#393): preview, on a document, automatically, large documents; `VERKLEINERN_STANDARD`, `GROSSE_MAX` |
| `schwaerzen.ts` | `Schwaerzen` (`dienst.schwaerzen`) | redacting (#392, #459), page images also of the archive version (#934) |
| `stempelvorlagen.ts` | `Stempelvorlagen` (`dienst.stempelvorlagen`) | stamp templates and the stamp per folder type (#394) |

- **Door:** `pdf-bearbeiten/index.ts`; the routes live with the documents.
- **Why a folder of its own:** `pdf/` is exempt from the `fachordner` rule (`TECHNIK`), runs in the worker pool and is imported by the documents (layer 2). Classes with core, folders and documents there would have weakened the rule and built a cycle through `pdf/index.ts`.
- **Gets the core**, checking permissions, folders and documents. Post (new post when splitting, system folder, “post for you”) comes through the connector on the service – `post/` appends photos with `pdfVon`, the other way round would run in a circle.

## Events (#1078) { #ereignisse }

`server/src/ereignisse/` (**layer 2**) passes on what the core raises – the outbox itself (`kern.ereignis`) belongs to the core:

| File | Class (in the service) | Content |
|---|---|---|
| `ereignisse.dienst.ts` | `EreignisseDienst` (`dienst.ereignisseDienst`) | `neueAufgabe`, `meldeVerknuepft` (#670), `ereignisAnPakete` (#686 only with read permission, #796 AI block), `auftrag`, `vektorNachlauf` (#442) |
| `automatisierung.ts` | `Automatisierungshilfen` (`dienst.automatisierungshilfen`) | `automatisierungKontext`, `mitgliederDerRolle`, `trifftTeile`, `lesbareTitel`, `datumVon`, `mappenMitDatum` (#674, #712) |

- **Why layer 2:** many need the events, folders and documents too; they themselves need only the core, the [permission check](#zugriff) and the packages on the folder type including the AI approval ([folder types](#mappentypen)). Text recognition ([full text](#volltext)) and roles ([post](#post)) come through the connector.
- The service registers the `pakete` consumer with the distributor; raising events (`kern.ereignis`) and the package runner's wake-up (`ereignisWecker`) come through the connector.
- **Door:** `ereignisse/index.ts`, imported as `ereignisse/index` – next to the folder lies `ereignisse.ts` (the catalogue's distributor), as with `pakete/index`.

## Tasks (#1078) { #aufgaben }

`server/src/aufgaben/` (layer 3) bundles everything around To dos; the service builds the classes (`baueAufgaben()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `aufgaben.dienst.ts` | `AufgabenDienst` (`dienst.aufgaben`) | `pruefeEmpfaenger`, mentions (#56, #81), approval for favourites (#506), `aufgabeAusAutomatisierung` (#676, #724), `erledigeNachAnlass` |
| `vertretung.ts` | `AufgabenVertretung` (`dienst.vertretung`) | deputies (#78), assign, complete, pass on (also in bulk, #415), `abwesenheitGeaendert`, `meineAufgaben` |
| `ohne-leserecht.ts` | `OhneLeserecht` (`dienst.ohneLeserecht`) | tasks for people without read permission, cases, temporary read permission (#798, #958) |
| `fristen.ts` | `Fristen` (`dienst.fristen`) | deadlines, dates with their cache, follow-up date (#129–#133, #528, #725); the daily run calls the due folder runs |
| `ohne-empfaenger.ts` | `OhneEmpfaenger` (`dienst.ohneEmpfaenger`) | everyday user (#719), notifying favourites (#422) |
| `ablaeufe.ts` | `MappenAblaeufe` (`dienst.ablaeufe`) | [automation templates and folder runs](ereignisse.md#ablaufvorlagen) (#1044): apply, run planned ones (rights at run time), workbench, templates from packages |

- **Gets the core** and `AufgabenTeile` (permission check, history and folders, events, roles from [post](#post) and each other); through the connector the event (`kern.ereignis`), accounts and the validity of the counts.
- The receivers at the [connection points](#anschlusspunkte) are unchanged; they call `aufgaben.pruefeErwaehnungen`, `fristen.fristenAbgleichen` and `vertretung.abwesenheitGeaendert` only when triggered – tests replace them there.

## Deleting (#1078) { #loeschen }

`server/src/loeschen/` (layer 3); the service builds the classes (`baueLoeschen()`):

| File | Class (in the service) | Content |
|---|---|---|
| `loeschen.dienst.ts` | `LoeschenDienst` (`dienst.loeschen`) | `loeschPruefung` (#79), `loescheMappe`, `loescheMappen` (#150), `entferneMappenEndgueltig` |
| `papierkorb.ts` | `Papierkorb` (`dienst.papierkorbVerwaltung`) | Bin (#43, #344, #936): restore, delete permanently, empty, clean up |
| `loeschprotokoll.ts` | `LoeschprotokollVerwaltung` (`dienst.loeschprotokollVerwaltung`) | reading and managing the deletion log (#470); it is **written** in the [core](#kern) |
| `mit-verknuepften.ts` | `MitVerknuepften` (`dienst.mitVerknuepften`) | [tree](#baum-uber-verweise) and deleting with linked folders (#396, #424) |
| `beispiele.ts` | `BeispielMappen` (`dienst.beispielMappen`) | example folders from packages (#878) |

- **Gets the core** and `LoeschenTeile` (permission check, fit, history, documents, outgoing, views, system folders and each other); event (`kern.ereignis`), `aktualisiereTitel` (`mappenTitel`) and accounts through the connector.
- **Parts (#1031):** `loescheMappe` takes the parts of a folder along (`loescheMitTeilen`: R and D on every part, otherwise 403 with the number; bin, history, events and deletion log with the way `teile` in one transaction, operation = id of the folder). The bin restores them with it and deletes them permanently with it; "with linked folders" refuses if a part of a deleted folder would remain.

## Data protection (#1078) { #datenschutz }

`server/src/datenschutz/` (layer 3); the service builds the classes (`baueDatenschutz()`):

| File | Class (in the service) | Content |
|---|---|---|
| `datenschutz.dienst.ts` | `DatenschutzDienst` (`dienst.datenschutzDienst`) | subject access request under Art. 15 GDPR (#396, #472, #668), load test data (#248) |
| `vollexport.ts` | `VollexportQuellen` (`dienst.vollexport`) | data sources for the full export (#254) and personal export (#255) |
| `zustellen.ts` | `AuskunftZustellen` (`dienst.auskunftZustellen`) | e-mail and retrieval links with retrieval code (#455), "Export my data" |

- **Gets the core** and `DatenschutzTeile` (permission check, folders, documents, views, events, tasks, deleting and each other); accounts, short-term state, vault and the export of automations through the connector.

## Workbench (#1078) { #werkbank }

`server/src/werkbank/werkbank.dienst.ts` with `WerkbankDienst` (`dienst.werkbank`, layer 3, only the core): the Workbench view (#281, `werkbankAnsicht`, `setzeWerkbankAnsicht`) and the Library attributes (#1032, `merkmale`, `setzeMerkmale`; setting `merkmale`). They are read everywhere via `kern.merkmale()` – also in `zugriff.aufloesung` for the conditions of permissions, views and automations.

**New page in the Workbench (#1281):** all pages are in one list, `EINTRAEGE` in `shared/src/werkbankansicht.ts`. What a new page needs is a checklist under [New page in the workbench](checklisten.md#neue-werkbank-seite).

**Display conditions (#1033):** the evaluation lives in `shared/src/anzeige.ts` (`anzeigestand`, `pruefeMitAnzeige`) and is the same for the interface and the server – `mappen/eingaben.ts` (saving) and `mappentypen/passung.ts` (fit) check required fields with it, the form uses it via `web/src/ablage/anzeige.ts`. The conditions build on the views’ toolkit (`sichten.ts`); nothing but what the form shows depends on them.

## What stays in dienst.ts (#1078, #1079) { #dienst-rest }

Since #1079 `dienst.ts` contains no forwards any more, only the assembly: the fields of the classes, the constructor with the `baue…()` methods, `schliesseEmpfaengerAn()`, the `verbinde…` methods, the fields set by start-up or tests (`mindestensMs`, `sicherungAufgegeben`, `systemkonten`, `ereignisWecker` …), the event distributor and the vault (`schluesselWechseln`, `verschluesselePaketGeheimnis`, `entschluessele`).

Routes, modules and tests call the subject services on the fields of the service (`dienst.mappen.holeMappe(…)`, `dienst.kern.ereignis(…)`, `dienst.ausgang.pruefeAusgang(…)`); constants, helpers and types come from the subject folder's `index.ts`, not through `dienst.ts`. Permission checks stay where they were: in the subject services and in the route wrappers (`dokumentRecht`, `maskiere` …). One forward remains: `listeDokumente` reads the documents of a folder from the repo without a permission check (creating a package with sample documents, administrators only) – the repo does not belong in the routes. New code calls the subject service directly and adds no new forward.

## Tree via links {#baum-uber-verweise}

Everything that hangs off a folder via links is collected by **one** module – used by the data protection request under Art. 15 GDPR (#396) and by "Delete folder with all linked folders" (#424). New functions that need "everything about this folder" use it instead of their own loops.

- **Types and options:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = folders that link to the node, "downwards"; `verweistAuf` = folders it links to; `tiefe` 1–10; `max` up to 5000; `seitwaerts`; `ohneTypen`; `nurZugehoerigkeit`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, helpers `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithm:** `server/src/loeschen/baum.ts` – `sammleBaum(quelle, startId, optionen)`: breadth-first search, one access per level for links (`Repo.kantenVon`), folders and readability. Without `seitwaerts` a node only continues in the direction it was reached from (the start folder in all chosen ones). Cycles and multiple paths end up in `auchUeber` and `kreise`; every node appears once. Beyond `max`: `abgeschnitten`. With `nurZugehoerigkeit` it only continues via link fields of the kind membership (`verweisartVon(typ, feldKey)`, default reference); nodes that only hang on via a reference are leaves with `nurBezug` – if the search later reaches them via a membership, they are attached there and followed further (within a level, memberships take precedence).
- **Rights:** the `BaumQuelle` is built by `MitVerknuepften.baumQuelle(zugriff)`; only readable folders are included **and** followed, unreadable ones only count in `verborgen`. To call it: `await dienst.mitVerknuepften.baum(startId, eingabe, zugriff)` (users and roles are excluded unless `ohneTypen` says otherwise), over HTTP `GET /api/v1/mappen/{id}/baum`.
- **Per node:** `typ`, `titel`, `ebene`, `ueber` (parent node, direction, field, `verweisart`), `nurBezug`, `dokumente`, `aussen` (links to folders outside the tree per direction, unreadable ones without a title), `aufbewahrenBis`/`gesperrt` (archive mode #212) and `rechte` (the caller's CRUDP).

The data protection request (`DatenschutzDienst.auskunftVorschau`) and deletion both collect with `nurZugehoerigkeit` (#472, #424): reference nodes only go out as a mention in the request (`AuskunftAuswahl.erwaehnungen`, `erwaehnungText` in `shared/src/auskunft.ts`); when deleting, only their link is removed. Full-text suggestions are no longer part of the request.

Tests: `server/test/auskunft.test.ts` (cycles, rights, upper limit, sideways, membership/reference).

### Deleting with linked folders (#424) { #mit-verknupften-mappen-loschen-424 }

- **Preview and plan** (pure functions, server and interface): `shared/src/loeschbaum.ts`. `MitVerknuepften.loeschVorschau(startId, { tiefe, max }, zugriff)` collects the tree only `verwiesenVon` with `nurZugehoerigkeit` (default depth 5) and adds `kanten` (all links between nodes, not just the tree paths), `geteilt` and `nichtLoeschbar`. Markers (`kennzeichen(v, k)`): 🔒 = `gesperrt`, 📎 = `nurBezug` (never deleted, `loeschen` counts as `entkoppeln`), ⛔ = `!rechte.D` or `nichtLoeschbar`, 🔗 = `geteilt` – narrower than `haengtAuchAnderswo(k)`: only counts outward links of the kind membership via a field the node hangs on in the tree, or to a folder of the same type as in the tree; links to master data (storage location, category) and users don't count, otherwise almost everything would be 🔗.
- **Plan:** `planeLoeschung(vorschau, auswahl)` – a choice per id of `loeschen | entkoppeln | behalten` (missing ids stay). Fixed point: a folder stays if `wirdAnderswoGebraucht(k)` or a remaining folder in the tree links to it without `entkoppeln`. Locked folders are never unlinked.
- **Running it:** `MitVerknuepften.loescheMitVerknuepften` collects again, plans, checks every folder as for a single deletion (`loeschPruefung` with all back-links), cuts the links (`entkoppeln`, right U) and puts everything into the Bin with `Repo.legeVorgangInPapierkorb` in **one** transaction (links among each other first – that way cycles work too). Columns `papierkorb.vorgang` and `papierkorb.entkoppelt` (migration 042). `stelleVorgangWiederHer` and `Repo.stelleMehrereWiederHer` first create all folders, then the links, and restore the unlinked links. Tests: `server/test/loeschbaum.test.ts`.

## Writing folders, even at the same time (#609) { #mappen-schreiben }

Whoever saves last must not reset fields they didn't touch. So for **every** writer of folder values:

- **Write only what changed.** `Repo.aendereMappe(id, werte, [], von, { basis, verweise })` only sets the fields that differ from `basis` (the values read) to the current state – with the row locked (`SELECT … FOR UPDATE`), and the same in memory (`feldweise` in `server/src/repo/index.ts`). `verweise(w)` computes the links from the result. Internal writers (`schreibeSystemMappe`, `schreibeVerweisWerte`, `absenderBereinigen`, renaming fields) use this; `schreibeSystemMappe` also only gets the fields to change, never `{ ...mappe.werte, … }` from an older read.
- **Version.** `mappen.geaendert` is accurate to the millisecond and increases with every write (`greatest(clock_timestamp(), geaendert + 1 ms)`) so it works as a version counter; no migration needed. With `stand` the repo only writes if the row still has that version, otherwise `StandVeraltet` – `MappenDienst.aendereMappe` then reads again and retries up to five times.
- **Conflict.** `MappenDienst.aendereMappe(id, { werte, stand })`: if `stand` differs from the current one, `feldkonflikte` looks in the history for `geaendert` entries with `daten.stand` > `stand` (each entry remembers the version its write produced). A submitted field that appears there and should now have a different value results in 409 with `Mappenkonflikt` (`shared/src/model/historie.ts`). Without `stand` there is no check, only field-by-field writing – so old API calls stay valid.
- **Form.** `MappeFormular` only sends the fields whose raw value differs from `basis`, and `stand` = `mappe.geaendert` when `basis` was loaded. On 409, `Konfliktfrage` shows the choice per field; "Mine" goes along again with the new version from the response, "Theirs" takes over the value and is left out.

Tests: `server/test/gleichzeitig.test.ts` (memory and PostgreSQL), in the browser `docs/handbuch/screenshots/gleichzeitig-pruefen.mjs` (two windows, workflow "Handbuch").

## System accounts and account roles (#673) { #systemkonten }

Besides people (`benutzer.art = 'person'`) there are two kinds of accounts that never sign in:

| Kind | Example | System role | Rights to folders |
|---|---|---|---|
| `dienst` (#338) | "Paket Texterkennung", one per package with code | **Package** (`rolle:paket`) | confirmed rights from the manifest, restricted by rules for the Package role |
| `system` (#673) | "Automatisierung" (`systemkonto = 'automatisierung'`) | **System account** (`rolle:systemkonto`) | everything except `P`, restricted by rules for the System account role |

- **Creation:** `Konten.systemkonto(kennung)` at start-up (`ablago.ts`), idempotent; in PostgreSQL the index `benutzer_systemkonto` prevents a second account, even with two servers (migration 059).
- **Never usable:** `holeHash`, `listeBenutzer`, `anzahlBenutzer` only see people; `benutzerZu` (session) and `benutzerMitId` (API key) reject system accounts; user management and "Sign in as user" don't know them (`person()`). `personen()` only returns them for names (`aktiv: false`, `art`).
- **Roles:** the role folders `rolle:systemkonto` and `rolle:paket` are created by the [system setup](#systemausstattung) (`kontorollen` in `kern.system()`). `listeRollen()` only returns them with `mitKonten`, `pruefeRollen()` rejects them.
- **Access:** `ZugriffDienst.zugriff(konto)` sets `wer.rollen = [account role]` and trims the folder types with `kontoRegelwerk(typ, rolleId)` (`shared/src/rechte.ts`): default "everything", only rules that name the role (`nenntRolle`). So a strict default for members doesn't lock out an automation, but an administrator can restrict it on purpose. For packages the result is intersected with the confirmed rights. `PostSystemmappen.systemZugriff('automatisierung')` returns the system account's access (for the automation engine, #674).
- **Workbench:** system accounts are never `admin`; which Workbench actions a card allows is up to the card itself (#677).
- **Interface:** Workbench → Users, section "System accounts" (`GET /api/benutzer/systemkonten`, administrators only).

## Passkeys (#811) { #passkeys }

Sign-in with WebAuthn – as a way of its own, as a second factor and for signing in again (#819). The cryptography (CBOR, COSE keys, signatures, counters) is verified by `@simplewebauthn/server` in a pinned version ([dependencies](abhaengigkeiten.md#abhaengigkeiten)); in the browser Ablago uses the built-in `navigator.credentials` interface without a library (`web/src/passkey.ts`).

- **Where:** `server/src/anmeldung/passkeys.ts` (class `Passkeys`, next to `zweifaktor.ts`), connected to `Konten` with `verbindePasskeys` like two-factor sign-in. The requirement per role uses the same `RollenPflicht` as two-factor sign-in (keys `passkey_pflicht`, `passkey_pflicht_seit`). Routes in `anmeldung/anmeldung.routen.ts`.
- **RP ID and origin** from `betrieb.adresseFuerLinks()` (maintained address, otherwise the request's): only `https://` with a name or `http://localhost` (`relyingParty`). Each passkey remembers its RP ID; if it does not match the current address, it does not count (`passt: false` in the list).
- **Challenge** in the [short-lived state](server.md#kurzzustand): when adding, per account (`passkey-neu`); when signing in, under the hash of a random identifier (`passkey-anmeldung`), with purpose (`anmelden`, `zweiter-schritt`, `bestaetigen`, `dokumentpasswoerter`) and – except when signing in without an email address – the account. 5 minutes; `nimm` redeems it once, also on errors. At most 2000 open.
- **Verification:** `userVerification: 'required'` when creating and signing in, attestation `none`, origin and RP ID from the challenge, counter must increase (otherwise warning "possibly copied"). The counter is saved with `Einstellungen.tausche`.
- **Stored** in the settings under `passkeys_<account>`: `{ liste: [{ nr, id, oeffentlich, zaehler, name, rpId, erstellt, zuletzt, transports, mehrgeraete }] }` – only public data, hence part of the backup and unchanged by `ohneGeheimnisse`. `nr` is Ablago's own identifier for routes and interface; the authenticator's identifier only leaves the server in `allowCredentials`/`excludeCredentials`. The `userID` when creating is the account id (not an email address); signing in without an email address finds the account by it.
- **Decisions only by the maintained address** (security review): `pflichtRp()`/`fuerPflicht()` read `betrieb.gepflegteAdresse()`, never the request's address. The passkey requirement can only be switched on with a maintained HTTPS address (409); if it goes missing later, the requirement keeps applying, closed. If the requirement is on and the person has passkeys but none for the maintained address, or the request comes via another address, `zweiteWege` requires the code or answers 409.
- **Limits:** challenges without an account (`passkey-anmeldung-offen`) per address range (`adressbereich`: IPv4 or IPv6 /64) at most `PASSKEY_OPTIONEN_JE_ADRESSE` in 5 minutes (counter `passkey-optionen-adresse`), plus the emergency brake `PASSKEY_OPTIONEN_GESAMT` (`grenzen.ts`); second step and confirmations (`passkey-anmeldung`) do not count.
- **Requirements:** a passkey for the maintained address also fulfils the two-factor requirement (`Zweifaktor.alternative`, connected by `Konten`); `zweiteWege` then requires it when signing in with a password, and `passkeyNoetig` blocks removing the last one. The passkey requirement stays separate.
- **Purposes:** `bestaetigen` for administration mode and sensitive actions, `dokumentpasswoerter` for "passwords for documents" (`POST …/passkeys/bestaetigen/optionen` with `{ fuer: 'dokumentpasswoerter' }`, then `POST /api/konto/dokument-passwoerter/bestaetigen` with `{ passkey }`) – a challenge is only valid for its purpose.
- **Sign-in protection:** `Konten.anmeldenMitPasskey` counts beforehand with `sperre.versuch` (email of the named account, otherwise empty, and IP); a failure with `fehlschlag`, a success resets – as with the password (#956).

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /api/konto/passkey/optionen` | open | `{ zweiterSchritt? }` → `{ kennung, optionen }` (request options in WebAuthn's JSON format) |
| `POST /api/konto/passkey/anmelden` | open | `{ kennung, antwort, zweiterSchritt? }` → session |
| `GET /api/konto/passkeys` | signed in | own passkeys, `moeglich`, `adresse` (RP ID), `pflicht`, `hoechstens` |
| `POST /api/konto/passkeys/beginnen` | signed in | creation options |
| `POST /api/konto/passkeys` | signed in | `{ antwort, name }` → new passkey (201) |
| `PUT /api/konto/passkeys/:nr` | signed in | `{ name }` rename |
| `DELETE /api/konto/passkeys/:nr` | signed in | remove – only with a fresh sign-in (otherwise 403 with `details.frisch`) |
| `POST /api/konto/passkeys/bestaetigen/optionen` | signed in | options for signing in again; then `POST /api/konto/verwaltung` or `…/verwaltung/bestaetigen` with `{ passkey: { kennung, antwort } }` |
| `GET`/`PUT /api/werkbank/passkeys` | Workbench (sign-in protection) | requirement per role `{ admin, mitglied }`, plus `moeglich` |
| `GET /api/benutzer/:id/passkeys`, `POST …/zuruecksetzen` | Workbench (users) | number, remove all (also `dms passkeys-zuruecksetzen`) |

`POST /api/konto/anmelden` and `…/passwort-setzen` additionally return `wege: { code, passkey }` for the second step; after a provider this is in the address of `/anmelden/code` as `#<kennung>.<c|p>`. `/api/konto/status` contains `passkey: { moeglich, aktiv?, fehlt?, ausstehend? }`, the administration state `passkey`.

**Tests:** `server/test/passkeys.test.ts` with a simulated authenticator (`server/test/hilfen-authenticator.ts`: P-256, attestation `none`, small CBOR) – adding, signing in, wrong origin, reused challenge, counter going backwards, without user verification, sign-in protection, removing without a fresh sign-in, requirement, changed address, administration mode. The smoke test creates a passkey in Chromium with a virtual authenticator (DevTools protocol) and signs in with it.
