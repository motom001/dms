# Sichten

Eine **Sicht** legt fest, was die Ablage links anbietet: welche Mappen eine Liste zeigt und wie die Sichten zu einem Baum geordnet sind. Eine Sicht ist eine gespeicherte Abfrage – die Benutzer sehen nur das Ergebnis.

Sichten pflegst du unter **Werkbank → Sichten**. Links steht der Baum, rechts die gewählte Sicht. Wie Benutzer mit Sichten arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/ablage/).

![Eine Sicht mit Bedingung in der Werkbank](bilder/werkbank-sichten.png)

Der Editor ist wie beim [Mappentyp](mappentypen.md#aufbau-des-editors) in Bereiche gegliedert: **Grunddaten → Mappentypen → Trefferliste → Bedingungen → Berechtigungen → Testlauf**. Jeder Bereich lässt sich einklappen und zeigt dann eine Kurzinfo, z. B. die Elternsicht, die Mappentypen oder „erbt von „Haus“ · 1 eigene Regel“. Eine neue Sicht ist ganz aufgeklappt, eine bestehende startet eingeklappt; dein Gerät merkt sich, was du aufklappst. Die Sprungleiste oben führt zu jedem Bereich und markiert Bereiche mit Fehler.

## Grunddaten

- **Name** und **Beschreibung** – erscheinen in der Ablage links bzw. über der Liste.
- **Liegt unter** – die Elternsicht im Baum, beliebig tief. Eine Sicht kann nicht unter sich selbst oder einer ihrer Untersichten liegen.
- **Reihenfolge** – mit **↑ nach oben** und **↓ nach unten** unter den Sichten derselben Ebene.

### Ordnen per Drag & Drop

Schneller geht es links im Baum: Jede Sicht hat einen **Griff ⠿**. Daran ziehst du sie

- **zwischen zwei Sichten** – eine Linie zeigt die Einfügestelle, auch auf einer anderen Ebene;
- **auf eine Sicht** – die Zielsicht wird umrandet, deine Sicht wird ihre **Untersicht**.

Untersichten wandern mit. Eine Sicht lässt sich nicht in ihre eigene Untersicht ziehen. Die neue Ordnung gilt **sofort**, ohne Speichern – auch in der Ablage. *Eingang*, *Favoriten* und *Papierkorb* stehen fest oben und sind keine Sichten in diesem Baum.

- **Tastatur:** Griff mit Tab ansteuern, dann **Alt+↑/↓** verschiebt innerhalb der Ebene, **Alt+→** macht die Sicht zur Untersicht der Sicht darüber, **Alt+←** hängt sie eine Ebene höher (hinter die bisherige Elternsicht).
- **Smartphone/Tablet:** Griff **lange antippen**, dann ziehen. Die Knöpfe ↑/↓ in der geöffneten Sicht gibt es weiterhin.
- **Esc** bricht das Ziehen ab.

## Mappentypen

Die Sicht zeigt Mappen der angehakten Typen, sofern sie alle Bedingungen erfüllen. Dazu kommen **immer** die Mappen ihrer Untersichten – jede mit ihren eigenen Bedingungen, ohne Doppelte.

- Eine Sicht **ohne Typ** dient nur zum Gruppieren, etwa *Finanzen* über *Offene Rechnungen* und *Zahlungen dieses Jahr*.
- Zeigt eine Sicht (mit Untersichten) **genau einen** Typ, verhält sich die Liste wie gewohnt: Trefferliste des Typs, Sortieren nach seinen Feldern, **+ Neu**, sofern neue Mappen erlaubt sind.
- Zeigt sie **mehrere** Typen, gibt es kein **+ Neu**; sortieren lässt sich nach den Systemspalten.

## Trefferliste

Welche Spalten die Liste zeigt, wählst du unter **Trefferliste**. Ein Mappentyp kann [mehrere Trefferlisten](mappentypen.md#trefferlisten) haben, eine davon ist Standard.

- **Ohne Auswahl** gilt die Standardliste des Typs.
- Bei **mehreren** Mappentypen gibt es nur Trefferlisten, die **alle** Typen haben (gleicher Schlüssel), und darin nur die **gemeinsamen** Spalten – Felder mit gleichem Schlüssel und Datentyp. *Titel* und *Typ* stehen dann immer vorn. Haben die Typen keinen gemeinsamen Standard, zeigt die Sicht die Systemspalten (Titel, Typ, angelegt, geändert).
- Gibt es die gewählte Liste nicht mehr (gelöscht oder ein Typ hinzugekommen, der sie nicht hat), zeigt die Sicht die **Standardliste**. In der Werkbank steht dann „Trefferliste fehlt – zeigt die Standardliste“.

## Bedingungen

Bedingungen gelten für die eigenen Mappentypen der Sicht und **alle zusammen** (UND). Unter jeder Bedingung steht, wie das DMS sie versteht, z. B. „Kündigung bis zwischen heute und heute + 12 Monate“. Unten zeigt die **Vorschau**, wie viele Mappen die Sicht mit dem aktuellen Entwurf zeigen würde – auch vor dem Speichern.

### Auf Feldwerte

| Datentyp | Vergleiche |
| --- | --- |
| Text | ist gleich (ohne Groß-/Kleinschreibung), enthält, ist leer, ist nicht leer |
| Langtext | enthält, ist leer, ist nicht leer |
| Zahl, Betrag | ist gleich, kleiner als, größer als, zwischen, außerhalb von, ist leer, ist nicht leer |
| Datum | wie Zahl, dazu **im Zeitraum** (Jahr oder Monat) |
| Ja/Nein | ja, nein (leer zählt als nein) |
| Auswahlliste | ist einer von, ist leer, ist nicht leer |
| Referenz | zeigt auf (eine oder mehrere bestimmte Mappen), ist leer, ist nicht leer |

Dazu die **Systemwerte**: *angelegt am* und *zuletzt geändert am* (wie Datum) sowie *angelegt von* und *zuletzt geändert von* (zeigt auf einen Benutzer).

Bei einer Sicht mit **mehreren** Mappentypen gibt es nur Felder, die alle Typen mit gleichem Schlüssel und gleichem Datentyp haben (bei Referenzen auch mit gleichem Ziel), und die Systemwerte.

### Dynamische Werte

Statt eines festen Werts kannst du einen nehmen, den das DMS bei **jedem Öffnen** neu berechnet:

| Wert | Wofür | Beispiel |
| --- | --- | --- |
| **heute ± n** Tage, Wochen, Monate, Jahre | Datumsfelder | Kündigung bis zwischen heute und heute + 3 Monate |
| **Jahr** / **Monat** (aktuell ± n), mit „im Zeitraum“ | Datumsfelder | Zahlungsdatum im Zeitraum aktuelles Jahr; Rechnungsdatum im letzten Monat (− 1) |
| **aktueller Benutzer** | Verweise auf Benutzer, angelegt/geändert von | Verantwortlich zeigt auf aktueller Benutzer → „Meine Verträge“ |
| **Rollen des aktuellen Benutzers** | Verweise auf Rollen | Verantwortliche Rolle zeigt auf Rollen des aktuellen Benutzers |

So kann **eine** Sicht „Meine Aufgaben“ für jeden Benutzer etwas anderes zeigen.

### Auf Anzahlen

Unter **Anzahl** gibt es – jeweils mehr als, weniger als oder genau *n*:

- **Dokumente insgesamt** – alle Dokumente der Mappe, egal in welchem Register. Beispiel: *Mappen ohne Dokument* = Dokumente insgesamt genau 0.
- **Verknüpfungen insgesamt** – wie viele andere Mappen auf diese verweisen, über alle Referenzfelder. Jede verweisende Mappe zählt einmal, auch wenn sie über mehrere Felder verweist; Verweise der Mappe auf sich selbst und Mappen im Papierkorb zählen nicht, E-Mails schon.
- **Dokumente in „…“** – Dokumente in einem bestimmten Dokumentenregister. Beispiel: *Rechnungen ohne Beleg* = Dokumente in „Rechnungsdokumente“ genau 0.
- **Verknüpfungen in „…“** – Mappen in einem Verknüpfungsregister, gezählt wie im Register (also nur über die dort gewählten Quellen). Beispiel: *Verträge ohne Rechnung* = Verknüpfungen in „Rechnungen“ genau 0.

Register stehen zur Wahl, wenn **alle** Mappentypen der Sicht ein Register mit **gleichem Schlüssel und gleicher Art** haben – bei einem Typ also alle seine Dokumenten- und Verknüpfungsregister. Bei mehreren Typen zählt jedes Register über die **eigenen** Quellen seines Typs; der Name erscheint als „Rechnungen / Belege“, wenn er sich je Typ unterscheidet.

### Fristen

- **hat Frist in den nächsten n Tagen** – Mappen, bei denen ein Datumsfeld in den nächsten n Tagen liegt: wahlweise ein bestimmtes Datumsfeld oder **alle Datumsfelder mit Erinnerung** (siehe [Fristen](mappentypen.md#fristen-erinnerungen-an-datumsfeldern)). Mit **nur meine** zählen nur Fristen, die der angemeldete Benutzer bekommt. So zeigt etwa *Verträge mit Frist im nächsten Quartal* (Vertrag + hat Frist in den nächsten 90 Tagen) genau die passenden Verträge.

### Persönlich

- **ist mein Favorit** – Mappen, die der **jeweils angemeldete** Benutzer mit dem Stern markiert hat. So zeigt etwa eine Sicht *Meine wichtigen Verträge* (Vertrag + ist mein Favorit) jedem seine eigenen. Die feste Sicht *Favoriten* in der Ablage gibt es für jeden ohnehin.

### Wenn sich ein Mappentyp ändert

Entfernst du ein Feld oder Register, auf das eine Bedingung zielt, wird die Sicht nicht leer: Die Bedingung wird **ignoriert**, bis du sie korrigierst. In der Werkbank ist sie rot markiert, und die Liste der Sichten zeigt „Bedingung ohne Wirkung – bitte prüfen“.

## Berechtigungen

Mit Berechtigungen legst du fest, **wer eine Sicht sieht**, **wer dort neue Mappen anlegen** und **wer aus ihr exportieren** kann – etwa damit die Sicht *Haus* mit allem darunter nur bei den Eltern im Baum erscheint.

| Recht | Bedeutung |
|---|---|
| **R** Sehen | Die Sicht erscheint im Baum der Ablage und lässt sich öffnen. |
| **C** Anlegen | In der Sicht gibt es „+ Neu“. Anlegen dürfen muss man zusätzlich am [Mappentyp](berechtigungen.md) – beide müssen es erlauben. |
| **E** Exportieren | Mappen der Sicht als Excel, CSV, ZIP mit Dokumenten oder PDF ausgeben – alles, was Daten aus dem DMS hinausgibt. Lesen muss man jede Mappe zusätzlich am Mappentyp. Außerhalb einer Sicht (erweiterte Suche, „Als PDF exportieren“ an der Mappe) darf eine Mappe hinaus, wenn sie in mindestens einer Sicht mit E läge. |

!!! info "Sichtregeln regeln die Sicht, nicht die Mappen"
    Ob jemand eine **Mappe** lesen darf, entscheiden allein die [Berechtigungen am Mappentyp](berechtigungen.md). Eine Mappe aus einer verborgenen Sicht kann also über die Suche, eine andere Sicht oder einen Link weiter auftauchen. Wer Mappen verbergen will, regelt das am Mappentyp. Für Administratoren gelten die Regeln an Sichten nicht.

- **Standard** – an einer Sicht auf oberster Ebene eine Zeile mit ✓/✗ je Recht; ohne Regeln dürfen alle alles.
- **Regeln** – wie am Mappentyp: *wenn* der Benutzer eine Rolle hat oder ein bestimmter Benutzer ist (jeweils auch mit *nicht*), *dann* ✓ erteilen oder ✗ entziehen; von oben nach unten, mit **Stopp**. Bedingungen auf Felder gibt es an Sichten nicht. Regeln lassen sich zuklappen und per Griff ⠿ sortieren.

### Vererbung an Untersichten

- Eine Untersicht **erbt** die Regeln ihrer Elternsicht und deren Eltern. Sie stehen oben unter **Geerbt**, schreibgeschützt und mit dem Namen der Sicht, von der sie kommen; ändern lassen sie sich nur dort.
- **Eigene Regeln** einer Untersicht können nur weiter **einschränken** (✗). Ein Recht gilt an der Untersicht nur, wenn es an der Elternsicht gilt **und** keine eigene Regel es entzieht. Einen eigenen Standard hat eine Untersicht nicht.
- **Ist eine Untersicht für jemanden verborgen, fehlen ihre Mappen auch in der Elternsicht**, und die Zahlen im Baum passen dazu.
- **Verschieben** (Ziehen im Baum oder *Liegt unter* ändern): Sofort gelten die Regeln der neuen Eltern. Das DMS sagt beim Ablegen, von wem die Sicht jetzt erbt. Wandert sie auf die oberste Ebene, entfallen die geerbten Regeln, und ihr eigener Standard gilt wieder.

### Testlauf

Unter den Berechtigungen prüfst du, was ein Benutzer an der Sicht darf – mit den Regeln, wie sie gerade im Editor stehen, auch ungespeichert und mit einer geänderten Elternsicht. Die Tabelle zeigt je Sicht der Kette, welche Regel zutraf und wie der Stand danach war.

### Beispiel: „Haus“ nur für die Eltern

1. Lege eine Rolle **Kinder** an und gib sie den Kindern.
2. Sicht *Haus* (oberste Ebene): Regel **Kinder sehen das nicht** – wenn *Benutzer hat Rolle Kinder* → ✗ R C E.
3. *Heizung*, *Garten* usw. unter *Haus* erben die Regel – für die Kinder fehlt der ganze Ast.
4. Sollen die Kinder etwa *Garten* doch sehen, lege *Garten* auf die oberste Ebene oder unter eine andere Sicht: Untersichten können nur einschränken.

## Sichten und Mappentypen

- Ein **neuer Mappentyp** bekommt eine eigene Sicht – außer du wählst beim Anlegen **Eigene Sicht in der Ablage anlegen** ab. Sie steht oben auf der ersten Ebene, vor *Benutzer* und *Rolle*.
- **Umbenennen** eines Typs benennt seine eigene Sicht mit, solange sie noch genauso heißt wie er.
- **Löschen** eines Typs entfernt ihn aus allen Sichten; eine Sicht, die nur ihn hatte und keine Untersichten, verschwindet mit.
- Die Sichten aus Version 0.9 und früher (eine je Mappentyp) wurden beim Update übernommen. Sie haben dieselbe Adresse wie vorher, Lesezeichen und gemerkte Sortierungen bleiben also gültig.

## Sicht löschen

**Sicht löschen** entfernt nur die Sicht, keine Mappen. Ihre Untersichten rücken eine Ebene nach oben, an ihre Stelle. Ohne Sicht sind Mappen weiter über den Eingang, Verweise und die Suche in anderen Sichten erreichbar.

!!! info "Sichten und Rechte"
    Eine Sicht gibt nie Zugriff auf Mappen, die ein Benutzer sonst nicht sehen dürfte. Im Moment sehen alle angemeldeten Benutzer alle Sichten; die Sichtbarkeit je Rolle kommt mit der Berechtigungsverwaltung.

!!! tip "Ohne Sicht auf Mappen zeigen"
    Dieselben Bedingungen gehen auch in einem [sprechenden Link](direktlinks.md), z. B. `/ablage/link?typ=Rechnung&bezahlt=nein` – ganz ohne Sicht einzurichten.
