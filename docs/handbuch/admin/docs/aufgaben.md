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
| **Post für dich** | wenn bei neuer [Post](https://help.ablago.app/benutzer/aktuell/post/) ein Benutzer unter *An* steht oder *An* sich ändert – seit Version 0.257 über die [Automatisierung](automatisierungen.md#post-fur-dich) *Post für dich* (Paket Benachrichtigungen) | der Benutzer bei *An*, bei Abwesenheit seine Vertretung | von selbst, sobald die Post zugeordnet, erledigt oder an jemand anderen gegeben ist |
| **Auskunft** | wenn eine Person ihre [Auskunft](datenschutz.md#auskunft-zustellen) über den Abruf-Link heruntergeladen hat oder der Link nach Fehlversuchen gesperrt wurde | wer den Link bzw. die Auskunft erstellt hat und wer die Mappe der Person als Favorit hat (sofern die Benachrichtigung für den Favoriten an ist) | per Knopf *Erledigt*; solange sie offen ist, kommt für denselben Link keine zweite |
| **Geändert** | wenn jemand eine Mappe ändert, die andere als Favorit haben ([Favorit = Abo](https://help.ablago.app/benutzer/aktuell/ablage/#favoriten-als-abo)) | wer die Mappe als Favorit hat, lesen darf und die Benachrichtigung nicht abgeschaltet hat – nie der, der geändert hat | von selbst beim Öffnen der Mappe, oder per Knopf *Erledigt*; bis dahin zählt sie nur hoch |

- Empfänger sind immer **Benutzer**, keine Rollen – eine Aufgabe für alle bleibt sonst gern liegen.
- Wer sich selbst erwähnt, bekommt keine Aufgabe; erneutes Speichern erzeugt keine zweite. Wird eine Erwähnung wieder entfernt, bleibt die Aufgabe offen; in der Historie der Mappe steht, dass sie entfernt wurde.
- **Weitergeben** dürfen der Empfänger selbst und Administratoren; das steht in der Historie der Mappe. Mehrere auf einmal gehen in [Werkbank → Aufgaben](#mehrere-aufgaben-auf-einmal-weitergeben) und für die eigenen unter Mein Konto → [Abwesenheit](https://help.ablago.app/benutzer/aktuell/profil/#abwesenheit).

## Werkbank → Aufgaben { #werkbank-aufgaben }

Alle offenen Aufgaben aller Benutzer stehen unter **Werkbank → Einstellungen → Aufgaben**. Wer wann benachrichtigt wird – [Tägliche Zusammenfassung](#tagliche-zusammenfassung), [Favoriten](#favoriten-benachrichtigen), *Post für dich*, *Vertretung* –, stellst du nicht hier ein, sondern unter [Automatisierungen](automatisierungen.md#benachrichtigungen); ein Satz mit Link über der Liste führt dorthin.

![Werkbank → Aufgaben](bilder/werkbank-aufgaben.png)

In der Mitte steht die Liste aller offenen Aufgaben aller Benutzer mit Mappe, Art, Datum und Empfänger. Über die Auswahl unter einer Aufgabe gibst du sie an jemand anderen weiter. Wählst du eine Aufgabe, steht rechts ihre Mappe mit den wichtigsten Feldern, **In der Ablage öffnen** und daneben **Weitergeben an** – wie die Auswahl in der Liste. Danach stimmen Empfänger rechts und in der Liste sofort.

Oben steht das **Suchfeld** – es sucht im Titel der Mappe und im Text der Aufgabe, **Esc** oder **×** leeren es. Darunter grenzen die **Filter** ein nach:

- **Empfänger** – ein Benutzer, *Administratoren* oder *abwesend, ohne Vertretung* (Aufgaben von Benutzern, die abwesend oder deaktiviert sind und für die niemand eingetragen ist – sie bleiben sonst liegen),
- **Art** (Passt nicht, Erwähnung, Zugewiesen, Frist …), **Mappentyp**,
- **Fälligkeit** nach dem Datum von Frist oder Erinnerung: *überfällig*, *diese Woche* (bis Sonntag), *später*, *ohne Datum*.

Der Haken **Erledigte zeigen** schaltet auf die zuletzt erledigten Aufgaben um. Suche und Filter stehen in der Adresse – so lässt sich ein gefilterter Blick als Link merken oder weitergeben. Darunter steht, wie viele Aufgaben passen („12 Treffer“); passt keine, setzt **Suche und Filter zurücksetzen** alles zurück.

### Mehrere Aufgaben auf einmal weitergeben

Bei Urlaub, Krankheit oder wenn die Zuständigkeit wechselt, verteilst du viele Aufgaben in einem Schritt neu:

1. Grenze die Liste mit Suche und Filtern ein, z. B. *Empfänger: Jonas*.
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

Statt bei jeder neuen Aufgabe eine E-Mail zu schicken, verschickt Ablago **einmal am Tag** eine Übersicht an jeden, der offene Aufgaben hat – mit Links zu den Mappen. Sie enthält die Titel der Mappen (keine Dokumente) und geht über den eingerichteten [Mailserver](installation.md#e-mail-und-adresse) hinaus; jeder bestellt sie in Mein Konto selbst ab.

Seit Version 0.257 gibt es dafür **keinen eigenen Abschnitt mehr unter Werkbank → Aufgaben** – alles steht in der Automatisierung **Tägliche Zusammenfassung** (Werkbank → [Automatisierungen](automatisierungen.md#benachrichtigungen), Paket **Benachrichtigungen**):

| Bisher unter Werkbank → Aufgaben | Jetzt |
| --- | --- |
| Ob sie verschickt wird | Automatisierung ein- oder ausschalten |
| Vorgabe-Uhrzeit für alle ohne eigene | Uhrzeit der Wenn-Karte *Zeitplan für jeden Benutzer* (Standard 7:00 Uhr, in der Zeitzone der [Region](region.md)) |
| Hinweis „Bundesland für Feiertage“ | unverändert unter [Werkbank → Region](region.md) |
| **Jetzt senden** (an alle) | **Ausprobieren** in der Automatisierung: Benutzer-Mappe einer Person wählen, **Ausführen** – die Zusammenfassung geht sofort an diese Person (siehe [Ausprobieren](automatisierungen.md#ausprobieren-verlauf-und-anderungsverlauf)) |
| Warnung „E-Mail-Versand ist aus“ | Hinweis in der [Werkbank-Übersicht](uebersicht.md) und unter Mein Konto |

- **Jeder Benutzer** wählt unter **Mein Konto** eine eigene Uhrzeit (im 15-Minuten-Raster) und die **Wochentage**; ohne eigene Wahl gelten die Uhrzeit der Automatisierung und **Montag bis Freitag**. Abbestellen kann er sie dort auch.
- Die Mail kommt höchstens einmal am Tag, frühestens zur gewählten Uhrzeit. War Ablago zu dieser Zeit aus, kommt sie nach dem Start noch am selben Tag; am nächsten Tag wird nichts nachgeholt. Wer abwesend ist oder nichts offen hat, bekommt keine.
- **Feiertage** – an gesetzlichen Feiertagen kommt keine Zusammenfassung (jeder kann das in Mein Konto abwählen). Welche das sind, richtet sich nach dem Bundesland unter [Werkbank → Einstellungen → Region](region.md); ohne Bundesland gibt es keine Feiertage.
- Voraussetzung ist der eingerichtete [E-Mail-Versand](installation.md#e-mail-und-adresse).

## Favoriten benachrichtigen

Wer eine Mappe als **Favorit** markiert, bekommt eine Benachrichtigung „Geändert“ unter *Zu erledigen*, wenn jemand anderes sie ändert (siehe Benutzerhandbuch, [Favoriten als Abo](https://help.ablago.app/benutzer/aktuell/ablage/#favoriten-als-abo)). Für wen es das gibt, stellst du seit Version 0.257 in der Automatisierung **Favoriten-Änderungen melden** ein (Werkbank → [Automatisierungen](automatisierungen.md#benachrichtigungen), Dann-Karte *Favoriten-Änderungen melden*):

| Bisher unter Werkbank → Aufgaben | Jetzt in der Automatisierung |
| --- | --- |
| Erlaubt *für alle* | keine Rolle gewählt |
| Erlaubt *nur für bestimmte Rollen* | **Nur an Mitglieder dieser Rollen** – Systemrolle **Mitglied** und die weiteren Rollen aus der [Benutzerverwaltung](benutzer.md) |
| Erlaubt *für niemanden* | Automatisierung ausschalten |
| Für neue Benutzer eingeschaltet | **Neue Benutzer bekommen die Benachrichtigung** |
| Vorgabe auf alle anwenden | entfällt – jeder stellt es unter Mein Konto selbst ein |

- Beim Update auf 0.257 übernimmt Ablago deine bisherige Einstellung einmal in diese Karte: *für niemanden* schaltet die Automatisierung aus, die gewählten Rollen und die Vorgabe stehen danach in der Karte.
- Wer nicht dazugehört – oder wenn keine eingeschaltete Automatisierung ihn erreicht –, sieht den Schalter **Bei Änderungen benachrichtigen** in seiner Favoritenliste und unter Mein Konto nicht; unter Mein Konto steht stattdessen ein Hinweis. Was er selbst eingestellt hat, bleibt gespeichert. Der Stern selbst und das Hervorheben geänderter Mappen bleiben.
- Dasselbe gilt für Favoriten bei [Auskünften](datenschutz.md#auskunft-zustellen): Die Aufgabe *Auskunft* bekommt ein Favorit nur, wenn die Benachrichtigung für ihn an ist.
