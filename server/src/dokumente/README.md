# Dokumente (#1075)

**Zweck:** Alles rund um die Dateien an einer Mappe an einer Stelle: Hochladen, Löschen, Versionen, Fassungen
(Umwandeln, Archivfassung, geschützte PDFs) und fehlende Dateien. Schicht 2 der Zielaufteilung – über Kern und
Rechteprüfung, neben `mappentypen/` und `mappen/`.

- `dokumente.dienst.ts` – `DokumenteDienst`: `ladeHoch` (gleicher Name #194, automatisch verkleinern #393, eine
  Transaktion #404), `loescheDokument` (Papierkorb #344, Löschprotokoll #470), `textAusDatei` (#391),
  Texterkennung und Vorschaubilder anbinden, `neueDateien`, `raeumeAuf`; `dateiname`, `erkenneAnzeigbar` (Modulebene).
- `versionen.ts` – `DokumentVersionen` (#194): `ersetzeDokument`, `holeVersionZurueck`, `nachNeuerVersion` (nur die
  letzten N, Löschprotokoll), `versionen`, `versionInhalt`, `beruehre` („zuletzt geändert“, #76).
- `umwandeln.ts` – `DokumentUmwandlung` (#577): Paket anbinden, `nachFassung`, `umwandelPaketDa`, Fassung und
  Vorschaubild eines Pakets, `fassungVon`, `umwandlungStand`, `nachUmwandlungsEreignis`.
- `archivfassung.ts` – `DokumentArchivfassung` (PDF/A, #631): Paket anbinden, `archivNachVolltext` (#946),
  `archivPaketDa`, `setzeArchivfassung`, `wortpositionen`, Stand je Dokument und für die Werkbank.
- `geschuetzte-pdf.ts` – `GeschuetztePdfs` (#827): Entsperren anbinden, `entsperreDokument`, `nachEntsperren`,
  `mitPdfSchutz`.
- `fehlende-dateien.ts` – `FehlendeDateien` (#877): merken, zählen, `dokumenteOhneDatei`, `pruefeVorhanden`.
- `anlagen.ts` – `DokumentAnlagen` (#998): `liste`, `haengeAn` („Als Anlage an … hängen“), `loese` („Zum eigenen
  Dokument machen“), `sortiere`, `benenne`, `alsAnlagen` (beim Teilen einer Post, `dms:anlagen`). Mitwandern:
  `verschiebeDokument` im Repo, `loescheDokument` (Anlagen mit in den Papierkorb, beim Ersetzen `nimmAnlagenMit`),
  Wiederherstellen im Papierkorb. `alsOriginalEmail` (#999): die abgeholte E-Mail als letzte Anlage am letzten Anhang;
  `eingangNr`/`originalEmail` setzt `ladeHoch` (intern `eingang`) und übernimmt `nimmAnlagenMit` beim Ersetzen.
- `index.ts` – die einzige Tür. `dokumente.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Jede Klasse bekommt den **Kern**; `DokumenteDienst`, `GeschuetztePdfs` und `DokumentArchivfassung` dazu die
  Teile dieses Ordners, die sie rufen. Was im Kreis liefe (Versionen ↔ Hochladen, Umwandeln ↔ Entsperren) und was
  noch im Dienst liegt, kommt über einen Anschluss: Ereignis, Titel, Archivmodus, Verkleinern, Volltext, Aufträge an
  Pakete, Paket-Einstellungen, Mappentypen und die Texterkennung.
- Importiert nur sich selbst, Kern, `shared/`, die Basis und die Technik der Dateien (`hochladen.ts`,
  `verkleinern.ts`, `dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`, `paketvolltext.ts` – `WERKZEUGE` in
  `.dependency-cruiser.cjs`), geprüft mit `npm run lint:abh` (Regel `fachordner`, Schicht 2 in `SCHICHTEN`).
- Wer Dokumente braucht, ruft die Klasse am Dienst (`dienst.dokumente.…`, `dienst.dokumentVersionen.…` usw.; seit
  #1079 ohne Weiterleitungen im Dienst). Den Zustand (angebundene Texterkennung, Vorschaubilder, Umwandlung,
  Entsperren, Archivfassung) halten die Klassen; der Zusammenbau reicht ihn über die Anschlüsse weiter.

**Regeln**

- Reihenfolge und Transaktion bleiben: `ladeHoch` schreibt Historie, „zuletzt geändert“, Dokument, Volltext und
  das Ereignis `dokument.hochgeladen` in einer Transaktion; Vorschau, Umwandeln und Entsperren laufen danach
  (`kern.danach`). Ereignisse gehen über den Anschluss (Tests ersetzen `dienst.kern.ereignis`).
- `kern.repo` bei jedem Aufruf neu holen (Getter `repo`) – in einer Transaktion sieht es deren Änderungen.
- PDF bearbeiten, Verkleinern und Schwärzen liegen seit #1077 in `pdf-bearbeiten/`; `entsperrtZu` (Stempel und
  Verkleinern beim Weitergeben) seit #1078 in `geschuetzte-pdf.ts`. Den Volltext (`volltextFertig`, `volltextAn`, seit #1076 in `volltext/`) rufen die Klassen über ihren
  Anschluss am Dienst.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: je ein `complexity` in
  `dokumente.dienst.ts` und `umwandeln.ts`, ein `max-lines-per-function` in `dokumente.dienst.ts`, ein `max-params`
  und ein `no-unused-vars` in `versionen.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Dokumente*.
