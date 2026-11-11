# Fehlersuche und Support

Alles dazu steht in der Werkbank unter **Wartung und Fehlersuche**. Die Gruppe enthält Systemzustand, Protokoll, Gemeldete Fehler, Wartungsmodus, Wartungsoperationen und Demo-Daten. Diese Seite beschreibt die Werkzeuge zur Fehlersuche und die *Technik* (Version und Updates), die unter **Einstellungen** steht; [Systemzustand](speicherplatz.md), [Wartungsmodus](wartungsmodus.md), [Wartungsoperationen](texterkennung.md#wartungsoperationen) und [Demo-Daten](demo.md) haben eigene Seiten. Sicherung, Wiederherstellen und Vollexport stehen unter **Daten sichern**.

*Protokoll* und *Gemeldete Fehler* gehören zur Vorlage **Betrieb**. *Technik* steht in jeder Vorlage.

--8<-- "ausgeblendet-schritt.md"

## Gemeldete Fehler

Benutzer melden Fehler über **Fehler melden** in ihrem Menü – mit eigener Beschreibung, bis zu zwei Screenshots und technischen Angaben (Version, Browser, Bildschirmgröße, Sprache, Zeitzone, die letzten 25 besuchten Seiten, die letzten 10 Fehler im Browser und fehlgeschlagenen Anfragen). Passwörter, Inhalte von Mappen und Cookies gehen nicht mit. Die Meldung bleibt in deinem Ablago – sie geht nie an das Projekt. Wer daraus ein GitHub-Issue machen will, tut das selbst.

Lässt sich eine Seite nicht anzeigen, weil die Oberfläche beim Zeichnen auf einen Fehler stößt, erscheint statt einer leeren Seite „Hier ist etwas schiefgegangen“ mit **Neu laden** und **Fehler melden**. Wer angemeldet ist, kommt damit zu **Fehler melden**; ohne Anmeldung (etwa im Einrichtungsassistenten) kopiert der Knopf die technischen Angaben in die Zwischenablage, die Meldung selbst steht unter „Technische Angaben“.

![Werkbank → Gemeldete Fehler](bilder/werkbank-fehlermeldung.png)

Unter **Werkbank → Gemeldete Fehler** stehen die Meldungen, neueste zuerst; der Zähler in der Leiste und in der Übersicht nennt die offenen. In der Meldung siehst du Beschreibung, Screenshots und Angaben und kannst sie **als erledigt markieren** (und wieder öffnen) oder **löschen** – endgültig, samt Bildern. Eine Rückmeldung an den Benutzer gibt es in Ablago bewusst nicht; die erledigst du auf deinem Weg.

## Protokoll

**Werkbank → Protokoll** zeigt, was in Ablago passiert – die letzten 24 Stunden, höchstens 10.000 Einträge, die neuesten oben. Nach einem Neustart beginnt die Liste leer; dauerhaft steht alles in den Container-Logs.

![Protokoll](bilder/werkbank-protokoll.png)

Jeder Eintrag gehört zu einem **Modul**, etwa *Benutzerkonten und Anmeldung* (`konto`) für Anmeldungen und gesperrte Konten oder *Sicherung* (`sicherung`). Welche Module es gibt, steht unter [Technik → Module](technik.md#module).

Filtern lässt sich nach Stufe, Modul, Benutzer und Text; **Live** aktualisiert die Liste alle zwei Sekunden. Ein Klick auf einen Eintrag zeigt alle Daten dazu, auch Benutzer und Anfrage-Kennung.

### Debug-Modus

Schaltet für **eine Stunde** zusätzliche, ausführliche Meldungen ein – etwa jede einzelne Datenbankabfrage. Danach (oder nach einem Neustart) ist er von selbst wieder aus. Die Grundstufe stellt `LOG_LEVEL` ein (siehe [Installation](installation.md#einstellungen)).

### Container-Logs

Jede Meldung steht als lesbare Zeile in den Logs des Containers:

```text
2026-10-28T09:12:33.120Z INFO  [ablage] Mappe angelegt benutzer=lena@example.org typ=Rechnung titel="R-17 vom 01.10.2026"
```

```sh
docker logs <app-container>
```

## Datenbank

Lange Datenbankzugriffe und Anfragen, die **Auslastung des Servers** und was gerade in der Datenbank läuft stehen unter **Werkbank → Einstellungen → Datenbank-Anbindung**, unter der Verbindung – siehe [Lange Datenbankzugriffe](installation.md#lange-datenbankzugriffe). Wirkt Ablago langsam, schau dort zuerst nach – und unter **Wartung und Fehlersuche → [Systemzustand](speicherplatz.md#auslastung)**, wie ausgelastet CPU, Arbeitsspeicher und Netzwerk sind.

Einträge, die mit **Anfrage:** beginnen, betreffen eine ganze Anfrage; aufgeklappt zeigen sie die **Aufteilung**: Warten vor dem Handler, Datenbank (mit Anzahl der Zugriffe), Rechte, Aufbereitung und JSON. Einzelheiten zur selben Zeit stehen im [Protokoll](#protokoll) (Modul *datenbank*).

**Auslastung des Servers:** Ablago arbeitet Anfragen auf einem Faden ab. Rechnet eine Anfrage lange, warten alle anderen so lange. Die Werte zeigen, wie lange in der letzten Minute üblicherweise, in 99 % der Fälle und höchstens gewartet wurde. Unter 50 ms ist unauffällig; ab 100 ms (99 %) erscheint ein Hinweis.

## Zeitmessung (Entwicklermodus)

Wirkt eine Seite langsam, schalte unter **Mein Konto** den **Entwicklermodus** ein. Dann zeigt Ablago unten rechts bei jedem Seitenaufruf je Anfrage, wo die Zeit geblieben ist, oben die Summe über alle Anfragen der Seite. Er gilt nur für dein Konto.

| Abschnitt | Was es ist |
|---|---|
| Warten (Browser) | Die Anfrage wartet im Browser. Er schickt höchstens etwa 6 Anfragen gleichzeitig an einen Server, die übrigen warten. |
| Leitung | Hin- und Rückweg ohne die Zeit im Server – eine Näherung. Sie enthält auch das Warten, bevor der Server die Anfrage überhaupt annimmt; ist er beschäftigt, zeigt das die **Auslastung** unter Werkbank → Datenbank. |
| Warten (Server) | Vom Eingang im Server bis zur Bearbeitung, z. B. Körper der Anfrage lesen. |
| Rechte | Berechtigungen auswerten (Zugriff bilden, Lesefilter, Rechte je Mappe), ohne die Datenbankzugriffe darin. |
| Datenbank | Anzahl und Dauer der Datenbankzugriffe. |
| Aufbereitung | Die übrige Zeit im Server. |
| JSON | Die Antwort im Server in Text umwandeln. |
| Übertragung, Auswerten, Darstellung | Antwort senden, im Browser lesen und zeichnen. |
| Externe Dienste | Worauf der Server in dieser Anfrage gewartet hat: KI-Dienst (mit Paket), Postfach, Versand, Anmeldeanbieter oder das Netz eines Pakets – je Aufruf die Zeit bis zur ersten Antwort, die Gesamtdauer, die Größe und ob es ein Fehler oder eine Zeitüberschreitung war. Die Zeit ist ein Teil von *Aufbereitung*. Bei „Frag deine Ablage“ steht sie als eigene Zeile, sobald die Antwort fertig ist. |

Die Werte kommen vom Server im Header `Server-Timing` (`vor`, `app`, `db`, `rechte`, `json`, `gesamt`, bei externen Diensten `extern` mit Summe und Anzahl und je Aufruf `extern-1` …) und aus der Zeitmessung des Browsers. Was in der letzten Stunde bzw. den letzten 24 Stunden auf externe Dienste entfiel, zeigt [Systemzustand → Externe Dienste](speicherplatz.md#externe-dienste). Bei den Zahlen der Ansichten (`/api/sichten`) steht dort zusätzlich `zs`: `treffer`, wenn sie aus dem Zwischenspeicher kamen, `neu`, wenn sie gezählt wurden – gezählt wird nach jeder Änderung im Haushalt, sonst spätestens nach 5 Minuten (Ansichten mit Datumsbezug) bzw. 30 Minuten und um Mitternacht.

### Liegt es am Zwischenspeicher? { #zwischenspeicher }

Damit Ablago auch bei vielen Mappen und vielen gleichzeitigen Änderungen flüssig bleibt, merkt es sich teure Ergebnisse: die Zahlen je Mappentyp und Ansicht, die Zahl der Treffer einer Liste und die Termine in *Zu erledigen* und auf der Startseite (#918). Der Grundsatz dabei: **Nachhinken ja, falsch nie.**

- Was du selbst änderst, siehst du sofort – auch wenn Ablago mit [mehreren Prozessen](technik.md#mehrere-prozesse) läuft.
- Ändert jemand anderes etwas, können die Zahlen der Ablage bei dir einige Sekunden später nachziehen. Die Zahl der Treffer einer Liste ist immer genau.
- Ein Stern (Favorit), eine Notiz, die Historie und „gesehen“ rechnen die Zahlen je Mappentyp und Ansicht nicht neu.
- Die Termine wiederkehrender Fristen rechnet Ablago bei jedem Abruf aus Datum und Rhythmus des Mappentyps; ein Vorfilter in der Datenbank sucht nur die Mappen heraus, die im Zeitraum einen Termin haben können. Es gibt keinen nächtlichen Lauf, von dem die Termine abhängen.

Zeigt Ablago eine Zahl oder einen Termin, die dauerhaft nicht stimmen, setze im Container die Variable `DMS_ZWISCHENSPEICHER=aus` und starte neu. Dann rechnet Ablago alles bei jeder Anfrage frisch – langsamer, aber ohne Zwischenspeicher. **Werkbank → Wartung und Fehlersuche → Systemzustand** zeigt dann einen Hinweis, ebenso der Lasttest-Bericht. Stimmt es jetzt, lag es am Zwischenspeicher: Bitte als [Issue](https://github.com/motom001/dms/issues/new?template=fehler.md) melden, mit dem, was du getan hast und was zu sehen war. Danach die Variable wieder entfernen.

## Technik

**Werkbank → Wartung und Fehlersuche → Systemzustand → Version und Updates** zeigt im Abschnitt **Installiert** (unter *Neuere Versionen*), was installiert ist: Version und Stand von Ablago, Laufzeit (Node.js, Betriebssystem), Datenbank, Bibliotheken und Oberfläche.

![Technik und Versionen](bilder/werkbank-technik.png)

- **Für den Support:** Übersicht kopieren und in ein [GitHub-Issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) einfügen. Passwörter und Zugangsdaten stehen nicht darin.
- **Neuere Versionen:** Ein Knopfdruck fragt nach, ob es neuere Versionen gibt – bei GitHub für Ablago, bei endoflife.date für Node.js, PostgreSQL und Alpine, bei npm für die Bibliotheken. Ohne Knopfdruck fragt Ablago nirgends nach. Bei Ablago selbst steht unter *Aktuell* die neueste stabile Version mit Datum – die, auf die `:stabil` zeigt (sie wandert einmal pro Woche, siehe [Welches Image-Tag?](aktualisieren.md#image-tag)); „neuer“ heißt es erst bei einer neuen stabilen Version. Läuft schon ein neuerer Stand (`:main` oder eine höhere feste Nummer) und liegen auf `main` weitere Änderungen, nennt sie der Hinweis.

Wie die Bausteine zusammenhängen, beschreibt [Technik](technik.md).

## Typische Probleme

??? question "Nach dem Update startet der Container nicht."
    Im Container-Log steht der Grund, meist eine Migration oder eine fehlende Datenbankverbindung. Die Migrationen laufen in einer Transaktion – die Datenbank ist dabei unverändert geblieben. Notfalls auf die vorherige Version zurück (Image-Tag) und ein Issue mit dem Log anlegen.

??? question "dms-komplett startet nicht, im Protokoll steht „kann nicht in /data/postgres/daten schreiben“."
    Der Container richtet die Rechte des Datenbank-Ordners beim Start selbst, auch bei `000` auf dem NAS. Klappt das nicht (Netzwerkfreigabe, ACLs), bricht er mit dieser Meldung ab. Was zu tun ist, steht unter [Der Container startet nicht](https://help.ablago.app/installieren/aktuell/komplett/#container-startet-nicht) im Installationshandbuch – dort auch, warum `stop_grace_period: 60s` in der Compose-Datei nicht fehlen darf.

??? question "Rote Meldung: „Die Datenbank liegt nur im Container …“"
    Bei dms-komplett fehlt in der Compose-Datei die Zeile für `/data/postgres`. Erst die Daten retten (`docker compose stop`, nicht `down`, dann `docker cp`), dann die Zeile eintragen – Schritt für Schritt unter [Datenbank aus dem Container retten](https://help.ablago.app/installieren/aktuell/komplett/#datenbank-retten).

??? question "Nach dem Update ist die Seite leer oder zeigt längst behobene Fehler."
    Dann läuft im Browser noch die Oberfläche der alten Version gegen den neuen Server. Ablago erkennt das auf allen Seiten – auch beim Anmelden und im Einrichtungsassistenten – und zeigt oben „Eine neue Version ist da“ mit **Seite neu laden**; der Einrichtungsassistent lädt sich selbst neu (eingegebene Passwörter musst du dann noch einmal eingeben). Fehlt eine Datei der Oberfläche, antwortet Ablago mit „nicht gefunden“ (404). Hilft das nicht, lade die Seite ohne Zwischenspeicher neu (meist Strg+Umschalt+R bzw. Cmd+Umschalt+R).

??? question "E-Mails kommen nicht an."
    Unter **Werkbank → E-Mail und Adresse** zuerst **Verbindung prüfen**, dann **Testmail senden** – darunter steht die Meldung des Mailservers. Typisch: falsches Passwort (bei vielen Anbietern braucht es ein App-Passwort), Verbindungsart passt nicht zum Port (STARTTLS ↔ 587, SSL/TLS ↔ 465), Port vom Netz gesperrt. Im Protokoll (Modul `mail`) steht jeder Versand mit Fehler. Auch im Spam-Ordner nachsehen.

??? question "Ablago ist zäh, während jemand exportiert oder viele PDFs bearbeitet."
    Schwere Arbeiten laufen in eigenen [Arbeitern](speicherplatz.md#arbeiter-fur-pdf-und-exporte) (#542); andere Benutzer sollten davon kaum etwas merken. Unter **Werkbank → Systemzustand → Auslastung** siehst du, ob die Arbeiter beschäftigt sind, wie viele Aufträge warten und wie hoch die **Wartezeit des Servers** ist. Ist die CPU des Containers dauerhaft am Anschlag, fehlen Kerne – gib dem Container mehr (`cpus:`) oder setze `DMS_ARBEITER` niedriger, damit Anfragen und Datenbank mehr Rechenzeit bekommen. Steht im Protokoll „Hohe Wartezeit des Servers“, obwohl die Arbeiter nichts tun, rechnet etwas im Hauptfaden: Bitte als Issue melden, mit dem Protokolleintrag.

??? question "Eine PDF-Bearbeitung oder ein Export bricht mit „dauerte länger als 10 Minuten“ oder „mehr Arbeitsspeicher als erlaubt“ ab."
    Ein Auftrag im Arbeiter darf höchstens 10 Minuten dauern und 1,5 GB Arbeitsspeicher belegen – damit ein einzelnes riesiges PDF Ablago nicht lahmlegt. Exportiere weniger Mappen auf einmal oder teile ein großes PDF vorher („Seiten“). Läuft der Arbeiter an der Grenze des Containers (`mem_limit`), hilft mehr Arbeitsspeicher für den Container.

??? question "Links in E-Mails zeigen auf localhost."
    Unter **Werkbank → E-Mail und Adresse** die Adresse eintragen, unter der Benutzer Ablago aufrufen.

??? question "Anmeldung klappt hinter dem Proxy nicht."
    Ist die Adresse von Ablago (Werkbank → E-Mail und Adresse) eine `https://`-Adresse, wird das Sitzungs-Cookie nur über HTTPS gesetzt. Rufe Ablago dann auch über HTTPS auf. Steht `TRUST_PROXY` auf `false` oder auf einer Liste, die den Proxy nicht enthält, glaubt Ablago dem Proxy nicht, dass die Verbindung HTTPS ist – dann die Variable entfernen. Siehe [Hinter einem Reverse-Proxy](installation.md#hinter-einem-reverse-proxy).

??? question "Im Protokoll und bei den Sitzungen steht immer dieselbe IP-Adresse."
    Das ist die Adresse des Reverse-Proxys: Ablago glaubt seinen Angaben nicht. Unter **Technik** nachsehen, was bei `TRUST_PROXY` steht. Hat der Proxy eine öffentliche Adresse, kann `TRUST_PROXY` auf diese Adresse oder auf `true` gesetzt werden – mehr unter [Was der Proxy Ablago mitteilt](installation.md#was-der-proxy-dem-dms-mitteilt).

??? question "Hochladen großer Dateien bricht ab."
    Den Reverse-Proxy größere Anfragen erlauben, z. B. bei nginx `client_max_body_size 260m;`. Ablago nimmt Dokumente bis 100 MB, Pakete bis 128 MB und Sammeldateien bis 256 MB an; die Grenze im Proxy sollte etwas darüber liegen. Alle Grenzen: [Technik → Grenzen](technik.md#grenzen).

??? question "Die Oberfläche ist nach einer Design-Änderung unbedienbar."
    `?design=standard` an die Adresse hängen, siehe [Designs](designs.md#eigenes-css).

??? question "Ein Benutzer meldet einen Fehler, den ich nicht nachvollziehen kann."
    [Als dieser Benutzer anmelden](benutzer.md#fehler-nachstellen) und es dort nachstellen.
