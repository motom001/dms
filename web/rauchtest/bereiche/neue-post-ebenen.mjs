/**
 * Rauchtests: Neue Post – verknüpfte Mappen in der rechten Spalte anlegen (#1596), bis zur dritten Ebene und am Handy;
 * „Bereich markieren“ füllt die Felder der offenen Ebene (#1597).
 * Eigene Mappentypen „Lieferschein“ → „Niederlassung“ → „Ansprechpartner“, damit die Beispiele unverändert bleiben;
 * steht deshalb am Ende der Reihe.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/neue-post-ebenen.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, keineWaagerechteRolle, LENA, rauchtest, sitzung } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Lieferschein (aus Post) → Lieferant: Niederlassung (mit Anschrift) → Ansprechpartner → zurück zur Niederlassung. */
async function ebenenTypen() {
  const cookie = await sitzung(LENA);
  const alle = (await api('GET', '/api/typen', { cookie })).daten;
  if (alle.some((x) => x.name === 'Lieferschein')) return;
  // Mappentypen nur im Verwaltungsmodus (#819): frische Anmeldung, dann ohne Passwort.
  await api('POST', '/api/konto/verwaltung', { cookie, body: {} });
  const anlegen = async (body) => (await api('POST', '/api/typen', { cookie, body })).daten;
  const text = (key, label, mehr = {}) => ({ key, label, typ: 'text', ...mehr });
  const niederlassung = await anlegen({
    name: 'Niederlassung',
    schluessel: 'niederlassung',
    titelVorlage: '{name}',
    felder: [
      text('name', 'Name', { pflicht: true }),
      text('strasse', 'Straße'),
      text('hausnummer', 'Nr.'),
      text('plz', 'PLZ'),
      text('ort', 'Ort'),
    ],
  });
  const ansprechpartner = await anlegen({
    name: 'Ansprechpartner',
    schluessel: 'ansprechpartner',
    titelVorlage: '{name}',
    felder: [
      text('name', 'Name', { pflicht: true }),
      text('telefon', 'Telefon'),
      { key: 'niederlassung', label: 'Niederlassung', typ: 'referenz', zielTypen: [niederlassung.id] },
    ],
  });
  await api('PUT', `/api/typen/${niederlassung.id}`, {
    cookie,
    body: {
      ...niederlassung,
      felder: [
        ...niederlassung.felder,
        { key: 'ansprechpartner', label: 'Ansprechpartner', typ: 'referenz', zielTypen: [ansprechpartner.id] },
      ],
    },
  });
  await anlegen({
    name: 'Lieferschein',
    schluessel: 'lieferschein',
    titelVorlage: '{nummer}',
    ausPost: true,
    felder: [text('nummer', 'Nummer'), { key: 'lieferant', label: 'Lieferant', typ: 'referenz', zielTypen: [niederlassung.id] }],
  });
  await api('POST', '/api/konto/verwaltung/beenden', { cookie, body: {} });
}

/** Post mit einem Lieferschein öffnen und „Lieferschein“ als neue Mappe wählen; gibt die rechte Spalte zurück. */
async function lieferschein(s, betreff, zeilen = `${betreff}\nNiederlassung Nord · Musterweg 1 · 01234 Musterstadt`) {
  await ebenenTypen();
  const cookie = await sitzung(LENA);
  const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
  await api(
    'POST',
    `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${betreff}.pdf`)}&typ=application/pdf`,
    {
      cookie,
      body: beispielPdf(zeilen),
      roh: true,
    },
  );
  await s.goto(BASIS + `/ablage/eingang/${brief.id}`);
  await s.waitForURL(new RegExp(`/${brief.id}/uebernehmen$`));
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('combobox', { name: 'Mappentyp suchen …' }).click();
  await mappe.getByRole('option', { name: /^Lieferschein/ }).click();
  await mappe.locator('[data-anker="mappe.feld:lieferant"]').getByRole('combobox').waitFor();
  return { mappe, dokument: s.getByRole('region', { name: 'Dokument' }) };
}

/** „+ <Typ> anlegen …“ am Verweisfeld `key` der offenen Ebene. */
async function anlegen(mappe, key, typ) {
  const feld = mappe.locator(`[data-anker="mappe.feld:${key}"]`).locator('visible=true');
  await feld.getByRole('combobox').click();
  await feld.getByRole('option', { name: `+ ${typ} anlegen …` }).click();
  return feld;
}

/** Die Brotkrümel als Texte (die Zeichen „›“ dazwischen setzt das Stylesheet). */
const kruemel = async (wo) => (await wo.getByRole('listitem').allInnerTexts()).map((x) => x.trim());

rauchtest('Neue Post: drei Ebenen in der rechten Spalte, auf der dritten gesperrt (#1596)', { als: LENA }, async (s) => {
  const { mappe, dokument } = await lieferschein(s, 'Lieferschein L-1');
  const wo = mappe.getByRole('navigation', { name: 'Wo du gerade bist' });
  await anlegen(mappe, 'lieferant', 'Niederlassung');
  await mappe.getByText('Neue Mappe für „Lieferant“ in „Lieferschein“. Nach dem Speichern geht es dorthin zurück.').waitFor();
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Niederlassung Nord');
  // Ebene 3 aus Ebene 2 heraus – das Dokument bleibt in der Mitte.
  await anlegen(mappe, 'ansprechpartner', 'Ansprechpartner');
  await mappe.getByText('Neue Mappe für „Ansprechpartner“ in „Niederlassung (neu)“. Nach dem Speichern geht es dorthin zurück.').waitFor();
  assert.deepEqual(await kruemel(wo), ['Neue Post', 'Lieferschein', 'Niederlassung (neu)', 'Ansprechpartner (neu)']);
  await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  // Auf Ebene 3 kein „+ Niederlassung anlegen …“ mehr, sondern der Grund.
  const zurueck = mappe.locator('[data-anker="mappe.feld:niederlassung"]').locator('visible=true');
  await zurueck.getByRole('combobox').click();
  const gesperrt = zurueck.getByRole('option', {
    name: /^Gesperrt: \+ Niederlassung anlegen geht hier nicht mehr – höchstens drei Ebenen\./,
  });
  await gesperrt.waitFor();
  assert.equal(await zurueck.getByRole('option', { name: '+ Niederlassung anlegen …' }).count(), 0);
  await gesperrt.click();
  assert.deepEqual(await kruemel(wo), ['Neue Post', 'Lieferschein', 'Niederlassung (neu)', 'Ansprechpartner (neu)']);
  await s.keyboard.press('Escape');
  assert.deepEqual(await axePruefen(s, ['.spalte.mappe']), []);
  // Speichern auf Ebene 3: zurück auf Ebene 2, dort steht der Ansprechpartner im Feld.
  await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Jonas Beispiel');
  await mappe.getByRole('button', { name: 'Speichern und zurück zu „Niederlassung (neu)“' }).click();
  const feld = mappe.locator('[data-anker="mappe.feld:ansprechpartner"]').locator('visible=true');
  await feld.getByRole('link', { name: 'Jonas Beispiel' }).waitFor();
  await feld.getByText('„Jonas Beispiel“ angelegt und eingetragen.').waitFor();
  assert.equal(await mappe.getByRole('textbox', { name: 'Name', exact: true }).inputValue(), 'Niederlassung Nord');
  // Zurück zum Lieferschein über den Brotkrümel: erst die Rückfrage, dann ist der Entwurf weg und das Feld leer.
  await wo.getByRole('button', { name: 'Lieferschein' }).click();
  await mappe.getByRole('alert').getByRole('button', { name: 'Entwürfe verwerfen' }).click();
  assert.deepEqual(await kruemel(wo), ['Neue Post', 'Lieferschein']);
  const lieferant = mappe.locator('[data-anker="mappe.feld:lieferant"]');
  await lieferant.getByRole('combobox').waitFor();
  assert.equal(await lieferant.getByRole('link').count(), 0);
  await mappe.getByRole('button', { name: 'Mappe anlegen' }).waitFor();
});

rauchtest(
  'Handy: Ebene mit „‹ Zurück“, Umschalter Dokument | Mappe und 44-px-Tippflächen (#1596)',
  { handy: true, als: LENA },
  async (s) => {
    const { mappe, dokument } = await lieferschein(s, 'Lieferschein L-2');
    await anlegen(mappe, 'lieferant', 'Niederlassung');
    await mappe.getByText('Ebene 2 von 3').waitFor();
    await mappe.getByText('Niederlassung (neu)', { exact: true }).waitFor();
    const ansicht = mappe.getByRole('radiogroup', { name: 'Dokument oder Mappe zeigen' });
    await ansicht.getByRole('radio', { name: 'Niederlassung', checked: true }).waitFor();
    assert.equal(await dokument.isVisible(), false, 'Dokument neben der Ebene sichtbar');
    await mappe.getByRole('button', { name: 'Speichern und zurück' }).waitFor();
    // Straße/Nr. und PLZ/Ort je in einer Zeile.
    const oben = async (key) => (await mappe.locator(`#feld-e2-${key}`).boundingBox())?.y;
    assert.equal(await oben('strasse'), await oben('hausnummer'), 'Straße und Nr. nicht in einer Zeile');
    assert.equal(await oben('plz'), await oben('ort'), 'PLZ und Ort nicht in einer Zeile');
    assert.deepEqual(await tippflaechenPruefen(s, ['.spalte.mappe']), [], 'Zu kleine Tippflächen am Handy');
    assert.deepEqual(await axePruefen(s, ['.spalte.mappe']), []);
    await keineWaagerechteRolle(s);
    // Reiter „Dokument“: das Dokument statt des Formulars; zurück zur Mappe.
    await ansicht.getByRole('radio', { name: 'Dokument' }).click();
    await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
    assert.equal(await mappe.getByRole('textbox', { name: 'Name', exact: true }).count(), 0);
    await ansicht.getByRole('radio', { name: 'Niederlassung' }).click();
    await mappe.getByRole('textbox', { name: 'Name', exact: true }).fill('Niederlassung Süd');
    // „‹ Lieferschein“ fragt wie der Brotkrümel am Rechner.
    await mappe.getByRole('button', { name: 'Lieferschein' }).click();
    await mappe.getByRole('alert').getByText('„Niederlassung (neu)“ ist noch nicht gespeichert.', { exact: false }).waitFor();
    await mappe.getByRole('alert').getByRole('button', { name: 'Entwürfe verwerfen' }).click();
    await mappe.locator('[data-anker="mappe.feld:lieferant"]').getByRole('combobox').waitFor();
    await dokument.getByRole('img', { name: 'Seite 1' }).waitFor();
  },
);

/* ---------- Bereich im Dokument markieren (#1597) ---------- */

/** Brief mit Rücksendezeile über der Anschrift: Zeile 0 Betreff, 1 Rücksendezeile, 2–4 die Anschrift. */
const BRIEF = (betreff) => `${betreff}\nMuster GmbH · Musterweg 9 · 01234 Musterstadt\nNiederlassung Nord\nMusterweg 1\n01234 Musterstadt`;

/** Rechteck mit der Maus über die Textzeilen `von` bis `bis` (ab 0) der ersten Seite ziehen. */
async function ziehe(s, dokument, von, bis) {
  await dokument.locator('.ue-wort').first().waitFor();
  const zeilen = await dokument.evaluate((el) => {
    const z = [];
    for (const w of el.querySelectorAll('.ue-wort')) {
      const r = w.getBoundingClientRect();
      const k = z.find((x) => Math.abs(x.y - r.top) < r.height / 2);
      if (k) Object.assign(k, { l: Math.min(k.l, r.left), r: Math.max(k.r, r.right), u: Math.max(k.u, r.bottom) });
      else z.push({ y: r.top, l: r.left, r: r.right, u: r.bottom });
    }
    return z.sort((a, b) => a.y - b.y);
  });
  const a = zeilen[von],
    b = zeilen[bis];
  await s.mouse.move(Math.min(a.l, b.l) - 6, a.y - 4);
  await s.mouse.down();
  await s.mouse.move(Math.max(a.r, b.r) + 6, b.u + 4, { steps: 5 });
  await s.mouse.up();
}

rauchtest(
  'Bereich markieren: Anschrift füllt die Felder der offenen Ebene, Rückgängig, ohne passende Felder (#1597)',
  { als: LENA },
  async (s) => {
    const { mappe, dokument } = await lieferschein(s, 'Lieferschein L-3', BRIEF('Lieferschein L-3'));
    await anlegen(mappe, 'lieferant', 'Niederlassung');
    await mappe.getByText('Neue Mappe für „Lieferant“ in „Lieferschein“. Nach dem Speichern geht es dorthin zurück.').waitFor();
    const nr = mappe.locator('#feld-e2-hausnummer');
    const vorher = await nr.inputValue();
    const knopf = dokument.getByRole('button', { name: 'Bereich markieren' });
    await knopf.click();
    await dokument.getByRole('button', { name: 'Bereich markieren', pressed: true }).waitFor();
    await dokument
      .getByText(
        'Zieh ein Rechteck um einen Block, z. B. die Anschrift. Ablago füllt die passenden Felder in „Niederlassung (neu)“. Esc beendet.',
      )
      .waitFor();
    assert.deepEqual(await axePruefen(s, ['.spalte.liste']), []);
    // Nur die Rücksendezeile: nichts erkannt, der Modus bleibt an.
    await ziehe(s, dokument, 1, 1);
    await dokument
      .getByText('Im Bereich hat Ablago nichts erkannt, das zu den Feldern passt. Zieh das Rechteck um den ganzen Block.')
      .waitFor();
    // Die Anschrift: Name, Straße, Nr., PLZ, Ort als Vorschlag; der Modus endet.
    await ziehe(s, dokument, 2, 4);
    await dokument
      .getByText(
        'Anschrift „Musterweg 1, 01234 Musterstadt“ erkannt – Name, Straße, Nr., PLZ, Ort als Vorschlag eingetragen. Bitte prüfen.',
      )
      .waitFor();
    await dokument.getByRole('button', { name: 'Bereich markieren', pressed: false }).waitFor();
    assert.equal(await nr.inputValue(), '1');
    assert.equal(await mappe.locator('#feld-e2-strasse').inputValue(), 'Musterweg');
    assert.equal(await mappe.locator('#feld-e2-name').inputValue(), 'Niederlassung Nord');
    await mappe.locator('[data-anker="mappe.feld:hausnummer"]').locator('visible=true').getByText('Vorschlag', { exact: true }).waitFor();
    await dokument.getByRole('button', { name: 'Rückgängig' }).click();
    await dokument.getByText('Rückgängig gemacht.').waitFor();
    assert.equal(await nr.inputValue(), vorher);
    // Esc beendet den Modus.
    await knopf.click();
    await dokument.getByRole('button', { name: 'Bereich markieren', pressed: true }).waitFor();
    await s.keyboard.press('Escape');
    await dokument.getByRole('button', { name: 'Bereich markieren', pressed: false }).waitFor();
    // Ebene 1 (Lieferschein) hat keine Felder für eine Anschrift.
    await mappe.getByRole('button', { name: 'Entwurf verwerfen' }).click();
    await knopf.click();
    await ziehe(s, dokument, 2, 4);
    await dokument
      .getByText('Anschrift „Musterweg 1, 01234 Musterstadt“ erkannt – aber „Lieferschein“ hat keine Felder für eine Anschrift.')
      .waitFor();
  },
);

rauchtest('Handy: Bereich markieren im Reiter „Dokument“, danach zur Mappe mit Hinweis (#1597)', { handy: true, als: LENA }, async (s) => {
  const { mappe, dokument } = await lieferschein(s, 'Lieferschein L-4', BRIEF('Lieferschein L-4'));
  await anlegen(mappe, 'lieferant', 'Niederlassung');
  const ansicht = mappe.getByRole('radiogroup', { name: 'Dokument oder Mappe zeigen' });
  await ansicht.getByRole('radio', { name: 'Dokument' }).click();
  const knopf = dokument.getByRole('button', { name: 'Bereich markieren' });
  assert.ok(((await knopf.boundingBox())?.height ?? 0) >= 44, 'Knopf „Bereich markieren“ unter 44 px');
  await knopf.click();
  await ziehe(s, dokument, 2, 4);
  await ansicht.getByRole('radio', { name: 'Niederlassung', checked: true }).waitFor();
  await mappe.getByText('Anschrift aus dem markierten Bereich eingetragen – bitte prüfen.').waitFor();
  assert.equal(await mappe.locator('#feld-e2-hausnummer').inputValue(), '1');
  assert.deepEqual(await axePruefen(s, ['.spalte.mappe']), []);
  await keineWaagerechteRolle(s);
});
