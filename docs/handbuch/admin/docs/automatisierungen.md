# Automatisierungen

Mit einer **Automatisierung** erledigt Ablago etwas von selbst: **Wenn** etwas passiert (ein Ereignis oder ein Datum), **und** die Bedingungen stimmen, **dann** setzt es Felder oder gibt jemandem eine Aufgabe – **sonst** auf Wunsch etwas anderes. Du findest sie unter **Werkbank → Ablage aufbauen → Automatisierungen**. Im Haushalt erscheint der Bereich im **Expertenmodus** (Werkbank → Werkbank anpassen), in Betrieben immer.

![Werkbank → Automatisierungen: Liste und Editor](bilder/werkbank-automatisierungen.png)

Links stehen alle Automatisierungen mit Name, Kurzform („Wenn Vertrag: Kündigung bis in 30 Tagen → Aufgabe an Verantwortlich“), an/aus, Nummer in der Reihenfolge und dem letzten Lauf. Rechts ist eine Automatisierung wie ein [Mappentyp](mappentypen.md#aufbau-des-editors) gegliedert: oben die **Sprungleiste** mit **Alle aufklappen / Alle zuklappen**, darunter die Bereiche **Grunddaten** (Name, Reihenfolge, Beschreibung) **→ Wenn** (mit den Und-Bedingungen) **→ Dann** (mit Sonst) **→ Ausprobieren → Verlauf → Fassungen**; die letzten drei gibt es erst nach dem Anlegen. Eingeklappt zeigt jeder Bereich eine Kurzinfo, etwa den Auslöser oder die Dann- und Sonst-Karten; was du aufklappst, merkt sich dein Gerät je Automatisierung. **Automatisierung speichern** unten speichert Grunddaten, Wenn, Dann und Sonst auf einmal. Was nicht passt, steht im Bereich, zu dem es gehört; bei einer gespeicherten Automatisierung ist der Bereich zusätzlich rot markiert, und ein Fehler beim Speichern klappt ihn auf. **An/aus**, **Kopieren**, **Ausprobieren** und **Wiederherstellen** wirken sofort.

In *Wenn* und *Dann* baust du die Automatisierung aus Karten zusammen – vier Kästen untereinander, verbunden mit Pfeilen:

| Bereich | Was hinein gehört |
|---|---|
| **Wenn** | genau eine Karte: ein Ereignis (Mappe angelegt, gespeichert – auf Wunsch nur bei bestimmten Feldern und **auch beim Anlegen** –, Notiz, Dokument hochgeladen, Favorit geändert, Kontosperre …), **Datum erreicht**, **Zeitplan** oder eine [Werkbank-Karte](#werkbank-karten) (**Fehler gemeldet**, **Protokollmeldung**, **Neue Version verfügbar**) |
| **Und** | keine, eine oder mehrere Bedingungen: Feldwerte wie bei den [Ansichten](sichten.md), „Mappe ist in Ansicht …“, „Mappe ist Favorit von …“, Gruppen mit „alle“ oder „eine genügt“; jede Bedingung lässt sich mit **nicht** umkehren |
| **Dann** | eine oder mehrere Karten, der Reihe nach: **Feld ändern**, **Aufgabe / Benachrichtigung**, **Tägliche Zusammenfassung senden**, **Favoriten-Änderungen melden**, **Anmeldeschutz melden**, **Paket nach Zeitplan ausführen**, **Sicherung anstoßen**, **Danach keine weiteren Automatisierungen** |
| **Sonst** | keine oder mehrere Karten wie bei Dann – sie laufen, wenn die Und-Bedingungen **nicht** zutreffen (siehe [Sonst](#sonst)) |

Was man an **einer** Mappe von Hand anstößt – „Aufgabe vergeben“, „Erinnern“, Wiedervorlage –, sind [Automatisierungsvorlagen](automatisierungsvorlagen.md). Sie laufen über denselben Motor, mit den Rechten der Person, die sie anwendet.

## Beispiel: an die Kündigungsfrist erinnern

Petra soll 30 Tage vor Ablauf der Kündigungsfrist eines Vertrags eine Aufgabe bekommen – aber nur, wenn im Vertrag jemand als verantwortlich eingetragen ist.

1. **+ Neu**, Name „Kündigung prüfen“.
2. **Wenn:** **Datum erreicht**, Mappentyp *Vertrag*, Datumsfeld *Kündigung bis*, **Vorlauf** 30 *Tage*, Uhrzeit 07:00.
3. **Und:** **+ Karte → Feld-Bedingung**, Feld *Verantwortlich* „ist nicht leer“.
4. **Dann:** **+ Karte → Aufgabe / Benachrichtigung**, Als *Aufgabe*, Empfänger *Person im Feld „Verantwortlich“*, Text `Bitte {titel} prüfen – kündbar bis {kuendigung_bis}.`
5. **Speichern**. Der Schalter oben neben dem Namen steht bei einer neuen Automatisierung auf **an** – mit dem Speichern ist sie eingeschaltet. Soll sie noch nicht arbeiten, stell ihn vorher auf **aus**.

![Aufgeklappte Dann-Karte mit Empfänger und Platzhaltern](bilder/werkbank-automatisierung-karte.png)

Eine Karte klappst du mit einem Klick auf ihren Namen **auf** (Einstellungen) und wieder **zu** (Kurzzeile wie „Aufgabe → Person im Feld „Verantwortlich““). Unter dem Text stehen die **Platzhalter**, die zur Wenn-Karte passen: die Felder des Mappentyps sowie `{titel}`, `{mappentyp}`, `{heute}`, `{automatisierung}` und beim Datum `{datum}` und `{tage}`. Ein Klick setzt den Platzhalter ein.

## Beispiel: neue Dokumente an die Verwaltung melden

Die Verwaltung soll erfahren, wenn irgendwo ein Dokument dazukommt – gebündelt, nicht für jede Datei einzeln.

1. **+ Neu**, Name „Neue Dokumente melden“.
2. **Wenn:** **Dokument hochgeladen**. Ohne Mappentyp gilt sie für alle; mit einem Mappentyp (z. B. *Rechnung*) oder einer Feld-Bedingung unter **Und** grenzt du sie ein.
3. **Dann:** **+ Karte → Aufgabe / Benachrichtigung**, Als *Benachrichtigung*, Empfänger die Rolle *Administrator* (oder eine eigene Rolle wie *Verwaltung*), Text `Neues Dokument an {titel}.`
4. **Speichern**.

Ablago selbst bringt keine fertigen Automatisierungen mehr mit (seit 0.212): Fachliche Automatisierungen kommen aus [Paketen](#aus-paketen), alles andere baust du wie in diesen Beispielen.

## Datum erreicht

Die Karte **Datum erreicht** prüft einmal am Tag zur gewählten Uhrzeit, bei welchen Mappen ein Datumsfeld nach dem **Vorlauf** erreicht ist.

- **Vorlauf** in **Tagen, Wochen oder Monaten**. 3 Monate sind drei Kalendermonate, nicht 90 Tage: Für ein Ende am 31.05. greift die Karte am letzten Tag im Februar. 0 heißt „am Tag selbst“, eine negative Zahl „so lange danach“.
- **Wiederkehrend** (monatlich, vierteljährlich, halbjährlich, jährlich): Wer die Aufgabe erledigt, bekommt den Folgetermin vorgeschlagen.
- Eine **Aufgabe** daraus ist eine **Frist** zum Datum der Mappe. Sie erledigt sich selbst, wenn das Datum geändert oder geleert wird. Dieselbe Person bekommt je Mappe, Feld und Datum nur eine Frist.
- Liegt ein Datum beim **Speichern** einer Mappe schon im Vorlauf, läuft die Automatisierung sofort – ein spät eingetragenes Datum erinnert also trotzdem.
- Damit ein Datumsfeld unter *Zu erledigen* und im Kalender erscheint, braucht es am Mappentyp den Haken [Ist eine Frist](mappentypen.md#fristen-erinnerungen-an-datumsfeldern).
- War Ablago zur Uhrzeit aus, holt es verpasste Tage nach (bis zu 31 Tage zurück). Eine neu eingeschaltete Automatisierung beginnt heute.

Die früheren Karten „Datum in N Tagen“ und „Frist erreicht“ sind in **Datum erreicht** aufgegangen. Aus „Datum in N Tagen“ wird beim nächsten Öffnen dieselbe Karte mit Vorlauf in Tagen. Bei „Frist erreicht“ fehlt das Datumsfeld: Die Automatisierung steht rot da, bis du es wählst.

## An, aus und angehalten

Ob eine Automatisierung arbeitet, siehst und änderst du an **einer** Stelle: am Schalter oben neben dem Namen, in der Liste steht derselbe Zustand (**an**, **aus**, **angehalten**).

- Bei einer gespeicherten Automatisierung wirkt der Schalter sofort; an seiner Stelle steht kurz „Eingeschaltet.“ bzw. „Ausgeschaltet.“.
- Ist sie **angehalten** (rot, siehe unten), steht dort der Grund und der Knopf **Wieder einschalten**.
- Daneben steht der Knopf **Kopieren**: Er legt eine eigene Kopie an und öffnet sie.

## Zeitplan

Die Karte **Zeitplan** löst an den gewählten **Wochentagen** zur gewählten **Uhrzeit** aus (in der Zeitzone der [Region](region.md)), auf Wunsch **nicht an Feiertagen** – das Bundesland dafür stellst du unter [Region](region.md) ein.

- **Für jeden Benutzer:** Die Automatisierung läuft je aktivem Benutzer genau einmal am Tag – auf Wunsch nur für die Mitglieder einer **Rolle**. Die Karten sehen dann die Benutzer-Mappe der Person, der Platzhalter `{benutzer}` steht für ihren Namen.
- **Uhrzeit aus Mein Konto:** Mit diesem Haken gelten Uhrzeit, Wochentage und Feiertage, die jemand unter Mein Konto für die Tägliche Zusammenfassung gewählt hat; wer nichts gewählt hat, bekommt die Uhrzeit der Karte und Montag bis Freitag.
- War Ablago zur Uhrzeit aus, läuft die Automatisierung noch am selben Tag nach – an Folgetagen nicht. Auch mit mehreren Servern läuft jeder Tag (je Person) genau einmal.

## Karten hinzufügen, umsortieren, entfernen

- **Mit der Maus oder am Handy:** **Kartenvorrat** (oben im Bereich *Wenn*) aufklappen, nach einer Karte suchen und sie in ihren Bereich **ziehen** (am Handy lange drücken) – oder einfach anklicken.
- **Mit der Tastatur:** in jedem Bereich **+ Karte** – Auswahl öffnen, Karte wählen. Dann-Karten sortierst du über ihren Griff `⠿` mit **Alt+↑/↓** um, per Maus durch Ziehen.
- **Entfernen** steht an jeder Karte.

Der Vorrat zeigt nur, was zur Wenn-Karte passt: **Feld ändern** etwa nur, wenn die Wenn-Karte einen Mappentyp hat.

## Was die Dann-Karten tun

- **Feld ändern** setzt nur die gewählten Felder und lässt alle anderen unverändert. Text mit Platzhaltern; bei Datumsfeldern `heute`, `heute+7` oder `heute-3`. Ablago prüft den Wert wie im Formular (Pflichtfelder, Auswahllisten, Archivmodus). In der Historie der Mappe steht „durch Automatisierung ‚…‘“.
- **Aufgabe / Benachrichtigung** geht an Personen, an **alle aktiven Mitglieder einer Rolle**, an die **Person in einem Feld** der Mappe (optional „sonst wer die Mappe angelegt hat“), an **wer die Mappe angelegt hat** oder an eine **Person aus dem Ereignis** (z. B. den Vertreter bei *Abwesenheit gesetzt*). Eine *Aufgabe* kann ein Fälligkeitsdatum haben; *Benachrichtigungen* bündelt Ablago, damit niemand bei vielen Läufen hintereinander überschwemmt wird.
- **Platzhalter mit den Rechten des Empfängers:** Ablago füllt den Text für jeden Empfänger einzeln – bei einer Rolle also je Person, bei einer Vertretung mit den Rechten des Vertreters. Was die Person nicht sehen darf, steht als „(nicht sichtbar)“ da, etwa der Titel eines verknüpften Kontakts. So verrät auch die Tägliche Zusammenfassung nichts. Der **Testlauf** im Editor nennt, wer etwas nicht sehen darf („Jonas darf nicht alles sehen …“).
- **Ohne Leserecht an der Mappe** kommt die Aufgabe trotzdem an. Die Person sieht aber nur „Aufgabe zu einer Mappe, die du nicht sehen darfst – frag …“ und die Fälligkeit (bei Aufgaben zu einem Datumsfeld auch die nicht). Du findest den Fall unter [Aufgaben bei Personen ohne Leserecht](aufgaben.md#aufgaben-bei-personen-ohne-leserecht).
- Aufgaben aus Automatisierungen verhalten sich wie die eingebauten: Ist jemand **abwesend oder deaktiviert**, geht die Aufgabe an seine **Vertretung** (in der Historie steht „weitergegeben wegen Abwesenheit …“). Gibt es keine, bekommen sie die Administratoren – der Lauf bricht nicht ab.
- Eine Aufgabe **erledigt sich selbst**, wenn ihr Anlass wegfällt: bei **Datum erreicht**, wenn das Datum geändert oder geleert wird; bei **Neue Post** und bei *Post angelegt oder gespeichert*, wenn die Post zugeordnet oder erledigt ist; bei **Abwesenheit gesetzt**, wenn die Abwesenheit endet.
- Geht eine Aufgabe zu einer Post an die **Person unter „An“**, ist sie eine Aufgabe **Post für dich**: je Post und Person nur eine, und sie erledigt sich auch, sobald die Post an jemand anderen geht (siehe [Post für dich](#post-fur-dich)).
- **Tägliche Zusammenfassung senden** (nur mit *Zeitplan für jeden Benutzer*) schickt der Person ihre offenen Aufgaben per E-Mail – derselbe Inhalt wie bisher. Wer sie unter Mein Konto abbestellt hat, abwesend ist oder nichts offen hat, bekommt keine; der Verlauf nennt den Grund.
- **Favoriten-Änderungen melden** (nur mit *Favorit geändert*) gibt allen, die die Mappe als Favorit haben, die gebündelte Benachrichtigung „Geändert“ – wie bisher. **Nur an Mitglieder dieser Rollen** schränkt ein (keine Rolle = alle), **Neue Benutzer bekommen die Benachrichtigung** legt die Vorgabe fest – beides stand bis 0.256 unter Werkbank → Aufgaben ([Favoriten benachrichtigen](aufgaben.md#favoriten-benachrichtigen)). Der Schalter unter Mein Konto gilt weiter; eigene Änderungen melden nie.
- **Anmeldeschutz melden** schickt allen, die den Anmeldeschutz verwalten, entweder die **Sammelmeldung** über die Sperren (mit *Zeitplan*, nicht je Benutzer) oder sofort eine Mail, wenn ein **Benutzerkonto gesperrt** wurde (mit *Benutzerkonto gesperrt*, je Konto höchstens einmal am Tag). Siehe [Anmeldeschutz](anmeldeschutz.md#mail-an-die-administratoren).
- **Paket nach Zeitplan ausführen** (nur mit *Zeitplan*, nicht je Benutzer) sagt einem Paket, dass sein Zeitpunkt erreicht ist – siehe [unten](#paket-nach-zeitplan).
- **Sicherung anstoßen** stößt eine neue Sicherung an – siehe [Werkbank-Karten](#sicherung-anstossen).
- **Danach keine weiteren Automatisierungen** beendet die Reihe: Automatisierungen mit höherer Nummer laufen für dieses Ereignis nicht mehr (im Verlauf „Übersprungen durch …“).

Automatisierungen arbeiten mit dem **Systemkonto „Automatisierung“** (Werkbank → Benutzer). Was dieses Konto nicht lesen darf, überspringt die Automatisierung; Platzhalter zeigen dann „(nicht sichtbar)“. Bei Aufgaben gelten zusätzlich die Rechte des Empfängers (siehe oben).

Darf das Konto „Automatisierung“ Mappen vom Typ der Wenn-Karte **gar nicht** sehen – zum Beispiel, weil am Mappentyp eine Regel „System- und Paketrollen verboten“ gilt –, kann die Automatisierung nie laufen. Dann steht im Editor und in der Liste ein Hinweis „Diese Automatisierung kann nicht laufen …“. Über **Rechte am Mappentyp ansehen** kommst du zum [Testlauf](berechtigungen.md#testlauf) dieses Mappentyps, mit dem Konto „Automatisierung“ schon gewählt; dort siehst du, welche Regel entschieden hat. Speichern bleibt trotzdem möglich.

## Paket nach Zeitplan ausführen { #paket-nach-zeitplan }

Manche Pakete müssen regelmäßig rechnen, weil sich ihr Ergebnis nur durch das Datum ändert – etwa *Verträge* („kündbar bis …“) oder *Rechnungen* („überfällig seit …“). Statt eines versteckten Laufs bringen sie dafür eine **Automatisierung** mit, zum Beispiel **Verträge täglich prüfen**: Wenn *Zeitplan* täglich um 05:00 → Dann **Paket nach Zeitplan ausführen**.

- **Uhrzeit und Tage** stellst du in der Wenn-Karte ein; ausschalten geht am Schalter. Ausgeschaltet rechnet das Paket nur noch, wenn jemand eine seiner Mappen ändert.
- Die Karte nennt das **Paket** und optional eine **Aufgabe** (eine Kennung wie `taeglich` oder `monatlich`), damit ein Paket mehrere Läufe unterscheiden kann. Das Paket bekommt das Ereignis *Nach Zeitplan ausgeführt* mit Datum, geplantem Zeitpunkt und Aufgabe – je Tag genau einmal, auch mit mehreren Servern.
- **Keine zusätzlichen Rechte:** Das Paket arbeitet mit den Rechten, die du bei der Installation bestätigt hast. Die Rechte-Vorschau nennt den Zeitplan („Läuft nach Zeitplan: Verträge täglich prüfen (täglich um 05:00)“).
- **Nur das eigene Paket:** Eine mitgelieferte Automatisierung ruft immer nur das Paket auf, das sie mitbringt – das Feld *Paket* ist dort fest. In einer selbst angelegten Automatisierung stehen nur Pakete zur Wahl, die Zeitpläne annehmen.
- **Paket entfernt:** Die Karte läuft dann ins Leere. Die Automatisierung bleibt an und zeigt „Paket … ist nicht installiert“; im Verlauf steht der Lauf als *übersprungen* – kein Fehler, kein Hinweis auf fehlgeschlagene Läufe.
- Jeden Lauf siehst du im **Verlauf** der Automatisierung; das Paket bekommt ihn wie jedes andere Ereignis (mit Wiederholung, falls es gerade nicht erreichbar ist).

## Sonst { #sonst }

Unter **Dann** steht, was passiert, wenn die Und-Bedingungen zutreffen. Unter **Sonst** kannst du Karten für den anderen Fall ablegen – dieselben Karten wie bei Dann, per Ziehen aus dem Vorrat oder mit **+ Karte**. Ohne Und-Bedingungen trifft immer alles zu; Sonst läuft dann nie.

*Beispiel:* Wenn ein Vertrag gespeichert wird, **und** *Verantwortlich* ist gesetzt, **dann** Feld *Status* auf „geprüft“ – **sonst** Aufgabe an die Rolle *Verwaltung*: „Bitte {titel} eine verantwortliche Person geben.“

- Je Lauf läuft genau einer der beiden Zweige; der andere steht im Verlauf als *übersprungen*. Hat eine Automatisierung keine Sonst-Karten und die Bedingungen treffen nicht zu, heißt der Lauf wie bisher *trifft nicht zu*.
- **Danach keine weiteren Automatisierungen** wirkt auch im Sonst-Zweig.
- Mindestens eine Dann-Karte braucht jede Automatisierung; Sonst ist freiwillig.

## Werkbank-Karten { #werkbank-karten }

Manches betrifft nicht eine Mappe, sondern den **Betrieb** von Ablago. Dafür gibt es drei Wenn-Karten (im Vorrat unter *Betrieb*) und eine Dann-Karte. Diese Karten haben **keine Mappe**: Als Bedingung geht nur ein Merkmal der Ablage, und eine **Aufgabe / Benachrichtigung** geht an Personen oder Rollen – sie hängt an der Benutzer-Mappe des Empfängers.

Einrichten darf eine Werkbank-Karte nur, wer den passenden Bereich selbst verwalten darf: *Fehler gemeldet* den Bereich *Gemeldete Fehler*, *Protokollmeldung* das *Protokoll*, *Neue Version verfügbar* den *Systemzustand* und *Sicherung anstoßen* die *Sicherung*. Pakete bringen diese Karten nicht mit.

### Fehler gemeldet { #fehler-gemeldet }

Läuft, sobald jemand über **Fehler melden** einen Fehler meldet. Platzhalter: `{zeitpunkt}`, `{meldung}` (Text der Meldung) und `{gemeldet_von}`. Text und Absender sieht ein Empfänger nur, wenn er [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) verwalten darf – allen anderen zeigt Ablago „(nicht sichtbar)“. Bilder und technische Angaben der Meldung kommen nie in eine Aufgabe.

*Beispiel:* Wenn **Fehler gemeldet** → Dann Aufgabe an Markus, fällig in 1 Tag: `Neue Fehlermeldung von {gemeldet_von}: {meldung}`.

### Protokollmeldung { #protokollmeldung }

Läuft, wenn das [Protokoll](fehlersuche.md#protokoll) eine Warnung oder einen Fehler schreibt. Du wählst die **Stufe** (*ab Warnung* oder *ab Fehler*), auf Wunsch ein **Modul** (z. B. *E-Mail*, *Sicherung*) und einen **Text**, den die Meldung enthalten soll. Platzhalter: `{zeitpunkt}`, `{stufe}`, `{modul}` und `{meldung}` – ohne Geheimnisse, wie im Protokoll; den Text sieht nur, wer das Protokoll verwalten darf.

- **Höchstens ein Lauf in 15 Minuten** je Automatisierung – bei einer Störung kommt keine Flut.
- Meldungen, die eine Automatisierung selbst auslöst (z. B. weil ihre Aufgabe nicht zugestellt werden kann), lösen keine Automatisierung aus.
- **E-Mail gestört:** Bei Fehlern im Modul *E-Mail* kommt eine Benachrichtigung per E-Mail meist nicht an. Der Editor weist darauf hin – nimm eine **Aufgabe** oder **Benachrichtigung**: Sie steht in Ablago unter *Zu erledigen*, auch wenn der Versand gestört ist.

### Neue Version verfügbar { #neue-version }

Läuft, wenn es eine neue **stabile Version** von Ablago gibt. Ablago fragt dafür einmal am Tag (ab 06:00) bei GitHub nach – nur, solange eine solche Automatisierung eingeschaltet ist; dabei geht nichts aus deiner Ablage hinaus. Je Version läuft sie genau einmal. Platzhalter: `{version}` und `{installiert}`. Was neu ist, steht unter [Technik und Versionen](technik.md).

### Sicherung anstoßen { #sicherung-anstossen }

Die Dann-Karte stößt eine neue [Sicherung](sicherung.md) an – verschlüsselt wie *Jetzt sichern* und mit der Aufbewahrung der automatischen Sicherungen, damit die Platte nicht vollläuft. Die Automatisierung erfährt nur **angestoßen** oder **läuft schon** (dann keine zweite). Ob die Sicherung gelingt, wie groß sie ist und wo sie liegt, steht nur unter Werkbank → Sicherung; lässt sie sich gar nicht anstoßen (kein Schlüssel, zu wenig Platz, Wiederherstellung läuft), schlägt der Lauf ohne Einzelheiten fehl.

### Werkbank-Rechte des Systemkontos { #werkbank-rechte }

Automatisierungen laufen unter dem Systemkonto **„Automatisierung“**. Es darf die Werkbank nie betreten. Für die Werkbank-Karten hat es **genau diese Rechte** – alle übrigen Bereiche gar keine:

| Bereich | darf | darf nicht |
|---|---|---|
| Sicherung | eine neue Sicherung **anstoßen** | Erfolg, Anzahl, Zeitplan, Speicherplatz, Speicherort sehen; Notfallblatt |
| Wiederherstellen | – | alles |
| Volltext | – | neu erzeugen u. Ä. |
| Papierkorb | – | leeren, endgültig löschen |
| Technik und Versionen | prüfen, ob eine neue Version da ist | – |
| Gemeldete Fehler | sehen | – |
| Protokoll | Meldungen ab einer Stufe finden | – |
| Benutzer | nichts in der Werkbank (Benutzer sind Mappen, Rechte daran über die Rolle *Systemkonto*) | Benutzer und Rechte verwalten |

## Reihenfolge

Gibt es mehrere Automatisierungen für denselben Auslöser, laufen sie nach ihrer **Reihenfolge** (1–99, kleinere zuerst; eigene beginnen bei 50). Im Editor steht dann „läuft als 2. von 3 beim selben Auslöser“. In der Liste zeigt **Nach Auslöser** alle Automatisierungen eines Ereignisses zusammen; dort sortierst du sie per Ziehen oder mit **Alt+↑/↓** am Griff um, die Nummern passen sich an.

## Ausprobieren, Verlauf und Änderungsverlauf

![Verlauf mit den Schritten eines Laufs](bilder/werkbank-automatisierung-verlauf.png)

- **Ausprobieren:** Mappe wählen und **Ausführen** – als wäre das Ereignis eingetreten. Die Mappe wählst du wie in einem Verweisfeld: Tippe einen Teil des Titels und klicke auf einen Treffer. Angeboten werden nur Mappen vom Mappentyp der Wenn-Karte, die das Konto „Automatisierung“ sehen darf – mit allen anderen könnte die Automatisierung ohnehin nicht laufen. Mit **Probelauf** zeigt Ablago nur, was passieren würde („Würde Aufgabe an 1 Person senden: …“), und ändert nichts. Bei [Werkbank-Karten](#werkbank-karten) gibt es keine Mappe zu wählen – Ablago probiert es mit einer Beispielmeldung.
- **Verlauf:** sieht aus wie die Historie einer Mappe: je Lauf eine Zeile mit Datum und Uhrzeit, dem Auslöser (z. B. „Mappe angelegt“, „Probelauf“, „Wiederholung“), einer Zusammenfassung, dem Ergebnis (*abgeschlossen*, *trifft nicht zu*, *übersprungen*, *fehlgeschlagen*) und der Zahl der Karten. Aufgeklappt zeigt eine Tabelle **Karte · Ergebnis · Einzelheiten**, was jede Karte getan hat; ist etwas schiefgegangen, steht der Grund bei der Karte, die gescheitert ist. Mit **Alle Einträge aufklappen** / **Alle Einträge zuklappen** siehst du alles auf einmal. Läuft die Automatisierung gerade, während der Editor offen ist, ist dieser Lauf aufgeklappt und die Karten werden **live** abgehakt; Karten, die noch nicht dran waren, stehen auf „wartet“.
- **Fehlgeschlagene Läufe** bleiben stehen. Über der Liste der Automatisierungen steht dann zum Beispiel „1 Lauf ist fehlgeschlagen: Neue Benutzer melden, 04.11.26, 04:48“; bei mehreren Läufen zeigt **Anzeigen** nur die betroffenen Automatisierungen. **Alle wiederholen** führt sie noch einmal aus, **Nicht wiederholen** nimmt sie aus dem Hinweis – im Verlauf bleiben sie als „fehlgeschlagen – nicht wiederholt (wer, wann)“ stehen, gelöscht wird nichts. Dieselbe Wahl hast du je Lauf im aufgeklappten Verlauf. **Probeläufe** zählen nicht mit; ihr Ergebnis steht nur im Verlauf. Die [Übersicht der Werkbank](uebersicht.md) meldet fehlgeschlagene Läufe ebenfalls.
- **Fassungen** (bis 0.254 „Änderungsverlauf“): jede gespeicherte Fassung mit Zeit, wer und was sich geändert hat („Dann: ‚Aufgabe an Markus‘ hinzugefügt“); die neueste ist mit **Aktuell** gekennzeichnet. Zwei Fassungen lassen sich vergleichen, eine frühere **wiederherstellen** – nach einer Rückfrage, die sagt, was sich ändert, wird daraus eine neue Fassung; der jetzige Stand bleibt erhalten. Passt die frühere Fassung nicht mehr (z. B. ein Feld fehlt), sagt Ablago das wie beim Speichern und stellt sie nicht wieder her. Wie das für alle Einstellungen der Werkbank gilt: [Fassungen](fassungen.md).

## Wenn etwas nicht mehr passt

Ablago blockiert deine Arbeit nicht: Mappentypen, Felder und Ansichten lassen sich weiterhin ändern und löschen. Fehlt einer Automatisierung danach etwas (Feld gelöscht, Ansicht weg), wird sie **rot markiert und angehalten** – mit Grund in der Liste und einem Hinweis in der Übersicht. Korrigieren, speichern, wieder einschalten.

Außerdem hält Ablago eine Automatisierung an, wenn sie **mehr als 30-mal in einer Minute** läuft, und nach einer [Wiederherstellung](wiederherstellen.md) alle eingeschalteten – damit eingespielte Daten nicht sofort eine Welle von Aufgaben auslösen. Automatisierungen, die einander auslösen, laufen höchstens drei Ebenen tief.

## Aus Paketen

Pakete bringen **vorgefertigte Automatisierungen** mit, zum Beispiel „HU wird bald fällig“ (Paket Fahrzeuge) oder „Kündigung bald fällig“ (Paket Haushalt). Beim Installieren – im Einrichtungsassistenten wie in der Werkbank – listet Ablago sie mit Namen auf: **„Sollen sie gleich eingeschaltet werden?“** Vorausgewählt sind die, die das Paket als *gleich eingeschaltet* kennzeichnet (z. B. *Verträge täglich prüfen*, mit Uhrzeit dahinter); kennzeichnet ein Paket keine, sind wie bisher alle vorausgewählt. Was angehakt bleibt, ist nach der Installation eingeschaltet, der Rest aus – du kannst jede abwählen.

- In der Liste erkennst du sie an der Herkunft **aus Paket …**. Du kannst sie einschalten, anpassen und kopieren.
- Bei einem **Update** des Pakets ersetzt die neue Fassung die alte, solange du sie nicht geändert hast; an/aus bleibt immer, wie du es eingestellt hast. Eine geänderte bleibt, wie sie ist. Neue Automatisierungen aus dem Update stehen beim Aktualisieren wieder zur Wahl.
- Entfernst du das Paket, gehen seine Automatisierungen mit, wenn sie aus und unverändert sind.
- [Werkbank-Karten](#werkbank-karten) bringen Pakete nicht mit – die gibt es nur in selbst angelegten Automatisierungen.

### Vertretung

Wird für jemanden eine **Abwesenheit mit Vertreter** eingetragen, bekommt der Vertreter eine Aufgabe – das macht die Automatisierung **Vertretung eingetragen** (Wenn *Abwesenheit gesetzt*, Empfänger *Vertreter aus dem Ereignis*, Platzhalter `{benutzer}`, `{vertreter}`, `{von}`, `{bis}`, `{zeitraum}`). Sie erledigt sich, sobald die Abwesenheit endet oder sich Zeitraum oder Vertreter ändern. Für den bisherigen Vertreter gibt es die Wenn-Karte **Vertretung zurückgezogen** (Abwesenheit beendet, anderer oder kein Vertreter mehr). Beide bringt das Paket **Benachrichtigungen** mit; bei bestehenden Ablagen hat das Update *Vertretung eingetragen* eingeschaltet übernommen. Nennt das Ereignis keine Person (Abwesenheit ohne Vertreter), passiert nichts – das ist kein Fehler.

### Benachrichtigungen

Die **Tägliche Zusammenfassung**, das Melden geänderter **Favoriten**, die Aufgabe **Post für dich** und die Mails des **Anmeldeschutzes** sind Automatisierungen – eingestellt wird das nur hier, nicht mehr unter [Werkbank → Aufgaben](aufgaben.md#werkbank-aufgaben). Das Paket **Benachrichtigungen** bringt sie mit; im Einrichtungsassistenten ist es vorausgewählt. Ohne eine Automatisierung mit *Tägliche Zusammenfassung senden* weist die Werkbank-Übersicht darauf hin: „Keine automatischen Benachrichtigungen“ mit **Paket installieren**; fehlt nur *Post für dich* (oder ist sie aus), heißt der Hinweis „Keine Aufgabe „Post für dich““.

Beim Update auf diese Fassung hat Ablago in bestehenden Ablagen **einmal** vier Automatisierungen mit den bisherigen Werten angelegt: *Tägliche Zusammenfassung* (Uhrzeit aus Mein Konto, an oder aus wie bisher), *Favoriten-Änderungen melden*, *Sammelmeldung Anmeldeschutz* und *Kontosperre sofort melden* (an, wenn die Haken im Anmeldeschutz gesetzt waren). Für Benutzer ändert sich nichts. Installierst du das Paket, gehen sie in dessen Automatisierungen auf, solange du sie nicht geändert hast.

### Post für dich

Steht bei neuer [Post](https://help.ablago.app/benutzer/aktuell/post/) jemand unter **An**, bekommt er die Aufgabe **Post für dich – bitte zuordnen**. Bis Version 0.256 war das fest eingebaut; seit 0.257 macht es die Automatisierung **Post für dich** aus dem Paket **Benachrichtigungen** (ab 1.3.0):

| Karte | Inhalt |
| --- | --- |
| Wenn | *Mappe gespeichert*, Mappentyp **Post**, nur bei Änderung von **An** oder **Stand**, **auch beim Anlegen** |
| Und | *An* ist nicht leer, *Stand* ist *Neu* |
| Dann | *Aufgabe* an die Person in **An**, Text „Post für dich – bitte zuordnen“ |

Das Verhalten ist dasselbe wie vorher: Ist die Person abwesend, geht die Aufgabe an ihre **Vertretung**. Sie **erledigt sich selbst**, sobald die Post zugeordnet oder erledigt ist oder unter *An* jemand anderes steht – der bekommt dann seine eigene. Je Post und Person gibt es **nur eine**, auch wenn die Post mehrmals gespeichert wird. Die Zahl **Neue Post** auf der Startseite zählt weiter die Post, nicht die Aufgaben – sie ändert sich nicht.

**Beim Update auf 0.257:** Ist das Paket Benachrichtigungen installiert, legt Ablago **einmal** eine eingeschaltete Automatisierung *Post für dich* mit diesen Karten an; das Update des Pakets auf 1.3.0 ersetzt sie, solange du sie nicht geändert hast (an oder aus bleibt). Offene Aufgaben „Post für dich“ von vorher bleiben und erledigen sich wie bisher. **Ist das Paket nicht installiert, bekommt bei neuer Post niemand mehr diese Aufgabe** – die Werkbank-Übersicht weist darauf hin; installierst du das Paket, ist sie wieder da.

### Erinnerungen aus früheren Versionen

Bis Version 0.176 stellte man Vorlauf, Empfänger und Text einer Erinnerung direkt am Datumsfeld ein, und die Vertretungs-Aufgabe war fest eingebaut. Beim Update hat Ablago jede dieser Erinnerungen **einmal** als eingeschaltete Automatisierung *Erinnerung: Feld (Mappentyp)* übernommen – mit gleichem Verhalten. Die Werkbank-Übersicht weist einmal darauf hin (*Verstanden* blendet den Hinweis aus). Bringt ein Paket später eine eigene Automatisierung für dasselbe Feld mit, ersetzt sie die übernommene, solange du diese nicht geändert hast. So erinnert nie etwas doppelt.

## Beispiele

Bis Version 0.211 legte Ablago drei **ausgeschaltete Beispiele** an (Herkunft „von Ablago“): *An die Kündigungsfrist erinnern*, *Kontosperre melden* und *Neue Dokumente melden*. Seit 0.212 gibt es keine Automatisierungen mehr aus dem Kern (Issue #883):

- Ein Beispiel, das du **nie eingeschaltet und nie geändert** hast, entfernt das Update still.
- Ein **eingeschaltetes oder geändertes** Beispiel bleibt und wird eine normale **eigene** Automatisierung – du kannst sie jetzt auch löschen.
- Das [Protokoll](fehlersuche.md#protokoll) nennt beim ersten Start, was entfernt und was übernommen wurde.

Die Erinnerung an die Kündigungsfrist bringt das Paket **Haushalt** mit („Kündigung bald fällig“), das Melden neuer Dokumente steht oben als [Beispiel](#beispiel-neue-dokumente-an-die-verwaltung-melden). Für gesperrte Konten gibt es den [Anmeldeschutz](anmeldeschutz.md) und das Paket **Benachrichtigungen**.

![Editor in dunkler Darstellung](bilder/werkbank-automatisierung-dunkel.png)

Am Handy steht erst die Liste, nach dem Antippen der Editor – oben die Sprungleiste, darunter die Bereiche zugeklappt wie beim Mappentyp; Karten fügst du dort am einfachsten mit **+ Karte** hinzu.

![Automatisierung am Handy](bilder/werkbank-automatisierung-handy.png){ width="320" }
