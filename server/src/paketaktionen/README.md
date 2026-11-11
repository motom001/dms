# Paket-Aktionen im Menü „Mappe“ (#1039)

**Zweck:** Ein Paket meldet im Manifest Aktionen an (`mappenaktionen`), Ablago zeigt sie im Menü „Mappe“ passender
Mappen – gekennzeichnet mit dem Paket – und führt den Ablauf: Das Paket antwortet mit einer Dialog-Beschreibung als
Daten oder mit einem Ergebnis; Ablago zeigt den Dialog, gibt die Wahl zurück und wendet das Ergebnis mit dem Zugriff
der Person an. Dazu die Schalter der Werkbank (Aktionen eines Pakets aus, eingebaute Aktionen ausblenden).
Schicht 3 (nicht in `SCHICHTEN` genannt).

- `paketaktionen.dienst.ts` – `PaketAktionen`: Angebot je Mappe und Person, Start, nächster Schritt, Abbrechen, Datei
  abholen, Kern-Dialog „Brief aus Vorlage“ (`vorlageLauf`, `vorlageErledigt`), Einstellungen.
- `manifest.ts` – `mappenaktionen` im Manifest lesen (für `liesPaket`).
- `dialog.ts` – Antwort eines Pakets lesen und prüfen (Dialog, Ergebnis), Antworten der Person prüfen.
- `paketaktionen.routen.ts` – `/api/mappen/:id/paketaktionen…`, `/api/paketaktionen/laeufe/:lauf…`,
  `/api/werkbank/pakete/(…/)mappenaktionen`.
- `index.ts` – die einzige Tür.

**Abhängigkeiten**

- Kern und Rechteprüfung (`zugriff/`), `shared/src/paketaktionen.ts` (Schreibweise, Typen), `shared/src/anzeige.ts`
  (Bedingung wie „Anzeigen, wenn …“), die PDF-Stelle (`seitenInfo` als Prüfung beim neuen Dokument).
- Über den Anschluss: Zugriff des Dienstkontos eines Pakets, KI-Sperre (#796), Prüfstelle (#723), Hochladen, Mappe
  ändern und anlegen, Ausgabe mit Pflicht-Stempel. Den Paket-Läufer setzt der Läufer selbst (`laeufer`).

**Regeln (Ergänzung Sicherheit)**

- Schnittmenge aus angekündigten Rechten, Rechten der Person und Rechten des Pakets – bei jedem Schritt auf dem Server
  (Menü, Start, jeder Schritt, Ergebnis, Datei abholen). Herausgeben ist Herunterladen (Recht E, Pflicht-Stempel).
- Während eines Schritts fragt das Paket nicht mit seinem Dienstkonto, sondern über den eingeschränkten Zugriff:
  `GET /mappe`, `GET /dokumente/<id>` (nur Dokumente dieser Mappe, nur mit Leserecht auf Dokumente), `POST /dateien`.
  Alles andere 403; den eigenen Speicher nur lesen.
- Aktion, Mappe, Person und Schritt stehen im Lauf auf dem Server; das Paket bekommt nur die Kennung. Mappe und Person
  kommen nie aus der Antwort des Pakets.
- Dialoge nur als Daten (Text, Auswahl, Haken, Textfeld, Datum), keine Passwort-Eingabe, kein Datei-Upload, keine
  Links; Texte bereinigt und begrenzt (`grenzen.ts`), höchstens zwei Dialoge je Lauf. Paketname immer im Kopf.
- Höchstens ein laufender Schritt je Person und Paket (Sperre im Kurzzustand); jeder Schritt mit Zeitgrenze (`AKTION_ZEIT_MS`). Läufe stehen im Kurzzustand (#744), der Läufer im Leiter beantwortet den Zugriff aus Daten – so geht es auch mit mehreren Prozessen.
- Historie der Mappe (Person und Paket) und Verlauf des Pakets im Paket-Läufer (Aktion und Person).

Mehr im Entwicklerhandbuch unter *Aktionen im Menü „Mappe“* (Paketentwickler).
