# Gebrauchte Hardware

Ein Raspberry Pi 5 mit Netzteil, Gehäuse und SSD kostet schnell mehr, als viele denken. Oft geht es günstiger: mit einem **gebrauchten Mini-PC**, einem **Thin Client** oder dem **alten Notebook** aus dem Schrank. Diese Geräte haben einen Prozessor von Intel oder AMD (x86, „amd64“), einen Netzwerkanschluss und meist eine SSD. Ablago läuft darauf mit dem normalen Image, ohne Sonderweg – und das Gerät bekommt ein zweites Leben.

Diese Seite hilft dir zu entscheiden, ob ein Gerät reicht, und worauf du beim Kauf achtest. Danach geht es weiter mit der Anleitung [PC oder Mini-PC mit Linux](linux.md).

!!! info "Kein Gerät ist vom Projekt geprüft"
    Hier stehen Erfahrungswerte, keine Zusage. Welche Geräte das Projekt selbst prüft, steht unter [Geprüfte Plattformen](plattformen.md). Meldungen aus der Gemeinschaft sind dort ein Hinweis, keine Zusage. Hersteller und Händler nennen wir bewusst nicht als Empfehlung.

## Welche Geräte in Frage kommen

| Gerät | Gut geeignet, weil … | Achte auf … |
| --- | --- | --- |
| **Mini-PC** (kleiner Bürorechner, oft aus dem Leasing von Firmen) | leise, sparsam, klein; meist mit SSD und Netzwerkanschluss | Netzteil dabei? Platz für eine zweite Festplatte? |
| **Thin Client** (Arbeitsplatzrechner ohne viel Speicher) | sehr sparsam und lautlos, oft sehr günstig | Arbeitsspeicher und SSD reichen oft nicht – lassen sie sich aufrüsten? |
| **Altes Notebook** | schon da; hat einen eingebauten Akku als kleine Notstromversorgung | Akku im Dauerbetrieb (siehe [unten](#notebook)), Netzwerkanschluss |
| **Alter Bürorechner** (Tower) | viel Platz für Festplatten, leicht aufzurüsten | Stromverbrauch und Lautstärke im Dauerbetrieb |

**Eher nicht geeignet:**

- **Alte Smartphones und Tablets:** Docker läuft darauf nicht, der Akku ist für den Dauerbetrieb an der Steckdose nicht gemacht, und es gibt keine Updates mehr.
- **Sehr alte Rechner** mit 32-Bit-Prozessor: Ablago gibt es nur für 64 Bit.
- **Geräte mit Prozessoren älter als etwa 2013** (z. B. Intel Core der 3. Generation und älter): Sie laufen oft noch, brauchen aber viel Strom für wenig Leistung.

## Was das Gerät mindestens haben sollte { #mindestens }

| | Mindestens | Gut für einen Haushalt | Für einen kleinen Betrieb |
| --- | --- | --- | --- |
| **Prozessor** | 2 Kerne, 64 Bit (x86) | 4 Kerne | 4 Kerne oder mehr |
| **Arbeitsspeicher** | 2 GB | 4 GB | 8 GB |
| **Speicher** | SSD mit 64 GB | SSD mit 128 GB oder mehr | SSD mit 256 GB oder mehr |
| **Netzwerk** | Netzwerkkabel (LAN) | Netzwerkkabel | Netzwerkkabel |

Die Spalten folgen den Stufen des [Lasttests](https://help.ablago.app/admin/aktuell/lasttest/): *klein* ist ein Haushalt (5.000 Mappen), *mittel* ein kleiner Betrieb (50.000 Mappen). Wie verschiedene Geräte dabei abschneiden, zeigt [Was Ablago verkraftet](https://help.ablago.app/admin/aktuell/verkraftet/). Mit dem Lasttest kannst du auch dein eigenes Gerät messen – und uns das Ergebnis melden.

**Was die Begriffe heißen:**

- **Kerne:** Wie viele Dinge der Prozessor gleichzeitig erledigen kann. Mehr Kerne helfen vor allem bei der Texterkennung.
- **Arbeitsspeicher (RAM):** der schnelle Speicher, in dem Programme laufen. Ablago selbst braucht um 1 GB, die Datenbank kommt dazu.
- **SSD:** ein Speicher ohne bewegliche Teile. Sie ist viel schneller und leiser als eine Festplatte (HDD), und die Datenbank profitiert stark davon.

## Checkliste beim Kauf { #checkliste }

- **SSD statt Festplatte.** Hat das Gerät nur eine Festplatte (HDD), plane eine SSD dazu ein. Für Dokumente und Sicherungen darf es zusätzlich eine große Festplatte sein.
- **Netzwerkanschluss (LAN).** WLAN geht, ist aber langsamer und unzuverlässiger.
- **Netzteil dabei.** Bei gebrauchten Mini-PCs und Thin Clients fehlt es oft. Ein passendes Original-Netzteil ist sicherer als ein Nachbau.
- **Stromverbrauch im Leerlauf.** Das Gerät läuft rund um die Uhr. Ein Mini-PC braucht im Leerlauf oft nur 5 bis 15 Watt, ein alter Tower leicht 30 bis 60 Watt. Jedes Watt Dauerlast sind rund 9 kWh im Jahr. Ein einfaches Messgerät für die Steckdose zeigt den echten Wert.
- **Lautstärke.** Steht das Gerät im Wohnraum, achte auf einen leisen oder gar keinen Lüfter.
- **Updates vom Hersteller.** Gibt es für das Modell noch Updates für BIOS bzw. Firmware? Spiel das neueste vor der Einrichtung auf; die Hersteller beheben damit auch Sicherheitslücken.
- **64 Bit.** Prozessoren seit etwa 2010 können das fast alle – im Zweifel die Modellnummer im Internet nachschlagen.

## Notebook im Dauerbetrieb { #notebook }

- **Akku:** Ein Akku, der jahrelang voll geladen an der Steckdose hängt, altert schnell und kann sich aufblähen. Stell im BIOS oder in der Software des Herstellers eine **Ladegrenze von etwa 80 %** ein. Geht das nicht, nimm den Akku heraus, wenn das Notebook ohne ihn startet. Ein aufgeblähter Akku (gewölbtes Gehäuse, Touchpad hebt sich) gehört sofort aus dem Gerät und zum Wertstoffhof.
- **Deckel zu ohne Ruhezustand:** Das Notebook darf beim Zuklappen nicht einschlafen. Unter Linux trägst du dafür in der Datei `/etc/systemd/logind.conf` die Zeile `HandleLidSwitch=ignore` ein und startest neu. Bei einem Server-System ohne Desktop ist das meist schon so.
- **Belüftung:** Leg das Notebook nicht auf Stoff oder in einen engen Schrank; die Lüftungsschlitze brauchen Luft.

## Betriebssystem { #betriebssystem }

Ein schlankes Linux ohne Desktop genügt, z. B. **[Debian](https://www.debian.org/distrib/)** oder **[Ubuntu Server](https://ubuntu.com/download/server)** in der Version mit langer Unterstützung (LTS). Wie du es installierst, steht in der offiziellen Anleitung des jeweiligen Systems. Danach geht es weiter mit [PC oder Mini-PC mit Linux](linux.md): Docker installieren, Ablago starten, im Browser einrichten.

## Vor der Weiternutzung { #vorher }

- **Alte Daten sicher löschen:** Kommt das Gerät von jemand anderem oder lagen darauf deine alten Daten, lösch den Datenträger beim Installieren von Linux ganz (bei der Partitionierung „gesamte Festplatte verwenden“). Bei einer SSD löscht der Hersteller-Befehl *Secure Erase* (im BIOS oder mit dem Werkzeug des Herstellers) am gründlichsten.
- **Datenträger prüfen (SMART):** Festplatten und SSDs führen selbst Buch über ihren Zustand. Unter Linux zeigt `sudo smartctl -a /dev/sda` (Paket `smartmontools`; bei NVMe-SSDs `/dev/nvme0`) die Werte. Wichtig sind *SMART overall-health: PASSED*, keine *Reallocated* oder *Pending Sectors* und bei SSDs ein *Percentage Used* deutlich unter 100 %. Ist ein Wert auffällig, nimm einen anderen Datenträger – deine Dokumente sollen darauf jahrelang sicher liegen.
- **Sicherung einplanen:** Auch ein neues Gerät kann ausfallen, ein gebrauchtes erst recht. Richte gleich nach der Einrichtung die [Sicherung](https://help.ablago.app/admin/aktuell/sicherung/) ein und kopiere sie regelmäßig an einen anderen Ort.

!!! tip "Preise"
    Gebrauchte Mini-PCs und Thin Clients gibt es oft für einen Bruchteil des Neupreises; die Preise ändern sich aber schnell. Vergleiche mit dem Gesamtpreis eines Raspberry Pi samt Netzteil, Gehäuse und SSD – und rechne den Strom für ein paar Jahre mit ein.
