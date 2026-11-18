# Eingebettete Schriften auch für Text, der in WinAnsi passt (#826) { #eingebettete-schriften }

**Frage:** Bleiben die kleineren und schnelleren Standardschriften (Helvetica, Courier) für Text, der ganz in WinAnsi passt, und nur anderer Text bekommt Noto Sans?

**Entscheidung:** Nein. Alle eigenen PDFs betten Noto Sans als Teilmenge ein; einzige Ausnahme sind die Codes im Notfallblatt (Courier, reines ASCII).

**Gründe:** Die Archivfassung (PDF/A) verlangt eingebettete Schriften. Mit zwei Wegen sähe ein Brief je nach Inhalt anders aus und bräche anders um. Und die Unterschiede (rund 30 KB, rund 25 ms je PDF) fallen neben den Dokumenten selbst kaum ins Gewicht.

**Folgen:** Messung, Pflicht-Vorkehrungen und Grenzen stehen unter [Schriften der eigenen PDFs](../pdf.md#pdf-schriften).

**Stand:** gilt seit #826 (11.11.2026).
