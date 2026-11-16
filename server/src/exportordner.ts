import { readFileSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, realpath, rename, rm, rmdir, utimes } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { auskuenfteIn, auskunftOrdner } from './auskunft';
import type { Einstellungen } from './einstellungen';
import type { Ordner } from './ordner';
import { aufVolume, punktFuer } from './tresor';
import { exporteIn } from './vollexport';

/**
 * Export-Ordner (#797): Vollexport, „Meine Daten exportieren“ und Auskünfte liegen **unverschlüsselt** in einem
 * eigenen Ordner neben `files/` – im Container `/data/export` –, nie im Sicherungsordner. Den kopiert man in die
 * Cloud, weil die Sicherungen verschlüsselt sind; die Exporte sollen dabei nicht mitwandern.
 *
 *   export/dms-export-…/                  Vollexporte
 *   export/persoenlich/<Benutzer>/…       „Meine Daten exportieren“ (#255)
 *   export/auskunft/<id>.zip|.json        Auskünfte nach Art. 15 DSGVO (#396)
 *
 * Wohin der Ordner auf dem NAS zeigt, bestimmt wie bei den anderen festen Ordnern (#115) allein das Volume der
 * Compose-Datei (`…/export:/data/export`); eine Variable dafür gibt es nicht. Ohne eigene Zeile liegt er im
 * Container – das genügt, weil alles darin nach dem Herunterladen bzw. nach EXPORT_TAGE ohnehin gelöscht wird.
 */
export const EXPORT_NAME = 'export';

/** Der Export-Ordner neben `files/` (im Container /data/export, ohne Docker ./data/export). */
export const exportOrdnerVon = (o: Ordner) => join(dirname(o.dateien), EXPORT_NAME);

/** Hier lagen die Exporte bis #797. */
export const alterExportOrdner = (o: Ordner) => join(o.sicherung, EXPORT_NAME);

/** Ordner für „Meine Daten exportieren“ eines Benutzers. */
export const persoenlicherOrdner = (wurzel: string, benutzerId: string) => join(wurzel, 'persoenlich', benutzerId);

/** Wie der Export-Ordner eingerichtet ist – für Werkbank, Hinweise und Protokoll. */
export interface ExportOrt {
  pfad: string;
  /** Liegt im Sicherungsordner (nach realpath oder über ein Volume auf einen Unterordner der Sicherung). */
  imSicherungsordner: boolean;
  /** Eigenes Volume (nur im Container feststellbar). */
  volume: boolean | null;
}

/* ---------- Liegt ein Ordner in einem anderen? ---------- */

const unescape = (s: string) => s.replace(/\\040/g, ' ');

/** Woher ein Pfad kommt: Gerät und Pfad innerhalb dieses Dateisystems (aus /proc/self/mountinfo). */
export function herkunft(pfad: string, mountinfo: string): { geraet: string; pfad: string } | null {
  const punkt = punktFuer(pfad, mountinfo);
  const zeile = mountinfo
    .split('\n')
    .map((z) => z.split(' '))
    .find((f) => f[4] !== undefined && unescape(f[4]) === punkt);
  if (!zeile?.[2] || !zeile[3]) return null;
  const rest = relative(punkt, resolve(pfad));
  return { geraet: zeile[2], pfad: rest ? join(unescape(zeile[3]), rest) : unescape(zeile[3]) };
}

const innerhalb = (innen: string, aussen: string) => innen === aussen || innen.startsWith(aussen.endsWith(sep) ? aussen : aussen + sep);

/**
 * Liegt `innen` in `aussen` (oder ist derselbe Ordner)? Zuerst nach realpath (Verknüpfungen, Ordner ohne Docker),
 * dann über die Einhängepunkte: Zeigt das Volume /data/export auf einen Unterordner des Volumes /data/sicherung,
 * sind es im Container zwei Pfade, auf der Platte aber derselbe Ort.
 */
export async function liegtIn(innen: string, aussen: string, mountinfo?: string | null): Promise<boolean> {
  const echt = async (p: string) => realpath(p).catch(() => resolve(p));
  if (innerhalb(await echt(innen), await echt(aussen))) return true;
  let text = mountinfo;
  if (text === undefined) {
    try {
      text = readFileSync('/proc/self/mountinfo', 'utf8');
    } catch {
      text = null;
    }
  }
  if (!text) return false;
  const a = herkunft(innen, text);
  const b = herkunft(aussen, text);
  return !!a && !!b && a.geraet === b.geraet && innerhalb(a.pfad, b.pfad);
}

export async function exportOrt(o: Ordner, mountinfo?: string | null): Promise<ExportOrt> {
  const pfad = exportOrdnerVon(o);
  return { pfad, imSicherungsordner: await liegtIn(pfad, o.sicherung, mountinfo), volume: aufVolume(pfad) };
}

/* ---------- Umzug aus sicherung/export (#797) ---------- */

/** Wie viele Exporte in einem Export-Ordner liegen: Vollexporte, persönliche Exporte, Auskünfte. */
const namen = async (p: string) => readdir(p).catch(() => [] as string[]);

/** Vollexporte und persönliche Exporte (relativ zur Wurzel). */
async function exportPfade(wurzel: string): Promise<string[]> {
  const erg = (await namen(wurzel)).filter((x) => x.startsWith('dms-export-'));
  for (const b of await namen(join(wurzel, 'persoenlich'))) {
    erg.push(
      ...(await namen(join(wurzel, 'persoenlich', b))).filter((x) => x.startsWith('dms-export-')).map((x) => join('persoenlich', b, x)),
    );
  }
  return erg;
}

export async function zaehleExporte(wurzel: string): Promise<number> {
  return (await exportPfade(wurzel)).length + (await namen(join(wurzel, 'auskunft'))).filter((x) => x.endsWith('.zip')).length;
}

type Umbenennen = (von: string, nach: string) => Promise<void>;

/**
 * Verschiebt `quelle` nach `ziel`. Ordner, die es am Ziel schon gibt, werden zusammengeführt; eine Datei, die es
 * dort schon gibt, bleibt am alten Ort liegen. Auf ein anderes Dateisystem (EXDEV, eigenes Volume) wird erst in
 * eine Zwischenkopie kopiert, dann umbenannt und erst danach das Original gelöscht – ein Abbruch verliert nichts.
 * Liefert, ob die Quelle ganz weg ist.
 */
async function verschiebe(quelle: string, ziel: string, umbenennen: Umbenennen): Promise<boolean> {
  const q = await lstat(quelle);
  const z = await lstat(ziel).catch(() => null);
  if (q.isDirectory() && z?.isDirectory()) {
    let alles = true;
    for (const n of await readdir(quelle)) if (!(await verschiebe(join(quelle, n), join(ziel, n), umbenennen))) alles = false;
    if (alles)
      await rmdir(quelle).catch(() => {
        alles = false;
      });
    return alles;
  }
  if (z) return false;
  try {
    await umbenennen(quelle, ziel);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    const zwischen = `${ziel}.umzug`;
    await rm(zwischen, { recursive: true, force: true });
    await cp(quelle, zwischen, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    await rename(zwischen, ziel);
    await rm(quelle, { recursive: true, force: true });
  }
  return true;
}

export interface Umzug {
  anzahl: number;
  uebrig: boolean;
}

/**
 * Beim Start (#797): Was noch in `sicherung/export/` liegt, wandert in den Export-Ordner. Mehrfach ausführbar;
 * nichts zu tun, wenn es den alten Ordner nicht gibt oder er derselbe ist wie der neue (Volume in die Sicherung –
 * dafür gibt es die Warnung). `uebrig`: Es blieb etwas liegen (gleichnamig am Ziel oder nicht verschiebbar).
 */
export async function zieheExporteUm(
  alt: string,
  neu: string,
  x: { umbenennen?: Umbenennen; mountinfo?: string | null; jetzt?: Date } = {},
): Promise<Umzug> {
  if (
    !(await lstat(alt).then(
      (s) => s.isDirectory(),
      () => false,
    ))
  )
    return { anzahl: 0, uebrig: false };
  await mkdir(neu, { recursive: true });
  if ((await liegtIn(neu, alt, x.mountinfo)) || (await liegtIn(alt, neu, x.mountinfo))) return { anzahl: 0, uebrig: false };
  const vorher = await zaehleExporte(alt);
  const exporte = await exportPfade(alt);
  let uebrig = false;
  for (const n of await readdir(alt)) {
    try {
      if (!(await verschiebe(join(alt, n), join(neu, n), x.umbenennen ?? rename))) uebrig = true;
    } catch {
      uebrig = true;
    }
  }
  // Schonfrist: Bis zum Update galt für Vollexporte „bis zum Löschen“. Damit keiner gleich nach dem Update
  // verschwindet, zählen die 7 Tage für verschobene Exporte ab jetzt (Zeitstempel des Manifests, siehe exporteIn).
  const jetzt = x.jetzt ?? new Date();
  for (const r of exporte) {
    if (
      await lstat(join(alt, r)).then(
        () => false,
        () => true,
      )
    )
      await utimes(join(neu, r, 'manifest.json'), jetzt, jetzt).catch(() => {});
  }
  // Gezählt wird, was wirklich umzog – Liegengebliebenes nicht (es kommt beim nächsten Start wieder als „übrig“).
  const anzahl = Math.max(0, vorher - (await zaehleExporte(alt)));
  if (!uebrig)
    await rmdir(alt).catch(() => {
      uebrig = true;
    });
  return { anzahl, uebrig };
}

/** Einstellung, unter der der Umzug für den Hinweis in der Werkbank steht – bis ihn ein Administrator gelesen hat. */
const UMZUG = 'export_umzug';
export interface UmzugHinweis {
  am: string;
  anzahl: number;
  uebrig: boolean;
}

export async function merkeUmzug(e: Einstellungen, u: Umzug, jetzt = new Date()): Promise<void> {
  if (u.anzahl || u.uebrig) await e.schreibe(UMZUG, { am: jetzt.toISOString(), anzahl: u.anzahl, uebrig: u.uebrig, gesehen: false });
}

/** Der Hinweis zum Umzug; null, wenn nichts umzog oder er schon gelesen ist. */
export async function umzugHinweis(e?: Einstellungen): Promise<UmzugHinweis | null> {
  const u = (await e?.lies(UMZUG)) as (UmzugHinweis & { gesehen: boolean }) | null | undefined;
  return u && !u.gesehen ? { am: u.am, anzahl: u.anzahl, uebrig: u.uebrig } : null;
}

export async function umzugGesehen(e?: Einstellungen): Promise<void> {
  const u = (await e?.lies(UMZUG)) as (UmzugHinweis & { gesehen: boolean }) | null | undefined;
  if (u && !u.gesehen) await e?.schreibe(UMZUG, { ...u, gesehen: true });
}

/* ---------- Aufräumen (#797, wie die Auskunft #396) ---------- */

/**
 * Löscht Abgelaufenes im ganzen Export-Ordner: Vollexporte und persönliche Exporte nach EXPORT_TAGE, Auskünfte nach
 * ihrem `bis`. Läuft stündlich mit dem Papierkorb; das Lesen der Listen räumt ohnehin schon auf.
 */
export async function raeumeExporteAuf(wurzel: string, jetzt = new Date()): Promise<void> {
  await exporteIn(wurzel, jetzt);
  for (const b of await readdir(join(wurzel, 'persoenlich')).catch(() => [] as string[])) {
    const ordner = join(wurzel, 'persoenlich', b);
    await exporteIn(ordner, jetzt);
    await rmdir(ordner).catch(() => {
      /* nicht leer */
    });
  }
  await auskuenfteIn(auskunftOrdner(wurzel), jetzt);
}
