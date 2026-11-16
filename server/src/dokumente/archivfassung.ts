/**
 * Archivfassung (PDF/A, #631, #1075 aus dienst.ts): Paket anbinden, nach dem Volltext melden (#946), Bestand an ein
 * neues Paket melden (#660), Archivfassung und Wortpositionen, Stand je Dokument und für die Werkbank. Schicht 2.
 */
import { MAIL_TYPEN } from '../../../shared/src/archivfassung';
import type { Dokument } from '../../../shared/src/model';
import { vorgaben } from '../../../shared/src/paketeinstellungen';
import type { ArchivAblage, ArchivAnbindung, Archivfassung } from '../dateien/archivfassung';
import { Fachfehler } from '../grundlagen/fehler';
import type { Kern, Zugriff } from '../kern';
import { liesPdfA, textebeneWoerter } from '../pdf';
import { nichtEingebettet, pruefeSchriften } from '../dateien/ersatzschriften';
import { protokoll } from '../protokoll/protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache/sprache';
import type { DokumentUmwandlung } from './umwandeln';

/** Vorschaubilder aus der Archivfassung (#1216) – vorschau.ts, angebunden beim Start (start/dokumente.ts). */
export interface VorschauAusArchiv {
  ausArchiv(docs: Dokument[]): unknown;
  /** Vorhandene Bilder neu erzeugen (#1329); das alte bleibt, bis das neue da ist. */
  neuErzeugen(docs: Dokument[]): number;
  nachlaufArchiv(shas: Iterable<string>, dokumente: (sha: string) => Promise<Dokument[]>): Promise<number>;
  nachlaufStand(): Promise<{ offen: number; erledigt: number; ohne: number; seit: string; zeit: string } | null>;
}

/** Was die Archivfassung außer dem Kern braucht – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface ArchivfassungAnschluss {
  /** Ereignis an genau ein Paket (Ereignisse, noch im Dienst). */
  auftrag(paket: string, art: 'datei.archivfassung', daten: Record<string, unknown>): Promise<'gesperrt' | void>;
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Gespeicherte Einstellungen eines Pakets (Pakete, Schicht 3). */
  paketEinstellungen(paket: string): Promise<{ werte: Record<string, unknown> } | null>;
}

/**
 * Einmalige Reparatur nach dem Update (#1329): Bis dahin hatte das Image keine Schriften – PDFs mit nicht eingebetteten
 * Schriften bekamen Seiten-, Vorschaubilder und Archivfassung ohne Text. Stand in der Einstellung `SCHRIFT_NACHLAUF`
 * (bis zu welchem Prüfwert geprüft, wie viele neu, wann fertig), damit es nach einem Neustart weitergeht.
 */
const SCHRIFT_NACHLAUF = 'schrift_nachlauf';
/** Je Lauf höchstens so viele PDFs prüfen (`pdffonts`) … */
const SCHRIFT_STAPEL = 100;
/** … und höchstens so viele neu anstoßen – die Archivfassung rechnet jede Seite mit 300 dpi. */
export const SCHRIFT_NEU_JE_LAUF = 10;
/** Pause vor jedem geprüften PDF (Raspberry Pi). */
const SCHRIFT_PAUSE_MS = 500;
const SCHRIFT_LOG = protokoll.modul('archivfassung');
export interface SchriftNachlaufStand {
  bis: string;
  geprueft: number;
  neu: number;
  seit: string;
  fertig?: string;
}

export class DokumentArchivfassung {
  constructor(
    private readonly kern: Kern,
    private readonly fassungen: DokumentUmwandlung,
    private readonly anschluss: ArchivfassungAnschluss,
  ) {}

  private get repo(): Repo {
    return this.kern.repo;
  }
  private get umwandlung() {
    return this.fassungen.umwandlung;
  }
  private get paketKonten() {
    return this.kern.paketKonten;
  }
  private auftrag(...a: Parameters<ArchivfassungAnschluss['auftrag']>) {
    return this.anschluss.auftrag(...a);
  }
  private ereignis(...a: Parameters<Kern['ereignis']>) {
    return this.anschluss.ereignis(...a);
  }
  private paketEinstellungen(paket: string) {
    return this.anschluss.paketEinstellungen(paket);
  }
  private typVon(mappeId: string) {
    return this.kern.typVon(mappeId);
  }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) {
    return this.kern.historie.schreibe(...a);
  }

  /* ---------- Archivfassung (PDF/A, #631) ---------- */

  archiv?: Archivfassung;
  verbindeArchivfassung(a: Archivfassung) {
    this.archiv = a;
  }
  get archivfassung() {
    return this.archiv;
  }

  /** Vorschaubilder aus der Archivfassung (#1216): neue Archivfassung → Bild, Nachlauf für den Bestand, Stand. */
  private vorschau?: VorschauAusArchiv;
  verbindeVorschau(v: VorschauAusArchiv) {
    this.vorschau = v;
  }

  /** Nachlauf (Zeitplan, #1216): Dateien mit Archivfassung und ohne Vorschaubild nachholen. Liefert, wie viele offen sind. */
  async vorschauNachlauf(): Promise<number> {
    if (!this.archiv || !this.vorschau) return 0;
    return this.vorschau.nachlaufArchiv(await this.archiv.alle(), (sha) => this.repo.dokumenteMitSha(sha));
  }

  /**
   * Einmalige Reparatur nach dem Update (#1329, Zeitplan): PDFs, deren Schriften nicht eingebettet sind (`pdffonts`),
   * bekommen ihre Archivfassung (nur wo es eine eigene gibt) und ihr Vorschaubild neu – im Hintergrund, gedrosselt,
   * nach Prüfwert geordnet. Läuft nur, wenn poppler jetzt Ersatzschriften findet. Die Archivfassung ersetzt die
   * bisherige erst, wenn sie die Prüfung besteht (`setze`); die Historie nennt den Grund. Seitenbilder liegen nur im
   * Arbeitsspeicher und entstehen nach dem Neustart ohnehin neu. Liefert den Stand oder null (nichts zu tun).
   */
  async schriftNachlauf(o: { pruefe?: () => Promise<boolean | undefined>; pauseMs?: number } = {}): Promise<SchriftNachlaufStand | null> {
    const e = this.kern.einstellungen;
    const alt = e ? ((await e.lies(SCHRIFT_NACHLAUF)) as SchriftNachlaufStand | null) : null;
    if (!e || alt?.fertig) return null;
    if ((await (o.pruefe ?? pruefeSchriften)().catch(() => undefined)) !== true) return null;
    const stand: SchriftNachlaufStand = alt ?? { bis: '', geprueft: 0, neu: 0, seit: new Date().toISOString() };
    if (!alt)
      SCHRIFT_LOG.info('Archivfassungen und Vorschaubilder von PDFs mit nicht eingebetteten Schriften werden einmalig neu erzeugt (#1329)');
    const jeSha = new Map<string, Dokument[]>();
    for (const d of await this.repo.dokumenteMitTyp(['application/pdf'])) {
      if (d.sha256 > stand.bis) jeSha.set(d.sha256, [...(jeSha.get(d.sha256) ?? []), d]);
    }
    const offen = [...jeSha.keys()].sort();
    const pause = o.pauseMs ?? SCHRIFT_PAUSE_MS;
    let neu = 0,
      n = 0;
    for (const sha of offen) {
      if (n >= SCHRIFT_STAPEL || neu >= SCHRIFT_NEU_JE_LAUF) break;
      n++;
      if (pause)
        await new Promise((ok) => {
          setTimeout(ok, pause);
        });
      stand.bis = sha;
      stand.geprueft++;
      if (await this.schriftNeu(sha, jeSha.get(sha)!)) {
        neu++;
        stand.neu++;
      }
    }
    if (n >= offen.length) {
      stand.fertig = new Date().toISOString();
      SCHRIFT_LOG.info('PDFs mit nicht eingebetteten Schriften: einmalige Neuerzeugung abgeschlossen (#1329)', {
        geprueft: stand.geprueft,
        neu: stand.neu,
      });
    }
    await e.schreibe(SCHRIFT_NACHLAUF, stand);
    return stand;
  }

  /** Eine Datei: Bettet sie Schriften nicht ein, Archivfassung (nur eine eigene) und Vorschaubild neu anstoßen. */
  private async schriftNeu(sha: string, docs: Dokument[]): Promise<boolean> {
    const fehlt = await this.kern.liesGanz(sha).then(
      (b) => nichtEingebettet(b),
      () => null,
    );
    if (!fehlt?.length) return false;
    const info = await this.archiv?.info(sha);
    const archiv =
      !!info &&
      !info.imOriginal &&
      (await this.archiv!.anfordern(docs[0], { neu: true, grund: t('pakete.archiv.grund.schriften') }).catch((x: Error) => {
        SCHRIFT_LOG.warn('Archivfassung nicht neu angefordert', { dokument: docs[0].id, fehler: x.message });
        return false;
      }));
    const bild = (this.vorschau?.neuErzeugen(docs) ?? 0) > 0;
    SCHRIFT_LOG.info('PDF mit nicht eingebetteten Schriften: neu erzeugt', {
      dokument: docs[0].id,
      schriften: fehlt.slice(0, 10),
      archivfassung: archiv,
      vorschaubild: bild,
    });
    return true;
  }

  /** Was Archivfassung vom Dienst braucht (#631) – für index.ts und Tests. */
  archivAnbindung(ablage: ArchivAblage): ArchivAnbindung {
    return {
      ablage,
      pakete: () => this.repo.listePakete(),
      einstellung: async (paket, k) => {
        const w = (await this.paketEinstellungen(paket))?.werte ?? {};
        if (k in w) return w[k];
        const p = (await this.repo.listePakete()).find((x) => x.id === paket);
        return p?.einstellungen ? vorgaben(p.einstellungen)[k] : undefined;
      },
      melde: (paket, daten) => this.auftrag(paket, 'datei.archivfassung', daten),
      dokumenteMitSha: (sha) => this.repo.dokumenteMitSha(sha),
      dokumenteMitTyp: (m) => this.repo.dokumenteMitTyp(m),
      lesefassung: async (sha) => (await this.umwandlung?.lies(sha)) ?? null,
      datei: (sha) => this.kern.liesGanz(sha),
      textebene: (pdf) => textebeneWoerter(pdf),
      liesPdfA: (pdf) => liesPdfA(pdf),
      notiere: async (d, paket, daten) => {
        const konto = [...this.paketKonten.entries()].find(([, p]) => p === paket)?.[0] ?? null;
        await this.notiere(d.mappeId, konto, 'archivfassung', daten);
        await this.ereignis(
          'archivfassung.erstellt',
          { dokument: d.id, mappe: d.mappeId, typ: await this.typVon(d.mappeId), paket },
          konto,
        );
      },
    };
  }

  /**
   * Der Volltext steht fest (#631): Dokument an das Paket für die Archivfassung melden – im Hintergrund. Ob es passt
   * (Volltext fertig bzw. bei E-Mails auch ausgelassen, #946), entscheidet `anfordern`.
   */
  async archivNachVolltext(id: string, neu?: boolean) {
    if (!this.archiv) return;
    try {
      const d = await this.repo.holeDokument(id);
      if (d) await this.archiv.anfordern(d, { neu });
    } catch (e) {
      protokoll.modul('archivfassung').warn('Dokument nicht zur Archivfassung gemeldet', { dokument: id, fehler: (e as Error).message });
    }
  }

  /** Paket für die Archivfassung installiert, neue Dateitypen oder eine Art nachträglich angekreuzt: Bestand melden (#631, #660). */
  async archivPaketDa(typen: string[]): Promise<number> {
    if (!this.archiv || !typen.length) return 0;
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    // E-Mails (#946) liegen oft als application/octet-stream mit Endung .eml/.msg da.
    if ([...klein].some((m) => MAIL_TYPEN.includes(m))) klein.add('application/octet-stream');
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    return this.archiv.bestand(vorhanden);
  }

  /** Archivfassung annehmen (PUT /dokumente/{id}/archivfassung?sha256=…); Lesen prüft die Route. */
  async setzeArchivfassung(z: Zugriff | undefined, id: string, sha: unknown, inhalt: unknown) {
    if (!this.archiv) throw new Fachfehler(404, t('pakete.archiv.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const archivfassung = await this.archiv.setze(z?.paket, d, sha, inhalt);
    // Vorschaubild aus der neuen Archivfassung (#1216), falls es noch keins gibt – auch nach einem früheren Fehlversuch.
    if (this.vorschau) {
      const alle = await this.repo.dokumenteMitSha(d.sha256).catch(() => [] as Dokument[]);
      this.vorschau.ausArchiv(alle.length ? alle : [d]);
    }
    return { dokument: d.id, archivfassung };
  }

  /** Die Archivfassung eines Dokuments zum Ansehen (nur die aktuelle – zur Datei des Dokuments); 404 ohne. */
  async archivfassungVon(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const f = await this.archiv?.lies(d.sha256);
    if (!f) throw new Fachfehler(404, t('pakete.archiv.keine'));
    return { d, ...f };
  }

  /** Wortpositionen eines Dokuments (#631, GET /dokumente/{id}/wortpositionen). */
  async wortpositionen(id: string, o: { fassung?: 'archiv' } = {}) {
    if (!this.archiv) throw new Fachfehler(404, t('pakete.archiv.aus'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return this.archiv.wortpositionen(d, o);
  }

  /** Werkbank → Texterkennung → Archivfassung (#631). */
  async archivStand() {
    if (!this.archiv) return null;
    // Nachlauf der Vorschaubilder (#1216): Fortschritt, solange einer läuft bzw. das Ergebnis des letzten.
    const vorschau = (await this.vorschau?.nachlaufStand().catch(() => null)) ?? null;
    return { ...(await this.archiv.uebersicht()), vorschau };
  }

  /** Stand der Archivfassung je Dokument (#631), nur wenn es eine gibt oder ein Paket dran ist. */
  async mitArchivStand(docs: Dokument[]): Promise<Dokument[]> {
    if (!this.archiv || !docs.length) return docs;
    return Promise.all(
      docs.map(async (d) => {
        const s = await this.archiv!.stand(d).catch(() => null);
        return s ? { ...d, archivfassung: s } : d;
      }),
    );
  }
}
