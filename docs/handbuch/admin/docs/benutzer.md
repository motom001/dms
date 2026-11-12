# Benutzer und Rollen

Unter **Werkbank → Benutzer** legst du fest, wer sich anmelden darf, mit welchen Rollen – und wer Ablago verwalten darf (siehe [Wer darf Ablago verwalten?](verwalten.md)). Ein eigenes Konto „Administrator“ gibt es nicht. Die Liste zeigt die Benutzer mit ihrem Stand (*aktiv*, *eingeladen*), wer gerade aktiv ist und wer abwesend ist. Deaktivierte blendet sie aus; **Deaktivierte zeigen** holt sie (grau, am Ende) dazu – die Wahl merkt sich die Werkbank.

![Ein Benutzer in der Werkbank](bilder/werkbank-benutzer.png)

## Aufbau des Editors { #aufbau-des-editors }

Ein Benutzer ist rechts wie ein [Mappentyp](mappentypen.md#aufbau-des-editors) gegliedert: oben die **Sprungleiste** mit **Alle aufklappen / Alle zuklappen**, darunter die Bereiche **Grunddaten → Rollen und Rechte → Vertretung → Anmeldung und Sicherheit → Zugang**. Eingeklappt zeigt jeder Bereich eine Kurzinfo, etwa „2 Rollen“, „Gesamte Verwaltung“ oder „vertreten durch Jonas“. Was du aufklappst, merkt sich dein Gerät je Benutzer. Bei dir selbst fehlt *Zugang*, solange du aktiv bist – dich selbst kannst du weder sperren noch nachstellen.

- **Ein Speichern für alles:** Name, Rollen, Verwaltungsrecht und Vertretung speichert **Benutzer speichern** in der Leiste unten auf einmal; **Verwerfen** (oder Esc) nimmt alle Änderungen zurück. Scheitert ein Teil – etwa weil die frische Anmeldung für das Verwaltungsrecht abgebrochen wurde –, ist das Vorige gespeichert, und der Bereich mit dem Fehler ist rot markiert und aufgeklappt.
- **Sofort wirkt**, was eine eigene Handlung ist: Passwort-Link erzeugen, Zwei-Faktor und Passkeys zurücksetzen, Geräte abmelden, Aufgaben an den Vertreter geben, Fehler nachstellen, deaktivieren und aktivieren.

![Ein Benutzer am Handy: Sprungleiste oben, Bereiche zugeklappt](bilder/werkbank-benutzer-handy.png){ width="320" }

## Benutzer einladen

1. **+ Neu**
2. Unter *Grunddaten* E-Mail-Adresse und Name eintragen, unter *Rollen und Rechte* bei Bedarf **Rollen** anhaken. Ein Verwaltungsrecht vergibst du danach bei der Person (nur mit „Gesamte Verwaltung“).
3. **Benutzer anlegen und einladen** – ohne E-Mail-Versand heißt der Knopf **Benutzer anlegen**. **Entwurf verwerfen** bricht ab.

![Neuen Benutzer anlegen](bilder/werkbank-benutzer-neu.png)

Ist E-Mail-Versand eingerichtet, bekommt der Benutzer eine Einladung. Sonst zeigt Ablago den Einladungslink zum Kopieren – schick ihn auf einem sicheren Weg weiter. Der Link ist 7 Tage gültig und funktioniert einmal. **Einladung erneut senden** macht den alten Link ungültig.

## Aufgaben ohne Empfänger { #aufgaben-ohne-empfanger }

Manche Aufgaben haben keinen einzelnen Empfänger: Aufgaben ohne Empfänger, Post ohne **An** und Fristen ohne Zuständige. Im [Verwaltungsmodus](verwalten.md#der-verwaltungsmodus) sieht sie jede Person, die verwaltet. Weil man im Alltag nicht im Verwaltungsmodus arbeitet, bekommt sie zusätzlich **eine Person** – gern auch du selbst.

- Öffne **Werkbank → Benutzer**, ohne einen Benutzer auszuwählen. Rechts steht **Aufgaben ohne Empfänger gehen an**.
- Wähle eine Person wie in einem Verweisfeld: Tippe den Namen und wähle ihn aus. Wählbar sind alle aktiven Benutzer. **Entfernen** und **Speichern** heißt: Man sieht sie nur im Verwaltungsmodus.
- Vorgabe ist die **erste Person** – bei einer neuen Installation die, die Ablago einrichtet („Dein Konto“ im Einrichtungsassistenten). Verwaltungsrechte bekommt dadurch niemand. Hast du einmal gespeichert – auch „niemand“ –, ändert Ablago nichts mehr von selbst.
- Die gewählte Person sieht die Aufgaben unter **Zu erledigen** und in den Zahlen (auch im [Zähler-Endpunkt](api.md)), kann sie erledigen und weitergeben. Im Verwaltungsmodus sieht man sie weiterhin.
- Ist die Person abwesend oder deaktiviert, übernimmt wie bei jeder Aufgabe ihr [Vertreter](#andern-deaktivieren-loschen). Ist sie deaktiviert, wähle am besten jemand anderen – die Werkbank weist darauf hin.

**Technisches bleibt in der Werkbank:** Sicherung fehlgeschlagen, ein Paket braucht Einstellungen, eine Automatisierung ist angehalten, ein Postfach braucht eine neue Anmeldung, eine Aufgabe liegt bei jemandem [ohne Leserecht](aufgaben.md#aufgaben-bei-personen-ohne-leserecht) und Ähnliches stehen in der [Übersicht](uebersicht.md). Damit es niemand übersieht:

- Ablago schreibt den Personen, die den passenden Bereich verwalten (mit „Gesamte Verwaltung“: alles), **höchstens einmal am Tag** (ab 7 Uhr) eine E-Mail, wenn etwas Neues dazugekommen ist. Was ohnehin sofort eine eigene E-Mail schickt – Sicherung fehlgeschlagen oder zu alt, Speicherplatz, Notfallzugang –, kommt darin nicht noch einmal als neu. Ohne eingerichteten [E-Mail-Versand](installation.md#e-mail-und-adresse) entfällt die E-Mail.
- Wer den Bereich verwaltet, sieht außerhalb des Verwaltungsmodus oben den Hinweis **„Für die Verwaltung liegt etwas an.“** mit dem Knopf **Ablago verwalten**. Der Hinweis nennt nie, was anliegt, und verschwindet, sobald nichts mehr offen ist.

## Passwort vergessen

Mit E-Mail-Versand fordern Benutzer den Link selbst an. Ohne E-Mail-Versand erzeugst du ihn beim Benutzer mit **Passwort-Link erzeugen** und gibst ihn weiter. Ein Passwort-Link ist eine Stunde gültig; das bisherige Passwort gilt, bis ein neues gesetzt ist.

## Ändern, deaktivieren, löschen

- Den **Namen** änderst du direkt beim Benutzer. Die E-Mail-Adresse ändert jeder Benutzer selbst unter Mein Konto (mit seinem Passwort).
    - Ist unter [Anmeldung über einen Anbieter](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) eine **Gruppe für „Gesamte Verwaltung“** gesetzt, folgt dieses Recht bei jeder Anmeldung über den Anbieter der Gruppe: Wer in der Gruppe ist, bekommt es, wer nicht mehr dazugehört, verliert es (die letzte Person behält es). Eine Auswahl einzelner Bereiche bleibt unberührt.
- An Konten von Personen, die **verwalten dürfen**, kommst du nur mit **„Gesamte Verwaltung“** heran: Passwort-Link, Zwei-Faktor zurücksetzen, deaktivieren, löschen und „Als … anmelden“.
- <span id="abwesenheit"></span>**Abwesenheit** (Bereich *Vertretung*) – wie unter „Mein Konto“ des Benutzers (siehe [Benutzerhandbuch](https://help.ablago.app/benutzer/profil/#abwesenheit)): an/aus, von, bis, Vertreter. Du kannst sie für andere eintragen, etwa bei Krankheit, und speicherst sie mit **Benutzer speichern**. Mit **Alle offenen Aufgaben an ‹Vertreter› geben** gibst du seine Aufgaben sofort ab – erst nach dem Speichern einer geänderten Abwesenheit. Das steht in der Historie seiner Benutzer-Mappe. Willst du sie auf mehrere Personen verteilen, nimm die [Sammel-Weitergabe](aufgaben.md#mehrere-aufgaben-auf-einmal-weitergeben) unter Werkbank → Aufgaben (Filter *Empfänger*).
- <span id="zugang-sperren"></span>**Zugang sperren** (Bereich *Zugang*, ganz unten) – **Benutzer deaktivieren** sperrt den Zugang sofort und beendet alle Sitzungen, nach einer Rückfrage. Die Mappe bleibt erhalten und behält den Namen; er erscheint überall *kursiv und durchgestrichen* (mit dem Hinweis „deaktiviert seit …“ beim Darüberfahren, für Screenreader „(deaktiviert)“). Alle Verweise auf ihn (z. B. als Verantwortlicher) bleiben gültig.
    - Das geht nur, wenn ein **Vertreter** hinterlegt ist und der Benutzer **keine offenen Aufgaben** mehr hat. Fehlt etwas, nennt der Abschnitt den Grund; Vertreter wählen und Aufgaben abgeben geht im Bereich *Vertretung*.
    - Der Vertreter bleibt hinterlegt und wirkt **dauerhaft**: Was noch für den Deaktivierten entsteht (z. B. „passt nicht“ an Mappen, die er angelegt hat, oder eine Erwähnung in einem alten Text), bekommt der Vertreter.
    - **Benutzer aktivieren** macht es rückgängig; der Abschnitt zeigt dann, seit wann er deaktiviert ist.
- **Einladung löschen** geht nur, solange die Einladung nie angenommen wurde – etwa bei einer vertippten Adresse. Wer sich schon angemeldet hat, wird deaktiviert statt gelöscht, damit „angelegt von“ und Verweise erhalten bleiben.
    - Ist der [Papierkorb](papierkorb.md) eingeschaltet, wandert die Benutzer-Mappe in den Papierkorb, und der Benutzer ist bis dahin deaktiviert. Erst beim endgültigen Löschen aus dem Papierkorb verschwindet das Konto. Holst du die Mappe zurück, ist der Benutzer wieder aktiv.

Mindestens eine aktive Person, die sich anmelden kann, behält immer **„Gesamte Verwaltung“** – die letzte lässt sich weder das Recht nehmen noch deaktivieren oder löschen. Du kannst dich auch nicht selbst deaktivieren.

!!! warning "Notfallzugang"
    Eine über den [Notfallzugang](notfall.md) angelegte Person mit „Gesamte Verwaltung“ steht in der Liste als **„Notfall-Admin ‹Datum›“**. Die Übersicht der Werkbank zeigt einen roten Hinweis, bis du ihn umbenannt oder deaktiviert hast. Warst du das nicht, deaktiviere ihn sofort.

!!! warning "Im Verwaltungsmodus arbeitet man nicht täglich"
    Wer verwaltet, arbeitet im Alltag mit demselben Konto – ohne Verwaltungsrechte. Erst „Ablago verwalten“ im Benutzermenü schaltet sie frei; dann steht oben ein roter Balken, und man sieht alle Mappen, auch gesperrte. Mehr unter [Wer darf Ablago verwalten?](verwalten.md)

## Sitzungen

Im Bereich *Anmeldung und Sicherheit* steht, auf welchen Geräten der Benutzer angemeldet ist – mit Gerät, Browser und letzter Aktivität. Einzelne Sitzungen beendest du mit **Abmelden**, etwa wenn ein Gerät verloren ging. Ist er auf mehreren Geräten angemeldet, beendet **Überall abmelden** alle Sitzungen auf einmal.

Darüber steht, ob er die [Zwei-Faktor-Anmeldung](anmeldeschutz.md#zwei-faktor-anmeldung) eingerichtet hat. **Zurücksetzen** entfernt sie, z. B. nach einem verlorenen Handy. Darunter steht, wie viele [Passkeys](anmeldeschutz.md#passkeys) er hat; **Zurücksetzen** im Block **Passkeys** entfernt alle.

## Was sieht ein Benutzer?

Mit **Anzeigen** unter *Was sieht dieser Benutzer?* (Bereich *Rollen und Rechte*) siehst du je Mappentyp, wie viele Mappen der Benutzer nach den gespeicherten [Berechtigungen](berechtigungen.md) lesen darf, mit einigen Beispielen. Es gelten immer die Alltagsrechte der Person – im Verwaltungsmodus sähe sie alles. Willst du wissen, *warum* er eine bestimmte Mappe sieht oder nicht, nutze den [Testlauf](berechtigungen.md#testlauf) am Mappentyp.

## Fehler nachstellen

Meldet ein Benutzer einen Fehler, kannst du dich mit **Als … anmelden** als dieser Benutzer anmelden und siehst Ablago genau so wie er – mit seinen Rechten. Oben steht die ganze Zeit ein gelber Warnhinweis mit **Zurück zum eigenen Konto** – auf jeder Seite, auch am Handy. Das ist der einzige Weg zurück; im Menü unter dem Namen steht dafür kein Eintrag, damit du die Vertretung nicht aus Versehen beendest. Der Menüeintrag zum Konto heißt in dieser Zeit **Konto von …** und zeigt das Konto des Benutzers, nicht deins.

![Als Jonas angemeldet: gelber Warnhinweis oben, im Menü „Konto von Jonas Beispiel“](bilder/vertretung.png)

Der Benutzer sieht bei seiner nächsten Anmeldung, wer wann in seinem Namen gearbeitet hat. Alles, was du in dieser Zeit tust, geschieht unter seinem Konto.

## Benutzer als Mappen

Jeder Benutzer hat eine Mappe des [Systemmappentyps](mappentypen.md#systemmappentypen-benutzer-rolle-und-post) *Benutzer*, mit derselben Id wie sein Konto. So kann ein Mappentyp ein Feld wie „Verantwortlich“ bekommen, das auf einen Benutzer verweist.

![Benutzer-Mappe in der Ablage](bilder/benutzer-mappe.png)

- **Das Konto ist führend.** Name, E-Mail-Adresse, Rollen und „aktiv“ übernimmt die Mappe automatisch aus dem Konto – beim Anlegen, bei jeder Änderung und bei jedem Start von Ablago.
- **Abwesenheit** steht in den Systemfeldern *Abwesend* (wirkt gerade), *Abwesend von*, *Abwesend bis* und *Vertreter*. Damit lassen sich Ansichten wie „Abwesende Benutzer“ bauen, und ein Verknüpfungsregister mit der Quelle *Benutzer › Vertreter* zeigt, wen jemand vertritt. Hattest du schon eigene Felder mit diesen Kennungen, wurden sie beim Update umbenannt (z. B. `vertreter_alt`) – samt Werten.
- **Diese Systemfelder sind in der Ablage nur lesbar.** Der Server lehnt Änderungen daran ab, auch über die Schnittstelle. Sonst könnte ein Mitglied die E-Mail-Adresse einer Person ändern, die verwaltet, und deren Konto über „Passwort vergessen“ übernehmen.
- **Eigene Felder** (z. B. Telefon) kannst du am Mappentyp ergänzen; die sind in der Ablage normal bearbeitbar.
- Benutzer-Mappen lassen sich in der Ablage weder anlegen noch löschen.

## Rollen

Neben der **Systemrolle** *Mitglied*, die jeder hat, kann ein Benutzer beliebig viele **Rollen** haben – fachliche Zuständigkeiten wie „Steuern und Finanzen“.

- **Rollen anlegen, umbenennen, löschen** geschieht in der Ablage in der Ansicht *Rolle* – wer das darf, regeln die [Berechtigungen](berechtigungen.md) am Mappentyp *Rolle* (ohne Regeln: jeder Benutzer). Rollennamen sind eindeutig.
- **Zuordnen** geht nur hier in der Benutzerverwaltung (Haken bei *Rollen* im Bereich *Rollen und Rechte*, gespeichert mit **Benutzer speichern**). Die Mappe einer Rolle zeigt im Register *Benutzer*, wer sie hat.
- **Mitglied** ist eine **Systemrolle**: Sie erscheint als Rollen-Mappe, jeder Benutzer hat sie, und sie lässt sich weder umbenennen noch löschen. Die frühere Systemrolle *Administrator* ist seit dieser Version eine gewöhnliche Rolle ohne Mitglieder – Regeln, die sie nennen, bleiben gültig; brauchst du sie nicht, lösch sie.
- **Rolle löschen**, die Benutzer haben: erlaubt – die Zuordnung fällt weg. Verweist noch ein Feld auf die Rolle (z. B. „verantwortliche Rolle“), muss dieser Verweis zuerst weg.
- Rollen lassen sich nicht verschachteln.

![Eine Rolle mit ihren Benutzern](bilder/rolle.png)

!!! info "Rollen und Rechte"
    Rollen geben von sich aus keine Rechte; die Werkbank öffnet nur das [Verwaltungsrecht](verwalten.md) an der Person. Was eine Rolle in der Ablage darf, legst du in den [Berechtigungen](berechtigungen.md) fest, etwa „Rolle *Buchhaltung* darf alle Rechnungen lesen und bearbeiten“.

## Systemkonten

Über der Liste der Benutzer stehen die **Systemkonten**: Konten, unter denen Ablago selbst und Pakete mit Code arbeiten. Sie sind sichtbar, damit klar ist, wer im Protokoll und in der Historie steht – benutzen kann sie niemand.

Die Gruppe ist **eingeklappt**, damit sie die Liste der Menschen nicht zustellt. Ihre Kopfzeile nennt Anzahl und Zusammensetzung, z. B. **Systemkonten (5)** · 4 Pakete · 1 Automatisierung. Ein Klick klappt sie auf; ob sie offen ist, merkt sich die Werkbank für dich. Auffälliges siehst du auch eingeklappt in der Kopfzeile:

- **… mit Fehler** (rot): ein Konto ist deaktiviert, obwohl es gebraucht wird, oder eine seiner Automatisierungen ist angehalten. Das Konto eines entfernten Pakets zählt nicht dazu – es bleibt nur für die Historie.
- **… mit weitreichenden Rechten** (gelb): ein Paket darf alle Mappentypen ändern, oder es darf alle lesen und dazu ins Internet. Prüfe beim [Paket](pakete.md), ob du das so willst.

Aufgeklappt trägt jedes betroffene Konto dasselbe Kennzeichen; in seinen Angaben rechts steht, was los ist. Dieselbe Gruppe steht im [Testlauf am Mappentyp](berechtigungen.md#systemkonten-und-pakete), wenn du dort ein Systemkonto prüfen willst.

- **Automatisierung** (Systemrolle *Systemkonto*): Unter diesem Konto laufen Automatisierungen. In der Historie steht dann „Automatisierung“ statt der Person, die sie eingerichtet hat – und sie laufen weiter, wenn diese Person geht oder deaktiviert wird. Systemkonten bekommen nie ein Verwaltungsrecht.
- **Paket …** (Systemrolle *Paket*): je Paket mit Code ein Dienstkonto. Es darf nur, was du bei der Installation des Pakets bestätigt hast. Wird das Paket entfernt, bleibt das Konto für die Historie stehen.
- **Nicht benutzbar:** kein Passwort, keine Anmeldung, keine Sitzung, kein API-Schlüssel, kein „Als Benutzer anmelden“. Systemkonten stehen in keiner Auswahl (Für, Vertreter, Empfänger, Verweise auf Benutzer), zählen nicht als Benutzer und lassen sich weder deaktivieren noch löschen.
- **Ohne Benutzer-Mappe:** Sie erscheinen nicht in der Ablage unter *Benutzer*.

### Systemrollen *Systemkonto* und *Paket*

Neben *Mitglied* gibt es zwei weitere Systemrollen als Rollen-Mappen: **Systemkonto** und **Paket**. Du vergibst sie nie an Menschen; sie stehen nur in den [Regeln am Mappentyp](berechtigungen.md#systemkonten-und-pakete) zur Wahl.

- **Ohne eigene Regeln** bleibt alles wie bisher: Das Systemkonto darf an Mappen alles außer Passwörter sehen, ein Paket genau das, was bei seiner Installation bestätigt wurde.
- **Mit Regeln** schränkst du das ein, z. B. „Wenn Benutzer hat Rolle *Systemkonto* → alle Rechte entziehen“ am Mappentyp *Gesundheit*: Keine Automatisierung liest oder ändert dann Gesundheitsmappen.
- Für diese beiden Rollen gilt nur, was eine Regel mit ihrer Rolle sagt – der **Standard** des Mappentyps (der für Mitglieder gilt) wirkt für sie nicht. Eine Regel kann einem Paket nie mehr geben, als bei der Installation bestätigt wurde.
- **Werkbank:** Das Systemkonto darf Ablago nicht verwalten. Benutzer und Rechte verwalten, Wiederherstellen, Papierkorb leeren, Notfallblatt und Angaben zur Sicherung bleiben ihm verschlossen.

## Verantwortliche: Felder auf Benutzer und Rollen

Für „wer kümmert sich?“ legst du an einem Mappentyp ein Feld der Feldart **Verweis** an:

- „Verantwortlicher Benutzer“ → Ziel-Mappentyp *Benutzer*
- „Verantwortliche Rolle“ → Ziel-Mappentyp *Rolle*

Benutzer und Rolle sind dabei getrennte Felder. Siehe [Verweise](mappentypen.md#verweise-mappen-verbinden).
