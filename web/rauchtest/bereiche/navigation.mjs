/**
 * Rauchtests: Navigation – Assistent immer an derselben Stelle (#1283), schlankes Benutzermenü und „Meine Meldungen“
 * (#1331), erster Rundgang mit sechstem Schritt und Karte an festem Platz (#1300, #1301), Weg zurück aus „Mein Konto“
 * (#1302).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/navigation.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, benutzermenue, JONAS, keineWaagerechteRolle, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Jonas hat den ersten Rundgang schon gesehen – sonst läge er beim Alleinstart über allen Tests (werkbank.mjs prüft ihn). */
const ohneErstenRundgang = async () =>
  api('POST', '/api/entdecken/rundgaenge/ablago', { cookie: await sitzung(JONAS), body: { stand: 'gesehen' } });

/* ---------- #1283: Assistent an derselben Stelle, nach dem Rollen ans Ende verdeckt er nichts ---------- */

/** Lage des Assistenten und die Bedienelemente, die er verdeckt – nachdem jede rollbare Fläche ans Ende gerollt ist. */
const lageUndVerdeckt = (s) =>
  s.evaluate(async () => {
    for (const el of [document.scrollingElement, ...document.querySelectorAll('*')])
      if (el === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = document.querySelector('[data-anker="assistent"] button');
    if (!k) return { lage: null, verdeckt: [] };
    const r = k.getBoundingClientRect();
    const verdeckt = [];
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [tabindex="0"]')) {
      if (el.closest('[data-begleiter]')) continue;
      const q = el.getBoundingClientRect();
      const x = Math.min(r.right, q.right) - Math.max(r.left, q.left);
      const y = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (!q.width || !q.height || x <= 0 || y <= 0) continue;
      // Nur, was dort wirklich zu sehen ist (nicht von seiner rollenden Fläche abgeschnitten).
      const unter = document.elementsFromPoint(Math.max(r.left, q.left) + x / 2, Math.max(r.top, q.top) + y / 2);
      if (unter.some((u) => u === el || el.contains(u)))
        verdeckt.push(`${el.tagName.toLowerCase()} „${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}“`);
    }
    return { lage: [r.left, r.top, r.width, r.height].map(Math.round).join(','), verdeckt };
  });

/** Die Kernseiten aus #1283: Start, Ansicht, Mappe, Neue Post, Werkbank-Übersicht, eine Werkbank-Seite, Konto. */
async function kernseiten(s) {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  const vertrag = typen.find((x) => x.name === 'Vertrag').id;
  const ruhig = () => s.waitForLoadState('networkidle');
  return [
    ['Start', () => s.goto(BASIS + '/ablage/start').then(ruhig)],
    ['Ansicht', () => s.goto(BASIS + `/ablage/${vertrag}`).then(ruhig)],
    [
      'Mappe',
      async () => {
        await s.goto(BASIS + `/ablage/${vertrag}`);
        await s
          .getByRole('region', { name: 'Mappen' })
          .getByRole('link', { name: /Stromvertrag Haus/ })
          .first()
          .click();
        await s.getByRole('region', { name: 'Mappe' }).getByRole('button', { name: 'Mappe speichern' }).waitFor();
        await ruhig();
      },
    ],
    ['Neue Post', () => s.goto(BASIS + '/ablage/post').then(ruhig)],
    ['Werkbank-Übersicht', () => s.goto(BASIS + '/werkbank').then(ruhig)],
    ['Werkbank → Benutzer', () => s.goto(BASIS + '/werkbank/benutzer').then(ruhig)],
    ['Konto', () => s.goto(BASIS + '/profil/konto').then(ruhig)],
  ];
}

for (const handy of [false, true])
  rauchtest(
    `${handy ? 'Handy' : 'Rechner'}: Assistent überall an derselben Stelle, verdeckt nach dem Rollen nichts (#1283)`,
    { als: LENA, handy, timeout: 90_000 },
    async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      const lagen = {};
      const funde = [];
      for (const [name, oeffne] of await kernseiten(s)) {
        await oeffne();
        const r = await lageUndVerdeckt(s);
        assert.ok(r.lage, `${name}: kein Assistent`);
        lagen[name] = r.lage;
        for (const v of r.verdeckt) funde.push(`${name}: ${v}`);
      }
      assert.equal(new Set(Object.values(lagen)).size, 1, `Der Assistent steht nicht überall gleich:\n${JSON.stringify(lagen, null, 1)}`);
      assert.deepEqual(funde, [], `Der Assistent verdeckt nach dem Rollen ans Ende:\n${funde.join('\n')}`);
      // Am Handy steht er nicht mehr in der Kopfzeile der Werkbank (früher `imKopf`).
      if (handy) assert.equal(await s.locator('.kopf [data-begleiter]').count(), 0);
    },
  );

rauchtest('Handy: Benutzermenü als Blatt – der Assistent liegt nicht darüber (#1283)', { als: LENA, handy: true }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  const menue = await benutzermenue(s, LENA);
  await menue.getByRole('button', { name: 'Abmelden' }).waitFor();
  assert.equal(await s.locator('[data-anker="assistent"] button').isVisible(), false, 'Assistent über dem offenen Blatt');
  await s.keyboard.press('Escape');
  await s.locator('[data-anker="assistent"] button').waitFor();
});

/* ---------- #1331: Benutzermenü und „Meine Meldungen“ ---------- */

rauchtest('Benutzermenü: jeder Weg nur einmal – ohne Hilfe, Laufwerk und „Ablago entdecken“ (#1331)', { als: JONAS }, async (s) => {
  await ohneErstenRundgang();
  await s.goto(BASIS + '/ablage/start');
  const menue = await benutzermenue(s, JONAS);
  await menue.getByRole('link', { name: 'Mein Konto' }).waitFor();
  const eintraege = await menue.locator('.menuepunkt').allInnerTexts();
  assert.deepEqual(
    eintraege.map((x) => x.trim()),
    ['Mein Konto', 'Fehler melden', 'Über Ablago', 'Abmelden'],
  );
  // „Ablago entdecken“ steckt im Assistenten unter „Tipps“.
  await s.keyboard.press('Escape');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  await s.getByRole('radio', { name: /^Tipps/ }).click();
  await s.getByRole('dialog', { name: 'Assistent' }).getByRole('link', { name: 'Alle Tipps und Rundgänge ›' }).click();
  await s.getByRole('heading', { name: 'Ablago entdecken', level: 1 }).waitFor();
});

rauchtest('Fehler melden: Bereich in „Mein Konto“, „Meine Meldungen“ offen und erledigt, nur eigene (#1331)', { als: JONAS }, async (s) => {
  await ohneErstenRundgang();
  // Eine Meldung von Lena: die darf Jonas nie sehen.
  await api('POST', '/api/konto/fehlermeldung', { cookie: await sitzung(LENA), body: { text: 'Rauchtest Lena: fremde Meldung' } });
  await s.goto(BASIS + '/ablage/start');
  const menue = await benutzermenue(s, JONAS);
  await menue.getByRole('link', { name: 'Fehler melden' }).click();
  const leiste = s.getByRole('complementary', { name: 'Bereiche des Profils' });
  const eintrag = leiste.getByRole('link', { name: 'Fehler melden' });
  await eintrag.waitFor();
  assert.equal(await eintrag.getAttribute('aria-current'), 'page');
  assert.match((await eintrag.getAttribute('class')) ?? '', /\ban\b/, '„Fehler melden“ ist in der Leiste hervorgehoben');
  const meine = s.getByRole('region', { name: 'Meine Meldungen' });
  await meine.waitFor();
  await s.getByRole('textbox', { name: 'Was ist passiert?' }).fill('Rauchtest Jonas: Knopf reagiert nicht');
  await s.getByRole('button', { name: 'Meldung senden' }).click();
  await s.getByText('Deine Meldung ist angekommen.').waitFor();
  const zeile = meine.getByRole('listitem').filter({ hasText: 'Rauchtest Jonas: Knopf reagiert nicht' });
  await zeile.getByText('offen').waitFor();
  assert.equal(await meine.getByText(/Rauchtest Lena/).count(), 0, 'fremde Meldung sichtbar');
  // Die Verwaltung löscht die Meldung: für Jonas „erledigt“, ohne Text.
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const liste = (await api('GET', '/api/werkbank/fehlermeldungen', { cookie: verwaltung })).daten;
  const id = (text) => liste.find((m) => m.text.startsWith(text)).id;
  await api('DELETE', `/api/werkbank/fehlermeldungen/${id('Rauchtest Jonas')}`, { cookie: verwaltung });
  // Lenas Meldung wieder weg: Spätere Tests sehen keinen zusätzlichen Hinweis in der Werkbank.
  await api('DELETE', `/api/werkbank/fehlermeldungen/${id('Rauchtest Lena')}`, { cookie: verwaltung });
  await s.reload();
  await meine.getByRole('listitem').first().waitFor();
  assert.equal(await meine.getByText(/Rauchtest Jonas/).count(), 0, 'Text einer gelöschten Meldung sichtbar');
  await meine
    .getByText(/^erledigt am /)
    .first()
    .waitFor();
  const funde = await axePruefen(s, ['.profil']);
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

/* ---------- #1302: Weg zurück zur Ablage ---------- */

rauchtest('Mein Konto: „Zurück zur Ablage“ führt zur zuletzt besuchten Seite der Ablage (#1302)', { als: JONAS }, async (s) => {
  await ohneErstenRundgang();
  await s.goto(BASIS + '/ablage/post');
  await s.waitForLoadState('networkidle');
  for (const bereich of ['konto', 'darstellung', 'fehler-melden', 'abwesenheit']) {
    await s.goto(BASIS + `/profil/${bereich}`);
    const zurueck = s.getByRole('link', { name: 'Zurück zur Ablage' });
    await zurueck.waitFor();
    assert.equal(new URL(await zurueck.evaluate((a) => a.href)).pathname, '/ablage/post', `${bereich}: falsches Ziel`);
  }
  await s.getByRole('link', { name: 'Zurück zur Ablage' }).click();
  await s.waitForURL(/\/ablage\/post$/);
  // „Ablage“ in der Kopfzeile ist auch nicht gewählt als Weg erkennbar: Reiter-Form mit Rand.
  await s.goto(BASIS + '/profil/konto');
  const rand = await s
    .getByRole('navigation', { name: 'Bereiche' })
    .getByRole('link', { name: 'Ablage' })
    .evaluate((a) => getComputedStyle(a).borderTopStyle);
  assert.equal(rand, 'solid');
});

rauchtest('Handy: Mein Konto mit „Zurück zur Ablage“, Tippflächen (#1302)', { als: JONAS, handy: true }, async (s) => {
  await ohneErstenRundgang();
  await s.goto(BASIS + '/profil/darstellung');
  await s.getByRole('link', { name: 'Zurück zur Ablage' }).waitFor();
  await keineWaagerechteRolle(s);
  const zuKlein = await tippflaechenPruefen(s, ['.zurueck-ablage']);
  assert.deepEqual(zuKlein, [], `Zu kleine Tippflächen:\n${zuKlein.join('\n')}`);
});

/* ---------- #1300, #1301: erster Rundgang ---------- */

for (const handy of [false, true])
  rauchtest(
    `${handy ? 'Handy' : 'Rechner'}: Rundgang „Ablago in sechs Schritten“ – Karte an festem Platz, Schluss beim Assistenten (#1300, #1301)`,
    { als: JONAS, handy, timeout: 60_000 },
    async (s) => {
      await ohneErstenRundgang();
      await s.goto(BASIS + '/entdecken');
      await s
        .getByRole('region', { name: 'Rundgänge' })
        .getByRole('listitem')
        .filter({ hasText: 'Ablago in sechs Schritten' })
        .getByRole('button', { name: 'Rundgang starten' })
        .click();
      const rundgang = s.getByRole('dialog');
      const karte = s.locator('dialog.rundgang .rg-karte');
      const lagen = [];
      for (let i = 1; i <= 6; i++) {
        await rundgang.getByText(`Schritt ${i} von 6`).waitFor();
        await s.waitForTimeout(500);
        const b = await karte.boundingBox();
        // Unterkante und Mitte: Die Höhe hängt vom Text ab, der Platz nicht.
        lagen.push(`${Math.round(b.x + b.width / 2)},${Math.round(b.y + b.height)}`);
        if (i === 1) {
          // Schritt 1: eine Skizze, nichts darin sieht bedienbar aus.
          const skizze = rundgang.getByRole('img', { name: /^Skizze von Ablago/ });
          await skizze.getByText('Skizze').waitFor();
          assert.equal(await skizze.evaluate((el) => getComputedStyle(el).cursor), 'default');
        }
        if (i < 6) await rundgang.getByRole('button', { name: 'Weiter' }).click();
      }
      assert.equal(new Set(lagen).size, 1, `Die Karte wandert: ${lagen.join(' | ')}`);
      // Der letzte Schritt hebt den Assistenten hervor, der Schlusssatz nennt „Tipps“ im Assistenten.
      await rundgang.getByRole('heading', { name: 'Hilfe ist immer da' }).waitFor();
      const licht = await s.locator('.rg-licht').boundingBox();
      const knopf = await s.locator('[data-anker="assistent"]').boundingBox();
      assert.ok(licht.x <= knopf.x && licht.x + licht.width >= knopf.x + knopf.width, 'Hervorhebung nicht am Assistenten');
      await rundgang.getByText(/im Assistenten unter „Tipps“/).waitFor();
      assert.equal(await rundgang.getByText(/auf der Startseite/).count(), 0);
      await rundgang.getByRole('button', { name: 'Fertig' }).click();
      await rundgang.waitFor({ state: 'detached' });
    },
  );
