# Embedded fonts even for text that fits into WinAnsi (#826) { #eingebettete-schriften }

**Question:** do the smaller and faster standard fonts (Helvetica, Courier) stay for text that fits entirely into WinAnsi, with only other text getting Noto Sans?

**Decision:** no. All our own PDFs embed Noto Sans as a subset; the only exception are the codes on the emergency sheet (Courier, plain ASCII).

**Reasons:** the archive version (PDF/A) requires embedded fonts. With two ways, a letter would look and wrap differently depending on its content. And the differences (around 30 KB, around 25 ms per PDF) hardly matter next to the documents themselves.

**Consequences:** measurement, mandatory precautions and limits are under [Fonts of our own PDFs](../pdf.md#pdf-schriften).

**Status:** applies since #826 (11.11.2026).
