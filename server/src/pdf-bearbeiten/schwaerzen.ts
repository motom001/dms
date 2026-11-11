/**
 * Schwärzen (#392, #459, #1077 aus dienst.ts): Wörter mit Lage, Seitenbilder für den Dialog (auch der Archivfassung,
 * #934), geschwärzte Fassung als Kopie oder neue Version. Schicht 3 – bekommt den Kern, das Verkleinern (Datei
 * ablegen), Mappen und Dokumente; den Volltext über den Anschluss.
 */
import type { DokumentArchivfassung, DokumenteDienst, DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { type Analyse as SchwaerzAnalyse, analysiere as schwaerzAnalyse, schwaerze, seitenbild as schwaerzSeitenbild } from '../schwaerzen';
import { t } from '../sprache';
import type { VolltextMeldung } from '../volltext';
import type { Dokument } from '../../../shared/src/model';
import { type Bereich, bereicheVon, findeBegriff, findeMuster, geschwaerztName, istMuster, kannSchwaerzen, MUSTER, pruefeBegriffe, pruefeBereiche, SCHWAERZEN_MAX_SEITEN, stellenText } from '../../../shared/src/schwaerzen';
import type { PdfVerkleinern } from './verkleinern';

/** Die Teile, die das Schwärzen ruft: Verkleinern (Datei ablegen), Historie, Dokumente, Versionen, Archivfassung. */
export interface SchwaerzenTeile { verkleinern: PdfVerkleinern; historie: MappenHistorie; dokumente: DokumenteDienst; versionen: DokumentVersionen; archiv: DokumentArchivfassung }

/** Was das Schwärzen außer dem Kern braucht – vom Dienst hereingereicht. */
export interface SchwaerzenAnschluss {
  /** „Volltext fertig“ (#459; volltext/, über den Anschluss). */
  volltextFertig(e: { dokument: string; mappe: string }, m?: VolltextMeldung, von?: string | null): Promise<void>;
}

export class Schwaerzen {
  constructor(private readonly kern: Kern, private readonly teile: SchwaerzenTeile, private readonly anschluss: SchwaerzenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get archiv() { return this.teile.archiv.archiv; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private danach(f: () => void) { this.kern.danach(f); }
  private liesGanz(sha256: string): Promise<Buffer> { return this.kern.liesGanz(sha256); }
  private legeDateiAb(inhalt: Buffer) { return this.teile.verkleinern.legeDateiAb(inhalt); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private ladeHoch(...a: Parameters<DokumenteDienst['ladeHoch']>) { return this.teile.dokumente.ladeHoch(...a); }
  private neueDateien(docs: Dokument[]) { this.teile.dokumente.neueDateien(docs); }
  private registerVon(d: Dokument) { return this.teile.versionen.registerVon(d); }
  private nachNeuerVersion(...a: Parameters<DokumentVersionen['nachNeuerVersion']>) { return this.teile.versionen.nachNeuerVersion(...a); }
  private volltextFertig(...a: Parameters<SchwaerzenAnschluss['volltextFertig']>) { return this.anschluss.volltextFertig(...a); }

  /** Wörter mit Lage je Prüfwert (aus der Textebene; der Dialog fragt Seite für Seite). */
  private readonly schwaerzAnalysen = new Map<string, Promise<SchwaerzAnalyse>>();

  private async schwaerzbar(id: string): Promise<{ d: Dokument; inhalt: Buffer }> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, t('meldungen.dienst.laesst-sich-nicht-schwaerzen', { name: d.name }));
    return { d, inhalt: await this.liesGanz(d.sha256) };
  }

  private schwaerzAnalyseVon(d: Dokument, inhalt: () => Promise<Buffer>): Promise<SchwaerzAnalyse> {
    let p = this.schwaerzAnalysen.get(d.sha256);
    if (!p) {
      p = (async () => schwaerzAnalyse(await inhalt(), d.mime))();
      this.schwaerzAnalysen.set(d.sha256, p);
      p.catch(() => this.schwaerzAnalysen.delete(d.sha256));
      while (this.schwaerzAnalysen.size > 20) this.schwaerzAnalysen.delete(this.schwaerzAnalysen.keys().next().value!);
    }
    return p;
  }

  /** Für den Dialog: Seiten mit Größe und Wörtern (für Suchbegriffe und Vorschläge), was mit dem Ergebnis geschieht. */
  async schwaerzenVorschau(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime)) throw new Fachfehler(422, t('meldungen.dienst.laesst-sich-nicht-schwaerzen', { name: d.name }));
    const a = await this.schwaerzAnalyseVon(d, () => this.liesGanz(d.sha256));
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, mime: d.mime, sha256: d.sha256, ...a, versioniert: !!reg?.versionierung, kopieName: geschwaerztName(d.name), muster: MUSTER };
  }

  /** Seitenbild für den Dialog (größer als die Seitenansicht; Bilder in derselben Ausrichtung wie beim Schwärzen). */
  private readonly schwaerzBilder = new Map<string, Promise<Buffer | null>>();

  async schwaerzSeitenbild(id: string, nr: number, gestempelt?: { pdf: Buffer } | null): Promise<Buffer | null> {
    if (gestempelt) return Number.isInteger(nr) && nr >= 1 && nr <= SCHWAERZEN_MAX_SEITEN ? schwaerzSeitenbild(gestempelt.pdf, 'application/pdf', nr) : null;
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!kannSchwaerzen(d.mime) || !Number.isInteger(nr) || nr < 1 || nr > SCHWAERZEN_MAX_SEITEN) return null;
    const k = `${d.sha256}:${nr}`;
    let p = this.schwaerzBilder.get(k);
    if (!p) {
      p = (async () => schwaerzSeitenbild(await this.liesGanz(d.sha256), d.mime, nr))();
      this.schwaerzBilder.set(k, p);
      p.catch(() => this.schwaerzBilder.delete(k));
      while (this.schwaerzBilder.size > 40) this.schwaerzBilder.delete(this.schwaerzBilder.keys().next().value!);
    }
    return p;
  }

  /**
   * Seitenbild der Archivfassung (#934, „Dokument übernehmen“ mit „Original | PDF/A“): wie `schwaerzSeitenbild`, aber
   * aus dem PDF/A. Steckt die Archivfassung im Original (schon PDF/A), ist es dessen Seite. null: keine Archivfassung.
   */
  async archivSeitenbild(id: string, nr: number): Promise<Buffer | null> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!Number.isInteger(nr) || nr < 1 || nr > SCHWAERZEN_MAX_SEITEN) return null;
    const info = await this.archiv?.info(d.sha256);
    if (!info) return null;
    if (info.imOriginal) return this.schwaerzSeitenbild(id, nr);
    const k = `${d.sha256}:archiv:${nr}`;
    let p = this.schwaerzBilder.get(k);
    if (!p) {
      p = (async () => { const f = await this.archiv!.lies(d.sha256); return f ? schwaerzSeitenbild(f.inhalt, 'application/pdf', nr) : null; })();
      this.schwaerzBilder.set(k, p);
      p.catch(() => this.schwaerzBilder.delete(k));
      while (this.schwaerzBilder.size > 40) this.schwaerzBilder.delete(this.schwaerzBilder.keys().next().value!);
    }
    return p;
  }

  /**
   * Schwärzen (#392): `bereiche` (Seite ab 1, x, y, b, h relativ), `begriffe` (überall schwärzen) und/oder
   * `muster` (alle Vorschläge dieser Arten) → neues Dokument „… (geschwärzt)“ im selben Register (`ziel`
   * „kopie“, Standard) oder neue Version (`ziel` „version“, nur mit Versionierung). Das Original bleibt.
   * Historie und Protokoll nennen nur Zahlen, nie die Suchbegriffe oder den geschwärzten Text.
   */
  async schwaerzeDokument(id: string, eingabe: unknown, von: string | null) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ziel = e.ziel === undefined || e.ziel === null || e.ziel === '' ? 'kopie' : e.ziel;
    if (ziel !== 'kopie' && ziel !== 'version') throw new Fachfehler(422, t('meldungen.dienst.ziel-kopie-oder-version'));
    const { d, inhalt } = await this.schwaerzbar(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    if (ziel === 'version' && !reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-5'));
    let begriffe: string[];
    try { begriffe = pruefeBegriffe(e.begriffe); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const roh = e.muster === undefined || e.muster === null ? [] : Array.isArray(e.muster) ? e.muster : [e.muster];
    if (roh.some((m) => !istMuster(m))) throw new Fachfehler(422, `muster: ${Object.keys(MUSTER).join(', ')}.`);
    const muster = [...new Set(roh)] as Array<keyof typeof MUSTER>;
    const a = await this.schwaerzAnalyseVon(d, async () => inhalt);
    let bereiche: Bereich[];
    try { bereiche = pruefeBereiche(e.bereiche, a.seiten.length); } catch (x) { throw new Fachfehler(422, (x as Error).message); }
    const gefunden = begriffe.map((b) => findeBegriff(a.seiten, b));
    bereiche = [...bereiche, ...bereicheVon(a.seiten, gefunden.flat()), ...(muster.length ? bereicheVon(a.seiten, findeMuster(a.seiten, muster)) : [])];
    if (!bereiche.length) {
      throw new Fachfehler(422, begriffe.length || muster.length
        ? t('meldungen.dienst.nichts-zu-schwaerzen', { wert: begriffe.length ? (t('meldungen.dienst.keiner-der-suchbegriffe-kommt', { anzahl: begriffe.length })) : t('meldungen.dienst.keines-der-muster-kommt'), wert2: a.quelle === 'keine' ? t('meldungen.dienst.das-dokument-hat-keinen') : '' })
        : t('meldungen.dienst.nichts-zu-schwaerzen-bitte'));
    }
    const r = await schwaerze(inhalt, d.mime, a, bereiche);
    // Volltext der geschwärzten Fassung (#459): Hat jede Seite eine Textebene, gilt der Text ohne die geschwärzten
    // Wörter gleich. Sonst (Scan, Foto, gemischt) läuft sie wie ein neues Dokument durch Textebene und Paket – das
    // Paket sieht nur die geschwärzte Fassung, nie das Original.
    const volltext = r.text !== null && !a.seiten.some((s) => !s.woerter.length) ? { text: r.text, seiten: r.seiten, info: t('meldungen.dienst.textebene-nach-dem-schwaerzen') } : null;
    const stellen = stellenText(bereiche);
    let neu: Dokument;
    if (ziel === 'version') {
      const sha256 = await this.legeDateiAb(r.inhalt);
      neu = await this.inTransaktion(async () => {
        const v = await this.repo.ersetzeDokument(d.id, {
          name: d.name, mime: r.mime, groesse: r.inhalt.length, sha256, anzeigbar: true, erstelltVon: von, herkunft: 'geschwaerzt',
          ...(volltext ? { volltext: volltext.text } : {}),
        });
        if (volltext) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...volltext });
        // Der Vektor (#442) stammt noch aus dem ungeschwärzten Text: weg damit; das Ereignis „Volltext fertig“
        // lässt Pakete (z. B. Ähnlichkeit) ihn aus dem geschwärzten Text neu berechnen.
        await this.repo.vektorLoesche(v.id);
        this.danach(() => this.neueDateien([v]));
        if (volltext) this.danach(() => void this.volltextFertig({ dokument: v.id, mappe: d.mappeId }, { quelle: 'kern', text: !!volltext.text.trim(), mime: r.mime, seiten: volltext.seiten ?? null }).catch(() => {}));
        const x = await this.nachNeuerVersion(d, { ...v, ocr: volltext ? { stand: 'fertig' } as Dokument['ocr'] : v.ocr }, typ, reg, von);
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: d.name, text: t('meldungen.dienst.geschwaerzte-fassung-als-version', { wert: x.version ?? '', name: d.name, stellen }), version: x.version, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    } else {
      neu = await this.inTransaktion(async () => {
        const x = (await this.ladeHoch(d.mappeId, { register: reg.key, name: geschwaerztName(d.name), typ: r.mime, herkunft: 'geschwaerzt', ...(volltext ? { volltext } : {}) }, r.inhalt, von)).dokument;
        await this.notiere(d.mappeId, von, 'geschwaerzt', { dokument: x.name, text: t('meldungen.dienst.geschwaerzte-fassung-von-erstellt', { name: x.name, name2: d.name, stellen }), quelle: d.name, stellen: r.bereiche, seiten: r.betroffen });
        return x;
      });
    }
    protokoll.modul('dokumente').info('Dokument geschwärzt', { id: d.id, neu: neu.id, ziel, stellen: r.bereiche, seiten: r.betroffen, begriffe: begriffe.length, muster });
    return {
      dokument: neu, ziel, stellen: r.bereiche, seiten: r.betroffen,
      begriffe: gefunden.map((f) => ({ gefunden: f.length })),
      meldung: ziel === 'version' ? t('meldungen.dienst.geschwaerzt-version-die', { stellen, wert: neu.version ?? '' }) : t('meldungen.dienst.angelegt-das-original-bleibt', { name: neu.name, stellen }),
    };
  }
}
