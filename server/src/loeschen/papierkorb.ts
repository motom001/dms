/**
 * Papierkorb (#43, #344, #424, #936, #1078 aus dienst.ts): Aufbewahrung, Einträge und Dokumente im Papierkorb,
 * wiederherstellen, endgültig löschen, leeren und stündlich aufräumen – jeder Schritt im Löschprotokoll. Schicht 3 –
 * Teile und Anschluss wie `LoeschenDienst` (loeschen.dienst.ts).
 */
import { Fachfehler } from '../fehler';
import type { Anlass, Kern, Loeschprotokoll, ProtokollMappe, ProtokollTeil, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import { protokoll } from '../protokoll';
import type { DokumentImPapierkorb, PapierkorbEintrag, Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';
import { aufbewahrenBis, datumText, gesperrt, stichtagName } from '../../../shared/src/archiv';
import type { Ausloeser, LoeschDokument, LoeschEintrag, LoeschKontext, Loeschweg } from '../../../shared/src/loeschprotokoll';
import type { Dokument, Mappentyp } from '../../../shared/src/model';
import { istTeiltyp, uebergeordneteId } from '../../../shared/src/teile';
import type { LoeschenAnschluss, LoeschenTeile } from './loeschen.dienst';
import type { LoeschprotokollVerwaltung } from './loeschprotokoll';
import type { MitVerknuepften } from './mit-verknuepften';

/** Dokument im Papierkorb mit Mappe und Register (#344). */
export interface DokumentImKorb extends DokumentImPapierkorb { art: 'dokument'; typId: string; mappeTitel: string; register: string; mappe: 'da' | 'papierkorb' | 'weg' }
/** Aufgelöste Post im Papierkorb (#936): in welche Mappe; `da` = die Mappe gibt es noch. */
export interface AufgeloestIn { id: string; typId: string; titel: string; da: boolean }

export class Papierkorb {
  constructor(private readonly kern: Kern, private readonly teile: LoeschenTeile, private readonly anschluss: LoeschenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get konten() { return this.anschluss.konten(); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.anschluss.ereignis(...a); }
  private aktualisiereTitel(ids: string[]) { return this.anschluss.aktualisiereTitel(ids); }
  private papierkorbTage(): Promise<number> { return this.kern.papierkorbTage(); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private historieTage() { return this.teile.historie.historieTage(); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.teile.rechte.pruefeRecht(...a); }
  private passungFuer(typ: Mappentyp, ids: string[]) { return this.teile.passung.passungFuer(typ, ids); }
  private raeumeAuf(sha256: string) { return this.teile.dokumente.raeumeAuf(sha256); }
  private neueDateien(docs: Dokument[]) { this.teile.dokumente.neueDateien(docs); }
  private beruehre(mappeId: string, typ: Mappentyp | undefined, benutzerId: string | null) { return this.teile.versionen.beruehre(mappeId, typ, benutzerId); }
  private korbAlsInhalt(...a: Parameters<LoeschprotokollVerwaltung['korbAlsInhalt']>) { return this.teile.protokoll.korbAlsInhalt(...a); }
  private loeschprotokollJahre() { return this.teile.protokoll.loeschprotokollJahre(); }
  private verbindeWieder(...a: Parameters<MitVerknuepften['verbindeWieder']>) { return this.teile.verknuepft.verbindeWieder(...a); }
  private dokEintraege(liste: LoeschDokument[], x: Parameters<Loeschprotokoll['dokEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.dokEintraege(liste, x); }
  private wiederEintrag(e: PapierkorbEintrag, typ: Mappentyp | undefined, vorgang: string | null): ProtokollTeil { return this.kern.loeschprotokoll.wiederEintrag(e, typ, vorgang); }
  private letzteSchritte(ids: string[]): Promise<Map<string, LoeschEintrag>> { return this.kern.loeschprotokoll.letzteSchritte(ids); }
  private mappenInfo(mappeIds: string[], frueher: Map<string, LoeschEintrag>) { return this.kern.loeschprotokoll.mappenInfo(mappeIds, frueher); }
  private loeschKontext(von: string | null, anlass: Anlass = {}): Promise<LoeschKontext> { return this.kern.loeschprotokoll.kontext(von, anlass); }
  private mappenEintraege(liste: ProtokollMappe[], x: Parameters<Loeschprotokoll['mappenEintraege']>[1]): ProtokollTeil[] { return this.kern.loeschprotokoll.mappenEintraege(liste, x); }
  private protokolliere(teile: ProtokollTeil[], k: LoeschKontext, nachGrund = false) { return this.kern.loeschprotokoll.schreibe(teile, k, nachGrund); }

  /** Aufbewahrung ändern. 0 schaltet den Papierkorb aus und leert ihn sofort. */
  async setzePapierkorbTage(eingabe: unknown, von?: string | null): Promise<{ tage: number; geleert: number }> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.der-papierkorb-ist-nicht'));
    const tage = Number(eingabe);
    if (!Number.isInteger(tage) || tage < 0 || tage > 3650) throw new Fachfehler(422, t('meldungen.dienst.bitte-eine-ganze-zahl-2'));
    await this.einstellungen.schreibe('papierkorb', { tage });
    protokoll.modul('werkbank').info(tage ? 'Aufbewahrung im Papierkorb geändert' : 'Papierkorb ausgeschaltet', { tage });
    const aus = { weg: 'ausgeschaltet' as const, kontext: await this.loeschKontext(von ?? null) };
    const geleert = tage ? await this.raeumePapierkorbAuf() : await this.leere((await this.repo.papierkorb()).map((e) => e.id), von ?? null, false, aus) + await this.leereDokumente((await this.repo.papierkorbDokumente()).map((d) => d.id), aus);
    return { tage, geleert };
  }

  /** Ablage: was ich gelöscht habe. Werkbank (alle): was alle gelöscht haben. */
  async papierkorb(ich: { id: string; rolle: string }, alle = false): Promise<Array<PapierkorbEintrag & { aufgeloestIn?: AufgeloestIn }>> {
    return this.mitAufloesung(await this.repo.papierkorb(alle && ich.rolle === 'admin' ? {} : { von: ich.id }));
  }

  /**
   * Aufgelöste Post (#936): „Aufgelöst in <Typ> <Titel>“ mit Link. `da` = die Mappe gibt es noch (sonst nur Typ und Titel,
   * soweit bekannt). Nur für Post – andere Mappen werden nie aufgelöst.
   */
  private async mitAufloesung<T extends PapierkorbEintrag>(liste: T[]): Promise<Array<T & { aufgeloestIn?: AufgeloestIn }>> {
    const postTyp = (await this.repo.listeTypen()).find((x) => x.system === 'post');
    const posten = postTyp ? liste.filter((e) => e.typId === postTyp.id).map((e) => e.id) : [];
    if (!posten.length) return liste;
    const auf = await this.repo.aufgeloesteIn(posten);
    if (!auf.size) return liste;
    const bezuege = await this.repo.bezuege([...new Set([...auf.values()].map((a) => a.ziel))]);
    return liste.map((e) => {
      const a = auf.get(e.id);
      if (!a) return e;
      const b = bezuege.get(a.ziel);
      return { ...e, aufgeloestIn: { id: a.ziel, typId: b?.typId ?? a.zielTyp, titel: b?.titel ?? '', da: !!b } };
    });
  }

  /**
   * Einzelne Dokumente im Papierkorb (#344), mit Mappe und Register zum Anzeigen.
   * mappe: „da“ (wiederherstellbar), „papierkorb“ (erst die Mappe wiederherstellen) oder „weg“.
   */
  async papierkorbDokumente(ich: { id: string; rolle: string }, alle = false): Promise<DokumentImKorb[]> {
    const liste = await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id });
    return this.mitMappe(liste);
  }

  private async mitMappe(liste: DokumentImPapierkorb[]): Promise<DokumentImKorb[]> {
    if (!liste.length) return [];
    const ids = [...new Set(liste.map((d) => d.mappeId))];
    const bezuege = await this.repo.bezuege(ids);
    const imKorb = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e]));
    const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
    return liste.map((d) => {
      const b = bezuege.get(d.mappeId);
      const k = imKorb.get(d.mappeId);
      const typId = b?.typId ?? k?.typId ?? '';
      const typ = typen.get(typId);
      return {
        ...d, art: 'dokument' as const, typId, mappeTitel: b?.titel ?? k?.titel ?? '',
        register: typ?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey,
        mappe: b ? 'da' as const : k ? 'papierkorb' as const : 'weg' as const,
      };
    });
  }

  private async dokEintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeDokumentAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-liegt-nicht'));
    return e;
  }

  /** Dokument zurück in sein Register (#344). Rechte: wer es gelöscht hat (und die Mappe noch bearbeiten darf) oder ein Administrator. */
  async stelleDokumentWiederHer(id: string, ich: { id: string; rolle: string }, z: Zugriff | undefined, alle = false, quelle?: Ausloeser) {
    const e = await this.dokEintrag(id, ich, alle);
    const [x] = await this.mitMappe([e]);
    if (x.mappe === 'papierkorb') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-liegt-selbst', { wert: x.mappeTitel || t('meldungen.dienst.ohne-titel-2') }));
    if (x.mappe === 'weg') throw new Fachfehler(409, t('meldungen.dienst.die-mappe-dieses-dokuments'));
    if (!(alle && ich.rolle === 'admin')) await this.pruefeRecht(z, e.mappeId, 'U');
    const typ = (await this.repo.holeTyp(x.typId))!;
    if (!typ.register.some((r) => r.key === e.registerKey && r.art === 'dokumente')) throw new Fachfehler(409, t('meldungen.dienst.das-register-gibt-es', { register: x.register }));
    const inhalt = (await this.repo.papierkorbDokumentInhalt([id]))[0];
    await this.repo.stelleDokumentWiederHer(id);
    await this.notiere(e.mappeId, ich.id, 'dokument_wiederhergestellt', { dokument: e.name, register: x.register });
    if (inhalt) await this.protokolliere(this.dokEintraege(inhalt.dokumente.slice(0, 1), { ...(await this.mappenInfo([e.mappeId], new Map()))(e.mappeId, id), schritt: 'wiederhergestellt', weg: 'dokument' }),
      await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.beruehre(e.mappeId, typ, ich.id);
    this.neueDateien([(await this.repo.holeDokument(id))!]);
    protokoll.modul('ablage').info('Dokument wiederhergestellt', { dokument: e.name, id, mappe: e.mappeId });
    return { dokument: (await this.repo.holeDokument(id))!, typId: x.typId };
  }

  /** Dokumente endgültig löschen (ohne Rechteprüfung); Archivmodus der Mappe gilt weiter. */
  private async leereDokumente(ids: string[], wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    if (!ids.length) return 0;
    const inhalt = await this.repo.papierkorbDokumentInhalt(ids);
    const dateien = await this.repo.leereDokumentPapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    // Löschprotokoll (#470): je Dokument und Version; Mappe, Typ und Grund vom Schritt „in den Papierkorb“.
    const frueher = await this.letzteSchritte(inhalt.map((x) => x.id));
    const mappen = await this.mappenInfo(inhalt.map((x) => x.mappeId), frueher);
    const kontext = wie.kontext ?? await this.loeschKontext(null, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(inhalt.flatMap((x) => this.dokEintraege(x.dokumente, { ...mappen(x.mappeId, x.id), schritt: 'endgueltig', weg: wie.weg })), kontext, true);
    return ids.length;
  }

  async loescheDokumentEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    for (const id of ids) await this.dokEintrag(id, ich, alle);
    const n = await this.leereDokumente(ids, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Dokumente aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Eintrag, den dieser Benutzer sehen darf (eigener oder als Administrator in der Werkbank); sonst 404. */
  private async eintrag(id: string, ich: { id: string; rolle: string }, alle: boolean) {
    const e = await this.repo.holeAusPapierkorb(id);
    if (!e || !(e.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-liegt-nicht'));
    return e;
  }

  async papierkorbEintrag(id: string, ich: { id: string; rolle: string }, alle = false) { return (await this.mitAufloesung([await this.eintrag(id, ich, alle)]))[0]; }

  /**
   * Wiederherstellen. Verweise auf Mappen, die es nicht mehr gibt, und eindeutige Werte, die
   * inzwischen eine andere Mappe hat, lassen die Mappe „nicht passen“: Sie erscheint im Eingang.
   */
  async stelleWiederHer(id: string, ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser) {
    const e = await this.eintrag(id, ich, alle);
    // Aufgelöste Post (#936): Dokumente und Historie liegen in der neuen Mappe – zurück geht es nur, indem man sie löscht.
    const [mitAuf] = await this.mitAufloesung([e]);
    if (mitAuf.aufgeloestIn) throw new Fachfehler(409, t('meldungen.dienst.aufgeloest-nicht-wiederherstellen', { titel: mitAuf.aufgeloestIn.titel || t('meldungen.dienst.ohne-titel-2') }), { aufgeloestIn: mitAuf.aufgeloestIn });
    const typ = await this.repo.holeTyp(e.typId);
    if (!typ) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-dieser-mappe'));
    // Teile (#1031): Ein Teil kommt nur mit seiner übergeordneten Mappe zurück, solange die im Papierkorb liegt …
    const eltern = istTeiltyp(typ) ? uebergeordneteId(typ, e.werte) : null;
    if (eltern && await this.repo.holeAusPapierkorb(eltern)) throw new Fachfehler(409, t('meldungen.teile.erst-uebergeordnete'));
    // … und die übergeordnete Mappe bringt ihre Teile mit, die mit ihr gegangen sind.
    const teile = await this.teileImKorb([e]);
    if (teile.length) return this.stelleMitTeilenWiederHer({ e, typ, teile }, ich, alle, quelle);
    const r = await this.repo.stelleWiederHer(id);
    // Beim Löschen mit verknüpften Mappen entfernte Verweise (#424) kommen mit.
    const zurueck = e.entkoppelt.length ? await this.verbindeWieder(id, e.entkoppelt, ich.id) : { wieder: 0, entfallen: 0 };
    const verweiseEntfallen = r.verweiseEntfallen + zurueck.entfallen;
    await this.notiere(id, ich.id, 'wiederhergestellt', verweiseEntfallen ? { verweiseEntfallen } : undefined);
    await this.protokolliere([this.wiederEintrag(e, typ, e.vorgang)], await this.loeschKontext(ich.id, { ausloeser: quelle }));
    await this.aktualisiereTitel([id]);
    await this.passungFuer(typ, [id]);
    if (typ.system === 'benutzer') await this.konten?.wiederda(id, ich.id);
    const m = (await this.repo.holeMappe(id))!;
    protokoll.modul('ablage').info('Mappe wiederhergestellt', { typ: typ.name, titel: m.titel, id, passt: m.passt !== false || undefined, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen };
  }

  /**
   * Teile (#1031) im Papierkorb, die mit einer dieser Mappen gegangen sind: gleicher Vorgang (die Id der übergeordneten
   * Mappe) und sie gehören zu ihr.
   */
  private async teileImKorb(eltern: PapierkorbEintrag[]): Promise<PapierkorbEintrag[]> {
    const ids = new Set(eltern.map((e) => e.id));
    if (!eltern.some((e) => e.vorgang === e.id)) return [];
    const typen = new Map((await this.repo.listeTypen()).map((x) => [x.id, x] as const));
    return (await this.repo.papierkorb()).filter((k) => !ids.has(k.id) && !!k.vorgang && ids.has(k.vorgang) && uebergeordneteId(typen.get(k.typId), k.werte) === k.vorgang);
  }

  /**
   * Übergeordnete Mappe samt ihren Teilen wiederherstellen (#1031): Rechte wie beim einzelnen Wiederherstellen – jeder
   * Teil muss für die Person wiederherstellbar sein (selbst gelöscht oder als Administrator in der Werkbank), sonst lehnt
   * Ablago ab und nennt die Anzahl. Wiederherstellen, Historie, Ereignisse und Löschprotokoll in einer Transaktion.
   */
  private async stelleMitTeilenWiederHer(x: { e: PapierkorbEintrag; typ: Mappentyp; teile: PapierkorbEintrag[] }, ich: { id: string; rolle: string }, alle: boolean, quelle?: Ausloeser) {
    const { e, typ, teile } = x;
    const ohne = teile.filter((k) => !(k.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))).length;
    if (ohne) throw new Fachfehler(403, t('meldungen.teile.wiederherstellen-ohne-recht', { anzahl: ohne }));
    const typen = new Map((await this.repo.listeTypen()).map((y) => [y.id, y] as const));
    const fehlt = teile.find((k) => !typen.has(k.typId));
    if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-mappentyp-von-gibt', { wert: fehlt.titel || t('meldungen.dienst.ohne-titel') }));
    const eintraege = [e, ...teile];
    const ids = eintraege.map((y) => y.id);
    const kontext = await this.loeschKontext(ich.id, { ausloeser: quelle });
    const { verweiseEntfallen: entfallen } = await this.kern.inEinemZug(async () => {
      const r = await this.repo.stelleMehrereWiederHer(ids);
      await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: ich.id, art: 'wiederhergestellt' as const, daten: { vorgang: e.id } })));
      for (const y of eintraege) await this.ereignis('mappe.wiederhergestellt', { mappe: y.id, typ: y.typId }, ich.id);
      await this.protokolliere(eintraege.map((y) => this.wiederEintrag(y, typen.get(y.typId), e.id)), kontext);
      return r;
    });
    // Beim Löschen mit verknüpften Mappen entfernte Verweise (#424) kommen mit.
    const zurueck = e.entkoppelt.length ? await this.verbindeWieder(e.id, e.entkoppelt, ich.id) : { wieder: 0, entfallen: 0 };
    await this.aktualisiereTitel(ids);
    for (const typId of new Set(eintraege.map((y) => y.typId))) await this.passungFuer(typen.get(typId)!, eintraege.filter((y) => y.typId === typId).map((y) => y.id));
    const m = (await this.repo.holeMappe(e.id))!;
    const verweiseEntfallen = entfallen + zurueck.entfallen;
    protokoll.modul('ablage').info('Mappe mit ihren Teilen wiederhergestellt', { typ: typ.name, id: e.id, teile: teile.length, verweiseEntfallen: verweiseEntfallen || undefined });
    return { mappe: m, verweiseEntfallen, teile: teile.length };
  }

  /** Endgültig löschen (ohne Rechteprüfung): Dateien, an denen nichts mehr hängt, und Konten von Benutzer-Mappen. */
  async leere(ids: string[], von: string | null = null, streng = false, wie: { weg: Loeschweg; kontext?: LoeschKontext } = { weg: 'papierkorb' }): Promise<number> {
    // Archivmodus (#212): Mappen in der Frist bleiben im Papierkorb (lagen dort schon vor dem Einschalten).
    if (ids.length) {
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t] as const));
      const korb = (await this.repo.papierkorb()).filter((e) => ids.includes(e.id));
      // Läuft die Frist noch nicht (#1051), bleibt die Mappe genauso.
      const geschuetzt = korb.filter((e) => gesperrt(typen.get(e.typId)?.archiv, e));
      if (geschuetzt.length && streng) {
        const erste = geschuetzt[0], typ = typen.get(erste.typId), bis = aufbewahrenBis(typ?.archiv, erste), wert = erste.titel || t('meldungen.dienst.die-mappe');
        throw new Fachfehler(409, bis ? t('meldungen.dienst.aufbewahrungspflicht-bis-vorher-2', { datumText: datumText(bis), wert }) : t('meldungen.dienst.aufbewahrungspflicht-offen-endgueltig', { feld: stichtagName(typ), wert }));
      }
      ids = ids.filter((id) => !geschuetzt.some((e) => e.id === id));
    }
    if (!ids.length) return 0;
    await this.repo.historieSchreibe(ids.map((mappeId) => ({ mappeId, benutzerId: von, art: 'endgueltig' as const })));
    {
      const typVon = new Map((await this.repo.papierkorb()).filter((e) => ids.includes(e.id)).map((e) => [e.id, e.typId] as const));
      for (const id of ids) await this.ereignis('mappe.endgueltig_geloescht', { mappe: id, typ: typVon.get(id) ?? null }, von);
    }
    const benutzerTyp = (await this.repo.listeTypen()).find((t) => t.system === 'benutzer');
    const benutzer = benutzerTyp ? (await this.repo.papierkorb({ typId: benutzerTyp.id })).filter((e) => ids.includes(e.id)).map((e) => e.id) : [];
    // Löschprotokoll (#470): Inhalt vor dem Leeren; Grund vom Schritt „in den Papierkorb“.
    const inhalt = await this.repo.papierkorbInhalt(ids);
    const dateien = await this.repo.leerePapierkorb(ids);
    for (const sha of dateien) await this.raeumeAuf(sha);
    const kontext = wie.kontext ?? await this.loeschKontext(von, { ausloeser: wie.weg === 'ablauf' ? 'automatisch' : undefined });
    await this.protokolliere(this.mappenEintraege(await this.korbAlsInhalt(inhalt), { schritt: 'endgueltig', weg: wie.weg, verweise: Object.fromEntries(inhalt.map((k) => [k.id, k.entkoppelt])) }), kontext, true);
    // Einzeln gelöschte Dokumente dieser Mappen (#344) gehen mit – ohne Mappe lassen sie sich nicht mehr wiederherstellen.
    await this.leereDokumente((await this.repo.papierkorbDokumente({ mappeIds: ids })).map((d) => d.id), { weg: wie.weg, kontext });
    for (const id of benutzer) await this.konten?.endgueltig(id);
    return ids.length;
  }

  /** Einzelne Mappen endgültig löschen: eigene oder (in der Werkbank) alle. */
  async loescheEndgueltig(ids: string[], ich: { id: string; rolle: string }, alle = false, quelle?: Ausloeser): Promise<number> {
    const eintraege: PapierkorbEintrag[] = [];
    for (const id of ids) eintraege.push(await this.eintrag(id, ich, alle));
    // Teile (#1031), die mit einer dieser Mappen gegangen sind, gehen auch endgültig mit – sonst blieben sie ohne Mappe zurück.
    const teile = (await this.teileImKorb(eintraege)).filter((k) => !ids.includes(k.id));
    const ohne = teile.filter((k) => !(k.geloeschtVon === ich.id || (alle && ich.rolle === 'admin'))).length;
    if (ohne) throw new Fachfehler(403, t('meldungen.teile.loeschen-ohne-recht', { anzahl: ohne }));
    ids = [...ids, ...teile.map((k) => k.id)];
    const n = await this.leere(ids, ich.id, true, { weg: 'papierkorb', kontext: await this.loeschKontext(ich.id, { ausloeser: quelle }) });
    if (n) protokoll.modul('ablage').info('Aus dem Papierkorb endgültig gelöscht', { anzahl: n });
    return n;
  }

  /** Papierkorb leeren: eigener (Ablage) oder ganz (Werkbank). */
  async leerePapierkorb(ich: { id: string; rolle: string }, alle = false, wie: { weg?: 'leeren' | 'abmelden'; quelle?: Ausloeser } = {}): Promise<number> {
    const w = { weg: wie.weg ?? 'leeren' as const, kontext: await this.loeschKontext(ich.id, { ausloeser: wie.quelle }) };
    const n = await this.leere((await this.papierkorb(ich, alle)).map((e) => e.id), ich.id, false, w)
      + await this.leereDokumente((await this.repo.papierkorbDokumente(alle && ich.rolle === 'admin' ? {} : { von: ich.id })).map((d) => d.id), w);
    if (n) protokoll.modul('ablage').info(alle ? 'Papierkorb aller Benutzer geleert' : 'Papierkorb geleert', { anzahl: n });
    return n;
  }

  /** Abgelaufenes endgültig löschen; läuft stündlich. */
  async raeumePapierkorbAuf(jetzt = Date.now()): Promise<number> {
    const tage = await this.papierkorbTage();
    const vor = new Date(jetzt - tage * 24 * 60 * 60 * 1000).toISOString();
    const n = await this.leere((await this.repo.papierkorb(tage ? { vor } : {})).map((e) => e.id), null, false, { weg: 'ablauf' });
    if (n) protokoll.modul('system').info('Abgelaufene Mappen aus dem Papierkorb gelöscht', { anzahl: n, tage });
    const nd = await this.leereDokumente((await this.repo.papierkorbDokumente(tage ? { vor } : {})).map((d) => d.id), { weg: 'ablauf' });
    if (nd) protokoll.modul('system').info('Abgelaufene Dokumente aus dem Papierkorb gelöscht', { anzahl: nd, tage });
    // Historie endgültig gelöschter Mappen nach ihrer Frist (#57).
    const ht = await this.historieTage();
    const weg = await this.repo.historieAufraeumen(new Date(jetzt - ht * 24 * 60 * 60 * 1000).toISOString());
    if (weg) protokoll.modul('system').info('Historie endgültig gelöschter Mappen entfernt', { eintraege: weg, tage: ht });
    // Löschprotokoll (#470): eigene Aufbewahrung in Jahren.
    const lj = await this.loeschprotokollJahre();
    const lweg = await this.repo.loeschprotokollAufraeumen(new Date(jetzt - lj * 365.25 * 24 * 60 * 60 * 1000).toISOString());
    if (lweg) protokoll.modul('system').info('Alte Einträge des Löschprotokolls entfernt', { eintraege: lweg, jahre: lj });
    return n;
  }
}
