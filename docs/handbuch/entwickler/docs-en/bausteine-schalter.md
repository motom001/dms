# Switch

`Schalter` (switch) is the building block for everything that is **on or off** – a function, a service, an automation (#1188). The same sliding switch everywhere, next to it the label **without a verb** (“WebDAV drive”, “Intake folder”) and the state as a word (“On”/“Off”), so it doesn't rely on colour alone.

![“Switch” section of the pattern page: on, off, disabled, mouse over, focus, rule, try it](bilder/muster-schalter.png){ loading=lazy }

## Switch or checkbox? { #regel }

| | What for | Examples |
| --- | --- | --- |
| **Switch** (`Schalter`) | something is on or off | WebDAV drive, intake folder, sending emails, automatic fetching of a mailbox, automatic backup, automations and workflow templates, expert mode |
| **Checkbox** (`HakenFeld`) | a choice or option | “Read only”, “also used for work”, “File original mail as .eml”, confirmations (“I have saved …”) |

**No duplicate state:** where a switch is at the top, “Status” doesn't repeat the state (“State: switched on” is gone). Status only shows what the switch doesn't – since when, last use, errors.

```tsx
import { Schalter } from '../bausteine';

// Part of a form: takes effect when saving.
<Schalter id="webdav-aktiv" an={e.aktiv} setze={(an) => setE({ ...e, aktiv: an })} beschriftung={t('werkbank.webdav.schalter')}
  hinweis={t('…ausgeschaltet-antwortet-mit-nicht')} />

// Takes effect at once: setze returns a promise – while it runs the switch is busy; an error appears below it.
<Schalter an={s.unscharf} beschriftung={t('suche.werkbank.unscharf.schalter')} setze={(an) => api.sucheSetze({ unscharf: an })} />
```

| Property | Meaning |
| --- | --- |
| `an`, `setze` | state and switching; `setze` may return a promise |
| `beschriftung` | what is on or off, without a verb; name for screen readers |
| `hinweis` | explanation below (e.g. what “off” means), linked via `aria-describedby` |
| `beschriftungVerbergen` | label for screen readers only – when it already stands next to it (head of an automation) |
| `gesperrt`, `id`, `className` | disabled (faded); fixed `id`; additional class |

## Accessibility { #barrierefreiheit }

`<button role="switch" aria-checked>`: screen readers say “switch, WebDAV drive, on”. The word “On/Off” next to it is `aria-hidden` (the state is in `aria-checked`). On is green (a state, [principle 2](bausteine.md#leitsaetze)), off is the input border colour (3:1). On a phone the switch is at least 44 px high. Keyboard: Space and Enter toggle.

![“Switch” section, dark](bilder/muster-schalter-dunkel.png){ loading=lazy }

## Converted (#1188) { #umgestellt }

WebDAV drive (without “State” under Status), intake folder, sending emails, mailbox (automatic fetching), automatic backup and weekly test, shrink new PDFs automatically, “Show translation” for everyone, “Export my data” for all users, similar spellings (search), sign-in with a provider (OIDC), expert mode, automations (before: own switch in `Automatisierungen.tsx`) and workflow templates (before: button “Switch on/off”).

## Code { #code }

- Building block: `web/src/bausteine/schalter/Schalter.tsx`, look: `Schalter.module.css`
- Pattern page: `web/src/bausteine/schalter/muster.tsx`
- Test: `server/test/baustein-schalter.test.ts` (building block and the converted places)
