# Benutzer und Rollen

Unter **Werkbank → Benutzer** legst du fest, wer sich anmelden darf und mit welcher Rolle. Die Liste zeigt alle Benutzer mit ihrem Stand (*aktiv*, *eingeladen*, *deaktiviert*) und wer gerade aktiv ist.

![Ein Benutzer in der Werkbank](bilder/werkbank-benutzer.png)

## Benutzer einladen

1. **+ Neu**
2. E-Mail-Adresse, Name und **Rolle** (*Administrator* oder *Mitglied*) eintragen, bei Bedarf **weitere Rollen** anhaken.
3. **Anlegen und einladen**.

![Neuen Benutzer anlegen](bilder/werkbank-benutzer-neu.png)

Ist E-Mail-Versand eingerichtet, bekommt der Benutzer eine Einladung. Sonst zeigt das DMS den Einladungslink zum Kopieren – schick ihn auf einem sicheren Weg weiter. Der Link ist 7 Tage gültig und funktioniert einmal. **Einladung erneut senden** macht den alten Link ungültig.

## Passwort vergessen

Mit E-Mail-Versand fordern Benutzer den Link selbst an. Ohne E-Mail-Versand erzeugst du ihn beim Benutzer mit **Passwort-Link erzeugen** und gibst ihn weiter. Ein Passwort-Link ist eine Stunde gültig; das bisherige Passwort gilt, bis ein neues gesetzt ist.

## Ändern, deaktivieren, löschen

- **Name** und **Rolle** änderst du direkt beim Benutzer. Die E-Mail-Adresse ändert jeder Benutzer selbst im Profil (mit seinem Passwort).
- **Deaktivieren** sperrt den Zugang sofort und beendet alle Sitzungen. Seine Mappe bleibt erhalten und heißt „… (ehemalig)“; alle Verweise auf ihn (z. B. als Verantwortlicher) bleiben gültig. **Aktivieren** macht das rückgängig.
- **Löschen** geht nur, solange die Einladung nie angenommen wurde – etwa bei einer vertippten Adresse. Wer sich schon angemeldet hat, wird deaktiviert statt gelöscht, damit „angelegt von“ und Verweise erhalten bleiben.

Es muss immer mindestens einen aktiven Administrator geben; du kannst dich auch nicht selbst deaktivieren.

## Sitzungen

Beim Benutzer steht, auf welchen Geräten er angemeldet ist – mit Gerät, Browser und letzter Aktivität. Einzelne Sitzungen lassen sich beenden, etwa wenn ein Gerät verloren ging.

## Fehler nachstellen

Meldet ein Benutzer einen Fehler, kannst du dich mit **Als … anmelden** als dieser Benutzer anmelden und siehst das DMS genau so wie er – mit seinen Rechten. Oben steht die ganze Zeit ein Warnhinweis mit **Zurück zu meinem Konto**.

Der Benutzer sieht bei seiner nächsten Anmeldung, wer wann in seinem Namen gearbeitet hat. Alles, was du in dieser Zeit tust, geschieht unter seinem Konto.

## Benutzer als Mappen

Jeder Benutzer hat eine Mappe des [Systemmappentyps](mappentypen.md#systemmappentypen-benutzer-und-rolle) *Benutzer*, mit derselben Id wie sein Konto. So kann ein Mappentyp ein Feld wie „Verantwortlich“ bekommen, das auf einen Benutzer verweist.

![Benutzer-Mappe in der Ablage](bilder/benutzer-mappe.png)

- **Das Konto ist führend.** Name, E-Mail-Adresse, Rollen und „aktiv“ übernimmt die Mappe automatisch aus dem Konto – beim Anlegen, bei jeder Änderung und bei jedem Start des DMS.
- **Diese Systemfelder sind in der Ablage nur lesbar.** Der Server lehnt Änderungen daran ab, auch über die Schnittstelle. Sonst könnte ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto über „Passwort vergessen“ übernehmen – oder sich selbst zum Administrator machen.
- **Eigene Felder** (z. B. Telefon) kannst du am Mappentyp ergänzen; die sind in der Ablage normal bearbeitbar.
- Benutzer-Mappen lassen sich in der Ablage weder anlegen noch löschen.

## Rollen

Neben der **Rolle** des Zugangs (*Administrator* oder *Mitglied*) kann ein Benutzer beliebig viele **weitere Rollen** haben – fachliche Zuständigkeiten wie „Steuern und Finanzen“.

- **Rollen anlegen, umbenennen, löschen** geschieht in der Ablage in der Sicht *Rolle* – vorerst darf das jeder Benutzer. Rollennamen sind eindeutig.
- **Zuordnen** geht nur hier in der Benutzerverwaltung (Haken bei *Weitere Rollen*). Die Mappe einer Rolle zeigt im Register *Benutzer*, wer sie hat.
- **Administrator** und **Mitglied** sind **Systemrollen**: Sie erscheinen ebenfalls als Rollen-Mappen, folgen aber der Rolle des Zugangs und lassen sich weder umbenennen noch löschen.
- **Rolle löschen**, die Benutzer haben: erlaubt – die Zuordnung fällt weg. Verweist noch ein Feld auf die Rolle (z. B. „verantwortliche Rolle“), muss dieser Verweis zuerst weg.
- Rollen lassen sich nicht verschachteln.

![Eine Rolle mit ihren Benutzern](bilder/rolle.png)

!!! info "Rollen und Rechte"
    Rollen geben derzeit keine zusätzlichen Rechte – außer der Systemrolle *Administrator*, die die Werkbank freischaltet. Die geplante Berechtigungsverwaltung wird Rechte an genau diese Rollen hängen.

## Verantwortliche: Felder auf Benutzer und Rollen

Für „wer kümmert sich?“ legst du an einem Mappentyp ein Feld vom Typ **Referenz** an:

- „Verantwortlicher Benutzer“ → Ziel-Mappentyp *Benutzer*
- „Verantwortliche Rolle“ → Ziel-Mappentyp *Rolle*

Benutzer und Rolle sind dabei getrennte Felder. Siehe [Referenzen](mappentypen.md#referenzen-mappen-verbinden).
