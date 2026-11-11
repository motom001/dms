/**
 * Post: „von“ und „an“ (#1042). Kennungen und Beschriftungen wie an Vertrag und Rechnung, Übergang der Schnittstelle v1
 * (alte Namen absender/fuer lesen und schreiben), Platzhalter, Links, Rechte-Regeln mit unbekannter Kennung geschlossen
 * und der Umzug in der Datenbank (Migration 099): Typ, Werte, Verweise, Aufgaben, Papierkorb, Ansichten, Rechte-Regeln,
 * Automatisierungen – Rechte wirken danach genau wie vorher.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { liesDirektlink } from '../../shared/src/direktlink';
import { POST_STAND, systemfelder, type Mappe, type Mappentyp } from '../../shared/src/model';
import { postKennung, postVorlageNeu, postWerteMitAlten, postWerteNeu } from '../../shared/src/postfelder';
import { lesefilter, NICHTS, rechteAn, type Regelwerk } from '../../shared/src/rechte';
import { mitAltenPostNamen, openapi } from '../src/api-v1';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { UEBERGAENGE } from '../src/uebergaenge';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000001042';

describe('Post: Kennungen von und an (#1042)', () => {
  it('Systemfelder: von (Text), an (Verweis auf Benutzer), an_adresse (Text); keine alten Kennungen mehr', () => {
    const f = systemfelder('post', 'rolle', 'benutzer');
    const k = (key: string) => f.find((x) => x.key === key);
    assert.equal(k('von')?.typ, 'text');
    assert.equal(k('von')?.label, 'Von');
    assert.equal(k('von')?.beschriftungen?.en?.label, 'From');
    assert.equal(k('an')?.typ, 'referenz');
    assert.deepEqual(k('an')?.zielTypen, ['benutzer']);
    assert.equal(k('an')?.label, 'An');
    assert.equal(k('an')?.beschriftungen?.en?.label, 'To');
    assert.equal(k('an_adresse')?.typ, 'text');
    for (const alt of ['absender', 'fuer']) assert.equal(k(alt), undefined, alt);
  });

  it('Übergang: alte Namen lesen und schreiben, Platzhalter, neue Namen gehen vor', () => {
    assert.deepEqual(postWerteNeu({ absender: 'Stadtwerke', fuer: 'u1', betreff: 'x' }), { von: 'Stadtwerke', an: 'u1', betreff: 'x' });
    assert.deepEqual(postWerteNeu({ absender: 'alt', von: 'neu' }), { von: 'neu' });
    const ohne = { betreff: 'x' };
    assert.equal(postWerteNeu(ohne), ohne, 'ohne alte Namen unverändert');
    assert.deepEqual(postWerteMitAlten({ von: 'Stadtwerke', an: 'u1', an_adresse: null }), { von: 'Stadtwerke', an: 'u1', an_adresse: null, absender: 'Stadtwerke', fuer: 'u1' });
    assert.equal(postVorlageNeu('{betreff} – {absender|gross} für {fuer}, {fuerzeit}'), '{betreff} – {von|gross} für {an}, {fuerzeit}');
    assert.equal(postKennung('fuer'), 'an');
    assert.equal(postKennung('an'), 'an');
    // Eingetragen mit Ablaufdatum (#902).
    assert.ok(UEBERGAENGE.some((u) => u.seit.startsWith('#1042') && u.entfaelltMit === '1.0.0'));
    // OpenAPI nennt den Übergang; der Zähler bleibt, wie er ist.
    const doku = JSON.stringify(openapi('0.241.0'));
    assert.match(doku, /absender und fuer werden beim Schreiben als von und an angenommen/);
    const z = (openapi('0.241.0') as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } }).components.schemas.Zaehlerstand;
    assert.deepEqual(Object.keys(z.properties), ['neuePost', 'zuErledigen', 'ueberfaellig', 'stand', 'geaendert']);
  });

  it('Ausgabe der v1: nur Mappen vom Typ Post bekommen absender und fuer dazu', () => {
    const body = { mappe: { id: 'm', typId: 'post', werte: { von: 'A', an: 'u' } }, bezuege: { x: { typId: 'andere', werte: { von: 'B' } } }, liste: [{ typId: 'post', werte: { betreff: 'b' } }] };
    assert.deepEqual(mitAltenPostNamen(body, 'post'), {
      mappe: { id: 'm', typId: 'post', werte: { von: 'A', an: 'u', absender: 'A', fuer: 'u' } },
      bezuege: { x: { typId: 'andere', werte: { von: 'B' } } },
      liste: [{ typId: 'post', werte: { betreff: 'b' } }],
    });
  });
});

describe('Rechte-Regeln: unbekannte Kennung wirkt geschlossen (#1042)', () => {
  const typ = { id: 't', name: 'T', felder: [{ key: 'privat', label: 'Privat', typ: 'janein' }], register: [], titelVorlage: '', beschreibung: '' } as unknown as Mappentyp;
  const m = { id: 'm1', typId: 't', werte: { privat: false }, erstellt: '', erstelltVon: 'u2', geaendert: '', geaendertVon: null };
  const z = { dokumente: () => 0, verknuepfungen: () => 0 };
  const A = { heute: '2026-11-11', ich: 'u1', meineRollen: [] as string[] };
  const wer = { id: 'u1', rollen: [] };
  const mit = (r: Regelwerk) => ({ ...typ, berechtigungen: r }) as Mappentyp;
  const regel = (nicht: boolean, w: 'erteilen' | 'entziehen') => ({ id: 'r', name: 'r', stopp: false, dann: { R: w }, wenn: [{ art: 'feld' as const, nicht, bedingung: { art: 'feld' as const, feld: 'fuer', op: 'zeigtAuf' as const, wert: { art: 'ich' as const } } }] });

  it('erteilt nie – auch nicht mit „ist nicht“', () => {
    for (const nicht of [false, true]) {
      const t = mit({ grund: NICHTS, regeln: [regel(nicht, 'erteilen')] });
      assert.equal(rechteAn(t, m, wer, A, z).rechte.R, false, `nicht=${nicht}`);
      assert.deepEqual(lesefilter([t], wer, A), { offen: [], je: [] }, `Filter: nie lesbar (nicht=${nicht})`);
    }
  });

  it('entzieht immer – auch mit „ist nicht“', () => {
    for (const nicht of [false, true]) {
      const t = mit({ grund: { ...NICHTS, R: true }, regeln: [regel(nicht, 'entziehen')] });
      assert.equal(rechteAn(t, m, wer, A, z).rechte.R, false, `nicht=${nicht}`);
      assert.deepEqual(lesefilter([t], wer, A), { offen: [], je: [] }, `Filter: nie lesbar (nicht=${nicht})`);
    }
  });

  it('ein bekanntes Feld wirkt wie bisher', () => {
    const t = mit({ grund: NICHTS, regeln: [{ id: 'p', name: 'p', stopp: false, dann: { R: 'erteilen' }, wenn: [{ art: 'feld', nicht: true, bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }] }] });
    assert.equal(rechteAn(t, m, wer, A, z).rechte.R, true);
  });
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, markus.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const post = (await d.mappentypen.listeTypen()).find((t) => t.system === 'post')!;
  const tabelle = routen(d, konten, {});
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) =>
    tabelle.find((r) => r.methode === m && r.pfad === p)!.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: (await konten.listeBenutzer()).find((u) => u.id === b.id)! });
  return { d, konten, markus, lena, post, rufe };
}

describe('Schnittstelle v1 und Platzhalter mit den alten Namen (#1042)', () => {
  it('POST /post und PUT /mappen/{id} nehmen absender/fuer an; Antworten liefern beide Namen; Zähler unverändert', async () => {
    const { d, markus, lena, post, rufe } = await aufbau();
    const angelegt = (await rufe(markus, 'POST', '/api/v1/post', { body: { betreff: 'Brief', absender: 'Stadtwerke', fuer: lena.id } })).body as Mappe;
    assert.equal(angelegt.werte.von, 'Stadtwerke');
    assert.equal(angelegt.werte.an, lena.id);
    assert.equal(angelegt.werte.absender, 'Stadtwerke', 'alter Name in der Antwort');
    assert.equal(angelegt.werte.fuer, lena.id);
    const gespeichert = (await d.mappen.holeMappe(angelegt.id)).mappe;
    assert.deepEqual([gespeichert.werte.von, gespeichert.werte.an, 'absender' in gespeichert.werte, 'fuer' in gespeichert.werte], ['Stadtwerke', lena.id, false, false]);
    // „Post für dich“ entsteht über an.
    assert.deepEqual((await d.meineAufgaben({ id: lena.id, rolle: 'mitglied' })).filter((a) => a.art === 'post').map((a) => a.feldKey), [`an:${lena.id}`]);

    await rufe(markus, 'PUT', '/api/v1/mappen/:id', { params: { id: angelegt.id }, body: { werte: { absender: 'Finanzamt', fuer: markus.id } } });
    const geaendert = (await d.mappen.holeMappe(angelegt.id)).mappe;
    assert.deepEqual([geaendert.werte.von, geaendert.werte.an], ['Finanzamt', markus.id]);
    const v1 = (await rufe(markus, 'GET', '/api/v1/mappen/:id', { params: { id: angelegt.id } })).body as { mappe: Mappe };
    assert.deepEqual([v1.mappe.werte.von, v1.mappe.werte.absender, v1.mappe.werte.an, v1.mappe.werte.fuer], ['Finanzamt', 'Finanzamt', markus.id, markus.id]);
    // Die Oberfläche (/api) bekommt nur die neuen Namen.
    const intern = (await rufe(markus, 'GET', '/api/mappen/:id', { params: { id: angelegt.id } })).body as { mappe: Mappe };
    assert.equal('absender' in intern.mappe.werte, false);

    // Zähler: gleiche Form, „neue Post“ zählt über an.
    const zl = (await rufe(lena, 'GET', '/api/v1/ich/zaehler')).body as Record<string, unknown>;
    assert.deepEqual(Object.keys(zl).sort(), ['geaendert', 'neuePost', 'stand', 'ueberfaellig', 'zuErledigen']);
    assert.equal(zl.neuePost, 0, 'die Post ist jetzt an Markus');
    await d.mappen.aendereMappe(angelegt.id, { werte: { an: lena.id } }, markus.id);
    assert.equal(((await rufe(lena, 'GET', '/api/v1/ich/zaehler')).body as { neuePost: number }).neuePost, 1);
    await d.mappen.aendereMappe(angelegt.id, { werte: { stand: POST_STAND.erledigt } }, markus.id);
    void post;
  });

  it('Platzhalter {absender} und {fuer} in Automatisierungen und Links mit den alten Namen', async () => {
    const { d, markus, lena, post } = await aufbau();
    const m = await d.legePostAn({ betreff: 'Brief', von: 'Stadtwerke', an: lena.id }, { id: markus.id, name: 'Markus' });
    const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
    const z = await d.rechtepruefung.zugriff({ id: markus.id, rolle: 'admin' });
    const text = await motor.fuelle('{absender} an {fuer} – {von} an {an}', { a: { name: 'Test' } as never, mappe: m, typ: post, z, daten: {} });
    assert.equal(text, 'Stadtwerke an Lena – Stadtwerke an Lena');
    // Link über Mappentyp und Feldwerte (#98): absender/fuer gelten als von/an.
    const p = new URLSearchParams(`typ=post&absender=Stadtwerke&fuer.leer=1&sortierung=-absender`);
    const l = liesDirektlink(p, await d.mappentypen.listeTypen());
    assert.ok(l.ok, JSON.stringify(l));
    if (l.ok) {
      assert.deepEqual(l.link.bedingungen.map((b) => (b.art === 'feld' ? [b.feld, b.op] : [])), [['von', 'gleich'], ['an', 'leer']]);
      assert.deepEqual(l.link.sortierung, { spalte: 'von', absteigend: true });
    }
  });
});

/** Die Kennungen zurück auf den Stand vor #1042 (unabhängig von der Migration, nur Text). */
function zurueck<T>(x: T): T {
  if (x === null || x === undefined) return x;
  const s = JSON.stringify(x)
    .replaceAll('"an_adresse"', '"\u0001"').replaceAll('"an"', '"fuer"').replaceAll('"von"', '"absender"').replaceAll('"\u0001"', '"an"')
    .replace(/\{an_adresse(?=[|}])/g, '{\u0002').replace(/\{an(?=[|}])/g, '{fuer').replace(/\{von(?=[|}])/g, '{absender').replaceAll('{\u0002', '{an');
  return JSON.parse(s) as T;
}
const zurueckText = (t: string) => (zurueck({ t }) as { t: string }).t;

describe('Migration 099 (#1042) – PostgreSQL', () => {
  it('zieht absender/fuer/an nach von/an/an_adresse um; Rechte wirken genau wie vorher; wiederholbar', async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const db = await eigeneDatenbank('post_von_an');
    const { sql } = db;
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const { pgEinstellungen } = await import('../src/einstellungen');
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    const neuerDienst = () => new Dienst(pgRepo(sql, HAUSHALT), speicherDateien(), { einstellungen: pgEinstellungen(sql, HAUSHALT) });
    const d = neuerDienst();
    const konten = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas', d.systemtypen.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
    const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, markus.id)).benutzer;
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, markus.id)).benutzer;
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const typen = await d.mappentypen.listeTypen();
    const post = typen.find((t) => t.system === 'post')!;
    const benutzerTyp = typen.find((t) => t.system === 'benutzer')!;
    const ich = { id: markus.id, name: 'Markus' };

    // Heutiger Stand mit allem, was die Kennungen nennt.
    await sql`UPDATE mappentypen SET titel_vorlage = '{betreff} – {von|gross}',
      trefferlisten = ${sql.json([{ key: 'standard', name: 'Standard', spalten: ['datum', 'stand', 'von', 'an', 'an_adresse'], standard: true }])} WHERE id = ${post.id}`;
    const regeln: Regelwerk = { grund: NICHTS, regeln: [
      { id: 'regel-1', name: 'An mich: lesen und bearbeiten', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'an', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false },
      { id: 'regel-2', name: 'Ohne Von nicht bearbeiten', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'von', op: 'leer' } }], dann: { U: 'entziehen' }, stopp: false },
      { id: 'mail', name: 'Versendetes lesen', wenn: [{ art: 'feld', nicht: true, bedingung: { art: 'feld', feld: 'an_adresse', op: 'leer' } }], dann: { R: 'erteilen' }, stopp: false },
    ] };
    await sql`UPDATE mappentypen SET berechtigungen = ${sql.json(regeln as never)} WHERE id = ${post.id}`;
    const p1 = await d.legePostAn({ betreff: 'Strom', von: 'Stadtwerke', an: lena.id }, ich);
    const p2 = await d.legePostAn({ betreff: 'Steuer', an: jonas.id }, ich);
    const p3 = await d.legePostAn({ betreff: 'Antwort', von: 'Markus' }, ich);
    await d.mappen.aendereMappe(p3.id, { werte: { an_adresse: 'info@example.org' } }, markus.id);
    const p4 = await d.legePostAn({ betreff: 'Weg', von: 'Bank', an: lena.id }, ich);
    await d.loescheMappe(p4.id, markus.id);
    const sicht = await d.legeSichtAn({ name: 'Meine Post', beschreibung: '', elternId: null, position: 50, typen: [post.id], bedingungen: [
      { art: 'feld', feld: 'an', op: 'zeigtAuf', wert: { art: 'ich' } }, { art: 'feld', feld: 'von', op: 'nichtLeer' },
    ] });
    const auto = { name: 'Post prüfen', beschreibung: '', reihenfolge: 50, wenn: { art: 'mappe.geaendert', typ: post.id, felder: ['an', 'von'] },
      und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'an_adresse', op: 'leer' } }] },
      dann: [{ id: 'a', art: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'an', sonst: 'ersteller' }], text: 'Post von {von} an {an}', als: 'aufgabe' },
        { id: 'f', art: 'feld', werte: { von: '{von} (geprüft)' } }], sonst: [] };
    const autoId = '00000000-0000-4000-8000-00000000a142';
    await sql`INSERT INTO automatisierungen (id, haushalt_id, name, daten, herkunft) VALUES (${autoId}, ${HAUSHALT}, 'Post prüfen', ${sql.json(auto as never)}, 'eigen')`;
    await sql`INSERT INTO automatisierung_fassungen (automatisierung_id, version, daten) VALUES (${autoId}, 1, ${sql.json(auto as never)})`;
    const benReg = [...benutzerTyp.register, { key: 'post', name: 'Post', art: 'verknuepfungen', quellen: [{ typId: post.id, feldKey: 'an' }] }];
    await sql`UPDATE mappentypen SET register = ${sql.json(benReg as never)} WHERE id = ${benutzerTyp.id}`;

    const bild = async () => ({
      post: (await sql`SELECT felder, register, trefferlisten, titel_vorlage, berechtigungen FROM mappentypen WHERE id = ${post.id}`)[0],
      benutzer: (await sql`SELECT register FROM mappentypen WHERE id = ${benutzerTyp.id}`)[0],
      werte: await sql`SELECT id, werte FROM mappen WHERE typ_id = ${post.id} ORDER BY id`,
      verweise: await sql`SELECT v.quelle_id, v.feld_key, v.ziel_id FROM verweise v JOIN mappen m ON m.id = v.quelle_id WHERE m.typ_id = ${post.id} ORDER BY 1, 2, 3`,
      aufgaben: await sql`SELECT a.id, a.feld_key, a.erledigt FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id WHERE m.typ_id = ${post.id} AND a.art = 'post' ORDER BY a.id`,
      papierkorb: await sql`SELECT mappe -> 'werte' AS werte, verweise, aufgaben FROM papierkorb WHERE typ_id = ${post.id}`,
      sicht: (await sql`SELECT bedingungen FROM sichten WHERE id = ${sicht.id}`)[0],
      auto: (await sql`SELECT daten FROM automatisierungen WHERE id = ${autoId}`)[0],
      fassung: (await sql`SELECT daten FROM automatisierung_fassungen WHERE automatisierung_id = ${autoId}`)[0],
    });
    const rechte = async () => {
      const ergebnis: Record<string, unknown> = {};
      const alle = (await sql`SELECT id FROM mappen WHERE typ_id = ${post.id} ORDER BY id`).map((r) => r.id as string);
      const dd = neuerDienst();
      for (const b of [lena, jonas]) {
        const z = await dd.rechtepruefung.zugriff({ id: b.id, rolle: 'mitglied' });
        const lesbar = await dd.rechtepruefung.lesbare(z, alle);
        for (const id of alle) ergebnis[`${b.email} ${id}`] = { ...(await dd.rechtepruefung.rechteAn(z, (await dd.mappen.holeMappe(id)).mappe)), sql: lesbar.has(id) };
      }
      return ergebnis;
    };
    const vorher = await bild();
    const rechteVorher = await rechte();
    // Lena: p1 (an Lena, mit Von) lesen und bearbeiten; p3 (versendet) nur lesen; p2 nicht.
    const r = (b: { email: string }, id: string) => rechteVorher[`${b.email} ${id}`] as { R: boolean; U: boolean; sql: boolean };
    assert.deepEqual([r(lena, p1.id).R, r(lena, p1.id).U, r(lena, p1.id).sql], [true, true, true]);
    assert.deepEqual([r(lena, p2.id).R, r(lena, p2.id).sql], [false, false]);
    assert.deepEqual([r(lena, p3.id).R, r(lena, p3.id).U, r(lena, p3.id).sql], [true, false, true]);
    assert.deepEqual([r(jonas, p2.id).R, r(jonas, p2.id).U], [true, false], 'ohne Von nicht bearbeiten');

    // Zurück auf den Stand vor #1042 – samt alter Bezeichnungen und einem eigenen Feld „von“ des Administrators.
    const alteLabels: Record<string, [string, string]> = { absender: ['Absender', 'Sender'], fuer: ['Für', 'For'], an: ['Empfänger', 'Recipient'] };
    const felderAlt = (zurueck(vorher.post.felder) as Array<Record<string, unknown>>).map((f) => (alteLabels[f.key as string]
      ? { ...f, label: alteLabels[f.key as string][0], beschriftungen: { en: { label: alteLabels[f.key as string][1] } } } : f));
    felderAlt.push({ key: 'von', label: 'Von (eigen)', typ: 'text' });
    const registerAlt = (zurueck(vorher.post.register) as Array<Record<string, unknown>>).map((x) => (x.key === 'allgemein' ? { ...x, felder: [...(x.felder as string[]), 'von'] } : x));
    await sql`UPDATE mappentypen SET felder = ${sql.json(felderAlt as never)}, register = ${sql.json(registerAlt as never)}, trefferlisten = ${sql.json(zurueck(vorher.post.trefferlisten))},
      titel_vorlage = ${zurueckText(vorher.post.titel_vorlage as string)}, berechtigungen = ${sql.json(zurueck(vorher.post.berechtigungen))} WHERE id = ${post.id}`;
    await sql`UPDATE mappentypen SET register = ${sql.json(zurueck(vorher.benutzer.register))} WHERE id = ${benutzerTyp.id}`;
    for (const w of vorher.werte) await sql`UPDATE mappen SET werte = ${sql.json({ ...zurueck(w.werte), ...(w.id === p1.id ? { von: 'eigener Wert' } : {}) })} WHERE id = ${w.id}`;
    await sql`UPDATE verweise SET feld_key = 'fuer' WHERE feld_key = 'an' AND quelle_id IN (SELECT id FROM mappen WHERE typ_id = ${post.id})`;
    await sql`UPDATE aufgaben SET feld_key = 'fuer:' || substr(feld_key, 4) WHERE art = 'post' AND feld_key LIKE 'an:%'`;
    await sql`UPDATE papierkorb SET mappe = jsonb_set(mappe, '{werte}', ${sql.json(zurueck(vorher.papierkorb[0].werte))}), verweise = ${sql.json(zurueck(vorher.papierkorb[0].verweise))},
      aufgaben = replace(aufgaben::text, '"an:', '"fuer:')::jsonb WHERE typ_id = ${post.id}`;
    await sql`UPDATE sichten SET bedingungen = ${sql.json(zurueck(vorher.sicht.bedingungen))} WHERE id = ${sicht.id}`;
    await sql`UPDATE automatisierungen SET daten = ${sql.json(zurueck(vorher.auto.daten))} WHERE id = ${autoId}`;
    await sql`UPDATE automatisierung_fassungen SET daten = ${sql.json(zurueck(vorher.fassung.daten))} WHERE automatisierung_id = ${autoId}`;
    const altPost = (await sql`SELECT felder FROM mappentypen WHERE id = ${post.id}`)[0].felder as Array<{ key: string; system?: boolean }>;
    assert.ok(altPost.some((f) => f.key === 'fuer' && f.system) && altPost.some((f) => f.key === 'absender' && f.system), 'alter Stand');
    assert.equal((await sql`SELECT count(*)::int AS n FROM aufgaben WHERE feld_key LIKE 'fuer:%'`)[0].n, 2);

    const migration = readFileSync(join(MIGRATIONEN, '099_post_von_an.sql'), 'utf8');
    await sql.begin((tx) => tx.unsafe(migration));
    // Bezeichnungen zieht der Start nach (wandleZuPost).
    await neuerDienst().sichereSystem();
    const nachher = await bild();

    // Das eigene Feld „von“ heißt jetzt von_alt – samt Wert und Platz im Register.
    const felder = nachher.post.felder as Array<{ key: string; label: string; beschriftungen?: { en?: { label?: string } } }>;
    assert.equal(felder.find((f) => f.key === 'von_alt')?.label, 'Von (eigen)');
    assert.ok((nachher.post.register as Array<{ key: string; felder?: string[] }>).find((x) => x.key === 'allgemein')!.felder!.includes('von_alt'));
    assert.equal((nachher.werte.find((w) => w.id === p1.id)!.werte as Record<string, unknown>).von_alt, 'eigener Wert');
    // Alte Bezeichnungen sind die neuen, auch englisch.
    assert.deepEqual(['von', 'an', 'an_adresse'].map((k) => [felder.find((f) => f.key === k)!.label, felder.find((f) => f.key === k)!.beschriftungen?.en?.label]),
      [['Von', 'From'], ['An', 'To'], ['An (Adresse)', 'To (address)']]);
    const ohneAlt = <T extends { werte?: unknown }>(x: T[]) => x.map((w) => ({ ...w, werte: Object.fromEntries(Object.entries(w.werte as Record<string, unknown>).filter(([k]) => k !== 'von_alt')) }));
    assert.deepEqual(felder.filter((f) => f.key !== 'von_alt'), vorher.post.felder);
    assert.deepEqual((nachher.post.register as Array<{ key: string; felder?: string[] }>).map((x) => (x.felder ? { ...x, felder: x.felder.filter((k) => k !== 'von_alt') } : x)), vorher.post.register);
    assert.deepEqual([nachher.post.trefferlisten, nachher.post.titel_vorlage, nachher.post.berechtigungen], [vorher.post.trefferlisten, vorher.post.titel_vorlage, vorher.post.berechtigungen]);
    assert.deepEqual(ohneAlt(nachher.werte), ohneAlt(vorher.werte));
    assert.deepEqual([nachher.benutzer, nachher.verweise, nachher.aufgaben, nachher.papierkorb, nachher.sicht, nachher.auto, nachher.fassung],
      [vorher.benutzer, vorher.verweise, vorher.aufgaben, vorher.papierkorb, vorher.sicht, vorher.auto, vorher.fassung]);
    // Effektive Rechte genau wie vorher – im Arbeitsspeicher und als SQL-Filter.
    assert.deepEqual(await rechte(), rechteVorher);
    // Offene „Post für dich“ bleiben dieselben Aufgaben; ein Speichern legt keine zweite an.
    await neuerDienst().mappen.aendereMappe(p1.id, { werte: { betreff: 'Strom 2026' } }, markus.id);
    assert.deepEqual((await sql`SELECT feld_key FROM aufgaben WHERE mappe_id = ${p1.id} AND art = 'post' AND erledigt IS NULL`).map((x) => x.feld_key), [`an:${lena.id}`]);

    // Wiederholbar: ein zweiter Lauf ändert nichts.
    const zwischen = await bild();
    await sql.begin((tx) => tx.unsafe(migration));
    assert.deepEqual(await bild(), zwischen);
    await db.ende();
  });
});
