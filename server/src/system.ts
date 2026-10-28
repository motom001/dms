import { existsSync, readFileSync } from 'node:fs';
import { arch, release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

/**
 * Technik- und Versionsübersicht (#15): was ist installiert, und – nur auf
 * Knopfdruck – gibt es Neueres? Die Übersicht lässt sich als Text in ein
 * GitHub-Issue kopieren.
 */

export const REPO = 'motom001/dms';
/** Bibliotheken des Servers, deren Version für den Support zählt. */
export const BIBLIOTHEKEN = ['fastify', '@fastify/static', 'postgres', 'nodemailer'] as const;

export interface Datenbankdaten { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number }
export interface SystemQuelle { datenbank(): Promise<Datenbankdaten> }

export interface Uebersicht {
  dms: { version: string; commit: string | null; gebaut: string | null };
  laufzeit: { node: string; system: string; architektur: string; container: boolean; alpine: string | null; zeitzone: string; laeuftSeit: string };
  datenbank: Datenbankdaten | { fehler: string };
  bibliotheken: Record<string, string | null>;
  einstellungen: Record<string, string>;
}

const start = new Date();
const env = process.env;

/** Version einer installierten Bibliothek aus ihrer package.json (ohne sie zu laden). */
export function installierteVersion(name: string, wurzeln = suchwurzeln()): string | null {
  for (const w of wurzeln) {
    const p = join(w, 'node_modules', name, 'package.json');
    if (existsSync(p)) {
      try { return (JSON.parse(readFileSync(p, 'utf8')) as { version?: string }).version ?? null; } catch { /* weiter */ }
    }
  }
  return null;
}

function suchwurzeln(): string[] {
  const hier = dirname(fileURLToPath(import.meta.url));
  return [...new Set([process.cwd(), join(process.cwd(), '..'), join(hier, '..'), join(hier, '..', '..')])];
}

export function eigeneVersion(): string {
  if (env.DMS_VERSION) return env.DMS_VERSION;
  for (const w of suchwurzeln()) {
    const p = join(w, 'package.json');
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { name?: string; version?: string };
      if (j.name === 'dms' && j.version) return j.version;
    } catch { /* weiter */ }
  }
  return 'unbekannt';
}

function lies(p: string) { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } }

export async function uebersicht(quelle: SystemQuelle | undefined, mailHost: string | undefined): Promise<Uebersicht> {
  let datenbank: Uebersicht['datenbank'];
  try { datenbank = quelle ? await quelle.datenbank() : { fehler: 'keine Datenbank angebunden' }; }
  catch (e) { datenbank = { fehler: (e as Error).message }; }
  return {
    dms: { version: eigeneVersion(), commit: env.DMS_COMMIT || null, gebaut: env.DMS_GEBAUT || null },
    laufzeit: {
      node: process.versions.node,
      system: `${type()} ${release()}`,
      architektur: arch(),
      container: existsSync('/.dockerenv') || existsSync('/run/.containerenv'),
      alpine: lies('/etc/alpine-release'),
      zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      laeuftSeit: start.toISOString(),
    },
    datenbank,
    bibliotheken: Object.fromEntries(BIBLIOTHEKEN.map((b) => [b, installierteVersion(b)])),
    // Nur unkritische Einstellungen – keine Passwörter, keine Verbindungsdaten.
    einstellungen: {
      APP_URL: env.APP_URL ?? '(nicht gesetzt)',
      'E-Mail': mailHost ? `über ${mailHost}` : 'aus',
      TRUST_PROXY: env.TRUST_PROXY ?? 'false',
      LOG_LEVEL: env.LOG_LEVEL ?? 'info',
    },
  };
}

export function pgSystemQuelle(sql: postgres.Sql, haushaltId: string): SystemQuelle {
  return {
    async datenbank() {
      const [r] = await sql`
        SELECT current_setting('server_version') AS version,
          pg_database_size(current_database())::bigint AS groesse,
          (SELECT count(*) FROM mappen WHERE haushalt_id = ${haushaltId})::int AS mappen,
          (SELECT count(*) FROM mappentypen WHERE haushalt_id = ${haushaltId})::int AS typen,
          (SELECT count(*) FROM benutzer WHERE haushalt_id = ${haushaltId})::int AS benutzer,
          (SELECT count(*) FROM dokumente WHERE haushalt_id = ${haushaltId})::int AS dokumente,
          (SELECT coalesce(sum(groesse), 0) FROM dokumente WHERE haushalt_id = ${haushaltId})::bigint AS dokumente_bytes`;
      return {
        version: r.version as string, groesseBytes: Number(r.groesse), mappen: r.mappen as number, typen: r.typen as number,
        benutzer: r.benutzer as number, dokumente: r.dokumente as number, dokumenteBytes: Number(r.dokumente_bytes),
      };
    },
  };
}

/* ---------- Abgleich mit neueren Versionen (nur auf Knopfdruck) ---------- */

export interface Vergleich {
  komponente: string;
  installiert: string | null;
  aktuell: string | null;
  status: 'aktuell' | 'neuer' | 'veraltet' | 'unbekannt';
  hinweis?: string;
  quelle: string;
}

type Abruf = (url: string) => Promise<unknown>;

/** JSON von einer Adresse, mit Zeitlimit. */
export async function holeJson(url: string, ms = 8000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json', 'user-agent': `dms-versionsabgleich (${REPO})` } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`.trim());
  return r.json();
}

const teile = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
export function vergleicheVersion(a: string, b: string): number {
  const x = teile(a), y = teile(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

interface EolZyklus { cycle: string; latest: string; eol: string | boolean; lts?: string | boolean }

/** Laufzeit (Node.js, PostgreSQL, Alpine) gegen endoflife.date. */
async function zyklus(abruf: Abruf, produkt: string, name: string, installiert: string | null): Promise<Vergleich> {
  const quelle = `https://endoflife.date/api/${produkt}.json`;
  if (!installiert) return { komponente: name, installiert, aktuell: null, status: 'unbekannt', quelle };
  try {
    const liste = (await abruf(quelle)) as EolZyklus[];
    const passend = liste.find((z) => installiert === z.cycle || installiert.startsWith(`${z.cycle}.`));
    const neueste = produkt === 'nodejs' ? liste.find((z) => z.lts) ?? liste[0] : liste[0];
    if (!passend) return { komponente: name, installiert, aktuell: neueste?.latest ?? null, status: 'unbekannt', hinweis: 'Version nicht in der Liste gefunden.', quelle };
    const hinweise: string[] = [];
    let status: Vergleich['status'] = vergleicheVersion(passend.latest, installiert) > 0 ? 'neuer' : 'aktuell';
    if (status === 'neuer') hinweise.push(`Neuere Version in Reihe ${passend.cycle}: ${passend.latest}.`);
    if (typeof passend.eol === 'string') {
      const ende = Date.parse(passend.eol);
      if (ende < Date.now()) { status = 'veraltet'; hinweise.push(`Unterstützung endete am ${passend.eol}.`); }
      else hinweise.push(`Unterstützt bis ${passend.eol}.`);
    }
    if (neueste && neueste.cycle !== passend.cycle) hinweise.push(`Neueste ${produkt === 'nodejs' ? 'LTS-' : ''}Reihe: ${neueste.cycle} (${neueste.latest}).`);
    return { komponente: name, installiert, aktuell: passend.latest, status, hinweis: hinweise.join(' '), quelle };
  } catch (e) {
    return { komponente: name, installiert, aktuell: null, status: 'unbekannt', hinweis: `Abfrage fehlgeschlagen: ${(e as Error).message}`, quelle };
  }
}

async function npmPaket(abruf: Abruf, name: string, installiert: string | null): Promise<Vergleich> {
  const quelle = `https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`;
  try {
    const { version } = (await abruf(quelle)) as { version: string };
    const status = !installiert ? 'unbekannt' : vergleicheVersion(version, installiert) > 0 ? 'neuer' : 'aktuell';
    return { komponente: name, installiert, aktuell: version, status, quelle };
  } catch (e) {
    return { komponente: name, installiert, aktuell: null, status: 'unbekannt', hinweis: `Abfrage fehlgeschlagen: ${(e as Error).message}`, quelle };
  }
}

async function dmsSelbst(abruf: Abruf, u: Uebersicht): Promise<Vergleich> {
  const quelle = `https://api.github.com/repos/${REPO}/commits/main`;
  const installiert = u.dms.commit ? `${u.dms.version} (${u.dms.commit.slice(0, 7)})` : u.dms.version;
  try {
    const c = (await abruf(quelle)) as { sha: string; commit: { committer: { date: string }; message: string } };
    const aktuell = `main (${c.sha.slice(0, 7)} vom ${c.commit.committer.date.slice(0, 10)})`;
    if (!u.dms.commit) return { komponente: 'DMS', installiert, aktuell, status: 'unbekannt', hinweis: 'Ohne Commit-Kennung im Image (DMS_COMMIT) lässt sich der Stand nicht vergleichen.', quelle };
    if (c.sha.startsWith(u.dms.commit) || u.dms.commit.startsWith(c.sha)) return { komponente: 'DMS', installiert, aktuell, status: 'aktuell', quelle };
    let hinweis = `Neuester Stand: ${c.commit.message.split('\n')[0]}`;
    try {
      const v = (await abruf(`https://api.github.com/repos/${REPO}/compare/${u.dms.commit}...main`)) as { ahead_by?: number };
      if (v.ahead_by) hinweis = `${v.ahead_by} neuere Änderung${v.ahead_by === 1 ? '' : 'en'} auf main. ${hinweis}`;
    } catch { /* nur Zusatzinfo */ }
    return { komponente: 'DMS', installiert, aktuell, status: 'neuer', hinweis: `${hinweis}. Zum Aktualisieren das Image neu ziehen.`, quelle };
  } catch (e) {
    return { komponente: 'DMS', installiert, aktuell: null, status: 'unbekannt', hinweis: `Abfrage fehlgeschlagen: ${(e as Error).message}`, quelle };
  }
}

/** Alle Komponenten parallel abgleichen; Fehler je Komponente statt insgesamt. */
export async function versionsabgleich(u: Uebersicht, browser: Record<string, string> = {}, abruf: Abruf = (url) => holeJson(url)): Promise<Vergleich[]> {
  const pg = 'version' in u.datenbank ? u.datenbank.version.split(' ')[0] : null;
  return Promise.all([
    dmsSelbst(abruf, u),
    zyklus(abruf, 'nodejs', 'Node.js', u.laufzeit.node),
    zyklus(abruf, 'postgresql', 'PostgreSQL', pg),
    ...(u.laufzeit.alpine ? [zyklus(abruf, 'alpine', 'Alpine Linux (Container)', u.laufzeit.alpine)] : []),
    ...Object.entries(u.bibliotheken).map(([n, v]) => npmPaket(abruf, n, v)),
    ...Object.entries(browser).filter(([n]) => n === 'react').map(([n, v]) => npmPaket(abruf, n, v)),
  ]);
}
