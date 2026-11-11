# Aufgaben

Eine **Aufgabe** sagt, dass an einer Mappe jemand etwas tun soll. Jede Mappe mit einer offenen Aufgabe steht bei ihrem Empfänger unter **Zu erledigen** – „Zu erledigen“ ist damit die Liste der eigenen Aufgaben. Wie Benutzer damit arbeiten, beschreibt das [Benutzerhandbuch](https://help.ablago.app/benutzer/zusammenarbeit/).

Aufgaben entstehen auf diesen Wegen:

| Art | Entsteht | Empfänger | Erledigt |
| --- | --- | --- | --- |
| **Passt nicht** | wenn eine Mappe nach einer Änderung am [Mappentyp](mappentypen.md#wenn-sich-ein-mappentyp-andert) nicht mehr passt | wer die Mappe angelegt hat (sonst die Administratoren) | von selbst, sobald die Mappe wieder passt |
| **Erwähnung** | wenn jemand in einem formatierten Text mit **@** einen Benutzer erwähnt | der Erwähnte | per Knopf *Erledigt* |
| **Zugewiesen** | von Hand über *Mappe ▾ →* **Aufgabe vergeben** an der Mappe | ein gewählter Benutzer | per Knopf *Erledigt* |
| **Frist** | vor dem Datum eines Datumsfelds, das eine [Frist](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) ist – angelegt von einer Automatisierung *Datum erreicht* | wie in der Automatisierung eingestellt, z. B. der Benutzer in einem Feld, sonst wer die Mappe angelegt hat | per Knopf *Erledigt*, oder von selbst, wenn sich das Datum ändert |
| **Erinnerung** | am gewählten Tag nach *Mappe ▾ →* **Erinnern** an der Mappe | der gewählte Benutzer | per Knopf *Erledigt* |
| **Vertretung** | wenn für einen Benutzer eine [Abwesenheit](benutzer.md#abwesenheit) mit Vertreter eingetragen wird – seit Version 0.177 über die [Automatisierung](automatisierungen.md) *Vertretung eingetragen* (Paket Benachrichtigungen bzw. beim Update übernommen) | der Vertreter (*Vertreter aus dem Ereignis*); die Aufgabe hängt an der Benutzer-Mappe des Abwesenden | von selbst, sobald die Abwesenheit endet oder sich Zeitraum oder Vertreter ändern; oder per Knopf *Erledigt* |
| **Post für dich** | wenn bei neuer [Post](https://help.ablago.app/benutzer/aktuell/post/) ein Benutzer unter *An* steht | der Benutzer bei *An* | von selbst, sobald die Post zugeordnet, erledigt oder weitergegeben ist |
| **Auskunft** | wenn eine Person ihre [Auskunft](datenschutz.md#auskunft-zustellen) über den Abruf-Link heruntergeladen hat oder der Link nach Fehlversuchen gesperrt wurde | wer den Link bzw. die Auskunft erstellt hat und wer die Mappe der Person als Favorit hat (sofern die Benachrichtigung für den Favoriten an ist) | per Knopf *Erledigt*; solange sie offen ist, kommt für denselben Link keine zweite |
| **Geändert** | wenn jemand eine Mappe ändert, die andere als Favorit haben ([Favorit = Abo](https://help.ablago.app/benutzer/aktuell/ablage/#favoriten-als-abo)) | wer die Mappe als Favorit hat, lesen darf und die Benachrichtigung nicht abgeschaltet hat – nie der, der geändert hat | von selbst beim Öffnen der Mappe, oder per Knopf *Erledigt*; bis dahin zählt sie nur hoch |

- Empfänger sind immer **Benutzer**, keine Rollen – eine Aufgabe für alle bleibt sonst gern liegen.
- Wer sich selbst erwähnt, bekommt keine Aufgabe; erneutes Speichern erzeugt keine zweite. Wird eine Erwähnung wieder entfernt, bleibt die Aufgabe offen; in der Historie der Mappe steht, dass sie entfernt wurde.
- **Weitergeben** dürfen der Empfänger selbst und Administratoren; das steht in der Historie der Mappe. Mehrere auf einmal gehen in [Werkbank → Benachrichtigungen und Aufgaben](#mehrere-aufgaben-auf-einmal-weitergeben) und für die eigenen unter Mein Konto → [Abwesenheit](https://help.ablago.app/benutzer/aktuell/profil/#abwesenheit).

## Werkbank → Benachrichtigungen und Aufgaben { #werkbank-aufgaben }

Alles rund um Aufgaben und die Mails dazu steht an einer Stelle: **Werkbank → Einstellungen → Benachrichtigungen und Aufgaben**.

![Werkbank → Benachrichtigungen und Aufgaben](bilder/werkbank-aufgaben.png)

In der Mitte steht oben die [Tägliche Zusammenfassung](#tagliche-zusammenfassung), darunter alle offenen Aufgaben aller Benutzer mit Mappe, Art, Datum und Empfänger. Über die Auswahl unter einer Aufgabe gibst du sie an jemand anderen weiter. Wählst du eine Aufgabe, steht rechts ihre Mappe mit den wichtigsten Feldern, **In der Ablage öffnen** und daneben **Weitergeben an** – wie die Auswahl in der Liste. Danach stimmen Empfänger rechts und in der Liste sofort.

Der **Filter** über der Liste grenzt ein nach:

- **Empfänger** – ein Benutzer, *Administratoren* oder *abwesend, ohne Vertretung* (Aufgaben von Benutzern, die abwesend oder deaktiviert sind und für die niemand eingetragen ist – sie bleiben sonst liegen),
- **Art** (Passt nicht, Erwähnung, Zugewiesen, Frist …), **Mappentyp**,
- **Fälligkeit** nach dem Datum von Frist oder Erinnerung: *überfällig*, *diese Woche* (bis Sonntag), *später*, *ohne Datum*,
- Text im **Titel** der Mappe oder in der Aufgabe.

**Erledigte zeigen** schaltet auf die zuletzt erledigten Aufgaben um. Der Filter steht in der Adresse – so lässt sich ein gefilterter Blick als Link merken oder weitergeben. Darunter steht, wie viele Aufgaben passen.

### Mehrere Aufgaben auf einmal weitergeben

Bei Urlaub, Krankheit oder wenn die Zuständigkeit wechselt, verteilst du viele Aufgaben in einem Schritt neu:

1. Grenze die Liste mit dem Filter ein, z. B. *Empfänger: Jonas*.
2. Hake die Aufgaben links an – oder **Alle angezeigten auswählen** (das gilt nur für die gerade gefilterten). Daneben steht, wie viele ausgewählt sind.
3. In der Leiste darüber **Ausgewählte weitergeben an** einen Benutzer wählen und **Weitergeben**. Eine Rückfrage nennt Anzahl und Ziel.

Danach steht dort, wie viele weitergegeben wurden – und welche nicht und warum, etwa „Carl darf die Mappe nicht lesen“ oder „liegt schon bei Carl“. Was nicht ging, bleibt ausgewählt; du kannst es gleich an jemand anderen geben. Jede Weitergabe steht in der Historie ihrer Mappe. Der neue Empfänger bekommt **eine** Sammelbenachrichtigung unter „Zu erledigen“ (Art *Zugewiesen*, an deiner Benutzer-Mappe: „Lena hat dir 12 Aufgaben weitergegeben“) statt vieler einzelner; gibst du ihm weitere, bevor er sie erledigt hat, zählt sie nur hoch.

Als Ziel gehen nur Benutzer, die die jeweilige Mappe lesen dürfen – wie beim einzelnen Weitergeben; Dienstkonten von Paketen stehen nicht zur Wahl. **Als erledigt markieren** erledigt die Auswahl auf einmal; *Passt nicht*-Aufgaben bleiben offen, bis die Mappe wieder passt. Für andere Programme gibt es dasselbe über die [Schnittstelle](api.md) (`POST /api/v1/aufgaben/weitergeben` und `…/erledigt`).

![Mehrere Aufgaben ausgewählt](bilder/werkbank-aufgaben-auswahl.png){ loading=lazy }

Liegt eine Aufgabe bei jemandem, der die Mappe nach den [Berechtigungen](berechtigungen.md) nicht lesen darf, steht oben ein Hinweis und an der Aufgabe „Empfänger darf die Mappe nicht lesen“.

## Aufgaben bei Personen ohne Leserecht

Grundsatz: **Wer eine Aufgabe bekommt, darf die Mappe lesen.** Ablago hält die Arbeit trotzdem nicht auf, sondern zeigt, wo das nicht so ist. Das kommt vor, wenn jemand vertritt, der bestimmte Mappen nicht sehen darf, wenn eine Aufgabe von Hand an so jemanden geht, wenn sich Berechtigungen ändern oder wenn eine Automatisierung an eine Rolle oder ein Feld geht.

- **Von Hand zugewiesen:** Wer eine Aufgabe vergibt oder weitergibt, bekommt vorher den Hinweis „Jonas darf diese Mappe nicht sehen …“ mit **Trotzdem zuweisen** und **Abbrechen**. Rechte geben kann dabei niemand – das machst nur du in der Werkbank. Der Text bleibt für den Empfänger sichtbar.
- **Automatisch entstanden** (Fristen, Automatisierungen, Vertretung): Die Aufgabe kommt an, der Empfänger sieht aber nur „Aufgabe zu einer Mappe, die du nicht sehen darfst – frag Lena“ (wer die Mappe angelegt hat) und die Fälligkeit – unter „Zu erledigen“ wie in der Täglichen Zusammenfassung. Bei Fristen und Aufgaben zu einem Datumsfeld fehlt auch das Datum: Es ist ein Wert der Mappe.

**Werkbank → Aufgaben → Aufgaben bei Personen ohne Leserecht** zeigt oben die offenen Fälle („3 Aufgaben liegen bei Personen ohne Leserecht“) und darunter die **früheren Fälle** mit Zeitraum, Person, Mappe und ob ein Leserecht auf Zeit gegeben wurde. So siehst du, wo das schon öfter vorkam. Je Fall springst du **zur Mappe** oder mit **Rechte prüfen** in den [Testlauf](berechtigungen.md#testlauf) des Mappentyps, Person und Mappe schon gewählt. Von neuen Fällen erfährst du wie von den anderen [technischen Aufgaben](benutzer.md#aufgaben-ohne-empfanger): Hinweis in der Werkbank und die gebündelte E-Mail an die Administratoren.

**Leserecht für die Dauer der Aufgabe geben:** Der Knopf steht bei jedem offenen Fall. Das Recht gilt nur zum **Lesen**, nur für **diese Mappe** und endet von selbst, wenn die Aufgabe erledigt, gelöscht oder an jemand anderen gegeben wird. In der Historie der Mappe stehen beide Schritte, etwa „Leserecht an Jonas wegen Aufgabe „Bitte unterschreiben“ vergeben (von Markus)“ und „Leserecht von Jonas nach Erledigen der Aufgabe wieder entzogen“. Der Testlauf der Rechte zeigt das Recht auf Zeit mit seinem Grund. Dauerhaft richtest du es über die Berechtigungen des Mappentyps; erlauben die das Lesen, endet der Fall von selbst.

Ablago gleicht die Fälle nach jedem Vergeben, Weitergeben und Erledigen ab und sonst alle fünf Minuten (etwa nach geänderten Berechtigungen). Aufgaben ohne einzelnen Empfänger (für die Administratoren) zählen nicht als Fall.

## Tägliche Zusammenfassung

Statt bei jeder neuen Aufgabe eine E-Mail zu schicken, verschickt Ablago **einmal am Tag** eine Übersicht an jeden, der offene Aufgaben hat – mit Links zu den Mappen. Sie enthält die Titel der Mappen (keine Dokumente) und geht über den eingerichteten [Mailserver](installation.md#e-mail-und-adresse) hinaus; jeder bestellt sie in Mein Konto selbst ab, ausschalten kannst du sie hier für alle.

- **Ob und wann** sie verschickt wird, stellst du in der Automatisierung **Tägliche Zusammenfassung** ein (Werkbank → [Automatisierungen](automatisierungen.md#benachrichtigungen)): Wenn-Karte *Zeitplan für jeden Benutzer* mit *Uhrzeit aus Mein Konto*, Dann-Karte *Tägliche Zusammenfassung senden*. Die Uhrzeit der Karte (Standard 7:00 Uhr, in der Zeitzone der [Region](region.md)) gilt für alle ohne eigene. Ausschalten heißt: die Automatisierung ausschalten. Das Paket **Benachrichtigungen** bringt sie mit.
- Den Abschnitt hier kannst du mit einem Klick auf die Überschrift **zuklappen**; Ablago merkt sich das für dich. Darunter steht die Warnung, wenn die Zusammenfassung nicht verschickt werden kann, weil der E-Mail-Versand aus ist.
- **Jeder Benutzer** wählt unter **Mein Konto** eine eigene Uhrzeit (im 15-Minuten-Raster) und die **Wochentage**; ohne eigene Wahl gelten die Uhrzeit der Automatisierung und **Montag bis Freitag**. Abbestellen kann er sie dort auch.
- Die Mail kommt höchstens einmal am Tag, frühestens zur gewählten Uhrzeit. War Ablago zu dieser Zeit aus, kommt sie nach dem Start noch am selben Tag; am nächsten Tag wird nichts nachgeholt. Wer abwesend ist oder nichts offen hat, bekommt keine.
- **Feiertage** – an gesetzlichen Feiertagen kommt keine Zusammenfassung (jeder kann das in Mein Konto abwählen). Welche das sind, richtet sich nach dem Bundesland unter [Werkbank → Einstellungen → Region](region.md); ohne Bundesland gibt es keine Feiertage.
- **Jetzt senden** verschickt sie sofort an alle mit offenen Aufgaben – unabhängig von Uhrzeit, Wochentag und Feiertag, z. B. zum Ausprobieren.
- Voraussetzung ist der eingerichtete [E-Mail-Versand](installation.md#e-mail-und-adresse). Ist er aus, steht im Abschnitt „E-Mail-Versand ist ausgeschaltet – es wird nichts verschickt“ mit **E-Mail einrichten**.

## Favoriten benachrichtigen

Wer eine Mappe als **Favorit** markiert, bekommt eine Benachrichtigung „Geändert“ unter *Zu erledigen*, wenn jemand anderes sie ändert (siehe Benutzerhandbuch, [Favoriten als Abo](https://help.ablago.app/benutzer/aktuell/ablage/#favoriten-als-abo)). Unter der Täglichen Zusammenfassung legst du fest, für wen es das gibt:

- **Erlaubt** – *für alle* (Standard), *nur für bestimmte Rollen* oder *für niemanden*.
- **Nur für bestimmte Rollen:** oben die Systemrollen **Administrator** und **Mitglied**, darunter die weiteren Rollen aus der [Benutzerverwaltung](benutzer.md). Ein Benutzer bekommt die Benachrichtigung, wenn er mindestens eine der gewählten Rollen hat. Mindestens eine Rolle muss gewählt sein.
- Wer nicht dazugehört, sieht den Schalter **Bei Änderungen benachrichtigen** in seiner Favoritenliste und unter Mein Konto nicht mehr; unter Mein Konto steht stattdessen ein Hinweis. Was er selbst eingestellt hat, bleibt gespeichert und gilt wieder, sobald du die Benachrichtigung für ihn erlaubst. Der Stern selbst und das Hervorheben geänderter Mappen bleiben.
- **Für neue Benutzer eingeschaltet** – die Vorgabe für alle, die ab jetzt dazukommen (Standard: an). Bestehende Benutzer behalten ihre Einstellung.
- **Vorgabe auf alle anwenden** setzt die gespeicherte Vorgabe nach einer Rückfrage bei allen bestehenden Benutzern – auch über das hinweg, was sie unter Mein Konto gewählt haben. Einzeln stumm geschaltete Favoriten bleiben stumm.

Den Abschnitt klappst du wie die Tägliche Zusammenfassung mit einem Klick auf die Überschrift zu; daneben steht dann der Stand. Die Tägliche Zusammenfassung zeigt geänderte Favoriten nicht eigens – die Aufgabe „Geändert“ steht dort ohnehin mit.
