/**
 * Rauchtests: Ablage, Kopfzeile, Werkbank und Mein Konto aus Bausteinen: axe hell und dunkel, Tippflächen am Handy.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/aus-bausteinen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { ABLAGE_BEREICHE, api, BASIS, beispielPdf, daten, LENA, mitFragen, mitHandbuch, rauchtest, sitzung, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- Ablage aus Bausteinen: axe und Tippflächen (#1211, #1212) ---------- */


/**
 * Die Seiten der Ablage, die #1211/#1212 auf Bausteine umgestellt haben: Mappe (Formular und Speicherleiste),
 * Dokumentliste, Post, erweiterte Suche, Zu erledigen (Liste und Monat), Papierkorb. Je Seite ein Name und der Weg
 * dorthin (Daten über die Schnittstelle).
 */
async function ablageSeiten(cookie) {
  const typ = daten.bausteine;
  // Eine Mappe mit einem PDF für die Dokumentliste; eine zweite für den Papierkorb.
  const mitDok = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Keller Bausteine' } } })).daten;
  await api('POST', `/api/mappen/${mitDok.id}/dokumente?register=dokumente&name=${encodeURIComponent('Übergabeprotokoll.pdf')}&typ=application/pdf`, { cookie, body: beispielPdf('Übergabeprotokoll Keller'), roh: true });
  const weg = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Abstellraum Bausteine' } } })).daten;
  const post = (await api('POST', '/api/post', { cookie, body: { betreff: 'Kellerschlüssel Bausteine' } })).daten;
  await api('POST', `/api/mappen/${post.id}/dokumente?register=dokumente&name=${encodeURIComponent('Kellerschlüssel.pdf')}&typ=application/pdf`, { cookie, body: beispielPdf('Kellerschluessel'), roh: true });
  await api('DELETE', `/api/mappen/${weg.id}?grund=nicht_noetig`, { cookie });
  return [
    { name: 'Mappe', weg: async (s) => {
      await s.goto(BASIS + `/ablage/${typ.id}/${mitDok.id}`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('button', { name: 'Mappe speichern' }).waitFor();
    } },
    { name: 'Dokumente', weg: async (s) => {
      await s.goto(BASIS + `/ablage/${typ.id}/${mitDok.id}`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('tab', { name: /^Dokumente/ }).click();
      await s.locator('.dokzeile').filter({ hasText: 'Übergabeprotokoll.pdf' }).first().waitFor();
    } },
    { name: 'Post', weg: async (s) => {
      // Die Post-Mappe selbst (Leiste mit Stand, Zuordnen, Erkannt), nicht die Seite „Dokument übernehmen“ (#1217).
      await s.goto(BASIS + `/ablage/${post.typId}/${post.id}?als=post`);
      await s.getByRole('region', { name: 'Mappe' }).getByRole('tab').first().waitFor();
    } },
    { name: 'Suche', weg: async (s) => {
      await s.goto(BASIS + '/ablage/suche');
      await s.getByRole('form', { name: 'Erweiterte Suche' }).waitFor();
    } },
    { name: 'Aufgaben', weg: async (s) => {
      await s.goto(BASIS + '/ablage/eingang');
      await s.getByRole('radiogroup', { name: /Ansicht/ }).waitFor();
    } },
    { name: 'Termine', weg: async (s) => {
      await s.goto(BASIS + '/ablage/eingang');
      await s.getByRole('radio', { name: 'Monat' }).click();
      await s.locator('.ka-raster, .ka-monat').first().waitFor();
    } },
    { name: 'Papierkorb', weg: async (s) => {
      await s.goto(BASIS + '/ablage/papierkorb');
      await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Abstellraum Bausteine/ }).first().click();
      await s.getByRole('heading', { name: 'Abstellraum Bausteine', level: 1 }).first().waitFor();
    } },
  ];
}

/** Kopfzeile mit dem Suchfeld oben (#1218) und der Assistent (#1219) – in den Zuständen, die es gibt. */
const KOPF_BEREICHE = ['[data-anker="startseite.suche"]', '[data-begleiter]'];
async function kopfUndAssistent(s, pruefe) {
  await mitFragen(s);
  await mitHandbuch(s);
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + '/ablage/start');
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  await pruefe('Startseite');
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Vertrag').id}`);
  const kopf = s.getByRole('banner');
  const lupe = kopf.getByRole('button', { name: 'Suchen', exact: true });
  const feld = kopf.getByRole('searchbox', { name: 'Vertrag durchsuchen' });
  // Am Handy steht nur die Lupe; erst sie klappt das Feld auf.
  await feld.or(lupe).first().waitFor();
  if (await lupe.isVisible()) await lupe.click();
  await feld.fill('Haus');
  await kopf.getByRole('button', { name: /Suchen in/ }).click();
  await kopf.getByRole('group', { name: 'Suchen in' }).waitFor();
  await pruefe('Ansicht mit „Suchen in“');
  await s.keyboard.press('Escape');
  await s.getByRole('button', { name: /^Assistent öffnen/ }).click();
  const fenster = s.getByRole('dialog', { name: 'Assistent' });
  for (const r of ['Fragen', 'Tipps', 'Handbuch']) {
    await fenster.getByRole('radio', { name: new RegExp(`^${r}`) }).click();
    if (r === 'Handbuch') await fenster.getByRole('searchbox', { name: 'Im Handbuch suchen' }).fill('Post');
    await s.waitForTimeout(300);
    await pruefe(`Assistent ${r}`);
  }
}

rauchtest('Kopfzeile und Assistent: axe ohne Verstoß, hell und dunkel (#1218, #1219)', { als: LENA }, async (s) => {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    await kopfUndAssistent(s, async (name) => { for (const v of await axePruefen(s, KOPF_BEREICHE)) funde.push(`${name} (${schema}): ${v}`); });
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Kopfzeile und Assistent mit 44-px-Tippflächen (#1218, #1219)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  await kopfUndAssistent(s, async (name) => { for (const v of await tippflaechenPruefen(s, KOPF_BEREICHE)) funde.push(`${name}: ${v}`); });
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

rauchtest('Ablage aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1211, #1212)', { als: LENA }, async (s) => {
  const seiten = await ablageSeiten(await sitzung(LENA));
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of seiten) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, ABLAGE_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Ablage aus Bausteinen mit 44-px-Tippflächen (#1211, #1212)', { handy: true, als: LENA }, async (s) => {
  const seiten = await ablageSeiten(await sitzung(LENA));
  const funde = [];
  for (const seite of seiten) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, ABLAGE_BEREICHE)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

/* ---------- Werkbank aus Bausteinen: axe und Tippflächen (#1214) ---------- */


/**
 * Seiten der Werkbank, die #1214 auf Bausteine umgestellt hat: Pakete, Benutzer und Sicherheit, Post und Eingänge,
 * Daten sichern, Betrieb. Je Seite ein Name, der Weg und worauf gewartet wird.
 */
async function werkbankSeiten(s) {
  // Im Verwaltungsmodus über die Seite selbst (die Sitzung des Browsers darf die Werkbank lesen).
  const lena = (await s.evaluate(async () => (await fetch('/api/benutzer', { headers: { 'x-dms': '1' } })).json())).find((b) => b.email === 'lena@example.org');
  const seite = (name, weg, warte) => ({ name, weg: async (p) => {
    await p.goto(BASIS + weg);
    await (warte ? warte(p) : p.locator('.spalte.liste:visible, .spalte.mappe:visible').first().waitFor());
  } });
  return [
    seite('Pakete', '/werkbank/pakete'),
    seite('Paket erstellen', '/werkbank/pakete/erstellen'),
    seite('Benutzer', `/werkbank/benutzer/${lena.id}`, (s) => s.locator('[data-sprungleiste]').waitFor()),
    seite('Neuer Benutzer', '/werkbank/benutzer/neu'),
    seite('Verschlüsselung', '/werkbank/verschluesselung', (s) => s.locator('#notfallkontakte').waitFor()),
    seite('Auskünfte', '/werkbank/auskuenfte'),
    seite('Löschkonzept', '/werkbank/loeschkonzept'),
    seite('Postfach neu', '/werkbank/postfaecher/neu', (s) => s.locator('[data-sprungleiste]').waitFor()),
    seite('Eingangsordner', '/werkbank/eingangsordner'),
    seite('WebDAV', '/werkbank/webdav'),
    seite('Texterkennung', '/werkbank/texterkennung', (s) => s.getByRole('tablist').first().waitFor()),
    seite('Sicherung', '/werkbank/sicherung'),
    seite('Vollexport', '/werkbank/vollexport'),
    seite('Betrieb', '/werkbank/betrieb'),
    seite('Region', '/werkbank/region'),
    seite('Sprachen', '/werkbank/sprachen'),
    seite('Aufgaben', '/werkbank/aufgaben', (s) => s.locator('[data-anker="werkbank.aufgaben.suche"]').waitFor()),
    seite('Anmeldeschutz', '/werkbank/anmeldeschutz'),
    seite('Systemzustand', '/werkbank/systemzustand'),
    seite('Protokoll', '/werkbank/protokoll'),
    seite('Fehlermeldungen', '/werkbank/fehlermeldungen', (s) => s.getByRole('searchbox').first().waitFor()),
    seite('Wartung', '/werkbank/wartung'),
    seite('Demo-Daten', '/werkbank/demo'),
  ];
}

// Wiederherstellen (Abschnitt der Sicherung) antwortet außerhalb des Wartungsmodus mit 409 – das ist gewollt.
const WERKBANK_ERWARTET = [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }];

rauchtest('Werkbank aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1214)', { als: LENA, erwartet: WERKBANK_ERWARTET }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const seiten = await werkbankSeiten(s);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of seiten) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

// Am Handy in fünf Teilen: Die Messung jedes Bedienelements braucht Zeit (Grenze je Rauchtest 120 s).
for (const teil of [0, 1, 2, 3, 4]) {
  rauchtest(`Handy: Werkbank aus Bausteinen mit 44-px-Tippflächen, Teil ${teil + 1} (#1214)`, { handy: true, als: LENA, erwartet: WERKBANK_ERWARTET }, async (s) => {
    await s.goto(BASIS + '/ablage/start');
    await verwalten(s);
    const alle = await werkbankSeiten(s);
    const seiten = alle.filter((_, i) => i % 5 === teil);
    const funde = [];
    for (const seite of seiten) {
      const beginn = Date.now();
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name}: ${v}`);
      // Dauer je Seite im Protokoll, damit eine langsame Seite in der CI sofort auffällt.
      console.log(`# Werkbank Handy ${seite.name}: ${Math.round((Date.now() - beginn) / 1000)} s`);
    }
    assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
  });
}

/* ---------- Werkbank „Ablage aufbauen“ aus Bausteinen: axe (#1213) ---------- */

rauchtest('Werkbank „Ablage aufbauen“ aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1213)', { als: LENA }, async (s) => {
  const typ = daten.bausteine;
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  const seiten = ['/werkbank', '/werkbank/ansicht', `/werkbank/typen/${typ.id}`, '/werkbank/sichten/neu', '/werkbank/automatisierungen/ziele',
    '/werkbank/nummernkreise/archivnummer', '/werkbank/stempel/neu', '/werkbank/designs/neu', '/werkbank/woerter/neu', '/werkbank/organisation'];
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const weg of seiten) {
      await s.goto(BASIS + weg);
      await s.waitForLoadState('networkidle');
      // Editoren mit Bereichen (#1000): alles aufklappen, damit axe auch die Felder darin sieht.
      const alle = s.locator('[data-sprungleiste]').getByRole('button', { name: 'Alle aufklappen' });
      if (await alle.count() && await alle.isVisible()) await alle.click();
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${weg} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

/* ---------- Mein Konto, Entdecken und Systemseiten aus Bausteinen: axe und Tippflächen (#1215) ---------- */

/** Inhalt der Seite und das Benutzermenü – ohne die Kopfzeile selbst (#1218, #1219 bauen sie neu). */
const KONTO_BEREICHE = ['main.rumpf', '.benutzermenue .menue'];

/** Seiten, die #1215 auf Bausteine umgestellt hat: je Name, Weg, worauf gewartet wird und welcher Bereich zählt. */
function kontoSeiten() {
  const seite = (name, weg, warte, bereich = KONTO_BEREICHE) => ({ name, bereich, weg: async (p) => { await p.goto(BASIS + weg); await warte(p); } });
  return [
    seite('Konto', '/profil/konto', (p) => p.getByRole('heading', { name: /^Meine Rechte/ }).waitFor()),
    seite('Sicherheit', '/profil/sicherheit', (p) => p.locator('.sitzungsliste').first().waitFor()),
    seite('Darstellung', '/profil/darstellung', (p) => p.getByRole('radiogroup', { name: 'Schriftgröße' }).waitFor()),
    seite('Benachrichtigungen', '/profil/benachrichtigungen', (p) => p.getByRole('switch').first().waitFor()),
    seite('Abwesenheit', '/profil/abwesenheit', (p) => p.getByRole('switch', { name: 'Abwesend' }).waitFor()),
    seite('Fehler melden', '/profil/fehler-melden', (p) => p.getByLabel('Was ist passiert?').waitFor()),
    seite('Ablago entdecken', '/entdecken', (p) => p.getByRole('region', { name: 'Tipps' }).getByRole('link').first().waitFor()),
    seite('Benutzermenü', '/profil/konto', async (p) => { await p.locator('.benutzermenue .wer').click(); await p.locator('.benutzermenue .menue').waitFor(); }, ['.benutzermenue .menue']),
    seite('Notfallzugang', '/notfall', (p) => p.getByRole('heading', { level: 1 }).waitFor(), ['main.kartenseite']),
  ];
}

rauchtest('Mein Konto und Systemseiten aus Bausteinen: axe ohne Verstoß, hell und dunkel (#1215)', { als: LENA }, async (s) => {
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of kontoSeiten()) {
      await seite.weg(s);
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, seite.bereich)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Mein Konto und Systemseiten aus Bausteinen mit 44-px-Tippflächen (#1215)', { handy: true, als: LENA }, async (s) => {
  const funde = [];
  for (const seite of kontoSeiten()) {
    await seite.weg(s);
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, seite.bereich)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
