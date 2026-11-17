/**
 * Wiederherstellung, Einspielen (#1278, Schritt 6b-2; vorher Teil von `fuehreAus`): Stand eines Laufs, Schema der
 * Sicherung anlegen, Tabellen und Dateien aus der entschlüsselten Sicherung einspielen, Fassungen abgleichen, Zähler
 * der Sequenzen und Statistik nachziehen.
 */
import { createHash, type Hash } from 'node:crypto';
import { join, dirname } from 'node:path';
import postgres from 'postgres';
import type { Writable } from 'node:stream';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import {
  type Wiederherstellungslauf,
  type Abgleich,
  type Schrittstatus,
  type WiederherstellungsQuellen,
  istSicherer,
  log,
} from './wiederherstellung-hilfen';
import type { Metadaten } from './sicherung';
import { t } from '../sprache/sprache';
import { liesSicherung, ZWECK, type Gelesen } from './sicherungsformat';
import { bezeichner, type Tabelle, OHNE_INHALT } from './datenbankabzug';
import { leiteAb } from '../geheimnisse/tresor';
import { FASSUNG_PFAD } from '../dateien/dateiumwandlung';
import { ARCHIV_PFAD } from '../dateien/archivfassung';
import { STATISTIK_SPALTEN } from '../repo/pg';

/** Stand eines Laufs: was alle Schritte brauchen und was beim Abbruch aufzuräumen ist. */
export interface WhStand {
  q: WiederherstellungsQuellen;
  lauf: Wiederherstellungslauf;
  a: Abgleich;
  m: Metadaten;
  probe: boolean;
  stempel: string;
  /** Schema der Sicherung, bis zum Umschalten. */
  schema: string;
  /** Ordner der Dateien, bis zum Übernehmen. */
  staging: string;
  /** Verbindung ins neue Schema. */
  neu: postgres.Sql | null;
  /** Offener Strom (COPY oder Datei), beim Abbruch zu schließen. */
  w: Writable | null;
  schluesselZurueck: (() => Promise<void>) | null;
  /** Das alte Schema bleibt nach dem Umschalten eine Weile (ohne Sicherung des jetzigen Stands). */
  behalten: boolean;
  /** Name des laufenden Schritts. */
  aktuell: string | null;
  /** Schritt beginnen (läuft). */
  schritt(name: string): void;
  /** Den laufenden Schritt als erledigt melden. */
  ok(info?: string): void;
  /** Einen Schritt mit Status und Info melden (ohne ihn zum laufenden zu machen). */
  melde(name: string, status: Schrittstatus, info?: string): void;
}

/** Zählung beim Einspielen. */
export interface Eingespielt {
  tabellen: number;
  dateien: number;
  stichprobe: number;
  iDatei: number;
  endeTabellen: number | null;
  dateienEnde: number | null;
  /** Ohne Anzahl (schlanke Metadaten, #585) jede Datei prüfen. */
  jede: number;
  zaehlerSicherung: Record<string, number> | null;
  // Umgewandelte Fassungen (#577, seit 0.140.1 in der Sicherung): Prüfwert des Inhalts und der in den Angaben.
  fassungIst: Map<string, string>;
  fassungSoll: Map<string, string>;
  // Archivfassungen (#631): ebenso; Angaben „imOriginal“ (das Original ist schon PDF/A) haben keinen eigenen Inhalt.
  archivIst: Map<string, string>;
  archivSoll: Map<string, string>;
  archivOriginal: Set<string>;
}

/** Schema anlegen, auf den Stand der Sicherung bringen (genau ihre Migrationen) und leeren; Ordner für die Dateien. */
export async function legeSchemaAn(st: WhStand) {
  const { q, m, schema } = st;
  await q.sql.unsafe(`CREATE SCHEMA ${bezeichner(schema)}`);
  st.neu = postgres(q.url, { max: 1, onnotice: () => {}, infer: true, connection: { search_path: schema } });
  const neu = st.neu;
  await neu.unsafe(`SET search_path TO ${bezeichner(schema)}`);
  // Schema auf den Stand der Sicherung bringen: genau ihre Migrationen.
  await neu.begin(async (tx) => {
    await tx`CREATE TABLE schema_migrationen (name text PRIMARY KEY, ausgefuehrt timestamptz NOT NULL DEFAULT now())`;
    for (const datei of m.migrationen) {
      await tx.unsafe(await readFile(join(q.migrationen, datei), 'utf8'));
      await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
    }
  });
  // Was die Migrationen selbst angelegt haben (z. B. den Mandanten), kommt aus der Sicherung.
  const leeren = (await neu`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} AND tablename <> 'schema_migrationen'`).map((r) =>
    bezeichner(r.tablename as string),
  );
  if (leeren.length) await neu.unsafe(`TRUNCATE ${leeren.join(', ')} CASCADE`);
  if (!st.probe) await mkdir(st.staging, { recursive: true });
}

/** Eine Tabelle per COPY ins neue Schema; Tabellen ohne Inhalt übergehen. */
async function spieleTabelle(st: WhStand, e: Gelesen, z: Eingespielt) {
  const tabelle2 = { name: String(e.kopf.tabelle), spalten: (e.kopf.spalten as string[]).map(String) } as Tabelle;
  if (OHNE_INHALT.has(tabelle2.name)) {
    // Übergehen: bis zum Ende lesen.
    while (!(await e.daten.next()).done);
    return;
  }
  st.melde(
    t('meldungen.wiederherstellung.entschluesseln-und-einspielen'),
    'laeuft',
    t('meldungen.wiederherstellung.tabelle', { name: tabelle2.name }),
  );
  const w = await st
    .neu!.unsafe(`COPY ${bezeichner(st.schema)}.${bezeichner(tabelle2.name)} (${tabelle2.spalten.map(bezeichner).join(', ')}) FROM STDIN`)
    .writable();
  st.w = w;
  for await (const c of e.daten) if (!w.write(c)) await once(w, 'drain');
  w.end();
  await once(w, 'finish');
  st.w = null;
  z.tabellen++;
}

/** Prüfwert aus den Angaben (.json) einer Fassung oder Archivfassung merken. */
function merkeAngaben(z: Eingespielt, angaben: Buffer[], sha: string, istArchiv: boolean) {
  let soll = '';
  let imOriginal = false;
  try {
    const j = JSON.parse(Buffer.concat(angaben).toString('utf8')) as { sha256?: unknown; imOriginal?: unknown };
    soll = String(j.sha256 ?? '');
    imOriginal = j.imOriginal === true;
  } catch {
    /* unlesbar */
  }
  (istArchiv ? z.archivSoll : z.fassungSoll).set(sha, soll);
  if (istArchiv && imOriginal) z.archivOriginal.add(sha);
}

/** Prüfwerte, die beim Lesen einer Datei mitlaufen. */
interface DateiPruefung {
  /** Stichprobe: Inhalt gegen den Namen (Prüfwert des Originals). */
  h: Hash | null;
  /** Fassung oder Archivfassung: Inhalt gegen den Prüfwert in den Angaben. */
  hf: Hash | null;
  /** Angaben (.json) einer Fassung oder Archivfassung. */
  angaben: Buffer[] | null;
}

/**
 * Inhalt einer Datei lesen, Prüfwerte mitrechnen und – außer bei der Probe – in den Ordner der Wiederherstellung
 * schreiben. Streamen statt puffern: auch große Dokumente brauchen kaum Arbeitsspeicher.
 */
async function kopiereDatei(st: WhStand, e: Gelesen, rel: string, p: DateiPruefung) {
  const { h, hf, angaben } = p;
  let ausgabe: Writable | null = null;
  if (!st.probe) {
    const ziel = join(st.staging, st.m.haushaltId, ...rel.split('/'));
    await mkdir(dirname(ziel), { recursive: true });
    ausgabe = createWriteStream(ziel, { flags: 'wx', flush: true });
    st.w = ausgabe;
  }
  for await (const c of e.daten) {
    h?.update(c);
    hf?.update(c);
    if (angaben && angaben.length < 64) angaben.push(c);
    if (ausgabe && !ausgabe.write(c)) await once(ausgabe, 'drain');
  }
  if (ausgabe) {
    ausgabe.end();
    await once(ausgabe, 'close');
    st.w = null;
  }
}

/** Eine Datei in den Ordner der Wiederherstellung (bei der Probe nirgendwohin); Stichprobe der Prüfwerte. */
async function spieleDatei(st: WhStand, e: Gelesen, z: Eingespielt) {
  const rel = String(e.kopf.pfad);
  if (!istSicherer(rel)) throw new Error(`Ungültiger Dateipfad in der Sicherung: ${rel}`);
  const pruefen = z.iDatei++ % z.jede === 0;
  const name = rel.split('/').pop()!;
  const fassung = FASSUNG_PFAD.exec(rel) ?? ARCHIV_PFAD.exec(rel);
  const istArchiv = !!fassung && rel.startsWith('archivfassungen/');
  const h = pruefen && /^[0-9a-f]{64}$/.test(name) ? createHash('sha256') : null;
  // Fassungen und Archivfassungen immer ganz prüfen: Inhalt gegen den Prüfwert in ihren Angaben (.json).
  const hf = fassung?.[2] === 'fassung' ? createHash('sha256') : null;
  const angaben: Buffer[] | null = fassung?.[2] === 'json' ? [] : null;
  await kopiereDatei(st, e, rel, { h, hf, angaben });
  if (h) {
    if (h.digest('hex') !== name) throw new Error(`Die Datei ${rel} in der Sicherung ist beschädigt (Prüfwert stimmt nicht).`);
    z.stichprobe++;
  }
  if (hf) (istArchiv ? z.archivIst : z.fassungIst).set(fassung![1], hf.digest('hex'));
  if (angaben) merkeAngaben(z, angaben, fassung![1], istArchiv);
  z.dateien++;
}

/** Die Sicherung entschlüsseln und Eintrag für Eintrag einspielen; erst am Ende ist der GCM-Prüfwert geprüft. */
export async function liesEin(st: WhStand, pfad: string, k: Buffer): Promise<Eingespielt> {
  const { lauf, m } = st;
  const z: Eingespielt = {
    tabellen: 0,
    dateien: 0,
    stichprobe: 0,
    iDatei: 0,
    endeTabellen: null,
    dateienEnde: null,
    jede: Math.max(1, Math.ceil(m.anzahl.dateien / 20)),
    zaehlerSicherung: null,
    fassungIst: new Map(),
    fassungSoll: new Map(),
    archivIst: new Map(),
    archivSoll: new Map(),
    archivOriginal: new Set(),
  };
  lauf.bytes = 0;
  for await (const e of liesSicherung(pfad, leiteAb(k, ZWECK), (n) => {
    lauf.bytes = n;
  })) {
    if (e.art === 'M') {
      if (e.kopf.haushaltId !== m.haushaltId) throw new Error('Inhalt und Metadaten der Sicherung passen nicht zusammen (Ablage-Id).');
      z.zaehlerSicherung = (e.kopf.zaehler as Record<string, number>) ?? null;
    } else if (e.art === 'T') await spieleTabelle(st, e, z);
    else if (e.art === 'D') await spieleDatei(st, e, z);
    else if (e.art === 'E') {
      z.endeTabellen = Number(e.kopf.tabellen);
      z.dateienEnde = Number(e.kopf.dateien);
    }
  }
  // Erst hier ist der GCM-Prüfwert geprüft: Die Datei ist echt und vollständig.
  if (z.endeTabellen === null || z.tabellen !== z.endeTabellen || z.tabellen !== m.anzahl.tabellen)
    throw new Error(`Die Sicherung ist unvollständig: ${z.tabellen} Tabellen eingespielt, erwartet ${m.anzahl.tabellen}.`);
  return z;
}

/**
 * Fassung und Angaben gehören zusammen. Passt ein Paar nicht (z. B. während der Sicherung neu umgewandelt), kommt es
 * nicht mit: Das Paket wandelt die Datei dann neu um (wie bei einer Sicherung ohne Fassungen). Danach die Meldung des
 * Schritts.
 */
export async function pruefeFassungen(st: WhStand, z: Eingespielt) {
  const { probe, staging, m } = st;
  let fassungen = 0;
  let fassungenOhne = 0;
  for (const sha of new Set([...z.fassungIst.keys(), ...z.fassungSoll.keys()])) {
    if (z.fassungIst.has(sha) && z.fassungIst.get(sha) === z.fassungSoll.get(sha)) {
      fassungen++;
      continue;
    }
    fassungenOhne++;
    log.warn('Umgewandelte Fassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
    if (!probe)
      for (const endung of ['json', 'fassung'])
        await rm(join(staging, m.haushaltId, 'fassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
  }
  let archiv = 0;
  let archivOhne = 0;
  for (const sha of new Set([...z.archivIst.keys(), ...z.archivSoll.keys()])) {
    // „Original ist schon PDF/A“: nur Angaben, ihr Prüfwert ist der des Originals.
    if (z.archivOriginal.has(sha) && !z.archivIst.has(sha) && z.archivSoll.get(sha) === sha) {
      archiv++;
      continue;
    }
    if (z.archivIst.has(sha) && z.archivIst.get(sha) === z.archivSoll.get(sha)) {
      archiv++;
      continue;
    }
    archivOhne++;
    log.warn('Archivfassung in der Sicherung unvollständig – nicht übernommen', { datei: sha });
    if (!probe)
      for (const endung of ['json', 'fassung'])
        await rm(join(staging, m.haushaltId, 'archivfassungen', sha.slice(0, 2), `${sha}.${endung}`), { force: true });
  }
  st.ok(
    t('meldungen.wiederherstellung.tabellen-dateien', {
      tabellen: z.tabellen,
      dateien: z.dateien,
      wert: fassungen ? t('meldungen.wiederherstellung.umgewandelte-fassungen', { anzahl: fassungen }) : '',
      wert2: fassungenOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen', { fassungenOhne }) : '',
      wert3: archiv ? t('meldungen.wiederherstellung.archivfassungen-pdf-a', { anzahl: archiv }) : '',
      wert4: archivOhne ? t('meldungen.wiederherstellung.unvollstaendig-nicht-uebernommen-2', { archivOhne }) : '',
      wert5: z.stichprobe ? t('meldungen.wiederherstellung.pruefwerte-von-dateien-nachgerechnet', { stichprobe: z.stichprobe }) : '',
    }),
  );
}

/** Zähler der Sequenzen nachziehen; Statistik der eingespielten Tabellen (#367). */
export async function zieheNach(st: WhStand) {
  const neu = st.neu!;
  const { schema } = st;
  for (const r of await neu`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${schema} AND column_default LIKE 'nextval(%'`) {
    const t = `${bezeichner(schema)}.${bezeichner(r.table_name as string)}`;
    await neu.unsafe(
      `SELECT setval(pg_get_serial_sequence('${t.replace(/'/g, "''")}', '${String(r.column_name).replace(/'/g, "''")}'), coalesce((SELECT max(${bezeichner(r.column_name as string)}) FROM ${t}), 0) + 1, false)`,
    );
  }
  // Statistik der eingespielten Tabellen (#367): COPY füllt sie, ANALYZE erst macht sie dem Planer bekannt.
  try {
    for (const r of await neu`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'`) {
      const spalten = STATISTIK_SPALTEN[r.table_name as string];
      await neu.unsafe(`ANALYZE ${bezeichner(schema)}.${bezeichner(r.table_name as string)}${spalten ? ` (${spalten})` : ''}`);
    }
  } catch {
    /* nur Leistung: der Autovacuum-Dienst holt es später nach */
  }
}
