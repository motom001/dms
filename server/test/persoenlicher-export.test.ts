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
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
    const max = (await konten.legeBenutzerAn({ email: 'max@example.org', name: 'Max' }, admin.id)).benutzer;
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const t = await d.mappentypen.legeTypAn({ name: 'Vertrag', schluessel: 'vertrag', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'privat', label: 'Privat', typ: 'janein' }, { key: 'pw', label: 'Passwort', typ: 'passwort' },
    ] });
    await d.berechtigungen.setzeBerechtigungen(t.id, { grund: ALLES, regeln: [
      { id: 'p', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }], dann: { R: 'entziehen' }, stopp: true },
    ] }, true);
    const offen = await d.mappen.legeMappeAn({ typId: t.id, werte: { name: 'Strom', privat: false, pw: 'strom123' } }, admin.id);
    await d.mappen.legeMappeAn({ typId: t.id, werte: { name: 'Geheim', privat: true, pw: 'geheim456' } }, admin.id);
    const geheim = (await d.mappen.listeMappen(t.id)).find((m) => m.titel === 'Geheim')!;
    // Was der Admin im Haushalt löscht, gehört nicht in Max' Export (#683).
    const reg = t.register.find((x) => x.art === 'dokumente')!.key;
    const dok = (await d.dokumente.ladeHoch(geheim.id, { register: reg, name: 'kontoauszug-geheim.pdf' }, Buffer.from('%PDF-1.4 geheim'), admin.id)).dokument;
    await d.dokumente.loescheDokument(dok.id, admin.id);
    await d.vertretung.legeAufgabeAn(offen.id, { empfaengerId: max.id, text: 'Für Max' }, admin.id);
    await d.vertretung.legeAufgabeAn(offen.id, { empfaengerId: admin.id, text: 'Für Admin' }, admin.id);
    await d.mappen.setzeFavorit({ id: max.id }, offen.id, true);
    await d.mappen.setzeFavorit({ id: admin.id }, offen.id, true);

    const z = await d.rechtepruefung.zugriff({ id: max.id, rolle: 'mitglied' });
    const q = await d.vollexport.persoenlicheQuelle(z, { mandant: 'M', version: '0', ich: await konten.exportDatenVon(max.id) });
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
    // Nur Eigenes (#683): kein Löschprotokoll, keine Synonyme und Automatisierungen, nur selbst gelöschte Dokumente.
    for (const datei of ['daten/loeschprotokoll.csv', 'struktur/synonyme.json', 'struktur/automatisierungen.json']) await assert.rejects(lies(datei), { code: 'ENOENT' }, datei);
    assert.ok(!(await lies('daten/papierkorb-dokumente.jsonl')).includes('kontoauszug-geheim'));
    const pw = await lies('passwoerter.csv');
    assert.match(pw, /strom123/);
    assert.ok(!pw.includes('geheim456'));
  });

  it('ist ab Werk aus und nur mit ausdrücklichem true erlaubt (#884)', async () => {
    const einstellungen = speicherEinstellungen();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
    assert.equal(await d.auskunftZustellen.persoenlicherExportErlaubt(), false, 'ohne Einstellung aus');
    assert.equal(await d.auskunftZustellen.setzePersoenlicherExport(true, 'test'), true);
    assert.equal(await einstellungen.lies('persoenlicher_export'), true);
    assert.equal(await d.auskunftZustellen.setzePersoenlicherExport(false, 'test'), false);
    assert.equal(await einstellungen.lies('persoenlicher_export'), false);
    // Alles außer true schaltet aus, auch ein alter Wert null aus der Zeit vor #884.
    await d.auskunftZustellen.setzePersoenlicherExport('ja', 'test');
    assert.equal(await d.auskunftZustellen.persoenlicherExportErlaubt(), false);
    await einstellungen.schreibe('persoenlicher_export', null);
    assert.equal(await d.auskunftZustellen.persoenlicherExportErlaubt(), false);
  });
});
