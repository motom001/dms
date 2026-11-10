# Inputs with a unit

`ZeitraumEingabe` and `ProzentEingabe` (#1035) are inputs for the field kinds **period** and **percentage**: a number and its unit on one line. They sit in a [field](bausteine-feld.md) (or in a frame whose label points at their `id` with `htmlFor`) and take over the frame's links – `id`, `aria-describedby` and `aria-invalid` go to the number, because that is where you type.

| Building block | Shows | Value |
| --- | --- | --- |
| `ZeitraumEingabe` | number (number pad) and a choice of days, weeks, months, years – singular while the number is 1 ("1 month"), otherwise plural | `{ anzahl: string, einheit }` as typed |
| `ProzentEingabe` | number (decimal pad), followed by a fixed "%" (for reading only) | text as typed; `leseProzent` reads "19", "19%" and "19.0" the same |

```tsx
import { Feld, ProzentEingabe, ZeitraumEingabe, type ZeitraumRoh } from '../bausteine';

<Feld beschriftung={t('…kuendigungsfrist')}><ZeitraumEingabe wert={frist} setze={setFrist} /></Feld>
<Feld beschriftung={t('…steuersatz')} hinweis={t('…steuersatz-hinweis')}><ProzentEingabe wert={satz} setze={setSatz} /></Feld>

// Without a visible label (e.g. as the value of a condition): give an aria-label.
<ZeitraumEingabe aria-label={t('werkbank.sichten.wert')} wert={roh} setze={…} />
```

- **Reading and showing** is not part of the building block but lives in `shared/src/feldarten.ts`: `leseZeitraum` ("3 months", `P3M`, `{ anzahl, einheit }`), `zeitraumText` (singular and plural from the language files, `gemeinsam.feldarten.zeitraum.*`), `leseProzent`, `prozentText` ("19 %" with a narrow no-break space U+202F where the language puts a space, "19%" in English).
- **Stored**: a period as `{ anzahl, einheit }`, a percentage as a number (19, not 0.19). Periods are compared in days (`zeitraumTage`: month 30.4375, year 365.25).
- **On the phone** number and choice are at least 44 px high ([On the phone](bausteine.md#handy)).
- The pattern page shows both in the section **Inputs with a unit**: filled, singular, error, optional and disabled.
