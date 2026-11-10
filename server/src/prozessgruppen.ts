/**
 * Wer belegt die CPU – wie `top`, aber nach Gruppen (#895): für den Lasttest (Bericht, Ergebnisblock, Lasttest-Seite).
 *
 * Gelesen wird `/proc/<pid>/stat` (utime + stime, Name, Elternprozess) und `/proc/<pid>/status` (VmRSS) aller Prozesse,
 * die der Container sieht – nur Linux, anderswo „nicht verfügbar“. Gruppen:
 * - **Ablago je Prozess**: Hauptprozess (0), Leiter (1), weitere (2, …) – die Prozess-Ids kennt der Verbund;
 * - **Lastgenerator**: das Skript des Lasttests (die Id kennt der Lasttest-Modus);
 * - **PostgreSQL**: alle Prozesse namens `postgres` – nur, wenn die Datenbank im selben Container läuft (dms-komplett);
 *   im eigenen Container ist sie von hier aus nicht messbar;
 * - **Texterkennung** (tesseract, ocrmypdf und seine Helfer), **Seiten- und Vorschaubilder** (pdftoppm, pdftocairo,
 *   qpdf, gs …) und **andere Programme** (der Rest, z. B. der Paket-Läufer).
 *
 * Die Rechenzeit zählt je Gruppe fortlaufend in Sekunden (ab der ersten Frage); den Anteil in Prozent eines Kerns
 * bildet, wer fragt, aus zwei Ständen – der Lasttest je Durchgang, die Lasttest-Seite aus den letzten beiden. Gemessen
 * wird nur, wenn jemand fragt (der Lasttest alle 2 Sekunden); dazwischen läuft nichts.
 *
 * Beendete Programme: Ihre Rechenzeit landet beim Elternprozess (cutime + cstime). Was davon noch nicht gezählt war
 * (kurzlebige Programme zwischen zwei Fragen), bekommt die Gruppe der beendeten Kinder – bei PostgreSQL die Datenbank,
 * sonst, wenn unklar, „andere Programme“.
 */
import { readdirSync } from 'node:fs';
import { dateiLeser, type Leser } from './systemlast';
import { KB } from './grenzen';

export type GruppenArt = 'ablago' | 'lastgenerator' | 'postgres' | 'texterkennung' | 'bilder' | 'rest';
export const GRUPPEN_FOLGE: readonly GruppenArt[] = ['ablago', 'lastgenerator', 'postgres', 'texterkennung', 'bilder', 'rest'];

export interface GruppenWert {
  art: GruppenArt;
  /** Nur Ablago: Nummer des Prozesses (0 = Hauptprozess) und Rolle. */
  nr?: number;
  rolle?: 'haupt' | 'leiter' | 'anfragen';
  /** Prozesse jetzt. */
  anzahl: number;
  /** Rechenzeit fortlaufend seit der ersten Frage, in Sekunden. */
  cpuSekunden: number;
  /** Belegter Arbeitsspeicher (Summe der RSS, geteilter Speicher mehrfach) jetzt, in MB. */
  mb: number;
}

export type GruppenStand =
  | { verfuegbar: true; zeit: number; postgresImContainer: boolean; gruppen: GruppenWert[] }
  | { verfuegbar: false };

const TEXTERKENNUNG = new Set(['tesseract', 'ocrmypdf', 'unpaper', 'jbig2', 'pngquant']);
const BILDER = new Set(['pdftoppm', 'pdftocairo', 'pdfinfo', 'pdftotext', 'pdfimages', 'qpdf', 'gs', 'magick', 'convert', 'mutool', 'vips']);

/** Gruppe nach dem Namen des Programms (ohne bekannte Prozess-Id). */
export function artNachName(comm: string, befehl: () => string | null = () => null): Exclude<GruppenArt, 'ablago' | 'lastgenerator'> {
  const c = comm.trim();
  if (c === 'postgres') return 'postgres';
  if (TEXTERKENNUNG.has(c)) return 'texterkennung';
  if (BILDER.has(c)) return 'bilder';
  // ocrmypdf läuft in Python; der Name ist dann „python3“. Nur ob es vorkommt – die Befehlszeile selbst bleibt hier.
  if (/^python/.test(c) && /ocrmypdf/.test(befehl() ?? '')) return 'texterkennung';
  return 'rest';
}

const USER_HZ = 100;
export interface ProzessStat { comm: string; ppid: number; eigen: number; kinder: number; start: number }

/** Eine Zeile aus /proc/<pid>/stat: Name, Elternprozess, eigene und Kinder-Rechenzeit (Sekunden), Startzeit. */
export function liesStat(text: string | null): ProzessStat | null {
  if (!text) return null;
  const a = text.indexOf('('), z = text.lastIndexOf(')');
  if (a < 0 || z < a) return null;
  const f = text.slice(z + 2).trim().split(/\s+/);
  // f[0] ist Feld 3 (state): ppid Feld 4, utime … cstime 14–17, starttime 22.
  const n = (i: number) => Number(f[i]);
  const w = [n(1), n(11), n(12), n(13), n(14), n(19)];
  if (!w.every(Number.isFinite)) return null;
  return { comm: text.slice(a + 1, z), ppid: w[0], eigen: (w[1] + w[2]) / USER_HZ, kinder: (w[3] + w[4]) / USER_HZ, start: w[5] };
}

const rssMb = (text: string | null) => { const kb = text?.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1]; return kb ? Number(kb) / KB : 0; };

function allePids(): number[] {
  try { return readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number); } catch { return []; }
}

export interface Bekannt {
  ablago: Array<{ nr: number; pid: number; rolle: 'haupt' | 'leiter' | 'anfragen' }>;
  lastgenerator: number | null;
}

interface Vorher { start: number; eigen: number; kinder: number; ppid: number; gruppe: string }

/** Je Prozess, der fragt (im Leiter): fortlaufende Rechenzeit je Gruppe. */
export class Prozessgruppen {
  private vorher = new Map<number, Vorher>();
  private summen = new Map<string, number>();
  private erste = true;

  constructor(private o: { lies?: Leser; pids?: () => number[]; postgresImContainer: boolean; jetzt?: () => number }) {}

  stand(b: Bekannt): GruppenStand {
    const lies = this.o.lies ?? dateiLeser;
    const pids = (this.o.pids ?? allePids)();
    if (!pids.length || (!this.o.pids && lies('/proc/self/stat') === null)) return { verfuegbar: false };
    const ablago = new Map(b.ablago.map((p) => [p.pid, p]));
    const gruppeVon = (pid: number, s: ProzessStat): string => {
      const a = ablago.get(pid);
      if (a) return `ablago:${a.nr}`;
      if (b.lastgenerator && pid === b.lastgenerator) return 'lastgenerator';
      return artNachName(s.comm, () => lies(`/proc/${pid}/cmdline`)?.replace(/\0/g, ' ') ?? null);
    };
    const jetzt = new Map<number, Vorher>();
    const anzahl = new Map<string, number>();
    const mb = new Map<string, number>();
    const plus = (m: Map<string, number>, k: string, x: number) => m.set(k, (m.get(k) ?? 0) + x);
    for (const pid of pids) {
      const s = liesStat(lies(`/proc/${pid}/stat`));
      if (!s) continue;
      const g = gruppeVon(pid, s);
      jetzt.set(pid, { start: s.start, eigen: s.eigen, kinder: s.kinder, ppid: s.ppid, gruppe: g });
      plus(anzahl, g, 1);
      plus(mb, g, rssMb(lies(`/proc/${pid}/status`)));
    }
    if (!jetzt.size) return { verfuegbar: false };
    if (!this.erste) {
      // Beendete seit der letzten Frage, nach Elternprozess: was sie zuletzt hatten und welcher Gruppe sie angehörten.
      const beendet = new Map<number, { summe: number; gruppen: Set<string> }>();
      for (const [pid, v] of this.vorher) {
        const n = jetzt.get(pid);
        if (n && n.start === v.start) continue;
        const e = beendet.get(v.ppid) ?? { summe: 0, gruppen: new Set<string>() };
        e.summe += v.eigen + v.kinder; e.gruppen.add(v.gruppe);
        beendet.set(v.ppid, e);
      }
      for (const [pid, n] of jetzt) {
        const v = this.vorher.get(pid);
        const gleich = v && v.start === n.start;
        // Eigene Rechenzeit: Unterschied, bei neuen Prozessen alles (sie starteten nach der letzten Frage).
        plus(this.summen, n.gruppe, Math.max(0, n.eigen - (gleich ? v.eigen : 0)));
        // Beendete Kinder: Zuwachs von cutime + cstime ohne das, was bei ihnen schon gezählt war.
        const zuwachs = n.kinder - (gleich ? v.kinder : 0);
        const e = beendet.get(pid);
        const rest = zuwachs - (gleich ? e?.summe ?? 0 : 0);
        if (gleich && rest > 0.005) {
          const g = n.gruppe === 'postgres' || n.gruppe === 'lastgenerator' ? n.gruppe : e && e.gruppen.size === 1 ? [...e.gruppen][0] : 'rest';
          plus(this.summen, g, rest);
        }
      }
    }
    this.erste = false;
    this.vorher = jetzt;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const schluessel = new Set([...anzahl.keys(), ...this.summen.keys()]);
    const gruppen: GruppenWert[] = [];
    for (const k of schluessel) {
      const [art, nr] = k.split(':') as [GruppenArt, string | undefined];
      const p = nr === undefined ? undefined : b.ablago.find((x) => x.nr === Number(nr));
      // Ablago-Prozesse, die es nicht mehr gibt (Neustart unter derselben Nummer bleibt), und leere Gruppen ohne Zeit weg.
      if (art === 'ablago' && !p && !anzahl.get(k)) continue;
      gruppen.push({ art, ...(nr !== undefined ? { nr: Number(nr), rolle: p?.rolle ?? (Number(nr) === 0 ? 'haupt' : Number(nr) === 1 ? 'leiter' : 'anfragen') } : {}), anzahl: anzahl.get(k) ?? 0, cpuSekunden: r2(this.summen.get(k) ?? 0), mb: Math.round(mb.get(k) ?? 0) });
    }
    gruppen.sort((a, b2) => GRUPPEN_FOLGE.indexOf(a.art) - GRUPPEN_FOLGE.indexOf(b2.art) || (a.nr ?? 0) - (b2.nr ?? 0));
    return { verfuegbar: true, zeit: (this.o.jetzt ?? Date.now)(), postgresImContainer: this.o.postgresImContainer, gruppen };
  }
}
