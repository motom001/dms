/**
 * Rauchtests: Gesperrte Anmeldungen (#1481) – eine Sperre je E-Mail-Adresse und IP entsteht durch falsche Passwörter,
 * erscheint in Werkbank → Anmeldeschutz und an der Person, „Entsperren“ hebt sie auf, danach ist sie weg und die
 * Anmeldung geht wieder. axe hell und dunkel auf beiden Abschnitten.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/anmeldeschutz.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, JONAS, LENA, api, rauchtest, schemaWechseln, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** So oft ein falsches Passwort, bis die Sperre je E-Mail-Adresse und IP greift (Vorgabe 5). */
async function sperren(person, mal = 5) {
  for (let i = 0; i < mal; i++)
    await api('POST', '/api/konto/anmelden', { body: { email: person.email, passwort: 'falsch' } }).catch(() => {});
}

async function axeHellDunkel(s, bereich) {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, [bereich])) funde.push(`${schema}: ${v}`);
  }
  await schemaWechseln(s, 'light');
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
}

rauchtest(
  'Anmeldeschutz: Sperre erzeugen, sie erscheint, entsperren, sie ist weg – Werkbank und Person, axe (#1481)',
  { als: LENA },
  async (s) => {
    await sperren(JONAS);
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    await s.goto(BASIS + '/werkbank/anmeldeschutz');
    const blatt = s.locator('#gesperrt');
    await blatt.getByRole('heading', { name: /^Gesperrte Anmeldungen/ }).waitFor();
    const eintrag = blatt.locator('li[data-sperre="konto-ip"]', { hasText: JONAS.email });
    await eintrag.waitFor();
    const text = await eintrag.innerText();
    assert.match(text, /E-Mail-Adresse und IP/);
    assert.match(text, /5 Fehlversuche/);
    assert.match(text, /seit .+, bis /);
    await eintrag.getByRole('link', { name: JONAS.name }).waitFor();
    await axeHellDunkel(s, '#gesperrt');
    await eintrag.getByRole('button', { name: 'Entsperren' }).click();
    await s.getByText(new RegExp(`^Entsperrt: ${JONAS.email.replace('.', '\\.')}`)).waitFor();
    await eintrag.waitFor({ state: 'detached' });
    if (!(await blatt.locator('li').count())) await blatt.getByText('Gerade ist keine Anmeldung gesperrt.').waitFor();

    // An der Person: dieselbe Sperre noch einmal, dort aufheben.
    await sperren(JONAS);
    await s.goto(BASIS + '/werkbank/benutzer');
    await s
      .getByRole('region', { name: 'Elemente' })
      .getByRole('link', { name: /^Jonas/ })
      .first()
      .click();
    const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
    await bearbeitung
      .getByRole('navigation', { name: 'Bereiche des Benutzers' })
      .getByRole('button', { name: 'Anmeldung und Sicherheit', exact: true })
      .click();
    const block = s.locator('#anmeldesperre-von');
    await block.getByRole('heading', { name: 'Gesperrte Anmeldung' }).waitFor();
    const an = block.locator('li[data-sperre="konto-ip"]');
    await an.waitFor();
    assert.match(await an.innerText(), new RegExp(JONAS.email.replace('.', '\\.')));
    assert.equal(await an.getByRole('link').count(), 0, 'an der Person kein Verweis auf sie selbst');
    await axeHellDunkel(s, '#anmeldesperre-von');
    await an.getByRole('button', { name: 'Entsperren' }).click();
    await block.getByText('Sperre aufgehoben.').waitFor();
    await block.getByText('Die Anmeldung ist gerade nicht gesperrt.').waitFor();
    // Wirklich frei: Jonas meldet sich wieder an.
    assert.ok(await sitzung(JONAS));
  },
);
