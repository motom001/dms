# Wartungsmodus

Vor einem Update oder einer Wiederherstellung soll niemand gleichzeitig arbeiten – sonst gehen Änderungen verloren. Der Wartungsmodus unter **Werkbank → Wartungsmodus** sorgt dafür in zwei Stufen.

--8<-- "ausgeblendet-organisation.md"

Auch ohne Eintrag in der Leiste erreichst du ihn über den Knopf **Zum Wartungsmodus** auf der Seite [Wiederherstellen](wiederherstellen.md) und über die Hinweise der Übersicht.

![Wartungsmodus in der Werkbank](bilder/werkbank-wartungsmodus.png)

## Einschalten

1. Optional einen **Text für alle** eintragen, z. B. „Update auf die neue Version“, und das **erwartete Ende**.
2. Die **Vorlaufzeit** wählen (Standard 30 Minuten; 0 = sofort).
3. **Wartung ankündigen**.

## Stufe 1: angekündigt

- Alle Angemeldeten sehen sofort – ohne die Seite neu zu laden – ein Banner mit Countdown: „Wartung – du wirst in 29 Minuten abgemeldet. Bitte speichere deine Arbeit.“
- Speichern geht bis zum Schluss.
- Neu anmelden können sich nur noch Administratoren; die Anmeldeseite zeigt den Hinweis.

![Banner bei einem Mitglied](bilder/wartung-banner.png)

## Stufe 2: aktiv

Nach Ablauf der Vorlaufzeit – oder sofort mit **Alle jetzt abmelden**:

- Alle Sitzungen außer deiner enden, auch die anderer Administratoren (sie können sich wieder anmelden).
- Die Anmeldeseite zeigt den Wartungshinweis mit Text und erwartetem Ende; anmelden können sich nur Administratoren.
- Die [Schnittstelle](api.md) (`/api/v1`) antwortet mit **503** und `Retry-After` (Sekunden bis zum erwarteten Ende, sonst 15 Minuten) – Skripte sollten es später noch einmal versuchen.
- Texterkennung, tägliche Zusammenfassung der Aufgaben und das Aufräumen des Papierkorbs pausieren.

Unter **Angemeldete Sitzungen** siehst du, wer gerade mit welchem Gerät angemeldet ist und wann zuletzt aktiv.

## Ausschalten

**Wartung beenden** schaltet den Modus aus; alle können sich wieder anmelden, und die Hintergrundarbeiten laufen weiter. Der Modus überdauert einen Neustart des DMS – nach einem Update ist er also noch an, bis du ihn beendest.

!!! note "Automatisch bei vollem Speicher"
    Erreicht der freie Platz die eingestellte Grenze, schaltet das DMS den Wartungsmodus selbst ein – mit 5 Minuten Vorlauf und dem Text „Speicherplatzlimit erreicht“. Beenden musst du ihn selbst, sobald wieder Platz ist (siehe [Speicherplatz](speicherplatz.md#im-ernstfall)).

Ein, Aus und das Abmelden stehen im [Protokoll](fehlersuche.md#protokoll) (Modul *system*).

!!! tip "Vor jedem Update"
    Wartung ankündigen, nach der Vorlaufzeit das Image aktualisieren (siehe [Aktualisieren](aktualisieren.md)), kurz prüfen, dann **Wartung beenden**.
