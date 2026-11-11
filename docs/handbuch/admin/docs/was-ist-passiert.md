# Notfall: Was ist dir passiert?

Du hast das [Notfallblatt](verschluesselung.md#notfallblatt) vor dir und den Code darauf gescannt? Gut. Lies hier am Handy und arbeite parallel am Computer. Such dir aus, was passiert ist – jeder Fall hat nur wenige Schritte.

Diese Seite erreichst du immer unter **https://help.ablago.app/notfall** (Englisch: **https://help.ablago.app/emergency**). Die Adressen bleiben gültig, weil sie auf Papier stehen.

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
