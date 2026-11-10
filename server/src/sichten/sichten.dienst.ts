/**
 * Sichten (#1076 aus dienst.ts): eine Seite einer Ansicht (#38, #98, #149, #172, #199, #356, #740, #918), Zähler der
 * Ablage (#512, #742, #918), Zähler-Endpunkt (#625), Stand der Ablage (#919). Schicht 3 – bekommt den Kern, die
 * Rechteprüfung, Mappen, Suche und die übrigen Teile dieses Ordners, nicht den ganzen Dienst.
 */
import { liesDirektlink } from '../../../shared/src/direktlink';
import { abfrageAus, liesSuche } from '../../../shared/src/erweitertesuche';
import type { TermineAntwort } from '../../../shared/src/fristen';
import { type Aufgabe, type Mappentyp, MAX_AUSWAHL, POST_STAND, sortierbar, verweiseVon, type Werte } from '../../../shared/src/model';
import { auswahlKlausel, type Bedingung, filterFuer, heuteIn, klauselnFuer, setzeEigeneWerte, type Sicht, wirksameTypen } from '../../../shared/src/sichten';
import { suchbegriffe, type Varianten, vorschlagAus } from '../../../shared/src/suche';
import { Fachfehler } from '../fehler';
import { ABO_ARTEN, type Kern, type Zugriff } from '../kern';
import type { MappenDienst } from '../mappen';
import { kontext, protokoll } from '../protokoll';
import type { Repo, SeitenAnfrage, SortierungIntern } from '../repo';
import { t } from '../sprache';
import type { SucheDienst } from '../suche';
import { fingerabdruck, type Gueltigkeit, type Haushaltsstand, mitFavoriten, Zaehlerspeicher, zeitabhaengig } from '../zaehlerspeicher';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import type { Systemsichten } from './systemsichten';
import type { SichtenVerwaltung } from './verwalten';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();

/** Zähler-Endpunkt (#625): nur Zahlen, keine Inhalte. */
export interface Zaehlerzahlen { neuePost: number; zuErledigen: number; ueberfaellig: number }

const SYSTEMSORTIERUNG: Record<string, SortierungIntern['art']> = {
  _titel: 'titel', _typ: 'typ', _erstellt: 'erstellt', _geaendert: 'geaendert', _erstelltVon: 'erstelltVon', _geaendertVon: 'geaendertVon',
};
/** Sortierung aus Spalte und Richtung; unbekannte oder nicht sortierbare Spalten → nach Titel. */
export function sortierungAus(spalte: string, absteigend: boolean, typ?: Mappentyp): SortierungIntern | undefined {
  if (!spalte) return undefined;
  if (SYSTEMSORTIERUNG[spalte]) return { art: SYSTEMSORTIERUNG[spalte], absteigend };
  const f = typ?.felder.find((x) => x.key === spalte);
  if (!f || !sortierbar(spalte, typ)) return undefined;
  const art = f.typ === 'prozent' ? 'zahl' : f.typ === 'zahl' || f.typ === 'betrag' || f.typ === 'zeitraum' || f.typ === 'datum' || f.typ === 'janein' ? f.typ : 'text';
  return { art, key: f.key, absteigend };
}

/** Die Teile, die die Sichten rufen: Rechteprüfung, Mappen, Suche und die anderen Klassen dieses Ordners. */
export interface SichtenTeile { rechte: ZugriffDienst; mappen: MappenDienst; suche: SucheDienst; verwalten: SichtenVerwaltung; systemsichten: Systemsichten }

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
export interface SichtenStaende { stand: Haushaltsstand; mappenstand: Haushaltsstand }

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

  constructor(private readonly kern: Kern, private readonly teile: SichtenTeile, private readonly anschluss: SichtenAnschluss, private readonly staende: SichtenStaende) {
    this.bestand = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(staende.mappenstand);
    this.bestandFav = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehleBestand']>>>(staende.stand);
    this.persoenlich = new Zaehlerspeicher<Awaited<ReturnType<Repo['zaehlePersoenlich']>>>(staende.stand);
    this.trefferSpeicher = new Zaehlerspeicher<number>(staende.mappenstand);
    this.trefferFavSpeicher = new Zaehlerspeicher<number>(staende.stand);
    this.neuePostSpeicher = new Zaehlerspeicher<number>(staende.stand);
  }

  private get repo(): Repo { return this.kern.repo; }
  private get stand() { return this.staende.stand; }
  private get mappenstand() { return this.staende.mappenstand; }
  private gueltigkeit() { return this.anschluss.gueltigkeit(); }
  private aufloesung(benutzerId: string) { return this.teile.rechte.aufloesung(benutzerId); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.teile.rechte.maskiereBezuege(...a); }
  private persoenlichAn(benutzerId: string, schluessel: string) { return this.teile.mappen.persoenlichAn(benutzerId, schluessel); }
  private suchVarianten(texte: Array<string | undefined>) { return this.teile.suche.suchVarianten(texte); }
  private unscharfAn() { return this.teile.suche.unscharfAn(); }
  private aehnlicheZurSuche(...a: Parameters<SucheDienst['aehnlicheZurSuche']>) { return this.teile.suche.aehnlicheZurSuche(...a); }
  private verborgeneSichten(alle: Sicht[], z?: Zugriff) { return this.teile.verwalten.verborgeneSichten(alle, z); }
  private neuePostSicht() { return this.teile.systemsichten.neuePostSicht(); }
  private favoritenSicht() { return this.teile.systemsichten.favoritenSicht(); }
  private papierkorbTage() { return this.kern.papierkorbTage(); }
  private siehtOhneEmpfaenger(ich: { id: string; rolle: string }) { return this.anschluss.siehtOhneEmpfaenger(ich); }
  private ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string) { return this.anschluss.ohneLeserechtText(liste, lesbar, ich); }
  private termine(z: Zugriff, q: { von?: unknown; bis?: unknown }) { return this.anschluss.termine(z, q); }

  /* ---------- Sichten: seitenweise und gezählt ---------- */

  /**
   * Eine Seite einer Sicht: „eingang“, eine verwaltete Sicht (#38) oder – für Links auf Mappen,
   * deren Typ keine eigene Sicht hat – eine Typ-Id. Mit den Bezügen für die Anzeige.
   */
  async seite(ich: { id: string; rolle: string }, q: { sicht?: string; link?: unknown; eigene?: unknown; von?: unknown; anzahl?: unknown; suche?: unknown; sortierung?: unknown; absteigend?: unknown; volltext?: unknown; notizen?: unknown; gesamt?: unknown }, z?: Zugriff, grenze = 500) {
    // Berechtigungen (#124): nur lesbare Mappen; der Eingang zeigt Aufgaben auch zu nicht lesbaren – ohne Inhalt.
    const lesen = z?.lesen ?? null;
    const von = Math.max(0, Math.floor(Number(q.von) || 0));
    const anzahl = Math.min(grenze, Math.max(1, Math.floor(Number(q.anzahl) || 100)));
    const suche = text(q.suche).slice(0, 200) || undefined;
    // Auch im Volltext der Dokumente (#45) und in Notizen (#55) suchen.
    const volltext = q.volltext === true || q.volltext === 'true' || undefined;
    const notizen = q.notizen === true || q.notizen === 'true' || undefined;
    // Mappentypen und Auflösung (Rollen, heute) hat der Zugriff schon gelesen (#615); ein Dienstkonto kennt nur seine Typen.
    const typen = z?.typen && !z.paket ? z.typen : new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
    const aufloesung = () => (z?.a && z.ich?.id === ich.id ? Promise.resolve(z.a) : this.aufloesung(ich.id));
    const sichten = await this.repo.listeSichten();
    // „typ:<id>“: alle Mappen eines Typs, ohne Bedingungen einer Sicht (z. B. Auswahl eines Verweises).
    const nurTyp = String(q.sicht ?? '').startsWith('typ:') ? String(q.sicht).slice(4) : null;
    // „feld:<typId>:<feldKey>“ (#172): Auswahl für ein Referenzfeld – Zieltyp mit dem Auswahlfilter des Felds.
    const auswahl = String(q.sicht ?? '').startsWith('feld:') ? (() => {
      const [, typId, key] = String(q.sicht).split(':');
      const f = typen.get(typId)?.felder.find((x) => x.key === key && x.typ === 'referenz');
      const ziel = f ? typen.get(f.zielTyp ?? '') : undefined;
      if (!f || !ziel) throw new Fachfehler(404, t('meldungen.dienst.dieses-verweisfeld-gibt-es'));
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
    const einTyp = erweitert ? (erweitert.typen.length === 1 ? erweitert.typen[0] : undefined) : link ? link.typ : fest ? undefined : sicht ? (() => { const w = wirksameTypen(sichten, sicht.id, typen.keys()); return w.length === 1 ? typen.get(w[0]) : undefined; })() : typen.get(nurTyp ?? String(q.sicht));
    const sortierung = link && !text(q.sortierung)
      ? (link.sortierung ? sortierungAus(link.sortierung.spalte, link.sortierung.absteigend, einTyp) : undefined)
      : sortierungAus(text(q.sortierung), q.absteigend === 'true' || q.absteigend === true, einTyp);
    // Unscharfe Suche (#356): Varianten (gleichbedeutende Wörter, ohne Bindestrich) für Suche und Volltextfilter.
    const textfilter = erweitert?.volltext ?? undefined;
    const varianten = await this.suchVarianten([suche, textfilter?.text]);
    const anfrage: SeitenAnfrage = q.sicht === 'eingang'
      ? { eingang: { benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich) }, suche, volltext, notizen, von, anzahl, sortierung, lesen: suche ? lesen : null }
      : q.sicht === 'favoriten'
        ? { favoriten: { benutzerId: ich.id }, suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : erweitert
        ? {
            klauseln: [{ typen: (erweitert.typen.length ? erweitert.typen : [...typen.values()]).map((t) => t.id), filter: filterFuer(erweitert, erweitert.typen, await aufloesung()) }],
            textfilter, suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : link
        ? { klauseln: [{ typen: [link.typ.id], filter: filterFuer(link, [link.typ], await aufloesung()) }], suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : auswahl
        ? { klauseln: [auswahlKlausel(setzeEigeneWerte(auswahl.f.auswahlFilter ?? [], auswahl.eigene), auswahl.ziel, await aufloesung())], suche, volltext, notizen, von, anzahl, sortierung, lesen }
      : sicht
        ? { klauseln: klauselnFuer(sichten, sicht.id, typen, await aufloesung(), verborgen), suche, volltext, notizen, von, anzahl, sortierung, lesen }
        : { typId: nurTyp ?? q.sicht, suche, volltext, notizen, von, anzahl, sortierung, lesen };
    // Beim Blättern ohne Suche (#740): die Zahl vom ersten Blatt statt noch einmal zu zählen.
    const bekannt = Number(q.gesamt);
    const gesamt = von > 0 && !suche && !textfilter && Number.isInteger(bekannt) && bekannt >= 0 ? bekannt : undefined;
    let r = gesamt !== undefined ? await this.repo.seite({ ...anfrage, varianten, gesamt }) : await this.seiteMitZahl(anfrage, varianten);
    // Ohne genauen Treffer (#356): mit ähnlichen Wörtern aus dem Wörterverzeichnis noch einmal – genaue Treffer gehen so
    // immer vor; „Meintest du …?“ schlägt die Suche mit dem besten ähnlichen Wort vor.
    let unscharf: { statt: string; vorschlag: string | null; begriffe: Record<string, string[]> } | null = null;
    const gesucht = suche ?? textfilter?.text;
    if (r.gesamt === 0 && gesucht && await this.unscharfAn()) {
      const begriffe = suchbegriffe(gesucht);
      const aehnlich = begriffe ? await this.repo.aehnlicheWoerter(begriffe, 5) : {};
      if (Object.keys(aehnlich).length) {
        const r2 = await this.repo.seite({ ...anfrage, varianten, aehnlich });
        if (r2.gesamt > 0) {
          r = r2;
          // „Meintest du …?“ nur, wenn der Vorschlag selbst etwas findet, das der Benutzer lesen darf – das
          // Wörterverzeichnis kennt auch Wörter aus Mappen, die er nicht sehen darf (ohne Lesefilter: alles lesbar).
          let vorschlag = vorschlagAus(begriffe!, aehnlich);
          if (vorschlag && anfrage.lesen) {
            const probe: SeitenAnfrage = suche ? { ...anfrage, suche: vorschlag } : { ...anfrage, textfilter: { ...textfilter!, text: vorschlag } };
            if (!(await this.repo.gibtTreffer(probe))) vorschlag = null;
          }
          unscharf = { statt: gesucht, vorschlag, begriffe: aehnlich };
        }
      }
    }
    if (q.sicht === 'eingang' && lesen) {
      const ok = await this.repo.lesbare(r.mappen.map((m) => m.id), lesen);
      r.mappen = r.mappen.map((m) => (ok.has(m.id) ? m : { id: m.id, typId: m.typId, werte: {}, titel: NICHT_SICHTBAR, erstellt: m.erstellt, erstelltVon: null, geaendert: m.geaendert, geaendertVon: null, verborgen: true }));
    }
    const ziele = r.mappen.flatMap((m) => { const t = typen.get(m.typId); return t ? verweiseVon(t, m.werte).map((v) => v.zielId) : []; });
    // Eingang (#54): je Mappe, was für mich zu tun ist.
    const aufgaben: Record<string, string> = {};
    if (q.sicht === 'eingang' && r.mappen.length) {
      const offen = await this.repo.offeneAufgaben({ benutzerId: ich.id, admin: await this.siehtOhneEmpfaenger(ich), mappeIds: r.mappen.map((m) => m.id) });
      // #798: automatische Aufgaben an Mappen ohne Leserecht nur mit Hinweis.
      for (const a of await this.ohneLeserechtText(offen, new Set(r.mappen.filter((m) => !m.verborgen).map((m) => m.id)), ich.id)) {
        aufgaben[a.mappeId] = aufgaben[a.mappeId] ? `${aufgaben[a.mappeId]} · ${a.text}` : a.text;
      }
    }
    // Ähnliche Treffer (#442): nur in der Suche über alle Mappen bzw. der erweiterten Suche ohne Feldbedingungen,
    // auf der ersten Seite und mit „auch in Dokumenten“ – Treffer aus Ansichten mit Bedingungen würden diese verletzen.
    const aehnlich = erweitert && !erweitert.bedingungen.length && suche && volltext && von === 0
      ? await this.aehnlicheZurSuche(z, suche, { typen: erweitert.typen.length ? new Set(erweitert.typen.map((t) => t.id)) : null, ohneMappen: new Set(r.mappen.map((m) => m.id)) })
      : [];
    return {
      gesamt: r.gesamt, von, mappen: r.mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)),
      ...(r.ausschnitte ? { ausschnitte: r.ausschnitte } : {}), ...(q.sicht === 'eingang' ? { aufgaben } : {}),
      ...(aehnlich.length ? { aehnlich } : {}),
      ...(unscharf ? { unscharf } : {}),
      /** Welche Mappen dieser Seite Favoriten des Benutzers sind (#62). */
      favoriten: [...await this.repo.favoritenVon(ich.id, r.mappen.map((m) => m.id))],
      /** Favorit = Abo (#422): Favoriten und eigene Mappen, die andere seit dem letzten Sehen geändert haben. */
      geaendert: await this.persoenlichAn(ich.id, 'geaenderte_hervorheben')
        ? [...await this.repo.geaendertVonAnderen(ich.id, r.mappen.filter((m) => !m.verborgen).map((m) => m.id), ABO_ARTEN)] : [],
      /** In der Favoritenliste und Ansichten mit „ist mein Favorit“ (#725): Favoriten ohne Benachrichtigung (#422). */
      ...(q.sicht === 'favoriten' || sicht?.bedingungen.some((x) => x.art === 'favorit') ? { stumm: [...await this.repo.stummeFavoriten(ich.id, r.mappen.map((m) => m.id))] } : {}),
    };
  }

  /**
   * Eine Seite mit der Zahl der Treffer aus dem Zwischenspeicher (#918): Die Zahl gilt je Anfrage ohne Blatt und
   * Reihenfolge – Ansicht bzw. Bedingungen, Lesefilter, Suche samt Varianten, Eingang oder Favoriten der Person – und nur
   * bei gleichem Mappenstand (mit Favoriten: Haushaltsstand), ohne Mindestgültigkeit: Sie bleibt genau. Einmal gezählt,
   * holt jede weitere Anfrage nur die Seite. Nicht zwischengespeichert wird die Suche in Dokumenten und Notizen: Deren
   * Texte (Texterkennung, Notizen) ändern keinen Stand.
   */
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
   * Anzahl Mappen je Typ (davon unpassend, Demo), je Sicht und im Eingang des Benutzers.
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
    // Ansichten, deren Bedingungen die Person selbst meinen (z. B. „ist mein Favorit“), zählen bei ihren eigenen Zahlen;
    // alle anderen gemeinsam für alle mit denselben Eingaben.
    const eigen = sichten.map((_, i) => JSON.stringify(klauseln[i]).includes(ich.id));
    const gemeinsam = sichten.map((x, i) => ({ id: x.id, k: klauseln[i], i })).filter((x) => !eigen[x.i]);
    const persoenlich = sichten.map((x, i) => ({ id: x.id, k: klauseln[i], i })).filter((x) => eigen[x.i]);
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
      bestand.hole(bestandSchluessel, async () => ({ wert: await this.repo.zaehleBestand(gemeinsam.map((x) => x.k), lesen), zeitabhaengig: zeitabh }), g),
      this.persoenlich.hole(ichSchluessel, async () => ({ wert: await this.repo.zaehlePersoenlich(ich.id, ohneEmpfaenger, lesen, persoenlich.map((x) => x.k)), zeitabhaengig: zeitabh }), g),
    ]);
    // Server-Timing `zs`: die teure Zählung über alle Mappen; die Zahlen der Person sind kleine Zählungen.
    const k = kontext.getStore();
    if (k) k.zwischenspeicher = { art: b.art, ms: performance.now() - beginn };
    const n = new Map<string, number>([...gemeinsam.map((x, i) => [x.id, b.wert.sichten[i]] as const), ...persoenlich.map((x, i) => [x.id, p.wert.sichten[i]] as const)]);
    return {
      typen: Object.fromEntries(b.wert.typen), eingang: p.wert.eingang, favoriten: p.wert.favoriten,
      sichten: Object.fromEntries(sichten.map((x) => [x.id, n.get(x.id) ?? 0])),
      // Papierkorb (#43): eigene gelöschte Mappen.
      papierkorb: p.wert.papierkorb,
      ...await this.zaehlerRahmen(),
    };
  }

  /**
   * Was die Ablage ohne Zählen sofort braucht (#512): Tage im Papierkorb (0 = aus), die Sicht
   * „Neue Post“ und die Merkmale der Ablage (#1032). Die Oberfläche lädt das vorab, die Zahlen danach.
   */
  async zaehlerRahmen() {
    // Post (#192): Zahl der Sicht „Neue Post“ hervorheben wie im Eingang.
    // Merkmale der Ablage (#1032): für die Anzeige-Bedingungen im Formular (#1033).
    return { papierkorbTage: await this.papierkorbTage(), neuePost: await this.neuePostSicht(), favoritenSicht: await this.favoritenSicht(), merkmale: await this.kern.merkmale() };
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

  /** Webhooks (#627): nach jeder Änderung, die Zahlen der Ansichten oder die Termine ändern kann. */
  beiAenderung(f: () => void) { this.stand.beiAenderung(f); }

  /** Neue Post für den Benutzer (#625): Stand „Neu“ und „Für“ ist er selbst oder leer; nur lesbare Post. */
  private async neuePostFuer(z: Zugriff): Promise<number> {
    const post = [...z.typen.values()].find((t) => t.system === 'post');
    if (!post) return 0;
    const schluessel = `${z.ich.id}|${z.ich.rolle}|${fingerabdruck({ lesen: z.lesen, rollen: z.a.meineRollen, post: post.id })}`;
    const r = await this.neuePostSpeicher.hole(schluessel, async () => {
      const neu = { art: 'feld' as const, feld: 'stand', op: 'einerVon' as const, wert: { art: 'fest' as const, wert: [POST_STAND.neu] } };
      const klausel = (fuer: Bedingung) => ({ typen: [post.id], filter: filterFuer({ bedingungen: [neu, fuer] }, [post], z.a) });
      const [n] = await this.repo.zaehleKlauseln([[
        klausel({ art: 'feld', feld: 'fuer', op: 'zeigtAuf', wert: { art: 'ich' } }),
        klausel({ art: 'feld', feld: 'fuer', op: 'leer' }),
      ]], z.lesen);
      return { wert: n, zeitabhaengig: false };
    }, this.gueltigkeit());
    return r.wert;
  }

  /** Nach Massenläufen (#367): Statistik der Datenbank auffrischen; ein Fehler dabei ist nur ein Hinweis. */
  async aktualisiereStatistik() {
    const t = Date.now();
    try { await this.repo.aktualisiereStatistik(); protokoll.modul('datenbank').info('Statistik aufgefrischt (ANALYZE)', { ms: Date.now() - t }); }
    catch (e) { protokoll.modul('datenbank').warn('Statistik ließ sich nicht auffrischen (ANALYZE)', { fehler: (e as Error).message }); }
  }

  /** Alle Treffer einer Sicht mit Suche (#149): nur die Ids der lesbaren Mappen, höchstens MAX_AUSWAHL. */
  async trefferIds(ich: { id: string; rolle: string }, q: Parameters<SichtenDienst['seite']>[1], z?: Zugriff): Promise<{ ids: string[]; gesamt: number }> {
    const s = await this.seite(ich, { ...q, von: 0, anzahl: MAX_AUSWAHL }, z, MAX_AUSWAHL);
    return { ids: s.mappen.filter((m) => !m.verborgen).map((m) => m.id), gesamt: s.gesamt };
  }
}
