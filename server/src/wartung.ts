import { Fachfehler } from './fehler';
import type { Einstellungen } from './einstellungen';
import { protokoll } from './protokoll';

/**
 * Wartungsmodus (#102): Wiederherstellungen und Updates, ohne dass jemand gleichzeitig arbeitet.
 *
 *   aus → angekündigt (Banner mit Countdown, Speichern geht, Anmeldung nur für Admins)
 *       → aktiv (alle anderen Sitzungen beendet, API 503, Hintergrundarbeiten pausiert)
 *       → aus (von Hand oder nach einer Wiederherstellung)
 *
 * Der Stand liegt in den Einstellungen und überdauert einen Neustart.
 */

const log = protokoll.modul('system');
export const VORLAUF_STANDARD_MIN = 30;
/** So lange sollen Programme mit dem nächsten Versuch warten (Retry-After), wenn kein Ende bekannt ist. */
const RETRY_STANDARD_S = 15 * 60;

export type Stufe = 'aus' | 'angekuendigt' | 'aktiv';

export interface WartungStand {
  stufe: Stufe;
  /** Text für alle, z. B. „Wiederherstellung, ca. 1 Stunde“. */
  text: string;
  /** Erwartetes Ende (ISO), nur zur Anzeige. */
  ende: string | null;
  /** Ab wann die Wartung aktiv ist (ISO); bei „angekündigt“ in der Zukunft. */
  aktivAb: string | null;
  beginn: string | null;
  /** E-Mail-Adresse des Administrators, der sie eingeschaltet hat. */
  von: string | null;
  /** Diese Sitzung bleibt beim Abmelden aller anderen bestehen. */
  sitzungId: string | null;
  /** Vom DMS selbst eingeschaltet (#116), z. B. bei vollem Speicherplatz; null = von Hand. */
  ausloeser?: 'speicherplatz' | null;
  /** Mit „Jetzt sofort sperren“ eingeschaltet (#402), z. B. bei einem Sicherheitsvorfall. */
  sofort?: boolean;
}

/** Was jeder sehen darf (auch ohne Anmeldung). */
export interface WartungOeffentlich { stufe: Stufe; text: string; ende: string | null; aktivAb: string | null; sekunden: number | null; ausloeser: 'speicherplatz' | null }

export interface WartungKonten {
  /** Beendet alle Sitzungen außer dieser; liefert die Anzahl. */
  beendeAlleSitzungenAusser(sitzungId: string | null): Promise<number>;
}

/** Wird während der aktiven Wartung geworfen; der HTTP-Adapter setzt Retry-After. */
export class WartungFehler extends Fachfehler {
  constructor(message: string, public retryAfter: number) { super(503, message); }
}

const AUS: WartungStand = { stufe: 'aus', text: '', ende: null, aktivAb: null, beginn: null, von: null, sitzungId: null, ausloeser: null };

export class Wartung {
  private s: WartungStand = { ...AUS };
  private zeitgeber?: NodeJS.Timeout;
  private nachAus: Array<() => void> = [];

  constructor(private einstellungen: Einstellungen, private konten: WartungKonten, private jetzt: () => Date = () => new Date()) {}

  async laden() {
    const g = (await this.einstellungen.lies('wartung')) as Partial<WartungStand> | null;
    this.s = g?.stufe && g.stufe !== 'aus' ? { ...AUS, ...g } : { ...AUS };
    if (this.s.stufe !== 'aus') log.warn(`Wartungsmodus ist ${this.s.stufe === 'aktiv' ? 'aktiv' : 'angekündigt'}`, { text: this.s.text, aktivAb: this.s.aktivAb });
    await this.pruefe();
  }

  /** Regelmäßig: aus „angekündigt“ wird nach Ablauf der Vorlaufzeit „aktiv“. */
  start(ms = 5000) {
    this.zeitgeber = setInterval(() => void this.pruefe().catch((e) => log.error('Wartungsmodus prüfen fehlgeschlagen', { fehler: (e as Error).message })), ms);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }

  get stand(): WartungStand { return { ...this.s }; }
  /** Nach dem Ausschalten, z. B. pausierte Texterkennung wieder anstoßen. */
  beimAusschalten(f: () => void) { this.nachAus.push(f); }
  /** Aktiv: nur Administratoren, API 503, Hintergrundarbeiten pausieren. */
  get aktiv() { return this.s.stufe === 'aktiv'; }
  /** Angekündigt oder aktiv: Anmeldung nur noch für Administratoren. */
  get an() { return this.s.stufe !== 'aus'; }

  oeffentlich(): WartungOeffentlich {
    const s = this.s;
    const ab = s.aktivAb ? Date.parse(s.aktivAb) : NaN;
    return {
      stufe: s.stufe, text: s.text, ende: s.ende, aktivAb: s.aktivAb, ausloeser: s.ausloeser ?? null,
      sekunden: s.stufe === 'angekuendigt' && Number.isFinite(ab) ? Math.max(0, Math.round((ab - this.jetzt().getTime()) / 1000)) : null,
    };
  }

  /** Sekunden bis zum erwarteten Ende (für Retry-After). */
  retryAfter(): number {
    const e = this.s.ende ? Date.parse(this.s.ende) : NaN;
    const rest = Number.isFinite(e) ? Math.round((e - this.jetzt().getTime()) / 1000) : NaN;
    return Number.isFinite(rest) && rest > 60 ? rest : RETRY_STANDARD_S;
  }

  /** Meldung für Abgewiesene. */
  meldung(): string {
    const ende = this.s.ende ? ` Voraussichtlich bis ${new Date(this.s.ende).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })} Uhr.` : '';
    return `Das DMS wird gerade gewartet${this.s.text ? ` (${this.s.text})` : ''}.${ende} Bitte versuche es später noch einmal.`;
  }

  async pruefe() {
    if (this.s.stufe === 'angekuendigt' && this.s.aktivAb && Date.parse(this.s.aktivAb) <= this.jetzt().getTime()) await this.aktiviere('Vorlaufzeit abgelaufen');
  }

  private async speichere() { await this.einstellungen.schreibe('wartung', this.s.stufe === 'aus' ? null : this.s); }

  private async aktiviere(grund: string) {
    this.s = { ...this.s, stufe: 'aktiv', aktivAb: this.jetzt().toISOString() };
    await this.speichere();
    const beendet = await this.konten.beendeAlleSitzungenAusser(this.s.sitzungId);
    log.warn('Wartungsmodus aktiv: alle anderen Sitzungen beendet', { grund, beendet, von: this.s.von });
  }

  /**
   * Einschalten. vorlauf in Minuten (0 = sofort aktiv) – oder beginn als Zeitpunkt (#402, höchstens
   * 24 Stunden in der Zukunft; gewinnt vor vorlauf). sofort = „Jetzt sofort sperren“: wie vorlauf 0,
   * nur im Protokoll als „sofort gesperrt“ vermerkt. Ist die Wartung schon an, werden Text und
   * Ende übernommen; die Vorlaufzeit gilt dann nur, solange sie noch angekündigt ist.
   */
  async einschalten(e: { text?: unknown; ende?: unknown; vorlauf?: unknown; beginn?: unknown; sofort?: unknown }, admin: { email: string }, sitzungId: string | null): Promise<WartungStand> {
    const text = typeof e.text === 'string' ? e.text.trim().slice(0, 200) : '';
    let ende: string | null = null;
    if (e.ende !== undefined && e.ende !== null && e.ende !== '') {
      const t = Date.parse(String(e.ende));
      if (!Number.isFinite(t)) throw new Fachfehler(422, 'Das erwartete Ende ist kein gültiger Zeitpunkt.');
      ende = new Date(t).toISOString();
    }
    const sofort = e.sofort === true;
    const jetzt = this.jetzt();
    let beginn: number | null = null;
    if (!sofort && e.beginn !== undefined && e.beginn !== null && e.beginn !== '') {
      beginn = Date.parse(String(e.beginn));
      if (!Number.isFinite(beginn)) throw new Fachfehler(422, 'Der Beginn ist kein gültiger Zeitpunkt.');
      if (beginn <= jetzt.getTime()) throw new Fachfehler(422, 'Der Beginn liegt in der Vergangenheit. Für sofort bitte „Jetzt sofort sperren“ nutzen.');
      if (beginn > jetzt.getTime() + 24 * 3600_000) throw new Fachfehler(422, 'Der Beginn darf höchstens 24 Stunden in der Zukunft liegen – ab der Ankündigung können sich nur noch Administratoren anmelden.');
      if (ende && Date.parse(ende) <= beginn) throw new Fachfehler(422, 'Das erwartete Ende muss nach dem Beginn liegen.');
    }
    const vorlauf = sofort ? 0 : beginn !== null ? Math.max(1, Math.round((beginn - jetzt.getTime()) / 60_000))
      : e.vorlauf === undefined || e.vorlauf === null || e.vorlauf === '' ? VORLAUF_STANDARD_MIN : Number(e.vorlauf);
    if (!Number.isInteger(vorlauf) || vorlauf < 0 || vorlauf > 24 * 60) throw new Fachfehler(422, 'Die Vorlaufzeit muss zwischen 0 und 1440 Minuten liegen.');
    if (this.s.stufe === 'aktiv') {
      this.s = { ...this.s, text, ende };
      await this.speichere();
      log.info('Wartungsmodus geändert', { text, ende });
      return this.stand;
    }
    const aktivAb = new Date(beginn ?? jetzt.getTime() + vorlauf * 60_000).toISOString();
    this.s = { stufe: 'angekuendigt', text, ende, aktivAb, beginn: this.s.beginn ?? jetzt.toISOString(), von: admin.email, sitzungId, ...(sofort ? { sofort: true } : {}) };
    await this.speichere();
    log.warn(sofort ? 'Wartungsmodus sofort gesperrt' : vorlauf ? 'Wartungsmodus angekündigt' : 'Wartungsmodus eingeschaltet', { von: admin.email, text, ende, aktivAb, vorlaufMinuten: vorlauf });
    if (!vorlauf) await this.aktiviere(sofort ? 'sofort gesperrt' : 'sofort');
    return this.stand;
  }

  /**
   * Vom DMS selbst eingeschaltet (#116): nur, wenn die Wartung aus ist – eine laufende Wartung
   * eines Administrators bleibt unverändert. Endet nicht von selbst.
   */
  async automatisch(ausloeser: 'speicherplatz', text: string, vorlaufMin: number): Promise<boolean> {
    if (this.s.stufe !== 'aus') return false;
    const jetzt = this.jetzt();
    this.s = { ...AUS, stufe: 'angekuendigt', text, aktivAb: new Date(jetzt.getTime() + vorlaufMin * 60_000).toISOString(), beginn: jetzt.toISOString(), von: 'DMS (automatisch)', ausloeser };
    await this.speichere();
    log.warn('Wartungsmodus automatisch angekündigt', { ausloeser, text, aktivAb: this.s.aktivAb, vorlaufMinuten: vorlaufMin });
    if (!vorlaufMin) await this.aktiviere(ausloeser);
    return true;
  }

  /** „Alle jetzt abmelden“: sofort aktiv, alle Sitzungen außer der eigenen enden. */
  async jetztAktiv(admin: { email: string }, sitzungId: string | null): Promise<WartungStand> {
    if (this.s.stufe === 'aus') return this.einschalten({ vorlauf: 0 }, admin, sitzungId);
    this.s = { ...this.s, sitzungId: sitzungId ?? this.s.sitzungId, von: this.s.von ?? admin.email };
    if (this.s.stufe === 'aktiv') {
      const beendet = await this.konten.beendeAlleSitzungenAusser(this.s.sitzungId);
      await this.speichere();
      log.warn('Alle anderen Sitzungen beendet', { von: admin.email, beendet });
    } else {
      await this.aktiviere(`„Alle jetzt abmelden“ von ${admin.email}`);
    }
    return this.stand;
  }

  async ausschalten(von: string): Promise<WartungStand> {
    if (this.s.stufe === 'aus') return this.stand;
    const vorher = this.s;
    this.s = { ...AUS };
    await this.speichere();
    log.warn('Wartungsmodus ausgeschaltet', { von, seit: vorher.beginn });
    for (const f of this.nachAus) { try { f(); } catch { /* weiter */ } }
    return this.stand;
  }

  /**
   * Prüft eine Anfrage während der Wartung. Öffentliche API: immer 503.
   * Oberfläche: in der aktiven Stufe nur Administratoren (und alles ohne Anmeldung).
   */
  pruefeAnfrage(r: { pfad: string; zugang: string }, benutzer: { rolle: string } | undefined) {
    if (this.s.stufe !== 'aktiv') return;
    if (r.pfad.startsWith('/api/v1/')) throw new WartungFehler(this.meldung(), this.retryAfter());
    if (r.zugang !== 'offen' && benutzer && benutzer.rolle !== 'admin') throw new WartungFehler(this.meldung(), this.retryAfter());
  }

  /** Nach einer Anmeldung: Nicht-Admins kommen ab der Ankündigung nicht mehr hinein. */
  sperrtAnmeldung(benutzer: { rolle: string }) { return this.an && benutzer.rolle !== 'admin'; }
}
