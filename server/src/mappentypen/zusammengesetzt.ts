/**
 * Zusammengesetzte Felder (#1050) nach einer Änderung des Mappentyps: vorher zählen, wie viele Mappen danach dieselbe
 * Kombination hätten (der Editor fragt dann nach, statt still zu speichern), und nach dem Speichern die Werte aller
 * Mappen neu berechnen – in derselben Transaktion wie der Typ. Schicht 2.
 */
import { verweiseVon, type Feld, type Mappentyp, type MappentypDaten } from '../../../shared/src/model';
import { setzeZusammengesetzte, zusammengesetzteFelder, zusammengesetztSchluessel } from '../../../shared/src/zusammengesetzt';
import type { Repo } from '../repo';

/** Ein Feld, dessen Kombination nach der Änderung bei mehreren Mappen gleich wäre. */
export interface DoppelteKombination { feld: string; label: string; anzahl: number }

/** Hat sich an der Definition etwas geändert, das die Werte des Felds ändern kann? */
function neuZuPruefen(neu: Feld, alt: Pick<Mappentyp, 'felder'>, d: Pick<MappentypDaten, 'felder'>): boolean {
  const vorher = alt.felder.find((x) => x.key === neu.key);
  if (!vorher || vorher.typ !== 'zusammengesetzt' || !vorher.eindeutig || vorher.vorlage !== neu.vorlage) return true;
  // Eine Feldart eines Teils hat sich geändert (z. B. Text → Verweis): Die Werte entstehen anders.
  return d.felder.some((x) => { const a = alt.felder.find((y) => y.key === x.key); return !!a && a.typ !== x.typ; });
}

/**
 * Wie viele Mappen hätten nach der Änderung `d` dieselbe Kombination wie eine andere? Je eindeutigem zusammengesetztem
 * Feld, dessen Vorlage neu ist oder sich geändert hat – gezählt werden alle beteiligten Mappen (wie „passen nicht“).
 */
export async function doppelteNachher(repo: Repo, alt: Mappentyp, d: Pick<MappentypDaten, 'felder'>): Promise<DoppelteKombination[]> {
  const felder = d.felder.filter((f) => f.typ === 'zusammengesetzt' && f.eindeutig && neuZuPruefen(f, alt, d));
  if (!felder.length) return [];
  const mappen = await repo.listeMappen(alt.id);
  const erg: DoppelteKombination[] = [];
  for (const f of felder) {
    const je = new Map<string, number>();
    for (const m of mappen) {
      const s = zusammengesetztSchluessel(d.felder, f, m.werte);
      if (s) { const k = s.trim().toLowerCase(); je.set(k, (je.get(k) ?? 0) + 1); }
    }
    const anzahl = [...je.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
    if (anzahl) erg.push({ feld: f.key, label: f.label || f.key, anzahl });
  }
  return erg;
}

/**
 * Werte der zusammengesetzten Felder aller Mappen des Typs neu berechnen (nach dem Speichern des Typs). Geschrieben wird
 * nur, wo sich etwas ändert, feldweise und ohne Benutzer; die Titel und die Passung ziehen die Empfänger von
 * `typGeaendert` danach nach. Liefert die Anzahl geänderter Mappen.
 */
export async function neuBerechnen(repo: Repo, typ: Mappentyp): Promise<number> {
  if (!zusammengesetzteFelder(typ).length) return 0;
  let n = 0;
  for (const m of await repo.listeMappen(typ.id)) {
    const werte = { ...m.werte };
    if (!setzeZusammengesetzte(typ, werte).length) continue;
    await repo.aendereMappe(m.id, werte, [], null, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
    n++;
  }
  return n;
}
