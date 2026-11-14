# Knopf

`Knopf` ist der Baustein für jeden Knopf (#968, nachgeschärft in #1210). Er legt die Art fest (Haupt, Anlegen, Neben, Gefahr, Link), zeigt gesperrt, „läuft“ und das Ergebnis überall gleich und setzt `aria` selbst – damit jeder Knopf gleich zeigt, was er tut, ob er gerade arbeitet oder warum er nicht geht. Die [Leitsätze](bausteine.md#leitsaetze) gelten für jeden Knopf.

![Bereich „Knopf“ der Musterseite: Arten, klein, Maus darüber, Tastaturfokus, Gefahr in Ruhe, mit Maus und Fokus, die Rückfrage, gesperrt in zwei Formen, die geöffnete Erklärung, läuft, nur Symbol, Ergebnis, Fehler, Knopfreihe](bilder/muster-knopf.png){ loading=lazy }

## Arten { #arten }

| Art | Aussehen | Wofür | Beispiel |
| --- | --- | --- | --- |
| `haupt` | blau gefüllt (Akzentfarbe) | die Hauptaktion eines Formulars oder Schritts – höchstens eine je Bereich | „Nummernkreis speichern“, „Weiter“, „Übernehmen“, „Jetzt sichern“ |
| `anlegen` | grün gefüllt | **nur** etwas Neues anfangen; die Beschriftung beginnt mit **„+“** | „+ Neu“, „+ Post“, „+ Zeile“, „+ Notfallkontakt“ |
| `neben` | Fläche mit Rand | alles Übrige (Vorgabe), auch „Verwerfen“ und „Abbrechen“ | „Verbindung testen“, „Änderungen verwerfen“ |
| `gefahr` | **wie Neben, mit Symbol**; Schrift und Rand erst bei Maus und Tastaturfokus rot | etwas, bei dem Gespeichertes verloren geht oder jemand ausgesperrt wird – **immer mit Rückfrage**, die der Knopf selbst stellt | „Löschen“, „Jetzt sofort sperren“, „Alle abmelden“ |
| `link` | wie ein Verweis | **nur für Wege**: zurück, zur Liste – nie für eine Handlung, die etwas ändert | „Zur Liste“, „Zurück“ |

Die Farben kommen aus den Tokens (`--akzent`, `--gruen`, `--schlecht`) und gelten in jedem Design. **Farbklassen über `className`** (`gefahr`, `gefahr-rand`, `gruen`, `primaer`) gibt es am Knopf nicht – die Farbe kommt aus der Art; ESLint meldet es (`ablago/knopf-farben`). Größe: `groesse="klein"` in Listenköpfen, Tabellenzeilen und Leisten, sonst normal. Am Handy hat jeder Knopf eine Tippfläche von mindestens 44 × 44 px, auch der kleine ([Am Handy](bausteine.md#handy)).

**Rot gefüllt** ist nur der Bestätigungsknopf einer Rückfrage – der Moment der Entscheidung (Leitsatz 5). Ihn setzt der Baustein `Rueckfragen` (`web/src/bausteine/rueckfrage/`); auf einer Seite gibt es ihn nicht.

**Was sich rückgängig machen lässt** – einen Verweis aus einem Feld nehmen, eine Zeile vor dem Speichern aus einer Liste entfernen – ist kein Gefahr-Knopf, sondern ein normales „Entfernen“ (Art Neben oder Link) bzw. ein „×“.

**„+ Neu“ (#989):** Steht auf einer Seite nur eine Sache zum Anlegen, heißt der Knopf genau „+ Neu“. Lassen sich auf einer Seite mehrere Dinge anlegen, heißt er „+ Neu…“ mit dem Gegenstand, z. B. „+ Neuer Schlüssel“.

```tsx
import { Knopf, KnopfLink, type KnopfErgebnis } from '../bausteine';

<KnopfLink to="/werkbank/benutzer/neu" art="anlegen" groesse="klein">{t('werkbank.benutzer.neu')}</KnopfLink>

<Knopf onClick={jetztPruefen} laeuftText={t('…prueft')}>{t('…jetzt-pruefen')}</Knopf>

// Gefahr: Symbol und Rückfrage sind Pflicht; onClick läuft erst nach „Löschen“.
<Knopf art="gefahr" symbol="geloescht" onClick={() => api.notizLoeschen(n.id)}
  rueckfrage={{ titel: t('…notiz-loeschen'), text: t('…laesst-sich-nicht-rueckgaengig'), ja: t('…loeschen') }}>
  {t('…loeschen')}
</Knopf>

async function jetztPruefen(): Promise<KnopfErgebnis> {
  const r = await api.eingangsordnerPruefen();
  return { art: 'gut', text: r.uebernommen ? t('…uebernommen', { anzahl: r.uebernommen }) : t('…nichts-gefunden') };
}
```

## Varianten { #varianten }

| Variante | Wann |
| --- | --- |
| `Knopf` | ein `<button>`: jede Handlung |
| `KnopfLink` | ein Weg innerhalb von Ablago, der wie ein Knopf aussieht – z. B. „+ Neu“, das die Seite zum Anlegen öffnet (nie Gefahr) |
| `knopfAussehen({ art, groesse })` | nur Klassen und `data-knopf` für Elemente, die kein `<button>` sein können, etwa das `<summary>` einer Aufklappform (nie Gefahr – die braucht die Rückfrage am Knopf) |
| `ErgebnisBlock` | ausführliches Ergebnis unter einem Knopf (z. B. eine Prüfliste): `aria-live`, rollt sanft ins Bild |
| `rueckfrage()`, `hinweis()` | Rückfrage ohne Gefahr-Knopf (z. B. „Neue Adresse erzeugen?“) und Hinweisfenster, aus `web/src/rueckfrage.tsx`; angezeigt im Baustein `Rueckfragen` |

| Eigenschaft (`Knopf`) | Bedeutung |
| --- | --- |
| `art` | `haupt`, `anlegen`, `neben` (Vorgabe), `gefahr`, `link` |
| `groesse` | `normal` (Vorgabe) oder `klein` |
| `symbol` | Symbol vor der Beschriftung (Name aus `Symbol.tsx`, Lucide); **Pflicht bei Gefahr** |
| `rueckfrage` | **nur und Pflicht bei Gefahr:** `{ titel, text?, ja, nein?, bestaetigeMit?, mitGrund? }` – Titel als Frage, Folgen, Verb auf dem Bestätigungsknopf; `mitGrund` (`true` oder ein Vorschlag) fragt beim Löschen nach dem Grund fürs Löschprotokoll, `onClick(e, anlass)` bekommt ihn |
| `onClick` | darf ein Promise liefern – siehe [Asynchrone Handler](#asynchron); bei Gefahr erst nach „Ja“ |
| `gesperrt` | `true` = nichts zu tun (blass); ein **Grund als Text** oder eine `KnopfSperre` = gesperrt aus einem Grund (gestrichelt, Schloss, ⓘ) – siehe [Gesperrt](#gesperrt) |
| `laeuft`, `laeuftText` | „läuft“ von außen (Formular sendet, Auftrag im Hintergrund) und der Text dazu (Vorgabe „Läuft …“) |
| `ergebnis` | Ergebnis von außen, z. B. wenn ein Auftrag im Hintergrund fertig ist |
| `nurSymbol` | Knopf nur mit Symbol: der Name für Screenreader (Pflicht) und zugleich der Tooltip |
| `ref`, `type`, weitere | wie bei `<button>`; Vorgabe für `type` ist `button` (Gefahr und gesperrt mit Grund sind immer `button`) |

Die Typprüfung lässt `art="gefahr"` ohne `rueckfrage` oder ohne `symbol` nicht zu, ebenso `rueckfrage` an einer anderen Art (`web/src/bausteine/knopf/typpruefung.ts` hält das fest).

## Gesperrt { #gesperrt }

Es gibt genau zwei Formen (Leitsatz 6):

| Form | So entsteht sie | So sieht sie aus | Wann |
| --- | --- | --- | --- |
| **Nichts zu tun** | `gesperrt` (bzw. `gesperrt={!geaendert}`) | blass (`disabled`), ohne Erklärung | Speichern oder Verwerfen ohne Änderung, leere Auswahl |
| **Gesperrt aus einem Grund** | `gesperrt="<Grund>"` oder `gesperrt={{ grund, titel?, eintraege?, weitere?, stattdessen? }}` (`KnopfSperre`) | gestrichelter Rand mit Schloss (statt des eigenen Symbols), daneben ein kleines ⓘ; erreichbar (`aria-disabled`) | Löschen mit Verweisen, fehlendes Recht, Archivmodus, „erst speichern“ |

Ein Klick auf den gesperrten Knopf oder das ⓘ öffnet die **Erklärung am Knopf**: fett der Titel (Vorgabe „Geht gerade nicht:“) und der Grund, darunter die betroffenen Einträge (`eintraege`, auf Wunsch „und *n* weitere“) und unter **„Stattdessen“** die Wege, die trotzdem gehen – als **Knöpfe**, nie als Links; ein schwerer Eingriff wie „Mit verknüpften Mappen löschen …“ als Gefahr-Knopf mit eigener Rückfrage. Esc schließt sie und gibt den Fokus an den Knopf zurück, ein Klick daneben schließt sie ebenfalls. Sie öffnet sich **über dem Knopf** – so verlängert sie am Seitenende die Seite nicht; nur wenn oben im sichtbaren Bereich kein Platz ist, darunter. Waagerecht bleibt sie im Bildschirm.

**Kein langer Satz in der Zeile** und **kein Grund nur im Tooltip** (`title` ist am Handy und für Screenreader unsichtbar). Gestrichelt heißt überall „für dich gesperrt“, wie „nur lesen“ am Feld (Musterkatalog C4). Kein „?“: Das führt ins Handbuch (C7); ⓘ erklärt genau diesen Fall.

```tsx
<Knopf gesperrt={{
  grund: sperre.grund,
  titel: t('…loeschen-nicht-moeglich'),
  eintraege: verweise.slice(0, 8).map((r) => <Link to={…}>{r.titel}</Link>),
  weitere: verweise.length - 8,
  stattdessen: <Knopf groesse="klein" onClick={mitVerknuepften}>{t('…mit-verknuepften-loeschen')}</Knopf>,
}}>{t('mappen.loeschen.knopf')}</Knopf>
```

![Gesperrt in zwei Formen und die geöffnete Erklärung, dunkel](bilder/muster-knopf-dunkel.png){ loading=lazy }

## Zustände { #zustaende }

| Zustand | So entsteht er | So sieht er aus |
| --- | --- | --- |
| Maus darüber | – | Neben: Fläche `--senke`, Rahmen `--leise`; Gefahr: ebenso, dazu Schrift und Rand `--schlecht`; Haupt und Anlegen: Fläche mit `--knopf-hover` (hell etwas dunkler, dunkel etwas heller); Link: unterstrichen |
| Tastaturfokus | – | Ring 2 px mit Abstand in `--akzent`; bei Gefahr Ring, Schrift und Rand in `--schlecht` |
| nichts zu tun | `gesperrt` | blass, kein Hover, `disabled` |
| gesperrt aus einem Grund | `gesperrt="…"` oder `KnopfSperre` | gestrichelt mit Schloss, Schrift `--leise`, ⓘ daneben, Erklärung auf Klick |
| läuft | `onClick` liefert ein Promise oder `laeuft` | Beschriftung unsichtbar an ihrem Platz, darüber Kreisel und „Läuft …“ – der Knopf behält Breite und Platz |
| Ergebnis | Rückgabe `KnopfErgebnis` oder `ergebnis` | unter dem Knopf im Stil der Hinweise: `gut`, `info`, `warn`, `schlecht`, mit Symbol |
| Fehler | das Promise scheitert | wie ein Ergebnis `schlecht`, mit der Meldung des Fehlers |

## Rückfrage { #rueckfrage }

Ein Gefahr-Knopf stellt seine Rückfrage selbst: Titel als Frage („Notiz löschen?“), ein oder zwei Sätze zu den Folgen, auf dem Bestätigungsknopf das Verb („Löschen“). Der Fokus startet auf **„Abbrechen“** (Art Neben), damit Enter nichts zerstört; Esc bricht ab. Nur der Bestätigungsknopf ist **rot gefüllt**. Für sehr Gefährliches verlangt `bestaetigeMit` ein Wort zum Eintippen. Erst nach „Ja“ läuft `onClick` – mit „läuft“, Ergebnis und Fehler wie bei jedem Knopf.

Rückfragen ohne Gefahr (etwa „Neue Adresse erzeugen?“) stellt man wie bisher mit `rueckfrage()` aus `web/src/rueckfrage.tsx`; ihr Bestätigungsknopf ist blau. Angezeigt werden alle im Baustein `Rueckfragen`, den `start.tsx` einmal einbindet.

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

Ein Ergebnis steht **dort, wo geklickt wurde** (Muster B2 im Musterkatalog, #986): direkt unter dem Knopf; in einer Knopfreihe (`<div className="knoepfe">`) unter allen Knöpfen der Reihe, damit die Knöpfe nebeneinander stehen bleiben. Darüber verschiebt sich nichts. Liegt die Stelle nicht ganz im sichtbaren Bereich, rollt die Seite bei einem neuen Ergebnis sanft dorthin (bei „Bewegung reduzieren“ ohne Animation); ein Ergebnis, das beim Öffnen der Seite schon dasteht, holt die Seite nicht dorthin (#1027). Der Ergebnisbereich steht immer im Dokument (`role="status"`, leer ohne Platz), damit Screenreader ein neues Ergebnis ansagen.

Für mehr als einen Satz – eine Prüfliste, ein Text mit Einzelheiten – gehört das Ergebnis in einen `ErgebnisBlock` direkt unter die Knopfreihe:

```tsx
<div className="knoepfe"><Knopf type="submit" laeuft={laeuft}>{t('…verbindung-pruefen')}</Knopf></div>
<ErgebnisBlock anlass={pruefung}>{pruefung && <PruefungAnzeige p={pruefung} />}</ErgebnisBlock>
```

Meldungen zum **Speichern** bleiben bei der [Speicherleiste](bausteine-speicherleiste.md); oben auf der Seite stehen nur Hinweise zum Zustand der ganzen Seite.

## Wann verwenden, wann nicht { #wann }

**Verwenden** für jeden neuen Knopf – vor allem für Handlungen, die etwas auf dem Server tun („Prüfen“, „Testen“, „Jetzt …“). Bestehende Knöpfe stellt um, wer die Stelle ohnehin ändert; die Umstellung des ganzen Bestands auf die Leitsätze folgt in #1211–#1215. Bisher umgestellt: die Anlege-Knöpfe der Listen in Werkbank, Ablage und Mein Konto (#989), die Knöpfe „Prüfen“, „Testen“ und „Jetzt …“ der Werkbank (#986), die gesperrten Knöpfe „Mappe löschen“ und „Herunterladen“ (#1210).

**Nicht verwenden**

- für Einträge eines Menüs (`role="menuitem"`), Aufklappköpfe und Kacheln – die haben eigene Muster; für Register den Baustein [Reiter](bausteine-reiter.md);
- für Verweise auf fremde Seiten oder ins Handbuch (`<a className="verweis">`);
- für Knöpfe, deren Aussehen ein Design ganz bestimmt (Vertretungs- und Verwaltungsbalken).

## Barrierefreiheit { #barrierefreiheit }

Der Baustein setzt selbst:

- `aria-busy="true"` und `aria-disabled="true"`, solange er läuft – der Knopf behält den Tastaturfokus (kein `disabled`, das den Fokus verlöre); die Beschriftung bleibt sein Name, „Läuft …“ ist nur zu sehen;
- bei Gefahr `aria-haspopup="dialog"` – der Knopf öffnet die Rückfrage (`role="alertdialog"`, Fokus auf „Abbrechen“);
- bei gesperrt aus einem Grund `aria-disabled="true"`, `aria-describedby` auf den Grund (auch bei geschlossener Erklärung), `aria-expanded` und `aria-controls` zur Erklärung; das ⓘ heißt „Warum gesperrt? <Knopf>“ und ist am Handy 44 × 44 px groß; der Knopf bleibt mit der Tab-Taste erreichbar, damit man den Grund hört;
- `aria-describedby` auf ein angezeigtes Ergebnis und einen Ergebnisbereich mit `role="status"`;
- bei `nurSymbol` `aria-label` und `title`; Symbole selbst sind `aria-hidden`;
- `data-knopf` mit der Art – die Rauchtests prüfen damit auf jeder besuchten Seite: Anlegen beginnt mit „+“, Gefahr öffnet eine Rückfrage, rot gefüllt (`data-knopf="entscheidung"`) nur in einer Rückfrage ([Rauchtest und Bilder](bausteine.md#rauchtest)).

Hover und Fokus sind für alle Arten hell und dunkel sichtbar; die Musterseite zeigt sie stehend, die Rauchtests prüfen sie mit axe-core (auch `color-contrast`).

## Richtig und falsch { #richtig-falsch }

| Richtig | Falsch |
| --- | --- |
| `<KnopfLink to="…/neu" art="anlegen" groesse="klein">+ Neu</KnopfLink>` | „+ Neu“ in Blau oder als „Neuer Benutzer“ |
| `<Knopf art="haupt" type="submit">Speichern</Knopf>` – ein Hauptknopf je Formular | grünes „Speichern“, drei blaue Knöpfe nebeneinander |
| `<Knopf art="gefahr" symbol="geloescht" rueckfrage={…}>Löschen</Knopf>` | `<Knopf className="gefahr-rand">`, ein roter Textlink „Löschen“, Gefahr ohne Rückfrage |
| „Verwerfen“ als Knopf mit Rand neben dem Hauptknopf | „Verwerfen“ als roter Link oder mit Rückfrage beim Klick |
| `gesperrt={!geaendert}` – nichts zu tun | `gesperrt={!geaendert && 'Nichts geändert'}` – dafür braucht es keine Erklärung |
| `gesperrt={verwendet && t('…wird-noch-verwendet')}` | `disabled title="Wird noch verwendet"` oder ein Satz neben dem Knopf |
| Ergebnis am Knopf (Rückgabe oder `ErgebnisBlock`) | Ergebnis oben auf der Seite, während der Knopf unten steht |
| `<Knopf nurSymbol={t('…neu-laden')}><Symbol name="neu-laden" /></Knopf>` | ein Symbolknopf ohne Namen |
| `art="link"` für „Zur Liste“ | `art="link"` für „Löschen“ oder „Senden“ |

## Code { #code }

- Baustein: `web/src/bausteine/knopf/Knopf.tsx`, Erklärung bei gesperrt: `Erklaerung.tsx`, Aussehen: `Knopf.module.css` (Grundform und Farben je Art aus `.knopf` in `web/src/stile/01-kopf-und-formulare.css`)
- Rückfrage: `web/src/bausteine/rueckfrage/Rueckfrage.tsx` (Fenster, Vorschau der Musterseite), Warteschlange `web/src/rueckfrage.tsx`
- Musterseite: `web/src/bausteine/knopf/muster.tsx`; Typprüfung: `web/src/bausteine/knopf/typpruefung.ts`
- Lint: `ablago/knopf-farben` in `.github/werkzeuge/eslint-ablago.mjs` (Test `eslint-ablago.test.mjs`)
- Tests: `server/test/baustein-knopf.test.ts` (zeichnet mit react-dom/server und prüft Arten, Gefahr, gesperrt in zwei Formen, `aria-*` und `data-knopf`); Rauchtests in `web/rauchtest/bereiche/bausteine-und-knoepfe.mjs`: Knopf auf der Musterseite (läuft, Ergebnis, Fehler; Gefahr mit Rückfrage; gesperrt mit Erklärung), Wächter auf jeder Seite, „+ Neu“ in Listen (#989), Eingangsordner „Jetzt prüfen“ (#986)
