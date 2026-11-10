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
import { lizenzArtVon, lizenzVerweis, naechsteVersion, naechsteVersionen, paketIdAus } from '../../shared/src/paketerstellung';
import type { Sicht } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesZip, Paketverwaltung } from '../src/pakete';
import { dmsOptionen, mindestversion, Paketerstellung } from '../src/paketerstellung';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { basisMitAblageort, frueherAblageort } from './hilfen';

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
const alsZip = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));
const basisZip = alsZip(ordner(BASIS));
/** Basis 1.6.0 mit Ablageort (#883). */
const basis16Zip = alsZip(basisMitAblageort(ordner(BASIS)));

/** Ein DMS im Arbeitsspeicher mit Paketverwaltung und Paketerstellung. */
function dms(version = '0.86.0') {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  return { d, einstellungen, p: new Paketverwaltung(d, { version: () => version, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => version }) };
}
async function hochladenUndInstallieren(p: Paketverwaltung, zip: Buffer, beispiele = false) {
  const h = await p.hochladen(zip, ICH);
  return { vorschau: h.vorschau, paket: await p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH) };
}

/** Quell-DMS: Basis 1.6.0 (mit Ablageort) installiert, eigene Typen Vertrag und Zahlung (aufeinander verweisend), Notiz (unbeteiligt). */
async function quelle(version?: string) {
  const q = dms(version);
  await hochladenUndInstallieren(q.p, basis16Zip);
  const typen = await q.d.listeTypen();
  const org = typen.find((t) => t.schluessel === 'basis:organisation')!;
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
  const vertraege = await q.d.legeSichtAn({ name: 'Verträge', typen: [vertrag.id], symbol: 'signature' });
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
    felder: t.felder.filter((f) => !f.system).map((f) => ({ key: f.key, label: f.label, typ: f.typ, pflicht: !!f.pflicht, optionen: f.optionen, maxLen: f.maxLen ?? null, ziel: f.zielTypen?.[0] ? n(f.zielTypen[0]) : null, verweisart: f.verweisart ?? null, frist: f.frist ? [f.frist.vorlauf, f.frist.einheit, f.frist.empfaengerFeld] : null })),
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
    assert.deepEqual(r.abhaengigkeiten, { basis: '>=1.6.0' });
    assert.ok(r.hinweise.some((h) => /Organisation“ kommt aus dem Paket „Basis“ – wird als Abhängigkeit eingetragen/.test(h)));
    await assert.rejects(q.e.exportiere(angaben({ typen: [q.vertrag.id] }), ICH), (e) => e instanceof Fachfehler && e.status === 422);
    // Ungültige Angaben.
    const f = await q.e.pruefe(angaben({ typen: [q.vertrag.id, q.zahlung.id], id: 'dms', beschreibung: 'kurz', lizenz: 'WTFPL', dms: '>=0.70.0' }));
    assert.ok(f.probleme.some((p) => /reserviert/.test(p)));
    assert.ok(f.probleme.some((p) => /Beschreibung/.test(p)));
    assert.ok(f.probleme.some((p) => /Lizenz/.test(p)));
    assert.ok(f.probleme.some((p) => /mindestens >=0\.86\.0/.test(p)), 'unter der Grundlage 0.86.0 (Paket erstellen) geht nichts');
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

  it('früherer Ablageort des Kerns (#883): Verweis basis:ablageort, Basis ab 1.6.0 als Abhängigkeit', async () => {
    const q = dms();
    await hochladenUndInstallieren(q.p, basisZip);
    const a = await frueherAblageort(q.d, q.einstellungen);
    const brief = await q.d.legeTypAn({ name: 'Brief', schluessel: 'brief', felder: [{ key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true },
      { key: 'original', label: 'Original liegt in', typ: 'referenz', zielTyp: a.id, verweisart: 'bezug' }] });
    const orte = await q.d.legeSichtAn({ name: 'Briefe und Orte', typen: [brief.id, a.id] });
    const st = await q.e.stand();
    assert.ok(!st.typen.some((t) => t.id === a.id), 'nicht als eigener Typ zur Auswahl');
    const z = await q.e.exportiere(angaben({ id: 'briefe', typen: [brief.id], sichten: [orte.id] }), ICH);
    const dateien = liesZip(z.daten);
    const manifest = parse(dateien.get('briefe/manifest.yaml')!.toString()) as Record<string, unknown>;
    assert.deepEqual(manifest.abhaengigkeiten, { basis: '>=1.6.0' });
    const typen = parse(dateien.get('briefe/inhalt/mappentypen.yaml')!.toString()) as Array<{ felder: Array<{ key: string; ziel?: string }> }>;
    assert.equal(typen[0].felder.find((f) => f.key === 'original')!.ziel, 'basis:ablageort');
    const sichten = parse(dateien.get('briefe/inhalt/sichten.yaml')!.toString()) as Array<{ typen: string[] }>;
    assert.deepEqual(sichten[0].typen.sort(), ['basis:ablageort', 'brief']);
    const p = await q.e.pruefe(angaben({ id: 'briefe', typen: [brief.id], sichten: [orte.id] }));
    assert.ok(p.hinweise.some((h) => /„Ablageort“ kommt mit dem Paket Basis.*basis:ablageort.*1\.6\.0/.test(h)), p.hinweise.join(' | '));
  });

  it('nur Ansichten (#656): Hinweis statt Abbruch, Typ über die Kennung; beim Empfänger zugeordnet oder einzeln übersprungen', async () => {
    const q = await quelle();
    const s = q.sichten;
    const auswahl = { sichten: [s.vertraege.id, s.teuer.id] };
    // Zu alte Ablago-Version im Paket: Problem.
    assert.ok((await q.e.pruefe(angaben(auswahl))).probleme.some((p) => /Ansichten mit Mappentypen, die nicht im Paket sind \(ab 0\.178\.0\) und braucht mindestens >=0\.178\.0/.test(p)));
    const r = await q.e.pruefe(angaben({ ...auswahl, dms: '>=0.178.0' }));
    assert.deepEqual(r.probleme, []);
    assert.equal(r.einspielbar, true);
    assert.deepEqual(r.fehlend.map((f) => [f.art, f.name]), [['typ', 'Vertrag']], 'mit aufnehmen angeboten');
    assert.ok(r.hinweise.some((h) => /Ansicht „Verträge“ zeigt Mappen vom Typ „Vertrag“\. „Vertrag“ kommt nicht ins Paket – beim Empfänger muss es „Vertrag“ schon geben/.test(h)), r.hinweise.join('\n'));
    const z1 = await q.e.exportiere(angaben({ ...auswahl, dms: '>=0.178.0' }), ICH);
    const sy = parse(liesZip(z1.daten).get('familie_vertraege/inhalt/sichten.yaml')!.toString()) as Array<{ name: string; typen?: string[]; fremde_typen?: Array<{ kennung: string; name: string }> }>;
    assert.deepEqual(sy.map((x) => [x.name, x.typen ?? [], x.fremde_typen]), [['Verträge', [], [{ kennung: 'vertrag', name: 'Vertrag' }]], ['Teure Verträge', [], [{ kennung: 'vertrag', name: 'Vertrag' }]]]);

    // Empfänger ohne „Vertrag“: beide Ansichten übersprungen, das Paket wird trotzdem installiert.
    const ohne = dms('0.178.0');
    const h = await ohne.p.hochladen(z1.daten, ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    assert.deepEqual(h.vorschau.sichten.map((x) => [x.name, !!x.ausgelassen]), [['Verträge', true], ['Teure Verträge', true]]);
    assert.ok(h.vorschau.hinweise.some((x) => /Ansicht „Verträge“ wird nicht installiert: Den Mappentyp „Vertrag“ gibt es in dieser Installation nicht\./.test(x)), h.vorschau.hinweise.join('\n'));
    assert.ok(h.vorschau.hinweise.some((x) => /Ansicht „Teure Verträge“ wird nicht installiert: Sie steht unter „Verträge“/.test(x)));
    const vorher = (await ohne.d.listeSichten()).length;
    const p1 = await ohne.p.installiere({ upload: h.upload, bestaetigt: true, beispiele: false }, ICH);
    assert.equal(p1.version, '1.0.0');
    assert.equal((await ohne.d.listeSichten()).length, vorher, 'keine Ansicht angelegt');

    // Empfänger mit einem Typ dieser Kennung: zugeordnet.
    const mit = dms('0.178.0');
    const t = await mit.d.legeTypAn({ name: 'Mein Vertrag', schluessel: 'vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }, { key: 'monatlich', label: 'Monatlich', typ: 'betrag', waehrung: 'EUR' }] });
    await hochladenUndInstallieren(mit.p, z1.daten);
    const zs = await mit.d.listeSichten();
    assert.deepEqual(zs.find((x) => x.name === 'Verträge')!.typen, [t.id]);
    assert.deepEqual(zs.find((x) => x.name === 'Teure Verträge')!.typen, [t.id]);
  });

  it('Wortlisten (#661): eigene Gruppen ankreuzen, auch ohne Typen; beim Empfänger „aus Paketen“; neue Version übernimmt die Auswahl', async () => {
    const q = await quelle('0.127.0');
    await q.d.legeSynonymAn({ woerter: ['Kfz', 'Auto', 'PKW'] }, ICH.email);
    await q.d.legeSynonymAn({ woerter: ['Strom', 'Energie'] }, ICH.email);
    const stand = await q.e.stand();
    const ids = stand.wortlisten.filter((g) => !g.paket).map((g) => g.id);
    assert.equal(ids.length, 2);
    const auswahl = { wortlisten: ids, dms: '>=0.127.0' };
    const r = await q.e.pruefe(angaben(auswahl));
    assert.deepEqual(r.probleme, []);
    assert.equal(r.inhalt.wortlisten, 2);
    assert.ok((await q.e.pruefe(angaben({ wortlisten: ids, dms: '>=0.86.0' }))).probleme.some((p) => /Wortlisten \(ab 0\.127\.0\) und braucht mindestens >=0\.127\.0/.test(p)));
    const z1 = await q.e.exportiere(angaben(auswahl), ICH);
    const dateien = liesZip(z1.daten);
    assert.deepEqual(parse(dateien.get('familie_vertraege/inhalt/wortlisten.yaml')!.toString()), [{ woerter: ['Kfz', 'Auto', 'PKW'] }, { woerter: ['Strom', 'Energie'] }]);
    assert.equal((parse(dateien.get('familie_vertraege/tests/erwartung.yaml')!.toString()) as { wortlisten: number }).wortlisten, 2);
    // Leeres Ablago: beide Gruppen „aus Paketen“.
    const z = dms('0.127.0');
    const { paket } = await hochladenUndInstallieren(z.p, z1.daten);
    const gruppen = (await z.d.sucheStand()).synonyme.filter((g) => g.quelle === paket.id).map((g) => g.woerter);
    assert.deepEqual(gruppen.sort(), [['Kfz', 'Auto', 'PKW'], ['Strom', 'Energie']].sort());
    // Neue Version (#652): Das erstellte Paket merkt sich die Auswahl der Wortlisten.
    assert.deepEqual((await q.e.stand()).entwuerfe.find((x) => x.id === 'familie_vertraege')?.wortlisten, ids);
  });

  it('„geändert“ nur bei inhaltlicher Abweichung vom Paketstand, mit Kurzfassung und Liste (#653)', async () => {
    const q = await quelle();
    const org = (await q.d.listeTypen()).find((t) => t.id === q.org.id)!;
    const bild = async () => (await q.e.stand()).typen.find((t) => t.id === q.org.id)!;
    // Speichern ohne Änderung: nicht geändert.
    await new Promise((x) => setTimeout(x, 5));
    await q.d.aendereTyp(org.id, { ...org });
    assert.equal((await bild()).geaendert, false);
    // Feld hinzufügen, Feld umbenennen, Pflicht ändern.
    const erstes = org.felder.find((f) => !f.system)!;
    await q.d.aendereTyp(org.id, { ...org,
      felder: [...org.felder.map((f) => (f.key === erstes.key ? { ...f, label: `${f.label} neu`, pflicht: !f.pflicht } : f)), { key: 'eigen', label: 'Eigenes Feld', typ: 'text' }],
      register: org.register.map((r) => (r.key === 'stammdaten' ? { ...r, felder: [...(r.felder ?? []), 'eigen'] } : r)) });
    const b = await bild();
    assert.equal(b.geaendert, true);
    assert.equal(b.unterschiede!.kurz, '+1 Feld · 1 Feld geändert · 1 Register geändert');
    assert.ok(b.unterschiede!.liste.includes('Feld „Eigenes Feld“ hinzugefügt'), b.unterschiede!.liste.join('\n'));
    assert.ok(b.unterschiede!.liste.some((x) => x.startsWith(`Feld „${erstes.label} neu“: umbenannt von „${erstes.label}“, Pflicht`)), b.unterschiede!.liste.join('\n'));
  });

  it('Export → frisches Ablago: hochladen, installieren, Typen und Ansichten gleich; höhere Version aktualisiert', async () => {
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
    assert.deepEqual(manifest.abhaengigkeiten, { basis: '>=1.6.0' });
    assert.equal(manifest.dms, '>=0.86.0');
    const typenYaml = parse(dateien.get('familie_vertraege/inhalt/mappentypen.yaml')!.toString()) as Array<{ schluessel: string; felder: Array<{ key: string; ziel?: string }> }>;
    const vy = typenYaml.find((t) => t.schluessel === 'vertrag')!;
    assert.deepEqual(vy.felder.filter((f) => f.ziel).map((f) => [f.key, f.ziel]), [['partner', 'basis:organisation'], ['verantwortlich', 'dms:benutzer'], ['original', 'basis:ablageort']]);
    const bsp = parse(dateien.get('familie_vertraege/inhalt/beispiele.yaml')!.toString()) as Array<{ typ: string; schluessel: string; werte: Record<string, unknown> }>;
    assert.deepEqual(bsp.find((b) => b.typ === 'vertrag')!.werte, { nr: 'S-1', zahlweise: 'monatlich', monatlich: 89 });
    assert.deepEqual(bsp.find((b) => b.typ === 'zahlung')!.werte.vertrag, { beispiel: bsp.find((b) => b.typ === 'vertrag')!.schluessel });
    assert.match(dateien.get('familie_vertraege/LICENSE')!.toString(), /MIT License[\s\S]*Copyright \(c\) \d{4} Thomas Beispiel/);
    assert.match(dateien.get('familie_vertraege/CHANGELOG.md')!.toString(), /^## 1\.0\.0\n\n- Erste Fassung\./m);

    // Frisches DMS: erst die Abhängigkeit, dann das eigene Paket – wie beim Empfänger.
    const z = dms();
    await hochladenUndInstallieren(z.p, basis16Zip);
    const { vorschau, paket } = await hochladenUndInstallieren(z.p, z1.daten, true);
    assert.equal(vorschau.update, false);
    assert.deepEqual(vorschau.probleme, []);
    assert.equal(paket.version, '1.0.0');
    const qt = await q.d.listeTypen(), zt = await z.d.listeTypen();
    for (const k of ['vertrag', 'zahlung'] as const) {
      const quell = k === 'vertrag' ? q.vertrag : q.zahlung;
      const ziel = zt.find((t) => t.id === paket.typen[k])!;
      assert.equal(ziel.schluessel, `familie_vertraege:${k}`);
      assert.deepEqual(bild(ziel, zt), bild(qt.find((t) => t.id === quell.id)!, qt), k);
    }
    const qs = await q.d.listeSichten(), zs = await z.d.listeSichten();
    for (const quell of [s.vertraege, s.teuer, s.meine]) {
      const ziel = zs.find((x) => x.name === quell.name)!;
      assert.deepEqual(sichtBild(ziel, zs, zt), sichtBild(qs.find((x) => x.id === quell.id)!, qs, qt), quell.name);
    }
    assert.equal(zs.find((x) => x.name === 'Verträge')!.symbol, 'signature', 'Symbol der Ansicht kommt mit (#428)');
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
    const stand = await q.e.stand();
    assert.equal(stand.entwuerfe.length, 1);
    // #652: „Paket erstellen“ öffnet leer; „Neue Version von …“ übernimmt Auswahl und Angaben.
    assert.equal(stand.vorschlag.id, ''); assert.deepEqual(stand.vorschlag.typen, []);
    const st = { ...stand, vorschlag: q.e.ausEntwurf(stand.entwuerfe[0]) };
    assert.equal(st.vorschlag.id, 'familie_vertraege');
    assert.equal(st.vorschlag.version, '1.1.0');
    assert.deepEqual(st.vorschlag.typen, auswahl.typen);
    assert.ok(!st.typen.some((t) => t.name === 'Benutzer'), 'Systemtypen nicht zur Auswahl');
    // Gleiche Version noch einmal: nicht wählbar (#651).
    assert.equal(st.vorschlag.dms, '', 'nötige Ablago-Version setzt die Oberfläche aus der Prüfung');
    const gleich = await q.e.pruefe({ ...st.vorschlag, dms: '>=0.86.0', version: '1.0.0' });
    assert.ok(gleich.probleme.some((h) => /1\.0\.0 hast du schon erstellt/.test(h)), gleich.probleme.join('\n'));
    assert.equal(gleich.version.bekannt, '1.0.0');
    assert.equal(gleich.version.art, 'inhalt', 'neues Feld → neue Inhalte');
    const z2 = await q.e.exportiere({ ...st.vorschlag, dms: '>=0.86.0', sichten: [...st.vorschlag.sichten, neueSicht.id], aenderungen: 'Kundennummer am Vertrag, Ansicht Zahlungen.' }, ICH);
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
    assert.equal((await z.d.listeTypen()).filter((t) => t.schluessel?.startsWith('familie_vertraege:')).length, 2);
  });

  it('Version, nötige Ablago-Version und Lizenz werden ausgewählt (#651)', async () => {
    assert.deepEqual(naechsteVersionen('1.2.3'), { korrektur: '1.2.4', inhalt: '1.3.0', gross: '2.0.0' });
    assert.deepEqual(mindestversion([]), { version: '0.86.0', gruende: [] });
    assert.equal(mindestversion(['dmsVerweise', 'feldformate', 'beispielVerweise']).version, '0.121.0');
    assert.deepEqual(mindestversion(['feldformate', 'erkennung']).gruende, ['Feldformate und Datumsgrenzen (ab 0.121.0)', 'Erkennung an Feldern („Aus Dokument ausfüllen“) (ab 0.113.0)']);
    const opt = dmsOptionen('0.121.0', '0.159.2');
    assert.equal(opt[0], '>=0.121.0'); assert.equal(opt.at(-1), '>=0.159.0'); assert.ok(!opt.includes('>=0.157.0'), 'nie erschienen'); assert.equal(opt.length, 38);
    assert.deepEqual(dmsOptionen('0.121.0', '0.121.0'), ['>=0.121.0']);
    assert.equal(lizenzVerweis('Kommerzielle Lizenz Muster-IT'), 'LicenseRef-Kommerzielle-Lizenz-Muster-IT');
    assert.deepEqual(['Apache-2.0', 'NONE', 'LicenseRef-x', ''].map(lizenzArtVon), ['frei', 'keine', 'eigen', 'keine']);

    const q = await quelle();
    const a = (x: Partial<PaketErstellenEingabe> = {}) => angaben({ typen: [q.vertrag.id, q.zahlung.id], ...x });
    // Erstes Paket: 1.0.0 (oder 0.1.0); alles andere nur von Hand.
    const v = (r: { probleme: string[] }) => r.probleme.filter((p) => p.startsWith('Version:'));
    assert.deepEqual(v(await q.e.pruefe(a({ version: '0.1.0' }))), []);
    assert.equal(v(await q.e.pruefe(a({ version: '2.0.0' }))).length, 1);
    assert.deepEqual(v(await q.e.pruefe(a({ version: '2.0.0', vonHand: true }))), []);
    const erst = await q.e.pruefe(a());
    assert.equal(erst.version.bekannt, null); assert.equal(erst.version.art, null);
    assert.deepEqual(erst.version.dmsOptionen, ['>=0.86.0']);
    // Nötige Ablago-Version: nur aus der Auswahl.
    assert.ok((await q.e.pruefe(a({ dms: '' }))).probleme.some((p) => /Ablago-Version: bitte auswählen/.test(p)));
    assert.ok((await q.e.pruefe(a({ dms: '>=0.86.1' }))).probleme.some((p) => /aus der Auswahl/.test(p)));
    assert.ok((await q.e.pruefe(a({ dms: '^0.86.0', vonHand: true }))).probleme.every((p) => !p.startsWith('Ablago-Version')));
    // Hochgeladene letzte Version: neue muss höher sein.
    const hoch = await q.e.pruefe(a({ bekannteVersion: '2.4.0', version: '2.5.0' }));
    assert.equal(hoch.version.bekannt, '2.4.0'); assert.deepEqual(v(hoch), []);
    assert.ok(v(await q.e.pruefe(a({ bekannteVersion: '2.4.0' }))).some((p) => /2\.4\.0 gibt es schon/.test(p)));

    // Nach dem Export: drei Möglichkeiten, Art erkannt.
    const z1 = await q.e.exportiere(a(), ICH);
    assert.deepEqual(q.e.liesLetzteVersion(z1.daten), { id: 'familie_vertraege', name: 'Verträge der Familie', version: '1.0.0' });
    assert.throws(() => q.e.liesLetzteVersion(Buffer.alloc(0)), Fachfehler);
    for (const x of ['1.0.1', '1.1.0', '2.0.0']) assert.deepEqual(v(await q.e.pruefe(a({ version: x }))), [], x);
    assert.equal(v(await q.e.pruefe(a({ version: '1.3.0' }))).length, 1, 'nur die drei Möglichkeiten');
    assert.deepEqual(v(await q.e.pruefe(a({ version: '1.3.0', vonHand: true }))), []);
    assert.equal((await q.e.pruefe(a({ version: '1.0.1' }))).version.art, 'korrektur');
    const ohne = await q.e.pruefe(a({ typen: [q.vertrag.id, q.zahlung.id, q.notiz.id], version: '1.1.0' }));
    assert.equal(ohne.version.art, 'inhalt', ohne.version.artGrund ?? '');
    const zt = (await q.d.listeTypen()).find((t) => t.id === q.zahlung.id)!;
    await q.d.aendereTyp(zt.id, { ...zt, felder: zt.felder.filter((f) => f.key !== 'betrag'), register: zt.register.map((r) => ({ ...r, felder: r.felder?.filter((k) => k !== 'betrag') })) });
    const weg = await q.e.pruefe(a({ version: '2.0.0' }));
    assert.equal(weg.version.art, 'gross'); assert.match(weg.version.artGrund ?? '', /betrag/);

    // Feldformat hebt die Mindestversion an; die Auswahl reicht bis zur eigenen Version.
    const d2 = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const e2 = new Paketerstellung(d2, { version: () => '0.159.2' });
    const iban = await d2.legeTypAn({ name: 'Konto', schluessel: 'konto', felder: [{ key: 'iban', label: 'IBAN', typ: 'text', format: 'iban' }] });
    const k = (x: Partial<PaketErstellenEingabe> = {}) => angaben({ id: 'konten', typen: [iban.id], ...x });
    const f = await e2.pruefe(k({ dms: '>=0.100.0' }));
    assert.equal(f.version.mindest, '0.121.0'); assert.deepEqual(f.version.gruende, ['Feldformate und Datumsgrenzen (ab 0.121.0)']);
    assert.ok(f.probleme.some((p) => /Feldformate und Datumsgrenzen \(ab 0\.121\.0\) und braucht mindestens >=0\.121\.0/.test(p)), f.probleme.join('\n'));
    assert.ok((await e2.pruefe(k({ dms: '>=0.160.0' }))).probleme.some((p) => /gibt es nicht zur Auswahl/.test(p)));
    assert.deepEqual((await e2.pruefe(k({ dms: '>=0.121.0' }))).probleme, []);

    // Lizenz: eigene und keine – installierbar, aber nicht für den offiziellen Katalog.
    const eigen = await e2.pruefe(k({ dms: '>=0.121.0', lizenzArt: 'eigen', lizenzName: 'Kommerzielle Lizenz Muster-IT', lizenzText: '' }));
    assert.ok(eigen.probleme.some((p) => /Text der eigenen Lizenz/.test(p)));
    assert.ok(eigen.hinweise.some((h) => /nicht in den offiziellen Katalog/.test(h)));
    const ze = await e2.exportiere(k({ dms: '>=0.121.0', lizenzArt: 'eigen', lizenzName: 'Kommerzielle Lizenz Muster-IT', lizenzText: 'Nutzung nur für Kunden der Muster-IT.' }), ICH);
    const de = liesZip(ze.daten);
    assert.equal((parse(de.get('konten/manifest.yaml')!.toString()) as { lizenz: string }).lizenz, 'LicenseRef-Kommerzielle-Lizenz-Muster-IT');
    assert.equal(de.get('konten/LICENSE')!.toString(), 'Nutzung nur für Kunden der Muster-IT.\n');
    const zk = await e2.exportiere(k({ id: 'konten2', dms: '>=0.121.0', lizenzArt: 'keine' }), ICH);
    const dk = liesZip(zk.daten);
    assert.equal((parse(dk.get('konten2/manifest.yaml')!.toString()) as { lizenz: string }).lizenz, 'NONE');
    assert.match(dk.get('konten2/LICENSE')!.toString(), /keine Lizenz angegeben/);
    // Ein anderes Ablago nimmt beide an und zeigt die Lizenz in der Vorschau.
    const ziel = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const pz = new Paketverwaltung(ziel, { version: () => '0.159.2', katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } });
    assert.equal((await pz.hochladen(ze.daten, ICH)).vorschau.paket.lizenz, 'LicenseRef-Kommerzielle-Lizenz-Muster-IT');
    assert.equal((await pz.hochladen(zk.daten, ICH)).vorschau.paket.lizenz, 'NONE');
  });

  it('selbst erstellte Pakete in der Paketverwaltung: Umfang, ZIP jeder Version, aus der Liste nehmen (#652)', async () => {
    const q = await quelle();
    assert.deepEqual(await q.e.selbstErstellt(), []);
    const auswahl = { typen: [q.vertrag.id, q.zahlung.id], sichten: [q.sichten.vertraege.id] };
    const r1 = await q.e.erstelle(angaben(auswahl), ICH);
    assert.equal(r1.id, 'familie_vertraege'); assert.equal(r1.version, '1.0.0'); assert.equal(r1.datei, 'familie_vertraege-1.0.0.zip');
    const z2 = await q.e.exportiere(angaben({ ...auswahl, version: '1.1.0' }), ICH);
    const liste = await q.e.selbstErstellt();
    assert.deepEqual(liste.map((x) => [x.id, x.version, x.versionen.map((v) => v.version)]), [['familie_vertraege', '1.1.0', ['1.1.0', '1.0.0']]]);
    // Jede gemerkte Version kommt genau so wieder heraus.
    assert.ok((await q.e.archiv('familie_vertraege', '1.1.0')).daten.equals(z2.daten));
    assert.equal(liesZip((await q.e.archiv('familie_vertraege', '1.0.0')).daten).get('familie_vertraege/manifest.yaml')!.toString().includes('version: 1.0.0'), true);
    await assert.rejects(q.e.archiv('familie_vertraege', '9.9.9'), (e) => e instanceof Fachfehler && e.status === 404);
    // Umfang und Vergleich mit heute.
    await new Promise((x) => setTimeout(x, 5));
    const vt = (await q.d.listeTypen()).find((t) => t.id === q.vertrag.id)!;
    await q.d.aendereTyp(vt.id, { ...vt, beschreibung: 'geändert' });
    const d = await q.e.selbstErstelltDetail('familie_vertraege');
    assert.deepEqual(d.typen.map((t) => [t.name, t.geaendert]), [['Vertrag', true], ['Zahlung', false]]);
    assert.deepEqual(d.sichten.map((x) => x.name), ['Verträge']);
    assert.equal(d.verlauf[0].version, '1.0.0');
    // Typen aus selbst erstellten Paketen bleiben eigene Typen: kein „aus Paket“, wieder exportierbar.
    const st = await q.e.stand();
    assert.equal(st.typen.find((t) => t.id === q.vertrag.id)?.paket, null);
    // Aus der Liste nehmen: vergisst Entwurf und Archive, löscht keine Typen oder Ansichten.
    assert.deepEqual(await q.e.ausListeNehmen('familie_vertraege', ICH), []);
    await assert.rejects(q.e.archiv('familie_vertraege', '1.0.0'), Fachfehler);
    assert.ok((await q.d.listeTypen()).some((t) => t.id === q.vertrag.id));
    assert.ok((await q.d.listeSichten()).some((x) => x.id === q.sichten.vertraege.id));
    await assert.rejects(q.e.selbstErstelltDetail('familie_vertraege'), (e) => e instanceof Fachfehler && e.status === 404);
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
