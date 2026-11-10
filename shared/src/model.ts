/**
 * Gemeinsames Fachmodell für Server und Weboberfläche.
 *
 * Ein Mappentyp definiert Felder. Eine Mappe ist eine Instanz eines
 * Mappentyps und speichert ihre Werte je Feldschlüssel.
 * Die Prüfregeln hier gelten auf beiden Seiten: die Oberfläche zeigt
 * Fehler früh an, der Server lässt nichts Ungültiges in die Datenbank.
 */

import { LEER, liesFilter, ohneLeereTeile, PLATZHALTER_MIT_FILTERN, pruefeFilter, wendeFilterAn } from './titelfilter';
import { alsText } from './markdown';
import { kreisImStandard, kreisVon } from './nummernkreis';
import { folgtAusKreis, folgtAusProbleme } from './folgtaus';
import { vorbelegenProbleme } from './vorbelegen';
import { ibanGruppen, pruefeFormatDefinition } from './feldformate';
import { datumsformat } from './region';
import { hatZeitraumform, istZeitraum, leseProzent, leseZeitraum, prozentText, ZEITRAUM_ANZAHL_MAX, zeitraumText, type Zeitraum } from './feldarten';
import { t, t as tx } from './texte';
import { SCHLUESSEL, TYP_KENNUNG } from './kennungen';
import { tabellenProbleme } from './tabelle';
import { gebietsschema, registrierteSprachen, textNur } from './sprache';
import { optionText, type AbschnittTeile, type Beschriftungen, type FeldTeile, type NamensTeile, type TypTeile } from './beschriftung';
export { zeitzone } from './region';

export const FELDTYPEN = {
  text: 'Text',
  langtext: 'Langtext',
  /** Markdown (#53): fett, kursiv, Listen, Links, Überschriften, Zitate; nie als HTML ausgeführt. */
  formatiert: 'Formatierter Text',
  zahl: 'Zahl',
  betrag: 'Betrag',
  datum: 'Datum',
  janein: 'Ja/Nein',
  auswahl: 'Auswahlliste',
  referenz: 'Verweis',
  /** Verschlüsselt gespeichert (#46); nie in Titel, Trefferliste, Suche, Protokoll oder Demo-Daten. */
  passwort: 'Passwort',
  /** Zahl und Einheit (#1035): „3 Monate“, gespeichert als `{ anzahl, einheit }` (feldarten.ts). */
  zeitraum: 'Zeitraum',
  /** Prozentsatz (#1035): „19 %“, gespeichert als Zahl 19 (feldarten.ts). */
  prozent: 'Prozent',
  /**
   * Tabelle (#1030): die Mappen eines anderen Typs, die über ein Verweisfeld hierher verweisen, als Tabelle zwischen den
   * Feldern. Kein eigener Wert – reine Darstellung wie ein Abschnitt (tabelle.ts).
   */
  tabelle: 'Tabelle',
} as const;
export type Feldtyp = keyof typeof FELDTYPEN;
/**
 * Name einer Feldart in der Sprache des Lesers (#1094), aus `gemeinsam.model.feldart.<kennung>`. Die Werte in
 * `FELDTYPEN` sind nur die deutschen Ausgangsnamen; der Test sprachdateien-feldarten prüft, dass jede Feldart in
 * de und en einen Namen hat. Die Kennung (`text`, `betrag` …) bleibt in API, Paketen und Daten immer gleich.
 */
export const feldtypName = (typ: Feldtyp) => t.frei(`gemeinsam.model.feldart.${typ}`);

export const VERWEISARTEN = {
  zugehoerigkeit: 'Zugehörigkeit',
  bezug: 'Bezug',
} as const;
export type Verweisart = keyof typeof VERWEISARTEN;

export interface Feld {
  /** Fester Schlüssel, unter dem Werte gespeichert werden. */
  key: string;
  label: string;
  typ: Feldtyp;
  pflicht?: boolean;
  /** Wert darf je Mappentyp nur einmal vorkommen (Text, Zahl). */
  eindeutig?: boolean;
  hilfe?: string;
  standard?: string | boolean | null;
  minLen?: number | null;
  maxLen?: number | null;
  /** Regulärer Ausdruck, muss den ganzen Text treffen. */
  muster?: string;
  /** Zahl, Betrag und Prozent: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT. */
  min?: number | string | null;
  max?: number | string | null;
  nachkomma?: number | null;
  waehrung?: string;
  /**
   * Betrag (#1035): negative Beträge erlaubt (Gutschrift, Erstattung). Fehlt = aus – dann gilt wie bisher ≥ 0; das
   * Formular zeigt den Hinweis „mit Minus eintragen“ nur, wenn es an ist.
   */
  negativ?: boolean;
  /** Auswahl: die festen Werte (#728) – gespeichert wird der Wert, gezeigt die Beschriftung (`beschriftungen`). */
  optionen?: string[];
  mehrfach?: boolean;
  /**
   * Referenz: Ids der Ziel-Mappentypen (#1036; bis dahin ein einzelner Typ `zielTyp`) – einer oder mehrere, der eigene
   * darf dabei sein (Hierarchie). `['*']` (BELIEBIGER_TYP) = jede Mappe, nur an Systemfeldern. Gelesen immer über
   * {@link zieleVon}, {@link zielErlaubt} und {@link einzigesZiel}; ältere Daten mit `zielTyp` gleicht
   * {@link normalisiereZiele} an (Migration 095, Eingaben, Sicherungen, Einrichtungsdateien).
   */
  zielTypen?: string[];
  /**
   * Referenz mit mehreren Zieltypen und „mehrere Mappen erlaubt“ (#1036): alle gewählten Mappen vom selben Typ – ist
   * die erste ein Fahrzeug, dürfen die weiteren nur Fahrzeuge sein. Prüft der Server beim Speichern.
   */
  gleicherTyp?: boolean;
  /**
   * Referenz aus einem Paket (#1036, `ziel_optional`): Kennungen `paket:schluessel` von Zieltypen aus Paketen, von denen
   * das Paket nicht abhängt. Ablago nimmt jeden davon in `zielTypen` auf, sobald es ihn gibt – auch, wenn das andere
   * Paket erst später installiert wird – und lässt das Feld stehen, solange keiner da ist.
   */
  zielOptional?: string[];
  verweisart?: Verweisart;
  /** Systemfeld eines Systemmappentyps: nicht entfernbar, Datentyp und Eigenschaften fest (vom Server gesetzt). */
  system?: boolean;
  /** Datumsfeld (#129): Erinnerung als Aufgabe „Frist“ im Eingang; fehlt/null = keine. */
  frist?: import('./fristen').FristEinstellung | null;
  /** Referenzfeld (#172): nur Mappen des Zieltyps, die alle Bedingungen erfüllen. */
  auswahlFilter?: import('./sichten').Feldbedingung[];
  /**
   * Referenzfeld (#886): „folgt aus“ einem anderen Verweisfeld dieser Mappe über ein Verweisfeld von dessen Ziel, z. B.
   * Organisation aus Niederlassung → Organisation. Füllt nur ein leeres Feld (Vorbelegung, keine Sperre).
   */
  folgtAus?: import('./folgtaus').FolgtAus;
  /**
   * Referenzfeld (#1037): „beim Auswählen übernehmen“ – Paare „Feld der verwiesenen Mappe (`von`) → Feld dieser Mappe
   * (`nach`)“. Wählt man eine Mappe, schlägt Ablago deren Werte in leeren Feldern vor (vorbelegen.ts); nie überschreiben,
   * nie Passwörter, nie berechnete Felder, nur Werte, die die Person lesen darf. Gleiche Schreibweise im Paketformat.
   */
  vorbelegen?: import('./vorbelegen').Vorbelegung[];
  /**
   * „Aus Dokument füllen“ (#336, #391; bis #938 „Für die Erkennung nutzen“): vorhanden = an, mit Art und
   * Erkennungshinweis. Der Name im Code bleibt `erkennung` – gespeicherte Daten und Pakete ändern sich nicht.
   */
  erkennung?: import('./erkennung').FeldErkennung | null;
  /**
   * „Zum Wiederfinden nutzen“ (#938): Über diesen Wert findet Ablago vorhandene Mappen wieder (Kundennummer,
   * Vertragsnummer, Rechnungsnummer, Kennzeichen …) – für Vorschläge, Belege und die Warnung vor Doppelten.
   * Unabhängig von „eindeutig“. Nur bei Text, Zahl und Verweis (WIEDERFINDEN_FELDTYPEN in erkennung.ts).
   */
  wiederfinden?: boolean;
  /**
   * Verweisfeld aus einem Paket-Update (#534): Kennung des bisherigen Textfelds, aus dem es sich füllen lässt
   * (`aus_text` im Paket). Solange der Verweis leer ist, zeigen Titel und Trefferliste den alten Text.
   */
  ausText?: string;
  /** Textfeld (#535): Format E-Mail, Telefon, Internetseite, IBAN oder PLZ; fehlt = frei. */
  format?: import('./feldformate').Feldformat | null;
  /** Format PLZ (#535): Kennung des Felds mit dem Land; Deutschland (oder leer) heißt genau 5 Ziffern. */
  landFeld?: string | null;
  /** Bezeichnung, Hilfetext und Optionen in weiteren Sprachen (#728); fehlt etwas, gilt der Ausgangstext. */
  beschriftungen?: Beschriftungen<FeldTeile>;
  /**
   * Ausgeblendet (#655): nicht im Formular, nicht in der Mappenansicht, nicht zur Auswahl für neue Spalten und
   * Bedingungen. Die Werte bleiben gespeichert (Sicherung, Vollexport, API). Nie Pflicht, nie an Systemfeldern.
   */
  ausgeblendet?: boolean;
  /**
   * „Anzeigen, wenn …“ (#1033): Das Formular zeigt das Feld nur, wenn die Regel zutrifft (anzeige.ts). Nur Ordnung,
   * kein Schutz – der Wert bleibt gespeichert und steht in Schnittstelle, Export und Auskunft. Pflicht nur, solange
   * es zu sehen ist. Fehlt = immer. Nie an Systemfeldern.
   */
  anzeigen?: Anzeigeregel;
  /**
   * Berechnet (#1034): Id des Pakets, dessen Code den Wert schreibt (im Paketformat `berechnet: true` am Feld eines Typs,
   * den das Paket mitbringt). In der Oberfläche nur lesbar; jeder andere Schreiber bekommt 400 mit dem Paketnamen.
   * Setzen kann es nur die Paketverwaltung, entfernen („Feld wieder freigeben“) der Administrator. Nie Pflicht.
   */
  berechnetVon?: string;
  /**
   * Tabelle (#1030): Mappen vom Typ `typId`, die über `feldKey` hierher verweisen, mit den Spalten der Trefferliste
   * `trefferliste` (fehlt = Standard) und der Beschriftung `neu` für „+ Neu“. Nur bei `typ: 'tabelle'`.
   */
  quelle?: import('./tabelle').Tabellenquelle;
}

/**
 * Eine Bedingung in „Anzeigen, wenn …“ (#1033); `nicht` kehrt sie um. Ausgewertet in anzeige.ts (hier nur der Typ,
 * damit das Modell nicht auf die Auswertung zeigt).
 */
export type Anzeigebedingung = { nicht?: boolean } & (
  /** Merkmal der Ablage (#1032). */
  | { art: 'merkmal'; merkmal: import('./merkmale').Merkmal }
  /** Feldwert der Mappe – wie in Ansichten, nur mit festen Vergleichswerten oder „heute“. */
  | { art: 'feld'; bedingung: import('./sichten').Feldbedingung }
  /** Ein Verweisfeld zeigt auf (mindestens) eine Mappe vom Typ `typ` (Id des Mappentyps). */
  | { art: 'verweistyp'; feld: string; typ: string }
);
/** „Anzeigen, wenn …“ (#1033): alle Bedingungen oder eine davon. */
export interface Anzeigeregel {
  /** alle: jede Bedingung muss zutreffen; eine: mindestens eine. */
  modus: 'alle' | 'eine';
  bedingungen: Anzeigebedingung[];
}

/**
 * Abschnitt in einem Feldregister (#890): Ab dem Feld `vor` beginnt eine neue Zeile. Mit Überschrift (`titel`) zeigt
 * die Mappe eine dünne Linie und die Überschrift, auf Wunsch eingeklappt; ohne Überschrift ist es nur ein Umbruch.
 * Nur Darstellung – Werte, Export, PDF der Angaben und API kennen keine Abschnitte.
 */
export interface Abschnitt {
  /** Kennung des Felds, vor dem der Abschnitt beginnt (ein Feld dieses Registers). */
  vor: string;
  /** Überschrift; fehlt = nur ein Zeilenumbruch. */
  titel?: string;
  /** Vorgabe beim Öffnen einer Mappe: eingeklappt (nur mit Überschrift). Jede Person kann es sich anders merken. */
  eingeklappt?: boolean;
  /** Überschrift in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<AbschnittTeile>;
  /**
   * „Anzeigen, wenn …“ (#1033): Trifft die Regel nicht zu, fehlt der Abschnitt samt allen Feldern bis zum nächsten
   * Abschnitt; deren Werte bleiben gespeichert. Fehlt = immer.
   */
  anzeigen?: Anzeigeregel;
}
/** Höchstlänge der Überschrift eines Abschnitts (#890). */
export const ABSCHNITT_TITEL_MAX = 80;

export const REGISTERARTEN = {
  felder: 'Feldregister',
  dokumente: 'Dokumentenregister',
  verknuepfungen: 'Verknüpfungsregister',
  /** Änderungshistorie der Mappe (#57). */
  protokoll: 'Historie',
} as const;
export type Registerart = keyof typeof REGISTERARTEN;

/** Quelle eines Verknüpfungsregisters: Mappen vom Typ `typId`, die über `feldKey` hierher verweisen. */
export interface Quelle {
  typId: string; feldKey: string;
  /** Trefferliste des Quelltyps, mit der das Register die Mappen als Tabelle zeigt (#75); leer = einfache Liste. */
  trefferliste?: string;
}

/** Ein Trennblatt an der Mappe. */
export interface Register {
  /** Fester Schlüssel (Dokumente merken sich ihr Register darüber). */
  key: string;
  name: string;
  art: Registerart;
  /** Feldregister: Schlüssel der Felder auf diesem Blatt. Jedes Feld liegt auf genau einem Feldregister. */
  felder?: string[];
  /** Verknüpfungsregister: welche Verweise es zeigt; leer = alle. */
  quellen?: Quelle[];
  /** Dokumentenregister: Volltext erzeugen (Texterkennung, #45); Standard: ja. */
  volltext?: boolean;
  /** Dokumentenregister (#194): Ersetzen legt eine neue Version an, die alte bleibt. */
  versionierung?: boolean;
  /** Nur die letzten N Versionen behalten (mit der aktuellen); leer = alle. */
  versionenBehalten?: number | null;
  /** Historie (#800): welche Gruppen von Einträgen das Register zeigt; fehlt = HISTORIE_VORAUSWAHL. */
  zeigt?: Historiengruppe[];
  /** Name in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<NamensTeile>;
  /** Feldregister (#890): Abschnitte zwischen den Feldern – Zeilenumbruch, Überschrift, eingeklappt. Fehlt = keine. */
  abschnitte?: Abschnitt[];
  /**
   * Ausgeblendet (#655): Die Mappe zeigt das Register nicht; Felder darauf gelten als ausgeblendet, ihre Werte bleiben.
   * Nicht bei Dokumentenregistern und nicht bei Registern mit Systemfeldern.
   */
  ausgeblendet?: boolean;
}

export interface MappentypDaten {
  name: string;
  /**
   * Feste Kennung (#145): nach dem Anlegen unveränderlich, z. B. für sprechende Links. Eigene Typen haben einen
   * Schlüssel ohne Präfix (`rechnung`), Typen aus Paketen `paket:schluessel` (#1084, z. B. `basis:person`).
   */
  schluessel?: string;
  beschreibung: string;
  /** Vorlage für den Titel einer Mappe, z. B. „{verwendungszweck} vom {zahlungsdatum}“. Leer = erstes Textfeld. */
  titelVorlage: string;
  felder: Feld[];
  register: Register[];
  /** Trefferlisten (#75): je Liste Spalten in ihrer Reihenfolge; genau eine ist Standard. */
  trefferlisten?: Trefferliste[];
  /**
   * Spalten der Standard-Trefferliste (Feldschlüssel oder Systemspalten wie _titel). Leer = einfache Liste.
   * Ältere Form; beim Speichern ersetzt sie die Spalten der Standardliste, wenn angegeben.
   */
  trefferliste?: string[];
  /** In der Ablage dürfen neue Mappen dieses Typs angelegt werden (Standard: ja). */
  erstellenErlaubt?: boolean;
  /** In der Ablage dürfen Mappen dieses Typs gelöscht werden (Standard: ja). */
  loeschenErlaubt?: boolean;
  /** Archivmodus (#212): Aufbewahrungsfrist und Stichtag; fehlt/null = aus. */
  archiv?: import('./archiv').Archiv | null;
  /**
   * Stempel beim Weitergeben (#394): vorschlagen oder Pflicht, mit Vorlage. Gespeichert in den
   * Einstellungen (nicht in der Tabelle der Mappentypen); beim Lesen und Speichern hier mitgeliefert.
   */
  stempel?: import('./stempel').StempelTyp | null;
  /** „Aus Dokument ausfüllen“ (#391): eigene Beschriftung oder ausgeblendet; wie der Stempel in den Einstellungen. */
  ausDokument?: import('./erkennung').AusDokument | null;
  /** Erkannte Post automatisch zuordnen (#337), Standard aus; wie der Stempel in den Einstellungen. */
  autoZuordnen?: boolean;
  /**
   * „Kann aus Post angelegt werden“ (#937): Der Typ steht bei „Wohin gehört das?“ zur Wahl. Fehlt bzw. null = Vorgabe:
   * an, wenn der Typ ein Dokumentenregister hat (siehe `kannAusPost`). Systemtypen nie.
   */
  ausPost?: boolean | null;
  /** „Woran man ihn erkennt“ (#937): kurzer Text für die Klassifizierung (#939), höchstens ERKENNBAR_AN_MAX Zeichen. */
  erkennbarAn?: string;
  /** Name, Beschreibung und „Woran man ihn erkennt“ in weiteren Sprachen (#728, #937). */
  beschriftungen?: Beschriftungen<TypTeile>;
}

/** Höchstlänge von „Woran man ihn erkennt“ (#937). */
export const ERKENNBAR_AN_MAX = 300;
/**
 * „Kann aus Post angelegt werden“ (#937): eingestellt – sonst an, wenn der Typ ein Dokumentenregister hat.
 * Systemtypen (Benutzer, Rolle, Post) nie.
 */
export function kannAusPost(t: Pick<MappentypDaten, 'ausPost' | 'register'> & { system?: Systemtyp | null }): boolean {
  if (t.system) return false;
  return t.ausPost ?? t.register.some((r) => r.art === 'dokumente');
}
export interface Mappentyp extends MappentypDaten {
  id: string;
  erstellt: string;
  geaendert: string;
  /** Paket, aus dem der Typ stammt (#1084) – der Teil vor dem Doppelpunkt der Kennung; fehlt bei eigenen Typen. */
  paket?: string;
  /** Systemmappentyp (Benutzer, Rolle): lässt sich erweitern, aber nicht löschen. */
  system?: Systemtyp | null;
  /** Berechtigungen (#123): Grundeinstellung und Regeln; fehlt = alles erteilt. Nur für Administratoren geliefert. */
  berechtigungen?: import('./rechte').Regelwerk | null;
  /** Nur für Nicht-Administratoren (#126): Darf man nach den Berechtigungen überhaupt Mappen dieses Typs anlegen? */
  darfAnlegen?: boolean;
  /**
   * Berechnete Felder (#1034), nur beim Lesen ergänzt: je Paket-Id an `berechnetVon` sein Name und ob es noch rechnet.
   * Fehlt, wenn der Typ keine berechneten Felder hat.
   */
  berechnung?: Record<string, import('./berechnet').Berechnung>;
}

/* ---------- Systemmappentypen: Benutzer und Rollen (#26, #27) ---------- */

export const SYSTEMTYPEN = { benutzer: t('gemeinsam.model.systemtyp.benutzer'), rolle: t('gemeinsam.model.systemtyp.rolle'), post: t('gemeinsam.model.systemtyp.post') } as const;
export type Systemtyp = keyof typeof SYSTEMTYPEN;

/** Kennung der Mappe einer Systemrolle, z. B. rolle:mitglied. */
export const systemrolleKennung = (r: keyof typeof ROLLEN) => `rolle:${r}`;
/** Frühere Systemrolle „Administrator“ (bis #818): wird beim Start zu einer gewöhnlichen Rolle ohne Mitglieder. */
export const FRUEHERE_ADMINROLLE = 'rolle:admin';
export const istSystemrolle = (m: Pick<Mappe, 'systemKennung'> | undefined) => !!m?.systemKennung?.startsWith('rolle:');

import { BELIEBIGER_TYP, gemeinsameFelder, jedeMappe, zieleVon, zielErlaubt } from './verweisziele';
export { BELIEBIGER_TYP, ZIELTYPEN_MAX, einzigesZiel, gemeinsameFelder, gleicheZiele, jedeMappe, mehrereZiele, normalisiereZiele, zielErlaubt, zieleVon, zielTypenAus } from './verweisziele';

/* ---------- Post (#192): alles, was hinein- oder hinausgeht ---------- */

/**
 * Feste Werte der Auswahlfelder von Post (#728): So stehen sie in jeder Mappe und bleiben unverändert – sie sind keine
 * Anzeigetexte. Die Beschriftung je Sprache kommt aus den Beschriftungen des Felds (siehe beschriftung.ts).
 */
export const POST_KANAL = { hochgeladen: 'Hochgeladen', email: 'E-Mail', scan: 'Scan', ordner: 'Ordner', import: 'Import', api: 'API', webdav: 'WebDAV' } as const;
export const POST_RICHTUNG = { eingehend: 'Eingehend', ausgehend: 'Ausgehend' } as const;
export const POST_STAND = { neu: 'Neu', zugeordnet: 'Zugeordnet', erledigt: 'Erledigt' } as const;
/** Ein Wert eines Auswahlfelds als Text (einfach oder erster einer Liste). */
export const auswahlText = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v));
/** Eine versendete E-Mail: festgehalten wie verschickt, ihre Felder ändert niemand. */
export const istVersendet = (w: Werte | undefined) => !!w && auswahlText(w.kanal) === POST_KANAL.email && auswahlText(w.richtung) === POST_RICHTUNG.ausgehend;

/**
 * Beschriftungen der Systemmappentypen in den eingebauten und installierten Sprachen (#729): aus den Sprachdateien,
 * nur wo die Sprache den Text selbst hat (kein Rückfall). Leer → undefined.
 */
export function systemBeschriftung<T extends object>(teile: Record<string, string | Record<string, string>>): Beschriftungen<T> | undefined {
  const aus: Record<string, Record<string, unknown>> = {};
  for (const spr of registrierteSprachen()) {
    const e: Record<string, unknown> = {};
    for (const [teil, k] of Object.entries(teile)) {
      if (typeof k === 'string') { const v = textNur(spr, k); if (v) e[teil] = v; continue; }
      const o = Object.fromEntries(Object.entries(k).map(([wert, kk]) => [wert, textNur(spr, kk)]).filter(([, v]) => v));
      if (Object.keys(o).length) e[teil] = o;
    }
    if (Object.keys(e).length) aus[spr] = e;
  }
  return Object.keys(aus).length ? aus as Beschriftungen<T> : undefined;
}
/** Feste Werte der Auswahlfelder von Post mit ihrem Schlüssel in der Sprachdatei. */
const POST_OPTIONEN: Record<string, Record<string, string>> = { stand: POST_STAND, kanal: POST_KANAL, richtung: POST_RICHTUNG };

/** Systemfelder je Systemtyp. Bezeichnung und Hilfetext darf der Administrator ändern, alles andere ist fest. */
export function systemfelder(s: Systemtyp, rolleTypId: string, benutzerTypId = ''): Feld[] {
  return systemfelderRoh(s, rolleTypId, benutzerTypId).map((f) => {
    // Beschriftungen je Sprache (#729): Bezeichnung, Hilfetext und Optionen der Post auf Englisch und in Sprachpaketen.
    const k = `gemeinsam.model.%s.${s}.${f.key.replace(/_/g, '-')}`;
    const optionen = s === 'post' && POST_OPTIONEN[f.key]
      ? Object.fromEntries(Object.entries(POST_OPTIONEN[f.key]).map(([slug, wert]) => [wert, `gemeinsam.model.systemoption.post.${f.key}.${slug}`])) : null;
    const b = systemBeschriftung<FeldTeile>({ label: k.replace('%s', 'systemfeld'), ...(f.hilfe ? { hilfe: k.replace('%s', 'systemhilfe') } : {}), ...(optionen ? { optionen } : {}) });
    return b ? { ...f, beschriftungen: b } : f;
  });
}
function systemfelderRoh(s: Systemtyp, rolleTypId: string, benutzerTypId = ''): Feld[] {
  // Bezeichnungen und Hilfetexte aus der Sprachdatei (#728); die festen Werte der Optionen bleiben, wie sie sind.
  const l = (k: string) => t.frei(`gemeinsam.model.systemfeld.${s}.${k.replace(/_/g, '-')}`);
  const h = (k: string) => t.frei(`gemeinsam.model.systemhilfe.${s}.${k.replace(/_/g, '-')}`);
  if (s === 'post') return [
    { key: 'betreff', label: l('betreff'), typ: 'text', pflicht: true, maxLen: 250, system: true },
    { key: 'stand', label: l('stand'), typ: 'auswahl', pflicht: true, optionen: Object.values(POST_STAND), system: true, hilfe: h('stand') },
    { key: 'kanal', label: l('kanal'), typ: 'auswahl', pflicht: true, optionen: Object.values(POST_KANAL), system: true, hilfe: h('kanal') },
    { key: 'richtung', label: l('richtung'), typ: 'auswahl', pflicht: true, optionen: Object.values(POST_RICHTUNG), system: true },
    { key: 'datum', label: l('datum'), typ: 'datum', system: true },
    { key: 'absender', label: l('absender'), typ: 'text', system: true },
    { key: 'an', label: l('an'), typ: 'text', system: true },
    { key: 'fuer', label: l('fuer'), typ: 'referenz', zielTypen: [benutzerTypId], verweisart: 'bezug', system: true, hilfe: h('fuer') },
    { key: 'bezug', label: l('bezug'), typ: 'referenz', mehrfach: true, zielTypen: [BELIEBIGER_TYP], verweisart: 'bezug', system: true, hilfe: h('bezug') },
    { key: 'nachricht', label: l('nachricht'), typ: 'langtext', system: true },
  ];
  if (s === 'rolle') return [
    { key: 'name', label: l('name'), typ: 'text', pflicht: true, eindeutig: true, maxLen: 80, system: true },
  ];
  return [
    { key: 'name', label: l('name'), typ: 'text', pflicht: true, system: true },
    { key: 'email', label: l('email'), typ: 'text', pflicht: true, eindeutig: true, system: true },
    { key: 'rollen', label: l('rollen'), typ: 'referenz', mehrfach: true, zielTypen: [rolleTypId], verweisart: 'bezug', system: true, hilfe: h('rollen') },
    { key: 'aktiv', label: l('aktiv'), typ: 'janein', system: true },
    // Abwesenheit (#78): gespiegelt aus Profil bzw. Benutzerverwaltung; „Abwesend“ = wirkt gerade.
    { key: 'abwesend', label: l('abwesend'), typ: 'janein', system: true, hilfe: h('abwesend') },
    { key: 'abwesend_von', label: l('abwesend_von'), typ: 'datum', system: true },
    { key: 'abwesend_bis', label: l('abwesend_bis'), typ: 'datum', system: true },
    { key: 'vertreter', label: l('vertreter'), typ: 'referenz', zielTypen: [benutzerTypId], verweisart: 'bezug', system: true, hilfe: h('vertreter') },
  ];
}

/** Lassen sich in der Ablage Mappen anlegen? Systemregeln (#146) und – für Nicht-Admins – die Berechtigungen. */
export const darfErstellen = (t: { system?: Systemtyp | null; darfAnlegen?: boolean } | undefined) => !!t && t.system !== 'benutzer' && t.system !== 'post' && t.darfAnlegen !== false;
/** Neue Post (#192) über „+ Post“ bzw. die API – nicht über das allgemeine Formular. */
export const darfPostAnlegen = (t: { system?: Systemtyp | null; darfAnlegen?: boolean } | undefined) => !!t && t.system === 'post' && t.darfAnlegen !== false;
/** Lässt sich die Mappe überhaupt löschen? Benutzer nur in der Benutzerverwaltung, Systemrollen nie (#146). */
export const darfLoeschen = (t: { system?: Systemtyp | null } | undefined, m?: Pick<Mappe, 'systemKennung'>) =>
  !!t && t.system !== 'benutzer' && !m?.systemKennung;

/**
 * Felder, die in der Ablage nur lesbar sind, mit dem Grund.
 * Benutzer: alle Systemfelder (gepflegt in Profil und Benutzerverwaltung) – sonst könnte
 * z. B. ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto übernehmen.
 * Systemrollen: der Name.
 */
export function geschuetzteFelder(eintrag: Pick<Mappentyp, 'system' | 'felder'> | undefined, m?: Pick<Mappe, 'systemKennung'> & { werte?: Werte }): Record<string, string> {
  if (eintrag?.system === 'benutzer') {
    return Object.fromEntries(eintrag.felder.filter((f) => f.system).map((f) => [f.key, t('gemeinsam.model.wird-im-profil-und')]));
  }
  if (eintrag?.system === 'rolle' && istSystemrolle(m)) return { name: t('gemeinsam.model.der-name-einer-systemrolle') };
  if (eintrag?.system === 'post') {
    // Post (#192): Kanal hält das System fest, „Zugeordnet zu“ setzt „Zuordnen“; eine versendete E-Mail bleibt, wie sie verschickt wurde.
    const fest: Record<string, string> = { kanal: t('gemeinsam.model.wird-beim-eingang-festgehalten'), bezug: t('gemeinsam.model.wird-ueber-zuordnen-gesetzt') };
    if (istVersendet(m?.werte)) for (const k of ['betreff', 'an', 'absender', 'datum', 'nachricht', 'richtung']) fest[k] = t('gemeinsam.model.wird-beim-versand-festgehalten');
    return fest;
  }
  // Nummernkreis (#171): die Nummer vergibt das DMS.
  const nummern = (eintrag?.felder ?? []).filter((f) => kreisVon(f));
  if (nummern.length) return Object.fromEntries(nummern.map((f) => [f.key, m ? t('gemeinsam.model.fortlaufende-nummer-laesst-sich') : t('gemeinsam.model.wird-beim-speichern-vergeben')]));
  return {};
}

/** Systemeigene Spalten für Trefferlisten; beginnen mit _, damit sie nie mit Feldschlüsseln kollidieren. */
export const SYSTEMSPALTEN = {
  _titel: 'Titel', _typ: 'Mappentyp', _erstellt: 'Angelegt', _erstelltVon: 'Angelegt von', _geaendert: 'Zuletzt geändert', _geaendertVon: 'Zuletzt geändert von',
} as const;
export type Systemspalte = keyof typeof SYSTEMSPALTEN;
export const istSystemspalte = (k: string): k is Systemspalte => Object.prototype.hasOwnProperty.call(SYSTEMSPALTEN, k);
/** Spalten für Sichten mit gemischten Mappentypen (z. B. Eingang). */
/** Eine Trefferliste eines Mappentyps (#75). */
export interface Trefferliste {
  /** Fester Schlüssel; Sichten und Verknüpfungsregister wählen die Liste darüber. */
  key: string;
  name: string;
  /** Spalten in ihrer Reihenfolge: Feldschlüssel oder Systemspalten (_titel, _erstellt, …). Leer = einfache Liste. */
  spalten: string[];
  standard?: boolean;
  /** Name in weiteren Sprachen (#728). */
  beschriftungen?: Beschriftungen<NamensTeile>;
}

/** Trefferlisten eines Typs; Typen aus der Zeit vor #75 haben genau eine („Standard“). */
export function trefferlistenVon(t: Pick<MappentypDaten, 'trefferlisten' | 'trefferliste'>): Trefferliste[] {
  return t.trefferlisten?.length ? t.trefferlisten : [{ key: 'standard', name: tx('gemeinsam.model.trefferliste-standard'), spalten: t.trefferliste ?? [], standard: true }];
}
/** Die Standard-Trefferliste eines Typs. */
export function standardliste(t: Pick<MappentypDaten, 'trefferlisten' | 'trefferliste'>): Trefferliste {
  const l = trefferlistenVon(t);
  return l.find((x) => x.standard) ?? l[0];
}

export const GEMISCHTE_SPALTEN: Systemspalte[] = ['_titel', '_typ', '_erstelltVon', '_erstellt', '_geaendertVon', '_geaendert'];

/** Nach welchen Spalten der Server sortieren kann (Verweise und lange Texte nicht). */
export function sortierbar(spalte: string, t?: Pick<Mappentyp, 'felder'>): boolean {
  if (istSystemspalte(spalte)) return true;
  const f = t?.felder.find((x) => x.key === spalte);
  return !!f && f.typ !== 'referenz' && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort' && f.typ !== 'tabelle';
}
export interface Sortierung { spalte: string; absteigend: boolean }

export interface Betrag { betrag: number; waehrung: string }
export type { Zeitraum } from './feldarten';
/**
 * Wert eines Passwortfelds (#46), wie ihn Oberfläche und API sehen: nie das Passwort selbst.
 * - gesetzt/lesbar: kommt vom Server (lesbar = false, wenn der Schlüssel dazu fehlt)
 * - neu: zum Speichern eines neuen Passworts; entfernen: zum Löschen
 */
export interface PasswortWert { gesetzt?: boolean; lesbar?: boolean; neu?: string; entfernen?: boolean }
export type Wert = string | number | boolean | Betrag | Zeitraum | string[] | PasswortWert | null;
export const istPasswortWert = (v: unknown): v is PasswortWert =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('gesetzt' in v || 'neu' in v || 'entfernen' in v);
export type Werte = Record<string, Wert>;

export interface Mappe {
  id: string;
  typId: string;
  werte: Werte;
  /** Feste Indexwerte, unabhängig vom Mappentyp. */
  erstellt: string;
  erstelltVon: string | null;
  geaendert: string;
  geaendertVon: string | null;
  /** Mit dem Demo-Generator erzeugt; lässt sich gesammelt entfernen. */
  demo?: boolean;
  /** Vom Server aus der Titel-Vorlage berechnet und gespeichert (leer = ohne Titel). */
  titel?: string;
  /** Passt zur aktuellen Definition des Typs (vom Server geprüft); sonst steht in problem der erste Grund. */
  passt?: boolean;
  problem?: string | null;
  /** Mappen, die das System pflegt: Systemrollen (rolle:mitglied, rolle:systemkonto, rolle:paket). */
  systemKennung?: string | null;
  /** Berechtigungen (#124): im Eingang wegen einer Aufgabe, aber nicht lesbar – ohne Titel und Werte. */
  verborgen?: boolean;
}

/** Kurzangaben zu einer Mappe, auf die verwiesen wird oder die verweist. */
export interface MappenBezug { titel: string; typId: string; /** Berechtigungen (#124): nicht lesbar, Titel ausgeblendet. */ verborgen?: boolean }

/** Erster Grund, warum Werte nicht zur Definition passen (für Listen und den Eingang). */
export function ersterGrund(t: Pick<Mappentyp, 'felder'>, p: Pruefergebnis): string | null {
  const [key, msg] = Object.entries(p.felder)[0] ?? [];
  if (key) return `${t.felder.find((f) => f.key === key)?.label ?? key}: ${msg?.[0] ?? 'ungültig'}`;
  return p.allgemein[0] ?? null;
}

/**
 * Wirksame Rolle in einer Anfrage (#818, #819): `admin` nur im Verwaltungsmodus einer Person mit Verwaltungsrecht
 * (oder über den Befehl `dms` im Container) – sonst immer `mitglied`. Gespeichert wird keine Rolle mehr, sondern das
 * Verwaltungsrecht an der Person (`Benutzer.verwaltung`, siehe verwaltungsrecht.ts). Einen Kontotyp „Administrator“
 * gibt es nicht mehr.
 */
export type Rolle = 'admin' | 'mitglied';
/** Systemrollen als Rollen-Mappen (`rolle:mitglied`); die frühere Systemrolle „Administrator“ ist entfallen (#818). */
export const ROLLEN: Record<'mitglied', string> = { mitglied: 'Mitglied' };

/**
 * Systemrollen für Konten, die kein Mensch sind (#673): Systemkonto (z. B. „Automatisierung“) und Paket (Dienstkonten
 * der Pakete mit Code). Sie stehen neben Administrator und Mitglied als Rollen-Mappen (`rolle:systemkonto`,
 * `rolle:paket`) und lassen sich in Regeln am Mappentyp nennen – vergeben werden sie nie an Menschen.
 */
export type Kontorolle = 'systemkonto' | 'paket';
export const KONTOROLLEN: Record<Kontorolle, string> = { systemkonto: 'Systemkonto', paket: 'Paket' };
export const kontorolleKennung = (r: Kontorolle) => `rolle:${r}`;
/** Systemkonten des DMS (#673): Kennung → Anzeigename. */
export const SYSTEMKONTEN = { automatisierung: 'Automatisierung' } as const;
export type Systemkonto = keyof typeof SYSTEMKONTEN;
/** Die Systemrolle eines Kontos, wie sie die Oberfläche zeigt. */
export const kontorolleVon = (b: Pick<Benutzer, 'art'>): Kontorolle | null => (b.art === 'system' ? 'systemkonto' : b.art === 'dienst' ? 'paket' : null);

export interface Benutzer {
  id: string;
  email: string;
  name: string;
  /** Wirksame Rolle dieser Anfrage: `admin` nur im Verwaltungsmodus (#819). Gespeichert ist immer `mitglied`. */
  rolle: Rolle;
  /** Verwaltungsrecht an der Person (#818): leer = verwaltet nicht, `['*']` = Gesamte Verwaltung, sonst Bereiche. */
  verwaltung?: string[];
  aktiv: boolean;
  /** false, solange der Benutzer sein Passwort noch nicht über den Link gesetzt hat. */
  hatPasswort: boolean;
  erstellt: string;
  letzteAnmeldung: string | null;
  /** Letzte Aktivität in irgendeiner gültigen Sitzung (nur in der Benutzerverwaltung). */
  zuletztAktiv?: string | null;
  /** Zeigt beim Aufruf einer Seite die Dauer der einzelnen Schritte (im eigenen Profil schaltbar). */
  entwicklermodus?: boolean;
  /** Gewählte Sprache (#729, Mein Konto); leer = die der Installation. Gilt nur, solange sie erlaubt ist. */
  sprache?: string | null;
  /** „Übersetzung anzeigen“ anbieten (#732, Mein Konto); false = für sich abgeschaltet. Vorgabe an. */
  uebersetzen?: boolean;
  /** Weitere (fachliche) Rollen: Ids der Rollen-Mappen (nur in der Benutzerverwaltung). */
  rollen?: string[];
  /** Abwesenheit mit Vertreter (#78). Der Vertreter bleibt nach dem Deaktivieren hinterlegt und wirkt dann dauerhaft. */
  abwesenheit?: Abwesenheit;
  /** Wann der Benutzer deaktiviert wurde (#77), sofern bekannt. */
  deaktiviert?: string | null;
  /** Offene Aufgaben (nur in der Benutzerverwaltung). */
  offeneAufgaben?: number;
  /**
   * Kein Mensch (#338, #673): `dienst` = Dienstkonto eines Pakets mit Code (Systemrolle „Paket“), `system` = Systemkonto
   * des DMS, z. B. „Automatisierung“ (Systemrolle „Systemkonto“). Beide melden sich nie an und stehen in keiner Auswahl.
   */
  art?: 'dienst' | 'system';
  /** Paket, zu dem das Dienstkonto gehört. */
  paketId?: string;
  /** Kennung des Systemkontos, z. B. `automatisierung`. */
  systemkonto?: string;
}

/** Ein Mensch – kein Dienst- oder Systemkonto (#673). */
export const istPerson = (b: Pick<Benutzer, 'art'> | undefined | null): boolean => !!b && !b.art;

/** Abwesenheit (#78): an/aus, optionaler Zeitraum (JJJJ-MM-TT, jeweils einschließlich), Vertreter. */
export interface Abwesenheit { an: boolean; von: string | null; bis: string | null; vertreterId: string | null }
export const KEINE_ABWESENHEIT: Abwesenheit = { an: false, von: null, bis: null, vertreterId: null };
/** Wirkt die Abwesenheit an diesem Tag (JJJJ-MM-TT)? */
export const abwesenheitWirkt = (a: Abwesenheit | undefined, heute: string) =>
  !!a?.an && (!a.von || a.von <= heute) && (!a.bis || a.bis >= heute);
/** Höchstens so viele Schritte folgt die Umleitung einer Vertreterkette. */
export const VERTRETER_SCHRITTE = 3;

/** Als „gerade aktiv“ gilt, wer in den letzten so vielen Minuten etwas getan hat. */
export const AKTIV_MINUTEN = 15;
export const istGeradeAktiv = (zuletzt: string | null | undefined, jetzt = Date.now()) =>
  !!zuletzt && jetzt - new Date(zuletzt).getTime() < AKTIV_MINUTEN * 60_000;

/** Eine Anmeldung auf einem Gerät. */
export interface Sitzung {
  id: string;
  benutzerId: string;
  erstellt: string;
  zuletztAktiv: string;
  ablauf: string;
  /** User-Agent des Browsers. */
  geraet: string;
  ip: string;
  /** Gesetzt, wenn ein Administrator in dieser Sitzung als der Benutzer agiert. */
  vertretungId: string | null;
  /** Die Sitzung der aktuellen Anfrage. */
  aktuell?: boolean;
}

/** Ein Administrator hat als ein anderer Benutzer agiert. */
export interface Vertretung { id: string; benutzerId: string; adminId: string | null; adminName: string; beginn: string; ende: string | null }

/** Kurzbeschreibung eines Browsers aus dem User-Agent, z. B. „Firefox auf Windows“. */
export function geraetText(ua: string): string {
  if (!ua) return t('gemeinsam.model.unbekanntes-geraet');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici/i.test(ua) ? 'Programm' : 'Browser';
  const system = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return system ? `${browser} auf ${system}` : browser;
}

export const PASSWORT_MINDESTLAENGE = 10;
export const istEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Ergebnis einer Prüfung: allgemeine Meldungen und Meldungen je Feld. */
export interface Pruefergebnis {
  allgemein: string[];
  /** Mappen: je Feldschlüssel. Mappentypen: je Feldposition. */
  felder: Record<string, string[]>;
  /** Mappentypen (#144): zu jeder allgemeinen Meldung der Bereich im Editor (grunddaten, titel, trefferlisten, register). */
  orte?: string[];
}
export const istOk = (p: Pruefergebnis) => p.allgemein.length === 0 && Object.keys(p.felder).length === 0;

/* ---------------------------------------------------------------- */

/** Kennung von Feld, Register und eigenem Mappentyp (#1084: bis 60 Zeichen, kennungen.ts). */
export const SCHLUESSEL_MUSTER = SCHLUESSEL;

export function istLeer(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (istPasswortWert(v)) return !!v.entfernen || (!v.gesetzt && !v.neu);
  if (typeof v === 'object' && 'betrag' in (v as object)) {
    const b = (v as Betrag).betrag;
    return b == null || (b as unknown) === '';
  }
  // Zeitraum (#1035): ohne Anzahl leer, auch wenn eine Einheit gewählt ist.
  if (hatZeitraumform(v)) return v.anzahl == null || v.anzahl === '';
  return false;
}

/** Prüft die Definition eines Mappentyps. */
export interface TypKontext {
  eigeneId?: string;
  namenAndererTypen: string[];
  /** Schlüssel der anderen Mappentypen (#145). */
  schluesselAndererTypen?: string[];
  existiertTyp: (id: string) => boolean;
  /** Auswahlfilter prüfen (#172; aus sichten.ts, hier ohne Kreisimport). */
  auswahlProbleme?: (bed: import('./sichten').Feldbedingung[], zielFelder: Feld[], eigene: { felder: Feld[]; feldKey: string }) => string[];
  /** Schlüssel der Nummernkreise (#171); fehlt: nicht prüfen. */
  nummernkreise?: string[];
  /** Felder eines anderen Typs (für Quellen von Verknüpfungsregistern). */
  felderVon?: (typId: string) => Feld[] | undefined;
  /** Felder und Trefferlisten eines anderen Typs (Tabelle, #1030); fehlt: aus `felderVon` ohne eigene Trefferlisten. */
  typVon?: (typId: string) => Pick<Mappentyp, 'felder' | 'trefferlisten' | 'trefferliste'> | undefined;
}

/** Allgemeine Meldung mit Bereich des Editors (#144). */
function melde(p: Pruefergebnis, ort: string, text: string) { p.allgemein.push(text); (p.orte ??= []).push(ort); }

function pruefeRegister(mappentypDaten: MappentypDaten, ctx: TypKontext, p: Pruefergebnis) {
  const reg = mappentypDaten.register ?? [];
  if (!reg.length) { melde(p, 'register', t('gemeinsam.model.der-mappentyp-braucht-mindestens')); return; }
  const keys = new Set<string>();
  const feldAuf = new Map<string, string>();
  for (const r of reg) {
    const name = (r.name ?? '').trim() || r.key;
    if (!(r.name ?? '').trim()) melde(p, 'register', t('gemeinsam.model.jedes-register-braucht-einen'));
    if (!SCHLUESSEL_MUSTER.test(r.key ?? '')) melde(p, 'register', t('gemeinsam.model.register-ungueltige-kennung', { name }));
    else if (keys.has(r.key)) melde(p, 'register', t('gemeinsam.model.die-register-kennung-kommt', { key: r.key }));
    keys.add(r.key);
    if (!(r.art in REGISTERARTEN)) melde(p, 'register', t('gemeinsam.model.register-unbekannte-art', { name }));
    if (r.art === 'felder') {
      for (const k of r.felder ?? []) {
        if (feldAuf.has(k)) melde(p, 'register', t('gemeinsam.model.das-feld-liegt-auf', { wert: mappentypDaten.felder.find((f) => f.key === k)?.label ?? k }));
        feldAuf.set(k, r.key);
      }
    }
    if (r.art === 'verknuepfungen') {
      for (const q of r.quellen ?? []) {
        const felder = q.typId === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(q.typId);
        const f = felder?.find((x) => x.key === q.feldKey);
        if (!f || f.typ !== 'referenz' || !zielErlaubt(f, ctx.eigeneId)) melde(p, 'register', t('gemeinsam.model.register-eine-quelle-verweist', { name }));
      }
    }
  }
  // Ausblenden (#655): Ein Register muss die Mappe zeigen.
  if (reg.every((r) => r.ausgeblendet)) melde(p, 'register', t('gemeinsam.model.ein-register-muss-sichtbar'));
  if (mappentypDaten.felder.length && !reg.some((r) => r.art === 'felder')) melde(p, 'register', t('gemeinsam.model.es-gibt-felder-aber'));
  const ohne = mappentypDaten.felder.filter((f) => !feldAuf.has(f.key));
  if (ohne.length && reg.some((r) => r.art === 'felder')) melde(p, 'register', t('gemeinsam.model.diese-felder-liegen-auf', { map: ohne.map((f) => f.label || f.key).join(', ') }));
}

/** Tabellen (#1030) haben keinen Wert – weder im Titel noch als Spalte einer Trefferliste. */
function pruefeTabellenOhneWert(mappentypDaten: MappentypDaten, p: Pruefergebnis) {
  const istT = (k: string) => mappentypDaten.felder.some((f) => f.key === k && f.typ === 'tabelle');
  const imTitel = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter(istT);
  if (imTitel.length) melde(p, 'titel', t('gemeinsam.tabelle.nicht-im-titel', { map: imTitel.map((k) => `{${k}}`).join(', ') }));
  if ([...(mappentypDaten.trefferliste ?? []), ...(mappentypDaten.trefferlisten ?? []).flatMap((l) => l.spalten)].some(istT)) melde(p, 'trefferlisten', t('gemeinsam.tabelle.keine-spalte'));
}

export function pruefeMappentyp(mappentypDaten: MappentypDaten, ctx: TypKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const name = (mappentypDaten.name ?? '').trim();
  if (!name) melde(p, 'grunddaten', t('gemeinsam.model.der-mappentyp-braucht-einen'));
  else if (ctx.namenAndererTypen.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
    melde(p, 'grunddaten', t('gemeinsam.model.es-gibt-bereits-einen', { name }));
  if (mappentypDaten.schluessel !== undefined) {
    if (!TYP_KENNUNG.test(mappentypDaten.schluessel)) melde(p, 'grunddaten', t('gemeinsam.model.kennung-des-mappentyps-nur'));
    else if ((ctx.schluesselAndererTypen ?? []).includes(mappentypDaten.schluessel)) melde(p, 'grunddaten', t('gemeinsam.model.die-kennung-hat-schon', { schluessel: mappentypDaten.schluessel }));
  }
  if (!Array.isArray(mappentypDaten.felder)) {
    melde(p, 'felder', t('gemeinsam.model.die-felder-fehlen'));
    return p;
  }
  const unbekannt = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter((k) => !istIndexplatzhalter(k) && !mappentypDaten.felder.some((f) => f.key === k));
  if (unbekannt.length) melde(p, 'titel', t('gemeinsam.model.die-titel-vorlage-nennt', { map: unbekannt.map((k) => `{${k}}`).join(', ') }));
  const geheim = vorlageFelder(mappentypDaten.titelVorlage ?? '').filter((k) => mappentypDaten.felder.some((f) => f.key === k && f.typ === 'passwort'));
  if (geheim.length) melde(p, 'titel', t('gemeinsam.model.passwortfelder-duerfen-nicht-im', { map: geheim.map((k) => `{${k}}`).join(', ') }));
  pruefeTabellenOhneWert(mappentypDaten, p);
  for (const x of pruefeTitelFilter({ felder: mappentypDaten.felder, titelVorlage: mappentypDaten.titelVorlage ?? '' })) melde(p, 'titel', x);
  if ((mappentypDaten.trefferliste ?? []).some((k) => mappentypDaten.felder.some((f) => f.key === k && f.typ === 'passwort'))) melde(p, 'trefferlisten', t('gemeinsam.model.passwortfelder-koennen-keine-spalte'));
  pruefeRegister(mappentypDaten, ctx, p);

  const gesehen = new Set<string>();
  mappentypDaten.felder.forEach((f, i) => {
    const m: string[] = [];
    if (!(f.label ?? '').trim()) m.push(t('gemeinsam.model.bezeichnung-fehlt'));
    if (!(f.typ in FELDTYPEN)) m.push(t('gemeinsam.model.unbekannte-feldart'));
    if (!SCHLUESSEL_MUSTER.test(f.key ?? '')) m.push(t('gemeinsam.model.kennung-nur-kleinbuchstaben-ziffern'));
    else if (gesehen.has(f.key)) m.push(t('gemeinsam.model.kennung-kommt-doppelt-vor', { key: f.key }));
    else if (istIndexplatzhalter(f.key)) m.push(t('gemeinsam.model.kennung-ist-fuer-den', { key: f.key, INDEXPLATZHALTER: INDEXPLATZHALTER[f.key as Indexplatzhalter] }));
    gesehen.add(f.key);
    if (f.typ === 'referenz') {
      // Ziele (#1036): ein oder mehrere Mappentypen; nur aus einem Paket mit optionalen Zielen darf die Liste (noch) leer sein.
      const ziele = zieleVon(f);
      if (jedeMappe(f)) { if (!f.system) m.push(t('gemeinsam.model.ziel-mappentyp-auswaehlen')); }
      else if (!ziele.length) { if (!f.zielOptional?.length) m.push(t('gemeinsam.model.ziel-mappentyp-auswaehlen')); }
      else if (ziele.some((z) => z !== ctx.eigeneId && !ctx.existiertTyp(z))) m.push(t('gemeinsam.model.der-ziel-mappentyp-existiert'));
      else if (f.auswahlFilter?.length && ctx.auswahlProbleme) {
        // Auswahlfilter (#172): Bedingungen gegen die Felder des Zieltyps – bei mehreren gegen die Felder, die alle haben.
        const listen = ziele.map((z) => (z === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(z)));
        if (listen.every(Boolean)) for (const x of ctx.auswahlProbleme(f.auswahlFilter, gemeinsameFelder(listen as Feld[][]), { felder: mappentypDaten.felder, feldKey: f.key })) m.push(`Auswahlfilter: ${x}`);
      }
      // „Alle vom selben Typ“ (#1036) nur mit mehreren Mappen; mit (noch) einem Zieltyp schadet es nicht – optionale können kommen.
      if (f.gleicherTyp && !f.mehrfach) m.push(t('gemeinsam.model.gleicher-typ-nur-mehrfach'));
      // Folgt aus (#886): Quelle und Zielfeld gibt es und sie passen; Kreise meldet die Prüfung unten.
      if (f.folgtAus) m.push(...folgtAusProbleme(mappentypDaten.felder, f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    }
    // Beim Auswählen übernehmen (#1037): Felder gibt es und sie passen zusammen; nie aus oder in Passwortfelder.
    if (f.vorbelegen?.length) m.push(...vorbelegenProbleme(mappentypDaten.felder, f, (id) => (id === ctx.eigeneId ? mappentypDaten.felder : ctx.felderVon?.(id))));
    // Tabelle (#1030): Quelle wie bei einem Verknüpfungsregister – das Feld des anderen Typs muss hierher verweisen.
    if (f.typ === 'tabelle') {
      m.push(...tabellenProbleme(f, {
        eigeneId: ctx.eigeneId, zielErlaubt, listen: trefferlistenVon,
        typ: (id) => (id === ctx.eigeneId ? mappentypDaten : ctx.typVon?.(id) ?? (ctx.felderVon?.(id) ? { felder: ctx.felderVon(id)! } : undefined)),
      }));
      if (f.pflicht || f.eindeutig) m.push(t('gemeinsam.tabelle.kein-wert'));
    }
    if (f.typ === 'auswahl' && !(f.optionen ?? []).length) m.push(t('gemeinsam.model.mindestens-einen-auswahlwert'));
    if ((f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') && f.minLen != null && f.maxLen != null && f.minLen > f.maxLen)
      m.push(t('gemeinsam.model.mindestlaenge-ist-groesser-als'));
    if ((f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'prozent') && typeof f.min === 'number' && typeof f.max === 'number' && f.min > f.max)
      m.push(t('gemeinsam.model.minimum-ist-groesser-als'));
    // Betrag (#1035): Ein Minimum unter 0 verlangt „negative Beträge erlauben“.
    if (f.typ === 'betrag' && !f.negativ && typeof f.min === 'number' && f.min < 0) m.push(t('gemeinsam.feldarten.minimum-negativ'));
    if (f.typ === 'zeitraum' && f.standard != null && f.standard !== '' && !istZeitraum(leseZeitraum(f.standard))) m.push(t('gemeinsam.feldarten.standard-zeitraum'));
    if (f.typ === 'prozent' && f.standard != null && f.standard !== '' && !Number.isFinite(leseProzent(f.standard))) m.push(t('gemeinsam.feldarten.standard-prozent'));
    // Format und Datumsgrenzen (#535).
    m.push(...pruefeFormatDefinition(f, mappentypDaten.felder));
    if (f.typ === 'text' && f.muster) {
      try { new RegExp(f.muster); } catch { m.push(t('gemeinsam.model.das-muster-ist-kein')); }
    }
    // Nummernkreis im Standardwert (#171): nur an Textfeldern, den Kreis muss es geben.
    const kreis = kreisImStandard(f.standard);
    if (kreis) {
      if (f.typ !== 'text') m.push(t('gemeinsam.model.einen-nummernkreis-gibt-es'));
      else if (ctx.nummernkreise && !ctx.nummernkreise.includes(kreis)) m.push(t('gemeinsam.model.den-nummernkreis-gibt-es', { kreis }));
    }
    if (m.length) p.felder[String(i)] = m;
  });
  // Folgt aus (#886): keine Kreise (Organisation aus Niederlassung und Niederlassung aus Organisation).
  const kreis = folgtAusKreis(mappentypDaten.felder);
  if (kreis.length) {
    const namen = kreis.map((k) => `„${mappentypDaten.felder.find((f) => f.key === k)?.label || k}“`).join(', ');
    mappentypDaten.felder.forEach((f, i) => { if (kreis.includes(f.key)) (p.felder[String(i)] ??= []).push(t('gemeinsam.folgtaus.kreis', { felder: namen })); });
  }
  return p;
}

export interface MappenKontext {
  /** Typ-Id der Mappe mit dieser Id, oder undefined, wenn es sie nicht gibt. */
  typVon: (mappeId: string) => string | undefined;
  /** Titel einer anderen Mappe desselben Typs mit gleichem Wert ('' = vorhanden, aber nicht lesbar), sonst undefined. */
  doppelt: (feldKey: string, wert: string | number) => string | undefined;
  /** Felder, die gerade nicht zu sehen sind (Anzeige-Bedingungen, #1033): nie Pflicht. Siehe `pruefeMitAnzeige`. */
  verborgen?: Set<string>;
}

/** Prüft die Werte einer Mappe gegen die aktuelle Definition ihres Typs. */
export function pruefeMappe(pick: Pick<Mappentyp, 'felder'>, werte: Werte, ctx: MappenKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const fehler = (k: string, msg: string) => { p.felder[k] = [msg]; };

  for (const f of pick.felder) {
    const v = werte?.[f.key];
    // Nummernkreis (#171): Wert vergibt das DMS, keine Prüfung der Eingabe.
    if (kreisVon(f)) continue;
    if (istLeer(v)) {
      if (f.pflicht && f.typ !== 'janein' && !ctx.verborgen?.has(f.key)) fehler(f.key, t('gemeinsam.model.pflichtfeld-bitte-ausfuellen'));
      continue;
    }
    switch (f.typ) {
      case 'text':
      case 'langtext':
      case 'formatiert': {
        if (typeof v !== 'string') { fehler(f.key, t('gemeinsam.model.text-erwartet')); break; }
        if (f.minLen != null && v.length < f.minLen) fehler(f.key, t('gemeinsam.model.mindestens-zeichen', { minLen: f.minLen }));
        else if (f.maxLen != null && v.length > f.maxLen) fehler(f.key, t('gemeinsam.model.hoechstens-zeichen', { maxLen: f.maxLen }));
        else if (f.typ === 'text' && f.muster) {
          try { if (!new RegExp('^(?:' + f.muster + ')$').test(v)) fehler(f.key, t('gemeinsam.model.passt-nicht-zum-vorgegebenen')); } catch { /* Definition prüft das */ }
        }
        break;
      }
      case 'zahl':
      case 'prozent':
      case 'betrag': {
        const x = f.typ === 'betrag' ? (v as Betrag)?.betrag : v;
        if (typeof x !== 'number' || !Number.isFinite(x)) { fehler(f.key, f.typ === 'betrag' ? t('gemeinsam.model.kein-gueltiger-betrag') : f.typ === 'prozent' ? t('gemeinsam.feldarten.kein-prozent') : t('gemeinsam.model.keine-gueltige-zahl')); break; }
        // Negativer Betrag (#1035) nur, wenn das Feld es erlaubt – Vorgabe wie bisher ≥ 0.
        if (f.typ === 'betrag' && !f.negativ && x < 0) fehler(f.key, t('gemeinsam.feldarten.betrag-nicht-negativ'));
        else if (typeof f.min === 'number' && x < f.min) fehler(f.key, t('gemeinsam.model.mindestens', { min: f.min.toLocaleString(gebietsschema()) }));
        else if (typeof f.max === 'number' && x > f.max) fehler(f.key, t('gemeinsam.model.hoechstens', { max: f.max.toLocaleString(gebietsschema()) }));
        else if ((f.typ === 'zahl' || f.typ === 'prozent') && f.nachkomma != null && (String(x).split('.')[1] ?? '').length > f.nachkomma)
          fehler(f.key, t('gemeinsam.model.hoechstens-nachkommastellen', { nachkomma: f.nachkomma }));
        if (f.typ === 'betrag' && !p.felder[f.key] && !/^[A-Z]{3}$/.test((v as Betrag).waehrung ?? ''))
          fehler(f.key, t('gemeinsam.model.waehrung-als-dreistelliger-code'));
        break;
      }
      case 'datum':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) fehler(f.key, t('gemeinsam.model.kein-gueltiges-datum'));
        break;
      case 'zeitraum':
        // Gespeichert immer als { anzahl, einheit } (#1035); Texte wie „3 Monate“ gleicht bereinigeWerte vorher an.
        if (!istZeitraum(v)) fehler(f.key, t('gemeinsam.feldarten.kein-zeitraum', { max: ZEITRAUM_ANZAHL_MAX }));
        break;
      case 'janein':
        if (typeof v !== 'boolean') fehler(f.key, t('gemeinsam.model.ja-oder-nein-erwartet'));
        break;
      case 'auswahl': {
        const liste = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, t('gemeinsam.model.nur-ein-wert-erlaubt')); break; }
        const falsch = liste.filter((x) => !(f.optionen ?? []).includes(String(x)));
        if (falsch.length) fehler(f.key, t('gemeinsam.model.nicht-in-der-auswahlliste', { falsch: falsch.join(', ') }));
        break;
      }
      case 'passwort':
        // Auf dem Server verschlüsselt (Text), in der Oberfläche als PasswortWert.
        if (typeof v !== 'string' && !istPasswortWert(v)) fehler(f.key, t('gemeinsam.model.ungueltiger-wert-fuer-ein'));
        break;
      case 'referenz': {
        const ids = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, t('gemeinsam.model.nur-ein-verweis-erlaubt')); break; }
        if (ids.some((id) => typeof id !== 'string' || ctx.typVon(id) === undefined)) fehler(f.key, t('gemeinsam.model.verweist-auf-eine-mappe'));
        else if (ids.some((id) => !zielErlaubt(f, ctx.typVon(id as string)))) fehler(f.key, t('gemeinsam.model.verweist-auf-eine-mappe-2'));
        // „Alle vom selben Typ“ (#1036): wie die erste Mappe.
        else if (f.gleicherTyp && f.mehrfach && new Set(ids.map((id) => ctx.typVon(id as string))).size > 1) fehler(f.key, t('gemeinsam.model.gleicher-typ'));
        break;
      }
    }
    if (!p.felder[f.key] && f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) {
      const titel = ctx.doppelt(f.key, v as string | number);
      // Leer: die andere Mappe darf der Benutzer nicht sehen – dann ohne ihren Titel (#743).
      if (titel !== undefined) fehler(f.key, titel ? t('gemeinsam.model.bereits-vergeben-in', { titel }) : t('gemeinsam.model.bereits-vergeben'));
    }
  }
  return p;
}

/** Alle Verweise einer Mappe: [feldKey, zielId] je Referenzwert. */
export function verweiseVon(t: Pick<Mappentyp, 'felder'>, werte: Werte): Array<{ feldKey: string; zielId: string }> {
  const out: Array<{ feldKey: string; zielId: string }> = [];
  for (const f of t.felder) {
    if (f.typ !== 'referenz') continue;
    const v = werte?.[f.key];
    if (istLeer(v)) continue;
    for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string') out.push({ feldKey: f.key, zielId: id });
  }
  return out;
}

/** Platzhalter `{feld}` bzw. `{feld|filter…}` (#170). */
const PLATZHALTER = PLATZHALTER_MIT_FILTERN;

/** Feste Indexwerte, die jede Titel-Vorlage zusätzlich zu den Feldern verwenden kann. */
export const INDEXPLATZHALTER = { angelegt: t('gemeinsam.model.index.angelegt'), geaendert: t('gemeinsam.model.index.geaendert') } as const;
export type Indexplatzhalter = keyof typeof INDEXPLATZHALTER;
export const istIndexplatzhalter = (k: string): k is Indexplatzhalter => Object.prototype.hasOwnProperty.call(INDEXPLATZHALTER, k);
export type Indexwerte = Partial<Pick<Mappe, 'erstellt' | 'geaendert'>>;

/** Betreff einer fotografierten Post (#490): „Post vom 01.11.2026, 20:52“ statt des Dateinamens „image“. */
export function fotoBetreff(d: Date = new Date()): string {
  return t('gemeinsam.model.foto-betreff', { zeit: datumsformat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) });
}
const TAG_FORMAT = () => datumsformat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Tag eines Zeitstempels als TT.MM.JJJJ in der Zeitzone des Haushalts. */
export function tagVon(zeitstempel: string | undefined): string {
  if (!zeitstempel) return '';
  const d = new Date(zeitstempel);
  return Number.isNaN(d.getTime()) ? '' : TAG_FORMAT().format(d);
}

/** Feldschlüssel, die eine Titel-Vorlage verwendet. */
export function vorlageFelder(vorlage: string): string[] {
  return [...vorlage.matchAll(PLATZHALTER)].map((m) => m[1]);
}

/** Wirksame Vorlage: die eingestellte oder das erste Textfeld. */
export function wirksameVorlage(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>): string {
  if (t.titelVorlage?.trim()) return t.titelVorlage;
  const f = t.felder.find((x) => x.typ === 'text');
  return f ? `{${f.key}}` : '';
}

/**
 * Textfeld, aus dem ein Verweisfeld nach einem Paket-Update gefüllt wird (#534): nur Text oder Langtext
 * desselben Mappentyps; sonst undefined.
 */
export function altesTextfeldVon(t: Pick<Mappentyp, 'felder'>, f: Feld): Feld | undefined {
  if (f.typ !== 'referenz' || !f.ausText || f.ausText === f.key) return undefined;
  const alt = t.felder.find((x) => x.key === f.ausText);
  return alt && (alt.typ === 'text' || alt.typ === 'langtext') ? alt : undefined;
}

/** Ist dieses Feld das alte Textfeld eines Verweisfelds (#534)? Dann das Verweisfeld. */
export function verweisAusText(t: Pick<Mappentyp, 'felder'>, f: Feld): Feld | undefined {
  return t.felder.find((x) => x.key !== f.key && altesTextfeldVon(t, x)?.key === f.key);
}

/**
 * Titel einer Mappe aus der Vorlage; Platzhalter werden formatiert eingesetzt. Deaktivierte Benutzer behalten
 * ihren Namen (#663) – „deaktiviert“ ist ein Zustand (`aktiv`), den die Oberfläche durchgestrichen zeigt.
 */
export function titelAus(t: Pick<Mappentyp, 'felder' | 'titelVorlage'> & Pick<Partial<Mappentyp>, 'system'> | undefined, werte: Werte, titelVon: (id: string) => string = (id) => id, index: Indexwerte = {}): string {
  if (!t) return '';
  return titelAusVorlage(t, werte, titelVon, index);
}

function titelAusVorlage(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>, werte: Werte, titelVon: (id: string) => string, index: Indexwerte): string {
  const ersetzt = wirksameVorlage(t)
    .replace(PLATZHALTER, (_, k: string, kette: string) => {
      let text = '';
      let roh: unknown;
      let art: string | undefined;
      if (k === 'angelegt' || k === 'geaendert') {
        const z = k === 'angelegt' ? index.erstellt : index.geaendert;
        text = tagVon(z);
        roh = z ? isoTag(z) : undefined;
        art = 'datum';
      } else {
        const f = t.felder.find((x) => x.key === k);
        // Passwörter nie im Titel – auch nicht, wenn eine ältere Vorlage sie noch nennt.
        if (f && f.typ !== 'passwort') { text = formatiere(f, werte[k], titelVon); roh = werte[k]; art = f.typ; }
        // Verweis noch leer, alter Text da (#534): bis zur Umwandlung zählt der Text.
        const alt = f ? altesTextfeldVon(t, f) : undefined;
        if (alt && istLeer(werte[k]) && !istLeer(werte[alt.key])) { text = formatiere(alt, werte[alt.key], titelVon); roh = werte[alt.key]; art = alt.typ; }
      }
      const mitFiltern = wendeFilterAn(text, roh, art, liesFilter(kette));
      // Leere Teile fallen samt Trenner weg („Strom –  – 2026“ wird „Strom – 2026“).
      return mitFiltern.trim() ? mitFiltern : LEER;
    });
  return ohneLeereTeile(ersetzt).replace(/\s+/g, ' ').trim();
}

/** Zeitstempel → „JJJJ-MM-TT“ in der Zeitzone des Haushalts (für Datumsfilter an angelegt/geaendert). */
function isoTag(zeitstempel: string): string {
  const d = new Date(zeitstempel);
  if (Number.isNaN(d.getTime())) return '';
  const teile = Object.fromEntries(datumsformat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${teile.year}-${teile.month}-${teile.day}`;
}

/** Fehler in den Filtern der Titel-Vorlage (#170). */
export function pruefeTitelFilter(t: Pick<Mappentyp, 'felder' | 'titelVorlage'>): string[] {
  const m: string[] = [];
  for (const x of (t.titelVorlage ?? '').matchAll(PLATZHALTER)) {
    const art = istIndexplatzhalter(x[1]) ? 'datum' : t.felder.find((f) => f.key === x[1])?.typ;
    m.push(...pruefeFilter(x[1], x[2] ?? '', art));
  }
  return m;
}

/** Namen der Register, die Ablago selbst anlegt (#728: aus der Sprachdatei; gespeichert wie jeder andere Name). */
export const REGISTERNAMEN = {
  allgemein: t('gemeinsam.model.register.allgemein'), dokumente: t('gemeinsam.model.register.dokumente'), verknuepfungen: t('gemeinsam.model.register.verknuepfungen'),
  historie: t('gemeinsam.model.register.historie'), benutzer: t('gemeinsam.model.register.benutzer'),
} as const;

/** Register für einen neuen oder alten Mappentyp ohne Register. */
export function standardRegister(felder: Feld[]): Register[] {
  return [
    { key: 'allgemein', name: REGISTERNAMEN.allgemein, art: 'felder', felder: felder.map((f) => f.key) },
    { key: 'dokumente', name: REGISTERNAMEN.dokumente, art: 'dokumente' },
    { key: 'verknuepfungen', name: REGISTERNAMEN.verknuepfungen, art: 'verknuepfungen', quellen: [] },
  ];
}

/** Ein hochgeladenes Dokument in einem Dokumentenregister. */
export interface Dokument {
  id: string;
  mappeId: string;
  registerKey: string;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
  /** PDF oder Bild, das gefahrlos im Browser angezeigt werden kann. */
  anzeigbar: boolean;
  erstellt: string;
  erstelltVon: string | null;
  /** Stand der Texterkennung (#45). */
  ocr?: OcrStand;
  /** Versionierung (#194): Nummer der aktuellen Version (ohne Versionierung 1). */
  version?: number;
  /** Woher die aktuelle Version kam. */
  herkunft?: Herkunft | null;
  /** Anzahl älterer Versionen. */
  aeltere?: number;
  /** Archivnummer des Papieroriginals (#345), eindeutig je Haushalt. */
  archivnummer?: string | null;
  /**
   * Sprache des Volltexts (#400), Tesseract-Kennung wie „fra“: erkannt oder über die API gesetzt; ohne Angabe
   * Deutsch. Die Volltextsuche nimmt die Wortstämme dieser Sprache. Bei mehrsprachigen Dokumenten (#579) die
   * Hauptsprache – die mit dem meisten Text.
   */
  sprache?: string | null;
  /** Weitere Sprachen im Dokument (#579, „enthält auch“), nach Textmenge; leer bei einsprachigen. */
  weitereSprachen?: string[];
  /**
   * Hinweis „Post teilen?“ (#579): ab dieser Seite beginnt vermutlich ein eigenes Schreiben (die Sprache wechselt
   * zwischen zwei Seiten ganz). null: kein Wechsel oder Hinweis weggeklickt.
   */
  teilenAb?: number | null;
  /**
   * Archivfassung (PDF/A) eines Pakets mit `dms:archivfassung` (#631): fertig, wartet, ausgelassen oder Fehler – nur
   * in der Mappe (GET /mappen/{id}) und nur, wenn es eine gibt oder ein Paket dran ist.
   */
  archivfassung?: import('./archivfassung').ArchivStand | null;
  /**
   * Geschütztes PDF (#827): mit Passwort zum Öffnen oder nur mit Rechte-Sperre (Drucken, Kopieren) – und ob es eine
   * entsperrte Fassung gibt. Nur in der Mappe (GET /mappen/{id}) und nur bei geschützten PDFs.
   */
  pdfSchutz?: import('./entsperren').PdfSchutz | null;
}

/** Herkunft einer Dokumentversion (#194). */
export const HERKUNFT = { hochgeladen: 'hochgeladen', api: t('gemeinsam.model.ueber-die-schnittstelle'), webdav: t('gemeinsam.model.ueber-webdav'), paket: t('gemeinsam.model.von-einem-paket'), eingang: 'Eingangskanal', zurueckgeholt: 'zurückgeholt', bearbeitet: t('gemeinsam.model.in-ablago-bearbeitet'), geschwaerzt: t('gemeinsam.model.in-ablago-geschwaerzt') } as const;
export type Herkunft = keyof typeof HERKUNFT;
/** Eine ältere Version eines Dokuments (#194). */
export interface DokumentVersion {
  dokumentId: string; nummer: number; name: string; mime: string; groesse: number; sha256: string; anzeigbar: boolean;
  erstellt: string; erstelltVon: string | null; herkunft: Herkunft | null;
}

/* ---------- Aufgaben (#54, #56) ---------- */
export const AUFGABENARTEN = { passung: t('gemeinsam.model.passt-nicht'), erwaehnung: 'Erwähnung', manuell: 'Zugewiesen', vertretung: 'Vertretung', frist: 'Frist', erinnerung: 'Erinnerung', post: t('gemeinsam.model.post-fuer-dich'), auskunft: 'Auskunft', aenderung: 'Geändert', zugeordnet: t('gemeinsam.model.automatisch-zugeordnet') } as const;
export type Aufgabenart = keyof typeof AUFGABENARTEN;
export interface Aufgabe {
  id: string; mappeId: string;
  /** null = Administratoren. */
  empfaengerId: string | null;
  art: Aufgabenart; text: string; feldKey?: string | null;
  /** Frist und Erinnerung (#129, #131): das Datum, um das es geht. */
  datum?: string | null;
  /** Warum es die Aufgabe gibt – fällt der Anlass weg, erledigt sie sich selbst (#724). Ohne: nur von Hand. */
  anlass?: AufgabenAnlass | null;
  erstellt: string; erstelltVon: string | null;
  erledigt: string | null; erledigtVon: string | null;
  /** Für Listen: Titel und Typ der Mappe. */
  mappeTitel?: string; typId?: string;
}
export const AUFGABE_MAX = 2000;
/**
 * Aufgabe bei einer Person ohne Leserecht (#798): Von wann bis wann lag die Aufgabe bei jemandem, der die Mappe nach
 * den Berechtigungen nicht lesen darf – und ob der Admin ein Leserecht auf Zeit gegeben hat. Offen, solange `ende` leer
 * ist. Das Leserecht auf Zeit gilt nur für diese Mappe und nur, solange die Aufgabe offen bei dieser Person liegt.
 */
export interface FallOhneLeserecht {
  id: string; aufgabeId: string; mappeId: string; benutzerId: string;
  /** Text der Aufgabe beim Entstehen des Falls (die Aufgabe kann es später nicht mehr geben). */
  aufgabentext: string;
  beginn: string; ende: string | null;
  /** Warum der Fall endete: Aufgabe erledigt, gelöscht, an jemand anderen gegeben – oder die Person darf jetzt lesen. */
  endeGrund: FallEnde | null;
  leserechtSeit: string | null; leserechtVon: string | null;
  /** Für Listen: Titel und Typ der Mappe (fehlen, wenn es die Mappe nicht mehr gibt). */
  mappeTitel?: string; typId?: string;
}
export type FallEnde = 'erledigt' | 'geloescht' | 'weitergegeben' | 'lesbar';
/**
 * Anlass einer Aufgabe (#724), gemeinsam für Kern und Automatisierungen:
 * - `datum`: Das Datumsfeld `feld` der Mappe hat das Datum der Aufgabe – geändert oder geleert → erledigt;
 *   `wiederholung` (Monate) → nach dem Erledigen den Folgetermin vorschlagen.
 * - `post`: Die Post ist neu – zugeordnet oder erledigt → erledigt.
 * - `abwesenheit`: Der Benutzer ist abwesend – Abwesenheit beendet → erledigt.
 * `automatisierung`: Id der Automatisierung, die die Aufgabe angelegt hat (zur Anzeige und zum Erkennen).
 */
export type AufgabenAnlass = ({ art: 'datum'; feld: string; wiederholung?: number | null } | { art: 'post' } | { art: 'abwesenheit'; benutzer: string })
  & { automatisierung?: string };

/* ---------- Notizen (#55) ---------- */
export interface Notiz { id: string; mappeId: string; text: string; erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null }
export const NOTIZ_MAX = 20_000;

/* ---------- Änderungshistorie (#57) ---------- */
export const HISTORIENARTEN = {
  angelegt: 'angelegt', geaendert: 'geändert', dokument_hochgeladen: t('gemeinsam.model.dokument-hochgeladen'), dokument_geloescht: t('gemeinsam.model.dokument-geloescht'),
  papierkorb: t('gemeinsam.model.in-den-papierkorb-gelegt'), wiederhergestellt: 'wiederhergestellt', endgueltig: t('gemeinsam.model.endgueltig-geloescht'),
  passwort_angezeigt: t('gemeinsam.model.passwort-angezeigt'), notiz: 'Notiz', aufgabe: 'Aufgabe', email: t('gemeinsam.model.e-mail-versendet'), abwesenheit: 'Abwesenheit',
  zugeordnet: t('gemeinsam.model.post-zugeordnet'), uebernommen: 'übernommen', dokument_version: t('gemeinsam.model.neue-version'),
  dokument_papierkorb: t('gemeinsam.model.dokument-in-den-papierkorb'), dokument_wiederhergestellt: t('gemeinsam.model.dokument-wiederhergestellt'),
  pdf_bearbeitet: 'PDF bearbeitet', post_geteilt: t('gemeinsam.model.post-geteilt'),
  archivnummer: 'Archivnummer', volltext: t('gemeinsam.model.volltext-gesetzt'), weitergegeben: 'weitergegeben',
  geschwaerzt: t('gemeinsam.model.geschwaerzte-fassung-erstellt'), auskunft: t('gemeinsam.model.auskunft-erteilt'),
  umgewandelt: t('gemeinsam.model.umgewandelte-fassung-erstellt'),
  archivfassung: t('gemeinsam.model.archivfassung-pdf-a-abgelegt'),
  leserecht: t('gemeinsam.model.leserecht-auf-zeit'),
  entsperrt: t('gemeinsam.model.passwortschutz-entfernt'),
  /** #820: im Verwaltungsmodus geöffnet, heruntergeladen, geändert … – nicht löschbar, nie ausgeblendet. */
  verwaltungsmodus: t('gemeinsam.model.im-verwaltungsmodus'),
  /** #800: Abrufe einer Datei – in der Oberfläche heruntergeladen, mit einem API-Schlüssel, über das WebDAV-Laufwerk. */
  heruntergeladen: t('gemeinsam.model.heruntergeladen'),
  abruf_api: t('gemeinsam.model.abruf-api'),
  abruf_webdav: t('gemeinsam.model.abruf-webdav'),
} as const;
/** Was im Verwaltungsmodus mit einer fremden Mappe geschah (#820). */
export type Modusspur = 'angesehen' | 'heruntergeladen' | 'geaendert' | 'exportiert' | 'versendet';
export type Historienart = keyof typeof HISTORIENARTEN;

/**
 * Was ein Register „Historie“ zeigt (#800): die Arten von Einträgen in Gruppen. Geschrieben wird immer alles – welche
 * Gruppen ein Register zeigt, ist nur eine Frage der Anzeige. „verwaltungsmodus“ (#820) gehört zu keiner Gruppe und
 * steht immer da. Jede andere Art liegt in genau einer Gruppe.
 */
export const HISTORIENGRUPPEN = {
  anlegen: ['angelegt', 'papierkorb', 'wiederhergestellt', 'endgueltig', 'uebernommen', 'zugeordnet', 'post_geteilt', 'archivnummer'],
  felder: ['geaendert', 'passwort_angezeigt'],
  dokumente: ['dokument_hochgeladen', 'dokument_geloescht', 'dokument_version', 'dokument_papierkorb', 'dokument_wiederhergestellt', 'pdf_bearbeitet',
    'volltext', 'geschwaerzt', 'umgewandelt', 'archivfassung', 'entsperrt'],
  notizen: ['notiz'],
  aufgaben: ['aufgabe', 'abwesenheit'],
  weitergeben: ['email', 'weitergegeben', 'auskunft'],
  rechte: ['leserecht'],
  herunterladen: ['heruntergeladen'],
  api: ['abruf_api'],
  webdav: ['abruf_webdav'],
} as const satisfies Record<string, readonly Historienart[]>;
export type Historiengruppe = keyof typeof HISTORIENGRUPPEN;
/** Arten, die jedes Register „Historie“ zeigt, gleich wie es eingestellt ist (#820). */
export const HISTORIE_IMMER: readonly Historienart[] = ['verwaltungsmodus'];
/**
 * Vorauswahl eines Registers „Historie“ ohne eigene Einstellung (#800): alles wie bisher, ohne die Abrufe – die
 * interessieren im Alltag selten. Ein weiteres Register (z. B. „Abrufe“) oder „Alles anzeigen“ zeigt sie.
 */
export const HISTORIE_VORAUSWAHL: readonly Historiengruppe[] = ['anlegen', 'felder', 'dokumente', 'notizen', 'aufgaben', 'weitergeben', 'rechte'];
export const istHistoriengruppe = (g: unknown): g is Historiengruppe => typeof g === 'string' && Object.hasOwn(HISTORIENGRUPPEN, g);
/** Name einer Gruppe in der Sprache des Lesers. */
export const historiengruppeName = (g: Historiengruppe) => t.frei(`gemeinsam.model.historiengruppe.${g}`);
/** Die Gruppen, die ein Register „Historie“ zeigt: seine Einstellung, sonst die Vorauswahl. */
export const historiengruppenVon = (r: Pick<Register, 'zeigt'> | undefined): Historiengruppe[] => [...(r?.zeigt ?? HISTORIE_VORAUSWAHL)];
/** Die Arten zu diesen Gruppen – immer mit HISTORIE_IMMER. */
export function historienartenVon(gruppen: readonly Historiengruppe[]): Historienart[] {
  return [...new Set<Historienart>([...gruppen.flatMap((g) => HISTORIENGRUPPEN[g] ?? []), ...HISTORIE_IMMER])];
}
/** Wege eines Abrufs (#800) und die Art des Eintrags dazu. */
export type Abrufweg = 'oberflaeche' | 'api' | 'webdav';
export const ABRUF_ART: Record<Abrufweg, Historienart> = { oberflaeche: 'heruntergeladen', api: 'abruf_api', webdav: 'abruf_webdav' };
/** Welche Fassung abgerufen wurde: das Original, eine ältere Version, die Archivfassung, die umgewandelte Fassung, Seitenbilder. */
export type Abruffassung = 'original' | 'version' | 'archiv' | 'umgewandelt' | 'seiten' | 'export';
/** Eine Feldänderung: Werte lesbar zum Zeitpunkt der Änderung; Passwörter nur als „geändert“. */
export interface Feldaenderung { feld: string; label: string; alt?: string; neu?: string; geheim?: boolean }
/**
 * Gleichzeitig bearbeiten (#609): ein Feld, das seit dem Stand des Schreibers jemand anderes geändert hat und
 * das der Schreiber jetzt anders setzen will. Kommt mit 409 als `details` von `PUT /mappen/{id}`.
 */
export interface Feldkonflikt {
  feld: string; label: string;
  /** Was der Schreiber eintragen wollte und was jetzt gilt – lesbar; bei Passwortfeldern leer. */
  deins: string; aktuell: string;
  /** Der Wert, der jetzt gilt; fehlt bei Passwortfeldern (`geheim`). */
  wert?: Wert | null; geheim?: boolean;
  /** Wer das Feld zuletzt geändert hat (null = das DMS selbst) und wann. */
  von: string | null; name: string; zeit: string;
}
/**
 * Verweis passt nicht (#887): Die Mappe im Verweisfeld `feld` passt nicht zu den eigenen Feldern `eigeneFelder` – über
 * den Auswahlfilter mit Werten dieser Mappe (#173) oder weil eines davon aus `feld` folgt (#886). Leer und `regel`:
 * passt nur nicht zu den festen Bedingungen des Auswahlfilters. Ein Hinweis, kein Fehler: Speichern bleibt möglich.
 */
export interface Verweiskonflikt { feld: string; eigeneFelder: string[]; regel?: boolean; ids: string[] }

export interface Mappenkonflikt {
  /** Aktueller Stand der Mappe – damit noch einmal senden, um die eigenen Werte zu übernehmen. */
  stand: string;
  konflikte: Feldkonflikt[];
}

export interface Historieneintrag {
  id: number; mappeId: string; zeit: string; benutzerId: string | null; art: Historienart;
  daten: { aenderungen?: Feldaenderung[]; dokument?: string; feld?: string; text?: string; [k: string]: unknown };
}

/* ---------- Texterkennung (#45) ---------- */
/** Fundstelle im Volltext: Dokument und Textausschnitt; Treffer zwischen TREFFER_ANFANG und TREFFER_ENDE. */
export interface Ausschnitt { dokument: string; text: string }
export const TREFFER_ANFANG = '\u0002';
export const TREFFER_ENDE = '\u0003';
export const OCR_STAENDE = {
  keiner: t('gemeinsam.model.ohne-volltext'), wartet: 'wartet', laeuft: 'läuft', fertig: 'fertig', fehler: t('gemeinsam.model.fehler'), ausgelassen: 'ausgelassen',
  /** #458: Textebene gelesen, das Paket für die Texterkennung ist dran (bzw. noch nicht installiert). */
  paket: t('gemeinsam.model.wartet-auf-texterkennung'),
} as const;
export type OcrStandArt = keyof typeof OCR_STAENDE;
export interface OcrStand {
  stand: OcrStandArt;
  /** Fehlermeldung, Grund fürs Auslassen oder Herkunft des Texts (Textebene/Texterkennung). */
  info?: string | null;
  seiten?: number | null;
  zeit?: string | null;
}
export const MAX_DATEIGROESSE = 100 * 1024 * 1024;
/** Höchstens so viele Mappen in einer Auswahl (#149). */
export const MAX_AUSWAHL = 5000;

/** Wert lesbar formatieren – in der Sprache des Benutzers (#729; Auswahl als Beschriftung, #728). `titelVon` löst Referenzen auf. */
export function formatiere(f: Feld, v: Wert | undefined, titelVon: (id: string) => string = (id) => id): string {
  if (v == null || v === '') return '';
  switch (f.typ) {
    case 'betrag': {
      const b = v as Betrag;
      if (typeof b.betrag !== 'number') return '';
      try { return new Intl.NumberFormat(gebietsschema(), { style: 'currency', currency: b.waehrung || 'EUR' }).format(b.betrag); }
      catch { return `${b.betrag.toLocaleString(gebietsschema(), { minimumFractionDigits: 2 })} ${b.waehrung}`; }
    }
    case 'datum': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      return m ? new Intl.DateTimeFormat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))) : String(v);
    }
    case 'janein': return v ? t('gemeinsam.model.ja') : t('gemeinsam.model.nein');
    case 'zahl': return typeof v === 'number' ? v.toLocaleString(gebietsschema(), { maximumFractionDigits: f.nachkomma ?? 10 }) : String(v);
    // Zeitraum und Prozent (#1035): „3 Monate“, „19 %“.
    case 'zeitraum': return istZeitraum(v) ? zeitraumText(v) : '';
    case 'prozent': return typeof v === 'number' ? prozentText(v, f.nachkomma) : String(v);
    // Fester Wert → Beschriftung in der Sprache des Benutzers (#728); gespeichert bleibt der Wert.
    case 'auswahl': return (Array.isArray(v) ? v : [v]).map((x) => optionText(f, String(x))).join(', ');
    case 'referenz': return (Array.isArray(v) ? v : [String(v)]).map(titelVon).join(', ');
    case 'passwort': return istPasswortWert(v) && !v.gesetzt && !v.neu ? '' : '••••••••';
    // Tabelle (#1030): kein eigener Wert.
    case 'tabelle': return '';
    case 'formatiert': return alsText(String(v));
    // IBAN in Vierergruppen (#535), auch gespeicherte ohne Leerzeichen.
    case 'text': return f.format === 'iban' && typeof v === 'string' && /^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]+$/.test(v.trim()) ? ibanGruppen(v) : String(v);
    default: return String(v);
  }
}

/** Zahl aus deutscher oder technischer Schreibweise lesen. null = leer, NaN = ungültig. */
export function leseZahl(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  // Auch mit Minuszeichen (U+2212), wie Ablago negative Beträge zeigt (#1035).
  let t = String(s).trim().replace(/\s/g, '').replace(/\u2212/g, '-');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

/** Schlüssel aus einer Bezeichnung ableiten: „Kündigung bis“ → kuendigung_bis. */
/** Ein Schlüssel, den es unter `vergeben` noch nicht gibt: „rechnung“, sonst „rechnung_2“ … */
export function freierSchluessel(basis: string, vergeben: Iterable<string>): string {
  const belegt = new Set(vergeben);
  const b = schluesselAus(basis);
  let k = b; let n = 2;
  while (belegt.has(k)) k = `${b.slice(0, 36)}_${n++}`;
  return k;
}

export function schluesselAus(label: string): string {
  let k = String(label || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!k) k = 'feld';
  if (/^[0-9]/.test(k)) k = 'f_' + k;
  return k.slice(0, 40);
}
