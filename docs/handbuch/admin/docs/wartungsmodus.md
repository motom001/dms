# Wartungsmodus

Vor einem Update oder einer Wiederherstellung soll niemand gleichzeitig arbeiten – sonst gehen Änderungen verloren. Der Wartungsmodus unter **Werkbank → Wartungsmodus** sorgt dafür in zwei Stufen.

--8<-- "ausgeblendet-organisation.md"

Auch ohne Eintrag in der Leiste erreichst du ihn über den Knopf **Zum Wartungsmodus** auf der Seite [Wiederherstellen](wiederherstellen.md) und über die Hinweise der Übersicht.

![Wartungsmodus in der Werkbank](bilder/werkbank-wartungsmodus.png)

Links in der Leiste steht neben dem Wartungsmodus **angekündigt**, solange er noch nicht wirkt, und **an**, sobald er aktiv ist.

## Einschalten

1. Optional einen **Text für alle** eintragen, z. B. „Update auf die neue Version“.
2. Den **Beginn** wählen – vorbelegt ist *jetzt + 30 Minuten*; mit **+15 min**, **+30 min** und **+1 Std** stellst du ihn schnell ab jetzt. Zu diesem Zeitpunkt werden alle anderen abgemeldet. Er darf nicht in der Vergangenheit und höchstens 24 Stunden in der Zukunft liegen, denn schon ab der Ankündigung können sich nur noch Administratoren anmelden.
3. Optional das **erwartete Ende** – es muss nach dem Beginn liegen.
4. **Wartung ankündigen**.

Unter den Feldern fasst ein Satz die Wirkung zusammen, z. B. „Ab jetzt sehen alle einen Hinweis mit Countdown; anmelden können sich nur noch Administratoren. Um 12:45 Uhr werden alle anderen abgemeldet. Ende voraussichtlich 13:45 Uhr.“

## Jetzt sofort sperren

Für Notfälle, z. B. einen **Sicherheitsvorfall** (ein Passwort oder Gerät ist in falsche Hände geraten, du siehst unbekannte Anmeldungen): Der rote Knopf **Jetzt sofort sperren** überspringt die Ankündigung. Nach einer Rückfrage

- werden alle anderen Sitzungen sofort beendet, auch die anderer Administratoren,
- antwortet die Schnittstelle mit **503**,
- bleibst du selbst angemeldet.

Text für alle und erwartetes Ende werden übernommen, wenn du sie ausgefüllt hast; nötig sind sie nicht. Im [Protokoll](fehlersuche.md#protokoll) steht „Wartungsmodus sofort gesperrt“, unter **Stand** „sofort gesperrt“ – so unterscheidest du es von einer angekündigten Wartung.

Danach in Ruhe aufräumen, z. B. betroffene Passwörter ändern, unter **Werkbank → Benutzer** einen Zugang sperren, die Zwei-Faktor-Anmeldung vorschreiben oder den [Schlüssel wechseln](verschluesselung.md#schlussel-wechseln) – und dann **Wartung beenden**.

## Stufe 1: angekündigt

- Alle Angemeldeten sehen sofort – ohne die Seite neu zu laden – ein Banner mit Countdown: „Wartung – du wirst in 29 Minuten abgemeldet. Bitte speichere deine Arbeit.“
- Speichern geht bis zum Schluss.
- Neu anmelden können sich nur noch Administratoren; die Anmeldeseite zeigt den Hinweis.

![Banner bei einem Mitglied](bilder/wartung-banner.png)

## Stufe 2: aktiv

Zum gewählten Beginn – oder sofort mit **Alle jetzt abmelden** bzw. [Jetzt sofort sperren](#jetzt-sofort-sperren):

- Alle Sitzungen außer deiner enden, auch die anderer Administratoren (sie können sich wieder anmelden).
- Die Anmeldeseite zeigt den Wartungshinweis mit Text und erwartetem Ende; anmelden können sich nur Administratoren.
- Die [Schnittstelle](api.md) (`/api/v1`) antwortet mit **503** und `Retry-After` (Sekunden bis zum erwarteten Ende, sonst 15 Minuten) – Skripte sollten es später noch einmal versuchen.
- Die Hintergrundarbeiten pausieren:
    - Texterkennung,
    - Fristen und Erinnerungen und die tägliche Zusammenfassung der Aufgaben,
    - das Aufräumen des Papierkorbs,
    - die geplante [Sicherung](sicherung.md) und die Probe-Wiederherstellung,
    - der Abruf der [Postfächer](postfaecher.md) und des [Eingangsordners](eingangsordner.md).

Unter **Angemeldete Sitzungen** siehst du, wer gerade mit welchem Gerät angemeldet ist und wann zuletzt aktiv.

## Ausschalten

**Wartung beenden** schaltet den Modus aus; alle können sich wieder anmelden, und die Hintergrundarbeiten laufen weiter. Der Modus überdauert einen Neustart des DMS – nach einem Update ist er also noch an, bis du ihn beendest.

!!! note "Automatisch bei vollem Speicher"
    Erreicht der freie Platz die eingestellte Grenze, schaltet das DMS den Wartungsmodus selbst ein – mit 5 Minuten Vorlauf und dem Text „Speicherplatzlimit erreicht“. Beenden musst du ihn selbst, sobald wieder Platz ist (siehe [Speicherplatz](speicherplatz.md#im-ernstfall)).

Ein, Aus und das Abmelden stehen im [Protokoll](fehlersuche.md#protokoll) (Modul *system*).

!!! tip "Vor jedem Update"
    Unter **Werkbank → Sicherung** mit **Jetzt sichern** eine Sicherung anlegen. Dann Wartung ankündigen, ab dem Beginn das Image aktualisieren (siehe [Aktualisieren](aktualisieren.md)), kurz prüfen, dann **Wartung beenden**.
