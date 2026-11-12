import { createHash } from 'node:crypto';
import { proxyVertrauen } from './proxy';
import { existsSync, readFileSync } from 'node:fs';
import { arch, release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Technik- und Versionsübersicht (#15): was ist installiert, und – nur auf
 * Knopfdruck – gibt es Neueres? Die Übersicht lässt sich als Text in ein
 * GitHub-Issue kopieren.
 */

export const REPO = 'motom001/dms';
/** Bibliotheken des Servers, deren Version für den Support zählt. */
export const BIBLIOTHEKEN = ['fastify', '@fastify/static', 'postgres', 'nodemailer', 'imapflow', 'mailparser'] as const;

export interface Datenbankdaten { version: string; groesseBytes: number; mappen: number; typen: number; benutzer: number; dokumente: number; dokumenteBytes: number }
export interface SystemQuelle { datenbank(): Promise<Datenbankdaten> }

export interface Uebersicht {
  /** variante (#208): „komplett“ = dms-komplett mit PostgreSQL im Container, sonst „dms“. */
  dms: { version: string; commit: string | null; gebaut: string | null; variante: 'dms' | 'komplett' };
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

/**
 * Kennung des laufenden Stands (#122): ändert sich mit Version, Commit oder Build-Zeit. Die
 * Oberfläche merkt sich die Kennung beim Laden und erkennt so nach einem Update, dass sie neu
 * geladen werden sollte. Ein Hash, damit /api/gesundheit ohne Anmeldung keine Version verrät.
 */
export function standKennung(): string {
  return createHash('sha256').update(`${eigeneVersion()}|${env.DMS_COMMIT ?? ''}|${env.DMS_GEBAUT ?? ''}`).digest('hex').slice(0, 12);
}

function lies(p: string) { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } }

export async function uebersicht(quelle: SystemQuelle | undefined, betrieb: { mail: string; adresse: string } | undefined): Promise<Uebersicht> {
  let datenbank: Uebersicht['datenbank'];
  try { datenbank = quelle ? await quelle.datenbank() : { fehler: t('meldungen.system.keine-datenbank-angebunden') }; }
  catch (e) { datenbank = { fehler: (e as Error).message }; }
  return {
    dms: { version: eigeneVersion(), commit: env.DMS_COMMIT || null, gebaut: env.DMS_GEBAUT || null, variante: env.DMS_VARIANTE === 'komplett' ? 'komplett' : 'dms' },
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
      Adresse: betrieb?.adresse ?? t('meldungen.system.nicht-gepflegt'),
      'E-Mail': betrieb?.mail ?? 'aus',
      TRUST_PROXY: `${env.TRUST_PROXY || t('meldungen.system.nicht-gesetzt')} → ${proxyVertrauen(env.TRUST_PROXY).text}`,
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
          (SELECT count(*) FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'person')::int AS benutzer,
          (SELECT count(*) FROM dokumente WHERE haushalt_id = ${haushaltId})::int AS dokumente,
          ((SELECT coalesce(sum(groesse), 0) FROM dokumente WHERE haushalt_id = ${haushaltId})
            -- Ältere Versionen (#194) zählen mit.
            + (SELECT coalesce(sum(groesse), 0) FROM dokument_versionen WHERE haushalt_id = ${haushaltId}))::bigint AS dokumente_bytes`;
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
  /**
   * #216: „selbst“ = der Betreiber aktualisiert (DMS-Image, bei zwei Containern PostgreSQL);
   * „dms“ = kommt mit einem DMS-Update (Node.js, Alpine, Bibliotheken; PostgreSQL in dms-komplett).
   */
  gruppe?: 'selbst' | 'dms';
  /** Verständliche Bezeichnung, z. B. „postgres.js (Datenbank-Treiber)“; komponente bleibt der feste Schlüssel. */
  bezeichnung?: string;
}

/** #216: Wofür die Bibliotheken da sind – „postgres“ ist der Treiber, nicht die Datenbank. */
export const BEZEICHNUNGEN: Record<string, string> = {
  fastify: t('meldungen.system.fastify-webserver'),
  '@fastify/static': '@fastify/static (Auslieferung der Oberfläche)',
  postgres: t('meldungen.system.postgres-js-datenbank-treiber'),
  nodemailer: t('meldungen.system.nodemailer-e-mail-versand'),
  imapflow: t('meldungen.system.imapflow-postfaecher-abrufen'),
  mailparser: t('meldungen.system.mailparser-mails-lesen'),
  yaml: t('meldungen.system.yaml-pakete-lesen'),
  react: t('meldungen.system.react-oberflaeche'),
};

type Abruf = (url: string) => Promise<unknown>;

/** JSON von einer Adresse, mit Zeitlimit. */
export async function holeJson(url: string, ms = 8000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json', 'user-agent': t('meldungen.system.dms-versionsabgleich', { REPO }) } });
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
    if (!passend) return { komponente: name, installiert, aktuell: neueste?.latest ?? null, status: 'unbekannt', hinweis: t('meldungen.system.version-nicht-in-der'), quelle };
    const hinweise: string[] = [];
    let status: Vergleich['status'] = vergleicheVersion(passend.latest, installiert) > 0 ? 'neuer' : 'aktuell';
    if (status === 'neuer') hinweise.push(t('meldungen.system.neuere-version-in-reihe', { cycle: passend.cycle, latest: passend.latest }));
    if (typeof passend.eol === 'string') {
      const ende = Date.parse(passend.eol);
      if (ende < Date.now()) { status = 'veraltet'; hinweise.push(t('meldungen.system.unterstuetzung-endete-am', { eol: passend.eol })); }
      else hinweise.push(t('meldungen.system.unterstuetzt-bis', { eol: passend.eol }));
    }
    if (neueste && neueste.cycle !== passend.cycle) hinweise.push(t('meldungen.system.neueste-reihe', { wert: produkt === 'nodejs' ? 'LTS-' : '', cycle: neueste.cycle, latest: neueste.latest }));
    return { komponente: name, installiert, aktuell: passend.latest, status, hinweis: hinweise.join(' '), quelle };
  } catch (e) {
    return { komponente: name, installiert, aktuell: null, status: 'unbekannt', hinweis: t('meldungen.system.abfrage-fehlgeschlagen', { message: (e as Error).message }), quelle };
  }
}

async function npmPaket(abruf: Abruf, name: string, installiert: string | null): Promise<Vergleich> {
  const quelle = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  try {
    const { version } = (await abruf(quelle)) as { version: string };
    const status = !installiert ? 'unbekannt' : vergleicheVersion(version, installiert) > 0 ? 'neuer' : 'aktuell';
    return { komponente: name, installiert, aktuell: version, status, quelle };
  } catch (e) {
    return { komponente: name, installiert, aktuell: null, status: 'unbekannt', hinweis: t('meldungen.system.abfrage-fehlgeschlagen', { message: (e as Error).message }), quelle };
  }
}

/** Stand auf main: Commit und wie viele Änderungen seit dem installierten (Zusatzinfo und Rückfall). */
async function mainStand(abruf: Abruf, commit: string | null) {
  const c = (await abruf(`https://api.github.com/repos/${REPO}/commits/main`)) as { sha: string; commit: { committer: { date: string }; message: string } };
  const gleich = !!commit && (c.sha.startsWith(commit) || commit.startsWith(c.sha));
  let voraus: number | null = null;
  if (commit && !gleich) {
    try { voraus = ((await abruf(`https://api.github.com/repos/${REPO}/compare/${commit}...main`)) as { ahead_by?: number }).ahead_by ?? null; } catch { /* nur Zusatzinfo */ }
  }
  return { c, gleich, voraus };
}

/** Tag in der Sprache der Anfrage (#729), z. B. 05.11.2026 bzw. 05/11/2026. */
const datumDe = (iso: string) => new Intl.DateTimeFormat(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/**
 * Das DMS selbst (#206): mit dem neuesten Release auf GitHub vergleichen (Versionsnummer). Seit #907 ist „Latest“
 * die stabile Version (`:stabil`, im Wochentakt) – Releases dazwischen sind nicht „Latest“. So heißt es nur bei
 * einer neuen stabilen Version „neuer“. Wer neuer als die stabile Version ist (`:main` oder eine feste neuere
 * Nummer), bekommt wie bisher den Hinweis auf neuere Stände auf main. Ohne Release-Abfrage wie bisher der
 * Vergleich mit main.
 */
async function dmsSelbst(abruf: Abruf, u: Uebersicht): Promise<Vergleich> {
  const installiert = u.dms.commit ? `${u.dms.version} (${u.dms.commit.slice(0, 7)})` : u.dms.version;
  type Release = { tag_name?: string; published_at?: string; html_url?: string; target_commitish?: string };
  const release = await abruf(`https://api.github.com/repos/${REPO}/releases/latest`).then((x) => x as Release, () => null);
  const version = release?.tag_name?.replace(/^v/, '');
  if (version && /^\d+\.\d+/.test(version)) {
    const quelle = release!.html_url || `https://github.com/${REPO}/releases/latest`;
    const aktuell = `${version}${release!.published_at ? t('meldungen.system.release-vom', { datumDe: datumDe(release!.published_at) }) : ''}`;
    const neuer = vergleicheVersion(version, u.dms.version) > 0;
    const hinweise: string[] = [];
    if (neuer) {
      try {
        const liste = (await abruf(`https://api.github.com/repos/${REPO}/releases?per_page=100`)) as Array<{ tag_name?: string; draft?: boolean; prerelease?: boolean }>;
        const dazwischen = liste.map((r) => (r.draft || r.prerelease ? '' : (r.tag_name ?? '').replace(/^v/, '')))
          // Nur bis zur stabilen Version: neuere Releases sind noch nicht stabil.
          .filter((v) => /^\d+\.\d+/.test(v) && vergleicheVersion(v, u.dms.version) > 0 && vergleicheVersion(v, version) <= 0);
        if (dazwischen.length > 1) hinweise.push(t('meldungen.system.neuere-versionen-bis', { dazwischen: dazwischen.length, version }));
      } catch { /* nur Zusatzinfo */ }
      hinweise.push(t('meldungen.system.was-neu-ist-steht'));
    }
    // Stände auf main nur für alle, die schon über der stabilen Version sind (#907): höhere Nummer, oder dieselbe
    // Nummer aus einem anderen Commit als dem des Releases (`:main` nach einem Merge ohne neue Nummer).
    const ziel = release!.target_commitish ?? '';
    const c = u.dms.commit ?? '';
    const ueberStabil = vergleicheVersion(u.dms.version, version) > 0
      || (!neuer && vergleicheVersion(u.dms.version, version) === 0 && /^[0-9a-f]{7,40}$/.test(ziel) && !!c && !ziel.startsWith(c) && !c.startsWith(ziel));
    if (c && ueberStabil) try {
      const m = await mainStand(abruf, c);
      if (!m.gleich) {
        hinweise.push(m.voraus ? t('meldungen.system.auf-main-anzahl', { anzahl: m.voraus, sha: m.c.sha.slice(0, 7), datumDe: datumDe(m.c.commit.committer.date) }) : t('meldungen.system.auf-main', { sha: m.c.sha.slice(0, 7), datumDe: datumDe(m.c.commit.committer.date) }));
      }
    } catch { /* nur Zusatzinfo */ }
    return { komponente: 'Ablago', installiert, aktuell, status: neuer ? 'neuer' : 'aktuell', ...(hinweise.length ? { hinweis: hinweise.join(' ') } : {}), quelle };
  }
  // Rückfall: Vergleich mit main wie bisher.
  const quelle = `https://api.github.com/repos/${REPO}/commits/main`;
  try {
    const { c, gleich, voraus } = await mainStand(abruf, u.dms.commit ?? null);
    const aktuell = t('meldungen.system.main-vom', { sha: c.sha.slice(0, 7), date: c.commit.committer.date.slice(0, 10) });
    if (!u.dms.commit) return { komponente: 'Ablago', installiert, aktuell, status: 'unbekannt', hinweis: t('meldungen.system.ohne-commit-kennung-im'), quelle };
    if (gleich) return { komponente: 'Ablago', installiert, aktuell, status: 'aktuell', quelle };
    let hinweis = t('meldungen.system.neuester-stand', { split: c.commit.message.split('\n')[0] });
    if (voraus) hinweis = t('meldungen.system.neuere-aenderungen-auf-main', { anzahl: voraus, hinweis });
    return { komponente: 'Ablago', installiert, aktuell, status: 'neuer', hinweis: `${hinweis}. Zum Aktualisieren das Image neu ziehen.`, quelle };
  } catch (e) {
    return { komponente: 'Ablago', installiert, aktuell: null, status: 'unbekannt', hinweis: t('meldungen.system.abfrage-fehlgeschlagen', { message: (e as Error).message }), quelle };
  }
}

/**
 * Gibt es eine neuere stabile Version (#677, Wenn-Karte „Neue Version verfügbar“)? Nur die Nummer des neuesten Releases
 * („Latest“, #907), wenn sie über der installierten liegt – sonst null. Wirft, wenn GitHub nicht antwortet.
 */
export async function neueStabileVersion(abruf: Abruf = (url) => holeJson(url), installiert = eigeneVersion()): Promise<string | null> {
  const r = (await abruf(`https://api.github.com/repos/${REPO}/releases/latest`)) as { tag_name?: unknown };
  const version = typeof r?.tag_name === 'string' ? r.tag_name.replace(/^v/, '') : '';
  return /^\d+\.\d+(\.\d+)?$/.test(version) && vergleicheVersion(version, installiert) > 0 ? version : null;
}

/** Alle Komponenten parallel abgleichen; Fehler je Komponente statt insgesamt. */
export async function versionsabgleich(u: Uebersicht, browser: Record<string, string> = {}, abruf: Abruf = (url) => holeJson(url)): Promise<Vergleich[]> {
  const pg = 'version' in u.datenbank ? u.datenbank.version.split(' ')[0] : null;
  const komplett = u.dms.variante === 'komplett';
  const [dms, node, postgresql, ...rest] = await Promise.all([
    dmsSelbst(abruf, u),
    zyklus(abruf, 'nodejs', 'Node.js', u.laufzeit.node),
    zyklus(abruf, 'postgresql', 'PostgreSQL', pg),
    ...(u.laufzeit.alpine ? [zyklus(abruf, 'alpine', t('meldungen.system.alpine-linux-container'), u.laufzeit.alpine)] : []),
    ...Object.entries(u.bibliotheken).map(([n, v]) => npmPaket(abruf, n, v)),
    ...Object.entries(browser).filter(([n]) => n === 'react').map(([n, v]) => npmPaket(abruf, n, v)),
  ]);
  // PostgreSQL (#214, #216): Bei zwei Containern zieht der Betreiber das Image selbst; in dms-komplett kommt es mit dem DMS.
  if (postgresql.status === 'neuer') {
    postgresql.hinweis = [postgresql.hinweis, komplett
      ? 'Kommt mit dem nächsten Image dms-komplett (ghcr.io/motom001/dms-komplett neu ziehen, sobald es erschienen ist).'
      : `Zum Aktualisieren das Image postgres:${(pg ?? '').split('.')[0] || '17'} neu ziehen und den Datenbank-Container neu starten.`].filter(Boolean).join(' ');
  }
  return [
    { ...dms, gruppe: 'selbst' as const },
    { ...postgresql, gruppe: komplett ? 'dms' as const : 'selbst' as const, ...(komplett ? { bezeichnung: t('meldungen.system.postgresql-im-container-dms') } : {}) },
    { ...node, gruppe: 'dms' as const },
    ...rest.map((v) => ({ ...v, gruppe: 'dms' as const, ...(BEZEICHNUNGEN[v.komponente] ? { bezeichnung: BEZEICHNUNGEN[v.komponente] } : {}) })),
  ];
}
