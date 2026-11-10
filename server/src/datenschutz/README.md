# Datenschutz (#1078)

**Zweck:** Auskunft nach Art. 15 DSGVO von der Prüfliste bis zur Zustellung, die Datenquellen für Voll- und
persönlichen Export und die Demo-Daten. Schicht 3 der Zielaufteilung.

- `datenschutz.dienst.ts` – `DatenschutzDienst`: Einstellungen (`datenschutz`, `setzeDatenschutz`), Prüfliste
  (`auskunftVorschau`, #472), `auskunftDaten`, Nachweis, Antwortfrist, Verzeichnis und Notizen der Auskünfte (#396,
  #668); Demo-Daten zählen, entfernen, Dokumente anlegen (#248, #711). Dazu `DatenschutzTeile`/`DatenschutzAnschluss`.
- `vollexport.ts` – `VollexportQuellen`: `vollexportQuelle` (#254), `persoenlicheQuelle` (#255, #683). Das Format
  schreibt weiter `vollexport.ts` unter `server/src/`.
- `zustellen.ts` – `AuskunftZustellen` (#455, #666): per E-Mail, Abruf-Links anlegen und zurückziehen, Abruf prüfen,
  zählen und melden; „Meine Daten exportieren“ (#884), `exportAbschaetzung`.
- `index.ts` – die einzige Tür. `datenschutz.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Alle Klassen bekommen den Kern und dieselben `DatenschutzTeile`: Rechteprüfung, Historie, Mappen, Dokumente
  (Umwandlung, Archivfassung), Sichten, Ereignisse, Aufgaben (Vertretung), Löschen (Baum, Löschprotokoll) – und
  einander (`baueDatenschutz()` im Dienst).
- Über den Anschluss: Konten, Kurzzustand (#744), den Tresor (nur `entschluessele`) und den Export der
  Automatisierungen (vom Baustein gesetzt). `istVerschluesselt` kommt als Werkzeug aus `tresor.ts`.
- Importiert nur sich selbst, Kern, Fachordner (je über `index.ts`), `shared/`, die Basis und die Werkzeuge
  `auskunft`, `vollexport`, `abruf`, `passwort`, `tresor`, `export`.

**Regeln**

- Abruf-Links: Schlüssel und Code nur als Hash; je Link eine Prüfung zugleich (Kurzzustand), Fehlversuche zählen und
  sperren, Abrufe atomar zählen – derselbe Code wie vorher.
- Passwortfelder und verschlüsselte Werte nie in einer Auskunft; ältere Versionen ebenso wenig.
- Umgetragen aus `dienst.ts`: sieben `no-unused-vars` (absichtlich weggelassene Felder), ein `complexity`, ein
  `max-lines-per-function`, ein `max-params`.

Mehr im Entwicklerhandbuch unter *Aufbau → Datenschutz*.
