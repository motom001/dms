import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import type { Writable } from 'node:stream';
import { dirname, join, normalize, sep } from 'node:path';
import postgres from 'postgres';
import { migriere, verbinde } from './db';
import { bezeichner, OHNE_INHALT, type Tabelle } from './datenbankabzug';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { ortszeit, type Metadaten, type Sicherung } from './sicherung';
import { liesKopf, liesSicherung, sha256Von, ZWECK } from './sicherungsformat';
import { entschluesseleMit, fingerabdruck, leiteAb, PRUEFWORT, schluesselAusText } from './tresor';

/**
 * Wiederherstellen einer Sicherung (#107) und Probe-Wiederherstellung (#109).
 *
 * Sicher umschalten: Die Datenbank entsteht in einem eigenen, leeren Schema (aus den Migrationen,
 * die die Sicherung kannte), die Dateien in einem Ordner daneben. Erst wenn alles gelesen, geprüft
 * (GCM-Tag, Prüfwort, Anzahl) und auf den heutigen Stand migriert ist, tauscht eine einzige
 * Transaktion die Schemas; danach startet das DMS neu. Bricht etwas vorher ab, bleibt der alte
 * Stand unverändert. Die Probe spielt genauso ein, schaltet aber nie um und räumt danach auf.
 */

const log = protokoll.modul('sicherung');
const STAGING = 'dms_wh_';
const ALT = 'dms_alt_';
/** Altes Schema, wenn vorher keine Sicherung möglich war: bleibt 7 Tage. */
const BEHALTEN = 'dms_alt_behalten_';
const BEHALTEN_TAGE = 7;

export type Schrittstatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'hinweis' | 'ausgelassen';
export interface Schritt { name: string; status: Schrittstatus; info?: string }

export interface Wiederherstellungslauf {
  art: 'wiederherstellung' | 'probe';
  sicherung: string;
  von: string;
  status: 'laeuft' | 'fertig' | 'fehler' | 'neustart';
  schritte: Schritt[];
  bytes: number;
  gesamt: number;
  gestartet: string;
  beendet?: string;
  fehler?: string;
}

/** Was nach dem Neustart als Abschlussmeldung erscheint. */
export interface Abschluss { am: string; sicherung: string; von: string; schritte: Schritt[]; hinweise: string[] }

export interface Abgleich {
  name: string;
  meta: Metadaten;
  /** Versionen damals ↔ heute. */
  vergleich: Array<{ was: string; damals: string; heute: string; urteil: 'gleich' | 'ok' | 'hinweis' | 'fehler'; info?: string }>;
  probleme: string[];
  hinweise: string[];
  /** Ohne Eingabe vom Notfallblatt nicht lesbar (Schlüssel fehlt oder passt nicht). */
  schluesselNoetig: boolean;
}

export interface Laufzeit { dms: string; postgres: string; architektur: string; haushaltId: string; migrationen: string[] }

export interface WiederherstellungsQuellen {
  /** Verbindungs-URL der Datenbank (für eigene Verbindungen ins neue Schema). */
  url: string;
  /** Hauptverbindung (Schema public). */
  sql: postgres.Sql;
  migrationen: string;
  dateiWurzel: string;
  sicherung: Sicherung;
  tresor: { datei: string; fingerabdruck: string | null; alsText(): string | null };
  laufzeit(): Promise<Laufzeit>;
  /** Läuft der Wartungsmodus aktiv (#102)? */
  wartungAktiv(): boolean;
  /** Gibt es schon Benutzer? (Frisches System = nein.) */
  einrichtungNoetig(): Promise<boolean>;
  /** Nach dem Umschalten: neu starten (im Container: Prozess beenden, Docker startet neu). */
  neustart(): void;
  /** Gehört die Sicherung zu einem anderen Mandanten: dessen Id für den Neustart übernehmen (#119). */
  mandantUebernehmen?: (id: string) => Promise<void>;
  /** Einrichtungscode prüfen (frisches System, #119); wirft bei falschem Code. */
  pruefeCode?: (code: unknown) => void;
  anAdmins?: (betreff: string, text: string) => Promise<void>;
  jetzt?: () => Date;
}

/** Spaltenwerte eines Satzes; null = nicht gefunden. */
const istSicherer = (pfad: string) => {
  const n = normalize(pfad);
  return !!pfad && !n.startsWith('..') && !n.startsWith(sep) && !n.includes(`..${sep}`) && !/^[a-zA-Z]:/.test(n);
};

/** Versionen vergleichen: „0.20.0“ < „0.21.0“. */
function vergleicheVersion(a: string, b: string): number {
  const x = a.split(/[.-]/).map((t) => Number.parseInt(t, 10)); const y = b.split(/[.-]/).map((t) => Number.parseInt(t, 10));
  for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

export class Wiederherstellung {
  private lauf: Wiederherstellungslauf | null = null;
  /** Belegt ab dem ersten Prüfen eines Starts – verhindert zwei gleichzeitige Läufe. */
  private belegt = false;
  private jetzt: () => Date;

  constructor(private q: WiederherstellungsQuellen) { this.jetzt = q.jetzt ?? (() => new Date()); }

  aktuellerLauf(): Wiederherstellungslauf | null { return this.lauf ? structuredClone(this.lauf) : null; }
  laeuft() { return this.belegt || this.lauf?.status === 'laeuft' || this.lauf?.status === 'neustart'; }

  /** Belegen (synchron, vor jedem await) – sonst könnten zwei Starts gleichzeitig durchrutschen. */
  private belege() {
    if (this.laeuft() || this.q.sicherung.laeuft()) throw new Fachfehler(409, 'Es läuft bereits eine Sicherung, Prüfung oder Wiederherstellung.');
    this.belegt = true;
  }

  /** Wer darf? Frisches System: jeder (wie die Ersteinrichtung). Laufendes System: Admin im aktiven Wartungsmodus. */
  async pruefeZugang(admin: boolean, einrichtungscode?: unknown) {
    if (await this.q.einrichtungNoetig()) {
      // Frisches System (#119): nur mit dem Einrichtungscode.
      this.q.pruefeCode?.(einrichtungscode);
      return 'frisch' as const;
    }
    if (!admin) throw new Fachfehler(403, 'Dafür sind Administratorrechte nötig.');
    if (!this.q.wartungAktiv()) throw new Fachfehler(409, 'Wiederherstellen geht nur im aktiven Wartungsmodus – schalte ihn unter Werkbank → Wartungsmodus ein und melde alle ab.');
    return 'laufend' as const;
  }

  /* ---------- Abgleich ---------- */

  async abgleich(name: string, schluesselText?: string): Promise<Abgleich> {
    const eintrag = (await this.q.sicherung.liste()).find((x) => x.name === name);
    if (!eintrag) throw new Fachfehler(404, 'Diese Sicherung gibt es im Sicherungsordner nicht (mehr). „Neu prüfen“ liest den Ordner neu.');
    if (!eintrag.meta) throw new Fachfehler(422, 'Zu dieser Sicherung fehlt die Metadaten-Datei (.json). Lege sie mit in den Sicherungsordner.');
    const m = eintrag.meta;
    const heute = await this.q.laufzeit();
    const probleme: string[] = []; const hinweise: string[] = [];
    // Die .json liegt unverschlüsselt daneben: was in Pfade einfließt, streng prüfen.
    if (m.datei !== `${name}.dms-sicherung` || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.haushaltId ?? '') || !Array.isArray(m.migrationen) || m.migrationen.some((x) => !/^[\w.-]+\.sql$/.test(String(x)))) {
      throw new Fachfehler(422, 'Die Metadaten-Datei (.json) dieser Sicherung ist ungültig oder verändert.');
    }
    const vergleich: Abgleich['vergleich'] = [];

    const unbekannt = m.migrationen.filter((x) => !heute.migrationen.includes(x));
    const dms = vergleicheVersion(m.umgebung.dms, heute.dms);
    if (unbekannt.length) {
      probleme.push(`Die Sicherung stammt von einem neueren DMS (${m.umgebung.dms}, Datenbank-Stand ${m.umgebung.datenbankStand}). Dieses DMS (${heute.dms}) kennt ${unbekannt.length === 1 ? 'eine Änderung' : `${unbekannt.length} Änderungen`} der Datenbank nicht. Aktualisiere zuerst das DMS.`);
    }
    vergleich.push({ was: 'DMS', damals: m.umgebung.dms, heute: heute.dms, urteil: unbekannt.length ? 'fehler' : dms === 0 ? 'gleich' : 'ok', info: !unbekannt.length && dms < 0 ? 'älter – wird nach dem Einspielen auf den heutigen Stand gebracht' : undefined });
    const fehlende = heute.migrationen.filter((x) => !m.migrationen.includes(x)).length;
    vergleich.push({ was: 'Datenbank-Stand', damals: m.umgebung.datenbankStand ?? '–', heute: heute.migrationen.at(-1) ?? '–', urteil: unbekannt.length ? 'fehler' : fehlende ? 'ok' : 'gleich', info: fehlende && !unbekannt.length ? `${fehlende} ${fehlende === 1 ? 'Änderung läuft' : 'Änderungen laufen'} danach` : undefined });
    const pgDamals = m.umgebung.postgres.split('.')[0]; const pgHeute = heute.postgres.split('.')[0];
    vergleich.push({ was: 'PostgreSQL', damals: m.umgebung.postgres, heute: heute.postgres, urteil: pgDamals === pgHeute ? 'gleich' : 'ok', info: pgDamals !== pgHeute ? 'andere Hauptversion – geht, die Daten werden neu eingelesen' : undefined });
    vergleich.push({ was: 'Architektur', damals: m.umgebung.architektur, heute: heute.architektur, urteil: m.umgebung.architektur === heute.architektur ? 'gleich' : 'ok' });
    vergleich.push({ was: 'Mandanten-Id', damals: m.haushaltId, heute: heute.haushaltId, urteil: m.haushaltId === heute.haushaltId ? 'gleich' : 'hinweis', info: m.haushaltId !== heute.haushaltId ? 'abweichend – siehe Hinweis' : undefined });
    if (m.haushaltId !== heute.haushaltId) {
      hinweise.push(this.q.mandantUebernehmen
        ? `Die Sicherung gehört zum Mandanten ${m.haushaltId}, dieses DMS ist bisher auf ${heute.haushaltId} eingestellt. Das DMS übernimmt die Id der Sicherung beim Wiederherstellen.`
        : `Die Sicherung gehört zum Mandanten ${m.haushaltId}, dieses DMS ist auf ${heute.haushaltId} eingestellt – sonst sind die Daten nicht zu sehen.`);
    }

    let schluesselNoetig = this.q.tresor.fingerabdruck !== m.verschluesselung.fingerabdruck;
    if (schluesselText !== undefined && schluesselText.trim()) {
      const k = schluesselAusText(schluesselText);
      if (!k) probleme.push('Der eingegebene Schlüssel hat nicht die richtige Form: 43 Zeichen aus A–Z, a–z, 0–9, - und _ (Leerzeichen zählen nicht).');
      else if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck) probleme.push(`Der eingegebene Schlüssel hat den Fingerabdruck ${fingerabdruck(k)}; die Sicherung braucht ${m.verschluesselung.fingerabdruck}. Nimm das Notfallblatt zu dieser Sicherung.`);
      else schluesselNoetig = false;
    }
    if (schluesselNoetig) hinweise.push(`Der Schlüssel dieses DMS passt nicht zur Sicherung (Fingerabdruck ${m.verschluesselung.fingerabdruck}). Gib den Schlüssel vom Notfallblatt ein.`);
    try {
      const { kopf } = await liesKopf(join(this.q.sicherung.ordner, m.datei));
      if (kopf.fingerabdruck !== m.verschluesselung.fingerabdruck) probleme.push('Sicherungsdatei und Metadaten passen nicht zusammen (verschiedene Schlüssel).');
    } catch (e) { probleme.push((e as Error).message); }
    return { name, meta: m, vergleich, probleme, hinweise, schluesselNoetig };
  }

  private schluessel(m: Metadaten, schluesselText?: string): Buffer {
    const eigen = this.q.tresor.alsText();
    const text = schluesselText?.trim() ? schluesselText : this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? eigen : null;
    const k = text ? schluesselAusText(text) : null;
    if (!k) throw new Fachfehler(422, 'Bitte den Schlüssel vom Notfallblatt eingeben.');
    if (fingerabdruck(k) !== m.verschluesselung.fingerabdruck) throw new Fachfehler(422, `Der Schlüssel passt nicht zur Sicherung (erwartet ${m.verschluesselung.fingerabdruck}).`);
    return k;
  }

  /* ---------- Starten ---------- */

  async starte(e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown }, admin: { email: string } | null, einrichtungscode?: unknown): Promise<Wiederherstellungslauf> {
    const art = await this.pruefeZugang(!!admin, einrichtungscode);
    this.belege();
    try { return await this.starteBelegt(e, admin, art); } catch (x) { this.belegt = false; throw x; }
  }

  private async starteBelegt(e: { name?: unknown; schluessel?: unknown; bestaetigt?: unknown }, admin: { email: string } | null, art: 'frisch' | 'laufend'): Promise<Wiederherstellungslauf> {
    const name = String(e.name ?? '');
    const text = typeof e.schluessel === 'string' ? e.schluessel : undefined;
    const a = await this.abgleich(name, text);
    if (a.probleme.length) throw new Fachfehler(422, a.probleme.join(' '));
    if (art === 'laufend' && e.bestaetigt !== true) throw new Fachfehler(422, 'Bitte bestätigen, dass der jetzige Stand ersetzt wird.');
    const k = this.schluessel(a.meta, text);
    await this.pruefePlatz(a.meta);
    const von = admin?.email ?? 'Einrichtung (frisches System)';
    const lauf = this.neuerLauf('wiederherstellung', name, von, [
      ...(art === 'laufend' ? ['Sicherung des jetzigen Stands'] : []),
      'Prüfsumme der Datei', 'Entschlüsseln und Einspielen', 'Prüfwort', 'Anzahl Mappen, Dokumente, Benutzer', 'Auf den heutigen Stand bringen', 'Dateien übernehmen', 'Schlüsseldatei', 'Umschalten', 'Neustart',
    ]);
    log.warn('Wiederherstellung begonnen', { sicherung: name, von, art });
    void this.fuehreAus(lauf, a, k, art).catch(() => {}).finally(() => { this.belegt = false; });
    return this.aktuellerLauf()!;
  }

  /** Probe (#109): wie eine Wiederherstellung, aber ohne Umschalten; danach aufräumen. */
  async starteProbe(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    this.belege();
    try { return await this.starteProbeBelegt(name, von); } catch (x) { this.belegt = false; throw x; }
  }

  private async starteProbeBelegt(name: string | null, von: string): Promise<{ lauf: Wiederherstellungslauf; fertig: Promise<boolean> }> {
    const liste = (await this.q.sicherung.liste()).filter((x) => x.meta);
    const ziel = name ? liste.find((x) => x.name === name) : liste[0];
    if (!ziel) throw new Fachfehler(404, name ? 'Diese Sicherung gibt es nicht (mehr).' : 'Es gibt noch keine Sicherung zum Prüfen.');
    const m = ziel.meta!;
    const k = this.q.tresor.fingerabdruck === m.verschluesselung.fingerabdruck ? schluesselAusText(this.q.tresor.alsText() ?? '') : null;
    const lauf = this.neuerLauf('probe', ziel.name, von, ['Prüfsumme der Datei', 'Entschlüsseln und Einspielen', 'Prüfwort', 'Anzahl Mappen, Dokumente, Benutzer', 'Auf den heutigen Stand bringen', 'Aufräumen']);
    log.info('Probe-Wiederherstellung begonnen', { sicherung: ziel.name, von });
    const fertig = (async () => {
      if (!k) {
        this.fehlschlag(lauf, 'Prüfsumme der Datei', `Die Sicherung braucht den Schlüssel ${m.verschluesselung.fingerabdruck}; dieses DMS hat ${this.q.tresor.fingerabdruck ?? 'keinen'}.`);
        await this.merkeProbe(ziel.name, false, lauf.fehler!);
        return false;
      }
      const a: Abgleich = { name: ziel.name, meta: m, vergleich: [], probleme: [], hinweise: [], schluesselNoetig: false };
      return this.fuehreAus(lauf, a, k, 'probe');
    })().finally(() => { this.belegt = false; });
    return { lauf: this.aktuellerLauf()!, fertig };
  }

  private neuerLauf(art: Wiederherstellungslauf['art'], sicherung: string, von: string, schritte: string[]): Wiederherstellungslauf {
    this.lauf = { art, sicherung, von, status: 'laeuft', schritte: schritte.map((name) => ({ name, status: 'offen' })), bytes: 0, gesamt: 0, gestartet: this.jetzt().toISOString() };
    return this.lauf;
  }

  private schritt(lauf: Wiederherstellungslauf, name: string, status: Schrittstatus, info?: string) {
    const s = lauf.schritte.find((x) => x.name === name);
    if (s) { s.status = status; if (info !== undefined) s.info = info; }
  }

  private fehlschlag(lauf: Wiederherstellungslauf, aktuell: string | null, grund: string) {
    if (aktuell) this.schritt(lauf, aktuell, 'fehler', grund);
    for (const s of lauf.schritte) if (s.status === 'offen' || s.status === 'laeuft') s.status = s.status === 'laeuft' ? 'fehler' : 'ausgelassen';
    lauf.status = 'fehler'; lauf.fehler = grund; lauf.beendet = this.jetzt().toISOString();
  }

  private async pruefePlatz(m: Metadaten) {
    try {
      const f = await statfs(this.q.dateiWurzel);
      const frei = f.bavail * f.bsize;
      if (frei < m.groessen.dateienBytes * 1.05 + 50 * 1024 * 1024) {
        throw new Fachfehler(507, `Zu wenig Platz für die Dateien der Sicherung: ${(frei / 1024 ** 3).toFixed(1).replace('.', ',')} GB frei, gebraucht etwa ${(m.groessen.dateienBytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB.`);
      }
    } catch (e) { if (e instanceof Fachfehler) throw e; }
  }

  /** Der eigentliche Ablauf. Bei Probe: nie umschalten, immer aufräumen. */
  private async fuehreAus(lauf: Wiederherstellungslauf, a: Abgleich, k: Buffer, art: 'frisch' | 'laufend' | 'probe'): Promise<boolean> {
    const m = a.meta;
    const stempel = `${this.jetzt().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
    const schema = `${STAGING}${stempel}`;
    const staging = join(this.q.dateiWurzel, `.wiederherstellung-${stempel}`);
    const probe = art === 'probe';
    let neu: postgres.Sql | null = null;
    let w: Writable | null = null;
    let schluesselZurueck: (() => Promise<void>) | null = null;
    let behalten = false;
    let aktuell: string | null = null;
    const schritt = (name: string) => { aktuell = name; this.schritt(lauf, name, 'laeuft'); };
    const ok = (info?: string) => { if (aktuell) this.schritt(lauf, aktuell, 'ok', info); };
    try {
      if (art === 'laufend' && !this.q.tresor.alsText()) {
        // Ohne (passenden) Schlüssel lässt sich der jetzige Stand nicht sichern – z. B. wenn er verloren ist.
        // Dann bleibt das alte Schema nach dem Umschalten noch eine Weile in der Datenbank.
        behalten = true;
        this.schritt(lauf, 'Sicherung des jetzigen Stands', 'hinweis', `nicht möglich: Dieses DMS hat keinen passenden Schlüssel. Der bisherige Stand bleibt ${BEHALTEN_TAGE} Tage in der Datenbank.`);
      } else if (art === 'laufend') {
        schritt('Sicherung des jetzigen Stands');
        const { fertig } = await this.q.sicherung.starte('vor-wiederherstellung', lauf.von);
        const vorher = await fertig;
        if (!vorher) throw new Error(`Die Sicherung des jetzigen Stands ist fehlgeschlagen: ${this.q.sicherung.aktuellerLauf()?.fehler ?? 'unbekannt'}. Ohne sie wird nichts ersetzt.`);
        ok(vorher.datei);
      }

      schritt('Prüfsumme der Datei');
      const pfad = join(this.q.sicherung.ordner, m.datei);
      lauf.gesamt = (await stat(pfad)).size;
      const sha = await sha256Von(pfad, (n) => { lauf.bytes = n; });
      if (sha !== m.sha256) throw new Error('Die Prüfsumme der Sicherungsdatei stimmt nicht mit den Metadaten überein – die Datei ist verändert oder beschädigt.');
      ok('unverändert');

      schritt('Entschlüsseln und Einspielen');
      await this.q.sql.unsafe(`CREATE SCHEMA ${bezeichner(schema)}`);
      neu = postgres(this.q.url, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
      await neu.unsafe(`SET search_path TO ${bezeichner(schema)}`);
      // Schema auf den Stand der Sicherung bringen: genau ihre Migrationen.
      await neu.begin(async (tx) => {
        await tx`CREATE TABLE schema_migrationen (name text PRIMARY KEY, ausgefuehrt timestamptz NOT NULL DEFAULT now())`;
        for (const datei of m.migrationen) {
          await tx.unsafe(await readFile(join(this.q.migrationen, datei), 'utf8'));
          await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
        }
      });
      // Was die Migrationen selbst angelegt haben (z. B. den Mandanten), kommt aus der Sicherung.
      const leeren = (await neu`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> 'schema_migrationen'`).map((r) => bezeichner(r.tablename as string));
      if (leeren.length) await neu.unsafe(`TRUNCATE ${leeren.join(', ')} CASCADE`);
      if (!probe) await mkdir(staging, { recursive: true });
      let tabellen = 0; let dateien = 0; let stichprobe = 0; let iDatei = 0; let endeTabellen: number | null = null;
      const jede = Math.max(1, Math.ceil(m.anzahl.dateien / 20));
      let zaehlerSicherung: Record<string, number> | null = null;
      lauf.bytes = 0;
      for await (const e of liesSicherung(pfad, leiteAb(k, ZWECK), (n) => { lauf.bytes = n; })) {
        if (e.art === 'M') {
          if (e.kopf.haushaltId !== m.haushaltId) throw new Error('Inhalt und Metadaten der Sicherung passen nicht zusammen (Mandant).');
          zaehlerSicherung = (e.kopf.zaehler as Record<string, number>) ?? null;
        } else if (e.art === 'T') {
          const t = { name: String(e.kopf.tabelle), spalten: (e.kopf.spalten as string[]).map(String) } as Tabelle;
          if (OHNE_INHALT.has(t.name)) { for await (const _ of e.daten) { /* übergehen */ } continue; }
          this.schritt(lauf, 'Entschlüsseln und Einspielen', 'laeuft', `Tabelle ${t.name}`);
          w = await neu.unsafe(`COPY ${bezeichner(schema)}.${bezeichner(t.name)} (${t.spalten.map(bezeichner).join(', ')}) FROM STDIN`).writable();
          for await (const c of e.daten) if (!w.write(c)) await once(w, 'drain');
          w.end();
          await once(w, 'finish');
          w = null;
          tabellen++;
        } else if (e.art === 'D') {
          const rel = String(e.kopf.pfad);
          if (!istSicherer(rel)) throw new Error(`Ungültiger Dateipfad in der Sicherung: ${rel}`);
          const pruefen = iDatei++ % jede === 0;
          const name = rel.split('/').pop()!;
          const h = pruefen && /^[0-9a-f]{64}$/.test(name) ? createHash('sha256') : null;
          // Streamen statt puffern: auch große Dokumente brauchen kaum Arbeitsspeicher.
          let ausgabe: Writable | null = null;
          if (!probe) {
            const ziel = join(staging, m.haushaltId, ...rel.split('/'));
            await mkdir(dirname(ziel), { recursive: true });
            ausgabe = createWriteStream(ziel, { flags: 'wx', flush: true });
            w = ausgabe;
          }
          for await (const c of e.daten) {
            h?.update(c);
            if (ausgabe && !ausgabe.write(c)) await once(ausgabe, 'drain');
          }
          if (ausgabe) { ausgabe.end(); await once(ausgabe, 'close'); w = null; }
          if (h) {
            if (h.digest('hex') !== name) throw new Error(`Die Datei ${rel} in der Sicherung ist beschädigt (Prüfwert stimmt nicht).`);
            stichprobe++;
          }
          dateien++;
        } else if (e.art === 'E') {
          endeTabellen = Number(e.kopf.tabellen);
        }
      }
      // Erst hier ist der GCM-Prüfwert geprüft: Die Datei ist echt und vollständig.
      if (endeTabellen === null || tabellen !== endeTabellen || tabellen !== m.anzahl.tabellen) throw new Error(`Die Sicherung ist unvollständig: ${tabellen} Tabellen eingespielt, erwartet ${m.anzahl.tabellen}.`);
      ok(`${tabellen} Tabellen, ${dateien} Dateien${stichprobe ? `, Prüfwerte von ${stichprobe} Dateien nachgerechnet` : ''}`);
      // Zähler der Sequenzen nachziehen.
      for (const r of await neu`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_default LIKE 'nextval(%'`) {
        const t = `${bezeichner(schema)}.${bezeichner(r.table_name as string)}`;
        await neu.unsafe(`SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${String(r.column_name).replace(/'/g, "''")}'), coalesce((SELECT max(${bezeichner(r.column_name as string)}) FROM ${t}), 0) + 1, false)`);
      }

      schritt('Prüfwort');
      const [pw] = await neu`SELECT wert FROM einstellungen WHERE schluessel = 'pruefwort' LIMIT 1`;
      if (!pw) this.schritt(lauf, 'Prüfwort', 'hinweis', 'Die Sicherung enthält noch kein Prüfwort (älter als 0.20).');
      else if (entschluesseleMit(k, String(pw.wert)) !== PRUEFWORT) throw new Error('Das Prüfwort lässt sich mit diesem Schlüssel nicht lesen – der Schlüssel passt nicht zu den Daten.');
      else ok('mit dem Schlüssel lesbar');

      schritt('Anzahl Mappen, Dokumente, Benutzer');
      const n = async (t: string) => Number((await neu!.unsafe(`SELECT count(*)::int AS n FROM ${bezeichner(schema)}.${bezeichner(t)}`))[0].n);
      const ist = { mappen: await n('mappen'), dokumente: await n('dokumente'), benutzer: await n('benutzer') };
      const soll = zaehlerSicherung ?? m.anzahl;
      const abw = (['mappen', 'dokumente', 'benutzer'] as const).filter((x) => ist[x] !== Number(soll[x]));
      if (abw.length) throw new Error(`Die Anzahl stimmt nicht: ${abw.map((x) => `${x} ${ist[x]} statt ${soll[x]}`).join(', ')}.`);
      if (m.anzahl.dateien !== dateien) throw new Error(`Die Anzahl der Dateien stimmt nicht: ${dateien} statt ${m.anzahl.dateien}.`);
      ok(`${ist.mappen} Mappen, ${ist.dokumente} Dokumente, ${ist.benutzer} Benutzer`);

      schritt('Auf den heutigen Stand bringen');
      const vorher = m.migrationen.length;
      await migriere(neu, this.q.migrationen, () => {});
      const nachher = Number((await neu`SELECT count(*)::int AS n FROM schema_migrationen`)[0].n);
      ok(nachher > vorher ? `${nachher - vorher} Änderungen ausgeführt` : 'schon aktuell');

      if (probe) {
        schritt('Aufräumen');
        await neu.end(); neu = null;
        await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(schema)} CASCADE`);
        ok();
        lauf.status = 'fertig'; lauf.beendet = this.jetzt().toISOString();
        await this.merkeProbe(lauf.sicherung, true, lauf.schritte.map((s) => `${s.name}: ${s.info ?? s.status}`).join('; '));
        log.info('Probe-Wiederherstellung erfolgreich', { sicherung: lauf.sicherung, mappen: ist.mappen, dateien });
        return true;
      }

      // Abschlussmeldung und Ende des Wartungsmodus stehen schon in der neuen Datenbank.
      const hinweise = [...a.hinweise.filter((h) => !/Notfallblatt ein/.test(h))];
      const abschluss: Abschluss = { am: this.jetzt().toISOString(), sicherung: lauf.sicherung, von: lauf.von, schritte: [], hinweise };
      const setze = async (k2: string, w: unknown) => {
        await neu!`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${m.haushaltId}, ${k2}, ${neu!.json(w as postgres.JSONValue)})
          ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
      };
      await neu`DELETE FROM einstellungen WHERE schluessel = 'wartung'`;

      schritt('Dateien übernehmen');
      let uebernommen = 0;
      for (const d of await readdir(staging, { recursive: true, withFileTypes: true })) {
        if (!d.isFile()) continue;
        const quelle = join(d.parentPath ?? (d as unknown as { path: string }).path, d.name);
        const ziel = join(this.q.dateiWurzel, quelle.slice(staging.length + 1));
        if (await stat(ziel).then(() => true, () => false)) continue; // gleicher Prüfwert = gleicher Inhalt
        await mkdir(dirname(ziel), { recursive: true });
        await rename(quelle, ziel);
        uebernommen++;
      }
      await rm(staging, { recursive: true, force: true });
      ok(`${uebernommen} neu, ${dateien - uebernommen} schon vorhanden`);

      // Die Schlüsseldatei erst ganz zum Schluss – und bei jedem späteren Fehler wieder zurück.
      schritt('Schlüsseldatei');
      const datei = this.q.tresor.datei;
      const schluesselText = k.toString('base64url');
      const vorhanden = await readFile(datei, 'utf8').then((t) => t.trim(), () => null);
      if (vorhanden !== schluesselText) {
        const alteDatei = vorhanden !== null ? `${datei}.alt-${stempel}` : null;
        if (alteDatei) await rename(datei, alteDatei);
        schluesselZurueck = async () => { await rm(datei, { force: true }); if (alteDatei) await rename(alteDatei, datei); };
        await mkdir(dirname(datei), { recursive: true, mode: 0o700 });
        await writeFile(datei, `${schluesselText}\n`, { mode: 0o600, flag: 'wx' });
        ok(alteDatei ? `ersetzt; die bisherige liegt daneben (${alteDatei.split('/').pop()})` : 'angelegt');
      } else ok('passt schon');

      schritt('Umschalten');
      const altSchema = `${behalten ? BEHALTEN : ALT}${stempel}`;
      if (behalten) abschluss.hinweise.push(`Der bisherige Stand liegt noch ${BEHALTEN_TAGE} Tage als Schema ${altSchema} in der Datenbank (es gab vorher keine Sicherung).`);
      abschluss.schritte = lauf.schritte.map((s) => ({ ...s, ...(s.name === 'Umschalten' ? { status: 'ok' as const } : {}) }));
      await setze('wiederherstellung_abschluss', abschluss);
      await neu.end(); neu = null;
      await this.q.sql.begin(async (tx) => {
        await tx.unsafe(`ALTER SCHEMA public RENAME TO ${bezeichner(altSchema)}`);
        await tx.unsafe(`ALTER SCHEMA ${bezeichner(schema)} RENAME TO public`);
      });
      schluesselZurueck = null;
      // Anderer Mandant (#119): seine Id gilt ab dem Neustart.
      if (this.q.mandantUebernehmen && m.haushaltId !== (await this.q.laufzeit()).haushaltId) {
        await this.q.mandantUebernehmen(m.haushaltId);
        log.warn('Mandant der Sicherung übernommen', { mandant: m.haushaltId });
      }
      ok();
      this.schritt(lauf, 'Neustart', 'laeuft', 'Das DMS startet neu …');
      lauf.status = 'neustart';
      log.warn('Wiederherstellung abgeschlossen, DMS startet neu', { sicherung: lauf.sicherung, von: lauf.von, mappen: ist.mappen, dateien });
      setTimeout(() => this.q.neustart(), 1500).unref?.();
      return true;
    } catch (e) {
      const grund = (e as Error).message;
      log.error(probe ? 'Probe-Wiederherstellung fehlgeschlagen' : 'Wiederherstellung abgebrochen – der bisherige Stand ist unverändert', { sicherung: lauf.sicherung, schritt: aktuell, grund });
      // Erst aufräumen, dann „fehlgeschlagen“ melden: Wer auf das Ende wartet, sieht den alten Stand.
      w?.destroy(e as Error);
      await neu?.end({ timeout: 5 }).catch(() => {});
      if (schluesselZurueck) await schluesselZurueck().catch((x) => log.error('Bisherige Schlüsseldatei nicht zurückgelegt', { fehler: (x as Error).message }));
      await this.q.sql.unsafe(`DROP SCHEMA IF EXISTS ${bezeichner(schema)} CASCADE`).catch((x) => log.warn("Bereich der Wiederherstellung nicht entfernt", { schema, fehler: (x as Error).message }));
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      if (probe) await this.merkeProbe(lauf.sicherung, false, grund);
      this.fehlschlag(lauf, aktuell, grund);
      return false;
    }
  }

  /* ---------- Probe (#109): Ergebnisse, Zeitplan, Ampel ---------- */

  private async merkeProbe(name: string, ok: boolean, info: string) {
    const e = this.q.sicherung.einstellungen;
    const alle = ((await e.lies('sicherung_proben')) as Record<string, unknown> | null) ?? {};
    const eintrag = { am: this.jetzt().toISOString(), ok, info: info.slice(0, 1000) };
    await e.schreibe('sicherung_proben', { ...alle, [name]: eintrag });
    await e.schreibe('sicherung_probe_letzte', { name, ...eintrag });
    if (!ok) {
      const vorfall = `probe:${eintrag.am}`;
      if ((await e.lies('sicherung_probe_gemeldet')) !== vorfall) {
        await e.schreibe('sicherung_probe_gemeldet', vorfall);
        try { await this.q.anAdmins?.('DMS: Probe-Wiederherstellung fehlgeschlagen', `Die probeweise Wiederherstellung der Sicherung ${name} ist fehlgeschlagen:\n\n${info}\n\nIm Ernstfall ließe sich diese Sicherung womöglich nicht einspielen. Details stehen in der Werkbank unter „Sicherung“.`); }
        catch (x) { log.warn('Mail zur Probe nicht verschickt', { fehler: (x as Error).message }); }
      }
    }
  }

  /** Jede Minute: fällige Probe starten (Standard sonntags 04:00). */
  async tick(): Promise<'gestartet' | 'nichts'> {
    const plan = await this.q.sicherung.probePlan();
    if (!plan.aktiv || this.q.wartungAktiv() || this.laeuft() || this.q.sicherung.laeuft()) return 'nichts';
    const o = ortszeit(this.jetzt());
    if (o.wochentag !== plan.wochentag || o.uhr < plan.uhrzeit) return 'nichts';
    const e = this.q.sicherung.einstellungen;
    if ((await e.lies('sicherung_probe_zuletzt')) === o.datum) return 'nichts';
    await e.schreibe('sicherung_probe_zuletzt', o.datum);
    if (!(await this.q.sicherung.liste()).some((x) => x.meta)) return 'nichts';
    if (!(await this.q.sicherung.genugPlatz())) { log.warn('Probe-Wiederherstellung nicht begonnen: zu wenig freier Speicherplatz'); return 'nichts'; }
    try { await this.starteProbe(null, 'Zeitplan'); return 'gestartet'; } catch (x) { log.warn('Probe-Wiederherstellung nicht begonnen', { grund: (x as Error).message }); return 'nichts'; }
  }

  /** Nach einem Neustart: Reste abgebrochener Läufe und das alte Schema entfernen. */
  async raeumeAuf() {
    for (const r of await this.q.sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE ${`${STAGING}%`} OR nspname LIKE ${`${ALT}%`}`) {
      const name = r.nspname as string;
      if (name.startsWith(BEHALTEN)) {
        // Ohne vorherige Sicherung: 7 Tage aufheben (Zeitstempel JJJJMMTTHHMMSS im Namen).
        const z = /^(\d{4})(\d{2})(\d{2})/.exec(name.slice(BEHALTEN.length));
        const alter = z ? this.jetzt().getTime() - Date.UTC(Number(z[1]), Number(z[2]) - 1, Number(z[3])) : Infinity;
        if (alter < BEHALTEN_TAGE * 24 * 3600 * 1000) continue;
      }
      await this.q.sql.unsafe(`DROP SCHEMA ${bezeichner(r.nspname as string)} CASCADE`).catch((e) => log.warn('Altes Schema nicht entfernt', { schema: r.nspname, fehler: (e as Error).message }));
      log.info('Bereich einer früheren Wiederherstellung entfernt', { schema: r.nspname });
    }
    for (const n of await readdir(this.q.dateiWurzel).catch(() => [] as string[])) {
      if (n.startsWith('.wiederherstellung-')) await rm(join(this.q.dateiWurzel, n), { recursive: true, force: true });
    }
  }
}

/** Neue Verbindung mit gleicher URL (für Tests). */
export const neueVerbindung = (url: string) => verbinde(url);
