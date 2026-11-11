/** Fristen (#129–#133): Erinnerungen an Datumsfeldern, wiederkehrend, freie Erinnerungen, Termine im Kalender (#725), Sichtbedingung. */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import { after, describe, it } from 'node:test';
import { bereinigeFrist, fristAb, fristText, naechsterTermin } from '../../shared/src/fristen';
import { bedingungsProblem, beschreibeBedingung, erfuellt, filterFuer, heuteIn, verschiebe } from '../../shared/src/sichten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { eigeneDatenbank } from './hilfe-db';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const heute = heuteIn();
const in_ = (tage: number) => verschiebe(heute, tage);

/** Je Test eine frische Datenbank, wenn pg (TEST_DATABASE_URL), sonst Arbeitsspeicher. */
async function repos(pg: boolean) {
  if (!pg) return undefined;
  const { migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  // Eigene Datenbank (#900), nach dem letzten Test der Datei gelöscht.
  const sql = (await eigeneDatenbank('frist', { migrieren: false })).sql;
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  const H = '00000000-0000-4000-8000-000000000001';
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}
const offen: Array<{ end(): Promise<void> }> = [];

export async function aufbauFristen(pg = false) {
  const r = await repos(pg);
  const d = new Dienst(r?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r?.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, admin.id)).benutzer;
  const anna = await neu('Anna'); const ben = await neu('Ben');
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 2, einheit: 'wochen', empfaengerFeld: 'verantwortlich', text: '{feld} {datum}', wiederholung: 12 } },
    { key: 'tuev', label: 'TÜV', typ: 'datum' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
  return { d, konten, admin, anna, ben, vertrag, benutzerTyp, rufe };
}

describe('Fristen: Rechnen', () => {
  it('Vorlauf, Text, Monatsende und Bereinigen', () => {
    const f = bereinigeFrist({ vorlauf: 1, einheit: 'monate', text: '  {feld}  {datum} – {titel} ', wiederholung: 1 })!;
    assert.equal(fristAb('2027-03-31', f), '2027-02-28');
    assert.equal(fristText(f, { label: 'Kündigung bis' }, '2027-09-30', 'Strom'), 'Kündigung bis 30.09.2027 – Strom');
    assert.equal(naechsterTermin('2027-01-31', 1), '2027-02-28');
    assert.equal(naechsterTermin('2028-01-31', 1), '2028-02-29');
    assert.equal(naechsterTermin('2027-09-30', 12), '2028-09-30');
    assert.equal(bereinigeFrist(null), null);
    assert.equal(bereinigeFrist({ vorlauf: -5, einheit: 'jahre', wiederholung: 0 })!.vorlauf, 0);
    assert.equal(bereinigeFrist({ einheit: 'jahre' })!.einheit, 'tage');
    assert.equal(bereinigeFrist({ wiederholung: 0 })!.wiederholung, null);
  });
});

function faelle(pg: boolean) {
  describe(`Fristen: Aufgaben aus Datumsfeldern (#129, #130)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('Das Feld legt selbst keine Frist-Aufgaben mehr an (#712 – das tut die übernommene Automatisierung, test/fristen-umzug.test.ts)', async () => {
      const { d, anna, vertrag } = await aufbauFristen(pg);
      await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10) } }, anna.id);
      assert.deepEqual(await d.fristenLauf(), { angelegt: 0, erledigt: 0, erinnerungen: 0 });
      assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist').length, 0);
    });

    it('Empfängerfeld muss ein Benutzerfeld des Typs sein', async () => {
      const { d, vertrag } = await aufbauFristen(pg);
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      const neu = await d.mappentypen.aendereTyp(vertrag.id, { ...t, felder: t.felder.map((f) => (f.key === 'kuendigung' ? { ...f, frist: { ...f.frist, empfaengerFeld: 'name' } } : f)) });
      assert.equal(neu.felder.find((f) => f.key === 'kuendigung')!.frist!.empfaengerFeld, null);
    });
  });

  describe(`Erinnerungen und Termine (#131, #725)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('Erinnerung anlegen, ändern, fällig werden; Termine zeigen Fristen und Erinnerungen', async () => {
      const { d, anna, ben, vertrag, rufe } = await aufbauFristen(pg);
      const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(20), verantwortlich: anna.id } }, ben.id);
      const e = (await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(5), text: 'Angebote vergleichen' } })).body as { id: string; empfaengerId: string };
      assert.equal(e.empfaengerId, anna.id);
      await assert.rejects(rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: 'morgen', text: 'x' } }), status(422));
      // Ben darf Annas Erinnerung nicht ändern.
      await assert.rejects(rufe(ben, 'PUT', '/api/erinnerungen/:id', { params: { id: e.id }, body: { datum: in_(6), text: 'x' } }), status(403));
      let a = (await rufe(anna, 'GET', '/api/termine', { query: { von: heute, bis: in_(30) } })).body as { eintraege: Array<{ art: string; datum: string; faellig: boolean }> };
      assert.deepEqual(a.eintraege.map((x) => [x.art, x.datum, x.faellig]), [['erinnerung', in_(5), false], ['frist', in_(20), false]]);
      a = (await rufe(anna, 'GET', '/api/termine', { query: { von: heute, bis: in_(10) } })).body as typeof a;
      assert.equal(a.eintraege.length, 1);
      // Ben darf die Mappe lesen: Er sieht das Datum der Frist (#725), aber nicht Annas Erinnerung.
      assert.deepEqual(((await rufe(ben, 'GET', '/api/termine', { query: { von: heute, bis: in_(30) } })).body as typeof a).eintraege.map((x) => x.art), ['frist']);
      // „/api/anstehend“ gibt es nicht mehr (#725).
      await assert.rejects(rufe(anna, 'GET', '/api/anstehend', { query: {} }), status(410));
      // Fällig: wird Aufgabe, Erinnerung verschwindet aus der Tabelle.
      assert.equal((await d.fristenLauf(in_(7))).erinnerungen, 1);
      const auf = (await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).filter((x) => x.art === 'erinnerung');
      assert.equal(auf.length, 1);
      assert.equal(auf[0].datum, in_(5));
      assert.equal((await d.mappen.holeMappe(m.id)).erinnerungen.length, 0);
      // Heute oder früher: gleich als Aufgabe; ändern und löschen.
      const e2 = (await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(2), text: 'Zweite', empfaengerId: ben.id } })).body as { id: string };
      await rufe(ben, 'PUT', '/api/erinnerungen/:id', { params: { id: e2.id }, body: { datum: in_(3), text: 'Zweite, später' } });
      assert.equal((await d.mappen.holeMappe(m.id)).erinnerungen[0].text, 'Zweite, später');
      await rufe(anna, 'DELETE', '/api/erinnerungen/:id', { params: { id: e2.id } });
      assert.equal((await d.mappen.holeMappe(m.id)).erinnerungen.length, 0);
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: heute, text: 'Sofort' } });
      assert.ok((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).some((x) => x.text === 'Sofort'));
    });

    it('Papierkorb nimmt Erinnerungen mit', async () => {
      const { d, anna, vertrag, rufe } = await aufbauFristen(pg);
      const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, anna.id);
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(9), text: 'Später' } });
      await d.loescheMappe(m.id, anna.id);
      await d.stelleWiederHer(m.id, { id: anna.id, rolle: 'mitglied' });
      assert.equal((await d.mappen.holeMappe(m.id)).erinnerungen.length, 1);
    });
  });

  describe(`Termine im Kalender von „Zu erledigen“ (#528, #725)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    type Antwort = { heute: string; von: string; bis: string; feiertage?: Record<string, string>; eintraege: Array<{ art: string; datum: string; faellig: boolean; folgetermin?: boolean; mappeId: string }> };
    it('Zeitraum mit künftigen Terminen wiederkehrender Fristen, Überfälligem und Aufgaben mit Datum; Fristen aller lesbaren Mappen, nur Favoriten', async () => {
      const { d, admin, anna, ben, vertrag, rufe } = await aufbauFristen(pg);
      // Jährlich (wiederholung 12), Anna verantwortlich, erstellt von Ben.
      const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(20), verantwortlich: anna.id } }, ben.id);
      // Wiederkehrend mit Datum weit vorn im Zeitraum davor: die Folgetermine stehen trotzdem im Kalender.
      const basis = verschiebe(in_(5), -24, 'monate');
      const alt = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', kuendigung: basis, verantwortlich: anna.id } }, ben.id);
      // Überfällig: Erinnerung mit vergangenem Datum wird gleich Aufgabe.
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(-12), text: 'Zählerstand melden' } });
      const bis = in_(399);
      const k = (await rufe(anna, 'GET', '/api/termine', { query: { von: heute, bis } })).body as Antwort;
      assert.equal(k.von, heute); assert.equal(k.bis, bis); assert.equal(k.heute, heute);
      assert.deepEqual(k.feiertage, {}, 'ohne Bundesland keine Feiertage');
      const zeile = (x: Antwort['eintraege'][number]) => [x.mappeId === m.id ? 'Strom' : 'Gas', x.art, x.datum, !!x.faellig, !!x.folgetermin];
      assert.deepEqual(k.eintraege.map(zeile), [
        ['Strom', 'erinnerung', in_(-12), true, false],
        ['Gas', 'frist', verschiebe(basis, 24, 'monate'), false, true],
        ['Strom', 'frist', in_(20), false, false],
        ['Gas', 'frist', verschiebe(basis, 36, 'monate'), false, true],
        ['Strom', 'frist', verschiebe(in_(20), 12, 'monate'), false, true],
      ].sort((a, b) => String(a[2]).localeCompare(String(b[2]))));
      // Später Zeitraum: Überfälliges bleibt dabei (für „n überfällig“), sonst nur, was hineinfällt.
      const spaeter = (await rufe(anna, 'GET', '/api/termine', { query: { von: in_(100), bis: in_(399) } })).body as Antwort;
      assert.deepEqual(spaeter.eintraege.map((x) => [x.datum, !!x.folgetermin]).sort(), [[in_(-12), false], [verschiebe(basis, 36, 'monate'), true], [verschiebe(in_(20), 12, 'monate'), true]].sort());
      // „Lesen darf“ statt „für mich“ (#725): Ben sieht die Fristen beider Mappen, nicht Annas Erinnerung.
      const benK = (await rufe(ben, 'GET', '/api/termine', { query: { von: heute, bis } })).body as Antwort;
      assert.deepEqual(benK.eintraege.map((x) => x.art), ['frist', 'frist', 'frist', 'frist']);
      // Nur Favoriten: ohne Favorit nichts, mit Stern an „Strom“ nur dessen Termine.
      assert.equal(((await rufe(ben, 'GET', '/api/termine', { query: { von: heute, bis, favoriten: '1' } })).body as Antwort).eintraege.length, 0);
      await rufe(ben, 'PUT', '/api/mappen/:id/favorit', { params: { id: m.id } });
      const fav = (await rufe(ben, 'GET', '/api/termine', { query: { von: heute, bis, favoriten: '1' } })).body as Antwort;
      assert.ok(fav.eintraege.length === 2 && fav.eintraege.every((x) => x.mappeId === m.id));
      // Aufgabe mit Datum (z. B. Auskunft bis …) erscheint als „aufgabe“ beim Empfänger.
      await rufe(admin, 'POST', '/api/werkbank/auskunft/frist', { body: { mappeId: alt.id } });
      const a = (await rufe(admin, 'GET', '/api/termine', { query: { von: heute, bis: in_(40) } })).body as Antwort;
      assert.deepEqual(a.eintraege.filter((x) => x.art === 'aufgabe').map((x) => [x.faellig, x.mappeId]), [[true, alt.id]]);
      // Zwischenspeicher: eine geänderte Erinnerung, ein geändertes Datum zeigen sich sofort.
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(30), text: 'Angebote vergleichen' } });
      await d.mappen.aendereMappe(alt.id, { werte: { kuendigung: null } }, ben.id);
      const neu = (await rufe(anna, 'GET', '/api/termine', { query: { von: heute, bis } })).body as Antwort;
      assert.ok(neu.eintraege.some((x) => x.art === 'erinnerung' && x.datum === in_(30)));
      assert.ok(!neu.eintraege.some((x) => x.mappeId === alt.id));
    });

    it('prüft den Zeitraum und liefert die Feiertage des Bundeslands', async () => {
      const { anna, rufe } = await aufbauFristen(pg);
      for (const query of [{ von: heute }, { von: '2027-02-30', bis: '2027-03-01' }, { von: '2027-03-01', bis: '2027-02-01' }, { von: '2027-01-01', bis: '2028-02-05' }]) {
        await assert.rejects(rufe(anna, 'GET', '/api/termine', { query }), status(422), JSON.stringify(query));
      }
      const { routen: r } = await import('../src/routen');
      const { d, konten } = await aufbauFristen(pg);
      const mail = { einstellung: async () => ({ aktiv: true, uhrzeit: '07:00', bundesland: 'SN' as const }) };
      const route = r(d, konten, { aufgabenmail: mail as never }).find((x) => x.methode === 'GET' && x.pfad === '/api/termine')!;
      const ich = (await konten.listeBenutzer())[0];
      const j = (await route.handler({ body: {}, params: {}, query: { von: '2027-01-01', bis: '2027-12-31' }, ip: '1', benutzer: ich })).body as Antwort;
      assert.equal(j.feiertage?.['2027-11-17'], 'Buß- und Bettag');
      assert.equal(j.feiertage?.['2027-12-25'], '1. Weihnachtstag');
      assert.equal(Object.keys(j.feiertage ?? {}).length, 11);
    });
  });

  describe(`Sichtbedingung „hat Frist in den nächsten n Tagen“ (#133)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('prüft, beschreibt und filtert (alle Felder mit Erinnerung, ein Feld, nur meine)', async () => {
      const { d, anna, ben, vertrag } = await aufbauFristen(pg);
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      const a = { heute, ich: anna.id, meineRollen: [] };
      assert.equal(bedingungsProblem({ art: 'frist', feld: null, tage: 30 }, [t]), null);
      assert.match(bedingungsProblem({ art: 'frist', feld: 'name', tage: 30 }, [t]) ?? '', /Datumsfeld/);
      assert.match(beschreibeBedingung({ art: 'frist', feld: 'kuendigung', tage: 90, nurMeine: true }, [t]), /nächsten 90 Tagen \(„Kündigung bis“\), nur meine/);
      const m1 = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'A', kuendigung: in_(10) } }, anna.id);
      const m2 = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'B', kuendigung: in_(10), verantwortlich: ben.id } }, anna.id);
      const m3 = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'C', kuendigung: in_(100), tuev: in_(5) } }, anna.id);
      const z = { dokumente: () => 0, verknuepfungen: () => 0 };
      const treffer = (b: Parameters<typeof filterFuer>[0]['bedingungen'][number]) => [m1, m2, m3].filter((m) => erfuellt(m, filterFuer({ bedingungen: [b] }, [t], a), z)).map((m) => m.werte.name);
      assert.deepEqual(treffer({ art: 'frist', feld: null, tage: 30 }), ['A', 'B']);
      assert.deepEqual(treffer({ art: 'frist', feld: null, tage: 30, nurMeine: true }), ['A']);
      assert.deepEqual(treffer({ art: 'frist', feld: 'tuev', tage: 30 }), ['C']);
      // Über eine Sicht (Zähler laufen über dasselbe Repo).
      const s = await d.sichtenVerwaltung.legeSichtAn({ name: 'Bald', typen: [vertrag.id], bedingungen: [{ art: 'frist', feld: null, tage: 30 }] });
      const seite = await d.sichten.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: s.id });
      assert.deepEqual(seite.mappen.map((m) => m.werte.name).sort(), ['A', 'B']);
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
