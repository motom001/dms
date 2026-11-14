# Notfall: Was ist dir passiert?

Du hast das [Notfallblatt](verschluesselung.md#notfallblatt) vor dir und den Code darauf gescannt? Gut. Lies hier am Handy und arbeite parallel am Computer. Such dir aus, was passiert ist – jeder Fall hat nur wenige Schritte.

Diese Seite erreichst du immer unter **https://help.ablago.app/notfall** (Englisch: **https://help.ablago.app/emergency**). Die Adressen bleiben gültig, weil sie auf Papier stehen.

## Welcher Notfall? { #uebersicht }

- [Ablago lädt nicht oder bleibt schwarz](#laedt-nicht) – die Seite bleibt leer, „Ablago antwortet gerade nicht“ oder „Die Datenbank antwortet nicht“
- [Ablago startet nicht mehr](#startet-nicht) – etwa nach einem Update
- [Mein Gerät ist kaputt](#geraet-kaputt)
- [Ich komme nicht mehr hinein](#kein-zugang) – Passwort vergessen, Zwei-Faktor-Handy verloren
- [Kein Admin mehr](notfall.md) – niemand mit Verwaltungsrecht kommt hinein, auch kein Notfallblatt
- [Jemand anderes muss übernehmen](#uebernehmen)

## Ablago lädt nicht oder bleibt schwarz { #laedt-nicht }

Ablago lief, aber jetzt geht es nicht mehr – ohne dass du etwas geändert hast.

**Woran du es erkennst:**

- Die Seite bleibt **schwarz bzw. leer**, oder sie zeigt lange „Verbindung zu Ablago wird aufgebaut …“.
- Statt der Anmeldung steht dort **„Ablago antwortet gerade nicht.“** – darunter, was los ist, was du tun kannst, und wann zuletzt geprüft wurde.
- Oben steht eine rote Leiste **„Ablago ist beschäftigt – die Datenbank antwortet nicht.“**

Ablago selbst läuft dann meist noch, kommt aber nicht an seine Datenbank. Deine Dokumente sind davon nicht betroffen.

**Was die Meldung sagt** – der erste Satz unter „Ablago antwortet gerade nicht.“ verrät, wo es hakt:

| Die Meldung sagt … | Das heißt | Was meist hilft |
|---|---|---|
| „Ablago läuft, bekommt aber seit … keine Antwort von seiner Datenbank.“ | Ablago hängt: Keine Verbindung zur Datenbank ist frei, oder die Datenbank antwortet nicht rechtzeitig. | Den **Ablago-Container** neu starten (Schritt 2). |
| „Ablago läuft, erreicht aber seit … seine Datenbank nicht – sie ist vermutlich aus.“ | Die Datenbank lehnt die Verbindung ab: Ihr Container läuft nicht oder ist nicht erreichbar. | Den **Container der Datenbank** bzw. das ganze Projekt starten. Ablago allein neu zu starten hilft hier nicht. |
| „Ablago meldet sich gar nicht.“ | Ablago selbst antwortet nicht – es startet gerade neu, oder der Container läuft nicht. | Kurz warten; sonst in der Container-Oberfläche nachsehen, ob der Ablago-Container läuft. |

Unten auf der Meldung stehen die **Uhrzeit** der letzten Prüfung und – wenn du in diesem Browser schon einmal angemeldet warst – die **Version** von Ablago. Beides hilft, wenn du jemandem Bescheid sagst oder einen Fehler meldest.

!!! info "Warum gibt es dort keinen Knopf „Ablago neu starten“ und kein Protokoll?"
    Die Meldung sieht jeder, der die Adresse kennt – und ohne Datenbank kann Ablago nicht prüfen, wer du bist. Ein Knopf zum Neustarten wäre so ein Werkzeug, um Ablago von außen lahmzulegen, und das Protokoll enthält Namen, Adressen und Dateinamen. Deshalb zeigt die Seite nur, was los ist und was du tun kannst; neu starten und ins Protokoll sehen geht über den Container (Schritte 2 und 3).

**Was du tun kannst – der Reihe nach:**

1. **Seite neu laden.** Warte eine Minute und lade die Seite neu (am Handy: Seite nach unten ziehen). Ablago versucht es auch von selbst weiter und lädt die Seite, sobald es wieder antwortet. Steht danach „Neu laden allein hat nicht geholfen“ (bzw. in der Leiste „Schon neu geladen, Ablago antwortet weiter nicht“), geh zu Schritt 2.
2. **Container neu starten.** Das beendet alle laufenden Anfragen und baut die Verbindungen zur Datenbank neu auf. Nichts geht dabei verloren. Sagt die Meldung, die Datenbank sei „vermutlich aus“, starte das ganze Projekt bzw. den Container der Datenbank.
    - **Synology (Container Manager):** *Container Manager → Projekt →* dein Ablago-Projekt *→ Aktion → Neu starten*. Bei einem einzelnen Container: *Container →* den Ablago-Container wählen *→ Aktion → Neu starten*.
    - **UGREEN, QNAP, Unraid:** in der Docker-Oberfläche den Ablago-Container wählen und **Neu starten**.
    - **Mit der Kommandozeile** im Ordner mit der Compose-Datei: `docker compose restart` (startet Ablago und die Datenbank neu). Nur Ablago: `docker compose restart app` bzw. bei [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) `docker compose restart dms`.
3. **Protokoll ansehen.** Steht der Container wieder auf „läuft“, lade die Seite neu. Geht es danach (oder schon vorher) nicht, sieh ins Protokoll der letzten zwei Stunden:
    ```
    docker logs --since 2h <container>
    ```
    `<container>` ist der Name des Ablago-Containers, z. B. `dms-app-1`; `docker ps` zeigt alle. In der NAS-Oberfläche: *Container → Details → Protokoll*. Achte auf diese Zeilen:
    - **„Anfragen warten lange auf eine freie Verbindung zur Datenbank“** – mit der Zahl belegter und reservierter Verbindungen und den laufenden Zeitplänen. Das ist der Zustand, den der Neustart behebt.
    - **„Verbindung für Sperren abgebrochen“** – die Verbindung zur Datenbank war kurz weg; Ablago baut sie selbst wieder auf.
    - Zeilen mit **„Datenbank“** und **„nicht erreichbar“** oder **„connection refused“** – dann läuft der Datenbank-Container nicht. Starte ihn bzw. das ganze Projekt neu.
    - **Gar keine Zeilen mehr** seit einer bestimmten Uhrzeit: Merke dir die Uhrzeit der letzten Zeile.
4. **Kommt es wieder?** Dann melde es bitte als Fehler auf [GitHub](https://github.com/motom001/dms/issues) – mit der Version von Ablago, der Uhrzeit und dem Protokoll von Schritt 3 (vorher Namen und E-Mail-Adressen darin unkenntlich machen). So lässt sich die Ursache finden.

Unter **Werkbank → Systemzustand** (siehe [Viele gleichzeitige Anfragen](technik.md#last)) siehst du, solange Ablago erreichbar ist, wie viele Verbindungen zur Datenbank gerade belegt sind und welche Sperren laufen.

## Ablago startet nicht mehr { #startet-nicht }

Zum Beispiel nach einem Update. Deine Daten liegen weiter auf dem Gerät – ein Update löscht nichts.

1. Ruf die gewohnte Adresse auf. Steht dort „Ablago startet …“, warte einfach – die Seite zeigt, was gerade passiert, und lädt sich selbst neu. Steht dort „Ablago konnte nicht starten“, nennt sie den Grund.
2. Öffne die Verwaltung deines Geräts (z. B. den Container Manager auf dem NAS) und sieh dir das Protokoll des Ablago-Containers an. Meist steht dort in einer Zeile, was fehlt.
3. Kam das nach einem Update: Trag die vorige Version als Image-Tag ein und starte neu. Wie das geht, steht unter [Welches Image-Tag?](aktualisieren.md#image-tag).
4. Hilft das nicht, führt dich die [Fehlersuche](fehlersuche.md) weiter.

## Mein Gerät ist kaputt { #geraet-kaputt }

Du richtest Ablago neu ein und spielst die Sicherung ein.

1. Leg bereit: das **Notfallblatt** mit dem Schlüssel und die **beiden Dateien einer Sicherung** – vom alten Datenträger oder von der [Kopie außer Haus](sicherung-ausser-haus.md).
2. Installiere Ablago neu, wie unter [Wie komme ich an Ablago?](https://help.ablago.app/installieren/aktuell/) beschrieben.
3. Kopiere die beiden Dateien in den Sicherungsordner der neuen Installation.
4. Öffne Ablago im Browser. Wähle im Einrichtungsassistenten **Aus einer Sicherung wiederherstellen** und tippe den **Schlüssel vom Notfallblatt** ein. Leerzeichen zählen nicht; unter leicht verwechselbaren Zeichen steht auf dem Blatt, welches gemeint ist.
5. Danach meldest du dich mit deinen bisherigen Zugangsdaten an.

Alle Einzelheiten stehen unter [Neues NAS, alte Sicherung](wiederherstellen.md#neues-nas-alte-sicherung).

## Ich komme nicht mehr hinein { #kein-zugang }

- **Passwort vergessen:** Wähle auf der Anmeldeseite **Passwort vergessen** – das geht, wenn der E-Mail-Versand eingerichtet ist. Sonst erzeugt eine andere Person, die Ablago verwalten darf, unter **Werkbank → Benutzer** einen Passwort-Link für dich.
- **Niemand kommt mehr hinein, der verwalten darf:** Nimm den **Notfallcode** vom Notfallblatt – siehe unten. Ohne Notfallblatt hilft die [RESCUE-Datei auf dem Gerät](notfall.md).
- **Handy für die Zwei-Faktor-Anmeldung verloren:** Eine andere Person mit „Gesamte Verwaltung“ setzt sie zurück, du nimmst einen Wiederherstellungscode – oder den Notfallcode (er setzt die Zwei-Faktor-Anmeldung zurück).
- **Gerät mit dem Passkey verloren:** Melde dich mit Passwort an und entferne den Passkey unter **Mein Konto → Sicherheit**. Ist ein Passkey vorgeschrieben und du hast keinen anderen, setzt eine andere Person mit „Gesamte Verwaltung“ deine Passkeys zurück – oder der Notfallcode (er entfernt auch die Passkeys).

### Mit dem Notfallcode wieder hinein { #notfallcode }

Unten auf dem Notfallblatt steht im Kasten **Ausgesperrt?** ein langer Code in Vierergruppen und die Adresse deiner Ablage mit `/notfall` am Ende. Das geht am Handy genauso wie am Computer.

1. Öffne die Adresse **im Heimnetz**, also mit einem Gerät im WLAN zu Hause, z. B. `http://nas.home.arpa:8080/notfall`. Aus dem Internet geht das nur, wenn es unter [Anmeldeschutz](anmeldeschutz.md#notfallzugang) erlaubt ist.
2. Tippe den **Notfallcode** ein. Groß- und Kleinschreibung, Leerzeichen und Bindestriche zählen nicht. **Nicht den Schlüssel** vom Notfallblatt – der gehört nie in den Browser.
3. Tippst du dich vertan, steht dort „Der Notfallcode war falsch“, und die Eingabe ist **30 Sekunden gesperrt** – ein Countdown zählt herunter. Das gilt nur für dein Gerät bzw. deinen Anschluss; wer anderswo Fehlversuche macht, sperrt dich damit nicht aus.
4. Stimmt der Code, wählst du das **Konto**, für das du ein neues Passwort festlegst. Zur Wahl stehen nur Personen, die Ablago verwalten dürfen.
5. Leg das **neue Passwort** fest. Ablago beendet dabei alle Anmeldungen dieses Kontos und setzt die Zwei-Faktor-Anmeldung zurück und entfernt die Passkeys – richte sie danach neu ein. API-Schlüssel des Kontos bleiben gültig.
6. Lade das **neue Notfallblatt** herunter. Der alte Code gilt nur einmal – auf dem neuen Blatt steht ein neuer. Druck es aus und vernichte das alte.
7. **Melde dich an** – mit der E-Mail-Adresse des Kontos und dem neuen Passwort.

Alle, die Ablago verwalten dürfen, und die bisherige E-Mail-Adresse des Kontos bekommen sofort eine E-Mail: „Der Notfallzugang deiner Ablage wurde … benutzt“ – schon bevor sich etwas ändert. Viele Fehlversuche melden sie gebündelt. In der Werkbank steht ein roter Hinweis, bis jemand **Gelesen** wählt, und das [Protokoll](fehlersuche.md#protokoll) hält alles fest.

!!! warning "Notfallblatt verloren oder gestohlen?"
    Wer das Blatt hat, kann über den Notfallcode ein Konto mit Verwaltungsrecht übernehmen – nicht unbemerkt, denn alle Verwaltenden bekommen dann eine E-Mail. Lade unter **Werkbank → Verschlüsselung** sofort ein neues Notfallblatt herunter: Damit gilt der alte Code nicht mehr. Wechsle außerdem den Schlüssel, denn auch er stand auf dem Blatt.

## Jemand anderes muss übernehmen { #uebernehmen }

Du hast das Notfallblatt gefunden, weil die Person, die Ablago eingerichtet hat, nicht mehr kann?

1. **Bewahre das Blatt gut auf** und gib es nicht weiter. Wer es hat, kann die Sicherungen lesen.
2. Unter **Wen fragen?** auf dem Blatt stehen Menschen, die helfen können. Sprich zuerst mit ihnen.
3. **Läuft Ablago noch**, melde dich mit dem Zugang einer Person an, die Ablago verwalten darf (oft im Passwortsafe). Fehlt er, hilft der [Notfallcode](#notfallcode) unten auf dem Blatt. Leg dir dann ein eigenes Konto an, siehe [Benutzer und Rollen](benutzer.md).
4. **Läuft Ablago nicht mehr**, geh vor wie unter [Mein Gerät ist kaputt](#geraet-kaputt).
