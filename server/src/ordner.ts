import { statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { aufVolume, geraetVon } from './tresor';

/**
 * Feste Ordner im Container (#115). Wohin sie auf dem NAS zeigen, bestimmt allein das
 * Volume-Mapping der Compose-Datei; es gibt dafür keine Umgebungsvariablen mehr.
 *
 *   /data/files      hochgeladene Dateien, Logos, Fehlerbilder
 *   /data/geheim     Schlüssel (dms.schluessel), RESCUE-Datei
 *   /data/sicherung  Sicherungen
 *
 * Ohne Docker (Entwicklung, Tests) liegen sie unter ./data im Projekt; DMS_DATENWURZEL
 * verlegt sie für Entwicklung und CI (nicht im Admin-Handbuch).
 */
export interface Ordner { dateien: string; geheim: string; sicherung: string }
export type OrdnerArt = keyof Ordner;

export const ORDNER_NAMEN: Record<OrdnerArt, string> = { dateien: 'files', geheim: 'geheim', sicherung: 'sicherung' };
export const ORDNER_TEXT: Record<OrdnerArt, string> = {
  dateien: 'Dateien (Dokumente, Logos, Fehlerbilder)',
  geheim: 'Schlüssel und Notfallzugang',
  sicherung: 'Sicherungen',
};
export const SCHLUESSELDATEI = 'dms.schluessel';
export const CONTAINER_WURZEL = '/data';

export function ordnerUnter(wurzel: string): Ordner {
  return { dateien: join(wurzel, ORDNER_NAMEN.dateien), geheim: join(wurzel, ORDNER_NAMEN.geheim), sicherung: join(wurzel, ORDNER_NAMEN.sicherung) };
}

/** Frühere Variablen und der Ordner, an dessen Stelle sie traten. */
const ALTE_VARIABLEN: Array<{ name: string; art: OrdnerArt; datei?: string }> = [
  { name: 'FILES_DIR', art: 'dateien' },
  { name: 'DMS_SCHLUESSEL_DATEI', art: 'geheim', datei: SCHLUESSELDATEI },
  { name: 'DMS_SICHERUNG_DIR', art: 'sicherung' },
];

export interface OrdnerPruefung {
  ordner: Ordner;
  /** Alte Variable mit dem festen Wert: kann aus der Compose-Datei entfernt werden. */
  ueberfluessig: string[];
  /** Alte Variable mit anderem Wert: das DMS startet nicht (sonst sähe es leere Ordner). */
  fehler: string[];
}

const gleich = (a: string, b: string) => resolve(a).replace(/\/+$/, '') === resolve(b).replace(/\/+$/, '');

/**
 * Ordner bestimmen und frühere Variablen prüfen. `standardWurzel` ist die Wurzel ohne Docker
 * (./data im Projekt); im Image (NODE_ENV=production) gilt /data.
 */
export function pruefeOrdner(env: Record<string, string | undefined>, standardWurzel: string): OrdnerPruefung {
  const wurzel = env.DMS_DATENWURZEL || (env.NODE_ENV === 'production' ? CONTAINER_WURZEL : standardWurzel);
  const ordner = ordnerUnter(wurzel);
  const ueberfluessig: string[] = [];
  const fehler: string[] = [];
  for (const v of ALTE_VARIABLEN) {
    const wert = env[v.name];
    if (!wert) continue;
    const fest = v.datei ? join(ordner[v.art], v.datei) : ordner[v.art];
    if (gleich(wert, fest)) { ueberfluessig.push(v.name); continue; }
    const imContainer = v.datei ? join(CONTAINER_WURZEL, ORDNER_NAMEN[v.art], v.datei) : join(CONTAINER_WURZEL, ORDNER_NAMEN[v.art]);
    const bisher = v.datei ? `den Ordner der Datei ${wert}` : wert;
    fehler.push(
      `${v.name}=${wert} wird nicht mehr unterstützt: Die Ordner im Container sind fest (${imContainer}). `
      + `Ordne in der Compose-Datei das Volume, das bisher auf ${bisher} zeigte, dem Ordner ${join(CONTAINER_WURZEL, ORDNER_NAMEN[v.art])} zu `
      + `(z. B. - /volume1/docker/dms/${ORDNER_NAMEN[v.art]}:${join(CONTAINER_WURZEL, ORDNER_NAMEN[v.art])}) und entferne ${v.name}.`,
    );
  }
  return { ordner, ueberfluessig, fehler };
}

/* ---------- Belegung (für Technik und Speicherplatz, #115, #116) ---------- */

export interface OrdnerBelegung {
  art: OrdnerArt;
  pfad: string;
  text: string;
  /** Größe des Datenträgers, frei und belegt (in Bytes); null, wenn nicht messbar. */
  gesamt: number | null;
  frei: number | null;
  belegt: number | null;
  /** Liegt auf einem eigenen Volume (nur im Container feststellbar). */
  volume: boolean | null;
  /** Gleiche Kennung = derselbe Datenträger. */
  geraet: string | null;
}

export type Messer = (pfad: string) => Promise<{ gesamt: number; frei: number }>;
export const statfsMesser: Messer = async (pfad) => {
  const f = await statfs(pfad);
  return { gesamt: f.blocks * f.bsize, frei: f.bavail * f.bsize };
};

export async function belegung(o: Ordner, messer: Messer = statfsMesser, volume: (p: string) => boolean | null = aufVolume, geraet: (p: string) => string | null = geraetVon): Promise<OrdnerBelegung[]> {
  return Promise.all((Object.keys(ORDNER_NAMEN) as OrdnerArt[]).map(async (art) => {
    let gesamt: number | null = null, frei: number | null = null;
    try { ({ gesamt, frei } = await messer(o[art])); } catch { /* Ordner fehlt oder nicht lesbar */ }
    return { art, pfad: o[art], text: ORDNER_TEXT[art], gesamt, frei, belegt: gesamt !== null && frei !== null ? Math.max(0, gesamt - frei) : null, volume: volume(o[art]), geraet: geraet(o[art]) };
  }));
}
