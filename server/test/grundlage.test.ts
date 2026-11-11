/**
 * Grundlage zusammenführen (#724): ein Zeitplan-Baustein (eine Regel zum Nachholen, ein Lauf je Tag auch mit zwei
 * Servern), „Datum erreicht“ mit Vorlauf in Kalendermonaten, ein Weg für Aufgaben (Vertretung, deaktiviert, erledigt
 * sich selbst, Ersteller, keine zweite Frist neben der eingebauten Erinnerung) und ein Ereignis je Geschehen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erreichteDaten } from '../../shared/src/automatisierung';
import { EREIGNISSE } from '../../shared/src/pakete';
import { PAKET_KATALOG, VERALTETE_EREIGNISSE, wiederholungNach } from '../../shared/src/ereignisse';
import { WEBHOOK_WARTEN_S } from '../../shared/src/webhook';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { einstellungsMerker, faelligeTage, laufeFaellige, wochentagVon } from '../src/zeitplan';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id);
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'kuendbar_bis', label: 'Kündbar bis', typ: 'datum', frist: { vorlauf: 30, einheit: 'tage', empfaengerFeld: null, text: '{feld} {datum}', wiederholung: null } },
    { key: 'ende', label: 'Ende', typ: 'datum' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  return { d, konten, admin, lena, jonas, vertrag, motor };
}

describe('Zeitplan-Baustein (#724)', () => {
  it('eine Regel: ab der Uhrzeit, neu erst ab heute, verpasste Tage nur so weit wie erlaubt, Wochentag', () => {
    const jetzt = { datum: '2027-03-10', uhr: '06:59' };
    assert.deepEqual(faelligeTage(null, jetzt, { uhrzeit: '07:00' }), [], 'vor der Uhrzeit nichts, auch nicht gestern');
    assert.deepEqual(faelligeTage(null, { ...jetzt, uhr: '07:00' }, { uhrzeit: '07:00' }), ['2027-03-10']);
    assert.deepEqual(faelligeTage('2027-03-06', { ...jetzt, uhr: '09:00' }, { uhrzeit: '07:00' }), ['2027-03-10'], 'ohne Nachholen nur heute');
    assert.deepEqual(faelligeTage('2027-03-06', jetzt, { uhrzeit: '07:00', nachholenTage: 31 }), ['2027-03-07', '2027-03-08', '2027-03-09']);
    assert.equal(wochentagVon('2027-03-10'), 3, 'Mittwoch');
    assert.deepEqual(faelligeTage('2027-03-01', { ...jetzt, uhr: '08:00' }, { uhrzeit: '07:00', nachholenTage: 31, an: (t) => wochentagVon(t) === 1 }), ['2027-03-08']);
  });

  it('zwei Server zugleich: der Lauf eines Tages genau einmal; nach dem Neustart am selben Tag nachgeholt', async () => {
    const e = speicherEinstellungen();
    let n = 0;
    const lauf = async () => { n++; };
    const jetzt = { datum: heuteIn(), uhr: '23:59' };
    await Promise.all([laufeFaellige(einstellungsMerker(e, 'probe'), jetzt, { uhrzeit: '04:00' }, lauf), laufeFaellige(einstellungsMerker(e, 'probe'), jetzt, { uhrzeit: '04:00' }, lauf)]);
    assert.equal(n, 1);
    await laufeFaellige(einstellungsMerker(e, 'probe'), jetzt, { uhrzeit: '04:00' }, lauf);
    assert.equal(n, 1, 'heute schon gelaufen');
    assert.equal(await e.lies('probe'), heuteIn());
  });
});

describe('„Datum erreicht“ (#724)', () => {
  it('Vorlauf in Tagen, Wochen und Kalendermonaten (Monatsende gekappt)', () => {
    assert.deepEqual(erreichteDaten('2027-03-10', 7, 'tage'), ['2027-03-17']);
    assert.deepEqual(erreichteDaten('2027-03-10', 2, 'wochen'), ['2027-03-24']);
    assert.deepEqual(erreichteDaten('2027-03-10', -1, 'wochen'), ['2027-03-03'], 'negativ = danach');
    assert.deepEqual(erreichteDaten('2027-02-27', 3, 'monate'), ['2027-05-27']);
    assert.deepEqual(erreichteDaten('2027-02-28', 3, 'monate'), ['2027-05-28', '2027-05-29', '2027-05-30', '2027-05-31'], '3 Monate vor 31.05. ist der 28.02.');
    assert.deepEqual(erreichteDaten('2027-03-01', 3, 'monate'), ['2027-06-01']);
  });

  it('3 Monate vorher → Frist für Lena; Abwesenheit → an Jonas; erledigt sich, wenn das Datum geändert wird; Folgetermin', async () => {
    const { d, konten, admin, lena, jonas, vertrag, motor } = await aufbau();
    const datum = verschiebe(heuteIn(), 3, 'monate');
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', ende: datum, verantwortlich: lena.id } }, admin.id);
    await konten.setzeAbwesenheit(lena, lena.id, { an: true, vertreterId: jonas.id });
    const a = await motor.lege({ name: 'Ende', aktiv: true, wenn: { art: 'datum', typ: vertrag.id, feld: 'ende', vorlauf: 3, einheit: 'monate', uhrzeit: '00:00', wiederholung: 12 },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'verantwortlich' }], text: '{name} endet am {ende}.' }] }, admin.id);
    await motor.zeitplan();
    const [l] = await motor.laeufe(a.id);
    assert.equal(l?.zustand, 'abgeschlossen', JSON.stringify(l?.schritte));
    const [f] = (await d.alleAufgaben()).filter((x) => x.mappeId === m.id && x.feldKey === 'ende');
    assert.equal(f.art, 'frist', 'Art bleibt erkennbar');
    assert.equal(f.empfaengerId, jonas.id, 'Vertretung');
    assert.equal(f.datum, datum);
    assert.ok((await d.mappenHistorie.historie(m.id)).some((h) => /weitergegeben wegen Abwesenheit von Lena/.test(String(h.daten.text))));
    // Datum verschoben → die Frist erledigt sich selbst.
    await d.mappen.aendereMappe(m.id, { werte: { ende: verschiebe(datum, 1) } }, admin.id);
    assert.ok((await d.aufgabenVon(m.id)).find((x) => x.id === f.id)?.erledigt, 'erledigt sich selbst');
    assert.ok((await d.mappenHistorie.historie(m.id)).some((h) => /erledigt \(verschoben auf/.test(String(h.daten.text))));
  });

  it('deaktivierter Empfänger ohne Vertretung: Lauf bricht nicht ab, Aufgabe an die Administratoren; Ersteller wählbar', async () => {
    const { d, konten, admin, lena, vertrag, motor } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', ende: heuteIn(), verantwortlich: lena.id } }, admin.id);
    // Über die Werkbank geht Deaktivieren nur mit Vertreter – hier der Fall ohne (z. B. aus einer Anmeldung über Anbieter).
    await (konten as unknown as { repo: { aendereBenutzer(id: string, d: { aktiv: boolean }): Promise<unknown> } }).repo.aendereBenutzer(lena.id, { aktiv: false });
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const a = await motor.lege({ name: 'Heute', aktiv: true, wenn: { art: 'datum', typ: vertrag.id, feld: 'ende', vorlauf: 0, einheit: 'tage', uhrzeit: '00:00' },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'verantwortlich' }, { art: 'ersteller' }], text: 'Heute: {name}' }] }, admin.id);
    await motor.zeitplan();
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    const auf = (await d.alleAufgaben()).filter((x) => x.mappeId === m.id && x.feldKey === 'ende');
    assert.deepEqual(auf.map((x) => x.empfaengerId).sort(), [admin.id, null].sort(), 'Ersteller (Markus) und Administratoren statt Lena');
    assert.match(l.schritte[2].text!, /ohne Empfänger/);
  });

  it('keine zweite Frist neben der übernommenen Erinnerung (gleiche Person, gleiches Datum, #712)', async () => {
    const { d, admin, vertrag, motor } = await aufbau();
    assert.equal(await motor.fristenUebernehmen(), 2, 'Erinnerung am Feld → Automatisierung, dazu „Vertretung eingetragen“');
    const datum = verschiebe(heuteIn(), 30);
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendbar_bis: datum } }, admin.id);
    assert.equal((await d.alleAufgaben()).filter((x) => x.mappeId === m.id && x.art === 'frist').length, 0, 'das Feld legt selbst keine an');
    await motor.ereignis({ id: crypto.randomUUID(), art: 'mappe.angelegt', daten: { mappe: m.id, typ: vertrag.id }, ausloeser: { art: 'benutzer', id: admin.id, konto: admin.id }, erstellt: new Date().toISOString() });
    const eingebaut = (await d.alleAufgaben()).filter((x) => x.mappeId === m.id && x.art === 'frist');
    assert.equal(eingebaut.length, 1, 'übernommene Erinnerung an den Ersteller (Datum im Vorlauf, beim Speichern)');
    const a = await motor.lege({ name: 'Kündigen', aktiv: true, wenn: { art: 'datum', typ: vertrag.id, feld: 'kuendbar_bis', vorlauf: 30, einheit: 'tage', uhrzeit: '00:00' },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Kündigen?' }] }, admin.id);
    await motor.zeitplan();
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen');
    assert.match(l.schritte[2].text!, /schon eine Frist/);
    assert.equal((await d.alleAufgaben()).filter((x) => x.mappeId === m.id && x.art === 'frist').length, 1, 'nur eine');
  });

  it('alte Wenn-Karten: „Datum in N Tagen“ und „Frist erreicht“ werden „Datum erreicht“', async () => {
    const { motor, admin, vertrag } = await aufbau();
    const a = await motor.lege({ name: 'Alt', wenn: { art: 'datum', typ: vertrag.id, feld: 'ende', tage: 7, uhrzeit: '08:00' }, dann: [{ art: 'stopp' }] }, admin.id);
    assert.deepEqual(a.wenn, { art: 'datum', typ: vertrag.id, feld: 'ende', vorlauf: 7, einheit: 'tage', uhrzeit: '08:00', wiederholung: null });
    await assert.rejects(motor.lege({ name: 'Frist', wenn: { art: 'frist.erreicht', typ: vertrag.id }, dann: [{ art: 'stopp' }] }, admin.id), /Datumsfeld wählen/);
  });
});

describe('Aufgaben mit Anlass (#724)', () => {
  it('aus „Wenn Abwesenheit gesetzt“: erledigt sich, wenn die Abwesenheit endet', async () => {
    const { d, konten, admin, lena, jonas, motor } = await aufbau();
    const a = await motor.lege({ name: 'Vertretung', aktiv: true, wenn: { art: 'benutzer.abwesenheit_gesetzt', typ: null },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'person', id: jonas.id }], text: 'Du vertrittst jemanden.' }] }, admin.id);
    motor.start();
    try {
      await konten.setzeAbwesenheit(lena, lena.id, { an: true, vertreterId: jonas.id });
      await d.ereignisse.verteile();
      const [l] = await motor.laeufe(a.id);
      assert.equal(l?.zustand, 'abgeschlossen', JSON.stringify(l?.schritte));
      const offen = (await d.aufgabenVon(lena.id)).filter((x) => x.anlass?.art === 'abwesenheit' && x.anlass.automatisierung === a.id && !x.erledigt);
      assert.equal(offen.length, 1);
      await konten.setzeAbwesenheit(lena, lena.id, { an: false });
      assert.ok((await d.aufgabenVon(lena.id)).find((x) => x.id === offen[0].id)?.erledigt, 'erledigt sich selbst');
    } finally { motor.stop(); }
  });
});

describe('Ein Ereigniskatalog, ein Ausgangskorb, eine Regel für Wiederholungen (#724)', () => {
  it('Pakete abonnieren genau den Katalog (plus veraltete Namen); Webhooks nutzen dieselbe Regel mit langem Atem', () => {
    assert.deepEqual(Object.keys(EREIGNISSE).sort(), [...PAKET_KATALOG, ...Object.keys(VERALTETE_EREIGNISSE)].sort());
    assert.equal(wiederholungNach(0), 60);
    assert.equal(wiederholungNach(4), 21_600);
    assert.equal(wiederholungNach(5), null, 'danach aufgegeben');
    assert.deepEqual([...WEBHOOK_WARTEN_S], Array.from({ length: WEBHOOK_WARTEN_S.length }, (_, i) => wiederholungNach(i, 'lang')));
  });

  it('Dokument hochgeladen: ein Ereignis im Ausgangskorb, Pakete bekommen es mit Dateinamen über die Zustellung', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
    await d.kern.repo.speicherePaket({ id: 'echo', name: 'Echo', version: '1.0.0', beschreibung: '', typen: {}, sichten: {}, herkunft: { art: 'hochgeladen', von: null, am: new Date().toISOString() }, installiert: new Date().toISOString(), laeufer: { sprache: 'wasm', ereignisse: ['dokument.hochgeladen'], rechte: { lesen: [], schreiben: [], dokumente: 'keine' }, netz: [] } } as never);
    const katalog: string[] = [];
    d.ereignisse.abonniere('test', async (e) => { katalog.push(e.art); });
    const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: '1' } });
    await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'brief.txt', typ: 'text/plain' }, Buffer.from('Hallo'), null);
    await d.ereignisse.verteile();
    assert.equal(katalog.filter((a) => a === 'dokument.hochgeladen').length, 1, 'genau einmal');
    const [z] = (await d.kern.repo.faelligeEreignisse(10)).filter((x) => x.art === 'dokument.hochgeladen');
    assert.equal(z.paketId, 'echo');
    assert.equal(z.daten.name, 'brief.txt');
    await d.ereignisse.verteile();
    assert.equal((await d.kern.repo.faelligeEreignisse(10)).filter((x) => x.art === 'dokument.hochgeladen').length, 1, 'keine doppelte Zustellung');
  });
});
