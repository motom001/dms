import type { Benutzer, Systemkonto } from '../../../shared/src/model';
import { type Tresor, istVerschluesselt } from '../geheimnisse/tresor';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { type Kurzzustand, speicherKurzzustand } from '../zwischenspeicher/kurzzustand';
import { DienstBauteile, type KontenHaken } from './bauteile';
import { Auftraege } from '../prozesse/auftrag';
import { protokoll, kontext } from '../protokoll/protokoll';
import {
  Haushaltsstand,
  ZAEHLT_FUER_TERMINE,
  NUR_FAVORITEN,
  EIGENE_MAPPEN,
  MINDESTENS_MS,
  type Gueltigkeit,
} from '../zwischenspeicher/zaehlerspeicher';
import { Kern } from '../kern';
import { ZugriffDienst } from '../zugriff';
import { MappentypenDienst, TypPakete, Passung, Nummernkreise, Systemtypen, KiTypen } from '../mappentypen';
import {
  MappenHistorie,
  MappenTitel,
  MappenEingaben,
  Passwortfelder,
  MappenArchiv,
  MappenDienst,
  MappenNotizen,
  MappenHinweise,
  keinSchluessel,
} from '../mappen';
import { MappenErwaehnungen } from '../mappen/erwaehnungen';
import {
  DokumenteDienst,
  DokumentUmwandlung,
  DokumentArchivfassung,
  GeschuetztePdfs,
  FehlendeDateien,
  DokumentVersionen,
  DokumentAnlagen,
} from '../dokumente';
import { SucheDienst } from '../suche';
import { SichtenVerwaltung, Systemsichten, SichtenDienst } from '../sichten';
import { BerechtigungenDienst } from '../berechtigungen';
import { VolltextAusPaketen, VolltextDienst, type EreignisAufruf } from '../volltext';
import { Stempelvorlagen, PdfBearbeiten, PdfVerkleinern, Schwaerzen } from '../pdf-bearbeiten';
import { PostSystemmappen, PostAufloesen, PostLeerseiten, PostDienst, Eingangskanaele, PostFotos } from '../post';
import { AusgangDienst, AusgangEmail, AusgangExport } from '../ausgang';
import { Systemausstattung } from '../systemausstattung';
import { EreignisseDienst, Automatisierungshilfen } from '../ereignisse/index';
import {
  AufgabenDienst,
  AufgabenVertretung,
  OhneLeserecht,
  Fristen,
  OhneEmpfaenger,
  MappenAblaeufe,
  type AblaufPlatzhalter,
  type PaketAblaufvorlage,
} from '../aufgaben';
import { LoeschenDienst, Papierkorb, LoeschprotokollVerwaltung, MitVerknuepften, BeispielMappen } from '../loeschen';
import { DatenschutzDienst, VollexportQuellen, AuskunftZustellen } from '../datenschutz';
import { WerkbankDienst } from '../werkbank';
import { OrganisationDienst } from '../organisation';
import { NotfallkontakteDienst } from '../notfallkontakte';
import { TextsatzDienst } from '../textsatz';
import { PaketAktionen } from '../paketaktionen';
import type { MailText } from '../mail/mail';
import type { Repo } from '../repo';
import type { Dateispeicher } from '../dateien/dateispeicher';
import { mitFassungen } from '../fassungen';
import { ETIKETTEN, aufkleberPdf } from '../mappen/aufkleber';
import { Erkennung } from '../erkennung/erkennung';
import { FragenAnDieAblage } from '../suche/fragen';
import { Uebersetzung } from '../sprache/uebersetzung';
import { PaketVolltext } from '../volltext/paketvolltext';
import { Ereignisverteiler } from '../ereignisse/ereignisse';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import type { InstalliertesPaket } from '../../../shared/src/pakete';

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

/**
 * Zusammenbau (#1079): baut den Kern und die Fachdienste der Fachordner, verdrahtet ihre Anschlüsse und hält sie als
 * Felder. Fachlogik liegt in den Fachordnern; Routen, Module und Tests rufen sie direkt (`dienst.mappen.holeMappe(…)`).
 * Hier bleibt, was der Start anbindet (Konten, Mail, Sicherung, Systemkonten, Automatisierungen), der Tresor und der
 * Verteiler des Ereigniskatalogs. Die Bauteile je Bereich stehen in `bauteile.ts` (#1278).
 */
export class Dienst extends DienstBauteile {
  /**
   * Zustand zwischen Anfragen (#744) – in PostgreSQL für alle Prozesse, sonst im Arbeitsspeicher: u. a. Abruf-Links,
   * deren Code gerade geprüft wird (#455) und die Spur im Verwaltungsmodus (#820).
   */
  readonly kurzzustand: Kurzzustand;
  /** Hintergrundaufträge, z. B. Demo-Daten erzeugen. */
  readonly auftraege = new Auftraege((m) => protokoll.modul('werkbank').info(m));

  protected tresor?: Tresor;
  protected einstellungen?: Einstellungen;
  protected konten?: KontenHaken;

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
  get fristenstand() {
    return this.stand;
  }
  /** Mindestgültigkeit der Zahlen bei Anfragen nach Änderungen anderer (#742); Tests stellen sie auf 0. */
  mindestensMs = MINDESTENS_MS;
  /** Gültigkeit für die laufende Anfrage: in einer Anfrage mit Person kurz, sonst (Hintergrund) immer frisch. */
  protected gueltigkeit(): Gueltigkeit {
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
  /** Erwähnen mit @ (#889): Vorschläge, aktuelle Titel, wo eine Mappe erwähnt ist – beim ersten Gebrauch angelegt. */
  private erwaehnungenTeil?: MappenErwaehnungen;
  get erwaehnungen(): MappenErwaehnungen {
    return (this.erwaehnungenTeil ??= new MappenErwaehnungen(this.kern, this.rechtepruefung));
  }
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
  /** Anlagen (#998): lesen, anhängen, lösen, umsortieren, umbenennen. */
  readonly dokumentAnlagen: DokumentAnlagen;
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
  /** Leerseiten markieren, wählen und beim Übernehmen weglassen (#997). */
  readonly postLeerseiten: PostLeerseiten;
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
  /** Automatisierungsvorlagen und Mappen-Abläufe: Aufgabe vergeben, Erinnern, Wiedervorlage (#1044). */
  readonly ablaeufe: MappenAblaeufe;
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
  private notfallkontakteDienst?: NotfallkontakteDienst;
  /** Notfallkontakte (#812): Werkbank → Verschlüsselung, Info-Mail an Vertrauenspersonen, „Wen fragen?“ im Notfallblatt. */
  get notfallkontakte(): NotfallkontakteDienst {
    return (this.notfallkontakteDienst ??= new NotfallkontakteDienst(this.kern, { kurzzustand: () => this.kurzzustand }));
  }
  private textsatzDienst?: TextsatzDienst;
  /** Text setzen (#1040): Brief aus einer Text-Vorlage als PDF – beim ersten Gebrauch gebaut. */
  get textsatz(): TextsatzDienst {
    return (this.textsatzDienst ??= new TextsatzDienst(this.kern, this.rechtepruefung, {
      organisation: () => this.organisation.geltende(),
      mitnehmbar: (ich, z, ids) => this.ausgang.mitnehmbar(ich, z, ids),
      ladeHoch: (id, e, inhalt, von) => this.dokumente.ladeHoch(id, { ...e, herkunft: 'vorlage' }, inhalt, von),
      darfAblegen: async (z, id) => {
        const m = await this.repo.holeMappe(id);
        return !!m && (await this.rechtepruefung.rechteAn(z, m)).U;
      },
    }));
  }
  private paketaktionenDienst?: PaketAktionen;
  /**
   * Paket-Aktionen im Menü „Mappe“ (#1039) – beim ersten Gebrauch gebaut; den Paket-Läufer setzt er selbst. Das Paket
   * handelt im Auftrag der Person: Ändern, Anlegen und Hochladen laufen mit dem Zugriff der Person.
   */
  get paketaktionen(): PaketAktionen {
    return (this.paketaktionenDienst ??= new PaketAktionen(this.kern, this.rechtepruefung, {
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
    }));
  }
  /** Mail an die Verwaltenden eines Bereichs (#995) – beim Start verbunden (start/dienst.ts), sonst keine. */
  protected verwaltungsmail?: (bereich: string) => (betreff: MailText, text: MailText) => Promise<void>;

  constructor(
    grundRepo: Repo,
    private dateien: Dateispeicher,
    opt: DienstOptionen = {},
  ) {
    super();
    this.verbindeStand(grundRepo);
    this.kern = this.baueKern(grundRepo, dateien, opt);
    ({
      rechtepruefung: this.rechtepruefung,
      mappentypen: this.mappentypen,
      typpakete: this.typpakete,
      passung: this.passung,
      nummernkreise: this.nummernkreise,
      systemtypen: this.systemtypen,
    } = this.baueZugriffUndTypen());
    ({
      historie: this.mappenHistorie,
      titel: this.mappenTitel,
      eingaben: this.mappenEingaben,
      passwortfelder: this.passwortfelder,
      archiv: this.mappenArchiv,
      hinweise: this.mappenHinweise,
      mappen: this.mappen,
    } = this.baueMappen());
    ({
      dokumente: this.dokumente,
      umwandlung: this.dokumentUmwandlung,
      archiv: this.dokumentArchiv,
      pdfs: this.geschuetztePdfs,
      fehlend: this.dateienFehlen,
      versionen: this.dokumentVersionen,
      anlagen: this.dokumentAnlagen,
    } = this.baueDokumente());
    this.suche = new SucheDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    ({
      verwalten: this.sichtenVerwaltung,
      systemsichten: this.systemsichten,
      sichten: this.sichten,
      berechtigungen: this.berechtigungen,
      ausPaketen: this.volltextAusPaketen,
      volltext: this.volltexte,
    } = this.baueSichtenUndVolltext());
    ({
      stempelvorlagen: this.stempelvorlagen,
      pdf: this.pdfBearbeiten,
      verkleinern: this.pdfVerkleinern,
      schwaerzen: this.schwaerzen,
      systemmappen: this.postSystemmappen,
      aufloesen: this.postAufloesen,
      leerseiten: this.postLeerseiten,
      post: this.post,
      eingang: this.eingangskanaele,
      fotos: this.postFotos,
      ausgang: this.ausgang,
      email: this.ausgangEmail,
      export: this.ausgangExport,
    } = this.bauePdfPostAusgang());
    this.systemausstattung = this.baueSystemausstattung();
    ({
      ki: this.ki,
      notizen: this.mappenNotizen,
      ereignisse: this.ereignisseDienst,
      automatisierung: this.automatisierungshilfen,
      aufgaben: this.aufgaben,
      vertretung: this.vertretung,
      ohneLeserecht: this.ohneLeserecht,
      fristen: this.fristen,
      ohneEmpfaenger: this.ohneEmpfaenger,
      ablaeufe: this.ablaeufe,
      loeschen: this.loeschen,
      papierkorb: this.papierkorbVerwaltung,
      protokoll: this.loeschprotokollVerwaltung,
      verknuepft: this.mitVerknuepften,
      beispiele: this.beispielMappen,
      datenschutz: this.datenschutzDienst,
      vollexport: this.vollexport,
      zustellen: this.auskunftZustellen,
      werkbank: this.werkbank,
      organisation: this.organisation,
    } = this.baueAufgabenUndLoeschen());
    this.schliesseEmpfaengerAn();
    this.kurzzustand = opt.zustand ?? speicherKurzzustand();
    this.tresor = opt.tresor;
    this.einstellungen = opt.einstellungen;
    this.registriereImTresor();
    ({
      erkennung: this.erkennung,
      fragen: this.fragen,
      uebersetzung: this.uebersetzung,
      paketVolltext: this.paketVolltext,
    } = this.baueHintergrund());
  }

  /* ---------- Schritte des Konstruktors (#1278, Schritt 6b-1: verschoben, Reihenfolge unverändert) ---------- */

  /** Stand aus der Datenbank (#742), sonst nur dieser Prozess (speicherRepo in Tests). */
  private verbindeStand(grundRepo: Repo) {
    if (typeof grundRepo.haushaltsstand === 'function' && typeof grundRepo.erhoeheHaushaltsstand === 'function') {
      this.stand.verbinde({ lies: () => grundRepo.haushaltsstand!(), erhoehe: () => grundRepo.erhoeheHaushaltsstand!() });
    }
    if (typeof grundRepo.mappenstand === 'function' && typeof grundRepo.erhoeheMappenstand === 'function') {
      this.mappenstand.verbinde({ lies: () => grundRepo.mappenstand!(), erhoehe: () => grundRepo.erhoeheMappenstand!() });
    }
  }

  /** Der Kern (#961) über dem Repo mit Fassungen (#1006) und Ständen (#742, #918). */
  private baueKern(grundRepo: Repo, dateien: Dateispeicher, opt: DienstOptionen): Kern {
    return new Kern({
      repo: this.stand.umhuelle(
        mitFassungen(grundRepo, () => this.fassungen),
        this.mappenstand,
      ),
      dateien,
      einstellungen: opt.einstellungen,
      stand: this.stand,
      wecke: () => this.ereignisse.wecke(),
      ausstatten: () => this.systemausstattung.anlegen(),
      zugriff: (ich) => this.rechtepruefung.zugriff(ich),
      fassungen: () => this.fassungen.fuerKern(),
    });
  }

  /** Rechte prüfen (#1072) und Mappentypen mit Paketen, Passung, Nummernkreisen und Systemtypen (#1073). */
  private baueZugriffUndTypen() {
    const rechtepruefung = new ZugriffDienst(this.kern, { kiSperre: (p) => this.ki.kiSperre(p), konten: () => this.konten });
    const mappentypen = new MappentypenDienst(this.kern, {
      mitStempel: (typen) => this.ausgang.mitStempel(typen),
      pruefeStempelTyp: (v) => this.stempelvorlagen.pruefeStempelTyp(v),
      setzeStempelTyp: (id, st) => this.stempelvorlagen.setzeStempelTyp(id, st),
      erkennung: () => this.erkennung,
      berechtigungenAusEingabe: (typ, e) => this.berechtigungen.berechtigungenAusEingabe(typ, e),
      protokolliereBerechtigungen: (typ, n) => BerechtigungenDienst.protokolliereBerechtigungen(typ, n),
      konfigurationKonflikt: (art, aktuell) => SichtenVerwaltung.konfigurationKonflikt(art, aktuell),
    });
    const typpakete = new TypPakete(this.kern, rechtepruefung, { kiSperre: (p) => this.ki.kiSperre(p), konten: () => this.konten });
    const passung = new Passung(this.kern, { passungsAufgaben: (liste) => this.vertretung.passungsAufgaben(liste) });
    const nummernkreise = new Nummernkreise(this.kern, {
      archivKreis: () => this.mappenArchiv.archivKreis(),
      aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids),
      auftraege: this.auftraege,
    });
    const systemtypen = new Systemtypen(this.kern, rechtepruefung, {
      schreibeSystemMappe: (typ, id, e, von, kennung) => this.postSystemmappen.schreibeSystemMappe(typ, id, e, von, kennung),
      loescheMappeIntern: (id, typ, von) => this.loeschen.loescheMappeIntern(id, typ, von),
      spiegleBenutzer: (b, von, abwesenheit) => this.postSystemmappen.spiegleBenutzer(b, von, abwesenheit),
      aufgabenUebergeben: (id, an, von) => this.vertretung.aufgabenUebergeben(id, an, von),
      kurzzustand: () => this.kurzzustand,
    });
    return { rechtepruefung, mappentypen, typpakete, passung, nummernkreise, systemtypen };
  }

  /** Mappen (#1074): Historie, Titel, Eingaben, Passwortfelder, Archiv, Hinweise (#1034) und der Mappen-Dienst. */
  private baueMappen() {
    const historie = new MappenHistorie(this.kern);
    const titel = new MappenTitel(this.kern, historie);
    const eingaben = new MappenEingaben(this.kern, this.rechtepruefung, { verschluessele: (k) => this.verschluessele(k) });
    const passwortfelder = new Passwortfelder(this.kern, historie, { tresor: () => this.tresor, istVerschluesselt });
    const archiv = new MappenArchiv(this.kern, this.rechtepruefung, historie, {
      aufkleber: { ETIKETTEN, aufkleberPdf },
      auftraege: this.auftraege,
      schreibeFehlendeDateien: (shas) => this.dateienFehlen.schreibeFehlendeDateien(shas),
    });
    const hinweise = new MappenHinweise(this.kern, this.rechtepruefung);
    const mappen = new MappenDienst(
      this.kern,
      this.rechtepruefung,
      { historie, titel, eingaben, hinweise },
      {
        konten: () => this.konten,
        favoritenBenachrichtigungErlaubt: (id) => this.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(id),
        ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich),
        mitArchivStand: (d) => this.dokumentArchiv.mitArchivStand(d),
        mitPdfSchutz: (d) => this.geschuetztePdfs.mitPdfSchutz(d),
        datenschutz: () => this.datenschutzDienst.datenschutz(),
        loeschPruefung: (m, typ, rueck, alleTypen) => this.loeschen.loeschPruefung(m, typ, rueck, alleTypen),
        meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
        verschluessele: (k) => this.verschluessele(k),
        aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids),
        organisationGeaendert: (e) => this.organisation.geaendert(e),
      },
    );
    return { historie, titel, eingaben, passwortfelder, archiv, hinweise, mappen };
  }

  /** Systemausstattung (#963): Mappentypen, Ansichten und Post nacheinander. */
  private baueSystemausstattung(): Systemausstattung {
    return new Systemausstattung(this.kern, {
      mappentypen: { sichereSystemtypen: () => this.systemtypen.sichereSystemtypen() },
      sichten: {
        sichtFuerTyp: (typ) => this.sichtenVerwaltung.sichtFuerTyp(typ),
        sichereFavoritenSicht: () => this.systemsichten.sichereFavoritenSicht(),
      },
      post: { sicherePostSichten: (post) => this.systemsichten.sicherePostSichten(post) },
    });
  }

  /** Beim Tresor anmelden, was er lesen können muss (#410). */
  private registriereImTresor() {
    this.tresor?.registriere(() => this.passwortfelder.unlesbarePasswoerter());
    // Was verschlüsselt ist, je Art (#410): dieselben Stellen, die der Schlüsselwechsel umschlüsselt.
    // Passwortfelder meldet unlesbarePasswoerter genauer (mit Feldnamen), den Mailserver der Betrieb.
    this.tresor?.registriereBestand(() => this.repo.verschluesselteFundstellen(), ['passwortfeld', 'mail']);
  }

  /** Erkennung, Fragen, Übersetzung und Volltext aus Paketen – mit ihren Abnehmern im Ereigniskatalog. */
  private baueHintergrund() {
    // Erkennung (#336): rechnet, sobald der Volltext eines Dokuments fertig ist – egal, wer ihn geliefert hat.
    const erkennung = new Erkennung(
      this,
      () => this.repo,
      () => this.einstellungen,
    );
    const fragen = new FragenAnDieAblage(
      this,
      () => this.repo,
      () => this.einstellungen,
    );
    // Inhalte übersetzen (#732): auf Knopfdruck; Änderungen am Original lassen die Übersetzungen verfallen.
    const uebersetzung = new Uebersetzung(
      this,
      () => this.repo,
      () => this.einstellungen,
      () => this.kurzzustand,
    );
    this.ereignisse.abonniere('uebersetzung', (e) => this.uebersetzung.nachEreignis(e));
    this.volltexte.beiVolltextFertig(async (e) => {
      await this.erkennung.nachVolltext(e);
    });
    // Ereigniskatalog (#670): Mappen-Ereignisse und Fristen an die Pakete, die diese Mappentypen abonniert haben.
    this.ereignisse.abonniere('pakete', (e) => this.ereignisseDienst.ereignisAnPakete(e));
    // Volltext aus Paketen (#614): zuständige Pakete mit dms:volltext, Ereignis datei.volltext an genau dieses.
    const paketVolltext = new PaketVolltext({
      pakete: () => this.repo.listePakete(),
      melde: (paket, daten) => this.ereignisseDienst.auftrag(paket, 'datei.volltext', daten),
    });
    return { erkennung, fragen, uebersetzung, paketVolltext };
  }

  /** Volltext aus Paketen (#614, paketvolltext.ts); die Texterkennung meldet darüber (index.ts). */
  readonly paketVolltext: PaketVolltext;

  /** Erkennung im Kern (#336, #391): Vorschläge aus dem Volltext. */
  readonly erkennung: Erkennung;
  /** „Frag deine Ablage“ (#444): Ausschnitte suchen, Antwort-Paket fragen, Quellen prüfen. */
  readonly fragen: FragenAnDieAblage;
  /** Inhalte übersetzen auf Knopfdruck (#732): Paket mit dms:uebersetzen, Zwischenspeicher im Kurzzustand. */
  readonly uebersetzung: Uebersetzung;

  /** Das Repo – innerhalb von `inTransaktion` das der Transaktion (Kern). */
  protected get repo(): Repo {
    return this.kern.repo;
  }

  /* ---------- Anbinden beim Start (index.ts, ablago.ts) ---------- */

  /** Konten anbinden: Benutzer-Mappen im Papierkorb (#43). */
  verbindeKonten(h: KontenHaken) {
    this.konten = h;
  }
  /** Mail an die Verwaltenden eines Bereichs anbinden (#995: Notiz zur eigenen Organisation). */
  verbindeVerwaltungsmail(f: (bereich: string) => (betreff: MailText, text: MailText) => Promise<void>) {
    this.verwaltungsmail = f;
  }
  /** Mail an alle, die einen Bereich verwalten (#1562: „Was Ablago darf“ erhöht – Bereich Übersicht, also alle). */
  async mailAnVerwaltende(bereich: string, betreff: MailText, text: MailText) {
    await this.verwaltungsmail?.(bereich)(betreff, text);
  }

  /** Sicherung außer Haus (#585): ein Paket hat das Ereignis sicherung.fertig aufgegeben (index.ts verbindet mit der Sicherung). */
  sicherungAufgegeben?: (paket: string, name: string, fehler: string | null | undefined) => Promise<void>;
  /** Entfernte Sicherungen (#976): Aufträge „auflisten“ und „holen“ an ein Paket mit dms:sicherung-holen; setzt der Paket-Läufer. */
  sicherungHolen?: { rufe(paket: string, eingang: Record<string, unknown>, ms?: number): Promise<string> };
  /** Sicherung außer Haus (#636): Antwort des Pakets auf einen Aufruf von sicherung.fertig (index.ts verbindet mit der Sicherung). */
  sicherungAntwort?: (paket: string, name: string, r: EreignisAufruf) => Promise<void>;

  /** Wird beim Anlegen eines Ereignisses aufgerufen (der Läufer stellt dann gleich zu). */
  ereignisWecker: (() => void) | null = null;

  /* ---------- Ereigniskatalog (#670; Verteiler hier, Zustellung an Pakete in ereignisse/ereignisse.dienst.ts) ---------- */

  /** Verteiler des Katalogs; Abnehmer (Pakete hier, Automatisierungen #674) melden sich mit `abonniere` an. */
  readonly ereignisse = new Ereignisverteiler({ repo: () => this.kern.repoOhneTransaktion, ruht: () => this.ereignisseRuhen?.() ?? false });
  /** Wartung, Wiederherstellung (vom Start gesetzt): dann verteilt der Katalog nichts. */
  ereignisseRuhen?: () => boolean | Promise<boolean>;

  /* ---------- Tresor (#39, #46, #47) ---------- */

  protected verschluessele = (klartext: string) => (this.tresor ? this.tresor.verschluessele(klartext) : keinSchluessel());

  /** Schlüssel wechseln (#47): alle Passwortfelder, der Papierkorb und die Einstellungen in einer Transaktion. */
  async schluesselWechseln(von: string) {
    if (!this.tresor) throw new Fachfehler(404, t('meldungen.dienst.die-verschluesselung-ist-nicht'));
    return this.tresor.wechsle((um, einstellungen) => this.repo.umschluesseln(um, einstellungen), von);
  }

  /** Geheimnisse von Paketen mit dem Tresor des DMS. */
  verschluesselePaketGeheimnis(text: string): string {
    return this.verschluesseleGeheimnis(text);
  }
  /** Ein Geheimnis mit dem Tresor verschlüsseln (Pakete; Aufruf von außen, #679) – ohne Schlüssel ein Fehler. */
  verschluesseleGeheimnis(text: string): string {
    if (!this.tresor?.bereit) throw new Fachfehler(409, t('meldungen.dienst.fuer-geheimnisse-fehlt-der'));
    return this.tresor.verschluessele(text);
  }
  entschluessele(wert: string): string | null {
    return this.tresor?.entschluessele(wert) ?? null;
  }

  /* ---------- Vom Start gesetzt (Systemkonten #673, Automatisierungen #674, #712, #1041) ---------- */

  /** Systemkonten des DMS (#673), vom Start gesetzt (Konten legen sie bei Bedarf an). */
  systemkonten?: (kennung: Systemkonto) => Promise<Benutzer>;
  /** Automatisierungen, die ein Konto ausführt (#674 setzt das); bis dahin keine. */
  automatisierungenVon?: (kontoId: string) => Promise<Array<{ id: string; name: string; angehalten?: boolean }>>;
  /** Tägliche Zusammenfassung an einen Benutzer (#678, Dann-Karte); setzt der Server aus der Aufgaben-Mail. */
  zusammenfassungAn?: (benutzerId: string, trocken: boolean) => Promise<{ gesendet: boolean; grund: string }>;
  /** Anmeldeschutz melden (#678, Dann-Karte): Sammelmeldung bzw. Kontosperre; setzt der Server aus dem Anmeldeschutz. */
  anmeldeschutzMelden?: (
    was: 'sammel' | 'konto',
    daten: Record<string, unknown>,
    trocken: boolean,
  ) => Promise<{ gesendet: boolean; grund: string }>;
  /** Erinnerungen am Feld als Automatisierungen übernehmen (#712); setzt der Baustein Automatisierungen. */
  fristenUebernehmen?: () => Promise<number>;
  /** Mitgelieferte Automatisierungen eines Pakets anlegen bzw. aktualisieren (#712); setzt der Baustein Automatisierungen. */
  paketAutomatisierungen?: (
    p: InstalliertesPaket,
    liste: Array<{
      schluessel: string;
      name: string;
      beschreibung: string;
      wenn: Record<string, unknown>;
      und?: Record<string, unknown>;
      dann: unknown[];
    }>,
    ein?: string[],
  ) => Promise<number>;
  /** Update-Vorschau (#1174): selbst geänderte mitgelieferte Automatisierungen und was die neue Paketfassung anders macht. */
  paketAutomatisierungenVergleich?: (
    p: InstalliertesPaket,
    liste: Array<{
      schluessel: string;
      name: string;
      beschreibung: string;
      wenn: Record<string, unknown>;
      und?: Record<string, unknown>;
      dann: unknown[];
    }>,
  ) => Promise<Record<string, { id: string; aenderungen: string[] }>>;
  /**
   * Umbau (#1041): Automatisierungen auf einen umgebauten Typ zeigen lassen – alter Typ → Zieltyp, Feldkennungen alt →
   * neu; setzt der Motor (automatisierung/motor/). Ergebnis: wie viele geändert wurden.
   */
  typUmgebaut?: (alt: string, neu: string, felder: Record<string, string>) => Promise<number>;
  /** Platzhalter der Automatisierungsvorlagen (#1044, #795) – setzt der Motor (automatisierung/motor/); ohne ihn bleiben sie stehen. */
  ablaufPlatzhalter?: AblaufPlatzhalter;
  /** Mitgelieferte Automatisierungsvorlagen eines Pakets anlegen bzw. aktualisieren (#1044); leere Liste beim Entfernen. */
  paketAblaufvorlagen?: (p: InstalliertesPaket, liste: PaketAblaufvorlage[]) => Promise<number>;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das). */
  automatisierungenExport?: () => Promise<unknown[]>;
  /**
   * Wer Favoriten-Änderungen bekommt (#1001, bis dahin Werkbank → Aufgaben): je eingeschalteter Automatisierung mit der
   * Karte „Favoriten-Änderungen melden“ ihre Rollen (leer = alle) und die Vorgabe für neue Benutzer. Setzt der Motor;
   * ohne ihn (Tests ohne Automatisierungen) gilt: für alle, Vorgabe an.
   */
  favoritenRegeln?: () => Promise<Array<{ rollen: string[]; vorgabe: boolean }>>;
  /** Uhrzeit der Täglichen Zusammenfassung (#1001, Profil „Standard“) aus der eingeschalteten Automatisierung; null = keine. */
  zusammenfassungVorgabe?: () => Promise<{ uhrzeit: string } | null>;

  /**
   * Dokumente einer Mappe ohne Rechteprüfung (#878: Paket erstellen mit Beispiel-Dokumenten, nur für Administratoren).
   * Bleibt hier (#1079): ein Lesen am Repo vorbei, das nicht in die Routen gehört.
   */
  listeDokumente(mappeId: string) {
    return this.repo.listeDokumente(mappeId);
  }
}
