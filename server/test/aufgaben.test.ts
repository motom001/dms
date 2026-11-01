/** Aufgaben (#54) und Erwähnungen (#56). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { erwaehnung } from '../../shared/src/markdown';
import { ALLES } from '../../shared/src/rechte';
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

describe('Sammel-Weitergabe (#415, #419)', () => {
  it('gibt mehrere Aufgaben weiter, meldet was nicht geht, und bündelt die Benachrichtigung', async () => {
    const { d, konten, t, A, B, ben, anna } = await aufbau();
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: carl } = await konten.legeBenutzerAn({ email: 'carl@example.org', name: 'Carl', rolle: 'mitglied' });
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const C = { id: carl.id, rolle: 'mitglied' };
    // „Privat“ darf Carl nicht lesen – auch nicht über eine Aufgabe.
    await d.setzeBerechtigungen(t.id, { grund: ALLES, regeln: [
      { id: 'p', name: 'Privat', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'nr', op: 'gleich', wert: { art: 'fest', wert: 'privat' } } }], dann: { R: 'entziehen' }, stopp: true },
    ] }, true);
    const m = await Promise.all(['1', '2', '3', 'privat'].map((nr) => d.legeMappeAn({ typId: t.id, werte: { nr } }, A.id)));
    const auf = await Promise.all(m.map((x, i) => d.legeAufgabeAn(x.id, { empfaengerId: ben.id, text: `Aufgabe ${i + 1}` }, A.id)));
    const fuerAnna = await d.legeAufgabeAn(m[0].id, { empfaengerId: anna.id, text: 'Annas eigene' }, A.id);

    await assert.rejects(d.aufgabenWeitergeben([], carl.id, B), status(422));
    await assert.rejects(d.aufgabenWeitergeben([auf[0].id], m[0].id, B), status(422), 'Ziel muss ein Benutzer sein');
    // Ben (Mitglied) darf nur seine eigenen weitergeben.
    const r = await d.aufgabenWeitergeben([...auf.map((a) => a.id), fuerAnna.id], carl.id, B);
    assert.deepEqual(r.weitergegeben, [auf[0].id, auf[1].id, auf[2].id]);
    assert.deepEqual(r.nicht.map((x) => x.id), [auf[3].id, fuerAnna.id]);
    assert.match(r.nicht[0].grund, /Carl darf die Mappe nicht lesen/);
    assert.match(r.nicht[1].grund, /nicht deine Aufgabe/);
    assert.equal((await d.aufgabenVon(m[3].id)).find((a) => a.id === auf[3].id)?.empfaengerId, ben.id, 'nicht lesbar: bleibt bei Ben');
    // Historie je Mappe
    const h = (await d.historie(m[1].id)).filter((x) => x.art === 'aufgabe').map((x) => x.daten.text);
    assert.equal(h[0], 'weitergegeben von Ben an Carl: Aufgabe 2');
    // Eine Sammelbenachrichtigung statt dreier
    const hinweis = () => d.meineAufgaben(C).then((l) => l.filter((a) => a.art === 'manuell' && a.feldKey === 'weitergabe'));
    let n = await hinweis();
    assert.equal(n.length, 1);
    assert.equal(n[0].mappeId, ben.id, 'an der Benutzer-Mappe dessen, der weitergegeben hat');
    assert.match(n[0].text, /Ben hat dir 3 Aufgaben weitergegeben/);
    // Noch nicht gesehen: zählt hoch statt einer zweiten
    const neu = await d.legeAufgabeAn(m[2].id, { empfaengerId: ben.id, text: 'Nachzügler' }, A.id);
    await d.aufgabenWeitergeben([neu.id], carl.id, B);
    n = await hinweis();
    assert.equal(n.length, 1);
    assert.match(n[0].text, /4 Aufgaben/);
    // Erledigt: die nächste Weitergabe bringt eine neue
    await d.erledigeAufgabe(n[0].id, C);
    const noch = await d.legeAufgabeAn(m[2].id, { empfaengerId: ben.id, text: 'Noch eine' }, A.id);
    await d.aufgabenWeitergeben([noch.id], carl.id, B);
    n = await hinweis();
    assert.equal(n.length, 1);
    assert.match(n[0].text, /eine Aufgabe weitergegeben/);
    // Administrator darf alle; schon beim Ziel: mit Grund
    const r2 = await d.aufgabenWeitergeben([fuerAnna.id, noch.id], carl.id, A);
    assert.deepEqual(r2.weitergegeben, [fuerAnna.id]);
    assert.match(r2.nicht[0].grund, /liegt schon bei Carl/);
  });

  it('erledigt mehrere auf einmal; „passt nicht“ bleibt mit Grund', async () => {
    const { d, t, A, B, ben } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, B.id);
    const a1 = await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'eins' }, A.id);
    const a2 = await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'zwei' }, A.id);
    await d.aendereTyp(t.id, { ...t, felder: [...t.felder, { key: 'pflicht', label: 'Pflicht', typ: 'text', pflicht: true }], register: undefined });
    const passung = (await d.meineAufgaben(B)).find((a) => a.art === 'passung')!;
    const r = await d.aufgabenErledigen([a1.id, a2.id, passung.id], B);
    assert.deepEqual(r.erledigt, [a1.id, a2.id]);
    assert.deepEqual(r.nicht.map((x) => x.id), [passung.id]);
  });
});
