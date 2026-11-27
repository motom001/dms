/** Erkennung (#1278 aus erkennung.ts): JSON Schema der Felder und Prüfung der Antworten von Engines. */
import type { Feld, Mappentyp, Wert, Betrag } from '../model';
import { ZEITRAUM_ANZAHL_MAX, ZEITRAUM_EINHEITEN, leseZeitraum, leseProzent } from '../feldarten';
import { t } from '../texte';
import { vonAussenFuellbar } from '../berechnet';
import { artVon } from './arten';
import type { Vorschlaege } from './vorschlaege';
import { datumIso } from './angaben';
import { wertZuOption } from '../beschriftung';
import { formatFehler } from '../feldformate';
import { monatsletzter, nurMonat } from '../monatsdatum';

/* ---------- Schema und Prüfung (für Engines, #391 und #511) ---------- */

/** JSON Schema eines Feldwerts nach Feldart. */
function wertSchema(f: Feld): Record<string, unknown> {
  switch (f.typ) {
    case 'datum':
      return { type: 'string', format: 'date' };
    case 'betrag':
      return {
        type: 'object',
        properties: { betrag: { type: 'number' }, waehrung: { type: 'string', pattern: '^[A-Z]{3}$' } },
        required: ['betrag'],
      };
    case 'zahl':
    case 'prozent':
      return {
        type: 'number',
        ...(typeof f.min === 'number' ? { minimum: f.min } : {}),
        ...(typeof f.max === 'number' ? { maximum: f.max } : {}),
      };
    case 'zeitraum':
      return {
        type: 'object',
        properties: { anzahl: { type: 'integer', minimum: 0, maximum: ZEITRAUM_ANZAHL_MAX }, einheit: { enum: [...ZEITRAUM_EINHEITEN] } },
        required: ['anzahl', 'einheit'],
        additionalProperties: false,
      };
    case 'janein':
      return { type: 'boolean' };
    case 'auswahl':
      return f.mehrfach ? { type: 'array', items: { enum: f.optionen ?? [] } } : { enum: f.optionen ?? [] };
    case 'referenz':
      return f.mehrfach ? { type: 'array', items: { type: 'string', format: 'uuid' } } : { type: 'string', format: 'uuid' };
    default:
      return { type: 'string', ...(f.maxLen ? { maxLength: f.maxLen } : {}), ...(f.muster ? { pattern: `^(?:${f.muster})$` } : {}) };
  }
}

/**
 * Maschinenlesbare Beschreibung der Felder eines Typs (JSON Schema 2020-12). Die Antwort einer Engine ist ein
 * Objekt `{ feld: { wert, sicherheit, fundstelle } }`. Passwortfelder kommen nie hinein; `nur` schränkt auf
 * bestimmte Felder ein (z. B. die, die der Benutzer bearbeiten darf).
 */
export function schemaFuer(t: Pick<Mappentyp, 'name' | 'felder'>, nur?: (f: Feld) => boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of t.felder) {
    // Berechnete Felder (#1034) fragt keine Engine an – ihren Wert schreibt nur das Paket.
    if (f.typ === 'passwort' || f.typ === 'formatiert' || !vonAussenFuellbar(f) || (nur && !nur(f))) continue;
    const art = artVon(f);
    properties[f.key] = {
      title: f.label,
      ...(f.hilfe || f.erkennung?.hinweis ? { description: [f.hilfe, f.erkennung?.hinweis].filter(Boolean).join(' – ') } : {}),
      type: 'object',
      properties: {
        wert: wertSchema(f),
        sicherheit: { enum: ['hoch', 'mittel', 'niedrig'] },
        fundstelle: { type: 'string', maxLength: 500 },
      },
      required: ['wert'],
      additionalProperties: false,
      'x-dms-feldtyp': f.typ,
      ...(art ? { 'x-dms-erkennung': art } : {}),
      ...(f.erkennung ? { 'x-dms-markiert': true } : {}),
      ...(f.typ === 'betrag' ? { 'x-dms-waehrung': f.waehrung || 'EUR' } : {}),
      ...(f.typ === 'text' && f.format ? { 'x-dms-format': f.format } : {}),
    };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: t.name,
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Antwort einer Engine gegen die Feldtypen prüfen: unbekannte Felder, Passwortfelder, falsche Typen und Werte
 * außerhalb der Auswahl fallen weg (mit Grund – der Server protokolliert sie). `erlaubt` begrenzt auf Felder.
 */
export function pruefeVorschlaege(
  pick: Pick<Mappentyp, 'felder'>,
  antwort: unknown,
  erlaubt?: (f: Feld) => boolean,
): { vorschlaege: Vorschlaege; verworfen: Array<{ feld: string; grund: string }> } {
  const vorschlaege: Vorschlaege = {};
  const verworfen: Array<{ feld: string; grund: string }> = [];
  if (!antwort || typeof antwort !== 'object' || Array.isArray(antwort))
    return { vorschlaege, verworfen: [{ feld: '', grund: t('gemeinsam.erkennung.die-antwort-ist-kein') }] };
  for (const [key, roh] of Object.entries(antwort as Record<string, unknown>)) {
    const weg = (grund: string) => verworfen.push({ feld: key.slice(0, 60), grund });
    const f = pick.felder.find((x) => x.key === key);
    if (!f) {
      weg(t('gemeinsam.erkennung.dieses-feld-gibt-es'));
      continue;
    }
    if (f.typ === 'passwort' || f.typ === 'formatiert') {
      weg(t('gemeinsam.erkennung.dieses-feld-fuellt-die'));
      continue;
    }
    // Berechnete Felder (#1034) schreibt nur ihr Paket – auch ohne `erlaubt` nie ein Vorschlag.
    if (!vonAussenFuellbar(f) || (erlaubt && !erlaubt(f))) {
      weg(t('gemeinsam.erkennung.dieses-feld-darf-nicht'));
      continue;
    }
    const o = roh && typeof roh === 'object' && !Array.isArray(roh) && 'wert' in roh ? (roh as Record<string, unknown>) : { wert: roh };
    const s = o.sicherheit === 'hoch' || o.sicherheit === 'mittel' || o.sicherheit === 'niedrig' ? o.sicherheit : 'mittel';
    const fundstelle = typeof o.fundstelle === 'string' ? o.fundstelle.slice(0, 500) : '';
    const w = o.wert;
    let gut: Wert | undefined;
    switch (f.typ) {
      case 'datum':
        gut =
          typeof w === 'string' && ISO.test(w) && datumIso(Number(w.slice(8, 10)), Number(w.slice(5, 7)), Number(w.slice(0, 4))) === w
            ? // Genauigkeit Monat (#1722): auch Antworten aus Paketen werden zum Monatsletzten.
              nurMonat(f)
              ? (monatsletzter(w) ?? w)
              : w
            : undefined;
        break;
      case 'betrag': {
        const b = w as Record<string, unknown> | null;
        gut =
          b && typeof b === 'object' && typeof b.betrag === 'number' && Number.isFinite(b.betrag)
            ? {
                betrag: Math.round(b.betrag * 100) / 100,
                waehrung: typeof b.waehrung === 'string' && /^[A-Z]{3}$/.test(b.waehrung) ? b.waehrung : f.waehrung || 'EUR',
              }
            : undefined;
        if (
          gut &&
          ((typeof f.min === 'number' && (gut as Betrag).betrag < f.min) || (typeof f.max === 'number' && (gut as Betrag).betrag > f.max))
        )
          gut = undefined;
        // Negativ nur, wenn das Feld es erlaubt (#1035).
        if (gut && !f.negativ && (gut as Betrag).betrag < 0) gut = undefined;
        break;
      }
      case 'zeitraum':
        gut = leseZeitraum(w) ?? undefined;
        break;
      case 'prozent': {
        const n = leseProzent(w);
        gut =
          n != null && Number.isFinite(n) && (typeof f.min !== 'number' || n >= f.min) && (typeof f.max !== 'number' || n <= f.max)
            ? n
            : undefined;
        break;
      }
      case 'zahl':
        gut =
          typeof w === 'number' &&
          Number.isFinite(w) &&
          (typeof f.min !== 'number' || w >= f.min) &&
          (typeof f.max !== 'number' || w <= f.max)
            ? w
            : undefined;
        break;
      case 'janein':
        gut = typeof w === 'boolean' ? w : undefined;
        break;
      case 'auswahl': {
        // Eine Engine darf auch die Beschriftung nennen (#728); übernommen wird der feste Wert.
        const liste = (Array.isArray(w) ? w : [w]).map((x) => (typeof x === 'string' ? wertZuOption(f, x) : undefined));
        const ok = liste.length > 0 && liste.every((x) => x !== undefined) && (f.mehrfach || liste.length === 1);
        gut = ok ? (f.mehrfach ? (liste as string[]) : (liste[0] as string)) : undefined;
        break;
      }
      case 'referenz': {
        const liste = Array.isArray(w) ? w : [w];
        gut =
          liste.length && liste.every((x) => typeof x === 'string' && UUID.test(x)) && (f.mehrfach || liste.length === 1)
            ? f.mehrfach
              ? (liste as string[])
              : (liste[0] as string)
            : undefined;
        break;
      }
      default: {
        const txt = typeof w === 'string' ? w.trim() : typeof w === 'number' ? String(w) : null;
        let ok = !!txt && (f.maxLen == null || txt.length <= f.maxLen) && txt.length <= 5000;
        if (ok && f.muster) {
          try {
            ok = new RegExp(`^(?:${f.muster})$`).test(txt!);
          } catch {
            ok = false;
          }
        }
        gut = ok ? txt! : undefined;
      }
    }
    if (gut === undefined || formatFehler(f, gut, { felder: pick.felder, werte: {} })) {
      weg(t('gemeinsam.erkennung.der-wert-passt-nicht', { typ: f.typ }));
      continue;
    }
    vorschlaege[key] = { wert: gut, sicherheit: s, fundstelle };
  }
  return { vorschlaege, verworfen };
}
