/**
 * Mess-Skript der Suche (#356, #400): Laufzeit typischer Suchen bei vielen Mappen, wiederholbar mit festem Startwert.
 * Kein Test – von Hand starten (aus `server/`):
 *
 *   MESS_DATABASE_URL=postgres://postgres:dms@127.0.0.1:5432/dmssuche \
 *     node --import tsx test/suche-messen.ts [--neu] [--mappen 50000] [--migrieren] [--laeufe 5]
 *
 * `--neu` legt die Datenbank neu an (ACHTUNG: löscht sie) mit Demo-Mappen und je Mappe mit Dokumentenregister
 * 1–2 Dokumenten (2–8 KB Volltext). `--migrieren` führt fehlende Migrationen aus und misst ihre Dauer (Neuaufbau
 * des Suchindex). Ausgabe: Markdown-Tabelle (Median aus `--laeufe` Läufen, nach einem Aufwärmlauf) mit der Trefferzahl.
 */
import { ausUrl, alsUrl, legeDatenbankAn } from '../src/anbindung';
import { speicherDateien } from '../src/dateispeicher';
import { verbinde, migriere } from '../src/db';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { pgRepo } from '../src/repo-pg';
import { baueLeistungsdaten, BENUTZER, HAUSHALT } from './leistung-daten';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const url = process.env.MESS_DATABASE_URL ?? 'postgres://postgres:dms@127.0.0.1:5432/dmssuche';
const a = ausUrl(url)!;
const laeufe = Number(arg('--laeufe') ?? 5);
const migrationen = new URL('../migrations', import.meta.url).pathname;

if (process.argv.includes('--neu')) {
  const admin = verbinde(alsUrl(a, 'postgres'));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`);
  await admin.end();
  await legeDatenbankAn(a);
}
const sql = verbinde(url);
try {
  if (process.argv.includes('--neu')) {
    await migriere(sql, migrationen, () => {});
    const t0 = Date.now();
    const r = await baueLeistungsdaten(sql, speicherDateien(), {
      mappen: Number(arg('--mappen') ?? 50_000), startwert: 'suche-356', dokumente: { von: 1, bis: 2 }, text: { von: 2_000, bis: 8_000 }, log: (m) => console.error(m),
    });
    console.error(`Daten erzeugt in ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(r)}`);
  }
  if (process.argv.includes('--migrieren')) {
    const t0 = Date.now();
    await migriere(sql, migrationen, (m) => console.error(m));
    console.log(`Migrationen: ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  }
  const [stand] = await sql`SELECT (SELECT count(*) FROM mappen)::int AS mappen, (SELECT count(*) FROM dokumente)::int AS dokumente,
    pg_size_pretty(pg_total_relation_size('dokumente')) AS groesse, (SELECT max(name) FROM schema_migrationen) AS migration`;
  console.log(`Datenbestand: ${stand.mappen} Mappen, ${stand.dokumente} Dokumente, Tabelle dokumente ${stand.groesse}, Migration ${stand.migration}\n`);

  const d = new Dienst(pgRepo(sql, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const ich = { id: BENUTZER, rolle: 'admin' };
  const [rechnung] = await sql`SELECT id FROM mappentypen WHERE haushalt_id = ${HAUSHALT} AND name = 'Rechnung'`;
  const faelle: Array<[string, Record<string, unknown>]> = [
    ['Liste Rechnung, Titel und Werte „Strom“ (kein Treffer)', { sicht: `typ:${rechnung.id}`, suche: 'Strom' }],
    // Die Messdaten haben einen kleinen Wortschatz: Wörter wie „Kündigung“ stehen in fast jedem Dokument (schlimmster
    // Fall), Zahlen wie „4711“ nur in wenigen (typischer Fall).
    ['Alle Mappen, Volltext seltenes Wort „4711“', { sicht: 'suche', link: '', suche: '4711', volltext: 'true' }],
    ['Alle Mappen, Volltext häufiges Wort „Kündigung“', { sicht: 'suche', link: '', suche: 'Kündigung', volltext: 'true' }],
    ['Alle Mappen, Volltext „Kundigung“ (ohne Umlaut)', { sicht: 'suche', link: '', suche: 'Kundigung', volltext: 'true' }],
    ['Alle Mappen, Volltext „Lastschrfit“ (Tippfehler)', { sicht: 'suche', link: '', suche: 'Lastschrfit', volltext: 'true' }],
    ['Erweiterte Suche: Rechnung + Volltext „4711“', { sicht: 'suche', link: 'typ=Rechnung&volltext=4711&in=dokumente' }],
  ];
  console.log('| Suche | Treffer | Median ms | Max ms |\n|---|---:|---:|---:|');
  for (const [name, q] of faelle) {
    let n = 0;
    const f = async () => { const r = await d.sichten.seite(ich, { ...q, von: 0, anzahl: 100 }); n = r.gesamt; };
    if (laeufe > 1) await f();
    const t: number[] = [];
    for (let i = 0; i < laeufe; i++) { const s = performance.now(); await f(); t.push(performance.now() - s); }
    t.sort((x, y) => x - y);
    console.log(`| ${name} | ${n} | ${t[Math.floor(laeufe / 2)].toFixed(0)} | ${t[laeufe - 1].toFixed(0)} |`);
  }
} finally {
  await sql.end();
}
