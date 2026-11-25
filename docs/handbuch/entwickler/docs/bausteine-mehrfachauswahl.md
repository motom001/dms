# Mehrfachauswahl

`Mehrfachauswahl` (#1211; vorher in `web/src/ablage/`) wählt einen oder mehrere Einträge: oben ein Suchfeld mit Lupe und Vorschlägen, darunter das Gewählte, jeder Eintrag mit einem kleinen Knopf ✕. So wählt man Mappen in einem Verweisfeld oder die Mappentypen der erweiterten Suche.

![Bereich „Mehrfachauswahl“ der Musterseite: leer, offen mit Treffern, ohne Treffer, gesetzt, mehrfach](bilder/muster-mehrfachauswahl.png){ loading=lazy }

| Angabe | Wofür |
| --- | --- |
| `name` | Name der Liste der gewählten Einträge und der Vorschläge (für Bildschirmleser) |
| `platzhalter`, `eingabeLabel`, `id` | Platzhalter und Beschriftung des Suchfelds (oder `id` für ein `<label htmlFor>`) |
| `eingabe`, `setEingabe`, `offen`, `setOffen` | Text und Zustand der Vorschlagsliste – hält der Aufrufer, weil er davon abhängig Vorschläge lädt |
| `vorschlaege` | `{ id, text, gruppe? }[]`; `null` heißt: lädt noch |
| `leerText`, `fuss` | Satz ohne Vorschläge (leise, z. B. „Vertrag „xyz“ nicht gefunden“); etwas unter den Vorschlägen (z. B. „… insgesamt“) |
| `anlegen`, `legeAn` | Einträge zum Anlegen (#1288, `{ id, text }[]`), immer als letzte der Liste – auch mit Treffern; `legeAn` bekommt ihre id |
| `waehle`, `gewaehlt`, `entferne` | Wahl übernehmen; die gewählten Einträge (`{ id, inhalt, zusatz?, aktionen?, entfernenText }`); Eintrag entfernen |
| `ohneSuche`, `darunter`, `schliessen` | ohne Suchfeld (Einzelwahl mit Wert); etwas unter dem Gewählten; beim Schließen der Vorschläge |
| `imFluss` | Vorschläge im Fluss statt fest im Fenster – nur für die Musterseite und Bilder |

- **Tastatur:** Pfeiltasten wandern durch Vorschläge und Anlegen-Einträge (der Fokus bleibt im Suchfeld, `aria-activedescendant`), **Enter** wählt den markierten – ohne Markierung den ersten Vorschlag.
- **Esc** bei offener Liste schließt nur die Liste (#1311): Der Fokus bleibt im Feld, die Eingabe bleibt, und der Tastendruck geht nicht weiter – er verwirft keine Änderungen der Speicherleiste und schließt kein Fenster. Erst ein weiteres Esc bei geschlossener Liste wirkt wie überall (Speicherleiste: Verwerfen, Fenster: schließen).
- **Anlegen** steht in der Liste, nicht als grüner Knopf unter dem Feld: Grün bleibt dem Anlegen der Seite vorbehalten (Leitsatz 2).
- **✕** ist ein kleiner Knopf nur mit Symbol (Art Neben), nicht rot: Das Feld ändert sich erst beim Speichern (Leitsatz 5). Sein Name für Bildschirmleser ist `entfernenText`, etwa „Halter entfernen“. Danach steht der Fokus im Suchfeld.
- **Lage** (#1670): Die Vorschläge klappen wie die Menüs auf (`menue/lage.ts`): nach unten, wenn dort Platz ist, sonst nach oben – etwa bei einem Verweisfeld unten in der Mappe. Sie sind höchstens 280 px hoch und bleiben im Fenster; der Rest rollt in der Liste, nicht auf der Seite. Beim Rollen und bei neuer Fenstergröße liegen sie neu. Anders als das Menü auch am Handy am Feld (kein Blatt von unten), damit das Suchfeld sichtbar bleibt.
- **Am Handy** sind Suchfeld, Vorschläge, Anlegen-Einträge und ✕ mindestens 44 px hoch.
- Die Musterseite zeigt den Baustein im Bereich **Mehrfachauswahl**: leer, offen mit Treffern, ohne Treffer, gesetzt und mehrfach.

![Bereich „Mehrfachauswahl“ dunkel](bilder/muster-mehrfachauswahl-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/mehrfachauswahl/`.
