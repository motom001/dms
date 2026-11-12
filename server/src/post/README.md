# Post (#1077)

**Zweck:** Alles, was hereinkommt, an einer Stelle: Post anlegen, zuordnen (auch automatisch und wieder zurück),
auflösen und abtrennen, Fotos als Post, die Eingangskanäle und die Mappen, die das System selbst pflegt (Post,
Benutzer, Rollen). Schicht 3 der Zielaufteilung – über Mappen, Dokumenten, Rechteprüfung und Kern.

- `post.dienst.ts` – `PostDienst`: `legePostAn` (eine Transaktion #404), `ordneZu` (#192, auflösen #936),
  `automatischZuordnen` und `automatikRueckgaengig` (#337), `postAufgaben` („Post für dich“).
- `aufloesen.ts` – `PostAufloesen` (#934, #936): `verschiebeInRegister`, `ebenAngelegt`, `aufloesenSperre`,
  `loesePostAuf`, `legeAbgetrenntAn`, `trennePostAb`.
- `systemmappen.ts` – `PostSystemmappen`: `schreibeSystemMappe`, `spiegleBenutzer`, `gleicheBenutzerAb`, Rollen
  (`pruefeRollen`, `setzeRollen`, `listeRollen`), Systemkonten (#673: `systemkontenUebersicht`, `systemZugriff`).
- `eingangskanaele.ts` – `Eingangskanaele` (#195, #196, #333): `postTyp`, `notiereSystem`, gleiche Dateien und ihre
  `fundstellen`, `postMitDatei`, `demoTexterkennung`.
- `foto.ts` – `PostFotos` (#490): `postAusFotos`, `fotosAnMappe`, `legePostZusammen`.
- `leerseiten.ts` – `PostLeerseiten` (#997): `lies`, `markiere` (nur Pakete mit `dms:leerseiten`), `waehleSeite`
  (nur Menschen), vor dem Übernehmen `plane`, danach `lasseWeg` (neue Fassung über `DokumentVersionen.neueFassung`).
- `index.ts` – die einzige Tür. `post.routen.ts` (Postfächer, #960) holt `routen.ts` direkt.

**Abhängigkeiten**

- Jede Klasse bekommt den **Kern**, die Rechteprüfung, die Mappen und Dokumente, die sie ruft, und die Teile dieses
  Ordners; `PostFotos` dazu `pdf-bearbeiten/` (`pdfVon`). `wandleZuPost` und `ergaenzeSystemfelder` liegen seit #1073
  in `mappentypen/systemtypen.ts`.
- Über den Anschluss (am Dienst; Aufgaben und Löschen seit #1078 in `aufgaben/` und `loeschen/`): Ereignis, `meldeVerknuepft`, Aufgaben (anlegen, umleiten, nach Anlass
  erledigen), Konten, Passung, Systemausstattung, das Löschen von Mappen und `sichereZuordnung` aus `erkennung.ts`
  (die Erkennung bekommt noch den ganzen Dienst). `PostAufloesen` holt neue Post über den Dienst – sonst Kreis.
- Importiert nur sich selbst, Kern, tiefere Fachordner, `volltext/` (`volltextAn`), `pdf-bearbeiten/` (je über
  `index.ts`), `shared/`, die Basis und `pdfseiten.ts` – geprüft mit `npm run lint:abh` (Regel `fachordner`).

**Regeln**

- Reihenfolge und Transaktion bleiben: `legePostAn` schreibt Mappe, Historie, Titel, „Post für dich“,
  `post.angelegt` und die Verknüpfungen in einer Transaktion; `ordneZu` setzt Stand und Verweis vor
  `postAufgaben`; Auflösen und automatisches Zuordnen laufen je in einer Transaktion.
- Den Empfänger `post.aufgaben` am Anschlusspunkt `mappeGeaendert` meldet weiter der Dienst an (letzter in der
  Reihe); er ruft `post.postAufgaben`. Ereignisse gehen über den Anschluss (Tests ersetzen `dienst.kern.ereignis`),
  `systemkonten` und `automatisierungenVon` bleiben am Dienst (der Start und Tests setzen sie).
- Neuer Code ohne neue Einträge in `eslint-suppressions.json` (umgetragen: zwei `complexity`, zwei `max-params` in
  `post.dienst.ts`).

Mehr im Entwicklerhandbuch unter *Aufbau → Post*.
