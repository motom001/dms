/**
 * Passkeys (#811): Anlegen, Anmelden ohne E-Mail-Adresse, zweiter Faktor, erneute Anmeldung im Verwaltungsmodus,
 * Pflicht je Rolle – mit einem nachgebildeten Authenticator (P-256, Attestation „none“), wie ihn ein Handy oder ein
 * Sicherheitsschlüssel liefert. Geprüft werden auch die Fälle, die ein Angreifer versucht: falscher Origin,
 * wiederverwendete Herausforderung, Zähler rückwärts, ohne Nutzer-Verifizierung, Entfernen ohne frische Anmeldung.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherKurzzustand } from '../src/kurzzustand';
import { Anmeldesperre } from '../src/anmeldesperre';
import { benutzerAusAntwort, Passkeys, relyingParty } from '../src/passkeys';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { ohneGeheimnisse, findeGeheimnisse } from '../src/geheimnis-sperre';
import { totp, ausBase32, Zweifaktor } from '../src/zweifaktor';
import { Authenticator, b64 } from './hilfen-authenticator';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const ADRESSE = 'https://ablago.example.org';
const PW = 'ein-langes-passwort';

/* ---------- Aufbau ---------- */

async function aufbau(o: { adresse?: () => string } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  const zustand = speicherKurzzustand();
  const einstellungen = speicherEinstellungen();
  const sperre = new Anmeldesperre(speicherEinstellungen(), undefined, Date.now, zustand);
  konten.verbindeSperre(sperre);
  konten.verbindeZustand(zustand);
  const pk = new Passkeys(einstellungen, o.adresse ?? (() => ADRESSE), zustand);
  konten.verbindePasskeys(pk);
  const zf = new Zweifaktor(speicherEinstellungen(), (k) => `v:${k}`, (w) => (w.startsWith('v:') ? w.slice(2) : null), Date.now, zustand);
  konten.verbindeZweifaktor(zf);
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const alle = routen(d, konten);
  const route = (m: Route['methode'], p: string) => { const r = alle.find((x) => x.methode === m && x.pfad === p); assert.ok(r, `${m} ${p}`); return r; };
  const koepfe = (n: string) => (n === 'x-dms' ? '1' : undefined);
  /** Anfrage wie über HTTP: erst der Zugang, dann der Handler. */
  const rufe = async (m: Route['methode'], p: string, o2: { sitzung?: string; body?: unknown; params?: Record<string, string>; ip?: string } = {}) => {
    const r = route(m, p);
    const a: Anfrage = { body: o2.body ?? {}, params: o2.params ?? {}, query: {}, ip: o2.ip ?? '1.1.1.1', sitzung: o2.sitzung };
    await pruefeZugang(r, a, koepfe, konten);
    return r.handler(a) as Promise<{ status?: number; body?: unknown; sitzungSetzen?: string | null }>;
  };
  const anmelden = async (ip = '1.1.1.1') => {
    const r = await konten.anmelden({ email: 'lena@example.org', passwort: PW }, ip, '');
    assert.ok('schluessel' in r && r.schluessel);
    return r.schluessel;
  };
  return { d, konten, pk, zf, zustand, einstellungen, lena, rufe, anmelden };
}

/** Passkey über die Routen anlegen, wie die Oberfläche es tut. */
async function anlegen(x: Awaited<ReturnType<typeof aufbau>>, sitzung: string, a = new Authenticator(), name = 'Handy von Lena') {
  const o = (await x.rufe('POST', '/api/konto/passkeys/beginnen', { sitzung })).body as Parameters<Authenticator['anlegen']>[0] & { authenticatorSelection: { userVerification: string } };
  assert.equal(o.authenticatorSelection.userVerification, 'required', 'Nutzer-Verifizierung verlangt');
  const r = await x.rufe('POST', '/api/konto/passkeys', { sitzung, body: { antwort: a.anlegen(o), name } });
  assert.equal(r.status, 201);
  return a;
}

/** Anmelden ohne E-Mail-Adresse: Optionen holen, Gerät antworten lassen. */
async function mitPasskey(x: Awaited<ReturnType<typeof aufbau>>, a: Authenticator, o: { origin?: string; ip?: string; zaehlen?: boolean } = {}) {
  const opt = (await x.rufe('POST', '/api/konto/passkey/optionen', { ip: o.ip })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
  return { opt, antwort: a.anmelden(opt.optionen, o.origin, undefined, o.zaehlen) };
}

describe('Passkeys (#811)', () => {
  it('RP-ID und Origin aus der Adresse – nur über HTTPS mit einem Namen oder auf localhost', () => {
    assert.deepEqual(relyingParty('https://ablago.example.org'), { rpId: 'ablago.example.org', origin: 'https://ablago.example.org', name: 'Ablago' });
    assert.deepEqual(relyingParty('https://Ablago.Example.org:8443/unter'), { rpId: 'ablago.example.org', origin: 'https://ablago.example.org:8443', name: 'Ablago' });
    assert.equal(relyingParty('http://localhost:8080')?.rpId, 'localhost');
    assert.equal(relyingParty('http://nas.home.arpa:8080'), null, 'ohne HTTPS nicht');
    assert.equal(relyingParty('https://192.168.1.20'), null, 'IP-Adresse ist keine RP-ID');
    assert.equal(relyingParty('https://[::1]'), null);
    assert.equal(relyingParty(''), null);
  });

  it('anlegen, mehrere je Person mit Namen, ohne E-Mail-Adresse anmelden', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const handy = await anlegen(x, s);
    const schluessel = await anlegen(x, s, new Authenticator(), '  Sicherheits\nschlüssel  ');
    const liste = ((await x.rufe('GET', '/api/konto/passkeys', { sitzung: s })).body as { liste: Array<{ name: string; passt: boolean; nr: string }>; moeglich: boolean; adresse: string });
    assert.deepEqual(liste.liste.map((p) => p.name), ['Handy von Lena', 'Sicherheits schlüssel']);
    assert.ok(liste.moeglich);
    assert.equal(liste.adresse, 'ablago.example.org');
    assert.ok(liste.liste.every((p) => p.passt));
    // Die Liste enthält nichts vom Schlüssel und nicht die Kennung des Geräts.
    const text = JSON.stringify(liste);
    assert.ok(!text.includes(b64(handy.kennung)) && !text.includes('oeffentlich'));

    // Anmeldung ohne E-Mail-Adresse: das Gerät nennt das Konto.
    const { opt, antwort } = await mitPasskey(x, handy);
    assert.equal(benutzerAusAntwort(antwort), x.lena.id);
    assert.equal((opt.optionen as unknown as { userVerification: string }).userVerification, 'required');
    const r = await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort } });
    assert.ok(r.sitzungSetzen);
    const an = (await x.konten.anmeldungZu(r.sitzungSetzen!))!;
    assert.equal(an.benutzer.id, x.lena.id);
    assert.ok(x.konten.istFrisch(an.sitzung), 'Passkey zählt als Anmeldung mit allen Faktoren');
    // Der zweite funktioniert genauso.
    const z = await mitPasskey(x, schluessel);
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: z.opt.kennung, antwort: z.antwort } })).sitzungSetzen);
    // Derselbe Passkey zweimal: abgelehnt.
    const o = (await x.rufe('POST', '/api/konto/passkeys/beginnen', { sitzung: s })).body as Parameters<Authenticator['anlegen']>[0] & { excludeCredentials: Array<{ id: string }> };
    assert.equal(o.excludeCredentials.length, 2, 'vorhandene stehen in der Ausschlussliste');
    await assert.rejects(x.rufe('POST', '/api/konto/passkeys', { sitzung: s, body: { antwort: handy.anlegen(o) } }), status(409));
    // Umbenennen.
    const nr = liste.liste[1].nr;
    const neu = (await x.rufe('PUT', '/api/konto/passkeys/:nr', { sitzung: s, params: { nr }, body: { name: 'Schlüsselbund' } })).body as Array<{ name: string }>;
    assert.equal(neu[1].name, 'Schlüsselbund');
  });

  it('falscher Origin oder falsche RP-ID: abgelehnt – beim Anlegen und beim Anmelden', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = new Authenticator();
    const o = (await x.rufe('POST', '/api/konto/passkeys/beginnen', { sitzung: s })).body as Parameters<Authenticator['anlegen']>[0];
    await assert.rejects(x.rufe('POST', '/api/konto/passkeys', { sitzung: s, body: { antwort: a.anlegen(o, 'https://ablago.example.org.evil.example') } }), status(422));
    // Die Herausforderung ist verbraucht: Ein zweiter Versuch mit derselben geht nicht.
    await assert.rejects(x.rufe('POST', '/api/konto/passkeys', { sitzung: s, body: { antwort: a.anlegen(o) } }), status(409));
    await anlegen(x, s, a);
    const { opt } = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort: a.anmelden(opt.optionen, 'https://phishing.example') } }), status(401));
    const z = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: z.opt.kennung, antwort: a.anmelden(z.opt.optionen, ADRESSE, 'phishing.example') } }), status(401));
  });

  it('Herausforderung gilt einmal und 5 Minuten', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    const { opt, antwort } = await mitPasskey(x, a);
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort } })).sitzungSetzen);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort: a.anmelden(opt.optionen) } }), status(401), 'zweites Mal');
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: 'erfunden', antwort: a.anmelden(opt.optionen) } }), status(401));
    // Abgelaufen: im Kurzzustand nach 5 Minuten nicht mehr da.
    let t = Date.now();
    const zustand = speicherKurzzustand(() => t);
    const pk = new Passkeys(x.einstellungen, () => ADRESSE, zustand, () => t);
    const o = await pk.beginneAnmeldung('anmelden');
    t += 5 * 60_000 + 1;
    await assert.rejects(pk.pruefeAnmeldung(o.kennung, a.anmelden(o.optionen), { zweck: 'anmelden' }), status(401));
  });

  it('Zähler rückwärts (kopierter Passkey) und ohne Nutzer-Verifizierung: abgelehnt', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    const e = await mitPasskey(x, a);
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: e.opt.kennung, antwort: e.antwort } })).sitzungSetzen);
    // Gleicher Zähler wie eben (Kopie meldet denselben Stand): abgelehnt.
    const z = await mitPasskey(x, a, { zaehlen: false });
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: z.opt.kennung, antwort: z.antwort } }), status(401));
    a.zaehler = 0;
    const r = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: r.opt.kennung, antwort: r.antwort } }), status(401), 'Zähler kleiner');
    a.zaehler = 10;
    a.uv = false;
    const u = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: u.opt.kennung, antwort: u.antwort } }), status(401), 'ohne PIN/Biometrie');
    a.uv = true;
    const ok = await mitPasskey(x, a);
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: ok.opt.kennung, antwort: ok.antwort } })).sitzungSetzen, 'höherer Zähler geht wieder');
  });

  it('Anmeldeschutz gilt auch für Passkey-Versuche', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    for (let i = 0; i < 5; i++) {
      const f = await mitPasskey(x, a, { ip: '9.9.9.9', origin: 'https://phishing.example' });
      await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { ip: '9.9.9.9', body: { kennung: f.opt.kennung, antwort: f.antwort } }), status(401));
    }
    // Sechster Versuch: gesperrt (429) – auch mit richtigem Passkey, und schon beim Holen der Optionen gilt die Sperre für das Konto.
    const g = await mitPasskey(x, a, { ip: '9.9.9.9' });
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { ip: '9.9.9.9', body: { kennung: g.opt.kennung, antwort: g.antwort } }), status(429));
    // Andere Adresse: nicht betroffen.
    const h = await mitPasskey(x, a, { ip: '2.2.2.2' });
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { ip: '2.2.2.2', body: { kennung: h.opt.kennung, antwort: h.antwort } })).sitzungSetzen);
  });

  it('Entfernen nur nach frischer Anmeldung (403)', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    await anlegen(x, s);
    const [p] = ((await x.rufe('GET', '/api/konto/passkeys', { sitzung: s })).body as { liste: Array<{ nr: string }> }).liste;
    x.konten.uhr = () => Date.now() + 11 * 60_000;
    await assert.rejects(x.rufe('DELETE', '/api/konto/passkeys/:nr', { sitzung: s, params: { nr: p.nr } }),
      (e: unknown) => e instanceof Fachfehler && e.status === 403 && (e.details as { frisch?: boolean }).frisch === true);
    // Erneut angemeldet (mit Passwort): geht.
    await x.konten.bestaetigeFrisch(x.lena, s, (await x.konten.anmeldungZu(s))!.sitzung, { passwort: PW }, '1.1.1.1');
    x.konten.uhr = () => Date.now();
    const rest = (await x.rufe('DELETE', '/api/konto/passkeys/:nr', { sitzung: s, params: { nr: p.nr } })).body as unknown[];
    assert.equal(rest.length, 0);
  });

  it('zweiter Faktor: Passkey statt Code; mit Pflicht auch ohne Code-App; der Code-Weg ersetzt ihn dann nicht', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    // Ohne Code-App und ohne Pflicht: Passwort reicht (kein Aussperren bei verlorenem Handy).
    assert.ok('schluessel' in (await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '')));
    // Pflicht für Verwaltende: Passwort, dann Passkey.
    await x.pk.setzePflicht({ admin: true }, 'test');
    const r = await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '');
    assert.ok('zweiterSchritt' in r && r.zweiterSchritt);
    assert.deepEqual(r.wege, { code: false, passkey: true });
    await assert.rejects(x.konten.anmeldenMitCode({ kennung: r.zweiterSchritt, code: '123456' }, '1.1.1.1'), status(401));
    const opt = (await x.rufe('POST', '/api/konto/passkey/optionen', { body: { zweiterSchritt: r.zweiterSchritt } })).body as { kennung: string; optionen: { challenge: string; rpId: string; allowCredentials: Array<{ id: string }> } };
    assert.equal(opt.optionen.allowCredentials.length, 1, 'nur die Passkeys dieser Person');
    // Andere Adresse als beim Passwort: abgelehnt.
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/optionen', { ip: '2.2.2.2', body: { zweiterSchritt: r.zweiterSchritt } }), status(401));
    // Eine Herausforderung ohne zweiten Schritt taugt nicht für den zweiten Schritt.
    const fremd = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: fremd.opt.kennung, antwort: fremd.antwort, zweiterSchritt: r.zweiterSchritt } }), status(401));
    const ok = await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort: a.anmelden(opt.optionen), zweiterSchritt: r.zweiterSchritt } });
    assert.ok(ok.sitzungSetzen);

    // Mit Code-App: beide Wege, der Code bleibt Rückfall.
    await x.pk.setzePflicht({ admin: false }, 'test');
    const { geheimnis } = await x.zf.beginne(x.lena);
    const codes = await x.zf.bestaetige(x.lena.id, totp(ausBase32(geheimnis), Math.floor(Date.now() / 30_000)), 'lena');
    const r2 = await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '');
    assert.ok('zweiterSchritt' in r2);
    assert.deepEqual(r2.wege, { code: true, passkey: true });
    assert.ok((await x.konten.anmeldenMitCode({ kennung: r2.zweiterSchritt, code: codes[0] }, '1.1.1.1')).schluessel, 'Wiederherstellungscode gilt weiter');
  });

  it('Pflicht je Rolle: neue Sitzungen ohne Passkey nur ins eigene Konto; ohne HTTPS sperrt sie niemanden aus', async () => {
    let adresse = ADRESSE;
    const x = await aufbau({ adresse: () => adresse });
    const s = await x.anmelden();
    await new Promise((r) => setTimeout(r, 5));
    await x.pk.setzePflicht({ mitglied: true, admin: true }, 'test');
    await new Promise((r) => setTimeout(r, 5));
    const neu = await x.anmelden();
    await assert.rejects(x.rufe('GET', '/api/typen', { sitzung: neu }), (e: unknown) => e instanceof Fachfehler && e.status === 403 && /Passkey/.test(e.message));
    await x.rufe('GET', '/api/konto/passkeys', { sitzung: neu });
    const st = (await x.rufe('GET', '/api/konto/status', { sitzung: neu })).body as { passkey: { fehlt: boolean; moeglich: boolean } };
    assert.equal(st.passkey.fehlt, true);
    // Die laufende Sitzung arbeitet weiter (#416).
    await x.rufe('GET', '/api/typen', { sitzung: s });
    // Passkey angelegt: alles geht; den letzten darf man nicht entfernen.
    await anlegen(x, neu);
    await x.rufe('GET', '/api/typen', { sitzung: neu });
    const [p] = ((await x.rufe('GET', '/api/konto/passkeys', { sitzung: neu })).body as { liste: Array<{ nr: string }> }).liste;
    await assert.rejects(x.rufe('DELETE', '/api/konto/passkeys/:nr', { sitzung: neu, params: { nr: p.nr } }), status(409));
    // Adresse ohne HTTPS: Passkeys gehen nicht, die Pflicht sperrt dann niemanden aus.
    adresse = 'http://nas.home.arpa:8080';
    assert.equal(await x.pk.lage(x.lena), 'ok');
    assert.ok('schluessel' in (await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '')));
    await assert.rejects(x.rufe('POST', '/api/konto/passkeys/beginnen', { sitzung: neu }), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /HTTPS/.test(e.message));
    const st2 = (await x.rufe('GET', '/api/konto/status', {})).body as { passkey: { moeglich: boolean } };
    assert.deepEqual(st2.passkey, { moeglich: false });
  });

  it('andere Adresse (Domain): vorhandene Passkeys passen nicht mehr', async () => {
    let adresse = ADRESSE;
    const x = await aufbau({ adresse: () => adresse });
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    adresse = 'https://neu.example.org';
    const liste = ((await x.rufe('GET', '/api/konto/passkeys', { sitzung: s })).body as { liste: Array<{ passt: boolean; rpId: string }> }).liste;
    assert.deepEqual(liste.map((p) => [p.passt, p.rpId]), [[false, 'ablago.example.org']]);
    assert.equal(await x.pk.nutzbar(x.lena.id), false);
    const { opt } = await mitPasskey(x, a);
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort: a.anmelden(opt.optionen, ADRESSE, 'ablago.example.org') } }), status(401));
  });

  it('Verwaltungsmodus: erneute Anmeldung mit Passkey, falscher Passkey zählt in den Anmeldeschutz', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    x.konten.uhr = () => Date.now() + 11 * 60_000;
    const sitzung = () => x.konten.anmeldungZu(s).then((r) => r!.sitzung);
    const st = await x.konten.verwaltungsstand(x.lena, await sitzung());
    assert.equal(st.passkey, true);
    await assert.rejects(x.konten.beginneVerwaltung(x.lena, s, await sitzung(), {}, '1.1.1.1'),
      (e: unknown) => e instanceof Fachfehler && e.status === 401 && (e.details as { passkey?: boolean }).passkey === true);
    const o = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    // Eine Herausforderung für die Anmeldung taugt nicht für die Bestätigung.
    const fremd = await mitPasskey(x, a);
    await assert.rejects(x.konten.beginneVerwaltung(x.lena, s, await sitzung(), { passkey: { kennung: fremd.opt.kennung, antwort: fremd.antwort } }, '1.1.1.1'), status(401));
    const stand = await x.konten.beginneVerwaltung(x.lena, s, await sitzung(), { passkey: { kennung: o.kennung, antwort: a.anmelden(o.optionen) } }, '1.1.1.1');
    assert.equal(stand.aktiv, true);
    // Heikle Handlung: ebenso mit Passkey.
    const o2 = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    await x.konten.bestaetigeFrisch(x.lena, s, await sitzung(), { passkey: { kennung: o2.kennung, antwort: a.anmelden(o2.optionen) } }, '1.1.1.1');
  });

  it('Verwaltung setzt Passkeys einer Person zurück; der Notfallzugang ebenso', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    await anlegen(x, s);
    assert.equal(await x.pk.anzahl(x.lena.id), 1);
    assert.equal(await x.pk.entferneAlle(x.lena.id, x.lena.email, 'test'), 1);
    assert.equal(await x.pk.anzahl(x.lena.id), 0);
    await anlegen(x, s);
    const code = await x.konten.neuerNotfallcode();
    const hash = (await x.konten.pruefeNotfallcode(code))!;
    await x.konten.loeseNotfallcodeEin(hash, x.lena.id, 'noch-ein-langes-passwort');
    assert.equal(await x.pk.anzahl(x.lena.id), 0);
  });

  it('nichts Geheimes: gespeicherte Passkeys, Liste und Export überstehen die Geheimnis-Sperre unverändert', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    await anlegen(x, s);
    const roh = await x.einstellungen.lies(`passkeys_${x.lena.id}`);
    // Nur öffentliche Schlüssel: Die Sperre (#1055) findet nichts und ändert nichts.
    assert.deepEqual(ohneGeheimnisse(roh), roh);
    assert.deepEqual(findeGeheimnisse(JSON.stringify(roh), []), []);
    const exp = await x.konten.exportDatenVon(x.lena.id);
    assert.deepEqual(Object.keys(exp.benutzer[0].passkeys[0]).sort(), ['erstellt', 'name', 'zuletzt']);
  });
});
