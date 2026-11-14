/**
 * „Was mitkommt“ (#1047): alles, was ein Paket mitbringt – dieselben Punkte und dieselbe Reihenfolge wie die Paketseite
 * des Katalogs (dms-registry #164, `werkzeuge/webseite.py`): Mappentypen · Ansichten · mitgelieferte Mappen (Vorgaben) ·
 * Beispiele · Wortlisten · Automatisierungen · Automatisierungsvorlagen · Aktionen im Menü „Mappe“ · Einstellungen; danach
 * Rechte und Netz. Rundgänge und Tipps folgen, sobald das Paketformat sie kennt (dms-registry #132).
 *
 * Der Server liest die Angaben aus dem Paket (Namen schon aufgelöst, Automatisierungen als Daten), die Oberfläche macht
 * daraus Text – in der Sprache, in der man sie liest. Die Wortwahl der Automatisierungen ist die gemeinsame Fassung mit
 * dem Katalog (Kommentar in #1047: „60 Tage vor „Ende“ (Mietvertrag), geprüft um 07:00“).
 */
import { zeitplanText } from './automatisierung';
import { t } from './texte';

/** Ein Eintrag; neu: kommt mit diesem Update dazu (nur in der Vorschau eines Updates). */
export interface MitkommtEintrag { schluessel: string; name: string; beschreibung?: string; neu?: boolean }

/** Wann eine mitgelieferte Automatisierung läuft – Namen von Mappentyp und Feld schon aufgelöst. */
export type MitkommtWenn =
  | { art: 'datum'; typ: string; feld: string; vorlauf: number; einheit: 'tage' | 'wochen' | 'monate'; uhrzeit: string; wiederholung: number | null }
  | { art: 'zeitplan'; tage: number[]; uhrzeit: string; feiertage: boolean; jeBenutzer: boolean; profilzeit: boolean }
  | { art: 'ereignis'; ereignis: string; typ: string | null };
/** An wen eine Aufgabe geht – Felder mit ihrer Bezeichnung. */
export type MitkommtEmpfaenger = { art: 'ersteller' } | { art: 'feld'; feld: string; sonstErsteller: boolean } | { art: 'ereignis'; feld: string };
/** Was eine mitgelieferte Automatisierung tut. */
export type MitkommtDann =
  | { art: 'aufgabe'; benachrichtigung: boolean; empfaenger: MitkommtEmpfaenger[] }
  | { art: 'feld'; felder: string[] }
  | { art: 'zusammenfassung' | 'favoriten' | 'sammelmeldung' | 'kontosperre' | 'paket' | 'stopp' | 'sonst' };
export interface MitkommtAutomatisierung extends MitkommtEintrag {
  wenn: MitkommtWenn; dann: MitkommtDann[];
  /** Das Paket schlägt vor, sie gleich einzuschalten (#1082). */
  an: boolean;
}

/** Alles, was ein Paket mitbringt (#1047). */
export interface Mitkommt {
  mappentypen: Array<MitkommtEintrag & { felder: number }>;
  sichten: MitkommtEintrag[];
  /** Mitgelieferte Mappen (#1038) je Mappentyp; vorlagen: Text-Vorlagen zum Ausfüllen. */
  vorgaben: Array<{ typ: string; namen: string[]; neu?: string[] }>;
  vorlagen: number;
  beispiele: number; beispielDokumente: number;
  /** Gruppen gleichbedeutender Wörter für die Suche (#356). */
  wortlisten: string[][];
  automatisierungen: MitkommtAutomatisierung[];
  /** Automatisierungsvorlagen (#1044) mit ihren Karten in Klartext. */
  ablaufvorlagen: Array<MitkommtEintrag & { karten: string[] }>;
  /** Aktionen im Menü „Mappe“ (#1039) mit den Rechten, die sie brauchen (Schlüssel wie im Manifest). */
  aktionen: Array<MitkommtEintrag & { rechte: string[] }>;
  /** Einstellungen (#197): Abschnitte und Listen mit ihren Feldern. */
  einstellungen: Array<{ titel: string; felder: Array<{ name: string; typ: string }>; liste: boolean; neu?: boolean }>;
  /** Rechte und Netz: Code (läuft im Paket-Läufer), Zugriff auf Netzwerk/Internet, nur Texte (Sprachpaket). */
  code: boolean; netz: boolean; sprache: boolean;
}

/** Ist nichts in der Ablage angelegt (Funktion, Sprache)? Dann sagt die Werkbank das ausdrücklich, wie der Katalog. */
export const legtNichtsAn = (m: Mitkommt) => !m.mappentypen.length && !m.sichten.length && !m.vorgaben.length && !m.beispiele;

const WIEDERHOLUNG: Record<number, string> = { 1: 'monatlich', 3: 'vierteljaehrlich', 6: 'halbjaehrlich', 12: 'jaehrlich' };

/** „60 Tage vor „Ende“ (Mietvertrag), geprüft um 07:00“, „am Tag …“, „7 Tage nach …“. */
function datumText(w: Extract<MitkommtWenn, { art: 'datum' }>): string {
  const n = Math.abs(w.vorlauf);
  const feld = t('gemeinsam.mitkommt.feld-im-typ', { feld: w.feld, typ: w.typ });
  const wann = !n ? t('gemeinsam.mitkommt.am-tag', { feld })
    : t(w.vorlauf > 0 ? 'gemeinsam.mitkommt.vor' : 'gemeinsam.mitkommt.nach', { dauer: t.frei(`gemeinsam.mitkommt.einheit.${w.einheit}`, { anzahl: n }), feld });
  return t('gemeinsam.mitkommt.geprueft-um', { wann, uhrzeit: w.uhrzeit });
}

/** An wen: „die Person, die die Mappe angelegt hat“, „„Verantwortlich“ (sonst an …)“, „Vertreter“. */
function empfaengerText(e: MitkommtEmpfaenger): string {
  if (e.art === 'ersteller') return t('gemeinsam.mitkommt.ersteller');
  if (e.art === 'ereignis') return t.frei(`gemeinsam.mitkommt.person.${e.feld}`);
  return e.sonstErsteller ? t('gemeinsam.mitkommt.feld-sonst', { feld: e.feld }) : t('gemeinsam.mitkommt.feld', { feld: e.feld });
}

function dannText(d: MitkommtDann): string {
  if (d.art === 'aufgabe') return t(d.benachrichtigung ? 'gemeinsam.mitkommt.benachrichtigung-an' : 'gemeinsam.mitkommt.aufgabe-an', { wer: d.empfaenger.map(empfaengerText).join(', ') || '?' });
  if (d.art === 'feld') return t('gemeinsam.mitkommt.felder-setzen', { felder: d.felder.map((f) => t('gemeinsam.mitkommt.feld', { feld: f })).join(', ') });
  return t.frei(`gemeinsam.mitkommt.dann.${d.art}`);
}

/**
 * Eine mitgelieferte Automatisierung in Klartext (#1047): Wenn, Dann und ob sie einmal je Termin oder wiederkehrend
 * läuft. ereignisName: Name eines Ereignisses (Oberfläche: aus ereignisse.json).
 */
export function automatisierungKlartext(a: Pick<MitkommtAutomatisierung, 'wenn' | 'dann'>, ereignisName: (art: string) => string): { wenn: string; dann: string; ablauf: string } {
  const w = a.wenn;
  const wenn = w.art === 'datum' ? datumText(w)
    : w.art === 'zeitplan' ? `${zeitplanText({ ...w, rolle: null })}${w.jeBenutzer ? t('gemeinsam.mitkommt.je-benutzer') : ''}`
    : `${w.typ ? `${w.typ}: ` : ''}${ereignisName(w.ereignis)}`;
  const ablauf = w.art === 'datum'
    ? (w.wiederholung ? t('gemeinsam.mitkommt.wiederkehrend', { wie: WIEDERHOLUNG[w.wiederholung] ? t.frei(`gemeinsam.mitkommt.wiederholung.${WIEDERHOLUNG[w.wiederholung]}`) : w.wiederholung % 12 === 0 ? t('gemeinsam.mitkommt.alle-jahre', { anzahl: w.wiederholung / 12 }) : t('gemeinsam.mitkommt.alle-monate', { anzahl: w.wiederholung }) }) : t('gemeinsam.mitkommt.einmal'))
    : w.art === 'zeitplan' ? t('gemeinsam.mitkommt.nach-zeitplan') : t('gemeinsam.mitkommt.je-ereignis');
  return { wenn, dann: a.dann.map(dannText).join(', ') || '…', ablauf };
}

/** Kurzfassung wie im Katalog: „3 Mappentypen · 5 Ansichten · 2 Automatisierungen“ – für den zugeklappten Bereich. */
export function mitkommtKurz(m: Mitkommt): string {
  const teile: Array<[number, string]> = [
    [m.mappentypen.length, 'mappentypen'], [m.sichten.length, 'sichten'], [m.vorgaben.reduce((n, v) => n + v.namen.length, 0), 'vorgaben'], [m.beispiele, 'beispiele'],
    [m.wortlisten.length, 'wortlisten'], [m.automatisierungen.length, 'automatisierungen'], [m.ablaufvorlagen.length, 'ablaufvorlagen'], [m.aktionen.length, 'aktionen'],
    [m.einstellungen.reduce((n, e) => n + e.felder.length, 0), 'einstellungen'],
  ];
  const text = teile.filter(([n]) => n > 0).map(([n, k]) => t.frei(`gemeinsam.mitkommt.kurz.${k}`, { anzahl: n }));
  if (m.sprache) return t('gemeinsam.mitkommt.kurz.sprache');
  if (legtNichtsAn(m)) text.unshift(t('gemeinsam.mitkommt.kurz.nichts'));
  return text.join(' · ');
}

/**
 * Was der Katalog allein verrät (#1047): Mappentypen, Ansichten und Beispiele einer Katalogversion – für die Paketseite
 * vor der Installation. Alles Weitere zeigt die Vorschau, die das Paket selbst liest.
 */
export function mitkommtAusKatalog(v: { inhalt: { mappentypen: Array<{ schluessel: string; name: string }>; sichten: Array<{ schluessel: string; name: string }>; beispiele: number }; code: boolean; sprache?: unknown }): Mitkommt {
  return {
    mappentypen: v.inhalt.mappentypen.map((x) => ({ schluessel: x.schluessel, name: x.name, felder: 0 })), sichten: v.inhalt.sichten.map((x) => ({ schluessel: x.schluessel, name: x.name })),
    vorgaben: [], vorlagen: 0, beispiele: v.inhalt.beispiele, beispielDokumente: 0, wortlisten: [], automatisierungen: [], ablaufvorlagen: [], aktionen: [], einstellungen: [],
    code: v.code, netz: false, sprache: !!v.sprache,
  };
}

/* ---------- Kurzanleitung ---------- */

/** Höchstens so viele Schritte und Zeichen je Schritt (Katalog: 3–5 kurze Schritte). */
export const KURZANLEITUNG_SCHRITTE = 8;
export const KURZANLEITUNG_ZEICHEN = 300;

/**
 * Kurzanleitung „So nutzt du es“ (#1047, Manifest `kurzanleitung: { de: [...], en: [...] }`, dms-registry #164).
 * Ungültiges übergeht Ablago still – wie ältere Versionen das ganze Feld: Sprache als Kürzel, je eine Liste von Texten.
 */
export function liesKurzanleitung(v: unknown): Record<string, string[]> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const erg: Record<string, string[]> = {};
  for (const [sprache, schritte] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(sprache) || !Array.isArray(schritte)) continue;
    const l = schritte.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && x.length <= KURZANLEITUNG_ZEICHEN && !/[<>]/.test(x)).slice(0, KURZANLEITUNG_SCHRITTE);
    if (l.length) erg[sprache] = l;
  }
  return Object.keys(erg).length ? erg : undefined;
}

/** Kurzanleitung in der Sprache der Oberfläche, sonst Deutsch, sonst die erste vorhandene. */
export function kurzanleitungIn(k: Record<string, string[]> | undefined, sprache: string): string[] {
  if (!k) return [];
  return k[sprache] ?? k[sprache.split('-')[0]] ?? k.de ?? Object.values(k)[0] ?? [];
}
