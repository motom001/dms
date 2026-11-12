# Bereiche

`useBereiche` und `Bereich` (#1000) bauen das Muster **„Editor rechts: Sprungleiste + Bereiche“**: oben die Sprungleiste mit allen Bereichen und **Alle aufklappen / Alle zuklappen**, darunter die Bereiche zum Auf- und Zuklappen. Es begann beim Mappentyp (#144) und bei den Ansichten (#148); seit #1000 haben es auch Nummernkreise, Automatisierungen, Benutzer, Stempel, Postfächer und die Datenschutz-Auskünfte.

![Bereich „Bereiche“ der Musterseite: mit Sprungleiste und einem Bereich mit Fehler, zugeklappt mit Kurzinfo, unter drei Bereichen ohne Leiste](bilder/muster-bereiche.png){ loading=lazy }

## Verhalten { #verhalten }

- **Neu** (`id` ist `null`): alles offen, nichts wird gemerkt.
- **Bestehend:** wie zuletzt auf diesem Gerät (`localStorage`, je Editor die zuletzt bearbeiteten 200 Einträge); ohne Gedächtnis zugeklappt. Mappentypen und Ansichten behalten ihre bisherigen Speicherorte (`dms.typeditor.offen`, `dms.sichteditor.offen`), alle anderen heißen `dms.<editor>editor.offen`.
- **Anker in der Adresse** (`…/werkbank/postfaecher/<id>#verbindung`) öffnet seinen Bereich und springt hin.
- **Sprungleiste:** jeder Sprung öffnet seinen Bereich und rollt dorthin; ein Bereich mit Fehler ist rot und trägt „!“. Am Desktop bleibt die Leiste unter dem Seitenkopf stehen, am Handy (bis 700 px) rollt sie mit.
- **Unter drei Bereichen** (`SPRUNGLEISTE_AB`) gibt es weder Leiste noch Klappen: Die Bereiche stehen fest offen, nur mit ihrem Titel.
- **Eingeklappt** bleibt der Inhalt im Dokument (nur verborgen) – Eingaben, Ergebnisse und laufende Abfragen gehen nicht verloren. Die Kurzinfo (`kurz`) steht dann unter dem Titel.

## Benutzen { #benutzen }

```tsx
import { Bereich, fehlerBereiche, useBereiche, type BereichListe } from '../bausteine';

type PfBereich = 'grunddaten' | 'verbindung' | 'abholen' | 'stand';
const liste: BereichListe<PfBereich> = [['grunddaten', t('…grunddaten')], ['verbindung', t('…verbindung')], …];

const b = useBereiche(liste, 'postfach', neu ? null : id);
const hatFehler = (k: PfBereich) => fehlerOrte.has(k);

<div className="editorform">
  <Kopf … />
  {b.leiste(hatFehler, t('…bereiche-des-postfachs'))}
  <form id="pf-formular" className="editorform" onSubmit={…} onKeyDown={ent.tasten}>
    <Bereich id="grunddaten" titel={t('…grunddaten')} klappe={b.klappe('grunddaten', hatFehler('grunddaten'))} kurz={e.name}>
      …
    </Bereich>
    …
  </form>
  <Bereich id="stand" titel={t('…stand')} klappe={b.klappe('stand')}>…Sofortaktionen…</Bereich>
  <Speicherleiste ent={ent} gegenstand={t('…postfach')} formular="pf-formular" />
</div>
```

| Teil | Wofür |
| --- | --- |
| `useBereiche(liste, editor, id)` | Zustand: `auf`, `klappe(k, fehler?)`, `oeffne(ks, springen?)`, `leiste(fehler?, beschriftung?)`, `merke(neueId)`, `mitLeiste` |
| `Bereich` | `id` (zugleich Anker), `titel`, `klappe`; dazu `hilfe` (Hilfesymbol hinter dem Titel), `kurz` (Kurzinfo zugeklappt), `beschreibung` (Satz über dem Inhalt), `className` |
| `fehlerBereiche(fehler, liste, ersatz)` | Bereiche eines Fehlers beim Speichern: `details.orte` der Antwort des Servers, nur bekannte; sonst `ersatz` |
| `liesOffen`, `merkeOffen` | das Gedächtnis direkt, z. B. für Tests |

## Regeln { #regeln }

- **Ein Speichern für den ganzen Editor.** Unten steht eine `Speicherleiste` (`web/src/Speicherleiste.tsx`) für alles, was gespeichert wird. Liegen Bereiche mit eigenen Sofortaktionen dazwischen oder dahinter (eigene kleine Formulare, z. B. „Zählerstand setzen“), stehen sie **außerhalb** des Formulars – Formulare dürfen nicht ineinander stecken – und die Leiste verbindet sich über `formular="<id>"` mit ihm.
- **Sofortaktionen bleiben sofort:** Testen, Abrufen, Zurücksetzen, Abmelden, Sperren – alles, was eine eigene Handlung ist und nicht zum Entwurf gehört.
- **Fehler öffnen ihren Bereich.** Prüft die Oberfläche selbst (z. B. ein unbekannter Platzhalter), markiert `klappe(k, true)` den Bereich schon beim Tippen. Was erst der Server findet, nennt er als `details.orte` (`Fachfehler(422, text, { orte: ['verbindung'] })`); `fehlerBereiche` liest es, `oeffne(orte)` klappt auf und springt hin.
- **Bereichsnamen kurz und gleich:** *Grunddaten* zuerst, dann in der Reihenfolge, in der man den Eintrag einrichtet; Ausprobieren, Stand und Verlauf ans Ende.
- **Überschriften:** Der Bereich trägt die `h2`; Abschnitte darin nehmen `h3` (`className="h4"`), nicht noch ein `blatt`.

## Am Handy { #handy }

Sprünge und der Kopf eines Bereichs sind bei `(pointer: coarse)` mindestens 44 px hoch ([Am Handy](bausteine.md#handy)); „Alle aufklappen“ ist ein `Knopf` der Art Link. Die Leiste bricht um und rollt mit.

Die Musterseite zeigt den Baustein im Bereich **Bereiche**: mit Sprungleiste (ein Bereich mit Fehler), zugeklappt mit Kurzinfo und unter drei Bereichen.

![Bereich „Bereiche“ dunkel](bilder/muster-bereiche-dunkel.png){ loading=lazy }
