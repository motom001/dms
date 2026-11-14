/**
 * Rauchtests: Werkbank → Pakete ohne Internet: Katalog und Pakete als Attrappe (#1167, #1168, #1047, #1048).
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/pakete.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { BASIS, LENA, rauchtest, verwalten, WERKBANK_BEREICHE } from '../hilfen.mjs';
import { axePruefen, tippflaechenPruefen } from '../muster.mjs';

/* ---------- Werkbank → Pakete ohne Internet: Katalog und Pakete als Attrappe (#1167, #1168, #1047, #1048) ---------- */

/** Ein Paket im Katalog der Attrappe: Versionen neueste zuerst; mehr: Angaben je Version (abhaengigkeiten, ergaenzt, sprache …). */
function katalogPaket(id, name, versionen, mehr = {}, jeVersion = {}) {
  return {
    id, name, beschreibung: `${name} für die Ablage. Ein zweiter Satz.`, autor: { name: 'Ablago-Projekt', github: '' }, lizenz: 'Apache-2.0', aktuell: versionen[0], herausgeber: 'app.ablago', ...mehr,
    versionen: versionen.map((version) => ({ version, dms: '>=0.0.0', abhaengigkeiten: {}, inhalt: { mappentypen: [], sichten: [], beispiele: 0 }, code: false, archiv: `${id}.zip`, sha256: '0'.repeat(64), groesse: 2048, veroeffentlicht: '2026-11-01T00:00:00Z', quelle: '', readme: '', changelog: '', ...jeVersion })),
  };
}
/** Ein installiertes Paket der Attrappe (Herkunft: offizieller Katalog). */
function installiertesPaket(id, name, version, mehr = {}) {
  return { id, name, version, beschreibung: `${name} für die Ablage.`, lizenz: 'Apache-2.0', autor: { name: 'Ablago-Projekt', github: '' }, herausgeber: 'app.ablago', herausgeberGeprueft: true,
    herkunft: { art: 'katalog', url: '' }, installiert: '2026-10-01T08:00:00Z', installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, ...mehr };
}
/** Vorschau eines Updates in der Attrappe – nur, was die Seite braucht; mehr: Rechte, Probleme, Abhängigkeiten … */
function updateVorschau(p, version, mehr = {}) {
  return { paket: { id: p.id, name: p.name, version, beschreibung: p.beschreibung, lizenz: p.lizenz, autor: p.autor, dms: '>=0.0.0', abhaengigkeiten: {}, readme: null, changelog: null, quelle: null, herausgeber: 'app.ablago', herausgeberGeprueft: true },
    dmsVersion: 'rauchtest', dmsOk: true, installiert: p.version, update: true, herkunft: p.herkunft, umzug: null, herausgeberBestaetigen: null, pruefung: null,
    abhaengigkeiten: [], typen: [], sichten: [], beispiele: 0, beispielDokumente: { anzahl: 0, bytes: 0 }, vorgaben: [], ergaenzungen: [], umbau: [], probleme: [], fehlercodes: [], namenskonflikte: [], hinweise: [],
    automatisierungen: [], einstellungen: null, laeufer: null, sprache: null, ...mehr };
}

/**
 * Pakete ohne Internet: Die Rauchtests haben keinen Katalog – Katalog, installierte Pakete, Vorschau und Update kommen
 * aus dieser Attrappe. Der Rest der Seite (Selbst erstellt, Menü „Mappe“ …) ist echt. Liefert den Zustand: installierte
 * Pakete (ändern sich mit jedem Update) und die Reihenfolge der Updates. scheitert: Ids, deren Update 409 meldet.
 */
async function paketeAttrappe(s, { installiert = [], katalog = [], vorschau = {}, scheitert = [], empfohlen }) {
  const z = { installiert: installiert.map((p) => ({ ...p })), updates: [], katalogUrl: '' };
  await s.route('**/api/werkbank/pakete', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const echt = await (await r.fetch()).json();
    z.katalogUrl = echt.katalogUrl;
    for (const p of z.installiert) if (!p.herkunft.url) p.herkunft = { art: 'katalog', url: echt.katalogUrl };
    await r.fulfill({ json: { ...echt, installiert: z.installiert } });
  });
  await s.route('**/api/werkbank/pakete/katalog', (r) => r.fulfill({ json: {
    kataloge: [{ url: z.katalogUrl, offiziell: true, katalog: { format: 1, erstellt: '2026-11-14T08:00:00Z', quelle: 'https://github.com/motom001/dms-registry', pakete: katalog, ...(empfohlen ? { empfohlen } : {}) }, fehler: null, pruefung: null }],
    abgerufen: new Date().toISOString(),
  } }));
  await s.route('**/api/werkbank/pakete/vorschau', (r) => {
    const { id, version } = r.request().postDataJSON();
    const p = z.installiert.find((x) => x.id === id);
    return r.fulfill({ json: (vorschau[id] ?? ((x) => updateVorschau(x, version)))(p, version) });
  });
  // Die Paketseite fragt nach Umwandlungen (#534) – die Pakete der Attrappe haben keine.
  await s.route('**/api/werkbank/pakete/*/umwandlungen', (r) => r.fulfill({ json: { felder: [], vorgaenge: [] } }));
  await s.route('**/api/werkbank/pakete/*/aktualisieren', (r) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split('/').at(-2));
    const { version } = r.request().postDataJSON();
    z.updates.push(id);
    if (scheitert.includes(id)) return r.fulfill({ status: 409, json: { fehler: 'Das Archiv lässt sich nicht laden.' } });
    const p = z.installiert.find((x) => x.id === id);
    Object.assign(p, { version, aktualisiert: new Date().toISOString() });
    return r.fulfill({ json: p });
  });
  return z;
}

/** Zur Werkbank → Pakete im Verwaltungsmodus. */
async function zuDenPaketen(s) {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/pakete');
  return s.getByRole('region', { name: 'Elemente' });
}

/** Drei installierte Pakete, zwei davon mit neuer Version; Verträge braucht die neue Basis. */
const PAKETE_DREI = {
  installiert: [installiertesPaket('basis', 'Basis', '1.6.0'), installiertesPaket('vertraege', 'Verträge', '1.1.0', { abhaengigkeiten: { basis: '>=1.6.0' } }), installiertesPaket('rechnungen', 'Rechnungen', '1.0.0')],
  katalog: [katalogPaket('basis', 'Basis', ['1.7.0', '1.6.0']), katalogPaket('vertraege', 'Verträge', ['1.2.0', '1.1.0'], {}, { abhaengigkeiten: { basis: '>=1.7.0' } }), katalogPaket('rechnungen', 'Rechnungen', ['1.0.0'])],
};

/** Was mitkommt (#1047): ein installiertes Paket mit allem, was es mitbrachte, und einer Kurzanleitung. */
const MITKOMMT = {
  mappentypen: [{ schluessel: 'mietvertrag', name: 'Mietvertrag', beschreibung: 'Vertrag mit Mieterin oder Mieter.', felder: 12 }],
  sichten: [{ schluessel: 'miete', name: 'Mietverträge' }],
  vorgaben: [{ typ: 'Vertragsart', namen: ['Miete', 'Pacht'] }], vorlagen: 1,
  beispiele: 2, beispielDokumente: 1,
  wortlisten: [['Miete', 'Mietvertrag']],
  automatisierungen: [{ schluessel: 'ende', name: 'Mietvertrag endet', an: true, wenn: { art: 'datum', typ: 'Mietvertrag', feld: 'Ende', vorlauf: 60, einheit: 'tage', uhrzeit: '07:00', wiederholung: 12 },
    dann: [{ art: 'aufgabe', benachrichtigung: false, empfaenger: [{ art: 'feld', feld: 'Verantwortlich', sonstErsteller: true }] }] }],
  ablaufvorlagen: [{ schluessel: 'nachfassen', name: 'Nachfassen', karten: ['Aufgabe an die gewählte Person'] }],
  aktionen: [{ schluessel: 'brief', name: 'Brief aus Vorlage', rechte: ['lesen', 'dokument_hinzufuegen'] }],
  einstellungen: [], code: false, netz: false, sprache: false,
};
const KURZANLEITUNG = { de: ['Lege unter „+ Neu“ einen Mietvertrag an.', 'Trage das Ende ein.', 'Ablago erinnert dich 60 Tage vorher.'], en: ['Create a tenancy under “+ New”.', 'Enter the end.', 'Ablago reminds you 60 days before.'] };
const PAKETE_MITKOMMT = {
  installiert: [installiertesPaket('vermietung', 'Vermietung', '2.0.0', { mitkommt: MITKOMMT, kurzanleitung: KURZANLEITUNG })],
  katalog: [katalogPaket('vermietung', 'Vermietung', ['2.1.0', '2.0.0'])],
  vorschau: { vermietung: (p, v) => updateVorschau(p, v, { mitkommt: { ...MITKOMMT, automatisierungen: [...MITKOMMT.automatisierungen, { schluessel: 'neu', name: 'Neuer Mietvertrag', an: false, neu: true, wenn: { art: 'ereignis', ereignis: 'mappe.angelegt', typ: 'Mietvertrag' }, dann: [{ art: 'aufgabe', benachrichtigung: true, empfaenger: [{ art: 'ersteller' }] }] }] } }) },
};

rauchtest('Paketseite: Was mitkommt, Kurzanleitung nach der Installation, „neu in dieser Version“ (#1047)', { als: LENA }, async (s) => {
  await paketeAttrappe(s, PAKETE_MITKOMMT);
  await zuDenPaketen(s);
  // Direkt nach der Installation (?neu=1): einmal die Kurzanleitung, schließbar.
  await s.goto(BASIS + '/werkbank/pakete/vermietung?neu=1');
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const anleitung = bearbeitung.getByRole('region', { name: 'So nutzt du es' });
  await anleitung.getByText('Trage das Ende ein.').waitFor();
  assert.equal(new URL(s.url()).search, '', 'der Merker verschwindet aus der Adresse');
  await anleitung.getByRole('button', { name: 'Schließen' }).click();
  await anleitung.waitFor({ state: 'detached' });
  // Später über die Paketseite: Was mitkommt in der Reihenfolge des Katalogs, Automatisierung in Klartext.
  const mit = bearbeitung.getByRole('region', { name: 'Was mitkommt' });
  const titel = await mit.locator('h3').allInnerTexts();
  assert.deepEqual(titel, ['Mappentypen', 'Ansichten', 'Mitgelieferte Mappen', 'Beispiele', 'Gleichbedeutende Wörter für die Suche', 'Automatisierungen', 'Automatisierungsvorlagen', 'Aktionen im Menü „Mappe“', 'Rechte und Netz']);
  await mit.getByText('60 Tage vor „Ende“ (Mietvertrag), geprüft um 07:00').waitFor();
  await mit.getByText('Aufgabe an „Verantwortlich“ (sonst an die Person, die die Mappe angelegt hat)').waitFor();
  await mit.getByText(/^Wiederkehrend \(jährlich\): nach dem Erledigen schlägt Ablago den Folgetermin vor/).waitFor();
  await mit.getByText('So nutzt du es').click();
  await mit.getByText('Ablago erinnert dich 60 Tage vorher.').waitFor();
  // Update: Was mitkommt in der Vorschau, Neues markiert.
  await s.getByRole('region', { name: 'Elemente' }).getByRole('button', { name: 'Nach neuen Versionen suchen' }).click();
  await bearbeitung.getByRole('button', { name: 'Auf 2.1.0 aktualisieren …' }).click();
  const vorschau = bearbeitung.getByRole('region', { name: 'Vorschau' });
  await vorschau.getByText('Was mitkommt').click();
  await vorschau.getByRole('listitem').filter({ hasText: 'Neuer Mietvertrag' }).getByText('neu in dieser Version').waitFor();
  assert.equal(await vorschau.getByRole('listitem').filter({ hasText: 'Mietvertrag endet' }).getByText('neu in dieser Version').count(), 0);
});

/** Pakete dazuholen (#1048): Empfehlungsliste im Katalog, zwei Sprachen, Zusatzsprachen der installierten Texterkennung. */
const PAKETE_DAZU = {
  installiert: [installiertesPaket('basis', 'Basis', '1.7.0'), installiertesPaket('texterkennung', 'Texterkennung', '2.0.0')],
  empfohlen: ['basis', 'haushalt', 'texterkennung', 'benachrichtigungen', 'vertraege', 'rechnungen', 'trennblatt', 'sicherung_webdav'],
  katalog: [
    katalogPaket('basis', 'Basis', ['1.7.0']), katalogPaket('haushalt', 'Haushalt', ['1.2.0']), katalogPaket('vertraege', 'Verträge', ['1.1.0']), katalogPaket('trennblatt', 'Trennblatt', ['1.0.0']),
    katalogPaket('fahrzeuge', 'Fahrzeuge', ['1.1.0']), katalogPaket('texterkennung', 'Texterkennung', ['2.0.0']),
    katalogPaket('sprache_fr', 'Französisch', ['1.0.0'], { kuerzel: 'FR' }, { sprache: { kennung: 'fr', maschinell: true } }),
    katalogPaket('sprache_es', 'Spanisch', ['1.0.0'], { kuerzel: 'ES' }, { sprache: { kennung: 'es', maschinell: true } }),
    katalogPaket('texterkennung.fra', 'Texterkennung – Zusatzsprache Französisch', ['1.0.0'], {}, { ergaenzt: { paket: 'texterkennung', gruppe: 'Weitere Sprachen' }, abhaengigkeiten: { texterkennung: '>=2.0.0' } }),
  ],
};

rauchtest('Pakete dazuholen: empfohlen zuerst, Sprachen über den Filter, Ergänzungen beim Hauptpaket, Suche (#1048)', { als: LENA }, async (s) => {
  await paketeAttrappe(s, PAKETE_DAZU);
  const elemente = await zuDenPaketen(s);
  await elemente.getByRole('button', { name: 'Nach neuen Versionen suchen' }).click();
  const namen = async (region) => (await elemente.getByRole('region', { name: region }).locator('.eintrag .titel').allInnerTexts()).map((x) => x.split(' · ')[0].trim());
  assert.deepEqual(await namen('Für dich empfohlen'), ['Haushalt', 'Verträge', 'Trennblatt']);
  assert.deepEqual(await namen('Weitere Pakete'), ['Fahrzeuge']);
  await elemente.getByText(/Ergänzungen wie die Zusatzsprachen/).waitFor();
  // Sprachen nur über den Filter.
  await elemente.getByRole('radio', { name: 'Sprachen (2)' }).click();
  assert.deepEqual((await elemente.getByRole('list', { name: 'Sprachen' }).locator('.eintrag .titel').allInnerTexts()).map((x) => x.split(' · ')[0].trim()), ['Französisch', 'Spanisch']);
  await elemente.getByRole('radio', { name: 'Pakete' }).click();
  // Die Suche findet alles – auch Sprachen und Ergänzungen.
  await elemente.getByRole('searchbox', { name: 'Verfügbare Pakete durchsuchen' }).fill('franz');
  const treffer = elemente.getByRole('list', { name: 'Gefundene Pakete' });
  await treffer.getByRole('link', { name: /^Texterkennung – Zusatzsprache Französisch/ }).waitFor();
  await treffer.getByRole('link', { name: /^Französisch/ }).waitFor();
  // Beim installierten Hauptpaket: „Dazu passend“.
  await elemente.getByRole('link', { name: /^Texterkennung/ }).first().click();
  const passend = s.getByRole('region', { name: 'Bearbeitung' }).getByRole('region', { name: 'Dazu passend' });
  await passend.getByText('Weitere Sprachen').waitFor();
  await passend.getByText(/Zusatzsprache Französisch/).waitFor();
});

rauchtest('Pakete: ein Knopf, Rückmeldung mit Uhrzeit, Merker nach dem Update weg (#1167, #1168)', { als: LENA }, async (s) => {
  const z = await paketeAttrappe(s, PAKETE_DREI);
  const elemente = await zuDenPaketen(s);
  await elemente.getByRole('button', { name: 'Nach neuen Versionen suchen' }).click();
  assert.equal(await elemente.getByRole('button', { name: 'Katalog abrufen' }).count(), 0);
  await elemente.getByRole('status').filter({ hasText: /Abgerufen um \d\d:\d\d · 2 neue Versionen/ }).waitFor();
  await elemente.getByRole('link', { name: 'Alle aktualisieren (2)' }).waitFor();
  // Einzeln aktualisieren: danach ist der Merker sofort weg, ohne erneut zu suchen (#1167).
  await elemente.getByRole('link', { name: /^Basis.*1\.7\.0/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  await bearbeitung.getByRole('button', { name: 'Auf 1.7.0 aktualisieren …' }).click();
  await bearbeitung.getByRole('button', { name: 'Aktualisieren', exact: true }).click();
  await bearbeitung.getByText('Basis ist jetzt auf Version 1.7.0.').waitFor();
  await elemente.getByRole('link', { name: 'Alle aktualisieren (1)' }).waitFor();
  assert.match(await elemente.getByRole('link', { name: /^Basis/ }).innerText(), /Version 1\.7\.0/);
  assert.doesNotMatch(await elemente.getByRole('link', { name: /^Basis/ }).locator('.chip').allInnerTexts().then((x) => x.join(' ')), /1\.7\.0/);
  assert.deepEqual(z.updates, ['basis']);
});

/** Vier Pakete für „Alle aktualisieren“: eines braucht neue Rechte, eines scheitert, eines hängt am gescheiterten. */
const PAKETE_RUNDE = {
  installiert: [...PAKETE_DREI.installiert, installiertesPaket('fahrzeuge', 'Fahrzeuge', '1.0.0'), installiertesPaket('fahrtenbuch', 'Fahrtenbuch', '1.0.0'), installiertesPaket('ki_assistent', 'KI-Assistent', '1.0.0')],
  katalog: [...PAKETE_DREI.katalog, katalogPaket('fahrzeuge', 'Fahrzeuge', ['1.1.0', '1.0.0']), katalogPaket('fahrtenbuch', 'Fahrtenbuch', ['2.0.0', '1.0.0'], {}, { abhaengigkeiten: { fahrzeuge: '>=1.1.0' } }), katalogPaket('ki_assistent', 'KI-Assistent', ['1.1.0', '1.0.0'])],
  scheitert: ['fahrzeuge'],
  vorschau: {
    vertraege: (p, v) => updateVorschau(p, v, { paket: { ...updateVorschau(p, v).paket, abhaengigkeiten: { basis: '>=1.7.0' } }, probleme: ['basis ist in Version 1.6.0 installiert, gebraucht wird >=1.7.0.'],
      abhaengigkeiten: [{ id: 'basis', bereich: '>=1.7.0', installiert: '1.6.0', ok: false, verfuegbar: '1.7.0', problem: 'basis ist in Version 1.6.0 installiert, gebraucht wird >=1.7.0.' }] }),
    fahrtenbuch: (p, v) => updateVorschau(p, v, { paket: { ...updateVorschau(p, v).paket, abhaengigkeiten: { fahrzeuge: '>=1.1.0' } }, abhaengigkeiten: [{ id: 'fahrzeuge', bereich: '>=1.1.0', installiert: '1.0.0', ok: false, verfuegbar: '1.1.0', problem: 'fahrzeuge ist in Version 1.0.0 installiert.' }], probleme: ['fahrzeuge ist in Version 1.0.0 installiert.'] }),
    ki_assistent: (p, v) => updateVorschau(p, v, { laeufer: { bestaetigen: true, rechte: [{ text: 'Dokumente lesen', hilfe: 'pakete.recht.dokumente' }] } }),
  },
};

rauchtest('Pakete: Alle aktualisieren – Reihenfolge, Bestätigung, Fortschritt und Zusammenfassung (#1168)', { als: LENA, erwartet: [{ status: 409, pfad: /\/api\/werkbank\/pakete\/fahrzeuge\/aktualisieren$/ }] }, async (s) => {
  const z = await paketeAttrappe(s, PAKETE_RUNDE);
  const elemente = await zuDenPaketen(s);
  await elemente.getByRole('button', { name: 'Nach neuen Versionen suchen' }).click();
  await elemente.getByRole('link', { name: 'Alle aktualisieren (5)' }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  const reihe = bearbeitung.getByRole('region', { name: 'Reihenfolge' }).getByRole('listitem');
  await reihe.first().waitFor();
  const namen = (await reihe.allInnerTexts()).map((x) => x.split(' ')[0]);
  assert.ok(namen.indexOf('Basis') < namen.indexOf('Verträge') && namen.indexOf('Fahrzeuge') < namen.indexOf('Fahrtenbuch'), namen.join(', '));
  // Nur das Paket mit neuen Rechten ist aufgeklappt; ohne Haken bleibt der Knopf gesperrt.
  const ki = bearbeitung.getByRole('region', { name: 'KI-Assistent' });
  await ki.getByText('Dokumente lesen').waitFor();
  const los = bearbeitung.getByRole('button', { name: 'Alle aktualisieren (5)', exact: true });
  assert.equal(await los.getAttribute('aria-disabled'), 'true');
  await ki.getByRole('checkbox', { name: 'Die Rechte haben sich geändert. Ich erlaube sie.' }).check();
  await los.click();
  const summe = bearbeitung.getByRole('status').filter({ hasText: '3 Pakete aktualisiert.' });
  await summe.waitFor();
  assert.match(await summe.innerText(), /1 gescheitert\. 1 ausgelassen\./);
  assert.ok(z.updates.indexOf('basis') < z.updates.indexOf('vertraege'));
  assert.ok(!z.updates.includes('fahrtenbuch'), 'Fahrtenbuch hängt an Fahrzeuge und wird ausgelassen');
  await bearbeitung.getByText('Das Archiv lässt sich nicht laden.').waitFor();
  await bearbeitung.getByText(/ausgelassen – braucht Fahrzeuge/).waitFor();
  await bearbeitung.getByRole('button', { name: 'Fertig' }).click();
  await elemente.getByRole('link', { name: 'Alle aktualisieren (2)' }).waitFor();
});

/** Seiten der Werkbank → Pakete mit Attrappe für axe und Tippflächen: Liste nach dem Abruf, „Alle aktualisieren“. */
async function paketSeiten(s, verwaltet = false) {
  if (verwaltet) await s.goto(BASIS + '/werkbank/pakete');
  const elemente = verwaltet ? s.getByRole('region', { name: 'Elemente' }) : await zuDenPaketen(s);
  await elemente.getByRole('button', { name: 'Nach neuen Versionen suchen' }).click();
  await elemente.getByRole('link', { name: /^Alle aktualisieren/ }).waitFor();
  const seiten = [{ name: 'Liste', weg: async () => {} }, { name: 'Liste: Sprachen', weg: async () => {
    await elemente.getByRole('radio', { name: /^Sprachen/ }).click();
    await elemente.getByRole('list', { name: 'Sprachen' }).waitFor();
  } }];
  seiten.push({ name: 'Alle aktualisieren', weg: async () => {
    await elemente.getByRole('link', { name: /^Alle aktualisieren/ }).click();
    await s.getByRole('region', { name: 'Reihenfolge' }).waitFor();
    // Zusammengefasste Pakete aufklappen, damit axe auch ihre Vorschau sieht.
    const zu = s.locator('.spalte.mappe details:not([open]) > summary');
    while (await zu.count()) await zu.first().click();
  } });
  // Paketseite (#1047): Kurzanleitung nach der Installation, Was mitkommt aufgeklappt.
  seiten.push({ name: 'Paketseite', weg: async () => {
    await s.goto(BASIS + '/werkbank/pakete/vermietung?neu=1');
    await s.getByRole('region', { name: 'Was mitkommt' }).waitFor();
    const zu = s.locator('.spalte.mappe details:not([open]) > summary');
    while (await zu.count()) await zu.first().click();
  } });
  return seiten;
}

/** Für axe und Tippflächen: die Runde und ein Paket mit „Was mitkommt“. */
const PAKETE_ALLES = { ...PAKETE_RUNDE, empfohlen: PAKETE_DAZU.empfohlen, installiert: [...PAKETE_RUNDE.installiert, ...PAKETE_MITKOMMT.installiert, PAKETE_DAZU.installiert[1]],
  katalog: [...PAKETE_RUNDE.katalog, ...PAKETE_MITKOMMT.katalog, ...PAKETE_DAZU.katalog.filter((p) => !['basis', 'vertraege'].includes(p.id))], vorschau: { ...PAKETE_RUNDE.vorschau, ...PAKETE_MITKOMMT.vorschau } };

rauchtest('Pakete: axe ohne Verstoß, hell und dunkel (#1168, #1047, #1048)', { als: LENA }, async (s) => {
  await paketeAttrappe(s, PAKETE_ALLES);
  const funde = [];
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    for (const seite of await paketSeiten(s, schema === 'dark')) {
      await seite.weg();
      await s.waitForLoadState('networkidle');
      for (const v of await axePruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name} (${schema}): ${v}`);
    }
  }
  assert.deepEqual(funde, [], `axe meldet Verstöße:\n${funde.join('\n')}`);
});

rauchtest('Handy: Pakete mit 44-px-Tippflächen (#1168, #1047, #1048)', { handy: true, als: LENA }, async (s) => {
  await paketeAttrappe(s, PAKETE_ALLES);
  const funde = [];
  for (const seite of await paketSeiten(s)) {
    await seite.weg();
    await s.waitForLoadState('networkidle');
    for (const v of await tippflaechenPruefen(s, WERKBANK_BEREICHE)) funde.push(`${seite.name}: ${v}`);
  }
  assert.deepEqual(funde, [], `Zu kleine Tippflächen am Handy:\n${funde.join('\n')}`);
});
