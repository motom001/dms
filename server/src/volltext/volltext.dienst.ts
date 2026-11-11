/**
 * Volltext (#45, #336, #338, #400, #458, #579; #1076 aus dienst.ts): Ereignis „Volltext fertig“, nachholen und neu
 * erzeugen, Texterkennung als Paket, Antworten der Pakete, Volltext lesen und schreiben, Sprache. Schicht 3 – über
 * den Dokumenten; bekommt den Kern und die Teile der Dokumente, nicht den ganzen Dienst.
 */
import { pruefeWoerter } from '../../../shared/src/archivfassung';
import type { Auftrag, Fortschritt, PhasenPlan } from '../../../shared/src/auftrag';
import { infoFassung, kernTyp } from '../../../shared/src/dateiumwandlung';
import type { Mappentyp } from '../../../shared/src/model';
import { hatSchnittstelle, PAKET_TEXT, PAKET_VOLLTEXT } from '../../../shared/src/pakete';
import { INFO_VOLLTEXT_PAKET, infoVolltextPaket, VOLLTEXT_ZEICHEN_MAX } from '../../../shared/src/paketvolltext';
import { dokumentsprachen, MAX_SEITENSPRACHEN, type Seitensprache, seitentexte, SEITENVORSCHUB, seitenZusammensetzen, SPRACHEN_JE_SEITE, zeichenzahl } from '../../../shared/src/seitensprachen';
import { erkenneSprache, istTextsprache, SPRACHE_MARKE, spracheZuInfo, sprachname, TEXTSPRACHEN } from '../../../shared/src/textsprache';
import { INFO_TEXTEBENE, infoWartet, NICHT_GESPEICHERT } from '../../../shared/src/volltext';
import { istVerklemmung } from '../db';
import type { DokumentArchivfassung, DokumenteDienst, DokumentUmwandlung } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern } from '../kern';
import type { PaketVolltext } from '../paketvolltext';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { VolltextAusPaketen } from './aus-paketen';

/** Obergrenze für geschriebenen Volltext (Zeichen). */
export const VOLLTEXT_MAX = VOLLTEXT_ZEICHEN_MAX;

/** Ereignis „Volltext fertig“ (#458): wer den Volltext geliefert hat und ob es Text gibt. */
export interface VolltextMeldung {
  /** kern: Textebene bzw. eingebaute Texterkennung; paket: ein Paket; api: über die Schnittstelle; kopie: von einem anderen Dokument übernommen. */
  quelle: 'kern' | 'paket' | 'api' | 'kopie';
  /** Nennenswerter Text vorhanden? */
  text: boolean;
  mime?: string; seiten?: number | null;
  /** Ausdrücklich neu erzeugen (Werkbank „für alle“, „erneut“ am Dokument): das Paket erkennt auch Dokumente mit Text neu. */
  neu?: boolean;
  /** Bei quelle paket: welches. */
  paket?: string;
  /** Gemischte PDFs (#458): Seiten (ab 1) ohne Textebene – eine Texterkennung erkennt nur diese und hängt sie an. */
  seitenOhneText?: number[];
  /** Umgewandelte Datei (#577): Typ des Originals; `mime` ist dann der Typ der Fassung. */
  original?: string;
}

/** Antwort eines Pakets auf einen Aufruf eines Ereignisses (#636). rc: Rückgabewert des Pakets; beginn: Start des Aufrufs (ms). */
export interface EreignisAufruf { ok: boolean; text: string; fehler: string | null; rc: number | null; beginn: number }

/** Die Teile, die der Volltext ruft: Dokumente (Texterkennung), Umwandeln, Archivfassung und Volltext aus Paketen. */
export interface VolltextTeile { dokumente: DokumenteDienst; umwandlung: DokumentUmwandlung; archiv: DokumentArchivfassung; ausPaketen: VolltextAusPaketen }

/** Was der Volltext außer dem Kern braucht – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface VolltextAnschluss {
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`; Tests ersetzen `dienst.kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Hintergrundaufträge des Dienstes („Volltext neu erzeugen“, #458). */
  auftraege: { starte(art: string, titel: string, arbeit: (fortschritt: Fortschritt, signal?: AbortSignal) => Promise<unknown>, phasen?: PhasenPlan[], opt?: { abbrechbar?: boolean }): Auftrag };
  /** Volltext aus Paketen (#614, paketvolltext.ts). */
  paketVolltext(): PaketVolltext;
  /** Sicherung außer Haus (#585, #636): vom Start am Dienst gesetzt. */
  sicherungAufgegeben(paket: string, name: string, fehler: string | null | undefined): Promise<void> | undefined;
  sicherungAntwort(paket: string, name: string, r: EreignisAufruf): Promise<void> | undefined;
}

export class VolltextDienst {
  constructor(private readonly kern: Kern, private readonly teile: VolltextTeile, private readonly anschluss: VolltextAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.teile.dokumente.ocr; }
  private get umwandlung() { return this.teile.umwandlung.umwandlung; }
  private get archiv() { return this.teile.archiv.archiv; }
  private get paketVolltext() { return this.anschluss.paketVolltext(); }
  private get paketKonten() { return this.kern.paketKonten; }
  private get auftraege() { return this.anschluss.auftraege; }
  private get sicherungAufgegeben() { return this.anschluss.sicherungAufgegeben; }
  private get sicherungAntwort() { return this.anschluss.sicherungAntwort; }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private typVon(mappeId: string) { return this.kern.typVon(mappeId); }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }
  private archivNachVolltext(id: string, neu?: boolean) { return this.teile.archiv.archivNachVolltext(id, neu); }
  private nachUmwandlungsEreignis(...a: Parameters<DokumentUmwandlung['nachUmwandlungsEreignis']>) { return this.teile.umwandlung.nachUmwandlungsEreignis(...a); }
  private nachVolltextEreignis(...a: Parameters<VolltextAusPaketen['nachVolltextEreignis']>) { return this.teile.ausPaketen.nachVolltextEreignis(...a); }

  private volltextHoerer: Array<(e: { dokument: string; mappe: string }) => Promise<void>> = [];
  /** Internes Ereignis „Volltext fertig“ abonnieren (#336). */
  beiVolltextFertig(f: (e: { dokument: string; mappe: string }) => Promise<void>) { this.volltextHoerer.push(f); }

  /**
   * Ereignis „Volltext fertig“ (#336, #442, #458): Der Volltext eines Dokuments steht fest – aus der Textebene bzw.
   * der eingebauten Texterkennung (quelle kern), von einem Paket, über die API oder übernommen. Für Pakete
   * `volltext.fertig` – auch ohne Text (`text: false`), dann aber nur für Pakete, die das kennen
   * (kenntVolltextOhneText). Wer den Text geschrieben hat (`von`), bekommt es nicht zurück. Die internen Hörer
   * (Erkennung #336) laufen nur mit Text; ihre Fehler landen nur im Protokoll.
   */
  async volltextFertig(e: { dokument: string; mappe: string }, m: VolltextMeldung = { quelle: 'kern', text: true }, von?: string | null): Promise<void> {
    const daten = { dokument: e.dokument, mappe: e.mappe, quelle: m.quelle, text: m.text, ...(m.mime ? { mime: m.mime } : {}), ...(m.seiten !== undefined ? { seiten: m.seiten } : {}), ...(m.neu ? { neu: true } : {}), ...(m.paket ? { paket: m.paket } : {}), ...(m.seitenOhneText?.length ? { seitenOhneText: m.seitenOhneText } : {}), ...(m.original ? { original: m.original, fassung: true } : {}) };
    // Einmal in den Ausgangskorb (#724): Automatisierungen, Pakete (#442, #458: z. B. „KI lokal – Ähnlichkeit“ rechnet den
    // Vektor, das Paket Texterkennung erkennt Scans) und – unter altem Namen – Pakete mit texterkennung.fertig.
    await this.ereignis('volltext.fertig', { ...daten, typ: await this.typVon(e.mappe) }, von);
    // Archivfassung (#631): erst jetzt, wenn der Volltext feststeht. Neuer Text (Paket, API, neu erzeugen) heißt neu.
    void this.archivNachVolltext(e.dokument, !!m.neu || m.quelle === 'paket' || m.quelle === 'api');
    if (!m.text) return;
    for (const h of this.volltextHoerer) {
      try { await h(e); } catch (x) { protokoll.modul('ablage').warn('Nach dem Volltext gestört', { dokument: e.dokument, fehler: (x as Error).message }); }
    }
  }

  /**
   * Der Kern hat den Volltext ausgelassen (#946), z. B. eine E-Mail ohne Paket, das ihren Text liefert: Für E-Mails
   * steht er damit fest (leer) – sie gehen trotzdem an das Paket für die Archivfassung. Andere Dokumente nicht.
   */
  volltextAusgelassen(id: string) { return this.archivNachVolltext(id); }

  /** Erzeugt dieses Dokumentenregister einen Volltext? (Standard: ja) */
  static volltextAn(typ: Mappentyp | undefined, registerKey: string) {
    const r = typ?.register.find((x) => x.key === registerKey);
    return !r || r.art !== 'dokumente' || r.volltext !== false;
  }

  /** Volltext für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen). */
  async volltextNachholen(): Promise<number> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    const ids = (await this.repo.ocrOhneVolltext()).filter((d) => VolltextDienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
    await this.repo.ocrEinreihen(ids);
    if (ids.length) protokoll.modul('werkbank').info('Volltext für vorhandene Dokumente nachholen', { dokumente: ids.length });
    this.ocr?.anstossen();
    return ids.length;
  }

  /** Texterkennung für ein Dokument erneut versuchen – ausdrücklich neu (#458): auch ein Paket erkennt dann neu. */
  async texterkennungErneut(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    if (this.ocr?.neuErkennen) await this.ocr.neuErkennen(id);
    else { await this.repo.ocrEinreihen([id]); this.ocr?.anstossen(); }
    return (await this.repo.holeDokument(id))!;
  }

  /** Das installierte Paket, das die Texterkennung übernimmt (#458, dms:texterkennung); bei mehreren das erste nach Id. */
  async texterkennungPaket(): Promise<{ id: string; name: string; version: string; sprachen: string[] } | null> {
    const alle = await this.repo.listePakete();
    const p = alle.filter((x) => hatSchnittstelle(x.laeufer, 'dms:texterkennung')).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!p) return null;
    // Sprachen (#459): Deutsch und Englisch im Paket, weitere aus Zusatzpaketen „<paket>.<kennung>“ (#1084; bis zum Umzug
    // im Katalog „<paket>_<kennung>“), die von ihm abhängen.
    const zusatz = alle.filter((x) => p.id in (x.abhaengigkeiten ?? {}) && (x.id.startsWith(`${p.id}.`) || x.id.startsWith(`${p.id}_`)))
      .map((x) => /^([a-z]{3})$/.exec(x.id.slice(p.id.length + 1))?.[1]).filter((x): x is string => !!x);
    return { id: p.id, name: p.name, version: p.version, sprachen: [...new Set(['deu', 'eng', ...zusatz])] };
  }

  /**
   * Ein Paket für die Texterkennung ist neu installiert (#459): Dokumente, die darauf warteten (Stand paket, „kein
   * Paket installiert“), gehen wie neue Dokumente durch Textebene und Paket.
   */
  async texterkennungPaketDa(): Promise<number> {
    const ids: string[] = [];
    for (let von = 0; ; von += 200) {
      const r = await this.repo.ocrAuftraege({ stand: 'paket', von, anzahl: 200 });
      // Wer auf den Volltext eines Pakets mit dms:volltext wartet (#614), wartet weiter auf dieses.
      ids.push(...r.eintraege.filter((e) => !(e.dokument.ocr?.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)).map((e) => e.dokument.id));
      if (r.eintraege.length < 200) break;
    }
    if (!ids.length) return 0;
    await this.repo.loescheOffeneEreignisse('volltext.fertig', ids).catch(() => 0);
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
    protokoll.modul('texterkennung').info('Paket für die Texterkennung installiert – wartende Dokumente gehen an das Paket', { dokumente: ids.length });
    return ids.length;
  }

  /** Wie viele Dokumente „Volltext neu erzeugen“ beträfe (#458) – für die Rückfrage. */
  async volltextNeuAnzahl(umfang: unknown): Promise<{ umfang: 'ohne' | 'alle'; anzahl: number }> {
    const u = umfang === 'alle' ? 'alle' : 'ohne';
    return { umfang: u, anzahl: (await this.volltextNeuIds(u)).length };
  }

  private async volltextNeuIds(umfang: 'ohne' | 'alle'): Promise<string[]> {
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    return (await this.repo.volltextKandidaten(umfang)).filter((d) => VolltextDienst.volltextAn(typen.get(d.typId), d.registerKey)).map((d) => d.id);
  }

  /**
   * „Volltext neu erzeugen“ (#458, Werkbank → Wartungsoperationen): für Dokumente ohne Text bzw. für alle – wie bei
   * einem neuen Dokument: Textebene neu lesen, dann Ereignis an die Pakete. „alle“ ist ein ausdrückliches Neu
   * (`neu: true`): das Paket erkennt dann auch Dokumente mit Text neu. Läuft als Auftrag mit Fortschritt, abbrechbar.
   */
  volltextNeu(umfang: unknown, von: string) {
    const u = umfang === 'alle' ? 'alle' : 'ohne';
    const jetzt = this.ocr?.jetzt?.bind(this.ocr);
    if (!jetzt) throw new Fachfehler(404, t('meldungen.dienst.die-texterkennung-ist-nicht'));
    const titel = u === 'alle' ? t('meldungen.dienst.volltext-neu-erzeugen-alle') : t('meldungen.dienst.volltext-neu-erzeugen-dokumente');
    return this.auftraege.starte('volltext-neu', titel, async (fortschritt, signal) => {
      const ids = await this.volltextNeuIds(u);
      protokoll.modul('werkbank').info('Volltext neu erzeugen', { umfang: u, dokumente: ids.length, von });
      let fertig = 0;
      fortschritt(0, ids.length);
      for (const id of ids) {
        if (signal?.aborted) break;
        try { await jetzt(id, { neu: u === 'alle', signal }); } catch (e) { protokoll.modul('texterkennung').warn('Volltext neu erzeugen: Dokument übersprungen', { id, fehler: (e as Error).message }); }
        fortschritt(++fertig, ids.length);
      }
      const paket = await this.texterkennungPaket();
      return { umfang: u, dokumente: ids.length, erledigt: fertig, abgebrochen: !!signal?.aborted, paket: paket?.name ?? null };
    }, [{ key: 'dokumente', name: 'Textebene lesen und an die Texterkennung geben', einheit: 'Dokumente' }], { abbrechbar: true });
  }

  /**
   * Fortschritt einer Fortsetzung (#458): Gibt das Paket in `weiter` einen kurzen Text `fortschritt` mit (z. B.
   * „Seite 20 von 64“), steht er am wartenden Dokument.
   */
  async texterkennungFortschritt(paket: string, e: { art: string; daten: Record<string, unknown> }, weiter: Record<string, unknown>): Promise<void> {
    if (e.art === 'datei.volltext' && typeof e.daten.dokument === 'string' && typeof weiter.fortschritt === 'string') {
      // Volltext aus Paketen (#614): Fortschritt am wartenden Dokument, wie bei der Texterkennung.
      const d = await this.repo.holeDokument(e.daten.dokument);
      const vp = d ? await this.paketVolltext.paketFuer(d.mime) : null;
      if (!d || !vp || vp.id !== paket || d.ocr?.stand !== 'paket' || !(d.ocr.info ?? '').startsWith(INFO_VOLLTEXT_PAKET)) return;
      await this.repo.ocrSetze(d.id, { stand: 'paket', info: `${infoVolltextPaket(vp)} – ${weiter.fortschritt.replace(/\s+/g, ' ').slice(0, 80)}`, seiten: d.ocr.seiten ?? null });
      return;
    }
    if (e.art !== 'volltext.fertig' || typeof e.daten.dokument !== 'string' || typeof weiter.fortschritt !== 'string') return;
    const p = await this.texterkennungPaket();
    if (!p || p.id !== paket) return;
    const d = await this.repo.holeDokument(e.daten.dokument);
    if (!d || d.ocr?.stand !== 'paket') return;
    await this.repo.ocrSetze(d.id, { stand: 'paket', info: `${infoWartet(p)} – ${weiter.fortschritt.replace(/\s+/g, ' ').slice(0, 80)}`, seiten: d.ocr.seiten ?? null });
  }

  /** Antwort eines Pakets auf jeden einzelnen Aufruf eines Ereignisses, auch Fortsetzungen und Fehlschläge (#636). */
  async nachEreignisAufruf(paket: string, e: { art: string; daten: Record<string, unknown> }, r: EreignisAufruf): Promise<void> {
    if (e.art === 'sicherung.fertig' && typeof e.daten.name === 'string') await this.sicherungAntwort?.(paket, e.daten.name, r);
  }

  /**
   * Ergebnis eines Ereignisses „Volltext fertig“ beim Paket für die Texterkennung (#458, aus dem Paket-Läufer):
   * Hat das Paket zugestellt bekommen, aber keinen Volltext geschrieben (z. B. Mappentyp nicht gewählt, Text aus dem
   * PDF reicht), wartet das Dokument nicht länger – es behält den Text aus dem PDF. Hat es aufgegeben: Fehler.
   */
  async nachTexterkennungsEreignis(paket: string, e: { art: string; daten: Record<string, unknown> }, r: { ok: boolean; text: string; fehler?: string | null; aufgegeben?: boolean }): Promise<void> {
    if (e.art === 'datei.umwandeln') return this.nachUmwandlungsEreignis(paket, e, r);
    if (e.art === 'datei.archivfassung') return this.archiv?.nachEreignis(paket, e, r);
    if (e.art === 'datei.volltext') return this.nachVolltextEreignis(paket, e, r);
    // Sicherung außer Haus (#585): Aufgegeben heißt „fehlgeschlagen“ (endgültig) – auch wenn das Paket es nicht mehr melden konnte.
    if (e.art === 'sicherung.fertig') { if (r.aufgegeben && typeof e.daten.name === 'string') await this.sicherungAufgegeben?.(paket, e.daten.name, r.fehler); return; }
    if (e.art !== 'volltext.fertig' || typeof e.daten.dokument !== 'string') return;
    const p = await this.texterkennungPaket();
    if (!p || p.id !== paket) return;
    const d = await this.repo.holeDokument(e.daten.dokument);
    if (!d || d.ocr?.stand !== 'paket') return;
    if (!r.ok && !r.aufgegeben) return;
    const grund = (r.ok ? r.text : r.fehler ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const text = await this.repo.volltext(d.id);
    const mitText = !!text && text.replace(/\s/g, '').length >= 20;
    const info = r.ok
      ? t('meldungen.dienst.paket', { wert: mitText ? INFO_TEXTEBENE : t('meldungen.dienst.ohne-text'), name: p.name, wert2: grund ? `: ${grund}` : ': nichts zu tun' })
      : t('meldungen.dienst.texterkennung-durch-paket', { name: p.name, wert: grund ? `: ${grund}` : '' });
    await this.repo.ocrSetze(d.id, { stand: r.ok ? 'fertig' : 'fehler', info: info.slice(0, 500), seiten: d.ocr.seiten ?? null });
    // Der Text aus dem PDF bleibt – jetzt steht der Volltext fest (#631).
    if (r.ok) void this.archivNachVolltext(d.id, e.daten.neu === true);
  }

  async volltext(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const text = await this.repo.volltext(id);
    // Seiten mit ihrer Sprache (#579), wenn das DMS sie kennt (mehrsprachig oder gemischtes PDF).
    const s = text ? await this.repo.seitensprachen(id) : null;
    const seiten = s && text ? seitentexte(text, s).map((t, i) => ({ seite: i + 1, sprachen: s[i].sprachen, text: t })) : null;
    return { dokument: d, text, seiten };
  }

  /**
   * Volltext schreiben (#338, für die Texterkennung als Paket): ersetzt den Volltext eines Dokuments.
   * Die Herkunft steht in ocr.info und in der Historie der Mappe; die eingebaute Texterkennung
   * überschreibt diesen Text danach nicht mehr von selbst (nur „Texterkennung erneut“).
   */
  async schreibeVolltext(id: string, eingabe: unknown, von: { id: string; herkunft: string; paket: boolean; ausgelesen?: boolean }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    if (typeof e.text !== 'string') throw new Fachfehler(422, t('meldungen.dienst.text-fehlt'));
    if (e.text.length > VOLLTEXT_MAX) throw new Fachfehler(413, t('meldungen.dienst.der-text-ist-zu', { VOLLTEXT_MAX }));
    const seiten = Number.isInteger(e.seiten) && (e.seiten as number) > 0 ? e.seiten as number : null;
    // Nur Text eines Pakets schützt vor der eingebauten Texterkennung (PAKET_TEXT); über die API gesetzter nicht.
    // Die Herkunft darf die Sprachmarke nicht vortäuschen (#395); die erkannte Sprache hängt am Ende an.
    const herkunft = von.herkunft.split(SPRACHE_MARKE.trim()).join('Sprache:');
    // Aus der umgewandelten Fassung (#577): Das Paket hat die Fassung gelesen, nicht das Original.
    const fassung = !kernTyp(d.mime) ? await this.umwandlung?.info(d.sha256) : null;
    const info = ((von.paket ? `${von.ausgelesen ? PAKET_VOLLTEXT : PAKET_TEXT}${herkunft}` : `Volltext ${herkunft}`).slice(0, 200) + (fassung ? ` – ${infoFassung(fassung.paket)}` : '')).slice(0, 300);
    let text = e.text.replace(/\u0000/g, '');
    // Sprache (#400): angegeben (z. B. vom Paket Texterkennung) oder erkannt; sie bestimmt die Wortstämme der Suche.
    if (e.sprache !== undefined && e.sprache !== null && !istTextsprache(e.sprache)) throw new Fachfehler(422, t('meldungen.dienst.sprache-unbekannt-erlaubt-oder', { keys: Object.keys(TEXTSPRACHEN).join(', ') }));
    const angegeben = istTextsprache(e.sprache) ? e.sprache : null;
    // Sprache je Seite (#579): Seiten im Text durch Seitenvorschub (\f) getrennt, dazu je Seite ihre Sprache(n) –
    // oder ohne Angabe erkennt das DMS sie. Gespeichert wird der Text wie bisher (Seiten mit Leerzeile getrennt).
    const seitenAngabe = sprachlisten(e.seitensprachen);
    const weitereAngabe = e.weitere === undefined || e.weitere === null ? undefined : sprachliste(e.weitere, 'weitere');
    let mehr: { weitere?: string[]; seitensprachen?: Seitensprache[] } = {};
    let haupt: string | null = null;
    let seitenzahl = seiten;
    if (seitenAngabe || text.includes(SEITENVORSCHUB)) {
      const teile = text.split(SEITENVORSCHUB);
      if (seitenAngabe && seitenAngabe.length !== teile.length) throw new Fachfehler(422, t('meldungen.dienst.seitensprachen-eintraege-der-text', { seitenAngabe: seitenAngabe.length, teile: teile.length }));
      if (teile.length > MAX_SEITENSPRACHEN) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-seiten', { MAX_SEITENSPRACHEN }));
      const z = seitenZusammensetzen(teile.map((t, i) => ({ text: t, sprachen: seitenAngabe?.[i] ?? null })));
      text = z.text;
      seitenzahl ??= teile.length;
      const ds = dokumentsprachen(z.seiten, zeichenzahl(z.text));
      haupt = angegeben ?? ds.sprache;
      const alle = [ds.sprache, ...ds.weitere].filter((k): k is string => !!k && k !== haupt);
      if (alle.length) mehr = { weitere: alle, seitensprachen: z.seiten };
    } else if (weitereAngabe?.length) mehr = { weitere: weitereAngabe };
    if (mehr.weitere && weitereAngabe) mehr.weitere = [...new Set([...mehr.weitere, ...weitereAngabe])];
    // Wortpositionen (#631): je Seite (wie im Text durch \f getrennt) die Wörter mit Lage – für die Archivfassung.
    let woerter: ReturnType<typeof pruefeWoerter> | null | undefined;
    if (e.woerter !== undefined && e.woerter !== null) {
      try { woerter = pruefeWoerter(e.woerter, e.text.split(SEITENVORSCHUB).length); } catch (f) { throw new Fachfehler(422, t('pakete.archiv.woerter', { grund: (f as Error).message })); }
    } else if (e.woerter === null || (von.paket && (kernTyp(d.mime) || !!fassung))) woerter = null;
    const sprache = angegeben ? { sprache: angegeben, konfidenz: 1 } : haupt ? { sprache: haupt, konfidenz: 1 } : erkenneSprache(text);
    if (mehr.weitere) mehr.weitere = mehr.weitere.filter((k) => k !== sprache?.sprache);
    const vermerk = angegeben || haupt ? `${SPRACHE_MARKE}${sprache!.sprache}` : sprache ? spracheZuInfo(sprache) : '';
    // Vor dem Stand: Wer den fertigen Volltext sieht (Archivfassung), findet die passenden Wortpositionen. Ein Paket
    // ohne Wortpositionen (ältere Texterkennung) nimmt die alten mit weg – sie gehörten zu einem anderen Text.
    if (woerter !== undefined && this.archiv) await this.archiv.speichereWoerter(d.sha256, woerter, von.herkunft).catch((f: Error) => protokoll.modul('archivfassung').warn('Wortpositionen nicht gespeichert', { dokument: id, fehler: f.message }));
    try {
      await this.repo.ocrSetze(id, { stand: 'fertig', text, seiten: seitenzahl ?? d.ocr?.seiten ?? null, info: info + vermerk, sprache: sprache && istTextsprache(sprache.sprache) ? sprache.sprache : null, ...mehr });
    } catch (f) {
      if (!istVerklemmung(f)) throw f;
      // Auch nach den Wiederholungen nicht gespeichert (#575): sichtbar am Dokument, und der Absender erfährt es (503).
      protokoll.modul('ablage').error('Volltext nicht gespeichert', { dokument: id, herkunft: von.herkunft, fehler: (f as Error).message });
      await this.repo.ocrSetze(id, { stand: 'fehler', info: `${NICHT_GESPEICHERT} (${(f as Error).message})`.slice(0, 500), seiten: d.ocr?.seiten ?? null }).catch(() => {});
      throw new Fachfehler(503, t('meldungen.dienst.die-datenbank-war-ausgelastet'));
    }
    await this.notiere(d.mappeId, von.id, 'volltext', { dokument: d.name, text: info });
    protokoll.modul('ablage').info('Volltext geschrieben', { dokument: id, zeichen: e.text.length, herkunft: von.herkunft });
    // Volltext aus einem Paket (#614): Das Dokument darf danach wieder gemeldet werden.
    this.paketVolltext.erledigt(id);
    // Das schreibende Paket bekommt sein eigenes Ergebnis nicht zurück (#458: sonst erkennte es endlos neu).
    const paketId = von.paket ? this.paketKonten.get(von.id) : undefined;
    await this.volltextFertig({ dokument: id, mappe: d.mappeId }, { quelle: von.paket ? 'paket' : 'api', text: text.replace(/\s/g, '').length > 0, mime: fassung?.mime ?? d.mime, ...(fassung ? { original: d.mime } : {}), seiten: seitenzahl ?? d.ocr?.seiten ?? null, ...(paketId ? { paket: paketId } : {}) }, von.id);
    return (await this.repo.holeDokument(id))!;
  }

  /**
   * Sprache eines Dokuments setzen (#400, API v1): bestimmt die Wortstämme der Volltextsuche. null = keine Angabe
   * (Deutsch). Der Suchindex des Dokuments entsteht dabei neu.
   */
  async setzeDokumentSprache(id: string, eingabe: unknown, von: { id: string; wer: string }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const x = (eingabe ?? {}) as { sprache?: unknown; weitere?: unknown };
    const s = x.sprache;
    if (s !== null && !istTextsprache(s)) throw new Fachfehler(422, t('meldungen.dienst.sprache-unbekannt-erlaubt-oder', { keys: Object.keys(TEXTSPRACHEN).join(', ') }));
    // Weitere Sprachen (#579): ohne Angabe bleiben sie; mit Angabe gelten sie fürs ganze Dokument.
    const weitere = x.weitere === undefined ? undefined : x.weitere === null ? [] : sprachliste(x.weitere, 'weitere').filter((k) => k !== s);
    await this.repo.setzeDokumentSprache(id, s, weitere);
    const auch = weitere?.length ? t('meldungen.dienst.enthaelt-auch', { map: weitere.map(sprachname).join(', ') }) : '';
    await this.notiere(d.mappeId, von.id, 'volltext', { dokument: d.name, text: t('meldungen.dienst.sprache', { wert: s ? sprachname(s) : t('meldungen.dienst.ohne-angabe'), auch, wer: von.wer }) });
    protokoll.modul('ablage').info('Sprache eines Dokuments gesetzt', { dokument: id, sprache: s, ...(weitere ? { weitere } : {}) });
    return (await this.repo.holeDokument(id))!;
  }

  /** Hinweis „Post teilen?“ wegklicken (#579): gilt für alle, bis das Dokument einen neuen Volltext bekommt. */
  async teilenHinweisAus(id: string) {
    if (!(await this.repo.teilenHinweisAus(id))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return (await this.repo.holeDokument(id))!;
  }
}

/** Liste von Sprachkennungen prüfen (#579): nur bekannte, ohne doppelte, höchstens alle Sprachen des DMS. */
function sprachliste(x: unknown, feld: string, max = Object.keys(TEXTSPRACHEN).length): string[] {
  if (!Array.isArray(x) || x.length > max || !x.every(istTextsprache)) throw new Fachfehler(422, `${feld}: Liste bekannter Sprachen erwartet (${Object.keys(TEXTSPRACHEN).join(', ')}), höchstens ${max}.`);
  return [...new Set(x as string[])];
}
/** Seitensprachen eines Pakets (#579): je Seite null (das DMS erkennt sie) oder ein bis zwei Sprachen. */
function sprachlisten(x: unknown): Array<string[] | null> | undefined {
  if (x === undefined || x === null) return undefined;
  if (!Array.isArray(x) || !x.length || x.length > MAX_SEITENSPRACHEN) throw new Fachfehler(422, t('meldungen.dienst.seitensprachen-liste-mit-einem', { MAX_SEITENSPRACHEN }));
  return x.map((e, i) => (e === null ? null : sprachliste(e, `seitensprachen[${i}]`, SPRACHEN_JE_SEITE)));
}
