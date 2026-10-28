/**
 * Papierkorb (#43): Gelöschte Mappen lassen sich wiederherstellen; nach der Aufbewahrung
 * werden sie endgültig gelöscht. 0 Tage = kein Papierkorb.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const admin = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };
const anna = { id: '00000000-0000-4000-8000-0000000000bb', rolle: 'mitglied' };
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau() {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const partner = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true, eindeutig: true }] });
  const vertrag = await d.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'nummer', label: 'Nummer', typ: 'text', pflicht: true, eindeutig: true },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTyp: partner.id },
  ] });
  return { d, dateien, partner, vertrag };
}

describe('Papierkorb (#43)', () => {
  it('legt Gelöschtes in den Papierkorb, zeigt es nur dem, der es gelöscht hat, und stellt es wieder her', async () => {
    const { d, partner, vertrag } = await aufbau();
    assert.equal(await d.papierkorbTage(), 30, 'Standard: 30 Tage');
    const p = await d.legeMappeAn({ typId: partner.id, werte: { name: 'Stadtwerke' } }, anna.id);
    const v = await d.legeMappeAn({ typId: vertrag.id, werte: { nummer: 'V-1', partner: p.id } }, anna.id);
    await assert.rejects(d.loescheMappe(p.id, anna.id), status(409), 'Verweise verhindern das Löschen wie bisher');
    await d.ladeHoch(v.id, { register: 'dokumente', name: 'v.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 x'), anna.id);
    await d.loescheMappe(v.id, anna.id);

    await assert.rejects(d.holeMappe(v.id), status(404), 'woanders nicht mehr sichtbar');
    assert.equal((await d.seite(anna, { sicht: `typ:${vertrag.id}` })).gesamt, 0);
    assert.equal((await d.zaehler(anna)).papierkorb, 1);
    assert.equal((await d.zaehler(admin)).papierkorb, 0, 'je Benutzer');
    assert.deepEqual((await d.papierkorb(anna)).map((e) => [e.titel, e.dokumente]), [['V-1', 1]]);
    assert.equal((await d.papierkorb(admin)).length, 0, 'in der Ablage nur Eigenes');
    assert.equal((await d.papierkorb(admin, true)).length, 1, 'in der Werkbank alles');
    await assert.rejects(d.stelleWiederHer(v.id, admin), status(404), 'Fremdes nur über die Werkbank');

    // Eindeutige Werte werden frei, solange die Mappe im Papierkorb liegt.
    const neu = await d.legeMappeAn({ typId: vertrag.id, werte: { nummer: 'V-1' } }, admin.id);
    await assert.rejects(d.loescheTyp(vertrag.id), status(409), 'Typ mit Mappen im Papierkorb bleibt');

    const w = await d.stelleWiederHer(v.id, anna);
    assert.equal(w.mappe.passt, false, 'Nummer inzwischen vergeben → Eingang');
    assert.match(w.mappe.problem ?? '', /Bereits vergeben/);
    assert.equal((await d.holeMappe(neu.id)).mappe.passt, true, 'die andere Mappe bleibt in Ordnung');
    const details = await d.holeMappe(v.id);
    assert.equal(details.dokumente.length, 1, 'Dokumente kommen mit');
    assert.deepEqual((await d.holeMappe(p.id)).rueckverweise.map((x) => x.quelleId), [v.id], 'Verweise kommen mit');
    assert.equal((await d.zaehler(anna)).eingang, 1);
  });

  it('löscht endgültig: einzeln, beim Leeren und nach Ablauf – Dateien erst, wenn nichts mehr daran hängt', async () => {
    const { d, dateien, partner } = await aufbau();
    const a = await d.legeMappeAn({ typId: partner.id, werte: { name: 'A' } }, anna.id);
    const b = await d.legeMappeAn({ typId: partner.id, werte: { name: 'B' } }, anna.id);
    const c = await d.legeMappeAn({ typId: partner.id, werte: { name: 'C' } }, admin.id);
    const { dokument } = await d.ladeHoch(a.id, { register: 'dokumente', name: 'a.pdf', typ: 'application/pdf' }, Buffer.from('%PDF-1.4 a'), anna.id);
    for (const [m, wer] of [[a, anna], [b, anna], [c, admin]] as const) await d.loescheMappe(m.id, wer.id);
    assert.ok(await dateien.lies(dokument.sha256).then(() => true, () => false), 'Datei bleibt im Papierkorb');

    await assert.rejects(d.loescheEndgueltig([c.id], anna), status(404));
    assert.equal(await d.loescheEndgueltig([b.id], anna), 1);
    assert.equal(await d.leerePapierkorb(anna), 1, 'eigener Papierkorb: nur noch A');
    assert.ok(!(await dateien.lies(dokument.sha256).then(() => true, () => false)), 'Datei mit dem Leeren weg');
    assert.equal((await d.papierkorb(admin, true)).map((e) => e.titel).join(), 'C');

    assert.equal(await d.raeumePapierkorbAuf(Date.now() + 29 * 86_400_000), 0, 'nach 29 Tagen noch da');
    assert.equal(await d.raeumePapierkorbAuf(Date.now() + 31 * 86_400_000), 1, 'nach 31 Tagen weg');
  });

  it('0 Tage schaltet den Papierkorb aus und leert ihn', async () => {
    const { d, partner } = await aufbau();
    const a = await d.legeMappeAn({ typId: partner.id, werte: { name: 'A' } }, anna.id);
    await d.loescheMappe(a.id, anna.id);
    await assert.rejects(d.setzePapierkorbTage(-1), status(422));
    assert.deepEqual(await d.setzePapierkorbTage(0), { tage: 0, geleert: 1 });
    const b = await d.legeMappeAn({ typId: partner.id, werte: { name: 'B' } }, anna.id);
    await d.loescheMappe(b.id, anna.id);
    assert.equal((await d.papierkorb(anna)).length, 0, 'sofort endgültig');
    assert.equal((await d.zaehler(anna)).papierkorbTage, 0);
  });

  it('Benutzer: Einladung wird deaktiviert und erst beim Leeren gelöscht; Wiederherstellen aktiviert sie wieder', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'x', d.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: ich } = await konten.einrichten({ email: 'admin@example.org', passwort: 'ein-langes-passwort' });
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const { benutzer: neu } = await konten.legeBenutzerAn({ email: 'neu@example.org' });
    await konten.loescheBenutzer(ich, neu.id);
    assert.equal((await konten.listeBenutzer()).find((b) => b.id === neu.id)?.aktiv, false, 'deaktiviert, bis der Papierkorb geleert ist');
    const [e] = await d.papierkorb({ id: ich.id, rolle: 'admin' });
    assert.equal(e.id, neu.id);
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    await assert.rejects(d.holeMappe(neu.id), status(404), 'der Abgleich beim Start holt die Mappe nicht zurück');

    await d.stelleWiederHer(neu.id, { id: ich.id, rolle: 'admin' });
    assert.equal((await konten.listeBenutzer()).find((b) => b.id === neu.id)?.aktiv, true);
    assert.equal((await d.holeMappe(neu.id)).mappe.werte.aktiv, true);

    await konten.loescheBenutzer(ich, neu.id);
    await d.leerePapierkorb({ id: ich.id, rolle: 'admin' });
    assert.ok(!(await konten.listeBenutzer()).some((b) => b.id === neu.id), 'mit dem Leeren gelöscht');
  });
});
