/**
 * PDF verkleinern (#393, #1077 aus dienst.ts): Schätzung je Stufe, Verkleinern am Dokument (neue Version oder
 * Ersetzen), automatisch beim Hochladen, große Dokumente in der Werkbank als Sammelaktion. Schicht 3 – bekommt den
 * Kern, PDF bearbeiten, Mappen und Dokumente; die Hintergrundaufträge über den Anschluss.
 */
import { type DokumenteDienst, type DokumentVersionen, erkenneAnzeigbar } from '../dokumente';
import { Fachfehler } from '../fehler';
import { MB } from '../grenzen';
import { type Eingang, shaVon } from '../hochladen';
import { type Anlass, type Kern, type Loeschprotokoll, type ProtokollTeil, versionInfo } from '../kern';
import type { MappenArchiv, MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import { type Analyse, analysiere, ergebnisText, istStufe, MIN_ERSPARNIS, STANDARD_STUFE, type Stufe, stufeAus, STUFEN, verkleinere } from '../verkleinern';
import type { Auftrag, Fortschritt, PhasenPlan } from '../../../shared/src/auftrag';
import type { LoeschDokument, LoeschEintrag, LoeschKontext } from '../../../shared/src/loeschprotokoll';
import type { Dokument } from '../../../shared/src/model';
import type { PdfBearbeiten } from './pdf-bearbeiten.dienst';

/** Automatisch verkleinern (#393): Einstellung in der Werkbank → Systemzustand; Standard aus. */
export interface VerkleinernEinstellung { automatisch: boolean; abMb: number; stufe: Stufe }
export const VERKLEINERN_STANDARD: VerkleinernEinstellung = { automatisch: false, abMb: 5, stufe: STANDARD_STUFE };
export function verkleinernEinstellungAus(v: unknown): VerkleinernEinstellung {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const abMb = Number(o.abMb);
  return {
    automatisch: o.automatisch === true,
    abMb: Number.isFinite(abMb) && abMb >= 1 && abMb <= 100 ? abMb : VERKLEINERN_STANDARD.abMb,
    stufe: istStufe(o.stufe) ? o.stufe : VERKLEINERN_STANDARD.stufe,
  };
}
/** Werkbank: so viele große PDFs in der Liste und in einer Sammelaktion, davon so viele mit Schätzung. */
export const GROSSE_MAX = 200;
export const GROSSE_MIT_SCHAETZUNG = 60;

/** Die Teile, die das Verkleinern ruft: PDF bearbeiten (PDF lesen), Mappen (Historie, Archivmodus) und Dokumente. */
export interface VerkleinernTeile { pdf: PdfBearbeiten; historie: MappenHistorie; archiv: MappenArchiv; dokumente: DokumenteDienst; versionen: DokumentVersionen }

/** Was das Verkleinern außer dem Kern braucht – vom Dienst hereingereicht. */
export interface VerkleinernAnschluss {
  /** Hintergrundaufträge des Dienstes (Sammelaktion „Große Dokumente verkleinern“). */
  auftraege: { starte(art: string, titel: string, arbeit: (fortschritt: Fortschritt, signal?: AbortSignal) => Promise<unknown>, phasen?: PhasenPlan[], opt?: { abbrechbar?: boolean }): Auftrag };
}

export class PdfVerkleinern {
  constructor(private readonly kern: Kern, private readonly teile: VerkleinernTeile, private readonly anschluss: VerkleinernAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get auftraege() { return this.anschluss.auftraege; }
  private papierkorbTage() { return this.kern.papierkorbTage(); }
  private liesGanz(sha256: string): Promise<Buffer> { return this.kern.liesGanz(sha256); }
  private pdfVon(id: string) { return this.teile.pdf.pdfVon(id); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private pruefeArchivDokument(mappeId: string, was: string) { return this.teile.archiv.pruefeArchivDokument(mappeId, was); }
  private setzeArchivnummer(id: string, eingabe: unknown, von: string | null) { return this.teile.archiv.setzeArchivnummer(id, eingabe, von); }
  private ladeHoch(...a: Parameters<DokumenteDienst['ladeHoch']>) { return this.teile.dokumente.ladeHoch(...a); }
  private loescheDokument(...a: Parameters<DokumenteDienst['loescheDokument']>) { return this.teile.dokumente.loescheDokument(...a); }
  private neueDateien(docs: Dokument[]) { this.teile.dokumente.neueDateien(docs); }
  private raeumeAuf(sha256: string) { return this.teile.dokumente.raeumeAuf(sha256); }
  private registerVon(d: Dokument) { return this.teile.versionen.registerVon(d); }
  private nachNeuerVersion(...a: Parameters<DokumentVersionen['nachNeuerVersion']>) { return this.teile.versionen.nachNeuerVersion(...a); }
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }
  private dokEintraege(liste: LoeschDokument[], x: Parameters<Loeschprotokoll['dokEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.dokEintraege(liste, x); }
  private mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) { return this.kern.loeschprotokoll.mappenInfo(mappeIds, frueher); }
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }

  /** Schätzungen je Prüfwert (Analyse ist schnell, aber nicht kostenlos – die Werkbank fragt viele ab). */
  private readonly analysen = new Map<string, Analyse>();

  private async analyseVon(d: Dokument): Promise<Analyse> {
    const da = this.analysen.get(d.sha256);
    if (da) return da;
    const a = await analysiere(await this.liesGanz(d.sha256));
    if (this.analysen.size > 500) this.analysen.delete(this.analysen.keys().next().value!);
    this.analysen.set(d.sha256, a);
    return a;
  }

  /** Für den Dialog: Größe, Bilder und geschätzte Größe je Stufe; dazu, was mit dem Ergebnis geschieht. */
  async verkleinernVorschau(id: string) {
    const { d } = await this.pdfVon(id);
    const { reg } = await this.registerVon(d);
    return { id: d.id, name: d.name, ...(await this.analyseVon(d)), versioniert: !!reg?.versionierung, papierkorb: (await this.papierkorbTage()) > 0, mindestens: MIN_ERSPARNIS };
  }

  /**
   * Verkleinern am Dokument: Ergebnis als neue Version (Versionierung) bzw. – ohne Versionierung – Ersetzen
   * nach Rückfrage (`bestaetigt`), das bisherige kommt in den Papierkorb (wie „PDF bearbeiten“, #335).
   * Der Volltext bleibt (die Textebene ist unverändert), es gibt keine neue Texterkennung.
   * Bringt es weniger als 10 %, bleibt alles, wie es ist (`unveraendert: true`). `ohneOriginal` (Sammelaktion):
   * die bisherige Version nicht behalten – nur außerhalb einer Aufbewahrungsfrist.
   */
  async verkleinereDokument(id: string, eingabe: unknown, von: string | null): Promise<{ dokument: Dokument; unveraendert: boolean; vorher: number; nachher: number; stufe: Stufe; meldung: string }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const stufe = e.stufe === undefined ? STANDARD_STUFE : stufeAus(e.stufe) ?? STANDARD_STUFE;
    const { d, inhalt } = await this.pdfVon(id);
    const { typ, reg } = await this.registerVon(d);
    if (!reg) throw new Fachfehler(409, t('meldungen.dienst.das-register-dieses-dokuments'));
    const korb = (await this.papierkorbTage()) > 0;
    if (!reg.versionierung && e.bestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-4', { wert: korb ? t('meldungen.dienst.das-bisherige-kommt-in') : t('meldungen.dienst.das-bisherige-ist-danach') }), { rueckfrage: true, papierkorb: korb });
    }
    const r = await verkleinere(inhalt, stufe);
    if (!r.lohnt) {
      const meldung = t('meldungen.dienst.laesst-sich-kaum-verkleinern', { name: d.name, round: Math.round(MIN_ERSPARNIS * 100) });
      return { dokument: d, unveraendert: true, vorher: r.vorher, nachher: r.vorher, stufe, meldung };
    }
    const ocr = d.ocr?.stand === 'fertig' ? { text: (await this.repo.volltext(d.id)) ?? '', seiten: d.ocr.seiten ?? null, info: d.ocr.info ?? null } : null;
    let neu: Dokument;
    if (reg.versionierung) {
      const v = await this.repo.ersetzeDokument(d.id, {
        name: d.name, mime: 'application/pdf', groesse: r.inhalt.length, sha256: await this.legeDateiAb(r.inhalt), anzeigbar: true,
        erstelltVon: von, herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr.text } : {}),
      });
      if (ocr) await this.repo.ocrSetze(v.id, { stand: 'fertig', ...ocr });
      this.neueDateien([v]);
      neu = await this.nachNeuerVersion(d, v, typ, reg, von);
      if (e.ohneOriginal === true && (await this.archivErlaubt(d.mappeId))) {
        const alt = (await this.repo.versionenVon(d.id)).find((x) => x.nummer === v.version! - 1);
        const sha = await this.repo.loescheVersion(d.id, v.version! - 1);
        if (sha) await this.raeumeAuf(sha);
        if (sha && alt) await this.protokolliere(this.dokEintraege([versionInfo(alt)], { ...(await this.mappenInfo([d.mappeId], new Map()))(d.mappeId, d.id), schritt: 'endgueltig', weg: 'version' }), await this.loeschKontext(von));
        neu = (await this.repo.holeDokument(d.id)) ?? neu;
      }
    } else {
      const { anlagen } = await this.loescheDokument(d.id, von);
      neu = (await this.ladeHoch(d.mappeId, { register: reg.key, name: d.name, typ: 'application/pdf', herkunft: 'bearbeitet', ...(ocr ? { volltext: ocr } : {}) }, r.inhalt, von)).dokument;
      // Anlagen (#998) hängen am verkleinerten Dokument; war es selbst eine Anlage, bleibt sie es.
      await this.teile.dokumente.nimmAnlagenMit(d, anlagen, neu);
      if (d.archivnummer) neu = await this.setzeArchivnummer(neu.id, d.archivnummer, von).catch(() => neu);
    }
    const text = t('meldungen.dienst.verkleinert-stufe-dpi', { ergebnisText: ergebnisText(r.vorher, r.nachher), name: STUFEN[stufe].name, dpi: STUFEN[stufe].dpi });
    await this.notiere(d.mappeId, von, 'pdf_bearbeitet', { dokument: d.name, text, verkleinert: { vorher: r.vorher, nachher: r.nachher, stufe }, seiten: r.seiten, vorher: r.seiten });
    protokoll.modul('dokumente').info('PDF verkleinert', { id: d.id, stufe, vorher: r.vorher, nachher: r.nachher, bilder: r.bilder });
    return { dokument: neu, unveraendert: false, vorher: r.vorher, nachher: r.nachher, stufe, meldung: t('meldungen.dienst.verkleinert', { ergebnisText: ergebnisText(r.vorher, r.nachher) }) };
  }

  async legeDateiAb(inhalt: Buffer): Promise<string> {
    // Prüfsumme in Stücken (#746): PDFs nach dem Bearbeiten sind bis zu 100 MB groß.
    const sha256 = await shaVon(inhalt);
    await this.dateien.schreibe(sha256, inhalt);
    return sha256;
  }

  /** Darf eine ältere Version weg? Nicht während einer Aufbewahrungsfrist (Archivmodus, #212). */
  private async archivErlaubt(mappeId: string): Promise<boolean> {
    try { await this.pruefeArchivDokument(mappeId, 'löschen'); return true; } catch { return false; }
  }

  /** Einstellung „automatisch verkleinern“ (Werkbank → Systemzustand); Standard aus. */
  async verkleinernEinstellung(): Promise<VerkleinernEinstellung> {
    return verkleinernEinstellungAus(await this.einstellungen?.lies('verkleinern'));
  }

  async setzeVerkleinernEinstellung(eingabe: unknown): Promise<VerkleinernEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(409, t('meldungen.dienst.einstellungen-sind-nicht-verfuegbar'));
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const abMb = Number(e.abMb);
    if (!Number.isFinite(abMb) || abMb < 1 || abMb > 100) throw new Fachfehler(422, t('meldungen.dienst.ab-welcher-groesse-1'));
    if (!istStufe(e.stufe)) throw new Fachfehler(422, t('meldungen.dienst.stufe-bildschirm-standard-oder'));
    const neu: VerkleinernEinstellung = { automatisch: e.automatisch === true, abMb: Math.round(abMb * 10) / 10, stufe: e.stufe };
    await this.einstellungen.schreibe('verkleinern', neu);
    protokoll.modul('werkbank').info('Automatisch verkleinern geändert', { ...neu });
    return neu;
  }

  /** Verkleinert ein neues PDF, wenn das eingeschaltet ist und es groß genug ist; null = unverändert lassen. */
  async automatischVerkleinert(ein: Eingang, name: string) {
    if (erkenneAnzeigbar(ein.kopf) !== 'application/pdf') return null;
    const e = await this.verkleinernEinstellung();
    if (!e.automatisch || ein.groesse < e.abMb * MB) return null;
    try {
      const r = await verkleinere(await ein.puffer(), e.stufe);
      if (!r.lohnt) return null;
      protokoll.modul('dokumente').info('Neues PDF automatisch verkleinert', { name, vorher: r.vorher, nachher: r.nachher, stufe: e.stufe });
      return r;
    } catch (x) {
      // Lässt es sich nicht verkleinern (verschlüsselt, beschädigt), wird es so abgelegt, wie es kam.
      protokoll.modul('dokumente').warn('Automatisch verkleinern übersprungen', { name, fehler: (x as Error).message });
      return null;
    }
  }

  /**
   * Werkbank: große PDF-Dokumente nach Größe, mit geschätzter Ersparnis der Stufe. Geschätzt werden nur die
   * ersten `GROSSE_MIT_SCHAETZUNG` (die Liste soll schnell da sein); `ab` in MB.
   */
  async grosseDokumente(f: { ab?: unknown; stufe?: unknown }) {
    const ab = Number(f.ab ?? 2);
    if (!Number.isFinite(ab) || ab < 0 || ab > 100) throw new Fachfehler(422, t('meldungen.dienst.ab-0-bis-100'));
    const stufe = f.stufe === undefined || f.stufe === '' ? STANDARD_STUFE : stufeAus(f.stufe) ?? STANDARD_STUFE;
    const docs = await this.repo.grossePdfs(Math.round(ab * MB), GROSSE_MAX);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    const eintraege = [];
    for (const [i, d] of docs.entries()) {
      let geschaetzt: number | null = null, lohnt: boolean | null = null, fehler: string | null = null;
      if (i < GROSSE_MIT_SCHAETZUNG) {
        try { const a = (await this.analyseVon(d)).stufen[stufe]; geschaetzt = a.geschaetzt; lohnt = a.lohnt; } catch (x) { fehler = (x as Error).message; }
      }
      const b = bezuege.get(d.mappeId);
      eintraege.push({ id: d.id, name: d.name, groesse: d.groesse, mappeId: d.mappeId, mappeTitel: b?.titel ?? '', typId: b?.typId ?? null, version: d.version ?? 1, geschaetzt, lohnt, fehler });
    }
    const geschaetzteErsparnis = eintraege.reduce((s, x) => s + (x.lohnt && x.geschaetzt != null ? x.groesse - x.geschaetzt : 0), 0);
    return { stufe, ab, eintraege, geschaetzteErsparnis, mehr: docs.length === GROSSE_MAX };
  }

  /** Sammelaktion „Große Dokumente verkleinern“ als Hintergrundauftrag (eine Phase, Einheit Dokumente). */
  verkleinereViele(eingabe: unknown, von: { id: string | null; email: string }) {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(e.ids) ? [...new Set(e.ids.map(String))].filter(istUuid) : [];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.bitte-mindestens-ein-dokument'));
    if (ids.length > GROSSE_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-dokumente-auf-einmal', { GROSSE_MAX }));
    const stufe = stufeAus(e.stufe ?? STANDARD_STUFE) ?? STANDARD_STUFE;
    const ohneOriginal = e.ohneOriginal === true;
    // Ohne Versionierung ersetzt das Verkleinern das Dokument – das muss hier einmal für alle bestätigt sein.
    const bestaetigt = e.bestaetigt === true;
    return this.auftraege.starte('pdf-verkleinern', `${ids.length} ${ids.length === 1 ? 'PDF' : 'PDFs'} verkleinern (${STUFEN[stufe].name})`, async (fortschritt) => {
      let vorher = 0, nachher = 0, verkleinert = 0, unveraendert = 0;
      const fehler: Array<{ id: string; name: string; grund: string }> = [];
      fortschritt(0, ids.length);
      for (const [i, id] of ids.entries()) {
        try {
          const r = await this.verkleinereDokument(id, { stufe, bestaetigt, ohneOriginal }, von.id);
          if (r.unveraendert) unveraendert++; else { verkleinert++; vorher += r.vorher; nachher += r.nachher; }
        } catch (x) {
          const d = await this.repo.holeDokument(id).catch(() => undefined);
          fehler.push({ id, name: d?.name ?? id, grund: (x as Error).message });
        }
        fortschritt(i + 1, ids.length);
      }
      protokoll.modul('werkbank').info('Große Dokumente verkleinert', { von: von.email, stufe, verkleinert, unveraendert, fehler: fehler.length, vorher, nachher });
      return { stufe, verkleinert, unveraendert, fehler, vorher, nachher, ohneOriginal };
    }, [{ key: 'dokumente', name: 'PDFs verkleinern', einheit: 'Dokumente' }]);
  }
}
