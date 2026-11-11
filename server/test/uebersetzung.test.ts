/**
 * Inhalte übersetzen auf Knopfdruck (#732): Recht dms:uebersetzen, Abschalten für alle und für sich, Kennzeichnung,
 * Abschnitte, nur das Original wird gespeichert, Zwischenspeicher mit Verfall, Rechte (nur Lesbares, nur der eine Text),
 * Datenabfluss nur mit Bestätigung (#701) und ein kleines Test-Paket im echten Paket-Läufer.
 * Namen und Texte sind erfunden. TEST_DATABASE_URL – zusätzlich mit PostgreSQL (Spalte, Kurzzustand).
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { HILFE } from '../../shared/src/hilfe';
import { liesCode, rechtePunkte, SCHNITTSTELLEN, type InstalliertesPaket } from '../../shared/src/pakete';
import { ABSCHNITT_MAX, abschnitte, kennzeichnung, liesUebersetzenEinstellung, spracheAusTesseract, UEBERSETZEN_TEXT_MAX } from '../../shared/src/uebersetzung';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { speicherKurzzustand, type Kurzzustand } from '../src/kurzzustand';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { liesPaket } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { liesAntwort, liesQuelle, ZWISCHENSPEICHER } from '../src/uebersetzung';
import { pdfMitText } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));

const BRIEF = 'Sehr geehrte Frau Beispiel,\n\nwir freuen uns, Ihnen mitzuteilen, dass Ihr Antrag auf eine neue Mülltonne genehmigt wurde. Die Tonne wird in der nächsten Woche geliefert.\n\nMit freundlichen Grüßen\nIhre Stadtverwaltung';
const NOTIZ = 'Bitte die Rechnung bis Freitag prüfen und dann an die Hausverwaltung weiterleiten, damit sie den Betrag noch in diesem Monat überweisen kann.';

const paket = (id: string, netz: string[] = [], version = '1.0.0'): InstalliertesPaket => ({
  id, name: `Übersetzer ${id}`, version, beschreibung: '', lizenz: 'MPL-2.0', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '2026-11-05T10:00:00.000Z' },
  installiert: '2026-11-05T10:00:00.000Z', installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true,
  laeufer: { sprache: 'c', ereignisse: [], rechte: { lesen: [], schreiben: [], dokumente: 'keine', schnittstellen: ['dms:uebersetzen'] }, netz, modul: { sha256: 'x', groesse: 1 } },
});

/**
 * Lena liest Briefe, Petra nicht. Lena hat Englisch gewählt. Das Paket „lokal“ übersetzt auf dem Gerät, „wolke“ darf
 * ins Netz. Der Anbieter zeichnet jeden Eingang auf und antwortet mit „EN:“ vor dem Text.
 */
async function aufbau(o: { repo?: Repo; konto?: KontoRepo; zustand?: Kurzzustand } = {}) {
  const d = new Dienst(o.repo ?? speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), zustand: o.zustand ?? speicherKurzzustand() });
  const konten = new Konten(o.konto ?? speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: markus } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, markus.id)).benutzer;
  let lena = await neu('Lena'); const petra = await neu('Petra');
  lena = await konten.aendereProfil(lena, { sprache: 'en' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const brief = await d.mappentypen.legeTypAn({ name: 'Brief', titelVorlage: '{betreff}', felder: [
    { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true },
    { key: 'inhalt', label: 'Inhalt', typ: 'langtext' },
    { key: 'email', label: 'E-Mail', typ: 'text', format: 'email' },
    { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
  ], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder' }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' }] });
  const lesen: Regelwerk = { grund: { ...NICHTS, C: true }, regeln: [{ id: 'r', name: 'Lesen', wenn: [{ art: 'benutzer', benutzer: [lena.id] }], dann: { R: 'erteilen', U: 'erteilen' }, stopp: false }] };
  await d.setzeBerechtigungen(brief.id, lesen, true);
  const m = await d.legeMappeAn({ typId: brief.id, werte: { betreff: 'Neue Mülltonne', inhalt: BRIEF, email: 'post@example.org' } }, lena.id);
  const eingaenge: Array<{ paket: string; e: Record<string, unknown> }> = [];
  let antwort = (e: Record<string, unknown>) => JSON.stringify({ text: `EN: ${String(e.text)}`, von: 'de' });
  const geladen = new Map([['lokal', paket('lokal')], ['wolke', paket('wolke', ['https://uebersetzer.example/v1'])]]);
  d.uebersetzung.anbieter = {
    pakete: () => [...geladen.values()].map((p) => ({ id: p.id, name: p.name, version: p.version, netz: p.laeufer!.netz.length > 0 })),
    uebersetze: async (p, e) => { eingaenge.push({ paket: p, e }); return { text: antwort(e), ms: 2 }; },
  };
  for (const p of geladen.values()) await d.kern.repo.speicherePaket(p);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (mt: string, p: string) => tabelle.find((r) => r.methode === mt && r.pfad === p)!;
  const rufe = async (b: { id: string }, mt: string, p: string, x: Partial<Anfrage> = {}) => route(mt, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: await ich(b.id) });
  const uebersetze = async (b: { id: string }, quelle: unknown, teil = 0) => (await rufe(b, 'POST', '/api/uebersetzung', { body: { quelle, teil } })).body as Record<string, unknown>;
  return { d, konten, markus, lena, petra, brief, m, eingaenge, rufe, uebersetze, ich, geladen, setzeAntwort: (f: typeof antwort) => { antwort = f; } };
}

describe('Inhalte übersetzen (#732): Manifest, Kennzeichnung, Abschnitte', () => {
  it('Recht dms:uebersetzen im Manifest und in der Rückfrage, mit Handbuch-Stelle; keine weiteren Rechte nötig', () => {
    const c = liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:uebersetzen'] } });
    assert.deepEqual(c.fehler, []);
    assert.equal(c.code!.rechte.dokumente, 'keine');
    const p = rechtePunkte(c.code!, (v) => v).find((x) => x.text.includes('(dms:uebersetzen)'))!;
    assert.equal(p.hilfe, 'pakete.recht.uebersetzen');
    assert.ok(SCHNITTSTELLEN['dms:uebersetzen']);
    for (const h of ['pakete.recht.uebersetzen', 'werkbank.uebersetzen', 'profil.uebersetzen', 'mappen.uebersetzen'] as const) assert.ok(HILFE[h], h);
  });

  it('Kennzeichnung „Maschinell übersetzt … – nicht verbindlich“, mit und ohne bekannte Ausgangssprache', () => {
    assert.equal(kennzeichnung(null, (s) => s), 'Maschinell übersetzt – nicht verbindlich');
    assert.equal(kennzeichnung('en', () => 'Englisch'), 'Maschinell übersetzt (Original auf Englisch) – nicht verbindlich');
    assert.equal(spracheAusTesseract('fra'), 'fr');
    assert.equal(spracheAusTesseract('xyz'), null);
  });

  it('Abschnitte: höchstens ABSCHNITT_MAX Zeichen, bevorzugt an Seiten und Absätzen, zusammengesetzt genau das Original', () => {
    const seite = (n: number) => `Seite ${n}. ${'Ein Satz mit ein paar Wörtern. '.repeat(90)}`;
    const text = `  ${seite(1)}\f${seite(2)}\n\n${seite(3)}\n`;
    const a = abschnitte(text);
    assert.equal(a.map((x) => x.text + x.trenner).join(''), text);
    assert.ok(a.every((x) => x.text.length <= ABSCHNITT_MAX));
    assert.ok(a.some((x) => x.trenner.includes('\f')), 'am Seitenvorschub getrennt');
    assert.ok(a.every((x) => !/\s$/.test(x.text)), 'Leerraum steht im Trenner');
    assert.deepEqual(abschnitte('kurz'), [{ text: 'kurz', trenner: '' }]);
    const hart = abschnitte('x'.repeat(ABSCHNITT_MAX * 2 + 5));
    assert.deepEqual(hart.map((x) => x.text.length), [ABSCHNITT_MAX, ABSCHNITT_MAX, 5]);
  });

  it('Antwort des Pakets und Quelle der Anfrage werden geprüft', () => {
    assert.deepEqual(liesAntwort('{"text":"Hello","von":"de"}'), { text: 'Hello', von: 'de' });
    assert.deepEqual(liesAntwort('{"text":"Hello","von":"<b>"}'), { text: 'Hello', von: null });
    assert.deepEqual(liesAntwort('{"fehler":"Kein Modell für Türkisch"}'), { fehler: 'Kein Modell für Türkisch' });
    assert.ok('fehler' in liesAntwort('Hello'));
    assert.ok('fehler' in liesAntwort('{"von":"de"}'));
    assert.throws(() => liesQuelle({ art: 'feld', mappe: 'x', feld: 'a' }), status(422));
    assert.throws(() => liesQuelle({ art: 'text', text: 'Bitte übersetzen' }), status(422), 'Text kommt nie von außen');
    assert.deepEqual(liesUebersetzenEinstellung(null), { an: true, paket: null });
    assert.deepEqual(liesUebersetzenEinstellung({ an: false, abfluss: true }), { an: false, paket: null }, 'Abfluss nur mit gewähltem Paket');
  });
});

describe('Inhalte übersetzen (#732): Ablauf', () => {
  it('Feld, Notiz und Volltext: Kern liest den Text, das Paket bekommt nur ihn; Ziel ist die Sprache der Person', async () => {
    const x = await aufbau();
    const r = await x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' });
    assert.equal(r.text, `EN: ${BRIEF}`);
    assert.equal(r.nach, 'en'); assert.equal(r.von, 'de');
    assert.deepEqual(r.paket, { id: 'lokal', name: 'Übersetzer lokal', version: '1.0.0' });
    assert.equal(r.netz, null, 'bleibt im Haus');
    assert.equal(x.eingaenge.length, 1);
    const e = x.eingaenge[0].e;
    assert.deepEqual(Object.keys(e).sort(), ['art', 'format', 'nach', 'teil', 'teile', 'text', 'von'], 'keine Kennungen, keine Mappe');
    assert.equal(e.text, BRIEF); assert.equal(e.nach, 'en'); assert.equal(e.art, 'feld'); assert.equal(e.format, 'text');
    // Notiz (Markdown) und Volltext.
    const n = await x.d.legeNotizAn(x.m.id, NOTIZ, x.lena.id);
    assert.equal((await x.uebersetze(x.lena, { art: 'notiz', notiz: n.id })).text, `EN: ${NOTIZ}`);
    assert.equal(x.eingaenge.at(-1)!.e.format, 'markdown');
    const dok = (await x.d.ladeHoch(x.m.id, { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' }, pdfMitText(['Brief']), x.lena.id)).dokument;
    await x.d.schreibeVolltext(dok.id, { text: `${BRIEF}\f${NOTIZ}`, sprache: 'deu' }, { id: x.lena.id, herkunft: 'Test', paket: false });
    const v = await x.uebersetze(x.lena, { art: 'volltext', dokument: dok.id });
    assert.equal(v.von, 'de', 'Sprache aus der Texterkennung');
    assert.ok(String(v.text).startsWith('EN: '));
    // Nicht übersetzbar: Passwort, Feld mit Format, unbekannt; leerer Text.
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'kennwort' }), status(422));
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'email' }), status(422));
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'gibtsnicht' }), status(422));
    const leer = await x.d.legeMappeAn({ typId: x.brief.id, werte: { betreff: 'Leer' } }, x.lena.id);
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: leer.id, feld: 'inhalt' }), status(422));
  });

  it('Rechte: Was die Person nicht lesen darf, wird nicht übersetzt – und das Paket sieht nichts davon', async () => {
    const x = await aufbau();
    const n = await x.d.legeNotizAn(x.m.id, NOTIZ, x.lena.id);
    const vorher = x.eingaenge.length;
    await assert.rejects(x.uebersetze(x.petra, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(404));
    await assert.rejects(x.uebersetze(x.petra, { art: 'notiz', notiz: n.id }), status(404));
    assert.equal(x.eingaenge.length, vorher, 'kein Aufruf des Pakets');
  });

  it('Gespeichert wird nur das Original: Mappe und Notiz bleiben unverändert, keine Historie', async () => {
    const x = await aufbau();
    const n = await x.d.legeNotizAn(x.m.id, NOTIZ, x.lena.id);
    const historie = (await x.d.historie(x.m.id)).length;
    await x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' });
    await x.uebersetze(x.lena, { art: 'notiz', notiz: n.id });
    const nachher = await x.d.holeMappe(x.m.id);
    assert.equal(nachher.mappe.werte.inhalt, BRIEF);
    assert.equal(nachher.notizen[0].text, NOTIZ);
    assert.equal((await x.d.historie(x.m.id)).length, historie);
  });

  it('Zwischenspeicher: gleicher Text, Sprache, Paket und Version aus dem Speicher; verfällt mit dem Original', async () => {
    const x = await aufbau();
    const q = { art: 'feld', mappe: x.m.id, feld: 'inhalt' };
    await x.uebersetze(x.lena, q);
    const zweit = await x.uebersetze(x.lena, q);
    assert.equal(zweit.gespeichert, true);
    assert.equal(x.eingaenge.length, 1, 'kein zweiter Aufruf');
    // Neue Version des Pakets: neu übersetzt, die alte Übersetzung ist weg.
    x.geladen.set('lokal', paket('lokal', [], '1.1.0'));
    await x.d.kern.repo.speicherePaket(x.geladen.get('lokal')!);
    assert.equal((await x.uebersetze(x.lena, q)).gespeichert, undefined);
    assert.equal(x.eingaenge.length, 2);
    const eintraege = await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|`);
    assert.equal(eintraege.length, 1);
    assert.match(eintraege[0].schluessel, /\|en\|lokal@1\.1\.0$/);
    // Original geändert: Der Prüfwert passt nicht mehr – neu übersetzt, die alte Übersetzung ist gelöscht.
    await x.d.aendereMappe(x.m.id, { werte: { ...x.m.werte, inhalt: `${BRIEF} Nachtrag folgt.` } }, x.lena.id);
    const neu = await x.uebersetze(x.lena, q);
    assert.equal(neu.text, `EN: ${BRIEF} Nachtrag folgt.`);
    assert.equal(neu.gespeichert, undefined);
    assert.equal(x.eingaenge.length, 3);
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|feld:inhalt|`)).length, 1, 'nur die neue');
    // Dazu das (gebündelte) Ereignis „Mappe geändert“: Es lässt die Übersetzungen der geänderten Felder verfallen.
    await x.d.uebersetzung.nachEreignis({ id: 'e1', art: 'mappe.geaendert', daten: { mappe: x.m.id, felder: ['inhalt'] }, ausloeser: { art: 'system' } as never, erstellt: '' });
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|feld:inhalt|`)).length, 0);
    // Notiz ändern und löschen: ihre Übersetzung ist sofort weg.
    const n = await x.d.legeNotizAn(x.m.id, NOTIZ, x.lena.id);
    await x.uebersetze(x.lena, { art: 'notiz', notiz: n.id });
    await x.d.aendereNotiz(n.id, `${NOTIZ} Danke!`, x.lena.id);
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|notiz:`)).length, 0);
    // Mappe gelöscht: alles zu ihr weg.
    await x.d.loescheMappe(x.m.id, x.lena.id);
    await x.d.ereignisse.verteile();
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|`)).length, 0);
  });

  it('lange Texte abschnittsweise; schon in der Sprache der Person: nichts an das Paket', async () => {
    const x = await aufbau();
    const lang = Array.from({ length: 6 }, (_, i) => `Absatz ${i + 1}: ${'Die Heizung im Keller wird im Herbst gewartet und geprüft. '.repeat(20)}`).join('\n\n');
    const m = await x.d.legeMappeAn({ typId: x.brief.id, werte: { betreff: 'Lang', inhalt: lang } }, x.lena.id);
    const q = { art: 'feld', mappe: m.id, feld: 'inhalt' };
    const erst = await x.uebersetze(x.lena, q, 0);
    assert.ok(Number(erst.teile) > 1);
    let ganz = '';
    for (let i = 0; i < Number(erst.teile); i++) { const r = await x.uebersetze(x.lena, q, i); ganz += `${String(r.text).replace(/^EN: /, '')}${String(r.trenner)}`; assert.equal(r.pruefwert, erst.pruefwert); }
    assert.equal(ganz, lang, 'Abschnitte samt Trennern ergeben das Original');
    await assert.rejects(x.uebersetze(x.lena, q, Number(erst.teile)), status(422));
    // Englischer Text für Lena (Englisch): schon in ihrer Sprache.
    const en = await x.d.legeMappeAn({ typId: x.brief.id, werte: { betreff: 'Englisch', inhalt: 'Dear Mrs Example, we are happy to tell you that your application for a new bin has been approved and it will be delivered next week.' } }, x.lena.id);
    const vorher = x.eingaenge.length;
    const g = await x.uebersetze(x.lena, { art: 'feld', mappe: en.id, feld: 'inhalt' });
    assert.equal(g.gleich, true);
    assert.equal(x.eingaenge.length, vorher);
    assert.ok(UEBERSETZEN_TEXT_MAX > ABSCHNITT_MAX);
  });

  it('Fehler des Pakets kommen verständlich an und landen nicht im Zwischenspeicher', async () => {
    const x = await aufbau();
    x.setzeAntwort(() => JSON.stringify({ fehler: 'Für Deutsch → Englisch fehlt das Modell.' }));
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(502, /fehlt das Modell/));
    x.setzeAntwort(() => 'kaputt');
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(502, /kein JSON/));
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|`)).length, 0);
  });
});

describe('Inhalte übersetzen (#732): abschaltbar und Datenabfluss', () => {
  it('ohne Paket kein Angebot; Admin schaltet für alle ab; jede Person für sich (Mein Konto)', async () => {
    const x = await aufbau();
    const status_ = async (b: { id: string }) => ((await x.rufe(b, 'GET', '/api/konto/status')).body as { uebersetzen: { paket: { id: string }; nach: string; netz: unknown; aus: boolean } | null }).uebersetzen;
    assert.deepEqual(await status_(x.lena), { paket: { id: 'lokal', name: 'Übersetzer lokal' }, nach: 'en', netz: null, aus: false });
    // Für sich abschalten.
    await x.rufe(x.lena, 'PUT', '/api/konto/profil', { body: { uebersetzen: false } });
    assert.equal((await status_(x.lena))?.aus, true);
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(409));
    await x.rufe(x.lena, 'PUT', '/api/konto/profil', { body: { uebersetzen: true } });
    assert.equal((await status_(x.lena))?.aus, false);
    // Für alle abschalten (Werkbank).
    const aus = (await x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { an: false } })).body as { einstellung: { an: boolean }; wirksam: unknown };
    assert.equal(aus.einstellung.an, false); assert.equal(aus.wirksam, null);
    assert.equal(await status_(x.lena), null);
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(409));
    await x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { an: true } });
    // Ohne laufendes Paket: kein Knopf.
    x.d.uebersetzung.anbieter = { pakete: () => [], uebersetze: async () => ({ text: '', ms: 0 }) };
    assert.equal(await status_(x.lena), null);
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), status(409));
    // Pakete bekommen keinen Knopf und dürfen nicht übersetzen lassen.
    assert.equal(await x.d.uebersetzung.angebot({ ...x.lena, art: 'dienst', paketId: 'lokal' }, 'de'), null);
  });

  it('Paket mit Netz nie stillschweigend: nur gewählt und bestätigt, dann mit Hinweis, wohin der Text geht (#701)', async () => {
    const x = await aufbau();
    // Das lokale Paket läuft nicht (mehr): Übrig ist nur das mit Netz – automatisch nimmt Ablago es nicht.
    x.geladen.delete('lokal');
    const ohne = await x.d.uebersetzung.stand();
    assert.equal(ohne.pakete.find((p) => p.id === 'lokal')!.laeuft, false);
    assert.equal(ohne.wirksam, null);
    await assert.rejects(x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { paket: 'wolke' } }),
      (e: Fachfehler) => e.status === 409 && (e.details as { abfluss?: boolean; ziele?: string[] }).abfluss === true && (e.details as { ziele: string[] }).ziele[0] === 'uebersetzer.example');
    await assert.rejects(x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { paket: 'gibtsnicht' } }), status(422));
    const s = (await x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { paket: 'wolke', abfluss: true } })).body as { wirksam: { id: string } };
    assert.equal(s.wirksam.id, 'wolke');
    // KI-Dienste (#796): Der neue Mappentyp „Brief“ ist für Pakete mit Netz gesperrt, bis er zugelassen ist.
    await assert.rejects(x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' }), (e: Fachfehler) => e.status === 409 && /KI-Dienste/.test(e.message));
    await x.d.ki.setzeKiTyp(x.brief.id, true, null);
    const r = await x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' });
    assert.deepEqual(r.netz, ['uebersetzer.example']);
    assert.equal(x.eingaenge.at(-1)!.paket, 'wolke');
    // Andere Wahl ohne Bestätigung hebt sie auf.
    await assert.rejects(x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { paket: 'wolke', abfluss: false } }), status(409));
  });
});

/* ---------- Kleines Test-Paket im echten Paket-Läufer: antwortet auf dms:uebersetzen mit fester Übersetzung ---------- */

const u = (n: number): number[] => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
const s = (n: number): number[] => { const b: number[] = []; for (;;) { const x = n & 0x7f; n >>= 7; if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) { b.push(x); return b; } b.push(x | 0x80); } };
const vec = (l: number[][]) => [...u(l.length), ...l.flat()];
const str = (t: string) => { const b = [...Buffer.from(t)]; return [...u(b.length), ...b]; };
const sek = (id: number, b: number[]) => [id, ...u(b.length), ...b];
/** WebAssembly-Modul nach DMS-Paket-ABI 1: dms_puffer, dms_ereignis, dms_aktion; die Aktion meldet `ergebnis` fest. */
function festesErgebnis(ergebnis: string): Buffer {
  const typen = [[0x60, 2, 0x7f, 0x7f, 1, 0x7f], [0x60, 1, 0x7f, 1, 0x7f]];
  const importe = [[...str('env'), ...str('memory'), 0x02, 0x00, ...u(1)], [...str('dms'), ...str('ergebnis'), 0x00, 0]];
  const koerper = (b: number[]) => { const k = [0x00, ...b, 0x0b]; return [...u(k.length), ...k]; };
  const code = [koerper([0x41, ...s(8192)]), koerper([0x41, 0]), koerper([0x41, ...s(1024), 0x41, ...s(Buffer.byteLength(ergebnis)), 0x10, 0, 0x1a, 0x41, 0])];
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0, ...sek(1, vec(typen)), ...sek(2, vec(importe)), ...sek(3, vec([[1], [0], [0]])),
    ...sek(7, vec([[...str('dms_puffer'), 0x00, 1], [...str('dms_ereignis'), 0x00, 2], [...str('dms_aktion'), 0x00, 3]])),
    ...sek(10, vec(code)), ...sek(11, vec([[0x00, 0x41, ...s(1024), 0x0b, ...str(ergebnis)]]))]);
}
/** Manifest des Test-Pakets – genau so, wie ein Übersetzungspaket aussieht: nur das Recht, kein Netz, keine Dokumente. */
const MANIFEST = 'schema: 1\nid: uebersetzer_test\nname: Übersetzer (Test)\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MPL-2.0\ndms: ">=0.204.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  rechte: { schnittstellen: ["dms:uebersetzen"] }\n';

describe('Inhalte übersetzen (#732): Test-Paket im echten Paket-Läufer', () => {
  const laeufer: Paketlaeufer[] = [];
  after(async () => { for (const l of laeufer) await l.stop(); });
  it('ruft dms:uebersetzen im Läufer auf; in der Werkbank steht kein Inhalt', async () => {
    const x = await aufbau();
    const wasm = festesErgebnis(JSON.stringify({ text: 'Dear Mrs Example, your application has been approved.', von: 'de' }));
    const p = liesPaket(new Map([['manifest.yaml', Buffer.from(MANIFEST)], ['code/modul.wasm', wasm]]));
    await x.d.kern.repo.speicherePaketCode('uebersetzer_test', p.code!.dateien);
    await x.d.kern.repo.speicherePaket({ ...paket('uebersetzer_test'), name: 'Übersetzer (Test)', laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
    const l = new Paketlaeufer({ dienst: x.d, konten: x.konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }), einstellungen: async () => ({}), speicher: { lies: async () => ({}), schreibe: async () => {} }, grenzen: { sekunden: 5, speicherMB: 16 }, abrufMs: 100, nachlaufMs: 3_600_000 });
    laeufer.push(l);
    await l.start();
    for (let i = 0; i < 200 && !x.d.uebersetzung.anbieter!.pakete().some((y) => y.id === 'uebersetzer_test'); i++) await new Promise((r) => setTimeout(r, 50));
    await x.rufe(x.markus, 'PUT', '/api/werkbank/uebersetzen', { body: { paket: 'uebersetzer_test' } });
    const r = await x.uebersetze(x.lena, { art: 'feld', mappe: x.m.id, feld: 'inhalt' });
    assert.equal(r.text, 'Dear Mrs Example, your application has been approved.');
    assert.equal(r.von, 'de');
    assert.equal((r.paket as { id: string }).id, 'uebersetzer_test');
    const stand = (await l.uebersicht()).pakete.find((y) => y.id === 'uebersetzer_test')!;
    assert.equal(stand.letzte[0].art, 'Text übersetzt');
    assert.ok(!stand.letzte[0].text.includes('Mülltonne') && !stand.letzte[0].text.includes('Dear'), 'kein Inhalt in der Werkbank');
  });
});

/* ---------- PostgreSQL: Spalte benutzer.uebersetzen (Migration 083) und Zwischenspeicher im Kurzzustand ---------- */

const url = process.env.TEST_DATABASE_URL;
describe('Inhalte übersetzen (#732): PostgreSQL', { skip: !url }, () => {
  const HAUSHALT = '00000000-0000-4000-8000-000000000001';
  let sql: { end(): Promise<void>; unsafe(q: string): Promise<unknown> } | undefined;
  after(async () => { await sql?.end(); });
  it('Wahl der Person bleibt gespeichert; Übersetzungen im Kurzzustand, verfallen mit dem Original', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const { pgKurzzustand } = await import('../src/kurzzustand');
    const db = (await eigeneDatenbank('uebersetzung')).sql;
    sql = db;
    const x = await aufbau({ repo: pgRepo(db, HAUSHALT), konto: pgKontoRepo(db, HAUSHALT), zustand: pgKurzzustand(db, HAUSHALT) });
    assert.equal((await x.ich(x.lena.id)).uebersetzen, undefined, 'Vorgabe an');
    await x.konten.aendereProfil(await x.ich(x.lena.id), { uebersetzen: false });
    assert.equal((await x.ich(x.lena.id)).uebersetzen, false);
    await x.konten.aendereProfil(await x.ich(x.lena.id), { uebersetzen: true });
    const q = { art: 'feld', mappe: x.m.id, feld: 'inhalt' };
    await x.uebersetze(x.lena, q);
    assert.equal((await x.uebersetze(x.lena, q)).gespeichert, true);
    assert.equal(x.eingaenge.length, 1);
    await x.d.uebersetzung.vergiss(x.m.id);
    assert.equal((await x.d.kurzzustand.liste(ZWISCHENSPEICHER, `${x.m.id}|`)).length, 0);
  });
});
