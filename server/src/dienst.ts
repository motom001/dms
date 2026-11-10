import { createHash, randomUUID } from 'node:crypto';
import {
  kannAusPost, darfLoeschen, istLeer, MAX_AUSWAHL, MAX_DATEIGROESSE,
  type Abrufweg, type Abruffassung, type Modusspur, type Systemkonto, verweiseVon,
  AUFGABE_MAX, istEmail, auswahlText, abwesenheitWirkt, VERTRETER_SCHRITTE, type Abwesenheit, type Aufgabe, type AufgabenAnlass, type FallEnde, type FallOhneLeserecht, type Aufgabenart, type Benutzer, type Dokument, type Herkunft, type Vertretung, type Feld, type Feldaenderung, type Notiz, type Historienart, type Historieneintrag, type Mappe, type Mappentyp, type MappenBezug, type Wert, type Werte,
} from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import type { Mailer } from './mail';
import { Auftraege } from './auftrag';
import { kontext, protokoll } from './protokoll';
import { EIGENE_MAPPEN, fingerabdruck, Haushaltsstand, MINDESTENS_MS, mitFavoriten, NUR_FAVORITEN, ZAEHLT_FUER_TERMINE, Zaehlerspeicher, type Gueltigkeit } from './zaehlerspeicher';
import { jeAnfrage } from './lesespeicher';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { rechteMessen } from './messung';
import { Fachfehler } from './fehler';
import { aufkleberPdf, ETIKETTEN } from './aufkleber';
import { alsText, erwaehnungen } from '../../shared/src/markdown';
import { liesAnsicht, liesEigene, OHNE_EINSTELLUNG } from '../../shared/src/werkbankansicht';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { istUuid, type DokumentImPapierkorb, type FristKandidat, type NeueMappe, type PapierkorbEintrag, type Repo, type Rueckverweis } from './repo';
import {
  filterFuer, heuteIn, klauselnFuer, verschiebe, 
  type Aufloesung, type Bedingung, type Klausel, type Sicht, 
} from '../../shared/src/sichten';
import type { Readable } from 'node:stream';
import { aufbewahrenBis, datumText, inFrist } from '../../shared/src/archiv';
import type { ExportQuelle } from './vollexport';
import { sammleBaum, type BaumQuelle } from './baum';
import { BAUM_STANDARD, bereinigeBaumOptionen, verweisartVon, type Baum } from '../../shared/src/baum';
import { liesLoeschAuswahl, loeschErinnerung, loeschVorschlag, LOESCH_TIEFE, planeLoeschung, type LoeschKante, type LoeschPlan, type LoeschVorschau } from '../../shared/src/loeschbaum';
import { AUSKUNFT_PASSWORT_MIN, auswahlProbleme as auskunftProbleme, fristBis, liesAuswahl, liesDatenschutz, personenTypen, type AuskunftErwaehnung, type AuskunftMappe, type AuskunftVorschau, type Datenschutz } from '../../shared/src/auskunft';
import { auskunftMail, auskunftVerzeichnis, FRIST_SCHLUESSEL, FRIST_TEXT_ANFANG, type AuskunftEintrag, LINK_FEHLVERSUCHE_MAX, LINK_STATUS, liesLinkEingabe, linkStatus, normiereCode, type AuskunftLink, type AuskunftStand } from '../../shared/src/auskunft';
import { neuerAbrufcode, SCHLUESSEL_MUSTER } from './abruf';
import { alsZeile, liesAnlass, liesFilter, LOESCH_MAX, LOESCH_SPALTEN, LOESCHGRUENDE, LOESCHPROTOKOLL_JAHRE_MAX, LOESCHPROTOKOLL_STANDARD_JAHRE, LOESCHSCHRITTE, LOESCHWEGE, AUSLOESER, type Ausloeser, type LoeschDokument, type LoeschEintrag, type LoeschKontext, type Loeschweg } from '../../shared/src/loeschprotokoll';
import { hashePasswort, hasheSchluessel, neuerSchluessel, pruefePasswort } from './passwort';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import { csvAus } from './xlsx';
import { schriftstueckPdf } from './schriftstueck';
import { exportSpalten, mappenPdf } from './export';
import { type Ausgang } from './ausgang/pruefstelle';
import { geschwaerztName, kannSchwaerzen } from '../../shared/src/schwaerzen';
import { type StempelTyp } from '../../shared/src/stempel';
import { INHALT_EREIGNISSE, MAPPEN_EREIGNISSE, hatSchnittstelle, istKiPaket, kenntVolltextOhneText, type EreignisArt, type InstalliertesPaket, type KiUebersicht, type BeispielStand } from '../../shared/src/pakete';
import { erkenneBildtyp, type FassungInfo } from '../../shared/src/dateiumwandlung';
import type { Dateiumwandlung, FassungsAblage, UmwandlungsAnbindung } from './dateiumwandlung';
import { PaketVolltext } from './paketvolltext';
import type { ArchivAblage, ArchivAnbindung, Archivfassung } from './archivfassung';
import type { EntsperrenAnbindung, PdfEntsperren } from './entsperren';
import type { AusDokument } from '../../shared/src/erkennung';
import { FragenAnDieAblage } from './fragen';
import { Uebersetzung } from './uebersetzung';
import { Erkennung, sichereZuordnung, type PostErkennung } from './erkennung';
import { favoritenErlaubt, freigabeZumSpeichern, liesFavoritenFreigabe, type FavoritenFreigabe } from '../../shared/src/favoritenfreigabe';
import { t } from './sprache';
import { Ereignisverteiler } from './ereignisse';
import { zeitzone } from '../../shared/src/region';
import { Eingang } from './hochladen';
import { EREIGNISKATALOG, VERALTETE_EREIGNISSE, type Ausloeser as EreignisAusloeser, type KatalogArt, type KatalogEreignis, type Katalogeintrag } from '../../shared/src/ereignisse';
import { datumDe, ERINNERUNG_TEXT_MAX, fristAb, fristEmpfaenger, fristFelder, fristText, folgetermine, istDatum, naechsterTermin, type Erinnerung, type Termin, type TermineAntwort } from '../../shared/src/fristen';
import { zeitraumProblem } from '../../shared/src/kalender';
import { feiertageZwischen, type Bundesland } from '../../shared/src/feiertage';
import { rechteUebersicht, type Regelwerk, type Mappenquelle, type Recht, type Rechte } from '../../shared/src/rechte';
import { gebietsschema } from '../../shared/src/sprache';
import { EMAIL_MAX_ANHAENGE, KB, MB } from './grenzen';
import { SucheDienst } from './suche';
import { NICHT_SICHTBAR, ZugriffDienst } from './zugriff';
import { ABO_ARTEN, dokInfo, Kern, type Loeschprotokoll, PAPIERKORB_STANDARD_TAGE, versionInfo, type Anlass, type ProtokollMappe, type ProtokollTeil, type SystemIds, type Zugreifender, type Zugriff } from './kern';
import { Systemausstattung } from './systemausstattung';
import { behalteBeschriftungen, bereinigeFeld, bereinigeTyp, MappentypenDienst, Nummernkreise, Passung, Systemtypen, TypPakete, type Benutzerspiegel } from './mappentypen';
export { bereinigeFeld, bereinigeTyp, behalteBeschriftungen };
export type { Benutzerspiegel };
export { ABO_ARTEN, PAPIERKORB_STANDARD_TAGE };
export type { Anlass, LeserechtAufZeit, Zugriff } from './kern';
import { paketEinstellungen } from './pakete/index';
import { keinSchluessel, MappenArchiv, MappenDienst, MappenEingaben, MappenHistorie, MappenTitel, Passwortfelder } from './mappen';
export { ARCHIV_PRAEFIX, archivnummerAus, HISTORIE_SEITE_MAX, HISTORIE_STANDARD_TAGE } from './mappen';
import { dateiname, DokumentArchivfassung, DokumenteDienst, DokumentUmwandlung, DokumentVersionen, erkenneAnzeigbar, FehlendeDateien, GeschuetztePdfs, type TexterkennungAnbindung } from './dokumente';
export { erkenneAnzeigbar };
export type { TexterkennungAnbindung };
import { SichtenDienst, SichtenVerwaltung, sortierungAus, Systemsichten, type Zaehlerzahlen } from './sichten';
export { sortierungAus };
export type { Zaehlerzahlen };
import { BerechtigungenDienst } from './berechtigungen';
import { Stempelvorlagen } from './pdf-bearbeiten/stempelvorlagen';
import { PdfBearbeiten } from './pdf-bearbeiten/pdf-bearbeiten.dienst';
import { PdfVerkleinern } from './pdf-bearbeiten/verkleinern';
export { GROSSE_MAX, GROSSE_MIT_SCHAETZUNG, VERKLEINERN_STANDARD, verkleinernEinstellungAus, type VerkleinernEinstellung } from './pdf-bearbeiten/verkleinern';
import { Schwaerzen } from './pdf-bearbeiten/schwaerzen';
import { PostSystemmappen } from './post/systemmappen';
export type { SystemkontoEintrag } from './post/systemmappen';
import { PostAufloesen } from './post/aufloesen';
import { PostDienst } from './post/post.dienst';
import { Eingangskanaele } from './post/eingangskanaele';
export type { Fundstelle } from './post/eingangskanaele';
import { PostFotos } from './post/foto';
import { AusgangDienst } from './ausgang/ausgang.dienst';
import { AusgangEmail } from './ausgang/email';
export { EMAIL_MAX_EMPFAENGER, EMAIL_MAX_MAPPEN } from './ausgang/email';
import { AusgangExport } from './ausgang/export';
import { type EreignisAufruf, VOLLTEXT_MAX, VolltextAusPaketen, VolltextDienst, type VolltextMeldung } from './volltext';
export { VOLLTEXT_MAX };
export type { EreignisAufruf, VolltextMeldung };
export type { KatalogSchluessel, PaketQuelleEintrag } from './pakete/index';

/** Dokument im Papierkorb mit Mappe und Register (#344). */
export interface DokumentImKorb extends DokumentImPapierkorb { art: 'dokument'; typId: string; mappeTitel: string; register: string; mappe: 'da' | 'papierkorb' | 'weg' }
/** Aufgelöste Post im Papierkorb (#936): in welche Mappe; `da` = die Mappe gibt es noch. */
export interface AufgeloestIn { id: string; typId: string; titel: string; da: boolean }

/** Startseite (#918): der nächste Termin erst in so vielen Tagen gesucht, nur ohne Treffer im ganzen Jahr. */
export const NAECHSTER_TERMIN_ERST_TAGE = 31;
/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43). */
export interface KontenHaken {
  /** Endgültig gelöscht: Konto löschen. */
  endgueltig(id: string): Promise<void>;
  /** Wiederhergestellt: Konto wieder aktivieren. */
  wiederda(id: string, von: string | null): Promise<void>;
  /** Alle Konten mit Abwesenheit und Vertreter – für die Umleitung von Aufgaben (#78). */
  benutzer?(): Promise<Benutzer[]>;
  /** Konten, die kein Mensch sind (#673): Systemkonten und Dienstkonten der Pakete – nur für den Testlauf der Rechte (#710). */
  ohneMensch?(): Promise<Benutzer[]>;
  /** Dienstkonten der Pakete (#686: Rechte des Paket-Benutzers bei der Zustellung von Ereignissen). */
  dienstkonten?(): Promise<Benutzer[]>;
  /** Persönliche Einstellungen eines Benutzers (#422: Favoriten benachrichtigen, Geänderte hervorheben). */
  einstellungen?(id: string): Promise<Record<string, unknown>>;
  /** Persönliche Einstellung setzen (#506: Vorgabe für neue Benutzer, „auf alle anwenden“); `null` löscht. */
  setzeEinstellung?(id: string, schluessel: string, wert: unknown): Promise<void>;
}

export { EMAIL_MAX_ANHAENGE };
/** Sammel-Weitergabe (#415): höchstens so viele Aufgaben auf einmal; Schlüssel der Sammelbenachrichtigung. */
export const SAMMEL_MAX = 1000;
export const SAMMEL_WEITERGABE = 'weitergabe';
export interface DienstOptionen {
  /** Schlüssel für Passwortfelder (#39, #46). */
  tresor?: Tresor;
  /** Einstellungen des Haushalts (Papierkorb). Ohne: kein Papierkorb (Löschen sofort endgültig). */
  einstellungen?: Einstellungen;
  /**
   * Zustand zwischen Anfragen (#744). In PostgreSQL (`pgKurzzustand`) gilt er für alle Prozesse; ohne Angabe im
   * Arbeitsspeicher dieses Prozesses. (Der Stand des Haushalts liegt seit #741/#742 eigens in der Datenbank.)
   */
  zustand?: Kurzzustand;
}

/** Dateiname ohne Pfadanteile und Steuerzeichen. */

/** Prüfwert von Feldwerten (#878): JSON mit sortierten Schlüsseln, damit die Reihenfolge aus der Datenbank nicht zählt. */
function pruefwertVon(werte: unknown): string {
  const sortiert = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortiert) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortiert(x)])) : v);
  return createHash('sha256').update(JSON.stringify(sortiert(werte ?? {}))).digest('hex');
}

/* ---------- Fachlogik ---------- */

/**
 * Alltags-Benutzer für Aufgaben ohne Empfänger (#719): aktiver Mensch. Seit #818 auch eine Person mit Verwaltungsrecht –
 * sie arbeitet im Alltag mit demselben Konto.
 */
export const taugtAlsAufgabenEmpfaenger = (b: Benutzer) => b.aktiv && !b.art;

const ABRUF_PRUEFUNG = 'abruf-pruefung';
/** Belegung einer Code-Prüfung am Abruf-Link: endet spätestens nach dieser Zeit (scrypt dauert Bruchteile davon). */
const ABRUF_PRUEFUNG_MS = 60_000;

export class Dienst {
  /**
   * Zustand zwischen Anfragen (#744) – in PostgreSQL für alle Prozesse, sonst im Arbeitsspeicher: u. a. Abruf-Links,
   * deren Code gerade geprüft wird (#455) und die Spur im Verwaltungsmodus (#820).
   */
  readonly kurzzustand: Kurzzustand;
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  private tresor?: Tresor;
  private einstellungen?: Einstellungen;
  private konten?: KontenHaken;

  /**
   * Stand des Haushalts (#512): zählt nach jeder Änderung über das Repo hoch, seit #742 in der Datenbank
   * (Sequenz `haushaltsstand_zahlen`), wenn das Repo eine hat. Er zählt auch bei Erinnerungen (`ZAEHLT_FUER_TERMINE`,
   * für die Termine #528) – früher ein eigener Stand; eine Zahl in der Datenbank genügt, Erinnerungen ändern sich selten.
   */
  readonly stand = new Haushaltsstand(ZAEHLT_FUER_TERMINE);
  /**
   * Mappenstand (#918, Sequenz `haushaltsstand_mappen`): wie `stand`, zählt aber nicht bei Favoriten (`NUR_FAVORITEN`).
   * Daran hängen die Zahlen je Typ und Ansicht (ohne Favoriten), die Zahl der Treffer und die Termine ohne „nur
   * Favoriten“ – ein Stern rechnet sie nicht für alle neu.
   */
  readonly mappenstand = new Haushaltsstand(ZAEHLT_FUER_TERMINE, undefined, { ohne: NUR_FAVORITEN, art: EIGENE_MAPPEN });
  /** Termine (#528, #725): derselbe Stand (#742). */
  get fristenstand() { return this.stand; }
  /** Termine (#528, #725): Zwischenspeicher je Benutzer, Rechte und Zeitraum. */
  private readonly termineSpeicher = new Zaehlerspeicher<Termin[]>(this.mappenstand);
  /** Termine „nur Favoriten“ (bzw. ein Lesefilter mit Favoriten): am Haushaltsstand (#918). */
  private readonly termineFavSpeicher = new Zaehlerspeicher<Termin[]>(this.stand);
  /** Mindestgültigkeit der Zahlen bei Anfragen nach Änderungen anderer (#742); Tests stellen sie auf 0. */
  mindestensMs = MINDESTENS_MS;
  /** Gültigkeit für die laufende Anfrage: in einer Anfrage mit Person kurz, sonst (Hintergrund) immer frisch. */
  private gueltigkeit(): Gueltigkeit {
    const wer = kontext.getStore()?.benutzerId;
    return wer ? { mindestensMs: this.mindestensMs, wer } : {};
  }

  /** Der Kern (#961): Repo, Transaktion, Ereignisse, Historie und Löschprotokoll schreiben. */
  readonly kern: Kern;
  /** Rechte prüfen (#1072): Zugriff bilden, Rechte an Mappen, lesbare Mappen. */
  readonly rechtepruefung: ZugriffDienst;
  /** Mappentypen (#1073): anlegen, ändern, löschen, prüfen. */
  readonly mappentypen: MappentypenDienst;
  /** Pakete am Mappentyp (#686, #1073). */
  readonly typpakete: TypPakete;
  /** Passung der Mappen zu ihrem Typ (#1073). */
  readonly passung: Passung;
  /** Nummernkreise (#171, #1073). */
  readonly nummernkreise: Nummernkreise;
  /** Systemtypen, Benutzer-Mappen, Spur im Verwaltungsmodus (#1073). */
  readonly systemtypen: Systemtypen;
  /** Historie der Mappen lesen, Abrufe (#57, #800, #1074). */
  readonly mappenHistorie: MappenHistorie;
  /** Titel der Mappen (#1074). */
  readonly mappenTitel: MappenTitel;
  /** Eingaben an Mappen prüfen (#1074). */
  readonly mappenEingaben: MappenEingaben;
  /** Passwortfelder (#46, #1074). */
  readonly passwortfelder: Passwortfelder;
  /** Archivnummern und Archivmodus (#345, #212, #1074). */
  readonly mappenArchiv: MappenArchiv;
  /** Mappen (#1074): anlegen, ändern, holen, Notizen, Favoriten. */
  readonly mappen: MappenDienst;
  /** Dokumente (#1075): Hochladen, Löschen, Texterkennung und Vorschaubilder anbinden. */
  readonly dokumente: DokumenteDienst;
  /** Dateien umwandeln (#577, #1075). */
  readonly dokumentUmwandlung: DokumentUmwandlung;
  /** Archivfassung (#631, #1075). */
  readonly dokumentArchiv: DokumentArchivfassung;
  /** Geschützte PDFs (#827, #1075). */
  readonly geschuetztePdfs: GeschuetztePdfs;
  /** Fehlende Dateien (#877, #1075). */
  readonly dateienFehlen: FehlendeDateien;
  /** Versionen (#194, #1075). */
  readonly dokumentVersionen: DokumentVersionen;
  /** Suche (#964): unscharfe Suche, gleichbedeutende Wörter, Vektoren und ähnliche Dokumente. */
  readonly suche: SucheDienst;
  /** Sichten verwalten (#38, #148, #1076). */
  readonly sichtenVerwaltung: SichtenVerwaltung;
  /** Mitgelieferte Sichten: Post, Favoriten (#192, #725, #1076). */
  readonly systemsichten: Systemsichten;
  /** Sichten seitenweise und gezählt (#512, #742, #918, #1076). */
  readonly sichten: SichtenDienst;
  /** Berechtigungen in der Werkbank (#123–#127, #1076). */
  readonly berechtigungen: BerechtigungenDienst;
  /** Volltext aus Paketen (#614, #1076). */
  readonly volltextAusPaketen: VolltextAusPaketen;
  /** Volltext (#45, #458, #1076). */
  readonly volltexte: VolltextDienst;
  /** Stempel-Vorlagen (#394, #1077). */
  readonly stempelvorlagen: Stempelvorlagen;
  /** PDF bearbeiten (#335, #1077). */
  readonly pdfBearbeiten: PdfBearbeiten;
  /** PDF verkleinern (#393, #1077). */
  readonly pdfVerkleinern: PdfVerkleinern;
  /** Schwärzen (#392, #1077). */
  readonly schwaerzen: Schwaerzen;
  /** Systemmappen, Benutzer-Mappen, Rollen, Systemkonten (#43, #673, #1077). */
  readonly postSystemmappen: PostSystemmappen;
  /** Post auflösen und abtrennen (#934, #936, #1077). */
  readonly postAufloesen: PostAufloesen;
  /** Post (#192, #337, #1077): anlegen, zuordnen, automatisch zuordnen. */
  readonly post: PostDienst;
  /** Eingangskanäle (#195, #333, #1077). */
  readonly eingangskanaele: Eingangskanaele;
  /** Post fotografieren (#490, #1077). */
  readonly postFotos: PostFotos;
  /** Ausgang (#723, #1077): die gemeinsame Prüfstelle für alle Wege nach draußen, Stempel, Fassungen. */
  readonly ausgang: AusgangDienst;
  /** E-Mail aus der Ablage (#58, #151, #1077). */
  readonly ausgangEmail: AusgangEmail;
  /** Export mehrerer Mappen (#152, #1077). */
  readonly ausgangExport: AusgangExport;
  /** Systemtypen, Systemrollen und mitgelieferte Ansichten anlegen (#963). */
  readonly systemausstattung: Systemausstattung;

  constructor(grundRepo: Repo, private dateien: Dateispeicher, opt: DienstOptionen = {}) {
    // Stand aus der Datenbank (#742), sonst nur dieser Prozess (speicherRepo in Tests).
    if (typeof grundRepo.haushaltsstand === 'function' && typeof grundRepo.erhoeheHaushaltsstand === 'function') {
      this.stand.verbinde({ lies: () => grundRepo.haushaltsstand!(), erhoehe: () => grundRepo.erhoeheHaushaltsstand!() });
    }
    if (typeof grundRepo.mappenstand === 'function' && typeof grundRepo.erhoeheMappenstand === 'function') {
      this.mappenstand.verbinde({ lies: () => grundRepo.mappenstand!(), erhoehe: () => grundRepo.erhoeheMappenstand!() });
    }
    this.kern = new Kern({ repo: this.stand.umhuelle(grundRepo, this.mappenstand), dateien, einstellungen: opt.einstellungen, stand: this.stand, wecke: () => this.ereignisse.wecke(), ausstatten: () => this.systemausstattung.anlegen(), zugriff: (ich) => this.zugriff(ich) });
    this.rechtepruefung = new ZugriffDienst(this.kern, { kiSperre: (p) => this.kiSperre(p), konten: () => this.konten });
    this.mappentypen = new MappentypenDienst(this.kern, {
      mitStempel: (typen) => this.mitStempel(typen), pruefeStempelTyp: (v) => this.pruefeStempelTyp(v), setzeStempelTyp: (id, st) => this.setzeStempelTyp(id, st),
      erkennung: () => this.erkennung, berechtigungenAusEingabe: (typ, e) => this.berechtigungenAusEingabe(typ, e),
      protokolliereBerechtigungen: (typ, n) => Dienst.protokolliereBerechtigungen(typ, n), konfigurationKonflikt: (art, aktuell) => Dienst.konfigurationKonflikt(art, aktuell),
    });
    this.typpakete = new TypPakete(this.kern, this.rechtepruefung, { kiSperre: (p) => this.kiSperre(p), konten: () => this.konten });
    this.passung = new Passung(this.kern, { passungsAufgaben: (liste) => this.passungsAufgaben(liste) });
    this.nummernkreise = new Nummernkreise(this.kern, { archivKreis: () => this.archivKreis(), aktualisiereTitel: (ids) => this.aktualisiereTitel(ids), auftraege: this.auftraege });
    this.systemtypen = new Systemtypen(this.kern, this.rechtepruefung, {
      schreibeSystemMappe: (typ, id, e, von, kennung) => this.schreibeSystemMappe(typ, id, e, von, kennung), loescheMappeIntern: (id, typ, von) => this.loescheMappeIntern(id, typ, von),
      spiegleBenutzer: (b, von, abwesenheit) => this.spiegleBenutzer(b, von, abwesenheit), aufgabenUebergeben: (id, an, von) => this.aufgabenUebergeben(id, an, von), kurzzustand: () => this.kurzzustand,
    });
    this.mappenHistorie = new MappenHistorie(this.kern);
    this.mappenTitel = new MappenTitel(this.kern, this.mappenHistorie);
    this.mappenEingaben = new MappenEingaben(this.kern, this.rechtepruefung, { verschluessele: (k) => this.verschluessele(k) });
    this.passwortfelder = new Passwortfelder(this.kern, this.mappenHistorie, { tresor: () => this.tresor, istVerschluesselt });
    this.mappenArchiv = new MappenArchiv(this.kern, this.rechtepruefung, this.mappenHistorie, {
      aufkleber: { ETIKETTEN, aufkleberPdf }, auftraege: this.auftraege, schreibeFehlendeDateien: (shas) => this.schreibeFehlendeDateien(shas),
    });
    this.mappen = new MappenDienst(this.kern, this.rechtepruefung, { historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben }, {
      konten: () => this.konten, favoritenBenachrichtigungErlaubt: (id) => this.favoritenBenachrichtigungErlaubt(id), ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserechtText(liste, lesbar, ich),
      mitArchivStand: (d) => this.mitArchivStand(d), mitPdfSchutz: (d) => this.mitPdfSchutz(d), datenschutz: () => this.datenschutz(),
      loeschPruefung: (m, typ, rueck, alleTypen) => this.loeschPruefung(m, typ, rueck, alleTypen), meldeVerknuepft: (typ, id, alt, neu, von) => this.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), aktualisiereTitel: (ids) => this.aktualisiereTitel(ids),
    });
    ({ dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, pdfs: this.geschuetztePdfs, fehlend: this.dateienFehlen, versionen: this.dokumentVersionen } = this.baueDokumente());
    this.suche = new SucheDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    ({ verwalten: this.sichtenVerwaltung, systemsichten: this.systemsichten, sichten: this.sichten, berechtigungen: this.berechtigungen, ausPaketen: this.volltextAusPaketen, volltext: this.volltexte } = this.baueSichtenUndVolltext());
    ({ stempelvorlagen: this.stempelvorlagen, pdf: this.pdfBearbeiten, verkleinern: this.pdfVerkleinern, schwaerzen: this.schwaerzen, systemmappen: this.postSystemmappen, aufloesen: this.postAufloesen,
      post: this.post, eingang: this.eingangskanaele, fotos: this.postFotos, ausgang: this.ausgang, email: this.ausgangEmail, export: this.ausgangExport } = this.bauePdfPostAusgang());
    // Systemausstattung (#963): Mappentypen, Ansichten und Post nacheinander.
    this.systemausstattung = new Systemausstattung(this.kern, {
      mappentypen: { sichereSystemtypen: () => this.systemtypen.sichereSystemtypen() },
      sichten: { sichtFuerTyp: (typ) => this.sichtFuerTyp(typ), sichereFavoritenSicht: () => this.sichereFavoritenSicht() },
      post: { sicherePostSichten: (post) => this.sicherePostSichten(post) },
    });
    this.schliesseEmpfaengerAn();
    this.kurzzustand = opt.zustand ?? speicherKurzzustand();
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.tresor?.registriere(() => this.unlesbarePasswoerter());
    // Was verschlüsselt ist, je Art (#410): dieselben Stellen, die der Schlüsselwechsel umschlüsselt.
    // Passwortfelder meldet unlesbarePasswoerter genauer (mit Feldnamen), den Mailserver der Betrieb.
    this.tresor?.registriereBestand(() => this.repo.verschluesselteFundstellen(), ['passwortfeld', 'mail']);
    // Erkennung (#336): rechnet, sobald der Volltext eines Dokuments fertig ist – egal, wer ihn geliefert hat.
    this.erkennung = new Erkennung(this, () => this.repo, () => this.einstellungen);
    this.fragen = new FragenAnDieAblage(this, () => this.repo, () => this.einstellungen);
    // Inhalte übersetzen (#732): auf Knopfdruck; Änderungen am Original lassen die Übersetzungen verfallen.
    this.uebersetzung = new Uebersetzung(this, () => this.repo, () => this.einstellungen, () => this.kurzzustand);
    this.ereignisse.abonniere('uebersetzung', (e) => this.uebersetzung.nachEreignis(e));
    this.beiVolltextFertig(async (e) => { await this.erkennung.nachVolltext(e); });
    // Ereigniskatalog (#670): Mappen-Ereignisse und Fristen an die Pakete, die diese Mappentypen abonniert haben.
    this.ereignisse.abonniere('pakete', (e) => this.ereignisAnPakete(e));
    // Volltext aus Paketen (#614): zuständige Pakete mit dms:volltext, Ereignis datei.volltext an genau dieses.
    this.paketVolltext = new PaketVolltext({ pakete: () => this.repo.listePakete(), melde: (paket, daten) => this.auftrag(paket, 'datei.volltext', daten) });
  }
  /** Dokumente (#1075): die Klassen in dokumente/; was noch im Dienst liegt, kommt über die Anschlüsse. */
  private baueDokumente() {
    const umwandlung = new DokumentUmwandlung(this.kern, {
      ocr: () => this.ocr, entsperren: () => this.entsperren, paketVolltext: () => this.paketVolltext,
      auftrag: (paket, art, daten) => this.auftrag(paket, art, daten), ereignis: (art, daten, von) => this.ereignis(art, daten, von),
    });
    const archiv = new DokumentArchivfassung(this.kern, umwandlung, {
      auftrag: (paket, art, daten) => this.auftrag(paket, art, daten), ereignis: (art, daten, von) => this.ereignis(art, daten, von),
      paketEinstellungen: (paket) => paketEinstellungen(this.kern, paket),
    });
    const pdfs = new GeschuetztePdfs(this.kern, { umwandlung, archiv }, { ocr: () => this.ocr, listeTypen: () => this.listeTypen() });
    const versionen = new DokumentVersionen(this.kern, {
      ocr: () => this.ocr, neueDateien: (docs) => this.neueDateien(docs), raeumeAuf: (sha) => this.raeumeAuf(sha),
      aktualisiereTitel: (ids) => this.aktualisiereTitel(ids), volltextAn: (typ, key) => Dienst.volltextAn(typ, key),
    });
    const dokumente = new DokumenteDienst(this.kern, { umwandlung, archiv, pdfs, versionen }, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), automatischVerkleinert: (ein, name) => this.automatischVerkleinert(ein, name),
      volltextFertig: (e, m) => this.volltextFertig(e, m), volltextAn: (typ, key) => Dienst.volltextAn(typ, key),
      pruefeArchivDokument: (id, was) => this.pruefeArchivDokument(id, was),
    });
    return { dokumente, umwandlung, archiv, pdfs, fehlend: new FehlendeDateien(this.kern), versionen };
  }

  /** Sichten, Berechtigungen und Volltext (#1076): die Klassen in sichten/, berechtigungen/ und volltext/. */
  private baueSichtenUndVolltext() {
    const verwalten = new SichtenVerwaltung(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const systemsichten = new Systemsichten(this.kern);
    const sichten = new SichtenDienst(this.kern, { rechte: this.rechtepruefung, mappen: this.mappen, suche: this.suche, verwalten, systemsichten }, {
      gueltigkeit: () => this.gueltigkeit(), siehtOhneEmpfaenger: (ich) => this.siehtOhneEmpfaenger(ich),
      ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserechtText(liste, lesbar, ich), termine: (z, q) => this.termine(z, q),
    }, { stand: this.stand, mappenstand: this.mappenstand });
    const berechtigungen = new BerechtigungenDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const ausPaketen = new VolltextAusPaketen(this.kern, { dokumente: this.dokumente, archiv: this.dokumentArchiv }, { paketVolltext: () => this.paketVolltext });
    const volltext = new VolltextDienst(this.kern, { dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, ausPaketen }, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), auftraege: this.auftraege, paketVolltext: () => this.paketVolltext,
      sicherungAufgegeben: (paket, name, fehler) => this.sicherungAufgegeben?.(paket, name, fehler), sicherungAntwort: (paket, name, r) => this.sicherungAntwort?.(paket, name, r),
    });
    return { verwalten, systemsichten, sichten, berechtigungen, ausPaketen, volltext };
  }

  /**
   * PDF bearbeiten, Post und Ausgang (#1077): die Klassen in pdf-bearbeiten/, post/ und ausgang/. Was noch im Dienst
   * liegt und was im Kreis liefe (PDF bearbeiten und Auflösen → neue Post), kommt über die Anschlüsse; die Prüfstelle
   * der Wege nach draußen (`pruefeAusgang`, `mitnehmbar`) rufen E-Mail und Export über die Fassade.
   */
  private bauePdfPostAusgang() {
    const rechte = this.rechtepruefung;
    const mappen = { historie: this.mappenHistorie, titel: this.mappenTitel, archiv: this.mappenArchiv };
    const doks = { dokumente: this.dokumente, versionen: this.dokumentVersionen };
    const stempelvorlagen = new Stempelvorlagen(this.kern);
    const pdf = new PdfBearbeiten(this.kern, { rechte, ...mappen, ...doks, umwandlung: this.dokumentUmwandlung }, {
      legePostAn: (...a) => this.legePostAn(...a), schreibeSystemMappe: (...a) => this.schreibeSystemMappe(...a), postAufgaben: (id, von) => this.postAufgaben(id, von),
    });
    const verkleinern = new PdfVerkleinern(this.kern, { pdf, ...mappen, ...doks }, { auftraege: this.auftraege });
    const schwaerzen = new Schwaerzen(this.kern, { verkleinern, historie: this.mappenHistorie, ...doks, archiv: this.dokumentArchiv }, {
      volltextFertig: (e, m, von) => this.volltextFertig(e, m, von),
    });
    const systemmappen = new PostSystemmappen(this.kern, { rechte, passung: this.passung, historie: this.mappenHistorie, titel: this.mappenTitel }, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), meldeVerknuepft: (typ, id, alt, neu, von) => this.meldeVerknuepft(typ, id, alt, neu, von),
      passungsAufgaben: (liste) => this.passungsAufgaben(liste), favoritenFreigabe: () => this.favoritenFreigabe(),
      vorgabeAufgabenEmpfaenger: (b) => this.vorgabeAufgabenEmpfaenger(b), sichereSystem: () => this.sichereSystem(), konten: () => this.konten,
      systemkonten: () => this.systemkonten, automatisierungenVon: () => this.automatisierungenVon,
    });
    const aufloesen = new PostAufloesen(this.kern, { rechte, historie: this.mappenHistorie, titel: this.mappenTitel, ...doks, systemmappen }, {
      legePostAn: (...a) => this.legePostAn(...a), postAufgaben: (id, von) => this.postAufgaben(id, von),
      loeschPruefung: (m, typ, rueck) => this.loeschPruefung(m, typ, rueck), loescheMappe: (id, von, z, anlass) => this.loescheMappe(id, von, z, anlass),
    });
    const post = new PostDienst(this.kern, {
      rechte, mappentypen: this.mappentypen, historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben, ...doks, aufloesen, systemmappen,
    }, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), meldeVerknuepft: (typ, id, alt, neu, von) => this.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), neueAufgabe: (a, typ) => this.neueAufgabe(a, typ), leiteUm: (a) => this.leiteUm(a),
      eigeneAufgabe: (id, ich) => this.eigeneAufgabe(id, ich), erledigeNachAnlass: (id, passt, grund) => this.erledigeNachAnlass(id, passt, grund), konten: () => this.konten,
      sichereZuordnung: (e, autoTypen) => sichereZuordnung(e as PostErkennung, autoTypen),
    });
    const eingang = new Eingangskanaele(this.kern, { rechte, historie: this.mappenHistorie, dokumente: this.dokumente });
    const fotos = new PostFotos(this.kern, { rechte, ...mappen, ...doks, pdf, post, eingang }, { loescheMappe: (id, von, z, anlass) => this.loescheMappe(id, von, z, anlass) });
    const entsperrtZu = (inhalt: Buffer) => this.entsperrtZu(inhalt);
    const ausgang = new AusgangDienst(this.kern, {
      rechte, mappentypen: this.mappentypen, historie: this.mappenHistorie, versionen: this.dokumentVersionen,
      umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, verwalten: this.sichtenVerwaltung, stempel: stempelvorlagen,
    }, { entsperrtZu });
    const email = new AusgangEmail(this.kern, { rechte, historie: this.mappenHistorie, dokumente: this.dokumente, ausgang, stempel: stempelvorlagen, systemmappen }, {
      pruefeAusgang: (ich, z, weg, ids) => this.pruefeAusgang(ich, z, weg, ids), entsperrtZu,
    });
    const exportieren = new AusgangExport(this.kern, { rechte, sichten: this.sichten, fehlend: this.dateienFehlen, ausgang, stempel: stempelvorlagen }, {
      mitnehmbar: (ich, z, ids) => this.mitnehmbar(ich, z, ids), entsperrtZu,
    });
    return { stempelvorlagen, pdf, verkleinern, schwaerzen, systemmappen, aufloesen, post, eingang, fotos, ausgang, email, export: exportieren };
  }

  /**
   * Anschlusspunkte (#962): alle sofortigen Empfänger an dieser einen Stelle, in fester Reihenfolge (Test:
   * anlaesse.test.ts, Liste im Entwicklerhandbuch). Eine andere Reihenfolge ist ein eigener Pull Request. Die Empfänger
   * rufen ihre Methoden über `this`, damit Tests sie ersetzen können.
   */
  private schliesseEmpfaengerAn() {
    const a = this.kern.anlaesse;
    // Mappe angelegt bzw. geändert: Passung → Erwähnungen → Fristen → Post-Aufgaben.
    a.mappeGeaendert.anmelden('mappentypen.passung', async (e) => {
      // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
      if (!e.angelegt) await this.passungsAufgaben([{ id: e.mappe.id, problem: null }]);
      if (e.typ.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(e.typ);
    });
    a.mappeGeaendert.anmelden('aufgaben.erwaehnungen', async (e) => { if (!e.demo) await this.pruefeErwaehnungen(e.typ, e.mappe.id, e.alt, e.neu, e.von); });
    // Fristen (#129): neues Datum → „Frist erreicht“, verschobenes oder leeres → alte erledigt.
    a.mappeGeaendert.anmelden('aufgaben.fristen', async (e) => {
      if (e.angelegt && (e.demo || !fristFelder(e.typ).length)) return;
      await this.fristenAbgleichen({ mappeIds: [e.mappe.id] });
    });
    // Post (#192): „Für“ und Stand bestimmen die Aufgabe „Post für dich“.
    a.mappeGeaendert.anmelden('post.aufgaben', async (e) => { if (!e.angelegt && e.typ.system === 'post') await this.postAufgaben(e.mappe.id, e.von); });
    // Mappentyp geändert: Ansicht umbenennen → Titel → Passung → Fristen.
    a.typGeaendert.anmelden('sichten.umbenennen', async ({ alt, typ }) => {
      // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
      const eigene = (await this.repo.listeSichten()).find((x) => x.id === typ.id);
      if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(typ.id, { ...eigene, name: typ.name });
    });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    a.typGeaendert.anmelden('mappen.titel', async ({ typ }) => { await this.aktualisiereTitel((await this.repo.listeMappen(typ.id)).map((m) => m.id)); });
    a.typGeaendert.anmelden('mappentypen.passung', async ({ typ }) => { await this.pruefePassung(typ.id); });
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    a.typGeaendert.anmelden('aufgaben.fristen', async ({ typ }) => { await this.fristenAbgleichen({ typId: typ.id }); });
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    a.typAngelegt.anmelden('sichten.eigeneSicht', async ({ typ, sicht }) => { if (sicht) await this.sichtFuerTyp(typ); });
    // Abwesenheit (#78): Historie an der Benutzer-Mappe, Ereignisse, Aufgaben mit Anlass „Abwesenheit“.
    a.benutzerGespiegelt.anmelden('aufgaben.abwesenheit', async ({ benutzer, von, abwesenheit }) => {
      if (abwesenheit) await this.abwesenheitGeaendert(benutzer, abwesenheit.vorher, von, abwesenheit.wegen);
    });
    a.schliessen();
  }

  /** Volltext aus Paketen (#614, paketvolltext.ts); die Texterkennung meldet darüber (index.ts). */
  readonly paketVolltext: PaketVolltext;

  /** Erkennung im Kern (#336, #391): Vorschläge aus dem Volltext. */
  readonly erkennung: Erkennung;
  /** „Frag deine Ablage“ (#444): Ausschnitte suchen, Antwort-Paket fragen, Quellen prüfen. */
  readonly fragen: FragenAnDieAblage;
  /** Inhalte übersetzen auf Knopfdruck (#732): Paket mit dms:uebersetzen, Zwischenspeicher im Kurzzustand. */
  readonly uebersetzung: Uebersetzung;

  /** Ereignis „Volltext fertig“ (#336, #458; volltext/volltext.dienst.ts). */
  beiVolltextFertig(f: (e: { dokument: string; mappe: string }) => Promise<void>) { this.volltexte.beiVolltextFertig(f); }
  volltextFertig(e: { dokument: string; mappe: string }, m?: VolltextMeldung, von?: string | null): Promise<void> { return this.volltexte.volltextFertig(e, m, von); }

  /* ---------- Suche (#964: in suche/suche.dienst.ts) ---------- */

  /** Wer den Vektor eines Suchbegriffs liefert (Paket-Läufer, index.ts) – liegt bei der Suche. */
  get vektorAnbieter() { return this.suche.vektorAnbieter; }
  set vektorAnbieter(a: SucheDienst['vektorAnbieter']) { this.suche.vektorAnbieter = a; }
  suchVarianten(texte: Array<string | undefined>) { return this.suche.suchVarianten(texte); }
  unscharfAn() { return this.suche.unscharfAn(); }
  woerterEinarbeiten() { return this.suche.woerterEinarbeiten(); }
  sucheStand() { return this.suche.sucheStand(); }
  setzeSuche(e: unknown, von: string) { return this.suche.setzeSuche(e, von); }
  legeSynonymAn(e: unknown, von: string) { return this.suche.legeSynonymAn(e, von); }
  aendereSynonym(id: string, e: unknown, von: string) { return this.suche.aendereSynonym(id, e, von); }
  loescheSynonym(id: string, von: string) { return this.suche.loescheSynonym(id, von); }
  setzePaketSynonyme(paket: string, gruppen: string[][]) { return this.suche.setzePaketSynonyme(paket, gruppen); }
  paketSynonyme(paket: string) { return this.suche.paketSynonyme(paket); }
  woerterNeu(von: string) { return this.suche.woerterNeu(von); }
  vektorEinstellung() { return this.suche.vektorEinstellung(); }
  setzeVektorEinstellung(e: unknown) { return this.suche.setzeVektorEinstellung(e); }
  merkeVektorModell(paket: string, modell: string) { return this.suche.merkeVektorModell(paket, modell); }
  setzeVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown, eingabe: unknown) { return this.suche.setzeVektor(z, dokumentId, modellRoh, eingabe); }
  loescheVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown) { return this.suche.loescheVektor(z, dokumentId, modellRoh); }
  aehnlicheDokumente(...a: Parameters<SucheDienst['aehnlicheDokumente']>) { return this.suche.aehnlicheDokumente(...a); }
  aehnlicheZurMappe(z: Zugriff | undefined, mappeId: string) { return this.suche.aehnlicheZurMappe(z, mappeId); }
  aehnlicheZurSuche(...a: Parameters<SucheDienst['aehnlicheZurSuche']>) { return this.suche.aehnlicheZurSuche(...a); }
  aehnlicheZuText(z: Zugriff | undefined, text: string, anzahl: number, ms: number) { return this.suche.aehnlicheZuText(z, text, anzahl, ms); }
  aehnlicheTypen(...a: Parameters<SucheDienst['aehnlicheTypen']>) { return this.suche.aehnlicheTypen(...a); }
  vektorStand() { return this.suche.vektorStand(); }
  vektorenNeu(paket: string) { return this.suche.vektorenNeu(paket); }

  /**
   * Nachberechnung des Bestands (#442): für bis zu `max` Dokumente mit Volltext ohne Vektor dieses Modells ein
   * Ereignis „volltext.fertig“ an das Paket (nach = Dokument-Id, ab der weitergesucht wird). Liefert die Ids.
   */
  async vektorNachlauf(paket: string, modell: string, max: number, nach: string | null): Promise<string[]> {
    const alle = await this.kern.repoOhneTransaktion.ohneVektor(modell, max, nach);
    if (!alle.length) return [];
    // KI-Dienste (#796): Dokumente nicht zugelassener Mappentypen bekommt ein KI-Paket auch hier nicht (Stelle rückt trotzdem weiter).
    const gesperrt = await this.kiSperreFuer(paket);
    const typen = await this.kern.repoOhneTransaktion.typenVon([...new Set(alle.map((d) => d.mappeId))]);
    const liste = alle.filter((d) => { const typ = typen.get(d.mappeId); return !!typ && !gesperrt(typ); });
    if (liste.length) await this.kern.repoOhneTransaktion.legeEreignisseAn(liste.map((d) => ({ id: randomUUID(), paketId: paket, art: 'volltext.fertig', daten: { dokument: d.id, mappe: d.mappeId, nachberechnung: true } })));
    this.ereignisWecker?.();
    return alle.map((d) => d.id);
  }

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion (Kern). */
  private get repo(): Repo { return this.kern.repo; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private inAnfrage(): boolean { return this.kern.inAnfrage(); }
  private nachDerAntwort(f: () => Promise<unknown>): Promise<void> | void { return this.kern.nachDerAntwort(f); }
  private danach(f: () => void) { this.kern.danach(f); }

  /** Schlüssel wechseln (#47): alle Passwortfelder, der Papierkorb und die Einstellungen in einer Transaktion. */
  async schluesselWechseln(von: string) {
    if (!this.tresor) throw new Fachfehler(404, t('meldungen.dienst.die-verschluesselung-ist-nicht'));
    return this.tresor.wechsle((um, einstellungen) => this.repo.umschluesseln(um, einstellungen), von);
  }

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) { this.konten = h; }

  /* ---------- Dokumente (#1075, dokumente/dokumente.dienst.ts) ---------- */

  /** Texterkennung (#45) und Vorschaubilder (#332) anbinden, Text einer Datei sofort (#391), neue Dateien melden. */
  private get ocr() { return this.dokumente.ocr; }
  verbindeTexterkennung(t: TexterkennungAnbindung) { this.dokumente.verbindeTexterkennung(t); }
  textAusDatei(inhalt: Buffer, name: string, mime: string): Promise<{ text: string; info: string }> { return this.dokumente.textAusDatei(inhalt, name, mime); }
  verbindeVorschau(v: Parameters<DokumenteDienst['verbindeVorschau']>[0]) { this.dokumente.verbindeVorschau(v); }
  vorschauNachholen(): Promise<number> { return this.dokumente.vorschauNachholen(); }
  private neueDateien(docs: Dokument[]) { this.dokumente.neueDateien(docs); }

  /* ---------- Geschützte PDFs (#827, dokumente/geschuetzte-pdf.ts) ---------- */

  private get entsperren() { return this.geschuetztePdfs.entsperren; }
  verbindeEntsperren(e: PdfEntsperren) { this.geschuetztePdfs.verbindeEntsperren(e); }
  get pdfEntsperren() { return this.geschuetztePdfs.pdfEntsperren; }
  entsperrenAnbindung(o: Omit<EntsperrenAnbindung, 'datei' | 'dokumenteMitSha' | 'nachEntsperren'>): EntsperrenAnbindung { return this.geschuetztePdfs.entsperrenAnbindung(o); }
  entsperreDokument(id: string, konto: string, e: { passwort?: unknown; merken?: unknown; name?: unknown }, merkenErlaubt: boolean) { return this.geschuetztePdfs.entsperreDokument(id, konto, e, merkenErlaubt); }
  private mitPdfSchutz(docs: Dokument[]): Promise<Dokument[]> { return this.geschuetztePdfs.mitPdfSchutz(docs); }

  /** Inhalt der entsperrten Fassung zum Inhalt einer Datei (Stempel, Verkleinern, #827); null ohne. */
  private entsperrtZu = async (inhalt: Buffer): Promise<Buffer | null> => {
    if (!this.entsperren || inhalt.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
    return (await this.entsperren.fassung(createHash('sha256').update(inhalt).digest('hex')))?.inhalt ?? null;
  };

  /* ---------- Dateien umwandeln (#577, dokumente/umwandeln.ts) ---------- */

  private get umwandlung() { return this.dokumentUmwandlung.umwandlung; }
  verbindeUmwandlung(u: Dateiumwandlung, vorschau?: Parameters<DokumentUmwandlung['verbindeUmwandlung']>[1]) { this.dokumentUmwandlung.verbindeUmwandlung(u, vorschau); }
  get dateiumwandlung() { return this.dokumentUmwandlung.dateiumwandlung; }
  umwandlungAnbindung(ablage: FassungsAblage, vorschau?: { setze(sha: string, bild: Buffer, mime: string): Promise<void> }): UmwandlungsAnbindung { return this.dokumentUmwandlung.umwandlungAnbindung(ablage, vorschau); }
  nachFassung(docs: Dokument[], info: FassungInfo) { return this.dokumentUmwandlung.nachFassung(docs, info); }
  umwandelPaketDa(typen: string[]): Promise<number> { return this.dokumentUmwandlung.umwandelPaketDa(typen); }
  setzeFassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) { return this.dokumentUmwandlung.setzeFassung(z, id, sha, inhalt); }
  setzeVorschaubild(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) { return this.dokumentUmwandlung.setzeVorschaubild(z, id, sha, inhalt); }
  fassungVon(id: string): Promise<{ d: Dokument; info: FassungInfo; inhalt: Buffer }> { return this.dokumentUmwandlung.fassungVon(id); }
  umwandlungStand() { return this.dokumentUmwandlung.umwandlungStand(); }
  private nachUmwandlungsEreignis(...a: Parameters<DokumentUmwandlung['nachUmwandlungsEreignis']>) { return this.dokumentUmwandlung.nachUmwandlungsEreignis(...a); }

  /* ---------- Archivfassung (PDF/A, #631, dokumente/archivfassung.ts) ---------- */

  private get archiv() { return this.dokumentArchiv.archiv; }
  verbindeArchivfassung(a: Archivfassung) { this.dokumentArchiv.verbindeArchivfassung(a); }
  get archivfassung() { return this.dokumentArchiv.archivfassung; }
  archivAnbindung(ablage: ArchivAblage): ArchivAnbindung { return this.dokumentArchiv.archivAnbindung(ablage); }
  private archivNachVolltext(id: string, neu?: boolean) { return this.dokumentArchiv.archivNachVolltext(id, neu); }

  volltextAusgelassen(id: string) { return this.volltexte.volltextAusgelassen(id); }

  archivPaketDa(typen: string[]): Promise<number> { return this.dokumentArchiv.archivPaketDa(typen); }
  setzeArchivfassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) { return this.dokumentArchiv.setzeArchivfassung(z, id, sha, inhalt); }
  archivfassungVon(id: string) { return this.dokumentArchiv.archivfassungVon(id); }
  wortpositionen(id: string) { return this.dokumentArchiv.wortpositionen(id); }
  archivStand() { return this.dokumentArchiv.archivStand(); }
  private mitArchivStand(docs: Dokument[]): Promise<Dokument[]> { return this.dokumentArchiv.mitArchivStand(docs); }

  /* ---------- Volltext aus Paketen (#614, volltext/aus-paketen.ts) ---------- */

  volltextPaketDa(typen: string[]): Promise<number> { return this.volltextAusPaketen.volltextPaketDa(typen); }
  paketWegFuerDateien(paket: { name: string }, typen: string[]): Promise<number> { return this.volltextAusPaketen.paketWegFuerDateien(paket, typen); }
  pruefeVolltextRecht(z: Zugriff, id: string): Promise<void> { return this.volltextAusPaketen.pruefeVolltextRecht(z, id); }

  /* ---------- Volltext (#45, volltext/volltext.dienst.ts) ---------- */

  private static volltextAn(typ: Mappentyp | undefined, registerKey: string) { return VolltextDienst.volltextAn(typ, registerKey); }
  volltextNachholen(): Promise<number> { return this.volltexte.volltextNachholen(); }
  texterkennungErneut(id: string) { return this.volltexte.texterkennungErneut(id); }
  texterkennungPaket() { return this.volltexte.texterkennungPaket(); }
  texterkennungPaketDa(): Promise<number> { return this.volltexte.texterkennungPaketDa(); }
  volltextNeuAnzahl(umfang: unknown) { return this.volltexte.volltextNeuAnzahl(umfang); }
  volltextNeu(umfang: unknown, von: string) { return this.volltexte.volltextNeu(umfang, von); }
  texterkennungFortschritt(...a: Parameters<VolltextDienst['texterkennungFortschritt']>) { return this.volltexte.texterkennungFortschritt(...a); }

  /** Sicherung außer Haus (#585): ein Paket hat das Ereignis sicherung.fertig aufgegeben (index.ts verbindet mit der Sicherung). */
  sicherungAufgegeben?: (paket: string, name: string, fehler: string | null | undefined) => Promise<void>;
  /** Sicherung außer Haus (#636): Antwort des Pakets auf einen Aufruf von sicherung.fertig (index.ts verbindet mit der Sicherung). */
  sicherungAntwort?: (paket: string, name: string, r: EreignisAufruf) => Promise<void>;

  nachEreignisAufruf(paket: string, e: { art: string; daten: Record<string, unknown> }, r: EreignisAufruf): Promise<void> { return this.volltexte.nachEreignisAufruf(paket, e, r); }
  nachTexterkennungsEreignis(...a: Parameters<VolltextDienst['nachTexterkennungsEreignis']>) { return this.volltexte.nachTexterkennungsEreignis(...a); }
  volltext(id: string) { return this.volltexte.volltext(id); }
  schreibeVolltext(...a: Parameters<VolltextDienst['schreibeVolltext']>) { return this.volltexte.schreibeVolltext(...a); }
  setzeDokumentSprache(...a: Parameters<VolltextDienst['setzeDokumentSprache']>) { return this.volltexte.setzeDokumentSprache(...a); }
  teilenHinweisAus(id: string) { return this.volltexte.teilenHinweisAus(id); }

  private verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /* ---------- Passwortfelder (#46) ---------- */

  get passwoerterMoeglich() { return this.passwortfelder.passwoerterMoeglich; }
  unlesbarePasswoerter(): Promise<Betroffen[]> { return this.passwortfelder.unlesbarePasswoerter(); }
  zeigePasswort(mappeId: string, feldKey: string, benutzerId: string | null = null): Promise<{ wert: string }> { return this.passwortfelder.zeigePasswort(mappeId, feldKey, benutzerId); }
  entschluesselePasswoerter<T extends Mappe>(mappen: T[], wer: string, benutzerId: string | null = null): Promise<T[]> { return this.passwortfelder.entschluesselePasswoerter<T>(mappen, wer, benutzerId); }

  /* ---------- Aufgaben (#54) und Erwähnungen (#56) ---------- */

  /** Anzeigename eines Benutzers (auch für Platzhalter in Automatisierungen, #678). */
  name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }

  /** Ein aktiver Benutzer (seine Benutzer-Mappe), sonst 422. */
  private async pruefeEmpfaenger(id: unknown): Promise<string> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    if (m.werte.aktiv === false) throw new Fachfehler(422, t('meldungen.dienst.dieser-benutzer-ist-deaktiviert'));
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
    const { benutzer } = await this.kern.system();
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [mappeId] })).filter((a) => a.art === 'erwaehnung' && a.feldKey === quelle.key);
    // #137: nur Benutzer, die der Erwähnende sehen darf.
    const sichtbar = von ? await this.sichtbarFuer(von, [...jetzt]) : new Set(jetzt);
    for (const id of jetzt) {
      if (vorher.has(id) || id === von || offen.some((a) => a.empfaengerId === id) || !sichtbar.has(id)) continue;
      const m = await this.repo.holeMappe(id);
      if (!m || m.typId !== benutzer.id) continue;
      // Deaktivierte nur, wenn ihr Vertreter übernimmt (#78).
      if (m.werte.aktiv === false && (await this.empfaengerAufloesen(id)).ziel === id) continue;
      const a = await this.neueAufgabe({
        id: randomUUID(), mappeId, empfaengerId: id, art: 'erwaehnung', feldKey: quelle.key,
        text: t('meldungen.dienst.erwaehnt-von', { name: await this.name(von), ort: quelle.ort, wert: quelle.auszug ? `: ${quelle.auszug}` : '' }).slice(0, AUFGABE_MAX),
        erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null,
      });
      await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnt', { name: await this.name(id), ort: quelle.ort }), aufgabe: a.id, aufgabenart: 'erwaehnung', fuer: id, aufgabentext: a.text });
      await this.leiteUm(a);
    }
    for (const id of vorher) {
      if (!jetzt.has(id)) await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erwaehnung-von-entfernt', { name: await this.name(id), ort: quelle.ort }) });
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
      text: t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von', { namen, name: await this.name(ziel), text: a.text }),
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
    if (!ziel || ziel === id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-anderen-benutzer'));
    const offen = (await this.repo.offeneAufgaben({ benutzerId: id })).filter((a) => a.empfaengerId === id);
    for (const a of offen) {
      await this.repo.delegiereAufgabe(a.id, ziel);
      await this.notiere(a.mappeId, von, 'aufgabe', {
        text: t('meldungen.dienst.weitergegeben-von-an', { name: await this.name(id), name2: await this.name(ziel), text: a.text }),
        aufgabe: a.id, aufgabenart: a.art, vonId: id, anId: ziel, aufgabentext: a.text,
      });
    }
    if (offen.length) protokoll.modul('ablage').info('Offene Aufgaben übergeben', { von: await this.name(id), an: await this.name(ziel), anzahl: offen.length });
    await this.faelleNach(offen.map((a) => a.mappeId));
    return offen.length;
  }

  /**
   * Abwesenheit geändert (#78): Klartext im Protokoll der Benutzer-Mappe; die Aufgabe „Vertretung“
   * des bisherigen Vertreters erledigt sich, der aktuelle bekommt eine neue (nicht umgeleitet).
   */
  async abwesenheitGeaendert(b: Benutzer, alt: Abwesenheit, von: string | null, wegen?: string) {
    const neu = b.abwesenheit;
    if (!neu || JSON.stringify(neu) === JSON.stringify(alt)) return;
    const { benutzer: typ } = await this.kern.system();
    const m = await this.repo.holeMappe(b.id);
    if (!m || m.typId !== typ.id) return;
    const name = b.name || b.email;
    const datum = (t: string) => t.split('-').reverse().join('.');
    const zeitraum = (a: Abwesenheit) => (a.von && a.bis ? t('meldungen.dienst.vom-bis', { datum: datum(a.von), datum2: datum(a.bis) }) : a.von ? t('meldungen.dienst.ab-bis-die-abwesenheit', { datum: datum(a.von) })
      : a.bis ? t('meldungen.dienst.ab-sofort-bis', { datum: datum(a.bis) }) : t('meldungen.dienst.ab-sofort-bis-die'));
    const durch = von && von !== b.id ? t('meldungen.dienst.eingetragen-von', { name: await this.name(von) }) : '';
    const endet = alt.an && !neu.an;
    const text = endet ? t('meldungen.dienst.abwesenheit-beendet', { wert: wegen ? ` (${wegen})` : '' })
      : neu.an ? t('meldungen.dienst.abwesenheit-vertreter', { wert: alt.an ? t('meldungen.dienst.geaendert') : t('meldungen.dienst.eingetragen'), zeitraum: zeitraum(neu), name: await this.name(neu.vertreterId), durch })
      : t('meldungen.dienst.vertreter', { wert: neu.vertreterId ? t('meldungen.dienst.hinterlegt', { name: await this.name(neu.vertreterId) }) : t('meldungen.dienst.entfernt'), durch });
    await this.notiere(b.id, von, 'abwesenheit', { text });
    // Ereigniskatalog (#670): Abwesenheit gesetzt (auch geändert) bzw. beendet; Vertretung zurückgezogen (#678/#712)
    // für den bisherigen Vertreter, wenn die Abwesenheit endet oder ein anderer bzw. kein Vertreter eingetragen ist.
    const bisher = alt.an ? alt.vertreterId ?? null : null;
    const zurueck = bisher && (endet || !neu.an || neu.vertreterId !== bisher) ? bisher : null;
    if (endet) {
      await this.ereignis('benutzer.abwesenheit_beendet', { benutzer: b.id, vertreter: bisher }, von);
      // Aufgaben mit Anlass „Abwesenheit“ (#724, z. B. aus „Wenn Abwesenheit gesetzt“) erledigen sich.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.abwesenheit-beendet-2'));
    } else if (alt.an) {
      // Geändert (Zeitraum oder Vertreter): Was „Abwesenheit gesetzt“ angelegt hatte, erledigt sich; das Ereignis
      // unten legt es mit den neuen Angaben neu an – wie früher die Vertretungs-Aufgabe.
      await this.erledigeNachAnlass(b.id, (x) => x.art === 'abwesenheit' && x.benutzer === b.id, t('meldungen.dienst.vertretung-geaendert'));
    }
    if (zurueck) await this.ereignis('benutzer.vertretung_zurueckgezogen', { benutzer: b.id, vertreter: zurueck }, von);
    if (!endet && neu.an) await this.ereignis('benutzer.abwesenheit_gesetzt', { benutzer: b.id, von: neu.von, bis: neu.bis, vertreter: neu.vertreterId }, von);
    // Seit #712 legt der Kern keine Vertretungs-Aufgabe mehr an – das macht die Automatisierung „Vertretung eingetragen“
    // (Paket Benachrichtigungen bzw. beim Update übernommen). Alte Vertretungs-Aufgaben erledigen sich wie bisher.
    for (const a of (await this.repo.offeneAufgaben({ mappeIds: [b.id] })).filter((x) => x.art === 'vertretung')) {
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(b.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt', { wert: endet ? t('meldungen.dienst.abwesenheit-beendet-2') : t('meldungen.dienst.vertretung-geaendert'), text: a.text }), aufgabe: a.id, aufgabenart: 'vertretung', fuer: a.empfaengerId, aufgabentext: a.text });
    }
  }

  /** Aufgabe von Hand vergeben, z. B. „Bitte Rechnung prüfen“. */
  async legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const x = (e ?? {}) as Record<string, unknown>;
    const text = typeof x.text === 'string' ? x.text.trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.dienst.bitte-beschreiben-was-zu'));
    if (text.length > AUFGABE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen', { AUFGABE_MAX }));
    const an = await this.pruefeEmpfaenger(x.empfaengerId);
    // #928: Typ und Name nur einmal lesen (je eine Abfrage weniger).
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId, empfaengerId: an, art: 'manuell', text, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null }, m.typId);
    const name = await this.name(an);
    await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name, text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: an, aufgabentext: text });
    protokoll.modul('ablage').info('Aufgabe vergeben', { mappeId, an: name });
    const erg = await this.leiteUm(a);
    // #798: Darf der Empfänger die Mappe nicht lesen, entsteht ein Fall – der Admin erfährt davon.
    await this.faelleNach([mappeId]);
    return erg;
  }

  private async eigeneAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.repo.holeAufgabe(id);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const meine = a.empfaengerId === ich.id || (!a.empfaengerId && await this.siehtOhneEmpfaenger(ich));
    if (!meine && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.das-ist-nicht-deine'));
    if (a.erledigt) throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-ist-schon'));
    return a;
  }

  /** Bestätigen (Erwähnungen, manuelle Aufgaben). „Passt nicht“ erledigt sich, sobald die Mappe passt. */
  async erledigeAufgabe(id: string, ich: { id: string; rolle: string }) {
    const a = await this.eigeneAufgabe(id, ich);
    if (a.art === 'passung') throw new Fachfehler(409, t('meldungen.dienst.diese-aufgabe-erledigt-sich'));
    // „Geändert“ bestätigen (#422) = gesehen; ohne Eintrag in der Historie der Mappe.
    if (a.art === 'aenderung') { await this.gesehen(ich, [a.mappeId]); return (await this.repo.holeAufgabe(id))!; }
    await this.repo.erledigeAufgabe(id, ich.id);
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erledigt-2', { text: a.text }), aufgabe: id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe erledigt', { mappeId: a.mappeId, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
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
    await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text });
    protokoll.modul('ablage').info('Aufgabe weitergegeben', { mappeId: a.mappeId, von, an: nach, aufgabe: a.text });
    await this.faelleNach([a.mappeId]);
    return (await this.repo.holeAufgabe(id))!;
  }

  /**
   * Sammel-Weitergabe (#415, #419): mehrere Aufgaben an einen Benutzer. Je Aufgabe dieselben Rechte wie beim
   * einzelnen Weitergeben (eigene oder – als Administrator – alle); zusätzlich muss das Ziel die Mappe lesen
   * dürfen. Was nicht geht, kommt mit Grund zurück. Jede Weitergabe steht in der Historie ihrer Mappe; der
   * Empfänger bekommt dafür **eine** Sammelbenachrichtigung statt vieler einzelner.
   */
  async aufgabenWeitergeben(ids: unknown, an: unknown, ich: { id: string; rolle: string }): Promise<{
    weitergegeben: string[]; nicht: Array<{ id: string; grund: string }>;
  }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const ziel = await this.pruefeEmpfaenger(an);
    const nach = await this.name(ziel);
    const weitergegeben: string[] = [];
    const mappenWeiter: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      let a: Aufgabe;
      try { a = await this.eigeneAufgabe(id, ich); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); continue; }
      if (a.empfaengerId === ziel) { nicht.push({ id, grund: t('meldungen.dienst.liegt-schon-bei', { nach }) }); continue; }
      // Lesen kann auch erst die Aufgabe selbst erlauben (Regel „hat eine Aufgabe“) – deshalb nach dem Umhängen
      // prüfen und bei Bedarf zurückhängen.
      await this.repo.delegiereAufgabe(id, ziel);
      if (!(await this.kannLesen(ziel, a.mappeId))) { await this.repo.delegiereAufgabe(id, a.empfaengerId); nicht.push({ id, grund: t('meldungen.dienst.darf-die-mappe-nicht', { nach }) }); continue; }
      const von = await this.name(a.empfaengerId);
      await this.notiere(a.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.weitergegeben-von-an-2', { von, nach, text: a.text }), aufgabe: id, aufgabenart: a.art, vonId: a.empfaengerId, anId: ziel, aufgabentext: a.text, sammel: true });
      weitergegeben.push(id);
      mappenWeiter.push(a.mappeId);
    }
    await this.faelleNach(mappenWeiter);
    if (weitergegeben.length) {
      protokoll.modul('ablage').info('Aufgaben gesammelt weitergegeben', { an: nach, anzahl: weitergegeben.length, nicht: nicht.length });
      if (ziel !== ich.id) await this.sammelHinweisWeitergabe(ziel, ich.id, weitergegeben.length);
    }
    return { weitergegeben, nicht };
  }

  /** Sammelaktion „erledigt“ (#415): wie erledigeAufgabe je Aufgabe; was nicht geht, mit Grund. */
  async aufgabenErledigen(ids: unknown, ich: { id: string; rolle: string }): Promise<{ erledigt: string[]; nicht: Array<{ id: string; grund: string }> }> {
    if (!Array.isArray(ids) || !ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-eine-aufgabe'));
    if (ids.length > SAMMEL_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-aufgaben-auf-einmal', { SAMMEL_MAX }));
    const erledigt: string[] = [];
    const nicht: Array<{ id: string; grund: string }> = [];
    for (const id of [...new Set(ids.map(String))]) {
      try { await this.erledigeAufgabe(id, ich); erledigt.push(id); } catch (e) { if (!(e instanceof Fachfehler)) throw e; nicht.push({ id, grund: e.message }); }
    }
    return { erledigt, nicht };
  }

  /**
   * Gebündelte Benachrichtigung (#415, #419; auch #422): eine offene Aufgabe je Empfänger, Mappe, Art und
   * Schlüssel. Ist schon eine offen, kommt keine zweite – `text` bekommt die bisherige und baut daraus den neuen
   * Text (etwa hochgezählt). Erst wenn der Empfänger sie erledigt hat, entsteht bei Bedarf wieder eine neue.
   */
  async benachrichtigeGebuendelt(e: { empfaengerId: string; mappeId: string; art: Aufgabenart; schluessel: string; von: string | null; text: (bisher: Aufgabe | undefined) => string | Promise<string> }) {
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [e.mappeId] })).find((a) => a.art === e.art && a.feldKey === e.schluessel && a.empfaengerId === e.empfaengerId);
    const text = (await e.text(offen)).slice(0, AUFGABE_MAX);
    if (offen) { if (offen.text !== text) await this.repo.aendereAufgabeText(offen.id, text); return offen.id; }
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: e.art, feldKey: e.schluessel, text, erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null });
    return a.id;
  }

  /** Sammelbenachrichtigung der Weitergabe: an der Benutzer-Mappe dessen, der weitergegeben hat (#415). */
  private async sammelHinweisWeitergabe(ziel: string, von: string, n: number) {
    if (!(await this.repo.holeMappe(von))) return;
    const name = await this.name(von);
    await this.benachrichtigeGebuendelt({
      empfaengerId: ziel, mappeId: von, art: 'manuell', schluessel: SAMMEL_WEITERGABE, von,
      text: (bisher) => {
        const gesamt = n + Number(/(\d+) Aufgaben/.exec(bisher?.text ?? '')?.[1] ?? (bisher ? 1 : 0));
        return t('meldungen.dienst.hat-dir-aufgaben-weitergegeben', { anzahl: gesamt, name });
      },
    });
  }

  /** Meine offenen Aufgaben (mit denen der Administratoren, wenn ich einer bin). */
  async meineAufgaben(ich: { id: string; rolle: string }, z?: Zugriff) {
    const liste = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich) });
    // Aufgaben zu Mappen, die man nicht lesen darf: ohne Titel (#127); automatische nur mit Hinweis (#798).
    const ok = await this.lesbare(z, liste.map((a) => a.mappeId));
    return (await this.ohneLeserechtText(liste, ok, ich.id)).map((a) => (ok.has(a.mappeId) ? a : { ...a, mappeTitel: NICHT_SICHTBAR, verborgen: true }));
  }

  /* ---------- Aufgaben bei Personen ohne Leserecht (#798) ---------- */

  /**
   * Automatische Aufgaben zu Mappen, die der Empfänger nicht lesen darf (#798): Statt des Textes steht nur „Aufgabe zu
   * einer Mappe, die du nicht sehen darfst – frag …“ (wer die Mappe angelegt hat, sonst ein Administrator); die
   * Fälligkeit bleibt – außer bei Fristen und Aufgaben zu einem Datumsfeld: Deren Datum ist ein Wert der Mappe und fällt
   * samt Feld weg (#958). Von Hand geschriebene Texte (Zugewiesen, Erinnerung – von einem Menschen) bleiben sichtbar.
   * `lesbar`: die Mappen, die er lesen darf. Gilt für „Zu erledigen“, die Mappe ohne Leserecht und die Tägliche Zusammenfassung.
   */
  private async ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]> {
    const fremd = liste.filter((a) => !lesbar.has(a.mappeId));
    if (!fremd.length) return liste;
    const menschen = new Set(this.konten?.benutzer ? (await this.konten.benutzer()).map((b) => b.id) : []);
    const vonHand = (a: Aufgabe) => (a.art === 'manuell' || a.art === 'erinnerung') && !a.anlass
      && (!a.feldKey || a.feldKey === SAMMEL_WEITERGABE) && !!a.erstelltVon && menschen.has(a.erstelltVon);
    const ersteller = new Map((await this.repo.holeMappen([...new Set(fremd.map((a) => a.mappeId))])).map((m) => [m.id, m.erstelltVon] as const));
    const text = new Map<string, string>();
    for (const id of new Set(fremd.map((a) => a.mappeId))) {
      const e = ersteller.get(id);
      text.set(id, e && e !== ich && menschen.has(e) ? t('mappen.aufgabe.ohne-leserecht', { name: await this.name(e) }) : t('mappen.aufgabe.ohne-leserecht.admin'));
    }
    // #958: Bei Fristen (und Aufgaben zu einem Datumsfeld) sind Datum und Feld Werte der Mappe – ohne Leserecht weg.
    const ausFeld = (a: Aufgabe) => a.art === 'frist' || a.anlass?.art === 'datum';
    const ohneFeld = (a: T): T => (ausFeld(a) ? { ...a, datum: null, feldKey: null, anlass: null } : a);
    return liste.map((a) => (lesbar.has(a.mappeId) ? a : ohneFeld(vonHand(a) ? a : { ...a, text: text.get(a.mappeId)! })));
  }

  /** Zugriff eines anderen Benutzers, etwa für Platzhalter mit den Rechten des Empfängers (#795); kein Mensch: null. */
  async zugriffVon(benutzerId: string): Promise<Zugriff | null> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    return b ? this.zugriff(b) : null;
  }

  /** Wie sichtbarFuer, aber ohne Leserechte auf Zeit (#798): Was erlauben die Berechtigungen selbst? */
  async regulaerSichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> {
    const b = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === benutzerId) : undefined;
    if (!b) return new Set(ids);
    return this.lesbare(await rechteMessen(() => this.bildeZugriff(b, { ohneAufZeit: true })), ids);
  }

  /**
   * Fälle abgleichen (#798): Wo liegt eine offene Aufgabe bei einem Menschen ohne Admin-Rechte, der die Mappe nach den
   * Berechtigungen nicht lesen darf? Neue Fälle anlegen; offene beenden, wenn die Aufgabe erledigt, gelöscht oder an
   * jemand anderen gegeben ist – oder die Person die Mappe inzwischen lesen darf. Endet ein Fall mit Leserecht auf
   * Zeit, steht der Entzug in der Historie der Mappe (das Recht selbst wirkt schon nicht mehr, sobald die Aufgabe
   * nicht mehr offen bei ihm liegt). Nach dem Vergeben, Weitergeben und Erledigen von Aufgaben (nur deren Mappen) und
   * regelmäßig für alle (Rechte geändert, Erwähnungen, Fristen …). Mehrere Server: Anlegen und Beenden sind eindeutig.
   */
  async faelleAbgleichen(f: { mappeIds?: string[] } = {}): Promise<{ neu: number; beendet: number }> {
    if (!this.konten?.benutzer || (f.mappeIds && !f.mappeIds.length)) return { neu: 0, beendet: 0 };
    const menschen = new Map((await this.konten.benutzer()).map((b) => [b.id, b] as const));
    const offen = (await this.repo.offeneAufgaben(f.mappeIds ? { mappeIds: f.mappeIds } : {})).filter((a) => a.empfaengerId && menschen.has(a.empfaengerId));
    const jeEmpfaenger = new Map<string, Aufgabe[]>();
    for (const a of offen) jeEmpfaenger.set(a.empfaengerId!, [...(jeEmpfaenger.get(a.empfaengerId!) ?? []), a]);
    const ohne = new Set<string>();
    for (const [id, liste] of jeEmpfaenger) {
      const ok = await this.regulaerSichtbarFuer(id, [...new Set(liste.map((a) => a.mappeId))]);
      for (const a of liste) if (!ok.has(a.mappeId)) ohne.add(a.id);
    }
    const nachId = new Map(offen.map((a) => [a.id, a] as const));
    const faelle = await this.repo.faelleOhneLeserecht({ offen: true, ...(f.mappeIds ? { mappeIds: f.mappeIds } : {}) });
    let beendet = 0;
    const bleiben = new Set<string>();
    for (const x of faelle) {
      const a = nachId.get(x.aufgabeId);
      let grund: FallEnde | null = null;
      let zeit: string | null = null;
      if (a) grund = a.empfaengerId !== x.benutzerId ? 'weitergegeben' : ohne.has(a.id) ? null : 'lesbar';
      else {
        const g = await this.repo.holeAufgabe(x.aufgabeId);
        if (!g || !(await this.repo.holeMappe(g.mappeId))) grund = 'geloescht';
        else if (g.erledigt) { grund = 'erledigt'; zeit = g.erledigt; }
        else if (g.empfaengerId !== x.benutzerId) grund = 'weitergegeben';
        // Offen bei ihm, aber kein Mensch ohne Admin-Rechte mehr (z. B. Administrator geworden): Er darf jetzt lesen.
        else grund = 'lesbar';
      }
      if (!grund) { bleiben.add(`${x.aufgabeId}|${x.benutzerId}`); continue; }
      if (!(await this.repo.beendeFall(x.id, grund, zeit))) continue;
      beendet++;
      if (x.leserechtSeit) {
        const name = await this.name(x.benutzerId);
        await this.notiere(x.mappeId, null, 'leserecht', { text: t.frei(`mappen.leserecht.entzogen.${grund}`, { name }), fall: x.id, fuer: x.benutzerId, aufgabe: x.aufgabeId, entzogen: true });
        protokoll.modul('ablage').info('Leserecht auf Zeit beendet', { mappeId: x.mappeId, fuer: name, grund });
      }
    }
    let neu = 0;
    for (const a of offen) {
      if (!ohne.has(a.id) || bleiben.has(`${a.id}|${a.empfaengerId}`)) continue;
      if (await this.repo.legeFallAn({ id: randomUUID(), aufgabeId: a.id, mappeId: a.mappeId, benutzerId: a.empfaengerId!, aufgabentext: a.text })) {
        neu++;
        protokoll.modul('ablage').info('Aufgabe bei einer Person ohne Leserecht', { mappeId: a.mappeId, fuer: await this.name(a.empfaengerId) });
      }
    }
    return { neu, beendet };
  }

  /**
   * Abgleich für einzelne Mappen nach dem Vergeben, Weitergeben oder Erledigen (#798) – ein Fehler hält die Aufgabe nicht auf.
   *
   * In einer Anfrage (#928) nach der Antwort, solange an diesen Mappen kein Leserecht auf Zeit hängt: Dann legt der Abgleich
   * höchstens Fälle für die Werkbank an oder schließt welche ohne Recht – an den Rechten ändert sich nichts, und die
   * Übersicht in der Werkbank gleicht vor dem Anzeigen ohnehin selbst ab. Hängt ein Leserecht auf Zeit daran, sofort:
   * Es endet mit der Aufgabe, nicht erst kurz danach („Nachhinken ja, falsch nie“).
   */
  private async faelleNach(mappeIds: string[]) {
    const ids = [...new Set(mappeIds)];
    const abgleichen = async () => {
      try { await this.faelleAbgleichen({ mappeIds: ids }); }
      catch (e) { protokoll.modul('ablage').warn('Aufgaben ohne Leserecht nicht abgeglichen', { fehler: (e as Error).message }); }
    };
    if (!ids.length || !this.konten?.benutzer) return;
    if (this.inAnfrage()) {
      let mitRecht = true;
      try { mitRecht = (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: ids })).some((f) => f.leserechtSeit); } catch { /* dann sofort */ }
      if (!mitRecht) { void this.nachDerAntwort(abgleichen); return; }
    }
    await abgleichen();
  }

  /** Offene Fälle (#798) – für den Hinweis in der Werkbank und die Mail an die Administratoren (#719). */
  async offeneFaelle(): Promise<FallOhneLeserecht[]> { return this.repo.faelleOhneLeserecht({ offen: true }); }

  /** Werkbank → Aufgaben → Ohne Leserecht (#798): erst abgleichen, dann offene Fälle oben, vergangene darunter. */
  async faelleUebersicht(): Promise<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] }> {
    await this.faelleAbgleichen();
    const alle = await this.repo.faelleOhneLeserecht({ max: 500 });
    return { offen: alle.filter((x) => !x.ende), vergangen: alle.filter((x) => x.ende) };
  }

  /**
   * Leserecht für die Dauer der Aufgabe geben (#798, nur in der Werkbank): nur Lesen, nur diese Mappe; es endet von selbst,
   * wenn die Aufgabe erledigt, gelöscht oder an jemand anderen gegeben wird. Steht in der Historie der Mappe.
   */
  async leserechtAufZeitGeben(fallId: unknown, von: string | null): Promise<FallOhneLeserecht> {
    if (!istUuid(fallId)) throw new Fachfehler(404, t('werkbank.ohne-leserecht.fehler.weg'));
    const vorher = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (vorher) await this.faelleAbgleichen({ mappeIds: [vorher.mappeId] });
    const f = (await this.repo.faelleOhneLeserecht({ offen: true })).find((x) => x.id === fallId);
    if (!f) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
    if (!f.leserechtSeit) {
      if (!(await this.repo.gibLeserechtAufZeit(f.id, von))) throw new Fachfehler(409, t('werkbank.ohne-leserecht.fehler.weg'));
      const name = await this.name(f.benutzerId);
      const aufgabe = f.aufgabentext.length > 80 ? `${f.aufgabentext.slice(0, 79)}…` : f.aufgabentext;
      await this.notiere(f.mappeId, von, 'leserecht', { text: t('mappen.leserecht.vergeben', { name, aufgabe, von: await this.name(von) }), fall: f.id, fuer: f.benutzerId, aufgabe: f.aufgabeId, vergeben: true });
      protokoll.modul('werkbank').info('Leserecht auf Zeit gegeben', { mappeId: f.mappeId, fuer: name, von: await this.name(von) });
    }
    return (await this.repo.faelleOhneLeserecht({ offen: true, mappeIds: [f.mappeId] })).find((x) => x.id === f.id) ?? f;
  }
  /** Werkbank: alle offenen oder die zuletzt erledigten. */
  async alleAufgaben(erledigt = false) { return erledigt ? this.repo.erledigteAufgaben(500) : this.repo.offeneAufgaben(); }
  aufgabenVon(mappeId: string) { return this.repo.aufgabenVon(mappeId); }

  /* ---------- Fristen (#129–#133) ---------- */

  /**
   * Frist-Aufgaben abgleichen: offene Fristen erledigen sich, sobald das Datum nicht mehr stimmt; „Frist erreicht“
   * melden. Neue Frist-Aufgaben legt seit #712 nur noch die Automatisierung „Datum erreicht“ an.
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
    const angelegt = 0; let erledigt = 0;
    for (const m of mappen) {
      const typ = typen.get(m.typId);
      if (!typ) continue;
      // Offene Fristen, deren Datum sich geändert hat oder leer ist: erledigt.
      for (const a of vorhanden.filter((x) => x.mappeId === m.id && !x.erledigt)) {
        const feld = typ.felder.find((x) => x.key === a.feldKey);
        const wert = a.feldKey ? m.werte[a.feldKey] : null;
        // Aus einer Automatisierung (Anlass Datum): erledigt sich nur, wenn das Datum nicht mehr stimmt.
        const giltNoch = a.anlass?.art === 'datum' ? !!feld : !!feld?.frist;
        if (giltNoch && wert === a.datum) continue;
        const grund = !feld ? t('meldungen.dienst.feld-entfernt') : !giltNoch ? t('meldungen.dienst.keine-erinnerung-mehr') : !istDatum(wert) ? t('meldungen.dienst.datum-leer') : wert > (a.datum ?? '') ? t('meldungen.dienst.verschoben-auf', { datumDe: datumDe(wert) }) : t('meldungen.dienst.geaendert-auf', { datumDe: datumDe(wert) });
        await this.repo.erledigeAufgabe(a.id, null);
        await this.notiere(m.id, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: 'frist', fuer: a.empfaengerId, aufgabentext: a.text });
        erledigt++;
      }
      for (const feld of fristFelder(typ)) {
        const wert = m.werte[feld.key];
        const fr = feld.frist!;
        // Ereigniskatalog (#670): „Frist erreicht“ zum Erinnerungszeitpunkt und am Tag selbst – je Zeitpunkt genau einmal.
        if (istDatum(wert) && !m.demo && wert >= heute && fristAb(wert, fr) <= heute) {
          const an = fristEmpfaenger(fr, m);
          await this.fristErreicht(m, feld.key, wert, 'vorlauf', an);
          if (wert === heute) await this.fristErreicht(m, feld.key, wert, 'faellig', an);
        }
        // #712: Das Feld legt keine Aufgaben mehr selbst an – das tun die Automatisierungen „Datum erreicht“, in die
        // jede Erinnerung am Feld beim Update übernommen wurde (Automatisierungen.fristenUebernehmen).
      }
    }
    if (angelegt || erledigt) protokoll.modul('ablage').info('Fristen abgeglichen', { angelegt, erledigt });
    return { angelegt, erledigt };
  }

  /**
   * „Frist erreicht“ (#670): Merken und Ereignis in einer Transaktion – auch wenn zwei Server den Fristen-Lauf zugleich
   * machen oder er nach einem Neustart wiederholt wird, kommt es je Mappe, Feld, Datum und Zeitpunkt genau einmal.
   */
  private async fristErreicht(m: Mappe, feld: string, datum: string, zeitpunkt: 'vorlauf' | 'faellig', empfaenger: string | null) {
    try {
      await this.inTransaktion(async () => {
        if (!(await this.repo.merkeFristMeldung({ mappeId: m.id, feld, datum, zeitpunkt }))) return;
        await this.ereignis('frist.erreicht', { mappe: m.id, typ: m.typId, feld, datum, zeitpunkt, empfaenger });
      });
    } catch (e) { protokoll.modul('ablage').warn('„Frist erreicht“ nicht gemeldet', { mappe: m.id, feld, fehler: (e as Error).message }); }
  }

  /** Fällige freie Erinnerungen (#131) werden zu Aufgaben. */
  async erinnerungenFaellig(heute = heuteIn()): Promise<number> {
    let n = 0;
    for (const e of await this.repo.erinnerungen({ bis: heute })) {
      const a = await this.neueAufgabe({ id: randomUUID(), mappeId: e.mappeId, empfaengerId: e.empfaengerId, art: 'erinnerung', text: e.text, datum: e.datum, erstellt: '', erstelltVon: e.erstelltVon, erledigt: null, erledigtVon: null });
      await this.repo.loescheErinnerung(e.id);
      await this.notiere(e.mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erinnerung-faellig-fuer', { name: await this.name(e.empfaengerId), text: e.text }), aufgabe: a.id, aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
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
    if (!istDatum(x.datum)) throw new Fachfehler(422, t('meldungen.dienst.bitte-ein-datum-angeben'));
    const text = typeof x.text === 'string' ? x.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.dienst.woran-soll-erinnert-werden'));
    if (text.length > ERINNERUNG_TEXT_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-zeichen-2', { ERINNERUNG_TEXT_MAX }));
    return { datum: x.datum, text, empfaengerId: x.empfaengerId };
  }

  /** Erinnerung an einer Mappe (#131): für mich oder einen anderen Benutzer; ist das Datum schon da, gleich als Aufgabe. */
  async legeErinnerungAn(mappeId: string, e: unknown, von: string): Promise<Erinnerung | Aufgabe> {
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : von;
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId, empfaengerId: an, datum: x.datum, text: x.text, erstellt: '', erstelltVon: von });
    await this.notiere(mappeId, von, 'aufgabe', { text: t('meldungen.dienst.erinnerung-fuer-am', { name: await this.name(an), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return r;
  }

  /** Ändern und Löschen: Ersteller, Empfänger oder ein Administrator. */
  private async eigeneErinnerung(id: string, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const e = await this.repo.holeErinnerung(id);
    if (!e) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es'));
    if (e.erstelltVon !== ich.id && e.empfaengerId !== ich.id && ich.rolle !== 'admin') throw new Fachfehler(403, t('meldungen.dienst.aendern-kann-eine-erinnerung'));
    return e;
  }
  async erinnerungMappe(id: string) { const e = await this.repo.holeErinnerung(id); if (!e) throw new Fachfehler(404, t('meldungen.dienst.diese-erinnerung-gibt-es-2')); return e.mappeId; }

  async aendereErinnerung(id: string, e: unknown, ich: { id: string; rolle: string }): Promise<Erinnerung> {
    const alt = await this.eigeneErinnerung(id, ich);
    const x = Dienst.erinnerungEingabe(e);
    const an = x.empfaengerId ? await this.pruefeEmpfaenger(x.empfaengerId) : alt.empfaengerId;
    const neu = (await this.repo.aendereErinnerung(id, { datum: x.datum, text: x.text, empfaengerId: an }))!;
    await this.notiere(alt.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erinnerung-geaendert-fuer-am', { name: await this.name(an), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: an, aufgabentext: x.text });
    if (x.datum <= heuteIn()) await this.erinnerungenFaellig();
    return neu;
  }

  async loescheErinnerung(id: string, ich: { id: string; rolle: string }) {
    const e = await this.eigeneErinnerung(id, ich);
    await this.repo.loescheErinnerung(id);
    await this.notiere(e.mappeId, ich.id, 'aufgabe', { text: t('meldungen.dienst.erinnerung-geloescht', { text: e.text }), aufgabenart: 'erinnerung', fuer: e.empfaengerId, aufgabentext: e.text });
  }

  /**
   * Termine für „Zu erledigen“ → Monat und Jahr (#528, #725): von … bis (höchstens ein Jahr), nach Datum.
   *
   * - Eigene offene Aufgaben mit Datum (Fristen, Erinnerungen, andere wie „Auskunft bis …“) – Überfälliges auch
   *   außerhalb des Zeitraums (für „3 überfällig“).
   * - Die Daten der Frist-Felder („ist eine Frist“, #712) an allen Mappen, die man **lesen darf** – der Empfänger
   *   am Feld ist mit #712 weggefallen –, dazu die künftigen Termine wiederkehrender Fristen; `favoriten` grenzt
   *   auf die eigenen Favoriten ein.
   * - Eigene freie Erinnerungen und die Feiertage der Region (#726).
   *
   * Eine Vorschau „demnächst“ gibt es nicht mehr (#725): Automatisierungen legen die Aufgabe zum richtigen
   * Zeitpunkt in „Zu erledigen“.
   *
   * Zwischengespeichert wie die Zahlen der Ansichten (#512): je Benutzer, Rechte und Zeitraum, solange sich
   * am Haushalt nichts ändert (auch Erinnerungen zählen hier), höchstens 5 Minuten, nie über Mitternacht.
   */
  async termine(z: Zugriff, q: { von?: unknown; bis?: unknown; favoriten?: unknown } = {}, land?: Bundesland | null): Promise<TermineAntwort> {
    const heute = heuteIn();
    const problem = zeitraumProblem(q.von, q.bis);
    if (problem) throw new Fachfehler(422, problem);
    const von = q.von as string; const bis = q.bis as string;
    const nurFavoriten = q.favoriten === true || q.favoriten === '1' || q.favoriten === 'true';
    // #719: Sieht er die Aufgaben ohne Empfänger? Das ändert sich mit der Werkbank, nicht mit dem Haushaltsstand.
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${ohne ? 'o' : ''}|${fingerabdruck({ lesen: z.lesen, paket: z.paket?.id ?? null })}|${von}|${bis}|${nurFavoriten ? 'f' : 'a'}`;
    const beginn = performance.now();
    // #918: ohne Favoriten am Mappenstand – ein Stern rechnet die Termine nicht neu.
    const speicher = nurFavoriten || mitFavoriten(z.lesen) ? this.termineFavSpeicher : this.termineSpeicher;
    const r = await speicher.hole(schluessel, async () => ({ wert: await this.sammleTermine(z, heute, von, bis, nurFavoriten), zeitabhaengig: true }), this.gueltigkeit());
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: r.art, ms: performance.now() - beginn };
    return { heute, von, bis, eintraege: r.wert, feiertage: feiertageZwischen(von, bis, land) };
  }

  /**
   * Startseite (#725): der nächste Termin ab heute (innerhalb eines Jahres) und die Zahl des Überfälligen.
   *
   * #918: erst die nächsten 31 Tage, nur ohne Termin darin das ganze Jahr. Das Ergebnis ist dasselbe: Jeder Termin der
   * 31 Tage ist auch einer des Jahres, alles danach ist später; Überfälliges kommt in jedem Zeitraum ganz mit, und bei
   * gleichem Datum ordnet `sammleTermine` eindeutig. Ein Jahr umfasst bei jährlichen Fristen jede Mappe, 31 Tage nur
   * die mit einem Termin in diesen Monaten.
   */
  async naechsterTermin(z: Zugriff): Promise<{ termin: Termin | null; ueberfaellig: number }> {
    const heute = heuteIn();
    const aus = (t: TermineAntwort) => ({ termin: t.eintraege.find((x) => x.datum >= heute) ?? null, ueberfaellig: t.eintraege.filter((x) => x.faellig && x.datum < heute).length });
    const nah = aus(await this.termine(z, { von: heute, bis: verschiebe(heute, NAECHSTER_TERMIN_ERST_TAGE) }));
    return nah.termin ? nah : aus(await this.termine(z, { von: heute, bis: verschiebe(heute, 365) }));
  }

  private async sammleTermine(z: Zugriff, heute: string, von: string, bis: string, nurFavoriten: boolean): Promise<Termin[]> {
    const ich = z.ich.id;
    const ohne = await this.siehtOhneEmpfaenger(z.ich);
    const ab = von > heute ? von : heute;
    const erg: Termin[] = [];
    // Schon fällig: eigene offene Aufgaben mit Datum. Überfälliges immer, sonst nur im Zeitraum.
    const offen = (await this.repo.offeneAufgaben({ benutzerId: ich, admin: ohne })).filter((a) => istDatum(a.datum) && a.datum <= bis && (a.datum < heute || a.datum >= von));
    const lesbar = await this.lesbare(z, offen.map((a) => a.mappeId));
    for (const a of offen) {
      if (!lesbar.has(a.mappeId)) continue;
      const art = a.art === 'frist' || a.art === 'erinnerung' ? a.art : 'aufgabe';
      erg.push({ art, datum: a.datum!, ab: a.erstellt.slice(0, 10), text: a.text, mappeId: a.mappeId, mappeTitel: a.mappeTitel ?? '', typId: a.typId ?? '', faellig: true, feldKey: a.feldKey ?? null });
    }
    // Frist-Felder an lesbaren Mappen (#725: „lesen darf“ statt „für mich“), mit künftigen Terminen
    // wiederkehrender Fristen (#528), gerechnet vom eingetragenen Datum.
    for (const typ of [...z.typen.values()].filter((x) => fristFelder(x).length)) {
      const felder = fristFelder(typ);
      const wiederkehrend = felder.filter((f) => f.frist!.wiederholung);
      const termine = (m: FristKandidat, f: Feld): Array<{ datum: string; folge: boolean }> => {
        const w = m.werte[f.key];
        if (!istDatum(w)) return [];
        const x = w >= ab && w <= bis ? [{ datum: w, folge: false }] : [];
        return wiederkehrend.includes(f) ? [...x, ...folgetermine(w, f.frist!.wiederholung!, ab, bis).map((d) => ({ datum: d, folge: true }))] : x;
      };
      // Nur Mappen, die im Zeitraum einen Termin haben können (#477, #918: Vorfilter fristtermine, auch für
      // wiederkehrende Fristen), und von ihnen nur Titel und Datumswerte. Entschieden wird hier, mit `termine`.
      const kandidaten = await this.repo.fristKandidaten(typ.id, felder.map((f) => ({ key: f.key, monate: f.frist!.wiederholung ?? null })), ab, bis);
      let passend = kandidaten.filter((m) => felder.some((f) => termine(m, f).length));
      if (nurFavoriten && passend.length) { const fav = await this.repo.favoritenVon(ich, passend.map((m) => m.id)); passend = passend.filter((m) => fav.has(m.id)); }
      if (!passend.length) continue;
      const ok = await this.lesbare(z, passend.map((m) => m.id));
      const schon = new Set(erg.filter((x) => x.faellig && x.feldKey).map((x) => `${x.mappeId}|${x.feldKey}|${x.datum}`));
      for (const m of passend) {
        if (!ok.has(m.id)) continue;
        for (const f of felder) {
          for (const t of termine(m, f)) {
            if (schon.has(`${m.id}|${f.key}|${t.datum}`)) continue;
            erg.push({ art: 'frist', datum: t.datum, ab: t.datum, text: fristText(f.frist!, f, t.datum, m.titel ?? ''), mappeId: m.id, mappeTitel: m.titel ?? '', typId: m.typId, faellig: false, feldKey: f.key, ...(t.folge ? { folgetermin: true } : {}) });
          }
        }
      }
    }
    // Eigene freie Erinnerungen.
    const erinnerungen = (await this.repo.erinnerungen({ empfaengerId: ich, bis })).filter((e) => e.datum >= von);
    const ok = await this.lesbare(z, erinnerungen.map((e) => e.mappeId));
    for (const e of erinnerungen) {
      if (!ok.has(e.mappeId)) continue;
      erg.push({ art: 'erinnerung', datum: e.datum, ab: e.datum, text: e.text, mappeId: e.mappeId, mappeTitel: e.mappeTitel ?? '', typId: e.typId ?? '', faellig: false, erinnerungId: e.id });
    }
    let liste = erg;
    if (nurFavoriten) { const fav = await this.repo.favoritenVon(ich, [...new Set(erg.map((x) => x.mappeId))]); liste = erg.filter((x) => fav.has(x.mappeId)); }
    // Eindeutige Reihenfolge (#918): bei gleichem Datum und Titel fällige Aufgaben, Fristen, Erinnerungen, dann nach
    // Mappe, Feld und Erinnerung – unabhängig davon, in welcher Reihenfolge die Datenbank liefert.
    const rang = (x: Termin) => (x.faellig ? 0 : x.art === 'frist' ? 1 : 2);
    const vgl = (a?: string | null, b?: string | null) => ((a ?? '') < (b ?? '') ? -1 : (a ?? '') > (b ?? '') ? 1 : 0);
    liste.sort((a, b) => a.datum.localeCompare(b.datum) || a.mappeTitel.localeCompare(b.mappeTitel, 'de') || rang(a) - rang(b)
      || vgl(a.mappeId, b.mappeId) || vgl(a.feldKey, b.feldKey) || vgl(a.erinnerungId, b.erinnerungId) || vgl(a.text, b.text) || vgl(a.ab, b.ab));
    return liste;
  }

  /** Wiederkehrende Frist (#130): Vorschlag für den nächsten Termin, solange das Datum noch das der Frist ist. */
  private async folgeterminVon(a: Aufgabe): Promise<string | null> {
    if (a.art !== 'frist' || !a.feldKey || !a.datum) return null;
    const m = await this.repo.holeMappe(a.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    const w = a.anlass?.art === 'datum' ? a.anlass.wiederholung : typ?.felder.find((f) => f.key === a.feldKey)?.frist?.wiederholung;
    return w && m && m.werte[a.feldKey] === a.datum ? naechsterTermin(a.datum, w) : null;
  }

  /** „Datum auf … setzen“ (#130): nie automatisch, nur auf Klick – mit Eintrag im Protokoll wie jede Änderung. */
  async setzeFolgetermin(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) {
    const a = await this.repo.holeAufgabe(aufgabeId);
    if (!a) throw new Fachfehler(404, t('meldungen.dienst.diese-aufgabe-gibt-es'));
    const naechster = await this.folgeterminVon(a);
    if (!naechster) throw new Fachfehler(409, t('meldungen.dienst.das-datum-hat-sich'));
    return this.aendereMappe(a.mappeId, { werte: { [a.feldKey!]: naechster } }, ich.id, z);
  }

  /* ---------- Notizen (#55) ---------- */

  private static notiztext(e: unknown): string { return MappenDienst.notiztext(e); }
  private static vorschau(t: string) { return MappenDienst.vorschau(t); }
  notizen(mappeId: string): Promise<Notiz[]> { return this.mappen.notizen(mappeId); }

  /* ---------- E-Mail aus der Mappe (#58) ---------- */

  versendeMappen(...a: Parameters<AusgangEmail['versendeMappen']>) { return this.ausgangEmail.versendeMappen(...a); }
  versendeMappe(...a: Parameters<AusgangEmail['versendeMappe']>) { return this.ausgangEmail.versendeMappe(...a); }

  async legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const text2 = Dienst.notiztext(text);
    const n = await this.repo.legeNotizAn({ id: randomUUID(), mappeId, text: text2, erstellt: '', erstelltVon: von, geaendert: '', geaendertVon: von });
    await this.notiere(mappeId, von, 'notiz', { text: t('meldungen.dienst.angelegt', { vorschau: Dienst.vorschau(text2) }), voll: text2 });
    // Typ von oben (#928) – eine Abfrage weniger.
    await this.ereignis('mappe.notiz', { mappe: mappeId, typ: m.typId, notiz: n.id }, von);
    await this.erwaehnungenAbgleichen(mappeId, { key: `notiz:${n.id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(text2) }, '', text2, von);
    return n;
  }

  /** Bearbeiten und Löschen darf jeder (Abstimmung zu #55); die Historie hält fest, wer es war. */
  async aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    const text2 = Dienst.notiztext(text);
    if (text2 === alt.text) return alt;
    const n = await this.repo.aendereNotiz(id, text2, von);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geaendert-2', { vorschau: Dienst.vorschau(text2) }), vorher: Dienst.vorschau(alt.text), alt: alt.text, neu: text2 });
    await this.erwaehnungenAbgleichen(alt.mappeId, { key: `notiz:${id}`, ort: 'in einer Notiz', auszug: Dienst.vorschau(text2) }, alt.text, text2, von);
    return n;
  }

  async loescheNotiz(id: string, von: string | null) {
    const alt = await this.repo.holeNotiz(id);
    if (!alt) throw new Fachfehler(404, t('meldungen.dienst.diese-notiz-gibt-es'));
    await this.repo.loescheNotiz(id);
    await this.uebersetzung.vergiss(alt.mappeId, `notiz:${id}`);
    await this.notiere(alt.mappeId, von, 'notiz', { text: t('meldungen.dienst.geloescht', { vorschau: Dienst.vorschau(alt.text) }), voll: alt.text });
  }

  /* ---------- Änderungshistorie (#57) ---------- */

  private notiere(mappeId: string, benutzerId: string | null, art: Historienart, daten?: Historieneintrag['daten']) { return this.mappenHistorie.notiere(mappeId, benutzerId, art, daten); }

  /* ---------- Favorit = Abo (#422) ---------- */

  persoenlicheEinstellungen(benutzerId: string): Promise<Record<string, unknown>> { return this.mappen.persoenlicheEinstellungen(benutzerId); }
  private persoenlichAn(benutzerId: string, schluessel: string): Promise<boolean> { return this.mappen.persoenlichAn(benutzerId, schluessel); }

  /* ---------- Favoriten benachrichtigen: Freigabe in der Werkbank (#506) ---------- */

  async favoritenFreigabe(): Promise<FavoritenFreigabe> {
    return liesFavoritenFreigabe(await this.einstellungen?.lies('favoriten_freigabe'));
  }

  /** Für alle, je Rolle (Systemrollen und fachliche Rollen) oder gar nicht; dazu die Vorgabe für neue Benutzer. */
  async setzeFavoritenFreigabe(eingabe: unknown, von: string) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const f = liesFavoritenFreigabe(eingabe);
    if (f.erlaubt === 'rollen') {
      const bekannt = new Set((await this.listeRollen()).map((r) => r.id));
      f.rollen = f.rollen.filter((r) => bekannt.has(r));
      if (!f.rollen.length) throw new Fachfehler(422, t('werkbank.fehler.freigabe.rollen'));
    }
    await this.einstellungen.schreibe('favoriten_freigabe', freigabeZumSpeichern(f));
    protokoll.modul('werkbank').info('Benachrichtigung für Favoriten eingestellt', { von, erlaubt: f.erlaubt, rollen: f.rollen.length, vorgabe: f.vorgabe });
    return this.favoritenFreigabe();
  }

  /* ---------- Aufgaben ohne Empfänger an einen Alltags-Benutzer (#719) ---------- */

  /**
   * Wer im Alltag die Aufgaben ohne Empfänger bekommt (Aufgaben ohne Empfänger, Post ohne „Für“, Fristen ohne
   * Zuständige) – zusätzlich zu den Administratoren. Nur aktive Menschen ohne Admin-Rechte; passt der gespeicherte
   * Benutzer nicht mehr (deaktiviert, Administrator geworden), gilt niemand, bis die Werkbank einen neuen wählt.
   * `gesetzt`: Die Einstellung wurde schon einmal gespeichert (auch „niemand“) – dann setzt Ablago keine Vorgabe mehr.
   */
  async alltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    // Einmal je Anfrage (#741): Zahlen, Termine und Eingang fragen es mehrfach; braucht die Liste aller Personen.
    if (this.kern.inEigenerTransaktion()) return this.bildeAlltagsEmpfaenger();
    return { ...await jeAnfrage(`${this.kennung}|alltag`, () => this.bildeAlltagsEmpfaenger()) };
  }

  private async bildeAlltagsEmpfaenger(): Promise<{ benutzerId: string | null; wirksam: string | null; gesetzt: boolean; gespeichert: string | null }> {
    const e = (await this.einstellungen?.lies('aufgaben_empfaenger')) as { benutzer?: unknown } | null;
    const gespeichert = typeof e?.benutzer === 'string' ? e.benutzer : null;
    if (!gespeichert) return { benutzerId: null, wirksam: null, gesetzt: !!e, gespeichert: null };
    const alle = (await this.konten?.benutzer?.()) ?? [];
    const b = alle.find((x) => x.id === gespeichert);
    // Abwesend oder deaktiviert: wie jede Aufgabe beim Vertreter (#78) – sofern er sie bekommen darf.
    const { ziel } = b ? await this.empfaengerAufloesen(b.id) : { ziel: null };
    const z = alle.find((x) => x.id === ziel);
    return { benutzerId: b && taugtAlsAufgabenEmpfaenger(b) ? b.id : null, wirksam: z && taugtAlsAufgabenEmpfaenger(z) ? z.id : null, gesetzt: true, gespeichert };
  }

  /** Werkbank → Benutzer und Sicherheit (#719): Alltags-Benutzer wählen oder `null` (nur im Verwaltungsmodus). */
  async setzeAufgabenEmpfaenger(eingabe: unknown, von: string | null) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const id = (eingabe as { benutzerId?: unknown } | null)?.benutzerId ?? null;
    if (id !== null) {
      const b = typeof id === 'string' ? (await this.konten?.benutzer?.())?.find((x) => x.id === id) : undefined;
      if (!b) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.unbekannt'));
      if (!taugtAlsAufgabenEmpfaenger(b)) throw new Fachfehler(422, t('werkbank.aufgabenempfaenger.fehler.inaktiv'));
    }
    await this.einstellungen.schreibe('aufgaben_empfaenger', { benutzer: id });
    await this.stand.erhoehe();
    protokoll.modul('werkbank').info('Empfänger für Aufgaben ohne Empfänger eingestellt', { von: await this.name(von), an: id ? await this.name(id as string) : 'nur im Verwaltungsmodus' });
    return this.alltagsEmpfaenger();
  }

  /** Sieht dieser Benutzer die Aufgaben ohne Empfänger (#719)? Im Verwaltungsmodus immer, sonst nur der gewählte Alltags-Benutzer. */
  async siehtOhneEmpfaenger(ich: { id: string; rolle: string }): Promise<boolean> {
    if (ich.rolle === 'admin') return true;
    return (await this.alltagsEmpfaenger()).wirksam === ich.id;
  }

  /** Erster Mensch (#719): Vorgabe, solange die Werkbank noch nichts gewählt hat. */
  private async vorgabeAufgabenEmpfaenger(b: Benutzer) {
    if (!this.einstellungen || !taugtAlsAufgabenEmpfaenger(b) || (await this.alltagsEmpfaenger()).gesetzt) return;
    const neu = { benutzer: b.id };
    if (this.einstellungen.tausche ? await this.einstellungen.tausche('aufgaben_empfaenger', null, neu) : (await this.einstellungen.schreibe('aufgaben_empfaenger', neu), true)) {
      await this.stand.erhoehe();
      protokoll.modul('werkbank').info('Aufgaben ohne Empfänger gehen an den ersten Benutzer', { an: b.name || b.email });
    }
  }

  /** Darf dieser Benutzer bei Änderungen an Favoriten benachrichtigt werden? Rollen aus seiner Benutzer-Mappe. */
  async favoritenBenachrichtigungErlaubt(benutzerId: string): Promise<boolean> {
    const f = await this.favoritenFreigabe();
    if (f.erlaubt !== 'rollen') return f.erlaubt === 'alle';
    return favoritenErlaubt(f, alsListe((await this.repo.holeMappe(benutzerId))?.werte.rollen));
  }

  /** „Auf alle anwenden“: die Vorgabe für neue Benutzer bei allen bestehenden setzen; Anzahl. */
  async favoritenVorgabeAnwenden(von: string): Promise<number> {
    if (!this.konten?.benutzer || !this.konten.setzeEinstellung) throw new Fachfehler(404, t('meldungen.dienst.benutzerkonten-sind-nicht'));
    const { vorgabe } = await this.favoritenFreigabe();
    let n = 0;
    for (const b of await this.konten.benutzer()) {
      if (b.art === 'dienst') continue;
      await this.konten.setzeEinstellung(b.id, 'favoriten_benachrichtigen', vorgabe ? null : false);
      n++;
    }
    protokoll.modul('werkbank').info('Vorgabe für Favoriten auf alle Benutzer angewandt', { von, vorgabe, benutzer: n });
    return n;
  }

  /**
   * Hat jemand eine Mappe geändert, die andere als Favorit haben, bekommen die – sofern sie es nicht abgeschaltet
   * haben und die Mappe lesen dürfen – **eine** Aufgabe „Geändert“. Solange sie offen ist, zählt sie nur hoch
   * („3 Änderungen von Anna und Paul seit 01.11.“); erst nach dem Öffnen der Mappe oder „Erledigt“ kommt wieder eine.
   * Eigene Änderungen benachrichtigen nie.
   */
  async favoritenMelden(mappeId: string, von: string): Promise<number> {
    const fav = (await this.repo.favoritenDerMappe(mappeId)).filter((f) => f.benachrichtigen && f.benutzerId !== von);
    if (!fav.length) return 0;
    let n = 0;
    const aktiv = this.konten?.benutzer ? new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)) : null;
    for (const { benutzerId } of fav) {
      if (aktiv && !aktiv.has(benutzerId)) continue;
      if (!(await this.persoenlichAn(benutzerId, 'favoriten_benachrichtigen'))) continue;
      if (!(await this.kannLesen(benutzerId, mappeId))) continue;
      n++;
      await this.benachrichtigeGebuendelt({
        empfaengerId: benutzerId, mappeId, art: 'aenderung', schluessel: 'aenderung', von,
        text: async (bisher) => {
          const seit = bisher?.erstellt ?? '';
          const h = (await this.repo.historie(mappeId)).filter((x) => x.zeit > seit && x.benutzerId && x.benutzerId !== benutzerId
            && (ABO_ARTEN as readonly string[]).includes(x.art) && x.daten?.aufgabenart !== 'aenderung');
          // Die erste Änderung steht vor der Aufgabe in der Historie; ihr Urheber ist erstelltVon der Aufgabe.
          const n = bisher ? 1 + h.length : 1;
          const namen = [...new Set(bisher ? [bisher.erstelltVon ?? von, ...h.map((x) => x.benutzerId!)] : [von])];
          const liste = await Promise.all(namen.slice(0, 3).map((id) => this.name(id)));
          const wer = namen.length > 3 ? t('meldungen.dienst.und-weiteren', { liste: liste.join(', ') }) : liste.length > 1 ? `${liste.slice(0, -1).join(', ')} und ${liste.at(-1)}` : liste[0];
          const tag = new Date(bisher?.erstellt || Date.now()).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', timeZone: zeitzone() });
          return t('meldungen.dienst.aenderungen-von-seit', { anzahl: n, wer, tag });
        },
      });
    }
    return n;
  }

  gesehen(ich: { id: string }, mappeIds: unknown, aufgaben?: Aufgabe[]) { return this.mappen.gesehen(ich, mappeIds, aufgaben); }
  setzeFavoritBenachrichtigen(ich: { id: string }, mappeId: string, an: unknown) { return this.mappen.setzeFavoritBenachrichtigen(ich, mappeId, an); }
  private aenderungen(typ: Mappentyp, alt: Werte, neu: Werte): Promise<Feldaenderung[]> { return this.mappenHistorie.aenderungen(typ, alt, neu); }
  historie(mappeId: string, o: { register?: unknown; max?: unknown; vor?: unknown } = {}): Promise<Historieneintrag[]> { return this.mappenHistorie.historie(mappeId, o); }
  notiereAbruf(x: { dokumentId: string; benutzerId: string | null; weg: Abrufweg; fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; schluessel?: string | null; datei?: string }): Promise<boolean> { return this.mappenHistorie.notiereAbruf(x); }
  historieTage(): Promise<number> { return this.mappenHistorie.historieTage(); }
  setzeHistorieTage(eingabe: unknown): Promise<number> { return this.mappenHistorie.setzeHistorieTage(eingabe); }

  listeTypen() { return this.mappentypen.listeTypen(); }

  typenFuer(z: Zugriff) { return this.mappentypen.typenFuer(z); }

  /**
   * „Wohin gehört das?“ (#937): Mappentypen, die man aus Post anlegen kann – mit dem Haken „Kann aus Post angelegt
   * werden“ (Vorgabe: mit Dokumentenregister), nie Systemtypen, und nur solche, in denen die Person anlegen darf.
   * Grundlage für die Seite „Dokument übernehmen“ (#934) und die Klassifizierung (#939).
   */
  async ausPostZiele(z?: Zugriff): Promise<Mappentyp[]> {
    const typen = z ? [...z.typen.values()] : await this.repo.listeTypen();
    return typen.filter((x) => kannAusPost(x) && (!z || z.admin || (z.paket ? z.paket.schreiben.has(x.id) : rechteUebersicht(x, z.wer, z.a).C !== 'nie')))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  rechteUebersicht(z: Zugriff) { return this.mappentypen.rechteUebersicht(z); }
  legeTypAn(eingabe: unknown): Promise<Mappentyp> { return this.mappentypen.legeTypAn(eingabe); }
  aendereTyp(id: string, eingabe: unknown): Promise<Mappentyp> { return this.mappentypen.aendereTyp(id, eingabe); }
  ausDokumentVon(typId: string): Promise<AusDokument | null> { return this.mappentypen.ausDokumentVon(typId); }
  loescheTyp(id: string): Promise<void> { return this.mappentypen.loescheTyp(id); }

  listeMappen(typId?: string) { return this.mappen.listeMappen(typId); }
  mappenKurz() { return this.mappen.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.mappen.feldwerte(typId, key); }
  verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) { return this.mappen.verweisende(id, typId, feldKey, z); }
  holeMappe(id: string, z?: Zugriff) { return this.mappen.holeMappe(id, z); }

  /* ---------- Sichten: seitenweise und gezählt (sichten/sichten.dienst.ts) ---------- */

  seite(...a: Parameters<SichtenDienst['seite']>) { return this.sichten.seite(...a); }
  zaehler(ich: { id: string; rolle: string }, zg?: Zugriff) { return this.sichten.zaehler(ich, zg); }
  zaehlerRahmen() { return this.sichten.zaehlerRahmen(); }
  zaehlerAbruf(z: Zugriff) { return this.sichten.zaehlerAbruf(z); }
  ablageStand(ich: { rolle: string }): Promise<string> { return this.sichten.ablageStand(ich); }
  beiAenderung(f: () => void) { this.sichten.beiAenderung(f); }

  /* ---------- Favoriten (#62) ---------- */

  setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) { return this.mappen.setzeFavorit(ich, mappeId, an); }
  istFavorit(ich: { id: string }, mappeId: string) { return this.mappen.istFavorit(ich, mappeId); }

  /* ---------- Berechtigungen (#123–#127) ---------- */

  /* ---------- Rechte prüfen (#1072: in zugriff/zugriff.dienst.ts) ---------- */

  /** Unterscheidet zwei Dienste in derselben Anfrage (Tests mit zwei „Prozessen“). */
  private readonly kennung = randomUUID();
  zugriff(ich: Zugreifender): Promise<Zugriff> { return this.rechtepruefung.zugriff(ich); }
  private bildeZugriff(ich: Zugreifender, o: { ohneAufZeit?: boolean } = {}): Promise<Zugriff> { return this.rechtepruefung.bildeZugriff(ich, o); }
  private typverweise(...a: Parameters<ZugriffDienst['typverweise']>) { return this.rechtepruefung.typverweise(...a); }
  rechteAn(z: Zugriff, m: Mappe, neu = false, aufgaben?: Aufgabe[]): Promise<Rechte> { return this.rechtepruefung.rechteAn(z, m, neu, aufgaben); }
  rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> { return this.rechtepruefung.rechteAnVielen(z, ms); }
  private mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> { return this.rechtepruefung.mappenquelle(benutzerId, mappeIds); }
  pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> { return this.rechtepruefung.pruefeRecht(z, id, recht); }
  lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.lesbare(z, ids); }
  private maskiereBezuege(z: Zugriff | undefined, b: Map<string, MappenBezug>): Promise<Record<string, MappenBezug>> { return this.rechtepruefung.maskiereBezuege(z, b); }
  sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.sichtbarFuer(benutzerId, ids); }
  wasSieht(benutzerId: unknown) { return this.rechtepruefung.wasSieht(benutzerId); }
  mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> { return this.rechtepruefung.mappeVon(art, id); }
  mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> { return this.rechtepruefung.mitPasswortRecht(z, mappen); }
  kannLesen(benutzerId: string, mappeId: string): Promise<boolean> { return this.rechtepruefung.kannLesen(benutzerId, mappeId); }
  private aufloesung(benutzerId: string): Promise<Aufloesung> { return this.rechtepruefung.aufloesung(benutzerId); }

  /* ---------- Pakete am Mappentyp (#686) ---------- */

  private paketSiehtNicht(p: InstalliertesPaket, typId: string, mappeId: string | null): Promise<string | null> { return this.typpakete.paketSiehtNicht(p, typId, mappeId); }

  /**
   * Ein Ereignis ging wegen der KI-Sperre nicht an das Paket (#796): Wartet das Dokument auf die Texterkennung dieses
   * Pakets (`volltext.fertig`), wartet es nicht weiter. Aufträge (`datei.*`) behandelt der Aufrufer von `auftrag`.
   */
  private async kiUebersprungen(paket: string, art: string, daten: Record<string, unknown>) {
    const grund = t('meldungen.dienst.ki-nicht-zugelassen');
    try {
      if (art === 'volltext.fertig') await this.nachTexterkennungsEreignis(paket, { art, daten }, { ok: true, text: grund });
    } catch (x) {
      protokoll.modul('werkbank').warn('Stand nach KI-Sperre nicht nachgetragen', { paket, art, fehler: (x as Error).message });
    }
  }

  /** Je Mappentyp-Id die Pakete, denen der Admin diesen Typ verwehrt hat (Kern). */
  paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }

  /* ---------- KI-Dienste und Mappentypen (#796) ---------- */

  /**
   * Mappentypen, die für KI-Dienste zugelassen sind (Einstellung `ki_typen`, Teil der Sicherung). Was nicht darin steht –
   * auch jeder neue Mappentyp –, geht an kein KI-Paket. Fehlt die Einstellung (frische Installation), ist nichts
   * zugelassen. `hinweis`: nach dem Update einmal in der Werkbank sagen, dass man jetzt ausschließen kann.
   */
  async kiTypen(): Promise<{ zugelassen: Set<string>; hinweis: boolean }> {
    const v = await this.einstellungen?.lies('ki_typen') as { zugelassen?: unknown; hinweis?: unknown } | null | undefined;
    const liste = v && typeof v === 'object' && Array.isArray(v.zugelassen) ? v.zugelassen.map(String) : [];
    return { zugelassen: new Set(liste), hinweis: !!v && v.hinweis === true };
  }

  private async schreibeKiTypen(k: { zugelassen: Set<string>; hinweis: boolean }) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    await this.einstellungen.schreibe('ki_typen', { zugelassen: [...k.zugelassen].sort(), ...(k.hinweis ? { hinweis: true } : {}) });
  }

  /**
   * Für ein Paket: Ist dieser Mappentyp für es gesperrt, weil es ein KI-Paket ist und der Typ nicht zugelassen ist?
   * Für Pakete ohne Netz (oder ohne Zugriff auf Inhalte) immer nein. Je Aufruf neu gelesen – Änderungen wirken sofort.
   */
  async kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean> {
    if (!p || !istKiPaket(p.laeufer)) return () => false;
    const { zugelassen } = await this.kiTypen();
    return (typId) => !zugelassen.has(typId);
  }

  /** Wie `kiSperre`, für ein Paket nach Id (Erkennen, Antworten, Übersetzen). Unbekanntes Paket: nichts gesperrt. */
  async kiSperreFuer(paketId: string): Promise<(typId: string) => boolean> {
    return this.kiSperre((await this.repo.listePakete()).find((x) => x.id === paketId));
  }

  /**
   * Für die Werkbank: alle Mappentypen (außer Benutzer) mit „zugelassen“, die KI-Pakete und welche Mappentypen jedes
   * bekommt – bei Paketen mit Leserecht die lesbaren (bestätigte Rechte, nicht verwehrt) und zugelassenen, bei
   * Paketen, die Ausschnitte vom Kern bekommen (Antworten, Erkennen, Übersetzen), alle zugelassenen.
   */
  async kiUebersicht(): Promise<KiUebersicht> {
    const [typen, pakete, verwehrt, k] = [await this.repo.listeTypen(), await this.repo.listePakete(), await this.paketVerwehrt(), await this.kiTypen()];
    const liste = typen.filter((x) => x.system !== 'benutzer').sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const ki: KiUebersicht['pakete'] = [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || !istKiPaket(l)) continue;
      const lesbar = await this.typverweise(p.id, pakete, typen);
      // Ausschnitte bzw. Text vom Kern (auch „Wohin gehört das?“, #939) oder Ereignisse zu Dokumenten und Post (#796): kommen aus allen zugelassenen Typen, auch ohne Leserecht.
      const ueberKern = (l.rechte.schnittstellen ?? []).some((s) => s === 'dms:antworten' || s === 'dms:erkennen' || s === 'dms:klassifizieren' || s === 'dms:uebersetzen')
        || l.ereignisse.some((e) => INHALT_EREIGNISSE.includes(e) && !MAPPEN_EREIGNISSE.includes(e));
      const darf = lesbar(l.rechte.lesen);
      const bekommt = liste.filter((x) => k.zugelassen.has(x.id) && (ueberKern || (darf.has(x.id) && !verwehrt[x.id]?.includes(p.id)))).map((x) => x.id);
      ki.push({ id: p.id, name: p.name, bekommt });
    }
    return {
      typen: liste.map((x) => ({ id: x.id, name: x.name, zugelassen: k.zugelassen.has(x.id), ...(x.system ? { system: x.system } : {}) })),
      pakete: ki.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      hinweis: k.hinweis && ki.length > 0,
    };
  }

  /** Einen Mappentyp für KI-Dienste zulassen bzw. sperren; wirkt sofort (Lesen, Ereignisse, Antworten, Erkennen, Übersetzen). */
  async setzeKiTyp(typId: string, zugelassen: boolean, von: string | null): Promise<KiUebersicht> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    if (typ.system === 'benutzer') throw new Fachfehler(422, t('meldungen.dienst.ki-benutzer'));
    const k = await this.kiTypen();
    if (zugelassen) k.zugelassen.add(typId); else k.zugelassen.delete(typId);
    await this.schreibeKiTypen(k);
    protokoll.modul('werkbank').info(zugelassen ? 'Mappentyp für KI-Dienste zugelassen' : 'Mappentyp für KI-Dienste gesperrt', { typ: typ.name, von });
    return this.kiUebersicht();
  }

  /** Den Hinweis nach dem Update („Mappentypen lassen sich jetzt ausschließen“) nicht mehr zeigen. */
  async kiHinweisGelesen(): Promise<KiUebersicht> {
    const k = await this.kiTypen();
    if (k.hinweis) await this.schreibeKiTypen({ ...k, hinweis: false });
    return this.kiUebersicht();
  }

  paketeAmTyp(typId: string) { return this.typpakete.paketeAmTyp(typId); }
  setzePaketVerwehrt(typId: string, paketId: string, verwehrt: boolean, von: string | null): Promise<void> { return this.typpakete.setzePaketVerwehrt(typId, paketId, verwehrt, von); }

  /* ---------- Berechtigungen in der Werkbank (#123, #125, berechtigungen/berechtigungen.dienst.ts) ---------- */

  berechtigungenListe() { return this.berechtigungen.berechtigungenListe(); }
  niemandLesbar(typ: Mappentyp, rw: Regelwerk): Promise<number> { return this.berechtigungen.niemandLesbar(typ, rw); }

  setzeBerechtigungen(typId: string, eingabe: unknown, bestaetigt: boolean): Promise<{ typ: Mappentyp; niemand: number }> { return this.berechtigungen.setzeBerechtigungen(typId, eingabe, bestaetigt); }

  private static protokolliereBerechtigungen(typ: Mappentyp, niemand: number) { BerechtigungenDienst.protokolliereBerechtigungen(typ, niemand); }

  private berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown): Promise<{ rw: Regelwerk; niemand: number } | null> { return this.berechtigungen.berechtigungenAusEingabe(typ, eingabe); }

  kopiereRegel(typId: string, regelId: string, ziele: unknown): Promise<{ kopiert: number; ausgelassen: number }> { return this.berechtigungen.kopiereRegel(typId, regelId, ziele); }

  testlauf(e: { mappeId?: unknown; benutzerId?: unknown; berechtigungen?: unknown }) { return this.berechtigungen.testlauf(e); }
  laufwerkMappe(id: string, z: Zugriff) { return this.berechtigungen.laufwerkMappe(id, z); }

  /* ---------- Sichten verwalten (#38, sichten/verwalten.ts) ---------- */

  listeSichten(z?: Zugriff): Promise<Sicht[]> { return this.sichtenVerwaltung.listeSichten(z); }
  verborgeneSichten(alle: Sicht[], z?: Zugriff): Set<string> { return this.sichtenVerwaltung.verborgeneSichten(alle, z); }
  sichtTestlauf(e: unknown): Promise<unknown> { return this.sichtenVerwaltung.sichtTestlauf(e); }
  legeSichtAn(e: unknown): Promise<Sicht> { return this.sichtenVerwaltung.legeSichtAn(e); }
  aendereSicht(id: string, e: unknown): Promise<Sicht> { return this.sichtenVerwaltung.aendereSicht(id, e); }
  private static konfigurationKonflikt(art: 'typ' | 'sicht', aktuell?: string): Fachfehler { return SichtenVerwaltung.konfigurationKonflikt(art, aktuell); }
  loescheSicht(id: string): Promise<void> { return this.sichtenVerwaltung.loescheSicht(id); }
  ordneSichten(elternId: unknown, ids: unknown): Promise<Sicht[]> { return this.sichtenVerwaltung.ordneSichten(elternId, ids); }
  verschiebeSicht(id: string, elternId: unknown, stelle: unknown): Promise<Sicht[]> { return this.sichtenVerwaltung.verschiebeSicht(id, elternId, stelle); }

  sichtVorschau(ich: { id: string }, id: unknown, e: unknown): Promise<{ anzahl: number }> { return this.sichtenVerwaltung.sichtVorschau(ich, id, e); }

  private sichtFuerTyp(t: Mappentyp) { return this.sichtenVerwaltung.sichtFuerTyp(t); }
  belegung(typId: string) { return this.sichtenVerwaltung.belegung(typId); }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */

  pruefePassung(typId: string): Promise<number> { return this.passung.pruefePassung(typId); }
  private pruefeUnpassende(typ: Mappentyp) { return this.passung.pruefeUnpassende(typ); }
  private passungFuer(typ: Mappentyp, ids: string[]) { return this.passung.passungFuer(typ, ids); }
  passungNachziehen(fortschritt?: (fertig: number, gesamt: number) => void): Promise<number> { return this.passung.passungNachziehen(fortschritt); }


  /* ---------- Titel ---------- */

  aktualisiereTitel(ids: string[]): Promise<Map<string, string>> { return this.mappenTitel.aktualisiereTitel(ids); }
  hakenUeberfuehren(): Promise<number> { return this.mappenTitel.hakenUeberfuehren(); }
  typSchluesselNachziehen(): Promise<number> { return this.mappenTitel.typSchluesselNachziehen(); }

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
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    if ('installation' in body) {
      const a = liesAnsicht(body.installation);
      if (!a) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-vorlage-waehlen'));
      await this.einstellungen.schreibe('werkbank_ansicht', a);
      protokoll.modul('werkbank').info('Werkbank angepasst', { vorlage: a.vorlage, ein: a.ein, aus: a.aus, von: wer.email });
    }
    if ('eigene' in body) {
      const e = liesEigene(body.eigene);
      await this.einstellungen.schreibe(`werkbank_ansicht:${wer.id ?? wer.email}`, e.ein.length || e.experte ? e : null);
    }
    return this.werkbankAnsicht(wer);
  }

  /* ---------- Pakete (#188): die Logik steckt in pakete.ts; die Ablage ruft das Repo des Kerns bzw. pakete/pakete.einstellungen.ts (#961) ---------- */

  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt (Kern). */
  get paketKonten(): Map<string, string> { return this.kern.paketKonten; }
  set paketKonten(m: Map<string, string>) { this.kern.paketKonten = m; }

  /* ---------- Ereigniskatalog (#670) ---------- */

  /** Verteiler des Katalogs; Abnehmer (Pakete hier, Automatisierungen #674, Webhooks #671) melden sich mit `abonniere` an. */
  readonly ereignisse = new Ereignisverteiler({ repo: () => this.kern.repoOhneTransaktion, ruht: () => this.ereignisseRuhen?.() ?? false });
  /** Wartung, Wiederherstellung (vom Start gesetzt): dann verteilt der Katalog nichts. */
  ereignisseRuhen?: () => boolean | Promise<boolean>;
  /** Startseite „Zuletzt geöffnet“ (#940): Anlegen und Ändern durch eine Person (vom Start gesetzt, Kern). */
  get beiEigenerAenderung() { return this.kern.beiEigenerAenderung; }
  set beiEigenerAenderung(f: ((benutzerId: string, mappeId: string) => Promise<void>) | undefined) { this.kern.beiEigenerAenderung = f; }

  /** `f` im Namen eines bestimmten Auslösers ausführen (#674); ohne Ereignisse (Import, Beispiele) – Kern. */
  mitAusloeser<T>(a: EreignisAusloeser, f: () => Promise<T>): Promise<T> { return this.kern.mitAusloeser(a, f); }
  ohneEreignisse<T>(f: () => Promise<T>): Promise<T> { return this.kern.ohneEreignisse(f); }

  /** Ein Ereignis des Katalogs (#670) in den Ausgangskorb (Kern). */
  ereignis(art: KatalogArt, daten: Record<string, unknown>, von?: string | null): Promise<void> { return this.kern.ereignis(art, daten, von); }

  /** Aufgabe anlegen und als „etwas ist zu erledigen“ melden (#670). */
  private async neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe> {
    const x = await this.repo.legeAufgabeAn(a);
    await this.ereignis('aufgabe.neu', { aufgabe: x.id, mappe: x.mappeId, typ: typ ?? await this.typVon(x.mappeId), empfaenger: x.empfaengerId ?? null, aufgabenart: x.art }, a.erstelltVon ?? null);
    return x;
  }

  /** Typ einer Mappe für ein Ereignis (null, wenn es sie nicht mehr gibt). */
  private typVon(mappeId: string): Promise<string | null> { return this.kern.typVon(mappeId); }

  /** Neue Verweise auf andere Mappen (#670: „zu dieser Mappe hin verknüpft“) – je neu verknüpfter Mappe ein Ereignis. */
  private async meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) {
    const vorher = new Set(verweiseVon(typ, alt).map((v) => `${v.feldKey}|${v.zielId}`));
    const ziele = verweiseVon(typ, neu).filter((v) => !vorher.has(`${v.feldKey}|${v.zielId}`) && v.zielId !== mappeId);
    if (!ziele.length) return;
    const typen = await this.repo.typenVon([...new Set(ziele.map((v) => v.zielId))]);
    for (const v of ziele) await this.ereignis('mappe.verknuepft', { mappe: v.zielId, typ: typen.get(v.zielId) ?? null, von: mappeId, vonTyp: typ.id, feld: v.feldKey }, von);
  }

  /**
   * Abnehmer „pakete“ (#670, #724): jedes Ereignis des Katalogs an die Pakete, die es abonniert haben – derselbe
   * Ausgangskorb wie für Automatisierungen und Webhooks, die Zustellung samt Wiederholung macht der Paket-Läufer.
   * - Ein Paket bekommt seine eigenen Änderungen nicht gemeldet (sonst Schleifen).
   * - Mappen-Ereignisse nur zu Typen unter `code.mappentypen` (eigene, fremde, „*“) und nur, wenn der Paket-Benutzer
   *   die Mappe gerade lesen darf (#686; sonst still nicht, Grund im Protokoll); Ereignisse aus Demo-Daten und Beispielen nur, wenn
   *   sie Dateien betreffen (Texterkennung, Vektoren), nie Mappen-Ereignisse.
   * - `volltext.fertig` ohne Text nur an Pakete, die das kennen; `sicherung.fertig` nur mit `dms:sicherung-lesen`.
   * - Veraltete Namen (Übergang): wer `texterkennung.fertig` abonniert hat, bekommt den Volltext der eingebauten
   *   Texterkennung unter diesem Namen.
   * Die Id je Paket ist fest (aus Ereignis, Paket und Name) – kommt das Ereignis noch einmal, entsteht nichts doppelt.
   */
  private async ereignisAnPakete(e: KatalogEreignis) {
    const k = EREIGNISKATALOG[e.art] as Katalogeintrag;
    if (!k.paket || k.gruppe === 'auftrag') return;
    if (e.ausloeser.still && k.mappentyp) return;
    const alt = Object.entries(VERALTETE_EREIGNISSE).filter(([, neu]) => neu === e.art).map(([name]) => name as EreignisArt);
    const zustellungen: Array<{ paket: InstalliertesPaket; art: EreignisArt }> = [];
    const pakete = await this.kern.repoOhneTransaktion.listePakete();
    const typen = k.mappentyp ? await this.kern.repoOhneTransaktion.listeTypen() : [];
    for (const p of pakete) {
      const l = p.laeufer;
      if (!l || (e.ausloeser.art === 'paket' && e.ausloeser.id === p.id)) continue;
      if (e.art === 'sicherung.fertig' && !hatSchnittstelle(l, 'dms:sicherung-lesen')) continue;
      if (k.mappentyp) {
        const abonniert = l.ereignisse.includes(e.art as EreignisArt);
        if (!abonniert || typeof e.daten.typ !== 'string' || !(await this.typverweise(p.id, pakete, typen))(l.mappentypen ?? []).has(e.daten.typ)) continue;
        // #686: nur, was der Paket-Benutzer gerade lesen darf (bestätigte Rechte, „Pakete“ am Mappentyp, Regeln für die Rolle „Paket“).
        const grund = await this.paketSiehtNicht(p, e.daten.typ, typeof e.daten.mappe === 'string' ? e.daten.mappe : null);
        if (grund) { protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe: e.daten.mappe ?? null, grund }); continue; }
      }
      // KI-Dienste (#796): Ereignisse zu Dokumenten und Mappen eines nicht zugelassenen Mappentyps bekommt ein KI-Paket
      // nicht – auch nicht Dateiname oder Ids. Lässt sich der Typ nicht bestimmen, gilt er als gesperrt (nie falsch).
      if (!k.mappentyp && istKiPaket(l) && (l.ereignisse.includes(e.art as EreignisArt) || alt.some((a) => l.ereignisse.includes(a)))) {
        const mappe = typeof e.daten.mappe === 'string' ? e.daten.mappe : null;
        const typ = typeof e.daten.typ === 'string' ? e.daten.typ : mappe ? (await this.kern.repoOhneTransaktion.holeMappe(mappe))?.typId ?? null : null;
        if ((typ && (await this.kiSperre(p))(typ)) || (!typ && (mappe || typeof e.daten.dokument === 'string'))) {
          protokoll.modul('werkbank').info('Ereignis nicht an Paket zugestellt', { paket: p.id, ereignis: e.art, mappe, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          await this.kiUebersprungen(p.id, e.art, e.daten);
          continue;
        }
      }
      const ohneText = e.art === 'volltext.fertig' && e.daten.text === false && !kenntVolltextOhneText(p);
      if (l.ereignisse.includes(e.art as EreignisArt) && !ohneText) zustellungen.push({ paket: p, art: e.art as EreignisArt });
      for (const a of alt) if (l.ereignisse.includes(a) && e.daten.quelle === 'kern') zustellungen.push({ paket: p, art: a });
    }
    if (!zustellungen.length) return;
    const daten: Record<string, unknown> = { ...e.daten, ereignis: e.id };
    // Name der Datei nur für Pakete (nicht im Ausgangskorb, der nur Ids kennt).
    if (e.art === 'dokument.hochgeladen' && typeof e.daten.dokument === 'string') daten.name = (await this.kern.repoOhneTransaktion.holeDokument(e.daten.dokument))?.name ?? null;
    const fuer = (art: EreignisArt): Record<string, unknown> => (art === 'texterkennung.fertig' ? { ...daten, seiten: daten.seiten ?? null } : daten);
    const feste = (paket: string, art: string) => { const h = createHash('sha256').update(`${e.id}|${paket}${art === e.art ? '' : `|${art}`}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
    await this.kern.repoOhneTransaktion.legeEreignisseAn(zustellungen.map((z) => ({ id: feste(z.paket.id, z.art), paketId: z.paket.id, art: z.art, daten: fuer(z.art) })));
    this.ereignisWecker?.();
  }

  /**
   * Auftrag an genau ein Paket (#577, #614, #631, #338): Der Kern bittet ein bestimmtes Paket um etwas (Datei umwandeln,
   * Volltext, Archivfassung) bzw. sagt ihm, dass seine Einstellungen geändert sind. Kein Geschehen für andere – daher
   * nicht im Ausgangskorb, sondern direkt in der Zustellung des Paket-Läufers (gleiche Wiederholung). In einer
   * Transaktion gehört er zur Änderung; sonst landen Fehler nur im Protokoll.
   */
  async auftrag(paket: string, art: Extract<EreignisArt, 'datei.umwandeln' | 'datei.volltext' | 'datei.archivfassung' | 'paket.einstellungen_geaendert'>, daten: Record<string, unknown>): Promise<'gesperrt' | void> {
    const inTx = this.kern.inEigenerTransaktion();
    try {
      const p = (await this.repo.listePakete()).find((x) => x.id === paket && x.laeufer?.ereignisse.includes(art));
      if (!p) return;
      // KI-Dienste (#796): Dateien eines nicht zugelassenen Mappentyps gehen an kein KI-Paket. „gesperrt“: Der Aufrufer
      // setzt den Stand selbst (bzw. stellt den Auftrag über ein anderes Dokument mit derselben Datei).
      if (istKiPaket(p.laeufer) && (typeof daten.mappe === 'string' || typeof daten.dokument === 'string')) {
        const typ = typeof daten.mappe === 'string' ? (await this.repo.holeMappe(daten.mappe))?.typId ?? null : null;
        if (!typ || (await this.kiSperre(p))(typ)) {
          protokoll.modul('werkbank').info('Auftrag nicht an Paket gegeben', { paket: p.id, art, grund: t('meldungen.dienst.ki-nicht-zugelassen') });
          return 'gesperrt';
        }
      }
      await this.repo.legeEreignisseAn([{ id: randomUUID(), paketId: p.id, art, daten }]);
      this.danach(() => this.ereignisWecker?.());
    } catch (e) {
      if (inTx) throw e;
      protokoll.modul('werkbank').error('Auftrag an Paket nicht gespeichert', { art, paket, fehler: (e as Error).message });
    }
  }

  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }

  belegteTypen(ids: string[], ohne: string[] = []): Promise<string[]> { return this.mappentypen.belegteTypen(ids, ohne); }

  /** Nur für das Zurückrollen einer fehlgeschlagenen Paketinstallation: Mappen ohne Papierkorb entfernen (mit Dateien, #878). */
  async entferneMappenEndgueltig(ids: string[]) {
    const vorher = await this.lebendInhalt(await this.repo.holeMappen(ids));
    const dateien = new Set((await Promise.all(ids.map((id) => this.repo.listeDokumente(id)))).flat().map((d) => d.sha256));
    for (const id of await this.loeschReihenfolge(ids)) await this.repo.loescheMappe(id);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'zurueckgerollt' }), await this.loeschKontext(null, { ausloeser: 'automatisch' }));
    for (const sha of dateien) await this.raeumeAuf(sha);
  }

  /**
   * Reihenfolge zum endgültigen Löschen mehrerer Mappen (#878): Mappen, auf die andere aus der Liste verweisen, zuletzt –
   * sonst scheitert das Löschen am Fremdschlüssel der Verweise. Bei einem Kreis bleibt der Rest in der alten Reihenfolge.
   */
  private async loeschReihenfolge(ids: string[]): Promise<string[]> {
    const offen = new Set(ids);
    const quellen = new Map<string, string[]>();
    for (const id of ids) quellen.set(id, (await this.repo.rueckverweise(id)).map((r) => r.quelleId).filter((q) => q !== id && offen.has(q)));
    const erg: string[] = [];
    while (offen.size) {
      const frei = [...offen].filter((id) => !quellen.get(id)!.some((q) => offen.has(q)));
      for (const id of frei.length ? frei : [...offen]) { offen.delete(id); erg.push(id); }
    }
    return erg;
  }

  /* ---------- Beispiel-Mappen aus Paketen (#878) ---------- */

  /** Stand von Beispiel-Mappen direkt nach dem Anlegen: Prüfwert der Feldwerte und Dokumente (Id und Inhalt). */
  async beispielStand(ids: string[]): Promise<BeispielStand[]> {
    const mappen = await this.repo.holeMappen(ids);
    return Promise.all(mappen.map(async (m) => ({ id: m.id, werte: pruefwertVon(m.werte), dokumente: (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort() })));
  }

  /**
   * Welche Beispiel-Mappen sind noch unverändert (#878)? Unverändert heißt: gleiche Feldwerte, dieselben Dokumente, keine
   * Notizen und kein Verweis aus einer Mappe, die kein Beispiel dieser Liste ist. Gelöschte (auch im Papierkorb) fehlen.
   */
  async pruefeBeispiele(staende: BeispielStand[]): Promise<{ unveraendert: string[]; geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> }> {
    const mappen = new Map((await this.repo.holeMappen(staende.map((s) => s.id))).map((m) => [m.id, m] as const));
    const alle = new Set(mappen.keys());
    const unveraendert: string[] = [];
    const geaendert: Array<{ id: string; typId: string; titel: string; grund: 'geaendert' | 'verwiesen' }> = [];
    for (const s of staende) {
      const m = mappen.get(s.id);
      if (!m) continue;
      const dok = (await this.repo.listeDokumente(m.id)).map((d) => `${d.id}:${d.sha256}`).sort();
      const gleich = pruefwertVon(m.werte) === s.werte && dok.join('|') === [...s.dokumente].sort().join('|') && !(await this.repo.notizen(m.id)).length;
      const fremd = gleich && (await this.repo.rueckverweise(m.id)).some((r) => !alle.has(r.quelleId));
      if (gleich && !fremd) unveraendert.push(m.id);
      else geaendert.push({ id: m.id, typId: m.typId, titel: m.titel || m.id, grund: gleich ? 'verwiesen' : 'geaendert' });
    }
    return { unveraendert, geaendert };
  }

  /** Beispiel-Mappen samt Dokumenten endgültig entfernen (#878): ohne Papierkorb und Ereignisse, im Löschprotokoll. */
  async entferneBeispielMappen(ids: string[], von: string | null) {
    const mappen = await this.repo.holeMappen(ids);
    const vorher = await this.lebendInhalt(mappen);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const typVon = new Map(mappen.map((m) => [m.id, m.typId] as const));
    await this.ohneEreignisse(async () => { for (const id of await this.loeschReihenfolge([...typVon.keys()])) await this.loescheMappeIntern(id, typen.get(typVon.get(id)!), von); });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'beispiele' }), await this.loeschKontext(von));
    if (mappen.length) await this.aktualisiereStatistik();
  }

  /* ---------- Nummernkreise (#171) ---------- */

  listeNummernkreise(jetzt?: Date) { return this.nummernkreise.listeNummernkreise(jetzt); }
  speichereNummernkreis(e: unknown, von: string) { return this.nummernkreise.speichereNummernkreis(e, von); }
  loescheNummernkreis(schluessel: string, von: string) { return this.nummernkreise.loescheNummernkreis(schluessel, von); }
  setzeZaehler(schluessel: string, e: unknown, von: string, jetzt?: Date) { return this.nummernkreise.setzeZaehler(schluessel, e, von, jetzt); }
  nummernVorschau(typId: string, feldKey: string, jetzt?: Date) { return this.nummernkreise.nummernVorschau(typId, feldKey, jetzt); }
  nummernNachtragen(typId: string, feldKey: string, von: string) { return this.nummernkreise.nummernNachtragen(typId, feldKey, von); }

  absenderVorschau(): Promise<{ posten: Array<{ id: string; titel: string; absender: string; kanal: string; erstellt: string }> }> { return this.mappenTitel.absenderVorschau(); }
  absenderBereinigen(ids: unknown, von: { id: string | null; email: string }): Promise<{ bereinigt: number }> { return this.mappenTitel.absenderBereinigen(ids, von); }
  titelNachziehen(): Promise<number> { return this.mappenTitel.titelNachziehen(); }
  ehemaligZuruecksetzen(): Promise<number> { return this.mappenTitel.ehemaligZuruecksetzen(); }
  unpassendeFormate(): Promise<Array<{ typId: string; typ: string; felder: Array<{ key: string; label: string; anzahl: number; mappen: Array<{ id: string; titel: string; wert: string; grund: string }> }> }>> { return this.mappenEingaben.unpassendeFormate(); }
  legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false, z?: Zugriff): Promise<Mappe & { hinweis?: string }> { return this.mappen.legeMappeAn(eingabe, benutzerId, demo, z); }
  auswahlPruefen(e: unknown, benutzerId: string, z?: Zugriff) { return this.mappenEingaben.auswahlPruefen(e, benutzerId, z); }
  folgen(e: unknown, z?: Zugriff) { return this.mappenEingaben.folgen(e, z); }
  folgeVorschlaege(typ: Mappentyp, v: { vorschlaege: Record<string, { wert: Wert; sicherheit: 'hoch' | 'mittel' | 'niedrig'; fundstelle: string }>; bezuege: Record<string, MappenBezug>; neu: Record<string, unknown> }, z?: Zugriff): Promise<void> { return this.mappenEingaben.folgeVorschlaege(typ, v, z); }
  zaehleAuswahl(e: unknown, benutzerId: string) { return this.mappenEingaben.zaehleAuswahl(e, benutzerId); }
  rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> { return this.mappenEingaben.rechteVorschau(id, eingabe, z); }
  aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff, anlass?: Record<string, unknown>): Promise<Mappe & { hinweis?: string }> { return this.mappen.aendereMappe(id, eingabe, benutzerId, z, anlass); }
  legeMappenAn(liste: NeueMappe[]) { return this.mappen.legeMappenAn(liste); }
  aktualisiereStatistik() { return this.sichten.aktualisiereStatistik(); }

  /**
   * Ob und warum nicht eine Mappe gelöscht werden kann (#79). Dieselbe Prüfung nutzt das Löschen,
   * damit Anzeige und Löschen nie auseinanderlaufen.
   */
  private async loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[], alleTypen?: Mappentyp[]) {
    if (m.systemKennung) return { ok: false as const, status: 409, grund: t('meldungen.dienst.systemrollen-lassen-sich-nicht'), fremd: [], zuordnungen: [], emails: [] };
    if (typ && !darfLoeschen(typ)) return { ok: false as const, status: 403, grund: t('meldungen.dienst.mappen-vom-typ-lassen-2', { name: typ.name, wert: typ.system === 'benutzer' ? t('meldungen.dienst.benutzer-werden-in-der') : '' }), fremd: [], zuordnungen: [], emails: [] };
    // Archivmodus (#212): vor Fristende nicht löschen – auch nicht als Administrator.
    const bis = aufbewahrenBis(typ?.archiv, m);
    if (inFrist(bis)) return { ok: false as const, status: 409, grund: t('meldungen.dienst.aufbewahrungspflicht-bis-vorher', { datumText: datumText(bis!) }), fremd: [], zuordnungen: [], emails: [], aufbewahrenBis: bis };
    const typen = rueck.length ? alleTypen ?? await this.repo.listeTypen() : [];
    // Eine Rolle darf weg, auch wenn Benutzer sie haben: deren Zuordnung fällt weg.
    const benutzerTyp = typ?.system === 'rolle' ? typen.find((t) => t.system === 'benutzer') : undefined;
    const zuordnungen = benutzerTyp ? rueck.filter((r) => r.quelleTypId === benutzerTyp.id && r.feldKey === 'rollen') : [];
    // Post (#58, #192) verweist auf jede Mappe; sie hält das Löschen nicht auf, der Verweis entfällt.
    const emailTyp = typen.find((t) => t.system === 'post');
    const emails = emailTyp ? rueck.filter((r) => r.quelleTypId === emailTyp.id && r.feldKey === 'bezug') : [];
    const fremd = rueck.filter((r) => r.quelleId !== m.id && !zuordnungen.includes(r) && !emails.includes(r));
    if (fremd.length) {
      const ids = new Set(fremd.map((r) => r.quelleId));
      return { ok: false as const, status: 409, grund: t('meldungen.dienst.auf-diese-mappe-verweisen', { anzahl: ids.size }), fremd, zuordnungen, emails, benutzerTyp, emailTyp };
    }
    return { ok: true as const, status: 200, grund: undefined, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
  }

  exportiere(...a: Parameters<AusgangExport['exportiere']>) { return this.ausgangExport.exportiere(...a); }

  private dokumenteJeMappe(ids: string[]) { return this.ausgang.dokumenteJeMappe(ids); }
  exportierbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> { return this.ausgang.exportierbar(ich, z, ids); }
  mitnehmbar(ich: { id: string; rolle: string }, z: Zugriff, ids: string[]): Promise<Set<string>> { return this.ausgang.mitnehmbar(ich, z, ids); }
  pruefeAusgang(ich: { id: string; rolle: string }, z: Zugriff, ausgang: Ausgang, ids: string[]): Promise<void> { return this.ausgang.pruefeAusgang(ich, z, ausgang, ids); }
  private mitStempel<T extends Mappentyp>(typen: T[]): Promise<T[]> { return this.ausgang.mitStempel(typen); }
  laufwerkStempel(typId: string, vorlage: string | null, leser: string) { return this.ausgang.laufwerkStempel(typId, vorlage, leser); }
  laufwerkAusgabe(...a: Parameters<AusgangDienst['laufwerkAusgabe']>) { return this.ausgang.laufwerkAusgabe(...a); }
  dokumentFuerAusgabe(...a: Parameters<AusgangDienst['dokumentFuerAusgabe']>) { return this.ausgang.dokumentFuerAusgabe(...a); }
  fassungFuerAusgabe(...a: Parameters<AusgangDienst['fassungFuerAusgabe']>) { return this.ausgang.fassungFuerAusgabe(...a); }
  gestempelteSeiten(...a: Parameters<AusgangDienst['gestempelteSeiten']>) { return this.ausgang.gestempelteSeiten(...a); }

  trefferIds(...a: Parameters<SichtenDienst['trefferIds']>) { return this.sichten.trefferIds(...a); }

  /**
   * Mehrere Mappen löschen (#150): je Mappe das Recht D am Mappentyp; Verweise innerhalb der Auswahl halten
   * nicht auf. `probe`: nur zählen, nichts löschen. Was nicht geht, steht mit Grund in `ausgelassen`.
   */
  async loescheMappen(e: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser): Promise<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }> {
    const x = (e ?? {}) as { ids?: unknown; probe?: unknown };
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-ausgewaehlt'));
    if (ids.length > MAX_AUSWAHL) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-mappen-auf-einmal', { MAX_AUSWAHL: MAX_AUSWAHL.toLocaleString(gebietsschema()) }));
    const auswahl = new Set(ids);
    const ausgelassen: Array<{ id: string; titel: string; grund: string }> = [];
    const kandidaten: Mappe[] = [];
    let dokumente = 0;
    for (const id of ids) {
      const m = await this.repo.holeMappe(id);
      if (!m) { ausgelassen.push({ id, titel: '', grund: t('meldungen.dienst.gibt-es-nicht-mehr') }); continue; }
      const r = await this.rechteAn(z, m);
      if (!r.R) { ausgelassen.push({ id, titel: NICHT_SICHTBAR, grund: t('meldungen.dienst.nicht-sichtbar') }); continue; }
      if (!r.D) { ausgelassen.push({ id, titel: m.titel ?? '', grund: t('meldungen.dienst.kein-recht-zum-loeschen') }); continue; }
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), (await this.repo.rueckverweise(id)).filter((v) => !auswahl.has(v.quelleId)));
      if (!p.ok) { ausgelassen.push({ id, titel: m.titel ?? '', grund: p.fremd.length ? t('meldungen.dienst.es-wird-noch-auf') : p.grund }); continue; }
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
        try { await this.loescheMappe(m.id, benutzerId, z, { ...liesAnlass(x), ausloeser: quelle, weg: 'mehrere' }); geloescht++; }
        catch (err) {
          if (err instanceof Fachfehler && err.status === 409) rest.push(m);
          else ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: (err as Error).message });
        }
      }
      if (rest.length === offen.length) { for (const m of rest) ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: t('meldungen.dienst.es-wird-noch-auf') }); break; }
      offen = rest;
    }
    return { mappen: kandidaten.length, dokumente, geloescht, ausgelassen };
  }

  async loescheMappe(id: string, benutzerId: string | null = null, z?: Zugriff, anlass?: Anlass): Promise<void> {
    if (z) await this.pruefeRecht(z, id, 'D');
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const p = await this.loeschPruefung(m, typ, await this.repo.rueckverweise(id));
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const { zuordnungen, emails, benutzerTyp, emailTyp } = p;
    // Löschprotokoll (#470): was mit der Mappe geht, bevor es weg ist.
    const vorher = await this.lebendInhalt([m]);
    for (const z of zuordnungen) {
      const b = await this.repo.holeMappe(z.quelleId);
      if (b) await this.schreibeSystemMappe(benutzerTyp!, b.id, { rollen: alsListe(b.werte.rollen).filter((r) => r !== id) }, benutzerId);
    }
    for (const e of emails) {
      const x = await this.repo.holeMappe(e.quelleId);
      if (x) await this.schreibeSystemMappe(emailTyp!, x.id, { bezug: alsListe(x.werte.bezug).filter((b) => b !== id) }, benutzerId);
    }
    const korb = await this.papierkorbTage() > 0;
    if (korb) await this.legeInPapierkorb(id, typ, benutzerId);
    else await this.loescheMappeIntern(id, typ, benutzerId);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass?.weg ?? 'einzeln', verweise: { [id]: zuordnungen.length + emails.length } }),
      await this.loeschKontext(benutzerId, anlass));
  }

  /** In den Papierkorb (#43): eindeutige Werte werden frei, Dateien bleiben bis zum Leeren. */
  private async legeInPapierkorb(id: string, typ: Mappentyp | undefined, von: string | null) {
    await this.repo.legeInPapierkorb(id, von);
    await this.notiere(id, von, 'papierkorb');
    await this.ereignis('mappe.geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
  }

  private async loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) {
    const dokumente = await this.repo.listeDokumente(id);
    await this.repo.loescheMappe(id);
    await this.notiere(id, von, 'endgueltig');
    await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }

  /* ---------- Systemtypen: Benutzer und Rollen (#26, #27) ---------- */

  /**
   * Legt die Systemausstattung an, soweit sie fehlt, und schlägt sie nach (#963: `systemausstattung.sicherstellen()`).
   * Läuft beim Start; wer nur Ids braucht, nimmt `kern.system()`.
   */
  sichereSystem(): Promise<SystemIds> { return this.systemausstattung.sicherstellen(); }

  ablageortTyp(): Promise<Mappentyp | undefined> { return this.systemtypen.ablageortTyp(); }

  private ablageortId(): Promise<string | undefined> { return this.kern.ablageortId(); }

  /** Der Ablageort, den der Kern vor #883 angelegt hat (Kern). */
  frueherAblageortTyp(): Promise<Mappentyp | undefined> { return this.kern.frueherAblageortTyp(); }

  vermerkeVerwaltungsmodus(alltag: { id: string; rolle: string; name?: string; email?: string }, ids: string[], was: Modusspur): Promise<Set<string>> { return this.systemtypen.vermerkeVerwaltungsmodus(alltag, ids, was); }
  imVerwaltungsmodus(max?: number) { return this.systemtypen.imVerwaltungsmodus(max); }

  private sicherePostSichten(post: Mappentyp) { return this.systemsichten.sicherePostSichten(post); }
  private sichereFavoritenSicht() { return this.systemsichten.sichereFavoritenSicht(); }
  favoritenSicht(): Promise<string | null> { return this.systemsichten.favoritenSicht(); }
  neuePostSicht(): Promise<string | null> { return this.systemsichten.neuePostSicht(); }

  /* ---------- Post (#192) ---------- */

  legePostAn(...a: Parameters<PostDienst['legePostAn']>) { return this.post.legePostAn(...a); }
  ordneZu(...a: Parameters<PostDienst['ordneZu']>) { return this.post.ordneZu(...a); }
  automatischZuordnen(postId: string, e: PostErkennung) { return this.post.automatischZuordnen(postId, e); }
  automatikRueckgaengig(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) { return this.post.automatikRueckgaengig(aufgabeId, ich, z); }
  private postAufgaben(mappeId: string, von: string | null) { return this.post.postAufgaben(mappeId, von); }

  trennePostAb(postId: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.postAufloesen.trennePostAb(postId, eingabe, von, z); }

  private schreibeSystemMappe(...a: Parameters<PostSystemmappen['schreibeSystemMappe']>) { return this.postSystemmappen.schreibeSystemMappe(...a); }
  spiegleBenutzer(...a: Parameters<PostSystemmappen['spiegleBenutzer']>) { return this.postSystemmappen.spiegleBenutzer(...a); }
  gleicheBenutzerAb(...a: Parameters<PostSystemmappen['gleicheBenutzerAb']>) { return this.postSystemmappen.gleicheBenutzerAb(...a); }
  pruefeRollen(eingabe: unknown) { return this.postSystemmappen.pruefeRollen(eingabe); }
  setzeRollen(benutzerId: string, eingabe: unknown, von: string | null = null) { return this.postSystemmappen.setzeRollen(benutzerId, eingabe, von); }
  listeRollen(mitKonten = false) { return this.postSystemmappen.listeRollen(mitKonten); }
  systemkontenUebersicht(system: Benutzer[], dienst: Benutzer[]) { return this.postSystemmappen.systemkontenUebersicht(system, dienst); }
  systemZugriff(kennung: Systemkonto = 'automatisierung') { return this.postSystemmappen.systemZugriff(kennung); }

  /** Systemkonten des DMS (#673), vom Start gesetzt (Konten legen sie bei Bedarf an). */
  systemkonten?: (kennung: Systemkonto) => Promise<Benutzer>;
  /** Automatisierungen, die ein Konto ausführt (#674 setzt das); bis dahin keine. */
  automatisierungenVon?: (kontoId: string) => Promise<Array<{ id: string; name: string; angehalten?: boolean }>>;
  /** Tägliche Zusammenfassung an einen Benutzer (#678, Dann-Karte); setzt der Server aus der Aufgaben-Mail. */
  zusammenfassungAn?: (benutzerId: string, trocken: boolean) => Promise<{ gesendet: boolean; grund: string }>;
  /** Anmeldeschutz melden (#678, Dann-Karte): Sammelmeldung bzw. Kontosperre; setzt der Server aus dem Anmeldeschutz. */
  anmeldeschutzMelden?: (was: 'sammel' | 'konto', daten: Record<string, unknown>, trocken: boolean) => Promise<{ gesendet: boolean; grund: string }>;
  /** Erinnerungen am Feld als Automatisierungen übernehmen (#712); setzt der Baustein Automatisierungen. */
  fristenUebernehmen?: () => Promise<number>;
  /** Mitgelieferte Automatisierungen eines Pakets anlegen bzw. aktualisieren (#712); setzt der Baustein Automatisierungen. */
  paketAutomatisierungen?: (p: InstalliertesPaket, liste: Array<{ schluessel: string; name: string; beschreibung: string; wenn: Record<string, unknown>; und?: Record<string, unknown>; dann: unknown[] }>, ein?: string[]) => Promise<number>;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das). */
  automatisierungenExport?: () => Promise<unknown[]>;

  /* ---------- Hilfen für Automatisierungen (#674) ---------- */

  /** Was eine Automatisierung prüfen muss: Mappentypen, Ansichten, Benutzer (ohne Systemkonten), Rollen. */
  async automatisierungKontext() {
    const { benutzer, kontorollen } = await this.kern.system();
    const konto = new Set(kontorollen.values());
    const [typen, sichten, rollen, leute] = await Promise.all([this.repo.listeTypen(), this.repo.listeSichten(), this.listeRollen(), this.repo.listeMappen(benutzer.id)]);
    return {
      typen, sichten: sichten.map((x) => ({ id: x.id, name: x.name, typen: x.typen })), rollen: rollen.map((r) => ({ id: r.id, name: r.name })),
      benutzer: leute.filter((m) => !alsListe(m.werte.rollen).some((r) => konto.has(r)) && !this.paketKonten.has(m.id)).map((m) => ({ id: m.id, name: m.titel || String(m.werte.name ?? ''), aktiv: m.werte.aktiv !== false })),
    };
  }

  /** Aktive Benutzer, die eine Rolle haben (Empfänger „Rolle“ einer Automatisierung). */
  async mitgliederDerRolle(rolleId: string): Promise<string[]> {
    const { benutzer } = await this.kern.system();
    return (await this.repo.listeMappen(benutzer.id)).filter((m) => m.werte.aktiv !== false && alsListe(m.werte.rollen).includes(rolleId)).map((m) => m.id);
  }

  /**
   * Teile einer Und-Bedingung für eine Mappe auswerten (#674): Bedingungen aus dem Baukasten der Ansichten,
   * „in Ansicht“ und „in den Favoriten von“. `ich` ist der Benutzer, für den „ich“ gilt (das Systemkonto).
   */
  async trifftTeile(mappeId: string, teile: Array<{ art: 'bedingungen'; bedingungen: Bedingung[] } | { art: 'sicht'; sicht: string } | { art: 'favorit'; benutzer: string[] }>, ich: string): Promise<boolean[]> {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) return teile.map(() => false);
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) return teile.map(() => false);
    const a = await this.aufloesung(ich);
    let sichten: Sicht[] | null = null;
    const erg: boolean[] = [];
    for (const t of teile) {
      let klauseln: Klausel[];
      if (t.art === 'bedingungen') klauseln = [{ typen: [typ.id], filter: filterFuer({ bedingungen: t.bedingungen }, [typ], a) }];
      else if (t.art === 'sicht') { sichten ??= await this.repo.listeSichten(); klauseln = sichten.some((x) => x.id === t.sicht) ? klauselnFuer(sichten, t.sicht, new Map([[typ.id, typ]]), a) : []; }
      else klauseln = t.benutzer.map((b) => ({ typen: [typ.id], filter: [{ art: 'favorit' as const, benutzer: b }] }));
      erg.push(klauseln.length > 0 && (await this.repo.inKlauseln([m.id], klauseln)).has(m.id));
    }
    return erg;
  }

  /** Titel von Mappen, die `z` lesen darf (Platzhalter in Automatisierungen, #674); andere fehlen. */
  async lesbareTitel(z: Zugriff, ids: string[]): Promise<Map<string, string>> {
    const ok = await this.lesbare(z, ids);
    const t = await this.repo.titelVon([...ok]);
    return new Map([...t].filter(([k]) => ok.has(k)));
  }

  /**
   * Wer eine Aufgabe für den Benutzer `id` wirklich bekommt (#724, gemeinsamer Weg für Kern und Automatisierungen):
   * er selbst – abwesend oder deaktiviert sein Vertreter (`empfaengerAufloesen`); ist niemand Aktives erreichbar, die
   * Administratoren (null). Wirft nur, wenn `id` kein Benutzer ist; ein deaktivierter Empfänger bricht nichts ab.
   */
  async aufgabenEmpfaenger(id: string): Promise<{ an: string | null; ueber: string[] }> {
    const { benutzer } = await this.kern.system();
    const m = istUuid(id) ? await this.repo.holeMappe(id) : undefined;
    if (!m || m.typId !== benutzer.id) throw new Fachfehler(422, t('meldungen.dienst.bitte-einen-benutzer-als'));
    const { ziel, abwesende } = await this.empfaengerAufloesen(id);
    const aktiv = async (x: string | null) => !!x && (!this.konten?.benutzer ? (await this.repo.holeMappe(x))?.werte.aktiv !== false : (await this.konten.benutzer()).some((b) => b.id === x && b.aktiv));
    if (await aktiv(ziel)) return { an: ziel, ueber: abwesende };
    return { an: null, ueber: [...abwesende, ...(ziel ? [ziel] : [])] };
  }

  /**
   * Aufgabe oder Benachrichtigung aus einer Automatisierung (#676, #724) – auf demselben Weg wie die eingebauten:
   * - **Vertretung:** Ist der Empfänger abwesend oder deaktiviert, geht sie an den Vertreter (mit Eintrag in der
   *   Historie); ist niemand erreichbar, an die Administratoren. Der Lauf bricht dabei nicht ab.
   * - **Anlass:** Mit Anlass erledigt sie sich selbst, wenn er wegfällt (Datum geändert/geleert, Post zugeordnet,
   *   Abwesenheit beendet). Kommt sie von „Datum erreicht“, ist sie eine **Frist** (Art „Frist“, Feld und Datum,
   *   wiederkehrend mit Folgetermin) – dieselbe Person bekommt je Mappe, Feld und Datum nur eine (auch neben der
   *   eingebauten Erinnerung).
   * - **Text** (#795): als Funktion bekommt sie den, der die Aufgabe wirklich bekommt (nach der Vertretung), und füllt
   *   die Platzhalter mit dessen Rechten.
   * - **Ohne Leserecht** (#798): Die Aufgabe hängt trotzdem an der Mappe; der Empfänger sieht nur einen Hinweis und die
   *   Fälligkeit, der Admin den Fall in der Werkbank.
   * - Benachrichtigungen bündeln je Automatisierung, Mappe und Empfänger (eine offene, der Text wird aktualisiert).
   */
  async aufgabeAusAutomatisierung(e: { mappeId: string; empfaengerId: string; text: string | ((an: string | null) => Promise<string>); datum: string | null; von: string; buendeln: string | null; anlass: Record<string, unknown>; aufgabenAnlass?: AufgabenAnlass | null; frist?: { feld: string; datum: string } | null }): Promise<{ id: string; ohneLeserecht: boolean; vorhanden?: boolean; an: string | null }> {
    const { an, ueber } = await this.aufgabenEmpfaenger(e.empfaengerId);
    const ohneLeserecht = !!an && !(await this.sichtbarFuer(an, [e.mappeId])).has(e.mappeId);
    const text = (typeof e.text === 'string' ? e.text : await e.text(an)).slice(0, AUFGABE_MAX);
    if (e.buendeln && an) {
      const id = await this.benachrichtigeGebuendelt({ empfaengerId: an, mappeId: e.mappeId, art: 'manuell', schluessel: `auto:${e.buendeln}:${e.mappeId}`.slice(0, 120), von: e.von, text: () => text });
      if (ohneLeserecht) await this.faelleNach([e.mappeId]);
      return { id, ohneLeserecht, an };
    }
    const frist = e.frist ?? null;
    if (frist) {
      // Schon eine Frist für diese Person (eingebaut, weitergegeben oder von einer anderen Automatisierung)? Dann keine zweite.
      const schon = (await this.repo.fristAufgaben([e.mappeId])).find((x) => x.feldKey === frist.feld && x.datum === frist.datum && [an, e.empfaengerId].includes(x.empfaengerId));
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
    }
    let a: Aufgabe;
    try {
      a = await this.neueAufgabe({
        id: randomUUID(), mappeId: e.mappeId, empfaengerId: an, art: frist ? 'frist' : 'manuell', text,
        ...(frist ? { feldKey: frist.feld, datum: frist.datum } : { datum: e.datum }),
        anlass: e.aufgabenAnlass ?? null,
        erstellt: '', erstelltVon: e.von, erledigt: null, erledigtVon: null,
      });
    } catch (x) {
      // Gleichzeitig angelegt (eindeutiger Index der Fristen): die vorhandene zählt.
      const schon = frist ? (await this.repo.fristAufgaben([e.mappeId])).find((y) => y.feldKey === frist.feld && y.datum === frist.datum && y.empfaengerId === an) : undefined;
      if (schon) return { id: schon.id, ohneLeserecht, vorhanden: true, an };
      throw x;
    }
    const weiter = ueber.length ? t('meldungen.dienst.weitergegeben-wegen-abwesenheit-von-2', { all: (await Promise.all(ueber.map((x) => this.name(x)))).join(', ') }) : '';
    await this.notiere(e.mappeId, e.von, 'aufgabe', { ...e.anlass, text: t('meldungen.dienst.fuer-2', { name: await this.name(an), weiter, text }), aufgabe: a.id, aufgabenart: a.art, fuer: an, aufgabentext: text });
    if (ohneLeserecht) await this.faelleNach([e.mappeId]);
    return { id: a.id, ohneLeserecht, an };
  }

  /** Offene Aufgaben einer Mappe, deren Anlass `passt`, als erledigt eintragen (#724: „erledigt sich selbst“). */
  private async erledigeNachAnlass(mappeId: string, passt: (x: AufgabenAnlass, a: Aufgabe) => boolean, grund: string): Promise<number> {
    let n = 0;
    for (const a of await this.repo.offeneAufgaben({ mappeIds: [mappeId] })) {
      if (!a.anlass || !passt(a.anlass, a)) continue;
      await this.repo.erledigeAufgabe(a.id, null);
      await this.notiere(mappeId, null, 'aufgabe', { text: t('meldungen.dienst.erledigt-3', { grund, text: a.text }), aufgabe: a.id, aufgabenart: a.art, fuer: a.empfaengerId, aufgabentext: a.text });
      n++;
    }
    if (n) await this.faelleNach([mappeId]);
    return n;
  }

  /** Mappen eines Typs, deren Datumsfeld genau dieses Datum hat („Datum in N Tagen“, #674). Nur Ids. */
  /** Wert eines Datumsfelds einer Mappe (#712: „Datum erreicht“ beim Speichern im Vorlauf); null ohne Datum oder bei Demo-Daten. */
  async datumVon(mappeId: string, feld: string): Promise<string | null> {
    const m = await this.repo.holeMappe(mappeId);
    const w = m?.werte[feld];
    return m && !m.demo && istDatum(w) ? w : null;
  }

  async mappenMitDatum(typId: string, feld: string, datum: string): Promise<string[]> {
    return (await this.repo.listeMappen(typId)).filter((m) => m.werte[feld] === datum && !m.demo).map((m) => m.id);
  }

  weitereRollen(): Promise<Map<string, string[]>> { return this.systemtypen.weitereRollen(); }
  entferneBenutzerMappe(id: string) { return this.systemtypen.entferneBenutzerMappe(id); }
  benutzerspiegel(): Benutzerspiegel { return this.systemtypen.benutzerspiegel(); }

  /* ---------- Papierkorb (#43) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig) – Kern. */
  papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }

  /** Aufbewahrung ändern. 0 schaltet den Papierkorb aus und leert ihn sofort. */
  async setzePapierkorbTage(eingabe: unknown, von?: string | null): Promise<{ tage: number; geleert: number }> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.der-papierkorb-ist-nicht'));
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 3650) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-2'));
    await this.einstellungen.schreibe('papierkorb', { tage });
    protokoll.modul('werkbank').info(tage ? 'Aufbewahrung im Papierkorb geändert' : 'Papierkorb ausgeschaltet', { tage });
    const aus = { weg: 'ausgeschaltet' as const, kontext: await this.loeschKontext(von ?? null) };
    const geleert = tage ? await this.raeumePapierkorbAuf() : await this.leere((await this.repo.papierkorb()).map((e) => e.id), von ?? null, false, aus) + await this.leereDokumente((await this.repo.papierkorbDokumente()).map((d) => d.id), aus);
    return { tage, geleert };
  }

  /** Ablage: was ich gelöscht habe. Werkbank (alle): was alle gelöscht haben. */
  async papierkorb(ich: { id: string; rolle: string }, alle = false): Promise<Array<PapierkorbEintrag & { aufgeloestIn?: AufgeloestIn }>> {
    return this.mitAufloesung(await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id }));
  }

  /**
   * Aufgelöste Post (#936): „Aufgelöst in <Typ> <Titel>“ mit Link. `da` = die Mappe gibt es noch (sonst nur Typ und Titel,
   * soweit bekannt). Nur für Post – andere Mappen werden nie aufgelöst.
   */
  private async mitAufloesung<T extends PapierkorbEintrag>(liste: T[]): Promise<Array<T & { aufgeloestIn?: AufgeloestIn }>> {
    const postTyp = (await this.repo.listeTypen()).find((x) => x.system === 'post');
    const posten = postTyp ? liste.filter((e) => e.typId === postTyp.id).map((e) => e.id) : [];
    if (!posten.length) return liste;
    const auf = await this.repo.aufgeloesteIn(posten);
    if (!auf.size) return liste;
    const bezuege = await this.repo.bezuege([...new Set([...auf.values()].map((a) => a.ziel))]);
    return liste.map((e) => {
      const a = auf.get(e.id);
      if (!a) return e;
      const b = bezuege.get(a.ziel);
      return { ...e, aufgeloestIn: { id: a.ziel, typId: b?.typId ?? a.zielTyp, titel: b?.titel ?? '', da: !!b } };
    });
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
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-liegt-nicht'));
    return e;
  }

  /** Dokument zurück in sein Register (#344). Rechte: wer es gelöscht hat (und die Mappe noch bearbeiten darf) oder ein Administrator. */
  async stelleDokumentWiederHer(id: string, ich: { id: string; rolle: string }, z: Zugriff | undefined, alle = false, quelle?: Ausloeser) {
    const e = await this.dokEintrag(id, ich, alle);
    const [x] = await this.mitMappe([e]);
    if (x.mappe === 'papierkorb') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-liegt-selbst', { wert: x.mappeTitel || t('meldungen.dienst.ohne-titel-2') }));
    if (x.mappe === 'weg') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-dieses-dokuments'));
    if (!(alle && ich.rolle === 'admin')) await this.pruefeRecht(z, e.mappeId, 'U');
    const typ = (await this.repo.holeTyp(x.typId))!;
    if (!typ.register.some((r) => r.key === e.registerKey && r.art === 'dokumente')) throw new Fachfehler(409, t('meldungen.dienst.das-register-gibt-es', { register: x.register }));
    const inhalt = (await this.repo.papierkorbDokumentInhalt([id]))[0];
    await this.repo.stelleDokumentWiederHer(id);
    await this.notiere(e.mappeId, ich.id, 'dokument_wiederhergestellt', { dokument: e.name, register: x.register });
    if (inhalt) await this.protokolliere(this.dokEintraege(inhalt.dokumente.slice(0, 1), { ...(await this.mappenInfo([e.mappeId], new Map()))(e.mappeId, id), schritt: 'wiederhergestellt', weg: 'dokument' }),
      await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.beruehre(e.mappeId, typ, ich.id);
    this.neueDateien([(await this.repo.holeDokument(id))!]);
    protokoll.modul('ablage').info('Dokument wiederhergestellt', { dokument: e.name, id, mappe: e.mappeId });
    return { dokument: (await this.repo.holeDokument(id))!, typId: x.typId };
  }

  /** Dokumente endgültig löschen (ohne Rechteprüfung); Archivmodus der Mappe gilt weiter. */
  private async leereDokumente(ids: string[], wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    if (!ids.length) return 0;
    const inhalt = await this.repo.papierkorbDokumentInhalt(ids);
    const dateien = await this.repo.leereDokumentPapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    // Löschprotokoll (#470): je Dokument und Version; Mappe, Typ und Grund vom Schritt „in den Papierkorb“.
    const frueher = await this.letzteSchritte(inhalt.map((x) => x.id));
    const mappen = await this.mappenInfo(inhalt.map((x) => x.mappeId), frueher);
    const kontext = wie.kontext ?? await this.loeschKontext(null, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(inhalt.flatMap((x) => this.dokEintraege(x.dokumente, { ...mappen(x.mappeId, x.id), schritt: 'endgueltig', weg: wie.weg })), kontext, true);
    return ids.length;
  }

  async loescheDokumentEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    for (const id of ids) await this.dokEintrag(id, ich, alle);
    const n = await this.leereDokumente(ids, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Dokumente aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Eintrag, den dieser Benutzer sehen darf (eigener oder als Administrator in der Werkbank); sonst 404. */
  private async eintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-liegt-nicht'));
    return e;
  }

  async papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return (await this.mitAufloesung([await this.eintrag(id, ich, alle)]))[0]; }

  /**
   * Wiederherstellen. Verweise auf Mappen, die es nicht mehr gibt, und eindeutige Werte, die
   * inzwischen eine andere Mappe hat, lassen die Mappe „nicht passen“: Sie erscheint im Eingang.
   */
  async stelleWiederHer(id: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const e = await this.eintrag(id, ich, alle);
    // Aufgelöste Post (#936): Dokumente und Historie liegen in der neuen Mappe – zurück geht es nur, indem man sie löscht.
    const [mitAuf] = await this.mitAufloesung([e]);
    if (mitAuf.aufgeloestIn) throw new Fachfehler(409, t('meldungen.dienst.aufgeloest-nicht-wiederherstellen', { titel: mitAuf.aufgeloestIn.titel || t('meldungen.dienst.ohne-titel-2') }), { aufgeloestIn: mitAuf.aufgeloestIn });
    const typ = await this.repo.holeTyp(e.typId);
    if (!typ) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-dieser-mappe'));
    const r = await this.repo.stelleWiederHer(id);
    // Beim Löschen mit verknüpften Mappen entfernte Verweise (#424) kommen mit.
    const zurueck = e.entkoppelt.length ? await this.verbindeWieder(id, e.entkoppelt, ich.id) : { wieder: 0, entfallen: 0 };
    const verweiseEntfallen = r.verweiseEntfallen + zurueck.entfallen;
    await this.notiere(id, ich.id, 'wiederhergestellt', verweiseEntfallen ? { verweiseEntfallen } : undefined);
    await this.protokolliere([this.wiederEintrag(e, typ, e.vorgang)], await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel([id]);
    await this.passungFuer(typ, [id]);
    if (typ.system === 'benutzer') await this.konten?.wiederda(id, ich.id);
    const m = (await this.repo.holeMappe(id))!;
    protokoll.modul('ablage').info('Mappe wiederhergestellt', { typ: typ.name, titel: m.titel, id, passt: m.passt !== false || undefined, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen };
  }

  /** Endgültig löschen (ohne Rechteprüfung): Dateien, an denen nichts mehr hängt, und Konten von Benutzer-Mappen. */
  private async leere(ids: string[], von: string | null = null, streng = false, wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    // Archivmodus (#212): Mappen in der Frist bleiben im Papierkorb (lagen dort schon vor dem Einschalten).
    if (ids.length) {
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
      const korb = (await this.repo.papierkorb()).filter((e) => ids.includes(e.id));
      const geschuetzt = korb.filter((e) => inFrist(aufbewahrenBis(typen.get(e.typId)?.archiv, e)));
      if (geschuetzt.length && streng) throw new Fachfehler(409, t('meldungen.dienst.aufbewahrungspflicht-bis-vorher-2', { datumText: datumText(aufbewahrenBis(typen.get(geschuetzt[0].typId)?.archiv, geschuetzt[0])!), wert: geschuetzt[0].titel || t('meldungen.dienst.die-mappe') }));
      ids = ids.filter((id) => !geschuetzt.some((e) => e.id === id));
    }
    if (!ids.length) return 0;
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: von, art: 'endgueltig' as const })));
    {
      const typVon = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e.typId] as const));
      for (const id of ids) await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typVon.get(id) ?? null }, von);
    }
    const benutzerTyp = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    const benutzer = benutzerTyp ? (await this.repo.papierkorb({ typId: benutzerTyp.id })).filter((e) => ids.includes(e.id)).map((e) => e.id) : [];
    // Löschprotokoll (#470): Inhalt vor dem Leeren; Grund vom Schritt „in den Papierkorb“.
    const inhalt = await this.repo.papierkorbInhalt(ids);
    const dateien = await this.repo.leerePapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    const kontext = wie.kontext ?? await this.loeschKontext(von, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(this.mappenEintraege(await this.korbAlsInhalt(inhalt), { schritt: 'endgueltig', weg: wie.weg, verweise: Object.fromEntries(inhalt.map((k) => [k.id, k.entkoppelt])) }), kontext, true);
    // Einzeln gelöschte Dokumente dieser Mappen (#344) gehen mit – ohne Mappe lassen sie sich nicht mehr wiederherstellen.
    await this.leereDokumente((await this.repo.papierkorbDokumente({ mappeIds: ids })).map((d) => d.id), { weg: wie.weg, kontext });
    for (const id of benutzer) await this.konten?.endgueltig(id);
    return ids.length;
  }

  /** Einzelne Mappen endgültig löschen: eigene oder (in der Werkbank) alle. */
  async loescheEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    for (const id of ids) await this.eintrag(id, ich, alle);
    const n = await this.leere(ids, ich.id, true, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Papierkorb leeren: eigener (Ablage) oder ganz (Werkbank). */
  async leerePapierkorb(ich: { id: string; rolle: string }, alle = false, wie: { weg?: 'leeren' | 'abmelden'; quelle?: Ausloeser } = {}): Promise<number> {
    const w = { weg: wie.weg ?? 'leeren' as const, kontext: await this.loeschKontext(ich.id, { ausloeser: wie.quelle }) };
    const n = await this.leere((await this.papierkorb(ich, alle)).map((e) => e.id), ich.id, false, w)
      + await this.leereDokumente((await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).map((d) => d.id), w);
    if (n) protokoll.modul('ablage').info(alle ? 'Papierkorb aller Benutzer geleert' : 'Papierkorb geleert', { anzahl: n });
    return n;
  }

  /** Abgelaufenes endgültig löschen; läuft stündlich. */
  async raeumePapierkorbAuf(jetzt = Date.now()): Promise<number> {
    const tage = await this.papierkorbTage();
    const vor = new Date(jetzt - tage * 24 * 60 * 60 * 1000).toISOString();
    const n = await this.leere((await this.repo.papierkorb(tage ? { vor } : {})).map((e) => e.id), null, false, { weg: 'ablauf' });
    if (n) protokoll.modul('system').info('Abgelaufene Mappen aus dem Papierkorb gelöscht', { anzahl: n, tage });
    const nd = await this.leereDokumente((await this.repo.papierkorbDokumente(tage ? { vor } : {})).map((d) => d.id), { weg: 'ablauf' });
    if (nd) protokoll.modul('system').info('Abgelaufene Dokumente aus dem Papierkorb gelöscht', { anzahl: nd, tage });
    // Historie endgültig gelöschter Mappen nach ihrer Frist (#57).
    const ht = await this.historieTage();
    const weg = await this.repo.historieAufraeumen(new Date(jetzt - ht * 24 * 60 * 60 * 1000).toISOString());
    if (weg) protokoll.modul('system').info('Historie endgültig gelöschter Mappen entfernt', { eintraege: weg, tage: ht });
    // Löschprotokoll (#470): eigene Aufbewahrung in Jahren.
    const lj = await this.loeschprotokollJahre();
    const lweg = await this.repo.loeschprotokollAufraeumen(new Date(jetzt - lj * 365.25 * 24 * 60 * 60 * 1000).toISOString());
    if (lweg) protokoll.modul('system').info('Alte Einträge des Löschprotokolls entfernt', { eintraege: lweg, jahre: lj });
    return n;
  }

  /* ---------- Löschprotokoll (#470) ---------- */

  /** Wer und warum. Ohne Benutzer: „DMS“ (automatisch) – Kern. */
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }

  /** Lebende Mappen samt Dokumenten (aller Versionen) und Notizen – für Einträge vor dem Löschen. Demo-Mappen bleiben draußen. */
  private async lebendInhalt(mappen: Mappe[]): Promise<ProtokollMappe[]> {
    const echt = mappen.filter((m) => !m.demo);
    if (!echt.length) return [];
    const ids = echt.map((m) => m.id);
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const dok = await this.dokumenteJeMappe(ids);
    const alle = [...dok.values()].flat();
    const versionen = alle.length ? await this.repo.versionenVonDokumenten(alle.map((d) => d.id)) : [];
    const notizen = await this.repo.notizenVon(ids);
    return echt.map((m) => {
      const d = dok.get(m.id) ?? [];
      const ds = new Set(d.map((x) => x.id));
      return { id: m.id, typId: m.typId, typ: typen.get(m.typId), werte: m.werte, notizen: notizen.filter((n) => n.mappeId === m.id).length,
        dokumente: [...d.map(dokInfo), ...versionen.filter((v) => ds.has(v.dokumentId)).map(versionInfo)] };
    });
  }

  private async korbAlsInhalt(liste: Awaited<ReturnType<Repo['papierkorbInhalt']>>): Promise<ProtokollMappe[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    return liste.filter((k) => !k.demo).map((k) => ({ id: k.id, typId: k.typId, typ: typen.get(k.typId), werte: k.werte, notizen: k.notizen, dokumente: k.dokumente, vorgang: k.vorgang }));
  }

  /** Einträge für Mappen und ihre Dokumente (Kern). */
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private dokEintraege(liste: LoeschDokument[], x: Parameters<Loeschprotokoll['dokEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.dokEintraege(liste, x); }
  private wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil { return this.kern.loeschprotokoll.wiederEintrag(e, typ, vorgang); }
  /** Letzter Eintrag „in den Papierkorb“ je Mappen- bzw. Dokument-Id (Kern). */
  private letzteSchritte(ids: string[]): Promise<Map<string, LoeschEintrag>> { return this.kern.loeschprotokoll.letzteSchritte(ids); }
  /** Typ, Nummer und Vorgang der Mappe eines Dokuments – lebend, im Papierkorb oder aus dem Protokoll (Kern). */
  private mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) { return this.kern.loeschprotokoll.mappenInfo(mappeIds, frueher); }
  /** Einträge ins Löschprotokoll schreiben (Kern). */
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }

  async loeschprotokollJahre(): Promise<number> {
    const e = this.einstellungen ? ((await this.einstellungen.lies('loeschprotokoll')) as { jahre?: number } | null) : null;
    return typeof e?.jahre === 'number' ? e.jahre : LOESCHPROTOKOLL_STANDARD_JAHRE;
  }

  async setzeLoeschprotokollJahre(eingabe: unknown, von: string): Promise<number> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const jahre = Number(eingabe);
    if (!Number.isInteger(jahre) || jahre < 1 || jahre > LOESCHPROTOKOLL_JAHRE_MAX) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-3', { LOESCHPROTOKOLL_JAHRE_MAX }));
    await this.einstellungen.schreibe('loeschprotokoll', { jahre });
    protokoll.modul('datenschutz').info('Aufbewahrung des Löschprotokolls geändert', { jahre, von });
    return jahre;
  }

  /** Ansicht (Werkbank → Datenschutz): Einträge nach Filter, neueste zuerst. */
  async loeschprotokoll(q: Record<string, unknown>) {
    const f = liesFilter(q);
    const r = await this.repo.loeschprotokoll(f);
    return { ...r, jahre: await this.loeschprotokollJahre(), max: f.max };
  }

  /** Ausgabe als CSV oder PDF (Nachweis); höchstens LOESCH_MAX × 10 Einträge. */
  async loeschprotokollAusgabe(q: Record<string, unknown>, format: 'csv' | 'pdf', x: { von: string; mandant: string; version: string }) {
    const f = { ...liesFilter(q), max: LOESCH_MAX * 10 };
    const { eintraege, gesamt } = await this.repo.loeschprotokoll(f);
    const tag = new Intl.DateTimeFormat('sv-SE', { timeZone: zeitzone() }).format(new Date());
    if (format === 'csv') { const b = csvAus(LOESCH_SPALTEN, eintraege.map(alsZeile)); return { name: t('meldungen.dienst.loeschprotokoll-csv', { tag }), mime: 'text/csv; charset=utf-8', inhalt: b }; }
    const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { timeZone: zeitzone(), dateStyle: 'short', timeStyle: 'short' });
    const filter = [f.von && `ab ${datumText(f.von)}`, f.bis && `bis ${datumText(f.bis)}`, f.typId && `Mappentyp ${eintraege.find((e) => e.typId === f.typId)?.typ ?? f.typId}`,
      f.grund && (f.grund === 'ohne' ? t('meldungen.dienst.ohne-grund') : LOESCHGRUENDE[f.grund]), f.schritt && LOESCHSCHRITTE[f.schritt], f.vorgang && `Vorgang ${f.vorgang}`, f.suche && `Suche „${f.suche}“`].filter(Boolean).join(', ');
    const b = await schriftstueckPdf({
      titel: t('meldungen.dienst.loeschprotokoll'), untertitel: x.mandant, quer: true,
      stand: t('meldungen.dienst.erstellt-am-von-ablago', { zeit: zeit(new Date().toISOString()), von: x.von, version: x.version, eintraege: eintraege.length, wert: gesamt > eintraege.length ? ` von ${gesamt}` : '', wert2: filter ? ` · Filter: ${filter}` : '' }),
      vorbemerkung: t('meldungen.dienst.nachweis-ueber-geloeschte-mappen'),
      abschnitte: [{ titel: t('meldungen.dienst.eintraege'), bloecke: [{ art: 'tabelle', breiten: [0.9, 0.85, 0.95, 0.8, 1.6, 2.1, 0.9, 1.0, 1.1], kopf: ['Zeit', 'Schritt', t('meldungen.dienst.mappentyp-nummer'), 'Wie', t('meldungen.dienst.mappe-dokument'), 'Inhalt', 'Von', 'Grund', 'Vorgang'],
        zeilen: eintraege.map((e) => [
          zeit(e.zeit), LOESCHSCHRITTE[e.schritt], [e.typ, e.nummer].filter(Boolean).join(' · '), LOESCHWEGE[e.weg] ?? e.weg,
          e.art === 'mappe' ? `Mappe ${e.mappeId}` : t('meldungen.dienst.dokument', { dokumentId: String(e.dokumentId), wert: e.version && e.version > 1 ? ` (Version ${e.version})` : '', wert2: e.archivnummer ? ` · Archivnummer ${e.archivnummer}` : '' }),
          e.art === 'mappe' ? (e.anzahl ? t('meldungen.dienst.dokumente-aeltere-versionen-notizen', { dokumente: e.anzahl.dokumente, versionen: e.anzahl.versionen, notizen: e.anzahl.notizen, verweise: e.anzahl.verweise }) : '')
            : t('meldungen.dienst.sha-256-bytes', { sha256: String(e.sha256), groesse: String(e.groesse), mime: String(e.mime), wert: e.seiten ? ` · ${e.seiten} Seiten` : '' }),
          `${e.von}${e.ausloeser !== 'benutzer' ? ` (${AUSLOESER[e.ausloeser]})` : ''}`, [e.grund ? LOESCHGRUENDE[e.grund] : '', e.grundText].filter(Boolean).join(': '), e.vorgang ? `${e.vorgang}${e.startId === e.mappeId ? ' (Start)' : ''}` : '',
        ]) }] }],
    });
    return { name: t('meldungen.dienst.loeschprotokoll-pdf', { tag }), mime: 'application/pdf', inhalt: b };
  }

  /** Für den Vollexport: alle Einträge (älteste zuerst). */
  async loeschprotokollAlle(): Promise<LoeschEintrag[]> {
    const { eintraege } = await this.repo.loeschprotokoll({ max: Number.MAX_SAFE_INTEGER });
    return eintraege.reverse();
  }

  /* ---------- Demo-Daten ---------- */

  /** Mappen je Typ, auch Systemtypen (#711: lassen sich Pflicht-Verweise der Demo-Daten füllen?). */
  async mappenJeTyp(): Promise<Map<string, number>> {
    const z = (await this.repo.zaehler('', false)).typen;
    return new Map([...z].map(([id, x]) => [id, x.anzahl]));
  }

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
    if (echte) throw new Fachfehler(409, t('meldungen.dienst.echte-mappen-verweisen-auf', { anzahl: echte }));
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
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    const erkannt = erkenneAnzeigbar(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    const d = await this.repo.legeDokumentAn({
      id: randomUUID(), mappeId, registerKey, name: dateiname(name), mime: erkannt ?? erkenneBildtyp(inhalt) ?? mime,
      groesse: inhalt.length, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId,
    });
    return { id: d.id, volltext: Dienst.volltextAn(typ, registerKey) };
  }

  /* ---------- Eingangskanäle (#195) ---------- */

  postTyp() { return this.eingangskanaele.postTyp(); }
  notiereSystem(mappeId: string, system: string, text: string) { return this.eingangskanaele.notiereSystem(mappeId, system, text); }
  anzahlDokumente(mappeId: string) { return this.eingangskanaele.anzahlDokumente(mappeId); }
  gibtMappe(id: string) { return this.eingangskanaele.gibtMappe(id); }
  dokumenteMitInhalt(sha256: string) { return this.eingangskanaele.dokumenteMitInhalt(sha256); }
  fundstellen(z: Zugriff | undefined, pruefwerte: unknown, ohneMappe?: string) { return this.eingangskanaele.fundstellen(z, pruefwerte, ohneMappe); }
  postMitDatei(sha256: string, seit: string) { return this.eingangskanaele.postMitDatei(sha256, seit); }
  demoTexterkennung(ids: string[]) { return this.eingangskanaele.demoTexterkennung(ids); }

  /** Dokumente einer Mappe ohne Rechteprüfung (#878: Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren). */
  listeDokumente(mappeId: string) { return this.repo.listeDokumente(mappeId); }

  /* ---------- Dokumente (#1075, dokumente/dokumente.dienst.ts) ---------- */

  private raeumeAuf(sha256: string) { return this.dokumente.raeumeAuf(sha256); }
  ladeHoch(...a: Parameters<DokumenteDienst['ladeHoch']>) { return this.dokumente.ladeHoch(...a); }
  bezuegeVon(ids: string[]) { return this.dokumente.bezuegeVon(ids); }
  ohneEigeneMappen(): Promise<boolean> { return this.dokumente.ohneEigeneMappen(); }
  holeDokument(id: string) { return this.dokumente.holeDokument(id); }
  dokumentInhalt(id: string) { return this.dokumente.dokumentInhalt(id); }

  /* ---------- Stempel beim Weitergeben (#394) ---------- */

  stempelVorlagen() { return this.stempelvorlagen.stempelVorlagen(); }
  speichereStempelVorlage(id: string | null, eingabe: unknown, von: string) { return this.stempelvorlagen.speichereStempelVorlage(id, eingabe, von); }
  loescheStempelVorlage(id: string, von: string) { return this.stempelvorlagen.loescheStempelVorlage(id, von); }
  private pruefeStempelTyp(v: unknown) { return this.stempelvorlagen.pruefeStempelTyp(v); }
  private setzeStempelTyp(typId: string, st: StempelTyp | null) { return this.stempelvorlagen.setzeStempelTyp(typId, st); }

  loescheDokument(id: string, benutzerId: string | null = null, anlass: Anlass = { weg: 'ersetzt' }) { return this.dokumente.loescheDokument(id, benutzerId, anlass); }

  /* ---------- PDF bearbeiten (#335) ---------- */

  /** Seitenbilder der Seitenansicht (im Arbeitsspeicher, für die letzten Dokumente). */
  get seitenbilder() { return this.pdfBearbeiten.seitenbilder; }
  seiteAlsGraubild(...a: Parameters<PdfBearbeiten['seiteAlsGraubild']>) { return this.pdfBearbeiten.seiteAlsGraubild(...a); }
  pdfSeiten(id: string) { return this.pdfBearbeiten.pdfSeiten(id); }
  pdfSeitenbild(...a: Parameters<PdfBearbeiten['pdfSeitenbild']>) { return this.pdfBearbeiten.pdfSeitenbild(...a); }
  bearbeitePdf(id: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.pdfBearbeiten.bearbeitePdf(id, eingabe, von, z); }
  fuegePdfZusammen(eingabe: unknown, von: string | null, z?: Zugriff) { return this.pdfBearbeiten.fuegePdfZusammen(eingabe, von, z); }

  /* ---------- Post fotografieren (#490) ---------- */

  postAusFotos(...a: Parameters<PostFotos['postAusFotos']>) { return this.postFotos.postAusFotos(...a); }
  fotosAnMappe(...a: Parameters<PostFotos['fotosAnMappe']>) { return this.postFotos.fotosAnMappe(...a); }
  legePostZusammen(zielId: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.postFotos.legePostZusammen(zielId, eingabe, von, z); }

  /* ---------- PDF verkleinern (#393) ---------- */

  verkleinernVorschau(id: string) { return this.pdfVerkleinern.verkleinernVorschau(id); }
  verkleinereDokument(id: string, eingabe: unknown, von: string | null) { return this.pdfVerkleinern.verkleinereDokument(id, eingabe, von); }
  verkleinernEinstellung() { return this.pdfVerkleinern.verkleinernEinstellung(); }
  setzeVerkleinernEinstellung(eingabe: unknown) { return this.pdfVerkleinern.setzeVerkleinernEinstellung(eingabe); }
  private automatischVerkleinert(ein: Eingang, name: string) { return this.pdfVerkleinern.automatischVerkleinert(ein, name); }
  grosseDokumente(f: { ab?: unknown; stufe?: unknown }) { return this.pdfVerkleinern.grosseDokumente(f); }
  verkleinereViele(eingabe: unknown, von: { id: string | null; email: string }) { return this.pdfVerkleinern.verkleinereViele(eingabe, von); }

  /* ---------- Schwärzen (#392) ---------- */

  schwaerzenVorschau(id: string) { return this.schwaerzen.schwaerzenVorschau(id); }
  schwaerzSeitenbild(...a: Parameters<Schwaerzen['schwaerzSeitenbild']>) { return this.schwaerzen.schwaerzSeitenbild(...a); }
  archivSeitenbild(id: string, nr: number) { return this.schwaerzen.archivSeitenbild(id, nr); }
  schwaerzeDokument(id: string, eingabe: unknown, von: string | null) { return this.schwaerzen.schwaerzeDokument(id, eingabe, von); }

  /* ---------- Archivnummer (#345) ---------- */

  archivKreis(): Promise<Nummernkreis> { return this.mappenArchiv.archivKreis(); }
  setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> { return this.mappenArchiv.setzeArchivnummer(id, eingabe, von); }
  findeArchivnummer(eingabe: unknown, z?: Zugriff) { return this.mappenArchiv.findeArchivnummer(eingabe, z); }
  archivAufkleber(eingabe: unknown, von: string) { return this.mappenArchiv.archivAufkleber(eingabe, von); }

  /* ---------- Vollexport (#254) ---------- */

  /** Datenquelle für den Vollexport; Benutzer, Designs und Protokoll kommen von außen. */
  vollexportQuelle(e: { mandant: string; version: string; benutzer: ExportQuelle['benutzer']; designs: ExportQuelle['designs']; protokoll: ExportQuelle['protokoll']; region?: ExportQuelle['region']; z?: Zugriff }): ExportQuelle {
    const r = this.repo;
    const { z, ...x } = e;
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
      loeschprotokoll: () => this.loeschprotokollAlle(),
      synonyme: () => r.synonyme(),
      automatisierungen: () => this.automatisierungenExport?.() ?? Promise.resolve([]),
      // Gebündelt (#367): ein Zugriff je Paket, nicht je Mappe oder Dokument.
      dokumente: (ids) => r.dokumenteVon(ids),
      versionen: (ids) => r.versionenVonDokumenten(ids),
      volltexte: (ids) => r.volltexte(ids),
      datei: (sha) => this.dateien.lies(sha),
      // Umgewandelte Fassungen (#577) neben dem Original – wie in der Sicherung.
      fassung: async (sha) => { const f = await this.umwandlung?.lies(sha); return f ? { mime: f.info.mime, inhalt: f.inhalt } : null; },
      // Archivfassung (#631) neben dem Original: <Datei>.pdfa.pdf; ist das Original schon PDF/A, keine zweite Datei.
      archivfassung: async (sha) => { const i = await this.archiv?.info(sha); if (!i) return null; return i.imOriginal ? { imOriginal: true } : { inhalt: (await this.archiv!.lies(sha))?.inhalt ?? null }; },
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
        // Mit Zugriff (persönlicher Export): Titel von Mappen, die der Benutzer nicht lesen darf, verdeckt – wie in der Oberfläche.
        if (fehlt.length) {
          const neu = await r.bezuege(fehlt);
          const sichtbar = z ? await this.maskiereBezuege(z, neu) : null;
          for (const id of fehlt) bezugCache.set(id, sichtbar ? sichtbar[id] : neu.get(id));
        }
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
    const voll = this.vollexportQuelle({ mandant: x.mandant, version: x.version, benutzer: async () => x.ich, designs: async () => [], protokoll: () => [], z });
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
      // Nur Eigenes (#683): Dokumente im Papierkorb, die er gelöscht hat; Löschprotokoll, Synonyme und Automatisierungen
      // gehören dem ganzen Haushalt (Werkbank) und stehen nur im Vollexport.
      papierkorbDokumente: async () => (await this.repo.papierkorbDokumente({ von: ich })),
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined,
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
    const sys = await this.kern.system();
    const opt = bereinigeBaumOptionen(eingabe, { ...BAUM_STANDARD, ohneTypen: [sys.benutzer.id, sys.rolle.id] });
    return sammleBaum(this.baumQuelle(z), startId, opt);
  }

  /* ---------- Mappe mit allen verknüpften Mappen löschen (#424) ---------- */

  /**
   * Vorschau (#424): Baum „nach unten“ (Mappen, die auf die Start-Mappe verweisen, und so weiter), ohne
   * Benutzer und Rollen; dazu alle Verweise im Baum, welche Mappen auch an anderen hängen (🔗) und welche
   * sich grundsätzlich nicht löschen lassen. Tiefe 1–10 (Standard 5), Obergrenze max (Standard 1000).
   * Weiter geht es nur über Verweise der Art „Zugehörigkeit“; Mappen, die nur über „Bezug“ dranhängen
   * (📎, z. B. Ansprechpartner), stehen als Blatt da – bei ihnen wird nur der Verweis entfernt.
   */
  async loeschVorschau(startId: string, eingabe: unknown, z: Zugriff): Promise<LoeschVorschau> {
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    const opt = bereinigeBaumOptionen({ tiefe: e.tiefe, max: e.max }, { ...BAUM_STANDARD, tiefe: LOESCH_TIEFE, richtungen: ['verwiesenVon'], seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true });
    const baum = await sammleBaum(this.baumQuelle(z), startId, opt);
    const imBaum = new Set(baum.knoten.map((k) => k.id));
    const alle: LoeschKante[] = [];
    for (let i = 0; i < baum.knoten.length; i += 500) alle.push(...await this.repo.kantenVon(baum.knoten.slice(i, i + 500).map((k) => k.id)));
    const gesehen = new Set<string>();
    const kanten = alle.filter((k) => imBaum.has(k.quelleId) && imBaum.has(k.zielId) && k.quelleId !== k.zielId && !gesehen.has(`${k.quelleId}|${k.feldKey}|${k.zielId}`) && !!gesehen.add(`${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // 🔗: gehört auch zu einer Mappe außerhalb – über ein Feld der Art Zugehörigkeit, über das sie im Baum
    // hängt, oder zu einer Mappe desselben Typs wie im Baum (z. B. zusätzlich zu einem anderen Vertrag).
    // Bezug-Verweise (Aussteller, Kategorie, Ablageort) und Verweise auf Benutzer zählen nicht.
    const aussenZiele = [...new Set(alle.filter((k) => imBaum.has(k.quelleId) && !imBaum.has(k.zielId)).map((k) => k.zielId))];
    const typVon = await this.repo.typenVon(aussenZiele);
    const typIm = new Map(baum.knoten.map((k) => [k.id, k.typId] as const));
    const zugehoerig = (x: LoeschKante) => verweisartVon(z.typen.get(typIm.get(x.quelleId) ?? ''), x.feldKey) === 'zugehoerigkeit';
    const geteilt = baum.knoten.filter((k) => {
      if (k.nurBezug) return false;
      const innen = kanten.filter((x) => x.quelleId === k.id && zugehoerig(x));
      if (!innen.length) return false;
      const felder = new Set(innen.map((x) => x.feldKey));
      const typen = new Set(innen.map((x) => typIm.get(x.zielId)));
      return alle.some((x) => x.quelleId === k.id && !imBaum.has(x.zielId) && zugehoerig(x) && !ohne.has(typVon.get(x.zielId) ?? '') && (felder.has(x.feldKey) || typen.has(typVon.get(x.zielId))));
    }).map((k) => k.id);
    const nichtLoeschbar: Record<string, string> = {};
    const mappen = new Map((await this.repo.holeMappen(baum.knoten.filter((k) => !k.gesperrt && k.rechte.D).map((k) => k.id))).map((m) => [m.id, m] as const));
    for (const [id, m] of mappen) {
      const typ = z.typen.get(m.typId);
      if (!darfLoeschen(typ, m)) nichtLoeschbar[id] = m.systemKennung ? t('meldungen.dienst.systemrollen-lassen-sich-nicht-2') : t('meldungen.dienst.mappen-vom-typ-lassen-3', { wert: typ?.name ?? '' });
    }
    const v = { baum, kanten, geteilt, nichtLoeschbar };
    return { ...v, vorschlag: loeschVorschlag(v), papierkorbTage: await this.papierkorbTage() };
  }

  /**
   * Ausführen (#424): dieselbe Vorschau neu sammeln, Plan aus `auswahl` (Mappen-Id → loeschen |
   * entkoppeln | behalten; was fehlt, bleibt), dann in einem Vorgang: Verweise bleibender Mappen kappen
   * (für das Wiederherstellen gemerkt) und alle Mappen samt Dokumenten in den Papierkorb. Rechte und
   * Aufbewahrungsfristen werden dabei nie übergangen. Historie und Protokoll ohne Inhalte.
   */
  async loescheMitVerknuepften(startId: string, eingabe: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser) {
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as Record<string, unknown>;
    if (!e.auswahl || typeof e.auswahl !== 'object') throw new Fachfehler(422, t('meldungen.dienst.bitte-die-auswahl-angeben'));
    const v = await this.loeschVorschau(startId, e, z);
    const plan = planeLoeschung(v, liesLoeschAuswahl(e.auswahl));
    if (!plan.loeschen.length) throw new Fachfehler(422, t('meldungen.dienst.nach-dieser-auswahl-wird'), { plan });
    const weg = new Set(plan.loeschen);
    const gekappt = new Set(plan.entkoppeln.map((k) => `${k.quelleId}|${k.feldKey}|${k.zielId}`));
    // Zur Sicherheit je Mappe wie beim einzelnen Löschen prüfen – mit allen Verweisen, nicht nur denen im Baum.
    const mappen = new Map((await this.repo.holeMappen(plan.loeschen)).map((m) => [m.id, m] as const));
    for (const id of plan.loeschen) {
      const m = mappen.get(id);
      if (!m) throw new Fachfehler(409, t('meldungen.dienst.eine-der-mappen-gibt'));
      const rueck = (await this.repo.rueckverweise(id)).filter((r) => !weg.has(r.quelleId) && !gekappt.has(`${r.quelleId}|${r.feldKey}|${id}`));
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), rueck);
      if (!p.ok) throw new Fachfehler(p.status, t('meldungen.dienst.bitte-die-vorschau-neu', { wert: m.titel || t('meldungen.dienst.ohne-titel'), grund: p.grund }));
    }
    // Verweise bleibender Mappen entfernen (🔗 „nur Verweis entfernen“).
    const entkoppelt: Record<string, Array<{ quelleId: string; feldKey: string }>> = {};
    const jeQuelle = new Map<string, LoeschKante[]>();
    for (const k of plan.entkoppeln) jeQuelle.set(k.quelleId, [...(jeQuelle.get(k.quelleId) ?? []), k]);
    for (const [quelleId, ks] of jeQuelle) {
      const m = await this.pruefeRecht(z, quelleId, 'U');
      const typ = (await this.repo.holeTyp(m.typId))!;
      const werte = { ...m.werte };
      for (const k of ks) {
        const rest = alsListe(werte[k.feldKey]).filter((x) => x !== k.zielId);
        if (rest.length) werte[k.feldKey] = typ.felder.find((f) => f.key === k.feldKey)?.mehrfach ? rest : rest[0];
        else delete werte[k.feldKey];
        (entkoppelt[k.zielId] ??= []).push({ quelleId, feldKey: k.feldKey });
      }
      await this.schreibeVerweisWerte(typ, m, werte, benutzerId);
    }
    const vorgang = weg.has(startId) ? startId : randomUUID();
    const vorher = await this.lebendInhalt(plan.loeschen.map((id) => mappen.get(id)!));
    await this.repo.legeVorgangInPapierkorb(plan.loeschen, benutzerId, vorgang, entkoppelt);
    const kontext = await this.loeschKontext(benutzerId, { ...liesAnlass(e), ausloeser: quelle });
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'papierkorb', weg: 'verknuepft', vorgang, startId: v.baum.knoten[0].id,
      verweise: Object.fromEntries(Object.entries(entkoppelt).map(([id, l]) => [id, l.length])) }), kontext);
    const start = v.baum.knoten[0];
    const z_ = plan.zahlen;
    const text = t('meldungen.dienst.mit-verknuepften-mappen-geloescht', { mappen: z_.mappen, wert: t('meldungen.dienst.mappen', { anzahl: z_.mappen }), dokumente: z_.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: z_.dokumente }) });
    await this.repo.historieSchreibe(plan.loeschen.map((mappeId) => ({ mappeId, benutzerId, art: 'papierkorb' as const, daten: {
      vorgang, text, ...(mappeId === start.id ? { zahlen: z_ } : { start: start.id }),
    } })));
    // Ereigniskatalog (#670): je Mappe „gelöscht“ und „mit verknüpften Mappen gelöscht“ (gleicher Vorgang).
    for (const mappeId of plan.loeschen) {
      const typ = mappen.get(mappeId)?.typId ?? null;
      await this.ereignis('mappe.geloescht', { mappe: mappeId, typ }, benutzerId);
      await this.ereignis('mappe.geloescht_verknuepft', { mappe: mappeId, typ, vorgang, start: start.id }, benutzerId);
    }
    for (const typId of new Set([...mappen.values()].map((m) => m.typId))) {
      const typ = z.typen.get(typId);
      if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    }
    const tage = await this.papierkorbTage();
    if (!tage) await this.leere(plan.loeschen, benutzerId, false, { weg: 'ausgeschaltet', kontext });
    const erinnerung = await this.loeschErinnerungAn(v, plan, benutzerId);
    protokoll.modul('ablage').info(tage ? 'Mappe mit verknüpften Mappen in den Papierkorb gelegt' : 'Mappe mit verknüpften Mappen endgültig gelöscht', {
      von: benutzerId, start: startId, vorgang, mappen: z_.mappen, dokumente: z_.dokumente, verweiseEntfernt: z_.verweise,
      bleiben: { frist: z_.frist, ohneRecht: z_.ohneRecht, verweis: z_.gehalten, abgewaehlt: z_.abgewaehlt }, abgeschnitten: v.baum.abgeschnitten || undefined,
      erinnerung: erinnerung?.datum,
    });
    return { vorgang, endgueltig: !tage, zahlen: z_, loeschen: plan.loeschen, entkoppeln: plan.entkoppeln, erinnerung };
  }

  /**
   * Erinnerung zum Fristende (#424, Option D): Blieben Mappen wegen der Aufbewahrungsfrist stehen (und damit
   * die Start-Mappe), bekommt der Löschende an der Start-Mappe eine Erinnerung (#131) zum Tag nach dem
   * spätesten Fristende; dann steht sie als Aufgabe unter „Zu erledigen“. Gibt es dieselbe schon, keine zweite.
   */
  private async loeschErinnerungAn(v: LoeschVorschau, plan: LoeschPlan, benutzerId: string): Promise<{ id: string; datum: string; text: string } | null> {
    const x = loeschErinnerung(v, plan);
    if (!x) return null;
    const startId = v.baum.knoten[0].id;
    const da = (await this.repo.erinnerungen({ mappeId: startId, empfaengerId: benutzerId })).find((e) => e.text === x.text && e.datum === x.datum);
    if (da) return { id: da.id, datum: da.datum, text: da.text };
    const r = await this.repo.legeErinnerungAn({ id: randomUUID(), mappeId: startId, empfaengerId: benutzerId, datum: x.datum, text: x.text, erstellt: '', erstelltVon: benutzerId });
    await this.notiere(startId, benutzerId, 'aufgabe', { text: t('meldungen.dienst.erinnerung-fuer-am', { name: await this.name(benutzerId), datumDe: datumDe(x.datum), text: x.text }), aufgabenart: 'erinnerung', fuer: benutzerId, aufgabentext: x.text });
    return { id: r.id, datum: r.datum, text: r.text };
  }

  /** Verweisfelder einer Mappe neu schreiben (#424) – mit Historie, Titel und Passung wie beim Speichern. */
  private async schreibeVerweisWerte(typ: Mappentyp, m: Mappe, werte: Werte, von: string | null) {
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    const neu = await this.repo.aendereMappe(m.id, werte, [], von, { basis: m.werte, verweise: (w) => verweiseVon(typ, w) });
    if (aenderungen.length) await this.notiere(m.id, von, 'geaendert', { aenderungen, stand: neu.geaendert });
    await this.aktualisiereTitel([m.id]);
    await this.passungFuer(typ, [m.id]);
  }

  /** Beim Löschen entfernte Verweise wieder setzen (#424); liefert, wie viele nicht mehr gingen. */
  private async verbindeWieder(zielId: string, liste: Array<{ quelleId: string; feldKey: string }>, von: string | null): Promise<{ wieder: number; entfallen: number }> {
    let wieder = 0; let entfallen = 0;
    const jeQuelle = new Map<string, string[]>();
    for (const x of liste) jeQuelle.set(x.quelleId, [...(jeQuelle.get(x.quelleId) ?? []), x.feldKey]);
    for (const [quelleId, felder] of jeQuelle) {
      const m = await this.repo.holeMappe(quelleId);
      const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
      if (!m || !typ || !(await this.repo.holeMappe(zielId))) { entfallen += felder.length; continue; }
      const werte = { ...m.werte };
      for (const key of felder) {
        const f = typ.felder.find((x) => x.key === key && x.typ === 'referenz');
        const da = alsListe(werte[key]);
        if (!f) { entfallen++; continue; }
        if (da.includes(zielId)) { wieder++; continue; }
        if (f.mehrfach) { werte[key] = [...da, zielId]; wieder++; }
        else if (!da.length) { werte[key] = zielId; wieder++; }
        else entfallen++;
      }
      await this.schreibeVerweisWerte(typ, m, werte, von);
    }
    return { wieder, entfallen };
  }

  /**
   * Einen ganzen Vorgang (#424) wiederherstellen: alle Mappen mit ihren Dokumenten und Verweisen, dazu die
   * beim Löschen entfernten Verweise bleibender Mappen. Rechte wie beim einzelnen Wiederherstellen.
   */
  async stelleVorgangWiederHer(vorgang: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const eintraege = (await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).filter((e) => e.vorgang === vorgang);
    if (!istUuid(vorgang) || !eintraege.length) throw new Fachfehler(404, t('meldungen.dienst.diesen-vorgang-gibt-es'));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const fehlt = eintraege.find((e) => !typen.has(e.typId));
    if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-von-gibt', { wert: fehlt.titel || t('meldungen.dienst.ohne-titel') }));
    const ids = eintraege.map((e) => e.id);
    const { verweiseEntfallen } = await this.repo.stelleMehrereWiederHer(ids);
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: ich.id, art: 'wiederhergestellt' as const, daten: { vorgang } })));
    for (const e of eintraege) await this.ereignis('mappe.wiederhergestellt', { mappe: e.id, typ: e.typId }, ich.id);
    await this.protokolliere(eintraege.map((e) => this.wiederEintrag(e, typen.get(e.typId), vorgang)), await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel(ids);
    let wieder = 0; let entfallen = verweiseEntfallen;
    for (const e of eintraege) if (e.entkoppelt.length) { const r = await this.verbindeWieder(e.id, e.entkoppelt, ich.id); wieder += r.wieder; entfallen += r.entfallen; }
    for (const typId of new Set(eintraege.map((e) => e.typId))) await this.passungFuer(typen.get(typId)!, eintraege.filter((e) => e.typId === typId).map((e) => e.id));
    protokoll.modul('ablage').info('Vorgang aus dem Papierkorb wiederhergestellt', { von: ich.id, vorgang, mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen || undefined });
    return { mappen: ids.length, verweiseWieder: wieder, verweiseEntfallen: entfallen, startId: ids.includes(vorgang) ? vorgang : null };
  }

  /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396) ---------- */

  async datenschutz(): Promise<Datenschutz> { return liesDatenschutz(await this.einstellungen?.lies('datenschutz')); }

  async setzeDatenschutz(eingabe: unknown, von: string): Promise<Datenschutz> {
    const sys = await this.kern.system();
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

  /**
   * Prüfliste einer Auskunft (#396, #472): Baum ab der Mappe des Betroffenen (Tiefe einstellbar, Vorgabe 2,
   * beide Richtungen, nach oben nie wieder nach unten, ohne Benutzer und Rollen), nur über Verweise der Art
   * Zugehörigkeit weiter – Bezug-Mappen stehen als Blatt da (`nurBezug`). Je Mappe Dokumente, Notizen,
   * Historie. Keine Volltext-Vorschläge mehr (#472); die Eingabe `vorschlaege` wird ignoriert.
   */
  async auskunftVorschau(e: unknown, z: Zugriff): Promise<AuskunftVorschau> {
    const o = (e ?? {}) as Record<string, unknown>;
    const mappeId = String(o.mappeId ?? '');
    const sys = await this.kern.system();
    const ohne = new Set([sys.benutzer.id, sys.rolle.id]);
    const baum = await this.baum(mappeId, { tiefe: o.tiefe, richtungen: o.richtungen, max: 1000, seitwaerts: false, ohneTypen: [...ohne], nurZugehoerigkeit: true }, z);
    const im = new Set(baum.knoten.map((k) => k.id));
    // „Daten Dritter?“: Nachbarn außerhalb der Sammlung, die selbst eine Person sind (Mappentyp „betrifft eine Person“).
    const person = new Set(personenTypen(await this.datenschutz()));
    const dritte = new Map(baum.knoten.map((k) => [k.id, [...new Set([...k.aussen.verweistAuf, ...k.aussen.verwiesenVon]
      .filter((a) => !!a.typId && person.has(a.typId) && !ohne.has(a.typId)).map((a) => a.titel))]] as [string, string[]]));
    const mappen = await this.auskunftInhalte([...im], z.typen, dritte);
    return { baum, mappen, frist: fristBis(heuteIn()) };
  }

  /**
   * Auskunft vorbereiten (#396): Auswahl gegen eine frische Sammlung prüfen und die Daten für die ZIP
   * zusammenstellen. Passwortfelder und verschlüsselte Werte fallen weg (auch aus den Mappentypen),
   * ältere Versionen von Dokumenten ebenso.
   */
  async auskunftDaten(e: unknown, z: Zugriff, x: { mandant: string; version: string }): Promise<AuskunftDaten> {
    const o = (e ?? {}) as Record<string, unknown>;
    if (o.geprueft !== true) throw new Fachfehler(422, t('meldungen.dienst.bitte-bestaetige-dass-du'));
    const vorschau = await this.auskunftVorschau({ mappeId: o.mappeId, tiefe: o.tiefe, richtungen: o.richtungen }, z);
    const bekannt = vorschau.mappen;
    const bezug = new Map(vorschau.baum.knoten.filter((k) => k.nurBezug && k.ueber).map((k) => [k.id, k] as const));
    const a = liesAuswahl(o.auswahl);
    const p = auskunftProbleme(a, bekannt, new Set(bezug.keys()));
    if (p.length) throw new Fachfehler(422, p.join(' '));
    // Bezug-Mappen (#472), die nicht ganz aufgenommen sind: nur Art, Titel und Feld.
    const erwaehnungen: AuskunftErwaehnung[] = a.erwaehnungen.filter((id) => !a.mappen.includes(id)).map((id) => bezug.get(id)!)
      .map((k) => ({ mappeId: k.id, typ: k.typ, titel: k.titel, feld: k.ueber!.feld, richtung: k.ueber!.richtung }));
    const passwort = typeof o.passwort === 'string' && o.passwort ? o.passwort : null;
    if (passwort && passwort.length < AUSKUNFT_PASSWORT_MIN) throw new Fachfehler(422, t('meldungen.dienst.das-passwort-fuer-die', { AUSKUNFT_PASSWORT_MIN }));
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
      // Nicht für Dritte (#683): Löschprotokoll, Synonyme und Automatisierungen betreffen den ganzen Haushalt.
      loeschprotokoll: undefined, synonyme: undefined, automatisierungen: undefined,
      dokumente: async (ids) => (await this.repo.dokumenteVon(ids)).filter((d) => dok.has(d.id)),
      versionen: async () => [],
      // Die Auskunft enthält die Dokumente, wie sie abgelegt sind – ohne Fassungen von Paketen (#577).
      fassung: undefined,
      archivfassung: undefined,
      notizen: async (ids) => (await this.repo.notizenVon(ids)).filter((n) => not.has(n.id)),
      aufgaben: async () => [], erinnerungen: async () => [], favoriten: async () => [],
      // Historie: ohne frühere Auskünfte (deren Begründungen sind intern); Mappen mit zurückgehaltenen
      // Notizen ohne Notiz-Einträge – die Historie nennt den Text einer Notiz.
      historie: async (ids) => (await this.repo.historieVon(ids)).filter((h) => hist.has(h.mappeId) && h.art !== 'auskunft' && !(h.art === 'notiz' && mitZurueckgehaltenen.has(h.mappeId))),
      passwort: () => null,
    };
    // Herkunft (Kanal der Post) und Speicherdauer (Archivmodus) für das Deckblatt.
    const post = (await this.kern.system()).post;
    const kanaele: Record<string, number> = {};
    for (const m of jeTyp.get(post.id) ?? []) { const k = auswahlText(m.werte.kanal) || 'unbekannt'; kanaele[k] = (kanaele[k] ?? 0) + 1; }
    const dokumente = (await this.repo.dokumenteVon(a.mappen)).filter((d) => dok.has(d.id));
    const ziele = mappen.flatMap((m) => [...verweiseVon(z.typen.get(m.typId)!, m.werte).map((v) => v.zielId), m.erstelltVon, m.geaendertVon].filter((v): v is string => !!v));
    const titel = Object.fromEntries(Object.entries(await this.maskiereBezuege(z, await this.repo.bezuege([...new Set(ziele)]))).map(([id, b]) => [id, b.titel]));
    return {
      titel,
      start: { id: start.id, titel: start.titel ?? '', typ: z.typen.get(start.typId)?.name ?? '' },
      datenschutz: ds, quelle, mappen, typen, kanaele, passwort,
      erwaehnungen,
      anzahl: { mappen: mappen.length, dokumente: dokumente.length, bytes: dokumente.reduce((s, d) => s + d.groesse, 0), notizen: not.size, historie: hist.size, ohneNotizen: a.ohneNotizen.filter((n) => !not.has(n.id)).length, erwaehnungen: erwaehnungen.length },
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
      text: t('meldungen.dienst.auskunft-nach-art-15', { mappen: n.mappen, wert: t('meldungen.dienst.mappen', { anzahl: n.mappen }), dokumente: n.dokumente, wert2: t('meldungen.dienst.dokumente', { anzahl: n.dokumente }) }),
      mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, historie: n.historie, ohneNotizen: n.ohneNotizen, ...(n.erwaehnungen ? { erwaehnungen: n.erwaehnungen } : {}),
      ...(d.gruende.length ? { gruende: d.gruende } : {}), verschluesselt: !!d.passwort, auskunft: info.id,
    });
    protokoll.modul('datenschutz').info('Auskunft erstellt', { mappeId: d.start.id, mappen: n.mappen, dokumente: n.dokumente, notizen: n.notizen, ohneNotizen: n.ohneNotizen, verschluesselt: !!d.passwort, mb: Math.round(info.bytes / MB), von: von.email });
  }

  /** Frist (#396): Aufgabe „Auskunft an … bis <Eingang + 1 Monat>“ am Betroffenen, für den Administrator. */
  async auskunftFrist(e: unknown, z: Zugriff, von: string): Promise<Aufgabe> {
    const o = (e ?? {}) as Record<string, unknown>;
    const m = await this.pruefeRecht(z, String(o.mappeId ?? ''), 'R');
    const eingang = typeof o.eingang === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.eingang) ? o.eingang : heuteIn();
    const bis = fristBis(eingang);
    const text = t('meldungen.dienst.auskunft-nach-art-15-2', { wert: m.titel || t('meldungen.dienst.ohne-titel'), datumText: datumText(bis), datumText2: datumText(eingang) });
    // feldKey (#668): so findet die Liste der Auskünfte die Antwortfrist wieder.
    const a = await this.neueAufgabe({ id: randomUUID(), mappeId: m.id, empfaengerId: von, art: 'manuell', feldKey: FRIST_SCHLUESSEL, text, datum: bis, erstellt: '', erstelltVon: von, erledigt: null, erledigtVon: null });
    await this.notiere(m.id, von, 'aufgabe', { text: t('meldungen.dienst.fuer', { name: await this.name(von), text }), aufgabe: a.id, aufgabenart: 'manuell', fuer: von, aufgabentext: text });
    return this.leiteUm(a);
  }

  /**
   * Liste der Auskünfte (#668): aus Historie (Nachweis auch nach dem Löschen der ZIP), bereitliegenden Dateien und
   * offenen Antwortfristen. `laufend`: der gerade erzeugte Auftrag (nur einer zur Zeit).
   */
  async auskunftVerzeichnis(bereit: AuskunftStand[], laufend?: { id: string; titel: string; gestartet: string } | null): Promise<AuskunftEintrag[]> {
    const historie = await this.repo.historieArt('auskunft', 2000);
    const fristen = (await this.repo.offeneAufgaben({})).filter((a) => a.art === 'manuell' && (a.feldKey === FRIST_SCHLUESSEL || a.text.startsWith(FRIST_TEXT_ANFANG)));
    const ids = [...new Set([...historie.map((h) => h.mappeId), ...historie.map((h) => h.benutzerId).filter((x): x is string => !!x), ...fristen.map((f) => f.mappeId)])];
    const titel = await this.repo.titelVon(ids);
    const namen = new Map([...titel].map(([k, v]) => [k, v.replace(/ \(ehemalig\)$/, '')]));
    return auskunftVerzeichnis({
      historie: historie.map((h) => ({ mappeId: h.mappeId, zeit: h.zeit, benutzerId: h.benutzerId, daten: h.daten as Record<string, unknown> })),
      bereit, titel, namen, laufend: laufend ?? null,
      fristen: fristen.map((f) => ({ id: f.id, mappeId: f.mappeId, mappeTitel: f.mappeTitel, datum: f.datum ?? null, erstellt: f.erstellt })),
    });
  }

  /** Nachweis (#668): Herunterladen bzw. Löschen einer Auskunft in der Historie der Person – ohne Inhalte. */
  async auskunftNotiz(stand: { id: string; mappeId: string }, von: string, art: 'download' | 'geloescht') {
    await this.notiere(stand.mappeId, von, 'auskunft', art === 'download'
      ? { text: t('meldungen.dienst.auskunft-heruntergeladen'), zustellung: 'download', auskunft: stand.id }
      : { text: t('meldungen.dienst.auskunft-geloescht'), geloescht: true, auskunft: stand.id });
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
  async auskunftPerEmail(stand: AuskunftStand & { name: string }, datei: () => Promise<Readable>, eingabe: unknown, ich: { id: string; name: string; email: string }, mailer: Mailer | null) {
    if (!mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-2'));
    if (!stand.verschluesselt) throw new Fachfehler(422, t('meldungen.dienst.per-e-mail-geht'));
    if (stand.bytes > EMAIL_MAX_ANHAENGE) throw new Fachfehler(413, t('meldungen.dienst.die-auskunft-ist-mit', { round: Math.round(stand.bytes / 1e6), round2: Math.round(EMAIL_MAX_ANHAENGE / 1e6) }));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const vorlage = auskunftMail.zip((await this.datenschutz()).anrede);
    const { an, betreff, nachricht } = AusgangEmail.emailKopf({ betreff: vorlage.betreff, nachricht: vorlage.nachricht, ...e });
    const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
    try {
      await mailer.sende(an.join(', '), betreff, nachricht, { antwortAn, anhaenge: [{ name: `${stand.name}.zip`, mime: 'application/zip', inhalt: await datei() }] });
    } catch (x) {
      throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-wurde', { message: (x as Error).message }));
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.auskunft-per-e-mail', { an: an.join(', '), max: Math.max(1, Math.round(stand.bytes / KB)) }), zustellung: 'email', an, betreff, auskunft: stand.id, bytes: stand.bytes });
    protokoll.modul('datenschutz').info('Auskunft per E-Mail gesendet', { mappeId: stand.mappeId, empfaenger: an.length, mb: Math.round(stand.bytes / MB), von: ich.email });
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
    if (e.senden && !x.mailer) throw new Fachfehler(409, t('meldungen.dienst.der-e-mail-versand-3'));
    if (e.senden && !istEmail(e.an)) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-gueltige-e'));
    if (!x.adresse) throw new Fachfehler(409, t('meldungen.dienst.die-adresse-von-ablago'));
    for (const alt of await this.repo.auskunftLinks({ auskunftId: stand.id })) {
      if (linkStatus(alt) === 'aktiv' && (await this.repo.widerrufeAuskunftLink(alt.id))) await this.notiere(alt.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen-ersetzt'), zustellung: 'link', link: alt.id, auskunft: stand.id });
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
      const m = auskunftMail.link(ds.anrede, url, bis, link.maxAbrufe, ds.verantwortlicher);
      const antwortAn = ich.name ? `"${ich.name.replace(/["\\]/g, '')}" <${ich.email}>` : ich.email;
      try { await x.mailer!.sende(e.an, m.betreff, m.nachricht, { antwortAn }); } catch (f) {
        await this.repo.widerrufeAuskunftLink(link.id);
        throw new Fachfehler(502, t('meldungen.dienst.die-e-mail-mit', { message: (f as Error).message }));
      }
    }
    await this.notiere(stand.mappeId, ich.id, 'auskunft', {
      text: t('meldungen.dienst.abruf-link-erstellt-gueltig', { anzahl: link.maxAbrufe, bis, wert: e.senden ? t('meldungen.dienst.per-e-mail-an', { an: e.an }) : '', wert2: link.codeArt === 'eigen' ? t('meldungen.dienst.eigener-abrufcode') : '' }),
      zustellung: 'link', link: link.id, auskunft: stand.id, ablauf: link.ablauf, maxAbrufe: link.maxAbrufe, ...(e.senden ? { an: [e.an] } : {}),
    });
    protokoll.modul('datenschutz').info('Abruf-Link erstellt', { mappeId: stand.mappeId, link: link.id, tage: e.tage, abrufe: e.abrufe, code: link.codeArt, mail: e.senden, von: ich.email });
    const { schluessel: _s, code: _c, ...ohne } = link;
    // Eigener Code: so zurück, wie er eingegeben wurde (#666) – der Abruf vergleicht ohnehin normiert.
    return { link: ohne as AuskunftLink, url, code: e.codeWieEingegeben ?? code, gesendet: e.senden };
  }

  /** Zurückziehen (#455): Der Link gilt sofort nicht mehr; die Zeile bleibt als Nachweis. */
  async auskunftLinkWiderrufen(id: string, ich: { id: string; email: string }): Promise<AuskunftLink> {
    const [l] = await this.repo.auskunftLinks({ id, max: 1 });
    if (!l) throw new Fachfehler(404, t('meldungen.dienst.diesen-abruf-link-gibt'));
    if (await this.repo.widerrufeAuskunftLink(id)) {
      await this.notiere(l.mappeId, ich.id, 'auskunft', { text: t('meldungen.dienst.abruf-link-zurueckgezogen'), zustellung: 'link', link: id, auskunft: l.auskunftId });
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
  async auskunftAbrufPruefen(schluessel: unknown, code: unknown, platz: () => (() => void) | null = () => () => {}): Promise<{ art: 'ok' | 'falsch' | 'ungueltig' | 'beschaeftigt'; link?: AuskunftLinkIntern }> {
    const s = typeof schluessel === 'string' && SCHLUESSEL_MUSTER.test(schluessel) ? schluessel : null;
    const c = normiereCode(code);
    const link = s ? await this.repo.auskunftLinkPerSchluessel(hasheSchluessel(s)) : undefined;
    // Ohne gültigen Link kein scrypt: Den 256-Bit-Schlüssel kann niemand erraten, ein gleicher Zeitaufwand
    // schützt hier nichts – er würde nur die Abrufseite zum Hebel für Last machen.
    if (!link || link.gesperrt || link.fehlversuche >= LINK_FEHLVERSUCHE_MAX) return { art: 'falsch' };
    // Je Link nur eine Prüfung gleichzeitig: Parallele Versuche könnten sonst alle vor dem Hochzählen
    // lesen und so mehr als LINK_FEHLVERSUCHE_MAX Codes ausprobieren.
    // Und insgesamt nur wenige scrypt-Prüfungen gleichzeitig (Platz vergibt die Bremse der Route).
    const frei = platz();
    if (!frei) return { art: 'beschaeftigt' };
    // Belegt in der Datenbank (#744), damit auch ein zweiter Prozess wartet; die Frist gibt den Platz frei, falls ein
    // Prozess mittendrin endet.
    if (!(await this.kurzzustand.belege(ABRUF_PRUEFUNG, link.id, ABRUF_PRUEFUNG_MS).catch((e) => { frei(); throw e; }))) { frei(); return { art: 'beschaeftigt' }; }
    try { return await this.auskunftAbrufCode(link, c); } finally { await this.kurzzustand.loesche(ABRUF_PRUEFUNG, link.id).catch(() => {}); frei(); }
  }

  private async auskunftAbrufCode(link: AuskunftLinkIntern, c: string): Promise<{ art: 'ok' | 'falsch' | 'ungueltig'; link?: AuskunftLinkIntern }> {
    if (!c || !(await pruefePasswort(c, link.code))) {
      const f = await this.repo.auskunftLinkFehlversuch(link.id, LINK_FEHLVERSUCHE_MAX);
      const gesperrt = !!f?.gesperrt;
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-fehlgeschlagen-falscher', { wert: gesperrt ? t('meldungen.dienst.link-nach-fehlversuchen-gesperrt', { fehlversuche: f!.fehlversuche }) : '' }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      if (gesperrt) {
        protokoll.modul('datenschutz').warn('Abruf-Link nach Fehlversuchen gesperrt', { mappeId: link.mappeId, link: link.id, versuche: f!.fehlversuche });
        await this.auskunftMelden(link, t('meldungen.dienst.abruf-link-fuer-die', { wert: link.titel || t('meldungen.dienst.ohne-titel'), fehlversuche: f!.fehlversuche }), 'gesperrt');
      }
      return { art: 'falsch', link };
    }
    const st = linkStatus(link);
    if (st !== 'aktiv') {
      await this.notiere(link.mappeId, null, 'auskunft', { text: t('meldungen.dienst.abruf-versucht-aber-der', { LINK_STATUS: LINK_STATUS[st] }), zustellung: 'abruf', erfolg: false, link: link.id, auskunft: link.auskunftId });
      return { art: 'ungueltig', link };
    }
    return { art: 'ok', link };
  }

  async auskunftLinkMitId(id: string): Promise<AuskunftLinkIntern | undefined> { return (await this.repo.auskunftLinks({ id, max: 1 }))[0]; }

  /** Einen Abruf zählen, solange der Link gilt (atomar); null = gilt nicht mehr. */
  auskunftAbrufZaehlen(id: string): Promise<number | null> { return this.repo.auskunftLinkAbruf(id); }

  /** Nachweis eines Abrufs (#455): Historie und Benachrichtigung an Ersteller und Favoriten-Inhaber. */
  async auskunftAbgerufen(link: AuskunftLink, nr: number, vollstaendig: boolean, standVon?: string) {
    await this.notiere(link.mappeId, null, 'auskunft', {
      text: vollstaendig ? t('meldungen.dienst.auskunft-abgerufen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }) : t('meldungen.dienst.abruf-abgebrochen-von-hoechstens', { nr, maxAbrufe: link.maxAbrufe }),
      zustellung: 'abruf', erfolg: vollstaendig, link: link.id, auskunft: link.auskunftId, nr,
    });
    if (vollstaendig) await this.auskunftMelden(link, t('meldungen.dienst.auskunft-an-wurde-abgerufen', { wert: link.titel || t('meldungen.dienst.ohne-titel') }), 'abgerufen', standVon);
  }

  /**
   * Benachrichtigung (#455) als Aufgabe „Auskunft“ an der Mappe der Person: an den, der den Link erstellt
   * hat, den Ersteller der Auskunft und alle, die die Person als Favorit haben (Stern = Abo, #422).
   * Gebündelt: Solange eine solche Aufgabe offen ist, kommt für denselben Link keine zweite.
   */
  private async auskunftMelden(link: AuskunftLink, text: string, anlass: 'abgerufen' | 'gesperrt', standVon?: string) {
    // Favorit = Abo (#422): nur Favoriten mit eingeschalteter Benachrichtigung.
    const fav: string[] = [];
    for (const f of await this.repo.favoritenDerMappe(link.mappeId)) {
      if (f.benachrichtigen && await this.persoenlichAn(f.benutzerId, 'favoriten_benachrichtigen')) fav.push(f.benutzerId);
    }
    let an = [...new Set([link.erstelltVon, standVon, ...fav].filter((x): x is string => !!x && istUuid(x)))];
    if (this.konten?.benutzer) { const aktiv = new Set((await this.konten.benutzer()).filter((b) => b.aktiv).map((b) => b.id)); an = an.filter((id) => aktiv.has(id)); }
    const key = `${anlass}:${link.id}`;
    const offen = (await this.repo.offeneAufgaben({ mappeIds: [link.mappeId] })).filter((a) => a.art === 'auskunft' && a.feldKey === key);
    for (const id of an) {
      if (offen.some((a) => a.empfaengerId === id)) continue;
      const a = await this.neueAufgabe({ id: randomUUID(), mappeId: link.mappeId, empfaengerId: id, art: 'auskunft', feldKey: key, text: text.slice(0, AUFGABE_MAX), erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null });
      await this.leiteUm(a);
    }
  }

  /** Dürfen Benutzer ihre Daten selbst exportieren (#255)? Ab Werk aus (#884): nur bei ausdrücklich `true`. */
  async persoenlicherExportErlaubt(): Promise<boolean> { return (await this.einstellungen?.lies('persoenlicher_export')) === true; }
  async setzePersoenlicherExport(an: unknown, von: string) {
    await this.einstellungen?.schreibe('persoenlicher_export', an === true);
    protokoll.modul('werkbank').info(an === true ? '„Meine Daten exportieren“ erlaubt' : '„Meine Daten exportieren“ abgeschaltet', { von });
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

  private pruefeArchivDokument(mappeId: string, was: string) { return this.mappenArchiv.pruefeArchivDokument(mappeId, was); }
  archivVorschau(typId: string, e: unknown) { return this.mappenArchiv.archivVorschau(typId, e); }
  darfWeg() { return this.mappenArchiv.darfWeg(); }
  pruefeDateien(von: string) { return this.mappenArchiv.pruefeDateien(von); }

  /* ---------- Fehlende Dateien (#877, dokumente/fehlende-dateien.ts) ---------- */

  merkeFehlendeDatei(f: { sha256: string; pfad: string; ablage: string }) { return this.dateienFehlen.merkeFehlendeDatei(f); }
  private schreibeFehlendeDateien(shas: string[]) { return this.dateienFehlen.schreibeFehlendeDateien(shas); }
  fehlendeDateien(): Promise<number> { return this.dateienFehlen.fehlendeDateien(); }
  dokumenteOhneDatei(): Promise<{ dateien: number; fehlend: number; dokumente: number }> { return this.dateienFehlen.dokumenteOhneDatei(); }

  /* ---------- Versionierung (#194, dokumente/versionen.ts) ---------- */

  ersetzeDokument(id: string, e: { name?: string; typ?: string; herkunft?: Herkunft }, inhalt: unknown, benutzerId: string | null): Promise<Dokument> { return this.dokumentVersionen.ersetzeDokument(id, e, inhalt, benutzerId); }
  holeVersionZurueck(id: string, nummer: number, benutzerId: string | null): Promise<Dokument> { return this.dokumentVersionen.holeVersionZurueck(id, nummer, benutzerId); }
  versionen(id: string) { return this.dokumentVersionen.versionen(id); }
  versionInhalt(id: string, nummer: number) { return this.dokumentVersionen.versionInhalt(id, nummer); }
  private beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) { return this.dokumentVersionen.beruehre(mappeId, typ, benutzerId); }
}
