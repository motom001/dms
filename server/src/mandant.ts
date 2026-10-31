import type postgres from 'postgres';
import type { Anbindung } from './anbindung';
import { protokoll } from './protokoll';

/**
 * Mandant (#119): früher „Haushalt“ (intern weiter haushalt_id). Seine Id steht in der Datei der
 * Datenbank-Anbindung; die Umgebungsvariable HAUSHALT_ID entfällt und wird einmalig übernommen.
 */
export const STANDARD_MANDANT = '00000000-0000-4000-8000-000000000001';
const log = protokoll.modul('system');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MandantErgebnis { id: string; quelle: 'datei' | 'umgebung' | 'bestand' | 'neu'; hinweis: string | null }

/**
 * Bestimmt die Id und merkt sie in der Anbindung:
 *   1. aus der Datei (führend),
 *   2. sonst HAUSHALT_ID (bisherige Installationen mit eigener Id),
 *   3. sonst der Mandant, der schon Benutzer hat (bisherige Installationen),
 *   4. sonst der Standard-Mandant aus der ersten Migration (frische Installation; für ihn legen
 *      die Migrationen Designs und Einstellungen an).
 */
export async function bestimmeMandant(sql: postgres.Sql, a: Anbindung, env: Record<string, string | undefined>, speichern: (a: Anbindung) => Promise<void>): Promise<MandantErgebnis> {
  const ausEnv = env.HAUSHALT_ID && UUID.test(env.HAUSHALT_ID) ? env.HAUSHALT_ID.toLowerCase() : null;
  if (env.HAUSHALT_ID && !ausEnv) log.warn('HAUSHALT_ID ist keine gültige Id und wird ignoriert');
  let e: MandantErgebnis;
  if (a.mandant && UUID.test(a.mandant)) {
    e = { id: a.mandant, quelle: 'datei', hinweis: ausEnv ? (ausEnv === a.mandant ? 'HAUSHALT_ID ist nicht mehr nötig und kann aus der Compose-Datei entfernt werden.' : 'HAUSHALT_ID weicht von der Id des Haushalts ab und wird ignoriert; sie kann aus der Compose-Datei entfernt werden.') : null };
  } else if (ausEnv) {
    e = { id: ausEnv, quelle: 'umgebung', hinweis: 'HAUSHALT_ID wurde übernommen und kann aus der Compose-Datei entfernt werden.' };
  } else {
    const [r] = await sql`SELECT haushalt_id, count(*)::int AS n FROM benutzer GROUP BY haushalt_id ORDER BY n DESC, (haushalt_id = ${STANDARD_MANDANT}) DESC LIMIT 1`;
    e = r ? { id: String(r.haushalt_id), quelle: 'bestand', hinweis: null } : { id: STANDARD_MANDANT, quelle: 'neu', hinweis: null };
  }
  await sql`INSERT INTO haushalte (id, name) VALUES (${e.id}, 'Mandant') ON CONFLICT (id) DO NOTHING`;
  if (a.mandant !== e.id) {
    await speichern({ ...a, mandant: e.id });
    a.mandant = e.id;
    log.info(e.quelle === 'neu' ? 'Neuer Haushalt angelegt' : 'Id des Haushalts in der Anbindung gemerkt', { mandant: e.id, quelle: e.quelle });
  }
  return e;
}

export function mandantNamen(sql: postgres.Sql, id: string) {
  return {
    async name() { const [r] = await sql`SELECT name FROM haushalte WHERE id = ${id}`; return r ? String(r.name) : null; },
    async umbenennen(name: string) { await sql`UPDATE haushalte SET name = ${name} WHERE id = ${id}`; },
  };
}
