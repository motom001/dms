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
import { bedingungsProblem, bereinigeBedingungen, erfuellt, filterFuer, merkmalTrifft, type Aufloesung, type Bedingung, type Filter, type Zaehlquelle } from './sichten';
import { istMerkmal, merkmalText, type Merkmal } from './merkmale';
import { t } from './texte';
import { gebietsschema } from './sprache';

export const RECHTE = { C: 'Anlegen', R: 'Lesen', U: 'Bearbeiten', D: 'Löschen', P: t('gemeinsam.rechte.passwoerter-sehen') } as const;
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
  /** Merkmal der Ablage (#1032), z. B. „Ablage wird beruflich genutzt“ – gilt für alle Mappen gleich. */
  | { art: 'merkmal'; merkmal: Merkmal }
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

/**
 * Konten, die kein Mensch sind (#673): Systemkonto „Automatisierung“ und Dienstkonten der Pakete. Für sie gilt die
 * Grundeinstellung des Typs nicht (sonst würde jede strenge Grundeinstellung für Mitglieder auch Automatisierungen
 * und Pakete aussperren) – es gelten nur die Regeln, die ihre Rolle ausdrücklich nennen, z. B. „Wenn Benutzer hat
 * Rolle Systemkonto → Lesen entziehen“. Ohne solche Regeln: wie bisher (Systemkonto alles, Paket die bestätigten Rechte).
 */
export const nenntRolle = (r: Regel, rolleId: string) => r.wenn.some((b) => b.art === 'rolle' && !b.nicht && b.rollen.includes(rolleId));
export function kontoRegelwerk(typ: Mappentyp, rolleId: string): Mappentyp {
  const regeln = regelwerkVon(typ).regeln.filter((r) => nenntRolle(r, rolleId));
  return { ...typ, berechtigungen: { grund: { ...ALLES }, regeln } };
}
/** Hat der Typ Regeln für diese Kontorolle? */
export const hatKontoRegeln = (typ: Mappentyp, rolleId: string) => regelwerkVon(typ).regeln.some((r) => nenntRolle(r, rolleId));

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

/**
 * Wie eine Bedingung im Zweifel ausgeht (#1036): `geben` – die Regel erteilt ein Recht, im Zweifel trifft sie nicht zu;
 * `nehmen` – sie entzieht eines, im Zweifel trifft sie zu.
 */
export type Zweifel = 'geben' | 'nehmen';
/** Zweifel für ein Recht einer Regel: wie die Regel es setzt; ohne Wirkung für dieses Recht wie beim Erteilen. */
const zweifelFuer = (r: Regel, recht: Recht): Zweifel => (r.dann[recht] === 'entziehen' ? 'nehmen' : 'geben');

/**
 * „zeigt auf Mappe vom Typ …“ (#1036) im Zweifel geschlossen: Zeigt das Feld auf eine Mappe, deren Typ die Person nicht
 * sehen darf (`a.sichtbareTypen`), trifft eine gebende Regel nicht zu und eine nehmende zu – nach einem „nicht“, damit
 * die Verneinung den Zweifel nicht umdreht. So verraten Rechte nicht, von welchem Typ eine unsichtbare Zielmappe ist.
 */
function imZweifel(x: Ausdruck, b: RegelBedingung, a: Aufloesung, zweifel: Zweifel): Ausdruck {
  if (b.art !== 'feld' || b.bedingung.op !== 'zeigtAufTyp' || !a.sichtbareTypen) return x;
  const fremd: Ausdruck = { k: 'filter', f: { art: 'zieltyp', key: b.bedingung.feld, typen: a.sichtbareTypen, ausser: true } };
  return zweifel === 'geben' ? und(x, nicht(fremd)) : oder(x, fremd);
}

/** Bedingung einer Regel → Ausdruck; Bedingungen über den Benutzer sind dabei schon entschieden. */
function bedingungAusdruck(b: RegelBedingung, typ: Mappentyp, wer: Wer, a: Aufloesung, zweifel: Zweifel = 'geben'): Ausdruck {
  let x: Ausdruck;
  switch (b.art) {
    case 'benutzer': x = bool(b.benutzer.includes(wer.id)); break;
    case 'rolle': x = bool(b.rollen.some((r) => wer.rollen.includes(r))); break;
    case 'aufgabe': x = { k: 'filter', f: { art: 'aufgabe', benutzer: wer.id } }; break;
    case 'eigeneMappe': x = { k: 'filter', f: { art: 'id', ids: [wer.id] } }; break;
    case 'merkmal': x = bool(merkmalTrifft({ merkmal: b.merkmal }, a.merkmale)); break;
    case 'feld': {
      if (bedingungsProblem(b.bedingung, [typ])) { x = FALSCH; break; }
      const [f] = filterFuer({ bedingungen: [b.bedingung] }, [typ], a);
      x = f ? { k: 'filter', f } : FALSCH;
      break;
    }
  }
  return imZweifel(b.nicht ? nicht(x) : x, b, a, zweifel);
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
    const zweifel = zweifelFuer(r, recht);
    let bed = und(...r.wenn.map((b) => (recht === 'C' && b.art === 'aufgabe' ? (b.nicht ? WAHR : FALSCH) : bedingungAusdruck(b, typ, wer, a, zweifel))));
    bed = und(aktiv, bed);
    const w = r.dann[recht];
    if (w) e = wenn(bed, bool(w === 'erteilen'), e);
    // Stopp im Zweifel wie beim Erteilen (trifft nicht zu): dieselbe Seite wie in rechteAn.
    if (r.stopp) aktiv = und(aktiv, nicht(und(...r.wenn.map((b) => (recht === 'C' && b.art === 'aufgabe' ? (b.nicht ? WAHR : FALSCH) : bedingungAusdruck(b, typ, wer, a, 'geben'))))));
    if (aktiv.k === 'falsch') break;
  }
  return e;
}

/** Lesen als Ausdruck – Grundlage für jeden Filter in Listen, Zählern und Suche. */
export function leseAusdruck(typ: Mappentyp, wer: Wer, a: Aufloesung): Ausdruck {
  return rechtAusdruck(typ, 'R', wer, a);
}

/** Hat einer dieser Typen eine Rechte-Regel „zeigt auf Mappe vom Typ …“ (#1036)? */
export const nutztZieltypRegeln = (typen: Array<Pick<Mappentyp, 'berechtigungen'>>) =>
  typen.some((t) => regelwerkVon(t).regeln.some((r) => r.wenn.some((b) => b.art === 'feld' && b.bedingung.op === 'zeigtAufTyp')));

/**
 * Auflösung mit den Mappentypen, die die Person sehen darf (#1036): ein Typ, dessen Leserecht nicht für jede Mappe
 * „nein“ ist. Zuerst so gerechnet, als sähe sie keinen Zieltyp (am stärksten geschlossen) – so hängt die Antwort nicht
 * an sich selbst, und ein Typ, den sie nur über eine solche Regel sähe, gilt als nicht sichtbar. Ohne solche Regeln
 * bleibt die Auflösung, wie sie ist.
 */
export function mitSichtbarenTypen(typen: Mappentyp[], wer: Wer, a: Aufloesung): Aufloesung {
  if (!nutztZieltypRegeln(typen)) return a;
  const vorab: Aufloesung = { ...a, sichtbareTypen: [] };
  return { ...a, sichtbareTypen: typen.filter((t) => leseAusdruck(t, wer, vorab).k !== 'falsch').map((t) => t.id) };
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
    // Im Zweifel geschlossen (#1036): je nach Wirkung kann dieselbe Regel für das Erteilen nicht und für das Entziehen
    // doch zutreffen. Spur und Stopp zeigen die Seite des Erteilens, wenn die Regel etwas erteilt, sonst die des Entziehens.
    const trifft = (zweifel: Zweifel) => regel.wenn.map((b) => (neu && b.art === 'aufgabe' ? !!b.nicht : werte(bedingungAusdruck(b, typ, wer, a, zweifel), m, z)));
    const geben = trifft('geben');
    const nehmen = regel.wenn.some((b) => b.art === 'feld' && b.bedingung.op === 'zeigtAufTyp') ? trifft('nehmen') : geben;
    const bedingungen = Object.values(regel.dann).includes('erteilen') || !Object.values(regel.dann).length ? geben : nehmen;
    const traf = bedingungen.every(Boolean);
    const gesetzt: Partial<Record<Recht, Wirkung>> = {};
    for (const k of RECHTE_LISTE) {
      const w = regel.dann[k];
      if (w && (w === 'erteilen' ? geben : nehmen).every(Boolean)) { r[k] = w === 'erteilen'; gesetzt[k] = w; }
    }
    if (geben.every(Boolean) && regel.stopp) gestoppt = true;
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
    case 'merkmal': return istMerkmal(x.merkmal) ? { ...n, art: 'merkmal', merkmal: x.merkmal } : null;
    case 'feld': {
      const [b] = bereinigeBedingungen([x.bedingung]);
      return b && b.art === 'feld' ? { ...n, art: 'feld', bedingung: b } : null;
    }
  }
  return null;
}

/** Warum eine Regel nicht (mehr) passt – z. B. ein entferntes Feld. null = in Ordnung. */
export function regelProblem(r: Regel, typ: Mappentyp): string | null {
  if (!r.name) return t('gemeinsam.rechte.bitte-der-regel-einen');
  if (!r.wenn.length) return t('gemeinsam.rechte.mindestens-eine-bedingung-angeben', { name: r.name });
  if (!RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp) return t('gemeinsam.rechte.aendert-nichts-mindestens-ein', { name: r.name });
  for (const b of r.wenn) {
    if (b.art === 'feld') { const p = bedingungsProblem(b.bedingung, [typ]); if (p) return `„${r.name}“: ${p}`; }
    if (b.art === 'benutzer' && !b.benutzer.length) return t('gemeinsam.rechte.benutzer-auswaehlen', { name: r.name });
    if (b.art === 'rolle' && !b.rollen.length) return t('gemeinsam.rechte.rolle-auswaehlen', { name: r.name });
    if (b.art === 'eigeneMappe' && typ.system !== 'benutzer') return t('gemeinsam.rechte.mappe-ist-die-des', { name: r.name });
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

/** „A oder B“ in der Sprache der Oberfläche; leer → „…“. */
const oderListe = (x: string[]) => (x.length ? new Intl.ListFormat(gebietsschema(), { type: 'disjunction' }).format(x) : '…');

/** Lesbarer Text einer Bedingung für Listen und den Testlauf. */
export function beschreibeRegelBedingung(b: RegelBedingung, namen: { benutzer(id: string): string; rolle(id: string): string; feld(b: Extract<Bedingung, { art: 'feld' }>): string }): string {
  const n = b.nicht;
  switch (b.art) {
    // Ganze Sätze je Fall (#729), die Aufzählung „A oder B“ nach der Sprache (Intl.ListFormat).
    case 'benutzer': { const wer = oderListe(b.benutzer.map(namen.benutzer)); return n ? t('gemeinsam.rechte.benutzer-nicht', { wer }) : t('gemeinsam.rechte.benutzer-ist', { wer }); }
    case 'rolle': { const rolle = oderListe(b.rollen.map(namen.rolle)); return n ? t('gemeinsam.rechte.rolle-nicht', { rolle }) : t('gemeinsam.rechte.rolle-hat', { rolle }); }
    case 'aufgabe': return n ? t('gemeinsam.rechte.aufgabe-keine') : t('gemeinsam.rechte.aufgabe-eine');
    case 'eigeneMappe': return n ? t('gemeinsam.rechte.eigene-nicht') : t('gemeinsam.rechte.eigene');
    case 'merkmal': return merkmalText(b.merkmal, n);
    case 'feld': return n ? t('gemeinsam.rechte.feld-nicht', { bedingung: namen.feld(b.bedingung) }) : namen.feld(b.bedingung);
  }
}

/** Ist ein Wert leer? (für Feldbedingungen in der Oberfläche) */
export { istLeer };
