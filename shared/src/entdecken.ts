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
 * `nach_installation` und `nach_update` (Stufe 2) – sie starten nie von selbst, sondern Ablago bietet sie eine Zeit
 * lang als Tipp an („Neu: … – kurzer Rundgang“, {@link ANGEBOT_TAGE}).
 */
export const RUNDGANG_START = ['manuell', 'erste_anmeldung', 'nach_installation', 'nach_update'] as const;
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
/**
 * Was ein Rundgang vor dem ersten Schritt öffnet: eine Seite, die erste Mappe eines Mappentyps, die die Person lesen
 * darf (`mappe`), oder ein leeres Formular dieses Typs, ohne etwas zu speichern (`neu`). Gibt es keine solche Mappe
 * bzw. darf die Person den Typ nicht anlegen, erscheint statt des Rundgangs der Text `ersatz`. Mappentypen stehen hier
 * mit ihrer Kennung (`vertraege:vertrag`, eigene ohne Präfix).
 */
export type Oeffne = { seite: OeffneSeite } | { mappe: string } | { neu: string };
/** Mappentyp, den ein Rundgang öffnet (`oeffne.mappe` bzw. `oeffne.neu`), sonst undefined. */
export const oeffneTyp = (o: Oeffne | undefined) => (o && 'mappe' in o ? o.mappe : o && 'neu' in o ? o.neu : undefined);
/**
 * So lange (Tage nach Installation bzw. Update) bietet Ablago einen Rundgang mit `nach_installation`/`nach_update` als
 * Tipp an und gelten Tipps eines Pakets mit `ab_version` als „Neu seit deinem letzten Besuch“. Danach stehen sie nur
 * noch auf „Ablago entdecken“.
 */
export const ANGEBOT_TAGE = 30;
/**
 * Verweis ins mitgelieferte Handbuch an einem Schritt (`handbuch`): Handbuch und Seite, z. B. admin/pakete/#so-nutzt-du-es
 * (Benutzer- oder Administratorhandbuch, in der Sprache der Person).
 */
export const HANDBUCH_VERWEIS = /^(benutzer|admin)\/([a-z0-9_-]+\/)*(#[a-z0-9_-]{1,60})?$/;
/**
 * Was die Prüfung über einen Mappentyp wissen muss: seine Kennung und – wenn bekannt – die Schlüssel von Feldern und
 * Registern. Ohne Felder (z. B. Typ eines anderen Pakets beim Prüfen eines Pakets) prüft sie nur die Kennung.
 */
export interface TypInfo {
  kennung: string;
  felder?: readonly string[];
  register?: readonly string[];
}
/** Eingebaute Grafiken für einen Schritt (`bild`). */
export const BILDER = ['dreiteilung'] as const;
export type Bild = (typeof BILDER)[number];

/** Herkunft eines Eintrags: `ablago`, `paket:<id>` oder `eigen` (in der Werkbank geschrieben, #941/#942). */
export type Herkunft = 'ablago' | 'eigen' | `paket:${string}`;

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
  /** Verweis ins Handbuch ({@link HANDBUCH_VERWEIS}), z. B. admin/pakete/#so-nutzt-du-es. */
  handbuch?: string;
  /** Satz für Personen, die das nicht selbst einstellen dürfen, z. B. „Frag die Person, die Ablago bei euch verwaltet.“ */
  sonstVerwalten?: string;
}

export interface Rundgang {
  schluessel: string;
  herkunft: Herkunft;
  start: RundgangStart;
  fuer: Fuer;
  oeffne?: Oeffne;
  /** Text, wenn es nichts zu öffnen gibt (keine Mappe des Typs bzw. kein Recht zum Anlegen). */
  ersatz?: string;
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
  /** Nur für Personen, die diesen Mappentyp (Kennung) lesen dürfen; Ziele an einer Mappe öffnen die erste davon. */
  typ?: string;
}

/** Ein Tipp, wie ihn die Person sieht (GET /api/entdecken). */
export interface TippAnzeige {
  schluessel: string;
  herkunft: Herkunft;
  bereich: TippBereich;
  /** In der Sprache der Person. */
  text: string;
  /**
   * Anker und seine Seite: Der Satz öffnet die Seite und hebt die Stelle hervor. Ohne `seite` liegt die Stelle in einer
   * Mappe des Typs `typ` – die Oberfläche öffnet zuerst die erste, die die Person lesen darf (…/oeffnen).
   */
  ziel?: { anker: string; seite?: string; typ?: string };
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
export const textSchluesselRundgang = (r: string, feld: 'titel' | 'beschreibung' | 'ende' | 'ersatz') =>
  `entdecken.rundgang.${teil(r)}.${feld}`;
export const textSchluesselSchritt = (
  r: string,
  s: string,
  feld: 'titel' | 'text' | 'text-handy' | 'text-verwalten' | 'ort' | 'sonst-verwalten',
) => `entdecken.rundgang.${teil(r)}.${teil(s)}.${feld}`;
export const textSchluesselTipp = (t: string) => `entdecken.tipp.${teil(t)}`;

/* ---------- Prüfen ---------- */

const FELDER_RUNDGANG = new Set(['schluessel', 'start', 'fuer', 'oeffne', 'ersatz', 'titel', 'beschreibung', 'ende', 'schritte']);
const FELDER_SCHRITT = new Set([
  'schluessel',
  'ziel',
  'bild',
  'fuer',
  'titel',
  'text',
  'text_handy',
  'text_verwalten',
  'ort',
  'handbuch',
  'sonst_verwalten',
]);
const FELDER_TIPP = new Set(['schluessel', 'bereich', 'text', 'fuer', 'ziel', 'rundgang', 'funktion', 'ab_version', 'typ']);
const VERSION = /^\d+\.\d+\.\d+$/;

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const steuerzeichen = (s: string) => /[\u0000-\u001f\u007f<>]/.test(s);

/** Bekannter Anker? Muster (`mappe.register:<key>`) passen auf jeden Wert mit gültigem Schlüssel. */
export function ankerBekannt(anker: string, liste: readonly Anker[]): boolean {
  return liste.some((a) =>
    a.muster
      ? anker.startsWith(a.anker.slice(0, a.anker.indexOf('<'))) && /^[a-z0-9_-]{1,60}$/i.test(anker.slice(a.anker.indexOf('<')))
      : a.anker === anker,
  );
}

/**
 * Wo ein Fehler steht: Weg zum Eintrag in der Datei, z. B. [0, 'schritte', 2, 'ziel']. Die Werkbank macht daraus die
 * Zeile (#941); `fehler[i]` gehört zu `orte[i]`.
 */
export type Pfad = Array<string | number>;
/** Meldet einen Fehler; `feld`: am Feld des Eintrags (sonst am Eintrag selbst). */
type Melde = (text: string, feld?: string) => void;
/** Sammelt Fehler mit ihrem Ort. */
function fehlerliste() {
  const fehler: string[] = [];
  const orte: Pfad[] = [];
  const bei =
    (pfad: Pfad): Melde =>
    (text, feld) => {
      fehler.push(text);
      orte.push(feld ? [...pfad, feld] : pfad);
    };
  return { fehler, orte, bei };
}

/** Text eines Feldes: direkt in der Quelle oder aus der Sprachdatei; prüft Länge und Zeichen. */
function textVon(
  roh: Record<string, unknown>,
  feld: string,
  schluessel: string,
  texte: Texte | undefined,
  max: number,
  ort: string,
  melde: Melde,
  pflicht = true,
): string | undefined {
  const direkt = roh[feld];
  const text = typeof direkt === 'string' ? direkt.trim() : texte?.(schluessel);
  if (direkt !== undefined && typeof direkt !== 'string') {
    melde(`${ort}: „${feld}“ ist kein Text.`, feld);
    return undefined;
  }
  if (text === undefined || text === '') {
    if (pflicht)
      melde(`${ort}: Text „${feld}“ fehlt (weder in der Datei noch unter ${schluessel}).`, direkt === undefined ? undefined : feld);
    return undefined;
  }
  if (text.length > max) melde(`${ort}: „${feld}“ ist ${text.length} Zeichen lang, höchstens ${max}.`, feld);
  if (steuerzeichen(text)) melde(`${ort}: „${feld}“ enthält Steuerzeichen oder spitze Klammern.`, feld);
  return text;
}

function unbekannte(roh: Record<string, unknown>, erlaubt: ReadonlySet<string>, ort: string, melde: Melde) {
  for (const k of Object.keys(roh)) if (!erlaubt.has(k)) melde(`${ort}: unbekanntes Feld „${k}“.`, k);
}

function fuerVon(x: unknown, ort: string, melde: Melde): Fuer {
  if (x === undefined) return 'lesen';
  if (!FUER.includes(x as Fuer)) {
    melde(`${ort}: „fuer“ muss ${FUER.join(' oder ')} sein.`, 'fuer');
    return 'lesen';
  }
  return x as Fuer;
}

/** Schlüssel hinter `mappe.feld:` bzw. `mappe.register:`, sonst null. */
const mappenTeil = (anker: string): { art: 'feld' | 'register'; key: string } | null => {
  const m = /^mappe\.(feld|register):(.+)$/.exec(anker);
  return m ? { art: m[1] as 'feld' | 'register', key: m[2] } : null;
};

/** Optionen der Prüfung von Rundgängen. */
export interface RundgangPruefung {
  herkunft: Herkunft;
  anker: readonly Anker[];
  texte?: Texte;
  /**
   * Mappentyp zu `oeffne.mappe`/`oeffne.neu` auflösen: null = gibt es nicht. Ohne diese Funktion (Ablagos eigene
   * Rundgänge) lässt sich kein Mappentyp öffnen.
   */
  typ?: (roh: string) => TypInfo | null;
}

/** `oeffne` eines Rundgangs lesen; `typ`: der aufgelöste Mappentyp (für Felder und Register der Schritte). */
function liesOeffne(x: unknown, o: RundgangPruefung, o2: string, m: Melde): { oeffne?: Oeffne; typ: TypInfo | null } {
  const art = istObjekt(x) && Object.keys(x).length === 1 ? Object.keys(x)[0] : '';
  if (art === 'seite' && istObjekt(x) && Object.hasOwn(OEFFNE_SEITEN, String(x.seite)))
    return { oeffne: { seite: x.seite as OeffneSeite }, typ: null };
  const innen = istObjekt(x) && (art === 'mappe' || art === 'neu') ? x[art] : undefined;
  if (!istObjekt(innen) || Object.keys(innen).join() !== 'typ' || typeof innen.typ !== 'string') {
    m(`${o2}: „oeffne“ kennt seite: ${Object.keys(OEFFNE_SEITEN).join(', ')}, mappe: { typ: … } oder neu: { typ: … }.`, 'oeffne');
    return { typ: null };
  }
  if (!o.typ) {
    m(`${o2}: „oeffne: ${art}“ gibt es nur für Rundgänge aus Paketen und eigene Rundgänge.`, 'oeffne');
    return { typ: null };
  }
  const typ = o.typ(innen.typ);
  if (!typ) {
    m(`${o2}: Den Mappentyp „${innen.typ}“ gibt es nicht.`, 'oeffne');
    return { typ: null };
  }
  return { oeffne: art === 'mappe' ? { mappe: typ.kennung } : { neu: typ.kennung }, typ };
}

/** Ziele eines Schritts prüfen: bekannte Anker; Felder und Register nur, wenn der geöffnete Mappentyp sie hat. */
function pruefeZiele(ziel: unknown[], o: RundgangPruefung, typ: TypInfo | null, os: string, ms: Melde) {
  if (ziel.some((z) => typeof z !== 'string')) ms(`${os}: „ziel“ muss ein Anker oder eine Liste von Ankern sein.`, 'ziel');
  for (const z of ziel.filter((y): y is string => typeof y === 'string')) {
    if (!ankerBekannt(z, o.anker)) {
      ms(`${os}: unbekannter Anker „${z}“.`, 'ziel');
      continue;
    }
    const teil = mappenTeil(z);
    const liste = teil && typ ? (teil.art === 'feld' ? typ.felder : typ.register) : undefined;
    if (teil && liste && !liste.includes(teil.key))
      ms(`${os}: ${teil.art === 'feld' ? 'Das Feld' : 'Das Register'} „${teil.key}“ gibt es im Mappentyp „${typ!.kennung}“ nicht.`, 'ziel');
  }
}

/** Einen Schritt prüfen; null, wenn er sich nicht lesen lässt (Fehler sind gemeldet). */
function pruefeSchritt(
  s: unknown,
  k: { o: RundgangPruefung; rundgang: string; typ: TypInfo | null; os: string; ms: Melde; namen: Set<string> },
): RundgangSchritt | null {
  const { o, os, ms } = k;
  if (!istObjekt(s)) {
    ms(`${os}: kein Eintrag mit Feldern.`);
    return null;
  }
  unbekannte(s, FELDER_SCHRITT, os, ms);
  const sk = typeof s.schluessel === 'string' ? s.schluessel : '';
  if (!SCHLUESSEL.test(sk)) {
    ms(`${os}: „schluessel“ fehlt oder ist ungültig.`, s.schluessel === undefined ? undefined : 'schluessel');
    return null;
  }
  if (k.namen.has(sk)) ms(`${os}: „${sk}“ gibt es doppelt.`, 'schluessel');
  k.namen.add(sk);
  const ziel = s.ziel === undefined ? [] : Array.isArray(s.ziel) ? s.ziel : [s.ziel];
  pruefeZiele(ziel, o, k.typ, os, ms);
  if (s.bild !== undefined && !BILDER.includes(s.bild as Bild)) ms(`${os}: unbekanntes Bild „${String(s.bild)}“.`, 'bild');
  const t = (feld: 'titel' | 'text' | 'text-handy' | 'text-verwalten' | 'ort' | 'sonst-verwalten', pflicht: boolean, max: number) =>
    textVon(s, feld.replace('-', '_'), textSchluesselSchritt(k.rundgang, sk, feld), o.texte, max, os, ms, pflicht);
  const st = t('titel', true, TITEL_MAX),
    tx = t('text', true, RUNDGANG_TEXT_MAX);
  const th = t('text-handy', false, RUNDGANG_TEXT_MAX),
    tv = t('text-verwalten', false, RUNDGANG_TEXT_MAX),
    ort = t('ort', false, RUNDGANG_TEXT_MAX);
  const sv = t('sonst-verwalten', false, RUNDGANG_TEXT_MAX);
  const hb = s.handbuch === undefined ? undefined : String(s.handbuch);
  const hbOk = hb !== undefined && HANDBUCH_VERWEIS.test(hb);
  if (hb !== undefined && !hbOk)
    ms(`${os}: „handbuch“ muss eine Seite im Handbuch sein, z. B. admin/pakete/#so-nutzt-du-es (benutzer/ oder admin/).`, 'handbuch');
  // Ein Schritt mit Ziel braucht einen Satz für Screenreader: Die Hervorhebung sieht man nur.
  if (ziel.length && !ort) ms(`${os}: Zu einem Ziel gehört „ort“ (wo das Element steht, für Screenreader).`);
  const frei = {
    bild: s.bild as Bild | undefined,
    textHandy: th,
    textVerwalten: tv,
    ort,
    handbuch: hbOk ? hb : undefined,
    sonstVerwalten: sv,
  };
  return {
    schluessel: sk,
    ziel: ziel.filter((z): z is string => typeof z === 'string'),
    fuer: fuerVon(s.fuer, os, ms),
    titel: st ?? '',
    text: tx ?? '',
    ...ohneLeere(frei),
  };
}

/** Nur die Angaben, die es gibt (ohne undefined und leere Texte). */
const ohneLeere = <T extends Record<string, unknown>>(x: T): Partial<T> =>
  Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;

/** Wann der Rundgang startet – und ob die Quelle das darf. */
function startVon(x: unknown, o: RundgangPruefung, o2: string, m: Melde, zaehler: { nachInstallation: number }): RundgangStart {
  const start = (x ?? 'manuell') as RundgangStart;
  if (!RUNDGANG_START.includes(start)) m(`${o2}: „start“ muss ${RUNDGANG_START.join(', ')} sein.`, 'start');
  else if (start === 'erste_anmeldung' && o.herkunft !== 'ablago')
    m(`${o2}: „erste_anmeldung“ gibt es nur für Ablagos eigenen Rundgang.`, 'start');
  else if ((start === 'nach_installation' || start === 'nach_update') && !o.herkunft.startsWith('paket:'))
    m(`${o2}: „${start}“ gibt es nur für Rundgänge aus Paketen.`, 'start');
  else if (start === 'nach_installation' && ++zaehler.nachInstallation > 1)
    m(`${o2}: „nach_installation“ darf es nur einmal je Paket geben.`, 'start');
  return start;
}

/**
 * Prüft die Rundgänge einer Quelle. Fehlerhafte Rundgänge fallen ganz weg (kein halber Rundgang); die Fehler stehen
 * in `fehler` – für Tests, die Paketprüfung, die Werkbank und das Protokoll –, ihr Ort in der Datei in `orte`.
 */
export function pruefeRundgaenge(roh: unknown, o: RundgangPruefung): { rundgaenge: Rundgang[]; fehler: string[]; orte: Pfad[] } {
  const fl = fehlerliste();
  const rundgaenge: Rundgang[] = [];
  const ende = () => ({ rundgaenge, fehler: fl.fehler, orte: fl.orte });
  if (roh === null || roh === undefined) return ende();
  if (!Array.isArray(roh)) {
    fl.bei([])('Rundgänge: Die Datei muss eine Liste sein.');
    return ende();
  }
  const gesehen = new Set<string>();
  const zaehler = { nachInstallation: 0 };
  for (const [i, r] of roh.entries()) {
    const m = fl.bei([i]);
    if (!istObjekt(r)) {
      m(`Rundgang ${i + 1}: kein Eintrag mit Feldern.`);
      continue;
    }
    const vorher = fl.fehler.length;
    unbekannte(r, FELDER_RUNDGANG, `Rundgang ${i + 1}`, m);
    const schluessel = typeof r.schluessel === 'string' ? r.schluessel : '';
    if (!SCHLUESSEL.test(schluessel))
      m(
        `Rundgang ${i + 1}: „schluessel“ fehlt oder ist ungültig (klein, Ziffern, _; höchstens 40 Zeichen).`,
        r.schluessel === undefined ? undefined : 'schluessel',
      );
    else if (gesehen.has(schluessel)) m(`Rundgang ${i + 1}: „${schluessel}“ gibt es doppelt.`, 'schluessel');
    gesehen.add(schluessel);
    const o2 = `Rundgang „${schluessel || i + 1}“`;
    const start = startVon(r.start, o, o2, m, zaehler);
    const fuer = fuerVon(r.fuer, o2, m);
    const { oeffne, typ } = r.oeffne === undefined ? { typ: null } : liesOeffne(r.oeffne, o, o2, m);
    const text = (feld: 'titel' | 'beschreibung' | 'ende' | 'ersatz', max: number, pflicht: boolean) =>
      textVon(r, feld, textSchluesselRundgang(schluessel, feld), o.texte, max, o2, m, pflicht);
    const titel = text('titel', TITEL_MAX, true),
      beschreibung = text('beschreibung', RUNDGANG_TEXT_MAX, true);
    const schluss = text('ende', RUNDGANG_TEXT_MAX, false),
      ersatz = text('ersatz', RUNDGANG_TEXT_MAX, false);
    if (r.ersatz !== undefined && !oeffneTyp(oeffne)) m(`${o2}: „ersatz“ gibt es nur mit „oeffne: mappe“ oder „oeffne: neu“.`, 'ersatz');
    const schritte: RundgangSchritt[] = [];
    if (!Array.isArray(r.schritte) || r.schritte.length === 0)
      m(`${o2}: „schritte“ fehlt oder ist leer.`, r.schritte === undefined ? undefined : 'schritte');
    else if (r.schritte.length > RUNDGANG_SCHRITTE_MAX)
      m(`${o2}: ${r.schritte.length} Schritte, höchstens ${RUNDGANG_SCHRITTE_MAX}.`, 'schritte');
    else {
      const namen = new Set<string>();
      for (const [j, s] of r.schritte.entries()) {
        const x = pruefeSchritt(s, { o, rundgang: schluessel, typ, os: `${o2}, Schritt ${j + 1}`, ms: fl.bei([i, 'schritte', j]), namen });
        if (x) schritte.push(x);
      }
    }
    if (fl.fehler.length > vorher) continue;
    rundgaenge.push({
      schluessel,
      herkunft: o.herkunft,
      start,
      fuer,
      ...(oeffne ? { oeffne } : {}),
      ...(ersatz ? { ersatz } : {}),
      titel: titel!,
      beschreibung: beschreibung!,
      ...(schluss ? { ende: schluss } : {}),
      schritte,
    });
  }
  return ende();
}

/** Optionen der Prüfung von Tipps. */
export interface TippPruefung {
  herkunft: Herkunft;
  anker: readonly Anker[];
  /** Schlüssel der Rundgänge, die ein Tipp starten darf. */
  rundgaenge: readonly string[];
  texte?: Texte;
  /** Mappentyp zu `typ` auflösen (Pakete, eigene Tipps): null = gibt es nicht. Ohne diese Funktion gibt es kein `typ`. */
  typ?: (roh: string) => TypInfo | null;
}

/** Ziel eines Tipps: Anker mit fester Seite – oder mit `typ` auch ein Feld oder Register einer Mappe dieses Typs. */
function pruefeTippZiel(ziel: unknown, typ: TypInfo | null, o: TippPruefung, o2: string, m: Melde) {
  if (typeof ziel !== 'string' || !ankerBekannt(ziel, o.anker)) {
    m(`${o2}: unbekannter Anker „${String(ziel)}“.`, 'ziel');
    return;
  }
  const teil = mappenTeil(ziel);
  if (teil && typ) {
    const liste = teil.art === 'feld' ? typ.felder : typ.register;
    if (liste && !liste.includes(teil.key))
      m(`${o2}: ${teil.art === 'feld' ? 'Das Feld' : 'Das Register'} „${teil.key}“ gibt es im Mappentyp „${typ.kennung}“ nicht.`, 'ziel');
    return;
  }
  if (!o.anker.find((a) => a.anker === ziel)?.seite)
    m(
      `${o2}: Der Anker „${ziel}“ hat keine feste Seite – als Ziel eines Tipps geht er nur mit „typ“ (Feld oder Register einer Mappe).`,
      'ziel',
    );
}

/** Mappentyp eines Tipps (`typ`) auflösen. */
function tippTyp(x: unknown, o: TippPruefung, o2: string, m: Melde): TypInfo | null {
  if (x === undefined) return null;
  if (typeof x !== 'string' || !o.typ) {
    m(`${o2}: „typ“ gibt es nur für Tipps aus Paketen und eigene Tipps.`, 'typ');
    return null;
  }
  const typ = o.typ(x);
  if (!typ) m(`${o2}: Den Mappentyp „${x}“ gibt es nicht.`, 'typ');
  return typ;
}

/** Einen Tipp prüfen; null bei Fehlern (gemeldet). */
function pruefeTipp(
  x: Record<string, unknown>,
  k: { o: TippPruefung; ort: string; m: Melde; gesehen: Set<string>; vorher: () => number; jetzt: () => number },
): Tipp | null {
  const { o, m } = k;
  unbekannte(x, FELDER_TIPP, k.ort, m);
  const schluessel = typeof x.schluessel === 'string' ? x.schluessel : '';
  if (!SCHLUESSEL.test(schluessel))
    m(`${k.ort}: „schluessel“ fehlt oder ist ungültig.`, x.schluessel === undefined ? undefined : 'schluessel');
  else if (k.gesehen.has(schluessel)) m(`${k.ort}: „${schluessel}“ gibt es doppelt.`, 'schluessel');
  k.gesehen.add(schluessel);
  const o2 = `Tipp „${schluessel || k.ort}“`;
  // Bereich: in Paketen und eigenen Tipps freiwillig (dann „Mappen“).
  const bereich = (x.bereich ?? (o.herkunft === 'ablago' ? undefined : 'mappen')) as TippBereich;
  if (!TIPP_BEREICHE.includes(bereich))
    m(`${o2}: „bereich“ muss einer von ${TIPP_BEREICHE.join(', ')} sein.`, x.bereich === undefined ? undefined : 'bereich');
  const text = textVon(x, 'text', textSchluesselTipp(schluessel), o.texte, TIPP_TEXT_MAX, o2, m);
  if (text && (text.match(/[.!?](\s|$)/g)?.length ?? 0) > 2) m(`${o2}: höchstens zwei Sätze.`, 'text');
  const fuer = fuerVon(x.fuer, o2, m);
  const typ = tippTyp(x.typ, o, o2, m);
  const ziel = x.ziel,
    rundgang = x.rundgang;
  if ((ziel === undefined) === (rundgang === undefined)) m(`${o2}: genau eines von „ziel“ (Anker) oder „rundgang“.`);
  if (ziel !== undefined) pruefeTippZiel(ziel, typ, o, o2, m);
  if (rundgang !== undefined && (typeof rundgang !== 'string' || !o.rundgaenge.includes(rundgang)))
    m(`${o2}: unbekannter Rundgang „${String(rundgang)}“.`, 'rundgang');
  if (x.funktion !== undefined && !FUNKTIONEN.includes(x.funktion as Funktion))
    m(`${o2}: unbekannte Funktion „${String(x.funktion)}“.`, 'funktion');
  const ab = x.ab_version === undefined ? undefined : String(x.ab_version);
  if (ab !== undefined && !VERSION.test(ab)) m(`${o2}: „ab_version“ muss eine Version wie 1.2.0 sein.`, 'ab_version');
  if (k.jetzt() > k.vorher()) return null;
  const frei = {
    ziel: typeof ziel === 'string' ? ziel : undefined,
    rundgang: typeof rundgang === 'string' ? rundgang : undefined,
    funktion: x.funktion as Funktion | undefined,
    abVersion: ab,
    typ: typ?.kennung,
  };
  return { schluessel, herkunft: o.herkunft, bereich, text: text!, fuer, ...ohneLeere(frei) };
}

/** Prüft die Tipps einer Quelle; fehlerhafte fallen weg. */
export function pruefeTipps(roh: unknown, o: TippPruefung): { tipps: Tipp[]; fehler: string[]; orte: Pfad[] } {
  const fl = fehlerliste();
  const tipps: Tipp[] = [];
  const ende = () => ({ tipps, fehler: fl.fehler, orte: fl.orte });
  if (roh === null || roh === undefined) return ende();
  if (!Array.isArray(roh)) {
    fl.bei([])('Tipps: Die Datei muss eine Liste sein.');
    return ende();
  }
  const max = o.herkunft === 'ablago' ? TIPPS_MAX_ABLAGO : TIPPS_MAX;
  if (roh.length > max) fl.bei([max])(`Tipps: ${roh.length} Tipps, höchstens ${max}.`);
  const gesehen = new Set<string>();
  for (const [i, x] of roh.slice(0, max).entries()) {
    const m = fl.bei([i]);
    if (!istObjekt(x)) {
      m(`Tipp ${i + 1}: kein Eintrag mit Feldern.`);
      continue;
    }
    const vorher = fl.fehler.length;
    const tipp = pruefeTipp(x, { o, ort: `Tipp ${i + 1}`, m, gesehen, vorher: () => vorher, jetzt: () => fl.fehler.length });
    if (tipp) tipps.push(tipp);
  }
  return ende();
}

/** Prüft die Ankerliste selbst (`anker.yaml`). */
export function pruefeAnker(roh: unknown): { anker: Anker[]; fehler: string[] } {
  const fehler: string[] = [];
  const anker: Anker[] = [];
  if (!Array.isArray(roh)) return { anker, fehler: ['Anker: Die Datei muss eine Liste sein.'] };
  const erlaubt = new Set(['anker', 'seite', 'beschreibung', 'handy', 'clients']);
  for (const [i, a] of roh.entries()) {
    if (!istObjekt(a)) {
      fehler.push(`Anker ${i + 1}: kein Eintrag mit Feldern.`);
      continue;
    }
    unbekannte(a, erlaubt, `Anker ${i + 1}`, (text) => fehler.push(text));
    const name = typeof a.anker === 'string' ? a.anker : '';
    const muster = name.includes('<');
    if (!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*(:<[a-z]+>)?$/.test(name)) {
      fehler.push(`Anker ${i + 1}: ungültiger Name „${name}“.`);
      continue;
    }
    if (anker.some((x) => x.anker === name)) fehler.push(`Anker „${name}“ gibt es doppelt.`);
    if (typeof a.beschreibung !== 'string' || !a.beschreibung.trim()) fehler.push(`Anker „${name}“: „beschreibung“ fehlt.`);
    if (a.seite !== undefined && (typeof a.seite !== 'string' || !a.seite.startsWith('/') || muster))
      fehler.push(`Anker „${name}“: „seite“ muss ein Pfad wie /ablage/start sein (nicht bei Mustern).`);
    anker.push({
      anker: name,
      ...(typeof a.seite === 'string' ? { seite: a.seite } : {}),
      beschreibung: String(a.beschreibung ?? ''),
      handy: a.handy === true,
      clients: a.clients === true,
      muster,
    });
  }
  return { anker, fehler };
}

/* ---------- Für die Person ---------- */

/**
 * Was über die Person feststeht: Recht zu verwalten, eingeschaltete Funktionen und – wenn bekannt – die Kennungen der
 * Mappentypen, die sie lesen darf (ohne `lesbar` gilt jeder Typ als lesbar, z. B. in Tests).
 */
export interface Fuerwen {
  verwalten: boolean;
  funktionen: ReadonlySet<Funktion>;
  lesbar?: ReadonlySet<string>;
}

export const passtFuer = (fuer: Fuer, p: Fuerwen) => fuer === 'lesen' || p.verwalten;
/** Darf die Person diesen Mappentyp lesen? */
export const liestTyp = (typ: string | undefined, p: Fuerwen) => !typ || !p.lesbar || p.lesbar.has(typ);

/**
 * Rundgang für diese Person: ohne Schritte, die sie nicht betreffen (Jonas bekommt keine Werkbank-Schritte). Öffnet er
 * einen Mappentyp, bekommt ihn nur, wer den Typ lesen darf. Wer nicht verwaltet, liest den Satz `sonst_verwalten` mit.
 */
export function rundgangFuer(r: Rundgang, p: Fuerwen): Rundgang | null {
  if (!passtFuer(r.fuer, p) || !liestTyp(oeffneTyp(r.oeffne), p)) return null;
  const schritte = r.schritte
    .filter((s) => passtFuer(s.fuer, p))
    .map((s) => {
      const { textVerwalten, sonstVerwalten, ...rest } = s;
      if (p.verwalten) return textVerwalten ? { ...rest, text: textVerwalten } : rest;
      return sonstVerwalten ? { ...rest, sonstVerwalten } : rest;
    });
  return schritte.length ? { ...r, schritte } : null;
}

export const tippPasst = (x: Tipp, p: Fuerwen) =>
  passtFuer(x.fuer, p) && (!x.funktion || p.funktionen.has(x.funktion)) && liestTyp(x.typ, p);

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
    gesehen: liste(x.gesehen),
    aus: liste(x.aus),
  };
};

/**
 * Höchstens ein Tipp am Tag (#832): Der Tipp, der heute schon gezeigt wird, bleibt bis Tagesende (es sei denn, er ist
 * erledigt – dann kommt heute keiner mehr). Sonst der erste, der weder gesehen noch ausgeblendet ist; Neues zuerst.
 * `weitere`: wie viele Neuheiten außerdem warten („und 2 weitere“).
 */
export function tippDesTages<T extends { schluessel: string; neu: boolean }>(
  tipps: readonly T[],
  stand: TippStand,
  heute: string,
): { tipp: T; weitere: number } | null {
  const aus = new Set(stand.aus ?? []);
  const gesehen = new Set(stand.gesehen ?? []);
  const neuOffen = (ohne: string) =>
    tipps.filter((x) => x.neu && x.schluessel !== ohne && !aus.has(x.schluessel) && !gesehen.has(x.schluessel)).length;
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
export function tippHandlung(
  stand: TippStand,
  schluessel: string,
  aktion: 'gezeigt' | 'erledigt' | 'ausblenden' | 'einblenden',
  heute: string,
): TippStand {
  const gesehen = [...new Set([...(stand.gesehen ?? []), ...(aktion === 'einblenden' ? [] : [schluessel])])];
  const aus =
    aktion === 'ausblenden'
      ? [...new Set([...(stand.aus ?? []), schluessel])]
      : aktion === 'einblenden'
        ? (stand.aus ?? []).filter((x) => x !== schluessel)
        : (stand.aus ?? []);
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
    if (istObjekt(v) && (v.stand === 'gesehen' || v.stand === 'spaeter'))
      aus[k] = { stand: v.stand, ...(typeof v.am === 'string' ? { am: v.am } : {}) };
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
