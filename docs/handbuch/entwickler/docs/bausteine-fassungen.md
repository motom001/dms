# Fassungen

`Fassungen` und `GeloeschteEintraege` (#1006) zeigen, **wer wann was** an einem Eintrag der Werkbank geändert hat: Liste wie die Historie einer Mappe, zwei Fassungen vergleichen, eine frühere wiederherstellen. Jeder Editor mit Fassungen nutzt denselben Baustein – Mappentyp, Ansicht, Nummernkreis, Stempel-Vorlage, Postfach, Paket-Einstellungen, Automatisierung.

![Bereich „Fassungen“ der Musterseite: drei Fassungen, eine leere Liste und gelöschte Einträge](bilder/muster-fassungen.png){ loading=lazy }

## Benutzen { #benutzen }

```tsx
import { Fassungen, GeloeschteEintraege } from '../bausteine';

// Im Editor, als letzter Bereich (in der BereichListe: ['fassungen', t('oberflaeche.fassungen.titel')], erst nach dem Anlegen):
{gespeichert && <Fassungen art="typ" eintrag={gespeichert.id} stand={gespeichert.geaendert} nachher={() => d.neuLaden()} klappe={klappe('fassungen')} />}

// Unter der Liste der Einträge:
<GeloeschteEintraege art="typ" />
```

| Angabe | Wofür |
| --- | --- |
| `art`, `eintrag` | Gegenstand (`FassungArt` aus `shared/src/fassungen.ts`) und Id bzw. Kennung des Eintrags |
| `klappe` | wie bei jedem [Bereich](bausteine-bereiche.md); ohne Sprungleiste `{ offen: true, umschalten() {}, fest: true }` |
| `stand` | ändert sich mit jedem Speichern (`geaendert`, `version` …) – dann lädt die Liste neu |
| `nachher` | nach dem Wiederherstellen: den Eintrag neu laden. Der Editor übernimmt den neuen Stand mit `useGespeichertNachziehen` (`Speicherleiste.tsx`), solange im Entwurf nichts geändert ist |
| `quelle` | woher die Fassungen kommen; Vorgabe die API. Musterseite und Tests reichen eine feste Quelle herein (`FassungenQuelle`) |

## Verhalten { #verhalten }

- **Liste:** je Fassung Zeitpunkt, wer (lesbar vom Server, z. B. „Paket Haushalt 1.4.0 (durch Markus)“), die ersten Änderungen; **Aktuell**, **Gelöscht** bzw. **aus Fassung n** als Chip. Aufgeklappt alle Änderungen und die Knöpfe.
- **Vergleichen:** zwei Fassungen wählen; über der Liste steht, was sich von der älteren zur neueren geändert hat.
- **Wiederherstellen:** erst die Vorschau (`GET …/fassungen/:nr`) – die Rückfrage nennt Änderungen gegenüber jetzt und Hinweise (Felder mit Werten, Mappen, die nicht mehr passen). Dann `POST …/fassungen/:nr/wiederherstellen` mit dem Stand der Vorschau (Konfliktschutz). Antwortet der Server mit einer Rückfrage des normalen Speicherns (`details.niemand`, `details.zusammengesetzt`, `details.adresse`), fragt der Baustein nach und schickt die Bestätigung mit.
- Die **Änderungen** schreibt der Server in der Sprache der Person (`shared/src/fassungsvergleich.ts`); die Oberfläche rechnet nichts selbst.

## Einen neuen Gegenstand anschließen { #neuer-gegenstand }

1. Art in `FASSUNG_ARTEN`, `FASSUNG_BEREICH` und `FASSUNG_PFAD` (`shared/src/fassungen.ts`) und im `CHECK` der Tabelle `fassungen` (Migration) ergänzen.
2. Beschreibung in `shared/src/fassungsvergleich.ts` (`beschreibeAenderungen`) – Sätze, kein JSON. Geheimnisse nie in den Stand.
3. Auf dem Server einen `Gegenstand` registrieren (`dienst.fassungen.registriere`): `stand`, `alle`, `stelleHer` über das normale Speichern, gern `hinweise` und `kontext`.
4. Nach jedem Speichern `kern.fassungen.halte(art, id)`, beim Löschen `kern.fassungen.geloescht(art, id, loesche)` – außer der Gegenstand liegt im Repo und steht in der Hülle (`server/src/fassungen/huelle.ts`).
5. Im Editor den Bereich einbauen, unter der Liste `GeloeschteEintraege`; Handbuch (Admin) nachziehen.

![Bereich „Fassungen“ dunkel](bilder/muster-fassungen-dunkel.png){ loading=lazy }
