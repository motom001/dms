# Fahrplan (Roadmap)

Was als Nächstes ins DMS kommt – und warum in dieser Reihenfolge.

## So arbeiten wir

- **Pakete statt Einzelstücke.** Zusammengehörige Wünsche werden zu einem Paket gebündelt. Jedes Paket ist ein [Meilenstein](https://github.com/motom001/dms/milestones) auf GitHub; dort sieht man, welche Issues dazugehören und wie weit es ist.
- **Ein Paket nach dem anderen.** Umgesetzt wird nur, was der Maintainer mit dem Label `freigegeben` versieht – in der Regel das aktuelle Paket. Das nächste Paket ist schon beschrieben und sortiert, wird aber erst freigegeben, wenn das aktuelle fertig ist. So bauen spätere Funktionen auf dem auf, was es dann wirklich gibt, und Rückmeldungen aus dem Ausprobieren fließen ein.
- **Die Reihenfolge kann sich ändern.** Nach jedem Paket schauen wir neu hin. Was weiter hinten steht, ist geplant, aber nicht versprochen.
- **Wünsche** sind willkommen – als [Issue](https://github.com/motom001/dms/issues/new/choose) im Format einer User Story. Neue Wünsche werden bewertet und einem Paket zugeordnet oder bewusst zurückgestellt.

## Jetzt

| Paket | Was du davon hast | Stand |
|---|---|---|
| [01 · Post und Alltag](https://github.com/motom001/dms/milestone/1) | Vorschaubilder, doppelte Dokumente erkennen, Papierkorb für Dokumente, Startseite, PDF bearbeiten, mehrere Mappen per E-Mail, Archivnummer zum Aufkleben – und Postfächer bei Microsoft 365 und Gmail mit OAuth 2.0 | fast fertig |
| [02 · Erweitern: Paket-Läufer und Laufwerk](https://github.com/motom001/dms/milestone/2) ([Pakete dazu](https://github.com/motom001/dms-registry/milestone/1)) | Pakete dürfen eigenen Code mitbringen – sicher abgeschottet als WebAssembly; erstes Beispiel: Texterkennung als Paket. Das DMS als Laufwerk im Explorer, Finder und in der Dateien-App (WebDAV) | in Prüfung |
| [03 · Weitergeben und Datenschutz](https://github.com/motom001/dms/milestone/3) | Schwärzen, PDF verkleinern, Stempel „Kopie für …“ beim Weitergeben, Sprache bei der Texterkennung automatisch erkennen, Auskunft für Kunden und Mieter als ZIP, Datenschutz im Handbuch; dazu schnellere Ablage bei vielen Mappen und eine aufgeräumtere Werkbank | freigegeben |

## Als Nächstes

| Paket | Was du davon hast |
|---|---|
| [04 · Erkennen](https://github.com/motom001/dms/milestone/4) | Das DMS schlägt beim Zuordnen von Post Absender, Datum, Betrag und Zielmappe vor und füllt Mappen aus einem Foto aus (z. B. Visitenkarte scannen). Später ordnet es eindeutige Post selbst zu. |
| [05 · Werkbank neu gruppieren](https://github.com/motom001/dms/milestone/5) | Die Werkbank nach Aufgaben statt nach Technik – man findet, was man sucht. |
| [06 · Suche](https://github.com/motom001/dms/milestone/6) | Finden trotz Tippfehlern, Umlauten und anderer Schreibweisen; ähnliche Dokumente. |

## Danach

| Paket | Was du davon hast |
|---|---|
| [07 · Verarbeitungs-Pakete](https://github.com/motom001/dms-registry/milestone/2) | Optionale Pakete für PDF/A, Office-Dateien und E-Mails sowie lokale KI – die Daten bleiben im Haus. |
| [08 · E-Rechnung](https://github.com/motom001/dms/milestone/7) | XRechnung und ZUGFeRD prüfen, lesbar anzeigen und Felder vorbelegen. |
| [09 · Clients](https://github.com/motom001/dms/milestone/8) | Apps für iOS und Android, Office-Add-ins und weitere Wege ins DMS – zuerst als Konzept. |

## Später

[Später](https://github.com/motom001/dms/milestone/9): gute Ideen ohne festen Platz in der Reihenfolge – berechnete Felder, Einreichung in weitere App-Stores (Unraid, TrueNAS, UGREEN, umbrelOS, ZimaOS).

## Bewusst zurückgestellt

[Zurückgestellt](https://github.com/motom001/dms/milestone/10) (und [im Paketkatalog](https://github.com/motom001/dms-registry/milestone/3)) – geparkt, die Begründung steht jeweils im Issue:

- **Mehrsprachigkeit** – vorbereitet, aber im Moment nicht wichtiger als die Funktionen oben.
- **Digital unterschreiben und Signaturen prüfen** – aufgenommen für später, wenn es gebraucht wird.
- **Abgestufte Administratorrechte** – wird wichtig, wenn mehr Betriebe das DMS nutzen.
- **Bewertungen im Paketkatalog** – lohnt sich erst mit mehr Paketen.

## Was es schon gibt

Was in jeder Version dazukam, steht in den [Release-Notizen](https://github.com/motom001/dms/releases).
