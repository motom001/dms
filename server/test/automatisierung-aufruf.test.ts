/**
 * Wenn-Karte „Aufruf von außen“ (#679): Adresse und Geheimnis, Signatur (HMAC-SHA256 über Zeitstempel und Rumpf),
 * Zeitfenster, Wiederholschutz, Bremse je Adresse und IP-Bereich, einheitliche Ablehnung, Parameter nur als Text,
 * Pakete ohne diese Karte, Lauf-Daten nur für Verwaltende, Notfallblatt und Geheimnis-Art. Personen sind erfunden.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  AUFRUF_GRENZEN, aufrufParameter, automatisierungsProbleme, bereinigeAutomatisierung, kurzform, laufFuer, platzhalterFuer, type Lauf, type WennAufruf,
} from '../../shared/src/automatisierung';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { aufrufBereich, aufrufSignatur, pgAufrufRepo, signaturPasst, speicherAufrufRepo } from '../src/automatisierung/index';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { artVon, bestandAus } from '../src/geheimnisse';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherKurzzustand } from '../src/kurzzustand';
import { aufrufZeile, notfallblattPlan } from '../src/notfallblatt';
import { liesPaket, liesZip } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { zipPuffer } from '../src/zip';

/** Verschlüsseln wie der Tresor (Präfix „dms1$“), nur zum Lesen im Test umkehrbar. */
const verschluessele = (k: string) => `dms1$${Buffer.from(k).toString('base64url')}`;
const entschluessele = (w: string) => (w.startsWith('dms1$') ? Buffer.from(w.slice(5), 'base64url').toString() : null);

async function aufbau(o: { uhr?: () => number } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const repo = speicherAufrufRepo();
  const zustand = speicherKurzzustand(o.uhr);
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(o.uhr), uhr: o.uhr, aufruf: { repo, zustand: () => zustand, verschluessele, entschluessele, basis: () => 'https://ablago.example.org' } });
  const aufgabenVon = async (id: string) => (await d.ohneLeserecht.alleAufgaben()).filter((x) => x.empfaengerId === id);
  const lege = (wenn: Record<string, unknown> = { art: 'aufruf', parameter: ['raum', 'stufe'] }, text = 'Alarm im {raum} (Stufe {stufe}) um {zeitpunkt}') => motor.lege({
    name: 'Alarm von außen', aktiv: true, wenn,
    dann: [{ id: 'a', art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'person', id: markus.id }], text }],
  }, markus.id);
  return { d, konten, markus, motor, repo, zustand, aufgabenVon, lege };
}

/** Ein signierter Aufruf an die Adresse (Kennung aus der Adresse). */
function aufruf(adresse: string, geheimnis: string, rumpf: string | Buffer, o: { zeit?: number; ip?: string; signatur?: string } = {}) {
  const zeit = o.zeit ?? Math.floor(Date.now() / 1000);
  const r = Buffer.isBuffer(rumpf) ? rumpf : Buffer.from(rumpf);
  return { kennung: adresse.split('/').pop()!, zeit: String(zeit), signatur: o.signatur ?? aufrufSignatur(geheimnis, zeit, r), rumpf: r, ip: o.ip ?? '198.51.100.7' };
}

/** Bis der Lauf im Hintergrund fertig ist. */
async function warteAufLauf(motor: Automatisierungen, id: string, anzahl = 1): Promise<Lauf[]> {
  for (let i = 0; i < 200; i++) {
    const l = await motor.laeufe(id);
    if (l.length >= anzahl && l.every((x) => x.zustand !== 'laeuft')) return l;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Lauf kam nicht');
}

describe('Aufruf von außen: Karte, Parameter und Platzhalter (#679)', () => {
  it('Karte bereinigt: nur gültige, nicht reservierte Namen, ohne Doppelte, höchstens zehn', () => {
    const d = bereinigeAutomatisierung({ name: 'x', wenn: { art: 'aufruf', parameter: ['Raum', 'raum', 'stufe', 'titel', 'heute', '1x', 'a-b', 'x'.repeat(41), ...Array.from({ length: 20 }, (_, i) => `p${i}`)] }, dann: [{ id: 'a', art: 'stopp' }] });
    assert.equal(d.wenn.art, 'aufruf');
    const w = d.wenn as WennAufruf;
    assert.deepEqual(w.parameter.slice(0, 3), ['raum', 'stufe', 'p0']);
    assert.equal(w.parameter.length, AUFRUF_GRENZEN.parameter);
    assert.ok(!w.parameter.includes('titel') && !w.parameter.includes('heute'), 'Platzhalter lassen sich nicht überdecken');
  });

  it('Parameter: nur die Namen der Karte, nur Text, gekürzt, ohne Steuerzeichen – nie Objekte oder Felder', () => {
    const w: WennAufruf = { art: 'aufruf', parameter: ['raum', 'stufe', 'an'] };
    const p = aufrufParameter(w, { raum: 'Keller\n{titel}', stufe: 3, an: { feld: 'x' }, fremd: 'nein', __proto__: { raum: 'boese' }, lang: 'x' });
    assert.deepEqual(p, { raum: 'Keller {titel}', stufe: '3' });
    assert.equal(aufrufParameter(w, { raum: 'y'.repeat(2000) }).raum.length, AUFRUF_GRENZEN.wert);
    assert.deepEqual(aufrufParameter(w, ['raum']), {});
    assert.deepEqual(aufrufParameter(w, null), {});
  });

  it('Platzhalter, Kurzform und Probleme wie bei Karten ohne Mappe', () => {
    const w: WennAufruf = { art: 'aufruf', parameter: ['raum'] };
    assert.deepEqual(platzhalterFuer(w, null).map((x) => x.key), ['heute', 'automatisierung', 'zeitpunkt', 'raum']);
    const k = { typen: [], sichten: [], benutzer: [{ id: 'p1', name: 'Markus' }], rollen: [] };
    const d = bereinigeAutomatisierung({ name: 'A', wenn: w, dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: 'p1' }], text: 'x' }] });
    assert.match(kurzform(d, k), /Aufruf von außen \(raum\)/);
    assert.deepEqual(automatisierungsProbleme(d, k), []);
    const mitFeld = bereinigeAutomatisierung({ ...d, und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'x', op: 'leer' } }] }, dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'x' }] });
    const p = automatisierungsProbleme(mitFeld, k).join(' ');
    assert.match(p, /nur ein Merkmal der Ablage/);
    assert.match(p, /nur Personen und Rollen/);
  });

  it('Lauf-Daten: Parameter nur für wer „Automatisierungen“ verwaltet', () => {
    const l = { id: 'l', automatisierungId: 'a', ereignisId: 'e', art: 'aufruf', daten: { zeitpunkt: 'z', parameter: { raum: 'Keller' } } } as unknown as Lauf;
    assert.deepEqual(laufFuer(l, () => false).daten, { zeitpunkt: 'z' });
    assert.deepEqual(laufFuer(l, (b) => b === 'automatisierungen').daten, l.daten);
    assert.equal(laufFuer(l), l, 'intern unverändert');
  });

  it('Signatur wie beim Webhook (#627): v1= und HMAC über „<zeit>.<rumpf>“, auch mehrere durch Komma', () => {
    const s = aufrufSignatur('whsec_test', 1762154102, '{"a":1}');
    assert.match(s, /^v1=[0-9a-f]{64}$/);
    assert.ok(signaturPasst('whsec_test', 1762154102, Buffer.from('{"a":1}'), `v1=00, ${s}`));
    assert.ok(!signaturPasst('whsec_test', 1762154103, Buffer.from('{"a":1}'), s), 'anderer Zeitstempel');
    assert.ok(!signaturPasst('whsec_test', 1762154102, Buffer.from('{"a":2}'), s), 'anderer Rumpf');
    assert.ok(!signaturPasst('whsec_test', 1762154102, Buffer.from('{"a":1}'), `${s}0`), 'falsche Länge');
    assert.ok(!signaturPasst('whsec_test', 1762154102, Buffer.from('{"a":1}'), ''));
  });

  it('IP-Bereich der Bremse: IPv4 je /24, IPv6 je /64', () => {
    assert.equal(aufrufBereich('198.51.100.7'), '198.51.100.0/24');
    assert.equal(aufrufBereich('::ffff:198.51.100.200'), '198.51.100.0/24');
    assert.equal(aufrufBereich('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
    assert.equal(aufrufBereich('2001:db8:1:2:bbbb::9'), '2001:db8:1:2::/64');
  });

  it('heikle Handlung: Adresse anlegen braucht eine frische Anmeldung, Entfernen nicht', () => {
    assert.equal(heikleHandlung('POST', '/api/werkbank/automatisierungen/:id/aufruf', { was: 'adresse' }), 'aufruf');
    assert.equal(heikleHandlung('DELETE', '/api/werkbank/automatisierungen/:id/aufruf', null), null);
  });
});

describe('Aufruf von außen: Adresse, Signatur, Bremse (#679)', () => {
  it('ohne „Adresse anlegen“ keine Adresse; Geheimnis nur einmal, verschlüsselt gespeichert', async () => {
    const { motor, repo, lege, markus } = await aufbau();
    const a = await lege();
    assert.equal((await motor.hole(a.id)).aufruf, null, 'Speichern legt keine Adresse an');
    const r = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    assert.match(r.adresse, /^https:\/\/ablago\.example\.org\/api\/aufruf\/[A-Za-z0-9_-]{43}$/);
    assert.match(r.geheimnis, /^whsec_[A-Za-z0-9_-]{43}$/);
    assert.equal(r.oeffentlich, true);
    const e = (await repo.hole(a.id))!;
    assert.ok(e.geheimnis.startsWith('dms1$') && !e.geheimnis.includes(r.geheimnis), 'verschlüsselt');
    const ansicht = await motor.hole(a.id);
    assert.equal(ansicht.aufruf?.adresse, r.adresse);
    assert.ok(!JSON.stringify(ansicht).includes(r.geheimnis), 'die Karte zeigt das Geheimnis nicht mehr');
    assert.ok(!JSON.stringify(await motor.uebersicht()).includes(r.geheimnis));
    assert.equal(ansicht.ausloeser, `aufruf|${a.id}`, 'je Automatisierung ein eigener Auslöser');
  });

  it('gültiger Aufruf: angenommen, Lauf mit Parametern als Text, Aufgabe mit Platzhaltern', async () => {
    const { motor, lege, markus, aufgabenVon } = await aufbau();
    const a = await lege();
    const { adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    const r = await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, JSON.stringify({ raum: 'Keller', stufe: 2, fremd: '{titel}' })));
    assert.deepEqual(r, { art: 'angenommen' });
    const [l] = await warteAufLauf(motor, a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.equal(l.art, 'aufruf');
    assert.equal(l.mappeId, null);
    assert.deepEqual(l.daten.parameter, { raum: 'Keller', stufe: '2' }, 'nur die Namen der Karte');
    const [x] = await aufgabenVon(markus.id);
    assert.match(x.text, /^Alarm im Keller \(Stufe 2\) um \d/);
    assert.equal(x.mappeId, markus.id, 'an der Benutzer-Mappe des Empfängers');
  });

  it('leerer Rumpf geht; kein JSON-Objekt wird nach gültiger Signatur als Inhalt abgelehnt', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const { adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '')), { art: 'angenommen' });
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '[1,2]')), { art: 'inhalt' });
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, 'kein json')), { art: 'inhalt' });
  });

  it('abgelehnt – immer gleich: falsche Signatur, unbekannte Adresse, alter Zeitstempel, Wiederholung, ausgeschaltet', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const { adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    const jetzt = Math.floor(Date.now() / 1000);
    const abgelehnt = { art: 'abgelehnt' };
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, 'whsec_falsch', '{}')), abgelehnt, 'falsches Geheimnis');
    assert.deepEqual(await motor.aufrufAnnehmen({ ...aufruf(adresse, geheimnis, '{}'), signatur: undefined }), abgelehnt, 'ohne Signatur');
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(`x/${'A'.repeat(43)}`, geheimnis, '{}')), abgelehnt, 'unbekannte Adresse');
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf('x/kurz', geheimnis, '{}')), abgelehnt, 'falsche Form');
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '{}', { zeit: jetzt - AUFRUF_GRENZEN.fensterS - 5 })), abgelehnt, 'zu alt');
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '{}', { zeit: jetzt + AUFRUF_GRENZEN.fensterS + 5 })), abgelehnt, 'zu weit voraus');
    assert.deepEqual(await motor.aufrufAnnehmen({ ...aufruf(adresse, geheimnis, '{}'), zeit: 'gestern' }), abgelehnt, 'kein Zeitstempel');
    const einmal = aufruf(adresse, geheimnis, '{"raum":"Flur"}', { zeit: jetzt });
    assert.deepEqual(await motor.aufrufAnnehmen(einmal), { art: 'angenommen' });
    assert.deepEqual(await motor.aufrufAnnehmen(einmal), abgelehnt, 'dieselbe Signatur nur einmal');
    await warteAufLauf(motor, a.id);
    await motor.schalte(a.id, false, markus.id);
    assert.deepEqual(await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '{"raum":"Bad"}')), abgelehnt, 'ausgeschaltet');
    assert.equal((await motor.laeufe(a.id)).length, 1, 'nur der eine gültige Aufruf lief');
  });

  it('Bremse je Adresse und je IP-Bereich – für bekannte und unbekannte Adressen gleich', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const { adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    const erg: string[] = [];
    // Je Adresse: aus verschiedenen Netzen, damit die Bremse je Bereich nicht zuerst greift.
    for (let i = 0; i < AUFRUF_GRENZEN.jeAdresseJeMinute + 1; i++) erg.push((await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, `{"stufe":${i}}`, { ip: `203.0.${i}.9` }))).art);
    assert.deepEqual(erg.slice(0, AUFRUF_GRENZEN.jeAdresseJeMinute), Array(AUFRUF_GRENZEN.jeAdresseJeMinute).fill('angenommen'));
    assert.equal(erg.at(-1), 'bremse');
    // Unbekannte Adresse: dieselbe Bremse (verrät nicht, welche es gibt).
    const fremd = `x/${'B'.repeat(43)}`;
    const unbekannt: string[] = [];
    for (let i = 0; i < AUFRUF_GRENZEN.jeAdresseJeMinute + 1; i++) unbekannt.push((await motor.aufrufAnnehmen(aufruf(fremd, geheimnis, '{}', { ip: `192.0.2.${i}`, zeit: Math.floor(Date.now() / 1000) - i }))).art);
    assert.equal(unbekannt.at(-1), 'bremse');
    assert.ok(unbekannt.slice(0, -1).every((x) => x === 'abgelehnt'));
    // Je IP-Bereich: andere Adressen eines /24 und eines /64 zählen zusammen.
    const { motor: m2 } = await aufbau();
    const bereich: string[] = [];
    for (let i = 0; i < AUFRUF_GRENZEN.jeBereichJeMinute + 1; i++) bereich.push((await m2.aufrufAnnehmen(aufruf(`x/${String(i).padStart(43, 'C')}`, 'g', '{}', { ip: `2001:db8:5:6:${i.toString(16)}::1` }))).art);
    assert.equal(bereich.at(-1), 'bremse');
    assert.ok(bereich.slice(0, -1).every((x) => x === 'abgelehnt'));
  });

  it('Bremse über die Zeit: nach einer Minute wieder offen', async () => {
    let jetzt = Date.parse('2026-11-12T10:00:00Z');
    const { motor, lege, markus } = await aufbau({ uhr: () => jetzt });
    const a = await lege();
    const { adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    const z = () => Math.floor(jetzt / 1000);
    for (let i = 0; i < AUFRUF_GRENZEN.jeAdresseJeMinute; i++) await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, `{"stufe":${i}}`, { zeit: z(), ip: `203.0.${i}.1` }));
    assert.equal((await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '{"stufe":99}', { zeit: z(), ip: '203.0.99.1' }))).art, 'bremse');
    jetzt += 61_000;
    assert.equal((await motor.aufrufAnnehmen(aufruf(adresse, geheimnis, '{"stufe":100}', { zeit: z(), ip: '203.0.100.1' }))).art, 'angenommen');
  });

  it('Neues Geheimnis und neue Adresse: das Alte gilt sofort nicht mehr', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const erst = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    const neu = await motor.aufrufAnlegen(a.id, 'geheimnis', markus.id);
    assert.equal(neu.adresse, erst.adresse, 'Adresse bleibt');
    assert.notEqual(neu.geheimnis, erst.geheimnis);
    assert.equal((await motor.aufrufAnnehmen(aufruf(erst.adresse, erst.geheimnis, '{"stufe":1}'))).art, 'abgelehnt');
    assert.equal((await motor.aufrufAnnehmen(aufruf(neu.adresse, neu.geheimnis, '{"stufe":2}'))).art, 'angenommen');
    const andere = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    assert.notEqual(andere.adresse, erst.adresse);
    assert.equal((await motor.aufrufAnnehmen(aufruf(erst.adresse, andere.geheimnis, '{"stufe":3}'))).art, 'abgelehnt', 'alte Adresse');
    assert.equal((await motor.aufrufAnnehmen(aufruf(andere.adresse, andere.geheimnis, '{"stufe":4}'))).art, 'angenommen');
  });

  it('Wenn-Karte geändert, Adresse entfernt oder Automatisierung gelöscht: Adresse weg', async () => {
    const { motor, repo, lege, markus } = await aufbau();
    const a = await lege();
    await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    await motor.aendere(a.id, { wenn: { art: 'mappe.angelegt', typ: null } }, markus.id);
    assert.equal(await repo.hole(a.id), undefined, 'Karte geändert');
    await assert.rejects(motor.aufrufAnlegen(a.id, 'adresse', markus.id), (e: Fachfehler) => e.status === 409);
    const b = await lege();
    await motor.aufrufAnlegen(b.id, 'adresse', markus.id);
    await motor.aufrufEntfernen(b.id);
    assert.equal(await repo.hole(b.id), undefined, 'von Hand');
    await assert.rejects(motor.aufrufAnlegen(b.id, 'geheimnis', markus.id), (e: Fachfehler) => e.status === 409, 'Geheimnis erst mit Adresse');
    const c = await lege();
    await motor.aufrufAnlegen(c.id, 'adresse', markus.id);
    await motor.loesche(c.id);
    assert.equal(await repo.hole(c.id), undefined, 'gelöscht');
    const kopie = await motor.kopiere(b.id, markus.id);
    assert.equal((await motor.hole(kopie.id)).aufruf, null, 'eine Kopie bringt keine Adresse mit');
  });

  it('Übersicht und Notfallblatt: nur eingeschaltete mit Adresse; „Alle abschalten“ schaltet sie aus', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const b = await lege();
    await lege();
    const { adresse } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id);
    await motor.aufrufAnlegen(b.id, 'adresse', markus.id);
    await motor.schalte(b.id, false, markus.id);
    assert.deepEqual((await motor.warnungen()).aufrufe, [{ id: a.id, name: 'Alarm von außen', adresse }]);
    assert.equal(await motor.aufrufeAbschalten([a.id, b.id, 'fremd'], markus.id), 1);
    assert.equal((await motor.hole(a.id)).aktiv, false);
    assert.deepEqual((await motor.warnungen()).aufrufe, []);
    const zeile = aufrufZeile([{ name: 'Alarm', adresse }]);
    assert.match(zeile, /Alarm \(…\/api\/aufruf\/[A-Za-z0-9_-]{8}…\)/);
    assert.ok(!zeile.includes(adresse.split('/').pop()!), 'Kennung gekürzt');
    const plan = notfallblattPlan({ name: 'Ablage', haushaltId: 'h', adresse: 'https://ablago.example.org', version: '1', erstellt: new Date(), schluessel: 'A'.repeat(43), fingerabdruck: 'F', aufrufe: [{ name: 'Alarm', adresse }] });
    assert.ok(plan.ablage.zeilen.some((z) => z.marke === 'Aufrufe von außen' && z.text.includes('Alarm')));
    assert.ok(!notfallblattPlan({ name: 'Ablage', haushaltId: 'h', adresse: '', version: '1', erstellt: new Date(), schluessel: 'A'.repeat(43), fingerabdruck: 'F' }).ablage.zeilen.some((z) => z.marke === 'Aufrufe von außen'));
    const viele = aufrufZeile(Array.from({ length: 8 }, (_, i) => ({ name: `A${i}`, adresse })));
    assert.match(viele, /und 3 weitere/);
  });

  it('Probelauf ohne Mappe mit Beispielwerten; Wartung: 503', async () => {
    const { motor, lege, markus } = await aufbau();
    const a = await lege();
    const l = await motor.wiedergeben(a.id, null, true);
    assert.equal(l.test, true);
    assert.deepEqual(l.daten.parameter, { raum: 'Beispielwert', stufe: 'Beispielwert' });
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    const ruht = new Automatisierungen({ dienst: (await aufbau()).d, repo: speicherAutomatisierungRepo(), pause: () => 'Wartungsmodus', aufruf: { verschluessele, entschluessele } });
    await assert.rejects(ruht.aufrufAnnehmen(aufruf(`x/${'D'.repeat(43)}`, 'g', '{}')), (e: Fachfehler) => e.status === 503);
    assert.ok(markus);
  });

  it('mitgelieferte Automatisierungen: keine Adresse; Pakete bringen die Karte nicht mit', async () => {
    const { motor, markus } = await aufbau();
    const p = await motor.lege({ name: 'Aus Paket', wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'a', art: 'stopp' }] }, null, 'paket');
    await assert.rejects(motor.aufrufAnlegen(p.id, 'adresse', markus.id), (e: Fachfehler) => e.status === 409);
    const archiv = zipPuffer([
      { name: 'manifest.yaml', daten: Buffer.from('schema: 1\nid: aussen\nname: Außen\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt:\n  automatisierungen: inhalt/automatisierungen.yaml\n') },
      { name: 'inhalt/automatisierungen.yaml', daten: Buffer.from('- schluessel: rein\n  name: Rein\n  wenn: { art: aufruf, parameter: [raum] }\n  dann:\n    - { art: stopp }\n') },
    ], new Date('2026-01-01T12:00:00Z'));
    let fehler = '';
    try { liesPaket(liesZip(archiv)); } catch (e) { fehler = [(e as Error).message, ...(((e as Fachfehler).details as { gruende?: string[] })?.gruende ?? [])].join(' | '); }
    assert.match(fehler, /„Aufruf von außen“ gibt es nur in der Werkbank/);
  });

  it('Geheimnis-Art „aufruf“ im Bestand der Verschlüsselung', () => {
    assert.equal(artVon({ quelle: 'aufruf', schluessel: 'x' }), 'aufruf');
    const { arten, betroffen } = bestandAus([{ quelle: 'aufruf', schluessel: 'a1', wert: 'dms1$kaputt', titel: 'Alarm' }], () => false);
    assert.equal(arten.find((a) => a.art === 'aufruf')?.anzahl, 1);
    assert.match(betroffen[0].was, /Alarm/);
  });
});

describe('Aufruf von außen über HTTP (#679)', () => {
  type App = { inject(o: { method: string; url: string; payload?: string | Buffer; headers?: Record<string, string> }): Promise<{ statusCode: number; body: string }>; close(): Promise<void> };
  let app: App;
  let adresse = '';
  let geheimnis = '';
  before(async () => {
    const { d, konten, motor, lege, markus } = await aufbau();
    const a = await lege();
    ({ adresse, geheimnis } = await motor.aufrufAnlegen(a.id, 'adresse', markus.id));
    const { baueApp } = await import('../src/http');
    app = await baueApp(d, konten, { automatisierungen: motor }) as unknown as App;
  });
  after(async () => { await app?.close(); });
  const pfad = () => new URL(adresse).pathname;
  const sende = (rumpf: string, o: { geheimnis?: string; pfad?: string; typ?: string; zeit?: number } = {}) => {
    const zeit = o.zeit ?? Math.floor(Date.now() / 1000);
    return app.inject({ method: 'POST', url: o.pfad ?? pfad(), payload: rumpf, headers: {
      'x-dms': '1', 'content-type': o.typ ?? 'application/json', 'x-dms-zeit': String(zeit), 'x-dms-signatur': aufrufSignatur(o.geheimnis ?? geheimnis, zeit, rumpf),
    } });
  };

  it('angenommen: 202 und nur „angenommen“ – die Signatur gilt über die Bytes, wie sie ankamen', async () => {
    // Absichtlich nicht so geschrieben, wie JSON.stringify es täte (Leerzeichen): Ablago liest den Rumpf nicht vorher.
    const r = await sende('{ "raum" : "Keller" }');
    assert.equal(r.statusCode, 202, r.body);
    assert.deepEqual(JSON.parse(r.body), { ergebnis: 'angenommen' });
    const t = await sende('raum=Keller', { typ: 'text/plain' });
    assert.equal(t.statusCode, 422, 'nach gültiger Signatur: Inhalt kein JSON-Objekt');
  });

  it('abgelehnt: dieselbe Antwort für unbekannte Adresse und falsche Signatur', async () => {
    const falsch = await sende('{}', { geheimnis: 'whsec_falsch' });
    const fremd = await sende('{}', { pfad: `/api/aufruf/${'E'.repeat(43)}` });
    assert.equal(falsch.statusCode, 401);
    assert.equal(fremd.statusCode, 401);
    assert.equal(falsch.body, fremd.body);
  });

  it('nur POST, Rumpf höchstens 16 KB', async () => {
    assert.equal((await app.inject({ method: 'GET', url: pfad() })).statusCode, 404);
    const gross = await sende(JSON.stringify({ raum: 'x'.repeat(20 * 1024) }));
    assert.equal(gross.statusCode, 413);
  });
});

describe('Aufruf von außen in PostgreSQL (#679)', { skip: !process.env.TEST_DATABASE_URL }, () => {
  it('Tabelle, Umschlüsseln, Fundstellen und Löschen mit der Automatisierung', async () => {
    const { eigeneDatenbank } = await import('./hilfe-db');
    const db = await eigeneDatenbank('aufruf');
    const { pgRepo } = await import('../src/repo-pg');
    const { pgAutomatisierungRepo } = await import('../src/automatisierung');
    const haushalt = (await db.sql`SELECT id FROM haushalte LIMIT 1`)[0]?.id as string ?? (await db.sql`INSERT INTO haushalte (id, name) VALUES (gen_random_uuid(), 'Test') RETURNING id`)[0].id as string;
    const autos = pgAutomatisierungRepo(db.sql, haushalt);
    const id = crypto.randomUUID();
    const jetzt = new Date().toISOString();
    await autos.lege({ ...bereinigeAutomatisierung({ name: 'Alarm', wenn: { art: 'aufruf', parameter: ['raum'] }, dann: [{ id: 'a', art: 'stopp' }] }), id, aktiv: true, angehalten: null, herkunft: 'eigen', version: 1, erstellt: jetzt, erstelltVon: null, geaendert: jetzt, geaendertVon: null });
    const repo = pgAufrufRepo(db.sql, haushalt);
    const kennung = 'K'.repeat(43);
    await repo.setze({ automatisierungId: id, kennung, geheimnis: verschluessele('whsec_alt'), erstellt: jetzt, erstelltVon: null, geheimnisSeit: jetzt });
    assert.equal((await repo.finde(kennung))?.automatisierungId, id);
    assert.equal(await repo.finde('kurz'), undefined);
    const r = pgRepo(db.sql, haushalt);
    const funde = await r.verschluesselteFundstellen();
    const f = funde.find((x) => x.quelle === 'aufruf');
    assert.equal(f?.schluessel, id);
    assert.equal(f?.titel, 'Alarm');
    const x = await r.umschluesseln((w) => verschluessele(`neu:${entschluessele(w)}`), {});
    assert.ok(x.umgeschluesselt >= 1);
    assert.equal(entschluessele((await repo.hole(id))!.geheimnis), 'neu:whsec_alt', 'beim Schlüsselwechsel umgeschlüsselt');
    await assert.rejects(repo.setze({ automatisierungId: crypto.randomUUID(), kennung, geheimnis: 'x', erstellt: jetzt, erstelltVon: null, geheimnisSeit: jetzt }), 'Kennung eindeutig (und Automatisierung muss es geben)');

    // Zwei Prozesse (zwei Dienste) an derselben Datenbank: Wiederholschutz und Bremse gelten für beide zusammen.
    const { pgKurzzustand } = await import('../src/kurzzustand');
    const { Aufrufe } = await import('../src/automatisierung/index');
    const zustand = pgKurzzustand(db.sql, haushalt);
    const ausgeloest: string[] = [];
    const prozess = () => new Aufrufe({ repo, zustand: () => zustand, verschluessele, entschluessele, automatisierung: (x) => autos.hole(x), ausloesen: async (_a, e) => { ausgeloest.push(e); } });
    const [p1, p2] = [prozess(), prozess()];
    const g = 'neu:whsec_alt';
    const ruf = aufruf(`x/${kennung}`, g, '{"raum":"Keller"}');
    assert.equal((await p1.annehmen(ruf)).art, 'angenommen');
    assert.equal((await p2.annehmen(ruf)).art, 'abgelehnt', 'dieselbe Signatur beim anderen Prozess');
    const arten: string[] = [];
    for (let i = 0; i < AUFRUF_GRENZEN.jeAdresseJeMinute; i++) arten.push((await (i % 2 ? p1 : p2).annehmen(aufruf(`x/${kennung}`, g, `{"stufe":${i}}`, { ip: `203.0.${i}.1` }))).art);
    assert.equal(arten.at(-1), 'bremse', 'Bremse je Adresse über beide Prozesse');
    // Die Wiederholung oben zählt mit (gezählt wird vor jeder Prüfung): 12 Plätze, einer davon abgelehnt.
    assert.equal(ausgeloest.length, AUFRUF_GRENZEN.jeAdresseJeMinute - 1, 'genau die angenommenen');
    await autos.loesche(id);
    assert.equal(await repo.hole(id), undefined, 'geht mit der Automatisierung');
    await db.ende();
  });
});
