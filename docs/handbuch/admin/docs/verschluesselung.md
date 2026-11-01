# Verschlüsselung

Passwörter und andere Geheimnisse, die das DMS speichert, liegen verschlüsselt in der Datenbank. Den Schlüssel dazu hält das DMS in einer **eigenen Datei**, nie in der Datenbank. Eine Datenbanksicherung allein verrät damit keine Geheimnisse.

Was genau verschlüsselt ist, zeigt die Seite unter [Was verschlüsselt ist](#was-verschlusselt-ist) mit der Anzahl je Art.

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

Ist ein Wert mit dem vorhandenen Schlüssel nicht lesbar, steht daneben „… nicht lesbar“; welcher es ist, steht darunter unter *Nicht lesbare oder unverschlüsselte Werte*. Taucht eine Zeile **Weitere Einstellungen** auf, kennt die Anzeige diese Art noch nicht – verschlüsselt und beim Wechsel mitgenommen wird sie trotzdem; melde sie gern als Fehler.

Die [Sicherungen](sicherung.md) verschlüsselt das DMS mit einem Schlüssel, der aus diesem abgeleitet ist; sie stehen nicht in der Liste.

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

1. erzeugt das DMS einen neuen Schlüssel,
2. verschlüsselt alle Geheimnisse in der Datenbank **ganz oder gar nicht** neu; bricht dabei etwas ab, gilt weiter der bisherige Schlüssel. Dazu gehört alles unter [Was verschlüsselt ist](#was-verschlusselt-ist): Passwortfelder in Mappen und im Papierkorb, Mailserver, Postfächer (IMAP-Passwort, OAuth-App und OAuth-Anmeldung), Client-Secret des Anbieters, Zwei-Faktor-Geheimnisse und Paket-Geheimnisse,
3. setzt das Prüfwort neu und
4. ersetzt die Schlüsseldatei. Der alte Schlüssel wird nicht aufbewahrt.

Werte, die schon vorher nicht lesbar waren, bleiben, wie sie sind; das DMS sagt, wie viele es sind. Der Wechsel steht im Protokoll mit altem und neuem Fingerabdruck (ohne Schlüssel). Während einer Sicherung lässt sich nicht wechseln.

**Danach:**

Die Seite zeigt die beiden nächsten Schritte mit je einem Knopf; ein erledigter Schritt bekommt ein Häkchen:

- **Neues Notfallblatt herunterladen** – der Knopf **Notfallblatt herunterladen** lädt das PDF direkt herunter (wie der Knopf im Abschnitt *Notfallblatt* darunter). Bis dahin weisen Übersicht und Sicherung darauf hin.
- **Neue Sicherung anlegen** – mit **Jetzt sichern**.
- **Ältere Sicherungen** bleiben mit dem alten Schlüssel verschlüsselt. Die Liste unter [Sicherung](sicherung.md) kennzeichnet sie mit „früherer Schlüssel“. Zum [Wiederherstellen](wiederherstellen.md) einer solchen Sicherung fragt das DMS nach dem Schlüssel vom alten Notfallblatt. Bewahre es auf, solange du diese Sicherungen brauchst – oder lösche sie mit **Sicherungen mit früherem Schlüssel löschen**.

!!! warning "Schlüsseldatei-Kopien"
    Hast du die Datei `geheim/dms.schluessel` irgendwo kopiert, ersetze die Kopie durch die neue Datei.

## Zustände

| Zustand | Bedeutung | Was tun |
| --- | --- | --- |
| **fehlt** | Es gab noch nie einen Schlüssel. | Schlüssel erzeugen. |
| **vorhanden** | Alles in Ordnung. | – |
| **verloren** | Es gab einen Schlüssel, die Datei fehlt aber. | Datei aus deiner Kopie nach `geheim/` zurücklegen und das DMS neu starten. Ist sie verloren, einen neuen Schlüssel erzeugen und die Geheimnisse neu eingeben – siehe [Schlüssel verloren](#schlussel-verloren). |
| **passt nicht** | Unter `geheim/` liegt ein anderer Schlüssel als der, mit dem die Passwörter verschlüsselt sind. | Die richtige Datei ablegen und neu starten – oder die falsche entfernen, neu starten und einen neuen Schlüssel erzeugen. |

Unter **Nicht lesbare oder unverschlüsselte Werte** listet die Seite, welche Passwörter und Geheimnisse mit dem vorhandenen Schlüssel nicht lesbar sind (z. B. nach einem neuen Schlüssel) und wo du sie neu eingibst – auch Postfächer, OAuth-Anmeldungen, das Client-Secret des Anbieters, Zwei-Faktor-Geheimnisse und Paket-Geheimnisse. Ein SMTP-Passwort aus einer Version vor 0.11 erscheint dort als „unverschlüsselt“, bis es einen Schlüssel gibt; dann wird es automatisch verschlüsselt.

## Schlüssel verloren

Ohne die Schlüsseldatei kann das DMS seine Geheimnisse nicht mehr lesen. Erzeugst du einen neuen Schlüssel, gilt danach:

- **Passwortfelder und Mailserver:** Die Werte stehen unter *Nicht lesbare oder unverschlüsselte Werte*. Gib sie neu ein.
- **Postfächer:** Der Abruf scheitert, bis du das Passwort unter **Werkbank → Postfächer** neu einträgst. Bei OAuth trägst du das Client-Secret der App neu ein und meldest die Postfächer neu beim Anbieter an.
- **Anmeldung über einen Anbieter:** Die Anmeldung scheitert, bis du das Client-Secret unter **Werkbank → Anmeldeschutz** neu einträgst.
- **Zwei-Faktor-Anmeldung:** Codes aus der Authenticator-App passen nicht mehr. Die Benutzer kommen nur noch mit ihren Wiederherstellungscodes herein. Setze die Zwei-Faktor-Anmeldung unter **Werkbank → Benutzer** zurück; der Benutzer richtet sie dann neu ein.
- **Paket-Geheimnisse:** in den Einstellungen des Pakets neu eingeben.
- **Sicherungen:** Ältere Sicherungen lassen sich nur mit dem alten Schlüssel vom [Notfallblatt](sicherung.md#notfallblatt) wiederherstellen.
