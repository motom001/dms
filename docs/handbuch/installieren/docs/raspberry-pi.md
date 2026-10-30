# Raspberry Pi

Das DMS läuft auf einem **Raspberry Pi 4 oder 5** mit 64-Bit-System. Das Image gibt es für arm64, du musst nichts selbst bauen.

**Du brauchst:**

- Raspberry Pi 4 oder 5 mit **mindestens 2 GB**, besser 4 GB Arbeitsspeicher. Ein Pi 3 oder ein Pi Zero ist zu knapp.
- Ein gutes Netzteil (das offizielle). Unterspannung führt zu seltsamen Fehlern.
- Eine **SSD** am USB-3-Anschluss oder beim Pi 5 per NVMe-Aufsatz. Von SD-Karten raten wir für Datenbank und Dokumente ab: Sie verschleißen bei vielen kleinen Schreibvorgängen und gehen dann oft ohne Vorwarnung kaputt.

## 1. System aufspielen

Mit dem [Raspberry Pi Imager](https://www.raspberrypi.com/software/) **Raspberry Pi OS Lite (64-bit)** auf die SSD schreiben (oder auf eine SD-Karte, wenn der Pi nicht von SSD starten kann). Im Imager unter *Einstellungen bearbeiten* gleich Benutzer, WLAN und **SSH** einrichten.

Prüfen, ob das System 64 Bit hat:

```sh
uname -m   # muss aarch64 ausgeben
```

## 2. Docker und DMS

Ab hier ist alles wie auf jedem [PC mit Linux](linux.md#2-docker-installieren): Docker mit dem Installationsskript einrichten, dann die Vorlage laden und starten. Liegt die SSD nicht als Startlaufwerk, sondern zusätzlich am Pi, trägst du ihren Pfad (z. B. `/mnt/ssd/dms`) statt `./daten` ein.

## Gut zu wissen

- **Geschwindigkeit:** Für einen Haushalt reicht der Pi gut. Große Exporte (ZIP, PDF) und das erste Durchsuchen vieler Dokumente dauern etwas länger als auf einem PC.
- **Wärme:** Der Pi 5 braucht einen Kühler, sonst drosselt er.
- **Sicherung:** Kopiere den Ordner `sicherung` regelmäßig auf ein anderes Gerät, siehe [PC mit Linux → Sicherung](linux.md#sicherung).
