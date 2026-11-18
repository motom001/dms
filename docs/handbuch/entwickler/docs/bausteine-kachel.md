# Kachel

`Kachel` ist ein Weg mit einer Zahl – auf der **Startseite der Ablage** und auf der **Übersicht der Werkbank** gleich (#1271, #1284). Fläche wie der Inhalt, Rand, oben der Titel, groß die Zahl in der Akzentfarbe, darunter leise eine Zeile. Die ganze Kachel ist ein Link. Mehrere Kacheln stehen in `Kacheln`, einem Raster; unter etwa 420 px Breite wird jede Kachel zur Zeile (Titel links, Zahl rechts).

![Bereich „Kachel“ der Musterseite: mit Zahl, leer und erledigt, leer ohne Erfolg, lädt, Text](bilder/muster-kachel.png){ loading=lazy }

```tsx
import { Kachel, Kacheln } from '../bausteine';

<Kacheln>
  <Kachel name="eingang" to="/ablage/eingang" titel={t('ablage.startseite.zu-erledigen')} wert={zahl}
    leer={t('ablage.startseite.nichts-zu-erledigen')} leerGut />          // 0: grün mit Haken – erledigt
  <Kachel name="wahl" to="/ablage/favoriten" titel={t('ablage.startseite.favoriten')} wert={favoriten}
    leer={t('ablage.startseite.noch-keine-der-stern')} />                // 0: leise – leer ist kein Erfolg
  <Kachel to="/werkbank/systemzustand#version" titel={t('werkbank.uebersicht.version')} wert={version} unter={…} />
</Kacheln>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `to` | Ziel der Kachel |
| `titel` | Titel oben (auch mit Symbol) |
| `wert` | Zahl (im Gebietsschema geschrieben) oder kurzer Text (Datum, Version); `null` = lädt noch, „…“ |
| `leer`, `leerGut` | Text statt der 0; mit `leerGut` grün mit Haken – nur, wenn leer „erledigt“ heißt (Zu erledigen, Neue Post) |
| `unter`, `zusatz` | leise Zeilen darunter; `unter` fehlt bei 0 mit `leer` |
| `name`, `anker` | `data-kachel` (fester Schlüssel, #421) und `data-anker` (Rundgänge) |
| `vorher` | läuft vor dem Weg (Termin-Kachel: Ansicht „Monat“ wählen) |

**Regeln:** Kacheln sind neutral; Farbe trägt nur die Zahl. Grün heißt „gut“ – ein leerer Bereich ohne Auftrag (keine Favoriten) steht leise. Hinweise und Warnungen gehören nicht in eine Kachel, sondern als Hinweis darunter (Werkbank-Übersicht).

![Bereich „Kachel“ dunkel](bilder/muster-kachel-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/kachel/Kachel.tsx`, Aussehen: `Kachel.module.css`
- Musterseite: `web/src/bausteine/kachel/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
