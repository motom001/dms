# Suche

Der Baustein **Suche** (#978, #994) ist das eine Suchfeld aller Listen – in den Trefferlisten der Ablage wie in der Mitte der Werkbank. Dazu gehört das Muster **„Liste in der Mitte: Suchfeld oben, Filter darunter“**: Suchfeld, darunter die Filter der Liste, darunter die Trefferzahl; jeder Treffer zeigt, wo er gefunden wurde.

| Teil | Wofür |
| --- | --- |
| `Suchfeld` | Das Feld selbst: Lupe, Platzhalter, „×“ zum Leeren (nur mit Inhalt), **Esc** leert ebenfalls, `onEnter` für eigene Wege (Archivnummer in der Ablage). Die `beschriftung` ist der Name für Bildschirmleser, sichtbar steht der `platzhalter`. Ohne Vorschläge des Browsers und Rechtschreibprüfung, die Bildschirmtastatur zeigt „Suchen“; `feldRef` gibt Zugriff auf die Eingabe (z. B. Fokus nach dem Umschalten auf der Startseite, #1002). |
| `ListenSuche` | Das Muster: Suchregion (`role="search"`) mit `Suchfeld`, den `filter` darunter (Gruppe „Filter“) und der Trefferzahl (`aria-live`): „12 Treffer“, solange Suche oder ein Filter aktiv ist (`aktiv`), sonst `anzahl` („30 Mappentypen“). Am Handy bleibt die Region beim Rollen oben. |
| `FilterHaken` | Ein Haken unter dem Suchfeld, z. B. „Nur offene zeigen“, „Erledigte zeigen“. |
| `PaketFilter` | Auswahl „Paket“: *Alle*, *Eigene (ohne Paket)*, die Pakete der Liste. Ohne Pakete in der Liste gibt es ihn nicht; `beschriftung` z. B. „Herkunft“. |
| `KeineTreffer` | Leerer Zustand, wenn Suche oder Filter alles ausblenden: Satz und Knopf „Suche und Filter zurücksetzen“ (beides anpassbar, z. B. „Keine offenen Auskünfte. Alle zeigen“). |
| `Hervorgehoben`, `Fundstellen` | Name mit hervorgehobenem Suchwort; darunter die ersten zwei Fundstellen („Feld „Kündigen bis“ · Hilfetext: … **kündigen** …“), dann „+ 3 weitere“. |
| `useListenSuche(eintraege, { quellen, herkunft?, varianten? })` | Zustand von Eingabe und Paketfilter, die passenden Einträge mit Fundstellen, `paketeDa`/`eigeneDa` für den Filter, `zuruecksetzen()`. |

Gesucht wird beim Tippen im Browser, in dem, was die Seite ohnehin geladen hat – ohne Anfrage an den Server. Die Logik steht ohne Oberfläche in `shared/src/listensuche.ts` (`durchsuche`, `ausschnitt`, `herkunftPasst`): ohne Groß- und Kleinschreibung, Akzente und mit Umlaut-Varianten (ü = u = ue, ß = ss); mehrere Wörter müssen alle vorkommen, jedes in irgendeiner Quelle des Eintrags.

```tsx
import { Fundstellen, Hervorgehoben, KeineTreffer, ListenSuche, PaketFilter, useListenSuche } from '../bausteine';

const z = useListenSuche(liste, {
  // Worin gesucht wird: der Name (titel) und die Fundquellen mit fertig übersetztem Bereich.
  quellen: (k) => [{ wo: '', text: k.name, titel: true }, { wo: t('…muster'), text: k.muster }],
  herkunft: (k) => paketVon(k), // Paket-Id oder null; ohne Angabe kein Paketfilter
});

<ListenSuche wert={z.eingabe} setze={z.setEingabe} beschriftung={t('…durchsuchen')} platzhalter={t('…suchen-in')}
  treffer={z.treffer.length} aktiv={z.aktiv} anzahl={t('…anzahl', { anzahl: liste.length })}
  filter={<PaketFilter wert={z.paket} setze={z.setPaket} pakete={paketWahl(z.paketeDa, pakete)} eigene={z.eigeneDa} />} />
{!z.treffer.length ? <KeineTreffer zuruecksetzen={z.zuruecksetzen} /> : z.treffer.map(({ eintrag, titel, funde }) => (
  <Link …><span className="titel"><Hervorgehoben teile={titel} text={eintrag.name} /></span><Fundstellen funde={funde} /></Link>
))}
```

- **Eigene Filter** einer Liste (z. B. „Nur offene zeigen“) filtert die Seite vor `useListenSuche` und rechnet sie bei `aktiv` dazu.
- **Worin die Werkbank-Listen suchen** (Mappentypen, Ansichten, Nummernkreise) steht in `web/src/werkbank/listensuche.ts`, ebenso, aus welchem Paket ein Eintrag stammt.
- **Varianten** (`varianten: (wort) => string[]`) geben je Suchwort weitere Wörter dazu – vorgesehen für die gleichbedeutenden Wörter (#992); markiert wird jede gefundene Form.
- **Am Handy** ist die Auswahl „Paket“ und jeder Haken mindestens 44 px hoch ([Am Handy](bausteine.md#handy)); das „×“ ist ein `Knopf` nur mit Symbol.
- Die Musterseite zeigt den Baustein im Bereich **Suche**: leer, gefüllt, als Liste mit Filtern zum Ausprobieren und ohne Treffer.
