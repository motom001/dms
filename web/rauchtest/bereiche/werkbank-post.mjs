/**
 * Rauchtests: Werkbank-Seiten rund um die Post – Stempel ohne rote Schrift mit offener Vorschau (#1185), Postfach-Stand
 * in einem Satz mit „Frühere Störungen“ (#1186), Eingangsordner mit der kurzen Zeile am Haken (#1187).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-post.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

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

