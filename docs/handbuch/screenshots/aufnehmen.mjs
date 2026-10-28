/**
 * Nimmt die Screenshots für die Handbücher auf (#25).
 *
 * Erwartet ein frisch gestartetes DMS mit leerer Datenbank (wie im Workflow
 * „Handbuch“): legt einen Administrator an, lädt die Beispiele und etwas
 * Demo-Daten, ein Mitglied und Rollen, und fotografiert dann die Seiten.
 *
 *   DMS_URL=http://localhost:3000 node docs/handbuch/screenshots/aufnehmen.mjs <zielordner>
 *
 * Braucht Playwright mit Chromium (npm install playwright; npx playwright install chromium).
 * Jedes Bild hat einen festen Namen; die Handbücher binden sie über bilder/<name>.png ein.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASIS = process.env.DMS_URL ?? 'http://localhost:3000';
const ZIEL = process.argv[2] ?? 'bilder';
const ADMIN = { email: 'anna@beispiel.de', name: 'Anna Beispiel', passwort: 'handbuch-passwort-1' };
const MITGLIED = { email: 'ben@beispiel.de', name: 'Ben Beispiel', passwort: 'handbuch-passwort-2' };

/* ---------- Daten über die Schnittstelle vorbereiten ---------- */

let cookie = '';
async function api(methode, pfad, body, roh) {
  const r = await fetch(BASIS + pfad, {
    method: methode,
    headers: { 'x-dms': '1', ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': roh ? 'application/octet-stream' : 'application/json' } : {}) },
    body: body === undefined ? undefined : roh ? body : JSON.stringify(body),
  });
  const gesetzt = r.headers.get('set-cookie');
  if (gesetzt) cookie = gesetzt.split(';')[0];
  const text = await r.text();
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function warteAufServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASIS}/api/gesundheit`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`DMS unter ${BASIS} antwortet nicht.`);
}

async function warteAufAuftrag() {
  for (;;) {
    const a = await api('GET', '/api/werkbank/auftrag');
    if (!a || a.status === 'fertig') return;
    if (a.status === 'fehler') throw new Error(a.fehler);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** Kleines, gültiges PDF mit einer Zeile Text – als Beispieldokument. */
function beispielPdf(zeile) {
  const inhalt = `BT /F1 18 Tf 60 760 Td (${zeile}) Tj ET`;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objekte.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function vorbereiten() {
  await warteAufServer();
  const admin = (await api('POST', '/api/konto/einrichten', ADMIN)).benutzer;
  const adminCookie = cookie;
  await api('POST', '/api/beispiele');
  await api('POST', '/api/werkbank/demo', { anzahl: 120 });
  await warteAufAuftrag();

  let typen = await api('GET', '/api/typen');
  const typ = (name) => typen.find((t) => t.name === name);
  const benutzerTyp = typen.find((t) => t.system === 'benutzer');
  const rolleTyp = typen.find((t) => t.system === 'rolle');

  // Rollen und ein Mitglied, das sie hat
  const steuern = await api('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Steuern und Finanzen' } });
  await api('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Haus und Garten' } });
  const einladung = await api('POST', '/api/benutzer', { email: MITGLIED.email, name: MITGLIED.name, rolle: 'mitglied', rollen: [steuern.id] });
  const schluessel = einladung.link.split('/passwort/')[1];
  await api('POST', '/api/konto/passwort-setzen', { schluessel, passwort: MITGLIED.passwort });
  cookie = adminCookie;

  // Vertrag bekommt einen verantwortlichen Benutzer (#26)
  const vertrag = typ('Vertrag');
  const felder = [...vertrag.felder, { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id, verweisart: 'bezug', hilfe: 'Wer die Fristen im Blick behält' }];
  const register = vertrag.register.map((r) => (r.art === 'felder' && r.key === 'vertrag' ? { ...r, felder: [...(r.felder ?? []), 'verantwortlich'] } : r));
  await api('PUT', `/api/typen/${vertrag.id}`, { ...vertrag, felder, register });
  typen = await api('GET', '/api/typen');

  const alle = await api('GET', '/api/mappen');
  const mappe = (feld, wert) => alle.find((m) => m.werte[feld] === wert);
  const strom = mappe('bezeichnung', 'Stromvertrag Haus');
  await api('PUT', `/api/mappen/${strom.id}`, { werte: { ...strom.werte, verantwortlich: admin.id } });
  await api('POST', `/api/mappen/${strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Stromvertrag 2022.pdf')}&typ=application/pdf`, beispielPdf('Stromvertrag Haus - Vertragsunterlagen'), true);
  await api('POST', `/api/mappen/${strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Preisanpassung 2026.pdf')}&typ=application/pdf`, beispielPdf('Preisanpassung 2026'), true);

  // Sichten (#38, #40): eine Gruppe „Finanzen“ mit Untersichten und eine mit Bedingungen
  const rechnungTyp = typ('Rechnung'); const zahlungTyp = typ('Zahlung'); const vertragTyp = typ('Vertrag');
  const finanzen = await api('POST', '/api/sichten/definitionen', { name: 'Finanzen', beschreibung: 'Offene Rechnungen und Zahlungen', typen: [] });
  await api('POST', '/api/sichten/definitionen', { name: 'Offene Rechnungen', elternId: finanzen.id, typen: [rechnungTyp.id], bedingungen: [{ art: 'feld', feld: 'bezahlt', op: 'nein' }] });
  await api('POST', '/api/sichten/definitionen', { name: 'Zahlungen dieses Jahr', elternId: finanzen.id, typen: [zahlungTyp.id], bedingungen: [{ art: 'feld', feld: 'zahlungsdatum', op: 'imZeitraum', wert: { art: 'jahr', versatz: 0 } }] });
  const fristen = await api('POST', '/api/sichten/definitionen', {
    name: 'Kündigung in den nächsten 12 Monaten', beschreibung: 'Verträge, deren Kündigungsfrist bald endet', typen: [vertragTyp.id],
    bedingungen: [{ art: 'feld', feld: 'kuendigung_bis', op: 'zwischen', wert: { art: 'heute' }, bis: { art: 'heute', versatz: 12, einheit: 'monate' } }],
  });
  await api('POST', '/api/sichten/definitionen', {
    name: 'Rechnungen ohne Beleg', typen: [rechnungTyp.id],
    bedingungen: [{ art: 'dokumente', register: 'dokumente', vergleich: 'gleich', anzahl: 0 }],
  });

  return {
    finanzen, fristen,
    admin, adminCookie,
    typ: (name) => typen.find((t) => t.name === name),
    benutzerTyp, rolleTyp,
    mitglied: (await api('GET', '/api/benutzer')).find((b) => b.email === MITGLIED.email),
    strom,
    stadtwerke: mappe('name', 'Stadtwerke Musterstadt'),
    rechnung: mappe('rechnungsnummer', 'R-2026-117'),
  };
}

/* ---------- Seiten aufnehmen ---------- */

async function main() {
  await mkdir(ZIEL, { recursive: true });
  const d = await vorbereiten();
  // Deutsche Oberfläche auch für Datumsfelder (Chromium richtet sich dafür nach --lang).
  const browser = await chromium.launch({ channel: 'chromium', args: ['--lang=de-DE'], env: { ...process.env, LANG: 'de_DE.UTF-8', LANGUAGE: 'de' } });
  const kontext = async (mitCookie = true, breite = 1440, hoehe = 860) => {
    const k = await browser.newContext({ viewport: { width: breite, height: hoehe }, colorScheme: 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin', deviceScaleFactor: 1 });
    if (mitCookie) {
      const [name, wert] = d.adminCookie.split('=');
      await k.addCookies([{ name, value: wert, url: BASIS }]);
    }
    return k;
  };
  const erstellt = [];
  const bild = async (seite, name, optionen = {}) => {
    await seite.waitForLoadState('networkidle');
    await seite.waitForTimeout(300);
    await seite.screenshot({ path: join(ZIEL, `${name}.png`), ...optionen });
    erstellt.push(name);
    console.log(`  ${name}.png`);
  };
  const geheZu = async (seite, pfad) => { await seite.goto(BASIS + pfad); await seite.waitForLoadState('networkidle'); };

  // Anmeldung (ohne Sitzung)
  {
    const k = await kontext(false, 1100, 700);
    const s = await k.newPage();
    await geheZu(s, '/');
    await s.getByRole('button', { name: 'Anmelden' }).waitFor();
    await bild(s, 'anmelden');
    await k.close();
  }

  const k = await kontext();
  const s = await k.newPage();
  const vertrag = d.typ('Vertrag');
  const partner = d.typ('Vertragspartner');
  const rechnung = d.typ('Rechnung');

  // Ablage: drei Spalten mit geöffneter Mappe
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('heading', { name: 'Stromvertrag Haus' }).waitFor();
  await bild(s, 'ablage');

  // Register mit Dokumenten
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  await bild(s, 'dokumente');

  // Verknüpfungsregister beim Vertragspartner
  await geheZu(s, `/ablage/${partner.id}/${d.stadtwerke.id}`);
  await s.getByRole('tab', { name: 'Verträge' }).click();
  await bild(s, 'verknuepfungen');

  // Neue Mappe
  await geheZu(s, `/ablage/${rechnung.id}/neu`);
  await bild(s, 'mappe-neu');

  // Suche in einer Liste
  await geheZu(s, `/ablage/${vertrag.id}`);
  await s.getByPlaceholder('Suchen in Titel und Werten …').fill('Haus');
  await s.waitForTimeout(600);
  await bild(s, 'suche');

  // Breite Liste als Tabelle: Liste breit ziehen (gemerkt je Gerät), danach zurücksetzen
  const breitSchluessel = `dms:bereiche:ablage:${d.admin.id}`;
  await s.evaluate(([key]) => localStorage.setItem(key, JSON.stringify({ l: 220, m: 900, rechtsZu: true })), [breitSchluessel]);
  await geheZu(s, `/ablage/${rechnung.id}`);
  await s.locator('.trefferliste table').waitFor();
  await bild(s, 'tabelle');
  await s.evaluate(([key]) => localStorage.removeItem(key), [breitSchluessel]);

  // Eingang: eine Pflichtfeld-Änderung macht Mappen unpassend
  const kundennr = { ...partner, felder: partner.felder.map((f) => (f.key === 'kundennummer' ? { ...f, pflicht: true } : f)) };
  await api('PUT', `/api/typen/${partner.id}`, kundennr);
  await geheZu(s, '/ablage/eingang');
  await s.locator('.mappenliste .eintrag, .trefferliste tbody tr').first().click();
  await bild(s, 'eingang');
  await api('PUT', `/api/typen/${partner.id}`, partner);

  // Sichten als Baum in der Ablage und in der Werkbank (#38)
  await geheZu(s, `/ablage/${d.finanzen.id}`);
  await s.locator('.spalte.liste .eintrag, .spalte.liste tbody tr').first().waitFor();
  await bild(s, 'sichten-baum');
  await geheZu(s, `/werkbank/sichten/${d.fristen.id}`);
  await s.getByRole('heading', { name: 'Bedingungen' }).waitFor();
  await s.getByText('Diese Sicht zeigt zurzeit').waitFor();
  await bild(s, 'werkbank-sichten');

  // Benutzer und Rollen in der Ablage
  await geheZu(s, `/ablage/${d.rolleTyp.id}`);
  await s.locator('.mappenliste .eintrag').filter({ hasText: 'Steuern und Finanzen' }).click();
  await s.getByRole('tab', { name: 'Benutzer' }).click();
  await bild(s, 'rolle');
  await geheZu(s, `/ablage/${d.benutzerTyp.id}/${d.mitglied.id}`);
  await bild(s, 'benutzer-mappe');

  // Benutzermenü
  await geheZu(s, '/ablage');
  await s.locator('.benutzermenue .wer').click();
  await s.locator('.benutzermenue .menue').waitFor();
  await bild(s, 'benutzermenue', { clip: { x: 1440 - 420, y: 0, width: 420, height: 380 } });
  await s.keyboard.press('Escape');

  // Profil
  await geheZu(s, '/profil');
  await bild(s, 'profil', { fullPage: true });
  await geheZu(s, '/api-doku');
  await bild(s, 'api-doku');

  // Werkbank
  await geheZu(s, `/werkbank/typen/${vertrag.id}`);
  await bild(s, 'werkbank-mappentyp');
  await s.locator('button.feldkopfknopf').filter({ hasText: 'Kündigung bis' }).click();
  await s.locator('.feldzeile.offen').scrollIntoViewIfNeeded();
  await bild(s, 'werkbank-feld');
  await geheZu(s, `/werkbank/typen/${d.benutzerTyp.id}`);
  await bild(s, 'werkbank-systemtyp');
  await geheZu(s, `/werkbank/benutzer/${d.mitglied.id}`);
  await bild(s, 'werkbank-benutzer');
  await geheZu(s, '/werkbank/benutzer/neu');
  await bild(s, 'werkbank-benutzer-neu');
  await geheZu(s, '/werkbank/designs');
  await s.locator('.spalte.liste a.eintrag').first().click();
  await bild(s, 'werkbank-designs');
  await geheZu(s, '/werkbank/protokoll');
  await bild(s, 'werkbank-protokoll');
  await geheZu(s, '/werkbank/betrieb');
  await s.getByRole('heading', { name: 'E-Mail-Versand' }).waitFor();
  await bild(s, 'werkbank-betrieb');
  await geheZu(s, '/werkbank/datenbank');
  await bild(s, 'werkbank-datenbank');
  await geheZu(s, '/werkbank/technik');
  await bild(s, 'werkbank-technik');
  await geheZu(s, '/werkbank/demo');
  await bild(s, 'werkbank-demo');

  // Die API-Beschreibung dieser Version für das Administratorhandbuch
  await writeFile(join(ZIEL, 'openapi.json'), JSON.stringify(await (await fetch(`${BASIS}/api/openapi.json`)).json(), null, 2));

  await browser.close();
  console.log(`${erstellt.length} Bilder in ${ZIEL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
