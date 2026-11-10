/**
 * Darstellung eines Mappentyps in der Mappe: Abschnitte im Feldregister (#890) und ausgeblendete Felder und
 * Register (#655). Reine Funktionen für Server, Oberfläche und Tests.
 *
 * - Abschnitte: Die Feldliste eines Registers bleibt, wie sie ist; `abschnitte` sagt nur, vor welchem Feld eine neue
 *   Zeile beginnt (mit oder ohne Überschrift, auf Wunsch eingeklappt). Bearbeiten, Export, PDF der Angaben und API
 *   zeigen immer alles.
 * - Ausblenden: Ein ausgeblendetes Feld (oder ein Feld auf einem ausgeblendeten Register) fehlt in Formular und
 *   Mappenansicht und steht nicht zur Auswahl für neue Spalten und Bedingungen. Seine Werte bleiben gespeichert.
 */
import { ABSCHNITT_TITEL_MAX, trefferlistenVon, vorlageFelder, type Abschnitt, type Feld, type Mappentyp, type MappentypDaten, type Register } from './model';
import { regelwerkVon } from './rechte';
import { ausgangAus, bereinigeBeschriftungen, feldLabel, listenName, sichtName, type AbschnittTeile } from './beschriftung';
import type { Sicht } from './sichten';
import { t } from './texte';
import { bereinigeAnzeige } from './anzeige';

/* ---------- Ausblenden (#655) ---------- */

/**
 * Lässt sich das Register ausblenden? Nicht bei Dokumentenregistern (dorthin gehen Uploads, Post und Zuordnen – die
 * Dokumente wären sonst nicht mehr zu sehen) und nicht bei Registern mit Systemfeldern (die gehören immer dazu).
 */
export function registerAusblendbar(r: Pick<Register, 'art' | 'felder'>, felder: Array<Pick<Feld, 'key' | 'system'>>): boolean {
  if (r.art === 'dokumente') return false;
  return !(r.felder ?? []).some((k) => felder.some((f) => f.key === k && f.system));
}

/** Kennungen der ausgeblendeten Felder: selbst ausgeblendet oder auf einem ausgeblendeten Feldregister. */
export function ausgeblendeteFelder(typ: Pick<MappentypDaten, 'felder'> & { register?: Register[] }): Set<string> {
  const aus = new Set(typ.felder.filter((f) => f.ausgeblendet).map((f) => f.key));
  for (const r of typ.register ?? []) if (r.ausgeblendet && r.art === 'felder') for (const k of r.felder ?? []) aus.add(k);
  return aus;
}

/** Felder, die Formular und Auswahllisten zeigen – in ihrer Reihenfolge. */
export function sichtbareFelder<F extends Pick<Feld, 'key'>>(typ: Pick<MappentypDaten, 'felder'> & { register?: Register[] }, felder: F[] = typ.felder as unknown as F[]): F[] {
  const aus = ausgeblendeteFelder(typ);
  return felder.filter((f) => !aus.has(f.key));
}

/** Register, die die Mappe zeigt. */
export const sichtbareRegister = <R extends { ausgeblendet?: boolean }>(register: R[]): R[] => register.filter((r) => !r.ausgeblendet);

/**
 * Nach dem Bereinigen (Server): Ausblenden nur, wo es geht; ausgeblendete Felder sind nie Pflicht (sonst ließe sich
 * keine Mappe speichern). Gibt die Kennungen der Felder zurück, denen dabei „Pflicht“ genommen wurde.
 */
export function festigeDarstellung(d: Pick<MappentypDaten, 'felder' | 'register'>): string[] {
  for (const f of d.felder) if (f.ausgeblendet && f.system) delete f.ausgeblendet;
  // Anzeige-Bedingungen (#1033) nie an Systemfeldern – die gehören immer dazu.
  for (const f of d.felder) if (f.anzeigen && f.system) delete f.anzeigen;
  for (const r of d.register) if (r.ausgeblendet && !registerAusblendbar(r, d.felder)) delete r.ausgeblendet;
  const aus = ausgeblendeteFelder(d);
  const aufgehoben: string[] = [];
  for (const f of d.felder) if (aus.has(f.key) && f.pflicht) { f.pflicht = false; aufgehoben.push(f.key); }
  return aufgehoben;
}

/* ---------- Abschnitte (#890) ---------- */

/** Abschnitte aus einer Eingabe (API, Paket, Oberfläche): nur vor Feldern des Registers, je Feld einer, Überschrift kurz. */
export function bereinigeAbschnitte(roh: unknown, feldKeys: string[]): Abschnitt[] | undefined {
  if (!Array.isArray(roh)) return undefined;
  const aus: Abschnitt[] = [];
  for (const x of roh) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const vor = typeof o.vor === 'string' ? o.vor.trim() : '';
    if (!feldKeys.includes(vor) || aus.some((a) => a.vor === vor)) continue;
    const titel = ausgangAus(o.beschriftungen, 'titel', typeof o.titel === 'string' ? o.titel : '').replace(/\s+/g, ' ').trim().slice(0, ABSCHNITT_TITEL_MAX);
    const a: Abschnitt = { vor };
    // Anzeigen, wenn … (#1033): auch an Abschnitten ohne Überschrift.
    const anzeigen = bereinigeAnzeige(o.anzeigen);
    if (anzeigen) a.anzeigen = anzeigen;
    if (titel) {
      a.titel = titel;
      if (o.eingeklappt === true) a.eingeklappt = true;
      const b = bereinigeBeschriftungen<AbschnittTeile>(o.beschriftungen, ['titel']);
      if (b) {
        for (const e of Object.values(b)) if (e?.titel) e.titel = e.titel.slice(0, ABSCHNITT_TITEL_MAX);
        a.beschriftungen = b;
      }
    }
    aus.push(a);
  }
  // In der Reihenfolge der Felder, damit gleiche Abschnitte gleich gespeichert werden (Paketvergleich, #653).
  aus.sort((a, b) => feldKeys.indexOf(a.vor) - feldKeys.indexOf(b.vor));
  return aus;
}

/** Feste Kennung eines Abschnitts für das Merken je Person: Register und erstes Feld. */
export const abschnittId = (registerKey: string, a: Pick<Abschnitt, 'vor'>) => `${registerKey}.${a.vor}`;
/** Schlüssel der persönlichen Einstellung je Mappentyp: { abschnittId: offen }. */
export const abschnittEinstellung = (typId: string) => `abschnitte:${typId}`;

export interface Feldgruppe<F> {
  /** Der Abschnitt, mit dem die Gruppe beginnt; null = Anfang des Registers. */
  abschnitt: Abschnitt | null;
  felder: F[];
}

/**
 * Die Felder eines Registers in Gruppen: Jeder Abschnitt beginnt eine neue. `alle` sind alle Felder des Registers in
 * ihrer Reihenfolge, `zeigen` sagt, welche davon zu sehen sind. Liegt ein Abschnitt vor einem Feld, das nicht zu sehen
 * ist, beginnt er beim nächsten sichtbaren; treffen zwei aufeinander, gewinnt der mit Überschrift (bzw. der spätere).
 * Abschnitte ohne sichtbares Feld danach fallen weg.
 */
export function gruppiere<F extends { key: string }>(abschnitte: Abschnitt[] | undefined, alle: F[], zeigen: (f: F) => boolean = () => true): Array<Feldgruppe<F>> {
  const vor = new Map((abschnitte ?? []).map((a) => [a.vor, a] as const));
  const gruppen: Array<Feldgruppe<F>> = [{ abschnitt: null, felder: [] }];
  let offen: Abschnitt | undefined;
  for (const f of alle) {
    const a = vor.get(f.key);
    if (a && (!offen || a.titel || !offen.titel)) offen = a;
    if (!zeigen(f)) continue;
    if (offen) { gruppen.push({ abschnitt: offen, felder: [] }); offen = undefined; }
    gruppen[gruppen.length - 1].felder.push(f);
  }
  return gruppen.filter((g) => g.felder.length > 0);
}

/* ---------- Wo ein Feld noch genutzt wird (#655) ---------- */

/**
 * Wo das Feld noch genutzt wird – für den Hinweis vor dem Ausblenden: Titel, Trefferlisten und Ansichten, Aus Dokument
 * füllen und Zum Wiederfinden, Fristen und Archivmodus, Berechtigungen. Je Fundstelle ein kurzer Text.
 */
export function feldVerwendung(typ: Pick<Mappentyp, 'id' | 'felder' | 'titelVorlage' | 'trefferlisten' | 'trefferliste' | 'archiv' | 'berechtigungen'>, key: string, sichten: Array<Pick<Sicht, 'name' | 'beschriftungen' | 'typen' | 'bedingungen'>> = []): string[] {
  const f = typ.felder.find((x) => x.key === key);
  if (!f) return [];
  const aus: string[] = [];
  if (vorlageFelder(typ.titelVorlage ?? '').includes(key)) aus.push(t('gemeinsam.darstellung.verwendung.titel'));
  for (const l of trefferlistenVon(typ)) if (l.spalten.includes(key)) aus.push(t('gemeinsam.darstellung.verwendung.trefferliste', { name: listenName(l) }));
  for (const s of sichten) {
    if (!s.typen.includes(typ.id)) continue;
    if (s.bedingungen.some((b) => (b.art === 'feld' || b.art === 'frist') && b.feld === key)) aus.push(t('gemeinsam.darstellung.verwendung.ansicht', { name: sichtName(s) }));
  }
  if (f.erkennung) aus.push(t('gemeinsam.darstellung.verwendung.erkennung'));
  if (f.wiederfinden) aus.push(t('gemeinsam.darstellung.verwendung.wiederfinden'));
  if (f.frist) aus.push(t('gemeinsam.darstellung.verwendung.frist'));
  for (const g of typ.felder) if (g.key !== key && g.frist?.empfaengerFeld === key) aus.push(t('gemeinsam.darstellung.verwendung.frist-empfaenger', { feld: feldLabel(g) }));
  if (typ.archiv?.stichtag === key) aus.push(t('gemeinsam.darstellung.verwendung.archiv'));
  for (const r of regelwerkVon(typ).regeln) {
    if (r.wenn.some((w) => w.art === 'feld' && w.bedingung.feld === key)) aus.push(t('gemeinsam.darstellung.verwendung.berechtigung', { name: r.name }));
  }
  return aus;
}
