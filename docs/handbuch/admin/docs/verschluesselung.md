# Verschlüsselung

Passwörter und andere Geheimnisse, die Ablago speichert, liegen verschlüsselt in der Datenbank. Den Schlüssel dazu hält Ablago in einer **eigenen Datei**, nie in der Datenbank. Eine Datenbanksicherung allein verrät damit keine Geheimnisse.

Was genau verschlüsselt ist, zeigt die Seite unter [Was verschlüsselt ist](#was-verschlusselt-ist) mit der Anzahl je Art. Hier – und nur hier – lädst du auch das [Notfallblatt](#notfallblatt) mit dem Schlüssel und dem Notfallcode herunter.

![Werkbank → Verschlüsselung](bilder/werkbank-verschluesselung.png)

## Was verschlüsselt ist

Der Abschnitt **Was verschlüsselt ist** zählt jede Art verschlüsselter Werte – auch mit 0, damit du siehst, was dazugehört:

| Art | Wo du sie einträgst |
| --- | --- |
| **Passwortfelder in Mappen** | [Passwortfelder](mappentypen.md#passwortfelder) in der Ablage |
| **Passwortfelder im Papierkorb** | gelöschte Mappen im [Papierkorb](papierkorb.md) |
| **E-Mail-Versand** (Passwort des Mailservers) | **Werkbank → E-Mail und Adresse** |
| **Postfächer (IMAP-Passwort)** | [Postfächer](postfaecher.md) mit Anmeldung per Passwort |
| **Postfächer (OAuth: App-Geheimnis)** | das Client-Secret der App beim Anbieter, unter [Postfächer](postfaecher.md) |
| **Postfächer (OAuth-Anmeldung)** | Zugriffs- und Aktualisierungstoken nach der Anmeldung beim Anbieter |
| **Anmeldung über einen Anbieter (OIDC)** | das Client-Secret unter [Anmeldeschutz](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) |
| **Zwei-Faktor-Anmeldung** | das Geheimnis jedes Benutzers, der die [Zwei-Faktor-Anmeldung](anmeldeschutz.md#zwei-faktor-anmeldung) eingerichtet hat |
| **Paket-Einstellungen (Geheimnisse)** | Felder vom Typ Geheimnis in den Einstellungen von [Paketen](pakete.md) |
| **Aufrufe von außen (Geheimnis für die Signatur)** | das Geheimnis jeder Adresse für den [Aufruf von außen](automatisierungen.md#aufruf-von-aussen); ist es nicht lesbar, in der Automatisierung **Neues Geheimnis** wählen und beim Aufrufer eintragen |
| **URL aufrufen (Geheimnis für die Signatur)** | das Geheimnis einer Karte [URL aufrufen](automatisierungen.md#url-aufrufen); ist es nicht lesbar, an der Karte **Neues Geheimnis** wählen und beim Empfänger eintragen |

Ist ein Wert mit dem vorhandenen Schlüssel nicht lesbar, steht daneben „… nicht lesbar“; welcher es ist, steht darunter unter *Nicht lesbare oder unverschlüsselte Werte*. Taucht eine Zeile **Weitere Einstellungen** auf, kennt die Anzeige diese Art noch nicht – verschlüsselt und beim Wechsel mitgenommen wird sie trotzdem; melde sie gern als Fehler.

Die [Sicherungen](sicherung.md) verschlüsselt Ablago mit einem Schlüssel, der aus diesem abgeleitet ist; sie stehen nicht in der Liste.

## Schlüssel erzeugen

1. In der Compose-Datei muss der Ordner `/data/geheim` ein eigenes Volume sein (siehe [Installation](installation.md)), z. B.
   ```yaml
   - /volume1/docker/dms/geheim:/data/geheim
   ```
2. **Werkbank → Verschlüsselung → Schlüssel erzeugen.** Ein Neustart ist nicht nötig.

Danach zeigt die Seite den Zustand **vorhanden** und den **Fingerabdruck** des Schlüssels (z. B. `5E27-9473-05C5-D6A0`). Solange kein Schlüssel da ist, steht über der ganzen Werkbank ein Hinweis, und es lassen sich keine Passwörter speichern.

!!! warning "Schlüssel getrennt sichern"
    Kopiere die Datei `geheim/dms.schluessel` an einen sicheren Ort, getrennt von der Datenbanksicherung. Eine Datenbank lässt sich nur mit diesem Schlüssel vollständig wiederherstellen – ohne ihn sind die Passwörter darin nicht mehr lesbar.

Die Seite prüft auch, ob der Ordner wirklich ein eigenes Volume ist. Wenn nicht, weist sie darauf hin: Ohne Volume wäre die Datei weg, sobald der Container neu erstellt wird (z. B. beim Update).

## Schlüssel wechseln

Könnte der Schlüssel bekannt geworden sein – etwa weil ein ausgedrucktes Notfallblatt verloren ging – oder willst du ihn turnusmäßig erneuern: **Werkbank → Verschlüsselung → Schlüssel wechseln.** Bei einem Sicherheitsvorfall sperrst du vorher mit [Jetzt sofort sperren](wartungsmodus.md#jetzt-sofort-sperren) alle anderen aus.

![Schlüssel gewechselt](bilder/werkbank-schluesselwechsel.png)

Nach einer Rückfrage – zur Sicherheit tippst du dort das Wort **wechseln** ein –

1. erzeugt Ablago einen neuen Schlüssel,
2. verschlüsselt alle Geheimnisse in der Datenbank **ganz oder gar nicht** neu; bricht dabei etwas ab, gilt weiter der bisherige Schlüssel. Dazu gehört alles unter [Was verschlüsselt ist](#was-verschlusselt-ist): Passwortfelder in Mappen und im Papierkorb, Mailserver, Postfächer (IMAP-Passwort, OAuth-App und OAuth-Anmeldung), Client-Secret des Anbieters, Zwei-Faktor-Geheimnisse und Paket-Geheimnisse,
3. setzt das Prüfwort neu und
4. ersetzt die Schlüsseldatei. Der alte Schlüssel wird nicht aufbewahrt.

Werte, die schon vorher nicht lesbar waren, bleiben, wie sie sind; Ablago sagt, wie viele es sind. Der Wechsel steht im Protokoll mit altem und neuem Fingerabdruck (ohne Schlüssel). Während einer Sicherung lässt sich nicht wechseln.

**Danach:**

Die Seite zeigt die beiden nächsten Schritte mit je einem Knopf; ein erledigter Schritt bekommt ein Häkchen:

- **Neues Notfallblatt herunterladen** – der Knopf **Notfallblatt herunterladen** lädt das PDF direkt herunter (wie der Knopf im Abschnitt [Notfallblatt](#notfallblatt) darunter). Bis dahin weisen Übersicht und Sicherung darauf hin.
- **Neue Sicherung anlegen** – mit **Jetzt sichern**.
- **Ältere Sicherungen** bleiben mit dem alten Schlüssel verschlüsselt. Die Liste unter [Sicherung](sicherung.md) kennzeichnet sie mit „früherer Schlüssel“. Zum [Wiederherstellen](wiederherstellen.md) einer solchen Sicherung fragt Ablago nach dem Schlüssel vom alten Notfallblatt. Bewahre es auf, solange du diese Sicherungen brauchst – oder lösche sie mit **Sicherungen mit früherem Schlüssel löschen**.

!!! warning "Schlüsseldatei-Kopien"
    Hast du die Datei `geheim/dms.schluessel` irgendwo kopiert, ersetze die Kopie durch die neue Datei.

## Notfallblatt

Im Abschnitt **Notfallblatt** dieser Seite erzeugt **Notfallblatt herunterladen** ein PDF mit allem, was du nach einem Ausfall brauchst – auf **einer Seite A4** in Ablago-Optik, auch in Schwarzweiß gut lesbar:

1. **Kopf:** Logo, Name deiner Ablage, Datum und Ablago-Version.
2. **Schlüssel:** groß in Vierergruppen zum Abtippen, dazu sein **Fingerabdruck**. Die Null ist durchgestrichen, und unter leicht verwechselbaren Zeichen (`0` und `O`, `l`, `I` und `1`, `-` und `_`) steht klein, welches gemeint ist. Einen QR-Code mit dem Schlüssel gibt es bewusst nicht – das wäre ein Weg mehr, an ihn zu kommen.
3. **Diese Ablage:** Adresse, **Ablage-Id** und in einem Satz, wo die Sicherungen liegen – seit 0.142 auch das Ziel der [Kopie außer Haus](sicherung-ausser-haus.md) (Paket und Adresse, ohne Benutzer und Passwort). Nehmen Automatisierungen [Aufrufe von außen](automatisierungen.md#aufruf-von-aussen) an, steht hier **Aufrufe von außen** mit Name und gekürzter Adresse (bis zu fünf, dann „und N weitere“) – nie das Geheimnis. Gibt es [Ziele nach außen](automatisierungen.md#ziele-nach-aussen), nennt das Blatt ihre Rechner (mit den Aufrufen in derselben Zeile). Wird das Blatt zu voll, stehen Aufrufe und Ziele nur gezählt da.
4. **Wen fragen?** Deine [Notfallkontakte](#notfallkontakte) mit Name, Telefon, E-Mail und Notiz – ohne Kontakte Zeilen, in die du von Hand einträgst, wer dir im Ernstfall hilft. Passen viele Kontakte mit langen Angaben nicht mehr auf die Seite, stehen sie auf einer zweiten Seite, und hier steht der Verweis darauf.
5. **Etwas ist passiert?** Die Links zur Hilfeseite [Was ist dir passiert?](was-ist-passiert.md) – klickbar und immer mit `https://` ausgeschrieben: `https://help.ablago.app/notfall` (Englisch `https://help.ablago.app/emergency`) – und ein **QR-Code** dazu. Scanne ihn mit dem Handy, lies dort und arbeite parallel am Computer.
6. **Ausgesperrt?** Der **Notfallcode**: 28 Zeichen in Vierergruppen und die Adresse deiner Ablage mit `/notfall`. Mit ihm kommst du wieder hinein, wenn du dich ausgesperrt hast – siehe [Mit dem Notfallcode wieder hinein](was-ist-passiert.md#notfallcode). Er ist nicht der Schlüssel und öffnet keine Sicherung.

Im Abschnitt steht auch, wann und von wem es zuletzt heruntergeladen wurde. Fehlt es, gehört es zu einem früheren Schlüssel oder wurde sein Notfallcode benutzt, steht hier ein Hinweis – ebenso in der [Übersicht](uebersicht.md) und unter [Sicherung](sicherung.md#notfallblatt), die beide mit **Zum Notfallblatt** hierher führen. Herunterladen kannst du es nur hier.

![Werkbank → Verschlüsselung, Abschnitt Notfallblatt](bilder/werkbank-notfallblatt.png)

**Jedes Notfallblatt hat einen neuen Notfallcode.** Ablago speichert nur einen Hash davon; der Code eines früher heruntergeladenen Blatts gilt danach nicht mehr. Druck also immer das zuletzt heruntergeladene Blatt aus. Ist der Code benutzt worden, gilt er ebenfalls nicht mehr – die Übersicht erinnert dann an ein neues Blatt, ebenso bei einem Blatt aus der Zeit vor dem Notfallcode.

Ordner, Dateinamen und die Schritte zum Wiederherstellen stehen nicht auf dem Blatt, sondern hier im Handbuch unter [Wiederherstellen](wiederherstellen.md) – dort bleiben sie aktuell. Eine Adresse ohne `https://` steht ohne `http://` davor auf dem Blatt und ist nicht klickbar.

![Notfallblatt](bilder/notfallblatt.png)

Wo das Datenbank-Passwort steht, hängt von der Vorlage ab:

| Vorlage | Datenbank-Passwort |
| --- | --- |
| allgemeine Vorlage (`deploy/nas`) | in der Datei `.env` neben der Compose-Datei (`DB_PASSWORD`) |
| Synology, UGREEN, QNAP, TrueNAS, Unraid | oben in der Compose-Datei (`x-passwort`) |
| dms-komplett | keins – die Datenbank ist nur im Container erreichbar |

Auf dem Notfallblatt steht es nicht. Für ein neues System genügt ohnehin ein neues Passwort.

**Aufbewahren:** ausgedruckt an einem sicheren Ort (z. B. bei den Familienunterlagen oder im Tresor des Betriebs) oder als PDF in einem Passwortsafe – auf jeden Fall **getrennt vom NAS** und nicht neben den Sicherungen. Wer das Blatt hat, kann die Sicherungen lesen.

Jeder Download steht im Protokoll (ohne den Schlüssel). Ändert sich der Schlüssel ([Schlüssel wechseln](#schlussel-wechseln)), weist die Werkbank darauf hin, ein neues Notfallblatt zu erstellen; ältere Sicherungen brauchen weiterhin das alte – bewahre es auf, solange es solche Sicherungen gibt. Wie du sie in der [Sicherung](sicherung.md#notfallblatt) erkennst, steht dort.

## Notfallkontakte

Unter dem Notfallblatt trägst du **Vertrauenspersonen** ein, die im Ernstfall gefragt sind – etwa jemand aus der Familie, der beim Einrichten geholfen hat. Sie wissen dann, dass es deine Ablage gibt, **ohne dadurch Zugang zu bekommen**: kein Konto, keine Rechte, kein Link.

- **Anlegen, ändern, löschen** mit **Notfallkontakt hinzufügen**, **Ändern** und **Löschen**: Name und E-Mail, dazu wahlweise Telefon und eine **Notiz** (z. B. „mein Bruder, hat beim Einrichten geholfen“). Die Notiz steht nur auf dem Notfallblatt, nie in der Mail. Höchstens **10** Kontakte je Ablage.
- **Info-Mail:** Ablago schickt dem Kontakt eine kurze Mail, nur Text, ohne Link, ohne Anhang und ohne Adresse deiner Ablage. Sie nennt dich, den Namen der Ablage und den Kontakt, sagt, dass er **keinen Zugang** hat und dass er sich an dich wendet, wenn er nicht eingetragen sein möchte. Eine falsch eingetippte Adresse ist so ungefährlich: Wer dich nicht kennt, ignoriert die Mail.
- **Wann eine Mail geht:** beim Anlegen, bei einer neuen Adresse (an die neue) und beim Löschen (nur, wenn der Kontakt die Info-Mail bekommen hat). Ein geänderter Name, Telefon oder Notiz verschickt nichts. **Erneut senden** geht einmal je Kontakt und Tag. Ohne eingerichteten [E-Mail-Versand](e-mail-versand.md) steht dort „Info-Mail wird verschickt, sobald E-Mail eingerichtet ist“ – Ablago holt das innerhalb weniger Minuten nach, sobald der Versand steht.
- **Antworten an meine E-Mail-Adresse:** Mit diesem Haken (Vorgabe aus) gehen Antworten des Kontakts an deine Adresse. Ohne ihn steht deine Adresse nicht in der Mail. Einschalten kann ihn nur, wer den Kontakt eingetragen hat.
- **Namen:** Ein Name mit `://`, `www.` oder `@` wird abgelehnt – ein Mailprogramm machte daraus sonst einen Link. Das gilt auch für deinen eigenen Namen und den Namen der Ablage, weil beide in der Mail stehen.
- **Grenzen:** höchstens 20 dieser Mails je Ablage und Tag. Darüber lehnt Ablago Anlegen, neue Adresse und Erneut senden für heute ab. Löschen geht immer, die Mitteilung entfällt dann.
- **Notfallblatt neu ausdrucken:** Ändern sich die Kontakte nach dem letzten Notfallblatt, erinnern beide Abschnitte daran.

Pflegen darf die Kontakte, wer den Bereich **Verschlüsselung** verwaltet (oder Gesamte Verwaltung hat), nicht in einer Vertretung. Je Kontakt steht, wer ihn eingetragen hat – die Mail nennt diese Person. Im [Protokoll](fehlersuche.md#protokoll) stehen Anlegen, Ändern, Löschen und jede Info-Mail mit dem Namen des Kontakts und **gekürzter Adresse** (`j***@example.org`). Auch im [Einrichtungsassistenten](installation.md#optionales) kannst du Notfallkontakte schon eintragen.

![Werkbank → Verschlüsselung, Abschnitt Notfallkontakte](bilder/werkbank-notfallkontakte.png)

**Datenschutz:** Notfallkontakte sind Daten Dritter. Sie stehen in jeder [Sicherung](sicherung.md) und im [Vollexport](export.md) (`struktur/notfallkontakte.json`), im persönlichen Export der Person, die sie eingetragen hat, und in einer [Auskunft](datenschutz.md#auskunft-nach-art-15-dsgvo), wenn die Adresse des Kontakts in den aufgenommenen Mappen steht. Löschst du einen Kontakt, ist er weg; die Sicherungen behalten ihn bis zu ihrem Ablauf.

## Zustände

| Zustand | Bedeutung | Was tun |
| --- | --- | --- |
| **fehlt** | Es gab noch nie einen Schlüssel. | Schlüssel erzeugen. |
| **vorhanden** | Alles in Ordnung. | – |
| **verloren** | Es gab einen Schlüssel, die Datei fehlt aber. | Datei aus deiner Kopie nach `geheim/` zurücklegen und Ablago neu starten. Ist sie verloren, einen neuen Schlüssel erzeugen und die Geheimnisse neu eingeben – siehe [Schlüssel verloren](#schlussel-verloren). |
| **passt nicht** | Unter `geheim/` liegt ein anderer Schlüssel als der, mit dem die Passwörter verschlüsselt sind. | Die richtige Datei ablegen und neu starten – oder die falsche entfernen, neu starten und einen neuen Schlüssel erzeugen. |

Unter **Nicht lesbare oder unverschlüsselte Werte** listet die Seite, welche Passwörter und Geheimnisse mit dem vorhandenen Schlüssel nicht lesbar sind (z. B. nach einem neuen Schlüssel) und wo du sie neu eingibst – auch Postfächer, OAuth-Anmeldungen, das Client-Secret des Anbieters, Zwei-Faktor-Geheimnisse und Paket-Geheimnisse. Ein SMTP-Passwort aus einer Version vor 0.11 erscheint dort als „unverschlüsselt“, bis es einen Schlüssel gibt; dann wird es automatisch verschlüsselt.

## Schlüssel verloren

Deine Mappen und Dokumente sind nicht betroffen – nur gespeicherte Geheimnisse wie Passwörter von Postfächern kann Ablago ohne die Schlüsseldatei nicht mehr lesen. Erzeugst du einen neuen Schlüssel, gibst du sie so wieder ein:

- **Passwortfelder und Mailserver:** Die Werte stehen unter *Nicht lesbare oder unverschlüsselte Werte*. Gib sie neu ein.
- **Postfächer:** Der Abruf scheitert, bis du das Passwort unter **Werkbank → Postfächer** neu einträgst. Bei OAuth trägst du das Client-Secret der App neu ein und meldest die Postfächer neu beim Anbieter an.
- **Anmeldung über einen Anbieter:** Die Anmeldung scheitert, bis du das Client-Secret unter **Werkbank → Anmeldeschutz** neu einträgst.
- **Zwei-Faktor-Anmeldung:** Codes aus der Authenticator-App passen nicht mehr. Die Benutzer kommen nur noch mit ihren Wiederherstellungscodes herein. Setze die Zwei-Faktor-Anmeldung unter **Werkbank → Benutzer** zurück; der Benutzer richtet sie dann neu ein.
- **Paket-Geheimnisse:** in den Einstellungen des Pakets neu eingeben.
- **Sicherungen:** Ältere Sicherungen lassen sich nur mit dem alten Schlüssel vom [Notfallblatt](#notfallblatt) wiederherstellen.
