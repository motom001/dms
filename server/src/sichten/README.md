# Sichten (#1076)

**Zweck:** Die Ansichten der Ablage an einer Stelle: eine Seite einer Ansicht mit Suche, Sortierung und Bezügen, die
Zahlen der Seitenleiste und des Zähler-Endpunkts, der Stand der Ablage, das Verwalten der Ansichten in der Werkbank
und die mitgelieferten Ansichten. Schicht 3 der Zielaufteilung – über Mappen, Rechteprüfung und Kern.

- `sichten.dienst.ts` – `SichtenDienst`: `seite` (Ansicht, Typ, Verweisfeld #172, Link #98, erweiterte Suche #199,
  unscharf #356, ähnliche Treffer #442), `trefferIds` (#149), `zaehler` (#512, #742), `zaehlerRahmen`, `zaehlerAbruf`
  (#625), `ablageStand` (#919), `beiAenderung` (#627), `aktualisiereStatistik` (#367); die Zwischenspeicher der
  Zahlen und `sortierungAus` (Modulebene).
- `verwalten.ts` – `SichtenVerwaltung` (#38): `listeSichten` und `verborgeneSichten` (#148), `sichtTestlauf`, anlegen,
  ändern (gleichzeitig bearbeiten #917, `konfigurationKonflikt`), löschen, ordnen, verschieben (#73),
  `sichtVorschau`, `sichtFuerTyp`, `belegung`.
- `tabelle.ts` – `tabellenSeite` (#1030): Zeilen der Feldart Tabelle an einer Mappe – dieselbe Seite aus dem Repo
  (Lesefilter in der Anfrage, auch für die Zahl; Sortierung wie die Trefferliste; je 50), nur die Werte der Spalten.
- `systemsichten.ts` – `Systemsichten`: „Neue Post“, „Eingegangen“, „Versendet“ (#192), „Favoriten“ (#725).
- `index.ts` – die einzige Tür. `sichten.routen.ts` (Routen, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- `SichtenDienst` bekommt den **Kern**, die Rechteprüfung, Mappen (`persoenlichAn`), Suche (Varianten, unscharf,
  ähnliche) und die beiden anderen Klassen; `SichtenVerwaltung` Kern und Rechteprüfung, `Systemsichten` nur den Kern.
- Was noch im Dienst liegt, kommt über einen Anschluss: die Gültigkeit der Zahlen (`mindestensMs` stellen Tests am
  Dienst), Aufgaben ohne Empfänger und ohne Leserecht, Termine, Konten.
- Importiert nur sich selbst, Kern, tiefere Fachordner (je über `index.ts`), `shared/` und die Basis – geprüft mit
  `npm run lint:abh` (Regel `fachordner`; Schicht 3, nicht eigens in `SCHICHTEN` genannt).

**Regeln**

- Die Zwischenspeicher hängen an denselben Ständen wie bisher: Zahlen je Typ und Ansicht und Treffer am Mappenstand,
  mit Favoriten, Zahlen der Person und „neue Post“ am Haushaltsstand (#742, #918). Sie entstehen im Konstruktor.
- Die Empfänger an den Anschlusspunkten (`sichten.umbenennen`, `sichten.eigeneSicht`) meldet weiter der Dienst an,
  in unveränderter Reihenfolge; sie rufen `sichtFuerTyp` über die Fassade.
- Wer Sichten braucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen).
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `complexity`, `max-lines-per-function`,
  `max-depth` und fünf `no-unused-vars` in `sichten.dienst.ts`; `complexity` und ein `no-unused-vars` in
  `verwalten.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Sichten*.
