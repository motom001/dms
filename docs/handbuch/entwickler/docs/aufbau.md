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

Ablago ist ein **modularer Monolith**: ein Prozess, eine Datenbank. Server und Oberfläche stecken zusammen in einem Image – als `dms` oder, mit PostgreSQL im selben Container, als `dms-komplett`. Wichtige Muster:

- **Repos doppelt:** Jede Datenzugriffs-Schnittstelle gibt es für PostgreSQL (`repo-pg.ts`, `pg…`-Funktionen) und für den Arbeitsspeicher (`repo-speicher.ts`, `speicher…`). Die meisten Tests laufen schnell im Arbeitsspeicher, die Tests mit `TEST_DATABASE_URL` decken PostgreSQL ab. Neue Funktionen brauchen beides, und beide müssen sich gleich verhalten.
- **Routen** stehen je Fachbereich in `server/src/<fach>/<fach>.routen.ts` (#960, z. B. `dokumente/dokumente.routen.ts`), je mit `zugang: 'offen' | 'angemeldet' | 'admin'`. Jede Datei exportiert Funktionen `…Routen(k)`, die die Dienste und gemeinsamen Hilfen über den Parameter `k` bekommen (`http/routen-kontext.ts`; Hilfen ohne Dienste in `http/routen-hilfen.ts`). `routen()` in `server/src/routen.ts` ruft sie in fester Reihenfolge auf (`BEREICHE`) und enthält weiter die Typen (`Route`, `Anfrage`, `Antwort`), `pruefeZugang` und die Prüfung der Paketrechte; der Test `routen-liste.test.ts` zählt die Routen und prüft `zugang` und Doppelte. **Routen ohne Anmeldung** (`zugang: 'offen'`) stehen dort zusätzlich in einer festen Liste (`OFFEN`, je mit Grund, #1029): Eine neue offene Route – oder eine, die auf `offen` wechselt – kommt bewusst in diese Liste und bekommt im Pull Request einen Satz Begründung; sonst ist der Test rot. Die Hilfen in `http/routen-hilfen.ts` und `http/routen-kontext.ts` dürfen nur Routen-Dateien (`*.routen.ts`, `routen.ts`) importieren (`npm run lint:abh`, Regel `routen-hilfen-nur-in-routen`). Zwei Merkmale kommen dazu: `api: true` macht eine Route zum Teil der öffentlichen API (Anmeldung auch mit API-Schlüssel); `konsole: true` erlaubt sie nur über den Befehl `dms` im Container. Die öffentliche API für Programme liegt unter `/api/v1` (`api-v1.ts`, OpenAPI).

| Ordner in `server/src/` | Routen für |
|---|---|
| `anmeldung/` | Anmelden, Zwei-Faktor, Passkeys, Passwort, Einrichtung, Notfallzugang |
| `konten/` | Benutzer, Rollen, Vertretung, API-Schlüssel |
| `mappentypen/` | Mappentypen, ihr Archiv, Berechtigungen |
| `werkbank/` | Werkbank-Übersicht, Designs, Region, Sprachen, Protokoll, Verwaltungsmodus |
| `ausgang/` | Export (Werkbank und Mein Konto); seit #1077 die [Wege nach draußen](#ausgang) |
| `datenschutz/` | Auskünfte, Löschkonzept, Abrufseite; seit #1078 der [Datenschutz](#datenschutz) |
| `pakete/` | Pakete, Katalog, Paket-Einstellungen |
| `suche/` | Suche, Frag deine Ablage |
| `wartung/` | Wartungsmodus |
| `sicherung/` | Sicherung, Wiederherstellen, Notfallblatt, Schlüssel |
| `system/` | Betrieb, Systemzustand, Anbindung, Anmeldeschutz, Eingangsordner, WebDAV, Fehlermeldungen |
| `post/` | Postfächer und andere Eingangskanäle; seit #1077 die [Post](#post) |
| `automatisierung/` | Automatisierungen |
| `sichten/` | Ansichten, Mappenlisten, Startseite |
| `aufgaben/` | Aufgaben; seit #1078 die [Aufgaben](#aufgaben) |
| `mappen/` | Mappen, Historie, Papierkorb |
| `dokumente/` | Dokumente, Fassungen, Inhalte |
| `textsatz/` | Text setzen (#1040): Vorlagen einer Mappe, Brief aus Vorlage als PDF (`pdf/brief.ts`, getaggt, im Arbeiter) |
| `notfallkontakte/` | Notfallkontakte (#812): Werkbank → Verschlüsselung, Info-Mail an Vertrauenspersonen (Grenzen im Kurzzustand), „Wen fragen?“ auf dem Notfallblatt |
| `paketaktionen/` | Aktionen von Paketen im Menü „Mappe“ (#1039): Angebot je Person, Ablauf mit Dialog und Ergebnis, eingeschränkter Zugriff des Pakets, Schalter der Werkbank |

Die Ordner heißen wie die Dienst-Module der Zielaufteilung; deren `*.dienst.ts` ziehen beim jeweiligen Umzug dazu – als Erstes `suche/suche.dienst.ts` ([Suche](#suche), #964). Jeder Fachordner mit `*.dienst.ts` hat eine `index.ts` als Tür und eine von Hand geschriebene `README.md` (20–40 Zeilen); das prüft die CI im Job **stil** (`.github/werkzeuge/fachordner-pruefen.mjs`). Welche Ordner was einbinden dürfen, regeln die [Schichten](#schichten). In `pakete/` liegt außerdem `pakete.einstellungen.ts` (#961): Katalogquellen, Paket-Einstellungen, Paket-Speicher, Entwürfe und Umwandlungen in den Einstellungen – von außen über `pakete/index.ts` (neben `pakete.ts` als `./pakete/index` importiert).

Daneben, ohne Routen:

| Ordner in `server/src/` | Inhalt |
|---|---|
| `kern/` | der [Kern](#kern) (#961) |
| `zugriff/` | [Rechte prüfen](#zugriff) (#1072) |
| `systemausstattung/` | die [Systemausstattung](#systemausstattung) (#963) |
| `http/` | Hilfen der HTTP-Schicht – nur für Routen (geprüft mit `npm run lint:abh`) |
| `pdf-bearbeiten/` | [PDF bearbeiten](#pdf-bearbeiten) (#1077): Seiten, Verkleinern, Schwärzen, Stempel-Vorlagen |
| `pdf/`, `arbeit/` | [PDF-Stelle](#pdf-stelle), [Arbeiter-Pool](#arbeiter-pool) |
| `laeufer/` | Paket-Läufer |
- **Werkbank-Routen** (`zugang: 'admin'`, #818/#819) gehen nur im **Verwaltungsmodus** (Zustand der Sitzung, `Konten.modusPruefen`) und nur mit Recht auf ihren Bereich. Jede neue Route braucht einen Eintrag in `server/src/verwaltungsbereiche.ts` (`bereicheDerRoute`) – sonst dürfen sie nur Personen mit „Gesamte Verwaltung“, und der Test `verwaltungsmodus.test.ts` schlägt fehl. Heikle Handlungen mit Pflicht zur frischen Anmeldung stehen dort in `heikleHandlung`. `benutzer.rolle` ist die **wirksame** Rolle der Anfrage (`admin` nur im Modus); das gespeicherte Recht steht in `benutzer.verwaltung` (`shared/src/verwaltungsrecht.ts`). API-Schlüssel bekommen nie `admin`.
- **Öffentliche Links ohne Anmeldung** gibt es bisher nur für die Abrufseite einer Auskunft (#455, `server/src/abruf.ts`, `web/src/abruf.tsx`): Schlüssel nur im Fragment (`/abruf#…`), in der Datenbank nur Hashes (SHA-256 für den Schlüssel, scrypt für den Code), Fehlversuche im Anmeldeschutz je IP und am Link, Download über ein Einmal-Ticket. Weitere Freigabelinks sollten diesem Muster folgen. Dazu kommt der **Notfallzugang** `/notfall` (#815, `server/src/notfallcode.ts`, `web/src/notfall.tsx`): Notfallcode vom Notfallblatt nur als scrypt-Hash (Tabelle `notfallcode`), Einlösen in einer Transaktion mit dem neuen Passwort, Vorgabe „nur Heimnetz“ mit der echten Adresse hinter einem Proxy (`istHeimnetz`), 30 s Sperre je Adressbereich, Konten erst nach richtigem Code, Benachrichtigung vor jeder Änderung.
- **Migrationen** sind nummerierte SQL-Dateien in `server/migrations/`. Sie laufen beim Start in einer Transaktion und werden nie nachträglich geändert, sondern immer durch eine neue ergänzt.
- **Start** (#802, `server/src/startmodus.ts`): Gleich nach dem Anlegen der Ordner öffnet `ablago.ts` den Port (mit mehreren Prozessen nur der Leiter beim ersten Start, siehe [Mehrere Prozesse](#mehrere-prozesse)) mit der Seite „Ablago startet …“. Sie kennt keine Datenbank, nur den Stand im Arbeitsspeicher (`start.schritt('migration', { nr, von, datei })`, `start.menge(fertig, gesamt)`): Seiten der Oberfläche zeigen Schritt und Zahlen (Neuladen per `meta refresh`, kein Skript), `/api/*` und `/webdav` antworten `503` mit `Retry-After` und `startet: true` (die Oberfläche zählt das als Ausfall und wartet), `/api/gesundheit` meldet `503` mit `zustand: startet|fehler`. Den Port gibt sie erst unmittelbar vor `app.listen` frei (und für den Einrichtungsmodus zwischendurch). Ein Fehler beim Start landet über `uncaughtException` auf der Seite – nur Art, Schritt, Datei der Migration und SQLSTATE, nie die Meldung selbst (sie kann Werte enthalten); nach 5 Minuten endet der Prozess, außer bei der Sperre gegen ein Downgrade. Neue lange Vorbereitungen bekommen einen eigenen `Startschritt` (Text in `shared/src/sprachen/de/start.json`) oder laufen nach dem Start im Hintergrund, wie der erste Fristenabgleich.
- **Uploads als Strom** (#746, `server/src/hochladen.ts`): Routen mit `strom: true` (Dokument hochladen, neue Version, auch über `/api/v1`) liegen in einem eigenen Fastify-Bereich, dessen Parser den Körper in eine temporäre Datei unter `files/hochladen/` schreibt (0600, Prüfsumme und Kopf beim Lesen); `body` ist dann ein `Hochgeladen`. Der Dienst nimmt über `Eingang.aus()` Upload oder Puffer gleich, abgelegt wird durch Umbenennen (`Dateispeicher.uebernimm`). WebDAV-PUT nutzt `nimmAuf` direkt. Andere Uploads (Logo, Fotostapel, Pakete) lesen weiter in den Speicher, weil sie den ganzen Inhalt ohnehin brauchen.
- **Einstellungen** stehen als JSON je Schlüssel in der Tabelle `einstellungen`. `null` löscht einen Eintrag.
- **Heimnetz erkennen** (#595): Ob eine Adresse im Heimnetz liegt, entscheidet nur `shared/src/heimnetz.ts` (`imHeimnetz`, Liste `HEIMNETZ_ENDUNGEN` mit `.local`, `.lan`, `.internal`, `.home.arpa`). Art `ausnahme` (streng) erlaubt `http://` ohne TLS – Anmeldung über einen Anbieter, Endpunkte eigener Postfach-Anbieter; Art `hinweis` (weiter, z. B. auch `.fritz.box`, 100.64/10) dient nur Vorschlägen wie „Abruf-Link oder E-Mail“, nie einer Sicherheitsausnahme. Neue Stellen nutzen diese Funktion statt einer eigenen Liste. „Gleicher Rechner“ (nur `localhost`) ist eine andere Frage und bleibt bei ihren Stellen.
- **Hilfe:** Jedes ?-Symbol in der Oberfläche zeigt auf eine Stelle im Handbuch. Die Tabelle dazu steht in `shared/src/hilfe.ts`, und die CI prüft, dass jeder Anker existiert.
- **Gemeinsam beschriebene Zeilen und Verklemmungen** (#575): Trigger, die viele Transaktionen in dieselben Zeilen schreiben lassen (z. B. Zähler je Wort mit `INSERT … ON CONFLICT DO UPDATE`), verklemmen sich unter Last – jede Transaktion sperrt ihre Zeilen in anderer Reihenfolge, PostgreSQL bricht eine ab (Deadlock). Muster: Der Trigger hängt nur an einen Eingang ohne eindeutigen Schlüssel an, ein Hintergrundlauf übernimmt ihn unter einer Sperre und in fester Reihenfolge (Wörterverzeichnis: `suchwoerter_eingang`, `dms_woerter_einarbeiten`, `SucheDienst.woerterEinarbeiten`, Migration 052). Was trotzdem abgebrochen werden kann und nicht verloren gehen darf, läuft über `beiVerklemmungWiederholen` (`server/src/db.ts`, wiederholt bei 40P01/40001) – als eigene Transaktion bzw. `sql.begin` (in einer Transaktion ein Sicherungspunkt). Test: `server/test/verklemmung.test.ts`.
- **Sicherung und Wiederherstellung** sichern alle Tabellen außer dem Inhalt von `sitzungen` und `schema_migrationen` (`OHNE_INHALT` in `server/src/datenbankabzug.ts`). Eine neue Tabelle ist automatisch dabei. Daten außerhalb der Datenbank brauchen einen Gedanken: Wo liegen sie, und kommen sie mit?


## Kern (#961) { #kern }

`server/src/kern/` enthält, was **alle** Fachbereiche brauchen, mit einer Tür (`kern/index.ts`). Der Dienst baut ihn und reicht ihn als `dienst.kern` weiter; Bausteine wie die Pakete nehmen künftig nur den Kern statt des ganzen Dienstes.

- `kern.repo` – das Repo; in einer Transaktion des Kerns deren Repo. Bei jedem Aufruf neu holen, nie zwischenspeichern – sonst schreibt ein Paket neben der Transaktion vorbei.
- `kern.repoOhneTransaktion` – das Repo außerhalb jeder Transaktion (#1072, vorher `grundRepo` über Anschlüsse). Nur für das, was über Transaktionen hinweg gilt und nie zu einer Änderung gehört: Zwischenspeicher (Vektoren der Suche), den Ereignisverteiler, Nachläufe im Hintergrund.
- `inTransaktion`, `inEinemZug` (wiederholt bei Verklemmung), `danach`, `nachDerAntwort`, `inEigenerTransaktion()`.
- `ereignis(art, daten, von?)` in den Ausgangskorb, `mitAusloeser`, `ohneEreignisse`.
- `anlaesse` – die [Anschlusspunkte](#anschlusspunkte) für das Sofortige (#962, `kern/anlaesse.ts`).
- `system()` – Benutzer-, Rollen- und Post-Typ und die Systemrollen **nur nachschlagen** (#963; fehlt etwas, legt der Rückfall die [Systemausstattung](#systemausstattung) an), `typen()`, `zugriff(ich)`, `name(id)`, `papierkorbTage()`, `paketVerwehrt()`, `ablageortId()`, `liesGanz(sha)`.
- `historie.schreibe(…)` (`kern/historie.ts`) und `loeschprotokoll.schreibe(…)` (`kern/loeschprotokoll.ts`). **Lesen** bleibt bei Mappen bzw. Löschen.
- `einstellungen`, `dateien`, `stand`.

**Regel:** In den Kern kommt nur, was alle brauchen – Neues nur mit Begründung im Pull Request. Der Kern importiert nichts aus `dienst.ts`, Routen oder Fachordnern, nur `shared/` und die Basis (Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler); das prüft `npm run lint:abh` ([Regeln](stil.md#abhaengigkeiten-pruefen)). Der Dienst ist seit #1079 nur noch Zusammenbau: Routen, Module und Tests rufen die Fachdienste an seinen Feldern ([was bleibt](#dienst-rest)). Was der Kern nicht selbst bildet (den Zugriff – das ist [Rechte prüfen](#zugriff), eine Schicht darüber –, den Rückfall der Systemausstattung), bekommt er beim Zusammenbau vom Dienst.

### Systemausstattung (#963) { #systemausstattung }

`server/src/systemausstattung/` legt an, was jede Ablage braucht: die Systemtypen „Rolle“, „Benutzer“ und „Post“ mit Systemfeldern und Beschriftungen, die Systemrollen und die mitgelieferten Ansichten. Es ist ein Ablauf **über** den Fachbereichen: `sicherstellen()` ruft nacheinander Mappentypen (Typen und Rollen), Ansichten (eigene Ansicht eines eben angelegten Typs), Post (Ansichten der Post) und Ansichten („Favoriten“); die Schritte bekommt es beim Zusammenbau vom Dienst. Jeder Schritt legt nur an, was fehlt.

- **Beim Start** (`dienst.postSystemmappen.gleicheBenutzerAb`, nur der Leiter) und damit nach jeder Wiederherstellung, die neu startet.
- **Als Rückfall**: Findet `kern.system()` nicht alles, ruft es `systemausstattung.anlegen()` – für Wege ohne Start (Tests, Wiederherstellung, Demo entfernen). Gleichzeitige Aufrufe teilen sich einen Lauf.
- Wer nur Ids braucht, nimmt `kern.system()`; der Start ruft `dienst.systemausstattung.sicherstellen()`. Die Ids merkt sich der Kern nur, wenn er sie außerhalb einer Transaktion nachgeschlagen hat.

### Anschlusspunkte (#962) { #anschlusspunkte }

Was **sofort** zu einer Änderung gehört – in derselben Transaktion, ein Fehler rollt alles zurück –, läuft über die typisierten Anschlusspunkte in `server/src/kern/anlaesse.ts`: `kern.anlaesse.mappeGeaendert`, `typGeaendert`, `typAngelegt`, `benutzerGespiegelt`. Wer ändert, ruft `melde(…)`; was **später** geschehen darf (mindestens einmal, mit Wiederholung, Fehler nur im Protokoll), geht wie bisher mit `kern.ereignis(…)` in den Ausgangskorb.

- **Anmelden an einer Stelle:** `Dienst.schliesseEmpfaengerAn()` beim Zusammenbau, in fester Reihenfolge; danach ist die Liste zu. Eine andere Reihenfolge ist ein eigener Pull Request (Test `server/test/anlaesse.test.ts`).
- **Der Reihe nach:** Der `EventEmitter` dient nur als Liste der Empfänger; `melde()` wartet jeden mit `for … await` ab. `emit()` ist verboten und wirft.
- **Nur in einer Transaktion:** `melde()` wirft außerhalb von `inTransaktion`/`inEinemZug`. Ein Empfänger darf einen anderen Anlass melden (Tiefe höchstens 2), nie den, dessen Empfänger gerade läuft.
- **Empfänger** tun nur Datenbank-Arbeit über `kern.repo` und `kern.danach(…)` – bei einer Verklemmung wiederholt `inEinemZug` die ganze Änderung samt Empfängern. Keine Zwischenspeicher, Mails oder Dateien direkt.
- **Sofort** wurden nur die Empfänger, die vorher schon direkt gerufen wurden. Alles Neue geht in den Ausgangskorb.

Anlass → Empfänger (der Reihe nach; Fachbereich.Aufgabe):

<!-- anlaesse:anfang (erzeugt von server/test/anlaesse.test.ts) -->
- `mappeGeaendert` → 1. `mappentypen.passung` 2. `aufgaben.erwaehnungen` 3. `aufgaben.fristen` 4. `post.aufgaben`
- `typGeaendert` → 1. `sichten.umbenennen` 2. `sichten.teile` 3. `mappen.titel` 4. `mappentypen.passung` 5. `aufgaben.fristen`
- `typAngelegt` → 1. `sichten.eigeneSicht`
- `benutzerGespiegelt` → 1. `aufgaben.abwesenheit`
<!-- anlaesse:ende -->

## Suche (#964) { #suche }

Der erste Fachbereich mit eigener Fachlogik im Fachordner (Probelauf der Zielaufteilung): `server/src/suche/suche.dienst.ts` mit der Klasse `SucheDienst` – unscharfe Suche (Tippfehler, gleichbedeutende Wörter, Wörterverzeichnis), Vektoren zu Dokumenten und ähnliche Dokumente. Der Dienst baut ihn als `dienst.suche`; wer sucht, ruft ihn dort (auch `dienst.suche.vektorAnbieter`).

- **Tür:** `suche/index.ts`; die Routen (`suche.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, nicht den ganzen Dienst (für den Zwischenspeicher der Vektoren `kern.repoOhneTransaktion`), dazu die [Rechteprüfung](#zugriff) (`lesbare`, `pruefeRecht`) und einen `SucheAnschluss` mit `konten` (Dienstkonto eines Pakets).
- **Nur abwärts:** Die Suche (Schicht 3) importiert sich selbst, tiefere Fachordner und den Kern (je über `index.ts`), `shared/`, die Basis und `vektoren.ts` – geprüft mit der Regel `fachordner` ([Regeln](stil.md#abhaengigkeiten-pruefen)). `vektoren.ts` bleibt außerhalb von `suche/`, weil auch der Paket-Läufer damit die Vektoren eines Pakets liest.
- **Noch im Dienst:** die Suche in der Mappenliste (`listeMappen`). `vektorNachlauf` liegt seit #1078 bei den [Ereignissen](#ereignisse).

## Rechte prüfen (#1072) { #zugriff }

`server/src/zugriff/zugriff.dienst.ts` mit der Klasse `ZugriffDienst` prüft, wer was darf – an einer Stelle: `zugriff(ich)` einmal je Anfrage (Menschen nach den Regeln am Mappentyp, Dienstkonten der Pakete nach den bestätigten Rechten, Systemkonten nach ihrer Rolle, Leserechte auf Zeit), `rechteAn`, `rechteAnVielen`, `pruefeRecht`, `lesbare`, `mitPasswortRecht`, `sichtbarFuer`, `kannLesen`, `wasSieht`, `mappeVon`. Der Dienst baut ihn als `dienst.rechtepruefung`; Routen und Module rufen ihn dort.

- **Tür:** `zugriff/index.ts` (dazu `maskiert` und `NICHT_SICHTBAR` für Titel nicht lesbarer Mappen).
- **Bekommt den Kern** und einen `ZugriffAnschluss` vom Dienst: `kiSperre` (KI-Einstellung der Pakete) und `konten`.
- **Schicht 1:** importiert nur sich selbst, den Kern, `shared/`, die Basis und `messung.ts`. Fachordner darüber bekommen den `ZugriffDienst` beim Zusammenbau (wie die Suche) und importieren ihn über `zugriff/index.ts`. Der Kern bindet ihn nicht ein; `kern.zugriff(ich)` ruft, was der Dienst hereinreicht.
- `regulaerSichtbarFuer` liegt seit #1078 bei den [Aufgaben](#aufgaben) (`ohne-leserecht.ts`). Die Werkbank der Berechtigungen liegt seit #1076 in den [Berechtigungen](#berechtigungen). `paketSiehtNicht` liegt seit #1073 bei den [Mappentypen](#mappentypen) (`pakete-am-typ.ts`).

## Mappentypen (#1073) { #mappentypen }

`server/src/mappentypen/` (Schicht 2) bündelt, was einen Mappentyp ausmacht – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `mappentypen.dienst.ts` | `MappentypenDienst` (`dienst.mappentypen`) | `listeTypen`, `typenFuer`, `rechteUebersicht`, `legeTypAn`, `aendereTyp`, `loescheTyp`, `belegteTypen`, `ausDokumentVon`, `typErkennungen` |
| `eingabe.ts` | – | Eingaben bereinigen: `bereinigeTyp`, `bereinigeFeld`, `behalte…`, `liesStand` |
| `passung.ts` | `Passung` (`dienst.passung`) | `pruefePassung`, `passungFuer`, `pruefeUnpassende`, `passungNachziehen` |
| `nummernkreise.ts` | `Nummernkreise` (`dienst.nummernkreise`) | Nummernkreise (#171), `ARCHIV_KREIS` |
| `systemtypen.ts` | `Systemtypen` (`dienst.systemtypen`) | `sichereSystemtypen` (Schritt der [Systemausstattung](#systemausstattung)), `benutzerspiegel`, `weitereRollen`, `ablageortTyp`, Spur im Verwaltungsmodus |
| `pakete-am-typ.ts` | `TypPakete` (`dienst.typpakete`) | `paketeAmTyp`, `setzePaketVerwehrt`, `paketSiehtNicht` |

- **Tür:** `mappentypen/index.ts`; die Routen (`mappentypen.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, `TypPakete` und `Systemtypen` dazu die [Rechteprüfung](#zugriff), und je Klasse einen Anschluss für das, was noch im Dienst liegt (Stempel, Erkennung und Berechtigungen am Typ, Aufgaben, Titel, Aufträge, Systemmappen schreiben).
- `ausPostZiele` (#937) liegt seit #1078 in `mappentypen.dienst.ts`, die KI-Freigabe der Mappentypen (#796) in `ki-typen.ts` (`KiTypen`, `dienst.ki`). Den Stempel am Typ (`mitStempel`) rechnet seit #1077 der [Ausgang](#ausgang), Prüfen und Speichern die Stempel-Vorlagen in [PDF bearbeiten](#pdf-bearbeiten) – beides über den Anschluss. `berechtigungenAusEingabe` liegt seit #1076 in den [Berechtigungen](#berechtigungen) und kommt weiter über den Anschluss. `titel` liegt seit #1074 bei den [Mappen](#mappen) (`titel.ts`).

## Mappen (#1074) { #mappen }

`server/src/mappen/` (Schicht 2) bündelt, was eine einzelne Mappe ausmacht – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `mappen.dienst.ts` | `MappenDienst` (`dienst.mappen`) | `holeMappe`, `legeMappeAn`, `aendereMappe`, `verweisende`, `listeMappen`, `notizen`, `setzeFavorit`, `gesehen`, `persoenlicheEinstellungen` |
| `eingaben.ts` | `MappenEingaben` (`dienst.mappenEingaben`) | `pruefeWerte`, `unpassendeFormate`, Auswahlfilter, „folgt aus“ (`folgen`, `folgeVorschlaege`), `rechteVorschau`, `feldkonflikte`; `bereinigeWerte` |
| `titel.ts` | `MappenTitel` (`dienst.mappenTitel`) | `aktualisiereTitel`, `titelVorab`, `titelNachziehen` und weitere Wartung beim Start, `absenderBereinigen` |
| `historie.ts` | `MappenHistorie` (`dienst.mappenHistorie`) | `historie`, `notiereAbruf`, `historieTage`; `notiere` schreibt über `kern.historie` |
| `passwortfelder.ts` | `Passwortfelder` (`dienst.passwortfelder`) | `zeigePasswort`, `entschluesselePasswoerter`, `unlesbarePasswoerter` |
| `archiv.ts` | `MappenArchiv` (`dienst.mappenArchiv`) | Archivnummer (#345), Archivmodus (#212: `darfWeg`, `archivVorschau`), `pruefeDateien` |

- **Tür:** `mappen/index.ts`; die Routen (`mappen.routen.ts`) holt nur `routen.ts` direkt. Die Eingabe-Hilfen der Mappentypen bleiben in `mappentypen/eingabe.ts`.
- **Bekommt den Kern**, `MappenDienst`, `MappenEingaben` und `MappenArchiv` dazu die [Rechteprüfung](#zugriff), und je Klasse einen Anschluss für das, was noch im Dienst liegt oder über ihn kommt (Konten, Aufgaben ohne Leserecht, Archivfassung und PDF-Schutz aus den [Dokumenten](#dokumente), Datenschutz, `loeschPruefung`, `meldeVerknuepft`, Schlüssel, Aufkleber, Aufträge).
- **Sofortiges:** `legeMappeAn` und `aendereMappe` melden am Ende ihrer Transaktion `kern.anlaesse.mappeGeaendert` – die [Anschlusspunkte](#anschlusspunkte) und ihre Reihenfolge sind unverändert.
- Notizen schreiben liegt seit #1078 in `notizen.ts` (`MappenNotizen`, `dienst.mappenNotizen`; Erwähnungen und Übersetzungen über den Anschluss). Löschen und Papierkorb liegen in [Löschen](#loeschen), Aufgaben und Fristen in den [Aufgaben](#aufgaben), `meldeVerknuepft` bei den [Ereignissen](#ereignisse) – alle weiter über den Anschluss.

## Dokumente (#1075) { #dokumente }

`server/src/dokumente/` (Schicht 2) bündelt alles rund um die Dateien an einer Mappe – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`baueDokumente()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `dokumente.dienst.ts` | `DokumenteDienst` (`dienst.dokumente`) | `ladeHoch`, `loescheDokument`, `holeDokument`, `dokumentInhalt`, `textAusDatei`, Texterkennung und Vorschaubilder anbinden, `neueDateien`, `raeumeAuf`; `dateiname`, `erkenneAnzeigbar` |
| `versionen.ts` | `DokumentVersionen` (`dienst.dokumentVersionen`) | `ersetzeDokument`, `holeVersionZurueck`, `nachNeuerVersion`, `versionen`, `versionInhalt`, `beruehre` |
| `umwandeln.ts` | `DokumentUmwandlung` (`dienst.dokumentUmwandlung`) | Dateien umwandeln (#577): `nachFassung`, `umwandelPaketDa`, `setzeFassung`, `fassungVon`, `umwandlungStand` |
| `archivfassung.ts` | `DokumentArchivfassung` (`dienst.dokumentArchiv`) | Archivfassung (#631): `archivNachVolltext`, `archivPaketDa`, `setzeArchivfassung`, `wortpositionen`, `archivStand` |
| `geschuetzte-pdf.ts` | `GeschuetztePdfs` (`dienst.geschuetztePdfs`) | geschützte PDFs (#827): `entsperreDokument`, `nachEntsperren`, `mitPdfSchutz` |
| `fehlende-dateien.ts` | `FehlendeDateien` (`dienst.dateienFehlen`) | fehlende Dateien (#877): `merkeFehlendeDatei`, `fehlendeDateien`, `dokumenteOhneDatei`, `pruefeVorhanden` |

- **Tür:** `dokumente/index.ts`; die Routen (`dokumente.routen.ts`) holt nur `routen.ts` direkt. Die Technik der Fassungen (`dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`) bleibt außerhalb und ist für Fachordner ein Werkzeug (siehe [Schichten](#schichten)).
- **Bekommt den Kern** und die Teile dieses Ordners, die eine Klasse ruft, und je Klasse einen Anschluss für das, was noch im Dienst liegt oder im Kreis liefe (Ereignis und Titel – `kern.ereignis`, `mappenTitel` –, Archivmodus, Verkleinern, Volltext, Aufträge an Pakete, Paket-Einstellungen, Mappentypen, Texterkennung).
- **Reihenfolge:** `ladeHoch` schreibt Historie, „zuletzt geändert“, Dokument, Volltext und `dokument.hochgeladen` in einer Transaktion, Vorschau, Umwandeln und Entsperren laufen danach; `nachFassung`, `nachEntsperren`, `archivNachVolltext` und `nachNeuerVersion` sind unverändert und werden an denselben Stellen gerufen.
- `entsperrtZu` liegt seit #1078 in `geschuetzte-pdf.ts`. PDF bearbeiten, Verkleinern und Schwärzen liegen seit #1077 in [PDF bearbeiten](#pdf-bearbeiten). Den Volltext (`volltextFertig`, `volltextAn`) rufen die Dokumente seit #1076 über ihren Anschluss am Dienst im [Volltext](#volltext).

## Sichten (#1076) { #sichten }

`server/src/sichten/` (Schicht 3) bündelt die Ansichten der Ablage – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`baueSichtenUndVolltext()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `sichten.dienst.ts` | `SichtenDienst` (`dienst.sichten`) | `seite`, `trefferIds`, `zaehler`, `zaehlerRahmen`, `zaehlerAbruf` (#625), `ablageStand` (#919), `beiAenderung`, `aktualisiereStatistik`; die Zwischenspeicher der Zahlen, `sortierungAus` |
| `verwalten.ts` | `SichtenVerwaltung` (`dienst.sichtenVerwaltung`) | `listeSichten`, `verborgeneSichten` (#148), `sichtTestlauf`, anlegen, ändern (#917), löschen, ordnen, verschieben, `sichtVorschau`, `sichtFuerTyp`, `belegung` |
| `systemsichten.ts` | `Systemsichten` (`dienst.systemsichten`) | „Neue Post“, „Eingegangen“, „Versendet“ (#192), „Favoriten“ (#725) anlegen und nachschlagen |

- **Tür:** `sichten/index.ts`; die Routen (`sichten.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, `SichtenDienst` dazu die [Rechteprüfung](#zugriff), die [Mappen](#mappen) und die [Suche](#suche), und einen Anschluss für das, was noch im Dienst liegt (Gültigkeit der Zahlen – `mindestensMs` bleibt am Dienst –, Aufgaben ohne Empfänger und ohne Leserecht, Termine, Konten).
- **Zahlen:** Die Zwischenspeicher hängen an denselben Ständen wie bisher (Mappenstand bzw. Haushaltsstand, #742, #918); die Zwischenspeicher der Termine bleiben bei den Aufgaben im Dienst.
- **Sofortiges:** Die Empfänger `sichten.umbenennen` und `sichten.eigeneSicht` an den [Anschlusspunkten](#anschlusspunkte) meldet weiter der Dienst an, Reihenfolge unverändert; `sichten.teile` (#1031) nimmt einen Typ aus den Ansichten, wenn „Ist Teil einer anderen Mappe“ angeht, und gibt ihm seine Ansicht zurück, wenn sie ausgeht.
- **Teile (#1031, `shared/src/teile.ts`):** `klauselnFuer` lässt Teiltypen weg – so fehlen sie in jeder Ansicht und ihren Zahlen; die erweiterte Suche ebenso. Mit Suche sucht `SichtenDienst.seite` vorher in den Teiltypen (gleicher Begriff, gleiche Varianten, **gleicher Lesefilter**, höchstens `TEIL_TREFFER_MAX`) und gibt die übergeordneten Mappen als `auchIds` ans Repo: Sie zählen dort als Treffer, Typ, Bedingungen und Lesefilter gelten weiter. Die Fundstelle steht als `ausschnitte[id].teil`.

## Berechtigungen (#1076) { #berechtigungen }

`server/src/berechtigungen/berechtigungen.dienst.ts` mit der Klasse `BerechtigungenDienst` (`dienst.berechtigungen`) ist die Werkbank der Berechtigungen (#123–#127): `berechtigungenListe`, `niemandLesbar`, `setzeBerechtigungen` (mit `pruefeBerechtigungen` und `protokolliereBerechtigungen`), `berechtigungenAusEingabe` (#142), `kopiereRegel`, `testlauf` (#125, #710, #798) und `laufwerkMappe` (#346). Was jemand darf, rechnet weiter die [Rechteprüfung](#zugriff).

- **Tür:** `berechtigungen/index.ts`; eigene Routen gibt es nicht.
- **Bekommt den Kern**, die Rechteprüfung und einen Anschluss mit den Konten.
- **Schicht 2:** braucht nur Kern und Rechteprüfung; die [Mappentypen](#mappentypen) (auch Schicht 2) prüfen damit die Regeln beim Speichern eines Typs – heute noch über ihren Anschluss am Dienst.

## Volltext (#1076) { #volltext }

`server/src/volltext/` (Schicht 3, über den [Dokumenten](#dokumente)):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `volltext.dienst.ts` | `VolltextDienst` (`dienst.volltexte`) | `beiVolltextFertig`, `volltextFertig`, `volltextAusgelassen` (#946), `volltextAn`, nachholen und neu erzeugen (#458), Texterkennung als Paket (#459), `nachEreignisAufruf`, `nachTexterkennungsEreignis`, `volltext`, `schreibeVolltext`, `setzeDokumentSprache`, `teilenHinweisAus`; `VOLLTEXT_MAX`, `VolltextMeldung`, `EreignisAufruf` |
| `aus-paketen.ts` | `VolltextAusPaketen` (`dienst.volltextAusPaketen`) | Volltext aus Paketen (#614): `volltextPaketDa`, `paketWegFuerDateien`, `pruefeVolltextRecht`, `nachVolltextEreignis` |

- **Tür:** `volltext/index.ts`. Wer für einen Dateityp zuständig ist, rechnet weiter `paketvolltext.ts` (Werkzeug, auch für die Dokumente).
- **Bekommt den Kern** und die Dokumente (Texterkennung, Umwandeln, Archivfassung), dazu einen Anschluss für Ereignis (`kern.ereignis`), Aufträge, `paketVolltext` und die Sicherung außer Haus.
- **Reihenfolge:** `volltextFertig` legt erst `volltext.fertig` in den Ausgangskorb, meldet dann die Archivfassung und ruft nur mit Text die Hörer (Erkennung) nacheinander; `nachTexterkennungsEreignis` verteilt wie bisher an Umwandeln, Archivfassung, Volltext aus Paketen und Sicherung.

## Post (#1077) { #post }

`server/src/post/` (Schicht 3) bündelt, was hereinkommt – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`bauePdfPostAusgang()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `post.dienst.ts` | `PostDienst` (`dienst.post`) | `legePostAn`, `ordneZu` (#192), `automatischZuordnen`, `automatikRueckgaengig` (#337), `postAufgaben` („Post für dich“ erledigen; anlegen tut sie seit #1001 die Automatisierung) |
| `aufloesen.ts` | `PostAufloesen` (`dienst.postAufloesen`) | Post auflösen und abtrennen (#934, #936): `loesePostAuf`, `trennePostAb`, `verschiebeInRegister` |
| `systemmappen.ts` | `PostSystemmappen` (`dienst.postSystemmappen`) | `schreibeSystemMappe`, `spiegleBenutzer`, `gleicheBenutzerAb`, Rollen, Systemkonten (#673); `SystemkontoEintrag` |
| `eingangskanaele.ts` | `Eingangskanaele` (`dienst.eingangskanaele`) | was Eingangsordner und Postfächer brauchen (#195, #196), gleiche Dateien und `fundstellen` (#333); `Fundstelle` |
| `foto.ts` | `PostFotos` (`dienst.postFotos`) | Post fotografieren (#490): `postAusFotos`, `fotosAnMappe`, `legePostZusammen` |
| `leerseiten.ts` | `PostLeerseiten` (`dienst.postLeerseiten`) | Leerseiten (#997): `lies`, `markiere` (nur Pakete mit `dms:leerseiten`), `waehleSeite` (nur Menschen); beim Übernehmen `plane` (vor dem Verschieben) und `lasseWeg` (neue Fassung, Original als frühere Version) |

- **Tür:** `post/index.ts`; die Routen der Postfächer (`post.routen.ts`) holt nur `routen.ts` direkt. `wandleZuPost` und `ergaenzeSystemfelder` liegen seit #1073 bei den [Mappentypen](#mappentypen).
- **Bekommt den Kern**, die [Rechteprüfung](#zugriff), [Mappentypen](#mappentypen), [Mappen](#mappen), [Dokumente](#dokumente) und die Teile dieses Ordners, `PostFotos` dazu [PDF bearbeiten](#pdf-bearbeiten). Über den Anschluss: Ereignis (`kern.ereignis`), `meldeVerknuepft`, Aufgaben, Konten, Passung, Systemausstattung, Mappen löschen und `sichereZuordnung` aus `erkennung.ts` (die Erkennung bekommt noch den ganzen Dienst und liegt darum nicht unter Schicht 3).
- **Reihenfolge:** `legePostAn` schreibt Mappe, Historie, Titel, `post.angelegt` und die Verknüpfungen in einer Transaktion (die Aufgabe „Post für dich“ legt seit #1001 danach die Automatisierung an – Wenn `mappe.geaendert` mit `angelegt`); der Empfänger `post.aufgaben` am Anschlusspunkt `mappeGeaendert` bleibt der letzte in der Reihe und ruft `post.postAufgaben`.

## Ausgang (#1077) { #ausgang }

`server/src/ausgang/` (Schicht 3) bündelt die [Wege nach draußen](#wege-nach-draussen), auf denen Dateien und Daten Ablago verlassen – Herunterladen, E-Mail, Export, WebDAV-Laufwerk – und ihre **gemeinsame Prüfstelle** (#723):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `pruefstelle.ts` | – | die Regel „R heißt ansehen, E heißt mitnehmen“ (früher `ausgang.ts`): `mitnehmbar`, `pruefeAlle`, Meldungen |
| `ausgang.dienst.ts` | `AusgangDienst` (`dienst.ausgang`) | `exportierbar` (#294), `mitnehmbar`, `pruefeAusgang`; Stempel (`mitStempel`, `stempelPlan`, `laufwerkStempel`, `laufwerkAusgabe`), `notiereWeitergabe`, Original oder Archivfassung, `dokumentFuerAusgabe`, `fassungFuerAusgabe`, `gestempelteSeiten` (#799) |
| `email.ts` | `AusgangEmail` (`dienst.ausgangEmail`) | `versendeMappen`, `versendeMappe` (#58, #151), `emailKopf` (auch für Auskünfte) |
| `export.ts` | `AusgangExport` (`dienst.ausgangExport`) | `exportiere` (#152, #153) |

- **Tür:** `ausgang/index.ts`; die Routen (`ausgang.routen.ts`) holt nur `routen.ts` direkt.
- **Eine Prüfstelle:** Jeder Weg fragt `dienst.ausgang.pruefeAusgang` bzw. `dienst.ausgang.mitnehmbar` – Routen (`http/routen-kontext.ts`, `sichten.routen.ts`), `webdav.ts` und auch E-Mail und Export in diesem Ordner (über ihren Anschluss). `ausgang.test.ts` ersetzt die beiden an `dienst.ausgang` und prüft, dass Herunterladen, E-Mail (eine, mehrere), Export und Laufwerk sie fragen. Ein neuer Weg nach draußen fragt sie, bevor irgendetwas geschieht.
- **Bekommt den Kern**, die Rechteprüfung, Mappentypen, Mappen, Dokumente, die [Sichten](#sichten), die Stempel-Vorlagen ([PDF bearbeiten](#pdf-bearbeiten)) und – für die E-Mail – die Systemmappen der [Post](#post); `entsperrtZu` über den Anschluss.

## PDF bearbeiten (#1077) { #pdf-bearbeiten }

`server/src/pdf-bearbeiten/` (Schicht 3) ist die Fachlogik rund um PDFs; die [PDF-Stelle](#pdf-stelle) `pdf/` mit pdf-lib bleibt Technik und unverändert:

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `pdf-bearbeiten.dienst.ts` | `PdfBearbeiten` (`dienst.pdfBearbeiten`) | Seitenbilder, `seiteAlsGraubild` (#338), `pdfSeiten`, `bearbeitePdf` (teilen, bei Post je Teil eine Post, #335), `fuegePdfZusammen` |
| `verkleinern.ts` | `PdfVerkleinern` (`dienst.pdfVerkleinern`) | PDF verkleinern (#393): Vorschau, am Dokument, automatisch, große Dokumente; `VERKLEINERN_STANDARD`, `GROSSE_MAX` |
| `schwaerzen.ts` | `Schwaerzen` (`dienst.schwaerzen`) | Schwärzen (#392, #459), Seitenbilder auch der Archivfassung (#934) |
| `stempelvorlagen.ts` | `Stempelvorlagen` (`dienst.stempelvorlagen`) | Stempel-Vorlagen und Stempel je Mappentyp (#394) |

- **Tür:** `pdf-bearbeiten/index.ts`; die Routen stehen bei den Dokumenten.
- **Warum ein eigener Ordner:** `pdf/` ist von der Regel `fachordner` ausgenommen (`TECHNIK`), läuft im Arbeiter-Pool und wird von den Dokumenten (Schicht 2) eingebunden. Klassen mit Kern, Mappen und Dokumenten dort hätten die Regel aufgeweicht und einen Kreis über `pdf/index.ts` gebaut.
- **Bekommt den Kern**, die Rechteprüfung, Mappen und Dokumente. Die Post (neue Post beim Teilen, Systemmappe, „Post für dich“) kommt über den Anschluss am Dienst – `post/` hängt Fotos mit `pdfVon` an, andersherum liefe es im Kreis.

## Ereignisse (#1078) { #ereignisse }

`server/src/ereignisse/` (**Schicht 2**) gibt weiter, was der Kern auslöst – den Ausgangskorb selbst (`kern.ereignis`) hat der Kern:

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `ereignisse.dienst.ts` | `EreignisseDienst` (`dienst.ereignisseDienst`) | `neueAufgabe`, `meldeVerknuepft` (#670), `ereignisAnPakete` (#686 nur mit Leserecht, #796 KI-Sperre), `auftrag`, `vektorNachlauf` (#442) |
| `automatisierung.ts` | `Automatisierungshilfen` (`dienst.automatisierungshilfen`) | `automatisierungKontext`, `mitgliederDerRolle`, `trifftTeile`, `lesbareTitel`, `datumVon`, `mappenMitDatum` (#674, #712) |

- **Warum Schicht 2:** Viele brauchen die Ereignisse, auch Mappen und Dokumente; selbst brauchen sie nur Kern, [Rechteprüfung](#zugriff) und die Pakete am Mappentyp samt KI-Freigabe ([Mappentypen](#mappentypen)). Texterkennung ([Volltext](#volltext)) und Rollen ([Post](#post)) kommen über den Anschluss.
- Den Abnehmer `pakete` meldet der Dienst beim Verteiler an; Ereignis auslösen (`kern.ereignis`) und der Wecker des Paket-Läufers (`ereignisWecker`) kommen über den Anschluss.
- **Tür:** `ereignisse/index.ts`, eingebunden als `ereignisse/index` – neben dem Ordner liegt `ereignisse.ts` (der Verteiler des Katalogs), wie bei `pakete/index`.

## Aufgaben (#1078) { #aufgaben }

`server/src/aufgaben/` (Schicht 3) bündelt alles rund um Aufgaben; der Dienst baut die Klassen (`baueAufgaben()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `aufgaben.dienst.ts` | `AufgabenDienst` (`dienst.aufgaben`) | `pruefeEmpfaenger`, Erwähnungen (#56, #81), Freigabe der Favoriten (#506), `aufgabeAusAutomatisierung` (#676, #724), `erledigeNachAnlass` |
| `vertretung.ts` | `AufgabenVertretung` (`dienst.vertretung`) | Vertretung (#78), vergeben, erledigen, weitergeben (auch gesammelt, #415), `abwesenheitGeaendert`, `meineAufgaben` |
| `ohne-leserecht.ts` | `OhneLeserecht` (`dienst.ohneLeserecht`) | Aufgaben bei Personen ohne Leserecht, Fälle, Leserecht auf Zeit (#798, #958) |
| `fristen.ts` | `Fristen` (`dienst.fristen`) | Fristen, Termine samt Zwischenspeicher, Folgetermin (#129–#133, #528, #725); der tägliche Lauf ruft die fälligen Mappen-Abläufe |
| `ohne-empfaenger.ts` | `OhneEmpfaenger` (`dienst.ohneEmpfaenger`) | Alltags-Benutzer (#719), Favoriten benachrichtigen (#422) |
| `ablaeufe.ts` | `MappenAblaeufe` (`dienst.ablaeufe`) | [Automatisierungsvorlagen und Mappen-Abläufe](#ablaufvorlagen) (#1044): anwenden, geplante laufen lassen (Rechte zur Laufzeit), Werkbank, Vorlagen aus Paketen |

- **Bekommt den Kern** und `AufgabenTeile` (Rechteprüfung, Historie und Mappen, Ereignisse, Rollen der [Post](#post) und einander); über den Anschluss Ereignis (`kern.ereignis`), Konten und die Gültigkeit der Zahlen.
- Die Empfänger an den [Anschlusspunkten](#anschlusspunkte) sind unverändert; sie rufen `aufgaben.pruefeErwaehnungen`, `fristen.fristenAbgleichen` und `vertretung.abwesenheitGeaendert` erst beim Auslösen – Tests ersetzen sie dort.

## Löschen (#1078) { #loeschen }

`server/src/loeschen/` (Schicht 3); der Dienst baut die Klassen (`baueLoeschen()`):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `loeschen.dienst.ts` | `LoeschenDienst` (`dienst.loeschen`) | `loeschPruefung` (#79), `loescheMappe`, `loescheMappen` (#150), `entferneMappenEndgueltig` |
| `papierkorb.ts` | `Papierkorb` (`dienst.papierkorbVerwaltung`) | Papierkorb (#43, #344, #936): wiederherstellen, endgültig löschen, leeren, aufräumen |
| `loeschprotokoll.ts` | `LoeschprotokollVerwaltung` (`dienst.loeschprotokollVerwaltung`) | Löschprotokoll lesen und verwalten (#470); **geschrieben** wird im [Kern](#kern) |
| `mit-verknuepften.ts` | `MitVerknuepften` (`dienst.mitVerknuepften`) | [Baum](#baum-uber-verweise) und Löschen mit verknüpften Mappen (#396, #424) |
| `beispiele.ts` | `BeispielMappen` (`dienst.beispielMappen`) | Beispiel-Mappen aus Paketen (#878) |

- **Bekommt den Kern** und `LoeschenTeile` (Rechteprüfung, Passung, Historie, Dokumente, Ausgang, Sichten, Systemmappen und einander); Ereignis (`kern.ereignis`), `aktualisiereTitel` (`mappenTitel`) und Konten über den Anschluss.
- **Teile (#1031):** `loescheMappe` nimmt die Teile einer Mappe mit (`loescheMitTeilen`: R und D an jedem Teil, sonst 403 mit Anzahl; Papierkorb, Historie, Ereignisse und Löschprotokoll mit Weg `teile` in einer Transaktion, Vorgang = Id der Mappe). Der Papierkorb stellt sie mit ihr wieder her und löscht sie mit ihr endgültig; „mit verknüpften Mappen“ lehnt ab, wenn ein Teil einer gelöschten Mappe bliebe.

## Datenschutz (#1078) { #datenschutz }

`server/src/datenschutz/` (Schicht 3); der Dienst baut die Klassen (`baueDatenschutz()`):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `datenschutz.dienst.ts` | `DatenschutzDienst` (`dienst.datenschutzDienst`) | Auskunft nach Art. 15 DSGVO (#396, #472, #668), Demo-Daten (#248) |
| `vollexport.ts` | `VollexportQuellen` (`dienst.vollexport`) | Datenquellen für Vollexport (#254) und persönlichen Export (#255) |
| `zustellen.ts` | `AuskunftZustellen` (`dienst.auskunftZustellen`) | E-Mail und Abruf-Links mit Abrufcode (#455), „Meine Daten exportieren“ |

- **Bekommt den Kern** und `DatenschutzTeile` (Rechteprüfung, Mappen, Dokumente, Sichten, Ereignisse, Aufgaben, Löschen und einander); Konten, Kurzzustand, Tresor und Export der Automatisierungen über den Anschluss.

## Werkbank (#1078) { #werkbank }

`server/src/werkbank/werkbank.dienst.ts` mit `WerkbankDienst` (`dienst.werkbank`, Schicht 3, nur der Kern): die Ansicht der Werkbank (#281, `werkbankAnsicht`, `setzeWerkbankAnsicht`) und die Merkmale der Ablage (#1032, `merkmale`, `setzeMerkmale`; Einstellung `merkmale`). Gelesen werden die Merkmale überall über `kern.merkmale()` – auch in `zugriff.aufloesung` für die Bedingungen von Rechten, Ansichten und Automatisierungen.

**Anzeige-Bedingungen (#1033):** Die Auswertung steht in `shared/src/anzeige.ts` (`anzeigestand`, `pruefeMitAnzeige`) und gilt für Oberfläche und Server gleich – Pflicht prüfen `mappen/eingaben.ts` (Speichern) und `mappentypen/passung.ts` (Passung) damit, das Formular nutzt sie über `web/src/ablage/anzeige.ts`. Die Bedingungen bauen auf dem Baukasten der Ansichten (`sichten.ts`) auf; nichts außer der Anzeige im Formular hängt an ihnen.

## Was in dienst.ts bleibt (#1078, #1079) { #dienst-rest }

Seit #1079 enthält `dienst.ts` keine Weiterleitungen mehr, nur den Zusammenbau: die Felder der Klassen, den Konstruktor mit den `baue…()`-Methoden, `schliesseEmpfaengerAn()`, die `verbinde…`-Methoden, die Felder, die der Start oder Tests setzen (`mindestensMs`, `sicherungAufgegeben`, `systemkonten`, `ereignisWecker` …), den Verteiler der Ereignisse und den Tresor (`schluesselWechseln`, `verschluesselePaketGeheimnis`, `entschluessele`).

Routen, Module und Tests rufen die Fachdienste an den Feldern des Dienstes (`dienst.mappen.holeMappe(…)`, `dienst.kern.ereignis(…)`, `dienst.ausgang.pruefeAusgang(…)`); Konstanten, Hilfen und Typen holen sie aus der `index.ts` des Fachordners, nicht über `dienst.ts`. Die Rechteprüfung bleibt, wo sie war: in den Fachdiensten und in den Hüllen der Routen (`dokumentRecht`, `maskiere` …). Eine Weiterleitung ist geblieben: `listeDokumente` liest die Dokumente einer Mappe am Repo vorbei, ohne Rechteprüfung (Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren) – das Repo gehört nicht in die Routen. Wer Neues baut, ruft den Fachdienst direkt und legt keine neue Weiterleitung an.

### Schichten { #schichten }

Fachordner rufen nur nach unten; in derselben Schicht dürfen sie einander nutzen (Kreisläufe verbietet `kein-kreislauf`). Die Liste steht zentral in `.dependency-cruiser.cjs` (`SCHICHTEN`) – ein Ordner, den es noch nicht gibt, ist damit schon eingeordnet:

| Schicht | Fachordner |
|---|---|
| 0 | `kern/` – nur sich selbst, `shared/` und die Basis |
| 1 | `zugriff/` |
| 2 | `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (#1078) |
| 3 | alle übrigen Fachordner (`suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/` …) |

Ohne Fachlogik und nicht in den Schichten (`TECHNIK`): `http/`, `pdf/`, `arbeit/`, `laeufer/`. Fachordner ab Schicht 1 dürfen außer Kern und Basis die Werkzeuge `messung.ts`, `vektoren.ts`, die Technik der Dateien (`hochladen.ts`, `verkleinern.ts`, `dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`, `paketvolltext.ts`, #1075), die Technik für Post, Ausgang und PDF bearbeiten (`pdfseiten.ts`, `graubild.ts`, `schwaerzen.ts`, `ausgabe.ts`, `export.ts`, `xlsx.ts`, `zip.ts`, `mail.ts`, #1077), die Technik für Löschen und Datenschutz (`baum.ts`, `schriftstueck.ts`, `auskunft.ts`, `vollexport.ts`, `abruf.ts`, `passwort.ts`, `tresor.ts` – nur `istVerschluesselt`, den Schlüssel reicht der Dienst herein –, #1078), `pdf/` und `arbeit/` einbinden, nie `dienst.ts`. Routen (`*.routen.ts`) gehören zur HTTP-Schicht: Sie dürfen den Dienst und ihren eigenen Fachordner einbinden; `routen.ts` holt sie direkt.

## Abhängigkeiten { #abhaengigkeiten }

Ablago kommt mit **wenig fremdem Code** aus: 8 npm-Pakete im Server, 3 in der Oberfläche, dazu eine Handvoll Alpine-Pakete im Image. Das ist der beste Schutz gegen Angriffe über die Lieferkette und hält Sicherheitsupdates selten und überschaubar – und einer der Hauptgründe, warum Node.js hier gut passt. So soll es bleiben.

**Regel (#543):** Eine neue **Laufzeit-Abhängigkeit** – npm unter `dependencies` oder ein Alpine-Paket per `apk add` im `Dockerfile` – kommt nur mit Begründung im Pull Request (Abschnitt „Neue Abhängigkeiten“ der Vorlage):

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den vorhandenen Abhängigkeiten und Werkzeugen? Oft reicht eine kleine eigene Umsetzung, wie bei den [Sprachdateien](#texte-und-sprachdateien) statt i18next.
- **Lizenz:** verträglich mit Apache-2.0? Bewusst nicht im Image sind z. B. Ghostscript und MuPDF (AGPL).
- **Pflegezustand:** letzte Version, Zahl der Betreuer.
- **Eigene Abhängigkeiten:** was sie mit ins Image bringt.

Die Prüfung **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) meldet im PR neue Laufzeit-Abhängigkeiten als Warnung, entfernte und neue Werkzeuge für Bau und Tests als Notiz und geänderte Versionen in der Zusammenfassung des Laufs – gesperrt wird nichts. Das erledigt das Skript `.github/werkzeuge/abhaengigkeiten-hinweis.py` (nur Python und git); lokal: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. Bekannte Sicherheitslücken und unverträgliche Lizenzen prüft im selben Lauf die Dependency Review von GitHub.

**Heute im Image** (Stand 0.122):

| Paket | Wo | Lizenz | Wozu |
| --- | --- | --- | --- |
| `fastify` | Server | MIT | HTTP-Server, Routen, Prüfung der Anfragen |
| `@fastify/static` | Server | MIT | die Oberfläche als Dateien ausliefern |
| `postgres` (postgres.js) | Server | Unlicense | Zugriff auf PostgreSQL |
| `nodemailer` | Server | MIT-0 | E-Mails über SMTP senden (Einladungen, Hinweise, Mappen versenden) |
| `imapflow` | Server | MIT | Post aus Postfächern über IMAP abholen |
| `mailparser` | Server | MIT | abgeholte E-Mails in Text und Anhänge zerlegen |
| `pdf-lib` | Server | MIT | PDFs zusammenstellen, verkleinern, schwärzen, stempeln – nur über die [PDF-Stelle](#pdf-stelle) |
| `@pdf-lib/fontkit` (fest 1.1.1) | Server | MIT | eigene Schriften in PDFs einbetten (Noto Sans als Teilmenge, [#826](#pdf-schriften)); einzige Abhängigkeit `pako`, die pdf-lib schon mitbringt |
| `yaml` | Server | ISC | Pakete im YAML-Format lesen und schreiben |
| `@simplewebauthn/server` | Server | MIT | [Passkeys](#passkeys) prüfen (WebAuthn: CBOR, COSE-Schlüssel, Signaturen, Zähler) – feste Version; bringt `@peculiar/*` und `asn1js` (MIT/BSD-3-Clause), `@levischuck/tiny-cbor`, `@hexagon/base64`, `tsyringe` (MIT), `reflect-metadata` (Apache-2.0) und `tslib` (0BSD) mit |
| `react`, `react-dom` | Oberfläche | MIT | Oberfläche |
| `qrcode` | Oberfläche | MIT | QR-Code für die Zwei-Faktor-Anmeldung |
| `poppler-utils` | Image (Alpine) | GPL-2.0-or-later, als eigenes Programm aufgerufen | `pdftotext`, `pdftoppm`: Text und Bilder aus PDFs |
| `qpdf` | Image (Alpine) | Apache-2.0 | Struktur von PDFs beim Verkleinern optimieren |
| `postgresql17`, `postgresql17-contrib` | nur `dms-komplett` | PostgreSQL | Datenbank im selben Container; `contrib` für `pg_trgm` |
| `tini`, `su-exec` | nur `dms-komplett` | MIT | Prozesse starten und sauber beenden, PostgreSQL ohne root |

Nur für Bau und Tests (nicht im Image): `typescript`, `tsx`, `esbuild`, `vite` mit `@vitejs/plugin-react` und die Typen unter `@types/…`; für [Stil und Abhängigkeiten](stil.md) (#899) `eslint` mit `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint-community/eslint-plugin-eslint-comments` und `globals` sowie `dependency-cruiser`. Auch hier gilt: lieber Bordmittel – die Tests laufen mit dem Testläufer von Node.js (`node --test`), ohne eigenes Test-Framework.

## dms-komplett: Datenbank-Ordner { #komplett-datenbankordner }

`deploy/komplett/start.sh` startet PostgreSQL und Ablago im Image `dms-komplett`. Für den Ordner `/data/postgres` gilt (#943):

- **Rechte:** Das Skript gibt `/data/postgres` und `/data/postgres/daten` dem Benutzer `postgres` (70) und setzt beide auf `700`. Der Elternordner zählt mit: Ohne `x` daran kommt `postgres` nicht bis zu `daten`, obwohl root dort alles anlegen kann (NAS-Ordner mit `000`). `chown`/`chmod` brechen den Start nicht ab, denn auf Netzwerkfreigaben scheitern sie oft. Danach legt das Skript als `postgres` eine Probedatei in `daten` an und löscht sie wieder. Klappt das nicht, endet der Start vor `initdb` mit einer Meldung samt Link ins Installationshandbuch. Geprüft wird das in `deploy/komplett-probe.sh` (Schritt 5b).
- **Nicht eingebunden:** `datenbankOhneVolume()` (`server/src/anbindung.ts`) prüft mit `aufVolume` (wie Schlüsseldatei, Sicherung und Exporte), ob `/data/postgres` ein eigener Einhängepunkt ist. Wenn nicht: Fehler im Protokoll beim Start, rote Meldung in der Übersicht (`anbindung.ohneVolume`, nicht akzeptierbar) und unter Datenbank-Anbindung.
- **Bewusst kein `VOLUME /data/postgres` im Image.** Ein anonymes Volume sähe nach Schutz aus, hilft aber gerade in den Fällen nicht, um die es geht: `docker run` und „Container neu erstellen“ in der Oberfläche eines NAS legen jedes Mal ein neues, leeres anonymes Volume an. Die alte Datenbank liegt dann unter einem Hash-Namen herum, und Ablago fängt leer an. Nur Compose übernimmt anonyme Volumes beim Neuanlegen. Dazu landet die Datenbank unbemerkt dort, wo Docker liegt (auf einem NAS oft die kleine Systempartition), und die Prüfung oben könnte sie nicht mehr von einem echten Ordner unterscheiden – die Warnung fiele weg. Auch `/data/files`, `/data/geheim` und `/data/sicherung` haben kein `VOLUME` (#115), und ein `VOLUME` lässt sich in abgeleiteten Images nicht zurücknehmen. Deshalb: kein `VOLUME`, dafür eine laute Warnung und eine Anleitung zum Retten.
- **Stoppen:** Die Vorlage `deploy/komplett/docker-compose.yml` setzt `stop_grace_period: 60s`, damit Ablago und PostgreSQL sauber herunterfahren. Die Vorlagen mit zwei Containern brauchen das nicht: Das Image `postgres` beendet sich mit `SIGINT` („fast shutdown“) innerhalb der üblichen 10 Sekunden.

## PDF-Stelle { #pdf-stelle }

Alle Arbeiten an PDFs mit **pdf-lib** liegen in einem Ordner: `server/src/pdf/` (#541). Nur dort wird pdf-lib eingebunden; die Prüfung `server/test/pdf-stelle.test.ts` (läuft mit `npm test` in der CI) schlägt fehl, sobald Server, Oberfläche oder `shared` pdf-lib anderswo importieren – auch per `import()` oder `require()`. Tests dürfen pdf-lib weiter nutzen, um erzeugte PDFs zu untersuchen.

```
server/src/pdf/index.ts          öffentliche Schnittstelle – alle Module importieren von './pdf'
server/src/pdf/seiten.ts         Seiten zählen, drehen, löschen, umsortieren, teilen, zusammenfügen, Fotos als Seiten
server/src/pdf/stempel.ts        Stempel und Fußzeile beim Weitergeben, Bild als A4-Seite
server/src/pdf/verkleinern.ts    Bilder herunterrechnen (über pdftoppm), Struktur aufräumen (qpdf)
server/src/pdf/schwaerzen.ts     Seiten neu aufbauen, schwärzen, Textebene ohne geschwärzte Wörter
server/src/pdf/schreiber.ts      Textdokumente nach Plan (Auskunft, Löschkonzept, Löschprotokoll)
server/src/pdf/export.ts         PDF mehrerer Mappen
server/src/pdf/aufkleber.ts      Aufkleberbogen mit Barcode
server/src/pdf/anzeige.ts        bereinigte Kopie für die Anzeige im Browser (#639)
server/src/pdf/demo-dokumente.ts Demo-Dokumente
server/src/pdf/schrift.ts        Noto Sans als eingebettete Teilmenge für alle eigenen PDFs, Ersatzzeichen (#826)
server/src/pdf/bild.ts, puffer.ts, text.ts   Bildart, JPEG-Maße, EXIF; Umgehung #456; Dateigröße
```

**Regeln für neuen Code**

- Fachliches bleibt draußen: Was auf ein PDF kommt (Texte, Felder ohne Passwörter, Rechte, Platzhalter), entscheidet das jeweilige Modul (`export.ts`, `auskunft.ts`, `ausgabe.ts` …). In die PDF-Stelle geht nur, **wie** gezeichnet oder umgebaut wird.
- Die Vorgänge nehmen und liefern **einfache Daten** – Bytes (`Buffer`/`Uint8Array`), Zahlen, Texte, Listen –, nie Objekte von pdf-lib. Textdokumente beschreibt der Aufrufer als Plan (`Anweisung[]`: Text, Linie, Abstand, Tabelle, neue Seite) und lässt ihn mit `textdokumentPdf()` zeichnen. So laufen alle Vorgänge im [Arbeiter-Pool](#arbeiter-pool) (#542): `pdf/index.ts` gibt sie dorthin; ein neuer Vorgang kommt zusätzlich in `arbeit/vorgaenge.ts`.
- PDFs lädt die PDF-Stelle nur über `ladePdf()` (`pdf/laden.ts`, #823), nie direkt mit `PDFDocument.load`: Es prüft vorher, wie groß sich die Objekt- und Querverweis-Ströme entpacken (höchstens 64 MB je Strom, 256 MB zusammen) – sonst belegt ein präpariertes PDF von wenigen MB beim Laden mehrere GB, an der Speichergrenze der Arbeiter vorbei. Außerdem müssen ihre Angaben (`/W`, `/Index`, `/Size`, `/N`, `/First`) zur Länge des Stroms passen; sonst liefe pdf-lib beim Laden fast endlos.
- Bilder gehen nur über `eigenerPuffer()` an pdf-lib (#456: pdf-lib übersieht den Versatz eines Buffers im gemeinsamen Speicher und meldet bei JPEGs „SOI not found“).
- Text kommt nur über `schriften()` und `pdfText()` aus `pdf/schrift.ts` aufs PDF (#826): Noto Sans als Teilmenge, Text nach NFC, fehlende Zeichen als „�“. Keine Standardschriften (`StandardFonts`) für neuen Text; Ausnahme sind nur die Codes im Notfallblatt (Courier, reines ASCII). Mehr unter [Schriften der eigenen PDFs](#pdf-schriften).
- Die PDF-Stelle schreibt nichts ins Protokoll und liest keine Einstellungen. Was der Aufrufer wissen soll, steht im Ergebnis (z. B. `hinweise` beim Verkleinern). Einzige Ausnahme ist der Hinweis auf fehlende Zeichen: Ihn gibt der Arbeiter neben dem Ergebnis zurück (`zeichen` in der Antwort), und der Pool schreibt ihn ins Protokoll.
- Fachfehler mit verständlicher Meldung (`Fachfehler(422, …)`) dürfen aus der PDF-Stelle kommen, etwa für verschlüsselte oder kaputte PDFs.

### Bewertung der PDF-Bibliotheken (#822) { #pdf-bibliotheken }

**pdf-lib (MIT) ist die einzige verbreitete Bibliothek in reinem JavaScript, die bestehende PDFs bearbeiten und neue erzeugen kann.** pdfkit, pdfmake und jsPDF erzeugen nur neue PDFs, PDF.js liest und zeigt nur an. Die letzte Version 1.17.1 stammt von Ende 2021; seitdem gibt es keine Weiterentwicklung. Einen Fehler darin umgehen wir schon (#456). Ein Austausch ist **nicht** Teil von #541 – die Kapselung macht ihn aber überschaubar.

**Was Ablago braucht und was die Werkzeuge können** (Stand 04.11.2026):

| Werkzeug | A | B | C | D | E | F | G | H | I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **pdf-lib 1.17.1** (heute) | ja | ja | ja | ja | ja (Umgehung #456) | teilweise | ja | ja (MIT) | **nein** (2021) |
| **@cantoo/pdf-lib** 2.11.1 | ja | ja | ja | ja | ja | teilweise | ja | ja (MIT) | ja (15.09.2026) |
| **@pdfme/pdf-lib** 6.2.8 | ja | ja | ja | ja | ja | teilweise | ja | ja (MIT) | ja (23.10.2026) |
| pdfkit | nein | nein | nur in neuen PDFs | ja | ja | nein | ja | ja (MIT) | ja |
| pdfmake (auf pdfkit) | nein | nein | teilweise, nur neue | ja (aus Beschreibung) | ja | nein | ja | ja (MIT) | ja |
| jsPDF | nein | nein | nur in neuen PDFs | ja | ja | nein | ja | ja (MIT) | ja |
| PDF.js | nein | nein | nein | nein | nein | teilweise (lesen, Text) | ja | ja (Apache-2.0) | ja |
| qpdf (im Image) | teilweise (Struktur, Objekte, Entschlüsseln) | ja | teilweise (Überlagern, Drehen; kein Text) | nein | nein | ja (`--check`, JSON) | **nein** (eigenes Programm) | ja (Apache-2.0) | ja |
| PDFium als WebAssembly (z. B. `@embedpdf/pdfium`) | ja | ja | ja (über die C-Schnittstelle) | ja | ja | teilweise | ja (WebAssembly) | ja (Apache-2.0/BSD) | Engine ja, Aufsatz jung |
| MuPDF.js | ja | ja | ja | ja | ja | ja | ja (WebAssembly) | **nein** (AGPL-3.0) | ja |

Die Spalten – wofür Ablago sie braucht und woher sie kommen:

- **A – bestehende PDFs im Inneren bearbeiten:** Bilder neu packen und Strukturen aufräumen ([#393](https://github.com/motom001/dms/issues/393)), die bereinigte Kopie für die Anzeige ohne Skripte und Aktionen ([#639](https://github.com/motom001/dms/issues/639)), Stempel in vorhandene Seiten ([#394](https://github.com/motom001/dms/issues/394)).
- **B – Seiten:** drehen, löschen, umsortieren, teilen ([#335](https://github.com/motom001/dms/issues/335)), Fotos als Seiten ([#490](https://github.com/motom001/dms/issues/490)), Seiten mehrerer Mappen zusammenfügen ([#152](https://github.com/motom001/dms/issues/152)).
- **C – auf Seiten zeichnen, auch Deckkraft, Drehen und Mischmodus:** Stempel und Wasserzeichen ([#394](https://github.com/motom001/dms/issues/394)), Farben und Mischmodus ([#799](https://github.com/motom001/dms/issues/799)).
- **D – neue PDFs erzeugen:** Textdokumente nach Plan ([#541](https://github.com/motom001/dms/issues/541)), Export mehrerer Mappen ([#152](https://github.com/motom001/dms/issues/152)), Aufkleberbogen ([#345](https://github.com/motom001/dms/issues/345)), Demo-Dokumente ([#248](https://github.com/motom001/dms/issues/248)).
- **E – Bilder einbetten:** Fotos als PDF ([#490](https://github.com/motom001/dms/issues/490)), Neuaufbau beim Schwärzen ([#392](https://github.com/motom001/dms/issues/392)), JPEG aus einem geteilten Speicher ([#456](https://github.com/motom001/dms/issues/456)).
- **F – prüfen:** PDF/A-Kennung, Verschlüsselung, Signatur und Textebene für die Archivfassung ([#631](https://github.com/motom001/dms/issues/631)).
- **G – ohne native Teile:** Die Vorgänge laufen im Arbeiter-Pool ([#542](https://github.com/motom001/dms/issues/542)); native Module widersprechen der schlanken Abhängigkeitsliste. qpdf und poppler sind eigene Programme im Image, keine Module.
- **H – Lizenz passt zu Apache-2.0:** MIT, BSD und Apache-2.0 ja; AGPL nein (deshalb sind MuPDF und Ghostscript bewusst nicht im Image).
- **I – gepflegt:** neue Versionen in den letzten zwölf Monaten und Antworten auf Meldungen.

**Mehrere kleine Pakete ersetzen pdf-lib nicht.** Für A, B und C – bestehende PDFs bearbeiten – gibt es in reinem JavaScript nur die pdf-lib-Familie (das Original und seine Abspaltungen). Ein Erzeuger wie pdfkit käme nur zusätzlich dazu.

**Wege** (die Entscheidung bereitet [#823](https://github.com/motom001/dms/issues/823) vor, siehe [unten](#pdf-entscheidung)):

| Weg | Was dafür spricht | Was dagegen spricht |
| --- | --- | --- |
| **a) pdf-lib bleibt** (heute) | Läuft stabil, alle Funktionen und Tests bauen darauf; MIT; vier kleine eigene Abhängigkeiten (`pako`, `tslib`, Standardschriften, `upng`) | Keine Fehlerbehebungen und keine Sicherheitsupdates mehr; Umgehungen wie #456 bleiben unsere Sache |
| **b) `@cantoo/pdf-lib`** (gepflegte Abspaltung) | Gleiche Schnittstelle, regelmäßige Versionen (21 Versionen 2026), MIT; Korrekturen beim Lesen; `crypto-js` seit 2.9.0 entfernt | Fast alle Änderungen seit 2025 von einer Person; seit 2.11 nur minifizierte Builds; Packaging-Regressionen (ESM-Build, `prepare: husky`); HTML-Parser und Farben als Abhängigkeiten |
| **c) Eigene Kopie** in `server/src/pdf/` | Keine neue Abhängigkeit; nur die Korrekturen, die uns betreffen | Wir werden selbst Betreuer; Dependabot und OSV erfassen die Kopie nicht mehr |
| `@pdfme/pdf-lib` (Abspaltung des Projekts pdfme) | Gleiche Schnittstelle, gepflegt (6.2.8 vom 23.10.2026), MIT | Ein einzelner Betreuer; ebenfalls zusätzliche Abhängigkeiten (HTML-Parser, Farben) |
| Mehr über qpdf (schon im Image, Apache-2.0) | Robust und gepflegt (C++); kann Seiten drehen, auswählen, umsortieren, teilen, zusammenfügen, überlagern, entschlüsseln (#827) und Strukturen optimieren – ohne neue Abhängigkeit; eigener Prozess | Zeichnet keine Texte und bettet keine Bilder ein: Stempel, Export-Seiten, Aufkleber, Textdokumente und der Neuaufbau beim Schwärzen bräuchten einen eigenen Schreiber (Ansatz im Test-Helfer `server/test/hilfen-einfach-pdf.ts`); jeder Aufruf schreibt Dateien |
| PDFium als WebAssembly (Apache-2.0, Engine von Chrome) | Sehr leistungsfähig: liest, bearbeitet, zeichnet und rendert; keine nativen Module | Der Aufsatz für JavaScript ist jung und auf den Browser ausgerichtet; groß (mehrere MB WebAssembly); Schnittstelle nah an C, also viel eigener Code |
| MuPDF, Ghostscript | Sehr leistungsfähig | AGPL – bewusst nicht im Image |

**Stand und Quellen** (04.11.2026): Versionen, Daten, Abhängigkeiten und Größen aus der npm-Registry (`npm view <paket> time dependencies dist.unpackedSize`); Funktionsumfang aus der Dokumentation der Projekte (pdf-lib.js.org, github.com/cantoo-scribe/pdf-lib, github.com/pdfme/pdfme, pdfkit.org, pdfmake.org, github.com/parallax/jsPDF, mozilla.github.io/pdf.js, qpdf.readthedocs.io, pdfium.googlesource.com, github.com/embedpdf, mupdf.readthedocs.io); Vorab-Sichtung des Forks im Kommentar zu #823. Wer die Bewertung erneuert, ändert das Datum und prüft vor allem die Spalte I.

### Entscheidungsgrundlage: bleiben, cantoo, eigene Kopie (#823) { #pdf-entscheidung }

**Entschieden (11.11.2026, Maintainer): Weg a – pdf-lib 1.17.1 bleibt** und wird nur um die nötigen Funktionen erweitert: `@pdf-lib/fontkit` 1.1.1 für eingebettete Schriften, mit drei Pflicht-Vorkehrungen (Schrift aufbereiten, `ccmp: false`, NFC; siehe [Schriften der eigenen PDFs](#pdf-schriften)). `@cantoo/pdf-lib` wird neu bewertet, sobald Chinesisch, Japanisch oder Koreanisch in eigenen PDFs nötig wird. Die Grundlage dafür:

**Probelauf (11.11.2026, Kommentar in #826)** – Testtext in sechs Sprachen, Noto Sans als Teilmenge in Brief und Stempel:

| | vorher | a: + `@pdf-lib/fontkit` 1.1.1 | b: cantoo + `@cantoo/fontkit` |
| --- | --- | --- | --- |
| Laufzeit-Module im Image | 21,8 MB | 26,1 MB | 42,8 MB |
| „?“ im Ergebnis | 229 | 0 | 0 |
| Chinesisch, Japanisch, Koreanisch | – | geht nicht (Teilmenge der CFF-Schrift ungültig) | geht |
| Arabisch gemischt mit Ziffern | – | Ziffern verdreht (keine Bidi-Ordnung) | ebenso |
| `npm audit` | 0 | 0 | 0 |

Mit cantoo liefen 473 von 474 PDF-Tests grün (die Abweichung: #456 ist dort behoben), die Bomben scheitern weiter an `ladePdf()`, aber jeder Import lädt `culori`, einen HTML-Parser und `html-entities`, und `@pdf-lib/fontkit` stürzt mit cantoo ab.

Was vor der Entscheidung geprüft war (Stand 04.11.2026):

**Lebenszeichen** (npm-Registry): `pdf-lib` zuletzt 1.17.1, Paket zuletzt geändert am 12.05.2022. `@cantoo/pdf-lib`: Versionen je Jahr 2021: 20, 2022: 9, 2023: 39, 2024: 20, 2025: 13, 2026: 21; zuletzt 2.11.1 vom 15.09.2026; sechs Personen dürfen auf npm veröffentlichen, die Commits seit 2025 stammen laut Vorab-Sichtung fast alle von einer Person. `@pdfme/pdf-lib` zuletzt 6.2.8 vom 23.10.2026. Eine Wiederbelebung des Originals ist nicht bekannt.

**Abhängigkeiten von cantoo 2.11.1:** `tslib`, `culori`, `fflate`, `node-html-better-parser`, dazu `html-entities` als Peer. `crypto-js`, `pako`, `color`, `@pdf-lib/upng` und `@pdf-lib/standard-fonts` sind laut CHANGELOG entfernt bzw. eingebettet. HTML-Parser und `culori` dienen dem Zeichnen von SVG und HTML; ob sie bei unseren Aufrufen geladen werden, zeigt erst der Probelauf. Paketgröße entpackt: 26,3 MB (pdf-lib 1.17.1: 19,5 MB) – der größte Teil sind mehrere Builds.

**Umfang einer eigenen Kopie (Weg c):** pdf-lib 1.17.1 hat 139 Quelldateien mit 22.740 Zeilen TypeScript. Davon nutzen wir die Formulare nicht (`api/form`, `core/acroform`, Anmerkungen: zusammen etwa 6.900 Zeilen); übrig bleiben etwa 15.800 Zeilen für Parser, Objekte, Ströme, Schreiber, Einbetten und die Seiten-API. Dazu kämen Standardschriften, `upng` und `pako` (oder `node:zlib`). Für den Betrieb bräuchte es einen festen Ablauf: monatlich die Releases und Security-Advisories von cantoo und dem Original abgleichen, eine Notiz in `SECURITY.md`, dass wir den Code selbst betreuen, und die Fuzz-Tests unten als Pflicht. Geschätzter Aufwand: einige Stunden im Monat, mehr bei einer Meldung.

**Was die Tests heute zeigen (unabhängig vom Weg):**

- Alle Ladestellen der PDF-Stelle laufen im Arbeiter-Pool und laden über `ladePdf()` – die Prüfung `pdf-stelle.test.ts` hält das fest (unten).
- Die Fuzz-Tests (unten) fanden zwei Arten von Fehlern, beide behoben:
    - **Hänger und Speicher:** Querverweis-Ströme mit unmöglichen Breiten (`/W [1 2 2147483647]`) oder Bereichen (`/Index [0 2147483647]`) ließen pdf-lib 1.17.1 beim Laden Milliarden Schritte laufen – ein PDF von gut 1 KB hielt einen Arbeiter bis zur Zeitgrenze von 10 Minuten fest oder füllte seinen Speicher. `ladePdf()` prüft diese Angaben jetzt gegen die entpackte Länge des Stroms (auch `/N` und `/First` bei Objektströmen, höchstens 10 Millionen Einträge) und lehnt Unmögliches mit 422 ab. Die Beispiele liegen im Korpus (`querverweis-*.pdf`). Ob cantoo hier robuster ist, gehört zum Probelauf.
    - **Meldungen:** Kaputte Strukturen (kreisförmiger Seitenbaum, falsche Objektarten) endeten beim Stempeln, bei den Seiten und beim Verkleinern mit Fehlern aus pdf-lib. Jetzt kommt „lässt sich nicht als PDF lesen“ bzw. „ließ sich nicht lesen und darum nicht stempeln“.

**Damals offen, inzwischen mit dem Probelauf oben beantwortet:** der Probelauf mit `@cantoo/pdf-lib` – laufen alle PDF-Tests unverändert grün, ist #456 dort behoben, wie groß wird das Image, wie viel Speicher braucht es, scheitert das Bomben-PDF auch dort an `ladePdf()` (sollte es: die Prüfung läuft vor der Bibliothek) und welche Abhängigkeiten lädt es bei unseren Aufrufen. So lässt er sich ohne Änderung am Repository nachholen: cantoo in ein leeres Verzeichnis installieren und die Tests mit einem Lade-Hook starten, der `pdf-lib` auf dieses Verzeichnis umlenkt (`node --import <hook> --import tsx --test test/pdf*.test.ts test/stempel.test.ts …`). Die Liste der Änderungen gegenüber 1.17.1 (Lesen, neue Funktionen, Sonstiges) steht in der Vorab-Sichtung in #823 und ist hier nicht erneut geprüft.

**Kriterien aus Sicht der Sicherheit** (Kommentar zu #823): a) nur mit den Schutzmaßnahmen um pdf-lib herum; b) Haupteinwand `crypto-js` entfällt, offen bleiben minifizierte Builds, Packaging und ein einzelner Betreuer – mit fester Version und geprüftem Lockfile; c) fester Abgleich, Notiz in `SECURITY.md`, Fuzzing Pflicht. Arbeiter, Zeitgrenze, `ladePdf()` und die Fuzz-Tests bleiben bei jedem Weg.

### Schriften der eigenen PDFs (#826) { #pdf-schriften }

Alle PDFs, die Ablago selbst erzeugt – Stempel, Brief, Mappen-Export, Aufkleber, Textdokumente (Auskunft, Löschkonzept, Löschprotokoll), Notfallblatt, Demo-Dokumente und die unsichtbare Textebene beim Schwärzen –, betten **Noto Sans** (SIL Open Font License 1.1) als **Teilmenge** ein: nur die Zeichen, die vorkommen. Vorher waren es die Standardschriften Helvetica und Courier mit WinAnsi; alles außerhalb von Westeuropa wurde still zu „?“.

- **Schnitte:** Normal, Fett, Kursiv, FettKursiv und Noto Sans Mono für `Code` im Brief. Das Notfallblatt behält Courier fett für Schlüssel, Codes und Ablage-Id – sie bestehen nur aus ASCII.
- **Zeichenumfang:** Lateinisch mit Erweiterungen (Türkisch, Polnisch, Tschechisch, Rumänisch …) und Vietnamesisch, Griechisch, Kyrillisch, dazu Satz-, Währungs- und einige Sonderzeichen. Die Liste steht in `BEREICHE` des Skripts unten.
- **Dateien:** `server/schriften/` (fünf Schnitte, zusammen 1,4 MB, mit `OFL.txt`) im Repository und im Image. Der Docker-Bau braucht so kein Python.
- **Einmal je Arbeiter:** `pdf/schrift.ts` liest die Dateien einmal, fontkit wertet jede einmal aus und merkt sich gesetzte Texte. Jedes PDF bettet danach nur seine Teilmenge ein. Der Name der Teilmenge bekommt beim Speichern das übliche Kürzel aus sechs Großbuchstaben (`ABCDEF+NotoSans-Regular`, aus den verwendeten Zeichen). Gleiche Zeichen ergeben gleiche Dateien, die Demo-Dokumente bleiben bei gleichem Startwert gleich.

**Drei Pflicht-Vorkehrungen** – ohne sie ist das Ergebnis falsch, obwohl es auf den ersten Blick stimmt:

1. **Schrift aufbereiten:** `server/werkzeuge/schriften/aufbereiten.py` (fontTools) kürzt die Schrift auf die Bereiche oben, entfernt das Hinting und schreibt sie mit `glyf.padding = 4` neu. Mit den Originaldateien beschädigt `@pdf-lib/fontkit` 1.1.1 die Teilmenge: Im Probelauf waren etwa 60 % der Zeichen unsichtbar, `pdftotext` meldete trotzdem alles richtig. Neue Fassung von Noto Sans: `python3 server/werkzeuge/schriften/aufbereiten.py <quellordner> server/schriften`, danach `schriften.test.ts`.
2. **`features: { ccmp: false }` beim Einbetten:** Sonst fasst fontkit Zeichen zusammen, und Kopieren oder Suchen liefert falschen Text (aus „Thị Liste office“ wird „Thị Lịste offịce“). Die Merkmale für Abstände (`kern`, `mark`, `mkmk`) sind ebenfalls aus. pdf-lib wertet sie nicht aus, aus spart nur Zeit.
3. **Text nach NFC:** pdf-lib setzt kombinierende Zeichen ohne ihren Versatz. `pdfText()` wandelt jeden Text vorher um, so steht „ễ“ als ein Zeichen im PDF.

Dazu eine Umgehung in `schrift.ts`: fontkit merkt sich jede Glyphe mit den Zeichen ihres ersten Gebrauchs. Weil die Schrift je Arbeiter nur einmal ausgewertet wird, trägt `schrift.ts` die Zeichen nach, sobald sie bekannt sind. Sonst fehlte im zweiten PDF z. B. dem „u“ (Bestandteil von „ü“) die Zuordnung, und Kopieren lieferte „�“.

**Fehlt ein Zeichen** in der Schrift (Arabisch, Hebräisch, Chinesisch, Emoji …), steht im PDF das Ersatzzeichen „�“. Unsichtbare Zeichen wie Variantenwähler fallen weg. Der Arbeiter gibt die fehlenden Zeichen neben dem Ergebnis zurück, und der Pool schreibt **einmal je Auftrag** eine Warnung ins Protokoll (Modul „Dokumente“, mit Vorgang und Unicode-Nummern).

**Messung** (11.11.2026, Brief mit Beispieltexten in sechs Sprachen und allen fünf Schnitten aus `server/test/hilfen-schriften.ts`, Mittel über zehn Briefe mit geändertem Text):

| | vorher (Helvetica, WinAnsi) | Noto Sans als Teilmenge |
| --- | --- | --- |
| Größe | 13,6 KB, 217 „?“ | 41,9 KB, kein „?“ |
| Zeit je Brief | 14 ms | 36–41 ms (erster Brief im Arbeiter: 170 ms, liest und wertet die Schriften aus) |
| Stempel auf eine leere Seite (PDF vorher 0,6 KB) | 1,7 KB, 5 ms | 4,8 KB, 20 ms |

**Standardschriften bleiben nicht für reinen WinAnsi-Text**, obwohl sie kleiner und schneller wären. Gründe: Die Archivfassung (PDF/A) verlangt eingebettete Schriften. Mit zwei Wegen sähe ein Brief je nach Inhalt anders aus und bräche anders um. Und die Unterschiede (rund 30 KB, rund 25 ms je PDF) fallen neben den Dokumenten selbst kaum ins Gewicht.

**Grenzen:** Schriften von rechts nach links (Arabisch, Hebräisch) und Chinesisch, Japanisch, Koreanisch kommen **nicht** mit:

- Die CJK-Schriften sind CFF-Schriften. Deren Teilmenge bildet fontkit 1.1.1 ungültig.
- Für Arabisch und Hebräisch fehlt die Bidi-Ordnung, Ziffern stünden verdreht.
- Eine CJK-Schrift allein hat gut 16 MB (Noto Sans CJK SC, ein Schnitt). Das passt nicht zur Grenze für die Größe des Images und zu Mission 2 („flott auch auf kleiner Hardware“).

Kommen solche Sprachen dazu, gehören die Schriften in **Sprachpakete** ([#731](https://github.com/motom001/dms/issues/731)), und `@cantoo/pdf-lib` wird neu bewertet (siehe oben). Bis dahin erscheint „�“ mit Hinweis im Protokoll.

**Tests:** `server/test/schriften.test.ts`. Er liest die Beispieltexte aus dem Brief wieder aus, prüft `ccmp` und NFC, bettet die Teilmenge mit ToUnicode und Kürzel ein und deckt alle Erzeuger ab. Vor allem prüft er die **Anzeige**: Jedes Zeichen der Beispiele wird je Schnitt einzeln mit `pdftoppm` gerendert und muss Tinte zeigen, im zweiten PDF desselben Arbeiters. Mit einer unaufbereiteten Schrift schlägt genau dieser Test fehl.

### Tests mit kaputten PDFs (#823) { #pdf-fuzz }

`server/test/pdf-fuzz.test.ts` füttert absichtlich beschädigte und zufällig veränderte PDFs in alle Lesestellen – über den Arbeiter-Pool wie im Betrieb: Seiten, Verkleinern (Schätzung), Stempel, Anzeige, Archivprüfung und Textebene. Erwartet wird: kein Absturz des Arbeiters (500), kein Speicherabbruch (507), kein Hänger (504, und jeder Fall unter 30 Sekunden) und bei Seiten, Verkleinern und Stempel eine verständliche Meldung (422). Anzeige und Archivprüfung fangen Fehler selbst ab (nur Herunterladen bzw. „nicht lesbar“).

- **Korpus:** `server/test/pdf-korpus/*.pdf` – kleine, kaputte Beispiele (kreisförmiger Seitenbaum, tiefe Verschachtelung, falsche Querverweise und Längen, abgeschnitten, Verweise ins Leere, kaputte Verschlüsselung, kein Kopf). Die Objektstrom-Bombe erzeugt der Test selbst.
- **Zufall:** Ein eigener kleiner Mutator (Bytes kippen, abschneiden, Bereiche löschen oder doppeln, Zahlen verfälschen, Ströme tauschen, Syntax einstreuen, `startxref` verbiegen) mit festem Startwert – ohne neue Abhängigkeit.
- **Laufen lassen:** `cd server && node --import tsx --test test/pdf-fuzz.test.ts`. In der normalen CI 120 Fälle (Vorgabe). Mehr: `DMS_FUZZ_FAELLE=5000`, anderer Startwert: `DMS_FUZZ_SEED=7`. Nach Zeitplan läuft `.github/workflows/fuzz.yml` (wöchentlich und von Hand) mit 5.000 Fällen und wechselndem Startwert.
- **Fund nachstellen:** Die Meldung nennt Startwert, Fall und Ausgangs-PDF. Mit `DMS_FUZZ_AUSGABE=/tmp/funde` liegt das auslösende PDF danach dort.
- **Neues kaputtes Beispiel hinzufügen:** Die Datei (klein halten, ein paar KB) unter einem sprechenden Namen nach `server/test/pdf-korpus/` legen – sie ist dann automatisch Teil des Korpus und geht in alle Lesestellen. Nur Beispiele ohne echte Daten, mit Persona-Namen.
- **Gefundene Fehler:** Lücken mit Sicherheitsbezug (Absturz, Speicher, Hänger) bekommen erst ein öffentliches Issue mit Einzelheiten, wenn der Fix gemergt ist; vorher an Sicherheit melden (`SECURITY.md`).

**Scorecard „Fuzzing“:** Die Prüfung erkennt OSS-Fuzz, ClusterFuzzLite und Fuzz-Funktionen einiger Sprachen, bei JavaScript und TypeScript Property-Based-Tests mit `fast-check`. Den eigenen Mutator erkennt sie nicht; die Prüfung bleibt also unerfüllt, solange `fast-check` (nur `devDependencies`) nicht dazukommt. Das entscheidet der Maintainer, ebenso die Angaben bei Scorecard und beim OpenSSF Best-Practices-Badge.

### Grenzen der Lesestellen (#542, #823) { #pdf-grenzen }

- Jede Stelle, die mit pdf-lib ein fremdes PDF öffnet, liegt in `server/src/pdf/` und läuft über `arbeite()` im Arbeiter-Pool. `pdf-stelle.test.ts` prüft: `PDFDocument.load` steht nur in `pdf/laden.ts`; außerhalb der PDF-Stelle gibt es nur Typen aus ihren Modulen; `pdf/index.ts` gibt direkt nur Helfer weiter, die kein PDF laden; jedes Modul mit `ladePdf()` kennt der Arbeiter (`arbeit/vorgaenge.ts`). Mit `DMS_ARBEITER=0` laufen die Vorgänge bewusst im Hauptfaden.
- poppler (`pdftotext`, `pdftoppm`, `pdfinfo`) und qpdf laufen als eigene Prozesse mit Zeitgrenze.
- **Speicher:** Die Grenze von 1,5 GB gilt **je Arbeiter** und erfasst nur den JS-Heap; die Entpack-Grenze in `ladePdf()` schützt vor großen `ArrayBuffer`. Bei N Arbeitern kann der Bedarf im Grenzfall N × 1,5 GB betragen. Auf kleinen Geräten (Raspberry Pi mit 2–4 GB) deshalb `DMS_ARBEITER=1` setzen.

### Geschützte PDFs (#827) { #pdf-geschuetzt }

`server/src/entsperren.ts` erkennt geschützte PDFs (`qpdf --requires-password`, nur wenn `/Encrypt` im Inhalt steht) und legt mit `qpdf --decrypt` eine **entsperrte Fassung** an. Sie liegt wie die umgewandelten Fassungen (#577) unter `<haushalt>/fassungen/` am Prüfwert des Originals, mit `entsperrt` in den Angaben (`FassungInfo`). Vorschau (`vorschau.ts`), Volltext (`texterkennung.ts`), Stempel und Verkleinern (`ausgabe.ts`, über `Ausgabekontext.entsperrt`), Archivfassung (`archivfassung.ts`, Quelle `lesefassung`) und die Anzeige (`GET /dokumente/{id}/inhalt` ohne `herunterladen`) nehmen sie; Herunterladen liefert das Original.

- **Passwort:** nur über die Standardeingabe (`--password-file=-`), nie in der Befehlszeile; nie in Datenbank, Protokoll oder Historie. Ein Test prüft die Argumente von qpdf.
- **Grenzen:** fünf falsche Passwörter je Person und Dokument in 15 Minuten, danach 429; qpdf mit Zeitgrenze (60 s, gemerkte Passwörter 20 s je Versuch, 2 Minuten je Dokument).
- **Gemerkte Passwörter:** Einstellung `dokpasswoerter_<konto>`, jedes Passwort einzeln mit dem Tresor verschlüsselt (Art „Gemerkte Passwörter für Dokumente“ in Werkbank → Verschlüsselung, beim Schlüsselwechsel umgeschlüsselt). Routen `/api/konto/dokument-passwoerter…` nur in der eigenen Sitzung (kein API-Schlüssel, keine Vertretung); Anzeigen und Ändern des Passworts nur nach `…/bestaetigen` (5 Minuten je Sitzung). Neue Post mit „Für“ probiert die Passwörter dieser Person (`DokumenteDienst.neueDateien` → `PdfEntsperren.neu`).

### Anzeige von PDFs im Browser (#639) { #pdf-anzeige }

Dateien liefert der Server mit `dateiKoepfe` (`routen.ts`) aus: alles außer PDF mit einer strengen Content-Security-Policy samt `sandbox`. PDFs brauchen den eingebauten Betrachter des Browsers und bekommen diese Policy nicht – deshalb sieht der Browser **nie das Original**, wenn er ein PDF anzeigt:

- `fuerAnzeige()` in `http/routen-kontext.ts` greift bei jeder Antwort mit `anzeigen: true` und `application/pdf` ohne API-Schlüssel – also beim Ansehen in der Oberfläche: `GET /api/dokumente/:id/inhalt`, `…/versionen/:nummer/inhalt`, `…/fassung` und `…/archivfassung` (jeweils ohne `herunterladen`).
- `pdfanzeige.ts` holt die bereinigte Kopie aus der PDF-Stelle (`pdf/anzeige.ts`, im Arbeiter-Pool) und hält sie je SHA-256 des Inhalts im Speicher (höchstens 256 MB, älteste zuerst hinaus; Fehlschläge werden nicht gemerkt).
- Entfernt werden JavaScript (`/JS`, Namensbaum `JavaScript`), automatische Aktionen (`/OpenAction`, `/AA`), die Aktionen `SubmitForm`, `Launch`, `ImportData`, `GoToR`, `GoToE`, Medien-Aktionen, XFA-Formulare, eingebettete Dateien (`/EF`, `EmbeddedFiles`, Ströme `/EmbeddedFile`) und Anmerkungen für Dateianhänge und Medien. Links (`URI`) und Sprünge im Dokument bleiben.
- Lässt sich das PDF nicht bereinigen (verschlüsselt, beschädigt), kommt ein kurzer Text (`text/plain`, mit Sandbox) mit `X-DMS-Anzeige: nur-herunterladen`; sonst steht `X-DMS-Anzeige: bereinigt` im Kopf.
- **Herunterladen, Weitergeben, Export, E-Mail und API-Schlüssel** (auch Pakete) bekommen weiter das Original bzw. die gestempelte Ausgabe.

## Arbeiter-Pool { #arbeiter-pool }

Der Server beantwortet alle Anfragen in **einem** Faden. Schwere Rechenarbeit läuft darum in einem kleinen Pool von Arbeiter-Fäden (`node:worker_threads`, #542), ohne neue Abhängigkeit:

```
server/src/arbeit/index.ts        arbeite(vorgang, ...args), Einstellung (DMS_ARBEITER), Stand für den Systemzustand
server/src/arbeit/pool.ts         Arbeiterpool: Warteschlange, Zeitgrenze, Speichergrenze, Absturz, Leerlauf
server/src/arbeit/vorgaenge.ts    was ein Arbeiter kann: alle Vorgänge der PDF-Stelle, Tabellen großer Exporte, Demo-Dokumente
server/src/arbeit/arbeitsfaden.ts Einstieg des Arbeiters (gebaut als dist/arbeitsfaden.mjs)
server/src/arbeit/nachricht.ts    Nachrichten, Buffer und Fehler über die Grenze
```

- **Aufrufen:** Die PDF-Stelle gibt ihre Vorgänge selbst an den Pool (`pdf/index.ts`); für alles andere `await arbeite('exportTabellen', …)`. Die Typen der Parameter und Ergebnisse kommen aus `VORGAENGE`.
- **Neuer Vorgang:** Funktion mit einfachen Daten als Parameter und Ergebnis (Bytes, Zahlen, Texte, Listen, einfache Objekte, `Map` – keine Klassen, keine Funktionen, kein Repo, keine Datenbank) in `vorgaenge.ts` eintragen. Ein `Buffer` kommt im Arbeiter als `Uint8Array` an und wird von `alsBuffer` wieder zum `Buffer` – auch in Listen und einfachen Objekten. `Fachfehler` kommen mit Status und Details beim Aufrufer an. Der Arbeiter schreibt nichts ins Protokoll; Hinweise stehen im Ergebnis.
- **Was nicht hineingehört:** kleine Anfragen (die Übergabe kostet selbst etwas: Daten werden kopiert, bei 20.000 Tabellenzeilen etwa 0,1–0,3 s) und alles, was Datenbank oder Dateien braucht – die Daten holt der Hauptfaden vorher.
- **Einstellung:** `DMS_ARBEITER` (0–16; 0 = aus, alles im Hauptfaden), Vorgabe die Hälfte der Kerne aus `cpu.max` der cgroup bzw. `availableParallelism()`, 1 bis 4. Zeitgrenze 10 Minuten, Warteschlange höchstens 50 (darüber 503), Heap je Arbeiter 1,5 GB, Leerlauf 2 Minuten. Ohne Aufruf von `richteArbeiterEin()` (Tests, Befehl `dms`) entsteht der Pool beim ersten Auftrag.
- **Tests:** `server/test/arbeiter.test.ts` prüft Pool (Ergebnis, Fehler, Zeitgrenze, volle Warteschlange, Absturz), Einstellung, die Warnung bei hoher Wartezeit und dass die Ablage während eines großen PDF-Exports schnell lädt (Werte ohne und mit Pool stehen in der Ausgabe). In Tests läuft der Arbeiter mit `tsx` (Lade-Argumente aus `ladeArgumente`).
- Der **Paket-Läufer** (`laeufer/`) ist ein eigener Prozess mit Berechtigungsmodell und bleibt davon getrennt.

**Warnung bei hoher Wartezeit:** `Auslastung` (`messung.ts`) merkt das p99 der Verzögerung der Ereignisschleife je Minutenfenster. Liegt es in 5 Fenstern hintereinander über 100 ms (`SCHLEIFE_GRENZE_MS`, `SCHLEIFE_MINUTEN` in `shared/src/systemlast.ts`), schreibt sie eine Warnung ins Protokoll, und `Systemlast.warnung()` meldet `schleife` an Systemzustand, Übersicht und Leiste der Werkbank.

**Externe Dienste (#565):** Ein Messpunkt für alles, worauf Ablago bei anderen Diensten wartet: `extern` in `server/src/externmessung.ts` (eine Instanz je Prozess wie das Protokoll; `ablago.ts` setzt Speicher und Einstellungen). Die Anschlüsse melden nur dorthin: `extern.messe({ dienst, funktion }, f)` stoppt einen Aufruf (Messpunkt mit `erste()`, `bytes()`, `token()`, `ergebnis()`), `extern.erfasse(aufruf)` nimmt einen schon gemessenen – OIDC in `Oidc.abruf`, SMTP im `transport` von `betrieb.ts` (`gemessen`), IMAP je Sitzung über `imapGemessen` (beim Bau von `Postfaecher`), Pakete im Läufer (`netzMesser` in `laeufer/prozess.ts`, Summe als `messung` im Ergebnis, in `Paketlaeufer.rufe` erfasst; KI-Dienst ist `istKiPaket`). Gespeichert wird nur `ExternAufruf` (`shared/src/extern.ts`) mit Person und geschätzten Kosten: Rohdaten in `extern_aufrufe` (35 Tage, `ROH_TAGE`), dann in `extern_monate` verdichtet (24 Monate, `MONATE`; Migration 100). Je Anfrage gehen die Aufrufe in `Kontext.extern` und von dort in den Header `Server-Timing` (`extern`, `extern-1` …, `externTiming`); Antworten als Strom („Frag deine Ablage“) tragen sie in der letzten Zeile (`externDerAnfrage`). Preise und Budget stehen in der Einstellung `extern_kosten`; `extern.pruefePause(paket)` wirft vor einem KI-Aufruf 429 „KI-Funktionen pausiert bis …“, `extern.pausiertBis(paket)` hält die Zustellung der Ereignisse an. Neue Anschlüsse rufen nur `extern.messe` – nie Inhalte, Adressen oder URLs in `funktion`. Test: `server/test/extern.test.ts` (auch: keine Inhalte in Tabellen, Auswertung, Protokoll, Server-Timing).

## Texte und Sprachdateien { #texte-und-sprachdateien }

Texte für Benutzer stehen nicht im Code, sondern in **Sprachdateien** (#473, #727, Teil von #357). Eingebaut sind Deutsch (Ausgangssprache) und Englisch (seit #729); Ablago duzt überall, und jede Sprache nimmt die vertraute Anrede (Englisch schlicht „you“). Seit #727 sind alle Bereiche umgestellt: Oberfläche, Fehlermeldungen und Hinweise des Servers, E-Mails, Historie und Notfallblatt.

**Regel:** Ein Text, den Menschen lesen, gehört in die Sprachdatei – nie als Wort im Code. Die CI lässt neue feste Texte in der Oberfläche nicht durch (siehe unten).

```
shared/src/sprachen/de/<bereich>.json         Ausgangssprache Deutsch (du), immer vollständig
shared/src/sprachen/de-formal/dritte.json     Texte für Dritte mit „Sie“ (siehe unten)
shared/src/sprachen/en/<bereich>.json         Englisch, britische Schreibweise, vollständig
shared/src/englisch.ts                        lädt alle englischen Dateien (eigener Chunk in der Oberfläche)
shared/src/sprachwahl.ts                      Einstellung „sprachen“, wirksame Sprache, Kopf X-Sprache
shared/src/sprache.ts                         uebersetzer(), Platzhalter, Mehrzahl, gebietsschema()
web/src/sprache.ts                            t() und tn() mit den Bereichen der Oberfläche
server/src/sprache.ts                         t() mit den Bereichen des Servers
shared/src/texte.ts                           t() für gemeinsamen Code (Bereich gemeinsam)
```

**Bereiche** folgen den Ordnern:

| Code | Bereich |
|---|---|
| `web/src/ablage/*` | `ablage` |
| `web/src/werkbank/*` | `werkbank` (dazu ältere Schlüssel der Werkbank) |
| `web/src/profil/*` (Mein Konto) | `profil` |
| `web/src/einrichtung/*` (Mappentyp-Editor) | `mappentypen` |
| `web/src/einrichtung.tsx`, `web/src/assistent/*` | `einrichtung` |
| übrige Dateien in `web/src` | `oberflaeche` |
| `server/src/**` (Fehler, Hinweise, Historie) | `meldungen` |
| E-Mails | `mail` |
| Notfallblatt und Notfallzugang | `notfall` |
| `shared/src/*` | `gemeinsam` |

Daneben gibt es Fachbereiche aus früheren Issues (`anmeldung`, `automatisierung`, `pakete`, `suche` …); dort bleiben ihre Texte.

**Text anlegen**

1. Passenden Bereich wählen (Tabelle oben). Ein neuer Bereich wird in `web/src/sprache.ts` bzw. `server/src/sprache.ts` eingetragen; Dateiname = Bereich, klein, ohne Punkt.
2. Schlüssel in die JSON-Datei schreiben – flach, Teile mit Punkt oder Bindestrich, klein beginnend: `"vergessen.knopf": "Link anfordern"`.
3. Im Code abrufen: `t('anmeldung.vergessen.knopf')`. Die Typprüfung kennt alle Schlüssel und meldet Tippfehler.

**Benennung:** vorne die Komponente bzw. Datei, dann Ort und Zweck – `vergessen.titel`, `vergessen.knopf`, `fehler.link.abgelaufen`. Beim Umzug in #727 entstanden die Schlüssel aus Datei und Textanfang (`wartungsmodus.alle-jetzt-abmelden`); wer einen Text ändert, darf den Schlüssel passend umbenennen. Wiederkehrende Wörter („Speichern“, „Abbrechen“) bekommen keinen gemeinsamen Schlüssel – so bleibt jede Übersetzung im Zusammenhang.

**Platzhalter** stehen in einfachen geschweiften Klammern: `"passwort.zugang": "Für den Zugang {email}"` → `t('anmeldung.passwort.zugang', { email })`. Namen nur aus Buchstaben, Ziffern und `_`. Immer den **ganzen Satz** mit Platzhaltern ablegen, nie Satzteile aneinanderhängen – sonst kann eine Übersetzung die Reihenfolge nicht ändern. Fehlt ein Wert, bleibt `{email}` stehen und fällt auf.

**Bausteine im Satz** (Link, fett, Hilfe-Knopf) gehen mit `tn()` aus `web/src/sprache.ts`: Der Platzhalter bekommt ein Element als Wert.

```tsx
// "hinweis": "Mehr dazu im {link}.", "hinweis.link": "Administratorhandbuch"
<p>{tn('werkbank.uebersicht.hinweis', { link: <a href={url}>{t('werkbank.uebersicht.hinweis.link')}</a> })}</p>
```

**Mehrzahl** über Schlüssel mit `_one` und `_other` und den Wert `anzahl` – statt `n === 1 ? … : …` im Code:

```json
"dauer.stunden_one": "{anzahl} Stunde",
"dauer.stunden_other": "{anzahl} Stunden"
```

`t('mail.dauer.stunden', { anzahl: 2 })` ergibt „2 Stunden“. Die Formen richten sich nach `Intl.PluralRules` der Sprache (Englisch braucht `one`/`other`, andere Sprachen auch `few`, `many` …); fehlt eine, gilt `_other`. Ein Text für genau eins darf ohne Zahl auskommen („Eine Mappe“).

**Datum, Zahlen, Beträge** nie mit festem `'de-DE'` formatieren, sondern mit `gebietsschema()` aus `shared/src/sprache.ts` (`de-DE` bzw. `en-GB`, je nach Sprache der Anfrage), z. B. `n.toLocaleString(gebietsschema())`. Feste Formate bleiben nur dort, wo eine Datei ein Format verlangt (ISO-Datum, CSV für Tabellen).

**Zusammengesetzte Schlüssel** (`werkbank.gruppe.${g}`) gehen mit `t.frei(…)` statt `t(…)`. Sie entgehen der Typprüfung; die Prüfung in der CI zählt alle Schlüssel mit dem festen Anfang (`werkbank.gruppe.`) als benutzt. Wo es geht, ganze Schlüssel ausschreiben.

**Prüfungen in der CI** (laufen mit `npm test`, lokal im Ordner `server` mit `node --import tsx --import ./test/lader.mjs --test test/<datei>`, siehe [Loslegen](loslegen.md)):

- `sprachdateien.test.ts`: Schlüssel, die der Code abruft, aber nicht gibt; Schlüssel, die niemand benutzt; Sprachen, die Schlüssel auslassen oder zusätzliche haben; Platzhalter, die zwischen den Sprachen abweichen; **Platzhalter, die ein Aufruf nicht liefert** (`t('…', { nam })` für `{name}`); Mehrzahl ohne `_other`; leere Texte.
- `sprachdateien-fest.test.ts`: **feste Texte in der Oberfläche** – Text zwischen Tags, in sichtbaren Attributen (`title`, `aria-label`, `placeholder`, `titel` …) und als Wert in geschweiften Klammern. Was in jeder Sprache gleich bleibt (Produktnamen, Befehle in `<code>`, Beispieladressen), ist erlaubt; weitere Ausnahmen stehen mit Grund in `AUSNAHMEN` in der Testdatei.
- `symbole.test.ts`: keine bunten Emoji und keine Textzeichen als Symbol – auch in den Sprachdateien.

**Bewusst noch im Code** (#727): Protokollzeilen (`log.*`, Werkbank → Protokoll) bleiben Deutsch, damit Fehlermeldungen vergleichbar und durchsuchbar sind; die Beschreibung der Schnittstelle (OpenAPI in `server/src/api-v1.ts`) ist Entwicklerdoku wie dieses Handbuch; Lizenztexte; Beispieldaten und Demo-Inhalte; die Titel der Handbuch-Abschnitte in `shared/src/hilfe.ts` (sie folgen den Überschriften im Handbuch und kommen mit dessen Übersetzung, #730); die festen Werte der Auswahlfelder von Post (`POST_STAND`, `POST_KANAL`, `POST_RICHTUNG` in `shared/src/model.ts`) – sie stehen so in jeder Mappe; gezeigt wird ihre Beschriftung (siehe unten). Namen, Felder und Hilfetexte der Systemmappentypen kommen seit #728 aus `gemeinsam.json` (`model.systemtyp.*`, `model.systemfeld.*`, `model.systemhilfe.*`).

**Beschriftungen je Sprache** (#728, `shared/src/beschriftung.ts`): Was Administratoren selbst anlegen – Namen von Mappentypen, Feldern, Registern, Trefferlisten und Ansichten, Hilfetexte und die Optionen eines Auswahlfelds –, steht nicht in Sprachdateien, sondern am Eintrag unter `beschriftungen`: Sprache → Texte, z. B. `{ en: { label: 'Kind', optionen: { Strom: 'Electricity' } } }`. Der Ausgangstext (`label`, `name` …) ist Deutsch; fehlt eine Beschriftung, gilt er. Eine Option ist ihr **fester Wert** (`optionen`), und genau der steht in der Mappe; ihre Beschriftung kommt aus `beschriftungen.<sprache>.optionen`, sonst aus `beschriftungen.de.optionen`, sonst ist es der Wert selbst. Daraus folgt:

- **Vergleichen immer mit dem festen Wert** – Bedingungen, Automatisierungen, API, Vollexport (CSV, JSON), Prüfung der Mappe. Eingaben, die eine Beschriftung sein können (Direktlink, erweiterte Suche, Antwort einer Erkennungs-Engine), gehen über `wertZuOption()`. Die einfache Suche findet einen Wert auch über seine Beschriftung (`optionsGruppen()` wie gleichbedeutende Wörter).
- **Zeigen immer die Beschriftung:** `formatiere()` gibt bei Auswahlfeldern die Beschriftung zurück (Trefferliste, Titel, Export als Excel und PDF, Historie); Namen über `feldLabel()`, `feldHilfe()`, `typName()`, `registerName()`, `listenName()`, `sichtName()`, Optionen über `optionText()`.
- **Speichern:** Der Server bereinigt `beschriftungen` (gültige Sprachkennungen, nur bekannte Teile, Optionen nur für vorhandene Werte). Fehlt die Angabe beim Speichern ganz, bleiben die bisherigen – ein älteres Programm über die API löscht so nichts; `null` oder `{}` entfernt sie. Mappentypen und Ansichten speichern Name und Beschreibung je Sprache in der Spalte `beschriftungen` (Migration 080), Felder, Register und Trefferlisten im JSON des Mappentyps.
- **Erlaubte Sprachen** liefert `erlaubteSprachen()` aus der Einstellung `sprachen` (Werkbank → Sprachen, #729); der Server setzt sie mit `setzeErlaubteSprachen()` beim Start und jede Minute neu. Beschriftungen anderer Sprachen (etwa aus einem Paket) bleiben gespeichert.

**Übersetzen:** Eine neue Sprache bekommt einen Ordner `shared/src/sprachen/<sprache>/` mit denselben Dateien und Schlüsseln wie `de`, z. B. `en/ablage.json`. Platzhalter bleiben gleich (die CI vergleicht sie), Mehrzahlformen richten sich nach der Sprache. Wer einen deutschen Text ändert oder anlegt, pflegt den englischen mit – die CI meldet fehlende Schlüssel in `en`. Weitere Sprachen kommen als [Sprachpaket](pakete.md#sprachpakete) (#731); ihre Texte meldet `server/src/sprachpakete.ts` über `registriereSprache()` an, die Oberfläche holt sie mit `GET /api/sprache/texte/<sprache>`.

**Sprache wählen** (#729):

- **Rückfall:** `t()` sucht in der gewählten Sprache, dann in Englisch, dann in Deutsch; ein leerer Text zählt als fehlend. So bleibt nie eine Stelle leer.
- **Welche Sprache gilt:** die der angemeldeten Person (`benutzer.sprache`, Migration 081), wenn erlaubt; sonst die, die die Oberfläche im Kopf `X-Sprache` mitschickt (zuletzt benutzte bzw. die des Browsers); sonst die der Installation (`sprachen.standard`). `GET /api/sprache` nennt sie, die Oberfläche lädt sie vor allen anderen Modulen (`web/src/main.tsx`) und lädt nach einem Wechsel neu.
- **Server:** Jede Anfrage läuft in `mitSprache()` (AsyncLocalStorage in `server/src/sprache.ts`); Fehlermeldungen kommen so in der Sprache der Person. E-Mails an eine Person baut `mitSpracheVon(person, …)` in ihrer Sprache; Mails an alle Administratoren (`anVerwaltende`) übergeben Betreff und Text als Funktion (`MailText`), damit jeder Empfänger seine Sprache bekommt.
- **Protokollzeilen** gehen mit `tDe()` – immer Deutsch, unabhängig von der Anfrage.
- **Texte für Dritte** (`textDritte`, Auskunft, Abruf-Link) und Werte, die der Server einmal für alle bildet (Konstanten auf Modulebene, Titel und Namen der Systemmappentypen, Texte der Verwaltungspunkte), stehen in der Sprache der Installation – beim Start bzw. beim Anlegen berechnet. Systemmappentypen und Systemfelder tragen zusätzlich `beschriftungen` aus den Sprachdateien (`systemBeschriftung()`), damit die Oberfläche sie in jeder Sprache zeigt.
- **Maschinell übersetzte Sprachen** (aus [Sprachpaketen](pakete.md#sprachpakete), #731) zeigen in Mein Konto den Hinweis „Maschinell übersetzt – Verbesserungen willkommen“; der Link führt zu [Eine Sprache beitragen](pakete.md#eine-sprache-beitragen).
- **Gebietsschema:** Deutsch `de-DE`, Englisch `en-GB`; ein Sprachpaket nennt seins im Manifest (`sprache.gebietsschema`, z. B. `fr-FR`), `gebietsschema()` nimmt es dann für Datum, Zahlen und Beträge.

**Bibliothek:** eine eigene, kleine Umsetzung in `shared/src/sprache.ts` statt i18next – keine neue Abhängigkeit, offline, dieselben Regeln in Oberfläche und Server. Das Format (flaches JSON, `_one`/`_other`) entspricht i18next; ein späterer Wechsel bleibt möglich.

## Unterlagen für Dritte: Anrede du oder Sie { #unterlagen-fur-dritte }

Die Oberfläche duzt immer. Texte, die an Personen **außerhalb** von Ablago gehen, folgen dagegen der Einstellung **Anrede in Unterlagen für Dritte** (#474, Werkbank → Datenschutz-Auskünfte-Auskünfte → Einstellungen, `Datenschutz.anrede`, Vorgabe `du`). Alle diese Texte stehen im Bereich `dritte` der [Sprachdateien](#texte-und-sprachdateien): die du-Fassung in `shared/src/sprachen/de/dritte.json`, die Sie-Fassung in `shared/src/sprachen/de-formal/dritte.json`, je mit denselben Schlüsseln und Platzhaltern. Abgerufen werden sie mit `textDritte(anrede, schluessel, werte)` aus `shared/src/anrede.ts`. Die Prüfung der Sprachdateien vergleicht beide Fassungen, ein Test prüft zusätzlich, dass die Sie-Fassung kein „du“ enthält.

Neue Texte für Dritte kommen als Schlüssel in beide `dritte.json` – keine `anrede === 'sie' ? … : …` im Code – und in diese Liste:

| Ausgabe | Code | Schlüssel |
| --- | --- | --- |
| Auskunft: Deckblatt.pdf, Uebersicht.html, LIESMICH.md (#396) | `server/src/auskunft.ts` | `auskunft.*` (Rechte-Vorschlag: `rechteStandard`) |
| E-Mail mit der Auskunft als ZIP, E-Mail mit dem Abruf-Link (#455) | `auskunftMail` in `shared/src/auskunft.ts` | `mail.*` |
| Abrufseite `/abruf` und ihre Meldungen (#455) | `web/src/abruf.tsx`, `GET /api/abruf/anrede`, `/api/abruf` in `datenschutz/datenschutz.routen.ts` | `abruf.*` |
| Notfallzugang `/notfall` (#815) | `web/src/notfall.tsx`, `/api/notfall*` in `anmeldung/anmeldung.routen.ts`, `server/src/notfallcode.ts` | `konten.notfall.*` |
| E-Mails mit Mappen und Dokumenten (#58, #151) | – | keine: Text schreibt der Benutzer, vorgegeben ist nur der Betreff ohne Anrede |

## Baum über Verweise

Alles, was über Verweise an einer Mappe hängt, sammelt **ein** Modul – genutzt von der Auskunft nach Art. 15 DSGVO (#396) und von „Mappe mit allen verknüpften Mappen löschen“ (#424). Neue Funktionen, die „alles zu dieser Mappe“ brauchen, nehmen es statt eigener Schleifen.

- **Typen und Optionen:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = Mappen, die auf den Knoten verweisen, „nach unten“; `verweistAuf` = Mappen, auf die er verweist; `tiefe` 1–10; `max` bis 5000; `seitwaerts`; `ohneTypen`; `nurZugehoerigkeit`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, Hilfen `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithmus:** `server/src/baum.ts` – `sammleBaum(quelle, startId, optionen)`: Breitensuche, je Ebene ein Zugriff auf Verweise (`Repo.kantenVon`), Mappen und Lesbarkeit. Ohne `seitwaerts` geht ein Knoten nur in der Richtung weiter, über die er erreicht wurde (die Start-Mappe in alle gewählten). Kreise und mehrfache Wege landen in `auchUeber` und `kreise`, jeder Knoten steht einmal da. Über `max` hinaus: `abgeschnitten`. Mit `nurZugehoerigkeit` geht es nur über Verweisfelder der Art Zugehörigkeit weiter (`verweisartVon(typ, feldKey)`, Standard Bezug); Knoten, die nur über Bezug dranhängen, sind Blätter mit `nurBezug` – erreicht die Suche sie später über eine Zugehörigkeit, werden sie dort eingehängt und weiterverfolgt (innerhalb einer Ebene haben Zugehörigkeiten Vorrang).
- **Rechte:** Die `BaumQuelle` baut `MitVerknuepften.baumQuelle(zugriff)`; nur lesbare Mappen werden aufgenommen **und** weiterverfolgt, nicht lesbare zählen nur in `verborgen`. Zum Aufrufen: `await dienst.mitVerknuepften.baum(startId, eingabe, zugriff)` (Benutzer und Rollen sind ohne `ohneTypen` ausgenommen), über HTTP `GET /api/v1/mappen/{id}/baum`.
- **Je Knoten:** `typ`, `titel`, `ebene`, `ueber` (Elternknoten, Richtung, Feld, `verweisart`), `nurBezug`, `dokumente`, `aussen` (Verweise zu Mappen außerhalb des Baums je Richtung, nicht lesbare ohne Titel), `aufbewahrenBis`/`gesperrt` (Archivmodus #212) und `rechte` (CRUDP des Aufrufers).

Die Auskunft (`DatenschutzDienst.auskunftVorschau`) und das Löschen sammeln beide mit `nurZugehoerigkeit` (#472, #424): Bezug-Knoten gehen bei der Auskunft nur als Erwähnung hinaus (`AuskunftAuswahl.erwaehnungen`, `erwaehnungText` in `shared/src/auskunft.ts`), beim Löschen wird nur ihr Verweis entfernt. Volltext-Vorschläge gibt es bei der Auskunft nicht (mehr).

Tests: `server/test/auskunft.test.ts` (Kreise, Rechte, Obergrenze, seitwärts, Zugehörigkeit/Bezug).

### Mit verknüpften Mappen löschen (#424)

- **Vorschau und Plan** (reine Funktionen, Server und Oberfläche): `shared/src/loeschbaum.ts`. `MitVerknuepften.loeschVorschau(startId, { tiefe, max }, zugriff)` sammelt den Baum nur `verwiesenVon` mit `nurZugehoerigkeit` (Standardtiefe 5) und ergänzt `kanten` (alle Verweise zwischen Knoten, nicht nur die Baumwege), `geteilt` und `nichtLoeschbar`. Kennzeichen (`kennzeichen(v, k)`): 🔒 = `gesperrt`, 📎 = `nurBezug` (wird nie gelöscht, `loeschen` gilt als `entkoppeln`), ⛔ = `!rechte.D` oder `nichtLoeschbar`, 🔗 = `geteilt` – enger als `haengtAuchAnderswo(k)`: zählt nur Verweise der Art Zugehörigkeit nach außen über ein Feld, über das der Knoten im Baum hängt, oder auf eine Mappe desselben Typs wie im Baum; Verweise auf Stammdaten (Ablageort, Kategorie) und Benutzer zählen nicht, sonst wäre fast alles 🔗.
- **Plan:** `planeLoeschung(vorschau, auswahl)` – Auswahl je Id `loeschen | entkoppeln | behalten` (fehlende Ids bleiben). Fixpunkt: Eine Mappe bleibt, wenn `wirdAnderswoGebraucht(k)` oder eine bleibende Mappe im Baum ohne `entkoppeln` auf sie verweist. Gesperrte Mappen werden nie entkoppelt.
- **Ausführen:** `MitVerknuepften.loescheMitVerknuepften` sammelt neu, plant, prüft jede Mappe wie beim einzelnen Löschen (`loeschPruefung` mit allen Rückverweisen), kappt die Verweise (`entkoppeln`, Recht U) und legt alles mit `Repo.legeVorgangInPapierkorb` in **einer** Transaktion in den Papierkorb (Verweise untereinander zuerst – so gehen auch Kreise). Spalten `papierkorb.vorgang` und `papierkorb.entkoppelt` (Migration 042). `stelleVorgangWiederHer` bzw. `Repo.stelleMehrereWiederHer` legen erst alle Mappen, dann die Verweise an und setzen die entkoppelten Verweise wieder. Tests: `server/test/loeschbaum.test.ts`.

## Mappen schreiben, auch gleichzeitig (#609) { #mappen-schreiben }

Wer zuletzt speichert, darf keine Felder zurücksetzen, die er nicht angefasst hat. Deshalb gilt für **jeden** Schreiber von Mappenwerten:

- **Nur Geändertes schreiben.** `Repo.aendereMappe(id, werte, [], von, { basis, verweise })` legt nur die Felder auf den aktuellen Stand, die sich gegenüber `basis` (den gelesenen Werten) ändern – unter Sperre der Zeile (`SELECT … FOR UPDATE`) bzw. im Arbeitsspeicher genauso (`feldweise` in `server/src/repo.ts`). `verweise(w)` berechnet die Verweise aus dem Ergebnis. Interne Schreiber (`schreibeSystemMappe`, `schreibeVerweisWerte`, `absenderBereinigen`, Umbenennen von Feldern) nutzen das; `schreibeSystemMappe` bekommt außerdem nur die zu ändernden Felder, nie `{ ...mappe.werte, … }` aus einem älteren Lesen.
- **Stand.** `mappen.geaendert` ist auf die Millisekunde genau und steigt bei jedem Schreiben (`greatest(clock_timestamp(), geaendert + 1 ms)`), damit er als Versionszähler taugt; keine Migration nötig. Mit `stand` schreibt das Repo nur, wenn die Zeile noch diesen Stand hat, sonst `StandVeraltet` – `MappenDienst.aendereMappe` liest dann neu und versucht es bis zu fünfmal.
- **Konflikt.** `MappenDienst.aendereMappe(id, { werte, stand })`: Weicht `stand` vom aktuellen ab, sucht `feldkonflikte` in der Historie die Einträge `geaendert` mit `daten.stand` > `stand` (jeder Eintrag merkt sich den Stand, den sein Schreiben erzeugt hat). Ein übergebenes Feld, das dort vorkommt und jetzt anders lauten soll, ergibt 409 mit `Mappenkonflikt` (`shared/src/model.ts`). Ohne `stand` keine Prüfung, nur feldweises Schreiben – so bleiben alte API-Aufrufe gültig.
- **Formular.** `MappeFormular` schickt nur die Felder, deren Rohwert von `basis` abweicht, und `stand` = `mappe.geaendert` beim Laden von `basis`. Bei 409 zeigt `Konfliktfrage` je Feld die Wahl; „Meins“ geht mit dem neuen Stand aus der Antwort noch einmal mit, „Seins“ übernimmt den Wert und bleibt weg.

Tests: `server/test/gleichzeitig.test.ts` (Arbeitsspeicher und PostgreSQL), im Browser `docs/handbuch/screenshots/gleichzeitig-pruefen.mjs` (zwei Fenster, Workflow „Handbuch“).

## Systemkonten und Kontorollen (#673) { #systemkonten }

Neben Menschen (`benutzer.art = 'person'`) gibt es zwei Arten von Konten, die sich nie anmelden:

| Art | Beispiel | Systemrolle | Rechte an Mappen |
|---|---|---|---|
| `dienst` (#338) | „Paket Texterkennung“, je Paket mit Code eines | **Paket** (`rolle:paket`) | bestätigte Rechte aus dem Manifest, eingeschränkt durch Regeln für die Rolle Paket |
| `system` (#673) | „Automatisierung“ (`systemkonto = 'automatisierung'`) | **Systemkonto** (`rolle:systemkonto`) | alles außer `P`, eingeschränkt durch Regeln für die Rolle Systemkonto |

- **Anlegen:** `Konten.systemkonto(kennung)` beim Start (`ablago.ts`), idempotent; in PostgreSQL schützt der Index `benutzer_systemkonto` vor einem zweiten Konto, auch bei zwei Servern (Migration 059).
- **Nie benutzbar:** `holeHash`, `listeBenutzer`, `anzahlBenutzer` sehen nur Menschen; `benutzerZu` (Sitzung) und `benutzerMitId` (API-Schlüssel) lehnen Systemkonten ab; Benutzerverwaltung und „Als Benutzer anmelden“ kennen sie nicht (`person()`). `personen()` liefert sie nur für Namen (`aktiv: false`, `art`).
- **Rollen:** Die Rollen-Mappen `rolle:systemkonto` und `rolle:paket` legt die [Systemausstattung](#systemausstattung) an (`kontorollen` in `kern.system()`). `listeRollen()` liefert sie nur mit `mitKonten`, `pruefeRollen()` lehnt sie ab.
- **Zugriff:** `ZugriffDienst.zugriff(konto)` setzt `wer.rollen = [Kontorolle]` und schneidet die Mappentypen mit `kontoRegelwerk(typ, rolleId)` (`shared/src/rechte.ts`) zu: Grundeinstellung „alles“, nur Regeln, die die Rolle nennen (`nenntRolle`). So sperrt ein strenger Standard für Mitglieder keine Automatisierung aus, ein Administrator kann aber gezielt einschränken. Für Pakete wird das Ergebnis mit den bestätigten Rechten geschnitten. `PostSystemmappen.systemZugriff('automatisierung')` liefert den Zugriff des Systemkontos (für den Motor der Automatisierungen, #674).
- **Werkbank:** Systemkonten sind nie `admin`; welche Werkbank-Aktionen eine Karte darf, entscheidet die Karte selbst (#677).
- **Oberfläche:** Werkbank → Benutzer, Abschnitt „Systemkonten“ (`GET /api/benutzer/systemkonten`, nur Administratoren).

## Passkeys (#811) { #passkeys }

Anmeldung mit WebAuthn – als eigener Weg, als zweiter Faktor und für die erneute Anmeldung (#819). Die Kryptografie (CBOR, COSE-Schlüssel, Signaturen, Zähler) prüft `@simplewebauthn/server` in fester Version ([Abhängigkeiten](#abhaengigkeiten)); im Browser nimmt Ablago die eingebaute Schnittstelle `navigator.credentials` ohne Bibliothek (`web/src/passkey.ts`).

- **Wo:** `server/src/passkeys.ts` (Klasse `Passkeys`, neben `zweifaktor.ts`), angebunden an `Konten` mit `verbindePasskeys` wie die Zwei-Faktor-Anmeldung. Die Pflicht je Rolle nutzt dieselbe `RollenPflicht` wie die Zwei-Faktor-Anmeldung (Schlüssel `passkey_pflicht`, `passkey_pflicht_seit`). Routen in `anmeldung/anmeldung.routen.ts`.
- **RP-ID und Origin** aus `betrieb.adresseFuerLinks()` (gepflegte Adresse, sonst die der Anfrage): nur `https://` mit einem Namen oder `http://localhost` (`relyingParty`). Jeder Passkey merkt sich seine RP-ID; passt sie nicht zur aktuellen Adresse, gilt er nicht (`passt: false` in der Liste).
- **Herausforderung** im [Kurzzustand](#kurzzustand): beim Hinzufügen je Konto (`passkey-neu`), beim Anmelden unter dem Hash einer zufälligen Kennung (`passkey-anmeldung`), mit Zweck (`anmelden`, `zweiter-schritt`, `bestaetigen`, `dokumentpasswoerter`) und – außer beim Anmelden ohne E-Mail-Adresse – dem Konto. 5 Minuten, `nimm` löst sie einmal ein, auch bei Fehlern. Höchstens 2000 offene.
- **Prüfung:** `userVerification: 'required'` beim Anlegen und Anmelden, Attestation `none`, Origin und RP-ID aus der Herausforderung, Zähler muss steigen (sonst Warnung „womöglich kopiert“). Der Zähler wird mit `Einstellungen.tausche` gespeichert.
- **Gespeichert** in den Einstellungen unter `passkeys_<Konto>`: `{ liste: [{ nr, id, oeffentlich, zaehler, name, rpId, erstellt, zuletzt, transports, mehrgeraete }] }` – nur Öffentliches, darum Teil der Sicherung und unverändert durch `ohneGeheimnisse`. `nr` ist Ablagos eigene Kennung für Routen und Oberfläche; die Kennung des Authenticators verlässt den Server nur in `allowCredentials`/`excludeCredentials`. `userID` beim Anlegen ist die Konto-Id (keine E-Mail-Adresse); daran findet die Anmeldung ohne E-Mail-Adresse das Konto.
- **Entscheidungen nur nach der gepflegten Adresse** (Durchsicht Sicherheit): `pflichtRp()`/`fuerPflicht()` lesen `betrieb.gepflegteAdresse()`, nie die Adresse der Anfrage. Die Passkey-Pflicht lässt sich nur mit gepflegter HTTPS-Adresse einschalten (409); fehlt sie später, gilt die Pflicht geschlossen weiter. Ist die Pflicht an und die Person hat Passkeys, aber keinen für die gepflegte Adresse bzw. läuft die Anfrage über eine andere, verlangt `zweiteWege` den Code oder antwortet 409.
- **Grenzen:** Herausforderungen ohne Konto (`passkey-anmeldung-offen`) je Adressbereich (`adressbereich`: IPv4 bzw. IPv6-/64) höchstens `PASSKEY_OPTIONEN_JE_ADRESSE` in 5 Minuten (Zähler `passkey-optionen-adresse`), dazu die Notbremse `PASSKEY_OPTIONEN_GESAMT` (`grenzen.ts`); zweiter Schritt und Bestätigungen (`passkey-anmeldung`) zählen nicht mit.
- **Pflichten:** Ein Passkey für die gepflegte Adresse erfüllt auch die Zwei-Faktor-Pflicht (`Zweifaktor.alternative`, verbunden von `Konten`); dann verlangt `zweiteWege` ihn beim Anmelden mit Passwort, und `passkeyNoetig` sperrt das Entfernen des letzten. Die Passkey-Pflicht bleibt eigenständig.
- **Zwecke:** `bestaetigen` für Verwaltungsmodus und heikle Handlungen, `dokumentpasswoerter` für „Passwörter für Dokumente“ (`POST …/passkeys/bestaetigen/optionen` mit `{ fuer: 'dokumentpasswoerter' }`, dann `POST /api/konto/dokument-passwoerter/bestaetigen` mit `{ passkey }`) – eine Herausforderung gilt nur für ihren Zweck.
- **Anmeldeschutz:** `Konten.anmeldenMitPasskey` zählt vorab mit `sperre.versuch` (E-Mail des genannten Kontos, sonst leer, und IP), ein Fehlschlag mit `fehlschlag`, ein Erfolg setzt zurück – wie beim Passwort (#956).

| Route | Zugang | Wozu |
| --- | --- | --- |
| `POST /api/konto/passkey/optionen` | offen | `{ zweiterSchritt? }` → `{ kennung, optionen }` (Request-Optionen im JSON-Format von WebAuthn) |
| `POST /api/konto/passkey/anmelden` | offen | `{ kennung, antwort, zweiterSchritt? }` → Sitzung |
| `GET /api/konto/passkeys` | angemeldet | eigene Passkeys, `moeglich`, `adresse` (RP-ID), `pflicht`, `hoechstens` |
| `POST /api/konto/passkeys/beginnen` | angemeldet | Creation-Optionen |
| `POST /api/konto/passkeys` | angemeldet | `{ antwort, name }` → neuer Passkey (201) |
| `PUT /api/konto/passkeys/:nr` | angemeldet | `{ name }` umbenennen |
| `DELETE /api/konto/passkeys/:nr` | angemeldet | entfernen – nur mit frischer Anmeldung (sonst 403 mit `details.frisch`) |
| `POST /api/konto/passkeys/bestaetigen/optionen` | angemeldet | Optionen für die erneute Anmeldung; danach `POST /api/konto/verwaltung` bzw. `…/verwaltung/bestaetigen` mit `{ passkey: { kennung, antwort } }` |
| `GET`/`PUT /api/werkbank/passkeys` | Werkbank (Anmeldeschutz) | Pflicht je Rolle `{ admin, mitglied }`, dazu `moeglich` |
| `GET /api/benutzer/:id/passkeys`, `POST …/zuruecksetzen` | Werkbank (Benutzer) | Anzahl, alle entfernen (auch `dms passkeys-zuruecksetzen`) |

`POST /api/konto/anmelden` und `…/passwort-setzen` liefern beim zweiten Schritt zusätzlich `wege: { code, passkey }`; nach dem Anbieter steht das als `#<kennung>.<c|p>` in der Adresse von `/anmelden/code`. `/api/konto/status` nennt `passkey: { moeglich, aktiv?, fehlt?, ausstehend? }`, der Verwaltungsstand `passkey`.

**Tests:** `server/test/passkeys.test.ts` mit einem nachgebildeten Authenticator (`server/test/hilfen-authenticator.ts`: P-256, Attestation `none`, kleines CBOR) – Hinzufügen, Anmelden, falscher Origin, wiederverwendete Herausforderung, Zähler rückwärts, ohne Nutzer-Verifizierung, Anmeldeschutz, Entfernen ohne frische Anmeldung, Pflicht, Adresse geändert, Verwaltungsmodus. Der Rauchtest legt im Chromium mit einem virtuellen Authenticator (DevTools-Protokoll) einen Passkey an und meldet sich damit an.

## Zustand zwischen Anfragen (#744) { #kurzzustand }

Bauregel „später mehrere Server möglich halten“: Was zwischen zwei Anfragen gilt, liegt in PostgreSQL – nicht in einer `Map` eines Prozesses. Sonst hätte ein Angreifer mit zwei Prozessen doppelt so viele Versuche, und der zweite Anmeldeschritt landete beim falschen Prozess.

- **Baustein:** `Kurzzustand` (`server/src/kurzzustand.ts`, Tabelle `kurzzustand`, Migration 078): je Eintrag Art, Schlüssel, Zähler, Wert und Ablauf. `pgKurzzustand(sql, haushalt)` im Betrieb, `speicherKurzzustand()` in Tests und Bausteinen ohne Datenbank (dieselben Regeln, ein Prozess). Nicht in der Sicherung, wie die Sitzungen.
- **Zählen atomar:** `zaehle` ist ein `INSERT … ON CONFLICT … DO UPDATE … RETURNING` mit festem oder gleitendem Fenster – nie lesen-dann-schreiben.
- **Genau einmal:** `nimm` (`DELETE … RETURNING`) für Tickets und Kennungen; `belege`/`belegeAlle` für Merker „kurz hintereinander nur einmal“ und für Belegungen mit Frist („höchstens eine Prüfung gleichzeitig“ – endet ein Prozess mittendrin, gibt die Frist frei).
- **Geheimnisse:** Ist der Schlüssel selbst geheim (Ticket, `state`, Kennung, Sitzung), steht nur sein Hash (`hashe`). Geheime Werte (TOTP-Entwurf, PKCE-Verifier, Gerätecode, neues Notfallblatt) verschlüsselt der Aufrufer mit dem Tresor.
- **Zeitpläne:** `exklusiv(name, f)` nimmt `pg_try_advisory_lock(744, hashtext(haushalt:name))` auf einer eigenen Verbindung; hält ein anderer Prozess sie, läuft der Lauf hier nicht (es wird nie gewartet). In `ablago.ts` als `nurEiner(…)` für Papierkorb, Abwesenheiten, Fristen (Tag des letzten Laufs ebenfalls im Kurzzustand), technische Aufgaben, Probe-Wiederherstellung, RESCUE-Datei, Speicherplatz-Übergänge und das Aufräumen des Kurzzustands (alle 10 Minuten). Tägliche Läufe mit `laufeFaellige` (Sicherung, Zusammenfassung, Automatisierungen) waren schon über den Merker in den Einstellungen sicher.
- **Lebenszeichen:** `lebenszeichen(sql, haushalt)` hält je Prozess eine geteilte Sperre – seit #745 nur der Leiter (Prozess für die Arbeit im Hintergrund). Nur wer beim Start allein ist, stellt „laufende“ Texterkennung als unterbrochen zurück.
- **Vergleichen und tauschen** statt überschreiben, wo zwei Prozesse denselben Wert ändern: letzter TOTP-Schritt und verbrauchte Wiederherstellungscodes (`zweifaktor.ts`), Zähler der Passkeys (`passkeys.ts`), erneuertes Token der Postfach-Anmeldung (`postfach-oauth.ts`), Umschalten des Wartungsmodus (`wartung.ts`, liest den Stand jetzt bei jeder Prüfung aus der Datenbank).

| Was | Art(en) im Kurzzustand |
|---|---|
| Anmeldeschutz: Fehlversuche je Konto und IP, je IP, IP-Sperren, Sammel- und Sofortmeldung | `anmeldung-konto`, `anmeldung-ip`, `anmeldung-ip-sperre`, `anmeldung-meldung`, `anmeldung-sammelmeldung`, `anmeldung-sofortmeldung` |
| Zweiter Anmeldeschritt, Zwei-Faktor einrichten | `zweiter-schritt`, `zweifaktor-entwurf` |
| Passkeys (#811): Herausforderung beim Hinzufügen und beim Anmelden, Zähler je Adresse | `passkey-neu`, `passkey-anmeldung`, `passkey-anmeldung-offen`, `passkey-optionen-adresse` |
| Abrufseite: Tickets, Fehlversuche je Bereich, eine Prüfung je Link | `abruf-ticket`, `abruf-fehler`, `abruf-pruefung` |
| OIDC, Postfach-OAuth (Rückruf, Gerätecode) | `oidc-anmeldung`, `postfach-oauth-code`, `postfach-oauth-geraet` |
| WebDAV: Zählfenster, schwebende Dateien | `webdav-fenster`, `webdav-schwebend` |
| Geschützte PDFs: Fehlversuche, Bestätigung für Dokument-Passwörter | `pdf-passwort-fehler`, `dokumentpasswort-bestaetigt`, `dokumentpasswort-fehler` |
| Notfallzugang: Sperre und Belegung je Bereich, Meldung, neues Blatt | `notfall-sperre`, `notfall-pruefung`, `notfall-fehlversuche`, `notfall-gemeldet`, `notfall-blatt`, `notfall-blatt-erzeugen` |
| Spur im Verwaltungsmodus, persönlicher Export, Fristenlauf | `modusspur`, `eigener-export-laeuft`, `eigener-export-fehler`, `fristen-tag` |
| Werkbank-Aufträge (#745): Belegung mit Frist, Stand, Abbrechen; eigene Änderungen der Zähler (#742, #745) | `auftrag` (`lauf`, `stand`, `abbruch:<id>`), `eigene-aenderung` |

**Darf je Prozess bleiben** (macht höchstens langsamer, nie falsch): Zwischenspeicher für Seitenbilder und PDF-Anzeige, gestempelte WebDAV-Fassungen (#722: höchstens 64 MB bzw. 2000 Einträge; seit #874 teilen sich mehrere Prozesse die Bytes, `zwischenspeicher.ts`), Schutzart je PDF, Discovery und Schlüssel des Anbieters (OIDC), gelesene Einstellungen mit kurzer Frist (Anmeldeschutz 10 s, WebDAV 5 s, OIDC 30 s), Anfragen an Pakete „schon angefordert“, Grenzen gleichzeitiger Arbeit, die die Rechenzeit dieses Prozesses schützen (scrypt an der Abrufseite, Uploads je Benutzer, Fragen), Messwerte und Auslastung. Was #744 für mehrere Prozesse offen ließ, löst #745 ([Mehrere Prozesse](#mehrere-prozesse)).

## Rundgänge, Tipps und Ankerpunkte (#831, #832) { #entdecken }

Rundgänge und Tipps sind **Daten, kein Code**. Ablagos eigene liegen in `shared/entdecken/` – im selben Format, das Pakete später als `inhalt/rundgaenge.yaml` und `inhalt/tipps.yaml` mitbringen (Stufe 2, Prüfung in [dms-registry #132](https://github.com/motom001/dms-registry/issues/132)). Es gibt einen Mechanismus für alle: Eine Quelle liefert rohe Einträge, `pruefeRundgaenge` und `pruefeTipps` (`shared/src/entdecken.ts`) prüfen sie, der Server filtert sie je Person (`server/src/entdecken.ts`). Ein Paket fügt später nur eine weitere Quelle hinzu.

| Datei | Inhalt |
| --- | --- |
| `shared/entdecken/anker.yaml` | feste Ankerpunkte der Oberfläche (maschinenlesbar, auch für die Registry) |
| `shared/entdecken/rundgaenge.yaml` | Ablagos Rundgang |
| `shared/entdecken/tipps.yaml` | Ablagos Tipps (Reihenfolge = Reihenfolge des Tipps des Tages) |
| `shared/src/sprachen/<sprache>/entdecken.json` | die Texte dazu |

Der Server liest die YAML-Dateien zur Laufzeit (im Image unter `/app/shared/entdecken`, siehe Dockerfile). Fehlerhafte Einträge fallen weg und stehen einmal im Protokoll; für die Person ändert sich nichts.

### Rundgang

```yaml
- schluessel: ablago            # klein, Ziffern, _
  start: erste_anmeldung        # manuell | erste_anmeldung (nur Ablago selbst)
  fuer: lesen                   # lesen (alle) | verwalten (nur mit Verwaltungsrecht)
  oeffne: { seite: start }      # diese Seite vor dem ersten Schritt öffnen
  schritte:                     # höchstens 8
    - schluessel: dreiteilung
      bild: dreiteilung         # eingebaute Grafik
    - schluessel: erledigen
      ziel: [navigation.zu-erledigen, startseite.zu-erledigen]   # der erste sichtbare Anker gilt
      fuer: lesen               # verwalten: Schritt nur für Verwaltende (z. B. Werkbank)
```

Texte: Titel, Beschreibung und Schlusssatz unter `rundgang.<rundgang>.titel | .beschreibung | .ende`, je Schritt `rundgang.<rundgang>.<schritt>.titel | .text | .text-handy | .text-verwalten | .ort` (Unterstriche im Schlüssel werden in der Sprachdatei zu Bindestrichen). `text-handy` gilt in der Handyfassung, `text-verwalten` für Personen mit Verwaltungsrecht, `ort` sagt Screenreadern, wo das hervorgehobene Element steht – zu jedem `ziel` ist es Pflicht. Pakete schreiben die Texte später direkt in die Datei (`titel`, `text`, `text_handy`, `text_verwalten`, `ort`). Grenzen: Titel 60, Texte 200 Zeichen.

Zur Laufzeit fällt ein Schritt still weg, wenn keiner seiner Anker sichtbar ist (z. B. am Handy) – mit einem Vermerk in der Konsole (`console.debug`), ohne Meldung für die Person.

### Tipp

```yaml
- schluessel: suche_in_dokumenten
  bereich: suche                # suche | post | fristen | mappen | konto | verwalten
  ziel: startseite.suche        # Anker mit fester Seite …
  # rundgang: ablago            # … oder ein Rundgang (genau eines von beiden)
  fuer: lesen                   # lesen | verwalten
  funktion: fragen              # optional: fragen | laufwerk | mail – nur, wenn eingeschaltet
  ab_version: 0.216.0           # optional: „Neu seit deinem letzten Besuch“
```

Text unter `tipp.<schluessel>`: höchstens 160 Zeichen und zwei Sätze, Du-Form, nur Begriffe aus dem [Glossar](https://github.com/motom001/dms/blob/main/docs/glossar.yml). **Jede sichtbare neue Funktion bringt ihren Tipp im selben PR mit** (mit `ab_version` der Version, in der sie erscheint); den Wortlaut prüft die laufende Qualitätskontrolle. Höchstens 20 Tipps je Paket.

### Ankerpunkte { #anker }

Ziele sind feste Ankerpunkte, keine HTML-Ids: Das Element trägt `data-anker="<anker>"` (bei `Link` die Eigenschaft `anker`). Die Liste steht in `shared/entdecken/anker.yaml` mit Seite, Beschreibung, `handy` (auch in der Handyfassung sichtbar) und `clients` (gibt es so auch in Clients). Muster wie `mappe.register:<key>`, `mappe.feld:<key>` und `werkbank.bereich:<route>` passen auf jeden Schlüssel. Heute gibt es unter anderem:

`neu`, `benutzermenue`, `navigation.ansichten`, `navigation.ansicht-waehlen`, `navigation.erweiterte-suche`, `navigation.zu-erledigen`, `navigation.neue-post`, `navigation.favoriten`, `liste`, `mappe`, `startseite.suche`, `startseite.fragen`, `startseite.feld-art`, `startseite.tipp`, `startseite.zu-erledigen`, `startseite.neue-post`, `startseite.termin`, `startseite.zuletzt`, `zu-erledigen.ansicht`, `mappe.aktionen`, `mappe.stern`, `mappe.register:<key>`, `mappe.feld:<key>`, `konto.abwesenheit`, `konto.schrift`, `konto.startseite`, `konto.tipps`, `konto.zusammenfassung`, `entdecken.rundgaenge`, `werkbank.bereich:<route>`, `werkbank.typen.suche`, `werkbank.sichten.suche`, `werkbank.nummernkreise.suche`, `werkbank.auskuenfte.suche`, `werkbank.auskuenfte.nur-offene`, `werkbank.fehlermeldungen.suche`.

`server/test/entdecken.test.ts` prüft beim Bauen: jeder Anker kommt im Quelltext der Oberfläche vor, Format, Ziele und Rundgänge existieren, Längen stimmen, und jeder Text steht in Deutsch und Englisch. Wer ein Element umbaut, behält das Attribut; neue Anker kommen dazu, vorhandene werden nicht umbenannt.

**Hinter einem Umschalter (#1002):** Ist ein Anker noch nicht sichtbar, meldet `warteAufAnker` (`web/src/entdecken/stand.ts`) ihn mit `ankerGesucht`. Eine Seite, die die Stelle erst nach dem Umschalten zeigt, hört mit `beiAnkerGesucht` darauf und schaltet um – nur für den Moment, gemerkt wird nichts. So zeigt das Feld der Startseite mit „Fragen · Suchen“ für `startseite.suche` die Suche und für `startseite.fragen` die Frage.

### Schnittstelle und Merker

- `GET /api/entdecken` – Rundgänge und Tipps für die angemeldete Person in ihrer Sprache (gefiltert nach Verwaltungsrecht und eingeschalteten Funktionen), dazu der Tipp des Tages (`tipp`), ob die Tipp-Zeile an ist (`tippsAn`) und welcher Rundgang jetzt von selbst startet (`starten`). Je Tipp: Anker und Seite bzw. Rundgang, Herkunft (`ablago`, später `paket:<id>`), `neu`, `ausgeblendet` und `clients` (für Clients geeignet: kein Rundgang, Anker gibt es auch dort).
- `POST /api/entdecken/tipps/:schluessel` mit `aktion`: `gezeigt`, `erledigt`, `ausblenden`, `einblenden`.
- `POST /api/entdecken/rundgaenge/:schluessel` mit `stand`: `gesehen` oder `spaeter`.

Gemerkt wird je Person in ihren Einstellungen (`entdecken_rundgaenge`, `entdecken_tipps`, `entdecken_version`; Tipp-Zeile aus: `tipps` = false) – keine Telemetrie. In einer Vertretung startet nichts von selbst, und nichts wird gemerkt. Migration 088 setzt für Konten, die sich vor dem Update schon angemeldet hatten, Ablagos Rundgang auf „gesehen“. Die Handbuch-Aufnahmen und Messskripte markieren ihre Konten ebenso (`aufnehmen.mjs`, `ladezeiten.mjs`).

**Pakete folgen:** `inhalt.rundgaenge` und `inhalt.tipps` im Manifest, die Prüfung beim Installieren, Werkbank → Tipps verwalten (eigene Tipps, Anpassungen) und der Export in „Paket erstellen“ kommen in einer späteren Stufe; ebenso die Einträge in `/api/v1`.

## Mehrere Prozesse (#745) { #mehrere-prozesse }

`DMS_PROZESSE` (Vorgabe 1, `auto` = Kerne − 1, höchstens 2 (`PROZESSE_EMPFOHLEN_MAX`; mit PostgreSQL im selben Container auch künftig höchstens 2), je Prozess 1 GB Arbeitsspeicher plus 1 GB Reserve, und nicht mehr, als `DMS_DB_VERBINDUNGEN` trägt; `prozesseAus`/`empfohleneProzesse` in `server/src/prozesse.ts`, #874). Mit 1 läuft alles wie vorher in einem Prozess.

- **Einstieg:** `server/src/index.ts` ist nur noch die Weiche. Mit mehr als einem Prozess wird er zum schlanken **Hauptprozess** (`leite`, lädt Ablago nicht) und startet mit `node:cluster` die Prozesse, die wieder in `index.ts` beginnen und `ablago.ts` laden (das frühere `index.ts`). Beim Bauen ist `dist/ablago.js` eine eigene Datei; der Import in `index.ts` hat darum keinen festen Pfad.
- **Rollen:** Prozess 1 ist der **Leiter**. Er startet zuerst – `verbund.erster`: Startseite (#802), Migrationen, einmalige Arbeiten beim Start – und meldet „bereit“, erst dann startet der Hauptprozess die übrigen (ohne Startseite und Migrationen). Startet der Leiter vor seinem ersten „bereit“ nicht, endet der Hauptprozess mit dessen Code (wie bisher: Docker startet neu; die Downgrade-Sperre bleibt stehen). Danach startet der Hauptprozess Abgestürzte neu (`neustartWarten`: 1 s, verdoppelt bis 60 s, nach 5 Minuten Laufzeit wieder 1 s), auch den Leiter (dann ohne Startseite). Im Protokoll des Hauptprozesses stehen nur Nummer, Code und Signal.
- **Verbund** (`Verbund` in `prozesse.ts`): `rufe` (Aufruf beim Leiter mit Ergebnis, Teilen und Fachfehlern samt Status), `melde` (an den Leiter, an alle, an die anderen), `frageAlle` (z. B. `prozess.stand`), `bereit`, `beendeAlle` (Neustart nach der Wiederherstellung, geänderte Datenbank-Anbindung, Ende des Lasttests). Der Hauptprozess reicht nur weiter (IPC mit `serialization: 'advanced'`, also auch Puffer und `Float32Array`). Mit einem Prozess erledigt `einzeln()` alles im eigenen.
- **Was der Leiter für die anderen erledigt** (`server/src/aufteilung.ts`): Anstöße für Texterkennung, Vorschaubilder und den Ereignisverteiler gehen als Meldung an ihn – die anderen arbeiten nichts davon selbst ab (ein Verteiler ohne die Abnehmer der Automatisierungen hätte Ereignisse als verteilt markiert). Sicherung, Prüfsumme, Probe und Wiederherstellung starten, Postfach abrufen, Eingangsordner prüfen und Vorschaubilder nachholen sind Aufrufe beim Leiter; laufende Sicherungen und Wiederherstellungen spiegelt er jede Sekunde an alle, damit `laeuft()` und `aktuellerLauf()` überall ohne Warten stimmen.
- **Paket-Läufer** genau einmal, im Leiter – er hält die API-Schlüssel der Pakete. Die anderen nutzen `Fernlaeufer` (`server/src/laeufer/fern.ts`): Aktionen, Vektoren, „Frag deine Ablage“ (Teile der Antwort kommen als Teile des Aufrufs), „Aus Dokument ausfüllen“, Übersicht. Was sie ohne Warten brauchen (welches Paket was anbietet, Dienstkonten der Pakete), schickt der Leiter bei jeder Änderung als Schnappschuss.
- **Werkbank-Aufträge** (`Auftraege.teile`): Der Auftrag läuft im Prozess, der ihn angenommen hat. „Nur einer zugleich“ ist eine Belegung im Kurzzustand mit 60 s Frist, die der laufende Prozess jede Sekunde verlängert; den Stand schreibt er dabei mit, `stand()` liest ihn überall. Abbrechen aus einem anderen Prozess setzt einen Merker. Routen mit 202 warten mit `angemeldet()`, bis der Stand für alle sichtbar ist. Stirbt der Prozess, zeigt der Stand „Unterbrochen“.
- **Hochgeladene Pakete** liegen bis zur Installation (30 Minuten) unter `files/hochladen/pakete/` (Archiv und Angaben, `0600`, Name aus dem Hash der Kennung) und werden beim anderen Prozess mit denselben Prüfungen neu gelesen.
- **Eigene Änderungen der Zähler** (#742): Nach dem Hochzählen des Haushaltsstands steht der neue Stand je Person kurz im Kurzzustand (`eigene-aenderung`); ein anderer Prozess fragt das nur, wenn die Mindestgültigkeit sonst greifen würde.
- **Einstellungen im Arbeitsspeicher** (Schlüssel der Verschlüsselung, E-Mail-Versand, OIDC, Schwelle der Zeitmessung): Jeder Prozess liest alle 2 Sekunden den Haushaltsstand `lesen`; ändert er sich, laden `Tresor.nachladen`, `Betrieb.nachladen`, `Oidc.vergiss` und `Messung.start` neu. Passen Schlüsseldatei und Fingerabdruck gerade nicht zusammen (Wechsel in einem anderen Prozess), versucht es der nächste Takt noch einmal.
- **Je Prozess:** Überlastschutz, Arbeiter (Vorgabe geteilt durch die Zahl der Prozesse). **Geteilt** (#874): Verbindungen – `DMS_DB_VERBINDUNGEN` gilt für alle zusammen (Vorgabe `verbindungenVorgabe`: 10 + 4 je weiteren Prozess), `verbindungsaufteilung` gibt dem Leiter zuerst die 4 Verbindungen, die er dauerhaft für Sitzungssperren reserviert (`lebenszeichen`, Eingangsordner, Postfächer und eine Reserve seit dem Ausbau der Webhooks, #991 – ohne sie warteten seine Abfragen endlos, und mit ihnen alles, was die anderen bei ihm aufrufen), den Rest teilen sich alle gleich (jeder weitere mindestens 2, der Leiter insgesamt mindestens 6), zusammen höchstens `max_connections` − 10; Zwischenspeicher – `teileZwischenspeicher(anzahl)` gibt jedem Prozess `1/anzahl` der Grenzen von PDF-Anzeige, WebDAV-Stempeln und Seitenbildern. **Halde:** Jeden Prozess startet der Hauptprozess mit `--max-old-space-size` (`haldeJeProzess`: die weiteren mit 60 % ihres Anteils am Speicher, 1024–1536 MB; `haldeLeiter`, #891: der Leiter mit 512 MB mehr, weil er zusätzlich die Arbeit im Hintergrund erledigt), außer es ist schon gesetzt oder es läuft nur ein Prozess; der Hauptprozess selbst bleibt ohne Grenze. Das Startprotokoll nennt beide Werte (`haldeLeiterMb`, `haldeMb`). **Neustarts** zählt der Hauptprozess (`Verbund.neustarts()`: Anzahl und die letzten zehn mit Nummer, Code, Signal) und schickt sie mit der Liste der Prozesse an alle. Der Befehl `dms` nutzt einen gemeinsamen Schlüssel vom Hauptprozess, die Datei schreibt der Leiter. Temporäre Uploads löscht ein Prozess beim Start neben anderen nur, wenn sie älter als 6 Stunden sind.
- **Systemzustand:** `frageAlle('prozess.stand')` liefert je Prozess RSS, Rechenzeit, Wartezeit der Ereignisschleife und laufende Anfragen; dazu Pss aus `/proc`. Für den Lasttest fragt `/api/werkbank/last` `prozess.last`: dasselbe plus die Wartezeit auf Verbindungen (`Poolmessung`, #874), die das einschaltet; dazu die Neustarts. `/api/werkbank/last` meldet den Arbeitsspeicher aller Prozesse zusammen (auch des Hauptprozesses) und die Wartezeit des langsamsten, je Prozess unter `engpass.speicher`. Die Grenze des Lasttests (1,5 GB) gilt seit #920 je Prozess; die Summe vergleicht er mit der Grenze × Prozesse.
- **Lasttest-Modus:** Misst der Leiter, lauschen auch die anderen nur auf dem internen Port (`listen(0)` teilt unter `cluster` denselben Port).
- **Tests:** `prozesse.test.ts` (Einstellung, Verbund mit echtem `cluster` über `test/hilfen-prozesse.ts`, Anstöße, Fern-Läufer, Uploads, Zähler, Aufträge, Schlüssel), `prozesse-e2e.test.ts` (ganzes Ablago mit zwei Prozessen: Startseite, Migration einmal, Systemzustand, Konsole, Auftrag, Absturz mit Neustart ohne Abmeldung, Beenden, Downgrade).

## Ereigniskatalog (#670) { #ereigniskatalog }

Was in Ablago passiert, steht an **einer** Stelle: `shared/src/ereignisse.ts` (`EREIGNISKATALOG`), die Texte in `shared/src/sprachen/de/ereignisse.json` (`name.<art>`, `text.<art>` – Unterstrich als Bindestrich –, `gruppe.<gruppe>`). Pakete (`code.ereignisse`, genau die Einträge mit `paket: true` plus die veralteten Namen in `VERALTETE_EREIGNISSE`) und Automatisierungen (#674) nehmen ihre Ereignisse aus diesem Katalog. **Der Kern meldet jedes Geschehen genau einmal** (#724) – mit `kern.ereignis(…)` (im Dienst `dienst.kern.ereignis(…)`) in den einen Ausgangskorb; einen zweiten Weg für Pakete gibt es nicht mehr. Die Liste zum Nachschlagen steht in der Werkbank beim Paket unter **Welche Ereignisse es gibt**.

**Regeln**

- **Nur Ids, Art, Feldschlüssel und Datum** in `daten` – nie Werte, Titel oder Namen. Wer mehr wissen will, liest mit eigenen Rechten nach.
- **Mindestens einmal, in derselben Transaktion:** `dienst.kern.ereignis(art, daten, von)` schreibt in den Ausgangskorb (Tabelle `ereignisse`, Migration 060). Läuft gerade eine Transaktion (`inTransaktion`), gehört das Ereignis zur Änderung – scheitert eines, wird beides nicht gespeichert. Jedes Ereignis hat eine feste Id; ein Abnehmer erkennt daran eine Wiederholung.
- **Mehrere Server:** Der `Ereignisverteiler` (`server/src/ereignisse.ts`) holt offene Ereignisse mit `FOR UPDATE SKIP LOCKED` und einer Sperre (`gesperrt_bis`, 120 s). Erst wenn **alle** Abnehmer es angenommen haben, gilt ein Ereignis als verteilt; sonst Wiederholung nach 1, 5, 30, 120 und 360 Minuten, danach aufgegeben (Protokoll). Verteilte Ereignisse bleiben 7 Tage.
- **Eine Regel für Wiederholungen:** `wiederholungNach(versuche)` in `shared/src/ereignisse.ts` (1, 5, 30, 120, 360 Minuten) gilt für den Ausgangskorb und die Zustellung an Pakete.
- **Abnehmer im Kern:** `automatisierungen`, `pakete` (jedes abonnierte Ereignis; landet mit fester Id je Paket in der Zustellung des Paket-Läufers, `paket_ereignisse`). **Aufträge** an genau ein Paket (`datei.umwandeln`, `datei.volltext`, `datei.archivfassung`, `paket.einstellungen_geaendert`, Gruppe `auftrag`) sind kein Geschehen für andere: `dienst.ereignisseDienst.auftrag(paket, art, daten)` legt sie direkt in die Zustellung.
- **Veraltete Namen:** `texterkennung.fertig` meldet der Kern nicht mehr. Ein Paket, das es abonniert hat, bekommt `volltext.fertig` mit `quelle: kern` unter dem alten Namen (Übergang, `VERALTETE_EREIGNISSE`, entfällt mit 1.0.0). **Alle Übergangsausnahmen** stehen mit der Version, mit der sie entfallen, in `server/src/uebergaenge.ts` (#902); `uebergaenge.test.ts` wird rot, sobald Ablago diese Version erreicht. Neue Sonderwege für alte Pakete oder Dateien nur mit Eintrag dort.
- **Bündeln:** Einträge mit `buendelS` (heute `mappe.geaendert`, 5 s) fassen schnelle Folgen zur selben Mappe zusammen, solange das Ereignis noch nicht verteilt ist; die Feldschlüssel werden vereinigt (`mischeFelder`).
- **Frist erreicht** genau einmal: `frist_meldungen` (Mappe, Feld, Datum, Zeitpunkt) als Primärschlüssel; Merken und Ereignis in einer Transaktion.
- **Still:** `dienst.kern.ohneEreignisse(f)` – Beispiele, Demo-Daten (Erzeugen und Entfernen). Nur Ereignisse, die Pakete an Dateien verarbeiten (Volltext, Vektoren, Post), kommen mit `ausloeser.still` in den Ausgangskorb – Automatisierungen übergehen sie, Mappen-Ereignisse entstehen gar nicht. Eine Wiederherstellung markiert alle offenen Ereignisse als verteilt; in Wartung und während einer Wiederherstellung ruht der Verteiler.

**Abnehmer**

```ts
dienst.ereignisse.abonniere('mein-abnehmer', async (e: KatalogEreignis) => {
  // e.id, e.art, e.daten, e.ausloeser, e.erstellt – Fehler werfen heißt: später noch einmal
});
```

Der Abnehmer `pakete` gibt Mappen-Ereignisse und `frist.erreicht` an Pakete weiter, die sie abonniert haben, den Typ unter `code.mappentypen` nennen (eigene, fremde, `*`) und die Mappe mit den Rechten ihres Dienstkontos gerade lesen dürfen (#686: bestätigte Rechte, Einstellung `paket_verwehrt` je Mappentyp, Regeln für die Rolle *Paket*; sonst Protokolleintrag statt Zustellung) – mit einer aus Ereignis- und Paket-Id berechneten Id, damit eine Wiederholung beim Paket nicht doppelt ankommt.

**Auslöser** (`e.ausloeser`): `{ art: 'benutzer' | 'paket' | 'automatisierung' | 'system', id, konto, kette }`. Den Auslöser nimmt `dienst.kern.ereignis` aus dem Konto (`von`: Benutzer bzw. Dienstkonto eines Pakets) oder aus `dienst.kern.mitAusloeser(a, f)`. Eine Automatisierung (#674) führt ihre Aktionen so aus:

```ts
await dienst.kern.mitAusloeser({ art: 'automatisierung', id: regel.id, konto: systemkonto.id, kette: e.ausloeser.kette ? e.ausloeser.kette + 1 : 1 }, () => aktion());
```

Damit erkennt sie ihre eigenen Änderungen und kann Ketten begrenzen. Ein Paket bekommt seine eigenen Änderungen nicht gemeldet.

**Neues Ereignis:** Eintrag in `EREIGNISKATALOG` (Gruppe, Felder, ggf. `paket`, `mappentyp`, `buendelS`), Texte in `ereignisse.json`, an der Stelle der Änderung `await this.ereignis(...)` – möglichst innerhalb der Transaktion. Soll es für Pakete abonnierbar sein, zusätzlich in `EREIGNISSE` (`shared/src/pakete.ts`) und in der Registry (`schema`, `pruefen.py`).

## Automatisierungen (#674) { #automatisierungen }

Kleine Abläufe ohne Code: **Wenn · Und · Dann** (Sonst kommt mit Stufe 2). Modell und Prüfungen in `shared/src/automatisierung.ts`, Motor und Speicher in `server/src/automatisierung.ts` (Tabellen `automatisierungen` und `automatisierung_laeufe`, Migration 061; die Fassungen seit #1006 in `fassungen`, Migration 108), Texte in `shared/src/sprachen/de/automatisierung.json`.

**Modell**

- **Genau eine Wenn-Karte:** ein Ereignis aus dem Katalog (alle Gruppen außer `zaehler`, optional nur ein Mappentyp, bei `mappe.geaendert` optional nur bestimmte Felder und mit `angelegt` auch beim Anlegen – der Motor hört dann zusätzlich auf `mappe.angelegt`, #1001) oder `datum` – „Datumsfeld in N Tagen erreicht“ (negativ: vor N Tagen), täglich ab einer Uhrzeit in der Zeitzone des Haushalts. Die Wenn-Karte legt den **Kontext** fest: die Mappe des Ereignisses (`daten.mappe`, bei Benutzer-Ereignissen die Benutzer-Mappe) und ihren Mappentyp.
- **Und:** Bedingungen aus dem Baukasten der Ansichten (`Bedingung` aus `sichten.ts`), dazu „Mappe ist in Ansicht …“ und „Mappe ist in den Favoriten von …“ (Person, Rolle, Feld). Jede umkehrbar (`nicht`), Gruppen `alle`/`eine` eine Ebene tief. Ausgewertet in der Datenbank (`Automatisierungshilfen.trifftTeile` → `repo.inKlauseln`), „ich“ ist das Systemkonto.
- **Dann:** Karten in ihrer Reihenfolge; ausführen tun sie die Einträge in `DANN_AUSFUEHRER` (`(karte, kontext) => Promise<string>` – die Zeile fürs Protokoll; im Probelauf (`trocken`) nur beschreiben). „Danach keine weiteren Automatisierungen ausführen“ (`stopp`) erledigt der Motor selbst.
- **Platzhalter** wie beim Mappentitel (`{feld}`, `{feld|filter}`), dazu `{titel}`, `{mappentyp}`, `{heute}`, `{automatisierung}`, bei `datum` auch `{datum}` und `{tage}`. Werte mit den Rechten des Systemkontos; Titel verknüpfter Mappen, die es nicht lesen darf, erscheinen als „(nicht sichtbar)“; Passwörter nie.

**Ablauf**

1. Der Abnehmer `automatisierungen` des Ereigniskatalogs sucht eingeschaltete, nicht angehaltene Automatisierungen mit passender Wenn-Karte und führt sie **nacheinander** nach `reihenfolge` (1–99, dann Name) aus. Jede liest den aktuellen Stand.
2. Je Automatisierung und Ereignis entsteht **genau ein Lauf** (`UNIQUE (automatisierung_id, ereignis_id)`) – kommt ein Ereignis noch einmal oder prüfen zwei Server denselben Tag, läuft nichts doppelt. Beim Zeitplan ist die Ereignis-Id aus Automatisierungs-Auslöser, Mappe und Datum berechnet; `letzter_tag` ist der Merker des Zeitplan-Bausteins (verpasste Tage bis 31 zurück werden nachgeholt).
3. Ausgeführt wird unter dem Systemkonto „Automatisierung“ (`dienst.postSystemmappen.systemZugriff('automatisierung')`) und mit `dienst.kern.mitAusloeser({ art: 'automatisierung', id, konto, kette })` – Historie und Ereignisse zeigen, wer gehandelt hat. Darf das Systemkonto die Mappe nicht lesen, wird der Lauf übersprungen.
4. Jeder Schritt (Wenn, Und, jede Dann-Karte) steht mit Zustand im Lauf (`schritte`) – die Oberfläche zeigt den Fortschritt live. Ein Kartenfehler beendet den Lauf als `fehlgeschlagen` (wiederholbar), die folgenden Automatisierungen laufen trotzdem.

**Zeitplan-Baustein** (`server/src/zeitplan.ts`, #724): `faelligeTage(zuletzt, jetzt, takt)` ist die eine Regel – fällig ist jeder Tag nach dem zuletzt gelaufenen, an dem der Takt gilt (`an(tag)`, z. B. Wochentag, Feiertag), sobald seine Uhrzeit erreicht ist, höchstens `nachholenTage` zurück (0 = nur heute); neu beginnt heute. `laufeFaellige(merker, jetzt, takt, lauf)` trägt den Tag erst ein (vergleichen und tauschen, `Einstellungen.tausche`) und läuft dann – mit mehreren Servern macht ihn genau einer. Sicherung, Probe-Wiederherstellung, Tägliche Zusammenfassung (je Benutzer) und „Datum erreicht“ (31 Tage nachholen) nutzen ihn; die Merker-Schlüssel der Einstellungen sind dieselben wie vorher.

**Datum erreicht** (`art: 'datum'`): `vorlauf` mit `einheit` (`tage`, `wochen`, `monate`), `uhrzeit`, `wiederholung` (Monate). `erreichteDaten(tag, vorlauf, einheit)` liefert die Feld-Daten, die an `tag` erreicht sind – bei Monaten alle D mit D − Vorlauf = tag (Monatsende gekappt). Alte Karten (`tage`, `frist.erreicht`) übersetzt `bereinigeWenn`.

**Ein Weg für Aufgaben** (`AufgabenDienst.aufgabeAusAutomatisierung`, #724): `aufgabenEmpfaenger` löst Abwesenheit und Deaktivierung über `empfaengerAufloesen` auf; ist niemand Aktives erreichbar, gehen sie an die Administratoren (`null`). `aufgaben.anlass` (Migration 062, `AufgabenAnlass`): `datum` (erledigt sich in `fristenAbgleichen`, wenn das Datum nicht mehr stimmt; `wiederholung` → Folgetermin), `post` (in `postAufgaben`, wenn die Post nicht mehr neu ist), `abwesenheit` (beim Ende der Abwesenheit). Aus „Datum erreicht“ wird die Aufgabe eine **Frist** (`art: 'frist'`, Feld, Datum); der eindeutige Index `aufgaben_frist_idx` gilt je Mappe, Feld, Datum und Empfänger – dieselbe Person bekommt nie zwei.

**Dann-Karten** (`server/src/automatisierung-karten.ts`, #676)

- **Feld ändern** (`feld`): `werte` je Feldschlüssel – fest, Text mit Platzhaltern (Text, Langtext, formatierter Text), bei Datumsfeldern auch `heute`, `heute+7`, `heute-3`. Geschrieben wird über `MappenDienst.aendereMappe` mit dem Zugriff des Systemkontos und nur den gewählten Feldern (#609): Feldformate, Pflicht, Auswahllisten und Verweisziele werden geprüft wie im Formular, Archivmodus und Fristsperre nie umgangen. Die Historie trägt `automatisierung: { id, name, eingerichtetVon }`.
- **Aufgabe / Benachrichtigung** (`aufgabe`): Empfänger Person, Rolle (alle aktiven Mitglieder), Feld der Mappe (Verweis auf Benutzer) oder `ersteller` (wer die Mappe angelegt hat); `als: 'aufgabe'` legt jedes Mal eine Aufgabe an (Fälligkeit `faellig` Tage ab heute → erscheint unter „Anstehend“), `als: 'benachrichtigung'` bündelt je Automatisierung, Mappe und Empfänger (eine offene, der Text wird aktualisiert). Wer die Mappe nicht lesen darf, bekommt sie an seiner eigenen Benutzer-Mappe – ohne Link. Platzhalter füllt Stufe 1 mit den Rechten des Systemkontos (Empfänger-Rechte: #683).

**Oberfläche** (`web/src/werkbank/Automatisierungen.tsx`, #675): Werkbank → Ablage aufbauen → Automatisierungen, dreiteilig. Karten aus dem Vorrat kommen per `useZiehen` (Ablagen `wenn`/`und`/`dann`) oder per „+ Karte“ (Auswahlfeld, Tastatur) hinein; Dann-Karten und die Liste „nach Auslöser“ sortieren per Ziehen oder Alt+↑/↓ (Reihenfolge wird in Zehnerschritten neu vergeben). **Live-Fortschritt per Abfrage:** solange der Editor offen ist, holt er alle 2 s `GET …/:id/laeufe` – die Schritte stehen in der Datenbank, deshalb mit mehreren Servern verträglich, ohne SSE und ohne Sitzungsbindung. Die Liste fragt alle 15 s nach. Beim Start legt `legeBeispiele()` drei ausgeschaltete Beispiele (Herkunft `dms`, feste Ids aus `uuidAus`) an, wenn es sie noch nicht gibt.

**Schutz und Grenzen** (`AUTOMATISIERUNG_GRENZEN`)

- Keine Selbstauslösung (eigene Änderungen lösen dieselbe Automatisierung nicht aus), Ketten höchstens 3 tief, Bremse 30 Läufe je Minute (dann angehalten), Laufzeit 60 s, 200 Automatisierungen, je Bereich 20 Karten, Verlauf 200 Läufe bzw. 30 Tage.
- **Bearbeiten geht vor Automatisierung:** Fehlt etwas (Mappentyp, Feld, Ansicht), blockiert das nie das Arbeiten – die Automatisierung wird rot und angehalten (`angehalten.grund = 'fehlerhaft'`), spätestens beim nächsten Lauf oder Zeitplan-Durchgang. Speichern geht nur mit gültigem Stand.
- Demo-Daten und Beispiele lösen nichts aus (`ohneEreignisse`), in Wartung und Wiederherstellung ruht der Verteiler. Nach einer Wiederherstellung sind alle eingeschalteten Automatisierungen angehalten, bis ein Admin sie wieder einschaltet.
- Speichern mit `version` (veralteter Stand → 409). Fassungen wie bei allen Einstellungen der Werkbank (#1006, `server/src/fassungen/`, Tabelle `fassungen`): wiederherstellen über das normale Speichern. Im Vollexport: `struktur/automatisierungen.json` (je Automatisierung ihre Fassungen, `version` = Nummer der Fassung) und `struktur/fassungen.json`; in der Sicherung alle Tabellen.

## Automatisierungsvorlagen und Mappen-Abläufe (#1044) { #ablaufvorlagen }

Eine **Automatisierungsvorlage** ist eine Automatisierung mit Lücken, die man an einer Mappe anwendet; die angewendete heißt **Mappen-Ablauf**. „Aufgabe vergeben“ und „Erinnern“ sind solche Vorlagen – es gibt keinen eigenen Weg für Erinnerungen und von Hand vergebene Aufgaben mehr. Modell und Prüfungen in `shared/src/ablaufvorlagen.ts`, Ablauf in `server/src/aufgaben/ablaeufe.ts` (`MappenAblaeufe`, `dienst.ablaeufe`), Routen in `aufgaben.routen.ts`, Oberfläche in `web/src/werkbank/Ablaufvorlagen.tsx` und `web/src/ablage/Aufgaben.tsx` (`Geplant`, `NeueAufgabe`, `ErinnerungFormular`, `AblaufFormular`). Migration 105.

**Modell**

- **Vorlage** (`Ablaufvorlage`): `wann` (`sofort`, `datum` – beim Anwenden gefragt –, `in` mit `anzahl` und `einheit`), `fragen` (`empfaenger`, `datum`, `text`), `karten` – nur `aufgabe` (`VORLAGEN_KARTEN`, Aufgabe oder Benachrichtigung) mit Empfängern `frage` (die Antwort), `selbst` (wer anwendet), `ersteller` (wer die Mappe angelegt hat) oder `feld` (Verweis auf Benutzer; nur mit festen `typen`). `vorlagenEingabeFehler` lehnt alles andere ab (keine stille Bereinigung), `vorlagenProbleme` prüft den Aufbau.
- **Kennung** statt Id: Kern-Vorgaben `aufgabe_vergeben`, `erinnern` (`KERN_VORLAGEN`, `kernVorlage()`), aus Paketen `paket:schluessel`, eigene `eigen:<uuid>`. Gespeichert (`ablaufvorlagen`; Fassungen wie alle Einstellungen der Werkbank in `fassungen`, Art `ablaufvorlage`, seit Migration 109) wird eine Kern-Vorgabe erst, wenn ein Admin sie ändert oder ein Paket sie mit `ersetzt` **überlagert** – dann unter ihrer Kennung; ohne Zeile gilt die Vorgabe des Kerns. Abläufe nennen die Kennung (`mappen_ablaeufe.vorlage`) und bleiben gültig, wer auch immer die Vorlage gerade liefert.
- **Mappen-Ablauf** (`MappenAblauf`, Tabelle `mappen_ablaeufe`, früher `erinnerungen`): Vorlage, Mappe, Antworten (`empfaengerId`, `text`), `datum` (wann er läuft), `erstelltVon` (die Person) und `angehalten`. „Sofort“ legt keinen an.

**Ablauf**

1. `anwenden(mappe, kennung, antworten, person)` – die Route hat Leserecht und Empfänger geprüft (`darf`, `empfaengerSichtbar`). Antworten wie früher die Dialoge (gleiche Meldungen), **Bremse** `ABLAEUFE_JE_PERSON_UND_MAPPE` (offene je Person und Mappe) und `ABLAEUFE_JE_MINUTE` (angewendete je Person und Minute, über `ablauf_verlauf`) aus `grenzen.ts` – sonst 429.
2. **Sofort** läuft in derselben Anfrage: so schnell wie früher (ohne weitere Platzhalter kein Motor, kein Zugriff des Empfängers). Sonst entsteht der Ablauf; liegt sein Datum heute oder früher, läuft er gleich.
3. Der tägliche Lauf (`Fristen.fristenLauf` → `ablaeufe.faellige`) nimmt jeden fälligen Ablauf in **einer Transaktion** aus der Tabelle (`loescheAblauf` liefert nur dem einen true – mehrere Server) und führt seine Karten aus.
4. **Rechte zur Laufzeit** (`pruefePerson`): Person ist ein aktiver Benutzer (kein Paket- oder Systemkonto) und darf die Mappe **jetzt** lesen. Sonst `angehalten` (`person`, `deaktiviert`, `leserecht`, `vorlage`) – Hinweis in der Übersicht der Werkbank und in der Mail an die Verwaltung; `fortsetzen` prüft erneut.
5. **Karten** auf dem Weg der Aufgaben: sofort `manuell`, sonst `erinnerung` mit Datum, Ersteller = Person, dieselben Einträge in der Historie (bei `erinnern` wörtlich wie bisher), Vertretung (`leiteUm`), Fall ohne Leserecht (`faelleNach`, #798); Benachrichtigungen gebündelt (`benachrichtigeGebuendelt`, Schlüssel `ablauf:<kennung>`). Platzhalter füllt der **Motor** (`dienst.ablaufPlatzhalter` → `Automatisierungen.fuelleMit`) mit den Rechten der Person und des Empfängers (#795); `{eingabe}`, `{person}`, `{empfaenger}` setzt `MappenAblaeufe` danach ein, damit eine Eingabe nie selbst Platzhalter wird. Von Hand geschriebener Text bleibt für Empfänger ohne Leserecht sichtbar (kein `anlass`).
6. **Verlauf** je Vorlage in `ablauf_verlauf` (angewendet, geplant, gelaufen, angehalten, gelöscht, fortgesetzt), aufgeräumt wie die Läufe der Automatisierungen.

**Vorlagen aus Paketen** (`inhalt.ablaufvorlagen`, ab `DMS_ABLAUFVORLAGEN_AB` = 0.256.0): `pakete.ts` liest und prüft sie (nur erlaubte Karten, `ersetzt` nur für Kern-Vorgaben, Typen des Pakets oder seiner Abhängigkeiten), die Rechte-Vorschau nennt jede mit ihren Karten (bei einem Update „neu“ bzw. „andere Karten“). `MappenAblaeufe.ausPaket` legt an bzw. ersetzt Unverändertes; beim Entfernen geben Überlagerungen die Kern-Vorgabe zurück, Vorlagen mit offenen Abläufen bleiben als eigene.

**Umstellung** (Migration 105): `erinnerungen` → `mappen_ablaeufe` mit `vorlage = 'erinnern'`; `erstellt_von` bleibt, ist er leer oder kein Mensch, wird es der Empfänger. Der Papierkorb liest ältere Einträge als Abläufe von „Erinnern“. `AufgabenVertretung.legeAufgabeAn` ist nur noch die Vorlage „Aufgabe vergeben“.

**Schnittstelle:** `GET`/`POST /api/v1/mappen/{id}/ablaeufe`, `PUT`/`DELETE /api/v1/ablaeufe/{id}`; die Adressen für Aufgaben und Erinnerungen bleiben und gehen über dieselben Vorlagen. Im Vollexport `struktur/ablaufvorlagen.json` und `daten/ablaeufe.jsonl`.

## Wege nach draußen { #wege-nach-draussen }

Ablago baut **von sich aus keine Verbindung** ins Internet auf. Jeder Weg nach draußen ist abgeschaltet, bis ein Mensch ihn auslöst oder ein Administrator ihn einschaltet. Die Übersicht für Nutzer steht im Administratorhandbuch unter [Was deine Ablage verlässt](https://help.ablago.app/admin/aktuell/datenschutz/#was-deine-ablage-verlasst).

| Weg | Wer schaltet ihn ein | Was geht hinaus | Wo im Code |
| --- | --- | --- | --- |
| Paketkatalog | Administrator auf Knopfdruck, Einrichtungsassistent im Schritt „Pakete“ | nur die Anfrage an den Katalog | `server/src/pakete.ts`, `katalogsignatur.ts` |
| Versionsabgleich | Administrator auf Knopfdruck (Werkbank → Technik) | Commit-Kennung, keine Daten der Ablage | `server/src/system.ts` |
| E-Mail | Administrator richtet den Mailserver ein; Benutzer versenden | versandte Mappen und Dokumente, Tägliche Zusammenfassung (Titel, Links), Einladungen, Auskünfte, Info-Mail an Notfallkontakte (#812: nur Text, kein Link, nur drei Namen; höchstens 20 je Tag) | `server/src/mail.ts`, `aufgabenmail.ts`, `notfallkontakte/` |
| Postfach | Administrator richtet es ein | Abruf beim eigenen Mailserver | `server/src/postfach.ts`, `postfach-oauth.ts` |
| Anmeldung über einen Anbieter | Administrator | Anmeldevorgang beim Anbieter | `server/src/oidc.ts` |
| Paket-Netz | Administrator bestätigt bei der Installation | nur an die Adressen aus Manifest bzw. Dienst-Adresse | Paket-Läufer, Recht `netzwerk` |
| Abruf-Links (Auskunft) | Administrator erzeugt den Link | die Auskunft, nur nach Abrufcode | `server/src/abruf.ts` |

Herunterladen (auch ein Brief aus Vorlage, #1040), E-Mail, Export und das WebDAV-Laufwerk fragen eine **gemeinsame Prüfstelle** in `server/src/ausgang/` (#723, [Ausgang](#ausgang)): Lesen und Exportrecht je Mappe, über `dienst.ausgang.pruefeAusgang` bzw. `dienst.ausgang.mitnehmbar`.

**Regel für neue Wege:** Ein neuer Weg nach draußen braucht ein freigegebenes Issue, ist **ausgeschaltet**, bis ihn jemand ausdrücklich einschaltet, schickt so wenig wie möglich (Zahlen statt Inhalte, wo es reicht), steht in dieser Tabelle und in der Übersicht im Administratorhandbuch und wird von Sicherheit geprüft.

## Zähler-Endpunkt und Schlüssel-Stufen (#625) { #zaehler-endpunkt }

Andere Programme (Hausautomatisierung, Wand-Tablet, Clients) wollen oft nur wissen, **ob etwas Neues da ist**. Dafür gibt es `GET /api/v1/ich/zaehler` (intern `/api/ich/zaehler`, `SichtenDienst.zaehlerAbruf`):

```sh
curl -i -H "Authorization: Bearer dms_…" https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 200 OK
# ETag: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"
# {"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}

curl -i -H "Authorization: Bearer dms_…" -H 'If-None-Match: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"' https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 304 Not Modified   (ohne Inhalt)
```

- **Nur Zahlen.** Die Antwort enthält nie Titel, Namen, Absender oder Inhalte – auch künftige Felder nicht. Das OpenAPI-Schema `Zaehlerstand` hat `additionalProperties: false`, der Test `server/test/zaehler-api.test.ts` prüft die Schlüssel und dass keine Texte durchrutschen.
- **Woher die Zahlen kommen.** `zuErledigen` ist `eingang` aus `SichtenDienst.zaehler` (#512), `ueberfaellig` zählt die eigenen überfälligen Einträge von `Fristen.termine` (#528, #725; `anstehend` ist mit #725 entfallen), `neuePost` zählt Post im Stand „Neu“ mit „Für“ = ich oder leer über `zaehleKlauseln` – mit eigenem `Zaehlerspeicher` am Haushaltsstand. Alles in den Rechten des Benutzers (Lesefilter); nichts wird für den Endpunkt neu gerechnet, solange sich am Haushalt nichts ändert.
- **Stand in der Datenbank** (Tabelle `zaehlerstaende`, Migration 056). Je Abruf bildet der Server einen Hash der Zahlen (`fingerabdruck`), vergleicht ihn mit dem gespeicherten und zählt `stand` nur bei einer Abweichung hoch (`Repo.setzeZaehlerstand`, ein `INSERT … ON CONFLICT DO UPDATE … WHERE abdruck IS DISTINCT FROM …`: gleichzeitige Abrufe zählen eine Änderung einmal). Unverändert heißt: nur lesen. Der Haushaltsstand aus #512 lebt nur im Arbeitsspeicher und fängt nach jedem Neustart bei 0 an – als ETag taugt er darum nicht. Das ETag ist `"z<stand>-<hash>"`: Gleiches ETag heißt gleiche Zahlen, auch nach einem Neustart oder einer Wiederherstellung.
- **ETag und 304.** `passtEtag` (`http/routen-hilfen.ts`) versteht Listen, `W/…` und `*`. Eine Route setzt eigene Köpfe über `Antwort.koepfe`; Köpfe der Anfrage liest sie über `Anfrage.kopf(name)`. `Cache-Control: private, no-cache` statt `no-store`, damit Programme nachfragen dürfen.
- **Schlüssel-Stufe „nur Zähler“** (`recht = 'zaehler'`, `NUR_ZAEHLER` und `ZAEHLER_PFAD` in `apischluessel.ts`). `pruefeZugang` lässt sie nur an `GET /api/v1/ich/zaehler` durch; jede andere Route unter `/api/v1` und – ausdrücklich – jede interne Route mit einem solchen Schlüssel im Kopf bekommt `403` (`api.schluessel.nur-zaehler`), das Laufwerk ebenfalls (`webdav.ts`). „Passwörter lesen“ gibt es für diese Stufe nicht. Eine neue Schnittstelle, die API-Schlüssel annimmt, muss die Stufe genauso abweisen.
- **Grenzen.** Der Überlastschutz (#544) zählt auch diese Anfragen. Eine Begrenzung je Schlüssel gibt es nicht; ein Abruf aus dem Zwischenspeicher kostet wenige Millisekunden. Läuft Ablago auf mehreren Servern, hat jeder seinen eigenen Zwischenspeicher (wie bei #512, höchstens 5 bzw. 30 Minuten alt) – bis dahin können zwei Server kurz verschiedene Zahlen liefern, der Stand zählt dann öfter hoch als nötig.

**Weitere Zahl aufnehmen:** Feld in `Zaehlerzahlen` (`dienst.ts`) und im OpenAPI-Schema ergänzen, im Test `ZAHLEN` – und nur Zahlen. Ändert sich die Bedeutung einer vorhandenen Zahl, `v` im Hash erhöhen, damit jeder Client einmal neu liest.

## Nach außen melden { #nach-aussen-melden }

Ablago meldet geänderte Zahlen **nicht** von sich aus: Clients fragen `GET /api/v1/ich/zaehler` mit `If-None-Match` ab (siehe oben). Den eigenen Zähler-Webhook (#627: `server/src/webhook.ts`, Tabellen `webhooks` und `webhook_meldungen`, Einstellung `webhook_ziele`, Werkbank → Webhooks, Mein Konto) hat #991 ausgebaut – zwei Wege für dasselbe widersprechen „gleiche Sache an einer Stelle“ (Muster C9). Migration 106 löscht Tabellen und Einstellung; alte Sicherungen spielen sich weiter ein, weil die Wiederherstellung die Migrationen danach nachholt.

Wer künftig etwas nach außen melden will, nimmt eine [Automatisierung](#automatisierungen) mit der Dann-Karte „URL aufrufen“ (#671). Sie bringt ihren eigenen Schutz für Ziele mit; nichts vom alten Webhook (Ziel-Liste, Signatur, Ausgangskorb) wird dafür weiterverwendet.

Mehr Hintergrund im Administratorhandbuch: [Technik](https://help.ablago.app/admin/aktuell/technik/) und [Entscheidungen](https://help.ablago.app/admin/aktuell/entscheidungen/).
