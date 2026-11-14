/**
 * Ablago entdecken (#831, #832): Rundgänge und Tipps – reine Regeln für Server, Oberfläche und Tests.
 *
 * Rundgänge und Tipps sind **Daten, kein Code**. Ablagos eigene stehen in `shared/entdecken/rundgaenge.yaml` und
 * `shared/entdecken/tipps.yaml`, im selben Format, das Pakete später als `inhalt/rundgaenge.yaml` und
 * `inhalt/tipps.yaml` mitbringen (Stufe 2, dms-registry #132). Es gibt einen Mechanismus für alle: Eine Quelle
 * (Ablago oder ein Paket) liefert rohe Einträge, `pruefeRundgaenge` und `pruefeTipps` prüfen sie und machen daraus
 * dieselben Objekte. Ein Paket fügt später nur eine Quelle hinzu.
 *
 * Ziele sind feste **Ankerpunkte** (`shared/entdecken/anker.yaml`), keine beliebigen HTML-Ids: In der Oberfläche
 * trägt das Element das Attribut `data-anker="<anker>"`. Ein Test prüft, dass jeder dokumentierte Anker im Quelltext
 * vorkommt, damit Umbauten Rundgänge nicht still zerbrechen.
 *
 * Texte: Ablagos eigene stehen in den Sprachdateien (`entdecken.json`, Deutsch und Englisch) unter festen Schlüsseln
 * (`textSchluessel…`). Pakete schreiben sie später direkt in die YAML-Datei (`titel`, `text` …); fehlt ein Text
 * dort, gilt der aus der Sprachdatei. Fehlt beides, ist der Eintrag fehlerhaft.
 */
import { vergleicheVersion } from './pakete';

/** Höchstens so viele Schritte hat ein Rundgang, so lang ist ein Text darin (Zeichen). */
export const RUNDGANG_SCHRITTE_MAX = 8;
export const RUNDGANG_TEXT_MAX = 200;
/** Höchstens so lang ist ein Tipp (Zeichen); höchstens so viele bringt eine Quelle mit. */
export const TIPP_TEXT_MAX = 160;
export const TIPPS_MAX = 20;
/** Ablagos eigene Quelle darf mehr Tipps haben als ein Paket. */
export const TIPPS_MAX_ABLAGO = 40;
/** Titel eines Rundgangs oder Schritts (Zeichen). */
export const TITEL_MAX = 60;

/** Schlüssel von Rundgängen, Schritten und Tipps: klein, Ziffern, Unterstrich. */
export const SCHLUESSEL = /^[a-z][a-z0-9_]{0,39}$/;

/** Wer etwas sieht: `lesen` = alle, `verwalten` = Personen mit Verwaltungsrecht (#818). */
export const FUER = ['lesen', 'verwalten'] as const;
export type Fuer = (typeof FUER)[number];
/**
 * Wann ein Rundgang von selbst startet. `erste_anmeldung` gibt es nur für Ablagos eigenen Rundgang. Pakete kommen mit
 * `nach_installation` und `nach_update` (Stufe 2) – sie starten nie von selbst, sondern werden als Tipp angeboten.
 */
export const RUNDGANG_START = ['manuell', 'erste_anmeldung'] as const;
export type RundgangStart = (typeof RUNDGANG_START)[number];
/** Bereiche, nach denen „Ablago entdecken“ die Tipps gruppiert (Reihenfolge der Seite). */
export const TIPP_BEREICHE = ['suche', 'post', 'fristen', 'mappen', 'konto', 'verwalten'] as const;
export type TippBereich = (typeof TIPP_BEREICHE)[number];
/** Funktionen, die eingeschaltet sein müssen, damit ein Tipp passt. */
export const FUNKTIONEN = ['fragen', 'laufwerk', 'mail'] as const;
export type Funktion = (typeof FUNKTIONEN)[number];
/** Seiten, die ein Rundgang vor dem ersten Schritt öffnen kann (`oeffne: { seite }`). */
export const OEFFNE_SEITEN = { start: '/ablage/start' } as const;
export type OeffneSeite = keyof typeof OEFFNE_SEITEN;
/** Eingebaute Grafiken für einen Schritt (`bild`). */
export const BILDER = ['dreiteilung'] as const;
export type Bild = (typeof BILDER)[number];

/** Herkunft eines Eintrags: `ablago` oder `paket:<id>` (Stufe 2). */
export type Herkunft = 'ablago' | `paket:${string}`;

/** Ein Ankerpunkt aus `anker.yaml`. `muster`: mit Platzhalter, z. B. `mappe.register:<key>`. */
export interface Anker {
  anker: string;
  /** Seite, auf der der Anker sicher vorkommt (Ziel eines Tipps); Muster haben keine. */
  seite?: string;
  beschreibung: string;
  /** Auch auf dem Handy sichtbar. */
  handy: boolean;
  /** Gibt es so auch in Clients (spätere App) – Tipps dazu eignen sich für Clients. */
  clients: boolean;
  muster: boolean;
}

export interface RundgangSchritt {
  schluessel: string;
  /** Anker in der Reihenfolge der Wahl: Der erste, der sichtbar ist, gilt. Leer = Schritt in der Mitte. */
  ziel: string[];
  bild?: Bild;
  fuer: Fuer;
  titel: string;
  text: string;
  /** Text in der Handyfassung, wenn er dort anders lauten muss. */
  textHandy?: string;
  /** Text für Personen, die verwalten dürfen. */
  textVerwalten?: string;
  /** Für Screenreader: wo das hervorgehobene Element steht. */
  ort?: string;
}

export interface Rundgang {
  schluessel: string;
  herkunft: Herkunft;
  start: RundgangStart;
  fuer: Fuer;
  oeffne?: { seite: OeffneSeite };
  titel: string;
  beschreibung: string;
  /** Satz nach dem letzten Schritt. */
  ende?: string;
  schritte: RundgangSchritt[];
}

export interface Tipp {
  schluessel: string;
  herkunft: Herkunft;
  bereich: TippBereich;
  text: string;
  fuer: Fuer;
  /** Ziel: ein Anker (die Oberfläche öffnet seine Seite und hebt ihn hervor) … */
  ziel?: string;
  /** … oder ein Rundgang, den der Satz startet. */
  rundgang?: string;
  funktion?: Funktion;
  /** „Neu seit deinem letzten Besuch“ für alle, die von einer älteren Version auf diese aktualisiert haben. */
  abVersion?: string;
}

/** Ein Tipp, wie ihn die Person sieht (GET /api/entdecken). */
export interface TippAnzeige {
  schluessel: string;
  herkunft: Herkunft;
  bereich: TippBereich;
  /** In der Sprache der Person. */
  text: string;
  /** Anker und seine Seite: Der Satz öffnet die Seite und hebt die Stelle hervor. */
  ziel?: { anker: string; seite: string };
  rundgang?: string;
  /** „Neu seit deinem letzten Besuch“. */
  neu: boolean;
  /** Mit × ausgeblendet – auf „Ablago entdecken“ trotzdem sichtbar. */
  ausgeblendet: boolean;
  /** Eignet sich für Clients (die Stelle gibt es dort auch); keine Werkbank- und Rundgang-Tipps. */
  clients: boolean;
}

/** Antwort von GET /api/entdecken: alles, was die Person sehen darf. */
export interface EntdeckenStand {
  rundgaenge: Rundgang[];
  tipps: TippAnzeige[];
  /**
   * Tipp des Tages im Assistenten (null: heute keiner oder Tipps aus). `gesehen`: schon angesehen (#1219) – dann kein
   * Punkt mehr am Knopf des Assistenten.
   */
  tipp: { schluessel: string; weitere: number; gesehen: boolean } | null;
  /** Tipp des Tages eingeschaltet (Mein Konto → Darstellung). */
  tippsAn: boolean;
  /** Rundgang, der jetzt von selbst startet (erste Anmeldung bzw. nach „Später“). */
  starten: string | null;
}

/** Text aus der Sprachdatei (`entdecken.<schluessel>`); `undefined`, wenn es ihn nicht gibt. */
export type Texte = (schluessel: string) => string | undefined;

/* ---------- Schlüssel der Texte in den Sprachdateien ---------- */

/** Unterstriche gibt es in Schlüsseln der Sprachdateien nicht: aus `zu_erledigen` wird `zu-erledigen`. */
const teil = (s: string) => s.replace(/_/g, '-');
export const textSchluesselRundgang = (r: string, feld: 'titel' | 'beschreibung' | 'ende') => `entdecken.rundgang.${teil(r)}.${feld}`;
export const textSchluesselSchritt = (r: string, s: string, feld: 'titel' | 'text' | 'text-handy' | 'text-verwalten' | 'ort') => `entdecken.rundgang.${teil(r)}.${teil(s)}.${feld}`;
export const textSchluesselTipp = (t: string) => `entdecken.tipp.${teil(t)}`;

/* ---------- Prüfen ---------- */

const FELDER_RUNDGANG = new Set(['schluessel', 'start', 'fuer', 'oeffne', 'titel', 'beschreibung', 'ende', 'schritte']);
const FELDER_SCHRITT = new Set(['schluessel', 'ziel', 'bild', 'fuer', 'titel', 'text', 'text_handy', 'text_verwalten', 'ort']);
const FELDER_TIPP = new Set(['schluessel', 'bereich', 'text', 'fuer', 'ziel', 'rundgang', 'funktion', 'ab_version']);
const VERSION = /^\d+\.\d+\.\d+$/;

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const steuerzeichen = (s: string) => /[\u0000-\u001f\u007f<>]/.test(s);

/** Bekannter Anker? Muster (`mappe.register:<key>`) passen auf jeden Wert mit gültigem Schlüssel. */
export function ankerBekannt(anker: string, liste: readonly Anker[]): boolean {
  return liste.some((a) => (a.muster
    ? anker.startsWith(a.anker.slice(0, a.anker.indexOf('<'))) && /^[a-z0-9_-]{1,60}$/i.test(anker.slice(a.anker.indexOf('<')))
    : a.anker === anker));
}

/** Text eines Feldes: direkt in der Quelle oder aus der Sprachdatei; prüft Länge und Zeichen. */
function textVon(roh: Record<string, unknown>, feld: string, schluessel: string, texte: Texte | undefined, max: number, ort: string, fehler: string[], pflicht = true): string | undefined {
  const direkt = roh[feld];
  const text = typeof direkt === 'string' ? direkt.trim() : texte?.(schluessel);
  if (direkt !== undefined && typeof direkt !== 'string') { fehler.push(`${ort}: „${feld}“ ist kein Text.`); return undefined; }
  if (text === undefined || text === '') { if (pflicht) fehler.push(`${ort}: Text „${feld}“ fehlt (weder in der Datei noch unter ${schluessel}).`); return undefined; }
  if (text.length > max) fehler.push(`${ort}: „${feld}“ ist ${text.length} Zeichen lang, höchstens ${max}.`);
  if (steuerzeichen(text)) fehler.push(`${ort}: „${feld}“ enthält Steuerzeichen oder spitze Klammern.`);
  return text;
}

function unbekannte(roh: Record<string, unknown>, erlaubt: ReadonlySet<string>, ort: string, fehler: string[]) {
  for (const k of Object.keys(roh)) if (!erlaubt.has(k)) fehler.push(`${ort}: unbekanntes Feld „${k}“.`);
}

function fuerVon(x: unknown, ort: string, fehler: string[]): Fuer {
  if (x === undefined) return 'lesen';
  if (!FUER.includes(x as Fuer)) { fehler.push(`${ort}: „fuer“ muss ${FUER.join(' oder ')} sein.`); return 'lesen'; }
  return x as Fuer;
}

/**
 * Prüft die Rundgänge einer Quelle. Fehlerhafte Rundgänge fallen ganz weg (kein halber Rundgang); die Fehler stehen
 * in `fehler` – für Tests, die Paketprüfung und das Protokoll.
 */
export function pruefeRundgaenge(roh: unknown, o: { herkunft: Herkunft; anker: readonly Anker[]; texte?: Texte }): { rundgaenge: Rundgang[]; fehler: string[] } {
  const fehler: string[] = [];
  const rundgaenge: Rundgang[] = [];
  if (roh === null || roh === undefined) return { rundgaenge, fehler };
  if (!Array.isArray(roh)) return { rundgaenge, fehler: ['Rundgänge: Die Datei muss eine Liste sein.'] };
  const gesehen = new Set<string>();
  for (const [i, r] of roh.entries()) {
    const ort = `Rundgang ${i + 1}`;
    if (!istObjekt(r)) { fehler.push(`${ort}: kein Eintrag mit Feldern.`); continue; }
    const vorher = fehler.length;
    unbekannte(r, FELDER_RUNDGANG, ort, fehler);
    const schluessel = typeof r.schluessel === 'string' ? r.schluessel : '';
    if (!SCHLUESSEL.test(schluessel)) fehler.push(`${ort}: „schluessel“ fehlt oder ist ungültig (klein, Ziffern, _; höchstens 40 Zeichen).`);
    else if (gesehen.has(schluessel)) fehler.push(`${ort}: „${schluessel}“ gibt es doppelt.`);
    gesehen.add(schluessel);
    const o2 = `Rundgang „${schluessel || i + 1}“`;
    const start = (r.start ?? 'manuell') as RundgangStart;
    if (!RUNDGANG_START.includes(start)) fehler.push(`${o2}: „start“ muss ${RUNDGANG_START.join(' oder ')} sein.`);
    else if (start === 'erste_anmeldung' && o.herkunft !== 'ablago') fehler.push(`${o2}: „erste_anmeldung“ gibt es nur für Ablagos eigenen Rundgang.`);
    const fuer = fuerVon(r.fuer, o2, fehler);
    let oeffne: Rundgang['oeffne'];
    if (r.oeffne !== undefined) {
      if (!istObjekt(r.oeffne) || Object.keys(r.oeffne).some((k) => k !== 'seite') || !Object.hasOwn(OEFFNE_SEITEN, String(r.oeffne.seite))) fehler.push(`${o2}: „oeffne“ kennt nur seite: ${Object.keys(OEFFNE_SEITEN).join(', ')}.`);
      else oeffne = { seite: r.oeffne.seite as OeffneSeite };
    }
    const titel = textVon(r, 'titel', textSchluesselRundgang(schluessel, 'titel'), o.texte, TITEL_MAX, o2, fehler);
    const beschreibung = textVon(r, 'beschreibung', textSchluesselRundgang(schluessel, 'beschreibung'), o.texte, RUNDGANG_TEXT_MAX, o2, fehler);
    const ende = textVon(r, 'ende', textSchluesselRundgang(schluessel, 'ende'), o.texte, RUNDGANG_TEXT_MAX, o2, fehler, false);
    const schritte: RundgangSchritt[] = [];
    if (!Array.isArray(r.schritte) || r.schritte.length === 0) fehler.push(`${o2}: „schritte“ fehlt oder ist leer.`);
    else if (r.schritte.length > RUNDGANG_SCHRITTE_MAX) fehler.push(`${o2}: ${r.schritte.length} Schritte, höchstens ${RUNDGANG_SCHRITTE_MAX}.`);
    else {
      const namen = new Set<string>();
      for (const [j, s] of r.schritte.entries()) {
        const os = `${o2}, Schritt ${j + 1}`;
        if (!istObjekt(s)) { fehler.push(`${os}: kein Eintrag mit Feldern.`); continue; }
        unbekannte(s, FELDER_SCHRITT, os, fehler);
        const sk = typeof s.schluessel === 'string' ? s.schluessel : '';
        if (!SCHLUESSEL.test(sk)) { fehler.push(`${os}: „schluessel“ fehlt oder ist ungültig.`); continue; }
        if (namen.has(sk)) fehler.push(`${os}: „${sk}“ gibt es doppelt.`);
        namen.add(sk);
        const ziel = s.ziel === undefined ? [] : Array.isArray(s.ziel) ? s.ziel : [s.ziel];
        if (ziel.some((z) => typeof z !== 'string')) fehler.push(`${os}: „ziel“ muss ein Anker oder eine Liste von Ankern sein.`);
        for (const z of ziel) if (typeof z === 'string' && !ankerBekannt(z, o.anker)) fehler.push(`${os}: unbekannter Anker „${z}“.`);
        if (s.bild !== undefined && !BILDER.includes(s.bild as Bild)) fehler.push(`${os}: unbekanntes Bild „${String(s.bild)}“.`);
        const t = (feld: 'titel' | 'text' | 'text-handy' | 'text-verwalten' | 'ort', pflicht: boolean, max: number) =>
          textVon(s, feld.replace('-', '_'), textSchluesselSchritt(schluessel, sk, feld), o.texte, max, os, fehler, pflicht);
        const st = t('titel', true, TITEL_MAX), tx = t('text', true, RUNDGANG_TEXT_MAX);
        const th = t('text-handy', false, RUNDGANG_TEXT_MAX), tv = t('text-verwalten', false, RUNDGANG_TEXT_MAX), ort2 = t('ort', false, RUNDGANG_TEXT_MAX);
        // Ein Schritt mit Ziel braucht einen Satz für Screenreader: Die Hervorhebung sieht man nur.
        if (ziel.length && !ort2) fehler.push(`${os}: Zu einem Ziel gehört „ort“ (wo das Element steht, für Screenreader).`);
        schritte.push({ schluessel: sk, ziel: ziel.filter((z): z is string => typeof z === 'string'), ...(s.bild ? { bild: s.bild as Bild } : {}), fuer: fuerVon(s.fuer, os, fehler),
          titel: st ?? '', text: tx ?? '', ...(th ? { textHandy: th } : {}), ...(tv ? { textVerwalten: tv } : {}), ...(ort2 ? { ort: ort2 } : {}) });
      }
    }
    if (fehler.length > vorher) continue;
    rundgaenge.push({ schluessel, herkunft: o.herkunft, start, fuer, ...(oeffne ? { oeffne } : {}), titel: titel!, beschreibung: beschreibung!, ...(ende ? { ende } : {}), schritte });
  }
  return { rundgaenge, fehler };
}

/** Prüft die Tipps einer Quelle; fehlerhafte fallen weg. `rundgaenge`: Schlüssel der Rundgänge, die ein Tipp starten darf. */
export function pruefeTipps(roh: unknown, o: { herkunft: Herkunft; anker: readonly Anker[]; rundgaenge: readonly string[]; texte?: Texte }): { tipps: Tipp[]; fehler: string[] } {
  const fehler: string[] = [];
  const tipps: Tipp[] = [];
  if (roh === null || roh === undefined) return { tipps, fehler };
  if (!Array.isArray(roh)) return { tipps, fehler: ['Tipps: Die Datei muss eine Liste sein.'] };
  const max = o.herkunft === 'ablago' ? TIPPS_MAX_ABLAGO : TIPPS_MAX;
  if (roh.length > max) fehler.push(`Tipps: ${roh.length} Tipps, höchstens ${max}.`);
  const gesehen = new Set<string>();
  for (const [i, x] of roh.slice(0, max).entries()) {
    const ort = `Tipp ${i + 1}`;
    if (!istObjekt(x)) { fehler.push(`${ort}: kein Eintrag mit Feldern.`); continue; }
    const vorher = fehler.length;
    unbekannte(x, FELDER_TIPP, ort, fehler);
    const schluessel = typeof x.schluessel === 'string' ? x.schluessel : '';
    if (!SCHLUESSEL.test(schluessel)) fehler.push(`${ort}: „schluessel“ fehlt oder ist ungültig.`);
    else if (gesehen.has(schluessel)) fehler.push(`${ort}: „${schluessel}“ gibt es doppelt.`);
    gesehen.add(schluessel);
    const o2 = `Tipp „${schluessel || i + 1}“`;
    const bereich = x.bereich as TippBereich;
    if (!TIPP_BEREICHE.includes(bereich)) fehler.push(`${o2}: „bereich“ muss einer von ${TIPP_BEREICHE.join(', ')} sein.`);
    const text = textVon(x, 'text', textSchluesselTipp(schluessel), o.texte, TIPP_TEXT_MAX, o2, fehler);
    if (text && (text.match(/[.!?](\s|$)/g)?.length ?? 0) > 2) fehler.push(`${o2}: höchstens zwei Sätze.`);
    const fuer = fuerVon(x.fuer, o2, fehler);
    const ziel = x.ziel, rundgang = x.rundgang;
    if ((ziel === undefined) === (rundgang === undefined)) fehler.push(`${o2}: genau eines von „ziel“ (Anker) oder „rundgang“.`);
    if (ziel !== undefined && (typeof ziel !== 'string' || !ankerBekannt(ziel, o.anker))) fehler.push(`${o2}: unbekannter Anker „${String(ziel)}“.`);
    else if (typeof ziel === 'string' && !o.anker.find((a) => a.anker === ziel)?.seite) fehler.push(`${o2}: Der Anker „${ziel}“ hat keine feste Seite – als Ziel eines Tipps geht er nicht.`);
    if (rundgang !== undefined && (typeof rundgang !== 'string' || !o.rundgaenge.includes(rundgang))) fehler.push(`${o2}: unbekannter Rundgang „${String(rundgang)}“.`);
    if (x.funktion !== undefined && !FUNKTIONEN.includes(x.funktion as Funktion)) fehler.push(`${o2}: unbekannte Funktion „${String(x.funktion)}“.`);
    const ab = x.ab_version === undefined ? undefined : String(x.ab_version);
    if (ab !== undefined && !VERSION.test(ab)) fehler.push(`${o2}: „ab_version“ muss eine Version wie 1.2.0 sein.`);
    if (fehler.length > vorher) continue;
    tipps.push({ schluessel, herkunft: o.herkunft, bereich, text: text!, fuer, ...(typeof ziel === 'string' ? { ziel } : {}), ...(typeof rundgang === 'string' ? { rundgang } : {}),
      ...(x.funktion ? { funktion: x.funktion as Funktion } : {}), ...(ab ? { abVersion: ab } : {}) });
  }
  return { tipps, fehler };
}

/** Prüft die Ankerliste selbst (`anker.yaml`). */
export function pruefeAnker(roh: unknown): { anker: Anker[]; fehler: string[] } {
  const fehler: string[] = [];
  const anker: Anker[] = [];
  if (!Array.isArray(roh)) return { anker, fehler: ['Anker: Die Datei muss eine Liste sein.'] };
  const erlaubt = new Set(['anker', 'seite', 'beschreibung', 'handy', 'clients']);
  for (const [i, a] of roh.entries()) {
    if (!istObjekt(a)) { fehler.push(`Anker ${i + 1}: kein Eintrag mit Feldern.`); continue; }
    unbekannte(a, erlaubt, `Anker ${i + 1}`, fehler);
    const name = typeof a.anker === 'string' ? a.anker : '';
    const muster = name.includes('<');
    if (!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*(:<[a-z]+>)?$/.test(name)) { fehler.push(`Anker ${i + 1}: ungültiger Name „${name}“.`); continue; }
    if (anker.some((x) => x.anker === name)) fehler.push(`Anker „${name}“ gibt es doppelt.`);
    if (typeof a.beschreibung !== 'string' || !a.beschreibung.trim()) fehler.push(`Anker „${name}“: „beschreibung“ fehlt.`);
    if (a.seite !== undefined && (typeof a.seite !== 'string' || !a.seite.startsWith('/') || muster)) fehler.push(`Anker „${name}“: „seite“ muss ein Pfad wie /ablage/start sein (nicht bei Mustern).`);
    anker.push({ anker: name, ...(typeof a.seite === 'string' ? { seite: a.seite } : {}), beschreibung: String(a.beschreibung ?? ''), handy: a.handy === true, clients: a.clients === true, muster });
  }
  return { anker, fehler };
}

/* ---------- Für die Person ---------- */

/** Was über die Person feststeht: Recht zu verwalten, eingeschaltete Funktionen. */
export interface Fuerwen { verwalten: boolean; funktionen: ReadonlySet<Funktion> }

export const passtFuer = (fuer: Fuer, p: Fuerwen) => fuer === 'lesen' || p.verwalten;

/** Rundgang für diese Person: ohne Schritte, die sie nicht betreffen (Jonas bekommt keine Werkbank-Schritte). */
export function rundgangFuer(r: Rundgang, p: Fuerwen): Rundgang | null {
  if (!passtFuer(r.fuer, p)) return null;
  const schritte = r.schritte.filter((s) => passtFuer(s.fuer, p)).map((s) => {
    const { textVerwalten, ...rest } = s;
    return p.verwalten && textVerwalten ? { ...rest, text: textVerwalten } : rest;
  });
  return schritte.length ? { ...r, schritte } : null;
}

export const tippPasst = (x: Tipp, p: Fuerwen) => passtFuer(x.fuer, p) && (!x.funktion || p.funktionen.has(x.funktion));

/**
 * „Neu seit deinem letzten Besuch“: Tipp mit `ab_version` über der Version, die die Person zuletzt benutzt hat, und
 * höchstens der laufenden. Ohne gültige Versionen (Entwicklung) ist nichts neu.
 */
export function istNeu(x: Tipp, vorher: string | null, jetzt: string): boolean {
  if (!x.abVersion || !vorher || !VERSION.test(vorher) || !VERSION.test(jetzt)) return false;
  return vergleicheVersion(x.abVersion, vorher) > 0 && vergleicheVersion(x.abVersion, jetzt) <= 0;
}

/* ---------- Tipp des Tages (#832) ---------- */

/** Was Ablago sich je Person zu Tipps merkt (Einstellung `entdecken_tipps`) – nur in der eigenen Ablago. */
export interface TippStand {
  /** Tag (JJJJ-MM-TT) und Tipp, der an diesem Tag gezeigt wurde; erledigt = angeklickt oder weggeklickt. */
  tag?: string;
  schluessel?: string | null;
  erledigt?: boolean;
  /** Schon einmal gezeigt. */
  gesehen?: string[];
  /** Mit × ausgeblendet. */
  aus?: string[];
}

export const tippStandAus = (x: unknown): TippStand => {
  if (!istObjekt(x)) return {};
  const liste = (y: unknown) => (Array.isArray(y) ? y.filter((z): z is string => typeof z === 'string').slice(-200) : []);
  return {
    ...(typeof x.tag === 'string' ? { tag: x.tag } : {}),
    ...(typeof x.schluessel === 'string' ? { schluessel: x.schluessel } : {}),
    ...(x.erledigt === true ? { erledigt: true } : {}),
    gesehen: liste(x.gesehen), aus: liste(x.aus),
  };
};

/**
 * Höchstens ein Tipp am Tag (#832): Der Tipp, der heute schon gezeigt wird, bleibt bis Tagesende (es sei denn, er ist
 * erledigt – dann kommt heute keiner mehr). Sonst der erste, der weder gesehen noch ausgeblendet ist; Neues zuerst.
 * `weitere`: wie viele Neuheiten außerdem warten („und 2 weitere“).
 */
export function tippDesTages<T extends { schluessel: string; neu: boolean }>(tipps: readonly T[], stand: TippStand, heute: string): { tipp: T; weitere: number } | null {
  const aus = new Set(stand.aus ?? []);
  const gesehen = new Set(stand.gesehen ?? []);
  const neuOffen = (ohne: string) => tipps.filter((x) => x.neu && x.schluessel !== ohne && !aus.has(x.schluessel) && !gesehen.has(x.schluessel)).length;
  if (stand.tag === heute) {
    if (stand.erledigt || !stand.schluessel || aus.has(stand.schluessel)) return null;
    const x = tipps.find((y) => y.schluessel === stand.schluessel);
    return x ? { tipp: x, weitere: x.neu ? neuOffen(x.schluessel) : 0 } : null;
  }
  const offen = tipps.filter((x) => !aus.has(x.schluessel) && !gesehen.has(x.schluessel));
  const x = offen.find((y) => y.neu) ?? offen[0];
  return x ? { tipp: x, weitere: x.neu ? neuOffen(x.schluessel) : 0 } : null;
}

/** Stand nach einer Handlung an einem Tipp. */
export function tippHandlung(stand: TippStand, schluessel: string, aktion: 'gezeigt' | 'erledigt' | 'ausblenden' | 'einblenden', heute: string): TippStand {
  const gesehen = [...new Set([...(stand.gesehen ?? []), ...(aktion === 'einblenden' ? [] : [schluessel])])];
  const aus = aktion === 'ausblenden' ? [...new Set([...(stand.aus ?? []), schluessel])] : aktion === 'einblenden' ? (stand.aus ?? []).filter((x) => x !== schluessel) : (stand.aus ?? []);
  if (aktion === 'einblenden') return { ...stand, gesehen: gesehen.filter((x) => x !== schluessel), aus };
  if (aktion === 'gezeigt') return stand.tag === heute ? { ...stand, gesehen, aus } : { tag: heute, schluessel, gesehen, aus };
  // Angeklickt oder weggeklickt: heute kein Tipp mehr.
  return { tag: heute, schluessel: stand.tag === heute ? (stand.schluessel ?? schluessel) : schluessel, erledigt: true, gesehen, aus };
}

/* ---------- Rundgang bei der ersten Anmeldung (#831) ---------- */

/** Merker je Person und Rundgang (Einstellung `entdecken_rundgaenge`): gesehen oder „Später“ (mit Zeitpunkt). */
export type RundgangMerker = Record<string, { stand: 'gesehen' | 'spaeter'; am?: string }>;

export const rundgangMerkerAus = (x: unknown): RundgangMerker => {
  if (!istObjekt(x)) return {};
  const aus: RundgangMerker = {};
  for (const [k, v] of Object.entries(x)) {
    if (istObjekt(v) && (v.stand === 'gesehen' || v.stand === 'spaeter')) aus[k] = { stand: v.stand, ...(typeof v.am === 'string' ? { am: v.am } : {}) };
  }
  return aus;
};

/**
 * Startet der Rundgang von selbst? Nur `erste_anmeldung`, nur ohne Merker (neues Konto – Konten, die sich vor #831
 * schon angemeldet hatten, bekommen per Migration 088 „gesehen“) oder nach „Später“, sobald die Person sich seitdem
 * neu angemeldet hat.
 */
export function startetVonSelbst(r: Rundgang, merker: RundgangMerker, letzteAnmeldung: string | null): boolean {
  if (r.start !== 'erste_anmeldung') return false;
  const m = merker[r.schluessel];
  if (!m) return true;
  if (m.stand === 'gesehen') return false;
  return !!(m.am && letzteAnmeldung && Date.parse(letzteAnmeldung) > Date.parse(m.am));
}
