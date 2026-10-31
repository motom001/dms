# Ansichten

Eine **Ansicht** legt fest, was die Ablage links anbietet: welche Mappen eine Liste zeigt und wie die Ansichten zu einem Baum geordnet sind. Eine Ansicht ist eine gespeicherte Abfrage – die Benutzer sehen nur das Ergebnis.

Ansichten pflegst du unter **Werkbank → Ansichten**. Links steht der Baum, rechts die gewählte Ansicht. Wie Benutzer mit Ansichten arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/ablage/).

![Eine Ansicht mit Bedingung in der Werkbank](bilder/werkbank-sichten.png)

Der Editor ist wie beim [Mappentyp](mappentypen.md#aufbau-des-editors) in Bereiche gegliedert: **Grunddaten → Mappentypen → Trefferliste → Bedingungen → Berechtigungen → Testlauf**. Jeder Bereich lässt sich einklappen und zeigt dann eine Kurzinfo, z. B. die Elternansicht, die Mappentypen oder „erbt von „Haus“ · 1 eigene Regel“. Eine neue Ansicht ist ganz aufgeklappt, eine bestehende startet eingeklappt; dein Gerät merkt sich, was du aufklappst. Die Sprungleiste oben führt zu jedem Bereich und markiert Bereiche mit Fehler.

## Grunddaten

- **Name** und **Beschreibung** – erscheinen in der Ablage links bzw. über der Liste.
- **Liegt unter** – die Elternansicht im Baum, beliebig tief. Eine Ansicht kann nicht unter sich selbst oder einer ihrer Unteransichten liegen.
- **Reihenfolge** – mit **↑ nach oben** und **↓ nach unten** unter den Ansichten derselben Ebene.

### Ordnen per Drag & Drop

Schneller geht es links im Baum: Jede Ansicht hat einen **Griff ⠿**. Daran ziehst du sie

- **zwischen zwei Ansichten** – eine Linie zeigt die Einfügestelle, auch auf einer anderen Ebene;
- **auf eine Ansicht** – die Zielansicht wird umrandet, deine Ansicht wird ihre **Unteransicht**.

Unteransichten wandern mit. Eine Ansicht lässt sich nicht in ihre eigene Unteransicht ziehen. Die neue Ordnung gilt **sofort**, ohne Speichern – auch in der Ablage. Die festen Einträge oben – *Erweiterte Suche*, *Zu erledigen*, *Anstehend*, *Favoriten* und *Papierkorb* (nur, solange er an ist oder etwas darin liegt) – sind keine Ansichten in diesem Baum.

- **Tastatur:** Griff mit Tab ansteuern, dann **Alt+↑/↓** verschiebt innerhalb der Ebene, **Alt+→** macht die Ansicht zur Unteransicht der Ansicht darüber, **Alt+←** hängt sie eine Ebene höher (hinter die bisherige Elternansicht).
- **Smartphone/Tablet:** Griff **lange antippen**, dann ziehen. Die Knöpfe ↑/↓ in der geöffneten Ansicht gibt es weiterhin.
- **Esc** bricht das Ziehen ab.

## Mappentypen

Die Ansicht zeigt Mappen der angehakten Mappentypen, sofern sie alle Bedingungen erfüllen. Dazu kommen **immer** die Mappen ihrer Unteransichten – jede mit ihren eigenen Bedingungen, ohne Doppelte.

- Eine Ansicht **ohne Mappentyp** dient nur zum Gruppieren, etwa *Finanzen* über *Offene Rechnungen* und *Zahlungen dieses Jahr*.
- Zeigt eine Ansicht (mit Unteransichten) **genau einen** Mappentyp, verhält sich die Liste wie gewohnt: Trefferliste des Mappentyps, Sortieren nach seinen Feldern und **+ Neu**. Den Knopf gibt es nur, wenn der Benutzer das Recht **C** (Anlegen) am Mappentyp ([Berechtigungen](berechtigungen.md)) **und** an der Ansicht ([Berechtigungen](#berechtigungen)) hat. In Ansichten mit Post heißt er **+ Post**.
- Zeigt sie **mehrere** Mappentypen, gibt es kein **+ Neu**; sortieren lässt sich nach den Systemspalten.

## Trefferliste

Welche Spalten die Liste zeigt, wählst du unter **Trefferliste**. Ein Mappentyp kann [mehrere Trefferlisten](mappentypen.md#trefferlisten) haben, eine davon ist Standard.

- **Ohne Auswahl** gilt die Standardliste des Mappentyps.
- Bei **mehreren** Mappentypen gibt es nur Trefferlisten, die **alle** Mappentypen haben (gleiche Kennung), und darin nur die **gemeinsamen** Spalten – Felder mit gleicher Kennung und Feldart. *Titel* und *Mappentyp* stehen dann immer vorn. Haben die Mappentypen keinen gemeinsamen Standard, zeigt die Ansicht die Systemspalten (Titel, Mappentyp, angelegt, geändert).
- Gibt es die gewählte Liste nicht mehr (gelöscht oder ein Mappentyp hinzugekommen, der sie nicht hat), zeigt die Ansicht die **Standardliste**. In der Werkbank steht dann „Trefferliste fehlt – zeigt die Standardliste“.

## Bedingungen

Bedingungen gelten für die eigenen Mappentypen der Ansicht und **alle zusammen** (UND). Unter jeder Bedingung steht, wie das DMS sie versteht, z. B. „Kündigung bis zwischen heute und heute + 12 Monate“. Unten zeigt die **Vorschau**, wie viele Mappen die Ansicht mit dem aktuellen Entwurf zeigen würde – auch vor dem Speichern.

### Auf Feldwerte

| Feldart | Vergleiche |
| --- | --- |
| Text | ist gleich (ohne Groß-/Kleinschreibung), enthält, ist leer, ist nicht leer |
| Langtext, formatierter Text | enthält, ist leer, ist nicht leer |
| Zahl, Betrag | ist gleich, kleiner als, größer als, zwischen, außerhalb von, ist leer, ist nicht leer |
| Datum | wie Zahl, dazu **im Zeitraum** (Jahr oder Monat) |
| Ja/Nein | ja, nein (leer zählt als nein) |
| Auswahlliste | ist einer von, ist leer, ist nicht leer |
| Verweis | zeigt auf (eine oder mehrere bestimmte Mappen), ist leer, ist nicht leer |

Dazu die **Systemwerte**: *angelegt am* und *zuletzt geändert am* (wie Datum) sowie *angelegt von* und *zuletzt geändert von* (zeigt auf einen Benutzer).

Bei einer Ansicht mit **mehreren** Mappentypen gibt es nur Felder, die alle Mappentypen mit gleicher Kennung und gleicher Feldart haben (bei Verweisen auch mit gleichem Ziel), und die Systemwerte.

### Dynamische Werte

Statt eines festen Werts kannst du einen nehmen, den das DMS bei **jedem Öffnen** neu berechnet:

| Wert | Wofür | Beispiel |
| --- | --- | --- |
| **heute ± n** Tage, Wochen, Monate, Jahre | Datumsfelder | Kündigung bis zwischen heute und heute + 3 Monate |
| **Jahr** / **Monat** (aktuell ± n), mit „im Zeitraum“ | Datumsfelder | Zahlungsdatum im Zeitraum aktuelles Jahr; Rechnungsdatum im letzten Monat (− 1) |
| **aktueller Benutzer** | Verweise auf Benutzer, angelegt/geändert von | Verantwortlich zeigt auf aktueller Benutzer → „Meine Verträge“ |
| **Rollen des aktuellen Benutzers** | Verweise auf Rollen | Verantwortliche Rolle zeigt auf Rollen des aktuellen Benutzers |

So kann **eine** Ansicht „Meine Aufgaben“ für jeden Benutzer etwas anderes zeigen.

### Auf Anzahlen

Unter **Anzahl** gibt es – jeweils mehr als, weniger als oder genau *n*:

- **Dokumente insgesamt** – alle Dokumente der Mappe, egal in welchem Register. Beispiel: *Mappen ohne Dokument* = Dokumente insgesamt genau 0.
- **Verknüpfungen insgesamt** – wie viele andere Mappen auf diese verweisen, über alle Verweisfelder. Jede verweisende Mappe zählt einmal, auch wenn sie über mehrere Felder verweist; Verweise der Mappe auf sich selbst und Mappen im Papierkorb zählen nicht, E-Mails schon.
- **Dokumente in „…“** – Dokumente in einem bestimmten Dokumentenregister. Beispiel: *Rechnungen ohne Beleg* = Dokumente in „Rechnungsdokumente“ genau 0.
- **Verknüpfungen in „…“** – Mappen in einem Verknüpfungsregister, gezählt wie im Register (also nur über die dort gewählten Quellen). Beispiel: *Verträge ohne Rechnung* = Verknüpfungen in „Rechnungen“ genau 0.

Register stehen zur Wahl, wenn **alle** Mappentypen der Ansicht ein Register mit **gleicher Kennung und gleicher Art** haben – bei einem Mappentyp also alle seine Dokumenten- und Verknüpfungsregister. Bei mehreren Mappentypen zählt jedes Register über die **eigenen** Quellen seines Mappentyps; der Name erscheint als „Rechnungen / Belege“, wenn er sich je Mappentyp unterscheidet.

### Fristen

- **hat Frist in den nächsten n Tagen** – Mappen, bei denen ein Datumsfeld in den nächsten n Tagen liegt: wahlweise ein bestimmtes Datumsfeld oder **alle Datumsfelder mit Erinnerung** (siehe [Fristen](mappentypen.md#fristen-erinnerungen-an-datumsfeldern)). Mit **nur meine** zählen nur Fristen, die der angemeldete Benutzer bekommt. So zeigt etwa *Verträge mit Frist im nächsten Quartal* (Vertrag + hat Frist in den nächsten 90 Tagen) genau die passenden Verträge.

### Persönlich

- **ist mein Favorit** – Mappen, die der **jeweils angemeldete** Benutzer mit dem Stern markiert hat. So zeigt etwa eine Ansicht *Meine wichtigen Verträge* (Vertrag + ist mein Favorit) jedem seine eigenen. Die feste Ansicht *Favoriten* in der Ablage gibt es für jeden ohnehin.

### Wenn sich ein Mappentyp ändert

Entfernst du ein Feld oder Register, auf das eine Bedingung zielt, wird die Ansicht nicht leer: Die Bedingung wird **ignoriert**, bis du sie korrigierst. In der Werkbank ist sie rot markiert, und die Liste der Ansichten zeigt „Bedingung ohne Wirkung – bitte prüfen“.

## Berechtigungen

Mit Berechtigungen legst du fest, **wer eine Ansicht sieht**, **wer dort neue Mappen anlegen** und **wer aus ihr exportieren** kann – etwa damit die Ansicht *Haus* mit allem darunter nur bei den Eltern im Baum erscheint.

| Recht | Bedeutung |
|---|---|
| **R** Sehen | Die Ansicht erscheint im Baum der Ablage und lässt sich öffnen. |
| **C** Anlegen | In der Ansicht gibt es „+ Neu“. Anlegen dürfen muss man zusätzlich am [Mappentyp](berechtigungen.md) – beide müssen es erlauben. |
| **E** Exportieren | Mappen der Ansicht als Excel, CSV, ZIP mit Dokumenten oder PDF ausgeben – alles, was Daten aus dem DMS hinausgibt. Lesen muss man jede Mappe zusätzlich am Mappentyp. Außerhalb einer Ansicht (erweiterte Suche, „Als PDF exportieren“ an der Mappe) darf eine Mappe hinaus, wenn sie in mindestens einer Ansicht mit E läge. |

!!! info "Ansichtsregeln regeln die Ansicht, nicht die Mappen"
    Ob jemand eine **Mappe** lesen darf, entscheiden allein die [Berechtigungen am Mappentyp](berechtigungen.md). Eine Mappe aus einer verborgenen Ansicht kann also über die Suche, eine andere Ansicht oder einen Link weiter auftauchen. Wer Mappen verbergen will, regelt das am Mappentyp. Für Administratoren gelten die Regeln an Ansichten nicht.

- **Standard** – an einer Ansicht auf oberster Ebene eine Zeile mit ✓/✗ je Recht; ohne Regeln dürfen alle alles.
- **Regeln** – wie am Mappentyp: *wenn* der Benutzer eine Rolle hat oder ein bestimmter Benutzer ist (jeweils auch mit *nicht*), *dann* ✓ erteilen oder ✗ entziehen; von oben nach unten, mit **Stopp**. Bedingungen auf Felder gibt es an Ansichten nicht. Regeln lassen sich zuklappen und per Griff ⠿ sortieren.

### Vererbung an Unteransichten

- Eine Unteransicht **erbt** die Regeln ihrer Elternansicht und deren Eltern. Sie stehen oben unter **Geerbt**, schreibgeschützt und mit dem Namen der Ansicht, von der sie kommen; ändern lassen sie sich nur dort.
- **Eigene Regeln** einer Unteransicht können nur weiter **einschränken** (✗). Ein Recht gilt an der Unteransicht nur, wenn es an der Elternansicht gilt **und** keine eigene Regel es entzieht. Einen eigenen Standard hat eine Unteransicht nicht.
- **Ist eine Unteransicht für jemanden verborgen, fehlen ihre Mappen auch in der Elternansicht**, und die Zahlen im Baum passen dazu.
- **Verschieben** (Ziehen im Baum oder *Liegt unter* ändern): Sofort gelten die Regeln der neuen Eltern. Das DMS sagt beim Ablegen, von wem die Ansicht jetzt erbt. Wandert sie auf die oberste Ebene, entfallen die geerbten Regeln, und ihr eigener Standard gilt wieder.

### Testlauf

Unter den Berechtigungen prüfst du, was ein Benutzer an der Ansicht darf – mit den Regeln, wie sie gerade im Editor stehen, auch ungespeichert und mit einer geänderten Elternansicht. Die Tabelle zeigt je Ansicht der Kette, welche Regel zutraf und wie der Stand danach war.

### Beispiel: „Haus“ nur für die Eltern

1. Lege eine Rolle **Kinder** an und gib sie den Kindern.
2. Ansicht *Haus* (oberste Ebene): Regel **Kinder sehen das nicht** – wenn *Benutzer hat Rolle Kinder* → ✗ R C E.
3. *Heizung*, *Garten* usw. unter *Haus* erben die Regel – für die Kinder fehlt der ganze Ast.
4. Sollen die Kinder etwa *Garten* doch sehen, lege *Garten* auf die oberste Ebene oder unter eine andere Ansicht: Unteransichten können nur einschränken.

## Ansichten und Mappentypen

- Ein **neuer Mappentyp** bekommt eine eigene Ansicht – außer du wählst beim Anlegen **Eigene Ansicht in der Ablage anlegen** ab. Sie steht oben auf der ersten Ebene, vor *Benutzer* und *Rolle*.
- **Umbenennen** eines Mappentyps benennt seine eigene Ansicht mit, solange sie noch genauso heißt wie er.
- **Löschen** eines Mappentyps entfernt ihn aus allen Ansichten; eine Ansicht, die nur ihn hatte und keine Unteransichten, verschwindet mit.
- Die Ansichten aus Version 0.9 und früher (eine je Mappentyp) wurden beim Update übernommen. Sie haben dieselbe Adresse wie vorher, Lesezeichen und gemerkte Sortierungen bleiben also gültig.

## Ansicht löschen

**Ansicht löschen** entfernt nur die Ansicht, keine Mappen. Ihre Unteransichten rücken eine Ebene nach oben, an ihre Stelle. Ohne Ansicht sind Mappen weiter über „Zu erledigen“, Verweise und die Suche in anderen Ansichten erreichbar.

!!! info "Ansichten und Rechte"
    Eine Ansicht gibt nie Zugriff auf Mappen, die ein Benutzer sonst nicht sehen dürfte. Wer eine Ansicht sieht, dort anlegen und aus ihr exportieren darf, steht oben unter [Berechtigungen](#berechtigungen).

!!! tip "Ohne Ansicht auf Mappen zeigen"
    Dieselben Bedingungen gehen auch in einem [Link über Mappentyp und Feldwerte](direktlinks.md), z. B. `/ablage/link?typ=rechnung&bezahlt=nein` – ganz ohne Ansicht einzurichten.
