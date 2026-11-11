import type postgres from 'postgres';
import {
  budgetStand, kennzahlen, KOSTEN_STANDARD, kostenFuer, liesKosten, MONATE, monatsanfang, monatSchluessel, naechsterMonat, pruefeKosten, ROH_TAGE, TIMING_MAX,
  type BudgetStand, type ExternMessung, type ExternAufruf, type ExternerDienst, type ExternErgebnis, type ExternKennzahlen, type KostenEinstellung,
} from '../../shared/src/extern';
import type { Einstellungen } from './einstellungen';
import type { ImapSitzung, ImapVerbinder } from './postfach';
import { Fachfehler } from './fehler';
import { kontext, protokoll } from './protokoll';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Messpunkt für externe Dienste (#565): KI-Dienst (Pakete mit Inhalten und Netz), Postfach-Abruf (IMAP), Versand
 * (SMTP), Anmeldung über einen Anbieter (OIDC) und Netzzugriffe der übrigen Pakete (`dms.netz`). Alle Anschlüsse
 * melden hierher – `messe()` stoppt einen Aufruf, `erfasse()` nimmt einen schon gemessenen (der Paket-Läufer misst im
 * eigenen Prozess und gibt die Werte mit dem Ergebnis zurück).
 *
 * Gespeichert werden nur Metadaten: Dienst, Paket, Funktion, Person (Id), Dauer bis zur ersten Antwort und gesamt,
 * Bytes, Ergebnis, Token und die daraus geschätzten Kosten. Nie Inhalte, Adressen, Betreffs oder URLs. Rohdaten
 * `ROH_TAGE` Tage, danach nur Monatssummen (`MONATE` Monate). Nichts geht nach außen.
 *
 * Eine Instanz für den Prozess (`extern`), wie das Protokoll: Anschlüsse brauchen so keine Verdrahtung. ablago.ts
 * setzt Speicher und Einstellungen; ohne sie zählt ein Speicher im Arbeitsspeicher (Tests).
 */

/** Ein gespeicherter Aufruf. */
export interface ExternZeile extends ExternAufruf { id?: number; zeit: string; benutzerId: string | null; kosten: number }
/** Summe je Dienst, Paket, Funktion und Person in einem Zeitraum. */
export interface ExternSumme { dienst: ExternerDienst; paket: string | null; funktion: string | null; benutzerId: string | null; anzahl: number; fehler: number; ms: number; tokenEin: number; tokenAus: number; kosten: number }

export interface ExternSpeicher {
  merke(z: ExternZeile): Promise<void>;
  /** Aufrufe seit `seit`, neueste zuerst. */
  aufrufe(seit: Date, max: number, paket?: string): Promise<ExternZeile[]>;
  /** Summen in [von, bis) aus Rohdaten und Monatssummen. */
  summen(von: Date, bis: Date): Promise<ExternSumme[]>;
  /** Teuerste Aufrufe in [von, bis) (nach Kosten, dann Token) – nur aus den Rohdaten. */
  teuerste(von: Date, bis: Date, n: number): Promise<ExternZeile[]>;
  /** Monate mit Daten („2026-11“), neueste zuerst. */
  monate(): Promise<string[]>;
  /** Rohdaten vor `rohBis` in Monatssummen verdichten, Monatssummen vor `monatBis` löschen. */
  verdichte(rohBis: Date, monatBis: Date): Promise<void>;
  /** Gemerktes schreiben (vor dem Lesen, beim Herunterfahren). */
  schreibe(): Promise<void>;
}

const log = protokoll.modul('system');
/** Ist die Einstellung bzw. die Summe des Monats älter, wird sie neu gelesen (mehrere Prozesse, #745). */
const FRISCH_MS = 60_000;

export interface Messpunkt {
  /** Erste Antwort ist da (Kopf, Begrüßung, Verbindung). */
  erste(): void;
  /** Erste Antwort kam so viele ms nach dem Start (vom Anschluss gemessen, z. B. SMTP: Umschlag angenommen). */
  ersteNach(ms: number): void;
  bytes(hin: number, zurueck: number): void;
  token(ein: number, aus: number): void;
  /** Ergebnis ausdrücklich setzen (z. B. Antwort 5xx ohne Ausnahme). */
  ergebnis(e: ExternErgebnis): void;
}

/** Zeitüberschreitung? (AbortSignal.timeout, Socket-Zeitgrenzen von imapflow und nodemailer, Läufer) */
export function istZeitueberschreitung(e: unknown): boolean {
  const f = e as { name?: string; code?: string; message?: string } | null;
  return !!f && (f.name === 'TimeoutError' || /^(ETIMEDOUT|ETIMEOUT|ESOCKETTIMEDOUT|ECONNECTIONTIMEOUT|UND_ERR_.*TIMEOUT)$/.test(String(f.code ?? ''))
    || /timeout|zeitgrenze|timed out/i.test(String(f.message ?? '')) || (f.name === 'AbortError' && /timeout/i.test(String(f.message ?? ''))));
}

export class Externmessung {
  private speicher: ExternSpeicher = speicherExternSpeicher();
  private einstellungen: Einstellungen | null = null;
  private kosten: { wert: KostenEinstellung; geladen: number } = { wert: KOSTEN_STANDARD, geladen: 0 };
  /** Kosten des laufenden Monats (geschätzt), mit Zeitpunkt des Lesens; Warnung je Monat einmal. */
  private monat: { schluessel: string; summe: number; geladen: number; gewarnt: 0 | 1 | 2 } = { schluessel: '', summe: 0, geladen: 0, gewarnt: 0 };
  private laden: Promise<void> | null = null;
  private zuletztVerdichtet = 0;
  /** Uhr (Tests). */
  jetzt: () => Date = () => new Date();

  setze(o: { speicher?: ExternSpeicher; einstellungen?: Einstellungen | null }) {
    if (o.speicher) this.speicher = o.speicher;
    if (o.einstellungen !== undefined) this.einstellungen = o.einstellungen;
    this.kosten = { wert: KOSTEN_STANDARD, geladen: 0 };
    this.monat = { schluessel: '', summe: 0, geladen: 0, gewarnt: 0 };
  }

  /**
   * Einen Aufruf messen: `f` bekommt den Messpunkt (erste Antwort, Bytes, Token). Wirft `f`, zählt der Aufruf als Fehler
   * bzw. Zeitüberschreitung, und die Ausnahme geht weiter.
   */
  async messe<T>(art: { dienst: ExternerDienst; paket?: string | null; funktion?: string | null }, f: (m: Messpunkt) => Promise<T>): Promise<T> {
    const start = performance.now();
    let erste: number | null = null, hin = 0, zurueck = 0, ein = 0, aus = 0, ergebnis: ExternErgebnis | null = null;
    const m: Messpunkt = {
      erste: () => { erste ??= performance.now() - start; },
      ersteNach: (ms) => { if (Number.isFinite(ms) && ms >= 0) erste ??= ms; },
      bytes: (h, z) => { hin += Math.max(0, h || 0); zurueck += Math.max(0, z || 0); },
      token: (e, a) => { ein += Math.max(0, e || 0); aus += Math.max(0, a || 0); },
      ergebnis: (e) => { ergebnis = e; },
    };
    const ende = (e: ExternErgebnis) => this.erfasse({ dienst: art.dienst, paket: art.paket ?? null, funktion: art.funktion ?? null, ersteMs: erste ?? (e === 'ok' ? performance.now() - start : null), ms: performance.now() - start, hin, zurueck, ergebnis: ergebnis ?? e, tokenEin: ein, tokenAus: aus });
    try {
      const r = await f(m);
      ende('ok');
      return r;
    } catch (e) {
      ende(istZeitueberschreitung(e) ? 'zeit' : 'fehler');
      throw e;
    }
  }

  /** Einen gemessenen Aufruf aufnehmen: Anfrage (Server-Timing), Speicher, Kosten des Monats. Wirft nie. */
  erfasse(a: ExternAufruf, o: { hintergrund?: boolean } = {}) {
    try {
      // Hintergrund (z. B. Ereignisse an Pakete): gehört zu keiner Anfrage und keiner Person – auch wenn eine Anfrage sie anstieß.
      const k = o.hintergrund ? undefined : kontext.getStore();
      const x: ExternAufruf = { ...a, ms: Math.max(0, a.ms), ersteMs: a.ersteMs === null ? null : Math.max(0, a.ersteMs), funktion: a.funktion ? a.funktion.slice(0, 60) : null, paket: a.paket ? a.paket.slice(0, 100) : null };
      if (k) (k.extern ??= []).push(x);
      const kosten = a.dienst === 'ki' && a.paket ? kostenFuer(a.tokenEin, a.tokenAus, this.kosten.wert.preise[a.paket]) : 0;
      const jetzt = this.jetzt();
      if (kosten > 0 && this.monat.schluessel === monatSchluessel(jetzt)) { this.monat.summe += kosten; this.pruefeBudget(jetzt); }
      this.speicher.merke({ ...x, ms: Math.round(x.ms), ersteMs: x.ersteMs === null ? null : Math.round(x.ersteMs), zeit: jetzt.toISOString(), benutzerId: k?.benutzerId ?? null, kosten })
        .catch((e) => log.error('Messwert eines externen Dienstes nicht gespeichert', { fehler: (e as Error).message }));
      if (Date.now() - this.zuletztVerdichtet > 3_600_000) { this.zuletztVerdichtet = Date.now(); void this.aufraeumen(); }
      if (this.veraltet(jetzt)) void this.frisch();
    } catch (e) { log.error('Messwert eines externen Dienstes nicht erfasst', { fehler: (e as Error).message }); }
  }

  /** Rohdaten älter als ROH_TAGE verdichten, Monatssummen älter als MONATE löschen (Datenschutz). */
  async aufraeumen() {
    const jetzt = this.jetzt();
    const monatBis = new Date(jetzt.getFullYear(), jetzt.getMonth() - MONATE + 1, 1);
    await this.speicher.verdichte(new Date(jetzt.getTime() - ROH_TAGE * 86_400_000), monatBis)
      .catch((e) => log.warn('Messwerte externer Dienste nicht verdichtet', { fehler: (e as Error).message }));
  }

  /** Gemerktes schreiben (Herunterfahren, Tests). */
  schreibe() { return this.speicher.schreibe(); }

  private veraltet(jetzt: Date) {
    return Date.now() - this.kosten.geladen > FRISCH_MS || this.monat.schluessel !== monatSchluessel(jetzt) || Date.now() - this.monat.geladen > FRISCH_MS;
  }

  /** Einstellung und Kosten des Monats neu lesen (gebündelt). */
  frisch(): Promise<void> {
    this.laden ??= (async () => {
      try {
        const jetzt = this.jetzt();
        this.kosten = { wert: liesKosten(this.einstellungen ? await this.einstellungen.lies('extern_kosten') : null), geladen: Date.now() };
        await this.speicher.schreibe();
        const summe = (await this.speicher.summen(monatsanfang(jetzt), naechsterMonat(jetzt))).reduce((n, s) => n + s.kosten, 0);
        const schluessel = monatSchluessel(jetzt);
        this.monat = { schluessel, summe, geladen: Date.now(), gewarnt: this.monat.schluessel === schluessel ? this.monat.gewarnt : 0 };
        this.pruefeBudget(jetzt);
      } catch (e) { log.warn('Kosten externer Dienste nicht gelesen', { fehler: (e as Error).message }); }
      finally { this.laden = null; }
    })();
    return this.laden;
  }

  /** Warnung im Protokoll bei 80 % und beim Erreichen – je Monat einmal. */
  private pruefeBudget(jetzt: Date) {
    const b = budgetStand(this.monat.summe, this.kosten.wert, jetzt);
    if (b.erreicht && this.monat.gewarnt < 2) {
      this.monat.gewarnt = 2;
      log.warn(b.pausiertBis ? 'Monatsbudget der KI-Dienste erreicht: kostenpflichtige KI-Funktionen pausiert' : 'Monatsbudget der KI-Dienste erreicht', { summe: runde(b.summe), budget: b.budget, ...(b.pausiertBis ? { bis: b.pausiertBis } : {}) });
    } else if (b.warnung && this.monat.gewarnt < 1) {
      this.monat.gewarnt = 1;
      log.warn('Monatsbudget der KI-Dienste zu 80 % verbraucht', { summe: runde(b.summe), budget: b.budget });
    }
  }

  /** Stand des Budgets im laufenden Monat (aus dem Gemerkten). */
  budget(): BudgetStand & { waehrung: string } {
    const jetzt = this.jetzt();
    const summe = this.monat.schluessel === monatSchluessel(jetzt) ? this.monat.summe : 0;
    return { ...budgetStand(summe, this.kosten.wert, jetzt), waehrung: this.kosten.wert.waehrung };
  }

  /**
   * Pausiert (#565, harte Grenze)? Nur Pakete mit Preis – ein lokaler Dienst ohne Kosten läuft weiter. Liefert den
   * Monatsanfang (ISO), bis zu dem pausiert ist, sonst null. Ohne Warten (Zustellung der Ereignisse fragt je Runde).
   */
  pausiertBis(paket: string): string | null {
    const jetzt = this.jetzt();
    if (this.veraltet(jetzt)) void this.frisch();
    const p = this.kosten.wert.preise[paket];
    if (!p || (!p.ein && !p.aus)) return null;
    return this.budget().pausiertBis;
  }

  /** Wirft mit verständlicher Meldung, wenn kostenpflichtige KI-Funktionen dieses Pakets pausieren. */
  async pruefePause(paket: string): Promise<void> {
    if (this.veraltet(this.jetzt())) await this.frisch();
    const bis = this.pausiertBis(paket);
    if (bis) throw new Fachfehler(429, t('meldungen.extern.pausiert', { datum: new Date(bis).toLocaleDateString(gebietsschema(), { day: 'numeric', month: 'long', year: 'numeric' }) }), { pausiertBis: bis });
  }

  /* ---------- Werkbank ---------- */

  async kostenEinstellung(): Promise<KostenEinstellung> {
    await this.frisch();
    return this.kosten.wert;
  }

  async setzeKosten(x: unknown, von: string): Promise<KostenEinstellung> {
    if (!this.einstellungen) throw new Fachfehler(404, t('meldungen.dienst.einstellungen-sind-nicht'));
    const { wert, fehler } = pruefeKosten(x);
    if (Object.keys(fehler).length) throw new Fachfehler(422, Object.values(fehler)[0], { felderFehler: fehler });
    await this.einstellungen.schreibe('extern_kosten', wert);
    log.info('Preise und Budget der KI-Dienste geändert', { pakete: Object.keys(wert.preise).length, budget: wert.budget, hart: wert.hart, waehrung: wert.waehrung, von });
    this.kosten.geladen = 0;
    this.monat.gewarnt = 0;
    await this.frisch();
    return this.kosten.wert;
  }

  /**
   * Kennzahlen je Dienst (und Paket) seit `stunden` Stunden: Mittel, p50, p95, Fehler, Zeitüberschreitungen; dazu die
   * letzten Aufrufe. Mit `paket` nur dessen Aufrufe (Paketansicht).
   */
  async uebersicht(stunden: number, paket?: string): Promise<{ stunden: number; dienste: Array<{ dienst: ExternerDienst; paket: string | null } & ExternKennzahlen>; letzte: ExternZeile[] }> {
    await this.speicher.schreibe();
    const h = Math.min(24 * ROH_TAGE, Math.max(1, Math.round(stunden) || 24));
    const liste = await this.speicher.aufrufe(new Date(this.jetzt().getTime() - h * 3_600_000), 50_000, paket);
    const gruppen = new Map<string, ExternZeile[]>();
    for (const z of liste) { const k = `${z.dienst}\u0000${z.paket ?? ''}`; gruppen.set(k, [...(gruppen.get(k) ?? []), z]); }
    const dienste = [...gruppen.values()].map((g) => ({ dienst: g[0].dienst, paket: g[0].paket, ...kennzahlen(g) }))
      .sort((a, b) => a.dienst.localeCompare(b.dienst) || (a.paket ?? '').localeCompare(b.paket ?? ''));
    return { stunden: h, dienste, letzte: liste.slice(0, 20) };
  }

  /** Auswertung eines Monats: je Paket, Person, Funktion; die teuersten Aufrufe; Budget. Nur Metadaten. */
  async auswertung(monat: Date, teuerste = 20) {
    await this.speicher.schreibe();
    await this.frisch();
    const von = monatsanfang(monat), bis = naechsterMonat(monat);
    const summen = (await this.speicher.summen(von, bis)).filter((s) => s.dienst === 'ki');
    const nach = <K extends string | null>(f: (s: ExternSumme) => K) => {
      const m = new Map<K, { anzahl: number; fehler: number; ms: number; tokenEin: number; tokenAus: number; kosten: number }>();
      for (const s of summen) {
        const x = m.get(f(s)) ?? { anzahl: 0, fehler: 0, ms: 0, tokenEin: 0, tokenAus: 0, kosten: 0 };
        x.anzahl += s.anzahl; x.fehler += s.fehler; x.ms += s.ms; x.tokenEin += s.tokenEin; x.tokenAus += s.tokenAus; x.kosten += s.kosten;
        m.set(f(s), x);
      }
      return [...m].map(([schluessel, w]) => ({ schluessel, ...w, kosten: runde(w.kosten) })).sort((a, b) => b.kosten - a.kosten || (b.tokenEin + b.tokenAus) - (a.tokenEin + a.tokenAus));
    };
    const gesamt = nach(() => 'gesamt')[0] ?? { schluessel: 'gesamt', anzahl: 0, fehler: 0, ms: 0, tokenEin: 0, tokenAus: 0, kosten: 0 };
    const laufend = monatSchluessel(von) === monatSchluessel(this.jetzt());
    return {
      monat: monatSchluessel(von),
      monate: [...new Set([monatSchluessel(this.jetzt()), ...await this.speicher.monate()])].sort().reverse(),
      einstellung: this.kosten.wert,
      gesamt,
      budget: laufend ? this.budget() : { ...budgetStand(gesamt.kosten, this.kosten.wert, von), pausiertBis: null, waehrung: this.kosten.wert.waehrung },
      jePaket: nach((s) => s.paket),
      jePerson: nach((s) => s.benutzerId),
      jeFunktion: nach((s) => s.funktion),
      teuerste: (await this.speicher.teuerste(von, bis, Math.min(100, Math.max(1, teuerste)))).filter((z) => z.dienst === 'ki'),
      rohTage: ROH_TAGE,
      monateAufbewahrt: MONATE,
    };
  }
}

const runde = (x: number) => Math.round(x * 1_000_000) / 1_000_000;

/** Der Messpunkt des Prozesses. */
export const extern = new Externmessung();

/**
 * Aufrufe externer Dienste der laufenden Anfrage fürs Messpanel (#565) – für Antworten als Strom (NDJSON), deren Kopf
 * Server-Timing schon vor dem Aufruf ging („Frag deine Ablage“). Nur Metadaten.
 */
export function externDerAnfrage(): ExternMessung[] | undefined {
  const l = kontext.getStore()?.extern;
  return l?.length ? l.slice(0, TIMING_MAX).map((a) => ({ dienst: a.dienst, paket: a.paket, ersteMs: a.ersteMs === null ? null : Math.round(a.ersteMs), ms: Math.round(a.ms), bytes: a.hin + a.zurueck, ergebnis: a.ergebnis })) : undefined;
}

/* ---------- Anschlüsse ---------- */

/**
 * Externe Dienste (#565): Eine Sitzung mit dem Mailserver ist ein Aufruf – Dauer bis zur Anmeldung (erste Antwort) und
 * bis zum Schließen, Bytes, Ergebnis (schlägt eine Abfrage fehl, die ganze Sitzung). Nie Ordner, Betreffs oder Adressen.
 */
export function imapGemessen(verbinde: ImapVerbinder): ImapVerbinder {
  return async (z, ordner) => {
    const start = performance.now();
    let s: ImapSitzung;
    const melde = (ergebnis: 'ok' | 'fehler' | 'zeit', ersteMs: number | null, b?: { hin: number; zurueck: number }) =>
      extern.erfasse({ dienst: 'imap', paket: null, funktion: 'abruf', ersteMs, ms: performance.now() - start, hin: b?.hin ?? 0, zurueck: b?.zurueck ?? 0, ergebnis, tokenEin: 0, tokenAus: 0 });
    try { s = await verbinde(z, ordner); } catch (e) { melde(istZeitueberschreitung(e) ? 'zeit' : 'fehler', null); throw e; }
    const ersteMs = performance.now() - start;
    let fehler: 'fehler' | 'zeit' | null = null;
    const merke = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
      try { return await f(...a); } catch (e) { fehler ??= istZeitueberschreitung(e) ? 'zeit' : 'fehler'; throw e; }
    };
    let zu = false;
    return {
      ...s,
      uidValidity: s.uidValidity, anzahl: s.anzahl,
      neue: merke((ab: number) => s.neue(ab)),
      quelle: merke((uid: number) => s.quelle(uid)),
      verschiebe: merke((uid: number, ziel: string) => s.verschiebe(uid, ziel)),
      gelesen: merke((uid: number) => s.gelesen(uid)),
      loesche: merke((uid: number) => s.loesche(uid)),
      ordnerListe: merke(() => s.ordnerListe()),
      async schliessen() {
        try { await s.schliessen(); } finally {
          if (!zu) { zu = true; melde(fehler ?? 'ok', ersteMs, (() => { try { return s.bytes?.(); } catch { return undefined; } })()); }
        }
      },
    };
  };
}

/* ---------- Speicher ---------- */

/** Arbeitsspeicher (Tests, ohne Datenbank): Rohdaten und Monatssummen wie in PostgreSQL. */
export function speicherExternSpeicher(): ExternSpeicher & { zeilen: ExternZeile[]; monatssummen: Array<ExternSumme & { monat: string }> } {
  let nr = 0;
  const s = {
    zeilen: [] as ExternZeile[],
    monatssummen: [] as Array<ExternSumme & { monat: string }>,
    async merke(z: ExternZeile) { s.zeilen.unshift({ ...z, id: ++nr }); },
    async aufrufe(seit: Date, max: number, paket?: string) { return s.zeilen.filter((z) => Date.parse(z.zeit) >= seit.getTime() && (!paket || z.paket === paket)).slice(0, max); },
    async summen(von: Date, bis: Date) {
      const roh: ExternSumme[] = s.zeilen.filter((z) => Date.parse(z.zeit) >= von.getTime() && Date.parse(z.zeit) < bis.getTime())
        .map((z) => ({ dienst: z.dienst, paket: z.paket, funktion: z.funktion, benutzerId: z.benutzerId, anzahl: 1, fehler: z.ergebnis === 'ok' ? 0 : 1, ms: z.ms, tokenEin: z.tokenEin, tokenAus: z.tokenAus, kosten: z.kosten }));
      const m = s.monatssummen.filter((x) => x.monat >= monatSchluessel(von) && x.monat < monatSchluessel(bis));
      return [...roh, ...m];
    },
    async teuerste(von: Date, bis: Date, n: number) {
      return s.zeilen.filter((z) => Date.parse(z.zeit) >= von.getTime() && Date.parse(z.zeit) < bis.getTime() && z.dienst === 'ki')
        .sort((a, b) => b.kosten - a.kosten || (b.tokenEin + b.tokenAus) - (a.tokenEin + a.tokenAus)).slice(0, n);
    },
    async monate() { return [...new Set([...s.zeilen.map((z) => monatSchluessel(new Date(z.zeit))), ...s.monatssummen.map((x) => x.monat)])].sort().reverse(); },
    async verdichte(rohBis: Date, monatBis: Date) {
      const alt = s.zeilen.filter((z) => Date.parse(z.zeit) < rohBis.getTime());
      s.zeilen = s.zeilen.filter((z) => Date.parse(z.zeit) >= rohBis.getTime());
      for (const z of alt) {
        const monat = monatSchluessel(new Date(z.zeit));
        let x = s.monatssummen.find((y) => y.monat === monat && y.dienst === z.dienst && y.paket === z.paket && y.funktion === z.funktion && y.benutzerId === z.benutzerId);
        if (!x) { x = { monat, dienst: z.dienst, paket: z.paket, funktion: z.funktion, benutzerId: z.benutzerId, anzahl: 0, fehler: 0, ms: 0, tokenEin: 0, tokenAus: 0, kosten: 0 }; s.monatssummen.push(x); }
        x.anzahl++; x.fehler += z.ergebnis === 'ok' ? 0 : 1; x.ms += z.ms; x.tokenEin += z.tokenEin; x.tokenAus += z.tokenAus; x.kosten += z.kosten;
      }
      s.monatssummen = s.monatssummen.filter((x) => x.monat >= monatSchluessel(monatBis));
    },
    async schreibe() { /* sofort geschrieben */ },
  };
  return s;
}

/** Höchstens so viele Aufrufe je Schreibvorgang; mehr in einer Sekunde verfallen (mit Warnung). */
const JE_SCHREIBEN = 2000;

/** Zeile aus extern_aufrufe. */
const alsZeile = (z: Record<string, unknown>): ExternZeile => ({
  id: Number(z.id), zeit: (z.zeit as Date).toISOString(), dienst: z.dienst as ExternerDienst, paket: (z.paket as string | null) ?? null, funktion: (z.funktion as string | null) ?? null,
  benutzerId: (z.benutzer_id as string | null) ?? null, ersteMs: z.erste_ms === null ? null : Number(z.erste_ms), ms: Number(z.ms), hin: Number(z.hin), zurueck: Number(z.zurueck),
  ergebnis: z.ergebnis as ExternErgebnis, tokenEin: Number(z.token_ein), tokenAus: Number(z.token_aus), kosten: Number(z.kosten),
});
const alsSpalten = (z: ExternZeile, mitPerson = true) => ({
  zeit: z.zeit, dienst: z.dienst, paket: z.paket, funktion: z.funktion, benutzer_id: mitPerson ? z.benutzerId : null, erste_ms: z.ersteMs, ms: z.ms,
  hin: z.hin, zurueck: z.zurueck, ergebnis: z.ergebnis, token_ein: z.tokenEin, token_aus: z.tokenAus, kosten: z.kosten,
});

/**
 * Gesammelt schreiben, höchstens einmal je Sekunde (wie die Langläufer, #615). Eine Person kann zwischendurch gelöscht
 * worden sein (Fremdschlüssel): dann dieselben Zeilen ohne Person.
 */
function sammler(sql: postgres.Sql) {
  let offen: ExternZeile[] = [];
  let verworfen = 0;
  let zeitgeber: ReturnType<typeof setTimeout> | null = null;
  let kette: Promise<void> = Promise.resolve();
  const fehler = (e: unknown, anzahl: number) => log.error('Messwerte externer Dienste nicht gespeichert', { fehler: (e as Error).message, anzahl });
  const schreibe = () => {
    if (zeitgeber) { clearTimeout(zeitgeber); zeitgeber = null; }
    const teil = offen;
    offen = [];
    if (verworfen) { log.warn('Messwerte externer Dienste nicht gespeichert (zu viele in einer Sekunde)', { anzahl: verworfen }); verworfen = 0; }
    if (!teil.length) return kette;
    kette = kette.then(async () => { await sql`INSERT INTO extern_aufrufe ${sql(teil.map((z) => alsSpalten(z)))}`; })
      .catch(async (e) => {
        if (!/foreign key/i.test((e as Error).message)) { fehler(e, teil.length); return; }
        await sql`INSERT INTO extern_aufrufe ${sql(teil.map((z) => alsSpalten(z, false)))}`.catch((f) => fehler(f, teil.length));
      });
    return kette;
  };
  const merke = (z: ExternZeile) => {
    if (offen.length >= JE_SCHREIBEN) { verworfen++; return; }
    offen.push(z);
    if (!zeitgeber) { zeitgeber = setTimeout(() => { void schreibe(); }, 1000); zeitgeber.unref?.(); }
  };
  return { merke, schreibe };
}

/**
 * PostgreSQL (Migration 100): `extern_aufrufe` (Rohdaten) und `extern_monate` (Monatssummen). Die Monatsgrenze ist die
 * Ortszeit des Servers.
 */
export function pgExternSpeicher(sql: postgres.Sql): ExternSpeicher {
  const s = sammler(sql);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const tag = (d: Date) => `${monatSchluessel(d)}-01`;
  return {
    async merke(z) { s.merke(z); },
    async aufrufe(seit, max, paket) {
      return (await sql`SELECT * FROM extern_aufrufe WHERE zeit >= ${seit} ${paket ? sql`AND paket = ${paket}` : sql``} ORDER BY zeit DESC LIMIT ${max}`).map(alsZeile);
    },
    async summen(von, bis) {
      const r = await sql`
        SELECT dienst, paket, funktion, benutzer_id, sum(anzahl)::bigint AS anzahl, sum(fehler)::bigint AS fehler, sum(ms)::bigint AS ms,
          sum(token_ein)::bigint AS token_ein, sum(token_aus)::bigint AS token_aus, sum(kosten) AS kosten
        FROM (
          SELECT dienst, paket, funktion, benutzer_id, 1 AS anzahl, (ergebnis <> 'ok')::int AS fehler, ms, token_ein, token_aus, kosten
            FROM extern_aufrufe WHERE zeit >= ${von} AND zeit < ${bis}
          UNION ALL
          SELECT dienst, paket, funktion, benutzer_id, anzahl, fehler, ms, token_ein, token_aus, kosten
            FROM extern_monate WHERE monat >= ${tag(von)}::date AND monat < ${tag(bis)}::date
        ) x GROUP BY dienst, paket, funktion, benutzer_id`;
      return r.map((z) => ({
        dienst: z.dienst as ExternerDienst, paket: (z.paket as string | null) ?? null, funktion: (z.funktion as string | null) ?? null, benutzerId: (z.benutzer_id as string | null) ?? null,
        anzahl: Number(z.anzahl), fehler: Number(z.fehler), ms: Number(z.ms), tokenEin: Number(z.token_ein), tokenAus: Number(z.token_aus), kosten: Number(z.kosten),
      }));
    },
    async teuerste(von, bis, n) {
      return (await sql`SELECT * FROM extern_aufrufe WHERE dienst = 'ki' AND zeit >= ${von} AND zeit < ${bis} ORDER BY kosten DESC, token_ein + token_aus DESC, zeit DESC LIMIT ${n}`).map(alsZeile);
    },
    async monate() {
      const r = await sql`
        SELECT to_char(m, 'YYYY-MM') AS monat FROM (
          SELECT DISTINCT date_trunc('month', zeit AT TIME ZONE ${zone})::date AS m FROM extern_aufrufe
          UNION SELECT DISTINCT monat FROM extern_monate
        ) x ORDER BY m DESC`;
      return r.map((z) => z.monat as string);
    },
    async verdichte(rohBis, monatBis) {
      await s.schreibe();
      // In einer Anweisung: Was gelöscht wird, landet in der Monatssumme – auch wenn zwei Prozesse gleichzeitig verdichten.
      await sql`
        WITH weg AS (DELETE FROM extern_aufrufe WHERE zeit < ${rohBis} RETURNING *)
        INSERT INTO extern_monate (monat, dienst, paket, funktion, benutzer_id, anzahl, fehler, ms, token_ein, token_aus, kosten)
        SELECT date_trunc('month', zeit AT TIME ZONE ${zone})::date, dienst, paket, funktion, benutzer_id, count(*), count(*) FILTER (WHERE ergebnis <> 'ok'),
          sum(ms), sum(token_ein), sum(token_aus), sum(kosten)
        FROM weg GROUP BY 1, dienst, paket, funktion, benutzer_id`;
      await sql`DELETE FROM extern_monate WHERE monat < ${tag(monatBis)}::date`;
    },
    schreibe: () => s.schreibe(),
  };
}
