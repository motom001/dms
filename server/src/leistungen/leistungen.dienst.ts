/**
 * Vermittlung der Leistungen (#1569): Der Kern nimmt Aufträge an, prüft sie, wählt genau einen Anbieter und prüft,
 * was zurückkommt. Direkt (`abrufen`, wartet) oder im Hintergrund (`beauftragen`, danach `leistung.fertig` bzw.
 * `leistung.fehlgeschlagen`). Regeln:
 *
 * - Vor allem anderen: Leistung bekannt, Eingabe nach Schema, `kontext` klein genug, Ziel nötig und Schreibrecht der
 *   Person am Ziel, Dokumente der Eingabe lesbar, ein Anbieter da. Scheitert etwas davon, passiert nichts.
 * - Abgelegt wird immer mit den Rechten der Person (Recht am Ziel beim Ablegen noch einmal geprüft), nie mehr.
 * - Leistungen mit Wirkung nach außen dürfen Personen nur als Verwaltende beauftragen (bis #1571/#1564 mehr regeln).
 * - Eine Datei als Ergebnis geht nur in ein Ziel – herunterladen wäre ein Weg nach draußen (#723).
 * - Arbeit im Hintergrund: Aufträge in der Datenbank, genommen mit Sperre (`speicher.ts`); im Wartungsmodus nichts
 *   Neues; beim Start Laufendes wiederholen, außer mit Wirkung („unterbrochen“).
 *
 * Schicht 3 – Kern, Rechteprüfung; Ablegen und Recht am Ziel über den Anschluss.
 */
import { randomUUID } from 'node:crypto';
import {
  AUFBEWAHRUNG_VORGABE,
  LEISTUNGEN,
  KONTEXT_MAX,
  dokumentFelder,
  istAufbewahrung,
  istLeistung,
  leistung,
  pruefe,
  teileDesNamens,
  type Aufbewahrung,
  type Datei,
  type Leistung,
  type Leistungsanfrage,
  type Leistungsergebnis,
  type Leistungsname,
  type Ziel,
} from '../../../shared/src/leistungen';
import type { Dokument, Herkunft, Mappentyp } from '../../../shared/src/model';
import { Fachfehler } from '../grundlagen/fehler';
import type { Kern, Zugriff } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import { istUuid } from '../repo';
import { t } from '../sprache/sprache';
import type { ZugriffDienst } from '../zugriff';
import { Anbieterliste, type Anbieter, type Anbieterergebnis } from './anbieter';
import { Leistungsfehler, anzeigename, eingabeFehler, hatDatei, keinAnbieter, loeseDokumente, pruefeAusgabe } from './pruefen';
import { speicherAuftraege, type Auftragsspeicher, type Auftragszeile, type Fragender } from './speicher';

const log = protokoll.modul('auftraege');
/** So oft nimmt sich ein Prozess denselben Auftrag, bevor er aufgibt (z. B. weil Ablago dabei jedes Mal endet). */
const VERSUCHE_MAX = 3;
const EINSTELLUNG = 'leistungen';

/** Was die Vermittlung außer Kern und Rechten braucht – vom Dienst hereingereicht. */
export interface LeistungenAnschluss {
  ladeHoch(
    mappeId: string,
    e: { register: string; name: string; typ: string; herkunft: Herkunft },
    inhalt: Buffer,
    von: string | null,
  ): Promise<{ dokument: Dokument }>;
  darfAblegen(z: Zugriff, mappeId: string): Promise<boolean>;
}

/** Wer fragt; Personen und Pakete mit ihrem Zugriff (Ablago selbst ohne). */
export interface Wer {
  fragender: Fragender;
  z?: Zugriff;
}

/** Ein angenommener Auftrag: geprüft, mit Anbieter und aufgelöster Eingabe. */
interface Angenommen {
  name: Leistungsname;
  l: Leistung;
  anbieter: Anbieter;
  eingabe: Record<string, unknown>;
}

export interface LeistungenEinstellungen {
  aufbewahrungStunden: Aufbewahrung;
}

/** Register zum Ablegen: das gewünschte Dokumentenregister, sonst „dokumente“, sonst das erste. */
function zielRegister(typ: Mappentyp | undefined, wunsch: string | undefined): string {
  const dok = (typ?.register ?? []).filter((r) => r.art === 'dokumente');
  const r = (wunsch ? dok.find((x) => x.key === wunsch) : undefined) ?? dok.find((x) => x.key === 'dokumente') ?? dok[0];
  if (!r || (wunsch && r.key !== wunsch)) throw new Fachfehler(422, t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2'));
  return r.key;
}

const HERKUNFT: Partial<Record<Leistungsname, Herkunft>> = {
  'dokument.erstellen.aus-vorlage@1': 'vorlage',
  'dokument.bearbeiten.schwaerzen@1': 'geschwaerzt',
};

export class LeistungenDienst {
  readonly anbieter = new Anbieterliste();
  /** Im aktiven Wartungsmodus (#102) nimmt der Hintergrund nichts Neues; danach `anstossen()`. */
  pause: () => boolean = () => false;
  /** So viele Aufträge laufen in diesem Prozess gleichzeitig im Hintergrund. */
  parallel = 2;
  /** Zeitgrenze in ms (in Tests kürzer). */
  zeitgrenzeMs = (l: Leistung) => l.zeitgrenzeS * 1000;
  /** Abstand des regelmäßigen Nachsehens (verlorene Wecksignale, andere Prozesse, abgelaufene Fristen). */
  nachsehenMs = 10_000;
  private laufend = 0;
  private aus = false;
  private uhren: Array<() => void> = [];

  constructor(
    private readonly kern: Kern,
    private readonly rechte: ZugriffDienst,
    private readonly anschluss: LeistungenAnschluss,
    private speicher: Auftragsspeicher = speicherAuftraege(),
  ) {}

  /** Speicher in der Datenbank (vom Start); bis dahin im Arbeitsspeicher. */
  verbindeSpeicher(s: Auftragsspeicher) {
    this.speicher = s;
  }

  /* ---------- Einstellungen ---------- */

  async einstellungen(): Promise<LeistungenEinstellungen> {
    const e = (await this.kern.einstellungen?.lies(EINSTELLUNG)) as Partial<LeistungenEinstellungen> | null | undefined;
    return { aufbewahrungStunden: istAufbewahrung(e?.aufbewahrungStunden) ? e.aufbewahrungStunden : AUFBEWAHRUNG_VORGABE };
  }

  async speichereEinstellungen(roh: unknown): Promise<LeistungenEinstellungen> {
    const s = (roh as { aufbewahrungStunden?: unknown } | null)?.aufbewahrungStunden;
    if (!istAufbewahrung(s)) throw new Fachfehler(422, t('meldungen.leistungen.aufbewahrung'));
    if (!this.kern.einstellungen) throw new Fachfehler(503, t('meldungen.leistungen.aufbewahrung'));
    await this.kern.einstellungen.schreibe(EINSTELLUNG, { aufbewahrungStunden: s });
    log.info('Aufbewahrung der Aufträge geändert', { stunden: s });
    return { aufbewahrungStunden: s };
  }

  /* ---------- Annehmen und prüfen ---------- */

  /** Datei eines Dokuments – mit Leserecht der Person (Ablago selbst ohne Prüfung). */
  private async datei(wer: Wer, id: string): Promise<Datei> {
    const weg = () => new Leistungsfehler('kein-leserecht', t('meldungen.leistungen.kein-leserecht'), { dokument: id });
    const d = istUuid(id) ? await this.kern.repo.holeDokument(id) : undefined;
    if (!d) throw weg();
    if (wer.fragender.art !== 'ablago') {
      if (!wer.z) throw weg();
      await this.rechte.pruefeRecht(wer.z, d.mappeId, 'R').catch(() => {
        throw weg();
      });
    }
    return { inhalt: await this.kern.liesGanz(d.sha256), mime: d.mime, name: d.name };
  }

  private async pruefeZiel(wer: Wer, l: Leistung, ziel: Ziel | undefined): Promise<void> {
    if (ziel === undefined) {
      if (l.formate.length && wer.fragender.art !== 'ablago')
        throw new Leistungsfehler('ziel-noetig', t('meldungen.leistungen.ziel-noetig'));
      return;
    }
    if (!ziel || typeof ziel !== 'object' || !istUuid(ziel.mappe) || (ziel.register !== undefined && typeof ziel.register !== 'string'))
      throw new Leistungsfehler('eingabe-ungueltig', t('meldungen.leistungen.ziel-ungueltig'), { pfad: 'ziel' });
    if (!l.formate.length) throw new Leistungsfehler('eingabe-ungueltig', t('meldungen.leistungen.ziel-ohne-datei'), { pfad: 'ziel' });
    if (wer.fragender.art === 'ablago') return;
    if (!wer.z || !(await this.anschluss.darfAblegen(wer.z, ziel.mappe)))
      throw new Leistungsfehler('kein-schreibrecht', t('meldungen.leistungen.kein-schreibrecht'), { mappe: ziel.mappe });
  }

  /**
   * Alles, was vor der Arbeit feststehen muss – in dieser Reihenfolge, ohne etwas zu ändern. `intern`: Ablago selbst
   * darf statt Dokument-Ids Dateien geben.
   */
  private async nimmAn(wer: Wer, name: string, a: Leistungsanfrage): Promise<Angenommen> {
    if (!istLeistung(name))
      throw new Leistungsfehler('unbekannt', t('meldungen.leistungen.unbekannt', { name: String(name).slice(0, 80) }));
    const l = leistung(name);
    const f = pruefe(l.eingabe, a?.eingabe, { dateien: wer.fragender.art === 'ablago' });
    if (f) throw eingabeFehler(name, f);
    if (a.kontext !== undefined && (JSON.stringify(a.kontext)?.length ?? 0) > KONTEXT_MAX)
      throw new Leistungsfehler('eingabe-ungueltig', t('meldungen.leistungen.kontext', { max: KONTEXT_MAX }), { pfad: 'kontext' });
    if (l.ergebnis === 'wirkung' && wer.fragender.art === 'person' && !wer.z?.admin)
      throw new Leistungsfehler('nur-verwaltung', t('meldungen.leistungen.nur-verwaltung'));
    await this.pruefeZiel(wer, l, a.ziel);
    const eingabe = (await loeseDokumente(l.eingabe, a.eingabe, (id) => this.datei(wer, id))) as Record<string, unknown>;
    const mimes = dateienIn(l, eingabe).map((d) => d.mime);
    const wahl = this.anbieter.waehle(name, mimes);
    if ('grund' in wahl) throw keinAnbieter(name, wahl.grund, mimes.find(Boolean));
    return { name, l, anbieter: wahl.anbieter, eingabe };
  }

  /* ---------- Arbeiten ---------- */

  /** Beim Anbieter ausführen, mit Zeitgrenze; was er wirft, wird ein `anbieter-fehler`. */
  private async beimAnbieter(x: Angenommen): Promise<Anbieterergebnis> {
    const ab = new AbortController();
    const ms = this.zeitgrenzeMs(x.l);
    let uhr: NodeJS.Timeout | undefined;
    const grenze = new Promise<never>((_, nein) => {
      uhr = setTimeout(() => {
        ab.abort();
        nein(new Leistungsfehler('zeitgrenze', t('meldungen.leistungen.zeitgrenze', { s: Math.ceil(ms / 1000) })));
      }, ms);
    });
    try {
      return await Promise.race([x.anbieter.fuehreAus({ leistung: x.name, eingabe: x.eingabe, signal: ab.signal }), grenze]);
    } catch (e) {
      if (e instanceof Leistungsfehler) throw e;
      throw new Leistungsfehler(
        'anbieter-fehler',
        t('meldungen.leistungen.anbieter-fehler', { anbieter: x.anbieter.id, meldung: (e as Error).message }),
        {
          anbieter: x.anbieter.id,
        },
      );
    } finally {
      clearTimeout(uhr);
    }
  }

  /** Erbringen: ausführen, Ausgabe prüfen, ins Ziel ablegen (mit dem Recht der Person, noch einmal geprüft). */
  private async erbringe(wer: Wer, x: Angenommen, ziel: Ziel | undefined): Promise<{ r: Anbieterergebnis; dokument?: string }> {
    const r = await this.beimAnbieter(x);
    pruefeAusgabe(x.l, x.anbieter.id, r);
    if (!ziel || !r.datei) return { r };
    await this.pruefeZiel(wer, x.l, ziel);
    const m = await this.kern.repo.holeMappe(ziel.mappe);
    if (!m) throw new Leistungsfehler('kein-schreibrecht', t('meldungen.leistungen.kein-schreibrecht'), { mappe: ziel.mappe });
    const register = zielRegister(await this.kern.repo.holeTyp(m.typId), ziel.register);
    const e = { register, name: r.datei.name || 'Ergebnis.pdf', typ: r.datei.mime, herkunft: HERKUNFT[x.name] ?? 'bearbeitet' };
    const { dokument } = await this.anschluss.ladeHoch(ziel.mappe, e, Buffer.from(r.datei.inhalt), wer.fragender.ich?.id ?? null);
    return { r: { daten: r.daten }, dokument: dokument.id };
  }

  /**
   * Direkt: prüfen, ausführen, Ergebnis zurück (Ablago selbst bekommt die Datei, Personen und Pakete nur mit Ziel als
   * Dokument). Wird der Auftrag nicht angenommen, entsteht nichts; danach steht er mit Zustand in der Liste.
   */
  async abrufen(wer: Wer, name: string, a: Leistungsanfrage): Promise<Leistungsergebnis & { datei?: Datei }> {
    const x = await this.nimmAn(wer, name, a);
    const id = randomUUID();
    const kopf = { id, leistung: x.name, art: 'direkt' as const, kontext: a.kontext, ziel: a.ziel ?? null, wer: wer.fragender };
    await this.speicher.lege({
      ...kopf,
      zustand: 'laeuft',
      eingabe: null,
      wirkung: x.l.ergebnis === 'wirkung',
      zeitgrenzeS: x.l.zeitgrenzeS,
      anbieter: x.anbieter.id,
    });
    try {
      const { r, dokument } = await this.erbringe(wer, x, a.ziel);
      await this.speicher.setze(id, { zustand: 'fertig', daten: r.daten, dokument: dokument ?? null });
      const datei = wer.fragender.art === 'ablago' ? r.datei : undefined;
      return {
        auftrag: id,
        leistung: x.name,
        zustand: 'fertig',
        anbieter: x.anbieter.id,
        daten: r.daten,
        kontext: a.kontext,
        ...(dokument ? { dokument } : {}),
        ...(datei ? { datei } : {}),
      };
    } catch (e) {
      await this.scheitert(id, e, x.anbieter.id);
      throw e;
    }
  }

  /** Im Hintergrund: prüfen wie direkt, dann in die Warteschlange; das Ergebnis kommt als Ereignis. */
  async beauftragen(wer: Wer, name: string, a: Leistungsanfrage): Promise<Leistungsergebnis> {
    if (hatDatei(a?.eingabe)) throw new Leistungsfehler('eingabe-ungueltig', t('meldungen.leistungen.nur-dokumente'), { pfad: 'eingabe' });
    const x = await this.nimmAn(wer, name, a);
    const id = randomUUID();
    await this.speicher.lege({
      id,
      leistung: x.name,
      art: 'hintergrund',
      zustand: 'wartet',
      eingabe: a.eingabe,
      kontext: a.kontext,
      ziel: a.ziel ?? null,
      wer: wer.fragender,
      wirkung: x.l.ergebnis === 'wirkung',
      zeitgrenzeS: x.l.zeitgrenzeS,
    });
    log.info('Auftrag angenommen', { auftrag: id, leistung: x.name });
    this.anstossen();
    return { auftrag: id, leistung: x.name, zustand: 'wartet', anbieter: null, kontext: a.kontext };
  }

  /** Stand eines Auftrags – für die Person, die ihn gegeben hat, und für Verwaltende. */
  async auftrag(wer: Wer, id: string): Promise<Leistungsergebnis> {
    const z = istUuid(id) ? await this.speicher.hole(id) : undefined;
    const eigen = !!z && !!wer.fragender.ich && z.wer.ich?.id === wer.fragender.ich.id;
    if (!z || !(eigen || wer.z?.admin || wer.fragender.art === 'ablago'))
      throw new Fachfehler(404, t('meldungen.leistungen.auftrag-unbekannt'));
    return alsErgebnis(z);
  }

  private async scheitert(id: string, e: unknown, anbieter: string | null): Promise<Leistungsergebnis['fehler']> {
    const fehler =
      e instanceof Leistungsfehler ? { code: e.code, text: e.message } : { code: 'anbieter-fehler' as const, text: (e as Error).message };
    await this.speicher
      .setze(id, { zustand: 'fehlgeschlagen', fehler, anbieter })
      .catch((x) => log.warn('Auftrag nicht als fehlgeschlagen gespeichert', { auftrag: id, fehler: (x as Error).message }));
    return fehler;
  }

  /* ---------- Hintergrund ---------- */

  /**
   * Beim Start: Laufendes zurückstellen (nur, wenn kein anderer Prozess an derselben Datenbank läuft, #744) – mit
   * Wirkung nach außen „unterbrochen“. Danach regelmäßig nachsehen und aufräumen.
   */
  async start(o: { zurueckstellen?: boolean } = {}) {
    this.aus = false;
    if (o.zurueckstellen !== false) {
      const n = await this.speicher.zurueckstellen();
      if (n.wiederholt || n.unterbrochen) log.info('Unterbrochene Aufträge nach dem Neustart', n);
    }
    this.anstossen();
    const uhr = (ms: number, f: () => void) => {
      const u = setInterval(f, ms);
      u.unref();
      this.uhren.push(() => clearInterval(u));
    };
    uhr(this.nachsehenMs, () => this.anstossen());
    uhr(10 * 60_000, () => void this.raeumeAuf());
  }

  stop() {
    this.aus = true;
    for (const f of this.uhren) f();
    this.uhren = [];
  }

  /** Abgeschlossene nach der Aufbewahrung löschen; gestorbene Läufe mit Wirkung als „unterbrochen“ melden. */
  async raeumeAuf(): Promise<void> {
    try {
      const { aufbewahrungStunden } = await this.einstellungen();
      await this.speicher.raeumeAuf(aufbewahrungStunden);
      const n = await this.speicher.fristUnterbrechen();
      if (n) log.warn('Aufträge mit Wirkung nach außen unterbrochen (Prozess beendet)', { anzahl: n });
    } catch (e) {
      log.warn('Aufträge nicht aufgeräumt', { fehler: (e as Error).message });
    }
  }

  anstossen() {
    if (this.aus) return;
    void this.pumpe().catch((e) => log.error('Aufträge gestört', { fehler: (e as Error).message }));
  }

  /** Läuft gerade etwas im Hintergrund dieses Prozesses? (Tests, Beenden) */
  get beschaeftigt() {
    return this.laufend > 0;
  }

  private async pumpe() {
    while (!this.aus && !this.pause() && this.laufend < this.parallel) {
      this.laufend++;
      const z = await this.speicher.naechster().catch((e) => {
        this.laufend--;
        throw e;
      });
      if (!z) {
        this.laufend--;
        return;
      }
      void this.bearbeite(z).finally(() => {
        this.laufend--;
        this.anstossen();
      });
    }
  }

  /** Einen Auftrag aus der Warteschlange: Rechte und Anbieter jetzt noch einmal, dann wie direkt; danach das Ereignis. */
  private async bearbeite(z: Auftragszeile) {
    let anbieter: string | null = null;
    try {
      if (z.versuche > VERSUCHE_MAX) throw new Leistungsfehler('abgebrochen', t('meldungen.leistungen.abgebrochen', { n: VERSUCHE_MAX }));
      const wer: Wer = { fragender: z.wer, z: z.wer.ich ? await this.rechte.zugriff(z.wer.ich) : undefined };
      const a = { eingabe: z.eingabe ?? {}, kontext: z.kontext, ...(z.ziel ? { ziel: z.ziel } : {}) };
      const x = await this.nimmAn(wer, z.leistung, a);
      anbieter = x.anbieter.id;
      const { r, dokument } = await this.erbringe(wer, x, a.ziel);
      await this.speicher.setze(z.id, { zustand: 'fertig', anbieter, daten: r.daten, dokument: dokument ?? null });
      await this.kern.ereignis('leistung.fertig', { auftrag: z.id, leistung: z.leistung, dokument: dokument ?? null }, z.wer.ich?.id);
      log.info('Auftrag erledigt', { auftrag: z.id, leistung: z.leistung, anbieter });
    } catch (e) {
      const f = await this.scheitert(z.id, e, anbieter);
      await this.kern.ereignis('leistung.fehlgeschlagen', { auftrag: z.id, leistung: z.leistung, fehler: f?.code ?? null }, z.wer.ich?.id);
      log.warn('Auftrag fehlgeschlagen', { auftrag: z.id, leistung: z.leistung, anbieter, fehler: f?.code });
    }
  }

  /** Der Katalog mit Anzeigenamen und wer was macht (für die Oberfläche und `GET /api/leistungen`). */
  katalog() {
    return LEISTUNGEN.map((name) => {
      const l = leistung(name);
      return {
        name,
        ...teileDesNamens(name),
        anzeigename: anzeigename(name),
        ergebnis: l.ergebnis,
        formate: l.formate,
        dateitypen: l.dateitypen,
        anbieter: this.anbieter.fuer(name).map((a) => ({ id: a.id, art: a.art, an: this.anbieter.an(a.id) })),
      };
    });
  }
}

/** Dateien in der aufgelösten Eingabe, in Reihenfolge der Dokumentfelder des Schemas. */
function dateienIn(l: Leistung, eingabe: Record<string, unknown>): Datei[] {
  const r: Datei[] = [];
  for (const pfad of dokumentFelder(l.eingabe)) {
    let werte: unknown[] = [eingabe];
    for (const teil of pfad.split('.')) {
      const liste = teil.endsWith('[]');
      const k = liste ? teil.slice(0, -2) : teil;
      werte = werte.flatMap((w) => {
        const v = w && typeof w === 'object' ? (w as Record<string, unknown>)[k] : undefined;
        return liste ? (Array.isArray(v) ? v : []) : v === undefined ? [] : [v];
      });
    }
    for (const w of werte) if (w && typeof w === 'object' && 'mime' in w) r.push(w as Datei);
  }
  return r;
}

function alsErgebnis(z: Auftragszeile): Leistungsergebnis {
  return {
    auftrag: z.id,
    leistung: z.leistung,
    zustand: z.zustand,
    anbieter: z.anbieter,
    ...(z.daten ? { daten: z.daten } : {}),
    ...(z.dokument ? { dokument: z.dokument } : {}),
    ...(z.kontext !== undefined && z.kontext !== null ? { kontext: z.kontext } : {}),
    ...(z.fehler ? { fehler: z.fehler } : {}),
  };
}
