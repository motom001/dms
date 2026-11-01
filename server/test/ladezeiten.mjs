/**
 * Ladezeiten Administrator gegen Mitglied (#477): echte Oberfläche in Chromium, je Seite mehrere
 * Ladevorgänge, dazu die Aufteilung aus Server-Timing. Kein Test – von Hand gegen ein laufendes DMS:
 *
 *   # einmal: frisches DMS einrichten (Administrator, Beispiele, Demo-Mappen, zwei Mitglieder, Regeln)
 *   DMS_URL=http://localhost:3100 CODE=<Einrichtungscode> node server/test/ladezeiten.mjs --einrichten --mappen 50000
 *   # messen (Median aus N Ladevorgängen je Seite und Benutzer)
 *   DMS_URL=http://localhost:3100 N=5 node server/test/ladezeiten.mjs
 *
 * Braucht Playwright mit Chromium. Die Regeln sind wie in einem Haushalt: Grundeinstellung ohne
 * Löschen und Passwörter, die Rolle „Steuern und Finanzen“ darf alles, Aufgaben erlauben Bearbeiten,
 * Zahlungen und große Beträge (Vertrag, Rechnung) nur für die Rolle. Ben hat die Rolle, Clara nicht.
 */
import { createRequire } from 'node:module';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const N = Number(process.env.N ?? 5);
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const BENUTZER = {
  admin: ['anna@beispiel.de', 'mess-passwort-1'],
  'Mitglied mit Rolle': ['ben@beispiel.de', 'mess-passwort-2'],
  'Mitglied ohne Rolle': ['clara@beispiel.de', 'mess-passwort-3'],
};

let cookie = '';
async function api(m, p, body) {
  const r = await fetch(BASIS + p, {
    method: m,
    headers: { 'x-dms': '1', ...(process.env.CODE ? { 'x-einrichtungscode': process.env.CODE } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0];
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t}`); return t ? JSON.parse(t) : null;
}
const auftrag = async () => { for (;;) { const a = await api('GET', '/api/werkbank/auftrag'); if (!a || a.status === 'fertig') return; if (a.status === 'fehler') throw new Error(a.fehler); await new Promise((r) => setTimeout(r, 1000)); } };

async function einrichten() {
  const [email, passwort] = BENUTZER.admin;
  await api('POST', '/api/konto/einrichten', { mandant: 'Familie Messung', email, name: 'Anna Admin', passwort });
  const admin = cookie;
  await api('POST', '/api/werkbank/einrichtung/schritt', { schritt: 'fertig' }).catch(() => {});
  await api('POST', '/api/beispiele');
  await api('POST', '/api/werkbank/demo', { anzahl: Number(arg('--mappen') ?? 10000), startwert: 'ladezeit-477' });
  await auftrag();
  const typen = await api('GET', '/api/typen');
  const rolle = await api('POST', '/api/mappen', { typId: typen.find((t) => t.system === 'rolle').id, werte: { name: 'Steuern und Finanzen' } });
  for (const [name, rollen] of [['Mitglied mit Rolle', [rolle.id]], ['Mitglied ohne Rolle', []]]) {
    const [e, p] = BENUTZER[name];
    const einladung = await api('POST', '/api/benutzer', { email: e, name, rolle: 'mitglied', rollen });
    await api('POST', '/api/konto/passwort-setzen', { schluessel: einladung.link.split('/passwort/')[1], passwort: p });
    cookie = admin;
  }
  const nichtRolle = { art: 'rolle', rollen: [rolle.id], nicht: true };
  for (const t of typen.filter((x) => !x.system)) {
    const regeln = [
      { id: 'r1', name: 'Steuern und Finanzen darf alles', wenn: [{ art: 'rolle', rollen: [rolle.id] }], dann: { D: 'erteilen', P: 'erteilen' }, stopp: false },
      { id: 'r2', name: 'Mit Aufgabe bearbeiten', wenn: [{ art: 'aufgabe' }], dann: { U: 'erteilen' }, stopp: false },
    ];
    if (t.name === 'Zahlung') regeln.push({ id: 'r3', name: 'Zahlungen nur Steuern', wenn: [nichtRolle], dann: { R: 'entziehen' }, stopp: true });
    if (t.name === 'Rechnung' || t.name === 'Vertrag') regeln.push({ id: 'r4', name: 'Große Beträge nur Steuern', wenn: [nichtRolle, { art: 'feld', bedingung: { art: 'feld', feld: 'betrag', op: 'groesser', wert: { art: 'fest', wert: 500 } } }], dann: { R: 'entziehen' }, stopp: true });
    await api('PUT', `/api/werkbank/berechtigungen/${t.id}`, { berechtigungen: { grund: { C: true, R: true, U: true, D: false, P: false }, regeln }, bestaetigt: true });
  }
  console.log('Eingerichtet.');
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function messen() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const erg = [];
  for (const [wer, [email, passwort]] of Object.entries(BENUTZER)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const H = { headers: { 'x-dms': '1' } };
    const r = await ctx.request.post(`${BASIS}/api/konto/anmelden`, { ...H, data: { email, passwort } });
    if (!r.ok()) throw new Error(await r.text());
    const typen = await (await ctx.request.get(`${BASIS}/api/typen`, H)).json();
    const rechnung = typen.find((t) => t.name === 'Rechnung');
    const mappe = (await (await ctx.request.get(`${BASIS}/api/mappen?sicht=${rechnung.id}&von=0&anzahl=1`, H)).json()).mappen[0].id;
    const seiten = { Startseite: '/ablage/start', 'Liste Rechnungen': `/ablage/${rechnung.id}`, 'Mappe öffnen': `/ablage/${rechnung.id}/${mappe}` };
    const page = await ctx.newPage();
    for (const [seite, pfad] of Object.entries(seiten)) {
      const laeufe = [];
      for (let i = 0; i <= N; i++) {
        const anfragen = [];
        const hoerer = async (res) => {
          if (!res.url().includes('/api/')) return;
          const t = res.request().timing();
          const st = (await res.allHeaders())['server-timing'] ?? '';
          const w = Object.fromEntries([...st.matchAll(/(\w+);dur=([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
          anfragen.push({ url: res.url().replace(BASIS, ''), server: w.gesamt ?? w.app ?? 0, db: w.db ?? 0, rechte: w.rechte ?? 0, wbrow: Math.max(0, t.requestStart - Math.max(0, t.connectEnd - t.connectStart)) });
        };
        page.on('response', hoerer);
        await page.goto('about:blank');
        const t0 = Date.now();
        await page.goto(BASIS + pfad, { waitUntil: 'networkidle' });
        const dauer = Date.now() - t0 - 500; // networkidle wartet 500 ms ohne Anfrage
        page.off('response', hoerer);
        if (i > 0) laeufe.push({ dauer, anfragen }); // erster Lauf zum Aufwärmen
      }
      const summe = (k) => Math.round(median(laeufe.map((l) => l.anfragen.reduce((s, a) => s + a[k], 0))));
      const langsam = Object.entries(laeufe.flatMap((l) => l.anfragen).reduce((m, a) => { const u = a.url.split('?')[0].replace(/[0-9a-f-]{36}/g, ':id'); (m[u] ??= []).push(a.server); return m; }, {}))
        .map(([u, z]) => [u, median(z)]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u, z]) => `${u} ${Math.round(z)}`).join(', ');
      erg.push({ seite, wer, laden: median(laeufe.map((l) => l.dauer)), anfragen: laeufe[0].anfragen.length, server: summe('server'), db: summe('db'), rechte: summe('rechte'), wbrow: summe('wbrow'), langsam });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`Median aus ${N} Ladevorgängen; Summen über alle Anfragen der Seite (sie laufen teils gleichzeitig).\n`);
  console.log('| Seite | Wer | Laden ms | Anfragen | Server ms | Datenbank ms | Rechte ms | Warten (Browser) ms | langsamste Anfragen (Server ms) |');
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---|');
  for (const e of erg) console.log(`| ${e.seite} | ${e.wer} | ${e.laden} | ${e.anfragen} | ${e.server} | ${e.db} | ${e.rechte} | ${e.wbrow} | ${e.langsam} |`);
}

if (process.argv.includes('--einrichten')) await einrichten();
else await messen();
