import { istLeer, type Mappentyp, type Wert } from '../../../../shared/src/model';
import type { Sicherheit } from '../../../../shared/src/erkennung';
import { ersteId } from '../../../../shared/src/folgtaus';
import type { TypVorschlaege } from '../../api/werkbank';
import { ausRoh, standardRoh, zuRoh, type Roh, type RohWerte } from '../../werte';

/** Vorbelegung einer neuen Mappe (#172, #935): Auswahlfilter, erkannte Angaben – nur, was zur Feldart passt. */
export function belegeVor(typ: Mappentyp, start: RohWerte, werte: Record<string, unknown>) {
  for (const [k, v] of Object.entries(werte)) {
    const f = typ.felder.find((x) => x.key === k);
    if (!f || f.typ === 'passwort' || f.typ === 'betrag' || f.ausgeblendet) continue;
    if (f.typ === 'janein' && typeof v === 'boolean') start[k] = v;
    // Zeitraum und Prozent (#1035): „P3M“, { anzahl, einheit } bzw. eine Zahl.
    else if (f.typ === 'zeitraum' || (f.typ === 'prozent' && typeof v === 'number')) start[k] = zuRoh(f, v as Wert);
    else if (Array.isArray(v) && f.mehrfach) start[k] = v.map(String);
    else if (typeof v === 'string' && !f.mehrfach) start[k] = v;
  }
}

/** Beim Auswählen übernehmen (#1037): ein vorgeschlagener Wert aus der Mappe `mappe` im Verweisfeld `feld`. */
export interface Vorbelegt {
  feld: string;
  mappe: string;
  wert: Roh;
  vorher: Roh;
  text: string;
}

/** Leerer Rohwert des Felds `k` (für „Zurücknehmen“). */
export const leerRoh = (typ: Mappentyp, k: string): Roh => {
  const f = typ.felder.find((x) => x.key === k);
  return f ? zuRoh(f, null) : '';
};
/** Gleicher Rohwert (leer = null)? */
export const gleichRoh = (a: Roh | undefined, b: Roh | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Beim Auswählen übernehmen (#1037): von den Werten `werte` nur die für Felder, die in `roh` leer sind und `frei` – als
 * Rohwert fürs Formular (`umwandeln`) oder so, wie sie sind.
 */
export function leereVorschlaege(
  typ: Mappentyp,
  werte: Record<string, Wert | Roh>,
  roh: RohWerte,
  frei: (k: string) => boolean,
  umwandeln = true,
): RohWerte {
  const aus: RohWerte = {};
  for (const [k, w] of Object.entries(werte)) {
    const f = typ.felder.find((x) => x.key === k);
    if (f && frei(k) && istLeer(ausRoh(f, roh[k]))) aus[k] = umwandeln ? zuRoh(f, w as Wert) : (w as Roh);
  }
  return aus;
}

/**
 * Beim Auswählen übernehmen (#1037) aus „Aus Dokument ausfüllen“: Vorschläge mit `aus` (Werte einer vorgeschlagenen
 * Mappe) nur in leere Felder und nur, wenn das Verweisfeld danach auf diese Mappe zeigt – nicht bei einer Alternative.
 */
export function vorbelegtAusVorschlaegen(
  typ: Mappentyp,
  r: TypVorschlaege,
  roh: RohWerte,
  werte: RohWerte,
  frei: (k: string) => boolean,
): { werte: RohWerte; marken: Record<string, Vorbelegt> } {
  const neu: RohWerte = {};
  const marken: Record<string, Vorbelegt> = {};
  for (const [k, v] of Object.entries(r.vorschlaege)) {
    const f = typ.felder.find((x) => x.key === k);
    const q = v.aus ? typ.felder.find((x) => x.key === v.aus!.feld) : undefined;
    if (!f || !q || !v.aus || !frei(k) || !istLeer(ausRoh(f, roh[k]))) continue;
    if (ersteId(ausRoh(q, q.key in werte ? werte[q.key] : roh[q.key])) !== v.aus.mappe) continue;
    neu[k] = zuRoh(f, v.wert);
    marken[k] = { feld: q.key, mappe: v.aus.mappe, wert: neu[k], vorher: roh[k] ?? zuRoh(f, null), text: v.fundstelle };
  }
  return { werte: neu, marken };
}

/** Ein Vorschlag aus „Aus Dokument ausfüllen“ (#391) am Feld. */
export interface FeldVorschlag {
  wert: Wert;
  sicherheit: Sicherheit;
  fundstelle: string;
  art: 'eingetragen' | 'alternative';
  vorher?: Roh;
  hinweis?: string;
}

/** Startwerte einer neuen Mappe aus „+ Neu“ unter einer Tabelle (#1030): Vorgaben des Typs, das Verweisfeld zeigt hierher. */
export function startMitVerweis(typ: Mappentyp, v: { feldKey: string; mappeId: string }): RohWerte {
  const r = standardRoh(typ);
  const f = typ.felder.find((x) => x.key === v.feldKey && x.typ === 'referenz');
  if (f) r[f.key] = f.mehrfach ? [v.mappeId] : v.mappeId;
  return r;
}

/**
 * Neue Mappe als Ziel von „Zuordnen“ (#192): danach wird die Post ihr zugeordnet. `aufloesen` (#936): aus der Post wird
 * diese Mappe (Dokumente und Historie wandern mit, die Post kommt in den Papierkorb) – true, wenn die Person die Post
 * löschen darf; false bleibt beim Zuordnen; undefined, solange es noch nicht feststeht.
 */
export interface ZuordnenNachher {
  post: string;
  register?: string;
  dokumente: string[];
  kopieren: boolean;
  vorschlag: Record<string, Wert>;
  aufloesen?: boolean;
  /** Original-E-Mail (#999): false = bleibt in der Post. */ originalEmail?: false;
  /** Was „Wohin gehört das?“ vorgeschlagen hat (#1681) – fehlt, wenn es nichts geliefert hat. */
  vorgeschlagen?: { typId: string | null; sicherheit: number };
}
