/**
 * Rauchtests: Lasttest-Seite (#1251, #1452) – Überschrift mit der Auswahl, feste Reihenfolge (Kopf, Stand, Gerät,
 * Ergebnis, Ablauf, Jetzt gemessen), die sich beim Ende nicht umbaut, Ablauf als Tabelle (Gruppen je Stufe, Grenzsuche
 * gekürzt), Datenbank-Verbindungen als Kurve, am Ende ein Ergebnis (kurz, aufklappbar, ganz kopiert; fürs Formular nur
 * der Block); axe hell/dunkel, Tippflächen und kein waagerechtes Scrollen am Handy. Die Antworten des Lasttest-Modus sind nachgestellt (wie die
 * Bilder im Handbuch).
 * Allein starten (gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/lasttest-seite.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, rauchtest, schemaWechseln } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const zeile = (z, zustand, x = {}) => ({ ...z, zustand, beginn: null, ende: null, ...x });
const schritt = (s, optional = false) => ({ art: 'schritt', schritt: s, ...(optional ? { optional: true } : {}) });
const durchgang = (name, n, modus, o = {}) => ({ art: 'durchgang', name, n, modus, ziel: false, dauerS: 120, ...o });

/** Werte der laufenden Messung (#895), dazu die Kurven – seit #1452 mit den Datenbank-Verbindungen. */
function live(jetzt) {
  const verlauf = Array.from({ length: 20 }, (_, i) => ({
    zeit: new Date(jetzt - (20 - i) * 2000).toISOString(),
    cpu: 40 + (i % 5) * 8,
    speicher: 30 + i,
    db: 25 + (i % 4) * 15,
  }));
  return {
    jetzt: {
      ...{ name: 'mittel', n: 100, p95: 420, anfragen: 380, cpu: 72, speicher: 49, speicherMb: 1960, grenzeMb: 4000 },
      ...{ ohneGrenze: false, kerne: 4, kerneBegrenzt: false, warteschlange: 3, belegt: 12, verbindungen: 16 },
      ...{ gruppen: null, postgresExtern: false, meldungen: [], zeit: new Date(jetzt).toISOString() },
    },
    verlauf,
  };
}

const VORLAGE = [
  '```text',
  'Messergebnis Lasttest (#563)',
  'Ablago-Version: 0.296.0 · Image: dms-komplett · Datenbank: PostgreSQL 17',
  'Gerät/Modell: {{geraet}}',
  'CPU: Beispiel-CPU · 4 Kerne für Ablago, Rechner 4 · x64',
  'RAM: 8 GB · Speicher: {{speicher}}',
  'Bestand: 200013 Mappen, 400 Dokumente (PDF)',
  'klein    25 gleichzeitig: p50 48 ms, p95 131 ms, p99 180 ms, Fehler 0,00 % – Ziel erreicht',
  '```',
].join('\n');
const BERICHT = '## Lasttest (2026-11-18 10:15 UTC)\n\nBestand: 200013 Mappen …';

/** Stand bei `alle`: klein fertig, mittel misst gerade, groß offen; `fertig`: alles durch, Ergebnis da. */
function stand(fertig) {
  const jetzt = Date.now();
  const vor = (min) => jetzt - min * 60_000;
  const erledigt = (z, von, bis, werte) => zeile(z, 'erledigt', { beginn: vor(von), ende: vor(bis), ...(werte ? { werte } : {}) });
  const klein = [
    erledigt(schritt('pruefen'), 60, 59.9),
    erledigt(schritt('einrichten', true), 59.9, 59),
    erledigt(schritt('demo', true), 59, 54),
    erledigt(schritt('hintergrund', true), 54, 52),
    erledigt(schritt('vorbereiten'), 52, 51),
    {
      ...erledigt(durchgang('klein', 25, 'lesen', { ziel: true }), 51, 49, { p50: 48, p95: 131, jeSekunde: 210, fehlerquote: 0 }),
      erreicht: true,
    },
    // #1453: auch die Zusatz-Durchgänge haben ein Ziel.
    {
      ...erledigt(durchgang('klein + Speichern', 25, 'speichern', { ziel: true }), 49, 47, {
        p50: 70,
        p95: 240,
        jeSekunde: 150,
        fehlerquote: 0,
      }),
      erreicht: true,
    },
    erledigt(schritt('aufraeumen'), 47, 46),
  ];
  const mittel = [
    erledigt(schritt('pruefen'), 46, 45.9),
    zeile(schritt('einrichten', true), 'nicht-noetig'),
    erledigt(schritt('demo', true), 45.9, 20),
    erledigt(schritt('hintergrund', true), 20, 10),
    erledigt(schritt('vorbereiten'), 10, 8),
    fertig
      ? {
          ...erledigt(durchgang('mittel', 100, 'lesen', { ziel: true }), 8, 6, { p50: 120, p95: 610, jeSekunde: 480, fehlerquote: 0 }),
          erreicht: true,
        }
      : zeile(durchgang('mittel', 100, 'lesen', { ziel: true }), 'laeuft', { beginn: vor(1) }),
    zeile(durchgang('mittel + Speichern', 100, 'speichern'), fertig ? 'erledigt' : 'offen'),
    zeile(schritt('aufraeumen'), fertig ? 'erledigt' : 'offen'),
  ];
  const folge = [5, 10, 25, 50, 75, 100, 125, 150];
  const gross = [
    ...['pruefen', 'demo', 'hintergrund', 'vorbereiten'].map((s) => zeile(schritt(s), fertig ? 'erledigt' : 'offen')),
    ...folge.map((n, i) =>
      zeile(durchgang(`groß ${n}`, n, 'lesen', { ziel: true, grenze: true }), fertig ? (i < 4 ? 'erledigt' : 'nicht-noetig') : 'offen'),
    ),
    zeile(durchgang('Überlast 1000', 1000, 'ueberlast'), fertig ? 'erledigt' : 'offen'),
    zeile(schritt('auswerten'), fertig ? 'erledigt' : 'offen'),
  ];
  return {
    version: '0.296.0',
    wahl: 'alle',
    speichern: true,
    zustand: fertig ? 'fertig' : 'laeuft',
    stufe: fertig ? 'gross' : 'mittel',
    nr: fertig ? 3 : 2,
    von: 3,
    schritt: fertig ? 'auswerten' : 'messen',
    demo: null,
    durchgang: fertig ? null : { name: 'mittel', n: 100, ende: jetzt + 60_000 },
    durchgaenge: [],
    begonnen: vor(60),
    stufeBegonnen: vor(46),
    jetzt,
    fertigeStufen: fertig ? ['klein', 'mittel', 'gross'] : ['klein'],
    ergebnis: fertig
      ? {
          bericht: BERICHT,
          vorlage: VORLAGE,
          verfehlt: false,
        }
      : null,
    meldung: null,
    angaben: { geraet: '', speicher: 'SSD' },
    speicherErkannt: 'SSD',
    datei: fertig ? '/data/ergebnis/lasttest-alle.md' : null,
    live: fertig ? null : live(jetzt),
    ablauf: {
      stufen: [
        { stufe: 'klein', zeilen: klein },
        { stufe: 'mittel', zeilen: mittel },
        { stufe: 'gross', zeilen: gross },
      ],
      aktuell: fertig ? 2 : 1,
    },
  };
}

async function zeige(s, k, fertig) {
  const x = stand(fertig);
  await k.route('**/api/konto/status', (r) =>
    r.fulfill({ json: { einrichtungNoetig: false, mail: false, benutzer: null, marke: null, wartung: null, lasttest: true } }),
  );
  await k.route('**/api/lasttest', (r) => r.fulfill({ json: { ...x, jetzt: Date.now() } }));
  await k.route('**/api/lasttest/angaben', (r) => r.fulfill({ json: x }));
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Lasttest: alle Stufen (klein → mittel → groß)', level: 1 }).waitFor();
}

/** axe hell und dunkel auf der ganzen Karte, dazu (am Handy) die Tippflächen. */
async function barrierefrei(s, handy) {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.lasttest'])) funde.push(`${schema}: ${v}`);
  }
  await schemaWechseln(s, 'light');
  if (handy) for (const v of await tippflaechenPruefen(s, ['.lasttest'])) funde.push(`Tippfläche: ${v}`);
  assert.deepEqual(funde, [], funde.join('\n'));
}

for (const handy of [false, true])
  rauchtest(`Lasttest-Seite${handy ? ' am Handy' : ''}: Auswahl, Gerät oben, Ablauf als Tabelle (#1251)`, { handy }, async (s, k) => {
    await zeige(s, k, false);
    // #1452: Kopf nur mit Titel und Version; Stufe und Durchgang stehen im Ablauf, nicht noch einmal darüber.
    await s.getByText('Ablago 0.296.0', { exact: true }).waitFor();
    assert.equal(await s.getByText('Stufe mittel, 2 von 3', { exact: false }).count(), 0);
    assert.equal(await s.getByText('Durchgang „mittel“', { exact: false }).count(), 0);
    // Gerät vor Ergebnis und Ablauf – ohne zu scrollen sichtbar; der Platz fürs Ergebnis ist schon da.
    const geraet = s.getByLabel('Beschreibe dein Gerät');
    await geraet.waitFor();
    const ergebnis = s.getByRole('region', { name: 'Messergebnis Lasttest' });
    await ergebnis.getByText('Das Ergebnis erscheint hier, sobald der Test fertig ist.').waitFor();
    const ablauf = s.getByRole('region', { name: 'Ablauf' });
    const live = s.getByRole('region', { name: 'Jetzt gemessen' });
    const [g, e, a, l] = await Promise.all([geraet, ergebnis, ablauf, live].map((x) => x.boundingBox()));
    assert.ok(g && e && a && l && g.y < e.y && e.y < a.y && a.y < l.y, 'Gerät, Ergebnis, Ablauf, Jetzt gemessen');
    assert.ok(g.y + g.height <= (s.viewportSize()?.height ?? 0), 'Gerät ist ohne Scrollen sichtbar');
    // Jetzt gemessen (#1452): drei Kurven, die dritte mit den wartenden Abfragen; Stufe und Durchgang entfallen.
    assert.equal(await live.locator('svg.az-kurve').count(), 3);
    await live.getByRole('heading', { name: /^Datenbank-Verbindungen .*75 %/ }).waitFor();
    await live.getByText('bis 3 wartende Abfragen · 12 von 16 Verbindungen belegt').waitFor();
    await live.getByText('im Ablauf steht p95 erst, wenn der Durchgang fertig ist', { exact: false }).waitFor();
    assert.equal(await live.locator('dt').count(), 0, 'keine Liste mit Stufe und Durchgang mehr');
    await s.getByText('keine Namen, Adressen oder Rechnernamen', { exact: false }).waitFor();
    // Drei Gruppen, die laufende (mittel) aufgeklappt.
    const gruppen = ablauf.locator('.lasttest-gruppe');
    assert.equal(await gruppen.count(), 3);
    assert.deepEqual(await gruppen.locator('[aria-expanded]').evaluateAll((e) => e.map((x) => x.getAttribute('aria-expanded'))), [
      'false',
      'true',
      'false',
    ]);
    const tabelle = ablauf.locator('table');
    assert.equal(await tabelle.count(), 1);
    await tabelle.getByRole('cell', { name: /Lasttest-Mappen an/ }).waitFor();
    assert.equal(await tabelle.locator('tr[data-zustand="laeuft"]').count(), 1, 'genau eine Zeile läuft');
    await tabelle.locator('tr[data-zustand="laeuft"]').getByText('mittel', { exact: true }).waitFor();
    // groß aufklappen: drei nächste Schritte der Grenzsuche, der Rest in einer Zeile.
    await gruppen.nth(2).getByRole('button').click();
    const gross = ablauf.locator('#lasttest-ablauf-gross');
    for (const n of [5, 10, 25]) await gross.getByText(`groß ${n}`, { exact: true }).waitFor();
    assert.equal(await gross.getByText('groß 50', { exact: true }).count(), 0);
    await gross.getByText('5 weitere Durchgänge bis 150 gleichzeitig – läuft, bis die Grenze erreicht ist').waitFor();
    if (handy) await keineWaagerechteRolle(s);
    await barrierefrei(s, handy);
  });

rauchtest('Lasttest-Seite fertig: ein Ergebnis, kurz und ganz kopiert, Hinweis zum Gerät (#1251, #1452)', { handy: true }, async (s, k) => {
  await zeige(s, k, true);
  const ergebnis = s.getByRole('region', { name: 'Messergebnis Lasttest' });
  await ergebnis.waitFor();
  // Feste Reihenfolge (#1452): Gerät vor dem Ergebnis, auch nach dem Ende.
  const [e, g] = [await ergebnis.boundingBox(), await s.getByLabel('Beschreibe dein Gerät').boundingBox()];
  assert.ok(e && g && g.y < e.y, 'Gerät steht über dem Ergebnis');
  // Kurz bis „RAM …“, der Rest zum Aufklappen.
  const block = ergebnis.locator('pre.lasttest-block');
  assert.match(await block.innerText(), /RAM: 8 GB · Speicher: SSD \(erkannt\)$/);
  assert.ok(!(await block.innerText()).includes('Bestand:'), 'Rest erst aufgeklappt');
  await ergebnis.getByRole('button', { name: 'Ganzes Ergebnis zeigen' }).click();
  await block.getByText('## Lasttest (2026-11-18 10:15 UTC)', { exact: false }).waitFor();
  // Kopieren nimmt alles: Block oben, Bericht darunter.
  await s.evaluate(() => {
    window.__kopie = null;
    if (navigator.clipboard) navigator.clipboard.writeText = async (t) => void (window.__kopie = t);
  });
  await ergebnis.getByRole('button', { name: 'Kopieren', exact: true }).click();
  // Ergebnis am Knopf (B2) – mit Zwischenablage oder über den Ausweichweg (http:// im Heimnetz).
  await ergebnis.getByRole('button', { name: 'Kopiert' }).waitFor();
  assert.equal(await s.locator('.lasttest-behelf').count(), 0, 'Ausweichfeld wieder weg');
  const kopie = await s.evaluate(() => window.__kopie);
  const mitZwischenablage = await s.evaluate(() => !!navigator.clipboard && window.isSecureContext);
  assert.ok(kopie !== null || !mitZwischenablage, 'über die Zwischenablage kopiert');
  if (kopie !== null) {
    assert.ok(kopie.startsWith('```text\nMessergebnis Lasttest (#563)\n'), 'Block oben');
    assert.ok(kopie.includes('Gerät/Modell: bitte ergänzen\n'), 'Block mit Gerät');
    assert.ok(kopie.endsWith('```\n\n## Lasttest (2026-11-18 10:15 UTC)\n\nBestand: 200013 Mappen …\n'), 'Bericht darunter');
  }
  await ergebnis.getByRole('button', { name: 'Als Datei herunterladen' }).waitFor();
  // Gerät fehlt noch: Satz am Knopf mit Sprung zum Feld, gesperrt wird nichts.
  await ergebnis.getByText('Im Ergebnis steht beim Gerät noch „bitte ergänzen“.').waitFor();
  await ergebnis.getByRole('button', { name: 'Zum Feld' }).click();
  await s.waitForFunction(() => document.activeElement?.id === 'lasttest-geraet');
  await s.getByLabel('Beschreibe dein Gerät').fill('Beispiel-NAS, 8 GB RAM');
  await block.getByText('Gerät/Modell: Beispiel-NAS, 8 GB RAM', { exact: false }).waitFor();
  assert.equal(await ergebnis.getByText('bitte ergänzen', { exact: false }).count(), 0, 'Hinweis weg');
  const ablauf = s.getByRole('region', { name: 'Ablauf' });
  await ablauf.locator('.lasttest-gruppe').nth(2).getByRole('button').click();
  await ablauf.getByText('groß 75 bis groß 150: nicht nötig, die Grenze ist erreicht').waitFor();
  // #1453: „Ziel erreicht“ auch beim Durchgang „+ Speichern“.
  await ablauf.locator('.lasttest-gruppe').nth(0).getByRole('button').click();
  const speichern = ablauf.locator('tr', { has: s.getByText('klein + Speichern', { exact: true }) });
  await speichern.locator('.lasttest-ziel[data-erreicht="ja"]').waitFor();
  await keineWaagerechteRolle(s);
  await barrierefrei(s, true);
});

// Formular (#1452): Ein Feld bei GitHub fasst höchstens 65.536 Zeichen, ein ganzer Lauf mit `alle` etwa 121.000 – der
// Knopf zum Formular kopiert vor dem Öffnen nur den Block bis zur schließenden ```-Zeile; „Kopieren“ nimmt weiter alles.
rauchtest('Lasttest-Seite fertig: Knopf zum Formular kopiert nur den Block (#1452)', {}, async (s, k) => {
  await zeige(s, k, true);
  // Das Formular öffnet in einem neuen Fenster – hier ohne GitHub, nur eine leere Seite.
  await k.route('https://github.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Formular</title>' }));
  const ergebnis = s.getByRole('region', { name: 'Messergebnis Lasttest' });
  await ergebnis.waitFor();
  await s.evaluate(() => {
    window.__kopie = null;
    if (navigator.clipboard) navigator.clipboard.writeText = async (t) => void (window.__kopie = t);
  });
  const [fenster] = await Promise.all([
    s.waitForEvent('popup'),
    ergebnis.getByRole('link', { name: 'Formular „Messergebnis Lasttest“' }).click(),
  ]);
  assert.match(fenster.url(), /^https:\/\/github\.com\/motom001\/dms\/issues\/new\?template=messergebnis-lasttest\.yml/);
  await fenster.close();
  await ergebnis.getByRole('status').getByText('Block kopiert – im Formular einfügen', { exact: true }).waitFor();
  assert.equal(await s.locator('.lasttest-behelf').count(), 0, 'Ausweichfeld wieder weg');
  const kopie = await s.evaluate(() => window.__kopie);
  if (kopie !== null) {
    const zeilen = VORLAGE.split('\n');
    assert.equal(kopie.split('\n').length, zeilen.length, 'nur der Block');
    assert.ok(kopie.startsWith('```text\nMessergebnis Lasttest (#563)\n'), 'Block oben');
    assert.ok(kopie.includes('Gerät/Modell: bitte ergänzen\n'), 'mit Gerät');
    assert.ok(kopie.endsWith('Ziel erreicht\n```'), 'bis einschließlich der schließenden Zeile');
    assert.ok(!kopie.includes('## Lasttest'), 'ohne Bericht');
  } else assert.equal(await s.evaluate(() => !!navigator.clipboard && window.isSecureContext), false, 'über die Zwischenablage kopiert');
  // „Kopieren“ nimmt weiter alles.
  await ergebnis.getByRole('button', { name: 'Kopieren', exact: true }).click();
  await ergebnis.getByRole('button', { name: 'Kopiert' }).waitFor();
  const alles = await s.evaluate(() => window.__kopie);
  if (alles !== null) assert.ok(alles.includes('## Lasttest (2026-11-18 10:15 UTC)'), 'Kopieren mit Bericht');
});

for (const handy of [false, true])
  rauchtest(`Lasttest-Seite${handy ? ' am Handy' : ''}: nichts springt beim Ende, Stufen klappen mit (#1452)`, { handy }, async (s, k) => {
    // Läuft: mittel aufgeklappt. Dann klappt man klein selbst auf und mittel zu …
    let x = stand(false);
    await k.route('**/api/konto/status', (r) =>
      r.fulfill({ json: { einrichtungNoetig: false, mail: false, benutzer: null, marke: null, wartung: null, lasttest: true } }),
    );
    await k.route('**/api/lasttest', (r) => r.fulfill({ json: { ...x, jetzt: Date.now() } }));
    await s.goto(BASIS + '/');
    const ergebnis = s.getByRole('region', { name: 'Messergebnis Lasttest' });
    await ergebnis.getByText('Das Ergebnis erscheint hier, sobald der Test fertig ist.').waitFor();
    const ablauf = s.getByRole('region', { name: 'Ablauf' });
    const offen = () =>
      ablauf.locator('.lasttest-gruppe [aria-expanded]').evaluateAll((e) => e.map((y) => y.getAttribute('aria-expanded')));
    assert.deepEqual(await offen(), ['false', 'true', 'false']);
    // Lage auf der Seite (nicht im Fenster): Scrollen zählt nicht als Springen.
    const oben = (l) => l.evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY));
    const lage = async () => ({ geraet: await oben(s.getByLabel('Beschreibe dein Gerät')), ergebnis: await oben(ergebnis) });
    const vorher = await lage();
    // … mittel ist durch, groß beginnt: mittel klappt zu, groß auf; klein bleibt so, wie man es gestellt hat.
    await ablauf.locator('.lasttest-gruppe').nth(0).getByRole('button').click();
    const st = x.ablauf.stufen;
    x = {
      ...x,
      stufe: 'gross',
      nr: 3,
      fertigeStufen: ['klein', 'mittel'],
      durchgang: null,
      schritt: 'demo',
      ablauf: {
        aktuell: 2,
        stufen: [
          st[0],
          { stufe: 'mittel', zeilen: st[1].zeilen.map((z) => ({ ...z, zustand: z.zustand === 'nicht-noetig' ? z.zustand : 'erledigt' })) },
          {
            stufe: 'gross',
            zeilen: st[2].zeilen.map((z, i) => (i === 0 ? { ...z, zustand: 'erledigt' } : i === 1 ? { ...z, zustand: 'laeuft' } : z)),
          },
        ],
      },
    };
    await ablauf.locator('.lasttest-gruppe').nth(2).locator('[aria-expanded="true"]').waitFor();
    assert.deepEqual(await offen(), ['true', 'false', 'true']);
    // Ende: Gerät und Ergebnis bleiben, wo sie waren.
    x = stand(true);
    await s.getByText('Der Test ist fertig.').waitFor();
    await ergebnis.getByRole('button', { name: 'Kopieren', exact: true }).waitFor();
    assert.deepEqual(await lage(), vorher, 'Gerätefeld und Ergebnis an derselben Stelle');
  });
