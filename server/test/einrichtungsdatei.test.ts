/**
 * Einrichtungsassistent: erst sammeln, dann einrichten (#804), und Einrichtung als Konfigurationsdatei (#806).
 * Prüfen und Datei legen nichts an; die Datei hat keine Geheimnisse; Laden und Speichern ergeben dieselbe Datei;
 * Fehler mit Zeile und Feld; nur mit Einrichtungscode und nur vor der Einrichtung; Abschluss erst mit Notfallblatt.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { Einrichtungsplan } from '../../shared/src/einrichtungsplan';
import { Einrichtung, planAusEingabe } from '../src/einrichtung';
import { liesEinrichtungsdatei, schemaText, schreibeEinrichtungsdatei, SCHEMA_DATEI } from '../src/einrichtungsdatei';
import { Einrichtungscode } from '../src/einrichtungscode';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';

const WURZEL = new URL('../..', import.meta.url).pathname;
const DOKU = ['docs/handbuch/admin/docs/einrichtungsdatei', 'docs/handbuch/entwickler/docs/einrichtungsdatei'];

/** Die Beispieldatei aus den Handbüchern – nur Persona-Namen und Beispiel-Domains. */
const BEISPIEL: Einrichtungsplan = {
  datenbank: { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: '${DMS_DB_PASSWORT}' },
  ablage: 'Familie Beispiel',
  konto: { name: 'Lena Beispiel', email: 'lena@example.org', passwort: '${DMS_KONTO_PASSWORT}' },
  nutzung: 'privat',
  pakete: [{ id: 'texterkennung', beispiele: false, automatisierungen: {} }, { id: 'benachrichtigungen', beispiele: false, automatisierungen: {} }],
  optional: {
    adresse: 'https://ablago.example.org', bundesland: 'SN', beispiele: false,
    mail: { aktiv: true, host: 'smtp.example.org', port: 587, verbindung: 'starttls', benutzer: 'ablago@example.org', absender: 'Ablago <ablago@example.org>', selbstsigniert: false, passwort: '${DMS_MAIL_PASSWORT}' },
  },
};

const VOLL: Einrichtungsplan = {
  ...BEISPIEL,
  pakete: [{ id: 'haushalt', beispiele: true, automatisierungen: { 'fristen-erinnern': false, 'abo-pruefen': true } }, { id: 'texterkennung', beispiele: false, automatisierungen: {} }],
};

/** Katrin (#1045): beruflich und zu Hause, mit eigener Organisation – nur der Name ist Pflicht. */
const KATRIN: Einrichtungsplan = {
  ...BEISPIEL, ablage: 'Katrin Beispiel', konto: { name: 'Katrin Beispiel', email: 'katrin@example.org' }, nutzung: 'beides',
  organisation: { name: 'Katrin Beispiel Grafikdesign', strasse: 'Hauptstraße', hausnummer: '5', plz: '12345', ort: 'Musterstadt', email: '', telefon: '' },
  pakete: [{ id: 'basis', beispiele: false, automatisierungen: {} }, { id: 'vertraege', beispiele: false, automatisierungen: {} }],
  optional: { ...BEISPIEL.optional, beruflich: true },
};

const fehlerVon = (text: string) => liesEinrichtungsdatei(text).fehler;

describe('Konfigurationsdatei (#806): Hin und Zurück', () => {
  it('Speichern und Laden ergeben denselben Plan und dieselbe Datei', () => {
    const ohneNutzung: Einrichtungsplan = { ...BEISPIEL, datenbank: null, pakete: null, optional: { adresse: null, bundesland: null, beispiele: false, mail: null } };
    delete ohneNutzung.nutzung;
    const beruflichAlt: Einrichtungsplan = { ...ohneNutzung, optional: { ...ohneNutzung.optional, beruflich: true } };
    for (const p of [BEISPIEL, VOLL, ohneNutzung, beruflichAlt, { ...BEISPIEL, pakete: [] }, KATRIN, { ...KATRIN, nutzung: 'beruflich' as const, organisation: undefined }]) {
      if (!p.organisation) delete p.organisation;
      const text = schreibeEinrichtungsdatei(p);
      const r = liesEinrichtungsdatei(text);
      assert.deepEqual(r.fehler, []);
      assert.deepEqual(r.plan, { ...p, pakete: p.pakete?.map((x) => ({ ...x, automatisierungen: Object.fromEntries(Object.entries(x.automatisierungen).sort(([a], [b]) => a.localeCompare(b))) })) ?? null });
      assert.equal(schreibeEinrichtungsdatei(r.plan!), text, 'dieselbe Datei');
    }
  });

  it('Kopfzeile mit Formatversion, kurze Kommentare, Verweis aufs Schema', () => {
    const text = schreibeEinrichtungsdatei(BEISPIEL);
    assert.match(text, /^ablago-einrichtung: 1$/m);
    assert.match(text, /^# Ohne Passwörter und ohne Schlüssel/m);
    assert.match(text, /^# Aufbau: https:\/\/help\.ablago\.app\/admin\/aktuell\/einrichtungsdatei\/ablago-einrichtung-1\.schema\.json$/m);
    assert.match(text, /^# Dein Konto: richtet Ablago ein/m);
    assert.doesNotMatch(text, /administrator|erster-benutzer/, '#821: nur noch „konto“');
  });

  it('JSON geht auch (gültiges JSON ist gültiges YAML)', () => {
    const r = liesEinrichtungsdatei(JSON.stringify({ 'ablago-einrichtung': 1, ablage: 'Büro Brandt', konto: { email: 'markus@example.com' } }));
    assert.deepEqual(r.fehler, []);
    assert.equal(r.plan?.ablage, 'Büro Brandt');
    assert.deepEqual(r.plan?.konto, { name: '', email: 'markus@example.com' });
    assert.equal(r.plan?.pakete, null, 'ohne Liste: im Assistenten wählen');
  });
});

describe('Konfigurationsdatei: Nutzung und eigene Organisation (#1045)', () => {
  it('„nutzung“ setzt das Merkmal; „organisation“ nur mit Name, nur ausgefüllte Angaben in der Datei', () => {
    const text = schreibeEinrichtungsdatei(KATRIN);
    assert.match(text, /^# Wofür Ablago genutzt wird.*\nnutzung: beides$/m);
    assert.match(text, /^organisation:\n {2}name: Katrin Beispiel Grafikdesign\n {2}strasse: Hauptstraße\n {2}hausnummer: "5"\n {2}plz: "12345"\n {2}ort: Musterstadt\n#/m);
    assert.doesNotMatch(text, /beruflich: true/, 'das Merkmal steht in „nutzung“');
    const privat = liesEinrichtungsdatei('ablago-einrichtung: 1\nablage: X\nkonto: { email: a@example.org }\nnutzung: privat\n').plan!;
    assert.deepEqual([privat.nutzung, privat.optional.beruflich], ['privat', undefined]);
    assert.equal(liesEinrichtungsdatei('ablago-einrichtung: 1\nablage: X\nkonto: { email: a@example.org }\nnutzung: beruflich\n').plan!.optional.beruflich, true);
  });

  it('Widersprüche und fehlende Angaben mit Zeile und Feld', () => {
    const kopf = 'ablago-einrichtung: 1\nablage: X\nkonto: { email: a@example.org }\n';
    const f1 = fehlerVon(`${kopf}nutzung: privat\noptionales:\n  beruflich: true\n`);
    assert.deepEqual(f1.map((x) => `${x.zeile} ${x.feld}`), ['6 optionales.beruflich']);
    assert.match(f1[0].text, /nutzung: privat/);
    assert.deepEqual(fehlerVon(`${kopf}nutzung: beides\noptionales:\n  beruflich: true\n`), [], 'passt – darf doppelt stehen');
    const f2 = fehlerVon(`${kopf}nutzung: privat\norganisation:\n  name: Tischlerei Brandt\n`);
    assert.deepEqual(f2.map((x) => `${x.zeile} ${x.feld}`), ['5 organisation']);
    assert.match(f2[0].text, /nur bei/);
    assert.deepEqual(fehlerVon(`${kopf}nutzung: beruflich\norganisation:\n  ort: Musterstadt\n`).map((x) => x.feld), ['organisation.name']);
    assert.deepEqual(fehlerVon(`${kopf}nutzung: firma\n`).map((x) => x.feld), ['nutzung']);
    assert.deepEqual(fehlerVon(`${kopf}nutzung: beruflich\norganisation:\n  name: X\n  email: kein-at\n`).map((x) => x.feld), ['organisation.email']);
  });

  it('Prüfen: Name der Organisation, gültige E-Mail, nur bei beruflicher Nutzung, Paket Basis Pflicht', async () => {
    const { e } = await neueEinrichtung();
    const pw = { passwort: 'ein-langes-passwort' };
    assert.deepEqual(e.pruefePlan(KATRIN, pw), {});
    const ohneBasis = e.pruefePlan({ ...KATRIN, pakete: [{ id: 'haushalt', beispiele: false, automatisierungen: {} }] }, pw);
    assert.deepEqual(Object.keys(ohneBasis), ['pakete']);
    assert.match(ohneBasis.pakete![0], /Paket Basis/);
    assert.match(e.pruefePlan({ ...KATRIN, pakete: null }, pw).pakete![0], /Paket Basis/, 'übersprungen zählt nicht');
    const p = e.pruefePlan({ ...KATRIN, organisation: { ...KATRIN.organisation!, name: '', email: 'kein-at' } }, pw);
    assert.equal(p.nutzung!.length, 2);
    assert.match(e.pruefePlan({ ...KATRIN, nutzung: 'privat' }, pw).nutzung![0], /nur bei beruflicher/);
    // Ohne Organisation ist Basis keine Pflicht; „nutzung“ bestimmt das Merkmal, auch gegen `optional.beruflich`.
    assert.deepEqual(e.pruefePlan({ ...BEISPIEL, pakete: [] }, pw), {});
    assert.equal(planAusEingabe({ ...BEISPIEL, optional: { ...BEISPIEL.optional, beruflich: true } }).optional.beruflich, undefined);
    assert.equal(planAusEingabe({ ...BEISPIEL, nutzung: 'firma', optional: { ...BEISPIEL.optional, beruflich: true } }).optional.beruflich, true);
  });
});

describe('Konfigurationsdatei (#806): keine Geheimnisse', () => {
  it('ein Passwort im Klartext wird abgelehnt – mit Zeile und Feld', () => {
    const f = fehlerVon('ablago-einrichtung: 1\nablage: Familie Beispiel\nkonto:\n  email: lena@example.org\n  passwort: geheim123\n');
    assert.equal(f.length, 1);
    assert.deepEqual([f[0].zeile, f[0].feld], [5, 'konto.passwort']);
    assert.match(f[0].text, /Passwörter gehören nicht in die Datei/);
    assert.equal(fehlerVon('ablago-einrichtung: 1\nablage: X\nkonto:\n  email: a@example.org\n  passwort: ${DMS_KONTO_PASSWORT}\n').length, 0, 'Verweis geht');
  });

  it('ein Schlüssel hat keinen Platz in der Datei', () => {
    const f = fehlerVon('ablago-einrichtung: 1\nablage: X\nkonto:\n  email: a@example.org\nschluessel: AAAA\n');
    assert.deepEqual(f.map((x) => [x.zeile, x.feld]), [[5, 'schluessel']]);
    assert.match(f[0].text, /Unbekanntes Feld/);
  });

  it('beim Schreiben bleiben nur Verweise – Passwörter aus der Oberfläche fallen weg', () => {
    const p = planAusEingabe({ ...BEISPIEL, konto: { ...BEISPIEL.konto, passwort: 'ein-langes-passwort' }, optional: { ...BEISPIEL.optional, mail: { ...BEISPIEL.optional.mail, passwort: 'mailgeheim' } } });
    const text = schreibeEinrichtungsdatei(p);
    assert.doesNotMatch(text, /ein-langes-passwort|mailgeheim/);
    assert.match(text, /passwort: \$\{DMS_DB_PASSWORT\}/);
    assert.doesNotMatch(text, /DMS_KONTO_PASSWORT|DMS_MAIL_PASSWORT/);
  });
});

describe('Konfigurationsdatei (#806): Prüfung gegen das Schema', () => {
  it('verständliche Fehler mit Zeile und Feld', () => {
    const f = fehlerVon([
      'ablago-einrichtung: 1', 'ablage: ""', 'konto:', '  name: Lena', 'pakete:', '  - id: texterkennung', '  - name: Ohne Id',
      'optionales:', '  bundesland: XX', '  adresse: ftp://nas', '  e-mail:', '    server: smtp.example.org', '    port: 70000',
    ].join('\n'));
    const kurz = f.map((x) => `${x.zeile} ${x.feld}`);
    assert.deepEqual(kurz, ['2 ablage', '3 konto.email', '7 pakete[1].id', '7 pakete[1].name', '9 optionales.bundesland', '10 optionales.adresse', '13 optionales.e-mail.port']);
    assert.match(f[0].text, /nicht leer/);
    assert.match(f[1].text, /Pflicht/);
    assert.match(f[3].text, /Unbekanntes Feld/);
    assert.match(f[4].text, /Erlaubt sind: BW/);
    assert.match(f[5].text, /http:\/\//);
    assert.match(f[6].text, /1 bis 65535/);
    const mail = fehlerVon('ablago-einrichtung: 1\nablage: X\nkonto:\n  email: kein-at\n');
    assert.deepEqual([mail[0].zeile, mail[0].feld], [4, 'konto.email']);
    assert.match(mail[0].text, /E-Mail-Adresse/);
  });

  it('falsche Version, falsche Art, kaputtes YAML, leere Datei', () => {
    assert.match(fehlerVon('ablago-einrichtung: 2\nablage: X\nkonto: { email: a@example.org }\n')[0].text, /Formatversion/);
    const typ = fehlerVon('ablago-einrichtung: 1\nablage: X\nkonto: a@example.org\n')[0];
    assert.deepEqual([typ.zeile, typ.feld], [3, 'konto']);
    assert.match(typ.text, /Abschnitt mit Feldern/);
    const kaputt = fehlerVon('ablago-einrichtung: 1\nablage: [X\nkonto:\n');
    assert.equal(kaputt[0].feld, 'Datei');
    assert.ok(kaputt[0].zeile && kaputt[0].zeile >= 2);
    assert.match(kaputt[0].text, /Kein gültiges YAML/);
    assert.match(fehlerVon('   ')[0].text, /leer/);
    assert.match(fehlerVon('ablago-einrichtung: 1\nablage: X\nablage: Y\nkonto: { email: a@example.org }\n')[0].text, /YAML/, 'doppelte Schlüssel');
  });

  it('#821: Dateien aus 0.191/0.192 – „administrator“ gilt als „Dein Konto“, „erster-benutzer“ fällt mit Hinweis weg', () => {
    const alt = 'ablago-einrichtung: 1\nablage: Familie Beispiel\nadministrator:\n  name: Lena\n  email: lena@example.org\n  passwort: ${DMS_ADMIN_PASSWORT}\nerster-benutzer:\n  name: Jonas\n  email: jonas@example.org\n';
    const r = liesEinrichtungsdatei(alt);
    assert.deepEqual(r.fehler, []);
    assert.deepEqual(r.plan?.konto, { name: 'Lena', email: 'lena@example.org', passwort: '${DMS_ADMIN_PASSWORT}' });
    assert.equal(r.hinweise.length, 1);
    assert.match(r.hinweise[0], /ersten Benutzer \(Jonas\).*Werkbank → Benutzer/);
    assert.doesNotMatch(schreibeEinrichtungsdatei(r.plan!), /administrator|erster-benutzer|Jonas/, 'gespeichert wird nur noch „konto“');
    // Fehler stehen mit dem Namen, den die Datei nutzt.
    const f = fehlerVon('ablago-einrichtung: 1\nablage: X\nadministrator:\n  email: kein-at\n');
    assert.deepEqual([f[0].zeile, f[0].feld], [4, 'administrator.email']);
    assert.deepEqual(fehlerVon('ablago-einrichtung: 1\nablage: X\n').map((x) => x.feld), ['konto'], 'ohne beides fehlt „konto“');
  });

  it('Schema und Beispieldatei in Administrator- und Entwicklerhandbuch, versioniert und aktuell', () => {
    for (const d of DOKU) {
      assert.equal(readFileSync(join(WURZEL, d, SCHEMA_DATEI), 'utf8'), schemaText(), `${d}/${SCHEMA_DATEI} – neu erzeugen`);
      const beispiel = readFileSync(join(WURZEL, d, 'beispiel.yaml'), 'utf8');
      assert.equal(beispiel, schreibeEinrichtungsdatei(BEISPIEL), `${d}/beispiel.yaml – neu erzeugen`);
      assert.deepEqual(liesEinrichtungsdatei(beispiel).fehler, []);
      assert.ok(readFileSync(join(WURZEL, `${d}.md`), 'utf8').includes(`\`\`\`yaml\n${beispiel}\`\`\``), `${d}.md zeigt das Beispiel`);
    }
    const schema = JSON.parse(schemaText()) as { $id: string; required: string[]; properties: Record<string, unknown> };
    assert.match(schema.$id, /ablago-einrichtung-1\.schema\.json$/);
    assert.deepEqual(schema.required, ['ablago-einrichtung', 'ablage', 'konto']);
    assert.ok(!('administrator' in schema.properties) && !('erster-benutzer' in schema.properties), '#821: nur „Dein Konto“');
  });
});

const ordner = () => mkdtemp(join(tmpdir(), 'a803-einrichtung-'));
async function neueEinrichtung(o: { notfallblatt?: () => boolean } = {}) {
  const code = new Einrichtungscode(await ordner());
  const c = await code.bereitstellen();
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas');
  let name: string | null = null;
  const e = new Einrichtung({
    konten, code, einstellungen: speicherEinstellungen(), mandant: { name: async () => name, umbenennen: async (n) => { name = n; } }, schriftzug: async () => {},
    datenbank: () => ({ host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms' }),
    ...(o.notfallblatt ? { notfallblattAktuell: async () => o.notfallblatt!() } : {}),
  });
  return { e, c, konten };
}

describe('Erst sammeln, dann einrichten (#804)', () => {
  it('Prüfen je Schritt legt nichts an; Gründe stehen beim passenden Schritt', async () => {
    const { e, konten } = await neueEinrichtung();
    const p = e.pruefePlan({ ...BEISPIEL, ablage: '', optional: { ...BEISPIEL.optional, adresse: 'http://nas/?x=1' } });
    assert.deepEqual(Object.keys(p).sort(), ['ablage', 'konto', 'optional']);
    assert.match(p.konto![0], /Passwort für dein Konto/, 'Passwort steht nie in der Datei – der Assistent fragt');
    assert.match(p.optional![0], /keine Parameter/);
    assert.deepEqual(e.pruefePlan(BEISPIEL, { passwort: 'ein-langes-passwort' }), {});
    assert.match(e.pruefePlan(BEISPIEL, { passwort: 'kurz' }).konto![0], /mindestens/);
    assert.match(e.pruefePlan({ ...BEISPIEL, konto: { name: 'Lena', email: 'kein-at' } }, { passwort: 'ein-langes-passwort' }).konto![0], /E-Mail/);
    // Ein Plan aus der Oberfläche von 0.192 („administrator“) gilt weiter als „Dein Konto“.
    assert.deepEqual(planAusEingabe({ ...BEISPIEL, konto: undefined, administrator: { name: 'Lena', email: 'lena@example.org' } }).konto, { name: 'Lena', email: 'lena@example.org' });
    assert.equal(await konten.einrichtungNoetig(), true, 'nichts angelegt');
  });

  it('Datei schreiben nimmt die verbundene Datenbank und behält Verweise; Lesen meldet eine andere Datenbank', async () => {
    const { e } = await neueEinrichtung();
    const { text, name } = e.dateiSchreiben({ ...BEISPIEL, datenbank: { host: 'anders', port: 1, datenbank: 'x', benutzer: 'y', passwort: '${DMS_DB_PASSWORT}' } });
    assert.equal(name, 'ablago-einrichtung.yaml');
    assert.match(text, /rechner: db\n  port: 5432\n  name: dms\n  benutzer: dms\n  passwort: \$\{DMS_DB_PASSWORT\}/);
    const r = e.dateiLesen(schreibeEinrichtungsdatei({ ...BEISPIEL, datenbank: { host: 'nas', port: 5433, datenbank: 'ablago', benutzer: 'ablago' } }));
    assert.match(r.hinweise[0], /ablago@nas:5433\/ablago.*dms@db:5432\/dms/);
  });

  it('nur mit Code und nur vor der Einrichtung; danach der Administrator, solange der Assistent offen ist', async () => {
    const { e, c } = await neueEinrichtung();
    await assert.rejects(e.pruefeZugang(undefined, false), /Einrichtungscode eingeben/);
    await assert.rejects(e.pruefeZugang('AAAA-AAAA-AAAA', false), /stimmt nicht/);
    await e.pruefeZugang(c, false);
    await e.einrichten({ mandant: 'Familie Beispiel', name: 'Admin', email: 'admin@example.org', passwort: 'ein-langes-passwort' }, c, { ip: '1', geraet: '' });
    await assert.rejects(e.pruefeZugang(c, false), /bereits abgeschlossen/);
    await e.pruefeZugang(undefined, true);
    await e.merke('fertig', false, 'admin');
    await assert.rejects(e.pruefeZugang(undefined, true), /bereits abgeschlossen/, 'nach dem Abschluss auch für den Administrator zu');
  });

  it('„Einrichtung abschließen“ erst mit heruntergeladenem Notfallblatt', async () => {
    let geladen = false;
    const { e, c } = await neueEinrichtung({ notfallblatt: () => geladen });
    await e.einrichten({ mandant: 'Familie Beispiel', name: 'Admin', email: 'admin@example.org', passwort: 'ein-langes-passwort' }, c, { ip: '1', geraet: '' });
    await e.merke('schluessel', false, 'admin');
    await assert.rejects(e.merke('fertig', false, 'admin'), /Notfallblatt/);
    assert.equal((await e.stand()).offen, true);
    geladen = true;
    assert.equal((await e.merke('fertig', false, 'admin')).offen, false);
  });
});

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);

describe('Schnittstellen des Assistenten über HTTP (#804, #806)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  it('Code nötig, nichts angelegt, Datei hin und zurück; nach der Einrichtung zu', async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const code = new Einrichtungscode(await ordner());
    const c = await code.bereitstellen();
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    const einrichtung = new Einrichtung({ konten, code, einstellungen: speicherEinstellungen(), mandant: { name: async () => null, umbenennen: async () => {} }, datenbank: () => ({ host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms' }) });
    const app = await baueApp(dienst, konten, { einrichtung }) as unknown as { inject(o: object): Promise<{ statusCode: number; body: string; headers: Record<string, unknown> }>; close(): Promise<void> };
    try {
      const post = (url: string, payload: unknown, kopf: Record<string, string> = { 'x-einrichtungscode': c }) => app.inject({ method: 'POST', url, headers: { 'x-dms': '1', ...kopf }, payload });
      assert.equal((await post('/api/einrichtung/pruefen', { plan: BEISPIEL }, {})).statusCode, 403);
      assert.equal((await post('/api/einrichtung/datei/lesen', { text: 'x' }, { 'x-einrichtungscode': 'AAAA-AAAA-AAAA' })).statusCode, 403);
      const pr = JSON.parse((await post('/api/einrichtung/pruefen', { plan: BEISPIEL, passwort: 'ein-langes-passwort' })).body);
      assert.deepEqual(pr.probleme, {});
      const geschrieben = JSON.parse((await post('/api/einrichtung/datei/schreiben', { plan: BEISPIEL })).body) as { text: string };
      const gelesen = JSON.parse((await post('/api/einrichtung/datei/lesen', { text: geschrieben.text })).body) as { plan: Einrichtungsplan; fehler: unknown[] };
      assert.deepEqual(gelesen.fehler, []);
      assert.deepEqual(gelesen.plan, BEISPIEL);
      assert.equal(await konten.einrichtungNoetig(), true, 'bis „Jetzt einrichten“ ist nichts angelegt');
      const e = await post('/api/konto/einrichten', { mandant: 'Familie Beispiel', name: 'Admin', email: 'admin@example.org', passwort: 'ein-langes-passwort' });
      assert.equal(e.statusCode, 201);
      const cookie = String(e.headers['set-cookie']).split(';')[0];
      assert.equal((await post('/api/einrichtung/pruefen', { plan: BEISPIEL })).statusCode, 409, 'Code allein reicht nicht mehr');
      assert.equal((await post('/api/einrichtung/pruefen', { plan: BEISPIEL }, { cookie })).statusCode, 200, 'Gesamte Verwaltung, Assistent offen (Ändern nach Fehler)');
      // #818: „Jetzt einrichten“ beginnt gleich im Verwaltungsmodus; die Person hat „Gesamte Verwaltung“.
      const st = JSON.parse((await app.inject({ method: 'GET', url: '/api/konto/status', headers: { 'x-dms': '1', cookie } })).body);
      assert.deepEqual([st.verwaltungsmodus.aktiv, st.benutzer.rolle, st.benutzer.verwaltung, st.einrichtung.assistent], [true, 'admin', ['*'], true]);
      // Wer nur einzelne Bereiche verwaltet, ist für den Assistenten kein „Administrator“ – auch im Verwaltungsmodus nicht.
      const ich = (await konten.listeBenutzer())[0];
      const teil = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas', verwaltung: ['benutzer'] }, ich.id);
      await konten.passwortSetzen({ schluessel: teil.link!.split('/passwort/')[1], passwort: 'ein-langes-passwort' });
      const an = await post('/api/konto/anmelden', { email: 'jonas@example.org', passwort: 'ein-langes-passwort' }, {});
      const jonas = String(an.headers['set-cookie']).split(';')[0];
      assert.equal((await post('/api/konto/verwaltung', {}, { cookie: jonas })).statusCode, 200);
      assert.equal((await post('/api/einrichtung/pruefen', { plan: BEISPIEL }, { cookie: jonas })).statusCode, 409, 'nur „Gesamte Verwaltung“');
      await einrichtung.merke('fertig', false, 'admin');
      assert.equal((await post('/api/einrichtung/datei/lesen', { text: geschrieben.text }, { cookie })).statusCode, 409);
    } finally { await app.close(); }
  });
});
