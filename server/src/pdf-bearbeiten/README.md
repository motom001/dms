# PDF bearbeiten (#1077)

**Zweck:** Die Fachlogik rund um PDFs an einer Stelle: Seiten ansehen, drehen, umsortieren, teilen und
zusammenfügen, verkleinern, schwärzen und die Stempel-Vorlagen. Schicht 3 der Zielaufteilung – über Mappen,
Dokumenten und Kern. Die PDF-Stelle mit pdf-lib (`pdf/`, #541) ist Technik und bleibt unverändert, wo sie ist.

- `pdf-bearbeiten.dienst.ts` – `PdfBearbeiten` (#335): `seitenbilder`, `pdfVon`, `seiteAlsGraubild` (#338),
  `pdfSeiten`, `pdfSeitenbild`, `bearbeitePdf`, `teilePost`, `fuegePdfZusammen`.
- `verkleinern.ts` – `PdfVerkleinern` (#393): `verkleinernVorschau`, `verkleinereDokument`, `legeDateiAb`,
  `automatischVerkleinert`, Einstellung, `grosseDokumente`, `verkleinereViele`; `VERKLEINERN_STANDARD`, `GROSSE_MAX`.
- `schwaerzen.ts` – `Schwaerzen` (#392, #459): `schwaerzenVorschau`, `schwaerzSeitenbild`, `archivSeitenbild`
  (#934), `schwaerzeDokument`.
- `stempelvorlagen.ts` – `Stempelvorlagen` (#394): Vorlagen und Stempel je Mappentyp in den Einstellungen. Welcher
  Stempel beim Weitergeben gilt, entscheidet `ausgang/`.
- `index.ts` – die einzige Tür. Eigene Routen gibt es nicht (sie stehen bei `dokumente/`).

**Warum nicht in `pdf/`?** `pdf/` ist von der Regel `fachordner` ausgenommen (`TECHNIK`), läuft im Arbeiter und
wird von den Dokumenten (Schicht 2) eingebunden. Fachlogik mit Kern, Mappen und Dokumenten dort hätte die Regel
aufgeweicht und einen Kreis über `pdf/index.ts` gebaut.

**Abhängigkeiten**

- Jede Klasse bekommt den **Kern**, die Rechteprüfung, Mappen und Dokumente, die sie ruft; Verkleinern dazu
  `PdfBearbeiten`, Schwärzen das Verkleinern (Datei ablegen). Über den Anschluss: die Post (neue Post, Systemmappe,
  „Post für dich“ – `post/` hängt Fotos mit `pdfVon` an, andersherum liefe es im Kreis), Aufträge, `volltextFertig`.
- Importiert nur sich selbst, Kern, tiefere Fachordner, `volltext/` (nur ein Typ; je über `index.ts`), `shared/`, die
  Basis, `pdf/` und die Werkzeuge (`pdfseiten.ts`, `graubild.ts`, `schwaerzen.ts`, `verkleinern.ts`, `hochladen.ts`).

**Regeln**

- Reihenfolge bleibt: Teilen bei Post legt je Teil Post, Historie und Dokument in einer Transaktion an; Schwärzen
  schreibt Version oder Kopie, Volltext und Historie in einer Transaktion, „Volltext fertig“ danach.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `complexity` in allen drei Diensten,
  `max-params` in `pdf-bearbeiten.dienst.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → PDF bearbeiten*.
