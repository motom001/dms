/**
 * Bauteile des Dienstes (#1278, vorher in `dienst/dienst.ts`): Fassungen und die Fachdienste je Bereich (Dokumente,
 * Sichten und Volltext, PDF/Post/Ausgang, Aufgaben, Löschen, Datenschutz), dazu die Empfänger der Ereignisse.
 * `Dienst` erweitert diese Klasse: Der Konstruktor dort ruft die Bauteile hier; was sie von `Dienst` lesen, ist unten
 * abstrakt angekündigt. Die Rümpfe sind unverändert übernommen.
 */
import {
  MappenAblaeufe,
  type AblaufPlatzhalter,
  AufgabenDienst,
  Fristen,
  OhneEmpfaenger,
  OhneLeserecht,
  AufgabenVertretung,
  type AufgabenTeile,
} from '../aufgaben';
import { Auftraege } from '../prozesse/auftrag';
import { AusgangDienst, AusgangEmail, AusgangExport } from '../ausgang';
import {
  FehlendeDateien,
  DokumentAnlagen,
  DokumentArchivfassung,
  DokumentUmwandlung,
  DokumentVersionen,
  DokumenteDienst,
  GeschuetztePdfs,
} from '../dokumente';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { EreignisseDienst, Automatisierungshilfen } from '../ereignisse/index';
import { MappenErwaehnungen } from '../mappen/erwaehnungen';
import { type Gueltigkeit, Haushaltsstand } from '../zwischenspeicher/zaehlerspeicher';
import { Kern } from '../kern';
import type { Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { LoeschenDienst, type LoeschenTeile, Papierkorb, LoeschprotokollVerwaltung, MitVerknuepften, BeispielMappen } from '../loeschen';
import { MappenDienst, MappenArchiv, MappenEingaben, MappenHistorie, MappenTitel, MappenNotizen } from '../mappen';
import { MappentypenDienst, Nummernkreise, Passung, TypPakete, KiTypen } from '../mappentypen';
import { PaketVolltext } from '../volltext/paketvolltext';
import { PdfVerkleinern, Stempelvorlagen, PdfBearbeiten, Schwaerzen } from '../pdf-bearbeiten';
import { PostDienst, PostSystemmappen, PostLeerseiten, PostAufloesen, Eingangskanaele, PostFotos } from '../post';
import { ZugriffDienst } from '../zugriff';
import type { Repo } from '../repo';
import { type EreignisAufruf, VolltextDienst, VolltextAusPaketen } from '../volltext';
import { SichtenDienst, SichtenVerwaltung, Systemsichten } from '../sichten';
import { SucheDienst } from '../suche';
import { Systemausstattung } from '../systemausstattung';
import type { Systemkonto, Benutzer, Mappentyp } from '../../../shared/src/model';
import type { Tresor } from '../geheimnisse/tresor';
import { Uebersetzung } from '../sprache/uebersetzung';
import type { MailText } from '../mail/mail';
import { Fassungen, typGegenstand, sichtGegenstand, nummernkreisGegenstand, stempelGegenstand } from '../fassungen';
import { paketEinstellungen } from '../pakete/index';
import { BerechtigungenDienst } from '../berechtigungen';
import { sichereZuordnung, type PostErkennung } from '../erkennung/erkennung';
import { WerkbankDienst } from '../werkbank';
import { OrganisationDienst } from '../organisation';
import { ORGANISATION_BEREICH } from '../../../shared/src/organisation';
import { type DatenschutzTeile, DatenschutzDienst, VollexportQuellen, AuskunftZustellen } from '../datenschutz';
import { fristFelder } from '../../../shared/src/fristen';

/**
 * Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43; #1278, Schritt 5b: hier statt in
 * dienst.ts, das diese Klasse erweitert).
 */
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

/** Bauteile, die der Konstruktor von `Dienst` aufruft. */
export abstract class DienstBauteile {
  /* ---------- Was die Bauteile von Dienst lesen (dort gesetzt) ---------- */
  abstract readonly ablaeufe: MappenAblaeufe;
  abstract ablaufPlatzhalter?: AblaufPlatzhalter;
  abstract readonly aufgaben: AufgabenDienst;
  abstract readonly auftraege: Auftraege;
  abstract readonly ausgang: AusgangDienst;
  abstract automatisierungenExport?: () => Promise<unknown[]>;
  abstract automatisierungenVon?: (kontoId: string) => Promise<Array<{ id: string; name: string; angehalten?: boolean }>>;
  abstract readonly dateienFehlen: FehlendeDateien;
  abstract readonly dokumentAnlagen: DokumentAnlagen;
  abstract readonly dokumentArchiv: DokumentArchivfassung;
  abstract readonly dokumentUmwandlung: DokumentUmwandlung;
  abstract readonly dokumentVersionen: DokumentVersionen;
  abstract readonly dokumente: DokumenteDienst;
  protected abstract einstellungen?: Einstellungen;
  abstract ereignisWecker: (() => void) | null;
  abstract readonly ereignisseDienst: EreignisseDienst;
  abstract get erwaehnungen(): MappenErwaehnungen;
  abstract favoritenRegeln?: () => Promise<Array<{ rollen: string[]; vorgabe: boolean }>>;
  abstract readonly fristen: Fristen;
  abstract readonly geschuetztePdfs: GeschuetztePdfs;
  protected abstract gueltigkeit(): Gueltigkeit;
  abstract readonly kern: Kern;
  protected abstract konten?: KontenHaken;
  abstract readonly kurzzustand: Kurzzustand;
  abstract readonly loeschen: LoeschenDienst;
  abstract readonly mappen: MappenDienst;
  abstract readonly mappenArchiv: MappenArchiv;
  abstract readonly mappenEingaben: MappenEingaben;
  abstract readonly mappenHistorie: MappenHistorie;
  abstract readonly mappenTitel: MappenTitel;
  abstract readonly mappenstand: Haushaltsstand;
  abstract readonly mappentypen: MappentypenDienst;
  abstract readonly nummernkreise: Nummernkreise;
  abstract readonly ohneEmpfaenger: OhneEmpfaenger;
  abstract readonly ohneLeserecht: OhneLeserecht;
  abstract readonly paketVolltext: PaketVolltext;
  abstract readonly passung: Passung;
  abstract readonly pdfVerkleinern: PdfVerkleinern;
  abstract readonly post: PostDienst;
  abstract readonly postSystemmappen: PostSystemmappen;
  abstract readonly rechtepruefung: ZugriffDienst;
  protected abstract get repo(): Repo;
  abstract sicherungAntwort?: (paket: string, name: string, r: EreignisAufruf) => Promise<void>;
  abstract sicherungAufgegeben?: (paket: string, name: string, fehler: string | null | undefined) => Promise<void>;
  abstract readonly sichten: SichtenDienst;
  abstract readonly sichtenVerwaltung: SichtenVerwaltung;
  abstract readonly stand: Haushaltsstand;
  abstract readonly stempelvorlagen: Stempelvorlagen;
  abstract readonly suche: SucheDienst;
  abstract readonly systemausstattung: Systemausstattung;
  abstract systemkonten?: (kennung: Systemkonto) => Promise<Benutzer>;
  protected abstract tresor?: Tresor;
  abstract readonly typpakete: TypPakete;
  abstract readonly uebersetzung: Uebersetzung;
  protected abstract verschluessele: (klartext: string) => string;
  abstract readonly vertretung: AufgabenVertretung;
  protected abstract verwaltungsmail?: (bereich: string) => (betreff: MailText, text: MailText) => Promise<void>;
  abstract readonly volltexte: VolltextDienst;

  /**
   * Fassungen (#1006): Mappentypen, Ansichten, Nummernkreise, Stempel-Vorlagen und Automatisierungsvorlagen hier; die
   * übrigen melden sich selbst an. Die Repo-Hülle (`mitFassungen`, im Konstruktor) hält nach jeder Änderung an Typen,
   * Ansichten, Nummernkreisen und Automatisierungsvorlagen die Fassung fest – auf jedem Weg, auch in Transaktionen.
   */
  get fassungen(): Fassungen {
    return (this.fassungenDienst ??= this.baueFassungen());
  }
  private fassungenDienst?: Fassungen;
  private baueFassungen(): Fassungen {
    const f = new Fassungen(this.kern, { einstellung: () => this.einstellungen });
    const a = {
      amTyp: async (id: string) => {
        const erk = (await this.mappentypen.typErkennungen())[id];
        return {
          stempel: (await this.stempelvorlagen.stempelDaten()).typen[id] ?? null,
          ausDokument: erk?.ausDokument ?? null,
          autoZuordnen: !!erk?.auto,
        };
      },
      aendereTyp: (id: string, e: Record<string, unknown>) => this.mappentypen.aendereTyp(id, e),
      unpassendMit: (typ: Mappentyp) => this.passung.unpassendMit(typ),
      aendereSicht: (id: string, e: Record<string, unknown>) => this.sichtenVerwaltung.aendereSicht(id, e),
      speichereNummernkreis: (e: Record<string, unknown>, von: string) => this.nummernkreise.speichereNummernkreis(e, von),
      stempelVorlagen: () => this.stempelvorlagen.stempelVorlagen(),
      speichereStempelVorlage: (id: string, e: Record<string, unknown>, von: string) =>
        this.stempelvorlagen.speichereStempelVorlage(id, e, von),
      repo: () => this.kern.repo,
    };
    for (const g of [
      typGegenstand(a),
      sichtGegenstand(a),
      nummernkreisGegenstand(a),
      stempelGegenstand(a),
      this.ablaeufe.fassungsGegenstand(),
    ])
      f.registriere(g);
    return f;
  }
  /** Dokumente (#1075): die Klassen in dokumente/; was noch im Dienst liegt, kommt über die Anschlüsse. */
  protected baueDokumente() {
    const umwandlung = new DokumentUmwandlung(this.kern, {
      ocr: () => this.dokumente.ocr,
      entsperren: () => this.geschuetztePdfs.entsperren,
      paketVolltext: () => this.paketVolltext,
      auftrag: (paket, art, daten) => this.ereignisseDienst.auftrag(paket, art, daten),
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
    });
    const archiv = new DokumentArchivfassung(this.kern, umwandlung, {
      auftrag: (paket, art, daten) => this.ereignisseDienst.auftrag(paket, art, daten),
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
      paketEinstellungen: (paket) => paketEinstellungen(this.kern, paket),
    });
    const pdfs = new GeschuetztePdfs(
      this.kern,
      { umwandlung, archiv },
      { ocr: () => this.dokumente.ocr, listeTypen: () => this.mappentypen.listeTypen() },
    );
    const versionen = new DokumentVersionen(this.kern, {
      ocr: () => this.dokumente.ocr,
      neueDateien: (docs) => this.dokumente.neueDateien(docs),
      raeumeAuf: (sha) => this.dokumente.raeumeAuf(sha),
      aktualisiereTitel: (ids) => this.mappenTitel.aktualisiereTitel(ids),
      volltextAn: (typ, key) => VolltextDienst.volltextAn(typ, key),
    });
    const dokumente = new DokumenteDienst(
      this.kern,
      { umwandlung, archiv, pdfs, versionen },
      {
        ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
        automatischVerkleinert: (ein, name) => this.pdfVerkleinern.automatischVerkleinert(ein, name),
        volltextFertig: (e, m) => this.volltexte.volltextFertig(e, m),
        volltextAn: (typ, key) => VolltextDienst.volltextAn(typ, key),
        pruefeArchivDokument: (id, was) => this.mappenArchiv.pruefeArchivDokument(id, was),
      },
    );
    return {
      dokumente,
      umwandlung,
      archiv,
      pdfs,
      fehlend: new FehlendeDateien(this.kern),
      versionen,
      anlagen: new DokumentAnlagen(this.kern, { versionen }),
    };
  }

  /** Sichten, Berechtigungen und Volltext (#1076): die Klassen in sichten/, berechtigungen/ und volltext/. */
  protected baueSichtenUndVolltext() {
    const verwalten = new SichtenVerwaltung(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const systemsichten = new Systemsichten(this.kern);
    const sichten = new SichtenDienst(
      this.kern,
      { rechte: this.rechtepruefung, mappen: this.mappen, suche: this.suche, verwalten, systemsichten },
      {
        gueltigkeit: () => this.gueltigkeit(),
        siehtOhneEmpfaenger: (ich) => this.ohneEmpfaenger.siehtOhneEmpfaenger(ich),
        ohneLeserechtText: (liste, lesbar, ich) => this.ohneLeserecht.ohneLeserechtText(liste, lesbar, ich),
        termine: (z, q) => this.fristen.termine(z, q),
      },
      { stand: this.stand, mappenstand: this.mappenstand },
    );
    const berechtigungen = new BerechtigungenDienst(this.kern, this.rechtepruefung, { konten: () => this.konten });
    const ausPaketen = new VolltextAusPaketen(
      this.kern,
      { dokumente: this.dokumente, archiv: this.dokumentArchiv },
      { paketVolltext: () => this.paketVolltext },
    );
    const volltext = new VolltextDienst(
      this.kern,
      { dokumente: this.dokumente, umwandlung: this.dokumentUmwandlung, archiv: this.dokumentArchiv, ausPaketen },
      {
        ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
        auftraege: this.auftraege,
        paketVolltext: () => this.paketVolltext,
        sicherungAufgegeben: (paket, name, fehler) => this.sicherungAufgegeben?.(paket, name, fehler),
        sicherungAntwort: (paket, name, r) => this.sicherungAntwort?.(paket, name, r),
      },
    );
    return { verwalten, systemsichten, sichten, berechtigungen, ausPaketen, volltext };
  }

  /**
   * PDF bearbeiten, Post und Ausgang (#1077): die Klassen in pdf-bearbeiten/, post/ und ausgang/. Was noch im Dienst
   * liegt und was im Kreis liefe (PDF bearbeiten und Auflösen → neue Post), kommt über die Anschlüsse; die Prüfstelle
   * der Wege nach draußen (`pruefeAusgang`, `mitnehmbar`) rufen E-Mail und Export über ihren Anschluss am `ausgang`.
   */
  protected bauePdfPostAusgang() {
    const rechte = this.rechtepruefung;
    const mappen = { historie: this.mappenHistorie, titel: this.mappenTitel, archiv: this.mappenArchiv };
    const doks = { dokumente: this.dokumente, versionen: this.dokumentVersionen };
    const stempelvorlagen = new Stempelvorlagen(this.kern);
    const pdf = new PdfBearbeiten(
      this.kern,
      { rechte, ...mappen, ...doks, umwandlung: this.dokumentUmwandlung, anlagen: this.dokumentAnlagen },
      {
        legePostAn: (...a) => this.post.legePostAn(...a),
        schreibeSystemMappe: (...a) => this.postSystemmappen.schreibeSystemMappe(...a),
        postAufgaben: (id, von) => this.post.postAufgaben(id, von),
      },
    );
    const verkleinern = new PdfVerkleinern(this.kern, { pdf, ...mappen, ...doks }, { auftraege: this.auftraege });
    const schwaerzen = new Schwaerzen(
      this.kern,
      { verkleinern, historie: this.mappenHistorie, ...doks, archiv: this.dokumentArchiv },
      {
        volltextFertig: (e, m, von) => this.volltexte.volltextFertig(e, m, von),
      },
    );
    const systemmappen = new PostSystemmappen(
      this.kern,
      { rechte, passung: this.passung, historie: this.mappenHistorie, titel: this.mappenTitel },
      {
        ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
        meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
        passungsAufgaben: (liste) => this.vertretung.passungsAufgaben(liste),
        favoritenVorgabe: () => this.ohneEmpfaenger.favoritenVorgabe(),
        vorgabeAufgabenEmpfaenger: (b) => this.ohneEmpfaenger.vorgabeAufgabenEmpfaenger(b),
        sichereSystem: () => this.systemausstattung.sicherstellen(),
        konten: () => this.konten,
        systemkonten: () => this.systemkonten,
        automatisierungenVon: () => this.automatisierungenVon,
      },
    );
    const leerseiten = new PostLeerseiten(this.kern, { rechte, historie: this.mappenHistorie, versionen: this.dokumentVersionen });
    const aufloesen = new PostAufloesen(
      this.kern,
      { rechte, historie: this.mappenHistorie, titel: this.mappenTitel, ...doks, systemmappen, leerseiten },
      {
        legePostAn: (...a) => this.post.legePostAn(...a),
        postAufgaben: (id, von) => this.post.postAufgaben(id, von),
        loeschPruefung: (m, typ, rueck) => this.loeschen.loeschPruefung(m, typ, rueck),
        loescheMappe: (id, von, z, anlass) => this.loeschen.loescheMappe(id, von, z, anlass),
      },
    );
    const post = new PostDienst(
      this.kern,
      {
        rechte,
        mappentypen: this.mappentypen,
        historie: this.mappenHistorie,
        titel: this.mappenTitel,
        eingaben: this.mappenEingaben,
        ...doks,
        aufloesen,
        systemmappen,
        leerseiten,
      },
      {
        ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
        meldeVerknuepft: (typ, id, alt, neu, von) => this.ereignisseDienst.meldeVerknuepft(typ, id, alt, neu, von),
        verschluessele: (k) => this.verschluessele(k),
        neueAufgabe: (a, typ) => this.ereignisseDienst.neueAufgabe(a, typ),
        leiteUm: (a) => this.vertretung.leiteUm(a),
        eigeneAufgabe: (id, ich) => this.vertretung.eigeneAufgabe(id, ich),
        erledigeNachAnlass: (id, passt, grund) => this.aufgaben.erledigeNachAnlass(id, passt, grund),
        konten: () => this.konten,
        sichereZuordnung: (e, autoTypen) => sichereZuordnung(e as PostErkennung, autoTypen),
      },
    );
    const eingang = new Eingangskanaele(this.kern, { rechte, historie: this.mappenHistorie, dokumente: this.dokumente });
    const fotos = new PostFotos(
      this.kern,
      { rechte, ...mappen, ...doks, pdf, post, eingang },
      { loescheMappe: (id, von, z, anlass) => this.loeschen.loescheMappe(id, von, z, anlass) },
    );
    const entsperrtZu = (inhalt: Buffer) => this.geschuetztePdfs.entsperrtZu(inhalt);
    const ausgang = new AusgangDienst(
      this.kern,
      {
        rechte,
        mappentypen: this.mappentypen,
        historie: this.mappenHistorie,
        versionen: this.dokumentVersionen,
        umwandlung: this.dokumentUmwandlung,
        archiv: this.dokumentArchiv,
        verwalten: this.sichtenVerwaltung,
        stempel: stempelvorlagen,
      },
      { entsperrtZu },
    );
    const email = new AusgangEmail(
      this.kern,
      { rechte, historie: this.mappenHistorie, dokumente: this.dokumente, ausgang, stempel: stempelvorlagen, systemmappen },
      {
        pruefeAusgang: (ich, z, weg, ids) => this.ausgang.pruefeAusgang(ich, z, weg, ids),
        entsperrtZu,
      },
    );
    const exportieren = new AusgangExport(
      this.kern,
      { rechte, sichten: this.sichten, fehlend: this.dateienFehlen, ausgang, stempel: stempelvorlagen },
      {
        mitnehmbar: (ich, z, ids) => this.ausgang.mitnehmbar(ich, z, ids),
        entsperrtZu,
        mitErwaehnungstiteln: (z, mappen) => this.erwaehnungen.mappenMitTiteln(z, mappen, (id) => z.typen.get(id)),
      },
    );
    return {
      stempelvorlagen,
      pdf,
      verkleinern,
      schwaerzen,
      systemmappen,
      aufloesen,
      leerseiten,
      post,
      eingang,
      fotos,
      ausgang,
      email,
      export: exportieren,
    };
  }

  /**
   * Ereignisse, Aufgaben, Löschen, Datenschutz und Werkbank (#1078): erst die tieferen Klassen, dann die, die sie brauchen.
   */
  protected baueAufgabenUndLoeschen() {
    const e = this.baueEreignisse();
    const a = this.baueAufgaben(e.ereignisse);
    const { teile: l, beispiele } = this.baueLoeschen();
    const d = this.baueDatenschutz(e.ereignisse, a.vertretung, l);
    return {
      ...e,
      aufgaben: a.aufgaben,
      vertretung: a.vertretung,
      ohneLeserecht: a.ohneLeserecht,
      fristen: a.fristen,
      ohneEmpfaenger: a.ohneEmpfaenger,
      ablaeufe: a.ablaeufe,
      loeschen: l.loeschen,
      papierkorb: l.papierkorb,
      protokoll: l.protokoll,
      verknuepft: l.verknuepft,
      beispiele,
      ...d,
      werkbank: new WerkbankDienst(this.kern),
    };
  }

  /**
   * KI-Freigabe, Notizen, Ereignisse und Hilfen für Automatisierungen (#1078): die Klassen in mappentypen/, mappen/ und
   * ereignisse/. Ereignis auslösen, Erwähnungen, Übersetzungen, Rollen und die Texterkennung gehen über den Anschluss.
   */
  private baueEreignisse() {
    const ki = new KiTypen(this.kern, this.rechtepruefung);
    const notizen = new MappenNotizen(this.kern, this.mappenHistorie, {
      ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
      erwaehnungenAbgleichen: (...a) => this.aufgaben.erwaehnungenAbgleichen(...a),
      uebersetzung: () => this.uebersetzung,
    });
    const ereignisse = new EreignisseDienst(
      this.kern,
      { rechte: this.rechtepruefung, typpakete: this.typpakete, ki },
      {
        ereignis: (art, daten, von) => this.kern.ereignis(art, daten, von),
        ereignisWecker: () => this.ereignisWecker,
        nachTexterkennungsEreignis: (paket, e, r) => this.volltexte.nachTexterkennungsEreignis(paket, e, r),
      },
    );
    const automatisierung = new Automatisierungshilfen(this.kern, this.rechtepruefung, {
      listeRollen: () => this.postSystemmappen.listeRollen(),
    });
    return { ki, notizen, ereignisse, automatisierung };
  }

  /** Aufgaben (#1078): die Klassen in aufgaben/ kennen einander über `teile`; Ereignis, Konten und Gültigkeit über den Anschluss. */
  private baueAufgaben(ereignisse: EreignisseDienst) {
    const teile = {
      rechte: this.rechtepruefung,
      historie: this.mappenHistorie,
      mappen: this.mappen,
      ereignisse,
      systemmappen: this.postSystemmappen,
    } as AufgabenTeile;
    const anschluss = {
      ereignis: (...a: Parameters<Kern['ereignis']>) => this.kern.ereignis(...a),
      konten: () => this.konten,
      gueltigkeit: () => this.gueltigkeit(),
      ablaufPlatzhalter: () => this.ablaufPlatzhalter,
      favoritenRegeln: () => this.favoritenRegeln?.(),
    };
    teile.aufgaben = new AufgabenDienst(this.kern, teile, anschluss);
    teile.vertretung = new AufgabenVertretung(this.kern, teile, anschluss);
    teile.ohneLeserecht = new OhneLeserecht(this.kern, teile, anschluss);
    teile.fristen = new Fristen(this.kern, teile, anschluss, { stand: this.stand, mappenstand: this.mappenstand });
    teile.ohneEmpfaenger = new OhneEmpfaenger(this.kern, teile, anschluss);
    teile.ablaeufe = new MappenAblaeufe(this.kern, teile, anschluss);
    return teile;
  }

  /** Löschen (#1078): die Klassen in loeschen/ kennen einander über `teile`; Ereignis, Titel und Konten über den Anschluss. */
  private baueLoeschen() {
    const teile = {
      rechte: this.rechtepruefung,
      passung: this.passung,
      historie: this.mappenHistorie,
      dokumente: this.dokumente,
      versionen: this.dokumentVersionen,
      ausgang: this.ausgang,
      sichten: this.sichten,
      systemmappen: this.postSystemmappen,
    } as LoeschenTeile;
    const anschluss = {
      ereignis: (...a: Parameters<Kern['ereignis']>) => this.kern.ereignis(...a),
      aktualisiereTitel: (ids: string[]) => this.mappenTitel.aktualisiereTitel(ids),
      konten: () => this.konten,
    };
    teile.loeschen = new LoeschenDienst(this.kern, teile, anschluss);
    teile.papierkorb = new Papierkorb(this.kern, teile, anschluss);
    teile.protokoll = new LoeschprotokollVerwaltung(this.kern, teile);
    teile.verknuepft = new MitVerknuepften(this.kern, teile, anschluss);
    return { teile, beispiele: new BeispielMappen(this.kern, teile) };
  }

  /** Datenschutz (#1078): die Klassen in datenschutz/ kennen einander über `teile`; Konten, Kurzzustand und Tresor über den Anschluss. */
  private baueDatenschutz(ereignisse: EreignisseDienst, vertretung: AufgabenVertretung, loeschen: LoeschenTeile) {
    // Eigene Organisation (#995): vor dem Datenschutz, der den Verantwortlichen von dort nimmt.
    const organisation = new OrganisationDienst(this.kern, {
      mappen: () => this.mappen,
      anVerwaltende: () => this.verwaltungsmail?.(ORGANISATION_BEREICH),
    });
    const teile = {
      organisation,
      rechte: this.rechtepruefung,
      historie: this.mappenHistorie,
      mappen: this.mappen,
      dokumente: this.dokumente,
      umwandlung: this.dokumentUmwandlung,
      archiv: this.dokumentArchiv,
      sichten: this.sichten,
      ereignisse,
      vertretung,
      verknuepft: loeschen.verknuepft,
      loeschprotokoll: loeschen.protokoll,
    } as DatenschutzTeile;
    const anschluss = {
      konten: () => this.konten,
      kurzzustand: () => this.kurzzustand,
      tresor: () => this.tresor,
      automatisierungenExport: () => this.automatisierungenExport,
      ablaufvorlagenExport: () => this.ablaeufe.exportDaten(),
    };
    teile.datenschutz = new DatenschutzDienst(this.kern, teile, anschluss);
    teile.vollexport = new VollexportQuellen(this.kern, teile, anschluss);
    return {
      datenschutz: teile.datenschutz,
      vollexport: teile.vollexport,
      zustellen: new AuskunftZustellen(this.kern, teile, anschluss),
      organisation,
    };
  }

  /**
   * Anschlusspunkte (#962): alle sofortigen Empfänger an dieser einen Stelle, in fester Reihenfolge (Test:
   * anlaesse.test.ts, Liste im Entwicklerhandbuch). Eine andere Reihenfolge ist ein eigener Pull Request. Die Empfänger
   * rufen die Fachdienste erst beim Auslösen (`this.fristen.fristenAbgleichen(…)`), damit Tests sie dort ersetzen können.
   */
  protected schliesseEmpfaengerAn() {
    const a = this.kern.anlaesse;
    // Mappe angelegt bzw. geändert: Passung → Erwähnungen → Fristen → Post-Aufgaben.
    a.mappeGeaendert.anmelden('mappentypen.passung', async (e) => {
      // Gespeichert heißt: passt wieder – eine „passt nicht“-Aufgabe ist damit erledigt.
      if (!e.angelegt) await this.vertretung.passungsAufgaben([{ id: e.mappe.id, problem: null }]);
      if (e.typ.felder.some((f) => f.eindeutig)) await this.passung.pruefeUnpassende(e.typ);
    });
    a.mappeGeaendert.anmelden('aufgaben.erwaehnungen', async (e) => {
      if (!e.demo) await this.aufgaben.pruefeErwaehnungen(e.typ, e.mappe.id, e.alt, e.neu, e.von);
    });
    // Fristen (#129): neues Datum → „Frist erreicht“, verschobenes oder leeres → alte erledigt.
    a.mappeGeaendert.anmelden('aufgaben.fristen', async (e) => {
      if (e.angelegt && (e.demo || !fristFelder(e.typ).length)) return;
      await this.fristen.fristenAbgleichen({ mappeIds: [e.mappe.id] });
    });
    // Post (#192, #1001): „An“ und Stand erledigen die Aufgabe „Post für dich“ (anlegen tut sie die Automatisierung).
    a.mappeGeaendert.anmelden('post.aufgaben', async (e) => {
      if (!e.angelegt && e.typ.system === 'post') await this.post.postAufgaben(e.mappe.id, e.von);
    });
    // Mappentyp geändert: Ansicht umbenennen → Titel → Passung → Fristen.
    a.typGeaendert.anmelden('sichten.umbenennen', async ({ alt, typ }) => {
      // Die Sicht, die für diesen Typ entstanden ist, heißt weiter wie er – solange sie niemand umbenannt hat.
      const eigene = (await this.repo.listeSichten()).find((x) => x.id === typ.id);
      if (eigene && eigene.name === alt.name && alt.name !== typ.name) await this.repo.aendereSicht(typ.id, { ...eigene, name: typ.name });
    });
    // Ist Teil einer anderen Mappe (#1031) umgeschaltet: aus den Ansichten heraus bzw. wieder mit eigener Ansicht.
    a.typGeaendert.anmelden('sichten.teile', async ({ alt, typ }) => {
      await this.sichtenVerwaltung.teilUmgeschaltet(alt, typ);
    });
    // Vorlage oder Felder können sich geändert haben: Titel aller Mappen dieses Typs neu berechnen.
    a.typGeaendert.anmelden('mappen.titel', async ({ typ }) => {
      await this.mappenTitel.aktualisiereTitel((await this.repo.listeMappen(typ.id)).map((m) => m.id));
    });
    a.typGeaendert.anmelden('mappentypen.passung', async ({ typ }) => {
      await this.passung.pruefePassung(typ.id);
    });
    // Fristen (#129): Erinnerung neu an oder aus, Vorlauf geändert → gleich abgleichen.
    a.typGeaendert.anmelden('aufgaben.fristen', async ({ typ }) => {
      await this.fristen.fristenAbgleichen({ typId: typ.id });
    });
    // Neue Mappentypen bekommen eine eigene Sicht (#38), außer der Administrator wählt das ab.
    a.typAngelegt.anmelden('sichten.eigeneSicht', async ({ typ, sicht }) => {
      if (sicht) await this.sichtenVerwaltung.sichtFuerTyp(typ);
    });
    // Abwesenheit (#78): Historie an der Benutzer-Mappe, Ereignisse, Aufgaben mit Anlass „Abwesenheit“.
    a.benutzerGespiegelt.anmelden('aufgaben.abwesenheit', async ({ benutzer, von, abwesenheit }) => {
      if (abwesenheit) await this.vertretung.abwesenheitGeaendert(benutzer, abwesenheit.vorher, von, abwesenheit.wegen);
    });
    a.schliessen();
  }
}
