# Stempel beim Weitergeben

Beim Herunterladen, Exportieren (ZIP, PDF) und Versenden per E-Mail können Benutzer einen **Stempel** oder ein **Wasserzeichen** auf die Kopie setzen lassen, z. B. „Kopie für Hausverwaltung Müller – 01.11.2026“, „Nur zur Vorlage beim Finanzamt“ oder „ENTWURF“. Das **gespeicherte Original bleibt immer unverändert**, ebenso seine [Archivfassung](#archivfassung-bleibt-unverandert); der Stempel entsteht nur in der ausgegebenen Kopie – auf den Seiten des Dokuments selbst, nie auf einem eigenen Deckblatt. Wie Benutzer das tun, steht im [Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/versenden/#weitergeben-mit-stempel).

Du legst zweierlei fest: die **Vorlagen**, aus denen Benutzer wählen, und je Mappentyp, ob ein Stempel **vorgeschlagen** wird oder **Pflicht** ist.

## Stempel-Vorlagen

Unter **Werkbank → Stempel** stehen die Vorlagen. Am Anfang sind es fünf:

| Vorlage | Text | Lage |
| --- | --- | --- |
| Kopie für … | `Kopie für {empfänger} – {datum}` | diagonal (Wasserzeichen) |
| Nur zur Vorlage bei … | `Nur zur Vorlage bei {empfänger}` | Kopfzeile |
| Entwurf | `ENTWURF` | diagonal |
| Vertraulich | `VERTRAULICH` | Ecke oben rechts, nur erste Seite |
| Aus Ablago (Laufwerk) | `Aus Ablago · {datum}` | Fußzeile – für das [WebDAV-Laufwerk](webdav.md#stempel-beim-lesen) |

![Werkbank → Stempel](bilder/werkbank-stempel.png)

![Eine Vorlage am Handy: Sprungleiste und Bereiche](bilder/werkbank-stempel-handy.png){ width="320" }

Die Vorlagen stehen wie Mappentypen oder Nummernkreise **in der Mitte** – je Vorlage Name, Text mit Platzhaltern und Lage, dahinter die Mappentypen, die sie nutzen. Ein Klick öffnet die Vorlage **rechts**, gegliedert wie ein [Mappentyp](mappentypen.md#aufbau-des-editors): oben die **Sprungleiste** mit **Alle aufklappen / Alle zuklappen**, darunter die Bereiche **Grunddaten** (Name und Text) **→ Aussehen → Vorschau → Verwendet in → Fassungen** ([wer hat was geändert](fassungen.md)). Eingeklappt zeigt jeder Bereich eine Kurzinfo, etwa „Diagonal · Rot · 70 %“; was du aufklappst, merkt sich dein Gerät je Vorlage, eine neue Vorlage ist ganz aufgeklappt. Unten speicherst oder verwirfst du alle Änderungen auf einmal, links unten steht **Vorlage löschen**; ein fehlender Name oder ein unbekannter Platzhalter markiert die Grunddaten rot. Mit **+ Neu** oben in der Mitte legst du eine an:

| Angabe | Bedeutung |
| --- | --- |
| **Name** | wie die Vorlage in der Auswahl heißt; eindeutig |
| **Text** | bis zu 6 Zeilen und 300 Zeichen, mit [Platzhaltern](#platzhalter). Der Text steht an **einem** Ort – er wird nicht auf Kopf- und Fußzeile aufgeteilt. |
| **Lage** | diagonal über die Seite (Wasserzeichen), Kopfzeile, Fußzeile, Ecke oben rechts mit Rahmen oder **Stempel**: ein kleiner Stempel mit doppeltem Rahmen, frei auf der Seite platzierbar |
| **Seiten** | alle Seiten oder nur die erste |
| **Farbe** | Rot, Blau, Grün oder Schwarz |
| **Größe** | 50 % bis 200 % der üblichen Größe |
| **Deckkraft** | 10 % (kaum sichtbar) bis 100 % (volle Farbe); neue Vorlagen beginnen mit **70 %** |
| **Drehen** | 0° bis 359°, mit Schieberegler oder Zahl – auch auf den Kopf. Die Diagonale folgt immer der Seite und lässt sich nicht drehen. |
| **Wie Tinte – Schrift darunter bleibt lesbar** | siehe [unten](#deckkraft-und-wie-tinte); neue Vorlagen haben es eingeschaltet |

### Platzhalter

Mit den Knöpfen unter dem Text fügst du Platzhalter ein. Beim Herausgeben setzt Ablago dafür ein:

| Platzhalter | wird zu |
| --- | --- |
| `{datum}` | dem heutigen Datum |
| `{empfänger}` | dem Empfänger, den man beim Weitergeben angibt (bei E-Mails ohne Angabe die Adressen) |
| `{benutzer}` | dem Namen dessen, der herausgibt |
| `{mappe}` | dem Titel der Mappe |
| `{seite}` | der Nummer der Seite, auf der der Stempel steht |
| `{seiten}` | der Anzahl der Seiten des Dokuments |
| `{archivnummer}` | der [Archivnummer](nummernkreise.md#archivnummern-und-aufkleber) des Dokuments (leer, wenn es keine hat) |

Alle Platzhalter gehen bei **Alle Seiten** wie bei **Nur die erste Seite**. Ein Beispiel nur für Seite 1: „Export aus Ablago – dieses Dokument umfasst {seiten} Seiten“. Für Seitenzahlen auf jeder Seite: „Seite {seite} von {seiten}“ mit **Alle Seiten**.

### Vorschau

Im Bereich *Vorschau* steht der Stempel auf vier erfundenen Beispielbelegen nebeneinander (am Handy untereinander): einer Rechnung mit Text, einer Tabelle mit Beträgen, einem farbigen Formular und einem grauen Scan eines Kassenbons. Jede Änderung an Text, Lage, Farbe, Größe, Deckkraft und „wie Tinte“ zeigt sich sofort in allen vier Bildern. Zu sehen ist Seite 1, so wie sie herausgegeben würde; bei **Alle Seiten** gilt dieselbe Einstellung für jede Seite.

Den Stempel kannst du direkt in der Vorschau bearbeiten:

- **Verschieben** (Lage *Stempel*): mit der Maus oder dem Finger ziehen, oder ihn mit der Tabulatortaste wählen und mit den Pfeiltasten bewegen (mit Umschalt in größeren Schritten). Die anderen Lagen sitzen fest.
- **Drehen**: am runden Griff über dem Stempel ziehen (mit Umschalt in 15°-Schritten), mit Bild auf und Bild ab oder mit der Gradzahl bei **Drehen**.
- **Text ändern**: doppelt klicken oder die Eingabetaste drücken. Es öffnet sich ein Textfeld mit den Knöpfen für die Platzhalter.

### Deckkraft und „wie Tinte“ { #deckkraft-und-wie-tinte }

Ein Stempel soll gut zu sehen sein, ohne Beträge, Daten oder Aktenzeichen darunter unlesbar zu machen. Dafür gibt es zwei Stellschrauben:

- **Deckkraft**: Je höher, desto kräftiger die Farbe – und desto mehr verdeckt ein gewöhnlicher Stempel, was darunter steht. Ab 80 % weist die Werkbank darauf hin: *„Bitte bedenke: Der Stempel kann Informationen aus dem Beleg verdecken und unlesbar machen.“* Höhere Werte bleiben erlaubt.
- **Wie Tinte – Schrift darunter bleibt lesbar**: Der Stempel wird wie echte Stempelfarbe aufs Papier gelegt (im PDF der Mischmodus „Multiplizieren“). Er färbt nur ein: Weißes wird rot, Schwarzes bleibt schwarz. So geht auch volle Farbe, ohne etwas zu verdecken. Auf farbigen Flächen wird der Stempel dunkler, wie auf Papier. Neue Vorlagen haben „wie Tinte“ eingeschaltet; du kannst es je Vorlage und beim Weitergeben abschalten.

Vorlagen, die es vor dieser Einstellung schon gab (auch die mitgelieferten), behalten ihr bisheriges Aussehen: ihre Deckkraft und „wie Tinte“ aus. Du kannst es dort jederzeit einschalten.

### Seitenzahlen und Archivnummer früher als Haken

Früher gab es die Haken **Seitenzahlen „Seite x von y“ als Fußzeile** und **Archivnummer des Dokuments in der Fußzeile**. Sie sind entfallen; dafür gibt es die Platzhalter `{seite}`, `{seiten}` und `{archivnummer}`. Hatte eine Vorlage einen der Haken gesetzt, hat Ablago ihren Text um eine Zeile ergänzt, z. B. „{archivnummer} · Seite {seite} von {seiten}“. Diese Zeile steht jetzt im Stempel selbst, an seiner Lage und in seiner Farbe, statt klein unten rechts – und bei **Nur die erste Seite** nur auf Seite 1. Damit sich nichts unbemerkt ändert, zeigt die Werkbank beim Öffnen einer solchen Vorlage einen Hinweis, bis du sie speicherst oder **So lassen** wählst.

Benutzer können beim Weitergeben Text, Lage, Deckkraft, Seiten und „wie Tinte“ noch ändern; die Vorlage ist der Ausgangspunkt. Eine Vorlage, die ein Mappentyp verwendet, lässt sich nicht löschen – unter **Verwendet in** steht, welcher. Dasselbe gilt für die Vorlage, mit der das [WebDAV-Laufwerk](webdav.md#stempel-beim-lesen) beim Lesen stempelt.

Die Vorlagen liegen in den Einstellungen der Datenbank und gehören damit zur [Sicherung](sicherung.md).

## Stempel je Mappentyp

Im [Mappentyp](mappentypen.md) gibt es den Bereich **Stempel beim Weitergeben**:

- **Kein Stempel** (Standard): Benutzer können beim Weitergeben einen Stempel wählen, müssen aber nicht.
- **Vorschlagen**: **Mit Stempel** ist beim Herunterladen, Exportieren und Versenden schon angehakt, mit der gewählten Vorlage – z. B. bei „Ausweis & Urkunde“: „Kopie – nur für {empfänger} – {datum}“. Benutzer können ihn abwählen.
- **Pflicht**: Dokumente dieses Mappentyps verlassen Ablago nur gestempelt – beim Herunterladen (auch älterer Versionen), im Export als ZIP oder PDF, per E-Mail (auch das PDF „Angaben“ der Mappe), über die [API](api.md) und über das [WebDAV-Laufwerk](webdav.md#stempel-beim-lesen). Gibt jemand keinen eigenen Stempel an, nimmt Ablago die Vorlage des Mappentyps. Nutzt sie `{empfänger}`, muss ein Empfänger angegeben sein (bei E-Mails sind es ohne Angabe die Adressen). Dokumente, die keine PDFs oder Bilder sind, lassen sich dann nicht weitergeben.

Gespeichert wird die Einstellung mit **Mappentyp speichern**.

## Was gestempelt wird

- **PDFs** und **Bilder** (JPEG, PNG). Bilder werden dabei zu einem PDF (A4, hoch oder quer wie das Bild). Verschlüsselte PDFs lassen sich nicht stempeln.
- Beim **Export als PDF** bekommen die eingebundenen Dokumente den Stempel, nicht die Seiten mit den Angaben der Mappe.
- Bei **E-Mails** (einer und mehrerer Mappen) bekommt auch das PDF **„Angaben“** mit den Feldern der Mappe den Stempel – es geht ebenso hinaus. In der Post liegt dann die gestempelte Fassung.
- Beim **Export als ZIP** und bei E-Mails gehen andere Dateien (z. B. Word) ungestempelt mit – außer der Mappentyp verlangt den Stempel, dann bricht Ablago mit einer Meldung ab.
- Das **Anzeigen** in Ablago, das Vorschaubild, die Texterkennung und Pakete bekommen immer das Original.

## Archivfassung bleibt unverändert { #archivfassung-bleibt-unverandert }

Die gespeicherte [Archivfassung](texterkennung.md#archivfassung-pdfa) (PDF/A) wird **nie** gestempelt oder sonst verändert. Sie ist die Fassung, die über Jahre unverändert lesbar bleiben soll; ein Stempel gehört zu einer einzelnen Weitergabe, nicht zum Dokument. Deshalb entsteht er jedes Mal neu in einer Kopie:

- **Pakete** (z. B. Texterkennung, PDF/A) arbeiten innerhalb von Ablago und bekommen Original und Archivfassung immer unverändert.
- **Abrufe über einen API-Schlüssel** (Skripte, Fremdprogramme) gelten als Herausgeben: Sie brauchen das Exportrecht, und verlangt der Mappentyp einen Stempel, bekommt die ausgegebene **Kopie** ihn – auf den Seiten des Dokuments selbst, also **kein eigenes Deckblatt**, das man einfach entfernen könnte. Die Wahl **Alle Seiten** / **Nur die erste Seite** der Vorlage gilt dabei wie immer.
- Das gilt für das Dokument, ältere Versionen, die Archivfassung, die umgewandelte Fassung und die **Seitenbilder** (Seitenansicht, Vorschaubild, Graustufen- und Farbbild, Bild für das Schwärzen): Mit API-Schlüssel und Stempel entstehen sie aus der gestempelten Kopie.

Jede solche Weitergabe steht in der Historie der Mappe.

## Pflicht gilt auch für das Laufwerk { #pflicht-gilt-auch-fur-das-laufwerk }

Über das [WebDAV-Laufwerk](webdav.md) kommen Dokumente eines Mappentyps mit **Pflicht** immer mit dessen Stempel heraus – auch wenn unter **Werkbank → WebDAV-Laufwerk** „Stempel beim Lesen: Kein Stempel“ eingestellt ist. Bilder kommen dort als PDF heraus und heißen im Laufwerk auch so (`foto.pdf`); Dateien, die sich nicht stempeln lassen, öffnet das Laufwerk gar nicht.

Die Register solcher Mappen sind über das Laufwerk **nur lesbar**: nichts ablegen, ändern, umbenennen, kopieren oder löschen. Sonst käme der Stempel beim Zurückspeichern als neue Version in Ablago an. Explorer und Finder zeigen diese Ordner und Dateien als schreibgeschützt. Ablegen geht dort weiter in Ablago selbst.

Ohne Pflicht stempelt das Laufwerk mit der Vorlage aus seiner eigenen Einstellung (Vorgabe: *Aus Ablago (Laufwerk)*) – siehe [Stempel beim Lesen](webdav.md#stempel-beim-lesen).

Jede Weitergabe mit Stempel steht in der **Historie** der Mappe („weitergegeben: mit Stempel „…“ an …“, mit Dokumenten und Art der Weitergabe); bei E-Mails im Eintrag der E-Mail, und in der Post liegt die gestempelte Kopie.

## Wie sicher ist der Stempel?

Der Stempel ist **Ordnung und Nachweis**, keine Sicherheitsgrenze: Er kennzeichnet eine bewusste Weitergabe, und die Historie hält sie fest. Wer ein Dokument lesen darf, kann es beim Ansehen immer auch abfotografieren oder speichern; die echte Grenze ist das Leserecht.

Der Stempel ist **Inhalt der Seite**, keine Anmerkung (Kommentar), die sich in jedem PDF-Programm mit einem Klick löschen ließe. Ablago zeichnet ihn als Text über den vorhandenen Inhalt und führt danach alle Inhalte der Seite zu **einem** Datenstrom zusammen, sodass er nicht als eigener Baustein übrig bleibt.

Die Grenze: Wer sich mit PDF-Werkzeugen auskennt, kann Textbefehle aus einer Seite trotzdem entfernen. Der Stempel wird nicht in die Bildpunkte eingebrannt. Er ist ein deutlicher Hinweis, für wen eine Kopie bestimmt ist, und erschwert Missbrauch – ein Kopierschutz ist er nicht.

## Über die API

`GET /api/v1/dokumente/{id}/inhalt` nimmt Stempel-Parameter: `vorlage`, `stempel` (Text, Zeilen mit `%0A` getrennt), `empfaenger`, `lage` (auch `stempel`), `deckkraft`, `tinte`, `drehung`, `x` und `y` (Mitte bei der Lage *Stempel*, 0 bis 1), `farbe`, `groesse`, `seiten`. Die früheren Parameter `seitenzahlen` und `archivnummer` wirken weiter: Sie hängen die passende Zeile mit Platzhaltern an den Text. Ein Abruf mit einem API-Schlüssel gilt immer als Weitergeben, die Pflicht des Mappentyps gilt also auch hier – auch für Archivfassung, umgewandelte Fassung und Seitenbilder. Die Vorlagen liefert `GET /api/v1/stempel/vorlagen`, die Einstellung je Mappentyp steht an `GET /api/v1/typen` unter `stempel`. Einzelheiten stehen in der [API-Beschreibung](api.md).
