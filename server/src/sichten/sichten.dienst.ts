/**
 * Sichten (#1076 aus dienst.ts): eine Seite einer Ansicht (#38, #98, #149, #172, #199, #356, #740, #918), Zähler der
 * Ablage (#512, #742, #918), Zähler-Endpunkt (#625), Stand der Ablage (#919). Schicht 3 – bekommt den Kern, die
 * Rechteprüfung, Mappen, Suche und die übrigen Teile dieses Ordners, nicht den ganzen Dienst.
 */
import type { TermineAntwort } from '../../../shared/src/fristen';
import { type Aufgabe, type Mappentyp, MAX_AUSWAHL, POST_STAND, bezugsZiele } from '../../../shared/src/model';
import { type Bedingung, filterFuer, heuteIn, klauselnFuer, type Sicht } from '../../../shared/src/sichten';
import { suchbegriffe, type Varianten, vorschlagAus } from '../../../shared/src/suche';
import { ABO_ARTEN, type Kern, type Zugriff } from '../kern';
import type { MappenDienst } from '../mappen';
import { kontext, protokoll } from '../protokoll/protokoll';
import type { Repo, SeitenAnfrage } from '../repo';
import type { SucheDienst } from '../suche';
import {
  fingerabdruck,
  type Gueltigkeit,
  type Haushaltsstand,
  mitFavoriten,
  Zaehlerspeicher,
  zeitabhaengig,
} from '../zwischenspeicher/zaehlerspeicher';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import type { Systemsichten } from './systemsichten';
import type { SichtenVerwaltung } from './verwalten';
import { gruppenZaehlung } from './gruppenzahlen';
import { tabellenSeite } from './tabelle';
import {
  bekanntesGesamt,
  type SeitenParameter,
  seitenParameter,
  type SeitenQuery,
  seitenAnfrage,
  type SeitenZiel,
  seitenZiel,
  sortierungAus,
  suchTypen,
} from './seite-schritte';
import { istTeiltyp, uebergeordneteId, uebergeordneterTyp } from '../../../shared/src/teile';
import type { Ausschnitt } from '../../../shared/src/model';

/**
 * Teile (#1031): höchstens so viele Teile werden je Suche durchgesehen, um ihre übergeordneten Mappen zu finden. Mehr
 * Teile mit dem Begriff sind selten; die übergeordneten Mappen der übrigen fehlen dann in den Treffern.
 */
export const TEIL_TREFFER_MAX = 2000;
/** Fundstelle in einem Teil (#1031) je übergeordneter Mappe. */
type TeilFunde = Map<string, NonNullable<Ausschnitt['teil']> & { ausschnitt?: Ausschnitt }>;

/** „Meintest du …?“ (#356, #1191): statt welcher Suche, der Vorschlag und die ähnlichen Wörter je Begriff. */
type Unscharf = { statt: string; vorschlag: string | null; begriffe: Record<string, string[]>; treffer?: number };
/** Eine Mappe auf einer Seite, wie das Repo sie liefert. */
type SeitenMappe = Awaited<ReturnType<Repo['seite']>>['mappen'][number];

/** Zähler-Endpunkt (#625): nur Zahlen, keine Inhalte. */
export interface Zaehlerzahlen {
  neuePost: number;
  zuErledigen: number;
  ueberfaellig: number;
}

/** Die Teile, die die Sichten rufen: Rechteprüfung, Mappen, Suche und die anderen Klassen dieses Ordners. */
export interface SichtenTeile {
  rechte: ZugriffDienst;
  mappen: MappenDienst;
  suche: SucheDienst;
  verwalten: SichtenVerwaltung;
  systemsichten: Systemsichten;
}

/** Was die Sichten außer dem Kern brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface SichtenAnschluss {
  /** Gültigkeit der Zahlen für die laufende Anfrage (#742; `mindestensMs` stellen Tests am Dienst ein). */
  gueltigkeit(): Gueltigkeit;
  /** Sieht diese Person Aufgaben ohne Empfänger (#719; Aufgaben, noch im Dienst)? */
  siehtOhneEmpfaenger(ich: { id: string; rolle: string }): Promise<boolean>;
  /** Eigene Aufgaben an Mappen ohne Leserecht (#798; Aufgaben, noch im Dienst). */
  ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]>;
  /** Termine (#528, #725; Aufgaben, noch im Dienst). */
  termine(z: Zugriff, q: { von?: unknown; bis?: unknown }): Promise<TermineAntwort>;
}

/** Haushaltsstand und Mappenstand (#742, #918), an denen die Zwischenspeicher der Zahlen hängen. */
export interface SichtenStaende {
  stand: Haushaltsstand;
  mappenstand: Haushaltsstand;
}

export class SichtenDienst {
  /**
   * Zahlen der Ablage, die nicht von der Person abhängen (#742): je Typ und je Ansicht. Schlüssel ist der
   * Fingerabdruck genau der Eingaben der Zählung (Lesefilter, Klauseln der sichtbaren Ansichten, Verwaltungsmodus) –
   * wer dieselben Eingaben hat, bekommt dieselbe Zahl; anders geht es nicht.
   */
  private readonly bestand: Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>;
  /** Dasselbe, wenn der Lesefilter Favoriten meint (#918): dann am Haushaltsstand. */
  private readonly bestandFav: Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>;
  /** Zahlen der Person (#742): Eingang, Favoriten, Papierkorb – je Person und Lesefilter. */
  private readonly persoenlich: Zaehlerspeicher<Awaited<ReturnType<Repo['zaehlePersoenlich']>>>;
  /**
   * Zahl der Treffer einer Liste (#918): je Anfrage ohne Blatt und Reihenfolge (Ansicht bzw. Bedingungen, Lesefilter,
   * Suche) – genau, ohne Mindestgültigkeit: gilt nur bei gleichem Mappenstand (mit Favoriten: Haushaltsstand).
   */
  private readonly trefferSpeicher: Zaehlerspeicher<number>;
  private readonly trefferFavSpeicher: Zaehlerspeicher<number>;
  /** Zähler-Endpunkt (#625): „neue Post für mich bzw. ohne Für“ je Benutzer und Rechte, wie die Zahlen der Ansichten. */
  private readonly neuePostSpeicher: Zaehlerspeicher<number>;

  constructor(
    private readonly kern: Kern,
    private readonly teile: SichtenTeile,
    private readonly anschluss: SichtenAnschluss,
    private readonly staende: SichtenStaende,
  ) {
    this.bestand = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(staende.mappenstand);
    this.bestandFav = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(staende.stand);
    this.persoenlich = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehlePersoenlich']>>>(staende.stand);
    this.trefferSpeicher = new Zaehlerspeicher<number>(staende.mappenstand);
    this.trefferFavSpeicher = new Zaehlerspeicher<number>(staende.stand);
    this.neuePostSpeicher = new Zaehlerspeicher<number>(staende.stand);
  }

  private get repo(): Repo {
    return this.kern.repo;
  }
  private get stand() {
    return this.staende.stand;
  }
  private get mappenstand() {
    return this.staende.mappenstand;
  }
  private gueltigkeit() {
    return this.anschluss.gueltigkeit();
  }
  private aufloesung(benutzerId: string) {
    return this.teile.rechte.aufloesung(benutzerId);
  }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) {
    return this.teile.rechte.maskiereBezuege(...a);
  }
  private persoenlichAn(benutzerId: string, schluessel: string) {
    return this.teile.mappen.persoenlichAn(benutzerId, schluessel);
  }
  private suchVarianten(texte: Array<string | undefined>) {
    return this.teile.suche.suchVarianten(texte);
  }
  private unscharfAn() {
    return this.teile.suche.unscharfAn();
  }
  private meintestBeiTreffern() {
    return this.teile.suche.meintestBeiTreffern();
  }
  private aehnlicheZurSuche(...a: Parameters<SucheDienst['aehnlicheZurSuche']>) {
    return this.teile.suche.aehnlicheZurSuche(...a);
  }
  private verborgeneSichten(alle: Sicht[], z?: Zugriff) {
    return this.teile.verwalten.verborgeneSichten(alle, z);
  }
  private neuePostSicht() {
    return this.teile.systemsichten.neuePostSicht();
  }
  private favoritenSicht() {
    return this.teile.systemsichten.favoritenSicht();
  }
  private papierkorbTage() {
    return this.kern.papierkorbTage();
  }
  private siehtOhneEmpfaenger(ich: { id: string; rolle: string }) {
    return this.anschluss.siehtOhneEmpfaenger(ich);
  }
  private ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string) {
    return this.anschluss.ohneLeserechtText(liste, lesbar, ich);
  }
  private termine(z: Zugriff, q: { von?: unknown; bis?: unknown }) {
    return this.anschluss.termine(z, q);
  }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /** Feldart Tabelle (#1030): eine Seite der verweisenden Mappen an einer Mappe – nur lesbare, auch in der Zahl (tabelle.ts). */
  tabelle(id: string, feldKey: string, q: Parameters<typeof tabellenSeite>[3], z?: Zugriff) {
    return tabellenSeite(
      {
        repo: () => this.repo,
        rechte: this.teile.rechte,
        sortierungAus,
        // Ein Dienstkonto eines Pakets kennt nur die Typen, die es lesen darf – fehlt der andere, bleibt die Tabelle leer.
        typen: async (zz) => zz?.typen ?? new Map((await this.repo.listeTypen()).map((x) => [x.id, x] as const)),
      },
      id,
      feldKey,
      q,
      z,
    );
  }

  /**
   * Eine Seite einer Sicht: „eingang“, eine verwaltete Sicht (#38) oder – für Links auf Mappen,
   * deren Typ keine eigene Sicht hat – eine Typ-Id. Mit den Bezügen für die Anzeige.
   */
  async seite(ich: { id: string; rolle: string }, q: SeitenQuery, z?: Zugriff, grenze = 500) {
    const { lesen, p, typen, ziel, textfilter, varianten, anfrage } = await this.seitenAnfrageFuer(ich, q, z, grenze);
    const { r, unscharf } = await this.treffer(anfrage, typen, varianten, bekanntesGesamt(q, p, textfilter), p.von === 0);
    if (q.sicht === 'eingang' && lesen) r.mappen = await this.ohneLeserecht(r.mappen, lesen);
    // Verweise und Erwähnungen in formatierten Feldern (#1333): Titel aller Zeilen der Seite in einer Abfrage, maskiert.
    const ziele = r.mappen.flatMap((m) => {
      const t = typen.get(m.typId);
      return t ? bezugsZiele(t, m.werte) : [];
    });
    const aufgaben = q.sicht === 'eingang' ? await this.eingangAufgaben(ich, r.mappen) : {};
    const aehnlich = await this.aehnlicheTreffer(z, p, ziel.erweitert, typen, r.mappen);
    return {
      gesamt: r.gesamt,
      von: p.von,
      mappen: r.mappen,
      bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)),
      ...(r.ausschnitte ? { ausschnitte: r.ausschnitte } : {}),
      ...(q.sicht === 'eingang' ? { aufgaben } : {}),
      ...(aehnlich.length ? { aehnlich } : {}),
      ...(unscharf ? { unscharf } : {}),
      ...(await this.persoenlicheMarken(
        ich,
        r.mappen,
        q.sicht === 'favoriten' || !!ziel.sicht?.bedingungen.some((x) => x.art === 'favorit'),
      )),
    };
  }

  /** Was `seite` und `trefferIds` (#1335) gleich brauchen: Parameter, Typen, Ziel, Varianten und die Anfrage ans Repo. */
  private async seitenAnfrageFuer(ich: { id: string; rolle: string }, q: SeitenQuery, z: Zugriff | undefined, grenze: number) {
    // Berechtigungen (#124): nur lesbare Mappen; der Eingang zeigt Aufgaben auch zu nicht lesbaren – ohne Inhalt.
    const lesen = z?.lesen ?? null;
    const p = seitenParameter(q, grenze);
    // Mappentypen und Auflösung (Rollen, heute) hat der Zugriff schon gelesen (#615); ein Dienstkonto kennt nur seine Typen.
    const typen = z?.typen && !z.paket ? z.typen : new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const aufloesung = () => (z?.a && z.ich?.id === ich.id ? Promise.resolve(z.a) : this.aufloesung(ich.id));
    const sichten = await this.repo.listeSichten();
    const ziel = seitenZiel(q, typen, sichten, () => this.verborgeneSichten(sichten, z));
    // Unscharfe Suche (#356): Varianten (gleichbedeutende Wörter, ohne Bindestrich) für Suche und Volltextfilter.
    const textfilter = ziel.erweitert?.volltext ?? undefined;
    const varianten = await this.suchVarianten([p.suche, textfilter?.text]);
    const anfrage = await seitenAnfrage(
      q,
      ziel,
      { ...p, lesen, sortierung: ziel.sortierung },
      { ich, typen, sichten, aufloesung, siehtOhneEmpfaenger: () => this.siehtOhneEmpfaenger(ich) },
    );
    return { lesen, p, typen, ziel, textfilter, varianten, anfrage };
  }

  /**
   * Treffer einer Seite: Teile (#1031) als Treffer ihrer übergeordneten Mappe; ohne genauen Treffer (#356) mit ähnlichen
   * Wörtern aus dem Wörterverzeichnis noch einmal – genaue Treffer gehen so immer vor; „Meintest du …?“ schlägt die Suche
   * mit dem besten ähnlichen Wort vor, auf dem ersten Blatt auch bei Treffern (#1191).
   */
  private async treffer(
    anfrage: SeitenAnfrage,
    typen: Map<string, Mappentyp>,
    varianten: Varianten,
    gesamt: number | undefined,
    erstesBlatt: boolean,
  ) {
    // Teile (#1031): Was in einem lesbaren Teil steht, ist ein Treffer seiner übergeordneten Mappe.
    let funde = await this.teilFunde(anfrage, typen, varianten);
    if (funde) anfrage.auchIds = [...funde.keys()];
    let r = gesamt !== undefined ? await this.repo.seite({ ...anfrage, varianten, gesamt }) : await this.seiteMitZahl(anfrage, varianten);
    let unscharf: Unscharf | null = null;
    const gesucht = anfrage.suche ?? anfrage.textfilter?.text;
    if (r.gesamt === 0 && gesucht && (await this.unscharfAn())) {
      const u = await this.unscharfeSuche(anfrage, typen, varianten, gesucht);
      if (u) ({ r, funde, unscharf } = u);
    } else if (r.gesamt > 0 && erstesBlatt && gesucht && (await this.meintestBeiTreffern())) {
      // „Meintest du …?“ auch bei Treffern (#1191, Werkbank → Suche): nur auf dem ersten Blatt und nur, wenn die Suche
      // mit der ähnlichen Schreibweise mehr Mappen findet. Die Treffer bleiben die genauen.
      unscharf = await this.besserGeschrieben(anfrage, gesucht, r.gesamt);
    }
    if (funde?.size)
      r = {
        ...r,
        ausschnitte: mitTeilFunden(
          r.mappen.map((m) => m.id),
          r.ausschnitte,
          funde,
        ),
      };
    return { r, unscharf };
  }

  /** Ohne genauen Treffer (#356): mit ähnlichen Wörtern noch einmal; null, wenn auch das nichts findet. */
  private async unscharfeSuche(anfrage: SeitenAnfrage, typen: Map<string, Mappentyp>, varianten: Varianten, gesucht: string) {
    const begriffe = suchbegriffe(gesucht);
    const aehnlich = begriffe ? await this.teile.suche.aehnlicheWoerter(begriffe, 5) : {};
    if (!Object.keys(aehnlich).length) return null;
    const funde = await this.teilFunde(anfrage, typen, varianten, aehnlich);
    const r = await this.repo.seite({ ...anfrage, varianten, aehnlich, ...(funde ? { auchIds: [...funde.keys()] } : {}) });
    if (!(r.gesamt > 0)) return null;
    // „Meintest du …?“ nur, wenn der Vorschlag selbst etwas findet, das der Benutzer lesen darf – das
    // Wörterverzeichnis kennt auch Wörter aus Mappen, die er nicht sehen darf (ohne Lesefilter: alles lesbar).
    let vorschlag = vorschlagAus(begriffe!, aehnlich);
    if (vorschlag && anfrage.lesen) {
      const probe: SeitenAnfrage = anfrage.suche
        ? { ...anfrage, suche: vorschlag }
        : { ...anfrage, textfilter: { ...anfrage.textfilter!, text: vorschlag } };
      if (!(await this.repo.gibtTreffer(probe))) vorschlag = null;
    }
    const unscharf: Unscharf = { statt: gesucht, vorschlag, begriffe: aehnlich };
    return { r, funde, unscharf };
  }

  /** Eingang (#124): Mappen ohne Leserecht nur mit Kennung, Typ und Zeiten – ohne Inhalt. */
  private async ohneLeserecht(mappen: SeitenMappe[], lesen: NonNullable<SeitenAnfrage['lesen']>): Promise<SeitenMappe[]> {
    const ok = await this.repo.lesbare(
      mappen.map((m) => m.id),
      lesen,
    );
    return mappen.map((m) =>
      ok.has(m.id)
        ? m
        : {
            id: m.id,
            typId: m.typId,
            werte: {},
            titel: NICHT_SICHTBAR,
            erstellt: m.erstellt,
            erstelltVon: null,
            geaendert: m.geaendert,
            geaendertVon: null,
            verborgen: true,
          },
    );
  }

  /** Eingang (#54): je Mappe, was für mich zu tun ist; automatische Aufgaben an Mappen ohne Leserecht nur mit Hinweis (#798). */
  private async eingangAufgaben(ich: { id: string; rolle: string }, mappen: SeitenMappe[]): Promise<Record<string, string>> {
    const aufgaben: Record<string, string> = {};
    if (!mappen.length) return aufgaben;
    const offen = await this.repo.offeneAufgaben({
      benutzerId: ich.id,
      admin: await this.siehtOhneEmpfaenger(ich),
      mappeIds: mappen.map((m) => m.id),
    });
    for (const a of await this.ohneLeserechtText(offen, new Set(mappen.filter((m) => !m.verborgen).map((m) => m.id)), ich.id)) {
      aufgaben[a.mappeId] = aufgaben[a.mappeId] ? `${aufgaben[a.mappeId]} · ${a.text}` : a.text;
    }
    return aufgaben;
  }

  /**
   * Ähnliche Treffer (#442): nur in der Suche über alle Mappen bzw. der erweiterten Suche ohne Feldbedingungen, auf der
   * ersten Seite und mit „auch in Dokumenten“ – Treffer aus Ansichten mit Bedingungen würden diese verletzen. Seit #1218
   * kommt man mit Enter im Suchfeld oben dorthin: dann ist der Begriff der Volltext (in Dokumenten).
   */
  private async aehnlicheTreffer(
    z: Zugriff | undefined,
    p: SeitenParameter,
    erweitert: SeitenZiel['erweitert'],
    typen: Map<string, Mappentyp>,
    mappen: SeitenMappe[],
  ) {
    const { suche, volltext, von } = p;
    const aehnlichZu = suche && volltext ? suche : !suche && erweitert?.volltext?.dokumente ? erweitert.volltext.text : null;
    return erweitert && !erweitert.bedingungen.length && aehnlichZu && von === 0
      ? // Teile (#1031) auch hier nicht.
        await this.aehnlicheZurSuche(z, aehnlichZu, {
          typen: new Set(suchTypen(erweitert.typen, typen).map((t) => t.id)),
          ohneMappen: new Set(mappen.map((m) => m.id)),
        })
      : [];
  }

  /** Favoriten (#62), Geänderte (Favorit = Abo, #422) und stumme Favoriten (#725) unter den Mappen der Seite. */
  private async persoenlicheMarken(ich: { id: string }, mappen: SeitenMappe[], mitStumm: boolean) {
    return {
      /** Welche Mappen dieser Seite Favoriten des Benutzers sind (#62). */
      favoriten: [
        ...(await this.repo.favoritenVon(
          ich.id,
          mappen.map((m) => m.id),
        )),
      ],
      /** Favorit = Abo (#422): Favoriten und eigene Mappen, die andere seit dem letzten Sehen geändert haben. */
      geaendert: (await this.persoenlichAn(ich.id, 'geaenderte_hervorheben'))
        ? [
            ...(await this.repo.geaendertVonAnderen(
              ich.id,
              mappen.filter((m) => !m.verborgen).map((m) => m.id),
              ABO_ARTEN,
            )),
          ]
        : [],
      /** In der Favoritenliste und Ansichten mit „ist mein Favorit“ (#725): Favoriten ohne Benachrichtigung (#422). */
      ...(mitStumm
        ? {
            stumm: [
              ...(await this.repo.stummeFavoriten(
                ich.id,
                mappen.map((m) => m.id),
              )),
            ],
          }
        : {}),
    };
  }

  /**
   * Teile (#1031): Treffer der Suche in Teilen, je übergeordneter Mappe der erste mit Fundstelle. Gesucht wird mit
   * demselben Begriff, denselben Varianten und **demselben Lesefilter** – ein Teil, den die Person nicht lesen darf, gibt
   * keinen Hinweis auf seinen Inhalt; die übergeordnete Mappe muss sie ohnehin lesen dürfen (Lesefilter der eigentlichen
   * Seite). Nur Teile, deren übergeordneter Typ in der Anfrage vorkommt; nicht im Eingang und in den Favoriten.
   */
  private async teilFunde(
    anfrage: SeitenAnfrage,
    typen: Map<string, Mappentyp>,
    varianten: Varianten,
    aehnlich?: Varianten,
  ): Promise<TeilFunde | null> {
    const gesucht = anfrage.suche || anfrage.textfilter?.text.trim();
    if (!gesucht || anfrage.eingang || anfrage.favoriten) return null;
    const ziele = anfrage.klauseln ? new Set(anfrage.klauseln.flatMap((k) => k.typen)) : anfrage.typId ? new Set([anfrage.typId]) : null;
    const teile = [...typen.values()].filter((x) => {
      const u = uebergeordneterTyp(x);
      return istTeiltyp(x) && !!u && (!ziele || ziele.has(u));
    });
    if (!teile.length) return null;
    const r = await this.repo.seite({
      klauseln: [{ typen: teile.map((x) => x.id), filter: [] }],
      suche: anfrage.suche,
      volltext: anfrage.volltext,
      notizen: anfrage.notizen,
      textfilter: anfrage.textfilter,
      varianten,
      aehnlich,
      lesen: anfrage.lesen,
      von: 0,
      anzahl: TEIL_TREFFER_MAX,
      zahl: 0,
    });
    const funde: TeilFunde = new Map();
    for (const m of r.mappen) {
      const eltern = uebergeordneteId(typen.get(m.typId), m.werte);
      if (eltern && !funde.has(eltern))
        funde.set(eltern, { id: m.id, typId: m.typId, titel: m.titel ?? '', ausschnitt: r.ausschnitte?.[m.id] });
    }
    return funde;
  }

  /**
   * Eine Seite mit der Zahl der Treffer aus dem Zwischenspeicher (#918): Die Zahl gilt je Anfrage ohne Blatt und
   * Reihenfolge – Ansicht bzw. Bedingungen, Lesefilter, Suche samt Varianten, Eingang oder Favoriten der Person – und nur
   * bei gleichem Mappenstand (mit Favoriten: Haushaltsstand), ohne Mindestgültigkeit: Sie bleibt genau. Einmal gezählt,
   * holt jede weitere Anfrage nur die Seite. Nicht zwischengespeichert wird die Suche in Dokumenten und Notizen: Deren
   * Texte (Texterkennung, Notizen) ändern keinen Stand.
   */
  /**
   * „Meintest du …?“ bei Treffern (#1191): die Suche mit dem besten ähnlichen Wort je Begriff – nur, wenn sie mehr
   * Mappen findet, die der Benutzer lesen darf (der Lesefilter der Anfrage gilt mit). Kostet eine Zählung mehr.
   */
  private async besserGeschrieben(
    anfrage: SeitenAnfrage,
    gesucht: string,
    gesamt: number,
  ): Promise<{ statt: string; vorschlag: string; begriffe: Record<string, string[]>; treffer: number } | null> {
    const begriffe = suchbegriffe(gesucht);
    if (!begriffe) return null;
    const vorschlag = vorschlagAus(begriffe, await this.teile.suche.aehnlicheWoerter(begriffe, 1));
    if (!vorschlag) return null;
    const ohneTeile: SeitenAnfrage = { ...anfrage, auchIds: undefined };
    const probe: SeitenAnfrage = anfrage.suche
      ? { ...ohneTeile, suche: vorschlag }
      : { ...ohneTeile, textfilter: { ...anfrage.textfilter!, text: vorschlag } };
    const r = await this.repo.seite({
      ...probe,
      von: 0,
      anzahl: 1,
      varianten: await this.suchVarianten([probe.suche, probe.textfilter?.text]),
    });
    return r.gesamt > gesamt ? { statt: gesucht, vorschlag, begriffe: {}, treffer: r.gesamt } : null;
  }

  private async seiteMitZahl(anfrage: SeitenAnfrage, varianten: Varianten) {
    const inhalte = (!!anfrage.suche && (!!anfrage.volltext || !!anfrage.notizen)) || !!anfrage.textfilter?.text.trim();
    if (inhalte) return this.repo.seite({ ...anfrage, varianten });
    const { von: _von, anzahl: _anzahl, sortierung: _sortierung, gesamt: _gesamt, zahl: _zahl, ...was } = anfrage;
    const speicher = mitFavoriten(was) ? this.trefferFavSpeicher : this.trefferSpeicher;
    let r: Awaited<ReturnType<Repo['seite']>> | undefined;
    const z = await speicher.hole(fingerabdruck({ v: 1, ...was, varianten }), async () => {
      r = await this.repo.seite({ ...anfrage, varianten });
      return { wert: r.gesamt, zeitabhaengig: zeitabhaengig(anfrage.klauseln) };
    });
    return r ?? this.repo.seite({ ...anfrage, varianten, zahl: z.wert });
  }

  /**
   * Anzahl Mappen je Typ (davon unpassend, Demo), je Sicht, je Gruppe der Ansichtswahl (#1623) und im Eingang des Benutzers.
   * Zwischengespeichert je Benutzer und Rechte (#512), solange sich am Haushalt nichts ändert
   * (`Haushaltsstand`); zeitabhängige Ansichten laufen nach Minuten bzw. um Mitternacht ab. Ob der
   * Zwischenspeicher traf, steht im Header Server-Timing (`zs`).
   */
  async zaehler(ich: { id: string; rolle: string }, zg?: Zugriff) {
    const lesen = zg?.lesen ?? null;
    const alleSichten = await this.repo.listeSichten();
    // Verborgene Sichten (#148): kein Zähler, und ihre Mappen zählen auch in der Elternsicht nicht.
    const verborgen = this.verborgeneSichten(alleSichten, zg);
    const a = zg?.a && zg.ich.id === ich.id ? zg.a : await this.aufloesung(ich.id);
    const ohneEmpfaenger = await this.siehtOhneEmpfaenger(ich);
    const sichten = alleSichten.filter((x) => !verborgen.has(x.id));
    const typen = zg?.typen && !zg.paket ? zg.typen : new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const klauseln = sichten.map((x) => klauselnFuer(alleSichten, x.id, typen, a, verborgen));
    const zeitabh = alleSichten.some((x) => zeitabhaengig(x.bedingungen));
    // Gruppen der Ansichtswahl (#1623): Nur Gruppen aus mehreren obersten Ansichten brauchen eine eigene Zahl; sie
    // stehen hinter den Ansichten.
    const rahmen = await this.zaehlerRahmen();
    const gz = gruppenZaehlung(
      sichten,
      klauseln,
      [rahmen.neuePost, rahmen.favoritenSicht].filter((x): x is string => !!x),
    );
    const alle = [
      ...sichten.map((x, i) => ({ id: x.id, k: klauseln[i], gruppe: false })),
      ...gz.eigene.map((g) => ({ id: `gruppe:${g.gruppe}`, k: g.k, gruppe: true })),
    ];
    // Ansichten, deren Bedingungen die Person selbst meinen (z. B. „ist mein Favorit“), zählen bei ihren eigenen Zahlen;
    // alle anderen gemeinsam für alle mit denselben Eingaben.
    const eigen = (k: unknown) => JSON.stringify(k).includes(ich.id);
    const gemeinsam = alle.filter((x) => !eigen(x.k));
    const persoenlich = alle.filter((x) => eigen(x.k));
    // Rechte-Fingerabdruck (#742): genau die Eingaben der Zählung. Der Lesefilter enthält die Rechte samt Rollen und
    // Leserecht auf Zeit (wo eine Regel die Person selbst meint, steht ihre Id darin); die Klauseln enthalten Rollen
    // und „heute“, wo eine Ansicht sie nutzt. Der Verwaltungsmodus (alles lesen) steht zusätzlich darin. Gleiche
    // Eingaben, gleiche Abfrage, gleiche Zahl – wer etwas anderes lesen darf, hat einen anderen Schlüssel.
    const admin = !!zg?.admin || (!zg && ich.rolle === 'admin');
    const bestandSchluessel = fingerabdruck({ v: 2, admin, lesen, sichten: gemeinsam.map((x) => [x.id, x.k]) });
    const ichSchluessel = `${ich.id}|${ohneEmpfaenger ? 'o' : ''}|${fingerabdruck({ v: 2, admin, lesen, sichten: persoenlich.map((x) => [x.id, x.k]) })}`;
    const beginn = performance.now();
    const g = this.gueltigkeit();
    // #918: Der Mappenstand genügt, solange der Lesefilter keine Favoriten meint (die Ansichten mit „ist mein Favorit“
    // zählen bei den Zahlen der Person).
    const bestand = mitFavoriten(lesen) ? this.bestandFav : this.bestand;
    const [b, p] = await Promise.all([
      bestand.hole(
        bestandSchluessel,
        async () => {
          // #1623: Die Gruppen zählt eine kleine Abfrage daneben. Eine Spalte mehr im großen Lauf kann ihn über die
          // JIT-Schwelle von PostgreSQL heben (gemessen bei 50.000 Mappen: 80 statt 340 ms).
          const [w, gruppen] = await Promise.all([
            this.repo.zaehleBestand(
              gemeinsam.filter((x) => !x.gruppe).map((x) => x.k),
              lesen,
            ),
            this.repo.zaehleKlauseln(
              gemeinsam.filter((x) => x.gruppe).map((x) => x.k),
              lesen,
            ),
          ]);
          return { wert: { ...w, sichten: [...w.sichten, ...gruppen] }, zeitabhaengig: zeitabh };
        },
        g,
      ),
      this.persoenlich.hole(
        ichSchluessel,
        async () => ({
          wert: await this.repo.zaehlePersoenlich(
            ich.id,
            ohneEmpfaenger,
            lesen,
            persoenlich.map((x) => x.k),
          ),
          zeitabhaengig: zeitabh,
        }),
        g,
      ),
    ]);
    // Server-Timing `zs`: die teure Zählung über alle Mappen; die Zahlen der Person sind kleine Zählungen.
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: b.art, ms: performance.now() - beginn };
    const n = new Map<string, number>([
      ...gemeinsam.map((x, i) => [x.id, b.wert.sichten[i]] as const),
      ...persoenlich.map((x, i) => [x.id, p.wert.sichten[i]] as const),
    ]);
    return {
      typen: Object.fromEntries(b.wert.typen),
      eingang: p.wert.eingang,
      favoriten: p.wert.favoriten,
      sichten: Object.fromEntries(sichten.map((x) => [x.id, n.get(x.id) ?? 0])),
      gruppen: Object.fromEntries([
        ...gz.wieAnsicht.map((g) => [g.gruppe, n.get(g.sicht) ?? 0] as const),
        ...gz.eigene.map((g) => [g.gruppe, n.get(`gruppe:${g.gruppe}`) ?? 0] as const),
      ]),
      // Papierkorb (#43): eigene gelöschte Mappen.
      papierkorb: p.wert.papierkorb,
      ...rahmen,
    };
  }

  /**
   * Was die Ablage ohne Zählen sofort braucht (#512): Tage im Papierkorb (0 = aus), die Sicht
   * „Neue Post“ und die Merkmale der Ablage (#1032). Die Oberfläche lädt das vorab, die Zahlen danach.
   */
  async zaehlerRahmen() {
    // Post (#192): Zahl der Sicht „Neue Post“ hervorheben wie im Eingang.
    // Merkmale der Ablage (#1032): für die Anzeige-Bedingungen im Formular (#1033).
    // Eigene Organisationen (#995): nur die Ids – für „zeigt auf eine eigene Organisation“ im Formular.
    return {
      papierkorbTage: await this.papierkorbTage(),
      neuePost: await this.neuePostSicht(),
      favoritenSicht: await this.favoritenSicht(),
      merkmale: await this.kern.merkmale(),
      eigeneOrganisationen: (await this.kern.eigeneOrganisationen()).map((x) => x.id),
    };
  }

  /**
   * Zähler-Endpunkt (#625, GET /api/v1/ich/zaehler): nur Zahlen, in den Rechten des Benutzers, ohne Titel,
   * Namen oder Inhalte – für Hausautomatisierung, Anzeigen und Clients.
   *
   * - neuePost: Post im Stand „Neu“, deren „Für“ der Benutzer ist oder leer ist, und die er lesen darf.
   * - zuErledigen: wie „Zu erledigen“ in der Ablage (Mappen mit offenen Aufgaben für ihn).
   * - ueberfaellig: eigene offene Fristen, Erinnerungen und Aufgaben mit Datum vor heute.
   *
   * „anstehend“ gibt es seit #725 nicht mehr: Automatisierungen legen Aufgaben zum richtigen Zeitpunkt an.
   *
   * Alle Zahlen kommen aus den Zwischenspeichern von #512 und #528. Der Stand liegt in der Datenbank
   * (`zaehlerstaende`): Er zählt hoch, sobald die Zahlen beim Abruf anders sind als beim letzten – das übersteht
   * Neustarts und gilt für alle Server gleich. Das ETag ist Stand und Hash der Zahlen; gleiche Zahlen, gleiches ETag.
   */
  async zaehlerAbruf(z: Zugriff): Promise<{ zahlen: Zaehlerzahlen; stand: number; geaendert: string; etag: string }> {
    const ansichten = await this.zaehler(z.ich, z);
    const heute = heuteIn();
    const t = await this.termine(z, { von: heute, bis: heute });
    const ueberfaellig = t.eintraege.filter((e) => e.faellig && e.datum < heute).length;
    const zahlen: Zaehlerzahlen = { neuePost: await this.neuePostFuer(z), zuErledigen: ansichten.eingang, ueberfaellig };
    // Meist unverändert: dann nur lesen, nichts schreiben.
    const abdruck = fingerabdruck({ v: 1, ich: z.ich.id, zahlen });
    const da = await this.repo.zaehlerstand(z.ich.id);
    const s = da?.abdruck === abdruck ? da : await this.repo.setzeZaehlerstand(z.ich.id, abdruck);
    return { zahlen, stand: s.stand, geaendert: s.geaendert, etag: `"z${s.stand}-${s.abdruck}"` };
  }

  /**
   * Stand der Ablage für die Oberfläche (#919, `GET /api/ablage/stand`): ein kurzer Fingerabdruck, kein Inhalt. Die
   * Startseite und die Zähler der Seitenleiste fragen ihn alle 10–15 s ab und laden nur neu, wenn er sich geändert hat.
   *
   * Billig: Haushaltsstand (Zahlen, auch Favoriten und Erinnerungen) und Mappenstand (#918) kommen in einer Anfrage aus
   * der Abfrage der Sitzung (`standSpalten`), keine weitere Datenbankabfrage. Dazu, was für die Person zählt: das
   * Datum (zeitabhängige Ansichten und Termine wechseln um Mitternacht) und die wirksame Rolle (Verwaltungsmodus sieht
   * mehr). Nicht die Zähler dieses Prozesses – bei mehreren Prozessen wechselte der Wert sonst je nach Prozess.
   * „Nachhinken ja, falsch nie“: Er ändert sich höchstens zu oft, nie zu selten für Änderungen über das Repo.
   */
  async ablageStand(ich: { rolle: string }): Promise<string> {
    const [zahlen, mappen] = await Promise.all([this.stand.aktuell(), this.mappenstand.aktuell()]);
    return fingerabdruck({ v: 1, zahlen, mappen, heute: heuteIn(), rolle: ich.rolle });
  }

  /** Neue Post für den Benutzer (#625): Stand „Neu“ und „An“ (bis #1042 „Für“) ist er selbst oder leer; nur lesbare Post. */
  private async neuePostFuer(z: Zugriff): Promise<number> {
    const post = [...z.typen.values()].find((t) => t.system === 'post');
    if (!post) return 0;
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${fingerabdruck({ lesen: z.lesen, rollen: z.a.meineRollen, post: post.id })}`;
    const r = await this.neuePostSpeicher.hole(
      schluessel,
      async () => {
        const neu = {
          art: 'feld' as const,
          feld: 'stand',
          op: 'einerVon' as const,
          wert: { art: 'fest' as const, wert: [POST_STAND.neu] },
        };
        const klausel = (an: Bedingung) => ({ typen: [post.id], filter: filterFuer({ bedingungen: [neu, an] }, [post], z.a) });
        const [n] = await this.repo.zaehleKlauseln(
          [[klausel({ art: 'feld', feld: 'an', op: 'zeigtAuf', wert: { art: 'ich' } }), klausel({ art: 'feld', feld: 'an', op: 'leer' })]],
          z.lesen,
        );
        return { wert: n, zeitabhaengig: false };
      },
      this.gueltigkeit(),
    );
    return r.wert;
  }

  /** Nach Massenläufen (#367): Statistik der Datenbank auffrischen; ein Fehler dabei ist nur ein Hinweis. */
  async aktualisiereStatistik() {
    const t = Date.now();
    try {
      await this.repo.aktualisiereStatistik();
      protokoll.modul('datenbank').info('Statistik aufgefrischt (ANALYZE)', { ms: Date.now() - t });
    } catch (e) {
      protokoll.modul('datenbank').warn('Statistik ließ sich nicht auffrischen (ANALYZE)', { fehler: (e as Error).message });
    }
  }

  /**
   * Alle Treffer einer Sicht mit Suche (#149): nur die Ids der lesbaren Mappen, höchstens MAX_AUSWAHL. Dieselben Treffer
   * wie `seite` – Teile (#1031), ohne genauen Treffer mit ähnlichen Wörtern (#356), im Eingang nur lesbare –, aber seit
   * #1335 nur die Ids aus der Datenbank: keine Werte, Bezüge, Aufgaben oder Favoriten. Der Export holt die Mappen danach
   * genau einmal (`holeMappen`); vorher lud er sie hier über die volle Seite schon ein erstes Mal.
   */
  async trefferIds(
    ich: { id: string; rolle: string },
    q: Parameters<SichtenDienst['seite']>[1],
    z?: Zugriff,
  ): Promise<{ ids: string[]; gesamt: number }> {
    const { lesen, typen, varianten, anfrage } = await this.seitenAnfrageFuer(ich, { ...q, von: 0, anzahl: MAX_AUSWAHL }, z, MAX_AUSWAHL);
    const funde = await this.teilFunde(anfrage, typen, varianten);
    if (funde) anfrage.auchIds = [...funde.keys()];
    let r = await this.repo.trefferIds({ ...anfrage, varianten });
    const gesucht = anfrage.suche ?? anfrage.textfilter?.text;
    if (r.gesamt === 0 && gesucht && (await this.unscharfAn())) {
      // Wie `unscharfeSuche`, nur ohne Vorschlag „Meintest du …?“.
      const begriffe = suchbegriffe(gesucht);
      const aehnlich = begriffe ? await this.teile.suche.aehnlicheWoerter(begriffe, 5) : {};
      if (Object.keys(aehnlich).length) {
        const f = await this.teilFunde(anfrage, typen, varianten, aehnlich);
        const u = await this.repo.trefferIds({ ...anfrage, varianten, aehnlich, ...(f ? { auchIds: [...f.keys()] } : {}) });
        if (u.gesamt > 0) r = u;
      }
    }
    // Eingang (#124): Aufgaben auch an nicht lesbaren Mappen – deren Ids gehören nicht zu den Treffern.
    if (q.sicht !== 'eingang' || !lesen) return r;
    const ok = await this.repo.lesbare(r.ids, lesen);
    return { ids: r.ids.filter((id) => ok.has(id)), gesamt: r.gesamt };
  }
}

/**
 * Fundstellen in Teilen (#1031) an die Treffer hängen: „gefunden in Rechnungsposition …“, wo die Mappe selbst keine
 * Fundstelle in Dokumenten oder Notizen hat.
 */
function mitTeilFunden(ids: string[], eigene: Record<string, Ausschnitt> | undefined, funde: TeilFunde): Record<string, Ausschnitt> {
  const erg: Record<string, Ausschnitt> = { ...(eigene ?? {}) };
  for (const id of ids) {
    const f = funde.get(id);
    if (!f || erg[id]) continue;
    erg[id] = {
      dokument: f.ausschnitt?.dokument ?? '',
      text: f.ausschnitt?.text ?? '',
      teil: { id: f.id, typId: f.typId, titel: f.titel },
    };
  }
  return erg;
}
