# Fachbereiche des Servers { #fachbereiche }

Je Fachordner in `server/src/`: was er enthält, was er bekommt und wen er aufrufen darf. Die Reihenfolge der Schichten steht in der [Karte](aufbau.md#schichten).

## Kern (#961) { #kern }

`server/src/kern/` enthält, was **alle** Fachbereiche brauchen, mit einer Tür (`kern/index.ts`). Der Dienst baut ihn und reicht ihn als `dienst.kern` weiter; Bausteine wie die Pakete nehmen künftig nur den Kern statt des ganzen Dienstes.

- `kern.repo` – das Repo; in einer Transaktion des Kerns deren Repo. Bei jedem Aufruf neu holen, nie zwischenspeichern – sonst schreibt ein Paket neben der Transaktion vorbei.
- `kern.repoOhneTransaktion` – das Repo außerhalb jeder Transaktion (#1072, vorher `grundRepo` über Anschlüsse). Nur für das, was über Transaktionen hinweg gilt und nie zu einer Änderung gehört: Zwischenspeicher (Vektoren der Suche), den Ereignisverteiler, Nachläufe im Hintergrund.
- `inTransaktion`, `inEinemZug` (wiederholt bei Verklemmung), `danach`, `nachDerAntwort`, `inEigenerTransaktion()`.
- `ereignis(art, daten, von?)` in den Ausgangskorb, `mitAusloeser`, `ohneEreignisse`.
- `anlaesse` – die [Anschlusspunkte](#anschlusspunkte) für das Sofortige (#962, `kern/anlaesse.ts`).
- `system()` – Benutzer-, Rollen- und Post-Typ und die Systemrollen **nur nachschlagen** (#963; fehlt etwas, legt der Rückfall die [Systemausstattung](#systemausstattung) an), `typen()`, `zugriff(ich)`, `name(id)`, `papierkorbTage()`, `paketVerwehrt()`, `ablageortId()`, `liesGanz(sha)`.
- `historie.schreibe(…)` (`kern/historie.ts`) und `loeschprotokoll.schreibe(…)` (`kern/loeschprotokoll.ts`). **Lesen** bleibt bei Mappen bzw. Löschen.
- `einstellungen`, `dateien`, `stand`.

**Regel:** In den Kern kommt nur, was alle brauchen – Neues nur mit Begründung im Pull Request. Der Kern importiert nichts aus `dienst.ts`, Routen oder Fachordnern, nur `shared/` und die Basis (Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler); das prüft `npm run lint:abh` ([Regeln](stil.md#abhaengigkeiten-pruefen)). Der Dienst ist seit #1079 nur noch Zusammenbau: Routen, Module und Tests rufen die Fachdienste an seinen Feldern ([was bleibt](#dienst-rest)). Was der Kern nicht selbst bildet (den Zugriff – das ist [Rechte prüfen](#zugriff), eine Schicht darüber –, den Rückfall der Systemausstattung), bekommt er beim Zusammenbau vom Dienst.

### Systemausstattung (#963) { #systemausstattung }

`server/src/systemausstattung/` legt an, was jede Ablage braucht: die Systemtypen „Rolle“, „Benutzer“ und „Post“ mit Systemfeldern und Beschriftungen, die Systemrollen und die mitgelieferten Ansichten. Es ist ein Ablauf **über** den Fachbereichen: `sicherstellen()` ruft nacheinander Mappentypen (Typen und Rollen), Ansichten (eigene Ansicht eines eben angelegten Typs), Post (Ansichten der Post) und Ansichten („Favoriten“); die Schritte bekommt es beim Zusammenbau vom Dienst. Jeder Schritt legt nur an, was fehlt.

- **Beim Start** (`dienst.postSystemmappen.gleicheBenutzerAb`, nur der Leiter) und damit nach jeder Wiederherstellung, die neu startet.
- **Als Rückfall**: Findet `kern.system()` nicht alles, ruft es `systemausstattung.anlegen()` – für Wege ohne Start (Tests, Wiederherstellung, Demo entfernen). Gleichzeitige Aufrufe teilen sich einen Lauf.
- Wer nur Ids braucht, nimmt `kern.system()`; der Start ruft `dienst.systemausstattung.sicherstellen()`. Die Ids merkt sich der Kern nur, wenn er sie außerhalb einer Transaktion nachgeschlagen hat.

### Anschlusspunkte (#962) { #anschlusspunkte }

Was **sofort** zu einer Änderung gehört – in derselben Transaktion, ein Fehler rollt alles zurück –, läuft über die typisierten Anschlusspunkte in `server/src/kern/anlaesse.ts`: `kern.anlaesse.mappeGeaendert`, `typGeaendert`, `typAngelegt`, `benutzerGespiegelt`. Wer ändert, ruft `melde(…)`; was **später** geschehen darf (mindestens einmal, mit Wiederholung, Fehler nur im Protokoll), geht wie bisher mit `kern.ereignis(…)` in den Ausgangskorb.

- **Anmelden an einer Stelle:** `Dienst.schliesseEmpfaengerAn()` beim Zusammenbau, in fester Reihenfolge; danach ist die Liste zu. Eine andere Reihenfolge ist ein eigener Pull Request (Test `server/test/anlaesse.test.ts`).
- **Der Reihe nach:** Der `EventEmitter` dient nur als Liste der Empfänger; `melde()` wartet jeden mit `for … await` ab. `emit()` ist verboten und wirft.
- **Nur in einer Transaktion:** `melde()` wirft außerhalb von `inTransaktion`/`inEinemZug`. Ein Empfänger darf einen anderen Anlass melden (Tiefe höchstens 2), nie den, dessen Empfänger gerade läuft.
- **Empfänger** tun nur Datenbank-Arbeit über `kern.repo` und `kern.danach(…)` – bei einer Verklemmung wiederholt `inEinemZug` die ganze Änderung samt Empfängern. Keine Zwischenspeicher, Mails oder Dateien direkt.
- **Sofort** wurden nur die Empfänger, die vorher schon direkt gerufen wurden. Alles Neue geht in den Ausgangskorb.

Anlass → Empfänger (der Reihe nach; Fachbereich.Aufgabe):

<!-- anlaesse:anfang (erzeugt von server/test/anlaesse.test.ts) -->
- `mappeGeaendert` → 1. `mappentypen.passung` 2. `aufgaben.erwaehnungen` 3. `aufgaben.fristen` 4. `post.aufgaben`
- `typGeaendert` → 1. `sichten.umbenennen` 2. `sichten.teile` 3. `mappen.titel` 4. `mappentypen.passung` 5. `aufgaben.fristen`
- `typAngelegt` → 1. `sichten.eigeneSicht`
- `benutzerGespiegelt` → 1. `aufgaben.abwesenheit`
<!-- anlaesse:ende -->

## Suche (#964) { #suche }

Der erste Fachbereich mit eigener Fachlogik im Fachordner (Probelauf der Zielaufteilung): `server/src/suche/suche.dienst.ts` mit der Klasse `SucheDienst` – unscharfe Suche (Tippfehler, gleichbedeutende Wörter, Wörterverzeichnis), Vektoren zu Dokumenten und ähnliche Dokumente. Der Dienst baut ihn als `dienst.suche`; wer sucht, ruft ihn dort (auch `dienst.suche.vektorAnbieter`).

- **Tür:** `suche/index.ts`; die Routen (`suche.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, nicht den ganzen Dienst (für den Zwischenspeicher der Vektoren `kern.repoOhneTransaktion`), dazu die [Rechteprüfung](#zugriff) (`lesbare`, `pruefeRecht`) und einen `SucheAnschluss` mit `konten` (Dienstkonto eines Pakets).
- **Nur abwärts:** Die Suche (Schicht 3) importiert sich selbst, tiefere Fachordner und den Kern (je über `index.ts`), `shared/`, die Basis und `vektoren.ts` – geprüft mit der Regel `fachordner` ([Regeln](stil.md#abhaengigkeiten-pruefen)). `suche/vektoren.ts` (seit #1278 im Ordner) bindet selbst nichts ein und hat keine Tür (`OHNE_TUER`): Auch der Paket-Läufer liest damit die Vektoren eines Pakets und bindet die Datei direkt ein, nicht `suche/index.ts`.
- **Noch im Dienst:** die Suche in der Mappenliste (`listeMappen`). `vektorNachlauf` liegt seit #1078 bei den [Ereignissen](#ereignisse).

## Rechte prüfen (#1072) { #zugriff }

`server/src/zugriff/zugriff.dienst.ts` mit der Klasse `ZugriffDienst` prüft, wer was darf – an einer Stelle: `zugriff(ich)` einmal je Anfrage (Menschen nach den Regeln am Mappentyp, Dienstkonten der Pakete nach den bestätigten Rechten, Systemkonten nach ihrer Rolle, Leserechte auf Zeit), `rechteAn`, `rechteAnVielen`, `pruefeRecht`, `lesbare`, `mitPasswortRecht`, `sichtbarFuer`, `kannLesen`, `wasSieht`, `mappeVon`. Der Dienst baut ihn als `dienst.rechtepruefung`; Routen und Module rufen ihn dort.

- **Tür:** `zugriff/index.ts` (dazu `maskiert` und `NICHT_SICHTBAR` für Titel nicht lesbarer Mappen).
- **Bekommt den Kern** und einen `ZugriffAnschluss` vom Dienst: `kiSperre` (KI-Einstellung der Pakete) und `konten`.
- **Schicht 1:** importiert nur sich selbst, den Kern, `shared/`, die Basis und `messung.ts`. Fachordner darüber bekommen den `ZugriffDienst` beim Zusammenbau (wie die Suche) und importieren ihn über `zugriff/index.ts`. Der Kern bindet ihn nicht ein; `kern.zugriff(ich)` ruft, was der Dienst hereinreicht.
- `regulaerSichtbarFuer` liegt seit #1078 bei den [Aufgaben](#aufgaben) (`ohne-leserecht.ts`). Die Werkbank der Berechtigungen liegt seit #1076 in den [Berechtigungen](#berechtigungen). `paketSiehtNicht` liegt seit #1073 bei den [Mappentypen](#mappentypen) (`pakete-am-typ.ts`).

## Mappentypen (#1073) { #mappentypen }

`server/src/mappentypen/` (Schicht 2) bündelt, was einen Mappentyp ausmacht – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `mappentypen.dienst.ts` | `MappentypenDienst` (`dienst.mappentypen`) | `listeTypen`, `typenFuer`, `rechteUebersicht`, `legeTypAn`, `aendereTyp`, `loescheTyp`, `belegteTypen`, `ausDokumentVon`, `typErkennungen` |
| `eingabe.ts` | – | Eingaben bereinigen: `bereinigeTyp`, `bereinigeFeld`, `behalte…`, `liesStand` |
| `passung.ts` | `Passung` (`dienst.passung`) | `pruefePassung`, `passungFuer`, `pruefeUnpassende`, `passungNachziehen` |
| `nummernkreise.ts` | `Nummernkreise` (`dienst.nummernkreise`) | Nummernkreise (#171), `ARCHIV_KREIS` |
| `systemtypen.ts` | `Systemtypen` (`dienst.systemtypen`) | `sichereSystemtypen` (Schritt der [Systemausstattung](#systemausstattung)), `benutzerspiegel`, `weitereRollen`, `ablageortTyp`, Spur im Verwaltungsmodus |
| `pakete-am-typ.ts` | `TypPakete` (`dienst.typpakete`) | `paketeAmTyp`, `setzePaketVerwehrt`, `paketSiehtNicht` |

- **Tür:** `mappentypen/index.ts`; die Routen (`mappentypen.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, `TypPakete` und `Systemtypen` dazu die [Rechteprüfung](#zugriff), und je Klasse einen Anschluss für das, was noch im Dienst liegt (Stempel, Erkennung und Berechtigungen am Typ, Aufgaben, Titel, Aufträge, Systemmappen schreiben).
- `ausPostZiele` (#937) liegt seit #1078 in `mappentypen.dienst.ts`, die KI-Freigabe der Mappentypen (#796) in `ki-typen.ts` (`KiTypen`, `dienst.ki`). Den Stempel am Typ (`mitStempel`) rechnet seit #1077 der [Ausgang](#ausgang), Prüfen und Speichern die Stempel-Vorlagen in [PDF bearbeiten](#pdf-bearbeiten) – beides über den Anschluss. `berechtigungenAusEingabe` liegt seit #1076 in den [Berechtigungen](#berechtigungen) und kommt weiter über den Anschluss. `titel` liegt seit #1074 bei den [Mappen](#mappen) (`titel.ts`).

## Mappen (#1074) { #mappen }

`server/src/mappen/` (Schicht 2) bündelt, was eine einzelne Mappe ausmacht – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `mappen.dienst.ts` | `MappenDienst` (`dienst.mappen`) | `holeMappe`, `legeMappeAn`, `aendereMappe`, `verweisende`, `listeMappen`, `notizen`, `setzeFavorit`, `gesehen`, `persoenlicheEinstellungen` |
| `eingaben.ts` | `MappenEingaben` (`dienst.mappenEingaben`) | `pruefeWerte`, `unpassendeFormate`, Auswahlfilter, „folgt aus“ (`folgen`, `folgeVorschlaege`), `rechteVorschau`, `feldkonflikte`; `bereinigeWerte` |
| `titel.ts` | `MappenTitel` (`dienst.mappenTitel`) | `aktualisiereTitel`, `titelVorab`, `titelNachziehen` und weitere Wartung beim Start, `absenderBereinigen` |
| `historie.ts` | `MappenHistorie` (`dienst.mappenHistorie`) | `historie`, `notiereAbruf`, `historieTage`; `notiere` schreibt über `kern.historie` |
| `passwortfelder.ts` | `Passwortfelder` (`dienst.passwortfelder`) | `zeigePasswort`, `entschluesselePasswoerter`, `unlesbarePasswoerter` |
| `archiv.ts` | `MappenArchiv` (`dienst.mappenArchiv`) | Archivnummer (#345), Archivmodus (#212: `darfWeg`, `archivVorschau`), `pruefeDateien` |

- **Tür:** `mappen/index.ts`; die Routen (`mappen.routen.ts`) holt nur `routen.ts` direkt. Die Eingabe-Hilfen der Mappentypen bleiben in `mappentypen/eingabe.ts`.
- **Bekommt den Kern**, `MappenDienst`, `MappenEingaben` und `MappenArchiv` dazu die [Rechteprüfung](#zugriff), und je Klasse einen Anschluss für das, was noch im Dienst liegt oder über ihn kommt (Konten, Aufgaben ohne Leserecht, Archivfassung und PDF-Schutz aus den [Dokumenten](#dokumente), Datenschutz, `loeschPruefung`, `meldeVerknuepft`, Schlüssel, Aufkleber, Aufträge).
- **Sofortiges:** `legeMappeAn` und `aendereMappe` melden am Ende ihrer Transaktion `kern.anlaesse.mappeGeaendert` – die [Anschlusspunkte](#anschlusspunkte) und ihre Reihenfolge sind unverändert.
- Notizen schreiben liegt seit #1078 in `notizen.ts` (`MappenNotizen`, `dienst.mappenNotizen`; Erwähnungen und Übersetzungen über den Anschluss). Löschen und Papierkorb liegen in [Löschen](#loeschen), Aufgaben und Fristen in den [Aufgaben](#aufgaben), `meldeVerknuepft` bei den [Ereignissen](#ereignisse) – alle weiter über den Anschluss.

## Dokumente (#1075) { #dokumente }

`server/src/dokumente/` (Schicht 2) bündelt alles rund um die Dateien an einer Mappe – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`baueDokumente()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `dokumente.dienst.ts` | `DokumenteDienst` (`dienst.dokumente`) | `ladeHoch`, `loescheDokument`, `holeDokument`, `dokumentInhalt`, `textAusDatei`, Texterkennung und Vorschaubilder anbinden, `neueDateien`, `raeumeAuf`; `dateiname`, `erkenneAnzeigbar` |
| `versionen.ts` | `DokumentVersionen` (`dienst.dokumentVersionen`) | `ersetzeDokument`, `holeVersionZurueck`, `nachNeuerVersion`, `versionen`, `versionInhalt`, `beruehre` |
| `anlagen.ts` | `DokumentAnlagen` (`dienst.dokumentAnlagen`) | Anlagen (#998): `liste`, `haengeAn` („Als Anlage an … hängen“), `loese` („Zum eigenen Dokument machen“), `sortiere`, `benenne`, `alsAnlagen` (beim Teilen einer Post); das Mitwandern machen Repo (`verschiebeDokument`), `loescheDokument` und der Papierkorb |
| `umwandeln.ts` | `DokumentUmwandlung` (`dienst.dokumentUmwandlung`) | Dateien umwandeln (#577): `nachFassung`, `umwandelPaketDa`, `setzeFassung`, `fassungVon`, `umwandlungStand` |
| `archivfassung.ts` | `DokumentArchivfassung` (`dienst.dokumentArchiv`) | Archivfassung (#631): `archivNachVolltext`, `archivPaketDa`, `setzeArchivfassung`, `wortpositionen`, `seitenmasse` (#1445), `archivStand` |
| `geschuetzte-pdf.ts` | `GeschuetztePdfs` (`dienst.geschuetztePdfs`) | geschützte PDFs (#827): `entsperreDokument`, `nachEntsperren`, `mitPdfSchutz` |
| `fehlende-dateien.ts` | `FehlendeDateien` (`dienst.dateienFehlen`) | fehlende Dateien (#877): `merkeFehlendeDatei`, `fehlendeDateien`, `dokumenteOhneDatei`, `pruefeVorhanden` |

- **Tür:** `dokumente/index.ts`; die Routen (`dokumente.routen.ts`, seit #1278 mit den Teilen `dokumente-*.routen.ts`) holt nur `routen.ts` direkt. Die Technik der Fassungen (`dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`) bleibt außerhalb und ist für Fachordner ein Werkzeug (siehe [Schichten](aufbau.md#schichten)).
- **Bekommt den Kern** und die Teile dieses Ordners, die eine Klasse ruft, und je Klasse einen Anschluss für das, was noch im Dienst liegt oder im Kreis liefe (Ereignis und Titel – `kern.ereignis`, `mappenTitel` –, Archivmodus, Verkleinern, Volltext, Aufträge an Pakete, Paket-Einstellungen, Mappentypen, Texterkennung).
- **Reihenfolge:** `ladeHoch` schreibt Historie, „zuletzt geändert“, Dokument, Volltext und `dokument.hochgeladen` in einer Transaktion, Vorschau, Umwandeln und Entsperren laufen danach; `nachFassung`, `nachEntsperren`, `archivNachVolltext` und `nachNeuerVersion` sind unverändert und werden an denselben Stellen gerufen.
- `entsperrtZu` liegt seit #1078 in `geschuetzte-pdf.ts`. PDF bearbeiten, Verkleinern und Schwärzen liegen seit #1077 in [PDF bearbeiten](#pdf-bearbeiten). Den Volltext (`volltextFertig`, `volltextAn`) rufen die Dokumente seit #1076 über ihren Anschluss am Dienst im [Volltext](#volltext).

## Sichten (#1076) { #sichten }

`server/src/sichten/` (Schicht 3) bündelt die Ansichten der Ablage – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`baueSichtenUndVolltext()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `sichten.dienst.ts` | `SichtenDienst` (`dienst.sichten`) | `seite`, `trefferIds`, `zaehler`, `zaehlerRahmen`, `zaehlerAbruf` (#625), `ablageStand` (#919), `beiAenderung`, `aktualisiereStatistik`; die Zwischenspeicher der Zahlen, `sortierungAus` |
| `verwalten.ts` | `SichtenVerwaltung` (`dienst.sichtenVerwaltung`) | `listeSichten`, `verborgeneSichten` (#148), `sichtTestlauf`, anlegen, ändern (#917), löschen, ordnen, verschieben, `sichtVorschau`, `sichtFuerTyp`, `belegung` |
| `systemsichten.ts` | `Systemsichten` (`dienst.systemsichten`) | „Neue Post“, „Eingegangen“, „Versendet“ (#192), „Favoriten“ (#725) anlegen und nachschlagen |

- **Tür:** `sichten/index.ts`; die Routen (`sichten.routen.ts`) holt nur `routen.ts` direkt.
- **Bekommt den Kern**, `SichtenDienst` dazu die [Rechteprüfung](#zugriff), die [Mappen](#mappen) und die [Suche](#suche), und einen Anschluss für das, was noch im Dienst liegt (Gültigkeit der Zahlen – `mindestensMs` bleibt am Dienst –, Aufgaben ohne Empfänger und ohne Leserecht, Termine, Konten).
- **Zahlen:** Die Zwischenspeicher hängen an denselben Ständen wie bisher (Mappenstand bzw. Haushaltsstand, #742, #918); die Zwischenspeicher der Termine bleiben bei den Aufgaben im Dienst.
- **Sofortiges:** Die Empfänger `sichten.umbenennen` und `sichten.eigeneSicht` an den [Anschlusspunkten](#anschlusspunkte) meldet weiter der Dienst an, Reihenfolge unverändert; `sichten.teile` (#1031) nimmt einen Typ aus den Ansichten, wenn „Ist Teil einer anderen Mappe“ angeht, und gibt ihm seine Ansicht zurück, wenn sie ausgeht.
- **Teile (#1031, `shared/src/teile.ts`):** `klauselnFuer` lässt Teiltypen weg – so fehlen sie in jeder Ansicht und ihren Zahlen; die erweiterte Suche ebenso. Mit Suche sucht `SichtenDienst.seite` vorher in den Teiltypen (gleicher Begriff, gleiche Varianten, **gleicher Lesefilter**, höchstens `TEIL_TREFFER_MAX`) und gibt die übergeordneten Mappen als `auchIds` ans Repo: Sie zählen dort als Treffer, Typ, Bedingungen und Lesefilter gelten weiter. Die Fundstelle steht als `ausschnitte[id].teil`.
- **In der allgemeinen Suche zeigen (#1220, `inSuche` am Mappentyp, Migration 116):** `suchTypen()` in `sichten.dienst.ts` lässt Typen mit `inSuche: false` in der erweiterten Suche **ohne** gewählten Typ weg (das ist auch die Suche über die Kopfzeile, samt ähnlicher Treffer); mit gewähltem Typ zählen sie. `FragenAnDieAblage.ausschnitte` nimmt sie nie als Quelle. Ansichten, Auswahl- und Verweisfelder (`feld:`/`typ:`), API und Export bleiben unberührt. `null` = Vorgabe (ja); ein Paket-Update setzt `inSuche` nur, solange es `null` ist (`typAngabenNeu`).

## Berechtigungen (#1076) { #berechtigungen }

`server/src/berechtigungen/berechtigungen.dienst.ts` mit der Klasse `BerechtigungenDienst` (`dienst.berechtigungen`) ist die Werkbank der Berechtigungen (#123–#127): `berechtigungenListe`, `niemandLesbar`, `setzeBerechtigungen` (mit `pruefeBerechtigungen` und `protokolliereBerechtigungen`), `berechtigungenAusEingabe` (#142), `kopiereRegel`, `testlauf` (#125, #710, #798) und `laufwerkMappe` (#346). Was jemand darf, rechnet weiter die [Rechteprüfung](#zugriff).

- **Tür:** `berechtigungen/index.ts`; eigene Routen gibt es nicht.
- **Bekommt den Kern**, die Rechteprüfung und einen Anschluss mit den Konten.
- **Schicht 2:** braucht nur Kern und Rechteprüfung; die [Mappentypen](#mappentypen) (auch Schicht 2) prüfen damit die Regeln beim Speichern eines Typs – heute noch über ihren Anschluss am Dienst.

## Volltext (#1076) { #volltext }

`server/src/volltext/` (Schicht 3, über den [Dokumenten](#dokumente)):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `volltext.dienst.ts` | `VolltextDienst` (`dienst.volltexte`) | `beiVolltextFertig`, `volltextFertig`, `volltextAusgelassen` (#946), `volltextAn`, nachholen und neu erzeugen (#458), Texterkennung als Paket (#459), `nachEreignisAufruf`, `nachTexterkennungsEreignis`, `volltext`, `schreibeVolltext`, `setzeDokumentSprache`, `teilenHinweisAus`; `VOLLTEXT_MAX`, `VolltextMeldung`, `EreignisAufruf` |
| `aus-paketen.ts` | `VolltextAusPaketen` (`dienst.volltextAusPaketen`) | Volltext aus Paketen (#614): `volltextPaketDa`, `paketWegFuerDateien`, `pruefeVolltextRecht`, `nachVolltextEreignis` |

- **Tür:** `volltext/index.ts`. Wer für einen Dateityp zuständig ist, rechnet weiter `paketvolltext.ts` (Werkzeug, auch für die Dokumente).
- **Bekommt den Kern** und die Dokumente (Texterkennung, Umwandeln, Archivfassung), dazu einen Anschluss für Ereignis (`kern.ereignis`), Aufträge, `paketVolltext` und die Sicherung außer Haus.
- **Reihenfolge:** `volltextFertig` legt erst `volltext.fertig` in den Ausgangskorb, meldet dann die Archivfassung und ruft nur mit Text die Hörer (Erkennung) nacheinander; `nachTexterkennungsEreignis` verteilt wie bisher an Umwandeln, Archivfassung, Volltext aus Paketen und Sicherung.

## Post (#1077) { #post }

`server/src/post/` (Schicht 3) bündelt, was hereinkommt – je Thema eine Klasse, die den Kern bekommt; der Dienst baut sie (`bauePdfPostAusgang()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `post.dienst.ts` | `PostDienst` (`dienst.post`) | `legePostAn`, `ordneZu` (#192), `automatischZuordnen`, `automatikRueckgaengig` (#337), `postAufgaben` („Post für dich“ erledigen; anlegen tut sie seit #1001 die Automatisierung) |
| `aufloesen.ts` | `PostAufloesen` (`dienst.postAufloesen`) | Post auflösen und abtrennen (#934, #936): `loesePostAuf`, `trennePostAb`, `verschiebeInRegister` |
| `systemmappen.ts` | `PostSystemmappen` (`dienst.postSystemmappen`) | `schreibeSystemMappe`, `spiegleBenutzer`, `gleicheBenutzerAb`, Rollen, Systemkonten (#673); `SystemkontoEintrag` |
| `eingangskanaele.ts` | `Eingangskanaele` (`dienst.eingangskanaele`) | was Eingangsordner und Postfächer brauchen (#195, #196), gleiche Dateien und `fundstellen` (#333); `Fundstelle` |
| `foto.ts` | `PostFotos` (`dienst.postFotos`) | Post fotografieren (#490): `postAusFotos`, `fotosAnMappe`, `legePostZusammen` |
| `leerseiten.ts` | `PostLeerseiten` (`dienst.postLeerseiten`) | Leerseiten (#997): `lies`, `markiere` (nur Pakete mit `dms:leerseiten`), `waehleSeite` (nur Menschen); beim Übernehmen `plane` (vor dem Verschieben) und `lasseWeg` (neue Fassung, Original als frühere Version) |

- **Tür:** `post/index.ts`; die Routen der Postfächer (`post.routen.ts`) holt nur `routen.ts` direkt. `wandleZuPost` und `ergaenzeSystemfelder` liegen seit #1073 bei den [Mappentypen](#mappentypen).
- **Bekommt den Kern**, die [Rechteprüfung](#zugriff), [Mappentypen](#mappentypen), [Mappen](#mappen), [Dokumente](#dokumente) und die Teile dieses Ordners, `PostFotos` dazu [PDF bearbeiten](#pdf-bearbeiten). Über den Anschluss: Ereignis (`kern.ereignis`), `meldeVerknuepft`, Aufgaben, Konten, Passung, Systemausstattung, Mappen löschen und `sichereZuordnung` aus `erkennung.ts` (die Erkennung bekommt noch den ganzen Dienst und liegt darum nicht unter Schicht 3).
- **Reihenfolge:** `legePostAn` schreibt Mappe, Historie, Titel, `post.angelegt` und die Verknüpfungen in einer Transaktion (die Aufgabe „Post für dich“ legt seit #1001 danach die Automatisierung an – Wenn `mappe.geaendert` mit `angelegt`); der Empfänger `post.aufgaben` am Anschlusspunkt `mappeGeaendert` bleibt der letzte in der Reihe und ruft `post.postAufgaben`.

## Ausgang (#1077) { #ausgang }

`server/src/ausgang/` (Schicht 3) bündelt die [Wege nach draußen](nach-draussen.md#wege-nach-draussen), auf denen Dateien und Daten Ablago verlassen – Herunterladen, E-Mail, Export, WebDAV-Laufwerk – und ihre **gemeinsame Prüfstelle** (#723):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `pruefstelle.ts` | – | die Regel „R heißt ansehen, E heißt mitnehmen“ (früher `ausgang.ts`): `mitnehmbar`, `pruefeAlle`, Meldungen |
| `ausgang.dienst.ts` | `AusgangDienst` (`dienst.ausgang`) | `exportierbar` (#294), `mitnehmbar`, `pruefeAusgang`; Stempel (`mitStempel`, `stempelPlan`, `laufwerkStempel`, `laufwerkAusgabe`), `notiereWeitergabe`, Original oder Archivfassung, `dokumentFuerAusgabe`, `fassungFuerAusgabe`, `gestempelteSeiten` (#799) |
| `email.ts` | `AusgangEmail` (`dienst.ausgangEmail`) | `versendeMappen`, `versendeMappe` (#58, #151), `emailKopf` (auch für Auskünfte) |
| `export.ts` | `AusgangExport` (`dienst.ausgangExport`) | `exportiere` (#152, #153) |

- **Tür:** `ausgang/index.ts`; die Routen (`ausgang.routen.ts`) holt nur `routen.ts` direkt.
- **Eine Prüfstelle:** Jeder Weg fragt `dienst.ausgang.pruefeAusgang` bzw. `dienst.ausgang.mitnehmbar` – Routen (`http/routen-kontext.ts`, `sichten.routen.ts`), `webdav/webdav-basis.ts` und auch E-Mail und Export in diesem Ordner (über ihren Anschluss). `ausgang.test.ts` ersetzt die beiden an `dienst.ausgang` und prüft, dass Herunterladen, E-Mail (eine, mehrere), Export und Laufwerk sie fragen. Ein neuer Weg nach draußen fragt sie, bevor irgendetwas geschieht.
- **Bekommt den Kern**, die Rechteprüfung, Mappentypen, Mappen, Dokumente, die [Sichten](#sichten), die Stempel-Vorlagen ([PDF bearbeiten](#pdf-bearbeiten)) und – für die E-Mail – die Systemmappen der [Post](#post); `entsperrtZu` über den Anschluss.

## PDF bearbeiten (#1077) { #pdf-bearbeiten }

`server/src/pdf-bearbeiten/` (Schicht 3) ist die Fachlogik rund um PDFs; die [PDF-Stelle](pdf.md#pdf-stelle) `pdf/` mit pdf-lib bleibt Technik und unverändert:

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `pdf-bearbeiten.dienst.ts` | `PdfBearbeiten` (`dienst.pdfBearbeiten`) | Seitenbilder, `seiteAlsGraubild` (#338), `pdfSeiten`, `bearbeitePdf` (teilen, bei Post je Teil eine Post, #335), `fuegePdfZusammen` |
| `verkleinern.ts` | `PdfVerkleinern` (`dienst.pdfVerkleinern`) | PDF verkleinern (#393): Vorschau, am Dokument, automatisch, große Dokumente; `VERKLEINERN_STANDARD`, `GROSSE_MAX` |
| `schwaerzen.ts` | `Schwaerzen` (`dienst.schwaerzen`) | Schwärzen (#392, #459), Seitenbilder auch der Archivfassung (#934) |
| `stempelvorlagen.ts` | `Stempelvorlagen` (`dienst.stempelvorlagen`) | Stempel-Vorlagen und Stempel je Mappentyp (#394) |

- **Tür:** `pdf-bearbeiten/index.ts`; die Routen stehen bei den Dokumenten.
- **Warum ein eigener Ordner:** `pdf/` ist von der Regel `fachordner` ausgenommen (`TECHNIK`), läuft im Arbeiter-Pool und wird von den Dokumenten (Schicht 2) eingebunden. Klassen mit Kern, Mappen und Dokumenten dort hätten die Regel aufgeweicht und einen Kreis über `pdf/index.ts` gebaut.
- **Bekommt den Kern**, die Rechteprüfung, Mappen und Dokumente. Die Post (neue Post beim Teilen, Systemmappe, „Post für dich“) kommt über den Anschluss am Dienst – `post/` hängt Fotos mit `pdfVon` an, andersherum liefe es im Kreis.

## Ereignisse (#1078) { #ereignisse }

`server/src/ereignisse/` (**Schicht 2**) gibt weiter, was der Kern auslöst – den Ausgangskorb selbst (`kern.ereignis`) hat der Kern:

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `ereignisse.dienst.ts` | `EreignisseDienst` (`dienst.ereignisseDienst`) | `neueAufgabe`, `meldeVerknuepft` (#670), `ereignisAnPakete` (#686 nur mit Leserecht, #796 KI-Sperre), `auftrag`, `vektorNachlauf` (#442) |
| `automatisierung.ts` | `Automatisierungshilfen` (`dienst.automatisierungshilfen`) | `automatisierungKontext`, `mitgliederDerRolle`, `trifftTeile`, `lesbareTitel`, `datumVon`, `mappenMitDatum` (#674, #712) |

- **Warum Schicht 2:** Viele brauchen die Ereignisse, auch Mappen und Dokumente; selbst brauchen sie nur Kern, [Rechteprüfung](#zugriff) und die Pakete am Mappentyp samt KI-Freigabe ([Mappentypen](#mappentypen)). Texterkennung ([Volltext](#volltext)) und Rollen ([Post](#post)) kommen über den Anschluss.
- Den Abnehmer `pakete` meldet der Dienst beim Verteiler an; Ereignis auslösen (`kern.ereignis`) und der Wecker des Paket-Läufers (`ereignisWecker`) kommen über den Anschluss.
- **Tür:** `ereignisse/index.ts`, eingebunden als `ereignisse/index` – neben dem Ordner liegt `ereignisse.ts` (der Verteiler des Katalogs), wie bei `pakete/index`.

## Aufgaben (#1078) { #aufgaben }

`server/src/aufgaben/` (Schicht 3) bündelt alles rund um Aufgaben; der Dienst baut die Klassen (`baueAufgaben()`) und hält sie als Felder am Dienst; dort werden sie gerufen (#1079):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `aufgaben.dienst.ts` | `AufgabenDienst` (`dienst.aufgaben`) | `pruefeEmpfaenger`, Erwähnungen (#56, #81), Freigabe der Favoriten (#506), `aufgabeAusAutomatisierung` (#676, #724), `erledigeNachAnlass` |
| `vertretung.ts` | `AufgabenVertretung` (`dienst.vertretung`) | Vertretung (#78), vergeben, erledigen, weitergeben (auch gesammelt, #415), `abwesenheitGeaendert`, `meineAufgaben` |
| `ohne-leserecht.ts` | `OhneLeserecht` (`dienst.ohneLeserecht`) | Aufgaben bei Personen ohne Leserecht, Fälle, Leserecht auf Zeit (#798, #958) |
| `fristen.ts` | `Fristen` (`dienst.fristen`) | Fristen, Termine samt Zwischenspeicher, Folgetermin (#129–#133, #528, #725); der tägliche Lauf ruft die fälligen Mappen-Abläufe |
| `ohne-empfaenger.ts` | `OhneEmpfaenger` (`dienst.ohneEmpfaenger`) | Alltags-Benutzer (#719), Favoriten benachrichtigen (#422) |
| `ablaeufe.ts` | `MappenAblaeufe` (`dienst.ablaeufe`) | [Automatisierungsvorlagen und Mappen-Abläufe](ereignisse.md#ablaufvorlagen) (#1044): anwenden, geplante laufen lassen (Rechte zur Laufzeit), Werkbank, Vorlagen aus Paketen |

- **Bekommt den Kern** und `AufgabenTeile` (Rechteprüfung, Historie und Mappen, Ereignisse, Rollen der [Post](#post) und einander); über den Anschluss Ereignis (`kern.ereignis`), Konten und die Gültigkeit der Zahlen.
- Die Empfänger an den [Anschlusspunkten](#anschlusspunkte) sind unverändert; sie rufen `aufgaben.pruefeErwaehnungen`, `fristen.fristenAbgleichen` und `vertretung.abwesenheitGeaendert` erst beim Auslösen – Tests ersetzen sie dort.

## Löschen (#1078) { #loeschen }

`server/src/loeschen/` (Schicht 3); der Dienst baut die Klassen (`baueLoeschen()`):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `loeschen.dienst.ts` | `LoeschenDienst` (`dienst.loeschen`) | `loeschPruefung` (#79), `loescheMappe`, `loescheMappen` (#150), `entferneMappenEndgueltig` |
| `papierkorb.ts` | `Papierkorb` (`dienst.papierkorbVerwaltung`) | Papierkorb (#43, #344, #936): wiederherstellen, endgültig löschen, leeren, aufräumen |
| `loeschprotokoll.ts` | `LoeschprotokollVerwaltung` (`dienst.loeschprotokollVerwaltung`) | Löschprotokoll lesen und verwalten (#470); **geschrieben** wird im [Kern](#kern) |
| `mit-verknuepften.ts` | `MitVerknuepften` (`dienst.mitVerknuepften`) | [Baum](#baum-uber-verweise) und Löschen mit verknüpften Mappen (#396, #424) |
| `beispiele.ts` | `BeispielMappen` (`dienst.beispielMappen`) | Beispiel-Mappen aus Paketen (#878) |

- **Bekommt den Kern** und `LoeschenTeile` (Rechteprüfung, Passung, Historie, Dokumente, Ausgang, Sichten, Systemmappen und einander); Ereignis (`kern.ereignis`), `aktualisiereTitel` (`mappenTitel`) und Konten über den Anschluss.
- **Teile (#1031):** `loescheMappe` nimmt die Teile einer Mappe mit (`loescheMitTeilen`: R und D an jedem Teil, sonst 403 mit Anzahl; Papierkorb, Historie, Ereignisse und Löschprotokoll mit Weg `teile` in einer Transaktion, Vorgang = Id der Mappe). Der Papierkorb stellt sie mit ihr wieder her und löscht sie mit ihr endgültig; „mit verknüpften Mappen“ lehnt ab, wenn ein Teil einer gelöschten Mappe bliebe.

## Datenschutz (#1078) { #datenschutz }

`server/src/datenschutz/` (Schicht 3); der Dienst baut die Klassen (`baueDatenschutz()`):

| Datei | Klasse (im Dienst) | Inhalt |
|---|---|---|
| `datenschutz.dienst.ts` | `DatenschutzDienst` (`dienst.datenschutzDienst`) | Auskunft nach Art. 15 DSGVO (#396, #472, #668), Lasttest-Daten (#248) |
| `vollexport.ts` | `VollexportQuellen` (`dienst.vollexport`) | Datenquellen für Vollexport (#254) und persönlichen Export (#255) |
| `zustellen.ts` | `AuskunftZustellen` (`dienst.auskunftZustellen`) | E-Mail und Abruf-Links mit Abrufcode (#455), „Meine Daten exportieren“ |

- **Bekommt den Kern** und `DatenschutzTeile` (Rechteprüfung, Mappen, Dokumente, Sichten, Ereignisse, Aufgaben, Löschen und einander); Konten, Kurzzustand, Tresor und Export der Automatisierungen über den Anschluss.

## Werkbank (#1078) { #werkbank }

`server/src/werkbank/werkbank.dienst.ts` mit `WerkbankDienst` (`dienst.werkbank`, Schicht 3, nur der Kern): die Ansicht der Werkbank (#281, `werkbankAnsicht`, `setzeWerkbankAnsicht`) und die Merkmale der Ablage (#1032, `merkmale`, `setzeMerkmale`; Einstellung `merkmale`). Gelesen werden die Merkmale überall über `kern.merkmale()` – auch in `zugriff.aufloesung` für die Bedingungen von Rechten, Ansichten und Automatisierungen.

**Neue Seite in der Werkbank (#1281):** Alle Seiten stehen in einer Liste, `EINTRAEGE` in `shared/src/werkbankansicht.ts`. Was eine neue Seite braucht, steht als Checkliste unter [Neue Seite in der Werkbank](checklisten.md#neue-werkbank-seite).

**Anzeige-Bedingungen (#1033):** Die Auswertung steht in `shared/src/anzeige.ts` (`anzeigestand`, `pruefeMitAnzeige`) und gilt für Oberfläche und Server gleich – Pflicht prüfen `mappen/eingaben.ts` (Speichern) und `mappentypen/passung.ts` (Passung) damit, das Formular nutzt sie über `web/src/ablage/anzeige.ts`. Die Bedingungen bauen auf dem Baukasten der Ansichten (`sichten.ts`) auf; nichts außer der Anzeige im Formular hängt an ihnen.

## Was in dienst.ts bleibt (#1078, #1079) { #dienst-rest }

Seit #1079 enthält `dienst.ts` keine Weiterleitungen mehr, nur den Zusammenbau: die Felder der Klassen, den Konstruktor mit den `baue…()`-Methoden, `schliesseEmpfaengerAn()`, die `verbinde…`-Methoden, die Felder, die der Start oder Tests setzen (`mindestensMs`, `sicherungAufgegeben`, `systemkonten`, `ereignisWecker` …), den Verteiler der Ereignisse und den Tresor (`schluesselWechseln`, `verschluesselePaketGeheimnis`, `entschluessele`).

Routen, Module und Tests rufen die Fachdienste an den Feldern des Dienstes (`dienst.mappen.holeMappe(…)`, `dienst.kern.ereignis(…)`, `dienst.ausgang.pruefeAusgang(…)`); Konstanten, Hilfen und Typen holen sie aus der `index.ts` des Fachordners, nicht über `dienst.ts`. Die Rechteprüfung bleibt, wo sie war: in den Fachdiensten und in den Hüllen der Routen (`dokumentRecht`, `maskiere` …). Eine Weiterleitung ist geblieben: `listeDokumente` liest die Dokumente einer Mappe am Repo vorbei, ohne Rechteprüfung (Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren) – das Repo gehört nicht in die Routen. Wer Neues baut, ruft den Fachdienst direkt und legt keine neue Weiterleitung an.

## Baum über Verweise

Alles, was über Verweise an einer Mappe hängt, sammelt **ein** Modul – genutzt von der Auskunft nach Art. 15 DSGVO (#396) und von „Mappe mit allen verknüpften Mappen löschen“ (#424). Neue Funktionen, die „alles zu dieser Mappe“ brauchen, nehmen es statt eigener Schleifen.

- **Typen und Optionen:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = Mappen, die auf den Knoten verweisen, „nach unten“; `verweistAuf` = Mappen, auf die er verweist; `tiefe` 1–10; `max` bis 5000; `seitwaerts`; `ohneTypen`; `nurZugehoerigkeit`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, Hilfen `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithmus:** `server/src/loeschen/baum.ts` – `sammleBaum(quelle, startId, optionen)`: Breitensuche, je Ebene ein Zugriff auf Verweise (`Repo.kantenVon`), Mappen und Lesbarkeit. Ohne `seitwaerts` geht ein Knoten nur in der Richtung weiter, über die er erreicht wurde (die Start-Mappe in alle gewählten). Kreise und mehrfache Wege landen in `auchUeber` und `kreise`, jeder Knoten steht einmal da. Über `max` hinaus: `abgeschnitten`. Mit `nurZugehoerigkeit` geht es nur über Verweisfelder der Art Zugehörigkeit weiter (`verweisartVon(typ, feldKey)`, Standard Bezug); Knoten, die nur über Bezug dranhängen, sind Blätter mit `nurBezug` – erreicht die Suche sie später über eine Zugehörigkeit, werden sie dort eingehängt und weiterverfolgt (innerhalb einer Ebene haben Zugehörigkeiten Vorrang).
- **Rechte:** Die `BaumQuelle` baut `MitVerknuepften.baumQuelle(zugriff)`; nur lesbare Mappen werden aufgenommen **und** weiterverfolgt, nicht lesbare zählen nur in `verborgen`. Zum Aufrufen: `await dienst.mitVerknuepften.baum(startId, eingabe, zugriff)` (Benutzer und Rollen sind ohne `ohneTypen` ausgenommen), über HTTP `GET /api/v1/mappen/{id}/baum`.
- **Je Knoten:** `typ`, `titel`, `ebene`, `ueber` (Elternknoten, Richtung, Feld, `verweisart`), `nurBezug`, `dokumente`, `aussen` (Verweise zu Mappen außerhalb des Baums je Richtung, nicht lesbare ohne Titel), `aufbewahrenBis`/`gesperrt` (Archivmodus #212) und `rechte` (CRUDP des Aufrufers).

Die Auskunft (`DatenschutzDienst.auskunftVorschau`) und das Löschen sammeln beide mit `nurZugehoerigkeit` (#472, #424): Bezug-Knoten gehen bei der Auskunft nur als Erwähnung hinaus (`AuskunftAuswahl.erwaehnungen`, `erwaehnungText` in `shared/src/auskunft.ts`), beim Löschen wird nur ihr Verweis entfernt. Volltext-Vorschläge gibt es bei der Auskunft nicht (mehr).

Tests: `server/test/auskunft.test.ts` (Kreise, Rechte, Obergrenze, seitwärts, Zugehörigkeit/Bezug).

### Mit verknüpften Mappen löschen (#424)

- **Vorschau und Plan** (reine Funktionen, Server und Oberfläche): `shared/src/loeschbaum.ts`. `MitVerknuepften.loeschVorschau(startId, { tiefe, max }, zugriff)` sammelt den Baum nur `verwiesenVon` mit `nurZugehoerigkeit` (Standardtiefe 5) und ergänzt `kanten` (alle Verweise zwischen Knoten, nicht nur die Baumwege), `geteilt` und `nichtLoeschbar`. Kennzeichen (`kennzeichen(v, k)`): 🔒 = `gesperrt`, 📎 = `nurBezug` (wird nie gelöscht, `loeschen` gilt als `entkoppeln`), ⛔ = `!rechte.D` oder `nichtLoeschbar`, 🔗 = `geteilt` – enger als `haengtAuchAnderswo(k)`: zählt nur Verweise der Art Zugehörigkeit nach außen über ein Feld, über das der Knoten im Baum hängt, oder auf eine Mappe desselben Typs wie im Baum; Verweise auf Stammdaten (Ablageort, Kategorie) und Benutzer zählen nicht, sonst wäre fast alles 🔗.
- **Plan:** `planeLoeschung(vorschau, auswahl)` – Auswahl je Id `loeschen | entkoppeln | behalten` (fehlende Ids bleiben). Fixpunkt: Eine Mappe bleibt, wenn `wirdAnderswoGebraucht(k)` oder eine bleibende Mappe im Baum ohne `entkoppeln` auf sie verweist. Gesperrte Mappen werden nie entkoppelt.
- **Ausführen:** `MitVerknuepften.loescheMitVerknuepften` sammelt neu, plant, prüft jede Mappe wie beim einzelnen Löschen (`loeschPruefung` mit allen Rückverweisen), kappt die Verweise (`entkoppeln`, Recht U) und legt alles mit `Repo.legeVorgangInPapierkorb` in **einer** Transaktion in den Papierkorb (Verweise untereinander zuerst – so gehen auch Kreise). Spalten `papierkorb.vorgang` und `papierkorb.entkoppelt` (Migration 042). `stelleVorgangWiederHer` bzw. `Repo.stelleMehrereWiederHer` legen erst alle Mappen, dann die Verweise an und setzen die entkoppelten Verweise wieder. Tests: `server/test/loeschbaum.test.ts`.

## Mappen schreiben, auch gleichzeitig (#609) { #mappen-schreiben }

Wer zuletzt speichert, darf keine Felder zurücksetzen, die er nicht angefasst hat. Deshalb gilt für **jeden** Schreiber von Mappenwerten:

- **Nur Geändertes schreiben.** `Repo.aendereMappe(id, werte, [], von, { basis, verweise })` legt nur die Felder auf den aktuellen Stand, die sich gegenüber `basis` (den gelesenen Werten) ändern – unter Sperre der Zeile (`SELECT … FOR UPDATE`) bzw. im Arbeitsspeicher genauso (`feldweise` in `server/src/repo/index.ts`). `verweise(w)` berechnet die Verweise aus dem Ergebnis. Interne Schreiber (`schreibeSystemMappe`, `schreibeVerweisWerte`, `absenderBereinigen`, Umbenennen von Feldern) nutzen das; `schreibeSystemMappe` bekommt außerdem nur die zu ändernden Felder, nie `{ ...mappe.werte, … }` aus einem älteren Lesen.
- **Stand.** `mappen.geaendert` ist auf die Millisekunde genau und steigt bei jedem Schreiben (`greatest(clock_timestamp(), geaendert + 1 ms)`), damit er als Versionszähler taugt; keine Migration nötig. Mit `stand` schreibt das Repo nur, wenn die Zeile noch diesen Stand hat, sonst `StandVeraltet` – `MappenDienst.aendereMappe` liest dann neu und versucht es bis zu fünfmal.
- **Konflikt.** `MappenDienst.aendereMappe(id, { werte, stand })`: Weicht `stand` vom aktuellen ab, sucht `feldkonflikte` in der Historie die Einträge `geaendert` mit `daten.stand` > `stand` (jeder Eintrag merkt sich den Stand, den sein Schreiben erzeugt hat). Ein übergebenes Feld, das dort vorkommt und jetzt anders lauten soll, ergibt 409 mit `Mappenkonflikt` (`shared/src/model/historie.ts`). Ohne `stand` keine Prüfung, nur feldweises Schreiben – so bleiben alte API-Aufrufe gültig.
- **Formular.** `MappeFormular` schickt nur die Felder, deren Rohwert von `basis` abweicht, und `stand` = `mappe.geaendert` beim Laden von `basis`. Bei 409 zeigt `Konfliktfrage` je Feld die Wahl; „Meins“ geht mit dem neuen Stand aus der Antwort noch einmal mit, „Seins“ übernimmt den Wert und bleibt weg.

Tests: `server/test/gleichzeitig.test.ts` (Arbeitsspeicher und PostgreSQL), im Browser `docs/handbuch/screenshots/gleichzeitig-pruefen.mjs` (zwei Fenster, Workflow „Handbuch“).

## Systemkonten und Kontorollen (#673) { #systemkonten }

Neben Menschen (`benutzer.art = 'person'`) gibt es zwei Arten von Konten, die sich nie anmelden:

| Art | Beispiel | Systemrolle | Rechte an Mappen |
|---|---|---|---|
| `dienst` (#338) | „Paket Texterkennung“, je Paket mit Code eines | **Paket** (`rolle:paket`) | bestätigte Rechte aus dem Manifest, eingeschränkt durch Regeln für die Rolle Paket |
| `system` (#673) | „Automatisierung“ (`systemkonto = 'automatisierung'`) | **Systemkonto** (`rolle:systemkonto`) | alles außer `P`, eingeschränkt durch Regeln für die Rolle Systemkonto |

- **Anlegen:** `Konten.systemkonto(kennung)` beim Start (`ablago.ts`), idempotent; in PostgreSQL schützt der Index `benutzer_systemkonto` vor einem zweiten Konto, auch bei zwei Servern (Migration 059).
- **Nie benutzbar:** `holeHash`, `listeBenutzer`, `anzahlBenutzer` sehen nur Menschen; `benutzerZu` (Sitzung) und `benutzerMitId` (API-Schlüssel) lehnen Systemkonten ab; Benutzerverwaltung und „Als Benutzer anmelden“ kennen sie nicht (`person()`). `personen()` liefert sie nur für Namen (`aktiv: false`, `art`).
- **Rollen:** Die Rollen-Mappen `rolle:systemkonto` und `rolle:paket` legt die [Systemausstattung](#systemausstattung) an (`kontorollen` in `kern.system()`). `listeRollen()` liefert sie nur mit `mitKonten`, `pruefeRollen()` lehnt sie ab.
- **Zugriff:** `ZugriffDienst.zugriff(konto)` setzt `wer.rollen = [Kontorolle]` und schneidet die Mappentypen mit `kontoRegelwerk(typ, rolleId)` (`shared/src/rechte.ts`) zu: Grundeinstellung „alles“, nur Regeln, die die Rolle nennen (`nenntRolle`). So sperrt ein strenger Standard für Mitglieder keine Automatisierung aus, ein Administrator kann aber gezielt einschränken. Für Pakete wird das Ergebnis mit den bestätigten Rechten geschnitten. `PostSystemmappen.systemZugriff('automatisierung')` liefert den Zugriff des Systemkontos (für den Motor der Automatisierungen, #674).
- **Werkbank:** Systemkonten sind nie `admin`; welche Werkbank-Aktionen eine Karte darf, entscheidet die Karte selbst (#677).
- **Oberfläche:** Werkbank → Benutzer, Abschnitt „Systemkonten“ (`GET /api/benutzer/systemkonten`, nur Administratoren).

## Passkeys (#811) { #passkeys }

Anmeldung mit WebAuthn – als eigener Weg, als zweiter Faktor und für die erneute Anmeldung (#819). Die Kryptografie (CBOR, COSE-Schlüssel, Signaturen, Zähler) prüft `@simplewebauthn/server` in fester Version ([Abhängigkeiten](abhaengigkeiten.md#abhaengigkeiten)); im Browser nimmt Ablago die eingebaute Schnittstelle `navigator.credentials` ohne Bibliothek (`web/src/passkey.ts`).

- **Wo:** `server/src/anmeldung/passkeys.ts` (Klasse `Passkeys`, neben `zweifaktor.ts`), angebunden an `Konten` mit `verbindePasskeys` wie die Zwei-Faktor-Anmeldung. Die Pflicht je Rolle nutzt dieselbe `RollenPflicht` wie die Zwei-Faktor-Anmeldung (Schlüssel `passkey_pflicht`, `passkey_pflicht_seit`). Routen in `anmeldung/anmeldung.routen.ts`.
- **RP-ID und Origin** aus `betrieb.adresseFuerLinks()` (gepflegte Adresse, sonst die der Anfrage): nur `https://` mit einem Namen oder `http://localhost` (`relyingParty`). Jeder Passkey merkt sich seine RP-ID; passt sie nicht zur aktuellen Adresse, gilt er nicht (`passt: false` in der Liste).
- **Herausforderung** im [Kurzzustand](server.md#kurzzustand): beim Hinzufügen je Konto (`passkey-neu`), beim Anmelden unter dem Hash einer zufälligen Kennung (`passkey-anmeldung`), mit Zweck (`anmelden`, `zweiter-schritt`, `bestaetigen`, `dokumentpasswoerter`) und – außer beim Anmelden ohne E-Mail-Adresse – dem Konto. 5 Minuten, `nimm` löst sie einmal ein, auch bei Fehlern. Höchstens 2000 offene.
- **Prüfung:** `userVerification: 'required'` beim Anlegen und Anmelden, Attestation `none`, Origin und RP-ID aus der Herausforderung, Zähler muss steigen (sonst Warnung „womöglich kopiert“). Der Zähler wird mit `Einstellungen.tausche` gespeichert.
- **Gespeichert** in den Einstellungen unter `passkeys_<Konto>`: `{ liste: [{ nr, id, oeffentlich, zaehler, name, rpId, erstellt, zuletzt, transports, mehrgeraete }] }` – nur Öffentliches, darum Teil der Sicherung und unverändert durch `ohneGeheimnisse`. `nr` ist Ablagos eigene Kennung für Routen und Oberfläche; die Kennung des Authenticators verlässt den Server nur in `allowCredentials`/`excludeCredentials`. `userID` beim Anlegen ist die Konto-Id (keine E-Mail-Adresse); daran findet die Anmeldung ohne E-Mail-Adresse das Konto.
- **Entscheidungen nur nach der gepflegten Adresse** (Sicherheitsdurchsicht): `pflichtRp()`/`fuerPflicht()` lesen `betrieb.gepflegteAdresse()`, nie die Adresse der Anfrage. Die Passkey-Pflicht lässt sich nur mit gepflegter HTTPS-Adresse einschalten (409); fehlt sie später, gilt die Pflicht geschlossen weiter. Ist die Pflicht an und die Person hat Passkeys, aber keinen für die gepflegte Adresse bzw. läuft die Anfrage über eine andere, verlangt `zweiteWege` den Code oder antwortet 409.
- **Grenzen:** Herausforderungen ohne Konto (`passkey-anmeldung-offen`) je Adressbereich (`adressbereich`: IPv4 bzw. IPv6-/64) höchstens `PASSKEY_OPTIONEN_JE_ADRESSE` in 5 Minuten (Zähler `passkey-optionen-adresse`), dazu die Notbremse `PASSKEY_OPTIONEN_GESAMT` (`grenzen.ts`); zweiter Schritt und Bestätigungen (`passkey-anmeldung`) zählen nicht mit.
- **Pflichten:** Ein Passkey für die gepflegte Adresse erfüllt auch die Zwei-Faktor-Pflicht (`Zweifaktor.alternative`, verbunden von `Konten`); dann verlangt `zweiteWege` ihn beim Anmelden mit Passwort, und `passkeyNoetig` sperrt das Entfernen des letzten. Die Passkey-Pflicht bleibt eigenständig.
- **Zwecke:** `bestaetigen` für Verwaltungsmodus und heikle Handlungen, `dokumentpasswoerter` für „Passwörter für Dokumente“ (`POST …/passkeys/bestaetigen/optionen` mit `{ fuer: 'dokumentpasswoerter' }`, dann `POST /api/konto/dokument-passwoerter/bestaetigen` mit `{ passkey }`) – eine Herausforderung gilt nur für ihren Zweck.
- **Anmeldeschutz:** `Konten.anmeldenMitPasskey` zählt vorab mit `sperre.versuch` (E-Mail des genannten Kontos, sonst leer, und IP), ein Fehlschlag mit `fehlschlag`, ein Erfolg setzt zurück – wie beim Passwort (#956).

| Route | Zugang | Wozu |
| --- | --- | --- |
| `POST /api/konto/passkey/optionen` | offen | `{ zweiterSchritt? }` → `{ kennung, optionen }` (Request-Optionen im JSON-Format von WebAuthn) |
| `POST /api/konto/passkey/anmelden` | offen | `{ kennung, antwort, zweiterSchritt? }` → Sitzung |
| `GET /api/konto/passkeys` | angemeldet | eigene Passkeys, `moeglich`, `adresse` (RP-ID), `pflicht`, `hoechstens` |
| `POST /api/konto/passkeys/beginnen` | angemeldet | Creation-Optionen |
| `POST /api/konto/passkeys` | angemeldet | `{ antwort, name }` → neuer Passkey (201) |
| `PUT /api/konto/passkeys/:nr` | angemeldet | `{ name }` umbenennen |
| `DELETE /api/konto/passkeys/:nr` | angemeldet | entfernen – nur mit frischer Anmeldung (sonst 403 mit `details.frisch`) |
| `POST /api/konto/passkeys/bestaetigen/optionen` | angemeldet | Optionen für die erneute Anmeldung; danach `POST /api/konto/verwaltung` bzw. `…/verwaltung/bestaetigen` mit `{ passkey: { kennung, antwort } }` |
| `GET`/`PUT /api/werkbank/passkeys` | Werkbank (Anmeldeschutz) | Pflicht je Rolle `{ admin, mitglied }`, dazu `moeglich` |
| `GET /api/benutzer/:id/passkeys`, `POST …/zuruecksetzen` | Werkbank (Benutzer) | Anzahl, alle entfernen (auch `dms passkeys-zuruecksetzen`) |

`POST /api/konto/anmelden` und `…/passwort-setzen` liefern beim zweiten Schritt zusätzlich `wege: { code, passkey }`; nach dem Anbieter steht das als `#<kennung>.<c|p>` in der Adresse von `/anmelden/code`. `/api/konto/status` nennt `passkey: { moeglich, aktiv?, fehlt?, ausstehend? }`, der Verwaltungsstand `passkey`.

**Tests:** `server/test/passkeys.test.ts` mit einem nachgebildeten Authenticator (`server/test/hilfen-authenticator.ts`: P-256, Attestation `none`, kleines CBOR) – Hinzufügen, Anmelden, falscher Origin, wiederverwendete Herausforderung, Zähler rückwärts, ohne Nutzer-Verifizierung, Anmeldeschutz, Entfernen ohne frische Anmeldung, Pflicht, Adresse geändert, Verwaltungsmodus. Der Rauchtest legt im Chromium mit einem virtuellen Authenticator (DevTools-Protokoll) einen Passkey an und meldet sich damit an.
