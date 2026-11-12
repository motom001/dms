# Versions

`Fassungen` and `GeloeschteEintraege` (#1006) show **who changed what and when** on an entry of the Workbench: a list like the history of a folder, compare two versions, restore an earlier one. Every editor with versions uses the same component – folder type, view, number sequence, stamp template, mailbox, package settings, automation.

![“Versions” section of the pattern page: three versions, an empty list and deleted entries](bilder/muster-fassungen.png){ loading=lazy }

## Usage { #benutzen }

```tsx
import { Fassungen, GeloeschteEintraege } from '../bausteine';

// In the editor, as the last area (in the BereichListe: ['fassungen', t('oberflaeche.fassungen.titel')], only after creating):
{gespeichert && <Fassungen art="typ" eintrag={gespeichert.id} stand={gespeichert.geaendert} nachher={() => d.neuLaden()} klappe={klappe('fassungen')} />}

// Below the list of entries:
<GeloeschteEintraege art="typ" />
```

| Prop | Purpose |
| --- | --- |
| `art`, `eintrag` | kind of entry (`FassungArt` from `shared/src/fassungen.ts`) and the id or key of the entry |
| `klappe` | as for every [area](bausteine-bereiche.md); without a jump bar `{ offen: true, umschalten() {}, fest: true }` |
| `stand` | changes with every save (`geaendert`, `version` …) – then the list reloads |
| `nachher` | after restoring: reload the entry. The editor takes over the new state with `useGespeichertNachziehen` (`Speicherleiste.tsx`) as long as nothing in the draft has changed |
| `quelle` | where the versions come from; defaults to the API. The pattern page and tests pass a fixed source (`FassungenQuelle`) |

## Behaviour { #verhalten }

- **List:** per version the time, who (readable from the server, e.g. “Package Household 1.4.0 (by Markus)”), the first changes; **Current**, **Deleted** or **from version n** as a chip. Expanded: all changes and the buttons.
- **Compare:** select two versions; above the list it says what changed from the older to the newer one.
- **Restore:** first the preview (`GET …/fassungen/:nr`) – the confirmation names the changes compared with now and notes (fields with values, folders that no longer match). Then `POST …/fassungen/:nr/wiederherstellen` with the state of the preview (conflict protection). If the server answers with a question of the normal save (`details.niemand`, `details.zusammengesetzt`, `details.adresse`), the component asks and sends the confirmation along.
- The **changes** are written by the server in the person's language (`shared/src/fassungsvergleich.ts`); the interface computes nothing itself.

## Connecting a new kind of entry { #neuer-gegenstand }

1. Add the kind to `FASSUNG_ARTEN`, `FASSUNG_BEREICH` and `FASSUNG_PFAD` (`shared/src/fassungen.ts`) and to the `CHECK` of the table `fassungen` (migration).
2. Describe changes in `shared/src/fassungsvergleich.ts` (`beschreibeAenderungen`) – sentences, no JSON. Never put secrets into the state.
3. On the server, register a `Gegenstand` (`dienst.fassungen.registriere`): `stand`, `alle`, `stelleHer` through the normal save, ideally `hinweise` and `kontext`.
4. After every save `kern.fassungen.halte(art, id)`, when deleting `kern.fassungen.geloescht(art, id, loesche)` – unless the entry lives in the repo and is covered by the wrapper (`server/src/fassungen/huelle.ts`).
5. Add the area to the editor and `GeloeschteEintraege` below the list; update the admin manual.

![“Versions” section, dark](bilder/muster-fassungen-dunkel.png){ loading=lazy }
