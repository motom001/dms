# Schalter

`Schalter` ist der Baustein für alles, was **an oder aus** ist – eine Funktion, ein Dienst, eine Automatisierung (#1188). Überall derselbe Schiebeschalter, daneben die Beschriftung **ohne Verb** („WebDAV-Laufwerk“, „Eingangsordner“) und der Zustand als Wort („An“/„Aus“), damit er nicht nur an der Farbe hängt.

![Bereich „Schalter“ der Musterseite: an, aus, gesperrt, Maus darüber, Fokus, Regel, Ausprobieren](bilder/muster-schalter.png){ loading=lazy }

## Schalter oder Haken? { #regel }

| | Wofür | Beispiele |
| --- | --- | --- |
| **Schalter** (`Schalter`) | etwas ist an oder aus | WebDAV-Laufwerk, Eingangsordner, E-Mail-Versand, Automatischer Abruf eines Postfachs, Automatische Sicherung, Automatisierungen und Ablaufvorlagen, Expertenmodus |
| **Haken** (`HakenFeld`) | eine Auswahl oder Option | „Nur lesend“, „auch beruflich genutzt“, „Original-Mail als .eml ablegen“, Bestätigungen („Ich habe … gesichert“) |

**Keine doppelte Zustandsanzeige:** Wo oben ein Schalter steht, wiederholt „Stand“ den Zustand nicht („Zustand: eingeschaltet“ fällt weg). Stand zeigt nur, was der Schalter nicht zeigt – seit wann, letzte Nutzung, Fehler.

```tsx
import { Schalter } from '../bausteine';

// Teil eines Formulars: wirkt mit dem Speichern.
<Schalter id="webdav-aktiv" an={e.aktiv} setze={(an) => setE({ ...e, aktiv: an })} beschriftung={t('werkbank.webdav.schalter')}
  hinweis={t('…ausgeschaltet-antwortet-mit-nicht')} />

// Sofort wirksam: setze liefert ein Promise – solange es läuft, ist der Schalter beschäftigt; ein Fehler steht darunter.
<Schalter an={s.unscharf} beschriftung={t('suche.werkbank.unscharf.schalter')} setze={(an) => api.sucheSetze({ unscharf: an })} />
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `an`, `setze` | Zustand und Umschalten; `setze` darf ein Promise liefern |
| `beschriftung` | was an oder aus ist, ohne Verb; Name für Screenreader |
| `hinweis` | Erklärung darunter (z. B. was „aus“ bedeutet), über `aria-describedby` verknüpft |
| `beschriftungVerbergen` | Beschriftung nur für Screenreader – wenn sie schon daneben steht (Kopf einer Automatisierung) |
| `gesperrt`, `id`, `className` | gesperrt (blass); feste `id`; zusätzliche Klasse |

## Barrierefreiheit { #barrierefreiheit }

`<button role="switch" aria-checked>`: Screenreader sagen „Schalter, WebDAV-Laufwerk, an“. Das Wort „An/Aus“ daneben ist `aria-hidden` (der Zustand steckt in `aria-checked`). An ist Grün (ein Zustand, [Leitsatz 2](bausteine.md#leitsaetze)), aus ist der Rand der Eingaben (3:1). Am Handy ist der Schalter mindestens 44 px hoch. Tastatur: Leertaste und Enter schalten.

![Bereich „Schalter“ dunkel](bilder/muster-schalter-dunkel.png){ loading=lazy }

## Umgestellt (#1188) { #umgestellt }

WebDAV-Laufwerk (ohne „Zustand“ unter Stand), Eingangsordner, E-Mail-Versand, Postfach (Automatischer Abruf), Automatische Sicherung und wöchentliche Probe, Neue PDFs automatisch verkleinern, „Übersetzung anzeigen“ für alle, „Meine Daten exportieren“ für alle Benutzer, Ähnliche Schreibweisen (Suche), Anmeldung über einen Anbieter (OIDC), Expertenmodus, Automatisierungen (vorher eigener Schalter in `Automatisierungen.tsx`) und Ablaufvorlagen (vorher Knopf „Einschalten/Ausschalten“).

## Code { #code }

- Baustein: `web/src/bausteine/schalter/Schalter.tsx`, Aussehen: `Schalter.module.css`
- Musterseite: `web/src/bausteine/schalter/muster.tsx`
- Test: `server/test/baustein-schalter.test.ts` (Baustein und die umgestellten Stellen)
