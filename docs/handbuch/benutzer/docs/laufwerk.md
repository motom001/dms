# Als Laufwerk einbinden

Du arbeitest lieber mit dem Explorer, dem Finder oder der Dateien-App? Dann binde die Ablage von Ablago als **Laufwerk** ein. Du blätterst durch Ansichten, Mappen und Register wie durch Ordner, öffnest Dokumente mit jedem Programm und legst neue Post einfach hinein – per Ziehen oder „Sichern unter“.

!!! note "Erst einschalten lassen"
    Das Laufwerk ist in Ablago zunächst **ausgeschaltet**; dein Administrator schaltet es in der Werkbank ein. Ist es eingeschaltet, findest du alles Nötige selbst: Klick oben rechts auf deinen Namen → **Als Laufwerk einbinden**. Ist es aus, gibt es diesen Eintrag nicht.

## Was du brauchst

Unter **Mein Konto → Laufwerk** (Klick oben rechts auf deinen Namen → **Als Laufwerk einbinden**) steht alles beisammen:

1. **Die Adresse** deines Ablago mit `/webdav/` am Ende, z. B. `https://dms.example.org/webdav/` – mit **Kopieren** übernimmst du sie.
2. **Der Benutzername:** deine E-Mail-Adresse.
3. **Ein Schlüssel:** **Schlüssel für das Laufwerk anlegen** erzeugt einen API-Schlüssel, der lesen und schreiben darf. Kopiere ihn gleich – er ist nur jetzt ganz zu sehen. Er erscheint danach auch unter **Mein Konto → Sicherheit → API-Schlüssel**. Beim Verbinden ist er das **Passwort** (beginnt mit `dms_`); dein normales Passwort funktioniert hier absichtlich nicht.

Darunter steht für Windows, Mac und iPhone/iPad eine kurze Anleitung zum Aufklappen – dieselbe wie hier.

!!! tip "Ein Schlüssel je Gerät"
    Erzeuge für jedes Gerät einen eigenen Schlüssel. Geht ein Gerät verloren, löschst du nur dessen Schlüssel – alle anderen arbeiten weiter.

## Windows

1. Öffne den **Explorer** und klicke links auf **Dieser PC**.
2. Oben im Menü (bei Windows 11 unter **…**) wähle **Netzlaufwerk verbinden**.
3. Wähle einen freien Laufwerksbuchstaben, z. B. `D:`, und trage bei **Ordner** die Adresse ein: `https://dms.example.org/webdav/`.
4. Setze den Haken bei **Verbindung bei Anmeldung wiederherstellen**, wenn das Laufwerk immer da sein soll.
5. Klicke auf **Fertig stellen**. Gib als Benutzernamen deine E-Mail-Adresse und als Kennwort den API-Schlüssel ein und setze den Haken bei **Anmeldedaten speichern**.

Das Laufwerk erscheint unter **Dieser PC**.

!!! info "Nur über HTTPS"
    Windows verbindet sich mit Anmeldung nur über eine Adresse mit `https://`. Klappt die Verbindung nicht, frag deinen Administrator. Dateien über **50 MB** lädt Windows ohne eine Änderung in der Registry nicht herunter – öffne große Dateien dann im Browser.

## Mac (Finder)

1. Im **Finder** im Menü **Gehe zu → Mit Server verbinden …** wählen (oder ++cmd+k++).
2. Die Adresse eintragen: `https://dms.example.org/webdav/` und auf **Verbinden** klicken.
3. **Registrierter Benutzer** wählen, als Name deine E-Mail-Adresse und als Passwort den API-Schlüssel eintragen. Mit **Passwort im Schlüsselbund sichern** musst du das nur einmal tun.

Das Laufwerk erscheint links in der Seitenleiste unter **Orte**. Mit dem **+** im Fenster „Mit Server verbinden“ merkst du dir die Adresse als Favorit.

## iPhone und iPad (Dateien-App)

!!! warning "Die Dateien-App kann kein WebDAV"
    Unter **Durchsuchen → … → Mit Server verbinden** verbindet sich die Dateien-App nur mit **SMB**-Freigaben, nicht mit WebDAV. Die Adresse mit `/webdav/` funktioniert dort nicht. Es gibt zwei Wege:

**Nur Post ablegen – im Heimnetz per SMB auf den Eingangsordner.** Hat dein Administrator den [Eingangsordner](https://help.ablago.app/admin/aktuell/eingangsordner/) eingerichtet, gibt es dort einen Ordner mit deiner E-Mail-Adresse, z. B. `eingang/lena@example.org/`. Diesen verbindest du per SMB:

1. Öffne die App **Dateien**, tippe unten auf **Durchsuchen**, oben rechts auf **…** und dann auf **Mit Server verbinden**.
2. Trage die Adresse deines NAS ein, z. B. `smb://nas.example.org`, tippe auf **Verbinden** und melde dich mit deinem Konto **am NAS** an (nicht mit dem Ablago-Schlüssel).
3. Öffne die Freigabe mit dem Eingangsordner und darin deinen Ordner.

Aus jeder App legst du jetzt mit **Teilen → In Dateien sichern** in diesen Ordner – Ablago macht daraus eine neue Post mit dir bei **An**. Das geht nur im Heimnetz (oder über ein VPN dorthin).

**Das ganze Laufwerk – mit einer WebDAV-App.** Für Ansichten, Mappen und Dokumente brauchst du eine App aus dem App Store, die WebDAV kann und sich in die Dateien-App einklinkt (als „Ort“). Welche, ist dir überlassen.

1. Installiere eine solche WebDAV-App und lege darin eine WebDAV-Verbindung an.
2. Trage die Adresse ein: `https://dms.example.org/webdav/`.
3. Benutzername ist deine E-Mail-Adresse, Passwort der API-Schlüssel.
4. Schalte die App in der Dateien-App unter **Durchsuchen → … → Bearbeiten** ein, falls sie nicht von selbst erscheint.

Das Laufwerk steht danach in der Dateien-App unter **Orte**. Mit **Teilen → In Dateien sichern** legst du dann direkt in „Neue Post“ ab.

## Was du im Laufwerk siehst

```
Neue Post/
Ablage/
  Verträge/                     eine Ansicht
    Stromvertrag/               eine Mappe
      Dokumente/                ein Register mit Dokumenten
      Verknüpft/                Mappen, die mit dieser verknüpft sind
```

- **Neue Post** – leg hier eine Datei hinein, und sie wird eine neue [Post](post.md) (Kanal „WebDAV“). Du findest sie danach in der Ansicht *Neue Post* und ordnest sie wie gewohnt zu.
- **Ablage** – alle [Ansichten](ablage.md), die du in der Ablage siehst, nebeneinander. Darin die Mappen, darin je **Register** ein Ordner mit den Dokumenten.
- **Verknüpft** – die Mappen, auf die diese Mappe verweist oder die auf sie verweisen. Dort geht es nur eine Ebene tief weiter.
- Du siehst genau das, was du auch im Browser sehen darfst.

## Dokumente öffnen

Doppelklick öffnet das Dokument mit dem passenden Programm. Das geht nur bei Mappen, die du auch **exportieren** darfst (wie Herunterladen, Export und Versenden per E-Mail) – sonst lehnt das Ablago ab, und dein Programm meldet einen Fehler. Im Browser kannst du solche Dokumente weiterhin ansehen.

PDFs kommen über das Laufwerk meist mit einer kleinen Fußzeile „Aus Ablago“ und dem Datum heraus – so sieht man einem ausgedruckten oder weitergeschickten Blatt an, woher es stammt. Verlangt ein Mappentyp einen Stempel, tragen alle seine Dateien diesen Stempel; Bilder kommen dann als PDF. Das Original in Ablago bleibt immer unverändert. Was genau gestempelt wird, legt dein Administrator fest.

## Dateien ablegen

- **In „Neue Post“** legst du alles ab, was neu ankommt – auch viele Dateien auf einmal. Jede Datei wird eine eigene Post.
- **In einen Register-Ordner** einer Mappe legst du eine Datei, die schon zu dieser Mappe gehört. Sie wird ein Dokument im Register. Gibt es dort schon ein Dokument mit **gleichem Namen** und hat das Register [Versionen](versionen.md), entsteht eine **neue Version**. Ohne Versionen lehnt das Ablago ab – gib der Datei dann einen anderen Namen.
- Direkt in eine Mappe, in eine Ansicht oder unter „Ablage“ lässt sich nichts legen, und neue Ordner gehen nicht.
- **Löschen, Umbenennen und Verschieben** gehen über das Laufwerk (noch) nicht. Das machst du im Browser.
- **Gestempelte Dokumente** lassen sich über das Laufwerk nicht überschreiben – sonst käme der Stempel als neue Version zurück. Speichere deine Änderung unter einem neuen Namen oder lade die neue Version im Browser hoch. Mappen, deren Typ einen Stempel verlangt, sind im Laufwerk ganz schreibgeschützt.
- Hat dein Administrator das Laufwerk auf **nur lesend** gestellt, kannst du gar nichts ablegen; Explorer und Finder melden dann „Zugriff verweigert“ bzw. zeigen das Laufwerk schreibgeschützt.
- Dateien wie `desktop.ini`, `Thumbs.db` oder `.DS_Store`, die Windows und macOS selbst anlegen, nimmt Ablago still an und wirft sie weg.

## Wenn etwas nicht klappt

- **Anmeldung schlägt fehl:** Benutzername ist die E-Mail-Adresse, Passwort der API-Schlüssel (nicht dein Passwort). Ist der Schlüssel abgelaufen oder gelöscht, erzeuge einen neuen. Nach mehreren Fehlversuchen sperrt der Anmeldeschutz kurz.
- **Ablegen geht nicht:** Hat der Schlüssel nur **nur lesen**? Darfst du die Mappe ändern bzw. Post anlegen? Liegt die Datei in „Neue Post“ oder einem Register-Ordner?
- **Ordner fehlt:** Das Laufwerk zeigt höchstens 1000 Mappen je Ansicht. Nutze eine engere Ansicht oder die Suche im Browser.
- **„Zu viele Anfragen“:** Manche Programme durchsuchen ein Laufwerk sehr eifrig. Kurz warten genügt.
