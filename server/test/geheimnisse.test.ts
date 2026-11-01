/**
 * Verschlüsselung (#410): alle verschlüsselten Geheimnisse zählen und beim Schlüsselwechsel mitnehmen –
 * Passwortfelder, Papierkorb, Mailserver, Postfächer (IMAP, OAuth-App, OAuth-Anmeldung), OIDC,
 * Zwei-Faktor und Paket-Geheimnisse. Der PostgreSQL-Teil läuft nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { artVon, bestandAus, GEHEIM_ARTEN, verschluesselteIn, type Fundstelle } from '../src/geheimnisse';

const g = (n: number | string) => `dms1$geheim-${n}`;

describe('Geheimnisse je Art (#410)', () => {
  it('ordnet jede Fundstelle einer Art zu; Unbekanntes landet bei „Weitere Einstellungen“', () => {
    const e = (schluessel: string) => artVon({ quelle: 'einstellung', schluessel });
    assert.equal(artVon({ quelle: 'mappe', schluessel: 'x' }), 'passwortfeld');
    assert.equal(artVon({ quelle: 'papierkorb', schluessel: 'x' }), 'papierkorb');
    assert.equal(e('mail'), 'mail');
    assert.equal(e('postfaecher'), 'postfach');
    assert.equal(e('postfach_oauth_apps'), 'postfach_oauth_app');
    assert.equal(e('postfach_oauth_123'), 'postfach_oauth');
    assert.equal(e('oidc'), 'oidc');
    assert.equal(e('zweifaktor_abc'), 'zweifaktor');
    assert.equal(e('zweifaktor_pflicht'), 'sonstige', 'Pflicht ist kein Geheimnis');
    assert.equal(e('paket:rechnungen'), 'paket');
    assert.equal(e('pruefwort'), 'pruefwort');
    assert.equal(e('irgendwas_neues'), 'sonstige');
  });

  it('findet verschlüsselte Werte auch tief in Listen', () => {
    assert.deepEqual(verschluesselteIn({ a: [{ pw: g(1) }, { pw: '' }], b: g(2), c: 'klar' }), [{ pfad: ['a', 0, 'pw'], wert: g(1) }, { pfad: ['b'], wert: g(2) }]);
  });

  it('zählt je Art, listet nicht lesbare mit Namen und Ort, Prüfwort intern', () => {
    const funde: Fundstelle[] = [
      { quelle: 'mappe', schluessel: 'm1', wert: { pw: g(1), name: 'Bank' }, titel: 'Bank' },
      { quelle: 'papierkorb', schluessel: 'm2', wert: { werte: { pw: g('alt') } }, titel: 'Alt' },
      { quelle: 'einstellung', schluessel: 'mail', wert: { passwort: g(3) } },
      { quelle: 'einstellung', schluessel: 'postfaecher', wert: [{ id: 'p1', name: 'Privat', passwort: g('kaputt') }, { id: 'p2', name: 'Büro', passwort: '' }] },
      { quelle: 'einstellung', schluessel: 'postfach_oauth_apps', wert: { google: { clientId: 'x', clientSecret: g(5) } } },
      { quelle: 'einstellung', schluessel: 'postfach_oauth_p2', wert: { zugriff: g(6), aktualisierung: g(7) } },
      { quelle: 'einstellung', schluessel: 'oidc', wert: { clientSecret: g(8) } },
      { quelle: 'einstellung', schluessel: 'zweifaktor_u1', wert: { geheimnis: g('kaputt-2') }, titel: 'Anna' },
      { quelle: 'einstellung', schluessel: 'paket:konten', wert: { werte: { token: g(9) } } },
      { quelle: 'einstellung', schluessel: 'pruefwort', wert: g('kaputt-3') },
    ];
    const lesbar = (v: string) => !v.includes('kaputt') && !v.includes('alt');
    const b = bestandAus(funde, lesbar, new Set(['passwortfeld', 'mail']));
    const je = Object.fromEntries(b.arten.map((a) => [a.art, [a.anzahl, a.unlesbar]]));
    assert.deepEqual(je, {
      passwortfeld: [1, 0], papierkorb: [1, 1], mail: [1, 0], postfach: [1, 1], postfach_oauth_app: [1, 0],
      postfach_oauth: [2, 0], oidc: [1, 0], zweifaktor: [1, 1], paket: [1, 0],
    });
    assert.ok(!b.arten.some((a) => a.art === 'pruefwort' || a.art === 'sonstige'), 'Prüfwort intern, „Weitere“ nur mit Funden');
    assert.deepEqual(b.betroffen.map((x) => x.was), ['Alt: pw', 'Postfach „Privat“: Passwort', 'Zwei-Faktor-Anmeldung von Anna']);
    assert.equal(b.betroffen[1].wo, GEHEIM_ARTEN.postfach.wo);
    // Ohne Funde: alle bekannten Arten mit 0.
    assert.equal(bestandAus([], () => true).arten.length, Object.keys(GEHEIM_ARTEN).length - 2);
    assert.deepEqual(bestandAus([{ quelle: 'einstellung', schluessel: 'neu', wert: g(1) }], () => true).arten.at(-1), { art: 'sonstige', name: 'Weitere Einstellungen', anzahl: 1, unlesbar: 0 });
  });
});

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';

describe('Schlüssel wechseln mit allen Geheimnissen in PostgreSQL (#410)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haupt: any; let sql: any;
  const db = `dms_geheim_${process.pid}`;
  const urlVon = (name: string) => { const u = new URL(url!); u.pathname = `/${name}`; return u.toString(); };

  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`); await haupt.unsafe(`CREATE DATABASE ${db}`);
    sql = verbinde(urlVon(db));
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  });
  after(async () => { await sql?.end(); await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {}); await haupt?.end(); });

  /** Jeder Wert „dms1$…“ in jeder Tabelle und Spalte der Datenbank – unabhängig davon, wer ihn schreibt. */
  async function alleGeheimnisse(): Promise<Array<{ wo: string; wert: string }>> {
    const spalten = await sql`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'jsonb', 'json', 'character varying')`;
    const out: Array<{ wo: string; wert: string }> = [];
    for (const s of spalten) {
      const rows = await sql.unsafe(`SELECT "${s.column_name}"::text AS t FROM "${s.table_name}" WHERE "${s.column_name}"::text LIKE '%dms1$%'`);
      for (const r of rows) for (const m of String(r.t).matchAll(/dms1\$[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g)) out.push({ wo: `${s.table_name}.${s.column_name}`, wert: m[0] });
    }
    return out;
  }

  it('zählt jede Art, schlüsselt alle Werte jeder Tabelle um und alles bleibt lesbar', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { Dienst } = await import('../src/dienst');
    const { Tresor, entschluesseleMit, schluesselAusText } = await import('../src/tresor');
    const { Betrieb } = await import('../src/betrieb');
    const { Oidc } = await import('../src/oidc');
    const { PostfachOAuth } = await import('../src/postfach-oauth');
    const { pruefePostfach } = await import('../src/postfach');
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-geheim-'));
    const einst = pgEinstellungen(sql, HAUSHALT);
    const tresor = new Tresor(einst, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    const v = (k: string) => tresor.verschluessele(k);
    const e = (w: string) => tresor.entschluessele(w);
    const dienst = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { tresor, einstellungen: einst });
    const betrieb = new Betrieb(einst, 'http://nas', tresor);
    await betrieb.laden();

    // Passwortfeld in einer Mappe und im Papierkorb.
    const typ = await dienst.legeTypAn({ name: 'Zugang', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'pw', label: 'Kennwort', typ: 'passwort' }] });
    const m1 = await dienst.legeMappeAn({ typId: typ.id, werte: { name: 'Bank', pw: { neu: 'bank-geheim' } } });
    const m2 = await dienst.legeMappeAn({ typId: typ.id, werte: { name: 'Alt', pw: { neu: 'weg-geheim' } } });
    await einst.schreibe('papierkorb', { tage: 30 });
    await dienst.loescheMappe(m2.id);
    // Mailserver.
    await betrieb.speichereMail({ aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'dms', passwort: 'mail-geheim', absender: 'dms@example.org' });
    // Postfach mit IMAP-Passwort (wie Postfaecher.speichere) und eines mit OAuth-Anmeldung.
    const p1 = pruefePostfach({ name: 'Privat', server: 'imap.example.org', port: 993, verschluesselung: 'ssl', benutzer: 'ich', passwort: 'imap-geheim' }, null, v);
    const p2 = pruefePostfach({ name: 'Büro', anmeldung: 'oauth', anbieter: 'google', server: 'imap.gmail.com', port: 993, verschluesselung: 'ssl', benutzer: 'ich@gmail.com' }, null, v);
    await einst.schreibe('postfaecher', [p1, p2]);
    const oauth = new PostfachOAuth({ einstellungen: einst, verschluessele: v, entschluessele: e, anAdmins: async () => {} });
    await oauth.speichereApp('google', { clientId: 'app-id', clientSecret: 'app-geheim' }, 'admin');
    await einst.schreibe(`postfach_oauth_${p2.id}`, { anbieter: 'google', zugriff: v('zugriff-geheim'), aktualisierung: v('aktualisierung-geheim'), ablauf: new Date().toISOString(), fehler: null });
    // Anmeldung über einen Anbieter (OIDC).
    const oidc = new Oidc({ einstellungen: einst, verschluessele: v, entschluessele: e });
    await oidc.speichere({ aussteller: '', clientId: 'dms', clientSecret: 'oidc-geheim' }, 'admin');
    // Zwei-Faktor am Benutzerkonto (wie Zweifaktor.bestaetige).
    const [anna] = await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (gen_random_uuid(), ${HAUSHALT}, 'anna@example.org', 'Anna', 'admin') RETURNING id`;
    await einst.schreibe(`zweifaktor_${anna.id}`, { geheimnis: v('JBSWY3DPEHPK3PXP'), seit: new Date().toISOString(), letzterSchritt: 0, codes: [] });
    // Paket-Einstellung vom Typ Geheimnis.
    await dienst.setzePaketEinstellungen('konten', { werte: { token: dienst.verschluesselePaketGeheimnis('paket-geheim'), liste: [{ id: 'e1', pw: dienst.verschluesselePaketGeheimnis('listen-geheim') }] } });

    // (a) Bestand: jede Art mit ihrer Anzahl, nichts unbekannt, nichts unlesbar.
    const vorher = await tresor.status();
    const je = Object.fromEntries(vorher.arten.map((a) => [a.art, a.anzahl]));
    assert.deepEqual(je, { passwortfeld: 1, papierkorb: 1, mail: 1, postfach: 1, postfach_oauth_app: 1, postfach_oauth: 2, oidc: 1, zweifaktor: 1, paket: 2 });
    assert.deepEqual(vorher.betroffen, []);
    const alleVorher = await alleGeheimnisse();
    const gezaehlt = vorher.arten.reduce((n, a) => n + a.anzahl, 0) + 1; // + Prüfwort
    assert.equal(alleVorher.length, gezaehlt, `jeder verschlüsselte Wert der Datenbank ist gezählt: ${alleVorher.map((x) => x.wo).join(', ')}`);

    // (b) Wechsel: alles umgeschlüsselt – kein Wert in irgendeiner Tabelle bleibt mit dem alten Schlüssel.
    const alt = schluesselAusText(tresor.alsText()!)!;
    const w = await dienst.schluesselWechseln('admin@example.org');
    assert.equal(w.umgeschluesselt, gezaehlt - 1, 'alle außer dem Prüfwort (das wird neu gesetzt)');
    assert.equal(w.unlesbar, 0);
    const nachher = await alleGeheimnisse();
    assert.equal(nachher.length, alleVorher.length);
    for (const x of nachher) {
      assert.notEqual(e(x.wert), null, `${x.wo} mit dem neuen Schlüssel lesbar`);
      assert.equal(entschluesseleMit(alt, x.wert), null, `${x.wo} nicht mehr mit dem alten Schlüssel`);
    }
    const danach = await tresor.status();
    assert.deepEqual(danach.betroffen, []);
    assert.deepEqual(danach.arten.map((a) => a.unlesbar).filter(Boolean), []);

    // Und die Bereiche lesen ihre Werte wie vorher.
    assert.equal((await dienst.zeigePasswort(m1.id, 'pw')).wert, 'bank-geheim');
    assert.equal(e(((await einst.lies('mail')) as { passwort: string }).passwort), 'mail-geheim');
    assert.ok(betrieb.ansicht().mail.passwortLesbar);
    assert.equal(e(((await einst.lies('postfaecher')) as Array<{ passwort: string }>)[0].passwort), 'imap-geheim');
    assert.equal(e((await oauth.apps()).google!.clientSecret), 'app-geheim');
    assert.equal(e(((await oauth.token(p2.id)) as { zugriff: string }).zugriff), 'zugriff-geheim');
    oidc.vergiss();
    assert.equal(e((await oidc.einstellung()).clientSecret), 'oidc-geheim');
    assert.equal(e(((await einst.lies(`zweifaktor_${anna.id}`)) as { geheimnis: string }).geheimnis), 'JBSWY3DPEHPK3PXP');
    const paket = (await dienst.paketEinstellungen('konten'))!.werte as { token: string; liste: Array<{ pw: string }> };
    assert.equal(e(paket.token), 'paket-geheim');
    assert.equal(e(paket.liste[0].pw), 'listen-geheim');
    await dienst.stelleWiederHer(m2.id, { id: 'x', rolle: 'admin' }, true);
    assert.equal((await dienst.zeigePasswort(m2.id, 'pw')).wert, 'weg-geheim');
  });

  it('meldet nicht lesbare Postfach- und Zwei-Faktor-Werte mit Namen', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { Dienst } = await import('../src/dienst');
    const { Tresor } = await import('../src/tresor');
    const einst = pgEinstellungen(sql, HAUSHALT);
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-geheim-'));
    // Neuer Schlüssel an anderer Stelle: alles aus dem ersten Test ist damit nicht lesbar.
    await einst.schreibe('tresor', null);
    const tresor = new Tresor(einst, join(wurzel, 'geheim', 'dms.schluessel'), () => null);
    await tresor.laden(); await tresor.erzeuge();
    new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(join(wurzel, 'files'), HAUSHALT), { tresor, einstellungen: einst });
    const st = await tresor.status();
    const was = st.betroffen.map((b) => b.was);
    assert.ok(was.includes('Postfach „Privat“: Passwort'), was.join(' | '));
    assert.ok(was.includes('Zwei-Faktor-Anmeldung von Anna'), was.join(' | '));
    assert.ok(was.includes('Client-Secret des Anbieters'));
    assert.equal(st.arten.find((a) => a.art === 'postfach')?.unlesbar, 1);
  });
});
