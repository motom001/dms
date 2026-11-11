# Text setzen (#1040)

**Zweck:** Aus einer Text-Vorlage (Markdown, #1038) und den Werten einer Mappe einen Brief als PDF machen –
Briefkopf, Anschrift, Datum, Betreff und Text im Aufbau ähnlich DIN 5008, getaggt und schlicht. Ergebnis ist ein
neues Dokument (PDF und ausgefüllter Text) im gewünschten Register oder ein PDF zum Herunterladen. Pakete nutzen
denselben Dienst über die API (`/api/v1/mappen/{id}/vorlagen…`). Schicht 3 (nicht in `SCHICHTEN` genannt).

- `textsatz.dienst.ts` – `TextsatzDienst`: `vorlagen` (passende Vorlagen einer Mappe mit dem Stand ihrer
  Platzhalter: an der Mappe selbst und an Mappen, auf die sie verweist) und `setze` (ablegen oder herunterladen).
- `textsatz.routen.ts` – `GET /api/mappen/:id/vorlagen`, `POST /api/mappen/:id/vorlagen/:dokument/setzen`.
- `index.ts` – die einzige Tür.

**Abhängigkeiten**

- Kern und Rechteprüfung (`zugriff/`), die Prüfung der Vorlagen aus `pakete/` (`pruefeVorlage`), die PDF-Stelle
  (`pdf/brief.ts`, im Arbeiter mit Zeitgrenze) und `shared/src/textsatz.ts` (Platzhalter einsetzen, Markdown zerlegen).
- Über den Anschluss: die eigene Organisation (#995, feste Liste), die Prüfstelle der Wege nach draußen (#723) und das
  Hochladen der Dokumente.

**Regeln (Ergänzung Sicherheit)**

- Werte sind Text, kein Markdown: erst zerlegen, dann einsetzen, in einem Durchgang. Kein HTML, keine Bilder, keine
  Links zum Anklicken, kein Netz.
- Platzhalter nur mit Werten, die die Person lesen darf – Mappe und jede verwiesene Mappe; beim Herunterladen dazu
  das Exportrecht E. Passwortfelder nie. Fehlt etwas, steht die Lücke „[Feld]“ im Brief.
- Nur die Formate der Feldarten (Datum, Betrag … in der Sprache der Vorlage), kein frei auswertbarer Ausdruck.
- Die Vorlage wird vor jedem Satz noch einmal geprüft. Grenzen (Text, Seiten, Größe, Zeit) in `grenzen.ts`.
- Ablegen braucht Bearbeiten an der Mappe, Herunterladen die Prüfstelle. Das PDF nennt in den Metadaten Paket und
  Vorlage.

Mehr im Entwicklerhandbuch unter *Text-Vorlagen* (Paketentwickler) und *Aufbau*.
