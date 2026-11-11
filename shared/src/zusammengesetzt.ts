/**
 * Feldart „Zusammengesetzt“ (#1050): ein Feld, dessen Wert sich aus anderen Feldern derselben Mappe zusammensetzt – mit
 * einer Vorlage aus Platzhaltern und Filtern wie die Titel-Vorlage (#170), z. B. `{bereich} · {zeitraum}` oder
 * `{von} · {rechnungsnummer}`. Niemand pflegt den Wert von Hand: Ablago berechnet ihn beim Speichern, die Oberfläche
 * zeigt ihn nur an (wie ein berechnetes Feld, #1034).
 *
 * - **Gespeichert wird der Schlüssel** ({@link zusammengesetztSchluessel}): unabhängig von Sprache und Region (Datum als
 *   JJJJ-MM-TT, Zahlen mit Punkt, Auswahl mit ihrem festen Wert) und bei Verweisen mit der **Kennung des Ziels**, nie mit
 *   dessen Titel (Ergänzung Sicherheit). Zwei Organisationen gleichen Namens kollidieren so nicht, und der Wert verrät
 *   niemandem den Titel einer Mappe, die er nicht lesen darf. „Eindeutig“ vergleicht diesen Schlüssel.
 * - **Angezeigt wird der Text** ({@link zusammengesetztText} in model.ts): für jede Person neu aus den Werten, mit den
 *   Titeln der verwiesenen Mappen, die sie sehen darf – sonst „(nicht sichtbar)“, wie bei jedem Verweis.
 * - **Platzhalter:** Text, Zahl, Betrag, Prozent, Datum, Zeitraum, Ja/Nein, Auswahl und Verweis ({@link TEIL_ARTEN}).
 *   Nicht: Passwörter (wie in der Titel-Vorlage), Langtext und formatierter Text (kein Schlüssel), Tabellen (kein Wert),
 *   andere zusammengesetzte Felder (keine Ketten) und Felder mit Nummernkreis (die Nummer vergibt Ablago erst beim
 *   Anlegen – und sie ist ohnehin eindeutig).
 *
 * Eigene Datei ohne Abhängigkeit zur Laufzeit auf model.ts, damit Modell, Server und Oberfläche sie ohne Kreis nutzen.
 */
import type { Betrag, Feld, Feldtyp, Mappentyp, Wert, Werte } from './model';
import { istZeitraum, zeitraumIso } from './feldarten';
import { kreisVon } from './nummernkreis';
import { LEER, liesFilter, ohneLeereTeile, PLATZHALTER_MIT_FILTERN, pruefeFilter, wendeFilterAn } from './titelfilter';
import { t } from './texte';

/** Ab dieser Version kennt Ablago die Feldart Zusammengesetzt (#1050). Beim Einreihen auf die Version setzen, mit der sie erscheint. */
export const DMS_ZUSAMMENGESETZT_AB = '0.239.0';
/** Höchstlänge der Vorlage (wie im Paketformat). */
export const VORLAGE_MAX = 300;
/** Höchstlänge des gespeicherten Schlüssels; was länger ist, schneidet Ablago ab (Kennungen haben 36 Zeichen). */
export const SCHLUESSEL_MAX = 1000;
/** Feldarten, die als Platzhalter taugen. */
export const TEIL_ARTEN: readonly Feldtyp[] = ['text', 'zahl', 'betrag', 'prozent', 'datum', 'zeitraum', 'janein', 'auswahl', 'referenz'];

/** Ist das ein zusammengesetztes Feld? */
export const istZusammengesetzt = (f: Pick<Feld, 'typ'> | undefined): boolean => f?.typ === 'zusammengesetzt';
/** Zusammengesetzte Felder eines Typs. */
export const zusammengesetzteFelder = (typ: Pick<Mappentyp, 'felder'>): Feld[] => typ.felder.filter((f) => f.typ === 'zusammengesetzt');
/** Kann dieses Feld Teil einer Vorlage sein? */
export const taugtAlsTeil = (f: Feld): boolean => TEIL_ARTEN.includes(f.typ) && !kreisVon(f);

/** Kennungen der Felder in der Vorlage, jede einmal, in ihrer Reihenfolge. */
export function teilKennungen(vorlage: string | undefined): string[] {
  return [...new Set([...(vorlage ?? '').matchAll(PLATZHALTER_MIT_FILTERN)].map((m) => m[1]))];
}

/** Die Felder, aus denen sich `f` zusammensetzt („setzt sich zusammen aus …“) – nur die, die es gibt. */
export function teileVon(felder: readonly Feld[], f: Pick<Feld, 'vorlage'>): Feld[] {
  return teilKennungen(f.vorlage).map((k) => felder.find((x) => x.key === k)).filter((x): x is Feld => !!x);
}

/** Das Feld, an dem die Meldung „Diese Kombination gibt es schon“ steht: das erste beteiligte, das man sieht (Hinweis Qualität). */
export function meldefeld(felder: readonly Feld[], f: Feld, verborgen?: Set<string>): string {
  return teileVon(felder, f).find((x) => !x.ausgeblendet && !verborgen?.has(x.key))?.key ?? f.key;
}

/** Fehler in der Definition eines zusammengesetzten Felds (für den Mappentyp-Editor, die API und Pakete). */
export function zusammengesetztProbleme(felder: readonly Feld[], f: Feld): string[] {
  const m: string[] = [];
  const vorlage = (f.vorlage ?? '').trim();
  if (!vorlage) return [t('gemeinsam.zusammengesetzt.vorlage-fehlt')];
  if ([...vorlage].length > VORLAGE_MAX) m.push(t('gemeinsam.zusammengesetzt.vorlage-lang', { max: VORLAGE_MAX }));
  const treffer = [...vorlage.matchAll(PLATZHALTER_MIT_FILTERN)];
  if (!treffer.length) return [...m, t('gemeinsam.zusammengesetzt.ohne-platzhalter')];
  const unbekannt: string[] = [];
  const ungeeignet: string[] = [];
  for (const x of treffer) {
    const q = felder.find((g) => g.key === x[1]);
    if (!q) { unbekannt.push(`{${x[1]}}`); continue; }
    if (!taugtAlsTeil(q)) { ungeeignet.push(`„${q.label || q.key}“`); continue; }
    m.push(...pruefeFilter(x[1], x[2] ?? '', q.typ));
  }
  if (unbekannt.length) m.push(t('gemeinsam.zusammengesetzt.unbekannt', { map: [...new Set(unbekannt)].join(', ') }));
  if (ungeeignet.length) m.push(t('gemeinsam.zusammengesetzt.ungeeignet', { map: [...new Set(ungeeignet)].join(', ') }));
  return m;
}

const zahlTeil = (v: Wert) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const listenTeil = (v: Wert) => (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== '').map(String).join(', ');
/** Je Feldart ein Teil des Schlüssels: ohne Sprache und Region, Verweise als Kennung. */
const SCHLUESSELTEIL: Partial<Record<Feldtyp, (v: Wert) => string>> = {
  text: (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''),
  zahl: zahlTeil,
  prozent: zahlTeil,
  betrag: (v) => { const b = v as Betrag; return typeof b?.betrag === 'number' ? `${b.betrag.toFixed(2)} ${b.waehrung || 'EUR'}` : ''; },
  datum: (v) => (typeof v === 'string' ? v : ''),
  zeitraum: (v) => (istZeitraum(v) ? zeitraumIso(v) : ''),
  janein: (v) => (v === true ? 'ja' : v === false ? 'nein' : ''),
  auswahl: listenTeil,
  referenz: listenTeil,
};
const schluesselteil = (f: Feld, v: Wert | undefined): string => (v == null || v === '' ? '' : SCHLUESSELTEIL[f.typ]?.(v) ?? '');

/**
 * Der Schlüssel, den Ablago speichert und für „eindeutig“ vergleicht: die Vorlage mit den Werten ohne Sprache und Region,
 * Verweise mit der Kennung der Mappe (nie ihr Titel). Filter wirken wie in der Titel-Vorlage; „ohne Währung“ gibt die Zahl
 * mit Punkt, an Verweisen wirkt nur „sonst“. null, wenn keiner der Platzhalter einen Wert hat.
 */
export function zusammengesetztSchluessel(felder: readonly Feld[], f: Pick<Feld, 'vorlage'>, werte: Werte): string | null {
  let gefuellt = false;
  const ersetzt = (f.vorlage ?? '').replace(PLATZHALTER_MIT_FILTERN, (_, k: string, kette: string) => {
    const q = felder.find((x) => x.key === k);
    if (!q || !taugtAlsTeil(q)) return LEER;
    const v = werte[k];
    let s = schluesselteil(q, v);
    if (s) gefuellt = true;
    for (const x of liesFilter(kette)) {
      if (q.typ === 'referenz' && x.name !== 'sonst') continue;
      if (x.name === 'ohne_waehrung') { if (s && q.typ === 'betrag') s = (v as Betrag).betrag.toFixed(2); continue; }
      s = wendeFilterAn(s, v, q.typ, [x]);
    }
    return s.trim() ? s : LEER;
  });
  if (!gefuellt) return null;
  const s = ohneLeereTeile(ersetzt).replace(/\s+/g, ' ').trim();
  return s ? [...s].slice(0, SCHLUESSEL_MAX).join('') : null;
}

/**
 * Setzt die Werte aller zusammengesetzten Felder neu (beim Speichern, nach einer Änderung der Vorlage). Was eine Anfrage
 * dafür schickt, zählt nicht – das Feld ist schreibgeschützt. Ändert `werte` und gibt die Kennungen der Felder zurück,
 * deren Wert sich geändert hat.
 */
export function setzeZusammengesetzte(typ: Pick<Mappentyp, 'felder'>, werte: Werte): string[] {
  const geaendert: string[] = [];
  for (const f of zusammengesetzteFelder(typ)) {
    const neu = zusammengesetztSchluessel(typ.felder, f, werte);
    if ((werte[f.key] ?? null) !== neu) geaendert.push(f.key);
    werte[f.key] = neu;
  }
  return geaendert;
}
