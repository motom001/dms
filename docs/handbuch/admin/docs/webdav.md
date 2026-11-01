# WebDAV-Laufwerk

Mit dem **WebDAV-Laufwerk** binden Benutzer die Ablage des DMS wie ein Netzlaufwerk ein – im Windows-Explorer, im Finder auf dem Mac und in der Dateien-App auf iPhone und iPad. Sie blättern durch Ansichten, Mappen und Register, öffnen Dokumente und legen neue Dateien einfach hinein. Wie Benutzer das Laufwerk einbinden, steht im Benutzerhandbuch unter [Als Laufwerk einbinden](https://motom001.github.io/dms/benutzer/aktuell/laufwerk/).

Das ist **Stufe 1: lesen und ablegen**. Löschen, Umbenennen, Verschieben und das direkte Bearbeiten von Office-Dateien kommen später.

## Einschalten

Unter **Werkbank → WebDAV-Laufwerk**:

- **WebDAV-Laufwerk einschalten** – Standard: **aus**. Ausgeschaltet antwortet das DMS unter `/webdav/` mit „nicht gefunden“, als gäbe es das Laufwerk nicht.
- **Stand** – die Adresse zum Einbinden (die Adresse des DMS aus *E-Mail und Adresse* plus `/webdav/`), die Zahl der Anfragen seit dem Start und die Grenze je Benutzer.
- **Letzte Zugriffe** – ganz unten auf der Seite die letzten 50 Anfragen mit Methode, Pfad, Zeit, Benutzer und Ergebnis (HTTP-Status, Fehler rot), neueste oben. Der Abschnitt hat eine feste Höhe für etwa zehn Einträge; ältere erreichst du durch Scrollen. Die Zugriffe stehen nur im Arbeitsspeicher; nach einem Neustart ist die Liste leer.

## Voraussetzungen

!!! warning "Nur über HTTPS"
    Schalte das Laufwerk nur ein, wenn das DMS über **HTTPS** erreichbar ist. Benutzername und API-Schlüssel gehen bei jeder Anfrage mit (HTTP Basic) – ohne HTTPS offen lesbar im Netz. **Windows** bindet ein Laufwerk mit Anmeldung über reines HTTP ohnehin nicht ein. Die Werkbank warnt, wenn die Adresse des DMS nicht mit `https://` beginnt.

- **Anmeldung mit API-Schlüssel:** Jeder Benutzer erzeugt sich unter **Profil → Sicherheit → API-Schlüssel** einen eigenen Schlüssel, am besten einen je Gerät („Laptop Thomas“). Benutzername ist die E-Mail-Adresse, Passwort der Schlüssel. Das **Passwort des Benutzers wird nie angenommen** – so bleibt die Zwei-Faktor-Anmeldung wirksam, und ein verlorenes Gerät sperrst du, indem du nur seinen Schlüssel löschst.
- Zum **Ablegen** braucht der Schlüssel das Recht **lesen und schreiben**; mit **nur lesen** kann man blättern und öffnen, aber nichts hineinlegen.
- **Administratoren** bekommen keine API-Schlüssel und können das Laufwerk darum nicht benutzen. Für die tägliche Arbeit haben sie ohnehin ein normales Benutzerkonto.

## Hinter einem Reverse-Proxy

WebDAV benutzt außer GET und PUT eigene HTTP-Methoden: **OPTIONS, PROPFIND, PROPPATCH, LOCK, UNLOCK** (und MKCOL, DELETE, MOVE, COPY, die das DMS in Stufe 1 freundlich ablehnt). Der Reverse-Proxy muss sie unverändert an das DMS durchreichen, ebenso die Kopfzeilen `Authorization`, `Depth`, `Destination`, `If`, `Lock-Token` und `Overwrite`.

- **Nginx Proxy Manager, nginx, Caddy, Traefik:** reichen beliebige Methoden von sich aus durch. Prüfe nur, dass keine Regel Methoden einschränkt (z. B. `limit_except` in nginx) und die erlaubte Größe einer Anfrage zum Hochladen passt – das DMS nimmt Dateien bis **100 MB** an (`client_max_body_size 100m;` in nginx).
- **Proxy des NAS:** Bei manchen Geräten gibt es eine Einstellung für „WebDAV“ oder erlaubte Methoden. Antwortet das Laufwerk mit 405 oder 501, blockiert meist der Proxy.
- Eine **Web Application Firewall** (z. B. bei Tunnel- oder Cloud-Diensten) blockiert PROPFIND manchmal. Dann für den Pfad `/webdav/` eine Ausnahme einrichten.

## Was im Laufwerk zu sehen ist

```
Neue Post/                      hineinlegen = neue Post
Ablage/
  <Ansicht>/
    <Mappe>/
      <Register>/               Dokumente des Registers; hineinlegen = neues Dokument
      Verknüpft/
        <verknüpfte Mappe>/     mit ihren Registern, aber ohne weiteres „Verknüpft“
```

- **Rechte wie in der Oberfläche:** nur Ansichten und Mappen, die der Benutzer lesen darf. **Herunterladen** (Dokument öffnen) nur mit dem **Exportrecht E** an einer Ansicht, die die Mappe zeigt – wie Exportieren und Versenden. Ohne Exportrecht sieht man die Datei mit Größe und Datum, kann sie aber nicht öffnen.
- **Alle Ansichten** stehen nebeneinander unter `Ablage/`, auch Unteransichten.
- **Ordner- und Dateinamen** kommen aus den Titeln der Mappen und den Namen von Registern und Dokumenten. Zeichen, die Windows oder macOS nicht mögen (`\ / : * ? " < > |`, Steuerzeichen, Punkt oder Leerzeichen am Ende), werden zu `_`. Gibt es einen Titel mehrmals, bekommt jede Mappe ihren Kurzcode dazu, z. B. `V-1 (3fa85f)` – so bleibt der Name stabil, auch wenn weitere Mappen hinzukommen.
- **Höchstens 1000 Mappen** je Ansichtsordner. Für sehr große Ansichten lieber eine engere Unteransicht anlegen.
- **„Verknüpft“** zeigt Mappen, auf die die Mappe verweist und die auf sie verweisen – nur **eine Ebene** tief. So laufen Such- und Sicherungsprogramme nicht endlos im Kreis.

## Was beim Ablegen passiert

- **In „Neue Post“:** Jede Datei wird eine eigene Post mit Kanal *WebDAV*, Richtung eingehend, Stand *Neu*. Der Betreff ist der Dateiname ohne Endung, angelegt hat sie der Benutzer. Ob er Post anlegen darf, regeln die [Berechtigungen](berechtigungen.md).
- **In einen Register-Ordner:** Die Datei wird ein Dokument in diesem Register (Recht *Ändern* an der Mappe nötig). Gibt es dort schon ein Dokument mit **gleichem Namen**, entsteht bei eingeschalteter [Versionierung](mappentypen.md) eine **neue Version** – immer genau des Dokuments, das hinter dem Dateinamen im Laufwerk steht, auch wenn zwei Dokumente ähnlich heißen; ohne Versionierung lehnt das DMS ab, damit nichts überschrieben wird.
- **Anderswo** (z. B. direkt in einer Mappe oder unter `Ablage/`) lässt sich nichts ablegen. Neue Ordner anlegen geht nicht.
- **Hilfsdateien** der Betriebssysteme (`desktop.ini`, `Thumbs.db`, `.DS_Store`, `._…`, `~$…`) nimmt das DMS still an und verwirft sie, ohne sie zwischenzuspeichern.
- **Höchstens drei Uploads gleichzeitig** je Benutzer; beim vierten antwortet das DMS kurz mit 503, und Explorer bzw. Finder versuchen es gleich noch einmal.
- Größe bis **100 MB** je Datei; die [Speicherplatz](speicherplatz.md)-Grenze gilt wie beim Hochladen.
- Im [Wartungsmodus](wartungsmodus.md) antwortet das Laufwerk mit 503, wie die Schnittstelle.

## Schutz

- **Fehlversuche** beim Anmelden zählen im [Anmeldeschutz](anmeldeschutz.md) wie falsche Passwörter: zu viele, und Konto bzw. IP-Adresse sind gesperrt. Gehört die E-Mail-Adresse zu einem Benutzer, kommt bei einer Kontosperre auch die Sofortmeldung per E-Mail.
- **Dienstkonten** von Paketen haben zwar API-Schlüssel, kommen aber nie in das Laufwerk.
- **Ratenbegrenzung:** höchstens 600 Anfragen je Benutzer und Minute; darüber antwortet das DMS kurz mit 429. Explorer und Finder fragen beim Blättern viel, Vorschau- und Suchdienste noch mehr – die Grenze bremst nur Ausreißer.
- **Nur eine Ebene je Abruf:** Anfragen über den ganzen Baum (`Depth: infinity`) lehnt das DMS ab.
- **Sperren:** Windows und macOS „sperren“ eine Datei, bevor sie sie hochladen, und macOS bindet ein Laufwerk ohne Sperren nur lesend ein. Das DMS beantwortet solche Sperren in Stufe 1 nur zum Schein – und nur dort, wo Ablegen erlaubt ist. Echte Sperren gegen gleichzeitiges Überschreiben kommen mit dem Bearbeiten von Office-Dateien.
- **Protokoll:** Abgelegte Dateien und neue Post stehen auf Stufe *Info* im [Protokoll](fehlersuche.md#protokoll), abgelehnte Anmeldungen ebenfalls; reine Lesezugriffe nur auf Stufe *Debug*.
- Dokumente werden immer als **Download** ausgeliefert (nie im Browser ausgeführt). Der **ETag** eines Dokuments ist nicht der Prüfwert seines Inhalts – wer nur lesen darf, kann darüber nicht prüfen, ob eine Datei einen bestimmten Inhalt hat.

!!! warning "Abgelaufener oder gelöschter Schlüssel kann die IP-Adresse sperren"
    Läuft ein API-Schlüssel ab oder löschst du ihn, merken Explorer und Finder das nicht: Sie versuchen es im Hintergrund immer wieder mit dem alten Schlüssel. Jeder Versuch ist ein Fehlversuch im [Anmeldeschutz](anmeldeschutz.md) – nach einer Weile ist erst das Konto von dieser IP-Adresse und dann die **ganze IP-Adresse** gesperrt. Kommen alle Geräte des Haushalts über dieselbe öffentliche Adresse (NAT, Router), kann sich dann eine Zeit lang auch niemand mehr **mit Passwort** im Browser anmelden.

    - Bevor ein Schlüssel abläuft oder du ihn löschst: das Laufwerk auf dem Gerät trennen (Windows: *Netzlaufwerk trennen*; Mac: *Auswerfen*) und mit einem neuen Schlüssel neu verbinden.
    - Ist es schon passiert: Gerät trennen bzw. mit neuem Schlüssel verbinden, dann unter **Werkbank → Anmeldeschutz** die Adresse **entsperren** (siehe [Gesperrte Adressen](anmeldeschutz.md#gesperrte-adressen)). Für das Heimnetz lässt sich dort eine [Ausnahme](anmeldeschutz.md#ausnahmen) eintragen – sie wirkt aber nur auf Adressen, die das DMS direkt sieht, nicht auf eine gemeinsame öffentliche Adresse von außen.

!!! tip "Lieber nicht im Internet?"
    Wer das Laufwerk nur zu Hause braucht, kann im Reverse-Proxy `/webdav/` auf das Heimnetz beschränken (z. B. in Nginx Proxy Manager mit einer Access List).
