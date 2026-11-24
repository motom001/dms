/** Sicherung (#1278 aus sicherung.ts): Grundklasse – Einstellungen, Liste der Sicherungen, Speicherplatz und Speicherort. */
import { join } from 'node:path';
import { statfs, readdir, stat, readFile, rm, mkdir, writeFile, rename } from 'node:fs/promises';
import {
  type SicherungsQuellen,
  type Lauf,
  type ExternStand,
  type Eintragsliste,
  type Plan,
  bereinigePlan,
  PLAN_STANDARD,
  log,
  type ProbePlan,
  PROBE_STANDARD,
  type Probeergebnis,
  ENDUNG,
  type Metadaten,
  type SchlankeMetadaten,
  istSchlank,
  dateienUnter,
  bereinigeWozu,
} from './sicherung-hilfen';
import type { EntfernteSicherungen } from './sicherung-entfernt';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { GB } from '../grundlagen/grenzen';
import type { Abrufbar } from '../http/teilabruf';
import { oeffneStrom } from '../dateien/dateispeicher';
import { sha256Von } from './sicherungsformat';
import { aufVolume, geraetVon } from '../geheimnisse/tresor';
import { hochrechnung } from '../../../shared/src/sicherungsplan';

export abstract class SicherungBasis {
  /** Was die Klasse Sicherung setzt (Felder und Konstruktor, sicherung.ts) bzw. weiter oben in der Kette steht. */
  abstract readonly ordner: string;
  abstract readonly dateiWurzel: string;
  abstract readonly haushaltId: string;
  protected abstract q: SicherungsQuellen;
  protected abstract lauf: Lauf | null;
  protected abstract jetzt: () => Date;
  abstract sperre: () => boolean;
  abstract readonly entfernt: EntfernteSicherungen;
  protected abstract externStaende(): Promise<Record<string, Record<string, ExternStand>>>;
  protected abstract vergissExtern(namen: string[]): Promise<void>;
  abstract nurNeuesteMoeglich(liste?: Eintragsliste[]): Promise<boolean>;

  get dateiOrdner() {
    return join(this.dateiWurzel, this.haushaltId);
  }
  get einstellungen() {
    return this.q.einstellungen;
  }
  aktuellerLauf(): Lauf | null {
    return this.lauf ? { ...this.lauf } : null;
  }
  /**
   * Stand für die Routen (#1341): hier der eigene Lauf; in weiteren Prozessen fragt `teileArbeit` den Leiter, der den Lauf
   * hält – der Spiegel (`aktuellerLauf()`) kann dort bis zu einer Sekunde alt sein oder nach dem Start noch fehlen.
   */
  laufStand: () => Promise<Lauf | null> = async () => this.aktuellerLauf();
  laeuft() {
    return this.lauf?.status === 'laeuft';
  }

  /** Ein einziger Lauf zur Zeit (Sicherung, Prüfung, später Wiederherstellung). */
  belege(art: Lauf['art'], titel: string): Lauf {
    if (this.laeuft()) throw new Fachfehler(409, t('meldungen.sicherung.es-laeuft-bereits-bitte', { titel: this.lauf!.titel }));
    if (titel !== t('meldungen.sicherung.sicherung-vor-der-wiederherstellung') && this.sperre())
      throw new Fachfehler(409, t('meldungen.sicherung.gerade-laeuft-eine-wiederherstellung'));
    this.lauf = { art, titel, status: 'laeuft', schritt: 'Vorbereiten', bytes: 0, gesamt: 0, gestartet: this.jetzt().toISOString() };
    return this.lauf;
  }

  /* ---------- Einstellungen ---------- */

  async plan(): Promise<Plan> {
    const g = await this.q.einstellungen.lies('sicherung_plan');
    try {
      return g ? bereinigePlan(g) : { ...PLAN_STANDARD };
    } catch {
      return { ...PLAN_STANDARD };
    }
  }

  async speicherePlan(e: unknown, von: string): Promise<Plan> {
    const alt = await this.plan();
    const neu = bereinigePlan({ ...(e as object), aktivSeit: undefined }, alt);
    neu.aktivSeit = neu.aktiv ? (alt.aktiv ? alt.aktivSeit : this.jetzt().toISOString()) : null;
    if (neu.aktiv && !alt.aktiv && !(await this.notfallblatt()).aktuell) {
      throw new Fachfehler(409, t('meldungen.sicherung.die-automatische-sicherung-laesst'));
    }
    // #1194: „Lokal nur die neueste“ nur mit einer Kopie außer Haus, die zuletzt erfolgreich lief – sonst Datenverlust.
    if (neu.nurNeueste && !alt.nurNeueste && !(await this.nurNeuesteMoeglich())) {
      throw new Fachfehler(409, t('meldungen.sicherung.nur-neueste-ohne-ausser-haus'));
    }
    await this.q.einstellungen.schreibe('sicherung_plan', neu);
    log.info('Zeitplan der Sicherung geändert', { von, ...neu });
    return neu;
  }

  async probePlan(): Promise<ProbePlan> {
    const g = (await this.q.einstellungen.lies('sicherung_probe_plan')) as Partial<ProbePlan> | null;
    return { ...PROBE_STANDARD, ...(g ?? {}) };
  }

  async speichereProbePlan(e: unknown, von: string): Promise<ProbePlan> {
    const x = (e ?? {}) as Record<string, unknown>;
    const alt = await this.probePlan();
    const uhrzeit = x.uhrzeit === undefined ? alt.uhrzeit : String(x.uhrzeit);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new Fachfehler(422, t('meldungen.sicherung.die-uhrzeit-bitte-als-2'));
    const wochentag = x.wochentag === undefined ? alt.wochentag : Number(x.wochentag);
    if (!Number.isInteger(wochentag) || wochentag < 1 || wochentag > 7)
      throw new Fachfehler(422, t('meldungen.sicherung.wochentag-1-montag-bis'));
    const neu: ProbePlan = { aktiv: x.aktiv === undefined ? alt.aktiv : x.aktiv === true, wochentag, uhrzeit };
    await this.q.einstellungen.schreibe('sicherung_probe_plan', neu);
    log.info('Zeitplan der Probe-Wiederherstellung geändert', { von, ...neu });
    return neu;
  }

  /** Ist mindestens der eingestellte Mindest-Speicherplatz frei? */
  async genugPlatz(): Promise<boolean> {
    try {
      const f = await statfs(this.ordner);
      return f.bavail * f.bsize >= (await this.plan()).mindestFreiGB * GB;
    } catch {
      return true;
    }
  }

  /**
   * Reicht der Platz für die nächste Sicherung voraussichtlich (#1509, #1530)? Geschätzt wird mit der Größe der letzten
   * Sicherung (sonst Dateien und Datenbank heute); danach muss noch der Mindest-Speicherplatz frei bleiben – Ablago und
   * Datenbank liegen meist auf demselben Speicher, eine volle Platte legte auch die Datenbank lahm.
   */
  async platzFuerNaechste(liste?: Eintragsliste[]): Promise<{ reicht: boolean; frei: number | null; geschaetzt: number; mindest: number }> {
    const mindest = (await this.plan()).mindestFreiGB * GB;
    const geschaetzt = await this.geschaetzteGroesse(liste);
    let frei: number | null = null;
    try {
      await mkdir(this.ordner, { recursive: true });
      const f = await statfs(this.ordner);
      frei = f.bavail * f.bsize;
    } catch {
      /* nicht feststellbar: dann nicht verhindern */
    }
    return { reicht: frei === null || frei - geschaetzt >= mindest, frei, geschaetzt, mindest };
  }

  /** Geschätzte Größe der nächsten Sicherung: die letzte vollständige, sonst Dateien und Datenbank heute. */
  async geschaetzteGroesse(liste?: Eintragsliste[]): Promise<number> {
    const letzte = (liste ?? (await this.liste())).find((x) => x.meta)?.bytes;
    if (letzte !== undefined) return letzte;
    let bytes = 0;
    for await (const f of dateienUnter(this.dateiOrdner)) bytes += f.groesse;
    return bytes + (await this.q.daten.groesse().catch(() => 0));
  }

  /**
   * Wurde das Notfallblatt zum aktuellen Schlüssel heruntergeladen (#106)? Seit #815 steht darauf auch der Notfallcode:
   * Ein Blatt aus der Zeit davor (`ohneCode`) und eines, dessen Code benutzt wurde (`codeBenutzt`), gelten nicht mehr
   * als aktuell – dann ist ein neues Blatt fällig.
   */
  async notfallblatt(): Promise<{
    am: string | null;
    von: string | null;
    fingerabdruck: string | null;
    aktuell: boolean;
    ohneCode: boolean;
    codeBenutzt: string | null;
    grund: 'fehlt' | 'schluessel' | 'ohne-code' | 'benutzt' | null;
  }> {
    const n = (await this.q.einstellungen.lies('notfallblatt')) as {
      am: string;
      von: string;
      fingerabdruck: string;
      notfallcode?: boolean;
      codeBenutzt?: string;
    } | null;
    const schluessel = !!n && !!this.q.tresor.fingerabdruck && n.fingerabdruck === this.q.tresor.fingerabdruck;
    const ohneCode = !!n && n.notfallcode !== true;
    const codeBenutzt = n?.codeBenutzt ?? null;
    const aktuell = schluessel && !ohneCode && !codeBenutzt;
    // Warum nicht aktuell? Für den Hinweis in der Werkbank – der Schlüssel zuerst, dann der Notfallcode.
    const grund = aktuell ? null : !n ? 'fehlt' : !schluessel ? 'schluessel' : codeBenutzt ? 'benutzt' : 'ohne-code';
    return { am: n?.am ?? null, von: n?.von ?? null, fingerabdruck: n?.fingerabdruck ?? null, aktuell, ohneCode, codeBenutzt, grund };
  }

  /** Notfallblatt heruntergeladen – mit neuem Notfallcode (#815). */
  async notfallblattErstellt(von: string) {
    await this.q.einstellungen.schreibe('notfallblatt', {
      am: this.jetzt().toISOString(),
      von,
      fingerabdruck: this.q.tresor.fingerabdruck,
      notfallcode: true,
    });
    log.warn('Notfallblatt heruntergeladen', { von, fingerabdruck: this.q.tresor.fingerabdruck });
  }

  /** Der Notfallcode des Blatts wurde benutzt (#815): Das Blatt gilt nicht mehr, ein neues ist Pflicht. */
  async notfallcodeBenutzt() {
    const n = (await this.q.einstellungen.lies('notfallblatt')) as Record<string, unknown> | null;
    if (n) await this.q.einstellungen.schreibe('notfallblatt', { ...n, codeBenutzt: this.jetzt().toISOString() });
  }

  /* ---------- Liste ---------- */

  async liste(): Promise<Eintragsliste[]> {
    let namen: string[];
    try {
      namen = await readdir(this.ordner);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const pruefungen =
      ((await this.q.einstellungen.lies('sicherung_pruefungen')) as Record<string, { am: string; ok: boolean }> | null) ?? {};
    const proben = ((await this.q.einstellungen.lies('sicherung_proben')) as Record<string, Probeergebnis> | null) ?? {};
    const extern = await this.externStaende();
    const erg: Eintragsliste[] = [];
    for (const n of namen.filter((x) => x.endsWith(ENDUNG) && !x.startsWith('.'))) {
      const name = n.slice(0, -ENDUNG.length);
      const s = await stat(join(this.ordner, n)).catch(() => null);
      if (!s) continue;
      let meta: Metadaten | null = null;
      let schlank: SchlankeMetadaten | undefined;
      try {
        const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8')) as unknown;
        if (istSchlank(j)) schlank = j;
        else meta = j as Metadaten;
      } catch {
        /* fehlt oder unlesbar */
      }
      erg.push({
        name,
        meta,
        ...(schlank ? { schlank } : {}),
        bytes: s.size,
        ...(pruefungen[name] ? { pruefung: pruefungen[name] } : {}),
        ...(proben[name] ? { probe: proben[name] } : {}),
        ...(extern[name] ? { extern: extern[name] } : {}),
      });
    }
    const beginn = (x: Eintragsliste) => x.meta?.beginn ?? x.schlank?.beginn ?? x.name;
    return erg.sort((a, b) => beginn(b).localeCompare(beginn(a)));
  }

  /** Pfad der Sicherungsdatei; wirft bei ungültigem Namen (auch für entfernte Sicherungen, #976). */
  pfad(name: string) {
    if (!/^[\w.-]+$/.test(name) || name.startsWith('.'))
      throw new Fachfehler(422, t('meldungen.sicherung.ungueltiger-name-einer-sicherung'));
    return join(this.ordner, `${name}${ENDUNG}`);
  }

  async loesche(name: string, von: string) {
    const p = this.pfad(name);
    if (!(await stat(p).catch(() => null))) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es'));
    // Liegt eine Kopie außer Haus, bleibt die Sicherung als entfernte in der Liste (#976).
    await this.entfernt.merke([name], await this.externStaende());
    await rm(p, { force: true });
    await rm(join(this.ordner, `${name}.json`), { force: true });
    await this.vergissExtern([name]);
    log.warn('Sicherung gelöscht', { name, von });
  }

  /**
   * Eine Sicherung zum Herunterladen (#975): die verschlüsselte Datei unverändert, nie entschlüsselt. Gelesen wird erst
   * beim Ausliefern und nur der verlangte Teil (`oeffne`, Range). Dateiname wie im Ordner (`<name>.dms-sicherung`, mit
   * Datum im Namen) – so findet die Wiederherstellung sie samt Metadaten wieder. ETag ist die SHA-256 aus den
   * Metadaten; fehlen sie, gibt es keinen, und Weiterlesen nach Abbruch beginnt von vorn.
   */
  async datei(name: string): Promise<Abrufbar & { name: string; sha256: string | null }> {
    const p = this.pfad(name);
    const s = await stat(p).catch(() => null);
    if (!s?.isFile()) throw new Fachfehler(404, t('meldungen.sicherung.diese-sicherung-gibt-es'));
    const j = JSON.parse(await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => 'null')) as { sha256?: unknown } | null;
    const sha256 = typeof j?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(j.sha256) ? j.sha256 : null;
    return {
      name,
      dateiname: `${name}${ENDUNG}`,
      groesse: s.size,
      sha256,
      etag: sha256,
      oeffne: ({ start, ende }) => oeffneStrom(p, { start, end: ende }),
    };
  }

  /** Die Metadaten (`<name>.json`) unverändert zum Herunterladen (#975): ohne sie lässt sich die Sicherung nicht einspielen. */
  async metadatenDatei(name: string): Promise<{ inhalt: Buffer; dateiname: string }> {
    this.pfad(name);
    const inhalt = await readFile(join(this.ordner, `${name}.json`)).catch(() => null);
    if (!inhalt) throw new Fachfehler(404, t('meldungen.sicherung.zu-dieser-sicherung-fehlen'));
    return { inhalt, dateiname: `${name}.json` };
  }

  /**
   * „Wozu?“ nachträglich ändern (#1529): steht in den Angaben neben der Sicherung (`<name>.json`) und geht so mit ihr
   * mit – beim Herunterladen, Zurückholen und Wiederherstellen. Leer entfernt den Namen.
   */
  async setzeWozu(name: string, eingabe: unknown, von: string): Promise<string | null> {
    const wozu = bereinigeWozu(eingabe);
    this.pfad(name);
    const datei = join(this.ordner, `${name}.json`);
    const text = await readFile(datei, 'utf8').catch(() => null);
    if (!text) throw new Fachfehler(404, t('meldungen.sicherung.zu-dieser-sicherung-fehlen'));
    const j = JSON.parse(text) as Record<string, unknown>;
    if (wozu) j.wozu = wozu;
    else delete j.wozu;
    const teil = join(this.ordner, `.${name}.json.teil`);
    await writeFile(teil, `${JSON.stringify(j, null, 2)}\n`, { mode: 0o600 });
    await rename(teil, datei);
    log.info('„Wozu?“ einer Sicherung geändert', { name, von, wozu });
    return wozu;
  }

  /** Protokoll (#975): wer welche Sicherung heruntergeladen hat – bei Weiterlesen nach Abbruch mit der Stelle. */
  merkeHerunterladen(name: string, von: string, bereich: { start: number; ende: number } | null, groesse: number) {
    if (!bereich) log.info('Sicherung heruntergeladen', { name, von, bytes: groesse });
    else log.info('Sicherung heruntergeladen (Teil)', { name, von, ab: bereich.start, bis: bereich.ende, bytes: groesse });
  }

  /** Ergebnis einer Prüfung merken (Spalte „Prüfsumme“); auch nach dem Zurückholen (#976). */
  async merkePruefung(name: string, ok: boolean) {
    const alle = ((await this.q.einstellungen.lies('sicherung_pruefungen')) as Record<string, unknown> | null) ?? {};
    await this.q.einstellungen.schreibe('sicherung_pruefungen', { ...alle, [name]: { am: this.jetzt().toISOString(), ok } });
  }

  /** Prüfsummen-Check: Ist die Datei unverändert seit dem Anlegen? */
  pruefe(name: string, von: string): Lauf {
    const p = this.pfad(name);
    const lauf = this.belege('pruefsumme', t('meldungen.sicherung.pruefsumme-von', { name }));
    void (async () => {
      try {
        const metaText = await readFile(join(this.ordner, `${name}.json`), 'utf8').catch(() => null);
        if (!metaText) throw new Error('Die Metadaten-Datei (.json) fehlt – ohne sie lässt sich die Prüfsumme nicht vergleichen.');
        const meta = JSON.parse(metaText) as { sha256: string };
        lauf.schritt = t('meldungen.sicherung.pruefsumme-berechnen');
        lauf.gesamt = (await stat(p)).size;
        const sha = await sha256Von(p, (n) => {
          lauf.bytes = n;
        });
        const ok = sha === meta.sha256;
        await this.merkePruefung(name, ok);
        lauf.ergebnis = { ok };
        if (ok) log.info('Prüfsumme in Ordnung', { name, von });
        else log.error('Prüfsumme weicht ab – die Sicherungsdatei wurde verändert oder ist beschädigt', { name, von });
        lauf.status = 'fertig';
      } catch (e) {
        lauf.status = 'fehler';
        lauf.fehler = (e as Error).message;
      } finally {
        lauf.beendet = this.jetzt().toISOString();
        lauf.schritt = 'Fertig';
      }
    })();
    return lauf;
  }

  /* ---------- Speicherplatz (#104) und Speicherort (#105) ---------- */

  async speicher() {
    let dateienBytes = 0;
    let dateien = 0;
    for await (const f of dateienUnter(this.dateiOrdner)) {
      dateienBytes += f.groesse;
      dateien++;
    }
    const datenbankBytes = await this.q.daten.groesse().catch(() => 0);
    const liste = await this.liste();
    const sicherungenBytes = liste.reduce((s, x) => s + x.bytes, 0);
    let frei: number | null = null;
    let gesamt: number | null = null;
    try {
      await mkdir(this.ordner, { recursive: true });
      const f = await statfs(this.ordner);
      frei = f.bavail * f.bsize;
      gesamt = f.blocks * f.bsize;
    } catch {
      /* nicht feststellbar */
    }
    const plan = await this.plan();
    // Jede Sicherung ist vollständig; Zahl der höchstens aufbewahrten Sicherungen (shared/src/sicherungsplan.ts, #1509).
    const hoch = hochrechnung(plan, plan.nurNeueste && (await this.nurNeuesteMoeglich(liste)), dateienBytes + datenbankBytes);
    const letzte = liste.find((x) => x.meta)?.bytes ?? dateienBytes + datenbankBytes;
    const mindest = plan.mindestFreiGB * GB;
    return {
      dateienBytes,
      dateien,
      datenbankBytes,
      sicherungenBytes,
      anzahl: liste.length,
      frei,
      gesamt,
      hochrechnung: hoch,
      mindestBytes: mindest,
      knapp: frei !== null && (frei < mindest || frei < 2 * letzte),
    };
  }

  /** Probleme mit dem Ordner: kein eigenes Volume, dieselbe Platte wie die Dateien (#105). */
  ort(): { ordner: string; volume: boolean | null; gleichePlatte: boolean | null } {
    const volume = this.q.mountinfo ? null : aufVolume(this.ordner);
    const a = geraetVon(this.ordner, this.q.mountinfo);
    const b = geraetVon(this.dateiWurzel, this.q.mountinfo);
    return { ordner: this.ordner, volume, gleichePlatte: a && b ? a === b : null };
  }
}
