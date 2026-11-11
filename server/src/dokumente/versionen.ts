/**
 * Versionen (#194, #1075 aus dienst.ts): neue Version, ältere zurückholen, nur die letzten N behalten (mit
 * Löschprotokoll, #470), Versionen lesen; „zuletzt geändert“ nachziehen (#76). Schicht 2.
 */
import { erkenneBildtyp } from '../../../shared/src/dateiumwandlung';
import { type Dokument, type Herkunft, MAX_DATEIGROESSE, type Mappentyp, type Register } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import { Eingang } from '../hochladen';
import { type Kern, versionInfo } from '../kern';
import type { Repo } from '../repo';
import { t } from '../sprache';
import { dateiname, erkenneAnzeigbar, type TexterkennungAnbindung } from './dokumente.dienst';

/** Was die Versionen außer dem Kern brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface VersionenAnschluss {
  /** Texterkennung (#45), angebunden an den Dokumenten. */
  ocr(): TexterkennungAnbindung | undefined;
  /** Neue Dateien melden und unbenutzte aufräumen (Dokumente, über den Dienst). */
  neueDateien(docs: Dokument[]): void;
  raeumeAuf(sha256: string): Promise<void>;
  /** Titel neu berechnen – über den Anschluss (`MappenTitel.aktualisiereTitel`). */
  aktualisiereTitel(ids: string[]): Promise<Map<string, string>>;
  /** Will das Register Volltext (#45; Volltext, noch im Dienst)? */
  volltextAn(typ: Mappentyp | undefined, registerKey: string): boolean;
}

export class DokumentVersionen {
  constructor(private readonly kern: Kern, private readonly anschluss: VersionenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get dateien() { return this.kern.dateien; }
  private get ocr() { return this.anschluss.ocr(); }
  private neueDateien(docs: Dokument[]) { this.anschluss.neueDateien(docs); }
  private raeumeAuf(sha256: string) { return this.anschluss.raeumeAuf(sha256); }
  private aktualisiereTitel(ids: string[]) { return this.anschluss.aktualisiereTitel(ids); }
  private volltextAn(typ: Mappentyp | undefined, registerKey: string) { return this.anschluss.volltextAn(typ, registerKey); }
  private notiere(...a: Parameters<Kern['historie']['schreibe']>) { return this.kern.historie.schreibe(...a); }

  /* ---------- Versionierung (#194) ---------- */

  async registerVon(d: Dokument) {
    const m = await this.repo.holeMappe(d.mappeId);
    const typ = m ? await this.repo.holeTyp(m.typId) : undefined;
    return { typ, reg: typ?.register.find((r) => r.key === d.registerKey && r.art === 'dokumente') };
  }

  /** Neue Version eines Dokuments – unabhängig von Name und Dateityp; nur mit eingeschalteter Versionierung. */
  async ersetzeDokument(id: string, e: { name?: string; typ?: string; herkunft?: Herkunft }, inhalt: unknown, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-6'));
    // Upload als temporäre Datei (#746) oder Puffer.
    const ein = Eingang.aus(inhalt);
    if (!ein || ein.groesse === 0) throw new Fachfehler(422, t('meldungen.dienst.die-datei-ist-leer'));
    if (ein.groesse > MAX_DATEIGROESSE) throw new Fachfehler(413, t('meldungen.dienst.die-datei-ist-zu'));
    const sha256 = await ein.sha256();
    const erkannt = erkenneAnzeigbar(ein.kopf);
    const angegeben = erkenneBildtyp(ein.kopf) ?? (/^[\w.+-]+\/[\w.+-]+$/.test(e.typ ?? '') ? e.typ! : 'application/octet-stream');
    await ein.lege(this.dateien, sha256);
    const neu = await this.repo.ersetzeDokument(id, {
      name: e.name ? dateiname(e.name) : d.name, mime: erkannt ?? angegeben, groesse: ein.groesse, sha256, anzeigbar: !!erkannt,
      erstelltVon: benutzerId, herkunft: e.herkunft ?? 'hochgeladen',
    });
    this.neueDateien([neu]);
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId);
  }

  /** Eine ältere Version zurückholen: als neue, höchste Version; es geht nichts verloren. */
  async holeVersionZurueck(id: string, nummer: number, benutzerId: string | null): Promise<Dokument> {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.version-gibt-es-nicht', { nummer }));
    const { typ, reg } = await this.registerVon(d);
    if (!reg?.versionierung) throw new Fachfehler(409, t('meldungen.dienst.fuer-dieses-register-ist-7'));
    const neu = await this.repo.ersetzeDokument(id, {
      name: v.name, mime: v.mime, groesse: v.groesse, sha256: v.sha256, anzeigbar: v.anzeigbar, erstelltVon: benutzerId, herkunft: 'zurueckgeholt', volltext: v.volltext,
    });
    return this.nachNeuerVersion(d, neu, typ, reg, benutzerId, nummer);
  }

  async nachNeuerVersion(alt: Dokument, neu: Dokument, typ: Mappentyp | undefined, reg: Register, benutzerId: string | null, zurueckgeholt?: number) {
    await this.notiere(neu.mappeId, benutzerId, 'dokument_version', {
      dokument: neu.name, version: neu.version, vorher: alt.name, groesse: neu.groesse, mime: neu.mime, register: reg.name,
      ...(zurueckgeholt ? { zurueckgeholt } : {}),
    });
    await this.beruehre(neu.mappeId, typ, benutzerId);
    // „Nur die letzten N“ (mit der aktuellen): ältere entfernen, Dateien aufräumen.
    if (reg.versionenBehalten) {
      const vorher = await this.repo.versionenVon(neu.id);
      for (const sha of await this.repo.kuerzeVersionen(neu.id, reg.versionenBehalten - 1)) await this.raeumeAuf(sha);
      // Löschprotokoll (#470): auch ältere Versionen, die über die eingestellte Anzahl hinaus wegfallen.
      const bleiben = new Set((await this.repo.versionenVon(neu.id)).map((v) => v.nummer));
      const weg = vorher.filter((v) => !bleiben.has(v.nummer));
      if (weg.length) await this.kern.loeschprotokoll.schreibe(this.kern.loeschprotokoll.dokEintraege(weg.map(versionInfo), { ...(await this.kern.loeschprotokoll.mappenInfo([neu.mappeId], new Map()))(neu.mappeId, neu.id), schritt: 'endgueltig', weg: 'version' }),
        await this.kern.loeschprotokoll.kontext(benutzerId, { ausloeser: 'automatisch' }));
    }
    if (neu.ocr?.stand !== 'fertig' && this.volltextAn(typ, reg.key)) {
      await this.repo.ocrEinreihen([neu.id]);
      this.ocr?.anstossen();
    }
    return (await this.repo.holeDokument(neu.id)) ?? neu;
  }

  async versionen(id: string) {
    const d = await this.repo.holeDokument(id);
    if (!d) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    return { aktuell: d, aeltere: await this.repo.versionenVon(id) };
  }

  async versionInhalt(id: string, nummer: number) {
    const v = await this.repo.holeVersion(id, nummer);
    if (!v) throw new Fachfehler(404, t('meldungen.dienst.version-gibt-es-nicht', { nummer }));
    const { volltext: _v, ...version } = v;
    return { version, inhalt: await this.dateien.lies(v.sha256) };
  }

  /** Dokumente hinzugefügt oder entfernt (#76): „zuletzt geändert“ nachziehen, Titel mit {geaendert} ebenso. */
  async beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) {
    await this.repo.beruehreMappe(mappeId, benutzerId);
    if (typ && /\{geaendert\}/.test(typ.titelVorlage ?? '')) await this.aktualisiereTitel([mappeId]);
  }
}
