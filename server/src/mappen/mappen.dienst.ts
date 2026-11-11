/**
 * Mappen (#1074 aus dienst.ts): anlegen, ändern und holen, Notizen, Favoriten und „gesehen“, persönliche Einstellungen.
 * Beim Anlegen und Ändern laufen die sofortigen Empfänger über den Anschlusspunkt `mappeGeaendert` des Kerns (#962).
 * Schicht 2 – bekommt den Kern, nicht den ganzen Dienst.
 */
import { istTeilVerweis } from '../../../shared/src/teile';
import { randomUUID } from 'node:crypto';
import { aufbewahrenBis, datumText, laeuftNochNicht, stichtagName } from '../../../shared/src/archiv';
import type { Datenschutz } from '../../../shared/src/auskunft';
import { alsText } from '../../../shared/src/markdown';
import { type Aufgabe, darfErstellen, type Dokument, geschuetzteFelder, type Mappe, type Mappenkonflikt, type Mappentyp, type Notiz, NOTIZ_MAX, verweiseVon, type Werte } from '../../../shared/src/model';
import { kreisVon } from '../../../shared/src/nummernkreis';
import { gebietsschema } from '../../../shared/src/sprache';
import { fremdeVorgabe, teileVorgabe, type VorgabeHerkunft } from '../../../shared/src/vorgaben';
import { setzeZusammengesetzte } from '../../../shared/src/zusammengesetzt';
import { istVerklemmung } from '../db';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { liesStand } from '../mappentypen';
import { istUuid, type NeueMappe, type Repo, type Rueckverweis, StandVeraltet } from '../repo';
import { t } from '../sprache';
import { maskiert, NICHT_SICHTBAR, type ZugriffDienst } from '../zugriff';
import { pruefeBerechnete } from './berechnet';
import { gesperrteSchreibfelder, organisationsNotizen, pruefeSchreibschutz } from './schreibschutz';
import type { OrganisationNotiz } from '../../../shared/src/organisation';
import { bereinigeWerte, gesendeteFelder, type MappenEingaben } from './eingaben';
import type { MappenHinweise } from './hinweise';
import type { MappenHistorie } from './historie';
import type { MappenTitel } from './titel';

/** Die Teile der Mappen, die der Mappen-Dienst ruft (eigene Klassen in diesem Ordner). */
export interface MappenTeile { historie: MappenHistorie; titel: MappenTitel; eingaben: MappenEingaben; hinweise: MappenHinweise }

/** Was die Mappen außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht, bis es eigene Module dafür gibt. */
export interface MappenAnschluss {
  /** Konten (vom Start verbunden): persönliche Einstellungen (#422, #678). */
  konten(): { einstellungen?(id: string): Promise<Record<string, unknown>> } | undefined;
  /** Favoriten benachrichtigen: Freigabe in der Werkbank (#506; Aufgaben, noch im Dienst). */
  favoritenBenachrichtigungErlaubt(benutzerId: string): Promise<boolean>;
  /** Eigene Aufgaben an Mappen ohne Leserecht (#798; Aufgaben, noch im Dienst). */
  ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string): Promise<T[]>;
  /** Stand der Archivfassung (#631) und Schutz geschützter PDFs (#827) je Dokument (Dokumente, noch im Dienst). */
  mitArchivStand(docs: Dokument[]): Promise<Dokument[]>;
  mitPdfSchutz(docs: Dokument[]): Promise<Dokument[]>;
  /** Datenschutz-Einstellungen (#396; Datenschutz, noch im Dienst). */
  datenschutz(): Promise<Datenschutz>;
  /** Ob und warum nicht die Mappe gelöscht werden kann (#79; Löschen, noch im Dienst). */
  loeschPruefung(m: Mappe, typ: Mappentyp | undefined, rueck: Rueckverweis[], alleTypen?: Mappentyp[]): Promise<{ ok: true; grund: undefined; fremd: Rueckverweis[] } | { ok: false; grund: string; fremd: Rueckverweis[] }>;
  /** Ereignis „verknüpft“ je neu verknüpfter Mappe (#670; Ereignisse, noch im Dienst). */
  meldeVerknuepft(typ: Mappentyp, mappeId: string, alt: Werte, neu: Werte, von: string | null): Promise<unknown>;
  /** Passwortfelder verschlüsseln (#46; Schlüssel aus tresor.ts). */
  verschluessele(klartext: string): string;
  /** Titel neu berechnen – über die Fassade des Dienstes, wie bisher (`MappenTitel.aktualisiereTitel`). */
  aktualisiereTitel(ids: string[]): Promise<Map<string, string>>;
  /**
   * Eigene Organisation (#995): Merkmal oder Verantwortliche geändert – Notiz an die Verwaltung und Systemprotokoll
   * (Fachbereich Organisation). Erst nach dem Speichern gerufen, Fehler nur im Protokoll.
   */
  organisationGeaendert?(e: { mappeId: string; was: Array<OrganisationNotiz['was']>; von: string | null }): Promise<void>;
}

export class MappenDienst {
  constructor(private readonly kern: Kern, private readonly rechtepruefung: ZugriffDienst, private readonly teile: MappenTeile, private readonly anschluss: MappenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private readonly verschluessele = (klartext: string) => this.anschluss.verschluessele(klartext);
  private inTransaktion<T>(f: () => Promise<T>): Promise<T> { return this.kern.inTransaktion(f); }
  private inEinemZug<T>(f: () => Promise<T>): Promise<T> { return this.kern.inEinemZug(f); }
  private ereignis(...a: Parameters<Kern['ereignis']>) { return this.kern.ereignis(...a); }
  private lesbare(...a: Parameters<ZugriffDienst['lesbare']>) { return this.rechtepruefung.lesbare(...a); }
  private rechteAn(...a: Parameters<ZugriffDienst['rechteAn']>) { return this.rechtepruefung.rechteAn(...a); }
  private pruefeRecht(...a: Parameters<ZugriffDienst['pruefeRecht']>) { return this.rechtepruefung.pruefeRecht(...a); }
  private maskiereBezuege(...a: Parameters<ZugriffDienst['maskiereBezuege']>) { return this.rechtepruefung.maskiereBezuege(...a); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }
  private aenderungen(...a: Parameters<MappenHistorie['aenderungen']>) { return this.teile.historie.aenderungen(...a); }
  private aktualisiereTitel(ids: string[]) { return this.anschluss.aktualisiereTitel(ids); }
  private titelVorab(...a: Parameters<MappenTitel['titelVorab']>) { return this.teile.titel.titelVorab(...a); }
  private verweiskonflikte(...a: Parameters<MappenEingaben['verweiskonflikte']>) { return this.teile.eingaben.verweiskonflikte(...a); }
  private folgeFuellen(...a: Parameters<MappenEingaben['folgeFuellen']>) { return this.teile.eingaben.folgeFuellen(...a); }
  private pruefeVerweisziele(...a: Parameters<MappenEingaben['pruefeVerweisziele']>) { return this.teile.eingaben.pruefeVerweisziele(...a); }
  private pruefeAuswahlfilter(...a: Parameters<MappenEingaben['pruefeAuswahlfilter']>) { return this.teile.eingaben.pruefeAuswahlfilter(...a); }
  private pruefeWerte(...a: Parameters<MappenEingaben['pruefeWerte']>) { return this.teile.eingaben.pruefeWerte(...a); }
  private hinweisDanach(...a: Parameters<MappenEingaben['hinweisDanach']>) { return this.teile.eingaben.hinweisDanach(...a); }
  private feldkonflikte(...a: Parameters<MappenEingaben['feldkonflikte']>) { return this.teile.eingaben.feldkonflikte(...a); }
  private favoritenBenachrichtigungErlaubt(benutzerId: string) { return this.anschluss.favoritenBenachrichtigungErlaubt(benutzerId); }
  private ohneLeserechtText<T extends Aufgabe>(liste: T[], lesbar: Set<string>, ich: string) { return this.anschluss.ohneLeserechtText(liste, lesbar, ich); }
  private mitArchivStand(docs: Dokument[]) { return this.anschluss.mitArchivStand(docs); }
  private mitPdfSchutz(docs: Dokument[]) { return this.anschluss.mitPdfSchutz(docs); }
  private datenschutz() { return this.anschluss.datenschutz(); }
  private loeschPruefung(...a: Parameters<MappenAnschluss['loeschPruefung']>) { return this.anschluss.loeschPruefung(...a); }
  private meldeVerknuepft(...a: Parameters<MappenAnschluss['meldeVerknuepft']>) { return this.anschluss.meldeVerknuepft(...a); }

  /* ---------- Notizen (#55) ---------- */

  static notiztext(e: unknown): string {
    const text2 = typeof e === 'string' ? e.replace(/\r\n?/g, '\n').trim() : '';
    if (!text2) throw new Fachfehler(422, t('meldungen.dienst.die-notiz-ist-leer'));
    if (text2.length > NOTIZ_MAX) throw new Fachfehler(422, t('meldungen.dienst.eine-notiz-darf-hoechstens', { NOTIZ_MAX: NOTIZ_MAX.toLocaleString(gebietsschema()) }));
    return text2;
  }
  static vorschau(t: string) { const x = alsText(t); return x.length > 80 ? `${x.slice(0, 77)} …` : x; }

  async notizen(mappeId: string): Promise<Notiz[]> {
    if (!(await this.repo.holeMappe(mappeId))) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    return this.repo.notizen(mappeId);
  }

  /* ---------- Favorit = Abo (#422) ---------- */

  /**
   * Persönliche Einstellung (Vorgabe an): „favoriten_benachrichtigen“ bzw. „geaenderte_hervorheben“ = false schaltet ab.
   * Benachrichtigen nur, wenn die Werkbank es für den Benutzer erlaubt (#506); seine Einstellung bleibt dabei gespeichert.
   */
  /** Persönliche Einstellungen eines Benutzers (#678: Zeitplan „für jeden Benutzer“ mit Uhrzeit aus dem Profil). */
  async persoenlicheEinstellungen(benutzerId: string): Promise<Record<string, unknown>> { return (await this.konten?.einstellungen?.(benutzerId)) ?? {}; }

  async persoenlichAn(benutzerId: string, schluessel: string): Promise<boolean> {
    if (schluessel === 'favoriten_benachrichtigen' && !(await this.favoritenBenachrichtigungErlaubt(benutzerId))) return false;
    return (await this.konten?.einstellungen?.(benutzerId))?.[schluessel] !== false;
  }

  /**
   * Mappen gesehen (#422): geöffnet oder „Alle als gesehen markieren“. Die Hervorhebung verschwindet, und eine
   * offene Benachrichtigung „Geändert“ erledigt sich – die nächste Änderung bringt wieder eine.
   */
  /** `aufgaben`: alle Aufgaben dieser Mappen, wenn sie schon gelesen sind (#615, „Mappe öffnen“). */
  async gesehen(ich: { id: string }, mappeIds: unknown, aufgaben?: Aufgabe[]) {
    const ids = (Array.isArray(mappeIds) ? mappeIds : [mappeIds]).filter((x): x is string => istUuid(x)).slice(0, 1000);
    if (!ids.length) return;
    await this.repo.merkeGesehen(ich.id, ids);
    const offen = aufgaben ? aufgaben.filter((x) => !x.erledigt && ids.includes(x.mappeId)) : await this.repo.offeneAufgaben({ mappeIds: ids });
    for (const a of offen.filter((x) => x.art === 'aenderung' && x.empfaengerId === ich.id)) {
      await this.repo.erledigeAufgabe(a.id, ich.id);
    }
  }

  /** Je Favorit „bei Änderungen benachrichtigen“ (#422, Schalter in der Favoritenliste). */
  async setzeFavoritBenachrichtigen(ich: { id: string }, mappeId: string, an: unknown) {
    if (!(await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId)) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-ist-kein'));
    await this.repo.setzeFavoritBenachrichtigen(ich.id, mappeId, an !== false);
    return { benachrichtigen: an !== false };
  }

  listeMappen(typId?: string) { return this.repo.listeMappen(typId); }
  /** Schlank für viele Mappen (Demo-Daten, #248). */
  mappenKurz() { return this.repo.mappenKurz(); }
  feldwerte(typId: string, key: string) { return this.repo.feldwerte(typId, key); }

  /**
   * Verweisende Mappen eines Typs über ein Feld, vollständig (für die Tabelle im
   * Verknüpfungsregister, #75): höchstens 1000, nach Titel sortiert.
   */
  async verweisende(id: string, typId: string, feldKey: string, z?: Zugriff) {
    await this.pruefeRecht(z, id, 'R');
    const rv = (await this.repo.rueckverweise(id)).filter((r) => r.quelleTypId === typId && r.feldKey === feldKey);
    const sichtbar = await this.lesbare(z, rv.map((r) => r.quelleId));
    const ids = [...new Set(rv.map((r) => r.quelleId))].filter((x) => sichtbar.has(x));
    const mappen = (await this.repo.holeMappen(ids.slice(0, 1000))).sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'));
    const typ = await this.repo.holeTyp(typId);
    const ziele = typ ? mappen.flatMap((m) => verweiseVon(typ, m.werte).map((v) => v.zielId)) : [];
    return { gesamt: ids.length, mappen, bezuege: await this.maskiereBezuege(z, await this.repo.bezuege(ziele)) };
  }

  async holeMappe(id: string, z?: Zugriff) {
    // Aufgaben der Mappe nur einmal lesen (#615): für die Regel „mit Aufgabe“, für die Antwort und fürs Gesehen.
    // Mappe und Aufgaben gleichzeitig (#741).
    const [mappe, aufgaben] = await Promise.all([this.repo.holeMappe(id), this.repo.aufgabenVon(id)]);
    if (!mappe) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    // Berechtigungen (#124): ohne Lesen nur die eigenen offenen Aufgaben – zum Erledigen oder Weitergeben.
    const rechte = z ? await this.rechteAn(z, mappe, false, aufgaben) : null;
    if (z && rechte && !rechte.R) {
      // #798: automatische Aufgaben nur mit Hinweis und Fälligkeit; von Hand geschriebene mit Text.
      const meine = await this.ohneLeserechtText(aufgaben.filter((x) => !x.erledigt && x.empfaengerId === z.ich.id), new Set(), z.ich.id);
      throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es-2'), { verborgen: true, aufgaben: meine });
    }
    // Mappentypen hat der Zugriff schon gelesen (#615); ein Dienstkonto kennt nur seine – dann wie bisher.
    const alleTypen = z?.typen && !z.paket ? [...z.typen.values()] : undefined;
    const typ = (alleTypen ? z!.typen.get(mappe.typId) : undefined) ?? await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    // Was nur noch von der Mappe abhängt, gleichzeitig (#741) – erst nach der Prüfung des Leserechts.
    const [alleRueck, roheBezuege, dokumente, notizen, erinnerungen, unpassend, datenschutz, hinweise] = await Promise.all([
      this.repo.rueckverweise(id), this.repo.bezuege(ziele),
      this.repo.listeDokumente(id).then((d) => this.mitArchivStand(d)).then((d) => this.mitPdfSchutz(d)),
      this.repo.notizen(id), this.repo.erinnerungen({ mappeId: id }),
      this.verweiskonflikte(typ, mappe.werte, z?.ich.id ?? '', alleTypen && z?.a ? { typen: alleTypen, a: z.a } : undefined, z),
      z?.admin ? this.datenschutz() : Promise.resolve(null),
      this.teile.hinweise.von(id),
    ]);
    // Vorgabe aus einem Paket (#1038): Kennzeichnung „aus Paket …“, solange das Paket installiert ist.
    const vorgabe = await this.vorgabeHerkunft(mappe);
    // Lesbar (#124, #126): verweisende und verwiesene Mappen in einem Zugriff.
    const sichtbar = await this.lesbare(z, [...alleRueck.map((r) => r.quelleId), ...roheBezuege.keys()]);
    const rueckverweise = alleRueck.filter((r) => sichtbar.has(r.quelleId));
    // Teile (#1031) halten das Löschen nicht auf – sie gehen mit (die Rechte an ihnen prüft das Löschen).
    const typenFuerTeile = alleRueck.length ? new Map((alleTypen ?? await this.repo.listeTypen()).map((x) => [x.id, x] as const)) : new Map<string, Mappentyp>();
    const teile = new Set(alleRueck.filter((r) => r.quelleId !== id && istTeilVerweis(typenFuerTeile.get(r.quelleTypId), r.feldKey)).map((r) => r.quelleId));
    const p = await this.loeschPruefung(mappe, typ, alleRueck.filter((r) => !teile.has(r.quelleId)), alleTypen);
    // Verweisende Mappen, die man nicht sehen darf: nur ihre Anzahl (#126).
    const fremd = p.fremd.map((r) => (sichtbar.has(r.quelleId) ? r : { ...r, titel: NICHT_SICHTBAR, verborgen: true }));
    return {
      mappe,
      rueckverweise,
      /** Wirksame Rechte des Benutzers an dieser Mappe (#126). */
      rechte: rechte ?? { C: true, R: true, U: true, D: true, P: true },
      /** Geschützte Felder (#995), die diese Person nicht ändern darf – im Formular nur lesbar. */
      schreibschutz: await gesperrteSchreibfelder(this.kern, typ, z),
      /** Ob „Mappe löschen“ geht, sonst warum nicht (#79). */
      loeschbar: p.ok ? { ok: true, ...(teile.size ? { teile: teile.size } : {}) } : { ok: false, grund: p.grund, rueckverweise: fremd },
      dokumente,
      /** Notizen an der Mappe (#55). */
      notizen,
      /** Aufgaben an der Mappe, offene zuerst (#54). */
      aufgaben,
      /** Noch nicht fällige Erinnerungen (#131). */
      erinnerungen,
      /** Titel und Typ der Mappen, auf die diese verweist (nicht lesbare ohne Titel). */
      bezuege: maskiert(roheBezuege, sichtbar),
      /** Verweise, die nicht (mehr) zum Auswahlfilter oder zu einem Feld passen, das aus ihnen folgt (#172, #886). */
      unpassend: unpassend.unpassend,
      /** Dasselbe je Verweisfeld mit den eigenen Feldern, mit denen es nicht zusammenpasst (#887). */
      konflikte: unpassend.konflikte,
      /** Hinweise von Paketen (#1034) mit Paketnamen – für alle, die die Mappe lesen. */
      hinweise,
      /** Vorgabe aus einem Paket (#1038): Paket und Name; fehlt bei allen anderen Mappen. */
      ...(vorgabe ? { vorgabe } : {}),
      /** Archivmodus (#212): aufbewahren bis (JJJJ-12-31) oder null. */
      aufbewahrenBis: aufbewahrenBis(typ?.archiv, mappe),
      /** Die Frist läuft noch nicht (#1051): Sie beginnt mit diesem Feld (Beschriftung); die Mappe ist gesperrt. */
      ...(laeuftNochNicht(typ?.archiv, mappe) ? { fristBeginntMit: stichtagName(typ) } : {}),
      /** Auskunft nach Art. 15 DSGVO (#396): Administratoren, Mappentyp „betrifft eine Person“. */
      ...(z?.admin && datenschutz?.typen[mappe.typId]?.person ? { auskunft: true } : {}),
    };
  }

  /** Herkunft einer Vorgabe (#1038): Paket der festen Kennung, wenn es installiert ist. */
  private async vorgabeHerkunft(m: Mappe): Promise<VorgabeHerkunft | null> {
    const v = teileVorgabe(m.vorgabe);
    const p = v ? (await this.repo.listePakete()).find((x) => x.id === v.paket) : undefined;
    return p ? { paket: p.id, paketName: p.name } : null;
  }

  /**
   * Vorgaben (#1038, Ergänzung Sicherheit): Ein Paket ändert, löscht oder leert keine Vorgabe eines anderen Pakets –
   * auch nicht mit Schreibrecht am Mappentyp. Für Menschen und das Paket selbst gilt das nicht.
   */
  async pruefeFremdeVorgabe(z: Zugriff | undefined, mappe: string | Mappe | undefined): Promise<void> {
    if (!z?.paket?.id || !mappe) return;
    const m = typeof mappe === 'string' ? await this.repo.holeMappe(mappe) : mappe;
    if (fremdeVorgabe(m, z.paket.id)) throw new Fachfehler(403, t('meldungen.dienst.vorgabe-fremdes-paket', { titel: m?.titel || m?.id || '' }));
  }

  /* ---------- Favoriten (#62) ---------- */

  /** Persönlich: ändert weder „zuletzt geändert“ noch das Protokoll der Mappe. */
  async setzeFavorit(ich: { id: string }, mappeId: string, an: boolean) {
    const m = await this.repo.holeMappe(mappeId);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const schon = an && (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId);
    await this.repo.setzeFavorit(ich.id, mappeId, an);
    if (an && !schon) await this.ereignis('favorit.neu', { benutzer: ich.id, mappe: mappeId, typ: m.typId }, ich.id);
    return { favorit: an };
  }

  async istFavorit(ich: { id: string }, mappeId: string) { return (await this.repo.favoritenVon(ich.id, [mappeId])).has(mappeId); }

  async legeMappeAn(eingabe: unknown, benutzerId: string | null = null, demo = false, z?: Zugriff): Promise<Mappe & { hinweis?: string }> {
    const e = (eingabe ?? {}) as { id?: unknown; typId?: unknown; werte?: unknown };
    const typ = istUuid(e.typId) ? await this.repo.holeTyp(e.typId) : undefined;
    if (!typ) throw new Fachfehler(422, t('meldungen.dienst.unbekannter-mappentyp'));
    if (!darfErstellen(typ)) throw new Fachfehler(403, t('meldungen.dienst.mappen-vom-typ-lassen', { name: typ.name, wert: typ.system === 'benutzer' ? t('meldungen.dienst.benutzer-legt-ein-administrator') : '' }));
    const werte = bereinigeWerte(typ, e.werte, {}, this.verschluessele);
    // Berechnete Felder (#1034): schon beim Anlegen nur das Paket, das sie berechnet (sonst 400 mit seinem Namen).
    await pruefeBerechnete(this.kern, typ, { alt: {}, neu: werte, gesendet: gesendeteFelder(e.werte, typ) }, z);
    // Geschützte Felder (#995): z. B. das Merkmal „eigene Organisation“ nur mit Verwaltungsrecht oder freigegebener Rolle.
    await pruefeSchreibschutz(this.kern, typ, { alt: {}, neu: werte, gesendet: gesendeteFelder(e.werte, typ) }, z);
    // Berechtigungen (#123): Anlegen wird mit den eingegebenen Werten geprüft.
    if (z && !z.admin) {
      const entwurf: Mappe = { id: '00000000-0000-4000-8000-000000000000', typId: typ.id, werte, erstellt: new Date().toISOString(), erstelltVon: z.ich.id, geaendert: new Date().toISOString(), geaendertVon: z.ich.id };
      if (!(await this.rechteAn(z, entwurf, true)).C) throw new Fachfehler(403, t('meldungen.dienst.mappen-vom-typ-mit', { name: typ.name }));
    }
    // Nummernkreise (#171): Eingaben zählen nicht; die Nummer zieht das Repo beim Anlegen.
    const nummern = typ.felder.flatMap((f) => { const k = kreisVon(f); return k ? [{ feldKey: f.key, kreis: k }] : []; });
    for (const n of nummern) delete werte[n.feldKey];
    if (nummern.length) {
      const da = new Set((await this.repo.listeNummernkreise()).map((k) => k.schluessel));
      const fehlt = nummern.find((n) => !da.has(n.kreis));
      if (fehlt) throw new Fachfehler(409, t('meldungen.dienst.den-nummernkreis-fuer-gibt', { kreis: fehlt.kreis, label: String(typ.felder.find((f) => f.key === fehlt.feldKey)?.label) }));
    }
    // Folgt aus (#886): leere Felder füllen sich aus ihrer Quelle – was die Anfrage selbst setzt, bleibt.
    await this.folgeFuellen(typ, werte, {}, gesendeteFelder(e.werte, typ), z);
    // Zusammengesetzt (#1050): nach „folgt aus“ – auch gefolgte Verweise gehören zur Kombination.
    setzeZusammengesetzte(typ, werte);
    await this.pruefeVerweisziele(z, typ, werte, {});
    await this.pruefeAuswahlfilter(typ, werte, {}, benutzerId);
    await this.pruefeWerte(typ, werte, undefined, undefined, z);
    const id = istUuid(e.id) && !(await this.repo.holeMappe(e.id)) ? e.id : randomUUID();
    // In einer Transaktion (#743): Mappe, Titel, Historie, Ereignisse und die sofortigen Empfänger (#962) ganz oder gar nicht.
    const { m, titel } = await this.inEinemZug(async () => {
      const m = await this.repo.legeMappeAn(id, typ.id, werte, verweiseVon(typ, werte), benutzerId, demo, null, nummern.length ? { felder: nummern, jetzt: new Date() } : undefined);
      if (!demo) {
        await this.notiere(m.id, benutzerId, 'angelegt', { aenderungen: await this.aenderungen(typ, {}, m.werte) });
        await this.meldeVerknuepft(typ, m.id, {}, m.werte, benutzerId);
      }
      const titel = (await this.aktualisiereTitel([m.id])).get(m.id);
      await this.kern.anlaesse.mappeGeaendert.melde({ typ, mappe: m, alt: {}, neu: werte, von: benutzerId, angelegt: true, demo });
      return { m, titel };
    });
    if (!demo) this.organisationNotiz(typ, {}, m.werte, m.id, benutzerId);
    const hinweis = z ? await this.hinweisDanach(z, m.id) : undefined;
    return { ...m, titel, ...(hinweis ? { hinweis } : {}) };
  }

  /**
   * Mappe ändern. Übergebene Felder ersetzen die bisherigen, nicht übergebene bleiben (#609: auch wenn sie
   * inzwischen jemand anderes geändert hat – geschrieben wird feldweise auf den aktuellen Stand).
   * `eingabe.stand` (optional, „zuletzt geändert“ beim Lesen): Hat seitdem jemand ein übergebenes Feld
   * geändert und soll es jetzt anders lauten, kommt 409 mit den Feldern (`Mappenkonflikt`) statt Überschreiben.
   * `anlass`: steht zusätzlich im Eintrag der Historie, z. B. die Umwandlung nach einem Paket-Update (#534).
   */
  async aendereMappe(id: string, eingabe: unknown, benutzerId: string | null = null, z?: Zugriff, anlass?: Record<string, unknown>): Promise<Mappe & { hinweis?: string }> {
    // Schreibt zwischen Lesen und Schreiben jemand anderes, noch einmal von vorn (#609). In einer eigenen Transaktion
    // (#743) auch nach einer Verklemmung – die Transaktion ist dann ganz zurückgerollt.
    const eigene = !this.kern.inEigenerTransaktion();
    for (let versuch = 1; ; versuch++) {
      try {
        const neu = await this.inTransaktion(() => this.aendereMappeEinmal(id, eingabe, benutzerId, z, anlass));
        const hinweis = z ? await this.hinweisDanach(z, id) : undefined;
        return { ...neu, ...(hinweis ? { hinweis } : {}) };
      } catch (e) { if (!(e instanceof StandVeraltet || (eigene && istVerklemmung(e))) || versuch >= 5) throw e; }
    }
  }

  /** Ein Versuch, in einer Transaktion (#743): Werte, Titel, Historie, Ereignisse und die sofortigen Empfänger (#962) ganz oder gar nicht. */
  private async aendereMappeEinmal(id: string, eingabe: unknown, benutzerId: string | null, z: Zugriff | undefined, anlass: Record<string, unknown> | undefined): Promise<Mappe> {
    const m = z ? await this.pruefeRecht(z, id, 'U') : await this.repo.holeMappe(id);
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    await this.pruefeFremdeVorgabe(z, m);
    const typ = await this.repo.holeTyp(m.typId);
    if (!typ) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const e = (eingabe && typeof eingabe === 'object' ? eingabe : {}) as { werte?: unknown; stand?: unknown };
    const stand = liesStand(e.stand);
    const werte = bereinigeWerte(typ, e.werte, m.werte, this.verschluessele);
    // Berechnete Felder (#1034): nur das Paket, das sie berechnet – vor allen anderen Prüfungen, die für es genauso gelten.
    const berechnet = await pruefeBerechnete(this.kern, typ, { alt: m.werte, neu: werte, gesendet: gesendeteFelder(e.werte, typ) }, z);
    // Geschützte Felder (#995): nur mit Verwaltungsrecht oder freigegebener Rolle – sonst 403, auch über API v1.
    await pruefeSchreibschutz(this.kern, typ, { alt: m.werte, neu: werte, gesendet: gesendeteFelder(e.werte, typ) }, z);
    // Stand (#609): Hat sich seitdem ein Feld geändert, das diese Eingabe anders setzen will? Dann fragen.
    if (stand && stand !== m.geaendert) {
      const gesendet = e.werte && typeof e.werte === 'object' ? Object.keys(e.werte) : [];
      const konflikte = await this.feldkonflikte(typ, m, werte, gesendet, stand);
      if (konflikte.length) {
        const k: Mappenkonflikt = { stand: m.geaendert, konflikte };
        throw new Fachfehler(409, t('mappen.konflikt.fehler', { felder: konflikte.map((x) => `„${x.label}“`).join(', ') }), k);
      }
    }
    // Geschützte Felder (Benutzer, Name einer Systemrolle) ändert nur das System.
    for (const [k, grund] of Object.entries(geschuetzteFelder(typ, m))) {
      if (JSON.stringify(werte[k] ?? null) !== JSON.stringify(m.werte[k] ?? null)) {
        throw new Fachfehler(403, t('meldungen.dienst.laesst-sich-hier-nicht', { wert: typ.felder.find((f) => f.key === k)?.label ?? k, grund }));
      }
    }
    await this.folgeFuellen(typ, werte, m.werte, gesendeteFelder(e.werte, typ), z);
    setzeZusammengesetzte(typ, werte);
    await this.pruefeVerweisziele(z, typ, werte, m.werte);
    await this.pruefeAuswahlfilter(typ, werte, m.werte, benutzerId);
    await this.pruefeWerte(typ, werte, id, m.werte, z);
    const aenderungen = await this.aenderungen(typ, m.werte, werte);
    // Archivmodus (#212): eine neue Frist steht in der Historie – auch, wenn sie erst jetzt beginnt (#1051) oder wieder offen ist.
    const fristText = (w: Mappe['werte']) => {
      const bis = aufbewahrenBis(typ.archiv, { ...m, werte: w });
      return bis ? datumText(bis) : laeuftNochNicht(typ.archiv, { ...m, werte: w }) ? t('meldungen.dienst.frist-laeuft-noch-nicht', { feld: stichtagName(typ) }) : '';
    };
    const bisAlt = fristText(m.werte), bisNeu = fristText(werte);
    if (bisAlt !== bisNeu) aenderungen.push({ feld: '_aufbewahrenBis', label: t('meldungen.dienst.aufbewahren-bis'), alt: bisAlt, neu: bisNeu });
    // Feldweise (#609); mit Stand nur, wenn sich die Mappe seit dem Lesen oben nicht geändert hat.
    const titelFuer = await this.titelVorab(typ, werte, m);
    const neu = await this.repo.aendereMappe(id, werte, [], benutzerId, { basis: m.werte, verweise: (w) => verweiseVon(typ, w), titel: titelFuer, ...(stand ? { stand: m.geaendert } : {}) });
    // Kein Rauschen (#1034): Ändert das Paket nur seine berechneten Felder, ein Eintrag je Mappe und Tag (historie.ts).
    const nurBerechnet = !!z?.paket && !anlass && aenderungen.length > 0 && aenderungen.every((a) => berechnet.some((f) => f.key === a.feld));
    if (nurBerechnet) await this.teile.historie.notiereBerechnet(id, typ.id, benutzerId, { paketName: (await this.repo.listePakete()).find((p) => p.id === z!.paket!.id)?.name ?? z!.paket!.id, stand: neu.geaendert, aenderungen });
    else if (aenderungen.length) await this.notiere(id, benutzerId, 'geaendert', { ...anlass, aenderungen, stand: neu.geaendert });
    await this.meldeVerknuepft(typ, id, m.werte, neu.werte, benutzerId);
    // Titel (#743): stand er schon im UPDATE, nur noch die Mappen nachziehen, die auf diese verweisen (wenn er sich
    // geändert hat); sonst wie bisher.
    const vorab = titelFuer(neu.werte);
    let titel = neu.titel;
    if (vorab === undefined || vorab !== neu.titel) titel = (await this.aktualisiereTitel([id])).get(id);
    else if (vorab !== m.titel) await this.aktualisiereTitel(await this.repo.quellenVon([id]));
    // Passung, Erwähnungen, Fristen, Post-Aufgaben (#962).
    await this.kern.anlaesse.mappeGeaendert.melde({ typ, mappe: neu, alt: m.werte, neu: werte, von: benutzerId, angelegt: false, demo: false });
    this.organisationNotiz(typ, m.werte, neu.werte, id, benutzerId);
    return { ...neu, titel };
  }

  /** Eigene Organisation (#995): nach dem Speichern die Notiz an die Verwaltung (wird die Transaktion zurückgerollt, nie). */
  private organisationNotiz(typ: Mappentyp, alt: Werte, neu: Werte, mappeId: string, von: string | null) {
    const was = organisationsNotizen(typ, alt, neu);
    const f = this.anschluss.organisationGeaendert;
    if (!was.length || !f) return;
    this.kern.danach(() => { void this.kern.nachDerAntwort(() => f({ mappeId, was, von })); });
  }

  /** Viele neue Mappen auf einmal (Demo-Daten); Werte sind bereits geprüft. */
  legeMappenAn(liste: NeueMappe[]) { return this.repo.legeMappenAn(liste); }
}
