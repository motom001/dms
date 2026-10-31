/** Vollexport (#254): Aufbau, offene Formate, Passwörter, Versionen, Prüfwerte. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { csv, exportDateien, exporteIn, pruefeExport, vollexport } from '../src/vollexport';
import { kontaktVorschlaege } from '../src/routen';

describe('Vollexport (#254)', () => {
  it('CSV nach RFC 4180 mit BOM', () => {
    assert.equal(csv(['a', 'b'], [['1,5', 'sagt "hallo"'], ['x\ny', ' leer']]).toString('utf8'), '﻿a,b\r\n"1,5","sagt ""hallo"""\r\n"x\ny"," leer"\r\n');
  });

  it('exportiert alles lesbar, ohne Passwörter; mit Bestätigung Passwörter; Prüfwerte', async () => {
    const tresor = { bereit: true, registriere: () => {}, verschluessele: (k: string) => `dms1$${k}`, entschluessele: (w: string) => (w.startsWith('dms1$') ? w.slice(5) : null) };
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor: tresor as never });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
    const partner = await d.legeTypAn({ name: 'Vertragspartner', schluessel: 'partner', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'email', label: 'E-Mail', typ: 'text' }, { key: 'telefon', label: 'Telefon', typ: 'text' },
    ] });
    const konto = await d.legeTypAn({ name: 'Zugang', titelVorlage: '{name}', felder: [
      { key: 'name', label: 'Name', typ: 'text' }, { key: 'benutzer', label: 'Benutzername', typ: 'text' }, { key: 'pw', label: 'Passwort', typ: 'passwort' },
      { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id }, { key: 'betrag', label: 'Betrag', typ: 'betrag' }, { key: 'ab', label: 'Ab', typ: 'datum' },
    ], register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'dok', name: 'Unterlagen', art: 'dokumente', versionierung: true }] });
    const p = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke, Nord', email: 'info@sw.de', telefon: '0123' } });
    const z = await d.legeMappeAn({ typId: konto.id, werte: { name: 'Portal', benutzer: 'anna', pw: 'geheim123', partner: p.id, betrag: { betrag: 12.5, waehrung: 'EUR' }, ab: '2026-12-01' } });
    const dok = (await d.ladeHoch(z.id, { register: 'dok', name: 'Vertrag.pdf' }, Buffer.from('%PDF-1.4 eins'), null)).dokument;
    await d.ersetzeDokument(dok.id, {}, Buffer.from('%PDF-1.4 zwei'), null);
    await d.legeNotizAn(z.id, 'Notiz zum Zugang', null);

    const quelle = d.vollexportQuelle({ mandant: 'Familie Test', version: '0.0.0', benutzer: () => konten.exportDaten(), designs: async () => [], protokoll: () => [] });
    const ziel = await mkdtemp(join(tmpdir(), 'dms-export-'));
    const vor = kontaktVorschlaege(await d.listeTypen()).find((v) => v.typId === partner.id)!;
    assert.deepEqual(vor.zuordnung, { name: 'name', email: 'email', telefon: 'telefon' });
    const r = await vollexport(quelle, ziel, { kontakte: { [partner.id]: vor.zuordnung } });
    const lies = (rel: string) => readFile(join(r.ordner, rel), 'utf8');
    const m = JSON.parse(await lies('manifest.json'));
    assert.equal(m.formatversion, 1);
    assert.ok(m.anzahlen.mappen >= 3); // 2 + Benutzer-Mappe (+ Systemrollen)
    const pfade: string[] = m.dateien.map((x: { pfad: string }) => x.pfad);
    for (const x of ['LIESMICH.md', 'struktur/mappentypen.json', 'struktur/benutzer.json', 'daten/partner.csv', 'daten/partner.jsonl', 'daten/partner.xlsx', 'daten/verweise.csv', 'daten/dokumente.csv', 'daten/historie.jsonl', 'kalender/fristen.ics', 'kontakte/partner.vcf', 'uebersicht/partner.pdf']) assert.ok(pfade.includes(x), x);
    // Dokumente im Original, ältere Version im Unterordner
    const ablage = pfade.filter((x) => x.startsWith('ablage/Zugang/'));
    assert.ok(ablage.some((x) => x.endsWith('/Unterlagen/Vertrag.pdf')), ablage.join('\n'));
    assert.ok(ablage.some((x) => /\/Unterlagen\/Versionen\/v1 Vertrag\.pdf$/.test(x)));
    assert.equal(await lies(ablage.find((x) => x.endsWith('/Unterlagen/Vertrag.pdf'))!), '%PDF-1.4 zwei');
    // CSV: Komma, Verweis als Id und Titel, Betrag getrennt, Passwort nur „gesetzt“
    const zugang = await lies('daten/zugang.csv');
    assert.match(zugang, /^﻿id,titel,angelegt/);
    assert.match(zugang, /partner,partner_titel,betrag,betrag_waehrung/);
    assert.match(zugang, new RegExp(`${p.id},"Stadtwerke, Nord",12.5,EUR`));
    assert.ok(!zugang.includes('geheim123'));
    assert.match(zugang, /\(gesetzt\)/);
    assert.ok(!(await lies('daten/zugang.jsonl')).includes('geheim123'));
    assert.ok(!(await lies('struktur/benutzer.json')).includes('hash'));
    assert.match(await lies('kontakte/partner.vcf'), /BEGIN:VCARD\r\nVERSION:4\.0\r\nFN:Stadtwerke\\, Nord\r\nEMAIL:info@sw\.de\r\nTEL:0123/);
    assert.ok(!pfade.includes('passwoerter.csv'));
    // Prüfen
    assert.deepEqual(await pruefeExport(r.ordner), { ok: true, dateien: m.dateien.length, fehlend: [], abweichend: [] });
    await writeFile(join(r.ordner, 'daten', 'partner.csv'), 'verändert');
    const p2 = await pruefeExport(r.ordner);
    assert.equal(p2.ok, false);
    assert.deepEqual(p2.abweichend, ['daten/partner.csv']);
    assert.equal((await exporteIn(ziel))[0].name, r.name);
    assert.ok((await exportDateien(r.ordner)).some((x) => x.name === 'manifest.json'));

    // Mit Passwörtern (Bitwarden-CSV)
    const r2 = await vollexport(quelle, await mkdtemp(join(tmpdir(), 'dms-export-')), { passwoerter: true, protokolle: true });
    const pw = await readFile(join(r2.ordner, 'passwoerter.csv'), 'utf8');
    assert.match(pw, /^﻿folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\r\nZugang,,login,Portal,,,0,,anna,geheim123,\r\n$/);
  });
});
