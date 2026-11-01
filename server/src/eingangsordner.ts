import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { MAX_DATEIGROESSE, POST_KANAL } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Eingangsordner (#195): Das DMS prüft einen Ordner (im Container /eingang) regelmäßig und macht
 * aus jeder fertigen Datei eine neue Post (Kanal „Ordner“). Scanner („Scan to Folder“), NAS und
 * andere Programme bringen so Dokumente ins DMS, ohne Browser.
 *
 *  - Abfragen statt Dateisystem-Ereignisse (über SMB/NFS und manche Docker-Einbindungen unzuverlässig).
 *  - Fertig ist eine Datei, wenn Größe und Änderungszeit über zwei Prüfungen gleich bleiben.
 *  - Unterordner mit dem Namen eines Benutzers (eingang/thomas/) setzen „Für“.
 *  - Danach nach erledigt/ verschieben oder löschen; Abgelehntes nach fehler/ mit Grund.
 *  - Keine doppelte Übernahme nach einem Absturz: Journal in den Einstellungen; erst wenn die Post
 *    gespeichert ist, wird die Datei bewegt. Mehrere Instanzen: nur eine übernimmt (Sperre).
 */

export interface EingangEinstellung {
  aktiv: boolean; abstand: number; nachher: 'erledigt' | 'loeschen';
  /** Doppelte Dateien (#333): gleiche Datei liegt schon im DMS → nicht als Post übernehmen, nur wegräumen. */
  doppelteUeberspringen?: boolean;
}
export const EINGANG_STANDARD: EingangEinstellung = { aktiv: true, abstand: 30, nachher: 'erledigt', doppelteUeberspringen: false };

export interface EingangEreignis { datei: string; zeit: string; mappeId?: string; grund?: string }
export interface EingangStand {
  vorhanden: boolean;
  pfad: string;
  einstellung: EingangEinstellung;
  letztePruefung: string | null;
  /** Gerade gesehen, aber noch nicht fertig (Scanner schreibt noch). */
  wartend: number;
  pausiert: string | null;
  uebernommen: EingangEreignis[];
  fehler: EingangEreignis[];
  /** Diese Instanz übernimmt nicht (eine andere hat die Sperre). */
  andereInstanz: boolean;
}

interface Journal { pfad: string; sha256: string; groesse: number; seit: string; mappeId?: string }

export interface EingangDeps {
  dienst: Dienst;
  einstellungen: Einstellungen;
  /** Benutzer für „Für“ aus dem Unterordner. */
  benutzer: () => Promise<Array<{ id: string; name: string; email: string; aktiv: boolean }>>;
  /** Wartungsmodus aktiv oder Wiederherstellung läuft: ruhen. */
  pause?: () => string | null;
  /** Nur eine Instanz übernimmt (z. B. pg_try_advisory_lock). */
  sperre?: () => Promise<boolean>;
}

const SYSTEMNAME = 'Eingangsordner';
const UEBERSPRINGEN_DATEI = /^(\..*|~.*|.*\.(tmp|part|crdownload|partial)|thumbs\.db|desktop\.ini)$/i;
const UEBERSPRINGEN_ORDNER = /^(\..*|@eadir|#recycle|\.@__thumb|@recycle|\.trash.*|erledigt|fehler)$/i;
export const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.txt': 'text/plain', '.eml': 'message/rfc822', '.xml': 'application/xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
};
const log = protokoll.modul('ablage');
const MAX_EREIGNISSE = 20;

export function pruefeEingangEinstellung(x: unknown, alt: EingangEinstellung): EingangEinstellung {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const abstand = o.abstand === undefined ? alt.abstand : Math.round(Number(o.abstand));
  if (!Number.isFinite(abstand) || abstand < 5 || abstand > 3600) throw new Fachfehler(422, 'Prüfabstand: 5 bis 3600 Sekunden.');
  const nachher = o.nachher === undefined ? alt.nachher : o.nachher;
  if (nachher !== 'erledigt' && nachher !== 'loeschen') throw new Fachfehler(422, 'Nach dem Übernehmen: verschieben (erledigt) oder löschen.');
  const doppelteUeberspringen = o.doppelteUeberspringen === undefined ? alt.doppelteUeberspringen === true : o.doppelteUeberspringen === true;
  return { aktiv: o.aktiv === undefined ? alt.aktiv : o.aktiv === true, abstand, nachher, doppelteUeberspringen };
}

const vereinfacht = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export class Eingangsordner {
  private gesehen = new Map<string, { groesse: number; mtime: number }>();
  private zeitgeber?: NodeJS.Timeout;
  private laeuft = false;
  private letztePruefung: string | null = null;
  private wartend = 0;
  private gesperrt = false;
  private pausiert: string | null = null;

  constructor(readonly pfad: string, private d: EingangDeps) {}

  get vorhanden() { return existsSync(this.pfad); }

  async einstellung(): Promise<EingangEinstellung> {
    const g = (await this.d.einstellungen.lies('eingangsordner')) as Partial<EingangEinstellung> | null;
    return { ...EINGANG_STANDARD, ...(g ?? {}) };
  }

  async speichere(x: unknown, von: string): Promise<EingangStand> {
    const neu = pruefeEingangEinstellung(x, await this.einstellung());
    await this.d.einstellungen.schreibe('eingangsordner', neu);
    log.info('Eingangsordner eingestellt', { von, ...neu });
    this.plane(neu.abstand);
    return this.stand();
  }

  private async ereignisse(): Promise<{ uebernommen: EingangEreignis[]; fehler: EingangEreignis[] }> {
    const g = (await this.d.einstellungen.lies('eingangsordner_ereignisse')) as { uebernommen?: EingangEreignis[]; fehler?: EingangEreignis[] } | null;
    return { uebernommen: g?.uebernommen ?? [], fehler: g?.fehler ?? [] };
  }
  private async merke(art: 'uebernommen' | 'fehler', e: EingangEreignis) {
    const g = await this.ereignisse();
    g[art] = [e, ...g[art]].slice(0, MAX_EREIGNISSE);
    await this.d.einstellungen.schreibe('eingangsordner_ereignisse', g);
  }

  async stand(): Promise<EingangStand> {
    const e = await this.ereignisse();
    return {
      vorhanden: this.vorhanden, pfad: this.pfad, einstellung: await this.einstellung(), letztePruefung: this.letztePruefung,
      wartend: this.wartend, pausiert: this.pausiert, uebernommen: e.uebernommen, fehler: e.fehler, andereInstanz: this.gesperrt,
    };
  }

  /** Regelmäßig prüfen; der Abstand kommt aus der Einstellung. */
  async start() {
    if (!this.vorhanden) return;
    const e = await this.einstellung();
    log.info(`Eingangsordner ${this.pfad} gefunden${e.aktiv ? ` – wird alle ${e.abstand} Sekunden geprüft` : ' – ausgeschaltet (Werkbank → Eingangsordner)'}`);
    this.plane(e.abstand);
  }
  private plane(sekunden: number) {
    if (this.zeitgeber) clearInterval(this.zeitgeber);
    if (!this.vorhanden) return;
    this.zeitgeber = setInterval(() => void this.pruefe().catch((x) => log.error('Eingangsordner prüfen fehlgeschlagen', { fehler: (x as Error).message })), sekunden * 1000);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }

  /** Eine Prüfung: fertige Dateien übernehmen. Liefert die Anzahl übernommener Dateien. */
  async pruefe(sofort = false): Promise<number> {
    if (this.laeuft || !this.vorhanden) return 0;
    const e = await this.einstellung();
    if (!e.aktiv && !sofort) return 0;
    this.pausiert = this.d.pause?.() ?? null;
    if (this.pausiert) return 0;
    if (this.d.sperre && !(await this.d.sperre())) { this.gesperrt = true; return 0; }
    this.gesperrt = false;
    this.laeuft = true;
    try {
      await this.raeumeJournalAuf(e);
      const dateien = await this.liste();
      this.letztePruefung = new Date().toISOString();
      const fertig: Array<{ pfad: string; groesse: number }> = [];
      const jetzt = new Map<string, { groesse: number; mtime: number }>();
      for (const f of dateien) {
        jetzt.set(f.pfad, { groesse: f.groesse, mtime: f.mtime });
        const vorher = this.gesehen.get(f.pfad);
        if (vorher && vorher.groesse === f.groesse && vorher.mtime === f.mtime) fertig.push(f);
      }
      this.gesehen = jetzt;
      this.wartend = dateien.length - fertig.length;
      let n = 0;
      for (const f of fertig) {
        if (this.d.pause?.()) break;
        if (await this.uebernimm(f.pfad, f.groesse, e)) n++;
        this.gesehen.delete(f.pfad);
      }
      return n;
    } finally { this.laeuft = false; }
  }

  /** Alle Dateien unterhalb des Ordners, ohne Übersprungenes (rekursiv, höchstens 5 Ebenen). */
  private async liste(): Promise<Array<{ pfad: string; groesse: number; mtime: number }>> {
    const aus: Array<{ pfad: string; groesse: number; mtime: number }> = [];
    const gehe = async (ordner: string, tiefe: number) => {
      let eintraege;
      try { eintraege = await readdir(ordner, { withFileTypes: true }); } catch { return; }
      for (const x of eintraege) {
        const p = join(ordner, x.name);
        if (x.isDirectory()) { if (tiefe < 5 && !UEBERSPRINGEN_ORDNER.test(x.name)) await gehe(p, tiefe + 1); continue; }
        if (!x.isFile() || UEBERSPRINGEN_DATEI.test(x.name)) continue;
        try { const s = await stat(p); aus.push({ pfad: p, groesse: s.size, mtime: s.mtimeMs }); } catch { /* inzwischen weg */ }
      }
    };
    await gehe(this.pfad, 0);
    return aus.sort((a, b) => a.pfad.localeCompare(b.pfad));
  }

  /** Erster Unterordner als Benutzer (Name, Vorname oder Teil der E-Mail vor dem @). */
  private async fuer(rel: string): Promise<string | null> {
    const teile = rel.split(sep);
    if (teile.length < 2) return null;
    const ordner = vereinfacht(teile[0]);
    if (!ordner) return null;
    for (const b of (await this.d.benutzer()).filter((x) => x.aktiv)) {
      const namen = [b.name, b.name.split(/\s+/)[0], b.email.split('@')[0]].map(vereinfacht).filter(Boolean);
      if (namen.includes(ordner)) return b.id;
    }
    return null;
  }

  private async uebernimm(pfad: string, groesse: number, e: EingangEinstellung): Promise<boolean> {
    const rel = relative(this.pfad, pfad);
    const anzeige = `eingang/${rel.split(sep).join('/')}`;
    if (groesse === 0) { await this.ablehnen(pfad, rel, 'Die Datei ist leer.'); return false; }
    if (groesse > MAX_DATEIGROESSE) { await this.ablehnen(pfad, rel, 'Die Datei ist größer als 100 MB.'); return false; }
    let inhalt: Buffer;
    try { inhalt = await readFile(pfad); } catch (x) { log.warn('Eingangsordner: Datei nicht lesbar', { datei: anzeige, fehler: (x as Error).message }); return false; }
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    // Doppelt (#333): auf Wunsch gar nicht erst als Post übernehmen.
    if (e.doppelteUeberspringen && (await this.d.dienst.dokumenteMitInhalt(sha256)).length) {
      await this.nachher(pfad, rel, e);
      await this.merke('uebernommen', { datei: anzeige, zeit: new Date().toISOString(), grund: 'doppelt – liegt schon im DMS, übersprungen' });
      log.info('Eingangsordner: doppelte Datei übersprungen', { datei: anzeige });
      return true;
    }
    const journal: Journal = { pfad, sha256, groesse, seit: new Date().toISOString() };
    await this.d.einstellungen.schreibe('eingangsordner_journal', journal);
    let mappeId: string;
    try {
      const fuer = await this.fuer(rel);
      const gleich = await this.d.dienst.dokumenteMitInhalt(sha256);
      const post = await this.d.dienst.legePostAn({ betreff: basename(rel, extname(rel)).slice(0, 250), ...(fuer ? { fuer } : {}) },
        { id: null, name: SYSTEMNAME }, undefined, POST_KANAL.ordner,
        // Doppelt (#333): nur die Anzahl – Titel sähe jeder, der die Post lesen darf, auch für fremde Mappen.
        { text: `aus dem Eingangsordner übernommen (${anzeige})`, datei: anzeige, ...(gleich.length ? { doppelt: gleich.length } : {}) });
      mappeId = post.id;
      await this.d.einstellungen.schreibe('eingangsordner_journal', { ...journal, mappeId });
      const typ = await this.d.dienst.postTyp();
      const register = typ.register.find((r) => r.art === 'dokumente')?.key;
      await this.d.dienst.ladeHoch(post.id, { register, name: basename(rel), typ: MIME[extname(rel).toLowerCase()] }, inhalt, null);
    } catch (x) {
      await this.d.einstellungen.schreibe('eingangsordner_journal', null);
      const f = x as Error & { status?: number };
      // Speicherplatz-Grenze: Die Datei bleibt liegen und kommt beim nächsten Mal dran.
      if (x instanceof Fachfehler && x.status === 507) { await this.merke('fehler', { datei: anzeige, zeit: new Date().toISOString(), grund: `${f.message} – die Datei bleibt im Eingangsordner.` }); return false; }
      await this.ablehnen(pfad, rel, f.message);
      return false;
    }
    await this.nachher(pfad, rel, e);
    await this.d.einstellungen.schreibe('eingangsordner_journal', null);
    await this.merke('uebernommen', { datei: anzeige, zeit: new Date().toISOString(), mappeId });
    log.info('Eingangsordner: Datei übernommen', { datei: anzeige, mappe: mappeId });
    return true;
  }

  /** Nach einem Absturz: War die Post schon gespeichert, nur noch die Datei wegräumen. */
  private async raeumeJournalAuf(e: EingangEinstellung) {
    const j = (await this.d.einstellungen.lies('eingangsordner_journal')) as Journal | null;
    if (!j) return;
    const rel = relative(this.pfad, j.pfad);
    let mappeId = j.mappeId;
    if (!mappeId) {
      // Post angelegt, aber das Journal noch nicht nachgetragen? Dann gibt es eine Post mit dieser Datei.
      mappeId = (await this.d.dienst.postMitDatei(j.sha256, j.seit)) ?? undefined;
    }
    if (mappeId && existsSync(j.pfad)) {
      const inhalt = await readFile(j.pfad).catch(() => null);
      if (inhalt && createHash('sha256').update(inhalt).digest('hex') === j.sha256) {
        // Dokument fehlt noch (Absturz zwischen Post und Hochladen)? Dann jetzt nachholen.
        if (!(await this.d.dienst.postMitDatei(j.sha256, j.seit))) {
          const typ = await this.d.dienst.postTyp();
          await this.d.dienst.ladeHoch(mappeId, { register: typ.register.find((r) => r.art === 'dokumente')?.key, name: basename(rel), typ: MIME[extname(rel).toLowerCase()] }, inhalt, null).catch(() => {});
        }
        await this.nachher(j.pfad, rel, e);
        log.warn('Eingangsordner: nach einem Abbruch aufgeräumt – keine doppelte Post', { datei: rel, mappe: mappeId });
      }
    }
    await this.d.einstellungen.schreibe('eingangsordner_journal', null);
  }

  private async nachher(pfad: string, rel: string, e: EingangEinstellung) {
    if (e.nachher === 'loeschen') { await rm(pfad, { force: true }); return; }
    await this.verschiebe(pfad, join(this.pfad, 'erledigt', rel));
  }

  private async ablehnen(pfad: string, rel: string, grund: string) {
    const ziel = await this.verschiebe(pfad, join(this.pfad, 'fehler', rel));
    await writeFile(`${ziel}.grund.txt`, `${new Date().toLocaleString('de-DE')}: ${grund}\n`).catch(() => {});
    await this.merke('fehler', { datei: `eingang/${rel.split(sep).join('/')}`, zeit: new Date().toISOString(), grund });
    log.warn('Eingangsordner: Datei abgelehnt', { datei: rel, grund });
  }

  /** Verschieben ohne zu überschreiben: „Scan.pdf“ → „Scan (2).pdf“. */
  private async verschiebe(von: string, nach: string): Promise<string> {
    await mkdir(dirname(nach), { recursive: true });
    let ziel = nach;
    for (let i = 2; existsSync(ziel); i++) ziel = join(dirname(nach), `${basename(nach, extname(nach))} (${i})${extname(nach)}`);
    await rename(von, ziel);
    return ziel;
  }
}
