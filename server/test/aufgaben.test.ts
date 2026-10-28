/** Aufgaben (#54) und Erwähnungen (#56). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erwaehnung } from '../../shared/src/markdown';
import { Aufgabenmail } from '../src/aufgabenmail';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = await d.legeTypAn({ name: 'Vorgang', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true, eindeutig: true },
    { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
  ] });
  return { d, konten, anna, ben, t, A: { id: anna.id, rolle: 'admin' }, B: { id: ben.id, rolle: 'mitglied' } };
}

describe('Aufgaben (#54, #56)', () => {
  it('„passt nicht“ wird eine Aufgabe des Erstellers, die sich selbst erledigt', async () => {
    const { d, t, B } = await aufbau();
    const a = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, B.id);
    await d.aendereTyp(t.id, { ...t, felder: [...t.felder, { key: 'pflicht', label: 'Pflicht', typ: 'text', pflicht: true }], register: undefined });
    assert.equal((await d.zaehler(B)).eingang, 1);
    const [auf] = await d.meineAufgaben(B);
    assert.equal(auf.art, 'passung');
    assert.match(auf.text, /Pflicht/);
    const e = await d.seite(B, { sicht: 'eingang' });
    assert.match((e as { aufgaben?: Record<string, string> }).aufgaben![a.id], /Passt nicht/);
    await assert.rejects(d.erledigeAufgabe(auf.id, B), status(409));
    await d.aendereMappe(a.id, { werte: { nr: '1', pflicht: 'ja' } }, B.id);
    assert.equal((await d.zaehler(B)).eingang, 0);
  });

  it('vergibt Aufgaben von Hand; der Empfänger erledigt oder gibt weiter (mit Historie)', async () => {
    const { d, t, A, B, ben } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '7' } }, A.id);
    await assert.rejects(d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: '' }, A.id), status(422));
    await assert.rejects(d.legeAufgabeAn(m.id, { empfaengerId: m.id, text: 'x' }, A.id), status(422), 'nur Benutzer');
    const a = await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Bitte Rechnung prüfen' }, A.id);
    assert.equal((await d.zaehler(B)).eingang, 1);
    assert.equal((await d.zaehler(A)).eingang, 0);
    const fremd = { id: '00000000-0000-4000-8000-0000000000cc', rolle: 'mitglied' };
    await assert.rejects(d.erledigeAufgabe(a.id, fremd), status(403));
    await d.delegiereAufgabe(a.id, A.id, B);
    assert.equal((await d.zaehler(A)).eingang, 1, 'weitergegeben an Anna');
    await d.erledigeAufgabe(a.id, A);
    assert.equal((await d.zaehler(A)).eingang, 0);
    const h = (await d.historie(m.id)).filter((x) => x.art === 'aufgabe').map((x) => x.daten.text);
    assert.deepEqual(h, ['erledigt: Bitte Rechnung prüfen', 'weitergegeben von Ben an Anna: Bitte Rechnung prüfen', 'für Ben: Bitte Rechnung prüfen']);
  });

  it('macht aus @-Erwähnungen genau eine Aufgabe; entfernte Erwähnungen stehen in der Historie', async () => {
    const { d, t, A, B, ben } = await aufbau();
    const text = `Bitte ansehen, ${erwaehnung('Ben', ben.id)}`;
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '9', text } }, A.id);
    let meine = await d.meineAufgaben(B);
    assert.deepEqual(meine.map((x) => [x.art, x.text]), [['erwaehnung', 'Erwähnt von Anna in „Beschreibung“']]);
    await d.aendereMappe(m.id, { werte: { nr: '9', text: `${text} – noch einmal` } }, A.id);
    assert.equal((await d.meineAufgaben(B)).length, 1, 'keine zweite Aufgabe');
    await d.aendereMappe(m.id, { werte: { nr: '9', text: 'ohne Erwähnung' } }, A.id);
    meine = await d.meineAufgaben(B);
    assert.equal(meine.length, 1, 'bleibt offen');
    assert.ok((await d.historie(m.id)).some((x) => x.daten.text === 'Erwähnung von Ben in „Beschreibung“ entfernt'));
    await d.erledigeAufgabe(meine[0].id, B);
    assert.equal((await d.meineAufgaben(B)).length, 0);
  });

  it('Erwähnungen in Notizen werden Aufgaben (#81)', async () => {
    const { d, t, A, B, ben, anna } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '11' } }, A.id);
    const n = await d.legeNotizAn(m.id, `Bitte Rückruf, ${erwaehnung('Ben', ben.id)}`, A.id);
    let meine = await d.meineAufgaben(B);
    assert.deepEqual(meine.map((x) => [x.art, x.text]), [['erwaehnung', 'Erwähnt von Anna in einer Notiz: Bitte Rückruf, @Ben']]);
    await d.aendereNotiz(n.id, `Bitte Rückruf heute, ${erwaehnung('Ben', ben.id)}`, A.id);
    assert.equal((await d.meineAufgaben(B)).length, 1, 'keine zweite Aufgabe');
    await d.legeNotizAn(m.id, `Ich selbst: ${erwaehnung('Anna', anna.id)}`, A.id);
    assert.equal((await d.meineAufgaben(A)).length, 0, 'keine Aufgabe für sich selbst');
    await d.aendereNotiz(n.id, 'ohne Erwähnung', A.id);
    meine = await d.meineAufgaben(B);
    assert.equal(meine.length, 1, 'bleibt offen');
    assert.ok((await d.historie(m.id)).some((x) => x.daten.text === 'Erwähnung von Ben in einer Notiz entfernt'));
  });

  it('schickt einmal am Tag eine Zusammenfassung an alle mit offenen Aufgaben', async () => {
    const { d, konten, t, A, ben } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '11' } }, A.id);
    await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Kündigen' }, A.id);
    const mails: Array<{ an: string; betreff: string; text: string }> = [];
    const mail = new Aufgabenmail({
      benutzer: () => konten.listeBenutzer(), einstellungenVon: (b) => konten.einstellungen(b),
      aufgabenVon: (b) => d.meineAufgaben(b), typName: async () => 'Vorgang',
    }, () => ({ async sende(an, betreff, text) { mails.push({ an, betreff, text }); } }), () => 'http://nas:8080', speicherEinstellungen());
    await mail.speichere({ uhrzeit: '07:00' });
    assert.equal(await mail.pruefe(new Date('2026-10-29T05:30:00Z')), 0, '06:30 in Berlin: noch nicht');
    assert.equal(await mail.pruefe(new Date('2026-10-29T06:30:00Z')), 1);
    assert.equal(await mail.pruefe(new Date('2026-10-29T09:00:00Z')), 0, 'nur einmal am Tag');
    assert.equal(mails[0].an, 'ben@example.org');
    assert.match(mails[0].text, /11 \(Vorgang\): Kündigen\n  http:\/\/nas:8080\/ablage\/eingang\//);
    await konten.setzeEinstellung((await konten.listeBenutzer()).find((b) => b.id === ben.id)!, 'aufgaben_mail', false);
    assert.equal(await mail.sende(), 0, 'abbestellt');
    await assert.rejects(mail.speichere({ uhrzeit: '25:00' }), status(422));
  });
});
