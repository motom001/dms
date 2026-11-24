# Werkbank und Übersicht

Die **Werkbank** gibt es nur im [Verwaltungsmodus](verwalten.md#der-verwaltungsmodus): Benutzermenü → **Ablago verwalten**. Danach landest du in der **Übersicht** – sie zeigt die Meldungen deiner eigenen Bereiche. Führt dich ein Link in die Werkbank (z. B. aus einer E-Mail „Sicherung fehlgeschlagen“), landest du nach „Ablago verwalten“ genau dort. Die **Ablage** erreichst du im Modus jederzeit über **Ablage** oben, etwa um nachzusehen, was eine Mappe enthält. Links stehen die Bereiche, die du verwalten darfst, in Gruppen, geordnet nach dem, was du gerade tun willst – die Ablage aufbauen, Benutzer verwalten, Datenschutz, Post hereinholen, Daten sichern, Grundeinstellungen ändern oder einem Fehler nachgehen. Welche Bereiche du siehst, hängt von der [Vorlage](#werkbank-anpassen) ab:

<!-- bereiche:gruppen -->
| Gruppe | Bereiche |
| --- | --- |
| **Ablage aufbauen** | [Pakete](pakete.md), [Beispiel-Ablage](beispielablage.md), [Mappentypen](mappentypen.md), [Ansichten](sichten.md), [Nummernkreise](nummernkreise.md), [Automatisierungen](automatisierungen.md), [Automatisierungsvorlagen](automatisierungsvorlagen.md), [Rundgänge](rundgaenge.md), [Tipps](tipps.md) |
| **Benutzer und Sicherheit** | [Benutzer](benutzer.md), [Verschlüsselung](verschluesselung.md), [Aufbewahrung abgelaufen](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) (nur mit Archivmodus), [Stempel](stempel.md) |
| **Datenschutz** | [Datenschutz-Auskünfte](datenschutz.md#auskunft-erteilen), [Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen), [Löschprotokoll](datenschutz.md#loschprotokoll) |
| **Post und Eingänge** | [Postfächer](postfaecher.md), [Eingangsordner](eingangsordner.md) (nur wenn der Ordner eingebunden ist), [WebDAV-Laufwerk](webdav.md), [Gleichbedeutende Wörter](suche.md#gleichbedeutende-worter) |
| **Daten sichern** | [Sicherung](sicherung.md), [Vollexport](export.md), [Papierkorb](papierkorb.md), [Daten sichern → Einstellungen](daten-einstellungen.md) |
| **Einstellungen** | [E-Mail und Adresse](installation.md#e-mail-und-adresse), [Region](region.md), [Sprachen](sprachen.md), [Eigene Organisation](organisation.md), [Aufgaben](aufgaben.md#werkbank-aufgaben), [Anmeldeschutz](anmeldeschutz.md), [Designs](designs.md), [Datenbank-Anbindung](installation.md#datenbank-anbindung) |
| **Wartung und Fehlersuche** | [Systemzustand](speicherplatz.md), [Protokoll](fehlersuche.md#protokoll), [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler), [Wartung](wartungsmodus.md), [Lasttest-Daten](demo.md) |
<!-- /bereiche:gruppen -->

Jede Einstellung hat genau einen Ort. Die Adressen der Bereiche (`/werkbank/sicherung` …) sind beim Umsortieren in Version 0.116 gleich geblieben; Lesezeichen und eine gespeicherte Auswahl unter *Werkbank anpassen* gelten weiter.

Beim Aufräumen der Werkbank sind einige Bereiche zusammengezogen: **Wiederherstellen** steht als Abschnitt unter *Sicherung*, **Technik** als *Version und Updates* und die langen Datenbankzugriffe unter *Systemzustand*, **Wartungsmodus** und **Wartungsoperationen** zusammen unter *Wartung*, **Suche** unter *Suche und Volltext*, und „Darf weg“ heißt jetzt **Aufbewahrung abgelaufen**. Alte Adressen wie `/werkbank/darfweg`, `/werkbank/technik` oder `/werkbank/wartungsmodus` führen an die neue Stelle. Das Suchfeld oben in der Leiste findet einen Bereich auch unter seinem alten Namen. Seit Version 0.318 steht **Suche und Volltext** als *Text aus PDF und Texterkennung* unter [Pakete → Von Ablago mitgeliefert](pakete.md#von-ablago-mitgeliefert), ebenso „Neue PDFs automatisch verkleinern“ (bei *PDF bearbeiten*); `/werkbank/texterkennung` führt dorthin.

Welche Bereiche dort stehen, legst du unter [Werkbank anpassen](#werkbank-anpassen) fest. Ganz unten in der Leiste stehen *Projekt unterstützen* und der Link zu diesem Handbuch. Am Handy gehst du in Schritten, siehe [Werkbank am Handy](#am-handy).

Neben den Bereichen steht, wie viel dort eingerichtet ist – etwa die Zahl der Mappentypen, Nummernkreise, installierten Pakete, aktiven Benutzer oder offenen Aufgaben. Die Zahlen stehen sofort da, wenn du die Werkbank öffnest, und ändern sich, sobald du im Bereich etwas anlegst oder löschst. Ist nichts eingerichtet, steht keine Zahl da.

## So arbeitest du in der Werkbank

Bereiche, in denen du etwas anlegst und bearbeitest – egal ob viele oder wenige Einträge: Mappentypen, Ansichten, Nummernkreise, Automatisierungen, Pakete, Benutzer, Datenschutz-Auskünfte, Stempel, Aufgaben, Designs, Postfächer –, und Listen, die du durchsiehst – Papierkorb, Protokoll und Gemeldete Fehler –, sind **dreiteilig**: Wählst du links einen Bereich, steht in der Mitte seine Liste und rechts das Formular des gewählten Eintrags; mit dem grünen Knopf oben in der Liste legst du einen an – er nennt, was entsteht (**+ Mappentyp**, **+ Ansicht**, **+ Benutzer** …).

### Suchen und filtern in der Mitte { #suchen-und-filtern }

Über den Listen in der Mitte steht dasselbe **Suchfeld wie in der Ablage**, darunter die Filter der Liste und die Zahl der Treffer – bei Mappentypen, Ansichten, Nummernkreisen, Datenschutz-Auskünften und gemeldeten Fehlern; Aufgaben und Protokoll nutzen das Suchfeld bei ihren Filtern. Gesucht wird beim Tippen, ohne Groß- und Kleinschreibung und mit Umlaut-Varianten: „kuendigen“ und „kundigen“ finden „kündigen“. Mehrere Wörter müssen alle vorkommen. Das **×** im Feld oder **Esc** leert es.

Unter jedem Treffer steht, **wo** Ablago das Wort gefunden hat – fett der Bereich, dahinter die Stelle mit dem hervorgehobenen Wort, z. B. „Feld „Kündigen bis“ · Hilfetext: … bis wann du **kündigen** musst …“. Mehr als zwei Fundstellen fasst „+ 3 weitere“ zusammen. Ein Treffer im Namen ist im Namen selbst hervorgehoben. Findet die Suche nichts, setzt **Suche und Filter zurücksetzen** alles zurück.

Wo Einträge aus [Paketen](pakete.md) kommen, gibt es den Filter **Paket**: *Alle*, *Eigene (ohne Paket)* oder ein Paket, z. B. nur *Haushalt*. Fest eingebaute Einträge wie die Mappentypen *Benutzer*, *Post* und *Rolle* stehen unter *Ablago (eingebaut)*, nicht bei den eigenen. Zur Wahl stehen die Pakete, die in der Liste vorkommen. Suche und Filter wirken zusammen; die Trefferzahl zeigt das Ergebnis.

Das **Suchfeld oben in der Kopfzeile** der Ablage gibt es in der Werkbank nicht – hier suchst du in den Listen der Mitte. Der **Assistent** steht auch hier unten rechts, an derselben Stelle wie in der Ablage – am Handy ebenso, mit eigenem Streifen unten: Unter **Handbuch** sucht er in der Werkbank im **Admin-Handbuch** (in der Ablage im Benutzerhandbuch), ohne Internet im Handbuch, das deine Installation mitbringt; dazu **Tipps** und, mit einem Antwort-Paket, **Fragen** ([Benutzerhandbuch: Assistent](https://help.ablago.app/benutzer/aktuell/assistent/)).

Alle anderen Bereiche sind **zweiteilig**: links die Bereiche, rechts die ganze Seite. Kleine oder nur lesende Listen – etwa die langen Datenbankzugriffe, die gesperrten Adressen, die vorhandenen Exporte oder die letzten Zugriffe auf das WebDAV-Laufwerk – stehen dort als eigener Abschnitt mit fester Höhe, in dem du scrollst.

Jedes Formular endet mit derselben Leiste, die beim Scrollen unten sichtbar bleibt: rechts der Hauptknopf mit dem Gegenstand im Namen – etwa **Nummernkreis anlegen** oder **Postfach speichern** –, links daneben **Verwerfen**:

- **Neu anlegen:** **Entwurf verwerfen** schließt das Formular, ohne etwas anzulegen, und du bist zurück in der Liste.
- **Bearbeiten:** **Änderungen verwerfen** setzt alle Felder auf den gespeicherten Stand zurück. Beide Knöpfe gehen erst, wenn du etwas geändert hast; solange steht in der Leiste „Ungespeicherte Änderungen“.
- **Esc** im Formular wirkt wie Verwerfen. Hast du etwas geändert, fragt Ablago vorher nach.
- Klickst du mit ungespeicherten Änderungen einen anderen Eintrag oder Bereich an oder schließt den Tab, fragt Ablago nach, ob du die Änderungen verwerfen willst.

Knöpfe wie **Verbindung testen** oder **Jetzt prüfen** stehen darüber im Formular; links in der Leiste steht, wo es das gibt, **Löschen** bzw. **Entfernen**. Solange so ein Knopf arbeitet, zeigt er „Läuft …“; das Ergebnis steht direkt darunter, nicht oben auf der Seite.

Zum **Anlegen** steht in jeder Liste oben rechts ein grüner Knopf, der den Gegenstand nennt – in der Werkbank **+ Mappentyp**, **+ Nummernkreis**, **+ Vorlage** …, in der Ablage etwa **+ Vertrag**.

## Werkbank am Handy { #am-handy }

Am Handy nutzt die Werkbank den Bildschirm für den Inhalt. Wie sie aussieht, richtet sich nach der **Breite**, nicht nach dem Gerät: Bis 767 Pixel – jedes Handy – bekommst du die Handy-Ansicht, ein **iPad hochkant** (ab 768 Pixel) und quer zeigt die volle Werkbank wie am Rechner. Drehst du das Gerät, wechselt die Ansicht mit. Am iPad hochkant (768 bis 820 Pixel) beginnt die Leiste mit den Bereichen eingeklappt, damit Liste und Seite Platz haben; mit der schmalen Lasche links klappst du sie auf, und so bleibt sie dann. Eine eigene Vorlage fürs Handy gibt es nicht: Deine [Vorlage](#werkbank-anpassen) gilt auf allen Geräten.

Du gehst in Schritten wie in den Einstellungen eines Handys:

1. **Bereiche** – auf der Übersicht oben über **Bereiche ›**. Unter dem Suchfeld stehen zuerst die Bereiche **für unterwegs**: Übersicht, Systemzustand, Sicherung, Postfächer, Wartung, Benutzer, Verschlüsselung (mit dem Notfallblatt) und Pakete – was du brauchst, wenn unterwegs etwas klemmt. Darunter stehen unter **Alle Bereiche** die übrigen, nach Gruppen: Tippe auf eine Gruppe, etwa *Ablage aufbauen*, und darunter erscheinen ihre Bereiche. Ganz unten stehen ausgeblendete Bereiche zum Aufklappen, *Werkbank anpassen*, *Projekt unterstützen* und der Link zu diesem Handbuch.
2. **Liste oder Seite** – ohne die Bereiche darüber, der Inhalt beginnt oben. Darüber steht nur der Weg zurück: **‹ Ablage aufbauen** führt zu den Bereichen mit dieser Gruppe, bei den Bereichen für unterwegs **‹ Bereiche**.
3. **Eintrag** – bei Sammlungen wie Mappentypen oder Benutzern; **‹ Zur Liste** führt zurück.

Am Handy ist **nichts gesperrt**: Jeder Bereich bleibt erreichbar, auch über das Suchfeld. Mappentypen, Automatisierungen oder Pakete einstellen geht auch am Handy, am Rechner oder Tablet aber bequemer. Oben steht wie am Rechner die ruhige Zeile des [Verwaltungsmodus](verwalten.md#der-verwaltungsmodus).

### Was am Handy geht { #was-am-handy-geht }

Was du unterwegs bei einer Störung brauchst, ist am Handy **voll bedienbar** – alle Felder erreichbar, große Tippflächen, nichts breiter als der Bildschirm, das Ergebnis direkt beim Knopf:

| Handgriff | Wo |
|---|---|
| Nachsehen, ob alles läuft | **Übersicht**; der **Systemzustand** zeigt am Handy zuerst Auslastung und Speicherplatz, die Schwellen danach |
| Auf eine Meldung reagieren | **Übersicht**, z. B. nach „Sicherung fehlgeschlagen“ unter **Sicherung** erneut sichern |
| Sofort handeln | **Sicherung** → **Jetzt sichern**; **Postfächer** → **Jetzt abrufen**; **Wartung** → **Jetzt sofort sperren** bzw. **Wartung beenden**, am Handy gleich unter dem Stand |
| Benutzer | anlegen; **Zugang sperren** (etwa wenn ein Handy verloren ist) und **Überall abmelden** oben am Benutzer; **Passwort-Link erzeugen** unter *Anmeldung und Sicherheit* |
| Notfall | **Verschlüsselung** mit dem Notfallblatt; der Notfallzugang unter **Anmeldeschutz**; Verwaltung bestätigen |
| Pakete | aus dem Katalog **installieren** – Vorschau, Rechte bestätigen, fertig, mit den Vorgaben des Pakets |

**Genauso geschützt wie am Rechner:** Heikle Handlungen fragen am Handy dieselbe Rückfrage ab – der Fokus steht zuerst auf **Abbrechen** – und verlangen dieselbe frische Anmeldung wie am Rechner, z. B. wenn du den Notfallzugang aus dem Internet erlaubst. Mit einem Passkey (etwa Face ID) geht das mit einem Tippen; weniger geprüft wird am Handy nie.

Die Einleitung einer Seite steht am Handy in einer Zeile; **Mehr** zeigt den ganzen Text.

Seiten zum Aufbauen – Mappentypen, Ansichten, Nummernkreise, Automatisierungen und ihre Vorlagen, Rundgänge, Tipps, Stempel und Designs – gehen am Handy auch. Oben steht dann ruhig „Am Rechner oder Tablet bequemer.“; gesperrt oder umgeleitet wird nichts.

## Übersicht

Die Werkbank beginnt mit der **Übersicht**. Sie ist zweigeteilt wie die Startseite der Ablage: links die Bereiche, rechts breit die Übersicht selbst – am Handy die Übersicht allein, die Bereiche erreichst du dort über **Bereiche ›** oben. Ganz oben steht die Karte **[Was Ablago darf](was-ablago-darf.md)** mit deinen beiden Antworten und **Ändern …**. Darunter stehen die **Kacheln**: offene Aufgaben, Warteschlange der Texterkennung, Papierkorb, Gemeldete Fehler, Bestand (Mappen, Dokumente, Speicher, Benutzer) und Version. So siehst du zuerst, was alles ansteht.

Darunter stehen unter **Hinweise** die **Meldungen**, jede genau einmal: ein, zwei Sätze, darunter ein Knopf mit der Handlung (etwa **E-Mail einrichten**) und daneben **Zur Kenntnis nehmen** (bei reinen Hinweisen **Ausblenden**) – **Nein, danke** nur, wo der Hinweis wirklich eine Frage stellt. **Das gilt auch für Bereiche, die in deiner Vorlage ausgeblendet sind.** Sie sind nach Schwere sortiert:

1. **Rot – kritisch:** Hier geht etwas nicht oder Daten sind in Gefahr. Das musst du erledigen.
2. **Gelb – Warnung:** Etwas fehlt oder ist riskant eingerichtet.
3. **Hinweis:** Eine Empfehlung oder etwas zum Nachholen.

Innerhalb einer Stufe stehen Meldungen mit Datum (z. B. eine fehlgeschlagene Sicherung) vorn, die neueste zuerst. Ist alles eingerichtet, steht dort „Alles eingerichtet“.

![Werkbank → Übersicht](bilder/werkbank-uebersicht.png)

Kommst du nach einer Handlung zur Übersicht zurück – oder holst du den Tab wieder nach vorn –, lädt sie ihre Hinweise selbst neu; Erledigtes ist dann weg. **Neu laden** oben rechts brauchst du dafür nicht mehr, es bleibt für Ungeduldige.

**Empfohlene Pakete** stehen als **ein** Hinweis: je fehlendem Paket eine Zeile mit einem Satz, wozu (Texterkennung: damit Scans durchsuchbar werden; Benachrichtigungen: tägliche Zusammenfassung, Post für dich), und **Installieren**; darunter **Alle Pakete ansehen**. Installierte Pakete verschwinden aus der Liste, sind alle da, verschwindet der Hinweis. Umstiegs-Hinweise wie „Texterkennung ist jetzt ein Paket“ erscheinen nur bei Installationen, die von einer älteren Version kommen, nicht nach einer Neueinrichtung.

Die Zahl hinter *Übersicht* in der Leiste nennt die roten und gelben Meldungen, die noch offen sind – ohne Hinweise und ohne bewusst akzeptierte.

### Warnungen bewusst akzeptieren { #bewusst-akzeptieren }

Manche Warnung nimmst du bewusst in Kauf, etwa „Der Sicherungsordner ist kein eigenes Volume“ in einer Testinstallation. Damit sie nicht für immer oben steht, wählst du an der Meldung **Zur Kenntnis nehmen** – bei einem reinen Hinweis heißt der Knopf **Ausblenden**. Das wirkt sofort; ein paar Sekunden lang steht oben **Rückgängig**, falls du dich verklickt hast. Eine Begründung ist freiwillig: **Begründung ergänzen** gleich danach oder später unten in der Liste.

- Die Meldung wandert in den eingeklappten Abschnitt **Bewusst akzeptiert (…)** ganz unten. Dort steht, wer sie wann akzeptiert hat und mit welcher Begründung; fehlt eine, steht dort **Begründung ergänzen**. Mit **Wieder einblenden** holst du sie zurück nach oben.
- Das [Protokoll](fehlersuche.md#protokoll) hält jedes Akzeptieren und Wiedereinblenden fest (Modul *werkbank*, mit der Kennung der Meldung aus der Tabelle unten).
- **Ändert sich die Lage, steht die Meldung wieder oben:** wenn sie schwerer wird (aus einem Hinweis wird gelb, aus gelb wird rot) oder wenn sie behoben war und dieselbe Ursache erneut auftritt.
- **Rote Meldungen lassen sich nicht akzeptieren.** Sie müssen erledigt werden.

Akzeptierte Meldungen gelten für alle, die diese Installation verwalten.

Zwei Hinweise schließt du stattdessen mit einem eigenen Knopf ab – sie kommen danach nicht wieder (beides nur mit „Gesamte Verwaltung“, im Protokoll mit deinem Namen):

- **„Gut, wenn noch jemand verwalten kann, falls du mal nicht da bist.“** Ablago empfiehlt nach der Einrichtung eine zweite Person mit Verwaltungsrecht, solange nur eine Person verwalten darf. **Person einladen** führt zu *Benutzer → Neu*; die Person bekommt einen Einladungslink, danach setzt du bei ihr den Haken **Darf Ablago verwalten** (siehe [Wer darf Ablago verwalten?](verwalten.md)). Willst du das nicht, wähle **Nein, danke** – dann bleibt der Hinweis dauerhaft weg.
- **„Der Notfallzugang wurde … benutzt“** steht rot oben, nachdem jemand mit dem Notfallcode vom Notfallblatt ein neues Passwort gesetzt hat ([Ich komme nicht mehr hinein](was-ist-passiert.md#kein-zugang)). Mit **Gelesen** verschwindet er.

### Alle Meldungen der Übersicht { #meldungen }

| Meldung | Schwere | Kennung im Protokoll |
| --- | --- | --- |
| Notfallzugang ist aktiv (RESCUE-Datei) | rot | `notfallzugang` |
| Der Notfallzugang wurde mit dem Notfallcode benutzt – bis „Gelesen“ | rot | `notfallzugang.benutzt` |
| Ablago kann Heimnetz und Internet nicht unterscheiden: Anfragen kommen mit der Gateway-Adresse des Docker-Netzes an ([Heimnetz nicht bestimmbar](anmeldeschutz.md#heimnetz-nicht-bestimmbar)) | gelb | `heimnetz.gateway` |
| TRUST_PROXY nennt ein ganzes Netz statt der Adresse deines Proxys: Anfragen kommen direkt vom Gateway, und das Netz deckt es ab ([Heimnetz nicht bestimmbar](anmeldeschutz.md#heimnetz-nicht-bestimmbar)) | gelb | `proxy.netz` |
| PUID und PGID fehlen – Datenordner auf einem Ordner des NAS gehören jetzt der Vorgabe 1000:1000 ([Ohne Administratorrechte](aktualisieren.md#ohne-root)) | gelb | `kennung.puid` |
| Speicherplatzlimit erreicht | rot | `speicherplatz.grenze` |
| Der Speicherplatz wird knapp | gelb | `speicherplatz.knapp` |
| Wieder genug Platz – Wartung beenden? | gelb | `speicherplatz.wartung-beenden` |
| Automatisierungen angehalten | rot | `automatisierung.angehalten` |
| Geplante Abläufe angehalten (die Person darf sie nicht mehr ausführen) | gelb | `ablaeufe.angehalten` |
| Automatisierungen mit fehlgeschlagenen Läufen | gelb | `automatisierung.fehlgeschlagen` |
| Erinnerungen beim Update übernommen | Hinweis | `automatisierung.umgezogen` |
| Paket „Benachrichtigungen“ installiert, aber keine Tägliche Zusammenfassung eingeschaltet (fehlt das Paket, steht es unter „Empfohlene Pakete“) | Hinweis | `automatisierung.ohne-benachrichtigungen` |
| Keine eingeschaltete Automatisierung „Post für dich“ (Paket älter als 1.3.0 oder ausgeschaltet) | Hinweis | `automatisierung.ohne-post-fuer-dich` |
| Adressen nehmen [Aufrufe von außen](automatisierungen.md#aufruf-von-aussen) an – mit **Alle abschalten** statt „Ausblenden“ | Hinweis | `automatisierung.aufrufe` |
| CPU oder Arbeitsspeicher seit 5 Minuten über 90 % | gelb | `auslastung` |
| Engpass (Wartezeit, Verbindungen, Arbeiter, Überlast) | gelb | `engpass` |
| Erweiterungen der Suche fehlen oder liegen falsch | gelb | `erweiterungen` |
| Wartungsmodus angekündigt oder aktiv; aktiv mit „Wartungsmodus: nichts geht rein oder raus“ ([was ruht](wartungsmodus.md#nichts-geht-rein-oder-raus)) | gelb | `wartung` |
| Noch kein Schlüssel für Passwörter | gelb | `tresor.fehlt` |
| Der Schlüssel für Passwörter fehlt | rot | `tresor.verloren` |
| Die Schlüsseldatei passt nicht | rot | `tresor.falsch` |
| Die Schlüsseldatei liegt nicht auf einem eigenen Volume | gelb | `tresor.volume` |
| Passwörter nicht lesbar oder unverschlüsselt | gelb | `tresor.betroffen` |
| Postfach: Anmeldung abgelaufen oder entzogen | rot | `postfach.abgelaufen` |
| Postfach noch nicht angemeldet | gelb | `postfach.anmelden` |
| Die letzte Sicherung ist fehlgeschlagen | rot | `sicherung.fehler` |
| Es gibt noch keine Sicherung | gelb | `sicherung.keine` |
| Die letzte Sicherung ist älter als 2 Tage | gelb | `sicherung.alt` |
| Das Notfallblatt fehlt, gehört zu einem früheren Schlüssel, hat noch keinen Notfallcode oder sein Notfallcode wurde benutzt (Knopf **Zum Notfallblatt** führt zur [Verschlüsselung](verschluesselung.md#notfallblatt)) | gelb | `sicherung.notfallblatt` |
| Die letzte Probe-Wiederherstellung ist fehlgeschlagen | rot | `sicherung.probe-fehler` |
| Probe-Wiederherstellung fehlt oder ist alt | Hinweis | `sicherung.probe` |
| Der Sicherungsordner ist kein eigenes Volume | gelb | `sicherung.volume` |
| Sicherungen auf derselben Platte wie die Dokumente | Hinweis | `sicherung.gleiche-platte` |
| Nach der Neueinrichtung: nächster Schritt Kopie außer Haus einrichten ([Erste Sicherung](sicherung.md#erste-sicherung); ersetzt dann den Hinweis „dieselbe Platte“) | Hinweis (gelb bei derselben Platte) | `sicherung.ausser-haus` |
| Die erste Sicherung nach der Einrichtung oder ihre Probe ist fehlgeschlagen – die Ursache steht unter Werkbank → Sicherung | rot | `sicherung.erste-fehler` |
| Sicherung außer Haus fehlgeschlagen | rot | `sicherung.extern-fehler` |
| Sicherung außer Haus mehr als 2 Tage im Rückstand | gelb | `sicherung.extern-alt` |
| „Lokal nur die neueste behalten“ wirkt gerade nicht | gelb | `sicherung.nur-neueste` |
| Der [Export-Ordner](export.md#export-ordner) liegt im Sicherungsordner | rot | `export.im-sicherungsordner` |
| Exporte beim Update aus dem Sicherungsordner verschoben | Hinweis (rot, wenn etwas liegen blieb) | `export.umzug` |
| dms-komplett: Die Datenbank liegt nur im Container (`/data/postgres` ohne Volume) und ginge beim nächsten Update verloren – [Daten retten](https://help.ablago.app/installieren/aktuell/komplett/#datenbank-retten) | rot | `datenbank.ohne-volume` |
| DATABASE_URL weicht von der Datenbank-Anbindung ab | gelb | `anbindung.abweichend` |
| Datenbank-Anbindung geändert, Neustart nötig | gelb | `anbindung.neustart` |
| Ablago meldet sich noch mit MD5 an der Datenbank an – [auf SCRAM umstellen](installation.md#scram); auch im Systemzustand | gelb | `datenbank.md5` |
| DMS_LASTTEST in einer echten Installation | gelb | `lasttest` |
| Die [Beispiel-Ablage](beispielablage.md) ist angelegt (bis du sie entfernst) | Hinweis | `beispielablage` |
| Paket braucht noch Einstellungen | gelb | `paket-einstellungen` |
| Pakete angehalten – je mit Grund in Worten ([Anhalten](pakete.md#anhalten)) | gelb | `pakete.angehalten` |
| Pakete nicht vollständig – Lösungen am Paket ([Beschädigtes Paket](pakete.md#beschaedigt)) | gelb | `pakete.beschaedigt` |
| Neu: Mappentypen von Diensten im Netz ausschließen (einmal nach dem Update, mit Paketen mit Netz; „Ausblenden“) | Hinweis | `ki.typen` |
| Neu: Was Ablago darf – bitte einmal ansehen (einmal nach dem Update; „Ausblenden“) | Hinweis | `darf.neu` |
| Aus der Einrichtung übersprungen (Adresse und E-Mail-Versand; Pakete stehen unter „Empfohlene Pakete“) | Hinweis | `einrichtung` |
| Gut, wenn noch jemand verwalten kann – nur eine Person darf verwalten | Hinweis | `verwaltung.zweite-person` |
| Umgebungsvariablen, die nicht mehr nötig sind (je mit Grund) | Hinweis | `variablen` |
| Der E-Mail-Versand ist nicht eingerichtet | gelb | `mail` |
| Empfohlene Pakete: Texterkennung, Benachrichtigungen – je Zeile **Installieren** | Hinweis (gelb, sobald Scans auf die Texterkennung warten) | `pakete.empfohlen` |
| Offene gemeldete Fehler | gelb | `fehlermeldungen` |
| Eingangsordner: Dateien älter als die Grenze (Vorgabe 180 Tage) | gelb | `eingangsordner.alt` |
| Eingangsordner: alle Dateien zusammen über der Grenze (Vorgabe 2 GB) | gelb | `eingangsordner.groesse` |
| Eingangsordner: Dateien in `fehler/` | gelb | `eingangsordner.fehler` |
| Eingangsordner: mehr Dateien als die Grenze (Vorgabe 100) | gelb | `eingangsordner.anzahl` |
| Eingangsordner: Ordner gehört zu keinem Benutzer (Post ohne „An“) | gelb | `eingangsordner.ohne-person` |
| Eingangsordner: Personenordner ließ sich nach geänderter E-Mail-Adresse nicht umbenennen | gelb | `eingangsordner.umbenennen` |
| Texterkennung ist jetzt ein Paket (nur nach einem Update von einer älteren Version) | Hinweis (gelb, sobald Scans warten) | `texterkennung.paket` |
| Dokumente mit Fehler in der Texterkennung | gelb | `texterkennung.fehler` |
| Mindestens 3 Aufträge der Texterkennung in 24 Stunden wegen der [Zeitgrenze](texterkennung.md#zeitgrenze) abgebrochen | gelb | `texterkennung.zeitgrenze` |
| Ein Werkzeug zum Lesen von PDFs fehlt: kein Text aus PDFs, keine Seitenbilder ([Eingebaute Werkzeuge](fehlersuche.md#werkzeuge); Knopf **Ansehen und erneut prüfen**) | rot | `werkzeug.fehlt:poppler` |
| Ein Werkzeug zum Bearbeiten von PDFs fehlt: geschützte PDFs lassen sich nicht entsperren, Verkleinern wirkt schwächer ([Eingebaute Werkzeuge](fehlersuche.md#werkzeuge)) | gelb | `werkzeug.fehlt:qpdf` |
| Schriften für PDFs fehlen: PDFs ohne eingebettete Schriften zeigen in Seiten-, Vorschaubildern und Archivfassung keinen Text ([Eingebaute Werkzeuge](fehlersuche.md#werkzeuge)) | gelb | `schriften.fehlen` |
| Dateien zu Dokumenten fehlen im Ablageordner (z. B. `/data/files` ohne Volume) – Einzelheiten im Protokoll, Modul *Dokumente* | rot | `dateien.fehlen` |
| „Alle Dateien prüfen“ (von Hand oder [nach Zeitplan](archiv.md#alle-dateien-prufen-zeitplan)) hat Abweichungen gefunden | rot | `dateien.befund` |
| Niemand bekommt die Aufgaben ohne Empfänger | Hinweis | `aufgabenempfaenger` |
| Aufgaben bei Personen ohne Leserecht | gelb | `aufgaben.ohne-leserecht` |
| Aufgaben ohne Empfänger | Hinweis | `aufgaben.ohne-empfaenger` |
| Mappen, die nicht zur Definition passen | Hinweis | `mappen.unpassend` |

Bei Meldungen, die es je Postfach, Paket, Notfallzugang, benutztem Notfallcode, Ordner im Eingangsordner oder übersprungenem Schritt gibt, folgt im Protokoll hinter der Kennung ein Doppelpunkt und die Id, z. B. `postfach.anmelden:…`.

## Werkbank anpassen

Nicht jeder braucht jeden Bereich. Ein Haushalt fasst Nummernkreise, Postfächer oder das technische Protokoll vielleicht nie an. Unter **Werkbank anpassen** (ganz unten in der Leiste) legst du fest, welche Bereiche links stehen.

!!! info "Ausblenden schaltet nichts ab"
    Ein ausgeblendeter Bereich läuft weiter. Ein Postfach holt weiter Post ab, die Sicherung läuft weiter. Direkte Links, die Hilfe und die Knöpfe der Übersicht führen weiterhin hin. **Hinweise kommen immer durch:** Hat ein ausgeblendeter Bereich ein Problem, zum Beispiel „Sicherung zu alt“, steht es in der Übersicht, und der Bereich erscheint mit seinem Hinweis in der Leiste.

**Stufen** für alle, die verwalten – fünf, aufsteigend; jede enthält die vorige:

- **Einsteiger**: nur das Nötigste zum Einrichten und Sichern. Vorgabe bei rein privater Nutzung.
- **Haushalt**: dazu, was ein Haushalt selbst einrichtet – Mappentypen, Ansichten, Automatisierungen, Post und Eingänge, Suche, Protokoll und Wartung.
- **Selbständig**: dazu Nummernkreise, Aufbewahrung abgelaufen und Datenschutz – für Selbständige und Vermieter. Vorgabe bei beruflicher Nutzung.
- **Betrieb**: dazu Designs und Rundgänge – für Betriebe mit mehreren Leuten. Wer schon eigene Rundgänge geschrieben oder einen mitgelieferten ausgeschaltet hat, behält „Rundgänge“ auch in einer kleineren Stufe in der Leiste.
- **Alles**: jeder Bereich, auch Datenbank-Anbindung und Daten für Messungen. So bleibt es bei Installationen, die vor Version 0.70 eingerichtet wurden, bis du etwas anderes wählst.

Die Stufe wählst du im Einrichtungsassistenten im Schritt „Nutzung“ und später hier. Bestehende Installationen behalten ihre Vorlage (Haushalt, Betrieb oder Alles).

<!-- bereiche:stufen -->
| Bereich | Einsteiger | Haushalt | Selbständig | Betrieb | Alles |
| --- | :-: | :-: | :-: | :-: | :-: |
| Übersicht | ● | ● | ● | ● | ● |
| [Pakete](pakete.md) | ● | ● | ● | ● | ● |
| [Beispiel-Ablage](beispielablage.md) | ● | ● | ● | ● | ● |
| [Mappentypen](mappentypen.md) |   | ● | ● | ● | ● |
| [Ansichten](sichten.md) |   | ● | ● | ● | ● |
| [Nummernkreise](nummernkreise.md) |   |   | ● | ● | ● |
| [Automatisierungen](automatisierungen.md) |   | ● | ● | ● | ● |
| [Automatisierungsvorlagen](automatisierungsvorlagen.md) |   | ● | ● | ● | ● |
| [Rundgänge](rundgaenge.md) |   |   |   | ● | ● |
| [Tipps](tipps.md) |   | ● | ● | ● | ● |
| [Benutzer](benutzer.md) | ● | ● | ● | ● | ● |
| [Verschlüsselung](verschluesselung.md) | ● | ● | ● | ● | ● |
| [Aufbewahrung abgelaufen](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) |   |   | ● | ● | ● |
| [Stempel](stempel.md) |   | ● | ● | ● | ● |
| [Datenschutz-Auskünfte](datenschutz.md#auskunft-erteilen) |   |   | ● | ● | ● |
| [Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen) |   |   | ● | ● | ● |
| [Löschprotokoll](datenschutz.md#loschprotokoll) |   |   | ● | ● | ● |
| [Postfächer](postfaecher.md) |   | ● | ● | ● | ● |
| [Eingangsordner](eingangsordner.md) |   | ● | ● | ● | ● |
| [WebDAV-Laufwerk](webdav.md) |   | ● | ● | ● | ● |
| [Gleichbedeutende Wörter](suche.md#gleichbedeutende-worter) |   | ● | ● | ● | ● |
| [Sicherung](sicherung.md) | ● | ● | ● | ● | ● |
| [Vollexport](export.md) |   | ● | ● | ● | ● |
| [Papierkorb](papierkorb.md) | ● | ● | ● | ● | ● |
| [Daten sichern → Einstellungen](daten-einstellungen.md) |   | ● | ● | ● | ● |
| [E-Mail und Adresse](installation.md#e-mail-und-adresse) | ● | ● | ● | ● | ● |
| [Region](region.md) | ● | ● | ● | ● | ● |
| [Sprachen](sprachen.md) |   | ● | ● | ● | ● |
| [Eigene Organisation](organisation.md) |   | ● | ● | ● | ● |
| [Aufgaben](aufgaben.md#werkbank-aufgaben) |   | ● | ● | ● | ● |
| [Anmeldeschutz](anmeldeschutz.md) |   | ● | ● | ● | ● |
| [Designs](designs.md) |   |   |   | ● | ● |
| [Datenbank-Anbindung](installation.md#datenbank-anbindung) |   |   |   |   | ● |
| [Systemzustand](speicherplatz.md) | ● | ● | ● | ● | ● |
| [Protokoll](fehlersuche.md#protokoll) |   | ● | ● | ● | ● |
| [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) |   | ● | ● | ● | ● |
| [Wartung](wartungsmodus.md) |   | ● | ● | ● | ● |
| [Lasttest-Daten](demo.md) |   |   |   |   | ● |
| **Anzahl** | **10** | **29** | **34** | **36** | **38** |
<!-- /bereiche:stufen -->

Auch die Datenschutz-Bereiche folgen nur der Stufe (ab Selbständig) und deinen Ein- und Ausblendungen – ob Ablago beruflich genutzt wird, spielt für die Leiste keine Rolle. Es entscheidet weiter, ob die eigene Organisation in Auskünften erscheint.

Danach kannst du je Bereich abweichen:

- **für alle**: Der Bereich steht bei jeder Person in der Leiste, die ihn verwalten darf.
- **nur für mich**: Der Bereich steht zusätzlich nur bei dir, zum Beispiel *Protokoll*, wenn du gern nachschaust, die anderen aber nicht.

**Meine Leiste:** Jede Person, die verwaltet, kann für sich eine andere Stufe wählen – etwa **Alles**, wenn du tiefer einsteigen willst, während die anderen bei **Einsteiger** bleiben. Ohne eigene Wahl gilt die Stufe für alle; was für alle ein- oder ausgeblendet ist, gilt auch hier. Die Stufe ordnet nur die Leiste und ist kein Recht – was jemand verwalten darf, regeln die [Verwaltungsrechte](verwalten.md#der-verwaltungsmodus). Den früheren **Expertenmodus** gibt es nicht mehr: Wer ihn eingeschaltet hatte, behält seine Bereiche als Einblendung „nur für mich“.

Ist ein ausgeblendeter Bereich eingerichtet, etwa ein Postfach oder die Anmeldung über einen Anbieter, steht dabei „eingerichtet, aber ausgeblendet“. Unten in der Leiste steht, wie viele Bereiche ausgeblendet sind. Ein Klick darauf zeigt sie vorübergehend alle.

![Werkbank → Werkbank anpassen](bilder/werkbank-anpassen.png)

### Welchen Bereich brauche ich wofür?

<!-- bereiche:wofuer -->
| Bereich | Wofür | Stufe |
| --- | --- | --- |
| [Pakete](pakete.md) | Fertige Mappentypen und Ansichten installieren | ab Einsteiger |
| [Beispiel-Ablage](beispielablage.md) | Eine gefüllte Ablage zum Umsehen anlegen und wieder entfernen | ab Einsteiger |
| [Mappentypen](mappentypen.md) | Eigene Arten von Mappen bauen | ab Haushalt |
| [Ansichten](sichten.md) | Die Sammlungen links in der Ablage ordnen | ab Haushalt |
| [Nummernkreise](nummernkreise.md) | Fortlaufende Nummern, z. B. für Rechnungen | ab Selbständig |
| [Automatisierungen](automatisierungen.md) | Abläufe nach dem Muster Wenn – Und – Dann einrichten: bei einem Ereignis oder Datum Felder setzen oder jemandem eine Aufgabe geben | ab Haushalt |
| [Automatisierungsvorlagen](automatisierungsvorlagen.md) | Vorlagen für Abläufe an einer Mappe: „Aufgabe vergeben“, „Erinnern“, Wiedervorlage – wann sie laufen, wer die Aufgabe bekommt und was beim Anwenden gefragt wird | ab Haushalt |
| [Rundgänge](rundgaenge.md) | Wenn ihr im Betrieb eigene Rundgänge schreiben oder Rundgänge ein- und ausschalten wollt – kurze Führungen an der echten Oberfläche. | ab Betrieb |
| [Tipps](tipps.md) | Wenn du Tipps an eure Arbeitsweise anpassen, eigene schreiben oder einzelne ausschalten willst. | ab Haushalt |
| [Benutzer](benutzer.md) | Benutzer und Rollen anlegen | ab Einsteiger |
| [Verschlüsselung](verschluesselung.md) | Den Schlüssel für Passwörter und Sicherungen | ab Einsteiger |
| [Aufbewahrung abgelaufen](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) | Mappen, deren Aufbewahrungsfrist abgelaufen ist, prüfen und löschen (nur mit Archivmodus) | ab Selbständig |
| [Stempel](stempel.md) | Vorlagen für Stempel und Wasserzeichen beim Weitergeben | ab Haushalt |
| [Datenschutz-Auskünfte](datenschutz.md#auskunft-erteilen) | Auskunft nach Art. 15 DSGVO an Kunden, Mieter und Kontakte: anfragen, erzeugen, zustellen, Nachweis | ab Selbständig |
| [Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen) | Löschkonzept erzeugen: Lücken schließen und festlegen, welche Mappentypen Personendaten enthalten | ab Selbständig |
| [Löschprotokoll](datenschutz.md#loschprotokoll) | Nachweis, was wann gelöscht wurde – ansehen, filtern, als PDF oder CSV ausgeben | ab Selbständig |
| [Postfächer](postfaecher.md) | Post aus einem E-Mail-Konto abholen | ab Haushalt |
| [Eingangsordner](eingangsordner.md) | Scans aus einem Ordner übernehmen | ab Haushalt |
| [WebDAV-Laufwerk](webdav.md) | Die Ablage im Explorer, Finder oder in der Dateien-App einbinden und Dateien hineinlegen | ab Haushalt |
| [Gleichbedeutende Wörter](suche.md#gleichbedeutende-worter) | Gruppen von Wörtern, die die Suche gleich behandelt (z. B. Kfz, Auto, PKW): eigene anlegen, die aus Paketen ansehen | ab Haushalt |
| [Sicherung](sicherung.md) | Sicherungen einrichten, prüfen und zurückspielen | ab Einsteiger |
| [Vollexport](export.md) | Alle Daten in offenen Formaten mitnehmen | ab Haushalt |
| [Papierkorb](papierkorb.md) | Gelöschte Mappen zurückholen | ab Einsteiger |
| [Daten sichern → Einstellungen](daten-einstellungen.md) | Wie lange Gelöschtes im Papierkorb bleibt und ob Benutzer ihre eigenen Daten exportieren dürfen | ab Haushalt |
| [E-Mail und Adresse](installation.md#e-mail-und-adresse) | E-Mail-Versand und Adresse von Ablago | ab Einsteiger |
| [Region](region.md) | Land, Bundesland und Zeitzone – für Feiertage, „heute“ und Uhrzeiten von Erinnerungen und Zusammenfassungen | ab Einsteiger |
| [Sprachen](sprachen.md) | Wenn in deiner Ablage auch Englisch oder eine weitere Sprache gesprochen wird. | ab Haushalt |
| [Eigene Organisation](organisation.md) | Ob die Ablage auch beruflich genutzt wird, dazu Name, Anschrift und Verantwortliche des eigenen Betriebs – gepflegt an der Organisation in der Ablage | ab Haushalt |
| [Aufgaben](aufgaben.md#werkbank-aufgaben) | Alle offenen Aufgaben aller Benutzer im Blick behalten | ab Haushalt |
| [Anmeldeschutz](anmeldeschutz.md) | Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen | ab Haushalt |
| [Designs](designs.md) | Logo, Farben und eigenes CSS | ab Betrieb |
| [Datenbank-Anbindung](installation.md#datenbank-anbindung) | Die Verbindung zur Datenbank | nur Alles |
| [Systemzustand](speicherplatz.md) | Sehen, wie es dem Server geht: Speicherplatz, PDFs verkleinern, Auslastung von CPU, Arbeitsspeicher, Netzwerk und Datenbank, Version und Updates | ab Einsteiger |
| [Protokoll](fehlersuche.md#protokoll) | Das technische Protokoll lesen | ab Haushalt |
| [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) | Fehler, die Benutzer gemeldet haben | ab Haushalt |
| [Wartung](wartungsmodus.md) | Benutzer vorübergehend aussperren (Wartungsmodus) und einmalige Pflegearbeiten | ab Haushalt |
| [Lasttest-Daten](demo.md) | Viele Mappen für Lasttests und Messungen | nur Alles |
<!-- /bereiche:wofuer -->
