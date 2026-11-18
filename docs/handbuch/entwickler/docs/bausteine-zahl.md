# Zahl

`Zahl` ist die Zahl hinter einem Eintrag der Navigation – in der Ablage (Zu erledigen, Neue Post, Favoriten, Ansichten) und in der Werkbank (Bereiche). Grundlage ist Leitsatz 9 (Musterkatalog C14, #1287): **Gelb nur für Warnungen, die 0 steht immer da.**

![Bereich „Zahl“ der Musterseite: wartet, leere Neue Post, Mengen und eine Warnung](bilder/muster-zahl.png){ loading=lazy }

```tsx
import { Zahl } from '../bausteine';

<Zahl wert={d.zaehler.eingang} art="wartet" />            // Zu erledigen: fett in Textfarbe, „2 warten auf dich“
<Zahl wert={d.zaehler.favoriten} />                       // reine Menge, leise grau – auch 0
<Zahl wert="!" art="warnung" beschriftung="! – Automatisierungen angehalten" />
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `wert` | Zahl (wird im Gebietsschema geschrieben) oder kurzer Text einer Warnung („!“, „aus“) |
| `art` | `menge` (Vorgabe, leise grau), `wartet` (fett in Textfarbe, ohne Fläche; bei 0 wie eine Menge), `warnung` (gelbe Pille) |
| `beschriftung` | Text für Screenreader statt der sichtbaren Zahl; bei `wartet` steht ohne Angabe „{anzahl} warten auf dich“ |
| `title` | Tooltip |

**Regeln (Leitsatz 9):**

- **Gelb nur für echte Warnungen** – „Übersicht“ und „Automatisierungen“ in der Werkbank, wenn dort Hinweise anliegen.
- **Was auf dich wartet** (Zu erledigen, Neue Post): fett in Textfarbe, solange es mehr als 0 sind; für Screenreader mit Text, nicht nur über die Schriftstärke.
- **Reine Mengen** (Favoriten, Papierkorb, Ansichten, Zahlen in der Werkbank): leise grau.
- **Die 0 steht immer da**, leise grau. Nur während des Ladens steht der Platzhalter `ZahlWarte`; ein Eintrag, den es gerade nicht gibt (Papierkorb ausgeschaltet), fehlt ganz.

**Geprüft wird das** im Rauchtest „Navigation: Zahlen ruhig“ (`web/rauchtest/bereiche/ruhige-werkbank.mjs`): keine Warnung in der Navigation der Ablage, „0“ bei leerer Neuer Post, axe hell und dunkel. Die frühere globale Klasse `.zaehler` (gelbe Pille für alles) gibt es nicht mehr.

![Bereich „Zahl“ dunkel](bilder/muster-zahl-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/zahl/Zahl.tsx`, Aussehen: `Zahl.module.css`
- Musterseite: `web/src/bausteine/zahl/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
