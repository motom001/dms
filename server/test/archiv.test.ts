/** Archivmodus (#212): Frist, Löschsperre auf allen Wegen, Versionierung Pflicht, „Darf weg“, Dateien prüfen, Ausschalten. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { aufbewahrenBis, inFrist } from '../../shared/src/archiv';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const gesperrt = (e: unknown) => e instanceof Fachfehler && e.status === 409 && /Aufbewahrungspflicht bis/.test(e.message);
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

async function aufbau(papierkorb = 0) {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  if (papierkorb) await d.setzePapierkorbTage(papierkorb);
  const t = await d.legeTypAn({ name: 'Beleg', titelVorlage: '{name}', archiv: { jahre: 8, stichtag: 'datum' },
    felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' }],
    register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente', versionenBehalten: 2 }] });
  const jung = await d.legeMappeAn({ typId: t.id, werte: { name: 'Jung', datum: '2026-03-01' } });
  const alt = await d.legeMappeAn({ typId: t.id, werte: { name: 'Alt', datum: '2015-06-30' } });
  return { d, t, jung, alt, dateien };
}

describe('Archivmodus (#212)', () => {
  it('Frist: Jahresende des Stichtags + N Jahre; ohne Feld das Anlagedatum', () => {
    assert.equal(aufbewahrenBis({ jahre: 8, stichtag: 'datum' }, { werte: { datum: '2026-01-02' }, erstellt: '2020-01-01T00:00:00Z' }), '2034-12-31');
    assert.equal(aufbewahrenBis({ jahre: 2, stichtag: null }, { werte: {}, erstellt: '2025-12-31T23:30:00Z' }), '2028-12-31', 'Berlin: schon 2026');
    assert.equal(aufbewahrenBis({ jahre: 6, stichtag: 'datum' }, { werte: {}, erstellt: '2024-05-05T10:00:00Z' }), '2030-12-31', 'leeres Feld → Anlagedatum');
    assert.equal(aufbewahrenBis(null, { werte: {}, erstellt: '2024-05-05T10:00:00Z' }), null);
    assert.equal(inFrist('2026-12-31', new Date('2026-12-31T22:00:00Z')), true);
    assert.equal(inFrist('2026-12-31', new Date('2026-12-31T23:30:00Z')), false);
  });

  it('Einstellungen: Versionierung Pflicht, Stichtag muss ein Datumsfeld sein, Vorschau', async () => {
    const { d, t } = await aufbau();
    assert.deepEqual(t.archiv, { jahre: 8, stichtag: 'datum' });
    assert.equal(t.register.find((r) => r.key === 'belege')?.versionierung, true);
    assert.equal(t.register.find((r) => r.key === 'belege')?.versionenBehalten, undefined);
    await assert.rejects(d.legeTypAn({ name: 'X', archiv: { jahre: 8, stichtag: 'name' }, felder: [{ key: 'name', label: 'N', typ: 'text' }] }), (e) => e instanceof Fachfehler && e.status === 422);
    assert.deepEqual(await d.archivVorschau(t.id, { jahre: 8, stichtag: 'datum' }), { mappen: 2, darfWeg: 1 });
    assert.deepEqual(await d.archivVorschau(t.id, { jahre: 30, stichtag: 'datum' }), { mappen: 2, darfWeg: 0 });
  });

  it('keine Löschung vor Fristende: Mappe, Dokument, auch als Administrator; danach geht es', async () => {
    const { d, jung, alt } = await aufbau();
    await assert.rejects(d.loescheMappe(jung.id, ICH.id), gesperrt);
    const det = await d.holeMappe(jung.id);
    assert.equal(det.aufbewahrenBis, '2034-12-31');
    assert.equal(det.loeschbar.ok, false);
    const { dokument } = await d.ladeHoch(jung.id, { register: 'belege', name: 'R.pdf' }, Buffer.from('%PDF-1.4 a'), null);
    await assert.rejects(d.loescheDokument(dokument.id), gesperrt);
    // Ändern nur als neue Version; ältere bleiben (kein „nur die letzten N“)
    for (const x of ['b', 'c', 'd']) await d.ersetzeDokument(dokument.id, {}, Buffer.from(`%PDF-1.4 ${x}`), null);
    assert.equal((await d.versionen(dokument.id)).aeltere.length, 3);
    await assert.rejects(d.ladeHoch(jung.id, { register: 'belege', name: 'R.pdf', gleicherName: 'ersetzen' }, Buffer.from('x'), null), (e) => e instanceof Fachfehler && e.status === 409);
    // Abgelaufen: „Darf weg“, löschen geht
    const weg = await d.darfWeg();
    assert.deepEqual(weg.map((x) => [x.titel, x.aufbewahrenBis]), [['Alt', '2023-12-31']]);
    await d.loescheMappe(alt.id, ICH.id);
    assert.deepEqual(await d.darfWeg(), []);
  });

  it('Feldänderung verschiebt die Frist und steht in der Historie', async () => {
    const { d, jung } = await aufbau();
    await d.aendereMappe(jung.id, { werte: { ...jung.werte, datum: '2016-01-01' } });
    const h = (await d.historie(jung.id)).find((x) => x.art === 'geaendert');
    assert.ok(h?.daten.aenderungen?.some((a) => a.label === 'Aufbewahren bis' && a.alt === '31.12.2034' && a.neu === '31.12.2024'));
  });

  it('Papierkorb: vor dem Einschalten Gelöschtes bleibt bis Fristende', async () => {
    const dateien = speicherDateien();
    const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
    await d.setzePapierkorbTage(30);
    const t = await d.legeTypAn({ name: 'Brief', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'B' } });
    await d.loescheMappe(m.id, ICH.id);
    await d.aendereTyp(t.id, { ...t, archiv: { jahre: 6, stichtag: null } });
    await assert.rejects(d.loescheEndgueltig([m.id], ICH, true), gesperrt);
    assert.equal(await d.raeumePapierkorbAuf(Date.now() + 365 * 86_400_000), 0);
    // Ausschalten: dann geht es
    await d.aendereTyp(t.id, { ...t, archiv: null });
    assert.equal(await d.loescheEndgueltig([m.id], ICH, true), 1);
  });

  it('Alle Dateien prüfen findet veränderte und fehlende Dateien', async () => {
    const { d, jung, dateien } = await aufbau();
    await d.ladeHoch(jung.id, { register: 'belege', name: 'A.pdf' }, Buffer.from('%PDF-1.4 heil'), null);
    const b = (await d.ladeHoch(jung.id, { register: 'belege', name: 'B.pdf' }, Buffer.from('%PDF-1.4 kaputt'), null)).dokument;
    d.pruefeDateien('test');
    assert.deepEqual((await d.auftraege.warte())?.ergebnis, { dateien: 2, abweichungen: [] });
    // Datei manipulieren
    await dateien.schreibe(b.sha256, Buffer.from('anders'));
    d.pruefeDateien('test');
    const r = (await d.auftraege.warte())?.ergebnis as { abweichungen: Array<{ grund: string; dokumente: Array<{ name: string }> }> };
    assert.equal(r.abweichungen.length, 1);
    assert.equal(r.abweichungen[0].grund, 'Inhalt verändert');
    assert.equal(r.abweichungen[0].dokumente[0].name, 'B.pdf');
    assert.equal(createHash('sha256').update(Buffer.from('%PDF-1.4 kaputt')).digest('hex'), b.sha256);
  });
});
