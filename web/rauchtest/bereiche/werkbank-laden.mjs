/**
 * Rauchtests: Werkbank, während Listen und Einstellungen noch laden (#1418) – ein neuer Nummernkreis und eine neue
 * Stempel-Vorlage behalten ihre Eingaben, wenn die Liste nachlädt (wie das neue Postfach seit #1409); die Leiste zeigt
 * bis zum Laden der gewählten Stufe keine Bereiche, die danach verschwinden.
 * Die Antworten werden im Test angehalten, bis die Eingabe steht – so ist die Reihenfolge fest, ohne Wartezeiten.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-laden.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten } from '../hilfen.mjs';

/** GET-Anfragen an `muster` anhalten, bis `freigeben()` kommt; `angefragt` erfüllt sich bei der ersten. */
async function anhalten(s, muster) {
  let freigeben;
  let gemeldet;
  const frei = new Promise((r) => (freigeben = r));
  const angefragt = new Promise((r) => (gemeldet = r));
  await s.route(muster, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    gemeldet();
    await frei;
    await r.fallback();
  });
  return { angefragt, freigeben };
}

const NEU = [
  ['Nummernkreis', '**/api/werkbank/nummernkreise', '/werkbank/nummernkreise/neu', '#nk-name'],
  ['Stempel-Vorlage', '**/api/stempel/vorlagen', '/werkbank/stempel/neu', '#stempel-name'],
];

rauchtest(
  'Werkbank: neuer Nummernkreis und neue Stempel-Vorlage behalten Eingaben, wenn die Liste nachlädt (#1418)',
  { als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const verloren = [];
    for (const [was, muster, pfad, feld] of NEU) {
      const halt = await anhalten(s, muster);
      await s.goto(BASIS + pfad);
      await halt.angefragt;
      const name = s.locator(feld);
      await name.fill(`Rauchtest ${was}`);
      // Die Liste lädt noch, während die Eingabe steht.
      const elemente = s.getByRole('region', { name: 'Elemente' });
      await elemente.getByText('Lade …').waitFor();
      halt.freigeben();
      // Die Liste ist da (Einträge oder „noch keine“) – spätestens jetzt hätte sich der Editor neu aufgebaut.
      await elemente.locator('.mappenliste, .leerliste').first().waitFor();
      const wert = await name.inputValue();
      if (wert !== `Rauchtest ${was}`) verloren.push(`${was}: „${wert}“ statt „Rauchtest ${was}“`);
      await s.unroute(muster);
    }
    assert.deepEqual(verloren, [], `Eingabe nach dem Laden der Liste verloren:\n${verloren.join('\n')}`);
  },
);

rauchtest('Werkbank-Leiste: beim Laden der Stufe keine Bereiche, die danach verschwinden (#1418)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const halt = await anhalten(s, '**/api/werkbank/ansicht');
  await s.goto(BASIS + '/werkbank/nummernkreise');
  await halt.angefragt;
  const bereiche = s.getByRole('complementary', { name: 'Bereiche' });
  const leiste = bereiche.locator('nav.werkbankleiste');
  await leiste.waitFor();
  const namen = () => leiste.locator('a.sicht').evaluateAll((l) => l.map((a) => a.getAttribute('href')));
  assert.equal(await leiste.getAttribute('aria-busy'), 'true', 'Leiste meldet das Laden');
  const beimLaden = await namen();
  halt.freigeben();
  await bereiche.locator('nav.werkbankleiste:not([aria-busy])').waitFor();
  const danach = await namen();
  assert.ok(danach.length > 0, 'Leiste zeigt nach dem Laden Bereiche');
  const weg = beimLaden.filter((h) => !danach.includes(h));
  assert.deepEqual(weg, [], `Beim Laden gezeigt, danach verschwunden: ${weg.join(', ')}`);
});
