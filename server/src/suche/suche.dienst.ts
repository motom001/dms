/**
 * Suche (#964, aus dienst.ts): unscharfe Suche (#356, Tippfehler, gleichbedeutende Wörter, Wörterverzeichnis), Vektoren
 * zu Dokumenten und ähnliche Dokumente (#442, #444, #939). Bekommt den Kern, nicht den ganzen Dienst.
 */
import { randomUUID } from 'node:crypto';
import type { Benutzer, Mappe } from '../../../shared/src/model';
import type { Recht } from '../../../shared/src/rechte';
import { optionsGruppen } from '../../../shared/src/beschriftung';
import { liesWortgruppe, suchbegriffe, variantenVon, type Varianten } from '../../../shared/src/suche';
import { Fachfehler } from '../fehler';
import { MB } from '../grenzen';
import type { Kern, Zugreifender, Zugriff } from '../kern';
import { protokoll } from '../protokoll';
import { WOERTER_JE_LAUF, type Repo } from '../repo';
import { t } from '../sprache';
import { jeMappe, liesModell, liesVektor, SCHWELLE_STANDARD, Vektorindex, type Treffer } from '../vektoren';

/** Höchstens so viele eigene Gruppen gleichbedeutender Wörter (#356). */
const SYNONYM_GRUPPEN_MAX = 2000;
/** So lange wartet die Suche höchstens auf den Vektor des Suchbegriffs (#442); danach ohne Ähnlichkeit. */
export const SUCHE_VEKTOR_MS = 1500;
const liesModellOder422 = (x: unknown) => { try { return liesModell(x); } catch (e) { throw new Fachfehler(422, (e as Error).message); } };

/**
 * Was die Suche außer dem Kern braucht. Rechte prüfen gehört zur Schicht „zugriff“, die es noch nicht als eigenes Modul
 * gibt – bis dahin reicht der Dienst sie herein (wie beim Kern das Bilden des Zugriffs).
 */
export interface SucheAnschluss {
  /** Das Repo außerhalb jeder Transaktion: Der Zwischenspeicher der Vektoren gilt über Transaktionen hinweg. */
  grundRepo: Repo;
  lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>>;
  pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe>;
  /** Konten (vom Start verbunden): das Dienstkonto eines Pakets für „Wohin gehört das?“. */
  konten(): { dienstkonten?(): Promise<Benutzer[]> } | undefined;
}

export class SucheDienst {
  constructor(private readonly kern: Kern, private readonly anschluss: SucheAnschluss) {}

  private get repo(): Repo { return this.kern.repo; }
  private get grundRepo(): Repo { return this.anschluss.grundRepo; }
  private get einstellungen() { return this.kern.einstellungen; }
  private get konten() { return this.anschluss.konten(); }
  private zugriff(ich: Zugreifender): Promise<Zugriff> { return this.kern.zugriff(ich); }
  private lesbare(z: Zugriff | undefined, ids: string[]): Promise<Set<string>> { return this.anschluss.lesbare(z, ids); }
  private pruefeRecht(z: Zugriff | undefined, id: string, recht: Recht): Promise<Mappe> { return this.anschluss.pruefeRecht(z, id, recht); }

  /* ---------- Vektoren zu Dokumenten (#442) ---------- */

  /**
   * Wer den Vektor eines Suchbegriffs liefert (der Paket-Läufer, index.ts). null = kein Paket mit dms:vektoren
   * oder es antwortet nicht in der Zeit – dann läuft die Suche wie bisher.
   */
  vektorAnbieter?: { paket(): string | null; vektorFuer(text: string, ms: number): Promise<{ paket: string; modell: string; vektor: Float32Array; schwelle: number } | null> };
  /** Zwischenspeicher je Modell (beim ersten Bedarf aus der Datenbank geladen). */
  private vektorIndizes = new Map<string, Promise<Vektorindex | null>>();
  /** Aktuelles Modell je Paket: ändert es sich, sind die alten Vektoren ungültig. */
  private vektorModelle = new Map<string, string>();

  private vektorIndex(modell: string): Promise<Vektorindex | null> {
    let x = this.vektorIndizes.get(modell);
    if (!x) {
      const t = Date.now();
      let i: Vektorindex | null = null;
      x = this.grundRepo.vektorenLaden(modell, (teil) => {
        for (const e of teil) { i ??= new Vektorindex(e.vektor.length); if (e.vektor.length === i.dimension) i.setze(e.dokumentId, e.mappeId, e.vektor); }
      }).then(() => {
        this.vektorGeladen.add(modell);
        if (i) protokoll.modul('ablage').info('Vektoren geladen', { modell, anzahl: i.anzahl, ms: Date.now() - t, mb: Math.round(i.bytes / MB) });
        return i;
      });
      x.catch(() => { this.vektorIndizes.delete(modell); this.vektorGeladen.delete(modell); });
      this.vektorIndizes.set(modell, x);
    }
    return x;
  }
  /** Modelle, deren Zwischenspeicher fertig geladen ist (die Suche wartet nicht auf das Laden). */
  private vektorGeladen = new Set<string>();

  /* ---------- Unscharfe Suche (#356) ---------- */

  /** Gruppen gleichbedeutender Wörter, eine Minute gemerkt (jede Suche braucht sie). */
  private synonymZwischen: { zeit: number; gruppen: string[][] } | null = null;
  private async synonymGruppen(): Promise<string[][]> {
    if (!this.synonymZwischen || Date.now() - this.synonymZwischen.zeit > 60_000) this.synonymZwischen = { zeit: Date.now(), gruppen: (await this.repo.synonyme()).map((g) => g.woerter) };
    return this.synonymZwischen.gruppen;
  }
  /** Varianten der Begriffe einer einfachen Suche: gleichbedeutende Wörter und die Schreibweise ohne Bindestrich. */
  async suchVarianten(texte: Array<string | undefined>): Promise<Varianten> {
    const begriffe = texte.flatMap((t) => (t ? suchbegriffe(t) ?? [] : []));
    if (!begriffe.length) return {};
    // Beschriftungen der Auswahlwerte (#728) gelten wie gleichbedeutende Wörter: „Electricity“ findet den Wert „strom“.
    return variantenVon(begriffe, [...await this.synonymGruppen(), ...optionsGruppen((await this.repo.listeTypen()).flatMap((x) => x.felder))]);
  }
  /** Tippfehler-Suche an (Werkbank → Suche)? Standard: an. */
  async unscharfAn(): Promise<boolean> {
    return ((await this.einstellungen?.lies('suche')) as { unscharf?: boolean } | null)?.unscharf !== false;
  }
  /**
   * Neue Wörter ins Wörterverzeichnis übernehmen (#575): Die Trigger legen sie nur in einen Eingang (keine
   * Verklemmung mit Mappen und Texterkennung); das DMS arbeitet ihn alle paar Sekunden ab – in Teilen, damit ein
   * großer Import die Datenbank nicht lange am Stück beschäftigt. Liefert die Zahl der übernommenen Einträge.
   */
  async woerterEinarbeiten(): Promise<number> {
    let n = 0;
    for (;;) {
      const r = await this.repo.woerterEinarbeiten(WOERTER_JE_LAUF);
      if (r > 0) n += r;
      if (r < WOERTER_JE_LAUF) return n;
    }
  }
  /** Werkbank → Suche: Einstellung, Gruppen (Pakete mit Namen), Größe des Wörterverzeichnisses. */
  async sucheStand() {
    // Die Zahl der Wörter mit allem, was schon im Eingang steht (#575).
    await this.woerterEinarbeiten().catch(() => 0);
    const pakete = new Map((await this.repo.listePakete()).map((p) => [p.id, p.name] as const));
    return {
      unscharf: await this.unscharfAn(), woerter: await this.repo.woerterAnzahl(),
      synonyme: (await this.repo.synonyme()).map((g) => ({ ...g, ...(g.quelle !== 'werkbank' ? { paketName: pakete.get(g.quelle) ?? g.quelle } : {}) })),
    };
  }
  async setzeSuche(e: unknown, von: string) {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { unscharf?: unknown };
    if (typeof x.unscharf !== 'boolean') throw new Fachfehler(422, t('meldungen.dienst.unscharf-true-oder-false'));
    await this.einstellungen.schreibe('suche', x.unscharf ? null : { unscharf: false });
    protokoll.modul('werkbank').info('Suche: Tippfehler', { von, an: x.unscharf });
    return this.sucheStand();
  }
  private wortgruppe(roh: unknown): string[] {
    const g = liesWortgruppe(roh);
    if (g.fehler) throw new Fachfehler(422, g.fehler);
    return g.woerter;
  }
  async legeSynonymAn(e: unknown, von: string) {
    const woerter = this.wortgruppe((e as { woerter?: unknown } | null)?.woerter);
    if ((await this.repo.synonyme()).filter((g) => g.quelle === 'werkbank').length >= SYNONYM_GRUPPEN_MAX) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-eigene-gruppen', { SYNONYM_GRUPPEN_MAX }));
    await this.repo.legeSynonymAn({ id: randomUUID(), woerter, quelle: 'werkbank' });
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter angelegt', { von, woerter: woerter.length });
    return this.sucheStand();
  }
  async aendereSynonym(id: string, e: unknown, von: string) {
    const woerter = this.wortgruppe((e as { woerter?: unknown } | null)?.woerter);
    if (!(await this.repo.aendereSynonym(id, woerter))) throw new Fachfehler(404, t('meldungen.dienst.diese-gruppe-gibt-es'));
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter geändert', { von, woerter: woerter.length });
    return this.sucheStand();
  }
  async loescheSynonym(id: string, von: string) {
    if (!(await this.repo.loescheSynonym(id))) throw new Fachfehler(404, t('meldungen.dienst.diese-gruppe-gibt-es'));
    this.synonymZwischen = null;
    protokoll.modul('werkbank').info('Suche: gleichbedeutende Wörter entfernt', { von });
    return this.sucheStand();
  }
  /** Wortlisten eines Pakets (#356): ersetzen alle Gruppen dieses Pakets; leer = entfernen. */
  async setzePaketSynonyme(paket: string, gruppen: string[][]) {
    await this.repo.setzeSynonyme(paket, gruppen);
    this.synonymZwischen = null;
  }
  async paketSynonyme(paket: string): Promise<string[][]> {
    return (await this.repo.synonyme()).filter((g) => g.quelle === paket).map((g) => g.woerter);
  }
  async woerterNeu(von: string) {
    const t0 = Date.now();
    const n = await this.repo.woerterNeu();
    protokoll.modul('werkbank').info('Suche: Wörterverzeichnis neu aufgebaut', { von, woerter: n, ms: Date.now() - t0 });
    return this.sucheStand();
  }

  /** Suche mit Ähnlichkeit an (Werkbank → Pakete, Einstellung des Kerns)? Standard: an. */
  async vektorEinstellung(): Promise<{ suche: boolean }> {
    const v = (await this.einstellungen?.lies('vektoren')) as { suche?: boolean } | null;
    return { suche: v?.suche !== false };
  }
  async setzeVektorEinstellung(e: unknown): Promise<{ suche: boolean }> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const x = (e ?? {}) as { suche?: unknown };
    if (typeof x.suche !== 'boolean') throw new Fachfehler(422, t('meldungen.dienst.suche-true-oder-false'));
    await this.einstellungen.schreibe('vektoren', x.suche ? null : { suche: false });
    return this.vektorEinstellung();
  }

  /**
   * Das Modell eines Pakets ist (wieder) bekannt. Neues Modell → die Vektoren des alten sind ungültig und
   * fallen weg; die Nachberechnung (Paket-Läufer) rechnet sie im Hintergrund neu.
   */
  async merkeVektorModell(paket: string, modell: string): Promise<void> {
    if (this.vektorModelle.get(paket) === modell) return;
    this.vektorModelle.set(paket, modell);
    const weg = await this.grundRepo.vektorenLoeschePaket(paket, modell);
    if (weg) {
      for (const k of [...this.vektorIndizes.keys()]) if (k !== modell) { this.vektorIndizes.delete(k); this.vektorGeladen.delete(k); }
      protokoll.modul('werkbank').info('Vektoren eines alten Modells entfernt', { paket, modell, entfernt: weg });
    }
    // Zwischenspeicher schon jetzt im Hintergrund laden (bei 100 000 Dokumenten gut eine Sekunde).
    void this.vektorIndex(modell).catch(() => {});
  }

  private pruefeVektorRecht(z: Zugriff | undefined): string {
    if (!z?.paket) throw new Fachfehler(403, t('meldungen.dienst.vektoren-schreiben-nur-pakete'));
    if (!z.paket.schnittstellen?.includes('dms:vektoren')) throw new Fachfehler(403, t('meldungen.dienst.dieses-paket-hat-das'));
    return z.paket.id;
  }

  /** Vektor eines Dokuments setzen (nur Pakete mit dms:vektoren; das Dokument muss das Paket lesen dürfen – prüft die Route). */
  async setzeVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown, eingabe: unknown) {
    const paket = this.pruefeVektorRecht(z);
    const modell = liesModellOder422(modellRoh);
    const index = await this.vektorIndex(modell);
    let vektor: Float32Array;
    try { vektor = liesVektor((eingabe as { vektor?: unknown } | null)?.vektor, index?.dimension); } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    await this.merkeVektorModell(paket, modell);
    const d = await this.repo.holeDokument(dokumentId);
    if (!d || !(await this.repo.vektorSetze({ dokumentId, paket, modell, vektor }))) throw new Fachfehler(404, t('meldungen.dienst.dieses-dokument-gibt-es'));
    const i = await this.vektorIndex(modell);
    if (i) i.setze(dokumentId, d.mappeId, vektor);
    else this.vektorIndizes.set(modell, Promise.resolve(new Vektorindex(vektor.length, [{ dokumentId, mappeId: d.mappeId, vektor }])));
    return { dokument: dokumentId, modell, dimension: vektor.length };
  }

  async loescheVektor(z: Zugriff | undefined, dokumentId: string, modellRoh: unknown) {
    this.pruefeVektorRecht(z);
    const modell = liesModellOder422(modellRoh);
    const n = await this.repo.vektorLoesche(dokumentId, modell);
    (await this.vektorIndex(modell))?.entferne(dokumentId);
    return { entfernt: n };
  }

  /**
   * Ähnliche Dokumente zu einem Vektor oder zu einem Dokument – nur in Mappen, die der Aufrufer lesen darf.
   * Ohne Modell: das aktuelle Modell des Pakets mit dms:vektoren.
   */
  async aehnlicheDokumente(z: Zugriff | undefined, q: { modell?: unknown; vektor?: unknown; dokument?: string; anzahl?: unknown; schwelle?: unknown }): Promise<{ modell: string; treffer: Treffer[] }> {
    const modell = q.modell === undefined || q.modell === '' ? this.aktuellesVektorModell() : liesModellOder422(q.modell);
    if (!modell) return { modell: '', treffer: [] };
    const index = await this.vektorIndex(modell);
    if (!index) return { modell, treffer: [] };
    const anzahl = Math.min(100, Math.max(1, Math.floor(Number(q.anzahl) || 10)));
    const schwelle = q.schwelle === undefined || q.schwelle === '' ? -1 : Number(q.schwelle);
    if (!Number.isFinite(schwelle) || schwelle < -1 || schwelle > 1) throw new Fachfehler(422, t('meldungen.dienst.schwelle-eine-zahl-von'));
    let v: Float32Array;
    const ohne = new Set<string>();
    if (q.dokument) {
      const x = index.vektor(q.dokument);
      if (!x) throw new Fachfehler(404, t('meldungen.dienst.zu-diesem-dokument-gibt'));
      v = x; ohne.add(q.dokument);
    } else {
      try { v = liesVektor(q.vektor, index.dimension); } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    }
    return { modell, treffer: await this.lesbareTreffer(z, index, v, anzahl, { schwelle, ohne }) };
  }

  /** Die besten lesbaren Treffer: erst mehr Kandidaten holen, dann nach Rechten filtern (bei Bedarf mehr). */
  private async lesbareTreffer(z: Zugriff | undefined, index: Vektorindex, v: Float32Array, anzahl: number, opt: { schwelle: number; ohne?: Set<string>; jeMappe?: boolean; ohneMappen?: Set<string> }): Promise<Treffer[]> {
    for (let k = Math.max(50, anzahl * 5); ; k *= 4) {
      const roh = index.suche(v, k, { schwelle: opt.schwelle, ohne: opt.ohne });
      const ok = await this.lesbare(z, [...new Set(roh.map((t) => t.mappeId))]);
      const lesbar = roh.filter((t) => ok.has(t.mappeId) && !opt.ohneMappen?.has(t.mappeId));
      const erg = opt.jeMappe ? jeMappe(lesbar, anzahl) : lesbar.slice(0, anzahl);
      if (erg.length >= anzahl || roh.length < k || k >= index.anzahl) return erg;
    }
  }

  /** Aktuelles Modell (Paket mit dms:vektoren); ohne Antwort des Pakets das zuletzt gesehene. */
  private aktuellesVektorModell(): string | null {
    const p = this.vektorAnbieter?.paket();
    return (p && this.vektorModelle.get(p)) ?? [...this.vektorModelle.values()][0] ?? null;
  }

  /**
   * „Ähnliche Dokumente“ an einer Mappe: je Dokument der Mappe die ähnlichsten Dokumente anderer lesbarer
   * Mappen, zusammengefasst je Mappe. verfuegbar = es gibt ein Paket mit dms:vektoren.
   */
  async aehnlicheZurMappe(z: Zugriff | undefined, mappeId: string): Promise<{ verfuegbar: boolean; berechnet: boolean; mappen: Array<{ id: string; titel: string; typId: string; dokument: { id: string; name: string }; aehnlichkeit: number }> }> {
    const paket = this.vektorAnbieter?.paket() ?? null;
    if (!paket) return { verfuegbar: false, berechnet: false, mappen: [] };
    await this.pruefeRecht(z, mappeId, 'R');
    const modell = this.aktuellesVektorModell();
    const index = modell ? await this.vektorIndex(modell) : null;
    const eigene = (await this.repo.dokumenteVon([mappeId])).map((d) => d.id);
    const vektoren = index ? eigene.map((id) => index.vektor(id)).filter((v): v is Float32Array => !!v) : [];
    if (!index || !vektoren.length) return { verfuegbar: true, berechnet: false, mappen: [] };
    const schwelle = this.vektorSchwelle.get(modell!) ?? SCHWELLE_STANDARD;
    const alle = (await Promise.all(vektoren.map((v) => this.lesbareTreffer(z, index, v, 5, { schwelle, jeMappe: true, ohneMappen: new Set([mappeId]) })))).flat();
    return { verfuegbar: true, berechnet: true, mappen: await this.trefferMitTitel(jeMappe(alle, 5)) };
  }

  /** Schwelle je Modell, wie das Paket sie mit dem Vektor des Suchbegriffs meldet. */
  private vektorSchwelle = new Map<string, number>();

  private async trefferMitTitel(t: Treffer[]) {
    if (!t.length) return [];
    const b = await this.repo.bezuege(t.map((x) => x.mappeId));
    const namen = new Map<string, string>();
    for (const x of t) { const d = await this.repo.holeDokument(x.dokumentId); if (d) namen.set(x.dokumentId, d.name); }
    return t.filter((x) => b.has(x.mappeId)).map((x) => ({ id: x.mappeId, titel: b.get(x.mappeId)!.titel, typId: b.get(x.mappeId)!.typId, dokument: { id: x.dokumentId, name: namen.get(x.dokumentId) ?? '' }, aehnlichkeit: Math.round(x.aehnlichkeit * 100) / 100 }));
  }

  /**
   * Ähnliche Treffer zu einem Suchbegriff (#442): das Paket liefert den Vektor (mit Zeitgrenze), der Kern
   * vergleicht. Leer, wenn die Einstellung aus ist, kein Paket da ist oder es nicht rechtzeitig antwortet.
   * typen: nur Mappen dieser Typen (die der Ansicht); ohneMappen: schon in der normalen Trefferliste.
   */
  async aehnlicheZurSuche(z: Zugriff | undefined, suche: string, opt: { typen: Set<string> | null; ohneMappen: Set<string>; anzahl?: number; ms?: number }) {
    if (!this.vektorAnbieter?.paket() || suche.trim().length < 3 || !(await this.vektorEinstellung()).suche) return [];
    const ms = opt.ms ?? SUCHE_VEKTOR_MS, start = Date.now();
    const q = await this.vektorAnbieter.vektorFuer(suche, ms).catch(() => null);
    if (!q) return [];
    await this.merkeVektorModell(q.paket, q.modell);
    this.vektorSchwelle.set(q.modell, q.schwelle);
    // Lädt der Zwischenspeicher noch (kurz nach dem Start): höchstens die restliche Zeit warten, sonst ohne Ähnlichkeit.
    if (!this.vektorGeladen.has(q.modell)) {
      const rest = Math.max(0, ms - (Date.now() - start));
      await Promise.race([this.vektorIndex(q.modell).catch(() => null), new Promise((ok) => setTimeout(ok, rest).unref?.())]);
      if (!this.vektorGeladen.has(q.modell)) return [];
    }
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return [];
    let treffer = await this.lesbareTreffer(z, index, q.vektor, (opt.anzahl ?? 5) * 3, { schwelle: q.schwelle, jeMappe: true, ohneMappen: opt.ohneMappen });
    if (opt.typen) {
      const b = await this.repo.bezuege(treffer.map((t) => t.mappeId));
      treffer = treffer.filter((t) => opt.typen!.has(b.get(t.mappeId)?.typId ?? ''));
    }
    return this.trefferMitTitel(treffer.slice(0, opt.anzahl ?? 5));
  }

  /**
   * Ähnliche Dokumente zu einem freien Text (#444, „Frag deine Ablage“): das Paket liefert den Vektor (mit
   * Zeitgrenze), der Kern vergleicht – nur lesbare Mappen, je Mappe das beste Dokument. Leer ohne Paket.
   */
  async aehnlicheZuText(z: Zugriff | undefined, text: string, anzahl: number, ms: number): Promise<Treffer[]> {
    if (!this.vektorAnbieter?.paket() || text.trim().length < 3) return [];
    const q = await this.vektorAnbieter.vektorFuer(text, ms).catch(() => null);
    if (!q) return [];
    await this.merkeVektorModell(q.paket, q.modell);
    if (!this.vektorGeladen.has(q.modell)) return [];
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return [];
    return this.lesbareTreffer(z, index, q.vektor, anzahl, { schwelle: q.schwelle, jeMappe: true });
  }

  /**
   * Ähnlichkeit für „Wohin gehört das?“ (#939, dms-registry#142): die Mappentypen der ähnlichsten abgelegten Dokumente
   * zu einem Text – nur Mappen, die die Person **und** der Benutzer des Pakets lesen dürfen, und nur Typen aus `typen`
   * (Kandidaten: „Kann aus Post angelegt werden“, Anlegerecht, für KI-Dienste zugelassen). Je Mappe das beste Dokument,
   * höchstens `anzahl`. Heraus gehen nur Typ und Ähnlichkeit – keine Ids, Titel oder Inhalte. null: kein Paket mit
   * dms:vektoren (bzw. ein anderes als `paket`), keine Antwort in `ms` oder der Zwischenspeicher lädt noch.
   */
  async aehnlicheTypen(z: Zugriff | undefined, paket: string, text: string, typen: ReadonlySet<string>, anzahl: number, ms: number): Promise<Array<{ typ: string; aehnlichkeit: number }> | null> {
    if (this.vektorAnbieter?.paket() !== paket || text.trim().length < 3 || !typen.size) return null;
    const start = Date.now();
    const q = await this.vektorAnbieter.vektorFuer(text, ms).catch(() => null);
    if (!q || q.paket !== paket) return null;
    await this.merkeVektorModell(q.paket, q.modell);
    if (!this.vektorGeladen.has(q.modell)) {
      const rest = Math.max(0, ms - (Date.now() - start));
      await Promise.race([this.vektorIndex(q.modell).catch(() => null), new Promise((ok) => setTimeout(ok, rest).unref?.())]);
      if (!this.vektorGeladen.has(q.modell)) return null;
    }
    const index = await this.vektorIndex(q.modell);
    if (!index || index.dimension !== q.vektor.length) return null;
    const konto = (await this.konten?.dienstkonten?.())?.find((b) => b.paketId === paket);
    const zp = await this.zugriff({ id: konto?.id ?? `paket:${paket}`, rolle: 'mitglied', art: 'dienst', paketId: paket });
    const roh = index.suche(q.vektor, Math.min(index.anzahl, Math.max(200, anzahl * 20)), { schwelle: q.schwelle });
    const ids = [...new Set(roh.map((x) => x.mappeId))];
    const [person, paketDarf, bezuege] = await Promise.all([this.lesbare(z, ids), this.lesbare(zp, ids), this.repo.bezuege(ids)]);
    const ok = roh.filter((x) => person.has(x.mappeId) && paketDarf.has(x.mappeId) && typen.has(bezuege.get(x.mappeId)?.typId ?? ''));
    return jeMappe(ok, anzahl).map((x) => ({ typ: bezuege.get(x.mappeId)!.typId, aehnlichkeit: Math.round(x.aehnlichkeit * 100) / 100 }));
  }

  /** Für die Werkbank: Vektoren je Modell, Dokumente mit Volltext, Einstellung. */
  async vektorStand(): Promise<{ paket: string | null; modell: string | null; mitVektor: number; mitVolltext: number; modelle: Array<{ paket: string; modell: string; anzahl: number }>; suche: boolean; zwischenspeicherMB: number | null }> {
    const paket = this.vektorAnbieter?.paket() ?? null;
    const modell = paket ? this.vektorModelle.get(paket) ?? null : this.aktuellesVektorModell();
    const modelle = await this.repo.vektorStand();
    const index = modell && this.vektorIndizes.has(modell) ? await this.vektorIndex(modell) : null;
    return {
      paket, modell, modelle,
      mitVektor: modelle.filter((m) => m.paket === paket && m.modell === modell).reduce((n, m) => n + m.anzahl, 0),
      mitVolltext: await this.repo.mitVolltext(),
      suche: (await this.vektorEinstellung()).suche,
      zwischenspeicherMB: index ? Math.round(index.bytes / 104857.6) / 10 : null,
    };
  }

  /** „Neu berechnen“ in der Werkbank: alle Vektoren des Pakets weg, die Nachberechnung beginnt von vorn. */
  async vektorenNeu(paket: string): Promise<{ entfernt: number }> {
    const n = await this.grundRepo.vektorenLoeschePaket(paket);
    this.vektorIndizes.clear(); this.vektorGeladen.clear();
    return { entfernt: n };
  }
}
