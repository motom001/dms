# Texte und Sprachen { #texte }

## Texte und Sprachdateien { #texte-und-sprachdateien }

Texte für Benutzer stehen nicht im Code, sondern in **Sprachdateien** (#473, #727, Teil von #357). Eingebaut sind Deutsch (Ausgangssprache) und Englisch (seit #729); Ablago duzt überall, und jede Sprache nimmt die vertraute Anrede (Englisch schlicht „you“). Seit #727 sind alle Bereiche umgestellt: Oberfläche, Fehlermeldungen und Hinweise des Servers, E-Mails, Historie und Notfallblatt.

**Regel:** Ein Text, den Menschen lesen, gehört in die Sprachdatei – nie als Wort im Code. Die CI lässt neue feste Texte in der Oberfläche nicht durch (siehe unten).

**Umgekehrt (#1264):** Technische Werte – Content-Security-Policy, Permissions-Policy, Cache-Control, Content-Disposition, SQL, Kopf der Sicherungsdatei – stehen als Konstanten im Code, nie in einer Sprachdatei. `t()` richtet sich nach der Sprache der Anfrage; eine Übersetzung würde sie sonst still nur für diese Sprache ändern. `server/test/sprachdateien-technik.test.ts` prüft das.

```
shared/src/sprachen/de/<bereich>.json         Ausgangssprache Deutsch (du), immer vollständig
shared/src/sprachen/de/<bereich>/*.json       große Bereiche geteilt (werkbank, meldungen; #1279), index.ts führt zusammen
shared/src/sprachen/de-formal/dritte.json     Texte für Dritte mit „Sie“ (siehe unten)
shared/src/sprachen/en/<bereich>.json         Englisch, britische Schreibweise, vollständig
shared/src/englisch.ts                        lädt alle englischen Dateien (eigener Chunk in der Oberfläche)
shared/src/sprachwahl.ts                      Einstellung „sprachen“, wirksame Sprache, Kopf X-Sprache
shared/src/sprache.ts                         uebersetzer(), Platzhalter, Mehrzahl, gebietsschema()
web/src/sprache.ts                            t() und tn() mit den Bereichen der Oberfläche
server/src/sprache/sprache.ts                         t() mit den Bereichen des Servers
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

**Geteilte Bereiche** (#1279): `werkbank` und `meldungen` sind für eine Datei zu groß. Sie stehen je Sprache in einem Ordner mit Teildateien, `index.ts` im Ordner führt sie zum Bereich zusammen. Die Schlüssel im Code bleiben gleich: `t('werkbank.pakete.dazu.titel')`.

| Teildatei | enthält |
|---|---|
| `werkbank/rahmen.json`, `uebersicht.json` | Leiste, Namen der Bereiche und Gruppen, Vorlagen, Kopf, Listensuche; die Übersicht |
| `werkbank/pakete.json`, `paketerstellen.json`, `sichten.json`, `ablage.json` | Gruppe „Ablage aufbauen“ der Leiste |
| `werkbank/benutzer.json`, `verschluesselung.json`, `stempel.json` | Gruppe „Benutzer und Sicherheit“ (mit Notfallblatt und Notfallkontakten, Aufbewahrung) |
| `werkbank/datenschutz.json`, `postfaecher.json`, `post.json`, `sicherung.json`, `einstellungen.json`, `wartung.json` | die gleichnamigen Gruppen der Leiste (`postfaecher.json` mit den Mail-Anbietern) |
| `meldungen/<datei>.json` | je Fachordner des Servers: `dienst`, `pakete`, `paketerstellung`, `sicherung`, `datenschutz`, `anmeldung`, `post`, `dateien` (mit `pdf/`), `http`, `start` (Start, Läufer, Prozesse), `system` (mit Datenbank und Einrichtung), `einstellungen`, `erkennung`, `ablage` (Mappen, WebDAV, Automatisierung) |

**Wohin ein neuer Schlüssel gehört:**

- Gibt es seine **Gruppe** schon – den ersten Teil des Schlüssels, `pakete` in `pakete.dazu.titel` –, kommt er in die Datei, in der die Gruppe steht. Jede Gruppe steht ganz in einer Datei.
- Eine **neue Gruppe** kommt in die Datei ihres Teils der Werkbank (eine neue Seite unter „Post und Eingänge“ nach `werkbank/post.json`) bzw. ihres Fachordners im Server (`server/src/post/` nach `meldungen/post.json`).
- Eine **neue Teildatei** lohnt erst ab etwa 50 Schlüsseln. Sie bekommt in jeder Sprache denselben Namen und eine Zeile in jeder `index.ts`.
- In jeder Sprache dieselbe Datei: Steht ein Schlüssel in `de/werkbank/post.json`, steht er auch in `en/werkbank/post.json`.

**Text anlegen**

1. Passenden Bereich wählen (Tabelle oben). Ein neuer Bereich wird in `web/src/sprache.ts` bzw. `server/src/sprache/sprache.ts` eingetragen; Dateiname = Bereich, klein, ohne Punkt.
2. Schlüssel in die JSON-Datei schreiben (bei geteilten Bereichen in die Teildatei seiner Gruppe, siehe oben) – flach, Teile mit Punkt oder Bindestrich, klein beginnend: `"vergessen.knopf": "Link anfordern"`.
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

**Prüfungen in der CI** (laufen mit `npm test`, einzeln mit `npm run test:datei --prefix shared -- test/<datei>` bzw. `-w web`, siehe [Loslegen](loslegen.md)):

- `shared/test/sprachdateien.test.ts`: Schlüssel, die der Code abruft, aber nicht gibt; Schlüssel, die niemand benutzt; Sprachen, die Schlüssel auslassen oder zusätzliche haben; Platzhalter, die zwischen den Sprachen abweichen; **Platzhalter, die ein Aufruf nicht liefert** (`t('…', { nam })` für `{name}`); Mehrzahl ohne `_other`; leere Texte.
- `shared/test/sprachdateien-fest.test.ts`: **feste Texte in der Oberfläche** – Text zwischen Tags, in sichtbaren Attributen (`title`, `aria-label`, `placeholder`, `titel` …) und als Wert in geschweiften Klammern. Was in jeder Sprache gleich bleibt (Produktnamen, Befehle in `<code>`, Beispieladressen), ist erlaubt; weitere Ausnahmen stehen mit Grund in `AUSNAHMEN` in der Testdatei.
- `shared/test/sprachdateien-teile.test.ts` (#1279): geteilte Bereiche – kein Schlüssel in zwei Teildateien, jede Gruppe in einer Datei, jede Sprache teilt wie Deutsch, und der Code bekommt genau die Texte der Dateien (eine Teildatei, die in `index.ts` fehlt, fällt auf). Die Meldungen von `sprachdateien.test.ts` nennen bei geteilten Bereichen den Bereich (`de/werkbank.json`); die Teildatei findet man über die Gruppe.
- `web/test/symbole.test.ts`: keine bunten Emoji und keine Textzeichen als Symbol – auch in den Sprachdateien.

**Bewusst noch im Code** (#727): Protokollzeilen (`log.*`, Werkbank → Protokoll) bleiben Deutsch, damit Fehlermeldungen vergleichbar und durchsuchbar sind; die Beschreibung der Schnittstelle (OpenAPI in `server/src/http/api-v1/`) ist Entwicklerdoku wie dieses Handbuch; Lizenztexte (seit #1278 als Dateien in `server/lizenzen/`); Beispieldaten und Demo-Inhalte; die Titel der Handbuch-Abschnitte in `shared/src/hilfe.ts` (sie folgen den Überschriften im Handbuch und kommen mit dessen Übersetzung, #730); die festen Werte der Auswahlfelder von Post (`POST_STAND`, `POST_KANAL`, `POST_RICHTUNG` in `shared/src/model/systemtypen.ts`) – sie stehen so in jeder Mappe; gezeigt wird ihre Beschriftung (siehe unten). Namen, Felder und Hilfetexte der Systemmappentypen kommen seit #728 aus `gemeinsam.json` (`model.systemtyp.*`, `model.systemfeld.*`, `model.systemhilfe.*`).

**Beschriftungen je Sprache** (#728, `shared/src/beschriftung.ts`): Was Administratoren selbst anlegen – Namen von Mappentypen, Feldern, Registern, Trefferlisten und Ansichten, Hilfetexte und die Optionen eines Auswahlfelds –, steht nicht in Sprachdateien, sondern am Eintrag unter `beschriftungen`: Sprache → Texte, z. B. `{ en: { label: 'Kind', optionen: { Strom: 'Electricity' } } }`. Der Ausgangstext (`label`, `name` …) ist Deutsch; fehlt eine Beschriftung, gilt er. Eine Option ist ihr **fester Wert** (`optionen`), und genau der steht in der Mappe; ihre Beschriftung kommt aus `beschriftungen.<sprache>.optionen`, sonst aus `beschriftungen.de.optionen`, sonst ist es der Wert selbst. Daraus folgt:

- **Vergleichen immer mit dem festen Wert** – Bedingungen, Automatisierungen, API, Vollexport (CSV, JSON), Prüfung der Mappe. Eingaben, die eine Beschriftung sein können (Direktlink, erweiterte Suche, Antwort einer Erkennungs-Engine), gehen über `wertZuOption()`. Die einfache Suche findet einen Wert auch über seine Beschriftung (`optionsGruppen()` wie gleichbedeutende Wörter).
- **Zeigen immer die Beschriftung:** `formatiere()` gibt bei Auswahlfeldern die Beschriftung zurück (Trefferliste, Titel, Export als Excel und PDF, Historie); Namen über `feldLabel()`, `feldHilfe()`, `typName()`, `registerName()`, `listenName()`, `sichtName()`, Optionen über `optionText()`.
- **Speichern:** Der Server bereinigt `beschriftungen` (gültige Sprachkennungen, nur bekannte Teile, Optionen nur für vorhandene Werte). Fehlt die Angabe beim Speichern ganz, bleiben die bisherigen – ein älteres Programm über die API löscht so nichts; `null` oder `{}` entfernt sie. Mappentypen und Ansichten speichern Name und Beschreibung je Sprache in der Spalte `beschriftungen` (Migration 080), Felder, Register und Trefferlisten im JSON des Mappentyps.
- **Erlaubte Sprachen** liefert `erlaubteSprachen()` aus der Einstellung `sprachen` (Werkbank → Sprachen, #729); der Server setzt sie mit `setzeErlaubteSprachen()` beim Start und jede Minute neu. Beschriftungen anderer Sprachen (etwa aus einem Paket) bleiben gespeichert.

**Übersetzen:** Eine neue Sprache bekommt einen Ordner `shared/src/sprachen/<sprache>/` mit denselben Dateien und Schlüsseln wie `de`, z. B. `en/ablage.json`. Platzhalter bleiben gleich (die CI vergleicht sie), Mehrzahlformen richten sich nach der Sprache. Wer einen deutschen Text ändert oder anlegt, pflegt den englischen mit – die CI meldet fehlende Schlüssel in `en`. Weitere Sprachen kommen als [Sprachpaket](pakete.md#sprachpakete) (#731); ihre Texte meldet `server/src/sprache/sprachpakete.ts` über `registriereSprache()` an, die Oberfläche holt sie mit `GET /api/sprache/texte/<sprache>`.

**Sprache wählen** (#729):

- **Rückfall:** `t()` sucht in der gewählten Sprache, dann in Englisch, dann in Deutsch; ein leerer Text zählt als fehlend. So bleibt nie eine Stelle leer.
- **Welche Sprache gilt:** die der angemeldeten Person (`benutzer.sprache`, Migration 081), wenn erlaubt; sonst die, die die Oberfläche im Kopf `X-Sprache` mitschickt (zuletzt benutzte bzw. die des Browsers); sonst die der Installation (`sprachen.standard`). `GET /api/sprache` nennt sie, die Oberfläche lädt sie vor allen anderen Modulen (`web/src/main.tsx`) und lädt nach einem Wechsel neu.
- **Server:** Jede Anfrage läuft in `mitSprache()` (AsyncLocalStorage in `server/src/sprache/sprache.ts`); Fehlermeldungen kommen so in der Sprache der Person. E-Mails an eine Person baut `mitSpracheVon(person, …)` in ihrer Sprache; Mails an alle Administratoren (`anVerwaltende`) übergeben Betreff und Text als Funktion (`MailText`), damit jeder Empfänger seine Sprache bekommt.
- **Protokollzeilen** gehen mit `tDe()` – immer Deutsch, unabhängig von der Anfrage.
- **Texte für Dritte** (`textDritte`, Auskunft, Abruf-Link) und Werte, die der Server einmal für alle bildet (Konstanten auf Modulebene, Titel und Namen der Systemmappentypen, Texte der Verwaltungspunkte), stehen in der Sprache der Installation – beim Start bzw. beim Anlegen berechnet. Systemmappentypen und Systemfelder tragen zusätzlich `beschriftungen` aus den Sprachdateien (`systemBeschriftung()`), damit die Oberfläche sie in jeder Sprache zeigt.
- **Maschinell übersetzte Sprachen** (aus [Sprachpaketen](pakete.md#sprachpakete), #731) zeigen in Mein Konto den Hinweis „Maschinell übersetzt – Verbesserungen willkommen“; der Link führt zu [Eine Sprache beitragen](pakete.md#eine-sprache-beitragen).
- **Gebietsschema:** Deutsch `de-DE`, Englisch `en-GB`; ein Sprachpaket nennt seins im Manifest (`sprache.gebietsschema`, z. B. `fr-FR`), `gebietsschema()` nimmt es dann für Datum, Zahlen und Beträge.

**Bibliothek:** eine eigene, kleine Umsetzung in `shared/src/sprache.ts` statt i18next – warum, steht unter [Entscheidungen](entscheidungen/eigene-sprachbibliothek.md).

## Unterlagen für Dritte: Anrede du oder Sie { #unterlagen-fur-dritte }

Die Oberfläche duzt immer. Texte, die an Personen **außerhalb** von Ablago gehen, folgen dagegen der Einstellung **Anrede in Unterlagen für Dritte** (#474, Werkbank → Einstellungen → Eigene Organisation → Datenschutz-Auskünfte, `Datenschutz.anrede`, Vorgabe `du`). Alle diese Texte stehen im Bereich `dritte` der [Sprachdateien](#texte-und-sprachdateien): die du-Fassung in `shared/src/sprachen/de/dritte.json`, die Sie-Fassung in `shared/src/sprachen/de-formal/dritte.json`, je mit denselben Schlüsseln und Platzhaltern. Abgerufen werden sie mit `textDritte(anrede, schluessel, werte)` aus `shared/src/anrede.ts`. Die Prüfung der Sprachdateien vergleicht beide Fassungen, ein Test prüft zusätzlich, dass die Sie-Fassung kein „du“ enthält.

Neue Texte für Dritte kommen als Schlüssel in beide `dritte.json` – keine `anrede === 'sie' ? … : …` im Code – und in diese Liste:

| Ausgabe | Code | Schlüssel |
| --- | --- | --- |
| Auskunft: Deckblatt.pdf, Uebersicht.html, LIESMICH.md (#396) | `server/src/datenschutz/auskunft.ts` | `auskunft.*` (Rechte-Vorschlag: `rechteStandard`) |
| E-Mail mit der Auskunft als ZIP, E-Mail mit dem Abruf-Link (#455) | `auskunftMail` in `shared/src/auskunft.ts` | `mail.*` |
| Abrufseite `/abruf` und ihre Meldungen (#455) | `web/src/abruf.tsx`, `GET /api/abruf/anrede`, `/api/abruf` in `datenschutz/datenschutz.routen.ts` | `abruf.*` |
| Notfallzugang `/notfall` (#815) | `web/src/notfall.tsx`, `/api/notfall*` in `anmeldung/anmeldung.routen.ts`, `server/src/notfall/notfallcode.ts` | `konten.notfall.*` |
| E-Mails mit Mappen und Dokumenten (#58, #151) | – | keine: Text schreibt der Benutzer, vorgegeben ist nur der Betreff ohne Anrede |
