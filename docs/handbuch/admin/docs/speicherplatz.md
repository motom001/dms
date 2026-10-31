# Speicherplatz

Läuft die Platte voll, können beim Speichern oder Hochladen Daten verloren gehen. Das DMS misst deshalb selbst, wie viel Platz frei ist, warnt rechtzeitig und hält sich an der Grenze selbst an: **Werkbank → Speicherplatz** (Gruppe *Einstellungen*).

--8<-- "ausgeblendet-schritt.md"

![Werkbank → Speicherplatz](bilder/werkbank-speicherplatz.png)

## Was gemessen wird

Gemessen werden die drei festen Ordner im Container (siehe [Ordner und Volumes](installation.md#ordner-und-volumes)) – jede Minute und zusätzlich vor jedem Hochladen:

| Ordner | Inhalt |
| --- | --- |
| `/data/files` | Dokumente, Logos, Bilder gemeldeter Fehler |
| `/data/geheim` | Schlüssel und Notfallzugang |
| `/data/sicherung` | Sicherungen |

Je Ordner zeigt die Seite belegt, frei und die Größe des Datenträgers, als Balken mit Marken für Warnschwelle und Grenze. Liegen mehrere Ordner auf demselben Datenträger, steht das dabei. **Werkbank → Technik** zeigt dieselben Zahlen in der Übersicht für den Support.

!!! note "Die Datenbank wird nicht gemessen"
    Bei zwei Containern läuft PostgreSQL in einem eigenen Container; sein Volume kann das DMS nicht sehen. Bei [dms-komplett](https://motom001.github.io/dms/installieren/aktuell/komplett/) liegt die Datenbank im vierten Ordner `/data/postgres` – auch den misst das DMS nicht. Liegen alle Ordner auf derselben Platte des NAS (der übliche Fall), reicht die Messung trotzdem. Liegt die Datenbank auf einer anderen Platte, behalte deren Platz in der Speicherverwaltung des NAS im Blick.

## Warnschwelle und Grenze

Beide stellst du in **GB frei** oder **% frei** ein; Prozent beziehen sich auf die Größe des jeweiligen Datenträgers. Sie gelten für jeden Ordner einzeln.

| Stufe | Standard | Was passiert |
| --- | --- | --- |
| **Warnschwelle** | unter 10 % frei | Hinweis in der [Übersicht](uebersicht.md) und auf dieser Seite, **eine Mail** an alle Administratoren (einmal je Unterschreiten – erst wenn wieder genug frei war, gibt es beim nächsten Mal eine neue). Alle arbeiten normal weiter. |
| **Grenze** | unter 2 GB frei | **Hochladen sofort gesperrt** (neue Dokumente, Logos); Werte speichern geht noch. Mail an alle Administratoren, und der [Wartungsmodus](wartungsmodus.md) startet mit **5 Minuten Vorlauf** und dem Text **„Speicherplatzlimit erreicht“**. |

Die Warnschwelle muss mehr freien Platz verlangen als die Grenze – sonst käme die Warnung erst danach.

## Im Ernstfall

1. Die Mail „Speicherplatzlimit erreicht“ kommt; nach 5 Minuten sind alle außer den Administratoren abgemeldet.
2. Als Administrator bleibst du in der Werkbank handlungsfähig und schaffst Platz:
    - alte Sicherungen unter **Werkbank → [Sicherung](sicherung.md)** löschen oder die Aufbewahrung verringern,
    - den **[Papierkorb](papierkorb.md)** leeren bzw. die Aufbewahrung verkürzen,
    - auf dem NAS andere Daten aufräumen oder das Volume vergrößern.
3. **Neu messen**. Reicht der Platz wieder, zeigen diese Seite und die Übersicht: „Wieder … frei – Wartung beenden?“
4. **Wartung beenden** – der Modus endet **nicht von selbst**, damit das DMS an der Grenze nicht hin- und herspringt.

Beendest du die Wartung, obwohl die Grenze noch unterschritten ist, startet sie nicht erneut von selbst; das Hochladen bleibt aber gesperrt, bis wieder genug Platz frei ist. Läuft gerade eine Wartung, die du selbst eingeschaltet hast, lässt das DMS sie unverändert.

Alle Übergänge – Warnschwelle unterschritten, Grenze erreicht, wieder genug Platz – stehen im [Protokoll](fehlersuche.md#protokoll) (Modul *system*).
