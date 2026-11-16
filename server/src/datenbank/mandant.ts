import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Anbindung } from './anbindung';
import { protokoll } from '../protokoll/protokoll';
import { VARIABLEN_GRUND } from '../../../shared/src/umgebungsvariablen';
import { t } from '../sprache/sprache';

/**
 * Mandant (#119): früher „Haushalt“ (intern weiter haushalt_id). Seine Id steht in der Datei der
 * Datenbank-Anbindung; die Umgebungsvariable HAUSHALT_ID entfällt und wird einmalig übernommen.
 */
export const STANDARD_MANDANT = '00000000-0000-4000-8000-000000000001';
const log = protokoll.modul('system');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MandantErgebnis {
  id: string;
  quelle: 'datei' | 'umgebung' | 'bestand' | 'neu';
  hinweis: string | null;
}

/**
 * Bestimmt die Id und merkt sie in der Anbindung:
 *   1. aus der Datei (führend),
 *   2. sonst HAUSHALT_ID (bisherige Installationen mit eigener Id),
 *   3. sonst der Mandant, der schon Benutzer hat (bisherige Installationen),
 *   4. sonst eine neue, zufällige Id (frische Installation, #814): Was die Migrationen für den Standard-Mandanten
 *      angelegt haben (Designs, Einstellungen), zieht auf die neue Id um. Bis 0.183 bekamen frische Installationen
 *      fest die Id des Standard-Mandanten – sie behalten sie, weil sie in der Anbindung steht (Fall 1).
 */
export async function bestimmeMandant(
  sql: postgres.Sql,
  a: Anbindung,
  env: Record<string, string | undefined>,
  speichern: (a: Anbindung) => Promise<void>,
): Promise<MandantErgebnis> {
  const ausEnv = env.HAUSHALT_ID && UUID.test(env.HAUSHALT_ID) ? env.HAUSHALT_ID.toLowerCase() : null;
  if (env.HAUSHALT_ID && !ausEnv) log.warn('HAUSHALT_ID ist keine gültige Id und wird ignoriert');
  let e: MandantErgebnis;
  if (a.mandant && UUID.test(a.mandant)) {
    e = {
      id: a.mandant,
      quelle: 'datei',
      hinweis: ausEnv
        ? ausEnv === a.mandant
          ? t('meldungen.mandant.haushalt-id-ist-nicht', { haushalt: VARIABLEN_GRUND.haushalt })
          : t('meldungen.mandant.haushalt-id-weicht-von')
        : null,
    };
  } else if (ausEnv) {
    e = {
      id: ausEnv,
      quelle: 'umgebung',
      hinweis: t('meldungen.mandant.haushalt-id-wurde-uebernommen', { haushalt: VARIABLEN_GRUND.haushalt }),
    };
  } else {
    const [r] =
      await sql`SELECT haushalt_id, count(*)::int AS n FROM benutzer WHERE art = 'person' GROUP BY haushalt_id ORDER BY n DESC, (haushalt_id = ${STANDARD_MANDANT}) DESC LIMIT 1`;
    e = r ? { id: String(r.haushalt_id), quelle: 'bestand', hinweis: null } : { id: await neuerMandant(sql), quelle: 'neu', hinweis: null };
  }
  await sql`INSERT INTO haushalte (id, name) VALUES (${e.id}, 'Mandant') ON CONFLICT (id) DO NOTHING`;
  if (a.mandant !== e.id) {
    await speichern({ ...a, mandant: e.id });
    a.mandant = e.id;
    log.info(e.quelle === 'neu' ? 'Neue Ablage angelegt' : 'Ablage-Id in der Anbindung gemerkt', { mandant: e.id, quelle: e.quelle });
  }
  return e;
}

/**
 * Frische Installation (#814): eine zufällige Ablage-Id statt der festen aus der ersten Migration. In einer Transaktion
 * zieht alles, was die Migrationen für den Standard-Mandanten angelegt haben, auf die neue Id um – jede Tabelle mit
 * einer Spalte haushalt_id –, danach fällt der Standard-Mandant weg.
 */
async function neuerMandant(sql: postgres.Sql): Promise<string> {
  const id = randomUUID();
  await sql.begin(async (tx) => {
    const [alt] = await tx`SELECT name FROM haushalte WHERE id = ${STANDARD_MANDANT}`;
    await tx`INSERT INTO haushalte (id, name) VALUES (${id}, ${alt ? String(alt.name) : 'Mandant'})`;
    const tabellen =
      await tx`SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'haushalt_id' AND table_name <> 'haushalte'`;
    // Alle diese Spalten verweisen nur auf haushalte(id), keine auf eine andere Tabelle – die Reihenfolge ist egal.
    for (const { table_name: t } of tabellen)
      await tx.unsafe(`UPDATE "${String(t).replace(/"/g, '""')}" SET haushalt_id = $1 WHERE haushalt_id = $2`, [id, STANDARD_MANDANT]);
    await tx`DELETE FROM haushalte WHERE id = ${STANDARD_MANDANT}`;
  });
  return id;
}

export function mandantNamen(sql: postgres.Sql, id: string) {
  return {
    async name() {
      const [r] = await sql`SELECT name FROM haushalte WHERE id = ${id}`;
      return r ? String(r.name) : null;
    },
    async umbenennen(name: string) {
      await sql`UPDATE haushalte SET name = ${name} WHERE id = ${id}`;
    },
  };
}
