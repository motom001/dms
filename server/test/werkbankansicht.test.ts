/** Ansicht der Werkbank (#281): Vorlagen, Abweichungen, eigene Ergänzungen, Speichern. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bereichPasst, ansichtAus, BEREICHE, bereichName, expertenBereiche, fuerAlle, nurImExpertenmodus, GRUPPEN, hatMitte, inVorlage, liesAnsicht, liesEigene, OHNE_EINSTELLUNG, sichtbar, wartungsPlakette,
  werkbankEbene, werkbankUmleitung, werkbankZurueck, einDatentraeger,
} from '../../shared/src/werkbankansicht';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';

const ICH = { id: 'admin-1', email: 'admin@example.org' };
const DU = { id: 'admin-2', email: 'zweite@example.org' };

describe('Werkbank-Ansicht: Regeln', () => {
  it('Haushalt ist schlank, Organisation mehr, Alles alles', () => {
    const h = BEREICHE.filter((b) => inVorlage('haushalt', b.pfad)).map((b) => b.pfad);
    const o = BEREICHE.filter((b) => inVorlage('organisation', b.pfad)).map((b) => b.pfad);
    assert.ok(h.includes('sicherung') && h.includes('benutzer') && h.includes('pakete'));
    assert.ok(!h.includes('nummernkreise') && !h.includes('protokoll') && !h.includes('demo'));
    assert.ok(h.every((p) => o.includes(p)), 'Organisation enthält alles aus Haushalt');
    assert.ok(o.includes('nummernkreise') && o.includes('postfaecher'));
    assert.equal(BEREICHE.filter((b) => inVorlage('alles', b.pfad)).length, BEREICHE.length);
  });

  it('Übersicht ist immer da; Abweichungen von der Vorlage zählen', () => {
    const a = { vorlage: 'haushalt' as const, ein: ['protokoll'], aus: ['vollexport'] };
    assert.equal(fuerAlle(a, 'uebersicht'), true);
    assert.equal(fuerAlle(a, 'protokoll'), true);
    assert.equal(fuerAlle(a, 'vollexport'), false);
    assert.equal(fuerAlle(a, 'demo'), false);
    assert.equal(sichtbar(a, { ein: ['demo'] }, 'demo'), true, 'eigene Ergänzung');
  });

  it('ansichtAus speichert nur Abweichungen', () => {
    const an = BEREICHE.filter((b) => inVorlage('haushalt', b.pfad)).map((b) => b.pfad).filter((p) => p !== 'vollexport');
    assert.deepEqual(ansichtAus('haushalt', [...an, 'demo']), { vorlage: 'haushalt', ein: ['demo'], aus: ['vollexport'] });
  });

  it('liest nur bekannte Bereiche und gültige Vorlagen', () => {
    assert.equal(liesAnsicht(null), null);
    assert.deepEqual(liesAnsicht({ vorlage: 'quatsch', ein: ['demo', 'gibtsnicht', 'demo', 3], aus: 'x' }), { vorlage: 'alles', ein: ['demo'], aus: [] });
    assert.deepEqual(liesEigene({ ein: ['demo', '../x'] }), { ein: ['demo'] });
    assert.deepEqual(liesEigene(undefined), { ein: [] });
  });
});

describe('Werkbank-Ansicht: Expertenmodus (#356)', () => {
  it('Suche und Volltext (früher Suche): im Haushalt nur im Expertenmodus, für Betriebe immer', () => {
    const haushalt = { vorlage: 'haushalt' as const, ein: [], aus: [] };
    assert.equal(fuerAlle(haushalt, 'texterkennung'), false);
    assert.equal(sichtbar(haushalt, { ein: [] }, 'texterkennung'), false, 'ohne Expertenmodus ausgeblendet');
    assert.equal(sichtbar(haushalt, { ein: [], experte: true }, 'texterkennung'), true, 'im Expertenmodus sichtbar');
    assert.equal(nurImExpertenmodus('haushalt', 'texterkennung'), true);
    assert.equal(nurImExpertenmodus('organisation', 'texterkennung'), false);
    assert.equal(fuerAlle({ vorlage: 'organisation', ein: [], aus: [] }, 'texterkennung'), true);
    assert.deepEqual(expertenBereiche('haushalt').map((b) => b.pfad), ['automatisierungen', 'texterkennung', 'woerter']);
    assert.deepEqual(expertenBereiche('alles'), []);
    // Der Expertenmodus zeigt nur, was die Vorlage dafür vorsieht – nicht alles.
    assert.equal(sichtbar(haushalt, { ein: [], experte: true }, 'protokoll'), false);
    // Für alle ausdrücklich ausgeblendet bleibt ausgeblendet.
    assert.equal(sichtbar({ ...haushalt, aus: ['texterkennung'] }, { ein: [], experte: true }, 'texterkennung'), false);
  });

  it('liesEigene nimmt den Expertenmodus nur als true; der Dienst speichert ihn je Administrator', async () => {
    assert.deepEqual(liesEigene({ ein: [], experte: true }), { ein: [], experte: true });
    assert.deepEqual(liesEigene({ ein: [], experte: 'ja' }), { ein: [] });
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    await d.werkbank.setzeWerkbankAnsicht(ICH, { installation: { vorlage: 'haushalt', ein: [], aus: [] }, eigene: { ein: [], experte: true } });
    const ich = await d.werkbank.werkbankAnsicht(ICH);
    assert.equal(sichtbar(ich.installation, ich.eigene, 'texterkennung'), true);
    const du = await d.werkbank.werkbankAnsicht(DU);
    assert.equal(sichtbar(du.installation, du.eigene, 'texterkennung'), false, 'gilt nur für mich');
    await d.werkbank.setzeWerkbankAnsicht(ICH, { eigene: { ein: [] } });
    assert.deepEqual((await d.werkbank.werkbankAnsicht(ICH)).eigene, { ein: [] });
  });
});

describe('Werkbank-Ansicht: Dienst', () => {
  const neu = () => new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });

  it('ohne Einstellung bleibt alles sichtbar', async () => {
    const s = await neu().werkbank.werkbankAnsicht(ICH);
    assert.deepEqual(s.installation, OHNE_EINSTELLUNG);
    assert.equal(s.eingestellt, false);
    assert.deepEqual(s.eigene, { ein: [] });
  });

  it('Installation gilt für alle, eigene Ergänzungen nur für einen Administrator', async () => {
    const d = neu();
    await d.werkbank.setzeWerkbankAnsicht(ICH, { installation: { vorlage: 'haushalt', ein: [], aus: [] }, eigene: { ein: ['protokoll'] } });
    const ich = await d.werkbank.werkbankAnsicht(ICH);
    const du = await d.werkbank.werkbankAnsicht(DU);
    assert.equal(ich.eingestellt, true);
    assert.equal(ich.installation.vorlage, 'haushalt');
    assert.deepEqual(ich.eigene.ein, ['protokoll']);
    assert.deepEqual(du.eigene.ein, []);
    assert.equal(du.installation.vorlage, 'haushalt');
    // Nur die eigene Ansicht ändern lässt die Installation unberührt.
    await d.werkbank.setzeWerkbankAnsicht(DU, { eigene: { ein: ['demo'] } });
    assert.equal((await d.werkbank.werkbankAnsicht(ICH)).installation.vorlage, 'haushalt');
    assert.deepEqual((await d.werkbank.werkbankAnsicht(DU)).eigene.ein, ['demo']);
    // Leere eigene Ansicht wird gelöscht.
    await d.werkbank.setzeWerkbankAnsicht(ICH, { eigene: { ein: [] } });
    assert.deepEqual((await d.werkbank.werkbankAnsicht(ICH)).eigene.ein, []);
  });

  it('Administrator ohne Id (z. B. aus der Umgebung) wird über die E-Mail-Adresse unterschieden', async () => {
    const d = neu();
    await d.werkbank.setzeWerkbankAnsicht({ id: null, email: 'env@example.org' }, { eigene: { ein: ['demo'] } });
    assert.deepEqual((await d.werkbank.werkbankAnsicht({ id: null, email: 'env@example.org' })).eigene.ein, ['demo']);
  });

  it('lehnt Unbrauchbares ab', async () => {
    await assert.rejects(neu().werkbank.setzeWerkbankAnsicht(ICH, { installation: 'haushalt' }), (e: unknown) => e instanceof Fachfehler && e.status === 422);
  });
});

describe('Werkbank: mittlere Spalte für Sammlungen zum Anlegen und Bearbeiten (#366, #990)', () => {
  it('Sammlungen behalten die Mitte, Seiten sind zweiteilig', () => {
    for (const b of ['typen', 'sichten', 'benutzer', 'pakete', 'postfaecher', 'papierkorb', 'protokoll', 'automatisierungen', 'auskuenfte', 'stempel']) assert.ok(hatMitte(b), b);
    for (const b of ['demo', 'betrieb', 'verschluesselung', 'texterkennung', 'wartung', 'sicherung',
      'systemzustand', 'anbindung', 'eingangsordner', 'anmeldeschutz', 'aufbewahrung', 'vollexport', 'ansicht', 'webdav', 'region', 'loeschkonzept']) assert.ok(!hatMitte(b), b);
    // Jeder Bereich der Leiste ist eingeordnet; neue Bereiche sind ohne Zutun zweiteilig.
    assert.ok(BEREICHE.every((b) => typeof hatMitte(b.pfad) === 'boolean'));
  });

  it('am Handy keine leere Zwischenstufe', () => {
    assert.equal(werkbankEbene('systemzustand'), 'mappe');
    assert.equal(werkbankZurueck('systemzustand'), '/werkbank');
    assert.equal(werkbankEbene('typen'), 'liste');
    assert.equal(werkbankEbene('typen', 'x'), 'mappe');
    assert.equal(werkbankZurueck('typen'), '/werkbank/typen');
    // Pakete: ohne Auswahl die Liste (Katalog abrufen, installierte Pakete), mit Installations-Link rechts.
    assert.equal(werkbankEbene('pakete'), 'liste');
    assert.equal(werkbankEbene('pakete', undefined, true), 'mappe');
    assert.equal(werkbankEbene('systemzustand', undefined, true), 'mappe');
  });

  it('Stempel (#990): Vorlagen in der Mitte, alte Links führen auf die Vorlage rechts', () => {
    assert.ok(hatMitte('stempel'));
    assert.equal(werkbankEbene('stempel'), 'liste');
    assert.equal(werkbankEbene('stempel', 'kopie'), 'mappe');
    assert.equal(werkbankZurueck('stempel'), '/werkbank/stempel');
    // Früher klappte ?offen=… die Vorlage rechts auf; jetzt steht sie unter /werkbank/stempel/:id.
    assert.equal(werkbankUmleitung('stempel', undefined, '?offen=kopie'), '/werkbank/stempel/kopie');
    assert.equal(werkbankUmleitung('stempel', undefined, '?offen=a%20b'), '/werkbank/stempel/a%20b');
    assert.equal(werkbankUmleitung('stempel', 'kopie'), null, '/werkbank/stempel/:id gilt direkt');
    assert.equal(werkbankUmleitung('stempel'), null);
    assert.equal(werkbankUmleitung('stempel', undefined, '?x=1'), null);
  });

  it('alte Direktlinks führen auf die Seite', () => {
    // Lange Datenbankzugriffe stehen seit #725 im Systemzustand.
    assert.equal(werkbankUmleitung('anbindung', '42'), '/werkbank/systemzustand?offen=42#datenbank');
    assert.equal(werkbankUmleitung('region', 'irgendwas'), '/werkbank/region');
    assert.equal(werkbankUmleitung('anbindung'), null);
    assert.equal(werkbankUmleitung('typen', 'abc'), null);
  });

  it('#407: „Wartung und Fehlersuche → Datenbank“ ist umgezogen nach „Einstellungen → Datenbank-Anbindung“', () => {
    assert.ok(!BEREICHE.some((b) => b.pfad === 'datenbank'));
    assert.equal(BEREICHE.find((b) => b.pfad === 'anbindung')?.gruppe, 'einstellungen');
    assert.equal(werkbankUmleitung('datenbank'), '/werkbank/anbindung');
    assert.equal(werkbankUmleitung('datenbank', undefined, '?offen=7'), '/werkbank/anbindung?offen=7');
    assert.equal(werkbankUmleitung('datenbank', '42'), '/werkbank/systemzustand?offen=42#datenbank', 'alter Direktlink auf einen langen Zugriff');
    // Gespeicherte Ansichten übernehmen die neue Kennung.
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['datenbank', 'demo'], aus: [] }), { vorlage: 'haushalt', ein: ['anbindung', 'demo'], aus: [] });
    assert.deepEqual(liesEigene({ ein: ['datenbank', 'anbindung'] }), { ein: ['anbindung'] });
  });

  it('#417: Anmeldeschutz steht unter Einstellungen', () => {
    const b = BEREICHE.find((x) => x.pfad === 'anmeldeschutz');
    assert.equal(b?.gruppe, 'einstellungen');
    assert.equal(werkbankUmleitung('anmeldeschutz'), null, 'Pfad bleibt, alte Links gelten weiter');
  });

  it('#354, #717, #725: sechs Gruppen nach Aufgaben, je höchstens 7 Bereiche', () => {
    assert.deepEqual(Object.values(GRUPPEN), ['Ablage aufbauen', 'Benutzer und Sicherheit', 'Post und Eingänge', 'Daten sichern', 'Einstellungen', 'Wartung und Fehlersuche']);
    const je = (g: string) => BEREICHE.filter((x) => x.gruppe === g).map((x) => x.pfad);
    // Nutzung (#1032) vorn bei „Ablage aufbauen“: Sie bestimmt, was die Mappentypen zeigen.
    assert.deepEqual(je('ablage'), ['nutzung', 'pakete', 'typen', 'sichten', 'nummernkreise', 'automatisierungen']);
    assert.deepEqual(je('benutzer'), ['benutzer', 'verschluesselung', 'organisation', 'auskuenfte', 'loeschkonzept', 'aufbewahrung', 'stempel']);
    assert.deepEqual(je('post'), ['postfaecher', 'eingangsordner', 'webdav', 'webhooks', 'texterkennung', 'woerter']);
    assert.deepEqual(je('sichern'), ['sicherung', 'vollexport', 'papierkorb']);
    assert.deepEqual(je('einstellungen'), ['betrieb', 'region', 'sprachen', 'aufgaben', 'anmeldeschutz', 'designs', 'anbindung']);
    assert.deepEqual(je('wartung'), ['systemzustand', 'protokoll', 'fehlermeldungen', 'wartung', 'demo']);
    for (const g of Object.keys(GRUPPEN)) assert.ok(je(g).length <= 7, g);
    assert.equal(bereichName('texterkennung'), 'Suche und Volltext');
    assert.equal(bereichName('aufbewahrung'), 'Aufbewahrung abgelaufen');
    // Aufgaben und Tägliche Zusammenfassung: ein Eintrag unter Einstellungen, Kennung bleibt „aufgaben“.
    assert.equal(bereichName('aufgaben'), 'Aufgaben');
    assert.equal(bereichName('uebersicht'), 'Übersicht');
    // Jeder Bereich hat Name und „wann“ aus der Sprachdatei.
    for (const b of BEREICHE) assert.ok(b.name && !b.name.startsWith('werkbank.') && b.wann && !b.wann.startsWith('werkbank.'), b.pfad);
    // Gespeicherte Auswahl bestehender Installationen bleibt gültig (es werden nur Bereiche gespeichert).
    const alt = { vorlage: 'haushalt', ein: ['nummernkreise', 'protokoll', 'anmeldeschutz'], aus: ['aufgaben', 'papierkorb'] };
    assert.deepEqual(liesAnsicht(alt), alt);
    for (const p of ['aufgaben', 'verschluesselung', 'papierkorb', 'webdav']) assert.equal(werkbankUmleitung(p), null, p);
    // Vorlagen: Haushalt und Betrieb enthalten dieselben Bereiche wie vor der Neugliederung (dazu Region, #726, und Sprachen, #729).
    assert.deepEqual(BEREICHE.filter((b) => inVorlage('haushalt', b.pfad)).map((b) => b.pfad).sort(),
      ['aufgaben', 'benutzer', 'betrieb', 'nutzung', 'pakete', 'papierkorb', 'region', 'sicherung', 'sichten', 'sprachen', 'stempel', 'systemzustand', 'typen', 'verschluesselung', 'vollexport', 'webdav', 'webhooks']);
  });

  it('#354 Nacharbeit, #668: Datenschutz-Auskünfte und Löschkonzept unter „Benutzer und Sicherheit“, alte Adresse leitet um', () => {
    for (const pfad of ['auskuenfte', 'loeschkonzept']) {
      const b = BEREICHE.find((x) => x.pfad === pfad);
      assert.equal(b?.gruppe, 'benutzer');
      assert.equal(GRUPPEN[b!.gruppe], 'Benutzer und Sicherheit');
      assert.deepEqual(b?.in, ['organisation'], 'Vorlagen wie vorher Datenschutz');
    }
    assert.equal(werkbankUmleitung('datenschutz'), '/werkbank/auskuenfte', 'alte Links führen zu den Auskünften');
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['datenschutz'], aus: [] }), { vorlage: 'haushalt', ein: ['auskuenfte'], aus: [] });
    // Verschlüsselung bleibt unter Benutzer und Sicherheit, WebDAV unter Post und Eingänge.
    assert.equal(BEREICHE.find((x) => x.pfad === 'verschluesselung')?.gruppe, 'benutzer');
    assert.equal(BEREICHE.find((x) => x.pfad === 'webdav')?.gruppe, 'post');
  });

  it('#408: „Speicherplatz“ heißt „Systemzustand“ und steht unter Wartung und Fehlersuche', () => {
    assert.ok(!BEREICHE.some((b) => b.pfad === 'speicherplatz'));
    const b = BEREICHE.find((x) => x.pfad === 'systemzustand');
    assert.equal(b?.gruppe, 'wartung');
    assert.equal(b?.name, 'Systemzustand');
    assert.ok(inVorlage('haushalt', 'systemzustand'), 'wie bisher schon im Haushalt');
    assert.ok(!hatMitte('systemzustand'));
    assert.equal(werkbankUmleitung('speicherplatz'), '/werkbank/systemzustand');
    assert.equal(werkbankUmleitung('speicherplatz', 'x'), '/werkbank/systemzustand');
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: [], aus: ['speicherplatz'] }), { vorlage: 'haushalt', ein: [], aus: ['systemzustand'] });
  });

  it('Plakette Wartungsmodus: angekündigt, dann an', () => {
    const jetzt = Date.parse('2026-11-01T01:25:00Z');
    assert.equal(wartungsPlakette('aus', null, jetzt), undefined);
    assert.equal(wartungsPlakette('angekuendigt', '2026-11-01T01:33:00Z', jetzt), 'angekündigt');
    assert.equal(wartungsPlakette('angekuendigt', '2026-11-01T01:20:00Z', jetzt), 'an', 'Zeitpunkt erreicht');
    assert.equal(wartungsPlakette('aktiv', '2026-11-01T01:20:00Z', jetzt), 'an');
  });
});

describe('Speicherplatz: ein Balken für einen Datenträger (#366)', () => {
  it('nur wenn alle Ordner gemessen sind und auf demselben Gerät liegen', () => {
    const o = (geraet: string | null, gesamt: number | null = 100) => ({ geraet, gesamt });
    assert.ok(einDatentraeger([o('8:1'), o('8:1'), o('8:1')]));
    assert.ok(!einDatentraeger([o('8:1'), o('8:2'), o('8:1')]));
    assert.ok(!einDatentraeger([o('8:1'), o('8:1', null)]), 'ein Ordner nicht messbar');
    assert.ok(!einDatentraeger([o(null), o(null)]), 'Gerät unbekannt');
    assert.ok(!einDatentraeger([o('8:1')]), 'nur ein Ordner');
  });
});

describe('Werkbank neu geordnet (#717, #725)', () => {
  it('alte Bereiche leiten auf den neuen Ort weiter, samt Abschnitt', () => {
    assert.equal(werkbankUmleitung('darfweg'), '/werkbank/aufbewahrung');
    assert.equal(werkbankUmleitung('suche'), '/werkbank/texterkennung#suche');
    assert.equal(werkbankUmleitung('wiederherstellung'), '/werkbank/sicherung#wiederherstellen');
    assert.equal(werkbankUmleitung('technik'), '/werkbank/systemzustand#version');
    assert.equal(werkbankUmleitung('wartungsmodus'), '/werkbank/wartung#wartungsmodus');
    for (const p of ['darfweg', 'suche', 'wiederherstellung', 'technik', 'wartungsmodus']) assert.ok(!BEREICHE.some((b) => b.pfad === p), p);
  });

  it('gespeicherte Ansichten übernehmen die neuen Kennungen, zusammengelegte erben die weiteste Sichtbarkeit', () => {
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['darfweg', 'wartungsmodus', 'wartung'], aus: ['technik', 'wiederherstellung'] }),
      { vorlage: 'haushalt', ein: ['aufbewahrung', 'wartung'], aus: ['systemzustand', 'sicherung'] });
    // „Suche“ war im Haushalt Expertenmodus, Texterkennung nur im Betrieb: zusammen wie die Suche.
    const sv = BEREICHE.find((b) => b.pfad === 'texterkennung')!;
    assert.deepEqual([sv.in, sv.experte], [['organisation'], ['haushalt']]);
    // Wartungsmodus war im Betrieb sichtbar, Wartungsoperationen nirgends: zusammen im Betrieb.
    assert.deepEqual(BEREICHE.find((b) => b.pfad === 'wartung')!.in, ['organisation']);
  });

  it('die Werkbank-Suche findet Bereiche unter neuem und altem Namen', () => {
    const finde = (s: string) => BEREICHE.filter((b) => bereichPasst(b.pfad, s)).map((b) => b.pfad);
    assert.ok(finde('darf weg').includes('aufbewahrung'));
    assert.ok(finde('Aufbewahrung abgelaufen').includes('aufbewahrung'));
    assert.ok(finde('technik').includes('systemzustand'));
    assert.ok(finde('wiederherstellen').includes('sicherung'));
    // Gleichbedeutende Wörter haben seit #992 einen eigenen Bereich.
    assert.ok(finde('gleichbedeutende').includes('woerter'));
    assert.ok(finde('Synonyme').includes('woerter'));
    assert.ok(finde('wartungsmodus').includes('wartung'));
    assert.ok(finde('STEMPEL').includes('stempel'));
    // Notfallblatt (#993): nur noch unter Verschlüsselung.
    assert.ok(finde('Notfallblatt').includes('verschluesselung'));
    assert.ok(!finde('Notfallblatt').includes('sicherung'));
    assert.ok(finde('notfallcode').includes('verschluesselung'));
    assert.equal(finde('').length, BEREICHE.length);
  });
});
