/**
 * Umbau (#1041): Werte eines alten Felds in ein neues Feld umwandeln, die Werte einer Mappe im Zieltyp und die
 * Änderungen für die Historie. Was nicht passt, kommt als Zeile in die Notiz – nie ein Passwort.
 */
import { formatiere, istLeer, zieleVon, type Feld, type Feldaenderung, type Mappentyp, type Wert, type Werte } from '../../../shared/src/model';
import { datumAusText, UMBAU_FELD, zahlAusText, zeitraumAusText } from '../../../shared/src/umbau';
import { t } from '../sprache';

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Was mit einem Feld des alten Typs geschieht. */
export type Aktion = { art: 'nach'; ziel: string } | { art: 'notiz' } | { art: 'feld' };
/** Ein Feld des alten Typs mit seiner Aktion (für die Werte nur Feld und Aktion). */
export interface FeldAktion { feld: Feld; aktion: Aktion }

type Gewandelt = { wert: Wert; genau: boolean } | null;
/** Typ einer Mappe nach dem Umbau – für Verweise (nur Mappen, die das neue Feld erlaubt). */
export type TypVon = (id: string) => string | undefined;

/** Ein Feld kann umziehen (Systemfelder, zusammengesetzte Felder und Tabellen speichern nichts Eigenes). */
export const umziehbar = (f: Feld) => !f.system && f.typ !== 'zusammengesetzt' && f.typ !== 'tabelle' && f.key !== UMBAU_FELD;

/** Gleiche Feldart: Auswahl nur mit vorhandenen Optionen, Verweise nur auf erlaubte Typen, Text nur bis maxLen. */
function wandleGleich(nach: Feld, v: Wert, typVon?: TypVon): Gewandelt {
  if (nach.typ === 'auswahl' && nach.optionen) {
    const liste = (Array.isArray(v) ? v : [v]).map(String);
    if (!liste.every((x) => nach.optionen!.includes(x)) || (!nach.mehrfach && liste.length > 1)) return null;
    return { wert: nach.mehrfach ? liste : liste[0], genau: true };
  }
  if (nach.typ === 'referenz') {
    const ids = (Array.isArray(v) ? v : [v]).map(String);
    if (!nach.mehrfach && ids.length > 1) return null;
    if (typVon && !ids.every((id) => zieleVon(nach).includes(typVon(id) ?? ''))) return null;
    return { wert: nach.mehrfach ? ids : ids[0], genau: true };
  }
  if ((nach.typ === 'text' || nach.typ === 'langtext') && nach.maxLen && str(v).length > nach.maxLen) return null;
  return { wert: v, genau: true };
}

/** Zahl aus einem Wert: Zahl, Betrag oder Text. */
function zahlAus(von: Feld, v: Wert): number | null {
  if (typeof v === 'number') return v;
  if (von.typ === 'betrag' && istObjekt(v)) { const n = Number(v.betrag); return Number.isFinite(n) ? n : null; }
  return typeof v === 'string' ? zahlAusText(v) : null;
}

/** Zahl, Prozent oder Betrag aus Zahl, Betrag oder Text. */
function wandleZahl(von: Feld, nach: Feld, v: Wert): Gewandelt {
  const n = zahlAus(von, v);
  if (n === null) return null;
  return { wert: nach.typ === 'betrag' ? { betrag: n, waehrung: nach.waehrung || 'EUR' } : n, genau: true };
}

/** Text: alles außer Passwörtern und Verweisen (dort stünde nur ein Titel), höchstens maxLen. */
function wandleText(von: Feld, nach: Feld, text: string): Gewandelt {
  if (von.typ === 'passwort' || von.typ === 'referenz') return null;
  return nach.maxLen && text.length > nach.maxLen ? null : { wert: text, genau: true };
}

/** Andere Feldart: Text, Zeitraum („3 Monate“ als Vorschlag), Betrag, Zahl, Datum, Auswahl. */
function wandleAnders(von: Feld, nach: Feld, v: Wert): Gewandelt {
  const text = typeof v === 'string' ? v : formatiere(von, v);
  switch (nach.typ) {
    case 'text': case 'langtext': case 'formatiert': return wandleText(von, nach, text);
    case 'zeitraum': {
      const z = typeof v === 'string' ? zeitraumAusText(v) : null;
      return z ? { wert: { anzahl: z.anzahl, einheit: z.einheit }, genau: z.genau } : null;
    }
    case 'betrag': case 'zahl': case 'prozent': return wandleZahl(von, nach, v);
    case 'datum': {
      const d = typeof v === 'string' ? datumAusText(v) : null;
      return d ? { wert: d, genau: true } : null;
    }
    case 'auswahl': {
      const o = nach.optionen?.find((x) => x.toLowerCase() === text.trim().toLowerCase());
      return o ? { wert: nach.mehrfach ? [o] : o, genau: true } : null;
    }
    default: return null;
  }
}

/** Ein Wert aus Feld `von` im Feld `nach`; null = passt nicht (kommt in die Notiz). genau = ohne Rest. */
export function wandle(von: Feld, nach: Feld, v: Wert | undefined, typVon?: TypVon): Gewandelt {
  if (istLeer(v)) return null;
  if (von.typ === 'passwort' || nach.typ === 'passwort') return von.typ === nach.typ ? { wert: v as Wert, genau: true } : null;
  return von.typ === nach.typ ? wandleGleich(nach, v as Wert, typVon) : wandleAnders(von, nach, v as Wert);
}

/** Werte ohne Feld (früher gelöschte Felder) bleiben, wie sie sind – außer, der Zieltyp nutzt die Kennung. */
function bleibendeWerte(alt: Mappentyp, ziel: Mappentyp, werte: Werte): Werte {
  const erg: Werte = {};
  const bekannt = new Set(alt.felder.map((f) => f.key));
  for (const [k, v] of Object.entries(werte)) if (!bekannt.has(k) && !ziel.felder.some((f) => f.key === k) && k !== UMBAU_FELD) erg[k] = v;
  // Bei der Übernahme bleiben Systemfelder und berechnete Ansichten stehen.
  if (alt.id === ziel.id) for (const f of alt.felder.filter((x) => !umziehbar(x) && werte[x.key] !== undefined)) erg[f.key] = werte[f.key];
  return erg;
}

/** Werte einer Mappe im Zieltyp und die Zeilen für die Notiz. */
export function neueWerte(x: { alt: Mappentyp; ziel: Mappentyp; felder: FeldAktion[] }, werte: Werte, titelVon: (id: string) => string, typVon: TypVon): { werte: Werte; notiz: string[] } {
  const neu = bleibendeWerte(x.alt, x.ziel, werte);
  const notiz: string[] = [];
  const merke = (f: Feld, v: Wert) => { if (f.typ !== 'passwort') notiz.push(`${f.label}: ${formatiere(f, v, titelVon)}`); };
  for (const { feld, aktion } of x.felder) {
    const v = werte[feld.key];
    if (istLeer(v)) continue;
    if (aktion.art === 'feld') { neu[feld.key] = v; continue; }
    const zf = aktion.art === 'nach' ? x.ziel.felder.find((f) => f.key === aktion.ziel) : undefined;
    const w = zf ? wandle(feld, zf, v, typVon) : null;
    if (!w || !zf || !istLeer(neu[zf.key])) { merke(feld, v); continue; }
    neu[zf.key] = w.wert;
    if (!w.genau) merke(feld, v);
  }
  return { werte: neu, notiz };
}

/** Änderungen für die Historie: altes Feld mit Wert (vorher), neues Feld mit Wert oder „in der Notiz“ (nachher). */
export function aenderungen(x: { alt: Mappentyp; ziel: Mappentyp; felder: FeldAktion[] }, vorher: Werte, nachher: Werte, titelVon: (id: string) => string): Feldaenderung[] {
  const erg: Feldaenderung[] = [];
  for (const { feld, aktion } of x.felder) {
    const v = vorher[feld.key];
    if (istLeer(v)) continue;
    const key = aktion.art === 'nach' ? aktion.ziel : aktion.art === 'feld' ? feld.key : null;
    const zf = key ? x.ziel.felder.find((f) => f.key === key) : undefined;
    if (feld.typ === 'passwort') { erg.push({ feld: feld.key, label: feld.label, geheim: true }); continue; }
    const neu = zf && !istLeer(nachher[zf.key]) ? `${zf.label}: ${formatiere(zf, nachher[zf.key], titelVon)}` : t('pakete.umbau.in-notiz');
    erg.push({ feld: feld.key, label: feld.label, alt: formatiere(feld, v, titelVon), neu });
  }
  return erg;
}
