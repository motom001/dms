/**
 * Rauchtests des Oberflächen-Bündels KW48 (Teil 1): Der Assistent verdeckt keine Spalte (#1590, #1602), Knöpfe und
 * Auswahl einer Zeile sind gleich hoch (#1589, #1605), die Sprungleiste klebt bündig oben (#1604) und die Zahlen der
 * Werkbank stehen schon vor dem Öffnen eines Bereichs da (#1585).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/spalten-und-leisten.mjs [fehlerordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';

const typVon = async (cookie, name) => (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.name === name);

/** Eine Rechnung zum Ansehen (Betrag mit einer Nachkommastelle für #1608 im zweiten Teil). */
export async function rechnungAnlegen(cookie, nummer) {
  const rechnung = await typVon(cookie, 'Rechnung');
  const m = (
    await api('POST', '/api/mappen', {
      cookie,
      body: {
        typId: rechnung.id,
        werte: { rechnungsnummer: nummer, rechnungsdatum: '2026-11-02', betrag: { betrag: 12.5, waehrung: 'EUR' } },
      },
    })
  ).daten;
  return { typ: rechnung, mappe: m };
}

/** Lage des Assistenten unten rechts (runder Knopf) und der Platz, den er unten frei braucht. */
const assistent = (s) =>
  s.evaluate(() => {
    const k = document.querySelector('[class*="ort"] button, [class*="ort"] a');
    const b = k.getBoundingClientRect();
    return {
      links: b.left,
      oben: b.top,
      platz: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--platz-begleiter')),
    };
  });

/** Alle rollenden Flächen der Spalten ans Ende rollen. */
const ansEnde = (s) =>
  s.evaluate(() => {
    for (const e of document.querySelectorAll('.spalte, .listenrumpf'))
      if (/auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
  });

/* ---------- Assistent ohne verdeckte Spalten (#1590, #1602) ---------- */

rauchtest('Ablage: Spalten reichen bis unten, die Speicherleiste lässt dem Assistenten Platz (#1590)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  const { typ, mappe } = await rechnungAnlegen(c, 'R-1590');
  await s.setViewportSize({ width: 1366, height: 640 });
  await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
  const leiste = s.locator('.spalte.mappe .speicherleiste');
  await leiste.waitFor();
  await ansEnde(s);
  const a = await assistent(s);
  const m = await s.evaluate(() => ({
    hoehe: innerHeight,
    liste: Math.round(document.querySelector('.spalte.liste').getBoundingClientRect().bottom),
    mappe: Math.round(document.querySelector('.spalte.mappe').getBoundingClientRect().bottom),
    rumpf: Number.parseFloat(getComputedStyle(document.querySelector('.spalte.liste > .listenrumpf')).paddingBottom),
  }));
  assert.equal(m.liste, m.hoehe, 'Mitte reicht bis unten – kein Streifen über ihrem Ende');
  assert.equal(m.mappe, m.hoehe, 'Mappe reicht bis unten');
  assert.ok(m.rumpf >= a.platz, `Freiraum am Ende der Liste (${m.rumpf} px)`);
  const knoepfe = await leiste.locator('[data-knopf]').evaluateAll((l) => l.map((k) => k.getBoundingClientRect().toJSON()));
  for (const k of knoepfe) assert.ok(k.right <= a.links || k.bottom <= a.oben, 'Kein Knopf der Speicherleiste unter dem Assistenten');
});

rauchtest(
  'Werkbank: Übersicht und Systemzustand ohne leeren Streifen, Ende nicht unter dem Assistenten (#1590, #1602)',
  { als: LENA },
  async (s) => {
    await s.setViewportSize({ width: 1366, height: 640 });
    await s.goto(BASIS + '/werkbank');
    await verwalten(s);
    await s.locator('.uebersicht-hinweise').waitFor();
    await ansEnde(s);
    let a = await assistent(s);
    const uebersicht = await s.evaluate(() => {
      const r = document.querySelector('.spalte.liste > .listenrumpf');
      const letztes = [...r.children].filter((e) => e.getBoundingClientRect().height > 2).pop();
      return {
        unten: letztes.getBoundingClientRect().bottom,
        spalte: document.querySelector('.spalte.liste').getBoundingClientRect().bottom,
      };
    });
    assert.ok(uebersicht.unten <= a.oben, `Letzter Inhalt der Übersicht endet über dem Assistenten (${uebersicht.unten} / ${a.oben})`);
    await s.goto(BASIS + '/werkbank/systemzustand');
    const leiste = s.locator('.spalte.mappe .speicherleiste');
    await leiste.waitFor();
    await ansEnde(s);
    a = await assistent(s);
    const sz = await s.evaluate(() => ({
      hoehe: innerHeight,
      mappe: Math.round(document.querySelector('.spalte.mappe').getBoundingClientRect().bottom),
      leiste: document.querySelector('.spalte.mappe .speicherleiste').getBoundingClientRect().bottom,
    }));
    assert.equal(sz.mappe, sz.hoehe, 'Systemzustand: Spalte reicht bis unten, kein leerer Streifen');
    assert.ok(sz.hoehe - sz.leiste < 40, `Speicherleiste am Ende dicht über dem Rand (${sz.hoehe - sz.leiste} px frei)`);
    const knoepfe = await leiste.locator('[data-knopf]').evaluateAll((l) => l.map((k) => k.getBoundingClientRect().toJSON()));
    for (const k of knoepfe) assert.ok(k.right <= a.links || k.bottom <= a.oben, 'Kein Knopf der Speicherleiste unter dem Assistenten');
  },
);

/* ---------- Gleich hohe Bedienelemente (#1589, #1605) ---------- */

rauchtest('Knöpfe einer Zeile gleich hoch: Anlegen und ⋯ im Listenkopf (#1589)', { als: LENA }, async (s) => {
  const rechnung = await typVon(await sitzung(LENA), 'Rechnung');
  await s.goto(BASIS + `/ablage/${rechnung.id}`);
  const kopf = s.locator('.listenkopf');
  const anlegen = kopf.getByRole('link', { name: '+ Rechnung' }).or(kopf.getByRole('button', { name: '+ Rechnung' }));
  const mehr = kopf.getByRole('button', { name: /^Weitere Aktionen/ });
  await mehr.waitFor();
  const [h1, h2] = [(await anlegen.boundingBox()).height, (await mehr.boundingBox()).height];
  assert.ok(Math.abs(h1 - h2) < 1, `gleich hoch (${h1} / ${h2})`);
});

rauchtest('Werkbank → Aufgaben: Auswahl in Knopfhöhe, keine Auswahl je Zeile (#1605)', { als: LENA }, async (s) => {
  const c = await sitzung(LENA);
  const { mappe } = await rechnungAnlegen(c, 'R-1605');
  const ich = (await api('GET', '/api/konto/status', { cookie: c })).daten.benutzer;
  const aufgabe = (
    await api('POST', `/api/mappen/${mappe.id}/ablaeufe`, {
      cookie: c,
      body: { vorlage: 'aufgabe_vergeben', text: 'Rauchtest 1605', empfaengerId: ich.id },
    })
  ).daten.aufgaben[0];
  try {
    await s.goto(BASIS + `/werkbank/aufgaben/${aufgabe.id}`);
    await verwalten(s);
    const rechts = s.locator('.spalte.mappe');
    const wahl = rechts.getByRole('combobox', { name: /weitergeben an/ });
    await wahl.waitFor();
    // Eine Zeile: Text, Auswahl und Knopf auf einer Linie, die Auswahl so hoch wie der Knopf.
    const knopf = rechts.getByRole('button', { name: 'Weitergeben', exact: true });
    const zeilePruefen = async (wann) => {
      const [w, k] = [await wahl.boundingBox(), await knopf.boundingBox()];
      const lage = `${wann}: Auswahl y ${w.y} h ${w.height} b ${w.width}, Knopf y ${k.y} h ${k.height}`;
      assert.ok(w.height <= 44, `Auswahl einzeilig (${lage})`);
      assert.ok(Math.abs(w.height - k.height) < 1, `so hoch wie der Knopf (${lage})`);
      assert.ok(Math.abs(w.y + w.height / 2 - (k.y + k.height / 2)) < 2, `auf einer Linie (${lage})`);
      assert.ok(w.width <= 220.5, `Auswahl höchstens 220 px breit (${lage})`);
    };
    await zeilePruefen('wie geladen');
    // Ein langer Name (etwa mit Abwesenheit) macht die Auswahl nicht breiter als 220 px und schiebt „Weitergeben“ nicht
    // in eine eigene Zeile – so lief der Fall im ganzen Lauf rot, als dort mehr Personen da waren.
    await wahl.evaluate((e) => {
      const o = document.createElement('option');
      o.textContent = 'Jonas Beispiel – abwesend bis 31.12.2026, Vertretung: Lena Beispiel';
      e.append(o);
    });
    await zeilePruefen('mit langem Namen');
    // Liste kompakt: keine Auswahl je Zeile; mehrere über Ankreuzen und Sammelleiste.
    const liste = s.locator('.spalte.liste');
    assert.equal(await liste.locator('.sammel-liste select').count(), 0, 'keine Auswahl je Zeile');
    await liste.getByRole('checkbox', { name: 'Alle angezeigten auswählen' }).check();
    const sammel = s.getByRole('combobox', { name: /Ausgewählte weitergeben an/ });
    await sammel.waitFor();
    assert.ok((await sammel.boundingBox()).height <= 44, 'Sammelleiste: Auswahl einzeilig');
  } finally {
    await api('POST', `/api/aufgaben/${aufgabe.id}/erledigt`, { cookie: c });
  }
});

/* ---------- Sprungleiste (#1604) ---------- */

rauchtest('Mappentyp-Editor: Sprungleiste bündig oben, Sprung setzt die Überschrift darunter (#1604)', { als: LENA }, async (s) => {
  const rechnung = await typVon(await sitzung(LENA), 'Rechnung');
  await s.setViewportSize({ width: 1366, height: 700 });
  await s.goto(BASIS + `/werkbank/typen/${rechnung.id}`);
  await verwalten(s);
  const leiste = s.locator('[data-sprungleiste]');
  await leiste.waitFor();
  await leiste.getByRole('button', { name: 'Alle aufklappen' }).click();
  await s.locator('.spalte.mappe').evaluate((e) => (e.scrollTop = 800));
  const oben = () =>
    s.evaluate(() => ({
      spalte: document.querySelector('.spalte.mappe').getBoundingClientRect().top,
      leiste: document.querySelector('[data-sprungleiste]').getBoundingClientRect(),
    }));
  const o = await oben();
  assert.ok(Math.abs(o.leiste.top - o.spalte) <= 1, `bündig mit der Oberkante der Spalte (${o.leiste.top} / ${o.spalte})`);
  await leiste.getByRole('button', { name: 'Titel', exact: true }).click();
  const kopf = s.locator('#titel');
  // Rollen mit Übergang: warten, bis die Überschrift stillsteht.
  let vorher = null;
  for (let i = 0; i < 40; i++) {
    const jetzt = (await kopf.boundingBox()).y;
    if (jetzt === vorher) break;
    vorher = jetzt;
    await s.waitForTimeout(100);
  }
  const l = (await oben()).leiste;
  const k = await kopf.boundingBox();
  assert.ok(k.y >= l.bottom - 1 && k.y <= l.bottom + 16, `Abschnitt direkt unter der Leiste (${k.y} / ${l.bottom})`);
});

/* ---------- Zahlen der Werkbank vor dem Öffnen (#1585) ---------- */

rauchtest(
  'Werkbank: Zahlen hinter Tipps, Automatisierungen und Stempel stehen vor dem ersten Öffnen da (#1585)',
  { als: LENA },
  async (s) => {
    await s.goto(BASIS + '/werkbank');
    await verwalten(s);
    await s.locator('.uebersicht-hinweise').waitFor();
    const leiste = s.locator('.spalte.sichten');
    for (const name of ['Tipps', 'Automatisierungen', 'Stempel']) {
      const eintrag = leiste.getByRole('link', { name: new RegExp(`^${name}`) });
      await eintrag.locator('[data-zahl]').waitFor();
      assert.match((await eintrag.textContent()) ?? '', /\d/, `${name}: Zahl ohne Öffnen`);
    }
  },
);
