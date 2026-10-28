/** Abwesenheit mit Vertreter (#78) und Deaktivieren nur mit Vertreter (#77). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erwaehnung } from '../../shared/src/markdown';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Aufgabenmail } from '../src/aufgabenmail';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const kontoRepo = speicherKontoRepo();
  const konten = new Konten(kontoRepo, null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' }, anna.id);
  const { benutzer: cora } = await konten.legeBenutzerAn({ email: 'cora@example.org', name: 'Cora', rolle: 'mitglied' }, anna.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = await d.legeTypAn({ name: 'Vorgang', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
  ] });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  return { d, konten, kontoRepo: kontoRepo as KontoRepo, anna, ben, cora, t, ich, A: { id: anna.id, rolle: 'admin' }, B: { id: ben.id, rolle: 'mitglied' }, C: { id: cora.id, rolle: 'mitglied' } };
}

describe('Abwesenheit mit Vertreter (#78)', () => {
  it('leitet neue Aufgaben aller Arten an den Vertreter und dokumentiert alles an der Benutzer-Mappe', async () => {
    const { d, konten, ben, cora, t, A, B, C } = await aufbau();
    await assert.rejects(konten.setzeAbwesenheit(ben, ben.id, { an: true }), status(422), 'Vertreter ist Pflicht');
    await assert.rejects(konten.setzeAbwesenheit(ben, ben.id, { an: true, vertreterId: ben.id }), status(422), 'nicht man selbst');
    await assert.rejects(konten.setzeAbwesenheit(ben, cora.id, { an: true, vertreterId: ben.id }), status(403), 'andere nur als Admin');
    const bis = verschiebe(heuteIn(), 14, 'tage');
    await konten.setzeAbwesenheit(ben, ben.id, { an: true, bis, vertreterId: cora.id });

    // Benutzer-Mappe: Systemfelder, Protokoll, Aufgabe „Vertretung“ für Cora
    const bm = await d.holeMappe(ben.id);
    assert.equal(bm.mappe.werte.abwesend, true);
    assert.equal(bm.mappe.werte.abwesend_bis, bis);
    assert.equal(bm.mappe.werte.vertreter, cora.id);
    assert.ok((await d.historie(ben.id)).some((h) => h.art === 'abwesenheit' && /eingetragen.*Vertreter Cora/.test(String(h.daten.text))));
    const [vt] = (await d.meineAufgaben(C)).filter((a) => a.art === 'vertretung');
    assert.match(vt.text, /für Ben als Vertreter hinterlegt – ab sofort bis/);
    assert.equal(vt.mappeId, ben.id);

    // Von Hand, Erwähnung, „passt nicht“: alles landet bei Cora
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, B.id);
    const a = await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Prüfen' }, A.id);
    assert.equal(a.empfaengerId, cora.id);
    assert.ok((await d.historie(m.id)).some((h) => /weitergegeben wegen Abwesenheit von Ben an Cora/.test(String(h.daten.text))));
    await d.aendereMappe(m.id, { werte: { nr: '1', text: `Bitte ${erwaehnung('Ben', ben.id)} ansehen` } }, A.id);
    await d.aendereTyp(t.id, { ...t, felder: [...t.felder, { key: 'pflicht', label: 'Pflicht', typ: 'text', pflicht: true }], register: undefined });
    const beiCora = await d.meineAufgaben(C);
    assert.deepEqual(beiCora.map((x) => x.art).sort(), ['erwaehnung', 'manuell', 'passung', 'vertretung']);
    assert.match(beiCora.find((x) => x.art === 'erwaehnung')!.text, /Erwähnt von Anna/, 'Text der Erwähnung bleibt');
    assert.equal((await d.meineAufgaben(B)).length, 0);
  });

  it('folgt Ketten höchstens drei Schritte, hält bei Kreisen und wirkt nur im Zeitraum', async () => {
    const { d, konten, anna, ben, cora, t, A, ich } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '2' } }, A.id);
    await konten.setzeAbwesenheit(ben, ben.id, { an: true, vertreterId: cora.id });
    await konten.setzeAbwesenheit(cora, cora.id, { an: true, vertreterId: anna.id });
    assert.equal((await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Kette' }, A.id)).empfaengerId, anna.id);
    await konten.setzeAbwesenheit(await ich(anna.id), anna.id, { an: true, vertreterId: ben.id });
    assert.equal((await d.empfaengerAufloesen(ben.id)).ziel, anna.id, 'Kreis: beim letzten erreichbaren');
    // Zukünftiger Zeitraum wirkt noch nicht
    await konten.setzeAbwesenheit(await ich(anna.id), anna.id, { an: false, vertreterId: null });
    await konten.setzeAbwesenheit(cora, cora.id, { an: false });
    await konten.setzeAbwesenheit(ben, ben.id, { an: true, von: verschiebe(heuteIn(), 3, 'tage'), vertreterId: cora.id });
    assert.equal((await d.empfaengerAufloesen(ben.id)).ziel, ben.id);
    assert.equal((await d.holeMappe(ben.id)).mappe.werte.abwesend, false);
  });

  it('erledigt Vertretungs-Aufgaben bei Wechsel und Ende, beendet Abgelaufenes und schickt Abwesenden keine Mail', async () => {
    const { d, konten, kontoRepo, anna, ben, cora, A, B, C } = await aufbau();
    await konten.setzeAbwesenheit(ben, ben.id, { an: true, vertreterId: cora.id });
    await konten.setzeAbwesenheit(ben, ben.id, { an: true, vertreterId: anna.id });
    assert.equal((await d.meineAufgaben(C)).filter((a) => a.art === 'vertretung').length, 0, 'alte erledigt');
    assert.equal((await d.meineAufgaben(A)).filter((a) => a.art === 'vertretung').length, 1);

    // Tägliche Zusammenfassung: Ben ist abwesend, bekommt keine
    const t = await d.legeTypAn({ name: 'Notiz', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: 'x' } }, A.id);
    await d.legeAufgabeAn(m.id, { empfaengerId: cora.id, text: 'Für Cora' }, A.id);
    const an: string[] = [];
    const mail = new Aufgabenmail({
      benutzer: () => konten.listeBenutzer(), einstellungenVon: (b) => konten.einstellungen(b),
      aufgabenVon: (b) => d.meineAufgaben(b), typName: async () => 'Notiz',
    }, () => ({ async sende(x) { an.push(x); } }), () => 'http://nas', speicherEinstellungen());
    await mail.sende();
    assert.ok(!an.includes('ben@example.org'));

    // Abgelaufen: die stündliche Prüfung beendet die Abwesenheit
    await kontoRepo.setzeAbwesenheit(ben.id, { an: true, von: null, bis: verschiebe(heuteIn(), -1, 'tage'), vertreterId: anna.id });
    await konten.abwesenheitenPruefen();
    const b = (await konten.listeBenutzer()).find((x) => x.id === ben.id)!;
    assert.equal(b.abwesenheit?.an, false);
    assert.equal(b.abwesenheit?.vertreterId, anna.id, 'Vertreter bleibt hinterlegt');
    assert.equal((await d.meineAufgaben(A)).filter((a) => a.art === 'vertretung').length, 0, 'erledigt mit dem Ende');
    assert.ok((await d.historie(ben.id)).some((h) => h.art === 'abwesenheit' && /beendet.*abgelaufen/.test(String(h.daten.text))));
    assert.equal((await d.meineAufgaben(B)).length, 0);
  });
});

describe('Deaktivieren nur mit Vertreter und ohne offene Aufgaben (#77)', () => {
  it('verlangt Vertreter und keine Aufgaben; danach wirkt der Vertreter dauerhaft', async () => {
    const { d, konten, anna, ben, cora, t, A, C, ich } = await aufbau();
    const admin = await ich(anna.id);
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '3' } }, A.id);
    await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Offen' }, A.id);
    await assert.rejects(konten.aendereBenutzer(admin, ben.id, { aktiv: false }), /Vertreter/);
    await konten.setzeAbwesenheit(admin, ben.id, { an: false, vertreterId: cora.id });
    await assert.rejects(konten.aendereBenutzer(admin, ben.id, { aktiv: false }), /offene Aufgabe/);
    assert.deepEqual(await konten.aufgabenAnVertreter(admin, ben.id), { uebergeben: 1 });
    const b = await konten.aendereBenutzer(admin, ben.id, { aktiv: false });
    assert.ok(b.deaktiviert, 'Datum der Deaktivierung');
    assert.equal((await d.holeMappe(ben.id)).mappe.werte.vertreter, cora.id);
    // Erwähnung des Deaktivierten geht an den Vertreter
    await d.aendereMappe(m.id, { werte: { nr: '3', text: `Frage an ${erwaehnung('Ben', ben.id)}` } }, A.id);
    assert.equal((await d.meineAufgaben(C)).filter((a) => a.art === 'erwaehnung').length, 1);
    const wieder = await konten.aendereBenutzer(admin, ben.id, { aktiv: true });
    assert.equal(wieder.deaktiviert, null);
  });

  it('ergänzt die Systemfelder und benennt gleichnamige eigene Felder um', async () => {
    const { d, ben } = await aufbau();
    const typ = (await d.listeTypen()).find((t) => t.system === 'benutzer')!;
    assert.deepEqual(typ.felder.filter((f) => f.system).map((f) => f.key).slice(-4), ['abwesend', 'abwesend_von', 'abwesend_bis', 'vertreter']);
    // Stand vor dem Update: ohne die neuen Systemfelder, aber mit einem eigenen Feld „vertreter“ (Text).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intern = d as any;
    const neu = ['abwesend', 'abwesend_von', 'abwesend_bis', 'vertreter'];
    await intern.repo.aendereTyp(typ.id, { ...typ, felder: [...typ.felder.filter((f) => !neu.includes(f.key)), { key: 'vertreter', label: 'Mein Vertreter', typ: 'text' }],
      register: typ.register.map((r) => (r.felder ? { ...r, felder: r.felder.filter((k) => !neu.includes(k) || k === 'vertreter') } : r)) });
    const m = await intern.repo.holeMappe(ben.id);
    await intern.repo.aendereMappe(ben.id, { name: m.werte.name, email: m.werte.email, rollen: m.werte.rollen, aktiv: true, vertreter: 'Onkel Willi' }, [], null);
    intern.sichern = undefined;
    const { benutzer } = await d.sichereSystem();
    assert.equal(benutzer.felder.find((f) => f.key === 'vertreter_alt')?.label, 'Mein Vertreter');
    assert.equal(benutzer.felder.find((f) => f.key === 'vertreter')?.typ, 'referenz');
    assert.equal((await d.holeMappe(ben.id)).mappe.werte.vertreter_alt, 'Onkel Willi', 'Werte gehen nicht verloren');
  });
});
