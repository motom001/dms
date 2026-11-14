/**
 * Rauchtests: Dreiteilung fest im Fenster (#1063), Werte vorschlagen, Systemzustand, Passkey, Ansichten-Baum.
 * Allein starten (frisch gestartetes Ablago, siehe rauchtest.mjs): node web/rauchtest/bereiche/dreiteilung-und-systemzustand.mjs [fehlerordner] [musterordner]
 */
import assert from 'node:assert/strict';
import '../einrichtung.mjs';
import { api, BASIS, daten, LENA, rauchtest, sitzung, verwalten } from '../hilfen.mjs';

/* ---------- Dreiteilung fest im Fenster (#1063) ---------- */

/**
 * Die Dreiteilung steht fest im Fenster (#1063): Nur die Spalten rollen, nie die Seite unter ihnen. Rollt die rechte
 * Spalte ans Ende; dann ist die Seite genau so hoch wie das Fenster. Die rechte Spalte muss dafür länger sein als ihr
 * Platz – sonst prüft der Test nichts.
 */
async function dreiteilungSteht(s, wo) {
  const r = await s.evaluate(() => {
    const rechts = document.querySelector('.drei .spalte.mappe');
    rechts.scrollTop = rechts.scrollHeight;
    return { seite: document.scrollingElement.scrollHeight, fenster: innerHeight, spalte: rechts.scrollHeight, platz: rechts.clientHeight };
  });
  assert.ok(r.spalte > r.platz + 50, `${wo}: Die rechte Spalte ist nicht länger als ihr Platz (${r.spalte} / ${r.platz} px) – der Test prüft so nichts`);
  assert.equal(r.seite, r.fenster, `${wo}: Die Seite rollt unter der Dreiteilung weiter (Seite ${r.seite} px, Fenster ${r.fenster} px)`);
}

rauchtest('Ablage und Werkbank: Die Seite rollt nicht unter der Dreiteilung, versteckte Beschriftungen bleiben lesbar (#1063)', { als: LENA }, async (s) => {
  await s.setViewportSize({ width: 1366, height: 640 });
  const mappeOeffnen = async () => {
    await s.goto(BASIS + '/ablage/start');
    await s.getByRole('complementary', { name: 'Ansichten' }).getByRole('link', { name: /^Vertrag \d/ }).click();
    await s.getByRole('region', { name: 'Mappen' }).getByRole('link', { name: /Stromvertrag Haus/ }).first().click();
    await s.getByRole('region', { name: 'Mappe' }).getByRole('button', { name: 'Mappe speichern' }).waitFor();
    await s.waitForLoadState('networkidle');
  };
  // Ablage: eine Mappe rechts, ohne und mit Verwaltungsmodus (roter Balken oben).
  await mappeOeffnen();
  await dreiteilungSteht(s, 'Ablage → Mappe');
  await verwalten(s);
  await mappeOeffnen();
  await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor();
  await dreiteilungSteht(s, 'Ablage → Mappe im Verwaltungsmodus');
  // Werkbank → Automatisierungen: In „Ausprobieren“ steht die versteckte Beschriftung „Mappe suchen …“.
  await s.goto(BASIS + '/werkbank/automatisierungen');
  await s.getByRole('region', { name: 'Elemente' }).getByRole('link', { name: /Rauchtest Vertrag angelegt/ }).click();
  const bearbeitung = s.getByRole('region', { name: 'Bearbeitung' });
  // „Ausprobieren“ ist ein Bereich (#1000): über die Sprungleiste aufklappen.
  await bearbeitung.getByRole('navigation', { name: 'Bereiche der Automatisierung' }).getByRole('button', { name: 'Ausprobieren' }).click();
  const suche = bearbeitung.getByLabel('Mappe suchen …');
  await suche.waitFor();
  await s.waitForLoadState('networkidle');
  await dreiteilungSteht(s, 'Werkbank → Automatisierung');
  // Gegenprobe: Die Beschriftungen bleiben unsichtbar, aber im Barrierefreiheitsbaum – auch die der Marke oben.
  const beschriftung = bearbeitung.locator('label[for="ausprobieren-mappe"]');
  const kasten = await beschriftung.boundingBox();
  assert.ok(kasten && kasten.width <= 1 && kasten.height <= 1, `Die Beschriftung „Mappe suchen …“ ist zu sehen (${JSON.stringify(kasten)})`);
  assert.equal(await suche.count(), 1, 'Das Suchfeld ist über seine versteckte Beschriftung zu finden');
  await s.getByRole('banner').getByRole('link', { name: /– Startseite$/ }).waitFor();
});

// #1037: Beim Auswählen übernehmen – Vorschläge nur in leere Felder, markiert; eine andere Wahl ersetzt nur Unberührtes.
rauchtest('Werte aus der gewählten Mappe vorschlagen (#1037)', { als: LENA }, async (s) => {
  const { abo } = daten.vorbelegen;
  await s.goto(BASIS + `/ablage/${abo.id}/neu`);
  const mappe = s.getByRole('region', { name: 'Mappe' });
  await mappe.getByRole('heading', { name: 'Neue Mappe', level: 1 }).waitFor();
  await mappe.getByRole('textbox', { name: 'Bezeichnung', exact: true }).fill('Handy Lena');
  const tarifart = mappe.locator('[data-anker="mappe.feld:tarifart"]');
  await tarifart.getByRole('combobox').fill('Mobil');
  await tarifart.getByRole('option', { name: 'Mobilfunk' }).click();
  const notiz = mappe.locator('[data-anker="mappe.feld:notiz"]');
  const frist = mappe.locator('[data-anker="mappe.feld:frist"]');
  await notiz.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor();
  await frist.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor();
  assert.equal(await notiz.getByRole('textbox').inputValue(), 'Rufnummer mitnehmen');
  // Selbst geändert: bleibt, auch wenn eine andere Tarifart kommt; die unberührte Frist wechselt.
  await notiz.getByRole('textbox').fill('Vertrag läuft über Jonas');
  await notiz.getByText('vorgeschlagen aus Tarifart Mobilfunk').waitFor({ state: 'detached' });
  await tarifart.getByRole('button', { name: 'Ändern' }).click();
  await tarifart.getByRole('combobox').fill('Strom');
  await tarifart.getByRole('option', { name: 'Strom' }).click();
  await frist.getByText('vorgeschlagen aus Tarifart Strom').waitFor();
  assert.equal(await notiz.getByRole('textbox').inputValue(), 'Vertrag läuft über Jonas');
  await mappe.getByRole('button', { name: 'Mappe speichern' }).click();
  await s.waitForURL(new RegExp(`/ablage/${abo.id}/[0-9a-f-]{36}$`));
  const id = s.url().split('/').pop();
  const gespeichert = (await api('GET', `/api/mappen/${id}`, { cookie: await sitzung(LENA) })).daten.mappe.werte;
  assert.deepEqual([gespeichert.frist, gespeichert.notiz], [{ anzahl: 2, einheit: 'wochen' }, 'Vertrag läuft über Jonas']);
});

// Externe Dienste und KI-Kosten (#565): Systemzustand zeigt beide Abschnitte; Zeitraum umschalten, Monatsbudget mit harter
// Grenze speichern und wieder leeren (ohne KI-Paket ohne Wirkung).
rauchtest('Systemzustand: Externe Dienste und KI-Kosten, Monatsbudget speichern (#565)', { als: LENA, erwartet: [{ status: 409, pfad: /^\/api\/wiederherstellung\/sicherungen$/ }] }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  await verwalten(s);
  await s.goto(BASIS + '/werkbank/systemzustand');
  const extern = s.locator('#externe-dienste');
  await extern.getByRole('heading', { name: 'Externe Dienste' }).waitFor();
  await extern.getByRole('button', { name: 'Letzte Stunde' }).click();
  await extern.getByText(/In der letzten Stunde hat Ablago keinen externen Dienst aufgerufen|Aufrufe/).first().waitFor();
  const kosten = s.locator('#ki-kosten');
  await kosten.getByRole('heading', { name: 'KI-Kosten und Budget' }).waitFor();
  await kosten.getByLabel(/^Monatsbudget/).fill('20');
  await kosten.getByLabel(/^Harte Grenze/).check();
  await kosten.getByRole('button', { name: /speichern$/ }).click();
  await kosten.getByText('Gespeichert.', { exact: true }).first().waitFor();
  assert.equal(await kosten.getByLabel(/^Monatsbudget/).inputValue(), '20');
  assert.ok(await kosten.getByLabel(/^Harte Grenze/).isChecked());
  await kosten.getByLabel(/^Monatsbudget/).fill('');
  await kosten.getByRole('button', { name: /speichern$/ }).click();
  await s.waitForFunction(() => document.querySelector('#ki-kosten-budget')?.value === '' && !document.querySelector('#ki-kosten-hart')?.checked);
});

// Passkeys (#811): Chromium mit einem virtuellen Authenticator (DevTools-Protokoll, Fingerabdruck „ja“). Lena fügt in Mein
// Konto → Sicherheit einen Passkey hinzu, meldet sich ab und mit dem Passkey wieder an (ohne E-Mail-Adresse) und entfernt
// ihn – die Anmeldung mit Passkey ist frisch, also ohne erneute Abfrage. Am Ende ist kein Passkey mehr da.
rauchtest('Passkey: hinzufügen, damit anmelden, entfernen (#811)', { als: LENA }, async (s, k) => {
  const cdp = await k.newCDPSession(s);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await s.goto(BASIS + '/profil/sicherheit');
  const blatt = s.locator('#passkeys');
  await blatt.getByRole('heading', { name: 'Passkeys' }).waitFor();
  await blatt.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await blatt.getByLabel('Name').fill('Rauchtest-Laptop');
  await blatt.getByRole('button', { name: 'Weiter' }).click();
  await blatt.getByText(/„Rauchtest-Laptop“ ist hinzugefügt/).waitFor();
  await blatt.getByText('Rauchtest-Laptop', { exact: true }).waitFor();
  // Abmelden, dann mit dem Passkey wieder hinein.
  await k.clearCookies();
  await s.goto(BASIS + '/');
  await s.getByRole('heading', { name: 'Anmelden' }).waitFor();
  await s.getByRole('button', { name: 'Mit Passkey anmelden' }).click();
  await s.getByRole('heading', { name: 'Guten Tag, Lena', level: 1 }).waitFor();
  await s.goto(BASIS + '/profil/sicherheit');
  await blatt.getByText(/zuletzt benutzt am/).waitFor();
  await blatt.getByRole('button', { name: 'Entfernen' }).click();
  await s.getByRole('alertdialog', { name: '„Rauchtest-Laptop“ entfernen?' }).getByRole('button', { name: 'Entfernen' }).click();
  await blatt.getByText('Rauchtest-Laptop', { exact: true }).waitFor({ state: 'detached' });
});

// Baum der Ansichten ohne Neuladen (#888): Eine für alle gesperrte Ansicht (R entzogen) sieht Lena nur im
// Verwaltungsmodus. Beginnen und Beenden des Modus und Änderungen an Ansichten aus einer anderen Sitzung zeigt der Baum
// sofort bzw. nach dem nächsten Nachfragen (#919) – ohne F5. Ein Link auf einen Mappentyp zeigt „Alle Mappen: …“.
rauchtest('Ansichten: Baum ohne Neuladen nach Verwaltungsmodus und Änderungen (#888)', { als: LENA }, async (s) => {
  const verwaltung = await sitzung(LENA);
  await api('POST', '/api/konto/verwaltung', { cookie: verwaltung, body: { passwort: LENA.passwort } });
  const vertrag = (await api('GET', '/api/typen', { cookie: verwaltung })).daten.find((x) => x.name === 'Vertrag');
  const gesperrt = { grund: { R: false, C: false, E: false }, regeln: [] };
  const sicht = (await api('POST', '/api/sichten/definitionen', { cookie: verwaltung, body: { name: 'Rauchtest gesperrt', typen: [vertrag.id], berechtigungen: gesperrt } })).daten;
  try {
    const baum = s.getByRole('complementary', { name: 'Ansichten' });
    const eintrag = (name) => baum.getByRole('link', { name: new RegExp(`^${name}`) });
    await s.goto(BASIS + '/ablage/start');
    await eintrag('Vertrag').first().waitFor();
    assert.equal(await eintrag('Rauchtest gesperrt').count(), 0, 'gesperrte Ansicht ohne Verwaltungsmodus nicht im Baum');
    // Im Verwaltungsmodus erscheint sie, nach „Verwaltung beenden“ ist sie wieder weg – ohne Neuladen.
    await verwalten(s);
    await s.getByRole('navigation', { name: 'Bereiche' }).getByRole('link', { name: 'Ablage' }).click();
    await eintrag('Rauchtest gesperrt').waitFor();
    await s.getByRole('button', { name: 'Verwaltung beenden' }).click();
    await s.getByRole('region', { name: 'Du verwaltest gerade Ablago.' }).waitFor({ state: 'detached' });
    await eintrag('Rauchtest gesperrt').waitFor({ state: 'detached' });
    // Eine andere Sitzung gibt die Ansicht frei und benennt sie um: Der Baum holt den neuen Stand selbst.
    await api('PUT', `/api/sichten/definitionen/${sicht.id}`, { cookie: verwaltung, body: { name: 'Rauchtest offen', typen: [vertrag.id], berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [] } } });
    await eintrag('Rauchtest offen').waitFor({ timeout: 40_000 });
    // Ist die Ansicht des Mappentyps (gleiche Id) gesperrt, zeigt ein Link auf den Mappentyp – wie nach einem Klick auf
    // eine Erwähnung – klar die Liste des Mappentyps, nicht die gesperrte Ansicht.
    const typSicht = (await api('GET', '/api/sichten/definitionen', { cookie: verwaltung })).daten.find((x) => x.id === vertrag.id);
    await api('PUT', `/api/sichten/definitionen/${vertrag.id}`, { cookie: verwaltung, body: { ...typSicht, name: 'Rauchtest Verträge gesperrt', berechtigungen: gesperrt } });
    try {
      await s.goto(BASIS + `/ablage/${vertrag.id}`);
      const liste = s.getByRole('region', { name: 'Mappen' });
      await liste.getByRole('heading', { name: /^Alle Mappen: Vertrag/, level: 1 }).waitFor();
      await liste.getByRole('link', { name: /Stromvertrag Haus/ }).first().waitFor();
      assert.equal(await s.getByText('Rauchtest Verträge gesperrt').count(), 0, 'kein Name der gesperrten Ansicht');
    } finally {
      await api('PUT', `/api/sichten/definitionen/${vertrag.id}`, { cookie: verwaltung, body: typSicht });
    }
  } finally {
    await api('DELETE', `/api/sichten/definitionen/${sicht.id}`, { cookie: verwaltung });
  }
});
