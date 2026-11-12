/**
 * Dann-Karten nach außen (#671): „URL aufrufen“ und „E-Mail senden“ – Ziele nach außen, SSRF-Schutz (Weiterleitungen,
 * aufgelöste Adressen, Zeitlimit, Größe der Antwort), Inhaltsstufen technisch durchgesetzt, Signatur, Ausgangskorb mit
 * Wiederholung und Anhalten nach Dauerfehlern, E-Mail mit Empfängerrechten, Hinweissatz und Bremse, Pakete ohne diese
 * Karten, Geheimnis-Art und heikle Handlungen. Ziele sind ein lokaler HTTP-Server auf 127.0.0.1; Personen erfunden.
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import {
  automatisierungsProbleme, bereinigeAutomatisierung, bereinigeZiele, kurzform, platzhalterErlaubt, urlProbleme, zielFuer, zielProblem,
  type AussenZiel, type DannUrl,
} from '../../shared/src/automatisierung';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import {
  adressArt, adresseErlaubt, aussenSignatur, sichererAbruf, signierterInhalt, speicherAusgangRepo, speicherAussenGeheimnisRepo, type AbrufAuftrag, type AbrufErgebnis,
} from '../src/automatisierung/index';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { artVon, bestandAus } from '../src/geheimnisse';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Mailer } from '../src/mail';
import { notfallblattPlan, zieleZeile } from '../src/notfallblatt';
import { liesPaket, liesZip } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { zipPuffer } from '../src/zip';

const verschluessele = (k: string) => `dms1$${Buffer.from(k).toString('base64url')}`;
const entschluessele = (w: string) => (w.startsWith('dms1$') ? Buffer.from(w.slice(5), 'base64url').toString() : null);

/* ---------- Lokaler Empfänger (127.0.0.1) ---------- */

interface Empfangen { methode: string; pfad: string; koepfe: IncomingMessage['headers']; rumpf: string }
let server: Server;
let basis = '';
const empfangen: Empfangen[] = [];
before(async () => {
  server = createServer((req, res) => {
    let rumpf = '';
    req.on('data', (s: Buffer) => { rumpf += s.toString(); });
    req.on('end', () => {
      empfangen.push({ methode: req.method ?? '', pfad: req.url ?? '', koepfe: req.headers, rumpf });
      const u = req.url ?? '';
      if (u.startsWith('/weiter')) { res.writeHead(302, { location: `${basis}/ziel-der-weiterleitung` }); res.end(); return; }
      if (u.startsWith('/kaputt')) { res.writeHead(500); res.end('nein'); return; }
      if (u.startsWith('/fehlt')) { res.writeHead(404); res.end(); return; }
      if (u.startsWith('/haengt')) return; // antwortet nie
      if (u.startsWith('/gross')) { res.writeHead(200); res.end(Buffer.alloc(300 * 1024, 120)); return; }
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });

async function aufbau(o: { uhr?: () => number; abruf?: (a: AbrufAuftrag) => Promise<AbrufErgebnis>; mailer?: Mailer | null } = {}) {
  const einst = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'betrag', label: 'Betrag', typ: 'text' },
    { key: 'kontakt', label: 'Kontakt', typ: 'text', format: 'email' },
    { key: 'pin', label: 'PIN', typ: 'passwort' },
    { key: 'notiz', label: 'Notiz', typ: 'text' },
  ] });
  const repo = speicherAusgangRepo();
  const gesendet: Array<{ an: string; betreff: string; text: string }> = [];
  const mailer: Mailer | null = o.mailer === undefined ? { async sende(an, betreff, text) { gesendet.push({ an, betreff, text }); } } : o.mailer;
  const autoRepo = speicherAutomatisierungRepo(o.uhr);
  const motor = new Automatisierungen({ dienst: d, repo: autoRepo, uhr: o.uhr,
    aussen: { repo, geheimnisse: speicherAussenGeheimnisRepo(), verschluessele, entschluessele, mailer: () => mailer, basis: () => 'https://ablago.example.org', abruf: o.abruf } });
  return { d, konten, markus, vertrag, motor, repo, gesendet, einst, autoRepo };
}

/* ---------- Modell ---------- */

describe('Nach außen (#671): Ziele und Karten im Modell', () => {
  it('Ziele: https Pflicht, Heimnetz nur ausdrücklich, ohne Zugangsdaten und Abfrage; Präfix über new URL()', () => {
    assert.equal(zielProblem('https://hooks.example.org/ablago', false), null);
    assert.match(zielProblem('http://hooks.example.org/', false)!, /https/);
    assert.match(zielProblem('http://homeassistant.local:8123/api/webhook', false)!, /Heimnetz/);
    assert.equal(zielProblem('http://homeassistant.local:8123/api/webhook', true), null);
    assert.match(zielProblem('https://hooks.example.org/', true)!, /nur für Adressen im Heimnetz/);
    assert.match(zielProblem('https://lena:geheim@hooks.example.org/', false)!, /Passwort/);
    assert.match(zielProblem('https://hooks.example.org/?a=1', false)!, /ohne \?/);
    assert.match(zielProblem('ftp://hooks.example.org/', false)!, /https/);
    const { ziele, fehler } = bereinigeZiele([{ adresse: 'https://HOOKS.example.org/ablago' }, { adresse: 'https://hooks.example.org/ablago' }, 'http://x.example.org', { adresse: 'http://ha.home.arpa:8123', heimnetz: true }]);
    assert.deepEqual(ziele.map((z) => z.adresse), ['https://hooks.example.org/ablago', 'http://ha.home.arpa:8123/']);
    assert.equal(fehler.length, 1);
    const z: AussenZiel[] = ziele;
    assert.ok(zielFuer('https://hooks.example.org/ablago/neu?x=1', z));
    assert.ok(zielFuer('https://hooks.example.org/ablago', z));
    assert.equal(zielFuer('https://hooks.example.org/ablagox', z), null, 'nur an einer Pfadgrenze');
    assert.equal(zielFuer('https://hooks.example.org.boese.example.net/ablago', z), null, 'anderer Rechner');
    assert.equal(zielFuer('https://hooks.example.org:8443/ablago', z), null, 'anderer Port');
    assert.equal(zielFuer('http://hooks.example.org/ablago', z), null, 'http nur bei Heimnetz-Zielen');
    assert.equal(zielFuer('https://x@hooks.example.org/ablago', z), null, 'nie mit Zugangsdaten');
    assert.ok(zielFuer('http://ha.home.arpa:8123/api/webhook/abc', z));
  });

  it('URL-Karte: bereinigt, Probleme (Ziel, Werte nur POST mit Bestätigung, Platzhalter je Stufe), Kurzform', async () => {
    const { d, vertrag } = await aufbau();
    const k = { ...(await d.automatisierungshilfen.automatisierungKontext()), ziele: bereinigeZiele([{ adresse: 'https://hooks.example.org/ablago' }]).ziele };
    const a = bereinigeAutomatisierung({ name: 'Melden', wenn: { art: 'mappe.geaendert', typ: vertrag.id }, dann: [{ id: 'u', art: 'url', adresse: 'https://hooks.example.org/ablago/vertrag', methode: 'PUT', inhalt: 'gibts',
      parameter: [{ name: 'Art', wert: 'vertrag' }, { name: 'art', wert: 'doppelt' }, { name: '1x', wert: 'nein' }, { name: 'betrag', wert: '{betrag}' }], bestaetigt: true }] });
    const u = a.dann[0] as DannUrl;
    assert.equal(u.methode, 'POST', 'nur GET oder POST');
    assert.equal(u.inhalt, 'meldung');
    assert.equal(u.bestaetigt, undefined, 'Bestätigung nur bei „Mit Werten“');
    assert.deepEqual(u.parameter.map((p) => p.name), ['art', 'betrag']);
    assert.match(automatisierungsProbleme(a, k).join(' '), /\{betrag\} gibt Inhalte weiter/);
    assert.equal(kurzform(a, k), 'Wenn Vertrag gespeichert → POST an hooks.example.org');
    const werte = { ...u, inhalt: 'werte' as const };
    assert.match(urlProbleme(werte, a.wenn, k.ziele).join(' '), /bestätigen/);
    assert.match(urlProbleme({ ...werte, methode: 'GET', bestaetigt: true }, a.wenn, k.ziele).join(' '), /nur mit POST/);
    assert.deepEqual(urlProbleme({ ...werte, bestaetigt: true }, a.wenn, k.ziele), []);
    assert.match(urlProbleme({ ...u, adresse: 'https://andere.example.org/x' }, a.wenn, k.ziele).join(' '), /kein freigegebenes Ziel/);
    assert.match(urlProbleme({ ...u, adresse: 'https://hooks.example.org/ablago/{titel}' }, a.wenn, k.ziele).join(' '), /nicht in der Adresse/);
    assert.ok(platzhalterErlaubt('heute', 'meldung', a.wenn) && !platzhalterErlaubt('titel', 'kennungen', a.wenn) && platzhalterErlaubt('titel', 'werte', a.wenn));
    assert.ok(platzhalterErlaubt('raum', 'meldung', { art: 'aufruf', parameter: ['raum'] }), 'Parameter eines Aufrufs von außen sind kein Inhalt der Ablage');
  });

  it('E-Mail-Karte: An frei (Adressen, E-Mail-Felder), ohne Mappe nur Personen, Rollen und Adressen', async () => {
    const { d, vertrag, markus } = await aufbau();
    const k = await d.automatisierungshilfen.automatisierungKontext();
    const mail = (an: unknown[], wenn: unknown = { art: 'mappe.angelegt', typ: vertrag.id }) => bereinigeAutomatisierung({ name: 'Mail', wenn, dann: [{ id: 'm', art: 'email', an, betreff: 'Neu: {titel}\nBcc: x', text: 'Hallo' }] });
    const ok = mail([{ art: 'person', id: markus.id }, { art: 'adresse', adresse: 'jonas@example.org' }, { art: 'feld', feld: 'kontakt' }]);
    assert.deepEqual(automatisierungsProbleme(ok, k), []);
    assert.equal((ok.dann[0] as { betreff: string }).betreff, 'Neu: {titel} Bcc: x', 'Betreff eine Zeile');
    assert.match(kurzform(ok, k), /E-Mail an Markus, j\*\*\*@example\.org, Kontakt/);
    assert.match(automatisierungsProbleme(mail([{ art: 'adresse', adresse: 'keine-adresse' }]), k).join(), /keine gültige E-Mail-Adresse/);
    assert.match(automatisierungsProbleme(mail([{ art: 'feld', feld: 'notiz' }]), k).join(), /verweist nicht auf Benutzer/);
    assert.match(automatisierungsProbleme(mail([{ art: 'ersteller' }], { art: 'aufruf', parameter: [] }), k).join(), /Ohne Mappe/);
    assert.match(automatisierungsProbleme(mail([]), k).join(), /mindestens einen Empfänger/);
  });
});

/* ---------- SSRF-Schutz ---------- */

describe('Nach außen (#671): sicherer Abruf (SSRF)', () => {
  it('Adressen: öffentlich ja, Heimnetz nur ausdrücklich, Metadaten und Sonderadressen nie – auch als IPv4 in IPv6', () => {
    for (const ip of ['93.184.216.34', '2606:4700::1111']) assert.equal(adressArt(ip), 'oeffentlich', ip);
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.178.1', '169.254.10.10', '100.64.0.1', '::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::10.0.0.1']) assert.equal(adressArt(ip), 'heimnetz', ip);
    for (const ip of ['169.254.169.254', '::ffff:169.254.169.254', 'fd00:ec2::254', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::', 'kein-ip']) assert.equal(adressArt(ip), 'nie', ip);
    assert.ok(!adresseErlaubt('192.168.178.1', false) && adresseErlaubt('192.168.178.1', true) && !adresseErlaubt('169.254.169.254', true));
  });

  it('Loopback ohne Heimnetz-Ziel gesperrt (dauerhaft), mit Heimnetz-Ziel erreicht', async () => {
    const vorher = empfangen.length;
    const nein = await sichererAbruf({ adresse: `${basis}/ok`, methode: 'GET', koepfe: {}, heimnetz: false });
    assert.equal(nein.ok, false); assert.equal(nein.dauerhaft, true);
    const gesperrt = await sichererAbruf({ adresse: `https://127.0.0.1:${new URL(basis).port}/ok`, methode: 'GET', koepfe: {}, heimnetz: false });
    assert.match(gesperrt.fehler!, /SSRF/);
    assert.equal(empfangen.length, vorher, 'nichts kam an');
    const ja = await sichererAbruf({ adresse: `${basis}/ok`, methode: 'POST', koepfe: { 'content-type': 'application/json' }, rumpf: Buffer.from('{}'), heimnetz: true });
    assert.equal(ja.ok, true, ja.fehler ?? '');
    assert.equal(empfangen.at(-1)?.methode, 'POST');
  });

  it('DNS wird beim Verbinden geprüft: Name auf Metadaten-Adresse oder gemischt öffentlich/privat gesperrt', async () => {
    const port = new URL(basis).port;
    const aufloesen = (ips: string[]) => (_h: string, cb: (e: Error | null, a: Array<{ address: string; family: number }>) => void) => cb(null, ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
    const meta = await sichererAbruf({ adresse: `http://ha.home.arpa:${port}/ok`, methode: 'GET', koepfe: {}, heimnetz: true }, { aufloesen: aufloesen(['169.254.169.254']) });
    assert.match(meta.fehler!, /SSRF/); assert.equal(meta.dauerhaft, true);
    const gemischt = await sichererAbruf({ adresse: `https://hooks.example.org:${port}/ok`, methode: 'GET', koepfe: {}, heimnetz: false }, { aufloesen: aufloesen(['93.184.216.34', '127.0.0.1']) });
    assert.match(gemischt.fehler!, /SSRF/);
    // Der Name zeigt auf 127.0.0.1 und das Ziel ist ausdrücklich im Heimnetz: Ablago verbindet sich mit genau dieser Adresse.
    const vorher = empfangen.length;
    const heim = await sichererAbruf({ adresse: `http://ha.home.arpa:${port}/ok`, methode: 'GET', koepfe: {}, heimnetz: true }, { aufloesen: aufloesen(['127.0.0.1']) });
    assert.equal(heim.ok, true, heim.fehler ?? '');
    assert.equal(empfangen.length, vorher + 1);
    assert.equal(empfangen.at(-1)?.koepfe.host, `ha.home.arpa:${port}`);
  });

  it('keine Weiterleitung, Zeitlimit, Antwort begrenzt und verworfen; 5xx wiederholbar, 4xx dauerhaft', async () => {
    const vorher = empfangen.length;
    const weiter = await sichererAbruf({ adresse: `${basis}/weiter`, methode: 'GET', koepfe: {}, heimnetz: true });
    assert.equal(weiter.ok, false); assert.equal(weiter.status, 302); assert.equal(weiter.dauerhaft, true);
    assert.equal(empfangen.length, vorher + 1, 'dem Ziel der Weiterleitung nicht gefolgt');
    const zeit = await sichererAbruf({ adresse: `${basis}/haengt`, methode: 'GET', koepfe: {}, heimnetz: true }, { zeitlimitMs: 200 });
    assert.equal(zeit.ok, false); assert.equal(zeit.dauerhaft, false); assert.match(zeit.fehler!, /Keine Antwort/);
    const gross = await sichererAbruf({ adresse: `${basis}/gross`, methode: 'GET', koepfe: {}, heimnetz: true });
    assert.equal(gross.ok, true, 'Status zählt, die Antwort wird verworfen');
    const kaputt = await sichererAbruf({ adresse: `${basis}/kaputt`, methode: 'GET', koepfe: {}, heimnetz: true });
    assert.equal(kaputt.dauerhaft, false);
    const fehlt = await sichererAbruf({ adresse: `${basis}/fehlt`, methode: 'GET', koepfe: {}, heimnetz: true });
    assert.equal(fehlt.dauerhaft, true);
  });
});

/* ---------- Ausführen und Zustellen ---------- */

describe('Nach außen (#671): URL aufrufen über den Ausgangskorb', () => {
  const ereignis = (art: string, daten: Record<string, unknown>, id = crypto.randomUUID()) => ({ id, art: art as never, daten, ausloeser: { art: 'benutzer' as const, id: 'x', konto: 'x' }, erstellt: new Date().toISOString() });

  it('Inhaltsstufen technisch: Meldung, Kennungen, Werte (ohne Passwort und Verschlüsseltes); Signatur prüfbar wie beim Empfänger', async () => {
    const { d, motor, markus, vertrag, autoRepo } = await aufbau();
    await motor.setzeZiele([{ adresse: `${basis}/hook`, heimnetz: true }], markus.id);
    const angelegt = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', betrag: '42' } }, markus.id);
    // Passwort und verschlüsselter Wert direkt gespeichert (ohne Tresor im Test).
    const m = await d.kern.repo.aendereMappe(angelegt.id, { ...angelegt.werte, notiz: 'dms1$abc', pin: 'dms1$geheim' }, [], markus.id);
    const karte = (inhalt: string, extra: Record<string, unknown> = {}) => ({ id: `u-${inhalt}`, art: 'url', adresse: `${basis}/hook/${inhalt}`, methode: 'POST', inhalt, parameter: [{ name: 'quelle', wert: 'ablago {automatisierung}' }], ...extra });
    const a = await motor.lege({ name: 'Melden', aktiv: true, wenn: { art: 'mappe.geaendert', typ: vertrag.id },
      dann: [karte('meldung'), karte('kennungen'), { ...karte('werte', { bestaetigt: true }), parameter: [{ name: 'quelle', wert: '{titel}' }] }] }, markus.id);
    // Zweite Stelle (Sicherheit): Steht doch ein Inhalts-Platzhalter in „nur Meldung“ (an der Prüfung vorbei gespeichert),
    // hält der Motor vor jedem Lauf an – nichts geht hinaus.
    const roh = (await autoRepo.hole(a.id))!;
    await autoRepo.speichere(a.id, { ...roh, dann: roh.dann.map((x) => (x.id === 'u-meldung' && x.art === 'url' ? { ...x, parameter: [{ name: 'quelle', wert: 'ablago {titel}' }] } : x)) }, null, roh.version);
    await motor.ereignis(ereignis('mappe.geaendert', { mappe: angelegt.id, typ: vertrag.id, felder: ['betrag'] }));
    assert.equal((await motor.laeufe(a.id))[0].zustand, 'fehlgeschlagen');
    assert.equal((await motor.hole(a.id)).angehalten?.grund, 'fehlerhaft');
    assert.deepEqual(await motor.zustellungen(a.id), []);
    await autoRepo.speichere(a.id, roh, null, roh.version + 1);
    await autoRepo.setze(a.id, { angehalten: null });
    const { geheimnis } = await motor.aussenGeheimnis(a.id, 'u-werte', markus.id);
    assert.match(geheimnis, /^whsec_/);
    assert.ok(!JSON.stringify(await motor.hole(a.id)).includes(geheimnis), 'nie in der Ansicht');
    const e = ereignis('mappe.geaendert', { mappe: m.id, typ: vertrag.id, felder: ['betrag', 'notiz', 'pin'] });
    await motor.ereignis(e);
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    assert.match(l.schritte.at(-1)!.text!, /in den Ausgangskorb gelegt/);
    assert.ok(!JSON.stringify(l).includes('Strom'), 'Lauf ohne Inhalte');
    const vorher = empfangen.length;
    assert.equal(await motor.ausleitung.zustellen(), 3);
    const neu = empfangen.slice(vorher);
    const an = (s: string) => neu.find((x) => x.pfad === `/hook/${s}`)!;
    const meld = JSON.parse(an('meldung').rumpf);
    assert.deepEqual(Object.keys(meld).sort(), ['automatisierung', 'ereignis', 'id', 'parameter', 'zeit']);
    assert.equal(meld.id, e.id);
    assert.deepEqual(meld.parameter, { quelle: 'ablago Melden' });
    assert.equal(an('meldung').koepfe['x-dms-signatur'], undefined, 'ohne Geheimnis unsigniert');
    const kenn = JSON.parse(an('kennungen').rumpf);
    assert.equal(kenn.mappe, m.id);
    assert.deepEqual(kenn.felder, ['betrag', 'notiz', 'pin']);
    assert.equal(kenn.link, `https://ablago.example.org/ablage/typ:${vertrag.id}/${m.id}`);
    assert.equal(kenn.werte, undefined);
    assert.ok(!an('kennungen').rumpf.includes('Strom'), 'keine Werte, kein Titel');
    const w = an('werte');
    const werte = JSON.parse(w.rumpf);
    assert.equal(werte.titel, 'Strom');
    assert.deepEqual(werte.werte, { betrag: '42' }, 'nur geänderte Felder; nie Passwort, nie verschlüsselte Werte');
    assert.equal(werte.parameter.quelle, 'Strom');
    assert.equal(w.koepfe['x-dms-ereignis'], e.id);
    // Prüfen wie beim Empfänger: HMAC-SHA256 über „<zeit>.<rumpf>“ mit dem Geheimnis.
    assert.equal(w.koepfe['x-dms-signatur'], aussenSignatur(geheimnis, String(w.koepfe['x-dms-zeit']), w.rumpf));
    // Dasselbe Ereignis noch einmal: nichts doppelt im Ausgangskorb.
    await motor.ereignis(e);
    assert.equal(await motor.ausleitung.zustellen(), 0);
    const z = await motor.zustellungen(a.id);
    assert.deepEqual(z.map((x) => x.zustand), ['zugestellt', 'zugestellt', 'zugestellt']);
    assert.ok(!JSON.stringify(z).includes('Strom') && !JSON.stringify(z).includes('auftrag'), 'Verlauf ohne Inhalte');
  });

  it('GET: Meldung und Parameter in der Abfrage, signiert über Pfad und Abfrage', async () => {
    const { motor, markus } = await aufbau();
    await motor.setzeZiele([{ adresse: `${basis}/hook`, heimnetz: true }], markus.id);
    const a = await motor.lege({ name: 'Wasser', aktiv: true, wenn: { art: 'aufruf', parameter: ['raum'] },
      dann: [{ id: 'g', art: 'url', adresse: `${basis}/hook/get?fest=1`, methode: 'GET', inhalt: 'kennungen', parameter: [{ name: 'raum', wert: '{raum}' }] }] }, markus.id);
    assert.ok(a.probleme.length === 0, a.probleme.join());
    const { geheimnis } = await motor.aussenGeheimnis(a.id, 'g', markus.id);
    await motor.wiedergeben(a.id, null, false);
    const vorher = empfangen.length;
    await motor.ausleitung.zustellen();
    const x = empfangen.slice(vorher)[0];
    const u = new URL(x.pfad, basis);
    assert.equal(u.searchParams.get('fest'), '1');
    assert.equal(u.searchParams.get('raum'), 'Beispielwert');
    assert.equal(u.searchParams.get('ereignis'), 'aufruf');
    assert.equal(x.rumpf, '');
    assert.equal(x.koepfe['x-dms-signatur'], aussenSignatur(geheimnis, String(x.koepfe['x-dms-zeit']), signierterInhalt(u.toString(), 'GET', null)));
  });

  it('Wiederholung nach Plan, nach dem letzten Versuch aufgegeben: Automatisierung angehalten, offene verworfen', async () => {
    let jetzt = Date.parse('2026-11-12T10:00:00Z');
    const versuche: string[] = [];
    const { motor, markus } = await aufbau({ uhr: () => jetzt, abruf: async (x) => { versuche.push(x.adresse); return { ok: false, status: 503, fehler: 'HTTP 503', dauerhaft: false, ms: 1 }; } });
    await motor.setzeZiele([{ adresse: 'https://hooks.example.org/' }], markus.id);
    const a = await motor.lege({ name: 'Monitoring', aktiv: true, wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'u', art: 'url', adresse: 'https://hooks.example.org/x', methode: 'POST', inhalt: 'meldung', parameter: [] }] }, markus.id);
    await motor.wiedergeben(a.id, null, false);
    await motor.wiedergeben(a.id, null, false);
    for (let i = 0; i < 10; i++) { await motor.ausleitung.zustellen(); jetzt += 7 * 3600_000; }
    const z = await motor.zustellungen(a.id);
    assert.deepEqual(z.map((x) => x.zustand).sort(), ['aufgegeben', 'verworfen']);
    assert.equal(z.find((x) => x.zustand === 'aufgegeben')!.versuche, 6, 'erster Versuch und fünf Wiederholungen');
    const h = await motor.hole(a.id);
    assert.equal(h.angehalten?.grund, 'ziel');
    assert.match(h.angehalten!.text, /hooks\.example\.org.*HTTP 503/);
    assert.ok(versuche.length >= 6);
  });

  it('Dauerfehler sofort: 4xx bzw. Ziel nicht mehr freigegeben – angehalten, Problem an der Karte', async () => {
    const { motor, markus } = await aufbau();
    await motor.setzeZiele([{ adresse: `${basis}/`, heimnetz: true }], markus.id);
    const lege = (pfad: string) => motor.lege({ name: pfad, aktiv: true, wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'u', art: 'url', adresse: `${basis}${pfad}`, methode: 'POST', inhalt: 'meldung', parameter: [] }] }, markus.id);
    const a = await lege('/fehlt');
    await motor.wiedergeben(a.id, null, false);
    await motor.ausleitung.zustellen();
    assert.equal((await motor.hole(a.id)).angehalten?.grund, 'ziel');
    const b = await lege('/ok');
    await motor.wiedergeben(b.id, null, false);
    const r = await motor.setzeZiele([], markus.id);
    assert.deepEqual(r.betroffen.map((x) => x.id), [b.id], 'die Werkbank nennt, wer anhält');
    await motor.ausleitung.zustellen();
    const h = await motor.hole(b.id);
    assert.equal(h.angehalten?.grund, 'ziel');
    assert.match(h.probleme.join(), /kein freigegebenes Ziel/);
    await assert.rejects(motor.aendere(b.id, { aktiv: true }, markus.id), /kein freigegebenes Ziel/);
  });

  it('Probelauf trocken legt nichts in den Ausgangskorb; Geheimnis fällt mit der Karte weg', async () => {
    const { motor, markus } = await aufbau();
    await motor.setzeZiele([{ adresse: 'https://hooks.example.org/' }], markus.id);
    const a = await motor.lege({ name: 'T', aktiv: true, wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'u', art: 'url', adresse: 'https://hooks.example.org/x', methode: 'POST', inhalt: 'meldung', parameter: [] }] }, markus.id);
    const l = await motor.wiedergeben(a.id, null, true);
    assert.match(l.schritte.at(-1)!.text!, /Würde POST an hooks\.example\.org senden/);
    assert.deepEqual(await motor.zustellungen(a.id), []);
    await motor.aussenGeheimnis(a.id, 'u', markus.id);
    assert.equal((await motor.hole(a.id)).geheimnisse?.length, 1);
    await assert.rejects(motor.aussenGeheimnis(a.id, 'gibts-nicht', markus.id), (e: Fachfehler) => e.status === 404);
    await motor.aendere(a.id, { dann: [{ id: 's', art: 'stopp' }] }, markus.id);
    assert.deepEqual(await motor.ausleitung.geheimnisStand(a.id), []);
  });
});

describe('Nach außen (#671): E-Mail senden', () => {
  it('An: Person, Rolle, E-Mail-Feld, Adresse; Platzhalter mit Empfängerrechten bzw. Systemkonto; Hinweissatz; nur Text', async () => {
    const { d, motor, markus, vertrag, gesendet } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kontakt: 'petra@example.org' } }, markus.id);
    const a = await motor.lege({ name: 'Neu-Mail', aktiv: true, wenn: { art: 'mappe.angelegt', typ: vertrag.id },
      dann: [{ id: 'm', art: 'email', an: [{ art: 'person', id: markus.id }, { art: 'feld', feld: 'kontakt' }, { art: 'adresse', adresse: 'jonas@example.org' }, { art: 'adresse', adresse: 'JONAS@example.org' }],
        betreff: 'Neuer Vertrag: {titel}', text: 'Vertrag {titel} ist da.' }] }, markus.id);
    await motor.ereignis({ id: crypto.randomUUID(), art: 'mappe.angelegt', daten: { mappe: m.id, typ: vertrag.id }, ausloeser: { art: 'benutzer', id: markus.id, konto: markus.id }, erstellt: new Date().toISOString() });
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    await motor.ausleitung.zustellen();
    assert.deepEqual(gesendet.map((x) => x.an).sort(), ['jonas@example.org', 'markus@example.org', 'petra@example.org'], 'je Adresse einmal');
    for (const x of gesendet) {
      assert.equal(x.betreff, 'Neuer Vertrag: Strom');
      assert.match(x.text, /^Vertrag Strom ist da\.\n\n-- \nDiese Nachricht hat die Automatisierung „Neu-Mail“ von Ablago \(https:\/\/ablago\.example\.org\) verschickt\./);
    }
    const z = await motor.zustellungen(a.id);
    assert.ok(z.every((x) => x.zustand === 'zugestellt' && /\*\*\*@example\.org$/.test(x.ziel)), 'im Verlauf nur gekürzte Adressen');
  });

  it('ohne Mailversand später noch einmal; Bremse je Automatisierung über 24 Stunden', async () => {
    let mailer: Mailer | null = null;
    const gesendet: string[] = [];
    const { motor, markus } = await aufbau({ mailer: { sende: async (an) => { if (!mailer) throw new Error('aus'); gesendet.push(an); } } });
    const a = await motor.lege({ name: 'Viel', aktiv: true, wenn: { art: 'aufruf', parameter: [] },
      dann: [{ id: 'm', art: 'email', an: Array.from({ length: 20 }, (_, i) => ({ art: 'adresse', adresse: `lena${i}@example.org` })), betreff: 'Hallo', text: 'Test' }] }, markus.id);
    await motor.wiedergeben(a.id, null, false);
    await motor.ausleitung.zustellen();
    assert.equal(gesendet.length, 0);
    assert.ok((await motor.zustellungen(a.id)).every((x) => x.zustand === 'offen' && x.fehler === 'aus'));
    mailer = { sende: async () => {} };
    await motor.wiedergeben(a.id, null, false);
    const dritter = await motor.wiedergeben(a.id, null, false);
    assert.equal(dritter.zustand, 'fehlgeschlagen');
    assert.match(dritter.fehler!, /Bremse.*50 E-Mails/);
  });
});

describe('Nach außen (#671): Pakete, Geheimnisse, heikle Handlungen', () => {
  it('Pakete bringen „URL aufrufen“ und „E-Mail senden“ nicht mit; mitgelieferte werden übergangen', async () => {
    const archiv = (karte: string) => zipPuffer([
      { name: 'manifest.yaml', daten: Buffer.from('schema: 1\nid: aussen\nname: Außen\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.231.0"\ninhalt:\n  automatisierungen: inhalt/automatisierungen.yaml\n') },
      { name: 'inhalt/automatisierungen.yaml', daten: Buffer.from(`- schluessel: raus\n  name: Raus\n  wenn: { art: mappe.angelegt }\n  dann:\n    - ${karte}\n`) },
    ], new Date('2026-01-01T12:00:00Z'));
    for (const k of ['{ art: url, adresse: "https://hooks.example.org/", methode: POST, inhalt: werte }', '{ art: email, an: [{ art: adresse, adresse: lena@example.org }], betreff: x, text: y }']) {
      let fehler = '';
      try { liesPaket(liesZip(archiv(k))); } catch (e) { fehler = [(e as Error).message, ...(((e as Fachfehler).details as { gruende?: string[] })?.gruende ?? [])].join(' | '); }
      assert.match(fehler, /„URL aufrufen“ und „E-Mail senden“ gibt es nur in der Werkbank/, k);
    }
    const { motor, markus } = await aufbau();
    const n = await motor.ausPaket({ id: 'aussen', name: 'Außen', typen: {} } as never, [{ schluessel: 'raus', name: 'Raus', beschreibung: '', wenn: { art: 'mappe.angelegt' }, und: undefined, dann: [{ art: 'email', an: [], betreff: 'x', text: 'y' }] }] as never);
    assert.equal(n, 0);
    const p = await motor.lege({ name: 'P', wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'u', art: 'url', adresse: 'https://hooks.example.org/x', methode: 'POST', inhalt: 'meldung', parameter: [] }] }, null, 'paket').catch(() => null);
    if (p) await assert.rejects(motor.aussenGeheimnis(p.id, 'u', markus.id), (e: Fachfehler) => e.status === 409);
  });

  it('Notfallblatt nennt die Ziele nach außen (nur Rechner)', () => {
    const plan = notfallblattPlan({ name: 'Ablage', haushaltId: 'h', adresse: 'https://ablago.example.org', version: '1', erstellt: new Date(), schluessel: 'A'.repeat(43), fingerabdruck: 'F', ziele: ['hooks.example.org', 'ha.home.arpa:8123'] });
    assert.ok(plan.ablage.zeilen.some((z) => z.marke === 'Ziele nach außen' && z.text.includes('hooks.example.org, ha.home.arpa:8123')));
    assert.match(zieleZeile(Array.from({ length: 7 }, (_, i) => `h${i}.example.org`)), /und 2 weitere/);
  });

  it('Geheimnis-Art „aussen“; Ziele und Geheimnis sind heikle Handlungen (frische Anmeldung)', () => {
    assert.equal(artVon({ quelle: 'aussen', schluessel: 'a:u' }), 'aussen');
    const { arten, betroffen } = bestandAus([{ quelle: 'aussen', schluessel: 'a1:u', wert: 'dms1$kaputt', titel: 'Monitoring' }], () => false);
    assert.equal(arten.find((a) => a.art === 'aussen')?.anzahl, 1);
    assert.match(betroffen[0].was, /Monitoring/);
    assert.equal(heikleHandlung('PUT', '/api/werkbank/automatisierungen/ziele', {}), 'aussen');
    assert.equal(heikleHandlung('POST', '/api/werkbank/automatisierungen/:id/geheimnis/:karte', {}), 'aussen');
    assert.equal(heikleHandlung('GET', '/api/werkbank/automatisierungen/ziele', {}), null);
  });
});

describe('Nach außen in PostgreSQL (#671)', { skip: !process.env.TEST_DATABASE_URL }, () => {
  it('Ausgangskorb (eindeutig, holen mit Frist, Auftrag weg nach Zustellung, Bremse zählt), Geheimnisse umgeschlüsselt', async () => {
    const { eigeneDatenbank } = await import('./hilfe-db');
    const db = await eigeneDatenbank('aussen');
    const { pgRepo } = await import('../src/repo-pg');
    const { pgAutomatisierungRepo } = await import('../src/automatisierung');
    const { pgAusgangRepo, pgAussenGeheimnisRepo } = await import('../src/automatisierung/index');
    const haushalt = (await db.sql`SELECT id FROM haushalte LIMIT 1`)[0]?.id as string ?? (await db.sql`INSERT INTO haushalte (id, name) VALUES (gen_random_uuid(), 'Test') RETURNING id`)[0].id as string;
    const autos = pgAutomatisierungRepo(db.sql, haushalt);
    const id = crypto.randomUUID();
    const jetzt = new Date().toISOString();
    await autos.lege({ ...bereinigeAutomatisierung({ name: 'Monitoring', wenn: { art: 'aufruf', parameter: [] }, dann: [{ id: 'u', art: 'url', adresse: 'https://hooks.example.org/x', methode: 'POST', inhalt: 'meldung', parameter: [] }] }), id, aktiv: true, angehalten: null, herkunft: 'eigen', version: 1, erstellt: jetzt, erstelltVon: null, geaendert: jetzt, geaendertVon: null });
    const repo = pgAusgangRepo(db.sql, haushalt);
    const eintrag = (schluessel: string, art: 'url' | 'email' = 'url') => ({ id: crypto.randomUUID(), automatisierungId: id, karte: 'u', laufId: null, ereignisId: 'e1', art, schluessel, ziel: 'hooks.example.org',
      auftrag: { art: 'url' as const, adresse: 'https://hooks.example.org/x', methode: 'POST' as const, rumpf: '{"geheim":"Strom"}' }, zustand: 'offen' as const, versuche: 0, faellig: jetzt, status: null, fehler: null, erstellt: jetzt, erledigt: null });
    assert.equal(await repo.lege(eintrag('a')), true);
    assert.equal(await repo.lege(eintrag('a')), false, 'eindeutig je Automatisierung, Karte, Ereignis, Empfänger');
    await repo.lege(eintrag('m1', 'email'));
    const [x, y] = await repo.faellige(10, 120, new Date(Date.now() + 1000).toISOString());
    assert.ok(x && y);
    assert.equal(x.versuche, 1);
    assert.deepEqual(await repo.faellige(10, 120, new Date(Date.now() + 1000).toISOString()), [], 'mit Frist geholt');
    await repo.schliesse(x.id, 'zugestellt', 200, null, jetzt);
    assert.equal(await repo.zaehleMails(id, '2000-01-01T00:00:00Z'), 1);
    assert.equal(await repo.zaehleMails(null, '2000-01-01T00:00:00Z'), 1);
    assert.equal(await repo.verwerfe(id, 'weg', jetzt), 1);
    const [roh] = await db.sql`SELECT count(*)::int AS n FROM automatisierung_ausgang WHERE auftrag IS NOT NULL`;
    assert.equal(roh.n, 0, 'kein Auftrag mehr nach Zustellung bzw. Verwerfen');
    assert.ok(!JSON.stringify(await repo.verlauf(id, 10)).includes('Strom'));
    const g = pgAussenGeheimnisRepo(db.sql, haushalt);
    await g.setze({ automatisierungId: id, karte: 'u', geheimnis: verschluessele('whsec_alt'), erstellt: jetzt, erstelltVon: null });
    const r = pgRepo(db.sql, haushalt);
    const f = (await r.verschluesselteFundstellen()).find((z) => z.quelle === 'aussen');
    assert.equal(f?.titel, 'Monitoring');
    await r.umschluesseln((w) => verschluessele(`neu:${entschluessele(w)}`), {});
    assert.equal(entschluessele((await g.hole(id, 'u'))!.geheimnis), 'neu:whsec_alt');
    await autos.loesche(id);
    assert.deepEqual(await g.liste(id), []);
    assert.deepEqual(await repo.verlauf(id, 10), [], 'geht mit der Automatisierung');
    await db.ende();
  });
});
