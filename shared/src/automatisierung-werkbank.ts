/**
 * Werkbank-Karten der Automatisierungen (#677): Wenn „Fehler gemeldet“, „Protokollmeldung“, „Neue Version verfügbar“
 * (ohne Mappe) und Dann „Sicherung anstoßen“ – dazu die festen Werkbank-Rechte des Systemkontos „Automatisierung“.
 * Modell, Prüfung, Platzhalter und Kurzform; ausgeführt wird im Server (`server/src/automatisierung-werkbank.ts`).
 */
import type { AutomatisierungDaten, Lauf } from './automatisierung';
import { aufrufLaufFuer } from './automatisierung-aufruf';
import { istBetriebWenn, type BetriebWenn } from './ereignisse';
import { MODULE } from './protokollmodule';
import { t } from './texte';

/**
 * Werkbank-Rechte des Systemkontos „Automatisierung“ (#677, Entscheidung Thomas 03.11.2026): nur diese, alle übrigen
 * Bereiche keine. Der Server reicht den Karten genau diese Handlungen durch (`server/src/automatisierung-werkbank.ts`) –
 * ein Test prüft, dass es nicht mehr werden. Was das Konto nicht darf, steht im Handbuch (Tabelle der Werkbank-Rechte).
 * Der Wert ist der Werkbank-Bereich: Wer eine Karte damit einrichtet, muss ihn selbst verwalten dürfen.
 */
export const SYSTEMKONTO_WERKBANK = {
  /** Sicherung: eine neue Sicherung anstoßen – Ergebnis nur „angestoßen“ / „läuft schon“. */
  sicherungAnstossen: 'sicherung',
  /** Technik/Version: prüfen, ob es eine neue stabile Version gibt. */
  neueVersion: 'systemzustand',
  /** Gemeldete Fehler: eine Meldung sehen. */
  fehlermeldung: 'fehlermeldungen',
  /** Protokoll: Meldungen ab einer Stufe finden. */
  protokoll: 'protokoll',
} as const;
export type SystemkontoHandlung = keyof typeof SYSTEMKONTO_WERKBANK;

/** Stufen der Wenn-Karte „Protokollmeldung“ (#677): ab Warnung oder ab Fehler – Hinweise kämen zu oft. */
export const PROTOKOLL_STUFEN = ['warn', 'error'] as const;
export type ProtokollStufe = (typeof PROTOKOLL_STUFEN)[number];
/** Textfilter der Wenn-Karte „Protokollmeldung“: so viele Zeichen. Der Meldungstext im Ereignis: so viele. */
export const PROTOKOLL_FILTER_MAX = 100;
export const PROTOKOLL_TEXT_MAX = 500;
/**
 * Bremse der Wenn-Karte „Protokollmeldung“ (#677): höchstens ein Lauf je Automatisierung in so vielen Minuten – weitere
 * Meldungen in der Zeit lösen sie nicht aus (sonst ginge bei einer Störung eine Flut los).
 */
export const PROTOKOLL_ABSTAND_MIN = 15;

/** Wenn-Karten aus dem Betrieb (#677): ohne Mappe; „Protokollmeldung“ mit Stufe, Modul und Text als Filter. */
export type WennBetrieb =
  | { art: 'fehler.gemeldet' | 'version.neu' }
  | { art: 'protokoll.meldung'; stufe: ProtokollStufe; modul?: string | null; enthaelt?: string | null };

/** Ist das eine Wenn-Karte ohne Mappe aus dem Betrieb? */
export const istBetrieb = (w: { art: string }): w is WennBetrieb => istBetriebWenn(w.art);

/** Passt eine Protokollmeldung zur Wenn-Karte „Protokollmeldung“ (#677)? Stufe ab, Modul gleich, Text enthalten (ohne Groß/klein). */
export function protokollPasst(w: Extract<WennBetrieb, { art: 'protokoll.meldung' }>, m: { stufe?: unknown; modul?: unknown; text?: unknown }): boolean {
  if (w.stufe === 'error' && m.stufe !== 'error') return false;
  if (m.stufe !== 'warn' && m.stufe !== 'error') return false;
  if (w.modul && m.modul !== w.modul) return false;
  return !w.enthaelt || (typeof m.text === 'string' && m.text.toLowerCase().includes(w.enthaelt.toLowerCase()));
}

/** Eingabe einer Wenn-Karte aus dem Betrieb bereinigen; null, wenn es keine ist. Stufe ohne Angabe: ab Fehler. */
export function bereinigeBetrieb(x: Record<string, unknown>): WennBetrieb | null {
  if (x.art === 'fehler.gemeldet' || x.art === 'version.neu') return { art: x.art };
  if (x.art !== 'protokoll.meldung') return null;
  const modul = typeof x.modul === 'string' ? x.modul.trim() : '';
  const enthaelt = typeof x.enthaelt === 'string' ? x.enthaelt.trim().slice(0, PROTOKOLL_FILTER_MAX) : '';
  return { art: 'protokoll.meldung', stufe: x.stufe === 'warn' ? 'warn' : 'error', modul: (MODULE as readonly string[]).includes(modul) ? modul : null, enthaelt: enthaelt || null };
}

/** Welche Werkbank-Bereiche eine Automatisierung berührt (#677): Wer sie einrichtet, muss sie selbst verwalten dürfen. */
export function werkbankBereiche(d: Pick<AutomatisierungDaten, 'wenn' | 'dann' | 'sonst'>): string[] {
  const b = new Set<string>();
  const w = wennBereich(d.wenn);
  if (w) b.add(w);
  if ([...d.dann, ...d.sonst].some((k) => k.art === 'sicherung')) b.add(SYSTEMKONTO_WERKBANK.sicherungAnstossen);
  return [...b];
}

/** Der Werkbank-Bereich einer Wenn-Karte (#677) – null, wenn sie keine Werkbank-Karte ist. */
export function wennBereich(w: Pick<AutomatisierungDaten['wenn'], 'art'>): string | null {
  const wenn: Partial<Record<string, string>> = { 'fehler.gemeldet': SYSTEMKONTO_WERKBANK.fehlermeldung, 'protokoll.meldung': SYSTEMKONTO_WERKBANK.protokoll, 'version.neu': SYSTEMKONTO_WERKBANK.neueVersion };
  return wenn[w.art] ?? null;
}

/**
 * Was an einer Automatisierung mit Wenn-Karte ohne Mappe nicht geht (#677, auch „Aufruf von außen“, #679): Bedingungen nur auf Merkmale der Ablage,
 * Empfänger von Aufgaben nur Personen und Rollen.
 */
export function betriebProbleme(a: Pick<AutomatisierungDaten, 'und' | 'dann' | 'sonst'>): string[] {
  const p: string[] = [];
  const ohneMerkmal = (u: AutomatisierungDaten['und']['karten'][number]): boolean => (u.art === 'gruppe' ? u.karten.some(ohneMerkmal) : !(u.art === 'bedingung' && u.bedingung.art === 'merkmal'));
  if (a.und.karten.some(ohneMerkmal)) p.push(t('gemeinsam.automatisierung.betrieb-nur-merkmal'));
  if ([...a.dann, ...a.sonst].some((d) => d.art === 'aufgabe' && d.empfaenger.some((e) => e.art !== 'person' && e.art !== 'rolle'))) p.push(t('gemeinsam.automatisierung.betrieb-empfaenger'));
  return p;
}

/**
 * Platzhalter der Werkbank-Karten (#677): Zeitpunkt, Stufe, Modul und Text der Meldung (ohne Geheimnisse, wie im
 * Protokoll), wer einen Fehler gemeldet hat, neue und installierte Version. Kein Titel, kein Mappentyp.
 */
export const BETRIEB_PLATZHALTER: Record<BetriebWenn, readonly string[]> = {
  'fehler.gemeldet': ['zeitpunkt', 'meldung', 'gemeldet_von'],
  'protokoll.meldung': ['zeitpunkt', 'stufe', 'modul', 'meldung'],
  'version.neu': ['version', 'installiert'],
};
export function betriebPlatzhalter(w: WennBetrieb): Array<{ key: string; label: string }> {
  return [
    { key: 'heute', label: t('gemeinsam.automatisierung.datum-heute') }, { key: 'automatisierung', label: t('gemeinsam.automatisierung.name-dieser-automatisierung') },
    ...BETRIEB_PLATZHALTER[w.art].map((key) => ({ key, label: t.frei(`gemeinsam.automatisierung.platzhalter.${key.replace(/_/g, '-')}`) })),
  ];
}

/** Wenn-Karte aus dem Betrieb kurz (#677): „Protokollmeldung ab Fehler (mail, „SMTP“)“. */
export function betriebKurz(w: WennBetrieb, ereignisName: (art: string) => string): string {
  if (w.art !== 'protokoll.meldung') return ereignisName(w.art);
  const filter = [w.modul, w.enthaelt ? `„${w.enthaelt}“` : ''].filter(Boolean).join(', ');
  return `${ereignisName(w.art)} ${t.frei(`gemeinsam.automatisierung.ab-${w.stufe}`)}${filter ? ` (${filter})` : ''}`;
}

/**
 * Lauf-Daten für eine Person (#677, Sicherheit in PR #1155): Den Text einer Protokollmeldung sieht nur, wer „Protokoll“
 * verwaltet, Text und Konto der meldenden Person einer Fehlermeldung nur, wer „Gemeldete Fehler“ verwaltet – wie die
 * Platzhalter {meldung} und {gemeldet_von}. Gespeichert bleibt alles, Wiederholen arbeitet mit den gespeicherten Daten.
 * Ohne `darf` (intern, Tests) unverändert. Parameter eines Aufrufs von außen (#679) nur für „Automatisierungen“.
 */
export function laufFuer(roh: Lauf, darf?: (bereich: string) => boolean): Lauf {
  if (!darf) return roh;
  const l = aufrufLaufFuer(roh, darf);
  const weg = l.art === 'protokoll.meldung' && !darf(SYSTEMKONTO_WERKBANK.protokoll) ? ['text']
    : l.art === 'fehler.gemeldet' && !darf(SYSTEMKONTO_WERKBANK.fehlermeldung) ? ['benutzer', 'text'] : [];
  if (!weg.some((k) => k in l.daten)) return l;
  return { ...l, daten: Object.fromEntries(Object.entries(l.daten).filter(([k]) => !weg.includes(k))) };
}
