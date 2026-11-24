/**
 * Testfälle der Leistungen (#1569) an einem Anbieter ausführen – Pflicht für jeden Anbieter, auch für Ablago selbst
 * (#1570). Dieselben Testfälle gehen mit der Ausgabe je Release an dms-registry, die Pakete damit prüft.
 */
import { leistung, type Datei, type Leistungsname, type Testdatei, TESTDATEIEN } from '../../../shared/src/leistungen';
import type { Anbieter } from './anbieter';
import { pruefeAusgabe } from './pruefen';

export interface Testergebnis {
  name: string;
  ok: boolean;
  grund?: string;
}

/** `{ testdatei: 'brief.pdf' }` überall durch die Datei ersetzen. */
async function mitDateien(w: unknown, lies: (n: Testdatei) => Promise<Uint8Array>): Promise<unknown> {
  if (Array.isArray(w)) return Promise.all(w.map((x) => mitDateien(x, lies)));
  if (!w || typeof w !== 'object') return w;
  const td = (w as { testdatei?: unknown }).testdatei;
  if (typeof td === 'string' && Object.hasOwn(TESTDATEIEN, td)) {
    const n = td as Testdatei;
    return { inhalt: await lies(n), mime: TESTDATEIEN[n], name: n } satisfies Datei;
  }
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) o[k] = await mitDateien(v, lies);
  return o;
}

/** Wert unter einem Pfad wie `codes[0].inhalt`. */
function unter(o: unknown, pfad: string): unknown {
  return pfad
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);
}

/** Alle Testfälle einer Leistung an einem Anbieter; ein Ergebnis je Testfall. */
export async function pruefeTestfaelle(
  a: Anbieter,
  n: Leistungsname,
  lies: (n: Testdatei) => Promise<Uint8Array>,
): Promise<Testergebnis[]> {
  const l = leistung(n);
  const r: Testergebnis[] = [];
  for (const f of l.testfaelle) {
    try {
      const eingabe = (await mitDateien(f.eingabe, lies)) as Record<string, unknown>;
      const aus = await a.fuehreAus({ leistung: n, eingabe, signal: AbortSignal.timeout(l.zeitgrenzeS * 1000) });
      pruefeAusgabe(l, a.id, aus);
      const e = f.erwartet;
      if (e.format && aus.datei?.mime !== e.format) throw new Error(`Format ${aus.datei?.mime ?? '–'} statt ${e.format}`);
      for (const [k, v] of Object.entries(e.daten ?? {}))
        if (JSON.stringify(unter(aus.daten, k)) !== JSON.stringify(v))
          throw new Error(`${k}: ${JSON.stringify(unter(aus.daten, k))} statt ${JSON.stringify(v)}`);
      for (const [k, v] of Object.entries(e.enthaelt ?? {})) {
        const x = unter(aus.daten, k);
        if (typeof x !== 'string' || !x.toLowerCase().includes(v.toLowerCase())) throw new Error(`${k} enthält „${v}“ nicht`);
      }
      r.push({ name: f.name, ok: true });
    } catch (x) {
      r.push({ name: f.name, ok: false, grund: (x as Error).message });
    }
  }
  return r;
}
