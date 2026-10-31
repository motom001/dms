# Sicherung

Wie du eine Sicherung wieder einspielst und wie das DMS sie wöchentlich probeweise einspielt, steht unter [Wiederherstellen](wiederherstellen.md).

Unter **Werkbank → Sicherung** legt das DMS Sicherungen selbst an: die ganze Datenbank und alle Dateien zum **selben Zeitpunkt**, verschlüsselt, ohne dass jemand aufhören muss zu arbeiten.

![Sicherung in der Werkbank](bilder/werkbank-sicherung.png)

## Was eine Sicherung enthält

Jede Sicherung besteht aus zwei Dateien im Sicherungsordner, z. B.:

| Datei | Inhalt |
| --- | --- |
| `2026-10-29_0200-automatisch.dms-sicherung` | Datenbank und alle Dateien (Dokumente, Logos, Bilder gemeldeter Fehler), gepackt und **verschlüsselt** |
| `2026-10-29_0200-automatisch.json` | Metadaten, lesbar: Haushalts-Id (Feld `haushaltId`), Versionen (DMS, Datenbank-Stand, PostgreSQL, Node.js, Betriebssystem, Architektur), Art, Beginn und Dauer, Anzahl Mappen, Dokumente und Benutzer, Größen, Verschlüsselung mit Fingerabdruck des Schlüssels und die **SHA-256-Prüfsumme** der Sicherungsdatei |

- Verschlüsselt wird mit AES-256-GCM. Der Schlüssel dafür wird aus dem Schlüssel unter **Werkbank → [Verschlüsselung](verschluesselung.md)** abgeleitet – derselbe wie für Passwortfelder. **Ohne diesen Schlüssel ist eine Sicherung nicht lesbar.** Er steht nie in der Sicherung, nur in der Schlüsseldatei und auf dem [Notfallblatt](#notfallblatt).
- Angemeldete Sitzungen gehören nicht dazu: Nach einer Wiederherstellung meldet sich jeder neu an.
- Die **Vorschaubilder** der Dokumente gehören ebenfalls nicht dazu – sie entstehen nach einer Wiederherstellung von selbst neu.
- Die Datenbank liest das DMS selbst – unabhängig von der PostgreSQL-Version. Eine Sicherung taugt deshalb auch für den Wechsel auf eine neue Hauptversion von PostgreSQL.
- Ein **Prüfwort** (ein bekanntes Wort, verschlüsselt in der Datenbank) zeigt nach einer Wiederherstellung, ob der richtige Schlüssel greift.

Ohne Schlüssel lässt sich keine Sicherung anlegen; die Seite weist dann auf die Verschlüsselung hin.

## Jetzt sichern

**Jetzt sichern** startet eine Sicherung im Hintergrund, mit Fortschritt. Du kannst die Seite verlassen. Ist weniger Platz frei als der [Mindest-Speicherplatz](#zeitplan-und-aufbewahrung), beginnt keine Sicherung.

Die Liste zeigt alle Sicherungen im Ordner mit Zeitpunkt, Art, Größe und Inhalt. **Prüfen** rechnet die Prüfsumme der Datei nach und vergleicht sie mit der aus den Metadaten – „unverändert“ heißt: Die Datei ist so, wie das DMS sie geschrieben hat. **Löschen** entfernt beide Dateien.

Im Container geht das auch ohne Browser mit dem [Befehl `dms`](konsole.md#betrieb): `dms sicherung` listet die Sicherungen, `dms sicherung jetzt` startet eine, `dms sicherung pruefen <name>` prüft eine.

## Zeitplan und Aufbewahrung

![Zeitplan und Aufbewahrung](bilder/werkbank-sicherung-zeitplan.png)

- **Automatisch sichern** täglich oder wöchentlich zu einer Uhrzeit (z. B. täglich 02:00). War das DMS zu der Zeit aus, sichert es, sobald es wieder läuft – aber nur am selben Tag. Eine verpasste Sicherung vom Vortag holt es nicht nach; es sichert erst wieder zum nächsten geplanten Termin. Mehr als eine automatische Sicherung am Tag gibt es nie.
- Einschalten lässt sich der Zeitplan erst, wenn das **Notfallblatt** heruntergeladen ist – ohne den Schlüssel darauf wäre jede Sicherung wertlos.
- **Aufbewahrung** (Standard **7 tägliche / 4 wöchentliche / 12 monatliche**): Von den automatischen Sicherungen bleibt je Tag, je Woche und je Monat die neueste, so viele wie eingestellt; ältere entfernt das DMS nach jeder automatischen Sicherung. Von Hand angelegte Sicherungen bleiben, bis du sie löschst.
- **Mindest-Speicherplatz** (Standard 1 GB): Ist im Sicherungsordner weniger frei, beginnt keine Sicherung; das steht als Hinweis in der Werkbank und im Protokoll.
- Im aktiven [Wartungsmodus](wartungsmodus.md) pausiert die automatische Sicherung.

!!! note "Später"
    Sicherungen, die nur neue Dateien enthalten, sparen Platz, machen die Wiederherstellung aber zu einer Kette. Das kommt erst, wenn der Platz drückt.

## Speicherplatz

Die Seite zeigt, wie groß Dokumente und Datenbank heute sind, eine **Hochrechnung** für die gewählte Aufbewahrung (jede Sicherung ist vollständig; die Datenbank lässt sich gut packen, Dokumente kaum), wie viel die Sicherungen belegen und wie viel im Ordner frei ist. Wird es knapp – weniger frei als der Mindest-Speicherplatz oder als zwei weitere Sicherungen –, warnt sie. Unabhängig davon überwacht **Werkbank → [Speicherplatz](speicherplatz.md)** alle Ordner des DMS mit Warnschwelle und Grenze.

## Hinweise bei Problemen

Die Übersicht der Werkbank zeigt einen Hinweis, wenn

- die letzte Sicherung **fehlgeschlagen** ist,
- die letzte erfolgreiche **älter als 2 Tage** ist (oder es noch keine gibt),
- das Notfallblatt fehlt oder zu einem früheren Schlüssel gehört,
- der Sicherungsordner kein eigenes Volume ist oder auf derselben Platte liegt wie die Dokumente.

Schlägt eine Sicherung fehl, bekommen alle Administratoren eine E-Mail – auch ohne Zeitplan, etwa bei **Jetzt sichern**. Ist die letzte erfolgreiche Sicherung zu alt, kommt die E-Mail nur, wenn der Zeitplan an ist. Es kommt **eine** E-Mail je Vorfall (nicht stündlich) – sofern der [E-Mail-Versand](installation.md#e-mail-und-adresse) eingerichtet ist. Alles steht auch im [Protokoll](fehlersuche.md#protokoll), Modul *sicherung*.

## Speicherort

Der Sicherungsordner ist in den [Compose-Vorlagen](https://github.com/motom001/dms/tree/main/deploy) ein eigenes Volume – bei zwei Containern wie bei [dms-komplett](https://motom001.github.io/dms/installieren/aktuell/komplett/):

```yaml
volumes:
  - /volume1/docker/dms/sicherung:/data/sicherung
```

Liegt er auf derselben Platte wie Datenbank und Dokumente, nützt die Sicherung nichts, wenn diese Platte ausfällt. Die Werkbank warnt, wenn sie das erkennt (gleiche Platte wie die Dokumente; die Platte der Datenbank sieht das DMS nicht). Halte dich an die **3-2-1-Regel**:

- **3 Kopien** deiner Daten: das laufende DMS und zwei Sicherungen,
- auf **2 verschiedenen Medien**, z. B. NAS und USB-Platte,
- **1 Kopie außer Haus**, z. B. in der Cloud oder bei Verwandten.

Das DMS schreibt nur in den Sicherungsordner. Weiterkopieren lässt du ihn vom NAS, zum Beispiel:

- **Synology:** *Hyper Backup* mit dem Ordner `docker/dms/sicherung` als Quelle, Ziel USB-Platte oder Cloud (C2, S3, …).
- **UGREEN, QNAP und andere:** die Sicherungs-App des NAS (z. B. *Hybrid Backup Sync*) oder eine Synchronisation auf eine USB-Platte.
- Alternativ den Sicherungsordner gleich auf eine zweite Platte des NAS legen (`/volume2/…`) und diese weiterkopieren.

Da die Sicherungen verschlüsselt sind, dürfen sie auch in eine Cloud. Das [Notfallblatt](#notfallblatt) mit dem Schlüssel gehört **nicht** dorthin.

## Notfallblatt

**Notfallblatt herunterladen** (hier und unter *Verschlüsselung*) erzeugt ein PDF mit allem, was du nach einem Ausfall brauchst:

- Name des Haushalts, **Haushalts-Id**, Adresse, DMS-Version und Datum,
- den **Schlüssel** in Vierergruppen zum Abschreiben und seinen **Fingerabdruck**,
- wo die Sicherungen und die Schlüsseldatei liegen,
- die Schritte zur Wiederherstellung auf einem neuen System – auch: „Startet das DMS nicht mehr, ein älteres Image ziehen“,
- den Hinweis auf das Datenbank-Passwort (ohne den Wert).

![Notfallblatt](bilder/notfallblatt.png)

Wo das Datenbank-Passwort steht, hängt von der Vorlage ab:

| Vorlage | Datenbank-Passwort |
| --- | --- |
| allgemeine Vorlage (`deploy/nas`) | in der Datei `.env` neben der Compose-Datei (`DB_PASSWORD`) |
| Synology, UGREEN, QNAP, TrueNAS, Unraid | oben in der Compose-Datei (`x-passwort`) |
| dms-komplett | keins – die Datenbank ist nur im Container erreichbar |

Das Blatt selbst nennt immer die `.env`. Für ein neues System genügt ohnehin ein neues Passwort.

**Aufbewahren:** ausgedruckt an einem sicheren Ort (z. B. bei den Familienunterlagen) oder als PDF in einem Passwortsafe – auf jeden Fall **getrennt vom NAS** und nicht neben den Sicherungen. Wer das Blatt hat, kann die Sicherungen lesen.

Jeder Download steht im Protokoll (ohne den Schlüssel). Ändert sich der Schlüssel ([Schlüssel wechseln](verschluesselung.md#schlussel-wechseln)), weist die Werkbank darauf hin, ein neues Notfallblatt zu erstellen; ältere Sicherungen brauchen weiterhin das alte – bewahre es auf, solange es solche Sicherungen gibt. In der Liste tragen sie den Hinweis „früherer Schlüssel“; mit **Sicherungen mit früherem Schlüssel löschen** entfernst du sie alle auf einmal. Die [Probe-Wiederherstellung](wiederherstellen.md#probe-wiederherstellung) braucht den aktuellen Schlüssel – Sicherungen mit früherem Schlüssel lassen sich nicht probeweise einspielen.

!!! tip "Für Selbstständige und Vermieter"
    Wie Sicherung, Historie und Berechtigungen zusammen eine geordnete Belegablage ergeben, beschreibt die [Vorlage für die Verfahrensdokumentation](verfahrensdokumentation.md).
