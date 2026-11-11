import type { Systemkonto, Aufgabe, Benutzer, Mappentyp } from '../../shared/src/model';
import type { Dateispeicher } from './dateispeicher';
import { Auftraege } from './auftrag';
import { kontext, protokoll } from './protokoll';
import { EIGENE_MAPPEN, Haushaltsstand, MINDESTENS_MS, NUR_FAVORITEN, ZAEHLT_FUER_TERMINE, type Gueltigkeit } from './zaehlerspeicher';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import { Fachfehler } from './fehler';
import { aufkleberPdf, ETIKETTEN } from './aufkleber';
import { istVerschluesselt, type Tresor } from './tresor';
import type { Einstellungen } from './einstellungen';
import { type Repo } from './repo';
import type { ExportQuelle } from './vollexport';
import { type AuskunftVorschau, type Datenschutz } from '../../shared/src/auskunft';
import type { AuskunftEintrag, AuskunftLink } from '../../shared/src/auskunft';
import type { AuskunftLinkIntern } from './repo';
import type { AuskunftDaten } from './auskunft';
import { type InstalliertesPaket } from '../../shared/src/pakete';
import { PaketVolltext } from './paketvolltext';
import { FragenAnDieAblage } from './fragen';
import { Uebersetzung } from './uebersetzung';
import { Erkennung, sichereZuordnung, type PostErkennung } from './erkennung';
import { t } from './sprache';
import { Ereignisverteiler } from './ereignisse';
import { fristFelder } from '../../shared/src/fristen';
import { EMAIL_MAX_ANHAENGE } from './grenzen';
import { SucheDienst } from './suche';
import { ZugriffDienst } from './zugriff';
import { ABO_ARTEN, Kern, PAPIERKORB_STANDARD_TAGE, type Anlass, type Zugriff } from './kern';
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
import { AusgangDienst, AusgangEmail, AusgangExport } from './ausgang';
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
import { PaketAktionen } from './paketaktionen';
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
      organisation: () => this.organisation.geltende(), mitnehmbar: (ich, z, ids) => this.ausgang.mitnehmbar(ich, z, ids),
      ladeHoch: (id, e, inhalt, von) => this.dokumente.ladeHoch(id, { ...e, herkunft: 'vorlage' }, inhalt, von),
      darfAblegen: async (z, id) => { const m = await this.repo.holeMappe(id); return !!m && (await this.rechtepruefung.rechteAn(z, m)).U; },
    });
  }
  private paketaktionenDienst?: PaketAktionen;
  /**
   * Paket-Aktionen im Menü „Mappe“ (#1039) – beim ersten Gebrauch gebaut; den Paket-Läufer setzt er selbst. Das Paket
   * handelt im Auftrag der Person: Ändern, Anlegen und Hochladen laufen mit dem Zugriff der Person.
   */
  get paketaktionen(): PaketAktionen {
    return this.paketaktionenDienst ??= new PaketAktionen(this.kern, this.rechtepruefung, {
      paketZugriff: async (paketId) => {
        const konto = [...this.kern.paketKonten].find(([, p]) => p === paketId)?.[0];
        return konto ? this.rechtepruefung.zugriff({ id: konto, rolle: 'mitglied', art: 'dienst', paketId }) : null;
      },
      kiSperre: (paketId) => this.ki.kiSperreFuer(paketId),
      mitnehmbar: (ich, z, ids) => this.ausgang.mitnehmbar(ich, z, ids),
      ladeHoch: (id, e, inhalt, von) => this.dokumente.ladeHoch(id, { ...e, herkunft: 'paket' }, inhalt, von),
      aendereMappe: (id, werte, von, z, anlass) => this.mappen.aendereMappe(id, { werte }, von, z, { text: anlass }),
      legeMappeAn: (typId, werte, von, z) => this.mappen.legeMappeAn({ typId, werte }, von, false, z),
      ausgabe: (mappeId, d, ich) => this.ausgang.dateiFuerAusgabe(mappeId, d, ich),
      kurzzustand: () => this.kurzzustand,
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
    this.kern = new Kern({ repo: this.stand.umhuelle(grundRepo, this.mappenstand), dateien, einstellungen: opt.einstellungen, stand: this.stand, wecke: () => this.ereignisse.wecke(), ausstatten: () => this.systemausstattung.anlegen(), zugriff: (ich) => this.rechtepruefung.zugriff(ich) });
    this.rechtepruefung = new ZugriffDienst(this.kern, { kiSperre: (p) => this.ki.kiSperre(p), konten: () => this.konten });
    this.mappentypen = new MappentypenDienst(this.kern, {
      mitStempel: (typen) => this.ausgang.mitStempel(typen), pruefeStempelTyp: (v) => this.stempelvorlagen.pruefeStempelTyp(v), setzeStempelTyp: (id, st) => this.stempelvorlagen.setzeStempelTyp(id, st),
      erkennung: () => this.erkennung, berechtigungenAusEingabe: (typ, e) => this.berechtigungen.berechtigungenAusEingabe(typ, e),
      protokolliereBerechtigungen: (typ, n) => Dienst.protokolliereBerechtigungen(typ, n), konfigurationKonflikt: (art, aktuell) => Dienst.konfigurationKonflikt(art, aktuell),
    });
    this.typpakete = new TypPakete(this.kern, this.rechtepruefung, { kiSperre: (p) => this.ki.kiSperre(p), konten: () => this.konten });
    this.passung = new Passung(this.kern, { passungsAufgaben: (liste) => this.vertretung.passungsAufgaben(liste) });
    this.nummernkreise = new Nummernkreise(this.kern, { archivKreis: () => this.mappenArchiv.archivKreis(), aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids), auftraege: this.auftraege });
    this.systemtypen = new Systemtypen(this.kern, this.rechtepruefung, {
      schreibeSystemMappe: (typ, id, e, von, kennung) => this.postSystemmappen.schreibeSystemMappe(typ, id, e, von, kennung), loescheMappeIntern: (id, typ, von) => this.loeschen.loescheMappeIntern(id, typ, von),
      spiegleBenutzer: (b, von, abwesenheit) => this.postSystemmappen.spiegleBenutzer(b, von, abwesenheit), aufgabenUebergeben: (id, an, von) => this.vertretung.aufgabenUebergeben(id, an, von), kurzzustand: () => this.kurzzustand,
    });
    this.mappenHistorie = new MappenHistorie(this.kern);
    this.mappenTitel = new MappenTitel(this.kern, this.mappenHistorie);
    this.mappenEingaben = new MappenEingaben(this.kern, this.rechtepruefung, { verschluessele: (k) => this.verschluessele(k) });
    this.passwortfelder = new Passwortfelder(this.kern, this.mappenHistorie, { tresor: () => this.tresor, istVerschluesselt });
    this.mappenArchiv = new MappenArchiv(this.kern, this.rechtepruefung, this.mappenHistorie, {
      aufkleber: { ETIKETTEN, aufkleberPdf }, auftraege: this.auftraege, schreibeFehlendeDateien: (shas) => this.dateienFehlen.schreibeFehlendeDateien(shas),
    });
    this.mappen = new MappenDienst(this.kern, this.rechtepruefung, { historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben, hinweise: this.mappenHinweise = new MappenHinweise(this.kern, this.rechtepruefung) }, {
      konten: () => this.konten, favoritenBenachrichtigungErlaubt: (id) => this.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(id), ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich),
      mitArchivStand: (d) => this.dokumentArchiv.mitArchivStand(d), mitPdfSchutz: (d) => this.geschuetztePdfs.mitPdfSchutz(d), datenschutz: () => this.datenschutz(),
      loeschPruefung: (m, typ, rueck, alleTypen) => this.loeschen.loeschPruefung(m, typ, rueck, alleTypen), meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids), organisationGeaendert: (e) => this.organisation.geaendert(e),
    });
    ({ dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, pdfs: this.geschuetztePdfs, fehlend: this.dateienFehlen, versionen: this.dokumentVersionen } = this.baueDokumente());
    this.suche = new SucheDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    ({ verwalten: this.sichtenVerwaltung, systemsichten: this.systemsichten, sichten: this.sichten, berechtigungen: this.berechtigungen, ausPaketen: this.volltextAusPaketen, volltext: this.volltexte } = this.baueSichtenUndVolltext());
    ({ stempelvorlagen: this.stempelvorlagen, pdf: this.pdfBearbeiten, verkleinern: this.pdfVerkleinern, schwaerzen: this.schwaerzen, systemmappen: this.postSystemmappen, aufloesen: this.postAufloesen,
      post: this.post, eingang: this.eingangskanaele, fotos: this.postFotos, ausgang: this.ausgang, email: this.ausgangEmail, export: this.ausgangExport } = this.bauePdfPostAusgang());
    // Systemausstattung (#963): Mappentypen, Ansichten und Post nacheinander.
    this.systemausstattung = new Systemausstattung(this.kern, {
      mappentypen: { sichereSystemtypen: () => this.systemtypen.sichereSystemtypen() },
      sichten: { sichtFuerTyp: (typ) => this.sichtenVerwaltung.sichtFuerTyp(typ), sichereFavoritenSicht: () => this.systemsichten.sichereFavoritenSicht() },
      post: { sicherePostSichten: (post) => this.systemsichten.sicherePostSichten(post) },
    });
    ({ ki: this.ki, notizen: this.mappenNotizen, ereignisse: this.ereignisseDienst, automatisierung: this.automatisierungshilfen, aufgaben: this.aufgaben, vertretung: this.vertretung, ohneLeserecht: this.ohneLeserecht, fristen: this.fristen, ohneEmpfaenger: this.ohneEmpfaenger,
      loeschen: this.loeschen, papierkorb: this.papierkorbVerwaltung, protokoll: this.loeschprotokollVerwaltung, verknuepft: this.mitVerknuepften, beispiele: this.beispielMappen, datenschutz: this.datenschutzDienst, vollexport: this.vollexport, zustellen: this.auskunftZustellen, werkbank: this.werkbank, organisation: this.organisation } = this.baueAufgabenUndLoeschen());
    this.schliesseEmpfaengerAn();
    this.kurzzustand = opt.zustand ?? speicherKurzzustand();
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.tresor?.registriere(() => this.passwortfelder.unlesbarePasswoerter());
    // Was verschlüsselt ist, je Art (#410): dieselben Stellen, die der Schlüsselwechsel umschlüsselt.
    // Passwortfelder meldet unlesbarePasswoerter genauer (mit Feldnamen), den Mailserver der Betrieb.
    this.tresor?.registriereBestand(() => this.repo.verschluesselteFundstellen(), ['passwortfeld', 'mail']);
    // Erkennung (#336): rechnet, sobald der Volltext eines Dokuments fertig ist – egal, wer ihn geliefert hat.
    this.erkennung = new Erkennung(this, () => this.repo, () => this.einstellungen);
    this.fragen = new FragenAnDieAblage(this, () => this.repo, () => this.einstellungen);
    // Inhalte übersetzen (#732): auf Knopfdruck; Änderungen am Original lassen die Übersetzungen verfallen.
    this.uebersetzung = new Uebersetzung(this, () => this.repo, () => this.einstellungen, () => this.kurzzustand);
    this.ereignisse.abonniere('uebersetzung', (e) => this.uebersetzung.nachEreignis(e));
    this.volltexte.beiVolltextFertig(async (e) => { await this.erkennung.nachVolltext(e); });
    // Ereigniskatalog (#670): Mappen-Ereignisse und Fristen an die Pakete, die diese Mappentypen abonniert haben.
    this.ereignisse.abonniere('pakete', (e) => this.ereignisseDienst.ereignisAnPakete(e));
    // Volltext aus Paketen (#614): zuständige Pakete mit dms:volltext, Ereignis datei.volltext an genau dieses.
    this.paketVolltext = new PaketVolltext({ pakete: () => this.repo.listePakete(), melde: (paket, daten) => this.ereignisseDienst.auftrag(paket, 'datei.volltext', daten) });
  }
  /** Dokumente (#1075): die Klassen in dokumente/; was noch im Dienst liegt, kommt über die Anschlüsse. */
  private baueDokumente() {
    const umwandlung = new DokumentUmwandlung(this.kern, {
      ocr: () => this.dokumente.ocr, entsperren: () => this.geschuetztePdfs.entsperren, paketVolltext: () => this.paketVolltext,
      auftrag: (paket, art, daten) => this.ereignisseDienst.auftrag(paket, art, daten), ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
    });
    const archiv = new DokumentArchivfassung(this.kern, umwandlung, {
      auftrag: (paket, art, daten) => this.ereignisseDienst.auftrag(paket, art, daten), ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
      paketEinstellungen: (paket) => paketEinstellungen(this.kern, paket),
    });
    const pdfs = new GeschuetztePdfs(this.kern, { umwandlung, archiv }, { ocr: () => this.dokumente.ocr, listeTypen: () => this.mappentypen.listeTypen() });
    const versionen = new DokumentVersionen(this.kern, {
      ocr: () => this.dokumente.ocr, neueDateien: (docs) => this.dokumente.neueDateien(docs), raeumeAuf: (sha) => this.dokumente.raeumeAuf(sha),
      aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids), volltextAn: (typ, key) => Dienst.volltextAn(typ, key),
    });
    const dokumente = new DokumenteDienst(this.kern, { umwandlung, archiv, pdfs, versionen }, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), automatischVerkleinert: (ein, name) => this.pdfVerkleinern.automatischVerkleinert(ein, name),
      volltextFertig: (e, m) => this.volltexte.volltextFertig(e, m), volltextAn: (typ, key) => Dienst.volltextAn(typ, key),
      pruefeArchivDokument: (id, was) => this.mappenArchiv.pruefeArchivDokument(id, was),
    });
    return { dokumente, umwandlung, archiv, pdfs, fehlend: new FehlendeDateien(this.kern), versionen };
  }

  /** Sichten, Berechtigungen und Volltext (#1076): die Klassen in sichten/, berechtigungen/ und volltext/. */
  private baueSichtenUndVolltext() {
    const verwalten = new SichtenVerwaltung(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const systemsichten = new Systemsichten(this.kern);
    const sichten = new SichtenDienst(this.kern, { rechte: this.rechtepruefung, mappen: this.mappen, suche: this.suche, verwalten, systemsichten }, {
      gueltigkeit: () => this.gueltigkeit(), siehtOhneEmpfaenger: (ich) => this.ohneEmpfaenger.siehtOhneEmpfaenger(ich),
      ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich), termine: (z, q) => this.fristen.termine(z, q),
    }, { stand: this.stand, mappenstand: this.mappenstand });
    const berechtigungen = new BerechtigungenDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const ausPaketen = new VolltextAusPaketen(this.kern, { dokumente: this.dokumente, archiv: this.dokumentArchiv }, { paketVolltext: () => this.paketVolltext });
    const volltext = new VolltextDienst(this.kern, { dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, ausPaketen }, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), auftraege: this.auftraege, paketVolltext: () => this.paketVolltext,
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
      legePostAn: (...a) => this.post.legePostAn(...a), schreibeSystemMappe: (...a) => this.postSystemmappen.schreibeSystemMappe(...a), postAufgaben: (id, von) => this.post.postAufgaben(id, von),
    });
    const verkleinern = new PdfVerkleinern(this.kern, { pdf, ...mappen, ...doks }, { auftraege: this.auftraege });
    const schwaerzen = new Schwaerzen(this.kern, { verkleinern, historie: this.mappenHistorie, ...doks, archiv: this.dokumentArchiv }, {
      volltextFertig: (e, m, von) => this.volltexte.volltextFertig(e, m, von),
    });
    const systemmappen = new PostSystemmappen(this.kern, { rechte, passung: this.passung, historie: this.mappenHistorie, titel: this.mappenTitel }, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
      passungsAufgaben: (liste) => this.vertretung.passungsAufgaben(liste), favoritenFreigabe: () => this.aufgaben.favoritenFreigabe(),
      vorgabeAufgabenEmpfaenger: (b) => this.ohneEmpfaenger.vorgabeAufgabenEmpfaenger(b), sichereSystem: () => this.systemausstattung.sicherstellen(), konten: () => this.konten,
      systemkonten: () => this.systemkonten, automatisierungenVon: () => this.automatisierungenVon,
    });
    const aufloesen = new PostAufloesen(this.kern, { rechte, historie: this.mappenHistorie, titel: this.mappenTitel, ...doks, systemmappen }, {
      legePostAn: (...a) => this.post.legePostAn(...a), postAufgaben: (id, von) => this.post.postAufgaben(id, von),
      loeschPruefung: (m, typ, rueck) => this.loeschen.loeschPruefung(m, typ, rueck), loescheMappe: (id, von, z, anlass) => this.loeschen.loescheMappe(id, von, z, anlass),
    });
    const post = new PostDienst(this.kern, {
      rechte, mappentypen: this.mappentypen, historie: this.mappenHistorie, titel: this.mappenTitel, eingaben: this.mappenEingaben, ...doks, aufloesen, systemmappen,
    }, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
      verschluessele: (k) => this.verschluessele(k), neueAufgabe: (a, typ) => this.ereignisseDienst.neueAufgabe(a, typ), leiteUm: (a) => this.vertretung.leiteUm(a),
      eigeneAufgabe: (id, ich) => this.vertretung.eigeneAufgabe(id, ich), erledigeNachAnlass: (id, passt, grund) => this.aufgaben.erledigeNachAnlass(id, passt, grund), konten: () => this.konten,
      sichereZuordnung: (e, autoTypen) => sichereZuordnung(e as PostErkennung, autoTypen),
    });
    const eingang = new Eingangskanaele(this.kern, { rechte, historie: this.mappenHistorie, dokumente: this.dokumente });
    const fotos = new PostFotos(this.kern, { rechte, ...mappen, ...doks, pdf, post, eingang }, { loescheMappe: (id, von, z, anlass) => this.loeschen.loescheMappe(id, von, z, anlass) });
    const entsperrtZu = (inhalt: Buffer) => this.geschuetztePdfs.entsperrtZu(inhalt);
    const ausgang = new AusgangDienst(this.kern, {
      rechte, mappentypen: this.mappentypen, historie: this.mappenHistorie, versionen: this.dokumentVersionen,
      umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, verwalten: this.sichtenVerwaltung, stempel: stempelvorlagen,
    }, { entsperrtZu });
    const email = new AusgangEmail(this.kern, { rechte, historie: this.mappenHistorie, dokumente: this.dokumente, ausgang, stempel: stempelvorlagen, systemmappen }, {
      pruefeAusgang: (ich, z, weg, ids) => this.ausgang.pruefeAusgang(ich, z, weg, ids), entsperrtZu,
    });
    const exportieren = new AusgangExport(this.kern, { rechte, sichten: this.sichten, fehlend: this.dateienFehlen, ausgang, stempel: stempelvorlagen }, {
      mitnehmbar: (ich, z, ids) => this.ausgang.mitnehmbar(ich, z, ids), entsperrtZu,
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
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), erwaehnungenAbgleichen: (...a) => this.aufgaben.erwaehnungenAbgleichen(...a), uebersetzung: () => this.uebersetzung,
    });
    const ereignisse = new EreignisseDienst(this.kern, { rechte: this.rechtepruefung, typpakete: this.typpakete, ki }, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von), ereignisWecker: () => this.ereignisWecker,
      nachTexterkennungsEreignis: (paket, e, r) => this.volltexte.nachTexterkennungsEreignis(paket, e, r),
    });
    const automatisierung = new Automatisierungshilfen(this.kern, this.rechtepruefung, { listeRollen: () => this.postSystemmappen.listeRollen() });
    return { ki, notizen, ereignisse, automatisierung };
  }

  /** Aufgaben (#1078): die Klassen in aufgaben/ kennen einander über `teile`; Ereignis, Konten und Gültigkeit über den Anschluss. */
  private baueAufgaben(ereignisse: EreignisseDienst) {
    const teile = { rechte: this.rechtepruefung, historie: this.mappenHistorie, mappen: this.mappen, ereignisse, systemmappen: this.postSystemmappen } as AufgabenTeile;
    const anschluss = { ereignis: (...a: Parameters<Kern['ereignis']>) => this.kern.ereignis(...a), konten: () => this.konten, gueltigkeit: () => this.gueltigkeit() };
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
    const anschluss = { ereignis: (...a: Parameters<Kern['ereignis']>) => this.kern.ereignis(...a), aktualisiereTitel: (ids: string[]) => this.mappenTitel.aktualisiereTitel(ids), konten: () => this.konten };
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
      if (!e.angelegt) await this.vertretung.passungsAufgaben([{ id: e.mappe.id, problem: null }]);
      if (e.typ.felder.some((f) => f.eindeutig)) await this.passung.pruefeUnpassende(e.typ);
    });
    a.mappeGeaendert.anmelden('aufgaben.erwaehnungen', async (e) => { if (!e.demo) await this.aufgaben.pruefeErwaehnungen(e.typ, e.mappe.id, e.alt, e.neu, e.von); });
    // Fristen (#129): neues Datum → „Frist erreicht“, verschobenes oder leeres → alte erledigt.
    a.mappeGeaendert.anmelden('aufgaben.fristen', async (e) => {
      if (e.angelegt && (e.demo || !fristFelder(e.typ).length)) return;
      await this.fristen.fristenAbgleichen({ mappeIds: [e.mappe.id] });
    });
    // Post (#192): „Für“ und Stand bestimmen die Aufgabe „Post für dich“.
    a.mappeGeaendert.anmelden('post.aufgaben', async (e) => { if (!e.angelegt && e.typ.system === 'post') await this.post.postAufgaben(e.mappe.id, e.von); });
    // Mappentyp geändert: Ansicht umbenennen → Titel → Passung → Fristen.
    a.typGeaendert.anmelden('sichten.umbenennen', async ({ alt, typ }) => {
      // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
      const eigene = (await this.repo.listeSichten()).find((x) => x.id === typ.id);
      if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(typ.id, { ...eigene, name: typ.name });
    });
    // Ist Teil einer anderen Mappe (#1031) umgeschaltet: aus den Ansichten heraus bzw. wieder mit eigener Ansicht.
    a.typGeaendert.anmelden('sichten.teile', async ({ alt, typ }) => { await this.sichtenVerwaltung.teilUmgeschaltet(alt, typ); });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    a.typGeaendert.anmelden('mappen.titel', async ({ typ }) => { await this.mappenTitel.aktualisiereTitel((await this.repo.listeMappen(typ.id)).map((m) => m.id)); });
    a.typGeaendert.anmelden('mappentypen.passung', async ({ typ }) => { await this.passung.pruefePassung(typ.id); });
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    a.typGeaendert.anmelden('aufgaben.fristen', async ({ typ }) => { await this.fristen.fristenAbgleichen({ typId: typ.id }); });
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    a.typAngelegt.anmelden('sichten.eigeneSicht', async ({ typ, sicht }) => { if (sicht) await this.sichtenVerwaltung.sichtFuerTyp(typ); });
    // Abwesenheit (#78): Historie an der Benutzer-Mappe, Ereignisse, Aufgaben mit Anlass „Abwesenheit“.
    a.benutzerGespiegelt.anmelden('aufgaben.abwesenheit', async ({ benutzer, von, abwesenheit }) => {
      if (abwesenheit) await this.vertretung.abwesenheitGeaendert(benutzer, abwesenheit.vorher, von, abwesenheit.wegen);
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


  /* ---------- Suche (#964: in suche/suche.dienst.ts) ---------- */


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


  /* ---------- Geschützte PDFs (#827, dokumente/geschuetzte-pdf.ts) ---------- */



  /* ---------- Dateien umwandeln (#577, dokumente/umwandeln.ts) ---------- */


  /* ---------- Archivfassung (PDF/A, #631, dokumente/archivfassung.ts) ---------- */


  /* ---------- Volltext aus Paketen (#614, volltext/aus-paketen.ts) ---------- */


  /* ---------- Volltext (#45, volltext/volltext.dienst.ts) ---------- */

  private static volltextAn(typ: Mappentyp | undefined, registerKey: string) { return VolltextDienst.volltextAn(typ, registerKey); }

  /** Sicherung außer Haus (#585): ein Paket hat das Ereignis sicherung.fertig aufgegeben (index.ts verbindet mit der Sicherung). */
  sicherungAufgegeben?: (paket: string, name: string, fehler: string | null | undefined) => Promise<void>;
  /** Sicherung außer Haus (#636): Antwort des Pakets auf einen Aufruf von sicherung.fertig (index.ts verbindet mit der Sicherung). */
  sicherungAntwort?: (paket: string, name: string, r: EreignisAufruf) => Promise<void>;


  private verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /* ---------- Passwortfelder (#46) ---------- */


  /* ---------- Aufgaben (#54) und Erwähnungen (#56), aufgaben/aufgaben.dienst.ts ---------- */


  /* ---------- Abwesenheit und Vertretung (#77, #78), aufgaben/vertretung.ts ---------- */


  /* ---------- Aufgaben bei Personen ohne Leserecht (#798), aufgaben/ohne-leserecht.ts ---------- */


  /* ---------- Fristen (#129–#133), aufgaben/fristen.ts ---------- */


  /* ---------- Notizen (#55) ---------- */


  /* ---------- E-Mail aus der Mappe (#58, #151, ausgang/email.ts) ---------- */


  /* ---------- Notizen anlegen, ändern, löschen (#55, mappen/notizen.ts) ---------- */


  /* ---------- Favorit = Abo (#422) ---------- */


  /* ---------- Favoriten benachrichtigen: Freigabe in der Werkbank (#506, aufgaben/aufgaben.dienst.ts) ---------- */


  /* ---------- Aufgaben ohne Empfänger an einen Alltags-Benutzer (#719, aufgaben/ohne-empfaenger.ts) ---------- */


  /* ---------- Sichten: seitenweise und gezählt (sichten/sichten.dienst.ts) ---------- */


  /* ---------- Favoriten (#62) ---------- */


  /* ---------- Berechtigungen (#123–#127) ---------- */

  /* ---------- Rechte prüfen (#1072: in zugriff/zugriff.dienst.ts) ---------- */


  /* ---------- Pakete am Mappentyp (#686) ---------- */


  /* ---------- KI-Dienste und Mappentypen (#796, mappentypen/ki-typen.ts) ---------- */


  /* ---------- Berechtigungen in der Werkbank (#123, #125, berechtigungen/berechtigungen.dienst.ts) ---------- */


  private static protokolliereBerechtigungen(typ: Mappentyp, niemand: number) { BerechtigungenDienst.protokolliereBerechtigungen(typ, niemand); }


  /* ---------- Sichten verwalten (#38, sichten/verwalten.ts) ---------- */

  private static konfigurationKonflikt(art: 'typ' | 'sicht', aktuell?: string): Fachfehler { return SichtenVerwaltung.konfigurationKonflikt(art, aktuell); }

  /* ---------- Passung: passt eine Mappe zur aktuellen Definition? ---------- */


  /* ---------- Titel ---------- */


  /* ---------- Ansicht der Werkbank (#281, werkbank/werkbank.dienst.ts) ---------- */

  werkbankAnsicht(wer: { id: string | null; email: string }) { return this.werkbank.werkbankAnsicht(wer); }
  setzeWerkbankAnsicht(wer: { id: string | null; email: string }, body: Record<string, unknown>) { return this.werkbank.setzeWerkbankAnsicht(wer, body); }
  merkmale() { return this.werkbank.merkmale(); }
  setzeMerkmale(body: unknown, von: string) { return this.werkbank.setzeMerkmale(body, von); }

  /* ---------- Pakete (#188): die Logik steckt in pakete.ts; die Ablage ruft das Repo des Kerns bzw. pakete/pakete.einstellungen.ts (#961) ---------- */

  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;

  /* ---------- Ereigniskatalog (#670; Verteiler hier, Zustellung an Pakete in ereignisse/ereignisse.dienst.ts) ---------- */

  /** Verteiler des Katalogs; Abnehmer (Pakete hier, Automatisierungen #674, Webhooks #671) melden sich mit `abonniere` an. */
  readonly ereignisse = new Ereignisverteiler({ repo: () => this.kern.repoOhneTransaktion, ruht: () => this.ereignisseRuhen?.() ?? false });
  /** Wartung, Wiederherstellung (vom Start gesetzt): dann verteilt der Katalog nichts. */
  ereignisseRuhen?: () => boolean | Promise<boolean>;



  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null { return this.tresor?.entschluessele(wert) ?? null; }


  /* ---------- Beispiel-Mappen aus Paketen (#878, loeschen/beispiele.ts) ---------- */


  /* ---------- Nummernkreise (#171) ---------- */


  /* ---------- Export mehrerer Mappen (#152, ausgang/export.ts) ---------- */


  /* ---------- Wege nach draußen: die gemeinsame Prüfstelle (#723), Stempel, Fassungen (ausgang/ausgang.dienst.ts) ---------- */


  /* ---------- Systemtypen: Benutzer und Rollen (#26, #27) ---------- */



  /* ---------- Post (#192, post/post.dienst.ts; Auflösen post/aufloesen.ts) ---------- */


  /* ---------- Systemmappen, Benutzer-Mappen, Rollen, Systemkonten (#43, #673, post/systemmappen.ts) ---------- */


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


  /* ---------- Papierkorb (#43, loeschen/papierkorb.ts) ---------- */


  /* ---------- Löschprotokoll lesen (#470, loeschen/loeschprotokoll.ts) ---------- */


  /* ---------- Demo-Daten (#248, datenschutz/datenschutz.dienst.ts) ---------- */

  mappenJeTyp(): Promise<Map<string, number>> { return this.datenschutzDienst.mappenJeTyp(); }
  demoUebersicht() { return this.datenschutzDienst.demoUebersicht(); }
  entferneDemo(...a: Parameters<DatenschutzDienst['entferneDemo']>) { return this.datenschutzDienst.entferneDemo(...a); }
  legeDemoDokumentAn(...a: Parameters<DatenschutzDienst['legeDemoDokumentAn']>) { return this.datenschutzDienst.legeDemoDokumentAn(...a); }

  /* ---------- Eingangskanäle (#195, post/eingangskanaele.ts) ---------- */


  /** Dokumente einer Mappe ohne Rechteprüfung (#878: Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren). */
  listeDokumente(mappeId: string) { return this.repo.listeDokumente(mappeId); }

  /* ---------- Dokumente (#1075, dokumente/dokumente.dienst.ts) ---------- */


  /* ---------- Stempel beim Weitergeben (#394, pdf-bearbeiten/stempelvorlagen.ts) ---------- */


  /* ---------- PDF bearbeiten (#335, pdf-bearbeiten/pdf-bearbeiten.dienst.ts) ---------- */


  /* ---------- Post fotografieren (#490, post/foto.ts) ---------- */


  /* ---------- PDF verkleinern (#393, pdf-bearbeiten/verkleinern.ts) ---------- */


  /* ---------- Schwärzen (#392, pdf-bearbeiten/schwaerzen.ts) ---------- */


  /* ---------- Archivnummer (#345) ---------- */


  /* ---------- Vollexport (#254, datenschutz/vollexport.ts) ---------- */

  vollexportQuelle(...a: Parameters<VollexportQuellen['vollexportQuelle']>): ExportQuelle { return this.vollexport.vollexportQuelle(...a); }
  persoenlicheQuelle(...a: Parameters<VollexportQuellen['persoenlicheQuelle']>): Promise<ExportQuelle> { return this.vollexport.persoenlicheQuelle(...a); }

  /* ---------- Baum-Sammlung über Verweise (#396, #424, loeschen/mit-verknuepften.ts) ---------- */


  /* ---------- Mappe mit allen verknüpften Mappen löschen (#424, loeschen/mit-verknuepften.ts) ---------- */


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


  /* ---------- Fehlende Dateien (#877, dokumente/fehlende-dateien.ts) ---------- */


  /* ---------- Versionierung (#194, dokumente/versionen.ts) ---------- */

}
