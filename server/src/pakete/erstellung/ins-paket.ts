/**
 * Eigene Rundgänge, Tipps und Automatisierungen (#680) ins Paket: Typen über ihre Kennung, ohne Personen.
 */
import { insPaket } from '../../entdecken/entdecken-werkbank';
import { EIGEN } from '../../../../shared/src/entdecken-werkbank';
import type { Automatisierung, DannKarte } from '../../../../shared/src/automatisierung';
import { type InstalliertesPaket } from '../../../../shared/src/pakete';
import { t } from '../../sprache/sprache';
import { type ErstellenDaten } from './bau-hilfen';

/**
 * Gewählte eigene Rundgänge fürs Paket (#941): Mappentypen der Ablage werden zum Schlüssel im Paket, Typen aus
 * installierten Paketen zu `paket:typ` samt Abhängigkeit; ein Typ, der weder mitkommt noch aus einem Paket stammt, ist
 * ein Problem.
 */
type InsPaket = {
  schluessel: Record<string, string>;
  typPaket: Map<string, { p: InstalliertesPaket; s: string }>;
  abhaengig(p: InstalliertesPaket): void;
  probleme: string[];
};

/** Mappentyp der Ablage → Schlüssel im Paket bzw. paket:typ einer Abhängigkeit; null, wenn er nicht mitkommt. */
function typImPaket(d: ErstellenDaten, k: InsPaket) {
  return (x: string): string | null => {
    const typ = d.typen.find((y) => (y.schluessel ?? y.id) === x);
    if (!typ) return null;
    if (k.schluessel[typ.id]) return k.schluessel[typ.id];
    const h = k.typPaket.get(typ.id);
    if (!h) return null;
    k.abhaengig(h.p);
    return `${h.p.id}:${h.s}`;
  };
}

export function rundgaengeInsPaket(gewaehlt: string[], d: ErstellenDaten, k: InsPaket): Array<Record<string, unknown>> {
  const kennung = typImPaket(d, k);
  const aus: Array<Record<string, unknown>> = [];
  for (const s of new Set(gewaehlt)) {
    const r = (d.rundgaenge ?? []).find((x) => x.schluessel === s);
    if (!r) {
      k.probleme.push(t('meldungen.paketerstellung.rundgang-fehlt', { schluessel: s }));
      continue;
    }
    const x = insPaket(r.roh, kennung);
    for (const f of x.fehlt) k.probleme.push(t('meldungen.paketerstellung.rundgang-typ', { schluessel: s, typ: f }));
    aus.push(x.roh);
  }
  return aus;
}

/**
 * Gewählte eigene Tipps fürs Paket (#942): Mappentypen wie bei Rundgängen; ein Rundgang nur, wenn er als eigener
 * mitkommt (dann sein Schlüssel im Paket). Anpassungen an Tipps anderer Pakete bleiben draußen (#654 offen).
 */
export function tippsInsPaket(gewaehlt: string[], rundgaenge: string[], d: ErstellenDaten, k: InsPaket): Array<Record<string, unknown>> {
  const kennung = typImPaket(d, k);
  const aus: Array<Record<string, unknown>> = [];
  for (const s of new Set(gewaehlt)) {
    const x = (d.tipps ?? []).find((y) => y.schluessel === s);
    if (!x) {
      k.probleme.push(t('meldungen.paketerstellung.tipp-fehlt', { schluessel: s }));
      continue;
    }
    const p = insPaket({ schluessel: s, ...x.daten }, kennung);
    for (const f of p.fehlt) k.probleme.push(t('meldungen.paketerstellung.tipp-typ', { text: x.daten.text, typ: f }));
    const r = x.daten.rundgang;
    if (r) {
      const lokal = r.startsWith(`${EIGEN}:`) ? r.slice(EIGEN.length + 1) : null;
      if (lokal && rundgaenge.includes(lokal)) p.roh.rundgang = lokal;
      else k.probleme.push(t('meldungen.paketerstellung.tipp-rundgang', { text: x.daten.text, rundgang: r }));
    }
    aus.push(p.roh);
  }
  return aus;
}

/** Dann-Karten, die ein Paket mitbringen darf (#680): Werkbank, nach außen und Paket-Aufrufe gehören zur eigenen Ablage. */
const AUTO_DANN = new Set(['aufgabe', 'feld', 'zusammenfassung', 'favoriten', 'stopp']);

const UUID_WERT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gewählte eigene Automatisierungen fürs Paket (#680): Mappentyp als Schlüssel im Paket, `paket:typ` (Abhängigkeit) oder
 * `dms:post`. Feste Personen und Rollen gibt es in Paketen nicht (#654: Benutzer nein) – sie werden zum Ersteller der
 * Mappe, mit Hinweis. Was nicht in ein Paket passt (Werkbank, nach außen, Aufruf von außen, Ansichten, feste Mappen),
 * ist ein Problem mit Namen. Mitgeliefert immer ausgeschaltet; der Empfänger schaltet sie beim Installieren an.
 */
export function automatisierungenInsPaket(
  gewaehlt: string[],
  d: ErstellenDaten,
  k: InsPaket,
  hinweis: (h: string) => void,
): Array<Record<string, unknown>> {
  const aus: Array<Record<string, unknown>> = [];
  const belegt = new Set<string>();
  for (const id of new Set(gewaehlt)) {
    const a = (d.automatisierungen ?? []).find((x) => x.id === id);
    if (!a) {
      k.probleme.push(t('meldungen.paketerstellung.automatisierung-fehlt', { id }));
      continue;
    }
    const typ = typKennungFuer(a, d, k);
    const grund = typ.grund ?? passtNicht(a);
    if (grund) {
      k.probleme.push(t('meldungen.paketerstellung.automatisierung-passt-nicht', { name: a.name, grund }));
      continue;
    }
    const { dann, sonst, wenn, ersetzt } = ohnePersonen(a);
    if (ersetzt) hinweis(t('meldungen.paketerstellung.automatisierung-personen', { name: a.name }));
    const schl = freierSchluessel(a.name, belegt);
    aus.push({
      schluessel: schl,
      name: a.name,
      ...(a.beschreibung ? { beschreibung: a.beschreibung } : {}),
      wenn: { ...wenn, ...(typ.kennung ? { typ: typ.kennung } : {}) },
      ...(a.und?.karten?.length ? { und: a.und } : {}),
      dann,
      ...(sonst.length ? { sonst } : {}),
      eingeschaltet: false,
    });
  }
  return aus;
}

/** Mappentyp der Wenn-Karte im Paket: eigener Schlüssel, `paket:typ` (Abhängigkeit) oder `dms:post`; sonst ein Grund. */
function typKennungFuer(a: Automatisierung, d: ErstellenDaten, k: InsPaket): { kennung: string | null; grund?: string } {
  const wennTyp = (a.wenn as { typ?: string | null }).typ ?? null;
  if (!wennTyp) return { kennung: null };
  const typ = d.typen.find((x) => x.id === wennTyp);
  if (typ?.system === 'post') return { kennung: 'dms:post' };
  if (typ && k.schluessel[typ.id]) return { kennung: k.schluessel[typ.id] };
  const h = typ ? k.typPaket.get(typ.id) : undefined;
  if (h) {
    k.abhaengig(h.p);
    return { kennung: `${h.p.id}:${h.s}` };
  }
  return { kennung: null, grund: t('meldungen.paketerstellung.automatisierung-typ', { typ: typ?.name ?? wennTyp }) };
}

/** Was nicht in ein Paket passt: Aufruf von außen, fremde Karten, Ansichten oder Favoriten in Bedingungen, feste Mappen. */
function passtNicht(a: Automatisierung): string | null {
  if (a.wenn.art === 'aufruf') return t('meldungen.paketerstellung.automatisierung-aufruf');
  const karten = [...a.dann, ...(a.sonst ?? [])];
  const fremd = karten.find((x) => !AUTO_DANN.has(x.art));
  if (fremd) return t('meldungen.paketerstellung.automatisierung-karte', { karte: fremd.art });
  const und = JSON.stringify(a.und ?? {});
  if (/"art":"(ansicht|favorit)"/.test(und) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(und))
    return t('meldungen.paketerstellung.automatisierung-und');
  if (karten.some((x) => x.art === 'feld' && Object.values(x.werte ?? {}).some((v) => typeof v === 'string' && UUID_WERT.test(v))))
    return t('meldungen.paketerstellung.automatisierung-feld');
  return null;
}

/** Feste Personen und Rollen gibt es in Paketen nicht (#654): Aufgaben gehen an den Ersteller, Rollen fallen weg. */
function ohnePersonen(a: Automatisierung): { dann: DannKarte[]; sonst: DannKarte[]; wenn: Record<string, unknown>; ersetzt: boolean } {
  let ersetzt = false;
  const karte = (x: DannKarte): DannKarte => {
    if (x.art === 'aufgabe') {
      const bleibt = x.empfaenger.filter((e) => e.art !== 'person' && e.art !== 'rolle');
      if (bleibt.length !== x.empfaenger.length) ersetzt = true;
      return { ...x, empfaenger: bleibt.length ? bleibt : [{ art: 'ersteller' }] } as DannKarte;
    }
    if (x.art === 'favoriten' && x.rollen?.length) {
      ersetzt = true;
      return { ...x, rollen: [] };
    }
    return x;
  };
  const { rolle, ...wenn } = a.wenn as typeof a.wenn & { rolle?: unknown };
  const dann = a.dann.map(karte),
    sonst = (a.sonst ?? []).map(karte);
  return { dann, sonst, wenn, ersetzt: ersetzt || !!rolle };
}

/** Schlüssel im Paket aus dem Namen, eindeutig in diesem Paket. */
function freierSchluessel(name: string, belegt: Set<string>): string {
  let s = (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'automatisierung'
  ).slice(0, 40);
  if (!/^[a-z]/.test(s)) s = `a_${s}`.slice(0, 40);
  const basis = s;
  for (let n = 2; belegt.has(s); n++) s = `${basis.slice(0, 36)}_${n}`;
  belegt.add(s);
  return s;
}
