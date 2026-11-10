import { kreisVon } from '../../shared/src/nummernkreis';
import { istPasswortWert, leseZahl, type Betrag, type Feld, type Mappentyp, type Wert, type Werte } from '../../shared/src/model';
import {  } from './sprache';
import { istZeitraum, leseProzent, leseZeitraum, type Zeitraum, type Zeitraumeinheit } from '../../shared/src/feldarten';

/**
 * Formulare arbeiten mit Rohwerten (Texten, wie getippt). Erst beim Speichern
 * werden daraus die gespeicherten Werte: Zahlen, Beträge, Listen.
 */
export type RohBetrag = { betrag: string; waehrung: string };
/** Passwortfeld (#46): gespeichert (ohne Wert), neu getippt oder zum Entfernen markiert. */
export type RohPasswort = { gesetzt: boolean; lesbar: boolean; neu: string; entfernen: boolean };
/** Zeitraum (#1035): Anzahl wie getippt, Einheit aus der Auswahl. */
export type RohZeitraum = { anzahl: string; einheit: Zeitraumeinheit };
export type Roh = string | boolean | string[] | RohBetrag | RohPasswort | RohZeitraum;
/** Einheit eines neuen Zeitraums: Monate – so stehen Fristen meist im Vertrag. */
const VORGABE_EINHEIT: Zeitraumeinheit = 'monate';
const zeitraumRoh = (v: unknown): RohZeitraum => {
  const z = leseZeitraum(v);
  return z ? { anzahl: String(z.anzahl), einheit: z.einheit } : { anzahl: '', einheit: VORGABE_EINHEIT };
};
export const leeresPasswort: RohPasswort = { gesetzt: false, lesbar: true, neu: '', entfernen: false };
export type RohWerte = Record<string, Roh>;

const mitKomma = (n: number) => String(n).replace('.', ',');

export function zuRoh(f: Feld, v: Wert | undefined): Roh {
  switch (f.typ) {
    case 'zahl': case 'prozent': return typeof v === 'number' ? mitKomma(v) : '';
    case 'zeitraum': return istZeitraum(v) ? { anzahl: String(v.anzahl), einheit: v.einheit } : zeitraumRoh(v);
    case 'betrag': {
      const b = v as Betrag | null | undefined;
      return { betrag: b && typeof b.betrag === 'number' ? mitKomma(b.betrag) : '', waehrung: b?.waehrung || f.waehrung || 'EUR' };
    }
    case 'janein': return !!v;
    case 'passwort': return istPasswortWert(v) ? { ...leeresPasswort, gesetzt: !!v.gesetzt, lesbar: v.lesbar !== false } : leeresPasswort;
    case 'auswahl':
    case 'referenz':
      if (f.mehrfach) return Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
      return Array.isArray(v) ? (v[0] ?? '') : v == null ? '' : String(v);
    default: return v == null ? '' : String(v);
  }
}

export function ausRoh(f: Feld, r: Roh | undefined): Wert {
  switch (f.typ) {
    case 'zahl': return leseZahl(r);
    // „19“, „19 %“ und „19,0“ ergeben dasselbe (#1035).
    case 'prozent': return leseProzent(r);
    case 'zeitraum': {
      const z = (r ?? zeitraumRoh(null)) as RohZeitraum;
      if (!z.anzahl?.trim()) return null;
      // Ungültiges bleibt stehen, damit die Prüfung es am Feld meldet.
      return leseZeitraum(z) ?? (z as unknown as Zeitraum);
    }
    case 'betrag': {
      const b = r as RohBetrag | undefined;
      const n = leseZahl(b?.betrag);
      if (n == null) return null;
      return { betrag: n, waehrung: (b?.waehrung || 'EUR').trim().toUpperCase() };
    }
    case 'janein': return !!r;
    case 'passwort': {
      const p = (r ?? leeresPasswort) as RohPasswort;
      if (p.neu) return { neu: p.neu };
      if (p.entfernen || !p.gesetzt) return null;
      return { gesetzt: true };
    }
    case 'auswahl':
    case 'referenz':
      if (f.mehrfach) return (Array.isArray(r) ? r : []).filter(Boolean);
      return typeof r === 'string' && r ? r : null;
    default: {
      const s = typeof r === 'string' ? r.trim() : '';
      return s === '' ? null : s;
    }
  }
}

export function rohAusWerten(mappentyp: Mappentyp, werte: Werte): RohWerte {
  const r: RohWerte = {};
  for (const f of mappentyp.felder) r[f.key] = zuRoh(f, werte[f.key]);
  return r;
}

export function standardRoh(mappentyp: Mappentyp): RohWerte {
  const r: RohWerte = {};
  for (const f of mappentyp.felder) {
    const s = f.standard;
    if (f.typ === 'janein') r[f.key] = s === true || s === 'true';
    else if (f.typ === 'passwort') r[f.key] = leeresPasswort;
    else if (f.typ === 'zeitraum') r[f.key] = zeitraumRoh(s);
    else if (f.typ === 'prozent') { const n = leseProzent(s); r[f.key] = n != null && Number.isFinite(n) ? mitKomma(n) : ''; }
    else if (f.typ === 'betrag') r[f.key] = { betrag: s == null ? '' : String(s), waehrung: f.waehrung || 'EUR' };
    else if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) r[f.key] = [];
    // Nummernkreis (#171): vergibt der Server beim Speichern.
    else r[f.key] = f.typ === 'referenz' || s == null || kreisVon(f) ? '' : String(s);
  }
  return r;
}

export function werteAusRoh(mappentyp: Mappentyp, r: RohWerte): Werte {
  const w: Werte = {};
  for (const f of mappentyp.felder) w[f.key] = ausRoh(f, r[f.key]);
  return w;
}
