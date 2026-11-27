/**
 * Codes auf Dokumenten (#1723): QR-Codes und Barcodes, die ein Paket mit `dms:codes` auf den Seiten liest – einmal je
 * Datei, im Hintergrund nach „Volltext fertig“, gemerkt am Dokument (Art, Inhalt, Seite). „Aus Dokument ausfüllen“
 * trägt den passenden Inhalt in Felder mit der Erkennungsart `code` ein (exakt gelesen, Sicherheit hoch) und liest bei
 * älteren Dokumenten nach, solange für ihre Datei noch nichts gemerkt ist. Ohne Paket geschieht nichts, ohne Meldung.
 *
 * Warum eine feste Schnittstelle: Pakete können Leistungen noch nicht anbieten (#1571/#1572). Die Antwort ist schon
 * jetzt genau die Ausgabe von `dokument.lesen.barcode@1` und wird mit deren Schema geprüft – kommt #1572, ruft Ablago
 * die Leistung statt `dms:codes`, und die Form bleibt.
 *
 * Inhalte der Codes stehen nie im Protokoll, nur ihre Anzahl: Die Such-ID eines Digitalen HU-Berichts ist ein
 * Zugangsschlüssel (dms-registry #278).
 */
import type { Repo } from '../repo';
import type { KiTypen } from '../mappentypen';
import { t } from '../sprache/sprache';
import { type EngineWahl, log } from './erkennung-hilfen';
import { leistung, pruefe } from '../../../shared/src/leistungen';
import { type GelesenerCode, istQrCode, passenderCode } from '../../../shared/src/codes';
import { ohneErkennung } from '../../../shared/src/anlagen';
import { type Feld, type Mappentyp } from '../../../shared/src/model';
import { fuellfelder, type Vorschlag } from '../../../shared/src/erkennung';
import type { KatalogEreignis } from '../../../shared/src/ereignisse';

/** Die Leistung, deren Ausgabe `dms:codes` liefert (Katalog, #1569). */
const BARCODE = leistung('dokument.lesen.barcode@1');
/** Zeitgrenze im Hintergrund: die der Leistung. */
const CODES_HINTERGRUND_MS = BARCODE.zeitgrenzeS * 1000;
/** Zeitgrenze beim Nachlesen während „Aus Dokument ausfüllen“: Die Person wartet. */
const CODES_NACHLESEN_MS = 30_000;

/** Wer Codes liest (#1723): der Paket-Läufer mit den geladenen Paketen mit dms:codes. */
export interface CodeAnbieter {
  pakete(): Array<{ id: string; name: string; netz: boolean }>;
  lies(paket: string, eingang: Record<string, unknown>, ms: number): Promise<{ text: string; ms: number }>;
}

/** Was das Lesen der Codes vom Dienst braucht. */
export interface CodesDienst {
  readonly ki: Pick<KiTypen, 'kiSperreFuer'>;
}

/** Ein gelesener Code mit dem Dokument, auf dem er steht. */
export type CodeImDokument = GelesenerCode & { dokument: string };

/**
 * Antwort eines Pakets auf `dms:codes` lesen: JSON `{ codes: [{ art, inhalt, seite? }] }` nach dem Schema der Leistung
 * (höchstens 200 Codes, Inhalt höchstens 4000 Zeichen). Ungültig: `grund` nennt nur die Stelle, nie Inhalte.
 */
export function liesCodeAntwort(text: string): { codes: GelesenerCode[] } | { grund: string } {
  let j: unknown;
  try {
    j = JSON.parse(text.trim());
  } catch {
    return { grund: 'kein JSON' };
  }
  const f = pruefe(BARCODE.ausgabe, j);
  if (f) return { grund: `${f.pfad}: ${f.grund}` };
  return { codes: (j as { codes: GelesenerCode[] }).codes };
}

/** Fundstelle eines Codes: „QR-Code auf Seite 1“, „Code auf Seite 2“ oder „Code auf dem Dokument“. */
function codeFundstelle(c: GelesenerCode): string {
  if (typeof c.seite !== 'number') return t('meldungen.erkennung.code-auf-dokument');
  return t(istQrCode(c.art) ? 'meldungen.erkennung.code-qr-auf-seite' : 'meldungen.erkennung.code-auf-seite', { seite: c.seite });
}

export class DokumentCodes {
  /** Wird gesetzt, sobald der Paket-Läufer läuft (laeufer/verwaltung.ts, im Verbund laeufer/fern.ts). */
  anbieter?: CodeAnbieter;
  /** Je Dokument höchstens ein Lesen zugleich (Hintergrund und Ausfüllen können sich treffen). */
  private laufend = new Map<string, Promise<GelesenerCode[] | null>>();

  constructor(
    private d: CodesDienst,
    private repo: () => Repo,
    private standard: () => Promise<EngineWahl>,
  ) {}

  /**
   * Abnehmer im Ereigniskatalog: Nach „Volltext fertig“ die Codes im Hintergrund lesen. Wartet nicht – ein langsames
   * Paket hält den Verteiler nicht auf; Fehler stehen im Protokoll und werden beim Ausfüllen nachgeholt.
   */
  async nachEreignis(e: KatalogEreignis): Promise<void> {
    const id = e.daten.dokument;
    if (e.art !== 'volltext.fertig' || typeof id !== 'string' || !this.anbieter?.pakete().length) return;
    void this.lies(id, CODES_HINTERGRUND_MS).catch((x) =>
      log.warn('Codes nicht gelesen', { dokument: id, fehler: (x as Error).message.slice(0, 200) }),
    );
  }

  /** Für Tests: warten, bis alles Lesen im Hintergrund fertig ist. */
  async fertig(): Promise<void> {
    await Promise.allSettled([...this.laufend.values()]);
  }

  /** Codes eines Dokuments: die gemerkten, sonst – mit Paket – jetzt gelesen. null = keine (kein Paket, kein Bild). */
  lies(id: string, ms: number): Promise<GelesenerCode[] | null> {
    const offen = this.laufend.get(id);
    if (offen) return offen;
    const p = this.liesNeu(id, ms).finally(() => this.laufend.delete(id));
    this.laufend.set(id, p);
    return p;
  }

  private async liesNeu(id: string, ms: number): Promise<GelesenerCode[] | null> {
    const dok = await this.repo().holeDokument(id);
    // Anlagen und Original-E-Mail (#998, #999) liest die Erkennung nie; nur Dateitypen der Leistung (PDF, Bilder).
    if (!dok || ohneErkennung(dok) || !BARCODE.dateitypen.includes(dok.mime)) return null;
    const gemerkt = await this.repo().liesCodes(id);
    if (gemerkt?.sha256 === dok.sha256) return gemerkt.codes;
    const p = await this.paketFuer(dok.mappeId);
    if (!p) return null;
    const seiten = dok.ocr?.seiten;
    const r = await this.anbieter!.lies(p.id, { datei: id, mime: dok.mime, ...(seiten ? { seiten } : {}) }, ms);
    const a = liesCodeAntwort(r.text);
    if ('grund' in a) {
      log.warn('Antwort auf dms:codes ungültig', { paket: p.id, dokument: id, grund: a.grund });
      return null;
    }
    await this.repo().merkeCodes(id, dok.sha256, a.codes);
    log.info('Codes gelesen', { paket: p.id, dokument: id, anzahl: a.codes.length });
    return a.codes;
  }

  /**
   * Das Paket, das lesen soll: das erste nach Id. Ein Paket mit Netz nur wie bei „Wohin gehört das?“ (#939, #796): Es ist
   * in der Werkbank als Erkennung gewählt, der Datenabfluss ist bestätigt, und der Mappentyp des Dokuments ist für
   * Dienste im Netz zugelassen.
   */
  private async paketFuer(mappeId: string): Promise<{ id: string; name: string } | null> {
    const pakete = [...(this.anbieter?.pakete() ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    for (const p of pakete) {
      if (!p.netz) return p;
      const w = await this.standard();
      const typ = (await this.repo().holeMappe(mappeId))?.typId;
      if (w.paket === p.id && w.abfluss && typ && !(await this.d.ki.kiSperreFuer(p.id))(typ)) return p;
    }
    return null;
  }

  /** Gelesene Codes mehrerer Dokumente, in ihrer Reihenfolge; liest nach, wo für die Datei noch nichts gemerkt ist. */
  async vonDokumenten(dokIds: string[]): Promise<CodeImDokument[]> {
    const alle: CodeImDokument[] = [];
    for (const id of dokIds) {
      const codes = await this.lies(id, CODES_NACHLESEN_MS).catch(() => null);
      for (const c of codes ?? []) alle.push({ ...c, dokument: id });
    }
    return alle;
  }

  /**
   * „Aus Dokument ausfüllen“ (#1723): Felder mit der Erkennungsart `code` bekommen den passenden Code als Vorschlag –
   * vor Text, Paket und Gelerntem, denn er ist exakt gelesen. Passt keiner, bleibt das Feld leer: Ein Wert aus dem Text
   * oder von einer KI wäre an dieser Stelle geraten. Bei mehreren Dokumenten gewinnt das erste mit passendem Code, darin
   * die frühere Seite. Ohne solche Felder wird nichts gelesen.
   */
  async trageEin(
    typ: Mappentyp,
    dokIds: string[],
    erlaubt: (f: Feld) => boolean,
    roh: Record<string, unknown>,
    hinweise: Map<string, string>,
  ): Promise<void> {
    const felder = fuellfelder(typ).filter((x) => x.art === 'code' && erlaubt(x.feld));
    if (!felder.length) return;
    const codes = dokIds.length ? await this.vonDokumenten(dokIds) : [];
    const jeDokument = dokIds.map((id) => codes.filter((x) => x.dokument === id));
    for (const { feld } of felder) {
      const c = jeDokument.map((liste) => passenderCode(feld.erkennung ?? {}, liste)).find(Boolean);
      hinweise.delete(feld.key);
      if (c) roh[feld.key] = { wert: c.inhalt, sicherheit: 'hoch', fundstelle: codeFundstelle(c) } satisfies Vorschlag;
      else delete roh[feld.key];
    }
  }
}
