import { feldLabel, typName } from '../../../shared/src/beschriftung';
import { altesTextfeldVon, formatiere, istLeer, istSystemspalte, SYSTEMSPALTEN, type Mappe, type Mappentyp } from '../../../shared/src/model';
import type { Bezuege } from '../api';
import { titelOder } from '../seiten';
import { gebietsschema } from '../../../shared/src/sprache';
import { mitMinus, rechtsbuendig } from '../../../shared/src/feldarten';

/** Spalten von Trefferlisten: Überschrift und Zelleninhalt (Ablage und Verknüpfungsregister). */
export function spaltenName(k: string, typ?: Mappentyp): string {
  // Bezeichnung in der Sprache des Benutzers (#728).
  const f = typ?.felder.find((x) => x.key === k);
  return istSystemspalte(k) ? SYSTEMSPALTEN[k] : f ? feldLabel(f) : k;
}
const datumZeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
/** Inhalt einer Zelle, formatiert wie in der Mappe. */
export function zelle(k: string, m: Mappe, typ: Mappentyp | undefined, bezuege: Bezuege, person: (id: string | null) => string): string {
  switch (k) {
    case '_titel': return titelOder(m.titel);
    case '_typ': return typ ? typName(typ) : '';
    case '_erstellt': return datumZeit(m.erstellt);
    case '_geaendert': return datumZeit(m.geaendert);
    case '_erstelltVon': return person(m.erstelltVon);
    case '_geaendertVon': return person(m.geaendertVon);
  }
  const f = typ?.felder.find((x) => x.key === k);
  // Verweis noch leer, alter Text da (#534): bis zur Umwandlung zeigt die Spalte den Text.
  const alt = typ && f ? altesTextfeldVon(typ, f) : undefined;
  if (alt && istLeer(m.werte[k]) && !istLeer(m.werte[alt.key])) return formatiere(alt, m.werte[alt.key]);
  const text = f ? formatiere(f, m.werte[k], (id) => titelOder(bezuege[id]?.titel)) : '';
  // Zahlen, Beträge, Prozent (#1035): ein negatives mit echtem Minuszeichen – deutlich, nicht nur über die Farbe.
  if (rechtsbuendig(f?.typ)) return mitMinus(text);
  // Formatierter Text (#53) in Listen: ohne Formatierung, gekürzt.
  return f?.typ === 'formatiert' && text.length > 140 ? `${text.slice(0, 137).trimEnd()} …` : text;
}

