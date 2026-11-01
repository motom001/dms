/** Paket selbst erstellen (#374): Auswahl, Prüfung, Export – und zurück in ein frisches DMS. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { standardliste, type Mappentyp } from '../../shared/src/model';
import type { PaketErstellenEingabe } from '../../shared/src/paketerstellung';
import { naechsteVersion, paketIdAus } from '../../shared/src/paketerstellung';
import type { Sicht } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesZip, Paketverwaltung } from '../src/pakete';
import { Paketerstellung } from '../src/paketerstellung';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const REGISTRY = process.env.DMS_REGISTRY ?? join(dirname(fileURLToPath(import.meta.url)), '../../../dms-registry');

function ordner(pfad: string, vor = ''): Record<string, string> {
  const erg: Record<string, string> = {};
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) Object.assign(erg, ordner(p, `${vor}${n}/`));
    else erg[`${vor}${n}`] = readFileSync(p, 'utf8');
  }
  return erg;
}
const basisZip = zipPuffer(Object.entries(ordner(BASIS)).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));

/** Ein DMS im Arbeitsspeicher mit Paketverwaltung und Paketerstellung. */
function dms() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  return { d, p: new Paketverwaltung(d, { version: () => '0.86.0', katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => '0.86.0' }) };
}
async function hochladenUndInstallieren(p: Paketverwaltung, zip: Buffer, beispiele = false) {
  const h = await p.hochladen(zip, ICH);
  return { vorschau: h.vorschau, paket: await p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH) };
}

/** Quell-DMS: Basis installiert, eigene Typen Vertrag und Zahlung (aufeinander verweisend), Notiz (unbeteiligt). */
async function quelle() {
  const q = dms();
  await hochladenUndInstallieren(q.p, basisZip);
  const typen = await q.d.listeTypen();
  const org = typen.find((t) => t.schluessel === 'basis_organisation')!;
  const benutzer = typen.find((t) => t.system === 'benutzer')!;
  const ablageort = (await q.d.ablageortTyp())!;
  const vertragId = '11111111-1111-4111-8111-111111111111';
  const zahlung = await q.d.legeTypAn({ name: 'Zahlung', schluessel: 'zahlung', titelVorlage: '{datum}', felder: [
    { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true },
    { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'EUR' },
  ] });
  const vertrag = await q.d.legeTypAn({ id: vertragId, name: 'Vertrag', schluessel: 'vertrag', beschreibung: 'Ein Vertrag mit einer Organisation', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true, maxLen: 40 },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: org.id, verweisart: 'bezug' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzer.id, verweisart: 'bezug' },
    { key: 'original', label: 'Original liegt in', typ: 'referenz', zielTyp: ablageort.id, verweisart: 'bezug' },
    // „yes“ und „on“ liest YAML 1.1 (pruefen.py) sonst als Wahrheitswert.
    { key: 'zahlweise', label: 'Zahlweise', typ: 'auswahl', optionen: ['monatlich', 'jährlich', 'yes', 'on'] },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 6, einheit: 'wochen', empfaengerFeld: 'verantwortlich', text: '{feld} {datum}', wiederholung: null } },
    { key: 'kennwort', label: 'Kennwort Kundenportal', typ: 'passwort' },
    { key: 'monatlich', label: 'Monatlich', typ: 'betrag', waehrung: 'EUR' },
  ], trefferliste: ['nr', 'partner', 'monatlich'] });
  // Zahlung verweist auf Vertrag; Vertrag zeigt seine Zahlungen im Verknüpfungsregister.
  await q.d.aendereTyp(zahlung.id, { ...zahlung, felder: [...zahlung.felder, { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTyp: vertrag.id, verweisart: 'zugehoerigkeit' }],
    register: zahlung.register.map((r) => (r.art === 'felder' ? { ...r, felder: [...(r.felder ?? []), 'vertrag'] } : r)) });
  const v2 = (await q.d.listeTypen()).find((t) => t.id === vertrag.id)!;
  await q.d.aendereTyp(vertrag.id, { ...v2, register: [...v2.register, { key: 'zahlungen', name: 'Zahlungen', art: 'verknuepfungen', quellen: [{ typId: zahlung.id, feldKey: 'vertrag' }] }] });
  const notiz = await q.d.legeTypAn({ name: 'Notizzettel', felder: [{ key: 'text', label: 'Text', typ: 'text' }] });
  const vertraege = await q.d.legeSichtAn({ name: 'Verträge', typen: [vertrag.id] });
  const teuer = await q.d.legeSichtAn({ name: 'Teure Verträge', elternId: vertraege.id, typen: [vertrag.id], bedingungen: [{ art: 'feld', feld: 'monatlich', op: 'groesser', wert: { art: 'fest', wert: 100 } }] });
  const meine = await q.d.legeSichtAn({ name: 'Meine Verträge', elternId: vertraege.id, typen: [vertrag.id], bedingungen: [
    { art: 'feld', feld: 'verantwortlich', op: 'zeigtAuf', wert: { art: 'ich' } },
    { art: 'feld', feld: 'kuendigung', op: 'kleiner', wert: { art: 'heute', versatz: 3, einheit: 'monate' } },
  ] });
  // Echte Daten: Mappen; Beispiele werden nur aus ausdrücklich gewählten.
  const stadtwerke = await q.d.legeMappeAn({ typId: org.id, werte: { name: 'Stadtwerke' } });
  const v = await q.d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'S-1', partner: stadtwerke.id, zahlweise: 'monatlich', monatlich: { betrag: 89, waehrung: 'EUR' } } });
  const z = await q.d.legeMappeAn({ typId: zahlung.id, werte: { datum: '2026-01-31', betrag: { betrag: 89, waehrung: 'EUR' }, vertrag: v.id } });
  const echt = await q.d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'GEHEIM-4711' } });
  // Bedingung mit fester Mappe: gehört nie ins Paket.
  const fest = await q.d.legeSichtAn({ name: 'Nur ein Partner', typen: [vertrag.id], bedingungen: [{ art: 'feld', feld: 'partner', op: 'zeigtAuf', wert: { art: 'fest', wert: stadtwerke.id } }] });
  return { ...q, org, vertrag, zahlung, notiz, sichten: { vertraege, teuer, meine, fest }, mappen: { v, z, echt } };
}

const angaben = (a: Partial<PaketErstellenEingabe> = {}): PaketErstellenEingabe => ({
  typen: [], sichten: [], beispiele: [], id: 'familie_vertraege', name: 'Verträge der Familie', version: '1.0.0',
  beschreibung: 'Verträge mit Zahlungen und Kündigungsfristen, wie wir sie zu Hause pflegen.',
  autor: { name: 'Thomas Beispiel', github: 'motom001' }, lizenz: 'MIT', dms: '>=0.86.0', aenderungen: '', ...a,
});

/** Vergleichbares Bild eines Typs: Namen statt Ids. */
function bild(t: Mappentyp, typen: Mappentyp[]) {
  const n = (id: string) => typen.find((x) => x.id === id)?.name ?? `?${id}`;
  return {
    name: t.name, beschreibung: t.beschreibung, titelVorlage: t.titelVorlage,
    felder: t.felder.filter((f) => !f.system).map((f) => ({ key: f.key, label: f.label, typ: f.typ, pflicht: !!f.pflicht, optionen: f.optionen, maxLen: f.maxLen ?? null, ziel: f.zielTyp ? n(f.zielTyp) : null, verweisart: f.verweisart ?? null, frist: f.frist ? [f.frist.vorlauf, f.frist.einheit, f.frist.empfaengerFeld] : null })),
    register: t.register.map((r) => ({ key: r.key, name: r.name, art: r.art, felder: r.felder ?? [], quellen: (r.quellen ?? []).map((q) => [n(q.typId), q.feldKey]) })),
    spalten: standardliste(t).spalten,
  };
}
function sichtBild(s: Sicht, alle: Sicht[], typen: Mappentyp[]) {
  return { name: s.name, eltern: alle.find((x) => x.id === s.elternId)?.name ?? null, typen: s.typen.map((t) => typen.find((x) => x.id === t)?.name), bedingungen: s.bedingungen };
}

describe('Paket selbst erstellen (#374)', () => {
  it('Id-Vorschlag und nächste Version', () => {
    assert.equal(paketIdAus('Verträge der Familie Müller'), 'vertraege_der_famili');
    assert.equal(paketIdAus('123'), '');
    assert.equal(naechsteVersion('1.0.0'), '1.1.0');
    assert.equal(naechsteVersion('quatsch'), '1.0.0');
  });

  it('meldet nicht gewählte eigene Typen, Paket-Typen werden Abhängigkeit, Systemtypen dms:…', async () => {
    const q = await quelle();
    const r = await q.e.pruefe(angaben({ typen: [q.vertrag.id] }));
    assert.equal(r.einspielbar, false);
    assert.deepEqual(r.fehlend.map((f) => [f.art, f.name]), [['typ', 'Zahlung']]);
    assert.ok(r.probleme.some((p) => /nicht gewählt.*Zahlung/.test(p)));
    assert.deepEqual(r.abhaengigkeiten, { basis: '>=1.0.0' });
    assert.ok(r.hinweise.some((h) => /Organisation“ kommt aus dem Paket „Basis“ – wird als Abhängigkeit eingetragen/.test(h)));
    await assert.rejects(q.e.exportiere(angaben({ typen: [q.vertrag.id] }), ICH), (e) => e instanceof Fachfehler && e.status === 422);
    // Ungültige Angaben.
    const f = await q.e.pruefe(angaben({ typen: [q.vertrag.id, q.zahlung.id], id: 'dms', beschreibung: 'kurz', lizenz: 'WTFPL', dms: '>=0.70.0' }));
    assert.ok(f.probleme.some((p) => /reserviert/.test(p)));
    assert.ok(f.probleme.some((p) => /Beschreibung/.test(p)));
    assert.ok(f.probleme.some((p) => /Lizenz/.test(p)));
    assert.ok(f.probleme.some((p) => /mindestens >=0\.75\.0/.test(p)), 'dms:… braucht DMS ab 0.75.0');
    assert.ok((await q.e.pruefe(angaben({ typen: [q.vertrag.id, q.zahlung.id], id: 'basis' }))).probleme.some((p) => /installiert/.test(p)));
    // Nur Typen aus Paketen: nichts Eigenes.
    assert.ok((await q.e.pruefe(angaben({ typen: [q.org.id] }))).probleme.some((p) => /mindestens einen eigenen/.test(p)));
    // Lokal geänderter Paket-Typ: Hinweis.
    await new Promise((x) => setTimeout(x, 5));
    await q.d.aendereTyp(q.org.id, { ...q.org, felder: [...q.org.felder, { key: 'eigen', label: 'Eigenes Feld', typ: 'text' }], register: q.org.register.map((r) => (r.key === 'stammdaten' ? { ...r, felder: [...(r.felder ?? []), 'eigen'] } : r)) });
    const g = await q.e.pruefe(angaben({ typen: [q.vertrag.id, q.zahlung.id] }));
    assert.ok(g.hinweise.some((h) => /Änderungen an „Organisation“ \(Basis\) gehören nicht zu deinem Paket/.test(h)), g.hinweise.join('\n'));
    assert.equal((await q.e.stand()).typen.find((t) => t.id === q.org.id)?.geaendert, true);
  });

  it('Export → frisches DMS: hochladen, installieren, Typen und Ansichten gleich; höhere Version aktualisiert', async () => {
    const q = await quelle();
    const s = q.sichten;
    const auswahl = { typen: [q.vertrag.id, q.zahlung.id, q.org.id], sichten: [s.vertraege.id, s.teuer.id, s.meine.id, s.fest.id], beispiele: [q.mappen.v.id, q.mappen.z.id] };
    const r = await q.e.pruefe(angaben(auswahl));
    assert.deepEqual(r.probleme, []);
    assert.equal(r.einspielbar, true);
    assert.deepEqual(r.inhalt.typen.map((t) => t.schluessel).sort(), ['vertrag', 'zahlung']);
    assert.deepEqual(r.inhalt.sichten.map((x) => [x.name, x.eltern]), [['Verträge', null], ['Teure Verträge', 'vertraege'], ['Meine Verträge', 'vertraege'], ['Nur ein Partner', null]]);
    assert.equal(r.inhalt.beispiele, 2);
    assert.ok(r.hinweise.some((h) => /Nur ein Partner.*nennt Mappen/.test(h)));
    assert.ok(r.beispielMappen.find((b) => b.typ === 'Vertrag')!.mappen.some((m) => m.titel === 'GEHEIM-4711'), 'zur Auswahl angeboten');
    const z1 = await q.e.exportiere(angaben(auswahl), ICH);
    assert.equal(z1.name, 'familie_vertraege-1.0.0.zip');

    // Inhalt: keine Ids, keine echten Daten außer den gewählten Beispielen, keine Benutzer, keine Passwörter.
    const dateien = liesZip(z1.daten);
    const alles = [...dateien.values()].map((b) => b.toString('utf8')).join('\n');
    assert.ok(![...dateien.keys()].some((n) => !n.startsWith('familie_vertraege/')));
    assert.doesNotMatch(alles, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(alles, /GEHEIM-4711|Stadtwerke|admin@example\.org/);
    const manifest = parse(dateien.get('familie_vertraege/manifest.yaml')!.toString()) as Record<string, unknown>;
    assert.deepEqual(manifest.abhaengigkeiten, { basis: '>=1.0.0' });
    assert.equal(manifest.dms, '>=0.86.0');
    const typenYaml = parse(dateien.get('familie_vertraege/inhalt/mappentypen.yaml')!.toString()) as Array<{ schluessel: string; felder: Array<{ key: string; ziel?: string }> }>;
    const vy = typenYaml.find((t) => t.schluessel === 'vertrag')!;
    assert.deepEqual(vy.felder.filter((f) => f.ziel).map((f) => [f.key, f.ziel]), [['partner', 'basis:organisation'], ['verantwortlich', 'dms:benutzer'], ['original', 'dms:ablageort']]);
    const bsp = parse(dateien.get('familie_vertraege/inhalt/beispiele.yaml')!.toString()) as Array<{ typ: string; schluessel: string; werte: Record<string, unknown> }>;
    assert.deepEqual(bsp.find((b) => b.typ === 'vertrag')!.werte, { nr: 'S-1', zahlweise: 'monatlich', monatlich: 89 });
    assert.deepEqual(bsp.find((b) => b.typ === 'zahlung')!.werte.vertrag, { beispiel: bsp.find((b) => b.typ === 'vertrag')!.schluessel });
    assert.match(dateien.get('familie_vertraege/LICENSE')!.toString(), /MIT License[\s\S]*Copyright \(c\) \d{4} Thomas Beispiel/);
    assert.match(dateien.get('familie_vertraege/CHANGELOG.md')!.toString(), /^## 1\.0\.0\n\n- Erste Fassung\./m);

    // Frisches DMS: erst die Abhängigkeit, dann das eigene Paket – wie beim Empfänger.
    const z = dms();
    await hochladenUndInstallieren(z.p, basisZip);
    const { vorschau, paket } = await hochladenUndInstallieren(z.p, z1.daten, true);
    assert.equal(vorschau.update, false);
    assert.deepEqual(vorschau.probleme, []);
    assert.equal(paket.version, '1.0.0');
    const qt = await q.d.listeTypen(), zt = await z.d.listeTypen();
    for (const k of ['vertrag', 'zahlung'] as const) {
      const quell = k === 'vertrag' ? q.vertrag : q.zahlung;
      const ziel = zt.find((t) => t.id === paket.typen[k])!;
      assert.equal(ziel.schluessel, `familie_vertraege_${k}`);
      assert.deepEqual(bild(ziel, zt), bild(qt.find((t) => t.id === quell.id)!, qt), k);
    }
    const qs = await q.d.listeSichten(), zs = await z.d.listeSichten();
    for (const quell of [s.vertraege, s.teuer, s.meine]) {
      const ziel = zs.find((x) => x.name === quell.name)!;
      assert.deepEqual(sichtBild(ziel, zs, zt), sichtBild(qs.find((x) => x.id === quell.id)!, qs, qt), quell.name);
    }
    assert.deepEqual(zs.find((x) => x.name === 'Nur ein Partner')!.bedingungen, [], 'Bedingung mit fester Mappe bleibt draußen');
    // Beispiele angelegt, Verweis zwischen ihnen aufgelöst.
    const zv = (await z.d.listeMappen(paket.typen.vertrag))[0];
    const zz = (await z.d.listeMappen(paket.typen.zahlung))[0];
    assert.equal(zv.werte.nr, 'S-1');
    assert.equal(zz.werte.vertrag, zv.id);

    // Weiterentwickeln: neues Feld, neue Ansicht; der nächste Export schlägt dieselbe Id mit höherer Version vor.
    const vt = (await q.d.listeTypen()).find((t) => t.id === q.vertrag.id)!;
    await q.d.aendereTyp(vt.id, { ...vt, felder: [...vt.felder, { key: 'kundennummer', label: 'Kundennummer', typ: 'text' }], register: vt.register.map((x) => (x.art === 'felder' ? { ...x, felder: [...(x.felder ?? []), 'kundennummer'] } : x)) });
    const neueSicht = await q.d.legeSichtAn({ name: 'Zahlungen', typen: [q.zahlung.id] });
    const st = await q.e.stand();
    assert.equal(st.entwuerfe.length, 1);
    assert.equal(st.vorschlag.id, 'familie_vertraege');
    assert.equal(st.vorschlag.version, '1.1.0');
    assert.deepEqual(st.vorschlag.typen, auswahl.typen);
    assert.ok(!st.typen.some((t) => t.name === 'Benutzer' || t.name === 'Ablageort'), 'Systemtypen nicht zur Auswahl');
    // Gleiche Version noch einmal: Hinweis.
    assert.ok((await q.e.pruefe({ ...st.vorschlag, version: '1.0.0' })).hinweise.some((h) => /schon exportiert/.test(h)));
    const z2 = await q.e.exportiere({ ...st.vorschlag, sichten: [...st.vorschlag.sichten, neueSicht.id], aenderungen: 'Kundennummer am Vertrag, Ansicht Zahlungen.' }, ICH);
    assert.equal(z2.name, 'familie_vertraege-1.1.0.zip');
    const cl = liesZip(z2.daten).get('familie_vertraege/CHANGELOG.md')!.toString();
    assert.match(cl, /## 1\.1\.0\n\n- Kundennummer am Vertrag, Ansicht Zahlungen\.\n\n## 1\.0\.0\n\n- Erste Fassung\./);
    const up = await z.p.hochladen(z2.daten, ICH);
    assert.equal(up.vorschau.update, true);
    assert.deepEqual(up.vorschau.typen.find((t) => t.schluessel === 'vertrag')!.neueFelder, ['Kundennummer']);
    assert.ok(up.vorschau.typen.every((t) => t.vorhanden), 'gleiche Kennungen → keine neuen Typen');
    const n = await z.p.installiere({ upload: up.upload, bestaetigt: true }, ICH);
    assert.equal(n.version, '1.1.0');
    assert.ok((await z.d.listeTypen()).find((t) => t.id === n.typen.vertrag)!.felder.some((f) => f.key === 'kundennummer'));
    assert.ok((await z.d.listeSichten()).some((x) => x.name === 'Zahlungen'));
    assert.equal((await z.d.listeTypen()).filter((t) => t.schluessel?.startsWith('familie_vertraege_')).length, 2);
  });

  it('besteht pruefen.py der Registry', { skip: (!existsSync(join(REGISTRY, 'werkzeuge/pruefen.py')) || spawnSync('python3', ['-c', 'import yaml, jsonschema']).status !== 0) && 'python3 mit pyyaml/jsonschema oder dms-registry fehlt' }, async () => {
    const q = await quelle();
    const s = q.sichten;
    const z = await q.e.exportiere(angaben({ typen: [q.vertrag.id, q.zahlung.id], sichten: [s.vertraege.id, s.teuer.id, s.meine.id], beispiele: [q.mappen.v.id, q.mappen.z.id], lizenz: 'GPL-3.0-or-later' }), ICH);
    // pruefen.py prüft nur Ordner innerhalb seiner Registry: Kopie von Werkzeug und Schemas, Paket unter pakete/<id>.
    const wurzel = mkdtempSync(join(tmpdir(), 'dms-registry-'));
    try {
      mkdirSync(join(wurzel, 'werkzeuge'));
      copyFileSync(join(REGISTRY, 'werkzeuge/pruefen.py'), join(wurzel, 'werkzeuge/pruefen.py'));
      cpSync(join(REGISTRY, 'schema'), join(wurzel, 'schema'), { recursive: true });
      for (const [name, daten] of liesZip(z.daten)) {
        const ziel = join(wurzel, 'pakete', name);
        mkdirSync(dirname(ziel), { recursive: true });
        writeFileSync(ziel, daten);
      }
      const r = spawnSync('python3', ['-B', join(wurzel, 'werkzeuge/pruefen.py'), join(wurzel, 'pakete/familie_vertraege')], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /✓ pakete\/familie_vertraege/);
    } finally { rmSync(wurzel, { recursive: true, force: true }); }
  });
});
