/**
 * Rauchtests: Auswahl an Verweisfeldern und Nachladen der offenen Ansicht (KW49).
 * - #1670: Die Vorschläge eines Verweisfelds unten in der Mappe klappen nach oben auf und bleiben im Fenster; oben weiter
 *   nach unten. Tastatur (Pfeile, Enter, Esc) in beiden Richtungen, axe, am Handy.
 * - #1671: Reihenfolge der Auswahl – ohne Einstellung Titel mit Zahlen der Größe nach, mit Einstellung nach „Jahr“
 *   absteigend; die Einstellung im Mappentyp-Editor.
 * - #1668: Post kommt über den Eingangsordner herein, während „Neue Post“ offen ist: Die Liste lädt ohne Neuladen nach;
 *   ist etwas ausgewählt, erst nach Klick auf „… neue – anzeigen“ (Auswahl bleibt). Kopfzeile wie die Zahl links,
 *   „Neu laden“, und „Post 1 von n“ zählt neue Post mit.
 * Eigene Mappentypen „Rauchtest-Steuerjahr“ und „Rauchtest-Beleg“, damit die Beispiele unverändert bleiben.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/auswahl-und-nachladen.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import '../einrichtung.mjs';
import { ABLAGE_BEREICHE, api, BASIS, beispielPdf, keineWaagerechteRolle, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/** Steuerjahre 2009 … 2030 und „9“, „10“; ein Beleg mit „Vorjahr“ ganz oben und „Steuerjahr“ ganz unten. */
async function auswahlDaten() {
  const cookie = await sitzung(LENA);
  const da = (await api('GET', '/api/typen', { cookie })).daten;
  const gefunden = da.find((x) => x.schluessel === 'rauchtest_beleg');
  if (gefunden) return { beleg: gefunden };
  await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
  const anlegen = async (body) => (await api('POST', '/api/typen', { cookie, body })).daten;
  const jahr = await anlegen({
    name: 'Rauchtest-Steuerjahr',
    schluessel: 'rauchtest_steuerjahr',
    titelVorlage: '{name}',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'jahr', label: 'Jahr', typ: 'zahl' },
    ],
  });
  for (const j of [9, 10, ...Array.from({ length: 22 }, (_, i) => 2009 + i)])
    await api('POST', '/api/mappen', { cookie, body: { typId: jahr.id, werte: { name: `Steuerjahr ${j}`, jahr: j } } });
  // Viele Textfelder dazwischen: „Steuerjahr“ steht weit unten in der Mappe.
  const texte = Array.from({ length: 14 }, (_, i) => ({ key: `angabe_${i + 1}`, label: `Angabe ${i + 1}`, typ: 'text' }));
  const beleg = await anlegen({
    name: 'Rauchtest-Beleg',
    schluessel: 'rauchtest_beleg',
    felder: [
      { key: 'vorjahr', label: 'Vorjahr', typ: 'referenz', zielTypen: [jahr.id] },
      ...texte,
      {
        key: 'steuerjahr',
        label: 'Steuerjahr',
        typ: 'referenz',
        zielTypen: [jahr.id],
        auswahlReihenfolge: { feld: 'jahr', absteigend: true },
      },
    ],
  });
  return { beleg };
}

/** Lage der Liste: innerhalb des Fensters, über oder unter dem Feld, und `data-oben`. */
async function lage(s, feld) {
  return feld.evaluate((el) => {
    const l = document.getElementById(el.getAttribute('aria-controls'));
    const f = el.getBoundingClientRect();
    const r = l.getBoundingClientRect();
    return {
      oben: l.dataset.oben,
      ueber: r.bottom <= f.top,
      unter: r.top >= f.bottom,
      imFenster: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      hoehe: r.height,
      optionen: [...l.querySelectorAll('[role="option"]')].slice(0, 3).map((o) => o.textContent),
    };
  });
}

rauchtest('Verweisfeld: Auswahl unten klappt nach oben, oben nach unten; Reihenfolge (#1670, #1671)', { als: LENA }, async (s) => {
  const { beleg } = await auswahlDaten();
  await s.goto(BASIS + `/ablage/${beleg.id}/neu`);
  // Oben: nach unten, ohne Einstellung nach Titel mit Zahlen der Größe nach.
  const vorjahr = s.getByRole('combobox', { name: 'Vorjahr' });
  await vorjahr.click();
  await s.getByRole('option', { name: 'Steuerjahr 9', exact: true }).waitFor();
  let l = await lage(s, vorjahr);
  assert.equal(l.oben, 'nein');
  assert.ok(l.unter && l.imFenster, JSON.stringify(l));
  assert.deepEqual(l.optionen, ['Steuerjahr 9', 'Steuerjahr 10', 'Steuerjahr 2009']);
  await s.keyboard.press('Escape');
  assert.equal(await vorjahr.getAttribute('aria-expanded'), 'false');
  // Unten: nach oben, im Fenster, höchstens 280 px; eingestellt nach „Jahr“ absteigend.
  const steuerjahr = s.getByRole('combobox', { name: 'Steuerjahr' });
  await steuerjahr.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await steuerjahr.click();
  await s.getByRole('option', { name: 'Steuerjahr 2030', exact: true }).waitFor();
  l = await lage(s, steuerjahr);
  assert.equal(l.oben, 'ja', JSON.stringify(l));
  assert.ok(l.ueber && l.imFenster && l.hoehe <= 281, JSON.stringify(l));
  assert.deepEqual(l.optionen, ['Steuerjahr 2030', 'Steuerjahr 2029', 'Steuerjahr 2028']);
  await axePruefen(s, ABLAGE_BEREICHE);
  // Tastatur in der aufgeklappten Liste oben: Pfeil wandert, Enter wählt.
  await s.keyboard.press('ArrowDown');
  const aktiv = await steuerjahr.getAttribute('aria-activedescendant');
  assert.equal(await s.locator(`[id="${aktiv}"]`).textContent(), 'Steuerjahr 2030');
  await s.keyboard.press('Enter');
  await s.getByRole('link', { name: 'Steuerjahr 2030' }).waitFor();
});

rauchtest('Handy: Auswahl unten bleibt im Fenster (#1670)', { als: LENA, handy: true }, async (s) => {
  const { beleg } = await auswahlDaten();
  await s.goto(BASIS + `/ablage/${beleg.id}/neu`);
  const steuerjahr = s.getByRole('combobox', { name: 'Steuerjahr' });
  await steuerjahr.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await steuerjahr.click();
  await s.getByRole('option', { name: 'Steuerjahr 2030', exact: true }).waitFor();
  const l = await lage(s, steuerjahr);
  assert.equal(l.oben, 'ja', JSON.stringify(l));
  assert.ok(l.ueber && l.imFenster, JSON.stringify(l));
  await keineWaagerechteRolle(s);
});

rauchtest('Mappentyp-Editor: Reihenfolge der Auswahl einstellen (#1671)', { als: LENA }, async (s) => {
  const { beleg } = await auswahlDaten();
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${beleg.id}`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Rauchtest-Beleg', level: 1 }).waitFor();
  const felder = bearbeitung.getByRole('region', { name: 'Felder' });
  await felder.getByRole('button', { name: 'Felder' }).click();
  await felder.getByRole('button', { name: /^Vorjahr vorjahr/ }).click();
  await felder.getByLabel('Reihenfolge der Auswahl').selectOption({ label: 'Jahr' });
  await felder.getByLabel('Richtung').selectOption({ label: 'Absteigend' });
  const pfad = (r) => new URL(r.url()).pathname;
  const gespeichert = s.waitForResponse((r) => r.request().method() === 'PUT' && /^\/api\/typen\//.test(pfad(r)));
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await gespeichert;
  await bearbeitung.getByText('Mappentyp gespeichert.').waitFor();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  const typ = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten.find((x) => x.id === beleg.id);
  assert.deepEqual(typ.felder.find((f) => f.key === 'vorjahr').auswahlReihenfolge, { feld: 'jahr', absteigend: true });
});

/** Briefe in Lenas Eingangsordner legen und zweimal prüfen lassen (beim ersten Blick gelten Dateien als „wartend“). */
async function einliefern(namen) {
  const cookie = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie, body: { passwort: LENA.passwort } });
  const stand = (await api('GET', '/api/werkbank/eingangsordner', { cookie })).daten;
  assert.ok(stand.vorhanden, 'Eingangsordner da (DMS_EINGANG)');
  const ordner = join(stand.pfad, LENA.email);
  await mkdir(ordner, { recursive: true });
  for (const n of namen) await writeFile(join(ordner, `${n}.pdf`), beispielPdf(n));
  await api('POST', '/api/werkbank/eingangsordner/pruefen', { cookie });
  const r = (await api('POST', '/api/werkbank/eingangsordner/pruefen', { cookie })).daten;
  assert.equal(r.uebernommen, namen.length);
}

rauchtest(
  'Neue Post: über den Eingangsordner – die offene Liste lädt nach, unter dem Finger erst auf Klick (#1668)',
  { als: LENA, timeout: 120_000 },
  async (s) => {
    const z = (await api('GET', '/api/sichten', { cookie: await sitzung(LENA) })).daten;
    await s.goto(BASIS + `/ablage/${z.neuePost}`);
    const liste = s.getByRole('region', { name: 'Mappen' });
    const zahl = s.locator('.listenzahl');
    await zahl.waitFor();
    const links = async () => (await api('GET', '/api/sichten', { cookie: await sitzung(LENA) })).daten.sichten[z.neuePost];
    const eintraege = liste.locator('.mappenliste > li:not(.nachladen), .listenrumpf tbody tr');
    /** Warten, bis die Liste `n` Einträge zeigt – ohne Neuladen der Seite. */
    const zeigt = (n, timeout = 40_000) =>
      s.waitForFunction((n) => document.querySelectorAll('.mappenliste > li:not(.nachladen), .listenrumpf tbody tr').length === n, n, {
        timeout,
      });
    const vorher = await links();
    await zeigt(vorher, 15_000);
    // „Neu laden“ ist mit der Tastatur erreichbar.
    const neu = liste.getByRole('button', { name: 'Neu laden' });
    await neu.focus();
    await neu.press('Enter');
    // Nichts gewählt, nichts offen, oben: Die Liste lädt von selbst nach (Takt des Nachladens, #919).
    await einliefern(['Rauchtest Nachladen Eins', 'Rauchtest Nachladen Zwei']);
    await zeigt(vorher + 2);
    assert.equal(await links(), vorher + 2);
    assert.match(await zahl.textContent(), new RegExp(`^${vorher + 2} `));
    // Etwas ausgewählt: kein Springen – erst der Hinweis, dann auf Klick; die Auswahl bleibt.
    const haken = eintraege.first().getByRole('checkbox');
    await haken.check();
    await einliefern(['Rauchtest Nachladen Drei']);
    const hinweis = liste.getByRole('button', { name: '1 neue – anzeigen' });
    await hinweis.waitFor({ timeout: 40_000 });
    assert.equal(await eintraege.count(), vorher + 2, 'noch nicht in der Liste');
    await liste.getByRole('button', { name: 'Auswahl aufheben' }).waitFor();
    await axePruefen(s, ABLAGE_BEREICHE);
    await hinweis.click();
    await zeigt(vorher + 3, 15_000);
    await hinweis.waitFor({ state: 'detached' });
    assert.equal(await liste.locator('input[type="checkbox"]:checked').count(), 1, 'die Auswahl bleibt');
    await liste.getByRole('button', { name: 'Auswahl aufheben' }).click();
    assert.match(await zahl.textContent(), new RegExp(`^${vorher + 3} `), 'Kopfzeile wie die Zahl links');
    // Eine Post offen (mittlere Spalte zeigt sie): „Post 1 von n“ zählt neue Post mit.
    await eintraege.first().getByRole('link').first().click();
    const blaettern = s.getByRole('navigation', { name: 'Neue Post blättern' });
    await blaettern.getByText(`von ${vorher + 3}`).waitFor();
    await einliefern(['Rauchtest Nachladen Vier']);
    await blaettern.getByText(`von ${vorher + 4}`).waitFor({ timeout: 40_000 });
  },
);
