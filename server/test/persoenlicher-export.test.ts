/** Persönlicher Export (#255): nur lesbare Mappen, eigene Aufgaben und Favoriten, Passwörter nur mit Recht. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ALLES } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { Tresor } from '../src/tresor';
import { vollexport } from '../src/vollexport';

describe('Persönlicher Export (#255)', () => {
  it('enthält nur, was der Benutzer lesen darf, und seine eigenen Daten', async () => {
    const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-pe-')), 'dms.schluessel'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
    const max = (await konten.legeBenutzerAn({ email: 'max@example.org', name: 'Max', rolle: 'mitglied' }, admin.id)).benutzer;
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const t = await d.legeTypAn({ name: 'Vertrag', schluessel: 'vertrag', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'privat', label: 'Privat', typ: 'janein' }, { key: 'pw', label: 'Passwort', typ: 'passwort' },
    ] });
    await d.setzeBerechtigungen(t.id, { grund: ALLES, regeln: [
      { id: 'p', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: true },
    ] }, true);
    const offen = await d.legeMappeAn({ typId: t.id, werte: { name: 'Strom', privat: false, pw: 'strom123' } }, admin.id);
    await d.legeMappeAn({ typId: t.id, werte: { name: 'Geheim', privat: true, pw: 'geheim456' } }, admin.id);
    await d.legeAufgabeAn(offen.id, { empfaengerId: max.id, text: 'Für Max' }, admin.id);
    await d.legeAufgabeAn(offen.id, { empfaengerId: admin.id, text: 'Für Admin' }, admin.id);
    await d.setzeFavorit({ id: max.id }, offen.id, true);
    await d.setzeFavorit({ id: admin.id }, offen.id, true);

    const z = await d.zugriff({ id: max.id, rolle: 'mitglied' });
    const q = await d.persoenlicheQuelle(z, { mandant: 'M', version: '0', ich: await konten.exportDatenVon(max.id) });
    const r = await vollexport(q, await mkdtemp(join(tmpdir(), 'dms-pe-')), { passwoerter: true });
    const lies = (rel: string) => readFile(join(r.ordner, rel), 'utf8');
    const csv = await lies('daten/vertrag.csv');
    assert.match(csv, /Strom/);
    assert.ok(!csv.includes('Geheim'));
    assert.ok(!(await lies('ablage/Vertrag/Strom [' + offen.id.slice(0, 8) + ']/mappe.json')).includes('strom123'));
    const aufgaben = await lies('daten/aufgaben.jsonl');
    assert.match(aufgaben, /Für Max/);
    assert.ok(!aufgaben.includes('Für Admin'));
    assert.equal((await lies('daten/favoriten.csv')).trim().split('\r\n').length, 2, 'Kopf + eigener Favorit');
    const benutzer = JSON.parse(await lies('struktur/benutzer.json'));
    assert.deepEqual(benutzer.map((b: { email: string }) => b.email), ['max@example.org']);
    assert.deepEqual(JSON.parse(await lies('struktur/sichten.json')), []);
    const pw = await lies('passwoerter.csv');
    assert.match(pw, /strom123/);
    assert.ok(!pw.includes('geheim456'));
    // Abschaltbar
    assert.equal(await d.persoenlicherExportErlaubt(), true);
    await d.setzePersoenlicherExport(false, 'test');
    assert.equal(await d.persoenlicherExportErlaubt(), false);
  });
});
