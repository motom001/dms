# Entscheidungen

Kurz festgehalten, damit spätere Änderungen wissen, warum etwas so ist.

## Fachmodell

- **Mappe als einziges Grundkonzept.** Vertragspartner, Vertrag, Rechnung, Gegenstand sind Mappen unterschiedlicher Mappentypen. Ein Mappentyp definiert Felder; eine Mappe speichert Werte je Feldschlüssel.
- **Verweise statt Ablageort.** Zusammenhänge entstehen über Referenzfelder (Rechnung → Vertrag → Vertragspartner). Rückverweise werden nicht gepflegt, sondern abgeleitet.
- **Zwei Verweisarten.** *Zugehörigkeit* („gehört zu“) zählt später bei „alles zu X“ und bei Auswertungen mit; *Bezug* (z. B. Aussteller) ist nur eine Verknüpfung. So landet bei „alles zum Haus“ nicht jede Rechnung desselben Handwerkers.
- **Hierarchie über Verweis auf den eigenen Typ.** Haus → Heizung → Wärmepumpe braucht keine Sonderlogik.
- **Feste Feldschlüssel.** Die Bezeichnung eines Feldes ist änderbar, der Schlüssel nach dem ersten Speichern nicht – gespeicherte Werte und spätere API-Abgleiche bleiben gültig.
- **Entfernte Felder löschen keine Werte.** Die Werte bleiben an der Mappe und werden als „Werte ohne Felddefinition“ angezeigt.
- **Definitionsänderungen machen Mappen nicht stillschweigend ungültig.** Passt eine Mappe nicht mehr (neues Pflichtfeld, entfernter Auswahlwert), wird sie markiert; korrigiert wird beim nächsten Speichern.

## Technik

- **PostgreSQL** statt SQLite: JSON-Felder mit Index, Volltextsuche mit deutscher Wortstammbildung, Row-Level-Security für die Trennung von Haushalten, parallele Schreibzugriffe.
- **`haushalt_id` in jeder Tabelle** von Anfang an; bis zur Benutzerverwaltung gibt es einen Standardhaushalt.
- **Verweise zusätzlich in einer eigenen Tabelle** (`verweise`): schnelle Rückverweise und Löschschutz in der Datenbank selbst.
- **SQL-Migrationen als Dateien, kein ORM.** Die offene Frage „Prisma oder Drizzle“ ist damit vertagt, nicht entschieden: Für das generische Mappenmodell (JSON-Werte, dynamische Felder) bringt ein ORM wenig, und reines SQL bleibt am leichtesten nachvollziehbar und portierbar. Migrationen laufen beim Start in einer Transaktion.
- **Ein Image** für Server und Oberfläche (modularer Monolith); auf dem NAS laufen nur App und Datenbank.

## Anmeldung

- **Einrichtungsassistent mit Einrichtungscode** (#119, zuvor: erster Aufruf ohne Code). Der Code steht im Protokoll des Containers und in `/data/geheim/EINRICHTUNGSCODE`; er schützt die Einrichtung und den Datenbanktest (der sonst Rechner im Netz abfragen könnte). Versuchsweise – ob der Code den Einstieg zu umständlich macht, zeigt die Rückmeldung aus der Praxis.
- **Datenbank-Anbindung als Datei unter `/data/geheim`**, führend vor `DATABASE_URL` (#119): So lässt sich das DMS ohne Bearbeiten von Umgebungsvariablen in Betrieb nehmen; ohne erreichbare Datenbank startet es im Einrichtungsmodus und danach im selben Prozess das eigentliche DMS.
- **Mandant statt Haushalt** in Oberfläche und Handbuch (#119), damit das DMS auch für kleine Firmen passt. Intern heißt es weiter `haushalt_id`; ein Umbau brächte keinen sichtbaren Nutzen. Frische Installationen nutzen den Mandanten, den die erste Migration anlegt (mit Designs und Einstellungen).
- **Administratoren arbeiten nicht in der Ablage:** Der Assistent legt deshalb gleich einen ersten normalen Benutzer an.
- **Rollen:** Administrator (Einrichtung, Benutzer) und Mitglied (Ablage). Vorerst sehen alle angemeldeten Benutzer alle Mappen.
- **Passwörter** mit scrypt aus Node (keine native Bibliothek). **Sitzungen** als HttpOnly-Cookie, in der Datenbank nur als SHA-256-Hash. Gleiches gilt für Einladungs- und Passwort-Links (Einladung 7 Tage, Zurücksetzen 1 Stunde, jeweils nur einmal nutzbar).
- **Schutz vor fremden Seiten:** Ändernde Anfragen brauchen den Header `X-DMS`, den nur die eigene Oberfläche setzt; dazu `SameSite=Lax`.
- **E-Mail optional:** Ohne SMTP zeigt die Benutzerverwaltung die Links zum Kopieren an.
- **Routen zentral** in `server/src/routen.ts`, jede mit Zugriffsstufe (offen, angemeldet, admin).

## Ablage

- **Drei Spalten:** Sichten → Liste → Mappe. Sichten sind vorerst „Eingang“ und eine pro Mappentyp; konfigurierbare Sichten folgen.
- **Eingang:** Mappen, die nicht zur aktuellen Definition passen, beim Ersteller; ohne bekannten Ersteller beim Administrator. Später kommen Aufgaben dazu.
- **Indexwerte** (erstellt/geändert am/von) sind feste Spalten, keine Felder eines Mappentyps.

- **Seitenweise statt alles:** Die Oberfläche lädt keine vollständige Mappenliste mehr. Eine Sicht holt je 100 Mappen, nach Titel sortiert, und beim Scrollen die nächsten; Suche, Zähler und Eingang rechnet der Server. Verweise wählt man über eine Suche statt einer Klappliste.
- **Trefferliste** als Liste von Spaltenschlüsseln am Mappentyp (`mappentypen.trefferliste`); Systemspalten beginnen mit `_` und kollidieren so nie mit Feldschlüsseln. Kompakt oder Tabelle entscheidet die Breite der Liste selbst (ResizeObserver), nicht die Bildschirmbreite.
- **Sortieren auf dem Server** (wegen des seitenweisen Ladens), leere Werte immer zuletzt; nicht nach Verweisen und langen Texten. Gespeichert je Benutzer und Sicht in `benutzer_einstellungen`.
- **Passung gespeichert** (`mappen.passt`, `mappen.problem`): Ob eine Mappe zur Definition passt, prüft der Server beim Ändern des Typs für alle Mappen dieses Typs (eindeutige Werte im Arbeitsspeicher statt je Mappe in der Datenbank) und nach dem Speichern für bisher unpassende Mappen desselben Typs.
- **Lange Arbeiten im Hintergrund:** Demo-Daten laufen als Auftrag mit Fortschritt, damit ein Reverse-Proxy nicht nach seiner Wartezeit abbricht.

## Register und Dokumente

- **Drei Registerarten** am Mappentyp: Feld-, Dokumenten- und Verknüpfungsregister. Jedes Feld liegt auf genau einem Feldregister; nicht zugeordnete Felder landen automatisch auf dem ersten.
- **Register haben feste Schlüssel**, damit Dokumente ihr Register behalten, wenn es umbenannt wird. Ein Dokumentenregister mit Dokumenten lässt sich nicht entfernen.
- **Verknüpfungsregister** zeigen alle Rückverweise oder nur gewählte Quellen (Typ + Referenzfeld).
- **Titel-Vorlage** mit Platzhaltern `{feld}`; Server und Oberfläche nutzen dieselbe Funktion (`titelAus`).
- **Titel gespeichert** (Spalte `mappen.titel`), damit der Server sortieren und seitenweise laden kann. Neu berechnet beim Speichern einer Mappe, beim Ändern des Typs und – weitergereicht über die Verweise – bei Mappen, deren Titel einen geänderten Titel enthält (bei Verweisen im Kreis höchstens sechs Runden). Fehlende Titel berechnet der Server beim Start.
- **Indexwerte im Titel:** `{angelegt}`, `{geaendert}` als Datum in der Zeitzone Europe/Berlin; diese Schlüssel sind für Felder gesperrt.
- **Dateien** unveränderlich unter ihrem SHA-256 im Dateiordner, gleicher Inhalt nur einmal; Hinweis beim Hochladen, wenn der Inhalt schon in einer anderen Mappe liegt.
- **Anzeige im Browser nur für PDF und Bilder**, erkannt am Inhalt (nicht an Endung oder angegebenem Typ). Alles andere wird als Download ausgeliefert, mit `nosniff` und einer Sandbox-CSP – eine hochgeladene HTML-Datei kann so keinen Code in der Sitzung ausführen.
- **Löschen einer Mappe** löscht ihre Dokumente nach Rückfrage mit; die Datei verschwindet, sobald kein Dokument mehr auf sie zeigt.

## Designs

- **Farben werden abgeleitet, nicht einzeln gepflegt:** Aus Grundlage, Primär- und Sekundärfarbe entstehen alle CSS-Variablen (`design.ts`). Farben werden bei Bedarf aufgehellt oder abgedunkelt, bis sie auf dem Hintergrund lesbar sind (WCAG 4,5:1, beim Kontrast-Design 7:1).
- **Design je Konto, Schriftgröße je Gerät** (`benutzer_einstellungen` bzw. localStorage). Schriftgrößen skalieren über `--skala`.
- **Eigenes CSS** nur durch Administratoren, ohne `<style>`-Tags; Rettungsweg `?design=standard`.

## Schnittstelle

- **Eigener Namensraum `/api/v1`** mit festen Adressen; intern nutzt er dieselben Funktionen wie die Oberfläche. API-Schlüssel gelten nur dort, nicht an den internen Adressen der Oberfläche.
- **Schlüssel** `dms_…` (240 Bit Zufall), gespeichert nur als SHA-256; sichtbar bleibt der Anfang. Rechte: höchstens die des Benutzers, dazu „nur lesen“ (nur GET). Seit 0.26 (#128) bekommen Administratoren keine Schlüssel mehr: Über die API arbeitet ein normaler Benutzer.
- **OpenAPI aus derselben Tabelle** wie die Routen (`api-v1.ts`), daher immer passend zur installierten Version; die lesbare Seite rendert sie selbst, ohne fremde Bibliothek.

## Betrieb und Fehlersuche

- **Eigenes Protokoll** (`server/src/protokoll.ts`) statt Fastify/pino direkt: jede Meldung mit Modul, Benutzer und Anfrage-Kennung (über AsyncLocalStorage), lesbar in den Container-Logs, zusätzlich ein Ringpuffer (24 h, 10.000 Einträge) für die Werkbank. Fastify schreibt über einen pino-kompatiblen Adapter hinein.
- **Live-Ansicht per Abfrage alle zwei Sekunden** statt Server-Sent Events: funktioniert hinter jedem Reverse-Proxy ohne Sonderkonfiguration (nginx puffert SSE sonst).
- **Messung je Datenbankzugriff:** Jede Methode der Repos wird über einen Proxy gezählt und gestoppt (ein Zugriff kann mehrere SQL-Anweisungen umfassen). Die Summe je Anfrage geht im Header `Server-Timing` an die Oberfläche; die übrigen Schritte misst der Browser (Resource Timing). „Netzwerk“ ist dabei eine Näherung.
- **Langläufer** stehen in der Datenbank (Tabelle `langlaeufer`), Schwelle und Aufbewahrung in `einstellungen`.
- **Debug-Modus** nur im Arbeitsspeicher und höchstens eine Stunde; nach einem Neustart ist er aus.
- **Als anderer Benutzer anmelden:** eigene Sitzung des Benutzers mit Verweis auf die Vertretung; der Benutzer sieht beim nächsten Mal, wer wann als er agiert hat. Ein manipulationssicheres Protokoll ist bewusst nicht Teil davon (#16).

## Benutzer und Rollen als Mappen (#26, #27)

- **Systemmappentypen** *Benutzer* und *Rolle* (Spalte `mappentypen.system`): erweiterbar, nie löschbar. Der Server legt sie beim Start an, falls sie fehlen; heißt schon ein eigener Typ so, bekommt der Systemtyp den Zusatz „(System)“.
- **Systemfelder** (`Feld.system`) sind fest: Schlüssel, Datentyp und Eigenschaften gibt der Server vor, nur Bezeichnung, Hilfetext und Register darf der Administrator ändern.
- **Das Konto ist führend, die Mappe spiegelt es.** Die Mappe eines Benutzers hat dieselbe Id wie sein Konto. Konten melden jede Änderung an Name, E-Mail, Rolle und „aktiv“ an die Mappe; beim Start werden alle Benutzer abgeglichen (auch nach einem Update).
- **Sicherheit:** Die Systemfelder einer Benutzer-Mappe sind in der Ablage nur lesbar – der Server lehnt Änderungen ab. Sonst könnte ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto über „Passwort vergessen“ übernehmen, oder sich selbst eine Systemrolle geben.
- **Systemrollen** *Administrator* und *Mitglied* sind Rollen-Mappen mit fester Kennung (`mappen.system_kennung`, z. B. `rolle:admin`). Wer sie hat, folgt der Rolle des Kontos; sie lassen sich nicht löschen und nicht umbenennen. So kann das spätere Berechtigungskonzept Rechte an Rollen-Mappen hängen, ohne die bestehende Anmeldung umzubauen.
- **Zuordnung Benutzer ↔ Rolle** ist das Systemfeld `rollen` der Benutzer-Mappe (Mehrfachverweis). Die Rolle zeigt ihre Benutzer als Rückverweise. Gesetzt wird es nur über die Benutzerverwaltung; ungültige Rollen werden geprüft, bevor sich etwas ändert.
- **Rollen sind vorerst fachlich** und von jedem Benutzer in der Ablage anlegbar; Einschränkungen kommen mit der Berechtigungsverwaltung. Keine verschachtelten Rollen.
- **Rolle löschen:** erlaubt, auch wenn Benutzer sie haben – deren Zuordnung fällt weg. Verweise aus normalen Feldern (z. B. „verantwortliche Rolle“) verhindern das Löschen wie bei jeder Mappe.
- **Deaktivieren statt löschen:** Wer sich schon angemeldet hat, wird deaktiviert; seine Mappe heißt dann „… (ehemalig)“ und Verweise bleiben gültig. Löschen geht nur für nie angenommene Einladungen.
- **Neue Mappen / Löschen erlauben** als Eigenschaft jedes Mappentyps (`erstellen_erlaubt`, `loeschen_erlaubt`); die Oberfläche blendet die Knöpfe aus, der Server prüft es. Beim Typ *Benutzer* ist beides fest aus.
- Demo-Daten und Beispiele lassen die Systemtypen aus.

## Handbuch und Releases (#25)

- **Zwei getrennte Handbücher** (MkDocs Material, je eine eigene Seite mit eigener Suche): Benutzer sollen sich auf ihre Möglichkeiten konzentrieren und nicht in Technik suchen müssen. Sie verweisen aufeinander, statt Inhalte doppelt zu pflegen. Technik und Entscheidungen gehören zum Administratorhandbuch.
- **Deutsche Suche** über das Suchplugin von MkDocs (`lang: de`, mit Wortstammbildung); läuft im Browser, ohne Server.
- **Screenshots werden erzeugt, nicht gepflegt:** Der Workflow *Handbuch* startet das DMS mit leerer Datenbank, legt Beispiele und Demo-Daten an und nimmt die Seiten mit Playwright auf (`docs/handbuch/screenshots/aufnehmen.mjs`). So passen die Bilder immer zur Version auf `main`. Die Bilder liegen nicht im Repository.
- **GitHub Pages** über GitHub Actions; Pull Requests bauen nur und legen die Screenshots als Artefakt ab.
- **Changelog = GitHub Releases.** Der Text kommt aus `docs/releases/<tag>.md` oder, falls es die Datei nicht gibt, aus den Commit-Überschriften seit dem vorigen Tag.
- **Release bei neuer Versionsnummer (#34).** Steht auf `main` eine Version in `package.json`, zu der es noch keinen Tag gibt, legt „Prüfen und Image bauen“ nach bestandenen Prüfungen das Image mit Versionsnummer und danach Tag und Release an (`release.yml` als wiederverwendbarer Workflow). Nicht bei jedem Commit: So bleibt die Versionsnummer aussagekräftig, und mehrere Wünsche lassen sich bündeln.
- **Image-Tag im selben Lauf**, weil ein mit dem Workflow-Token angelegter Tag keine weiteren Workflows startet; so braucht es kein zusätzliches Token. Von Hand gepushte Tags und von Hand veröffentlichte Releases funktionieren weiter.
- **Hilfe-Link** im Benutzermenü auf das Benutzerhandbuch, für Administratoren zusätzlich auf das Administratorhandbuch.

## E-Mail und Adresse in der Werkbank (#37)

- **Keine Umgebungsvariablen mehr** für E-Mail-Versand und Adresse: gepflegt in der Werkbank, gespeichert in `einstellungen` (`mail`, `adresse`), wirksam ohne Neustart – Konten holen sich den Mailer und die Adresse bei jeder Verwendung (`Betrieb` in `server/src/betrieb.ts`).
- **Einmalige Übernahme** der früheren Variablen `SMTP_*` und `APP_URL` beim ersten Start, nur solange nichts gespeichert ist; danach ignoriert, mit Hinweis im Protokoll. So fällt der Versand beim Update nicht aus.
- **Ohne gepflegte Adresse** gilt die Adresse der aktuellen Anfrage (`req.protocol` und `req.host`, hinter einem Proxy über `TRUST_PROXY`). Sie steckt im Anfragekontext, damit Konten sie ohne zusätzlichen Parameter finden.
- **Passwort verschlüsselt** (seit #39), nie an die Oberfläche zurück; leeres Feld behält es.
- **Testen mit ungespeicherten Werten:** Prüfen und Testmail nehmen die Werte aus dem Formular, damit man vor dem Speichern sieht, ob es geht.

## Sichten (#38, #40, #41)

- **Sicht = gespeicherte Abfrage**: Mappentypen und Bedingungen, die alle zusammen gelten (UND). Bedienbare Filter über der Liste sind bewusst ein späterer Schritt.
- **Baum über `eltern_id`**; eine Sicht zeigt ihre eigenen Treffer und die aller Nachkommen. Technisch ist jede Sicht mit eigenen Typen eine **Klausel** (Typen + Filter); eine Sicht samt Untersichten ist das ODER ihrer Klauseln – so gibt es keine Doppelten, und Zähler, Suche, Sortierung und seitenweises Laden funktionieren unverändert auf dem Server.
- **Dynamische Werte werden je Abfrage aufgelöst** (heute in Europe/Berlin, aktueller Benutzer, seine Rollen aus der Benutzer-Mappe). Das Repo bekommt nur feste Werte (`Filter`); `shared/src/sichten.ts` übersetzt Bedingungen → Filter, `repo-pg.ts` Filter → SQL. Dieselben Testfälle laufen im Arbeitsspeicher und gegen PostgreSQL.
- **Ungültige Bedingungen werden ignoriert, nicht ausgewertet**: Ein entferntes Feld leert die Sicht nicht, die Werkbank markiert es.
- **Umzug ohne Bruch**: Die bisherigen Sichten je Mappentyp wurden zu verwalteten Sichten mit der Id des Typs (Migration 013). Lesezeichen `/ablage/<id>` und gemerkte Sortierungen `sortierung:<id>` bleiben gültig. Eine Typ-Id ohne Sicht zeigt weiter alle Mappen des Typs, damit Links auf Mappen nie ins Leere gehen.
- **`typ:<id>`** liefert alle Mappen eines Typs ohne Bedingungen – für die Auswahl von Verweisen, die Titel-Vorschau und die API. Sonst würde eine Sicht mit Bedingungen, die zufällig die Id des Typs trägt, die Auswahl einschränken.
- **Benutzer und Rolle** bekommen bei neuen Installationen ihre Sichten am Ende der ersten Ebene.

## Verschlüsselte Passwörter (#39, #46)

- **Schlüssel als Datei, nie in der Datenbank**: 32 Byte, erzeugt auf Knopfdruck in der Werkbank (`/data/geheim/dms.schluessel`, Rechte 0600, eigenes Volume). In der Datenbank steht nur der Fingerabdruck – so erkennt das DMS einen fehlenden oder fremden Schlüssel und zeigt, welche Werte neu einzugeben sind. Eine Datenbanksicherung allein verrät damit keine Passwörter.
- **AES-256-GCM je Wert** mit eigener Zufallszahl, gespeichert als `dms1$<nonce>:<geheimtext>`; das Präfix erlaubt später ein anderes Verfahren und den Schlüsselwechsel (#47).
- **Kein Geheimtext verlässt den Server**: Jede Antwort läuft durch eine Maske, die verschlüsselte Werte durch `{gesetzt, lesbar}` ersetzt – unabhängig davon, welche Route sie liefert. Klartext gibt es nur einzeln (Auge, protokolliert) oder über die API mit eigenem Recht.
- Ohne Schlüssel lässt sich kein Passwort speichern. Ein Klartext-Passwort aus älteren Ständen (SMTP) funktioniert weiter und wird verschlüsselt, sobald es einen Schlüssel gibt.

## Papierkorb (#43)

- **Eigene Tabelle statt Löschmarke**: Gelöschte Mappen ziehen samt Verweisen und Dokumenten als JSON nach `papierkorb`. Alle Abfragen auf `mappen` bleiben unverändert; eindeutige Werte werden frei; der Papierkorb taucht nirgends sonst auf.
- **Wiederherstellen** legt die Zeilen wieder an. Verweise auf Mappen, die es nicht mehr gibt, entfallen; passt die Mappe danach nicht (z. B. eindeutiger Wert vergeben), zeigt der Eingang sie – nur sie, nicht die andere.
- **Dateien bleiben**, bis der Papierkorb geleert wird; erst dann prüft das DMS, ob noch ein Dokument (auch im Papierkorb) an der Datei hängt.
- **Benutzer-Einladungen** im Papierkorb sind deaktiviert; endgültig gelöscht wird das Konto erst beim Leeren. 0 Tage Aufbewahrung schaltet den Papierkorb aus.

## Texterkennung (#45)

- **Im eigenen Prozess, Warteschlange in der Datenbank** (`dokumente.ocr_stand`): kein zusätzlicher Container; nach einem Neustart geht es weiter. Gleichzeitige Aufträge sind einstellbar (Standard 1, für kleine NAS).
- **Textebene zuerst**: `pdftotext` je Seite; nur Seiten mit kaum Text gehen durch `pdftoppm` und `tesseract` (deu+eng). So bleibt die Texterkennung schnell, wo sie nicht nötig ist.
- **Gleicher Inhalt, gleicher Text**: Dateien sind über ihren Prüfwert bekannt; ein schon erkannter Text wird übernommen.
- **Deutsche Volltextsuche von PostgreSQL** (`to_tsvector('german', …)`, GIN-Index, `websearch_to_tsquery`): findet Wortformen; die Fundstelle kommt aus `ts_headline` mit Steuerzeichen als Markierung – nie als HTML.
- Office-Dokumente und externe Dienste kommen später.

## Image je Architektur nativ bauen (#88)

- **Kein QEMU mehr:** Das arm64-Image entstand bisher emuliert auf Intel-Rechnern; die Emulation stürzte beim `npm install` mehrfach mit Fehler 132 ab (0.8.1, 0.13.0), und damit blieben Image, Tag und Release aus. Jetzt baut jede Architektur auf einem passenden Rechner von GitHub (`ubuntu-24.04` bzw. `ubuntu-24.04-arm`, für öffentliche Repos kostenlos).
- **Hochladen nur unter dem Prüfwert, dann zusammenführen:** Jeder Teil wird ohne Tag hochgeladen; `image-zusammen` erzeugt daraus mit `docker buildx imagetools create` das gemeinsame Image mit allen Tags und prüft, dass beide Architekturen enthalten sind. Das Release entsteht erst danach.
- **Pull Requests** bauen beide Architekturen ebenfalls nativ zur Probe (ohne Veröffentlichung).

## Berechtigungen (#123–#127, #137)

- **Regeln nur am Mappentyp**, mit Grundeinstellung (erteilt/entzogen) und geordneten Regeln „wenn … dann ✓/✗/– je Recht“ mit Stopp – wie eine Firewall. Keine Rechte an einzelnen Mappen: Was eine Mappe besonders macht, steht in ihren Feldern, und darauf zielen die Bedingungen.
- **CRUDP**: Anlegen, Lesen, Bearbeiten (Felder und Dokumente), Löschen, Passwörter sehen. Notizen, Aufgaben und E-Mail brauchen nur Lesen. Ohne Lesen wirkt nichts außer Anlegen.
- **Ein Ausdruck, zwei Auswertungen**: Bedingungen über den Benutzer sind beim Anmelden schon entschieden; was bleibt, sind Filter über die Mappe – im Arbeitsspeicher für eine einzelne Mappe und als SQL für Listen, Suche und Zähler. So stimmen Liste und Mappe immer überein, und Seiten bleiben schnell.
- **Administratoren** unterliegen keinen Regeln, arbeiten aber auch nicht in der Ablage (#128). Die Haken am Mappentyp bleiben Obergrenze für alle.
- **Benutzerauswahl nur unter sichtbaren Benutzern** (#137): So lässt sich ein Programm über die API sauber auf seinen Ausschnitt begrenzen.
- **Feldrechte** (einzelne Felder ausblenden) kommen bei Bedarf später.

## Bewusst noch nicht drin

Feldrechte, Fristen, Schlüsselwechsel (#47), Backup-Funktion in der Anwendung (#48), Texterkennung für Office-Dokumente, Zwei-Faktor-Anmeldung.
