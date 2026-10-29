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
import { mkdir, rm, writeFile } from 'node:fs/promises';
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
  // Schlüssel für Passwörter (#39) – sonst steht über der Werkbank ein Hinweis.
  await api('POST', '/api/werkbank/tresor/erzeugen');
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
  // dazu eine formatierte Bemerkung (#53) und ein Protokollregister (#57)
  const felder = [...vertrag.felder,
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id, verweisart: 'bezug', hilfe: 'Wer die Fristen im Blick behält' },
    { key: 'bemerkung', label: 'Bemerkung', typ: 'formatiert' }];
  const register = [...vertrag.register.map((r) => (r.art === 'felder' && r.key === 'vertrag' ? { ...r, felder: [...(r.felder ?? vertrag.felder.map((f) => f.key)), 'verantwortlich', 'bemerkung'] } : r)),
    { key: 'protokoll', name: 'Protokoll', art: 'protokoll' }];
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
  // Erstes anzeigbares Dokument öffnen: die Anzeige steht direkt unter seiner Zeile (#85).
  const anzeigbar = s.locator('.dokumentliste li.klickbar').first();
  if (await anzeigbar.count()) { await anzeigbar.locator('.dokname > button').first().click(); await s.waitForTimeout(800); }
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

  // Volltextsuche (#45): Treffer im Text eines Dokuments
  await api('PUT', '/api/konto/einstellungen/suche_volltext', { wert: true });
  await geheZu(s, `/ablage/${vertrag.id}`);
  await s.getByPlaceholder('Suchen in Titel, Werten und Dokumenten …').fill('Preisanpassung');
  await s.locator('.fundstelle').first().waitFor();
  await bild(s, 'volltext-suche');
  await api('PUT', '/api/konto/einstellungen/suche_volltext', { wert: null });

  // Passwortfeld (#46)
  await geheZu(s, `/ablage/${partner.id}/${d.stadtwerke.id}`);
  await s.locator('.passwort').first().waitFor();
  await bild(s, 'passwortfeld');

  // Formatierter Text, Notizen, Aufgabe, Protokoll, Aktionen (#53–#58)
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.locator('.formateingabe').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await bild(s, 'formatiert');
  await geheZu(s, `/ablage/${vertrag.id}/${d.strom.id}`);
  await s.getByRole('button', { name: /Notizen/ }).click();
  await s.locator('.notizliste li').first().waitFor();
  await bild(s, 'notizen');
  await s.getByRole('button', { name: /Notizen/ }).click();
  await s.getByRole('button', { name: /Aktionen/ }).click();
  await s.getByRole('menuitem', { name: /Aufgabe vergeben/ }).click();
  const neueAufgabe = s.getByRole('region', { name: 'Aufgabe vergeben' });
  await neueAufgabe.getByLabel('Empfänger').selectOption({ label: MITGLIED.name });
  await neueAufgabe.getByPlaceholder(/Rechnung/).fill('Sonderkündigung vorbereiten');
  await bild(s, 'aufgabe-vergeben');
  await neueAufgabe.getByRole('button', { name: 'Schließen' }).click();
  await s.getByRole('tab', { name: 'Protokoll' }).click();
  await s.locator('.historie details').first().click();
  await bild(s, 'protokoll');
  await s.getByRole('button', { name: /Aktionen/ }).click();
  await bild(s, 'aktionen');
  await s.getByRole('menuitem', { name: /E-Mail/ }).click();
  const email = s.getByRole('region', { name: 'Per E-Mail versenden' });
  await email.getByLabel(/^An/).fill('steuerberater@example.org');
  await email.getByLabel('Nachricht').fill('Hallo Frau Berger,\n\nanbei der Stromvertrag und die Preisanpassung.\n\nViele Grüße');
  await bild(s, 'email');

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
  await s.getByRole('button', { name: /Aktionen/ }).click();
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
  await geheZu(s, `/werkbank/typen/${rechnung.id}`);
  await s.locator('.trefferlistenblock').nth(1).scrollIntoViewIfNeeded();
  await bild(s, 'werkbank-trefferlisten');
  await geheZu(s, `/ablage/${partner.id}/${d.stadtwerke.id}`);
  await s.getByRole('tab', { name: /Rechnungen/ }).click();
  await s.locator('.verweistabelle table').waitFor();
  await bild(s, 'verknuepfungen-tabelle');

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
  await geheZu(s, '/werkbank/fehlermeldungen');
  await s.locator('.spalte.liste .eintrag').first().click();
  await s.getByRole('heading', { name: 'Technische Angaben' }).waitFor();
  await bild(s, 'werkbank-fehlermeldung');
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
  await geheZu(s, '/werkbank/verschluesselung');
  await s.getByRole('heading', { name: /^Schlüssel\b/ }).waitFor();
  await bild(s, 'werkbank-verschluesselung');
  await geheZu(s, '/werkbank/aufgaben');
  await s.getByRole('heading', { name: 'Tägliche Zusammenfassung' }).waitFor();
  await bild(s, 'werkbank-aufgaben');
  await geheZu(s, '/werkbank/papierkorb');
  await s.getByRole('heading', { name: 'Aufbewahrung', exact: true }).waitFor();
  await bild(s, 'werkbank-papierkorb');
  await geheZu(s, '/werkbank/texterkennung');
  await s.getByRole('heading', { name: 'Werkzeuge', exact: true }).waitFor();
  await s.getByRole('heading', { name: 'Aufträge', exact: true }).waitFor();
  await bild(s, 'werkbank-texterkennung');
  await geheZu(s, '/werkbank/datenbank');
  await bild(s, 'werkbank-datenbank');
  await geheZu(s, '/werkbank/technik');
  await bild(s, 'werkbank-technik');
  await geheZu(s, '/werkbank/speicherplatz');
  await s.getByRole('heading', { name: 'Schwellen', exact: true }).waitFor();
  await bild(s, 'werkbank-speicherplatz');
  await geheZu(s, '/werkbank/demo');
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
  await s.getByRole('button', { name: 'Wartung ankündigen' }).click();
  await s.locator('.wartungsbanner').waitFor();
  await bild(s, 'werkbank-wartungsmodus');
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
  s.once('dialog', (dialog) => void dialog.accept());
  await s.getByRole('button', { name: 'Alle jetzt abmelden' }).click();
  await s.getByText('Wartungsmodus aktiv', { exact: false }).first().waitFor();
  await geheZu(s, '/werkbank/wiederherstellung');
  await s.locator('.auswahlliste input[type=radio]').first().check();
  await s.getByRole('heading', { name: /Abgleich/ }).waitFor();
  await bild(s, 'werkbank-wiederherstellen');
  await geheZu(s, '/werkbank/wartungsmodus');
  await s.getByRole('button', { name: 'Wartung beenden' }).click();
  await s.locator('.wartungsbanner').waitFor({ state: 'detached' });

  // Die API-Beschreibung dieser Version für das Administratorhandbuch
  await writeFile(join(ZIEL, 'openapi.json'), JSON.stringify(await (await fetch(`${BASIS}/api/openapi.json`)).json(), null, 2));

  await browser.close();
  console.log(`${erstellt.length} Bilder in ${ZIEL}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
