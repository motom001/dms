# Sichern mit Snapshots { #sichern-mit-snapshots }

Sicherst du Server und Speicher ohnehin per **Snapshot** (z. B. Btrfs- oder ZFS-Snapshots auf dem NAS, Snapshots einer virtuellen Maschine, Sicherungssoftware mit Abbildern), kann Ablago darin mitlaufen. Diese Seite sagt, was dabei zusammengehört, worauf du beim Schutz achten musst und wie du eine Wiederherstellung übst.

Der einfachere Weg bleibt die [Sicherung von Ablago](sicherung.md): verschlüsselt, unabhängig von der Version von PostgreSQL und wöchentlich [probeweise eingespielt](wiederherstellen.md#probe-wiederherstellung). Ein Snapshot ergänzt sie, er ersetzt sie nicht zwingend – siehe [Snapshot oder Sicherung von Ablago?](#snapshot-oder-sicherung).

## Was zusammengehört { #was-zusammengehort }

Ablago besteht aus der **Datenbank** und dem Ordner **`files`** mit den Dokumenten. Die Datenbank verweist auf jede Datei; beide müssen deshalb **vom selben Zeitpunkt** stammen. Ein Snapshot der Datenbank von 2:00 Uhr und einer von `files` von 2:15 Uhr passt nicht zusammen: Dokumente, die dazwischen hochgeladen wurden, fehlen in der Datenbank, und gelöschte stehen dort noch, ohne Datei.

| Ordner im Container | Inhalt | Im Snapshot? |
| --- | --- | --- |
| Datenbank (Volume des PostgreSQL-Containers, bei `dms-komplett` `/data/postgres`) | Mappen, Werte, Historie, Einstellungen, Benutzer | **ja**, zusammen mit `files` |
| `/data/files` | Dokumente, umgewandelte Fassungen, Logos | **ja**, zusammen mit der Datenbank |
| `/data/geheim` | Schlüssel `dms.schluessel`, Anbindung an die Datenbank `datenbank.json` (mit Passwort) | bewusst entscheiden, siehe [Der Schlüssel](#der-schlussel) |
| `/data/sicherung` | die verschlüsselten Sicherungen von Ablago | kann mit, ist aber schon eine Sicherung |
| `/data/export` | Vollexporte und Auskünfte, unverschlüsselt, kurzlebig | nicht nötig |

So bekommst du beide zum selben Zeitpunkt:

- **Liegen Datenbank und `files` auf demselben Speicher** (z. B. beide Ordner unter `/volume1/docker/dms`, auch bei `dms-komplett`): **ein gemeinsamer Snapshot** dieses Speichers. Er hält alles im selben Moment fest; PostgreSQL startet daraus wie nach einem Stromausfall und bringt sich selbst in einen sauberen Stand.
- **Liegt die Datenbank auf einem eigenen Server:** dort die Sicherung von PostgreSQL selbst – ein **Basisbackup mit WAL-Archiv**, das sich auf einen Zeitpunkt zurückspielen lässt (*Point-in-Time-Recovery*) –, und einen Snapshot von `files`. Beim Zurückspielen die Datenbank auf den **Zeitpunkt des Snapshots von `files`** bringen.
- **Getrennte Snapshots ohne Point-in-Time-Recovery** nur im [Wartungsmodus](wartungsmodus.md) oder bei angehaltenem Container ziehen: Dann ändert sich zwischen den beiden nichts.

## Der Schlüssel { #der-schlussel }

Passwortfelder, Zugangsdaten von Postfächern und Sicherungszielen sind in der Datenbank mit dem Schlüssel von Ablago verschlüsselt (siehe [Verschlüsselung](verschluesselung.md)). **Ohne diesen Schlüssel ist ein Snapshot nicht vollständig wiederherstellbar:** Mappen und Dokumente sind da, gespeicherte Passwörter aber nicht mehr lesbar – Ablago meldet dann „Schlüssel für Zugangsdaten fehlt“.

Für den Ordner `/data/geheim` gibt es zwei Wege; entscheide dich bewusst:

1. **Ausnehmen** (empfohlen, wenn die Snapshots an einem weniger geschützten Ort landen): `geheim` ist nicht im Snapshot. Beim Zurückspielen legst du die Schlüsseldatei aus deiner Kopie bzw. vom [Notfallblatt](verschluesselung.md#notfallblatt) nach `geheim/` und schreibst `datenbank.json` neu (oder lässt sie vom Einrichtungsassistenten anlegen).
2. **Mitnehmen**: Der Snapshot ist dann vollständig – er enthält aber auch alle gespeicherten Zugangsdaten **in entschlüsselbarer Form** und das Passwort der Datenbank. Er braucht dann denselben Schutz wie der Server selbst.

Das [Notfallblatt](verschluesselung.md#notfallblatt) bewahrst du in beiden Fällen getrennt von den Snapshots auf.

## Schutz des Snapshots { #schutz }

**Ein Snapshot ist nicht verschlüsselt.** Die Sicherung von Ablago ist eine verschlüsselte Datei; Datenbank und `files` liegen dagegen im Klartext – und ein Snapshot davon auch. Er braucht denselben Schutz wie der Server: Zugriff nur für die, die auch den Server verwalten. In eine Cloud oder auf fremden Speicher nur mit **Verschlüsselung durch die Sicherungssoftware** (bei Synology *Hyper Backup* die clientseitige Verschlüsselung).

## Version { #version }

Ein Snapshot passt zu der **Version von Ablago**, mit der er entstand – und zur Hauptversion von PostgreSQL, die die Datenbank geschrieben hat. Beim Zurückspielen startest du **dieselbe Version** (das Image mit derselben Versionsnummer, siehe **Werkbank → Systemzustand → Version und Updates** bzw. das Protokoll) und aktualisierst danach wie gewohnt (siehe [Aktualisieren](aktualisieren.md)). Ein neueres Ablago bringt eine ältere Datenbank beim Start selbst auf seinen Stand; zurück geht das nicht.

## Zurückspielen und prüfen { #prufen }

Übe die Wiederherstellung regelmäßig auf einem **Testsystem** – nicht auf dem laufenden System:

1. **Testsystem ohne Netz nach draußen starten.** Sonst holt es echte Post aus den Postfächern ab, verschickt Erinnerungen und ruft Pakete auf. Starte den Container am besten in einem Docker-Netz ohne Internet (`internal: true`). War im Snapshot der [Wartungsmodus](wartungsmodus.md#nichts-geht-rein-oder-raus) an, bleibt das Testsystem von selbst ruhig: Er überdauert den Neustart, und solange er an ist, geht nichts rein oder raus – kein Postfach-Abruf, kein Eingangsordner, keine E-Mails, keine Webhooks, keine Aufrufe von Paketen, keine geplanten Automatisierungen. Sonst schalte ihn nach dem Anmelden ein. Ziehst du den Snapshot dafür eigens, schalte ihn vorher im echten System ein.
2. **`datenbank.json` anpassen**, wenn `geheim` im Snapshot war: Sie zeigt sonst auf die **echte Datenbank** – das Testsystem würde in die laufende Ablage schreiben. Datenbank (und Host) auf die zurückgespielte Kopie ändern.
3. **Dieselbe Version starten**, anmelden und prüfen:
    - Mappen und Dokumente öffnen, ein Dokument herunterladen;
    - ein Passwortfeld anzeigen – so siehst du, dass der Schlüssel passt (**Werkbank → Verschlüsselung** zeigt den Stand);
    - **Werkbank → Systemzustand** und **Werkbank → Übersicht** ohne Fehler.
4. **Altes kommt zurück.** Ein älterer Stand macht auch Widerrufenes wieder gültig: gelöschte API-Schlüssel, alte Passwörter, entfernte Personen, zurückgezogene Freigaben und angemeldete Sitzungen. Spielst du einen Snapshot auf dem **echten System** zurück:
    - alle Sitzungen beenden (`dms abmelden --alle`, siehe [Konsole](konsole.md)),
    - die API-Schlüssel und Benutzer durchsehen und widerrufene wieder sperren,
    - Rechteänderungen seit dem Snapshot nachziehen,
    - hat sich seitdem ein Passwort oder der Schlüssel geändert (Schlüsselwechsel), die neuere Fassung verwenden.

## Snapshot oder Sicherung von Ablago? { #snapshot-oder-sicherung }

| | Snapshot | [Sicherung von Ablago](sicherung.md) |
| --- | --- | --- |
| Verschlüsselt | nein (nur durch die Sicherungssoftware) | ja, mit dem Schlüssel von Ablago |
| Umzug auf andere Hardware oder PostgreSQL-Version | nur gleiche Hauptversion von PostgreSQL | ja, versionsunabhängig ([Wachsen und umziehen](wachsen.md)) |
| Wiederherstellung geprüft | von dir, auf einem Testsystem | wöchentlich automatisch ([Probe-Wiederherstellung](wiederherstellen.md#probe-wiederherstellung)) |
| Nachweis für die Verfahrensdokumentation | Protokoll der Sicherungssoftware | Metadaten mit Prüfsumme je Sicherung, Ampel in der Übersicht |
| Zeitpunkte | so oft wie die Snapshots | nach Zeitplan, z. B. täglich |
| Gut für | schnelles Zurückrollen des ganzen Servers | Umzug, Kopie außer Haus, Nachweis |

Beides zusammen ist ein gutes Gespann: Snapshots für das schnelle Zurückrollen, die Sicherung von Ablago als versionsunabhängige, verschlüsselte Kopie außer Haus.

## Für die Verfahrensdokumentation { #verfahrensdokumentation }

- Nenne, **was** im Snapshot ist (Datenbank, `files`, ob `geheim`), **wie oft** er entsteht und **wie lange** er aufbewahrt wird.
- **Löschen und Aufbewahrung:** Was in Ablago gelöscht wird (nach dem [Löschkonzept](loeschkonzept.md), bei einer Löschung nach DSGVO), bleibt in älteren Snapshots, bis sie ablaufen. Stimme die Aufbewahrung der Snapshots mit den Löschfristen ab und nenne sie dort.
- Halte fest, wann die Wiederherstellung zuletzt geübt wurde und mit welchem Ergebnis.
- Vorlage: [Verfahrensdokumentation](verfahrensdokumentation.md).
