/**
 * Zeitplan für „Alle Dateien prüfen“ (#1316): aus, monatlich (am 1.) oder wöchentlich, zu einer Uhrzeit, die mindestens
 * eine Stunde von der automatischen Sicherung entfernt ist. Der Lauf bremst die Ablage nicht spürbar: Er macht nach
 * jeder Datei eine Pause (mindestens so lang wie das Prüfen dauerte), wartet, solange eine Sicherung, Wiederherstellung
 * oder der Wartungsmodus läuft, und lässt sich abbrechen. Seinen Stand hält er in den Einstellungen fest – nach einem
 * Neustart setzt er dort fort.
 *
 * Ergebnis wie beim Lauf von Hand: Protokoll und Nachweis-Journal (`unveraenderbarkeit.pruefung`) und das letzte
 * Ergebnis (`liesDateienErgebnis`, mappen/archiv.ts); mit Befund steht es als Hinweis auf der Startseite der Werkbank und
 * in der täglichen Zusammenfassung an die Verwaltenden (ablago.ts, Quellen der technischen Aufgaben).
 */
import type { Auftrag } from '../../../shared/src/auftrag';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import { einstellungsMerker, laufeFaellige, wochentagVon, type Jetzt } from '../zeitplan/zeitplan';
import type { DateienPruefOptionen, DateienPruefstand } from '../mappen';

const log = protokoll.modul('werkbank');

type Pruefstakt = 'aus' | 'monatlich' | 'woechentlich';
export interface Pruefplan {
  takt: Pruefstakt;
  /** HH:MM (Zeitzone des Haushalts). */
  uhrzeit: string;
  /** 1 = Montag … 7 = Sonntag (bei wöchentlich). */
  wochentag: number;
}
/** Aus; eingeschaltet ist „monatlich“ die Vorgabe (die Oberfläche bietet es zuerst an). */
export const PRUEFPLAN_STANDARD: Pruefplan = { takt: 'aus', uhrzeit: '03:30', wochentag: 6 };
/** Mindestabstand zur Uhrzeit der automatischen Sicherung. */
const ABSTAND_MIN = 60;

const PLAN = 'dateien_pruefen_plan';
const ZULETZT = 'dateien_pruefen_zuletzt';
/** Stand eines angefangenen Zeitplan-Laufs (zum Fortsetzen nach einem Neustart). */
const LAUF = 'dateien_pruefen_lauf';
type Laufstand = DateienPruefstand & { beginn: string; geprueft?: number; dateien?: number };

const minuten = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Abstand zweier Uhrzeiten in Minuten über Mitternacht hinweg. */
const abstand = (a: string, b: string) => {
  const d = Math.abs(minuten(a) - minuten(b));
  return Math.min(d, 24 * 60 - d);
};

/** Plan aus einer Eingabe prüfen; `sicherung`: Uhrzeit der eingeschalteten automatischen Sicherung (sonst null). */
export function bereinigePruefplan(e: unknown, alt: Pruefplan, sicherung: string | null): Pruefplan {
  const x = (e ?? {}) as Record<string, unknown>;
  const takt = x.takt === undefined ? alt.takt : x.takt;
  if (takt !== 'aus' && takt !== 'monatlich' && takt !== 'woechentlich') throw new Fachfehler(422, t('meldungen.dienst.pruefplan.takt'));
  const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, t('meldungen.sicherung.die-uhrzeit-bitte-als'));
  const wochentag = x.wochentag === undefined ? alt.wochentag : Number(x.wochentag);
  if (!Number.isInteger(wochentag) || wochentag < 1 || wochentag > 7)
    throw new Fachfehler(422, t('meldungen.sicherung.wochentag-1-montag-bis'));
  if (takt !== 'aus' && sicherung && abstand(uhrzeit, sicherung) < ABSTAND_MIN)
    throw new Fachfehler(422, t('meldungen.dienst.pruefplan.abstand', { sicherung, minuten: ABSTAND_MIN }));
  return { takt, uhrzeit, wochentag };
}

export async function liesPruefplan(e: Pick<Einstellungen, 'lies'>): Promise<Pruefplan> {
  const g = await e.lies(PLAN);
  try {
    return g ? bereinigePruefplan(g, PRUEFPLAN_STANDARD, null) : { ...PRUEFPLAN_STANDARD };
  } catch {
    return { ...PRUEFPLAN_STANDARD };
  }
}

export async function speicherePruefplan(e: Einstellungen, eingabe: unknown, sicherung: string | null, von: string): Promise<Pruefplan> {
  const alt = await liesPruefplan(e);
  const neu = bereinigePruefplan(eingabe, alt, sicherung);
  // Neu eingeschaltet oder anderer Takt: ab heute zählen, nichts rückwirkend.
  if (neu.takt !== alt.takt) await e.schreibe(ZULETZT, null);
  await e.schreibe(PLAN, neu);
  log.info('Zeitplan für „Alle Dateien prüfen“ geändert', { von, ...neu });
  return neu;
}

/** Angefangener Zeitplan-Lauf (für die Anzeige): seit wann, wie weit. */
export async function liesLauf(
  e: Pick<Einstellungen, 'lies'>,
): Promise<{ beginn: string; geprueft: number | null; dateien: number | null } | null> {
  const v = (await e.lies(LAUF)) as Laufstand | null;
  return v ? { beginn: v.beginn, geprueft: v.geprueft ?? null, dateien: v.dateien ?? null } : null;
}

/** Wert für die Einrichtung der Pakete (`unveraenderbarkeit.zeitplan`): „aus“, „monatlich/03:30“, „woechentlich/6/03:30“. */
export const pruefplanText = (p: Pruefplan) =>
  p.takt === 'aus' ? 'aus' : p.takt === 'monatlich' ? `monatlich/${p.uhrzeit}` : `woechentlich/${p.wochentag}/${p.uhrzeit}`;

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms).unref?.());

export interface PruefplanDeps {
  einstellungen: Einstellungen;
  /** Startet den Auftrag „Alle Dateien prüfen“ (MappenArchiv.pruefeDateien). */
  pruefe(von: string, opt: DateienPruefOptionen): Auftrag;
  /** Läuft gerade ein Auftrag (gleich welcher)? Dann wartet der Zeitplan. */
  auftragLaeuft(): Promise<boolean>;
  /** Läuft eine Sicherung, Wiederherstellung oder der Wartungsmodus? Dann beginnt nichts, ein Lauf hält an. */
  beschaeftigt(): boolean;
  /** Uhrzeit der eingeschalteten automatischen Sicherung, sonst null. */
  sicherungsUhrzeit(): Promise<string | null>;
  ortszeit(): Jetzt;
  /** Pause nach jeder Datei in ms (Tests: 0). */
  pauseMs?: number;
}

/** Der Zeitplan im Leiter (start/hintergrund.ts): jede Minute `tick()`. */
export class DateienPruefplan {
  private laufend: string | null = null;
  constructor(private d: PruefplanDeps) {}

  /** Fälligen oder unterbrochenen Lauf starten. Liefert die Id des gestarteten Auftrags oder null. */
  async tick(): Promise<string | null> {
    if (this.laufend || this.d.beschaeftigt() || (await this.d.auftragLaeuft())) return null;
    const plan = await liesPruefplan(this.d.einstellungen);
    if (plan.takt !== 'aus') {
      const sicherung = await this.d.sicherungsUhrzeit();
      // Nicht gleichzeitig mit der Sicherung: im Abstand um ihre Uhrzeit nichts beginnen.
      if (sicherung && abstand(this.d.ortszeit().uhr, sicherung) < ABSTAND_MIN / 2) return null;
      const an = (tag: string) => (plan.takt === 'monatlich' ? tag.endsWith('-01') : wochentagVon(tag) === plan.wochentag);
      await laufeFaellige(einstellungsMerker(this.d.einstellungen, ZULETZT), this.d.ortszeit(), { uhrzeit: plan.uhrzeit, an }, async () => {
        // Erst den Stand anlegen, dann starten: Scheitert der Start, setzt der nächste Blick fort.
        if (!(await this.d.einstellungen.lies(LAUF)))
          await this.d.einstellungen.schreibe(LAUF, { beginn: new Date().toISOString(), ab: null, abweichungen: [], fehlend: [] });
      });
    }
    const stand = (await this.d.einstellungen.lies(LAUF)) as Laufstand | null;
    return stand ? this.starte(stand) : null;
  }

  private starte(stand: Laufstand): string | null {
    const e = this.d.einstellungen;
    const pause = this.d.pauseMs ?? 10;
    let zuletzt = Date.now();
    try {
      const a = this.d.pruefe(t('meldungen.dienst.pruefplan.von'), {
        stand: { ab: stand.ab, abweichungen: stand.abweichungen ?? [], fehlend: stand.fehlend ?? [] },
        zeitplan: true,
        drossel: async () => {
          // Mindestens so lange Pause, wie die letzte Datei brauchte (höchstens 1 s), und warten, solange anderes läuft.
          if (pause) await warte(Math.min(1000, Math.max(pause, Date.now() - zuletzt)));
          while (this.d.beschaeftigt()) await warte(5000);
          zuletzt = Date.now();
        },
        merke: (st, geprueft, dateien) => e.schreibe(LAUF, { ...st, beginn: stand.beginn, geprueft, dateien }),
        fertig: () => e.schreibe(LAUF, null),
      });
      this.laufend = a.id;
      if (stand.ab)
        log.info('„Alle Dateien prüfen“ nach Zeitplan fortgesetzt', { ab: stand.geprueft ?? null, dateien: stand.dateien ?? null });
      else log.info('„Alle Dateien prüfen“ nach Zeitplan begonnen');
      void this.beobachte(a);
      return a.id;
    } catch (x) {
      log.warn('„Alle Dateien prüfen“ nach Zeitplan nicht begonnen', { grund: (x as Error).message });
      return null;
    }
  }

  /** Bis zum Ende warten; abgebrochen (von Hand) oder gescheitert: Stand wegräumen, der nächste Termin beginnt neu. */
  private async beobachte(a: Auftrag) {
    while (a.status === 'laeuft') await warte(1000);
    this.laufend = null;
    if (a.status === 'fehler' || a.abgebrochen) await this.d.einstellungen.schreibe(LAUF, null).catch(() => {});
  }
}
