import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_DATEIGROESSE } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import { bildArt } from './pdfseiten';

/**
 * Fotostapel (#490, „Post fotografieren“): Das Handy lädt jedes Foto gleich nach der Aufnahme einzeln
 * hoch (je Anfrage eine Datei); erst „Fertig“ macht daraus ein PDF. Bis dahin liegen die Fotos je
 * Benutzer in einem Arbeitsordner und verfallen nach zwei Stunden.
 */
export const FOTOS_MAX = 50;
const VERFALL_MS = 2 * 60 * 60 * 1000;
const ID = /^[0-9a-f-]{36}$/;

export class Fotostapel {
  constructor(private wurzel = join(tmpdir(), 'dms-fotostapel'), private jetzt = () => Date.now()) {}

  private ordner(benutzerId: string) {
    if (!ID.test(benutzerId)) throw new Fachfehler(403, 'Fotos ablegen geht nur angemeldet.');
    return join(this.wurzel, benutzerId);
  }

  /** Ein Foto ablegen; liefert seine Kennung. */
  async lege(benutzerId: string, inhalt: unknown): Promise<string> {
    if (!Buffer.isBuffer(inhalt) || !inhalt.length) throw new Fachfehler(422, 'Das Foto ist leer.');
    if (inhalt.length > MAX_DATEIGROESSE) throw new Fachfehler(413, 'Das Foto ist größer als 100 MB.');
    if (!bildArt(inhalt)) throw new Fachfehler(422, 'Nur Fotos als JPEG oder PNG lassen sich als Seite übernehmen.');
    await this.aufraeumen();
    const o = this.ordner(benutzerId);
    await mkdir(o, { recursive: true });
    if ((await readdir(o)).length >= FOTOS_MAX * 2) throw new Fachfehler(429, 'Zu viele Fotos auf einmal – bitte erst einen Beleg fertig machen.');
    const id = randomUUID();
    await writeFile(join(o, id), inhalt);
    return id;
  }

  /** Fotos in dieser Reihenfolge holen und aus dem Stapel nehmen. */
  async nimm(benutzerId: string, ids: unknown): Promise<Buffer[]> {
    const liste = Array.isArray(ids) ? ids.map(String) : [];
    if (!liste.length) throw new Fachfehler(422, 'Keine Fotos.');
    if (liste.length > FOTOS_MAX) throw new Fachfehler(422, `Höchstens ${FOTOS_MAX} Seiten auf einmal.`);
    if (liste.some((id) => !ID.test(id))) throw new Fachfehler(422, 'Unbekanntes Foto.');
    const o = this.ordner(benutzerId);
    const bilder: Buffer[] = [];
    for (const id of liste) {
      try { bilder.push(await readFile(join(o, id))); } catch { throw new Fachfehler(410, 'Ein Foto ist nicht mehr da (nach zwei Stunden verfallen) – bitte neu aufnehmen.'); }
    }
    return bilder;
  }

  /** Nach erfolgreichem Übernehmen löschen. */
  async weg(benutzerId: string, ids: string[]) {
    const o = this.ordner(benutzerId);
    for (const id of ids) if (ID.test(id)) await rm(join(o, id), { force: true });
  }

  /** Verfallene Fotos aller Benutzer löschen. */
  async aufraeumen() {
    let benutzer: string[];
    try { benutzer = await readdir(this.wurzel); } catch { return; }
    for (const b of benutzer) {
      const o = join(this.wurzel, b);
      let namen: string[];
      try { namen = await readdir(o); } catch { continue; }
      for (const n of namen) {
        try { if (this.jetzt() - (await stat(join(o, n))).mtimeMs > VERFALL_MS) await rm(join(o, n), { force: true }); } catch { /* schon weg */ }
      }
    }
  }
}
