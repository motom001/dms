# Berechtigungen (#1076)

**Zweck:** Die Werkbank der Berechtigungen (Regeln verwalten, #123–#127) an einer Stelle: Übersicht je Mappentyp,
Regelwerk prüfen und speichern, die Warnung „niemand kann lesen“, Regeln kopieren, der Testlauf und das
WebDAV-Laufwerk. Was jemand darf, rechnet weiter die Rechteprüfung in `zugriff/`. Schicht 2 der Zielaufteilung.

- `berechtigungen.dienst.ts` – `BerechtigungenDienst`: `berechtigungenListe`, `niemandLesbar` (#125),
  `setzeBerechtigungen`, `pruefeBerechtigungen`, `protokolliereBerechtigungen`, `berechtigungenAusEingabe` (#142,
  mit dem Mappentyp speichern), `kopiereRegel`, `testlauf` (#125; Systemkonten und Pakete #673, #710; Leserecht auf
  Zeit #798), `laufwerkMappe` (#346).
- `index.ts` – die einzige Tür. Eigene Routen gibt es nicht; die Werkbank ruft `dienst.…`.

**Abhängigkeiten**

- Bekommt den **Kern** (`repo`, `system()`, `name`) und die Rechteprüfung (`aufloesung`, `mappenquelle`,
  `zugriff`, `pruefeRecht`, `lesbare`), dazu einen Anschluss mit den Konten (Benutzer, Systemkonten, Pakete).
- Importiert nur sich selbst, Kern und `zugriff/` (je über `index.ts`), `shared/` und die Basis – geprüft mit
  `npm run lint:abh` (Regel `fachordner`).
- **Schicht 2** in `SCHICHTEN`: Der Ordner braucht nichts über der Rechteprüfung, und die Mappentypen (Schicht 2)
  prüfen damit die Regeln beim Speichern eines Typs. Heute kommen `berechtigungenAusEingabe` und
  `protokolliereBerechtigungen` dort noch über den Anschluss des Dienstes; ein direkter Aufruf wäre erlaubt.

**Regeln**

- Wer Berechtigungen braucht, ruft weiter `dienst.…` (Fassade mit einzeiligen Weiterleitungen).
- `kern.repo` bei jedem Aufruf neu holen (Getter `repo`) – in einer Transaktion sieht es deren Änderungen.
- Regeln prüfen und ihre Wirkung (`rechteAn`, `kontoRegelwerk`, `leseAusdruck`) liegen in `shared/src/rechte.ts`;
  hier nur, was Werkbank und Speichern brauchen.
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: `complexity` von `testlauf`).

Mehr im Entwicklerhandbuch unter *Aufbau → Berechtigungen*.
