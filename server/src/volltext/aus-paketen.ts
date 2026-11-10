/**
 * Volltext aus Paketen (#614; #1076 aus dienst.ts): Bestand an ein neues Paket melden, wartende Dokumente nach dem
 * Entfernen zurücksetzen, Schreibrecht des Pakets prüfen, Antwort auf „Datei braucht Volltext“. Die Zuständigkeit
 * selbst rechnet `paketvolltext.ts` (Werkzeug). Schicht 3.
 */
import { INFO_VOLLTEXT_DURCH, INFO_VOLLTEXT_PAKET } from '../../../shared/src/paketvolltext';
import type { DokumentArchivfassung, DokumenteDienst } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { PaketVolltext } from '../paketvolltext';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import { VolltextDienst } from './volltext.dienst';

/** Die Teile, die der Volltext aus Paketen ruft: Dokumente (Texterkennung) und Archivfassung. */
export interface VolltextAusPaketenTeile { dokumente: DokumenteDienst; archiv: DokumentArchivfassung }

/** Was der Volltext aus Paketen außer dem Kern braucht – vom Dienst hereingereicht. */
export interface VolltextAusPaketenAnschluss {
  /** Volltext aus Paketen (#614, paketvolltext.ts). */
  paketVolltext(): PaketVolltext;
}

export class VolltextAusPaketen {
  constructor(private readonly kern: Kern, private readonly teile: VolltextAusPaketenTeile, private readonly anschluss: VolltextAusPaketenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.teile.dokumente.ocr; }
  private get paketVolltext() { return this.anschluss.paketVolltext(); }
  private archivNachVolltext(id: string, neu?: boolean) { return this.teile.archiv.archivNachVolltext(id, neu); }

  /* ---------- Volltext aus Paketen (#614) ---------- */

  /**
   * Ein Paket mit dms:volltext ist neu installiert (oder kann neue Dateitypen): Alle Dokumente dieser Typen ohne Text
   * gehen durch die Warteschlange des Volltexts – und damit an das Paket. Dokumente mit Text bleiben, wie sie sind
   * (z. B. Text einer früheren Version des Pakets).
   */
  async volltextPaketDa(typen: string[]): Promise<number> {
    if (!typen.length) return 0;
    // Dateitypen so, wie sie an den Dokumenten stehen (Groß- und Kleinschreibung wie vom Browser).
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    const docs = new Set((await this.repo.dokumenteMitTyp(vorhanden)).map((d) => d.id));
    if (!docs.size) return 0;
    const mtypen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.volltextKandidaten('ohne')).filter((d) => docs.has(d.id) && VolltextDienst.volltextAn(mtypen.get(d.typId), d.registerKey)).map((d) => d.id);
    if (!ids.length) return 0;
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
    protokoll.modul('texterkennung').info('Paket für Volltext installiert – vorhandene Dateien ohne Text gehen an das Paket', { typen, dokumente: ids.length });
    return ids.length;
  }

  /**
   * Ein Paket mit dms:volltext oder dms:umwandeln ist entfernt (Frage 49/51): Dokumente seiner Dateitypen, die noch
   * auf dieses Paket warteten, warten nicht mehr. Ohne Text gehen sie erneut durch die Warteschlange – dort steht dann
   * „kein Paket für diesen Dateityp“ (oder ein anderes zuständiges Paket übernimmt); mit Text von vorher bleibt der Text
   * stehen und der Stand wird *fertig*.
   */
  async paketWegFuerDateien(paket: { name: string }, typen: string[]): Promise<number> {
    if (!typen.length) return 0;
    const klein = new Set(typen.map((m) => m.toLowerCase()));
    const vorhanden = Object.keys(await this.repo.dokumentTypen()).filter((m) => klein.has(m.toLowerCase()));
    const marke = `(Paket ${paket.name})`;
    const wartend = (await this.repo.dokumenteMitTyp(vorhanden)).filter((d) => d.ocr?.stand === 'paket' && (d.ocr.info ?? '').includes(marke));
    if (!wartend.length) return 0;
    const ohne: string[] = [];
    for (const d of wartend) {
      const text = await this.repo.volltext(d.id);
      if (text && text.replace(/\s/g, '').length >= 20) await this.repo.ocrSetze(d.id, { stand: 'fertig', info: t('pakete.volltext.paket-entfernt', { paket: paket.name }), seiten: d.ocr?.seiten ?? null });
      else ohne.push(d.id);
    }
    if (ohne.length) { await this.repo.ocrEinreihen(ohne); this.ocr?.anstossen(); }
    protokoll.modul('texterkennung').info('Paket entfernt – wartende Dokumente zurückgesetzt', { paket: paket.name, dokumente: wartend.length, ohneText: ohne.length });
    return wartend.length;
  }

  /**
   * Darf dieses Dienstkonto den Volltext (bzw. die Sprache) des Dokuments schreiben (#614)? Mit „Dokumente schreiben“
   * immer (wie bisher, z. B. Paket Texterkennung); mit nur „lesen“ und dms:volltext nur für Dateitypen, für die das
   * Paket zuständig ist. Sonst 403.
   */
  async pruefeVolltextRecht(z: Zugriff, id: string): Promise<void> {
    if (!z.paket || z.paket.dokumente === 'schreiben') return;
    if (!z.paket.schnittstellen?.includes('dms:volltext')) throw new Fachfehler(403, t('meldungen.dienst.dieses-paket-darf-das'));
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (!(await this.paketVolltext.darfSchreiben(z.paket.id, d))) throw new Fachfehler(403, t('pakete.volltext.typ-fremd', { typ: d.mime }));
  }

  /**
   * Nach dem Ereignis „Datei braucht Volltext“ (#614): Hat das Paket keinen Volltext geschrieben (z. B. verschlüsselte
   * Datei), wartet das Dokument nicht länger – sein Grund steht daran. Vorhandener Text (etwa von vorher) bleibt; gibt
   * der Läufer auf: Fehler.
   */
  async nachVolltextEreignis(paket: string, e: { daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }) {
    const id = typeof e.daten.dokument === 'string' ? e.daten.dokument : '';
    if (!id || (!r.ok && !r.aufgegeben)) return;
    this.paketVolltext.erledigt(id);
    const d = await this.repo.holeDokument(id);
    if (!d || d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)) return;
    // Inzwischen eine neue Version: Für die gibt es ein eigenes Ereignis.
    if (typeof e.daten.sha256 === 'string' && e.daten.sha256 !== d.sha256) return;
    const p = (await this.repo.listePakete()).find((x) => x.id === paket);
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const text = await this.repo.volltext(d.id);
    const mitText = !!text && text.replace(/\s/g, '').length >= 20;
    const info = r.ok ? `${INFO_VOLLTEXT_DURCH} ${p?.name ?? paket}: ${grund || t('meldungen.dienst.kein-volltext-geliefert')}` : `${INFO_VOLLTEXT_DURCH} ${p?.name ?? paket} fehlgeschlagen${grund ? `: ${grund}` : ''}`;
    await this.repo.ocrSetze(d.id, { stand: !r.ok ? 'fehler' : mitText ? 'fertig' : 'ausgelassen', info: info.slice(0, 500), seiten: d.ocr.seiten ?? null });
    // Archivfassung (#631): mit Text; E-Mails (#946) auch ohne – ihr Volltext steht jetzt fest.
    if (r.ok) void this.archivNachVolltext(d.id, e.daten.neu === true);
  }
}
