import type { Abrufweg, Abruffassung, Modusspur, Systemkonto, Aufgabe, FallOhneLeserecht, Benutzer, Dokument, Herkunft, Notiz, Historieneintrag, Mappe, Mappentyp, MappenBezug, Wert, Werte } from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import { Auftraege } from './auftrag';
import { kontext, protokoll } from './protokoll';
import { EIGENE_MAPPEN, Haushaltsstand, MINDESTENS_MS, NUR_FAVORITEN, ZAEHLT_FUER_TERMINE, type Gueltigkeit } from './zaehlerspeicher';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { Fachfehler } from './fehler';
import { aufkleberPdf, ETIKETTEN } from './aufkleber';
import { istVerschluesselt, type Betroffen, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { type NeueMappe, type Repo } from './repo';
import { type Sicht } from '../../shared/src/sichten';
import type { ExportQuelle } from './vollexport';
import { type BaumQuelle } from './baum';
import { type Baum } from '../../shared/src/baum';
import { type LoeschVorschau } from '../../shared/src/loeschbaum';
import { type AuskunftVorschau, type Datenschutz } from '../../shared/src/auskunft';
import type { AuskunftEintrag, AuskunftLink } from '../../shared/src/auskunft';
import { type LoeschEintrag } from '../../shared/src/loeschprotokoll';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import type { Nummernkreis } from '../../shared/src/nummernkreis';
import { type StempelTyp } from '../../shared/src/stempel';
import { type InstalliertesPaket, type KiUebersicht, type BeispielStand } from '../../shared/src/pakete';
import { type FassungInfo } from '../../shared/src/dateiumwandlung';
import type { Dateiumwandlung, FassungsAblage, UmwandlungsAnbindung } from './dateiumwandlung';
import { PaketVolltext } from './paketvolltext';
import type { ArchivAblage, ArchivAnbindung, Archivfassung } from './archivfassung';
import type { EntsperrenAnbindung, PdfEntsperren } from './entsperren';
import type { AusDokument } from '../../shared/src/erkennung';
import { FragenAnDieAblage } from './fragen';
import { Uebersetzung } from './uebersetzung';
import { Erkennung, sichereZuordnung, type PostErkennung } from './erkennung';
import { type FavoritenFreigabe } from '../../shared/src/favoritenfreigabe';
import { t } from './sprache';
import { Ereignisverteiler } from './ereignisse';
import { Eingang } from './hochladen';
import { type Ausloeser as EreignisAusloeser, type KatalogArt, type KatalogEreignis } from '../../shared/src/ereignisse';
import { fristFelder, type Erinnerung, type Termin } from '../../shared/src/fristen';
import type { Regelwerk, Mappenquelle, Recht, Rechte } from '../../shared/src/rechte';
import { EMAIL_MAX_ANHAENGE } from './grenzen';
import { SucheDienst } from './suche';
import { ZugriffDienst } from './zugriff';
import { ABO_ARTEN, Kern, PAPIERKORB_STANDARD_TAGE, type Anlass, type SystemIds, type Zugreifender, type Zugriff } from './kern';
import { Systemausstattung } from './systemausstattung';
import { behalteBeschriftungen, bereinigeFeld, bereinigeTyp, KiTypen, MappentypenDienst, Nummernkreise, Passung, Systemtypen, TypPakete, type Benutzerspiegel } from './mappentypen';
export { bereinigeFeld, bereinigeTyp, behalteBeschriftungen };
export type { Benutzerspiegel };
export { ABO_ARTEN, PAPIERKORB_STANDARD_TAGE };
export type { Anlass, LeserechtAufZeit, Zugriff } from './kern';
import { paketEinstellungen } from './pakete/index';
import { keinSchluessel, MappenArchiv, MappenDienst, MappenEingaben, MappenHinweise, MappenHistorie, MappenNotizen, MappenTitel, Passwortfelder } from './mappen';
export { ARCHIV_PRAEFIX, archivnummerAus, HISTORIE_SEITE_MAX, HISTORIE_STANDARD_TAGE } from './mappen';
import { DokumentArchivfassung, DokumenteDienst, DokumentUmwandlung, DokumentVersionen, erkenneAnzeigbar, FehlendeDateien, GeschuetztePdfs, type TexterkennungAnbindung } from './dokumente';
export { erkenneAnzeigbar };
export type { TexterkennungAnbindung };
import { SichtenDienst, SichtenVerwaltung, sortierungAus, Systemsichten, type Zaehlerzahlen } from './sichten';
export { sortierungAus };
export type { Zaehlerzahlen };
import { BerechtigungenDienst } from './berechtigungen';
import { PdfBearbeiten, PdfVerkleinern, Schwaerzen, Stempelvorlagen } from './pdf-bearbeiten';
export { GROSSE_MAX, GROSSE_MIT_SCHAETZUNG, VERKLEINERN_STANDARD, verkleinernEinstellungAus, type VerkleinernEinstellung } from './pdf-bearbeiten';
import { Eingangskanaele, PostAufloesen, PostDienst, PostFotos, PostSystemmappen } from './post';
export type { Fundstelle, SystemkontoEintrag } from './post';
import { type Ausgang, AusgangDienst, AusgangEmail, AusgangExport } from './ausgang';
export { EMAIL_MAX_EMPFAENGER, EMAIL_MAX_MAPPEN } from './ausgang';
import { type EreignisAufruf, VOLLTEXT_MAX, VolltextAusPaketen, VolltextDienst, type VolltextMeldung } from './volltext';
import { Automatisierungshilfen, EreignisseDienst } from './ereignisse/index';
import { AufgabenDienst, type AufgabenTeile, AufgabenVertretung, Fristen, OhneEmpfaenger, OhneLeserecht } from './aufgaben';
export { NAECHSTER_TERMIN_ERST_TAGE, SAMMEL_MAX, SAMMEL_WEITERGABE, taugtAlsAufgabenEmpfaenger } from './aufgaben';
import { BeispielMappen, type DokumentImKorb, LoeschenDienst, type LoeschenTeile, LoeschprotokollVerwaltung, MitVerknuepften, Papierkorb } from './loeschen';
export type { AufgeloestIn, DokumentImKorb } from './loeschen';
import { AuskunftZustellen, DatenschutzDienst, type DatenschutzTeile, VollexportQuellen } from './datenschutz';
import { WerkbankDienst } from './werkbank';
import { OrganisationDienst } from './organisation';
import { TextsatzDienst } from './textsatz';
import { ORGANISATION_BEREICH } from '../../shared/src/organisation';
import type { MailText } from './mail';
export { VOLLTEXT_MAX };
export type { EreignisAufruf, VolltextMeldung };
export type { KatalogSchluessel, PaketQuelleEintrag } from './pakete/index';

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

/* ---------- Fachlogik ---------- */

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
  /** KI-Dienste und Mappentypen (#796, #1078). */
  readonly ki: KiTypen;
  /** Notizen (#55, #1078). */
  readonly mappenNotizen: MappenNotizen;
  /** Hinweise von Paketen an Mappen (#1034). */
  readonly mappenHinweise: MappenHinweise;
  /** Ereignisse an Pakete, Aufträge, neue Aufgaben und Verknüpfungen melden (#670, #1078). */
  readonly ereignisseDienst: EreignisseDienst;
  /** Hilfen für Automatisierungen (#674, #1078). */
  readonly automatisierungshilfen: Automatisierungshilfen;
  /** Aufgaben (#54, #56, #1078): Empfänger, Erwähnungen, aus Automatisierungen, nach Anlass erledigen. */
  readonly aufgaben: AufgabenDienst;
  /** Vertretung und Bearbeiten von Aufgaben (#77, #78, #415, #1078). */
  readonly vertretung: AufgabenVertretung;
  /** Aufgaben bei Personen ohne Leserecht (#798, #1078). */
  readonly ohneLeserecht: OhneLeserecht;
  /** Fristen, Erinnerungen und Termine (#129, #528, #1078). */
  readonly fristen: Fristen;
  /** Aufgaben ohne Empfänger, Favoriten benachrichtigen (#719, #422, #1078). */
  readonly ohneEmpfaenger: OhneEmpfaenger;
  /** Mappen löschen (#79, #150, #1078). */
  readonly loeschen: LoeschenDienst;
  /** Papierkorb (#43, #344, #1078). */
  readonly papierkorbVerwaltung: Papierkorb;
  /** Löschprotokoll lesen und verwalten (#470, #1078). */
  readonly loeschprotokollVerwaltung: LoeschprotokollVerwaltung;
  /** Mappe mit verknüpften Mappen löschen, Baum-Sammlung (#396, #424, #1078). */
  readonly mitVerknuepften: MitVerknuepften;
  /** Beispiel-Mappen aus Paketen (#878, #1078). */
  readonly beispielMappen: BeispielMappen;
  /** Datenschutz: Auskunft, Demo-Daten (#396, #248, #1078). */
  readonly datenschutzDienst: DatenschutzDienst;
  /** Datenquellen für Voll- und persönlichen Export (#254, #255, #1078). */
  readonly vollexport: VollexportQuellen;
  /** Auskunft zustellen (#455, #1078). */
  readonly auskunftZustellen: AuskunftZustellen;
  /** Ansicht der Werkbank (#281, #1078). */
  readonly werkbank: WerkbankDienst;
  /** Eigene Organisation (#995): Angaben mit der festen Liste, Werkbank-Bereich, Notizen an die Verwaltung. */
  readonly organisation: OrganisationDienst;
  private textsatzDienst?: TextsatzDienst;
  /** Text setzen (#1040): Brief aus einer Text-Vorlage als PDF – beim ersten Gebrauch gebaut. */
  get textsatz(): TextsatzDienst {
    return this.textsatzDienst ??= new TextsatzDienst(this.kern, this.rechtepruefung, {
      organisation: () => this.organisation.geltende(), mitnehmbar: (ich, z, ids) => this.mitnehmbar(ich, z, ids),
      ladeHoch: (id, e, inhalt, von) => this.ladeHoch(id, { ...e, herkunft: 'vorlage' }, inhalt, von),
      darfAblegen: async (z, id) => { const m = await this.repo.holeMappe(id); return !!m && (await this.rechtepruefung.rechteAn(z, m)).U; },
    });
  }
  /** Mail an die Verwaltenden eines Bereichs (#995) – beim Start verbunden (ablago.ts), sonst keine. */
  private verwaltungsmail?: (bereich: string) => (betreff: MailText, text: MailText) => Promise<void>;

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
    this.mappen = new MappenDienst(this.kern, this.rechtepruefung, { historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben, hinweise: this.mappenHinweise = new MappenHinweise(this.kern, this.rechtepruefung) }, {
      konten: () => this.konten, favoritenBenachrichtigungErlaubt: (id) => this.favoritenBenachrichtigungErlaubt(id), ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserechtText(liste, lesbar, ich),
      mitArchivStand: (d) => this.mitArchivStand(d), mitPdfSchutz: (d) => this.mitPdfSchutz(d), datenschutz: () => this.datenschutz(),
      loeschPruefung: (m, typ, rueck, alleTypen) => this.loeschPruefung(m, typ, rueck, alleTypen), meldeVerknuepft: (typ, id, alt, neu, von) => this.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), aktualisiereTitel: (ids) => this.aktualisiereTitel(ids), organisationGeaendert: (e) => this.organisation.geaendert(e),
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
    ({ ki: this.ki, notizen: this.mappenNotizen, ereignisse: this.ereignisseDienst, automatisierung: this.automatisierungshilfen, aufgaben: this.aufgaben, vertretung: this.vertretung, ohneLeserecht: this.ohneLeserecht, fristen: this.fristen, ohneEmpfaenger: this.ohneEmpfaenger,
      loeschen: this.loeschen, papierkorb: this.papierkorbVerwaltung, protokoll: this.loeschprotokollVerwaltung, verknuepft: this.mitVerknuepften, beispiele: this.beispielMappen, datenschutz: this.datenschutzDienst, vollexport: this.vollexport, zustellen: this.auskunftZustellen, werkbank: this.werkbank, organisation: this.organisation } = this.baueAufgabenUndLoeschen());
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
   * Ereignisse, Aufgaben, Löschen, Datenschutz und Werkbank (#1078): erst die tieferen Klassen, dann die, die sie brauchen.
   */
  private baueAufgabenUndLoeschen() {
    const e = this.baueEreignisse();
    const a = this.baueAufgaben(e.ereignisse);
    const { teile: l, beispiele } = this.baueLoeschen();
    const d = this.baueDatenschutz(e.ereignisse, a.vertretung, l);
    return {
      ...e, aufgaben: a.aufgaben, vertretung: a.vertretung, ohneLeserecht: a.ohneLeserecht, fristen: a.fristen, ohneEmpfaenger: a.ohneEmpfaenger,
      loeschen: l.loeschen, papierkorb: l.papierkorb, protokoll: l.protokoll, verknuepft: l.verknuepft, beispiele, ...d, werkbank: new WerkbankDienst(this.kern),
    };
  }

  /**
   * KI-Freigabe, Notizen, Ereignisse und Hilfen für Automatisierungen (#1078): die Klassen in mappentypen/, mappen/ und
   * ereignisse/. Ereignis auslösen, Erwähnungen, Übersetzungen, Rollen und die Texterkennung gehen über die Fassade.
   */
  private baueEreignisse() {
    const ki = new KiTypen(this.kern, this.rechtepruefung);
    const notizen = new MappenNotizen(this.kern, this.mappenHistorie, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), erwaehnungenAbgleichen: (...a) => this.erwaehnungenAbgleichen(...a), uebersetzung: () => this.uebersetzung,
    });
    const ereignisse = new EreignisseDienst(this.kern, { rechte: this.rechtepruefung, typpakete: this.typpakete, ki }, {
      ereignis: (art, daten, von) => this.ereignis(art, daten, von), ereignisWecker: () => this.ereignisWecker,
      nachTexterkennungsEreignis: (paket, e, r) => this.nachTexterkennungsEreignis(paket, e, r),
    });
    const automatisierung = new Automatisierungshilfen(this.kern, this.rechtepruefung, { listeRollen: () => this.listeRollen() });
    return { ki, notizen, ereignisse, automatisierung };
  }

  /** Aufgaben (#1078): die Klassen in aufgaben/ kennen einander über `teile`; Ereignis, Konten und Gültigkeit über den Anschluss. */
  private baueAufgaben(ereignisse: EreignisseDienst) {
    const teile = { rechte: this.rechtepruefung, historie: this.mappenHistorie, mappen: this.mappen, ereignisse, systemmappen: this.postSystemmappen } as AufgabenTeile;
    const anschluss = { ereignis: (...a: Parameters<Kern['ereignis']>) => this.ereignis(...a), konten: () => this.konten, gueltigkeit: () => this.gueltigkeit() };
    teile.aufgaben = new AufgabenDienst(this.kern, teile, anschluss);
    teile.vertretung = new AufgabenVertretung(this.kern, teile, anschluss);
    teile.ohneLeserecht = new OhneLeserecht(this.kern, teile, anschluss);
    teile.fristen = new Fristen(this.kern, teile, anschluss, { stand: this.stand, mappenstand: this.mappenstand });
    teile.ohneEmpfaenger = new OhneEmpfaenger(this.kern, teile, anschluss);
    return teile;
  }

  /** Löschen (#1078): die Klassen in loeschen/ kennen einander über `teile`; Ereignis, Titel und Konten über den Anschluss. */
  private baueLoeschen() {
    const teile = {
      rechte: this.rechtepruefung, passung: this.passung, historie: this.mappenHistorie, dokumente: this.dokumente, versionen: this.dokumentVersionen,
      ausgang: this.ausgang, sichten: this.sichten, systemmappen: this.postSystemmappen,
    } as LoeschenTeile;
    const anschluss = { ereignis: (...a: Parameters<Kern['ereignis']>) => this.ereignis(...a), aktualisiereTitel: (ids: string[]) => this.aktualisiereTitel(ids), konten: () => this.konten };
    teile.loeschen = new LoeschenDienst(this.kern, teile, anschluss);
    teile.papierkorb = new Papierkorb(this.kern, teile, anschluss);
    teile.protokoll = new LoeschprotokollVerwaltung(this.kern, teile);
    teile.verknuepft = new MitVerknuepften(this.kern, teile, anschluss);
    return { teile, beispiele: new BeispielMappen(this.kern, teile) };
  }

  /** Datenschutz (#1078): die Klassen in datenschutz/ kennen einander über `teile`; Konten, Kurzzustand und Tresor über den Anschluss. */
  private baueDatenschutz(ereignisse: EreignisseDienst, vertretung: AufgabenVertretung, loeschen: LoeschenTeile) {
    // Eigene Organisation (#995): vor dem Datenschutz, der den Verantwortlichen von dort nimmt.
    const organisation = new OrganisationDienst(this.kern, { mappen: () => this.mappen, anVerwaltende: () => this.verwaltungsmail?.(ORGANISATION_BEREICH) });
    const teile = {
      organisation, rechte: this.rechtepruefung, historie: this.mappenHistorie, mappen: this.mappen, dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung,
      archiv: this.dokumentArchiv, sichten: this.sichten, ereignisse, vertretung, verknuepft: loeschen.verknuepft, loeschprotokoll: loeschen.protokoll,
    } as DatenschutzTeile;
    const anschluss = { konten: () => this.konten, kurzzustand: () => this.kurzzustand, tresor: () => this.tresor, automatisierungenExport: () => this.automatisierungenExport };
    teile.datenschutz = new DatenschutzDienst(this.kern, teile, anschluss);
    teile.vollexport = new VollexportQuellen(this.kern, teile, anschluss);
    return { datenschutz: teile.datenschutz, vollexport: teile.vollexport, zustellen: new AuskunftZustellen(this.kern, teile, anschluss), organisation };
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
    // Ist Teil einer anderen Mappe (#1031) umgeschaltet: aus den Ansichten heraus bzw. wieder mit eigener Ansicht.
    a.typGeaendert.anmelden('sichten.teile', async ({ alt, typ }) => { await this.sichtenVerwaltung.teilUmgeschaltet(alt, typ); });
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
  vektorNachlauf(paket: string, modell: string, max: number, nach: string | null): Promise<string[]> { return this.ereignisseDienst.vektorNachlauf(paket, modell, max, nach); }

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion (Kern). */
  private get repo(): Repo { return this.kern.repo; }

  /** Schlüssel wechseln (#47): alle Passwortfelder, der Papierkorb und die Einstellungen in einer Transaktion. */
  async schluesselWechseln(von: string) {
    if (!this.tresor) throw new Fachfehler(404, t('meldungen.dienst.die-verschluesselung-ist-nicht'));
    return this.tresor.wechsle((um, einstellungen) => this.repo.umschluesseln(um, einstellungen), von);
  }

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) { this.konten = h; }
  /** Mail an die Verwaltenden eines Bereichs anbinden (#995: Notiz zur eigenen Organisation). */
  verbindeVerwaltungsmail(f: (bereich: string) => (betreff: MailText, text: MailText) => Promise<void>) { this.verwaltungsmail = f; }

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

  private entsperrtZu = (inhalt: Buffer): Promise<Buffer | null> => this.geschuetztePdfs.entsperrtZu(inhalt);

  /* ---------- Dateien umwandeln (#577, dokumente/umwandeln.ts) ---------- */

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

  /* ---------- Aufgaben (#54) und Erwähnungen (#56), aufgaben/aufgaben.dienst.ts ---------- */

  /** Anzeigename eines Benutzers (auch für Platzhalter in Automatisierungen, #678). */
  name(benutzerId: string | null): Promise<string> { return this.kern.name(benutzerId); }
  private pruefeErwaehnungen(...a: Parameters<AufgabenDienst['pruefeErwaehnungen']>) { return this.aufgaben.pruefeErwaehnungen(...a); }
  private erwaehnungenAbgleichen(...a: Parameters<AufgabenDienst['erwaehnungenAbgleichen']>) { return this.aufgaben.erwaehnungenAbgleichen(...a); }

  /* ---------- Abwesenheit und Vertretung (#77, #78), aufgaben/vertretung.ts ---------- */

  empfaengerAufloesen(id: string | null): Promise<{ ziel: string | null; abwesende: string[] }> { return this.vertretung.empfaengerAufloesen(id); }
  private leiteUm(a: Aufgabe): Promise<Aufgabe> { return this.vertretung.leiteUm(a); }
  private passungsAufgaben(liste: Array<{ id: string; problem: string | null }>) { return this.vertretung.passungsAufgaben(liste); }
  aufgabenUebergeben(id: string, an: string, von: string | null): Promise<number> { return this.vertretung.aufgabenUebergeben(id, an, von); }
  abwesenheitGeaendert(...a: Parameters<AufgabenVertretung['abwesenheitGeaendert']>) { return this.vertretung.abwesenheitGeaendert(...a); }
  legeAufgabeAn(mappeId: string, e: unknown, von: string | null): Promise<Aufgabe> { return this.vertretung.legeAufgabeAn(mappeId, e, von); }
  private eigeneAufgabe(id: string, ich: { id: string; rolle: string }) { return this.vertretung.eigeneAufgabe(id, ich); }
  erledigeAufgabe(id: string, ich: { id: string; rolle: string }) { return this.vertretung.erledigeAufgabe(id, ich); }
  delegiereAufgabe(id: string, an: unknown, ich: { id: string; rolle: string }) { return this.vertretung.delegiereAufgabe(id, an, ich); }
  aufgabenWeitergeben(ids: unknown, an: unknown, ich: { id: string; rolle: string }) { return this.vertretung.aufgabenWeitergeben(ids, an, ich); }
  aufgabenErledigen(ids: unknown, ich: { id: string; rolle: string }) { return this.vertretung.aufgabenErledigen(ids, ich); }
  benachrichtigeGebuendelt(...a: Parameters<AufgabenVertretung['benachrichtigeGebuendelt']>) { return this.vertretung.benachrichtigeGebuendelt(...a); }
  meineAufgaben(ich: { id: string; rolle: string }, z?: Zugriff) { return this.vertretung.meineAufgaben(ich, z); }

  /* ---------- Aufgaben bei Personen ohne Leserecht (#798), aufgaben/ohne-leserecht.ts ---------- */

  private ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]> { return this.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich); }
  zugriffVon(benutzerId: string): Promise<Zugriff | null> { return this.ohneLeserecht.zugriffVon(benutzerId); }
  regulaerSichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> { return this.ohneLeserecht.regulaerSichtbarFuer(benutzerId, ids); }
  faelleAbgleichen(f: { mappeIds?: string[] } = {}): Promise<{ neu: number; beendet: number }> { return this.ohneLeserecht.faelleAbgleichen(f); }
  offeneFaelle(): Promise<FallOhneLeserecht[]> { return this.ohneLeserecht.offeneFaelle(); }
  faelleUebersicht(): Promise<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] }> { return this.ohneLeserecht.faelleUebersicht(); }
  leserechtAufZeitGeben(fallId: unknown, von: string | null): Promise<FallOhneLeserecht> { return this.ohneLeserecht.leserechtAufZeitGeben(fallId, von); }
  alleAufgaben(erledigt = false) { return this.ohneLeserecht.alleAufgaben(erledigt); }
  aufgabenVon(mappeId: string) { return this.ohneLeserecht.aufgabenVon(mappeId); }

  /* ---------- Fristen (#129–#133), aufgaben/fristen.ts ---------- */

  fristenAbgleichen(...a: Parameters<Fristen['fristenAbgleichen']>) { return this.fristen.fristenAbgleichen(...a); }
  erinnerungenFaellig(...a: Parameters<Fristen['erinnerungenFaellig']>) { return this.fristen.erinnerungenFaellig(...a); }
  fristenLauf(...a: Parameters<Fristen['fristenLauf']>) { return this.fristen.fristenLauf(...a); }
  legeErinnerungAn(mappeId: string, e: unknown, von: string): Promise<Erinnerung | Aufgabe> { return this.fristen.legeErinnerungAn(mappeId, e, von); }
  erinnerungMappe(id: string) { return this.fristen.erinnerungMappe(id); }
  aendereErinnerung(id: string, e: unknown, ich: { id: string; rolle: string }): Promise<Erinnerung> { return this.fristen.aendereErinnerung(id, e, ich); }
  loescheErinnerung(id: string, ich: { id: string; rolle: string }) { return this.fristen.loescheErinnerung(id, ich); }
  termine(...a: Parameters<Fristen['termine']>) { return this.fristen.termine(...a); }
  naechsterTermin(z: Zugriff): Promise<{ termin: Termin | null; ueberfaellig: number }> { return this.fristen.naechsterTermin(z); }
  setzeFolgetermin(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) { return this.fristen.setzeFolgetermin(aufgabeId, ich, z); }

  /* ---------- Notizen (#55) ---------- */

  notizen(mappeId: string): Promise<Notiz[]> { return this.mappen.notizen(mappeId); }

  /* ---------- E-Mail aus der Mappe (#58, #151, ausgang/email.ts) ---------- */

  versendeMappen(...a: Parameters<AusgangEmail['versendeMappen']>) { return this.ausgangEmail.versendeMappen(...a); }
  versendeMappe(...a: Parameters<AusgangEmail['versendeMappe']>) { return this.ausgangEmail.versendeMappe(...a); }

  /* ---------- Notizen anlegen, ändern, löschen (#55, mappen/notizen.ts) ---------- */

  legeNotizAn(mappeId: string, text: unknown, von: string | null): Promise<Notiz> { return this.mappenNotizen.legeNotizAn(mappeId, text, von); }
  aendereNotiz(id: string, text: unknown, von: string | null): Promise<Notiz> { return this.mappenNotizen.aendereNotiz(id, text, von); }
  loescheNotiz(id: string, von: string | null) { return this.mappenNotizen.loescheNotiz(id, von); }

  /* ---------- Favorit = Abo (#422) ---------- */

  persoenlicheEinstellungen(benutzerId: string): Promise<Record<string, unknown>> { return this.mappen.persoenlicheEinstellungen(benutzerId); }

  /* ---------- Favoriten benachrichtigen: Freigabe in der Werkbank (#506, aufgaben/aufgaben.dienst.ts) ---------- */

  favoritenFreigabe(): Promise<FavoritenFreigabe> { return this.aufgaben.favoritenFreigabe(); }
  setzeFavoritenFreigabe(eingabe: unknown, von: string) { return this.aufgaben.setzeFavoritenFreigabe(eingabe, von); }

  /* ---------- Aufgaben ohne Empfänger an einen Alltags-Benutzer (#719, aufgaben/ohne-empfaenger.ts) ---------- */

  alltagsEmpfaenger() { return this.ohneEmpfaenger.alltagsEmpfaenger(); }
  setzeAufgabenEmpfaenger(eingabe: unknown, von: string | null) { return this.ohneEmpfaenger.setzeAufgabenEmpfaenger(eingabe, von); }
  siehtOhneEmpfaenger(ich: { id: string; rolle: string }): Promise<boolean> { return this.ohneEmpfaenger.siehtOhneEmpfaenger(ich); }
  private vorgabeAufgabenEmpfaenger(b: Benutzer) { return this.ohneEmpfaenger.vorgabeAufgabenEmpfaenger(b); }
  favoritenBenachrichtigungErlaubt(benutzerId: string): Promise<boolean> { return this.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(benutzerId); }
  favoritenVorgabeAnwenden(von: string): Promise<number> { return this.ohneEmpfaenger.favoritenVorgabeAnwenden(von); }
  favoritenMelden(mappeId: string, von: string): Promise<number> { return this.ohneEmpfaenger.favoritenMelden(mappeId, von); }
  gesehen(ich: { id: string }, mappeIds: unknown, aufgaben?: Aufgabe[]) { return this.mappen.gesehen(ich, mappeIds, aufgaben); }
  setzeFavoritBenachrichtigen(ich: { id: string }, mappeId: string, an: unknown) { return this.mappen.setzeFavoritBenachrichtigen(ich, mappeId, an); }
  historie(mappeId: string, o: { register?: unknown; max?: unknown; vor?: unknown } = {}): Promise<Historieneintrag[]> { return this.mappenHistorie.historie(mappeId, o); }
  notiereAbruf(x: { dokumentId: string; benutzerId: string | null; weg: Abrufweg; fassung?: Abruffassung; version?: number | null; gestempelt?: boolean; schluessel?: string | null; datei?: string }): Promise<boolean> { return this.mappenHistorie.notiereAbruf(x); }
  historieTage(): Promise<number> { return this.mappenHistorie.historieTage(); }
  setzeHistorieTage(eingabe: unknown): Promise<number> { return this.mappenHistorie.setzeHistorieTage(eingabe); }
  listeTypen() { return this.mappentypen.listeTypen(); }
  typenFuer(z: Zugriff) { return this.mappentypen.typenFuer(z); }
  ausPostZiele(z?: Zugriff): Promise<Mappentyp[]> { return this.mappentypen.ausPostZiele(z); }
  rechteUebersicht(z: Zugriff) { return this.mappentypen.rechteUebersicht(z); }
  legeTypAn(eingabe: unknown, ausPaket?: string): Promise<Mappentyp> { return this.mappentypen.legeTypAn(eingabe, ausPaket); }
  aendereTyp(id: string, eingabe: unknown, ausPaket?: string): Promise<Mappentyp> { return this.mappentypen.aendereTyp(id, eingabe, ausPaket); }
  ausDokumentVon(typId: string): Promise<AusDokument | null> { return this.mappentypen.ausDokumentVon(typId); }
  loescheTyp(id: string): Promise<void> { return this.mappentypen.loescheTyp(id); }
  listeMappen(typId?: string) { return this.mappen.listeMappen(typId); }
  mappenKurz() { return this.mappen.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.mappen.feldwerte(typId, key); }
  verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) { return this.mappen.verweisende(id, typId, feldKey, z); }
  holeMappe(id: string, z?: Zugriff) { return this.mappen.holeMappe(id, z); }
  /** Vorgaben (#1038): Ein Paket ändert keine Vorgabe eines anderen Pakets (403). */
  pruefeFremdeVorgabe(z: Zugriff | undefined, mappeId: string) { return this.mappen.pruefeFremdeVorgabe(z, mappeId); }

  /* ---------- Sichten: seitenweise und gezählt (sichten/sichten.dienst.ts) ---------- */

  seite(...a: Parameters<SichtenDienst['seite']>) { return this.sichten.seite(...a); }
  tabelle(...a: Parameters<SichtenDienst['tabelle']>) { return this.sichten.tabelle(...a); }
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

  zugriff(ich: Zugreifender): Promise<Zugriff> { return this.rechtepruefung.zugriff(ich); }
  rechteAn(z: Zugriff, m: Mappe, neu = false, aufgaben?: Aufgabe[]): Promise<Rechte> { return this.rechtepruefung.rechteAn(z, m, neu, aufgaben); }
  rechteAnVielen(z: Zugriff, ms: Mappe[]): Promise<Map<string, Rechte>> { return this.rechtepruefung.rechteAnVielen(z, ms); }
  private mappenquelle(benutzerId: string, mappeIds: string[]): Promise<Mappenquelle> { return this.rechtepruefung.mappenquelle(benutzerId, mappeIds); }
  pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> { return this.rechtepruefung.pruefeRecht(z, id, recht); }
  lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.lesbare(z, ids); }
  sichtbarFuer(benutzerId: string, ids: string[]): Promise<Set<string>> { return this.rechtepruefung.sichtbarFuer(benutzerId, ids); }
  wasSieht(benutzerId: unknown) { return this.rechtepruefung.wasSieht(benutzerId); }
  mappeVon(art: 'dokument' | 'notiz' | 'aufgabe', id: string): Promise<string> { return this.rechtepruefung.mappeVon(art, id); }
  mitPasswortRecht<T extends Mappe>(z: Zugriff, mappen: T[]): Promise<{ mit: T[]; ohne: T[] }> { return this.rechtepruefung.mitPasswortRecht(z, mappen); }
  kannLesen(benutzerId: string, mappeId: string): Promise<boolean> { return this.rechtepruefung.kannLesen(benutzerId, mappeId); }

  /* ---------- Pakete am Mappentyp (#686) ---------- */

  /** Je Mappentyp-Id die Pakete, denen der Admin diesen Typ verwehrt hat (Kern). */
  paketVerwehrt(): Promise<Record<string, string[]>> { return this.kern.paketVerwehrt(); }

  /* ---------- KI-Dienste und Mappentypen (#796, mappentypen/ki-typen.ts) ---------- */

  kiTypen(): Promise<{ zugelassen: Set<string>; hinweis: boolean }> { return this.ki.kiTypen(); }
  kiSperre(p: Pick<InstalliertesPaket, 'laeufer'> | null | undefined): Promise<(typId: string) => boolean> { return this.ki.kiSperre(p); }
  kiSperreFuer(paketId: string): Promise<(typId: string) => boolean> { return this.ki.kiSperreFuer(paketId); }
  kiUebersicht(): Promise<KiUebersicht> { return this.ki.kiUebersicht(); }
  setzeKiTyp(typId: string, zugelassen: boolean, von: string | null): Promise<KiUebersicht> { return this.ki.setzeKiTyp(typId, zugelassen, von); }
  kiHinweisGelesen(): Promise<KiUebersicht> { return this.ki.kiHinweisGelesen(); }
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
  passungNachziehen(fortschritt?: (fertig: number, gesamt: number) => void): Promise<number> { return this.passung.passungNachziehen(fortschritt); }

  /* ---------- Titel ---------- */

  aktualisiereTitel(ids: string[]): Promise<Map<string, string>> { return this.mappenTitel.aktualisiereTitel(ids); }
  hakenUeberfuehren(): Promise<number> { return this.mappenTitel.hakenUeberfuehren(); }
  typSchluesselNachziehen(): Promise<number> { return this.mappenTitel.typSchluesselNachziehen(); }

  /* ---------- Ansicht der Werkbank (#281, werkbank/werkbank.dienst.ts) ---------- */

  werkbankAnsicht(wer: { id: string | null; email: string }) { return this.werkbank.werkbankAnsicht(wer); }
  setzeWerkbankAnsicht(wer: { id: string | null; email: string }, body: Record<string, unknown>) { return this.werkbank.setzeWerkbankAnsicht(wer, body); }
  merkmale() { return this.werkbank.merkmale(); }
  setzeMerkmale(body: unknown, von: string) { return this.werkbank.setzeMerkmale(body, von); }

  /* ---------- Pakete (#188): die Logik steckt in pakete.ts; die Ablage ruft das Repo des Kerns bzw. pakete/pakete.einstellungen.ts (#961) ---------- */

  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;
  /** Dienstkonten der Pakete (Benutzer-Id → Paket-Id), vom Paket-Läufer gepflegt (Kern). */
  get paketKonten(): Map<string, string> { return this.kern.paketKonten; }
  set paketKonten(m: Map<string, string>) { this.kern.paketKonten = m; }

  /* ---------- Ereigniskatalog (#670; Verteiler hier, Zustellung an Pakete in ereignisse/ereignisse.dienst.ts) ---------- */

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
  private neueAufgabe(a: Aufgabe, typ?: string): Promise<Aufgabe> { return this.ereignisseDienst.neueAufgabe(a, typ); }
  private meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null) { return this.ereignisseDienst.meldeVerknuepft(typ, mappeId, alt, neu, von); }
  private ereignisAnPakete(e: KatalogEreignis) { return this.ereignisseDienst.ereignisAnPakete(e); }
  auftrag(...a: Parameters<EreignisseDienst['auftrag']>) { return this.ereignisseDienst.auftrag(...a); }

  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }

  belegteTypen(ids: string[], ohne: string[] = []): Promise<string[]> { return this.mappentypen.belegteTypen(ids, ohne); }
  entferneMappenEndgueltig(ids: string[]) { return this.loeschen.entferneMappenEndgueltig(ids); }

  /* ---------- Beispiel-Mappen aus Paketen (#878, loeschen/beispiele.ts) ---------- */

  beispielStand(ids: string[]): Promise<BeispielStand[]> { return this.beispielMappen.beispielStand(ids); }
  pruefeBeispiele(staende: BeispielStand[]) { return this.beispielMappen.pruefeBeispiele(staende); }
  entferneBeispielMappen(ids: string[], von: string | null, weg: 'beispiele' | 'vorgaben' = 'beispiele') { return this.beispielMappen.entferneBeispielMappen(ids, von, weg); }

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
  /** Beim Auswählen übernehmen (#1037): Vorschläge aus der gewählten Mappe, mit den Rechten der Person. */
  vorbelegen(e: unknown, z?: Zugriff) { return this.mappenEingaben.vorbelegen(e, z); }
  vorbelegenVorschlaege(...a: Parameters<MappenEingaben['vorbelegenVorschlaege']>): Promise<void> { return this.mappenEingaben.vorbelegenVorschlaege(...a); }
  zaehleAuswahl(e: unknown, benutzerId: string) { return this.mappenEingaben.zaehleAuswahl(e, benutzerId); }
  rechteVorschau(id: string, eingabe: unknown, z: Zugriff): Promise<Rechte> { return this.mappenEingaben.rechteVorschau(id, eingabe, z); }
  aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff, anlass?: Record<string, unknown>): Promise<Mappe & { hinweis?: string }> { return this.mappen.aendereMappe(id, eingabe, benutzerId, z, anlass); }
  legeMappenAn(liste: NeueMappe[]) { return this.mappen.legeMappenAn(liste); }
  aktualisiereStatistik() { return this.sichten.aktualisiereStatistik(); }
  private loeschPruefung(...a: Parameters<LoeschenDienst['loeschPruefung']>) { return this.loeschen.loeschPruefung(...a); }

  /* ---------- Export mehrerer Mappen (#152, ausgang/export.ts) ---------- */

  exportiere(...a: Parameters<AusgangExport['exportiere']>) { return this.ausgangExport.exportiere(...a); }

  /* ---------- Wege nach draußen: die gemeinsame Prüfstelle (#723), Stempel, Fassungen (ausgang/ausgang.dienst.ts) ---------- */

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
  loescheMappen(...a: Parameters<LoeschenDienst['loescheMappen']>) { return this.loeschen.loescheMappen(...a); }
  loescheMappe(...a: Parameters<LoeschenDienst['loescheMappe']>): Promise<void> { return this.loeschen.loescheMappe(...a); }
  private loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) { return this.loeschen.loescheMappeIntern(id, typ, von); }

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

  /* ---------- Post (#192, post/post.dienst.ts; Auflösen post/aufloesen.ts) ---------- */

  legePostAn(...a: Parameters<PostDienst['legePostAn']>) { return this.post.legePostAn(...a); }
  ordneZu(...a: Parameters<PostDienst['ordneZu']>) { return this.post.ordneZu(...a); }
  automatischZuordnen(postId: string, e: PostErkennung) { return this.post.automatischZuordnen(postId, e); }
  automatikRueckgaengig(aufgabeId: string, ich: { id: string; rolle: string }, z?: Zugriff) { return this.post.automatikRueckgaengig(aufgabeId, ich, z); }
  private postAufgaben(mappeId: string, von: string | null) { return this.post.postAufgaben(mappeId, von); }
  trennePostAb(postId: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.postAufloesen.trennePostAb(postId, eingabe, von, z); }

  /* ---------- Systemmappen, Benutzer-Mappen, Rollen, Systemkonten (#43, #673, post/systemmappen.ts) ---------- */

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
  /**
   * Umbau (#1041): Automatisierungen auf einen umgebauten Typ zeigen lassen – alter Typ → Zieltyp, Feldkennungen alt →
   * neu; setzt automatisierung.ts. Ergebnis: wie viele geändert wurden.
   */
  typUmgebaut?: (alt: string, neu: string, felder: Record<string, string>) => Promise<number>;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das). */
  automatisierungenExport?: () => Promise<unknown[]>;

  /* ---------- Hilfen für Automatisierungen (#674, ereignisse/automatisierung.ts) ---------- */

  automatisierungKontext() { return this.automatisierungshilfen.automatisierungKontext(); }
  mitgliederDerRolle(rolleId: string): Promise<string[]> { return this.automatisierungshilfen.mitgliederDerRolle(rolleId); }
  trifftTeile(...a: Parameters<Automatisierungshilfen['trifftTeile']>) { return this.automatisierungshilfen.trifftTeile(...a); }
  lesbareTitel(z: Zugriff, ids: string[]): Promise<Map<string, string>> { return this.automatisierungshilfen.lesbareTitel(z, ids); }
  aufgabenEmpfaenger(id: string): Promise<{ an: string | null; ueber: string[] }> { return this.aufgaben.aufgabenEmpfaenger(id); }
  aufgabeAusAutomatisierung(...a: Parameters<AufgabenDienst['aufgabeAusAutomatisierung']>) { return this.aufgaben.aufgabeAusAutomatisierung(...a); }
  private erledigeNachAnlass(...a: Parameters<AufgabenDienst['erledigeNachAnlass']>) { return this.aufgaben.erledigeNachAnlass(...a); }
  datumVon(mappeId: string, feld: string): Promise<string | null> { return this.automatisierungshilfen.datumVon(mappeId, feld); }
  mappenMitDatum(typId: string, feld: string, datum: string): Promise<string[]> { return this.automatisierungshilfen.mappenMitDatum(typId, feld, datum); }
  weitereRollen(): Promise<Map<string, string[]>> { return this.systemtypen.weitereRollen(); }
  entferneBenutzerMappe(id: string) { return this.systemtypen.entferneBenutzerMappe(id); }
  benutzerspiegel(): Benutzerspiegel { return this.systemtypen.benutzerspiegel(); }

  /* ---------- Papierkorb (#43, loeschen/papierkorb.ts) ---------- */

  /** Aufbewahrung in Tagen; 0 = kein Papierkorb (Löschen ist sofort endgültig) – Kern. */
  papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }
  setzePapierkorbTage(eingabe: unknown, von?: string | null): Promise<{ tage: number; geleert: number }> { return this.papierkorbVerwaltung.setzePapierkorbTage(eingabe, von); }
  papierkorb(ich: { id: string; rolle: string }, alle = false) { return this.papierkorbVerwaltung.papierkorb(ich, alle); }
  papierkorbDokumente(ich: { id: string; rolle: string }, alle = false): Promise<DokumentImKorb[]> { return this.papierkorbVerwaltung.papierkorbDokumente(ich, alle); }
  stelleDokumentWiederHer(...a: Parameters<Papierkorb['stelleDokumentWiederHer']>) { return this.papierkorbVerwaltung.stelleDokumentWiederHer(...a); }
  loescheDokumentEndgueltig(...a: Parameters<Papierkorb['loescheDokumentEndgueltig']>): Promise<number> { return this.papierkorbVerwaltung.loescheDokumentEndgueltig(...a); }
  papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return this.papierkorbVerwaltung.papierkorbEintrag(id, ich, alle); }
  stelleWiederHer(...a: Parameters<Papierkorb['stelleWiederHer']>) { return this.papierkorbVerwaltung.stelleWiederHer(...a); }
  loescheEndgueltig(...a: Parameters<Papierkorb['loescheEndgueltig']>): Promise<number> { return this.papierkorbVerwaltung.loescheEndgueltig(...a); }
  leerePapierkorb(...a: Parameters<Papierkorb['leerePapierkorb']>): Promise<number> { return this.papierkorbVerwaltung.leerePapierkorb(...a); }
  raeumePapierkorbAuf(...a: Parameters<Papierkorb['raeumePapierkorbAuf']>): Promise<number> { return this.papierkorbVerwaltung.raeumePapierkorbAuf(...a); }

  /* ---------- Löschprotokoll lesen (#470, loeschen/loeschprotokoll.ts) ---------- */

  loeschprotokollJahre(): Promise<number> { return this.loeschprotokollVerwaltung.loeschprotokollJahre(); }
  setzeLoeschprotokollJahre(eingabe: unknown, von: string): Promise<number> { return this.loeschprotokollVerwaltung.setzeLoeschprotokollJahre(eingabe, von); }
  loeschprotokoll(q: Record<string, unknown>) { return this.loeschprotokollVerwaltung.loeschprotokoll(q); }
  loeschprotokollAusgabe(...a: Parameters<LoeschprotokollVerwaltung['loeschprotokollAusgabe']>) { return this.loeschprotokollVerwaltung.loeschprotokollAusgabe(...a); }
  loeschprotokollAlle(): Promise<LoeschEintrag[]> { return this.loeschprotokollVerwaltung.loeschprotokollAlle(); }

  /* ---------- Demo-Daten (#248, datenschutz/datenschutz.dienst.ts) ---------- */

  mappenJeTyp(): Promise<Map<string, number>> { return this.datenschutzDienst.mappenJeTyp(); }
  demoUebersicht() { return this.datenschutzDienst.demoUebersicht(); }
  entferneDemo(...a: Parameters<DatenschutzDienst['entferneDemo']>) { return this.datenschutzDienst.entferneDemo(...a); }
  legeDemoDokumentAn(...a: Parameters<DatenschutzDienst['legeDemoDokumentAn']>) { return this.datenschutzDienst.legeDemoDokumentAn(...a); }

  /* ---------- Eingangskanäle (#195, post/eingangskanaele.ts) ---------- */

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

  /* ---------- Stempel beim Weitergeben (#394, pdf-bearbeiten/stempelvorlagen.ts) ---------- */

  stempelVorlagen() { return this.stempelvorlagen.stempelVorlagen(); }
  speichereStempelVorlage(id: string | null, eingabe: unknown, von: string) { return this.stempelvorlagen.speichereStempelVorlage(id, eingabe, von); }
  loescheStempelVorlage(id: string, von: string) { return this.stempelvorlagen.loescheStempelVorlage(id, von); }
  private pruefeStempelTyp(v: unknown) { return this.stempelvorlagen.pruefeStempelTyp(v); }
  private setzeStempelTyp(typId: string, st: StempelTyp | null) { return this.stempelvorlagen.setzeStempelTyp(typId, st); }
  loescheDokument(id: string, benutzerId: string | null = null, anlass: Anlass = { weg: 'ersetzt' }) { return this.dokumente.loescheDokument(id, benutzerId, anlass); }

  /* ---------- PDF bearbeiten (#335, pdf-bearbeiten/pdf-bearbeiten.dienst.ts) ---------- */

  /** Seitenbilder der Seitenansicht (im Arbeitsspeicher, für die letzten Dokumente). */
  get seitenbilder() { return this.pdfBearbeiten.seitenbilder; }
  seiteAlsGraubild(...a: Parameters<PdfBearbeiten['seiteAlsGraubild']>) { return this.pdfBearbeiten.seiteAlsGraubild(...a); }
  pdfSeiten(id: string) { return this.pdfBearbeiten.pdfSeiten(id); }
  pdfSeitenbild(...a: Parameters<PdfBearbeiten['pdfSeitenbild']>) { return this.pdfBearbeiten.pdfSeitenbild(...a); }
  bearbeitePdf(id: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.pdfBearbeiten.bearbeitePdf(id, eingabe, von, z); }
  fuegePdfZusammen(eingabe: unknown, von: string | null, z?: Zugriff) { return this.pdfBearbeiten.fuegePdfZusammen(eingabe, von, z); }

  /* ---------- Post fotografieren (#490, post/foto.ts) ---------- */

  postAusFotos(...a: Parameters<PostFotos['postAusFotos']>) { return this.postFotos.postAusFotos(...a); }
  fotosAnMappe(...a: Parameters<PostFotos['fotosAnMappe']>) { return this.postFotos.fotosAnMappe(...a); }
  legePostZusammen(zielId: string, eingabe: unknown, von: string | null, z?: Zugriff) { return this.postFotos.legePostZusammen(zielId, eingabe, von, z); }

  /* ---------- PDF verkleinern (#393, pdf-bearbeiten/verkleinern.ts) ---------- */

  verkleinernVorschau(id: string) { return this.pdfVerkleinern.verkleinernVorschau(id); }
  verkleinereDokument(id: string, eingabe: unknown, von: string | null) { return this.pdfVerkleinern.verkleinereDokument(id, eingabe, von); }
  verkleinernEinstellung() { return this.pdfVerkleinern.verkleinernEinstellung(); }
  setzeVerkleinernEinstellung(eingabe: unknown) { return this.pdfVerkleinern.setzeVerkleinernEinstellung(eingabe); }
  private automatischVerkleinert(ein: Eingang, name: string) { return this.pdfVerkleinern.automatischVerkleinert(ein, name); }
  grosseDokumente(f: { ab?: unknown; stufe?: unknown }) { return this.pdfVerkleinern.grosseDokumente(f); }
  verkleinereViele(eingabe: unknown, von: { id: string | null; email: string }) { return this.pdfVerkleinern.verkleinereViele(eingabe, von); }

  /* ---------- Schwärzen (#392, pdf-bearbeiten/schwaerzen.ts) ---------- */

  schwaerzenVorschau(id: string) { return this.schwaerzen.schwaerzenVorschau(id); }
  schwaerzSeitenbild(...a: Parameters<Schwaerzen['schwaerzSeitenbild']>) { return this.schwaerzen.schwaerzSeitenbild(...a); }
  archivSeitenbild(id: string, nr: number) { return this.schwaerzen.archivSeitenbild(id, nr); }
  schwaerzeDokument(id: string, eingabe: unknown, von: string | null) { return this.schwaerzen.schwaerzeDokument(id, eingabe, von); }

  /* ---------- Archivnummer (#345) ---------- */

  archivKreis(): Promise<Nummernkreis> { return this.mappenArchiv.archivKreis(); }
  setzeArchivnummer(id: string, eingabe: unknown, von: string | null): Promise<Dokument> { return this.mappenArchiv.setzeArchivnummer(id, eingabe, von); }
  findeArchivnummer(eingabe: unknown, z?: Zugriff) { return this.mappenArchiv.findeArchivnummer(eingabe, z); }
  archivAufkleber(eingabe: unknown, von: string) { return this.mappenArchiv.archivAufkleber(eingabe, von); }

  /* ---------- Vollexport (#254, datenschutz/vollexport.ts) ---------- */

  vollexportQuelle(...a: Parameters<VollexportQuellen['vollexportQuelle']>): ExportQuelle { return this.vollexport.vollexportQuelle(...a); }
  persoenlicheQuelle(...a: Parameters<VollexportQuellen['persoenlicheQuelle']>): Promise<ExportQuelle> { return this.vollexport.persoenlicheQuelle(...a); }

  /* ---------- Baum-Sammlung über Verweise (#396, #424, loeschen/mit-verknuepften.ts) ---------- */

  baumQuelle(z: Zugriff): BaumQuelle { return this.mitVerknuepften.baumQuelle(z); }
  baum(startId: string, eingabe: unknown, z: Zugriff): Promise<Baum> { return this.mitVerknuepften.baum(startId, eingabe, z); }

  /* ---------- Mappe mit allen verknüpften Mappen löschen (#424, loeschen/mit-verknuepften.ts) ---------- */

  loeschVorschau(startId: string, eingabe: unknown, z: Zugriff): Promise<LoeschVorschau> { return this.mitVerknuepften.loeschVorschau(startId, eingabe, z); }
  loescheMitVerknuepften(...a: Parameters<MitVerknuepften['loescheMitVerknuepften']>) { return this.mitVerknuepften.loescheMitVerknuepften(...a); }
  stelleVorgangWiederHer(...a: Parameters<MitVerknuepften['stelleVorgangWiederHer']>) { return this.mitVerknuepften.stelleVorgangWiederHer(...a); }

  /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396, datenschutz/datenschutz.dienst.ts) ---------- */

  datenschutz(): Promise<Datenschutz> { return this.datenschutzDienst.datenschutz(); }
  /** Für Unterlagen an Dritte (#995): Verantwortlicher aus der eigenen Organisation, sonst wie eingestellt. */
  datenschutzFuerUnterlagen(): Promise<Datenschutz> { return this.datenschutzDienst.datenschutzFuerUnterlagen(); }
  setzeDatenschutz(eingabe: unknown, von: string): Promise<Datenschutz> { return this.datenschutzDienst.setzeDatenschutz(eingabe, von); }
  auskunftVorschau(e: unknown, z: Zugriff): Promise<AuskunftVorschau> { return this.datenschutzDienst.auskunftVorschau(e, z); }
  auskunftDaten(...a: Parameters<DatenschutzDienst['auskunftDaten']>): Promise<AuskunftDaten> { return this.datenschutzDienst.auskunftDaten(...a); }
  auskunftNachweis(...a: Parameters<DatenschutzDienst['auskunftNachweis']>) { return this.datenschutzDienst.auskunftNachweis(...a); }
  auskunftFrist(e: unknown, z: Zugriff, von: string): Promise<Aufgabe> { return this.datenschutzDienst.auskunftFrist(e, z, von); }
  auskunftVerzeichnis(...a: Parameters<DatenschutzDienst['auskunftVerzeichnis']>): Promise<AuskunftEintrag[]> { return this.datenschutzDienst.auskunftVerzeichnis(...a); }
  auskunftNotiz(...a: Parameters<DatenschutzDienst['auskunftNotiz']>) { return this.datenschutzDienst.auskunftNotiz(...a); }

  /* ---------- Auskunft zustellen (#455, datenschutz/zustellen.ts) ---------- */

  auskunftLinks(...a: Parameters<AuskunftZustellen['auskunftLinks']>): Promise<AuskunftLink[]> { return this.auskunftZustellen.auskunftLinks(...a); }
  auskunftLinkAktiv(auskunftId: string): Promise<boolean> { return this.auskunftZustellen.auskunftLinkAktiv(auskunftId); }
  auskunftPerEmail(...a: Parameters<AuskunftZustellen['auskunftPerEmail']>) { return this.auskunftZustellen.auskunftPerEmail(...a); }
  auskunftLinkAnlegen(...a: Parameters<AuskunftZustellen['auskunftLinkAnlegen']>) { return this.auskunftZustellen.auskunftLinkAnlegen(...a); }
  auskunftLinkWiderrufen(id: string, ich: { id: string; email: string }): Promise<AuskunftLink> { return this.auskunftZustellen.auskunftLinkWiderrufen(id, ich); }
  auskunftAbrufPruefen(...a: Parameters<AuskunftZustellen['auskunftAbrufPruefen']>) { return this.auskunftZustellen.auskunftAbrufPruefen(...a); }
  auskunftLinkMitId(id: string): Promise<AuskunftLinkIntern | undefined> { return this.auskunftZustellen.auskunftLinkMitId(id); }
  auskunftAbrufZaehlen(id: string): Promise<number | null> { return this.auskunftZustellen.auskunftAbrufZaehlen(id); }
  auskunftAbgerufen(...a: Parameters<AuskunftZustellen['auskunftAbgerufen']>) { return this.auskunftZustellen.auskunftAbgerufen(...a); }
  persoenlicherExportErlaubt(): Promise<boolean> { return this.auskunftZustellen.persoenlicherExportErlaubt(); }
  setzePersoenlicherExport(an: unknown, von: string) { return this.auskunftZustellen.setzePersoenlicherExport(an, von); }
  exportAbschaetzung() { return this.auskunftZustellen.exportAbschaetzung(); }

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
}
