/**
 * Leerseiten (#997): markieren (Paket mit `dms:leerseiten`), wählen („Doch behalten“ / „Auch weglassen“, Person) und
 * beim Übernehmen in eine Mappe weglassen. Schicht 3 – bekommt den Kern, die Rechteprüfung, die Historie und die
 * Versionen. Die Post (`ordneZu`, `loesePostAuf`) ruft `plane` vor und `lasseWeg` nach dem Verschieben.
 *
 * Regeln (Sicherheit): Ein Paket markiert nur – es löscht nichts und ändert weder Datei noch Mappe (kein „zuletzt
 * geändert“, keine Historie, kein Ereignis). Nur Dokumente in Post, die es lesen darf, nur für die Datei, die es geprüft
 * hat (`sha256`). Die Wahl je Seite trifft nur ein Mensch mit Bearbeiten an der Post; weggelassen wird nur beim
 * Übernehmen, das jemand auslöst – nie beim automatischen Zuordnen. Das Original bleibt immer als frühere Version.
 */
import { faelltWeg, leerseitenGelten, type Leerseiten, type LeerseitenWahl, neueErkennung, pruefeSeitenliste, waehle, wegfallendeSeiten, wirdGekuerzt } from '../../../shared/src/leerseiten';
import { type Dokument, istVersendet, type Mappe } from '../../../shared/src/model';
import type { DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import { seitenInfo, teile } from '../pdfseiten';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

const log = protokoll.modul('ablage');

/** Die Teile, die die Leerseiten rufen: Rechteprüfung, Historie, Versionen. */
export interface LeerseitenTeile { rechte: ZugriffDienst; historie: MappenHistorie; versionen: DokumentVersionen }

/** Was ein Dokument beim Übernehmen verliert (vor dem Verschieben gerechnet, danach angewendet). */
export interface LeerseitenPlan { inhalt: Buffer; weg: number[]; vorher: number }

/** Antwort von GET/PUT …/leerseiten: die Markierung und die Seiten, die beim Übernehmen wegfallen. */
export interface LeerseitenStand { dokument: string; sha256: string; seiten: number; leerseiten: Leerseiten | null; wegfallend: number[] }

/** Dateitypen, deren Seiten ein Paket markieren darf (PDF; Bilder haben genau eine Seite). */
const MIT_SEITEN = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export class PostLeerseiten {
  constructor(private readonly kern: Kern, private readonly teile: LeerseitenTeile) {}

  private get repo(): Repo { return this.kern.repo; }

  /** Dokument und Post holen; nur Dokumente in Post (Systemtyp „post“). */
  private async inPost(z: Zugriff | undefined, id: string, recht: 'R' | 'U'): Promise<{ d: Dokument; post: Mappe }> {
    const mappeId = await this.teile.rechte.mappeVon('dokument', id);
    const post = await this.teile.rechte.pruefeRecht(z, mappeId, recht);
    const typ = await this.repo.holeTyp(post.typId);
    if (typ?.system !== 'post') throw new Fachfehler(409, t('meldungen.leerseiten.nur-post'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!MIT_SEITEN.has(d.mime)) throw new Fachfehler(422, t('meldungen.leerseiten.nur-pdf', { name: d.name }));
    return { d, post };
  }

  /** Seitenzahl der Datei: PDF gezählt, Bilder haben eine. */
  private async seitenVon(d: Dokument): Promise<number> {
    if (d.mime !== 'application/pdf') return 1;
    return (await seitenInfo(await this.kern.liesGanz(d.sha256))).anzahl;
  }

  private stand(d: Dokument, seiten: number): LeerseitenStand {
    const l = leerseitenGelten(d) ? d.leerseiten : null;
    return { dokument: d.id, sha256: d.sha256, seiten, leerseiten: l, wegfallend: wegfallendeSeiten(l) };
  }

  /** Markierung lesen (GET …/leerseiten): wer die Post lesen darf. */
  async lies(z: Zugriff | undefined, id: string): Promise<LeerseitenStand> {
    const { d } = await this.inPost(z, id, 'R');
    return this.stand(d, leerseitenGelten(d) ? d.leerseiten.seiten : await this.seitenVon(d));
  }

  /**
   * Paket markiert (PUT …/leerseiten, nur `dms:leerseiten`): `seiten` ersetzt die erkannten Seiten, `sha256` nennt die
   * geprüfte Datei. Die Wahl der Person bleibt, solange es dieselbe Datei ist. Ändert die Mappe nicht.
   */
  async markiere(z: Zugriff | undefined, id: string, eingabe: unknown): Promise<LeerseitenStand> {
    if (!z?.paket?.id) throw new Fachfehler(403, t('meldungen.leerseiten.nur-pakete'));
    if (!z.paket.schnittstellen?.includes('dms:leerseiten')) throw new Fachfehler(403, t('meldungen.leerseiten.ohne-recht'));
    const { d } = await this.inPost(z, id, 'R');
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (e.sha256 !== d.sha256) throw new Fachfehler(409, t('meldungen.leerseiten.andere-datei', { name: d.name }));
    const seiten = await this.seitenVon(d);
    const p = pruefeSeitenliste(e.seiten, seiten);
    if ('fehler' in p) throw new Fachfehler(400, t.frei(`meldungen.leerseiten.liste.${p.fehler}`, { seiten }), { grund: p.fehler });
    const paket = (await this.repo.listePakete()).find((x) => x.id === z.paket!.id);
    const neu = neueErkennung(leerseitenGelten(d) ? d.leerseiten : null, { paket: z.paket.id, paketName: paket?.name ?? z.paket.id, sha256: d.sha256, seiten, erkannt: p.seiten }, new Date().toISOString());
    if (!(await this.repo.setzeLeerseiten(d.id, neu))) throw new Fachfehler(409, t('meldungen.leerseiten.andere-datei', { name: d.name }));
    log.debug('Leerseiten markiert', { paket: z.paket.id, dokument: d.id, seiten, leer: p.seiten.length });
    return this.stand({ ...d, leerseiten: neu }, seiten);
  }

  /**
   * Person wählt für eine Seite (PUT …/leerseiten/{nr}): `weglassen` true = fällt beim Übernehmen weg („Auch
   * weglassen“), false = bleibt („Doch behalten“). Nur Menschen mit Bearbeiten an der Post – Pakete markieren nur.
   */
  async waehleSeite(z: Zugriff | undefined, id: string, nr: number, eingabe: unknown): Promise<LeerseitenStand> {
    if (z?.paket) throw new Fachfehler(403, t('meldungen.leerseiten.wahl-nur-menschen'));
    const { d, post } = await this.inPost(z, id, 'U');
    if (istVersendet(post.werte)) throw new Fachfehler(422, t('meldungen.leerseiten.versendet'));
    const weglassen = (eingabe as { weglassen?: unknown } | null)?.weglassen;
    if (typeof weglassen !== 'boolean') throw new Fachfehler(400, t('meldungen.leerseiten.weglassen-ja-nein'));
    const jetzt = new Date().toISOString();
    const alt = await this.markierungOderLeer(d, jetzt);
    if (!Number.isInteger(nr) || nr < 1 || nr > alt.seiten) throw new Fachfehler(404, t('meldungen.dienst.seite-gibt-es-nicht', { nr }));
    const neu = waehle(alt, nr, weglassen, jetzt);
    if (faelltWeg(alt, nr) !== faelltWeg(neu, nr) || !leerseitenGelten(d)) {
      if (!(await this.repo.setzeLeerseiten(d.id, neu))) throw new Fachfehler(409, t('meldungen.leerseiten.andere-datei', { name: d.name }));
    }
    return this.stand({ ...d, leerseiten: neu }, neu.seiten);
  }

  /** Die geltende Markierung – oder eine leere für die Wahl ohne Paket (z. B. über die Schnittstelle). */
  private async markierungOderLeer(d: Dokument, jetzt: string): Promise<Leerseiten> {
    if (leerseitenGelten(d)) return d.leerseiten;
    return { paket: null, paketName: null, sha256: d.sha256, seiten: await this.seitenVon(d), erkannt: [], behalten: [], weglassen: [], geaendert: jetzt };
  }

  /**
   * Vor dem Übernehmen (#997): je Dokument mit wegfallenden Seiten das PDF ohne sie – außerhalb der Transaktion, weil
   * das Rechnen dauern kann. Ein Dokument fällt nie ganz weg; passt die Seitenzahl nicht (mehr), bleibt es, wie es ist.
   */
  async plane(doks: Dokument[], wahl: LeerseitenWahl = 'weglassen'): Promise<Map<string, LeerseitenPlan>> {
    const plaene = new Map<string, LeerseitenPlan>();
    if (wahl === 'behalten') return plaene;
    for (const d of doks) {
      if (!wirdGekuerzt(d)) continue;
      const inhalt = await this.kern.liesGanz(d.sha256);
      const { anzahl } = await seitenInfo(inhalt);
      const l = d.leerseiten!;
      if (anzahl !== l.seiten) { log.warn('Leerseiten nicht weggelassen: Seitenzahl passt nicht', { dokument: d.id, seiten: anzahl, markiert: l.seiten }); continue; }
      const weg = wegfallendeSeiten(l);
      const bleiben = Array.from({ length: anzahl }, (_, i) => i + 1).filter((n) => !weg.includes(n)).map((nr) => ({ nr }));
      const [neu] = await teile(inhalt, bleiben, [0]);
      plaene.set(d.id, { inhalt: neu, weg, vorher: anzahl });
    }
    return plaene;
  }

  /**
   * Nach dem Verschieben (bzw. Kopieren) in die Mappe: neue Fassung ohne die Seiten, das Original bleibt als frühere
   * Version (auch ohne Versionierung im Register). Texterkennung, Archivfassung und Erkennung laufen danach auf der
   * neuen Fassung (neuer Prüfwert, Volltext wird neu erstellt). Historie der Mappe: „3 leere Seiten entfernt“.
   */
  async lasseWeg(dokumentId: string, plan: LeerseitenPlan, von: string | null): Promise<Dokument> {
    const neu = await this.teile.versionen.neueFassung(dokumentId, { typ: 'application/pdf', herkunft: 'bearbeitet' }, plan.inhalt, von);
    const n = plan.weg.length;
    await this.teile.historie.notiere(neu.mappeId, von, 'pdf_bearbeitet', {
      dokument: neu.name, seiten: plan.vorher - n, vorher: plan.vorher, leerseiten: plan.weg, text: t('meldungen.leerseiten.entfernt', { anzahl: n }),
    });
    log.info('Leerseiten weggelassen', { dokument: dokumentId, seiten: plan.vorher, weg: n });
    return neu;
  }

  /** Übernommen, ohne dass etwas wegfiel (oder „Alle behalten“): Die Markierung gehört zur Post – weg damit. */
  async vergiss(dokumentId: string): Promise<void> {
    await this.repo.setzeLeerseiten(dokumentId, null);
  }
}

/** Anzahl der Seiten, die eine Reihe von Plänen weglässt (für die Rückmeldung an die Oberfläche). */
export const entfernteSeiten = (plaene: Map<string, LeerseitenPlan>): number => [...plaene.values()].reduce((s, p) => s + p.weg.length, 0);
