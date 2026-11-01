# Aufgaben

Eine **Aufgabe** sagt, dass an einer Mappe jemand etwas tun soll. Jede Mappe mit einer offenen Aufgabe steht bei ihrem Empfänger unter **Zu erledigen** – „Zu erledigen“ ist damit die Liste der eigenen Aufgaben. Wie Benutzer damit arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/zusammenarbeit/).

Aufgaben entstehen auf diesen Wegen:

| Art | Entsteht | Empfänger | Erledigt |
| --- | --- | --- | --- |
| **Passt nicht** | wenn eine Mappe nach einer Änderung am [Mappentyp](mappentypen.md#wenn-sich-ein-mappentyp-andert) nicht mehr passt | wer die Mappe angelegt hat (sonst die Administratoren) | von selbst, sobald die Mappe wieder passt |
| **Erwähnung** | wenn jemand in einem formatierten Text mit **@** einen Benutzer erwähnt | der Erwähnte | per Knopf *Erledigt* |
| **Zugewiesen** | von Hand über *Mappe ▾ →* **Aufgabe vergeben** an der Mappe | ein gewählter Benutzer | per Knopf *Erledigt* |
| **Frist** | vor dem Datum eines Datumsfelds mit [Erinnerung](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) | Benutzer im gewählten Feld, sonst wer die Mappe angelegt hat | per Knopf *Erledigt*, oder von selbst, wenn sich das Datum ändert |
| **Erinnerung** | am gewählten Tag nach *Mappe ▾ →* **Erinnern** an der Mappe | der gewählte Benutzer | per Knopf *Erledigt* |
| **Vertretung** | wenn für einen Benutzer eine [Abwesenheit](benutzer.md#abwesenheit) mit Vertreter eingetragen wird | der Vertreter; die Aufgabe hängt an der Benutzer-Mappe des Abwesenden | von selbst, sobald die Abwesenheit endet oder sich Zeitraum oder Vertreter ändern; oder per Knopf *Erledigt* |
| **Post für dich** | wenn bei neuer [Post](https://motom001.github.io/dms/benutzer/aktuell/post/) ein Benutzer unter *Für* steht | der Benutzer bei *Für* | von selbst, sobald die Post zugeordnet, erledigt oder weitergegeben ist |
| **Auskunft** | wenn eine Person ihre [Auskunft](datenschutz.md#auskunft-zustellen) über den Abruf-Link heruntergeladen hat oder der Link nach Fehlversuchen gesperrt wurde | wer den Link bzw. die Auskunft erstellt hat und wer die Mappe der Person als Favorit hat (sofern die Benachrichtigung für den Favoriten an ist) | per Knopf *Erledigt*; solange sie offen ist, kommt für denselben Link keine zweite |
| **Geändert** | wenn jemand eine Mappe ändert, die andere als Favorit haben ([Favorit = Abo](https://motom001.github.io/dms/benutzer/aktuell/ablage/#favoriten-als-abo)) | wer die Mappe als Favorit hat, lesen darf und die Benachrichtigung nicht abgeschaltet hat – nie der, der geändert hat | von selbst beim Öffnen der Mappe, oder per Knopf *Erledigt*; bis dahin zählt sie nur hoch |

- Empfänger sind immer **Benutzer**, keine Rollen – eine Aufgabe für alle bleibt sonst gern liegen.
- Wer sich selbst erwähnt, bekommt keine Aufgabe; erneutes Speichern erzeugt keine zweite. Wird eine Erwähnung wieder entfernt, bleibt die Aufgabe offen; in der Historie der Mappe steht, dass sie entfernt wurde.
- **Weitergeben** dürfen der Empfänger selbst und Administratoren; das steht in der Historie der Mappe. Mehrere auf einmal gehen in [Werkbank → Aufgaben](#mehrere-aufgaben-auf-einmal-weitergeben) und für die eigenen unter Profil → [Abwesenheit](https://motom001.github.io/dms/benutzer/aktuell/profil/#abwesenheit).

## Werkbank → Aufgaben

![Werkbank → Aufgaben](bilder/werkbank-aufgaben.png)

In der Mitte steht oben die [Tägliche Zusammenfassung](#tagliche-zusammenfassung), darunter alle offenen Aufgaben aller Benutzer mit Mappe, Art, Datum und Empfänger. Über die Auswahl unter einer Aufgabe gibst du sie an jemand anderen weiter. Wählst du eine Aufgabe, steht rechts ihre Mappe mit den wichtigsten Feldern, **In der Ablage öffnen** und daneben **Weitergeben an** – wie die Auswahl in der Liste. Danach stimmen Empfänger rechts und in der Liste sofort.

Der **Filter** über der Liste grenzt ein nach:

- **Empfänger** – ein Benutzer, *Administratoren* oder *abwesend, ohne Vertretung* (Aufgaben von Benutzern, die abwesend oder deaktiviert sind und für die niemand eingetragen ist – sie bleiben sonst liegen),
- **Art** (Passt nicht, Erwähnung, Zugewiesen, Frist …), **Mappentyp**,
- **Fälligkeit** nach dem Datum von Frist oder Erinnerung: *überfällig*, *diese Woche* (bis Sonntag), *später*, *ohne Datum*,
- Text im **Titel** der Mappe oder in der Aufgabe.

**Erledigte zeigen** schaltet auf die zuletzt erledigten Aufgaben um. Der Filter steht in der Adresse – so lässt sich ein gefilterter Blick als Link merken oder weitergeben. Darunter steht, wie viele Aufgaben passen.

### Mehrere Aufgaben auf einmal weitergeben

Bei Urlaub, Krankheit oder wenn die Zuständigkeit wechselt, verteilst du viele Aufgaben in einem Schritt neu:

1. Grenze die Liste mit dem Filter ein, z. B. *Empfänger: Ben*.
2. Hake die Aufgaben links an – oder **Alle angezeigten auswählen** (das gilt nur für die gerade gefilterten). Daneben steht, wie viele ausgewählt sind.
3. In der Leiste darüber **Ausgewählte weitergeben an** einen Benutzer wählen und **Weitergeben**. Eine Rückfrage nennt Anzahl und Ziel.

Danach steht dort, wie viele weitergegeben wurden – und welche nicht und warum, etwa „Carl darf die Mappe nicht lesen“ oder „liegt schon bei Carl“. Was nicht ging, bleibt ausgewählt; du kannst es gleich an jemand anderen geben. Jede Weitergabe steht in der Historie ihrer Mappe. Der neue Empfänger bekommt **eine** Sammelbenachrichtigung unter „Zu erledigen“ (Art *Zugewiesen*, an deiner Benutzer-Mappe: „Anna hat dir 12 Aufgaben weitergegeben“) statt vieler einzelner; gibst du ihm weitere, bevor er sie erledigt hat, zählt sie nur hoch.

Als Ziel gehen nur Benutzer, die die jeweilige Mappe lesen dürfen – wie beim einzelnen Weitergeben; Dienstkonten von Paketen stehen nicht zur Wahl. **Als erledigt markieren** erledigt die Auswahl auf einmal; *Passt nicht*-Aufgaben bleiben offen, bis die Mappe wieder passt. Für andere Programme gibt es dasselbe über die [Schnittstelle](api.md) (`POST /api/v1/aufgaben/weitergeben` und `…/erledigt`).

![Mehrere Aufgaben ausgewählt](bilder/werkbank-aufgaben-auswahl.png){ loading=lazy }

Ging eine Frist oder Erinnerung an jemanden, der die Mappe nach den [Berechtigungen](berechtigungen.md) nicht lesen darf, steht oben ein Hinweis und an der Aufgabe „Empfänger darf die Mappe nicht lesen“. Gib sie weiter oder passe die Berechtigungen an.

## Tägliche Zusammenfassung

Statt bei jeder neuen Aufgabe eine E-Mail zu schicken, verschickt das DMS **einmal am Tag** eine Übersicht an jeden, der offene Aufgaben hat – mit Links zu den Mappen.

- Oben in der Mitte stellst du ein, ob sie verschickt wird, und die **Standard-Uhrzeit** (deutsche Zeit). Standard: an, 7:00 Uhr.
- Den Abschnitt kannst du mit einem Klick auf die Überschrift **zuklappen**; das DMS merkt sich das für dich. Zugeklappt steht daneben der Stand (z. B. „Standard 07:00 · an“) – und darunter die Warnung, wenn die Zusammenfassung nicht verschickt werden kann, weil der E-Mail-Versand aus ist.
- **Jeder Benutzer** wählt in seinem **Profil** eine eigene Uhrzeit (im 15-Minuten-Raster) und die **Wochentage**; ohne eigene Wahl gelten die Standard-Uhrzeit und **Montag bis Freitag**. Änderst du die Standard-Uhrzeit, gilt sie für alle ohne eigene Uhrzeit. Abbestellen kann er sie dort auch.
- Die Mail kommt höchstens einmal am Tag, frühestens zur gewählten Uhrzeit. War das DMS zu dieser Zeit aus, kommt sie nach dem Start noch am selben Tag; am nächsten Tag wird nichts nachgeholt. Wer abwesend ist oder nichts offen hat, bekommt keine.
- **Bundesland** – damit niemand an gesetzlichen Feiertagen eine Zusammenfassung bekommt (jeder kann das im Profil abwählen). Das DMS berechnet die Feiertage selbst: die bundesweiten und die landesweiten des gewählten Landes, Ostern und die davon abhängigen Tage nach der Gaußschen Osterformel. Feiertage, die nur in einzelnen Gemeinden gelten – etwa Mariä Himmelfahrt in Teilen Bayerns oder das Augsburger Friedensfest –, und einmalige Feiertage werden nicht berücksichtigt. *Keins* schaltet das ab.
- **Jetzt senden** verschickt sie sofort an alle mit offenen Aufgaben – unabhängig von Uhrzeit, Wochentag und Feiertag, z. B. zum Ausprobieren.
- Voraussetzung ist der eingerichtete [E-Mail-Versand](installation.md#e-mail-und-adresse). Ist er aus, steht im Abschnitt „E-Mail-Versand ist ausgeschaltet – es wird nichts verschickt“ mit **E-Mail einrichten**.
