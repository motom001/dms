# Als Laufwerk einbinden

Du arbeitest lieber mit dem Explorer, dem Finder oder der Dateien-App? Dann binde die Ablage des DMS als **Laufwerk** ein. Du blätterst durch Ansichten, Mappen und Register wie durch Ordner, öffnest Dokumente mit jedem Programm und legst neue Post einfach hinein – per Ziehen oder „Sichern unter“.

!!! note "Erst einschalten lassen"
    Das Laufwerk ist im DMS zunächst **ausgeschaltet**. Dein Administrator schaltet es in der Werkbank ein und nennt dir die Adresse, etwa `https://dms.example.org/webdav/`.

## Was du brauchst

1. **Die Adresse:** die Adresse deines DMS mit `/webdav/` am Ende, z. B. `https://dms.example.org/webdav/`.
2. **Einen API-Schlüssel:** Unter **Profil → Sicherheit → API-Schlüssel** erzeugst du einen neuen Schlüssel, z. B. „Laptop“. Wähle **lesen und schreiben**, wenn du Dateien ablegen willst. Kopiere den Schlüssel gleich – er ist nur jetzt ganz zu sehen.
3. Beim Verbinden ist der **Benutzername deine E-Mail-Adresse** und das **Passwort der Schlüssel** (beginnt mit `dms_`). Dein normales Passwort funktioniert hier absichtlich nicht.

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

1. Öffne die App **Dateien** und tippe unten auf **Durchsuchen**.
2. Tippe oben rechts auf **…** (Mehr) und dann auf **Mit Server verbinden**.
3. Trage die Adresse ein: `https://dms.example.org/webdav/` und tippe auf **Verbinden**.
4. Wähle **Registrierter Benutzer**, trage deine E-Mail-Adresse und den API-Schlüssel ein und tippe auf **Weiter**.

Das Laufwerk steht danach in der Dateien-App unter **Geteilt**. Aus jeder App kannst du mit **Teilen → In Dateien sichern** direkt in „Neue Post“ ablegen.

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

Doppelklick öffnet das Dokument mit dem passenden Programm. Das geht nur bei Mappen, die du auch **exportieren** darfst (wie beim Export und beim Versenden per E-Mail) – sonst lehnt das DMS ab, und dein Programm meldet einen Fehler. Im Browser kannst du solche Dokumente weiterhin ansehen.

## Dateien ablegen

- **In „Neue Post“** legst du alles ab, was neu ankommt – auch viele Dateien auf einmal. Jede Datei wird eine eigene Post.
- **In einen Register-Ordner** einer Mappe legst du eine Datei, die schon zu dieser Mappe gehört. Sie wird ein Dokument im Register. Gibt es dort schon ein Dokument mit **gleichem Namen** und hat das Register [Versionen](versionen.md), entsteht eine **neue Version**. Ohne Versionen lehnt das DMS ab – gib der Datei dann einen anderen Namen.
- Direkt in eine Mappe, in eine Ansicht oder unter „Ablage“ lässt sich nichts legen, und neue Ordner gehen nicht.
- **Löschen, Umbenennen und Verschieben** gehen über das Laufwerk (noch) nicht. Das machst du im Browser.
- Dateien wie `desktop.ini`, `Thumbs.db` oder `.DS_Store`, die Windows und macOS selbst anlegen, nimmt das DMS still an und wirft sie weg.

## Wenn etwas nicht klappt

- **Anmeldung schlägt fehl:** Benutzername ist die E-Mail-Adresse, Passwort der API-Schlüssel (nicht dein Passwort). Ist der Schlüssel abgelaufen oder gelöscht, erzeuge einen neuen. Nach mehreren Fehlversuchen sperrt der Anmeldeschutz kurz.
- **Ablegen geht nicht:** Hat der Schlüssel nur **nur lesen**? Darfst du die Mappe ändern bzw. Post anlegen? Liegt die Datei in „Neue Post“ oder einem Register-Ordner?
- **Ordner fehlt:** Das Laufwerk zeigt höchstens 1000 Mappen je Ansicht. Nutze eine engere Ansicht oder die Suche im Browser.
- **„Zu viele Anfragen“:** Manche Programme durchsuchen ein Laufwerk sehr eifrig. Kurz warten genügt.
