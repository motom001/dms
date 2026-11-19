/**
 * Rauchtests: Erwähnen mit @ – alle Mappen (#889), ohne Pause weitertippen (#1267), Werkzeugleiste mit axe (#1268). Auswahl mit Mappentyp vor dem Titel, „Erwähnen“ in der Leiste,
 * Anzeige mit aktuellem Titel (gespeichert nur die Kennung, #1293), Hinweis „Erwähnt in …“ in der erwähnten Mappe; axe hell und dunkel, Tippflächen am Handy.
 * Trefferliste (#1333): Titel der erwähnten Mappe in der Spalte, nach den Rechten der lesenden Person (Lena und Jonas);
 * erwähnte Personen mit demselben Namen wie in der Mappe (Personenliste), auch ein Systemkonto ohne Benutzer-Mappe.
 * Eine erwähnte Person, die es nicht mehr gibt: „@gelöschter Benutzer“ statt nur „@“ (QS-Runde 11/2026).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/erwaehnen.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, JONAS, LENA, rauchtest, schemaWechseln, sitzung } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/** Zwei Mappen: die eine erwähnt die andere – Ziel und Quelle mit eigenem Namen je Lauf. */
async function zweiMappen(zusatz) {
  const cookie = await sitzung(LENA);
  const neu = async (objekt) =>
    (await api('POST', '/api/mappen', { cookie, body: { typId: daten.bausteine.id, werte: { objekt } } })).daten;
  return { ziel: await neu(`Erwähnziel ${zusatz}`), quelle: await neu(`Erwähnquelle ${zusatz}`), cookie };
}

/** Register „Notizen“ der Mappe öffnen. */
async function notizen(s, m) {
  await s.goto(BASIS + `/ablage/${daten.bausteine.id}/${m.id}`);
  await s.getByRole('tab', { name: /Notizen/ }).click();
  await s.locator('.notizregister').waitFor();
}

rauchtest('Erwähnen mit @: Mappe auswählen, aktueller Titel, Hinweis in der erwähnten Mappe (#889)', { als: LENA }, async (s) => {
  const { ziel, quelle, cookie } = await zweiMappen('Eins');
  await notizen(s, quelle);
  // „Erwähnen“ in der Leiste öffnet dieselbe Auswahl wie @.
  await s.getByRole('button', { name: 'Erwähnen' }).last().click();
  // Ohne Pause weitertippen (#1267): Kein Zeichen darf verloren gehen.
  await s.keyboard.type('Erwähnziel Eins');
  assert.equal(await s.locator('#neue-notiz').inputValue(), '@Erwähnziel Eins');
  const auswahl = s.getByRole('listbox', { name: 'Mappe oder Benutzer erwähnen' });
  const option = auswahl.getByRole('option', { name: /Kellerraum · Erwähnziel Eins/ });
  await option.waitFor();
  await option.click();
  assert.match(await s.locator('#neue-notiz').inputValue(), new RegExp(`@\\[Erwähnziel Eins\\]\\(mappe:${ziel.id}\\)`));
  await s.getByRole('button', { name: 'Notiz hinzufügen' }).click();
  // Angezeigt wird der aktuelle Titel – auch nach dem Umbenennen.
  await api('PUT', `/api/mappen/${ziel.id}`, { cookie, body: { werte: { objekt: 'Erwähnziel Eins neu' } } });
  await notizen(s, quelle);
  const link = s.locator('.notizliste').getByRole('link', { name: '@Erwähnziel Eins neu' });
  await link.waitFor();
  assert.match(await link.getAttribute('title'), /^Kellerraum: Erwähnziel Eins neu/);
  // Gespeichert ist nur die Kennung (#1293), der Titel kommt erst beim Anzeigen hinzu.
  const gespeichert = (await api('GET', `/api/mappen/${quelle.id}/notizen`, { cookie })).daten.map((n) => n.text);
  assert.deepEqual(gespeichert, [`@[](mappe:${ziel.id})`]);
  // In der erwähnten Mappe: ruhiger Hinweis oben im Register Notizen, mit Link zurück.
  await notizen(s, ziel);
  const hinweis = s.getByRole('list', { name: 'Hier erwähnt' });
  await hinweis.getByText(/^Erwähnt in einer Notiz bei/).waitFor();
  await hinweis.getByRole('link', { name: 'Erwähnquelle Eins' }).waitFor();
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    for (const v of await axePruefen(s, ['.erwaehnt-in'])) funde.push(`Hinweis (${schema}): ${v}`);
  }
  await notizen(s, quelle);
  await s.getByRole('button', { name: 'Erwähnen' }).last().click();
  await s.keyboard.type('Erwähnziel');
  // Auch nach einem @ von Hand: alles kommt an (#1267).
  await s.keyboard.type(' und @Erwähnquelle');
  assert.equal(await s.locator('#neue-notiz').inputValue(), '@Erwähnziel und @Erwähnquelle');
  await auswahl.getByRole('option').first().waitFor();
  for (const schema of ['light', 'dark']) {
    await schemaWechseln(s, schema);
    // Auswahl, erwähnte Mappe und die ganze Werkzeugleiste (#1268: sichtbare Aufschrift im Namen der Knöpfe).
    for (const v of await axePruefen(s, ['.wahlliste', '.notizliste .formatiert', '.neuenotiz .formatleiste']))
      funde.push(`Auswahl (${schema}): ${v}`);
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Erwähnen mit 44-px-Tippflächen (#889)', { handy: true, als: LENA }, async (s) => {
  const { ziel, quelle, cookie } = await zweiMappen('Zwei');
  await api('POST', `/api/mappen/${quelle.id}/notizen`, { cookie, body: { text: `Siehe @[Erwähnziel Zwei](mappe:${ziel.id})` } });
  await notizen(s, ziel);
  await s.getByRole('list', { name: 'Hier erwähnt' }).getByRole('link').first().waitFor();
  const funde = (await tippflaechenPruefen(s, ['.notizregister'])).map((v) => `Hinweis: ${v}`);
  await notizen(s, quelle);
  await s.locator('.notizliste').getByRole('link', { name: '@Erwähnziel Zwei' }).waitFor();
  // Erwähnungen im Text sind Verweise im Fließtext (WCAG 2.5.8, Ausnahme „Inline“): gemessen wird die Eingabe mit „Erwähnen“.
  for (const v of await tippflaechenPruefen(s, ['.neuenotiz'])) funde.push(`Eingabe: ${v}`);
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});

/**
 * Trefferliste mit formatiertem Feld (#1333): ein eigener Typ, dessen private Mappen nur die anlegende Person lesen darf.
 * Lena legt eine private und eine offene Mappe an und eine dritte, die beide erwähnt. Einmal angelegt, für beide Tests.
 */
let kellernotiz;
/** Eine Benutzer-Id, die es nie gab – für den Server dasselbe wie eine gelöschte Person. */
const WEG_PERSON = '00000000-0000-4000-8000-00000000dead';
function listeMitErwaehnungen() {
  kellernotiz ??= (async () => {
    const verwaltung = await sitzung(LENA);
    await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
    const typ = (
      await api('POST', '/api/typen', {
        cookie: verwaltung,
        body: {
          name: 'Kellernotiz',
          schluessel: 'kellernotiz',
          titelVorlage: '{objekt}',
          trefferliste: ['_titel', 'text'],
          felder: [
            { key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true },
            { key: 'privat', label: 'Privat', typ: 'janein' },
            { key: 'text', label: 'Beschreibung', typ: 'formatiert' },
          ],
        },
      })
    ).daten;
    const ersteller = { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } };
    await api('PUT', `/api/werkbank/berechtigungen/${typ.id}`, {
      cookie: verwaltung,
      body: {
        bestaetigt: true,
        berechtigungen: {
          grund: { C: true, R: true, U: true, D: true, P: true },
          regeln: [
            {
              id: 'privat',
              name: 'Privat nur für die anlegende Person',
              wenn: [
                { art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } },
                { art: 'feld', nicht: true, bedingung: ersteller },
              ],
              dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' },
              stopp: true,
            },
          ],
        },
      },
    });
    const cookie = await sitzung(LENA);
    const neu = async (werte) => (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte } })).daten;
    const privat = await neu({ objekt: 'Kellerschlüssel', privat: true });
    const offen = await neu({ objekt: 'Kellerplan' });
    await neu({ objekt: 'Kellerübersicht', text: `**Siehe** @[](mappe:${privat.id}) und @[](mappe:${offen.id})` });
    // Erwähnte Personen: Jonas (Benutzer-Mappe) und ein Systemkonto wie „Automatisierung“ (ohne Benutzer-Mappe).
    const personen = (await api('GET', '/api/personen', { cookie })).daten;
    const jonas = personen.find((x) => x.name === JONAS.name);
    const system = personen.find((x) => x.art === 'system');
    assert.ok(jonas && system, JSON.stringify(personen));
    const dienst = await neu({ objekt: 'Kellerdienst', text: `Dienst: @[](mappe:${jonas.id}) und @[Alt](mappe:${system.id})` });
    // Alte Schreibweise `benutzer:` mit einer Person, die es nicht (mehr) gibt (QS-Runde 11/2026).
    const ehemals = await neu({ objekt: 'Kellerehemals', text: `Früher: @[](benutzer:${WEG_PERSON})` });
    return { ...typ, dienst, ehemals, namen: `Dienst: @${JONAS.name} und @${system.name}` };
  })();
  return kellernotiz;
}

for (const [person, erwartet] of [
  [LENA, 'Siehe @Kellerschlüssel und @Kellerplan'],
  [JONAS, 'Siehe @Mappe (nicht sichtbar) und @Kellerplan'],
])
  rauchtest(`Trefferliste: Titel erwähnter Mappen nach Rechten – ${person.name} (#1333)`, { als: person }, async (s) => {
    const typ = await listeMitErwaehnungen();
    // Ein Rundgang, der bei der ersten Anmeldung von selbst startet (Jonas allein gestartet), läge über der Liste.
    const cookie = await sitzung(person);
    const { starten } = (await api('GET', '/api/entdecken', { cookie })).daten;
    if (starten) await api('POST', `/api/entdecken/rundgaenge/${starten}`, { cookie, body: { stand: 'gesehen' } });
    await s.goto(BASIS + `/ablage/${typ.id}`);
    const liste = s.getByRole('region', { name: 'Mappen' });
    // Die Nebenzeile der Liste zeigt die erste Spalte nach dem Titel, hier das formatierte Feld.
    await liste.getByText(erwartet, { exact: true }).waitFor();
    // Jonas sieht die private Mappe weder als Zeile noch ihren Titel in der Erwähnung.
    if (person === JONAS) assert.equal(await liste.getByText('Kellerschlüssel').count(), 0);
    assert.equal(await liste.getByText(/@Erwähnung/).count(), 0);
  });

for (const person of [LENA, JONAS])
  rauchtest(`Trefferliste: erwähnte Personen wie in der Mappe – ${person.name} (#1333)`, { als: person }, async (s) => {
    const typ = await listeMitErwaehnungen();
    const cookie = await sitzung(person);
    const { starten } = (await api('GET', '/api/entdecken', { cookie })).daten;
    if (starten) await api('POST', `/api/entdecken/rundgaenge/${starten}`, { cookie, body: { stand: 'gesehen' } });
    // In der Mappe: Namen aus der Personenliste.
    await s.goto(BASIS + `/ablage/${typ.id}/${typ.dienst.id}`);
    const mappe = s.locator('.formatiert').filter({ hasText: 'Dienst:' }).first();
    await mappe.waitFor();
    assert.equal((await mappe.innerText()).trim(), typ.namen);
    // In der Liste derselbe Text – nicht „gelöschte Mappe“ für das Systemkonto und kein gespeicherter Name.
    await s.goto(BASIS + `/ablage/${typ.id}`);
    const liste = s.getByRole('region', { name: 'Mappen' });
    await liste.getByText(typ.namen, { exact: true }).waitFor();
    assert.equal(await liste.getByText(/gelöschte Mappe|@Alt/).count(), 0);
  });

// Eine Notiz zeigt den Text nur an (wie Historie und Ansicht ohne Bearbeiten) – dort stand für eine gelöschte Person
// in der alten Schreibweise `benutzer:` nur „@“, weil die Erwähnung seit #1293 keinen Namen mehr speichert.
rauchtest('Erwähnung einer gelöschten Person zeigt „@gelöschter Benutzer“ statt nur „@“', { als: LENA }, async (s) => {
  const { quelle, cookie } = await zweiMappen('Ehemals');
  await api('POST', `/api/mappen/${quelle.id}/notizen`, { cookie, body: { text: `Früher: @[](benutzer:${WEG_PERSON})` } });
  await notizen(s, quelle);
  const notiz = s.locator('.notizliste .formatiert').filter({ hasText: 'Früher:' }).first();
  await notiz.waitFor();
  // Bis der Server antwortet, steht neutral „@Benutzer“ da; gelöscht trägt den Hinweis „gibt es nicht mehr“.
  const weg = notiz.locator('.erwaehnung.weg[title="Diesen Benutzer gibt es nicht mehr"]');
  await weg.waitFor();
  assert.equal((await weg.innerText()).trim(), '@gelöschter Benutzer');
  assert.equal((await notiz.innerText()).trim(), 'Früher: @gelöschter Benutzer');
});

// Bearbeitbares Feld (QS-Runde 11/2026): Die Vorschau setzt den Titel ein – für eine Person in der alten Schreibweise
// „gelöschter Benutzer“, nicht „gelöschte Mappe“.
rauchtest('Vorschau im bearbeitbaren Feld: gelöschte Person heißt „@gelöschter Benutzer“', { als: LENA }, async (s) => {
  const typ = await listeMitErwaehnungen();
  await s.goto(BASIS + `/ablage/${typ.id}/${typ.ehemals.id}`);
  const vorschau = s.locator('.formatiert').filter({ hasText: 'Früher:' }).first();
  await vorschau.locator('.erwaehnung.weg[title="Diesen Benutzer gibt es nicht mehr"]').waitFor();
  await s.waitForFunction(() =>
    [...document.querySelectorAll('.formatiert')].some((e) => e.textContent?.trim() === 'Früher: @gelöschter Benutzer'),
  );
  assert.equal((await vorschau.innerText()).trim(), 'Früher: @gelöschter Benutzer');
  assert.equal(await s.getByText('gelöschte Mappe').count(), 0);
});
