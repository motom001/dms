# Etikett

`Etikett` ist ein **reines Kennzeichen**: Art, Verweisart, Zustand wie „Warnung“, „Hinweis“, „aus Paket“ (#1289). Kleine Schrift, höchstens eine zarte Fläche, **kein Rand**, eckiger als ein Knopf und **nicht klickbar**. Grundlage ist Leitsatz 8: **Ein Rand heißt „Knopf“.** Was sich anklicken lässt, ist ein [Knopf](bausteine-knopf.md) oder ein `KnopfLink`, nie ein Etikett.

![Bereich „Etikett“ der Musterseite: alle Arten, mit Punkt und klein, ein gewählter Eintrag mit ✕](bilder/muster-etikett.png){ loading=lazy }

```tsx
import { Etikett, etikettArt } from '../bausteine';

<Etikett>{t('mappentypen.editor.chip.pflicht')}</Etikett>                // leise (grau)
<Etikett art="warn">{t('werkbank.sicherung.frueherer-schluessel')}</Etikett>
<Etikett art="gut" punkt>{t('werkbank.benutzer.gerade-aktiv')}</Etikett>  // mit farbigem Punkt
<Etikett art={etikettArt(ZUSTAND_ART[z.zustand])}>{name}</Etikett>       // Art aus einer Tabelle, Unbekanntes leise

// Gewählter Eintrag (Musterkatalog A1): ein Etikett mit einem Knopf ✕ darin.
<Etikett entfernen={() => setze(gewaehlt.filter((y) => y !== x))} entfernenText={t('werkbank.sichten.entfernen-2')}>
  {titel[x]}
</Etikett>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `art` | `leise` (grau, Vorgabe), `info` (Akzent), `gut` (grün), `warn` (gelb), `schlecht` (rot) – Schrift auf zarter Fläche, in hell und dunkel mindestens 4,5:1 |
| `punkt` | farbiger Punkt vor dem Text (Zustand einer Ampel, „gerade aktiv“) |
| `klein` | etwas kleiner, für dichte Zeilen und Tabellen |
| `title` | Tooltip (z. B. bis wann ein Archiv gilt) |
| `entfernen`, `entfernenText` | gewählter Eintrag: nur der ✕ ist ein Knopf (nur Symbol, `entfernenText` ist sein Name für Screenreader) |
| `className` | nur für Abstände und Umbruch in der Umgebung, nie für Farbe oder Rand |

**Regeln:**

- Kein Rand, kein Klick. Ein Kennzeichen, das zu einer Seite führt, ist ein `KnopfLink art="link"` („Du bist abwesend“ im Benutzermenü); eines, das etwas tut, ein `Knopf`.
- Herkunft aus einem Paket zeigt der [PaketChip](bausteine-paketchip.md); er sieht aus wie ein Etikett.
- Eine Umgebung passt ein Etikett über `[data-etikett]` an (`.eintrag [data-etikett] { margin-left: 6px; }`), nie über eine Klasse des Bausteins.
- Die frühere globale Klasse `.chip` (Rand und Pillenform wie ein Neben-Knopf, rund 167 Stellen) gibt es nicht mehr.

**Geprüft wird das** im Rauchtest: Der Knopf-Wächter (`web/rauchtest/hilfen.mjs`) meldet auf jeder besuchten Seite `rand-ohne-knopf` – ein kleines Element mit Rand ringsum und runden Ecken, das weder Knopf noch Link noch Feld ist und keins enthält. axe prüft den Kontrast der Etiketten hell und dunkel auf der Musterseite.

![Bereich „Etikett“ dunkel](bilder/muster-etikett-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/etikett/Etikett.tsx`, Aussehen: `Etikett.module.css`
- Musterseite: `web/src/bausteine/etikett/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
