/**
 * Berechtigungen an Sichten (#148). Server und Oberfläche teilen diese Datei.
 *
 * Sichtregeln steuern nur die Sicht: ob sie im Baum erscheint (R), ob es dort „+ Neu“ gibt (C) und ob
 * man aus ihr exportieren darf (E: Tabelle, ZIP, PDF).
 * Ob eine Mappe lesbar ist, regelt weiter allein der Mappentyp. Für Administratoren gelten sie nicht.
 *
 * Vererbung: Eine Untersicht erbt die Regeln ihrer Elternsicht (und deren Eltern). Ihre eigenen Regeln
 * können nur weiter einschränken – wirksam ist ein Recht an der Untersicht nur, wenn es an der Elternsicht
 * gilt UND die eigenen Regeln es nicht entziehen. Den Standard (✓/✗ je Recht) hat nur die oberste Sicht.
 */
import type { Wer, Wirkung } from './rechte';
import {
  SICHT_RECHTE,
  type Sicht,
  type SichtBedingung,
  type SichtRecht,
  type SichtRechte,
  type SichtRegel,
  type SichtRegelwerk,
} from './sichten';
import { t } from './texte';
/** Die Form der Rechte an einer Sicht steht seit #1278 (Schritt 5) bei der Sicht (sichten/baum.ts); hier weiter erreichbar. */
export { SICHT_RECHTE, type SichtBedingung, type SichtRecht, type SichtRechte, type SichtRegel, type SichtRegelwerk } from './sichten';

export const SICHT_RECHTE_LISTE = Object.keys(SICHT_RECHTE) as SichtRecht[];
export const SICHT_ALLES = (): SichtRechte => Object.fromEntries(SICHT_RECHTE_LISTE.map((k) => [k, true])) as SichtRechte;
export const SICHT_NICHTS = (): SichtRechte => Object.fromEntries(SICHT_RECHTE_LISTE.map((k) => [k, false])) as SichtRechte;

export const offeneSicht = (): SichtRegelwerk => ({ grund: SICHT_ALLES(), regeln: [] });
export const sichtRegelwerkVon = (s: { berechtigungen?: SichtRegelwerk | null } | undefined): SichtRegelwerk =>
  s?.berechtigungen ?? offeneSicht();
export const istOffeneSicht = (r: SichtRegelwerk) => SICHT_RECHTE_LISTE.every((k) => r.grund[k]) && !r.regeln.length;
export const kurzSicht = (g: SichtRechte) => SICHT_RECHTE_LISTE.filter((k) => g[k]).join('') || '–';
export function kurzSichtRegel(dann: SichtRegel['dann']): string {
  const plus = SICHT_RECHTE_LISTE.filter((k) => dann[k] === 'erteilen').join('');
  const minus = SICHT_RECHTE_LISTE.filter((k) => dann[k] === 'entziehen').join('');
  return [plus && `+${plus}`, minus && `−${minus}`].filter(Boolean).join(' ') || '–';
}

/* ---------- Auswerten ---------- */

const trifft = (b: SichtBedingung, wer: Wer) => {
  const x = b.art === 'benutzer' ? b.benutzer.includes(wer.id) : b.rollen.some((r) => wer.rollen.includes(r));
  return b.nicht ? !x : x;
};

export interface SichtSchritt {
  regel: string;
  name: string;
  traf: boolean | null;
  gesetzt: SichtRegel['dann'];
  stand: SichtRechte;
  stopp: boolean;
}

/**
 * Die eigenen Regeln einer Sicht für einen Benutzer. `untersicht`: Standard gilt nicht (alles erteilt)
 * und Regeln können nur entziehen – ein ✓ wirkt nicht.
 */
export function eigeneSichtRechte(rw: SichtRegelwerk, wer: Wer, untersicht: boolean): { rechte: SichtRechte; spur: SichtSchritt[] } {
  const rechte = untersicht ? SICHT_ALLES() : { ...SICHT_ALLES(), ...rw.grund };
  const spur: SichtSchritt[] = [];
  let gestoppt = false;
  for (const r of rw.regeln) {
    if (gestoppt) {
      spur.push({ regel: r.id, name: r.name, traf: null, gesetzt: {}, stand: { ...rechte }, stopp: r.stopp });
      continue;
    }
    const traf = r.wenn.length > 0 && r.wenn.every((b) => trifft(b, wer));
    const gesetzt: SichtRegel['dann'] = {};
    if (traf) {
      for (const k of SICHT_RECHTE_LISTE) {
        const w = r.dann[k];
        if (!w || (untersicht && w === 'erteilen')) continue;
        rechte[k] = w === 'erteilen';
        gesetzt[k] = w;
      }
      if (r.stopp) gestoppt = true;
    }
    spur.push({ regel: r.id, name: r.name, traf, gesetzt, stand: { ...rechte }, stopp: r.stopp });
  }
  return { rechte, spur };
}

/** Vorfahren einer Sicht, von oben nach unten (ohne die Sicht selbst, ohne Kreise). */
export function vorfahren(alle: Sicht[], id: string): Sicht[] {
  const erg: Sicht[] = [];
  const gesehen = new Set([id]);
  let s = alle.find((x) => x.id === id);
  while (s?.elternId && !gesehen.has(s.elternId)) {
    gesehen.add(s.elternId);
    const e = alle.find((x) => x.id === s!.elternId);
    if (!e) break;
    erg.unshift(e);
    s = e;
  }
  return erg;
}

/** Wirksame Rechte an einer Sicht: die Kette von oben, jeweils Eltern UND eigene. */
export function sichtRechte(alle: Sicht[], id: string, wer: Wer): SichtRechte {
  const s = alle.find((x) => x.id === id);
  if (!s) return SICHT_NICHTS();
  const kette = [...vorfahren(alle, id), s];
  const erg = SICHT_ALLES();
  kette.forEach((x, i) => {
    const eigene = eigeneSichtRechte(sichtRegelwerkVon(x), wer, i > 0).rechte;
    for (const k of SICHT_RECHTE_LISTE) erg[k] = erg[k] && eigene[k];
  });
  return erg;
}

/** Rechte an allen Sichten auf einmal (Admins: alles). */
export function alleSichtRechte(alle: Sicht[], wer: Wer, admin: boolean): Map<string, SichtRechte> {
  return new Map(alle.map((s) => [s.id, admin ? SICHT_ALLES() : sichtRechte(alle, s.id, wer)] as const));
}

/** Für den Testlauf: je Sicht der Kette ihre Schritte und der Stand danach. */
export function sichtTestlauf(
  alle: Sicht[],
  id: string,
  wer: Wer,
): Array<{
  sicht: string;
  name: string;
  untersicht: boolean;
  grund: SichtRechte | null;
  spur: SichtSchritt[];
  eigene: SichtRechte;
  stand: SichtRechte;
}> {
  const s = alle.find((x) => x.id === id);
  if (!s) return [];
  const stand = SICHT_ALLES();
  return [...vorfahren(alle, id), s].map((x, i) => {
    const rw = sichtRegelwerkVon(x);
    const { rechte, spur } = eigeneSichtRechte(rw, wer, i > 0);
    for (const k of SICHT_RECHTE_LISTE) stand[k] = stand[k] && rechte[k];
    return {
      sicht: x.id,
      name: x.name,
      untersicht: i > 0,
      grund: i > 0 ? null : { ...SICHT_ALLES(), ...rw.grund },
      spur,
      eigene: rechte,
      stand: { ...stand },
    };
  });
}

/* ---------- Eingaben bereinigen und prüfen ---------- */

const neueId = () => Math.random().toString(36).slice(2, 10);

/** null = keine eigenen Regeln (alles erteilt bzw. nur geerbt). */
export function bereinigeSichtRegelwerk(e: unknown): SichtRegelwerk | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const g = (x.grund && typeof x.grund === 'object' ? x.grund : {}) as Record<string, unknown>;
  const grund = Object.fromEntries(SICHT_RECHTE_LISTE.map((k) => [k, g[k] !== false])) as SichtRechte;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String))].slice(0, 200) : []);
  const regeln = (Array.isArray(x.regeln) ? x.regeln : []).slice(0, 100).map((r): SichtRegel => {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const d = (o.dann && typeof o.dann === 'object' ? o.dann : {}) as Record<string, unknown>;
    const dann: SichtRegel['dann'] = {};
    for (const k of SICHT_RECHTE_LISTE) if (d[k] === 'erteilen' || d[k] === 'entziehen') dann[k] = d[k] as Wirkung;
    const wenn = (Array.isArray(o.wenn) ? o.wenn : []).slice(0, 20).flatMap((b): SichtBedingung[] => {
      const y = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
      const n = y.nicht === true ? { nicht: true } : {};
      if (y.art === 'rolle') return [{ ...n, art: 'rolle', rollen: ids(y.rollen) }];
      if (y.art === 'benutzer') return [{ ...n, art: 'benutzer', benutzer: ids(y.benutzer) }];
      return [];
    });
    return {
      id: typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? o.id : neueId(),
      name: (typeof o.name === 'string' ? o.name : '').replace(/\s+/g, ' ').trim().slice(0, 80),
      wenn,
      dann,
      stopp: o.stopp === true,
    };
  });
  const rw = { grund, regeln };
  return istOffeneSicht(rw) ? null : rw;
}

/** Warum eine Regel nicht passt; null = in Ordnung. */
export function sichtRegelProblem(r: SichtRegel, untersicht: boolean): string | null {
  if (!r.name) return t('gemeinsam.sichtrechte.bitte-der-regel-einen');
  if (!r.wenn.length) return t('gemeinsam.sichtrechte.mindestens-eine-bedingung-angeben', { name: r.name });
  for (const b of r.wenn) {
    if (b.art === 'benutzer' && !b.benutzer.length) return t('gemeinsam.sichtrechte.benutzer-auswaehlen', { name: r.name });
    if (b.art === 'rolle' && !b.rollen.length) return t('gemeinsam.sichtrechte.rolle-auswaehlen', { name: r.name });
  }
  if (untersicht && SICHT_RECHTE_LISTE.some((k) => r.dann[k] === 'erteilen'))
    return t('gemeinsam.sichtrechte.in-einer-unteransicht-koennen', { name: r.name });
  if (!SICHT_RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp)
    return t('gemeinsam.sichtrechte.aendert-nichts-mindestens-ein', {
      name: r.name,
      wert: untersicht ? '' : t('gemeinsam.sichtrechte.oder-erteilen'),
    });
  return null;
}
