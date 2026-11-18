/**
 * Rauchtests für die Werkbank am Handy, Teil 3 (#1292): Alle Werkbank-Seiten sind am Handy nicht kaputt – kein
 * seitliches Rollen, nichts breiter als der Bildschirm, Speicherleiste erreichbar, axe ohne Verstoß –, und nichts ist
 * gesperrt. Seiten zum Aufbauen zeigen oben ruhig „Am Rechner oder Tablet bequemer“. Das Tablet hoch und quer zeigt die
 * volle Werkbank und wird wie der Rechner geprüft.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-handy-seiten.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, TABLET_HOCH, TABLET_QUER, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

/**
 * Alle Bereiche der Werkbank (EINTRAEGE in shared/src/werkbankansicht.ts) samt Übersicht und „Werkbank anpassen“. Ein
 * eigener Rauchtest unten prüft, dass die Navigation am Handy keinen Bereich anbietet, der hier fehlt.
 */
const BEREICHE = [
  'uebersicht',
  'ansicht',
  'pakete',
  'beispielablage',
  'typen',
  'sichten',
  'nummernkreise',
  'automatisierungen',
  'ablaufvorlagen',
  'rundgaenge',
  'tipps',
  'benutzer',
  'verschluesselung',
  'aufbewahrung',
  'stempel',
  'auskuenfte',
  'loeschkonzept',
  'loeschprotokoll',
  'postfaecher',
  'eingangsordner',
  'webdav',
  'texterkennung',
  'woerter',
  'sicherung',
  'vollexport',
  'papierkorb',
  'daten',
  'betrieb',
  'region',
  'sprachen',
  'organisation',
  'aufgaben',
  'anmeldeschutz',
  'designs',
  'anbindung',
  'systemzustand',
  'protokoll',
  'fehlermeldungen',
  'wartung',
  'demo',
];
/** Bereiche mit Liste in der Mitte: dazu der erste Eintrag und, wo es das gibt, „neu“. */
const MIT_NEU = [
  'typen',
  'sichten',
  'automatisierungen',
  'rundgaenge',
  'tipps',
  'benutzer',
  'stempel',
  'auskuenfte',
  'postfaecher',
  'woerter',
  'designs',
];
const MIT_EINTRAG = [...MIT_NEU, 'nummernkreise', 'ablaufvorlagen', 'protokoll', 'aufgaben', 'papierkorb', 'fehlermeldungen'];
/** Am Handy mühsam (HANDY_BEQUEMER in shared/src/werkbankansicht.ts): oben der Hinweis. */
const BEQUEMER = ['typen', 'sichten', 'nummernkreise', 'automatisierungen', 'ablaufvorlagen', 'rundgaenge', 'tipps', 'stempel', 'designs'];

const weg = (b) => (b === 'uebersicht' ? '/werkbank' : `/werkbank/${b}`);
/** Seiten der Prüfung: jeder Bereich, „neu“ und der erste Eintrag (`eintrag`, Adresse erst aus der Liste). */
const SEITEN = [
  ...BEREICHE.map((b) => ({ weg: weg(b) })),
  ...MIT_NEU.map((b) => ({ weg: `${weg(b)}/neu` })),
  ...MIT_EINTRAG.map((b) => ({ weg: weg(b), eintrag: true })),
];

/** Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt. */
const ERWARTET = [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }];

/** Seite öffnen, mit `eintrag` den ersten Eintrag der Liste (gibt es keinen, bleibt es bei der Liste). Gibt den Weg zurück. */
async function oeffnen(s, seite) {
  let w = seite.weg;
  await s.goto(BASIS + w);
  await s.locator('.rumpf h1:visible').first().waitFor();
  await s.waitForLoadState('networkidle');
  if (seite.eintrag) {
    const link = s.locator(`.spalte.liste a[href^="${w}/"]:not([href$="/neu"]):not([href$="/ziele"])`).first();
    if (!(await link.count())) return null;
    w = (await link.getAttribute('href')) ?? w;
    await s.goto(BASIS + w);
    await s.locator('.spalte.mappe :is(h1, h2):visible').first().waitFor();
    await s.waitForLoadState('networkidle');
  }
  return w;
}

/**
 * Nicht kaputt: kein seitliches Rollen, kein Bedienelement über dem Rand (außer in einer Fläche, die selbst rollt), die
 * Speicherleiste – wo es eine gibt – ganz im Bild erreichbar. Rückgabe: Funde als Zeilen.
 */
async function nichtKaputt(s) {
  const funde = await s.evaluate(() => {
    const aus = [];
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > w) aus.push(`Seite rollt waagerecht (${document.documentElement.scrollWidth} > ${w} px)`);
    const rollt = (e) => {
      for (let p = e.parentElement; p; p = p.parentElement)
        if (p.scrollWidth > p.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const zuBreit = [...document.querySelectorAll('.drei .spalte :is(a[href], button, input, select, textarea, summary, label)')]
      .filter((e) => e.getClientRects().length && !rollt(e))
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 1 || r.left < -1);
      });
    for (const e of zuBreit.slice(0, 3))
      aus.push(
        `${e.tagName.toLowerCase()} „${(e.textContent ?? '').trim().slice(0, 40)}“ ragt über den Rand (${Math.round(e.getBoundingClientRect().right)} px)`,
      );
    return aus;
  });
  // Speicherleiste: ins Bild holen, dann ganz zu sehen und ihre Knöpfe im Bildschirm.
  const leiste = s.locator('.drei .spalte .speicherleiste:visible').first();
  if (await leiste.count()) {
    await leiste.scrollIntoViewIfNeeded();
    const lage = await leiste.evaluate((l) => {
      const r = l.getBoundingClientRect();
      const knoepfe = [...l.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
      return {
        im: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
        knoepfe: knoepfe.every((b) => b.left >= -1 && b.right <= innerWidth + 1),
      };
    });
    if (!lage.im || !lage.knoepfe) funde.push(`Speicherleiste nicht ganz erreichbar (${JSON.stringify(lage)})`);
  }
  return funde;
}

/** Eine Prüfung über einen Teil der Seiten bei einer Breite (Grenze je Rauchtest 120 s). */
function pruefen({ name, handy, geraet, teile }) {
  for (let teil = 0; teil < teile; teil++)
    rauchtest(`${name}, Teil ${teil + 1} (#1292)`, { handy, geraet, als: LENA, erwartet: ERWARTET }, async (s) => {
      await s.goto(BASIS + '/ablage/start');
      await verwalten(s);
      const funde = [];
      for (const seite of SEITEN.filter((_, i) => i % teile === teil)) {
        const w = await oeffnen(s, seite);
        if (!w) continue;
        // Nichts gesperrt, nichts umgeleitet: Die Seite bleibt, wo sie ist.
        if (new URL(s.url()).pathname !== w) funde.push(`${w}: umgeleitet nach ${new URL(s.url()).pathname}`);
        if (geraet) {
          const spalten = await s.evaluate(
            () => [...document.querySelectorAll('.drei > .spalte')].filter((e) => e.getClientRects().length).length,
          );
          if (spalten < 2) funde.push(`${w}: nicht die volle Werkbank (${spalten} Spalte)`);
        }
        // axe zuerst, solange die Seite oben steht: Danach rollt die Prüfung die Speicherleiste ins Bild. Die haftende
        // Speicherleiste steht dafür kurz an ihrem Platz im Formular – sonst deckt sie beim ersten Bild Knöpfe darunter
        // halb zu, und axe zählt das als zu kleine Tippfläche (dort rollt man erst hin).
        const haften = (an) =>
          s.evaluate((an) => {
            for (const l of document.querySelectorAll('.speicherleiste')) l.style.position = an ? '' : 'static';
          }, an);
        await haften(false);
        for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${w}: axe ${v}`);
        await haften(true);
        for (const v of await nichtKaputt(s)) funde.push(`${w}: ${v}`);
      }
      assert.deepEqual(funde, [], funde.join('\n'));
    });
}

pruefen({ name: 'Handy: jede Werkbank-Seite nicht kaputt, nichts gesperrt', handy: true, teile: 5 });
// iPad hoch (768 × 1024) und quer (1180 × 820): die volle Werkbank wie am Rechner (#1204).
pruefen({ name: 'Tablet hoch: jede Werkbank-Seite wie am Rechner', geraet: TABLET_HOCH, teile: 4 });
pruefen({ name: 'Tablet quer: jede Werkbank-Seite wie am Rechner', geraet: TABLET_QUER, teile: 4 });

rauchtest(
  'Handy: „Am Rechner oder Tablet bequemer“ nur auf Seiten zum Aufbauen, ohne Sperre (#1292)',
  { handy: true, als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const funde = [];
    for (const b of BEREICHE.filter((x) => x !== 'uebersicht')) {
      await s.goto(BASIS + weg(b));
      await s.locator('.rumpf h1:visible').first().waitFor();
      const hinweis = s.locator('.wb-handykopf:visible').getByText('Am Rechner oder Tablet bequemer.');
      const da = (await hinweis.count()) > 0;
      if (da !== BEQUEMER.includes(b)) funde.push(`${b}: Hinweis ${da ? 'da' : 'fehlt'}`);
    }
    // Der Hinweis sperrt nichts: Anlegen geht auch am Handy (der Editor öffnet sich).
    await s.goto(BASIS + '/werkbank/typen/neu');
    await s.locator('.spalte.mappe h1:visible').first().waitFor();
    await s.locator('.wb-handykopf:visible').getByText('Am Rechner oder Tablet bequemer.').waitFor();
    assert.ok((await s.locator('.spalte.mappe input:visible').count()) > 0, 'Editor am Handy bedienbar');
    // Am Rechner kein Hinweis.
    await s.setViewportSize({ width: 1180, height: 900 });
    await s.goto(BASIS + '/werkbank/typen');
    await s.locator('.rumpf h1:visible').first().waitFor();
    assert.equal(await s.getByText('Am Rechner oder Tablet bequemer.').count(), 0, 'am Rechner kein Hinweis');
    assert.deepEqual(funde, [], funde.join('\n'));
  },
);

rauchtest('Handy: die Prüfung kennt jeden Bereich, den die Navigation anbietet (#1292)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank?bereiche');
  await s.getByRole('heading', { name: 'Bereiche der Werkbank', level: 1 }).waitFor();
  const angeboten = async () =>
    s.evaluate(() => [...document.querySelectorAll('a[data-anker^="werkbank.bereich:"]')].map((a) => a.dataset.anker.split(':')[1]));
  const alle = new Set(await angeboten());
  const aufklappen = s.getByRole('button', { name: /ausgeblendet/ });
  if (await aufklappen.count()) await aufklappen.click();
  const reiter = s.getByRole('tablist', { name: 'Bereiche der Werkbank' }).getByRole('tab');
  for (let i = 0; i < (await reiter.count()); i++) {
    await reiter.nth(i).click();
    for (const b of await angeboten()) alle.add(b);
  }
  const fehlt = [...alle].filter((b) => !BEREICHE.includes(b));
  assert.deepEqual(fehlt, [], `Bereiche ohne Rauchtest am Handy (in BEREICHE ergänzen): ${fehlt.join(', ')}`);
});

rauchtest(
  'Tablet: kein Wort der Werkbank-Leiste bricht mitten im Wort um, 768 bis 1100 px (#1271, #1204)',
  { geraet: TABLET_HOCH, als: LENA },
  async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const funde = [];
    // Auf einer Seite mit langem, fett gesetztem Namen (gewählt) und einer mit Plakette daneben (Systemzustand).
    for (const breite of [768, 820, 900, 1024, 1100])
      for (const w of ['/werkbank/ablaufvorlagen', '/werkbank/systemzustand']) {
        await s.setViewportSize({ width: breite, height: 1024 });
        await s.goto(BASIS + w);
        await s.locator('nav.werkbankleiste a.sicht').nth(3).waitFor();
        const gebrochen = await s.evaluate(() =>
          [...document.querySelectorAll('nav.werkbankleiste a.sicht .nm')].flatMap((n) => {
            const t = n.firstChild;
            if (!t || t.nodeType !== 3) return [];
            let i = 0;
            const aus = [];
            for (const wort of t.textContent.split(' ')) {
              const r = document.createRange();
              r.setStart(t, i);
              r.setEnd(t, i + wort.length);
              if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1) aus.push(wort);
              i += wort.length + 1;
            }
            return aus;
          }),
        );
        for (const wort of gebrochen) funde.push(`${breite} px, ${w}: „${wort}“ bricht um`);
      }
    assert.deepEqual(funde, [], funde.join('\n'));
  },
);
