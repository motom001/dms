/**
 * Feldtyp Passwort (#46): verschlüsselt gespeichert, nie im Klartext an Oberfläche oder API,
 * außer beim einzelnen Anzeigen (protokolliert) oder mit dem eigenen API-Recht.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pruefeMappentyp, titelAus, type Mappentyp } from '../../shared/src/model';
import { bedingungsfelder } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { maskiere, Tresor } from '../src/tresor';

function einstellungen() {
  const m = new Map<string, unknown>();
  return { async lies(k: string) { return m.get(k) ?? null; }, async schreibe(k: string, w: unknown) { m.set(k, structuredClone(w)); } };
}
async function tresor(mitSchluessel = true) {
  const t = new Tresor(einstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-pw-')), 'dms.schluessel'), () => null);
  await t.laden();
  if (mitSchluessel) await t.erzeuge();
  return t;
}
const FELDER = [
  { key: 'name', label: 'Name', typ: 'text', pflicht: true },
  { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
];
async function mitZugang(t?: Tresor) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { tresor: t });
  const typ = await d.legeTypAn({ name: 'Zugang', felder: FELDER });
  return { d, typ };
}

describe('Passwortfeld (#46)', () => {
  it('speichert nur mit Schlüssel, verschlüsselt, und behält den Wert, wenn er unverändert zurückkommt', async () => {
    const ohne = await mitZugang(await tresor(false));
    await assert.rejects(ohne.d.legeMappeAn({ typId: ohne.typ.id, werte: { name: 'Bank', kennwort: { neu: 'geheim' } } }), (e: unknown) => e instanceof Fachfehler && e.status === 409);
    assert.ok(await ohne.d.legeMappeAn({ typId: ohne.typ.id, werte: { name: 'Ohne Passwort' } }), 'ohne Passwort geht es');

    const t = await tresor();
    const { d, typ } = await mitZugang(t);
    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', kennwort: { neu: 'geheim' } } });
    const roh = (await d.holeMappe(m.id)).mappe.werte.kennwort as string;
    assert.match(roh, /^dms1\$/);
    assert.equal(t.entschluessele(roh), 'geheim');
    // So kommt es von der Oberfläche zurück: unverändert.
    await d.aendereMappe(m.id, { werte: { name: 'Bank AG', kennwort: { gesetzt: true, lesbar: true } } });
    assert.equal((await d.holeMappe(m.id)).mappe.werte.kennwort, roh);
    await d.aendereMappe(m.id, { werte: { name: 'Bank AG' } });
    assert.equal((await d.holeMappe(m.id)).mappe.werte.kennwort, roh, 'weggelassen = unverändert');
    await d.aendereMappe(m.id, { werte: { name: 'Bank AG', kennwort: 'neu-als-text' } });
    assert.equal(t.entschluessele((await d.holeMappe(m.id)).mappe.werte.kennwort as string), 'neu-als-text');
    await assert.rejects(d.aendereMappe(m.id, { werte: { kennwort: roh } }), /direkt/);
    await d.aendereMappe(m.id, { werte: { name: 'Bank AG', kennwort: { entfernen: true } } });
    assert.equal((await d.holeMappe(m.id)).mappe.werte.kennwort, null);
  });

  it('erscheint nicht im Titel, nicht in Trefferliste, Sortierung, Suche oder Bedingungen', async () => {
    const t = await tresor();
    const { d, typ } = await mitZugang(t);
    const p = pruefeMappentyp({ ...typ, titelVorlage: '{name} {kennwort}' }, { namenAndererTypen: [], existiertTyp: () => true });
    assert.ok(p.allgemein.some((x) => /Titel/.test(x)));
    await assert.rejects(d.aendereTyp(typ.id, { ...typ, titelVorlage: '{kennwort}' }), (e: unknown) => e instanceof Fachfehler && e.status === 422);
    const geaendert = await d.aendereTyp(typ.id, { ...typ, trefferliste: ['_titel', 'name', 'kennwort'] });
    assert.deepEqual(geaendert.trefferliste, ['_titel', 'name'], 'Passwortfeld fällt aus der Trefferliste');
    assert.equal(titelAus({ ...typ, titelVorlage: '{name} {kennwort}' } as Mappentyp, { name: 'Bank', kennwort: 'dms1$x' }), 'Bank');
    assert.ok(!bedingungsfelder([typ]).some((f) => f.key === 'kennwort'));

    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', kennwort: { neu: 'geheim' } } });
    const roh = (await d.holeMappe(m.id)).mappe.werte.kennwort as string;
    const ich = { id: 'x', rolle: 'admin' };
    assert.equal((await d.seite(ich, { sicht: `typ:${typ.id}`, suche: roh.slice(5, 15) })).gesamt, 0, 'Geheimtext ist nicht durchsuchbar');
    assert.equal((await d.seite(ich, { sicht: `typ:${typ.id}`, suche: 'geheim' })).gesamt, 0, 'Klartext erst recht nicht');
  });

  it('gibt nie Geheimtext heraus; Anzeigen einzeln mit Protokoll, API nur mit eigenem Recht', async () => {
    const t = await tresor();
    const { d, typ } = await mitZugang(t);
    const konten = new Konten(speicherKontoRepo(), null, 'x');
    const { benutzer } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', kennwort: { neu: 'geheim' } } }, benutzer.id);
    const alle = routen(d, konten, { tresor: t });
    const route = (methode: string, pfad: string) => alle.find((r) => r.methode === methode && r.pfad === pfad)!;
    const anfrage = (x: Partial<Anfrage>): Anfrage => ({ body: {}, params: {}, query: {}, ip: '127.0.0.1', benutzer, ...x });

    const detail = await route('GET', '/api/mappen/:id').handler(anfrage({ params: { id: m.id } }));
    const text = JSON.stringify(detail.body);
    assert.ok(!text.includes('dms1$') && !text.includes('geheim'), text);
    assert.deepEqual((detail.body as { mappe: { werte: Record<string, unknown> } }).mappe.werte.kennwort, { gesetzt: true, lesbar: true });
    const seite = await route('GET', '/api/v1/mappen').handler(anfrage({ query: { sicht: `typ:${typ.id}` } }));
    assert.ok(!JSON.stringify(seite.body).includes('dms1$'));

    const vorher = protokoll.letzteNr;
    const gezeigt = await route('POST', '/api/mappen/:id/passwoerter/:feld').handler(anfrage({ params: { id: m.id, feld: 'kennwort' } }));
    assert.deepEqual(gezeigt.body, { wert: 'geheim' });
    const eintrag = protokoll.eintraege({ seit: vorher }).find((e) => e.text === 'Passwort angezeigt');
    assert.ok(eintrag, 'steht im Protokoll');
    assert.ok(!JSON.stringify(eintrag).includes('geheim'), 'ohne den Wert');

    const v1 = route('GET', '/api/v1/mappen/:id');
    await assert.rejects(v1.handler(anfrage({ params: { id: m.id }, query: { passwoerter: 'anzeigen' } })), (e: unknown) => e instanceof Fachfehler && e.status === 403);
    const schluessel = { id: 's', benutzerId: benutzer.id, name: 'Skript', praefix: 'dms_x', recht: 'lesen' as const, ablauf: null, erstellt: '', zuletztBenutzt: null };
    await assert.rejects(v1.handler(anfrage({ params: { id: m.id }, query: { passwoerter: 'anzeigen' }, apiSchluessel: { ...schluessel, passwoerter: false } })), /Recht/);
    const mitRecht = await v1.handler(anfrage({ params: { id: m.id }, query: { passwoerter: 'anzeigen' }, apiSchluessel: { ...schluessel, passwoerter: true } }));
    assert.equal((mitRecht.body as { mappe: { werte: Record<string, unknown> } }).mappe.werte.kennwort, 'geheim');
    const ohneParameter = await v1.handler(anfrage({ params: { id: m.id }, apiSchluessel: { ...schluessel, passwoerter: true } }));
    assert.deepEqual((ohneParameter.body as { mappe: { werte: Record<string, unknown> } }).mappe.werte.kennwort, { gesetzt: true, lesbar: true });
  });

  it('meldet Passwörter, deren Schlüssel fehlt, und maskiert sie als nicht lesbar', async () => {
    const t = await tresor();
    const { d, typ } = await mitZugang(t);
    const m = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', kennwort: { neu: 'geheim' } } });
    const fremd = await tresor();
    const d2 = new Dienst((d as unknown as { repo: never }).repo, speicherDateien(), { tresor: fremd });
    const betroffen = await d2.unlesbarePasswoerter();
    assert.deepEqual(betroffen.map((b) => b.was), ['Bank: Kennwort']);
    const roh = (await d.holeMappe(m.id)).mappe.werte.kennwort;
    assert.deepEqual(maskiere({ werte: { kennwort: roh } }, (v) => fremd.lesbar(v)), { werte: { kennwort: { gesetzt: true, lesbar: false } } });
    await assert.rejects(d2.zeigePasswort(m.id, 'kennwort'), /nicht lesbar/);
  });
});
