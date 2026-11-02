/** Zahlen der Ansichten zwischenspeichern (#512): Stand des Haushalts, je Benutzer und Rechte, Ablauf. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALLES, type Regelwerk } from '../../shared/src/rechte';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { serverTiming } from '../src/messung';
import { kontext, type Kontext } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { Haushaltsstand, HOECHSTENS_MS, ZEITABHAENGIG_MS, Zaehlerspeicher, zeitabhaengig } from '../src/zaehlerspeicher';

describe('Zwischenspeicher der Zahlen (#512)', () => {
  it('Treffer bei gleichem Stand; neu nach einer Änderung, nach Ablauf und um Mitternacht', async () => {
    const stand = new Haushaltsstand();
    let jetzt = Date.parse('2026-11-01T12:00:00Z');
    const zs = new Zaehlerspeicher<number>(stand, () => jetzt);
    let gezaehlt = 0;
    const zaehle = (zeitabhaengig: boolean) => async () => ({ wert: ++gezaehlt, zeitabhaengig });
    assert.deepEqual(await zs.hole('a', zaehle(false)), { wert: 1, art: 'neu' });
    assert.deepEqual(await zs.hole('a', zaehle(false)), { wert: 1, art: 'treffer' });
    assert.deepEqual(await zs.hole('b', zaehle(false)), { wert: 2, art: 'neu' }, 'je Benutzer/Rechte ein eigener Eintrag');
    stand.erhoehe();
    assert.deepEqual(await zs.hole('a', zaehle(false)), { wert: 3, art: 'neu' }, 'neuer Stand');
    jetzt += ZEITABHAENGIG_MS + 1;
    assert.equal((await zs.hole('a', zaehle(false))).art, 'treffer', 'ohne Zeitbezug gilt er länger');
    jetzt += HOECHSTENS_MS;
    assert.equal((await zs.hole('a', zaehle(true))).art, 'neu', 'höchstens HOECHSTENS_MS');
    assert.equal((await zs.hole('a', zaehle(true))).art, 'treffer');
    jetzt += ZEITABHAENGIG_MS + 1;
    assert.equal((await zs.hole('a', zaehle(true))).art, 'neu', 'zeitabhängig: nach Minuten');
    jetzt = Date.parse('2026-11-01T22:59:00Z'); // 23:59 in Berlin
    await zs.hole('a', zaehle(false));
    jetzt = Date.parse('2026-11-01T23:00:30Z'); // 00:00:30 am nächsten Tag
    assert.equal((await zs.hole('a', zaehle(false))).art, 'neu', 'um Mitternacht');
  });

  it('gleichzeitige Aufrufe zählen einmal; ein Fehler bleibt nicht im Speicher', async () => {
    const zs = new Zaehlerspeicher<number>(new Haushaltsstand());
    let n = 0;
    const langsam = async () => { n++; await new Promise((r) => setTimeout(r, 10)); return { wert: n, zeitabhaengig: false }; };
    const [a, b] = await Promise.all([zs.hole('x', langsam), zs.hole('x', langsam)]);
    assert.equal(n, 1);
    assert.equal(a.wert, 1); assert.equal(b.wert, 1); assert.equal(b.art, 'treffer');
    await assert.rejects(zs.hole('y', async () => { throw new Error('weg'); }));
    assert.equal((await zs.hole('y', async () => ({ wert: 7, zeitabhaengig: false }))).wert, 7);
  });

  it('Stand: lesende Methoden zählen nicht, ändernde erst, wenn sie fertig sind', async () => {
    const stand = new Haushaltsstand();
    let fertig!: () => void;
    const repo = stand.umhuelle({
      holeMappe: async () => 1, seite: async () => 2, merkeGesehen: async () => {},
      aendereMappe: () => new Promise<void>((r) => { fertig = r; }),
      unbekannt: async () => 3,
    });
    await repo.holeMappe(); await repo.seite(); await repo.merkeGesehen();
    assert.equal(stand.stand, 0);
    const p = repo.aendereMappe();
    assert.equal(stand.stand, 0, 'noch nicht fertig');
    fertig(); await p;
    assert.equal(stand.stand, 1);
    await repo.unbekannt();
    assert.equal(stand.stand, 2, 'unbekannte Methoden zählen – lieber einmal zu viel');
  });

  it('erkennt zeitabhängige Bedingungen', () => {
    assert.equal(zeitabhaengig([{ art: 'feld', feld: 'f', op: 'kleiner', wert: { art: 'heute', versatz: 1, einheit: 'tage' } }]), true);
    assert.equal(zeitabhaengig([{ art: 'frist', feld: null, tage: 30 }]), true);
    assert.equal(zeitabhaengig([{ art: 'feld', feld: 'f', op: 'ja' }]), false);
  });

  it('Server-Timing nennt Treffer oder neu', () => {
    const t = { vor: 0, app: 1, db: 0, dbAnzahl: 0, rechte: 0, json: 0, gesamt: 1 };
    assert.match(serverTiming(t, { art: 'treffer', ms: 0.2 }), /zs;dur=0\.2;desc="treffer"$/);
    assert.doesNotMatch(serverTiming(t), /zs;/);
  });
});

/** Haushalt mit Administrator, Mitglied mit Lesefilter, Rechnungen (privat nur für FiBu) und drei Ansichten. */
async function aufbau() {
  const repo = speicherRepo();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const max = (await konten.legeBenutzerAn({ email: 'max@example.org', name: 'Max', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const rolleTyp = (await d.listeTypen()).find((t) => t.system === 'rolle')!;
  const fibu = (await d.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'FiBu' } }, admin.id)).id;
  const rechnung = await d.legeTypAn({ name: 'Rechnung', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'privat', label: 'Privat', typ: 'janein' },
    { key: 'faellig', label: 'Fällig', typ: 'datum' },
  ] });
  const privatNurFibu: Regelwerk = { grund: ALLES, regeln: [
    { id: 'privat', name: 'Privat nur FiBu', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }, { art: 'rolle', rollen: [fibu], nicht: true }], dann: { R: 'entziehen' }, stopp: true },
  ] };
  await d.setzeBerechtigungen(rechnung.id, privatNurFibu, true);
  const alle = await d.legeSichtAn({ name: 'Alle Rechnungen', typen: [rechnung.id], bedingungen: [] });
  const privat = await d.legeSichtAn({ name: 'Privat', typen: [rechnung.id], bedingungen: [{ art: 'feld', feld: 'privat', op: 'ja' }] });
  const faellig = await d.legeSichtAn({ name: 'Fällig bis heute', typen: [rechnung.id], bedingungen: [{ art: 'feld', feld: 'faellig', op: 'kleiner', wert: { art: 'heute', versatz: 1, einheit: 'tage' } }] });
  const ich = async (id: string) => { const b = (await konten.listeBenutzer()).find((x) => x.id === id)!; return { id: b.id, rolle: b.rolle }; };
  /** Zahlen wie der Server sie liefert, und ob der Zwischenspeicher traf. */
  const zahlen = async (id: string) => {
    const k: Kontext = { anfrage: 't', db: { anzahl: 0, ms: 0 } };
    const b = await ich(id);
    const z = await kontext.run(k, async () => d.zaehler(b, await d.zugriff(b)));
    return { z, art: k.zwischenspeicher?.art };
  };
  /** Dieselben Zahlen frisch gezählt (ein neuer Dienst auf demselben Bestand, ohne Zwischenspeicher). */
  const frisch = async (id: string) => {
    const f = new Dienst(repo, speicherDateien(), { einstellungen });
    const b = await ich(id);
    return f.zaehler(b, await f.zugriff(b));
  };
  return { d, admin, max, fibu, rechnung, privatNurFibu, alle, privat, faellig, zahlen, frisch };
}

const teil = (z: Awaited<ReturnType<Dienst['zaehler']>>) => ({ typen: z.typen, eingang: z.eingang, favoriten: z.favoriten, sichten: z.sichten, papierkorb: z.papierkorb });

describe('Dienst: Zahlen der Ansichten (#512)', () => {
  it('wiederholtes Laden ohne Änderung zählt nicht neu', async () => {
    const h = await aufbau();
    await h.d.legeMappeAn({ typId: h.rechnung.id, werte: { nr: 'R1' } }, h.admin.id);
    assert.equal((await h.zahlen(h.max.id)).art, 'neu');
    const zweites = await h.zahlen(h.max.id);
    assert.equal(zweites.art, 'treffer');
    assert.equal(zweites.z.sichten[h.alle.id], 1);
    // Rahmen ist immer frisch dabei.
    assert.equal('papierkorbTage' in zweites.z && 'neuePost' in zweites.z, true);
    // Lesen ändert den Stand nicht.
    await h.d.seite({ id: h.max.id, rolle: 'mitglied' }, { sicht: h.alle.id }, await h.d.zugriff({ id: h.max.id, rolle: 'mitglied' }));
    assert.equal((await h.zahlen(h.max.id)).art, 'treffer');
  });

  it('nach Änderungen stimmen die Zahlen beim nächsten Laden – je Benutzer mit seinen Rechten', async () => {
    const h = await aufbau();
    const pruefe = async (was: string) => {
      for (const id of [h.admin.id, h.max.id]) {
        await h.zahlen(id); // füllt den Zwischenspeicher
        assert.equal((await h.zahlen(id)).art, 'treffer', `${was}: Treffer ohne Änderung`);
      }
    };
    const stimmt = async (was: string, erwartet: { admin: [number, number]; max: [number, number] }) => {
      for (const [wer, id] of [['admin', h.admin.id], ['max', h.max.id]] as const) {
        const { z } = await h.zahlen(id);
        assert.deepEqual(teil(z), teil(await h.frisch(id)), `${was}: ${wer} wie frisch gezählt`);
        assert.deepEqual([z.sichten[h.alle.id], z.sichten[h.privat.id]], erwartet[wer], `${was}: ${wer} (alle, privat)`);
      }
    };
    await pruefe('Anfang');
    // Mappe anlegen
    const r1 = await h.d.legeMappeAn({ typId: h.rechnung.id, werte: { nr: 'R1' } }, h.admin.id);
    const r2 = await h.d.legeMappeAn({ typId: h.rechnung.id, werte: { nr: 'R2', privat: true } }, h.admin.id);
    await stimmt('anlegen', { admin: [2, 1], max: [1, 0] });
    await pruefe('anlegen');
    // Mappe ändern
    await h.d.aendereMappe(r1.id, { werte: { nr: 'R1', privat: true } }, h.admin.id);
    await stimmt('ändern', { admin: [2, 2], max: [0, 0] });
    await pruefe('ändern');
    // Rechte ändern: Regeln weg …
    await h.d.setzeBerechtigungen(h.rechnung.id, { grund: ALLES, regeln: [] }, true);
    await stimmt('Rechte ändern', { admin: [2, 2], max: [2, 2] });
    // … wieder an, und Max bekommt die Rolle FiBu
    await h.d.setzeBerechtigungen(h.rechnung.id, h.privatNurFibu, true);
    await stimmt('Rechte zurück', { admin: [2, 2], max: [0, 0] });
    await pruefe('Rechte zurück');
    await h.d.setzeRollen(h.max.id, [h.fibu], h.admin.id);
    await stimmt('Rolle', { admin: [2, 2], max: [2, 2] });
    await pruefe('Rolle');
    // Ansicht ändern
    await h.d.aendereSicht(h.privat.id, { name: 'Nicht privat', typen: [h.rechnung.id], bedingungen: [{ art: 'feld', feld: 'privat', op: 'nein' }] });
    await stimmt('Ansicht ändern', { admin: [2, 0], max: [2, 0] });
    await pruefe('Ansicht ändern');
    // Aufgabe vergeben und erledigen (Eingang)
    const a = await h.d.legeAufgabeAn(r2.id, { text: 'Bitte zahlen', empfaengerId: h.max.id }, h.admin.id);
    assert.equal((await h.zahlen(h.max.id)).z.eingang, 1);
    await h.zahlen(h.max.id);
    await h.d.erledigeAufgabe(a.id, { id: h.max.id, rolle: 'mitglied' });
    assert.equal((await h.zahlen(h.max.id)).z.eingang, 0, 'Aufgabe erledigt');
    await stimmt('Aufgabe erledigt', { admin: [2, 0], max: [2, 0] });
    // Favorit
    await h.d.setzeFavorit({ id: h.max.id }, r1.id, true);
    assert.equal((await h.zahlen(h.max.id)).z.favoriten, 1);
    // Mappe löschen
    await h.d.loescheMappe(r1.id, h.admin.id);
    await stimmt('löschen', { admin: [1, 0], max: [1, 0] });
    assert.equal((await h.zahlen(h.max.id)).z.favoriten, 0);
  });

  it('zeitabhängige Ansicht stimmt nach Mitternacht auch ohne Änderung', async (t) => {
    // 23:30 in Berlin; die Rechnung ist morgen fällig.
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T22:30:00Z') });
    const h = await aufbau();
    await h.d.legeMappeAn({ typId: h.rechnung.id, werte: { nr: 'R1', faellig: '2026-11-02' } }, h.admin.id);
    assert.equal((await h.zahlen(h.admin.id)).z.sichten[h.faellig.id], 0);
    assert.equal((await h.zahlen(h.admin.id)).art, 'treffer');
    t.mock.timers.setTime(Date.parse('2026-11-01T22:40:00Z'));
    assert.equal((await h.zahlen(h.admin.id)).art, 'neu', 'nach 10 Minuten: zeitabhängige Ansicht neu gezählt');
    t.mock.timers.setTime(Date.parse('2026-11-01T23:01:00Z')); // 00:01 am 2. November
    const z = await h.zahlen(h.admin.id);
    assert.equal(z.art, 'neu');
    assert.equal(z.z.sichten[h.faellig.id], 1, 'jetzt fällig');
  });
});

