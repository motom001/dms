/**
 * Dokumente (#1075 aus dienst.ts): Hochladen (#194, #393, #404), Löschen (#344, #470), Text einer Datei sofort (#391),
 * Texterkennung und Vorschaubilder anbinden, neue Dateien melden (#332, #577, #827). Schicht 2 – bekommt den Kern,
 * nicht den ganzen Dienst.
 */
import { randomUUID } from 'node:crypto';
import { erkenneBildtyp, kernTyp } from '../../../shared/src/dateiumwandlung';
import { type Dokument, type Herkunft, MAX_DATEIGROESSE, type Mappentyp } from '../../../shared/src/model';
import { VOLLTEXT_ZEICHEN_MAX as VOLLTEXT_MAX } from '../../../shared/src/paketvolltext';
import { Fachfehler } from '../fehler';
import { Eingang } from '../hochladen';
import { type Anlass, dokInfo, type Kern, versionInfo } from '../kern';
import { protokoll } from '../protokoll';
import type { Repo } from '../repo';
import { t } from '../sprache';
import { ergebnisText, type Stufe, STUFEN } from '../verkleinern';
import type { DokumentArchivfassung } from './archivfassung';
import type { GeschuetztePdfs } from './geschuetzte-pdf';
import type { DokumentUmwandlung } from './umwandeln';
import type { DokumentVersionen } from './versionen';

const text = (v: unknown) => (v == null ? '' : String(v)).trim();
/** Volltext übernehmen statt neu erkennen (Verkleinern ohne Versionierung). */
interface Volltextuebernahme { text: string; seiten: number | null; info: string | null }
/** Neue Dateien von außen, die automatisch verkleinert werden dürfen – nicht im DMS Bearbeitetes oder Zurückgeholtes. */
const AUTOMATISCH_VERKLEINERN: ReadonlySet<Herkunft> = new Set<Herkunft>(['hochgeladen', 'api', 'webdav', 'eingang']);

export function dateiname(v: unknown): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen aus Dateinamen entfernen ist der Zweck
  const s = text(v).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'Dokument').slice(0, 200);
}

/** Nur PDF und gängige Bilder werden im Browser angezeigt – erkannt am Inhalt, nicht am Namen. */
export function erkenneAnzeigbar(b: Buffer): string | null {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (kopf.startsWith('%PDF-')) return 'application/pdf';
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('GIF87a') || kopf.startsWith('GIF89a')) return 'image/gif';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Was der Dienst von der Texterkennung braucht (#45, #458). */
export interface TexterkennungAnbindung {
  anstossen(): void;
  erkenneSofort?(inhalt: Buffer, mime: string): Promise<{ text: string; info: string }>;
  /** Ausdrücklich neu erkennen (#458): Warteschlange, das Paket bekommt `neu`. */
  neuErkennen?(id: string): Promise<void>;
  /** Sofort, ohne Warteschlange (#458, „Volltext neu erzeugen“). */
  jetzt?(id: string, opt: { neu: boolean; signal?: AbortSignal }): Promise<void>;
}

/** Die Teile der Dokumente, die der Dokumente-Dienst ruft (eigene Klassen in diesem Ordner). */
export interface DokumenteTeile { umwandlung: DokumentUmwandlung; archiv: DokumentArchivfassung; pdfs: GeschuetztePdfs; versionen: DokumentVersionen }

/** Was die Dokumente außer dem Kern brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface DokumenteAnschluss {
  /** Ereignis auslösen – über die Fassade des Dienstes, wie bisher (Tests ersetzen `dienst.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Neue PDFs automatisch verkleinern (#393; PDF, noch im Dienst). */
  automatischVerkleinert(ein: Eingang, name: string): Promise<{ vorher: number; nachher: number; stufe: Stufe; inhalt: Buffer } | null>;
  /** Volltext übernommen (#393; Volltext, noch im Dienst). */
  volltextFertig(e: { dokument: string; mappe: string }, m: { quelle: 'kopie'; text: boolean; mime: string; seiten: number | null }): Promise<void>;
  /** Will das Register Volltext (#45; Volltext, noch im Dienst)? */
  volltextAn(typ: Mappentyp | undefined, registerKey: string): boolean;
  /** Archivmodus (#212; Mappen). */
  pruefeArchivDokument(mappeId: string, was: string): Promise<unknown>;
}

export class DokumenteDienst {
  constructor(private readonly kern: Kern, private readonly teile: DokumenteTeile, private readonly anschluss: DokumenteAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get umwandlung() { return this.teile.umwandlung.umwandlung; }
  private get entsperren() { return this.teile.pdfs.entsperren; }
  private get archiv() { return this.teile.archiv.archiv; }
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private danach(f: () => void) { this.kern.danach(f); }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private typVon(mappeId: string) { return this.kern.typVon(mappeId); }
  private ablageortId() { return this.kern.ablageortId(); }
  private besitzerDerPost(mappeId: string) { return this.teile.pdfs.besitzerDerPost(mappeId); }
  private automatischVerkleinert(ein: Eingang, name: string) { return this.anschluss.automatischVerkleinert(ein, name); }
  private volltextFertig(...a: Parameters<DokumenteAnschluss['volltextFertig']>) { return this.anschluss.volltextFertig(...a); }
  private volltextAn(typ: Mappentyp | undefined, registerKey: string) { return this.anschluss.volltextAn(typ, registerKey); }
  private pruefeArchivDokument(mappeId: string, was: string) { return this.anschluss.pruefeArchivDokument(mappeId, was); }
  private ersetzeDokument(...a: Parameters<DokumentVersionen['ersetzeDokument']>) { return this.teile.versionen.ersetzeDokument(...a); }
  private beruehre(...a: Parameters<DokumentVersionen['beruehre']>) { return this.teile.versionen.beruehre(...a); }

  /** Texterkennung anbinden (#45): neue Dokumente stoßen sie an. */
  ocr?: TexterkennungAnbindung;
  verbindeTexterkennung(t: TexterkennungAnbindung) { this.ocr = t; }

  /**
   * Text einer Datei sofort, ohne Warteschlange (#391, „Aus Dokument ausfüllen“): vCard und Text direkt, PDFs
   * und Bilder über die Texterkennung. Die Datei wird dabei nicht gespeichert.
   */
  async textAusDatei(inhalt: Buffer, name: string, mime: string): Promise<{ text: string; info: string }> {
    const art = erkenneAnzeigbar(inhalt) ?? mime;
    if (/\.(vcf|vcard|txt)$/i.test(name) || /^text\/(vcard|x-vcard|plain)$/.test(mime) || inhalt.subarray(0, 64).toString('utf8').includes('BEGIN:VCARD')) {
      return { text: inhalt.toString('utf8').slice(0, VOLLTEXT_MAX), info: t('meldungen.dienst.text-der-datei') };
    }
    if (!this.ocr?.erkenneSofort) throw new Fachfehler(503, t('meldungen.dienst.die-texterkennung-ist-nicht'));
    if (!/^(application\/pdf|image\/(jpeg|png|tiff|webp|gif|bmp))$/.test(art)) throw new Fachfehler(415, t('meldungen.dienst.diese-datei-laesst-sich'));
    return this.ocr.erkenneSofort(inhalt, art);
  }

  /** Vorschaubilder anbinden (#332): neue Dateien einreihen, gelöschte mit entfernen. */
  private vorschau?: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> };
  verbindeVorschau(v: { einreihen(d: Dokument[]): unknown; entferne(sha: string): Promise<void>; nachholen(d: Dokument[]): Promise<number> }) { this.vorschau = v; }

  /** Vorschaubilder für vorhandene Dokumente nachholen (Werkbank → Wartungsoperationen, #332). */
  async vorschauNachholen(): Promise<number> {
    if (!this.vorschau) return 0;
    const ids = [...new Set((await this.repo.alleDateien()).map((f) => f.dokumentId))];
    const docs: Dokument[] = [];
    for (const id of ids) { const d = await this.repo.holeDokument(id); if (d) docs.push(d); }
    // Andere Dateitypen (#577): Dateien ohne Fassung gehen an das zuständige Paket; ihr Bild entsteht mit der Fassung.
    const gemeldet = await this.umwandlung?.anfordern(docs.filter((d) => !kernTyp(d.mime))).catch((e: Error) => { protokoll.modul('umwandlung').warn('Dateien nicht zum Umwandeln gemeldet', { fehler: e.message }); return 0; }) ?? 0;
    return (await this.vorschau.nachholen(docs)) + gemeldet;
  }

  /**
   * Neue Dateien (#332, #577, #827): Vorschaubild einreihen, andere Dateitypen an das Paket zum Umwandeln melden,
   * geschützte PDFs erkennen (Rechte-Sperre gleich aufheben, bei Post für eine Person deren gemerkte Passwörter).
   */
  neueDateien(docs: Dokument[]) {
    this.vorschau?.einreihen(docs);
    const andere = docs.filter((d) => d && !kernTyp(d.mime));
    if (andere.length && this.umwandlung) void this.umwandlung.anfordern(andere).catch((e: Error) => protokoll.modul('umwandlung').warn('Datei nicht zum Umwandeln gemeldet', { fehler: e.message }));
    const pdfs = docs.filter((d) => d && d.mime === 'application/pdf');
    if (pdfs.length && this.entsperren) void this.entsperren.neu(pdfs, (d) => this.besitzerDerPost(d.mappeId)).catch((e: Error) => protokoll.modul('dokumente').warn('Geschützte PDFs nicht geprüft', { fehler: e.message }));
  }

  /* ---------- Dokumente ---------- */

  /** Löscht die Datei, wenn kein Dokument mehr auf sie zeigt. */
  async raeumeAuf(sha256: string) {
    if (!(await this.repo.dateiBenutzt(sha256))) {
      await this.dateien.loesche(sha256);
      await this.vorschau?.entferne(sha256);
      await this.umwandlung?.entferne(sha256);
      await this.archiv?.entferne(sha256);
    }
  }

  /**
   * Hochladen. Gleicher Name im Register (#194): `gleicherName` = „zaehler“ (Standard: „Rechnung (2).pdf“),
   * „version“ (neue Version des vorhandenen, nur mit Versionierung) oder „ersetzen“ (vorhandenes löschen,
   * nur ohne Versionierung).
   */
  async ladeHoch(mappeId: string, e: { register?: string; name?: string; typ?: string; gleicherName?: string; herkunft?: Herkunft; volltext?: Volltextuebernahme; /** Nur intern (#878: Beispiel-Dokumente mit Datum). */ erstellt?: string }, inhalt: unknown, benutzerId: string | null) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const typ = await this.repo.holeTyp(m.typId);
    const reg = typ?.register.find((r) => r.key === e.register && r.art === 'dokumente');
    if (!reg) throw new Fachfehler(422, t('meldungen.dienst.dieses-dokumentenregister-gibt-es-2'));
    // Upload als temporäre Datei (#746) oder Puffer; ganz gelesen wird er nur, wo es nötig ist (PDF verkleinern).
    let ein = Eingang.aus(inhalt);
    if (!ein || ein.groesse === 0) throw new Fachfehler(422, t('meldungen.dienst.die-datei-ist-leer'));
    if (ein.groesse > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    // Automatisch verkleinern (#393): neue PDFs von außen (Hochladen, Eingangsordner, Postfach, API, WebDAV) ab einer Größe.
    let automatisch: { vorher: number; nachher: number; stufe: Stufe } | null = null;
    if (AUTOMATISCH_VERKLEINERN.has(e.herkunft ?? 'hochgeladen') && !e.volltext) {
      const r = await this.automatischVerkleinert(ein, e.name ?? '');
      if (r) { automatisch = { vorher: r.vorher, nachher: r.nachher, stufe: r.stufe }; ein = Eingang.aus(r.inhalt)!; }
    }
    const groesse = ein.groesse;
    const art = e.gleicherName ?? 'zaehler';
    if (!['zaehler', 'version', 'ersetzen'].includes(art)) throw new Fachfehler(422, t('meldungen.dienst.gleichername-zaehler-version-oder'));
    const vorhanden = (await this.repo.listeDokumente(mappeId)).filter((d) => d.registerKey === reg.key);
    const gleich = vorhanden.find((d) => d.name.toLowerCase() === dateiname(e.name).toLowerCase());
    if (gleich && art === 'version') {
      if (!reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist'));
      return { dokument: await this.ersetzeDokument(gleich.id, { name: e.name, typ: e.typ, herkunft: e.herkunft }, ein, benutzerId), gleicherInhalt: [], version: true };
    }
    if (gleich && art === 'ersetzen') {
      if (reg.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-2'));
      await this.loescheDokument(gleich.id, benutzerId);
    }
    let name = dateiname(e.name);
    if (gleich && art === 'zaehler') {
      const namen = new Set(vorhanden.map((d) => d.name.toLowerCase()));
      const punkt = name.lastIndexOf('.');
      const [stamm, endung] = punkt > 0 ? [name.slice(0, punkt), name.slice(punkt)] : [name, ''];
      for (let i = 2; namen.has(name.toLowerCase()); i++) name = `${stamm} (${i})${endung}`;
    }

    const sha256 = await ein.sha256();
    const erkannt = erkenneAnzeigbar(ein.kopf);
    // TIFF, BMP, HEIC … am Inhalt (#577): Browser schicken sie oft ohne oder mit falschem Typ.
    const angegeben = erkenneBildtyp(ein.kopf) ?? (/^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream');
    const gleicherInhalt = await this.repo.dokumenteMitSha(sha256);
    await ein.lege(this.dateien, sha256);
    // Dokument, Historie und Ereignis in einer Transaktion (#404); die Datei liegt schon (bleibt sie übrig, räumt die Wartung auf).
    const neu = await this.inTransaktion(async () => {
      await this.notiere(mappeId, benutzerId, 'dokument_hochgeladen', { dokument: name, groesse, mime: erkannt ?? angegeben, register: reg.name,
        ...(automatisch ? { verkleinert: `automatisch ${ergebnisText(automatisch.vorher, automatisch.nachher)} (${STUFEN[automatisch.stufe].name})` } : {}) });
      await this.beruehre(mappeId, typ, benutzerId);
      const dokument = await this.repo.legeDokumentAn({
        id: randomUUID(), mappeId, registerKey: reg.key, name, mime: erkannt ?? angegeben,
        groesse, sha256, anzeigbar: !!erkannt, erstellt: new Date().toISOString(), erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
      });
      if (e.erstellt) { await this.repo.setzeDokumentErstellt(dokument.id, e.erstellt); dokument.erstellt = e.erstellt; }
      this.danach(() => this.neueDateien([dokument]));
      // Volltext (#45): neues Dokument in die Warteschlange, wenn das Register das will.
      let neu = dokument;
      if (e.volltext) {
        // Verkleinert ohne Versionierung (#393): Der Volltext des bisherigen bleibt, keine neue Texterkennung.
        await this.repo.ocrSetze(dokument.id, { stand: 'fertig', ...e.volltext });
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
        this.danach(() => void this.volltextFertig({ dokument: dokument.id, mappe: mappeId }, { quelle: 'kopie', text: !!e.volltext?.text?.trim(), mime: dokument.mime, seiten: e.volltext?.seiten ?? null }));
      } else if (this.volltextAn(typ, reg.key)) {
        await this.repo.ocrEinreihen([dokument.id]);
        neu = (await this.repo.holeDokument(dokument.id)) ?? dokument;
        this.danach(() => this.ocr?.anstossen());
      }
      await this.ereignis('dokument.hochgeladen', { dokument: dokument.id, mappe: mappeId, typ: await this.typVon(mappeId), mime: dokument.mime, groesse, volltextGeplant: neu.ocr?.stand === 'wartet' }, benutzerId);
      return neu;
    });
    const bezuege = await this.repo.bezuege(gleicherInhalt.map((d) => d.mappeId));
    return { dokument: neu, gleicherInhalt: gleicherInhalt.map((d) => ({ mappeId: d.mappeId, name: d.name, ...bezuege.get(d.mappeId) })), ...(automatisch ? { verkleinert: automatisch } : {}) };
  }

  /** Titel und Typ zu Mappen-Ids (ohne Rechteprüfung – vorher filtern). */
  bezuegeVon(ids: string[]) { return this.repo.bezuege(ids); }

  /** Startseite (#334): Gibt es noch keine Mappe außer denen des Systems (Benutzer, Rollen, Ablageorte) und Demo-Daten? */
  async ohneEigeneMappen(): Promise<boolean> {
    const ablageort = await this.ablageortId();
    const typen = (await this.repo.listeTypen()).filter((t) => !t.system && t.id !== ablageort);
    // Nur ob es eine gibt (#615): früher zählte das bei jedem Laden der Startseite alle Mappen je Typ.
    return !(await this.repo.gibtMappen(typen.map((t) => t.id)));
  }

  async holeDokument(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return d;
  }

  async dokumentInhalt(id: string) {
    const dokument = await this.repo.holeDokument(id);
    if (!dokument) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return { dokument, inhalt: await this.dateien.lies(dokument.sha256) };
  }

  async loescheDokument(id: string, benutzerId: string | null = null, anlass: Anlass = { weg: 'ersetzt' }) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    // Archivmodus (#212): Dokumente bleiben bis Fristende; ändern nur als neue Version.
    await this.pruefeArchivDokument(d.mappeId, 'löschen');
    // Alle Versionen (#194) gehen mit.
    const aeltere = await this.repo.versionenVon(id);
    // Papierkorb (#344): eingeschaltet → das Dokument zieht samt Versionen und Volltext dorthin um.
    const korb = (await this.kern.papierkorbTage()) > 0;
    if (korb) await this.repo.legeDokumentInPapierkorb(id, benutzerId);
    else await this.repo.loescheDokument(id);
    // Löschprotokoll (#470)
    const info = (await this.kern.loeschprotokoll.mappenInfo([d.mappeId], new Map()))(d.mappeId, id);
    await this.kern.loeschprotokoll.schreibe(this.kern.loeschprotokoll.dokEintraege([dokInfo(d), ...aeltere.map(versionInfo)], { ...info, schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass.weg ?? 'dokument' }),
      await this.kern.loeschprotokoll.kontext(benutzerId, anlass));
    await this.notiere(d.mappeId, benutzerId, korb ? 'dokument_papierkorb' : 'dokument_geloescht', { dokument: d.name, groesse: d.groesse, mime: d.mime, ...(aeltere.length ? { versionen: aeltere.length + 1 } : {}) });
    const m = await this.repo.holeMappe(d.mappeId);
    if (m) await this.beruehre(m.id, await this.repo.holeTyp(m.typId), benutzerId);
    if (!korb) for (const sha of new Set([d.sha256, ...aeltere.map((v) => v.sha256)])) await this.raeumeAuf(sha);
    return { papierkorb: korb };
  }
}
