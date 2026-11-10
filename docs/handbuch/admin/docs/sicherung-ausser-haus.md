# Sicherung außer Haus

Eine Sicherung im eigenen Sicherungsordner schützt vor versehentlichem Löschen und vor einem kaputten Update. Gegen **Brand, Diebstahl oder einen Plattenausfall** hilft nur eine Kopie an einem anderen Ort – die „1“ der [3-2-1-Regel](sicherung.md#speicherort). Seit Version 0.142 bringt Ablago jede Sicherung auf Wunsch **selbst** dorthin und **prüft**, dass sie heil angekommen ist.

## Welcher Weg passt?

| Du betreibst Ablago … | Kopie außer Haus über … |
|---|---|
| auf einem **NAS mit Sicherungs-App** (Synology *Hyper Backup*, QNAP *Hybrid Backup Sync* …) | die App des NAS – sie kopiert den Sicherungsordner, siehe [Speicherort](sicherung.md#speicherort). Ein Paket brauchst du nicht. |
| mit einer **Netzfreigabe** (SMB/NFS) eines anderen Geräts im Haus | ein Docker-Volume: Binde die Freigabe als Sicherungsordner ein (`/data/sicherung`). Das ist eine zweite Platte, aber noch nicht außer Haus. |
| auf einem **Raspberry Pi, einem gemieteten Server oder bei einem Anbieter** | ein Paket: **Sicherungsziel WebDAV** für Nextcloud, viele NAS und viele Hoster. |

Ein Paket für S3-kompatible Speicher (Stufe 2) ist geplant; SFTP und FTPS gibt es nicht (SFTP bräuchte direkten Netzzugang für Pakete, FTPS ist veraltet – Ziele mit FTPS können meist auch WebDAV).

## So läuft es ab

1. **Zuerst lokal:** Ablago sichert wie immer in den Sicherungsordner – schnell und unabhängig vom Netz. Nie schreibt es direkt auf das Ziel; ein langsames oder fehlendes Netz verhindert keine Sicherung.
2. **Danach im Hintergrund:** Das Paket bekommt das Ereignis *Sicherung fertig*, liest die **verschlüsselte** Datei in Stücken und lädt sie in Teilen hoch. Bricht das Netz ab, macht es beim nächsten Versuch an der letzten Stelle weiter (Wiederholungen nach 1, 5, 30 Minuten, 2 und 6 Stunden). Die lokale Sicherung bleibt davon unberührt.
3. **Prüfen:** Das Paket vergleicht die Kopie mit der Prüfsumme (SHA-256) der Sicherung – je nach Ziel über die Prüfsumme des Servers oder durch Zurücklesen – und meldet das Ergebnis.

Neben die Datei legt das Paket eine **schlanke Metadaten-Datei** (`.json`): Dateiname, Größe, Prüfsumme, Zeitpunkt und Fingerabdruck des Schlüssels – ohne Namen, Versionen oder Zähler. Damit lässt sich die Kopie [wiederherstellen](wiederherstellen.md#aus-einer-kopie-ausser-haus).

**Lokal wird nichts gelöscht, weil die Kopie angekommen ist.** Lokal heißt schnelle Wiederherstellung, außer Haus heißt Schutz bei Verlust des Geräts – beide haben ihre eigene Aufbewahrung. Ist der Platz knapp, wähle unter *Zeitplan und Aufbewahrung* **Lokal nur die neueste behalten**. „Lokal keine“ gibt es bewusst nicht: Sonst hinge jede Wiederherstellung am externen Speicher – gekündigt, voll, gesperrt oder das Netz weg. Eine Sicherung, deren Kopie gerade läuft, bleibt stehen, bis sie angekommen ist (höchstens 2 Tage).

## Anzeige und Hinweise

Unter **Werkbank → Sicherung** steht je Sicherung in der Spalte **Wo**, was es von ihr gibt:

| Anzeige | Bedeutung |
|---|---|
| lokal · extern wartet / läuft (… %) | Die Kopie ist angestoßen bzw. unterwegs. |
| lokal · extern **geprüft** | Am Ziel angekommen, Prüfsumme bestätigt (vom Server oder durch vollständiges Zurücklesen). |
| lokal · extern geprüft (Stichprobe) | Größe und Stichproben zurückgelesen – bei großen Sicherungen; einmal im Monat liest das Paket vollständig. |
| lokal · extern hochgeladen, Größe bestätigt | Das Ziel bestätigt nur die Größe, zurücklesen geht nicht (z. B. eine [Dateiablage](#loschschutz)). |
| lokal · extern fehlgeschlagen | Mit Grund im Titel, z. B. „Passwort falsch“ oder „Speicher voll“. |

Der Abschnitt **Außer Haus** nennt das Ziel und die letzte Kopie. Die Übersicht der Werkbank zeigt einen Hinweis, und alle Administratoren bekommen **eine E-Mail je Vorfall**, wenn

- eine Kopie **endgültig fehlgeschlagen** ist (Prüfsumme am Ziel falsch, Anmeldung abgelehnt, nach allen Wiederholungen aufgegeben) oder
- seit mehr als **2 Tagen** keine neuere Sicherung außer Haus angekommen ist.

Die E-Mail nennt nur das Ziel, nie Zugangsdaten. Ein einzelner Fehlversuch, den die nächste Wiederholung behebt, steht nur in der Werkbank.

Das [Notfallblatt](verschluesselung.md#notfallblatt) nennt das Ziel (Paket und Adresse) **ohne Passwort**, dazu den Satz: *Der Schlüssel der Werkbank liegt nicht auf dem Ziel. Die Kopie öffnest du nur mit dem Schlüssel von diesem Blatt.* Lade es nach dem Einrichten neu herunter.

## Einrichten mit „Sicherungsziel WebDAV“

1. **Werkbank → Pakete**, *Sicherungsziel WebDAV* installieren. Die Vorschau zeigt die Rechte: *Die verschlüsselte Sicherung lesen, um sie außer Haus zu kopieren – kann sie nicht öffnen* und *Reagiert auf: Eine Sicherung ist fertig*.
2. In den **Einstellungen** des Pakets Adresse, Benutzer, Passwort und Ordner eintragen und speichern; die Adresse bestätigst du – nur dorthin darf das Paket ins Netz. Das Passwort speichert Ablago verschlüsselt und zeigt es nicht mehr an.
3. **Verbindung testen** – mit den gespeicherten Angaben, nie mit einer Adresse aus der Anfrage.
4. **Jetzt sichern** und in der Spalte *Wo* zusehen, wie die Kopie ankommt.

Einzelheiten zu Nextcloud, Hostern und NAS stehen im README des Pakets.

## Löschschutz gegen Erpressersoftware { #loschschutz }

Übernimmt jemand dein Ablago, kennt er auch die gespeicherten Zugangsdaten des Ziels. Damit er die Kopien außer Haus **nicht löschen oder überschreiben** kann, gib Ablago so wenig Rechte wie möglich – und räume am Ziel selbst auf:

- **Nextcloud – Dateiablage (empfohlen):** Lege einen Ordner an und gib ihn als **Dateiablage** frei (*Freigabe per Link → Nur Hochladen / File drop*). Eine Dateiablage kann hochladen, aber nicht auflisten, lesen oder löschen. Trage den Link als Adresse ein, das Kennwort der Freigabe (falls gesetzt) als Passwort. Nachteil: Zurücklesen geht nicht – die Anzeige sagt dann ehrlich „hochgeladen“ statt „geprüft“. Der Papierkorb und die Versionen einer normalen Nextcloud schützen dagegen **nicht**: Derselbe Zugang kann sie leeren.
- **Normaler WebDAV-Zugang (Nextcloud-Benutzer, Hoster, NAS):** darf immer auch löschen. Nimm einen **eigenen Benutzer** nur für die Sicherungen, mit Zugriff nur auf diesen Ordner, und aktiviere am Ziel – wo vorhanden – **Versionierung oder Schnappschüsse**, die dieser Benutzer nicht löschen kann (z. B. Schnappschüsse des NAS, Snapshots beim Hoster).
- **Alte Sicherungen extern löschen** ist im Paket **aus**. Schaltest du es ein, braucht der Zugang Löschrechte – und genau das hebt den Schutz auf. Besser: Aufbewahrung am Ziel einstellen (Lebensdauer-Regel, Aufräum-Regel des NAS) oder ab und zu von Hand aufräumen.
- **S3-kompatible Speicher (sobald es das Paket gibt):** einen eigenen Zugang nur mit `PutObject` (und `HeadObject`/`GetObjectAttributes` zum Prüfen), **ohne** `DeleteObject`; am Bucket **Object Lock** mit Aufbewahrungszeit und eine **Lebensdauer-Regel** zum Aufräumen. Geprüft wird über `x-amz-checksum-sha256` – das Ziel rechnet selbst nach. Das ist der sauberste Löschschutz.

Was das Paket sieht und darf:

- nur die **verschlüsselte** Datei der Sicherung aus seinem Ereignis und die schlanken Metadaten – nie den Schlüssel, nie Inhalte, nie andere Dateien des Sicherungsordners;
- ins Netz nur zur bestätigten Adresse, ohne Weiterleitungen auf andere Hosts;
- am Ziel listet es nichts auf und räumt nichts auf, solange du *Alte Sicherungen extern löschen* nicht einschaltest.

Die Sicherung ist mit AES-256-GCM verschlüsselt und als Ganzes geprüft: Wer nur die Datei hat, kann sie weder lesen noch unbemerkt verändern.
