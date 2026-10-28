# Aufgaben

Eine **Aufgabe** sagt, dass an einer Mappe jemand etwas tun soll. Jede Mappe mit einer offenen Aufgabe steht im **Eingang** ihres Empfängers – der Eingang ist damit die Liste der eigenen Aufgaben. Wie Benutzer damit arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/zusammenarbeit/).

Aufgaben entstehen auf drei Wegen:

| Art | Entsteht | Empfänger | Erledigt |
| --- | --- | --- | --- |
| **Passt nicht** | wenn eine Mappe nach einer Änderung am [Mappentyp](mappentypen.md#wenn-sich-ein-mappentyp-andert) nicht mehr passt | wer die Mappe angelegt hat (sonst die Administratoren) | von selbst, sobald die Mappe wieder passt |
| **Erwähnung** | wenn jemand in einem formatierten Text mit **@** einen Benutzer erwähnt | der Erwähnte | per Knopf *Erledigt* |
| **Aufgabe** | von Hand über **Aufgabe vergeben** an der Mappe | ein gewählter Benutzer | per Knopf *Erledigt* |

- Empfänger sind immer **Benutzer**, keine Rollen – eine Aufgabe für alle bleibt sonst gern liegen.
- Wer sich selbst erwähnt, bekommt keine Aufgabe; erneutes Speichern erzeugt keine zweite. Wird eine Erwähnung wieder entfernt, bleibt die Aufgabe offen; im Protokoll der Mappe steht, dass sie entfernt wurde.
- **Weitergeben** dürfen der Empfänger selbst und Administratoren; das steht im Protokoll der Mappe.

## Werkbank → Aufgaben

![Werkbank → Aufgaben](bilder/werkbank-aufgaben.png)

Links stehen alle offenen Aufgaben aller Benutzer mit Mappe, Art, Datum und Empfänger. Über die Auswahl darunter gibst du eine Aufgabe an jemand anderen weiter. **Erledigte zeigen** schaltet auf die zuletzt erledigten Aufgaben um.

## Tägliche Zusammenfassung

Statt bei jeder neuen Aufgabe eine E-Mail zu schicken, verschickt das DMS **einmal am Tag** eine Übersicht an jeden, der offene Aufgaben hat – mit Links zu den Mappen.

- Rechts stellst du ein, ob und um welche **Uhrzeit** (deutsche Zeit) sie verschickt wird. Standard: an, 7:00 Uhr.
- **Jetzt senden** verschickt sie sofort, z. B. zum Ausprobieren.
- Jeder Benutzer kann sie in seinem **Profil** abbestellen.
- Voraussetzung ist der eingerichtete [E-Mail-Versand](installation.md#e-mail-und-adresse).
