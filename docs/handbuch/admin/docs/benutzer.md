# Benutzer und Rollen

Unter **Werkbank → Benutzer** legst du fest, wer sich anmelden darf und mit welcher Rolle. Die Liste zeigt die Benutzer mit ihrem Stand (*aktiv*, *eingeladen*), wer gerade aktiv ist und wer abwesend ist. Deaktivierte blendet sie aus; **Deaktivierte zeigen** holt sie (grau, am Ende) dazu – die Wahl merkt sich die Werkbank.

![Ein Benutzer in der Werkbank](bilder/werkbank-benutzer.png)

## Benutzer einladen

1. **+ Neu**
2. E-Mail-Adresse, Name und **Systemrolle** (*Administrator* oder *Mitglied*) eintragen, bei Bedarf **Rollen** anhaken.
3. **Benutzer anlegen und einladen** – ohne E-Mail-Versand heißt der Knopf **Benutzer anlegen**. **Entwurf verwerfen** bricht ab.

![Neuen Benutzer anlegen](bilder/werkbank-benutzer-neu.png)

Ist E-Mail-Versand eingerichtet, bekommt der Benutzer eine Einladung. Sonst zeigt das DMS den Einladungslink zum Kopieren – schick ihn auf einem sicheren Weg weiter. Der Link ist 7 Tage gültig und funktioniert einmal. **Einladung erneut senden** macht den alten Link ungültig.

## Passwort vergessen

Mit E-Mail-Versand fordern Benutzer den Link selbst an. Ohne E-Mail-Versand erzeugst du ihn beim Benutzer mit **Passwort-Link erzeugen** und gibst ihn weiter. Ein Passwort-Link ist eine Stunde gültig; das bisherige Passwort gilt, bis ein neues gesetzt ist.

## Ändern, deaktivieren, löschen

- **Name** und **Systemrolle** änderst du direkt beim Benutzer. Die E-Mail-Adresse ändert jeder Benutzer selbst im Profil (mit seinem Passwort).
    - Ist unter [Anmeldung über einen Anbieter](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) eine **Gruppe für Administratoren** gesetzt, überschreibt jede Anmeldung über den Anbieter die Systemrolle: Wer in der Gruppe ist, wird Administrator, alle anderen Mitglied. Eine Änderung hier gilt dann nur bis zur nächsten Anmeldung über den Anbieter.
- <span id="abwesenheit"></span>**Abwesenheit** – wie im Profil des Benutzers (siehe [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/profil/#abwesenheit)): an/aus, von, bis, Vertreter. Du kannst sie für andere eintragen, etwa bei Krankheit, und mit **Alle offenen Aufgaben an ‹Vertreter› geben** seine Aufgaben abgeben. Das steht in der Historie seiner Benutzer-Mappe.
- <span id="zugang-sperren"></span>**Zugang sperren** (ganz unten) – **Benutzer deaktivieren** sperrt den Zugang sofort und beendet alle Sitzungen, nach einer Rückfrage. Die Mappe bleibt erhalten und heißt „… (ehemalig)“; alle Verweise auf ihn (z. B. als Verantwortlicher) bleiben gültig.
    - Das geht nur, wenn ein **Vertreter** hinterlegt ist und der Benutzer **keine offenen Aufgaben** mehr hat. Fehlt etwas, nennt der Abschnitt den Grund; Vertreter wählen und Aufgaben abgeben geht direkt darüber unter *Abwesenheit*.
    - Der Vertreter bleibt hinterlegt und wirkt **dauerhaft**: Was noch für den Deaktivierten entsteht (z. B. „passt nicht“ an Mappen, die er angelegt hat, oder eine Erwähnung in einem alten Text), bekommt der Vertreter.
    - **Benutzer aktivieren** macht es rückgängig; der Abschnitt zeigt dann, seit wann er deaktiviert ist.
- **Einladung löschen** geht nur, solange die Einladung nie angenommen wurde – etwa bei einer vertippten Adresse. Wer sich schon angemeldet hat, wird deaktiviert statt gelöscht, damit „angelegt von“ und Verweise erhalten bleiben.
    - Ist der [Papierkorb](papierkorb.md) eingeschaltet, wandert die Benutzer-Mappe in den Papierkorb, und der Benutzer ist bis dahin deaktiviert. Erst beim endgültigen Löschen aus dem Papierkorb verschwindet das Konto. Holst du die Mappe zurück, ist der Benutzer wieder aktiv.

Es muss immer mindestens einen aktiven Administrator geben; du kannst dich auch nicht selbst deaktivieren.

!!! warning "Notfallzugang"
    Ein über den [Notfallzugang](notfall.md) angelegter Administrator steht in der Liste als **„Notfall-Admin ‹Datum›“**. Die Übersicht der Werkbank zeigt einen roten Hinweis, bis du ihn umbenannt oder deaktiviert hast. Warst du das nicht, deaktiviere ihn sofort.

!!! warning "Administratoren arbeiten nicht in der Ablage"
    Ein Administrator richtet das DMS ein. Für die tägliche Arbeit nimmt jeder – auch du selbst – einen normalen Benutzer. Öffnet ein Administrator die Ablage, steht oben ein roter Hinweis; er sieht dort alle Mappen. Administratoren bekommen auch keine [API-Schlüssel](api.md#api-schlussel).

![Hinweis für Administratoren in der Ablage](bilder/admin-hinweis.png)

## Sitzungen

Beim Benutzer steht, auf welchen Geräten er angemeldet ist – mit Gerät, Browser und letzter Aktivität. Einzelne Sitzungen beendest du mit **Abmelden**, etwa wenn ein Gerät verloren ging. Ist er auf mehreren Geräten angemeldet, beendet **Überall abmelden** alle Sitzungen auf einmal.

Darüber steht, ob er die [Zwei-Faktor-Anmeldung](anmeldeschutz.md#zwei-faktor-anmeldung) eingerichtet hat. **Zurücksetzen** entfernt sie, z. B. nach einem verlorenen Handy.

## Was sieht ein Benutzer?

Mit **Anzeigen** unter *Was sieht ein Benutzer?* siehst du je Mappentyp, wie viele Mappen der Benutzer nach den gespeicherten [Berechtigungen](berechtigungen.md) lesen darf, mit einigen Beispielen. Für einen Administrator gilt: alles. Willst du wissen, *warum* er eine bestimmte Mappe sieht oder nicht, nutze den [Testlauf](berechtigungen.md#testlauf) am Mappentyp.

## Fehler nachstellen

Meldet ein Benutzer einen Fehler, kannst du dich mit **Als … anmelden** als dieser Benutzer anmelden und siehst das DMS genau so wie er – mit seinen Rechten. Oben steht die ganze Zeit ein gelber Warnhinweis mit **Zurück zum eigenen Konto** – auf jeder Seite, auch am Handy. Das ist der einzige Weg zurück; im Menü unter dem Namen steht dafür kein Eintrag, damit du die Vertretung nicht aus Versehen beendest. Der Menüeintrag zum Konto heißt in dieser Zeit **Konto von …** und zeigt das Konto des Benutzers, nicht deins.

![Als Ben angemeldet: gelber Warnhinweis oben, im Menü „Konto von Ben Beispiel“](bilder/vertretung.png)

Der Benutzer sieht bei seiner nächsten Anmeldung, wer wann in seinem Namen gearbeitet hat. Alles, was du in dieser Zeit tust, geschieht unter seinem Konto.

## Benutzer als Mappen

Jeder Benutzer hat eine Mappe des [Systemmappentyps](mappentypen.md#systemmappentypen-benutzer-rolle-und-post) *Benutzer*, mit derselben Id wie sein Konto. So kann ein Mappentyp ein Feld wie „Verantwortlich“ bekommen, das auf einen Benutzer verweist.

![Benutzer-Mappe in der Ablage](bilder/benutzer-mappe.png)

- **Das Konto ist führend.** Name, E-Mail-Adresse, Rollen und „aktiv“ übernimmt die Mappe automatisch aus dem Konto – beim Anlegen, bei jeder Änderung und bei jedem Start des DMS.
- **Abwesenheit** steht in den Systemfeldern *Abwesend* (wirkt gerade), *Abwesend von*, *Abwesend bis* und *Vertreter*. Damit lassen sich Ansichten wie „Abwesende Benutzer“ bauen, und ein Verknüpfungsregister mit der Quelle *Benutzer › Vertreter* zeigt, wen jemand vertritt. Hattest du schon eigene Felder mit diesen Kennungen, wurden sie beim Update umbenannt (z. B. `vertreter_alt`) – samt Werten.
- **Diese Systemfelder sind in der Ablage nur lesbar.** Der Server lehnt Änderungen daran ab, auch über die Schnittstelle. Sonst könnte ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto über „Passwort vergessen“ übernehmen – oder sich selbst zum Administrator machen.
- **Eigene Felder** (z. B. Telefon) kannst du am Mappentyp ergänzen; die sind in der Ablage normal bearbeitbar.
- Benutzer-Mappen lassen sich in der Ablage weder anlegen noch löschen.

## Rollen

Neben der **Systemrolle** (*Administrator* oder *Mitglied*) kann ein Benutzer beliebig viele **Rollen** haben – fachliche Zuständigkeiten wie „Steuern und Finanzen“.

- **Rollen anlegen, umbenennen, löschen** geschieht in der Ablage in der Ansicht *Rolle* – wer das darf, regeln die [Berechtigungen](berechtigungen.md) am Mappentyp *Rolle* (ohne Regeln: jeder Benutzer). Rollennamen sind eindeutig.
- **Zuordnen** geht nur hier in der Benutzerverwaltung (Haken bei *Rollen*). Die Mappe einer Rolle zeigt im Register *Benutzer*, wer sie hat.
- **Administrator** und **Mitglied** sind **Systemrollen**: Sie erscheinen ebenfalls als Rollen-Mappen, folgen aber der Systemrolle des Benutzers und lassen sich weder umbenennen noch löschen.
- **Rolle löschen**, die Benutzer haben: erlaubt – die Zuordnung fällt weg. Verweist noch ein Feld auf die Rolle (z. B. „verantwortliche Rolle“), muss dieser Verweis zuerst weg.
- Rollen lassen sich nicht verschachteln.

![Eine Rolle mit ihren Benutzern](bilder/rolle.png)

!!! info "Rollen und Rechte"
    Rollen geben von sich aus keine Rechte – außer der Systemrolle *Administrator*, die die Werkbank freischaltet. Was eine Rolle in der Ablage darf, legst du in den [Berechtigungen](berechtigungen.md) fest, etwa „Rolle *Buchhaltung* darf alle Rechnungen lesen und bearbeiten“.

## Verantwortliche: Felder auf Benutzer und Rollen

Für „wer kümmert sich?“ legst du an einem Mappentyp ein Feld der Feldart **Verweis** an:

- „Verantwortlicher Benutzer“ → Ziel-Mappentyp *Benutzer*
- „Verantwortliche Rolle“ → Ziel-Mappentyp *Rolle*

Benutzer und Rolle sind dabei getrennte Felder. Siehe [Verweise](mappentypen.md#verweise-mappen-verbinden).
