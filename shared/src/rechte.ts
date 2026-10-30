/**
 * Berechtigungen (#123–#127, #137): je Mappentyp eine Grundeinstellung und geordnete Regeln
 * „wenn … und …, dann erteile/entziehe CRUDP“, mit Stopp. Server und Oberfläche teilen diese Datei.
 *
 *   C Anlegen · R Lesen · U Bearbeiten · D Löschen · P Passwörter sehen
 *
 * Auswertung: Grundeinstellung des Typs → seine Regeln in Reihenfolge; jede zutreffende Regel
 * setzt ihre ✓/✗, „–“ bleibt; Stopp beendet die Prüfung. Ohne R wirkt nichts außer C.
 * Für Administratoren gelten die Regeln nicht (#128).
 */
import { istLeer, type Mappe, type Mappentyp } from './model';
import { bedingungsProblem, bereinigeBedingungen, erfuellt, filterFuer, type Aufloesung, type Bedingung, type Filter, type Zaehlquelle } from './sichten';

export const RECHTE = { C: 'Anlegen', R: 'Lesen', U: 'Bearbeiten', D: 'Löschen', P: 'Passwörter sehen' } as const;
export type Recht = keyof typeof RECHTE;
export const RECHTE_LISTE = Object.keys(RECHTE) as Recht[];
export type Rechte = Record<Recht, boolean>;
export type Wirkung = 'erteilen' | 'entziehen';
export const ALLES: Rechte = { C: true, R: true, U: true, D: true, P: true };
export const NICHTS: Rechte = { C: false, R: false, U: false, D: false, P: false };

/** Eine Bedingung im „Wenn“ einer Regel; nicht = verneint („ist nicht“). */
export type RegelBedingung = { nicht?: boolean } & (
  /** Der aktuelle Benutzer ist einer von … (Benutzer-Ids). */
  | { art: 'benutzer'; benutzer: string[] }
  /** Der aktuelle Benutzer hat eine dieser Rollen (Rollen-Mappen, auch Administrator/Mitglied). */
  | { art: 'rolle'; rollen: string[] }
  /** Ein Feld der Mappe – wie in Sichten, auch „zeigt auf aktuellen Benutzer / seine Rollen“ und „Erstellt von“. */
  | { art: 'feld'; bedingung: Extract<Bedingung, { art: 'feld' }> }
  /** Die Mappe hat eine offene Aufgabe für den aktuellen Benutzer. */
  | { art: 'aufgabe' }
  /** Die Mappe ist die Benutzer-Mappe des aktuellen Benutzers (Typ Benutzer). */
  | { art: 'eigeneMappe' }
);

export interface Regel {
  id: string;
  name: string;
  wenn: RegelBedingung[];
  dann: Partial<Record<Recht, Wirkung>>;
  stopp: boolean;
}

/** grund: Standard je Recht (#146), gilt, solange keine Regel etwas anderes sagt. */
export interface Regelwerk { grund: Rechte; regeln: Regel[] }
export const OFFENES_REGELWERK: Regelwerk = { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [] };
export const regelwerkVon = (t: Pick<Mappentyp, 'berechtigungen'> | undefined): Regelwerk => t?.berechtigungen ?? OFFENES_REGELWERK;
export const istOffen = (r: Regelwerk) => RECHTE_LISTE.every((k) => r.grund[k]) && !r.regeln.length;
/** Standard kurz, z. B. „CRUDP“, „R“ oder „–“. */
export const kurzStandard = (g: Rechte) => RECHTE_LISTE.filter((k) => g[k]).join('') || '–';
/**
 * Systemregeln (#146), auch für Administratoren und durch keine Regel aufzuheben: Benutzer entstehen
 * und verschwinden nur in der Benutzerverwaltung. Post (#192) legt man über „+ Post“ an; wer das darf,
 * regeln die Berechtigungen wie bei jedem Typ.
 */
export const systemSperre = (t: Pick<Mappentyp, 'system'> | undefined): { C: boolean; D: boolean } =>
  ({ C: t?.system === 'benutzer', D: t?.system === 'benutzer' });

/** Wer gerade fragt. */
export interface Wer { id: string; rollen: string[] }

/* ---------- Ausdrücke: einmal gebaut, im Arbeitsspeicher und als SQL ausgewertet ---------- */

export type Ausdruck =
  | { k: 'wahr' } | { k: 'falsch' }
  | { k: 'filter'; f: Filter }
  | { k: 'und'; teile: Ausdruck[] } | { k: 'oder'; teile: Ausdruck[] }
  | { k: 'nicht'; a: Ausdruck }
  | { k: 'wenn'; bed: Ausdruck; dann: Ausdruck; sonst: Ausdruck };

export const WAHR: Ausdruck = { k: 'wahr' };
export const FALSCH: Ausdruck = { k: 'falsch' };
const bool = (b: boolean): Ausdruck => (b ? WAHR : FALSCH);

export function und(...teile: Ausdruck[]): Ausdruck {
  if (teile.some((t) => t.k === 'falsch')) return FALSCH;
  const rest = teile.filter((t) => t.k !== 'wahr');
  return !rest.length ? WAHR : rest.length === 1 ? rest[0] : { k: 'und', teile: rest };
}
export function oder(...teile: Ausdruck[]): Ausdruck {
  if (teile.some((t) => t.k === 'wahr')) return WAHR;
  const rest = teile.filter((t) => t.k !== 'falsch');
  return !rest.length ? FALSCH : rest.length === 1 ? rest[0] : { k: 'oder', teile: rest };
}
export function nicht(a: Ausdruck): Ausdruck {
  return a.k === 'wahr' ? FALSCH : a.k === 'falsch' ? WAHR : a.k === 'nicht' ? a.a : { k: 'nicht', a };
}
function wenn(bed: Ausdruck, dann: Ausdruck, sonst: Ausdruck): Ausdruck {
  if (bed.k === 'wahr') return dann;
  if (bed.k === 'falsch') return sonst;
  if (JSON.stringify(dann) === JSON.stringify(sonst)) return dann;
  if (dann.k === 'wahr' && sonst.k === 'falsch') return bed;
  if (dann.k === 'falsch' && sonst.k === 'wahr') return nicht(bed);
  if (dann.k === 'wahr') return oder(bed, sonst);
  if (sonst.k === 'falsch') return und(bed, dann);
  return { k: 'wenn', bed, dann, sonst };
}

/** Bedingung einer Regel → Ausdruck; Bedingungen über den Benutzer sind dabei schon entschieden. */
function bedingungAusdruck(b: RegelBedingung, typ: Mappentyp, wer: Wer, a: Aufloesung): Ausdruck {
  let x: Ausdruck;
  switch (b.art) {
    case 'benutzer': x = bool(b.benutzer.includes(wer.id)); break;
    case 'rolle': x = bool(b.rollen.some((r) => wer.rollen.includes(r))); break;
    case 'aufgabe': x = { k: 'filter', f: { art: 'aufgabe', benutzer: wer.id } }; break;
    case 'eigeneMappe': x = { k: 'filter', f: { art: 'id', ids: [wer.id] } }; break;
    case 'feld': {
      if (bedingungsProblem(b.bedingung, [typ])) { x = FALSCH; break; }
      const [f] = filterFuer({ bedingungen: [b.bedingung] }, [typ], a);
      x = f ? { k: 'filter', f } : FALSCH;
      break;
    }
  }
  return b.nicht ? nicht(x) : x;
}

/**
 * Ein Recht für einen Benutzer an Mappen eines Typs, als Ausdruck über die Mappe.
 * C wird mit den Werten der neuen Mappe geprüft; Aufgaben-Bedingungen treffen dabei nie zu.
 */
export function rechtAusdruck(typ: Mappentyp, recht: Recht, wer: Wer, a: Aufloesung): Ausdruck {
  const rw = regelwerkVon(typ);
  let e = bool(rw.grund[recht]);
  let aktiv: Ausdruck = WAHR;
  for (const r of rw.regeln) {
    let bed = und(...r.wenn.map((b) => (recht === 'C' && b.art === 'aufgabe' ? (b.nicht ? WAHR : FALSCH) : bedingungAusdruck(b, typ, wer, a))));
    bed = und(aktiv, bed);
    const w = r.dann[recht];
    if (w) e = wenn(bed, bool(w === 'erteilen'), e);
    if (r.stopp) aktiv = und(aktiv, nicht(und(...r.wenn.map((b) => (recht === 'C' && b.art === 'aufgabe' ? (b.nicht ? WAHR : FALSCH) : bedingungAusdruck(b, typ, wer, a))))));
    if (aktiv.k === 'falsch') break;
  }
  return e;
}

/** Lesen als Ausdruck – Grundlage für jeden Filter in Listen, Zählern und Suche. */
export function leseAusdruck(typ: Mappentyp, wer: Wer, a: Aufloesung): Ausdruck {
  return rechtAusdruck(typ, 'R', wer, a);
}

/** Lesefilter je Typ für das Repo; null = ohne Einschränkung (Administrator oder alles offen). */
export interface Lesefilter { offen: string[]; je: Array<{ typId: string; ausdruck: Ausdruck }> }

export function lesefilter(typen: Mappentyp[], wer: Wer, a: Aufloesung): Lesefilter | null {
  const f: Lesefilter = { offen: [], je: [] };
  for (const t of typen) {
    const x = leseAusdruck(t, wer, a);
    if (x.k === 'wahr') f.offen.push(t.id);
    else if (x.k !== 'falsch') f.je.push({ typId: t.id, ausdruck: x });
  }
  return f.offen.length === typen.length ? null : f;
}

/* ---------- Auswerten im Arbeitsspeicher ---------- */

export type Mappenquelle = Zaehlquelle;

export function werte(x: Ausdruck, m: Mappe, z: Mappenquelle): boolean {
  switch (x.k) {
    case 'wahr': return true;
    case 'falsch': return false;
    case 'und': return x.teile.every((t) => werte(t, m, z));
    case 'oder': return x.teile.some((t) => werte(t, m, z));
    case 'nicht': return !werte(x.a, m, z);
    case 'wenn': return werte(x.bed, m, z) ? werte(x.dann, m, z) : werte(x.sonst, m, z);
    case 'filter': return erfuellt(m, [x.f], z);
  }
}

export function lesbar(f: Lesefilter | null, m: Mappe, z: Mappenquelle): boolean {
  if (!f || f.offen.includes(m.typId)) return true;
  const e = f.je.find((x) => x.typId === m.typId);
  return !!e && werte(e.ausdruck, m, z);
}

/* ---------- Eine Mappe: Rechte und Spur (Testlauf) ---------- */

export interface Spurschritt {
  regel: string;
  name: string;
  /** null = Regel kam nicht mehr dran (Stopp davor). */
  traf: boolean | null;
  /** Was die Regel gesetzt hat (nur wenn sie traf). */
  gesetzt: Partial<Record<Recht, Wirkung>>;
  stopp: boolean;
  /** Je Bedingung: traf sie? */
  bedingungen: boolean[];
  /** Stand nach dieser Regel. */
  stand: Rechte;
}
export interface Ergebnis { rechte: Rechte; wirksam: Rechte; spur: Spurschritt[]; grund: Rechte }

/**
 * Rechte an einer Mappe. `wirksam` berücksichtigt „ohne R wirkt nichts außer C“.
 * Für C (neue Mappe) die eingegebenen Werte als Mappe übergeben und neu = true.
 */
export function rechteAn(typ: Mappentyp, m: Mappe, wer: Wer, a: Aufloesung, z: Mappenquelle, neu = false): Ergebnis {
  const rw = regelwerkVon(typ);
  const grund = { ...rw.grund };
  const r: Rechte = { ...grund };
  const spur: Spurschritt[] = [];
  let gestoppt = false;
  for (const regel of rw.regeln) {
    if (gestoppt) { spur.push({ regel: regel.id, name: regel.name, traf: null, gesetzt: {}, stopp: regel.stopp, bedingungen: [], stand: { ...r } }); continue; }
    const bedingungen = regel.wenn.map((b) => (neu && b.art === 'aufgabe' ? !!b.nicht : werte(bedingungAusdruck(b, typ, wer, a), m, z)));
    const traf = bedingungen.every(Boolean);
    const gesetzt: Partial<Record<Recht, Wirkung>> = {};
    if (traf) {
      for (const k of RECHTE_LISTE) {
        const w = regel.dann[k];
        if (w) { r[k] = w === 'erteilen'; gesetzt[k] = w; }
      }
      if (regel.stopp) gestoppt = true;
    }
    spur.push({ regel: regel.id, name: regel.name, traf, gesetzt, stopp: regel.stopp, bedingungen, stand: { ...r } });
  }
  return { rechte: r, wirksam: wirksamVon(r, typ), spur, grund };
}

/** Ohne R wirkt nichts außer C; die Systemregeln sperren C und D bei Benutzer und E-Mail. */
export function wirksamVon(r: Rechte, typ: Pick<Mappentyp, 'system'>): Rechte {
  const sperre = systemSperre(typ);
  return {
    C: r.C && !sperre.C,
    R: r.R,
    U: r.R && r.U,
    D: r.R && r.D && !sperre.D,
    P: r.R && r.P,
  };
}

/** Kompakt für Listen: „+R −P“. */
export function kurz(dann: Regel['dann']): string {
  const plus = RECHTE_LISTE.filter((k) => dann[k] === 'erteilen').join('');
  const minus = RECHTE_LISTE.filter((k) => dann[k] === 'entziehen').join('');
  return [plus && `+${plus}`, minus && `−${minus}`].filter(Boolean).join(' ') || '–';
}

/**
 * Übersicht für das Profil (#126): je Recht „immer“, „nie“ oder „je nach Mappe“ – ohne die Regeln im
 * Einzelnen preiszugeben.
 */
export function rechteUebersicht(typ: Mappentyp, wer: Wer, a: Aufloesung): Record<Recht, 'immer' | 'nie' | 'teils'> {
  const erg = {} as Record<Recht, 'immer' | 'nie' | 'teils'>;
  const lesen = rechtAusdruck(typ, 'R', wer, a);
  for (const k of RECHTE_LISTE) {
    let x = rechtAusdruck(typ, k, wer, a);
    if (k !== 'C') x = und(lesen, x);
    if (k === 'C' && systemSperre(typ).C) x = FALSCH;
    if (k === 'D' && systemSperre(typ).D) x = FALSCH;
    erg[k] = x.k === 'wahr' ? 'immer' : x.k === 'falsch' ? 'nie' : 'teils';
  }
  return erg;
}

/* ---------- Eingaben bereinigen ---------- */

const neueId = () => Math.random().toString(36).slice(2, 10);

export function bereinigeRegelwerk(e: unknown): Regelwerk {
  const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  // Standard je Recht (#146); ältere Form: „erteilt“/„entzogen“ für alle.
  const g = x.grund;
  const grund: Rechte = g === 'entzogen' ? { ...NICHTS } : g && typeof g === 'object'
    ? Object.fromEntries(RECHTE_LISTE.map((k) => [k, (g as Record<string, unknown>)[k] !== false])) as Rechte
    : { ...ALLES };
  const regeln = (Array.isArray(x.regeln) ? x.regeln : []).slice(0, 100).map((r): Regel => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const dann: Regel['dann'] = {};
    const d = (o.dann && typeof o.dann === 'object' ? o.dann : {}) as Record<string, unknown>;
    for (const k of RECHTE_LISTE) if (d[k] === 'erteilen' || d[k] === 'entziehen') dann[k] = d[k] as Wirkung;
    const wenn = (Array.isArray(o.wenn) ? o.wenn : []).slice(0, 20).map(bereinigeBedingung).filter((b): b is RegelBedingung => !!b);
    return {
      id: typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? o.id : neueId(),
      name: (typeof o.name === 'string' ? o.name : '').replace(/\s+/g, ' ').trim().slice(0, 80),
      wenn, dann, stopp: o.stopp === true,
    };
  });
  return { grund, regeln };
}

function bereinigeBedingung(e: unknown): RegelBedingung | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const n = x.nicht === true ? { nicht: true } : {};
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, 200) : []);
  switch (x.art) {
    case 'benutzer': return { ...n, art: 'benutzer', benutzer: ids(x.benutzer) };
    case 'rolle': return { ...n, art: 'rolle', rollen: ids(x.rollen) };
    case 'aufgabe': return { ...n, art: 'aufgabe' };
    case 'eigeneMappe': return { ...n, art: 'eigeneMappe' };
    case 'feld': {
      const [b] = bereinigeBedingungen([x.bedingung]);
      return b && b.art === 'feld' ? { ...n, art: 'feld', bedingung: b } : null;
    }
  }
  return null;
}

/** Warum eine Regel nicht (mehr) passt – z. B. ein entferntes Feld. null = in Ordnung. */
export function regelProblem(r: Regel, typ: Mappentyp): string | null {
  if (!r.name) return 'Bitte der Regel einen Namen geben.';
  if (!r.wenn.length) return `„${r.name}“: Mindestens eine Bedingung angeben.`;
  if (!RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp) return `„${r.name}“ ändert nichts – mindestens ein Recht erteilen oder entziehen oder Stopp setzen.`;
  for (const b of r.wenn) {
    if (b.art === 'feld') { const p = bedingungsProblem(b.bedingung, [typ]); if (p) return `„${r.name}“: ${p}`; }
    if (b.art === 'benutzer' && !b.benutzer.length) return `„${r.name}“: Benutzer auswählen.`;
    if (b.art === 'rolle' && !b.rollen.length) return `„${r.name}“: Rolle auswählen.`;
    if (b.art === 'eigeneMappe' && typ.system !== 'benutzer') return `„${r.name}“: „Mappe ist die des aktuellen Benutzers“ gibt es nur beim Mappentyp Benutzer.`;
  }
  return null;
}

/** Eine Regel in einen anderen Mappentyp übernehmen: Feldbedingungen nur, wenn das Feld dort passt. */
export function kopiereRegel(r: Regel, ziel: Mappentyp): { regel: Regel; ausgelassen: number } {
  let ausgelassen = 0;
  const wenn = r.wenn.filter((b) => {
    if (b.art === 'feld' && bedingungsProblem(b.bedingung, [ziel])) { ausgelassen++; return false; }
    if (b.art === 'eigeneMappe' && ziel.system !== 'benutzer') { ausgelassen++; return false; }
    return true;
  });
  return { regel: { ...r, id: neueId(), wenn }, ausgelassen };
}

/** Lesbarer Text einer Bedingung für Listen und den Testlauf. */
export function beschreibeRegelBedingung(b: RegelBedingung, namen: { benutzer(id: string): string; rolle(id: string): string; feld(b: Extract<Bedingung, { art: 'feld' }>): string }): string {
  const n = b.nicht;
  switch (b.art) {
    case 'benutzer': return `Benutzer ${n ? 'ist nicht' : 'ist'} ${b.benutzer.map(namen.benutzer).join(' oder ') || '…'}`;
    case 'rolle': return `Benutzer ${n ? 'hat nicht' : 'hat'} Rolle ${b.rollen.map(namen.rolle).join(' oder ') || '…'}`;
    case 'aufgabe': return `Mappe hat ${n ? 'keine' : 'eine'} offene Aufgabe für den aktuellen Benutzer`;
    case 'eigeneMappe': return `Mappe ist ${n ? 'nicht ' : ''}die des aktuellen Benutzers`;
    case 'feld': return `${n ? 'nicht: ' : ''}${namen.feld(b.bedingung)}`;
  }
}

/** Ist ein Wert leer? (für Feldbedingungen in der Oberfläche) */
export { istLeer };
