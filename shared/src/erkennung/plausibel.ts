/**
 * Plausibilität der Felder (#1693, Teil 2): Nachdem die eingebaute Erkennung alle Felder eines Typs gefüllt hat, prüft
 * sie, ob die Werte zueinander passen – und hebt oder senkt danach die Sicherheit je Feld. Ein Wert, der offensichtlich
 * nicht stimmen kann, soll nie als „sicher“ dastehen; einer, den ein zweiter Wert bestätigt, schon.
 *
 * - IBAN: nur mit richtiger Prüfziffer (sonst kein Vorschlag).
 * - Datum: weiter als zwei Jahre nach heute oder vor 1950 höchstens „unsicher“; in einem Datumspaar (#1646) liegt
 *   „Bis“ nicht vor „Von“, sonst sind beide höchstens „unsicher“.
 * - Beträge: Netto + Steuer = Gesamtbetrag (bis 2 Cent). Stimmt es, sind Netto und Steuer „sicher“. Stimmt es nicht,
 *   gewinnt ein anderer Betrag aus dem Text, der passt (wenn der Gesamtbetrag nicht sicher war); sonst sind alle drei
 *   höchstens „unsicher“ mit Hinweis.
 *
 * Welche Felder Netto und Steuer sind, ergibt sich aus den Wörtern des Felds (feldWoerter) – kein Code je Mappentyp.
 * Exakte Quellen (E-Rechnung, Gelerntes) setzt der Server erst danach; sie bleiben unberührt.
 */
import type { Betrag, Feld } from '../model';
import { t } from '../texte';
import { alleBetraege, ausschnitt, istIban, type Sicherheit } from './angaben';
import type { Erkennungsart } from './arten';
import { feldWoerter } from './beschriftet';
import { monatsletzter, nurMonat } from '../monatsdatum';

/** Was die Prüfung an einem Vorschlag liest und ändert (Teil von `Vorschlag`, ohne Import – sonst ein Kreis). */
interface PlausiVorschlag {
  wert: unknown;
  sicherheit: Sicherheit;
  fundstelle: string;
  hinweis?: string;
}

/** Was die Prüfung über den Typ und den Text wissen muss. */
export interface PlausiLage {
  text: string;
  felder: ReadonlyArray<{ feld: Feld; art: Erkennungsart }>;
  /** Das erste Betragsfeld: Es bekommt den Gesamtbetrag (Brutto). */
  erstesBetrag?: string;
  /** Datumspaare (#1646): Beginn und Ende. */
  paare: ReadonlyArray<{ beginn: Feld; ende: Feld }>;
  gruppen: readonly (readonly string[])[];
  /** Heute (für „weit in der Zukunft“); Tests geben es fest vor. */
  heute: Date;
}

/** So weit nach heute ist ein Datum noch üblich (Fälligkeit, Vertragsende); darüber höchstens „unsicher“. */
const ZUKUNFT_JAHRE = 2;
/** Davor ist ein Datum auf Post ungewöhnlich (Geburtsdaten gibt es, deshalb nur „unsicher“, nicht weg). */
const FRUEHESTENS = '1950-01-01';
/** Netto + Steuer darf so weit vom Gesamtbetrag abweichen (Rundung je Position). */
const TOLERANZ = 0.02;

/** Höchstens „unsicher“; ein vorhandener Hinweis bleibt (der erste Grund zählt). */
function senke(x: PlausiVorschlag, hinweis: string): void {
  x.sicherheit = 'niedrig';
  x.hinweis ??= hinweis;
}

/** Prüft die Vorschläge `v` in place. */
export function pruefePlausibel(v: Record<string, PlausiVorschlag>, lage: PlausiLage): void {
  pruefeIban(v, lage);
  pruefeDatumRahmen(v, lage);
  pruefeDatumPaare(v, lage);
  pruefeBetraege(v, lage);
}

/** IBAN mit falscher Prüfziffer nie vorschlagen – auch nicht aus einem Erkennungshinweis mit Muster. */
function pruefeIban(v: Record<string, PlausiVorschlag>, lage: PlausiLage): void {
  for (const { feld, art } of lage.felder) {
    const x = v[feld.key];
    if (art === 'iban' && x && typeof x.wert === 'string' && !istIban(x.wert)) delete v[feld.key];
  }
}

/** ISO-Datum `jahre` nach `d`. */
const nachJahren = (d: Date, jahre: number) =>
  `${String(d.getUTCFullYear() + jahre).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** Datum weit in der Zukunft oder sehr weit zurück: höchstens „unsicher“. */
function pruefeDatumRahmen(v: Record<string, PlausiVorschlag>, lage: PlausiLage): void {
  const spaetestens = nachJahren(lage.heute, ZUKUNFT_JAHRE);
  for (const { feld } of lage.felder) {
    const x = v[feld.key];
    if (feld.typ !== 'datum' || !x || typeof x.wert !== 'string') continue;
    // Genauigkeit Monat (#1722): Der Monat in zwei Jahren zählt ganz – „nächste HU 11/2028“ im November 2026.
    const grenze = nurMonat(feld) ? (monatsletzter(spaetestens.slice(0, 7)) ?? spaetestens) : spaetestens;
    if (x.wert > grenze) senke(x, t('gemeinsam.erkennung.plausibel-zukunft'));
    else if (x.wert < FRUEHESTENS) senke(x, t('gemeinsam.erkennung.plausibel-frueh'));
  }
}

/** „Bis“ vor „Von“ (#1646): beide höchstens „unsicher“. */
function pruefeDatumPaare(v: Record<string, PlausiVorschlag>, lage: PlausiLage): void {
  for (const { beginn, ende } of lage.paare) {
    const a = v[beginn.key];
    const b = v[ende.key];
    if (!a || !b || typeof a.wert !== 'string' || typeof b.wert !== 'string' || b.wert >= a.wert) continue;
    const h = t('gemeinsam.erkennung.plausibel-zeitraum', { von: beginn.label, bis: ende.label });
    senke(a, h);
    senke(b, h);
  }
}

/** Betrag eines Vorschlags (Feldart Betrag oder Zahl); null = keiner. */
function betragVon(x: PlausiVorschlag | undefined): { betrag: number; waehrung?: string } | null {
  if (!x) return null;
  if (typeof x.wert === 'number' && Number.isFinite(x.wert)) return { betrag: x.wert };
  const b = x.wert as Betrag | null;
  return b && typeof b === 'object' && typeof b.betrag === 'number' ? b : null;
}

/** Rolle eines Betragsfelds nach seinen Wörtern: Netto, Steuer oder keine. */
function rolle(f: Feld, gruppen: PlausiLage['gruppen']): 'netto' | 'steuer' | null {
  const w = feldWoerter(f, gruppen);
  if (w.some((x) => x.includes('netto'))) return 'netto';
  if (w.some((x) => x.includes('steuer') || x === 'mwst' || x === 'ust')) return 'steuer';
  return null;
}

/** Netto-, Steuer- und Gesamtbetragsfeld – nur, wenn jede Rolle genau ein Feld hat. */
function betragsRollen(lage: PlausiLage): { netto: Feld; steuer: Feld; brutto: Feld } | null {
  const felder = lage.felder.filter((x) => x.art === 'betrag').map((x) => x.feld);
  const brutto = felder.find((f) => f.key === lage.erstesBetrag);
  const mit = felder.map((f) => ({ f, r: rolle(f, lage.gruppen) }));
  const netto = mit.filter((x) => x.r === 'netto');
  const steuer = mit.filter((x) => x.r === 'steuer');
  if (!brutto || netto.length !== 1 || steuer.length !== 1 || mit.find((x) => x.f === brutto)?.r) return null;
  return { netto: netto[0].f, steuer: steuer[0].f, brutto };
}

/** Netto + Steuer = Gesamtbetrag (#1693): stimmig → Netto und Steuer sicher; sonst der stimmige Kandidat oder alle unsicher. */
function pruefeBetraege(v: Record<string, PlausiVorschlag>, lage: PlausiLage): void {
  const r = betragsRollen(lage);
  if (!r) return;
  const [n, s, b] = [r.netto, r.steuer, r.brutto].map((f) => betragVon(v[f.key]));
  if (!n || !s || !b) return;
  const w = new Set([n.waehrung, s.waehrung, b.waehrung].filter(Boolean));
  if (w.size > 1) return;
  const summe = n.betrag + s.betrag;
  const stimmig = () => {
    v[r.netto.key].sicherheit = 'hoch';
    v[r.steuer.key].sicherheit = 'hoch';
  };
  if (Math.abs(summe - b.betrag) <= TOLERANZ) return stimmig();
  // Widerspruch: Steht die Summe als eigener Betrag im Text, gewinnt sie – aber nie gegen einen sicheren Gesamtbetrag.
  const alt =
    v[r.brutto.key].sicherheit === 'hoch'
      ? undefined
      : alleBetraege(lage.text).find((x) => Math.abs(x.wert.betrag - summe) <= TOLERANZ && (!b.waehrung || x.wert.waehrung === b.waehrung));
  if (alt) {
    const x = v[r.brutto.key];
    x.wert = typeof x.wert === 'number' ? alt.wert.betrag : alt.wert;
    x.sicherheit = 'mittel';
    x.fundstelle = ausschnitt(lage.text, alt.i, alt.laenge);
    return stimmig();
  }
  const h = t('gemeinsam.erkennung.plausibel-betraege');
  for (const f of [r.netto, r.steuer, r.brutto]) senke(v[f.key], h);
}
