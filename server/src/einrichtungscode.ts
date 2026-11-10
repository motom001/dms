import { randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Fachfehler } from './fehler';
import type { Kurzzustand } from './kurzzustand';
import { protokoll } from './protokoll';
import { t } from './sprache';

/**
 * Einrichtungscode (#119): schützt den Assistenten, solange das DMS nicht eingerichtet ist –
 * sonst könnte ein Fremder im Netz die Einrichtung übernehmen oder über den Datenbanktest
 * Rechner im Netz abfragen. Er steht im Container-Protokoll und in /data/geheim/EINRICHTUNGSCODE
 * und wird nach dem Anlegen des Administrators gelöscht.
 *
 * App-Stores (#176): Mit DMS_EINRICHTUNGSCODE=aus entfällt der Code. Die Umbrel-Vorlage schaltet die
 * Umbrel-Anmeldung vor der App ab (PROXY_AUTH_ADD: "false"), weil Familienmitglieder sich mit eigenem
 * DMS-Konto anmelden; dort wie auf ZimaOS/CasaOS gilt das Heimnetz bis zur Einrichtung als
 * vertrauenswürdig. Der Code ließe sich dort nur über Protokoll oder Kommandozeile finden.
 */
export const CODE_DATEI = 'EINRICHTUNGSCODE';
/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
const ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_FEHLVERSUCHE = 10;
const SPERRE_MS = 10 * 60_000;
/** Art im Kurzzustand für die Fehlversuche (#956). */
const FEHLER = 'einrichtungscode-fehler';
const log = protokoll.modul('system');

export function neuerCode(): string {
  const z = () => Array.from({ length: 4 }, () => ZEICHEN[randomInt(ZEICHEN.length)]).join('');
  return `${z()}-${z()}-${z()}`;
}
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hash = (s: string) => createHash('sha256').update(norm(s)).digest();

export class Einrichtungscode {
  private code: string | null = null;
  private fehlversuche = 0;
  private gesperrtBis = 0;
  /** Mehrere Prozesse (#956): Fehlversuche in der Datenbank, für alle zusammen; ohne nur in diesem Prozess. */
  private zustand: Kurzzustand | null = null;

  constructor(readonly ordner: string, private jetzt: () => number = Date.now, readonly abgeschaltet = false) {}
  get datei() { return join(this.ordner, CODE_DATEI); }
  get aktiv() { return this.code !== null; }
  /** Verlangt der Assistent einen Code? */
  get noetig() { return !this.abgeschaltet; }

  /** Vorhandenen Code übernehmen (bleibt über Neustarts gleich) oder neu erzeugen; ins Protokoll schreiben. */
  async bereitstellen(): Promise<string> {
    if (this.abgeschaltet) {
      log.warn('Ablago ist noch nicht eingerichtet – ohne Einrichtungscode (DMS_EINRICHTUNGSCODE=aus). Richte es gleich im Browser ein.');
      return '';
    }
    if (!this.code) {
      let alt: string | null = null;
      try { alt = (await readFile(this.datei, 'utf8')).trim(); } catch { /* neu */ }
      this.code = alt && norm(alt).length === 12 ? alt : neuerCode();
      if (this.code !== alt) await writeFile(this.datei, `${this.code}\n`, { mode: 0o600 });
    }
    const zeile = '='.repeat(64);
    // Bewusst als eigene, auffällige Zeilen: so findet man den Code im Protokoll des Containers.
    console.log(`\n${zeile}\n  Einrichtungscode für Ablago:  ${this.code}\n  Öffne Ablago im Browser und gib den Code dort ein.\n  (Steht auch in der Datei ${this.datei})\n${zeile}\n`);
    log.warn('Ablago ist noch nicht eingerichtet – Einrichtungscode siehe oben bzw. in der Datei', { datei: this.datei });
    return this.code;
  }

  /**
   * Weitere Prozesse (#745): den Code, den der Leiter bereitgestellt hat, still aus der Datei übernehmen – ohne ihn neu
   * zu erzeugen oder ins Protokoll zu schreiben. Die Fehlversuche zählen alle Prozesse zusammen, sobald `teileZaehler` die Datenbank gibt (#956).
   */
  async uebernimm(): Promise<void> {
    if (this.abgeschaltet || this.code) return;
    try {
      const alt = (await readFile(this.datei, 'utf8')).trim();
      if (norm(alt).length === 12) this.code = alt;
    } catch { /* kein Code bereitgestellt */ }
  }

  /** Stimmt der Code? Ohne Zählen der Fehlversuche – nur, um Angaben im Status mitzuliefern. */
  stimmt(eingabe: unknown): boolean {
    if (this.abgeschaltet) return true;
    return !!this.code && typeof eingabe === 'string' && norm(eingabe).length === 12 && this.gesperrtBis <= this.jetzt() && timingSafeEqual(hash(eingabe), hash(this.code));
  }

  /** Wirft 403, wenn der Code fehlt oder falsch ist; nach 10 Fehlversuchen 10 Minuten Sperre. */
  pruefe(eingabe: unknown) {
    if (this.abgeschaltet) return;
    if (!this.code) throw new Fachfehler(409, t('meldungen.einrichtungscode.die-einrichtung-ist-bereits'));
    if (this.gesperrtBis > this.jetzt()) throw new Fachfehler(429, t('meldungen.einrichtungscode.zu-viele-falsche-einrichtungscodes'));
    const ok = typeof eingabe === 'string' && norm(eingabe).length === 12 && timingSafeEqual(hash(eingabe), hash(this.code));
    if (!ok) {
      if (++this.fehlversuche >= MAX_FEHLVERSUCHE) { this.gesperrtBis = this.jetzt() + SPERRE_MS; this.fehlversuche = 0; log.warn('Einrichtungscode: zu viele Fehlversuche, 10 Minuten gesperrt'); }
      throw new Fachfehler(403, typeof eingabe === 'string' && eingabe ? t('meldungen.einrichtungscode.der-einrichtungscode-stimmt-nicht') : t('meldungen.einrichtungscode.bitte-den-einrichtungscode-eingeben'));
    }
    this.fehlversuche = 0;
  }

  /** Fehlversuche ab jetzt über alle Prozesse zählen (#956) – sobald die Datenbank da ist. */
  teileZaehler(z: Kurzzustand) { this.zustand = z; }

  /**
   * Wie `pruefe`, aber mit Zählern für alle Prozesse (#956), wenn `teileZaehler` aufgerufen wurde: Der Versuch wird
   * vorab gezählt, ein richtiger Code nimmt die Zähler zurück. 10 Fehlversuche in 10 Minuten sperren bis zum Ende
   * dieses Fensters. Ohne Datenbank (Einrichtungsmodus) wie `pruefe`.
   */
  async pruefeGeteilt(eingabe: unknown) {
    if (!this.zustand) return this.pruefe(eingabe);
    if (this.abgeschaltet) return;
    if (!this.code) throw new Fachfehler(409, t('meldungen.einrichtungscode.die-einrichtung-ist-bereits'));
    const { anzahl } = await this.zustand.zaehle(FEHLER, 'code', SPERRE_MS);
    if (anzahl > MAX_FEHLVERSUCHE) {
      await this.zustand.erhoehe(FEHLER, 'code', -1);
      throw new Fachfehler(429, t('meldungen.einrichtungscode.zu-viele-falsche-einrichtungscodes'));
    }
    const ok = typeof eingabe === 'string' && norm(eingabe).length === 12 && timingSafeEqual(hash(eingabe), hash(this.code));
    if (!ok) {
      if (anzahl === MAX_FEHLVERSUCHE) log.warn('Einrichtungscode: zu viele Fehlversuche, gesperrt bis 10 Minuten nach dem ersten');
      throw new Fachfehler(403, typeof eingabe === 'string' && eingabe ? t('meldungen.einrichtungscode.der-einrichtungscode-stimmt-nicht') : t('meldungen.einrichtungscode.bitte-den-einrichtungscode-eingeben'));
    }
    await this.zustand.loesche(FEHLER, 'code');
  }

  /** Nach dem Anlegen des Administrators: Code ist wertlos, Datei weg. */
  async entfernen() {
    this.code = null;
    await rm(this.datei, { force: true });
    log.info('Einrichtungscode gelöscht – die Einrichtung ist abgeschlossen');
  }
}
