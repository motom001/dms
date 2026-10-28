/**
 * Systemmappentypen Benutzer (#26) und Rolle (#27) sowie die Eigenschaften
 * „Neue Mappen erlauben“ / „Löschen erlauben“ je Mappentyp – im Arbeitsspeicher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { systemrolleKennung, type Mappentyp } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { erzeugeDemo } from '../src/demo';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

async function wirft(p: Promise<unknown>, status: number, text?: RegExp) {
  await assert.rejects(p, (e: unknown) => e instanceof Fachfehler && e.status === status && (!text || text.test(e.message)));
}
const linkSchluessel = (link: string) => link.split('/passwort/')[1];

/** DMS wie im Betrieb: Konten spiegeln Benutzer in Mappen. */
async function aufbau() {
  const dienst = new Dienst(speicherRepo(), speicherDateien());
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas:3000', dienst.benutzerspiegel());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Anna Admin', passwort: 'ein-langes-passwort' });
  const typen = await dienst.listeTypen();
  const benutzerTyp = typen.find((t) => t.system === 'benutzer')!;
  const rolleTyp = typen.find((t) => t.system === 'rolle')!;
  const sys = { admin: (await dienst.listeRollen()).find((r) => r.name === 'Administrator')!.id, mitglied: (await dienst.listeRollen()).find((r) => r.name === 'Mitglied')!.id };
  return { dienst, konten, admin, benutzerTyp, rolleTyp, sys };
}
const ohneTyp = ({ id: _i, erstellt: _e, geaendert: _g, system: _s, ...rest }: Mappentyp) => rest;

describe('Neue Mappen und Löschen je Mappentyp (#26)', () => {
  it('erlaubt standardmäßig beides und sperrt es, wenn abgeschaltet', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const t = await d.legeTypAn({ name: 'Notiz', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }] });
    assert.equal(t.erstellenErlaubt, true);
    assert.equal(t.loeschenErlaubt, true);
    const m = await d.legeMappeAn({ typId: t.id, werte: { titel: 'a' } });
    const gesperrt = await d.aendereTyp(t.id, { ...ohneTyp(t), erstellenErlaubt: false, loeschenErlaubt: false });
    assert.equal(gesperrt.erstellenErlaubt, false);
    await wirft(d.legeMappeAn({ typId: t.id, werte: { titel: 'b' } }), 403);
    await wirft(d.loescheMappe(m.id), 403);
    await d.aendereMappe(m.id, { werte: { titel: 'geändert' } }); // Bearbeiten bleibt erlaubt
    await d.aendereTyp(t.id, { ...ohneTyp(gesperrt), loeschenErlaubt: true });
    await d.loescheMappe(m.id);
  });
});

describe('Mappentyp Benutzer (#26)', () => {
  it('gibt jedem Benutzer eine Mappe, die dem Konto folgt', async () => {
    const { dienst, konten, admin, benutzerTyp, sys } = await aufbau();
    assert.equal(benutzerTyp.name, 'Benutzer');
    const m = (await dienst.holeMappe(admin.id)).mappe;
    assert.equal(m.typId, benutzerTyp.id);
    assert.deepEqual(m.werte, { name: 'Anna Admin', email: 'admin@example.org', rollen: [sys.admin], aktiv: true });
    assert.equal(m.titel, 'Anna Admin');

    const r = await konten.legeBenutzerAn({ email: 'bernd@example.org', rolle: 'mitglied' }, admin.id);
    const b = (await dienst.holeMappe(r.benutzer.id)).mappe;
    assert.equal(b.werte.name, 'bernd@example.org', 'ohne Namen steht die E-Mail-Adresse im Namen');
    assert.deepEqual(b.werte.rollen, [sys.mitglied]);
    assert.equal(b.erstelltVon, admin.id);

    await konten.aendereProfil(admin, { name: 'Anna A.' });
    await konten.aendereEmail(admin, { email: 'anna@example.org', passwort: 'ein-langes-passwort' });
    const neu = (await dienst.holeMappe(admin.id)).mappe;
    assert.equal(neu.werte.name, 'Anna A.');
    assert.equal(neu.werte.email, 'anna@example.org');
  });

  it('holt Mappen für bestehende Benutzer nach (Update auf diese Version)', async () => {
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas:3000'); // noch ohne Spiegel
    const { benutzer } = await konten.einrichten({ email: 'alt@example.org', passwort: 'ein-langes-passwort' });
    assert.equal((await dienst.listeTypen()).length, 0);
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer()); // zweiter Lauf ändert nichts
    assert.equal((await dienst.listeTypen()).filter((t) => t.system).length, 2);
    assert.equal((await dienst.holeMappe(benutzer.id)).mappe.werte.email, 'alt@example.org');
    assert.equal((await dienst.listeRollen()).length, 2);
  });

  it('lässt sich erweitern, aber nicht löschen; Systemfelder bleiben fest', async () => {
    const { dienst, benutzerTyp, rolleTyp } = await aufbau();
    await wirft(dienst.loescheTyp(benutzerTyp.id), 409, /Systemmappentyp/);
    // Feld ergänzen und Systemfeld umbenennen: ja. Datentyp ändern oder Erstellen erlauben: nein.
    const felder = benutzerTyp.felder.map((f) => (f.key === 'email' ? { ...f, label: 'Mail', typ: 'zahl', eindeutig: false } : f));
    const t = await dienst.aendereTyp(benutzerTyp.id, {
      ...ohneTyp(benutzerTyp), erstellenErlaubt: true, loeschenErlaubt: true,
      felder: [...felder, { key: 'telefon', label: 'Telefon', typ: 'text' }],
    });
    const email = t.felder.find((f) => f.key === 'email')!;
    assert.equal(email.label, 'Mail');
    assert.equal(email.typ, 'text');
    assert.equal(email.eindeutig, true);
    assert.equal(email.system, true);
    assert.equal(t.felder.find((f) => f.key === 'telefon')!.system, undefined);
    assert.equal(t.felder.find((f) => f.key === 'rollen')!.zielTyp, rolleTyp.id);
    assert.equal(t.erstellenErlaubt, false);
    assert.equal(t.loeschenErlaubt, false);
    await wirft(dienst.aendereTyp(benutzerTyp.id, { ...ohneTyp(t), felder: t.felder.filter((f) => f.key !== 'aktiv') }), 422, /Aktiv/);
  });

  it('Mappen entstehen und verschwinden nicht in der Ablage', async () => {
    const { dienst, admin, benutzerTyp } = await aufbau();
    await wirft(dienst.legeMappeAn({ typId: benutzerTyp.id, werte: { name: 'X', email: 'x@example.org', aktiv: true } }), 403);
    await wirft(dienst.loescheMappe(admin.id), 403);
  });

  it('Sicherheit: Systemfelder sind in der Ablage nur lesbar, eigene Felder nicht', async () => {
    const { dienst, konten, admin, benutzerTyp, sys } = await aufbau();
    const r = await konten.legeBenutzerAn({ email: 'mitglied@example.org', name: 'Mia', rolle: 'mitglied' }, admin.id);
    const { benutzer: mia } = await konten.passwortSetzen({ schluessel: linkSchluessel(r.link!), passwort: 'passwort-von-mia' });
    const m = (await dienst.holeMappe(admin.id)).mappe;
    // Mia versucht, die E-Mail-Adresse der Administratorin zu übernehmen (danach „Passwort vergessen“).
    await wirft(dienst.aendereMappe(admin.id, { werte: { ...m.werte, email: 'mia@boese.example' } }, mia.id), 403, /Benutzerverwaltung/);
    await wirft(dienst.aendereMappe(r.benutzer.id, { werte: { rollen: [sys.admin] } }, mia.id), 403);
    await wirft(dienst.aendereMappe(admin.id, { werte: { aktiv: false } }, mia.id), 403);
    await wirft(dienst.aendereMappe(admin.id, { werte: { name: 'Hacker' } }, mia.id), 403);
    assert.equal((await dienst.holeMappe(admin.id)).mappe.werte.email, 'admin@example.org');
    // Eigene Felder des Administrators sind normal bearbeitbar.
    await dienst.aendereTyp(benutzerTyp.id, { ...ohneTyp(benutzerTyp), felder: [...benutzerTyp.felder, { key: 'telefon', label: 'Telefon', typ: 'text' }] });
    const neu = await dienst.aendereMappe(admin.id, { werte: { ...m.werte, telefon: '0351 123' } }, mia.id);
    assert.equal(neu.werte.telefon, '0351 123');
  });

  it('deaktiviert statt zu löschen; Verweise bleiben, der Titel sagt „ehemalig“', async () => {
    const { dienst, konten, admin, benutzerTyp } = await aufbau();
    const vertrag = await dienst.legeTypAn({ name: 'Vertrag', felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
      { key: 'verantwortlich', label: 'Verantwortlicher Benutzer', typ: 'referenz', zielTyp: benutzerTyp.id },
    ] });
    const r = await konten.legeBenutzerAn({ email: 'paul@example.org', name: 'Paul', rolle: 'mitglied' }, admin.id);
    const v = await dienst.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Strom', verantwortlich: r.benutzer.id } }, admin.id);
    assert.deepEqual((await dienst.holeMappe(r.benutzer.id)).rueckverweise.map((x) => x.quelleId), [v.id]);

    // Eine nie angenommene Einladung ließe sich löschen – aber nicht, solange auf sie verwiesen wird.
    await wirft(konten.loescheBenutzer(admin, r.benutzer.id), 409, /Deaktiviere/);
    await konten.passwortSetzen({ schluessel: linkSchluessel(r.link!), passwort: 'passwort-von-paul' });
    await konten.aendereBenutzer(admin, r.benutzer.id, { aktiv: false });
    const paul = (await dienst.holeMappe(r.benutzer.id)).mappe;
    assert.equal(paul.werte.aktiv, false);
    assert.equal(paul.titel, 'Paul (ehemalig)');
    assert.equal((await dienst.holeMappe(v.id)).bezuege[r.benutzer.id].titel, 'Paul (ehemalig)');
    await wirft(konten.loescheBenutzer(admin, r.benutzer.id), 409, /deaktiviert statt gelöscht/);
    await konten.aendereBenutzer(admin, r.benutzer.id, { aktiv: true });
    assert.equal((await dienst.holeMappe(r.benutzer.id)).mappe.titel, 'Paul');
  });

  it('löscht eine nie angenommene Einladung samt Mappe', async () => {
    const { dienst, konten, admin } = await aufbau();
    const r = await konten.legeBenutzerAn({ email: 'vertippt@exmaple.org', rolle: 'mitglied' }, admin.id);
    await konten.loescheBenutzer(admin, r.benutzer.id);
    await wirft(dienst.holeMappe(r.benutzer.id), 404);
  });

  it('Demo-Daten lassen Benutzer und Rollen in Ruhe', async () => {
    const { dienst, benutzerTyp } = await aufbau();
    await dienst.legeTypAn({ name: 'Aufgabe', felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true },
      { key: 'wer', label: 'Wer', typ: 'referenz', zielTyp: benutzerTyp.id, pflicht: true },
    ] });
    const vorher = (await dienst.listeMappen()).length;
    const r = await erzeugeDemo(dienst, 20, null);
    assert.ok(!('Benutzer' in r.erzeugt) && !('Rolle' in r.erzeugt));
    assert.equal((await dienst.listeMappen()).length, vorher + r.gesamt);
    assert.ok(!(await dienst.demoUebersicht()).some((u) => u.name === 'Benutzer' || u.name === 'Rolle'));
    await dienst.entferneDemo();
    assert.equal((await dienst.listeMappen()).length, vorher);
  });

  it('Beispiele lassen sich laden, obwohl es die Systemtypen gibt', async () => {
    const { dienst } = await aufbau();
    const { ladeBeispiele } = await import('../src/beispiele');
    await ladeBeispiele(dienst);
    await wirft(ladeBeispiele(dienst), 409);
  });
});

describe('Mappentyp Rolle (#27)', () => {
  it('hat die Systemrollen Administrator und Mitglied, geschützt', async () => {
    const { dienst, rolleTyp, sys } = await aufbau();
    await wirft(dienst.loescheTyp(rolleTyp.id), 409);
    const admin = (await dienst.holeMappe(sys.admin)).mappe;
    assert.equal(admin.systemKennung, systemrolleKennung('admin'));
    await wirft(dienst.loescheMappe(sys.admin), 409, /Systemrollen/);
    await wirft(dienst.aendereMappe(sys.admin, { werte: { name: 'Chef' } }), 403, /Systemrolle/);
    // Eigene Felder an Systemrollen sind erlaubt.
    await dienst.aendereTyp(rolleTyp.id, { ...ohneTyp(rolleTyp), felder: [...rolleTyp.felder, { key: 'beschreibung', label: 'Beschreibung', typ: 'langtext' }] });
    assert.equal((await dienst.aendereMappe(sys.admin, { werte: { name: 'Administrator', beschreibung: 'Darf alles' } })).werte.beschreibung, 'Darf alles');
  });

  it('Rollen lassen sich anlegen, ändern und löschen; Namen sind eindeutig', async () => {
    const { dienst, rolleTyp } = await aufbau();
    const steuer = await dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Steuern' } });
    await wirft(dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'steuern' } }), 422);
    await wirft(dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Administrator' } }), 422);
    assert.equal((await dienst.aendereMappe(steuer.id, { werte: { name: 'Steuer & Finanzen' } })).titel, 'Steuer & Finanzen');
    await dienst.loescheMappe(steuer.id);
    assert.equal((await dienst.listeRollen()).length, 2);
  });

  it('Zuordnung nur über die Benutzerverwaltung; Systemrolle folgt dem Konto', async () => {
    const { dienst, konten, admin, rolleTyp, sys } = await aufbau();
    const steuer = await dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Steuern' } });
    const garten = await dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Garten' } });
    const r = await konten.legeBenutzerAn({ email: 'b@example.org', name: 'Bea', rolle: 'mitglied' }, admin.id);
    await dienst.setzeRollen(r.benutzer.id, [steuer.id, garten.id], admin.id);
    assert.deepEqual((await dienst.holeMappe(r.benutzer.id)).mappe.werte.rollen, [sys.mitglied, steuer.id, garten.id]);
    assert.deepEqual((await dienst.weitereRollen()).get(r.benutzer.id), [steuer.id, garten.id]);
    // Systemrollen lassen sich so nicht vergeben – niemand macht sich selbst zum Administrator.
    await wirft(dienst.setzeRollen(r.benutzer.id, [sys.admin]), 422);
    await wirft(dienst.setzeRollen(r.benutzer.id, ['00000000-0000-4000-8000-00000000abcd']), 422);
    // Rolle im Konto ändern: Systemrolle wechselt, weitere Rollen bleiben.
    await konten.aendereBenutzer(admin, r.benutzer.id, { rolle: 'admin' });
    assert.deepEqual((await dienst.holeMappe(r.benutzer.id)).mappe.werte.rollen, [sys.admin, steuer.id, garten.id]);
    // Die Rolle zeigt ihre Benutzer (Verknüpfungsregister über rollen).
    const steuerDetails = await dienst.holeMappe(steuer.id);
    assert.deepEqual(steuerDetails.rueckverweise.map((x) => [x.titel, x.feldKey]), [['Bea', 'rollen']]);
    const adminRolle = await dienst.holeMappe(sys.admin);
    assert.deepEqual(adminRolle.rueckverweise.map((x) => x.titel).sort(), ['Anna Admin', 'Bea']);
    // Deaktiviert: bleibt in der Rolle sichtbar, als ehemalig.
    await konten.aendereBenutzer(admin, r.benutzer.id, { aktiv: false });
    assert.deepEqual((await dienst.holeMappe(steuer.id)).rueckverweise.map((x) => x.titel), ['Bea (ehemalig)']);
  });

  it('Rolle mit Benutzern löschen: Zuordnungen fallen weg; Verweise aus Feldern blockieren', async () => {
    const { dienst, konten, admin, rolleTyp, benutzerTyp, sys } = await aufbau();
    const steuer = await dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Steuern' } });
    const garten = await dienst.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Garten' } });
    await dienst.setzeRollen(admin.id, [steuer.id, garten.id], admin.id);
    const vertrag = await dienst.legeTypAn({ name: 'Vertrag', felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
      { key: 'verantwortlich', label: 'Verantwortlicher Benutzer', typ: 'referenz', zielTyp: benutzerTyp.id },
      { key: 'gruppe', label: 'Verantwortliche Rolle', typ: 'referenz', zielTyp: rolleTyp.id },
    ] });
    await dienst.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'Steuerberater', verantwortlich: admin.id, gruppe: steuer.id } });
    await wirft(dienst.loescheMappe(steuer.id), 409, /verweist noch/);
    await dienst.loescheMappe(garten.id, admin.id);
    assert.deepEqual((await dienst.holeMappe(admin.id)).mappe.werte.rollen, [sys.admin, steuer.id]);
    // Die Benutzer-Mappe bleibt dabei gültig.
    assert.notEqual((await dienst.holeMappe(admin.id)).mappe.passt, false);
    void konten;
  });

  it('erweiterte Pflichtfelder bringen Benutzer in den Eingang statt Anlegen zu verhindern', async () => {
    const { dienst, konten, admin, benutzerTyp } = await aufbau();
    await dienst.aendereTyp(benutzerTyp.id, { ...ohneTyp(benutzerTyp), felder: [...benutzerTyp.felder, { key: 'telefon', label: 'Telefon', typ: 'text', pflicht: true }] });
    const r = await konten.legeBenutzerAn({ email: 'neu@example.org', rolle: 'mitglied' }, admin.id);
    const m = (await dienst.holeMappe(r.benutzer.id)).mappe;
    assert.equal(m.passt, false);
    assert.match(m.problem ?? '', /Telefon/);
  });
});
