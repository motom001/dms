/**
 * Verweisfeld „folgt aus“ (#886): Ein Verweisfeld füllt sich aus einem anderen Verweisfeld derselben Mappe – über ein
 * Verweisfeld der Mappe, auf die jenes zeigt. Beispiel Person: `organisation` folgt aus `niederlassung` → `organisation`
 * (die Niederlassung gehört zu genau einer Organisation). Zusammen mit dem Auswahlfilter (#172, #173) gibt das beide
 * Richtungen: Niederlassung gewählt → Organisation füllt sich; Organisation gewählt → nur deren Niederlassungen.
 *
 * Es ist eine **Vorbelegung, keine Sperre**: Gefüllt wird nur ein leeres Feld; ein anderer Wert lässt sich jederzeit
 * von Hand eintragen. Passen die Angaben nicht zusammen, fragt die Oberfläche nach und die Mappe zeigt einen Hinweis.
 *
 * Reine Funktionen für Server, Oberfläche und Tests; Texte über `t()`.
 */
import type { Feld } from './model';
import { einzigesZiel } from './verweisziele';
import { t } from './texte';
import { SCHLUESSEL } from './kennungen';

/** Am Verweisfeld: `feld` ist ein anderes Verweisfeld dieser Mappe, `zielFeld` ein Verweisfeld der Mappe, auf die es zeigt. */
export interface FolgtAus { feld: string; zielFeld: string }


/** Eingabe (Editor, Paket, Schnittstelle) bereinigen; ungültig = keine Angabe. */
export function bereinigeFolgtAus(e: unknown): FolgtAus | undefined {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return undefined;
  const x = e as Record<string, unknown>;
  const feld = typeof x.feld === 'string' ? x.feld.trim() : '';
  const zielFeld = typeof x.zielFeld === 'string' ? x.zielFeld.trim() : '';
  return SCHLUESSEL.test(feld) && SCHLUESSEL.test(zielFeld) ? { feld, zielFeld } : undefined;
}

/** Felder, aus denen `f` folgen kann: andere Verweisfelder dieser Mappe mit einem Wert und genau einem Zieltyp. */
export function moeglicheQuellen(felder: Feld[], f: Pick<Feld, 'key'>): Feld[] {
  return felder.filter((x) => x.key !== f.key && x.typ === 'referenz' && !x.mehrfach && !!einzigesZiel(x));
}

/**
 * Verweisfelder im Ziel der Quelle, die auf denselben Mappentyp zeigen wie `f` (mit einem Wert).
 * `zielFelder`: die Felder des Mappentyps, auf den die Quelle zeigt.
 */
export function moeglicheZielFelder(zielFelder: Feld[], f: Pick<Feld, 'zielTypen'>): Feld[] {
  const z = einzigesZiel(f);
  return zielFelder.filter((x) => x.typ === 'referenz' && !x.mehrfach && !!z && einzigesZiel(x) === z);
}

/**
 * Prüfung im Mappentyp: Quelle und Zielfeld gibt es, sie sind Verweisfelder mit einem Wert, das Zielfeld zeigt auf
 * denselben Mappentyp wie dieses Feld. `felderVon` liefert die Felder eines anderen Typs; kennt sie ihn (noch) nicht,
 * etwa beim Einspielen eines Pakets, bleibt nur die Prüfung der Quelle.
 */
export function folgtAusProbleme(felder: Feld[], f: Feld, felderVon: (typId: string) => Feld[] | undefined): string[] {
  const fa = f.folgtAus;
  if (!fa) return [];
  // Nur mit genau einem Zieltyp (#1036): Bei mehreren stünde nicht fest, welches Feld des Ziels gemeint ist.
  if (f.typ !== 'referenz' || !einzigesZiel(f)) return [t('gemeinsam.folgtaus.nur-verweis')];
  const quelle = felder.find((x) => x.key === fa.feld);
  if (!quelle) return [t('gemeinsam.folgtaus.quelle-fehlt', { feld: fa.feld })];
  if (quelle.key === f.key) return [t('gemeinsam.folgtaus.nicht-aus-sich')];
  if (quelle.typ !== 'referenz' || !einzigesZiel(quelle)) return [t('gemeinsam.folgtaus.quelle-kein-verweis', { feld: quelle.label || quelle.key })];
  if (quelle.mehrfach) return [t('gemeinsam.folgtaus.quelle-mehrfach', { feld: quelle.label || quelle.key })];
  const ziel = felderVon(einzigesZiel(quelle)!);
  if (!ziel) return [];
  const zf = ziel.find((x) => x.key === fa.zielFeld);
  if (!zf) return [t('gemeinsam.folgtaus.zielfeld-fehlt', { feld: fa.zielFeld, quelle: quelle.label || quelle.key })];
  if (zf.typ !== 'referenz' || zf.mehrfach || einzigesZiel(zf) !== einzigesZiel(f)) return [t('gemeinsam.folgtaus.zielfeld-passt-nicht', { feld: zf.label || zf.key })];
  return [];
}

/** Felder, die über „folgt aus“ einen Kreis bilden (a folgt aus b, b folgt aus a) – leer, wenn es keinen gibt. */
export function folgtAusKreis(felder: Feld[]): string[] {
  const kante = new Map(felder.filter((f) => f.folgtAus).map((f) => [f.key, f.folgtAus!.feld] as const));
  const imKreis = new Set<string>();
  for (const start of kante.keys()) {
    const weg: string[] = [];
    let k: string | undefined = start;
    while (k && kante.has(k) && !weg.includes(k)) { weg.push(k); k = kante.get(k); }
    if (k && weg.includes(k)) for (const x of weg.slice(weg.indexOf(k))) imKreis.add(x);
  }
  return felder.map((f) => f.key).filter((k) => imKreis.has(k));
}

/**
 * Felder mit „folgt aus“ in der Reihenfolge, in der sie sich füllen (erst die, deren Quelle selbst nicht folgt) –
 * so füllt sich eine Kette (a aus b, b aus c) in einem Zug. Felder in einem Kreis fehlen.
 */
export function folgeReihenfolge(felder: Feld[]): Array<{ feld: Feld; quelle: Feld; zielFeld: string }> {
  const kreis = new Set(folgtAusKreis(felder));
  const offen = felder.filter((f) => f.typ === 'referenz' && f.folgtAus && !kreis.has(f.key));
  const aus: Array<{ feld: Feld; quelle: Feld; zielFeld: string }> = [];
  while (offen.length) {
    const i = offen.findIndex((f) => !offen.some((x) => x.key === f.folgtAus!.feld));
    if (i < 0) break;
    const [f] = offen.splice(i, 1);
    const quelle = felder.find((x) => x.key === f.folgtAus!.feld);
    if (quelle && quelle.typ === 'referenz') aus.push({ feld: f, quelle, zielFeld: f.folgtAus!.zielFeld });
  }
  return aus;
}

/** Erste Id eines Verweiswerts (Einzel- oder Mehrfachfeld), sonst ''. */
export const ersteId = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');

/** Enthält der Verweiswert diese Id? */
export const enthaeltId = (v: unknown, id: string): boolean => (Array.isArray(v) ? v.map(String).includes(id) : v === id);
