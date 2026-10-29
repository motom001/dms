/** Fristen (#129–#133): Erinnerungen an Datumsfeldern, wiederkehrend, freie Erinnerungen, Anstehend, Sichtbedingung. */
import assert from 'node:assert/strict';
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

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const heute = heuteIn();
const in_ = (tage: number) => verschiebe(heute, tage);

/** Je Test eine frische Datenbank, wenn pg (TEST_DATABASE_URL), sonst Arbeitsspeicher. */
async function repos(pg: boolean) {
  if (!pg) return undefined;
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_frist_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  const H = '00000000-0000-4000-8000-000000000001';
  return { repo: pgRepo(sql, H) as never, konto: pgKontoRepo(sql, H) as never };
}
const offen: Array<{ end(): Promise<void> }> = [];

export async function aufbauFristen(pg = false) {
  const r = await repos(pg);
  const d = new Dienst(r?.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r?.konto ?? speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name, rolle: 'mitglied' }, admin.id)).benutzer;
  const anna = await neu('Anna'); const ben = await neu('Ben');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const benutzerTyp = (await d.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 2, einheit: 'wochen', empfaengerFeld: 'verantwortlich', text: '{feld} {datum}', wiederholung: 12 } },
    { key: 'tuev', label: 'TÜV', typ: 'datum' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
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
    it('legt ab Datum − Vorlauf an, nie doppelt, erledigt sich bei geändertem oder leerem Datum', async () => {
      const { d, anna, ben, vertrag, rufe } = await aufbauFristen(pg);
      // Ersteller Anna, Frist in 10 Tagen (Vorlauf 2 Wochen) → sofort fällig, für Anna (kein Verantwortlicher).
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10) } }, anna.id);
      let offen = (await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist');
      assert.equal(offen.length, 1);
      assert.equal(offen[0].datum, in_(10));
      assert.match(offen[0].text, /^Kündigung bis \d\d\.\d\d\.\d{4}$/);
      // Mehrere Läufe am Tag: nichts Neues.
      assert.deepEqual(await d.fristenLauf(), { angelegt: 0, erledigt: 0, erinnerungen: 0 });
      // Verantwortlicher Ben: die offene Frist bleibt bei Anna (sie kann weitergeben) – neue Daten gehen an Ben.
      await d.aendereMappe(m.id, { werte: { verantwortlich: ben.id } }, anna.id);
      // Datum nach hinten → alte erledigt, neue (noch nicht im Vorlauf) nicht angelegt.
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(60) } }, anna.id);
      assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist').length, 0);
      const historie = await d.historie(m.id);
      assert.ok(historie.some((h) => /erledigt \(verschoben auf/.test(String(h.daten?.text ?? ''))));
      // Lauf 50 Tage später: jetzt im Vorlauf → für Ben.
      assert.equal((await d.fristenLauf(in_(50))).angelegt, 1);
      offen = (await d.meineAufgaben({ id: ben.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist');
      assert.equal(offen.length, 1);
      // Erledigen mit Vorschlag für den nächsten Termin (jährlich).
      const erledigt = (await rufe(ben, 'POST', '/api/aufgaben/:id/erledigt', { params: { id: offen[0].id } })).body as { folgetermin?: string };
      assert.equal(erledigt.folgetermin, naechsterTermin(in_(60), 12));
      // Nochmal ein Lauf: erledigte Frist mit gleichem Datum wird nicht wieder angelegt.
      assert.equal((await d.fristenLauf(in_(50))).angelegt, 0);
      // Folgetermin übernehmen: Datum geändert, im Protokoll.
      const neu = (await rufe(ben, 'POST', '/api/aufgaben/:id/folgetermin', { params: { id: offen[0].id } })).body as { werte: Record<string, unknown> };
      assert.equal(neu.werte.kuendigung, naechsterTermin(in_(60), 12));
      await assert.rejects(rufe(ben, 'POST', '/api/aufgaben/:id/folgetermin', { params: { id: offen[0].id } }), status(409));
      // Leeres Datum erledigt offene Fristen.
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(3) } }, anna.id);
      assert.equal((await d.meineAufgaben({ id: ben.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist').length, 1);
      await d.aendereMappe(m.id, { werte: { kuendigung: null } }, anna.id);
      assert.equal((await d.meineAufgaben({ id: ben.id, rolle: 'mitglied' })).filter((a) => a.art === 'frist').length, 0);
    });

    it('Vergangene Daten erzeugen keine Frist; Erinnerung im Typ abschalten erledigt offene', async () => {
      const { d, anna, vertrag } = await aufbauFristen(pg);
      await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Alt', kuendigung: in_(-3) } }, anna.id);
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Neu', kuendigung: in_(1) } }, anna.id);
      assert.deepEqual((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).map((a) => a.mappeId), [m.id]);
      const t = (await d.listeTypen()).find((x) => x.id === vertrag.id)!;
      await d.aendereTyp(vertrag.id, { ...t, felder: t.felder.map((f) => (f.key === 'kuendigung' ? { ...f, frist: null } : f)) });
      assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).length, 0);
      // Wieder an: dieselbe Frist (Mappe, Feld, Datum) entsteht nicht noch einmal – ein neues Datum schon.
      await d.aendereTyp(vertrag.id, t);
      assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).length, 0);
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(2) } }, anna.id);
      assert.equal((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).length, 1);
    });

    it('Empfängerfeld muss ein Benutzerfeld des Typs sein', async () => {
      const { d, vertrag } = await aufbauFristen(pg);
      const t = (await d.listeTypen()).find((x) => x.id === vertrag.id)!;
      const neu = await d.aendereTyp(vertrag.id, { ...t, felder: t.felder.map((f) => (f.key === 'kuendigung' ? { ...f, frist: { ...f.frist, empfaengerFeld: 'name' } } : f)) });
      assert.equal(neu.felder.find((f) => f.key === 'kuendigung')!.frist!.empfaengerFeld, null);
    });
  });

  describe(`Erinnerungen und Anstehend (#131, #132)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('Erinnerung anlegen, ändern, fällig werden; Anstehend zeigt Fristen und Erinnerungen', async () => {
      const { d, anna, ben, vertrag, rufe } = await aufbauFristen(pg);
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(20), verantwortlich: anna.id } }, ben.id);
      const e = (await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(5), text: 'Angebote vergleichen' } })).body as { id: string; empfaengerId: string };
      assert.equal(e.empfaengerId, anna.id);
      await assert.rejects(rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: 'morgen', text: 'x' } }), status(422));
      // Ben darf Annas Erinnerung nicht ändern.
      await assert.rejects(rufe(ben, 'PUT', '/api/erinnerungen/:id', { params: { id: e.id }, body: { datum: in_(6), text: 'x' } }), status(403));
      let a = (await rufe(anna, 'GET', '/api/anstehend', { query: { tage: '30' } })).body as { eintraege: Array<{ art: string; datum: string; faellig: boolean }> };
      assert.deepEqual(a.eintraege.map((x) => [x.art, x.datum, x.faellig]), [['erinnerung', in_(5), false], ['frist', in_(20), false]]);
      a = (await rufe(anna, 'GET', '/api/anstehend', { query: { tage: '10' } })).body as typeof a;
      assert.equal(a.eintraege.length, 1);
      // Ben sieht nichts davon.
      assert.equal(((await rufe(ben, 'GET', '/api/anstehend', { query: {} })).body as typeof a).eintraege.length, 0);
      // Fällig: wird Aufgabe, Erinnerung verschwindet aus der Tabelle.
      assert.equal((await d.fristenLauf(in_(7))).erinnerungen, 1);
      const auf = (await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).filter((x) => x.art === 'erinnerung');
      assert.equal(auf.length, 1);
      assert.equal(auf[0].datum, in_(5));
      assert.equal((await d.holeMappe(m.id)).erinnerungen.length, 0);
      // Heute oder früher: gleich als Aufgabe; ändern und löschen.
      const e2 = (await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(2), text: 'Zweite', empfaengerId: ben.id } })).body as { id: string };
      await rufe(ben, 'PUT', '/api/erinnerungen/:id', { params: { id: e2.id }, body: { datum: in_(3), text: 'Zweite, später' } });
      assert.equal((await d.holeMappe(m.id)).erinnerungen[0].text, 'Zweite, später');
      await rufe(anna, 'DELETE', '/api/erinnerungen/:id', { params: { id: e2.id } });
      assert.equal((await d.holeMappe(m.id)).erinnerungen.length, 0);
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: heute, text: 'Sofort' } });
      assert.ok((await d.meineAufgaben({ id: anna.id, rolle: 'mitglied' })).some((x) => x.text === 'Sofort'));
    });

    it('Papierkorb nimmt Erinnerungen mit', async () => {
      const { d, anna, vertrag, rufe } = await aufbauFristen(pg);
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, anna.id);
      await rufe(anna, 'POST', '/api/mappen/:id/erinnerungen', { params: { id: m.id }, body: { datum: in_(9), text: 'Später' } });
      await d.loescheMappe(m.id, anna.id);
      await d.stelleWiederHer(m.id, { id: anna.id, rolle: 'mitglied' });
      assert.equal((await d.holeMappe(m.id)).erinnerungen.length, 1);
    });
  });

  describe(`Sichtbedingung „hat Frist in den nächsten n Tagen“ (#133)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    it('prüft, beschreibt und filtert (alle Felder mit Erinnerung, ein Feld, nur meine)', async () => {
      const { d, anna, ben, vertrag } = await aufbauFristen(pg);
      const t = (await d.listeTypen()).find((x) => x.id === vertrag.id)!;
      const a = { heute, ich: anna.id, meineRollen: [] };
      assert.equal(bedingungsProblem({ art: 'frist', feld: null, tage: 30 }, [t]), null);
      assert.match(bedingungsProblem({ art: 'frist', feld: 'name', tage: 30 }, [t]) ?? '', /Datumsfeld/);
      assert.match(beschreibeBedingung({ art: 'frist', feld: 'kuendigung', tage: 90, nurMeine: true }, [t]), /nächsten 90 Tagen \(„Kündigung bis“\), nur meine/);
      const m1 = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'A', kuendigung: in_(10) } }, anna.id);
      const m2 = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'B', kuendigung: in_(10), verantwortlich: ben.id } }, anna.id);
      const m3 = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'C', kuendigung: in_(100), tuev: in_(5) } }, anna.id);
      const z = { dokumente: () => 0, verknuepfungen: () => 0 };
      const treffer = (b: Parameters<typeof filterFuer>[0]['bedingungen'][number]) => [m1, m2, m3].filter((m) => erfuellt(m, filterFuer({ bedingungen: [b] }, [t], a), z)).map((m) => m.werte.name);
      assert.deepEqual(treffer({ art: 'frist', feld: null, tage: 30 }), ['A', 'B']);
      assert.deepEqual(treffer({ art: 'frist', feld: null, tage: 30, nurMeine: true }), ['A']);
      assert.deepEqual(treffer({ art: 'frist', feld: 'tuev', tage: 30 }), ['C']);
      // Über eine Sicht (Zähler laufen über dasselbe Repo).
      const s = await d.legeSichtAn({ name: 'Bald', typen: [vertrag.id], bedingungen: [{ art: 'frist', feld: null, tage: 30 }] });
      const seite = await d.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: s.id });
      assert.deepEqual(seite.mappen.map((m) => m.werte.name).sort(), ['A', 'B']);
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const s of offen) await s.end(); });
