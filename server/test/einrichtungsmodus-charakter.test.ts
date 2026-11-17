/**
 * Charakterisierung von `einrichtungsmodus` (#1278, Schritt 6b-1): Vor dem Zerlegen der langen Funktion hält dieser
 * Test fest, wie der Einrichtungsmodus antwortet – Sprache, Stand mit und ohne Code, jede Route des Assistenten mit
 * ihren Fehlern, die Oberfläche, das Übernehmen mit dem Mandanten der Vorbelegung und das Weiterversuchen einer
 * vorhandenen Anbindung im Hintergrund.
 *
 * Erwartung: `test/charakter/einrichtungsmodus.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/einrichtungsmodus-charakter.test.ts` – dann den
 * Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Anbindung, Pruefung } from '../src/datenbank/anbindung';
import { Einrichtungscode } from '../src/einrichtung/einrichtungscode';
import { einrichtungsmodus } from '../src/einrichtung/einrichtungsmodus';

const DATEI = fileURLToPath(new URL('./charakter/einrichtungsmodus.json', import.meta.url));
const ordner = () => mkdtemp(join(tmpdir(), 'dms-einrichtungsmodus-'));
const port = () => 4800 + Math.floor(Math.random() * 1000);
const OK: Pruefung = { ok: true, postgres: '17', eingerichtet: false, benutzer: 0 } as Pruefung;
const NEIN = { ok: false, art: 'verbindung', text: 'Keine Verbindung.' } as unknown as Pruefung;

/** Antwort ohne wechselnde Teile: Status, ausgewählte Köpfe, Körper (Stand-Kennung ersetzt). */
async function antwort(r: Response) {
  const text = await r.text();
  return {
    status: r.status,
    koepfe: Object.fromEntries(
      ['cache-control', 'content-type', 'retry-after', 'x-frame-options', 'content-security-policy']
        .filter((k) => r.headers.has(k))
        .map((k) => [k, k === 'content-security-policy' ? 'ja' : r.headers.get(k)]),
    ),
    body: r.headers.get('content-type')?.startsWith('application/json') ? text.replace(/"stand":"[^"]*"/, '"stand":"X"') : text.length,
  };
}

async function warteAufCode(o: string) {
  for (let i = 0; i < 100 && !existsSync(join(o, 'EINRICHTUNGSCODE')); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 100));
  return (await readFile(join(o, 'EINRICHTUNGSCODE'), 'utf8')).trim();
}

describe('Einrichtungsmodus (#1278, Schritt 6b-1)', async () => {
  const ist: Record<string, unknown> = {};

  // Assistent mit Oberfläche, Vorbelegung aus einer Datei und allen Routen.
  {
    const o = await ordner();
    const web = await ordner();
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>Einrichtung</title>');
    const p = port();
    const url = `http://127.0.0.1:${p}`;
    const vorbelegt: Anbindung = { host: 'alt', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'p', mandant: 'm1' } as Anbindung;
    const geprueft: unknown[] = [];
    let anlegenScheitert = true;
    const fertig = einrichtungsmodus({
      geheim: o,
      code: new Einrichtungscode(o),
      vorbelegt,
      quelle: 'datei',
      fehler: 'Verbindung abgelehnt',
      port: p,
      host: '127.0.0.1',
      webDir: web,
      pruefe: async (a) => {
        geprueft.push({ host: a.host, mandant: (a as { mandant?: string }).mandant ?? null });
        return a.host === 'gut' ? OK : NEIN;
      },
      anlegen: async () => {
        if (anlegenScheitert) throw new Error('Keine Rechte zum Anlegen.');
      },
    });
    const c = await warteAufCode(o);
    const post = (pfad: string, body: unknown, koepfe: Record<string, string> = { 'x-dms': '1', 'x-einrichtungscode': c }) =>
      fetch(url + pfad, { method: 'POST', headers: { 'content-type': 'application/json', ...koepfe }, body: JSON.stringify(body) });
    const eingabe = (host: string) => ({ anbindung: { host, port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'x' } });
    ist['sprache'] = await antwort(await fetch(`${url}/api/sprache`));
    ist['sprache englisch'] = await antwort(await fetch(`${url}/api/sprache`, { headers: { 'x-sprache': 'en' } }));
    ist['status englisch'] = await antwort(await fetch(`${url}/api/konto/status`, { headers: { 'x-sprache': 'en' } }));
    ist['sprache zurück'] = await antwort(await fetch(`${url}/api/sprache`, { headers: { 'x-sprache': 'de' } }));
    ist['status ohne Code'] = await antwort(await fetch(`${url}/api/konto/status`));
    ist['status mit Code'] = await antwort(await fetch(`${url}/api/konto/status`, { headers: { 'x-einrichtungscode': c } }));
    ist['gesundheit'] = await antwort(await fetch(`${url}/api/gesundheit`));
    ist['code ohne Kennung'] = await antwort(await post('/api/einrichtung/code', {}, { 'x-einrichtungscode': c }));
    ist['code falsch'] = await antwort(await post('/api/einrichtung/code', {}, { 'x-dms': '1', 'x-einrichtungscode': 'FALSCH' }));
    ist['code'] = await antwort(await post('/api/einrichtung/code', {}));
    ist['pruefen'] = await antwort(await post('/api/einrichtung/datenbank/pruefen', eingabe('neu')));
    ist['pruefen ohne Angaben'] = await antwort(await post('/api/einrichtung/datenbank/pruefen', {}));
    ist['anlegen scheitert'] = await antwort(await post('/api/einrichtung/datenbank/anlegen', eingabe('neu')));
    anlegenScheitert = false;
    ist['anlegen'] = await antwort(await post('/api/einrichtung/datenbank/anlegen', eingabe('gut')));
    ist['uebernehmen scheitert'] = await antwort(await post('/api/einrichtung/datenbank/uebernehmen', eingabe('schlecht')));
    ist['status nach Fehlschlag'] = await antwort(await fetch(`${url}/api/konto/status`, { headers: { 'x-einrichtungscode': c } }));
    ist['datei lesen leer'] = await antwort(await post('/api/einrichtung/datei/lesen', { text: '' }));
    ist['sonst 503'] = await antwort(await fetch(`${url}/api/mappen`));
    ist['oberflaeche'] = await antwort(await fetch(`${url}/`));
    ist['oberflaeche tief'] = await antwort(await fetch(`${url}/werkbank/irgendwo`));
    ist['uebernehmen'] = await antwort(await post('/api/einrichtung/datenbank/uebernehmen', eingabe('gut')));
    ist['status startet'] = await antwort(await fetch(`${url}/api/konto/status`));
    const a = await fertig;
    ist['ergebnis'] = a;
    ist['geprueft'] = geprueft;
    ist['port frei'] = await fetch(`${url}/api/gesundheit`).then(
      () => false,
      () => true,
    );
  }

  // Vorhandene Anbindung aus DATABASE_URL: im Hintergrund weiter versuchen, bis die Datenbank antwortet.
  {
    const o = await ordner();
    const p = port();
    let versuche = 0;
    const kandidat: Anbindung = { host: 'spaet', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'p' } as Anbindung;
    const a = await einrichtungsmodus({
      geheim: o,
      code: new Einrichtungscode(o),
      vorbelegt: kandidat,
      quelle: 'umgebung',
      fehler: null,
      port: p,
      host: '127.0.0.1',
      wiederholenMs: 20,
      pruefe: async () => (++versuche < 3 ? NEIN : OK),
    });
    ist['wiederholt'] = { ergebnis: a, mindestensDreiVersuche: versuche >= 3 };
  }

  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(DATEI), { recursive: true });
    writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
  }
  const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {};
  it('alle Fälle sind festgehalten', () => assert.deepEqual(Object.keys(ist).sort(), Object.keys(soll).sort()));
  for (const name of Object.keys(ist)) it(name, () => assert.deepEqual(ist[name], soll[name]));
});
