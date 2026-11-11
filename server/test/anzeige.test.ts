/**
 * Merkmal „beruflich genutzt“ (#1032) und Anzeige-Bedingungen an Feldern und Abschnitten (#1033): Auswertung in
 * shared/, Pflicht auf dem Server genauso wie in der Oberfläche, Werte bleiben, Paketformat, Einrichtungsdatei,
 * Vollexport, Merkmal in Bedingungen von Rechten, Ansichten und Automatisierungen – nur Ordnung, kein Schutz.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import {
  anzeigeBedingungProblem, anzeigeProblemeVon, anzeigestand, beschreibeAnzeige, bereinigeAnzeige, pruefeMitAnzeige, verborgeneFelder, zeigtAn,
  type Anzeigeregel,
} from '../../shared/src/anzeige';
import { automatisierungsProbleme, bereinigeAutomatisierung } from '../../shared/src/automatisierung';
import { KEINE_MERKMALE, liesMerkmale } from '../../shared/src/merkmale';
import { istOk, type Mappe, type Mappentyp, type Werte } from '../../shared/src/model';
import { bereinigeRegelwerk, rechteAn } from '../../shared/src/rechte';
import { bereinigeBedingungen, filterFuer, inSicht } from '../../shared/src/sichten';
import { liesVerwaltung, verwaltungsbaum } from '../../shared/src/verwaltungsrecht';
import { vorlageFuer } from '../../shared/src/werkbankansicht';
import { openapi } from '../src/api-v1';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { bereinigeTyp } from '../src/mappentypen';
import { planAusEingabe } from '../src/einrichtung';
import { liesEinrichtungsdatei, schreibeEinrichtungsdatei } from '../src/einrichtungsdatei';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, Paketverwaltung } from '../src/pakete';
import { baue } from '../src/paketerstellung';
import { speicherRepo } from '../src/repo-speicher';
import { bereicheDerRoute, NUR_GESAMT } from '../src/verwaltungsbereiche';
import { vollexport } from '../src/vollexport';
import { zipPuffer } from '../src/zip';

/** Ein Vertrag für alle (Konzept „Verträge und Rechnungen“): Abschnitt „Miete“ nur bei Vertragsart Miete, „Abschluss“ nur beruflich. */
const MIETE: Anzeigeregel = { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Miete'] } } }] };
const BERUFLICH: Anzeigeregel = { modus: 'alle', bedingungen: [{ art: 'merkmal', merkmal: 'beruflich' }] };
const VERTRAG = {
  name: 'Vertrag', titelVorlage: '{name}',
  felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'art', label: 'Vertragsart', typ: 'auswahl', optionen: ['Miete', 'Strom', 'Versicherung'] },
    { key: 'kaltmiete', label: 'Kaltmiete', typ: 'betrag', pflicht: true },
    { key: 'kaution', label: 'Kaution', typ: 'betrag' },
    { key: 'vermieter', label: 'Vermieter', typ: 'text' },
    { key: 'kostenstelle', label: 'Kostenstelle', typ: 'text', pflicht: true },
    { key: 'notiz', label: 'Notiz', typ: 'langtext', anzeigen: { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'leer' }, nicht: true }] } },
  ],
  register: [
    { key: 'vertrag', name: 'Vertrag', art: 'felder', felder: ['name', 'art', 'kaltmiete', 'kaution', 'vermieter', 'kostenstelle', 'notiz'],
      abschnitte: [{ vor: 'kaltmiete', titel: 'Miete', anzeigen: MIETE }, { vor: 'kostenstelle', titel: 'Abschluss', anzeigen: BERUFLICH }, { vor: 'notiz', titel: 'Weiteres' }] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ],
};
const typ = () => ({ ...bereinigeTyp(VERTRAG), id: 'vertrag', erstellt: '', geaendert: '' }) as Mappentyp;
const BETRAG = { betrag: 950, waehrung: 'EUR' };

describe('Anzeige-Bedingungen (#1033): Auswertung in shared/', () => {
  it('Datenmodell: an Feldern und Abschnitten, bereinigt; ohne Bedingung keine Regel', () => {
    const t = typ();
    assert.deepEqual(t.register[0].abschnitte!.map((a) => [a.titel, !!a.anzeigen]), [['Miete', true], ['Abschluss', true], ['Weiteres', false]]);
    assert.deepEqual(t.felder.find((f) => f.key === 'notiz')!.anzeigen?.bedingungen[0].nicht, true);
    assert.equal(bereinigeAnzeige({ modus: 'eine', bedingungen: [{ art: 'gibtsnicht' }, 'x'] }), undefined);
    assert.deepEqual(bereinigeAnzeige({ modus: 'eine', bedingungen: [{ art: 'merkmal', merkmal: 'beruflich', nicht: true }, { art: 'verweistyp', feld: 'betrifft', typ: 't-fahrzeug' }] }),
      { modus: 'eine', bedingungen: [{ nicht: true, art: 'merkmal', merkmal: 'beruflich' }, { art: 'verweistyp', feld: 'betrifft', typ: 't-fahrzeug' }] });
    assert.equal(bereinigeAnzeige({ bedingungen: [{ art: 'merkmal', merkmal: 'privat' }] }), undefined, 'nur das eine Merkmal (#1032)');
  });

  it('Abschnitt ausgeblendet → alle Felder bis zum nächsten Abschnitt; der nächste erscheint wieder', () => {
    const t = typ();
    const s = anzeigestand(t, { art: 'Strom' }, { merkmale: KEINE_MERKMALE });
    assert.deepEqual([...s.verborgen].sort(), ['kaltmiete', 'kaution', 'kostenstelle', 'vermieter']);
    assert.deepEqual(s.abschnitte.map((a) => [a.abschnitt.titel, a.felder]), [['Miete', ['kaltmiete', 'kaution', 'vermieter']], ['Abschluss', ['kostenstelle']]]);
    assert.ok(!s.verborgen.has('notiz'), '„Weiteres“ erscheint wieder normal (Vertragsart ist gesetzt)');
    // Art gewählt → Abschnitt erscheint; beruflich → Abschluss erscheint.
    assert.deepEqual([...verborgeneFelder(t, { art: 'Miete' }, { merkmale: { beruflich: true } })], []);
    assert.deepEqual([...verborgeneFelder(t, {}, {})].sort(), ['kaltmiete', 'kaution', 'kostenstelle', 'notiz', 'vermieter'], 'eigene Bedingung am Feld: „Vertragsart nicht leer“');
  });

  it('umkehrbar, „alle“ und „eine davon“, Verweis auf bestimmte Mappe und auf eine Mappe vom Typ …', () => {
    const t = { felder: [
      { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['A', 'B'] },
      { key: 'vertragsart', label: 'Vertragsart', typ: 'referenz', zielTypen: ['t-art'] },
      { key: 'betrifft', label: 'betrifft', typ: 'referenz', zielTypen: ['*'] },
    ] } as Mappentyp;
    const art = { art: 'feld' as const, bedingung: { art: 'feld' as const, feld: 'art', op: 'einerVon' as const, wert: { art: 'fest' as const, wert: ['A'] } } };
    assert.equal(zeigtAn({ modus: 'alle', bedingungen: [art, { art: 'merkmal', merkmal: 'beruflich' }] }, t, { art: 'A' }, {}), false);
    assert.equal(zeigtAn({ modus: 'eine', bedingungen: [art, { art: 'merkmal', merkmal: 'beruflich' }] }, t, { art: 'A' }, {}), true);
    assert.equal(zeigtAn({ modus: 'alle', bedingungen: [{ ...art, nicht: true }] }, t, { art: 'A' }), false);
    // Verweis zeigt auf eine bestimmte Mappe – vorerst über die Id (feste Kennungen mit #1038).
    const miete = { modus: 'alle' as const, bedingungen: [{ art: 'feld' as const, bedingung: { art: 'feld' as const, feld: 'vertragsart', op: 'zeigtAuf' as const, wert: { art: 'fest' as const, wert: ['m-miete'] } } }] };
    assert.equal(zeigtAn(miete, t, { vertragsart: 'm-miete' }), true);
    assert.equal(zeigtAn(miete, t, { vertragsart: 'm-strom' }), false);
    // Verweis zeigt auf eine Mappe vom Typ …: bei festem Ziel ohne Nachschlagen, bei „jede Mappe“ über typVon.
    const fahrzeug = { modus: 'alle' as const, bedingungen: [{ art: 'verweistyp' as const, feld: 'betrifft', typ: 't-fahrzeug' }] };
    const typVon = (id: string) => ({ 'm-auto': 't-fahrzeug', 'm-haus': 't-immobilie' } as Record<string, string>)[id];
    assert.equal(zeigtAn(fahrzeug, t, { betrifft: ['m-haus', 'm-auto'] }, { typVon }), true);
    assert.equal(zeigtAn(fahrzeug, t, { betrifft: ['m-haus'] }, { typVon }), false);
    assert.equal(zeigtAn({ modus: 'alle', bedingungen: [{ art: 'verweistyp', feld: 'vertragsart', typ: 't-art' }] }, t, { vertragsart: 'x' }), true);
    assert.match(beschreibeAnzeige(fahrzeug, t, { typ: () => 'Fahrzeug' }), /^nur bei „betrifft“ zeigt auf eine Mappe vom Typ Fahrzeug$/);
  });

  it('Probleme: Bedingung mit Problem zählt nicht (Feld bleibt zu sehen); nicht auf sich selbst', () => {
    const t = typ();
    const weg = { modus: 'alle' as const, bedingungen: [{ art: 'feld' as const, bedingung: { art: 'feld' as const, feld: 'gibtsnicht', op: 'leer' as const } }] };
    assert.equal(zeigtAn(weg, t, {}), true);
    assert.match(anzeigeBedingungProblem(weg.bedingungen[0], t)!, /gibtsnicht/);
    assert.match(anzeigeBedingungProblem(MIETE.bedingungen[0], t, ['art'])!, /einblenden/);
    // Abhängig von der Person, die ansieht? Nein – nur feste Werte (und „heute“).
    assert.match(anzeigeBedingungProblem({ art: 'feld', bedingung: { art: 'feld', feld: 'vermieter', op: 'gleich', wert: { art: 'ich' } } }, t)!, /feste Werte/);
    const p = anzeigeProblemeVon({ ...t, register: [{ ...t.register[0], abschnitte: [{ vor: 'art', titel: 'Kopf', anzeigen: MIETE }] }] });
    assert.ok(p['abschnitt:vertrag.art']?.length, 'ein Abschnitt schaut nicht auf eigene Felder');
  });

  it('Pflicht: in einem ausgeblendeten Bereich nicht Pflicht – sonst wie immer', () => {
    const t = typ();
    const ctx = { typVon: () => undefined, doppelt: () => undefined };
    assert.ok(istOk(pruefeMitAnzeige(t, { name: 'Strom Nord', art: 'Strom' }, ctx)));
    assert.deepEqual(Object.keys(pruefeMitAnzeige(t, { name: 'Wohnung', art: 'Miete' }, ctx).felder), ['kaltmiete']);
    assert.deepEqual(Object.keys(pruefeMitAnzeige(t, { name: 'Wohnung', art: 'Miete', kaltmiete: BETRAG }, { ...ctx, merkmale: { beruflich: true } }).felder), ['kostenstelle']);
  });
});

/* ---------- Server ---------- */

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const vertrag = await d.mappentypen.legeTypAn(VERTRAG);
  return { d, konten, admin, vertrag };
}
const fehlerFelder = async (p: Promise<unknown>): Promise<string[]> => {
  try { await p; return []; } catch (e) {
    if (!(e instanceof Fachfehler) || e.status !== 422) throw e;
    return Object.keys((e.details as { felder: Record<string, unknown> }).felder).sort();
  }
};

describe('Merkmal „beruflich genutzt“ und Anzeige-Bedingungen (#1032, #1033): Server', () => {
  it('Merkmal: Vorgabe nein, nur ja/nein, gespeichert nur wenn an; Werkbank-Vorlage folgt, solange unverändert', async () => {
    const { d } = await aufbau();
    assert.deepEqual(await d.werkbank.merkmale(), { beruflich: false });
    await assert.rejects(d.werkbank.setzeMerkmale({ beruflich: 'ja' }, 'markus@example.org'), (e) => e instanceof Fachfehler && e.status === 422);
    await d.kern.einstellungen!.schreibe('werkbank_ansicht', { vorlage: 'haushalt', ein: [], aus: [] });
    assert.deepEqual(await d.werkbank.setzeMerkmale({ beruflich: true, unbekannt: true }, 'markus@example.org'), { beruflich: true });
    assert.deepEqual(await d.kern.einstellungen!.lies('merkmale'), { beruflich: true });
    assert.equal((await d.werkbank.werkbankAnsicht({ id: null, email: 'x' })).installation.vorlage, 'organisation', 'Vorgabe der Vorlage (#987): beruflich → Betrieb');
    await d.werkbank.setzeWerkbankAnsicht({ id: null, email: 'x' }, { installation: { vorlage: 'organisation', ein: ['demo'], aus: [] } });
    await d.werkbank.setzeMerkmale({ beruflich: false }, 'markus@example.org');
    assert.equal(await d.kern.einstellungen!.lies('merkmale'), null);
    assert.equal((await d.werkbank.werkbankAnsicht({ id: null, email: 'x' })).installation.vorlage, 'organisation', 'angepasste Leiste bleibt');
    assert.equal(vorlageFuer({ beruflich: false }), 'haushalt');
    assert.deepEqual((await d.sichten.zaehlerRahmen()).merkmale, { beruflich: false }, 'die Oberfläche bekommt es mit dem Rahmen der Ablage');
  });

  it('nur „Gesamte Verwaltung“ ändert es; der Bereich lässt sich nicht einzeln vergeben', () => {
    assert.deepEqual(bereicheDerRoute('PUT', '/api/werkbank/merkmale'), [NUR_GESAMT]);
    assert.deepEqual(liesVerwaltung(['nutzung', 'region']), ['region']);
    assert.ok(!verwaltungsbaum().some((a) => a.bereiche.some((b) => b.pfad === 'nutzung')));
  });

  it('Pflicht mit ausgeblendetem Abschnitt: der Server prüft wie shared/ – Werte bleiben gespeichert und in der API', async () => {
    const { d, admin, vertrag } = await aufbau();
    const ctx = { typVon: () => undefined, doppelt: () => undefined };
    const faelle: Array<{ werte: Werte; beruflich: boolean }> = [
      { werte: { name: 'Strom', art: 'Strom' }, beruflich: false },
      { werte: { name: 'Wohnung', art: 'Miete' }, beruflich: false },
      { werte: { name: 'Wohnung', art: 'Miete', kaltmiete: BETRAG }, beruflich: true },
      { werte: { name: 'Büro', art: 'Miete', kaltmiete: BETRAG, kostenstelle: 'K-1' }, beruflich: true },
      { werte: { name: 'Strom', art: 'Strom' }, beruflich: true },
    ];
    for (const f of faelle) {
      await d.werkbank.setzeMerkmale({ beruflich: f.beruflich }, 'markus@example.org');
      const server = await fehlerFelder(d.mappen.legeMappeAn({ typId: vertrag.id, werte: f.werte }, admin.id));
      const geteilt = Object.keys(pruefeMitAnzeige(vertrag, { ...f.werte }, { ...ctx, merkmale: { beruflich: f.beruflich } }).felder).sort();
      assert.deepEqual(server, geteilt, `gleiche Auswertung für ${JSON.stringify(f)}`);
    }
    // Ausgeblendete Werte bleiben gespeichert: Vertragsart von Miete auf Strom.
    await d.werkbank.setzeMerkmale({ beruflich: false }, 'markus@example.org');
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wohnung', art: 'Miete', kaltmiete: BETRAG, kaution: { betrag: 2850, waehrung: 'EUR' }, vermieter: 'Petra' } }, admin.id);
    const n = await d.mappen.aendereMappe(m.id, { werte: { art: 'Strom' } }, admin.id);
    assert.deepEqual([n.werte.kaltmiete, n.werte.vermieter], [BETRAG, 'Petra'], 'Werte bleiben (wie #655)');
    assert.equal((await d.mappen.holeMappe(m.id)).mappe.werte.vermieter, 'Petra', 'API zeigt alle Werte');
    assert.deepEqual(anzeigestand(vertrag, n.werte, {}).abschnitte.map((a) => a.abschnitt.titel), ['Miete', 'Abschluss']);
    // Pflicht kommt zurück, sobald der Abschnitt wieder zu sehen ist.
    const o = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', art: 'Strom' } }, admin.id);
    assert.deepEqual(await fehlerFelder(d.mappen.aendereMappe(o.id, { werte: { art: 'Miete' } }, admin.id)), ['kaltmiete']);
  });

  it('Speichern des Typs prüft die Bedingungen; Systemfelder bekommen keine', async () => {
    const { d, vertrag } = await aufbau();
    await assert.rejects(d.mappentypen.aendereTyp(vertrag.id, { ...vertrag, felder: vertrag.felder.map((f) => (f.key === 'vermieter' ? { ...f, anzeigen: { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'gibtsnicht', op: 'leer' } }] } } : f)) }),
      (e) => e instanceof Fachfehler && e.status === 422);
    await assert.rejects(d.mappentypen.aendereTyp(vertrag.id, { ...vertrag, register: vertrag.register.map((r) => (r.key === 'vertrag' ? { ...r, abschnitte: [{ vor: 'art', titel: 'Kopf', anzeigen: MIETE }] } : r)) }),
      (e) => e instanceof Fachfehler && /Kopf/.test(JSON.stringify(e.details)));
    // Wer anzeigen nicht nennt (älteres Programm), behält die Regel.
    const ohne = { ...vertrag.felder.find((f) => f.key === 'notiz')! };
    delete ohne.anzeigen;
    const neu = await d.mappentypen.aendereTyp(vertrag.id, { ...vertrag, felder: vertrag.felder.map((f) => (f.key === 'notiz' ? ohne : f)) });
    assert.ok(neu.felder.find((f) => f.key === 'notiz')!.anzeigen);
    const post = (await d.mappentypen.listeTypen()).find((x) => x.system === 'post');
    if (post) {
      const p = await d.mappentypen.aendereTyp(post.id, { ...post, felder: post.felder.map((f) => (f.key === 'betreff' ? { ...f, anzeigen: BERUFLICH } : f)) });
      assert.equal(p.felder.find((f) => f.key === 'betreff')!.anzeigen, undefined);
    }
  });

  it('Merkmal ändern zieht die Passung nach (Pflicht hängt daran)', async () => {
    const { d, admin, vertrag } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', art: 'Strom' } }, admin.id);
    await d.werkbank.setzeMerkmale({ beruflich: true }, 'markus@example.org');
    await d.passung.pruefePassung(vertrag.id);
    assert.match((await d.mappen.holeMappe(m.id)).mappe.problem ?? '', /Kostenstelle/);
    await d.werkbank.setzeMerkmale({ beruflich: false }, 'markus@example.org');
    await d.passung.pruefePassung(vertrag.id);
    assert.equal((await d.mappen.holeMappe(m.id)).mappe.problem ?? null, null);
  });

  it('Paketformat: Paket erstellen nimmt die Einstellung mit, das Lesen prüft sie; Typ-Verweis statt Id, bestimmte Mappe bleibt weg', async () => {
    const { d, vertrag, admin } = await aufbau();
    const fahrzeug = await d.mappentypen.legeTypAn({ name: 'Fahrzeug', felder: [{ key: 'kennzeichen', label: 'Kennzeichen', typ: 'text' }] });
    const auto = await d.mappen.legeMappeAn({ typId: fahrzeug.id, werte: { kennzeichen: 'B-LN 1' } }, admin.id);
    const t = await d.mappentypen.aendereTyp(vertrag.id, { ...vertrag, felder: [...vertrag.felder,
      { key: 'betrifft', label: 'betrifft', typ: 'referenz', zielTyp: fahrzeug.id },
      { key: 'kfz', label: 'Kfz-Steuer', typ: 'betrag', anzeigen: { modus: 'eine', bedingungen: [{ art: 'verweistyp', feld: 'betrifft', typ: fahrzeug.id }, { art: 'feld', bedingung: { art: 'feld', feld: 'betrifft', op: 'zeigtAuf', wert: { art: 'fest', wert: [auto.id] } } }] } },
    ], register: vertrag.register.map((r) => (r.key === 'vertrag' ? { ...r, felder: [...r.felder!, 'betrifft', 'kfz'] } : r)) });
    const bau = baue({ typen: [t.id, fahrzeug.id], sichten: [], beispiele: [], id: 'vertraege_test', name: 'Verträge', version: '1.0.0', beschreibung: 'Ein Paket zum Testen der Anzeige-Bedingungen.', autor: { name: 'Markus', github: 'markus' }, lizenz: 'MIT', dms: '>=0.113.0', aenderungen: '' },
      { typen: await d.mappentypen.listeTypen(), sichten: [], pakete: [], dmsTypen: new Map(), mappen: [], dmsVersion: '0.217.0', entwurf: null, jetzt: new Date('2026-11-10T12:00:00Z') });
    assert.ok(bau.hinweise.some((h) => /Anzeige-Bedingung nennt eine Mappe/.test(h)), bau.hinweise.join(' | '));
    const yaml = parse(bau.dateien.find((x) => x.name.endsWith('mappentypen.yaml'))!.daten.toString()) as Array<{ schluessel: string; felder: Array<Record<string, unknown>>; register: Array<Record<string, unknown>> }>;
    const v = yaml.find((x) => x.felder.some((f) => f.key === 'kfz'))!;
    const fz = yaml.find((x) => x.felder.some((f) => f.key === 'kennzeichen'))!.schluessel;
    assert.deepEqual(v.felder.find((f) => f.key === 'kfz')!.anzeigen, { modus: 'eine', bedingungen: [{ art: 'verweistyp', feld: 'betrifft', typ: fz }] });
    assert.deepEqual((v.register.find((r) => r.key === 'vertrag')!.abschnitte as Array<Record<string, unknown>>).map((a) => !!a.anzeigen), [true, true, false]);
    const gelesen = liesPaket(new Map(bau.dateien.map((x) => [x.name, x.daten] as const)));
    assert.ok(gelesen.typen.some((x) => x.felder.some((f) => f.key === 'kfz' && f.anzeigen)));
    // Prüfung beim Installieren: anzeigen ist ein Objekt, Typen als gültiger Verweis.
    const kaputt = new Map(bau.dateien.map((x) => [x.name, x.name.endsWith('mappentypen.yaml')
      ? Buffer.from(x.daten.toString().replace(`typ: ${fz}`, 'typ: "kein verweis!"').replace(/anzeigen:\n(\s+)modus: alle\n\s+bedingungen:\n\s+- art: merkmal\n\s+merkmal: beruflich/, 'anzeigen: nein')) : x.daten] as const));
    assert.throws(() => liesPaket(kaputt), (e) => e instanceof Fachfehler && /anzeigen/.test(JSON.stringify(e.details)));
  });

  it('Merkmal in Bedingungen von Ansichten, Rechten und Automatisierungen – Sichtbarkeit von Feldern zählt dort nie', async () => {
    const { d, admin, vertrag } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', art: 'Strom' } }, admin.id);
    // Ansicht
    const s = await d.sichtenVerwaltung.legeSichtAn({ name: 'Beruflich', typen: [vertrag.id], bedingungen: [{ art: 'merkmal', merkmal: 'beruflich' }] });
    const zahl = async () => (await d.sichten.zaehler({ id: admin.id, rolle: 'admin' })).sichten[s.id];
    assert.equal(await zahl(), 0);
    await d.werkbank.setzeMerkmale({ beruflich: true }, 'markus@example.org');
    assert.equal(await zahl(), 1);
    assert.deepEqual(bereinigeBedingungen([{ art: 'merkmal', merkmal: 'beruflich', nicht: true }]), [{ art: 'merkmal', merkmal: 'beruflich', nicht: true }]);
    const k = filterFuer({ bedingungen: [{ art: 'merkmal', merkmal: 'beruflich', nicht: true }] }, [vertrag], { heute: '2026-11-10', ich: admin.id, meineRollen: [], merkmale: { beruflich: true } });
    assert.equal(inSicht(m, [{ typen: [vertrag.id], filter: k }], { dokumente: () => 0, verknuepfungen: () => 0 }), false);
    // Rechte: „Ablage wird beruflich genutzt“ entzieht Lesen – die Felder des Abschnitts „Abschluss“ spielen keine Rolle.
    const rw = bereinigeRegelwerk({ regeln: [{ name: 'Nur privat', wenn: [{ art: 'merkmal', merkmal: 'beruflich' }], dann: { R: 'entziehen' } }] });
    const mitRegel = { ...vertrag, berechtigungen: rw };
    const lesen = (beruflich: boolean) => rechteAn(mitRegel, m as Mappe, { id: 'jemand', rollen: [] }, { heute: '2026-11-10', ich: 'jemand', meineRollen: [], merkmale: liesMerkmale({ beruflich }) }, { dokumente: () => 0, verknuepfungen: () => 0 }).rechte.R;
    assert.deepEqual([lesen(false), lesen(true)], [true, false]);
    // Automatisierung: Und-Karte mit Merkmal braucht keine Mappe.
    const ak = await d.automatisierungshilfen.automatisierungKontext();
    const a = bereinigeAutomatisierung({ name: 'Beruflich', wenn: { art: 'zeitplan', uhrzeit: '08:00', tage: [1] }, und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'merkmal', merkmal: 'beruflich' } }] }, dann: [{ id: 's', art: 'stopp' }] });
    assert.deepEqual(automatisierungsProbleme(a, ak), []);
    const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(), uhr: Date.now });
    const b = await motor.lege({ name: 'Bei beruflich', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id }, und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'merkmal', merkmal: 'beruflich' }, nicht: true }] }, dann: [{ id: 's', art: 'stopp' }] }, admin.id);
    await motor.ereignis({ id: crypto.randomUUID(), art: 'mappe.geaendert', daten: { mappe: m.id, typ: vertrag.id, felder: ['name'] }, ausloeser: { art: 'benutzer', id: admin.id, konto: admin.id }, erstellt: new Date().toISOString() } as never);
    assert.equal((await motor.laeufe(b.id))[0].zustand, 'unzutreffend', '„nicht beruflich“ trifft nicht zu');
  });

  it('Vollexport, Einrichtungsdatei (#806) und API nehmen das Merkmal mit', async () => {
    const { d, konten } = await aufbau();
    await d.werkbank.setzeMerkmale({ beruflich: true }, 'markus@example.org');
    const quelle = d.vollexport.vollexportQuelle({ mandant: 'Tischlerei Brandt', version: '0.0.0', benutzer: () => konten.exportDaten(), designs: async () => [], protokoll: () => [], merkmale: () => d.werkbank.merkmale() });
    const r = await vollexport(quelle, await mkdtemp(join(tmpdir(), 'dms-1032-')), {});
    assert.deepEqual(JSON.parse(await readFile(join(r.ordner, 'struktur/merkmale.json'), 'utf8')), { beruflich: true });
    assert.ok(JSON.parse(await readFile(join(r.ordner, 'struktur/mappentypen.json'), 'utf8')).some((x: Mappentyp) => x.register.some((y) => y.abschnitte?.some((a) => a.anzeigen))), 'Typen mit ihren Bedingungen');
    const plan = planAusEingabe({ ablage: 'Tischlerei', konto: { email: 'katrin@example.org' }, optional: { beruflich: true } });
    assert.equal(plan.optional.beruflich, true);
    const yaml = schreibeEinrichtungsdatei(plan);
    assert.match(yaml, /beruflich: true/);
    assert.equal(liesEinrichtungsdatei(yaml).plan!.optional.beruflich, true);
    assert.ok(!/beruflich/.test(schreibeEinrichtungsdatei(planAusEingabe({ ablage: 'Familie', konto: { email: 'lena@example.org' } }))), 'Vorgabe nein steht nicht in der Datei');
    const s = JSON.stringify(openapi('0.0.0'));
    for (const k of ['"/merkmale"', '"Anzeigeregel"', '"verweistyp"']) assert.ok(s.includes(k), k);
  });
});

/* ---------- Paket installieren ---------- */

const KATALOG = 'https://katalog.test/katalog.json';
function katalog(dateien: Record<string, string>) {
  const zip = zipPuffer(Object.entries(dateien).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
  const sha = createHash('sha256').update(zip).digest('hex');
  const eintrag = { id: 'vertraege_test', name: 'Verträge', beschreibung: '', autor: { name: 'Test', github: 'test' }, lizenz: 'MIT', aktuell: '1.0.0', versionen: [{ version: '1.0.0', dms: '>=0.60.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: 'archive/v.zip', sha256: sha, groesse: zip.length, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '' }] };
  const daten = new Map<string, Buffer>([[KATALOG, Buffer.from(JSON.stringify({ format: 1, erstellt: '', quelle: '', pakete: [eintrag] }))], ['https://katalog.test/archive/v.zip', zip]]);
  return async (url: string) => { const b = daten.get(url); if (!b) throw new Error(`404 ${url}`); return b; };
}

describe('Paket installieren mit Anzeige-Bedingungen (#1033)', () => {
  it('Typ-Verweis wird zur Id, Abschnitte und Felder behalten ihre Regel', async () => {
    const { d, admin } = await aufbau();
    const p = new Paketverwaltung(d, { version: () => '0.230.0', abruf: katalog({
      'manifest.yaml': 'schema: 1\nid: vertraege_test\nname: Verträge\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.60.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n',
      'inhalt/mappentypen.yaml': [
        '- schluessel: fahrzeug', '  name: Fahrzeug', '  beschreibung: Auto', '  felder:', '    - { key: kennzeichen, label: Kennzeichen, typ: text }',
        '  register:', '    - { key: daten, name: Daten, art: felder, felder: [kennzeichen] }',
        '- schluessel: vertrag', '  name: Paketvertrag', '  beschreibung: Ein Vertrag für alle', '  felder:',
        '    - { key: name, label: Name, typ: text }', '    - { key: betrifft, label: betrifft, typ: referenz, ziel: fahrzeug }',
        '    - key: kfz', '      label: Kfz-Steuer', '      typ: betrag', '      anzeigen: { modus: alle, bedingungen: [{ art: verweistyp, feld: betrifft, typ: fahrzeug }] }',
        '    - { key: kostenstelle, label: Kostenstelle, typ: text, pflicht: true }',
        '  register:', '    - key: vertrag', '      name: Vertrag', '      art: felder', '      felder: [name, betrifft, kfz, kostenstelle]',
        '      abschnitte: [{ vor: kostenstelle, titel: Abschluss, anzeigen: { modus: alle, bedingungen: [{ art: merkmal, merkmal: beruflich }] } }]', '',
      ].join('\n'),
    }), katalogUrl: KATALOG });
    const inst = await p.installiere({ id: 'vertraege_test', version: '1.0.0' }, { id: admin.id, email: admin.email });
    const typen = await d.mappentypen.listeTypen();
    const v = typen.find((x) => x.id === inst.typen.vertrag)!;
    assert.deepEqual(v.felder.find((f) => f.key === 'kfz')!.anzeigen, { modus: 'alle', bedingungen: [{ art: 'verweistyp', feld: 'betrifft', typ: inst.typen.fahrzeug }] });
    assert.deepEqual(v.register[0].abschnitte, [{ vor: 'kostenstelle', anzeigen: BERUFLICH, titel: 'Abschluss' }]);
    // Privat: Kostenstelle ist nicht Pflicht.
    await d.mappen.legeMappeAn({ typId: v.id, werte: { name: 'Haftpflicht' } }, admin.id);
  });
});
