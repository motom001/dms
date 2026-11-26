/**
 * Weitere Wege für „Wohin gehört das?“ (#939): Absender (#1680), „Woran man ihn erkennt“ (#1673), die Namen eines Typs
 * mit Mehrzahl und gleichbedeutenden Wörtern (#1673) und Einträge von Auswahllisten (#1689). Nur Kennungen und Zahlen verlassen diese Teile – keine Inhalte.
 */
import { AUSWAHL_EINTRAEGE_MAX, findeWort, istAbsenderTyp, istAuswahlliste, woerterVon } from '../../../shared/src/erkennung';
import {
  absenderSicherheit,
  AUSWAHL_KURZ_MAX,
  AUSWAHL_SICHERHEIT,
  erkennbarImText,
  erkennbarSicherheit,
  kurzText,
  type Klassbeleg,
} from '../../../shared/src/klassifizierung';
import { zieleVon, type MappenBezug, type Mappentyp } from '../../../shared/src/model';
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

/** Einträge einer Auswahlliste in Kurzform für ein Paket; `liste` = ihr Typ (für die Sperre `kiSperre`, #1635). */
export interface Kurzform {
  liste: string;
  text: string;
}

/**
 * Einträge von Auswahllisten im Text (#1689): Zeigt ein Verweisfeld eines Kandidaten auf eine Auswahlliste (z. B. Vertrag →
 * Vertragsart) und steht ein Eintrag mit Namen oder Erkennungswort im Text („Versicherungsschein“ bei Vertragsart
 * Versicherung), ist das ein schwacher Beleg für den Kandidaten – nicht für die Liste. Nur Einträge, die die Person lesen
 * darf. Dazu je Kandidat die Einträge in Kurzform für Pakete mit Sprachmodell („Vertragsart: Strom, Gas …“).
 */
export async function perAuswahl(
  d: Pick<ErkennungDienst, 'rechtepruefung'>,
  repo: Repo,
  text: string,
  ziele: Mappentyp[],
  z?: Zugriff,
): Promise<{ belege: Beleg[]; bezuege: Record<string, MappenBezug>; kurz: Map<string, Kurzform[]> }> {
  // Ein Fehler hier nimmt nur diesen Weg weg, nie das ganze Klassifizieren.
  return auswahlWeg(d, repo, text, ziele, z).catch(() => ({ belege: [], bezuege: {}, kurz: new Map<string, Kurzform[]>() }));
}

async function auswahlWeg(
  d: Pick<ErkennungDienst, 'rechtepruefung'>,
  repo: Repo,
  text: string,
  ziele: Mappentyp[],
  z?: Zugriff,
): Promise<{ belege: Beleg[]; bezuege: Record<string, MappenBezug>; kurz: Map<string, Kurzform[]> }> {
  const listen = new Map((await repo.listeTypen()).filter(istAuswahlliste).map((x) => [x.id, x] as const));
  // Je Kandidat die Verweisfelder auf eine Auswahlliste (das erste je Liste).
  const verweise = new Map<string, Array<{ feld: string; liste: string }>>();
  for (const zt of ziele)
    for (const f of zt.felder.filter((x) => x.typ === 'referenz' && !x.ausgeblendet))
      for (const id of zieleVon(f))
        if (listen.has(id) && id !== zt.id && !verweise.get(zt.id)?.some((v) => v.liste === id))
          verweise.set(zt.id, [...(verweise.get(zt.id) ?? []), { feld: f.label || f.key, liste: id }]);
  const genutzt = new Set([...verweise.values()].flat().map((v) => v.liste));
  // Einträge je Liste (lesbar), was davon im Text steht, und die Kurzform.
  const funde = new Map<string, Array<{ mappeId: string; wort: string }>>();
  const namen = new Map<string, string>();
  for (const id of genutzt) {
    const liste = listen.get(id)!;
    const alle = (await repo.listeMappen(id)).slice(0, AUSWAHL_EINTRAEGE_MAX);
    const lesbar = await d.rechtepruefung.lesbare(
      z,
      alle.map((m) => m.id),
    );
    const eintraege = alle.filter((m) => lesbar.has(m.id));
    namen.set(
      id,
      kurzText(
        `${liste.name}: ${eintraege
          .map((m) => m.titel ?? '')
          .filter(Boolean)
          .join(', ')}`,
        AUSWAHL_KURZ_MAX,
      ),
    );
    const f: Array<{ mappeId: string; wort: string }> = [];
    for (const m of eintraege) {
      const wort = findeWort(text, woerterVon(liste, m));
      if (wort) f.push({ mappeId: m.id, wort });
    }
    if (f.length) funde.set(id, f);
  }
  // Geteilt durch die Zahl der Kandidaten, die auf dieselbe Liste zeigen (wie beim Abgleich).
  const zeigen = (liste: string) => [...verweise.values()].filter((v) => v.some((x) => x.liste === liste)).length;
  const belege: Beleg[] = [];
  const kurz = new Map<string, Kurzform[]>();
  for (const [typId, vs] of verweise) {
    kurz.set(
      typId,
      vs.map((v) => ({ liste: v.liste, text: namen.get(v.liste) ?? '' })),
    );
    for (const v of vs)
      for (const x of funde.get(v.liste) ?? [])
        belege.push({
          typId,
          weg: 'auswahl',
          sicherheit: Math.round((AUSWAHL_SICHERHEIT / zeigen(v.liste)) * 100) / 100,
          mappeId: x.mappeId,
          feld: v.feld,
          wort: x.wort,
        });
  }
  const b = belege.length ? await repo.bezuege([...new Set(belege.map((x) => x.mappeId!))]) : new Map<string, MappenBezug>();
  return { belege, bezuege: Object.fromEntries(b), kurz };
}
