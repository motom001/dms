# Mein Konto und Einstellungen

## Das Menü unter deinem Namen

Ein Klick auf deinen Namen oben rechts öffnet ein Menü:

![Benutzermenü](bilder/benutzermenue.png)

- Oben stehen dein Name, deine E-Mail-Adresse und – falls du Ablago verwalten darfst – „darf Ablago verwalten“ bzw. „im Verwaltungsmodus“.
- **Mein Konto** – dein [Profil](#profil) mit allen Bereichen: Konto, Sicherheit, Darstellung (Design, Schriftgröße, Startseite, geänderte Mappen hervorheben, Spaltenbreiten), Benachrichtigungen, [Abwesenheit](#abwesenheit).
- **Ablago verwalten** – nur, wenn du verwalten darfst: wechselt in den [Verwaltungsmodus](#ablago-verwalten). Im Modus steht hier **Verwaltung beenden**.
- Solange eine Abwesenheit wirkt, steht oben im Menü „Du bist abwesend“ – ein Klick darauf führt direkt dorthin –, und neben deinem Namen ist ein Punkt.
- **Hilfe** – öffnet dieses Handbuch.
- **Ablago entdecken** – Rundgang und Tipps zum Stöbern, siehe [Ablago entdecken](entdecken.md).
- **Fehler melden** – siehe [Fehler melden](#fehler-melden).
- **Über Ablago** – siehe [Über Ablago](#uber-das-dms).
- **Abmelden**.

Jeder Eintrag hat vorn ein kleines Piktogramm, damit du ihn schneller findest.

### Über Ablago { #uber-das-dms }

Das Fenster **Über Ablago** zeigt, was Ablago ist, welche **Version** gerade läuft und unter welcher **Lizenz** es steht: der Apache License 2.0 – Ablago ist freie Software, du darfst es kostenlos nutzen, verändern und weitergeben. Der Link **Quellcode** führt zum Quellcode genau dieser Version auf GitHub. Dazu gibt es Links zu diesem Handbuch, zu „Neu in dieser Version“ und den Release-Notizen und – freiwillig – zur Seite „Wer nutzt Ablago?“, auf der du erzählen kannst, wie du Ablago einsetzt.

Schließen kannst du das Fenster mit **Schließen**, mit der Esc-Taste oder mit einem Klick daneben.

![Über Ablago](bilder/ueber-dms.png){ loading=lazy }

## Mein Konto { #profil }

Mein Konto hat links fünf Bereiche (am Smartphone oben als Knöpfe):

![Mein Konto](bilder/profil.png){ loading=lazy }

### Konto

- **Name** – so erscheinst du bei „angelegt von“ und „zuletzt geändert von“ – und als Titel deiner Benutzer-Mappe.
- **E-Mail-Adresse** – damit meldest du dich an. Zum Ändern brauchst du dein aktuelles Passwort. Verschickt Ablago E-Mails, bekommt die bisherige Adresse einen Hinweis – falls jemand anderes die Adresse geändert hat, merkst du es so.
- <span id="sprache"></span>**Sprache** – in welcher Sprache Ablago mit dir spricht: Oberfläche, Meldungen und E-Mails an dich. **Wie die Ablage** folgt der Sprache, die der Administrator für alle eingestellt hat. Zur Wahl stehen die Sprachen, die er erlaubt hat. Die Seite lädt nach dem Wechsel neu. Bei maschinell übersetzten Sprachen steht ein Hinweis mit einem Link, wie du Verbesserungen beitragen kannst. Datumsangaben und Zahlen richten sich nach der Sprache. Nimmt der Administrator deine Sprache wieder heraus (z. B. weil er ihr Sprachpaket entfernt), siehst du Ablago in der Sprache der Ablage; ein Hinweis hier sagt es dir, und deine Wahl gilt wieder, sobald es die Sprache wieder gibt.
- <span id="ubersetzung-anzeigen"></span>**„Übersetzung anzeigen“ anbieten** – gibt es nur, wenn deine Ablage ein Paket zum Übersetzen hat. Mit dem Haken siehst du an langen Texten, Notizen und Volltexten den Knopf [Übersetzung anzeigen](mappen.md#inhalte-ubersetzen); ohne Haken nicht. Darunter steht, womit übersetzt wird und ob der Text dafür das Gerät deiner Ablage verlässt.

#### Meine Daten { #meine-daten }

Dein Ablago läuft bei dir zu Hause oder in deinem Betrieb, nicht bei einem Cloud-Anbieter, und es sendet keine Nutzungsdaten – auch keine anonymen. Was es über dich speichert, sind dein Konto, die Mappen und Dokumente, die du und andere anlegen, und wer wann was geändert hat.

- **Eine Kopie deiner Daten** holst du dir selbst unter [Meine Daten exportieren](#meine-daten-exportieren) – wenn der Administrator das eingeschaltet hat. Sonst bekommst du eine Auskunft über deine Daten bei ihm.
- **Soll etwas gelöscht werden** – oder willst du wissen, was sonst noch über dich gespeichert ist –, frag den Administrator deines Ablago. Er kann Mappen löschen, die du selbst nicht löschen darfst. Manches muss eine Zeit lang aufbewahrt werden (z. B. Rechnungen); dann bleibt es gesperrt, bis die Frist abgelaufen ist. Dein Konto wird nicht gelöscht, sondern deaktiviert, sobald du es einmal benutzt hast – dein Name bleibt bei dem stehen, was du angelegt hast.

#### Meine Daten exportieren

Unter **Konto → Meine Daten exportieren** bekommst du eine Kopie von allem, was du sehen darfst – in offenen Formaten (CSV, JSON, Excel, PDF, die Dokumente im Original) und lesbar ohne Ablago:

- alle Mappen, die du lesen darfst, mit ihren Dokumenten und älteren Versionen,
- deine eigenen Aufgaben, Erinnerungen, Favoriten und was du in den Papierkorb gelegt hast,
- dein eigenes Benutzerkonto (ohne Passwort).

Was dem ganzen Haushalt gehört – Löschprotokoll, gleichbedeutende Wörter der Suche, Automatisierungen –, steht nur im Vollexport des Administrators. Verweist eine Mappe auf eine, die du nicht lesen darfst, steht dort statt des Titels „nicht sichtbare Mappe“.

**Der Export ist unverschlüsselt** – bewahre die Datei sicher auf. Passwortfelder stehen nur dabei, wenn du sie sehen darfst und das ausdrücklich bestätigst; sie liegen dann im Klartext in der Datei `passwoerter.csv`. Der Export läuft im Hintergrund; ist er fertig, lädst du ihn als ZIP herunter. Es gibt immer nur deinen letzten Export – ein neuer ersetzt den alten. **Nach dem Herunterladen wird er gelöscht**, spätestens nach 7 Tagen; bis wann er bereitliegt, steht neben dem Knopf. Brauchst du ihn länger, bewahre die ZIP-Datei auf. Solange jemand [in deinem Namen arbeitet](#in-deinem-namen), lässt sich kein Export starten. **Ab Werk ist der eigene Export aus**; der Administrator schaltet ihn in der Werkbank ein. Solange er aus ist, steht an dieser Stelle ein Hinweis statt des Knopfs – eine Auskunft über deine Daten bekommst du dann beim Administrator.

### Meine Rechte

Unten im Bereich *Konto*, unter Name und E-Mail-Adresse, steht, was du je Mappentyp darfst: **anlegen, lesen, bearbeiten, löschen** und **Passwörter sehen** – jeweils mit „ja“, „nein“ oder „je nach Mappe“. „Je nach Mappe“ heißt: Es hängt von der einzelnen Mappe ab, zum Beispiel davon, ob du dort verantwortlich bist oder eine Aufgabe dazu hast. Festgelegt werden die Rechte von einem Administrator; mehr unter [Was du sehen und ändern darfst](mappen.md#was-du-sehen-und-andern-darfst).

![Meine Rechte](bilder/meine-rechte.png){ loading=lazy }

### Sicherheit

- **Passwort** – gib dein aktuelles und zweimal das neue Passwort ein (mindestens 10 Zeichen). Nach dem Ändern sind alle anderen Anmeldungen beendet.
- **Passkeys** – anmelden ohne Passwort, mit Fingerabdruck, Gesicht oder Geräte-PIN; siehe [unten](#passkeys).
- **Zwei-Faktor-Anmeldung** – siehe [unten](#zwei-faktor-anmeldung).
- **Meine angemeldeten Geräte** – überall, wo du gerade angemeldet bist, mit Browser, Gerät und letzter Aktivität; *dieses Gerät* ist markiert. **Abmelden** beendet eine einzelne Anmeldung, **Alle anderen abmelden** alle außer dieser – etwa wenn du ein Handy verloren hast. Ändere dann am besten auch dein Passwort.
- <span id="passwoerter-fuer-dokumente"></span>**Passwörter für Dokumente** – die Passwörter geschützter PDFs, die du beim [Entsperren](dokumente.md#passwortgeschuetzte-pdfs) mit **Für weitere Dokumente merken** abgelegt hast. Je Passwort siehst du den Namen, das Passwort verdeckt und wann Ablago es zuletzt benutzt hat. Mit dem Auge zeigst du es an, mit **Ändern** gibst du einen neuen Namen oder ein neues Passwort ein, und das kleine rote **×** löscht es. Bereits entsperrte Dokumente bleiben dabei entsperrt.
    - **Anzeigen und Ändern** des Passworts geht erst, nachdem du dich noch einmal bestätigt hast: mit deinem Ablago-Passwort oder, mit Zwei-Faktor-Anmeldung, auch mit einem Code aus der App. Die Bestätigung gilt fünf Minuten für diesen Bereich.
    - Die Passwörter gehören **nur dir**: Ablago speichert sie in deinem Konto, verschlüsselt mit dem Schlüssel von Ablago. In Ablago sieht sie niemand sonst, auch nicht, wer Ablago verwaltet (auch nicht im Verwaltungsmodus), und auch nicht in einer Vertretung. Über API-Schlüssel oder Pakete kommen sie nie heraus; im Vollexport fehlen sie, in der Sicherung stehen sie nur verschlüsselt. Ehrlich gesagt: Wer den Server selbst und den Schlüssel von Ablago in der Hand hat, könnte sie technisch entschlüsseln – wie jedes Passwortfeld in einer Mappe.
    - Du kannst höchstens 20 Passwörter merken.
    - Das ist **keine Passwortverwaltung**: Ablago nutzt diese Passwörter nur, um geschützte Dokumente zu öffnen, die du ablegst. Für deine Zugänge zu Websites und Apps nimm bitte einen Passwort-Manager.
- **API-Schlüssel** – damit können andere Programme in deinem Namen auf Ablago zugreifen, etwa ein Scanner. Brauchst du das nicht, kannst du diesen Abschnitt übergehen. Passwortfelder liefert ein Schlüssel nur, wenn du beim Erzeugen **Passwörter lesen** ankreuzt. Unter **Rechte** wählst du eine von drei Stufen:
    - **nur lesen** – das Programm liest alles, was du lesen darfst, und ändert nichts.
    - **lesen und schreiben** – das Programm liest und ändert alles, was du darfst, z. B. ein Scanner, der Post ablegt.
    - **nur Zähler** – für Hausautomatisierung und Anzeigen, z. B. eine Lampe bei neuer Post oder die Zahl auf dem Wand-Tablet. Der Schlüssel ruft nur deine Zahlen ab: neue Post, Zu erledigen und überfällige Fristen. Geht er verloren, erfährt jemand höchstens, wie viel Post und Aufgaben du hast – keine Titel, Absender oder Inhalte. Alles andere lehnt das Ablago ab.

    Wie du damit zum Beispiel einen Homey Pro einbindest, steht unter [Ablago in die Hausautomatisierung einbinden](hausautomatisierung.md); die Technik beschreibt das [Administratorhandbuch](https://help.ablago.app/admin/aktuell/api/#zaehler).
- <span id="papierkorb"></span>**Papierkorb** – **Beim Abmelden leeren** löscht deine gelöschten Mappen endgültig, sobald du dich abmeldest. Ohne den Haken bleiben sie so lange im [Papierkorb](ablage.md#papierkorb), wie der Administrator es eingestellt hat.

!!! note "Anmelden mit dem Firmenkonto"
    Steht auf der Anmeldeseite ein Knopf wie **Mit Firmenkonto anmelden**, meldest du dich darüber mit dem Konto deiner Firma oder deines Anmeldedienstes an. Dein Passwort für Ablago brauchst du dann nicht; Passwort und Abmelden verwaltet der Anbieter. Er sieht dabei, wann du dich anmeldest – deine Unterlagen sieht er nicht.

#### Passkeys

Mit einem **Passkey** meldest du dich ohne Passwort an: Dein Handy oder Rechner fragt nach Fingerabdruck, Gesicht oder seiner PIN, und schon bist du drin. Ein Passkey gehört zu genau dieser Adresse von Ablago – eine gefälschte Seite, die nur so aussieht, kann ihn nicht benutzen. So schützt er besser als jedes Passwort.

**Passkey hinzufügen**

1. Unter **Mein Konto → Sicherheit** bei **Passkeys** auf **Passkey hinzufügen** tippen.
2. Einen Namen vergeben, an dem du ihn später erkennst – Ablago schlägt die Art des Geräts vor, z. B. „Mein iPhone“.
3. Auf **Weiter** tippen und auf dem Gerät bestätigen (Fingerabdruck, Gesicht oder PIN). Mit einem Sicherheitsschlüssel steckst du ihn ein und tippst ihn an.

Du kannst **mehrere** Passkeys haben, etwa einen auf dem Handy, einen auf dem Laptop und einen Sicherheitsschlüssel als Reserve. Viele Handys und Passwortmanager übertragen einen Passkey auch auf deine anderen Geräte; in der Liste steht dann *auf mehreren Geräten*.

**Anmelden**

Auf der Anmeldeseite auf **Mit Passkey anmelden** tippen und auf dem Gerät bestätigen – ohne E-Mail-Adresse und Passwort. Passwort (und, falls eingerichtet, der Code aus der App) gehen weiterhin; sie sind dein Rückfall, wenn das Gerät nicht zur Hand ist.

Hast du die [Zwei-Faktor-Anmeldung](#zwei-faktor-anmeldung) eingerichtet, kannst du nach dem Passwort statt des Codes auch **Mit Passkey bestätigen**. Ist ein Passkey für deine Rolle vorgeschrieben, gehört er nach dem Passwort immer dazu. Auch wer Ablago verwaltet, kann sich beim [Verwalten](#ablago-verwalten) und vor heiklen Handlungen mit dem Passkey statt mit Passwort und Code erneut anmelden.

**Umbenennen und entfernen**

In der Liste stehen je Passkey der Name, wann du ihn hinzugefügt und wann zuletzt benutzt hast. **Umbenennen** ändert den Namen. **Entfernen** gilt sofort; liegt deine Anmeldung länger als zehn Minuten zurück, fragt Ablago vorher noch einmal nach Passwort (und Code) oder einem Passkey. Auf dem Gerät selbst bleibt der Passkey gespeichert – dort löschst du ihn in den Einstellungen.

**Gerät verloren?** Melde dich mit Passwort an und entferne den Passkey dieses Geräts. Kommst du gar nicht mehr hinein, setzt jemand, der Ablago verwaltet, deine Passkeys zurück.

!!! note "Nur über HTTPS"
    Passkeys gehen nur, wenn Ablago über **HTTPS** erreichbar ist (zum Beispiel `https://ablago.example.org`). Öffnest du Ablago über eine Adresse ohne `https://`, steht statt des Knopfs der Hinweis „Passkeys gehen, sobald Ablago über HTTPS erreichbar ist“. Bekommt Ablago eine neue Adresse (einen anderen Namen), passen vorhandene Passkeys nicht mehr: Ablago zeigt das in der Liste an, du meldest dich mit Passwort an und fügst einen neuen hinzu.

#### Zwei-Faktor-Anmeldung

Mit der Zwei-Faktor-Anmeldung fragt Ablago nach dem Passwort zusätzlich einen sechsstelligen Code ab, den eine App auf deinem Handy alle 30 Sekunden neu erzeugt. Wer nur dein Passwort kennt, kommt dann nicht hinein.

1. Unter **Mein Konto → Sicherheit** (oben rechts auf deinen Namen klicken) auf **Einrichten** klicken.
2. In einer Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator, Aegis, 2FAS, Bitwarden oder den Passwörtern auf dem iPhone) den QR-Code scannen. Geht das nicht, tippst du den Schlüssel darunter ab.
3. Den Code aus der App eingeben und **Bestätigen**.
4. Du bekommst **zehn Wiederherstellungscodes**. Speichere oder drucke sie und bewahre sie getrennt vom Handy auf – sie werden nur dieses eine Mal angezeigt.

Ab jetzt meldest du dich mit Passwort **und** Code an – oder, wenn du einen [Passkey](#passkeys) hast, mit dem Passkey allein. Ist das Handy nicht zur Hand, klickst du bei der Anmeldung auf **Wiederherstellungscode verwenden**; jeder Code gilt nur einmal. Gehen sie zur Neige, erzeugst du mit **Neue Wiederherstellungscodes** frische (die alten gelten dann nicht mehr). **Abschalten** schaltet die Zwei-Faktor-Anmeldung wieder aus; beides bestätigst du mit deinem Passwort.

Auch ein Link zum Zurücksetzen des Passworts fragt danach den Code ab. Handy verloren und keine Codes mehr? Dann setzt ein Administrator die Zwei-Faktor-Anmeldung bei deinem Benutzer zurück.

!!! note "Vorgeschrieben"
    Kann ein Administrator für deine Systemrolle (Administrator oder Mitglied) vorschreiben. Dann richtest du sie nach der Anmeldung ein, bevor es weitergeht, und kannst sie nicht selbst abschalten.

### Darstellung

- **Design** – wie Ablago für dich aussieht. **Standard** folgt dem Design, das der Administrator festgelegt hat. Gilt für dein Konto auf allen Geräten.
- **Schriftgröße auf diesem Gerät** – klein, normal oder groß. Gilt nur für das Gerät, an dem du gerade sitzt; am Smartphone kannst du eine andere Größe wählen als am PC.
- <span id="startseite"></span>**Startseite** – **Mit der Startseite beginnen** schaltet die [Startseite](startseite.md) ein oder aus; ohne sie geht es nach der Anmeldung direkt zu *Zu erledigen*. **Vierte Kachel** wählt, was neben Zu erledigen, Neue Post und Nächster Termin steht: deine Favoriten oder eine Ansicht. **Tipps auf der Startseite zeigen** schaltet den [Tipp des Tages](entdecken.md#tipps) ein oder aus.
- <span id="geaenderte"></span>**Geänderte Mappen** – **Geänderte Favoriten und eigene Mappen in Listen hervorheben** (Standard: an) setzt einen Punkt vor den Titel, bis du die Mappe öffnest. Was dahintersteckt, steht unter [Favoriten als Abo](ablage.md#favoriten-als-abo).
- **Darstellung auf diesem Gerät** – die Breite der Spalten und eingeklappte Bereiche merkt sich jedes Gerät. Ist etwas nicht mehr zu finden, stellt **Standard-Darstellung wiederherstellen** die ursprüngliche Aufteilung her.
- **Entwicklermodus** – zeigt unten rechts, wie lange ein Seitenaufruf gedauert hat.

![Mein Konto → Darstellung](bilder/profil-darstellung.png){ loading=lazy }

### Benachrichtigungen { #benachrichtigungen }

<span id="benachrichtigungen-und-ablage"></span>

- **Aufgaben** – Mappen mit offenen [Aufgaben](eingang.md) für dich stehen unter „Zu erledigen“. Zusätzlich schickt Ablago dir die **Tägliche Zusammenfassung** per E-Mail, solange du welche hast. **Tägliche Zusammenfassung meiner Aufgaben per E-Mail** bestellt sie ab oder wieder an. Sie enthält Mappentitel und Links, keine Dokumente, und geht über den Mailserver deiner Ablage. Darunter wählst du:
    - **Uhrzeit** – im 15-Minuten-Raster; *Standard* ist die Uhrzeit, die der Administrator eingestellt hat.
    - **Wochentage** – Standard Montag bis Freitag. Ohne Wochentag kommt keine Zusammenfassung.
    - **Nicht an Feiertagen** – an gesetzlichen Feiertagen des Bundeslands, das der Administrator gewählt hat, kommt keine (Standard: an). Ohne Bundesland ist der Haken ausgegraut.

- **Favoriten** – **Bei Änderungen an meinen Favoriten benachrichtigen** (Standard: an); das Hervorheben geänderter Mappen steht unter [Darstellung](#geaenderte). Was dahintersteckt, steht unter [Favoriten als Abo](ablage.md#favoriten-als-abo). Hat ein Administrator die Benachrichtigung für deine Rolle abgeschaltet, steht hier statt des ersten Schalters ein Hinweis.

- **Sofort melden (Webhooks)** – Ablago meldet an eine Adresse, sobald sich deine Zahlen ändern (neue Post, Zu erledigen, Fristen), z. B. an Homey oder Node-RED. Nur Zahlen, keine Inhalte; nur an Ziele, die ein Administrator freigegeben hat. **Probe senden**, **Ein-/Ausschalten**, **Neues Geheimnis**, **Löschen** und die **letzten Meldungen** stehen an jedem Webhook. Wie du ihn einrichtest: [In die Hausautomatisierung einbinden](hausautomatisierung.md#sofort-melden-webhook).

![Mein Konto → Benachrichtigungen](bilder/profil-benachrichtigungen.png){ loading=lazy }

### Abwesenheit

Damit während deines Urlaubs nichts liegen bleibt, trägst du unter **Abwesenheit** einen **Vertreter** ein:

- **Abwesend** an, **Vertreter** wählen (Pflicht), optional **von** und **bis** (jeweils einschließlich). Ohne Datum gilt die Abwesenheit, bis du sie ausschaltest; mit „bis“ endet sie danach von selbst.
- Solange sie wirkt, gehen **neue** Aufgaben für dich – von Hand vergebene, Erwähnungen und „passt nicht“ – an deinen Vertreter. In der Historie der Mappe steht „weitergegeben wegen Abwesenheit“. Ist dein Vertreter selbst abwesend, geht sie an dessen Vertreter weiter.
- **Alle offenen Aufgaben an ‹Vertreter› geben** gibt auch die schon vorhandenen ab. Nach deiner Rückkehr bleiben sie beim Vertreter.
- Schaltest du die Abwesenheit ein und hast noch offene Aufgaben, erinnert dich ein Hinweis daran: Neue Aufgaben gehen an den Vertreter, die bestehenden bleiben bei dir, bis du sie weitergibst.
- Dein Vertreter bekommt einen Hinweis unter „Zu erledigen“ („Du wurdest für … als Vertreter hinterlegt“). Abwesende bekommen keine tägliche Zusammenfassung.
- Ein Administrator kann deine Abwesenheit auch für dich eintragen, etwa bei Krankheit. Eintragen, Ändern und Beenden stehen in der Historie deiner Benutzer-Mappe.

#### Meine offenen Aufgaben { #meine-offenen-aufgaben }

Alle Aufgaben, die gerade bei dir liegen, gibst du unter **Zu erledigen → Mehrere Aufgaben weitergeben …** weiter – einzeln, in Gruppen oder alle auf einmal:

- **Filter** nach **Art**, **Mappentyp**, **Fälligkeit** und Suche im Titel.
- **Einzeln:** unter der Aufgabe bei *weitergeben an* eine Person wählen.
- **Mehrere:** die Kästchen links anhaken oder **Alle angezeigten auswählen** (gilt für die gerade gefilterten). In der Leiste **Ausgewählte weitergeben an** eine Person wählen – dein eingetragener Vertreter ist schon vorausgewählt.

Weitergeben geht nur an Personen, die die jeweilige Mappe lesen dürfen; was nicht geht, steht danach mit Grund da und bleibt ausgewählt. Jede Weitergabe steht in der Historie der Mappe.

![Mehrere Aufgaben weitergeben](bilder/profil-abwesenheit-aufgaben.png){ loading=lazy }

## Fehler melden

Funktioniert etwas nicht, wähle im Menü **Fehler melden**:

![Fehler melden](bilder/fehler-melden.png)

1. Beschreibe kurz, was passiert ist und was du erwartet hättest.
2. Füge bei Bedarf bis zu zwei **Screenshots** hinzu (PNG, JPEG oder WebP, je höchstens 10 MB) – auch direkt mit Strg+V ins Textfeld.
3. Unter **Technische Angaben ansehen** steht, was mitgeschickt wird: Version von Ablago, Browser und Gerät, Bildschirm- und Fenstergröße, Sprache und Zeitzone, die zuletzt besuchten Seiten (bis zu 25) und die letzten Fehler im Browser (bis zu 10). Passwörter, Inhalte von Mappen und Dokumente gehen nicht mit.
4. **Meldung senden** (geht an alle, die Ablago verwalten) – oder **In die Zwischenablage kopieren**, um es z. B. per E-Mail zu schicken.

Wer Ablago verwaltet, sieht deine Meldung in der Werkbank und meldet sich, falls es Fragen gibt.

## Ablago verwalten { #ablago-verwalten }

Darfst du Ablago verwalten, arbeitest du im Alltag trotzdem wie alle anderen – mit deinen normalen Rechten. Für die Werkbank wechselst du bewusst in den **Verwaltungsmodus**:

1. Menü unter deinem Namen → **Ablago verwalten**.
2. Melde dich **erneut an** (Passwort, dazu der Code, falls du die Zwei-Faktor-Anmeldung eingerichtet hast). Hast du dich gerade erst angemeldet, entfällt das.
3. Oben steht jetzt ein **roter Balken**: „Du verwaltest gerade Ablago.“ Solange er da ist, siehst du in der Ablage alle Mappen, auch gesperrte – öffnest du eine, die du sonst nicht sehen dürftest, steht das in ihrer Historie.

Mit **Verwaltung beenden** (im Balken oder im Menü) bist du zurück im Alltag. Nach 15 Minuten ohne Eingabe endet der Modus von selbst; was du gerade bearbeitest, bleibt erhalten – Ablago fragt nur erneut nach der Anmeldung. Am selben Tag geht es dann mit einem Klick weiter (**Wieder verwalten**). Für besonders heikle Handlungen – etwa das Notfallblatt herunterladen – fragt Ablago das Passwort immer noch einmal ab.

## Hinweis „… hat in deinem Namen gearbeitet“ { #in-deinem-namen }

Um einen Fehler nachzustellen, kann sich jemand, der Ablago verwaltet, als du anmelden. Er sieht dann genau, was du siehst – mit deinen Rechten, nicht im Verwaltungsmodus. Danach zeigt dir Ablago beim nächsten Mal oben einen Hinweis, wer das wann getan hat. Mit **Verstanden** blendest du ihn aus. Solange jemand als du arbeitet, steht bei dieser Anmeldung unter *Meine angemeldeten Geräte* der Hinweis **jemand arbeitet in deinem Namen**.
