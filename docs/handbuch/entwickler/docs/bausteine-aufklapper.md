# Aufklapper

`Aufklapper` ist der **Kopf eines Abschnitts** oder die **Zeile einer Liste**, die einen Inhalt auf- und zuklappt (#1270): Pfeil nach rechts (zu) bzw. nach unten (auf), Beschriftung links bündig und umbrechend, beim Darüberfahren eine zarte Fläche. Pfeil, `aria-expanded` und `aria-controls` bringt der Baustein mit; den Inhalt darunter zeigt der Aufrufer. Früher waren das die Sonderformen `aufklappkopf` und `aufklappzeile` am Knopf.

![Bereich „Aufklapper“ der Musterseite: Kopf eines Abschnitts (aufgeklappt) und Zeile einer Liste](bilder/muster-aufklapper.png){ loading=lazy }

```tsx
import { Aufklapper } from '../bausteine';

<section className="aufklappbereich">
  <Aufklapper offen={experte} steuert="pakete-experte" umschalten={() => setExperte(!experte)}>
    <span>{t('werkbank.pakete.expertenmodus')}</span>
    <span className="leise klein">{t('werkbank.pakete.weitere-quellen-paket-oder')}</span>
  </Aufklapper>
  {experte && <div id="pakete-experte" className="aufklappinhalt">…</div>}
</section>

// Zeile einer Liste, z. B. eine Messung der Datenbank:
<Aufklapper form="zeile" offen={offenHier} umschalten={() => umschalten(id)}>…</Aufklapper>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `form` | `kopf` (Vorgabe: fett, ganze Breite, Pfeil in Akzentfarbe) oder `zeile` (Schrift der Liste, Pfeil leise) |
| `offen`, `umschalten` | Zustand und Wechsel – der Zustand bleibt beim Aufrufer |
| `steuert` | Id des Inhalts (`aria-controls`) |
| `title` | Tooltip |

**Regel:** Ein Abschnitt, der sich auf- und zuklappen lässt, nimmt diesen Baustein. Für mehrere Bereiche einer Seite mit Sprungleiste gibt es [Bereiche](bausteine-bereiche.md).

## Code { #code }

- Baustein: `web/src/bausteine/aufklapper/Aufklapper.tsx`, Aussehen: `Aufklapper.module.css`
- Musterseite: `web/src/bausteine/aufklapper/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts` (mit dem Etikett)
