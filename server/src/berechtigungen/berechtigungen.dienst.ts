/**
 * Berechtigungen in der Werkbank (#123–#127, #142, #346, #710, #798; #1076 aus dienst.ts): Übersicht, Regelwerk
 * speichern und prüfen, „niemand kann lesen“, Regel kopieren, Testlauf, WebDAV-Laufwerk. Schicht 2 – bekommt den Kern
 * und die Rechteprüfung, nicht den ganzen Dienst.
 */
import { type Benutzer, type Mappentyp, verweiseVon } from '../../../shared/src/model';
import { type Ausdruck, bereinigeRegelwerk, istOffen, kontoRegelwerk, kopiereRegel, kurz, leseAusdruck, nicht, NICHTS, oder, type Recht, rechteAn as rechteAnMappe, regelProblem, type Regelwerk, regelwerkVon } from '../../../shared/src/rechte';
import { Fachfehler } from '../fehler';
import type { Kern, Zugreifender, Zugriff } from '../kern';
import { protokoll } from '../protokoll';
import { istUuid, type Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

/** Was die Berechtigungen außer Kern und Rechteprüfung brauchen – vom Dienst hereingereicht. */
export interface BerechtigungenAnschluss {
  /** Konten (vom Start verbunden): Benutzer, Systemkonten und Dienstkonten der Pakete (#125, #710). */
  konten(): { benutzer?(): Promise<Benutzer[]>; ohneMensch?(): Promise<Benutzer[]> } | undefined;
}

export class BerechtigungenDienst {
  constructor(private readonly kern: Kern, private readonly rechte: ZugriffDienst, private readonly anschluss: BerechtigungenAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get konten() { return this.anschluss.konten(); }
  private aufloesung(benutzerId: string) { return this.rechte.aufloesung(benutzerId); }
  private mappenquelle(benutzerId: string, mappeIds: string[]) { return this.rechte.mappenquelle(benutzerId, mappeIds); }
  private zugriff(ich: Zugreifender) { return this.rechte.zugriff(ich); }
  private pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht) { return this.rechte.pruefeRecht(z, id, recht); }
  private lesbare(z: Zugriff | undefined, ids: string[]) { return this.rechte.lesbare(z, ids); }
  private name(benutzerId: string | null) { return this.kern.name(benutzerId); }

  /* ---------- Berechtigungen in der Werkbank (#123, #125) ---------- */

  /** Aktive Benutzer, für die Regeln gelten – alle; nur der Verwaltungsmodus hebt sie auf (#818). */
  private async regelBenutzer(): Promise<Benutzer[]> {
    return this.konten?.benutzer ? (await this.konten.benutzer()).filter((b) => b.aktiv) : [];
  }

  /** Übersicht: je Mappentyp Grundeinstellung und Anzahl Regeln. */
  async berechtigungenListe() {
    const typen = await this.repo.listeTypen();
    return typen.map((t) => ({ typId: t.id, name: t.name, system: t.system ?? null, berechtigungen: regelwerkVon(t) }));
  }

  /** Wie viele Mappen dieses Typs könnte mit diesem Regelwerk kein normaler Benutzer lesen? */
  async niemandLesbar(typ: Mappentyp, rw: Regelwerk): Promise<number> {
    const benutzer = await this.regelBenutzer();
    if (!benutzer.length) return 0;
    const t = { ...typ, berechtigungen: rw };
    const teile: Ausdruck[] = [];
    for (const b of benutzer) {
      const a = await this.aufloesung(b.id);
      teile.push(leseAusdruck(t, { id: b.id, rollen: a.meineRollen }, a));
    }
    const x = nicht(oder(...teile));
    return x.k === 'falsch' ? 0 : this.repo.zaehleAusdruck(typ.id, x);
  }

  /** Regelwerk speichern; mit Warnung, wenn danach Mappen niemand mehr lesen kann (#125). */
  async setzeBerechtigungen(typId: string, eingabe: unknown, bestaetigt: boolean): Promise<{ typ: Mappentyp; niemand: number }> {
    const typ = await this.repo.holeTyp(typId);
    if (!typ) throw new Fachfehler(404, t('meldungen.dienst.diesen-mappentyp-gibt-es'));
    const { rw, niemand } = await this.pruefeBerechtigungen(typ, eingabe, bestaetigt);
    const neu = await this.repo.setzeBerechtigungen(typId, istOffen(rw) ? null : rw);
    BerechtigungenDienst.protokolliereBerechtigungen(neu, niemand);
    return { typ: neu, niemand };
  }

  /** Regeln prüfen (Probleme → 422) und warnen, wenn Mappen danach niemand mehr lesen könnte (409 ohne Bestätigung). */
  private async pruefeBerechtigungen(typ: Mappentyp, eingabe: unknown, bestaetigt: boolean): Promise<{ rw: Regelwerk; niemand: number }> {
    const rw = bereinigeRegelwerk(eingabe);
    const probleme = rw.regeln.map((r) => regelProblem(r, typ)).filter((x): x is string => !!x);
    if (probleme.length) throw new Fachfehler(422, t('meldungen.dienst.berechtigungen', { probleme: probleme.join(' ') }), { gruende: probleme, berechtigungen: true });
    const niemand = await this.niemandLesbar(typ, rw);
    if (niemand && !bestaetigt) {
      throw new Fachfehler(409, t('meldungen.dienst.mappen-vom-typ-koennte', { anzahl: niemand, name: typ.name }), { niemand });
    }
    return { rw, niemand };
  }

  static protokolliereBerechtigungen(typ: Mappentyp, niemand: number) {
    const rw = typ.berechtigungen;
    protokoll.modul('werkbank').warn('Berechtigungen geändert', {
      typ: typ.name, grund: rw?.grund ?? 'erteilt', regeln: rw?.regeln.length ?? 0,
      liste: rw?.regeln.map((x, i) => `${i + 1}. ${x.name} ${kurz(x.dann)}${x.stopp ? ' ■' : ''}`).join(' · ') || undefined,
      ...(niemand ? { niemandLesbar: niemand } : {}),
    });
  }

  /**
   * Berechtigungen mit dem Mappentyp speichern (#142): `berechtigungen` in der Eingabe (fehlt = unverändert),
   * `bestaetigt` für die Rückfrage „niemand kann lesen“. Geprüft wird gegen die neuen Felder – vor dem Speichern.
   */
  async berechtigungenAusEingabe(typ: Mappentyp, eingabe: unknown): Promise<{ rw: Regelwerk; niemand: number } | null> {
    const e = (eingabe ?? {}) as { berechtigungen?: unknown; bestaetigt?: unknown };
    if (e.berechtigungen === undefined) return null;
    const r = await this.pruefeBerechtigungen(typ, e.berechtigungen, e.bestaetigt === true);
    return JSON.stringify(istOffen(r.rw) ? null : r.rw) === JSON.stringify(typ.berechtigungen ?? null) ? null : r;
  }

  /** Eine Regel in andere Mappentypen kopieren (ans Ende); Feldbedingungen nur, wo das Feld passt. */
  async kopiereRegel(typId: string, regelId: string, ziele: unknown): Promise<{ kopiert: number; ausgelassen: number }> {
    const typ = await this.repo.holeTyp(typId);
    const regel = typ ? regelwerkVon(typ).regeln.find((r) => r.id === regelId) : undefined;
    if (!typ || !regel) throw new Fachfehler(404, t('meldungen.dienst.diese-regel-gibt-es'));
    let kopiert = 0; let ausgelassen = 0;
    for (const id of (Array.isArray(ziele) ? ziele : []).map(String)) {
      const ziel = id === typId ? undefined : await this.repo.holeTyp(id);
      if (!ziel) continue;
      const k = kopiereRegel(regel, ziel);
      if (!k.regel.wenn.length) { ausgelassen += k.ausgelassen; continue; }
      const rw = regelwerkVon(ziel);
      await this.repo.setzeBerechtigungen(ziel.id, { grund: rw.grund, regeln: [...rw.regeln, k.regel] });
      kopiert++; ausgelassen += k.ausgelassen;
    }
    return { kopiert, ausgelassen };
  }

  /** Testlauf (#125): Mappe und Benutzer → CRUDP mit der Spur durch die Regeln (auch für einen ungespeicherten Entwurf). */
  async testlauf(e: { mappeId?: unknown; benutzerId?: unknown; berechtigungen?: unknown }) {
    const m = istUuid(e.mappeId) ? await this.repo.holeMappe(e.mappeId) : undefined;
    if (!m) throw new Fachfehler(404, t('meldungen.dienst.diese-mappe-gibt-es'));
    const person = this.konten?.benutzer ? (await this.konten.benutzer()).find((x) => x.id === e.benutzerId) : undefined;
    // Systemkonten und Paket-Benutzer (#710): auswählbar nur hier, damit man ihre Rechte nachprüfen kann.
    const b = person ?? (this.konten?.ohneMensch ? (await this.konten.ohneMensch()).find((x) => x.id === e.benutzerId && x.art) : undefined);
    if (!b) throw new Fachfehler(404, t('meldungen.dienst.diesen-benutzer-gibt-es'));
    const gespeichert = await this.repo.holeTyp(m.typId);
    if (!gespeichert) throw new Fachfehler(500, t('meldungen.dienst.der-mappentyp-dieser-mappe'));
    const typ = e.berechtigungen === undefined ? gespeichert : { ...gespeichert, berechtigungen: bereinigeRegelwerk(e.berechtigungen) };
    const mappe = { id: m.id, titel: m.titel ?? '', typId: m.typId };
    if (b.art) {
      // Wie im Zugriff solcher Konten: Rolle „Systemkonto“ bzw. „Paket“, nur Regeln, die diese Rolle nennen (#673).
      const konto = b.art === 'system' ? 'systemkonto' as const : 'paket' as const;
      const rolleId = (await this.kern.system()).kontorollen.get(konto)!;
      const a = await this.aufloesung(b.id);
      const name = b.art === 'dienst' ? `Paket: ${(await this.repo.listePakete()).find((p) => p.id === b.paketId)?.name ?? b.name}` : b.name;
      const z = await this.zugriff(b);
      const bestaetigt = !!z.typen.get(m.typId);
      const erg = rechteAnMappe(kontoRegelwerk(typ, rolleId), m, { id: b.id, rollen: [rolleId] }, a, await this.mappenquelle(b.id, [m.id]));
      // Wie rechteAn: Systemkonten sehen nie Passwörter; Pakete nie über die bei der Installation bestätigten Rechte hinaus.
      const w = erg.wirksam;
      const s = !!z.paket?.schreiben.has(m.typId);
      erg.wirksam = !bestaetigt ? { ...NICHTS } : z.paket ? { C: w.C && s, R: w.R, U: w.U && s, D: false, P: false } : { ...w, P: false };
      return { ...erg, admin: false, konto, ...(bestaetigt ? {} : { unbestaetigt: true }), mappe, benutzer: { id: b.id, name } };
    }
    const a = await this.aufloesung(b.id);
    const erg = rechteAnMappe(typ, m, { id: b.id, rollen: a.meineRollen }, a, await this.mappenquelle(b.id, [m.id]));
    // Leserecht auf Zeit (#798) mit seinem Grund: wirkt nur, wo die Regeln kein Lesen erlauben – und nur Lesen.
    const z = b.rolle === 'admin' ? undefined : (await this.repo.leserechteAufZeit(b.id)).find((x) => x.mappeId === m.id);
    const regulaer = erg.wirksam.R;
    if (z && !regulaer) erg.wirksam = { ...erg.wirksam, R: true };
    return {
      ...erg, admin: b.rolle === 'admin', mappe, benutzer: { id: b.id, name: b.name || b.email },
      ...(z ? { aufZeit: { aufgabe: z.aufgabentext, seit: z.seit, von: z.von ? await this.name(z.von) : null, wirkt: !regulaer } } : {}),
    };
  }

  /**
   * WebDAV-Laufwerk (#346): eine Mappe mit Lesen-Recht – Typ, Dokumente und die verknüpften Mappen
   * (Verweise in beide Richtungen, nur lesbare). Ohne Notizen, Aufgaben und Historie.
   */
  async laufwerkMappe(id: string, z: Zugriff) {
    const mappe = await this.pruefeRecht(z, id, 'R');
    const typ = z.typen.get(mappe.typId) ?? await this.repo.holeTyp(mappe.typId);
    const ziele = typ ? verweiseVon(typ, mappe.werte).map((v) => v.zielId) : [];
    const rueck = await this.repo.rueckverweise(id);
    const bezuege = await this.repo.bezuege([...new Set([...ziele, ...rueck.map((r) => r.quelleId)])].filter((x) => x !== id));
    const lesbar = await this.lesbare(z, [...bezuege.keys()]);
    const verknuepft = [...bezuege].filter(([k]) => lesbar.has(k)).map(([mid, x]) => ({ id: mid, titel: x.titel, typId: x.typId }));
    return { mappe, typ, dokumente: await this.repo.listeDokumente(id), verknuepft };
  }
}
