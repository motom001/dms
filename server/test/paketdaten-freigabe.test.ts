/**
 * Paket-Recht „Einrichtung lesen“ und „Nachweise lesen“ (#1054): Manifest, Rechte-Vorschau, Freigabe je Bereich mit
 * Vorgabe „nichts“, wer freigeben darf, Schnittmenge mit den Verwaltungsrechten der hinterlegten Person bei jedem
 * Abruf, 403 mit dem Namen des Bereichs, nie für Personen, nie mit Netz, frische Anmeldung für Zugang und Nachweise.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gleicheRechte, liesCode, rechtePunkte, rechteZeilen, type InstalliertesPaket, type PaketCode } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { Nachweisjournal, setzeNachweisjournal } from '../src/nachweisjournal';
import type { Benutzer } from '../../shared/src/model';
import type { PaketdatenAnsicht } from '../../shared/src/paketdaten';

const code = (x: Record<string, unknown>): PaketCode => { const r = liesCode({ sprache: 'c', ...x }); assert.deepEqual(r.fehler, []); return r.code!; };
const COMPLIANCE = { rechte: { einrichtung: ['sicherung', 'ablage', 'zugang'], nachweise: ['sicherung'] } };
const paket = (c: PaketCode, installiert = '2026-11-01T00:00:00.000Z'): InstalliertesPaket => ({
  id: 'compliance', name: 'Compliance', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.285.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert, installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...c, modul: { sha256: 'x', groesse: 1 } },
});

describe('Manifest und Rechte-Vorschau (#1054)', () => {
  it('liest die angefragten Bereiche, sortiert, und prüft sie', () => {
    const c = code({ rechte: { einrichtung: ['zugang', 'allgemein'], nachweise: ['sicherung'] } });
    assert.deepEqual(c.rechte.einrichtung, ['allgemein', 'zugang']);
    assert.deepEqual(c.rechte.nachweise, ['sicherung']);
    assert.match(liesCode({ sprache: 'c', rechte: { einrichtung: ['alles'] } }).fehler.join(), /Bereich „alles“/);
    assert.match(liesCode({ sprache: 'c', rechte: { nachweise: ['ablage'] } }).fehler.join(), /keine Nachweise/);
  });

  it('nie zusammen mit Netz oder Dienst-Adresse (Ergänzung Sicherheit)', () => {
    assert.match(liesCode({ sprache: 'c', rechte: { einrichtung: ['sicherung'] }, netz: ['https://api.example.org'] }).fehler.join(), /ohne Netz/);
    const adresse = [{ abschnitt: 'Dienst', felder: [{ schluessel: 'dienst', name: 'Adresse', typ: 'adresse' }] }];
    assert.match(liesCode({ sprache: 'c', rechte: { nachweise: ['zugang'] }, einstellungen: adresse }).fehler.join(), /ohne Netz/);
  });

  it('die Vorschau nennt die Bereiche; mehr Bereiche im Update brauchen eine neue Bestätigung', () => {
    const c = code(COMPLIANCE);
    const z = rechteZeilen(rechtePunkte(c, (v) => v)).join('\n');
    assert.match(z, /Einrichtung lesen, angefragt: Ablage, Zugang und Berechtigungen, Sicherung/);
    assert.match(z, /Nachweise lesen .*Sicherung/);
    assert.equal(gleicheRechte(c, code(COMPLIANCE)), true);
    assert.equal(gleicheRechte(c, code({ rechte: { ...COMPLIANCE.rechte, einrichtung: [...COMPLIANCE.rechte.einrichtung, 'betrieb'] } })), false);
  });
});

async function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
  const voll = async (b: Benutzer) => (await konten.listeBenutzer()).find((x) => x.id === b.id)!;
  await konten.setzeVerwaltung(await voll(lena), jonas.id, ['sicherung', 'pakete']);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await d.kern.repo.speicherePaket(paket(code(COMPLIANCE)));
  const tabelle = routen(d, konten, {});
  const rufe = async <T>(m: string, pfad: string, wer: Partial<Benutzer> & { id: string }, x: Partial<Anfrage> = {}): Promise<T> =>
    (await tabelle.find((r) => r.methode === m && r.pfad === pfad)!.handler({ body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x, benutzer: wer } as Anfrage)).body as T;
  const alsPaket = { id: 'konto-compliance', email: 'paket-compliance@dienst.invalid', name: 'Paket Compliance', rolle: 'mitglied' as const, art: 'dienst' as const, paketId: 'compliance', aktiv: true };
  const setze = async (wer: Benutzer, einrichtung: string[], nachweise: string[] = []) => rufe<PaketdatenAnsicht>('PUT', '/api/werkbank/pakete/:id/paketdaten', { ...(await voll(wer)), rolle: 'admin' }, { params: { id: 'compliance' }, body: { einrichtung, nachweise } });
  const lies = (bereich: string) => rufe<{ bereich: string }>('GET', '/api/paketdaten/einrichtung/:bereich', alsPaket, { params: { bereich } });
  return { d, konten, lena, jonas, voll, rufe, alsPaket, setze, lies, einstellungen };
}

const fehler = async (p: Promise<unknown>, status: number, text?: RegExp) => {
  const e = await p.then(() => null, (x: Fachfehler) => x);
  assert.ok(e, 'erwarteter Fehler blieb aus');
  assert.equal(e.status, status, e.message);
  if (text) assert.match(e.message, text);
};

describe('Freigabe je Bereich (#1054)', () => {
  it('Vorgabe: nichts angehakt – das Paket bekommt 403 mit dem Namen des Bereichs', async () => {
    const x = await aufbau();
    const a = await x.rufe<PaketdatenAnsicht>('GET', '/api/werkbank/pakete/:id/paketdaten', { ...(await x.voll(x.lena)), rolle: 'admin' }, { params: { id: 'compliance' } });
    assert.ok(a.bereiche.length === 4 && a.bereiche.every((b) => !b.angehakt));
    assert.equal(a.benutzer, null);
    await fehler(x.lies('sicherung'), 403, /Sicherung.*nicht freigegeben/);
    await fehler(x.lies('betrieb'), 403, /fragt den Bereich „Betrieb“ nicht an/);
  });

  it('nur, wer den Bereich verwaltet; Zugang und Nachweise nur mit Gesamter Verwaltung', async () => {
    const x = await aufbau();
    await x.setze(x.jonas, ['sicherung']);
    await fehler(x.setze(x.jonas, ['sicherung', 'ablage']), 403, /„Ablage“ darf nur freigeben/);
    await fehler(x.setze(x.jonas, ['sicherung'], ['sicherung']), 403, /Gesamte Verwaltung/);
    await fehler(x.setze(x.jonas, ['betrieb']), 422, /nicht an/);
    const a = await x.setze(x.lena, ['sicherung', 'zugang'], ['sicherung']);
    assert.deepEqual(a.bereiche.filter((b) => b.angehakt).map((b) => `${b.art}:${b.bereich}`), ['einrichtung:zugang', 'einrichtung:sicherung', 'nachweise:sicherung']);
    assert.equal(a.benutzer, 'Lena');
    assert.equal(a.verlauf.length, 2);
    // Paket-Verlauf (#1003): je Änderung ein Eintrag „Einstellungen“ mit den Bereichen.
    const v = await x.d.kern.repo.paketVerlauf('compliance', { anzahl: 10 });
    assert.ok(v.some((e) => e.art === 'einstellungen' && /Einrichtung zugang, sicherung; Nachweise sicherung/.test(e.was)), JSON.stringify(v));
  });

  it('das Paket liest nur Angehaktes, nie als Person', async () => {
    const x = await aufbau();
    await x.setze(x.jonas, ['sicherung']);
    assert.equal((await x.lies('sicherung')).bereich, 'sicherung');
    await fehler(x.lies('ablage'), 403, /Ablage/);
    await fehler(x.rufe('GET', '/api/paketdaten/einrichtung/:bereich', { ...(await x.voll(x.lena)), rolle: 'admin' }, { params: { bereich: 'sicherung' } }), 403, /nur Pakete/);
    await fehler(x.rufe('GET', '/api/paketdaten/nachweise/:bereich/:monat', x.alsPaket, { params: { bereich: 'sicherung', monat: '2026-11' } }), 403, /Nachweise/);
    await fehler(x.lies('gibtsnicht'), 404);
  });

  it('verliert die hinterlegte Person das Verwaltungsrecht, liefert der Bereich ab dann 403 – mit Hinweis am Haken', async () => {
    const x = await aufbau();
    await x.setze(x.jonas, ['sicherung']);
    await x.konten.setzeVerwaltung(await x.voll(x.lena), x.jonas.id, ['pakete']);
    await fehler(x.lies('sicherung'), 403, /verwaltet ihn nicht mehr/);
    const a = await x.rufe<PaketdatenAnsicht>('GET', '/api/werkbank/pakete/:id/paketdaten', { ...(await x.voll(x.lena)), rolle: 'admin' }, { params: { id: 'compliance' } });
    const s = a.bereiche.find((b) => b.art === 'einrichtung' && b.bereich === 'sicherung')!;
    assert.ok(s.angehakt && !s.wirksam);
  });

  it('Nachweise mit Gesamter Verwaltung; der Monat wird geprüft; Änderungen stehen im Journal', async () => {
    const x = await aufbau();
    const j = new Nachweisjournal(speicherEinstellungen());
    setzeNachweisjournal(j);
    try {
      await x.setze(x.lena, [], ['sicherung']);
      const n = await x.rufe<{ art: string; monat: string }>('GET', '/api/paketdaten/nachweise/:bereich/:monat', x.alsPaket, { params: { bereich: 'sicherung', monat: '2026-10' } });
      assert.deepEqual([n.art, n.monat], ['nachweise', '2026-10']);
      await fehler(x.rufe('GET', '/api/paketdaten/nachweise/:bereich/:monat', x.alsPaket, { params: { bereich: 'sicherung', monat: '2999-01' } }), 422);
      const m = await j.monat(new Date().toISOString().slice(0, 7));
      assert.ok(m.eintraege.some((e) => e.art === 'zugang.rechte' && e.daten.was === 'paket'));
    } finally { setzeNachweisjournal(null); }
  });

  it('Vergleich: Änderungen zum mitgeschickten Stand', async () => {
    const x = await aufbau();
    await x.setze(x.jonas, ['sicherung']);
    const r = await x.rufe<{ aenderungen: Array<{ pfad: string; art: string }> }>('POST', '/api/paketdaten/einrichtung/:bereich/vergleich', x.alsPaket, { params: { bereich: 'sicherung' }, body: { vorher: { eintraege: [{ kennung: 'sicherung.alt', pfad: 'sicherung.alt', bezeichnung: 'alt', wert: 1 }] } } });
    assert.ok(r.aenderungen.some((a) => a.pfad === 'sicherung.alt' && a.art === 'entfernt'));
  });

  it('nach Neuinstallation gilt die alte Freigabe nicht; neue Bereiche aus einem Update bleiben aus', async () => {
    const x = await aufbau();
    await x.setze(x.jonas, ['sicherung']);
    await x.d.kern.repo.speicherePaket(paket(code({ rechte: { einrichtung: ['sicherung', 'ablage', 'zugang', 'betrieb'], nachweise: ['sicherung'] } })));
    assert.equal((await x.lies('sicherung')).bereich, 'sicherung');
    await fehler(x.lies('betrieb'), 403, /Betrieb/);
    await x.d.kern.repo.speicherePaket(paket(code(COMPLIANCE), '2026-11-14T00:00:00.000Z'));
    await fehler(x.lies('sicherung'), 403, /nicht freigegeben/);
  });

  it('frische Anmeldung, sobald Zugang oder Nachweise angehakt sind', () => {
    const r = 'PUT /api/werkbank/pakete/:id/paketdaten'.split(' ');
    assert.equal(heikleHandlung(r[0], r[1], { einrichtung: ['sicherung'], nachweise: [] }), null);
    assert.equal(heikleHandlung(r[0], r[1], { einrichtung: ['zugang'] }), 'rechte');
    assert.equal(heikleHandlung(r[0], r[1], { nachweise: ['sicherung'] }), 'rechte');
  });
});
