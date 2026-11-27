/**
 * Erkennung vorberechnen (#1567, „Erkennen und vorlegen“): Sobald der Volltext aller Dokumente einer Post da ist, rechnet
 * Ablago im Hintergrund „Wohin gehört das?“ und – für die drei wahrscheinlichsten Mappentypen – „Aus Dokument ausfüllen“
 * und den Abgleich. Das Ergebnis liegt an der Post (`erkennungen.ergebnis.vorberechnet`). Öffnet jemand die Post, liest die
 * Oberfläche es nur noch; die Wartezeit hängt damit nicht mehr an einem Paket oder der Größe eines KI-Modells.
 *
 * Gültig ist ein Ergebnis nur für dieselben Dokumente und solange sich nichts geändert hat, was die Rechnung bestimmt:
 * Mappentypen, installierte Pakete, Gelerntes und die Einstellungen der Erkennung (`schluessel`). Neue Stammdaten (z. B. eine
 * eben angelegte Organisation) zählen bewusst nicht – sonst wäre beim Abarbeiten eines Stapels jede Post veraltet.
 * Dafür gibt es „Erkennung neu starten“ (POST /api/mappen/:id/erkennung), das auch hier neu rechnet.
 *
 * Gerechnet wird ohne Person (volle Sicht). Deshalb bekommt das Ergebnis nur, wer ohnehin alles sieht: Verwaltung ohne
 * Lesefilter, kein Paket, kein Systemkonto. Alle anderen rechnen beim Öffnen wie bisher – kein Vorschlag nennt so eine
 * Mappe, die die Person nicht lesen darf.
 *
 * Bei „Was Ablago darf“ → „Nichts von sich aus“ rechnet Ablago nichts im Hintergrund.
 */
import { createHash } from 'node:crypto';
import { liesDarf, DARF_EINSTELLUNG } from '../../../shared/src/darf';
import { GELERNTES_EINSTELLUNG } from '../../../shared/src/gelerntes';
import type { Klassifizierung as Ergebnis } from '../../../shared/src/klassifizierung';
import type { MappenBezug } from '../../../shared/src/model';
import { ohneErkennung } from '../../../shared/src/anlagen';
import type { Einstellungen } from '../einstellungen/einstellungen';
import type { Zugriff } from '../kern';
import { protokoll } from '../protokoll/protokoll';
import type { Repo } from '../repo';
import type { TypVorschlaege } from './erkennung-hilfen';

const log = protokoll.modul('ablage');

/** Für so viele der wahrscheinlichsten Typen werden Felder und Abgleich mitgerechnet. */
const VORBERECHNET_TYPEN = 3;
/** Einstellungen, die das Ergebnis bestimmen (Schwelle, Weg für „Aus Dokument ausfüllen“). */
const EINSTELLUNGEN = ['erkennung_engine', 'erkennung_schwelle', GELERNTES_EINSTELLUNG];

type Klass = Ergebnis & { bezuege: Record<string, MappenBezug> };

/** Was an der Post liegt. */
export interface Vorberechnet {
  schluessel: string;
  dokumente: string[];
  zeit: string;
  ms: number;
  klass: Klass;
  je: Record<string, { vorschlaege: TypVorschlaege | null; abgleich: unknown }>;
}

/** Was die Vorberechnung von der Erkennung braucht. */
export interface Rechner {
  klassifiziere(eingabe: unknown, z?: Zugriff): Promise<Klass>;
  fuerTyp(typId: string, eingabe: unknown, z?: Zugriff): Promise<TypVorschlaege>;
  abgleichDokumente(eingabe: unknown, z?: Zugriff): Promise<unknown>;
}

const gleich = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const ids = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === 'string'))] : []);

/** Darf diese Person das ohne Person gerechnete Ergebnis bekommen? Nur, wer ohnehin alles sieht. */
export const volleSicht = (z?: Zugriff): boolean => !z || (z.admin && !z.lesen && !z.paket && !z.systemkonto);

export class Vorberechnung {
  constructor(
    private rechner: Rechner,
    private repo: () => Repo,
    private einst: () => Einstellungen | undefined,
  ) {}

  /** Laufende Rechnungen je Post – im Hintergrund, damit Texterkennung und Volltext nicht auf ein KI-Paket warten. */
  private laeuft = new Map<string, Promise<boolean>>();

  /** Im Hintergrund anstoßen (nach dem Volltext); läuft für diese Post schon eine, rechnet die danach noch einmal. */
  anstossen(postId: string): void {
    const vorher = this.laeuft.get(postId) ?? Promise.resolve(false);
    const p = vorher.then(() => this.rechne(postId));
    this.laeuft.set(postId, p);
    void p.finally(() => {
      if (this.laeuft.get(postId) === p) this.laeuft.delete(postId);
    });
  }

  /**
   * Codes eines Dokuments kamen erst nach der Vorberechnung (#1728): neu rechnen – ein Code kann den Mappentyp und die
   * Felder ändern. Ohne Vorberechnung an der Post nichts; die erste Rechnung sieht die Codes dann schon.
   */
  async nachCodes(postId: string): Promise<void> {
    const e = (
      await this.repo()
        .erkennungLies(postId)
        .catch(() => null)
    )?.ergebnis as { vorberechnet?: unknown } | undefined;
    if (e?.vorberechnet) this.anstossen(postId);
  }

  /** Wartet, bis alle angestoßenen Rechnungen fertig sind (Tests, Herunterfahren). */
  async fertig(): Promise<void> {
    while (this.laeuft.size) await Promise.allSettled([...this.laeuft.values()]);
  }

  /** Fingerabdruck von allem, was das Ergebnis bestimmt (außer den Mappen selbst). */
  async schluessel(): Promise<string> {
    const [typen, pakete, werte] = await Promise.all([
      this.repo().listeTypen(),
      this.repo().listePakete(),
      Promise.all(EINSTELLUNGEN.map(async (k) => (await this.einst()?.lies(k)) ?? null)),
    ]);
    const h = createHash('sha256');
    for (const t of [...typen].sort((a, b) => a.id.localeCompare(b.id))) h.update(`t:${t.id}:${t.geaendert}\n`);
    for (const p of [...pakete].sort((a, b) => a.id.localeCompare(b.id)))
      h.update(`p:${p.id}:${p.version}:${p.aktualisiert ?? ''}:${p.angehalten ? 1 : 0}\n`);
    h.update(JSON.stringify(werte));
    return h.digest('hex').slice(0, 32);
  }

  /** Rechnet Ablago von sich aus? Nicht bei „Nichts von sich aus“ (#1562, Frage 2). */
  async an(): Promise<boolean> {
    return (liesDarf(await this.einst()?.lies(DARF_EINSTELLUNG))?.selbst ?? 'vorschlag') !== 'nichts';
  }

  /** Hauptdokumente der Post mit Volltext; null, solange einem davon der Volltext fehlt. */
  private async dokumenteVon(postId: string): Promise<string[] | null> {
    const doks = (await this.repo().listeDokumente(postId)).filter((d) => !ohneErkennung(d));
    if (!doks.length) return null;
    for (const d of doks) if (!(await this.repo().volltext(d.id))?.trim()) return null;
    return doks.map((d) => d.id);
  }

  /**
   * Für eine Post rechnen und speichern (nach dem Volltext bzw. bei „Erkennung neu starten“). Leise: Ein Fehler kostet nur
   * die Vorberechnung, beim Öffnen rechnet Ablago dann wie bisher.
   */
  async rechne(postId: string, opt: { auchWennAus?: boolean } = {}): Promise<boolean> {
    try {
      if (!opt.auchWennAus && !(await this.an())) return false;
      const dokumente = await this.dokumenteVon(postId);
      if (!dokumente) return false;
      const start = Date.now();
      const schluessel = await this.schluessel();
      const klass = await this.rechner.klassifiziere({ dokumente });
      const je: Vorberechnet['je'] = {};
      for (const x of klass.typen.slice(0, VORBERECHNET_TYPEN)) {
        const [v, a] = await Promise.allSettled([
          this.rechner.fuerTyp(x.typId, { dokumente }),
          this.rechner.abgleichDokumente({ dokumente, typ: x.typId }),
        ]);
        je[x.typId] = { vorschlaege: v.status === 'fulfilled' ? v.value : null, abgleich: a.status === 'fulfilled' ? a.value : null };
      }
      const da = await this.repo().erkennungLies(postId);
      if (!da) return false;
      const ergebnis = da.ergebnis as Record<string, unknown> & { eindeutig?: string | null };
      const vorberechnet: Vorberechnet = { schluessel, dokumente, zeit: new Date().toISOString(), ms: Date.now() - start, klass, je };
      await this.repo().erkennungSchreibe(postId, { ...ergebnis, vorberechnet }, ergebnis.eindeutig ?? null);
      log.info('Erkennung vorberechnet', { post: postId, typen: Object.keys(je).length, ms: vorberechnet.ms });
      return true;
    } catch (x) {
      log.warn('Erkennung nicht vorberechnet', { post: postId, fehler: (x as Error).message.slice(0, 300) });
      return false;
    }
  }

  /** Gültiges Ergebnis für diese Dokumente, wenn die Person es bekommen darf; sonst null (dann wird live gerechnet). */
  private async gueltig(dokumente: string[], z?: Zugriff): Promise<Vorberechnet | null> {
    if (!dokumente.length || !volleSicht(z)) return null;
    const d = await this.repo().holeDokument(dokumente[0]);
    if (!d) return null;
    const v = ((await this.repo().erkennungLies(d.mappeId))?.ergebnis as { vorberechnet?: Vorberechnet } | undefined)?.vorberechnet;
    if (!v || !gleich(v.dokumente, dokumente)) return null;
    return v.schluessel === (await this.schluessel()) ? v : null;
  }

  /** „Wohin gehört das?“ aus der Vorberechnung. */
  async klass(eingabe: unknown, z?: Zugriff): Promise<Klass | null> {
    return (await this.gueltig(ids((eingabe as { dokumente?: unknown } | null)?.dokumente), z))?.klass ?? null;
  }

  /** „Aus Dokument ausfüllen“ für einen Typ aus der Vorberechnung – nur für Dokumente, ohne Text, Mappe oder Positionen. */
  async felder(typId: string, eingabe: unknown, z?: Zugriff): Promise<TypVorschlaege | null> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (e.text || e.mappe || e.positionen) return null;
    return (await this.gueltig(ids(e.dokumente), z))?.je[typId]?.vorschlaege ?? null;
  }

  /** Abgleich für einen Typ aus der Vorberechnung. */
  async abgleich(eingabe: unknown, z?: Zugriff): Promise<unknown> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (typeof e.typ !== 'string') return null;
    return (await this.gueltig(ids(e.dokumente), z))?.je[e.typ]?.abgleich ?? null;
  }
}
