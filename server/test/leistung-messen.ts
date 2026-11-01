/**
 * Messungen für die Leistung (#367): gemeinsam für `leistung.test.ts` (Messlatte, nur Warnung)
 * und das Mess-Skript `leistungsmessung.ts`.
 */
import type postgres from 'postgres';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { KontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';

/** Messlatte (#367, Entwicklerhandbuch „Leistung“): bei 10.000 Mappen / 30.000 Dokumenten. */
export const MESSLATTE_MS = { mappeOeffnen: 200, dokumentliste: 200 } as const;

export interface Zeit { name: string; median: number; max: number }

async function stoppe(name: string, f: () => Promise<unknown>, n = 7): Promise<Zeit> {
  await f(); // aufwärmen
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); await f(); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  return { name, median: t[Math.floor(n / 2)], max: t[n - 1] };
}

/** Repo, das Aufrufe und Zeit je Methode zählt (wie die Messung im Betrieb, ohne Speicher). */
export function zaehlend<T extends object>(repo: T) {
  const je = new Map<string, { n: number; ms: number }>();
  const proxy = new Proxy(repo, {
    get(ziel, prop, e) {
      const w = Reflect.get(ziel, prop, e);
      if (typeof w !== 'function') return w;
      return async (...args: unknown[]) => {
        const s = performance.now();
        try { return await w.apply(ziel, args); }
        finally { const x = je.get(String(prop)) ?? { n: 0, ms: 0 }; x.n++; x.ms += performance.now() - s; je.set(String(prop), x); }
      };
    },
  });
  return {
    repo: proxy as T, je: () => je, zuruecksetzen: () => je.clear(),
    aufrufe: () => [...je.values()].reduce((a, b) => a + b.n, 0), zeit: () => [...je.values()].reduce((a, b) => a + b.ms, 0),
  };
}

/** Typische Ziele: Mappe mit dem meisten Volltext, größtes Dokument, Mappe mit den meisten Rückverweisen. */
export async function ziele(sql: postgres.Sql) {
  const [m] = await sql`SELECT mappe_id FROM dokumente WHERE volltext IS NOT NULL GROUP BY mappe_id ORDER BY count(*) DESC, sum(octet_length(volltext)) DESC, mappe_id LIMIT 1`;
  const [d] = await sql`SELECT id FROM dokumente WHERE volltext IS NOT NULL ORDER BY octet_length(volltext) DESC, id LIMIT 1`;
  const [r] = await sql`SELECT ziel_id, count(*)::int AS n FROM verweise GROUP BY ziel_id ORDER BY count(*) DESC, ziel_id LIMIT 1`;
  const ids = (await sql`SELECT id FROM mappen ORDER BY id LIMIT 5000`).map((x) => x.id as string);
  return { mappeMitDokumenten: m?.mappe_id as string, dokument: d?.id as string, verwiesen: r?.ziel_id as string, rueckverweise: (r?.n as number) ?? 0, ids };
}

/**
 * Misst die Zugriffe aus #367. Mit `explain` zusätzlich die Pläne der zugehörigen SQL-Anweisungen
 * (so, wie sie in repo-pg.ts stehen).
 */
export async function messeAbfragen(sql: postgres.Sql, repo: Repo, konten: KontoRepo, benutzerId: string, o: { explain?: boolean; n?: number } = {}) {
  const z = await ziele(sql);
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const typ = (await repo.listeTypen()).find((t) => !t.system)!;
  const n = o.n ?? 7;
  const zeiten: Zeit[] = [
    await stoppe('Mappe öffnen (Dienst.holeMappe, Mappe mit Dokumenten)', () => d.holeMappe(z.mappeMitDokumenten), n),
    await stoppe(`Mappe öffnen (Dienst.holeMappe, ${z.rueckverweise} Rückverweise)`, () => d.holeMappe(z.verwiesen), n),
    await stoppe('mappen.listeDokumente', () => repo.listeDokumente(z.mappeMitDokumenten), n),
    await stoppe('mappen.holeDokument', () => repo.holeDokument(z.dokument), n),
    await stoppe('mappen.volltext (größtes Dokument)', () => repo.volltext(z.dokument), n),
    await stoppe(`mappen.rueckverweise (${z.rueckverweise})`, () => repo.rueckverweise(z.verwiesen), n),
    await stoppe('mappen.bezuege (20 Ids)', () => repo.bezuege(z.ids.slice(0, 20)), n),
    await stoppe('mappen.bezuege (5.000 Ids)', () => repo.bezuege(z.ids), n),
    await stoppe('mappen.seite (Typ-Liste, 50)', () => repo.seite({ typId: typ.id, von: 0, anzahl: 50 }), n),
    await stoppe('konto.legeSitzungAn', () => konten.legeSitzungAn(`messung-${Math.random()}`, benutzerId, new Date(Date.now() + 3600_000), { geraet: 'Messung', ip: '127.0.0.1' }), n),
  ];
  const plaene: Array<{ name: string; plan: string }> = [];
  if (o.explain) {
    const plan = async (name: string, text: string, werte: unknown[]) => {
      const r = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${text}`, werte as never[]);
      plaene.push({ name, plan: r.map((x) => String(x['QUERY PLAN']).slice(0, 160)).join('\n') });
    };
    const DOKUMENT_SPALTEN_MESSUNG = await dokumentSpalten();
    const h = '00000000-0000-4000-8000-000000000001';
    await plan('listeDokumente', `SELECT ${DOKUMENT_SPALTEN_MESSUNG}, (SELECT count(*) FROM dokument_versionen v WHERE v.dokument_id = d.id) AS aeltere
      FROM dokumente d WHERE d.haushalt_id = $1 AND d.mappe_id = $2 ORDER BY d.erstellt DESC`, [h, z.mappeMitDokumenten]);
    await plan('volltext', 'SELECT volltext FROM dokumente WHERE haushalt_id = $1 AND id = $2', [h, z.dokument]);
    await plan('rueckverweise', `SELECT v.quelle_id, v.feld_key, m.typ_id, m.titel FROM verweise v JOIN mappen m ON m.id = v.quelle_id
      WHERE v.ziel_id = $1 AND v.haushalt_id = $2 ORDER BY lower(m.titel), m.id`, [z.verwiesen, h]);
    await plan('bezuege (5.000 Ids)', 'SELECT id, typ_id, titel FROM mappen WHERE haushalt_id = $1 AND id = ANY($2::uuid[])', [h, z.ids]);
    await sql.begin(async (tx) => {
      const r = await tx.unsafe(`EXPLAIN (ANALYZE, BUFFERS) INSERT INTO sitzungen (schluessel_hash, benutzer_id, ablauf, geraet, ip, vertretung_id)
        VALUES ('explain', $1, now() + interval '1 hour', 'Messung', '127.0.0.1', NULL)`, [benutzerId]);
      plaene.push({ name: 'legeSitzungAn (INSERT)', plan: r.map((x) => x['QUERY PLAN']).join('\n') });
      const r2 = await tx.unsafe('EXPLAIN (ANALYZE, BUFFERS) DELETE FROM sitzungen WHERE ablauf < now()');
      plaene.push({ name: 'legeSitzungAn (DELETE abgelaufene)', plan: r2.map((x) => x['QUERY PLAN']).join('\n') });
      throw new Rollback();
    }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
  }
  return { zeiten, plaene, ziele: z };
}
class Rollback extends Error {}

/** Spalten, die `listeDokumente` liest – für den Plan (wie in repo-pg.ts; vor #367 `d.*`). */
async function dokumentSpalten(): Promise<string> {
  const m = await import('../src/repo-pg') as { DOKUMENT_SPALTEN?: readonly string[] };
  return m.DOKUMENT_SPALTEN ? m.DOKUMENT_SPALTEN.map((c) => `d.${c}`).join(', ') : 'd.*';
}
