/** Ansicht der Werkbank (#281, #987): fünf Stufen, Abweichungen, eigene Stufe und Ergänzungen, Speichern. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abschnittUmleitung,
  ANBIETER_RECHT,
  anbieterSeite,
  anzahlInVorlage,
  bereichWeg,
  darfPaketseite,
  darfSeite,
  LEISTEN_BEREICHE,
  bereichPasst,
  ansichtAus,
  BEREICHE,
  bereichName,
  FRUEHER_EXPERTE,
  fuerAlle,
  GRUPPEN,
  hatMitte,
  inVorlage,
  liesAnsicht,
  liesEigene,
  OHNE_EINSTELLUNG,
  sichtbar,
  STUFEN,
  vorlageFuer,
  wartungsPlakette,
  werkbankEbene,
  werkbankUmleitung,
  handyBereicheWeg,
  handyGruppe,
  handyZurueck,
  HANDY_SCHWERPUNKT,
  HANDY_BEQUEMER,
  amRechnerBequemer,
  imHandySchwerpunkt,
  einDatentraeger,
} from '../../shared/src/werkbankansicht';
import { EINGEBAUTE_ANBIETER } from '../../shared/src/leistungen';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { speicherRepo } from '../src/repo/speicher';

const ICH = { id: 'admin-1', email: 'admin@example.org' };
const DU = { id: 'admin-2', email: 'zweite@example.org' };

describe('Werkbank-Ansicht: Regeln', () => {
  it('fünf Stufen (#987): jede enthält die vorige, Einsteiger ist schlank, Alles alles', () => {
    const je = STUFEN.map((v) => BEREICHE.filter((b) => inVorlage(v, b.pfad)).map((b) => b.pfad));
    for (let i = 1; i < je.length; i++)
      assert.ok(
        je[i - 1].every((p) => je[i].includes(p)),
        `${STUFEN[i]} enthält ${STUFEN[i - 1]}`,
      );
    const [e, h, s, b] = je;
    assert.deepEqual(e, [
      'pakete',
      'beispielablage',
      'benutzer',
      'verschluesselung',
      'sicherung',
      'papierkorb',
      'betrieb',
      'region',
      'systemzustand',
    ]);
    assert.ok(
      h.includes('automatisierungen') &&
        h.includes('texterkennung') &&
        h.includes('protokoll') &&
        h.includes('anmeldeschutz') &&
        !h.includes('nummernkreise'),
    );
    assert.deepEqual(
      s.filter((p) => !h.includes(p)),
      ['nummernkreise', 'aufbewahrung', 'auskuenfte', 'loeschkonzept', 'loeschprotokoll'],
    );
    assert.deepEqual(
      b.filter((p) => !s.includes(p)),
      ['rundgaenge', 'designs'],
    );
    assert.deepEqual(
      BEREICHE.filter((x) => !inVorlage('organisation', x.pfad)).map((x) => x.pfad),
      ['anbindung', 'demo'],
    );
    assert.equal(BEREICHE.filter((x) => inVorlage('alles', x.pfad)).length, BEREICHE.length);
    // Anzahl der Einträge in der Leiste samt Übersicht – so im Handbuch und im Rauchtest. Seit #1570 ohne „Suche und
    // Volltext“ (steht unter Pakete → Von Ablago mitgeliefert).
    assert.deepEqual(STUFEN.map(anzahlInVorlage), [10, 29, 34, 36, 38]);
    assert.deepEqual(BEREICHE.find((x) => x.pfad === 'stempel')?.in, ['haushalt', 'selbstaendig', 'organisation']);
  });

  it('Übersicht ist immer da; Abweichungen von der Vorlage zählen', () => {
    const a = { vorlage: 'einsteiger' as const, ein: ['protokoll'], aus: ['papierkorb'] };
    assert.equal(fuerAlle(a, 'uebersicht'), true);
    assert.equal(fuerAlle(a, 'protokoll'), true);
    assert.equal(fuerAlle(a, 'papierkorb'), false);
    assert.equal(fuerAlle(a, 'demo'), false);
    assert.equal(sichtbar(a, { ein: ['demo'] }, 'demo'), true, 'eigene Ergänzung');
  });

  it('ansichtAus speichert nur Abweichungen', () => {
    const an = BEREICHE.filter((b) => inVorlage('haushalt', b.pfad))
      .map((b) => b.pfad)
      .filter((p) => p !== 'vollexport');
    assert.deepEqual(ansichtAus('haushalt', [...an, 'demo']), { vorlage: 'haushalt', ein: ['demo'], aus: ['vollexport'] });
  });

  it('liest nur bekannte Bereiche und gültige Vorlagen', () => {
    assert.equal(liesAnsicht(null), null);
    assert.deepEqual(liesAnsicht({ vorlage: 'quatsch', ein: ['demo', 'gibtsnicht', 'demo', 3], aus: 'x' }), {
      vorlage: 'alles',
      ein: ['demo'],
      aus: [],
    });
    for (const v of STUFEN) assert.equal(liesAnsicht({ vorlage: v, ein: [], aus: [] })?.vorlage, v);
    assert.deepEqual(liesEigene({ ein: ['demo', '../x'] }), { ein: ['demo'] });
    assert.deepEqual(liesEigene(undefined), { ein: [] });
  });

  it('Vorgabe zur Nutzung (#1032, #987): privat Einsteiger, beruflich Selbständig', () => {
    assert.equal(vorlageFuer({ beruflich: false }), 'einsteiger');
    assert.equal(vorlageFuer({ beruflich: true }), 'selbstaendig');
  });
});

describe('Werkbank-Ansicht: eigene Stufe je Person statt Expertenmodus (#987)', () => {
  it('die eigene Stufe ersetzt die Vorlage nur für die Person; für alle Aus- und Eingeblendetes gilt weiter', () => {
    const a = { vorlage: 'einsteiger' as const, ein: ['webdav'], aus: ['papierkorb'] };
    assert.equal(sichtbar(a, { ein: [] }, 'protokoll'), false);
    assert.equal(sichtbar(a, { ein: [], vorlage: 'alles' }, 'protokoll'), true, 'Meine Leiste: Alles');
    assert.equal(sichtbar(a, { ein: [], vorlage: 'alles' }, 'papierkorb'), false, 'für alle ausgeblendet');
    assert.equal(sichtbar({ ...a, vorlage: 'alles' }, { ein: [], vorlage: 'einsteiger' }, 'protokoll'), false, 'auch eine kleinere Stufe');
    assert.equal(sichtbar({ ...a, vorlage: 'alles' }, { ein: [], vorlage: 'einsteiger' }, 'webdav'), true, 'für alle eingeblendet');
    assert.deepEqual(liesEigene({ ein: [], vorlage: 'quatsch' }), { ein: [] });
  });

  it('ein gespeicherter Expertenmodus wird zur eigenen Einblendung seiner Bereiche', () => {
    assert.deepEqual(liesEigene({ ein: ['protokoll'], experte: true }), { ein: ['protokoll', ...FRUEHER_EXPERTE] });
    assert.deepEqual(liesEigene({ ein: [], experte: 'ja' }), { ein: [] });
    assert.equal(sichtbar({ vorlage: 'einsteiger', ein: [], aus: [] }, liesEigene({ ein: [], experte: true }), 'texterkennung'), true);
  });

  it('der Dienst speichert die eigene Stufe je Person', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    await d.werkbank.setzeWerkbankAnsicht(ICH, {
      installation: { vorlage: 'einsteiger', ein: [], aus: [] },
      eigene: { ein: [], vorlage: 'alles' },
    });
    const ich = await d.werkbank.werkbankAnsicht(ICH);
    assert.deepEqual(ich.eigene, { ein: [], vorlage: 'alles' });
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
    await assert.rejects(
      neu().werkbank.setzeWerkbankAnsicht(ICH, { installation: 'haushalt' }),
      (e: unknown) => e instanceof Fachfehler && e.status === 422,
    );
  });
});

describe('Werkbank: mittlere Spalte für Sammlungen zum Anlegen und Bearbeiten (#366, #990)', () => {
  it('Sammlungen behalten die Mitte, Seiten sind zweiteilig', () => {
    for (const b of [
      'typen',
      'sichten',
      'benutzer',
      'pakete',
      'postfaecher',
      'papierkorb',
      'protokoll',
      'automatisierungen',
      'auskuenfte',
      'stempel',
    ])
      assert.ok(hatMitte(b), b);
    for (const b of [
      'demo',
      'betrieb',
      'verschluesselung',
      'texterkennung',
      'wartung',
      'sicherung',
      'systemzustand',
      'anbindung',
      'eingangsordner',
      'anmeldeschutz',
      'aufbewahrung',
      'vollexport',
      'ansicht',
      'webdav',
      'region',
      'loeschkonzept',
    ])
      assert.ok(!hatMitte(b), b);
    // Jeder Bereich der Leiste ist eingeordnet; neue Bereiche sind ohne Zutun zweiteilig.
    assert.ok(BEREICHE.every((b) => typeof hatMitte(b.pfad) === 'boolean'));
  });

  it('am Handy keine leere Zwischenstufe', () => {
    assert.equal(werkbankEbene('systemzustand'), 'mappe');
    assert.equal(handyZurueck('systemzustand', 'mappe')?.weg, '/werkbank?bereiche');
    assert.equal(werkbankEbene('typen'), 'liste');
    assert.equal(werkbankEbene('typen', 'x'), 'mappe');
    assert.deepEqual(handyZurueck('typen', 'mappe'), { weg: '/werkbank/typen', liste: true });
    // Pakete: ohne Auswahl die Liste (Katalog abrufen, installierte Pakete), mit Installations-Link rechts.
    assert.equal(werkbankEbene('pakete'), 'liste');
    assert.equal(werkbankEbene('pakete', undefined, true), 'mappe');
    assert.equal(werkbankEbene('systemzustand', undefined, true), 'mappe');
  });

  it('Werkbank am Handy (#1292): „Am Rechner oder Tablet bequemer“ nur auf Seiten zum Aufbauen, nie im Schwerpunkt', () => {
    for (const p of HANDY_BEQUEMER) {
      assert.ok(
        BEREICHE.some((b) => b.pfad === p),
        p,
      );
      assert.ok(!imHandySchwerpunkt(p), `${p} steht im Schwerpunkt und wäre am Handy „bequemer am Rechner“`);
      assert.ok(amRechnerBequemer(p), p);
    }
    // Pakete installieren muss am Handy gehen (#1291), die Übersicht und Einstellungen wie die Region sind nicht mühsam.
    for (const p of ['pakete', 'uebersicht', 'benutzer', 'region']) assert.equal(amRechnerBequemer(p), false, p);
  });

  it('Werkbank am Handy (#1204): Schwerpunkt vorn, Weg zurück zur Gruppe, zu den Bereichen oder zur Liste', () => {
    // Die Handgriffe aus #1291 – alle sind Bereiche der Leiste (oder die Übersicht), keiner doppelt.
    assert.equal(HANDY_SCHWERPUNKT[0], 'uebersicht');
    assert.equal(new Set(HANDY_SCHWERPUNKT).size, HANDY_SCHWERPUNKT.length);
    for (const p of HANDY_SCHWERPUNKT.slice(1))
      assert.ok(
        BEREICHE.some((b) => b.pfad === p),
        p,
      );
    assert.ok(imHandySchwerpunkt('sicherung') && !imHandySchwerpunkt('typen'));
    // Übersicht: kein Weg zurück (dort geht es nach vorn in die Bereiche).
    assert.equal(handyZurueck('uebersicht', 'liste'), null);
    // Schwerpunkt: zu den Bereichen oben – als Liste (Benutzer) und als Seite (Sicherung).
    assert.deepEqual(handyZurueck('benutzer', 'liste'), { weg: '/werkbank?bereiche' });
    assert.deepEqual(handyZurueck('sicherung', 'mappe'), { weg: '/werkbank?bereiche' });
    // Übrige Bereiche: zu ihrer Gruppe, als Liste (Mappentypen) und als Seite (Region).
    assert.deepEqual(handyZurueck('typen', 'liste'), { weg: '/werkbank?bereiche=ablage', gruppe: 'ablage' });
    assert.deepEqual(handyZurueck('region', 'mappe'), { weg: '/werkbank?bereiche=einstellungen', gruppe: 'einstellungen' });
    // Ein Eintrag (rechts) zur Liste, auch im Schwerpunkt; Seiten ohne Gruppe (Werkbank anpassen) zu den Bereichen.
    assert.deepEqual(handyZurueck('benutzer', 'mappe'), { weg: '/werkbank/benutzer', liste: true });
    assert.deepEqual(handyZurueck('ansicht', 'mappe'), { weg: '/werkbank?bereiche' });
    assert.equal(handyBereicheWeg('post'), '/werkbank?bereiche=post');
    assert.equal(handyGruppe('post'), 'post');
    assert.equal(handyGruppe(''), null);
    assert.equal(handyGruppe('gibtsnicht'), null);
  });

  it('Stempel (#990): Vorlagen in der Mitte, alte Links führen auf die Vorlage rechts', () => {
    assert.ok(hatMitte('stempel'));
    assert.equal(werkbankEbene('stempel'), 'liste');
    assert.equal(werkbankEbene('stempel', 'kopie'), 'mappe');
    assert.deepEqual(handyZurueck('stempel', 'mappe'), { weg: '/werkbank/stempel', liste: true });
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
    assert.equal(
      werkbankUmleitung('datenbank', '42'),
      '/werkbank/systemzustand?offen=42#datenbank',
      'alter Direktlink auf einen langen Zugriff',
    );
    // Gespeicherte Ansichten übernehmen die neue Kennung.
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['datenbank', 'demo'], aus: [] }), {
      vorlage: 'haushalt',
      ein: ['anbindung', 'demo'],
      aus: [],
    });
    assert.deepEqual(liesEigene({ ein: ['datenbank', 'anbindung'] }), { ein: ['anbindung'] });
  });

  it('#417: Anmeldeschutz steht unter Einstellungen', () => {
    const b = BEREICHE.find((x) => x.pfad === 'anmeldeschutz');
    assert.equal(b?.gruppe, 'einstellungen');
    assert.equal(werkbankUmleitung('anmeldeschutz'), null, 'Pfad bleibt, alte Links gelten weiter');
  });

  it('#354, #717, #725, #1170, #1184: Gruppen nach Aufgaben, je etwa 7 Bereiche', () => {
    assert.deepEqual(Object.values(GRUPPEN), [
      'Ablage aufbauen',
      'Benutzer und Sicherheit',
      'Datenschutz',
      'Post und Eingänge',
      'Daten sichern',
      'Einstellungen',
      'Wartung und Fehlersuche',
    ]);
    const je = (g: string) => BEREICHE.filter((x) => x.gruppe === g).map((x) => x.pfad);
    // Nutzung (#1032) steht seit #1170 auf „Eigene Organisation“ unter Einstellungen.
    assert.deepEqual(je('ablage'), [
      'pakete',
      'beispielablage',
      'typen',
      'sichten',
      'nummernkreise',
      'automatisierungen',
      'ablaufvorlagen',
      'rundgaenge',
      'tipps',
    ]);
    assert.deepEqual(je('benutzer'), ['benutzer', 'verschluesselung', 'aufbewahrung', 'stempel']);
    assert.deepEqual(je('datenschutz'), ['auskuenfte', 'loeschkonzept', 'loeschprotokoll']);
    assert.deepEqual(je('post'), ['postfaecher', 'eingangsordner', 'webdav', 'texterkennung', 'woerter']);
    assert.deepEqual(je('sichern'), ['sicherung', 'vollexport', 'papierkorb', 'daten']);
    assert.deepEqual(je('einstellungen'), [
      'betrieb',
      'region',
      'sprachen',
      'organisation',
      'aufgaben',
      'anmeldeschutz',
      'designs',
      'anbindung',
    ]);
    assert.deepEqual(je('wartung'), ['systemzustand', 'protokoll', 'fehlermeldungen', 'wartung', 'demo']);
    // 7 ± 2: Einstellungen hat mit „Eigene Organisation“ (#1170) acht, „Ablage aufbauen“ mit der Beispiel-Ablage (#988)
    // neun – Einsteiger sehen davon nur Pakete und Beispiel-Ablage.
    for (const g of Object.keys(GRUPPEN)) assert.ok(je(g).length <= (g === 'ablage' ? 9 : 8), g);
    assert.equal(bereichName('texterkennung'), 'Text aus PDF und Texterkennung');
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
    // Haushalt (#987): was er vorher zeigte, dazu der frühere Expertenmodus und Post, Protokoll, Wartung.
    assert.deepEqual(
      BEREICHE.filter((b) => inVorlage('haushalt', b.pfad))
        .map((b) => b.pfad)
        .sort(),
      [
        'ablaufvorlagen',
        'anmeldeschutz',
        'aufgaben',
        'automatisierungen',
        'beispielablage',
        'benutzer',
        'betrieb',
        'daten',
        'eingangsordner',
        'fehlermeldungen',
        'organisation',
        'pakete',
        'papierkorb',
        'postfaecher',
        'protokoll',
        'region',
        'sicherung',
        'sichten',
        'sprachen',
        'stempel',
        'systemzustand',
        'texterkennung',
        'tipps',
        'typen',
        'verschluesselung',
        'vollexport',
        'wartung',
        'webdav',
        'woerter',
      ],
    );
  });

  it('#1170: Nutzung und Eigene Organisation auf einer Seite unter Einstellungen, alte Adresse leitet um', () => {
    assert.equal(
      BEREICHE.some((x) => x.pfad === 'nutzung'),
      false,
      'kein eigener Bereich mehr',
    );
    const b = BEREICHE.find((x) => x.pfad === 'organisation');
    assert.equal(b?.gruppe, 'einstellungen');
    assert.equal(b?.ab, 'haushalt', 'der Haken „beruflich“ ist auch im Haushalt erreichbar');
    assert.equal(werkbankUmleitung('nutzung'), '/werkbank/organisation#nutzung');
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['nutzung'], aus: [] }), {
      vorlage: 'haushalt',
      ein: ['organisation'],
      aus: [],
    });
  });

  it('#1183: Vorgaben der Auskünfte auf „Eigene Organisation“, der alte Weg leitet um', () => {
    assert.equal(werkbankUmleitung('auskuenfte', 'einstellungen'), '/werkbank/organisation#auskunft-vorgaben');
    assert.equal(werkbankUmleitung('auskuenfte', 'neu'), null);
  });

  it('#668, #1184: Auskünfte, Löschkonzept und Löschprotokoll in der Gruppe „Datenschutz“, alte Adressen leiten um', () => {
    for (const pfad of ['auskuenfte', 'loeschkonzept', 'loeschprotokoll']) {
      const b = BEREICHE.find((x) => x.pfad === pfad);
      assert.equal(b?.gruppe, 'datenschutz');
      assert.equal(GRUPPEN[b!.gruppe], 'Datenschutz');
      assert.equal(b?.ab, 'selbstaendig', 'ab Selbständig (#987)');
    }
    assert.equal(werkbankUmleitung('datenschutz'), '/werkbank/auskuenfte', 'alte Links führen zu den Auskünften');
    assert.equal(
      abschnittUmleitung('loeschkonzept', 'loeschprotokoll'),
      '/werkbank/loeschprotokoll',
      'früherer Abschnitt des Löschkonzepts',
    );
    assert.equal(abschnittUmleitung('loeschkonzept', 'personendaten'), null);
    // #1190: „Neue PDFs automatisch verkleinern“ stand beim Speicherplatz im Systemzustand, seit #1570 bei „PDF bearbeiten“.
    assert.equal(abschnittUmleitung('texterkennung', 'automatisch-verkleinern'), '/werkbank/pakete/ablago.pdf#automatisch-verkleinern');
    assert.equal(abschnittUmleitung('texterkennung', 'warteschlange'), null);
    // #1319: Datenschutz nur an der Stufe – ab Selbständig, sonst nur mit eigener Einblendung; das Merkmal zählt nicht.
    assert.equal(inVorlage('haushalt', 'auskuenfte'), false);
    assert.equal(inVorlage('selbstaendig', 'auskuenfte'), true);
    assert.equal(sichtbar({ vorlage: 'haushalt', ein: [], aus: [] }, { ein: ['auskuenfte'] }, 'auskuenfte'), true);
    assert.equal(sichtbar({ vorlage: 'selbstaendig', ein: [], aus: ['auskuenfte'] }, { ein: [] }, 'auskuenfte'), false);
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: ['datenschutz'], aus: [] }), {
      vorlage: 'haushalt',
      ein: ['auskuenfte'],
      aus: [],
    });
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
    assert.deepEqual(liesAnsicht({ vorlage: 'haushalt', ein: [], aus: ['speicherplatz'] }), {
      vorlage: 'haushalt',
      ein: [],
      aus: ['systemzustand'],
    });
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
    assert.equal(werkbankUmleitung('suche'), '/werkbank/pakete/ablago.text#suche');
    assert.equal(werkbankUmleitung('wiederherstellung'), '/werkbank/sicherung#wiederherstellen');
    assert.equal(werkbankUmleitung('technik'), '/werkbank/systemzustand#version');
    assert.equal(werkbankUmleitung('wartungsmodus'), '/werkbank/wartung#wartungsmodus');
    for (const p of ['darfweg', 'suche', 'wiederherstellung', 'technik', 'wartungsmodus'])
      assert.ok(!BEREICHE.some((b) => b.pfad === p), p);
  });

  it('gespeicherte Ansichten übernehmen die neuen Kennungen, zusammengelegte erben die weiteste Sichtbarkeit', () => {
    assert.deepEqual(
      liesAnsicht({ vorlage: 'haushalt', ein: ['darfweg', 'wartungsmodus', 'wartung'], aus: ['technik', 'wiederherstellung'] }),
      { vorlage: 'haushalt', ein: ['aufbewahrung', 'wartung'], aus: ['systemzustand', 'sicherung'] },
    );
    // Seit #987 ab Haushalt (vorher dort Expertenmodus bzw. nur im Betrieb).
    assert.equal(BEREICHE.find((b) => b.pfad === 'texterkennung')!.ab, 'haushalt');
    assert.equal(BEREICHE.find((b) => b.pfad === 'wartung')!.ab, 'haushalt');
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

describe('Umzug unter Pakete → Von Ablago mitgeliefert (#1570)', () => {
  it('„Suche und Volltext“ verlässt die Leiste; Kennung und Verwaltungsrecht bleiben', () => {
    assert.ok(
      BEREICHE.some((b) => b.pfad === 'texterkennung'),
      'Recht an Personen bleibt gültig',
    );
    assert.ok(!LEISTEN_BEREICHE.some((b) => b.pfad === 'texterkennung'));
    assert.equal(BEREICHE.filter((b) => !b.leiste).length, 1);
    assert.equal(bereichWeg('texterkennung'), '/werkbank/pakete/ablago.text');
    assert.equal(bereichWeg('pakete'), '/werkbank/pakete');
    assert.equal(bereichWeg('uebersicht'), '/werkbank');
    // Gespeicherte Ansichten mit dem alten Bereich bleiben lesbar; Speichern nimmt ihn nicht mehr auf.
    assert.deepEqual(liesAnsicht({ vorlage: 'einsteiger', ein: ['texterkennung'], aus: [] })?.ein, ['texterkennung']);
    assert.ok(!ansichtAus('einsteiger', ['texterkennung', 'pakete']).ein.includes('texterkennung'));
    assert.ok(!ansichtAus('haushalt', []).aus.includes('texterkennung'));
  });

  it('alte Adressen führen auf die Seite des mitgelieferten Teils, samt Suche und Sprungmarke', () => {
    assert.equal(werkbankUmleitung('texterkennung'), '/werkbank/pakete/ablago.text');
    assert.equal(werkbankUmleitung('texterkennung', undefined, '?x=1', 'warteschlange'), '/werkbank/pakete/ablago.text?x=1#warteschlange');
    assert.equal(werkbankUmleitung('texterkennung', 'irgendwas'), '/werkbank/pakete/ablago.text');
    assert.equal(werkbankUmleitung('suche'), '/werkbank/pakete/ablago.text#suche');
    assert.equal(abschnittUmleitung('texterkennung', 'archivfassung'), '/werkbank/pakete/ablago.archiv#archivfassung');
    assert.equal(abschnittUmleitung('texterkennung', 'umwandlung'), '/werkbank/pakete/ablago.umwandeln#umwandlung');
    assert.equal(abschnittUmleitung('systemzustand', 'automatisch-verkleinern'), '/werkbank/pakete/ablago.pdf#automatisch-verkleinern');
    assert.equal(abschnittUmleitung('systemzustand', 'verkleinern'), null, 'Große PDFs verkleinern bleibt im Systemzustand');
    assert.equal(werkbankUmleitung('pakete'), null);
    assert.equal(werkbankUmleitung('pakete', 'ablago.text'), null);
    assert.equal(anbieterSeite('ablago.pdf'), '/werkbank/pakete/ablago.pdf');
  });

  it('die Werkbank-Suche findet die alten Namen', () => {
    const finde = (s: string) => BEREICHE.filter((b) => bereichPasst(b.pfad, s)).map((b) => b.pfad);
    for (const s of ['Suche und Volltext', 'Texterkennung', 'OCR', 'Archivfassung', 'automatisch verkleinern', 'Tippfehler'])
      assert.ok(finde(s).includes('texterkennung'), s);
  });

  it('Recht: die Seiten öffnet „Pakete“ oder das Recht des umgezogenen Bereichs', () => {
    assert.ok(darfPaketseite(['pakete'], 'ablago.text'));
    assert.ok(darfPaketseite(['texterkennung'], 'ablago.text'));
    assert.ok(darfPaketseite(['texterkennung'], 'ablago.pdf'));
    assert.ok(!darfPaketseite(['texterkennung'], 'ablago.briefsatz'));
    assert.ok(!darfPaketseite(['texterkennung'], undefined), 'die Liste der Pakete nur mit „Pakete“');
    assert.ok(!darfPaketseite(['texterkennung'], 'basis'));
    assert.ok(darfPaketseite(null, 'ablago.erechnung'));
    for (const r of Object.values(ANBIETER_RECHT)) assert.ok(darfSeite([r], r));
    // Nur Kennungen, die es gibt (die Liste kennt sie nur als Muster, damit kein Kreis über die Leistungen entsteht).
    for (const k of [...Object.keys(ANBIETER_RECHT), bereichWeg('texterkennung').split('/').pop()!])
      assert.ok(Object.hasOwn(EINGEBAUTE_ANBIETER, k), k);
  });
});
