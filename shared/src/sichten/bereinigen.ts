/** Sichten (#1278 aus sichten.ts): Eingaben bereinigen, prüfen und beschreiben. */
import {
  type WertAngabe,
  EINHEITEN,
  type Einheit,
  type Bedingung,
  OPERATOREN,
  type Operator,
  ZAEHLVERGLEICHE,
  type Zaehlvergleich,
  FRIST_TAGE_MAX,
} from './bedingungen';
import { istMerkmal, merkmalText } from '../merkmale';
import { t } from '../texte';
import type { Mappentyp } from '../model/basis';
import { bedingungsfelder } from './felder';
import { optionText } from '../beschriftung';
import { leseZeitraum, zeitraumText } from '../feldarten';

/* ---------- Eingaben bereinigen ---------- */

const ARTEN_WERT = ['fest', 'heute', 'jahr', 'monat', 'ich', 'meineRollen', 'eigenesFeld'];

function bereinigeWert(w: unknown): WertAngabe | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const x = w as Record<string, unknown>;
  if (!ARTEN_WERT.includes(String(x.art))) return undefined;
  const versatz = Math.max(-1000, Math.min(1000, Math.trunc(Number(x.versatz) || 0)));
  switch (x.art) {
    case 'fest': {
      const v = x.wert;
      if (Array.isArray(v)) return { art: 'fest', wert: v.map(String).slice(0, 200) };
      if (typeof v === 'string') return { art: 'fest', wert: v.slice(0, 500) };
      if (typeof v === 'number' || typeof v === 'boolean') return { art: 'fest', wert: v };
      return undefined;
    }
    case 'heute':
      return {
        art: 'heute',
        versatz,
        einheit: (Object.keys(EINHEITEN) as Einheit[]).includes(x.einheit as Einheit) ? (x.einheit as Einheit) : 'tage',
      };
    case 'jahr':
      return { art: 'jahr', versatz };
    case 'monat':
      return { art: 'monat', versatz };
    case 'eigenesFeld':
      return typeof x.feld === 'string' && x.feld ? { art: 'eigenesFeld', feld: x.feld.slice(0, 60) } : undefined;
    default:
      return { art: x.art as 'ich' | 'meineRollen' };
  }
}

export function bereinigeBedingungen(e: unknown): Bedingung[] {
  if (!Array.isArray(e)) return [];
  const erg: Bedingung[] = [];
  for (const roh of e.slice(0, 50)) {
    const b = (roh ?? {}) as Record<string, unknown>;
    if (b.art === 'feld' && typeof b.feld === 'string' && Object.prototype.hasOwnProperty.call(OPERATOREN, String(b.op))) {
      const x: Bedingung = { art: 'feld', feld: b.feld.slice(0, 60), op: b.op as Operator };
      const wert = bereinigeWert(b.wert);
      const bis = bereinigeWert(b.bis);
      if (wert) x.wert = wert;
      if (bis && (x.op === 'zwischen' || x.op === 'ausserhalb')) x.bis = bis;
      erg.push(x);
    } else if ((b.art === 'dokumente' || b.art === 'verknuepfungen') && typeof b.register === 'string') {
      const vergleich = Object.prototype.hasOwnProperty.call(ZAEHLVERGLEICHE, String(b.vergleich))
        ? (b.vergleich as Zaehlvergleich)
        : 'gleich';
      erg.push({ art: b.art, register: b.register.slice(0, 60), vergleich, anzahl: Math.max(0, Math.trunc(Number(b.anzahl) || 0)) });
    } else if (b.art === 'dokumenteGesamt' || b.art === 'verknuepfungenGesamt') {
      const vergleich = Object.prototype.hasOwnProperty.call(ZAEHLVERGLEICHE, String(b.vergleich))
        ? (b.vergleich as Zaehlvergleich)
        : 'gleich';
      erg.push({ art: b.art, vergleich, anzahl: Math.max(0, Math.trunc(Number(b.anzahl) || 0)) });
    } else if (b.art === 'favorit') {
      erg.push({ art: 'favorit' });
    } else if (b.art === 'merkmal' && istMerkmal(b.merkmal)) {
      erg.push({ art: 'merkmal', merkmal: b.merkmal, ...(b.nicht === true ? { nicht: true } : {}) });
    } else if (b.art === 'frist') {
      erg.push({
        art: 'frist',
        feld: typeof b.feld === 'string' && b.feld ? b.feld.slice(0, 60) : null,
        tage: Math.max(0, Math.min(FRIST_TAGE_MAX, Math.trunc(Number(b.tage) || 0))),
        ...(b.nurMeine === true ? { nurMeine: true } : {}),
      });
    }
  }
  return erg;
}

const ARTEN_BEDINGUNG = ['feld', 'dokumente', 'verknuepfungen', 'dokumenteGesamt', 'verknuepfungenGesamt', 'favorit', 'frist', 'merkmal'];

/**
 * Warum `bereinigeBedingungen` diese Eingabe nicht oder nur zum Teil übernähme – null = in Ordnung (#1108). Für Pakete:
 * Dort ist eine falsch geschriebene Bedingung ein Fehler beim Installieren, statt still wegzufallen. Ob das Feld zum
 * Mappentyp passt, prüft `bedingungsProblem`; hier geht es nur um die Schreibweise.
 */
export function bedingungEingabeFehler(roh: unknown): string | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return t('gemeinsam.bedingungspruefung.kein-objekt');
  const b = roh as Record<string, unknown>;
  if (b.art === undefined) return t('gemeinsam.bedingungspruefung.art-fehlt', { arten: ARTEN_BEDINGUNG.join(', ') });
  if (!ARTEN_BEDINGUNG.includes(String(b.art)))
    return t('gemeinsam.bedingungspruefung.art-unbekannt', { art: String(b.art), arten: ARTEN_BEDINGUNG.join(', ') });
  if (b.art === 'feld') return feldbedingungFehler(b);
  if (b.art === 'merkmal') return istMerkmal(b.merkmal) ? null : t('gemeinsam.merkmale.unbekannt', { merkmal: String(b.merkmal) });
  return b.art === 'favorit' || b.art === 'frist' ? null : zaehlbedingungFehler(b);
}

function zaehlbedingungFehler(b: Record<string, unknown>): string | null {
  if ((b.art === 'dokumente' || b.art === 'verknuepfungen') && (typeof b.register !== 'string' || !b.register))
    return t('gemeinsam.bedingungspruefung.register-fehlt');
  return b.vergleich !== undefined && !Object.hasOwn(ZAEHLVERGLEICHE, String(b.vergleich))
    ? t('gemeinsam.bedingungspruefung.vergleich', { wert: String(b.vergleich), moeglich: Object.keys(ZAEHLVERGLEICHE).join(', ') })
    : null;
}

function feldbedingungFehler(b: Record<string, unknown>): string | null {
  if (typeof b.feld !== 'string' || !b.feld) return t('gemeinsam.bedingungspruefung.feld-fehlt');
  if (!Object.hasOwn(OPERATOREN, String(b.op)))
    return t('gemeinsam.bedingungspruefung.op', { op: String(b.op ?? ''), moeglich: Object.keys(OPERATOREN).join(', ') });
  const falsch = (['wert', 'bis'] as const).find((k) => b[k] !== undefined && !bereinigeWert(b[k]));
  if (falsch) return t('gemeinsam.bedingungspruefung.wert', { teil: falsch, arten: ARTEN_WERT.join(', ') });
  return b.bis !== undefined && b.op !== 'zwischen' && b.op !== 'ausserhalb' ? t('gemeinsam.bedingungspruefung.bis') : null;
}

/** Bedingung lesbar, z. B. „Kündigung bis zwischen heute und heute + 90 Tage“. */
export function beschreibeBedingung(
  b: Bedingung,
  typen: Mappentyp[],
  titelVon: (id: string) => string = (id) => id,
  eigeneNamen?: Record<string, string>,
  typNameVon?: (id: string) => string | undefined,
): string {
  if (b.art === 'favorit') return t('gemeinsam.sichten.ist-mein-favorit');
  if (b.art === 'merkmal') return merkmalText(b.merkmal, b.nicht);
  if (b.art === 'frist') {
    const feld = b.feld ? (typen.flatMap((t) => t.felder).find((f) => f.key === b.feld)?.label ?? b.feld) : null;
    return t('gemeinsam.sichten.hat-frist-in-den', {
      anzahl: b.tage,
      wert: feld ? ` („${feld}“)` : '',
      wert2: b.nurMeine ? t('gemeinsam.sichten.nur-meine') : '',
    });
  }
  if (b.art === 'dokumenteGesamt')
    return t('gemeinsam.sichten.dokumente-insgesamt-dokumente', { anzahl: b.anzahl, ZAEHLVERGLEICHE: ZAEHLVERGLEICHE[b.vergleich] });
  if (b.art === 'verknuepfungenGesamt')
    return t('gemeinsam.sichten.verknuepfungen-insgesamt', { anzahl: b.anzahl, ZAEHLVERGLEICHE: ZAEHLVERGLEICHE[b.vergleich] });
  if (b.art !== 'feld') {
    const namen = [...new Set(typen.map((t) => t.register.find((x) => x.key === b.register)?.name).filter(Boolean))];
    const r = { name: namen.length ? namen.join(' / ') : undefined };
    return `${r?.name ?? b.register}: ${ZAEHLVERGLEICHE[b.vergleich]} ${b.anzahl} ${b.art === 'dokumente' ? t('gemeinsam.sichten.dokumente', { anzahl: b.anzahl }) : t('gemeinsam.sichten.verknuepfungen', { anzahl: b.anzahl })}`;
  }
  const f = bedingungsfelder(typen).find((x) => x.key === b.feld);
  const wert = (w?: WertAngabe): string => {
    if (!w) return '…';
    switch (w.art) {
      case 'heute': {
        const n = Number(w.versatz) || 0;
        return n ? `heute ${n > 0 ? '+' : '−'} ${Math.abs(n)} ${EINHEITEN[w.einheit ?? 'tage']}` : 'heute';
      }
      case 'jahr': {
        const n = Number(w.versatz) || 0;
        return n === 0
          ? t('gemeinsam.sichten.aktuelles-jahr')
          : n === -1
            ? t('gemeinsam.sichten.letztes-jahr')
            : t('gemeinsam.sichten.jahr', { anzahl: n, wert: n > 0 ? '+' : '−', abs: Math.abs(n) });
      }
      case 'monat': {
        const n = Number(w.versatz) || 0;
        return n === 0
          ? t('gemeinsam.sichten.aktueller-monat')
          : n === -1
            ? t('gemeinsam.sichten.letzter-monat')
            : t('gemeinsam.sichten.monat', { anzahl: n, wert: n > 0 ? '+' : '−', abs: Math.abs(n) });
      }
      case 'ich':
        return t('gemeinsam.sichten.aktueller-benutzer');
      case 'meineRollen':
        return t('gemeinsam.sichten.rollen-des-aktuellen-benutzers');
      case 'eigenesFeld':
        return t('gemeinsam.sichten.dieser-mappe', { wert: eigeneNamen?.[w.feld] ?? w.feld });
      case 'fest': {
        const v = w.wert;
        // „zeigt auf Mappe vom Typ …“ (#1036): Namen der Mappentypen.
        if (b.op === 'zeigtAufTyp')
          return (Array.isArray(v) ? v : [String(v)])
            .map((x) => `„${typNameVon?.(String(x)) ?? typen.find((y) => y.id === x)?.name ?? x}“`)
            .join(' oder ');
        if (f?.art === 'referenz' || f?.art === 'person')
          return (Array.isArray(v) ? v : [String(v)]).map((x) => `„${titelVon(String(x))}“`).join(' oder ');
        // Auswahl (#728): gespeichert ist der feste Wert, gezeigt die Beschriftung.
        if (Array.isArray(v)) return v.map((x) => `„${f?.art === 'auswahl' && f.feld ? optionText(f.feld, String(x)) : x}“`).join(', ');
        if (f?.art === 'datum' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('.');
        // Zeitraum (#1035): gespeichert „P3M“, gezeigt „3 Monate“.
        if (f?.art === 'zeitraum') {
          const z = leseZeitraum(v);
          if (z) return zeitraumText(z);
        }
        return typeof v === 'string' ? `„${v}“` : String(v).replace('.', ',');
      }
    }
  };
  const name = f?.label ?? b.feld;
  if (b.op === 'leer' || b.op === 'nichtLeer' || b.op === 'ja' || b.op === 'nein') return `${name} ${OPERATOREN[b.op]}`;
  if (b.op === 'zwischen' || b.op === 'ausserhalb') return `${name} ${OPERATOREN[b.op]} ${wert(b.wert)} und ${wert(b.bis)}`;
  return `${name} ${OPERATOREN[b.op]} ${wert(b.wert)}`;
}
