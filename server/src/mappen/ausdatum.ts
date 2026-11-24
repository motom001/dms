/**
 * Verweisfeld aus einem Datum ableiten (#1648) auf dem Server: Welche Mappe des Zieltyps passt zum Jahr des Datums?
 * Nur Mappen, die die Person lesen darf; gibt es genau eine, ist sie der Vorschlag. Gibt es keine und darf die Person
 * im Zieltyp anlegen, kommt „… anlegen“ mit dem Jahr als Wert – angelegt wird erst nach einem Klick in der Oberfläche.
 * Mehrere passende: kein Vorschlag (es stünde nicht fest, welche gemeint ist). Die reinen Teile stehen in
 * shared/src/ausdatum.ts.
 */
import { jahrAus, jahrPasst, moeglicheJahresfelder, neueWerteFuer } from '../../../shared/src/ausdatum';
import { einzigesZiel, type Feld, type Mappe } from '../../../shared/src/model';
import type { Zugriff } from '../kern';
import type { Repo } from '../repo';
import type { ZugriffDienst } from '../zugriff';

export interface AusDatumErgebnis {
  /** Die eine passende Mappe. */
  mappe?: Mappe;
  /** Keine passende: so ließe sie sich anlegen. */
  neu?: { typId: string; werte: Record<string, string | number> };
  jahr: string;
}

/** Passende Mappe bzw. „anlegen“ für das Verweisfeld `f` und das Datum `iso`; null = nichts (kein Ziel, kein Datum, mehrere). */
export async function ausDatumWert(
  d: { repo: Repo; rechte: Pick<ZugriffDienst, 'lesbare' | 'rechteAn'> },
  f: Feld,
  iso: unknown,
  z?: Zugriff,
): Promise<AusDatumErgebnis | null> {
  const jahr = jahrAus(iso);
  const zielId = f.ausDatum && f.typ === 'referenz' ? einzigesZiel(f) : undefined;
  if (!jahr || !zielId || (z && !z.admin && z.typen && !z.typen.has(zielId))) return null;
  const ziel = await d.repo.holeTyp(zielId);
  const zf = ziel ? moeglicheJahresfelder(ziel.felder).find((x) => x.key === f.ausDatum!.zielFeld) : undefined;
  if (!ziel || !zf) return null;
  const alle = await d.repo.listeMappen(ziel.id);
  const lesbar = await d.rechte.lesbare(
    z,
    alle.map((m) => m.id),
  );
  const passend = alle.filter((m) => lesbar.has(m.id) && jahrPasst(zf, m.werte[zf.key], jahr));
  if (passend.length === 1) return { mappe: passend[0], jahr };
  if (passend.length > 1) return null;
  const werte = neueWerteFuer(zf, jahr);
  if (!werte) return { jahr };
  const darf =
    !z || (await d.rechte.rechteAn(z, { id: '', typId: ziel.id, werte: {}, titel: '', erstellt: '', geaendert: '' } as Mappe, true)).C;
  return darf ? { neu: { typId: ziel.id, werte }, jahr } : { jahr };
}
