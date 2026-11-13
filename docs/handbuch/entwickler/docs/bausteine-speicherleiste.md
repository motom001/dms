# Speicherleiste

`Speicherleiste` ist die Leiste unten in jedem Formular zum Anlegen und Bearbeiten (#370, aus Bausteinen seit #1210). Sie bleibt beim Rollen sichtbar und zeigt überall dasselbe: **links „… löschen“**, in der Mitte den Stand („Ungespeicherte Änderungen“), **rechts „Verwerfen“ und den blauen Hauptknopf** mit dem Gegenstand im Namen – alle auf einer Linie.

![Bereich „Speicherleiste“ der Musterseite: nichts geändert, geändert, Löschen gesperrt aus einem Grund, neu](bilder/muster-speicherleiste.png){ loading=lazy }

## Aufbau { #aufbau }

| Platz | Was | Baustein |
| --- | --- | --- |
| links | „… löschen“ (`loeschen`): ein [Gefahr-Knopf](bausteine-knopf.md#arten) in **normaler Größe** mit Symbol und Rückfrage; gesperrt aus einem Grund gestrichelt mit Schloss und ⓘ | `Knopf art="gefahr"` |
| Mitte | Stand oder Meldung (`meldung`), `role="status"` | – |
| rechts | weitere Knöpfe (`weitere`), **„Verwerfen“** (Art Neben, ohne Symbol, ohne Rückfrage), der **Hauptknopf** (Art Haupt, blau) | `Knopf`, `Knopf art="haupt"` |

Ohne Änderung sind „Verwerfen“ und der Hauptknopf **blass** – nichts zu tun, ohne Erklärung (Leitsatz 6). Beim Anlegen heißt „Verwerfen“ „Entwurf verwerfen“ und führt zurück zur Liste. Während des Speicherns zeigt der Hauptknopf „läuft“ mit „Speichere …“ und behält den Tastaturfokus. Esc im Formular verwirft – mit Rückfrage, wenn etwas verloren ginge; der Knopf „Verwerfen“ selbst fragt nicht (er ist eindeutig beschriftet).

Am Handy (bis 600 px) steht alles in einer Zeile; „… löschen“ zeigt dann nur sein Symbol (der Name bleibt für Screenreader), der Stand fällt weg.

```tsx
import { Speicherleiste, useEntwurf } from '../bausteine';

const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(gespeichert), liste: '/werkbank/nummernkreise' });
<form onSubmit={…} onKeyDown={ent.tasten}>
  …
  <Speicherleiste ent={ent} gegenstand={t('…nummernkreis')} sendet={sendet}
    loeschen={!neu ? {
      text: t('…nummernkreis-loeschen'),
      rueckfrage: { titel: t('…nummernkreis-loeschen-frage'), text: t('…folgen'), ja: t('…loeschen') },
      gesperrt: k.verwendet.length > 0 && t('…wird-noch-verwendet'),
      onClick: loeschen,
    } : undefined} />
</form>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `ent` | der Entwurf aus `useEntwurf` (neu, geändert, verwerfen, Esc) |
| `gegenstand` | steht im Hauptknopf: „Nummernkreis speichern“ bzw. „… anlegen“ |
| `loeschen` | `{ text, rueckfrage, onClick, gesperrt?, symbol? }` – der feste Platz links; `onClick` läuft erst nach „Ja“ |
| `sendet`, `ungueltig`, `speicherbar` | Hauptknopf läuft, ist gesperrt (ungültig) bzw. auch ohne Änderung aktiv |
| `speichern` | Handler statt Absenden des Formulars |
| `formular` | `id` des Formulars, wenn die Leiste außerhalb steht (Editoren mit [Bereichen](bausteine-bereiche.md)) |
| `weitere` | weitere Knöpfe vor „Verwerfen“ (z. B. „Als Standard festlegen“) |
| `meldung`, `haupttext` | Meldung statt des Stands; eigene Beschriftung des Hauptknopfs (selten) |
| `links` | freier Platz links – nur noch Bestand; „… löschen“ gehört nach `loeschen` |

## Bestand { #bestand }

Die Mappe hat noch eine eigene Leiste in `MappeFormular.tsx` (grünes „Speichern“, kleines „Mappe löschen“); sie zieht in #1211 auf diesen Baustein um. In der Werkbank stehen „… löschen“-Knöpfe noch als roter Link unter `links`; die Bereichs-Issues #1213 und #1214 stellen sie auf `loeschen` um. `web/src/Speicherleiste.tsx` leitet auf den Baustein weiter, damit die Formulare ihren Import behalten.

![Bereich „Speicherleiste“ dunkel](bilder/muster-speicherleiste-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/speicherleiste/Speicherleiste.tsx`, Aussehen: `Speicherleiste.module.css` (Grundform `.speicherleiste` in `web/src/styles.css`), Logik der Knöpfe: `shared/src/entwurf.ts`
- Musterseite: `web/src/bausteine/speicherleiste/muster.tsx`
- Tests: `server/test/baustein-speicherleiste.test.ts`, `server/test/entwurf.test.ts`
