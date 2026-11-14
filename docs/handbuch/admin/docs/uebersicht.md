# Werkbank und Übersicht

Die **Werkbank** gibt es nur im [Verwaltungsmodus](verwalten.md#der-verwaltungsmodus): Benutzermenü → **Ablago verwalten**. Danach landest du in der **Übersicht** – sie zeigt die Meldungen deiner eigenen Bereiche. Führt dich ein Link in die Werkbank (z. B. aus einer E-Mail „Sicherung fehlgeschlagen“), landest du nach „Ablago verwalten“ genau dort. Die **Ablage** erreichst du im Modus jederzeit über **Ablage** oben, etwa um nachzusehen, was eine Mappe enthält. Links stehen die Bereiche, die du verwalten darfst, in Gruppen, geordnet nach dem, was du gerade tun willst – die Ablage aufbauen, Benutzer verwalten, Datenschutz (nur bei beruflicher Nutzung), Post hereinholen, Daten sichern, Grundeinstellungen ändern oder einem Fehler nachgehen. Welche Bereiche du siehst, hängt von der [Vorlage](#werkbank-anpassen) ab:

<!-- bereiche:gruppen -->
| Gruppe | Bereiche |
| --- | --- |
| **Ablage aufbauen** | [Pakete](pakete.md), [Mappentypen](mappentypen.md), [Ansichten](sichten.md), [Nummernkreise](nummernkreise.md), [Automatisierungen](automatisierungen.md), [Automatisierungsvorlagen](automatisierungsvorlagen.md) |
| **Benutzer und Sicherheit** | [Benutzer](benutzer.md), [Verschlüsselung](verschluesselung.md), [Aufbewahrung abgelaufen](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) (nur mit Archivmodus), [Stempel](stempel.md) |
| **Datenschutz** | [Auskünfte](datenschutz.md#auskunft-erteilen) (nur bei beruflicher Nutzung), [Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen) (nur bei beruflicher Nutzung), [Löschprotokoll](datenschutz.md#loschprotokoll) (nur bei beruflicher Nutzung) |
| **Post und Eingänge** | [Postfächer](postfaecher.md), [Eingangsordner](eingangsordner.md) (nur wenn der Ordner eingebunden ist), [WebDAV-Laufwerk](webdav.md), [Suche und Volltext](texterkennung.md), [Gleichbedeutende Wörter](suche.md#gleichbedeutende-worter) |
| **Daten sichern** | [Sicherung](sicherung.md), [Vollexport](export.md), [Papierkorb](papierkorb.md) |
| **Einstellungen** | [E-Mail und Adresse](installation.md#e-mail-und-adresse), [Region](region.md), [Sprachen](sprachen.md), [Eigene Organisation](organisation.md), [Aufgaben](aufgaben.md), [Anmeldeschutz](anmeldeschutz.md), [Designs](designs.md), [Datenbank-Anbindung](installation.md#datenbank-anbindung) |
| **Wartung und Fehlersuche** | [Systemzustand](speicherplatz.md), [Protokoll](fehlersuche.md#protokoll), [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler), [Wartung](wartungsmodus.md), [Demo-Daten](demo.md) |
<!-- /bereiche:gruppen -->

Jede Einstellung hat genau einen Ort. Die Adressen der Bereiche (`/werkbank/sicherung` …) sind beim Umsortieren in Version 0.116 gleich geblieben; Lesezeichen und eine gespeicherte Auswahl unter *Werkbank anpassen* gelten weiter.

Beim Aufräumen der Werkbank sind einige Bereiche zusammengezogen: **Wiederherstellen** steht als Abschnitt unter *Sicherung*, **Technik** als *Version und Updates* und die langen Datenbankzugriffe unter *Systemzustand*, **Wartungsmodus** und **Wartungsoperationen** zusammen unter *Wartung*, **Suche** unter *Suche und Volltext*, und „Darf weg“ heißt jetzt **Aufbewahrung abgelaufen**. Alte Adressen wie `/werkbank/darfweg`, `/werkbank/technik` oder `/werkbank/wartungsmodus` führen an die neue Stelle. Das Suchfeld oben in der Leiste findet einen Bereich auch unter seinem alten Namen.

Welche Bereiche dort stehen, legst du unter [Werkbank anpassen](#werkbank-anpassen) fest. Am Smartphone gehst du in Schritten: oben die Gruppe wählen, darunter den Bereich, bei großen Sammlungen dann den Eintrag – mit **← Bereiche** bzw. **← Zur Liste** kommst du zurück. Ganz unten in der Leiste stehen *Projekt unterstützen* und der Link zu diesem Handbuch.

Neben den Bereichen steht, wie viel dort eingerichtet ist – etwa die Zahl der Mappentypen, Nummernkreise, installierten Pakete, aktiven Benutzer oder offenen Aufgaben. Die Zahlen stehen sofort da, wenn du die Werkbank öffnest, und ändern sich, sobald du im Bereich etwas anlegst oder löschst. Ist nichts eingerichtet, steht keine Zahl da.

## So arbeitest du in der Werkbank

Bereiche, in denen du etwas anlegst und bearbeitest – egal ob viele oder wenige Einträge: Mappentypen, Ansichten, Nummernkreise, Automatisierungen, Pakete, Benutzer, Datenschutz-Auskünfte, Stempel, Aufgaben, Designs, Postfächer –, und Listen, die du durchsiehst – Papierkorb, Protokoll und Gemeldete Fehler –, sind **dreiteilig**: Wählst du links einen Bereich, steht in der Mitte seine Liste und rechts das Formular des gewählten Eintrags; mit **+ Neu** legst du einen an.

### Suchen und filtern in der Mitte { #suchen-und-filtern }

Über den Listen in der Mitte steht dasselbe **Suchfeld wie in der Ablage**, darunter die Filter der Liste und die Zahl der Treffer – bei Mappentypen, Ansichten, Nummernkreisen, Datenschutz-Auskünften und gemeldeten Fehlern; Aufgaben und Protokoll nutzen das Suchfeld bei ihren Filtern. Gesucht wird beim Tippen, ohne Groß- und Kleinschreibung und mit Umlaut-Varianten: „kuendigen“ und „kundigen“ finden „kündigen“. Mehrere Wörter müssen alle vorkommen. Das **×** im Feld oder **Esc** leert es.

Unter jedem Treffer steht, **wo** Ablago das Wort gefunden hat – fett der Bereich, dahinter die Stelle mit dem hervorgehobenen Wort, z. B. „Feld „Kündigen bis“ · Hilfetext: … bis wann du **kündigen** musst …“. Mehr als zwei Fundstellen fasst „+ 3 weitere“ zusammen. Ein Treffer im Namen ist im Namen selbst hervorgehoben. Findet die Suche nichts, setzt **Suche und Filter zurücksetzen** alles zurück.

Wo Einträge aus [Paketen](pakete.md) kommen, gibt es den Filter **Paket**: *Alle*, *Eigene (ohne Paket)* oder ein Paket, z. B. nur *Haushalt*. Zur Wahl stehen die Pakete, die in der Liste vorkommen. Suche und Filter wirken zusammen; die Trefferzahl zeigt das Ergebnis.

Das **Suchfeld oben in der Kopfzeile** der Ablage gibt es in der Werkbank nicht – hier suchst du in den Listen der Mitte. Der **Assistent** unten rechts ist auch hier da: Unter **Handbuch** sucht er in der Werkbank im **Admin-Handbuch** (in der Ablage im Benutzerhandbuch), ohne Internet im Handbuch, das deine Installation mitbringt; dazu **Tipps** und, mit einem Antwort-Paket, **Fragen** ([Benutzerhandbuch: Assistent](https://help.ablago.app/benutzer/aktuell/assistent/)).

Alle anderen Bereiche sind **zweiteilig**: links die Bereiche, rechts die ganze Seite. Kleine oder nur lesende Listen – etwa die langen Datenbankzugriffe, die gesperrten Adressen, die vorhandenen Exporte oder die letzten Zugriffe auf das WebDAV-Laufwerk – stehen dort als eigener Abschnitt mit fester Höhe, in dem du scrollst. Am Smartphone führt **← Bereiche** von einer solchen Seite direkt zurück zur Auswahl der Bereiche.

Jedes Formular endet mit derselben Leiste, die beim Scrollen unten sichtbar bleibt: rechts der Hauptknopf mit dem Gegenstand im Namen – etwa **Nummernkreis anlegen** oder **Postfach speichern** –, links daneben **Verwerfen**:

- **Neu anlegen:** **Entwurf verwerfen** schließt das Formular, ohne etwas anzulegen, und du bist zurück in der Liste.
- **Bearbeiten:** **Änderungen verwerfen** setzt alle Felder auf den gespeicherten Stand zurück. Beide Knöpfe gehen erst, wenn du etwas geändert hast; solange steht in der Leiste „Ungespeicherte Änderungen“.
- **Esc** im Formular wirkt wie Verwerfen. Hast du etwas geändert, fragt Ablago vorher nach.
- Klickst du mit ungespeicherten Änderungen einen anderen Eintrag oder Bereich an oder schließt den Tab, fragt Ablago nach, ob du die Änderungen verwerfen willst.

Knöpfe wie **Verbindung testen** oder **Jetzt prüfen** stehen darüber im Formular; links in der Leiste steht, wo es das gibt, **Löschen** bzw. **Entfernen**. Solange so ein Knopf arbeitet, zeigt er „Läuft …“; das Ergebnis steht direkt darunter, nicht oben auf der Seite.

Zum **Anlegen** steht in jeder Liste oben rechts der grüne Knopf **+ Neu** – in der Werkbank wie in der Ablage.

## Übersicht

Die Werkbank beginnt mit der **Übersicht**. Oben stehen die **Kacheln**: offene Aufgaben, Warteschlange der Texterkennung, Papierkorb, Gemeldete Fehler, Bestand (Mappen, Dokumente, Speicher, Benutzer) und Version. So siehst du zuerst, was alles ansteht.

Darunter stehen die **Meldungen**, jeweils mit einem Knopf in den passenden Bereich. **Das gilt auch für Bereiche, die in deiner Vorlage ausgeblendet sind.** Sie sind nach Schwere sortiert:

1. **Rot – kritisch:** Hier geht etwas nicht oder Daten sind in Gefahr. Das musst du erledigen.
2. **Gelb – Warnung:** Etwas fehlt oder ist riskant eingerichtet.
3. **Hinweis:** Eine Empfehlung oder etwas zum Nachholen.

Innerhalb einer Stufe stehen Meldungen mit Datum (z. B. eine fehlgeschlagene Sicherung) vorn, die neueste zuerst. Ist alles eingerichtet, steht dort „Alles eingerichtet“.

![Werkbank → Übersicht](bilder/werkbank-uebersicht.png)

Die Zahl hinter *Übersicht* in der Leiste nennt die roten und gelben Meldungen, die noch offen sind – ohne Hinweise und ohne bewusst akzeptierte.

### Warnungen bewusst akzeptieren { #bewusst-akzeptieren }

Manche Warnung nimmst du bewusst in Kauf, etwa „Der Sicherungsordner ist kein eigenes Volume“ in einer Testinstallation. Damit sie nicht für immer oben steht, wählst du an der Meldung **Zur Kenntnis nehmen**, auf Wunsch mit einer kurzen Begründung, und dann **Akzeptieren**.

- Die Meldung wandert in den eingeklappten Abschnitt **Bewusst akzeptiert (…)** ganz unten. Dort steht, wer sie wann akzeptiert hat und mit welcher Begründung. Mit **Wieder einblenden** holst du sie zurück nach oben.
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
| Speicherplatzlimit erreicht | rot | `speicherplatz.grenze` |
| Der Speicherplatz wird knapp | gelb | `speicherplatz.knapp` |
| Wieder genug Platz – Wartung beenden? | gelb | `speicherplatz.wartung-beenden` |
| Automatisierungen angehalten | rot | `automatisierung.angehalten` |
| Geplante Abläufe angehalten (die Person darf sie nicht mehr ausführen) | gelb | `ablaeufe.angehalten` |
| Automatisierungen mit fehlgeschlagenen Läufen | gelb | `automatisierung.fehlgeschlagen` |
| Erinnerungen beim Update übernommen | Hinweis | `automatisierung.umgezogen` |
| Ohne Paket „Benachrichtigungen“ keine Tägliche Zusammenfassung, keine Favoriten-Meldungen und kein „Post für dich“ | Hinweis | `automatisierung.ohne-benachrichtigungen` |
| Keine eingeschaltete Automatisierung „Post für dich“ (Paket älter als 1.3.0 oder ausgeschaltet) | Hinweis | `automatisierung.ohne-post-fuer-dich` |
| Adressen nehmen [Aufrufe von außen](automatisierungen.md#aufruf-von-aussen) an – mit **Alle abschalten** statt „Zur Kenntnis nehmen“ | Hinweis | `automatisierung.aufrufe` |
| CPU oder Arbeitsspeicher seit 5 Minuten über 90 % | gelb | `auslastung` |
| Engpass (Wartezeit, Verbindungen, Arbeiter, Überlast) | gelb | `engpass` |
| Erweiterungen der Suche fehlen oder liegen falsch | gelb | `erweiterungen` |
| Wartungsmodus angekündigt oder aktiv | gelb | `wartung` |
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
| Sicherung außer Haus fehlgeschlagen | rot | `sicherung.extern-fehler` |
| Sicherung außer Haus mehr als 2 Tage im Rückstand | gelb | `sicherung.extern-alt` |
| Der [Export-Ordner](export.md#export-ordner) liegt im Sicherungsordner | rot | `export.im-sicherungsordner` |
| Exporte beim Update aus dem Sicherungsordner verschoben | Hinweis (rot, wenn etwas liegen blieb) | `export.umzug` |
| dms-komplett: Die Datenbank liegt nur im Container (`/data/postgres` ohne Volume) und ginge beim nächsten Update verloren – [Daten retten](https://help.ablago.app/installieren/aktuell/komplett/#datenbank-retten) | rot | `datenbank.ohne-volume` |
| DATABASE_URL weicht von der Datenbank-Anbindung ab | gelb | `anbindung.abweichend` |
| Datenbank-Anbindung geändert, Neustart nötig | gelb | `anbindung.neustart` |
| DMS_LASTTEST in einer echten Installation | gelb | `lasttest` |
| Paket braucht noch Einstellungen | gelb | `paket-einstellungen` |
| Neu: Mappentypen von KI-Diensten ausschließen (einmal nach dem Update, mit KI-Paketen; „Verstanden“) | Hinweis | `ki.typen` |
| Aus der Einrichtung übersprungen | Hinweis | `einrichtung` |
| Gut, wenn noch jemand verwalten kann – nur eine Person darf verwalten | Hinweis | `verwaltung.zweite-person` |
| Umgebungsvariablen, die nicht mehr nötig sind (je mit Grund) | Hinweis | `variablen` |
| Der E-Mail-Versand ist nicht eingerichtet | gelb | `mail` |
| Offene gemeldete Fehler | gelb | `fehlermeldungen` |
| Eingangsordner: Dateien älter als die Grenze (Vorgabe 180 Tage) | gelb | `eingangsordner.alt` |
| Eingangsordner: alle Dateien zusammen über der Grenze (Vorgabe 2 GB) | gelb | `eingangsordner.groesse` |
| Eingangsordner: Dateien in `fehler/` | gelb | `eingangsordner.fehler` |
| Eingangsordner: mehr Dateien als die Grenze (Vorgabe 100) | gelb | `eingangsordner.anzahl` |
| Eingangsordner: Ordner gehört zu keinem Benutzer (Post ohne „An“) | gelb | `eingangsordner.ohne-person` |
| Eingangsordner: Personenordner ließ sich nach geänderter E-Mail-Adresse nicht umbenennen | gelb | `eingangsordner.umbenennen` |
| Texterkennung ist jetzt ein Paket | Hinweis (gelb, sobald Scans warten) | `texterkennung.paket` |
| Dokumente mit Fehler in der Texterkennung | gelb | `texterkennung.fehler` |
| Dateien zu Dokumenten fehlen im Ablageordner (z. B. `/data/files` ohne Volume) – Einzelheiten im Protokoll, Modul *Dokumente* | rot | `dateien.fehlen` |
| Niemand bekommt die Aufgaben ohne Empfänger | Hinweis | `aufgabenempfaenger` |
| Aufgaben bei Personen ohne Leserecht | gelb | `aufgaben.ohne-leserecht` |
| Aufgaben ohne Empfänger | Hinweis | `aufgaben.ohne-empfaenger` |
| Mappen, die nicht zur Definition passen | Hinweis | `mappen.unpassend` |

Bei Meldungen, die es je Postfach, Paket, Notfallzugang, benutztem Notfallcode, Ordner im Eingangsordner oder übersprungenem Schritt gibt, folgt im Protokoll hinter der Kennung ein Doppelpunkt und die Id, z. B. `postfach.anmelden:…`.

## Werkbank anpassen

Nicht jeder braucht jeden Bereich. Ein Haushalt fasst Nummernkreise, Postfächer oder das technische Protokoll vielleicht nie an. Unter **Werkbank anpassen** (ganz unten in der Leiste) legst du fest, welche Bereiche links stehen.

!!! info "Ausblenden schaltet nichts ab"
    Ein ausgeblendeter Bereich läuft weiter. Ein Postfach holt weiter Post ab, die Sicherung läuft weiter. Direkte Links, die Hilfe und die Knöpfe der Übersicht führen weiterhin hin. **Hinweise kommen immer durch:** Hat ein ausgeblendeter Bereich ein Problem, zum Beispiel „Sicherung zu alt“, steht es in der Übersicht, und der Bereich erscheint mit seinem Hinweis in der Leiste.

**Vorlagen** für alle, die verwalten:

- **Haushalt**: schlank, nur was eine Familie zum Einrichten und Sichern braucht. Neue Installationen beginnen damit. **Selbständige und kleine Betriebe** wählen gleich nach der Einrichtung **Betrieb**.
<!-- bereiche:organisation -->
- **Betrieb**: zusätzlich Nummernkreise, Automatisierungen, Automatisierungsvorlagen, Aufbewahrung abgelaufen, Auskünfte, Löschkonzept, Löschprotokoll, Postfächer, Eingangsordner, Suche und Volltext, Gleichbedeutende Wörter, Anmeldeschutz, Designs, Protokoll, Gemeldete Fehler, Wartung.
<!-- /bereiche:organisation -->
- **Alles**: jeder Bereich. So bleibt es bei Installationen, die vor Version 0.70 eingerichtet wurden, bis du etwas anderes wählst.

Danach kannst du je Bereich abweichen:

- **für alle**: Der Bereich steht bei jeder Person in der Leiste, die ihn verwalten darf.
- **nur für mich**: Der Bereich steht zusätzlich nur bei dir, zum Beispiel *Protokoll*, wenn du gern nachschaust, die anderen aber nicht.

**Expertenmodus:** Manche Bereiche braucht ein Haushalt selten, sie sind aber nützlich, wenn man tiefer einsteigen will – derzeit die [Suche](suche.md) mit Tippfehlern und gleichbedeutenden Wörtern. Die Vorlage **Haushalt** blendet sie aus; mit dem Haken **Expertenmodus – nur für mich** erscheinen sie in deiner Leiste. Das gilt nur für dich und ist kein Recht – die anderen, die verwalten, sehen ihre eigene Leiste. In der Liste der Bereiche stehen sie mit „im Expertenmodus“. Bei **Betrieb** und **Alles** sind sie ohnehin zu sehen.

Ist ein ausgeblendeter Bereich eingerichtet, etwa ein Postfach oder die Anmeldung über einen Anbieter, steht dabei „eingerichtet, aber ausgeblendet“. Unten in der Leiste steht, wie viele Bereiche ausgeblendet sind. Ein Klick darauf zeigt sie vorübergehend alle.

![Werkbank → Werkbank anpassen](bilder/werkbank-anpassen.png)

### Welchen Bereich brauche ich wofür?

<!-- bereiche:wofuer -->
| Bereich | Wofür | In der Vorlage |
| --- | --- | --- |
| [Pakete](pakete.md) | Fertige Mappentypen und Ansichten installieren | Haushalt, Betrieb |
| [Mappentypen](mappentypen.md) | Eigene Arten von Mappen bauen | Haushalt, Betrieb |
| [Ansichten](sichten.md) | Die Sammlungen links in der Ablage ordnen | Haushalt, Betrieb |
| [Nummernkreise](nummernkreise.md) | Fortlaufende Nummern, z. B. für Rechnungen | Betrieb |
| [Automatisierungen](automatisierungen.md) | Abläufe nach dem Muster Wenn – Und – Dann einrichten: bei einem Ereignis oder Datum Felder setzen oder jemandem eine Aufgabe geben | Betrieb, Haushalt im Expertenmodus |
| [Automatisierungsvorlagen](automatisierungsvorlagen.md) | Vorlagen für Abläufe an einer Mappe: „Aufgabe vergeben“, „Erinnern“, Wiedervorlage – wann sie laufen, wer die Aufgabe bekommt und was beim Anwenden gefragt wird | Betrieb, Haushalt im Expertenmodus |
| [Benutzer](benutzer.md) | Benutzer und Rollen anlegen | Haushalt, Betrieb |
| [Verschlüsselung](verschluesselung.md) | Den Schlüssel für Passwörter und Sicherungen | Haushalt, Betrieb |
| [Aufbewahrung abgelaufen](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) | Mappen, deren Aufbewahrungsfrist abgelaufen ist, prüfen und löschen (nur mit Archivmodus) | Betrieb |
| [Stempel](stempel.md) | Vorlagen für Stempel und Wasserzeichen beim Weitergeben | Haushalt, Betrieb |
| [Auskünfte](datenschutz.md#auskunft-erteilen) | Auskunft nach Art. 15 DSGVO an Kunden, Mieter und Kontakte: anfragen, erzeugen, zustellen, Nachweis | Betrieb |
| [Löschkonzept](loeschkonzept.md#aus-dem-dms-erzeugen) | Löschkonzept erzeugen: Lücken schließen und festlegen, welche Mappentypen Personendaten enthalten | Betrieb |
| [Löschprotokoll](datenschutz.md#loschprotokoll) | Nachweis, was wann gelöscht wurde – ansehen, filtern, als PDF oder CSV ausgeben | Betrieb |
| [Postfächer](postfaecher.md) | Post aus einem E-Mail-Konto abholen | Betrieb |
| [Eingangsordner](eingangsordner.md) | Scans aus einem Ordner übernehmen | Betrieb |
| [WebDAV-Laufwerk](webdav.md) | Die Ablage im Explorer, Finder oder in der Dateien-App einbinden und Dateien hineinlegen | Haushalt, Betrieb |
| [Suche und Volltext](texterkennung.md) | Text in gescannten Dokumenten erkennen, Archivfassung, PDFs verkleinern, Tippfehler und Wörterverzeichnis für die Suche | Betrieb, Haushalt im Expertenmodus |
| [Gleichbedeutende Wörter](suche.md#gleichbedeutende-worter) | Gruppen von Wörtern, die die Suche gleich behandelt (z. B. Kfz, Auto, PKW): eigene anlegen, die aus Paketen ansehen | Betrieb, Haushalt im Expertenmodus |
| [Sicherung](sicherung.md) | Sicherungen einrichten, prüfen und zurückspielen | Haushalt, Betrieb |
| [Vollexport](export.md) | Alle Daten in offenen Formaten mitnehmen | Haushalt, Betrieb |
| [Papierkorb](papierkorb.md) | Gelöschte Mappen zurückholen | Haushalt, Betrieb |
| [E-Mail und Adresse](installation.md#e-mail-und-adresse) | E-Mail-Versand und Adresse von Ablago | Haushalt, Betrieb |
| [Region](region.md) | Land, Bundesland und Zeitzone – für Feiertage, „heute“ und Uhrzeiten von Erinnerungen und Zusammenfassungen | Haushalt, Betrieb |
| [Sprachen](sprachen.md) | Wenn in deiner Ablage auch Englisch oder eine weitere Sprache gesprochen wird. | Haushalt, Betrieb |
| [Eigene Organisation](organisation.md) | Ob die Ablage auch beruflich genutzt wird, dazu Name, Anschrift und Verantwortliche des eigenen Betriebs – gepflegt an der Organisation in der Ablage | Haushalt, Betrieb |
| [Aufgaben](aufgaben.md) | Alle offenen Aufgaben aller Benutzer im Blick behalten | Haushalt, Betrieb |
| [Anmeldeschutz](anmeldeschutz.md) | Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen | Betrieb |
| [Designs](designs.md) | Logo, Farben und eigenes CSS | Betrieb |
| [Datenbank-Anbindung](installation.md#datenbank-anbindung) | Die Verbindung zur Datenbank | nur Alles |
| [Systemzustand](speicherplatz.md) | Sehen, wie es dem Server geht: Speicherplatz, Auslastung von CPU, Arbeitsspeicher, Netzwerk und Datenbank, Version und Updates | Haushalt, Betrieb |
| [Protokoll](fehlersuche.md#protokoll) | Das technische Protokoll lesen | Betrieb |
| [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) | Fehler, die Benutzer gemeldet haben | Betrieb |
| [Wartung](wartungsmodus.md) | Benutzer vorübergehend aussperren (Wartungsmodus) und einmalige Pflegearbeiten | Betrieb |
| [Demo-Daten](demo.md) | Beispielmappen zum Ausprobieren | nur Alles |
<!-- /bereiche:wofuer -->
