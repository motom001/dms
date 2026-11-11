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
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { PdfEntsperren } from '../src/entsperren';
import { speicherFassungen } from '../src/dateiumwandlung';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const ADRESSE = 'https://ablago.example.org';
const PW = 'ein-langes-passwort';

/* ---------- Aufbau ---------- */

async function aufbau(o: { adresse?: () => string; gepflegt?: () => string } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  const zustand = speicherKurzzustand();
  const einstellungen = speicherEinstellungen();
  const sperre = new Anmeldesperre(speicherEinstellungen(), undefined, Date.now, zustand);
  konten.verbindeSperre(sperre);
  konten.verbindeZustand(zustand);
  const adresse = o.adresse ?? (() => ADRESSE);
  const pk = new Passkeys(einstellungen, adresse, { zustand, gepflegt: o.gepflegt ?? adresse });
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
    const pk = new Passkeys(x.einstellungen, () => ADRESSE, { zustand, jetzt: () => t });
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

  it('Pflicht je Rolle: neue Sitzungen ohne Passkey nur ins eigene Konto; ohne gepflegte HTTPS-Adresse geschlossen', async () => {
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
    // Gepflegte Adresse weg (ohne HTTPS), Pflicht noch an: geschlossen – nichts wird durchgewunken (Durchsicht Sicherheit).
    adresse = 'http://nas.home.arpa:8080';
    assert.equal(await x.pk.lage(x.lena), 'fehlt');
    await assert.rejects(x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', ''), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /keine gepflegte/.test(e.message));
    // Einschalten geht ohne gepflegte HTTPS-Adresse nicht, ausschalten immer.
    await x.pk.setzePflicht({ admin: false, mitglied: false }, 'test');
    await assert.rejects(x.pk.setzePflicht({ admin: true }, 'test'), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /https/.test(e.message));
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

  it('ein Passkey erfüllt auch die Zwei-Faktor-Pflicht (Entscheidung 11.11.2026)', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    await new Promise((r) => setTimeout(r, 5));
    await x.zf.setzePflicht({ admin: true }, 'test');
    await new Promise((r) => setTimeout(r, 5));
    const neu = await x.anmelden();
    await assert.rejects(x.rufe('GET', '/api/typen', { sitzung: neu }), (e: unknown) => e instanceof Fachfehler && e.status === 403 && /Passkey/.test(e.message));
    // Passkey statt Code-App: Die Pflicht ist erfüllt, alles geht.
    const a = await anlegen(x, neu);
    await x.rufe('GET', '/api/typen', { sitzung: neu });
    assert.equal(await x.zf.lage(x.lena), 'ok');
    const zf = (await x.rufe('GET', '/api/konto/zweifaktor', { sitzung: neu })).body as { pflicht: boolean; passkeyErfuellt: boolean };
    assert.deepEqual([zf.pflicht, zf.passkeyErfuellt], [false, true]);
    // Mit Passwort gehört der Passkey dann als zweiter Schritt dazu – die Pflicht ist kein leeres Versprechen.
    const r = await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '');
    assert.ok('zweiterSchritt' in r);
    assert.deepEqual(r.wege, { code: false, passkey: true });
    const opt = (await x.rufe('POST', '/api/konto/passkey/optionen', { body: { zweiterSchritt: r.zweiterSchritt } })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    assert.ok((await x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: opt.kennung, antwort: a.anmelden(opt.optionen), zweiterSchritt: r.zweiterSchritt } })).sitzungSetzen);
    // Den letzten Passkey nicht entfernen, solange er die Pflicht erfüllt …
    const st = (await x.rufe('GET', '/api/konto/passkeys', { sitzung: neu })).body as { liste: Array<{ nr: string }>; pflicht: string | null };
    assert.equal(st.pflicht, 'zweifaktor');
    await assert.rejects(x.rufe('DELETE', '/api/konto/passkeys/:nr', { sitzung: neu, params: { nr: st.liste[0].nr } }), (e: unknown) => e instanceof Fachfehler && e.status === 409 && /Zwei-Faktor/.test(e.message));
    // … mit Code-App schon; und die Code-App lässt sich abschalten, solange ein Passkey die Pflicht erfüllt.
    const { geheimnis } = await x.zf.beginne(x.lena);
    await x.zf.bestaetige(x.lena.id, totp(ausBase32(geheimnis), Math.floor(Date.now() / 30_000)), 'lena');
    assert.equal(((await x.rufe('GET', '/api/konto/passkeys', { sitzung: neu })).body as { pflicht: string | null }).pflicht, null);
    await x.rufe('POST', '/api/konto/zweifaktor/entfernen', { sitzung: neu, body: { passwort: PW } });
    assert.equal(await x.zf.aktiv(x.lena.id), false);
    // Die laufende Sitzung von vorher war davon nie betroffen (#416).
    await x.rufe('GET', '/api/typen', { sitzung: s });
  });

  it('„Passwörter für Dokumente“ bestätigen mit Passkey – nur mit einer Herausforderung für diesen Zweck', async () => {
    const x = await aufbau();
    const e = new PdfEntsperren(x.d.geschuetztePdfs.entsperrenAnbindung({ ablage: speicherFassungen(), speicher: speicherEinstellungen(), verschluessele: (k) => `v:${k}`, entschluessele: (w) => (w.startsWith('v:') ? w.slice(2) : null) }));
    x.d.geschuetztePdfs.verbindeEntsperren(e);
    const s = await x.anmelden();
    const a = await anlegen(x, s);
    assert.equal(((await x.rufe('GET', '/api/konto/dokument-passwoerter', { sitzung: s })).body as { passkey: boolean }).passkey, true);
    // Eine Herausforderung für den Verwaltungsmodus taugt hier nicht.
    const fremd = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    await assert.rejects(x.rufe('POST', '/api/konto/dokument-passwoerter/bestaetigen', { sitzung: s, body: { passkey: { kennung: fremd.kennung, antwort: a.anmelden(fremd.optionen) } } }), status(403));
    const o = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s, body: { fuer: 'dokumentpasswoerter' } })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    const r = (await x.rufe('POST', '/api/konto/dokument-passwoerter/bestaetigen', { sitzung: s, body: { passkey: { kennung: o.kennung, antwort: a.anmelden(o.optionen) } } })).body as { bestaetigtBis: string };
    assert.ok(Date.parse(r.bestaetigtBis) > Date.now());
    // … und auch nicht umgekehrt: eine für Dokument-Passwörter nicht für den Verwaltungsmodus.
    const o2 = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s, body: { fuer: 'dokumentpasswoerter' } })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    const an = (await x.konten.anmeldungZu(s))!;
    await assert.rejects(x.konten.bestaetigeFrisch(x.lena, s, an.sitzung, { passkey: { kennung: o2.kennung, antwort: a.anmelden(o2.optionen) } }, '1.1.1.1'), status(401));
    // Dieselben Zähler wie die Bestätigung mit Passwort (#956): nach fünf Fehlversuchen 429 – auch mit Passkey.
    for (let i = 0; i < 5; i++) await assert.rejects(x.rufe('POST', '/api/konto/dokument-passwoerter/bestaetigen', { sitzung: s, body: { passkey: { kennung: 'falsch', antwort: {} } } }), status(403));
    const o3 = (await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s, body: { fuer: 'dokumentpasswoerter' } })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
    await assert.rejects(x.rufe('POST', '/api/konto/dokument-passwoerter/bestaetigen', { sitzung: s, body: { passkey: { kennung: o3.kennung, antwort: a.anmelden(o3.optionen) } } }), status(429));
  });

  it('Pflicht gegen die gepflegte Adresse: über eine IP-Adresse oder einen zweiten Namen keine Sitzung ohne Passkey (Durchsicht Sicherheit)', async () => {
    const GEPFLEGT = 'https://ablago.example.org';
    let anfrage = GEPFLEGT;
    let gepflegt = GEPFLEGT;
    // Wie im Betrieb: Die gepflegte Adresse geht der Adresse der Anfrage vor (adresseFuerLinks).
    const x = await aufbau({ adresse: () => gepflegt || anfrage, gepflegt: () => gepflegt });
    const s = await x.anmelden();
    const lena = await anlegen(x, s);
    await x.pk.setzePflicht({ admin: true }, 'test');
    const mitPasswort = () => x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '');
    const zweiter = async (origin: string, rpId?: string, geraet = lena) => {
      const r = await mitPasswort();
      assert.ok('zweiterSchritt' in r, 'ohne Passkey keine Sitzung');
      const o = (await x.rufe('POST', '/api/konto/passkey/optionen', { body: { zweiterSchritt: r.zweiterSchritt } })).body as { kennung: string; optionen: { challenge: string; rpId: string } };
      assert.equal(o.optionen.rpId, 'ablago.example.org', 'die RP kommt immer aus der gepflegten Adresse');
      return x.rufe('POST', '/api/konto/passkey/anmelden', { body: { kennung: o.kennung, antwort: geraet.anmelden(o.optionen, origin, rpId), zweiterSchritt: r.zweiterSchritt } });
    };
    // 1. Über die gepflegte Adresse: Sitzung – nur nach dem Passkey.
    assert.ok((await zweiter(GEPFLEGT)).sitzungSetzen);
    // 2. Über http://IP:Port: zweiter Schritt verlangt, und der Passkey taugt dort nicht.
    anfrage = 'http://192.168.1.20:8080';
    await assert.rejects(zweiter('http://192.168.1.20:8080', '192.168.1.20'), status(401));
    // 3. Über einen zweiten https-Namen: ebenso.
    anfrage = 'https://nas.example.net:5001';
    await assert.rejects(zweiter('https://nas.example.net:5001', 'nas.example.net'), status(401));
    // Ein Angreifer mit Lenas Passwort legt über den zweiten Namen einen eigenen Passkey an: geht nicht – er bekommt keine
    // Sitzung, und selbst mit einer (vor dem ersten Passkey) taugt das Gerät nur unter der gepflegten Adresse.
    const fremd = new Authenticator();
    await assert.rejects(zweiter('https://nas.example.net:5001', 'nas.example.net', fremd), status(401));
    await x.pk.entferneAlle(x.lena.id, x.lena.email, 'test');
    const r = await mitPasswort();
    assert.ok('schluessel' in r && r.schluessel);
    await assert.rejects(x.rufe('GET', '/api/typen', { sitzung: r.schluessel }), status(403));
    const o = (await x.rufe('POST', '/api/konto/passkeys/beginnen', { sitzung: r.schluessel })).body as Parameters<Authenticator['anlegen']>[0];
    await assert.rejects(x.rufe('POST', '/api/konto/passkeys', { sitzung: r.schluessel, body: { antwort: fremd.anlegen(o, 'https://nas.example.net:5001', 'nas.example.net') } }), status(422));
    await assert.rejects(x.rufe('GET', '/api/typen', { sitzung: r.schluessel }), status(403));
    // Ohne gepflegte Adresse lässt sich die Pflicht gar nicht erst einschalten.
    await x.pk.setzePflicht({ admin: false }, 'test');
    gepflegt = '';
    await assert.rejects(x.rufe('PUT', '/api/werkbank/passkeys', { sitzung: r.schluessel, body: { admin: true } }), (e: unknown) => e instanceof Fachfehler && e.status >= 401);
    await assert.rejects(x.pk.setzePflicht({ admin: true }, 'test'), status(409));
  });

  it('ein Passkey erfüllt die Zwei-Faktor-Pflicht nur für die gepflegte Adresse', async () => {
    let gepflegt = ADRESSE;
    const x = await aufbau({ adresse: () => gepflegt || 'https://nas.example.net', gepflegt: () => gepflegt });
    const s = await x.anmelden();
    await anlegen(x, s);
    await x.zf.setzePflicht({ admin: true }, 'test');
    assert.equal(await x.zf.lage(x.lena), 'ok');
    // Ohne gepflegte Adresse zählt der Passkey nicht: Die Code-App ist wieder vorgeschrieben (nach der Anmeldung).
    gepflegt = '';
    assert.equal(await x.zf.lage(x.lena), 'fehlt');
    const r = await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '1.1.1.1', '');
    assert.ok('schluessel' in r && r.schluessel);
    await assert.rejects(x.rufe('GET', '/api/typen', { sitzung: r.schluessel }), status(403));
  });

  it('Herausforderungen fluten: Grenze je Adresse, eine andere bekommt weiter Optionen; zweiter Schritt zählt nicht', async () => {
    const x = await aufbau();
    for (let i = 0; i < 20; i++) await x.rufe('POST', '/api/konto/passkey/optionen', { ip: '203.0.113.7' });
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/optionen', { ip: '203.0.113.7' }), status(429));
    await x.rufe('POST', '/api/konto/passkey/optionen', { ip: '198.51.100.4' });
    // IPv6: dasselbe /64 zählt zusammen, ein anderes nicht.
    for (let i = 0; i < 20; i++) await x.rufe('POST', '/api/konto/passkey/optionen', { ip: `2001:db8:1:2::${i + 1}` });
    await assert.rejects(x.rufe('POST', '/api/konto/passkey/optionen', { ip: '2001:db8:1:2:ffff::1' }), status(429));
    await x.rufe('POST', '/api/konto/passkey/optionen', { ip: '2001:db8:1:3::1' });
    // Zweiter Schritt und Bestätigungen kennen das Konto und zählen nicht mit.
    const s = await x.anmelden('203.0.113.7');
    await anlegen(x, s);
    await x.zf.setzePflicht({ admin: true }, 'test');
    const r = await x.konten.anmelden({ email: 'lena@example.org', passwort: PW }, '203.0.113.7', '');
    assert.ok('zweiterSchritt' in r);
    await x.rufe('POST', '/api/konto/passkey/optionen', { ip: '203.0.113.7', body: { zweiterSchritt: r.zweiterSchritt } });
    await x.rufe('POST', '/api/konto/passkeys/bestaetigen/optionen', { sitzung: s, ip: '203.0.113.7' });
  });

  it('Zurücksetzen von Passkeys und Zwei-Faktor einer Person sind heikle Handlungen', () => {
    assert.equal(heikleHandlung('POST', '/api/benutzer/:id/passkeys/zuruecksetzen', {}), 'anmeldung');
    assert.equal(heikleHandlung('POST', '/api/benutzer/:id/zweifaktor/zuruecksetzen', {}), 'anmeldung');
  });

  it('Zurücksetzen ohne frische Anmeldung: 403 mit details.frisch – für Passkeys und Zwei-Faktor', async () => {
    const x = await aufbau();
    const s = await x.anmelden();
    const { benutzer: jonas } = await x.konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, x.lena.id);
    await x.konten.beginneVerwaltung(x.lena, s, (await x.konten.anmeldungZu(s))!.sitzung, {}, '1.1.1.1');
    // Verwaltungsmodus läuft, aber die Anmeldung liegt mehr als 10 Minuten zurück.
    const spaeter = Date.now() + 11 * 60_000;
    x.konten.uhr = () => spaeter;
    await x.konten.modusPruefen(x.lena, s, (await x.konten.anmeldungZu(s))!.sitzung, true);
    for (const pfad of ['/api/benutzer/:id/passkeys/zuruecksetzen', '/api/benutzer/:id/zweifaktor/zuruecksetzen']) {
      await assert.rejects(x.rufe('POST', pfad, { sitzung: s, params: { id: jonas.id } }),
        (e: unknown) => e instanceof Fachfehler && e.status === 403 && (e.details as { frisch?: boolean; handlung?: string }).handlung === 'anmeldung', pfad);
    }
  });
});
