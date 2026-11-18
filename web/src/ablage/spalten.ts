import { feldLabel, typName } from '../../../shared/src/beschriftung';
import {
  altesTextfeldVon,
  formatiere,
  istLeer,
  istSystemspalte,
  SYSTEMSPALTEN,
  type Mappe,
  type Mappentyp,
} from '../../../shared/src/model';
import type { Bezuege } from '../api/mappen';
import type { Person } from '../api/konto';
import { titelOder } from '../seiten';
import { gebietsschema } from '../../../shared/src/sprache';
import { mitMinus, rechtsbuendig } from '../../../shared/src/feldarten';
import { alsText } from '../../../shared/src/markdown';
import { t } from '../sprache';

/** Spalten von Trefferlisten: Überschrift und Zelleninhalt (Ablage und Verknüpfungsregister). */
export function spaltenName(k: string, typ?: Mappentyp): string {
  // Bezeichnung in der Sprache des Benutzers (#728).
  const f = typ?.felder.find((x) => x.key === k);
  return istSystemspalte(k) ? SYSTEMSPALTEN[k] : f ? feldLabel(f) : k;
}
/**
 * Namen für Zellen: `person` für „angelegt von“, `personen` die Personenliste der Oberfläche (`/api/personen`): Benutzer,
 * deren Benutzer-Mappe die lesende Person lesen darf, dazu Dienst- und Systemkonten (#137, #338, #673).
 */
export type Namen = { person: (id: string | null) => string; personen: ReadonlyArray<Pick<Person, 'id' | 'name'>> };
/**
 * Name einer Erwähnung in Listen (#1333), mit derselben Quelle und Regel wie die Mappe selbst (`Formatiert.tsx`):
 * - Steht die Id in der Personenliste, ihr Name – wie `Person` in der Mappe (auch deaktivierte, Dienst- und Systemkonten).
 * - Sonst die alte Schreibweise `benutzer:` (#56) wie `Person`: „Benutzer (nicht sichtbar)“, „gelöschter Benutzer“ bzw.
 *   „Benutzer“ – nie ein gespeicherter Name.
 * - Sonst eine Mappe: lesbar der aktuelle Titel, sonst „Mappe (nicht sichtbar)“, nicht mehr da „gelöschte Mappe“.
 * Die Personenliste kennt die Oberfläche schon; die übrigen erwähnten Mappen liefert der Server je Seite gesammelt in
 * `bezuege` – nicht lesbare maskiert, ohne Titel. Keine Abfrage je Zelle.
 */
function erwaehnt(id: string, b: Bezuege[string] | undefined, benutzer: boolean, namen: Namen): string {
  const p = namen.personen.find((x) => x.id === id);
  if (p) return p.name;
  if (benutzer)
    return t(
      !b ? 'oberflaeche.person.geloeschter-benutzer' : b.verborgen ? 'oberflaeche.person.nicht-sichtbar' : 'oberflaeche.person.benutzer',
    );
  if (!b) return t('ablage.formatiert.erwaehnung.geloescht');
  if (b.verborgen) return t('ablage.formatiert.erwaehnung.verborgen');
  return b.titel || t('ablage.formatiert.erwaehnung.ohne-titel');
}
const datumZeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
/** Inhalt einer Zelle, formatiert wie in der Mappe. */
export function zelle(k: string, m: Mappe, typ: Mappentyp | undefined, bezuege: Bezuege, namen: Namen): string {
  switch (k) {
    case '_titel':
      return titelOder(m.titel);
    case '_typ':
      return typ ? typName(typ) : '';
    case '_erstellt':
      return datumZeit(m.erstellt);
    case '_geaendert':
      return datumZeit(m.geaendert);
    case '_erstelltVon':
      return namen.person(m.erstelltVon);
    case '_geaendertVon':
      return namen.person(m.geaendertVon);
  }
  const f = typ?.felder.find((x) => x.key === k);
  // Verweis noch leer, alter Text da (#534): bis zur Umwandlung zeigt die Spalte den Text.
  const alt = typ && f ? altesTextfeldVon(typ, f) : undefined;
  if (alt && istLeer(m.werte[k]) && !istLeer(m.werte[alt.key])) return formatiere(alt, m.werte[alt.key]);
  // Formatierter Text (#53) mit Erwähnungen (#1333): Namen und Titel wie in der Mappe, nach den Rechten der lesenden Person.
  if (f?.typ === 'formatiert')
    return kurz(istLeer(m.werte[k]) ? '' : alsText(String(m.werte[k]), (id, _n, benutzer) => erwaehnt(id, bezuege[id], benutzer, namen)));
  // Zusammengesetzt (#1050): Text aus den Werten der Mappe; nicht lesbare Verweise kommen maskiert aus bezuege.
  const text = f ? formatiere(f, m.werte[k], (id) => titelOder(bezuege[id]?.titel), { felder: typ!.felder, werte: m.werte }) : '';
  // Zahlen, Beträge, Prozent (#1035): ein negatives mit echtem Minuszeichen – deutlich, nicht nur über die Farbe.
  return rechtsbuendig(f?.typ) ? mitMinus(text) : text;
}
/** Formatierter Text (#53) in Listen: ohne Formatierung, gekürzt. */
const kurz = (text: string) => (text.length > 140 ? `${text.slice(0, 137).trimEnd()} …` : text);
