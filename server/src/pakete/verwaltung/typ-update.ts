/**
 * Paket-Update übernimmt Änderungen an vorhandenen Mappentypen (#1658), solange die Verwaltung den Teil nicht selbst
 * geändert hat – wie bei Ansichten (#1125). Teile: die Typ-Eigenschaften (Titel-Vorlage, Beschreibung, Mehrzahl,
 * „Woran man ihn erkennt“), jedes Feld, jedes Register. Was das Paket bisher geschrieben hat, steht im Paketstand der
 * Typen (`typStand`, #653); der Prüfwert eines Teils heute gegen den dort entscheidet:
 *
 * - **aktualisiert**: unverändert → das Update übernimmt die neue Fassung;
 * - **geaendert**: von der Verwaltung geändert → bleibt, die Vorschau sagt es („Trotzdem ersetzen“ auf Wunsch);
 * - **unbekannt**: ohne Paketstand (Installation vor #653) → bleibt wie geändert.
 *
 * Ergänzungen früherer Updates zählen nicht als eigene Änderung: Füllte ein Update eine leere Angabe (Erkennung,
 * Vorbelegen, Format, Grenzen, Beschriftungen – siehe `update-neu.ts`), steht sie nicht im alten Paketstand.
 *
 * Felder, die das Paket nicht mehr mitbringt (im Paketstand, nicht mehr im Paket), **entfallen**, wenn die Verwaltung
 * sie nicht geändert hat (Kommentar Entwicklung an #1658, „Mittelweg für Lena“): ohne Werte einfach, mit Werten
 * wandern die Werte im Hintergrund in die Notiz der Mappe (`update-werte.ts`); nennt das Paket einen Umbau-Schritt in
 * denselben Typ (`umbenennen`), ziehen sie ins neue Feld. „Feld behalten“ ist die Ausnahme auf Wunsch.
 */
import { liesFeldErkennung } from '../../../../shared/src/erkennung';
import { type Feld, type Mappentyp } from '../../../../shared/src/model';
import { type TypBild, typBild } from '../../../../shared/src/typvergleich';
import type { EntfallPlan, TeilPlan, TeilZustand } from '../../../../shared/src/pakete';
import { pruefwert } from '../vorgaben';
import { type PaketTyp } from './format';

/** Feld-Eigenschaften, die ein Update übernimmt (#1658, Punkt 3). */
const FELD_UPDATE = ['label', 'hilfe', 'min', 'max', 'minLen', 'maxLen', 'erkennung', 'optionen', 'beschriftungen'] as const;
/** Typ-Eigenschaften, die ein Update übernimmt (#1658, Punkte 1 und 4). */
export const TYP_UPDATE = ['titelVorlage', 'beschreibung', 'mehrzahl', 'erkennbarAn'] as const;
/** Angaben, die frühere Updates nur ergänzt haben (leer → gesetzt) – das ist keine Änderung der Verwaltung. */
const ERGAENZT = new Set(['erkennung', 'vorbelegen', 'format', 'min', 'max', 'minLen', 'maxLen', 'beschriftungen']);

/** Kennung eines Teils für „Trotzdem ersetzen“ bzw. „Feld behalten“: `<Typ-Schlüssel im Paket>/typ|feld:<key>|register:<key>`. */
const teilKennung = (typ: string, teil: string) => `${typ}/${teil}`;

const leer = (v: unknown) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length);
const gleich = (a: unknown, b: unknown) => (leer(a) && leer(b)) || pruefwert(a ?? null) === pruefwert(b ?? null);

/** Prüfwert eines Teils (wie bei Ansichten, #1125): leere Angaben zählen nicht. */
const teilPruefwert = (teil: Record<string, unknown>) => pruefwert(Object.fromEntries(Object.entries(teil).filter(([, v]) => !leer(v))));

/** Ist der Teil noch so, wie das Paket ihn geschrieben hat? Ergänzungen früherer Updates zählen nicht (siehe oben). */
function wieGeschrieben(jetzt: Record<string, unknown>, stand: Record<string, unknown>): boolean {
  if (teilPruefwert(jetzt) === teilPruefwert(stand)) return true;
  for (const k of new Set([...Object.keys(jetzt), ...Object.keys(stand)]))
    if (!gleich(jetzt[k], stand[k]) && !(ERGAENZT.has(k) && leer(stand[k]))) return false;
  return true;
}

/** Typ-Eigenschaften eines Bilds; Angaben, die ein älterer Stand nicht kennt, zählen nicht (`nur`). */
function typTeil(b: TypBild, nur?: TypBild): Record<string, unknown> {
  const t: Record<string, unknown> = { titelVorlage: b.titelVorlage, beschreibung: b.beschreibung };
  for (const k of ['mehrzahl', 'erkennbarAn'] as const) if (!nur || k in nur) t[k] = b[k] ?? '';
  return t;
}
const feldTeil = (f: TypBild['felder'][number]) => ({ label: f.label, ...f.werte });
const registerTeil = (r: TypBild['register'][number]) => ({ name: r.name, ...r.werte });

/** Zustand eines Teils gegen den Paketstand. */
const zustand = (jetzt: Record<string, unknown> | undefined, stand: Record<string, unknown> | undefined): TeilZustand =>
  !stand || !jetzt ? 'unbekannt' : wieGeschrieben(jetzt, stand) ? 'aktualisiert' : 'geaendert';

/** Wert einer Feld-Eigenschaft im Paket, vergleichbar mit dem in Ablago (Erkennung wie beim Lesen). */
const paketWert = (f: Pick<Feld, 'typ'> & Partial<Pick<Feld, (typeof FELD_UPDATE)[number]>>, k: (typeof FELD_UPDATE)[number]) =>
  k === 'erkennung' ? (f.erkennung === undefined ? undefined : liesFeldErkennung(f.erkennung, f.typ)) : f[k];

/**
 * Reihenfolge der Felder eines Registers – unverändert heißt: die Felder aus dem Paketstand in derselben Reihenfolge;
 * dazu dürfen Felder gekommen sein, die das Paket mitbringt (frühere Updates hängen neue Felder an).
 */
function registerUnveraendert(jetzt: string[], stand: string[], vomPaket: Set<string>) {
  const bekannt = new Set(stand);
  return (
    gleich(
      jetzt.filter((k) => bekannt.has(k)),
      stand,
    ) && jetzt.every((k) => bekannt.has(k) || vomPaket.has(k))
  );
}

export interface TypUpdate {
  aenderungen: TeilPlan[];
  entfaellt: EntfallPlan[];
}

/** Was `planeTypUpdate` braucht. */
interface TypUpdateEingabe {
  paketTyp: PaketTyp;
  aktuell: Mappentyp;
  stand: TypBild | undefined;
  umbenennen: Record<string, string>;
  belegung: Record<string, number>;
  /** Optionen einer Auswahl, die Mappen nutzen – je Feld, dessen Optionen das Paket nicht mehr alle nennt. */
  genutzt?: Map<string, Set<string>>;
  kennungVon?: (typId: string) => string | undefined;
}

/**
 * Was das Update an einem vorhandenen Typ ändert (Vorschau und Ausführung): je Teil was und in welchem Zustand, dazu
 * die entfallenden Felder mit der Zahl der Mappen mit Wert. `umbenennen`: Umbau-Schritt in denselben Typ (alt → neu).
 */
export function planeTypUpdate(x: TypUpdateEingabe): TypUpdate {
  const jetzt = typBild(x.aktuell, x.kennungVon);
  const entfaellt = entfallende(x, jetzt);
  const weg = new Set(entfaellt.filter((e) => e.zustand === 'aktualisiert').map((e) => e.key));
  // Text → Verweis (#534) steht noch aus: Titel-Vorlage und Register stellt erst das Umwandeln um (sonst stünde im
  // Titel ein noch leerer Verweis).
  const umwandeln = x.paketTyp.felder.some((f) => f.ausText && x.aktuell.felder.some((g) => g.key === f.ausText));
  return {
    aenderungen: [
      ...typAenderung(x, jetzt, umwandeln),
      ...feldAenderungen(x, jetzt),
      ...(umwandeln ? [] : registerAenderungen(x, jetzt, weg)),
    ],
    entfaellt,
  };
}

/** Typ-Eigenschaften: nur, was das Paket angibt (eine fehlende Angabe löscht nichts). */
function typAenderung({ paketTyp, aktuell, stand }: TypUpdateEingabe, jetzt: TypBild, umwandeln: boolean): TeilPlan[] {
  const was = TYP_UPDATE.filter((k) => !(umwandeln && k === 'titelVorlage') && !leer(paketTyp[k]) && !gleich(paketTyp[k], aktuell[k]));
  if (!was.length) return [];
  const zu = zustand(typTeil(jetzt, stand), stand && typTeil(stand, stand));
  return [{ teil: teilKennung(paketTyp.schluessel, 'typ'), art: 'typ', name: aktuell.name, was: [...was], zustand: zu }];
}

/** Entfallende Felder: aus dem Paketstand, nicht mehr im Paket, noch am Typ (ohne Systemfelder). */
function entfallende({ paketTyp, aktuell, stand, umbenennen, belegung }: TypUpdateEingabe, jetzt: TypBild): EntfallPlan[] {
  // Ein altes Textfeld, aus dem ein neuer Verweis gefüllt wird (`aus_text`, #534), bleibt bis zum Umwandeln.
  const imPaket = new Set([...paketTyp.felder.map((f) => f.key), ...paketTyp.felder.flatMap((f) => (f.ausText ? [f.ausText] : []))]);
  return (stand?.felder ?? []).flatMap((sf) => {
    const g = aktuell.felder.find((f) => f.key === sf.key && !f.system);
    const j = jetzt.felder.find((f) => f.key === sf.key);
    if (!g || !j || imPaket.has(sf.key)) return [];
    const ziel = umbenennen[sf.key] ? paketTyp.felder.find((f) => f.key === umbenennen[sf.key]) : undefined;
    const nach = ziel && { key: ziel.key, label: aktuell.felder.find((f) => f.key === ziel.key)?.label ?? ziel.label };
    return [
      {
        teil: teilKennung(paketTyp.schluessel, `feld:${sf.key}`),
        key: sf.key,
        label: g.label,
        anzahl: belegung[sf.key] ?? 0,
        zustand: zustand(feldTeil(j), feldTeil(sf)),
        ...(nach ? { nach } : {}),
      },
    ];
  });
}

/** Feld-Eigenschaften (FELD_UPDATE) je Feld, das es im Paket und in Ablago gibt (gleiche Art). */
function feldAenderungen(x: TypUpdateEingabe, jetzt: TypBild): TeilPlan[] {
  return x.paketTyp.felder.flatMap((pf): TeilPlan[] => {
    const g = x.aktuell.felder.find((f) => f.key === pf.key && f.typ === pf.typ && !f.system);
    if (!g) return [];
    // Optionen: wie sie nach dem Update wären (genutzte bleiben) – sonst stünde die Änderung bei jedem Update wieder da.
    const soll = (k: (typeof FELD_UPDATE)[number]) =>
      k === 'optionen' && pf.optionen ? optionenNach(pf.optionen, g.optionen ?? [], x.genutzt?.get(pf.key) ?? new Set()) : paketWert(pf, k);
    const sf = x.stand?.felder.find((f) => f.key === pf.key);
    // Was nicht im Paketstand steht und in Ablago gesetzt ist (Erkennung, Grenzen, Beschriftungen …), bleibt, wie es ist:
    // Das hat die Verwaltung eingestellt oder ein früheres Update ergänzt (#336, #535, #728) – überschrieben wird es nicht.
    const eigen = (k: string) => ERGAENZT.has(k) && !!sf && leer(sf.werte[k]) && !leer(g[k as keyof Feld]);
    const was = FELD_UPDATE.filter((k) => (k === 'label' || paketWert(pf, k) !== undefined) && !gleich(soll(k), g[k]) && !eigen(k));
    if (!was.length) return [];
    const j = jetzt.felder.find((f) => f.key === pf.key);
    const zu = zustand(j && feldTeil(j), sf && feldTeil(sf));
    return [{ teil: teilKennung(x.paketTyp.schluessel, `feld:${pf.key}`), art: 'feld', name: g.label, was: [...was], zustand: zu }];
  });
}

/** Register: Reihenfolge der Felder, wie das Paket sie bringt (ohne entfallende, mit neuen). */
function registerAenderungen({ paketTyp, aktuell, stand }: TypUpdateEingabe, jetzt: TypBild, weg: Set<string>): TeilPlan[] {
  const vomPaket = new Set(paketTyp.felder.map((f) => f.key));
  return paketTyp.register.flatMap((pr): TeilPlan[] => {
    const g = aktuell.register.find((r) => r.key === pr.key);
    if (!g || g.art !== 'felder' || !pr.felder) return [];
    const ist = (g.felder ?? []).filter((k) => !weg.has(k));
    // Neue Felder hängt das Update ohnehin hinten an (#653) – nur eine andere Reihenfolge ist eine Änderung.
    const neueHier = pr.felder.filter((k) => !ist.includes(k) && !aktuell.felder.some((f) => f.key === k));
    if (gleich([...ist, ...neueHier], registerReihenfolge(pr.felder, ist, weg))) return [];
    const sr = stand?.register.find((r) => r.key === pr.key);
    const j = jetzt.register.find((r) => r.key === pr.key)!;
    const felder = (b: TypBild['register'][number]) => (b.werte.felder as string[] | undefined) ?? [];
    const unveraendert =
      !!sr &&
      registerUnveraendert(felder(j), felder(sr), vomPaket) &&
      wieGeschrieben({ ...registerTeil(j), felder: null }, { ...registerTeil(sr), felder: null });
    const zu: TeilZustand = !sr ? 'unbekannt' : unveraendert ? 'aktualisiert' : 'geaendert';
    return [{ teil: teilKennung(paketTyp.schluessel, `register:${pr.key}`), art: 'register', name: g.name, was: ['felder'], zustand: zu }];
  });
}

/**
 * Reihenfolge eines Registers nach dem Update: die des Pakets (ohne entfallende); Felder, die nur in Ablago stehen
 * (etwa aus einem anderen Paket), hinten dran – nichts verschwindet aus dem Register, was bleibt.
 */
function registerReihenfolge(paket: string[], ist: string[], weg: Set<string>): string[] {
  const p = paket.filter((k) => !weg.has(k));
  return [...p, ...ist.filter((k) => !p.includes(k) && !weg.has(k))];
}

/** Soll das Update diesen Teil schreiben? Unverändert, oder geändert bzw. unbekannt und „Trotzdem ersetzen“. */
export const schreibt = (t: Pick<TeilPlan, 'teil' | 'zustand'>, ersetzen: Set<string>) =>
  t.zustand === 'aktualisiert' || ersetzen.has(t.teil);

/**
 * Optionen einer Auswahl nach dem Update: die des Pakets; entfallene nur, wenn keine Mappe sie nutzt (#1658, Punkt 3).
 */
function optionenNach(paket: string[], jetzt: string[], genutzt: Set<string>): string[] {
  return [...paket, ...jetzt.filter((o) => !paket.includes(o) && genutzt.has(o))];
}

/** Was das Update an einem Typ geschrieben hat – für den Paketstand danach (`typStandNach`). */
export interface Geschrieben {
  typ: boolean;
  felder: Set<string>;
  register: Set<string>;
  /** Entfernte Felder (sie fallen aus dem Paketstand). */
  entfernt: Set<string>;
  /** Behaltene Felder („Feld behalten“): gehören danach der Verwaltung, fallen aus dem Paketstand. */
  behalten: Set<string>;
}

type Eintrag = Record<string, unknown> & { key: string };
type RegisterEintrag = Record<string, unknown> & { key: string; felder?: string[]; abschnitte?: Array<{ vor: string }> };

/**
 * Das Update an Typ-Eigenschaften, Feldern und Registern anwenden (#1658): was unverändert ist oder trotzdem ersetzt
 * werden soll, kommt aus dem Paket (`neu`, wie für den Typ aufbereitet); entfallende Felder gehen weg (außer „behalten“).
 * Abschnitte vor einem entfallenden Feld rücken zum nächsten Feld des Registers. `genutzt`: Optionen je Feld, die
 * Mappen nutzen – sie bleiben, auch wenn das Paket sie nicht mehr nennt.
 */
export function wendeTypUpdateAn(x: {
  plan: { aenderungen?: TeilPlan[]; entfaellt?: EntfallPlan[] };
  wahl: { ersetzen: Set<string>; behalten: Set<string> };
  neu: Partial<Record<(typeof TYP_UPDATE)[number], unknown>> & {
    felder: Array<{ key: string; optionen?: string[] } & Record<string, unknown>>;
    register: Array<{ key: string; felder?: string[] }>;
  };
  felder: Eintrag[];
  register: RegisterEintrag[];
  genutzt: Map<string, Set<string>>;
}): { typ: Record<string, unknown>; felder: Eintrag[]; register: RegisterEintrag[]; g: Geschrieben } {
  const g: Geschrieben = { typ: false, felder: new Set(), register: new Set(), entfernt: new Set(), behalten: new Set() };
  const typ: Record<string, unknown> = {};
  let felder = x.felder;
  let register = x.register;
  for (const a of (x.plan.aenderungen ?? []).filter((y) => schreibt(y, x.wahl.ersetzen))) {
    const k = a.teil.slice(a.teil.indexOf('/') + 1);
    if (a.art === 'typ') {
      for (const w of a.was) typ[w] = x.neu[w as (typeof TYP_UPDATE)[number]];
      g.typ = true;
    } else if (a.art === 'feld') {
      const key = k.slice('feld:'.length);
      const p = x.neu.felder.find((f) => f.key === key);
      if (!p) continue;
      felder = felder.map((f) => {
        if (f.key !== key) return f;
        const z: Eintrag = { ...f };
        for (const w of a.was)
          z[w] =
            w === 'optionen'
              ? optionenNach(p.optionen ?? [], (f.optionen as string[] | undefined) ?? [], x.genutzt.get(key) ?? new Set())
              : p[w];
        return z;
      });
      g.felder.add(key);
    } else {
      const key = k.slice('register:'.length);
      const p = x.neu.register.find((r) => r.key === key);
      if (!p?.felder) continue;
      register = register.map((r) => (r.key === key ? { ...r, felder: registerReihenfolge(p.felder!, r.felder ?? [], new Set()) } : r));
      g.register.add(key);
    }
  }
  for (const e of x.plan.entfaellt ?? []) {
    if (x.wahl.behalten.has(e.teil)) g.behalten.add(e.key);
    else if (schreibt(e, x.wahl.ersetzen)) g.entfernt.add(e.key);
  }
  if (g.entfernt.size) {
    felder = felder.filter((f) => !g.entfernt.has(f.key));
    register = register.map((r) => ohneFelder(r, g.entfernt));
  }
  return { typ, felder, register, g };
}

/** Register ohne die entfernten Felder; ein Abschnitt vor einem davon rückt zum nächsten verbleibenden Feld (sonst weg). */
function ohneFelder(r: RegisterEintrag, weg: Set<string>): RegisterEintrag {
  if (!r.felder?.some((k) => weg.has(k))) return r;
  const felder = r.felder.filter((k) => !weg.has(k));
  const naechstes = (vor: string) => r.felder!.slice(r.felder!.indexOf(vor)).find((k) => !weg.has(k));
  const abschnitte = r.abschnitte?.flatMap((a) => {
    if (!weg.has(a.vor)) return [a];
    const n = naechstes(a.vor);
    return n && !r.abschnitte!.some((b) => b.vor === n) ? [{ ...a, vor: n }] : [];
  });
  return { ...r, felder, ...(r.abschnitte ? { abschnitte } : {}) };
}

/**
 * Optionen, die Mappen nutzen (#1658) – nur für Auswahlfelder, deren Optionen das Paket nicht mehr alle nennt; die
 * Mappen werden nur dann geladen.
 */
export async function genutzteOptionen(
  paketTyp: Pick<PaketTyp, 'felder'>,
  aktuell: Pick<Mappentyp, 'felder'>,
  mappen: () => Promise<Array<{ werte: Record<string, unknown> }>>,
  nur?: string[],
): Promise<Map<string, Set<string>>> {
  const keys = paketTyp.felder
    .filter((pf) => {
      const g = aktuell.felder.find((f) => f.key === pf.key);
      return pf.optionen && g?.optionen?.some((o) => !pf.optionen!.includes(o)) && (!nur || nur.includes(pf.key));
    })
    .map((pf) => pf.key);
  const erg = new Map(keys.map((k) => [k, new Set<string>()] as const));
  if (!keys.length) return erg;
  for (const m of await mappen()) for (const k of keys) for (const v of [m.werte[k]].flat()) if (typeof v === 'string') erg.get(k)!.add(v);
  return erg;
}

/** Felder, deren Optionen das Update schreibt (#1658). */
export const optionenSchreiben = (p: { aenderungen?: TeilPlan[] }, wahl: { ersetzen: Set<string> }) =>
  (p.aenderungen ?? [])
    .filter((a) => a.art === 'feld' && a.was.includes('optionen') && schreibt(a, wahl.ersetzen))
    .map((a) => a.teil.slice(a.teil.indexOf('/feld:') + '/feld:'.length));
