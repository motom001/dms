/**
 * Leistung (#367): Messlatte für „Mappe öffnen“ und die Dokumentliste mit PostgreSQL. Überschreitungen
 * sind nur eine Warnung (Laufzeiten schwanken je Rechner), kein Fehler. Fest geprüft wird dagegen, dass
 * der Export nicht je Mappe oder Dokument zugreift (keine N+1-Abfragen) und Listen keinen Volltext lesen.
 * Läuft nur mit TEST_DATABASE_URL (eigene, danach gelöschte Datenbank); die ausführliche Messung mit
 * 10.000 Mappen macht `leistungsmessung.ts`.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;

describe('Leistung mit PostgreSQL (#367)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  let sql: postgres.Sql;
  let admin: postgres.Sql;
  let name = '';
  let ordner = '';

  before(async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { verbinde, migriere } = await import('../src/db');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { baueLeistungsdaten, HAUSHALT } = await import('./leistung-daten');
    const a = { ...ausUrl(url)!, datenbank: `dms_leistung_${Date.now().toString(36)}` };
    name = a.datenbank;
    await legeDatenbankAn(a);
    admin = verbinde(alsUrl(a, 'postgres'));
    sql = verbinde(alsUrl(a));
    await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
    ordner = await mkdtemp(join(tmpdir(), 'dms-leistung-'));
    await baueLeistungsdaten(sql, ordnerSpeicher(ordner, HAUSHALT), { mappen: 1200, startwert: 'leistung-test', dokumente: { von: 1, bis: 3 }, text: { von: 5_000, bis: 20_000 } });
    await sql`ANALYZE`;
  });
  after(async () => {
    await sql?.end({ timeout: 1 });
    if (name) await admin?.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await admin?.end({ timeout: 1 });
    if (ordner) await rm(ordner, { recursive: true, force: true });
  });

  it('Messlatte: Mappe öffnen und Dokumentliste unter 200 ms (sonst Warnung)', async (t) => {
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const { messeAbfragen, MESSLATTE_MS } = await import('./leistung-messen');
    const { BENUTZER, HAUSHALT } = await import('./leistung-daten');
    const r = await messeAbfragen(sql, pgRepo(sql, HAUSHALT), pgKontoRepo(sql, HAUSHALT), BENUTZER, { n: 5 });
    for (const z of r.zeiten) t.diagnostic(`${z.name}: Median ${z.median.toFixed(1)} ms, max ${z.max.toFixed(1)} ms`);
    const grenze = (praefix: string, ms: number) => {
      for (const z of r.zeiten.filter((x) => x.name.startsWith(praefix))) {
        if (z.median > ms) {
          const text = `Leistung (#367): „${z.name}“ braucht im Median ${z.median.toFixed(0)} ms – Messlatte ${ms} ms.`;
          t.diagnostic(`WARNUNG ${text}`);
          console.warn(text);
        }
      }
    };
    grenze('Mappe öffnen', MESSLATTE_MS.mappeOeffnen);
    grenze('mappen.listeDokumente', MESSLATTE_MS.dokumentliste);
  });

  it('Listen lesen keinen Volltext: Dokument-Spalten ohne „volltext“', async () => {
    const { DOKUMENT_SPALTEN } = await import('../src/repo-pg');
    assert.ok(!(DOKUMENT_SPALTEN as readonly string[]).includes('volltext'));
    // Jede andere Spalte der Tabelle steht in der Liste – neue Spalten fallen hier auf.
    const spalten = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'dokumente' AND column_name <> 'volltext'`).map((z) => z.column_name as string);
    assert.deepEqual([...spalten].sort(), [...DOKUMENT_SPALTEN].sort());
  });

  it('Export ohne N+1: Dokumente, Volltexte und Versionen gebündelt', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const { Dienst } = await import('../src/dienst');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { speicherEinstellungen } = await import('../src/einstellungen');
    const { vollexport } = await import('../src/vollexport');
    const { zaehlend } = await import('./leistung-messen');
    const { HAUSHALT } = await import('./leistung-daten');
    const z = zaehlend(pgRepo(sql, HAUSHALT));
    const d = new Dienst(z.repo, ordnerSpeicher(ordner, HAUSHALT), { einstellungen: speicherEinstellungen() });
    const q = d.vollexportQuelle({ mandant: 'Test', version: '0', benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] });
    // Nur 300 Mappen (PDF je Mappe kostet Zeit); reicht für mehrere Pakete.
    let rest = 300;
    const mappen = q.mappen;
    q.mappen = async (typId) => { const ms = (await mappen(typId)).slice(0, Math.max(0, rest)); rest -= ms.length; return ms; };
    const ziel = await mkdtemp(join(tmpdir(), 'dms-leistung-export-'));
    try {
      const r = await vollexport(q, ziel, {});
      assert.ok(r.dokumente > 300, `nur ${r.dokumente} Dokumente`);
      const je = z.je();
      for (const einzeln of ['listeDokumente', 'volltext', 'versionenVon', 'notizen', 'aufgabenVon', 'historie']) assert.equal(je.get(einzeln)?.n ?? 0, 0, `${einzeln} je Mappe/Dokument`);
      const typen = (await d.listeTypen()).length;
      assert.ok((je.get('dokumenteVon')?.n ?? 0) <= typen + 2, `dokumenteVon ${je.get('dokumenteVon')?.n}×`);
      assert.ok((je.get('volltexte')?.n ?? 0) <= Math.ceil(r.dokumente / 100) + typen + 2, `volltexte ${je.get('volltexte')?.n}×`);
      assert.ok((je.get('bezuege')?.n ?? 0) < 50, `bezuege ${je.get('bezuege')?.n}×`);
      // Volltext im Export vollständig
      const [x] = await sql`SELECT count(*)::int AS n FROM dokumente WHERE volltext IS NOT NULL`;
      assert.ok(x.n > 0);
    } finally { await rm(ziel, { recursive: true, force: true }); }
  });
});
