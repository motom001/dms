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
 * Name einer erwähnten Mappe in Listen (#1333), wie in der Mappe selbst: lesbar der aktuelle Titel, sonst
 * „Mappe (nicht sichtbar)“, nicht mehr da „gelöschte Mappe“. Der Server liefert die erwähnten Mappen je Seite gesammelt
 * in `bezuege` mit – nicht lesbare maskiert, ohne Titel.
 */
function erwaehnt(b: Bezuege[string] | undefined): string {
  if (!b) return t('ablage.formatiert.erwaehnung.geloescht');
  if (b.verborgen) return t('ablage.formatiert.erwaehnung.verborgen');
  return b.titel || t('ablage.formatiert.erwaehnung.ohne-titel');
}
const datumZeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
/** Inhalt einer Zelle, formatiert wie in der Mappe. */
export function zelle(k: string, m: Mappe, typ: Mappentyp | undefined, bezuege: Bezuege, person: (id: string | null) => string): string {
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
      return person(m.erstelltVon);
    case '_geaendertVon':
      return person(m.geaendertVon);
  }
  const f = typ?.felder.find((x) => x.key === k);
  // Verweis noch leer, alter Text da (#534): bis zur Umwandlung zeigt die Spalte den Text.
  const alt = typ && f ? altesTextfeldVon(typ, f) : undefined;
  if (alt && istLeer(m.werte[k]) && !istLeer(m.werte[alt.key])) return formatiere(alt, m.werte[alt.key]);
  // Formatierter Text (#53) mit Erwähnungen (#1333): Titel nach den Rechten der lesenden Person.
  if (f?.typ === 'formatiert') return kurz(istLeer(m.werte[k]) ? '' : alsText(String(m.werte[k]), (id) => erwaehnt(bezuege[id])));
  // Zusammengesetzt (#1050): Text aus den Werten der Mappe; nicht lesbare Verweise kommen maskiert aus bezuege.
  const text = f ? formatiere(f, m.werte[k], (id) => titelOder(bezuege[id]?.titel), { felder: typ!.felder, werte: m.werte }) : '';
  // Zahlen, Beträge, Prozent (#1035): ein negatives mit echtem Minuszeichen – deutlich, nicht nur über die Farbe.
  return rechtsbuendig(f?.typ) ? mitMinus(text) : text;
}
/** Formatierter Text (#53) in Listen: ohne Formatierung, gekürzt. */
const kurz = (text: string) => (text.length > 140 ? `${text.slice(0, 137).trimEnd()} …` : text);
