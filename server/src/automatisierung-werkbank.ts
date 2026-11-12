/**
 * Werkbank-Rechte des Systemkontos „Automatisierung“ (#677) – genau die Tabelle aus dem Issue, alle übrigen Bereiche
 * keine (Entscheidung Thomas 03.11.2026). Das Konto darf die Werkbank nie betreten (`darfVerwalten` ist für Systemkonten
 * immer falsch); die Karten bekommen stattdessen dieses Objekt mit genau vier Handlungen ({@link SYSTEMKONTO_WERKBANK}):
 *
 * | Bereich | darf | darf nicht |
 * |---|---|---|
 * | Sicherung | neue Sicherung anstoßen | Erfolg, Anzahl, Zeitplan, Speicherplatz, Speicherort sehen; Notfallblatt |
 * | Wiederherstellen | – | alles |
 * | Volltext | – | neu erzeugen u. Ä. |
 * | Papierkorb | – | leeren/endgültig löschen |
 * | Technik/Version | prüfen, ob eine neue Version da ist | – |
 * | Gemeldete Fehler | sehen | – |
 * | Protokoll | Meldungen ab Stufe finden | – |
 * | Benutzer | nichts in der Werkbank | Benutzer/Rechte verwalten |
 *
 * Neue Handlungen erst nach Rücksprache mit Thomas – ein Test vergleicht die Schlüssel mit der Liste.
 *
 * Dazu der {@link Betriebsmelder}: Er hört auf Warnungen und Fehler im Protokoll dieses Prozesses und legt für passende,
 * eingeschaltete Automatisierungen das Ereignis `protokoll.meldung` in den Ausgangskorb – nie für Meldungen, die eine
 * Automatisierung selbst auslöst (Modul „automatisierung“, „ereignisse“ oder im Lauf einer Automatisierung), und je
 * Automatisierung höchstens einmal in {@link PROTOKOLL_ABSTAND_MIN} Minuten.
 */
import { PROTOKOLL_ABSTAND_MIN, PROTOKOLL_TEXT_MAX, protokollPasst, SYSTEMKONTO_WERKBANK, type Automatisierung, type SystemkontoHandlung } from '../../shared/src/automatisierung';
import { Fachfehler } from './fehler';
import { protokoll as dasProtokoll, type Eintrag, type Protokoll } from './protokoll';
import type { Sicherung } from './sicherung';
import { neueStabileVersion } from './system';
import { t } from './sprache';

const log = dasProtokoll.modul('automatisierung');

export interface SystemWerkbank {
  /** Sicherung: eine neue Sicherung anstoßen. Ergebnis nur „angestoßen“ oder „läuft schon“ – sonst ein Fehler ohne Einzelheiten. */
  sicherungAnstossen(wer: string): Promise<'angestossen' | 'laeuft'>;
  /** Technik/Version: die neue stabile Version, wenn es eine gibt (sonst null). */
  neueVersion(): Promise<string | null>;
  /** Gemeldete Fehler: eine Meldung sehen – Text, Zeitpunkt, wer (ohne Bilder und technische Angaben). */
  fehlermeldung(id: string): Promise<{ text: string; zeit: string; benutzerId: string | null } | null>;
  /** Protokoll: Meldungen ab Warnung finden (als Abo; liefert eine Funktion zum Abmelden). */
  protokoll(f: (e: Eintrag) => void): () => void;
}

export interface SystemWerkbankQuellen {
  sicherung: Pick<Sicherung, 'laeuft' | 'starte'>;
  fehlermeldungen: { hole(id: string): Promise<{ text: string; erstellt: string; benutzerId: string | null }> };
  /** Tests: statt der Anfrage an GitHub. */
  version?: () => Promise<string | null>;
  protokoll?: Pick<Protokoll, 'beobachte'>;
}

/** Das Objekt mit genau den erlaubten Handlungen (eingefroren). */
export function systemWerkbank(q: SystemWerkbankQuellen): SystemWerkbank {
  const w: SystemWerkbank & Record<SystemkontoHandlung, unknown> = {
    async sicherungAnstossen(wer) {
      if (q.sicherung.laeuft()) return 'laeuft';
      try {
        // „automatisch“: zählt zur Aufbewahrung wie die Sicherung nach Zeitplan – angestoßene Sicherungen füllen die Platte nicht.
        const { fertig } = await q.sicherung.starte('automatisch', wer);
        void fertig.catch(() => null);
        return 'angestossen';
      } catch (x) {
        if (q.sicherung.laeuft()) return 'laeuft';
        // Warum nicht (Schlüssel, Platz, Wiederherstellung), steht in Werkbank → Sicherung – die Automatisierung erfährt es nicht.
        log.info('Sicherung durch Automatisierung nicht angestoßen', { grund: (x as Error).message });
        throw new Fachfehler(409, t('meldungen.automatisierungkarten.sicherung-nicht'));
      }
    },
    neueVersion: () => (q.version ?? (() => neueStabileVersion()))(),
    async fehlermeldung(id) {
      const m = await q.fehlermeldungen.hole(id).catch(() => null);
      return m ? { text: m.text, zeit: m.erstellt, benutzerId: m.benutzerId } : null;
    },
    protokoll: (f) => (q.protokoll ?? dasProtokoll).beobachte(f),
  };
  // Nur die Handlungen der Liste – nichts dazu, nichts nachträglich.
  for (const k of Object.keys(w)) if (!(k in SYSTEMKONTO_WERKBANK)) throw new Error(`Werkbank-Recht ${k} steht nicht in der Liste`);
  return Object.freeze(w);
}

/** Eine Protokollmeldung, wie sie ins Ereignis geht. */
export interface Betriebsmeldung { stufe: 'warn' | 'error'; modul: string; text: string; zeitpunkt: string }

/** Module, deren Meldungen nie eine Automatisierung auslösen (Schleifenschutz). */
const NIE = new Set(['automatisierung', 'ereignisse']);
/** So viele Meldungen höchstens in der Warteschlange (Flut). */
const SCHLANGE_MAX = 50;

export class Betriebsmelder {
  private schlange: Betriebsmeldung[] = [];
  private zuletzt = new Map<string, number>();
  private abo: (() => void) | null = null;
  private uhr: ReturnType<typeof setInterval> | null = null;
  private laeuft = false;
  private liste: { zeit: number; autos: Automatisierung[] } | null = null;

  constructor(private o: {
    werkbank: SystemWerkbank;
    /** Alle Automatisierungen (gemerkt für eine Minute). */
    automatisierungen: () => Promise<Automatisierung[]>;
    /** Ereignis in den Ausgangskorb (außerhalb jeder Anfrage und Transaktion). */
    ereignis: (daten: Betriebsmeldung) => Promise<void>;
    /** Läuft das gerade im Namen einer Automatisierung? */
    inAutomatisierung: () => boolean;
    uhr?: () => number;
  }) {}

  private jetzt() { return this.o.uhr?.() ?? Date.now(); }

  start(ms = 2_000) {
    this.abo ??= this.o.werkbank.protokoll((e) => this.merke(e));
    this.uhr ??= setInterval(() => { void this.sende(); }, ms);
    this.uhr.unref?.();
  }
  stop() { this.abo?.(); this.abo = null; if (this.uhr) clearInterval(this.uhr); this.uhr = null; }

  /** Aus dem Protokoll (synchron, darf nie werfen): nur merken – gesendet wird außerhalb der Anfrage. */
  merke(e: Eintrag) {
    if (NIE.has(e.modul) || this.schlange.length >= SCHLANGE_MAX) return;
    if (e.stufe !== 'warn' && e.stufe !== 'error' && e.stufe !== 'fatal') return;
    try { if (this.o.inAutomatisierung()) return; } catch { return; }
    this.schlange.push({ stufe: e.stufe === 'warn' ? 'warn' : 'error', modul: e.modul, text: e.text.slice(0, PROTOKOLL_TEXT_MAX), zeitpunkt: e.zeit });
  }

  private async aktive(): Promise<Automatisierung[]> {
    if (!this.liste || this.jetzt() - this.liste.zeit > 60_000) this.liste = { zeit: this.jetzt(), autos: await this.o.automatisierungen() };
    return this.liste.autos.filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'protokoll.meldung');
  }

  /** Gemerkte Meldungen senden: je Meldung ein Ereignis, wenn eine Automatisierung darauf wartet (nicht in ihrer Pause). */
  async sende(): Promise<number> {
    if (this.laeuft || !this.schlange.length) return 0;
    this.laeuft = true;
    let n = 0;
    try {
      const liste = this.schlange.splice(0);
      const autos = await this.aktive();
      for (const m of liste) {
        const bereit = autos.filter((a) => a.wenn.art === 'protokoll.meldung' && protokollPasst(a.wenn, m) && this.jetzt() - (this.zuletzt.get(a.id) ?? 0) >= PROTOKOLL_ABSTAND_MIN * 60_000);
        if (!bereit.length) continue;
        for (const a of bereit) this.zuletzt.set(a.id, this.jetzt());
        await this.o.ereignis(m);
        n++;
      }
    } catch { /* Ausgangskorb nicht erreichbar: verworfen (nie ins Protokoll – das wäre eine Schleife) */ } finally { this.laeuft = false; }
    return n;
  }
}
