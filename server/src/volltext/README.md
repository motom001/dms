# Volltext (#1076)

**Zweck:** Der Volltext der Dokumente an einer Stelle: das Ereignis „Volltext fertig“, nachholen und neu erzeugen,
die Texterkennung als Paket, Volltext aus Paketen (`dms:volltext`), Antworten der Pakete auf ihre Ereignisse,
Volltext lesen und schreiben, Sprache und Hinweis „Post teilen?“. Schicht 3 – über den Dokumenten.

- `volltext.dienst.ts` – `VolltextDienst`: `beiVolltextFertig`, `volltextFertig` (#336, #442, #458),
  `volltextAusgelassen` (#946), `volltextAn`, `volltextNachholen`, `volltextNeu` (#458), `texterkennungErneut`,
  `texterkennungPaket`, `texterkennungPaketDa` (#459), `texterkennungFortschritt`, `nachEreignisAufruf` (#636),
  `nachTexterkennungsEreignis`, `volltext`, `schreibeVolltext` (#338, #400, #579), `setzeDokumentSprache`,
  `teilenHinweisAus`; `VOLLTEXT_MAX`, `VolltextMeldung`, `EreignisAufruf` (Modulebene).
- `aus-paketen.ts` – `VolltextAusPaketen` (#614): `volltextPaketDa`, `paketWegFuerDateien`, `pruefeVolltextRecht`,
  `nachVolltextEreignis`. Wer zuständig ist, rechnet `paketvolltext.ts` (Werkzeug, auch für die Dokumente).
- `index.ts` – die einzige Tür. Eigene Routen gibt es nicht.

**Abhängigkeiten**

- Bekommt den **Kern** und die Dokumente (Texterkennung, Umwandeln, Archivfassung) aus `dokumente/`. Was noch im
  Dienst liegt, kommt über einen Anschluss: Ereignis (`kern.ereignis`), Aufträge, `paketVolltext`, Sicherung außer Haus.
- Die Dokumente (Schicht 2) rufen `volltextFertig` und `volltextAn` weiter über ihren Anschluss am Dienst.
- Importiert nur sich selbst, Kern, `dokumente/` (je über `index.ts`), `shared/` und die Basis – geprüft mit
  `npm run lint:abh` (Regel `fachordner`; Schicht 3, nicht eigens in `SCHICHTEN` genannt).

**Regeln**

- Reihenfolge bleibt: `volltextFertig` legt erst `volltext.fertig` in den Ausgangskorb, meldet dann die
  Archivfassung (`archivNachVolltext`, im Hintergrund) und ruft nur mit Text die Hörer (Erkennung #336) nacheinander.
  `nachTexterkennungsEreignis` verteilt wie bisher: Umwandeln, Archivfassung, Volltext aus Paketen, Sicherung.
- Ereignisse über den Anschluss (Tests ersetzen `dienst.kern.ereignis`), Historie über `kern.historie`.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: drei `complexity` und ein
  `no-control-regex` in `volltext.dienst.ts`, ein `complexity` in `aus-paketen.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Volltext*.
