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
} as const;
export type Feldtyp = keyof typeof FELDTYPEN;

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
  min?: number | null;
  max?: number | null;
  nachkomma?: number | null;
  waehrung?: string;
  optionen?: string[];
  mehrfach?: boolean;
  /** Referenz: Id des Ziel-Mappentyps (darf der eigene sein → Hierarchie). */
  zielTyp?: string;
  verweisart?: Verweisart;
  /** Systemfeld eines Systemmappentyps: nicht entfernbar, Datentyp und Eigenschaften fest (vom Server gesetzt). */
  system?: boolean;
  /** Datumsfeld (#129): Erinnerung als Aufgabe „Frist“ im Eingang; fehlt/null = keine. */
  frist?: import('./fristen').FristEinstellung | null;
  /** Referenzfeld (#172): nur Mappen des Zieltyps, die alle Bedingungen erfüllen. */
  auswahlFilter?: import('./sichten').Feldbedingung[];
}

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
}

export interface MappentypDaten {
  name: string;
  /** Fester Schlüssel (#145): nach dem Anlegen unveränderlich, z. B. für sprechende Links. */
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
}
export interface Mappentyp extends MappentypDaten {
  id: string;
  erstellt: string;
  geaendert: string;
  /** Systemmappentyp (Benutzer, Rolle): lässt sich erweitern, aber nicht löschen. */
  system?: Systemtyp | null;
  /** Berechtigungen (#123): Grundeinstellung und Regeln; fehlt = alles erteilt. Nur für Administratoren geliefert. */
  berechtigungen?: import('./rechte').Regelwerk | null;
  /** Nur für Nicht-Administratoren (#126): Darf man nach den Berechtigungen überhaupt Mappen dieses Typs anlegen? */
  darfAnlegen?: boolean;
}

/* ---------- Systemmappentypen: Benutzer und Rollen (#26, #27) ---------- */

export const SYSTEMTYPEN = { benutzer: 'Benutzer', rolle: 'Rolle', post: 'Post' } as const;
export type Systemtyp = keyof typeof SYSTEMTYPEN;

/** Kennung der Mappe einer Systemrolle, z. B. rolle:admin. */
export const systemrolleKennung = (r: Rolle) => `rolle:${r}`;
export const istSystemrolle = (m: Pick<Mappe, 'systemKennung'> | undefined) => !!m?.systemKennung?.startsWith('rolle:');

/** Ziel eines Referenzfelds, das auf Mappen jedes Typs zeigen darf – nur für Systemfelder (Post → Zugeordnet zu, #58, #192). */
export const BELIEBIGER_TYP = '*';

/* ---------- Post (#192): alles, was hinein- oder hinausgeht ---------- */

/** Werte der Auswahlfelder von Post; gespeichert wird der Text. */
export const POST_KANAL = { hochgeladen: 'Hochgeladen', email: 'E-Mail', scan: 'Scan', ordner: 'Ordner', import: 'Import', api: 'API', webdav: 'WebDAV' } as const;
export const POST_RICHTUNG = { eingehend: 'Eingehend', ausgehend: 'Ausgehend' } as const;
export const POST_STAND = { neu: 'Neu', zugeordnet: 'Zugeordnet', erledigt: 'Erledigt' } as const;
/** Ein Wert eines Auswahlfelds als Text (einfach oder erster einer Liste). */
export const auswahlText = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v));
/** Eine versendete E-Mail: festgehalten wie verschickt, ihre Felder ändert niemand. */
export const istVersendet = (w: Werte | undefined) => !!w && auswahlText(w.kanal) === POST_KANAL.email && auswahlText(w.richtung) === POST_RICHTUNG.ausgehend;

/** Systemfelder je Systemtyp. Bezeichnung und Hilfetext darf der Administrator ändern, alles andere ist fest. */
export function systemfelder(s: Systemtyp, rolleTypId: string, benutzerTypId = ''): Feld[] {
  if (s === 'post') return [
    { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true, maxLen: 250, system: true },
    { key: 'stand', label: 'Stand', typ: 'auswahl', pflicht: true, optionen: Object.values(POST_STAND), system: true, hilfe: 'Neu: noch nicht bearbeitet. Zugeordnet: liegt bei einer passenden Mappe. Erledigt: nichts mehr zu tun.' },
    { key: 'kanal', label: 'Kanal', typ: 'auswahl', pflicht: true, optionen: Object.values(POST_KANAL), system: true, hilfe: 'Wie die Post ins DMS kam bzw. hinausging' },
    { key: 'richtung', label: 'Richtung', typ: 'auswahl', pflicht: true, optionen: Object.values(POST_RICHTUNG), system: true },
    { key: 'datum', label: 'Datum', typ: 'datum', system: true },
    { key: 'absender', label: 'Absender', typ: 'text', system: true },
    { key: 'an', label: 'Empfänger', typ: 'text', system: true },
    { key: 'fuer', label: 'Für', typ: 'referenz', zielTyp: benutzerTypId, verweisart: 'bezug', system: true, hilfe: 'Wer sich darum kümmern soll; solange die Post neu ist, steht sie bei ihm unter „Zu erledigen“' },
    { key: 'bezug', label: 'Zugeordnet zu', typ: 'referenz', mehrfach: true, zielTyp: BELIEBIGER_TYP, verweisart: 'bezug', system: true, hilfe: 'Die Mappen, zu denen diese Post gehört; gesetzt über „Zuordnen“' },
    { key: 'nachricht', label: 'Nachricht', typ: 'langtext', system: true },
  ];
  if (s === 'rolle') return [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true, eindeutig: true, maxLen: 80, system: true },
  ];
  return [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true, system: true },
    { key: 'email', label: 'E-Mail-Adresse', typ: 'text', pflicht: true, eindeutig: true, system: true },
    { key: 'rollen', label: 'Rollen', typ: 'referenz', mehrfach: true, zielTyp: rolleTypId, verweisart: 'bezug', system: true, hilfe: 'Systemrolle und weitere Rollen; vergeben in der Benutzerverwaltung' },
    { key: 'aktiv', label: 'Aktiv', typ: 'janein', system: true },
    // Abwesenheit (#78): gespiegelt aus Profil bzw. Benutzerverwaltung; „Abwesend“ = wirkt gerade.
    { key: 'abwesend', label: 'Abwesend', typ: 'janein', system: true, hilfe: 'Ob die Abwesenheit gerade wirkt' },
    { key: 'abwesend_von', label: 'Abwesend von', typ: 'datum', system: true },
    { key: 'abwesend_bis', label: 'Abwesend bis', typ: 'datum', system: true },
    { key: 'vertreter', label: 'Vertreter', typ: 'referenz', zielTyp: benutzerTypId, verweisart: 'bezug', system: true, hilfe: 'Bekommt die Aufgaben, solange die Abwesenheit wirkt oder der Benutzer deaktiviert ist' },
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
export function geschuetzteFelder(t: Pick<Mappentyp, 'system' | 'felder'> | undefined, m?: Pick<Mappe, 'systemKennung'> & { werte?: Werte }): Record<string, string> {
  if (t?.system === 'benutzer') {
    return Object.fromEntries(t.felder.filter((f) => f.system).map((f) => [f.key, 'Wird im Profil und in der Benutzerverwaltung gepflegt.']));
  }
  if (t?.system === 'rolle' && istSystemrolle(m)) return { name: 'Der Name einer Systemrolle ist fest.' };
  if (t?.system === 'post') {
    // Post (#192): Kanal hält das System fest, „Zugeordnet zu“ setzt „Zuordnen“; eine versendete E-Mail bleibt, wie sie verschickt wurde.
    const fest: Record<string, string> = { kanal: 'Wird beim Eingang festgehalten.', bezug: 'Wird über „Zuordnen“ gesetzt.' };
    if (istVersendet(m?.werte)) for (const k of ['betreff', 'an', 'absender', 'datum', 'nachricht', 'richtung']) fest[k] = 'Wird beim Versand festgehalten.';
    return fest;
  }
  // Nummernkreis (#171): die Nummer vergibt das DMS.
  const nummern = (t?.felder ?? []).filter((f) => kreisVon(f));
  if (nummern.length) return Object.fromEntries(nummern.map((f) => [f.key, m ? 'Fortlaufende Nummer – lässt sich nicht ändern.' : 'Wird beim Speichern vergeben.']));
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
}

/** Trefferlisten eines Typs; Typen aus der Zeit vor #75 haben genau eine („Standard“). */
export function trefferlistenVon(t: Pick<MappentypDaten, 'trefferlisten' | 'trefferliste'>): Trefferliste[] {
  return t.trefferlisten?.length ? t.trefferlisten : [{ key: 'standard', name: 'Standard', spalten: t.trefferliste ?? [], standard: true }];
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
  return !!f && f.typ !== 'referenz' && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort';
}
export interface Sortierung { spalte: string; absteigend: boolean }

export interface Betrag { betrag: number; waehrung: string }
/**
 * Wert eines Passwortfelds (#46), wie ihn Oberfläche und API sehen: nie das Passwort selbst.
 * - gesetzt/lesbar: kommt vom Server (lesbar = false, wenn der Schlüssel dazu fehlt)
 * - neu: zum Speichern eines neuen Passworts; entfernen: zum Löschen
 */
export interface PasswortWert { gesetzt?: boolean; lesbar?: boolean; neu?: string; entfernen?: boolean }
export type Wert = string | number | boolean | Betrag | string[] | PasswortWert | null;
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
  /** Mappen, die das System pflegt: Systemrollen (rolle:admin, rolle:mitglied). */
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

export type Rolle = 'admin' | 'mitglied';
export const ROLLEN: Record<Rolle, string> = { admin: 'Administrator', mitglied: 'Mitglied' };

export interface Benutzer {
  id: string;
  email: string;
  name: string;
  rolle: Rolle;
  aktiv: boolean;
  /** false, solange der Benutzer sein Passwort noch nicht über den Link gesetzt hat. */
  hatPasswort: boolean;
  erstellt: string;
  letzteAnmeldung: string | null;
  /** Letzte Aktivität in irgendeiner gültigen Sitzung (nur in der Benutzerverwaltung). */
  zuletztAktiv?: string | null;
  /** Zeigt beim Aufruf einer Seite die Dauer der einzelnen Schritte (im eigenen Profil schaltbar). */
  entwicklermodus?: boolean;
  /** Weitere (fachliche) Rollen: Ids der Rollen-Mappen (nur in der Benutzerverwaltung). */
  rollen?: string[];
  /** Abwesenheit mit Vertreter (#78). Der Vertreter bleibt nach dem Deaktivieren hinterlegt und wirkt dann dauerhaft. */
  abwesenheit?: Abwesenheit;
  /** Wann der Benutzer deaktiviert wurde (#77), sofern bekannt. */
  deaktiviert?: string | null;
  /** Offene Aufgaben (nur in der Benutzerverwaltung). */
  offeneAufgaben?: number;
  /** Dienstkonto eines Pakets mit Code (#338): meldet sich nie an, erscheint in keiner Benutzerliste. */
  art?: 'dienst';
  /** Paket, zu dem das Dienstkonto gehört. */
  paketId?: string;
}

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
  if (!ua) return 'Unbekanntes Gerät';
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

export const SCHLUESSEL_MUSTER = /^[a-z][a-z0-9_]{0,39}$/;

export function istLeer(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (istPasswortWert(v)) return !!v.entfernen || (!v.gesetzt && !v.neu);
  if (typeof v === 'object' && 'betrag' in (v as object)) {
    const b = (v as Betrag).betrag;
    return b == null || (b as unknown) === '';
  }
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
}

/** Allgemeine Meldung mit Bereich des Editors (#144). */
function melde(p: Pruefergebnis, ort: string, text: string) { p.allgemein.push(text); (p.orte ??= []).push(ort); }

function pruefeRegister(t: MappentypDaten, ctx: TypKontext, p: Pruefergebnis) {
  const reg = t.register ?? [];
  if (!reg.length) { melde(p, 'register', 'Der Mappentyp braucht mindestens ein Register.'); return; }
  const keys = new Set<string>();
  const feldAuf = new Map<string, string>();
  for (const r of reg) {
    const name = (r.name ?? '').trim() || r.key;
    if (!(r.name ?? '').trim()) melde(p, 'register', 'Jedes Register braucht einen Namen.');
    if (!SCHLUESSEL_MUSTER.test(r.key ?? '')) melde(p, 'register', `Register „${name}“: ungültige Kennung.`);
    else if (keys.has(r.key)) melde(p, 'register', `Die Register-Kennung „${r.key}“ kommt doppelt vor.`);
    keys.add(r.key);
    if (!(r.art in REGISTERARTEN)) melde(p, 'register', `Register „${name}“: unbekannte Art.`);
    if (r.art === 'felder') {
      for (const k of r.felder ?? []) {
        if (feldAuf.has(k)) melde(p, 'register', `Das Feld „${t.felder.find((f) => f.key === k)?.label ?? k}“ liegt auf zwei Registern.`);
        feldAuf.set(k, r.key);
      }
    }
    if (r.art === 'verknuepfungen') {
      for (const q of r.quellen ?? []) {
        const felder = q.typId === ctx.eigeneId ? t.felder : ctx.felderVon?.(q.typId);
        const f = felder?.find((x) => x.key === q.feldKey);
        if (!f || f.typ !== 'referenz' || (f.zielTyp !== ctx.eigeneId && f.zielTyp !== BELIEBIGER_TYP)) melde(p, 'register', `Register „${name}“: Eine Quelle verweist nicht (mehr) auf diesen Mappentyp.`);
      }
    }
  }
  if (t.felder.length && !reg.some((r) => r.art === 'felder')) melde(p, 'register', 'Es gibt Felder, aber kein Feldregister.');
  const ohne = t.felder.filter((f) => !feldAuf.has(f.key));
  if (ohne.length && reg.some((r) => r.art === 'felder')) melde(p, 'register', `Diese Felder liegen auf keinem Register: ${ohne.map((f) => f.label || f.key).join(', ')}.`);
}

export function pruefeMappentyp(t: MappentypDaten, ctx: TypKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const name = (t.name ?? '').trim();
  if (!name) melde(p, 'grunddaten', 'Der Mappentyp braucht einen Namen.');
  else if (ctx.namenAndererTypen.some((n) => n.trim().toLowerCase() === name.toLowerCase()))
    melde(p, 'grunddaten', `Es gibt bereits einen Mappentyp „${name}“.`);
  if (t.schluessel !== undefined) {
    if (!SCHLUESSEL_MUSTER.test(t.schluessel)) melde(p, 'grunddaten', 'Kennung des Mappentyps: nur Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben.');
    else if ((ctx.schluesselAndererTypen ?? []).includes(t.schluessel)) melde(p, 'grunddaten', `Die Kennung „${t.schluessel}“ hat schon ein anderer Mappentyp.`);
  }
  if (!Array.isArray(t.felder)) {
    melde(p, 'felder', 'Die Felder fehlen.');
    return p;
  }
  const unbekannt = vorlageFelder(t.titelVorlage ?? '').filter((k) => !istIndexplatzhalter(k) && !t.felder.some((f) => f.key === k));
  if (unbekannt.length) melde(p, 'titel', `Die Titel-Vorlage nennt unbekannte Felder: ${unbekannt.map((k) => `{${k}}`).join(', ')}.`);
  const geheim = vorlageFelder(t.titelVorlage ?? '').filter((k) => t.felder.some((f) => f.key === k && f.typ === 'passwort'));
  if (geheim.length) melde(p, 'titel', `Passwortfelder dürfen nicht im Titel stehen: ${geheim.map((k) => `{${k}}`).join(', ')}.`);
  for (const x of pruefeTitelFilter({ felder: t.felder, titelVorlage: t.titelVorlage ?? '' })) melde(p, 'titel', x);
  if ((t.trefferliste ?? []).some((k) => t.felder.some((f) => f.key === k && f.typ === 'passwort'))) melde(p, 'trefferlisten', 'Passwortfelder können keine Spalte der Trefferliste sein.');
  pruefeRegister(t, ctx, p);

  const gesehen = new Set<string>();
  t.felder.forEach((f, i) => {
    const m: string[] = [];
    if (!(f.label ?? '').trim()) m.push('Bezeichnung fehlt.');
    if (!(f.typ in FELDTYPEN)) m.push('Unbekannte Feldart.');
    if (!SCHLUESSEL_MUSTER.test(f.key ?? '')) m.push('Kennung: nur Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben.');
    else if (gesehen.has(f.key)) m.push(`Kennung „${f.key}“ kommt doppelt vor.`);
    else if (istIndexplatzhalter(f.key)) m.push(`Kennung „${f.key}“ ist für den Indexwert „${INDEXPLATZHALTER[f.key as Indexplatzhalter]}“ reserviert.`);
    gesehen.add(f.key);
    if (f.typ === 'referenz') {
      if (!f.zielTyp) m.push('Ziel-Mappentyp auswählen.');
      else if (f.zielTyp === BELIEBIGER_TYP) { if (!f.system) m.push('Ziel-Mappentyp auswählen.'); }
      else if (f.zielTyp !== ctx.eigeneId && !ctx.existiertTyp(f.zielTyp)) m.push('Der Ziel-Mappentyp existiert nicht.');
      else if (f.auswahlFilter?.length && ctx.auswahlProbleme) {
        // Auswahlfilter (#172): Bedingungen gegen die Felder des Zieltyps.
        const ziel = f.zielTyp === ctx.eigeneId ? t.felder : ctx.felderVon?.(f.zielTyp);
        if (ziel) for (const x of ctx.auswahlProbleme(f.auswahlFilter, ziel, { felder: t.felder, feldKey: f.key })) m.push(`Auswahlfilter: ${x}`);
      }
    }
    if (f.typ === 'auswahl' && !(f.optionen ?? []).length) m.push('Mindestens einen Auswahlwert eintragen.');
    if ((f.typ === 'text' || f.typ === 'langtext' || f.typ === 'formatiert') && f.minLen != null && f.maxLen != null && f.minLen > f.maxLen)
      m.push('Mindestlänge ist größer als Höchstlänge.');
    if ((f.typ === 'zahl' || f.typ === 'betrag') && f.min != null && f.max != null && f.min > f.max)
      m.push('Minimum ist größer als Maximum.');
    if (f.typ === 'text' && f.muster) {
      try { new RegExp(f.muster); } catch { m.push('Das Muster ist kein gültiger regulärer Ausdruck.'); }
    }
    // Nummernkreis im Standardwert (#171): nur an Textfeldern, den Kreis muss es geben.
    const kreis = kreisImStandard(f.standard);
    if (kreis) {
      if (f.typ !== 'text') m.push('Einen Nummernkreis gibt es nur für Textfelder.');
      else if (ctx.nummernkreise && !ctx.nummernkreise.includes(kreis)) m.push(`Den Nummernkreis „${kreis}“ gibt es nicht.`);
    }
    if (m.length) p.felder[String(i)] = m;
  });
  return p;
}

export interface MappenKontext {
  /** Typ-Id der Mappe mit dieser Id, oder undefined, wenn es sie nicht gibt. */
  typVon: (mappeId: string) => string | undefined;
  /** Titel einer anderen Mappe desselben Typs mit gleichem Wert, sonst undefined. */
  doppelt: (feldKey: string, wert: string | number) => string | undefined;
}

/** Prüft die Werte einer Mappe gegen die aktuelle Definition ihres Typs. */
export function pruefeMappe(t: Pick<Mappentyp, 'felder'>, werte: Werte, ctx: MappenKontext): Pruefergebnis {
  const p: Pruefergebnis = { allgemein: [], felder: {} };
  const fehler = (k: string, msg: string) => { p.felder[k] = [msg]; };

  for (const f of t.felder) {
    const v = werte?.[f.key];
    // Nummernkreis (#171): Wert vergibt das DMS, keine Prüfung der Eingabe.
    if (kreisVon(f)) continue;
    if (istLeer(v)) {
      if (f.pflicht && f.typ !== 'janein') fehler(f.key, 'Pflichtfeld – bitte ausfüllen.');
      continue;
    }
    switch (f.typ) {
      case 'text':
      case 'langtext':
      case 'formatiert': {
        if (typeof v !== 'string') { fehler(f.key, 'Text erwartet.'); break; }
        if (f.minLen != null && v.length < f.minLen) fehler(f.key, `Mindestens ${f.minLen} Zeichen.`);
        else if (f.maxLen != null && v.length > f.maxLen) fehler(f.key, `Höchstens ${f.maxLen} Zeichen.`);
        else if (f.typ === 'text' && f.muster) {
          try { if (!new RegExp('^(?:' + f.muster + ')$').test(v)) fehler(f.key, 'Passt nicht zum vorgegebenen Muster.'); } catch { /* Definition prüft das */ }
        }
        break;
      }
      case 'zahl':
      case 'betrag': {
        const x = f.typ === 'betrag' ? (v as Betrag)?.betrag : v;
        if (typeof x !== 'number' || !Number.isFinite(x)) { fehler(f.key, f.typ === 'betrag' ? 'Kein gültiger Betrag.' : 'Keine gültige Zahl.'); break; }
        if (f.min != null && x < f.min) fehler(f.key, `Mindestens ${f.min.toLocaleString('de-DE')}.`);
        else if (f.max != null && x > f.max) fehler(f.key, `Höchstens ${f.max.toLocaleString('de-DE')}.`);
        else if (f.typ === 'zahl' && f.nachkomma != null && (String(x).split('.')[1] ?? '').length > f.nachkomma)
          fehler(f.key, `Höchstens ${f.nachkomma} Nachkommastellen.`);
        if (f.typ === 'betrag' && !p.felder[f.key] && !/^[A-Z]{3}$/.test((v as Betrag).waehrung ?? ''))
          fehler(f.key, 'Währung als dreistelliger Code, z. B. EUR.');
        break;
      }
      case 'datum':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) fehler(f.key, 'Kein gültiges Datum.');
        break;
      case 'janein':
        if (typeof v !== 'boolean') fehler(f.key, 'Ja oder Nein erwartet.');
        break;
      case 'auswahl': {
        const liste = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, 'Nur ein Wert erlaubt.'); break; }
        const falsch = liste.filter((x) => !(f.optionen ?? []).includes(String(x)));
        if (falsch.length) fehler(f.key, `Nicht in der Auswahlliste: ${falsch.join(', ')}.`);
        break;
      }
      case 'passwort':
        // Auf dem Server verschlüsselt (Text), in der Oberfläche als PasswortWert.
        if (typeof v !== 'string' && !istPasswortWert(v)) fehler(f.key, 'Ungültiger Wert für ein Passwort.');
        break;
      case 'referenz': {
        const ids = Array.isArray(v) ? v : [v];
        if (!f.mehrfach && Array.isArray(v)) { fehler(f.key, 'Nur ein Verweis erlaubt.'); break; }
        if (ids.some((id) => typeof id !== 'string' || ctx.typVon(id) === undefined)) fehler(f.key, 'Verweist auf eine Mappe, die es nicht gibt.');
        else if (f.zielTyp !== BELIEBIGER_TYP && ids.some((id) => ctx.typVon(id as string) !== f.zielTyp)) fehler(f.key, 'Verweist auf eine Mappe eines anderen Mappentyps.');
        break;
      }
    }
    if (!p.felder[f.key] && f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) {
      const titel = ctx.doppelt(f.key, v as string | number);
      if (titel !== undefined) fehler(f.key, `Bereits vergeben in „${titel}“.`);
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
export const INDEXPLATZHALTER = { angelegt: 'Angelegt', geaendert: 'Zuletzt geändert' } as const;
export type Indexplatzhalter = keyof typeof INDEXPLATZHALTER;
export const istIndexplatzhalter = (k: string): k is Indexplatzhalter => Object.prototype.hasOwnProperty.call(INDEXPLATZHALTER, k);
export type Indexwerte = Partial<Pick<Mappe, 'erstellt' | 'geaendert'>>;

/** Zeitzone für Datumsangaben aus Zeitstempeln (Server und Browser sollen denselben Tag zeigen). */
export const ZEITZONE = 'Europe/Berlin';
const TAG_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, day: '2-digit', month: '2-digit', year: 'numeric' });

/** Tag eines Zeitstempels als TT.MM.JJJJ in der Zeitzone des Haushalts. */
export function tagVon(zeitstempel: string | undefined): string {
  if (!zeitstempel) return '';
  const d = new Date(zeitstempel);
  return Number.isNaN(d.getTime()) ? '' : TAG_FORMAT.format(d);
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

/** Titel einer Mappe aus der Vorlage; Platzhalter werden formatiert eingesetzt. Deaktivierte Benutzer heißen „… (ehemalig)“. */
export function titelAus(t: Pick<Mappentyp, 'felder' | 'titelVorlage'> & Pick<Partial<Mappentyp>, 'system'> | undefined, werte: Werte, titelVon: (id: string) => string = (id) => id, index: Indexwerte = {}): string {
  if (!t) return '';
  const titel = titelAusVorlage(t, werte, titelVon, index);
  return t.system === 'benutzer' && werte.aktiv === false ? `${titel} (ehemalig)`.trim() : titel;
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
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((p) => [p.type, p.value]));
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

/** Register für einen neuen oder alten Mappentyp ohne Register. */
export function standardRegister(felder: Feld[]): Register[] {
  return [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: felder.map((f) => f.key) },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
    { key: 'verknuepfungen', name: 'Verknüpfungen', art: 'verknuepfungen', quellen: [] },
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
}

/** Herkunft einer Dokumentversion (#194). */
export const HERKUNFT = { hochgeladen: 'hochgeladen', api: 'über die Schnittstelle', webdav: 'über WebDAV', paket: 'von einem Paket', eingang: 'Eingangskanal', zurueckgeholt: 'zurückgeholt', bearbeitet: 'im DMS bearbeitet', geschwaerzt: 'im DMS geschwärzt' } as const;
export type Herkunft = keyof typeof HERKUNFT;
/** Eine ältere Version eines Dokuments (#194). */
export interface DokumentVersion {
  dokumentId: string; nummer: number; name: string; mime: string; groesse: number; sha256: string; anzeigbar: boolean;
  erstellt: string; erstelltVon: string | null; herkunft: Herkunft | null;
}

/* ---------- Aufgaben (#54, #56) ---------- */
export const AUFGABENARTEN = { passung: 'Passt nicht', erwaehnung: 'Erwähnung', manuell: 'Zugewiesen', vertretung: 'Vertretung', frist: 'Frist', erinnerung: 'Erinnerung', post: 'Post für dich', auskunft: 'Auskunft', aenderung: 'Geändert' } as const;
export type Aufgabenart = keyof typeof AUFGABENARTEN;
export interface Aufgabe {
  id: string; mappeId: string;
  /** null = Administratoren. */
  empfaengerId: string | null;
  art: Aufgabenart; text: string; feldKey?: string | null;
  /** Frist und Erinnerung (#129, #131): das Datum, um das es geht. */
  datum?: string | null;
  erstellt: string; erstelltVon: string | null;
  erledigt: string | null; erledigtVon: string | null;
  /** Für Listen: Titel und Typ der Mappe. */
  mappeTitel?: string; typId?: string;
}
export const AUFGABE_MAX = 2000;

/* ---------- Notizen (#55) ---------- */
export interface Notiz { id: string; mappeId: string; text: string; erstellt: string; erstelltVon: string | null; geaendert: string; geaendertVon: string | null }
export const NOTIZ_MAX = 20_000;

/* ---------- Änderungshistorie (#57) ---------- */
export const HISTORIENARTEN = {
  angelegt: 'angelegt', geaendert: 'geändert', dokument_hochgeladen: 'Dokument hochgeladen', dokument_geloescht: 'Dokument gelöscht',
  papierkorb: 'in den Papierkorb gelegt', wiederhergestellt: 'wiederhergestellt', endgueltig: 'endgültig gelöscht',
  passwort_angezeigt: 'Passwort angezeigt', notiz: 'Notiz', aufgabe: 'Aufgabe', email: 'E-Mail versendet', abwesenheit: 'Abwesenheit',
  zugeordnet: 'Post zugeordnet', uebernommen: 'übernommen', dokument_version: 'neue Version',
  dokument_papierkorb: 'Dokument in den Papierkorb', dokument_wiederhergestellt: 'Dokument wiederhergestellt',
  pdf_bearbeitet: 'PDF bearbeitet', post_geteilt: 'Post geteilt',
  archivnummer: 'Archivnummer', volltext: 'Volltext gesetzt', weitergegeben: 'weitergegeben',
  geschwaerzt: 'geschwärzte Fassung erstellt', auskunft: 'Auskunft erteilt',
} as const;
export type Historienart = keyof typeof HISTORIENARTEN;
/** Eine Feldänderung: Werte lesbar zum Zeitpunkt der Änderung; Passwörter nur als „geändert“. */
export interface Feldaenderung { feld: string; label: string; alt?: string; neu?: string; geheim?: boolean }
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
  keiner: 'ohne Volltext', wartet: 'wartet', laeuft: 'läuft', fertig: 'fertig', fehler: 'Fehler', ausgelassen: 'ausgelassen',
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

/** Wert lesbar formatieren (deutsch). `titelVon` löst Referenzen auf. */
export function formatiere(f: Feld, v: Wert | undefined, titelVon: (id: string) => string = (id) => id): string {
  if (v == null || v === '') return '';
  switch (f.typ) {
    case 'betrag': {
      const b = v as Betrag;
      if (typeof b.betrag !== 'number') return '';
      try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: b.waehrung || 'EUR' }).format(b.betrag); }
      catch { return `${b.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${b.waehrung}`; }
    }
    case 'datum': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v);
    }
    case 'janein': return v ? 'Ja' : 'Nein';
    case 'zahl': return typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: f.nachkomma ?? 10 }) : String(v);
    case 'auswahl': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'referenz': return (Array.isArray(v) ? v : [String(v)]).map(titelVon).join(', ');
    case 'passwort': return istPasswortWert(v) && !v.gesetzt && !v.neu ? '' : '••••••••';
    case 'formatiert': return alsText(String(v));
    default: return String(v);
  }
}

/** Zahl aus deutscher oder technischer Schreibweise lesen. null = leer, NaN = ungültig. */
export function leseZahl(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  let t = String(s).trim().replace(/\s/g, '');
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
