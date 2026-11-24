/**
 * Schritte der Vorschau (#1278, Schritt 6a-2; vorher Teil von `plane`), die die Paketverwaltung brauchen: Stand der
 * Ablage, Herausgeber und Umzug, Verweise auf Mappentypen von Ablago, Abhängigkeiten, Umbau, Pläne der Typen und
 * Aktionen sowie die Vorschau selbst. Reihenfolge und Wortlaut der Probleme und Hinweise wie vorher.
 */
import { istLeer, type Mappentyp } from '../../../../shared/src/model';
import {
  DMS_ALIAS,
  veralteteVerweise,
  gleicheRechte,
  rechtePunkte,
  dmsPasst,
  neuestePassende,
  passt,
  vergleicheVersion,
  eingebauterHelfer,
  paketStufe,
  type Katalog,
  type KatalogVersion,
} from '../../../../shared/src/pakete';
import { archivAusPaket } from '../../../../shared/src/archiv';
import { hauptpaket, istOffiziellerHerausgeber, typKennung } from '../../../../shared/src/kennungen';
import { einstellungsAenderung } from '../../../../shared/src/paketeinstellungen';
import { t } from '../../sprache/sprache';
import { DEUTSCH } from '../../../../shared/src/deutsch';
import { abdeckung } from '../../../../shared/src/sprachpaket';
import { type ErgaenzungPlan, type VorgabePlan } from '../../../../shared/src/vorgaben';
import { darfStand, planeUmbau, type UmbauLage } from '../index';
import { erlaubt } from '../../../../shared/src/darf';
import { paketZeitplaene, paketZeitplan } from './automatisierungen';
import { beispielDokumenteVon } from './beispiele';
import {
  BASIS_ABLAGEORT_AB,
  DMS_PRAEFIX,
  DMS_TYPEN,
  DMS_VERWEISE_AB,
  istDmsVerweis,
  type Paket,
  type PaketTyp,
  str,
  typverweise,
} from './format';
import { freierName, gleicheQuelle, installierteErsetzt, offiziellBelegt, paketFelderAus, uebernahmePlan, vertrauen } from './hilfen';
import { log } from './optionen';
import { type AbhaengigkeitPlan, type SichtPlan, type TypPlan, type Vorschau } from './plan';
import { problem, type PlanLauf, type PlanMehr, type TypIdVon, type Uebernahme } from './planen-lauf';
import {
  abschnitteNeu,
  beschriftungenNeu,
  erkennungNeu,
  formatNeu,
  neueFelderAuf,
  typAngabenNeu,
  vorbelegenNeu,
  wiederfindenNeu,
} from './update-neu';
import { PaketVorschauTeile } from './vorschau-teile';

type VorgabenPlaene = { vorgaben: VorgabePlan[]; ergaenzungen: ErgaenzungPlan[] };
type Aktionsplan = NonNullable<Vorschau['aktionen']>;

/** Schritte, aus denen `plane` die Vorschau zusammensetzt. */
export abstract class PaketPlanSchritte extends PaketVorschauTeile {
  /** Stand der Ablage zum Paket: Installationen, die eigene (auch unter einer früheren Id), Typen, Ansichten, Ablago-Version. */
  protected async neuerPlanLauf(
    paket: Paket,
    x: PlanMehr & { v?: KatalogVersion; katalog?: Katalog; namen: Record<string, string>; sichtNamen: Record<string, string> },
  ): Promise<PlanLauf> {
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    // Umzug (#1084): Unter der neuen Id noch nicht da, aber unter einer früheren – dann ist es ein Update dieser Installation.
    const ich = installierte.find((p) => p.id === m.id) ?? installierteErsetzt(installierte, m) ?? null;
    const typen = await this.d.mappentypen.listeTypen();
    const sichten = await this.d.sichtenVerwaltung.listeSichten();
    const probleme: string[] = [];
    const dmsVersion = this.o.version();
    const dmsOk = dmsPasst(dmsVersion, m.dms);
    if (!dmsOk) probleme.push(t('meldungen.pakete.das-paket-braucht-ablago', { dms: m.dms, dmsVersion }));
    return {
      ...x,
      paket,
      m,
      installierte,
      ich,
      umzug: ich && ich.id !== m.id ? ich.id : null,
      typen,
      sichten,
      probleme,
      fehlercodes: [],
      hinweise: [],
      dmsVersion,
      dmsOk,
      // Herausgeber (#1084): Dieselbe Id von einem anderen Herausgeber ersetzt das installierte Paket nie.
      herausgeber: m.herausgeber ?? this.standardHerausgeber(x.quelle?.herkunft, x.quelle?.pruefung),
    };
  }

  /**
   * Code ohne Modul, schon installierte Version, Herausgeber und Schlüssel, Umzug und Ergänzung. Ergebnis: ein erstmals
   * genannter Herausgeber (nur nach Bestätigung, Sicherheit C) und ob der Herausgeber belegt ist.
   */
  protected pruefeHerkunft(l: PlanLauf) {
    const { m, ich } = l;
    // Code läuft erst mit dem Paket-Läufer; Einstellungen lassen sich schon pflegen (#197).
    if (m.code !== undefined && !l.paket.code) l.hinweise.push(t('meldungen.pakete.das-paket-enthaelt-code'));
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) {
      l.probleme.push(t('meldungen.pakete.version-ist-schon-installiert', { version: ich.version }));
      l.fehlercodes.push('schon-installiert');
    }
    this.pruefeHerausgeber(l);
    this.pruefeUmzug(l);
    this.pruefeErgaenzung(l);
    return this.herausgeberStand(l);
  }

  /**
   * Was Ablago darf (#1562): Liegt das Paket über der Grenze aus Frage 1, verhindert ein Problem mit Grund in Worten
   * das Installieren und Aktualisieren (fehlercode `darf`). Ein Update, das ein Paket neu über die Grenze hebt (z. B.
   * neu mit Internet), sagt das so. Eingebaute Helfer von Ablago laufen auf jeder Antwort.
   */
  protected async pruefeDarf(l: PlanLauf, geprueft: boolean) {
    const angabe = (id: string, c: typeof l.paket.code) => ({ id, herausgeber: l.herausgeber, geprueft, code: c?.info });
    const haupt = (id: string) => {
      const h = l.installierte.find((p) => p.id === id);
      return !!h && eingebauterHelfer({ id: h.id, herausgeber: h.herausgeber, geprueft: h.herausgeberGeprueft !== false, code: h.laeufer });
    };
    if (eingebauterHelfer(angabe(l.m.id, l.paket.code), haupt)) return;
    const stufe = l.paket.code ? paketStufe(l.paket.code.info) : l.m.code !== undefined ? 'lokal' : 'vorlagen';
    const { pakete } = await darfStand(this.d.kern.einstellungen);
    if (erlaubt(pakete, stufe)) return;
    const vorher = l.ich ? (l.ich.laeufer ? paketStufe(l.ich.laeufer) : l.ich.code ? 'lokal' : 'vorlagen') : null;
    const text =
      vorher && erlaubt(pakete, vorher)
        ? t(`werkbank.darf.grund.update.${stufe}`, { name: l.m.name })
        : t(`werkbank.darf.grund.${stufe}`, { name: l.m.name });
    problem(l, 'darf', `${text} ${t('werkbank.darf.grund.erlauben')}`);
  }

  /** Herausgeber: app.ablago nur belegt, kein anderer als der installierte, Schlüssel des signierten Katalogs. */
  private pruefeHerausgeber(l: PlanLauf) {
    const { m, ich, quelle, herausgeber } = l;
    // app.ablago (auch app.ablago.*) gehört dem Projekt (Sicherheit C): nur aus dem offiziellen Katalog bzw. mit Prüfsumme dort.
    if (istOffiziellerHerausgeber(m.herausgeber) && quelle?.pruefung && !offiziellBelegt(quelle.pruefung))
      problem(l, 'herausgeber-nicht-offiziell', t('meldungen.pakete.herausgeber-nicht-offiziell', { herausgeber: m.herausgeber! }));
    const fremd = ich ? this.andererHerausgeber(m, ich, quelle) : null;
    if (fremd) problem(l, 'anderer-herausgeber', fremd);
    // Herausgeber eines weiteren signierten Katalogs ist an dessen Schlüssel gebunden (beim ersten Mal gemerkt).
    if (
      ich?.herausgeberSchluessel &&
      quelle?.pruefung.fingerabdruck &&
      quelle.pruefung.fingerabdruck !== ich.herausgeberSchluessel &&
      !quelle.pruefung.wechsel
    ) {
      problem(l, 'herausgeber-schluessel', t('meldungen.pakete.herausgeber-schluessel', { herausgeber: herausgeber ?? '–' }));
    }
  }

  /**
   * Erstmals ein Herausgeber an einem Paket ohne (Bestand, Sicherheit C): ab jetzt gilt er – nur nach ausdrücklicher
   * Bestätigung in der Vorschau (herausgeberBestaetigt), nie still. `geprueft`: Herausgeber belegt.
   */
  private herausgeberStand(l: PlanLauf) {
    const { ich, quelle, herausgeber } = l;
    const herausgeberErstmals = ich && !this.herausgeberVon(ich) && herausgeber ? herausgeber : null;
    const geprueft =
      !!herausgeber &&
      (istOffiziellerHerausgeber(herausgeber) ? !!quelle && offiziellBelegt(quelle.pruefung) : quelle?.pruefung.art === 'anbieter');
    return { herausgeberErstmals, geprueft };
  }

  /**
   * Umzug (#1084, `ersetzt`): nur ausdrücklich, aus derselben Quelle, mindestens so vertrauenswürdig und vom selben,
   * bekannten Herausgeber – sonst könnte ein beliebiges Paket eine fremde Installation samt Zugangsdaten übernehmen.
   */
  private pruefeUmzug(l: PlanLauf) {
    const { m, ich, umzug, quelle } = l;
    if (!umzug) return;
    const vorher = this.herausgeberVon(ich!);
    if (!quelle || !gleicheQuelle(ich!.herkunft, quelle.herkunft) || vertrauen(quelle.pruefung) < this.vertrauenVon(ich!))
      problem(l, 'umzug-quelle', t('meldungen.pakete.umzug-andere-quelle', { alt: umzug, neu: m.id }));
    else if (!vorher || vorher !== l.herausgeber)
      problem(l, 'umzug-herausgeber', t('meldungen.pakete.umzug-herausgeber', { alt: umzug, neu: m.id }));
    else l.hinweise.push(t('meldungen.pakete.umzug', { alt: umzug, neu: m.id }));
  }

  /** Ergänzung mit Punkt (Sicherheit B): derselbe Herausgeber wie das Hauptpaket – installiert oder im Katalog. */
  private pruefeErgaenzung(l: PlanLauf) {
    const { m, quelle } = l;
    const haupt = hauptpaket(m.id);
    if (!haupt) return;
    const hi = l.installierte.find((p) => p.id === haupt);
    const hk = hi ? null : l.katalog?.pakete.find((p) => p.id === haupt);
    const vonHaupt = hi
      ? this.herausgeberVon(hi)
      : hk
        ? (hk.herausgeber ?? (quelle?.herkunft.art === 'katalog' ? this.standardHerausgeber(quelle.herkunft, quelle.pruefung) : null))
        : null;
    if ((hi || hk) && vonHaupt !== l.herausgeber)
      problem(
        l,
        'ergaenzung-herausgeber',
        t('meldungen.pakete.ergaenzung-herausgeber', {
          id: m.id,
          haupt,
          herausgeber: vonHaupt ?? t('meldungen.pakete.herausgeber-unbekannt'),
        }),
      );
  }

  /** Verweise auf Mappentypen des DMS (#310), z. B. dms:rolle; dms:ablageort ist seit #883 ein Alias für basis:ablageort. */
  protected async pruefeDmsVerweise(l: PlanLauf): Promise<Map<string, Mappentyp>> {
    const { paket } = l;
    const dmsTypen = await this.dmsTypen();
    const genutzt = [
      ...new Set(
        typverweise(paket.typen, paket.sichten)
          .filter(istDmsVerweis)
          .map((vw) => vw.slice(DMS_PRAEFIX.length)),
      ),
    ];
    for (const k of genutzt.filter((k) => !dmsTypen.has(k))) {
      l.probleme.push(
        DMS_ALIAS[k]
          ? t('meldungen.pakete.alias-ohne-ziel', { vw: DMS_PRAEFIX + k, neu: DMS_ALIAS[k], version: BASIS_ABLAGEORT_AB })
          : t('meldungen.pakete.das-paket-verweist-auf', { wert: DMS_TYPEN[k] ?? k, DMS_VERWEISE_AB }),
      );
    }
    const veraltet = veralteteVerweise([
      ...typverweise(paket.typen, paket.sichten),
      ...(paket.code ? [...paket.code.info.rechte.lesen, ...paket.code.info.rechte.schreiben, ...(paket.code.info.mappentypen ?? [])] : []),
      ...paket.automatisierungen.map((a) => str(a.wenn.typ)),
    ]);
    for (const vw of veraltet) l.hinweise.push(t('meldungen.pakete.alias-veraltet', { vw, neu: DMS_ALIAS[vw.slice(DMS_PRAEFIX.length)] }));
    const da = genutzt.filter((k) => dmsTypen.has(k) && !DMS_ALIAS[k]);
    if (da.length)
      l.hinweise.push(
        t('meldungen.pakete.nutzt-mappentypen-aus-ablago', {
          map: da.map((k) => t('meldungen.pakete.aus-ablago', { name: dmsTypen.get(k)!.name })).join(', '),
        }),
      );
    return dmsTypen;
  }

  /** Abhängigkeiten: installiert, passend, verfügbar; über Id und Herausgeber (Sicherheit C). */
  protected planeAbhaengigkeiten(l: PlanLauf): AbhaengigkeitPlan[] {
    const { installierte, herausgeber } = l;
    const abhaengigkeiten = Object.entries(l.m.abhaengigkeiten).map(([id, bereich]): AbhaengigkeitPlan => {
      const da = installierte.find((p) => p.id === id);
      const kp = l.katalog?.pakete.find((p) => p.id === id);
      return {
        id,
        bereich,
        installiert: da?.version ?? null,
        ok: !!da && passt(da.version, bereich) && this.herausgeberPasst(da, herausgeber),
        verfuegbar: kp ? (neuestePassende(kp, bereich)?.version ?? null) : null,
      };
    });
    // Abhängigkeiten über Id und Herausgeber (Sicherheit C): Ein fremdes „basis“ erfüllt die eines offiziellen Pakets nicht.
    for (const a of abhaengigkeiten) {
      const da = installierte.find((p) => p.id === a.id);
      if (da && !this.herausgeberPasst(da, herausgeber))
        problem(
          l,
          'abhaengigkeit-herausgeber',
          t('meldungen.pakete.abhaengigkeit-herausgeber', {
            id: a.id,
            herausgeber: this.herausgeberVon(da) ?? t('meldungen.pakete.herausgeber-unbekannt'),
          }),
        );
    }
    for (const a of abhaengigkeiten) {
      if (a.installiert && !a.ok && passt(a.installiert, a.bereich)) continue;
      if (a.installiert && !a.ok) {
        a.problem = t('meldungen.pakete.ist-in-version-installiert', { id: a.id, installiert: a.installiert, bereich: a.bereich });
        l.probleme.push(a.problem);
      }
    }
    return abhaengigkeiten;
  }

  /** Umbau (#1041): je Schritt die Vorschau; Übernahmen gelten danach wie neue Typen (mit der Id des alten). */
  protected async planeUmbauLage(l: PlanLauf, typIdJetzt: TypIdVon, vorgaben: VorgabenPlaene['vorgaben']): Promise<UmbauLage> {
    const { paket, m, ich, installierte, typen, herausgeber } = l;
    const umbauProbleme: Array<{ code: string; text: string }> = [];
    const umbau = await planeUmbau(
      this.d,
      {
        paket: { id: m.id, name: m.name, version: m.version, typen: paket.typen, umbau: paket.umbau ?? [] },
        ich,
        installierte,
        typen,
        herausgeber,
        herausgeberVon: (p) => this.herausgeberVon(p),
        paketFelder: (s) =>
          paketFelderAus(
            paket.typen.find((x) => x.schluessel === s),
            m.id,
          ),
        zielTitel: (nach, feld) => this.zielTitel({ paket, nach, feld, typen, installierte, typId: typIdJetzt, vorgaben }),
      },
      umbauProbleme,
    );
    for (const x of umbauProbleme) problem(l, x.code, x.text);
    // Sicherheit: Jeder Umbau braucht seine eigene Vorschau und Bestätigung – nie „alle auf einmal“ im Ablauf.
    if (l.ablauf && umbau.schritte.length) problem(l, 'umbau-einzeln', t('meldungen.pakete.umbau.einzeln', { name: m.name }));
    return umbau;
  }

  /** Plan eines Mappentyps: vorhanden (Update), gelöscht, übernommen (Umbau) oder neu (mit Namenskonflikt). */
  protected async typPlan(
    l: PlanLauf,
    paketTyp: PaketTyp,
    x: { ueb: Uebernahme; umbau: UmbauLage; belegt: Set<string>; beruflich: boolean },
  ): Promise<TypPlan> {
    const { m, ich, typen } = l;
    // Kennung im DMS (#1084): Paket und Schlüssel getrennt, nach außen `paket:schluessel` – eindeutig auch bei „_“ in beiden.
    const dmsSchluessel = typKennung(m.id, paketTyp.schluessel);
    const vorhandenId = ich?.typen[paketTyp.schluessel] ?? x.ueb?.typen[paketTyp.schluessel];
    const vorhanden = vorhandenId ? typen.find((y) => y.id === vorhandenId) : undefined;
    if (vorhanden) return this.vorhandenerTypPlan(l, paketTyp, vorhanden, dmsSchluessel);
    if (vorhandenId)
      return {
        schluessel: paketTyp.schluessel,
        dmsSchluessel,
        name: paketTyp.name,
        felder: paketTyp.felder.length,
        vorhanden: false,
        neueFelder: [],
        neueRegister: [],
        konflikt: null,
        vorschlag: null,
        geloescht: true,
      };
    // Übernahme (#1041): Der alte Typ wird zu diesem – sein eigener Name zählt nicht als belegt.
    const ueberPlan = uebernahmePlan(paketTyp, x.umbau, { m, namen: l.namen, typen, geplant: l.geplant, belegt: x.belegt });
    if (ueberPlan) return ueberPlan;
    return neuerTypPlan(l, paketTyp, dmsSchluessel, x.belegt, x.beruflich);
  }

  /** Vorhandener Typ (Update): was neu dazukommt, und Angaben im alten Textfeld, die ein Verweis übernimmt (#534). */
  private async vorhandenerTypPlan(l: PlanLauf, paketTyp: PaketTyp, vorhanden: Mappentyp, dmsSchluessel: string): Promise<TypPlan> {
    return {
      schluessel: paketTyp.schluessel,
      dmsSchluessel,
      name: vorhanden.name,
      felder: paketTyp.felder.length,
      vorhanden: true,
      neueFelder: paketTyp.felder.filter((f) => !vorhanden.felder.some((g) => g.key === f.key)).map((f) => f.label),
      neueRegister: paketTyp.register.filter((r) => !vorhanden.register.some((g) => g.key === r.key)).map((r) => r.name),
      erkennung: erkennungNeu(paketTyp, vorhanden).map((f) => f.label),
      wiederfinden: wiederfindenNeu(paketTyp, vorhanden).map((f) => f.label),
      vorbelegen: vorbelegenNeu(paketTyp, vorhanden).map((f) => f.label),
      typAngaben: Object.keys(typAngabenNeu(paketTyp, vorhanden)).length > 0,
      umwandeln: await this.umwandelbar(l, paketTyp),
      formate: formatNeu(paketTyp, vorhanden).map((f) => f.label),
      beschriftungen: beschriftungenNeu(paketTyp, vorhanden).anzahl,
      abschnitte: abschnitteNeu(paketTyp, vorhanden, (r) => [...(r.felder ?? []), ...neueFelderAuf(paketTyp, vorhanden, r)]).map(
        (r) => r.name,
      ),
      konflikt: null,
      vorschlag: null,
    };
  }

  /** Text → Verweis (#534): Angaben im alten Textfeld, deren Verweis noch leer ist. */
  private async umwandelbar(l: PlanLauf, t: PaketTyp) {
    const typ = l.typen.find((x) => x.id === l.ich?.typen[t.schluessel]);
    const erg: Array<{ feld: string; aus: string; anzahl: number }> = [];
    for (const f of t.felder) {
      const alt = f.ausText ? typ?.felder.find((x) => x.key === f.ausText && (x.typ === 'text' || x.typ === 'langtext')) : undefined;
      if (!typ || !alt) continue;
      const anzahl = (await this.d.mappen.listeMappen(typ.id)).filter((m) => !istLeer(m.werte[alt.key]) && istLeer(m.werte[f.key])).length;
      erg.push({ feld: typ.felder.find((x) => x.key === f.key)?.label ?? f.label, aus: alt.label, anzahl });
    }
    return erg;
  }

  /** Aktionen im Menü „Mappe“ (#1039): jede mit ihren Rechten; neu = beim Update dazugekommen oder mit anderen Rechten. */
  protected aktionenPlan(l: PlanLauf): Aktionsplan {
    const { paket, ich, installierte, typen } = l;
    return (paket.mappenaktionen ?? []).map((a) => {
      const alt = ich?.mappenaktionen?.find((x) => x.schluessel === a.schluessel);
      return {
        schluessel: a.schluessel,
        name: a.name,
        rechte: a.rechte,
        typen: a.mappentypen.map((vw) => this.typName(vw, paket, installierte, typen)),
        ...(a.dialog ? { dialog: a.dialog } : {}),
        neu:
          !alt ||
          JSON.stringify([...alt.rechte].sort()) !== JSON.stringify([...a.rechte].sort()) ||
          JSON.stringify(alt.anlegen ?? []) !== JSON.stringify(a.anlegen ?? []),
      };
    });
  }

  /** Update (#1174): selbst geänderte mitgelieferte Automatisierungen bleiben – die Vorschau nennt sie mit der neuen Fassung. */
  protected async geaenderteAutomatisierungen(l: PlanLauf): Promise<Record<string, { id: string; aenderungen: string[] }>> {
    const { ich, paket } = l;
    return ich && paket.automatisierungen.length
      ? ((await this.d.paketAutomatisierungenVergleich?.(ich, paket.automatisierungen).catch((e: Error) => {
          log.warn('Vergleich der Automatisierungen fehlgeschlagen', { paket: l.m.id, fehler: e.message });
          return {};
        })) ?? {})
      : {};
  }

  /** Die Vorschau aus den Plänen der Schritte – Felder in der Reihenfolge wie vorher. */
  protected async baueVorschau(
    l: PlanLauf,
    x: {
      herkunft: { herausgeberErstmals: string | null; geprueft: boolean };
      abhaengigkeiten: AbhaengigkeitPlan[];
      typen: TypPlan[];
      sichten: SichtPlan[];
      vorgaben: VorgabenPlaene;
      umbau: UmbauLage;
      namenskonflikte: string[];
    },
  ): Promise<Vorschau> {
    const { paket, ich, typen } = l;
    const aktionen = this.aktionenPlan(l);
    const geaenderteAutos = await this.geaenderteAutomatisierungen(l);
    return {
      ...vorschauKopf(l, x.herkunft),
      abhaengigkeiten: x.abhaengigkeiten,
      typen: x.typen,
      sichten: x.sichten,
      beispiele: paket.beispiele.length,
      beispielDokumente: beispielDokumenteVon(paket),
      vorgaben: x.vorgaben.vorgaben,
      ergaenzungen: x.vorgaben.ergaenzungen,
      umbau: x.umbau.schritte.map((g) => g.plan),
      probleme: l.probleme,
      fehlercodes: l.fehlercodes,
      namenskonflikte: x.namenskonflikte,
      hinweise: l.hinweise,
      ...(paket.ablaufvorlagen?.length ? { ablaufvorlagen: await this.vorlagenPlan(paket, typen) } : {}),
      automatisierungen: automatisierungenPlan(l, geaenderteAutos),
      einstellungen:
        paket.einstellungen || ich?.einstellungen ? einstellungsAenderung(ich?.einstellungen ?? null, paket.einstellungen) : null,
      // Berechnete Felder (#1034) stehen in der Rechte-Vorschau: „berechnet Felder …“ und wer die Werte sieht.
      // Mitgelieferte Zeitpläne (#1082): „Läuft nach Zeitplan: Verträge täglich prüfen (täglich um 05:00)“.
      laeufer: this.laeuferPlan(l, aktionen),
      ...(aktionen.length ? { aktionen } : {}),
      sprache: sprachePlan(l),
    };
  }

  /** Rechte des Paket-Läufers und ob sie (neu) zu bestätigen sind. */
  private laeuferPlan(l: PlanLauf, aktionen: Aktionsplan): Vorschau['laeufer'] {
    const { paket, ich, installierte, typen } = l;
    return paket.code
      ? {
          rechte: rechtePunkte(
            paket.code.info,
            (vw) => this.typName(vw, paket, installierte, typen),
            paket.typen.map((x) => ({ typ: x.name, felder: x.felder.filter((f) => f.berechnet === true).map((f) => f.label) })),
            paketZeitplaene(paket),
          ),
          bestaetigen: !ich || !gleicheRechte(ich.laeufer, paket.code.info) || aktionen.some((a) => a.neu && !a.dialog),
        }
      : null;
  }
}

/** Neuer Typ: Name (umbenannt), Konflikt mit Vorschlag, Archivmodus (#1051, nur für neue Typen). */
function neuerTypPlan(l: PlanLauf, paketTyp: PaketTyp, dmsSchluessel: string, belegt: Set<string>, beruflich: boolean): TypPlan {
  if (l.typen.some((x) => x.schluessel === dmsSchluessel)) l.probleme.push(t('meldungen.pakete.die-kennung-hat-schon', { dmsSchluessel }));
  const name = (l.namen[paketTyp.schluessel] ?? paketTyp.name).trim();
  const konflikt = belegt.has(name.toLowerCase()) ? t('meldungen.pakete.einen-mappentyp-gibt-es', { name }) : null;
  const vorschlag = konflikt ? freierName(name, l.m.name, belegt) : null;
  belegt.add(name.toLowerCase());
  // Archivmodus (#1051): nur für neue Typen; der Administrator ändert ihn danach am Mappentyp.
  const archiv = archivAusPaket(paketTyp.archiv, beruflich);
  return {
    schluessel: paketTyp.schluessel,
    dmsSchluessel,
    name,
    felder: paketTyp.felder.length,
    vorhanden: false,
    neueFelder: [],
    neueRegister: [],
    konflikt,
    vorschlag,
    ...(archiv
      ? {
          archiv: {
            ...archiv,
            stichtagName: archiv.stichtag ? (paketTyp.felder.find((f) => f.key === archiv.stichtag)?.label ?? archiv.stichtag) : null,
          },
        }
      : {}),
  };
}

/** Kopf der Vorschau: das Paket, Ablago-Version, Installation, Umzug, Herausgeber und Herkunft. */
function vorschauKopf(l: PlanLauf, h: { herausgeberErstmals: string | null; geprueft: boolean }) {
  const { m, v, ich, quelle, herausgeber } = l;
  return {
    paket: {
      id: m.id,
      name: m.name,
      version: m.version,
      beschreibung: m.beschreibung,
      lizenz: m.lizenz,
      autor: m.autor,
      dms: m.dms,
      abhaengigkeiten: m.abhaengigkeiten,
      readme: v?.readme ?? null,
      changelog: v?.changelog ?? null,
      quelle: v?.quelle ?? null,
      herausgeber,
      herausgeberGeprueft: h.geprueft,
    },
    dmsVersion: l.dmsVersion,
    dmsOk: l.dmsOk,
    installiert: ich?.version ?? null,
    update: !!ich,
    umzug: l.umzug,
    herausgeberBestaetigen: h.herausgeberErstmals,
    herausgeberSchluessel: quelle?.pruefung.art === 'anbieter' && herausgeber ? (quelle.pruefung.fingerabdruck ?? null) : null,
    herkunft: ich?.herkunft ?? null,
    pruefung: null,
  };
}

/** Mitgelieferte Automatisierungen: neu, eingeschaltet, Zeitplan (#1082) und selbst geändert (#1174). */
function automatisierungenPlan(
  l: PlanLauf,
  geaendert: Record<string, { id: string; aenderungen: string[] }>,
): Vorschau['automatisierungen'] {
  return l.paket.automatisierungen.map((a) => ({
    schluessel: a.schluessel,
    name: a.name,
    beschreibung: a.beschreibung,
    neu: !l.ich?.automatisierungen?.includes(a.schluessel),
    ...(a.eingeschaltet !== undefined ? { eingeschaltet: a.eingeschaltet } : {}),
    ...(paketZeitplan(a) ? { zeitplan: paketZeitplan(a)! } : {}),
    ...(geaendert[a.schluessel] ? { geaendert: geaendert[a.schluessel] } : {}),
  }));
}

/** Sprachpaket (#731): Angabe, Abdeckung, übergangene Texte und Pakete mit Beschriftungen. */
function sprachePlan(l: PlanLauf): Vorschau['sprache'] {
  const sp = l.paket.sprache;
  return sp
    ? {
        ...sp.angabe,
        abdeckung: abdeckung(DEUTSCH, sp.texte),
        uebergangen: sp.uebergangen.length,
        pakete: Object.keys(sp.beschriftungen),
      }
    : null;
}
