/**
 * Paket selbst erstellen (#374): gewählte Mappentypen und Ansichten dieses DMS als .zip im Format der
 * Registry (manifest.yaml, inhalt/…, README, CHANGELOG, LICENSE, tests/erwartung.yaml).
 *
 * - Nur, was das Paketformat heute kann; was nicht hineinpasst, steht als Hinweis in der Prüfung.
 * - Typen und Ansichten aus installierten Paketen werden nicht kopiert, sondern Abhängigkeit (>= installierte Version).
 * - Verweise auf Benutzer und Rolle werden dms:…, auf den Ablageort basis:ablageort (#883, Abhängigkeit Basis); auf eigene,
 *   nicht gewählte Typen: „mit aufnehmen“.
 * - Ansichten dürfen ohne ihre Mappentypen ins Paket (#656): Der Typ bleibt über seine Kennung erhalten (`fremde_typen`),
 *   die Prüfung warnt nur.
 * - Keine Mappendaten außer ausdrücklich gewählten Beispiel-Mappen; nie Passwörter, nie Benutzer, keine Ids.
 * - Vor dem Download dieselbe Prüfung wie beim Hochladen (liesPaket).
 *
 * `baue` ist eine reine Funktion (testbar ohne DMS); die Klasse holt den Stand aus dem Dienst.
 */
import { buffer as alsPuffer } from 'node:stream/consumers';
import { stringify } from 'yaml';
import { istLeer, standardliste, trefferlistenVon, type Feld, type Mappe, type Mappentyp, type Register } from '../../shared/src/model';
import { kreisImStandard } from '../../shared/src/nummernkreis';
import { ALLE_TYPEN, BEISPIEL_DOKUMENTE_AB, BEISPIEL_ENDUNGEN, BEREICH, DMS_ALIAS, DMS_WORTLISTEN_AB, inMB, PAKET_ID, VERSION, WORTLISTEN_MAX, vergleicheVersion, type InstalliertesPaket } from '../../shared/src/pakete';
import { liesWortgruppe } from '../../shared/src/suche';
import { SCHLUESSEL, SCHLUESSEL_MAX, typKennung } from '../../shared/src/kennungen';
import type { Synonymgruppe } from './repo';
import { BESCHREIBUNG_LAENGE, EIGENE_LIZENZ, GITHUB, istFreieLizenz, KEINE_LIZENZ, LIZENZ_VORGABE, LIZENZEN, LIZENZNAME_LAENGE, LIZENZTEXT_MAX, lizenzVerweis, NAME_LAENGE, naechsteVersion, naechsteVersionen, type ErstellenStand, type Fehlend, type PaketEntwurf, type PaketErstellenEingabe, type PaketPruefung, type SelbstErstellt, type SelbstErstelltDetail, type VersionsArt, type VersionsLage } from '../../shared/src/paketerstellung';
import type { Bedingung, Sicht, WertAngabe } from '../../shared/src/sichten';
import type { Anzeigeregel } from '../../shared/src/anzeige';
import type { Dienst } from './dienst';
import { t } from './sprache';
import { Fachfehler } from './fehler';
import { LIZENZTEXTE } from './lizenztexte';
import { ARCHIV_MAX, BASIS_ABLAGEORT_AB, beispielDateiart, DMS_TYPEN, DMS_VERWEISE_AB, FREMDE_TYPEN_AB, liesPaket, liesZip, type FremderTyp, type Handelnder } from './pakete';
import { protokoll } from './protokoll';
import { typBild, typUnterschiede, type TypUnterschiede } from '../../shared/src/typvergleich';
import { wiederfindenVorgabe } from '../../shared/src/erkennung';
import { DMS_TABELLE_AB } from '../../shared/src/tabelle';
import { DMS_VORBELEGEN_AB } from '../../shared/src/vorbelegen';
import { DMS_TEILE_AB } from '../../shared/src/teile';
import { archivInsPaket, DMS_ARCHIV_PAKET_AB } from '../../shared/src/archiv';
import { DMS_ZUSAMMENGESETZT_AB } from '../../shared/src/zusammengesetzt';
import { DMS_VORGABEN_AB, teileVorgabe } from '../../shared/src/vorgaben';
import { UMBAU_FELD } from '../../shared/src/umbau';
import { DMS_ORGANISATION_AB } from '../../shared/src/organisation';
import { zipPuffer } from './zip';
import { gebietsschema } from '../../shared/src/sprache';
import { ARCHIV_MERKEN_MAX } from './grenzen';
import { paketArchive, paketEntwuerfe, setzePaketArchive, setzePaketEntwuerfe } from './pakete/index';

const log = protokoll.modul('werkbank');

/**
 * Ab dieser Version kennt Ablago die Feldarten Zeitraum und Prozent und negative Beträge (#1035). Beim Einreihen auf die
 * Version setzen, mit der sie erscheinen.
 */
export const FELDARTEN_AB = '0.227.0';
/** Ab dieser Version verstehen DMS Verweise zwischen Beispielen (#347). */
const BEISPIELVERWEISE_AB = '0.79.0';
/**
 * Mindestversion von Ablago (#651): Grundlage ist die Version, mit der „Paket erstellen“ kam; jede benutzte
 * Funktion kann sie anheben. Neue Funktionen im Paketformat bitte hier eintragen (Entwicklerhandbuch → Pakete).
 */
export const MINDEST_GRUNDLAGE = '0.86.0';
export const MINDEST_FUNKTIONEN = {
  dmsVerweise: { ab: DMS_VERWEISE_AB, grund: t('meldungen.paketerstellung.verweise-auf-mappentypen-von') },
  beispielVerweise: { ab: BEISPIELVERWEISE_AB, grund: t('meldungen.paketerstellung.verweise-zwischen-beispielen') },
  erkennung: { ab: '0.113.0', grund: t('meldungen.paketerstellung.erkennung-an-feldern-aus') },
  feldformate: { ab: '0.121.0', grund: t('meldungen.paketerstellung.feldformate-und-datumsgrenzen') },
  feldarten: { ab: FELDARTEN_AB, grund: t('meldungen.paketerstellung.feldarten') },
  tabelle: { ab: DMS_TABELLE_AB, grund: t('meldungen.paketerstellung.tabelle') },
  vorbelegen: { ab: DMS_VORBELEGEN_AB, grund: t('meldungen.paketerstellung.vorbelegen') },
  teile: { ab: DMS_TEILE_AB, grund: t('meldungen.paketerstellung.teile') },
  zusammengesetzt: { ab: DMS_ZUSAMMENGESETZT_AB, grund: t('meldungen.paketerstellung.zusammengesetzt') },
  vorgaben: { ab: DMS_VORGABEN_AB, grund: t('meldungen.paketerstellung.vorgaben') },
  archiv: { ab: DMS_ARCHIV_PAKET_AB, grund: t('meldungen.paketerstellung.archiv') },
  organisation: { ab: DMS_ORGANISATION_AB, grund: t('meldungen.paketerstellung.organisation') },
  wortlisten: { ab: DMS_WORTLISTEN_AB, grund: t('meldungen.paketerstellung.wortlisten') },
  fremdeTypen: { ab: FREMDE_TYPEN_AB, grund: t('meldungen.paketerstellung.ansichten-mit-mappentypen-die') },
  beispielDokumente: { ab: BEISPIEL_DOKUMENTE_AB, grund: t('meldungen.paketerstellung.beispiel-dokumente') },
} as const;
export type MindestFunktion = keyof typeof MINDEST_FUNKTIONEN;
/** Minor-Versionen, die es nie gab (übersprungen); erscheinen nicht in der Auswahl. */
const NIE_ERSCHIENEN = new Set(['0.157.0']);
const DMS_ANGABE = /^>=(\d+)\.(\d+)\.0$/;

/**
 * Beim Auswählen übernehmen (#1037) ins Paket: Paare aus Feldkennungen, so wie sie sind – ohne Ziel und ohne Zielfeld
 * im Paket (Systemfelder kommen nicht mit) fallen sie weg.
 */
function vorbelegenInsPaket(x: Record<string, unknown>, f: Feld, typ: Mappentyp) {
  delete x.vorbelegen;
  const paare = (f.typ === 'referenz' ? f.vorbelegen ?? [] : []).filter((p) => typ.felder.some((g) => g.key === p.nach && !g.system));
  if (paare.length && (x.ziel !== undefined || x.zielOptional)) x.vorbelegen = paare.map(({ von, nach }) => ({ von, nach }));
}

/** Mindestversion aus den benutzten Funktionen: höchste Untergrenze und die Gründe dafür. */
export function mindestversion(genutzt: Iterable<MindestFunktion>): { version: string; gruende: string[] } {
  let v = MINDEST_GRUNDLAGE;
  const alle = [...new Set(genutzt)].map((k) => MINDEST_FUNKTIONEN[k]);
  for (const f of alle) if (vergleicheVersion(f.ab, v) > 0) v = f.ab;
  return { version: v, gruende: alle.filter((f) => vergleicheVersion(f.ab, MINDEST_GRUNDLAGE) > 0).sort((a, b) => vergleicheVersion(b.ab, a.ab)).map((f) => `${f.grund} (ab ${f.ab})`) };
}

/** Wählbare Angaben „>=X.Y.0“ von der Mindestversion bis zur eigenen Version, älteste zuerst. */
export function dmsOptionen(mindest: string, eigene: string): string[] {
  const [ma, mb] = mindest.split('.').map(Number);
  const e = eigene.replace(/^v/, '').split('-')[0];
  if (!VERSION.test(e)) return [`>=${ma}.${mb}.0`];
  const [ea, eb] = e.split('.').map(Number);
  const r: string[] = [];
  const dazu = (a: number, b: number) => { const v = `${a}.${b}.0`; if (!NIE_ERSCHIENEN.has(v)) r.push(`>=${v}`); };
  if (ma === ea) for (let b = mb; b <= eb; b++) dazu(ma, b);
  else if (ma < ea) {
    // Über eine Hauptversion hinweg: die Minor-Versionen der alten kennt Ablago nicht – nur die Mindestversion.
    dazu(ma, mb);
    for (let a = ma + 1; a <= ea; a++) for (let b = 0; b <= (a === ea ? eb : 0); b++) dazu(a, b);
  }
  return r.length ? r : [`>=${ma}.${mb}.0`];
}

/** Art der Änderung seit dem letzten Export: entfernt → größere, neu → neue Inhalte, sonst Korrektur. */
export function erkenneArt(e: PaketErstellenEingabe, entwurf: PaketEntwurf | null, felderJetzt: Record<string, string[]>, namen: Map<string, string>): { art: VersionsArt | null; grund: string | null } {
  if (!entwurf) return { art: null, grund: null };
  const weg = (alt: string[], neu: string[]) => alt.filter((x) => !neu.includes(x));
  const typWeg = weg(entwurf.typen, e.typen), sichtWeg = weg(entwurf.sichten, e.sichten);
  const name = (id: string) => namen.get(id) ?? t('meldungen.paketerstellung.ein-mappentyp');
  if (typWeg.length) return { art: 'gross', grund: t('meldungen.paketerstellung.mappentyp-nicht-mehr-dabei', { name: name(typWeg[0]) }) };
  if (sichtWeg.length) return { art: 'gross', grund: t('meldungen.paketerstellung.ansicht-nicht-mehr-dabei', { name: name(sichtWeg[0]) }) };
  const alt = entwurf.felder;
  if (alt) for (const [tid, keys] of Object.entries(alt)) {
    if (!e.typen.includes(tid) || !felderJetzt[tid]) continue;
    const f = weg(keys, felderJetzt[tid]);
    if (f.length) return { art: 'gross', grund: t('meldungen.paketerstellung.feld-in-entfernt', { f: f[0], name: name(tid) }) };
  }
  const typNeu = weg(e.typen, entwurf.typen), sichtNeu = weg(e.sichten, entwurf.sichten);
  if (typNeu.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.mappentyp-neu-dabei', { name: name(typNeu[0]) }) };
  if (sichtNeu.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.ansicht-neu-dabei', { name: name(sichtNeu[0]) }) };
  if (alt) {
    for (const tid of e.typen) {
      const f = felderJetzt[tid] ? weg(felderJetzt[tid], alt[tid] ?? []) : [];
      if (f.length) return { art: 'inhalt', grund: t('meldungen.paketerstellung.feld-in-neu', { f: f[0], name: name(tid) }) };
    }
    return { art: 'korrektur', grund: t('meldungen.paketerstellung.keine-felder-mappentypen-oder') };
  }
  return { art: null, grund: null };
}
/** Etwas, das wie eine Id aussieht (Mappe, Benutzer, Rolle) – gehört nie in ein Paket. */
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const mitId = (v: unknown) => ID.test(JSON.stringify(v) ?? '');
const ENTWUERFE_MAX = 20;
/** Gemerkte Archive je selbst erstelltem Paket (#652): die letzten Versionen, je höchstens 5 MB (Einstellung, in der Sicherung). */
const ARCHIVE_JE_PAKET = 10;
type GemerktesArchiv = { version: string; erstellt: string; zip: string };
const BEISPIELMAPPEN_MAX = 200;

/** Alles, was die Erzeugung aus dem DMS braucht. */
export interface ErstellenDaten {
  typen: Mappentyp[];
  sichten: Sicht[];
  pakete: InstalliertesPaket[];
  /** Mappentypen, auf die Pakete mit dms:… verweisen dürfen: Id → Kennung (benutzer, rolle; ablageort = früherer des Kerns, #883). */
  dmsTypen: Map<string, string>;
  /** Gewählte Beispiel-Mappen (nur aus gewählten eigenen Typen). */
  mappen: Mappe[];
  /**
   * Vorgaben aus Paketen (#1038), auf die Anzeige-Bedingungen „zeigt auf“ der Typen zeigen: Mappen-Id → feste Kennung
   * (`paket:<id>:<schluessel>`). So kommt die Bedingung mit der Kennung ins Paket statt mit der Id dieser Installation.
   */
  vorgaben?: Map<string, string>;
  /**
   * Beispiel-Dokumente (#878) je gewählter Mappe, wenn „mit Dokumenten“ gewählt ist: nur PDF, PNG und JPEG.
   * `ausgelassen`: Dokumente anderer Art, die nicht mitkommen.
   */
  dokumente?: Map<string, Array<{ name: string; registerKey: string; erstellt: string; inhalt: Buffer }>>;
  dokumenteAusgelassen?: number;
  /** Alle Beispiel-Dokumente zusammen in Bytes, wenn sie nicht ins Archiv passen (dann ist keines geladen, das zu viel wäre). */
  dokumenteZuGross?: number;
  /** Alle Gruppen gleichbedeutender Wörter (#661); eigene haben die Quelle „werkbank“. */
  wortlisten?: Synonymgruppe[];
  dmsVersion: string;
  /** Zuletzt exportierter Entwurf mit derselben Id. */
  entwurf: PaketEntwurf | null;
  /** Alle gemerkten Entwürfe (#656): unter welcher Kennung ein eigener Typ in einem früher exportierten Paket steckt. */
  entwuerfe?: PaketEntwurf[];
  jetzt: Date;
}

/** Höchste Version, die der Empfänger schon haben kann: Entwurf oder hochgeladene letzte Version. */
export function bekannteVersion(e: PaketErstellenEingabe, entwurf: PaketEntwurf | null): string | null {
  const l = [entwurf?.version, e.bekannteVersion?.trim()].filter((v): v is string => !!v && VERSION.test(v)).sort(vergleicheVersion);
  return l.pop() ?? null;
}

export interface Bau {
  probleme: string[];
  fehlend: Array<Fehlend & { noetig: boolean }>;
  hinweise: string[];
  abhaengigkeiten: Record<string, string>;
  inhalt: PaketPruefung['inhalt'];
  /** Kennungen im Paket je Id im DMS (zum Merken). */
  schluessel: Record<string, string>;
  /** Dateien des Pakets (ohne Ordner davor). */
  dateien: Array<{ name: string; daten: Buffer }>;
  /** #651: Version und Mindestversion. */
  version: VersionsLage;
  /** Feldschlüssel je exportiertem Typ (zum Merken, #651). */
  felder: Record<string, string[]>;
  /** Lizenzangabe im Manifest. */
  lizenz: string;
}

/** Null, undefined, leere Texte und „false“ weglassen – das Schema kennt kein null. */
function ohneLeere<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length))) as Partial<T>;
}

/** Eine freie Kennung: Basis gekürzt, bei Bedarf mit _2, _3 … */
function frei(basis: string, max: number, belegt: Set<string>): string {
  let b = basis.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '');
  if (!b) b = 'typ';
  b = b.slice(0, max).replace(/_+$/, '') || 'typ';
  let k = b;
  for (let n = 2; belegt.has(k); n++) k = `${b.slice(0, max - String(n).length - 1)}_${n}`;
  belegt.add(k);
  return k;
}

/** Untergrenze eines Versionsbereichs, z. B. „>=0.75.0“ → 0.75.0. */
const untergrenze = (bereich: string) => BEREICH.exec(bereich.trim())?.[2] ?? null;
/** Text für eine Markdown-Tabellenzelle: Backslash zuerst, dann „|“ escapen, Zeilenumbrüche weg. */
const zelle = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/**
 * Baut das Paket: prüft die Auswahl und die Angaben, löst Verweise auf und erzeugt die Dateien.
 * Gibt immer ein Ergebnis zurück; `probleme` bzw. nötige `fehlend` verhindern den Export.
 */
export function baue(e: PaketErstellenEingabe, d: ErstellenDaten): Bau {
  const probleme: string[] = [];
  const hinweise: string[] = [];
  const fehlend: Bau['fehlend'] = [];
  const abh: Record<string, string> = {};
  const typById = new Map(d.typen.map((t) => [t.id, t] as const));
  const sichtById = new Map(d.sichten.map((s) => [s.id, s] as const));
  const id = e.id.trim();

  // Herkunft: welche Typen und Ansichten gehören zu einem installierten Paket?
  const typPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  const sichtPaket = new Map<string, { p: InstalliertesPaket; s: string }>();
  for (const p of d.pakete) {
    for (const [s, tid] of Object.entries(p.typen)) typPaket.set(tid, { p, s });
    for (const [s, sid] of Object.entries(p.sichten)) sichtPaket.set(sid, { p, s });
  }
  const geaendert = (t: Mappentyp) => { const h = typPaket.get(t.id); return !!h && aenderung(t, h.p, (id) => typById.get(id)?.schluessel).geaendert; };
  const einmal = new Set<string>();
  const hinweis = (h: string) => { if (!einmal.has(h)) { einmal.add(h); hinweise.push(h); } };
  const abhaengig = (p: InstalliertesPaket) => {
    const b = `>=${p.version}`;
    if (!abh[p.id] || vergleicheVersion(p.version, untergrenze(abh[p.id]) ?? '0.0.0') > 0) abh[p.id] = b;
  };
  const ausPaket = (art: string, name: string, p: InstalliertesPaket, eintrag?: Mappentyp) => {
    abhaengig(p);
    hinweis(t('meldungen.paketerstellung.kommt-aus-dem-paket', { art, name, name2: p.name, id: p.id, version: p.version }));
    if (eintrag && geaendert(eintrag)) hinweis(t('meldungen.paketerstellung.aenderungen-an-gehoeren-nicht', { name: eintrag.name, name2: p.name }));
  };

  // 1. Angaben
  if (!PAKET_ID.test(id)) probleme.push(t('meldungen.paketerstellung.id-nur-kleinbuchstaben-ziffern'));
  else if (id === 'dms') probleme.push(t('meldungen.paketerstellung.id-dms-ist-fuer'));
  else if (d.pakete.some((p) => p.id === id)) probleme.push(t('meldungen.paketerstellung.id-das-paket-ist', { id }));
  const name = e.name.trim();
  if (name.length < NAME_LAENGE.min || name.length > NAME_LAENGE.max) probleme.push(t('meldungen.paketerstellung.name-bis-zeichen', { min: NAME_LAENGE.min, max: NAME_LAENGE.max }));
  if (!VERSION.test(e.version.trim())) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  const beschreibung = e.beschreibung.trim().replace(/\s+/g, ' ');
  if (beschreibung.length < BESCHREIBUNG_LAENGE.min || beschreibung.length > BESCHREIBUNG_LAENGE.max) probleme.push(t('meldungen.paketerstellung.beschreibung-bis-zeichen-ein', { min: BESCHREIBUNG_LAENGE.min, max: BESCHREIBUNG_LAENGE.max }));
  const autor = { name: e.autor.name.trim(), github: e.autor.github.trim().replace(/^@/, '') };
  if (!autor.name) probleme.push(t('meldungen.paketerstellung.autor-bitte-deinen-namen'));
  if (autor.github && !GITHUB.test(autor.github)) probleme.push(t('meldungen.paketerstellung.github-nur-buchstaben-ziffern'));
  if (!autor.github) hinweis(t('meldungen.paketerstellung.ohne-github-namen-laesst'));
  // Lizenz (#651): freie aus der Liste, eigene (Name + Text → LICENSE) oder keine.
  const art = e.lizenzArt ?? 'frei';
  let lizenz = '';
  if (art === 'frei') {
    if (!istFreieLizenz(e.lizenz)) probleme.push(t('meldungen.paketerstellung.lizenz-bitte-eine-freie', { LIZENZEN: LIZENZEN.join(', ') }));
    else lizenz = e.lizenz;
  } else if (art === 'eigen') {
    const n = (e.lizenzName ?? '').trim();
    if (n.length < LIZENZNAME_LAENGE.min || n.length > LIZENZNAME_LAENGE.max) probleme.push(t('meldungen.paketerstellung.lizenz-name-der-eigenen', { min: LIZENZNAME_LAENGE.min, max: LIZENZNAME_LAENGE.max }));
    if (!(e.lizenzText ?? '').trim()) probleme.push(t('meldungen.paketerstellung.lizenz-bitte-den-text'));
    else if ((e.lizenzText ?? '').length > LIZENZTEXT_MAX) probleme.push(t('meldungen.paketerstellung.lizenz-der-lizenztext-ist', { LIZENZTEXT_MAX: LIZENZTEXT_MAX.toLocaleString(gebietsschema()) }));
    lizenz = lizenzVerweis(n);
  } else lizenz = KEINE_LIZENZ;
  if (art !== 'frei') hinweis(t('meldungen.paketerstellung.laesst-sich-das-paket', { wert: art === 'eigen' ? t('meldungen.paketerstellung.mit-einer-eigenen-lizenz') : t('meldungen.paketerstellung.ohne-lizenz'), LIZENZEN: LIZENZEN.join(', ') }));
  // Version (#651): ausgewählt, immer höher als die zuletzt bekannte.
  const version = e.version.trim();
  const bekannt = bekannteVersion(e, d.entwurf);
  if (!VERSION.test(version)) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  else if (bekannt && vergleicheVersion(version, bekannt) <= 0) probleme.push(t('meldungen.paketerstellung.version-damit-der-empfaenger', { bekannt, wert: d.entwurf && d.entwurf.version === bekannt ? t('meldungen.paketerstellung.hast-du-schon-erstellt') : t('meldungen.paketerstellung.gibt-es-schon'), naechsteVersion: naechsteVersion(bekannt) }));
  else if (!e.vonHand && bekannt && !Object.values(naechsteVersionen(bekannt)).includes(version)) probleme.push(t('meldungen.paketerstellung.version-bitte-eine-der', { values: Object.values(naechsteVersionen(bekannt)).join(', ') }));
  else if (!e.vonHand && !bekannt && version !== '1.0.0' && version !== '0.1.0') probleme.push(t('meldungen.paketerstellung.version-ein-neues-paket'));
  const dms = e.dms.trim();

  // 2. Auswahl: eigene Typen werden exportiert, Paket- und Systemtypen nicht.
  const eigene: Mappentyp[] = [];
  for (const tid of new Set(e.typen)) {
    const eintrag = typById.get(tid);
    if (!eintrag) { probleme.push(t('meldungen.paketerstellung.ein-gewaehlter-mappentyp-existiert')); continue; }
    const h = typPaket.get(eintrag.id);
    if (d.dmsTypen.get(eintrag.id) === 'ablageort') hinweis(t('meldungen.paketerstellung.ablageort-aus-basis', { name: eintrag.name, version: BASIS_ABLAGEORT_AB }));
    else if (d.dmsTypen.has(eintrag.id) || eintrag.system) hinweis(t('meldungen.paketerstellung.bringt-jede-installation-von', { name: eintrag.name }));
    else if (h) ausPaket(t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag);
    else eigene.push(eintrag);
  }
  const schluessel: Record<string, string> = {};
  // Paket und Schlüssel stehen getrennt (#1084): die Kennung hat ihre volle Länge, unabhängig von der Paket-Id.
  const max = SCHLUESSEL_MAX;
  const belegtT = new Set<string>();
  // Gemerkte Kennungen zuerst, damit sie über Versionen gleich bleiben (sonst gäbe es beim Update neue Typen).
  for (const t of eigene) {
    const alt = d.entwurf?.schluessel[t.id];
    if (alt && SCHLUESSEL.test(alt) && alt.length <= max && !belegtT.has(alt)) { belegtT.add(alt); schluessel[t.id] = alt; }
  }
  for (const t of eigene) if (!schluessel[t.id]) schluessel[t.id] = frei(t.schluessel || t.name, max, belegtT);

  /** Verweis auf einen Typ: eigener → Kennung, Paket → paket:kennung, DMS → dms:…; sonst null. */
  let dmsVerweise = false;
  const ziel = (typId: string | undefined, wo: string): string | null => {
    if (!typId) { probleme.push(`${wo}: ohne Ziel.`); return null; }
    if (schluessel[typId]) return schluessel[typId];
    const k = d.dmsTypen.get(typId);
    // Früherer Ablageort des Kerns (#883): Das Paket verweist auf basis:ablageort und braucht Basis ab 1.6.0.
    if (k && DMS_ALIAS[k]) {
      const [p, s] = DMS_ALIAS[k].split(':');
      if (!abh[p] || vergleicheVersion(BASIS_ABLAGEORT_AB, untergrenze(abh[p]) ?? '0.0.0') > 0) abh[p] = `>=${BASIS_ABLAGEORT_AB}`;
      hinweis(t('meldungen.paketerstellung.ablageort-aus-basis', { name: typById.get(typId)?.name ?? k, version: BASIS_ABLAGEORT_AB }));
      return `${p}:${s}`;
    }
    if (k && DMS_TYPEN[k]) { dmsVerweise = true; return `dms:${k}`; }
    const eintrag = typById.get(typId);
    const h = typPaket.get(typId);
    if (h && eintrag) { ausPaket(t('meldungen.paketerstellung.der-mappentyp'), eintrag.name, h.p, eintrag); return `${h.p.id}:${h.s}`; }
    if (!eintrag) { probleme.push(`${wo}: Den Ziel-Mappentyp gibt es nicht mehr.`); return null; }
    if (eintrag.system) { probleme.push(`${wo}: verweist auf „${eintrag.name}“. Darauf kann ein Paket nicht verweisen (erlaubt: ${Object.values(DMS_TYPEN).join(', ')}).`); return null; }
    if (!fehlend.some((f) => f.id === eintrag.id)) fehlend.push({ art: 'typ', id: eintrag.id, name: eintrag.name, grund: wo, noetig: true });
    return null;
  };

  /**
   * Anzeigen, wenn … (#1033) fürs Paket: „Verweis zeigt auf eine Mappe vom Typ …“ mit Typverweis statt Id. Eine
   * bestimmte Mappe (Id dieser Installation) kommt nicht mit – das geht erst mit festen Kennungen mitgelieferter Mappen
   * (#1038). Ohne Bedingung bleibt keine Regel.
   */
  /** „Zeigt auf“ nur Vorgaben installierter Pakete (#1038)? Dann deren Verweise `paket:schluessel` und die Pakete. */
  const vorgabenIn = (b: Extract<Bedingung, { art: 'feld' }>): { verweise: string[]; pakete: InstalliertesPaket[] } | null => {
    const ids = b.op === 'zeigtAuf' && b.wert?.art === 'fest' && Array.isArray(b.wert.wert) && !b.bis ? b.wert.wert.map(String) : [];
    const teile = ids.map((x) => teileVorgabe(d.vorgaben?.get(x)));
    const pakete = teile.map((v) => (v ? d.pakete.find((p) => p.id === v.paket) : undefined));
    if (!ids.length || pakete.some((p) => !p)) return null;
    return { verweise: [...new Set(teile.map((v) => `${v!.paket}:${v!.schluessel}`))], pakete: pakete as InstalliertesPaket[] };
  };
  const anzeigeFuersPaket = (r: Anzeigeregel | undefined, wo: string): Anzeigeregel | undefined => {
    if (!r) return undefined;
    const bedingungen = r.bedingungen.flatMap((b): Anzeigeregel['bedingungen'] => {
      if (b.art === 'verweistyp') { const z = ziel(b.typ, wo); return z ? [{ ...b, typ: z }] : []; }
      // Vorgaben (#1038): zeigt die Bedingung nur auf Vorgaben installierter Pakete, kommt sie mit deren Kennung – das
      // Paket hängt dann von ihnen ab. Andere Mappen dieser Installation kommen nicht mit.
      const vorgaben = b.art === 'feld' ? vorgabenIn(b.bedingung) : null;
      if (b.art === 'feld' && vorgaben) {
        for (const p of vorgaben.pakete) abhaengig(p);
        return [{ ...(b.nicht ? { nicht: true } : {}), art: 'vorgabe', feld: b.bedingung.feld, vorgabe: vorgaben.verweise } as unknown as Anzeigeregel['bedingungen'][number]];
      }
      if (b.art === 'feld' && mitId(b.bedingung)) { hinweis(t('meldungen.paketerstellung.anzeige-mappe', { wo })); return []; }
      return [b];
    });
    return bedingungen.length ? { modus: r.modus, bedingungen } : undefined;
  };

  /**
   * Tabelle (#1030) fürs Paket: Typ als Verweis wie bei ziel; Pakete bringen je Typ nur die Standard-Trefferliste mit.
   * Fehlt der Typ im Paket, steht er unter „mit aufnehmen“ (wie bei Verweisen) – ohne ihn gibt es kein Paket.
   */
  const tabelleInsPaket = (x: Record<string, unknown>, f: Feld, wo: string) => {
    const quelle = f.typ === 'tabelle' ? f.quelle : undefined;
    if (!quelle) return;
    const typ = ziel(quelle.typId, wo);
    const quelltyp = typById.get(quelle.typId);
    if (quelle.trefferliste && quelltyp && standardliste(quelltyp).key !== quelle.trefferliste) hinweis(t('meldungen.paketerstellung.tabelle-liste', { wo, name: quelltyp.name }));
    if (typ) x.quelle = ohneLeere({ typ, feld: quelle.feldKey, neu: quelle.neu });
  };

  // 3. Mappentypen
  const paketTypen = eigene.map((mappentyp) => {
    const wo = (was: string) => `„${mappentyp.name}“ → ${was}`;
    // „Übernommen aus“ (#1041) gehört zum Umbau dieser Installation – es kommt nicht ins Paket (wie Rechte-Regeln).
    const eigeneFelder = mappentyp.felder.filter((f) => !f.system && f.key !== UMBAU_FELD);
    for (const f of eigeneFelder.filter((x) => x.berechnetVon)) hinweis(t('meldungen.paketerstellung.berechnet-weg', { wo: wo(`Feld „${f.label}“`) }));
    const felder = eigeneFelder.map((f) => {
      // ausText (#534) gehört zu einem Update aus der Registry, nicht in ein selbst erstelltes Paket.
      // berechnetVon (#1034) gehört dem Paket mit Code, das den Typ mitbringt – ein selbst erstelltes Paket rechnet nichts.
      const { zielTypen, zielOptional, system: _s, auswahlFilter, frist, standard, ausText: _a, anzeigen, ...rest } = f as Feld;
      delete (rest as Partial<Feld>).berechnetVon;
      // Tabelle (#1030): die Quelle als Typverweis (tabelleInsPaket), nicht mit der Id dieser Installation.
      delete (rest as Partial<Feld>).quelle;
      const x: Record<string, unknown> = ohneLeere(rest as Record<string, unknown>);
      const az = anzeigeFuersPaket(anzeigen, wo(`Feld „${f.label}“`));
      if (az) x.anzeigen = az;
      if (f.typ === 'referenz') {
        // Mehrere Zieltypen (#1036): `ziel` einzeln oder als Liste. Optionale Ziele bleiben optional – auch die, die es hier
        // schon gibt; von ihnen soll das Paket nicht abhängen.
        const opt = new Set(zielOptional ?? []);
        const fest = (zielTypen ?? []).filter((id) => !opt.has(typById.get(id)?.schluessel ?? ''));
        const ziele = fest.map((id) => ziel(id, wo(`Feld „${f.label}“`))).filter((z): z is string => !!z);
        x.ziel = ziele.length > 1 ? ziele : ziele[0];
        if (opt.size) x.zielOptional = [...opt];
      } else delete x.verweisart;
      if (frist) x.frist = ohneLeere(frist as unknown as Record<string, unknown>);
      if (standard !== undefined && standard !== null && standard !== '') {
        if (kreisImStandard(standard)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Nummernkreis gehört nicht zum Paketformat. Das Feld kommt ohne Nummernkreis ins Paket; richte ihn beim Empfänger unter Werkbank → Nummernkreise ein und trage ihn am Feld ein.`);
        else if (mitId(standard)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Standardwert zeigt auf eine Mappe dieser Installation und kommt nicht ins Paket.`);
        else x.standard = standard;
      }
      if (auswahlFilter?.length) {
        if (mitId(auswahlFilter)) hinweis(`${wo(`Feld „${f.label}“`)}: Der Auswahlfilter nennt Mappen dieser Installation und kommt nicht ins Paket.`);
        else x.auswahlFilter = auswahlFilter;
      }
      tabelleInsPaket(x, f, wo(`Feld „${f.label}“`));
      vorbelegenInsPaket(x, f, mappentyp);
      if (x.ziel === undefined) delete x.ziel;
      // Zum Wiederfinden (#938): Ohne die Angabe leitet Ablago sie bei Feldern mit „Aus Dokument füllen“ ab – ein
      // ausdrückliches false hält fest, dass der Haken hier aus ist.
      if (f.erkennung && !f.wiederfinden && wiederfindenVorgabe(f)) x.wiederfinden = false;
      return x;
    });
    const register = mappentyp.register.map((r: Register) => {
      const quellen = r.quellen?.map((q) => ({ typ: ziel(q.typId, wo(`Register „${r.name}“`)), feld: q.feldKey })).filter((q): q is { typ: string; feld: string } => !!q.typ);
      // Abschnitte (#890) und Ausblenden (#655): wie eingestellt; ältere Ablago ignorieren beides.
      const abschnitte = r.art === 'felder' ? (r.abschnitte ?? []).filter((a) => felder.some((f) => f.key === a.vor)).map((a) => ohneLeere({ vor: a.vor, titel: a.titel, eingeklappt: a.eingeklappt, beschriftungen: a.beschriftungen, anzeigen: anzeigeFuersPaket(a.anzeigen, wo(`Abschnitt „${a.titel || a.vor}“`)) })) : [];
      return ohneLeere({ key: r.key, name: r.name, art: r.art, felder: r.art === 'felder' ? (r.felder ?? []).filter((k) => felder.some((f) => f.key === k)) : undefined, quellen, versionierung: r.versionierung, versionenBehalten: r.versionenBehalten, zeigt: r.art === 'protokoll' ? r.zeigt : undefined, beschriftungen: r.beschriftungen, abschnitte: abschnitte.length ? abschnitte : undefined, ausgeblendet: r.ausgeblendet });
    });
    // volltext: false ausdrücklich behalten (Standard ist ja); ohneLeere ließe es weg.
    mappentyp.register.forEach((r, i) => { if (r.volltext === false) (register[i] as Record<string, unknown>).volltext = false; });
    const liste = standardliste(mappentyp);
    if (trefferlistenVon(mappentyp).length > 1) hinweis(t('meldungen.paketerstellung.nur-die-standard-trefferliste', { name: mappentyp.name, name2: liste.name }));
    // Archivmodus (#1051) gehört seit DMS_ARCHIV_PAKET_AB zum Paketformat – als Vorgabe für den neuen Typ beim Empfänger.
    const weg = [mappentyp.berechtigungen ? 'Berechtigungen' : '', mappentyp.erstellenErlaubt === false || mappentyp.loeschenErlaubt === false ? t('meldungen.paketerstellung.anlegen-loeschen-gesperrt') : ''].filter(Boolean);
    if (weg.length) hinweis(t('meldungen.paketerstellung.gehoeren-nicht-zum-paketformat', { name: mappentyp.name, weg: weg.join(', ') }));
    const archiv = archivInsPaket(mappentyp.archiv, felder.map((f) => ({ key: String(f.key) })));
    if (mappentyp.archiv?.stichtag && !archiv?.stichtag) hinweis(t('meldungen.paketerstellung.archiv-ohne-stichtag', { name: mappentyp.name }));
    // Das Schema verlangt beschreibung und felder auch leer.
    return {
      schluessel: schluessel[mappentyp.id], name: mappentyp.name, beschreibung: mappentyp.beschreibung ?? '',
      ...ohneLeere({ titelVorlage: mappentyp.titelVorlage || undefined }), felder, register, ...ohneLeere({ trefferliste: liste.spalten.length ? liste.spalten : undefined }),
      // Beschriftungen je Sprache (#728) – an Feldern stecken sie schon in den Feldangaben.
      ...ohneLeere({ beschriftungen: mappentyp.beschriftungen }),
      // Dokument übernehmen (#937): nur, was eingestellt ist; ältere Ablago ignorieren es.
      ...(typeof mappentyp.ausPost === 'boolean' ? { ausPost: mappentyp.ausPost } : {}),
      ...ohneLeere({ erkennbarAn: mappentyp.erkennbarAn || undefined }),
      // Ist Teil einer anderen Mappe (#1031): wie im Entwurf Rechnungen die Kennung des Verweisfelds.
      ...(mappentyp.teilVon && felder.some((f) => f.key === mappentyp.teilVon) ? { gehoertZu: mappentyp.teilVon } : {}),
      // Archivmodus (#1051): Schreibweise der Registry; beim Empfänger nur für den neu angelegten Typ.
      ...(archiv ? { archiv } : {}),
    };
  });

  // 4. Ansichten
  const eigeneSichten: Sicht[] = [];
  for (const sid of new Set(e.sichten)) {
    const s = sichtById.get(sid);
    if (!s) { probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-ansicht-existiert')); continue; }
    const h = sichtPaket.get(s.id);
    if (h) ausPaket(t('meldungen.paketerstellung.die-ansicht'), s.name, h.p);
    else eigeneSichten.push(s);
  }
  const belegtS = new Set<string>();
  for (const s of eigeneSichten) {
    const alt = d.entwurf?.schluessel[s.id];
    if (alt && SCHLUESSEL.test(alt) && !belegtS.has(alt) && !Object.values(schluessel).includes(alt)) { belegtS.add(alt); schluessel[s.id] = alt; }
  }
  for (const s of eigeneSichten) if (!schluessel[s.id]) schluessel[s.id] = frei(s.name, SCHLUESSEL_MAX, belegtS);
  const fest = (w: WertAngabe | undefined): unknown => (!w ? undefined : w.art === 'fest' ? w.wert : w);
  let fremdeTypen = false;
  const paketSichten = eigeneSichten.map((s) => {
    let eltern: string | undefined;
    if (s.elternId) {
      const ep = sichtById.get(s.elternId);
      if (ep && schluessel[ep.id] && eigeneSichten.includes(ep)) eltern = schluessel[ep.id];
      else if (ep && sichtPaket.has(ep.id)) hinweis(t('meldungen.paketerstellung.ansicht-steht-unter-aus', { name: s.name, name2: ep.name }));
      else if (ep) {
        hinweis(t('meldungen.paketerstellung.ansicht-steht-unter-die', { name: s.name, name2: ep.name }));
        if (!fehlend.some((f) => f.id === ep.id)) fehlend.push({ art: 'sicht', id: ep.id, name: ep.name, grund: t('meldungen.paketerstellung.elternansicht-von', { name: s.name }), noetig: false });
      }
    }
    // Eigene, nicht gewählte Typen (#656): nur ein Hinweis – der Typ bleibt über seine Kennung in der Ansicht.
    const fremd: FremderTyp[] = [];
    const typen = s.typen.map((tid) => {
      if (tid === ALLE_TYPEN) return ALLE_TYPEN; // „*“ (#725): alle Mappentypen
      const eintrag = typById.get(tid);
      if (eintrag && !schluessel[tid] && !d.dmsTypen.has(tid) && !eintrag.system && !typPaket.has(tid)) {
        const frueher = (d.entwuerfe ?? []).find((x) => x.id !== id && x.schluessel[tid]);
        fremd.push({ kennung: frueher ? typKennung(frueher.id, frueher.schluessel[tid]) : eintrag.schluessel || frei(eintrag.name, SCHLUESSEL_MAX, new Set()), name: eintrag.name });
        hinweis(t('meldungen.paketerstellung.ansicht-zeigt-mappen-vom', { name: s.name, name2: eintrag.name }));
        if (!fehlend.some((f) => f.id === eintrag.id)) fehlend.push({ art: 'typ', id: eintrag.id, name: eintrag.name, grund: t('meldungen.paketerstellung.vorsicht-steckt-in-der', { name: s.name }), noetig: false });
        return null;
      }
      return ziel(tid, `Ansicht „${s.name}“`);
    }).filter((t): t is string => !!t);
    if (fremd.length) fremdeTypen = true;
    const bedingungen = s.bedingungen.flatMap((b: Bedingung): Array<{ feld: string; operator: string; wert?: unknown }> => {
      // Merkmal der Ablage (#1032): kennt das Paketformat der Ansichten (noch) nicht.
      if (b.art === 'merkmal') { hinweis(t('meldungen.paketerstellung.ansicht-merkmal', { name: s.name })); return []; }
      if (b.art !== 'feld') { hinweis(t('meldungen.paketerstellung.ansicht-bedingungen-auf-anzahlen', { name: s.name })); return []; }
      // „zeigt auf Mappe vom Typ …“ (#1036): Mappentypen als Typverweis statt Id.
      if (b.op === 'zeigtAufTyp') {
        const ids = b.wert?.art === 'fest' && Array.isArray(b.wert.wert) ? b.wert.wert : [];
        const typen = ids.map((id) => ziel(id, `Ansicht „${s.name}“`)).filter((x): x is string => !!x);
        return typen.length ? [{ feld: b.feld, operator: b.op, wert: typen }] : [];
      }
      const w = (b.op === 'zwischen' || b.op === 'ausserhalb') && b.bis ? [fest(b.wert), fest(b.bis)] : fest(b.wert);
      if (mitId(w)) { hinweis(t('meldungen.paketerstellung.ansicht-eine-bedingung-nennt', { name: s.name })); return []; }
      return [w === undefined ? { feld: b.feld, operator: b.op } : { feld: b.feld, operator: b.op, wert: w }];
    });
    if (s.trefferliste && s.trefferliste !== 'standard') hinweis(t('meldungen.paketerstellung.ansicht-zeigt-im-paket', { name: s.name }));
    if (s.berechtigungen) hinweis(t('meldungen.paketerstellung.ansicht-berechtigungen-an-der', { name: s.name }));
    return ohneLeere({ schluessel: schluessel[s.id], name: s.name, beschreibung: s.beschreibung || undefined, beschriftungen: s.beschriftungen, eltern, typen, fremde_typen: fremd, bedingungen, symbol: s.symbol || undefined });
  });
  // Elternansichten zuerst (liest sich besser; das DMS sortiert ohnehin).
  const sortiert: typeof paketSichten = [];
  const offen = [...paketSichten];
  while (offen.length) {
    const i = offen.findIndex((s) => !s.eltern || sortiert.some((x) => x.schluessel === s.eltern) || !offen.some((x) => x.schluessel === s.eltern));
    sortiert.push(...offen.splice(i < 0 ? 0 : i, 1));
  }

  // 5. Beispiele: nur ausdrücklich gewählte Mappen der eigenen Typen, ohne Passwörter und ohne Ids.
  const exportiert = new Map(eigene.map((t) => [t.id, t] as const));
  const bsp = d.mappen.filter((m) => exportiert.has(m.typId) && !m.systemKennung);
  if (d.mappen.length > bsp.length) hinweis(t('meldungen.paketerstellung.beispiel-mappen-gehen-nur'));
  const bspKey = new Map(bsp.map((m, i) => [m.id, `beispiel_${i + 1}`] as const));
  let beispielVerweise = false;
  let ohneZiel = 0;
  const beispiele = bsp.map((m) => {
    const t = exportiert.get(m.typId)!;
    const werte: Record<string, unknown> = {};
    for (const f of t.felder) {
      const w = m.werte[f.key];
      if (f.system || f.typ === 'passwort' || istLeer(w)) continue;
      if (f.typ === 'referenz') {
        const l = (Array.isArray(w) ? w : [w]).filter((x): x is string => typeof x === 'string');
        const z = l.filter((x) => bspKey.has(x)).map((x) => ({ beispiel: bspKey.get(x)! }));
        ohneZiel += l.length - z.length;
        if (z.length) { beispielVerweise = true; werte[f.key] = f.mehrfach ? z : z[0]; }
        continue;
      }
      if (f.typ === 'betrag' && w && typeof w === 'object' && 'betrag' in w) {
        const b = w as { betrag: unknown; waehrung?: string };
        werte[f.key] = (b.waehrung ?? 'EUR') === (f.waehrung || 'EUR') && typeof b.betrag === 'number' ? b.betrag : { betrag: b.betrag, waehrung: b.waehrung };
        continue;
      }
      if (mitId(w)) continue;
      werte[f.key] = w;
    }
    return { typ: schluessel[t.id], schluessel: bspKey.get(m.id)!, werte };
  });
  // Beispiel-Dokumente (#878): unter inhalt/beispiele/<beispiel>/; der Name in Ablago wird zum Titel.
  const dokDateien: Array<{ name: string; daten: Buffer }> = [];
  if (e.beispielDokumente) {
    for (const [i, m] of bsp.entries()) {
      const liste = d.dokumente?.get(m.id) ?? [];
      if (!liste.length) continue;
      const belegt = new Set<string>();
      const ordner = `beispiele/${beispiele[i].schluessel}`;
      (beispiele[i] as Record<string, unknown>).dokumente = liste.map((x) => {
        const endung = x.name.slice(x.name.lastIndexOf('.') + 1).toLowerCase();
        const art = beispielDateiart(`a.${endung}`, x.inhalt) ? endung : Object.entries(BEISPIEL_ENDUNGEN).find(([k]) => beispielDateiart(`a.${k}`, x.inhalt))![0];
        const stamm = x.name.slice(0, x.name.lastIndexOf('.') > 0 ? x.name.lastIndexOf('.') : undefined).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 80) || 'dokument';
        let datei = `${stamm}.${art}`;
        for (let n = 2; belegt.has(datei.toLowerCase()); n++) datei = `${stamm}-${n}.${art}`;
        belegt.add(datei.toLowerCase());
        dokDateien.push({ name: `inhalt/${ordner}/${datei}`, daten: x.inhalt });
        return { datei: `${ordner}/${datei}`, titel: x.name, datum: x.erstellt.slice(0, 10), register: x.registerKey };
      });
    }
    if (d.dokumenteZuGross) probleme.push(t('pakete.groesse.erstellenZuGross', { groesse: inMB(d.dokumenteZuGross), max: inMB(ARCHIV_MAX) }));
    if (dokDateien.length) hinweis(t('meldungen.paketerstellung.beispiel-dokumente-kommen-mit', { anzahl: dokDateien.length }));
    if (d.dokumenteAusgelassen) hinweis(t('meldungen.paketerstellung.beispiel-dokumente-ausgelassen', { anzahl: d.dokumenteAusgelassen }));
  }
  if (ohneZiel) hinweis(t('meldungen.paketerstellung.beispiel-mappen-verweise-zeigen', { anzahl: ohneZiel }));
  if (bsp.length) hinweis(e.beispielDokumente ? t('meldungen.paketerstellung.beispiel-mappen-aus-deiner-mit-dokumenten', { bsp: bsp.length }) : t('meldungen.paketerstellung.beispiel-mappen-aus-deiner', { bsp: bsp.length }));

  // 6. Wortlisten (#661): nur eigene Gruppen; aus Paketen nicht kopiert. Doppelte Wörter in einer Gruppe zusammengefasst.
  const wortlisten: Array<{ woerter: string[] }> = [];
  for (const wid of new Set(e.wortlisten ?? [])) {
    const g = (d.wortlisten ?? []).find((x) => x.id === wid);
    if (!g) { probleme.push(t('meldungen.paketerstellung.eine-gewaehlte-wortliste-gibt')); continue; }
    if (g.quelle !== 'werkbank') {
      const p = d.pakete.find((x) => x.id === g.quelle);
      if (p && abh[p.id]) hinweis(t('meldungen.paketerstellung.die-wortliste-kommt-ueber', { woerter: g.woerter.join(', '), name: p.name }));
      else hinweis(t('meldungen.paketerstellung.die-wortliste-gehoert-zum', { woerter: g.woerter.join(', '), wert: p?.name ?? g.quelle }));
      continue;
    }
    const w = liesWortgruppe(g.woerter).woerter;
    if (w.length >= 2) wortlisten.push({ woerter: w });
  }
  if (wortlisten.length > WORTLISTEN_MAX) probleme.push(t('meldungen.paketerstellung.wortlisten-hoechstens-gruppen', { WORTLISTEN_MAX }));
  if (wortlisten.length) hinweis(t('meldungen.paketerstellung.gruppen-gleichbedeutender-woerter', { anzahl: wortlisten.length }));

  if (!paketTypen.length && !paketSichten.length && !wortlisten.length) probleme.push(t('meldungen.paketerstellung.waehle-mindestens-einen-eigenen'));
  // Nötige Ablago-Version (#651): Mindestversion aus den benutzten Funktionen, Angabe aus der Auswahl.
  const genutzt: MindestFunktion[] = [];
  if (dmsVerweise) genutzt.push('dmsVerweise');
  if (beispielVerweise) genutzt.push('beispielVerweise');
  if (dokDateien.length) genutzt.push('beispielDokumente');
  if (fremdeTypen) genutzt.push('fremdeTypen');
  if (wortlisten.length) genutzt.push('wortlisten');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => 'erkennung' in f))) genutzt.push('erkennung');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => 'format' in f || 'landFeld' in f || (f.typ === 'datum' && ('min' in f || 'max' in f))))) genutzt.push('feldformate');
  // Zeitraum, Prozent und negative Beträge (#1035): Ältere Ablago machten aus unbekannten Feldarten Text.
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'zeitraum' || f.typ === 'prozent' || f.negativ === true))) genutzt.push('feldarten');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'tabelle'))) genutzt.push('tabelle');
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => Array.isArray(f.vorbelegen) && f.vorbelegen.length))) genutzt.push('vorbelegen');
  if (paketTypen.some((t) => 'gehoertZu' in t)) genutzt.push('teile');
  if (paketTypen.some((t) => 'archiv' in t)) genutzt.push('archiv');
  // Eigene Organisation (#995): Merkmal, Schreibschutz oder die Anzeige-Bedingung „zeigt auf eine eigene Organisation“.
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.merkmal || f.schreibschutz)) || JSON.stringify(paketTypen).includes('"art":"eigeneOrganisation"')) genutzt.push('organisation');
  // Zusammengesetzt (#1050): Ältere Ablago lehnen die unbekannte Feldart ab.
  if (paketTypen.some((t) => (t.felder as Array<Record<string, unknown>>).some((f) => f.typ === 'zusammengesetzt'))) genutzt.push('zusammengesetzt');
  // Anzeige-Bedingung „zeigt auf die Vorgabe …“ (#1038): Ältere Ablago ließen sie weg (Feld immer zu sehen).
  if (JSON.stringify(paketTypen).includes('"art":"vorgabe"')) genutzt.push('vorgaben');
  const mindest = mindestversion(genutzt);
  const optionen = dmsOptionen(mindest.version, d.dmsVersion);
  const unten = untergrenze(dms);
  if (!dms) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-auswaehlen'));
  else if (!BEREICH.test(dms) || !unten) probleme.push(t('meldungen.paketerstellung.ablago-version-z-b'));
  else if (vergleicheVersion(unten, mindest.version) < 0) probleme.push(t('meldungen.paketerstellung.ablago-version-das-paket', { wert: mindest.gruende.join(', ') || t('meldungen.paketerstellung.funktionen'), version: mindest.version }));
  else if (!e.vonHand && !DMS_ANGABE.test(dms)) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-eine'));
  else if (!e.vonHand && !optionen.includes(dms)) probleme.push(t('meldungen.paketerstellung.ablago-version-gibt-es', { dms, version: mindest.version }));
  const felderJetzt: Record<string, string[]> = Object.fromEntries(eigene.map((t) => [t.id, t.felder.filter((f) => !f.system).map((f) => f.key)]));
  const namen = new Map<string, string>([...d.typen.map((t) => [t.id, t.name] as const), ...d.sichten.map((s) => [s.id, s.name] as const)]);
  const ea = erkenneArt(e, d.entwurf, felderJetzt, namen);
  const versionLage: VersionsLage = { bekannt, art: ea.art, artGrund: ea.grund, mindest: mindest.version, gruende: mindest.gruende, dmsOptionen: optionen };
  const fehlt = fehlend.filter((f) => f.noetig);
  if (fehlt.length) probleme.push(t('meldungen.paketerstellung.es-wird-auf-mappentypen', { map: fehlt.map((f) => `„${f.name}“`).join(', ') }));

  const inhalt: Bau['inhalt'] = {
    typen: paketTypen.map((t) => ({ schluessel: String(t.schluessel), name: String(t.name) })),
    sichten: sortiert.map((s) => ({ schluessel: String(s.schluessel), name: String(s.name), eltern: (s.eltern as string | undefined) ?? null })),
    beispiele: beispiele.length,
    ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}),
    ...(dokDateien.length ? { beispielDokumente: dokDateien.length } : {}),
  };
  if (probleme.length) return { probleme, fehlend, hinweise, abhaengigkeiten: abh, inhalt, schluessel, dateien: [], version: versionLage, felder: felderJetzt, lizenz };

  // 6. Dateien
  const y = (v: unknown) => Buffer.from(stringify(v, { version: '1.1', lineWidth: 0 }));
  const manifest = {
    schema: 1, id, name, version, beschreibung, autor, lizenz, dms, abhaengigkeiten: abh,
    inhalt: { mappentypen: 'inhalt/mappentypen.yaml', sichten: 'inhalt/sichten.yaml', ...(beispiele.length ? { beispiele: 'inhalt/beispiele.yaml' } : {}), ...(wortlisten.length ? { wortlisten: 'inhalt/wortlisten.yaml' } : {}) },
  };
  const datum = d.jetzt.toISOString().slice(0, 10);
  const text = aenderungsText(e, d.entwurf);
  const verlauf = (d.entwurf ? [{ version: d.entwurf.version, datum: d.entwurf.exportiert.slice(0, 10), text: d.entwurf.aenderungen || t('meldungen.paketerstellung.aus-ablago-exportiert') }, ...d.entwurf.verlauf] : [])
    .filter((v) => vergleicheVersion(v.version, version) < 0);
  const changelog = ['# Änderungen', '', `## ${version}`, '', ...text.split('\n').map((z) => (z.trim().startsWith('-') ? z : `- ${z}`)).filter((z) => z.trim() !== '-'),
    ...verlauf.flatMap((v) => ['', `## ${v.version}`, '', ...v.text.split('\n').map((z) => (z.trim().startsWith('-') ? z : `- ${z}`)).filter((z) => z.trim() !== '-')]), ''].join('\n');
  const typName = new Map(paketTypen.map((t) => [String(t.schluessel), String(t.name)] as const));
  const readme = [
    `# ${name}`, '', beschreibung, '', '## Inhalt', '',
    ...(paketTypen.length ? ['| Mappentyp | Felder |', '| --- | --- |', ...paketTypen.map((t) => `| ${zelle(String(t.name))} | ${zelle((t.felder as Array<{ label: string }>).map((f) => f.label).join(', ') || '–')} |`), ''] : []),
    ...(sortiert.length ? [`**Ansichten:** ${sortiert.map((s) => (s.eltern ? `${sortiert.find((x) => x.schluessel === s.eltern)?.name} → ${s.name}` : s.name)).join(', ')}`, ''] : []),
    ...(wortlisten.length ? [`**Wortlisten:** ${t('meldungen.paketerstellung.gruppen', { anzahl: wortlisten.length })} gleichbedeutender Wörter für die Suche`, ''] : []),
    ...(beispiele.length ? [`**Beispiele:** ${beispiele.length} Beispiel-Mappen (${[...new Set(beispiele.map((b) => typName.get(b.typ)))].join(', ')})${dokDateien.length ? t('meldungen.paketerstellung.mit-beispiel-dokumenten', { anzahl: dokDateien.length }) : ''}, auf Wunsch bei der Installation.`, ''] : []),
    '## Voraussetzungen', '', `- Ablago ${dms}`,
    ...(Object.keys(abh).length ? Object.entries(abh).map(([k, v]) => `- Paket \`${k}\` ${v}`) : [t('meldungen.paketerstellung.keine-weiteren-pakete')]), '',
    '## Rechte und Netzwerkzugriff', '', t('meldungen.paketerstellung.dieses-paket-enthaelt-keinen'), '',
    '## Lizenz', '', art === 'frei' ? t('meldungen.paketerstellung.der-volle-text-steht', { lizenz }) : art === 'eigen' ? t('meldungen.paketerstellung.der-volle-text-steht-2', { wert: (e.lizenzName ?? '').trim() }) : t('meldungen.paketerstellung.keine-lizenz-angegeben-alle'), '',
    '## Herkunft', '', t('meldungen.paketerstellung.erstellt-mit-paket-erstellen', { datum, wert: autor.name ? ` von ${autor.name}` : '' }), '',
  ].join('\n');
  const jahr = String(d.jetzt.getFullYear());
  const lizenzDatei = art === 'frei' ? (LIZENZTEXTE[lizenz] ?? '').replace('{jahr}', jahr).replace('{name}', autor.name)
    : art === 'eigen' ? `${(e.lizenzText ?? '').replace(/\r\n/g, '\n').trim()}\n`
    : t('meldungen.paketerstellung.copyright-c-fuer-dieses', { jahr, name: autor.name });
  const erwartung = { mappentypen: inhalt.typen.map((t) => t.schluessel), sichten: inhalt.sichten.map((s) => s.schluessel), beispiele: beispiele.length, ...(wortlisten.length ? { wortlisten: wortlisten.length } : {}) };
  const dateien = [
    { name: 'manifest.yaml', daten: Buffer.from(`# Erstellt mit „Paket erstellen“ in Ablago. Format: https://github.com/motom001/dms-registry\n${stringify(manifest, { version: '1.1', lineWidth: 0 })}`) },
    { name: 'inhalt/mappentypen.yaml', daten: y(paketTypen) },
    { name: 'inhalt/sichten.yaml', daten: y(sortiert) },
    ...(beispiele.length ? [{ name: 'inhalt/beispiele.yaml', daten: y(beispiele) }] : []),
    ...dokDateien,
    ...(wortlisten.length ? [{ name: 'inhalt/wortlisten.yaml', daten: y(wortlisten) }] : []),
    { name: 'README.md', daten: Buffer.from(readme) },
    { name: 'CHANGELOG.md', daten: Buffer.from(changelog) },
    { name: 'LICENSE', daten: Buffer.from(lizenzDatei) },
    { name: 'tests/erwartung.yaml', daten: y(erwartung) },
  ];
  return { probleme, fehlend, hinweise, abhaengigkeiten: abh, inhalt, schluessel, dateien, version: versionLage, felder: felderJetzt, lizenz };
}

/** Eintrag im CHANGELOG für diese Version; ohne Angabe ein Standardtext. */
const aenderungsText = (e: PaketErstellenEingabe, entwurf: PaketEntwurf | null) => e.aenderungen.trim() || (entwurf ? t('meldungen.paketerstellung.neue-version-aus-ablago') : t('meldungen.paketerstellung.erste-fassung'));

/** Eingabe aus der Anfrage vereinheitlichen. */
export function liesEingabe(x: unknown): PaketErstellenEingabe {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const t = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))].slice(0, max) : []);
  const a = (o.autor && typeof o.autor === 'object' ? o.autor : {}) as Record<string, unknown>;
  return {
    typen: ids(o.typen, 500), sichten: ids(o.sichten, 500), beispiele: ids(o.beispiele, 100), wortlisten: ids(o.wortlisten, 1000),
    id: t(o.id, 40), name: t(o.name, 200), version: t(o.version, 40), beschreibung: t(o.beschreibung, 1000),
    autor: { name: t(a.name, 200), github: t(a.github, 100) }, lizenz: t(o.lizenz, 40), dms: t(o.dms, 60), aenderungen: t(o.aenderungen, 2000),
    lizenzArt: o.lizenzArt === 'eigen' || o.lizenzArt === 'keine' ? o.lizenzArt : 'frei',
    ...(typeof o.lizenzName === 'string' ? { lizenzName: t(o.lizenzName, 200) } : {}),
    ...(typeof o.lizenzText === 'string' ? { lizenzText: o.lizenzText.slice(0, LIZENZTEXT_MAX + 1) } : {}),
    ...(typeof o.bekannteVersion === 'string' && VERSION.test(o.bekannteVersion) ? { bekannteVersion: o.bekannteVersion } : {}),
    ...(o.vonHand === true ? { vonHand: true } : {}),
    ...(o.beispielDokumente === true ? { beispielDokumente: true } : {}),
  };
}

/**
 * Weicht ein Typ aus einem Paket von dessen Stand ab (#653)? Mit gespeichertem Paketstand inhaltlich (Speichern ohne
 * Änderung zählt nicht), sonst – bei älteren Installationen – wie bisher nach der Zeit, ohne Einzelheiten.
 */
export function aenderung(t: Mappentyp, p: InstalliertesPaket, kennungVon?: (typId: string) => string | undefined): { geaendert: boolean; unterschiede: TypUnterschiede | null } {
  const stand = p.typStand?.[t.id];
  if (stand) { const u = typUnterschiede(stand, typBild(t, kennungVon)); return { geaendert: !!u, unterschiede: u }; }
  return { geaendert: t.geaendert > (p.aktualisiert ?? p.installiert), unterschiede: null };
}

/** Paket erstellen im DMS: Stand, Prüfung, Export; gemerkt werden die Angaben (Einstellung). */
export class Paketerstellung {
  constructor(private d: Dienst, private o: { version: () => string }) {}

  private async dmsTypen(): Promise<Map<string, string>> {
    const s = await this.d.kern.system();
    // Den Ablageort von Basis behandelt die Erstellung wie jeden Paket-Typ; den früheren des Kerns gibt es nur noch hier (#883).
    const a = await this.d.kern.frueherAblageortTyp();
    return new Map<string, string>([[s.benutzer.id, 'benutzer'], [s.rolle.id, 'rolle'], ...(a ? [[a.id, 'ablageort'] as [string, string]] : [])]);
  }


  /** Was es zur Auswahl gibt, gemerkte Entwürfe und Vorschläge für den nächsten Export. */
  async stand(): Promise<ErstellenStand> {
    const [typen, sichten, pakete, dmsTypen, entwuerfe] = [await this.d.mappentypen.listeTypen(), await this.d.listeSichten(), await this.d.kern.repo.listePakete(), await this.dmsTypen(), await paketEntwuerfe(this.d.kern)];
    const herkunft = (map: (p: InstalliertesPaket) => Record<string, string>, id: string) => {
      const p = pakete.find((x) => Object.values(map(x)).includes(id));
      return p ? { id: p.id, name: p.name, version: p.version } : null;
    };
    // Nötige Ablago-Version bleibt leer: Die Oberfläche setzt die ermittelte Mindestversion aus der Prüfung (#651).
    const leer: PaketErstellenEingabe = { typen: [], sichten: [], beispiele: [], wortlisten: [], id: '', name: '', version: '1.0.0', beschreibung: '', autor: { name: '', github: '' }, lizenz: LIZENZ_VORGABE, lizenzArt: 'frei', dms: '', aenderungen: '' };
    return {
      typen: typen.filter((t) => !t.system && !dmsTypen.has(t.id)).map((t) => {
        const p = pakete.find((x) => Object.values(x.typen).includes(t.id));
        const a = p ? aenderung(t, p, (id) => typen.find((x) => x.id === id)?.schluessel) : { geaendert: false, unterschiede: null };
        return { id: t.id, name: t.name, beschreibung: t.beschreibung ?? '', paket: herkunft((x) => x.typen, t.id), geaendert: a.geaendert, ...(a.geaendert ? { unterschiede: a.unterschiede } : {}) };
      }).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      sichten: sichten.map((s) => ({ id: s.id, name: s.name, elternId: s.elternId ?? null, paket: herkunft((x) => x.sichten, s.id) })),
      wortlisten: (await this.d.suche.sucheStand()).synonyme.map((g) => ({ id: g.id, woerter: g.woerter, paket: g.quelle === 'werkbank' ? null : { id: g.quelle, name: g.paketName ?? g.quelle } })),
      entwuerfe,
      dms: this.o.version(),
      // #652: nie ungefragt vorbelegen – „Neue Version von …“ wählt man im ersten Schritt.
      vorschlag: leer,
    };
  }

  /** Angaben eines gemerkten Entwurfs mit höherer Version und aktueller DMS-Version. */
  ausEntwurf(e: PaketEntwurf): PaketErstellenEingabe {
    return {
      typen: e.typen, sichten: e.sichten, beispiele: e.beispiele, wortlisten: e.wortlisten ?? [], ...(e.beispielDokumente ? { beispielDokumente: true } : {}), id: e.id, name: e.name, version: naechsteVersion(e.version), beschreibung: e.beschreibung, autor: e.autor,
      lizenz: e.lizenz, lizenzArt: e.lizenzArt ?? 'frei', ...(e.lizenzName ? { lizenzName: e.lizenzName } : {}), ...(e.lizenzText ? { lizenzText: e.lizenzText } : {}), dms: '', aenderungen: '',
    };
  }

  private async daten(e: PaketErstellenEingabe): Promise<ErstellenDaten> {
    const typen = await this.d.mappentypen.listeTypen();
    const gewaehlt = new Set(e.beispiele);
    const mappen = gewaehlt.size ? (await Promise.all(e.typen.filter((t) => typen.some((x) => x.id === t)).map((t) => this.d.mappen.listeMappen(t)))).flat().filter((m) => gewaehlt.has(m.id)) : [];
    // Beispiel-Dokumente (#878): nur PDF, PNG und JPEG; zusammen höchstens so viel, wie ins Archiv passt.
    const dokumente = new Map<string, Array<{ name: string; registerKey: string; erstellt: string; inhalt: Buffer }>>();
    let ausgelassen = 0, summe = 0;
    if (e.beispielDokumente) {
      for (const m of mappen) {
        for (const x of await this.d.listeDokumente(m.id)) {
          if (!['application/pdf', 'image/png', 'image/jpeg'].includes(x.mime)) { ausgelassen++; continue; }
          summe += x.groesse;
          if (summe > ARCHIV_MAX) continue;
          const roh = (await this.d.dokumentInhalt(x.id)).inhalt;
          const inhalt = Buffer.isBuffer(roh) ? roh : await alsPuffer(roh);
          if (!beispielDateiart(x.mime === 'application/pdf' ? 'a.pdf' : x.mime === 'image/png' ? 'a.png' : 'a.jpg', inhalt)) { ausgelassen++; continue; }
          dokumente.set(m.id, [...(dokumente.get(m.id) ?? []), { name: x.name, registerKey: x.registerKey, erstellt: x.erstellt, inhalt }]);
        }
      }
    }
    // Vorgaben (#1038), auf die Anzeige-Bedingungen „zeigt auf“ zeigen: Id → feste Kennung.
    const gezeigt = [...new Set(typen.flatMap((x) => [...x.felder.map((f) => f.anzeigen), ...x.register.flatMap((r) => (r.abschnitte ?? []).map((a) => a.anzeigen))])
      .flatMap((r) => r?.bedingungen ?? []).flatMap((b) => (b.art === 'feld' && b.bedingung.op === 'zeigtAuf' && b.bedingung.wert?.art === 'fest' && Array.isArray(b.bedingung.wert.wert) ? b.bedingung.wert.wert.map(String) : [])))];
    const vorgaben = new Map((gezeigt.length ? await this.d.kern.repo.holeMappen(gezeigt) : []).filter((m) => m.vorgabe).map((m) => [m.id, m.vorgabe!] as const));
    return {
      dokumente, dokumenteAusgelassen: ausgelassen, ...(summe > ARCHIV_MAX ? { dokumenteZuGross: summe } : {}), vorgaben,
      typen, sichten: await this.d.listeSichten(), pakete: await this.d.kern.repo.listePakete(), dmsTypen: await this.dmsTypen(), mappen, wortlisten: (await this.d.suche.sucheStand()).synonyme,
      dmsVersion: this.o.version(), entwurf: (await paketEntwuerfe(this.d.kern)).find((x) => x.id === e.id.trim()) ?? null, entwuerfe: await paketEntwuerfe(this.d.kern), jetzt: new Date(),
    };
  }

  /** Baut das Paket und prüft das Archiv wie beim Hochladen. */
  private async baueUndPruefe(e: PaketErstellenEingabe): Promise<{ bau: Bau; zip: Buffer | null; daten: ErstellenDaten }> {
    const daten = await this.daten(e);
    const bau = baue(e, daten);
    if (bau.probleme.length) return { bau, zip: null, daten };
    const id = e.id.trim();
    const zip = zipPuffer(bau.dateien.map((f) => ({ name: `${id}/${f.name}`, daten: f.daten })), daten.jetzt);
    if (zip.length > ARCHIV_MAX) { bau.probleme.push(t('pakete.groesse.erstellenZuGross', { groesse: inMB(zip.length), max: inMB(ARCHIV_MAX) })); return { bau, zip: null, daten }; }
    try {
      const p = liesPaket(liesZip(zip));
      if (p.manifest.id !== id || p.typen.length !== bau.inhalt.typen.length || p.sichten.length !== bau.inhalt.sichten.length) throw new Error('Inhalt weicht ab.');
    } catch (x) {
      const g = (x as Fachfehler).details as { gruende?: string[] } | undefined;
      bau.probleme.push(t('meldungen.paketerstellung.die-pruefung-wie-beim', { message: (x as Error).message, wert: g?.gruende ? ` ${g.gruende.join(' ')}` : '' }));
      return { bau, zip: null, daten };
    }
    return { bau, zip, daten };
  }

  /** Automatische Prüfung mit Hinweisen und den Mappen, aus denen Beispiele gewählt werden können. */
  async pruefe(eingabe: unknown): Promise<PaketPruefung> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    const eigene = daten.typen.filter((t) => e.typen.includes(t.id) && !t.system && !daten.dmsTypen.has(t.id) && !daten.pakete.some((p) => Object.values(p.typen).includes(t.id)));
    const beispielMappen = await Promise.all(eigene.map(async (mappentyp) => {
      const alle = (await this.d.mappen.listeMappen(mappentyp.id)).filter((m) => !m.systemKennung).sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
      return { typId: mappentyp.id, typ: mappentyp.name, mappen: alle.slice(0, BEISPIELMAPPEN_MAX).map((m) => ({ id: m.id, titel: m.titel || t('meldungen.paketerstellung.ohne-titel'), demo: !!m.demo })), mehr: alle.length > BEISPIELMAPPEN_MAX };
    }));
    return {
      probleme: bau.probleme, fehlend: bau.fehlend.map(({ noetig: _n, ...f }) => f), hinweise: bau.hinweise, abhaengigkeiten: bau.abhaengigkeiten,
      inhalt: bau.inhalt, beispielMappen, einspielbar: !!zip, datei: zip ? { name: `${e.id.trim()}-${e.version.trim()}.zip`, bytes: zip.length } : null,
      version: bau.version,
    };
  }

  /**
   * „Letzte Version des Pakets hochladen“ (#651): Ablago kennt die zuletzt weitergegebene Version nicht
   * (z. B. auf einem anderen Gerät erstellt). Liest nur Id, Name und Version aus dem Archiv; installiert nichts.
   */
  liesLetzteVersion(daten: unknown): { id: string; name: string; version: string } {
    if (!Buffer.isBuffer(daten) || !daten.length) throw new Fachfehler(422, t('meldungen.paketerstellung.bitte-die-zip-datei'));
    if (daten.length > ARCHIV_MAX) throw new Fachfehler(422, t('pakete.groesse.erstellenZuGross', { groesse: inMB(daten.length), max: inMB(ARCHIV_MAX) }));
    const m = liesPaket(liesZip(daten)).manifest;
    return { id: m.id, name: m.name, version: m.version };
  }

  private async archive(id: string): Promise<GemerktesArchiv[]> {
    const v = await paketArchive(this.d.kern, id);
    return Array.isArray(v) ? v.filter((x): x is GemerktesArchiv => !!x && typeof x.version === 'string' && typeof x.zip === 'string') : [];
  }

  /** Selbst erstellte Pakete für die Paketverwaltung (#652), zuletzt erstellte zuerst. */
  async selbstErstellt(): Promise<SelbstErstellt[]> {
    const liste = [...await paketEntwuerfe(this.d.kern)].sort((a, b) => b.exportiert.localeCompare(a.exportiert));
    return Promise.all(liste.map(async (e) => this.kurz(e, await this.archive(e.id))));
  }
  private kurz(e: PaketEntwurf, archive: GemerktesArchiv[]): SelbstErstellt {
    return {
      id: e.id, name: e.name, version: e.version, erstellt: e.exportiert, von: e.von, lizenz: e.lizenz,
      versionen: archive.map((a) => ({ version: a.version, erstellt: a.erstellt, bytes: Math.floor((a.zip.length * 3) / 4) })),
    };
  }

  /** Was damals erstellt wurde und was sich seitdem geändert hat (#652). */
  async selbstErstelltDetail(id: string): Promise<SelbstErstelltDetail> {
    const e = (await paketEntwuerfe(this.d.kern)).find((x) => x.id === id);
    if (!e) throw new Fachfehler(404, t('meldungen.paketerstellung.dieses-selbst-erstellte-paket'));
    const [typen, sichten] = [await this.d.mappentypen.listeTypen(), await this.d.listeSichten()];
    return {
      ...this.kurz(e, await this.archive(id)), beschreibung: e.beschreibung, dms: e.dms, autor: e.autor, aenderungen: e.aenderungen, verlauf: e.verlauf,
      typen: e.typen.map((tid) => { const t = typen.find((x) => x.id === tid); return { id: tid, name: t?.name ?? null, geaendert: !!t && t.geaendert > e.exportiert }; }),
      sichten: e.sichten.map((sid) => ({ id: sid, name: sichten.find((x) => x.id === sid)?.name ?? null })),
      beispiele: e.beispiele.length,
    };
  }

  /** Eine erstellte Version noch einmal als ZIP (#652) – genau so, wie sie erstellt wurde. */
  async archiv(id: string, version: string): Promise<{ name: string; daten: Buffer }> {
    const a = (await this.archive(id)).find((x) => x.version === version);
    if (!a) throw new Fachfehler(404, t('meldungen.paketerstellung.version-von-ist-nicht', { version, id }));
    return { name: `${id}-${version}.zip`, daten: Buffer.from(a.zip, 'base64') };
  }

  /** „Aus der Liste nehmen“ (#652): vergisst Entwurf und gemerkte Archive – Mappentypen und Ansichten bleiben. */
  async ausListeNehmen(id: string, von: Handelnder): Promise<SelbstErstellt[]> {
    const alle = await paketEntwuerfe(this.d.kern);
    if (!alle.some((x) => x.id === id)) throw new Fachfehler(404, t('meldungen.paketerstellung.dieses-selbst-erstellte-paket'));
    await setzePaketEntwuerfe(this.d.kern, alle.filter((x) => x.id !== id));
    await setzePaketArchive(this.d.kern, id, null);
    log.info('Selbst erstelltes Paket aus der Liste genommen', { von: von.email, paket: id });
    return this.selbstErstellt();
  }

  /**
   * „Paket erstellen“ (#652): erstellt das Paket – es erscheint unter „Installiert“ als selbst erstellt –,
   * merkt die Angaben für die nächste Version und das Archiv zum späteren Herunterladen.
   */
  async erstelle(eingabe: unknown, von: Handelnder): Promise<SelbstErstellt & { name: string; datei: string; bytes: number }> {
    const r = await this.exportiere(eingabe, von);
    const e = (await paketEntwuerfe(this.d.kern)).find((x) => r.name.startsWith(`${x.id}-`))!;
    return { ...this.kurz(e, await this.archive(e.id)), datei: r.name, bytes: r.daten.length };
  }

  /** Export als .zip: nur, wenn die Prüfung bestanden ist; merkt die Angaben für den nächsten Export. */
  async exportiere(eingabe: unknown, von: Handelnder): Promise<{ name: string; daten: Buffer }> {
    const e = liesEingabe(eingabe);
    const { bau, zip, daten } = await this.baueUndPruefe(e);
    if (!zip) throw new Fachfehler(422, t('meldungen.paketerstellung.das-paket-laesst-sich'), { gruende: bau.probleme });
    const id = e.id.trim();
    const entwurf: PaketEntwurf = {
      ...e, id, version: e.version.trim(), aenderungen: aenderungsText(e, daten.entwurf), felder: { ...(daten.entwurf?.felder ?? {}), ...bau.felder },
      schluessel: { ...(daten.entwurf?.schluessel ?? {}), ...bau.schluessel },
      verlauf: daten.entwurf ? [{ version: daten.entwurf.version, datum: daten.entwurf.exportiert.slice(0, 10), text: daten.entwurf.aenderungen || t('meldungen.paketerstellung.aus-ablago-exportiert') }, ...daten.entwurf.verlauf].filter((v) => vergleicheVersion(v.version, e.version.trim()) < 0).slice(0, 50) : [],
      exportiert: daten.jetzt.toISOString(), von: von.email,
    };
    const rest = (await paketEntwuerfe(this.d.kern)).filter((x) => x.id !== id);
    await setzePaketEntwuerfe(this.d.kern, [entwurf, ...rest].slice(0, ENTWUERFE_MAX));
    // Archiv merken (#652), damit „Als ZIP herunterladen“ später genau diese Version liefert.
    if (zip.length <= ARCHIV_MERKEN_MAX) {
      const alt = (await this.archive(id)).filter((a) => a.version !== entwurf.version);
      await setzePaketArchive(this.d.kern, id, [{ version: entwurf.version, erstellt: entwurf.exportiert, zip: zip.toString('base64') }, ...alt].slice(0, ARCHIVE_JE_PAKET));
    }
    for (const weg of rest.length + 1 > ENTWUERFE_MAX ? rest.slice(ENTWUERFE_MAX - 1) : []) await setzePaketArchive(this.d.kern, weg.id, null);
    log.info('Paket erstellt', { von: von.email, paket: id, version: entwurf.version, typen: bau.inhalt.typen.length, sichten: bau.inhalt.sichten.length, beispiele: bau.inhalt.beispiele, abhaengigkeiten: Object.keys(bau.abhaengigkeiten) });
    return { name: `${id}-${entwurf.version}.zip`, daten: zip };
  }
}
