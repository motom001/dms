# Stempel beim Weitergeben

Beim Herunterladen, Exportieren (ZIP, PDF) und Versenden per E-Mail können Benutzer einen **Stempel** oder ein **Wasserzeichen** auf die Kopie setzen lassen, z. B. „Kopie für Hausverwaltung Müller – 01.11.2026“, „Nur zur Vorlage beim Finanzamt“ oder „ENTWURF“. Das **gespeicherte Original bleibt immer unverändert**; der Stempel entsteht nur in der ausgegebenen Kopie. Wie Benutzer das tun, steht im [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/versenden/#weitergeben-mit-stempel).

Du legst zweierlei fest: die **Vorlagen**, aus denen Benutzer wählen, und je Mappentyp, ob ein Stempel **vorgeschlagen** wird oder **Pflicht** ist.

## Stempel-Vorlagen

Unter **Werkbank → Stempel** stehen die Vorlagen. Am Anfang sind es vier:

| Vorlage | Text | Lage |
| --- | --- | --- |
| Kopie für … | `Kopie für {empfänger} – {datum}` | diagonal (Wasserzeichen) |
| Nur zur Vorlage bei … | `Nur zur Vorlage bei {empfänger}` | Kopfzeile |
| Entwurf | `ENTWURF` | diagonal |
| Vertraulich | `VERTRAULICH` | Ecke oben rechts, nur erste Seite |

![Werkbank → Stempel](bilder/werkbank-stempel.png)

Ein Klick auf eine Vorlage klappt sie auf; du änderst sie direkt dort und speicherst sie. Mit **+ Neue Vorlage** legst du eine an:

| Angabe | Bedeutung |
| --- | --- |
| **Name** | wie die Vorlage in der Auswahl heißt; eindeutig |
| **Text** | höchstens 200 Zeichen, mit Platzhaltern `{datum}`, `{empfänger}`, `{benutzer}` und `{mappe}` (Titel der Mappe) |
| **Lage** | diagonal über die Seite (Wasserzeichen), Kopfzeile, Fußzeile oder Ecke oben rechts mit Rahmen |
| **Deckkraft** | 10 % (kaum sichtbar) bis 100 % |
| **Seiten** | alle Seiten oder nur die erste |
| **Seitenzahlen** | Fußzeile „Seite x von y“ auf jeder Seite |
| **Archivnummer** | die [Archivnummer](nummernkreise.md#archivnummern-und-aufkleber) des Dokuments in der Fußzeile |

Die kleine Seite neben den Kästchen zeigt ungefähr, wo der Stempel sitzt. Benutzer können beim Weitergeben alles noch ändern; die Vorlage ist nur der Ausgangspunkt. Eine Vorlage, die ein Mappentyp verwendet, lässt sich nicht löschen – unter **Verwendet in** steht, welcher.

Die Vorlagen liegen in den Einstellungen der Datenbank und gehören damit zur [Sicherung](sicherung.md).

## Stempel je Mappentyp

Im [Mappentyp](mappentypen.md) gibt es den Bereich **Stempel beim Weitergeben**:

- **Kein Stempel** (Standard): Benutzer können beim Weitergeben einen Stempel wählen, müssen aber nicht.
- **Vorschlagen**: **Mit Stempel** ist beim Herunterladen, Exportieren und Versenden schon angehakt, mit der gewählten Vorlage – z. B. bei „Ausweis & Urkunde“: „Kopie – nur für {empfänger} – {datum}“. Benutzer können ihn abwählen.
- **Pflicht**: Dokumente dieses Mappentyps verlassen das DMS nur gestempelt – beim Herunterladen (auch älterer Versionen), im Export als ZIP oder PDF, per E-Mail und über die [API](api.md). Gibt jemand keinen eigenen Stempel an, nimmt das DMS die Vorlage des Mappentyps. Nutzt sie `{empfänger}`, muss ein Empfänger angegeben sein (bei E-Mails sind es ohne Angabe die Adressen). Dokumente, die keine PDFs oder Bilder sind, lassen sich dann nicht weitergeben.

Gespeichert wird die Einstellung mit **Mappentyp speichern**.

## Was gestempelt wird

- **PDFs** und **Bilder** (JPEG, PNG). Bilder werden dabei zu einem PDF (A4, hoch oder quer wie das Bild). Verschlüsselte PDFs lassen sich nicht stempeln.
- Beim **Export als PDF** bekommen die eingebundenen Dokumente den Stempel, nicht die Seiten mit den Angaben der Mappe.
- Beim **Export als ZIP** und bei E-Mails gehen andere Dateien (z. B. Word) ungestempelt mit – außer der Mappentyp verlangt den Stempel, dann bricht das DMS mit einer Meldung ab.
- Das **Anzeigen** im DMS, das Vorschaubild, die Texterkennung, [WebDAV](webdav.md) und Pakete bekommen immer das Original.

Jede Weitergabe mit Stempel steht in der **Historie** der Mappe („weitergegeben: mit Stempel „…“ an …“, mit Dokumenten und Art der Weitergabe); bei E-Mails im Eintrag der E-Mail, und in der Post liegt die gestempelte Kopie.

## Wie sicher ist der Stempel?

Der Stempel ist **Inhalt der Seite**, keine Anmerkung (Kommentar), die sich in jedem PDF-Programm mit einem Klick löschen ließe. Das DMS zeichnet ihn als Text über den vorhandenen Inhalt und führt danach alle Inhalte der Seite zu **einem** Datenstrom zusammen, sodass er nicht als eigener Baustein übrig bleibt.

Die Grenze: Wer sich mit PDF-Werkzeugen auskennt, kann Textbefehle aus einer Seite trotzdem entfernen. Der Stempel wird nicht in die Bildpunkte eingebrannt. Er ist ein deutlicher Hinweis, für wen eine Kopie bestimmt ist, und erschwert Missbrauch – ein Kopierschutz ist er nicht.

## Über die API

`GET /api/v1/dokumente/{id}/inhalt` nimmt Stempel-Parameter: `vorlage`, `stempel` (Text), `empfaenger`, `lage`, `deckkraft`, `seiten`, `seitenzahlen`, `archivnummer`. Ein Abruf mit einem API-Schlüssel gilt immer als Weitergeben, die Pflicht des Mappentyps gilt also auch hier. Die Vorlagen liefert `GET /api/v1/stempel/vorlagen`, die Einstellung je Mappentyp steht an `GET /api/v1/typen` unter `stempel`. Einzelheiten stehen in der [API-Beschreibung](api.md).
