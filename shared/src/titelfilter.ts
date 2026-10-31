/**
 * Filter für Platzhalter in der Titel-Vorlage (#170): `{feld|filter|filter:argument}`.
 *
 *   jahr, monat          Teil eines Datums                 {rechnungsdatum|jahr} → 2026
 *   datum:"MM/JJJJ"      Datum im eigenen Format           {datum|datum:"MM/JJJJ"} → 10/2026
 *   ohne_waehrung        Betrag ohne Währungszeichen        {betrag|ohne_waehrung} → 1.234,50
 *   gross, klein         Groß- bzw. Kleinschreibung         {kennzeichen|gross}
 *   kurz:n               auf n Zeichen kürzen, mit „…“      {betreff|kurz:30}
 *   sonst:"…"            Ersatz, wenn das Feld leer ist     {nummer|sonst:"ohne Nr."}
 *
 * Bewusst klein und selbst gebaut: keine Bedingungen, Schleifen oder Rechnungen. Wer rechnen will,
 * nimmt ein berechnetes Feld (#169). Diese Datei kennt keine Mappentypen; model.ts reicht Feldart,
 * Rohwert und formatierten Text herein.
 */

/** Platzhalter mit optionalen Filtern; Gruppe 1 = Schlüssel, Gruppe 2 = Filterkette samt führendem „|“. */
export const PLATZHALTER_MIT_FILTERN = /\{([a-z][a-z0-9_]*)((?:\|[^{}|]*)*)\}/g;

export interface Filter { name: string; arg?: string }

export const FILTER = {
  jahr: { text: 'Jahr eines Datums', arten: ['datum'] },
  monat: { text: 'Monat eines Datums (01–12)', arten: ['datum'] },
  datum: { text: 'Datum im eigenen Format, z. B. datum:"MM/JJJJ"', arten: ['datum'], arg: 'text' },
  ohne_waehrung: { text: 'Betrag ohne Währungszeichen', arten: ['betrag'] },
  gross: { text: 'in Großbuchstaben', arten: null },
  klein: { text: 'in Kleinbuchstaben', arten: null },
  kurz: { text: 'auf n Zeichen kürzen, z. B. kurz:30', arten: null, arg: 'zahl' },
  sonst: { text: 'Ersatz, wenn das Feld leer ist, z. B. sonst:"ohne Nr."', arten: null, arg: 'text' },
} as const satisfies Record<string, { text: string; arten: readonly string[] | null; arg?: 'text' | 'zahl' }>;
export type FilterName = keyof typeof FILTER;

const istFilter = (n: string): n is FilterName => Object.prototype.hasOwnProperty.call(FILTER, n);

/** „|jahr|kurz:20|sonst:"x"“ → Liste; Argumente in "…" oder „…“ dürfen alles außer | { } enthalten. */
export function liesFilter(kette: string): Filter[] {
  if (!kette) return [];
  return kette.split('|').slice(1).map((teil) => {
    const t = teil.trim();
    const i = t.indexOf(':');
    if (i < 0) return { name: t };
    let arg = t.slice(i + 1).trim();
    const m = /^"(.*)"$/.exec(arg) ?? /^„(.*)“$/.exec(arg);
    if (m) arg = m[1];
    return { name: t.slice(0, i).trim(), arg };
  });
}

/** Fehler einer Filterkette für ein Feld der Art `art` (undefined = unbekannt), sonst leer. */
export function pruefeFilter(schluessel: string, kette: string, art: string | undefined): string[] {
  const m: string[] = [];
  for (const f of liesFilter(kette)) {
    if (!istFilter(f.name)) { m.push(`{${schluessel}|${f.name}}: unbekannter Filter „${f.name}“. Möglich: ${Object.keys(FILTER).join(', ')}.`); continue; }
    const d = FILTER[f.name];
    if (d.arten && art && !(d.arten as readonly string[]).includes(art)) m.push(`{${schluessel}|${f.name}}: „${f.name}“ geht nur bei ${d.arten.map((a) => (a === 'datum' ? 'Datumsfeldern' : 'Betragsfeldern')).join(' oder ')}.`);
    if ('arg' in d && d.arg === 'zahl' && !/^\d{1,3}$/.test(f.arg ?? '')) m.push(`{${schluessel}|${f.name}}: Bitte eine Zahl angeben, z. B. ${f.name}:30.`);
    if ('arg' in d && d.arg === 'text' && f.arg === undefined) m.push(`{${schluessel}|${f.name}}: Bitte einen Text in Anführungszeichen angeben, z. B. ${f.name}:"…".`);
    if (!('arg' in d) && f.arg !== undefined) m.push(`{${schluessel}|${f.name}}: „${f.name}“ hat keinen Zusatz nach dem Doppelpunkt.`);
  }
  return m;
}

/** Datum „JJJJ-MM-TT“ (oder Zeitstempel) nach Muster mit TT, T, MM, M, JJJJ, JJ. */
function datumNach(iso: string, muster: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const [, j, mo, t] = m;
  return muster.replace(/JJJJ|JJ|TT|T|MM|M/g, (x) => ({ JJJJ: j, JJ: j.slice(2), TT: t, T: String(Number(t)), MM: mo, M: String(Number(mo)) } as Record<string, string>)[x]);
}

/**
 * Wendet die Filter an.
 * @param text   formatierter Wert ohne Filter (z. B. „15.01.2026“, „1.234,50 €“)
 * @param roh    Rohwert für Datums- und Betragsfilter (ISO-Datum bzw. Betrag), sonst egal
 */
export function wendeFilterAn(text: string, roh: unknown, art: string | undefined, filter: Filter[]): string {
  let s = text;
  for (const f of filter) {
    if (!istFilter(f.name)) continue;
    switch (f.name) {
      case 'jahr': s = s && typeof roh === 'string' ? datumNach(roh, 'JJJJ') || s : s; break;
      case 'monat': s = s && typeof roh === 'string' ? datumNach(roh, 'MM') || s : s; break;
      case 'datum': s = s && typeof roh === 'string' ? datumNach(roh, f.arg ?? 'TT.MM.JJJJ') || s : s; break;
      case 'ohne_waehrung': {
        const b = roh as { betrag?: unknown } | null;
        if (s && art === 'betrag' && b && typeof b.betrag === 'number') s = b.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        break;
      }
      case 'gross': s = s.toLocaleUpperCase('de-DE'); break;
      case 'klein': s = s.toLocaleLowerCase('de-DE'); break;
      case 'kurz': {
        const n = Number(f.arg);
        const zeichen = [...s];
        if (n > 0 && zeichen.length > n) s = `${zeichen.slice(0, Math.max(1, n - 1)).join('').trimEnd()}…`;
        break;
      }
      case 'sonst': if (!s.trim()) s = f.arg ?? ''; break;
    }
  }
  return s;
}

/** Markiert einen leeren Platzhalter, damit sein Trenner mit wegfallen kann. */
export const LEER = '\u0000';
const TRENNER = String.raw`(?:\s*[–—·|/,;›»]\s*|\s+[->]\s+)`;
const LEER_MIT_TRENNER = new RegExp(`(^\\s*|${TRENNER})${LEER}(${TRENNER})?`, 'g');

/**
 * Entfernt leere Platzhalter samt einem Trenner (– — · | / , ; › » oder „ - “, „ > “):
 * „Strom – ␀ – 2026“ → „Strom – 2026“, „␀ · 2026“ → „2026“, „Strom – ␀“ → „Strom“.
 */
export function ohneLeereTeile(s: string): string {
  let alt: string;
  let neu = s;
  do {
    alt = neu;
    neu = alt.replace(LEER_MIT_TRENNER, (_m, vor: string, nach: string | undefined) => (vor.trim() === '' ? '' : nach ?? ''));
  } while (neu !== alt);
  return neu.split(LEER).join('');
}
