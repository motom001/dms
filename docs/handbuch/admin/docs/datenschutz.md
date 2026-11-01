# Datenschutz im DMS

Wer Daten von Kunden, Mietern oder Kontakten verwaltet, muss auf Anfrage sagen können, was er über sie gespeichert hat – und das in einer Form, die die Person mitnehmen kann. Unter **Werkbank → Datenschutz** erledigt das DMS das in wenigen Minuten.

--8<-- "ausgeblendet-organisation.md"

!!! note "Unterstützt – ersetzt nichts"
    Das DMS stellt die Daten zusammen und hält fest, dass du Auskunft erteilt hast. Ob und was du herausgeben musst, entscheidest du – im Zweifel mit deinem Datenschutzbeauftragten oder einer Rechtsberatung. Weitere Themen (Sperr- und Löschkonzept, Verzeichnis der Verarbeitungstätigkeiten) folgen auf dieser Seite.

![Werkbank → Datenschutz](bilder/werkbank-datenschutz.png)

## Einstellungen

Einmal einrichten, unten auf der Seite unter **Einstellungen**:

- **Verantwortlicher:** Name und Anschrift – steht als Absender auf dem Deckblatt.
- **Empfänger:** an wen du Daten weitergibst (z. B. Steuerberatung, Hausmeisterdienst). Das ist der Vorschlag für jede Auskunft; du kannst ihn je Auskunft ändern.
- **Rechte der Person:** der Text auf dem Deckblatt (Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde). Ein Vorschlag steht schon drin. Wie überall im DMS spricht auch das Deckblatt die Person mit „du“ an – du kannst den Text hier anpassen.
- **Mappentypen:** Hake an, welche Mappentypen **eine Person betreffen** – z. B. Mieter, Kunde, Vertragspartner, Kontakt. Nur Mappen dieser Typen lassen sich als Betroffene wählen. Je Mappentyp trägst du den **Zweck** ein (z. B. „Durchführung des Mietverhältnisses“); er steht auf dem Deckblatt bei jeder Art von Daten, die herausgeht.

Die **Speicherdauer** auf dem Deckblatt kommt aus dem [Archivmodus](archiv.md): Hat ein Mappentyp eine Aufbewahrungsfrist, steht sie dort mit dem spätesten „aufbewahren bis“; sonst „solange für den Zweck nötig“.

## Auskunft nach Art. 15 DSGVO

1. **Person wählen:** Art (einer der markierten Mappentypen) und Name suchen – oder direkt an der Mappe unter **Aktionen → Auskunft erstellen …** (nur für Administratoren und nur bei Mappentypen, die eine Person betreffen).
2. **Frist:** Trage ein, wann die Anfrage eingegangen ist, und lege mit **Frist als Aufgabe anlegen** eine Aufgabe für dich an – „Auskunft nach Art. 15 DSGVO an … bis …“, fällig einen Monat nach Eingang (Art. 12 Abs. 3 DSGVO). Sie steht wie jede Aufgabe unter „Zu erledigen“.
3. **Sammeln:** Das DMS folgt den Verweisen von der Mappe der Person aus – **Mappen, die darauf verweisen** (Mietvertrag → Nebenkostenabrechnungen, Post) und **Mappen, auf die sie verweist** (Wohnung). Die **Tiefe** stellst du ein (Vorgabe 2: Vertrag und dessen Rechnungen). Jede Mappe geht nur in der Richtung weiter, über die sie erreicht wurde: Von der Wohnung aus sammelt das DMS also nicht die anderen Mieter. Kreise (zwei Verträge, die aufeinander verweisen) werden erkannt; jede Mappe steht nur einmal da. Benutzer und Rollen sind nie dabei.
4. **Prüfen:** Die Liste zeigt den Baum mit Häkchen je **Mappe**, **Dokument**, **Notiz** und **Historie**. Nur Angehaktes geht hinaus, und erst wenn du **„Ich habe die Auswahl geprüft“** bestätigst, lässt sich die Auskunft erzeugen.
    - **Daten Dritter?** Ist eine Mappe noch mit anderen Personen verbunden (Mappen eines Typs, der eine Person betrifft – z. B. eine Wohnung, in der auch andere Mieter wohnen), steht das dabei. Enthält ein Dokument Angaben zu anderen Personen, öffne es über **schwärzen …** in einem neuen Tab, schwärze die Stellen ([Schwärzen](https://motom001.github.io/dms/benutzer/aktuell/dokumente/)) und sammle neu: Die **geschwärzte Fassung** ist dann angehakt, das Original nicht.
    - **Notizen** sind vorgewählt. Hältst du eine zurück (z. B. eine interne Bewertung), ist eine **Begründung Pflicht**; sie steht im Nachweis, nicht in der Auskunft.
    - **Vorschläge aus der Suche:** Mappen, die nicht über Verweise an der Person hängen, aber ihren Namen, ihre E-Mail-Adresse, Kundennummer oder IBAN enthalten (auch in Dokumenten und Notizen). Sie sind nicht angehakt – nimm sie nur auf, wenn sie wirklich zur Person gehören.
5. **Erzeugen:** Empfänger und eine Anmerkung fürs Deckblatt, optional ein **Passwort** (mindestens 10 Zeichen, „Vorschlagen“ erzeugt eines). Die Auskunft entsteht im Hintergrund; danach erscheint **Herunterladen**.

### Was die ZIP-Datei enthält

| Datei/Ordner | Inhalt |
| --- | --- |
| `Deckblatt.pdf` | „Auskunft nach Art. 15 DSGVO“ mit Absender: welche Daten (Arten und Felder), Zwecke, Herkunft (Kanäle der Post: E-Mail, Scan …), Empfänger, Speicherdauer, Rechte der Person |
| `Uebersicht.html` | alle Mappen mit ihren Angaben und Links zu den Dokumenten – im Browser zu öffnen |
| `Uebersicht.csv` | dasselbe als Tabelle |
| `ablage/<Art>/<Titel>/` | je Mappe die Dokumente im Original (bzw. geschwärzt), dazu `mappe.pdf` und `mappe.json` |
| `daten/`, `struktur/`, `manifest.json` | maschinenlesbar im Format des [Vollexports](export.md) (CSV, JSON Lines, Excel) – deckt auch die Datenübertragbarkeit (Art. 20) ab |

**Nie enthalten** sind Passwortfelder (weder Wert noch Feld) und andere verschlüsselte Werte, ältere Versionen von Dokumenten (sie könnten ungeschwärzt sein), Aufgaben, Benutzerkonten und Berechtigungen. Hältst du eine Notiz zurück, fehlen in der Historie dieser Mappe auch die Einträge zu Notizen (sie nennen deren Text).

**Mit Passwort** liegt die Auskunft als `Auskunft.zip` in einer mit AES-256 verschlüsselten ZIP-Datei – so sind auch die Dateinamen (z. B. der Name der Person) nicht zu sehen. Öffnen lässt sie sich z. B. mit 7-Zip, WinZip oder Keka (macOS), **nicht** mit dem eingebauten Entpacken von Windows. Teile das Passwort getrennt von der Datei mit, z. B. per Telefon oder SMS.

### Nachweis und Aufbewahrung

- In der **Historie der Person** steht „Auskunft erteilt“ mit Zeit, wer sie erstellt hat, Anzahl Mappen, Dokumente und Notizen, ob mit Passwort und die Begründungen zurückgehaltener Notizen – **ohne Inhalte**. Dasselbe steht ohne Begründungen im [Protokoll](fehlersuche.md#protokoll) (Modul „datenschutz“).
- Die ZIP-Datei liegt unter **Bereitliegende Auskünfte**, bis du sie **herunterlädst** – danach wird sie gelöscht –, höchstens **7 Tage**. Mit einem gültigen [Abruf-Link](#auskunft-zustellen) bleibt sie, bis die Person sie so oft abgerufen hat wie vorgesehen oder der Link abläuft. Gespeichert wird sie neben den Exporten (`export/auskunft/` im Sicherungsordner, ohne Sicherungsordner im temporären Ordner des Containers); sie ist nicht Teil der Sicherung.
- Brauchst du sie noch einmal, erzeuge sie neu.

### Wer darf das?

Nur **Administratoren**. Ein eigenes Recht „Auskunft erteilen“ gibt es (noch) nicht: Die [Berechtigungen](berechtigungen.md) regeln je Mappentyp Anlegen, Lesen, Bearbeiten, Löschen und Passwörter – eine Auskunft greift über alle Mappentypen. Abgestufte Rechte für Administratoren kommen später.

## Auskunft zustellen

Die fertige Auskunft schickst du direkt aus dem DMS – unter **Bereitliegende Auskünfte** mit **Zustellen …** (oder gleich nach dem Erzeugen). Kommst du von der Mappe der Person (*Aktionen → Auskunft erstellen …*), stehen ihre Auskünfte oben. Zwei Wege:

| | Abruf-Link mit Abrufcode | ZIP per E-Mail |
| --- | --- | --- |
| **Wie** | Die Person bekommt einen Link auf eine schlichte Seite deines DMS und lädt die Datei dort mit einem Abrufcode herunter. | Die ZIP-Datei geht als Anhang über den [E-Mail-Versand](installation.md#e-mail-und-adresse) des DMS. |
| **Voraussetzung** | Dein DMS ist **aus dem Internet erreichbar**. | Die Auskunft ist **mit Passwort** erzeugt; höchstens 50 MB (viele Mailserver nehmen nur 10–25 MB). |
| **Nachweis** | Jeder Abruf mit Zeitpunkt, „abgerufen am …“, Benachrichtigung | „per E-Mail gesendet an … am …“ |
| **Zweiter Weg** | Abrufcode per Brief, Telefon oder SMS | Passwort per Telefon, SMS oder Brief |

Vorgeschlagen ist der Abruf-Link, wenn die [Adresse des DMS](installation.md#e-mail-und-adresse) nach Internet aussieht – sonst (z. B. `http://192.168.…`, `localhost`, `nas.local`) die E-Mail.

### Weg 1: per E-Mail

Nur für Auskünfte **mit Passwort** – unverschlüsselt geht keine Auskunft per E-Mail hinaus. Gib die Adresse ein; Betreff und Text sind vorbereitet (in Du-Form) und lassen sich ändern. **Das Passwort steht nie in der E-Mail** – das DMS kennt es nach dem Erzeugen gar nicht mehr. Teile es auf einem anderen Weg mit. Antworten gehen an deine Adresse. In der Historie der Person steht „Auskunft per E-Mail gesendet an …“.

### Weg 2: Abruf-Link mit Abrufcode

1. **Adresse der Person** (optional): Mit **Link per E-Mail an diese Adresse schicken** verschickt das DMS den Link – ohne Code. Ohne E-Mail-Versand kopierst du den Link und schickst ihn selbst.
2. **Gültig** (Vorgabe 30 Tage, höchstens 90) und **Abrufe** (Vorgabe 3, höchstens 10).
3. **Abrufcode:** Am besten **vom DMS erzeugen** (8 Zeichen ohne Verwechsler wie 0/O und 1/I). Alternativ ein **eigener Code**, den nur die Person kennt – z. B. die Vertragsnummer (mindestens 6 Zeichen). Eine **Kundennummer allein ist schwach**: Sie steht oft auf Briefen und Rechnungen.
4. **Abruf-Link erstellen:** Link und Code stehen **nur jetzt** auf dem Bildschirm. Teile den Code auf einem anderen Weg mit – per Brief, Telefon oder SMS, **nie in derselben E-Mail wie den Link**. Geht er verloren, erstelle einen neuen Link; der alte gilt dann nicht mehr.

Die Person öffnet den Link und sieht nur: „Du hast eine Auskunft nach Art. 15 DSGVO über die hier gespeicherten Daten angefordert. Zur Sicherheit gib bitte deinen Abrufcode ein.“ – kein Menü, kein Logo, kein Name des Haushalts, keine Anmeldung. Mit dem richtigen Code startet der Download.

![Öffentliche Abrufseite einer Auskunft](bilder/abrufseite.png)

Unter **Abruf-Links** stehen alle Links mit Stand (*aktiv*, *abgelaufen*, *alle Abrufe verbraucht*, *gesperrt nach Fehlversuchen*, *zurückgezogen*), Abrufen, „zuletzt abgerufen am …“ und falschen Codes – auch, wenn die ZIP-Datei längst gelöscht ist. **Zurückziehen** macht einen Link sofort ungültig; für die ZIP-Datei gilt dann wieder das Ende 7 Tage nach dem Erstellen.

![Zustellen an einer bereitliegenden Auskunft](bilder/werkbank-datenschutz-zustellen.png)

**Nachweis und Benachrichtigung:** Jeder Abruf und jeder falsche Code steht in der **Historie der Person** (Zeitpunkt, erfolgreich oder nicht – **ohne IP-Adresse**, ohne Code). Wer den Link oder die Auskunft erstellt hat und wer die Person als **Favorit** (★) hat, bekommt unter „Zu erledigen“ die Aufgabe **Auskunft** – „Auskunft an … wurde abgerufen“. Solange sie offen ist, kommt für denselben Link keine zweite. Sind alle Abrufe verbraucht, wird die ZIP-Datei gelöscht.

### Sicherheit der Abrufseite

Die Abrufseite ist der **einzige** Weg, ohne Anmeldung an Daten im DMS zu kommen. Darum:

- **Nicht zu erraten:** Der Link enthält nur einen Zufallsschlüssel mit 256 Bit, sonst nichts – keine Id, keinen Namen. Er steht hinter dem `#` (`/abruf#…`): Diesen Teil schickt der Browser nie mit, er landet also in keinem Zugriffsprotokoll (auch nicht beim Reverse-Proxy) und in keinem Referer.
- **Zwei Faktoren:** Link (E-Mail) und Abrufcode (anderer Weg). Gespeichert sind nur Hashes – der Schlüssel als SHA-256, der Code wie ein Passwort (scrypt); verglichen wird in konstanter Zeit.
- **Keine Auskunft über Links:** Ein unbekannter Link, ein falscher Code und ein gesperrter Link ergeben dieselbe Meldung in derselben Zeit. Erst mit richtigem Code erfährt die Person, dass ihr Link abgelaufen, verbraucht oder zurückgezogen ist.
- **Sperre:** Nach **10 falschen Codes** ist der Link gesperrt – dann hilft auch der richtige nicht mehr; du erfährst es über die Aufgabe *Auskunft*. Zusätzlich zählt der [Anmeldeschutz](anmeldeschutz.md) Fehlversuche je IP-Adresse (Vorgabe: 5 je Minute, 30 je Stunde über alle Links und Anmeldungen).
- **Download über ein Einmal-Ticket:** Nach dem richtigen Code gibt es ein Ticket für genau einen Download, zwei Minuten gültig. Gezählt wird beim Start des Downloads; ein abgebrochener Download steht als *abgebrochen* in der Historie.
- **Protokoll ohne Geheimnisse:** Im [Protokoll](fehlersuche.md#protokoll) (Modul „datenschutz“) stehen Abrufe und Fehlversuche mit **gekürzter IP** (z. B. `203.0.113.0`), nie Schlüssel oder Code.
- Die Anfrage mit dem Code braucht die Kennung der eigenen Oberfläche (Schutz vor fremden Seiten, CSRF); die Seite lädt sonst nichts aus dem DMS (keinen Kontostatus, kein Design).

### Erreichbarkeit aus dem Internet

Der Abruf-Link funktioniert nur, wenn die Person dein DMS von außen erreicht. Viele Installationen zu Hause sind das nicht – dann nimm den Weg per E-Mail. Soll das DMS erreichbar sein, geht das über einen [Reverse-Proxy](installation.md#hinter-einem-reverse-proxy) mit HTTPS (z. B. auf dem NAS mit Portfreigabe), einen Tunnel (z. B. Cloudflare Tunnel, Tailscale Funnel) oder ein gemietetes Hosting. Trage unter [E-Mail und Adresse](installation.md#e-mail-und-adresse) die Adresse ein, unter der es von außen erreichbar ist – sie steht im Link. Wer nur die Abrufseite nach außen geben will, gibt am Proxy `/abruf`, `/api/abruf`, `/api/abruf/datei` und die Dateien der Oberfläche (`/assets/`) frei.

## Schnittstelle

Alles geht auch über die [API](api.md): `POST /api/v1/werkbank/auskunft/vorschau` (Prüfliste), `POST /api/v1/werkbank/auskunft` (erzeugen, Hintergrundauftrag), `GET /api/v1/werkbank/auskunft/{id}/zip`, `POST /api/v1/werkbank/auskunft/frist` und `GET`/`PUT /api/v1/werkbank/datenschutz`; zum Zustellen `POST /api/v1/werkbank/auskunft/{id}/email`, `POST /api/v1/werkbank/auskunft/{id}/link` und `POST /api/v1/werkbank/auskunft/link/{id}/widerrufen`. Die Abrufseite selbst (`POST /api/abruf`, `GET /api/abruf/datei`) gehört nicht zur API. Die Sammlung über Verweise selbst steht jedem Benutzer mit seinen Rechten unter `GET /api/v1/mappen/{id}/baum` zur Verfügung.
