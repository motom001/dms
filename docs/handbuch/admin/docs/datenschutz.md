# Datenschutz in Ablago

Ablago ist **auf Datenschutz ausgelegt** – „Datenschutz durch Technikgestaltung und datenschutzfreundliche Voreinstellungen“ heißt das in Art. 25 DSGVO. Es läuft bei dir, sendet nichts nach Hause und bringt Werkzeuge mit, mit denen du Auskunft gibst, Aufbewahrungsfristen einhältst und löschst. So legst du Daten von Familie, Mietern und Kunden guten Gewissens darin ab. Diese Seite zeigt, was es dafür gibt und wo du es findest, was du selbst regeln musst und wie du bei einer Anfrage Schritt für Schritt vorgehst.

!!! note "Unterstützt – ersetzt nichts. Keine Rechtsberatung."
    Eine Software allein ist nie „DSGVO-konform“, und ein Siegel dafür hat Ablago nicht. Datenschutzgerecht wird es erst durch **Software, deine Abläufe und deine Dokumentation zusammen** – wie bei der [Verfahrensdokumentation](verfahrensdokumentation.md) nach GoBD. Ablago stellt Daten zusammen, sperrt und löscht und hält fest, was geschah. Ob und was du herausgeben, aufbewahren oder löschen musst, entscheidest du – im Zweifel mit deinem Datenschutzbeauftragten oder einer Rechtsberatung. Diese Seite ist keine Rechtsberatung.

## Datenschutz eingebaut

| DSGVO | Was Ablago dafür hat | Wo |
| --- | --- | --- |
| Art. 5 Abs. 1 c und Art. 25 – Datenminimierung, datenschutzfreundliche Voreinstellungen | **Selbst gehostet:** Die Daten liegen nur auf deinem Gerät – oder bei einem [Anbieter](https://help.ablago.app/installieren/aktuell/anbieter/), den du selbst wählst. [Keine Telemetrie](#keine-telemetrie), kein Tracking, keine Werbung, keine KI im Kern; die Texterkennung läuft lokal. KI-Funktionen kommen als Pakete. Sie können ganz auf deinem Gerät laufen ([KI lokal](ki-lokal.md)); einen fremden Dienst fragen sie nur, wenn du seine Adresse einrichtest und bei der Installation bestätigst. Wer was sehen darf, regeln Rechte je Mappentyp mit Regeln. | Werkbank → Mappentypen → [Berechtigungen](berechtigungen.md) |
| Art. 5 Abs. 1 e – Speicherbegrenzung; Art. 17 – Löschen | [Archivmodus](archiv.md) mit Aufbewahrungsfrist und der Liste **Aufbewahrung abgelaufen**; [Papierkorb](papierkorb.md) für Mappen und Dokumente mit endgültigem Löschen; die Historie gelöschter Mappen fällt nach einer einstellbaren Zeit weg | Werkbank → Mappentypen → Archivmodus, Werkbank → Aufbewahrung abgelaufen, Werkbank → Papierkorb |
| Art. 18 – Einschränkung (Sperren) | **Löschsperre bis Fristende** im Archivmodus – der erste Baustein eines [Sperr- und Löschkonzepts](#sperr-und-loschkonzept-aufsetzen); den Zugriff schränkst du über Berechtigungen ein | Werkbank → Mappentypen |
| Art. 15 – Auskunft | [Auskunft](#auskunft-nach-art-15-dsgvo) als ZIP mit Deckblatt, Prüfliste und Nachweis; [zustellen](#auskunft-zustellen) per Abruf-Link oder E-Mail | Werkbank → Datenschutz-Auskünfte |
| Art. 20 – Datenübertragbarkeit | **Persönlicher Export** für jeden Benutzer, **Vollexport** aller Daten – beides in offenen Formaten (CSV, JSON, Excel, Dokumente im Original) | Mein Konto → Konto → Meine Daten exportieren (ab Werk aus, einschalten unter Werkbank → Vollexport); Werkbank → Vollexport ([Daten exportieren](export.md)) |
| Art. 5 Abs. 2 – Rechenschaft; Art. 30 – Nachweis | **Historie** jeder Mappe (wer hat wann was geändert oder abgerufen – auch über API und Laufwerk, #800), [Protokoll](fehlersuche.md#protokoll), Nachweis jeder Auskunft in der Historie der Person, [Löschprotokoll](#loschprotokoll) mit Prüfsummen ohne Inhalte; [Löschkonzept](loeschkonzept.md) aus Ablago erzeugen und Vorlage [Verfahrensdokumentation](verfahrensdokumentation.md) | Register *Historie* an jeder Mappe, Werkbank → Protokoll, Werkbank → Datenschutz-Auskünfte |
| Art. 32 – Sicherheit | [Verschlüsselte](verschluesselung.md) Passwortfelder und Zugangsdaten – sie verlassen Ablago über keinen maschinellen Weg (Pakete, API, Laufwerk, Auskunft, Protokoll, Einrichtungsdatei); nur Menschen sehen sie mit Recht und frischer Anmeldung in der Mappe oder bewusst im Vollexport, verschlüsselte [Sicherung](sicherung.md) mit [Probe-Wiederherstellung](wiederherstellen.md#probe-wiederherstellung), [Anmeldeschutz und Zwei-Faktor-Anmeldung](anmeldeschutz.md), Prüfwerte für jede Datei, Hinweise zu [HTTPS](installation.md#https-und-zertifikate) | Werkbank → Verschlüsselung, Sicherung, Anmeldeschutz |

## Keine Telemetrie { #keine-telemetrie }

Ablago sendet **keine Nutzungsdaten** – weder an das Projekt noch an sonst jemanden: keine anonymen Statistiken, keine regelmäßigen „Lebenszeichen“, keine Absturzberichte, kein Tracking in der Oberfläche. Die Oberfläche lädt von Haus aus nichts von fremden Servern – keine Schriften, Skripte oder Bilder.

### Was deine Ablage verlässt – und wann { #was-deine-ablage-verlasst }

**Von sich aus baut Ablago keine Verbindung ins Internet auf.** Nach neuen Versionen sucht es von selbst nur, wenn du eine [Automatisierung](automatisierungen.md#neue-version) mit **Neue Version verfügbar** einschaltest – von Haus aus gibt es keine. Nach außen geht es nur, wenn du es auslöst oder einrichtest. Diese Tabelle ist die eine Stelle zum Nachschlagen; die verlinkten Seiten sagen jeweils mehr:

| Verbindung | Wann | Wohin, was |
| --- | --- | --- |
| **Versionsabgleich** | nur auf Knopfdruck unter **Werkbank → Systemzustand → Version und Updates** | GitHub (Stand von Ablago), endoflife.date (Node.js, PostgreSQL, Alpine), npm-Registry (Bibliotheken). Die Anfrage an GitHub enthält die Commit-Kennung deiner Version, damit sich die Änderungen seitdem zählen lassen – keine Daten aus deiner Ablage. Siehe [Technik](technik.md#versionen-und-aktualisierung). |
| **Neue Version (Automatisierung)** | von selbst einmal am Tag (ab 06:00) – nur, solange eine Automatisierung mit der Wenn-Karte **Neue Version verfügbar** eingeschaltet ist | GitHub (`releases/latest`, die neueste stabile Version) – ohne Commit-Kennung und ohne Daten aus deiner Ablage. Siehe [Automatisierungen](automatisierungen.md#neue-version). |
| **Paketkatalog** | auf Knopfdruck unter **Werkbank → Pakete** (Katalog abrufen, auf neue Versionen prüfen) und wenn du einen Installationslink aus dem Katalog öffnest | GitHub ([Pakete](pakete.md)); weitere Kataloge nur, wenn du sie einträgst |
| **E-Mail** | wenn du den E-Mail-Versand oder [Postfächer](postfaecher.md) einrichtest | dein Mailserver. Hinaus gehen: Mappen und Dokumente, die jemand versendet (auch über die [Schnittstelle](api.md)), die [Tägliche Zusammenfassung](aufgaben.md#tagliche-zusammenfassung) (Mappentitel und Links, standardmäßig an, jeder bestellt sie selbst ab), Einladungen, Passwort-Links, [Auskünfte](#auskunft-erteilen) und Abruf-Links, die kurze Info-Mail an [Notfallkontakte](verschluesselung.md#notfallkontakte) (nur Text: dein Name, Name der Ablage, Name des Kontakts) |
| **Mailserver suchen** | beim Einrichten des [E-Mail-Versands](e-mail-versand.md#server-und-port-finden), wenn die Domain nicht in der eingebauten Liste steht | nur die Domain: als DNS-Anfrage an den DNS-Server des Geräts und als HTTPS-Anfrage an die Domain deines eigenen Anbieters; an die Thunderbird-Datenbank (Mozilla) nur auf Knopfdruck. Adresse und Passwort nie |
| **KI-Dienst** | nur, wenn du ein Paket wie den KI-Assistenten installierst und seine [Dienst-Adresse](pakete.md#dienst-adresse) bestätigst | genau diese Adresse: bei „Frag deine Ablage“ Ausschnitte aus Dokumenten, bei „Aus Dokument ausfüllen“ der Dokumenttext, bei „Wohin gehört das?“ der Anfang des Dokuments und Name, Kurzbeschreibung und „Woran man ihn erkennt“ der zugelassenen Mappentypen. Im Heimnetz ([KI lokal](ki-lokal.md)) bleibt alles bei dir |
| **Übersetzungsdienst** | nur, wenn du unter [Werkbank → Sprachen → Inhalte übersetzen](sprachen.md#inhalte-ubersetzen) ein Übersetzungspaket mit Netz **ausdrücklich wählst und bestätigst**; ein Paket, das auf dem Gerät übersetzt, schickt nichts hinaus | je Knopfdruck „Übersetzung anzeigen“ genau der eine Text (Feld, Notiz oder Volltext) an die Adresse des Pakets; wer übersetzt, sieht sie am Ergebnis |
| **Sicherung außer Haus** | wenn du ein Sicherungsziel-Paket einrichtest | die verschlüsselte Sicherung, ohne Schlüssel ([Kopie außer Haus](sicherung-ausser-haus.md)) |
| **Zugang von außen** | wenn du Ablago über einen Tunnel (z. B. Cloudflare Tunnel, Tailscale Funnel) erreichbar machst | aller Verkehr läuft über diesen Anbieter ([Erreichbarkeit aus dem Internet](#erreichbarkeit-aus-dem-internet)) |
| **Links weitergeben** | wenn jemand einen [Link über Feldwerte](direktlinks.md) per Mail oder Chat schickt | die Feldwerte im Link (z. B. eine Vertragsnummer) sind darin lesbar |
| **Anmeldung über einen Anbieter** | wenn du sie [einrichtest](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) | dein Anbieter (OpenID Connect) |
| **Pakete mit Code** | nur, wenn ein Paket es braucht und du es bei der Installation bestätigst | nur die Adressen, die das Paket angibt ([Rechte eines Pakets](pakete.md#recht-netzwerk-und-internet)) |
| **Handbuch** | wenn du auf **Hilfe** oder ein **?** klickst | Das mitgelieferte Handbuch unter `/hilfe/` kommt ohne Internet aus ([Hilfe ohne Internet](technik.md#hilfe-ohne-internet)); Links auf das Online-Handbuch öffnet dein Browser. |

**Das Online-Handbuch** unter help.ablago.app liefert GitHub Pages aus; wie bei jeder Webseite sieht GitHub dabei deine IP-Adresse. Das Handbuch selbst lädt nichts von Dritten – keine Schriften von Google, keine Skripte, keine Abzeichen von fremden Diensten. Das prüft die CI bei jedem Bau, für die Hilfe im Programm ebenso.

Wer dem Projekt sagen möchte, dass und wie er Ablago nutzt, tut das bewusst und selbst – über die Mitmach-Seite [Wer nutzt Ablago?](https://github.com/motom001/dms/issues?q=label%3Anutzt-das-dms) mit dem Formular [Ich nutze Ablago](https://github.com/motom001/dms/issues/new?template=ich-nutze-das-dms.yml). Ablago meldet nichts.

## Was du selbst regeln musst { #grenzen }

Ablago gibt dir Werkzeuge. Diese Punkte bleiben bei dir als Verantwortlichem:

- **Verzeichnis der Verarbeitungstätigkeiten** (Art. 30), **Rechtsgrundlagen und Informationspflichten** (Art. 13, 14) – etwa der Datenschutzhinweis im Mietvertrag. Die Angaben dafür stehen in Ablago: Mappentypen, Zwecke aus den [Vorgaben der Auskunft](#einstellungen), Fristen aus dem Archivmodus.
- **Welche Frist gilt:** Aufbewahrungsfristen klärst du mit deiner Steuerberatung; Ablago setzt um, was du einträgst.
- **Löschen nach Fristende:** Ablago löscht nie von selbst. Du prüfst **Aufbewahrung abgelaufen** regelmäßig.
- **Kopien außerhalb der Ablage:** Gelöschtes steckt noch in älteren [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung), bis sie nach deiner Aufbewahrung wegfallen (Standard: bis zu 12 Monate; von Hand angelegte bleiben, bis du sie löschst), in Vollexporten und persönlichen Exporten im [Export-Ordner](export.md#export-ordner) (nach dem Herunterladen bzw. nach 7 Tagen gelöscht), in Kopien außer Haus, heruntergeladenen Dateien und Ausdrucken.
- **Wer Zugriff hat:** Administratoren sehen alles. Rollen und Berechtigungen richtest du ein; Zugänge von Personen, die gehen, [deaktivierst](benutzer.md#zugang-sperren) du.
- **Die Umgebung:** Gerät und Festplatten, Netzwerk, HTTPS, Updates, Kopie der Sicherungen außer Haus – und Verträge zur Auftragsverarbeitung mit Dienstleistern, etwa dem Mailanbieter. Läuft dein Ablago [bei einem Anbieter](https://help.ablago.app/installieren/aktuell/anbieter/), brauchst du als Vermieter oder Betrieb mit ihm einen **AV-Vertrag**; dort steht auch, worauf du bei der Wahl achtest.
- **Datenpannen** melden (Art. 33, 34) und, wo vorgeschrieben, einen Datenschutzbeauftragten benennen.

## Schritt für Schritt

### Auskunft an einen Benutzer { #auskunft-an-einen-benutzer }

Ein Familienmitglied oder jemand aus dem Betrieb, der ein Konto in Ablago hat, möchte wissen, was über ihn gespeichert ist.

1. **Selbst exportieren lassen:** Unter **Mein Konto → Konto → Meine Daten exportieren** (oben rechts auf deinen Namen klicken) bekommt er alles, was er lesen darf – Mappen mit Dokumenten, seine Aufgaben, Erinnerungen, Favoriten und seinen Papierkorb, sein Benutzerkonto ohne Passwort ([Meine Daten exportieren](export.md#meine-daten-exportieren)). Das geht nur, wenn du den persönlichen Export unter **Werkbank → Vollexport** eingeschaltet hast – **ab Werk ist er aus**. Lässt du ihn aus, stellst du die Auskunft selbst zusammen: aus einem [Vollexport](export.md) wie bei ehemaligen Benutzern (Schritt 3) oder als [Auskunft wie für eine Person, die kein Benutzer ist](#auskunft-an-eine-person-die-kein-benutzer-ist).
2. **Was darin fehlt, ergänzt du:** Mappen über ihn, die er nicht lesen darf (z. B. eine Personalakte), und Einträge im [Protokoll](fehlersuche.md#protokoll) (Anmeldungen, Fehler). Ist er auch als Person erfasst – etwa als Mappe *Mitarbeiter* –, erteile dafür eine [Auskunft wie für eine Person, die kein Benutzer ist](#auskunft-an-eine-person-die-kein-benutzer-ist).
3. **Ehemalige Benutzer** können sich nicht mehr anmelden und also nicht selbst exportieren. Nimm dann die Angaben aus einem [Vollexport](export.md): das Benutzerkonto unter `struktur/`, seine Einträge in `daten/historie.jsonl` und die Mappen, die ihn betreffen.
4. **Frist:** Antworte innerhalb eines Monats (Art. 12 Abs. 3 DSGVO).

### Auskunft an eine Person, die kein Benutzer ist { #auskunft-an-eine-person-die-kein-benutzer-ist }

Ein Mieter, Kunde oder Kontakt fragt nach seinen Daten. Das erledigt **Werkbank → Datenschutz-Auskünfte**; die Einzelheiten stehen [weiter unten](#auskunft-nach-art-15-dsgvo).

1. **Einmal einrichten:** Verantwortlicher (an der [eigenen Organisation](organisation.md)), Empfänger und die Mappentypen, die eine Person betreffen, jeweils mit Zweck ([Vorgaben für jede Auskunft](#einstellungen)).
2. **Person wählen** – oder an ihrer Mappe **Mappe ▾ → Auskunft erstellen …** – und den Eingang der Anfrage eintragen. **Frist als Aufgabe anlegen** erinnert dich unter „Zu erledigen“.
3. **Sammeln:** Ablago folgt den Verweisen von der Mappe der Person aus (Mietvertrag, Abrechnungen, Wohnung) – vollständig nur, was über eine **Zugehörigkeit** zu ihr gehört. Mappen, in denen sie nur über einen **Bezug** genannt ist (z. B. als Ansprechpartner), stehen ohne ihre Inhalte da ([Zugehörigkeit oder Bezug](#zugehorigkeit-oder-bezug)).
4. **Weitersuchen**, wenn die Person auch anderswo vorkommt: Eine Volltext-Suche macht Ablago bewusst nicht ([warum](#warum-keine-volltext-suche)). Such selbst in der Ablage mit der [erweiterten Suche](https://help.ablago.app/benutzer/aktuell/ablage/#erweiterte-suche) ohne gewählten Mappentyp, mit **Volltext** auch in Dokumenten und Notizen. Was wirklich zur Person gehört, verknüpfst du mit ihrer Mappe (als Zugehörigkeit) und sammelst neu.
5. **Prüfen und schwärzen:** Nur Angehaktes geht hinaus; Angaben zu anderen Personen schwärzt du vorher.
6. **Erzeugen und zustellen:** am besten mit Passwort, dann per [Abruf-Link oder E-Mail](#auskunft-zustellen). Der Nachweis steht in der Historie der Person.

### Löschen auf Verlangen { #loschen-auf-verlangen }

Jemand verlangt, dass seine Daten gelöscht werden (Art. 17 DSGVO).

1. **Finden, was zur Person gehört:** wie bei der Auskunft – die Prüfliste unter **Werkbank → Datenschutz-Auskünfte** zeigt alle Mappen, die zur Person gehören, und die, in denen sie nur genannt ist. Erzeugen musst du dafür nichts.
2. **Prüfen, ob eine Aufbewahrungsfrist entgegensteht** (Art. 17 Abs. 3): Mappen eines Mappentyps im [Archivmodus](archiv.md) tragen **Archiv · aufbewahren bis …** und lassen sich vor Fristende ohnehin nicht löschen – auch nicht von Administratoren. Prüfe auch Mappen ohne Archivmodus: Rechnungen oder Verträge können Fristen haben, die du (noch) nicht eingetragen hast.
3. **Frist steht entgegen → sperren statt löschen.** Die Mappe bleibt bis Fristende; benutze sie nur noch dafür, wofür du sie aufbewahren musst.
    - **Zugriff einschränken:** Gib dem Mappentyp ein Ja/Nein-Feld wie *Gesperrt* und lege in den [Berechtigungen](berechtigungen.md#bedingungen) eine Regel an: Wenn „Gesperrt ist ja“, dann Lesen und Bearbeiten nur für eine Rolle wie *Datenschutz*. Administratoren sehen weiter alles.
    - **Vermerken:** eine Notiz an der Mappe, z. B. „Gesperrt auf Verlangen vom 03.11.2026 – löschen nach Fristende“.
    - **Nach Fristende** steht die Mappe unter **Werkbank → Aufbewahrung abgelaufen**; dann löschst du sie wie unten.
    - Sag der Person, dass und bis wann ihre Daten gesperrt bleiben und warum.
4. **Keine Frist → löschen:**
    - In der Ablage die Mappen löschen – einzeln oder über die [Mehrfachauswahl](https://help.ablago.app/benutzer/aktuell/ablage/#mehrere-mappen-loschen); einzelne Dokumente an der Dokumentzeile. Wähle beim Löschen den Grund **Auf Verlangen der betroffenen Person** – er steht im [Löschprotokoll](#loschprotokoll). Eine Mappe, auf die noch andere verweisen, lässt sich nicht löschen: Entferne zuerst den Verweis oder lösche die verweisende Mappe mit, wenn auch sie weg soll.
    - Unter **Werkbank → Papierkorb** die Mappen und Dokumente wählen und **endgültig löschen** (oder den ganzen Papierkorb leeren). Erst dann sind auch Dateien und Volltext weg.
5. **Was danach noch bleibt** – sag es der Person, wenn sie fragt:
    - die **Historie der gelöschten Mappen** für die eingestellte Zeit (Standard 365 Tage, [einstellbar](papierkorb.md#historie-endgultig-geloschter-mappen); 0 löscht sie sofort mit – das gilt dann für alle Mappen),
    - ältere **Sicherungen**, bis sie nach der Aufbewahrung wegfallen,
    - **Exporte** im [Export-Ordner](export.md#export-ordner) (höchstens 7 Tage), bereitliegende **Auskünfte** (höchstens 7 Tage oder bis ein Abruf-Link abläuft) und Kopien außerhalb von Ablago.
6. **Festhalten, dass gelöscht wurde:** Das macht das [Löschprotokoll](#loschprotokoll) – mit Grund, Mappentyp, Nummer und den Prüfsummen der Dokumente, ohne die Daten selbst. Filter nach dem Tag und dem Grund *Auf Verlangen der betroffenen Person* und gib es als PDF aus, wenn die Person oder eine Aufsichtsbehörde einen Nachweis möchte.

Hat die Person ein **Benutzerkonto**, das schon benutzt wurde, [deaktivierst](benutzer.md#zugang-sperren) du es: Ablago löscht solche Konten nicht, damit „angelegt von“ und Verweise stimmen. Ihr Name bleibt dort stehen.

### Sperr- und Löschkonzept aufsetzen { #sperr-und-loschkonzept-aufsetzen }

Für Vermieter, Selbständige und Betriebe: einmal festlegen, wie lange welche Daten bleiben, und Ablago so einrichten, dass es dich daran hält.

1. **Datenarten erfassen:** Jeder Mappentyp ist eine Datenart – Mieter, Mietvertrag, Rechnung, Kunde, Bewerbung … Markiere unter **Werkbank → Löschkonzept → Personendaten in Mappentypen**, welche eine Person betreffen, und trage je Mappentyp den Zweck ein. Daraus [erzeugt Ablago das Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen) mit ausgefüllter Tabelle „Datenarten und Fristen“ – oder du füllst die [Vorlage](loeschkonzept.md#die-vorlage) von Hand aus.
2. **Fristen festlegen** – mit deiner Steuerberatung: z. B. Buchungsbelege 8 Jahre, Geschäftsbriefe 6 Jahre, Bewerbungen ohne Zusage 6 Monate.
3. **Archivmodus einschalten** für jeden Mappentyp mit gesetzlicher Frist: Frist in Jahren und Stichtag (z. B. Rechnungsdatum). Bis Fristende ist die Mappe gegen Löschen gesperrt; danach steht sie unter **Aufbewahrung abgelaufen**. Siehe [Archivmodus](archiv.md#einschalten).
4. **Kürzere Fristen ohne Archivmodus** (z. B. Interessenten, Bewerbungen): Lege eine [Ansicht](sichten.md) an, die die fälligen Mappen nach einem Datumsfeld zeigt, und schau sie regelmäßig durch.
5. **Wie lange Gelöschtes nachwirkt:** Aufbewahrung des [Papierkorbs](papierkorb.md#aufbewahrung) (Standard 30 Tage), Historie gelöschter Mappen (Standard 365 Tage) und Aufbewahrung der [Sicherungen](sicherung.md#zeitplan-und-aufbewahrung) passend zu deinem Konzept einstellen.
6. **Regelmäßig prüfen:** z. B. jedes Jahr im Januar **Werkbank → Aufbewahrung abgelaufen** durchgehen und löschen, was weg darf – einen Kunden oder Vertragspartner samt allem, was dranhängt, mit [Mit verknüpften Mappen löschen](#mit-verknupften-mappen-loschen). Gelöscht wird nie automatisch.
7. **Sperren auf Verlangen** wie unter [Löschen auf Verlangen](#loschen-auf-verlangen) beschrieben.
8. **Dokumentieren:** Erzeuge das Löschkonzept unter **Werkbank → Löschkonzept** (PDF oder Word), ergänze die [eckigen Klammern] und lege es als Mappe in Ablago ab. Ändern sich Mappentypen oder Fristen, erzeugst du es neu.

## Auskunft erteilen: Werkbank → Datenschutz-Auskünfte { #auskunft-erteilen }

Wer Daten von Kunden, Mietern oder Kontakten verwaltet, muss auf Anfrage sagen können, was er über sie gespeichert hat – und das in einer Form, die die Person mitnehmen kann. Unter **Werkbank → Datenschutz-Auskünfte** erledigt Ablago das in wenigen Minuten.

--8<-- "ausgeblendet-organisation.md"

![Werkbank → Datenschutz-Auskünfte](bilder/werkbank-datenschutz.png)

Datenschutz steht in der Werkbank unter **Benutzer und Sicherheit** in zwei Einträgen: **Datenschutz-Auskünfte** (alles zu Anfragen nach Art. 15) und **[Löschkonzept](loeschkonzept.md)** (Löschkonzept, [Personendaten in Mappentypen](#einstellungen) und [Löschprotokoll](#loschprotokoll)). Die alte Adresse `/werkbank/datenschutz` führt zu den Auskünften.

### Die Liste der Auskünfte { #liste }

In der Mitte stehen alle Auskünfte mit Person, Datum und **Zustand**:

| Zustand | Bedeutung |
| --- | --- |
| *angefragt* | Für die Person ist eine [Antwortfrist](#auskunft-nach-art-15-dsgvo) als Aufgabe angelegt, aber noch keine Auskunft erzeugt. **Auskunft erstellen …** öffnet den Assistenten mit der Person. |
| *in Arbeit* | Die ZIP-Datei wird gerade erzeugt. |
| *bereit* | Die ZIP-Datei liegt zum Zustellen oder Herunterladen bereit. |
| *zugestellt* | Per E-Mail verschickt, als Abruf-Link angeboten oder heruntergeladen. |
| *abgerufen* | Die Person hat die Auskunft über den Abruf-Link geholt. |
| *gelöscht* | Die Datei ist weg (heruntergeladen, abgelaufen oder gelöscht). Der Eintrag bleibt als **Nachweis** – ohne Datei. |

Solange eine Auskunft offen ist (angefragt, in Arbeit, bereit), steht die **Antwortfrist** dabei („noch 12 Tage“, überfällig rot). Über der Liste steht das Suchfeld (Person und Zustand, [wie überall in der Werkbank](uebersicht.md#suchen-und-filtern)), darunter der Haken **Nur offene zeigen** – er ist vorgegeben. Nimmst du ihn weg, siehst du auch Zugestelltes und Gelöschtes. Blendet der Haken etwas aus und die Liste ist leer, sagt Ablago das: „Keine offenen Auskünfte. **Alle zeigen**“. Oben rechts steht **+ Neu**: Rechts öffnet sich der Assistent (siehe [unten](#auskunft-nach-art-15-dsgvo)).

Wählst du eine Auskunft, steht rechts alles an einer Stelle – gegliedert wie ein [Mappentyp](mappentypen.md#aufbau-des-editors), mit **Sprungleiste** und **Alle aufklappen / Alle zuklappen**: **Angaben** (Person, Erstellt, Antwortfrist, Inhalt), **Zustellen** (solange die Datei bereitliegt: **Zustellen …**, **Herunterladen** und **Löschen** – der Nachweis bleibt), die **Abruf-Links** mit Zustand und **Zurückziehen** (sobald es welche gibt) und der **Verlauf** – erstellt, zugestellt, abgerufen, falscher Code. Eingeklappt zeigt jeder Bereich eine Kurzinfo, etwa „Liegt bereit bis …“ oder „2 Links“; zu Beginn sind alle Bereiche offen; was du zuklappst, merkt sich dein Gerät je Auskunft. Gibt es weniger als drei Bereiche (etwa bei einer Anfrage), stehen sie ohne Sprungleiste offen da. Alles hier wirkt sofort – zu speichern gibt es nichts. Der Verlauf kommt aus der Historie der Person und enthält nur Zahlen, keine Inhalte.

### Vorgaben für jede Auskunft { #einstellungen }

Einmal einrichten. Empfänger, Rechte und Anrede stehen rechts, solange keine Auskunft gewählt ist, unter **Vorgaben für jede Auskunft**; der Assistent (**+ Neu**) verweist im Kopf darauf – am Handy der Weg dorthin. Den Verantwortlichen pflegst du an der [eigenen Organisation](organisation.md); welche Mappentypen eine Person betreffen, steht beim **[Löschkonzept](loeschkonzept.md) → Personendaten in Mappentypen**, weil das Löschkonzept daraus entsteht:

- **Verantwortlicher:** Name und Anschrift kommen seit #995 von der [eigenen Organisation](organisation.md) (dazu E-Mail, Telefon und – falls es einen gibt – der Datenschutzbeauftragte) und stehen als Absender auf dem Deckblatt und in der E-Mail an die Person. Gibt es noch keine eigene Organisation, gilt die bisherige Angabe; die Werkbank bietet an, sie als eigene Organisation zu übernehmen.
- **Empfänger:** an wen du Daten weitergibst (z. B. Steuerberatung, Hausmeisterdienst). Das ist der Vorschlag für jede Auskunft; du kannst ihn je Auskunft ändern.
- **Rechte der Person:** der Text auf dem Deckblatt (Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde). Ein Vorschlag steht schon drin – in der eingestellten [Anrede](#anrede). Du kannst den Text hier anpassen; einen eigenen Text ändert Ablago beim Wechsel der Anrede nicht.
- **Anrede in Unterlagen für Dritte:** siehe [unten](#anrede).
- **Personendaten in Mappentypen** (beim Löschkonzept): Hake an, welche Mappentypen **eine Person betreffen** – z. B. Mieter, Kunde, Vertragspartner, Kontakt. Nur Mappen dieser Typen lassen sich als Betroffene wählen. Je Mappentyp trägst du den **Zweck** ein (z. B. „Durchführung des Mietverhältnisses“); er steht auf dem Deckblatt bei jeder Art von Daten, die herausgeht.

Die **Speicherdauer** auf dem Deckblatt kommt aus dem [Archivmodus](archiv.md): Hat ein Mappentyp eine Aufbewahrungsfrist, steht sie dort mit dem spätesten „aufbewahren bis“; läuft sie bei einer Mappe noch nicht ([Ist der Stichtag leer](archiv.md#ist-der-stichtag-leer)), steht dort, dass sie erst mit dem Stichtag beginnt; sonst „solange für den Zweck nötig“.

### Anrede in Unterlagen für Dritte: du oder Sie { #anrede }

Ablago spricht dich mit „du“ an – und standardmäßig auch die Personen, an die eine Auskunft geht. Schreibst du deinen Mietern oder Kunden sonst mit „Sie“, stellst du unter **Vorgaben für jede Auskunft → Anrede in Unterlagen für Dritte** auf **Sie** um. Ein Beispielsatz zeigt beide Formen nebeneinander; wirksam wird die Wahl mit **Speichern**. Sie gilt für die ganze Installation und für alles, was an Personen **außerhalb** von Ablago geht:

| Was | Wo |
| --- | --- |
| Deckblatt, Übersicht und LIESMICH der Auskunft | in der ZIP-Datei, beim nächsten Erzeugen |
| Vorlage für die E-Mail mit der ZIP-Datei und die E-Mail mit dem Abruf-Link | [Auskunft zustellen](#auskunft-zustellen) |
| Abrufseite mit ihren Meldungen (falscher Code, Link abgelaufen …) | `/abruf` |

**Die Oberfläche bleibt in jedem Fall beim „du“** – auch für dich als Administrator. Ändert sich die Anrede, gilt sie für alle danach erzeugten Auskünfte und verschickten E-Mails; schon erzeugte ZIP-Dateien und verschickte E-Mails bleiben, wie sie sind. Die Abrufseite zeigt immer die aktuelle Einstellung.

E-Mails mit Mappen und Dokumenten (*Per E-Mail versenden*) schreibst du selbst – Ablago gibt dort nur den Betreff „Mappentyp: Titel“ vor, ohne Anrede.

## Auskunft nach Art. 15 DSGVO

1. **Person wählen:** wie in einem Verweisfeld – tippe einen Namen, Ablago sucht in allen Mappentypen, die eine Person betreffen, und zeigt je Treffer den Mappentyp (und das Feld, falls nicht der Name passt, z. B. „Firma: Muster GmbH“). Die gewählte Person steht danach als Eintrag mit **Entfernen** da. Oder direkt an der Mappe unter **Mappe ▾ → Auskunft erstellen …** (nur für Administratoren und nur bei Mappentypen, die eine Person betreffen).
2. **Frist:** Trage ein, wann die Anfrage eingegangen ist, und lege mit **Frist als Aufgabe anlegen** eine Aufgabe für dich an – „Auskunft nach Art. 15 DSGVO an … bis …“, fällig einen Monat nach Eingang (Art. 12 Abs. 3 DSGVO). Sie steht wie jede Aufgabe unter „Zu erledigen“, und in der [Liste](#liste) steht die Person als *angefragt* mit der Antwortfrist – auch wenn du den Assistenten jetzt schließt.
3. **Sammeln:** Ablago folgt den Verweisen von der Mappe der Person aus – **Mappen, die darauf verweisen** (Mietvertrag → Nebenkostenabrechnungen) und **Mappen, auf die sie verweist** (Wohnung, Arbeitgeber). Die **Tiefe** stellst du ein (Vorgabe 2: Vertrag und dessen Rechnungen). Kreise (zwei Verträge, die aufeinander verweisen) werden erkannt; jede Mappe steht nur einmal da. Benutzer und Rollen sind nie dabei.
    - **Richtung:** Nach unten (Mappen, die zur Person gehören) sammelt Ablago alles, über mehrere Stufen. Nach oben (Person → Firma → Muttergesellschaft) geht es nur weiter nach oben, **nie wieder hinunter**: Von der Wohnung aus sammelt es nicht die anderen Mieter, von der Firma aus nicht deren Verträge.
    - <a id="zugehorigkeit-oder-bezug"></a>**Zugehörigkeit oder Bezug:** Vollständig – mit Dokumenten, Notizen und allen Angaben – kommt nur, was über einen Verweis der [Verweisart](mappentypen.md#verweise-mappen-verbinden) **Zugehörigkeit** verbunden ist. Ist die Person in einer Mappe nur über einen **Bezug** eingetragen – z. B. ein Wartungsvertrag mit ihr als *Ansprechpartner*, Post mit *Zugeordnet zu* –, steht die Mappe in der Prüfliste als „als Ansprechpartner eingetragen in Wartungsvertrag „W-1““: In die Auskunft geht nur das – Art, Titel und Feld –, **ohne ihre Dokumente, Notizen und übrigen Angaben**, und über sie sammelt Ablago nicht weiter. Gehört sie doch ganz dazu, setzt du **ganz aufnehmen** (Vorgabe: aus). Prüfe darum die Verweisart deiner Felder: Soll Post zur Person ganz hinausgehen, nimm sie bewusst auf oder verknüpfe sie über ein Feld der Art Zugehörigkeit.
4. **Prüfen:** Die Liste zeigt den Baum mit Häkchen je **Mappe**, **Dokument**, **Notiz** und **Historie**. Nur Angehaktes geht hinaus, und erst wenn du **„Ich habe die Auswahl geprüft“** bestätigst, lässt sich die Auskunft erzeugen.
    - **Daten Dritter?** Ist eine Mappe noch mit anderen Personen verbunden (Mappen eines Typs, der eine Person betrifft – z. B. eine Wohnung, in der auch andere Mieter wohnen), steht das dabei. Enthält ein Dokument Angaben zu anderen Personen, öffne es über **schwärzen …** in einem neuen Tab, schwärze die Stellen ([Schwärzen](https://help.ablago.app/benutzer/aktuell/dokumente/)) und sammle neu: Die **geschwärzte Fassung** ist dann angehakt, das Original nicht.
    - **Notizen** sind vorgewählt. Hältst du eine zurück (z. B. eine interne Bewertung), ist eine **Begründung Pflicht**; sie steht im Nachweis, nicht in der Auskunft.
5. **Erzeugen:** Empfänger und eine Anmerkung fürs Deckblatt, optional ein **Passwort** (mindestens 10 Zeichen, „Vorschlagen“ erzeugt eines). Die Auskunft entsteht im Hintergrund. Danach steht an der Stelle des Knopfs **„Auskunft ist fertig“** mit Umfang, darunter **Zustellen …** (E-Mail oder Abruf-Link) und **Herunterladen**. Eine weitere Auskunft beginnt mit **Neue Auskunft erstellen**; die fertige steht in der [Liste](#liste) als *bereit*.

### Warum keine Volltext-Suche? { #warum-keine-volltext-suche }

Früher schlug die Prüfliste auch Mappen vor, in denen Name, E-Mail-Adresse, Kundennummer oder IBAN irgendwo im Text vorkamen. Das gibt es nicht mehr, auch nicht zum Einschalten: Zu oft trifft die Suche die Falschen („Meissner“ und „Meißner“), und zu leicht gingen fremde Inhalte hinaus – etwa ein internes Besprechungsprotokoll, in dem die Person nur erwähnt ist. In die Auskunft kommt nur, was über Verweise mit der Person verbunden ist. Kommt sie anderswo vor, suchst du selbst und verknüpfst, was dazugehört.

### Was die ZIP-Datei enthält

| Datei/Ordner | Inhalt |
| --- | --- |
| `Deckblatt.pdf` | „Auskunft nach Art. 15 DSGVO“ mit Absender: welche Daten (Arten und Felder), Zwecke, Herkunft (Kanäle der Post: E-Mail, Scan …), Empfänger, Speicherdauer, Rechte der Person |
| `Uebersicht.html` | alle Mappen mit ihren Angaben und Links zu den Dokumenten, dazu „Hier bist du genannt“ (bzw. „Hier sind Sie genannt“) mit den Bezug-Mappen (nur Art, Titel und Feld) – im Browser zu öffnen |
| `Uebersicht.csv` | dasselbe als Tabelle |
| `ablage/<Art>/<Titel>/` | je Mappe die Dokumente im Original (bzw. geschwärzt), dazu `mappe.pdf` und `mappe.json` |
| `daten/`, `struktur/`, `manifest.json` | maschinenlesbar im Format des [Vollexports](export.md) (CSV, JSON Lines, Excel) – deckt auch die Datenübertragbarkeit (Art. 20) ab |

**Nie enthalten** sind Passwortfelder (weder Wert noch Feld) und andere verschlüsselte Werte, ältere Versionen von Dokumenten (sie könnten ungeschwärzt sein), Aufgaben, Benutzerkonten und Berechtigungen. Hältst du eine Notiz zurück, fehlen in der Historie dieser Mappe auch die Einträge zu Notizen (sie nennen deren Text).

**Mit Passwort** liegt die Auskunft als `Auskunft.zip` in einer mit AES-256 verschlüsselten ZIP-Datei – so sind auch die Dateinamen (z. B. der Name der Person) nicht zu sehen. Öffnen lässt sie sich z. B. mit 7-Zip, WinZip oder Keka (macOS), **nicht** mit dem eingebauten Entpacken von Windows. Teile das Passwort getrennt von der Datei mit, z. B. per Telefon oder SMS.

### Nachweis und Aufbewahrung

- In der **Historie der Person** steht „Auskunft erteilt“ mit Zeit, wer sie erstellt hat, Anzahl Mappen, Dokumente und Notizen, ob mit Passwort und die Begründungen zurückgehaltener Notizen – **ohne Inhalte**. Dasselbe steht ohne Begründungen im [Protokoll](fehlersuche.md#protokoll) (Modul „datenschutz“).
- Die ZIP-Datei liegt in der [Liste](#liste) als *bereit*, bis du sie **herunterlädst** – danach wird sie gelöscht –, höchstens **7 Tage**. Mit einem gültigen [Abruf-Link](#auskunft-zustellen) bleibt sie, bis die Person sie so oft abgerufen hat wie vorgesehen oder der Link abläuft. Gespeichert wird sie unverschlüsselt (außer mit Passwort) im [Export-Ordner](export.md#export-ordner) unter `auskunft/`, nicht im Sicherungsordner; sie ist nicht Teil der Sicherung.
- Brauchst du sie noch einmal, erzeuge sie neu.

### Wer darf das?

Nur **Administratoren**. Ein eigenes Recht „Auskunft erteilen“ gibt es (noch) nicht: Die [Berechtigungen](berechtigungen.md) regeln je Mappentyp Anlegen, Lesen, Bearbeiten, Löschen und Passwörter – eine Auskunft greift über alle Mappentypen. Abgestufte Rechte für Administratoren kommen später.

## Auskunft zustellen

Die fertige Auskunft schickst du direkt aus Ablago – in der [Liste](#liste) die Auskunft wählen, rechts im Bereich *Zustellen* **Zustellen …** (oder gleich nach dem Erzeugen; dann steht der Bereich schon offen). Zwei Wege:

| | Abruf-Link mit Abrufcode | ZIP per E-Mail |
| --- | --- | --- |
| **Wie** | Die Person bekommt einen Link auf eine schlichte Seite deines Ablago und lädt die Datei dort mit einem Abrufcode herunter. | Die ZIP-Datei geht als Anhang über den [E-Mail-Versand](installation.md#e-mail-und-adresse) von Ablago. |
| **Voraussetzung** | Dein Ablago ist **aus dem Internet erreichbar**. | Die Auskunft ist **mit Passwort** erzeugt; höchstens 50 MB (viele Mailserver nehmen nur 10–25 MB). |
| **Nachweis** | Jeder Abruf mit Zeitpunkt, „abgerufen am …“, Benachrichtigung | „per E-Mail gesendet an … am …“ |
| **Zweiter Weg** | Abrufcode per Brief, Telefon oder SMS | Passwort per Telefon, SMS oder Brief |

Vorgeschlagen ist der Abruf-Link, wenn die [Adresse von Ablago](installation.md#e-mail-und-adresse) nach Internet aussieht – sonst (z. B. `http://192.168.…`, `localhost`, `nas.home.arpa`) die E-Mail.

### Weg 1: per E-Mail

Nur für Auskünfte **mit Passwort** – unverschlüsselt geht keine Auskunft per E-Mail hinaus. Gib die Adresse ein; Betreff und Text sind vorbereitet (in der eingestellten [Anrede](#anrede)) und lassen sich ändern. **Das Passwort steht nie in der E-Mail** – Ablago kennt es nach dem Erzeugen gar nicht mehr. Teile es auf einem anderen Weg mit. Antworten gehen an deine Adresse. In der Historie der Person steht „Auskunft per E-Mail gesendet an …“.

### Weg 2: Abruf-Link mit Abrufcode

1. **E-Mail-Adresse der Person** (optional): Ohne Haken dient sie nur dem Nachweis in der Historie – du kopierst den Link und schickst ihn selbst. Mit dem Haken **Link per E-Mail schicken** (Vorgabe: aus) verschickt Ablago den Link – ohne Code –, dann ist die Adresse Pflicht. Die Meldung danach sagt eindeutig, ob eine E-Mail hinausging.
2. **Gültig** (Vorgabe 30 Tage, höchstens 90) und **Abrufe** (Vorgabe 3, höchstens 10).
3. **Abrufcode:** Am besten **von Ablago erzeugen** (8 Zeichen ohne Verwechsler wie 0/O und 1/I). Alternativ ein **eigener Code**, den nur die Person kennt – z. B. die Vertragsnummer (mindestens 6 Zeichen). Ablago zeigt ihn genau so an, wie du ihn eingibst. Beim Abruf spielen Groß-/Kleinschreibung, Leerzeichen und Bindestriche keine Rolle – „KD-12345“ und „kd12345“ gelten als gleich; das steht auch auf der Abrufseite. Eine **Kundennummer allein ist schwach**: Sie steht oft auf Briefen und Rechnungen.
4. **Abruf-Link erstellen:** Link und Code stehen **nur jetzt** auf dem Bildschirm. Teile den Code auf einem anderen Weg mit – per Brief, Telefon oder SMS, **nie in derselben E-Mail wie den Link**. Geht er verloren, erstelle einen neuen Link; der alte gilt dann nicht mehr.

Die Person öffnet den Link und sieht nur: „Du hast eine Auskunft nach Art. 15 DSGVO über die hier gespeicherten Daten angefordert. Zur Sicherheit gib bitte deinen Abrufcode ein.“ (mit der [Anrede](#anrede) „Sie“: „Sie haben … Zur Sicherheit geben Sie bitte Ihren Abrufcode ein.“) – kein Menü, kein Logo, kein Name der Ablage, keine Anmeldung. Mit dem richtigen Code startet der Download.

![Öffentliche Abrufseite einer Auskunft](bilder/abrufseite.png)

Unter **Abruf-Links** stehen alle Links mit Stand (*aktiv*, *abgelaufen*, *alle Abrufe verbraucht*, *gesperrt nach Fehlversuchen*, *zurückgezogen*), Abrufen, „zuletzt abgerufen am …“ und falschen Codes – auch, wenn die ZIP-Datei längst gelöscht ist. **Zurückziehen** macht einen Link sofort ungültig; für die ZIP-Datei gilt dann wieder das Ende 7 Tage nach dem Erstellen.

![Zustellen an einer Auskunft, die bereitliegt](bilder/werkbank-datenschutz-zustellen.png)

**Nachweis und Benachrichtigung:** Jeder Abruf und jeder falsche Code steht in der **Historie der Person** (Zeitpunkt, erfolgreich oder nicht – **ohne IP-Adresse**, ohne Code). Wer den Link oder die Auskunft erstellt hat und wer die Person als **Favorit** (★) hat – sofern er die Benachrichtigung für diesen Favoriten nicht abgeschaltet hat ([Favorit = Abo](https://help.ablago.app/benutzer/aktuell/ablage/#favoriten-als-abo)) –, bekommt unter „Zu erledigen“ die Aufgabe **Auskunft** – „Auskunft an … wurde abgerufen“. Solange sie offen ist, kommt für denselben Link keine zweite. Sind alle Abrufe verbraucht, wird die ZIP-Datei gelöscht.

### Sicherheit der Abrufseite

Die Abrufseite ist der **einzige** Weg, ohne Anmeldung an Daten in Ablago zu kommen. Darum:

- **Nicht zu erraten:** Der Link enthält nur einen Zufallsschlüssel mit 256 Bit, sonst nichts – keine Id, keinen Namen. Er steht hinter dem `#` (`/abruf#…`): Diesen Teil schickt der Browser nie mit, er landet also in keinem Zugriffsprotokoll (auch nicht beim Reverse-Proxy) und in keinem Referer.
- **Zwei Faktoren:** Link (E-Mail) und Abrufcode (anderer Weg). Gespeichert sind nur Hashes – der Schlüssel als SHA-256, der Code wie ein Passwort (scrypt); verglichen wird in konstanter Zeit.
- **Keine Auskunft über Links:** Ein unbekannter Link, ein falscher Code und ein gesperrter Link ergeben dieselbe Meldung in derselben Zeit. Erst mit richtigem Code erfährt die Person, dass ihr Link abgelaufen, verbraucht oder zurückgezogen ist.
- **Sperre:** Nach **10 falschen Codes** ist der Link gesperrt – dann hilft auch der richtige nicht mehr; du erfährst es über die Aufgabe *Auskunft*. Zusätzlich hat die Abrufseite eine eigene Bremse je IP-Adresse (bei IPv6 je /64): nach **5 falschen Codes** über alle Links 15 Minuten Pause. Sie ist vom [Anmeldeschutz](anmeldeschutz.md) getrennt – Fehlversuche auf der Abrufseite sperren also nie die Anmeldung, auch nicht hinter einem Reverse Proxy. Es laufen höchstens zwei Code-Prüfungen gleichzeitig; ein Download wird nicht im Browser-Zwischenspeicher abgelegt.
- **Download über ein Einmal-Ticket:** Nach dem richtigen Code gibt es ein Ticket für genau einen Download, zwei Minuten gültig. Gezählt wird beim Start des Downloads; ein abgebrochener Download steht als *abgebrochen* in der Historie.
- **Protokoll ohne Geheimnisse:** Im [Protokoll](fehlersuche.md#protokoll) (Modul „datenschutz“) stehen Abrufe und Fehlversuche mit **gekürzter IP** (z. B. `203.0.113.0`), nie Schlüssel oder Code.
- Die Anfrage mit dem Code braucht die Kennung der eigenen Oberfläche (Schutz vor fremden Seiten, CSRF); die Seite lädt sonst nur die eingestellte [Anrede](#anrede) aus Ablago (keinen Kontostatus, kein Design).

### Erreichbarkeit aus dem Internet

Der Abruf-Link funktioniert nur, wenn die Person dein Ablago von außen erreicht. Viele Installationen zu Hause sind das nicht – dann nimm den Weg per E-Mail. Soll Ablago erreichbar sein, geht das über einen [Reverse-Proxy](installation.md#hinter-einem-reverse-proxy) mit HTTPS (z. B. auf dem NAS mit Portfreigabe), einen Tunnel (z. B. Cloudflare Tunnel, Tailscale Funnel) oder [bei einem Anbieter](https://help.ablago.app/installieren/aktuell/anbieter/). Trage unter [E-Mail und Adresse](installation.md#e-mail-und-adresse) die Adresse ein, unter der es von außen erreichbar ist – sie steht im Link. Wer nur die Abrufseite nach außen geben will, gibt am Proxy `/abruf`, `/api/abruf`, `/api/abruf/anrede`, `/api/abruf/datei` und die Dateien der Oberfläche (`/assets/`) frei.

## Löschen mit verknüpften Mappen { #mit-verknupften-mappen-loschen }

Der dritte Baustein eines [Sperr- und Löschkonzepts](#sperr-und-loschkonzept-aufsetzen) neben Archivmodus und **Aufbewahrung abgelaufen**: An einer Mappe, z. B. einem Kunden oder Vertragspartner ohne Aktivität seit Jahren, löscht **Mappe ▾ → Mit verknüpften Mappen löschen …** die Mappe mit Verträgen, Rechnungen, Post und Dokumenten – nach einer Vorschau als Baum ([Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/mappen/#mit-verknupften-mappen-loschen)).

Dabei gilt:

- **Nur nach unten:** Mitgelöscht werden Mappen, die auf die gelöschte verweisen (Rechnung → Vertrag → Vertragspartner: Wer den Vertragspartner löscht, löscht Verträge und Rechnungen mit). Was nach oben zeigt, bleibt – auch nicht über ein Kind seitwärts zu dessen anderen Eltern: Löschst du eine Rechnung, geht der Lieferschein mit, der auf sie verweist; sein Verweis auf den Vertragspartner wird nicht verfolgt. Jede Mappe zählt nur einmal (Kreise).
- **Nur über Zugehörigkeit:** Mitgelöscht und weitergesammelt wird nur über Verweisfelder der [Verweisart](mappentypen.md#verweise-mappen-verbinden) **Zugehörigkeit**. Hängt eine Mappe nur über einen **Bezug** dran (📎, z. B. *Ansprechpartner*, *Für*, *Zugeordnet zu*), wird nur der Verweis entfernt; die Mappe bleibt, und was an ihr hängt, wird nicht gesammelt. Prüfe darum die Verweisart deiner Felder: Soll ein Vertrag mit dem Vertragspartner gehen, muss sein Feld *Vertragspartner* eine Zugehörigkeit sein.
- **Fristen werden nie übergangen.** Eine Mappe in der Aufbewahrungsfrist (🔒) bleibt – und mit ihr alles, worauf sie verweist (ihr Vertrag, der Vertragspartner), damit sie nachvollziehbar bleibt. Verweise einer gesperrten Mappe werden nicht entfernt.
- **Erinnerung zum Fristende:** Bleibt die Start-Mappe deshalb stehen, bekommt, wer gelöscht hat, an ihr eine Erinnerung zum Tag nach dem spätesten Fristende („… kann ab … gelöscht werden – Mit verknüpften Mappen löschen erneut ausführen“). Sie steht dann unter „Zu erledigen“; bis dahin bleiben die Daten normal sichtbar. Sperren statt löschen (Art. 18 DSGVO) kommt später.
- **Nur im Rahmen der Rechte:** Mappen ohne Löschrecht (⛔) bleiben, ebenso Mappen, die der Benutzer nicht sehen darf oder die außerhalb der Vorschau noch darauf verweisen.
- **Geteilte Mappen werden nur entkoppelt:** Hängt eine Mappe auch an einer anderen (🔗, z. B. eine Rechnung zu zwei Verträgen), wird nur der Verweis entfernt; die Mappe bleibt.
- **Alles über den Papierkorb:** Als ein Vorgang, gemeinsam wiederherstellbar. Endgültig weg ist es nach der [Aufbewahrung des Papierkorbs](papierkorb.md#aufbewahrung) oder mit *Papierkorb leeren*; ist der Papierkorb ausgeschaltet, sofort.
- **Nachvollziehbar, ohne Inhalte:** Die Historie jeder Mappe hält „in den Papierkorb gelegt – mit verknüpften Mappen gelöscht“ mit der Zahl der Mappen und Dokumente fest, die Start-Mappe auch, wie viele aus welchem Grund blieben. Das [Protokoll](fehlersuche.md#protokoll) (Modul „ablage“) nennt wer, Start-Mappe und Vorgang (als Id), Anzahl Mappen, Dokumente, entfernte Verweise und was warum blieb – keine Titel oder Feldwerte. Nach dem endgültigen Löschen bleibt die Historie so lange, wie unter [Historie endgültig gelöschter Mappen](papierkorb.md#historie-endgultig-geloschter-mappen) eingestellt.

!!! tip "Löschkonzept dokumentieren"
    Halte in deiner [Verfahrensdokumentation](verfahrensdokumentation.md) fest, welche Fristen je Mappentyp gelten, wer wann prüft, was weg darf (z. B. einmal im Jahr über *Aufbewahrung abgelaufen*), und dass dabei „Mit verknüpften Mappen löschen“ verwendet wird.

## Löschprotokoll { #loschprotokoll }

**Werkbank → Löschkonzept → Löschprotokoll** weist nach, **dass** und **wann** du gelöscht hast (Rechenschaftspflicht, Art. 5 Abs. 2 DSGVO) – ohne dass das Protokoll selbst wieder die gelöschten Daten enthält. Die Historie einer Mappe reicht dafür nicht: Sie geht mit der Mappe, und das technische [Protokoll](fehlersuche.md#protokoll) läuft nach 24 Stunden ab.

### Was drinsteht

Jeder Schritt ist ein eigener Eintrag: **in den Papierkorb**, **endgültig gelöscht**, **wiederhergestellt** – verbunden über die Id der Mappe bzw. des Dokuments.

| Je Mappe | Je Dokument (auch ältere Versionen) |
| --- | --- |
| Mappentyp, Mappen-Id, **Nummer** aus dem [Nummernkreis](nummernkreise.md) (falls vorhanden) | **Prüfsumme (SHA-256)**, Größe, Dateityp, Seitenzahl, Archivnummer |
| Anzahl Dokumente, ältere Versionen, Notizen, entfernte Verweise | zu welcher Mappe (Id, Nummer, Mappentyp) |

Dazu bei jedem Eintrag: **wann**, **von wem** (Benutzer; *Schnittstelle* bei einem API-Schlüssel, *Paket* beim Dienstkonto eines Pakets, *Ablago* bei automatischem Löschen), **wie** (einzeln, mehrere, mit verknüpften Mappen, aus dem Papierkorb, Papierkorb geleert, Aufbewahrung abgelaufen …), **warum** und der **Vorgang** beim [Löschen mit verknüpften Mappen](#mit-verknupften-mappen-loschen) – alle Mappen eines Vorgangs mit gemeinsamer Id und der Start-Mappe.

**Nie drin:** Titel, Feldwerte, Dateinamen, Notizen – die sind personenbezogen und sollen ja weg.

**Warum:** Beim Löschen fragt Ablago nach dem Grund – *Frist abgelaufen („Aufbewahrung abgelaufen“)*, *Auf Verlangen der betroffenen Person*, *Nicht mehr nötig* oder *Sonstiges* – und optional nach einer kurzen Anmerkung. Schreib dort **keine Namen** hinein: Das Löschprotokoll bleibt, wenn die Daten weg sind. Beim endgültigen Löschen aus dem Papierkorb übernimmt Ablago den Grund vom Schritt „in den Papierkorb“. Über die Schnittstelle gibst du ihn mit `grund` und `grundText` an.

### Wann ist „gelöscht“ wirklich gelöscht?

- **In den Papierkorb:** Die Mappe ist aus Ablage, Suche und Schnittstelle verschwunden, liegt aber vollständig im Papierkorb – mit Feldwerten, Dokumenten, Volltext und Notizen – und lässt sich wiederherstellen.
- **Endgültig gelöscht:** nach der [Aufbewahrung des Papierkorbs](papierkorb.md#aufbewahrung), mit *Endgültig löschen* oder *Papierkorb leeren*, sofort bei ausgeschaltetem Papierkorb. Dann sind Mappe, Dokumente, Volltext und Notizen aus der Datenbank entfernt, und die **Datei** ist vom Speicher gelöscht – es sei denn, ein anderes Dokument hat genau dieselbe Datei (gleiche Prüfsumme); sie ist ja nur einmal gespeichert.
- **Was danach noch bleibt:** die Historie gelöschter Mappen für ihre eingestellte Zeit, ältere Sicherungen bis zu ihrer Aufbewahrung, Exporte und Kopien außerhalb von Ablago (siehe [Löschen auf Verlangen](#loschen-auf-verlangen)). Das Löschprotokoll hält den Zeitpunkt des endgültigen Löschens fest; diese Fristen ergänzt du im [Löschkonzept](loeschkonzept.md).

Erfasst werden alle Wege: einzeln, mehrere ausgewählt, mit verknüpften Mappen, „Aufbewahrung abgelaufen“, einzelne Dokumente (auch beim Ersetzen, Bearbeiten und Zusammenfügen von PDFs), ältere Versionen über die eingestellte Anzahl hinaus, der Papierkorb (von Hand, geleert, beim Abmelden geleert, Aufbewahrung abgelaufen, ausgeschaltet), Post, die in eine Mappe aufgelöst wurde – eine neue oder eine vorhandene (Weg *Post in eine Mappe aufgelöst*, als Anmerkung Mappentyp und Id der Mappe – ihre Dokumente sind nicht gelöscht, sie liegen in der Mappe), Schnittstelle und Pakete. Nicht erfasst werden [Demo-Mappen](demo.md) – sie enthalten keine echten Daten.

### Ansehen und ausgeben

![Werkbank → Löschkonzept → Löschprotokoll mit Filtern, Suche per Datei und Einträgen](bilder/werkbank-loeschprotokoll.png)

- **Filter:** Zeitraum, Mappentyp, Grund, Schritt; ein Klick auf einen Vorgang zeigt alle Mappen und Dokumente dieses Vorgangs.
- **Suche nach Nummer** (Nummernkreis oder Archivnummer) oder **Prüfsumme**.
- **„Wurde dieses Dokument gelöscht?“** Zieh die Datei auf das Feld: Dein Browser rechnet die Prüfsumme, Ablago sucht sie. Die Datei selbst wird nicht hochgeladen.
- **Als PDF** (Nachweis, mit Filter und Stand im Kopf) oder **als CSV** – jeweils mit dem gewählten Filter.

!!! info "Prüfsumme und Datenschutz"
    Die Prüfsumme (SHA-256) ist ein Fingerabdruck der Datei: Aus ihr lässt sich der Inhalt nicht zurückgewinnen. Wer die Datei aber noch hat, kann zeigen, dass genau sie in Ablago war und wann sie gelöscht wurde – genau das ist der Zweck. Die Prüfsumme ist damit ein **pseudonymes** Datum; behandle das Löschprotokoll wie andere Nachweise vertraulich.

### Nicht änderbar, eigene Aufbewahrung

- Einträge lassen sich **weder ändern noch löschen** – auch nicht von Administratoren oder über die Schnittstelle; die Datenbank selbst verhindert es.
- Eigene **Aufbewahrung**: Standard **10 Jahre**, einstellbar von 1 bis 30 Jahren unter dem Löschprotokoll. Ältere Einträge fallen beim stündlichen Aufräumen automatisch weg.
- Das Löschprotokoll ist in jeder [Sicherung](sicherung.md) und im [Vollexport](export.md) (`daten/loeschprotokoll.csv`) enthalten.
- Abschnitt 8 „Nachweis“ des [Löschkonzepts](loeschkonzept.md#aus-dem-dms-erzeugen) verweist darauf.

## Schnittstelle

Alles geht auch über die [API](api.md): `POST /api/v1/werkbank/auskunft/vorschau` (Prüfliste), `POST /api/v1/werkbank/auskunft` (erzeugen, Hintergrundauftrag), `GET /api/v1/werkbank/auskunft/{id}/zip`, `POST /api/v1/werkbank/auskunft/frist`, `GET`/`PUT /api/v1/werkbank/datenschutz` und `GET /api/v1/werkbank/datenschutz/loeschkonzept?format=pdf|docx` (Löschkonzept), `GET /api/v1/werkbank/loeschprotokoll` mit denselben Filtern wie in der Werkbank, `GET /api/v1/werkbank/loeschprotokoll/datei?format=pdf|csv` und `PUT /api/v1/werkbank/loeschprotokoll/einstellungen` (Aufbewahrung); zum Zustellen `POST /api/v1/werkbank/auskunft/{id}/email`, `POST /api/v1/werkbank/auskunft/{id}/link` und `POST /api/v1/werkbank/auskunft/link/{id}/widerrufen`. Die Abrufseite selbst (`POST /api/abruf`, `GET /api/abruf/datei`) gehört nicht zur API. Die Sammlung über Verweise selbst steht jedem Benutzer mit seinen Rechten unter `GET /api/v1/mappen/{id}/baum` zur Verfügung. Für das Löschkonzept: `GET /api/v1/mappen/{id}/loeschvorschau` (Vorschau mit Vorschlag), `POST /api/v1/mappen/{id}/mit-verknuepften-loeschen` (ausführen, mit denselben Prüfungen) und `POST /api/v1/papierkorb/vorgang/{id}/wiederherstellen`.
