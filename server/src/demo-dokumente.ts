import {
  DOKUMENTARTEN,
  MAX_DUPLIKATE,
  MAX_JE_MAPPE,
  MISCHUNGEN,
  STUFEN,
  type DokumentOptionen,
  type Mischung,
  type Stufe,
} from '../../shared/src/demodaten';
import { Fachfehler } from './fehler';

/**
 * Demo-Dokumente für Wachstumstests (#248): Prüfung der Optionen. Die Dateien selbst entstehen in der
 * PDF-Stelle (`pdf/demo-dokumente.ts`, #541).
 */
export { erzeugeDokument, kannRastern, png, type ErzeugtesDokument, type MappenInhalt } from './pdf';

// Arten, Mischungen, Erwartungswerte und die Abschätzung liegen in shared (#365), damit die Oberfläche live rechnet.
export {
  DOKUMENTARTEN,
  ERWARTUNG,
  MAX_JE_MAPPE,
  MISCHUNGEN,
  STUFEN,
  schaetze,
  type Abschaetzung,
  type DokumentOptionen,
  type Dokumentart,
  type Mischung,
  type Stufe,
} from '../../shared/src/demodaten';

export function pruefeDokumentOptionen(x: unknown): DokumentOptionen | null {
  if (x == null || x === false) return null;
  const o = (typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const zahl = (v: unknown, std: number, min: number, max: number, name: string) => {
    const n = v === undefined || v === '' ? std : Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Fachfehler(422, `${name}: bitte eine Zahl von ${min} bis ${max}.`);
    return n;
  };
  const anteil = zahl(o.anteil, 30, 0, 100, 'Anteil der Mappen mit Dokumenten');
  const von = Math.round(zahl(o.von, 1, 1, MAX_JE_MAPPE, 'Dokumente je Mappe (von)'));
  const bis = Math.round(zahl(o.bis, 3, 1, MAX_JE_MAPPE, 'Dokumente je Mappe (bis)'));
  if (bis < von) throw new Fachfehler(422, 'Dokumente je Mappe: „bis“ darf nicht kleiner als „von“ sein.');
  const stufe = STUFEN.includes(o.stufe as Stufe) ? (o.stufe as Stufe) : 'realistisch';
  const m = (o.mischung && typeof o.mischung === 'object' ? o.mischung : MISCHUNGEN[stufe]) as Record<string, unknown>;
  const mischung = Object.fromEntries(DOKUMENTARTEN.map((a) => [a, zahl(m[a] ?? 0, 0, 0, 100, `Anteil ${a}`)])) as Mischung;
  if (!DOKUMENTARTEN.some((a) => mischung[a] > 0)) throw new Fachfehler(422, 'Bitte mindestens eine Art von Dokumenten wählen.');
  return { anteil, von, bis, mischung, duplikate: zahl(o.duplikate, 0, 0, MAX_DUPLIKATE, 'Anteil Duplikate') };
}
