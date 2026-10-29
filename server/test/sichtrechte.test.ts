/** Berechtigungen an Sichten mit Vererbung (#148). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Sicht } from '../../shared/src/sichten';
import { eigeneSichtRechte, sichtRechte, type SichtRegelwerk } from '../../shared/src/sichtrechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const regel = (name: string, wenn: SichtRegelwerk['regeln'][number]['wenn'], dann: SichtRegelwerk['regeln'][number]['dann'], stopp = false) => ({ id: name.replace(/\W/g, '').slice(0, 20) || 'r', name, wenn, dann, stopp });

/** Je Test eine frische Datenbank, wenn pg (TEST_DATABASE_URL), sonst Arbeitsspeicher. */
const offen: Array<{ end(): Promise<void> }> = [];
async function repos(pg: boolean) {
  if (!pg) return undefined;
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_sicht_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  const H = '00000000-0000-4000-8000-000000000001';
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}

async function aufbau(pg = false) {
  const r = await repos(pg);
  const d = new Dienst(r?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r?.konto ?? speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name, rolle: 'mitglied' }, admin.id)).benutzer;
  const eltern = await neu('Eltern'); const kind = await neu('Kind');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const rolleTyp = (await d.listeTypen()).find((t) => t.system === 'rolle')!;
  const kinderRolle = (await d.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Kinder' } }, admin.id)).id;
  await d.setzeRollen(kind.id, [kinderRolle]);
  const rechnung = await d.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }], sichtAnlegen: false });
  for (const nr of ['H', 'G']) await d.legeMappeAn({ typId: rechnung.id, werte: { nr } }, admin.id);
  const nrIst = (nr: string) => [{ art: 'feld', feld: 'nr', op: 'gleich', wert: { art: 'fest', wert: nr } }];
  const haus = await d.legeSichtAn({ name: 'Haus', typen: [] });
  const heizung = await d.legeSichtAn({ name: 'Heizung', elternId: haus.id, typen: [rechnung.id], bedingungen: nrIst('H') });
  const garten = await d.legeSichtAn({ name: 'Garten', elternId: haus.id, typen: [rechnung.id], bedingungen: nrIst('G') });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  const eigene = new Set([haus.id, heizung.id, garten.id]);
  const sichten = async (b: { id: string }) => ((await rufe(b, 'GET', '/api/sichten/definitionen')).body as Sicht[]).filter((s) => eigene.has(s.id));
  const zaehler = async (b: { id: string }) => Object.fromEntries(Object.entries(((await rufe(b, 'GET', '/api/sichten')).body as { sichten: Record<string, number> }).sichten).filter(([k]) => eigene.has(k)));
  const seite = async (b: { id: string }, sicht: string) => ((await rufe(b, 'GET', '/api/mappen', { query: { sicht } })).body as { mappen: Array<{ titel: string }> }).mappen.map((m) => m.titel).sort();
  const setze = (s: Sicht, berechtigungen: unknown) => rufe(admin, 'PUT', '/api/sichten/definitionen/:id', { params: { id: s.id }, body: { ...s, berechtigungen } });
  return { d, admin, eltern, kind, kinderRolle, rechnung, haus, heizung, garten, rufe, sichten, zaehler, seite, setze };
}

describe('Sichtrechte auswerten (#148)', () => {
  const wer = { id: 'u1', rollen: ['r1'] };
  const s = (id: string, elternId: string | null, berechtigungen: SichtRegelwerk | null): Sicht => ({ id, elternId, berechtigungen, name: id, beschreibung: '', position: 0, typen: [], bedingungen: [], erstellt: '', geaendert: '' });
  it('Untersicht: Standard gilt nicht, ✓ wirkt nicht, Eltern UND eigene', () => {
    const alle = [
      s('a', null, { grund: { R: true, C: false, E: true }, regeln: [regel('r1 darf anlegen', [{ art: 'rolle', rollen: ['r1'] }], { C: 'erteilen' })] }),
      s('b', 'a', { grund: { R: false, C: false, E: true }, regeln: [regel('versuch', [{ art: 'benutzer', benutzer: ['u1'] }], { R: 'erteilen' })] }),
      s('c', 'b', { grund: { R: true, C: true, E: true }, regeln: [regel('kein C', [{ art: 'rolle', rollen: ['r1'] }], { C: 'entziehen' })] }),
    ];
    assert.deepEqual(sichtRechte(alle, 'a', wer), { R: true, C: true, E: true });
    assert.deepEqual(sichtRechte(alle, 'b', wer), { R: true, C: true, E: true });
    assert.deepEqual(sichtRechte(alle, 'c', wer), { R: true, C: false, E: true });
    assert.deepEqual(eigeneSichtRechte(alle[1].berechtigungen!, wer, true).rechte, { R: true, C: true, E: true });
    assert.deepEqual(sichtRechte(alle, 'c', { id: 'u2', rollen: [] }), { R: true, C: false, E: true });
  });
});

function faelle(pg: boolean) {
describe(`Berechtigungen an Sichten (#148)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('verborgene Untersicht: weder im Baum noch ihre Mappen in der Elternsicht, Zähler passend', async () => {
    const { admin, kind, eltern, kinderRolle, haus, heizung, garten, sichten, zaehler, seite, setze } = await aufbau(pg);
    await setze(heizung, { grund: { R: true, C: true, E: true }, regeln: [regel('Kinder nicht', [{ art: 'rolle', rollen: [kinderRolle] }], { R: 'entziehen' })] });
    assert.deepEqual((await sichten(kind)).map((s) => s.name).sort(), ['Garten', 'Haus']);
    assert.equal((await sichten(kind))[0].berechtigungen, undefined, 'Regeln bleiben verborgen');
    assert.deepEqual((await sichten(eltern)).map((s) => s.name).sort(), ['Garten', 'Haus', 'Heizung']);
    assert.equal((await zaehler(kind))[haus.id], 1);
    assert.equal((await zaehler(kind))[heizung.id], undefined);
    assert.equal((await zaehler(eltern))[haus.id], 2);
    assert.equal((await zaehler(admin))[haus.id], 2);
    assert.deepEqual(await seite(kind, haus.id), ['G']);
    assert.deepEqual(await seite(eltern, haus.id), ['G', 'H']);
    // Die Mappe selbst bleibt lesbar – das regelt der Mappentyp.
    assert.deepEqual(await seite(kind, garten.id), ['G']);
  });

  it('vererbt: Elternsicht verborgen → Untersichten auch; Admins ohne Regeln', async () => {
    const { admin, kind, haus, d, sichten, zaehler } = await aufbau(pg);
    await d.aendereSicht(haus.id, { ...haus, berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [regel('Kind nicht', [{ art: 'benutzer', benutzer: [kind.id] }], { R: 'entziehen' })] } });
    assert.deepEqual(await sichten(kind), []);
    assert.deepEqual(await zaehler(kind), {});
    assert.equal((await sichten(admin)).length, 3);
    assert.equal((await d.listeSichten()).length > 3, true);
  });

  it('C an der Sicht; Untersicht nur ✗; ohne Angabe bleiben Regeln', async () => {
    const { kind, eltern, kinderRolle, garten, haus, sichten, setze, d } = await aufbau(pg);
    await setze(garten, { grund: { R: true, C: true, E: true }, regeln: [regel('Kinder legen nicht an', [{ art: 'rolle', rollen: [kinderRolle] }], { C: 'entziehen' })] });
    assert.deepEqual((await sichten(kind)).find((s) => s.id === garten.id)?.rechte, { R: true, C: false, E: true });
    assert.deepEqual((await sichten(eltern)).find((s) => s.id === garten.id)?.rechte, { R: true, C: true, E: true });
    await assert.rejects(setze(garten, { grund: { R: true, C: true, E: true }, regeln: [regel('Eltern dürfen', [{ art: 'benutzer', benutzer: [eltern.id] }], { C: 'erteilen' })] }), status(422));
    // Ohne „berechtigungen“ in der Eingabe bleiben sie (z. B. über die Schnittstelle).
    const { berechtigungen: _b, ...ohne } = (await d.listeSichten()).find((s) => s.id === garten.id)!;
    await d.aendereSicht(garten.id, { ...ohne, name: 'Garten neu' });
    assert.equal((await d.listeSichten()).find((s) => s.id === garten.id)?.berechtigungen?.regeln.length, 1);
    // Oberste Sicht darf ✓ und Standard ✗.
    await setze(haus, { grund: { R: false, C: false, E: true }, regeln: [regel('Eltern sehen', [{ art: 'benutzer', benutzer: [eltern.id] }], { R: 'erteilen' })] });
    assert.deepEqual((await sichten(kind)).map((s) => s.name), []);
    assert.deepEqual((await sichten(eltern)).map((s) => s.name).sort(), ['Garten neu', 'Haus', 'Heizung']);
  });

  it('Testlauf mit ungespeicherten Regeln und Elternsicht', async () => {
    const { admin, kind, kinderRolle, haus, heizung, rufe } = await aufbau(pg);
    const r = (await rufe(admin, 'POST', '/api/werkbank/sichten/testlauf', { body: { sichtId: heizung.id, benutzerId: kind.id, elternId: haus.id,
      berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [regel('Kinder nicht', [{ art: 'rolle', rollen: [kinderRolle] }], { R: 'entziehen' })] } } })).body as { kette: Array<{ name: string; stand: { R: boolean } }>; wirksam: { R: boolean } };
    assert.deepEqual(r.kette.map((k) => k.name), ['Haus', 'Heizung']);
    assert.equal(r.wirksam.R, false);
    const ohne = (await rufe(admin, 'POST', '/api/werkbank/sichten/testlauf', { body: { sichtId: heizung.id, benutzerId: kind.id, elternId: null, berechtigungen: null } })).body as { kette: unknown[]; wirksam: { R: boolean } };
    assert.equal(ohne.kette.length, 1);
    assert.equal(ohne.wirksam.R, true);
  });
});
}

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
