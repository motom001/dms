/**
 * Rauchtests: Werkbank-Seiten rund um die Post – Stempel ohne rote Schrift mit offener Vorschau (#1185), Postfach-Stand
 * in einem Satz mit „Frühere Störungen“ (#1186), Eingangsordner mit der kurzen Zeile am Haken (#1187).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-post.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Farbe der Schrift als Vergleichswert und die Fehlerfarbe der Seite (--schlecht), beide aufgelöst. */
const farben = (el) => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--schlecht)';
  document.body.append(probe);
  const rot = getComputedStyle(probe).color;
  probe.remove();
  return { schrift: getComputedStyle(el).color, rot };
};

rauchtest('Stempel: Liste zweizeilig ohne rote Schrift, Farbpunkt, Vorschau offen; axe hell und dunkel (#1185)', { als: LENA, timeout: 90_000 }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await s.goto(BASIS + '/werkbank/stempel/kopie');
    const elemente = s.getByRole('region', { name: 'Elemente' });
    const eintrag = elemente.getByRole('link', { name: /^Kopie für/ }).first();
    await eintrag.waitFor();
    // Zwei Zeilen: Titel (mit Farbpunkt) und eine leise Zeile darunter – keine in der Stempelfarbe.
    assert.equal(await eintrag.locator(':scope > span').count(), 2, 'Stempel in der Liste zweizeilig');
    await eintrag.getByRole('img', { name: 'Rot' }).waitFor();
    for (const zeile of await eintrag.locator(':scope > span').all()) {
      const f = await zeile.evaluate(farben);
      assert.notEqual(f.schrift, f.rot, `rote Schrift in der Liste (${schema})`);
    }
    // Vorschau steht offen, auch wenn sonst alles zugeklappt ist; Grunddaten-Kurzinfo nicht rot.
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    const leiste = bearbeitung.getByRole('navigation', { name: 'Bereiche der Vorlage' });
    await leiste.waitFor();
    await bearbeitung.locator('#vorschau svg').first().waitFor();
    const kurz = bearbeitung.locator('#grunddaten .stempeltext');
    if (await kurz.isVisible()) { const f = await kurz.evaluate(farben); assert.notEqual(f.schrift, f.rot, 'Grunddaten-Kurzinfo rot'); }
    await s.waitForLoadState('networkidle');
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Stempel (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

/**
 * Ein ausgeschaltetes Postfach (Persona-Adresse) über die Sitzung der Seite – die Werkbank verlangt den Verwaltungsmodus,
 * also erst nach `verwalten(s)`. Der Stand kommt im Test aus einer umgeschriebenen Antwort.
 */
async function postfach(s, name) {
  const r = await s.request.post(BASIS + '/api/werkbank/postfaecher', { headers: { 'x-dms': '1' }, data: { name, aktiv: false, server: 'imap.example.org', port: 993, verschluesselung: 'ssl', benutzer: 'lena@example.org', passwort: 'nur-fuer-rauchtest', ordner: 'INBOX', abstand: 5 } });
  assert.ok(r.ok(), `Postfach anlegen: ${r.status()} ${await r.text()}`);
  const l = await (await s.request.get(BASIS + '/api/werkbank/postfaecher', { headers: { 'x-dms': '1' } })).json();
  return l.find((p) => p.name === name);
}
const postfachWeg = (s, id) => s.request.delete(BASIS + `/api/werkbank/postfaecher/${id}`, { headers: { 'x-dms': '1' } });

/** Stand eines Postfachs in der Antwort ersetzen (Fehler lassen sich ohne IMAP-Server nicht echt erzeugen). */
async function mitStand(s, id, stand) {
  await s.unroute('**/api/werkbank/postfaecher').catch(() => {});
  await s.route('**/api/werkbank/postfaecher', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const antwort = await r.fetch();
    const l = await antwort.json();
    await r.fulfill({ response: antwort, json: l.map((p) => (p.id === id ? { ...p, aktiv: true, stand: { ...p.stand, ...stand } } : p)) });
  });
}

const STOERUNG = { zeit: '2026-11-09T13:02:00.000Z', fehler: 'Server nicht erreichbar – Adresse und Port prüfen.' };

rauchtest('Postfach → Stand: Zustandssatz, aktueller Fehler mit Weg zur Verbindung, frühere Störungen zugeklappt (#1186)', { als: LENA, timeout: 90_000 }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const pf = await postfach(s, 'Rauchtest Stand');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const funde = [];
  // Läuft: nichts Rotes, frühere Störung leise und zugeklappt mit „behoben am …“.
  await mitStand(s, pf.id, { letzterAbruf: '2026-11-15T09:41:00.000Z', naechsterAbruf: '2026-11-15T09:56:00.000Z', fehlerFolge: 0, fehler: [{ ...STOERUNG, behobenAm: '2026-11-09T13:20:00.000Z' }] });
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Erst woandershin: Dieselbe Adresse mit Anker lädt sonst nicht neu.
    await s.goto(BASIS + '/werkbank/stempel');
    await s.goto(BASIS + `/werkbank/postfaecher/${pf.id}#stand`);
    const stand = bearbeitung.locator('#stand');
    await stand.getByText(/Läuft – zuletzt abgerufen .*, nächster Abruf /).waitFor();
    assert.equal(await stand.locator('.hinweis.schlecht').count(), 0, 'kein roter Hinweis, wenn der Abruf läuft');
    assert.equal(await stand.getByRole('heading', { name: 'Fehler' }).count(), 0, 'keine Überschrift „Fehler“');
    const frueher = stand.locator('details.fruehere-stoerungen');
    assert.equal(await frueher.evaluate((d) => d.open), false, 'Frühere Störungen zugeklappt');
    await frueher.locator('summary').click();
    await frueher.getByText(/Adresse und Port prüfen\. – behoben am /).waitFor();
    await s.waitForLoadState('networkidle');
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Stand läuft (${schema}): ${v}`);
  }
  // Gestört: roter Satz oben mit Seit-Zeit und Zahl der Versuche; „Verbindung prüfen“ öffnet den Bereich.
  await mitStand(s, pf.id, { letzterAbruf: '2026-11-15T09:41:00.000Z', fehlerFolge: 3, fehler: [STOERUNG, STOERUNG, STOERUNG].map((f, i) => ({ ...f, zeit: `2026-11-1${5 - i}T09:00:00.000Z` })) });
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Erst woandershin: Dieselbe Adresse mit Anker lädt sonst nicht neu.
    await s.goto(BASIS + '/werkbank/stempel');
    await s.goto(BASIS + `/werkbank/postfaecher/${pf.id}#stand`);
    const satz = bearbeitung.locator('#stand .hinweis.schlecht');
    await satz.getByText(/Gestört seit .* – 3 Versuche gescheitert: Server nicht erreichbar/).waitFor();
    assert.equal(await bearbeitung.locator('#stand details.fruehere-stoerungen').count(), 0, 'aktuelle Fehler stehen nicht unter „Frühere Störungen“');
    await s.waitForLoadState('networkidle');
    for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`Stand gestört (${schema}): ${v}`);
  }
  await bearbeitung.getByRole('button', { name: 'Verbindung prüfen' }).click();
  await bearbeitung.locator('#verbindung').getByRole('textbox', { name: /^Server/ }).first().waitFor({ state: 'visible' });
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
  await s.unroute('**/api/werkbank/postfaecher');
  await postfachWeg(s, pf.id);
});

rauchtest('Eingangsordner: kein Abschnitt „Ordner je Person“, Hinweis mit „Jetzt anlegen“ am Haken (#1187)', { als: LENA, timeout: 60_000 }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/eingangsordner');
  const haken = s.getByRole('checkbox', { name: 'Ordner für neue Benutzer von selbst anlegen' });
  await haken.waitFor();
  assert.equal(await s.getByRole('heading', { name: /^Ordner je Person/ }).count(), 0, 'kein eigener Abschnitt mehr');
  // Die Zeile steht direkt unter dem Haken – nur, solange jemandem ein Ordner fehlt.
  const zeile = s.locator('#personen .hakenzeile');
  if (await zeile.count()) {
    await zeile.getByText(/haben? noch keinen eigenen Ordner\./).waitFor();
    await zeile.getByRole('button', { name: 'Jetzt anlegen' }).click();
    await s.locator('.hinweis.gut').getByText(/Ordner angelegt\./).waitFor();
    await zeile.waitFor({ state: 'detached' });
  }
  assert.equal(await s.locator('#personen').getByText(/Alle .* haben einen Ordner/).count(), 0, 'nichts, wenn alle einen Ordner haben');
});

rauchtest('Handy: Stempel und Postfach-Stand mit 44-px-Tippflächen (#1185, #1186)', { handy: true, als: LENA, timeout: 110_000 }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const pf = await postfach(s, 'Rauchtest Handy');
  await mitStand(s, pf.id, { letzterAbruf: '2026-11-15T09:41:00.000Z', fehlerFolge: 1, fehler: [STOERUNG, { ...STOERUNG, zeit: '2026-11-01T08:00:00.000Z', behobenAm: '2026-11-01T08:15:00.000Z' }] });
  const funde = [];
  for (const [name, weg, warte] of [
    // Stempel: Liste und Grunddaten (#1185 ändert sie); die Vorschau selbst ist unverändert.
    ['Stempel', '/werkbank/stempel', (x) => x.locator('.stempelvorlagen .eintrag').first().waitFor()],
    ['Postfach-Stand', `/werkbank/postfaecher/${pf.id}#stand`, (x) => x.locator('#stand .hinweis.schlecht').waitFor()],
  ]) {
    await s.goto(BASIS + weg);
    await warte(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, name === 'Stempel' ? ['.stempelvorlagen', '.stempeleditor #grunddaten'] : ['#stand'])) funde.push(`${name}: ${v}`);
    await keineWaagerechteRolle(s);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
  await s.unroute('**/api/werkbank/postfaecher');
  await postfachWeg(s, pf.id);
});
