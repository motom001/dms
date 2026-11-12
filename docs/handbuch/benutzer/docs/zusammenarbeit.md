# Notizen, Erwähnungen, Historie

## Notizen

Notizen sind kurze, formatierte Texte an einer Mappe – „Mit Herrn Müller telefoniert, kommt am Freitag“. Sie gehören zu keinem Feld und brauchen keinen Mappentyp, der sie vorsieht.

![Notizen an einer Mappe](bilder/notizen.png)

- Notizen haben bei jeder Mappe ein eigenes Register **Notizen**, direkt vor der **Historie**; die Zahl daneben sagt, wie viele es gibt. Erwähnt dich jemand in einer Notiz, öffnet sich die Mappe gleich dort.
- Jede Notiz zeigt, wer sie wann geschrieben und zuletzt geändert hat.
- **Jeder** darf Notizen ändern und löschen – wie Zettel in einer gemeinsamen Mappe. In der [Historie](#historie) bleibt sichtbar, was geschah.
- Mit dem Haken **Notizen** neben dem Suchfeld durchsucht die Suche auch die Notizen.
- Auch in Notizen kannst du mit **@** jemanden erwähnen.

## Erwähnungen

In formatierten Texten und Notizen erwähnst du mit **@** einen Benutzer: Tippe **@** und die ersten Buchstaben, die Vorschläge erscheinen direkt an der Schreibstelle; mit ↑/↓ wählen, Enter oder Tab übernehmen, Esc schließt. Er bekommt eine [Aufgabe](eingang.md), und die Mappe steht bei ihm unter „Zu erledigen“, bis er sie erledigt.

- Speicherst du den Text noch einmal, entsteht keine zweite Aufgabe.
- Nimmst du die Erwähnung wieder heraus, bleibt die Aufgabe offen; in der Historie steht, dass sie entfernt wurde.
- Wer sich selbst erwähnt, bekommt keine Aufgabe.
- Darfst du einen erwähnten Benutzer nicht sehen, steht dort **@Benutzer (nicht sichtbar)** – ohne Namen und ohne Link. **Gelöschter Benutzer** bzw. der graue Name mit dem Hinweis „Diesen Benutzer gibt es nicht mehr“ erscheint nur, wenn es ihn wirklich nicht mehr gibt.
- Öffnest du einen erwähnten Benutzer, steht daneben die Liste **Alle Mappen: Benutzer** – die Liste des Mappentyps, nicht eine Ansicht.

## Historie

Hat der Mappentyp ein Register **Historie**, zeigt es die Geschichte der Mappe, neueste zuerst:

- angelegt und geändert – aufgeklappt mit jedem geänderten Feld, **vorher** und **nachher**,
- Dokumente hochgeladen und gelöscht,
- in den Papierkorb gelegt und wiederhergestellt,
- Notizen, Aufgaben und Erwähnungen, weitergegebene Aufgaben,
- verschickte E-Mails – mit einem Link zur E-Mail,
- wer ein Passwort angezeigt hat (nie das Passwort selbst; geänderte Passwörter erscheinen nur als „geändert“),
- bei einer Mappe, die aus einer Post angelegt wurde, auch die ganze Geschichte der Post – mit dem Zeichen *aus der Post* – und der Eintrag „Aus Post „…“ angelegt“ ([mehr](post.md#post-auflosen)).

![Historie einer Mappe](bilder/protokoll.png)

Einträge mit einem **▸** davor lassen sich aufklappen; hinten steht, was dahinter steckt (z. B. „3 Felder“, „vorher/nachher“, „2 Anhänge“). **Alle Einträge aufklappen** öffnet alle auf einmal. Namen führen zur Mappe des Benutzers.

**Abrufe:** Ablago schreibt außerdem mit, wer eine Datei wann **heruntergeladen** hat – in der Oberfläche (mit und ohne Stempel, auch als Export), mit einem **API-Schlüssel** oder über das [Laufwerk](laufwerk.md) –, mit Weg, Datei und Fassung (Original, ältere Version, Archivfassung …). Ansehen im Browser zählt nicht. Ruft dieselbe Person dieselbe Datei auf demselben Weg am selben Tag mehrmals ab – Explorer und Office lesen eine Datei oft viele Male –, steht das einmal da; ein Abruf an einem späteren Tag bekommt einen eigenen Eintrag.

**Was das Register zeigt**, stellt der Administrator am Mappentyp ein. Ohne Einstellung zeigt die Historie alles außer den Abrufen; manche Mappentypen haben dafür ein eigenes Register, z. B. *Abrufe*. Mit **Alles anzeigen** oben siehst du trotzdem alle Einträge der Mappe. Mitgeschrieben wird immer alles.

Die Historie lädt erst, wenn du das Register öffnest, und zeigt die neuesten 100 Einträge; **Weitere laden** holt die nächsten.

Einträge lassen sich nicht ändern oder löschen. Die Historie beginnt mit Version 0.12; ältere Änderungen sind nicht erfasst, und Einträge vor Version 0.12.1 haben teils weniger Einzelheiten.
