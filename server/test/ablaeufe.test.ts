/**
 * Ablauftests gegen PostgreSQL (#959): halten die heutigen Abläufe fest, bevor der Server umgebaut wird
 * (Anschlusspunkte #962, Systemausstattung #963, Umzüge aus `dienst.ts`). Getestet wird nur über die Fassade (`Dienst`,
 * `Konten`, `Automatisierungen`) und die Datenbank – nicht über Hilfsfunktionen, die bald umziehen.
 *
 * Was beim Speichern einer Mappe heute nebenbei passiert und hier festgehalten ist:
 * - Fristen: offene Frist-Aufgaben erledigen sich, sobald das Datum nicht mehr stimmt; „Frist erreicht“ kommt in den
 *   Ausgangskorb (beides in der Transaktion); die Frist-Aufgabe selbst legt danach die Automatisierung „Datum erreicht“
 *   an (#712, über den Ausgangskorb).
 * - Passung: gespeichert heißt „passt“; andere Mappen desselben Typs, die wegen eines doppelten Werts nicht passten,
 *   werden neu geprüft; „Passt nicht“-Aufgaben entstehen bzw. erledigen sich.
 * - Erwähnungen in formatierten Feldern: neue werden Aufgaben, entfernte stehen nur in der Historie.
 * - Post: „Für“ und Stand bestimmen die Aufgabe „Post für dich“.
 * - Vertretung: Aufgaben für Abwesende bzw. Deaktivierte gehen an den Vertreter; die Benutzer-Mappe spiegelt das Konto.
 * - Zurückrollen: wirft ein Teil davon, steht nichts in der Datenbank.
 *
 * Nur PostgreSQL: Das Speicher-Repo rollt nicht zurück. Ohne TEST_DATABASE_URL wird die Datei übersprungen.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, mock } from 'node:test';
import type postgres from 'postgres';
import { erwaehnung } from '../../shared/src/markdown';
import type { Aufgabe, Benutzer } from '../../shared/src/model';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { eigeneDatenbank } from './hilfe-db';
import { wieImModus } from './hilfen';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const heute = heuteIn();
const in_ = (tage: number) => verschiebe(heute, tage);
const datumDe = (iso: string) => iso.split('-').reverse().join('.');

/** Eine frische Datenbank je Test – so wie der Server zusammengebaut (ohne HTTP und Dateien). */
async function aufbau() {
  const db = await eigeneDatenbank('ablaeufe');
  const sql: postgres.Sql = db.sql;
  const { Dienst } = await import('../src/dienst');
  const { pgRepo } = await import('../src/repo-pg');
  const { Konten } = await import('../src/konten');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { speicherDateien } = await import('../src/dateispeicher');
  const { pgEinstellungen } = await import('../src/einstellungen');
  const { Automatisierungen, pgAutomatisierungRepo } = await import('../src/automatisierung');
  await import('../src/automatisierung-karten');
  const d = new Dienst(pgRepo(sql, HAUSHALT), speicherDateien(), { einstellungen: pgEinstellungen(sql, HAUSHALT) });
  const konten = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, markus.id)).benutzer;
  const lena = await neu('Lena'); const jonas = await neu('Jonas'); const petra = await neu('Petra'); const katrin = await neu('Katrin');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  // Wie beim Start (ablago.ts): Systemkonto, Automatisierungen am Ausgangskorb, Erinnerungen am Feld übernommen (#712).
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const motor = new Automatisierungen({ dienst: d, repo: pgAutomatisierungRepo(sql, HAUSHALT) });
  d.ereignisse.abonniere('automatisierungen', (e) => motor.ereignis(e));
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'nummer', label: 'Vertragsnummer', typ: 'text' },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 2, einheit: 'wochen', empfaengerFeld: 'verantwortlich', text: '{feld} {datum}', wiederholung: null } },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
    { key: 'notiz', label: 'Notiz', typ: 'formatiert' },
  ] });
  await motor.fristenUebernehmen();

  /** Ausgangskorb verteilen; gebündelte Ereignisse (z. B. „Mappe geändert“, 5 s) nicht erst abwarten. */
  const verteile = async () => {
    await sql`UPDATE ereignisse SET faellig = now() WHERE verteilt IS NULL AND faellig > now()`;
    await d.ereignisse.verteile();
  };
  /** Alle Aufgaben einer Mappe (offen und erledigt), sortiert nach Art und Empfänger. */
  const aufgaben = async (mappeId: string) => (await d.aufgabenVon(mappeId) as Aufgabe[]);
  const offene = async (mappeId: string, art?: string) => (await aufgaben(mappeId)).filter((a) => !a.erledigt && (!art || a.art === art));
  const ereignisse = async (art: string, mappeId?: string) =>
    (await sql`SELECT daten FROM ereignisse WHERE haushalt_id = ${HAUSHALT} AND art = ${art} ORDER BY nr`).map((r) => r.daten as Record<string, unknown>)
      .filter((x) => !mappeId || x.mappe === mappeId);
  const historie = async (mappeId: string) => d.historie(mappeId);
  const konto = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)! as Benutzer;
  return { sql, d, konten, motor, markus, lena, jonas, petra, katrin, vertrag, benutzerTyp, verteile, aufgaben, offene, ereignisse, historie, konto };
}

describe('Ablauftests vor dem Umbau (#959, PostgreSQL)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  describe('Mappe anlegen und ändern', () => {
    it('Frist: beim Anlegen „Frist erreicht“ und Frist-Aufgabe; beim Ändern erledigt sich die alte, die neue kommt', async () => {
      const { d, lena, jonas, petra, vertrag, verteile, offene, aufgaben, ereignisse, historie } = await aufbau();
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10), verantwortlich: jonas.id } }, lena.id);
      // In der Transaktion: „Frist erreicht“ (Erinnerungstag ist vorbei, Datum noch nicht) im Ausgangskorb.
      assert.deepEqual((await ereignisse('frist.erreicht', m.id)).map((e) => [e.feld, e.datum, e.zeitpunkt, e.empfaenger]), [['kuendigung', in_(10), 'vorlauf', jonas.id]]);
      // Die Aufgabe kommt über die Automatisierung „Datum erreicht“ (#712) – an den Verantwortlichen.
      assert.equal((await offene(m.id, 'frist')).length, 0);
      await verteile();
      let f = await offene(m.id, 'frist');
      assert.deepEqual(f.map((a) => [a.empfaengerId, a.datum, a.feldKey, a.text]), [[jonas.id, in_(10), 'kuendigung', `Kündigung bis ${datumDe(in_(10))}`]]);
      const erste = f[0].id;

      // Ändern ohne neues Datum: keine zweite Frist, kein zweites „Frist erreicht“.
      await d.aendereMappe(m.id, { werte: { name: 'Strom Haus' } }, lena.id);
      await verteile();
      assert.deepEqual((await offene(m.id, 'frist')).map((a) => a.id), [erste]);
      assert.equal((await ereignisse('frist.erreicht', m.id)).length, 1);

      // Datum vorgezogen: die alte erledigt sich sofort (in der Transaktion, mit Grund in der Historie) ...
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(5) } }, lena.id);
      const alt = (await aufgaben(m.id)).find((a) => a.id === erste)!;
      assert.ok(alt.erledigt, 'alte Frist erledigt');
      assert.equal(alt.erledigtVon, null);
      assert.ok((await historie(m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === `erledigt (geändert auf ${datumDe(in_(5))}): Kündigung bis ${datumDe(in_(10))}`));
      assert.deepEqual((await ereignisse('frist.erreicht', m.id)).map((e) => e.datum), [in_(10), in_(5)]);
      // ... und die neue kommt über die Automatisierung.
      await verteile();
      f = await offene(m.id, 'frist');
      assert.deepEqual(f.map((a) => [a.empfaengerId, a.datum]), [[jonas.id, in_(5)]]);

      // Anderer Verantwortlicher und Datum weit voraus: die offene erledigt sich, eine neue gibt es noch nicht.
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(60), verantwortlich: petra.id } }, lena.id);
      await verteile();
      assert.equal((await offene(m.id, 'frist')).length, 0);
      assert.ok((await historie(m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === `erledigt (verschoben auf ${datumDe(in_(60))}): Kündigung bis ${datumDe(in_(5))}`));
      assert.equal((await ereignisse('frist.erreicht', m.id)).length, 2);

      // Datum geleert: nichts mehr offen, „Frist erreicht“ nicht mehr.
      await d.aendereMappe(m.id, { werte: { kuendigung: in_(3) } }, lena.id);
      await verteile();
      assert.deepEqual((await offene(m.id, 'frist')).map((a) => [a.empfaengerId, a.datum]), [[petra.id, in_(3)]]);
      await d.aendereMappe(m.id, { werte: { kuendigung: null } }, lena.id);
      assert.equal((await offene(m.id, 'frist')).length, 0);
      assert.ok((await historie(m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === `erledigt (Datum leer): Kündigung bis ${datumDe(in_(3))}`));
    });

    it('Erwähnung: neue werden Aufgaben (einmal je Person und Feld), entfernte stehen nur in der Historie', async () => {
      const { d, lena, jonas, petra, katrin, vertrag, offene, ereignisse, historie } = await aufbau();
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Gas', notiz: `Bitte ${erwaehnung('Petra', petra.id)} ansehen, ${erwaehnung('Lena', lena.id)} weiß Bescheid.` } }, lena.id);
      // Petra ja, Lena nicht (wer erwähnt, bekommt keine Aufgabe).
      let e = await offene(m.id, 'erwaehnung');
      assert.deepEqual(e.map((a) => [a.empfaengerId, a.feldKey, a.text, a.erstelltVon]), [[petra.id, 'notiz', 'Erwähnt von Lena in „Notiz“', lena.id]]);
      assert.ok((await historie(m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === 'Petra erwähnt in „Notiz“' && h.daten.fuer === petra.id));
      assert.deepEqual((await ereignisse('aufgabe.neu', m.id)).map((x) => [x.empfaenger, x.aufgabenart]), [[petra.id, 'erwaehnung']]);
      const petras = e[0].id;

      // Ändern: Petra bleibt (keine zweite Aufgabe), Katrin kommt dazu – Jonas schreibt.
      await d.aendereMappe(m.id, { werte: { notiz: `${erwaehnung('Petra', petra.id)} und ${erwaehnung('Katrin', katrin.id)}: bitte bis Freitag.` } }, jonas.id);
      e = await offene(m.id, 'erwaehnung');
      assert.deepEqual(e.map((a) => [a.empfaengerId, a.text]).sort(), [[katrin.id, 'Erwähnt von Jonas in „Notiz“'], [petra.id, 'Erwähnt von Lena in „Notiz“']].sort());

      // Petra entfernt: ihre Aufgabe bleibt offen, die Historie sagt es.
      await d.aendereMappe(m.id, { werte: { notiz: `${erwaehnung('Katrin', katrin.id)}: bitte bis Freitag.` } }, jonas.id);
      e = await offene(m.id, 'erwaehnung');
      assert.ok(e.some((a) => a.id === petras));
      assert.equal(e.length, 2);
      assert.ok((await historie(m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === 'Erwähnung von Petra in „Notiz“ entfernt'));

      // Wieder erwähnt, während die alte noch offen ist: keine zweite.
      await d.aendereMappe(m.id, { werte: { notiz: `${erwaehnung('Petra', petra.id)} ${erwaehnung('Katrin', katrin.id)}` } }, jonas.id);
      assert.equal((await offene(m.id, 'erwaehnung')).filter((a) => a.empfaengerId === petra.id).length, 1);
    });

    it('Passung: doppelte Werte → „Passt nicht“; Speichern löst es auch für die andere Mappe; neue Mappe passt', async () => {
      const { d, lena, jonas, vertrag, offene } = await aufbau();
      const a = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wasser', nummer: 'V-1' } }, lena.id);
      const b = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Abwasser', nummer: 'V-1' } }, jonas.id);
      assert.equal((await d.holeMappe(a.id)).mappe.problem ?? null, null);
      // Vertragsnummer wird eindeutig: beide passen nicht mehr, je eine Aufgabe an den, der sie angelegt hat.
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      await d.mappentypen.aendereTyp(vertrag.id, { ...t, felder: t.felder.map((f) => (f.key === 'nummer' ? { ...f, eindeutig: true } : f)) });
      for (const [m, wer] of [[a, lena], [b, jonas]] as const) {
        assert.match(String((await d.holeMappe(m.id)).mappe.problem), /Vertragsnummer/);
        const p = await offene(m.id, 'passung');
        assert.equal(p.length, 1);
        assert.equal(p[0].empfaengerId, wer.id);
        assert.match(p[0].text, /^Passt nicht zur Definition: /);
      }
      // Anlegen mit einer vergebenen Nummer geht nicht – und hinterlässt nichts.
      const vorher = (await d.listeMappen(vertrag.id)).length;
      await assert.rejects(d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Doppelt', nummer: 'V-1' } }, lena.id), (e: { status?: number }) => e.status === 422);
      assert.equal((await d.listeMappen(vertrag.id)).length, vorher);
      // B bekommt eine andere Nummer: B passt (gespeichert), und A auch wieder (neu geprüft) – beide Aufgaben erledigt.
      await d.aendereMappe(b.id, { werte: { nummer: 'V-2' } }, jonas.id);
      for (const m of [a, b]) {
        assert.equal((await d.holeMappe(m.id)).mappe.problem ?? null, null);
        assert.equal((await offene(m.id, 'passung')).length, 0);
      }
      // Neue Mappe mit freier Nummer: passt, keine Aufgabe.
      const c = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Müll', nummer: 'V-3' } }, lena.id);
      assert.equal((await d.holeMappe(c.id)).mappe.problem ?? null, null);
      assert.equal((await offene(c.id, 'passung')).length, 0);
    });

    it('Post: „Post für dich“ beim Anlegen, wandert mit „An“, erledigt sich beim Zuordnen', async () => {
      const { d, markus, lena, jonas, vertrag, offene, ereignisse } = await aufbau();
      const post = await d.legePostAn({ betreff: 'Brief der Stadtwerke', an: lena.id }, { id: markus.id, name: 'Markus' });
      let p = await offene(post.id, 'post');
      assert.deepEqual(p.map((a) => [a.empfaengerId, a.feldKey, a.text, a.erstelltVon]), [[lena.id, `an:${lena.id}`, 'Post für dich', markus.id]]);
      // #1042: an, dazu fuer mit demselben Wert bis 1.0.0.
      assert.deepEqual((await ereignisse('post.angelegt', post.id)).map((e) => [e.an, e.fuer]), [[lena.id, lena.id]]);
      const lenas = p[0].id;

      // An Jonas (alter Name fuer, Übergang #1042): Lenas Aufgabe erledigt (von Markus), Jonas bekommt eine.
      await d.aendereMappe(post.id, { werte: { fuer: jonas.id } }, markus.id);
      p = await offene(post.id, 'post');
      assert.deepEqual(p.map((a) => [a.empfaengerId, a.feldKey]), [[jonas.id, `an:${jonas.id}`]]);
      const erledigt = (await d.aufgabenVon(post.id)).find((a) => a.id === lenas)!;
      assert.ok(erledigt.erledigt);
      assert.equal(erledigt.erledigtVon, markus.id);
      // Noch einmal gespeichert, „Für“ gleich: keine zweite.
      await d.aendereMappe(post.id, { werte: { betreff: 'Brief der Stadtwerke (Abschlag)' } }, markus.id);
      assert.equal((await offene(post.id, 'post')).length, 1);

      // Zugeordnet: Stand „Zugeordnet“, die Aufgabe ist erledigt.
      const ziel = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, lena.id);
      await d.ordneZu(post.id, { ziel: ziel.id }, jonas.id);
      assert.equal((await offene(post.id, 'post')).length, 0);
      assert.equal(String((await d.holeMappe(post.id)).mappe.werte.stand), 'Zugeordnet');
    });
  });

  describe('Mappentyp ändern', () => {
    it('Erinnerung am Feld geändert bzw. entfernt: Fristen der bestehenden Mappen stimmen', async () => {
      const { d, lena, jonas, vertrag, verteile, offene, ereignisse } = await aufbau();
      const nah = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Nah', kuendigung: in_(10), verantwortlich: jonas.id } }, lena.id);
      const fern = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Fern', kuendigung: in_(40), verantwortlich: jonas.id } }, lena.id);
      await verteile();
      assert.equal((await offene(nah.id, 'frist')).length, 1);
      assert.equal((await offene(fern.id, 'frist')).length, 0);
      assert.equal((await ereignisse('frist.erreicht', fern.id)).length, 0);

      // Vorlauf am Feld auf 8 Wochen: „Frist erreicht“ jetzt auch für die ferne Mappe – genau einmal, die nahe nicht doppelt.
      let t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      await d.mappentypen.aendereTyp(vertrag.id, { ...t, felder: t.felder.map((f) => (f.key === 'kuendigung' ? { ...f, frist: { ...f.frist, vorlauf: 8 } } : f)) });
      assert.deepEqual((await ereignisse('frist.erreicht', fern.id)).map((e) => [e.datum, e.zeitpunkt, e.empfaenger]), [[in_(40), 'vorlauf', jonas.id]]);
      assert.equal((await ereignisse('frist.erreicht', nah.id)).length, 1);
      // Die Frist-Aufgabe der nahen Mappe stammt aus der Automatisierung (Anlass Datum) und bleibt.
      assert.equal((await offene(nah.id, 'frist')).length, 1);

      // Feld entfernt: offene Fristen erledigen sich mit Grund.
      t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      await d.mappentypen.aendereTyp(vertrag.id, { ...t, felder: t.felder.filter((f) => f.key !== 'kuendigung') });
      assert.equal((await offene(nah.id, 'frist')).length, 0);
      assert.ok((await d.historie(nah.id)).some((h) => h.art === 'aufgabe' && String(h.daten.text).startsWith('erledigt (Feld entfernt)')));
    });
  });

  describe('Benutzer spiegeln', () => {
    it('Abwesenheit, Ende und Deaktivieren: Benutzer-Mappe und Vertretung stimmen', async () => {
      const { d, konten, markus, lena, jonas, petra, vertrag, verteile, offene, historie, konto } = await aufbau();
      const erwaehne = async (wer: { id: string }, name: string) => {
        const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name, notiz: `Frage an ${erwaehnung('Lena', lena.id)}` } }, wer.id);
        return { m, a: (await offene(m.id, 'erwaehnung'))[0] };
      };

      // Lena trägt sich abwesend ein, Vertreter Jonas.
      await konten.setzeAbwesenheit(await konto(lena.id), lena.id, { an: true, vertreterId: jonas.id });
      let mappe = (await d.holeMappe(lena.id)).mappe;
      assert.equal(mappe.werte.abwesend, true);
      assert.equal(mappe.werte.vertreter, jonas.id);
      assert.equal(mappe.werte.aktiv, true);
      assert.ok((await historie(lena.id)).some((h) => h.art === 'abwesenheit' && /Vertreter Jonas/.test(String(h.daten.text))));
      // Übernommene Automatisierung „Vertretung eingetragen“ (#712): Jonas bekommt eine Aufgabe an Lenas Mappe.
      await verteile();
      assert.deepEqual((await offene(lena.id)).map((a) => a.empfaengerId), [jonas.id]);

      // Neue Aufgaben für Lena gehen an Jonas – mit Eintrag in der Historie.
      let x = await erwaehne(petra, 'Telefon');
      assert.equal(x.a.empfaengerId, jonas.id);
      assert.ok((await historie(x.m.id)).some((h) => h.art === 'aufgabe' && h.daten.text === 'weitergegeben wegen Abwesenheit von Lena an Jonas: Erwähnt von Petra in „Notiz“'));
      const post = await d.legePostAn({ betreff: 'Brief', fuer: lena.id }, { id: markus.id, name: 'Markus' });
      assert.deepEqual((await offene(post.id, 'post')).map((a) => a.empfaengerId), [jonas.id]);

      // Abwesenheit beendet: Mappe zeigt es, neue Aufgaben wieder an Lena; Jonas' Vertretungsaufgabe erledigt sich.
      await konten.setzeAbwesenheit(await konto(lena.id), lena.id, { an: false, vertreterId: jonas.id });
      mappe = (await d.holeMappe(lena.id)).mappe;
      assert.equal(mappe.werte.abwesend, false);
      assert.equal(mappe.werte.vertreter ?? null, null);
      await verteile();
      assert.equal((await offene(lena.id)).length, 0);
      x = await erwaehne(petra, 'Internet');
      assert.equal(x.a.empfaengerId, lena.id);

      // Deaktiviert (Vertreter hinterlegt, keine offenen Aufgaben): Mappe inaktiv, Vertreter wirkt dauerhaft.
      await d.erledigeAufgabe(x.a.id, { id: lena.id, rolle: 'mitglied' });
      await konten.aendereBenutzer(wieImModus(await konto(markus.id)), lena.id, { aktiv: false });
      mappe = (await d.holeMappe(lena.id)).mappe;
      assert.equal(mappe.werte.aktiv, false);
      assert.equal(mappe.werte.vertreter, jonas.id);
      x = await erwaehne(petra, 'Versicherung');
      assert.equal(x.a.empfaengerId, jonas.id);

      // Spiegeln beim Start ändert an einer stimmigen Mappe nichts.
      const n = (await historie(lena.id)).length;
      await d.gleicheBenutzerAb(await konten.listeBenutzer());
      assert.equal((await historie(lena.id)).length, n);
      assert.equal((await d.holeMappe(lena.id)).mappe.werte.vertreter, jonas.id);
    });
  });

  describe('Zurückrollen', () => {
    /**
     * Der Empfänger, der wirft: `fristenAbgleichen` – die öffentliche Methode der Fassade, die heute als letzter Schritt
     * in der Transaktion von Anlegen und Ändern läuft (nach Historie, Erwähnungen und Passung) und nach #962 Empfänger
     * des Anschlusspunkts „Mappe geändert“ wird. Ruft der Umbau sie nicht mehr auf, scheitert dieser Test laut
     * (Aufrufe = 0) statt still grün zu bleiben – dann den neuen Empfänger hier eintragen.
     */
    it('Anlegen: wirft ein Empfänger, stehen weder Mappe noch Historie, Aufgaben oder Ereignisse in der Datenbank', async () => {
      const { sql, d, lena, petra, vertrag } = await aufbau();
      const zaehle = async () => (await sql`SELECT
        (SELECT count(*) FROM mappen WHERE typ_id = ${vertrag.id})::int AS mappen,
        (SELECT count(*) FROM aufgaben)::int AS aufgaben,
        (SELECT count(*) FROM historie)::int AS historie,
        (SELECT count(*) FROM ereignisse)::int AS ereignisse`)[0];
      const vorher = await zaehle();
      const wirft = mock.method(d, 'fristenAbgleichen', async () => { throw new Error('Empfänger wirft'); });
      const id = randomUUID();
      try {
        await assert.rejects(d.legeMappeAn({ id, typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10), notiz: erwaehnung('Petra', petra.id) } }, lena.id), /Empfänger wirft/);
      } finally { wirft.mock.restore(); }
      assert.equal(wirft.mock.callCount(), 1, 'der Empfänger lief in der Transaktion');
      assert.deepEqual(await zaehle(), vorher);
      await assert.rejects(d.holeMappe(id), (e: { status?: number }) => e.status === 404);
      // Ohne den Fehler geht dasselbe durch (die Eingabe war in Ordnung).
      await d.legeMappeAn({ id, typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10), notiz: erwaehnung('Petra', petra.id) } }, lena.id);
      assert.equal((await d.aufgabenVon(id)).filter((a) => a.art === 'erwaehnung').length, 1);
    });

    it('Ändern: wirft ein Empfänger, bleiben Werte, Historie, Aufgaben und Ereignisse wie vorher', async () => {
      const { sql, d, lena, jonas, petra, katrin, vertrag, verteile } = await aufbau();
      const m = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10), verantwortlich: jonas.id, notiz: erwaehnung('Petra', petra.id) } }, lena.id);
      await verteile();
      const stand = async () => {
        const [z] = await sql`SELECT
          (SELECT count(*) FROM historie WHERE mappe_id = ${m.id})::int AS historie,
          (SELECT count(*) FROM ereignisse)::int AS ereignisse,
          (SELECT json_agg(json_build_object('id', id, 'erledigt', erledigt, 'empfaenger', empfaenger_id) ORDER BY id) FROM aufgaben WHERE mappe_id = ${m.id}) AS aufgaben`;
        return { ...z, werte: (await d.holeMappe(m.id)).mappe.werte };
      };
      const vorher = await stand();
      const wirft = mock.method(d, 'fristenAbgleichen', async () => { throw new Error('Empfänger wirft'); });
      try {
        // Name, Datum (würde die Frist erledigen) und Erwähnung (würde Katrin eine Aufgabe geben) auf einmal.
        await assert.rejects(d.aendereMappe(m.id, { werte: { name: 'Strom Haus', kuendigung: in_(4), notiz: erwaehnung('Katrin', katrin.id) } }, jonas.id), /Empfänger wirft/);
      } finally { wirft.mock.restore(); }
      assert.equal(wirft.mock.callCount(), 1);
      assert.deepEqual(await stand(), vorher);
    });

    /**
     * Mappentyp ändern (#962): läuft jetzt in einer Transaktion. Der letzte Empfänger von „Typ geändert“
     * (`aufgaben.fristen` → `fristenAbgleichen`) wirft – Typ, Ansicht, Titel und Passung stehen wie vorher.
     */
    it('Mappentyp ändern: wirft ein Empfänger, bleiben Typ, Ansicht, Titel, Passung, Historie und Ereignisse wie vorher', async () => {
      const { sql, d, lena, jonas, vertrag } = await aufbau();
      const a = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wasser', nummer: 'V-1', kuendigung: in_(40), verantwortlich: jonas.id } }, lena.id);
      const b = await d.legeMappeAn({ typId: vertrag.id, werte: { name: 'Abwasser', nummer: 'V-1' } }, jonas.id);
      const stand = async () => {
        const [z] = await sql`SELECT
          (SELECT count(*) FROM historie)::int AS historie,
          (SELECT count(*) FROM ereignisse)::int AS ereignisse,
          (SELECT count(*) FROM aufgaben)::int AS aufgaben,
          (SELECT json_agg(json_build_object('id', id, 'titel', titel, 'problem', problem) ORDER BY id) FROM mappen WHERE typ_id = ${vertrag.id}) AS mappen`;
        const typ = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
        return { ...z, name: typ.name, felder: typ.felder, sicht: (await d.listeSichten()).find((x) => x.id === vertrag.id)?.name };
      };
      const vorher = await stand();
      const t = (await d.mappentypen.listeTypen()).find((x) => x.id === vertrag.id)!;
      const wirft = mock.method(d, 'fristenAbgleichen', async () => { throw new Error('Empfänger wirft'); });
      try {
        // Name (Ansicht heißt mit), Titel-Vorlage, Nummer eindeutig (Passung), Vorlauf 8 Wochen (Frist) auf einmal.
        await assert.rejects(d.mappentypen.aendereTyp(vertrag.id, {
          ...t, name: 'Verträge', titelVorlage: '{name} ({nummer})',
          felder: t.felder.map((f) => (f.key === 'nummer' ? { ...f, eindeutig: true } : f.key === 'kuendigung' ? { ...f, frist: { ...f.frist!, vorlauf: 8 } } : f)),
        }), /Empfänger wirft/);
      } finally { wirft.mock.restore(); }
      assert.equal(wirft.mock.callCount(), 1, 'der Empfänger lief in der Transaktion');
      assert.deepEqual(await stand(), vorher);
      // Ohne den Fehler geht dasselbe durch.
      await d.mappentypen.aendereTyp(vertrag.id, { ...t, name: 'Verträge', felder: t.felder.map((f) => (f.key === 'nummer' ? { ...f, eindeutig: true } : f)) });
      assert.equal((await d.listeSichten()).find((x) => x.id === vertrag.id)?.name, 'Verträge');
      for (const m of [a, b]) assert.match(String((await d.holeMappe(m.id)).mappe.problem), /Vertragsnummer/);
    });

    /**
     * Benutzer spiegeln (#962): Benutzer-Mappe und Abwesenheit laufen jetzt in einer Transaktion. Das Konto selbst
     * steht in der Kontentabelle und ist schon gespeichert – das nächste Spiegeln (stündlich, beim Start) zieht die
     * Mappe nach.
     */
    it('Benutzer spiegeln: wirft ein Empfänger, bleiben Benutzer-Mappe, Historie und Ereignisse wie vorher', async () => {
      const { sql, d, konten, lena, jonas, konto } = await aufbau();
      const stand = async () => {
        const [z] = await sql`SELECT
          (SELECT count(*) FROM historie WHERE mappe_id = ${lena.id})::int AS historie,
          (SELECT count(*) FROM ereignisse)::int AS ereignisse`;
        return { ...z, werte: (await d.holeMappe(lena.id)).mappe.werte };
      };
      const vorher = await stand();
      const wirft = mock.method(d, 'abwesenheitGeaendert', async () => { throw new Error('Empfänger wirft'); });
      try {
        await assert.rejects(konten.setzeAbwesenheit(await konto(lena.id), lena.id, { an: true, vertreterId: jonas.id }), /Empfänger wirft/);
      } finally { wirft.mock.restore(); }
      assert.equal(wirft.mock.callCount(), 1, 'der Empfänger lief in der Transaktion');
      assert.deepEqual(await stand(), vorher);
      assert.equal((await konto(lena.id)).abwesenheit?.an, true, 'das Konto ist gespeichert (außerhalb der Transaktion)');
      // Das nächste Spiegeln zieht die Mappe nach.
      await d.gleicheBenutzerAb(await konten.listeBenutzer());
      assert.equal((await d.holeMappe(lena.id)).mappe.werte.abwesend, true);
    });
  });
});
