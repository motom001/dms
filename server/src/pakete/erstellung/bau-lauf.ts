/**
 * Gemeinsamer Stand beim Bauen eines Pakets (#1278, Schritt 6a; vorher Teil von `baue`): Probleme, Hinweise,
 * Abhängigkeiten und Kennungen – dazu die Verweise auf Mappentypen, die alle Schritte brauchen.
 */
import { type Mappentyp } from '../../../../shared/src/model';
import { DMS_ALIAS, vergleicheVersion, type InstalliertesPaket } from '../../../../shared/src/pakete';
import { type PaketErstellenEingabe } from '../../../../shared/src/paketerstellung';
import type { Sicht } from '../../../../shared/src/sichten';
import { t } from '../../sprache/sprache';
import { BASIS_ABLAGEORT_AB, DMS_TYPEN } from '../verwaltung/format';
import { aenderung, type Bau, type ErstellenDaten, untergrenze } from './bau-hilfen';

/** Typ bzw. Ansicht → installiertes Paket und Schlüssel darin. */
type PaketHerkunft = Map<string, { p: InstalliertesPaket; s: string }>;

/** Stand eines Baus: Eingabe, Daten und was die Schritte nach und nach sammeln. */
export interface BauLauf {
  e: PaketErstellenEingabe;
  d: ErstellenDaten;
  id: string;
  probleme: string[];
  hinweise: string[];
  fehlend: Bau['fehlend'];
  abh: Record<string, string>;
  typById: Map<string, Mappentyp>;
  sichtById: Map<string, Sicht>;
  typPaket: PaketHerkunft;
  sichtPaket: PaketHerkunft;
  /** Hinweise nur einmal. */
  einmal: Set<string>;
  /** Kennungen im Paket je Id (Typen, dann Ansichten). */
  schluessel: Record<string, string>;
  /** Ein Verweis zeigt auf einen Mappentyp des DMS (dms:…). */
  dmsVerweise: boolean;
}

export function neuerLauf(e: PaketErstellenEingabe, d: ErstellenDaten): BauLauf {
  // Herkunft: welche Typen und Ansichten gehören zu einem installierten Paket?
  const typPaket: PaketHerkunft = new Map();
  const sichtPaket: PaketHerkunft = new Map();
  for (const p of d.pakete) {
    for (const [s, tid] of Object.entries(p.typen)) typPaket.set(tid, { p, s });
    for (const [s, sid] of Object.entries(p.sichten)) sichtPaket.set(sid, { p, s });
  }
  return {
    e,
    d,
    id: e.id.trim(),
    probleme: [],
    hinweise: [],
    fehlend: [],
    abh: {},
    typById: new Map(d.typen.map((t) => [t.id, t] as const)),
    sichtById: new Map(d.sichten.map((s) => [s.id, s] as const)),
    typPaket,
    sichtPaket,
    einmal: new Set<string>(),
    schluessel: {},
    dmsVerweise: false,
  };
}

const geaendert = (l: BauLauf, t: Mappentyp) => {
  const h = l.typPaket.get(t.id);
  return !!h && aenderung(t, h.p, (id) => l.typById.get(id)?.schluessel).geaendert;
};

export const hinweis = (l: BauLauf, h: string) => {
  if (!l.einmal.has(h)) {
    l.einmal.add(h);
    l.hinweise.push(h);
  }
};

export const abhaengig = (l: BauLauf, p: InstalliertesPaket) => {
  const b = `>=${p.version}`;
  if (!l.abh[p.id] || vergleicheVersion(p.version, untergrenze(l.abh[p.id]) ?? '0.0.0') > 0) l.abh[p.id] = b;
};

export const ausPaket = (l: BauLauf, art: string, name: string, p: InstalliertesPaket, eintrag?: Mappentyp) => {
  abhaengig(l, p);
  hinweis(l, t('meldungen.paketerstellung.kommt-aus-dem-paket', { art, name, name2: p.name, id: p.id, version: p.version }));
  if (eintrag && geaendert(l, eintrag))
    hinweis(l, t('meldungen.paketerstellung.aenderungen-an-gehoeren-nicht', { name: eintrag.name, name2: p.name }));
};

/** Verweis auf einen Typ: eigener → Kennung, Paket → paket:kennung, DMS → dms:…; sonst null. */
export const ziel = (l: BauLauf, typId: string | undefined, wo: string): string | null => {
  const { probleme, schluessel, d, abh, typById, typPaket, fehlend } = l;
  if (!typId) {
    probleme.push(`${wo}: ohne Ziel.`);
    return null;
  }
  if (schluessel[typId]) return schluessel[typId];
  const k = d.dmsTypen.get(typId);
  // Früherer Ablageort des Kerns (#883): Das Paket verweist auf basis:ablageort und braucht Basis ab 1.6.0.
  if (k && DMS_ALIAS[k]) {
    const [p, s] = DMS_ALIAS[k].split(':');
    if (!abh[p] || vergleicheVersion(BASIS_ABLAGEORT_AB, untergrenze(abh[p]) ?? '0.0.0') > 0) abh[p] = `>=${BASIS_ABLAGEORT_AB}`;
    hinweis(l, t('meldungen.paketerstellung.ablageort-aus-basis', { name: typById.get(typId)?.name ?? k, version: BASIS_ABLAGEORT_AB }));
    return `${p}:${s}`;
  }
  if (k && DMS_TYPEN[k]) {
    l.dmsVerweise = true;
    return `dms:${k}`;
  }
  const eintrag = typById.get(typId);
  const h = typPaket.get(typId);
  if (h && eintrag) {
    ausPaket(l, t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag);
    return `${h.p.id}:${h.s}`;
  }
  if (!eintrag) {
    probleme.push(`${wo}: Den Ziel-Mappentyp gibt es nicht mehr.`);
    return null;
  }
  if (eintrag.system) {
    probleme.push(
      `${wo}: verweist auf „${eintrag.name}“. Darauf kann ein Paket nicht verweisen (erlaubt: ${Object.values(DMS_TYPEN).join(', ')}).`,
    );
    return null;
  }
  if (!fehlend.some((f) => f.id === eintrag.id)) fehlend.push({ art: 'typ', id: eintrag.id, name: eintrag.name, grund: wo, noetig: true });
  return null;
};
