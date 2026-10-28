/** Tägliche Zusammenfassung je Benutzer: Uhrzeit, Wochentage (#92) und Feiertage (#94). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Aufgabenmail, pruefeZeit, wirksameZeit, MAIL_STANDARD } from '../src/aufgabenmail';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
/** Berliner Ortszeit im Winter (UTC+1) als Date. */
const berlin = (tag: string, uhr: string) => new Date(`${tag}T${uhr}:00+01:00`);

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = await d.legeTypAn({ name: 'Vorgang', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }] });
  const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
  await d.legeAufgabeAn(m.id, { empfaengerId: ben.id, text: 'Prüfen' }, anna.id);
  await d.legeAufgabeAn(m.id, { empfaengerId: anna.id, text: 'Ablegen' }, anna.id);
  const an: string[] = [];
  const mail = new Aufgabenmail({
    benutzer: () => konten.listeBenutzer(), einstellungenVon: (b) => konten.einstellungen(b),
    aufgabenVon: (b) => d.meineAufgaben(b), typName: async () => 'Vorgang',
  }, () => ({ async sende(x) { an.push(x); } }), () => 'http://nas', speicherEinstellungen());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  return { konten, anna, ben, mail, an, ich };
}

describe('Tägliche Zusammenfassung je Benutzer (#92, #94)', () => {
  it('prüft Uhrzeit (15-Minuten-Raster) und Wochentage', async () => {
    assert.deepEqual(pruefeZeit({}), { uhrzeit: null, tage: [1, 2, 3, 4, 5], feiertage: true });
    assert.deepEqual(pruefeZeit({ uhrzeit: '18:45', tage: [7, 1, 1], feiertage: false }), { uhrzeit: '18:45', tage: [1, 7], feiertage: false });
    assert.throws(() => pruefeZeit({ uhrzeit: '18:40' }), status(422));
    assert.throws(() => pruefeZeit({ tage: [0] }), status(422));
    assert.deepEqual(wirksameZeit(undefined, { ...MAIL_STANDARD, uhrzeit: '06:30' }), { uhrzeit: '06:30', tage: [1, 2, 3, 4, 5], feiertage: true });
  });

  it('schickt jedem zu seiner Uhrzeit an seinen Tagen, einmal am Tag, und holt am selben Tag nach', async () => {
    const { konten, anna, ben, mail, an, ich } = await aufbau();
    await mail.speichere({ uhrzeit: '07:00' });
    await konten.setzeEinstellung(await ich(ben.id), 'aufgaben_mail_zeit', pruefeZeit({ uhrzeit: '18:00', tage: [1, 2, 3, 4, 5, 6] }));
    // Donnerstag, 29.10.2026
    assert.equal(await mail.pruefe(berlin('2026-10-29', '06:59')), 0);
    assert.equal(await mail.pruefe(berlin('2026-10-29', '07:05')), 1);
    assert.deepEqual(an, ['anna@example.org']);
    assert.equal(await mail.pruefe(berlin('2026-10-29', '12:00')), 0, 'Anna nur einmal');
    assert.equal(await mail.pruefe(berlin('2026-10-29', '21:30')), 1, 'Ben: DMS war um 18 Uhr aus, kommt noch am selben Tag');
    assert.deepEqual(an, ['anna@example.org', 'ben@example.org']);
    // Samstag: Anna (Mo–Fr) nicht, Ben (Mo–Sa) schon
    assert.equal(await mail.pruefe(berlin('2026-10-31', '19:00')), 1);
    assert.equal(an.at(-1), 'ben@example.org');
    // Kein Wochentag = praktisch aus
    await konten.setzeEinstellung(await ich(anna.id), 'aufgaben_mail_zeit', pruefeZeit({ tage: [] }));
    assert.equal(await mail.pruefe(berlin('2026-11-02', '08:00')), 0);
  });

  it('lässt Feiertage des gewählten Bundeslands aus, wenn gewünscht', async () => {
    const { konten, ben, mail, an, ich } = await aufbau();
    await assert.rejects(mail.speichere({ bundesland: 'XX' }), status(422));
    // Reformationstag 2025 (Freitag) gilt in Hamburg, nicht in Bayern
    await mail.speichere({ uhrzeit: '07:00', bundesland: 'BY' });
    assert.equal(await mail.pruefe(berlin('2025-10-31', '08:00')), 2);
    await mail.speichere({ bundesland: 'HH' });
    an.length = 0;
    assert.equal(await mail.pruefe(berlin('2026-12-25', '08:00')), 0, '1. Weihnachtstag (Freitag)');
    await konten.setzeEinstellung(await ich(ben.id), 'aufgaben_mail_zeit', pruefeZeit({ feiertage: false }));
    assert.equal(await mail.pruefe(berlin('2026-12-25', '09:00')), 1, 'Ben möchte sie auch an Feiertagen');
    assert.deepEqual(an, ['ben@example.org']);
    await mail.speichere({ bundesland: null });
    assert.equal((await mail.einstellung()).bundesland, null);
  });
});
