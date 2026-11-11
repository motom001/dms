# Nutzung: privat oder beruflich

**Werkbank → Ablage aufbauen → Nutzung** legt einmal für die ganze Ablage fest, ob sie **auch beruflich genutzt** wird – etwa von Katrin als Selbständiger, im Verein oder in der Tischlerei. Vorgabe ist *nein*: Eine neue Ablage gilt als privat.

Das ist bewusst **nur dieses eine Merkmal**. Alles Weitere ergibt sich aus Feldwerten der Mappen oder aus den installierten [Paketen](pakete.md).

## Was das Merkmal bewirkt

- **Mappentypen** zeigen damit ihre beruflichen Felder und Abschnitte – über [Anzeigen, wenn …](mappentypen.md#anzeigen-wenn) mit der Bedingung *Ablage wird beruflich genutzt*. In einer rein privaten Ablage sieht Lena davon nichts; der Mappentyp ist derselbe.
- **Bedingungen** von [Berechtigungen](berechtigungen.md), [Ansichten](sichten.md#bedingungen) und [Automatisierungen](automatisierungen.md) können darauf schauen („Ablage wird beruflich genutzt“, umkehrbar). Es gilt für alle Mappen gleich.
- Die **Vorlage der Werkbank** (welche Bereiche links stehen) richtet sich danach: beruflich → *Betrieb*, sonst *Haushalt*. Sie folgt dem Merkmal, solange niemand die Leiste angepasst hat. Die Vorlage bleibt eine Einstellung der Werkbank, das Merkmal gilt für die Ablage.
- **Pakete** können für ihre neuen Mappentypen eine längere [Aufbewahrung bei beruflicher Nutzung](archiv.md#archivmodus-aus-einem-paket) vorschlagen; sie gilt, wenn das Merkmal beim Installieren gesetzt ist. Schaltest du es später um, bleibt der Archivmodus, wie er ist – ändern kannst du ihn am Mappentyp.

Ausblenden ist **Ordnung, kein Schutz**: Werte ausgeblendeter Felder bleiben gespeichert und stehen in [Schnittstelle](api.md), [Vollexport](export.md) und [Auskunft](datenschutz.md). Wer was sehen darf, regeln die Berechtigungen.

## Gut zu wissen

- Ändern darf das Merkmal nur, wer **Gesamte Verwaltung** hat ([Wer darf Ablago verwalten?](verwalten.md)); der Bereich lässt sich nicht einzeln vergeben. Lesen dürfen es alle Angemeldeten – das Formular der Mappe braucht es.
- Schaltest du es um, prüft Ablago gleich, welche Mappen jetzt Pflichtfelder offen haben (etwa in einem Abschnitt, der nur beruflich zu sehen ist), und zeigt sie wie gewohnt als „passt nicht“.
- Der Einrichtungsassistent fragt es im Schritt [Nutzung](installation.md#nutzung) ab („Wofür nutzt du Ablago?“) und legt bei beruflicher Nutzung auf Wunsch gleich deine [eigene Organisation](organisation.md) an. Die [Einrichtungsdatei](einrichtungsdatei.md) kennt es als `nutzung: beruflich` bzw. `beides` (ältere Dateien: `optionales: beruflich: true`).
- Das Merkmal steht in der Datenbank und damit in jeder [Sicherung](sicherung.md). Der [Vollexport](export.md) legt es als `struktur/merkmale.json` ab, die Schnittstelle liefert es lesend unter `GET /api/v1/merkmale`.
