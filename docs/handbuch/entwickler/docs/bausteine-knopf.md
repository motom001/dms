# Knopf

`Knopf` ist der Baustein für jeden Knopf (#968). Er legt die Art fest (Anlegen, Haupt, Neben, Gefahr, Link), zeigt gesperrt, „läuft“ und das Ergebnis überall gleich und setzt `aria` selbst – damit jeder Knopf gleich zeigt, ob er gerade arbeitet oder warum er nicht geht.

![Bereich „Knopf“ der Musterseite: Arten, klein, Maus darüber, Tastaturfokus, gesperrt, gesperrt mit Grund, läuft, nur Symbol, Ergebnis, Fehler, Knopfreihe](bilder/muster-knopf.png){ loading=lazy }

## Arten { #arten }

| Art | Aussehen | Wofür | Beispiel |
| --- | --- | --- | --- |
| `anlegen` | grün | etwas Neues in einer Liste anlegen – oben rechts im Listenkopf, Beschriftung **„+ Neu“** | „+ Neu“ bei Mappentypen, Ansichten, Benutzern, in der Ablage |
| `haupt` | Akzentfarbe (blau) | die Haupthandlung eines Formulars oder Schritts – höchstens ein Hauptknopf je Bereich | „Speichern“, „Erzeugen“, „Jetzt sichern“ |
| `neben` | Fläche mit Rahmen | alles Übrige (Vorgabe) | „Verbindung testen“, „Jetzt prüfen“, „Abbrechen“ |
| `gefahr` | Fehlerfarbe | etwas, das sich nicht oder schwer zurücknehmen lässt; fast immer mit Rückfrage | „Löschen“, „Jetzt sofort sperren“ |
| `link` | wie ein Verweis | **nur für Wege**: zurück, zur Liste, abbrechen ohne Folgen – nie für eine Handlung, die etwas ändert | „Zur Liste“, „Zurück“ |

Die Farben kommen aus den Tokens (`--gruen`, `--akzent`, `--schlecht`) und gelten in jedem Design. Größe: `groesse="klein"` in Listenköpfen, Tabellenzeilen und Leisten, sonst normal.

**„+ Neu“ (#989):** Steht auf einer Seite nur eine Sache zum Anlegen, heißt der Knopf genau „+ Neu“. Lassen sich auf einer Seite mehrere Dinge anlegen (z. B. Mein Konto mit API-Schlüsseln und Webhooks), heißt er „+ Neu…“ mit dem Gegenstand: „+ Neuer Schlüssel“, „+ Neuer Webhook“.

```tsx
import { Knopf, KnopfLink, knopfAussehen, type KnopfErgebnis } from '../bausteine';

<KnopfLink to="/werkbank/benutzer/neu" art="anlegen" groesse="klein">{t('werkbank.benutzer.neu')}</KnopfLink>

<Knopf onClick={jetztPruefen} laeuftText={t('…prueft')}>{t('…jetzt-pruefen')}</Knopf>

async function jetztPruefen(): Promise<KnopfErgebnis> {
  const r = await api.eingangsordnerPruefen();
  return { art: 'gut', text: r.uebernommen ? t('…uebernommen', { anzahl: r.uebernommen }) : t('…nichts-gefunden') };
}
```

## Varianten { #varianten }

| Variante | Wann |
| --- | --- |
| `Knopf` | ein `<button>`: jede Handlung |
| `KnopfLink` | ein Weg innerhalb von Ablago, der wie ein Knopf aussieht – z. B. „+ Neu“, das die Seite zum Anlegen öffnet |
| `knopfAussehen({ art, groesse })` | nur Klassen und `data-knopf` für Elemente, die kein `<button>` sein können, etwa das `<summary>` einer Aufklappform |
| `ErgebnisBlock` | ausführliches Ergebnis unter einem Knopf (z. B. eine Prüfliste): `aria-live`, rollt sanft ins Bild |

| Eigenschaft (`Knopf`) | Bedeutung |
| --- | --- |
| `art` | `anlegen`, `haupt`, `neben` (Vorgabe), `gefahr`, `link` |
| `groesse` | `normal` (Vorgabe) oder `klein` |
| `onClick` | darf ein Promise liefern – siehe [Asynchrone Handler](#asynchron) |
| `gesperrt` | `true` (gesperrt, der Grund steht ohnehin daneben) oder der **Grund als Text** |
| `laeuft`, `laeuftText` | „läuft“ von außen (Formular sendet, Auftrag im Hintergrund) und der Text dazu (Vorgabe „Läuft …“) |
| `ergebnis` | Ergebnis von außen, z. B. wenn ein Auftrag im Hintergrund fertig ist |
| `nurSymbol` | Knopf nur mit Symbol: der Name für Screenreader (Pflicht) und zugleich der Tooltip |
| `type`, `className`, weitere | wie bei `<button>`; Vorgabe für `type` ist `button` |

## Zustände { #zustaende }

| Zustand | So entsteht er | So sieht er aus |
| --- | --- | --- |
| Maus darüber | – | Neben: Fläche `--senke`, Rahmen `--leise`; Haupt, Anlegen, Gefahr: Fläche mit `--knopf-hover` (hell etwas dunkler, dunkel etwas heller); Link: unterstrichen |
| Tastaturfokus | – | Ring 2 px mit Abstand in `--akzent`, bei Gefahr in `--schlecht` |
| gesperrt | `gesperrt` | blass, kein Hover; ohne Grund `disabled`, mit Grund bleibt er erreichbar (`aria-disabled`) und der Grund steht darunter |
| läuft | `onClick` liefert ein Promise oder `laeuft` | Beschriftung unsichtbar an ihrem Platz, darüber Kreisel und „Läuft …“ – der Knopf behält Breite und Platz |
| Ergebnis | Rückgabe `KnopfErgebnis` oder `ergebnis` | unter dem Knopf im Stil der Hinweise: `gut`, `info`, `warn`, `schlecht`, mit Symbol |
| Fehler | das Promise scheitert | wie ein Ergebnis `schlecht`, mit der Meldung des Fehlers |

![Bereich „Knopf“ dunkel](bilder/muster-knopf-dunkel.png){ loading=lazy }

## Asynchrone Handler { #asynchron }

`onClick` darf `async` sein. Der Knopf

1. zeigt sofort „läuft“ (`aria-busy="true"`) und nimmt keinen zweiten Klick an – auch nicht per Enter in einem Formularfeld;
2. zeigt danach, was das Promise liefert, wenn es ein `KnopfErgebnis` ist (`{ art, text }`); anderes (z. B. `true`) zeigt er nicht;
3. **fängt einen Fehler ab** und zeigt ihn direkt am Knopf, statt ihn in der Konsole verschwinden zu lassen. Das ist der gemeinsame Weg für asynchrone Handler in der Oberfläche (#1011).

Der Text des Fehlers ist die Meldung der Schnittstelle; ohne eine heißt es „Das hat nicht geklappt. Bitte noch einmal versuchen.“

**Ohne Knopf** – `onSubmit` eines Formulars, `onChange` eines Hakens, ein Ereignis am Fenster – nimmt man `abfangen` aus `../bausteine`. Es gibt React kein Promise zurück und leitet einen Fehler an die Meldung, die die Stelle ohnehin hat; hat sie keine, erscheint er als Hinweisfenster. Der Handler läuft sofort an, `e.preventDefault()` am Anfang wirkt also wie gewohnt.

```tsx
<form onSubmit={abfangen(speichern, (text) => setMeldung({ art: 'schlecht', text }))}>
<input type="checkbox" onChange={abfangen(async (e: ChangeEvent<HTMLInputElement>) => { … })} />
```

ESLint prüft das streng (`@typescript-eslint/no-misused-promises`, `no-floating-promises`); seit #1011 steht für die Oberfläche keine Ausnahme mehr dafür in `eslint-suppressions.json`. Eine Ladefunktion, die ihre Fehler selbst zeigt, hängt man mit `() => void laden()` an ein Ereignis oder einen Takt.

## Ergebnis am Knopf { #ergebnis }

Ein Ergebnis steht **dort, wo geklickt wurde** (Muster B2 im Musterkatalog, #986): direkt unter dem Knopf; in einer Knopfreihe (`<div className="knoepfe">`) unter allen Knöpfen der Reihe, damit die Knöpfe nebeneinander stehen bleiben. Darüber verschiebt sich nichts. Liegt die Stelle nicht ganz im sichtbaren Bereich, rollt die Seite sanft dorthin (bei „Bewegung reduzieren“ ohne Animation). Der Ergebnisbereich steht immer im Dokument (`role="status"`, leer ohne Platz), damit Screenreader ein neues Ergebnis ansagen.

Für mehr als einen Satz – eine Prüfliste, ein Text mit Einzelheiten – gehört das Ergebnis in einen `ErgebnisBlock` direkt unter die Knopfreihe:

```tsx
<div className="knoepfe"><Knopf type="submit" laeuft={laeuft}>{t('…verbindung-pruefen')}</Knopf></div>
<ErgebnisBlock anlass={pruefung}>{pruefung && <PruefungAnzeige p={pruefung} />}</ErgebnisBlock>
```

Meldungen zum **Speichern** bleiben bei der Speicherleiste; oben auf der Seite stehen nur Hinweise zum Zustand der ganzen Seite.

## Wann verwenden, wann nicht { #wann }

**Verwenden** für jeden neuen Knopf – vor allem für Handlungen, die etwas auf dem Server tun („Prüfen“, „Testen“, „Jetzt …“). Bestehende Knöpfe stellt um, wer die Stelle ohnehin ändert. Bisher umgestellt: die Anlege-Knöpfe der Listen in Werkbank, Ablage und Mein Konto (#989) und die Knöpfe „Prüfen“, „Testen“ und „Jetzt …“ der Werkbank (#986).

**Nicht verwenden**

- für Einträge eines Menüs (`role="menuitem"`), Reiter, Aufklappköpfe und Kacheln – die haben eigene Muster;
- für Verweise auf fremde Seiten oder ins Handbuch (`<a className="verweis">`);
- für Knöpfe, deren Aussehen ein Design ganz bestimmt (Vertretungs- und Verwaltungsbalken).

## Barrierefreiheit { #barrierefreiheit }

Der Baustein setzt selbst:

- `aria-busy="true"` und `aria-disabled="true"`, solange er läuft – der Knopf behält den Tastaturfokus (kein `disabled`, das den Fokus verlöre); die Beschriftung bleibt sein Name, „Läuft …“ ist nur zu sehen;
- bei `gesperrt` mit Grund `aria-disabled="true"` und `aria-describedby` auf den sichtbaren Grund; der Knopf bleibt mit der Tab-Taste erreichbar, damit man den Grund hört – ein `title` allein reicht nicht (am Handy und für Screenreader unsichtbar);
- `aria-describedby` auf ein angezeigtes Ergebnis und einen Ergebnisbereich mit `role="status"`;
- bei `nurSymbol` `aria-label` und `title`; das Symbol selbst ist `aria-hidden`;
- `data-knopf` mit der Art – die Rauchtests zählen damit die Anlege-Knöpfe ohne Art „Anlegen“ (muss 0 sein).

Hover und Fokus sind für alle Arten hell und dunkel sichtbar; die Musterseite zeigt sie stehend, die Rauchtests prüfen sie mit axe-core.

## Richtig und falsch { #richtig-falsch }

| Richtig | Falsch |
| --- | --- |
| `<KnopfLink to="…/neu" art="anlegen" groesse="klein">+ Neu</KnopfLink>` | „+ Neu“ in Blau oder als „Neuer Benutzer“ |
| `<Knopf art="haupt" type="submit">Speichern</Knopf>` – ein Hauptknopf je Formular | drei blaue Knöpfe nebeneinander |
| `onClick={async () => { await api.x(); return { art: 'gut', text: … }; }}` | `onClick={() => void api.x().then(…)}` ohne `catch` |
| `gesperrt={geaendert && t('…erst-speichern')}` | `disabled title="Erst speichern"` |
| Ergebnis am Knopf (Rückgabe oder `ErgebnisBlock`) | Ergebnis oben auf der Seite, während der Knopf unten steht |
| `<Knopf nurSymbol={t('…neu-laden')}><Symbol name="neu-laden" /></Knopf>` | ein Symbolknopf ohne Namen |
| `art="link"` für „Zur Liste“ | `art="link"` für „Löschen“ oder „Senden“ |

## Code { #code }

- Baustein: `web/src/bausteine/knopf/Knopf.tsx`, Aussehen: `Knopf.module.css` (Grundform und Farben je Art aus `.knopf` in `web/src/styles.css`)
- Musterseite: `web/src/bausteine/knopf/muster.tsx`
- Test: `server/test/baustein-knopf.test.ts` (zeichnet mit react-dom/server und prüft Arten, `aria-*` und `data-knopf`); Rauchtests in `web/rauchtest/rauchtest.mjs`: Knopf auf der Musterseite (läuft, Ergebnis, Fehler), „+ Neu“ in Listen (#989), Eingangsordner „Jetzt prüfen“ (#986)
