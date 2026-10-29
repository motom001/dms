import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { Benutzer } from '../../shared/src/model';
import type { Einstellungen } from './einstellungen';
import { protokoll } from './protokoll';

/**
 * Notfallzugang über eine RESCUE-Datei (#108): Kommt kein Administrator mehr hinein, legt der
 * Betreiber neben der Schlüsseldatei eine Datei RESCUE mit dem Wort NOTFALLZUGANG an. Das DMS
 * legt dann einen neuen Administrator an und schreibt einen Einmal-Link in die Datei, der
 * 15 Minuten gilt. Nach spätestens 15 Minuten löscht es die Datei.
 *
 * Wer in dieses Volume schreiben kann, hat ohnehin vollen Zugriff auf die Daten – es entsteht
 * kein neues Einfallstor. Ein gültiges Passwort steht nie auf der Platte.
 */

const log = protokoll.modul('konto');
export const SCHLUESSELWORT = 'NOTFALLZUGANG';
export const GUELTIG_MIN = 15;
/** Erste Zeile der Datei, nachdem das DMS den Link hineingeschrieben hat. */
const KENNUNG = '# DMS-Notfallzugang';

export interface NotfallQuelle {
  notfallzugang(minuten: number, jetzt?: Date): Promise<{ benutzer: Benutzer; link: string; ablauf: Date }>;
  listeBenutzer(): Promise<Benutzer[]>;
}
/** Mail an alle Administratoren; darf fehlschlagen (kein Versand eingerichtet). */
export type AnAdmins = (betreff: string, text: string) => Promise<void>;

interface Eintrag { benutzerId: string; name: string; erstellt: string }

export class Notfallzugang {
  private gemeldet = '';
  private zeitgeber?: NodeJS.Timeout;

  constructor(
    readonly datei: string,
    private quelle: NotfallQuelle,
    private einstellungen: Einstellungen,
    private anAdmins: AnAdmins = async () => {},
    private jetzt: () => Date = () => new Date(),
  ) {}

  start(ms = 30_000) {
    const lauf = () => void this.pruefe().catch((e) => log.error('Notfallzugang prüfen fehlgeschlagen', { fehler: (e as Error).message }));
    lauf();
    this.zeitgeber = setInterval(lauf, ms);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }

  /** Einmal prüfen: anlegen, aufräumen oder melden. Liefert, was geschehen ist. */
  async pruefe(): Promise<'nichts' | 'angelegt' | 'geloescht' | 'gemeldet' | 'wartet'> {
    let inhalt: string;
    let geaendert: number;
    try {
      [inhalt, geaendert] = await Promise.all([readFile(this.datei, 'utf8'), stat(this.datei).then((s) => s.mtimeMs)]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log.error('RESCUE-Datei nicht lesbar', { datei: this.datei, fehler: (e as Error).message });
      return 'nichts';
    }
    const jetzt = this.jetzt();
    if (inhalt.startsWith(KENNUNG)) {
      // Vom DMS geschrieben: nach Ablauf des Links löschen.
      const erstellt = Date.parse(/^Erstellt: (\S+)$/m.exec(inhalt)?.[1] ?? '') || geaendert;
      if (jetzt.getTime() - erstellt < GUELTIG_MIN * 60_000) return 'wartet';
      await rm(this.datei, { force: true });
      log.info('RESCUE-Datei gelöscht (Link abgelaufen)', { datei: this.datei });
      return 'geloescht';
    }
    if (inhalt.trim().toUpperCase() !== SCHLUESSELWORT) {
      const merkmal = `${geaendert}:${inhalt.length}`;
      if (this.gemeldet !== merkmal) {
        this.gemeldet = merkmal;
        log.warn(`RESCUE-Datei ohne das Schlüsselwort ${SCHLUESSELWORT} gefunden – es geschieht nichts`, { datei: this.datei, inhalt: inhalt.length ? 'fremd' : 'leer' });
      }
      return 'gemeldet';
    }

    const { benutzer, link, ablauf } = await this.quelle.notfallzugang(GUELTIG_MIN, jetzt);
    const bis = ablauf.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
    await writeFile(this.datei, [
      `${KENNUNG} für „${benutzer.name}“`,
      `Erstellt: ${jetzt.toISOString()}`,
      '',
      `Öffne diesen Link bis ${bis} Uhr im Browser und lege ein eigenes Passwort fest:`,
      '',
      link,
      '',
      'Steht im Link „localhost“, ersetze es durch die Adresse deines NAS, z. B. http://nas:8080.',
      'Der Link gilt nur einmal. Diese Datei löscht das DMS nach 15 Minuten selbst.',
      'Benenne den Notfall-Admin danach in der Werkbank um oder deaktiviere ihn.',
      '',
    ].join('\n'), { mode: 0o600 });
    const liste = ((await this.einstellungen.lies('notfallzugaenge')) as Eintrag[] | null) ?? [];
    liste.push({ benutzerId: benutzer.id, name: benutzer.name, erstellt: jetzt.toISOString() });
    await this.einstellungen.schreibe('notfallzugaenge', liste.slice(-20));
    log.warn('Notfallzugang angelegt (RESCUE-Datei)', { benutzer: benutzer.name, gueltigBis: ablauf.toISOString(), datei: this.datei });
    try {
      await this.anAdmins('DMS: Notfallzugang angelegt',
        `Auf dem NAS wurde eine RESCUE-Datei angelegt. Das DMS hat daraufhin den Administrator „${benutzer.name}“ angelegt; der Anmeldelink steht nur in dieser Datei und gilt bis ${bis} Uhr.\n\n`
        + 'Warst du das nicht, deaktiviere den Benutzer sofort in der Werkbank unter „Benutzer“ und prüfe, wer Zugriff auf das NAS hat.');
    } catch (e) { log.warn('Mail zum Notfallzugang nicht verschickt', { fehler: (e as Error).message }); }
    return 'angelegt';
  }

  /** Notfallzugänge, die noch aktiv sind und nicht umbenannt wurden – für die Übersicht der Werkbank. */
  async offen(): Promise<Array<{ id: string; name: string; erstellt: string }>> {
    const liste = ((await this.einstellungen.lies('notfallzugaenge')) as Eintrag[] | null) ?? [];
    if (!liste.length) return [];
    const benutzer = new Map((await this.quelle.listeBenutzer()).map((b) => [b.id, b]));
    return liste.filter((e) => { const b = benutzer.get(e.benutzerId); return b?.aktiv && b.name === e.name; })
      .map((e) => ({ id: e.benutzerId, name: e.name, erstellt: e.erstellt }));
  }
}
