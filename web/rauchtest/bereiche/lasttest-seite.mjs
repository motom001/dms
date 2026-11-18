/**
 * Rauchtests: Lasttest-Seite (#1251) – Überschrift mit der Auswahl, Gerät oben, Ablauf als Tabelle (Gruppen je Stufe,
 * Grenzsuche gekürzt), am Ende das Ergebnis oben und der ganze Bericht mit Kopieren; axe hell/dunkel, Tippflächen und
 * kein waagerechtes Scrollen am Handy. Die Antworten des Lasttest-Modus sind nachgestellt (wie die Bilder im Handbuch).
 * Allein starten (gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/lasttest-seite.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, keineWaagerechteRolle, rauchtest, schemaWechseln } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

const zeile = (z, zustand, x = {}) => ({ ...z, zustand, beginn: null, ende: null, ...x });
const schritt = (s, optional = false) => ({ art: 'schritt', schritt: s, ...(optional ? { optional: true } : {}) });
const durchgang = (name, n, modus, o = {}) => ({ art: 'durchgang', name, n, modus, ziel: false, dauerS: 120, ...o });

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
    erledigt(durchgang('klein + Speichern', 25, 'speichern'), 49, 47, { p50: 70, p95: 240, jeSekunde: 150, fehlerquote: 0 }),
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
          bericht: '## Lasttest (2026-11-18 10:15 UTC)\n\nBestand: 200013 Mappen …',
          vorlage: '```text\nMessergebnis Lasttest (#563)\nGerät/Modell: {{geraet}}\nSpeicher: {{speicher}}\n```',
          verfehlt: false,
        }
      : null,
    meldung: null,
    angaben: { geraet: '', speicher: 'SSD' },
    speicherErkannt: 'SSD',
    datei: fertig ? '/data/ergebnis/lasttest-alle.md' : null,
    live: null,
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
    await s.getByText('Stufe mittel, 2 von 3', { exact: false }).waitFor();
    // Gerät als Erstes unter der Überschrift, vor Stand und Ablauf – ohne zu scrollen sichtbar.
    const geraet = s.getByLabel('Beschreibe dein Gerät');
    await geraet.waitFor();
    const ablauf = s.getByRole('region', { name: 'Ablauf' });
    const [g, a] = [await geraet.boundingBox(), await ablauf.boundingBox()];
    assert.ok(g && a && g.y < a.y, 'Gerät steht über dem Ablauf');
    assert.ok(g.y + g.height <= (s.viewportSize()?.height ?? 0), 'Gerät ist ohne Scrollen sichtbar');
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

rauchtest('Lasttest-Seite fertig: Ergebnis oben, ganzen Bericht kopieren, nicht nötige Schritte (#1251)', { handy: true }, async (s, k) => {
  await zeige(s, k, true);
  const ergebnis = s.getByRole('region', { name: 'Messergebnis Lasttest' });
  await ergebnis.waitFor();
  const [e, g] = [await ergebnis.boundingBox(), await s.getByLabel('Beschreibe dein Gerät').boundingBox()];
  assert.ok(e && g && e.y < g.y, 'Ergebnis rückt nach oben');
  await ergebnis.getByText('Ganzer Bericht').click();
  const knopf = ergebnis.getByRole('button', { name: 'Ganzen Bericht kopieren' });
  await knopf.click();
  // Ergebnis am Knopf (B2) – mit Zwischenablage oder über den Ausweichweg (http:// im Heimnetz).
  await ergebnis.getByRole('button', { name: 'Kopiert' }).waitFor();
  assert.equal(await s.locator('.lasttest-behelf').count(), 0, 'Ausweichfeld wieder weg');
  await ergebnis.getByRole('button', { name: 'Als Datei herunterladen' }).first().waitFor();
  const ablauf = s.getByRole('region', { name: 'Ablauf' });
  await ablauf.locator('.lasttest-gruppe').nth(2).getByRole('button').click();
  await ablauf.getByText('groß 75 bis groß 150: nicht nötig, die Grenze ist erreicht').waitFor();
  await keineWaagerechteRolle(s);
  await barrierefrei(s, true);
});
