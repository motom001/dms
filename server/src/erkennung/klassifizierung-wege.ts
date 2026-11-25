/**
 * Weitere Wege für „Wohin gehört das?“ (#939): Absender (#1680), „Woran man ihn erkennt“ (#1673) und die Namen eines Typs
 * mit Mehrzahl und gleichbedeutenden Wörtern (#1673). Nur Kennungen und Zahlen verlassen diese Teile – keine Inhalte.
 */
import { istAbsenderTyp } from '../../../shared/src/erkennung';
import { absenderSicherheit, erkennbarImText, erkennbarSicherheit, type Klassbeleg } from '../../../shared/src/klassifizierung';
import type { MappenBezug, Mappentyp } from '../../../shared/src/model';
import type { Zugriff } from '../kern';
import type { Repo } from '../repo';
import type { ErkennungDienst } from './erkennung-basis';

/** So viele frühere Post eines Absenders zählen höchstens (wie bei den Zielvorschlägen). */
const FRUEHERE_POST_MAX = 50;

type Beleg = Klassbeleg & { typId: string };

/** Mehrfachverweis als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/**
 * Namen eines Typs für die Überschrift (#1673): Name, Mehrzahl, Beschriftungen in anderen Sprachen und gleichbedeutende
 * Wörter dazu („Police“ zu „Vertrag“, aus der Werkbank). Als eigene Einträge für `typAusText`.
 */
export function namenVon(zt: Mappentyp, gruppen: readonly string[][]): Array<Pick<Mappentyp, 'id' | 'name'>> {
  const eigene = [zt.name, zt.mehrzahl ?? '', ...Object.values(zt.beschriftungen ?? {}).flatMap((b) => [b?.name ?? '', b?.mehrzahl ?? ''])]
    .map((x) => x.trim())
    .filter(Boolean);
  const klein = new Set(eigene.map((x) => x.toLocaleLowerCase('de-DE')));
  const dazu = gruppen.filter((g) => g.some((w) => klein.has(w.trim().toLocaleLowerCase('de-DE')))).flat();
  return [...new Set([...eigene, ...dazu.map((x) => x.trim())])].map((name) => ({ id: zt.id, name }));
}

/** Beleg „Woran man ihn erkennt“ je Kandidat (#1673): viele seiner Wörter im Dokument – auch ohne abgelegte Mappen. */
export function perErkennbar(text: string, ziele: Mappentyp[]): Beleg[] {
  const erg: Beleg[] = [];
  for (const zt of ziele) {
    if (!zt.erkennbarAn?.trim()) continue;
    const { gefunden, von } = erkennbarImText(zt.erkennbarAn, text);
    const s = erkennbarSicherheit(gefunden, von);
    if (s > 0) erg.push({ typId: zt.id, weg: 'erkennbar', sicherheit: s, gefunden, von });
  }
  return erg;
}

/**
 * Absender als Beleg (#1680): Ist der Absender einer Post erkannt (eindeutig, wie bei den Zielvorschlägen), zählt Ablago,
 * in welchen Mappentypen seine frühere Post liegt – nur Mappen, die die Person lesen darf, nur Kandidaten. Der Absender
 * selbst geht als Bezug mit, wenn die Person ihn lesen darf.
 */
export async function perAbsender(
  d: Pick<ErkennungDienst, 'rechtepruefung'>,
  repo: Repo,
  posten: readonly string[],
  ziele: Mappentyp[],
  z?: Zugriff,
): Promise<{ belege: Beleg[]; bezuege: Record<string, MappenBezug> }> {
  const leer = { belege: [], bezuege: {} };
  let absender: string | null = null;
  for (const id of posten) {
    const e = (await repo.erkennungLies(id))?.ergebnis as { eindeutig?: string | null } | undefined;
    if (e?.eindeutig) {
      absender = e.eindeutig;
      break;
    }
  }
  if (!absender) return leer;
  const kandidaten = new Map(ziele.filter((x) => !istAbsenderTyp(x)).map((x) => [x.id, x] as const));
  const frueher = (await repo.erkennungenMitAbsender(absender, FRUEHERE_POST_MAX)).filter((id) => !posten.includes(id));
  const jePost = (await repo.holeMappen(frueher)).map((p) => alsListe(p.werte.bezug));
  const ziel = await repo.holeMappen([...new Set(jePost.flat())]);
  const lesbar = await d.rechtepruefung.lesbare(z, [...ziel.map((m) => m.id), absender]);
  const typVon = new Map(ziel.filter((m) => lesbar.has(m.id) && kandidaten.has(m.typId)).map((m) => [m.id, m.typId] as const));
  const zaehler = new Map<string, number>();
  // Je Post zählt ein Typ einmal, auch wenn sie in zwei Mappen desselben Typs liegt.
  for (const ids of jePost)
    for (const typ of new Set(ids.map((id) => typVon.get(id)).filter((x): x is string => !!x)))
      zaehler.set(typ, (zaehler.get(typ) ?? 0) + 1);
  if (!zaehler.size) return leer;
  const sichtbar = lesbar.has(absender);
  const belege: Beleg[] = [...absenderSicherheit(zaehler)].map(([typId, s]) => ({
    typId,
    weg: 'absender',
    sicherheit: s,
    anzahl: zaehler.get(typId)!,
    ...(sichtbar ? { mappeId: absender! } : {}),
  }));
  const b = sichtbar ? await repo.bezuege([absender]) : new Map<string, MappenBezug>();
  return { belege, bezuege: Object.fromEntries(b) };
}
