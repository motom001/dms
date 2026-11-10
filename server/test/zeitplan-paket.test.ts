/**
 * „Paket nach Zeitplan ausführen“ (#1082): Dann-Karte, Ereignis `zeitplan.ausgefuehrt` an genau das Paket der Karte (mit
 * Ereignis-Id gegen Doppeltes), nur das eigene Paket bei mitgelieferten Automatisierungen, nur Pakete mit dem Ereignis bei
 * selbst angelegten, „läuft ins Leere“ ohne Fehlerflut, `eingeschaltet: true` beim Installieren (vorausgewählt, abwählbar,
 * Update ändert an/aus nie) und die Rechte-Vorschau. Pakete und Namen sind erfunden; der Kern läuft im Arbeitsspeicher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { automatisierungsProbleme, bereinigeAutomatisierung, kurzform, paketKarteLeer } from '../../shared/src/automatisierung';
import { liesCode, rechtePunkte, rechteZeilen, vorausgewaehlt, EREIGNISSE_OHNE_INHALT, istKiPaket } from '../../shared/src/pakete';
import { setzeZeitzone } from '../../shared/src/region';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { zeitpunktIn } from '../src/zeitplan';
import { zipPuffer } from '../src/zip';

setzeZeitzone('Europe/Berlin');

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

const WASM = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const archiv = (d: Record<string, string | Buffer>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.isBuffer(inhalt) ? inhalt : Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const MAPPENTYP = `- schluessel: vertrag
  name: Vertrag
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text, maxLen: 40 }
    - { key: kuendigen_bis, label: Kündigen bis, typ: datum }
  register:
    - { key: vertrag, name: Vertrag, art: felder, felder: [bezeichnung, kuendigen_bis] }
`;
/** Wie im Entwurf des Pakets Verträge (dms-registry #171): eine Erinnerung (ohne Angabe) und der tägliche Lauf (an). */
const AUTOS = (extra = '') => `- schluessel: kuendigen_bis
  name: Vertrag rechtzeitig kündigen
  wenn: { art: datum, typ: vertrag, feld: kuendigen_bis, vorlauf: 30, einheit: tage, uhrzeit: "07:00" }
  dann:
    - { art: aufgabe, als: aufgabe, empfaenger: [{ art: ersteller }], text: "Kündigen bis {datum}" }
- schluessel: taeglich_pruefen
  name: Verträge täglich prüfen
  beschreibung: Jeden Morgen rechnet das Paket den Status aller Verträge neu.
  eingeschaltet: true
  wenn: { art: zeitplan, uhrzeit: "05:00", tage: [1, 2, 3, 4, 5, 6, 7] }
  dann:
    - { art: paket, aufgabe: taeglich }
${extra}`;
const CODE = (ereignisse = '[mappe.geaendert, zeitplan.ausgefuehrt]') => `code:\n  sprache: c\n  quelle: code/\n  ereignisse: ${ereignisse}\n  mappentypen: [vertrag]\n  rechte:\n    lesen: [vertrag]\n    schreiben: [vertrag]\n`;
const vertraege = (o: { autos?: string; code?: string; version?: string } = {}) => ({
  'manifest.yaml': `schema: 1\nid: vertraege\nname: Verträge\nversion: ${o.version ?? '1.0.0'}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  automatisierungen: inhalt/automatisierungen.yaml\n${o.code ?? CODE()}`,
  'inhalt/mappentypen.yaml': MAPPENTYP,
  'inhalt/automatisierungen.yaml': o.autos ?? AUTOS(),
  'code/modul.wasm': WASM,
});
/** Ein Paket mit Code, das keine Zeitpläne annimmt. */
const OHNE_ZEITPLAN = {
  'manifest.yaml': 'schema: 1\nid: rechnungen\nname: Rechnungen\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [paket.einstellungen_geaendert]\n',
  'code/modul.wasm': WASM,
};
/** Ein zweites Paket, das Zeitpläne annimmt (für selbst angelegte Automatisierungen). */
const COMPLIANCE = {
  'manifest.yaml': 'schema: 1\nid: compliance\nname: Compliance\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  ereignisse: [zeitplan.ausgefuehrt]\n',
  'code/modul.wasm': WASM,
};

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
/** Dienstag, 10.11.2026, um `uhr` in Berlin (MEZ, UTC+1). */
const am = (uhr: string, tag = '2026-11-10') => Date.parse(`${tag}T${uhr}:00+01:00`);

async function aufbau(uhr = am('04:00')) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const zeit = { jetzt: uhr };
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(() => zeit.jetzt), uhr: () => zeit.jetzt });
  const p = new Paketverwaltung(d, { version: () => '0.231.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
  const hoch = async (dateien: Record<string, string | Buffer>) => p.hochladen(archiv(dateien), ICH);
  const installiere = async (dateien: Record<string, string | Buffer>, mehr: { automatisierungen?: string[] } = {}) => { const h = await hoch(dateien); return p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true, ...mehr }, ICH); };
  const auto = async (name: string) => (await motor.uebersicht()).automatisierungen.find((a) => a.name === name)!;
  /** Ereignisse in der Zustellung des Paket-Läufers. */
  const zustellung = async () => d.kern.repo.faelligeEreignisse(100);
  return { d, konten, markus, motor, zeit, p, hoch, installiere, auto, zustellung };
}

describe('„Paket nach Zeitplan ausführen“ (#1082): Karte und Prüfung', () => {
  it('bereinigt, Kurzform, nur mit Zeitplan (nicht für jeden Benutzer), Paket entfernt ist kein Problem', () => {
    const a = bereinigeAutomatisierung({ name: 'Täglich', wenn: { art: 'zeitplan', uhrzeit: '05:00', tage: [1, 2, 3, 4, 5, 6, 7] }, dann: [{ id: 'p1', art: 'paket', paket: 'vertraege', aufgabe: 'taeglich', fremd: 1 }] });
    assert.deepEqual(a.dann, [{ id: 'p1', art: 'paket', paket: 'vertraege', aufgabe: 'taeglich' }]);
    assert.equal(bereinigeAutomatisierung({ dann: [{ art: 'paket', paket: '../x', aufgabe: 'Böse Aufgabe' }] }).dann[0].art, 'paket');
    assert.deepEqual(bereinigeAutomatisierung({ dann: [{ id: 'p', art: 'paket', paket: '../x', aufgabe: 'Böse Aufgabe' }] }).dann[0], { id: 'p', art: 'paket', paket: '', aufgabe: null });
    const pakete = [{ id: 'vertraege', name: 'Verträge', zeitplan: true, aufgaben: ['taeglich'] }];
    const k = { typen: [], sichten: [], benutzer: [], rollen: [], pakete };
    assert.equal(kurzform(a, k), 'Wenn täglich um 05:00 → Paket „Verträge“ ausführen (taeglich)');
    assert.deepEqual(automatisierungsProbleme(a, k), []);
    assert.deepEqual(automatisierungsProbleme(a, { ...k, pakete: [] }), [], 'entfernt: kein Problem, die Karte läuft ins Leere');
    assert.match(paketKarteLeer('vertraege', []) ?? '', /Paket „vertraege“ ist nicht installiert/);
    assert.match(paketKarteLeer('vertraege', [{ ...pakete[0], zeitplan: false }]) ?? '', /nimmt keine Zeitpläne an/);
    assert.equal(paketKarteLeer('vertraege', pakete), null);
    const jeBenutzer = bereinigeAutomatisierung({ ...a, wenn: { art: 'zeitplan', jeBenutzer: true } });
    assert.ok(automatisierungsProbleme(jeBenutzer, k).some((p) => /braucht die Wenn-Karte „Zeitplan“/.test(p)));
    const ereignis = bereinigeAutomatisierung({ ...a, wenn: { art: 'mappe.angelegt' } });
    assert.ok(automatisierungsProbleme(ereignis, k).some((p) => /braucht die Wenn-Karte „Zeitplan“/.test(p)));
  });

  it('Zeitpunkt in der Zeitzone der Ablage, auch an der Zeitumstellung', () => {
    assert.equal(zeitpunktIn('2026-11-10', '05:00'), '2026-11-10T04:00:00.000Z');
    assert.equal(zeitpunktIn('2026-07-10', '05:00'), '2026-07-10T03:00:00.000Z');
    assert.equal(zeitpunktIn('2026-03-29', '02:30'), '2026-03-29T01:30:00.000Z', 'gibt es nicht: die Stunde danach');
    assert.equal(zeitpunktIn('2026-10-25', '02:30'), '2026-10-25T00:30:00.000Z', 'gibt es zweimal: das erste');
    assert.equal(zeitpunktIn('2026-11-10', '23:30', 'America/New_York'), '2026-11-11T04:30:00.000Z');
  });

  it('das Ereignis trägt keinen Inhalt der Ablage – ein Paket mit Netz wird dadurch kein KI-Dienst', () => {
    assert.ok(EREIGNISSE_OHNE_INHALT.includes('zeitplan.ausgefuehrt'));
    const c = liesCode({ sprache: 'c', ereignisse: ['zeitplan.ausgefuehrt'], netz: ['https://example.org'] });
    assert.deepEqual(c.fehler, []);
    assert.equal(istKiPaket(c.code!), false);
  });
});

describe('Paketformat (#1082): Karte paket, Ereignis zeitplan.ausgefuehrt, eingeschaltet', () => {
  it('liest eingeschaltet und die Karte wie im Entwurf der Registry', () => {
    const p = liesPaket(liesZip(archiv(vertraege())));
    assert.deepEqual(p.automatisierungen.map((a) => [a.schluessel, a.eingeschaltet]), [['kuendigen_bis', undefined], ['taeglich_pruefen', true]]);
    assert.deepEqual(p.manifest.code && (p.manifest.code as { ereignisse: string[] }).ereignisse, ['mappe.geaendert', 'zeitplan.ausgefuehrt']);
  });

  it('nur das Paket selbst, nur mit Zeitplan, nur mit dem Ereignis, gültige Aufgabe, eingeschaltet als true/false', () => {
    const mit = (autos: string, code?: string) => () => liesPaket(liesZip(archiv(vertraege({ autos, code }))));
    assert.throws(mit(AUTOS().replace('{ art: paket, aufgabe: taeglich }', '{ art: paket, paket: rechnungen, aufgabe: taeglich }')), gruende(/ruft nur das Paket selbst auf – „rechnungen“/));
    assert.doesNotThrow(mit(AUTOS().replace('{ art: paket, aufgabe: taeglich }', '{ art: paket, paket: vertraege, aufgabe: taeglich }')));
    assert.throws(mit(AUTOS(), CODE('[mappe.geaendert]')), gruende(/braucht zeitplan.ausgefuehrt in code.ereignisse/));
    assert.throws(mit(AUTOS().replace('{ art: zeitplan, uhrzeit: "05:00", tage: [1, 2, 3, 4, 5, 6, 7] }', '{ art: zeitplan, uhrzeit: "05:00", jeBenutzer: true }')), gruende(/braucht die Wenn-Karte „zeitplan“/));
    assert.throws(mit(AUTOS().replace('{ art: zeitplan, uhrzeit: "05:00", tage: [1, 2, 3, 4, 5, 6, 7] }', '{ art: mappe.angelegt, typ: vertrag }')), gruende(/braucht die Wenn-Karte „zeitplan“/));
    assert.throws(mit(AUTOS().replace('aufgabe: taeglich', 'aufgabe: "Täglich!"')), gruende(/keine gültige Kennung/));
    assert.throws(mit(AUTOS().replace('eingeschaltet: true', 'eingeschaltet: ja bitte')), gruende(/eingeschaltet ist true oder false/));
  });
});

describe('Installieren (#1082): eingeschaltet, Abwählen, Update, Rechte-Vorschau', () => {
  it('Vorschau: Haken gesetzt, Zeitplan sichtbar, Rechte-Vorschau „Läuft nach Zeitplan …“', async () => {
    const x = await aufbau();
    const { vorschau: v } = await x.hoch(vertraege());
    assert.deepEqual(v.automatisierungen.map((a) => [a.schluessel, a.eingeschaltet, a.zeitplan, a.neu]), [['kuendigen_bis', undefined, undefined, true], ['taeglich_pruefen', true, 'täglich um 05:00', true]]);
    // Nennt das Paket eingeschaltet, sind genau diese vorausgewählt; Pakete ohne die Angabe wie bisher alle.
    assert.deepEqual(vorausgewaehlt(v.automatisierungen), ['taeglich_pruefen']);
    assert.deepEqual(vorausgewaehlt([{ schluessel: 'a' }, { schluessel: 'b' }]), ['a', 'b']);
    const zeilen = rechteZeilen(v.laeufer!.rechte).join('\n');
    assert.match(zeilen, /Läuft nach Zeitplan: Verträge täglich prüfen \(täglich um 05:00\)/);
    assert.match(zeilen, /keine weiteren Rechte/);
    assert.match(zeilen, /Ein Zeitplan ist erreicht/, 'das Ereignis steht in der Liste');
    // Ohne mitgelieferten Zeitplan kein solcher Punkt.
    const c = liesCode({ sprache: 'c', ereignisse: ['zeitplan.ausgefuehrt'] }).code!;
    assert.doesNotMatch(rechteZeilen(rechtePunkte(c, (s) => s)).join('\n'), /Läuft nach Zeitplan/);
  });

  it('ohne Angabe: eingeschaltet: true ist an, der Rest aus; die Karte zeigt auf das Paket selbst', async () => {
    const x = await aufbau();
    await x.installiere(vertraege());
    const taeglich = await x.auto('Verträge täglich prüfen');
    assert.equal(taeglich.aktiv, true);
    assert.equal(taeglich.herkunft, 'paket');
    assert.deepEqual(taeglich.dann.map((k) => k.art === 'paket' && [k.paket, k.aufgabe]), [['vertraege', 'taeglich']]);
    assert.equal((await x.auto('Vertrag rechtzeitig kündigen')).aktiv, false);
  });

  it('abgewählt (leere Liste) bleibt aus; angehakt ist an', async () => {
    const x = await aufbau();
    await x.installiere(vertraege(), { automatisierungen: [] });
    assert.equal((await x.auto('Verträge täglich prüfen')).aktiv, false);
    const y = await aufbau();
    await y.installiere(vertraege(), { automatisierungen: ['kuendigen_bis'] });
    assert.equal((await y.auto('Verträge täglich prüfen')).aktiv, false);
    assert.equal((await y.auto('Vertrag rechtzeitig kündigen')).aktiv, true);
  });

  it('ein Update ändert an/aus einer installierten Automatisierung nie', async () => {
    const x = await aufbau();
    await x.installiere(vertraege());
    const a = await x.auto('Verträge täglich prüfen');
    await x.motor.schalte(a.id, false, x.markus.id);
    await x.installiere(vertraege({ version: '1.1.0' }));
    assert.equal((await x.auto('Verträge täglich prüfen')).aktiv, false, 'ausgeschaltet bleibt aus');
    await x.motor.schalte(a.id, true, x.markus.id);
    await x.installiere(vertraege({ version: '1.2.0' }), { automatisierungen: [] });
    assert.equal((await x.auto('Verträge täglich prüfen')).aktiv, true, 'eingeschaltet bleibt an, auch ohne Haken');
  });
});

describe('Zustellung (#1082): zeitplan.ausgefuehrt an das Paket', () => {
  it('zur Uhrzeit genau einmal je Tag, mit automatisierung, aufgabe, zeitpunkt und datum; Verlauf nennt den Lauf', async () => {
    const x = await aufbau(am('04:30'));
    await x.installiere(vertraege());
    await x.installiere(COMPLIANCE);
    const a = await x.auto('Verträge täglich prüfen');
    await x.motor.zeitplan();
    assert.deepEqual((await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt'), [], 'vor 05:00 nichts');
    x.zeit.jetzt = am('05:01');
    await x.motor.zeitplan();
    await x.motor.zeitplan();
    const es = (await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt');
    assert.equal(es.length, 1, 'genau einmal');
    assert.equal(es[0].paketId, 'vertraege', 'nur an das Paket der Karte – nicht an Compliance');
    assert.deepEqual(es[0].daten, { automatisierung: a.id, aufgabe: 'taeglich', zeitpunkt: '2026-11-10T04:00:00.000Z', datum: '2026-11-10' });
    const [l] = await x.motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen');
    assert.match(l.schritte.at(-1)!.text ?? '', /Paket „Verträge“ ausgeführt .*Aufgabe: taeglich/);
    // Uhrzeit am selben Tag geändert: Der Zeitplan läuft neu, das Paket bekommt den Tag trotzdem nur einmal (feste Id).
    const b = await x.auto('Verträge täglich prüfen');
    await x.motor.aendere(b.id, { wenn: { ...b.wenn, uhrzeit: '04:45' }, version: b.version }, x.markus.id);
    await x.motor.zeitplan();
    assert.equal((await x.motor.laeufe(a.id)).length, 2, 'zweiter Lauf am selben Tag');
    assert.equal((await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt').length, 1);
    // Am nächsten Tag ein neues Ereignis.
    x.zeit.jetzt = am('05:01', '2026-11-11');
    await x.motor.zeitplan();
    assert.deepEqual((await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt').map((e) => e.daten.datum), ['2026-11-10', '2026-11-11']);
  });

  it('Paket entfernt: läuft ins Leere – übersprungen, Hinweis „… ist nicht installiert“, kein Fehlschlag', async () => {
    const x = await aufbau(am('04:30'));
    await x.installiere(vertraege());
    const a = await x.auto('Verträge täglich prüfen');
    await x.p.entferne('vertraege', ICH);
    const nachher = await x.auto('Verträge täglich prüfen');
    assert.ok(nachher, 'eingeschaltet bleibt sie stehen');
    assert.match(nachher.leer?.[0] ?? '', /Paket „vertraege“ ist nicht installiert/);
    x.zeit.jetzt = am('05:01');
    await x.motor.zeitplan();
    const [l] = await x.motor.laeufe(a.id);
    assert.equal(l.zustand, 'uebersprungen');
    assert.match(l.schritte.at(-1)!.text ?? '', /ist nicht installiert/);
    const u = await x.motor.uebersicht();
    assert.equal(u.fehlgeschlagen, 0, 'keine Fehlerflut');
    assert.equal((await x.auto('Verträge täglich prüfen')).angehalten, null, 'bleibt an, nicht angehalten');
    assert.deepEqual((await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt'), []);
  });
});

describe('Nur das eigene Paket (#1082, Sicherheit)', () => {
  it('mitgeliefert: ein anderes Paket lässt sich nicht eintragen – die Karte bleibt beim eigenen', async () => {
    const x = await aufbau();
    await x.installiere(vertraege());
    await x.installiere(COMPLIANCE);
    const a = await x.auto('Verträge täglich prüfen');
    const neu = await x.motor.aendere(a.id, { dann: [{ id: a.dann[0].id, art: 'paket', paket: 'compliance', aufgabe: 'taeglich' }], version: a.version }, x.markus.id);
    assert.deepEqual(neu.dann.map((k) => k.art === 'paket' && k.paket), ['vertraege']);
  });

  it('selbst angelegt: nur Pakete, die zeitplan.ausgefuehrt abonnieren; nicht installiert abgelehnt', async () => {
    const x = await aufbau();
    await x.installiere(OHNE_ZEITPLAN);
    await x.installiere(COMPLIANCE);
    const daten = (paket: string) => ({ name: `Lauf ${paket}`, wenn: { art: 'zeitplan', uhrzeit: '04:30' }, dann: [{ id: 'p1', art: 'paket', paket, aufgabe: 'monatlich' }] });
    await assert.rejects(x.motor.lege(daten('rechnungen'), x.markus.id), fehler(422, /„Rechnungen“ nimmt keine Zeitpläne an/));
    await assert.rejects(x.motor.lege(daten('gibtsnicht'), x.markus.id), fehler(422, /„gibtsnicht“ ist nicht installiert/));
    const ok = await x.motor.lege(daten('compliance'), x.markus.id);
    assert.equal(ok.herkunft, 'eigen');
    // Kontext für den Editor: nur Compliance nimmt Zeitpläne an.
    const k = await x.motor.kontext();
    assert.deepEqual(k.pakete?.map((p) => [p.id, p.zeitplan]).sort(), [['compliance', true], ['rechnungen', false]]);
    // Später entfernt: Speichern geht weiter (die Karte nannte das Paket schon), sie läuft dann ins Leere.
    await x.p.entferne('compliance', ICH);
    const a = (await x.motor.uebersicht()).automatisierungen.find((y) => y.id === ok.id)!;
    await x.motor.aendere(a.id, { name: 'Lauf umbenannt', version: a.version }, x.markus.id);
    // Die Karte erreicht das Paket nicht mehr: kein Ereignis an irgendwen.
    x.zeit.jetzt = am('04:31');
    await x.motor.schalte(a.id, true, x.markus.id);
    await x.motor.zeitplan();
    assert.deepEqual((await x.zustellung()).filter((e) => e.art === 'zeitplan.ausgefuehrt'), []);
  });
});
