# Decisions { #entscheidungen }

This is where **why** something is built the way it is can be found – one page per decision, with question, decision, reasons and consequences. How it works today is on the pages of the core ([map](../aufbau.md)); a sentence there points to the decision.

| Decision | Since |
| --- | --- |
| [PDF library: pdf-lib stays](pdf-bibliothek.md) | #822, #823 |
| [Embedded fonts even for text that fits into WinAnsi](eingebettete-schriften.md) | #826 |
| [A small implementation of our own for texts instead of i18next](eigene-sprachbibliothek.md) | #473, #727 |
| [No VOLUME for the database in dms-komplett](kein-volume.md) | #943 |

## Recording a new decision { #neue-entscheidung }

If an issue decides between ways that someone might question later (a library, a format, a way deliberately left out), the decision gets a file of its own in `entscheidungen/`, in both languages and in the menu of both manuals:

- **title** with the decision itself and the issues, for example "No VOLUME for the database in dms-komplett (#943)";
- **question**, **decision** (who, when), **reasons**, **consequences** (what follows from it in the code and the manual, with a link), **status**;
- longer assessments of alternatives belong on that page too, not in the description of the core.

If a decision changes, the page stays: at the top a sentence on what applies now and why, with a link to the new decision.
