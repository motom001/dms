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
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
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
    // Auch im Einrichtungsmodus (#119) erreichbar; /api/gesundheit gibt es erst danach.
    try { if ((await fetch(`${BASIS}/api/konto/status`)).ok) return; } catch { /* startet noch */ }
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
  // Eine Zeile je Seite; mehrere Zeilen (Liste) = mehrseitiges PDF (#335).
  const zeilen = Array.isArray(zeile) ? zeile : [zeile];
  const n = zeilen.length;
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${zeilen.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  zeilen.forEach((z, i) => {
    const inhalt = `BT /F1 18 Tf 60 760 Td (${z}) Tj ET`;
    objekte.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objekte.push(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objekte.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Ein „Foto-Scan“ für PDF verkleinern (#393): die Seiten von beispielPdf mit pdftoppm als JPEG in hoher
 * Auflösung gerastert und als Bild-PDF zusammengesetzt – ohne zusätzliche Bibliothek.
 */
function fotoPdf(zeilen, dpi = 600) {
  const dir = join(ZIEL, '..', '.fotopdf');
  execFileSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'q.pdf'), beispielPdf(zeilen));
  execFileSync('pdftoppm', ['-r', String(dpi), '-jpeg', '-jpegopt', 'quality=95', join(dir, 'q.pdf'), join(dir, 's')]);
  const bilder = execFileSync('ls', [dir]).toString().split('\n').filter((n) => n.startsWith('s-') && n.endsWith('.jpg')).sort();
  const teile = [];
  const pos = [];
  let laenge = 0;
  const schreibe = (b) => { teile.push(b); laenge += b.length; };
  const n = bilder.length;
  schreibe(Buffer.from('%PDF-1.4\n', 'latin1'));
  const obj = (nr, kopf, strom) => {
    pos[nr] = laenge;
    if (!strom) { schreibe(Buffer.from(`${nr} 0 obj\n${kopf}\nendobj\n`, 'latin1')); return; }
    schreibe(Buffer.from(`${nr} 0 obj\n${kopf}\nstream\n`, 'latin1')); schreibe(strom); schreibe(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${bilder.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`);
  bilder.forEach((name, i) => {
    const jpg = readFileSync(join(dir, name));
    // Breite und Höhe aus dem SOF-Kopf des JPEG.
    let k = 2; let b = 0; let h = 0;
    while (k < jpg.length) { const m = jpg[k + 1]; const l = jpg.readUInt16BE(k + 2); if (m >= 0xc0 && m <= 0xc2) { h = jpg.readUInt16BE(k + 5); b = jpg.readUInt16BE(k + 7); break; } k += 2 + l; }
    const inhalt = Buffer.from('q 595 0 0 842 0 0 cm /Im Do Q', 'latin1');
    obj(3 + i * 3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im ${5 + i * 3} 0 R >> >> /Contents ${4 + i * 3} 0 R >>`);
    obj(4 + i * 3, `<< /Length ${inhalt.length} >>`, inhalt);
    obj(5 + i * 3, `<< /Type /XObject /Subtype /Image /Width ${b} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  });
  const anzahl = 2 + n * 3;
  const xref = laenge;
  schreibe(Buffer.from(`xref\n0 ${anzahl + 1}\n0000000000 65535 f \n${pos.slice(1).map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${anzahl + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'));
  execFileSync('rm', ['-rf', dir]);
  return Buffer.concat(teile);
}

async function vorbereiten() {
  // Administrator und Schlüssel hat der Einrichtungsassistent angelegt (einrichtenImBrowser).
  const admin = (await api('GET', '/api/konto/status')).benutzer;
  const adminCookie = cookie;
  // Die Bilder zeigen alle Bereiche der Werkbank; der Assistent stellt sonst „Haushalt“ ein (#281).
  await api('PUT', '/api/werkbank/ansicht', { installation: { vorlage: 'alles', ein: [], aus: [] } });
  await api('POST', '/api/beispiele');
  await api('POST', '/api/werkbank/demo', { anzahl: 120 });
  await warteAufAuftrag();

  let typen = await api('GET', '/api/typen');
  const typ = (name) => typen.find((t) => t.name === name);
  const benutzerTyp = typen.find((t) => t.system === 'benutzer');
  const rolleTyp = typen.find((t) => t.system === 'rolle');

  // Rollen und ein Mitglied, das sie hat
  const steuern = await api('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Steuern und Finanzen' } });
  const garten = await api('POST', '/api/mappen', { typId: rolleTyp.id, werte: { name: 'Haus und Garten' } });
  const einladung = await api('POST', '/api/benutzer', { email: MITGLIED.email, name: MITGLIED.name, rolle: 'mitglied', rollen: [steuern.id] });
  const schluessel = einladung.link.split('/passwort/')[1];
  await api('POST', '/api/konto/passwort-setzen', { schluessel, passwort: MITGLIED.passwort });
  cookie = adminCookie;

  // Vertrag bekommt einen verantwortlichen Benutzer (#26)
  const vertrag = typ('Vertrag');
  // dazu eine formatierte Bemerkung (#53) und ein Protokollregister (#57)
  const felder = [...vertrag.felder,
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id, verweisart: 'bezug', hilfe: 'Wer die Fristen im Blick behält' },
    { key: 'bemerkung', label: 'Bemerkung', typ: 'formatiert' }];
  const register = [...vertrag.register.map((r) => (r.art === 'felder' && r.key === 'vertrag' ? { ...r, felder: [...(r.felder ?? vertrag.felder.map((f) => f.key)), 'verantwortlich', 'bemerkung'] } : r)),
    { key: 'protokoll', name: 'Historie', art: 'protokoll' }];
  await api('PUT', `/api/typen/${vertrag.id}`, { ...vertrag, felder, register });
  typen = await api('GET', '/api/typen');

  const alle = await api('GET', '/api/mappen');
  const mappe = (feld, wert) => alle.find((m) => m.werte[feld] === wert);
  const strom = mappe('bezeichnung', 'Stromvertrag Haus');
  await api('PUT', `/api/mappen/${strom.id}`, { werte: { ...strom.werte, verantwortlich: admin.id } });
  // Bemerkung mit Erwähnung (#56), Notizen (#55), eine Aufgabe (#54); dabei füllt sich das Protokoll (#57)
  const mitgliedId = einladung.benutzer.id;
  await api('PUT', `/api/mappen/${strom.id}`, { werte: { ...strom.werte, verantwortlich: admin.id,
    bemerkung: `**Preisanpassung zum 1. April.** Bitte bis Ende März prüfen:\n\n- neuer Arbeitspreis\n- Grundgebühr\n\n@[${MITGLIED.name}](benutzer:${mitgliedId}), magst du die Angebote vergleichen?` } });
  await api('POST', `/api/mappen/${strom.id}/notizen`, { text: 'Kundenservice angerufen: Sonderkündigung wegen Preisanpassung ist **bis 31. März** möglich.' });
  await api('POST', `/api/mappen/${strom.id}/notizen`, { text: 'Zählerstand am 01.03.: 48 211 kWh' });
  await api('POST', `/api/mappen/${strom.id}/aufgaben`, { empfaengerId: mitgliedId, text: 'Zählerstand an die Stadtwerke melden' });
  // E-Mail-Versand eingerichtet (ohne zu senden), damit die Maske zum Versenden erscheint (#58)
  await api('PUT', '/api/werkbank/betrieb/mail', { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'dms@example.org', passwort: 'nur-fuer-bilder', absender: 'DMS <dms@example.org>' });
  await api('POST', `/api/mappen/${strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Stromvertrag 2022.pdf')}&typ=application/pdf`, beispielPdf('Stromvertrag Haus - Vertragsunterlagen'), true);
  await api('POST', `/api/mappen/${strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Preisanpassung 2026.pdf')}&typ=application/pdf`, beispielPdf('Preisanpassung 2026'), true);

  // Passwortfeld (#46) beim Vertragspartner, gesetzt bei den Stadtwerken
  const partnerTyp = typ('Vertragspartner');
  const partnerReg = partnerTyp.register.find((r) => r.art === 'felder');
  await api('PUT', `/api/typen/${partnerTyp.id}`, {
    ...partnerTyp,
    felder: [...partnerTyp.felder, { key: 'portal_kennwort', label: 'Kennwort Kundenportal', typ: 'passwort', hilfe: 'Wird verschlüsselt gespeichert' }],
    register: partnerTyp.register.map((r) => (r === partnerReg ? { ...r, felder: [...(r.felder ?? []), 'portal_kennwort'] } : r)),
  });
  typen = await api('GET', '/api/typen');
  const stadtwerkeVorher = mappe('name', 'Stadtwerke Musterstadt');
  await api('PUT', `/api/mappen/${stadtwerkeVorher.id}`, { werte: { ...stadtwerkeVorher.werte, portal_kennwort: { neu: 'Sommer-2026!' } } });

  // Papierkorb (#43): eine Zahlung aus den Demo-Daten löschen
  const zahlung = alle.find((m) => m.typId === typ('Zahlung').id && m.demo) ?? alle.find((m) => m.typId === typ('Zahlung').id);
  await api('DELETE', `/api/mappen/${zahlung.id}`);

  // Texterkennung (#45): warten, bis die Beispieldokumente ihren Volltext haben
  for (let i = 0; i < 120; i++) {
    const z = (await api('GET', '/api/werkbank/texterkennung')).zaehler;
    if (!z.wartet && !z.laeuft) break;
    await new Promise((r) => setTimeout(r, 500));
  }

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
    benutzerTyp, rolleTyp, garten,
    mitglied: (await api('GET', '/api/benutzer')).find((b) => b.email === MITGLIED.email),
    strom,
    stadtwerke: mappe('name', 'Stadtwerke Musterstadt'),
    rechnung: mappe('rechnungsnummer', 'R-2026-117'),
  };
}

/* ---------- Seiten aufnehmen ---------- */

/** Einrichtungscode (#119): aus DMS_EINRICHTUNGSCODE oder der Datei unter DMS_DATENWURZEL/geheim. */
async function einrichtungscode() {
  if (process.env.DMS_EINRICHTUNGSCODE) return process.env.DMS_EINRICHTUNGSCODE;
  const datei = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../../../data'), 'geheim', 'EINRICHTUNGSCODE');
  for (let i = 0; i < 60; i++) {
    try { return (await readFile(datei, 'utf8')).trim(); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`Einrichtungscode nicht gefunden (${datei}).`);
}

/** Einrichtungsassistent (#119) im Browser durchgehen – mit Bildern jedes Schritts. */
async function einrichtenImBrowser(browser, bild) {
  const k = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin', deviceScaleFactor: 1 });
  const s = await k.newPage();
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Einrichtungscode' }).waitFor();
  await bild(s, 'einrichtung-code');
  await s.getByLabel('Einrichtungscode').fill(await einrichtungscode());
  await s.getByRole('button', { name: 'Weiter' }).click();
  const ohneDb = await s.getByRole('heading', { name: 'Datenbank', exact: true }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (ohneDb) {
    await s.getByLabel(/^Server/).fill(process.env.DB_HOST ?? 'db');
    await s.getByLabel(/^Passwort/).fill(process.env.DB_PASSWORT ?? 'dms');
    await s.getByRole('button', { name: 'Verbindung prüfen' }).click();
    await s.getByRole('button', { name: 'Übernehmen und weiter' }).waitFor();
    await bild(s, 'einrichtung-datenbank');
    await s.getByRole('button', { name: 'Übernehmen und weiter' }).click();
  }
  await s.getByRole('heading', { name: 'Neu einrichten oder wiederherstellen?' }).waitFor({ timeout: 90_000 });
  await bild(s, 'einrichtung-wahl');
  await s.getByRole('button', { name: /^Neu einrichten/ }).click();
  await s.getByLabel(/Name des Haushalts/).fill('Familie Beispiel');
  await bild(s, 'einrichtung-mandant');
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByLabel('Name', { exact: true }).fill(ADMIN.name);
  await s.getByLabel(/E-Mail-Adresse/).fill(ADMIN.email);
  await s.getByLabel(/^Passwort mindestens/).fill(ADMIN.passwort);
  await s.getByLabel('Passwort wiederholen').fill(ADMIN.passwort);
  await bild(s, 'einrichtung-administrator');
  await s.getByRole('button', { name: 'Administrator anlegen' }).click();
  // Den ersten normalen Benutzer legt das Skript danach mit Rolle an.
  await s.getByRole('heading', { name: 'Erster Benutzer' }).waitFor();
  await s.getByLabel('Name', { exact: true }).fill(MITGLIED.name);
  await s.getByLabel(/E-Mail-Adresse/).fill(MITGLIED.email);
  await bild(s, 'einrichtung-benutzer');
  await s.getByRole('button', { name: 'Überspringen' }).click();
  await s.getByRole('heading', { name: 'Schlüssel und Notfallblatt' }).waitFor();
  await s.getByRole('button', { name: 'Schlüssel erzeugen' }).click();
  await s.getByText(/Erledigt – Fingerabdruck/).waitFor();
  await bild(s, 'einrichtung-schluessel');
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByRole('heading', { name: 'Optionales' }).waitFor();
  await bild(s, 'einrichtung-optional', { fullPage: true });
  await s.getByRole('button', { name: 'Überspringen' }).click();
  await s.getByRole('heading', { name: /ist eingerichtet/ }).waitFor();
  await bild(s, 'einrichtung-fertig');
  await s.getByRole('button', { name: 'Zur Werkbank' }).click();
  await s.waitForURL(/\/werkbank/);
  const sitzung = (await k.cookies()).find((c) => c.name === 'dms_sitzung');
  if (!sitzung) throw new Error('Nach der Einrichtung keine Sitzung im Browser.');
  cookie = `${sitzung.name}=${sitzung.value}`;
  await k.close();
}

async function main() {
  await mkdir(ZIEL, { recursive: true });
  // Deutsche Oberfläche auch für Datumsfelder (Chromium richtet sich dafür nach --lang).
  const browser = await chromium.launch({ channel: 'chromium', args: ['--lang=de-DE'], env: { ...process.env, LANG: 'de_DE.UTF-8', LANGUAGE: 'de' } });
  const erstellt = [];
  const bild = async (seite, name, optionen = {}) => {
    await seite.waitForLoadState('networkidle');
    await seite.waitForTimeout(300);
    await seite.screenshot({ path: join(ZIEL, `${name}.png`), ...optionen });
    erstellt.push(name);
    console.log(`  ${name}.png`);
  };
  await warteAufServer();
  await einrichtenImBrowser(browser, bild);
  const d = await vorbereiten();
  const kontext = async (mitCookie = true, breite = 1440, hoehe = 860, adminHinweis = false) => {
    const k = await browser.newContext({ viewport: { width: breite, height: hoehe }, colorScheme: 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin', deviceScaleFactor: 1 });
    if (mitCookie) {
      const [name, wert] = d.adminCookie.split('=');
      await k.addCookies([{ name, value: wert, url: BASIS }]);
    }
    // Die Bilder der Ablage zeigen, was ein normaler Benutzer sieht: ohne den roten Admin-Hinweis (#128).
    if (!adminHinweis) await k.addInitScript(() => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.adminbanner{display:none!important}'; document.head.appendChild(st); }));
    return k;
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

  // Roter Hinweis für Administratoren in der Ablage (#128)
  {
    const k = await kontext(true, 1440, 420, true);
    const s = await k.newPage();
    await geheZu(s, '/ablage/eingang');
    await s.locator('.adminbanner').waitFor();
    await bild(s, 'admin-hinweis');
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
  // README (#290): breiter, doppelte Auflösung, hell und dunkel – feste Namen, die README holt sie vom Handbuch.
  for (const [schema, name] of [['light', 'readme'], ['dark', 'readme-dunkel']]) {
    const kr = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: schema, locale: 'de-DE', timezoneId: 'Europe/Berlin', deviceScaleFactor: 2 });
    const [cn, cw] = d.adminCookie.split('=');
    await kr.addCookies([{ name: cn, value: cw, url: BASIS }]);
    await kr.addInitScript(() => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.adminbanner{display:none!important}'; document.head.appendChild(st); }));
    const sr = await kr.newPage();
    await geheZu(sr, `/ablage/${vertrag.id}/${d.strom.id}`);
    await sr.getByRole('heading', { name: 'Stromvertrag Haus' }).waitFor();
    await bild(sr, name);
    await kr.close();
  }

  // Register mit Dokumenten
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  // Vorschaubilder der ersten Seite (#332) entstehen im Hintergrund – kurz warten, bis sie geladen sind.
  await s.waitForFunction(() => [...document.querySelectorAll('img.vorschaubild')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 }).catch(() => {});
  // Erstes anzeigbares Dokument öffnen: die Anzeige steht direkt unter seiner Zeile (#85).
  const anzeigbar = s.locator('.dokumentliste li.klickbar').first();
  if (await anzeigbar.count()) { await anzeigbar.locator('.dokname > button').first().click(); await s.waitForTimeout(800); }
  await bild(s, 'dokumente');

  // PDF bearbeiten (#335): Seitenansicht eines mehrseitigen Scans, eine Seite gedreht, Teilen ab Seite 3.
  await api('POST', `/api/mappen/${d.strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Scan Vertragsunterlagen.pdf')}&typ=application/pdf`,
    beispielPdf(['Vertrag Seite 1', 'Vertrag Seite 2', 'Preisblatt', 'Widerrufsbelehrung']), true);
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  const scan = s.locator('.dokumentliste li', { hasText: 'Scan Vertragsunterlagen.pdf' });
  await scan.getByRole('button', { name: 'Seiten', exact: true }).click();
  await s.waitForFunction(() => [...document.querySelectorAll('.seitenbild img')].length > 0 && [...document.querySelectorAll('.seitenbild img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20_000 }).catch(() => {});
  await s.getByRole('button', { name: 'Seite 2 nach rechts drehen' }).click();
  await s.locator('.seitenraster .seite').nth(2).getByRole('button', { name: 'Teilen ab hier' }).click();
  await s.locator('.pdfseiten').scrollIntoViewIfNeeded();
  await bild(s, 'pdf-bearbeiten');

  // Herunterladen mit Stempel (#394): Dialog am Scan, Vorlage „Kopie für …“ mit Empfänger.
  await s.locator('.pdfseiten').getByRole('button', { name: 'Abbrechen' }).click().catch(() => {});
  await scan.getByRole('button', { name: /Mit Stempel/ }).click();
  const stempel = s.locator('.stempeldialog');
  await stempel.locator('input[id$="-empfaenger"]').fill('Hausverwaltung Müller');
  await s.addStyleTag({ content: '.speicherleiste { position: static !important; }' });
  await stempel.scrollIntoViewIfNeeded();
  await stempel.screenshot({ path: join(ZIEL, 'stempel-herunterladen.png') });
  erstellt.push('stempel-herunterladen');
  await stempel.getByRole('button', { name: 'Schließen' }).click();

  // PDF verkleinern (#393): ein Foto-Scan mit 600 dpi, Dialog mit den drei Stufen.
  await api('POST', `/api/mappen/${d.strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Foto Zählerstand.pdf')}&typ=application/pdf`,
    fotoPdf(['Zählerstand 12.345 kWh', 'Ablesekarte Rückseite']), true);
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  const foto = s.locator('.dokumentliste li', { hasText: 'Foto Zählerstand.pdf' });
  await foto.getByRole('button', { name: 'Verkleinern', exact: true }).click();
  const klein = s.locator('.pdfseiten.verkleinern');
  await klein.locator('.stufenwahl').waitFor({ timeout: 30_000 });
  await klein.scrollIntoViewIfNeeded();
  await klein.screenshot({ path: join(ZIEL, 'pdf-verkleinern.png') });
  erstellt.push('pdf-verkleinern');
  await klein.getByRole('button', { name: 'Abbrechen' }).click();

  // Schwärzen (#392): Suchbegriff überall, IBAN als Vorschlag angehakt, Vorschau der schwarzen Bereiche.
  await api('POST', `/api/mappen/${d.strom.id}/dokumente?register=dokumente&name=${encodeURIComponent('Kontoauszug.pdf')}&typ=application/pdf`,
    beispielPdf('Anna Beispiel - IBAN DE89 3704 0044 0532 0130 00 - Telefon 0351 1234567'), true);
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  const auszug = s.locator('.dokumentliste li', { hasText: /^Kontoauszug\.pdf/ }).first();
  await auszug.getByRole('button', { name: 'Schwärzen', exact: true }).click();
  const schwarz = s.locator('.pdfseiten.schwaerzen');
  await schwarz.locator('.schwarz-seite img').first().waitFor({ timeout: 30_000 });
  await schwarz.getByLabel('Überall schwärzen').fill('Beispiel');
  await schwarz.getByRole('button', { name: 'Hinzufügen' }).click();
  await schwarz.locator('.schwarz-art', { hasText: 'IBAN' }).locator('legend input').check();
  await schwarz.getByRole('button', { name: 'Vorschau' }).click();
  await s.waitForTimeout(500);
  await schwarz.scrollIntoViewIfNeeded();
  // Die Speicherleiste der Mappe liegt unten über dem Dialog – für das Bild ausblenden.
  const ohneLeiste = await s.addStyleTag({ content: '.speicherleiste { visibility: hidden !important; }' });
  await schwarz.screenshot({ path: join(ZIEL, 'schwaerzen.png') });
  await ohneLeiste.evaluate((e) => e.remove());
  erstellt.push('schwaerzen');
  await schwarz.getByRole('button', { name: 'Abbrechen' }).click();

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

  // Volltextsuche (#45): Treffer im Text eines Dokuments
  await api('PUT', '/api/konto/einstellungen/suche_volltext', { wert: true });
  await geheZu(s, `/ablage/${vertrag.id}`);
  await s.getByPlaceholder('Suchen in Titel, Werten und Dokumenten …').fill('Preisanpassung');
  await s.locator('.fundstelle').first().waitFor();
  await bild(s, 'volltext-suche');
  await api('PUT', '/api/konto/einstellungen/suche_volltext', { wert: null });

  // Erweiterte Suche (#199): Formular links, Treffer mit Chips in der Mitte
  await geheZu(s, '/ablage/suche?typ=Rechnung&rechnungsdatum.von=2026-01-01&rechnungsdatum.bis=2026-12-31&bezahlt=ja');
  await s.locator('.suchchip').first().waitFor();
  await s.waitForTimeout(600);
  await bild(s, 'erweiterte-suche');

  // Passwortfeld (#46)
  await geheZu(s, `/ablage/${partner.id}/${d.stadtwerke.id}`);
  await s.locator('.passwort').first().waitFor();
  await bild(s, 'passwortfeld');

  // Formatierter Text, Notizen, Aufgabe, Protokoll, Aktionen (#53–#58)
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.locator('.formateingabe').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await bild(s, 'formatiert');
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  // Notizen als Register vor der Historie, „Mappe ▾“ neben dem Stern (#427)
  await s.getByRole('tab', { name: /Notizen/ }).click();
  await s.locator('.notizliste li').first().waitFor();
  await bild(s, 'notizen');
  await s.getByRole('tab', { name: 'Vertrag', exact: true }).click();
  await s.getByRole('button', { name: 'Mappe', exact: true }).click();
  await s.getByRole('menuitem', { name: /Aufgabe vergeben/ }).click();
  const neueAufgabe = s.getByRole('region', { name: 'Aufgabe vergeben' });
  await neueAufgabe.getByLabel('Empfänger').selectOption({ label: MITGLIED.name });
  await neueAufgabe.getByPlaceholder(/Rechnung/).fill('Sonderkündigung vorbereiten');
  await bild(s, 'aufgabe-vergeben');
  await neueAufgabe.getByRole('button', { name: 'Schließen' }).click();
  // Erinnern (#131) und Anstehend (#132)
  await s.getByRole('button', { name: 'Mappe', exact: true }).click();
  await s.getByRole('menuitem', { name: /Erinnern/ }).click();
  const erinnern = s.getByRole('region', { name: 'Erinnern' });
  await erinnern.getByPlaceholder(/Angebote/).fill('Angebote der anderen Stromanbieter vergleichen');
  await erinnern.getByRole('button', { name: 'Erinnern' }).click();
  await s.locator('.erinnerungen').waitFor();
  await bild(s, 'erinnerung');
  await geheZu(s, '/ablage/anstehend');
  await s.locator('.spalte.liste .mappenliste .eintrag').first().waitFor();
  await bild(s, 'anstehend');
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('tab', { name: 'Historie' }).click();
  await s.locator('.historie details').first().click();
  await bild(s, 'protokoll');
  await s.getByRole('button', { name: 'Mappe', exact: true }).click();
  await bild(s, 'aktionen');
  await s.getByRole('menuitem', { name: /E-Mail/ }).click();
  const email = s.getByRole('region', { name: 'Per E-Mail versenden' });
  await email.getByLabel(/^An/).fill('steuerberater@example.org');
  await email.getByLabel('Nachricht').fill('Hallo Frau Berger,\n\nanbei der Stromvertrag und die Preisanpassung.\n\nViele Grüße');
  await bild(s, 'email');
  await email.getByRole('button', { name: 'Schließen' }).click();

  // Post (#192): neuer Brief in „Neue Post“, Zuordnen zum Stromvertrag
  const brief = await api('POST', '/api/post', { betreff: 'Preisanpassung Strom 2027' });
  await api('POST', `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent('Preisanpassung 2027.pdf')}&typ=application/pdf`, beispielPdf('Preisanpassung zum 1. Januar 2027'), true);
  const neuePost = (await api('GET', '/api/sichten')).neuePost ?? brief.typId;
  await geheZu(s, `/ablage/${neuePost}/${brief.id}`);
  await s.locator('.postleiste').waitFor();
  await s.getByRole('button', { name: /Zuordnen/ }).click();
  const zu = s.getByRole('region', { name: 'Zuordnen' });
  await zu.getByLabel('Mappentyp').selectOption({ value: vertrag.id });
  await zu.getByPlaceholder(/suchen/).fill('Strom');
  await zu.locator('.zuordnen-treffer button').first().click();
  await bild(s, 'post-zuordnen');

  // Neue Post von überall (#193): zwei Dateien irgendwo ins Fenster ziehen → eine Post mit beiden.
  await geheZu(s, `/ablage/${vertrag.id}`);
  // Je Seite neu erzeugen: ein JSHandle gilt nur auf der Seite, auf der es entstand.
  const neueDateien = () => s.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['Kündigung Fitnessstudio zum 31.12.'], 'Kündigung Fitnessstudio.txt', { type: 'text/plain' }));
    dt.items.add(new File(['Mitgliedsnummer 4711'], 'Notiz zur Kündigung.txt', { type: 'text/plain' }));
    return dt;
  });
  let dateien = await neueDateien();
  await s.dispatchEvent('body', 'dragenter', { dataTransfer: dateien });
  await s.locator('.ablageflaeche').waitFor();
  await bild(s, 'post-ablegen');
  await s.dispatchEvent('.ablageflaeche .ablageziel', 'drop', { dataTransfer: dateien });
  await s.waitForURL(/\/ablage\/[^/]+\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await s.locator('.postleiste').waitFor();
  const neu = await api('GET', `/api/mappen/${s.url().split('/').pop()}`);
  if (neu.dokumente.length !== 2) throw new Error(`Ablegen (#193): ${neu.dokumente.length} statt 2 Dokumente in der neuen Post`);
  // Auf einer Mappe mit Dokumentenregister: zwei Ziele.
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('tab', { name: 'Vertragsunterlagen' }).click();
  dateien = await neueDateien();
  await s.dispatchEvent('body', 'dragenter', { dataTransfer: dateien });
  await s.locator('.ablageflaeche.zwei').waitFor();
  await bild(s, 'post-ablegen-mappe');
  await s.keyboard.press('Escape');
  // „+ Neu“ in der Kopfzeile
  await s.getByRole('button', { name: '+ Neu' }).click();
  await s.getByRole('menuitem', { name: /Mappe/ }).waitFor();
  await bild(s, 'neu-knopf');
  await s.keyboard.press('Escape');

  // Papierkorb in der Ablage (#43)
  await geheZu(s, '/ablage/papierkorb');
  await s.locator('.spalte.liste .eintrag, .spalte.liste tbody tr').first().click();
  await s.getByRole('button', { name: 'Wiederherstellen' }).waitFor();
  await bild(s, 'papierkorb');

  // Sprechender Link (#98): Trefferliste mit der ersten Mappe geöffnet, „Link kopieren“, Fehlermeldung
  await geheZu(s, '/ablage/link?typ=Rechnung&bezahlt=nein&sortierung=-rechnungsdatum');
  await s.locator('.spalte.mappe .mappenkopf h1').waitFor();
  await bild(s, 'direktlink');
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('button', { name: 'Mappe', exact: true }).click();
  await s.getByRole('menuitem', { name: /Link kopieren/ }).click();
  await s.locator('.linkkopiert').waitFor();
  await bild(s, 'link-kopieren');
  await geheZu(s, '/ablage/link?typ=Rechnung&rechnungsnumer=R-2026-117');
  await s.locator('.spalte.liste [role="alert"]').waitFor();
  await bild(s, 'direktlink-fehler');

  // Breite Liste als Tabelle: Liste breit ziehen (gemerkt je Gerät), danach zurücksetzen
  const breitSchluessel = `dms:bereiche:ablage:${d.admin.id}`;
  await s.evaluate(([key]) => localStorage.setItem(key, JSON.stringify({ l: 220, m: 900, rechtsZu: true })), [breitSchluessel]);
  await geheZu(s, `/ablage/${rechnung.id}`);
  await s.locator('.trefferliste table').waitFor();
  await bild(s, 'tabelle');
  await s.evaluate(([key]) => localStorage.removeItem(key), [breitSchluessel]);

  // Favoriten (#62): zwei Mappen mit Stern, Sicht „Favoriten“ mit geöffneter Mappe
  await api('PUT', `/api/mappen/${d.strom.id}/favorit`);
  await api('PUT', `/api/mappen/${d.stadtwerke.id}/favorit`);
  await geheZu(s, `/ablage/favoriten/${d.strom.id}`);
  await s.getByRole('heading', { name: 'Stromvertrag Haus' }).waitFor();
  await bild(s, 'favoriten');

  // Mehrere Trefferlisten (#75): „Kurz“ bei Rechnung, im Register des Vertragspartners als Tabelle
  const rechnungAktuell = (await api('GET', '/api/typen')).find((t) => t.id === rechnung.id);
  await api('PUT', `/api/typen/${rechnung.id}`, { ...rechnungAktuell, trefferliste: undefined,
    trefferlisten: [...rechnungAktuell.trefferlisten, { key: 'kurz', name: 'Kurz', spalten: ['_titel', 'betrag', 'rechnungsdatum', 'bezahlt'] }] });
  const partnerAktuell = (await api('GET', '/api/typen')).find((t) => t.id === partner.id);
  await api('PUT', `/api/typen/${partner.id}`, { ...partnerAktuell, register: partnerAktuell.register.map((r) => (r.key === 'rechnungen'
    ? { ...r, quellen: (r.quellen ?? []).map((q) => (q.typId === rechnung.id ? { ...q, trefferliste: 'kurz' } : q)) } : r)) });
  await geheZu(s, `/werkbank/typen/${rechnung.id}#trefferlisten`);
  await s.locator('.trefferlistenblock').nth(1).scrollIntoViewIfNeeded();
  await bild(s, 'werkbank-trefferlisten');
  await geheZu(s, `/ablage/${partner.id}/${d.stadtwerke.id}`);
  await s.getByRole('tab', { name: /Rechnungen/ }).click();
  await s.locator('.verweistabelle table').waitFor();
  await bild(s, 'verknuepfungen-tabelle');
  // Mappe löschen (#423): Auf die Stadtwerke verweisen Verträge – „Warum nicht?“ am grauen Knopf.
  await s.getByRole('button', { name: 'Warum nicht?' }).click();
  await s.locator('.loeschwahl-begruendung').waitFor();
  await bild(s, 'mappe-loeschen-warum');
  await s.keyboard.press('Escape');

  // Eingang: eine Pflichtfeld-Änderung macht Mappen unpassend
  // Ein neues Pflichtfeld trifft sicher alle Vertragspartner (Demo-Daten sind zufällig).
  const stammdaten = partner.register.find((r) => r.art === 'felder');
  const kundennr = {
    ...partner,
    felder: [...partner.felder, { key: 'steuernummer', label: 'Steuernummer', typ: 'text', pflicht: true }],
    register: partner.register.map((r) => (r === stammdaten ? { ...r, felder: [...(r.felder ?? []), 'steuernummer'] } : r)),
  };
  await api('PUT', `/api/typen/${partner.id}`, kundennr);
  await geheZu(s, '/ablage/eingang');
  await s.locator('.mappenliste .eintrag, .trefferliste tbody tr').first().click();
  await bild(s, 'eingang');
  // Startseite (#334): Kacheln, solange „Zu erledigen“ etwas enthält.
  await geheZu(s, '/ablage/start');
  await s.locator('.kacheln').waitFor();
  await bild(s, 'startseite');
  // Startseite über Mitte und rechts (#429); eine zuletzt geöffnete Mappe öffnet wieder die Dreiteilung.
  await s.locator('.zuletzt .eintrag').first().click();
  await s.locator('.spalte.mappe .mappenkopf h1').waitFor();
  await bild(s, 'startseite-mappe');
  await api('PUT', `/api/typen/${partner.id}`, partner);

  // Sichten als Baum in der Ablage und in der Werkbank (#38)
  await geheZu(s, `/ablage/${d.finanzen.id}`);
  await s.locator('.spalte.liste .eintrag, .spalte.liste tbody tr').first().waitFor();
  await bild(s, 'sichten-baum');
  await geheZu(s, `/werkbank/sichten/${d.fristen.id}#bedingungen`);
  await s.getByRole('heading', { name: 'Bedingungen' }).waitFor();
  await s.getByText('Diese Ansicht zeigt zurzeit').waitFor();
  await bild(s, 'werkbank-sichten');

  // Benutzer und Rollen in der Ablage
  await geheZu(s, `/ablage/${d.rolleTyp.id}`);
  await s.locator('.mappenliste .eintrag').filter({ hasText: 'Steuern und Finanzen' }).click();
  await s.getByRole('tab', { name: 'Benutzer' }).click();
  await bild(s, 'rolle');
  await geheZu(s, `/ablage/${d.benutzerTyp.id}/${d.mitglied.id}`);
  await bild(s, 'benutzer-mappe');

  // Berechtigungen (#123–#127, #142): Regeln am Mappentyp Vertrag, Prüfung, „Meine Rechte“ eines Mitglieds
  await api('PUT', `/api/werkbank/berechtigungen/${vertrag.id}`, { bestaetigt: true, berechtigungen: { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [
    { id: 'garten', name: 'Haus und Garten darf alles', wenn: [{ art: 'rolle', rollen: [d.garten.id] }], dann: { C: 'erteilen', R: 'erteilen', U: 'erteilen', D: 'erteilen', P: 'erteilen' }, stopp: true },
    { id: 'andere', name: 'Sonst bearbeitet nur, wer verantwortlich ist', wenn: [{ art: 'feld', nicht: true, bedingung: { art: 'feld', feld: 'verantwortlich', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: false },
  ] } });
  await geheZu(s, `/werkbank/typen/${vertrag.id}#berechtigungen`);
  await s.locator('#berechtigungen .regel').first().waitFor();
  await s.locator('#berechtigungen').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-berechtigungen');
  {
    await s.locator('.sprungleiste').getByRole('button', { name: 'Testlauf' }).click();
    const test = s.locator('#testlauf');
    // Benutzer und Testmappe wie im Verweisfeld (#371); das Ergebnis erscheint ohne „Prüfen“.
    await test.getByLabel('Benutzer', { exact: true }).fill(MITGLIED.name);
    await test.locator('.wahlliste button').first().click();
    await test.getByLabel('Testmappe', { exact: true }).fill('Stromvertrag');
    await test.locator('.wahlliste button').first().click();
    await s.locator('.testlauf table').waitFor();
    await test.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await bild(s, 'werkbank-berechtigungen-testlauf');
  }
  {
    const anm = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: MITGLIED.email, passwort: MITGLIED.passwort }) });
    const [name, wert] = (anm.headers.get('set-cookie') ?? '').split(';')[0].split('=');
    const km = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    await km.addCookies([{ name, value: wert, url: BASIS }]);
    const sm = await km.newPage();
    await geheZu(sm, '/profil/konto');
    const blatt = sm.locator('.blatt', { hasText: 'Meine Rechte' });
    await blatt.locator('table').waitFor();
    await blatt.scrollIntoViewIfNeeded();
    const box = await blatt.boundingBox();
    await bild(sm, 'meine-rechte', { clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
    await km.close();
  }

  // Benutzermenü
  await geheZu(s, '/ablage');
  await s.locator('.benutzermenue .wer').click();
  await s.locator('.benutzermenue .menue').waitFor();
  await bild(s, 'benutzermenue', { clip: { x: 1440 - 420, y: 0, width: 420, height: 360 } });
  await s.keyboard.press('Escape');

  // Profil (#69) und Fehler melden (#70)
  await geheZu(s, '/profil/sicherheit');
  await s.getByRole('heading', { name: 'Meine angemeldeten Geräte' }).waitFor();
  await bild(s, 'profil', { fullPage: true });
  await geheZu(s, '/profil/fehler-melden');
  await s.getByPlaceholder(/Beim Speichern/).fill('Beim Speichern einer Rechnung kam „Fehler 500“, nachdem ich ein Dokument hinzugefügt hatte.');
  await s.getByText('Technische Angaben ansehen').click();
  await bild(s, 'fehler-melden');
  await s.getByRole('button', { name: 'An die Administratoren senden' }).click();
  await s.getByText('Deine Meldung ist bei den Administratoren angekommen.').waitFor();
  await geheZu(s, '/api-doku');
  await bild(s, 'api-doku');

  // Werkbank: Übersicht (#68) und Fehlermeldungen (#70)
  await geheZu(s, '/werkbank');
  await s.locator('.uebersicht .kacheln').waitFor();
  await bild(s, 'werkbank-uebersicht');
  // Werkbank anpassen (#281) mit der Vorlage Haushalt, danach wieder alles.
  await api('PUT', '/api/werkbank/ansicht', { installation: { vorlage: 'haushalt', ein: [], aus: [] } });
  await geheZu(s, '/werkbank/ansicht');
  await s.getByRole('heading', { name: /Werkbank anpassen/, level: 1 }).waitFor();
  await bild(s, 'werkbank-anpassen');
  await api('PUT', '/api/werkbank/ansicht', { installation: { vorlage: 'alles', ein: [], aus: [] } });
  await geheZu(s, '/werkbank/fehlermeldungen');
  await s.locator('.spalte.liste .eintrag').first().click();
  await s.getByRole('heading', { name: 'Technische Angaben' }).waitFor();
  await bild(s, 'werkbank-fehlermeldung');
  // Werkbank
  // Bestehende Typen starten eingeklappt (#144): Übersicht mit Kurzinfos, dann „Felder“ aufklappen.
  await s.evaluate(() => { try { localStorage.removeItem('dms.typeditor.offen'); } catch { /* egal */ } });
  await geheZu(s, `/werkbank/typen/${vertrag.id}`);
  await bild(s, 'werkbank-mappentyp');
  await s.locator('.sprungleiste').getByRole('button', { name: 'Felder' }).click();
  await s.locator('button.feldkopfknopf').filter({ hasText: 'Kündigung bis' }).click();
  await s.locator('.feldzeile.offen').scrollIntoViewIfNeeded();
  await bild(s, 'werkbank-feld');
  // Fristen (#129): Erinnerung am Datumsfeld
  await s.locator('.fristeditor').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await bild(s, 'werkbank-frist');
  await geheZu(s, `/werkbank/typen/${d.benutzerTyp.id}`);
  await bild(s, 'werkbank-systemtyp');
  await geheZu(s, `/werkbank/benutzer/${d.mitglied.id}`);
  await bild(s, 'werkbank-benutzer');
  await geheZu(s, '/werkbank/benutzer/neu');
  await bild(s, 'werkbank-benutzer-neu');
  // Archivnummern (#345): Aufkleber drucken beim Nummernkreis „Archivnummer“.
  await geheZu(s, '/werkbank/nummernkreise/archivnummer');
  await s.getByRole('heading', { name: /Aufkleber drucken/ }).waitFor();
  await s.getByRole('heading', { name: /Aufkleber drucken/ }).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-aufkleber');
  // Stempel (#394): Vorlage „Kopie für …“ mit Vorschau.
  await geheZu(s, '/werkbank/stempel?offen=kopie');
  await s.locator('.stempeleditor').waitFor();
  await bild(s, 'werkbank-stempel');
  // Datenschutz (#396): Vertragspartner „betrifft eine Person“, Auskunft für die Stadtwerke gesammelt – Prüfliste.
  await api('PUT', '/api/werkbank/datenschutz', { verantwortlicher: 'Familie Beispiel\nMusterweg 1, 01067 Dresden', empfaenger: '', typen: { [d.typ('Vertragspartner').id]: { person: true, zweck: 'Verträge und Rechnungen des Haushalts' } } });
  await geheZu(s, `/werkbank/datenschutz?mappe=${d.stadtwerke.id}`);
  await s.getByRole('button', { name: 'Sammeln', exact: true }).click();
  await s.getByRole('heading', { name: '3. Prüfen' }).waitFor();
  await s.getByRole('heading', { name: '3. Prüfen' }).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-datenschutz');
  // Auskunft zustellen (#455): Auskunft mit Passwort erzeugen, Abruf-Link erstellen (ohne Mail) – Link und Code.
  {
    const v = await api('POST', '/api/werkbank/auskunft/vorschau', { mappeId: d.stadtwerke.id, tiefe: 1, vorschlaege: false });
    const x = v.mappen[d.stadtwerke.id];
    await api('POST', '/api/werkbank/auskunft', { mappeId: d.stadtwerke.id, tiefe: 1, geprueft: true, passwort: 'Handbuch-Passwort-2026',
      auswahl: { mappen: [d.stadtwerke.id], dokumente: x.dokumente.map((y) => y.id), notizen: x.notizen.map((y) => y.id), historie: [d.stadtwerke.id], ohneNotizen: [] } });
    await warteAufAuftrag();
    await geheZu(s, '/werkbank/datenschutz');
    await s.getByRole('button', { name: 'Zustellen …' }).first().click();
    await s.getByRole('radio', { name: /Abruf-Link mit Abrufcode/ }).check();
    await s.getByRole('checkbox', { name: /Link per E-Mail/ }).uncheck();
    await s.getByRole('button', { name: 'Abruf-Link erstellen' }).click();
    await s.locator('.auskunft-code').waitFor();
    const url = await s.locator('.auskunft-url').inputValue();
    await s.locator('.auskunft-zustellen').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await bild(s, 'werkbank-datenschutz-zustellen');
    // Öffentliche Abrufseite: ohne Sitzung, wie die Person sie sieht.
    const ka = await kontext(false, 900, 640);
    const sa = await ka.newPage();
    await geheZu(sa, new URL(url).pathname + new URL(url).hash);
    await sa.getByRole('heading', { name: 'Auskunft abrufen' }).waitFor();
    await bild(sa, 'abrufseite');
    await ka.close();
  }
  // Pakete (#369): Abschnitt „Expertenmodus“ aufgeklappt unter den Knöpfen (ohne Katalogabruf).
  await geheZu(s, '/werkbank/pakete');
  await s.getByRole('button', { name: /Expertenmodus/ }).click();
  await s.getByRole('heading', { name: 'Paket hochladen' }).waitFor();
  await bild(s, 'werkbank-pakete');
  await s.getByRole('button', { name: /Expertenmodus/ }).click();
  // Postfächer (#358): Anmeldung mit OAuth 2.0 – App eingetragen, noch nicht angemeldet (kein echter Anbieter).
  await api('PUT', '/api/werkbank/postfaecher-oauth/microsoft', { clientId: '0b5c6a1e-1234-4c8d-9e0f-5a6b7c8d9e0f', clientSecret: 'nur-fuer-bilder', tenant: 'common' });
  const pfOauth = (await api('POST', '/api/werkbank/postfaecher', { name: 'Büro', aktiv: false, server: 'outlook.office365.com', benutzer: 'buero@example.org', anmeldung: 'oauth', anbieter: 'microsoft' })).at(-1);
  await geheZu(s, `/werkbank/postfaecher/${pfOauth.id}`);
  await s.getByRole('heading', { name: /Anmeldung per OAuth 2.0/ }).waitFor();
  await s.getByRole('heading', { name: /Anmeldung per OAuth 2.0/ }).evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-postfach-oauth');
  await geheZu(s, '/werkbank/designs');
  await s.locator('.spalte.liste a.eintrag').first().click();
  await bild(s, 'werkbank-designs');
  await geheZu(s, '/werkbank/protokoll');
  await bild(s, 'werkbank-protokoll');
  await geheZu(s, '/werkbank/betrieb');
  await s.getByRole('heading', { name: 'E-Mail-Versand' }).waitFor();
  await bild(s, 'werkbank-betrieb');
  await geheZu(s, '/werkbank/verschluesselung');
  await s.getByRole('heading', { name: /^Schlüssel\b/ }).first().waitFor();
  await bild(s, 'werkbank-verschluesselung');
  await geheZu(s, '/werkbank/aufgaben');
  await s.getByRole('heading', { name: 'Tägliche Zusammenfassung' }).waitFor();
  // #366: Mitte Zusammenfassung und Liste mit Filter, rechts die Mappe der ersten Aufgabe.
  if (await s.locator('.spalte.liste a.eintrag').count()) await s.locator('.spalte.liste a.eintrag').first().click();
  await bild(s, 'werkbank-aufgaben');
  await geheZu(s, '/werkbank/papierkorb');
  await s.getByRole('heading', { name: 'Aufbewahrung', exact: true }).waitFor();
  // #366: Aufbewahrung und Liste in der Mitte, rechts die gewählte Mappe.
  if (await s.locator('.spalte.liste a.eintrag, .spalte.liste tbody tr').count()) {
    await s.locator('.spalte.liste a.eintrag, .spalte.liste tbody tr').first().click();
    await s.getByRole('button', { name: 'Wiederherstellen' }).first().waitFor();
  }
  await bild(s, 'werkbank-papierkorb');
  await geheZu(s, '/werkbank/texterkennung');
  await s.getByRole('heading', { name: 'Werkzeuge', exact: true }).waitFor();
  await s.getByRole('heading', { name: 'Aufträge', exact: true }).waitFor();
  await bild(s, 'werkbank-texterkennung');
  // Ohne Mitte (#366): lange Zugriffe unter den Einstellungen, „Installiert“ unter „Neuere Versionen“.
  await geheZu(s, '/werkbank/datenbank');
  await s.getByRole('heading', { name: /Lange Datenbankzugriffe/ }).waitFor();
  await bild(s, 'werkbank-datenbank');
  await geheZu(s, '/werkbank/technik');
  await s.getByRole('heading', { name: 'Installiert', exact: true }).waitFor();
  await bild(s, 'werkbank-technik');
  await geheZu(s, '/werkbank/speicherplatz');
  await s.getByRole('heading', { name: 'Schwellen', exact: true }).waitFor();
  await bild(s, 'werkbank-speicherplatz');
  await geheZu(s, '/werkbank/demo');
  // Mit Dokumenten (#365): Schieberegler, Mischung und Abschätzung sichtbar.
  await s.locator('#demo-dokumente').check();
  await s.getByText('Abschätzung:').waitFor();
  await bild(s, 'werkbank-demo');

  // Sicherung (#103–#106): jetzt sichern, Notfallblatt herunterladen (als Bild fürs Handbuch), Zeitplan
  await geheZu(s, '/werkbank/sicherung');
  await s.getByRole('button', { name: 'Jetzt sichern' }).click();
  await s.getByText(/Sicherung fertig/).waitFor({ timeout: 120_000 });
  const download = s.waitForEvent('download');
  await s.locator('#notfallblatt').getByRole('link', { name: /Notfallblatt herunterladen/ }).click();
  const pdf = join(ZIEL, 'notfallblatt.pdf');
  await (await download).saveAs(pdf);
  try {
    execFileSync('pdftoppm', ['-png', '-r', '80', '-singlefile', pdf, join(ZIEL, 'notfallblatt')]);
    erstellt.push('notfallblatt');
    console.log('  notfallblatt.png');
  } catch (e) { console.warn(`Notfallblatt nicht als Bild: ${e.message}`); }
  await rm(pdf, { force: true });
  await geheZu(s, '/werkbank/sicherung');
  await s.locator('#liste tbody tr').first().waitFor();
  await bild(s, 'werkbank-sicherung');
  await s.locator('#zeitplan').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-sicherung-zeitplan');
  // Probe-Wiederherstellung (#109)
  await s.getByRole('button', { name: 'Jetzt probeweise wiederherstellen' }).click();
  await s.locator('#probe .chip.gut').first().waitFor({ timeout: 120_000 });
  await s.locator('#probe').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-sicherung-probe');

  // Wartungsmodus (#102): ankündigen, Banner bei einem Mitglied, danach beenden – ganz am Ende,
  // weil die Wartung Anmeldungen sperrt.
  const mitgliedAnmeldung = await fetch(`${BASIS}/api/konto/anmelden`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json' }, body: JSON.stringify({ email: MITGLIED.email, passwort: MITGLIED.passwort }) });
  const mitgliedCookie = (mitgliedAnmeldung.headers.get('set-cookie') ?? '').split(';')[0];
  await geheZu(s, '/werkbank/wartungsmodus');
  await s.getByLabel(/Text für alle/).fill('Update auf die neue Version');
  // #402: Zeitschiene Beginn → Ende mit Satz darunter und „Jetzt sofort sperren“ – vor dem Ankündigen.
  await s.getByLabel(/Erwartetes Ende/).fill(await s.locator('#wartung-beginn').evaluate((e) => {
    const d = new Date(new Date(e.value).getTime() + 3600_000); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }));
  await s.getByRole('button', { name: 'Jetzt sofort sperren' }).waitFor();
  await bild(s, 'werkbank-wartungsmodus');
  await s.getByRole('button', { name: 'Wartung ankündigen' }).click();
  await s.locator('.wartungsbanner').waitFor();
  if (mitgliedCookie) {
    const km = await browser.newContext({ viewport: { width: 1100, height: 620 }, colorScheme: 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    const [name, wert] = mitgliedCookie.split('=');
    await km.addCookies([{ name, value: wert, url: BASIS }]);
    const sm = await km.newPage();
    await geheZu(sm, '/ablage/eingang');
    await sm.locator('.wartungsbanner').waitFor();
    await bild(sm, 'wartung-banner', { clip: { x: 0, y: 0, width: 1100, height: 220 } });
    await km.close();
  }
  // Wiederherstellen (#107): nur im aktiven Wartungsmodus – Abgleich einer Sicherung, ohne zu starten.
  // Rückfragen sind eigene Dialoge (#355), keine Browser-Fenster.
  await s.getByRole('button', { name: 'Alle jetzt abmelden' }).click();
  await s.getByRole('alertdialog').getByRole('button', { name: 'Alle abmelden' }).click();
  await s.getByText('Wartungsmodus aktiv', { exact: false }).first().waitFor();
  await geheZu(s, '/werkbank/wiederherstellung');
  await s.locator('.auswahlliste input[type=radio]').first().check();
  await s.getByRole('heading', { name: /Abgleich/ }).waitFor();
  await bild(s, 'werkbank-wiederherstellen');
  await geheZu(s, '/werkbank/wartungsmodus');
  await s.getByRole('button', { name: 'Wartung beenden' }).click();
  await s.locator('.wartungsbanner').waitFor({ state: 'detached' });

  // Schlüssel wechseln (#47) – ganz am Ende, weil danach Notfallblatt und Sicherungen auf den alten Schlüssel zeigen.
  await geheZu(s, '/werkbank/verschluesselung');
  await s.getByRole('button', { name: 'Schlüssel wechseln' }).click();
  const frage = s.getByRole('alertdialog');
  await frage.getByRole('textbox').fill('wechseln');
  await bild(s, 'rueckfrage');
  await frage.getByRole('button', { name: 'Schlüssel wechseln' }).click();
  await s.locator('#wechseln .hinweis.gut').waitFor();
  await s.locator('#wechseln').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await bild(s, 'werkbank-schluesselwechsel');

  // Die API-Beschreibung dieser Version für das Administratorhandbuch
  await writeFile(join(ZIEL, 'openapi.json'), JSON.stringify(await (await fetch(`${BASIS}/api/openapi.json`)).json(), null, 2));

  await browser.close();
  console.log(`${erstellt.length} Bilder in ${ZIEL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
