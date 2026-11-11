/**
 * Wege nach draußen (#723): eine gemeinsame Prüfstelle für alles, womit Dateien oder Daten Ablago verlassen –
 * Herunterladen (Dokument, Version, Fassung, Archivfassung, API), E-Mail (eine und mehrere Mappen), Export
 * (Tabelle, ZIP, PDF) und das WebDAV-Laufwerk.
 *
 * Die Regel ist überall dieselbe: **R heißt ansehen, E heißt mitnehmen.** Mitnehmen darf eine Mappe, wer sie
 * lesen darf (R am Mappentyp) und sie in mindestens einer Ansicht mit Exportrecht E sehen würde (Regel A aus
 * #294); Administratoren dürfen alles. Ansehen im Browser bleibt mit R möglich – ganz verhindern lässt sich das
 * Abspeichern beim Ansehen nie (Browser, Bildschirmfoto).
 *
 * Hier stehen nur die Regel und die Meldungen; Lesen und Exportrecht löst `ausgang.dienst.ts` auf
 * (`AusgangDienst.mitnehmbar`, `AusgangDienst.pruefeAusgang`, #1077). Alle Wege fragen diese beiden
 * (`dienst.ausgang.mitnehmbar`, `dienst.ausgang.pruefeAusgang`) – auch E-Mail und Export in diesem Ordner. So können die einzelnen
 * Wege nicht auseinanderlaufen.
 */
import { Fachfehler } from '../fehler';
import { t } from '../sprache';

export const AUSGAENGE = ['herunterladen', 'email', 'export', 'webdav'] as const;
export type Ausgang = typeof AUSGAENGE[number];

/** Was die Prüfstelle vom Dienst braucht: Lesen und Exportrecht je Mappe. */
export interface Ausgangsrechte {
  lesbar(ids: string[]): Promise<Set<string>>;
  exportierbar(ids: string[]): Promise<Set<string>>;
}

/** Welche dieser Mappen dürfen über diesen Weg hinaus? Lesen und Exportrecht – sonst keine. */
export async function mitnehmbar(r: Ausgangsrechte, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const lesbar = await r.lesbar(ids);
  const kandidaten = ids.filter((id) => lesbar.has(id));
  return kandidaten.length ? r.exportierbar(kandidaten) : new Set();
}

/** Die Meldung (403), wenn Mappen über diesen Weg nicht hinausdürfen; `anzahl` > 1 bei mehreren. */
export function verboten(ausgang: Ausgang, nicht: string[] = [], anzahl = 1): Fachfehler {
  const text = anzahl > 1 || nicht.length > 1 ? t.frei(`api.ausgang.${ausgang}.mehrere`, { anzahl: nicht.length || anzahl }) : t.frei(`api.ausgang.${ausgang}.eine`);
  return new Fachfehler(403, text, { ausgang, ...(nicht.length ? { nicht } : {}) });
}

/** Export aus einer Ansicht ohne Recht E an dieser Ansicht. */
export const sichtVerboten = () => new Fachfehler(403, t('api.ausgang.export.sicht'), { ausgang: 'export' });

/**
 * Alle Mappen müssen hinausdürfen (keine stillen Lücken): Nicht lesbare Mappen zählen wie nicht vorhandene (404,
 * bei einer einzelnen Mappe), sonst 403 mit den Ids, die nicht dürfen.
 */
export async function pruefeAlle(r: Ausgangsrechte, ausgang: Ausgang, ids: string[]): Promise<void> {
  const ok = await mitnehmbar(r, ids);
  const nicht = ids.filter((id) => !ok.has(id));
  if (!nicht.length) return;
  if (ids.length === 1 && !(await r.lesbar(ids)).has(ids[0])) throw new Fachfehler(404, t('meldungen.ausgang.diese-mappe-gibt-es'), { verborgen: true });
  throw verboten(ausgang, ids.length > 1 ? nicht : [], ids.length);
}
