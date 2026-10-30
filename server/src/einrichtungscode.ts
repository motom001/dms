import { randomInt, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Einrichtungscode (#119): schützt den Assistenten, solange das DMS nicht eingerichtet ist –
 * sonst könnte ein Fremder im Netz die Einrichtung übernehmen oder über den Datenbanktest
 * Rechner im Netz abfragen. Er steht im Container-Protokoll und in /data/geheim/EINRICHTUNGSCODE
 * und wird nach dem Anlegen des Administrators gelöscht.
 *
 * App-Stores (#176): Mit DMS_EINRICHTUNGSCODE=aus entfällt der Code. Umbrel schützt Apps mit der
 * eigenen Anmeldung; auf ZimaOS/CasaOS gilt das Heimnetz bis zur Einrichtung als vertrauenswürdig.
 * Der Code ließe sich dort nur über Protokoll oder Kommandozeile finden.
 */
export const CODE_DATEI = 'EINRICHTUNGSCODE';
/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
const ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_FEHLVERSUCHE = 10;
const SPERRE_MS = 10 * 60_000;
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

  constructor(readonly ordner: string, private jetzt: () => number = Date.now, readonly abgeschaltet = false) {}
  get datei() { return join(this.ordner, CODE_DATEI); }
  get aktiv() { return this.code !== null; }
  /** Verlangt der Assistent einen Code? */
  get noetig() { return !this.abgeschaltet; }

  /** Vorhandenen Code übernehmen (bleibt über Neustarts gleich) oder neu erzeugen; ins Protokoll schreiben. */
  async bereitstellen(): Promise<string> {
    if (this.abgeschaltet) {
      log.warn('Das DMS ist noch nicht eingerichtet – ohne Einrichtungscode (DMS_EINRICHTUNGSCODE=aus). Richte es gleich im Browser ein.');
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
    console.log(`\n${zeile}\n  Einrichtungscode für das DMS:  ${this.code}\n  Öffne das DMS im Browser und gib den Code dort ein.\n  (Steht auch in der Datei ${this.datei})\n${zeile}\n`);
    log.warn('Das DMS ist noch nicht eingerichtet – Einrichtungscode siehe oben bzw. in der Datei', { datei: this.datei });
    return this.code;
  }

  /** Stimmt der Code? Ohne Zählen der Fehlversuche – nur, um Angaben im Status mitzuliefern. */
  stimmt(eingabe: unknown): boolean {
    if (this.abgeschaltet) return true;
    return !!this.code && typeof eingabe === 'string' && norm(eingabe).length === 12 && this.gesperrtBis <= this.jetzt() && timingSafeEqual(hash(eingabe), hash(this.code));
  }

  /** Wirft 403, wenn der Code fehlt oder falsch ist; nach 10 Fehlversuchen 10 Minuten Sperre. */
  pruefe(eingabe: unknown) {
    if (this.abgeschaltet) return;
    if (!this.code) throw new Fachfehler(409, 'Die Einrichtung ist bereits abgeschlossen.');
    if (this.gesperrtBis > this.jetzt()) throw new Fachfehler(429, 'Zu viele falsche Einrichtungscodes. Bitte in 10 Minuten noch einmal versuchen.');
    const ok = typeof eingabe === 'string' && norm(eingabe).length === 12 && timingSafeEqual(hash(eingabe), hash(this.code));
    if (!ok) {
      if (++this.fehlversuche >= MAX_FEHLVERSUCHE) { this.gesperrtBis = this.jetzt() + SPERRE_MS; this.fehlversuche = 0; log.warn('Einrichtungscode: zu viele Fehlversuche, 10 Minuten gesperrt'); }
      throw new Fachfehler(403, typeof eingabe === 'string' && eingabe ? 'Der Einrichtungscode stimmt nicht.' : 'Bitte den Einrichtungscode eingeben.');
    }
    this.fehlversuche = 0;
  }

  /** Nach dem Anlegen des Administrators: Code ist wertlos, Datei weg. */
  async entfernen() {
    this.code = null;
    await rm(this.datei, { force: true });
    log.info('Einrichtungscode gelöscht – die Einrichtung ist abgeschlossen');
  }
}
