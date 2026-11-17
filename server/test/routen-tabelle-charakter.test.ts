/**
 * Charakterisierung der Routentabelle (#1278, Schritt 6b-4a): Vor dem Aufteilen der langen Registrierfunktionen
 * (`anmeldungRouten`, `mappenRouten`, `kontenRouten`, `aufgabenRouten`, `exportRouten`, `datenschutzRouten`,
 * `sicherungRouten`, `typenRouten`) hält dieser Test fest, welche Routen `routen()` in welcher Reihenfolge liefert –
 * Methode, Pfad, Zugang und alle weiteren Angaben (roh, strom, api, lesend, ohneHead …) – und welche Hooks Fastify
 * daraus an jede Route hängt (Anmeldung, Rechte, Ratenbegrenzung, CSRF, aus `printRoutes`).
 *
 * Erwartung: `test/charakter/routen-tabelle.json`. Neu schreiben nur, wenn sich die Routen bewusst ändern:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/routen-tabelle-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { baueApp } from '../src/http/http';
import { routen } from '../src/http/routen';
import { Ueberlastschutz } from '../src/http/ueberlast';
import { Dienst } from '../src/dienst/dienst';
import { speicherRepo } from '../src/repo/speicher';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { Webdav } from '../src/webdav/webdav';

const DATEI = fileURLToPath(new URL('./charakter/routen-tabelle.json', import.meta.url));

/** `printRoutes` als Baum in volle Pfade zerlegen: „METHODE /pfad“ → Hooks als Text (wie in http-app-charakter). */
function routenMitHooks(baum: string): Map<string, string> {
  const routen = new Map<string, Record<string, string[]>>();
  const stapel: string[] = [];
  let aktuell: Array<Record<string, string[]>> = [];
  for (const zeile of baum.split('\n')) {
    const m = /^([│ ]*(?:[├└]── )?)(.*)$/.exec(zeile)!;
    const inhalt = m[2];
    if (!inhalt) continue;
    const hook = /^• \((\w+)\) (.*)$/.exec(inhalt);
    if (hook) {
      for (const h of aktuell) h[hook[1]] = JSON.parse(hook[2]) as string[];
      continue;
    }
    const knoten = /^(.*) \(([A-Z, ]+)\)$/.exec(inhalt);
    if (!knoten) continue;
    const tiefe = m[1].length / 4 - 1;
    stapel.length = tiefe;
    stapel[tiefe] = knoten[1];
    const pfad = stapel.join('');
    aktuell = knoten[2].split(', ').map((methode) => {
      const h: Record<string, string[]> = {};
      routen.set(`${methode} ${pfad}`, h);
      return h;
    });
  }
  return new Map([...routen].map(([r, h]) => [r, JSON.stringify(h)]));
}

/** Eine Route als Zeile: Methode, Pfad, Zugang und alle weiteren Angaben außer dem Handler. */
function zeile(r: Record<string, unknown>): string {
  const { methode, pfad, zugang, handler, ...rest } = r;
  assert.equal(typeof handler, 'function', `${String(methode)} ${String(pfad)}: Handler fehlt`);
  const mehr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${String(methode)} ${String(pfad)} ${String(zugang)}${mehr}`;
}

describe('Routentabelle: Reihenfolge, Angaben und Hooks (#1278, Schritt 6b-4a)', () => {
  let web = '';
  let ist: { routen: string[]; hookArten: string[]; hooks: Record<string, number> } = { routen: [], hookArten: [], hooks: {} };
  before(async () => {
    web = mkdtempSync(join(tmpdir(), 'routen-tabelle-'));
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const wd = new Webdav({ dienst, konten, schluessel, einstellungen: speicherEinstellungen(), adresse: () => 'https://dms.example.org' });
    const liste = routen(dienst, konten, { apiSchluessel: schluessel }) as unknown as Array<Record<string, unknown>>;
    const app = await baueApp(dienst, konten, { apiSchluessel: schluessel, webdav: wd, webDir: web, ueberlast: new Ueberlastschutz(50) });
    await app.ready();
    const hooks = routenMitHooks(app.printRoutes({ commonPrefix: false, includeHooks: true }));
    await app.close();
    // Hooks je Route: Viele Routen haben dieselben – jede Art einmal, die Route verweist auf ihre Nummer.
    const hookArten = [...new Set(hooks.values())];
    ist = {
      routen: liste.map(zeile),
      hookArten,
      hooks: Object.fromEntries([...hooks].map(([r, h]) => [r, hookArten.indexOf(h)])),
    };
    if (process.env.CHARAKTER_SCHREIBEN) {
      mkdirSync(dirname(DATEI), { recursive: true });
      writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
    }
  });
  after(() => rmSync(web, { recursive: true, force: true }));

  const soll = () =>
    existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as typeof ist) : { routen: [], hookArten: [], hooks: {} };
  it('Routen in Reihenfolge, mit allen Angaben', () => {
    assert.ok(ist.routen.length > 700);
    assert.deepEqual(ist.routen, soll().routen);
  });
  it('Hooks je Route (Fastify)', () => {
    assert.deepEqual(ist.hookArten, soll().hookArten);
    assert.deepEqual(ist.hooks, soll().hooks);
  });
});
