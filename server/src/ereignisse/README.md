# Ereignisse (#1078)

**Zweck:** Was der Kern an Pakete und Automatisierungen weitergibt: neue Aufgaben und Verknüpfungen melden, jedes
Ereignis des Katalogs an die Pakete, die es abonniert haben, Aufträge an genau ein Paket, die Nachberechnung der
Vektoren und die Hilfen, mit denen Automatisierungen prüfen. Den Ausgangskorb selbst (`ereignis`) hat der Kern.

- `ereignisse.dienst.ts` – `EreignisseDienst`: `neueAufgabe`, `meldeVerknuepft` (#670), `ereignisAnPakete`
  (#686 nur mit Leserecht des Paket-Benutzers, #796 KI-Sperre), `auftrag` (#577, #614, #631; #1082 `zeitplan.ausgefuehrt` mit fester Id), `vektorNachlauf` (#442).
- `automatisierung.ts` – `Automatisierungshilfen` (#674, #712): `automatisierungKontext`, `mitgliederDerRolle`,
  `trifftTeile`, `lesbareTitel`, `datumVon`, `mappenMitDatum`.
- `index.ts` – die einzige Tür.

**Schicht 2.** Viele brauchen die Ereignisse – Mappen und Dokumente (Schicht 2) ebenso wie Aufgaben, Post und
Datenschutz (Schicht 3). Selbst brauchen sie nur Kern, Rechteprüfung und die Pakete am Mappentyp samt KI-Freigabe
(`mappentypen/`). Was darüber liegt – die Texterkennung (`volltext/`) und die Rollen (`post/`) – kommt über den
Anschluss. So können tiefere Ordner sie künftig direkt nutzen, ohne Umweg über den Dienst.

**Abhängigkeiten**

- `EreignisseDienst` bekommt den Kern und `EreignisseTeile` (Rechteprüfung, `TypPakete`, `KiTypen`); über den
  Anschluss Ereignis auslösen (`kern.ereignis`), den Wecker des Paket-Läufers (`ereignisWecker`, vom Start gesetzt) und
  `nachTexterkennungsEreignis`.
- `Automatisierungshilfen` bekommt Kern und Rechteprüfung, die Rollen über den Anschluss.
- Importiert nur sich selbst, Kern, `zugriff/`, `mappentypen/` (je über `index.ts`), `shared/` und die Basis.
- Von außen als `ereignisse/index` einbinden: Neben dem Ordner liegt `ereignisse.ts` (der Verteiler des Katalogs),
  `../ereignisse` fände diese Datei – wie bei `pakete/index`.

**Regeln**

- Ein Paket bekommt Mappen-Ereignisse nur, wenn sein Benutzer die Mappe gerade lesen darf (#686, #958: auch im
  Papierkorb); sonst still nicht, mit Grund im Protokoll. KI-Pakete bekommen nichts aus gesperrten Mappentypen.
- Die Id je Zustellung ist fest (Ereignis, Paket, Name) – kommt ein Ereignis noch einmal, entsteht nichts doppelt.
- Den Abnehmer `pakete` meldet der Dienst beim Verteiler an (`ereignisse.abonniere('pakete', …)`).
- Umgetragen aus `dienst.ts`: ein `complexity`.

Mehr im Entwicklerhandbuch unter *Aufbau → Ereignisse*.
