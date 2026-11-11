/**
 * Mappen löschen (#43, #79, #150, #470, #1078 aus dienst.ts): ob eine Mappe gelöscht werden kann, eine und mehrere
 * löschen (in den Papierkorb oder endgültig, mit dem Löschprotokoll), endgültig entfernen beim Zurückrollen. Schicht 3 –
 * bekommt den Kern, Rechteprüfung, Passung, Historie, Dokumente, Ausgang, Sichten, die Systemmappen (post/) und die
 * übrigen Klassen dieses Ordners (sie kennen einander über `teile`); Ereignis, Titel und Konten über den Anschluss.
 */
import type { AusgangDienst } from '../ausgang';
import type { DokumenteDienst, DokumentVersionen } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Anlass, Kern, Loeschprotokoll, ProtokollMappe, ProtokollTeil, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import type { Passung } from '../mappentypen';
import type { PostSystemmappen } from '../post';
import { istUuid, type Repo, type Rueckverweis } from '../repo';
import type { SichtenDienst } from '../sichten';
import { t } from '../sprache';
import { NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import { aufbewahrenBis, datumText, inFrist } from '../../../shared/src/archiv';
import { type Ausloeser, liesAnlass, type LoeschKontext } from '../../../shared/src/loeschprotokoll';
import { darfLoeschen, type Mappe, type Mappentyp, MAX_AUSWAHL } from '../../../shared/src/model';
import { gebietsschema } from '../../../shared/src/sprache';
import { istTeilVerweis } from '../../../shared/src/teile';
import { fremdeVorgabe } from '../../../shared/src/vorgaben';
import type { LoeschprotokollVerwaltung } from './loeschprotokoll';
import type { MitVerknuepften } from './mit-verknuepften';
import type { Papierkorb } from './papierkorb';

/** Wert eines Mehrfachverweises als Liste. */
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);

/** Die Teile, die das Löschen ruft – dazu alle Klassen dieses Ordners (zusammengesetzt im Dienst). */
export interface LoeschenTeile {
  rechte: ZugriffDienst; passung: Passung; historie: MappenHistorie; dokumente: DokumenteDienst; versionen: DokumentVersionen;
  ausgang: AusgangDienst; sichten: SichtenDienst; systemmappen: PostSystemmappen;
  loeschen: LoeschenDienst; papierkorb: Papierkorb; protokoll: LoeschprotokollVerwaltung; verknuepft: MitVerknuepften;
}

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43; `KontenHaken` am Dienst). */
export interface LoeschenKonten {
  endgueltig(id: string): Promise<void>;
  wiederda(id: string, von: string | null): Promise<void>;
}

/** Was das Löschen außer dem Kern braucht – vom Dienst hereingereicht. */
export interface LoeschenAnschluss {
  /** Ereignis auslösen – über die Fassade des Dienstes (Tests ersetzen `dienst.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Titel neu berechnen – über die Fassade (Tests ersetzen `dienst.aktualisiereTitel`). */
  aktualisiereTitel(ids: string[]): Promise<Map<string, string>>;
  /** Konten (#43), vom Start angebunden. */
  konten(): LoeschenKonten | undefined;
}

export class LoeschenDienst {
  constructor(private readonly kern: Kern, private readonly teile: LoeschenTeile, private readonly anschluss: LoeschenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private rechteAn(...a: Parameters<ZugriffDienst['rechteAn']>) { return this.teile.rechte.rechteAn(...a); }
  private pruefeUnpassende(typ: Mappentyp) { return this.teile.passung.pruefeUnpassende(typ); }
  private raeumeAuf(sha256: string) { return this.teile.dokumente.raeumeAuf(sha256); }
  private schreibeSystemMappe(...a: Parameters<PostSystemmappen['schreibeSystemMappe']>) { return this.teile.systemmappen.schreibeSystemMappe(...a); }
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }
  private lebendInhalt(mappen: Mappe[]) { return this.teile.protokoll.lebendInhalt(mappen); }

  /** Nur für das Zurückrollen einer fehlgeschlagenen Paketinstallation: Mappen ohne Papierkorb entfernen (mit Dateien, #878). */
  async entferneMappenEndgueltig(ids: string[]) {
    const vorher = await this.lebendInhalt(await this.repo.holeMappen(ids));
    const dateien = new Set((await Promise.all(ids.map((id) => this.repo.listeDokumente(id)))).flat().map((d) => d.sha256));
    for (const id of await this.loeschReihenfolge(ids)) await this.repo.loescheMappe(id);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'endgueltig', weg: 'zurueckgerollt' }), await this.loeschKontext(null, { ausloeser: 'automatisch' }));
    for (const sha of dateien) await this.raeumeAuf(sha);
  }

  /**
   * Reihenfolge zum endgültigen Löschen mehrerer Mappen (#878): Mappen, auf die andere aus der Liste verweisen, zuletzt –
   * sonst scheitert das Löschen am Fremdschlüssel der Verweise. Bei einem Kreis bleibt der Rest in der alten Reihenfolge.
   */
  async loeschReihenfolge(ids: string[]): Promise<string[]> {
    const offen = new Set(ids);
    const quellen = new Map<string, string[]>();
    for (const id of ids) quellen.set(id, (await this.repo.rueckverweise(id)).map((r) => r.quelleId).filter((q) => q !== id && offen.has(q)));
    const erg: string[] = [];
    while (offen.size) {
      const frei = [...offen].filter((id) => !quellen.get(id)!.some((q) => offen.has(q)));
      for (const id of frei.length ? frei : [...offen]) { offen.delete(id); erg.push(id); }
    }
    return erg;
  }

  /**
   * Ob und warum nicht eine Mappe gelöscht werden kann (#79). Dieselbe Prüfung nutzt das Löschen,
   * damit Anzeige und Löschen nie auseinanderlaufen.
   */
  async loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[], alleTypen?: Mappentyp[]) {
    if (m.systemKennung) return { ok: false as const, status: 409, grund: t('meldungen.dienst.systemrollen-lassen-sich-nicht'), fremd: [], zuordnungen: [], emails: [] };
    if (typ && !darfLoeschen(typ)) return { ok: false as const, status: 403, grund: t('meldungen.dienst.mappen-vom-typ-lassen-2', { name: typ.name, wert: typ.system === 'benutzer' ? t('meldungen.dienst.benutzer-werden-in-der') : '' }), fremd: [], zuordnungen: [], emails: [] };
    // Archivmodus (#212): vor Fristende nicht löschen – auch nicht als Administrator.
    const bis = aufbewahrenBis(typ?.archiv, m);
    if (inFrist(bis)) return { ok: false as const, status: 409, grund: t('meldungen.dienst.aufbewahrungspflicht-bis-vorher', { datumText: datumText(bis!) }), fremd: [], zuordnungen: [], emails: [], aufbewahrenBis: bis };
    const typen = rueck.length ? alleTypen ?? await this.repo.listeTypen() : [];
    // Eine Rolle darf weg, auch wenn Benutzer sie haben: deren Zuordnung fällt weg.
    const benutzerTyp = typ?.system === 'rolle' ? typen.find((t) => t.system === 'benutzer') : undefined;
    const zuordnungen = benutzerTyp ? rueck.filter((r) => r.quelleTypId === benutzerTyp.id && r.feldKey === 'rollen') : [];
    // Post (#58, #192) verweist auf jede Mappe; sie hält das Löschen nicht auf, der Verweis entfällt.
    const emailTyp = typen.find((t) => t.system === 'post');
    const emails = emailTyp ? rueck.filter((r) => r.quelleTypId === emailTyp.id && r.feldKey === 'bezug') : [];
    const fremd = rueck.filter((r) => r.quelleId !== m.id && !zuordnungen.includes(r) && !emails.includes(r));
    if (fremd.length) {
      const ids = new Set(fremd.map((r) => r.quelleId));
      return { ok: false as const, status: 409, grund: t('meldungen.dienst.auf-diese-mappe-verweisen', { anzahl: ids.size }), fremd, zuordnungen, emails, benutzerTyp, emailTyp };
    }
    return { ok: true as const, status: 200, grund: undefined, fremd, zuordnungen, emails, benutzerTyp, emailTyp };
  }

  /**
   * Mehrere Mappen löschen (#150): je Mappe das Recht D am Mappentyp; Verweise innerhalb der Auswahl halten
   * nicht auf. `probe`: nur zählen, nichts löschen. Was nicht geht, steht mit Grund in `ausgelassen`.
   */
  async loescheMappen(e: unknown, benutzerId: string, z: Zugriff, quelle?: Ausloeser): Promise<{ mappen: number; dokumente: number; geloescht: number; ausgelassen: Array<{ id: string; titel: string; grund: string }> }> {
    const x = (e ?? {}) as { ids?: unknown; probe?: unknown };
    const ids = [...new Set((Array.isArray(x.ids) ? x.ids : []).map(String).filter(istUuid))];
    if (!ids.length) throw new Fachfehler(422, t('meldungen.dienst.keine-mappen-ausgewaehlt'));
    if (ids.length > MAX_AUSWAHL) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-mappen-auf-einmal', { MAX_AUSWAHL: MAX_AUSWAHL.toLocaleString(gebietsschema()) }));
    const auswahl = new Set(ids);
    const ausgelassen: Array<{ id: string; titel: string; grund: string }> = [];
    const kandidaten: Mappe[] = [];
    let dokumente = 0;
    for (const id of ids) {
      const m = await this.repo.holeMappe(id);
      if (!m) { ausgelassen.push({ id, titel: '', grund: t('meldungen.dienst.gibt-es-nicht-mehr') }); continue; }
      const r = await this.rechteAn(z, m);
      if (!r.R) { ausgelassen.push({ id, titel: NICHT_SICHTBAR, grund: t('meldungen.dienst.nicht-sichtbar') }); continue; }
      if (!r.D) { ausgelassen.push({ id, titel: m.titel ?? '', grund: t('meldungen.dienst.kein-recht-zum-loeschen') }); continue; }
      // Teile (#1031) gehen mit und halten nicht auf.
      const rueck = await this.repo.rueckverweise(id);
      const teile = new Set(await this.teileAus(rueck, id));
      const p = await this.loeschPruefung(m, z.typen.get(m.typId), rueck.filter((v) => !auswahl.has(v.quelleId) && !teile.has(v.quelleId)));
      if (!p.ok) { ausgelassen.push({ id, titel: m.titel ?? '', grund: p.fremd.length ? t('meldungen.dienst.es-wird-noch-auf') : p.grund }); continue; }
      kandidaten.push(m);
      dokumente += (await this.repo.listeDokumente(id)).length;
    }
    if (x.probe === true) return { mappen: kandidaten.length, dokumente, geloescht: 0, ausgelassen };
    // Verweise innerhalb der Auswahl: in Runden, bis keine Mappe mehr dazukommt.
    let offen = kandidaten;
    let geloescht = 0;
    while (offen.length) {
      const rest: Mappe[] = [];
      for (const m of offen) {
        // Teile (#1031), die schon mit ihrer übergeordneten Mappe gegangen sind, zählen als gelöscht.
        if (!(await this.repo.holeMappe(m.id))) { geloescht++; continue; }
        try { await this.loescheMappe(m.id, benutzerId, z, { ...liesAnlass(x), ausloeser: quelle, weg: 'mehrere' }); geloescht++; }
        catch (err) {
          if (err instanceof Fachfehler && err.status === 409) rest.push(m);
          else ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: (err as Error).message });
        }
      }
      if (rest.length === offen.length) { for (const m of rest) ausgelassen.push({ id: m.id, titel: m.titel ?? '', grund: t('meldungen.dienst.es-wird-noch-auf') }); break; }
      offen = rest;
    }
    return { mappen: kandidaten.length, dokumente, geloescht, ausgelassen };
  }

  async loescheMappe(id: string, benutzerId: string | null = null, z?: Zugriff, anlass?: Anlass): Promise<void> {
    if (z) await this.pruefeRecht(z, id, 'D');
    const m = await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    // Vorgaben (#1038): Ein Paket löscht keine Vorgabe eines anderen Pakets.
    if (z?.paket?.id && fremdeVorgabe(m, z.paket.id)) throw new Fachfehler(403, t('meldungen.dienst.vorgabe-fremdes-paket', { titel: m.titel || m.id }));
    const typ = await this.repo.holeTyp(m.typId);
    const rueckverweise = await this.repo.rueckverweise(id);
    // Teile (#1031): Hat die Mappe Teile (Rechnungspositionen einer Rechnung), gehen sie mit – in einem Vorgang.
    const teile = await this.teileAus(rueckverweise, id);
    if (teile.length) { await this.loescheMitTeilen({ m, typ, rueck: rueckverweise, teilIds: teile }, benutzerId, z, anlass); return; }
    const p = await this.loeschPruefung(m, typ, rueckverweise);
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const { zuordnungen, emails, benutzerTyp, emailTyp } = p;
    // Löschprotokoll (#470): was mit der Mappe geht, bevor es weg ist.
    const vorher = await this.lebendInhalt([m]);
    for (const z of zuordnungen) {
      const b = await this.repo.holeMappe(z.quelleId);
      if (b) await this.schreibeSystemMappe(benutzerTyp!, b.id, { rollen: alsListe(b.werte.rollen).filter((r) => r !== id) }, benutzerId);
    }
    for (const e of emails) {
      const x = await this.repo.holeMappe(e.quelleId);
      if (x) await this.schreibeSystemMappe(emailTyp!, x.id, { bezug: alsListe(x.werte.bezug).filter((b) => b !== id) }, benutzerId);
    }
    const korb = await this.papierkorbTage() > 0;
    if (korb) await this.legeInPapierkorb(id, typ, benutzerId);
    else await this.loescheMappeIntern(id, typ, benutzerId);
    await this.protokolliere(this.mappenEintraege(vorher, { schritt: korb ? 'papierkorb' : 'endgueltig', weg: anlass?.weg ?? 'einzeln', verweise: { [id]: zuordnungen.length + emails.length } }),
      await this.loeschKontext(benutzerId, anlass));
  }

  /** Ids der Teile (#1031) unter den Mappen, die auf `id` verweisen – über das Feld, über das sie zu ihr gehören. */
  async teileAus(rueck: Rueckverweis[], id: string): Promise<string[]> {
    if (!rueck.length) return [];
    const typen = new Map((await this.repo.listeTypen()).map((x) => [x.id, x] as const));
    return [...new Set(rueck.filter((r) => r.quelleId !== id && istTeilVerweis(typen.get(r.quelleTypId), r.feldKey)).map((r) => r.quelleId))];
  }

  /**
   * Mappe mit ihren Teilen löschen (#1031): Die Teile gehen mit wie bei „mit verknüpften Mappen löschen“ – ein Vorgang im
   * Papierkorb (Id der Mappe), wiederhergestellt ebenso. Rechte werden nie übergangen (Ergänzung Sicherheit): Darf die
   * Person nicht jeden Teil lesen und löschen, lehnt Ablago ab und nennt nur die Anzahl. Jeder Teil durchläuft dieselbe
   * Prüfung wie beim einzelnen Löschen (Aufbewahrungsfrist, Verweise anderer Mappen). Papierkorb, Historie, Ereignisse und
   * Löschprotokoll in einer Transaktion; ohne Papierkorb danach endgültig.
   */
  private async loescheMitTeilen(x: { m: Mappe; typ: Mappentyp | undefined; rueck: Rueckverweis[]; teilIds: string[] }, benutzerId: string | null, z: Zugriff | undefined, anlass?: Anlass) {
    const { m, typ, rueck, teilIds } = x;
    const teile = await this.repo.holeMappen(teilIds);
    if (z && teile.length) {
      const r = await this.teile.rechte.rechteAnVielen(z, teile);
      const ohne = teile.filter((y) => !r.get(y.id)?.R || !r.get(y.id)?.D).length;
      if (ohne) throw new Fachfehler(403, t('meldungen.teile.loeschen-ohne-recht', { anzahl: ohne }));
    }
    const weg = new Set([m.id, ...teile.map((y) => y.id)]);
    const alleTypen = await this.repo.listeTypen();
    const p = await this.loeschPruefung(m, typ, rueck.filter((r) => !weg.has(r.quelleId)), alleTypen);
    if (!p.ok) throw new Fachfehler(p.status, p.grund, p.fremd.length ? { rueckverweise: p.fremd } : undefined);
    const pruefungen = [{ m, p }];
    for (const teil of teile) {
      const pt = await this.loeschPruefung(teil, alleTypen.find((y) => y.id === teil.typId), (await this.repo.rueckverweise(teil.id)).filter((r) => !weg.has(r.quelleId)), alleTypen);
      if (!pt.ok) throw new Fachfehler(pt.status, t('meldungen.teile.teil-nicht-loeschbar', { titel: teil.titel || t('meldungen.dienst.ohne-titel'), grund: pt.grund }));
      pruefungen.push({ m: teil, p: pt });
    }
    const alle = [m, ...teile];
    const vorher = await this.lebendInhalt(alle);
    const korb = await this.papierkorbTage() > 0;
    const kontext = await this.loeschKontext(benutzerId, anlass);
    const vorgang = m.id;
    const text = t('meldungen.teile.mit-teilen-geloescht', { anzahl: teile.length });
    await this.kern.inEinemZug(async () => {
      // Rollen-Zuordnungen und Post, die auf eine der Mappen zeigt, verlieren den Verweis – wie beim einzelnen Löschen.
      const verweise: Record<string, number> = {};
      for (const { m: y, p: q } of pruefungen) {
        for (const zu of q.zuordnungen) {
          const b = await this.repo.holeMappe(zu.quelleId);
          if (b) await this.schreibeSystemMappe(q.benutzerTyp!, b.id, { rollen: alsListe(b.werte.rollen).filter((r) => r !== y.id) }, benutzerId);
        }
        for (const e of q.emails) {
          const y = await this.repo.holeMappe(e.quelleId);
          if (y) await this.schreibeSystemMappe(q.emailTyp!, y.id, { bezug: alsListe(y.werte.bezug).filter((b) => b !== y.id) }, benutzerId);
        }
        verweise[y.id] = q.zuordnungen.length + q.emails.length;
      }
      await this.repo.legeVorgangInPapierkorb(alle.map((y) => y.id), benutzerId, vorgang, {});
      await this.repo.historieSchreibe(alle.map((y) => ({ mappeId: y.id, benutzerId, art: 'papierkorb' as const, daten: { vorgang, text, ...(y.id === m.id ? {} : { start: m.id }) } })));
      for (const y of alle) await this.ereignis('mappe.geloescht', { mappe: y.id, typ: y.typId }, benutzerId);
      await this.protokolliere(this.mappenEintraege(vorher, { schritt: 'papierkorb', weg: 'teile', vorgang, startId: m.id, verweise }), kontext);
    });
    for (const typId of new Set(alle.map((y) => y.typId))) {
      const tt = alleTypen.find((y) => y.id === typId);
      if (tt?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(tt);
    }
    if (!korb) await this.teile.papierkorb.leere(alle.map((y) => y.id), benutzerId, false, { weg: 'teile', kontext });
  }

  /** In den Papierkorb (#43): eindeutige Werte werden frei, Dateien bleiben bis zum Leeren. */
  private async legeInPapierkorb(id: string, typ: Mappentyp | undefined, von: string | null) {
    await this.repo.legeInPapierkorb(id, von);
    await this.notiere(id, von, 'papierkorb');
    await this.ereignis('mappe.geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
  }

  async loescheMappeIntern(id: string, typ: Mappentyp | undefined, von: string | null = null) {
    const dokumente = await this.repo.listeDokumente(id);
    await this.repo.loescheMappe(id);
    await this.notiere(id, von, 'endgueltig');
    await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typ?.id ?? null }, von);
    if (typ?.felder.some((f) => f.eindeutig)) await this.pruefeUnpassende(typ);
    for (const sha of new Set(dokumente.map((d) => d.sha256))) await this.raeumeAuf(sha);
  }
}
