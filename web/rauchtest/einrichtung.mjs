/**
 * Einrichtung (#897): der Assistent im Browser und die Daten, die alle übrigen Rauchtests brauchen.
 * Jeder Bereich bindet diese Datei zuerst ein – so läuft die Einrichtung immer als erster Test, auch allein.
 */
import assert from 'node:assert/strict';
import { api, BASIS, beispielPdf, bereitMelden, daten, einrichtungscode, JONAS, LENA, rauchtest, warteAufAblago } from './hilfen.mjs';
import { axePruefen } from './muster.mjs';

/* ---------- Einrichtung und Daten ---------- */

rauchtest('Einrichtung: Assistent im Browser', {
  einrichtung: true,
  // Nach „Übernehmen und weiter“ startet Ablago mit der Datenbank neu; bis dahin antwortet der Status mit 503.
  erwartet: [{ status: 503, pfad: /^\/api\/konto\/status$/ }],
  // … und zwischen Beenden und Start lehnt der Port die Verbindung kurz ab.
  neustart: [/^\/api\/konto\/status$/],
}, async (s, k) => {
  await warteAufAblago();
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Sprache' }).waitFor();
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByLabel('Einrichtungscode').fill(await einrichtungscode());
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByRole('heading', { name: 'Datenbank', exact: true }).waitFor();
  await s.getByRole('textbox', { name: /^Server/ }).fill(process.env.DB_HOST ?? 'localhost');
  await s.getByRole('textbox', { name: /^Datenbank/ }).fill(process.env.DB_NAME ?? 'dms_rauchtest');
  await s.getByRole('textbox', { name: /^Benutzer/ }).fill(process.env.DB_BENUTZER ?? 'dms');
  await s.getByLabel(/^Passwort/).fill(process.env.DB_PASSWORT ?? 'dms');
  await s.getByRole('button', { name: 'Verbindung prüfen' }).click();
  // Eine leere Datenbank legt der Assistent auf Wunsch selbst an.
  const anlegen = s.getByRole('button', { name: /^Datenbank „.*“ anlegen$/ });
  const weiter = s.getByRole('button', { name: 'Übernehmen und weiter' });
  await anlegen.or(weiter).first().waitFor();
  if (await anlegen.isVisible()) await anlegen.click();
  await weiter.click();
  await s.getByRole('heading', { name: 'Neu einrichten oder wiederherstellen?' }).waitFor({ timeout: 90_000 });
  await s.getByRole('button', { name: /^Neu einrichten/ }).click();
  await s.getByLabel(/Name deiner Ablage/).fill('Familie Beispiel');
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByRole('heading', { name: 'Dein Konto' }).waitFor();
  await s.getByLabel('Name', { exact: true }).fill(LENA.name);
  await s.getByLabel(/E-Mail-Adresse/).fill(LENA.email);
  await s.getByLabel('Passwort', { exact: true }).fill(LENA.passwort);
  await s.getByLabel('Passwort wiederholen').fill(LENA.passwort);
  await assistentAxe(s, 'Dein Konto');
  await s.getByRole('button', { name: 'Weiter' }).click();
  // Wofür nutzt du Ablago? (#1045) – Lena: zu Hause.
  await s.getByRole('heading', { name: 'Wofür nutzt du Ablago?' }).waitFor();
  await s.getByRole('radio', { name: /^Für zu Hause/ }).check();
  await s.getByRole('button', { name: 'Weiter' }).click();
  // Pakete: ohne Internet nur ein Hinweis – die Rauchtests brauchen keine Pakete.
  await s.getByRole('heading', { name: 'Pakete dazuholen' }).waitFor();
  await s.getByRole('button', { name: 'Überspringen' }).click({ timeout: 30_000 });
  await s.getByRole('heading', { name: 'Optionales' }).waitFor();
  // Notfallkontakt (#1215): „+ Notfallkontakt“ klein, Entfernen leise mit Rückfrage – danach ist die Liste wieder leer.
  const nk = s.locator('#notfallkontakte');
  await nk.getByRole('button', { name: '+ Notfallkontakt' }).click();
  await nk.getByLabel('Name', { exact: true }).fill('Markus Beispiel');
  await nk.getByLabel('E-Mail', { exact: true }).fill('markus@example.org');
  await nk.getByRole('button', { name: 'Übernehmen' }).click();
  await nk.getByText('markus@example.org').waitFor();
  await assistentAxe(s, 'Optionales');
  await nk.getByRole('button', { name: 'Entfernen' }).click();
  await s.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
  await nk.getByText('markus@example.org').waitFor({ state: 'detached' });
  await s.getByRole('button', { name: 'Weiter' }).click();
  await s.getByRole('heading', { name: 'Zusammenfassung' }).waitFor();
  await assistentAxe(s, 'Zusammenfassung');
  await s.getByRole('button', { name: 'Jetzt einrichten' }).click();
  await s.getByRole('heading', { name: /ist eingerichtet/ }).waitFor({ timeout: 60_000 });
  const download = s.waitForEvent('download');
  await s.getByRole('button', { name: 'Notfallblatt herunterladen' }).click();
  await (await download).cancel().catch(() => {});
  await s.getByText(/Notfallblatt heruntergeladen/).waitFor();
  // Auf localhost bietet der Assistent auch den Passkey an (#811) – beides „Später“, hier die Zwei-Faktor-Anmeldung.
  await s.getByRole('region', { name: /Zwei-Faktor/ }).getByRole('button', { name: 'Später' }).click();
  await s.getByRole('region', { name: /Passkey/ }).getByRole('button', { name: 'Jetzt hinzufügen' }).waitFor();
  await assistentAxe(s, 'Abschluss');
  await s.getByRole('button', { name: 'Einrichtung abschließen' }).click();
  await s.waitForURL(/\/werkbank/);
  const sitzungscookie = (await k.cookies()).find((c) => c.name === 'dms_sitzung');
  assert.ok(sitzungscookie, 'Nach der Einrichtung keine Sitzung im Browser');
  await vorbereiten(`${sitzungscookie.name}=${sitzungscookie.value}`);
  bereitMelden();
  assert.deepEqual(ASSISTENT_FUNDE, [], `axe meldet Verstöße im Assistenten (#1215):\n${ASSISTENT_FUNDE.join('\n')}`);
});

/**
 * Assistent aus Bausteinen (#1215): axe auf der Karte des Assistenten, hell und dunkel. Die Funde sammelt der Test und
 * meldet sie am Ende – so läuft die Einrichtung trotzdem durch und die übrigen Rauchtests bleiben möglich.
 */
const ASSISTENT_FUNDE = [];
async function assistentAxe(s, schritt) {
  for (const schema of ['light', 'dark']) {
    await s.emulateMedia({ colorScheme: schema });
    // Knöpfe wechseln ihre Fläche mit einem kurzen Übergang – erst danach messen.
    await s.waitForTimeout(400);
    for (const v of await axePruefen(s, ['.karte.assistent'])) ASSISTENT_FUNDE.push(`${schritt} (${schema}): ${v}`);
  }
  await s.emulateMedia({ colorScheme: 'light' });
}

/** Daten für die Tests über die Schnittstelle – mit der Sitzung aus dem Assistenten (im Verwaltungsmodus). */
async function vorbereiten(cookie) {
  // Lena kennt Ablago schon: kein Rundgang über ihren Tests. Den zeigt der Test mit dem neuen Konto.
  await api('POST', '/api/entdecken/rundgaenge/ablago', { cookie, body: { stand: 'gesehen' } });
  await api('POST', '/api/beispiele', { cookie });
  for (const [schluessel, betreff] of [['brief', 'Preisanpassung Strom 2027'], ['briefHandy', 'Beitragsrechnung Hausrat 2027']]) {
    const brief = (await api('POST', '/api/post', { cookie, body: { betreff } })).daten;
    await api('POST', `/api/mappen/${brief.id}/dokumente?register=dokumente&name=${encodeURIComponent(`${betreff}.pdf`)}&typ=application/pdf`, { cookie, body: beispielPdf(betreff), roh: true });
    daten[schluessel] = brief;
  }
  // Eine Automatisierung für die Dreiteilung der Werkbank (#1063): Ihre Bearbeitung ist länger als das Fenster.
  const vertrag = (await api('GET', '/api/typen', { cookie })).daten.find((x) => x.name === 'Vertrag');
  await api('POST', '/api/werkbank/automatisierungen', { cookie, body: { name: 'Rauchtest Vertrag angelegt', wenn: { art: 'mappe.angelegt', typ: vertrag.id }, dann: [{ id: 's', art: 'stopp' }] } });
  // Liste der Automatisierungen (#1172): zwei eigene zum gemeinsamen Ein- und Ausschalten, eine mit Aufgabe (Ziel, Platzhalter).
  for (const name of ['Rauchtest Auswahl A', 'Rauchtest Auswahl B']) {
    await api('POST', '/api/werkbank/automatisierungen', { cookie, body: { name, aktiv: true, wenn: { art: 'mappe.angelegt', typ: vertrag.id },
      dann: [{ id: 'a', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Prüfen: {titel}', faellig: 7 }] } });
  }
  // Feldart Tabelle (#1030): Auftrag mit Positionen – eigene Typen, damit die Beispiele unverändert bleiben.
  daten.tabelle = await tabellenDaten(cookie);
  // Beim Auswählen übernehmen (#1037): Tarifart mit üblichen Angaben, Abo übernimmt sie.
  daten.vorbelegen = await vorbelegenDaten(cookie);
  // Archivmodus „Ist der Stichtag leer: läuft noch nicht ab“ (#1051): ein laufender und ein beendeter Mietvertrag.
  daten.archiv = await archivDaten(cookie);
  // Datum vorschlagen (#1180) und „In der allgemeinen Suche zeigen“ (#1220): eigene Typen ohne Ansicht.
  daten.vorschlag = await vorschlagDaten(cookie);
  // Ablage aus Bausteinen (#1211, #1212): ein Mappentyp ohne Archivmodus, damit Löschen in den Papierkorb geht.
  daten.bausteine = (await api('POST', '/api/typen', { cookie, body: { name: 'Kellerraum', schluessel: 'kellerraum', titelVorlage: '{objekt}',
    felder: [{ key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true }, { key: 'notiz', label: 'Notiz', typ: 'langtext' }, { key: 'seit', label: 'Seit', typ: 'datum' }] } })).daten;
  const einladung = (await api('POST', '/api/benutzer',{ cookie, body: { email: JONAS.email, name: JONAS.name, rolle: 'mitglied', rollen: [] } })).daten;
  await api('POST', '/api/konto/passwort-setzen', { body: { schluessel: einladung.link.split('/passwort/')[1], passwort: JONAS.passwort } });
}

/** Typen „Auftrag“ mit Tabelle „Positionen“ und „Auftragsposition“, ein Auftrag mit zwei Positionen (#1030). */
async function tabellenDaten(cookie) {
  const auftrag = (await api('POST', '/api/typen', { cookie, body: { name: 'Auftrag', schluessel: 'auftrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Auftragsnummer', typ: 'text', pflicht: true }] } })).daten;
  // Ist Teil einer anderen Mappe (#1031): Positionen erscheinen nur am Auftrag.
  const position = (await api('POST', '/api/typen', { cookie, body: { name: 'Auftragsposition', schluessel: 'auftragsposition', titelVorlage: '{nr}. {beschreibung}', teilVon: 'auftrag', trefferliste: ['nr', 'beschreibung', 'menge', 'preis'], felder: [
    { key: 'auftrag', label: 'Auftrag', typ: 'referenz', zielTypen: [auftrag.id], pflicht: true, verweisart: 'zugehoerigkeit' },
    { key: 'nr', label: 'Nr.', typ: 'zahl' }, { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true },
    { key: 'menge', label: 'Menge', typ: 'zahl' }, { key: 'preis', label: 'Einzelpreis', typ: 'betrag', waehrung: 'EUR' },
  ] } })).daten;
  await api('PUT', `/api/typen/${auftrag.id}`, { cookie, body: { ...auftrag, felder: [...auftrag.felder, { key: 'positionen', label: 'Positionen', typ: 'tabelle', quelle: { typId: position.id, feldKey: 'auftrag', neu: '+ Position' } }] } });
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: auftrag.id, werte: { nr: 'A-1' } } })).daten;
  const positionen = [];
  for (const [nr, beschreibung, menge, betrag] of [[1, 'Ölfilter', 2, 12], [2, 'Inspektion', 1, 189.9]]) {
    positionen.push((await api('POST', '/api/mappen', { cookie, body: { typId: position.id, werte: { auftrag: mappe.id, nr, beschreibung, menge, preis: { betrag, waehrung: 'EUR' } } } })).daten);
  }
  return { auftrag, position, mappe, positionen };
}

/** Typen „Tarifart“ (mit Frist und Hinweis) und „Abo“, das beides beim Auswählen übernimmt; zwei Tarifarten (#1037). */
async function vorbelegenDaten(cookie) {
  const tarifart = (await api('POST', '/api/typen', { cookie, body: { name: 'Tarifart', schluessel: 'tarifart', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' }, { key: 'hinweis', label: 'Hinweis', typ: 'text' },
  ] } })).daten;
  const abo = (await api('POST', '/api/typen', { cookie, body: { name: 'Abo', schluessel: 'abo', titelVorlage: '{bezeichnung}', felder: [
    { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true },
    { key: 'tarifart', label: 'Tarifart', typ: 'referenz', zielTypen: [tarifart.id], vorbelegen: [{ von: 'frist', nach: 'frist' }, { von: 'hinweis', nach: 'notiz' }] },
    { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' }, { key: 'notiz', label: 'Notiz', typ: 'text' },
  ] } })).daten;
  const mobilfunk = (await api('POST', '/api/mappen', { cookie, body: { typId: tarifart.id, werte: { name: 'Mobilfunk', frist: 'P3M', hinweis: 'Rufnummer mitnehmen' } } })).daten;
  const strom = (await api('POST', '/api/mappen', { cookie, body: { typId: tarifart.id, werte: { name: 'Strom', frist: 'P2W', hinweis: 'Zählerstand notieren' } } })).daten;
  return { tarifart, abo, mobilfunk, strom };
}

/** Typ „Mietvertrag“ im Archivmodus, 6 Jahre ab „Beendet am“, leer: läuft noch nicht ab (#1051). */
async function archivDaten(cookie) {
  const typ = (await api('POST', '/api/typen', { cookie, body: { name: 'Mietvertrag', schluessel: 'mietvertrag', titelVorlage: '{objekt}',
    archiv: { jahre: 6, stichtag: 'beendet', leererStichtag: 'laeuftNicht' },
    felder: [{ key: 'objekt', label: 'Mietobjekt', typ: 'text', pflicht: true }, { key: 'beendet', label: 'Beendet am', typ: 'datum' }] } })).daten;
  const laufend = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Lager Gartenstraße' } } })).daten;
  const beendet = (await api('POST', '/api/mappen', { cookie, body: { typId: typ.id, werte: { objekt: 'Garage Hofweg', beendet: '2027-06-30' } } })).daten;
  return { typ, laufend, beendet };
}

/**
 * #1180: Typ „Werkzeug“ mit einer Mappe und der Vorlage „Erinnere mich in 14 Tagen“ (nur dort, Datum als Vorschlag).
 * #1220: Typ „Vertragsart“ mit „In der allgemeinen Suche zeigen: nein“ und der Mappe „Kilometerleasing“.
 */
async function vorschlagDaten(cookie) {
  const werkzeug = (await api('POST', '/api/typen', { cookie, body: { name: 'Werkzeug', schluessel: 'werkzeug', titelVorlage: '{name}', sichtAnlegen: false,
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] } })).daten;
  const mappe = (await api('POST', '/api/mappen', { cookie, body: { typId: werkzeug.id, werte: { name: 'Bohrhammer' } } })).daten;
  const vorlage = (await api('POST', '/api/werkbank/ablaufvorlagen', { cookie, body: { name: 'Erinnere mich in 14 Tagen', typen: [werkzeug.id],
    wann: { art: 'in', anzahl: 14, einheit: 'tage' }, fragen: ['datum', 'text'], karten: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'selbst' }], text: '{eingabe}' }] } })).daten;
  const vertragsart = (await api('POST', '/api/typen', { cookie, body: { name: 'Vertragsart', schluessel: 'vertragsart', titelVorlage: '{name}', sichtAnlegen: false, inSuche: false,
    felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }] } })).daten;
  const leasing = (await api('POST', '/api/mappen', { cookie, body: { typId: vertragsart.id, werte: { name: 'Kilometerleasing' } } })).daten;
  return { werkzeug, mappe, vorlage, vertragsart, leasing };
}
