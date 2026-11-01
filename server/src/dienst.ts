import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import {
  darfErstellen, darfLoeschen, ersterGrund, FELDTYPEN, formatiere, geschuetzteFelder, istLeer, istPasswortWert, istSystemspalte, sortierbar, istOk, leseZahl, MAX_AUSWAHL, MAX_DATEIGROESSE, pruefeMappe, pruefeMappentyp,
  REGISTERARTEN, ROLLEN, freierSchluessel, schluesselAus, standardRegister, systemfelder, systemrolleKennung, titelAus, verweiseVon,
  AUFGABE_MAX, istEmail, NOTIZ_MAX, POST_KANAL, POST_RICHTUNG, POST_STAND, auswahlText, darfPostAnlegen, abwesenheitWirkt, VERTRETER_SCHRITTE, type Abwesenheit, type Aufgabe, type Benutzer, type Dokument, type Herkunft, type Vertretung, type Feld, type Feldaenderung, type Notiz, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, type MappentypDaten, type MappenBezug, type Quelle, type Register, type Trefferliste, trefferlistenVon, standardliste, type Rolle, type Systemtyp, type Werte,
} from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import type { Mailer } from './mail';
import { Auftraege } from './auftrag';
import { protokoll } from './protokoll';
import { graubild } from './graubild';
import { Fachfehler } from './fehler';
import { fuegeZusammen, pruefeAuswahl, pruefeTeile, SEITENBILDER_MAX, Seitenbilder, seitenInfo, teile, teilName } from './pdfseiten';
import { aufkleberPdf, ETIKETTEN, type Etikett } from './aufkleber';
import { alsText, erwaehnungen } from '../../shared/src/markdown';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG } from '../../shared/src/werkbankansicht';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { istUuid, type DokumentImPapierkorb, type NeueMappe, type PapierkorbEintrag, type Repo, type Rueckverweis, type SortierungIntern } from './repo';
import {
  auswahlKlausel, auswahlProbleme, bereinigeAuswahlfilter, setzeEigeneWerte, erfuellt, bereinigeBedingungen, filterFuer, heuteIn, kinderVon, klauselnFuer, verschiebe, waereKreis, wirksameTypen,
  type Aufloesung, type Sicht, type SichtDaten,
} from '../../shared/src/sichten';
import type { Readable } from 'node:stream';
import { aufbewahrenBis, datumText, inFrist, JAHRE_MAX } from '../../shared/src/archiv';
import type { ExportQuelle } from './vollexport';
import { sammleBaum, type BaumQuelle } from './baum';
import { BAUM_STANDARD, bereinigeBaumOptionen, type Baum } from '../../shared/src/baum';
import { AUSKUNFT_PASSWORT_MIN, auswahlProbleme as auskunftProbleme, fristBis, liesAuswahl, liesDatenschutz, personenTypen, type AuskunftMappe, type AuskunftVorschau, type AuskunftVorschlag, type Datenschutz } from '../../shared/src/auskunft';
import { auskunftMail, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, liesLinkEingabe, linkStatus, normiereCode, type AuskunftLink, type AuskunftStand } from '../../shared/src/auskunft';
import { neuerAbrufcode, SCHLUESSEL_MUSTER } from './abruf';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import { datumIn, KREIS_SCHLUESSEL, kreisVon, naechste, neubeginn, pruefeMuster, type Nummernkreis } from '../../shared/src/nummernkreis';
import { csvAus, xlsxAus } from './xlsx';
import { eindeutig, exportSpalten, mappenPdf, sichererName, spaltenKopf, zeile } from './export';
import { zipGroesse, zipStrom, ZIP_MAX, type ZipEintrag } from './zip';
import { fuerAusgabe, kannStempeln, weitergabeWas, type Ausgabe } from './ausgabe';
import { analysiere as schwaerzAnalyse, schwaerze, seitenbild as schwaerzSeitenbild, type Analyse as SchwaerzAnalyse } from './schwaerzen';
import { ocrAusGespeichert, pruefeWerkzeuge } from './texterkennung';
import { bereicheVon, findeBegriff, findeMuster, geschwaerztName, istMuster, kannSchwaerzen, MUSTER, pruefeBegriffe, pruefeBereiche, SCHWAERZEN_MAX_SEITEN, stellenText, type Bereich } from '../../shared/src/schwaerzen';
import { analysiere, ergebnisText, istStufe, MIN_ERSPARNIS, STANDARD_STUFE, stufeAus, STUFEN, verkleinere, type Analyse, type Stufe } from './verkleinern';
import { geltenderStempel, liesStempelTyp, liesVorlagen, pruefeVorlage, stempelAus, StempelFehler, STEMPEL_MODI, STEMPEL_NAME_MAX, STEMPEL_VORLAGEN_MAX, wunschAus, type GeltenderStempel, type StempelTyp, type StempelVorlage, type StempelWunsch } from '../../shared/src/stempel';
import { alleSichtRechte, bereinigeSichtRegelwerk, sichtRegelProblem, sichtTestlauf, type SichtRegelwerk } from '../../shared/src/sichtrechte';
import { liesDirektlink } from '../../shared/src/direktlink';
import { erkenneSprache, SPRACHE_MARKE, spracheZuInfo } from '../../shared/src/textsprache';
import { ALLE_TYPEN, PAKET_TEXT, type EreignisArt, type InstalliertesPaket, type PaketCode } from '../../shared/src/pakete';
import type { PaketEntwurf } from '../../shared/src/paketerstellung';
import { abfrageAus, liesSuche } from '../../shared/src/erweitertesuche';
import type { Lesefilter } from '../../shared/src/rechte';
import { ANSTEHEND_MAX, ANSTEHEND_TAGE, bereinigeFrist, datumDe, empfaengerFelder, ERINNERUNG_TEXT_MAX, fristAb, fristEmpfaenger, fristFelder, fristText, istDatum, naechsterTermin, type Anstehend, type Erinnerung } from '../../shared/src/fristen';
import { ALLES, RECHTE_LISTE, kurzStandard, systemSperre, bereinigeRegelwerk, FALSCH, istOffen, kopiereRegel, kurz, leseAusdruck, lesefilter, NICHTS, nicht, oder, rechteAn as rechteAnMappe, rechteUebersicht, regelProblem, regelwerkVon, wirksamVon, type Ausdruck, type Regelwerk, type Mappenquelle, type Recht, type Rechte, type Wer } from '../../shared/src/rechte';

/* ---------- Eingaben bereinigen: nur bekannte Eigenschaften übernehmen ---------- */

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Zugriff eines Benutzers (#124): Rollen, Auflösung dynamischer Werte, Lesefilter (null = alles). */
/** Dokument im Papierkorb mit Mappe und Register (#344). */
export interface DokumentImKorb extends DokumentImPapierkorb { art: 'dokument'; typId: string; mappeTitel: string; register: string; mappe: 'da' | 'papierkorb' | 'weg' }
/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }
export interface Zugriff {
  ich: { id: string; rolle: string };
  admin: boolean;
  wer: Wer;
  a: Aufloesung;
  typen: Map<string, Mappentyp>;
  lesen: Lesefilter | null;
  /**
   * Dienstkonto eines Pakets (#338): Rechte fest aus dem bestätigten Manifest statt aus Regeln.
   * typen enthält dann nur die lesbaren Typen; schreiben = Ids der Typen mit Anlegen/Bearbeiten.
   */
  paket?: { id: string; schreiben: Set<string>; dokumente: PaketCode['rechte']['dokumente'] };
}
export const NICHT_SICHTBAR = 'nicht sichtbare Mappe';
/** Obergrenze für geschriebenen Volltext (Zeichen). */
export const VOLLTEXT_MAX = 5_000_000;
/** Auswahlfilter (#172) zählen nichts – nur Bedingungen auf Felder. */
/** Laufende Transaktion je Aufruf (#404): Repo der Transaktion und was erst nach dem Speichern geschehen soll. */
const transaktionen = new AsyncLocalStorage<{ dienst: object; repo: Repo; nachher: Array<() => void> }>();

const KEINE_ZAEHLUNG = { dokumente: () => 0, verknuepfungen: () => 0 };
const VERBOTEN: Record<Recht, string> = {
  C: 'Mappen dieses Typs darfst du nicht anlegen.',
  R: 'Diese Mappe darfst du nicht sehen.',
  U: 'Diese Mappe darfst du nicht bearbeiten.',
  D: 'Diese Mappe darfst du nicht löschen.',
  P: 'Passwörter dieser Mappe darfst du nicht sehen.',
};
function zahlOderNull(v: unknown): number | null {
  const n = leseZahl(v);
  return n == null || Number.isNaN(n) ? null : n;
}

export function bereinigeFeld(e: unknown): Feld {
  const f = (e ?? {}) as Record<string, unknown>;
  const typ = (text(f.typ) in FELDTYPEN ? text(f.typ) : 'text') as Feld['typ'];
  const std = f.standard;
  return {
    key: text(f.key),
    label: text(f.label),
    typ,
    pflicht: !!f.pflicht,
    eindeutig: !!f.eindeutig && (typ === 'text' || typ === 'zahl'),
    hilfe: text(f.hilfe),
    standard: std == null || std === '' || typ === 'passwort' ? null : typeof std === 'boolean' ? std : String(std),
    minLen: zahlOderNull(f.minLen),
    maxLen: zahlOderNull(f.maxLen),
    muster: text(f.muster),
    min: zahlOderNull(f.min),
    max: zahlOderNull(f.max),
    nachkomma: zahlOderNull(f.nachkomma),
    waehrung: typ === 'betrag' ? (text(f.waehrung) || 'EUR').toUpperCase().slice(0, 3) : undefined,
    optionen: Array.isArray(f.optionen) ? f.optionen.map(text).filter(Boolean) : [],
    mehrfach: !!f.mehrfach && (typ === 'auswahl' || typ === 'referenz'),
    zielTyp: typ === 'referenz' ? text(f.zielTyp) : '',
    // Auswahlfilter (#172): nur an Referenzfeldern mit festem Zieltyp.
    ...(typ === 'referenz' && text(f.zielTyp) && text(f.zielTyp) !== '*' && bereinigeAuswahlfilter(f.auswahlFilter).length ? { auswahlFilter: bereinigeAuswahlfilter(f.auswahlFilter) } : {}),
    verweisart: f.verweisart === 'zugehoerigkeit' ? 'zugehoerigkeit' : 'bezug',
    // Fristen (#129): nur an Datumsfeldern.
    ...(typ === 'datum' && bereinigeFrist(f.frist) ? { frist: bereinigeFrist(f.frist) } : {}),
  };
}

export function bereinigeRegister(e: unknown, felder: Feld[]): Register[] {
  if (!Array.isArray(e) || !e.length) return standardRegister(felder);
  const bekannt = new Set(felder.map((f) => f.key));
  const reg = e.map((x: Record<string, unknown>): Register => {
    const art = (String(x?.art) in REGISTERARTEN ? x.art : 'felder') as Register['art'];
    const r: Register = { key: text(x?.key) || schluesselAus(text(x?.name)), name: text(x?.name), art };
    if (art === 'felder') r.felder = (Array.isArray(x?.felder) ? x.felder.map(text) : []).filter((k) => bekannt.has(k));
    if (art === 'verknuepfungen') {
      r.quellen = (Array.isArray(x?.quellen) ? x.quellen : [])
        .map((q: Record<string, unknown>): Quelle => ({ typId: text(q?.typId), feldKey: text(q?.feldKey), ...(text(q?.trefferliste) ? { trefferliste: text(q?.trefferliste).slice(0, 40) } : {}) }))
        .filter((q) => q.typId && q.feldKey);
    }
    // Volltext (#45): nur das Abschalten wird gespeichert; Standard ist an.
    if (art === 'dokumente' && x?.volltext === false) r.volltext = false;
    // Versionierung (#194): Standard aus; „nur die letzten N“ ab 2, leer = alle.
    if (art === 'dokumente' && x?.versionierung === true) {
      r.versionierung = true;
      const n = Math.trunc(Number(x.versionenBehalten));
      if (x.versionenBehalten != null && x.versionenBehalten !== '' && Number.isFinite(n) && n >= 2) r.versionenBehalten = Math.min(n, 1000);
    }
    return r;
  });
  // Felder ohne Register landen auf dem ersten Feldregister.
  const erstes = reg.find((r) => r.art === 'felder');
  if (erstes) {
    const vergeben = new Set(reg.flatMap((r) => r.felder ?? []));
    for (const f of felder) if (!vergeben.has(f.key)) erstes.felder!.push(f.key);
  }
  return reg;
}

/** Nur bekannte Spalten, jede einmal; Spalten entfernter Felder und Passwortfelder fallen still weg. */
function bereinigeSpalten(e: unknown, felder: Feld[]): string[] {
  return [...new Set((Array.isArray(e) ? e : []).map(text))]
    .filter((k) => (istSystemspalte(k) && k !== '_typ') || felder.some((f) => f.key === k && f.typ !== 'passwort'));
}

/**
 * Trefferlisten (#75): mindestens eine, Schlüssel eindeutig, genau eine ist Standard.
 * Die ältere Angabe `trefferliste` (nur Spalten) ersetzt – falls angegeben – die Spalten der Standardliste.
 */
export function bereinigeTrefferlisten(t: Record<string, unknown>, felder: Feld[]): { trefferlisten: Trefferliste[]; trefferliste: string[] } {
  const roh = Array.isArray(t.trefferlisten) ? (t.trefferlisten as Array<Record<string, unknown>>) : [];
  const listen: Trefferliste[] = [];
  for (const x of roh) {
    const name = text(x?.name).slice(0, 80) || 'Trefferliste';
    let key = (text(x?.key) || schluesselAus(name) || 'liste').slice(0, 40);
    for (let i = 2; listen.some((l) => l.key === key); i++) key = `${(text(x?.key) || schluesselAus(name) || 'liste').slice(0, 36)}_${i}`;
    listen.push({ key, name, spalten: bereinigeSpalten(x?.spalten, felder), ...(x?.standard === true ? { standard: true } : {}) });
  }
  if (!listen.length) listen.push({ key: 'standard', name: 'Standard', spalten: [], standard: true });
  const std = listen.find((l) => l.standard) ?? listen[0];
  for (const l of listen) { if (l === std) l.standard = true; else delete l.standard; }
  if (Array.isArray(t.trefferliste) && (!roh.length || JSON.stringify(t.trefferliste) !== JSON.stringify(std.spalten))) {
    // Nur die alte Form angegeben, oder sie weicht ab (z. B. { ...typ, trefferliste: [...] } über die API).
    std.spalten = bereinigeSpalten(t.trefferliste, felder);
  }
  return { trefferlisten: listen, trefferliste: std.spalten };
}

export function bereinigeTyp(e: unknown): MappentypDaten {
  const t = (e ?? {}) as Record<string, unknown>;
  const felder = Array.isArray(t.felder) ? t.felder.map(bereinigeFeld) : [];
  // Archivmodus (#212): Frist 1–30 Jahre, Stichtag ein Feldschlüssel oder null (Anlagedatum).
  const a = t.archiv && typeof t.archiv === 'object' ? t.archiv as Record<string, unknown> : null;
  const jahre = a ? Math.trunc(Number(a.jahre)) : 0;
  const archiv = a && jahre >= 1 && jahre <= JAHRE_MAX ? { jahre, stichtag: text(a.stichtag) || null } : null;
  const register = bereinigeRegister(t.register, felder);
  // Im Archivmodus ist die Versionierung Pflicht, und ältere Versionen bleiben bis zum Fristende.
  if (archiv) for (const r of register) if (r.art === 'dokumente') { r.versionierung = true; delete r.versionenBehalten; }
  return {
    name: text(t.name),
    ...(text(t.schluessel) ? { schluessel: text(t.schluessel) } : {}),
    beschreibung: text(t.beschreibung),
    // Altes Format: titelFeld → Vorlage {feld}
    titelVorlage: text(t.titelVorlage) || (text(t.titelFeld) ? `{${text(t.titelFeld)}}` : ''),
    felder,
    register,
    ...bereinigeTrefferlisten(t, felder),
    archiv,
    // Die Haken „Neue Mappen/Löschen erlauben“ gibt es nicht mehr (#146): das regeln die Berechtigungen.
    erstellenErlaubt: true,
    loeschenErlaubt: true,
  };
}

/** Wert eines Mehrfachverweises als Liste. */
/** Post (#192): Beschreibung und Spalten der Standard-Trefferliste. */
const POST_BESCHREIBUNG = 'Alles, was ins DMS kommt oder hinausgeht: Hochgeladenes, Scans, E-Mails. Von hier aus ordnest du es passenden Mappen zu.';
const POST_SPALTEN = ['datum', 'stand', 'kanal', 'absender'];

const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Für die Benutzerverwaltung: Benutzer-Mappen anlegen, nachziehen und entfernen. */
export interface Benutzerspiegel {
  /** Legt die Mappe des Benutzers an oder zieht sie nach (Name, E-Mail, Systemrolle, aktiv). */
  aktualisiere(b: Benutzer, von?: string | null): Promise<void>;
  /** Entfernt die Mappe; wirft, wenn noch etwas auf sie verweist. */
  entferne(id: string): Promise<void>;
  /** Ist der Papierkorb an (#43)? Dann wird ein Benutzer deaktiviert und seine Mappe kommt in den Papierkorb. */
  papierkorbAn?(): Promise<boolean>;
  /** Legt die Mappe in den Papierkorb; wirft, wenn noch etwas auf sie verweist. */
  inPapierkorb?(id: string, von: string | null): Promise<void>;
  /** Anzahl offener Aufgaben eines Benutzers (ohne die der Administratoren) – Deaktivieren nur ohne (#77). */
  offeneAufgaben?(id: string): Promise<number>;
  /** Alle offenen Aufgaben eines Benutzers an einen anderen geben (#78); Anzahl. */
  aufgabenUebergeben?(id: string, an: string, von: string | null): Promise<number>;
  /** Abwesenheit geändert: Protokoll an der Benutzer-Mappe und Aufgabe „Vertretung“ (#78). */
  abwesenheitGeaendert?(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string): Promise<void>;
}

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43). */
export interface KontenHaken {
  /** Endgültig gelöscht: Konto löschen. */
  endgueltig(id: string): Promise<void>;
  /** Wiederhergestellt: Konto wieder aktivieren. */
  wiederda(id: string, von: string | null): Promise<void>;
  /** Alle Konten mit Abwesenheit und Vertreter – für die Umleitung von Aufgaben (#78). */
  benutzer?(): Promise<Benutzer[]>;
}

export const PAPIERKORB_STANDARD_TAGE = 30;
/** Anhänge einer E-Mail zusammen höchstens (#58); die Oberfläche warnt schon ab 20 MB. */
export const EMAIL_MAX_ANHAENGE = 50_000_000;
export const EMAIL_MAX_EMPFAENGER = 20;
/** Höchstens so viele Mappen in einer E-Mail (#151). */
export const EMAIL_MAX_MAPPEN = 100;
export const HISTORIE_STANDARD_TAGE = 365;
export interface DienstOptionen {
  /** Schlüssel für Passwortfelder (#39, #46). */
  tresor?: Tresor;
  /** Einstellungen des Haushalts (Papierkorb). Ohne: kein Papierkorb (Löschen sofort endgültig). */
  einstellungen?: Einstellungen;
}

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel', _typ: 'typ', _erstellt: 'erstellt', _geaendert: 'geaendert', _erstelltVon: 'erstelltVon', _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art = f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'datum' || f.typ === 'janein' ? f.typ : 'text';
  return { art, key: f.key, absteigend };
}

/** Dateiname ohne Pfadanteile und Steuerzeichen. */
/** Automatisch verkleinern (#393): Einstellung in der Werkbank → Systemzustand; Standard aus. */
export interface VerkleinernEinstellung { automatisch: boolean; abMb: number; stufe: Stufe }
export const VERKLEINERN_STANDARD: VerkleinernEinstellung = { automatisch: false, abMb: 5, stufe: STANDARD_STUFE };
export function verkleinernEinstellungAus(v: unknown): VerkleinernEinstellung {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const abMb = Number(o.abMb);
  return {
    automatisch: o.automatisch === true,
    abMb: Number.isFinite(abMb) && abMb >= 1 && abMb <= 100 ? abMb : VERKLEINERN_STANDARD.abMb,
    stufe: istStufe(o.stufe) ? o.stufe : VERKLEINERN_STANDARD.stufe,
  };
}
/** Neue Dateien von außen, die automatisch verkleinert werden dürfen – nicht im DMS Bearbeitetes oder Zurückgeholtes. */
const AUTOMATISCH_VERKLEINERN: ReadonlySet<Herkunft> = new Set<Herkunft>(['hochgeladen', 'api', 'webdav', 'eingang']);
/** Werkbank: so viele große PDFs in der Liste und in einer Sammelaktion, davon so viele mit Schätzung. */
export const GROSSE_MAX = 200;
export const GROSSE_MIT_SCHAETZUNG = 60;
/** Volltext übernehmen statt neu erkennen (Verkleinern ohne Versionierung). */
interface Volltextuebernahme { text: string; seiten: number | null; info: string | null }

/** Kurztext der Historie für „PDF bearbeitet“ (#335). */
function pdfText(w: { seiten: number; vorher: number; gedreht?: number; teile?: number }): string {
  const t: string[] = [];
  if (w.teile) t.push(`in ${w.teile} Teile geteilt`);
  if (w.seiten !== w.vorher && !w.teile) t.push(`${w.vorher} → ${w.seiten} Seiten`);
  if (w.gedreht) t.push(`${w.gedreht} ${w.gedreht === 1 ? 'Seite' : 'Seiten'} gedreht`);
  return t.join(', ') || 'Seiten umsortiert';
}

/** Kreis und Barcode-Präfix der Archivnummern (#345). */
export const ARCHIV_KREIS = 'archivnummer';
export const ARCHIV_PRAEFIX = 'DMS-ASN:';
/** Eingabe → Archivnummer (Präfix aus dem Barcode weg, ohne Rand); leer → null. */
export function archivnummerAus(v: unknown): string | null {
  const t = String(v ?? '').trim().replace(/^DMS-ASN:/i, '').trim();
  return t || null;
}

function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  const s = text(v).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Dokument').slice(0, 200);
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Nur Werte zu bekannten Feldern; leere Eingaben werden zu null. */
/**
 * Passwortfeld (#46): neues Passwort verschlüsseln, entfernen oder das bisherige behalten.
 * - { neu: '…' } oder ein Text: neues Passwort
 * - null, '' oder { entfernen: true }: entfernen
 * - fehlt oder { gesetzt: true } (so, wie die Oberfläche es bekam): unverändert
 */
function passwortWert(eingabe: unknown, hatEingabe: boolean, bisher: unknown, verschluessele: (k: string) => string): Werte[string] {
  // Ohne Eingabe oder unverändert durchgereicht (System, z. B. beim Nachziehen einer Benutzer-Mappe): behalten.
  if (!hatEingabe || (eingabe === bisher && eingabe !== undefined)) return (bisher ?? null) as Werte[string];
  if (eingabe === null || eingabe === '') return null;
  if (typeof eingabe === 'string') {
    if (eingabe.startsWith('dms1$')) throw new Fachfehler(422, 'Verschlüsselte Werte lassen sich nicht direkt setzen.');
    return verschluessele(eingabe.slice(0, 1000));
  }
  if (istPasswortWert(eingabe)) {
    if (eingabe.entfernen) return null;
    if (typeof eingabe.neu === 'string' && eingabe.neu !== '') return verschluessele(eingabe.neu.slice(0, 1000));
    return (eingabe.gesetzt ? bisher ?? null : null) as Werte[string];
  }
  throw new Fachfehler(422, 'Ungültiger Wert für ein Passwortfeld.');
}

function bereinigeWerte(typ: Mappentyp, eingabe: unknown, bisher: Werte = {}, verschluessele: (k: string) => string = keinSchluessel): Werte {
  const roh = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
  const bekannt = new Set(typ.felder.map((f) => f.key));
  const werte: Werte = {};
  // Werte aus entfernten Feldern bleiben erhalten.
  for (const [k, v] of Object.entries(bisher)) if (!bekannt.has(k)) werte[k] = v;
  for (const f of typ.felder) {
    if (f.typ === 'passwort') { werte[f.key] = passwortWert(roh[f.key], f.key in roh, bisher[f.key], verschluessele); continue; }
    const v = f.key in roh ? roh[f.key] : bisher[f.key];
    werte[f.key] = istLeer(v) ? (f.typ === 'janein' ? false : null) : (v as Werte[string]);
  }
  return werte;
}

const keinSchluessel = (): never => {
  throw new Fachfehler(409, 'Passwörter lassen sich erst speichern, wenn es einen Schlüssel gibt. Ein Administrator erzeugt ihn in der Werkbank unter „Verschlüsselung“.');
};

/* ---------- Fachlogik ---------- */

export class Dienst {
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  private tresor?: Tresor;
  private einstellungen?: Einstellungen;
  private konten?: KontenHaken;

  constructor(private grundRepo: Repo, private dateien: Dateispeicher, opt: DienstOptionen = {}) {
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.tresor?.registriere(() => this.unlesbarePasswoerter());
    // Was verschlüsselt ist, je Art (#410): dieselben Stellen, die der Schlüsselwechsel umschlüsselt.
    // Passwortfelder meldet unlesbarePasswoerter genauer (mit Feldnamen), den Mailserver der Betrieb.
    this.tresor?.registriereBestand(() => this.repo.verschluesselteFundstellen(), ['passwortfeld', 'mail']);
  }

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion. */
  private get repo(): Repo {
    const t = transaktionen.getStore();
    return t?.dienst === this ? t.repo : this.grundRepo;
  }

  /**
   * Änderungen samt Ereignissen ganz oder gar nicht (#404). Verschachtelt läuft alles in der äußeren
   * Transaktion. Nur Datenbank-Arbeit hineinlegen: Dateien schreiben vorher, Anstöße (Vorschau,
   * Texterkennung, Läufer) mit `danach`.
   */
  private async inTransaktion<T>(f: () => Promise<T>): Promise<T> {
    if (transaktionen.getStore()?.dienst === this) return f();
    const nachher: Array<() => void> = [];
    const erg = await this.grundRepo.transaktion((repo) => transaktionen.run({ dienst: this, repo, nachher }, f));
    for (const n of nachher) n();
    return erg;
  }

  /** Nach dem Speichern (bzw. sofort ohne Transaktion); bei Zurückrollen nie. */
  private danach(f: () => void) {
    const t = transaktionen.getStore();
    if (t?.dienst === this) t.nachher.push(f); else f();
  }

  /** Schlüssel wechseln (#47): alle Passwortfelder, der Papierkorb und die Einstellungen in einer Transaktion. */
  async schluesselWechseln(von: string) {
    if (!this.tresor) throw new Fachfehler(404, 'Die Verschlüsselung ist nicht eingerichtet.');
    return this.tresor.wechsle((um, einstellungen) => this.repo.umschluesseln(um, einstellungen), von);
  }

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) { this.konten = h; }

  /** Texterkennung anbinden (#45): neue Dokumente stoßen sie an. */
  private ocr?: { anstossen(): void };
  verbindeTexterkennung(t: { anstossen(): void }) { this.ocr = t; }

  /** Vorschaubilder anbinden (#332): neue Dateien einreihen, gelöschte mit entfernen. */
  private vorschau?: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> };
  verbindeVorschau(v: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> }) { this.vorschau = v; }

  /** Vorschaubilder für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen, #332). */
  async vorschauNachholen(): Promise<number> {
    if (!this.vorschau) return 0;
    const ids = [...new Set((await this.repo.alleDateien()).map((f) => f.dokumentId))];
    const docs: Dokument[] = [];
    for (const id of ids) { const d = await this.repo.holeDokument(id); if (d) docs.push(d); }
    return this.vorschau.nachholen(docs);
  }

  /* ---------- Volltext (#45) ---------- */

  /** Erzeugt dieses Dokumentenregister einen Volltext? (Standard: ja) */
  private static volltextAn(typ: Mappentyp | undefined, registerKey: string) {
    const r = typ?.register.find((x) => x.key === registerKey);
    return !r || r.art !== 'dokumente' || r.volltext !== false;
  }

  /** Volltext für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen). */
  async volltextNachholen(): Promise<number> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.ocrOhneVolltext()).filter((d) => Dienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
    await this.repo.ocrEinreihen(ids);
    if (ids.length) protokoll.modul('werkbank').info('Volltext für vorhandene Dokumente nachholen', { dokumente: ids.length });
    this.ocr?.anstossen();
    return ids.length;
  }

  /** Texterkennung für ein Dokument erneut versuchen. */
  async texterkennungErneut(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    await this.repo.ocrEinreihen([id]);
    this.ocr?.anstossen();
    return (await this.repo.holeDokument(id))!;
  }

  async volltext(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { dokument: d, text: await this.repo.volltext(id) };
  }

  /**
   * Volltext schreiben (#338, für die Texterkennung als Paket): ersetzt den Volltext eines Dokuments.
   * Die Herkunft steht in ocr.info und in der Historie der Mappe; die eingebaute Texterkennung
   * überschreibt diesen Text danach nicht mehr von selbst (nur „Texterkennung erneut“).
   */
  async schreibeVolltext(id: string, eingabe: unknown, von: { id: string; herkunft: string; paket: boolean }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (typeof e.text !== 'string') throw new Fachfehler(422, 'text fehlt.');
    if (e.text.length > VOLLTEXT_MAX) throw new Fachfehler(413, `Der Text ist zu lang (höchstens ${VOLLTEXT_MAX} Zeichen).`);
    const seiten = Number.isInteger(e.seiten) && (e.seiten as number) > 0 ? e.seiten as number : null;
    // Nur Text eines Pakets schützt vor der eingebauten Texterkennung (PAKET_TEXT); über die API gesetzter nicht.
    // Die Herkunft darf die Sprachmarke nicht vortäuschen (#395); die erkannte Sprache hängt am Ende an.
    const herkunft = von.herkunft.split(SPRACHE_MARKE.trim()).join('Sprache:');
    const info = (von.paket ? `${PAKET_TEXT}${herkunft}` : `Volltext ${herkunft}`).slice(0, 200);
    const text = e.text.replace(/\u0000/g, '');
    const sprache = erkenneSprache(text);
    await this.repo.ocrSetze(id, { stand: 'fertig', text, seiten: seiten ?? d.ocr?.seiten ?? null, info: info + (sprache ? spracheZuInfo(sprache) : '') });
    await this.notiere(d.mappeId, von.id, 'volltext', { dokument: d.name, text: info });
    protokoll.modul('ablage').info('Volltext geschrieben', { dokument: id, zeichen: e.text.length, herkunft: von.herkunft });
    return (await this.repo.holeDokument(id))!;
  }

  private verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /* ---------- Passwortfelder (#46) ---------- */

  /** Lassen sich gerade Passwörter speichern? */
  get passwoerterMoeglich() { return !!this.tresor?.bereit; }

  /** Passwortfelder, die mit dem vorhandenen Schlüssel nicht lesbar sind (für die Werkbank). */
  async unlesbarePasswoerter(): Promise<Betroffen[]> {
    const out: Betroffen[] = [];
    for (const t of await this.repo.listeTypen()) {
      const felder = t.felder.filter((f) => f.typ === 'passwort');
      if (!felder.length) continue;
      for (const m of await this.repo.listeMappen(t.id)) {
        for (const f of felder) {
          const v = m.werte[f.key];
          if (istVerschluesselt(v) && !this.tresor?.lesbar(v)) out.push({ bereich: t.name, was: `${m.titel || 'Mappe ohne Titel'}: ${f.label}`, wo: 'in der Ablage neu eingeben' });
        }
      }
    }
    return out;
  }

  /** Klartext eines Passworts zum Anzeigen; jeder Aufruf steht im Protokoll (ohne den Wert). */
  async zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const f = typ?.felder.find((x) => x.key === feldKey && x.typ === 'passwort');
    if (!f) throw new Fachfehler(404, 'Dieses Passwortfeld gibt es nicht.');
    const v = m.werte[f.key];
    if (!istVerschluesselt(v)) throw new Fachfehler(404, 'In diesem Feld ist kein Passwort gespeichert.');
    const klar = this.tresor?.entschluessele(v) ?? null;
    if (klar === null) throw new Fachfehler(409, 'Dieses Passwort ist nicht lesbar: Der Schlüssel, mit dem es gespeichert wurde, fehlt. Bitte neu eingeben.');
    protokoll.modul('ablage').info('Passwort angezeigt', { mappe: m.titel || m.id, mappeId: m.id, feld: f.label });
    await this.notiere(m.id, benutzerId, 'passwort_angezeigt', { feld: f.label });
    return { wert: klar };
  }

  /**
   * Für die API mit dem Recht „Passwörter lesen“: Passwörter einer oder mehrerer Mappen
   * im Klartext; je Mappe ein Protokolleintrag (ohne die Werte).
   */
  async entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const historie: Parameters<Repo['historieSchreibe']>[0] = [];
    const ergebnis = mappen.map((m) => {
      const felder = typen.get(m.typId)?.felder.filter((f) => f.typ === 'passwort' && istVerschluesselt(m.werte[f.key])) ?? [];
      if (!felder.length) return m;
      const werte = { ...m.werte };
      for (const f of felder) werte[f.key] = this.tresor?.entschluessele(werte[f.key] as string) ?? null;
      protokoll.modul('ablage').info('Passwörter über die API abgerufen', { mappe: m.titel || m.id, mappeId: m.id, felder: felder.map((f) => f.label).join(', '), schluessel: wer });
      historie.push({ mappeId: m.id, benutzerId, art: 'passwort_angezeigt', daten: { feld: felder.map((f) => f.label).join(', '), api: wer } });
      return { ...m, werte };
    });
    await this.repo.historieSchreibe(historie);
    return ergebnis;
  }

  /* ---------- Aufgaben (#54) und Erwähnungen (#56) ---------- */

  private async name(benutzerId: string | null): Promise<string> {
    if (!benutzerId) return 'Administratoren';
    return (await this.repo.titelVon([benutzerId])).get(benutzerId)?.replace(/ \(ehemalig\)$/, '') || 'unbekannt';
  }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  private async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.sichereSystem();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, 'Bitte einen Benutzer als Empfänger wählen.');
    if (m.werte.aktiv === false) throw new Fachfehler(422, 'Dieser Benutzer ist deaktiviert.');
    return m.id;
  }

  /**
   * Neue @-Erwähnungen in formatiertem Text werden Aufgaben (#56). Gibt es für Benutzer und Feld
   * schon eine offene, entsteht keine zweite; entfernte Erwähnungen stehen nur in der Historie.
   */
  private async pruefeErwaehnungen(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    for (const f of typ.felder.filter((x) => x.typ === 'formatiert')) {
      await this.erwaehnungenAbgleichen(mappeId, { key: f.key, ort: `in „${f.label}“` }, String(alt[f.key] ?? ''), String(neu[f.key] ?? ''), von);
    }
  }

  /**
   * Gemeinsamer Abgleich für Felder und Notizen (#81): `quelle.key` unterscheidet die Stelle
   * (Feldschlüssel oder `notiz:<id>`), `quelle.ort` steht im Text („in „Beschreibung““, „in einer Notiz“).
   */
  private async erwaehnungenAbgleichen(mappeId: string, quelle: { key: string; ort: string; auszug?: string }, altText: string, neuText: string, von: string | null) {
    const vorher = new Set(erwaehnungen(altText));
    const jetzt = new Set(erwaehnungen(neuText));
    if (!vorher.size && !jetzt.size) return;
    const { benutzer } = await this.sichereSystem();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    // #137: nur Benutzer, die der Erwähnende sehen darf.
    const sichtbar = von ? await this.sichtbarFuer(von, [...jetzt]) : new Set(jetzt);
    for (const id of jetzt) {
      if (vorher.has(id) || id === von || offen.some((a) => a.empfaengerId === id) || !sichtbar.has(id)) continue;
      const m = await this.repo.holeMappe(id);
      if (!m || m.typId !== benutzer.id) continue;
      // Deaktivierte nur, wenn ihr Vertreter übernimmt (#78).
      if (m.werte.aktiv === false && (await this.empfaengerAufloesen(id)).ziel === id) continue;
      const a = await this.repo.legeAufgabeAn({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: `Erwähnt von ${await this.name(von)} ${quelle.ort}${quelle.auszug ? `: ${quelle.auszug}` : ''}`.slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(mappeId, von, 'aufgabe', { text: `${await this.name(id)} erwähnt ${quelle.ort}`, aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: a.text });
      await this.leiteUm(a);
    }
    for (const id of vorher) {
      if (!jetzt.has(id)) await this.notiere(mappeId, von, 'aufgabe', { text: `Erwähnung von ${await this.name(id)} ${quelle.ort} entfernt` });
    }
  }


  /* ---------- Abwesenheit und Vertretung (#77, #78) ---------- */

  /**
   * Wer eine Aufgabe für `id` bekommt: der Benutzer selbst – oder, solange seine Abwesenheit wirkt
   * bzw. er deaktiviert ist, sein Vertreter. Ketten höchstens VERTRETER_SCHRITTE weit; bei einem
   * Kreis oder einem deaktivierten Vertreter bleibt sie beim letzten erreichbaren Empfänger.
   */
  async empfaengerAufloesen(id: string | null): Promise<{ ziel: string | null; abwesende: string[] }> {
    if (!id || !this.konten?.benutzer) return { ziel: id, abwesende: [] };
    const alle = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const heute = heuteIn();
    let ziel = id;
    const abwesende: string[] = [];
    const gesehen = new Set([id]);
    for (let i = 0; i < VERTRETER_SCHRITTE; i++) {
      const b = alle.get(ziel);
      if (!b || (b.aktiv && !abwesenheitWirkt(b.abwesenheit, heute))) break;
      const v = b.abwesenheit?.vertreterId;
      const vb = v ? alle.get(v) : undefined;
      if (!v || !vb || !vb.aktiv || gesehen.has(v)) break;
      abwesende.push(ziel); gesehen.add(v); ziel = v;
    }
    return { ziel, abwesende };
  }

  /** Neue Aufgabe eines Abwesenden an den Vertreter geben – wie „Weitergeben“, mit Protokolleintrag. Vertretungs-Aufgaben nie. */
  private async leiteUm(a: Aufgabe): Promise<Aufgabe> {
    if (a.art === 'vertretung' || !a.empfaengerId) return a;
    const { ziel, abwesende } = await this.empfaengerAufloesen(a.empfaengerId);
    if (!ziel || ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(a.id, ziel);
    const namen = (await Promise.all(abwesende.map((x) => this.name(x)))).join(', ');
    await this.notiere(a.mappeId, null, 'aufgabe', {
      text: `weitergegeben wegen Abwesenheit von ${namen} an ${await this.name(ziel)}: ${a.text}`,
      aufgabe: a.id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text,
    });
    protokoll.modul('ablage').info('Aufgabe wegen Abwesenheit weitergegeben', { mappeId: a.mappeId, von: namen, an: await this.name(ziel) });
    return (await this.repo.holeAufgabe(a.id)) ?? a;
  }

  /** „Passt nicht“-Aufgaben anlegen bzw. erledigen; neue für Abwesende gehen an deren Vertreter. */
  private async passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) {
    await this.repo.aufgabenZurPassung(liste);
    const ids = liste.filter((x) => x.problem).map((x) => x.id);
    if (!ids.length || !this.konten?.benutzer) return;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: ids })) if (a.art === 'passung') await this.leiteUm(a);
  }

  /** Alle offenen Aufgaben eines Benutzers (ohne die der Administratoren) an einen anderen geben. */
  async aufgabenUebergeben(id: string, an: string, von: string | null): Promise<number> {
    const ziel = await this.pruefeEmpfaenger(an);
    if (!ziel || ziel === id) throw new Fachfehler(422, 'Bitte einen anderen Benutzer wählen.');
    const offen = (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id);
    for (const a of offen) {
      await this.repo.delegiereAufgabe(a.id, ziel);
      await this.notiere(a.mappeId, von, 'aufgabe', {
        text: `weitergegeben von ${await this.name(id)} an ${await this.name(ziel)}: ${a.text}`,
        aufgabe: a.id, aufgabenart: a.art, vonId: id, anId: ziel, aufgabentext: a.text,
      });
    }
    if (offen.length) protokoll.modul('ablage').info('Offene Aufgaben übergeben', { von: await this.name(id), an: await this.name(ziel), anzahl: offen.length });
    return offen.length;
  }

  /**
   * Abwesenheit geändert (#78): Klartext im Protokoll der Benutzer-Mappe; die Aufgabe „Vertretung“
   * des bisherigen Vertreters erledigt sich, der aktuelle bekommt eine neue (nicht umgeleitet).
   */
  async abwesenheitGeaendert(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string) {
    const neu = b.abwesenheit;
    if (!neu || JSON.stringify(neu) === JSON.stringify(alt)) return;
    const { benutzer: typ } = await this.sichereSystem();
    const m = await this.repo.holeMappe(b.id);
    if (!m || m.typId !== typ.id) return;
    const name = b.name || b.email;
    const datum = (t: string) => t.split('-').reverse().join('.');
    const zeitraum = (a: Abwesenheit) => (a.von && a.bis ? `vom ${datum(a.von)} bis ${datum(a.bis)}` : a.von ? `ab ${datum(a.von)}, bis die Abwesenheit endet`
      : a.bis ? `ab sofort bis ${datum(a.bis)}` : 'ab sofort, bis die Abwesenheit endet');
    const durch = von && von !== b.id ? ` (eingetragen von ${await this.name(von)})` : '';
    const endet = alt.an && !neu.an;
    const text = endet ? `Abwesenheit beendet${wegen ? ` (${wegen})` : ''}`
      : neu.an ? `Abwesenheit ${alt.an ? 'geändert' : 'eingetragen'}: ${zeitraum(neu)}, Vertreter ${await this.name(neu.vertreterId)}${durch}`
      : `Vertreter ${neu.vertreterId ? `hinterlegt: ${await this.name(neu.vertreterId)}` : 'entfernt'}${durch}`;
    await this.notiere(b.id, von, 'abwesenheit', { text });
    // Vertretungs-Aufgaben: alte erledigen sich, solange sich Vertreter oder Zeitraum ändert oder die Abwesenheit endet.
    for (const a of (await this.repo.offeneAufgaben({ mappeIds: [b.id] })).filter((x) => x.art === 'vertretung')) {
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(b.id, null, 'aufgabe', { text: `erledigt (${endet ? 'Abwesenheit beendet' : 'Vertretung geändert'}): ${a.text}`, aufgabe: a.id, aufgabenart: 'vertretung', fuer: a.empfaengerId, aufgabentext: a.text });
    }
    if (neu.an && neu.vertreterId && (!neu.bis || neu.bis >= heuteIn())) {
      const a = await this.repo.legeAufgabeAn({
        id: randomUUID(), mappeId: b.id, empfaengerId: neu.vertreterId, art: 'vertretung',
        text: `Du wurdest für ${name} als Vertreter hinterlegt – ${zeitraum(neu)}.`.slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(b.id, von, 'aufgabe', { text: `für ${await this.name(neu.vertreterId)}: Vertretung`, aufgabe: a.id, aufgabenart: 'vertretung', fuer: neu.vertreterId, aufgabentext: a.text });
    }
  }

  /** Aufgabe von Hand vergeben, z. B. „Bitte Rechnung prüfen“. */
  async legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const x = (e ?? {}) as Record<string, unknown>;
    const text = typeof x.text === 'string' ? x.text.trim() : '';
    if (!text) throw new Fachfehler(422, 'Bitte beschreiben, was zu tun ist.');
    if (text.length > AUFGABE_MAX) throw new Fachfehler(422, `Höchstens ${AUFGABE_MAX} Zeichen.`);
    const an = await this.pruefeEmpfaenger(x.empfaengerId);
    const a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId, empfaengerId: an, art: 'manuell', text, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(mappeId, von, 'aufgabe', { text: `für ${await this.name(an)}: ${text}`, aufgabe: a.id, aufgabenart: 'manuell', fuer: an, aufgabentext: text });
    protokoll.modul('ablage').info('Aufgabe vergeben', { mappeId, an: await this.name(an) });
    return this.leiteUm(a);
  }

  private async eigeneAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.repo.holeAufgabe(id);
    if (!a) throw new Fachfehler(404, 'Diese Aufgabe gibt es nicht.');
    const meine = a.empfaengerId === ich.id || (!a.empfaengerId && ich.rolle === 'admin');
    if (!meine && ich.rolle !== 'admin') throw new Fachfehler(403, 'Das ist nicht deine Aufgabe. Weitergeben oder erledigen kann sie nur ihr Empfänger oder ein Administrator.');
    if (a.erledigt) throw new Fachfehler(409, 'Diese Aufgabe ist schon erledigt.');
    return a;
  }

  /** Bestätigen (Erwähnungen, manuelle Aufgaben). „Passt nicht“ erledigt sich, sobald die Mappe passt. */
  async erledigeAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    if (a.art === 'passung') throw new Fachfehler(409, 'Diese Aufgabe erledigt sich selbst, sobald die Mappe wieder zur Definition passt.');
    await this.repo.erledigeAufgabe(id, ich.id);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: `erledigt: ${a.text}`, aufgabe: id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe erledigt', { mappeId: a.mappeId, aufgabe: a.text });
    const folgetermin = await this.folgeterminVon(a);
    return { ...(await this.repo.holeAufgabe(id))!, ...(folgetermin ? { folgetermin } : {}) };
  }

  /** Weitergeben: durch den Empfänger selbst oder einen Administrator; steht im Protokoll. */
  async delegiereAufgabe(id: string, an: unknown, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    const ziel = await this.pruefeEmpfaenger(an);
    if (ziel === a.empfaengerId) return a;
    await this.repo.delegiereAufgabe(id, ziel);
    const von = await this.name(a.empfaengerId), nach = await this.name(ziel);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: `weitergegeben von ${von} an ${nach}: ${a.text}`, aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe weitergegeben', { mappeId: a.mappeId, von, an: nach, aufgabe: a.text });
    return (await this.repo.holeAufgabe(id))!;
  }

  /** Meine offenen Aufgaben (mit denen der Administratoren, wenn ich einer bin). */
  async meineAufgaben(ich: { id: string; rolle: string }, z?: Zugriff) {
    const liste = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: ich.rolle === 'admin' });
    // Aufgaben zu Mappen, die man nicht lesen darf: ohne Titel (#127).
    const ok = await this.lesbare(z, liste.map((a) => a.mappeId));
    return liste.map((a) => (ok.has(a.mappeId) ? a : { ...a, mappeTitel: NICHT_SICHTBAR, verborgen: true }));
  }
  /** Werkbank: alle offenen oder die zuletzt erledigten. */
  async alleAufgaben(erledigt = false) { return erledigt ? this.repo.erledigteAufgaben(500) : this.repo.offeneAufgaben(); }
  aufgabenVon(mappeId: string) { return this.repo.aufgabenVon(mappeId); }

  /* ---------- Fristen (#129–#133) ---------- */

  /**
   * Frist-Aufgaben abgleichen: ab „Datum − Vorlauf“ eine Aufgabe je Mappe, Feld und Datum (nie doppelt,
   * auch nicht nach dem Erledigen); offene Fristen erledigen sich, sobald das Datum nicht mehr stimmt.
   * Nach dem Speichern einer Mappe, nach Änderungen am Mappentyp und regelmäßig (täglicher Lauf).
   */
  async fristenAbgleichen(f: { typId?: string; mappeIds?: string[] } = {}, heute = heuteIn()): Promise<{ angelegt: number; erledigt: number }> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let mappen: Mappe[];
    if (f.mappeIds) mappen = await this.repo.holeMappen(f.mappeIds);
    else {
      // Typen mit Erinnerung – und solche, an denen noch offene Fristen hängen (Erinnerung abgeschaltet).
      const offen = new Set((await this.repo.fristAufgaben()).filter((a) => !a.erledigt).map((a) => a.typId));
      const welche = [...typen.values()].filter((t) => (!f.typId || t.id === f.typId) && (fristFelder(t).length || offen.has(t.id)));
      mappen = (await Promise.all(welche.map((t) => this.repo.listeMappen(t.id)))).flat();
    }
    if (!mappen.length) return { angelegt: 0, erledigt: 0 };
    const vorhanden = await this.repo.fristAufgaben(f.mappeIds ?? (f.typId ? mappen.map((m) => m.id) : undefined));
    const schon = new Set(vorhanden.map((a) => `${a.mappeId}|${a.feldKey}|${a.datum}`));
    let angelegt = 0; let erledigt = 0;
    for (const m of mappen) {
      const typ = typen.get(m.typId);
      if (!typ) continue;
      // Offene Fristen, deren Datum sich geändert hat oder leer ist: erledigt.
      for (const a of vorhanden.filter((x) => x.mappeId === m.id && !x.erledigt)) {
        const feld = typ.felder.find((x) => x.key === a.feldKey);
        const wert = a.feldKey ? m.werte[a.feldKey] : null;
        if (feld?.frist && wert === a.datum) continue;
        const grund = !feld?.frist ? 'keine Erinnerung mehr' : !istDatum(wert) ? 'Datum leer' : wert > (a.datum ?? '') ? `verschoben auf ${datumDe(wert)}` : `geändert auf ${datumDe(wert)}`;
        await this.repo.erledigeAufgabe(a.id, null);
        await this.notiere(m.id, null, 'aufgabe', { text: `erledigt (${grund}): ${a.text}`, aufgabe: a.id, aufgabenart: 'frist', fuer: a.empfaengerId, aufgabentext: a.text });
        erledigt++;
      }
      for (const feld of fristFelder(typ)) {
        const wert = m.werte[feld.key];
        const fr = feld.frist!;
        if (!istDatum(wert) || wert < heute || fristAb(wert, fr) > heute || schon.has(`${m.id}|${feld.key}|${wert}`)) continue;
        const text = fristText(fr, feld, wert, m.titel ?? '');
        const an = fristEmpfaenger(fr, m);
        let a: Aufgabe;
        try {
          a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId: m.id, empfaengerId: an, art: 'frist', text, feldKey: feld.key, datum: wert, erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
        } catch { continue; } // gleichzeitiger Lauf hat sie schon angelegt (eindeutiger Index)
        schon.add(`${m.id}|${feld.key}|${wert}`);
        await this.notiere(m.id, null, 'aufgabe', { text: `Frist für ${await this.name(an)}: ${text}`, aufgabe: a.id, aufgabenart: 'frist', fuer: an, aufgabentext: text });
        await this.leiteUm(a);
        angelegt++;
      }
    }
    if (angelegt || erledigt) protokoll.modul('ablage').info('Fristen abgeglichen', { angelegt, erledigt });
    return { angelegt, erledigt };
  }

  /** Offene Fristen und Erinnerungen, deren Empfänger die Mappe nicht lesen darf – Hinweis in der Werkbank. */
  async unlesbareFristen(): Promise<string[]> {
    const erg: string[] = [];
    for (const a of await this.repo.offeneAufgaben()) {
      if ((a.art === 'frist' || a.art === 'erinnerung') && a.empfaengerId && !(await this.kannLesen(a.empfaengerId, a.mappeId))) erg.push(a.id);
    }
    return erg;
  }

  /** Fällige freie Erinnerungen (#131) werden zu Aufgaben. */
  async erinnerungenFaellig(heute = heuteIn()): Promise<number> {
    let n = 0;
    for (const e of await this.repo.erinnerungen({ bis: heute })) {
      const a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: 'erinnerung', text: e.text, datum: e.datum, erstellt: '', erstelltVon: e.erstelltVon, erledigt: null, erledigtVon: null });
      await this.repo.loescheErinnerung(e.id);
      await this.notiere(e.mappeId, null, 'aufgabe', { text: `Erinnerung fällig für ${await this.name(e.empfaengerId)}: ${e.text}`, aufgabe: a.id, aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
      await this.leiteUm(a);
      n++;
    }
    return n;
  }

  /** Täglicher (bzw. stündlicher) Lauf: Fristen und fällige Erinnerungen. */
  async fristenLauf(heute = heuteIn()) {
    const f = await this.fristenAbgleichen({}, heute);
    return { ...f, erinnerungen: await this.erinnerungenFaellig(heute) };
  }

  private static erinnerungEingabe(e: unknown): { datum: string; text: string; empfaengerId?: unknown } {
    const x = (e ?? {}) as Record<string, unknown>;
    if (!istDatum(x.datum)) throw new Fachfehler(422, 'Bitte ein Datum angeben.');
    const text = typeof x.text === 'string' ? x.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new Fachfehler(422, 'Woran soll erinnert werden?');
    if (text.length > ERINNERUNG_TEXT_MAX) throw new Fachfehler(422, `Höchstens ${ERINNERUNG_TEXT_MAX} Zeichen.`);
    return { datum: x.datum, text, empfaengerId: x.empfaengerId };
  }

  /** Erinnerung an einer Mappe (#131): für mich oder einen anderen Benutzer; ist das Datum schon da, gleich als Aufgabe. */
  async legeErinnerungAn(mappeId: string, e: unknown, von: string): Promise<Erinnerung | Aufgabe> {
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : von;
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId, empfaengerId: an, datum: x.datum, text: x.text, erstellt: '', erstelltVon: von });
    await this.notiere(mappeId, von, 'aufgabe', { text: `Erinnerung für ${await this.name(an)} am ${datumDe(x.datum)}: ${x.text}`, aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return r;
  }

  /** Ändern und Löschen: Ersteller, Empfänger oder ein Administrator. */
  private async eigeneErinnerung(id: string, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const e = await this.repo.holeErinnerung(id);
    if (!e) throw new Fachfehler(404, 'Diese Erinnerung gibt es nicht (mehr) – vielleicht ist sie schon fällig und steht unter „Zu erledigen“.');
    if (e.erstelltVon !== ich.id && e.empfaengerId !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, 'Ändern kann eine Erinnerung nur, wer sie angelegt hat oder sie bekommt.');
    return e;
  }
  async erinnerungMappe(id: string) { const e = await this.repo.holeErinnerung(id); if (!e) throw new Fachfehler(404, 'Diese Erinnerung gibt es nicht (mehr).'); return e.mappeId; }

  async aendereErinnerung(id: string, e: unknown, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const alt = await this.eigeneErinnerung(id, ich);
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : alt.empfaengerId;
    const neu = (await this.repo.aendereErinnerung(id, { datum: x.datum, text: x.text, empfaengerId: an }))!;
    await this.notiere(alt.mappeId, ich.id, 'aufgabe', { text: `Erinnerung geändert: für ${await this.name(an)} am ${datumDe(x.datum)}: ${x.text}`, aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return neu;
  }

  async loescheErinnerung(id: string, ich: { id: string; rolle: string }) {
    const e = await this.eigeneErinnerung(id, ich);
    await this.repo.loescheErinnerung(id);
    await this.notiere(e.mappeId, ich.id, 'aufgabe', { text: `Erinnerung gelöscht: ${e.text}`, aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
  }

  /**
   * Sicht „Anstehend“ (#132): eigene Fristen und Erinnerungen bis heute + tage – fällige (schon im Eingang)
   * und kommende –, nur an Mappen, die man lesen darf; nach Datum.
   */
  async anstehend(z: Zugriff, tageEingabe?: unknown): Promise<{ tage: number; eintraege: Anstehend[] }> {
    const t = Math.trunc(Number(tageEingabe));
    const tage = Number.isFinite(t) && t >= 0 ? Math.min(ANSTEHEND_MAX, t) : ANSTEHEND_TAGE;
    const heute = heuteIn();
    const bis = verschiebe(heute, tage);
    const ich = z.ich.id;
    const meins = (empf: string | null) => empf === ich || (!empf && z.admin);
    const erg: Anstehend[] = [];
    // Schon fällig: offene Aufgaben der Arten Frist und Erinnerung.
    const offen = (await this.repo.offeneAufgaben({ benutzerId: ich, admin: z.admin })).filter((a) => (a.art === 'frist' || a.art === 'erinnerung') && a.datum);
    const lesbar = await this.lesbare(z, offen.map((a) => a.mappeId));
    for (const a of offen) {
      if (!lesbar.has(a.mappeId) || a.datum! > bis) continue;
      erg.push({ art: a.art as 'frist' | 'erinnerung', datum: a.datum!, ab: a.erstellt.slice(0, 10), text: a.text, mappeId: a.mappeId, mappeTitel: a.mappeTitel ?? '', typId: a.typId ?? '', faellig: true, feldKey: a.feldKey ?? null });
    }
    // Kommende Fristen: Datumsfelder mit Erinnerung, die noch keine Aufgabe sind.
    for (const typ of [...z.typen.values()].filter((x) => fristFelder(x).length)) {
      const kandidaten = (await this.repo.listeMappen(typ.id)).filter((m) => fristFelder(typ).some((f) => {
        const w = m.werte[f.key];
        return istDatum(w) && w >= heute && w <= bis && meins(fristEmpfaenger(f.frist!, m));
      }));
      if (!kandidaten.length) continue;
      const ok = await this.lesbare(z, kandidaten.map((m) => m.id));
      const schon = new Set((await this.repo.fristAufgaben(kandidaten.map((m) => m.id))).map((a) => `${a.mappeId}|${a.feldKey}|${a.datum}`));
      for (const m of kandidaten) {
        if (!ok.has(m.id)) continue;
        for (const f of fristFelder(typ)) {
          const w = m.werte[f.key];
          if (!istDatum(w) || w < heute || w > bis || !meins(fristEmpfaenger(f.frist!, m)) || schon.has(`${m.id}|${f.key}|${w}`)) continue;
          erg.push({ art: 'frist', datum: w, ab: fristAb(w, f.frist!), text: fristText(f.frist!, f, w, m.titel ?? ''), mappeId: m.id, mappeTitel: m.titel ?? '', typId: m.typId, faellig: false, feldKey: f.key });
        }
      }
    }
    // Kommende freie Erinnerungen.
    const erinnerungen = await this.repo.erinnerungen({ empfaengerId: ich, bis });
    const ok = await this.lesbare(z, erinnerungen.map((e) => e.mappeId));
    for (const e of erinnerungen) {
      if (!ok.has(e.mappeId)) continue;
      erg.push({ art: 'erinnerung', datum: e.datum, ab: e.datum, text: e.text, mappeId: e.mappeId, mappeTitel: e.mappeTitel ?? '', typId: e.typId ?? '', faellig: false, erinnerungId: e.id });
    }
    erg.sort((a, b) => a.datum.localeCompare(b.datum) || a.mappeTitel.localeCompare(b.mappeTitel, 'de'));
    return { tage, eintraege: erg };
  }

  /** Wiederkehrende Frist (#130): Vorschlag für den nächsten Termin, solange das Datum noch das der Frist ist. */
  private async folgeterminVon(a: Aufgabe): Promise<string | null> {
    if (a.art !== 'frist' || !a.feldKey || !a.datum) return null;
    const m = await this.repo.holeMappe(a.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const w = typ?.felder.find((f) => f.key === a.feldKey)?.frist?.wiederholung;
    return w && m && m.werte[a.feldKey] === a.datum ? naechsterTermin(a.datum, w) : null;
  }

  /** „Datum auf … setzen“ (#130): nie automatisch, nur auf Klick – mit Eintrag im Protokoll wie jede Änderung. */
  async setzeFolgetermin(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.repo.holeAufgabe(aufgabeId);
    if (!a) throw new Fachfehler(404, 'Diese Aufgabe gibt es nicht.');
    const naechster = await this.folgeterminVon(a);
    if (!naechster) throw new Fachfehler(409, 'Das Datum hat sich schon geändert – es gibt keinen Vorschlag mehr.');
    return this.aendereMappe(a.mappeId, { werte: { [a.feldKey!]: naechster } }, ich.id, z);
  }

  /* ---------- Notizen (#55) ---------- */

  private static notiztext(e: unknown): string {
    const t = typeof e === 'string' ? e.replace(/\r\n?/g, '\n').trim() : '';
    if (!t) throw new Fachfehler(422, 'Die Notiz ist leer.');
    if (t.length > NOTIZ_MAX) throw new Fachfehler(422, `Eine Notiz darf höchstens ${NOTIZ_MAX.toLocaleString('de-DE')} Zeichen haben.`);
    return t;
  }
  private static vorschau(t: string) { const x = alsText(t); return x.length > 80 ? `${x.slice(0, 77)} …` : x; }

  async notizen(mappeId: string): Promise<Notiz[]> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    return this.repo.notizen(mappeId);
  }

  /* ---------- E-Mail aus der Mappe (#58) ---------- */

  /**
   * Verschickt eine E-Mail mit ausgewählten Dokumenten der Mappe. Absender ist das DMS,
   * „Antworten an“ der Benutzer. Danach gibt es eine Post-Mappe (#192: Kanal E-Mail, ausgehend,
   * erledigt, zugeordnet zur Mappe) mit den Anhängen (dieselbe Datei, kein zweiter Speicherplatz)
   * und einen Eintrag im Protokoll.
   */
  /** Empfänger, Betreff und Nachricht einer E-Mail prüfen (#58, #151). */
  private static emailKopf(e: Record<string, unknown>) {
    const an = [...new Set(String(e.an ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
    const betreff = String(e.betreff ?? '').replace(/[\r\n]+/g, ' ').trim();
    const nachricht = String(e.nachricht ?? '');
    const fehler: Record<string, string> = {};
    if (!an.length) fehler.an = 'Mindestens einen Empfänger angeben.';
    else if (an.length > EMAIL_MAX_EMPFAENGER) fehler.an = `Höchstens ${EMAIL_MAX_EMPFAENGER} Empfänger.`;
    else if (an.some((x) => !istEmail(x))) fehler.an = `Keine gültige Adresse: ${an.filter((x) => !istEmail(x)).join(', ')}`;
    if (!betreff) fehler.betreff = 'Der Betreff fehlt.';
    else if (betreff.length > 250) fehler.betreff = 'Der Betreff ist zu lang.';
    if (nachricht.length > NOTIZ_MAX) fehler.nachricht = 'Die Nachricht ist zu lang.';
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    return { an, betreff, nachricht };
  }

  /**
   * Mehrere Mappen per E-Mail (#151): eine E-Mail an alle Empfänger. Anhänge: je Mappe ihre Angaben als
   * PDF („Titel.pdf“, wenn `angaben`) und die gewählten Dokumente (`dokumente`: „alle“ oder Ids).
   * Rechte: Lesen und Versenden (Recht E einer Ansicht, Regel A wie beim Export) je Mappe – prüft der Aufrufer
   * über `z`. Danach eine Post (Kanal E-Mail, ausgehend, erledigt), die auf alle Mappen verweist, und je
   * Mappe ein Eintrag in der Historie.
   */
  async versendeMappen(eingabe: unknown, ich: { id: string; name: string; email: string; rolle: string }, z: Zugriff, mailer: Mailer | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = [...new Set((Array.isArray(e.ids) ? e.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, 'Keine Mappen ausgewählt.');
    if (ids.length > EMAIL_MAX_MAPPEN) throw new Fachfehler(422, `Höchstens ${EMAIL_MAX_MAPPEN} Mappen in einer E-Mail.`);
    const { an, betreff, nachricht } = Dienst.emailKopf(e);
    // Rechte: jede Mappe lesbar und versendbar – sonst nichts verschicken (keine stillen Lücken in der Mail).
    const lesbar = await this.lesbare(z, ids);
    const versendbar = await this.exportierbar(ich, z, ids.filter((id) => lesbar.has(id)));
    const nicht = ids.filter((id) => !versendbar.has(id));
    if (nicht.length) throw new Fachfehler(403, `${nicht.length === 1 ? 'Eine Mappe darfst' : `${nicht.length} Mappen darfst`} du nicht versenden. Versenden ist wie Exportieren nur aus Ansichten erlaubt, für die du das Recht dazu hast.`, { nicht });
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse).');
    const mappen = (await this.repo.holeMappen(ids)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    if (mappen.length !== ids.length) throw new Fachfehler(404, 'Eine ausgewählte Mappe gibt es nicht (mehr).');
    const angaben = e.angaben !== false;
    const gewaehlt = e.dokumente === 'alle' ? null : new Set((Array.isArray(e.dokumente) ? e.dokumente : []).map(String));
    const lies = async (d: Dokument) => { const x = await this.dateien.lies(d.sha256); return Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]); };
    const verweise = mappen.flatMap((m) => { const t = z.typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    const quelle = { typen: z.typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
    const je: Array<{ m: Mappe; dokumente: Dokument[]; pdf: Buffer | null; plan: GeltenderStempel | null; ausgaben: Ausgabe[] | null }> = [];
    const dokJe = await this.dokumenteJeMappe(mappen.map((m) => m.id));
    // Stempel (#394): je Mappe, weil die Pflicht am Mappentyp hängt; {empfänger} ohne Angabe = die Adressen.
    const wunsch = wunschAus(e.stempel);
    const stempelDaten = await this.stempelDaten();
    // Verkleinert senden (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(e.verkleinern);
    for (const m of mappen) {
      const docs = (dokJe.get(m.id) ?? []).filter((d) => !gewaehlt || gewaehlt.has(d.id));
      const pdf = angaben ? await mappenPdf(m.titel || 'Ohne Titel', [{ mappe: m, typ: z.typen.get(m.typId), dokumente: [], inhalt: lies }], quelle, null) : null;
      const plan = docs.length ? await this.stempelPlan(m.typId, wunsch, an.join(', '), stempelDaten) : null;
      const ausgaben = plan || (klein && docs.length) ? await Promise.all(docs.map(async (d) => fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await lies(d) }, { stempel: plan, verkleinern: klein },
        { benutzer: ich.name, mappe: m.titel || 'Ohne Titel', archivnummer: d.archivnummer }))) : null;
      je.push({ m, dokumente: docs, pdf, plan, ausgaben });
    }
    if (gewaehlt) {
      const bekannt = new Set(je.flatMap((x) => x.dokumente.map((d) => d.id)));
      if ([...gewaehlt].some((id) => !bekannt.has(id))) throw new Fachfehler(422, 'Ein ausgewähltes Dokument gehört nicht (mehr) zu diesen Mappen.');
    }
    const groesse = je.reduce((a, x) => a + (x.pdf?.length ?? 0) + (x.ausgaben ? x.ausgaben.reduce((b, y) => b + y.inhalt.length, 0) : x.dokumente.reduce((b, d) => b + d.groesse, 0)), 0);
    if (groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, `Die Anhänge sind zusammen größer als ${Math.round(EMAIL_MAX_ANHAENGE / 1e6)} MB. Bitte weniger Mappen oder Dokumente wählen.`);
    // Dateinamen eindeutig: „Titel.pdf“ der Angaben, dann die Dokumente (gestempelte Bilder heißen .pdf).
    const namen = eindeutig(je.flatMap((x) => [...(x.pdf ? [`${sichererName(x.m.titel || 'Ohne Titel')}.pdf`] : []), ...x.dokumente.map((d, j) => sichererName(x.ausgaben?.[j].name ?? d.name, 120))]));
    let i = 0;
    const anhaenge: Array<{ name: string; mime: string; inhalt: Buffer | Readable }> = [];
    for (const x of je) {
      if (x.pdf) anhaenge.push({ name: namen[i++], mime: 'application/pdf', inhalt: x.pdf });
      for (const [j, d] of x.dokumente.entries()) {
        const a = x.ausgaben?.[j];
        anhaenge.push(a ? { name: namen[i++], mime: a.mime, inhalt: a.inhalt } : { name: namen[i++], mime: d.mime, inhalt: await this.dateien.lies(d.sha256) });
      }
    }
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, `Die E-Mail wurde nicht verschickt: ${(x as Error).message}`);
    }
    const { post: typ } = await this.sichereSystem();
    const id = randomUUID();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an: an.join(', '), absender: antwortAn.replace(/"/g, ''), datum: heuteIn(), bezug: ids, ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    // In der Post liegt, was verschickt wurde: die Dokumente (gleiche Datei) und die PDFs der Angaben.
    const reg = typ.register.find((r) => r.art === 'dokumente');
    i = 0;
    if (reg) for (const x of je) {
      if (x.pdf) {
        const sha256 = createHash('sha256').update(x.pdf).digest('hex');
        await this.dateien.schreibe(sha256, x.pdf);
        const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: id, registerKey: reg.key, name: namen[i++], mime: 'application/pdf', groesse: x.pdf.length, sha256, anzeigbar: true, erstellt: new Date().toISOString(), erstelltVon: ich.id, herkunft: 'hochgeladen' });
        this.vorschau?.einreihen([neu]);
      }
      for (const [j, d] of x.dokumente.entries()) await this.legeVersandkopieAn(d, x.ausgaben?.[j], id, reg.key, ich.id, namen[i++]);
    }
    for (const x of je) {
      const n = x.dokumente.length + (x.pdf ? 1 : 0);
      const stempeltext = x.ausgaben?.find((y) => y.stempeltext)?.stempeltext;
      const mitStempel = x.ausgaben?.some((y) => y.gestempelt);
      const was = weitergabeWas(x.ausgaben);
      await this.notiere(x.m.id, ich.id, 'email', {
        text: `„${betreff}“ an ${an.join(', ')} mit ${mappen.length} Mappen${n ? ` (von dieser ${n} ${n === 1 ? 'Anhang' : 'Anhänge'})` : ''}${was ? `, ${was}` : ''}`, email: id,
        an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), mappen: mappen.length,
        anhaenge: [...(x.pdf ? [{ name: `${sichererName(x.m.titel || 'Ohne Titel')}.pdf`, groesse: x.pdf.length }] : []), ...x.dokumente.map((d, j) => ({ name: x.ausgaben?.[j].name ?? d.name, groesse: x.ausgaben?.[j].inhalt.length ?? d.groesse }))],
        ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: x.plan?.empfaenger ?? null } : {}),
      });
    }
    protokoll.modul('ablage').info('E-Mail mit mehreren Mappen verschickt', { mappen: mappen.length, empfaenger: an.length, anhaenge: anhaenge.length, bytes: groesse });
    return { id, typId: typ.id, mappen: mappen.length, anhaenge: anhaenge.length };
  }

  /** Kopie eines verschickten Dokuments in der Post: gestempelt als eigene Datei (#394), sonst dieselbe Datei. */
  private async legeVersandkopieAn(d: Dokument, a: Ausgabe | undefined, postId: string, registerKey: string, von: string, name?: string) {
    const jetzt = new Date().toISOString();
    if (!a || a.unveraendert) { await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: postId, registerKey, name: name ?? d.name, erstellt: jetzt, erstelltVon: von }); return; }
    const sha256 = createHash('sha256').update(a.inhalt).digest('hex');
    await this.dateien.schreibe(sha256, a.inhalt);
    const neu = await this.repo.legeDokumentAn({ id: randomUUID(), mappeId: postId, registerKey, name: name ?? a.name, mime: a.mime, groesse: a.inhalt.length, sha256, anzeigbar: true, erstellt: jetzt, erstelltVon: von, herkunft: 'hochgeladen' });
    this.vorschau?.einreihen([neu]);
  }

  async versendeMappe(mappeId: string, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse).');
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const { an, betreff, nachricht } = Dienst.emailKopf(e);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    const alle = await this.repo.listeDokumente(mappeId);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, 'Ein ausgewähltes Dokument gehört nicht (mehr) zu dieser Mappe.');
    // Stempel (#394): gewünscht oder vom Mappentyp verlangt; {empfänger} sind ohne Angabe die Adressen.
    const plan = dokumente.length ? await this.stempelPlan(m.typId, wunschAus(e.stempel), an.join(', ')) : null;
    const klein = stufeAus(e.verkleinern);
    const ausgaben = plan || (klein && dokumente.length) ? await Promise.all(dokumente.map(async (d) => fuerAusgabe({ name: d!.name, mime: d!.mime, inhalt: await this.liesGanz(d!.sha256) }, { stempel: plan, verkleinern: klein },
      { benutzer: ich.name, mappe: m.titel || 'Ohne Titel', archivnummer: d!.archivnummer }))) : null;
    const groesse = ausgaben ? ausgaben.reduce((a, x) => a + x.inhalt.length, 0) : dokumente.reduce((a, d) => a + d!.groesse, 0);
    if (groesse > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, `Die Anhänge sind zusammen größer als ${Math.round(EMAIL_MAX_ANHAENGE / 1e6)} MB.`);
    const anhaenge = ausgaben ? ausgaben.map((x) => ({ name: x.name, mime: x.mime, inhalt: x.inhalt as Buffer | Readable }))
      : await Promise.all(dokumente.map(async (d) => ({ name: d!.name, mime: d!.mime, inhalt: await this.dateien.lies(d!.sha256) })));
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge });
    } catch (x) {
      throw new Fachfehler(502, `Die E-Mail wurde nicht verschickt: ${(x as Error).message}`);
    }
    const { post: typ } = await this.sichereSystem();
    const id = randomUUID();
    const datum = heuteIn();
    await this.schreibeSystemMappe(typ, id, {
      betreff, an: an.join(', '), absender: antwortAn.replace(/"/g, ''), datum, bezug: [mappeId], ...(nachricht.trim() ? { nachricht } : {}),
      kanal: POST_KANAL.email, richtung: POST_RICHTUNG.ausgehend, stand: POST_STAND.erledigt,
    }, ich.id);
    const reg = typ.register.find((r) => r.art === 'dokumente');
    // In der Post liegt, was verschickt wurde: gestempelt die Kopie, sonst dieselbe Datei.
    if (reg) for (const [i, d] of dokumente.entries()) await this.legeVersandkopieAn(d!, ausgaben?.[i], id, reg.key, ich.id);
    const stempeltext = ausgaben?.find((x) => x.stempeltext)?.stempeltext;
    const mitStempel = ausgaben?.some((x) => x.gestempelt);
    const was = weitergabeWas(ausgaben);
    await this.notiere(mappeId, ich.id, 'email', { text: `„${betreff}“ an ${an.join(', ')}${dokumente.length ? ` mit ${dokumente.length} ${dokumente.length === 1 ? 'Anhang' : 'Anhängen'}` : ''}${was ? `, ${was}` : ''}`, email: id,
      an, betreff, nachricht: nachricht.slice(0, NOTIZ_MAX), anhaenge: ausgaben ? ausgaben.map((x) => ({ name: x.name, groesse: x.inhalt.length })) : dokumente.map((d) => ({ name: d!.name, groesse: d!.groesse })),
      ...(mitStempel ? { stempel: stempeltext ?? null, stempelAn: plan?.empfaenger ?? null } : {}) });
    protokoll.modul('ablage').info('E-Mail aus Mappe verschickt', { mappe: mappeId, empfaenger: an.length, anhaenge: dokumente.length, bytes: groesse });
    return { id, typId: typ.id };
  }

  async legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const t = Dienst.notiztext(text);
    const n = await this.repo.legeNotizAn({ id: randomUUID(), mappeId, text: t, erstellt: '', erstelltVon: von, geaendert: '', geaendertVon: von });
    await this.notiere(mappeId, von, 'notiz', { text: `angelegt: ${Dienst.vorschau(t)}`, voll: t });
    await this.erwaehnungenAbgleichen(mappeId, { key: `notiz:${n.id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(t) }, '', t, von);
    return n;
  }

  /** Bearbeiten und Löschen darf jeder (Abstimmung zu #55); die Historie hält fest, wer es war. */
  async aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, 'Diese Notiz gibt es nicht.');
    const t = Dienst.notiztext(text);
    if (t === alt.text) return alt;
    const n = await this.repo.aendereNotiz(id, t, von);
    await this.notiere(alt.mappeId, von, 'notiz', { text: `geändert: ${Dienst.vorschau(t)}`, vorher: Dienst.vorschau(alt.text), alt: alt.text, neu: t });
    await this.erwaehnungenAbgleichen(alt.mappeId, { key: `notiz:${id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(t) }, alt.text, t, von);
    return n;
  }

  async loescheNotiz(id: string, von: string | null) {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, 'Diese Notiz gibt es nicht.');
    await this.repo.loescheNotiz(id);
    await this.notiere(alt.mappeId, von, 'notiz', { text: `gelöscht: ${Dienst.vorschau(alt.text)}`, voll: alt.text });
  }

  /* ---------- Änderungshistorie (#57) ---------- */

  /** Ein Eintrag in die Historie einer Mappe. */
  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) {
    return this.repo.historieSchreibe([{ mappeId, benutzerId, art, daten }]);
  }

  /** Was sich zwischen zwei Ständen geändert hat – lesbar, wie es zu diesem Zeitpunkt aussah. */
  private async aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> {
    const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const felder = typ.felder.filter((f) => !gleich(alt[f.key], neu[f.key]) && !(istLeer(alt[f.key]) && istLeer(neu[f.key])));
    if (!felder.length) return [];
    const ids = felder.filter((f) => f.typ === 'referenz').flatMap((f) => [alt[f.key], neu[f.key]].flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))).map(String).filter(istUuid);
    const titel = await this.repo.titelVon(ids);
    const lesbar = (f: Feld, v: Werte[string] | undefined) => {
      const t = formatiere(f, v, (id) => titel.get(id) || 'Ohne Titel');
      return t.length > 500 ? `${t.slice(0, 497)} …` : t;
    };
    return felder.map((f) => (f.typ === 'passwort'
      ? { feld: f.key, label: f.label, geheim: true }
      : { feld: f.key, label: f.label, alt: lesbar(f, alt[f.key]), neu: lesbar(f, neu[f.key]) }));
  }

  /** Historie einer Mappe (auch im Papierkorb). */
  async historie(mappeId: string): Promise<Historieneintrag[]> {
    if (!(await this.repo.holeMappe(mappeId)) && !(await this.repo.holeAusPapierkorb(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    return this.repo.historie(mappeId);
  }

  /** Wie lange die Historie endgültig gelöschter Mappen bleibt (Tage). */
  async historieTage(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('historie')) as { tage?: number } | null) : null;
    return typeof e?.tage === 'number' ? e.tage : HISTORIE_STANDARD_TAGE;
  }

  async setzeHistorieTage(eingabe: unknown): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 36500) throw new Fachfehler(422, 'Bitte eine ganze Zahl von 0 bis 36500 Tagen angeben.');
    await this.einstellungen.schreibe('historie', { tage });
    protokoll.modul('werkbank').info('Aufbewahrung der Historie gelöschter Mappen geändert', { tage });
    return tage;
  }

  listeTypen() { return this.repo.listeTypen(); }

  /** Mappentypen für einen Benutzer: Administratoren mit Regeln, alle anderen ohne – dafür „darf anlegen“ (#126). */
  async typenFuer(z: Zugriff) {
    const typen = await this.mitStempel([...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
    if (z.admin) return typen;
    return typen.map(({ berechtigungen, ...t }) => ({ ...t, berechtigungen: null, darfAnlegen: rechteUebersicht({ ...t, berechtigungen }, z.wer, z.a).C !== 'nie' }));
  }

  /** Profil (#126): je Mappentyp, welche Rechte man hat – „immer“, „nie“ oder „je nach Mappe“. */
  async rechteUebersicht(z: Zugriff) {
    return [...z.typen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((t) => ({
      typId: t.id, name: t.name,
      rechte: z.admin ? Object.fromEntries((['C', 'R', 'U', 'D', 'P'] as Recht[]).map((k) => [k, (k === 'C' && systemSperre(t).C) || (k === 'D' && systemSperre(t).D) ? 'nie' : 'immer'])) : rechteUebersicht(t, z.wer, z.a),
    }));
  }

  private async pruefeTyp(d: MappentypDaten, eigeneId: string) {
    if (d.archiv?.stichtag && d.felder.find((f) => f.key === d.archiv!.stichtag)?.typ !== 'datum') {
      throw new Fachfehler(422, 'Archivmodus: Der Stichtag muss ein Datumsfeld dieses Mappentyps sein.', { allgemein: ['Archivmodus: Der Stichtag muss ein Datumsfeld dieses Mappentyps sein.'], felder: {} });
    }
    const alle = await this.repo.listeTypen();
    // Quellen von Verknüpfungsregistern, deren Feld es nicht mehr gibt, still entfernen.
    for (const r of d.register) {
      if (r.art !== 'verknuepfungen') continue;
      r.quellen = (r.quellen ?? []).filter((q) => {
        const felder = q.typId === eigeneId ? d.felder : alle.find((t) => t.id === q.typId)?.felder;
        const f = felder?.find((x) => x.key === q.feldKey);
        return f?.typ === 'referenz' && (f.zielTyp === eigeneId || f.zielTyp === '*');
      });
    }
    // Fristen (#129): Empfängerfeld nur, wenn es ein einfaches Benutzerfeld dieses Typs ist.
    const benutzerTyp = alle.find((t) => t.system === 'benutzer')?.id;
    const taugt = new Set(empfaengerFelder(d, benutzerTyp).map((f) => f.key));
    for (const f of d.felder) if (f.frist?.empfaengerFeld && !taugt.has(f.frist.empfaengerFeld)) f.frist.empfaengerFeld = null;
    const p = pruefeMappentyp(d, {
      eigeneId,
      namenAndererTypen: alle.filter((t) => t.id !== eigeneId).map((t) => t.name),
      schluesselAndererTypen: alle.filter((t) => t.id !== eigeneId && t.schluessel).map((t) => t.schluessel!),
      existiertTyp: (id) => alle.some((t) => t.id === id),
      felderVon: (id) => alle.find((t) => t.id === id)?.felder,
      nummernkreise: (await this.repo.listeNummernkreise()).map((k) => k.schluessel),
      auswahlProbleme: (bed, felder, eigene) => auswahlProbleme(bed, { felder }, eigene),
    });
    if (!istOk(p)) throw new Fachfehler(422, 'Der Mappentyp ist so nicht gültig.', p);
  }

  /** Mappentyp anlegen bzw. ändern; die Stempel-Einstellung (#394) liegt daneben in den Einstellungen. */
  async legeTypAn(eingabe: unknown): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.legeTypAnIntern(e)); }
  async aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> { return this.mitStempelEingabe(eingabe, (e) => this.aendereTypIntern(id, e)); }
  private async mitStempelEingabe(eingabe: unknown, f: (e: unknown) => Promise<Mappentyp>): Promise<Mappentyp> {
    const hat = !!eingabe && typeof eingabe === 'object' && 'stempel' in eingabe;
    const st = hat ? await this.pruefeStempelTyp((eingabe as { stempel: unknown }).stempel) : undefined;
    const t = await f(eingabe);
    if (hat) await this.setzeStempelTyp(t.id, st ?? null);
    return (await this.mitStempel([t]))[0];
  }

  private async legeTypAnIntern(eingabe: unknown): Promise<Mappentyp> {
    const roh = (eingabe ?? {}) as { id?: unknown };
    // Die Oberfläche darf die Id vorgeben, damit ein neuer Typ auf sich selbst verweisen kann.
    const id = istUuid(roh.id) && !(await this.repo.holeTyp(roh.id)) ? roh.id : randomUUID();
    const d = bereinigeTyp(eingabe);
    // Schlüssel (#145): ohne Angabe aus dem Namen, eindeutig.
    if (!d.schluessel) d.schluessel = freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    const rechte = await this.berechtigungenAusEingabe({ ...d, id, erstellt: '', geaendert: '', berechtigungen: null }, eingabe);
    let typ = await this.repo.legeTypAn(id, d);
    if (rechte) { typ = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw); Dienst.protokolliereBerechtigungen(typ, 0); }
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    if ((roh as { sichtAnlegen?: unknown }).sichtAnlegen !== false) await this.sichtFuerTyp(typ);
    return typ;
  }

  private async aendereTypIntern(id: string, eingabe: unknown): Promise<Mappentyp> {
    const alt = await this.repo.holeTyp(id);
    if (!alt) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    let d = bereinigeTyp(eingabe);
    if (alt.system) d = await this.mitSystemfeldern(d, alt.system);
    // Der Schlüssel ist fest (#145); fehlt er noch, gilt der eingegebene bzw. einer aus dem Namen.
    d.schluessel = alt.schluessel ?? d.schluessel ?? freierSchluessel(d.name || 'mappentyp', (await this.repo.listeTypen()).filter((t) => t.id !== id).map((t) => t.schluessel ?? ''));
    await this.pruefeTyp(d, id);
    // Berechtigungen (#142) gegen die neuen Felder prüfen, bevor etwas gespeichert ist.
    const rechte = await this.berechtigungenAusEingabe({ ...alt, ...d }, eingabe);
    const bleiben = new Set(d.register.filter((r) => r.art === 'dokumente').map((r) => r.key));
    for (const [key, n] of await this.repo.dokumenteJeRegister(id)) {
      if (bleiben.has(key)) continue;
      const name = alt.register.find((r) => r.key === key)?.name ?? key;
      throw new Fachfehler(409, `Im Register „${name}“ liegen noch ${n} Dokument${n === 1 ? '' : 'e'}. Entferne oder verschiebe sie zuerst.`);
    }
    const typ = await this.repo.aendereTyp(id, d);
    // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
    const eigene = (await this.repo.listeSichten()).find((x) => x.id === id);
    if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(id, { ...eigene, name: typ.name });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    await this.aktualisiereTitel((await this.repo.listeMappen(id)).map((m) => m.id));
    await this.pruefePassung(id);
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    await this.fristenAbgleichen({ typId: id });
    if (rechte) {
      const mit = await this.repo.setzeBerechtigungen(id, istOffen(rechte.rw) ? null : rechte.rw);
      Dienst.protokolliereBerechtigungen(mit, rechte.niemand);
      return mit;
    }
    return typ;
  }

  /**
   * Systemtypen: Systemfelder müssen bleiben und behalten ihre feste Definition;
   * Bezeichnung und Hilfetext darf der Administrator ändern. Benutzer-Mappen entstehen
   * und verschwinden nur über die Benutzerverwaltung.
   */
  private async mitSystemfeldern(d: MappentypDaten, system: Systemtyp): Promise<MappentypDaten> {
    const typen = await this.repo.listeTypen();
    const soll = systemfelder(system, typen.find((t) => t.system === 'rolle')?.id ?? '', typen.find((t) => t.system === 'benutzer')?.id ?? '');
    const fehlen = soll.filter((s) => !d.felder.some((f) => f.key === s.key));
    if (fehlen.length) throw new Fachfehler(422, `Systemfelder lassen sich nicht entfernen: ${fehlen.map((f) => f.label).join(', ')}.`);
    const felder = d.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      return s ? { ...s, label: f.label || s.label, hilfe: f.hilfe || s.hilfe } : f;
    });
    return { ...d, felder, ...(system === 'benutzer' ? { erstellenErlaubt: false, loeschenErlaubt: false } : system === 'post' ? { erstellenErlaubt: false } : {}) };
  }

  async loescheTyp(id: string): Promise<void> {
    const t = await this.repo.holeTyp(id);
    if (!t) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    if (t.system) throw new Fachfehler(409, `„${t.name}“ ist ein Systemmappentyp. Er lässt sich erweitern, aber nicht löschen.`);
    if (id === (await this.ablageortId())) throw new Fachfehler(409, `„${t.name}“ gehört zum Standard des DMS (Ablageorte für Originale). Er lässt sich erweitern und umbenennen, aber nicht löschen.`);
    const gruende: string[] = [];
    const n = await this.repo.zaehleMappen(id);
    if (n) gruende.push(`${n} ${n === 1 ? 'Mappe gehört' : 'Mappen gehören'} zu diesem Typ.`);
    const imKorb = (await this.repo.papierkorb({ typId: id })).length;
    if (imKorb) gruende.push(`${imKorb} ${imKorb === 1 ? 'Mappe' : 'Mappen'} dieses Typs ${imKorb === 1 ? 'liegt' : 'liegen'} im Papierkorb. Leere ihn oder stelle sie wieder her.`);
    for (const t of await this.repo.listeTypen()) {
      if (t.id === id) continue;
      for (const f of t.felder) if (f.typ === 'referenz' && f.zielTyp === id) gruende.push(`Das Feld ${t.name} › ${f.label} verweist auf diesen Typ.`);
    }
    if (gruende.length) throw new Fachfehler(409, 'Dieser Mappentyp kann noch nicht gelöscht werden.', { gruende });
    await this.repo.loescheTyp(id);
    // Aus den Sichten entfernen; Sichten, die nur diesen Typ hatten und keine Kinder, verschwinden mit.
    const alle = await this.repo.listeSichten();
    for (const x of alle.filter((v) => v.typen.includes(id))) {
      const typen = x.typen.filter((t) => t !== id);
      if (!typen.length && !kinderVon(alle, x.id).length) await this.repo.loescheSicht(x.id);
      else await this.repo.aendereSicht(x.id, { ...x, typen });
    }
  }

  listeMappen(typId?: string) { return this.repo.listeMappen(typId); }
  /** Schlank für viele Mappen (Demo-Daten, #248). */
  mappenKurz() { return this.repo.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.repo.feldwerte(typId, key); }

  /**
   * Verweisende Mappen eines Typs über ein Feld, vollständig (für die Tabelle im
   * Verknüpfungsregister, #75): höchstens 1000, nach Titel sortiert.
   */
  async verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) {
    await this.pruefeRecht(z, id, 'R');
    const rv = (await this.repo.rueckverweise(id)).filter((r) => r.quelleTypId === typId && r.feldKey === feldKey);
    const sichtbar = await this.lesbare(z, rv.map((r) => r.quelleId));
    const ids = [...new Set(rv.map((r) => r.quelleId))].filter((x) => sichtbar.has(x));
    const mappen = (await this.repo.holeMappen(ids.slice(0, 1000))).sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
    const typ = await this.repo.holeTyp(typId);
    const ziele = typ ? mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)) : [];
    return { gesamt: ids.length, mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)) };
  }

  async holeMappe(id: string, z?: Zugriff) {
    const mappe = await this.repo.holeMappe(id);
    if (!mappe) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    // Berechtigungen (#124): ohne Lesen nur die eigenen offenen Aufgaben – zum Erledigen oder Weitergeben.
    const rechte = z ? await this.rechteAn(z, mappe) : null;
    if (z && rechte && !rechte.R) {
      const meine = (await this.repo.aufgabenVon(id)).filter((x) => !x.erledigt && x.empfaengerId === z.ich.id);
      throw new Fachfehler(404, 'Diese Mappe gibt es nicht oder du darfst sie nicht sehen.', { verborgen: true, aufgaben: meine });
    }
    const typ = await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    const alleRueck = await this.repo.rueckverweise(id);
    const sichtbar = await this.lesbare(z, alleRueck.map((r) => r.quelleId));
    const rueckverweise = alleRueck.filter((r) => sichtbar.has(r.quelleId));
    const p = await this.loeschPruefung(mappe, typ, alleRueck);
    // Verweisende Mappen, die man nicht sehen darf: nur ihre Anzahl (#126).
    const fremd = p.fremd.map((r) => (sichtbar.has(r.quelleId) ? r : { ...r, titel: NICHT_SICHTBAR, verborgen: true }));
    return {
      mappe,
      rueckverweise,
      /** Wirksame Rechte des Benutzers an dieser Mappe (#126). */
      rechte: rechte ?? { C: true, R: true, U: true, D: true, P: true },
      /** Ob „Mappe löschen“ geht, sonst warum nicht (#79). */
      loeschbar: p.ok ? { ok: true } : { ok: false, grund: p.grund, rueckverweise: fremd },
      dokumente: await this.repo.listeDokumente(id),
      /** Notizen an der Mappe (#55). */
      notizen: await this.repo.notizen(id),
      /** Aufgaben an der Mappe, offene zuerst (#54). */
      aufgaben: await this.repo.aufgabenVon(id),
      /** Noch nicht fällige Erinnerungen (#131). */
      erinnerungen: await this.repo.erinnerungen({ mappeId: id }),
      /** Titel und Typ der Mappen, auf die diese verweist (nicht lesbare ohne Titel). */
      bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)),
      /** Verweise, die nicht (mehr) zum Auswahlfilter ihres Felds passen (#172). */
      unpassend: await this.unpassendeVerweise(typ, mappe.werte, z?.ich.id ?? ''),
      /** Archivmodus (#212): aufbewahren bis (JJJJ-12-31) oder null. */
      aufbewahrenBis: aufbewahrenBis(typ?.archiv, mappe),
      /** Auskunft nach Art. 15 DSGVO (#396): Administratoren, Mappentyp „betrifft eine Person“. */
      ...(z?.admin && (await this.datenschutz()).typen[mappe.typId]?.person ? { auskunft: true } : {}),
    };
  }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /**
   * Eine Seite einer Sicht: „eingang“, eine verwaltete Sicht (#38) oder – für Links auf Mappen,
   * deren Typ keine eigene Sicht hat – eine Typ-Id. Mit den Bezügen für die Anzeige.
   */
  async seite(ich: { id: string; rolle: string }, q: { sicht?: string; link?: unknown; eigene?: unknown; von?: unknown; anzahl?: unknown; suche?: unknown; sortierung?: unknown; absteigend?: unknown; volltext?: unknown; notizen?: unknown }, z?: Zugriff, grenze = 500) {
    // Berechtigungen (#124): nur lesbare Mappen; der Eingang zeigt Aufgaben auch zu nicht lesbaren – ohne Inhalt.
    const lesen = z?.lesen ?? null;
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(grenze, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    const suche = text(q.suche).slice(0, 200) || undefined;
    // Auch im Volltext der Dokumente (#45) und in Notizen (#55) suchen.
    const volltext = q.volltext === true || q.volltext === 'true' || undefined;
    const notizen = q.notizen === true || q.notizen === 'true' || undefined;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const sichten = await this.repo.listeSichten();
    // „typ:<id>“: alle Mappen eines Typs, ohne Bedingungen einer Sicht (z. B. Auswahl eines Verweises).
    const nurTyp = String(q.sicht ?? '').startsWith('typ:') ? String(q.sicht).slice(4) : null;
    // „feld:<typId>:<feldKey>“ (#172): Auswahl für ein Referenzfeld – Zieltyp mit dem Auswahlfilter des Felds.
    const auswahl = String(q.sicht ?? '').startsWith('feld:') ? (() => {
      const [, typId, key] = String(q.sicht).split(':');
      const f = typen.get(typId)?.felder.find((x) => x.key === key && x.typ === 'referenz');
      const ziel = f ? typen.get(f.zielTyp ?? '') : undefined;
      if (!f || !ziel) throw new Fachfehler(404, 'Dieses Verweisfeld gibt es nicht.');
      // Werte der Mappe, die gerade ausgefüllt wird (#173).
      let eigene: Werte = {};
      try { const w = JSON.parse(text(q.eigene).slice(0, 8000) || '{}'); if (w && typeof w === 'object' && !Array.isArray(w)) eigene = w; } catch { /* ohne */ }
      return { f, ziel, eigene };
    })() : null;
    // Verborgene Sichten (#148) gibt es für den Benutzer nicht; ihre Mappen fehlen auch in der Elternsicht.
    const verborgen = this.verborgeneSichten(sichten, z);
    const sicht = nurTyp ? undefined : sichten.find((x) => x.id === q.sicht && !verborgen.has(x.id));
    // Sprechender Link (#98): „link“ mit den Parametern des Links in `link`.
    const gelesen = q.sicht === 'link' ? liesDirektlink(new URLSearchParams(text(q.link).slice(0, 4000)), [...typen.values()]) : null;
    if (gelesen && !gelesen.ok) throw new Fachfehler(422, gelesen.fehler.join(' '));
    const link = gelesen?.ok ? gelesen.link : null;
    // Erweiterte Suche (#199): „suche“ mit den Parametern der Suche in `link`; Rechte wie bei Sichten über `lesen`.
    const erweitert = q.sicht === 'suche' ? abfrageAus(liesSuche(new URLSearchParams(text(q.link).slice(0, 8000))), [...typen.values()]) : null;
    if (erweitert?.fehler.length) throw new Fachfehler(422, erweitert.fehler.join(' '));
    // Sortieren nach Feldern geht, wenn die Sicht genau einen Mappentyp zeigt.
    const fest = q.sicht === 'eingang' || q.sicht === 'favoriten';
    const einTyp = erweitert ? (erweitert.typen.length === 1 ? erweitert.typen[0] : undefined) : link ? link.typ : fest ? undefined : sicht ? (() => { const w = wirksameTypen(sichten, sicht.id); return w.length === 1 ? typen.get(w[0]) : undefined; })() : typen.get(nurTyp ?? String(q.sicht));
    const sortierung = link && !text(q.sortierung)
      ? (link.sortierung ? sortierungAus(link.sortierung.spalte, link.sortierung.absteigend, einTyp) : undefined)
      : sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, einTyp);
    const r = q.sicht === 'eingang'
      ? await this.repo.seite({ eingang: { benutzerId: ich.id, admin: ich.rolle === 'admin' }, suche, volltext, notizen, von, anzahl, sortierung, lesen: suche ? lesen : null })
      : q.sicht === 'favoriten'
        ? await this.repo.seite({ favoriten: { benutzerId: ich.id }, suche, volltext, notizen, von, anzahl, sortierung, lesen })
      : erweitert
        ? await this.repo.seite({
            klauseln: [{ typen: (erweitert.typen.length ? erweitert.typen : [...typen.values()]).map((t) => t.id), filter: filterFuer(erweitert, erweitert.typen, await this.aufloesung(ich.id)) }],
            textfilter: erweitert.volltext ?? undefined, suche, volltext, notizen, von, anzahl, sortierung, lesen })
      : link
        ? await this.repo.seite({ klauseln: [{ typen: [link.typ.id], filter: filterFuer(link, [link.typ], await this.aufloesung(ich.id)) }], suche, volltext, notizen, von, anzahl, sortierung, lesen })
      : auswahl
        ? await this.repo.seite({ klauseln: [auswahlKlausel(setzeEigeneWerte(auswahl.f.auswahlFilter ?? [], auswahl.eigene), auswahl.ziel, await this.aufloesung(ich.id))], suche, volltext, notizen, von, anzahl, sortierung, lesen })
      : sicht
        ? await this.repo.seite({ klauseln: klauselnFuer(sichten, sicht.id, typen, await this.aufloesung(ich.id), verborgen), suche, volltext, notizen, von, anzahl, sortierung, lesen })
        : await this.repo.seite({ typId: nurTyp ?? q.sicht, suche, volltext, notizen, von, anzahl, sortierung, lesen });
    if (q.sicht === 'eingang' && lesen) {
      const ok = await this.repo.lesbare(r.mappen.map((m) => m.id), lesen);
      r.mappen = r.mappen.map((m) => (ok.has(m.id) ? m : { id: m.id, typId: m.typId, werte: {}, titel: NICHT_SICHTBAR, erstellt: m.erstellt, erstelltVon: null, geaendert: m.geaendert, geaendertVon: null, verborgen: true }));
    }
    const ziele = r.mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
    // Eingang (#54): je Mappe, was für mich zu tun ist.
    const aufgaben: Record<string, string> = {};
    if (q.sicht === 'eingang' && r.mappen.length) {
      for (const a of await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: ich.rolle === 'admin', mappeIds: r.mappen.map((m) => m.id) })) {
        aufgaben[a.mappeId] = aufgaben[a.mappeId] ? `${aufgaben[a.mappeId]} · ${a.text}` : a.text;
      }
    }
    return {
      gesamt: r.gesamt, von, mappen: r.mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)),
      ...(r.ausschnitte ? { ausschnitte: r.ausschnitte } : {}), ...(q.sicht === 'eingang' ? { aufgaben } : {}),
      /** Welche Mappen dieser Seite Favoriten des Benutzers sind (#62). */
      favoriten: [...await this.repo.favoritenVon(ich.id, r.mappen.map((m) => m.id))],
    };
  }

  /** Anzahl Mappen je Typ (davon unpassend, Demo), je Sicht und im Eingang des Benutzers. */
  async zaehler(ich: { id: string; rolle: string }, zg?: Zugriff) {
    const lesen = zg?.lesen ?? null;
    const z = await this.repo.zaehler(ich.id, ich.rolle === 'admin', lesen);
    // Der Eingang zählt auch Aufgaben zu Mappen, die man nicht lesen darf (#127).
    const eingang = lesen ? (await this.repo.zaehler(ich.id, ich.rolle === 'admin')).eingang : z.eingang;
    const alleSichten = await this.repo.listeSichten();
    // Verborgene Sichten (#148): kein Zähler, und ihre Mappen zählen auch in der Elternsicht nicht.
    const verborgen = this.verborgeneSichten(alleSichten, zg);
    const sichten = alleSichten.filter((x) => !verborgen.has(x.id));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(ich.id);
    const n = await this.repo.zaehleKlauseln(sichten.map((x) => klauselnFuer(alleSichten, x.id, typen, a, verborgen)), lesen);
    return {
      typen: Object.fromEntries(z.typen), eingang, favoriten: z.favoriten, sichten: Object.fromEntries(sichten.map((x, i) => [x.id, n[i]])),
      // Papierkorb (#43): eigene gelöschte Mappen; Tage 0 = aus.
      papierkorb: await this.repo.zaehlePapierkorb(ich.id), papierkorbTage: await this.papierkorbTage(),
      // Post (#192): Zahl der Sicht „Neue Post“ hervorheben wie im Eingang.
      neuePost: await this.neuePostSicht(),
    };
  }

  /* ---------- Favoriten (#62) ---------- */

  /** Persönlich: ändert weder „zuletzt geändert“ noch das Protokoll der Mappe. */
  async setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    await this.repo.setzeFavorit(ich.id, mappeId, an);
    return { favorit: an };
  }

  async istFavorit(ich: { id: string }, mappeId: string) { return (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId); }

  /* ---------- Berechtigungen (#123–#127) ---------- */

  /**
   * Wer greift zu, und was darf er lesen? Für Administratoren gelten die Regeln nicht (#128):
   * lesen = null (alles). Wird je Anfrage einmal gebildet.
   */
  async zugriff(ich: { id: string; rolle: string; art?: 'dienst'; paketId?: string }): Promise<Zugriff> {
    const a = await this.aufloesung(ich.id);
    const typen = await this.repo.listeTypen();
    const admin = ich.rolle === 'admin' && ich.art !== 'dienst';
    const wer: Wer = { id: ich.id, rollen: a.meineRollen };
    if (ich.art === 'dienst') return this.paketZugriff(ich, a, wer, typen);
    return { ich, admin, wer, a, typen: new Map(typen.map((t) => [t.id, t])), lesen: admin ? null : lesefilter(typen, wer, a) };
  }

  /** Zugriff eines Dienstkontos (#338): nur die Typen und Rechte, die bei der Installation bestätigt wurden. */
  private async paketZugriff(ich: { id: string; rolle: string; paketId?: string }, a: Aufloesung, wer: Wer, typen: Mappentyp[]): Promise<Zugriff> {
    const pakete = await this.repo.listePakete();
    const p = pakete.find((x) => x.id === ich.paketId);
    const r = p?.laeufer?.rechte ?? { lesen: [], schreiben: [], dokumente: 'keine' as const };
    const dms = await this.sichereSystem();
    const ablageort = await this.ablageortId();
    const aufloesen = (liste: string[]): Set<string> => {
      const ids = new Set<string>();
      for (const vw of liste) {
        if (vw === ALLE_TYPEN) { for (const t of typen) if (t.system !== 'benutzer') ids.add(t.id); continue; }
        const [pk, sl] = vw.includes(':') ? vw.split(':') : [p?.id ?? '', vw];
        // dms:benutzer lehnt liesCode ab; hier trotzdem nie auflösen (Pakete sehen keine Benutzer). dms:post seit #435.
        const id = pk === 'dms' ? (sl === 'ablageort' ? ablageort : sl === 'rolle' ? dms.rolle.id : sl === 'post' ? dms.post.id : null)
          : pakete.find((x) => x.id === pk)?.typen[sl];
        if (id) ids.add(id);
      }
      return ids;
    };
    const lesbar = aufloesen(r.lesen);
    const sichtbar = typen.filter((t) => lesbar.has(t.id));
    return {
      ich: { id: ich.id, rolle: 'mitglied' }, admin: false, wer, a, typen: new Map(sichtbar.map((t) => [t.id, t])),
      lesen: { offen: sichtbar.map((t) => t.id), je: [] },
      paket: { id: p?.id ?? '', schreiben: aufloesen(r.schreiben), dokumente: r.dokumente },
    };
  }

  /** Wirksame Rechte an einer Mappe (Administrator: alles im Rahmen der Haken am Mappentyp). */
  async rechteAn(z: Zugriff, m: Mappe, neu = false): Promise<Rechte> {
    const typ = z.typen.get(m.typId);
    if (!typ) return { ...NICHTS };
    if (z.admin) return wirksamVon(ALLES, typ);
    // Dienstkonto (#338): lesen, was bestätigt ist; anlegen/bearbeiten nur die Typen unter „schreiben“; nie löschen, nie Passwörter.
    if (z.paket) { const w = wirksamVon(ALLES, typ); const s = z.paket.schreiben.has(typ.id); return { C: w.C && s, R: w.R, U: w.U && s, D: false, P: false }; }
    return rechteAnMappe(typ, m, z.wer, z.a, await this.mappenquelle(z.wer.id, neu ? [] : [m.id]), neu).wirksam;
  }

  /** Wie `rechteAn` für viele Mappen mit einem Zugriff (#367). */
  async rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> {
    const r = new Map<string, Rechte>();
    if (z.admin) { for (const m of ms) { const typ = z.typen.get(m.typId); r.set(m.id, typ ? wirksamVon(ALLES, typ) : { ...NICHTS }); } return r; }
    const quelle = await this.mappenquelle(z.wer.id, ms.map((m) => m.id));
    for (const m of ms) { const typ = z.typen.get(m.typId); r.set(m.id, typ ? rechteAnMappe(typ, m, z.wer, z.a, quelle, false).wirksam : { ...NICHTS }); }
    return r;
  }

  /** Für die Auswertung im Arbeitsspeicher: nur Aufgaben werden nachgeschlagen. */
  private async mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> {
    const mit = new Set(mappeIds.length ? (await this.repo.offeneAufgaben({ benutzerId, mappeIds })).filter((x) => x.empfaengerId === benutzerId).map((x) => x.mappeId) : []);
    return { dokumente: () => 0, verknuepfungen: () => 0, aufgabe: (id, b) => b === benutzerId && mit.has(id) };
  }

  /** Mappe holen und ein Recht verlangen. Ohne Lesen: 404 (wer nichts sehen darf, erfährt nicht, dass es sie gibt). */
  async pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> {
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    if (!z) return m;
    const r = await this.rechteAn(z, m);
    if (!r.R) throw new Fachfehler(404, 'Diese Mappe gibt es nicht oder du darfst sie nicht sehen.', { verborgen: true });
    if (!r[recht]) throw new Fachfehler(403, VERBOTEN[recht]);
    return m;
  }

  /** Welche dieser Mappen darf der Benutzer lesen? */
  async lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> {
    if (!z || !z.lesen) return new Set(ids);
    return this.repo.lesbare(ids, z.lesen);
  }

  /** Titel nicht lesbarer Mappen ausblenden (#124). */
  private async maskiereBezuege(z: Zugriff | undefined, b: Map<string, MappenBezug>): Promise<Record<string, MappenBezug>> {
    const ok = await this.lesbare(z, [...b.keys()]);
    return Object.fromEntries([...b].map(([id, x]) => [id, ok.has(id) ? x : { titel: NICHT_SICHTBAR, typId: x.typId, verborgen: true }]));
  }

  /** Welche dieser Mappen sieht ein (anderer) Benutzer? Unbekannte Benutzer (System): alle. */
  async sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await this.zugriff(b), ids);
  }

  /* ---------- Berechtigungen in der Werkbank (#123, #125) ---------- */

  /** Aktive Benutzer, für die Regeln gelten (keine Administratoren). */
  private async regelBenutzer(): Promise<Benutzer[]> {
    return this.konten?.benutzer ? (await this.konten.benutzer()).filter((b) => b.aktiv && b.rolle !== 'admin') : [];
  }

  /** Übersicht: je Mappentyp Grundeinstellung und Anzahl Regeln. */
  async berechtigungenListe() {
    const typen = await this.repo.listeTypen();
    return typen.map((t) => ({ typId: t.id, name: t.name, system: t.system ?? null, berechtigungen: regelwerkVon(t) }));
  }

  /** Wie viele Mappen dieses Typs könnte mit diesem Regelwerk kein normaler Benutzer lesen? */
  async niemandLesbar(typ: Mappentyp, rw: Regelwerk): Promise<number> {
    const benutzer = await this.regelBenutzer();
    if (!benutzer.length) return 0;
    const t = { ...typ, berechtigungen: rw };
    const teile: Ausdruck[] = [];
    for (const b of benutzer) {
      const a = await this.aufloesung(b.id);
      teile.push(leseAusdruck(t, { id: b.id, rollen: a.meineRollen }, a));
    }
    const x = nicht(oder(...teile));
    return x.k === 'falsch' ? 0 : this.repo.zaehleAusdruck(typ.id, x);
  }

  /** Regelwerk speichern; mit Warnung, wenn danach Mappen niemand mehr lesen kann (#125). */
  async setzeBerechtigungen(typId: string, eingabe: unknown, bestaetigt: boolean): Promise<{ typ: Mappentyp; niemand: number }> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    const { rw, niemand } = await this.pruefeBerechtigungen(typ, eingabe, bestaetigt);
    const neu = await this.repo.setzeBerechtigungen(typId, istOffen(rw) ? null : rw);
    Dienst.protokolliereBerechtigungen(neu, niemand);
    return { typ: neu, niemand };
  }

  /** Regeln prüfen (Probleme → 422) und warnen, wenn Mappen danach niemand mehr lesen könnte (409 ohne Bestätigung). */
  private async pruefeBerechtigungen(typ: Mappentyp, eingabe: unknown, bestaetigt: boolean): Promise<{ rw: Regelwerk; niemand: number }> {
    const rw = bereinigeRegelwerk(eingabe);
    const probleme = rw.regeln.map((r) => regelProblem(r, typ)).filter((x): x is string => !!x);
    if (probleme.length) throw new Fachfehler(422, `Berechtigungen: ${probleme.join(' ')}`, { gruende: probleme, berechtigungen: true });
    const niemand = await this.niemandLesbar(typ, rw);
    if (niemand && !bestaetigt) {
      throw new Fachfehler(409, `${niemand === 1 ? 'Eine Mappe' : `${niemand} Mappen`} vom Typ „${typ.name}“ könnte danach niemand mehr lesen (außer Administratoren). Trotzdem speichern?`, { niemand });
    }
    return { rw, niemand };
  }

  private static protokolliereBerechtigungen(typ: Mappentyp, niemand: number) {
    const rw = typ.berechtigungen;
    protokoll.modul('werkbank').warn('Berechtigungen geändert', {
      typ: typ.name, grund: rw?.grund ?? 'erteilt', regeln: rw?.regeln.length ?? 0,
      liste: rw?.regeln.map((x, i) => `${i + 1}. ${x.name} ${kurz(x.dann)}${x.stopp ? ' ■' : ''}`).join(' · ') || undefined,
      ...(niemand ? { niemandLesbar: niemand } : {}),
    });
  }

  /**
   * Berechtigungen mit dem Mappentyp speichern (#142): `berechtigungen` in der Eingabe (fehlt = unverändert),
   * `bestaetigt` für die Rückfrage „niemand kann lesen“. Geprüft wird gegen die neuen Felder – vor dem Speichern.
   */
  private async berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown): Promise<{ rw: Regelwerk; niemand: number } | null> {
    const e = (eingabe ?? {}) as { berechtigungen?: unknown; bestaetigt?: unknown };
    if (e.berechtigungen === undefined) return null;
    const r = await this.pruefeBerechtigungen(typ, e.berechtigungen, e.bestaetigt === true);
    return JSON.stringify(istOffen(r.rw) ? null : r.rw) === JSON.stringify(typ.berechtigungen ?? null) ? null : r;
  }

  /** Eine Regel in andere Mappentypen kopieren (ans Ende); Feldbedingungen nur, wo das Feld passt. */
  async kopiereRegel(typId: string, regelId: string, ziele: unknown): Promise<{ kopiert: number; ausgelassen: number }> {
    const typ = await this.repo.holeTyp(typId);
    const regel = typ ? regelwerkVon(typ).regeln.find((r) => r.id === regelId) : undefined;
    if (!typ || !regel) throw new Fachfehler(404, 'Diese Regel gibt es nicht (mehr) – erst speichern, dann kopieren.');
    let kopiert = 0; let ausgelassen = 0;
    for (const id of (Array.isArray(ziele) ? ziele : []).map(String)) {
      const ziel = id === typId ? undefined : await this.repo.holeTyp(id);
      if (!ziel) continue;
      const k = kopiereRegel(regel, ziel);
      if (!k.regel.wenn.length) { ausgelassen += k.ausgelassen; continue; }
      const rw = regelwerkVon(ziel);
      await this.repo.setzeBerechtigungen(ziel.id, { grund: rw.grund, regeln: [...rw.regeln, k.regel] });
      kopiert++; ausgelassen += k.ausgelassen;
    }
    return { kopiert, ausgelassen };
  }

  /** Testlauf (#125): Mappe und Benutzer → CRUDP mit der Spur durch die Regeln (auch für einen ungespeicherten Entwurf). */
  async testlauf(e: { mappeId?: unknown; benutzerId?: unknown; berechtigungen?: unknown }) {
    const m = istUuid(e.mappeId) ? await this.repo.holeMappe(e.mappeId) : undefined;
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === e.benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const gespeichert = await this.repo.holeTyp(m.typId);
    if (!gespeichert) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const typ = e.berechtigungen === undefined ? gespeichert : { ...gespeichert, berechtigungen: bereinigeRegelwerk(e.berechtigungen) };
    const a = await this.aufloesung(b.id);
    const erg = rechteAnMappe(typ, m, { id: b.id, rollen: a.meineRollen }, a, await this.mappenquelle(b.id, [m.id]));
    return { ...erg, admin: b.rolle === 'admin', mappe: { id: m.id, titel: m.titel ?? '', typId: m.typId }, benutzer: { id: b.id, name: b.name || b.email } };
  }

  /** „Was sieht Benutzer X?“ (#125): je Mappentyp gesamt und lesbar, dazu einige Titel. */
  async wasSieht(benutzerId: unknown) {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const z = await this.zugriff(b);
    const erg: Array<{ typId: string; name: string; gesamt: number; lesbar: number; beispiele: Array<{ id: string; titel: string }> }> = [];
    for (const t of [...z.typen.values()].sort((x, y) => x.name.localeCompare(y.name, 'de'))) {
      const gesamt = await this.repo.zaehleMappen(t.id);
      const lesbar = !z.lesen || z.lesen.offen.includes(t.id) ? gesamt : await this.repo.zaehleAusdruck(t.id, z.lesen.je.find((x) => x.typId === t.id)?.ausdruck ?? FALSCH);
      const seite: { mappen: Mappe[] } = lesbar ? await this.repo.seite({ typId: t.id, von: 0, anzahl: 10, lesen: z.lesen }) : { mappen: [] };
      erg.push({ typId: t.id, name: t.name, gesamt, lesbar, beispiele: seite.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '' })) });
    }
    return { admin: z.admin, typen: erg };
  }

  /** Zu welcher Mappe gehört ein Dokument, eine Notiz, eine Aufgabe? (für die Prüfung der Rechte) */
  async mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> {
    const x = !istUuid(id) ? undefined : art === 'dokument' ? await this.repo.holeDokument(id) : art === 'notiz' ? await this.repo.holeNotiz(id) : await this.repo.holeAufgabe(id);
    if (!x) throw new Fachfehler(404, art === 'dokument' ? 'Dieses Dokument gibt es nicht.' : art === 'notiz' ? 'Diese Notiz gibt es nicht.' : 'Diese Aufgabe gibt es nicht.');
    return x.mappeId;
  }

  /**
   * WebDAV-Laufwerk (#346): eine Mappe mit Lesen-Recht – Typ, Dokumente und die verknüpften Mappen
   * (Verweise in beide Richtungen, nur lesbare). Ohne Notizen, Aufgaben und Historie.
   */
  async laufwerkMappe(id: string, z: Zugriff) {
    const mappe = await this.pruefeRecht(z, id, 'R');
    const typ = z.typen.get(mappe.typId) ?? await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    const rueck = await this.repo.rueckverweise(id);
    const bezuege = await this.repo.bezuege([...new Set([...ziele, ...rueck.map((r) => r.quelleId)])].filter((x) => x !== id));
    const lesbar = await this.lesbare(z, [...bezuege.keys()]);
    const verknuepft = [...bezuege].filter(([k]) => lesbar.has(k)).map(([mid, x]) => ({ id: mid, titel: x.titel, typId: x.typId }));
    return { mappe, typ, dokumente: await this.repo.listeDokumente(id), verknuepft };
  }

  /** Klartext von Passwortfeldern nur dort, wo P gilt (#124). */
  async mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> {
    const mit: T[] = []; const ohne: T[] = [];
    for (const m of mappen) ((await this.rechteAn(z, m)).P ? mit : ohne).push(m);
    return { mit, ohne };
  }

  /** Darf ein anderer Benutzer diese Mappe lesen? (Warnungen bei Aufgaben und Erwähnungen, #127) */
  async kannLesen(benutzerId: string, mappeId: string): Promise<boolean> {
    return (await this.sichtbarFuer(benutzerId, [mappeId])).has(mappeId);
  }

  /** Dynamische Werte für den angemeldeten Benutzer: heute, er selbst, seine Rollen. */
  private async aufloesung(benutzerId: string): Promise<Aufloesung> {
    const m = istUuid(benutzerId) ? await this.repo.holeMappe(benutzerId) : undefined;
    return { heute: heuteIn(), ich: benutzerId, meineRollen: m ? alsListe(m.werte.rollen) : [] };
  }

  /* ---------- Sichten verwalten (#38) ---------- */

  /**
   * Sichten für die Ablage (#148): Administratoren alle mit Regeln; Benutzer nur die sichtbaren,
   * mit ihren Rechten daran und ohne die Regeln selbst.
   */
  async listeSichten(z?: Zugriff): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    if (!z || z.admin) return alle;
    const rechte = alleSichtRechte(alle, z.wer, false);
    return alle.filter((s) => rechte.get(s.id)?.R).map(({ berechtigungen: _b, ...s }) => ({ ...s, rechte: rechte.get(s.id)! }));
  }

  /** Ids der Sichten, die ein Benutzer nicht sehen darf (#148); Administratoren und ohne Zugriff: keine. */
  verborgeneSichten(alle: Sicht[], z?: Zugriff): Set<string> {
    if (!z || z.admin) return new Set();
    const rechte = alleSichtRechte(alle, z.wer, false);
    return new Set(alle.filter((s) => !rechte.get(s.id)?.R).map((s) => s.id));
  }

  /** Testlauf an einer Sicht (#148), auch mit ungespeicherten Regeln und Elternsicht. */
  async sichtTestlauf(e: unknown): Promise<unknown> {
    const x = (e ?? {}) as { sichtId?: unknown; benutzerId?: unknown; berechtigungen?: unknown; elternId?: unknown };
    const alle = await this.repo.listeSichten();
    const id = istUuid(x.sichtId) && alle.some((s) => s.id === x.sichtId) ? x.sichtId : randomUUID();
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((y) => y.id === x.benutzerId) : undefined;
    if (!b) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const elternId = istUuid(x.elternId) && alle.some((s) => s.id === x.elternId) && !waereKreis(alle, id, x.elternId) ? x.elternId : null;
    const alt = alle.find((s) => s.id === id);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== id), {
      ...(alt ?? { name: 'Neue Ansicht', beschreibung: '', position: 0, typen: [], bedingungen: [], erstellt: '', geaendert: '' }),
      id, elternId, berechtigungen: bereinigeSichtRegelwerk(x.berechtigungen),
    }];
    const a = await this.aufloesung(b.id);
    if (b.rolle === 'admin') return { admin: true, benutzer: { id: b.id, name: b.name || b.email }, kette: [] };
    const kette = sichtTestlauf(probe, id, { id: b.id, rollen: a.meineRollen });
    return { admin: false, benutzer: { id: b.id, name: b.name || b.email }, kette, wirksam: kette.at(-1)?.stand };
  }

  private async bereinigeSicht(e: unknown, id: string, alle: Sicht[]): Promise<SichtDaten> {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = text(x.name).slice(0, 80);
    if (!name) throw new Fachfehler(422, 'Bitte einen Namen für die Ansicht angeben.');
    const elternId = istUuid(x.elternId) ? x.elternId : null;
    if (elternId && !alle.some((s) => s.id === elternId)) throw new Fachfehler(422, 'Die gewählte Elternsicht gibt es nicht.');
    if (waereKreis(alle, id, elternId)) throw new Fachfehler(422, 'Eine Ansicht kann nicht unter sich selbst oder einer ihrer Unteransichten liegen.');
    const vorhanden = new Set((await this.repo.listeTypen()).map((t) => t.id));
    const typen = [...new Set((Array.isArray(x.typen) ? x.typen : []).map(String))].filter((t) => vorhanden.has(t));
    const geschwister = kinderVon(alle.filter((s) => s.id !== id), elternId);
    const position = Number.isFinite(Number(x.position)) && x.position !== null && x.position !== undefined
      ? Math.trunc(Number(x.position))
      : (geschwister.at(-1)?.position ?? 0) + 10;
    // Trefferliste (#75): nur der Schlüssel; passt er nicht (mehr), gilt der Standard und die Werkbank zeigt es an.
    const trefferliste = text(x.trefferliste).slice(0, 40) || null;
    // Berechtigungen (#148): fehlt die Angabe, bleiben sie, wie sie sind.
    const berechtigungen: SichtRegelwerk | null = 'berechtigungen' in x ? bereinigeSichtRegelwerk(x.berechtigungen) : alle.find((s) => s.id === id)?.berechtigungen ?? null;
    const probleme = (berechtigungen?.regeln ?? []).map((r) => sichtRegelProblem(r, !!elternId)).filter((p): p is string => !!p);
    if (probleme.length) throw new Fachfehler(422, `Berechtigungen: ${probleme.join(' ')}`, { gruende: probleme, berechtigungen: true });
    return { name, beschreibung: text(x.beschreibung).slice(0, 500), elternId, position, typen, bedingungen: bereinigeBedingungen(x.bedingungen), trefferliste, berechtigungen };
  }

  async legeSichtAn(e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    const id = randomUUID();
    return this.repo.legeSichtAn(id, await this.bereinigeSicht(e, id, alle));
  }

  async aendereSicht(id: string, e: unknown): Promise<Sicht> {
    const alle = await this.repo.listeSichten();
    if (!alle.some((s) => s.id === id)) throw new Fachfehler(404, 'Diese Ansicht gibt es nicht.');
    return this.repo.aendereSicht(id, await this.bereinigeSicht(e, id, alle));
  }

  /** Untersichten rücken eine Ebene nach oben, an die Stelle der gelöschten. */
  async loescheSicht(id: string): Promise<void> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, 'Diese Ansicht gibt es nicht.');
    // Neue Reihenfolge der Ebene: Geschwister davor, die Kinder, Geschwister danach.
    const ebene = kinderVon(alle, s.elternId).flatMap((g) => (g.id === id ? kinderVon(alle, id) : [g]));
    for (const [i, g] of ebene.entries()) {
      if (g.elternId !== s.elternId || g.position !== (i + 1) * 10) await this.repo.aendereSicht(g.id, { ...g, elternId: s.elternId, position: (i + 1) * 10 });
    }
    await this.repo.loescheSicht(id);
  }

  /** Reihenfolge unter Geschwistern setzen: Ids in der gewünschten Reihenfolge. */
  async ordneSichten(elternId: unknown, ids: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const eltern = istUuid(elternId) ? elternId : null;
    const geschwister = kinderVon(alle, eltern);
    const liste = Array.isArray(ids) ? ids.map(String) : [];
    if (liste.length !== geschwister.length || !geschwister.every((g) => liste.includes(g.id))) throw new Fachfehler(422, 'Die Reihenfolge muss genau die Ansichten dieser Ebene enthalten.');
    for (const [i, sid] of liste.entries()) {
      const g = geschwister.find((x) => x.id === sid)!;
      if (g.position !== (i + 1) * 10) await this.repo.aendereSicht(sid, { ...g, position: (i + 1) * 10 });
    }
    return this.repo.listeSichten();
  }

  /**
   * Sicht verschieben (Drag & Drop, #73): unter `elternId` (null = oberste Ebene) an die Stelle `stelle`
   * (0 = zuerst). Untersichten wandern mit; Kreise sind unmöglich.
   */
  async verschiebeSicht(id: string, elternId: unknown, stelle: unknown): Promise<Sicht[]> {
    const alle = await this.repo.listeSichten();
    const s = alle.find((x) => x.id === id);
    if (!s) throw new Fachfehler(404, 'Diese Ansicht gibt es nicht.');
    const eltern = istUuid(elternId) ? elternId : null;
    if (eltern && !alle.some((x) => x.id === eltern)) throw new Fachfehler(422, 'Die gewählte Elternsicht gibt es nicht.');
    if (waereKreis(alle, id, eltern)) throw new Fachfehler(422, 'Eine Ansicht kann nicht unter sich selbst oder einer ihrer Unteransichten liegen.');
    const geschwister = kinderVon(alle.filter((x) => x.id !== id), eltern);
    const n = Number(stelle);
    const i = Number.isFinite(n) ? Math.max(0, Math.min(geschwister.length, Math.trunc(n))) : geschwister.length;
    const neu = [...geschwister.slice(0, i), s, ...geschwister.slice(i)];
    for (const [j, g] of neu.entries()) {
      const position = (j + 1) * 10;
      if (g.id === id ? g.elternId !== eltern || g.position !== position : g.position !== position) {
        await this.repo.aendereSicht(g.id, { ...g, elternId: g.id === id ? eltern : g.elternId, position });
      }
    }
    return this.repo.listeSichten();
  }

  /** Anzahl Treffer einer (noch nicht gespeicherten) Sicht – für die Vorschau in der Werkbank. */
  async sichtVorschau(ich: { id: string }, id: unknown, e: unknown): Promise<{ anzahl: number }> {
    const alle = await this.repo.listeSichten();
    const sid = istUuid(id) && alle.some((s) => s.id === id) ? id : randomUUID();
    const d = await this.bereinigeSicht(e, sid, alle);
    const probe: Sicht[] = [...alle.filter((s) => s.id !== sid), { ...d, id: sid, erstellt: '', geaendert: '' }];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const [anzahl] = await this.repo.zaehleKlauseln([klauselnFuer(probe, sid, typen, await this.aufloesung(ich.id))]);
    return { anzahl };
  }

  /**
   * Eigene Sicht für einen Mappentyp, mit der Id des Typs (Lesezeichen bleiben gültig), auf der
   * obersten Ebene angehängt. Benutzer und Rolle stehen dabei immer am Ende.
   */
  private async sichtFuerTyp(t: Mappentyp) {
    const alle = await this.repo.listeSichten();
    if (alle.some((s) => s.id === t.id)) return;
    const SYSTEM_AB = 100_000;
    const oben = kinderVon(alle, null).map((s) => s.position);
    const position = t.system
      ? Math.max(SYSTEM_AB, ...oben) + 10
      : Math.max(0, ...oben.filter((p) => p < SYSTEM_AB)) + 10;
    await this.repo.legeSichtAn(t.id, { name: t.name, beschreibung: t.beschreibung, elternId: null, position, typen: [t.id], bedingungen: [] });
  }

  async belegung(typId: string) {
    if (!(await this.repo.holeTyp(typId))) throw new Fachfehler(404, 'Diesen Mappentyp gibt es nicht.');
    return this.repo.belegung(typId);
  }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */

  /** Prüft alle Mappen eines Typs (nach einer Änderung des Typs) und speichert das Ergebnis. */
  async pruefePassung(typId: string): Promise<number> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) return 0;
    const mappen = await this.repo.listeMappen(typId);
    const typVon = await this.repo.typenVon(mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)).filter(istUuid));
    // Eindeutige Felder: gleiche Werte im Arbeitsspeicher suchen statt je Mappe in der Datenbank.
    const gleiche = new Map<string, Map<string, Mappe[]>>();
    for (const f of typ.felder) {
      if (!f.eindeutig || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const nachWert = new Map<string, Mappe[]>();
      for (const m of mappen) {
        if (istLeer(m.werte[f.key])) continue;
        const w = String(m.werte[f.key]).trim().toLowerCase();
        nachWert.set(w, [...(nachWert.get(w) ?? []), m]);
      }
      gleiche.set(f.key, nachWert);
    }
    const ergebnis = mappen.map((m) => {
      const p = pruefeMappe(typ, m.werte, {
        typVon: (id) => typVon.get(id),
        doppelt: (k, v) => {
          const andere = gleiche.get(k)?.get(String(v).trim().toLowerCase())?.find((x) => x.id !== m.id);
          return andere ? andere.titel || 'Ohne Titel' : undefined;
        },
      });
      return { id: m.id, problem: ersterGrund(typ, p), alt: m.problem ?? null, passtAlt: m.passt };
    });
    const geaendert = ergebnis.filter((e) => e.problem !== e.alt || e.passtAlt === undefined).map(({ id, problem }) => ({ id, problem }));
    await this.repo.setzePassung(geaendert);
    // Passt eine Mappe nicht, hat ihr Ersteller eine Aufgabe (#54); passt sie wieder, ist sie erledigt.
    await this.passungsAufgaben(geaendert);
    return ergebnis.filter((e) => e.problem).length;
  }

  /**
   * Nach dem Speichern einer Mappe: Andere Mappen desselben Typs, die bisher nicht passten,
   * können jetzt passen (z. B. weil ein doppelter Wert geändert wurde). Das sind meist wenige.
   */
  private async pruefeUnpassende(typ: Mappentyp) {
    const ids = await this.repo.unpassende(typ.id);
    if (ids.length) await this.passungFuer(typ, ids);
  }

  /** Prüft einzelne Mappen eines Typs gegen seine Definition und speichert das Ergebnis. */
  private async passungFuer(typ: Mappentyp, ids: string[]) {
    const liste: Array<{ id: string; problem: string | null }> = [];
    for (const m of await this.repo.holeMappen(ids)) {
      const typen = await this.repo.typenVon(verweiseVon(typ, m.werte).map((v) => v.zielId).filter(istUuid));
      const doppelt = new Map<string, string>();
      for (const f of typ.felder) {
        if (!f.eindeutig || istLeer(m.werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
        const d = await this.repo.findeDoppelt(typ.id, f.key, String(m.werte[f.key]), m.id);
        if (d) doppelt.set(f.key, d.titel || 'Ohne Titel');
      }
      const problem = ersterGrund(typ, pruefeMappe(typ, m.werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) }));
      if (problem !== m.problem) liste.push({ id: m.id, problem });
    }
    await this.repo.setzePassung(liste);
    await this.passungsAufgaben(liste);
  }

  /** Beim Start: Passung für Typen nachholen, deren Mappen noch nie geprüft wurden. */
  async passungNachziehen(): Promise<number> {
    const typen = await this.repo.typenOhnePassung();
    for (const t of typen) await this.pruefePassung(t);
    return typen.length;
  }

  private async titel(m: Mappe): Promise<string> {
    return m.titel || titelAus(await this.repo.holeTyp(m.typId), m.werte, undefined, m) || 'Ohne Titel';
  }

  /* ---------- Titel ---------- */

  /**
   * Berechnet die gespeicherten Titel der angegebenen Mappen neu. Ändert sich ein Titel,
   * werden die Mappen nachgezogen, die auf sie verweisen (deren Titel kann ihn enthalten).
   * Bei Verweisen im Kreis endet das nach einigen Runden.
   */
  async aktualisiereTitel(ids: string[]): Promise<Map<string, string>> {
    const neu = new Map<string, string>();
    if (!ids.length) return neu;
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    let offen = [...new Set(ids)];
    for (let runde = 0; offen.length && runde < 6; runde++) {
      const geaendert: Array<{ id: string; titel: string }> = [];
      for (let i = 0; i < offen.length; i += 2000) {
        const mappen = await this.repo.holeMappen(offen.slice(i, i + 2000));
        const ziele = mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
        const gespeichert = await this.repo.titelVon(ziele.filter((z) => !neu.has(z)));
        const titelVon = (z: string) => neu.get(z) || gespeichert.get(z) || 'Ohne Titel';
        for (const m of mappen) {
          const t = titelAus(typen.get(m.typId), m.werte, titelVon, m);
          neu.set(m.id, t);
          if (t !== m.titel) geaendert.push({ id: m.id, titel: t });
        }
      }
      await this.repo.setzeTitel(geaendert);
      offen = geaendert.length ? await this.repo.quellenVon(geaendert.map((g) => g.id)) : [];
    }
    return neu;
  }

  /** Beim Start: Titel berechnen, die noch fehlen (z. B. nach dem Update auf eine Version mit gespeicherten Titeln). */
  /**
   * Die Haken „Neue Mappen erlauben“ und „Löschen erlauben“ in die Berechtigungen überführen (#146),
   * ohne dass Benutzer danach mehr dürfen: Standard C bzw. D ✗, Regeln verlieren genau dieses ✓.
   */
  async hakenUeberfuehren(): Promise<number> {
    let n = 0;
    for (const t of await this.repo.listeTypen()) {
      if (t.system || (t.erstellenErlaubt !== false && t.loeschenErlaubt !== false)) continue;
      const rw = structuredClone(regelwerkVon(t));
      const ohneC = t.erstellenErlaubt === false; const ohneD = t.loeschenErlaubt === false;
      if (ohneC) rw.grund.C = false;
      if (ohneD) rw.grund.D = false;
      const geaendert: string[] = [];
      for (const r of rw.regeln) {
        if (ohneC && r.dann.C === 'erteilen') { delete r.dann.C; geaendert.push(`${r.name}: ohne +C`); }
        if (ohneD && r.dann.D === 'erteilen') { delete r.dann.D; geaendert.push(`${r.name}: ohne +D`); }
      }
      // Regeln, die danach nichts mehr tun, fallen weg.
      const weg = rw.regeln.filter((r) => !RECHTE_LISTE.some((k) => r.dann[k]) && !r.stopp).map((r) => r.name);
      rw.regeln = rw.regeln.filter((r) => RECHTE_LISTE.some((k) => r.dann[k]) || r.stopp);
      await this.repo.aendereTyp(t.id, { ...t, erstellenErlaubt: true, loeschenErlaubt: true });
      await this.repo.setzeBerechtigungen(t.id, istOffen(rw) ? null : rw);
      protokoll.modul('werkbank').warn('Haken „Neue Mappen/Löschen erlauben“ in die Berechtigungen übernommen', {
        typ: t.name, standard: kurzStandard(rw.grund), ...(geaendert.length ? { regeln: geaendert.join(' · ') } : {}), ...(weg.length ? { entfallen: weg.join(', ') } : {}),
      });
      n++;
    }
    return n;
  }

  /** Schlüssel für Mappentypen ohne (nach dem Update auf 0.31, #145): Systemtypen zuerst, dann aus dem Namen. */
  async typSchluesselNachziehen(): Promise<number> {
    const typen = await this.repo.listeTypen();
    const vergeben = new Set(typen.map((t) => t.schluessel ?? '').filter(Boolean));
    let n = 0;
    for (const t of typen.filter((x) => !x.schluessel).sort((a, b) => Number(!a.system) - Number(!b.system))) {
      const k = freierSchluessel(t.system ?? t.name, vergeben);
      vergeben.add(k);
      await this.repo.setzeTypSchluessel(t.id, k);
      n++;
    }
    if (n) protokoll.modul('werkbank').info('Kennungen für Mappentypen vergeben', { anzahl: n });
    return n;
  }

  /* ---------- Ansicht der Werkbank (#281): nur Navigation, keine Funktion wird abgeschaltet ---------- */

  async werkbankAnsicht(wer: { id: string | null; email: string }) {
    const installation = liesAnsicht(await this.einstellungen?.lies('werkbank_ansicht'));
    return {
      installation: installation ?? OHNE_EINSTELLUNG,
      eingestellt: !!installation,
      eigene: liesEigene(await this.einstellungen?.lies(`werkbank_ansicht:${wer.id ?? wer.email}`)),
    };
  }
  async setzeWerkbankAnsicht(wer: { id: string | null; email: string }, body: Record<string, unknown>) {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    if ('installation' in body) {
      const a = liesAnsicht(body.installation);
      if (!a) throw new Fachfehler(422, 'Bitte eine Vorlage wählen: Haushalt, Betrieb oder Alles.');
      await this.einstellungen.schreibe('werkbank_ansicht', a);
      protokoll.modul('werkbank').info('Werkbank angepasst', { vorlage: a.vorlage, ein: a.ein, aus: a.aus, von: wer.email });
    }
    if ('eigene' in body) {
      const e = liesEigene(body.eigene);
      await this.einstellungen.schreibe(`werkbank_ansicht:${wer.id ?? wer.email}`, e.ein.length ? e : null);
    }
    return this.werkbankAnsicht(wer);
  }

  /* ---------- Pakete (#188): Ablage der installierten Pakete; die Logik steckt in pakete.ts ---------- */

  listePakete() { return this.repo.listePakete(); }
  speicherePaketCode(id: string, dateien: Array<{ name: string; inhalt: Buffer }>) { return this.repo.speicherePaketCode(id, dateien); }
  paketCode(id: string) { return this.repo.paketCode(id); }
  loeschePaketCode(id: string) { return this.repo.loeschePaketCode(id); }
  loescheEreignisse(id: string) { return this.repo.loescheEreignisse(id); }
  /** Ereignisse für Pakete (#338). */
  faelligeEreignisse(n: number) { return this.repo.faelligeEreignisse(n); }
  ereignisZugestellt(id: string) { return this.repo.ereignisZugestellt(id); }
  ereignisFehlgeschlagen(id: string, fehler: string, naechster: Date | null) { return this.repo.ereignisFehlgeschlagen(id, fehler, naechster); }
  ereignisStand() { return this.repo.ereignisStand(); }
  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt. */
  paketKonten = new Map<string, string>();

  /**
   * Ereignis für alle Pakete mit Code, die es abonniert haben (#338). In einer Transaktion (#404) gehört
   * es zur Änderung: scheitert es, wird beides nicht gespeichert. Sonst nicht blockierend – Fehler landen
   * nur im Protokoll. `von`: wer es ausgelöst hat – ein Paket bekommt seine eigenen Änderungen nicht
   * gemeldet (sonst Schleifen).
   */
  async melde(art: EreignisArt, daten: Record<string, unknown>, nurPaket?: string, von?: string | null): Promise<void> {
    const inTx = transaktionen.getStore()?.dienst === this;
    try {
      const selbst = von ? this.paketKonten.get(von) : undefined;
      const pakete = (await this.repo.listePakete()).filter((p) => p.laeufer?.ereignisse.includes(art) && (!nurPaket || p.id === nurPaket) && p.id !== selbst);
      if (!pakete.length) return;
      await this.repo.legeEreignisseAn(pakete.map((p) => ({ id: randomUUID(), paketId: p.id, art, daten })));
      this.danach(() => this.ereignisWecker?.());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('werkbank').error('Ereignis für Pakete nicht gespeichert', { art, fehler: (e as Error).message });
    }
  }
  speicherePaket(p: InstalliertesPaket) { return this.repo.speicherePaket(p); }
  loeschePaket(id: string) { return this.repo.loeschePaket(id); }

  /** Weitere Katalogadressen (#189), global; der offizielle Katalog steht nicht darin. */
  async paketQuellen(): Promise<Array<{ url: string; aktiv: boolean; von: string | null; am: string }>> {
    const v = await this.einstellungen?.lies('paket_kataloge');
    return Array.isArray(v) ? v.filter((q) => q && typeof q.url === 'string').map((q) => ({ url: q.url, aktiv: q.aktiv !== false, von: q.von ?? null, am: String(q.am ?? '') })) : [];
  }
  async setzePaketQuellen(liste: Array<{ url: string; aktiv: boolean; von: string | null; am: string }>) {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    await this.einstellungen.schreibe('paket_kataloge', liste.length ? liste : null);
  }

  /** Selbst erstellte Pakete (#374): Angaben des letzten Exports je Paket-Id (Einstellung, Teil der Sicherung). */
  async paketEntwuerfe(): Promise<PaketEntwurf[]> {
    const v = await this.einstellungen?.lies('paket_entwuerfe');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && typeof e.version === 'string').map((e) => ({ typen: [], sichten: [], beispiele: [], schluessel: {}, verlauf: [], aenderungen: '', ...e })) : [];
  }
  async setzePaketEntwuerfe(liste: PaketEntwurf[]) {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    await this.einstellungen.schreibe('paket_entwuerfe', liste.length ? liste : null);
  }

  /** Paket-Einstellungen (#197): je Paket getrennt in den Einstellungen (Teil der Sicherung, Schlüsselwechsel inklusive). */
  async paketEinstellungen(id: string): Promise<{ werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null> {
    const v = await this.einstellungen?.lies(`paket:${id}`);
    return v && typeof v === 'object' ? v as { werte: Record<string, unknown> } : null;
  }
  async setzePaketEinstellungen(id: string, v: { werte: Record<string, unknown>; status?: { letzterLauf: string | null; meldungen: string[] } } | null) {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    await this.einstellungen.schreibe(`paket:${id}`, v);
  }
  /** Kleiner eigener Speicher eines Pakets mit Code (#338), getrennt von den Einstellungen. */
  async paketSpeicher(id: string): Promise<Record<string, string>> {
    const v = await this.einstellungen?.lies(`paketspeicher:${id}`);
    return v && typeof v === 'object' ? v as Record<string, string> : {};
  }
  async setzePaketSpeicher(id: string, werte: Record<string, string> | null) {
    if (!this.einstellungen) throw new Fachfehler(404, 'Einstellungen sind nicht eingerichtet.');
    await this.einstellungen.schreibe(`paketspeicher:${id}`, werte);
  }
  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, 'Für Geheimnisse fehlt der Schlüssel. Erzeuge ihn unter Werkbank → Verschlüsselung.');
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }

  /** Warum Mappentypen nicht weg dürfen: Mappen oder Papierkorb-Einträge. Leer = frei. */
  async belegteTypen(ids: string[]): Promise<string[]> {
    const gruende: string[] = [];
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    for (const id of ids) {
      const t = typen.get(id);
      if (!t) continue;
      const n = await this.repo.zaehleMappen(id);
      if (n) gruende.push(`${t.name}: ${n} ${n === 1 ? 'Mappe' : 'Mappen'}.`);
      const korb = (await this.repo.papierkorb({ typId: id })).length;
      if (korb) gruende.push(`${t.name}: ${korb} im Papierkorb.`);
    }
    return gruende;
  }

  /** Nur für das Zurückrollen einer fehlgeschlagenen Paketinstallation: Mappen ohne Papierkorb entfernen. */
  async entferneMappenEndgueltig(ids: string[]) { for (const id of ids) await this.repo.loescheMappe(id); }

  /* ---------- Nummernkreise (#171) ---------- */

  /** Felder, die einen Kreis nutzen: „Mappentyp · Feld“. */
  private async kreisVerwendung(): Promise<Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>> {
    const v = new Map<string, Array<{ typId: string; typ: string; feldKey: string; feld: string }>>();
    for (const t of await this.repo.listeTypen()) for (const f of t.felder) {
      const k = kreisVon(f);
      if (k) v.set(k, [...(v.get(k) ?? []), { typId: t.id, typ: t.name, feldKey: f.key, feld: f.label }]);
    }
    return v;
  }

  async listeNummernkreise(jetzt = new Date()) {
    await this.archivKreis(); // Archivnummern (#345): der Kreis ist immer da
    const v = await this.kreisVerwendung();
    const d = datumIn(jetzt);
    return (await this.repo.listeNummernkreise()).map((k) => {
      const n = naechste(k, d);
      return { ...k, naechste: n.nummer, naechsterZaehler: n.zaehler, zeitraum: n.zeitraum, neubeginn: neubeginn(k.muster), verwendet: v.get(k.schluessel) ?? [] };
    });
  }

  async speichereNummernkreis(e: unknown, von: string) {
    const x = (e ?? {}) as Record<string, unknown>;
    const schluessel = text(x.schluessel).toLowerCase();
    const name = text(x.name).slice(0, 80);
    const muster = String(x.muster ?? '').trim();
    const start = Number(x.start ?? 1);
    const vorhanden = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === schluessel);
    if (x.neu === true && vorhanden) throw new Fachfehler(409, `Die Kennung „${schluessel}“ hat schon der Nummernkreis „${vorhanden.name}“.`);
    if (x.neu !== true && !vorhanden) throw new Fachfehler(404, 'Diesen Nummernkreis gibt es nicht.');
    if (!KREIS_SCHLUESSEL.test(schluessel)) throw new Fachfehler(422, 'Kennung: Kleinbuchstaben, Ziffern und _, beginnt mit einem Buchstaben (höchstens 40 Zeichen).');
    if (!name) throw new Fachfehler(422, 'Der Nummernkreis braucht einen Namen.');
    const fm = pruefeMuster(muster);
    if (fm) throw new Fachfehler(422, fm);
    if (!Number.isSafeInteger(start) || start < 0) throw new Fachfehler(422, 'Der Startwert muss eine ganze Zahl ab 0 sein.');
    const k = await this.repo.speichereNummernkreis({ schluessel, name, muster, start });
    protokoll.modul('werkbank').info(vorhanden ? 'Nummernkreis geändert' : 'Nummernkreis angelegt', { von, schluessel, muster, start, ...(vorhanden && vorhanden.muster !== muster ? { musterVorher: vorhanden.muster } : {}) });
    return k;
  }

  async loescheNummernkreis(schluessel: string, von: string) {
    if (schluessel === ARCHIV_KREIS) throw new Fachfehler(409, 'Den Nummernkreis der Archivnummern brauchen die Aufkleber (#345); er lässt sich nicht löschen. Das Muster darfst du ändern.');
    const v = (await this.kreisVerwendung()).get(schluessel);
    if (v?.length) throw new Fachfehler(409, `Der Nummernkreis wird noch verwendet: ${v.map((x) => `${x.typ} · ${x.feld}`).join(', ')}.`);
    await this.repo.loescheNummernkreis(schluessel);
    protokoll.modul('werkbank').info('Nummernkreis gelöscht', { von, schluessel });
  }

  /** Zählerstand setzen (#171): `naechster` ist der Zähler der nächsten Nummer im aktuellen Zeitraum. */
  async setzeZaehler(schluessel: string, e: unknown, von: string, jetzt = new Date()) {
    const naechster = Number((e as { naechster?: unknown })?.naechster);
    if (!Number.isSafeInteger(naechster) || naechster < 0) throw new Fachfehler(422, 'Der Zählerstand muss eine ganze Zahl ab 0 sein.');
    const k = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === schluessel);
    if (!k) throw new Fachfehler(404, 'Diesen Nummernkreis gibt es nicht.');
    const vorher = naechste(k, datumIn(jetzt));
    const neu = await this.repo.setzeZaehler(schluessel, vorher.zeitraum, naechster - 1);
    protokoll.modul('werkbank').warn('Zählerstand eines Nummernkreises gesetzt', { von, schluessel, zeitraum: vorher.zeitraum, vorher: vorher.zaehler, naechster });
    return neu;
  }

  /** Wartung (#171): Mappen eines Typs ohne Nummer – Anzahl und welche Nummern entstehen. */
  async nummernVorschau(typId: string, feldKey: string, jetzt = new Date()) {
    const { kreis, ohne } = await this.ohneNummer(typId, feldKey);
    if (!ohne.length) return { anzahl: 0, von: null, bis: null };
    const d = datumIn(jetzt);
    const n = naechste(kreis, d);
    const bis = naechste({ ...kreis, staende: { ...kreis.staende, [n.zeitraum]: n.zaehler + ohne.length - 2 } }, d);
    return { anzahl: ohne.length, von: n.nummer, bis: ohne.length === 1 ? n.nummer : bis.nummer };
  }

  private async ohneNummer(typId: string, feldKey: string): Promise<{ typ: Mappentyp; kreis: Nummernkreis; ohne: Mappe[] }> {
    const typ = await this.repo.holeTyp(typId);
    const f = typ?.felder.find((x) => x.key === feldKey);
    const k = f ? kreisVon(f) : null;
    if (!typ || !f || !k) throw new Fachfehler(422, 'Dieses Feld nutzt keinen Nummernkreis.');
    const kreis = (await this.repo.listeNummernkreise()).find((x) => x.schluessel === k);
    if (!kreis) throw new Fachfehler(409, `Den Nummernkreis „${k}“ gibt es nicht.`);
    const ohne = (await this.repo.listeMappen(typId)).filter((m) => istLeer(m.werte[feldKey]))
      .sort((a, b) => a.erstellt.localeCompare(b.erstellt) || a.id.localeCompare(b.id));
    return { typ, kreis, ohne };
  }

  /** Wartung (#171): Nummern nachträglich vergeben, in der Reihenfolge des Anlegens; als Auftrag. */
  nummernNachtragen(typId: string, feldKey: string, von: string) {
    return this.auftraege.starte('nummern', 'Nummern nachträglich vergeben', async (fortschritt) => {
      const { typ, ohne } = await this.ohneNummer(typId, feldKey);
      const label = typ.felder.find((f) => f.key === feldKey)!.label;
      let vergeben = 0; let erste: string | null = null; let letzte: string | null = null;
      for (const [i, m] of ohne.entries()) {
        const nr = await this.repo.vergebeNummer(m.id, feldKey, kreisVon(typ.felder.find((f) => f.key === feldKey)!)!, new Date());
        if (nr) {
          vergeben++; erste ??= nr; letzte = nr;
          await this.notiere(m.id, null, 'geaendert', { aenderungen: [{ feld: feldKey, label, neu: nr }] satisfies Feldaenderung[] });
        }
        fortschritt(i + 1, ohne.length);
      }
      await this.aktualisiereTitel(ohne.map((m) => m.id));
      protokoll.modul('werkbank').info('Nummern nachträglich vergeben', { von, typ: typ.name, feld: label, vergeben, erste, letzte });
      return { vergeben, erste, letzte };
    }, [{ key: 'nummern', name: 'Nummern vergeben', einheit: 'Mappen' }]);
  }

  async titelNachziehen(): Promise<number> {
    const ids = await this.repo.ohneTitel();
    await this.aktualisiereTitel(ids);
    return ids.length;
  }

  private async pruefeWerte(typ: Mappentyp, werte: Werte, eigeneId?: string) {
    const ids = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter(istUuid);
    const typen = await this.repo.typenVon(ids);
    const doppelt = new Map<string, string>();
    for (const f of typ.felder) {
      if (!f.eindeutig || istLeer(werte[f.key]) || (f.typ !== 'text' && f.typ !== 'zahl')) continue;
      const d = await this.repo.findeDoppelt(typ.id, f.key, String(werte[f.key]), eigeneId);
      if (d) doppelt.set(f.key, await this.titel(d));
    }
    const p = pruefeMappe(typ, werte, { typVon: (id) => typen.get(id), doppelt: (k) => doppelt.get(k) });
    if (!istOk(p)) throw new Fachfehler(422, 'Bitte die markierten Felder prüfen.', p);
  }

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false, z?: Zugriff): Promise<Mappe & { hinweis?: string }> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, 'Unbekannter Mappentyp.');
    if (!darfErstellen(typ)) throw new Fachfehler(403, `Mappen vom Typ „${typ.name}“ lassen sich in der Ablage nicht anlegen.${typ.system === 'benutzer' ? ' Benutzer legt ein Administrator in der Benutzerverwaltung an.' : ''}`);
    const werte = bereinigeWerte(typ, e.werte, {}, this.verschluessele);
    // Berechtigungen (#123): Anlegen wird mit den eingegebenen Werten geprüft.
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: z.ich.id, geaendert: new Date().toISOString(), geaendertVon: z.ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, `Mappen vom Typ „${typ.name}“ mit diesen Angaben darfst du nicht anlegen.`);
    }
    // Nummernkreise (#171): Eingaben zählen nicht; die Nummer zieht das Repo beim Anlegen.
    const nummern = typ.felder.flatMap((f) => { const k = kreisVon(f); return k ? [{ feldKey: f.key, kreis: k }] : []; });
    for (const n of nummern) delete werte[n.feldKey];
    if (nummern.length) {
      const da = new Set((await this.repo.listeNummernkreise()).map((k) => k.schluessel));
      const fehlt = nummern.find((n) => !da.has(n.kreis));
      if (fehlt) throw new Fachfehler(409, `Den Nummernkreis „${fehlt.kreis}“ für „${typ.felder.find((f) => f.key === fehlt.feldKey)?.label}“ gibt es nicht mehr. Bitte einen Administrator.`);
    }
    await this.pruefeVerweisziele(z, typ, werte, {});
    await this.pruefeAuswahlfilter(typ, werte, {}, benutzerId);
    await this.pruefeWerte(typ, werte);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId, demo, null, nummern.length ? { felder: nummern, jetzt: new Date() } : undefined);
    if (!demo) {
      await this.notiere(m.id, benutzerId, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, m.werte) });
      await this.pruefeErwaehnungen(typ, m.id, {}, werte, benutzerId);
    }
    const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    if (!demo && fristFelder(typ).length) await this.fristenAbgleichen({ mappeIds: [m.id] });
    const hinweis = z ? await this.hinweisDanach(z, m.id) : undefined;
    return { ...m, titel, ...(hinweis ? { hinweis } : {}) };
  }

  /**
   * Auswahlfilter (#172): neue Verweise müssen den Filter des Felds erfüllen; bisherige bleiben
   * gültig, auch wenn sie inzwischen nicht mehr passen.
   */
  private async pruefeAuswahlfilter(typ: Mappentyp, werte: Werte, alt: Werte, benutzerId: string | null) {
    const mitFilter = typ.felder.filter((f) => f.typ === 'referenz' && f.auswahlFilter?.length);
    if (!mitFilter.length) return;
    const ids = (w: unknown) => (Array.isArray(w) ? w : w ? [w] : []).map(String).filter(istUuid);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(benutzerId ?? '');
    const fehler: Record<string, string[]> = {};
    for (const f of mitFilter) {
      const vorher = new Set(ids(alt[f.key]));
      const neu = ids(werte[f.key]).filter((x) => !vorher.has(x));
      const ziel = typen.get(f.zielTyp ?? '');
      if (!neu.length || !ziel) continue;
      // Werte aus der eigenen Mappe (#173): die, die gespeichert werden sollen.
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter!, werte), ziel, a);
      const falsch = (await this.repo.holeMappen(neu)).filter((m) => m.typId !== ziel.id || !erfuellt(m, k.filter, KEINE_ZAEHLUNG));
      if (falsch.length) fehler[f.key] = [`${falsch.map((m) => `„${m.titel || 'Ohne Titel'}“`).join(', ')} passt nicht zur Auswahl dieses Felds.`];
    }
    if (Object.keys(fehler).length) throw new Fachfehler(422, 'Bitte die markierten Felder prüfen.', { allgemein: [], felder: fehler });
  }

  /** Auswahlfilter (#172): bestehende Verweise, die nicht (mehr) zum Filter passen – für einen Hinweis am Feld. */
  private async unpassendeVerweise(typ: Mappentyp | undefined, werte: Werte, benutzerId: string): Promise<Record<string, string[]>> {
    const mitFilter = typ?.felder.filter((f) => f.typ === 'referenz' && f.auswahlFilter?.length) ?? [];
    if (!mitFilter.length) return {};
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const a = await this.aufloesung(benutzerId);
    const erg: Record<string, string[]> = {};
    for (const f of mitFilter) {
      const ziel = typen.get(f.zielTyp ?? '');
      const ids = (Array.isArray(werte[f.key]) ? werte[f.key] as string[] : werte[f.key] ? [String(werte[f.key])] : []).filter(istUuid);
      if (!ziel || !ids.length) continue;
      const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter!, werte), ziel, a);
      const x = (await this.repo.holeMappen(ids)).filter((m) => !erfuellt(m, k.filter, KEINE_ZAEHLUNG)).map((m) => m.id);
      if (x.length) erg[f.key] = x;
    }
    return erg;
  }

  /** Auswahlfilter (#172, #173) beim Ausfüllen: welche der gewählten Mappen passen zu den aktuellen Werten nicht? */
  async auswahlPruefen(e: unknown, benutzerId: string, z?: Zugriff) {
    const x = (e ?? {}) as { typId?: unknown; feldKey?: unknown; ids?: unknown; werte?: unknown };
    const typ = istUuid(x.typId) ? await this.repo.holeTyp(x.typId) : undefined;
    const f = typ?.felder.find((y) => y.key === x.feldKey && y.typ === 'referenz');
    const ziel = f ? await this.repo.holeTyp(f.zielTyp ?? '') : undefined;
    // Nur Mappen, die man lesen darf – sonst verriete die Antwort etwas über ihre Werte.
    const roh = (Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid).slice(0, 200);
    const lesbar = await this.lesbare(z, roh);
    const ids = roh.filter((id) => lesbar.has(id));
    if (!f || !ziel || !f.auswahlFilter?.length || !ids.length) return { unpassend: [] as string[] };
    const werte = x.werte && typeof x.werte === 'object' ? x.werte as Werte : {};
    const k = auswahlKlausel(setzeEigeneWerte(f.auswahlFilter, werte), ziel, await this.aufloesung(benutzerId));
    return { unpassend: (await this.repo.holeMappen(ids)).filter((m) => !erfuellt(m, k.filter, KEINE_ZAEHLUNG)).map((m) => m.id) };
  }

  /** Auswahlfilter (#172) in der Werkbank: wie viele Mappen des Zieltyps passen? */
  async zaehleAuswahl(e: unknown, benutzerId: string) {
    const x = (e ?? {}) as { zielTyp?: unknown; bedingungen?: unknown };
    const ziel = istUuid(x.zielTyp) ? await this.repo.holeTyp(x.zielTyp) : undefined;
    if (!ziel) throw new Fachfehler(422, 'Unbekannter Ziel-Mappentyp.');
    // Bedingungen mit Werten der eigenen Mappe (#173) zählen hier nicht – die Mappe gibt es noch nicht.
    const bed = setzeEigeneWerte(bereinigeAuswahlfilter(x.bedingungen), {});
    const [passen] = await this.repo.zaehleKlauseln([[auswahlKlausel(bed, ziel, await this.aufloesung(benutzerId))]], null);
    return { passen, gesamt: await this.repo.zaehleMappen(ziel.id), probleme: auswahlProbleme(bed, ziel) };
  }

  /** Verweise nur auf Mappen, die man sehen darf (#124, #137); bisherige Ziele bleiben erlaubt. */
  private async pruefeVerweisziele(z: Zugriff | undefined, typ: Mappentyp, werte: Werte, alt: Werte) {
    if (!z || z.admin || !z.lesen) return;
    const vorher = new Set(verweiseVon(typ, alt).map((v) => v.zielId));
    const neu = [...new Set(verweiseVon(typ, werte).map((v) => v.zielId))].filter((x) => istUuid(x) && !vorher.has(x));
    if (!neu.length) return;
    const ok = await this.repo.lesbare(neu, z.lesen);
    if (neu.some((x) => !ok.has(x))) throw new Fachfehler(422, 'Ein Verweis zeigt auf eine Mappe, die du nicht sehen darfst.');
  }

  /** Nach dem Speichern: Hat man sich selbst das Bearbeiten oder Lesen entzogen? (#126) */
  private async hinweisDanach(z: Zugriff, id: string): Promise<string | undefined> {
    if (z.admin) return undefined;
    const m = await this.repo.holeMappe(id);
    if (!m) return undefined;
    const r = await this.rechteAn(z, m);
    if (!r.R) return 'Gespeichert. Diese Mappe kannst du jetzt nicht mehr sehen.';
    if (!r.U) return 'Gespeichert. Diese Mappe kannst du jetzt nicht mehr bearbeiten.';
    return undefined;
  }

  /** Vor dem Speichern (#126): welche Rechte hätte man mit diesen Werten? */
  async rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> {
    const m = await this.pruefeRecht(z, id, 'U');
    const typ = z.typen.get(m.typId);
    if (!typ) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte, this.verschluessele);
    return this.rechteAn(z, { ...m, werte });
  }

  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff): Promise<Mappe & { hinweis?: string }> {
    const m = z ? await this.pruefeRecht(z, id, 'U') : await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, 'Der Mappentyp dieser Mappe fehlt.');
    const werte = bereinigeWerte(typ, (eingabe as { werte?: unknown })?.werte, m.werte, this.verschluessele);
    // Geschützte Felder (Benutzer, Name einer Systemrolle) ändert nur das System.
    for (const [k, grund] of Object.entries(geschuetzteFelder(typ, m))) {
      if (JSON.stringify(werte[k] ?? null) !== JSON.stringify(m.werte[k] ?? null)) {
        throw new Fachfehler(403, `„${typ.felder.find((f) => f.key === k)?.label ?? k}“ lässt sich hier nicht ändern. ${grund}`);
      }
    }
    await this.pruefeVerweisziele(z, typ, werte, m.werte);
    await this.pruefeAuswahlfilter(typ, werte, m.werte, benutzerId);
    await this.pruefeWerte(typ, werte, id);
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    // Archivmodus (#212): eine neue Frist steht in der Historie.
    const bisAlt = aufbewahrenBis(typ.archiv, m), bisNeu = aufbewahrenBis(typ.archiv, { ...m, werte });
    if (bisAlt !== bisNeu) aenderungen.push({ feld: '_aufbewahrenBis', label: 'Aufbewahren bis', alt: bisAlt ? datumText(bisAlt) : '', neu: bisNeu ? datumText(bisNeu) : '' });
    const neu = await this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), benutzerId);
    if (aenderungen.length) await this.notiere(id, benutzerId, 'geaendert', { aenderungen });
    // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
    await this.passungsAufgaben([{ id, problem: null }]);
    await this.pruefeErwaehnungen(typ, id, m.werte, werte, benutzerId);
    const titel = (await this.aktualisiereTitel([id])).get(id);
    if (typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    // Fristen (#129): neues Datum → neue Aufgabe, verschobenes oder leeres → alte erledigt.
    await this.fristenAbgleichen({ mappeIds: [id] });
    // Post (#192): „Für“ und Stand bestimmen die Aufgabe „Neue Post“.
    if (typ.system === 'post') await this.postAufgaben(id, benutzerId);
    const hinweis = z ? await this.hinweisDanach(z, id) : undefined;
    return { ...neu, titel, ...(hinweis ? { hinweis } : {}) };
  }

  /** Viele neue Mappen auf einmal (Demo-Daten); Werte sind bereits geprüft. */
  legeMappenAn(liste: NeueMappe[]) { return this.repo.legeMappenAn(liste); }
  /** Nach Massenläufen (#367): Statistik der Datenbank auffrischen; ein Fehler dabei ist nur ein Hinweis. */
  async aktualisiereStatistik() {
    const t = Date.now();
    try { await this.repo.aktualisiereStatistik(); protokoll.modul('datenbank').info('Statistik aufgefrischt (ANALYZE)', { ms: Date.now() - t }); }
    catch (e) { protokoll.modul('datenbank').warn('Statistik ließ sich nicht auffrischen (ANALYZE)', { fehler: (e as Error).message }); }
  }

  /**
   * Ob und warum nicht eine Mappe gelöscht werden kann (#79). Dieselbe Prüfung nutzt das Löschen,
   * damit Anzeige und Löschen nie auseinanderlaufen.
   */
  private async loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[]) {
    if (m.systemKennung) return { ok: false as const, status: 409, grund: 'Systemrollen lassen sich nicht löschen.', fremd: [], zuordnungen: [], emails: [] };
    if (typ && !darfLoeschen(typ)) return { ok: false as const, status: 403, grund: `Mappen vom Typ „${typ.name}“ lassen sich in der Ablage nicht löschen.${typ.system === 'benutzer' ? ' Benutzer werden in der Benutzerverwaltung deaktiviert.' : ''}`, fremd: [], zuordnungen: [], emails: [] };
    // Archivmodus (#212): vor Fristende nicht löschen – auch nicht als Administrator.
    const bis = aufbewahrenBis(typ?.archiv, m);
    if (inFrist(bis)) return { ok: false as const, status: 409, grund: `Aufbewahrungspflicht bis ${datumText(bis!)} – vorher lässt sich die Mappe nicht löschen.`, fremd: [], zuordnungen: [], emails: [], aufbewahrenBis: bis };
    const typen = rueck.length ? await this.repo.listeTypen() : [];
    // Eine Rolle darf weg, auch wenn Benutzer sie haben: deren Zuordnung fällt weg.
    const benutzerTyp = typ?.system === 'rolle' ? typen.find((t) => t.system === 'benutzer') : undefined;
    const zuordnungen = benutzerTyp ? rueck.filter((r) => r.quelleTypId === benutzerTyp.id && r.feldKey === 'rollen') : [];
    // Post (#58, #192) verweist auf jede Mappe; sie hält das Löschen nicht auf, der Verweis entfällt.
    const emailTyp = typen.find((t) => t.system === 'post');
    const emails = emailTyp ? rueck.filter((r) => r.quelleTypId === emailTyp.id && r.feldKey === 'bezug') : [];
    const fremd = rueck.filter((r) => r.quelleId !== m.id && !zuordnungen.includes(r) && !emails.includes(r));
    if (fremd.length) {
      const ids = new Set(fremd.map((r) => r.quelleId));
      return { ok: false as const, status: 409, grund: `Auf diese Mappe ${ids.size === 1 ? 'verweist noch eine andere Mappe' : `verweisen noch ${ids.size} andere Mappen`}. Entferne erst diese Verweise.`, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
    }
    return { ok: true as const, status: 200, grund: undefined, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
  }

  /**
   * Export mehrerer Mappen (#152, #153): Tabelle (csv, xlsx), ZIP mit Dokumenten oder ein PDF.
   * Recht E an der Sicht, Lesen je Mappe; Reihenfolge wie in der Liste. Passwörter nie.
   */
  async exportiere(ich: { id: string; rolle: string; name?: string }, e: unknown, z: Zugriff): Promise<{ name: string; mime: string; inhalt: Buffer | Readable; groesse: number; mappen: number; ausgelassen: number }> {
    const x = (e ?? {}) as Record<string, unknown>;
    const format = String(x.format ?? '');
    if (!['csv', 'xlsx', 'zip', 'pdf'].includes(format)) throw new Fachfehler(422, 'Unbekanntes Format.');
    const q = { sicht: text(x.sicht), link: x.link, suche: x.suche, volltext: x.volltext, notizen: x.notizen, sortierung: x.sortierung, absteigend: x.absteigend };
    const alle = await this.repo.listeSichten();
    const sicht = alle.find((s) => s.id === q.sicht);
    if (sicht && !z.admin) {
      const r = alleSichtRechte(alle, z.wer, false).get(sicht.id);
      if (!r?.R) throw new Fachfehler(404, 'Diese Ansicht gibt es nicht.');
      if (!r.E) throw new Fachfehler(403, 'Aus dieser Ansicht darfst du nicht exportieren.');
    }
    const treffer = (await this.trefferIds(ich, q, z)).ids;
    const gewaehlt = Array.isArray(x.ids) ? new Set(x.ids.map(String)) : null;
    let ids = gewaehlt ? treffer.filter((id) => gewaehlt.has(id)) : treffer;
    if (!ids.length) throw new Fachfehler(422, 'Keine Mappen zum Exportieren.');
    // Ohne Sicht (erweiterte Suche, Typ-Liste, Link …) gilt Regel A (#294): nur Mappen, die der Benutzer
    // in mindestens einer Sicht mit Recht E sehen würde; die übrigen werden ausgelassen und gezählt.
    let ausgelassen = 0;
    if (!sicht && !z.admin) {
      const erlaubt = await this.exportierbar(ich, z, ids);
      ausgelassen = ids.length - erlaubt.size;
      ids = ids.filter((id) => erlaubt.has(id));
      if (!ids.length) throw new Fachfehler(403, 'Du darfst keine dieser Mappen exportieren. Exportieren ist nur aus Ansichten erlaubt, für die du das Recht dazu hast.');
    }
    const mappen = (await this.repo.holeMappen(ids)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const typen = [...new Set(mappen.map((m) => m.typId))].map((t) => z.typen.get(t)).filter((t): t is Mappentyp => !!t);
    const spalten = exportSpalten(typen, x.spalten === 'alle' ? 'alle' : 'liste', sicht?.trefferliste ?? null);
    const verweise = mappen.flatMap((m) => { const t = z.typen.get(m.typId); return [...(t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v); });
    const bezuege = await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(verweise)]));
    const quelle = { typen: z.typen, titel: (id: string | null | undefined) => (id ? bezuege[id]?.titel || NICHT_SICHTBAR : '') };
    const titel = sicht?.name ?? (q.sicht === 'suche' ? 'Suche' : typen[0]?.name) ?? 'Export';
    const datei = `${sichererName(titel, 60)} ${new Date().toISOString().slice(0, 10)}`;
    const tabelle = () => {
      const kopf = spalten.map((k) => spaltenKopf(k, typen));
      const zeilen = mappen.map((m) => zeile(m, spalten, quelle));
      return { kopf, text: zeilen.map((r) => r.text), werte: zeilen.map((r) => r.werte) };
    };
    if (format === 'csv') { const t = tabelle(); const b = csvAus(t.kopf, t.text); return { name: `${datei}.csv`, mime: 'text/csv; charset=utf-8', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    if (format === 'xlsx') { const t = tabelle(); const b = xlsxAus(titel, t.kopf, t.werte); return { name: `${datei}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen }; }
    // Dokumente aller Mappen in einem Zugriff (#367).
    const dokJe = (format === 'pdf' || format === 'zip') ? await this.dokumenteJeMappe(mappen.map((m) => m.id)) : new Map<string, Dokument[]>();
    // Stempel (#394): je Mappe, weil die Pflicht am Mappentyp hängt. Nur PDFs und Bilder werden gestempelt.
    const wunsch = wunschAus(x.stempel);
    const stempelDaten = await this.stempelDaten();
    const plaene = new Map<string, GeltenderStempel>();
    for (const m of mappen) {
      if (!(dokJe.get(m.id) ?? []).length) continue;
      const p = await this.stempelPlan(m.typId, wunsch, '', stempelDaten);
      if (p) plaene.set(m.id, p);
    }
    // Verkleinert exportieren (#393): PDFs als verkleinerte Kopie, vor dem Stempeln.
    const klein = stufeAus(x.verkleinern);
    const wie = format === 'pdf' ? 'als PDF exportiert' : 'als ZIP exportiert';
    const gestempelt = new Map<string, Ausgabe[]>();
    const ausgabe = async (m: Mappe, d: Dokument, streng: boolean): Promise<Ausgabe> => {
      const a = await fuerAusgabe({ name: d.name, mime: d.mime, inhalt: await this.liesGanz(d.sha256) }, { stempel: plaene.get(m.id), verkleinern: klein },
        { benutzer: ich.name ?? '', mappe: m.titel || 'Ohne Titel', archivnummer: d.archivnummer }, streng);
      gestempelt.set(m.id, [...(gestempelt.get(m.id) ?? []), a]);
      return a;
    };
    const historie = async () => { for (const [id, a] of gestempelt) await this.notiereWeitergabe(id, ich.id, wie, plaene.get(id) ?? null, a); };
    const bearbeiten = (m: Mappe) => plaene.has(m.id) || (!!klein && (dokJe.get(m.id) ?? []).some((d) => d.mime === 'application/pdf'));
    if (format === 'pdf') {
      const b = await mappenPdf(titel, await Promise.all(mappen.map(async (m) => {
        const docs = dokJe.get(m.id) ?? [];
        const mitStempel = plaene.has(m.id);
        const mitAusgabe = bearbeiten(m);
        // Gestempelte Bilder kommen als PDF zurück und werden darum wie PDFs eingebunden.
        return {
          mappe: m, typ: z.typen.get(m.typId),
          dokumente: mitStempel ? docs.map((d) => (kannStempeln(d.mime) ? { ...d, mime: 'application/pdf' } : d)) : docs,
          inhalt: async (d: Dokument) => {
            if (!mitAusgabe) return this.liesGanz(d.sha256);
            const original = docs.find((y) => y.id === d.id)!;
            return (await ausgabe(m, original, false)).inhalt;
          },
        };
      })), quelle, x.uebersicht === true ? { spalten, typen } : null);
      await historie();
      return { name: `${datei}.pdf`, mime: 'application/pdf', inhalt: b, groesse: b.length, mappen: mappen.length, ausgelassen };
    }
    // ZIP: Tabelle als Excel und CSV, je Mappe ein Ordner mit ihren Dokumenten.
    const t = tabelle();
    const eintraege: ZipEintrag[] = [
      { name: 'Mappen.xlsx', daten: xlsxAus(titel, t.kopf, t.werte) }, { name: 'Mappen.csv', daten: csvAus(t.kopf, t.text) },
    ].map((d) => ({ name: d.name, groesse: d.daten.length, inhalt: async () => d.daten }));
    const ordner = eindeutig(mappen.map((m) => sichererName(m.titel || 'Ohne Titel')));
    for (const [i, m] of mappen.entries()) {
      const docs = dokJe.get(m.id) ?? [];
      // Gestempelte Kopien entstehen vorab: das ZIP braucht die Größen im Voraus.
      const aus = bearbeiten(m) ? await Promise.all(docs.map((d) => ausgabe(m, d, false))) : null;
      const namen = eindeutig(docs.map((d, j) => sichererName(aus?.[j].name ?? d.name, 120)));
      docs.forEach((d, j) => {
        const a = aus?.[j];
        eintraege.push(a ? { name: `${ordner[i]}/${namen[j]}`, groesse: a.inhalt.length, inhalt: async () => a.inhalt } : { name: `${ordner[i]}/${namen[j]}`, groesse: d.groesse, inhalt: () => this.dateien.lies(d.sha256) });
      });
    }
    const groesse = zipGroesse(eintraege);
    if (groesse > ZIP_MAX) throw new Fachfehler(422, 'Der Export wäre größer als 4 GB. Bitte weniger Mappen auswählen.');
    await historie();
    return { name: `${datei}.zip`, mime: 'application/zip', inhalt: zipStrom(eintraege), groesse, mappen: mappen.length, ausgelassen };
  }

  /** Dokumente mehrerer Mappen mit einem Zugriff je 500 Mappen (#367), je Mappe neueste zuerst. */
  private async dokumenteJeMappe(ids: string[]): Promise<Map<string, Dokument[]>> {
    const r = new Map<string, Dokument[]>();
    for (let i = 0; i < ids.length; i += 500) {
      for (const d of await this.repo.dokumenteVon(ids.slice(i, i + 500))) { const l = r.get(d.mappeId); if (l) l.push(d); else r.set(d.mappeId, [d]); }
    }
    return r;
  }

  /**
   * Exportrecht ohne Sicht (#294, Regel A): welche dieser Mappen der Benutzer in mindestens einer Sicht
   * mit den Rechten R und E sehen würde (einschließlich Untersichten, ohne verborgene). Administratoren: alle.
   */
  async exportierbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> {
    if (z.admin) return new Set(ids);
    const alle = await this.repo.listeSichten();
    const rechte = alleSichtRechte(alle, z.wer, false);
    const verborgen = this.verborgeneSichten(alle, z);
    const a = await this.aufloesung(ich.id);
    const klauseln = alle.filter((s) => rechte.get(s.id)?.R && rechte.get(s.id)?.E)
      .flatMap((s) => klauselnFuer(alle, s.id, z.typen, a, verborgen));
    return klauseln.length ? this.repo.inKlauseln(ids, klauseln) : new Set();
  }

  /** Alle Treffer einer Sicht mit Suche (#149): nur die Ids der lesbaren Mappen, höchstens MAX_AUSWAHL. */
  async trefferIds(ich: { id: string; rolle: string }, q: Parameters<Dienst['seite']>[1], z?: Zugriff): Promise<{ ids: string[]; gesamt: number }> {
    const s = await this.seite(ich, { ...q, von: 0, anzahl: MAX_AUSWAHL }, z, MAX_AUSWAHL);
    return { ids: s.mappen.filter((m) => !m.verborgen).map((m) => m.id), gesamt: s.gesamt };
  }

  /**
   * Mehrere Mappen löschen (#150): je Mappe das Recht D am Mappentyp; Verweise innerhalb der Auswahl halten
   * nicht auf. `probe`: nur zählen, nichts löschen. Was nicht geht, steht mit Grund in `ausgelassen`.
   */
  async loescheMappen(e: unknown, benutzerId: string, z: Zugriff): Promise<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }> {
    const x = (e ?? {}) as { ids?: unknown; probe?: unknown };
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, 'Keine Mappen ausgewählt.');
    if (ids.length > MAX_AUSWAHL) throw new Fachfehler(422, `Höchstens ${MAX_AUSWAHL.toLocaleString('de-DE')} Mappen auf einmal.`);
    const auswahl = new Set(ids);
    const ausgelassen: Array<{ id: string; titel: string; grund: string }> = [];
    const kandidaten: Mappe[] = [];
    let dokumente = 0;
    for (const id of ids) {
      const m = await this.repo.holeMappe(id);
      if (!m) { ausgelassen.push({ id, titel: '', grund: 'gibt es nicht mehr' }); continue; }
      const r = await this.rechteAn(z, m);
      if (!r.R) { ausgelassen.push({ id, titel: NICHT_SICHTBAR, grund: 'nicht sichtbar' }); continue; }
      if (!r.D) { ausgelassen.push({ id, titel: m.titel ?? '', grund: 'kein Recht zum Löschen' }); continue; }
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), (await this.repo.rueckverweise(id)).filter((v) => !auswahl.has(v.quelleId)));
      if (!p.ok) { ausgelassen.push({ id, titel: m.titel ?? '', grund: p.fremd.length ? 'es wird noch auf sie verwiesen' : p.grund }); continue; }
      kandidaten.push(m);
      dokumente += (await this.repo.listeDokumente(id)).length;
    }
    if (x.probe === true) return { mappen: kandidaten.length, dokumente, geloescht: 0, ausgelassen };
    // Verweise innerhalb der Auswahl: in Runden, bis keine Mappe mehr dazukommt.
    let offen = kandidaten;
    let geloescht = 0;
    while (offen.length) {
      const rest: Mappe[] = [];
      for (const m of offen) {
        try { await this.loescheMappe(m.id, benutzerId, z); geloescht++; }
        catch (err) {
          if (err instanceof Fachfehler && err.status === 409) rest.push(m);
          else ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: (err as Error).message });
        }
      }
      if (rest.length === offen.length) { for (const m of rest) ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: 'es wird noch auf sie verwiesen' }); break; }
      offen = rest;
    }
    return { mappen: kandidaten.length, dokumente, geloescht, ausgelassen };
  }

  async loescheMappe(id: string, benutzerId: string | null = null, z?: Zugriff): Promise<void> {
    if (z) await this.pruefeRecht(z, id, 'D');
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const p = await this.loeschPruefung(m, typ, await this.repo.rueckverweise(id));
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const { zuordnungen, emails, benutzerTyp, emailTyp } = p;
    for (const z of zuordnungen) {
      const b = await this.repo.holeMappe(z.quelleId);
      if (b) await this.schreibeSystemMappe(benutzerTyp!, b.id, { ...b.werte, rollen: alsListe(b.werte.rollen).filter((r) => r !== id) }, benutzerId);
    }
    for (const e of emails) {
      const x = await this.repo.holeMappe(e.quelleId);
      if (x) await this.schreibeSystemMappe(emailTyp!, x.id, { ...x.werte, bezug: alsListe(x.werte.bezug).filter((b) => b !== id) }, benutzerId);
    }
    if (await this.papierkorbTage() > 0) await this.legeInPapierkorb(id, typ, benutzerId);
    else await this.loescheMappeIntern(id, typ, benutzerId);
  }

  /** In den Papierkorb (#43): eindeutige Werte werden frei, Dateien bleiben bis zum Leeren. */
  private async legeInPapierkorb(id: string, typ: Mappentyp | undefined, von: string | null) {
    await this.repo.legeInPapierkorb(id, von);
    await this.notiere(id, von, 'papierkorb');
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
  }

  private async loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) {
    const dokumente = await this.repo.listeDokumente(id);
    await this.repo.loescheMappe(id);
    await this.notiere(id, von, 'endgueltig');
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }

  /* ---------- Systemtypen: Benutzer und Rollen (#26, #27) ---------- */

  private sichern?: Promise<{ benutzer: Mappentyp; rolle: Mappentyp; post: Mappentyp; systemrollen: Map<Rolle, string> }>;

  /**
   * Legt die Systemtypen „Benutzer“ und „Rolle“ und die Systemrollen an, falls sie fehlen.
   * Läuft beim Start und vor jedem Spiegeln; gleichzeitige Aufrufe teilen sich einen Lauf.
   */
  sichereSystem() {
    this.sichern ??= this.sichereSystemJetzt().catch((e) => { this.sichern = undefined; throw e; });
    return this.sichern.then(async (s) => ({
      // Definitionen können sich seitdem geändert haben (Felder ergänzt, umbenannt).
      benutzer: (await this.repo.holeTyp(s.benutzer.id)) ?? s.benutzer,
      rolle: (await this.repo.holeTyp(s.rolle.id)) ?? s.rolle,
      post: (await this.repo.holeTyp(s.post.id)) ?? s.post,
      systemrollen: s.systemrollen,
    }));
  }

  /**
   * Ablageort (#168): ein normaler Mappentyp, den jede Installation hat – für den Verbleib von
   * Originalen („zu Hause › Arbeitszimmer › roter Ordner“). Erweiterbar und umbenennbar, aber nicht
   * löschbar, weil Pakete und Beispiele darauf verweisen. Gemerkt wird er über seine Id in den
   * Einstellungen (ohne Einstellungen, z. B. in Tests: über die Kennung `ablageort`).
   */
  async ablageortTyp(): Promise<Mappentyp | undefined> {
    await this.sichereSystem();
    const id = await this.ablageortId();
    return id ? this.repo.holeTyp(id) : undefined;
  }

  private async ablageortId(): Promise<string | undefined> {
    const merk = (await this.einstellungen?.lies('ablageort')) as { id?: string } | null | undefined;
    if (merk?.id) return merk.id;
    return (await this.repo.listeTypen()).find((t) => !t.system && t.schluessel === 'ablageort')?.id;
  }

  private async sichereAblageort(): Promise<void> {
    const vorhanden = await this.ablageortId();
    if (vorhanden && (await this.repo.holeTyp(vorhanden))) {
      // Schon da (oder ein eigener Mappentyp mit der Kennung „ablageort“): nur merken.
      if (this.einstellungen && !(await this.einstellungen.lies('ablageort'))) await this.einstellungen.schreibe('ablageort', { id: vorhanden });
      return;
    }
    const typen = await this.repo.listeTypen();
    const id = randomUUID();
    const name = typen.some((t) => t.name.trim().toLowerCase() === 'ablageort') ? 'Ablageort (Standard)' : 'Ablageort';
    const t = await this.repo.legeTypAn(id, {
      name, schluessel: freierSchluessel('ablageort', typen.map((x) => x.schluessel ?? '')),
      beschreibung: 'Wo Originale liegen – verschachtelt, z. B. zu Hause › Arbeitszimmer Schrank › roter Ordner',
      titelVorlage: '{liegt_in} › {name}',
      felder: [
        { key: 'name', label: 'Name', typ: 'text', pflicht: true, maxLen: 120, hilfe: 'z. B. roter Ordner, Safe im Flur, beim Notar, vernichtet' },
        { key: 'liegt_in', label: 'Liegt in', typ: 'referenz', zielTyp: id, verweisart: 'zugehoerigkeit', hilfe: 'Der Ort, in dem dieser Ort liegt – z. B. der Schrank, in dem der Ordner steht. Leer lassen für ganz oben.' },
        { key: 'beschreibung', label: 'Beschreibung', typ: 'langtext', maxLen: 2000 },
      ],
      register: [
        { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name', 'liegt_in', 'beschreibung'] },
        { key: 'enthaelt', name: 'Enthält', art: 'verknuepfungen', quellen: [{ typId: id, feldKey: 'liegt_in' }] },
        { key: 'liegt_hier', name: 'Liegt hier', art: 'verknuepfungen', quellen: [] },
        { key: 'fotos', name: 'Fotos', art: 'dokumente' },
      ],
      trefferliste: ['_titel', 'beschreibung'], erstellenErlaubt: true, loeschenErlaubt: true,
    });
    await this.sichtFuerTyp(t);
    await this.einstellungen?.schreibe('ablageort', { id: t.id });
    protokoll.modul('werkbank').info('Mappentyp Ablageort angelegt', { typ: t.name });
  }

  private async sichereSystemJetzt() {
    const typen = await this.repo.listeTypen();
    let rolle = typen.find((t) => t.system === 'rolle');
    let benutzer = typen.find((t) => t.system === 'benutzer');
    let post = typen.find((t) => t.system === 'post');
    const frei = (name: string) => (typen.some((t) => t.name.trim().toLowerCase() === name.toLowerCase()) ? `${name} (System)` : name);
    // Feste Schlüssel der Systemtypen (#145): benutzer, rolle, post.
    const sk = (k: string) => freierSchluessel(k, typen.map((t) => t.schluessel ?? ''));
    const ids = { rolle: rolle?.id ?? randomUUID(), benutzer: benutzer?.id ?? randomUUID() };
    if (!rolle) {
      rolle = await this.repo.legeTypAn(ids.rolle, {
        name: frei('Rolle'), schluessel: sk('rolle'), beschreibung: 'Rollen, die Benutzer haben, z. B. als Verantwortliche', titelVorlage: '{name}',
        felder: systemfelder('rolle', ids.rolle),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
          { key: 'benutzer', name: 'Benutzer', art: 'verknuepfungen', quellen: [{ typId: ids.benutzer, feldKey: 'rollen' }] },
        ],
        trefferliste: [], erstellenErlaubt: true, loeschenErlaubt: true,
      }, 'rolle');
      await this.sichtFuerTyp(rolle);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: rolle.name });
    }
    if (!benutzer) {
      benutzer = await this.repo.legeTypAn(ids.benutzer, {
        name: frei('Benutzer'), schluessel: sk('benutzer'), beschreibung: 'Die Benutzer dieses DMS; gepflegt in der Benutzerverwaltung', titelVorlage: '{name}',
        felder: systemfelder('benutzer', rolle.id, ids.benutzer),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name', 'email', 'rollen', 'aktiv', 'abwesend', 'abwesend_von', 'abwesend_bis', 'vertreter'] },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
          { key: 'verknuepfungen', name: 'Verknüpfungen', art: 'verknuepfungen', quellen: [] },
        ],
        trefferliste: ['name', 'email', 'rollen', 'aktiv'], erstellenErlaubt: false, loeschenErlaubt: false,
      }, 'benutzer');
      await this.sichtFuerTyp(benutzer);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: benutzer.name });
    }
    if (!post) {
      // Post (#192): alles, was hinein- oder hinausgeht; ersetzt den früheren Typ E-Mail (#58).
      post = await this.repo.legeTypAn(randomUUID(), {
        name: frei('Post'), schluessel: sk('post'), beschreibung: POST_BESCHREIBUNG, titelVorlage: '{betreff}',
        felder: systemfelder('post', rolle.id, benutzer.id),
        register: [
          { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: systemfelder('post', rolle.id, benutzer.id).map((f) => f.key) },
          { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
          { key: 'protokoll', name: 'Historie', art: 'protokoll' },
        ],
        trefferliste: POST_SPALTEN, erstellenErlaubt: false, loeschenErlaubt: true,
      }, 'post');
      await this.sichtFuerTyp(post);
      protokoll.modul('werkbank').info('Systemmappentyp angelegt', { typ: post.name });
    }
    post = await this.wandleZuPost(post, rolle.id, benutzer.id);
    await this.sicherePostSichten(post);
    benutzer = await this.ergaenzeSystemfelder(benutzer, rolle.id);
    const systemrollen = new Map<Rolle, string>();
    for (const r of Object.keys(ROLLEN) as Rolle[]) {
      const kennung = systemrolleKennung(r);
      let m = await this.repo.holeSystemMappe(kennung);
      if (!m) {
        const name = (await this.repo.findeDoppelt(rolle.id, 'name', ROLLEN[r])) ? `${ROLLEN[r]} (System)` : ROLLEN[r];
        m = await this.schreibeSystemMappe(rolle, randomUUID(), { name }, null, kennung);
      }
      systemrollen.set(r, m.id);
    }
    await this.sichereAblageort();
    return { benutzer, rolle, post, systemrollen };
  }

  /**
   * Aus dem früheren Typ E-Mail (#58) wird Post (#192). Die Migration 031 hat Kennung, Schlüssel und
   * Werte umgestellt; hier folgt die Definition: Systemfelder mit ihrer festen Form (z. B. „Zugeordnet zu“
   * mehrfach), neue Felder, Name und Register, solange der Administrator sie nicht geändert hat.
   * Läuft bei jedem Start und ändert nur, was noch nicht passt.
   */
  private async wandleZuPost(t: Mappentyp, rolleId: string, benutzerId: string): Promise<Mappentyp> {
    const soll = systemfelder('post', rolleId, benutzerId);
    // Alte Standardbezeichnungen weichen den neuen; eigene des Administrators bleiben.
    const alteNamen: Record<string, string[]> = { an: ['An'], bezug: ['Bezug'] };
    const alteHilfen = ['Wer die E-Mail verschickt hat; Antworten gehen an diese Adresse', 'Die Mappe, aus der die E-Mail verschickt wurde'];
    let geaendert = false;
    const felder = t.felder.map((f) => {
      const s = soll.find((x) => x.key === f.key);
      if (!s || !f.system) return f;
      const label = alteNamen[f.key]?.includes(f.label) ? s.label : f.label || s.label;
      const hilfe = !f.hilfe || alteHilfen.includes(f.hilfe) ? s.hilfe : f.hilfe;
      const neu: Feld = { ...s, label, ...(hilfe ? { hilfe } : {}) };
      if (!hilfe) delete neu.hilfe;
      if (JSON.stringify(neu) !== JSON.stringify(f)) geaendert = true;
      return neu;
    });
    const altName = t.name === 'E-Mail' || t.name === 'E-Mail (System)';
    const register = t.register.map((r) => (r.art === 'dokumente' && r.name === 'Anhänge' ? { ...r, name: 'Dokumente' } : r));
    const altListe = JSON.stringify(standardliste(t).spalten) === JSON.stringify(['datum', 'an', 'bezug']);
    if (geaendert || altName || JSON.stringify(register) !== JSON.stringify(t.register) || altListe || t.beschreibung === 'Aus dem DMS verschickte E-Mails mit Anhängen') {
      const typen = await this.repo.listeTypen();
      const name = altName ? (typen.some((x) => x.id !== t.id && x.name.trim().toLowerCase() === 'post') ? 'Post (System)' : 'Post') : t.name;
      const beschreibung = t.beschreibung === 'Aus dem DMS verschickte E-Mails mit Anhängen' ? POST_BESCHREIBUNG : t.beschreibung;
      const trefferlisten = altListe ? trefferlistenVon(t).map((l) => (l.standard ? { ...l, spalten: POST_SPALTEN } : l)) : trefferlistenVon(t);
      t = await this.repo.aendereTyp(t.id, { ...t, name, beschreibung, felder, register, trefferlisten, trefferliste: undefined });
      protokoll.modul('werkbank').info('Systemmappentyp Post nachgezogen', { typ: t.name });
    }
    // Neue Systemfelder (Stand, Kanal, Richtung, Für) ergänzen – wie bei jedem Systemtyp.
    return this.ergaenzeSystemfelder(t, rolleId, benutzerId);
  }

  /**
   * Sichten für Post (#192), einmal angelegt: „Neue Post“ ganz oben (Stand „Neu“), unter „Post“
   * „Eingegangen“ und „Versendet“. Löscht der Administrator sie, kommen sie nicht wieder.
   */
  private async sicherePostSichten(post: Mappentyp) {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { sichten?: boolean; neu?: string } | null) : null;
    if (merk?.sichten) return;
    const alle = await this.repo.listeSichten();
    const typSicht = alle.find((s) => s.id === post.id);
    if (typSicht && (typSicht.name === 'E-Mail' || typSicht.name === 'E-Mail (System)')) {
      await this.repo.aendereSicht(typSicht.id, { ...typSicht, name: post.name, beschreibung: post.beschreibung });
    }
    const bed = (feld: string, wert: string) => [{ art: 'feld' as const, feld, op: 'einerVon' as const, wert: { art: 'fest' as const, wert: [wert] } }];
    let neu = alle.find((s) => s.typen.length === 1 && s.typen[0] === post.id && s.bedingungen.some((b) => b.art === 'feld' && b.feld === 'stand'));
    if (!neu) {
      const oben = kinderVon(alle, null).map((s) => s.position);
      neu = await this.repo.legeSichtAn(randomUUID(), {
        name: 'Neue Post', beschreibung: 'Post, die noch niemand zugeordnet oder erledigt hat', elternId: null,
        position: Math.min(10, ...oben) - 10, typen: [post.id], bedingungen: bed('stand', POST_STAND.neu),
      });
    }
    if (typSicht && !kinderVon(alle, typSicht.id).length) {
      await this.repo.legeSichtAn(randomUUID(), { name: 'Eingegangen', beschreibung: 'Post, die ins DMS gekommen ist', elternId: typSicht.id, position: 10, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.eingehend) });
      await this.repo.legeSichtAn(randomUUID(), { name: 'Versendet', beschreibung: 'Aus dem DMS verschickte E-Mails', elternId: typSicht.id, position: 20, typen: [post.id], bedingungen: bed('richtung', POST_RICHTUNG.ausgehend) });
    }
    await this.einstellungen?.schreibe('post', { sichten: true, neu: neu.id });
    protokoll.modul('werkbank').info('Ansichten für Post angelegt', { neu: neu.id });
  }

  /** Id der Sicht „Neue Post“ (#192), damit die Oberfläche ihre Zahl hervorhebt. */
  async neuePostSicht(): Promise<string | null> {
    const merk = this.einstellungen ? ((await this.einstellungen.lies('post')) as { neu?: string } | null) : null;
    const alle = await this.repo.listeSichten();
    return alle.find((s) => s.id === merk?.neu)?.id ?? null;
  }

  /* ---------- Post (#192) ---------- */

  /**
   * Neue Post anlegen (Oberfläche „+ Post“, API): Stand Neu, eingehend, heute. Die Dokumente kommen
   * danach über das Hochladen ins Dokumentenregister. Ob man Post anlegen darf, regeln die Berechtigungen.
   */
  /**
   * Post anlegen. `ich.id` null: kein echter Benutzer, sondern ein Eingangskanal (#195: „Eingangsordner“);
   * `herkunft` steht dann als eigener Eintrag in der Historie.
   * `alt` (Teilen, #445): Werte der Ausgangspost – Verweise, die dort schon stehen (z. B. „Für“), gelten nicht als neu.
   */
  async legePostAn(eingabe: unknown, ich: { id: string | null; name: string }, z?: Zugriff, kanal: string = POST_KANAL.hochgeladen, herkunft?: Historieneintrag['daten'], id: string = randomUUID(), alt: Werte = {}): Promise<Mappe> {
    const { post: typ } = await this.sichereSystem();
    if (!darfPostAnlegen(typ)) throw new Fachfehler(403, 'Post lässt sich nicht anlegen.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const betreff = text(e.betreff).replace(/[\r\n]+/g, ' ').trim().slice(0, 250) || 'Neue Post';
    const datum = istDatum(text(e.datum)) ? text(e.datum) : heuteIn();
    const werte = bereinigeWerte(typ, {
      ...(e.werte && typeof e.werte === 'object' ? e.werte as Record<string, unknown> : {}),
      betreff, datum, kanal: Object.values(POST_KANAL).includes(text(e.kanal) as never) ? text(e.kanal) : kanal,
      richtung: POST_RICHTUNG.eingehend, stand: POST_STAND.neu,
      absender: text(e.absender).slice(0, 250) || ich.name || null, bezug: null,
      ...(e.fuer !== undefined ? { fuer: e.fuer || null } : {}), ...(typeof e.nachricht === 'string' ? { nachricht: e.nachricht.slice(0, NOTIZ_MAX) } : {}),
    }, {}, this.verschluessele);
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: ich.id, geaendert: new Date().toISOString(), geaendertVon: ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, 'Post anlegen darfst du nicht.');
    }
    await this.pruefeVerweisziele(z, typ, werte, alt);
    await this.pruefeWerte(typ, werte);
    // Vorgegebene Id (#196): Eingangskanäle merken sie sich vorher und erkennen nach einem Absturz, dass es die Post schon gibt.
    // Post samt Historie, Aufgabe und Ereignis in einer Transaktion (#404).
    const { m, titel } = await this.inTransaktion(async () => {
      const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), ich.id);
      await this.notiere(m.id, ich.id, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, werte), ...(ich.id ? {} : { system: ich.name }) });
      if (herkunft) await this.notiere(m.id, null, 'uebernommen', { system: ich.name, ...herkunft });
      const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
      await this.postAufgaben(m.id, ich.id);
      await this.melde('post.angelegt', { mappe: m.id, kanal: werte.kanal }, undefined, ich.id);
      return { m, titel };
    });
    protokoll.modul('ablage').info('Post angelegt', { mappe: m.id, kanal: werte.kanal });
    return { ...m, titel };
  }

  /**
   * Zuordnen (#192): Post gehört zu einer Mappe. Die gewählten Dokumente wandern in ein
   * Dokumentenregister der Zielmappe (oder werden kopiert – dieselbe Datei, kein zweiter Platz),
   * die Post verweist auf die Mappe und hat danach Stand „Zugeordnet“. Mehrmals möglich.
   */
  async ordneZu(postId: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const post = z ? await this.pruefeRecht(z, postId, 'U') : await this.repo.holeMappe(postId);
    if (!post) throw new Fachfehler(404, 'Diese Post gibt es nicht.');
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(422, 'Zuordnen geht nur mit Post.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const zielId = text(e.ziel);
    if (!istUuid(zielId) || zielId === postId) throw new Fachfehler(422, 'Bitte eine Mappe wählen, zu der die Post gehört.');
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, 'Die gewählte Mappe gibt es nicht.');
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    if (!zielTyp) throw new Fachfehler(500, 'Der Mappentyp der Zielmappe fehlt.');
    if (zielTyp.system === 'post') throw new Fachfehler(422, 'Post lässt sich nicht anderer Post zuordnen.');
    const alle = await this.repo.listeDokumente(postId);
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : alle.map((d) => d.id);
    const dokumente = ids.map((id) => alle.find((d) => d.id === id));
    if (dokumente.some((d) => !d)) throw new Fachfehler(422, 'Ein ausgewähltes Dokument gehört nicht (mehr) zu dieser Post.');
    const regs = zielTyp.register.filter((r) => r.art === 'dokumente');
    const reg = regs.find((r) => r.key === text(e.register)) ?? (e.register ? undefined : regs[0]);
    if (dokumente.length && !reg) throw new Fachfehler(422, regs.length ? 'Dieses Dokumentenregister gibt es an der Zielmappe nicht.' : `„${zielTyp.name}“ hat kein Dokumentenregister. Ordne ohne Dokumente zu oder wähle eine andere Mappe.`);
    const kopieren = e.kopieren === true;
    for (const d of dokumente as Dokument[]) {
      if (kopieren) {
        const neu = await this.repo.legeDokumentAn({ ...d, id: randomUUID(), mappeId: ziel.id, registerKey: reg!.key, erstellt: new Date().toISOString(), erstelltVon: von });
        const fertig = await this.repo.ocrVonSha(d.sha256, neu.id);
        if (fertig) await this.repo.ocrSetze(neu.id, { stand: 'fertig', text: fertig.text, seiten: fertig.seiten, info: fertig.info });
        else if (Dienst.volltextAn(zielTyp, reg!.key)) { await this.repo.ocrEinreihen([neu.id]); this.ocr?.anstossen(); }
      } else {
        await this.repo.verschiebeDokument(d.id, ziel.id, reg!.key);
        // Im neuen Register ist die Texterkennung vielleicht aus oder an.
        if (Dienst.volltextAn(zielTyp, reg!.key) && (d.ocr?.stand === 'keiner' || d.ocr?.stand === 'ausgelassen')) { await this.repo.ocrEinreihen([d.id]); this.ocr?.anstossen(); }
      }
    }
    const betreff = auswahlText(post.werte.betreff) || 'Post';
    const zielTitel = await this.titel(ziel);
    const n = dokumente.length;
    const doks = n ? ` mit ${n} ${n === 1 ? 'Dokument' : 'Dokumenten'}${kopieren ? ' (kopiert)' : ''} ins Register „${reg!.name}“` : '';
    const bezug = [...new Set([...alsListe(post.werte.bezug), ziel.id])];
    await this.schreibeSystemMappe(typ, post.id, { ...post.werte, bezug, stand: POST_STAND.zugeordnet }, von);
    await this.notiere(post.id, von, 'zugeordnet', { text: `zugeordnet zu „${zielTitel}“${doks}`, ziel: ziel.id, zielTyp: ziel.typId, dokumente: n, kopiert: kopieren });
    await this.notiere(ziel.id, von, 'zugeordnet', { text: `Post „${betreff}“ zugeordnet${doks}`, post: post.id, postTyp: typ.id, dokumente: n, kopiert: kopieren });
    if (n) {
      await this.beruehre(ziel.id, zielTyp, von);
      await this.beruehre(post.id, typ, von);
    }
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post zugeordnet', { post: post.id, ziel: ziel.id, dokumente: n, kopiert: kopieren });
    return { post: (await this.repo.holeMappe(post.id))!, ziel: (await this.repo.holeMappe(ziel.id))! };
  }

  /**
   * „Für“ (#192): Solange Post neu ist und jemandem gilt, hat dieser eine Aufgabe „Neue Post“ im Eingang
   * (bei Abwesenheit sein Vertreter). Zugeordnet, erledigt oder an jemand anderen → die Aufgabe ist erledigt.
   */
  private async postAufgaben(mappeId: string, von: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'post');
    const fuer = m && auswahlText(m.werte.stand) === POST_STAND.neu ? alsListe(m.werte.fuer)[0] ?? null : null;
    const schluessel = fuer ? `fuer:${fuer}` : null;
    for (const a of offen) if (a.feldKey !== schluessel) await this.repo.erledigeAufgabe(a.id, von);
    if (!fuer || offen.some((a) => a.feldKey === schluessel)) return;
    // Aufgaben gehen an Konten; ohne Kontenverwaltung (Tests) genügt der Verweis.
    if (this.konten?.benutzer && !(await this.konten.benutzer()).some((b) => b.id === fuer)) return;
    const a = await this.repo.legeAufgabeAn({
      id: randomUUID(), mappeId, empfaengerId: fuer, art: 'post', text: 'Post für dich', feldKey: schluessel,
      erstellt: new Date().toISOString(), erstelltVon: von, erledigt: null, erledigtVon: null,
    });
    await this.leiteUm(a);
  }

  /**
   * Neue Systemfelder einer Version (z. B. Abwesenheit, #78) in einen vorhandenen Systemtyp aufnehmen.
   * Hat der Administrator schon ein eigenes Feld mit diesem Schlüssel, wird seines umbenannt
   * (z. B. vertreter → vertreter_alt) – samt Werten, Register, Trefferlisten und Titel-Vorlage.
   */
  private async ergaenzeSystemfelder(t: Mappentyp, rolleId: string, benutzerId = t.id): Promise<Mappentyp> {
    if (!t.system) return t;
    const soll = systemfelder(t.system, rolleId, benutzerId);
    const fehlen = soll.filter((x) => !t.felder.some((f) => f.key === x.key && f.system));
    if (!fehlen.length) return t;
    const felder = [...t.felder];
    const register = structuredClone(t.register);
    let trefferlisten = trefferlistenVon(t);
    let titelVorlage = t.titelVorlage;
    const umbenannt: Array<[string, string]> = [];
    for (const x of fehlen) {
      const i = felder.findIndex((f) => f.key === x.key);
      if (i >= 0) {
        let neu = `${x.key}_alt`;
        for (let n = 2; felder.some((f) => f.key === neu); n++) neu = `${x.key}_alt${n}`;
        felder[i] = { ...felder[i], key: neu };
        for (const r of register) if (r.felder) r.felder = r.felder.map((k) => (k === x.key ? neu : k));
        trefferlisten = trefferlisten.map((l) => ({ ...l, spalten: l.spalten.map((k) => (k === x.key ? neu : k)) }));
        titelVorlage = titelVorlage.replace(new RegExp(`\\{${x.key}(?=[|}])`, 'g'), `{${neu}`);
        umbenannt.push([x.key, neu]);
      }
      felder.push(x);
      const allgemein = register.find((r) => r.art === 'felder');
      if (allgemein) allgemein.felder = [...(allgemein.felder ?? []), x.key];
    }
    const neuTyp = await this.repo.aendereTyp(t.id, { ...t, felder, register, trefferlisten, trefferliste: undefined, titelVorlage });
    if (umbenannt.length) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const werte = { ...m.werte };
        for (const [alt, neu] of umbenannt) if (alt in werte) { werte[neu] = werte[alt]; delete werte[alt]; }
        await this.repo.aendereMappe(m.id, werte, verweiseVon(neuTyp, werte), null);
      }
      protokoll.modul('werkbank').warn('Eigene Felder wegen neuer Systemfelder umbenannt', { typ: t.name, felder: umbenannt.map(([a, b]) => `${a} → ${b}`).join(', ') });
    }
    protokoll.modul('werkbank').info('Systemfelder ergänzt', { typ: t.name, felder: fehlen.map((f) => f.label).join(', ') });
    return neuTyp;
  }

  /** Schreibt eine Mappe, die das System pflegt – ohne die Sperren der Ablage; Titel und Passung wie sonst. */
  private async schreibeSystemMappe(typ: Mappentyp, id: string, eingabe: Werte, von: string | null, kennung: string | null = null): Promise<Mappe> {
    const alt = await this.repo.holeMappe(id);
    const werte = bereinigeWerte(typ, eingabe, alt?.werte);
    if (alt && JSON.stringify(alt.werte) === JSON.stringify(werte)) return alt;
    const aenderungen = await this.aenderungen(typ, alt?.werte ?? {}, werte);
    if (alt) await this.repo.aendereMappe(id, werte, verweiseVon(typ, werte), von);
    else await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), von, false, kennung);
    if (aenderungen.length) await this.notiere(id, von, alt ? 'geaendert' : 'angelegt', { aenderungen });
    if (alt) await this.passungsAufgaben([{ id, problem: null }]);
    await this.aktualisiereTitel([id]);
    // Hat der Administrator den Typ um Pflichtfelder erweitert, landet die Mappe im Eingang.
    await this.passungFuer(typ, [id]);
    return (await this.repo.holeMappe(id))!;
  }

  /** Mappe eines Benutzers anlegen oder nachziehen. Weitere Rollen bleiben, die Systemrolle folgt dem Konto. */
  async spiegleBenutzer(b: Benutzer, von: string | null = null) {
    // Liegt die Mappe im Papierkorb, bleibt sie dort (der Benutzer ist bis zum Leeren deaktiviert).
    if (await this.repo.holeAusPapierkorb(b.id)) return;
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const alt = await this.repo.holeMappe(b.id);
    const system = new Set(systemrollen.values());
    const weitere = alt ? alsListe(alt.werte.rollen).filter((r) => !system.has(r)) : [];
    const ab = b.abwesenheit;
    // Abwesenheit (#78): „abwesend“ = wirkt heute; Zeitraum nur, solange sie an ist; der Vertreter auch nach dem Deaktivieren.
    await this.schreibeSystemMappe(typ, b.id, {
      ...(alt?.werte ?? {}),
      name: b.name || b.email, email: b.email, rollen: [systemrollen.get(b.rolle)!, ...weitere], aktiv: b.aktiv,
      abwesend: abwesenheitWirkt(ab, heuteIn()),
      abwesend_von: ab?.an ? ab.von : null, abwesend_bis: ab?.an ? ab.bis : null,
      vertreter: ab?.vertreterId && (ab.an || !b.aktiv) ? ab.vertreterId : null,
    }, von);
  }

  /** Beim Start: alle Benutzer haben ihre Mappe, und sie stimmt mit dem Konto überein. */
  async gleicheBenutzerAb(liste: Benutzer[]) {
    await this.sichereSystem();
    for (const b of liste) await this.spiegleBenutzer(b);
  }

  /** Prüft eine Auswahl weiterer Rollen, bevor etwas geändert wird; liefert die bereinigten Ids. */
  async pruefeRollen(eingabe: unknown): Promise<string[]> {
    if (!Array.isArray(eingabe)) throw new Fachfehler(422, 'Rollen als Liste angeben.');
    const ids = [...new Set(eingabe.map(String))];
    const { rolle, systemrollen } = await this.sichereSystem();
    const typVon = await this.repo.typenVon(ids.filter(istUuid));
    if (ids.some((id) => typVon.get(id) !== rolle.id)) throw new Fachfehler(422, 'Mindestens eine dieser Rollen gibt es nicht.');
    const system = new Set(systemrollen.values());
    if (ids.some((id) => system.has(id))) throw new Fachfehler(422, 'Administrator und Mitglied werden über die Rolle des Benutzers vergeben.');
    return ids;
  }

  /** Weitere (fachliche) Rollen eines Benutzers setzen – nur aus der Benutzerverwaltung. */
  async setzeRollen(benutzerId: string, eingabe: unknown, von: string | null = null) {
    const ids = await this.pruefeRollen(eingabe);
    const { benutzer: typ, systemrollen } = await this.sichereSystem();
    const m = await this.repo.holeMappe(benutzerId);
    if (!m || m.typId !== typ.id) throw new Fachfehler(404, 'Diesen Benutzer gibt es nicht.');
    const system = new Set(systemrollen.values());
    const behalten = alsListe(m.werte.rollen).filter((r) => system.has(r));
    await this.schreibeSystemMappe(typ, benutzerId, { ...m.werte, rollen: [...behalten, ...ids] }, von);
  }

  /** Alle Rollen für die Auswahl in der Benutzerverwaltung; Systemrollen zuerst. */
  async listeRollen() {
    const { rolle } = await this.sichereSystem();
    return (await this.repo.listeMappen(rolle.id))
      .map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), system: !!m.systemKennung }))
      .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'de'));
  }

  /** Weitere (nicht System-)Rollen je Benutzer. */
  async weitereRollen(): Promise<Map<string, string[]>> {
    const { benutzer, systemrollen } = await this.sichereSystem();
    const system = new Set(systemrollen.values());
    return new Map((await this.repo.listeMappen(benutzer.id)).map((m) => [m.id, alsListe(m.werte.rollen).filter((r) => !system.has(r))]));
  }

  /** Benutzer werden deaktiviert statt gelöscht; gelöscht wird nur, worauf nichts verweist. */
  async entferneBenutzerMappe(id: string) {
    const m = await this.repo.holeMappe(id);
    if (!m) return;
    const fremd: Rueckverweis[] = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
    if (fremd.length) {
      throw new Fachfehler(409, `Auf diesen Benutzer ${fremd.length === 1 ? 'verweist noch eine Mappe' : `verweisen noch ${fremd.length} Mappen`}. Deaktiviere ihn statt ihn zu löschen.`, { rueckverweise: fremd });
    }
    await this.loescheMappeIntern(id, await this.repo.holeTyp(m.typId));
  }

  benutzerspiegel(): Benutzerspiegel {
    return {
      aktualisiere: (b, von) => this.spiegleBenutzer(b, von ?? null),
      offeneAufgaben: async (id) => (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id).length,
      aufgabenUebergeben: (id, an, von) => this.aufgabenUebergeben(id, an, von),
      abwesenheitGeaendert: (b, alt, von, wegen) => this.abwesenheitGeaendert(b, alt, von, wegen),
      entferne: (id) => this.entferneBenutzerMappe(id),
      papierkorbAn: async () => (await this.papierkorbTage()) > 0,
      inPapierkorb: async (id, von) => {
        const m = await this.repo.holeMappe(id);
        if (!m) return;
        const fremd = (await this.repo.rueckverweise(id)).filter((r) => r.quelleId !== id);
        if (fremd.length) throw new Fachfehler(409, `Auf diesen Benutzer ${fremd.length === 1 ? 'verweist noch eine Mappe' : `verweisen noch ${fremd.length} Mappen`}. Deaktiviere ihn statt ihn zu löschen.`, { rueckverweise: fremd });
        await this.repo.legeInPapierkorb(id, von);
        await this.notiere(id, von, 'papierkorb');
      },
    };
  }

  /* ---------- Papierkorb (#43) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig). */
  async papierkorbTage(): Promise<number> {
    if (!this.einstellungen) return 0;
    const e = (await this.einstellungen.lies('papierkorb')) as { tage?: number } | null;
    return typeof e?.tage === 'number' ? e.tage : PAPIERKORB_STANDARD_TAGE;
  }

  /** Aufbewahrung ändern. 0 schaltet den Papierkorb aus und leert ihn sofort. */
  async setzePapierkorbTage(eingabe: unknown): Promise<{ tage: number; geleert: number }> {
    if (!this.einstellungen) throw new Fachfehler(404, 'Der Papierkorb ist nicht eingerichtet.');
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 3650) throw new Fachfehler(422, 'Bitte eine ganze Zahl von 0 bis 3650 Tagen angeben (0 = kein Papierkorb).');
    await this.einstellungen.schreibe('papierkorb', { tage });
    protokoll.modul('werkbank').info(tage ? 'Aufbewahrung im Papierkorb geändert' : 'Papierkorb ausgeschaltet', { tage });
    const geleert = tage ? await this.raeumePapierkorbAuf() : await this.leere((await this.repo.papierkorb()).map((e) => e.id)) + await this.leereDokumente((await this.repo.papierkorbDokumente()).map((d) => d.id));
    return { tage, geleert };
  }

  /** Ablage: was ich gelöscht habe. Werkbank (alle): was alle gelöscht haben. */
  async papierkorb(ich: { id: string; rolle: string }, alle = false): Promise<PapierkorbEintrag[]> {
    return this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id });
  }

  /**
   * Einzelne Dokumente im Papierkorb (#344), mit Mappe und Register zum Anzeigen.
   * mappe: „da“ (wiederherstellbar), „papierkorb“ (erst die Mappe wiederherstellen) oder „weg“.
   */
  async papierkorbDokumente(ich: { id: string; rolle: string }, alle = false): Promise<DokumentImKorb[]> {
    const liste = await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id });
    return this.mitMappe(liste);
  }

  private async mitMappe(liste: DokumentImPapierkorb[]): Promise<DokumentImKorb[]> {
    if (!liste.length) return [];
    const ids = [...new Set(liste.map((d) => d.mappeId))];
    const bezuege = await this.repo.bezuege(ids);
    const imKorb = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e]));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    return liste.map((d) => {
      const b = bezuege.get(d.mappeId);
      const k = imKorb.get(d.mappeId);
      const typId = b?.typId ?? k?.typId ?? '';
      const typ = typen.get(typId);
      return {
        ...d, art: 'dokument' as const, typId, mappeTitel: b?.titel ?? k?.titel ?? '',
        register: typ?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey,
        mappe: b ? 'da' as const : k ? 'papierkorb' as const : 'weg' as const,
      };
    });
  }

  private async dokEintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeDokumentAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, 'Dieses Dokument liegt nicht (mehr) im Papierkorb.');
    return e;
  }

  /** Dokument zurück in sein Register (#344). Rechte: wer es gelöscht hat (und die Mappe noch bearbeiten darf) oder ein Administrator. */
  async stelleDokumentWiederHer(id: string, ich: { id: string; rolle: string }, z: Zugriff | undefined, alle = false) {
    const e = await this.dokEintrag(id, ich, alle);
    const [x] = await this.mitMappe([e]);
    if (x.mappe === 'papierkorb') throw new Fachfehler(409, `Die Mappe „${x.mappeTitel || 'ohne Titel'}“ liegt selbst im Papierkorb. Stelle zuerst die Mappe wieder her – ihre Dokumente kommen mit; danach dieses Dokument.`);
    if (x.mappe === 'weg') throw new Fachfehler(409, 'Die Mappe dieses Dokuments gibt es nicht mehr. Wiederherstellen geht nicht; du kannst es nur endgültig löschen.');
    if (!(alle && ich.rolle === 'admin')) await this.pruefeRecht(z, e.mappeId, 'U');
    const typ = (await this.repo.holeTyp(x.typId))!;
    if (!typ.register.some((r) => r.key === e.registerKey && r.art === 'dokumente')) throw new Fachfehler(409, `Das Register „${x.register}“ gibt es an der Mappe nicht mehr. Lege es im Mappentyp wieder an, dann klappt das Wiederherstellen.`);
    await this.repo.stelleDokumentWiederHer(id);
    await this.notiere(e.mappeId, ich.id, 'dokument_wiederhergestellt', { dokument: e.name, register: x.register });
    await this.beruehre(e.mappeId, typ, ich.id);
    this.vorschau?.einreihen([(await this.repo.holeDokument(id))!]);
    protokoll.modul('ablage').info('Dokument wiederhergestellt', { dokument: e.name, id, mappe: e.mappeId });
    return { dokument: (await this.repo.holeDokument(id))!, typId: x.typId };
  }

  /** Dokumente endgültig löschen (ohne Rechteprüfung); Archivmodus der Mappe gilt weiter. */
  private async leereDokumente(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const dateien = await this.repo.leereDokumentPapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    return ids.length;
  }

  async loescheDokumentEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false): Promise<number> {
    for (const id of ids) await this.dokEintrag(id, ich, alle);
    const n = await this.leereDokumente(ids);
    if (n) protokoll.modul('ablage').info('Dokumente aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Eintrag, den dieser Benutzer sehen darf (eigener oder als Administrator in der Werkbank); sonst 404. */
  private async eintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, 'Diese Mappe liegt nicht (mehr) im Papierkorb.');
    return e;
  }

  async papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return this.eintrag(id, ich, alle); }

  /**
   * Wiederherstellen. Verweise auf Mappen, die es nicht mehr gibt, und eindeutige Werte, die
   * inzwischen eine andere Mappe hat, lassen die Mappe „nicht passen“: Sie erscheint im Eingang.
   */
  async stelleWiederHer(id: string, ich: { id: string; rolle: string }, alle = false) {
    const e = await this.eintrag(id, ich, alle);
    const typ = await this.repo.holeTyp(e.typId);
    if (!typ) throw new Fachfehler(409, 'Den Mappentyp dieser Mappe gibt es nicht mehr.');
    const { verweiseEntfallen } = await this.repo.stelleWiederHer(id);
    await this.notiere(id, ich.id, 'wiederhergestellt', verweiseEntfallen ? { verweiseEntfallen } : undefined);
    await this.aktualisiereTitel([id]);
    await this.passungFuer(typ, [id]);
    if (typ.system === 'benutzer') await this.konten?.wiederda(id, ich.id);
    const m = (await this.repo.holeMappe(id))!;
    protokoll.modul('ablage').info('Mappe wiederhergestellt', { typ: typ.name, titel: m.titel, id, passt: m.passt !== false || undefined, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen };
  }

  /** Endgültig löschen (ohne Rechteprüfung): Dateien, an denen nichts mehr hängt, und Konten von Benutzer-Mappen. */
  private async leere(ids: string[], von: string | null = null, streng = false): Promise<number> {
    // Archivmodus (#212): Mappen in der Frist bleiben im Papierkorb (lagen dort schon vor dem Einschalten).
    if (ids.length) {
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
      const korb = (await this.repo.papierkorb()).filter((e) => ids.includes(e.id));
      const geschuetzt = korb.filter((e) => inFrist(aufbewahrenBis(typen.get(e.typId)?.archiv, e)));
      if (geschuetzt.length && streng) throw new Fachfehler(409, `Aufbewahrungspflicht bis ${datumText(aufbewahrenBis(typen.get(geschuetzt[0].typId)?.archiv, geschuetzt[0])!)} – vorher lässt sich „${geschuetzt[0].titel || 'die Mappe'}“ nicht endgültig löschen.`);
      ids = ids.filter((id) => !geschuetzt.some((e) => e.id === id));
    }
    if (!ids.length) return 0;
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: von, art: 'endgueltig' as const })));
    const benutzerTyp = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    const benutzer = benutzerTyp ? (await this.repo.papierkorb({ typId: benutzerTyp.id })).filter((e) => ids.includes(e.id)).map((e) => e.id) : [];
    const dateien = await this.repo.leerePapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    // Einzeln gelöschte Dokumente dieser Mappen (#344) gehen mit – ohne Mappe lassen sie sich nicht mehr wiederherstellen.
    await this.leereDokumente((await this.repo.papierkorbDokumente({ mappeIds: ids })).map((d) => d.id));
    for (const id of benutzer) await this.konten?.endgueltig(id);
    return ids.length;
  }

  /** Einzelne Mappen endgültig löschen: eigene oder (in der Werkbank) alle. */
  async loescheEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false): Promise<number> {
    for (const id of ids) await this.eintrag(id, ich, alle);
    const n = await this.leere(ids, ich.id, true);
    if (n) protokoll.modul('ablage').info('Aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Papierkorb leeren: eigener (Ablage) oder ganz (Werkbank). */
  async leerePapierkorb(ich: { id: string; rolle: string }, alle = false): Promise<number> {
    const n = await this.leere((await this.papierkorb(ich, alle)).map((e) => e.id), ich.id)
      + await this.leereDokumente((await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).map((d) => d.id));
    if (n) protokoll.modul('ablage').info(alle ? 'Papierkorb aller Benutzer geleert' : 'Papierkorb geleert', { anzahl: n });
    return n;
  }

  /** Abgelaufenes endgültig löschen; läuft stündlich. */
  async raeumePapierkorbAuf(jetzt = Date.now()): Promise<number> {
    const tage = await this.papierkorbTage();
    const vor = new Date(jetzt - tage * 24 * 60 * 60 * 1000).toISOString();
    const n = await this.leere((await this.repo.papierkorb(tage ? { vor } : {})).map((e) => e.id));
    if (n) protokoll.modul('system').info('Abgelaufene Mappen aus dem Papierkorb gelöscht', { anzahl: n, tage });
    const nd = await this.leereDokumente((await this.repo.papierkorbDokumente(tage ? { vor } : {})).map((d) => d.id));
    if (nd) protokoll.modul('system').info('Abgelaufene Dokumente aus dem Papierkorb gelöscht', { anzahl: nd, tage });
    // Historie endgültig gelöschter Mappen nach ihrer Frist (#57).
    const ht = await this.historieTage();
    const weg = await this.repo.historieAufraeumen(new Date(jetzt - ht * 24 * 60 * 60 * 1000).toISOString());
    if (weg) protokoll.modul('system').info('Historie endgültig gelöschter Mappen entfernt', { eintraege: weg, tage: ht });
    return n;
  }

  /* ---------- Demo-Daten ---------- */

  async demoUebersicht() {
    const demo = await this.repo.zaehleDemo();
    const z = (await this.repo.zaehler('', false)).typen;
    return (await this.repo.listeTypen()).filter((t) => !t.system).map((t) => ({
      typId: t.id, name: t.name, demo: demo.get(t.id) ?? 0, gesamt: z.get(t.id)?.anzahl ?? 0,
    }));
  }

  /** Alle Demo-Mappen samt Dokumenten entfernen – in Paketen mit Fortschritt (#248). */
  async entferneDemo(fortschritt: (fertig: number, gesamt: number) => void = () => {}, paket = 1000) {
    const echte = await this.repo.echteVerweiseAufDemo();
    if (echte) throw new Fachfehler(409, `${echte} echte ${echte === 1 ? 'Mappe verweist' : 'Mappen verweisen'} auf Demo-Mappen. Entferne zuerst diese Verweise.`);
    const gesamt = [...(await this.repo.zaehleDemo()).values()].reduce((a, b) => a + b, 0);
    let entfernt = 0;
    fortschritt(0, gesamt);
    for (;;) {
      const { anzahl, dateien } = await this.repo.loescheDemo(paket);
      for (const sha of dateien) await this.raeumeAuf(sha);
      entfernt += anzahl;
      fortschritt(Math.min(entfernt, gesamt), gesamt);
      if (anzahl < paket) break;
    }
    if (entfernt) await this.aktualisiereStatistik();
    return { entfernt };
  }

  /**
   * Demo-Dokument anlegen (#248): ohne Protokolleintrag je Datei und ohne „zuletzt geändert“ –
   * es sind tausende. Volltext wie beim Hochladen; eingereiht wird gesammelt (demoTexterkennung).
   */
  async legeDemoDokumentAn(mappeId: string, typ: Mappentyp, registerKey: string, name: string, mime: string, inhalt: Buffer, benutzerId: string | null) {
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Die Datei ist zu groß.');
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    const d = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey, name: dateiname(name), mime: erkannt ?? mime,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    return { id: d.id, volltext: Dienst.volltextAn(typ, registerKey) };
  }

  /* ---------- Eingangskanäle (#195) ---------- */

  async postTyp() { return (await this.sichereSystem()).post; }

  /** Historien-Eintrag eines Eingangskanals (#196), z. B. nicht übernommene Anhänge. */
  async notiereSystem(mappeId: string, system: string, text: string) { await this.notiere(mappeId, null, 'uebernommen', { system, text }); }
  async anzahlDokumente(mappeId: string) { return (await this.repo.listeDokumente(mappeId)).length; }

  /** Gibt es die Mappe (z. B. eine Post mit vorgegebener Id) schon? */
  async gibtMappe(id: string) { return !!(await this.repo.holeMappe(id)); }

  /** Mappen, die schon eine Datei mit diesem Inhalt haben („gleicher Inhalt wie …“). */
  async dokumenteMitInhalt(sha256: string) {
    const docs = await this.repo.dokumenteMitSha(sha256);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    return docs.slice(0, 5).map((d) => ({ mappeId: d.mappeId, name: d.name, titel: bezuege.get(d.mappeId)?.titel ?? '' }));
  }

  /**
   * Doppelte Dateien (#333): Wo liegt eine Datei mit diesem Prüfwert schon? Nur Mappen, die der Benutzer
   * lesen darf – liegt sie nur in fremden Mappen, gibt es keinen Hinweis (nichts verraten).
   */
  async fundstellen(z: Zugriff | undefined, pruefwerte: unknown, ohneMappe?: string): Promise<Record<string, Fundstelle[]>> {
    const liste = Array.isArray(pruefwerte) ? [...new Set(pruefwerte.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)))] : [];
    if (liste.length > 100) throw new Fachfehler(422, 'Höchstens 100 Prüfwerte auf einmal.');
    const erg: Record<string, Fundstelle[]> = {};
    for (const sha of liste) {
      const docs = (await this.repo.dokumenteMitSha(sha)).filter((d) => d.mappeId !== ohneMappe);
      if (!docs.length) continue;
      const lesbar = await this.lesbare(z, [...new Set(docs.map((d) => d.mappeId))]);
      const sichtbar = docs.filter((d) => lesbar.has(d.mappeId));
      if (!sichtbar.length) continue;
      const bezuege = await this.repo.bezuege(sichtbar.map((d) => d.mappeId));
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
      erg[sha] = sichtbar.slice(0, 5).map((d) => {
        const b = bezuege.get(d.mappeId);
        const t = b ? typen.get(b.typId) : undefined;
        return { mappeId: d.mappeId, typId: b?.typId ?? '', titel: b?.titel ?? '', typ: t?.name ?? '', register: t?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey, name: d.name, erstellt: d.erstellt };
      });
    }
    return erg;
  }

  /** Eine Post, die seit `seit` ein Dokument mit diesem Inhalt bekommen hat (Aufräumen nach Abbruch). */
  async postMitDatei(sha256: string, seit: string): Promise<string | null> {
    const post = await this.postTyp();
    for (const d of await this.repo.dokumenteMitSha(sha256)) {
      if (d.erstellt < seit) continue;
      const m = await this.repo.holeMappe(d.mappeId);
      if (m?.typId === post.id) return m.id;
    }
    return null;
  }

  /** Demo-Dokumente gesammelt in die Warteschlange der Texterkennung. */
  async demoTexterkennung(ids: string[]) {
    if (!ids.length) return;
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
  }

  /* ---------- Dokumente ---------- */

  /** Löscht die Datei, wenn kein Dokument mehr auf sie zeigt. */
  private async raeumeAuf(sha256: string) {
    if (!(await this.repo.dateiBenutzt(sha256))) {
      await this.dateien.loesche(sha256);
      await this.vorschau?.entferne(sha256);
    }
  }

  /**
   * Hochladen. Gleicher Name im Register (#194): `gleicherName` = „zaehler“ (Standard: „Rechnung (2).pdf“),
   * „version“ (neue Version des vorhandenen, nur mit Versionierung) oder „ersetzen“ (vorhandenes löschen,
   * nur ohne Versionierung).
   */
  async ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string; gleicherName?: string; herkunft?: Herkunft; volltext?: Volltextuebernahme }, inhalt: unknown, benutzerId: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, 'Diese Mappe gibt es nicht.');
    const typ = await this.repo.holeTyp(m.typId);
    const reg = typ?.register.find((r) => r.key === e.register && r.art === 'dokumente');
    if (!reg) throw new Fachfehler(422, 'Dieses Dokumentenregister gibt es an der Mappe nicht.');
    if (!Buffer.isBuffer(inhalt) || inhalt.length === 0) throw new Fachfehler(422, 'Die Datei ist leer.');
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Die Datei ist zu groß.');
    // Automatisch verkleinern (#393): neue PDFs von außen (Hochladen, Eingangsordner, Postfach, API, WebDAV) ab einer Größe.
    let automatisch: { vorher: number; nachher: number; stufe: Stufe } | null = null;
    if (AUTOMATISCH_VERKLEINERN.has(e.herkunft ?? 'hochgeladen') && !e.volltext) {
      const r = await this.automatischVerkleinert(inhalt, e.name ?? '');
      if (r) { automatisch = { vorher: r.vorher, nachher: r.nachher, stufe: r.stufe }; inhalt = r.inhalt; }
    }
    if (!Buffer.isBuffer(inhalt)) throw new Fachfehler(422, 'Die Datei ist leer.');
    const art = e.gleicherName ?? 'zaehler';
    if (!['zaehler', 'version', 'ersetzen'].includes(art)) throw new Fachfehler(422, 'gleicherName: zaehler, version oder ersetzen.');
    const vorhanden = (await this.repo.listeDokumente(mappeId)).filter((d) => d.registerKey === reg.key);
    const gleich = vorhanden.find((d) => d.name.toLowerCase() === dateiname(e.name).toLowerCase());
    if (gleich && art === 'version') {
      if (!reg.versionierung) throw new Fachfehler(409, 'Für dieses Register ist die Versionierung ausgeschaltet – eine neue Version ist nicht möglich.');
      return { dokument: await this.ersetzeDokument(gleich.id, { name: e.name, typ: e.typ, herkunft: e.herkunft }, inhalt, benutzerId), gleicherInhalt: [], version: true };
    }
    if (gleich && art === 'ersetzen') {
      if (reg.versionierung) throw new Fachfehler(409, 'Für dieses Register ist die Versionierung eingeschaltet – lade das Dokument als neue Version hoch.');
      await this.loescheDokument(gleich.id, benutzerId);
    }
    let name = dateiname(e.name);
    if (gleich && art === 'zaehler') {
      const namen = new Set(vorhanden.map((d) => d.name.toLowerCase()));
      const punkt = name.lastIndexOf('.');
      const [stamm, endung] = punkt > 0 ? [name.slice(0, punkt), name.slice(punkt)] : [name, ''];
      for (let i = 2; namen.has(name.toLowerCase()); i++) name = `${stamm} (${i})${endung}`;
    }

    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    const angegeben = /^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream';
    const gleicherInhalt = await this.repo.dokumenteMitSha(sha256);
    await this.dateien.schreibe(sha256, inhalt);
    // Dokument, Historie und Ereignis in einer Transaktion (#404); die Datei liegt schon (bleibt sie übrig, räumt die Wartung auf).
    const neu = await this.inTransaktion(async () => {
      await this.notiere(mappeId, benutzerId, 'dokument_hochgeladen', { dokument: name, groesse: inhalt.length, mime: erkannt ?? angegeben, register: reg.name,
        ...(automatisch ? { verkleinert: `automatisch ${ergebnisText(automatisch.vorher, automatisch.nachher)} (${STUFEN[automatisch.stufe].name})` } : {}) });
      await this.beruehre(mappeId, typ, benutzerId);
      const dokument = await this.repo.legeDokumentAn({
        id: randomUUID(), mappeId, registerKey: reg.key, name, mime: erkannt ?? angegeben,
        groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
      });
      this.danach(() => this.vorschau?.einreihen([dokument]));
      // Volltext (#45): neues Dokument in die Warteschlange, wenn das Register das will.
      let neu = dokument;
      if (e.volltext) {
        // Verkleinert ohne Versionierung (#393): Der Volltext des bisherigen bleibt, keine neue Texterkennung.
        await this.repo.ocrSetze(dokument.id, { stand: 'fertig', ...e.volltext });
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
      } else if (Dienst.volltextAn(typ, reg.key)) {
        await this.repo.ocrEinreihen([dokument.id]);
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
        this.danach(() => this.ocr?.anstossen());
      }
      await this.melde('dokument.hochgeladen', { dokument: dokument.id, mappe: mappeId, name, mime: dokument.mime, groesse: inhalt.length, volltextGeplant: neu.ocr?.stand === 'wartet' }, undefined, benutzerId);
      return neu;
    });
    const bezuege = await this.repo.bezuege(gleicherInhalt.map((d) => d.mappeId));
    return { dokument: neu, gleicherInhalt: gleicherInhalt.map((d) => ({ mappeId: d.mappeId, name: d.name, ...bezuege.get(d.mappeId) })), ...(automatisch ? { verkleinert: automatisch } : {}) };
  }

  /** Titel und Typ zu Mappen-Ids (ohne Rechteprüfung – vorher filtern). */
  bezuegeVon(ids: string[]) { return this.repo.bezuege(ids); }

  /** Startseite (#334): Gibt es noch keine Mappe außer denen des Systems (Benutzer, Rollen, Ablageorte) und Demo-Daten? */
  async ohneEigeneMappen(): Promise<boolean> {
    const ablageort = await this.ablageortId();
    const typen = (await this.repo.listeTypen()).filter((t) => !t.system && t.id !== ablageort);
    const z = (await this.repo.zaehler('', false)).typen;
    return !typen.some((t) => (z.get(t.id)?.anzahl ?? 0) > 0);
  }

  async holeDokument(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return d;
  }

  async dokumentInhalt(id: string) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { dokument, inhalt: await this.dateien.lies(dokument.sha256) };
  }

  /* ---------- Stempel beim Weitergeben (#394) ---------- */

  /** Vorlagen und Einstellung je Mappentyp – beides in den Einstellungen (Schlüssel „stempel“), ohne Migration. */
  private async stempelDaten(): Promise<{ vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }> {
    const roh = (await this.einstellungen?.lies('stempel')) as { vorlagen?: unknown; typen?: unknown } | null;
    const typen: Record<string, StempelTyp> = {};
    if (roh?.typen && typeof roh.typen === 'object') for (const [k, v] of Object.entries(roh.typen)) { const t = liesStempelTyp(v); if (t) typen[k] = t; }
    return { vorlagen: liesVorlagen(roh?.vorlagen), typen };
  }
  private async schreibeStempelDaten(d: { vorlagen: StempelVorlage[]; typen: Record<string, StempelTyp> }) {
    if (!this.einstellungen) throw new Fachfehler(409, 'Einstellungen lassen sich hier nicht speichern.');
    await this.einstellungen.schreibe('stempel', d);
  }

  /** Vorlagen für alle Angemeldeten (zum Auswählen beim Weitergeben). */
  async stempelVorlagen(): Promise<StempelVorlage[]> { return (await this.stempelDaten()).vorlagen; }

  /** Vorlage anlegen (`id` null) oder ändern (Werkbank). */
  async speichereStempelVorlage(id: string | null, eingabe: unknown, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const alt = id ? d.vorlagen.find((v) => v.id === id) : undefined;
    if (id && !alt) throw new Fachfehler(404, 'Diese Stempel-Vorlage gibt es nicht (mehr).');
    if (!id && d.vorlagen.length >= STEMPEL_VORLAGEN_MAX) throw new Fachfehler(422, `Höchstens ${STEMPEL_VORLAGEN_MAX} Stempel-Vorlagen.`);
    const o = (eingabe ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? alt?.name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, STEMPEL_NAME_MAX);
    const v: StempelVorlage = { id: alt?.id ?? randomUUID(), name, ...stempelAus(o, alt) };
    const fehler = pruefeVorlage(v, d.vorlagen.filter((x) => x.id !== v.id).map((x) => x.name));
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler).join(' '), { felder: fehler });
    d.vorlagen = alt ? d.vorlagen.map((x) => (x.id === v.id ? v : x)) : [...d.vorlagen, v];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info(alt ? 'Stempel-Vorlage geändert' : 'Stempel-Vorlage angelegt', { name: v.name, text: v.text, von });
    return d.vorlagen;
  }

  /** Vorlage löschen – nicht, solange ein Mappentyp sie nutzt. */
  async loescheStempelVorlage(id: string, von: string): Promise<StempelVorlage[]> {
    const d = await this.stempelDaten();
    const v = d.vorlagen.find((x) => x.id === id);
    if (!v) throw new Fachfehler(404, 'Diese Stempel-Vorlage gibt es nicht (mehr).');
    const typen = await this.repo.listeTypen();
    const nutzer = Object.entries(d.typen).filter(([t, s]) => s.vorlage === id && typen.some((x) => x.id === t)).map(([t]) => typen.find((x) => x.id === t)!.name);
    if (nutzer.length) throw new Fachfehler(409, `Die Vorlage „${v.name}“ wird noch von ${nutzer.length === 1 ? 'dem Mappentyp' : 'den Mappentypen'} ${nutzer.map((n) => `„${n}“`).join(', ')} verwendet.`);
    d.vorlagen = d.vorlagen.filter((x) => x.id !== id);
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel-Vorlage gelöscht', { name: v.name, von });
    return d.vorlagen;
  }

  /** Stempel-Einstellung eines Mappentyps prüfen (vor dem Speichern des Typs). */
  private async pruefeStempelTyp(v: unknown): Promise<StempelTyp | null> {
    if (v && typeof v === 'object' && typeof (v as { modus?: unknown }).modus === 'string' && !((v as { modus: string }).modus in STEMPEL_MODI)) {
      throw new Fachfehler(422, 'Stempel beim Weitergeben: unbekannte Einstellung.', { allgemein: ['Stempel beim Weitergeben: unbekannte Einstellung.'], felder: {}, orte: ['stempel'] });
    }
    const t = liesStempelTyp(v);
    if (t?.vorlage && !(await this.stempelDaten()).vorlagen.some((x) => x.id === t.vorlage)) {
      throw new Fachfehler(422, 'Stempel beim Weitergeben: Diese Vorlage gibt es nicht (mehr).', { allgemein: ['Stempel beim Weitergeben: Diese Vorlage gibt es nicht (mehr).'], felder: {}, orte: ['stempel'] });
    }
    return t;
  }
  private async setzeStempelTyp(typId: string, t: StempelTyp | null) {
    if (!this.einstellungen) return;
    const d = await this.stempelDaten();
    const vorher = d.typen[typId] ?? null;
    if (JSON.stringify(vorher) === JSON.stringify(t)) return;
    if (t) d.typen[typId] = t; else delete d.typen[typId];
    await this.schreibeStempelDaten(d);
    protokoll.modul('werkbank').info('Stempel beim Weitergeben eingestellt', { typ: typId, modus: t?.modus ?? 'aus', vorlage: t?.vorlage ?? null });
  }
  /** Mappentypen mit ihrer Stempel-Einstellung (für die Oberfläche). */
  private async mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]> {
    const { typen: s } = await this.stempelDaten();
    return typen.map((t) => ({ ...t, stempel: s[t.id] ?? null }));
  }

  /** Welcher Stempel für eine Mappe dieses Typs gilt (Wunsch, Pflicht); Fehler als 422. */
  private async stempelPlan(typId: string, wunsch: StempelWunsch | null, empfaengerErsatz = '', daten?: Awaited<ReturnType<Dienst['stempelDaten']>>): Promise<GeltenderStempel | null> {
    const d = daten ?? await this.stempelDaten();
    try { return geltenderStempel(wunsch, d.typen[typId], d.vorlagen, empfaengerErsatz); } catch (x) {
      if (x instanceof StempelFehler) throw new Fachfehler(422, x.message, { stempel: true, pflicht: d.typen[typId]?.modus === 'pflicht' });
      throw x;
    }
  }

  private async liesGanz(sha256: string): Promise<Buffer> {
    const x = await this.dateien.lies(sha256);
    return Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]);
  }

  /** Historie (#394, #393): „weitergegeben mit Stempel ‚…‘, verkleinert (… → …) an …“. */
  private async notiereWeitergabe(mappeId: string, von: string | null, wie: string, plan: GeltenderStempel | null, ausgaben: Ausgabe[]) {
    const bearbeitet = ausgaben.filter((a) => a.gestempelt || a.verkleinert);
    if (!bearbeitet.length) return;
    const text = bearbeitet.find((a) => a.stempeltext)?.stempeltext ?? null;
    const klein = bearbeitet.filter((a) => a.verkleinert);
    await this.notiere(mappeId, von, 'weitergegeben', {
      text: `${weitergabeWas(ausgaben)}${plan?.empfaenger ? ` an ${plan.empfaenger}` : ''} (${wie}: ${bearbeitet.map((a) => a.name).join(', ')})`,
      stempel: text, an: plan?.empfaenger || null, wie, vorlage: plan?.vorlage ?? null, pflicht: plan?.pflicht ?? false, dokumente: bearbeitet.map((a) => a.name),
      ...(klein.length ? { verkleinert: { vorher: klein.reduce((s, a) => s + a.verkleinert!.vorher, 0), nachher: klein.reduce((s, a) => s + a.verkleinert!.nachher, 0) } } : {}),
    });
  }

  /**
   * Ein Dokument oder eine ältere Version herunterladen (#394): mit Stempel, wenn gewünscht (`stempel`,
   * aus Anfragekörper oder Abfrageparametern) oder vom Mappentyp verlangt. Ohne Stempel unverändert als Strom.
   */
  async dokumentFuerAusgabe(id: string, o: { version?: number; stempel?: unknown; verkleinern?: unknown; ich: { id: string | null; name: string } }) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    const datei = o.version != null ? (await this.versionInhalt(id, o.version)).version : dokument;
    const m = await this.repo.holeMappe(dokument.mappeId);
    const plan = m ? await this.stempelPlan(m.typId, wunschAus(o.stempel)) : null;
    // Verkleinert herunterladen (#393): nur PDFs; das gespeicherte Dokument bleibt, wie es ist.
    const klein = stufeAus(o.verkleinern);
    if (klein && datei.mime !== 'application/pdf' && !plan) throw new Fachfehler(422, `„${datei.name}“ ist kein PDF – verkleinern lassen sich nur PDFs.`);
    if (!plan && !klein) return { name: datei.name, mime: datei.mime, anzeigbar: datei.anzeigbar, groesse: datei.groesse, inhalt: await this.dateien.lies(datei.sha256) as Buffer | Readable, gestempelt: false };
    const a = await fuerAusgabe({ name: datei.name, mime: datei.mime, inhalt: await this.liesGanz(datei.sha256) }, { stempel: plan, verkleinern: klein },
      { benutzer: o.ich.name, mappe: m!.titel || 'Ohne Titel', archivnummer: dokument.archivnummer }, true);
    await this.notiereWeitergabe(m!.id, o.ich.id, o.version != null ? `heruntergeladen, Version ${o.version}` : 'heruntergeladen', plan, [a]);
    if (plan) protokoll.modul('dokumente').info('Dokument mit Stempel heruntergeladen', { id, mappe: m!.id, pflicht: plan.pflicht });
    if (a.verkleinert) protokoll.modul('dokumente').info('Dokument verkleinert heruntergeladen', { id, mappe: m!.id, vorher: a.verkleinert.vorher, nachher: a.verkleinert.nachher });
    return { name: a.name, mime: a.mime, anzeigbar: true, groesse: a.inhalt.length, inhalt: a.inhalt as Buffer | Readable, gestempelt: !!a.gestempelt, verkleinert: a.verkleinert ?? null };
  }

  async loescheDokument(id: string, benutzerId: string | null = null) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    // Archivmodus (#212): Dokumente bleiben bis Fristende; ändern nur als neue Version.
    await this.pruefeArchivDokument(d.mappeId, 'löschen');
    // Alle Versionen (#194) gehen mit.
    const aeltere = await this.repo.versionenVon(id);
    // Papierkorb (#344): eingeschaltet → das Dokument zieht samt Versionen und Volltext dorthin um.
    const korb = (await this.papierkorbTage()) > 0;
    if (korb) await this.repo.legeDokumentInPapierkorb(id, benutzerId);
    else await this.repo.loescheDokument(id);
    await this.notiere(d.mappeId, benutzerId, korb ? 'dokument_papierkorb' : 'dokument_geloescht', { dokument: d.name, groesse: d.groesse, mime: d.mime, ...(aeltere.length ? { versionen: aeltere.length + 1 } : {}) });
    const m = await this.repo.holeMappe(d.mappeId);
    if (m) await this.beruehre(m.id, await this.repo.holeTyp(m.typId), benutzerId);
    if (!korb) for (const sha of new Set([d.sha256, ...aeltere.map((v) => v.sha256)])) await this.raeumeAuf(sha);
    return { papierkorb: korb };
  }

  /* ---------- PDF bearbeiten (#335) ---------- */

  /** Seitenbilder der Seitenansicht (im Arbeitsspeicher, für die letzten Dokumente). */
  readonly seitenbilder = new Seitenbilder();

  private async pdfVon(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    if (d.mime !== 'application/pdf') throw new Fachfehler(422, `„${d.name}“ ist kein PDF – bearbeiten lassen sich nur PDF-Dokumente.`);
    const s = await this.dateien.lies(d.sha256);
    return { d, inhalt: Buffer.isBuffer(s) ? s : Buffer.concat(await s.toArray() as Buffer[]) };
  }

  /** Eine Seite als Graustufenbild (PGM) für eine Texterkennung im Paket (#338). */
  async seiteAlsGraubild(id: string, nr: number, dpi: number): Promise<Buffer> {
    const { inhalt } = await this.pdfVon(id);
    return graubild(inhalt, nr, dpi);
  }

  /** Seitenzahl und Drehung je Seite. */
  async pdfSeiten(id: string) {
    const { d, inhalt } = await this.pdfVon(id);
    return { id: d.id, name: d.name, version: d.version ?? 1, sha256: d.sha256, ...(await seitenInfo(inhalt)), bilderBis: SEITENBILDER_MAX };
  }

  /** Bild einer Seite (Seitenansicht); null, wenn es keins gibt. */
  async pdfSeitenbild(id: string, nr: number): Promise<Buffer | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    if (d.mime !== 'application/pdf' || !Number.isInteger(nr) || nr < 1 || nr > SEITENBILDER_MAX) return null;
    return this.seitenbilder.bild(d.sha256, nr, async () => (await this.pdfVon(id)).inhalt);
  }

  /**
   * Seiten bearbeiten (#335): `seiten` = die Seiten des Ergebnisses in Reihenfolge (Nummer im Original,
   * Drehung), `teile` = Positionen in dieser Liste, an denen ein neuer Teil beginnt.
   * - Ohne Teilen: neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen nach Rückfrage
   *   (`bestaetigt`), das bisherige kommt in den Papierkorb.
   * - Teilen in einer Mappe: Teil 1 wird so zur neuen Version, die weiteren Teile werden eigene Dokumente
   *   im selben Register.
   * - Teilen bei Post: je Teil eine neue Post; die Ausgangspost behält ihr Dokument, ist erledigt und
   *   verweist auf die neuen.
   */
  async bearbeitePdf(id: string, eingabe: unknown, von: string | null, z?: Zugriff) {
    const { d, inhalt } = await this.pdfVon(id);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const info = await seitenInfo(inhalt);
    const seiten = pruefeAuswahl(e.seiten, info.anzahl);
    const starts = pruefeTeile(e.teile, seiten.length);
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const reg = typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente');
    if (!m || !typ || !reg) throw new Fachfehler(409, 'Das Register dieses Dokuments gibt es nicht mehr.');
    const gleich = starts.length === 1 && seiten.length === info.anzahl && seiten.every((s, i) => s.nr === i + 1 && !s.drehung);
    if (gleich) throw new Fachfehler(422, 'Es hat sich nichts geändert.');
    const teileBuf = await teile(inhalt, seiten, starts);
    const gedreht = seiten.filter((s) => s.drehung).length;
    const was = { dokument: d.name, seiten: seiten.length, vorher: info.anzahl, ...(gedreht ? { gedreht } : {}), ...(starts.length > 1 ? { teile: starts.length } : {}) };

    if (typ.system === 'post' && starts.length > 1) return this.teilePost(m, typ, reg, d, teileBuf, von, z, was);

    const korb = (await this.papierkorbTage()) > 0;
    let erstes: Dokument;
    const name1 = starts.length > 1 ? teilName(d.name, 1) : d.name;
    if (reg.versionierung) {
      erstes = await this.ersetzeDokument(d.id, { name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von);
    } else {
      if (e.bestaetigt !== true) {
        throw new Fachfehler(409, `Für dieses Register ist die Versionierung ausgeschaltet: Das bearbeitete PDF ersetzt das bisherige${korb ? ', das bisherige kommt in den Papierkorb' : ' – das bisherige ist danach weg'}. Bitte bestätigen.`, { rueckfrage: true, papierkorb: korb });
      }
      await this.loescheDokument(d.id, von);
      erstes = (await this.ladeHoch(m.id, { register: reg.key, name: name1, typ: 'application/pdf', herkunft: 'bearbeitet' }, teileBuf[0], von)).dokument;
    }
    const weitere: Dokument[] = [];
    for (const [i, b] of teileBuf.slice(1).entries()) {
      weitere.push((await this.ladeHoch(m.id, { register: reg.key, name: teilName(d.name, i + 2), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
    }
    await this.notiere(m.id, von, 'pdf_bearbeitet', { ...was, text: pdfText(was) });
    protokoll.modul('dokumente').info('PDF bearbeitet', { id: d.id, seiten: seiten.length, vorher: info.anzahl, teile: starts.length });
    return { dokumente: [erstes, ...weitere], posten: [] as Mappe[] };
  }

  private async teilePost(post: Mappe, typ: Mappentyp, reg: Register, d: Dokument, teileBuf: Buffer[], von: string | null, z: Zugriff | undefined, was: Record<string, unknown>) {
    const betreff = auswahlText(post.werte.betreff) || 'Post';
    const posten: Mappe[] = [];
    const dokumente: Dokument[] = [];
    for (const [i, b] of teileBuf.entries()) {
      // Je Teil: neue Post mit ihrem Dokument und beiden Ereignissen (post.angelegt, dokument.hochgeladen) ganz oder gar nicht (#404).
      await this.inTransaktion(async () => {
        const neu = await this.legePostAn({
          betreff: `${betreff} (Teil ${i + 1})`, datum: post.werte.datum, absender: post.werte.absender ?? '', kanal: auswahlText(post.werte.kanal),
          fuer: alsListe(post.werte.fuer)[0] ?? null,
        }, { id: von, name: '' }, z, undefined, undefined, undefined, post.werte);
        await this.notiere(neu.id, von, 'post_geteilt', { text: `Teil ${i + 1} von ${teileBuf.length} aus „${betreff}“`, post: post.id, postTyp: typ.id });
        dokumente.push((await this.ladeHoch(neu.id, { register: reg.key, name: teilName(d.name, i + 1), typ: 'application/pdf', herkunft: 'bearbeitet' }, b, von)).dokument);
        posten.push((await this.repo.holeMappe(neu.id))!);
      });
    }
    const bezug = [...new Set([...alsListe(post.werte.bezug), ...posten.map((p) => p.id)])];
    await this.schreibeSystemMappe(typ, post.id, { ...post.werte, bezug, stand: POST_STAND.erledigt }, von);
    await this.notiere(post.id, von, 'post_geteilt', { ...was, text: `„${d.name}“ in ${posten.length} Posts geteilt`, posten: posten.map((p) => p.id), postTyp: typ.id });
    await this.postAufgaben(post.id, von);
    protokoll.modul('ablage').info('Post geteilt', { post: post.id, teile: posten.length });
    return { dokumente, posten };
  }

  /**
   * Zusammenfügen (#335): mehrere PDF-Dokumente (auch aus mehreren Mappen oder Posts) zu einem neuen
   * Dokument in `ziel` (Standard: die Mappe des ersten). `originaleEntfernen`: die Ausgangsdokumente
   * kommen in den Papierkorb (ohne Papierkorb nur mit `bestaetigt`); eine Post, die dadurch kein
   * Dokument mehr hat, ist erledigt und verweist auf das Ziel.
   */
  async fuegePdfZusammen(eingabe: unknown, von: string | null, z?: Zugriff) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.dokumente) ? [...new Set(e.dokumente.map(String))] : [];
    if (ids.length < 2) throw new Fachfehler(422, 'Bitte mindestens zwei PDF-Dokumente wählen.');
    if (ids.length > 100) throw new Fachfehler(422, 'Höchstens 100 Dokumente auf einmal.');
    const entfernen = e.originaleEntfernen === true;
    const quellen: Array<{ d: Dokument; inhalt: Buffer }> = [];
    for (const id of ids) {
      const d = await this.repo.holeDokument(id);
      if (!d) throw new Fachfehler(404, 'Ein gewähltes Dokument gibt es nicht (mehr).');
      if (z) await this.pruefeRecht(z, d.mappeId, entfernen ? 'U' : 'R');
      quellen.push(await this.pdfVon(id));
    }
    const zielId = istUuid(text(e.ziel)) ? text(e.ziel) : quellen[0].d.mappeId;
    const ziel = z ? await this.pruefeRecht(z, zielId, 'U') : await this.repo.holeMappe(zielId);
    if (!ziel) throw new Fachfehler(404, 'Die gewählte Mappe gibt es nicht.');
    const zielTyp = await this.repo.holeTyp(ziel.typId);
    const regs = zielTyp?.register.filter((r) => r.art === 'dokumente') ?? [];
    const reg = e.register ? regs.find((r) => r.key === text(e.register)) : regs.find((r) => r.key === quellen[0].d.registerKey && ziel.id === quellen[0].d.mappeId) ?? regs[0];
    if (!reg) throw new Fachfehler(422, regs.length ? 'Dieses Dokumentenregister gibt es an der Mappe nicht.' : 'Die Mappe hat kein Dokumentenregister.');
    const mappen = [...new Set(quellen.map((q) => q.d.mappeId))];
    if (entfernen) {
      for (const mid of mappen) await this.pruefeArchivDokument(mid, 'entfernen');
      if ((await this.papierkorbTage()) === 0 && e.bestaetigt !== true) {
        throw new Fachfehler(409, 'Der Papierkorb ist ausgeschaltet: Die Ausgangsdokumente sind nach dem Zusammenfügen weg. Bitte bestätigen.', { rueckfrage: true, papierkorb: false });
      }
    }
    const buf = await fuegeZusammen(quellen.map((q) => q.inhalt));
    if (buf.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Zusammengefügt wäre das PDF größer als 100 MB.');
    let name = dateiname(text(e.name) || quellen[0].d.name);
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    // Erst entfernen, dann ablegen: so bekommt das Ergebnis den Namen des ersten ohne „(2)“.
    if (entfernen) for (const q of quellen) await this.loescheDokument(q.d.id, von);
    const neu = (await this.ladeHoch(ziel.id, { register: reg.key, name, typ: 'application/pdf', herkunft: 'bearbeitet' }, buf, von)).dokument;
    const was = { dokument: neu.name, zusammengefuegt: quellen.map((q) => q.d.name), seiten: (await seitenInfo(buf)).anzahl };
    await this.notiere(ziel.id, von, 'pdf_bearbeitet', { ...was, text: `${quellen.length} PDFs zu „${neu.name}“ zusammengefügt` });
    const erledigt: string[] = [];
    if (entfernen) {
      const zielTitel = await this.titel(ziel);
      for (const mid of mappen.filter((x) => x !== ziel.id)) {
        const p = await this.repo.holeMappe(mid);
        const t = p ? await this.repo.holeTyp(p.typId) : undefined;
        if (!p || t?.system !== 'post' || (await this.repo.listeDokumente(mid)).length) continue;
        await this.schreibeSystemMappe(t, p.id, { ...p.werte, bezug: [...new Set([...alsListe(p.werte.bezug), ziel.id])], stand: POST_STAND.erledigt }, von);
        await this.notiere(p.id, von, 'zugeordnet', { text: `Dokumente zusammengefügt in „${zielTitel}“`, ziel: ziel.id, zielTyp: ziel.typId });
        await this.postAufgaben(p.id, von);
        erledigt.push(p.id);
      }
    }
    protokoll.modul('dokumente').info('PDFs zusammengefügt', { ziel: ziel.id, anzahl: quellen.length, entfernt: entfernen });
    return { dokument: neu, erledigtePost: erledigt };
  }

  /* ---------- PDF verkleinern (#393) ---------- */

  /** Schätzungen je Prüfwert (Analyse ist schnell, aber nicht kostenlos – die Werkbank fragt viele ab). */
  private readonly analysen = new Map<string, Analyse>();
  private async analyseVon(d: Dokument): Promise<Analyse> {
    const da = this.analysen.get(d.sha256);
    if (da) return da;
    const a = await analysiere(await this.liesGanz(d.sha256));
    if (this.analysen.size > 500) this.analysen.delete(this.analysen.keys().next().value!);
    this.analysen.set(d.sha256, a);
    return a;
  }

  /** Für den Dialog: Größe, Bilder und geschätzte Größe je Stufe; dazu, was mit dem Ergebnis geschieht. */
  async verkleinernVorschau(id: string) {
    const { d } = await this.pdfVon(id);
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, ...(await this.analyseVon(d)), versioniert: !!reg?.versionierung, papierkorb: (await this.papierkorbTage()) > 0, mindestens: MIN_ERSPARNIS };
  }

  /**
   * Verkleinern am Dokument: Ergebnis als neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen
   * nach Rückfrage (`bestaetigt`), das bisherige kommt in den Papierkorb (wie „PDF bearbeiten“, #335).
   * Der Volltext bleibt (die Textebene ist unverändert), es gibt keine neue Texterkennung.
   * Bringt es weniger als 10 %, bleibt alles, wie es ist (`unveraendert: true`). `ohneOriginal` (Sammelaktion):
   * die bisherige Version nicht behalten – nur außerhalb einer Aufbewahrungsfrist.
   */
  async verkleinereDokument(id: string, eingabe: unknown, von: string | null): Promise<{ dokument: Dokument; unveraendert: boolean; vorher: number; nachher: number; stufe: Stufe; meldung: string }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const stufe = e.stufe === undefined ? STANDARD_STUFE : stufeAus(e.stufe) ?? STANDARD_STUFE;
    const { d, inhalt } = await this.pdfVon(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, 'Das Register dieses Dokuments gibt es nicht mehr.');
    const korb = (await this.papierkorbTage()) > 0;
    if (!reg.versionierung && e.bestaetigt !== true) {
      throw new Fachfehler(409, `Für dieses Register ist die Versionierung ausgeschaltet: Das verkleinerte PDF ersetzt das bisherige${korb ? ', das bisherige kommt in den Papierkorb' : ' – das bisherige ist danach weg'}. Bitte bestätigen.`, { rueckfrage: true, papierkorb: korb });
    }
    const r = await verkleinere(inhalt, stufe);
    if (!r.lohnt) {
      const meldung = `„${d.name}“ lässt sich kaum verkleinern (weniger als ${Math.round(MIN_ERSPARNIS * 100)} %) – das Dokument bleibt unverändert.`;
      return { dokument: d, unveraendert: true, vorher: r.vorher, nachher: r.vorher, stufe, meldung };
    }
    const ocr = d.ocr?.stand === 'fertig' ? { text: (await this.repo.volltext(d.id)) ?? '', seiten: d.ocr.seiten ?? null, info: d.ocr.info ?? null } : null;
    let neu: Dokument;
    if (reg.versionierung) {
      const v = await this.repo.ersetzeDokument(d.id, {
        name: d.name, mime: 'application/pdf', groesse: r.inhalt.length, sha256: await this.legeDateiAb(r.inhalt), anzeigbar: true,
        erstelltVon: von, herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr.text } : {}),
      });
      if (ocr) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...ocr });
      this.vorschau?.einreihen([v]);
      neu = await this.nachNeuerVersion(d, v, typ, reg, von);
      if (e.ohneOriginal === true && (await this.archivErlaubt(d.mappeId))) {
        const sha = await this.repo.loescheVersion(d.id, v.version! - 1);
        if (sha) await this.raeumeAuf(sha);
        neu = (await this.repo.holeDokument(d.id)) ?? neu;
      }
    } else {
      await this.loescheDokument(d.id, von);
      neu = (await this.ladeHoch(d.mappeId, { register: reg.key, name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr } : {}) }, r.inhalt, von)).dokument;
      if (d.archivnummer) neu = await this.setzeArchivnummer(neu.id, d.archivnummer, von).catch(() => neu);
    }
    const text = `verkleinert ${ergebnisText(r.vorher, r.nachher)}, Stufe ${STUFEN[stufe].name} (${STUFEN[stufe].dpi} dpi)`;
    await this.notiere(d.mappeId, von, 'pdf_bearbeitet', { dokument: d.name, text, verkleinert: { vorher: r.vorher, nachher: r.nachher, stufe }, seiten: r.seiten, vorher: r.seiten });
    protokoll.modul('dokumente').info('PDF verkleinert', { id: d.id, stufe, vorher: r.vorher, nachher: r.nachher, bilder: r.bilder });
    return { dokument: neu, unveraendert: false, vorher: r.vorher, nachher: r.nachher, stufe, meldung: `Verkleinert ${ergebnisText(r.vorher, r.nachher)}.` };
  }

  private async legeDateiAb(inhalt: Buffer): Promise<string> {
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    await this.dateien.schreibe(sha256, inhalt);
    return sha256;
  }

  /** Darf eine ältere Version weg? Nicht während einer Aufbewahrungsfrist (Archivmodus, #212). */
  private async archivErlaubt(mappeId: string): Promise<boolean> {
    try { await this.pruefeArchivDokument(mappeId, 'löschen'); return true; } catch { return false; }
  }

  /** Einstellung „automatisch verkleinern“ (Werkbank → Systemzustand); Standard aus. */
  async verkleinernEinstellung(): Promise<VerkleinernEinstellung> {
    return verkleinernEinstellungAus(await this.einstellungen?.lies('verkleinern'));
  }
  async setzeVerkleinernEinstellung(eingabe: unknown): Promise<VerkleinernEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(409, 'Einstellungen sind nicht verfügbar.');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const abMb = Number(e.abMb);
    if (!Number.isFinite(abMb) || abMb < 1 || abMb > 100) throw new Fachfehler(422, 'Ab welcher Größe: 1 bis 100 MB.');
    if (!istStufe(e.stufe)) throw new Fachfehler(422, 'Stufe: bildschirm, standard oder druck.');
    const neu: VerkleinernEinstellung = { automatisch: e.automatisch === true, abMb: Math.round(abMb * 10) / 10, stufe: e.stufe };
    await this.einstellungen.schreibe('verkleinern', neu);
    protokoll.modul('werkbank').info('Automatisch verkleinern geändert', { ...neu });
    return neu;
  }

  /** Verkleinert ein neues PDF, wenn das eingeschaltet ist und es groß genug ist; null = unverändert lassen. */
  private async automatischVerkleinert(inhalt: Buffer, name: string) {
    if (erkenneAnzeigbar(inhalt) !== 'application/pdf') return null;
    const e = await this.verkleinernEinstellung();
    if (!e.automatisch || inhalt.length < e.abMb * 1024 * 1024) return null;
    try {
      const r = await verkleinere(inhalt, e.stufe);
      if (!r.lohnt) return null;
      protokoll.modul('dokumente').info('Neues PDF automatisch verkleinert', { name, vorher: r.vorher, nachher: r.nachher, stufe: e.stufe });
      return r;
    } catch (x) {
      // Lässt es sich nicht verkleinern (verschlüsselt, beschädigt), wird es so abgelegt, wie es kam.
      protokoll.modul('dokumente').warn('Automatisch verkleinern übersprungen', { name, fehler: (x as Error).message });
      return null;
    }
  }

  /**
   * Werkbank: große PDF-Dokumente nach Größe, mit geschätzter Ersparnis der Stufe. Geschätzt werden nur die
   * ersten `GROSSE_MIT_SCHAETZUNG` (die Liste soll schnell da sein); `ab` in MB.
   */
  async grosseDokumente(f: { ab?: unknown; stufe?: unknown }) {
    const ab = Number(f.ab ?? 2);
    if (!Number.isFinite(ab) || ab < 0 || ab > 100) throw new Fachfehler(422, 'ab: 0 bis 100 MB.');
    const stufe = f.stufe === undefined || f.stufe === '' ? STANDARD_STUFE : stufeAus(f.stufe) ?? STANDARD_STUFE;
    const docs = await this.repo.grossePdfs(Math.round(ab * 1024 * 1024), GROSSE_MAX);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    const eintraege = [];
    for (const [i, d] of docs.entries()) {
      let geschaetzt: number | null = null, lohnt: boolean | null = null, fehler: string | null = null;
      if (i < GROSSE_MIT_SCHAETZUNG) {
        try { const a = (await this.analyseVon(d)).stufen[stufe]; geschaetzt = a.geschaetzt; lohnt = a.lohnt; } catch (x) { fehler = (x as Error).message; }
      }
      const b = bezuege.get(d.mappeId);
      eintraege.push({ id: d.id, name: d.name, groesse: d.groesse, mappeId: d.mappeId, mappeTitel: b?.titel ?? '', typId: b?.typId ?? null, version: d.version ?? 1, geschaetzt, lohnt, fehler });
    }
    const geschaetzteErsparnis = eintraege.reduce((s, x) => s + (x.lohnt && x.geschaetzt != null ? x.groesse - x.geschaetzt : 0), 0);
    return { stufe, ab, eintraege, geschaetzteErsparnis, mehr: docs.length === GROSSE_MAX };
  }

  /** Sammelaktion „Große Dokumente verkleinern“ als Hintergrundauftrag (eine Phase, Einheit Dokumente). */
  verkleinereViele(eingabe: unknown, von: { id: string | null; email: string }) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.ids) ? [...new Set(e.ids.map(String))].filter(istUuid) : [];
    if (!ids.length) throw new Fachfehler(422, 'Bitte mindestens ein Dokument wählen.');
    if (ids.length > GROSSE_MAX) throw new Fachfehler(422, `Höchstens ${GROSSE_MAX} Dokumente auf einmal.`);
    const stufe = stufeAus(e.stufe ?? STANDARD_STUFE) ?? STANDARD_STUFE;
    const ohneOriginal = e.ohneOriginal === true;
    // Ohne Versionierung ersetzt das Verkleinern das Dokument – das muss hier einmal für alle bestätigt sein.
    const bestaetigt = e.bestaetigt === true;
    return this.auftraege.starte('pdf-verkleinern', `${ids.length} ${ids.length === 1 ? 'PDF' : 'PDFs'} verkleinern (${STUFEN[stufe].name})`, async (fortschritt) => {
      let vorher = 0, nachher = 0, verkleinert = 0, unveraendert = 0;
      const fehler: Array<{ id: string; name: string; grund: string }> = [];
      fortschritt(0, ids.length);
      for (const [i, id] of ids.entries()) {
        try {
          const r = await this.verkleinereDokument(id, { stufe, bestaetigt, ohneOriginal }, von.id);
          if (r.unveraendert) unveraendert++; else { verkleinert++; vorher += r.vorher; nachher += r.nachher; }
        } catch (x) {
          const d = await this.repo.holeDokument(id).catch(() => undefined);
          fehler.push({ id, name: d?.name ?? id, grund: (x as Error).message });
        }
        fortschritt(i + 1, ids.length);
      }
      protokoll.modul('werkbank').info('Große Dokumente verkleinert', { von: von.email, stufe, verkleinert, unveraendert, fehler: fehler.length, vorher, nachher });
      return { stufe, verkleinert, unveraendert, fehler, vorher, nachher, ohneOriginal };
    }, [{ key: 'dokumente', name: 'PDFs verkleinern', einheit: 'Dokumente' }]);
  }

  /* ---------- Schwärzen (#392) ---------- */

  /** Wörter mit Lage je Prüfwert (die Analyse kann Texterkennung brauchen – der Dialog fragt Seite für Seite). */
  private readonly schwaerzAnalysen = new Map<string, Promise<SchwaerzAnalyse>>();
  private ocrWerkzeuge?: Promise<string[]>;

  /** Sprachen für die Texterkennung beim Schwärzen: wie eingestellt, soweit installiert; null ohne tesseract. */
  private async schwaerzSprachen(): Promise<string | null> {
    this.ocrWerkzeuge ??= pruefeWerkzeuge().then((w) => (w.tesseract && w.pdftoppm ? w.sprachen : []), () => []);
    const da = await this.ocrWerkzeuge;
    if (!da.length) return null;
    const e = ocrAusGespeichert(await this.einstellungen?.lies('ocr') ?? null);
    return e.sprachen.split('+').filter((x) => da.includes(x)).join('+') || da[0];
  }

  private async schwaerzbar(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, `„${d.name}“ lässt sich nicht schwärzen – das geht mit PDFs und Bildern (JPEG, PNG).`);
    return { d, inhalt: await this.liesGanz(d.sha256) };
  }

  private schwaerzAnalyseVon(d: Dokument, inhalt: () => Promise<Buffer>): Promise<SchwaerzAnalyse> {
    let p = this.schwaerzAnalysen.get(d.sha256);
    if (!p) {
      p = (async () => schwaerzAnalyse(await inhalt(), d.mime, { sprachen: await this.schwaerzSprachen(), maxErkennung: SCHWAERZEN_MAX_SEITEN }))();
      this.schwaerzAnalysen.set(d.sha256, p);
      p.catch(() => this.schwaerzAnalysen.delete(d.sha256));
      while (this.schwaerzAnalysen.size > 20) this.schwaerzAnalysen.delete(this.schwaerzAnalysen.keys().next().value!);
    }
    return p;
  }

  /** Für den Dialog: Seiten mit Größe und Wörtern (für Suchbegriffe und Vorschläge), was mit dem Ergebnis geschieht. */
  async schwaerzenVorschau(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, `„${d.name}“ lässt sich nicht schwärzen – das geht mit PDFs und Bildern (JPEG, PNG).`);
    const a = await this.schwaerzAnalyseVon(d, () => this.liesGanz(d.sha256));
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, mime: d.mime, sha256: d.sha256, ...a, versioniert: !!reg?.versionierung, kopieName: geschwaerztName(d.name), muster: MUSTER };
  }

  /** Seitenbild für den Dialog (größer als die Seitenansicht; Bilder in derselben Ausrichtung wie beim Schwärzen). */
  private readonly schwaerzBilder = new Map<string, Promise<Buffer | null>>();
  async schwaerzSeitenbild(id: string, nr: number): Promise<Buffer | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    if (!kannSchwaerzen(d.mime) || !Number.isInteger(nr) || nr < 1 || nr > SCHWAERZEN_MAX_SEITEN) return null;
    const k = `${d.sha256}:${nr}`;
    let p = this.schwaerzBilder.get(k);
    if (!p) {
      p = (async () => schwaerzSeitenbild(await this.liesGanz(d.sha256), d.mime, nr))();
      this.schwaerzBilder.set(k, p);
      p.catch(() => this.schwaerzBilder.delete(k));
      while (this.schwaerzBilder.size > 40) this.schwaerzBilder.delete(this.schwaerzBilder.keys().next().value!);
    }
    return p;
  }

  /**
   * Schwärzen (#392): `bereiche` (Seite ab 1, x, y, b, h relativ), `begriffe` (überall schwärzen) und/oder
   * `muster` (alle Vorschläge dieser Arten) → neues Dokument „… (geschwärzt)“ im selben Register (`ziel`
   * „kopie“, Standard) oder neue Version (`ziel` „version“, nur mit Versionierung). Das Original bleibt.
   * Historie und Protokoll nennen nur Zahlen, nie die Suchbegriffe oder den geschwärzten Text.
   */
  async schwaerzeDokument(id: string, eingabe: unknown, von: string | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ziel = e.ziel === undefined || e.ziel === null || e.ziel === '' ? 'kopie' : e.ziel;
    if (ziel !== 'kopie' && ziel !== 'version') throw new Fachfehler(422, 'ziel: kopie oder version.');
    const { d, inhalt } = await this.schwaerzbar(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, 'Das Register dieses Dokuments gibt es nicht mehr.');
    if (ziel === 'version' && !reg.versionierung) throw new Fachfehler(409, 'Für dieses Register ist die Versionierung ausgeschaltet – die geschwärzte Fassung kann nur ein eigenes Dokument werden (ziel: kopie).');
    let begriffe: string[];
    try { begriffe = pruefeBegriffe(e.begriffe); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const roh = e.muster === undefined || e.muster === null ? [] : Array.isArray(e.muster) ? e.muster : [e.muster];
    if (roh.some((m) => !istMuster(m))) throw new Fachfehler(422, `muster: ${Object.keys(MUSTER).join(', ')}.`);
    const muster = [...new Set(roh)] as Array<keyof typeof MUSTER>;
    const a = await this.schwaerzAnalyseVon(d, async () => inhalt);
    let bereiche: Bereich[];
    try { bereiche = pruefeBereiche(e.bereiche, a.seiten.length); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const gefunden = begriffe.map((b) => findeBegriff(a.seiten, b));
    bereiche = [...bereiche, ...bereicheVon(a.seiten, gefunden.flat()), ...(muster.length ? bereicheVon(a.seiten, findeMuster(a.seiten, muster)) : [])];
    if (!bereiche.length) {
      throw new Fachfehler(422, begriffe.length || muster.length
        ? `Nichts zu schwärzen: ${begriffe.length ? (begriffe.length === 1 ? 'Der Suchbegriff kommt im Text des Dokuments nicht vor' : 'Keiner der Suchbegriffe kommt im Text des Dokuments vor') : 'Keines der Muster kommt im Text des Dokuments vor'}${a.quelle === 'keine' ? ' (das Dokument hat keinen lesbaren Text)' : ''}.`
        : 'Nichts zu schwärzen: Bitte Bereiche, Suchbegriffe oder Muster angeben.');
    }
    const r = await schwaerze(inhalt, d.mime, a, bereiche);
    const volltext = r.text !== null ? { text: r.text, seiten: r.seiten, info: 'Textebene nach dem Schwärzen (ohne die geschwärzten Stellen)' } : null;
    const stellen = stellenText(bereiche);
    let neu: Dokument;
    if (ziel === 'version') {
      const sha256 = await this.legeDateiAb(r.inhalt);
      neu = await this.inTransaktion(async () => {
        const v = await this.repo.ersetzeDokument(d.id, {
          name: d.name, mime: r.mime, groesse: r.inhalt.length, sha256, anzeigbar: true, erstelltVon: von, herkunft: 'geschwaerzt',
          ...(volltext ? { volltext: volltext.text } : {}),
        });
        if (volltext) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...volltext });
        this.danach(() => this.vorschau?.einreihen([v]));
        const x = await this.nachNeuerVersion(d, { ...v, ocr: volltext ? { stand: 'fertig' } as Dokument['ocr'] : v.ocr }, typ, reg, von);
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: d.name, text: `geschwärzte Fassung als Version ${x.version ?? ''} von „${d.name}“ erstellt (${stellen})`, version: x.version, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    } else {
      neu = await this.inTransaktion(async () => {
        const x = (await this.ladeHoch(d.mappeId, { register: reg.key, name: geschwaerztName(d.name), typ: r.mime, herkunft: 'geschwaerzt', ...(volltext ? { volltext } : {}) }, r.inhalt, von)).dokument;
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: x.name, text: `geschwärzte Fassung „${x.name}“ von „${d.name}“ erstellt (${stellen})`, quelle: d.name, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    }
    protokoll.modul('dokumente').info('Dokument geschwärzt', { id: d.id, neu: neu.id, ziel, stellen: r.bereiche, seiten: r.betroffen, begriffe: begriffe.length, muster });
    return {
      dokument: neu, ziel, stellen: r.bereiche, seiten: r.betroffen,
      begriffe: gefunden.map((f) => ({ gefunden: f.length })),
      meldung: ziel === 'version' ? `Geschwärzt (${stellen}) – Version ${neu.version ?? ''}; die ungeschwärzte Fassung bleibt als ältere Version.` : `„${neu.name}“ angelegt (${stellen}); das Original bleibt unverändert.`,
    };
  }

  /* ---------- Archivnummer (#345) ---------- */

  /** Der Nummernkreis der Archivnummern; entsteht beim ersten Gebrauch („A-000001“), Muster in der Werkbank änderbar. */
  async archivKreis(): Promise<Nummernkreis> {
    const da = (await this.repo.listeNummernkreise()).find((k) => k.schluessel === ARCHIV_KREIS);
    return da ?? this.repo.speichereNummernkreis({ schluessel: ARCHIV_KREIS, name: 'Archivnummer', muster: 'A-{zaehler:6}', start: 1 });
  }

  /** Archivnummer am Dokument setzen oder entfernen (leer); eindeutig je Haushalt. */
  async setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    const nr = archivnummerAus(eingabe);
    if (nr && nr.length > 40) throw new Fachfehler(422, 'Die Archivnummer ist zu lang (höchstens 40 Zeichen).');
    if (nr && /\s/.test(nr)) throw new Fachfehler(422, 'Die Archivnummer darf keine Leerzeichen enthalten.');
    if ((d.archivnummer ?? null) === nr) return d;
    if (!(await this.repo.setzeArchivnummer(id, nr))) {
      throw new Fachfehler(409, `Die Archivnummer „${nr}“ hat schon ein anderes Dokument. Jede Nummer gibt es nur einmal – prüfe den Aufkleber.`);
    }
    await this.notiere(d.mappeId, von, 'archivnummer', { dokument: d.name, text: nr ? `${d.name}: ${nr}` : `${d.name}: entfernt`, alt: d.archivnummer ?? null, neu: nr });
    protokoll.modul('dokumente').info(nr ? 'Archivnummer gesetzt' : 'Archivnummer entfernt', { id, nr, vorher: d.archivnummer ?? undefined });
    return (await this.repo.holeDokument(id))!;
  }

  /** Dokument zu einer Archivnummer (auch mit Präfix aus dem Barcode); nur, wenn die Mappe lesbar ist. */
  async findeArchivnummer(eingabe: unknown, z?: Zugriff) {
    const nr = archivnummerAus(eingabe);
    const d = nr ? await this.repo.findeArchivnummer(nr) : undefined;
    const m = d ? await this.repo.holeMappe(d.mappeId) : undefined;
    if (!d || !m || !(await this.lesbare(z, [m.id])).has(m.id)) throw new Fachfehler(404, `Zur Archivnummer „${nr ?? ''}“ gibt es kein Dokument, das du sehen darfst.`);
    return { dokument: d, mappeId: m.id, typId: m.typId, titel: m.titel ?? '' };
  }

  /**
   * Aufkleberbogen (#345): `anzahl` neue Nummern aus dem Kreis „Archivnummer“ ziehen – gedruckte Nummern
   * gelten als vergeben – und als PDF für das gewählte Etikettenformat ab Feld `start`.
   */
  async archivAufkleber(eingabe: unknown, von: string) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const anzahl = Number(e.anzahl ?? 0);
    const etikett = String(e.etikett ?? '48x25') as Etikett;
    const start = Number(e.start ?? 1);
    if (!(etikett in ETIKETTEN)) throw new Fachfehler(422, 'Unbekanntes Etikettenformat.');
    const f = ETIKETTEN[etikett];
    if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 500) throw new Fachfehler(422, 'Bitte 1 bis 500 Aufkleber.');
    if (!Number.isInteger(start) || start < 1 || start > f.spalten * f.zeilen) throw new Fachfehler(422, `Das Startfeld muss zwischen 1 und ${f.spalten * f.zeilen} liegen.`);
    await this.archivKreis();
    const nummern = await this.repo.zieheNummern(ARCHIV_KREIS, anzahl, new Date());
    const pdf = await aufkleberPdf(nummern, etikett, start, ARCHIV_PRAEFIX);
    protokoll.modul('werkbank').info('Aufkleber mit Archivnummern erzeugt', { von, anzahl, erste: nummern[0], letzte: nummern[nummern.length - 1], etikett });
    return { pdf, erste: nummern[0], letzte: nummern[nummern.length - 1] };
  }

  /* ---------- Vollexport (#254) ---------- */

  /** Datenquelle für den Vollexport; Benutzer, Designs und Protokoll kommen von außen. */
  vollexportQuelle(x: { mandant: string; version: string; benutzer: ExportQuelle['benutzer']; designs: ExportQuelle['designs']; protokoll: ExportQuelle['protokoll'] }): ExportQuelle {
    const r = this.repo;
    const bezugCache = new Map<string, MappenBezug | undefined>();
    return {
      ...x,
      typen: () => r.listeTypen(),
      sichten: () => r.listeSichten(),
      nummernkreise: () => r.listeNummernkreise(),
      pakete: () => r.listePakete(),
      mappen: (typId) => r.listeMappen(typId),
      papierkorb: () => r.papierkorb(),
      papierkorbDokumente: () => r.papierkorbDokumente(),
      // Gebündelt (#367): ein Zugriff je Paket, nicht je Mappe oder Dokument.
      dokumente: (ids) => r.dokumenteVon(ids),
      versionen: (ids) => r.versionenVonDokumenten(ids),
      volltexte: (ids) => r.volltexte(ids),
      datei: (sha) => this.dateien.lies(sha),
      notizen: (ids) => r.notizenVon(ids),
      aufgaben: (ids) => r.aufgabenVonMappen(ids),
      erinnerungen: () => r.erinnerungen(),
      historie: (ids) => r.historieVon(ids),
      favoriten: () => r.alleFavoriten(),
      passwort: (w) => (istVerschluesselt(w) ? this.tresor?.entschluessele(w) ?? null : null),
      pdf: async (titel, mappen, typ, uebersicht) => {
        const ids = mappen.flatMap((m) => [...verweiseVon(typ, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
        // Bezüge merken (#367): je Mappe ein PDF, die Ziele wiederholen sich (Benutzer, Partner).
        const fehlt = [...new Set(ids)].filter((id) => !bezugCache.has(id));
        if (fehlt.length) { const neu = await r.bezuege(fehlt); for (const id of fehlt) bezugCache.set(id, neu.get(id)); }
        const b = new Map([...new Set(ids)].map((id) => [id, bezugCache.get(id)] as const));
        const quelle = { typen: new Map([[typ.id, typ]]), titel: (id: string | null | undefined) => (id ? b.get(id)?.titel ?? '' : '') };
        return mappenPdf(titel, mappen.map((m) => ({ mappe: m, typ, dokumente: [], inhalt: async () => Buffer.alloc(0) })), quelle, uebersicht ? { spalten: exportSpalten([typ], 'liste'), typen: [typ] } : null);
      },
    };
  }

  /**
   * Persönlicher Export (#255): gleiches Format wie der Vollexport, beschränkt auf Mappen, die der
   * Benutzer lesen darf; seine Aufgaben, Erinnerungen, Favoriten, sein Profil. Keine Struktur anderer
   * Benutzer, keine Protokolle. Passwörter nur, wo er sie sehen darf (und nur mit Bestätigung).
   */
  async persoenlicheQuelle(z: Zugriff, x: { mandant: string; version: string; ich: { benutzer: Array<Record<string, unknown>>; vertretungen: Vertretung[] } }): Promise<ExportQuelle> {
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => x.ich, designs: async () => [], protokoll: () => [] });
    const ich = z.ich.id;
    const mappenJeTyp = new Map<string, Mappe[]>();
    const lesbar = new Set<string>();
    const pwErlaubt = new Set<string>();
    for (const t of await this.repo.listeTypen()) {
      const alle = await this.repo.listeMappen(t.id);
      const ok = await this.lesbare(z, alle.map((m) => m.id));
      const ms = alle.filter((m) => ok.has(m.id));
      if (!ms.length) continue;
      mappenJeTyp.set(t.id, ms);
      // Rechte gebündelt je Typ (#367) statt einer Abfrage je Mappe.
      const p = await this.rechteAnVielen(z, ms);
      for (const m of ms) { lesbar.add(m.id); if (z.admin || p.get(m.id)?.P) pwErlaubt.add(m.id); }
    }
    const typen = (await this.repo.listeTypen()).filter((t) => mappenJeTyp.has(t.id));
    const passwortVon = new Map<unknown, boolean>();
    for (const [, ms] of mappenJeTyp) for (const m of ms) for (const v of Object.values(m.werte)) if (istVerschluesselt(v)) passwortVon.set(v, pwErlaubt.has(m.id));
    return {
      ...voll,
      typen: async () => typen,
      sichten: async () => [],
      nummernkreise: async () => [],
      pakete: async () => [],
      mappen: async (typId) => mappenJeTyp.get(typId) ?? [],
      papierkorb: async () => (await this.repo.papierkorb({ von: ich })),
      aufgaben: async (ids) => (await this.repo.aufgabenVonMappen(ids)).filter((a) => a.empfaengerId === ich || a.erstelltVon === ich),
      erinnerungen: async () => (await this.repo.erinnerungen({ empfaengerId: ich })).filter((e) => lesbar.has(e.mappeId)),
      favoriten: async () => (await this.repo.alleFavoriten()).filter((f) => f.benutzerId === ich),
      passwort: (w) => (passwortVon.get(w) ? voll.passwort(w) : null),
    };
  }

  /* ---------- Baum-Sammlung über Verweise (#396, #424) ---------- */

  /** Datenquelle der Baum-Sammlung für einen Zugriff (Rechte des Aufrufers). */
  baumQuelle(z: Zugriff): BaumQuelle {
    const r = this.repo;
    return {
      typen: z.typen,
      mappen: (ids) => r.holeMappen(ids),
      kanten: (ids) => r.kantenVon(ids),
      lesbare: (ids) => this.lesbare(z, ids),
      bezuege: (ids) => r.bezuege(ids),
      dokumente: (ids) => r.zaehleDokumente(ids),
      rechte: (ms) => this.rechteAnVielen(z, ms),
    };
  }

  /**
   * Alle Mappen, die über Verweise an `startId` hängen (#396, #424) – innerhalb der Rechte des
   * Aufrufers. Benutzer und Rollen sind ohne Angabe von `ohneTypen` ausgenommen.
   */
  async baum(startId: string, eingabe: unknown, z: Zugriff): Promise<Baum> {
    const sys = await this.sichereSystem();
    const opt = bereinigeBaumOptionen(eingabe, { ...BAUM_STANDARD, ohneTypen: [sys.benutzer.id, sys.rolle.id] });
    return sammleBaum(this.baumQuelle(z), startId, opt);
  }

  /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396) ---------- */

  async datenschutz(): Promise<Datenschutz> { return liesDatenschutz(await this.einstellungen?.lies('datenschutz')); }

  async setzeDatenschutz(eingabe: unknown, von: string): Promise<Datenschutz> {
    const sys = await this.sichereSystem();
    const typen = new Set((await this.repo.listeTypen()).filter((t) => t.id !== sys.benutzer.id && t.id !== sys.rolle.id).map((t) => t.id));
    const d = liesDatenschutz(eingabe);
    d.typen = Object.fromEntries(Object.entries(d.typen).filter(([id]) => typen.has(id)));
    await this.einstellungen?.schreibe('datenschutz', d);
    protokoll.modul('datenschutz').info('Einstellungen für Auskünfte gespeichert', { von, personentypen: personenTypen(d).length });
    return d;
  }

  /** Inhalte je Mappe für die Prüfliste: Dokumente, Notizen, Historie, Hinweis auf Dritte. */
  private async auskunftInhalte(ids: string[], typen: Map<string, Mappentyp>, dritte: Map<string, string[]>): Promise<Record<string, AuskunftMappe>> {
    const r = this.repo;
    const mappen = new Map((await r.holeMappen(ids)).map((m) => [m.id, m] as const));
    const erg: Record<string, AuskunftMappe> = {};
    for (const id of ids) erg[id] = { dokumente: [], notizen: [], historie: 0, dritte: dritte.get(id) ?? [], ohneFelder: [] };
    for (let i = 0; i < ids.length; i += 500) {
      const teil = ids.slice(i, i + 500);
      const [doks, notizen, historie] = await Promise.all([r.dokumenteVon(teil), r.notizenVon(teil), r.historieVon(teil)]);
      const geschwaerzt = new Map<string, string>();
      for (const d of doks) if (d.herkunft === 'geschwaerzt') geschwaerzt.set(`${d.mappeId}|${d.name}`, d.id);
      for (const d of doks) {
        const typ = typen.get(mappen.get(d.mappeId)?.typId ?? '');
        erg[d.mappeId]?.dokumente.push({
          id: d.id, name: d.name, register: typ?.register.find((x) => x.key === d.registerKey)?.name ?? d.registerKey, mime: d.mime, groesse: d.groesse,
          geschwaerzt: d.herkunft === 'geschwaerzt',
          geschwaerzteFassung: d.herkunft === 'geschwaerzt' ? null : geschwaerzt.get(`${d.mappeId}|${geschwaerztName(d.name)}`) ?? null,
          aeltere: d.aeltere ?? 0, schwaerzbar: kannSchwaerzen(d.mime),
        });
      }
      for (const n of notizen) erg[n.mappeId]?.notizen.push({ id: n.id, erstellt: n.erstellt, text: alsText(n.text).slice(0, 300) });
      for (const h of historie) if (erg[h.mappeId]) erg[h.mappeId].historie++;
    }
    for (const [id, m] of mappen) {
      const typ = typen.get(m.typId);
      erg[id].ohneFelder = (typ?.felder ?? []).filter((f) => f.typ === 'passwort' && !istLeer(m.werte[f.key])).map((f) => f.label);
    }
    return erg;
  }

  /** Suchbegriffe aus der Mappe des Betroffenen: Titel, E-Mail, Kundennummer, IBAN, Name. */
  private auskunftBegriffe(m: Mappe, typ: Mappentyp | undefined): string[] {
    const b = new Set<string>();
    if ((m.titel ?? '').trim().length >= 4) b.add(m.titel!.trim());
    for (const f of typ?.felder ?? []) {
      if (f.typ !== 'text') continue;
      const v = auswahlText(m.werte[f.key]).trim();
      if (v.length < 4 || istVerschluesselt(v)) continue;
      if (/mail|kunden|nummer|iban|name|vertrags/i.test(`${f.key} ${f.label}`) || istEmail(v)) b.add(v);
    }
    return [...b].slice(0, 6);
  }

  /**
   * Prüfliste einer Auskunft (#396): Baum ab der Mappe des Betroffenen (Tiefe einstellbar, Vorgabe 2,
   * beide Richtungen, ohne Benutzer und Rollen), je Mappe Dokumente, Notizen, Historie; dazu
   * Volltext-Treffer außerhalb des Baums als Vorschläge.
   */
  async auskunftVorschau(e: unknown, z: Zugriff): Promise<AuskunftVorschau> {
    const o = (e ?? {}) as Record<string, unknown>;
    const mappeId = String(o.mappeId ?? '');
    const sys = await this.sichereSystem();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const baum = await this.baum(mappeId, { tiefe: o.tiefe, richtungen: o.richtungen, max: 1000, seitwaerts: false, ohneTypen: [...ohne] }, z);
    const im = new Set(baum.knoten.map((k) => k.id));
    // „Daten Dritter?“: Nachbarn außerhalb der Sammlung, die selbst eine Person sind (Mappentyp „betrifft eine Person“).
    const person = new Set(personenTypen(await this.datenschutz()));
    const dritte = new Map(baum.knoten.map((k) => [k.id, [...new Set([...k.aussen.verweistAuf, ...k.aussen.verwiesenVon]
      .filter((a) => !!a.typId && person.has(a.typId) && !ohne.has(a.typId)).map((a) => a.titel))]] as [string, string[]]));
    const mappen = await this.auskunftInhalte([...im], z.typen, dritte);
    // Volltext-Treffer (Name, E-Mail, Kundennummer, IBAN) – nur als Vorschlag.
    const start = (await this.repo.holeMappe(mappeId))!;
    const begriffe = o.vorschlaege === false ? [] : this.auskunftBegriffe(start, z.typen.get(start.typId));
    const vorschlaege: AuskunftVorschlag[] = [];
    const gesehen = new Set<string>();
    for (const begriff of begriffe) {
      const s = await this.repo.seite({ suche: begriff, volltext: true, notizen: true, lesen: z.lesen, von: 0, anzahl: 25 });
      for (const m of s.mappen) {
        if (im.has(m.id) || gesehen.has(m.id) || ohne.has(m.typId) || !z.typen.has(m.typId)) continue;
        gesehen.add(m.id);
        if (vorschlaege.length < 30) vorschlaege.push({ mappeId: m.id, typId: m.typId, typ: z.typen.get(m.typId)?.name ?? '', titel: m.titel ?? '', begriff });
      }
    }
    const vorschlagMappen = await this.auskunftInhalte(vorschlaege.map((v) => v.mappeId), z.typen, new Map());
    return { baum, mappen, vorschlaege, vorschlagMappen, begriffe, frist: fristBis(heuteIn()) };
  }

  /**
   * Auskunft vorbereiten (#396): Auswahl gegen eine frische Sammlung prüfen und die Daten für die ZIP
   * zusammenstellen. Passwortfelder und verschlüsselte Werte fallen weg (auch aus den Mappentypen),
   * ältere Versionen von Dokumenten ebenso.
   */
  async auskunftDaten(e: unknown, z: Zugriff, x: { mandant: string; version: string }): Promise<AuskunftDaten> {
    const o = (e ?? {}) as Record<string, unknown>;
    if (o.geprueft !== true) throw new Fachfehler(422, 'Bitte bestätige, dass du die Auswahl geprüft hast – ungeprüft geht nichts hinaus.');
    const vorschau = await this.auskunftVorschau({ mappeId: o.mappeId, tiefe: o.tiefe, richtungen: o.richtungen, vorschlaege: Array.isArray((o.auswahl as Record<string, unknown> | undefined)?.mappen) }, z);
    const bekannt = { ...vorschau.vorschlagMappen, ...vorschau.mappen };
    const a = liesAuswahl(o.auswahl);
    const p = auskunftProbleme(a, bekannt);
    if (p.length) throw new Fachfehler(422, p.join(' '));
    const passwort = typeof o.passwort === 'string' && o.passwort ? o.passwort : null;
    if (passwort && passwort.length < AUSKUNFT_PASSWORT_MIN) throw new Fachfehler(422, `Das Passwort für die ZIP-Datei braucht mindestens ${AUSKUNFT_PASSWORT_MIN} Zeichen.`);
    const start = (await this.repo.holeMappe(vorschau.baum.startId))!;
    const ds = await this.datenschutz();
    const ohneGeheim = (t: Mappentyp, w: Werte): Werte => Object.fromEntries(Object.entries(w).filter(([k, v]) => !istVerschluesselt(v) && t.felder.find((f) => f.key === k)?.typ !== 'passwort'));
    const mappen = (await this.repo.holeMappen(a.mappen)).filter((m) => z.typen.has(m.typId)).map((m) => ({ ...m, werte: ohneGeheim(z.typen.get(m.typId)!, m.werte) }));
    const typIds = new Set(mappen.map((m) => m.typId));
    const typen = [...typIds].map((id) => z.typen.get(id)!).map((t) => {
      const { berechtigungen: _b, stempel: _s, darfAnlegen: _d, ...rest } = t;
      return { ...rest, felder: t.felder.filter((f) => f.typ !== 'passwort') } as Mappentyp;
    });
    const dok = new Set(a.dokumente); const not = new Set(a.notizen); const hist = new Set(a.historie);
    const mitZurueckgehaltenen = new Set(Object.entries(bekannt).filter(([id, x]) => a.mappen.includes(id) && x.notizen.some((n) => !not.has(n.id))).map(([id]) => id));
    const jeTyp = new Map<string, Mappe[]>();
    for (const m of mappen) jeTyp.set(m.typId, [...jeTyp.get(m.typId) ?? [], m]);
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    const quelle: ExportQuelle = {
      ...voll,
      typen: async () => typen, sichten: async () => [], nummernkreise: async () => [], pakete: async () => [],
      mappen: async (typId) => jeTyp.get(typId) ?? [],
      papierkorb: async () => [], papierkorbDokumente: async () => [],
      dokumente: async (ids) => (await this.repo.dokumenteVon(ids)).filter((d) => dok.has(d.id)),
      versionen: async () => [],
      notizen: async (ids) => (await this.repo.notizenVon(ids)).filter((n) => not.has(n.id)),
      aufgaben: async () => [], erinnerungen: async () => [], favoriten: async () => [],
      // Historie: ohne frühere Auskünfte (deren Begründungen sind intern); Mappen mit zurückgehaltenen
      // Notizen ohne Notiz-Einträge – die Historie nennt den Text einer Notiz.
      historie: async (ids) => (await this.repo.historieVon(ids)).filter((h) => hist.has(h.mappeId) && h.art !== 'auskunft' && !(h.art === 'notiz' && mitZurueckgehaltenen.has(h.mappeId))),
      passwort: () => null,
    };
    // Herkunft (Kanal der Post) und Speicherdauer (Archivmodus) für das Deckblatt.
    const post = (await this.sichereSystem()).post;
    const kanaele: Record<string, number> = {};
    for (const m of jeTyp.get(post.id) ?? []) { const k = auswahlText(m.werte.kanal) || 'unbekannt'; kanaele[k] = (kanaele[k] ?? 0) + 1; }
    const dokumente = (await this.repo.dokumenteVon(a.mappen)).filter((d) => dok.has(d.id));
    const ziele = mappen.flatMap((m) => [...verweiseVon(z.typen.get(m.typId)!, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
    const titel = Object.fromEntries(Object.entries(await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(ziele)]))).map(([id, b]) => [id, b.titel]));
    return {
      titel,
      start: { id: start.id, titel: start.titel ?? '', typ: z.typen.get(start.typId)?.name ?? '' },
      datenschutz: ds, quelle, mappen, typen, kanaele, passwort,
      anzahl: { mappen: mappen.length, dokumente: dokumente.length, bytes: dokumente.reduce((s, d) => s + d.groesse, 0), notizen: not.size, historie: hist.size, ohneNotizen: a.ohneNotizen.filter((n) => !not.has(n.id)).length },
      gruende: a.ohneNotizen.filter((n) => !not.has(n.id)).map((n) => n.grund),
      empfaenger: typeof o.empfaenger === 'string' ? o.empfaenger.trim().slice(0, 2000) : ds.empfaenger,
      anmerkung: typeof o.anmerkung === 'string' ? o.anmerkung.trim().slice(0, 2000) : '',
      aufbewahrung: typen.map((t) => {
        const bis = (jeTyp.get(t.id) ?? []).map((m) => aufbewahrenBis(t.archiv, m)).filter((b): b is string => !!b).sort();
        return { typ: t.name, archiv: t.archiv ? { jahre: t.archiv.jahre, stichtag: t.archiv.stichtag ? t.felder.find((f) => f.key === t.archiv!.stichtag)?.label ?? t.archiv.stichtag : null } : null, bis: bis.at(-1) ?? null };
      }),
    };
  }

  /** Nachweis (#396): Historie des Betroffenen und Protokoll – nur Zahlen, keine Inhalte. */
  async auskunftNachweis(d: AuskunftDaten, von: { id: string; email: string }, info: { id: string; bytes: number }) {
    const n = d.anzahl;
    await this.notiere(d.start.id, von.id, 'auskunft', {
      text: `Auskunft nach Art. 15 DSGVO erstellt: ${n.mappen} ${n.mappen === 1 ? 'Mappe' : 'Mappen'}, ${n.dokumente} ${n.dokumente === 1 ? 'Dokument' : 'Dokumente'}`,
      mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, historie: n.historie, ohneNotizen: n.ohneNotizen,
      ...(d.gruende.length ? { gruende: d.gruende } : {}), verschluesselt: !!d.passwort, auskunft: info.id,
    });
    protokoll.modul('datenschutz').info('Auskunft erstellt', { mappeId: d.start.id, mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, ohneNotizen: n.ohneNotizen, verschluesselt: !!d.passwort, mb: Math.round(info.bytes / 1024 ** 2), von: von.email });
  }

  /** Frist (#396): Aufgabe „Auskunft an … bis <Eingang + 1 Monat>“ am Betroffenen, für den Administrator. */
  async auskunftFrist(e: unknown, z: Zugriff, von: string): Promise<Aufgabe> {
    const o = (e ?? {}) as Record<string, unknown>;
    const m = await this.pruefeRecht(z, String(o.mappeId ?? ''), 'R');
    const eingang = typeof o.eingang === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.eingang) ? o.eingang : heuteIn();
    const bis = fristBis(eingang);
    const text = `Auskunft nach Art. 15 DSGVO an ${m.titel || 'Ohne Titel'} bis ${datumText(bis)} (Anfrage vom ${datumText(eingang)})`;
    const a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId: m.id, empfaengerId: von, art: 'manuell', text, datum: bis, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(m.id, von, 'aufgabe', { text: `für ${await this.name(von)}: ${text}`, aufgabe: a.id, aufgabenart: 'manuell', fuer: von, aufgabentext: text });
    return this.leiteUm(a);
  }

  /* ---------- Auskunft zustellen (#455): per E-Mail oder Abruf-Link mit Abrufcode ---------- */

  /** Abruf-Links für die Werkbank – ohne die Hashes von Schlüssel und Code. */
  async auskunftLinks(f?: { mappeId?: string; auskunftId?: string; max?: number }): Promise<AuskunftLink[]> {
    return (await this.repo.auskunftLinks(f)).map(({ schluessel: _s, code: _c, ...l }) => l);
  }

  /** Gilt für diese Auskunft gerade ein Abruf-Link? Dann bleibt die ZIP nach dem eigenen Herunterladen liegen. */
  async auskunftLinkAktiv(auskunftId: string): Promise<boolean> {
    return (await this.repo.auskunftLinks({ auskunftId })).some((l) => linkStatus(l) === 'aktiv');
  }

  /**
   * Weg 1 (#455): die ZIP als Anhang über den E-Mail-Versand des DMS – nur verschlüsselt; das Passwort
   * kennt das DMS nicht und schickt es darum auch nie mit. Zu groß für E-Mail → Abruf-Link.
   */
  async auskunftPerEmail(stand: AuskunftStand & { name: string }, datei: () => Readable, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse). Nutze den Abruf-Link oder gib die Datei selbst weiter.');
    if (!stand.verschluesselt) throw new Fachfehler(422, 'Per E-Mail geht eine Auskunft nur mit Passwort (verschlüsselt). Erzeuge sie mit Passwort neu oder stelle sie über einen Abruf-Link zu.');
    if (stand.bytes > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, `Die Auskunft ist mit ${Math.round(stand.bytes / 1e6)} MB zu groß für eine E-Mail (höchstens ${Math.round(EMAIL_MAX_ANHAENGE / 1e6)} MB). Stelle sie über einen Abruf-Link zu.`);
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const { an, betreff, nachricht } = Dienst.emailKopf({ betreff: auskunftMail.zip().betreff, nachricht: auskunftMail.zip().nachricht, ...e });
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge: [{ name: `${stand.name}.zip`, mime: 'application/zip', inhalt: datei() }] });
    } catch (x) {
      throw new Fachfehler(502, `Die E-Mail wurde nicht verschickt: ${(x as Error).message}`);
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', { text: `Auskunft per E-Mail gesendet an ${an.join(', ')} (verschlüsselt, ${Math.max(1, Math.round(stand.bytes / 1024))} KB)`, zustellung: 'email', an, betreff, auskunft: stand.id, bytes: stand.bytes });
    protokoll.modul('datenschutz').info('Auskunft per E-Mail gesendet', { mappeId: stand.mappeId, empfaenger: an.length, mb: Math.round(stand.bytes / 1024 ** 2), von: ich.email });
    return { an };
  }

  /**
   * Weg 2 (#455): Abruf-Link für genau diese Auskunft. Schlüssel (256 Bit) und Abrufcode liefert nur diese
   * Antwort im Klartext; gespeichert sind ihre Hashes. Ein noch gültiger Link derselben Auskunft wird
   * zurückgezogen. Mit `senden` geht der Link (ohne Code) per E-Mail an die Person.
   */
  async auskunftLinkAnlegen(stand: AuskunftStand, eingabe: unknown, ich: { id: string; name: string; email: string }, x: { adresse: string; mailer: Mailer | null }) {
    const e = liesLinkEingabe(eingabe);
    if (e.fehler.length) throw new Fachfehler(422, e.fehler.join(' '));
    if (e.senden && !x.mailer) throw new Fachfehler(409, 'Der E-Mail-Versand ist nicht eingerichtet (Werkbank → E-Mail und Adresse). Kopiere den Link und schicke ihn selbst.');
    if (e.senden && !istEmail(e.an)) throw new Fachfehler(422, 'Bitte eine gültige E-Mail-Adresse für den Link angeben.');
    if (!x.adresse) throw new Fachfehler(409, 'Die Adresse des DMS ist nicht bekannt (Werkbank → E-Mail und Adresse).');
    for (const alt of await this.repo.auskunftLinks({ auskunftId: stand.id })) {
      if (linkStatus(alt) === 'aktiv' && (await this.repo.widerrufeAuskunftLink(alt.id))) await this.notiere(alt.mappeId, ich.id, 'auskunft', { text: 'Abruf-Link zurückgezogen (ersetzt durch einen neuen)', zustellung: 'link', link: alt.id, auskunft: stand.id });
    }
    const schluessel = neuerSchluessel();
    const code = e.code ?? neuerAbrufcode();
    const jetzt = new Date();
    const link: AuskunftLinkIntern = {
      id: randomUUID(), auskunftId: stand.id, mappeId: stand.mappeId, titel: stand.titel, schluessel: hasheSchluessel(schluessel), code: await hashePasswort(code),
      codeArt: e.code ? 'eigen' : 'erzeugt', empfaenger: e.an || null, erstellt: jetzt.toISOString(), erstelltVon: ich.id,
      ablauf: new Date(jetzt.getTime() + e.tage * 24 * 3600 * 1000).toISOString(), maxAbrufe: e.abrufe, abrufe: 0, fehlversuche: 0, gesperrt: null, widerrufen: null, abgerufen: null,
    };
    await this.repo.legeAuskunftLinkAn(link);
    const url = `${x.adresse.replace(/\/+$/, '')}/abruf#${schluessel}`;
    const bis = datumText(link.ablauf.slice(0, 10));
    if (e.senden) {
      const ds = await this.datenschutz();
      const m = auskunftMail.link(url, bis, link.maxAbrufe, ds.verantwortlicher);
      const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
      try { await x.mailer!.sende(e.an, m.betreff, m.nachricht, { antwortAn }); } catch (f) {
        await this.repo.widerrufeAuskunftLink(link.id);
        throw new Fachfehler(502, `Die E-Mail mit dem Link wurde nicht verschickt: ${(f as Error).message}`);
      }
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', {
      text: `Abruf-Link erstellt: gültig bis ${bis}, ${link.maxAbrufe === 1 ? 'ein Abruf' : `höchstens ${link.maxAbrufe} Abrufe`}${e.senden ? `, per E-Mail an ${e.an}` : ''}${link.codeArt === 'eigen' ? ', eigener Abrufcode' : ''}`,
      zustellung: 'link', link: link.id, auskunft: stand.id, ablauf: link.ablauf, maxAbrufe: link.maxAbrufe, ...(e.senden ? { an: [e.an] } : {}),
    });
    protokoll.modul('datenschutz').info('Abruf-Link erstellt', { mappeId: stand.mappeId, link: link.id, tage: e.tage, abrufe: e.abrufe, code: link.codeArt, mail: e.senden, von: ich.email });
    const { schluessel: _s, code: _c, ...ohne } = link;
    return { link: ohne as AuskunftLink, url, code, gesendet: e.senden };
  }

  /** Zurückziehen (#455): Der Link gilt sofort nicht mehr; die Zeile bleibt als Nachweis. */
  async auskunftLinkWiderrufen(id: string, ich: { id: string; email: string }): Promise<AuskunftLink> {
    const l = (await this.repo.auskunftLinks()).find((x) => x.id === id);
    if (!l) throw new Fachfehler(404, 'Diesen Abruf-Link gibt es nicht.');
    if (await this.repo.widerrufeAuskunftLink(id)) {
      await this.notiere(l.mappeId, ich.id, 'auskunft', { text: 'Abruf-Link zurückgezogen', zustellung: 'link', link: id, auskunft: l.auskunftId });
      protokoll.modul('datenschutz').info('Abruf-Link zurückgezogen', { mappeId: l.mappeId, link: id, von: ich.email });
    }
    return (await this.auskunftLinks({ auskunftId: l.auskunftId })).find((x) => x.id === id)!;
  }

  /**
   * Öffentliche Abrufseite (#455): Schlüssel und Abrufcode prüfen. Unbekannter Schlüssel, falscher Code und
   * gesperrter Link sehen nach außen gleich aus („falsch“) und kosten gleich viel Zeit (scrypt auch ohne
   * Treffer). Ein gesperrter Link prüft den Code gar nicht mehr. Erst mit richtigem Code sagt die Antwort,
   * dass der Link abgelaufen, verbraucht oder zurückgezogen ist. Jeder Versuch an einem bekannten Link
   * steht in der Historie (ohne IP, ohne Code).
   */
  async auskunftAbrufPruefen(schluessel: unknown, code: unknown): Promise<{ art: 'ok' | 'falsch' | 'ungueltig'; link?: AuskunftLinkIntern }> {
    const s = typeof schluessel === 'string' && SCHLUESSEL_MUSTER.test(schluessel) ? schluessel : null;
    const c = normiereCode(code);
    const link = s ? await this.repo.auskunftLinkPerSchluessel(hasheSchluessel(s)) : undefined;
    if (!link || link.gesperrt) { await pruefePasswort(c || '-', null); return { art: 'falsch' }; }
    if (!c || !(await pruefePasswort(c, link.code))) {
      const f = await this.repo.auskunftLinkFehlversuch(link.id, LINK_FEHLVERSUCHE_MAX);
      const gesperrt = !!f?.gesperrt;
      await this.notiere(link.mappeId, null, 'auskunft', { text: `Abruf fehlgeschlagen: falscher Abrufcode${gesperrt ? ` – Link nach ${f!.fehlversuche} Fehlversuchen gesperrt` : ''}`, zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      if (gesperrt) {
        protokoll.modul('datenschutz').warn('Abruf-Link nach Fehlversuchen gesperrt', { mappeId: link.mappeId, link: link.id, versuche: f!.fehlversuche });
        await this.auskunftMelden(link, `Abruf-Link für die Auskunft an ${link.titel || 'Ohne Titel'} nach ${f!.fehlversuche} falschen Abrufcodes gesperrt`, 'gesperrt');
      }
      return { art: 'falsch', link };
    }
    const st = linkStatus(link);
    if (st !== 'aktiv') {
      await this.notiere(link.mappeId, null, 'auskunft', { text: `Abruf versucht, aber der Link ist ${LINK_STATUS[st]}`, zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      return { art: 'ungueltig', link };
    }
    return { art: 'ok', link };
  }

  async auskunftLinkMitId(id: string): Promise<AuskunftLinkIntern | undefined> { return (await this.repo.auskunftLinks()).find((l) => l.id === id); }

  /** Einen Abruf zählen, solange der Link gilt (atomar); null = gilt nicht mehr. */
  auskunftAbrufZaehlen(id: string): Promise<number | null> { return this.repo.auskunftLinkAbruf(id); }

  /** Nachweis eines Abrufs (#455): Historie und Benachrichtigung an Ersteller und Favoriten-Inhaber. */
  async auskunftAbgerufen(link: AuskunftLink, nr: number, vollstaendig: boolean, standVon?: string) {
    await this.notiere(link.mappeId, null, 'auskunft', {
      text: vollstaendig ? `Auskunft abgerufen (${nr}. von höchstens ${link.maxAbrufe} Abrufen)` : `Abruf abgebrochen (${nr}. von höchstens ${link.maxAbrufe} Abrufen)`,
      zustellung: 'abruf', erfolg: vollstaendig, link: link.id, auskunft: link.auskunftId, nr,
    });
    if (vollstaendig) await this.auskunftMelden(link, `Auskunft an ${link.titel || 'Ohne Titel'} wurde abgerufen`, 'abgerufen', standVon);
  }

  /**
   * Benachrichtigung (#455) als Aufgabe „Auskunft“ an der Mappe der Person: an den, der den Link erstellt
   * hat, den Ersteller der Auskunft und alle, die die Person als Favorit haben (Stern = Abo, #422).
   * Gebündelt: Solange eine solche Aufgabe offen ist, kommt für denselben Link keine zweite.
   */
  private async auskunftMelden(link: AuskunftLink, text: string, anlass: 'abgerufen' | 'gesperrt', standVon?: string) {
    const fav = (await this.repo.alleFavoriten()).filter((f) => f.mappeId === link.mappeId).map((f) => f.benutzerId);
    let an = [...new Set([link.erstelltVon, standVon, ...fav].filter((x): x is string => !!x && istUuid(x)))];
    if (this.konten?.benutzer) { const aktiv = new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)); an = an.filter((id) => aktiv.has(id)); }
    const key = `${anlass}:${link.id}`;
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [link.mappeId] })).filter((a) => a.art === 'auskunft' && a.feldKey === key);
    for (const id of an) {
      if (offen.some((a) => a.empfaengerId === id)) continue;
      const a = await this.repo.legeAufgabeAn({ id: randomUUID(), mappeId: link.mappeId, empfaengerId: id, art: 'auskunft', feldKey: key, text: text.slice(0, AUFGABE_MAX), erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
      await this.leiteUm(a);
    }
  }

  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? Standard: ja. */
  async persoenlicherExportErlaubt(): Promise<boolean> { return (await this.einstellungen?.lies('persoenlicher_export')) !== false; }
  async setzePersoenlicherExport(an: unknown, von: string) {
    await this.einstellungen?.schreibe('persoenlicher_export', an === false ? false : null);
    protokoll.modul('werkbank').info(an === false ? '„Meine Daten exportieren“ abgeschaltet' : '„Meine Daten exportieren“ erlaubt', { von });
    return this.persoenlicherExportErlaubt();
  }

  /** Abschätzung vor dem Vollexport: Mappen, Dokumente, Bytes (mit älteren Versionen). */
  async exportAbschaetzung() {
    const dateien = await this.repo.alleDateien();
    let mappen = 0;
    for (const t of await this.repo.listeTypen()) mappen += await this.repo.zaehleMappen(t.id);
    return { mappen, dokumente: dateien.length, bytes: dateien.reduce((a, d) => a + d.groesse, 0) };
  }

  /* ---------- Archivmodus (#212) ---------- */

  private async pruefeArchivDokument(mappeId: string, was: string) {
    const m = await this.repo.holeMappe(mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const bis = m ? aufbewahrenBis(typ?.archiv, m) : null;
    if (inFrist(bis)) throw new Fachfehler(409, `Aufbewahrungspflicht bis ${datumText(bis!)} – Dokumente dieser Mappe lassen sich vorher nicht ${was}. Ändern geht als neue Version.`, { aufbewahrenBis: bis });
  }

  /** Vorschau beim Einschalten: wie viele Mappen betroffen, wie viele schon „darf weg“. */
  async archivVorschau(typId: string, e: unknown) {
    const typ = istUuid(typId) ? await this.repo.holeTyp(typId) : undefined;
    const archiv = bereinigeTyp({ felder: typ?.felder ?? [], archiv: e }).archiv;
    if (!archiv) throw new Fachfehler(422, `Bitte eine Frist von 1 bis ${JAHRE_MAX} Jahren angeben.`);
    const mappen = typ ? await this.repo.listeMappen(typ.id) : [];
    return { mappen: mappen.length, darfWeg: mappen.filter((m) => !inFrist(aufbewahrenBis(archiv, m))).length };
  }

  /** „Darf weg“: Mappen in Typen mit Archivmodus, deren Frist abgelaufen ist. Gelöscht wird nichts automatisch. */
  async darfWeg() {
    const erg: Array<{ id: string; typId: string; typ: string; titel: string; aufbewahrenBis: string }> = [];
    for (const t of (await this.repo.listeTypen()).filter((x) => x.archiv)) {
      for (const m of await this.repo.listeMappen(t.id)) {
        const bis = aufbewahrenBis(t.archiv, m);
        if (bis && !inFrist(bis)) erg.push({ id: m.id, typId: t.id, typ: t.name, titel: m.titel ?? '', aufbewahrenBis: bis });
      }
    }
    return erg.sort((a, b) => a.aufbewahrenBis.localeCompare(b.aufbewahrenBis) || a.titel.localeCompare(b.titel, 'de'));
  }

  /** Integrität (#212): jede Datei gegen ihren Prüfwert; als Auftrag im Hintergrund. */
  pruefeDateien(von: string) {
    return this.auftraege.starte('dateien-pruefen', 'Alle Dateien prüfen', async (fortschritt) => {
      const alle = await this.repo.alleDateien();
      const shas = [...new Set(alle.map((x) => x.sha256))];
      const abweichungen: Array<{ sha256: string; grund: string; dokumente: typeof alle }> = [];
      for (const [i, sha] of shas.entries()) {
        let grund: string | null = null;
        try {
          const s = await this.dateien.lies(sha);
          const h = createHash('sha256');
          if (Buffer.isBuffer(s)) h.update(s); else for await (const teil of s) h.update(teil as Buffer);
          if (h.digest('hex') !== sha) grund = 'Inhalt verändert';
        } catch { grund = 'Datei fehlt'; }
        if (grund) abweichungen.push({ sha256: sha, grund, dokumente: alle.filter((x) => x.sha256 === sha) });
        fortschritt(i + 1, shas.length);
      }
      const log = protokoll.modul('werkbank');
      if (abweichungen.length) log.error('Dateien prüfen: Abweichungen gefunden', { von, dateien: shas.length, abweichungen: abweichungen.length, erste: abweichungen[0].dokumente[0]?.name });
      else log.info('Dateien prüfen: alle in Ordnung', { von, dateien: shas.length });
      return { dateien: shas.length, abweichungen };
    }, [{ key: 'dateien', name: 'Dateien prüfen', einheit: 'Dateien' }]);
  }

  /* ---------- Versionierung (#194) ---------- */

  private async registerVon(d: Dokument) {
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    return { typ, reg: typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente') };
  }

  /** Neue Version eines Dokuments – unabhängig von Name und Dateityp; nur mit eingeschalteter Versionierung. */
  async ersetzeDokument(id: string, e: { name?: string; typ?: string; herkunft?: Herkunft }, inhalt: unknown, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, 'Für dieses Register ist die Versionierung ausgeschaltet – Ersetzen ist nicht möglich.');
    if (!Buffer.isBuffer(inhalt) || inhalt.length === 0) throw new Fachfehler(422, 'Die Datei ist leer.');
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Die Datei ist zu groß.');
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    const angegeben = /^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream';
    await this.dateien.schreibe(sha256, inhalt);
    const neu = await this.repo.ersetzeDokument(id, {
      name: e.name ? dateiname(e.name) : d.name, mime: erkannt ?? angegeben, groesse: inhalt.length, sha256, anzeigbar: !!erkannt,
      erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
    });
    this.vorschau?.einreihen([neu]);
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId);
  }

  /** Eine ältere Version zurückholen: als neue, höchste Version; es geht nichts verloren. */
  async holeVersionZurueck(id: string, nummer: number, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, `Version ${nummer} gibt es nicht (mehr).`);
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, 'Für dieses Register ist die Versionierung ausgeschaltet – Zurückholen ist nicht möglich.');
    const neu = await this.repo.ersetzeDokument(id, {
      name: v.name, mime: v.mime, groesse: v.groesse, sha256: v.sha256, anzeigbar: v.anzeigbar, erstelltVon: benutzerId, herkunft: 'zurueckgeholt', volltext: v.volltext,
    });
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId, nummer);
  }

  private async nachNeuerVersion(alt: Dokument, neu: Dokument, typ: Mappentyp | undefined, reg: Register, benutzerId: string | null, zurueckgeholt?: number) {
    await this.notiere(neu.mappeId, benutzerId, 'dokument_version', {
      dokument: neu.name, version: neu.version, vorher: alt.name, groesse: neu.groesse, mime: neu.mime, register: reg.name,
      ...(zurueckgeholt ? { zurueckgeholt } : {}),
    });
    await this.beruehre(neu.mappeId, typ, benutzerId);
    // „Nur die letzten N“ (mit der aktuellen): ältere entfernen, Dateien aufräumen.
    if (reg.versionenBehalten) for (const sha of await this.repo.kuerzeVersionen(neu.id, reg.versionenBehalten - 1)) await this.raeumeAuf(sha);
    if (neu.ocr?.stand !== 'fertig' && Dienst.volltextAn(typ, reg.key)) {
      await this.repo.ocrEinreihen([neu.id]);
      this.ocr?.anstossen();
    }
    return (await this.repo.holeDokument(neu.id)) ?? neu;
  }

  async versionen(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, 'Dieses Dokument gibt es nicht.');
    return { aktuell: d, aeltere: await this.repo.versionenVon(id) };
  }

  async versionInhalt(id: string, nummer: number) {
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, `Version ${nummer} gibt es nicht (mehr).`);
    const { volltext: _v, ...version } = v;
    return { version, inhalt: await this.dateien.lies(v.sha256) };
  }

  /** Dokumente hinzugefügt oder entfernt (#76): „zuletzt geändert“ nachziehen, Titel mit {geaendert} ebenso. */
  private async beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) {
    await this.repo.beruehreMappe(mappeId, benutzerId);
    if (typ && /\{geaendert\}/.test(typ.titelVorlage ?? '')) await this.aktualisiereTitel([mappeId]);
  }
}
