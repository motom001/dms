/**
 * Rauchtests: Listenansicht nach der Vorgabe aus #1212 (#1285: „⋯“ im Kopf, Anzahl mit Typ, Auswahlleiste statt der
 * Zeile mit der Anzahl, Spalte „Mappentyp“ nur bei verschiedenen Typen) und ruhige Verweisfelder (#1288: Anlegen in der
 * Vorschlagsliste, ✕ statt „Ändern“/„Entfernen“, kein Chip „Bezug“). Nachträge vom 18.11.: „Mappentyp bearbeiten“ in der
 * Liste eines Mappentyps, kein Kennzeichen „Systemrolle“ an Mappen in der Ablage.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/liste-und-verweise.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import {
  ABLAGE_BEREICHE,
  api,
  BASIS,
  JONAS,
  keineWaagerechteRolle,
  LENA,
  rauchtest,
  schemaWechseln,
  sitzung,
  verwalten,
} from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- #1285: Listenansicht ---------- */

/**
 * Eigene Typen und eine Ansicht über beide (im Verwaltungsmodus angelegt): zwei Gartengeräte, noch kein Gartenhaus.
 * So enthält die Ansicht zunächst nur einen Mappentyp, obwohl sie zwei zeigen darf.
 */
async function listenDaten() {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const typ = async (name, schluessel) =>
    (
      await api('POST', '/api/typen', {
        cookie: verwaltung,
        body: { name, schluessel, titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] },
      })
    ).daten;
  const geraet = await typ('Gartengerät', 'rauchtest_gartengeraet');
  const haus = await typ('Gartenhaus', 'rauchtest_gartenhaus');
  for (const name of ['Rasenmäher', 'Heckenschere'])
    await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: geraet.id, werte: { name } } });
  const sicht = (
    await api('POST', '/api/sichten/definitionen', { cookie: verwaltung, body: { name: 'Rauchtest Garten', typen: [geraet.id, haus.id] } })
  ).daten;
  return { verwaltung, geraet, haus, sicht };
}

rauchtest('Listenansicht: „⋯“ im Kopf, Anzahl mit Typ, Auswahlleiste, Spalte „Mappentyp“ (#1285)', { als: LENA }, async (s) => {
  const { verwaltung, geraet, haus, sicht } = await listenDaten();
  const liste = s.getByRole('region', { name: 'Mappen' });
  // Liste eines Mappentyps: „2 × Gartengerät“ statt „2 Mappen“.
  await s.goto(BASIS + `/ablage/${geraet.id}`);
  await liste.getByText('2 × Gartengerät', { exact: true }).waitFor();
  // Gemischte Ansicht mit nur einem Typ darin: Anzahl mit Typ, keine Spalte bzw. Zeile mit dem Typ.
  await s.goto(BASIS + `/ablage/${sicht.id}`);
  await liste.getByText('2 × Gartengerät', { exact: true }).waitFor();
  assert.equal(await liste.getByRole('columnheader', { name: 'Mappentyp' }).count(), 0, 'Spalte „Mappentyp“ bei einem Typ');
  assert.equal(await liste.locator('.unter', { hasText: /^Gartengerät$/ }).count(), 0, 'Typ unter dem Titel bei einem Typ');
  // „⋯“: Alle exportieren (ohne Auswahl) und „Ansicht bearbeiten“ (Lena ist Admin).
  const mehr = liste.getByRole('button', { name: 'Weitere Aktionen: Rauchtest Garten' });
  await mehr.click();
  await s.getByRole('menuitem', { name: 'Alle 2 exportieren …' }).click();
  const dialog = s.getByRole('dialog', { name: 'Exportieren' });
  await dialog.getByRole('button', { name: '2 Mappen exportieren' }).waitFor();
  assert.equal(await dialog.getByText('Welche Mappen?').count(), 0, 'Export aller Treffer fragt nicht nach der Auswahl');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  // Auswahl: Die Leiste steht an der Stelle der Anzahl, nicht zusätzlich darunter.
  await liste.getByRole('checkbox', { name: 'Rasenmäher auswählen' }).check();
  const leiste = liste.getByRole('region', { name: 'Auswahl' });
  await leiste.getByText('1 von 2 ausgewählt').waitFor();
  assert.equal(await liste.getByText('2 × Gartengerät', { exact: true }).count(), 0, 'Anzahl neben der Auswahlleiste');
  await leiste.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await liste.getByText('2 × Gartengerät', { exact: true }).waitFor();
  // Ein Gartenhaus dazu: jetzt gemischt – „3 Mappen“ und der Typ je Zeile (Spalte oder klein unter dem Titel).
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: haus.id, werte: { name: 'Geräteschuppen' } } });
  await s.reload();
  await liste.getByText('3 Mappen', { exact: true }).waitFor();
  await liste
    .getByRole('columnheader', { name: 'Mappentyp' })
    .or(liste.locator('.unter', { hasText: /^Gartenhaus$/ }))
    .first()
    .waitFor();
  await keineWaagerechteRolle(s);
  // „Ansicht bearbeiten“ führt in die Werkbank.
  await mehr.click();
  await s.getByRole('menuitem', { name: 'Ansicht bearbeiten' }).click();
  await s.waitForURL(new RegExp(`/werkbank/sichten/${sicht.id}$`));
});

// Nachtrag 18.11. zu #1285: In der Liste eines Mappentyps ohne eigene Ansicht heißt der Eintrag „Mappentyp bearbeiten“
// und führt zum Mappentyp in der Werkbank.
rauchtest('Listenansicht: „Mappentyp bearbeiten“ in der Liste eines Mappentyps (Nachtrag zu #1285)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const typ = (
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Rauchtest-Fahrrad',
        schluessel: 'rauchtest_fahrrad',
        titelVorlage: '{name}',
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: typ.id, werte: { name: 'Lastenrad' } } });
  // Ohne eigene Ansicht: Die Ansicht des Mappentyps (gleiche Id) entfernen – die Liste heißt dann „Alle Mappen: …“ (#888).
  await api('DELETE', `/api/sichten/definitionen/${typ.id}`, { cookie: verwaltung });
  const liste = s.getByRole('region', { name: 'Mappen' });
  await s.goto(BASIS + `/ablage/${typ.id}`);
  await liste.getByRole('heading', { name: /^Alle Mappen: Rauchtest-Fahrrad/, level: 1 }).waitFor();
  await liste.getByText('1 Rauchtest-Fahrrad', { exact: true }).waitFor();
  await liste.getByRole('button', { name: /^Weitere Aktionen/ }).click();
  const eintrag = s.getByRole('menuitem', { name: 'Mappentyp bearbeiten' });
  await eintrag.waitFor();
  assert.equal(await s.getByRole('menuitem', { name: 'Ansicht bearbeiten' }).count(), 0, '„Ansicht bearbeiten“ ohne Ansicht');
  await eintrag.click();
  await s.waitForURL(new RegExp(`/werkbank/typen/${typ.id}$`));
});

// Mehrzahl (#1446): in der Werkbank eintragen – danach „2 Rauchtest-Leitern“ statt
// „2 × Rauchtest-Leiter“; eine Mappe bleibt „1 Rauchtest-Leiter“.
rauchtest('Mappentyp: Mehrzahl in der Werkbank, Liste zeigt „2 Rauchtest-Leitern“ (#1446)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const typ = (
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Rauchtest-Leiter',
        schluessel: 'rauchtest_leiter',
        titelVorlage: '{name}',
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  const leiter = (await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: typ.id, werte: { name: 'Stehleiter' } } })).daten;
  const liste = s.getByRole('region', { name: 'Mappen' });
  await s.goto(BASIS + `/ablage/${typ.id}`);
  await liste.getByText('1 Rauchtest-Leiter', { exact: true }).waitFor();
  await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: typ.id, werte: { name: 'Anlegeleiter' } } });
  await s.reload();
  await liste.getByText('2 × Rauchtest-Leiter', { exact: true }).waitFor();
  // Werkbank → Mappentyp → Grunddaten: Mehrzahl eintragen und speichern.
  await verwalten(s);
  await s.goto(BASIS + `/werkbank/typen/${typ.id}#grunddaten`);
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('heading', { name: 'Rauchtest-Leiter', level: 1 }).waitFor();
  const mehrzahl = bearbeitung.getByRole('textbox', { name: /^Mehrzahl/ });
  await mehrzahl.fill('Rauchtest-Leitern');
  const pfad = (r) => new URL(r.url()).pathname;
  const gespeichert = s.waitForResponse((r) => r.request().method() === 'PUT' && /^\/api\/typen\//.test(pfad(r)));
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern' }).click();
  await gespeichert;
  await bearbeitung.getByText('Mappentyp gespeichert.').waitFor();
  await bearbeitung.getByRole('button', { name: 'Mappentyp speichern', disabled: true }).waitFor();
  const gelesen = (await api('GET', '/api/typen', { cookie: verwaltung })).daten.find((x) => x.id === typ.id);
  assert.equal(gelesen.mehrzahl, 'Rauchtest-Leitern');
  await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
  await s.goto(BASIS + `/ablage/${typ.id}`);
  await liste.getByText('2 Rauchtest-Leitern', { exact: true }).waitFor();
  // Eine Mappe: Einzahl.
  await api('DELETE', `/api/mappen/${leiter.id}?grund=nicht_noetig`, { cookie: verwaltung });
  await s.reload();
  await liste.getByText('1 Rauchtest-Leiter', { exact: true }).waitFor();
});

// Export aller Treffer (#1335): Die Treffer kommen nur als Ids, die Mappen lädt der Export einmal – in der Datei steht
// jede Mappe der Liste genau einmal, in der Reihenfolge der Liste.
rauchtest('Listenansicht: „Alle exportieren“ als CSV, jede Mappe genau einmal (#1335)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const typ = (
    await api('POST', '/api/typen', {
      cookie: verwaltung,
      body: {
        name: 'Rauchtest-Werkzeug',
        schluessel: 'rauchtest_werkzeug',
        titelVorlage: '{name}',
        felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }],
      },
    })
  ).daten;
  const namen = ['Bohrmaschine', 'Akkuschrauber', 'Stichsäge'];
  for (const name of namen) await api('POST', '/api/mappen', { cookie: verwaltung, body: { typId: typ.id, werte: { name } } });
  const liste = s.getByRole('region', { name: 'Mappen' });
  await s.goto(BASIS + `/ablage/${typ.id}`);
  await liste.getByText('3 × Rauchtest-Werkzeug', { exact: true }).waitFor();
  await liste.getByRole('button', { name: /^Weitere Aktionen/ }).click();
  await s.getByRole('menuitem', { name: 'Alle 3 exportieren …' }).click();
  const dialog = s.getByRole('dialog', { name: 'Exportieren' });
  await dialog.getByRole('radio', { name: /^CSV/ }).check();
  const [download] = await Promise.all([s.waitForEvent('download'), dialog.getByRole('button', { name: '3 Mappen exportieren' }).click()]);
  const text = await new Response(await download.createReadStream()).text();
  const zeilen = text.split(/\r?\n/).filter((z) => namen.some((n) => z.includes(n)));
  assert.deepEqual(
    zeilen.map((z) => namen.find((n) => z.includes(n))),
    [...namen].sort((a, b) => a.localeCompare(b, 'de')),
    'jede Mappe einmal, nach Titel sortiert',
  );
});

rauchtest('Listenansicht: „Ansicht bearbeiten“ nur mit Recht in der Werkbank (#1285)', { als: JONAS }, async (s) => {
  const cookie = await sitzung(JONAS);
  // Ohne den ersten Rundgang – er läge beim Alleinstart über der Liste (werkbank.mjs prüft ihn).
  await api('POST', '/api/entdecken/rundgaenge/ablago', { cookie, body: { stand: 'gesehen' } });
  const typen = (await api('GET', '/api/typen', { cookie })).daten;
  const vertrag = typen.find((x) => x.name === 'Vertrag');
  await s.goto(BASIS + `/ablage/${vertrag.id}`);
  const liste = s.getByRole('region', { name: 'Mappen' });
  // Der Beispiel-Mappentyp „Vertrag“ hat seine Mehrzahl (#1446).
  await liste.getByText(/^\d+ Verträge$/).waitFor();
  const mehr = liste.getByRole('button', { name: /^Weitere Aktionen: / });
  if (await mehr.count()) {
    await mehr.click();
    await s.getByRole('menuitem', { name: /^Alle \d+ exportieren …$/ }).waitFor();
    assert.equal(await s.getByRole('menuitem', { name: 'Ansicht bearbeiten' }).count(), 0, 'Jonas sieht „Ansicht bearbeiten“');
  }
  // Nachtrag zu #1285: ebenso kein „Mappentyp bearbeiten“ in der Liste eines Mappentyps ohne eigene Ansicht (den Typ legt
  // der Fall „Mappentyp bearbeiten“ oben an).
  const fahrrad = typen.find((x) => x.name === 'Rauchtest-Fahrrad');
  assert.ok(fahrrad, 'Mappentyp „Rauchtest-Fahrrad“ fehlt');
  await s.goto(BASIS + `/ablage/${fahrrad.id}`);
  await liste.getByRole('heading', { name: /^Alle Mappen: Rauchtest-Fahrrad/, level: 1 }).waitFor();
  await liste.getByText('1 Rauchtest-Fahrrad', { exact: true }).waitFor();
  if (await mehr.count()) {
    await mehr.click();
    await s.getByRole('menu').waitFor();
    assert.equal(await s.getByRole('menuitem', { name: 'Mappentyp bearbeiten' }).count(), 0, 'Jonas sieht „Mappentyp bearbeiten“');
  }
});

// Nachtrag 18.11. zu #1288: Mappen der Systemrollen tragen in der Ablage kein Kennzeichen „Systemrolle“ (setzt
// Werkbank-Wissen voraus); darunter steht je Rolle ein passender Hinweis.
rauchtest(
  'Mappen der Systemrollen: kein Kennzeichen „Systemrolle“, je Rolle ein passender Hinweis (Nachtrag zu #1288)',
  { als: LENA },
  async (s) => {
    const verwaltung = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
    const mitglied = (await api('GET', '/api/rollen', { cookie: verwaltung })).daten.find((r) => r.system && r.name === 'Mitglied');
    assert.ok(mitglied, 'Systemrolle „Mitglied“ fehlt');
    const rolle = (await api('GET', '/api/typen', { cookie: verwaltung })).daten.find((x) => x.system === 'rolle');
    await s.goto(BASIS + `/ablage/${rolle.id}/${mitglied.id}`);
    const kopf = s.locator('.mappenkopf');
    await kopf.getByText('Die Systemrolle „Mitglied“ hat jede Person.').waitFor();
    assert.equal(await kopf.getByText('Systemrolle', { exact: true }).count(), 0, 'Kennzeichen „Systemrolle“ in der Ablage');
    // Je Systemrolle ein eigener Satz: „Systemkonto“ und „Paket“ nennen nicht „Mitglied“.
    const alle = (
      await api('GET', `/api/mappen?${new URLSearchParams({ sicht: rolle.id, von: '0', anzahl: '50' })}`, { cookie: verwaltung })
    ).daten.mappen;
    for (const [kennung, satz] of [
      [
        'rolle:systemkonto',
        'Diese Rolle haben die Konten, unter denen Ablago selbst arbeitet, etwa für Automatisierungen. Eine Person bekommt sie nie.',
      ],
      ['rolle:paket', 'Diese Rolle haben die Dienstkonten der Pakete mit Code. Eine Person bekommt sie nie.'],
    ]) {
      const m = alle.find((x) => x.systemKennung === kennung);
      assert.ok(m, `Mappe der Systemrolle ${kennung} fehlt`);
      await s.goto(BASIS + `/ablage/${rolle.id}/${m.id}`);
      await kopf.getByText(satz).waitFor();
      assert.equal(await kopf.getByText(/„Mitglied“/).count(), 0, `${kennung} nennt „Mitglied“`);
    }
  },
);

/* ---------- #1288: Verweisfelder ---------- */

/** Neue Rechnung: das Feld „Aussteller“ (Vertragspartner, Titel aus einem Textfeld „Name“). */
async function neueRechnung(s) {
  const typen = (await api('GET', '/api/typen', { cookie: await sitzung(LENA) })).daten;
  await s.goto(BASIS + `/ablage/${typen.find((x) => x.name === 'Rechnung').id}/neu`);
  const feld = s.locator('[data-anker="mappe.feld:aussteller"]');
  await feld.getByRole('combobox').waitFor();
  return feld;
}

rauchtest('Verweisfeld: anlegen über die Liste, ✕ entfernt, neu wählen (#1288)', { als: LENA }, async (s) => {
  const feld = await neueRechnung(s);
  // Kein grüner Knopf unter dem Feld, kein Chip „Bezug“ im Kopf.
  assert.equal(await feld.locator('[data-knopf="anlegen"]').count(), 0, 'Grüner Knopf am Verweisfeld');
  assert.equal(await feld.getByText(/^(Bezug|Zugehörigkeit)$/).count(), 0, 'Chip „Bezug“ am Verweisfeld');
  // Mit Treffern: der letzte Eintrag ist „+ Vertragspartner „Stadt“ anlegen …“.
  const suche = feld.getByRole('combobox');
  await suche.fill('Stadt');
  await feld.getByRole('option', { name: 'Stadtwerke Musterstadt' }).waitFor();
  assert.equal(await feld.getByRole('option').last().textContent(), '+ Vertragspartner „Stadt“ anlegen …');
  // Ohne Treffer: leise „nicht gefunden“, darunter Anlegen; Pfeil runter und Enter öffnen das Fenster.
  await suche.fill('Rauchtest Neu GmbH');
  await feld.getByText('Vertragspartner „Rauchtest Neu GmbH“ nicht gefunden').waitFor();
  const anlegen = feld.getByRole('option', { name: '+ Vertragspartner „Rauchtest Neu GmbH“ anlegen …' });
  await anlegen.waitFor();
  await suche.press('ArrowDown');
  assert.equal(await anlegen.getAttribute('aria-selected'), 'true');
  assert.equal(await suche.getAttribute('aria-activedescendant'), await anlegen.getAttribute('id'));
  await suche.press('Enter');
  const fenster = s.getByRole('dialog', { name: 'Vertragspartner anlegen' });
  const name = fenster.getByRole('textbox', { name: 'Name', exact: true });
  await name.waitFor();
  assert.equal(await name.inputValue(), 'Rauchtest Neu GmbH', 'Das Getippte als Name vorbelegt');
  await fenster.getByRole('button', { name: 'Mappe speichern' }).click();
  await fenster.waitFor({ state: 'detached' });
  // Gesetzt: Link und ✕, kein „Ändern“; danach steht der Fokus auf dem Link.
  const link = feld.getByRole('link', { name: 'Rauchtest Neu GmbH' });
  await link.waitFor();
  await s.waitForFunction(() => document.activeElement?.closest('[data-anker="mappe.feld:aussteller"]')?.contains(document.activeElement));
  assert.equal(await feld.getByRole('button', { name: 'Ändern' }).count(), 0, '„Ändern“ am Verweis');
  // ✕ entfernt; der Fokus springt ins leere Suchfeld, die Liste bleibt zu.
  await feld.getByRole('button', { name: 'Aussteller entfernen' }).click();
  await s.waitForFunction(() => document.activeElement?.matches('[data-anker="mappe.feld:aussteller"] [role="combobox"]'));
  assert.equal(await suche.inputValue(), '');
  assert.equal(await suche.getAttribute('aria-expanded'), 'false');
  // Neu wählen.
  await suche.fill('Stadtwerke');
  await feld.getByRole('option', { name: 'Stadtwerke Musterstadt' }).click();
  await feld.getByRole('link', { name: 'Stadtwerke Musterstadt' }).waitFor();
});

rauchtest('Verweisfeld: axe mit offener Liste, hell und dunkel (#1288)', { als: LENA }, async (s) => {
  const feld = await neueRechnung(s);
  await feld.getByRole('combobox').fill('Rauchtest gibt es nicht');
  await feld.getByRole('option', { name: /^\+ Vertragspartner/ }).waitFor();
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ABLAGE_BEREICHE)) funde.push(`${schema}: ${v}`);
  }
  await schemaWechseln(s, 'light');
  assert.deepEqual(funde, [], 'axe meldet Verstöße am Verweisfeld');
});

/** Nur das Verweisfeld samt Vorschlagsliste: Was daneben liegt, hängt vom Zustand früherer Bereiche ab. */
const FELD = '[data-anker="mappe.feld:aussteller"]';

rauchtest('Handy: Verweisfeld mit offener Liste und ✕ (#1288)', { handy: true, als: LENA }, async (s) => {
  const feld = await neueRechnung(s);
  await feld.getByRole('combobox').fill('Stadt');
  await feld.getByRole('option', { name: 'Stadtwerke Musterstadt' }).waitFor();
  const funde = (await axePruefen(s, [FELD])).map((v) => `offen: ${v}`);
  assert.deepEqual(await tippflaechenPruefen(s, [FELD]), [], 'Zu kleine Tippflächen (Liste)');
  await feld.getByRole('option', { name: 'Stadtwerke Musterstadt' }).click();
  await feld.getByRole('button', { name: 'Aussteller entfernen' }).waitFor();
  assert.deepEqual(await tippflaechenPruefen(s, [FELD]), [], 'Zu kleine Tippflächen (gesetzt)');
  for (const v of await axePruefen(s, [FELD])) funde.push(`gesetzt: ${v}`);
  assert.deepEqual(funde, [], 'axe meldet Verstöße am Verweisfeld (Handy)');
  await keineWaagerechteRolle(s);
});
