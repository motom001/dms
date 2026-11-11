import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { MAX_DATEIGROESSE, POST_KANAL } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { t } from './sprache';
import { GB } from './grenzen';

/**
 * Eingangsordner (#195): Das DMS prüft einen Ordner (im Container /eingang) regelmäßig und macht
 * aus jeder fertigen Datei eine neue Post (Kanal „Ordner“). Scanner („Scan to Folder“), NAS und
 * andere Programme bringen so Dokumente ins DMS, ohne Browser.
 *
 *  - Abfragen statt Dateisystem-Ereignisse (über SMB/NFS und manche Docker-Einbindungen unzuverlässig).
 *  - Fertig ist eine Datei, wenn Größe und Änderungszeit über zwei Prüfungen gleich bleiben.
 *  - Personenordner (#915): Ein Ordner, der genau der E-Mail-Adresse eines aktiven Benutzers entspricht
 *    (eingang/lena@example.org/), setzt „Für“ – auch für alle Unterordner darunter (Datumsordner der Scanner).
 *    Name, Vorname oder der Teil vor dem @ zählen nicht: Ein Dokument darf nie bei der falschen Person landen.
 *    Ordner ohne Personenbezug zählen wie der Hauptordner; die Werkbank weist auf sie hin.
 *  - Danach nach erledigt/ verschieben (bei Personenordnern nach <e-mail>/erledigt/) oder löschen; Abgelehntes nach
 *    fehler/ mit Grund.
 *  - Überwachung (#915): höchstens alle paar Minuten eine Zusammenfassung je Ordner (Dateien, Größe, älteste Datei);
 *    daraus die Warnungen der Werkbank-Übersicht (zu alt, zu groß, fehler/ nicht leer, zu viele Dateien).
 *  - Keine doppelte Übernahme nach einem Absturz: Journal in den Einstellungen; erst wenn die Post
 *    gespeichert ist, wird die Datei bewegt. Mehrere Instanzen: nur eine übernimmt (Sperre).
 */

export interface EingangEinstellung {
  aktiv: boolean; abstand: number; nachher: 'erledigt' | 'loeschen';
  /** Doppelte Dateien (#333): gleiche Datei liegt schon im DMS → nicht als Post übernehmen, nur wegräumen. */
  doppelteUeberspringen?: boolean;
  /** Ordner je Person (#915) für neue Benutzer von selbst anlegen. */
  ordnerAutomatisch?: boolean;
  /** Warnungen (#915): Dateien älter als … Tage, alle zusammen über … GB, mehr als … Dateien; 0 = keine Warnung. */
  warnTage?: number; warnGb?: number; warnDateien?: number;
}
/**
 * Vorgaben. „Nach dem Übernehmen löschen“ (#915) gilt für neu eingerichtete Eingangsordner; wer schon ein `erledigt/`
 * hat und nie gespeichert hat, behält „verschieben“ (siehe `einstellung()`).
 */
export const EINGANG_STANDARD: EingangEinstellung = { aktiv: true, abstand: 30, nachher: 'loeschen', doppelteUeberspringen: false, ordnerAutomatisch: false, warnTage: 180, warnGb: 2, warnDateien: 100 };

export interface EingangEreignis { datei: string; zeit: string; mappeId?: string; grund?: string }

/** Ein Ordner der Überwachung (#915): Zahlen für alles darunter; `pfad` relativ zu /eingang ('' = der Eingangsordner selbst). */
export interface EingangKnoten {
  pfad: string; name: string;
  dateien: number; bytes: number; aeltester: string | null;
  /** Dateien tiefer als 5 Ebenen (außerhalb von erledigt/ und fehler/): Ablago übernimmt sie nicht. */
  zuTief: number;
  kinder: EingangKnoten[];
}
export interface EingangUeberblick {
  berechnet: string;
  /** Alles unter /eingang, auch erledigt/ und fehler/. */
  dateien: number; bytes: number; aeltester: string | null;
  /** Dateien in fehler/ (ohne die Textdateien mit dem Grund). */
  fehler: number;
  zuTief: number;
  baum: EingangKnoten;
  /** Zu viele Ordner: Der Baum zeigt nicht alle (die Zahlen stimmen trotzdem). */
  gekuerzt?: boolean;
}
export type EingangWarnung = 'alt' | 'groesse' | 'fehler' | 'anzahl';
/** Personenordner, dessen Benutzer eine neue E-Mail-Adresse hat, der sich aber nicht umbenennen ließ (#915). */
export interface EingangUmbenennen { alt: string; neu: string }
/** Was die Werkbank-Übersicht (#915) braucht. */
export interface EingangMeldungen {
  warnungen: EingangWarnung[];
  dateien: number; bytes: number; aeltester: string | null; fehler: number;
  grenzen: { tage: number; gb: number; dateien: number };
  ohnePerson: string[];
  umbenennen: EingangUmbenennen[];
}

/** Welche Grenzen der Überblick überschreitet (#915); 0 schaltet eine Warnung ab. */
export function eingangWarnungen(u: Pick<EingangUeberblick, 'dateien' | 'bytes' | 'aeltester' | 'fehler'> | null, e: EingangEinstellung, jetzt = Date.now()): EingangWarnung[] {
  if (!u) return [];
  const w: EingangWarnung[] = [];
  const tage = e.warnTage ?? EINGANG_STANDARD.warnTage!, gb = e.warnGb ?? EINGANG_STANDARD.warnGb!, dateien = e.warnDateien ?? EINGANG_STANDARD.warnDateien!;
  if (tage > 0 && u.aeltester && jetzt - Date.parse(u.aeltester) > tage * 86_400_000) w.push('alt');
  if (gb > 0 && u.bytes > gb * GB) w.push('groesse');
  if (u.fehler > 0) w.push('fehler');
  if (dateien > 0 && u.dateien > dateien) w.push('anzahl');
  return w;
}
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
  /** Überwachung (#915): Zusammenfassung je Ordner, höchstens alle paar Minuten neu berechnet; null = noch keine. */
  ueberblick: EingangUeberblick | null;
  warnungen: EingangWarnung[];
  /** Ordner, aus denen Post ohne „Für“ kam, weil sie zu keinem Benutzer gehören (#915). */
  ohnePerson: string[];
  umbenennen: EingangUmbenennen[];
  /** Aktive Personen ohne eigenen Ordner (für „Ordner für alle Benutzer anlegen“). */
  ohneOrdner: number;
}

interface Journal { pfad: string; sha256: string; groesse: number; seit: string; mappeId?: string }

export interface EingangDeps {
  dienst: Dienst;
  einstellungen: Einstellungen;
  /** Benutzer für „Für“ aus dem Unterordner. */
  benutzer: () => Promise<Array<{ id: string; name: string; email: string; aktiv: boolean; art?: string | null }>>;
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
/** NAS-eigene Ordner zählt auch die Überwachung nicht mit (Vorschaubilder, Papierkorb des NAS). */
const NAS_ORDNER = /^(@eadir|#recycle|\.@__thumb|@recycle|\.trash.*)$/i;
/** Wie tief Ablago übernimmt (Ebenen unter /eingang). */
const MAX_TIEFE = 5;
/** Überwachung: höchstens so oft neu rechnen, so viele Ordner im Baum, so tief suchen. */
const UEBERBLICK_MS = 5 * 60_000;
const UEBERBLICK_KNOTEN = 400;
const UEBERBLICK_TIEFE = 20;
const log = protokoll.modul('ablage');
const MAX_EREIGNISSE = 20;

export function pruefeEingangEinstellung(x: unknown, alt: EingangEinstellung): EingangEinstellung {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const abstand = o.abstand === undefined ? alt.abstand : Math.round(Number(o.abstand));
  if (!Number.isFinite(abstand) || abstand < 5 || abstand > 3600) throw new Fachfehler(422, t('meldungen.eingangsordner.pruefabstand-5-bis-3600'));
  const nachher = o.nachher === undefined ? alt.nachher : o.nachher;
  if (nachher !== 'erledigt' && nachher !== 'loeschen') throw new Fachfehler(422, t('meldungen.eingangsordner.nach-dem-uebernehmen-verschieben'));
  const doppelteUeberspringen = o.doppelteUeberspringen === undefined ? alt.doppelteUeberspringen === true : o.doppelteUeberspringen === true;
  const ordnerAutomatisch = o.ordnerAutomatisch === undefined ? alt.ordnerAutomatisch === true : o.ordnerAutomatisch === true;
  const grenze = (k: 'warnTage' | 'warnGb' | 'warnDateien', max: number, ganz: boolean) => {
    const v = o[k] === undefined ? alt[k] ?? EINGANG_STANDARD[k]! : Number(o[k]);
    if (!Number.isFinite(v) || v < 0 || v > max || (ganz && !Number.isInteger(v))) throw new Fachfehler(422, t('meldungen.eingangsordner.grenze-ungueltig', { max }));
    return v;
  };
  return {
    aktiv: o.aktiv === undefined ? alt.aktiv : o.aktiv === true, abstand, nachher, doppelteUeberspringen, ordnerAutomatisch,
    warnTage: grenze('warnTage', 3650, true), warnGb: grenze('warnGb', 100_000, false), warnDateien: grenze('warnDateien', 1_000_000, true),
  };
}

/** Ordnernamen vergleichen (#915): nur die vollständige E-Mail-Adresse, ohne Unterschied der Groß-/Kleinschreibung. */
const adresse = (s: string) => s.normalize('NFC').trim().toLowerCase();
type Person = { id: string; email: string };
/** Taugt die Adresse als Ordnername? (kein Pfadtrenner, nicht „.“ am Anfang) */
const ordnerName = (email: string) => !/[/\\\0]/.test(email) && !email.startsWith('.');

export class Eingangsordner {
  private gesehen = new Map<string, { groesse: number; mtime: number }>();
  private zeitgeber?: NodeJS.Timeout;
  private laeuft = false;
  private letztePruefung: string | null = null;
  private wartend = 0;
  private gesperrt = false;
  private pausiert: string | null = null;
  /** Wann die Überwachung (#915) zuletzt gerechnet hat (0 = noch nie seit dem Start). */
  private ueberblickZeit = 0;

  constructor(readonly pfad: string, private d: EingangDeps) {}

  get vorhanden() { return existsSync(this.pfad); }

  async einstellung(): Promise<EingangEinstellung> {
    const g = (await this.d.einstellungen.lies('eingangsordner')) as Partial<EingangEinstellung> | null;
    // Noch nie gespeichert (#915): Wer schon ein erledigt/ hat, behält „verschieben“; neu eingerichtet: löschen.
    if (!g) return { ...EINGANG_STANDARD, nachher: existsSync(join(this.pfad, 'erledigt')) ? 'erledigt' : 'loeschen' };
    return { ...EINGANG_STANDARD, ...g };
  }

  async speichere(x: unknown, von: string): Promise<EingangStand> {
    const neu = pruefeEingangEinstellung(x, await this.einstellung());
    await this.d.einstellungen.schreibe('eingangsordner', neu);
    log.info('Eingangsordner eingestellt', { von, ...neu });
    this.plane(neu.abstand);
    return this.stand();
  }

  private async ereignisse(): Promise<{ uebernommen: EingangEreignis[]; fehler: EingangEreignis[]; ohnePerson: string[]; umbenennen: EingangUmbenennen[] }> {
    const g = (await this.d.einstellungen.lies('eingangsordner_ereignisse')) as { uebernommen?: EingangEreignis[]; fehler?: EingangEreignis[]; ohnePerson?: string[]; umbenennen?: EingangUmbenennen[] } | null;
    return { uebernommen: g?.uebernommen ?? [], fehler: g?.fehler ?? [], ohnePerson: g?.ohnePerson ?? [], umbenennen: g?.umbenennen ?? [] };
  }
  private async merke(art: 'uebernommen' | 'fehler', e: EingangEreignis) {
    const g = await this.ereignisse();
    g[art] = [e, ...g[art]].slice(0, MAX_EREIGNISSE);
    await this.d.einstellungen.schreibe('eingangsordner_ereignisse', g);
  }
  /** Ordner ohne Personenbezug, aus dem gerade Post kam (#915): für den Hinweis in der Werkbank. */
  private async merkeOhnePerson(ordner: string) {
    const g = await this.ereignisse();
    if (g.ohnePerson.some((o) => adresse(o) === adresse(ordner))) return;
    g.ohnePerson = [ordner, ...g.ohnePerson].slice(0, MAX_EREIGNISSE);
    await this.d.einstellungen.schreibe('eingangsordner_ereignisse', g);
  }

  /** Aktive Personen mit E-Mail-Adresse (keine Dienst- und Systemkonten). */
  private async personen(): Promise<Person[]> {
    return (await this.d.benutzer()).filter((b) => b.aktiv && !b.art && !!b.email).map((b) => ({ id: b.id, email: b.email }));
  }
  /** Ordner direkt unter /eingang. */
  private async oberste(): Promise<string[]> {
    try { return (await readdir(this.pfad, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name); } catch { return []; }
  }

  async stand(): Promise<EingangStand> {
    const [e, ev, personen, oben] = await Promise.all([this.einstellung(), this.ereignisse(), this.personen(), this.oberste()]);
    const ueberblick = (await this.d.einstellungen.lies('eingangsordner_ueberblick')) as EingangUeberblick | null;
    const vorhanden = new Set(oben.map(adresse));
    const emails = new Set(personen.map((p) => adresse(p.email)));
    return {
      vorhanden: this.vorhanden, pfad: this.pfad, einstellung: e, letztePruefung: this.letztePruefung,
      wartend: this.wartend, pausiert: this.pausiert, uebernommen: ev.uebernommen, fehler: ev.fehler, andereInstanz: this.gesperrt,
      ueberblick, warnungen: eingangWarnungen(ueberblick, e),
      // Nur, solange der Ordner noch da ist und noch zu niemandem gehört.
      ohnePerson: ev.ohnePerson.filter((o) => vorhanden.has(adresse(o)) && !emails.has(adresse(o))),
      umbenennen: ev.umbenennen,
      ohneOrdner: personen.filter((p) => !vorhanden.has(adresse(p.email))).length,
    };
  }

  /** Für die Werkbank-Übersicht (#915): Warnungen, Zahlen, Ordner ohne Person, nicht umbenannte Ordner. */
  async meldungen(): Promise<EingangMeldungen | null> {
    if (!this.vorhanden) return null;
    const s = await this.stand();
    const u = s.ueberblick;
    return {
      warnungen: s.warnungen, dateien: u?.dateien ?? 0, bytes: u?.bytes ?? 0, aeltester: u?.aeltester ?? null, fehler: u?.fehler ?? 0,
      grenzen: { tage: s.einstellung.warnTage ?? 0, gb: s.einstellung.warnGb ?? 0, dateien: s.einstellung.warnDateien ?? 0 },
      ohnePerson: s.ohnePerson, umbenennen: s.umbenennen,
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

  /**
   * Eine Prüfung: Personenordner abgleichen, fertige Dateien übernehmen (nur eingeschaltet oder `sofort`), höchstens
   * alle {@link UEBERBLICK_MS} die Überwachung neu rechnen (#915; mit `sofort` immer). Liefert die Anzahl übernommener Dateien.
   */
  async pruefe(sofort = false): Promise<number> {
    if (this.laeuft || !this.vorhanden) return 0;
    const e = await this.einstellung();
    this.pausiert = this.d.pause?.() ?? null;
    if (this.pausiert) return 0;
    if (this.d.sperre && !(await this.d.sperre())) { this.gesperrt = true; return 0; }
    this.gesperrt = false;
    this.laeuft = true;
    try {
      // Vorgabe festhalten (#915): Ein später angelegtes erledigt/ soll „löschen“ nicht wieder umstellen.
      if (!(await this.d.einstellungen.lies('eingangsordner'))) await this.d.einstellungen.schreibe('eingangsordner', e);
      const personen = await this.personen();
      await this.gleicheOrdnerAb(personen, e);
      const n = e.aktiv || sofort ? await this.uebernimmFertige(e, personen) : 0;
      if (sofort || !this.ueberblickZeit || Date.now() - this.ueberblickZeit >= UEBERBLICK_MS) await this.merkeUeberblick();
      return n;
    } finally { this.laeuft = false; }
  }

  private async uebernimmFertige(e: EingangEinstellung, personen: Person[]): Promise<number> {
    await this.raeumeJournalAuf(e, personen);
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
      if (await this.uebernimm(f.pfad, f.groesse, e, personen)) n++;
      this.gesehen.delete(f.pfad);
    }
    return n;
  }

  /** Alle Dateien unterhalb des Ordners, ohne Übersprungenes (rekursiv, höchstens 5 Ebenen). */
  private async liste(): Promise<Array<{ pfad: string; groesse: number; mtime: number }>> {
    const aus: Array<{ pfad: string; groesse: number; mtime: number }> = [];
    const gehe = async (ordner: string, tiefe: number) => {
      let eintraege;
      try { eintraege = await readdir(ordner, { withFileTypes: true }); } catch { return; }
      for (const x of eintraege) {
        const p = join(ordner, x.name);
        if (x.isDirectory()) { if (tiefe < MAX_TIEFE && !UEBERSPRINGEN_ORDNER.test(x.name)) await gehe(p, tiefe + 1); continue; }
        if (!x.isFile() || UEBERSPRINGEN_DATEI.test(x.name)) continue;
        try { const s = await stat(p); aus.push({ pfad: p, groesse: s.size, mtime: s.mtimeMs }); } catch { /* inzwischen weg */ }
      }
    };
    await gehe(this.pfad, 0);
    return aus.sort((a, b) => a.pfad.localeCompare(b.pfad));
  }

  /**
   * Personenordner (#915): der nächste Ordner über der Datei, der genau der E-Mail-Adresse einer aktiven Person
   * entspricht. `ebene`: Index im Pfad (0 = direkt unter /eingang). Kein Treffer: kein „Für“ – nie raten.
   */
  private personIn(rel: string, personen: Person[]): { id: string; ebene: number } | null {
    const teile = rel.split(sep);
    const nach = new Map(personen.map((p) => [adresse(p.email), p.id] as const));
    for (let i = teile.length - 2; i >= 0; i--) {
      const id = nach.get(adresse(teile[i]));
      if (id) return { id, ebene: i };
    }
    return null;
  }

  /**
   * Ordner je Person (#915): Ändert sich die E-Mail-Adresse, benennt Ablago den selbst angelegten Ordner mit um; geht
   * das nicht (Zielordner gibt es schon, Fehler), steht es in der Werkbank. Mit „automatisch“ bekommen neue Personen
   * ihren Ordner. Selbst angelegt heißt: in `eingangsordner_personen` vermerkt (Benutzer-Id → Ordnername).
   */
  private async gleicheOrdnerAb(personen: Person[], e: EingangEinstellung) {
    const reg = { ...(((await this.d.einstellungen.lies('eingangsordner_personen')) as Record<string, string> | null) ?? {}) };
    const vorher = JSON.stringify(reg);
    const umbenennen: EingangUmbenennen[] = [];
    for (const [id, name] of Object.entries(reg)) {
      const p = personen.find((x) => x.id === id);
      // Deaktiviert oder gelöscht: Der Ordner bleibt, wie er ist.
      if (!p || adresse(p.email) === adresse(name)) continue;
      const alt = join(this.pfad, name), neu = join(this.pfad, p.email);
      // Von Hand entfernt: nicht mehr Ablagos Ordner.
      if (!existsSync(alt)) { delete reg[id]; continue; }
      if (!ordnerName(p.email) || existsSync(neu)) { umbenennen.push({ alt: name, neu: p.email }); continue; }
      try {
        await rename(alt, neu);
        reg[id] = p.email;
        log.info('Eingangsordner: Personenordner umbenannt', { von: name, nach: p.email });
      } catch (x) {
        umbenennen.push({ alt: name, neu: p.email });
        log.warn('Eingangsordner: Personenordner nicht umbenannt', { von: name, nach: p.email, fehler: (x as Error).message });
      }
    }
    if (e.ordnerAutomatisch) await this.legeOrdnerAn(personen, reg, true);
    if (JSON.stringify(reg) !== vorher) await this.d.einstellungen.schreibe('eingangsordner_personen', reg);
    const ev = await this.ereignisse();
    if (JSON.stringify(ev.umbenennen) !== JSON.stringify(umbenennen)) await this.d.einstellungen.schreibe('eingangsordner_ereignisse', { ...ev, umbenennen });
  }

  /** Fehlende Personenordner anlegen; `nurNeue`: nur für Personen, für die Ablago noch nie einen angelegt hat. */
  private async legeOrdnerAn(personen: Person[], reg: Record<string, string>, nurNeue: boolean): Promise<string[]> {
    const vorhanden = new Set((await this.oberste()).map(adresse));
    const angelegt: string[] = [];
    for (const p of personen) {
      if ((nurNeue && reg[p.id]) || vorhanden.has(adresse(p.email)) || !ordnerName(p.email)) continue;
      try {
        await mkdir(join(this.pfad, p.email));
        reg[p.id] = p.email;
        angelegt.push(p.email);
      } catch (x) { log.warn('Eingangsordner: Personenordner nicht angelegt', { ordner: p.email, fehler: (x as Error).message }); }
    }
    if (angelegt.length) log.info('Eingangsordner: Ordner je Person angelegt', { ordner: angelegt });
    return angelegt;
  }

  /** „Ordner für alle Benutzer anlegen“ (#915): je aktive Person `eingang/<e-mail>/`, sofern es ihn noch nicht gibt. */
  async ordnerFuerAlle(von: string): Promise<{ angelegt: string[]; stand: EingangStand }> {
    if (!this.vorhanden) throw new Fachfehler(404, t('meldungen.routen.es-ist-kein-eingangsordner'));
    const reg = { ...(((await this.d.einstellungen.lies('eingangsordner_personen')) as Record<string, string> | null) ?? {}) };
    const angelegt = await this.legeOrdnerAn(await this.personen(), reg, false);
    if (angelegt.length) await this.d.einstellungen.schreibe('eingangsordner_personen', reg);
    log.info('Eingangsordner: „Ordner für alle Benutzer anlegen“', { von, anzahl: angelegt.length });
    await this.merkeUeberblick();
    return { angelegt, stand: await this.stand() };
  }

  /**
   * Überwachung (#915): alle Dateien unter /eingang, auch erledigt/ und fehler/ (ohne die Ordner der NAS-Systeme), je
   * Ordner Anzahl, Größe und älteste Datei. Nur Verzeichnisse lesen und `stat` – kein Inhalt.
   */
  async rechneUeberblick(): Promise<EingangUeberblick> {
    let knoten = 0, gekuerzt = false, fehler = 0;
    const gehe = async (ordner: string, rel: string[], tiefe: number, erledigt: boolean, inFehler: boolean, zeigen: boolean): Promise<EingangKnoten> => {
      const k: EingangKnoten = { pfad: rel.join('/'), name: rel.at(-1) ?? '', dateien: 0, bytes: 0, aeltester: null, zuTief: 0, kinder: [] };
      let eintraege;
      try { eintraege = await readdir(ordner, { withFileTypes: true }); } catch { return k; }
      for (const x of eintraege.sort((a, b) => a.name.localeCompare(b.name))) {
        const p = join(ordner, x.name);
        if (x.isDirectory()) {
          if (NAS_ORDNER.test(x.name) || tiefe >= UEBERBLICK_TIEFE) continue;
          const zeigeKind = zeigen && knoten < UEBERBLICK_KNOTEN;
          if (zeigeKind) knoten++; else if (zeigen) gekuerzt = true;
          const kind = await gehe(p, [...rel, x.name], tiefe + 1, erledigt || /^(erledigt|fehler)$/i.test(x.name), inFehler || (tiefe === 0 && /^fehler$/i.test(x.name)), zeigeKind);
          k.dateien += kind.dateien; k.bytes += kind.bytes; k.zuTief += kind.zuTief;
          if (kind.aeltester && (!k.aeltester || kind.aeltester < k.aeltester)) k.aeltester = kind.aeltester;
          if (zeigeKind) k.kinder.push(kind);
          continue;
        }
        if (!x.isFile()) continue;
        let s;
        try { s = await stat(p); } catch { continue; }
        const am = new Date(s.mtimeMs).toISOString();
        k.dateien++; k.bytes += s.size;
        if (!k.aeltester || am < k.aeltester) k.aeltester = am;
        if (inFehler && !x.name.endsWith('.grund.txt')) fehler++;
        // Tiefer als 5 Ebenen: bleibt liegen (liste() sieht dort nicht nach).
        if (!erledigt && tiefe > MAX_TIEFE) k.zuTief++;
      }
      return k;
    };
    const baum = await gehe(this.pfad, [], 0, false, false, true);
    return { berechnet: new Date().toISOString(), dateien: baum.dateien, bytes: baum.bytes, aeltester: baum.aeltester, fehler, zuTief: baum.zuTief, baum, ...(gekuerzt ? { gekuerzt } : {}) };
  }
  private async merkeUeberblick() {
    this.ueberblickZeit = Date.now();
    try { await this.d.einstellungen.schreibe('eingangsordner_ueberblick', await this.rechneUeberblick()); }
    catch (x) { log.warn('Eingangsordner: Überwachung nicht berechnet', { fehler: (x as Error).message }); }
  }

  private async uebernimm(pfad: string, groesse: number, e: EingangEinstellung, personen: Person[]): Promise<boolean> {
    const rel = relative(this.pfad, pfad);
    const anzeige = `eingang/${rel.split(sep).join('/')}`;
    const person = this.personIn(rel, personen);
    if (groesse === 0) { await this.ablehnen(pfad, rel, t('meldungen.eingangsordner.die-datei-ist-leer')); return false; }
    if (groesse > MAX_DATEIGROESSE) { await this.ablehnen(pfad, rel, t('meldungen.eingangsordner.die-datei-ist-groesser')); return false; }
    let inhalt: Buffer;
    try { inhalt = await readFile(pfad); } catch (x) { log.warn('Eingangsordner: Datei nicht lesbar', { datei: anzeige, fehler: (x as Error).message }); return false; }
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    // Doppelt (#333): auf Wunsch gar nicht erst als Post übernehmen.
    if (e.doppelteUeberspringen && (await this.d.dienst.dokumenteMitInhalt(sha256)).length) {
      await this.nachher(pfad, rel, e, person);
      await this.merke('uebernommen', { datei: anzeige, zeit: new Date().toISOString(), grund: t('meldungen.eingangsordner.doppelt-liegt-schon-in') });
      log.info('Eingangsordner: doppelte Datei übersprungen', { datei: anzeige });
      return true;
    }
    const journal: Journal = { pfad, sha256, groesse, seit: new Date().toISOString() };
    await this.d.einstellungen.schreibe('eingangsordner_journal', journal);
    let mappeId: string;
    try {
      const gleich = await this.d.dienst.dokumenteMitInhalt(sha256);
      const post = await this.d.dienst.legePostAn({ betreff: basename(rel, extname(rel)).slice(0, 250), ...(person ? { an: person.id } : {}) },
        { id: null, name: SYSTEMNAME }, undefined, POST_KANAL.ordner,
        // Doppelt (#333): nur die Anzahl – Titel sähe jeder, der die Post lesen darf, auch für fremde Mappen.
        { text: t('meldungen.eingangsordner.aus-dem-eingangsordner-uebernommen', { anzeige }), datei: anzeige, ...(gleich.length ? { doppelt: gleich.length } : {}) });
      mappeId = post.id;
      await this.d.einstellungen.schreibe('eingangsordner_journal', { ...journal, mappeId });
      const typ = await this.d.dienst.postTyp();
      const register = typ.register.find((r) => r.art === 'dokumente')?.key;
      await this.d.dienst.dokumente.ladeHoch(post.id, { register, name: basename(rel), typ: MIME[extname(rel).toLowerCase()] }, inhalt, null);
    } catch (x) {
      await this.d.einstellungen.schreibe('eingangsordner_journal', null);
      const f = x as Error & { status?: number };
      // Speicherplatz-Grenze: Die Datei bleibt liegen und kommt beim nächsten Mal dran.
      if (x instanceof Fachfehler && x.status === 507) { await this.merke('fehler', { datei: anzeige, zeit: new Date().toISOString(), grund: t('meldungen.eingangsordner.die-datei-bleibt-im', { message: f.message }) }); return false; }
      await this.ablehnen(pfad, rel, f.message);
      return false;
    }
    await this.nachher(pfad, rel, e, person);
    await this.d.einstellungen.schreibe('eingangsordner_journal', null);
    await this.merke('uebernommen', { datei: anzeige, zeit: new Date().toISOString(), mappeId });
    // Unterordner ohne Personenbezug (#915): Post ohne „Für“ wie aus dem Hauptordner – und ein Hinweis in der Werkbank.
    if (!person && rel.split(sep).length > 1) await this.merkeOhnePerson(rel.split(sep)[0]);
    log.info('Eingangsordner: Datei übernommen', { datei: anzeige, mappe: mappeId });
    return true;
  }

  /** Nach einem Absturz: War die Post schon gespeichert, nur noch die Datei wegräumen. */
  private async raeumeJournalAuf(e: EingangEinstellung, personen: Person[]) {
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
          await this.d.dienst.dokumente.ladeHoch(mappeId, { register: typ.register.find((r) => r.art === 'dokumente')?.key, name: basename(rel), typ: MIME[extname(rel).toLowerCase()] }, inhalt, null).catch(() => {});
        }
        await this.nachher(j.pfad, rel, e, this.personIn(rel, personen));
        log.warn('Eingangsordner: nach einem Abbruch aufgeräumt – keine doppelte Post', { datei: rel, mappe: mappeId });
      }
    }
    await this.d.einstellungen.schreibe('eingangsordner_journal', null);
  }

  /** Wegräumen: löschen oder nach erledigt/ – bei Personenordnern nach <e-mail>/erledigt/ (#915), nicht in ein gemeinsames. */
  private async nachher(pfad: string, rel: string, e: EingangEinstellung, person: { ebene: number } | null) {
    if (e.nachher === 'loeschen') { await rm(pfad, { force: true }); return; }
    const teile = rel.split(sep);
    const ziel = person ? join(this.pfad, ...teile.slice(0, person.ebene + 1), 'erledigt', ...teile.slice(person.ebene + 1)) : join(this.pfad, 'erledigt', rel);
    await this.verschiebe(pfad, ziel);
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
