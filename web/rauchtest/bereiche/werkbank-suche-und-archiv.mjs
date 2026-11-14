/**
 * Rauchtests: Suche in Werkbank-Listen (#978, #994), gleichbedeutende Wörter (#992), Suche und Volltext aufgeräumt (#1189,
 * #1190, #1191), Vorschaubild der Archivfassung (#1216).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/werkbank-suche-und-archiv.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import '../einrichtung.mjs';
import { api, BASIS, beispielPdf, daten, keineWaagerechteRolle, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';
import { axePruefen } from '../muster.mjs';

// #978: Suche über der Liste der Mappentypen wie in der Ablage – Fundstelle, Trefferzahl, Esc, keine Treffer, zurücksetzen.
rauchtest('Werkbank: Mappentypen und Ansichten durchsuchen, Fundstellen, keine Treffer (#978)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/typen');
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const suche = elemente.getByRole('searchbox', { name: 'Mappentypen durchsuchen' });
  await suche.fill('einzelpreis');
  // Gefunden im Feld der Auftragsposition (Teil von Auftrag, #1031) – mit Fundstelle unter dem Namen.
  const treffer = elemente.getByRole('link', { name: /^Auftragsposition/ });
  await treffer.waitFor();
  await treffer.getByText('Teil von Auftrag').waitFor();
  await treffer.locator('mark', { hasText: 'Einzelpreis' }).waitFor();
  await elemente.getByText('1 Treffer', { exact: true }).waitFor();
  assert.equal(await elemente.getByRole('link', { name: /^Vertrag \d+ Felder/ }).count(), 0, 'Vertrag passt nicht und steht nicht da');
  // Esc leert das Feld, die Liste ist wieder vollständig.
  await suche.press('Escape');
  assert.equal(await suche.inputValue(), '');
  await elemente.getByRole('link', { name: /^Vertrag \d+ Felder/ }).waitFor();
  await elemente.getByText(/^\d+ Mappentypen$/).waitFor();
  // Nichts gefunden: ruhiger Satz und der Weg zurück.
  await suche.fill('xylofonunterricht');
  await elemente.getByText('Keine Treffer.').waitFor();
  await elemente.getByRole('button', { name: 'Suche und Filter zurücksetzen' }).click();
  assert.equal(await suche.inputValue(), '');
  // „×“ leert ebenfalls; Ansichten haben dasselbe Feld.
  await suche.fill('vertrag');
  await elemente.getByRole('button', { name: 'Suche leeren' }).click();
  assert.equal(await suche.inputValue(), '');
  await s.goto(BASIS + '/werkbank/sichten');
  await elemente.getByRole('searchbox', { name: 'Ansichten durchsuchen' }).fill('xylofonunterricht');
  await elemente.getByText('Keine Treffer.').waitFor();
});

// #994: Auskünfte – Haken „Nur offene zeigen“ statt „offen · alle“, die Vorgaben rechts statt „Einstellungen“ in der Liste;
// gemeldete Fehler mit Suchfeld und „Erledigte zeigen“ darunter.
rauchtest('Werkbank: Auskünfte und gemeldete Fehler – Suchfeld oben, Filter darunter (#994, #1183)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/auskuenfte');
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await elemente.getByRole('searchbox', { name: 'Auskünfte durchsuchen' }).waitFor();
  const offene = elemente.getByRole('checkbox', { name: 'Nur offene zeigen' });
  assert.equal(await offene.isChecked(), true, 'Vorgabe: nur offene');
  assert.equal(await elemente.getByRole('link', { name: 'Einstellungen' }).count(), 0, 'kein Link „Einstellungen“ mehr in der Liste');
  // Die Vorgaben selbst stehen seit #1183 auf „Eigene Organisation“; rechts nur der Weg dorthin.
  await bearbeitung.getByRole('heading', { name: 'Vorgaben für jede Auskunft' }).waitFor();
  await bearbeitung.getByRole('link', { name: 'Vorgaben öffnen' }).waitFor();
  await offene.uncheck();
  await elemente.getByText('Noch keine Auskunft.').waitFor();
  // Der Assistent verweist auf die Vorgaben (am Handy der Weg dorthin).
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await bearbeitung.getByRole('link', { name: 'Vorgaben für jede Auskunft' }).click();
  await s.waitForURL(/\/werkbank\/organisation#auskunft-vorgaben$/);
  await bearbeitung.getByRole('heading', { name: 'Datenschutz-Auskünfte', level: 2 }).waitFor();
  // Gemeldete Fehler.
  await s.goto(BASIS + '/werkbank/fehlermeldungen');
  await elemente.getByRole('searchbox', { name: 'Gemeldete Fehler durchsuchen' }).waitFor();
  await elemente.getByRole('checkbox', { name: 'Erledigte zeigen' }).check();
  await elemente.getByText('Noch keine Meldungen.').waitFor();
});

rauchtest('Handy: Mappentypen durchsuchen (#978)', { handy: true, als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/typen');
  const suche = s.getByRole('searchbox', { name: 'Mappentypen durchsuchen' });
  await suche.fill('einzelpreis');
  await s.getByRole('link', { name: /^Auftragsposition/ }).waitFor();
  await keineWaagerechteRolle(s);
});

// #992: Gleichbedeutende Wörter als eigener Bereich – anlegen mit „+ Neu“, Prüfung (doppelt), Reihenfolge, Suche über
// jedes Wort, Hinweis auf eine andere Gruppe mit Link, Entfernen mit Rückfrage; „Suche und Volltext“ verweist hierher.
rauchtest('Werkbank: Gleichbedeutende Wörter – Liste mit Suche, Wörter einzeln bearbeiten (#992)', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/texterkennung');
  await s.getByRole('link', { name: 'Gleichbedeutende Wörter' }).last().click();
  await s.waitForURL(/\/werkbank\/woerter$/);
  const elemente = s.getByRole('region', { name: 'Elemente' });
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/neu$/);
  await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).fill('Beleg');
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('beleg');
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await bearbeitung.getByText('Steht schon weiter oben.').waitFor();
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('Rechnung');
  await bearbeitung.getByRole('button', { name: '+ Wort' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Wort 3' }).fill('Faktura');
  // Reihenfolge: „Rechnung“ nach oben – unter dem ersten Wort steht die Gruppe in der Liste.
  await bearbeitung.getByRole('button', { name: '„Rechnung“ nach oben' }).click();
  assert.equal(await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).inputValue(), 'Rechnung');
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/[0-9a-f-]{36}$/);
  await bearbeitung.getByRole('heading', { name: 'Rechnung', level: 1 }).waitFor();
  // Zweite Gruppe mit „Beleg“: Hinweis mit Link auf die erste.
  await elemente.getByRole('link', { name: '+ Neu' }).click();
  await bearbeitung.getByRole('textbox', { name: 'Wort 1' }).fill('Quittung');
  await bearbeitung.getByRole('textbox', { name: 'Wort 2' }).fill('Beleg');
  await bearbeitung.getByText('Steht auch in:').getByRole('link', { name: 'Rechnung' }).waitFor();
  await bearbeitung.getByRole('button', { name: 'Gruppe anlegen' }).click();
  await s.waitForURL(/\/werkbank\/woerter\/[0-9a-f-]{36}$/);
  // Suche findet jedes Wort, nicht nur das erste.
  const suche = elemente.getByRole('searchbox', { name: 'Gleichbedeutende Wörter durchsuchen' });
  await suche.fill('faktura');
  await elemente.getByText('1 Treffer', { exact: true }).waitFor();
  await elemente.locator('mark', { hasText: 'Faktura' }).waitFor();
  await suche.fill('beleg');
  await elemente.getByText('2 Treffer', { exact: true }).waitFor();
  // Entfernen mit Rückfrage.
  await elemente.getByRole('link', { name: /^Quittung/ }).click();
  await bearbeitung.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await s.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
  await s.waitForURL(/\/werkbank\/woerter$/);
  await suche.fill('');
  await elemente.getByText('1 Gruppe', { exact: true }).waitFor();
});

/* ---------- Suche und Volltext aufgeräumt (#1189, #1190) ---------- */

/** Antworten der Werkbank so umschreiben, als fehle Poppler (#1189) – im Image ist es immer da. */
async function ohnePoppler(s) {
  const zaehler = { neu: 0 };
  for (const muster of [/\/api\/werkbank\/texterkennung(\?.*)?$/, /\/api\/werkbank\/system(\?.*)?$/]) {
    await s.route(muster, async (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      if (new URL(r.request().url()).searchParams.has('neu')) zaehler.neu++;
      const echt = await (await r.fetch()).json();
      await r.fulfill({ json: { ...echt, werkzeuge: { pdftotext: false, pdftoppm: true, qpdf: true } } });
    });
  }
  return zaehler;
}

// #1189: Sind alle eingebauten Werkzeuge da, steht dazu nichts auf „Suche und Volltext“ – nur eine Zeile unter
// Installiert. Fehlt eins, steht oben ein Hinweis mit Folge, Abhilfe, „Erneut prüfen“ und „Mehr dazu“, auch im Systemzustand.
rauchtest('Werkbank: eingebaute Werkzeuge nur, wenn eins fehlt (#1189)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/texterkennung');
  await s.getByRole('heading', { name: 'Warteschlange', exact: true }).waitFor();
  assert.equal(await s.getByRole('heading', { name: 'Werkzeuge', exact: true }).count(), 0, 'kein Abschnitt „Werkzeuge“');
  assert.equal(await s.locator('#werkzeuge').count(), 0, 'kein Hinweis, wenn alles da ist');
  assert.equal(await s.getByText(/poppler/i).count(), 0, 'Poppler steht nirgends');
  await s.goto(BASIS + '/werkbank/systemzustand#version');
  const installiert = s.locator('#installiert');
  await installiert.getByText('Eingebaute Werkzeuge', { exact: true }).waitFor();
  await installiert.locator('dt', { hasText: 'PDF lesen (Poppler)' }).waitFor();
  assert.equal(await s.locator('#werkzeuge').count(), 0);

  const zaehler = await ohnePoppler(s);
  for (const [weg, warte] of [['/werkbank/texterkennung', 'Warteschlange'], ['/werkbank/systemzustand', 'Schwellen für den Speicherplatz']]) {
    await s.goto(BASIS + weg);
    await s.getByRole('heading', { name: warte }).first().waitFor();
    const hinweis = s.locator('#werkzeuge');
    await hinweis.getByText('Ein Werkzeug zum Lesen von PDFs fehlt.').waitFor();
    await hinweis.getByText(/keinen Text aus PDFs lesen und keine Seitenbilder zeigen/).waitFor();
    await hinweis.getByText(/offizielle Ablago-Image bringt es mit/).waitFor();
    await hinweis.getByText('Für Fachleute: Es fehlt pdftotext (Poppler).').waitFor();
    const mehr = hinweis.getByRole('link', { name: 'Mehr dazu' });
    assert.match(await mehr.getAttribute('href'), /\/hilfe\/admin\/.*fehlersuche\/#werkzeuge$/);
    const vorher = zaehler.neu;
    await hinweis.getByRole('button', { name: 'Erneut prüfen' }).click();
    await hinweis.getByText('Geprüft.').waitFor();
    assert.equal(zaehler.neu, vorher + 1, '„Erneut prüfen“ prüft auf dem Server neu');
  }
  await s.locator('#installiert dt', { hasText: 'PDF lesen (Poppler)' }).locator('xpath=following-sibling::dd[1]').getByText('fehlt', { exact: true }).waitFor();
  // Der Hinweis selbst: axe hell und dunkel.
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const v of await axePruefen(s, ['#werkzeuge'])) funde.push(`${schema}: ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

/* ---------- Vorschaubild aus der Archivfassung (#1216) ---------- */

/** Eine kleine E-Mail (nur Persona-Adressen), wie sie ein Postfach oder Hochladen ablegt. */
const BEISPIEL_EML = Buffer.from([
  'From: Lena Beispiel <lena@example.org>', 'To: Jonas Beispiel <jonas@example.org>', 'Subject: Termin Heizungswartung',
  'Date: Mon, 15 Nov 2027 09:30:00 +0100', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '',
  'Hallo Jonas, der Termin für die Heizungswartung ist am Donnerstag um 10 Uhr.', '',
].join('\r\n'));

/**
 * Archivfassung einer Datei so ablegen, wie das Paket für PDF/A sie hinterlässt (#631) – im Rauchtest gibt es keins:
 * erst der Stand „wartet“ (archivfassungen/<ab>/<Prüfwert>.stand), dann die Fassung (.fassung und .json, Stand weg).
 */
async function archivOrdner(sha) {
  const dateien = join(process.env.DMS_DATENWURZEL ?? join(import.meta.dirname, '../../data'), 'files');
  for (const haushalt of await readdir(dateien)) {
    const ablage = join(dateien, haushalt);
    if (!(await stat(join(ablage, sha.slice(0, 2), sha)).then(() => true, () => false))) continue;
    const ordner = join(ablage, 'archivfassungen', sha.slice(0, 2));
    await mkdir(ordner, { recursive: true });
    return ordner;
  }
  throw new Error(`Datei ${sha} nicht im Ordner ${dateien} gefunden.`);
}
const PDFA_PAKET = { id: 'pdfa', name: 'PDF/A', version: '1.0.0' };
async function archivfassungWartet(sha) {
  await writeFile(join(await archivOrdner(sha), `${sha}.stand`), JSON.stringify({ stand: 'wartet', info: null, paket: PDFA_PAKET, zeit: new Date().toISOString() }));
}
async function archivfassungAblegen(sha, pdf) {
  const ordner = await archivOrdner(sha);
  await writeFile(join(ordner, `${sha}.fassung`), pdf);
  await writeFile(join(ordner, `${sha}.json`), JSON.stringify({ mime: 'application/pdf', groesse: pdf.length, sha256: createHash('sha256').update(pdf).digest('hex'), seiten: 1,
    pdfa: { teil: 2, stufe: 'B' }, paket: PDFA_PAKET, erstellt: new Date().toISOString() }));
  await rm(join(ordner, `${sha}.stand`), { force: true });
}

rauchtest('Dokumentliste: E-Mail mit fertiger Archivfassung zeigt ihr Vorschaubild, ohne nur „EML“ (#1216)', {
  als: LENA,
  // Beim ersten Abruf gibt es das Bild noch nicht (404) – es entsteht im Hintergrund, die Liste fragt kurz darauf noch einmal.
  erwartet: [{ status: 404, pfad: /^\/api\/dokumente\/[^/]+\/vorschau$/ }],
}, async (s) => {
  const cookie = await sitzung(LENA);
  // Eine eigene Mappe im Mappentyp aus den Daten (beendet: ändert nichts an „Ist der Stichtag leer“).
  const { typ } = daten.archiv;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Heizungsraum Hofweg', beendet: '2027-01-31' } } })).daten;
  const mail = (await api('POST', `/api/mappen/${mappe.id}/dokumente?register=dokumente&name=${encodeURIComponent('Termin Heizungswartung.eml')}&typ=message/rfc822`, { cookie, body: BEISPIEL_EML, roh: true })).daten.dokument;
  // Archivfassung wird noch erstellt: das Kästchen mit der Endung.
  await archivfassungWartet(mail.sha256);
  await s.goto(BASIS + `/ablage/${typ.id}/${mappe.id}`);
  await s.getByRole('region', { name: 'Mappe' }).getByRole('tab', { name: 'Dokumente 1' }).click();
  const liste = s.locator('.dokzeile').filter({ hasText: 'Termin Heizungswartung.eml' });
  await liste.locator('.vorschaubild.ohne', { hasText: 'EML' }).waitFor();
  // Archivfassung fertig: Ohne die Mappe neu zu laden, kommt das Bild aus ihrer ersten Seite – gekennzeichnet.
  await archivfassungAblegen(mail.sha256, beispielPdf('Von: Lena Beispiel\nBetreff: Termin Heizungswartung'));
  const bild = liste.locator('img.vorschaubild');
  await bild.waitFor({ timeout: 45_000 });
  assert.equal(await bild.getAttribute('title'), 'Vorschau aus der umgewandelten Fassung eines Pakets');
  await s.waitForFunction((el) => el.complete && el.naturalWidth > 0, await bild.elementHandle(), { timeout: 20_000 });
  assert.equal(await liste.locator('.vorschaubild.ohne').count(), 0);
});
