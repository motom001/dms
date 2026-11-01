/** WebDAV-Laufwerk (#346, Stufe 1): Anmeldung, Baum, Rechte, Herunterladen, Ablegen, Hilfsdateien, Schutz. */
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import type { Benutzer } from '../../shared/src/model';
import { etagVon, MAX_UPLOADS, Webdav, type WebdavAntwort } from '../src/webdav';
import { bereinige, eindeutig, href, istHilfsdatei, proppatchNamen, Ratenbegrenzung, xml, zerlege } from '../src/webdav-baum';

const PDF = (t: string) => Buffer.from(`%PDF-1.4\n% ${t}\n`);
const ALLES = { C: true, R: true, U: true, D: true, P: true };

/** Konto direkt deaktivieren (ohne die Vertreter-Prüfung der Benutzerverwaltung). */
async function deaktiviere(konten: Konten, id: string) {
  await (konten as unknown as { repo: { aendereBenutzer(id: string, d: { aktiv: boolean }): Promise<unknown> } }).repo.aendereBenutzer(id, { aktiv: false });
}

async function aufbau(o: { grenze?: number } = {}) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
  const bert = (await konten.legeBenutzerAn({ email: 'bert@example.org', name: 'Bert', rolle: 'mitglied' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const schluesselRepo = speicherApiSchluesselRepo();
  const schluessel = new ApiSchluesselDienst(schluesselRepo);
  const annaKey = (await schluessel.lege(anna, { name: 'Laufwerk', recht: 'schreiben' })).schluessel;
  const bertKey = (await schluessel.lege(bert, { name: 'Laufwerk', recht: 'lesen' })).schluessel;
  const einstellungen = speicherEinstellungen();
  const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Nr', typ: 'text' },
  ], register: [
    { key: 'daten', name: 'Daten', art: 'felder' },
    { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true },
    { key: 'briefe', name: 'Briefe/Post', art: 'dokumente' },
  ] } as never);
  // Verweis auf einen anderen Vertrag – ergibt den Ordner „Verknüpft“.
  const vt = await d.aendereTyp(vertrag.id, { ...vertrag, felder: [...vertrag.felder, { key: 'bezug', label: 'Bezug', typ: 'referenz', zielTyp: vertrag.id }] });
  const geheim = await d.legeTypAn({ name: 'Geheim', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
    berechtigungen: { grund: ALLES, regeln: [{ id: 'x', name: 'nicht Anna', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
  const sicht = await d.legeSichtAn({ name: 'Verträge', typen: [vt.id] });
  const sichtG = await d.legeSichtAn({ name: 'Geheimes', typen: [geheim.id] });
  const v1a = await d.legeMappeAn({ typId: vt.id, werte: { nr: 'V-1' } }, anna.id);
  const v1b = await d.legeMappeAn({ typId: vt.id, werte: { nr: 'V-1' } }, anna.id);
  const akte = await d.legeMappeAn({ typId: vt.id, werte: { nr: 'Akte: 7?', bezug: v1a.id } }, anna.id);
  const g = await d.legeMappeAn({ typId: geheim.id, werte: { nr: 'G-1' } }, admin.id);
  await d.ladeHoch(v1a.id, { register: 'belege', name: 'Rechnung.pdf' }, PDF('r1'), anna.id);
  const wd = new Webdav({ dienst: d, konten, schluessel, einstellungen, adresse: () => 'https://dms.example.org', grenze: o.grenze });
  const auth = (email: string, pw: string) => `Basic ${Buffer.from(`${email}:${pw}`).toString('base64')}`;
  const A = auth('anna@example.org', annaKey);
  const B = auth('bert@example.org', bertKey);
  let ip = 1;
  const rufe = async (methode: string, pfad: string, x: { auth?: string; depth?: string; body?: Buffer | string; kopf?: Record<string, string>; ip?: string } = {}): Promise<WebdavAntwort & { text: string }> => {
    const koepfe: Record<string, string> = { ...(x.auth ? { authorization: x.auth } : {}), ...(x.depth ? { depth: x.depth } : {}), ...x.kopf };
    const r = await wd.anfrage({
      methode, url: pfad.split('/').map((t) => encodeURIComponent(t)).join('/'), ip: x.ip ?? `10.0.0.${ip}`, kopf: (n) => koepfe[n],
      koerper: x.body === undefined ? null : Buffer.from(x.body),
    });
    let t = '';
    if (typeof r.body === 'string') t = r.body;
    else if (Buffer.isBuffer(r.body)) t = r.body.toString('utf8');
    return { ...r, text: t };
  };
  const neueIp = () => { ip++; };
  const namen = (r: { text: string }) => [...r.text.matchAll(/<D:displayname>([^<]*)<\/D:displayname>/g)].map((m) => m[1]);
  return { d, konten, admin, anna, bert, wd, rufe, A, B, auth, annaKey, vt, sicht, sichtG, v1a, v1b, akte, g, einstellungen, namen, neueIp, schluessel, schluesselRepo };
}

describe('WebDAV: reine Hilfen (#346)', () => {
  it('bereinigt verbotene Zeichen, Endpunkte, reservierte Namen und lange Namen', () => {
    assert.equal(bereinige('Akte: 7?'), 'Akte_ 7_');
    assert.equal(bereinige('a\\b/c*d"e<f>g|h'), 'a_b_c_d_e_f_g_h');
    assert.equal(bereinige('Ende. . '), 'Ende');
    assert.equal(bereinige('.versteckt'), 'versteckt');
    assert.equal(bereinige('  '), 'Ohne Titel');
    assert.equal(bereinige('con'), '_con');
    assert.equal(bereinige('Zeile\u0001eins\nzwei'), 'Zeile_eins_zwei');
    const lang = bereinige(`${'x'.repeat(300)}.pdf`);
    assert.equal(lang.length, 120);
    assert.ok(lang.endsWith('.pdf'));
  });
  it('macht Namen eindeutig: Kurzkennung bei Mappen, Zähler bei Dateien, ohne Groß/klein, belegte Namen', () => {
    assert.deepEqual(eindeutig([{ name: 'V-1', kurz: 'aaaaaa' }, { name: 'v-1', kurz: 'bbbbbb' }, { name: 'X' }]), ['V-1 (aaaaaa)', 'v-1 (bbbbbb)', 'X']);
    assert.deepEqual(eindeutig([{ name: 'a.pdf', datei: true }, { name: 'A.pdf', datei: true }, { name: 'a:.pdf', datei: true }]), ['a.pdf', 'A (2).pdf', 'a_.pdf']);
    assert.deepEqual(eindeutig([{ name: 'Verknüpft' }], ['Verknüpft']), ['Verknüpft (2)']);
    // macOS schickt Umlaute zerlegt (NFD): gleicher Name.
    assert.deepEqual(eindeutig([{ name: 'Müller' }, { name: 'Müller' }]), ['Müller', 'Müller (2)']);
  });
  it('zerlegt Pfade sicher und baut Hrefs', () => {
    assert.deepEqual(zerlege('/webdav/'), { teile: [], ordner: true });
    assert.deepEqual(zerlege('/webdav/Ablage/Vertr%C3%A4ge/'), { teile: ['Ablage', 'Verträge'], ordner: true });
    assert.deepEqual(zerlege('/webdav/Ablage/Vertra%CC%88ge')?.teile, ['Ablage', 'Verträge']);
    assert.equal(zerlege('/webdav/../api'), null);
    assert.equal(zerlege('/webdav/a/%2e%2e/b'), null);
    assert.equal(zerlege('/webdav/a%2Fb'), null);
    assert.equal(zerlege('/webdav/%E0%A4%A'), null);
    assert.equal(zerlege('/webdavx'), null);
    assert.equal(href(['Neue Post'], true), '/webdav/Neue%20Post/');
    assert.equal(xml('<a href="x">&\u0001'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  });
  it('erkennt Hilfsdateien', () => {
    for (const n of ['desktop.ini', 'Thumbs.db', '.DS_Store', '._Rechnung.pdf', '~$Brief.docx']) assert.ok(istHilfsdatei(n), n);
    assert.ok(!istHilfsdatei('Rechnung.pdf'));
  });
  it('liest Eigenschaften aus PROPPATCH und begrenzt Anfragen', () => {
    assert.deepEqual(proppatchNamen('<D:propertyupdate xmlns:D="DAV:" xmlns:Z="urn:schemas-microsoft-com:"><D:set><D:prop><Z:Win32CreationTime>x</Z:Win32CreationTime><Z:Win32FileAttributes>0</Z:Win32FileAttributes></D:prop></D:set></D:propertyupdate>'),
      [{ ns: 'urn:schemas-microsoft-com:', name: 'Win32CreationTime' }, { ns: 'urn:schemas-microsoft-com:', name: 'Win32FileAttributes' }]);
    let t = 0;
    const r = new Ratenbegrenzung(2, () => t);
    assert.ok(r.pruefe('a').ok); assert.ok(r.pruefe('a').ok);
    const n = r.pruefe('a');
    assert.ok(!n.ok && n.sekunden === 60 && n.erstes);
    assert.ok(r.pruefe('b').ok);
    t = 60_000;
    assert.ok(r.pruefe('a').ok);
  });
});

describe('WebDAV-Laufwerk (#346, Stufe 1)', () => {
  it('ausgeschaltet (Standard): 404 für alles; eingeschaltet: OPTIONS mit DAV 1, 2', async () => {
    const { wd, rufe, A } = await aufbau();
    assert.equal((await wd.stand()).einstellung.aktiv, false);
    assert.equal((await rufe('OPTIONS', '/webdav/')).status, 404);
    assert.equal((await rufe('PROPFIND', '/webdav/', { auth: A, depth: '1' })).status, 404);
    const s = await wd.speichere({ aktiv: true }, 'admin@example.org');
    assert.equal(s.adresse, 'https://dms.example.org/webdav/');
    assert.equal(s.https, true);
    const o = await rufe('OPTIONS', '/webdav/');
    assert.equal(o.status, 200);
    assert.equal(o.koepfe.dav, '1, 2');
    await assert.rejects(wd.speichere({ aktiv: 'ja' }, 'x'), /aktiv/);
  });

  it('Anmeldung nur mit API-Schlüssel: 401 ohne, mit Passwort, mit fremdem Schlüssel; Fehlversuche sperren', async () => {
    const { wd, rufe, A, auth, annaKey } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const ohne = await rufe('PROPFIND', '/webdav/', { depth: '0' });
    assert.equal(ohne.status, 401);
    assert.equal(ohne.koepfe['www-authenticate'], 'Basic realm="DMS", charset="UTF-8"');
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('admin@example.org', 'ein-langes-passwort'), ip: '9.9.9.1' })).status, 401, 'Hauptpasswort nie');
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('bert@example.org', annaKey), ip: '9.9.9.1' })).status, 401, 'Schlüssel gehört zu Anna');
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: A })).status, 207);
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('ANNA@example.org', annaKey) })).status, 207, 'E-Mail ohne Groß/klein');
    // Anmeldeschutz (#240): nach 5 Fehlversuchen für Konto und IP gesperrt – auch mit richtigem Schlüssel.
    for (let i = 0; i < 5; i++) assert.equal((await rufe('GET', '/webdav/', { auth: auth('anna@example.org', 'dms_falsch'), ip: '9.9.9.2' })).status, 401);
    const gesperrt = await rufe('GET', '/webdav/', { auth: A, ip: '9.9.9.2' });
    assert.equal(gesperrt.status, 429);
    const st = await wd.stand();
    assert.ok(st.zugriffe.some((z) => z.status === 401 && z.benutzer === 'anna@example.org'));
  });

  it('PROPFIND: Tiefe 0 und 1, „infinity“ abgelehnt; Baum mit eindeutigen, bereinigten Namen und nur lesbaren Mappen', async () => {
    const { d, wd, rufe, A, anna, namen, v1a, v1b, g } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const null0 = await rufe('PROPFIND', '/webdav/', { auth: A, depth: '0' });
    assert.equal(null0.status, 207);
    assert.equal((null0.text.match(/<D:response>/g) ?? []).length, 1);
    const eins = await rufe('PROPFIND', '/webdav/', { auth: A, depth: '1' });
    assert.deepEqual(namen(eins), ['DMS', 'Neue Post', 'Ablage']);
    assert.match(eins.text, /<D:href>\/webdav\/Neue%20Post\/<\/D:href>/);
    assert.match(eins.text, /<D:collection\/>/);
    const unendlich = await rufe('PROPFIND', '/webdav/', { auth: A, depth: 'infinity' });
    assert.equal(unendlich.status, 403);
    assert.match(unendlich.text, /propfind-finite-depth/);
    // Ansichten: nur lesbare (Geheimes zeigt Anna nur leer, die Mappe G-1 fehlt).
    const ablage = await rufe('PROPFIND', '/webdav/Ablage/', { auth: A, depth: '1' });
    assert.ok(namen(ablage).includes('Verträge'));
    const vertraege = await rufe('PROPFIND', '/webdav/Ablage/Verträge/', { auth: A, depth: '1' });
    const k = (id: string) => id.replace(/-/g, '').slice(0, 6);
    assert.deepEqual(namen(vertraege).slice(1).sort(), ['Akte_ 7_', `V-1 (${k(v1a.id)})`, `V-1 (${k(v1b.id)})`].sort());
    const geheim = await rufe('PROPFIND', '/webdav/Ablage/Geheimes/', { auth: A, depth: '1' });
    assert.ok(!namen(geheim).includes('G-1'), 'fremde Mappe unsichtbar');
    assert.equal((await rufe('PROPFIND', '/webdav/Ablage/Geheimes/G-1/', { auth: A, depth: '0' })).status, 404);
    assert.ok(g.id);
    // Mappe: Register-Ordner (bereinigt) und Verknüpft; Dokument mit Größe, ETag, Datum.
    const mappe = await rufe('PROPFIND', `/webdav/Ablage/Verträge/V-1 (${k(v1a.id)})/`, { auth: A, depth: '1' });
    assert.deepEqual(namen(mappe).slice(1), ['Belege', 'Briefe_Post', 'Verknüpft']);
    const belege = await rufe('PROPFIND', `/webdav/Ablage/Verträge/V-1 (${k(v1a.id)})/Belege/`, { auth: A, depth: '1' });
    assert.deepEqual(namen(belege).slice(1), ['Rechnung.pdf']);
    assert.match(belege.text, /<D:getcontentlength>\d+<\/D:getcontentlength>/);
    // ETag nicht der reine Inhalts-Hash (sonst ließe sich ein Inhalt ohne Exportrecht bestätigen).
    assert.match(belege.text, /<D:getetag>&quot;[0-9a-f]{32}&quot;<\/D:getetag>/);
    const rechnung = (await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente[0];
    assert.ok(belege.text.includes(etagVon(rechnung).replace(/"/g, '&quot;')));
    assert.ok(!belege.text.includes(rechnung.sha256));
    assert.match(belege.text, /<D:getlastmodified>[A-Z][a-z]{2}, \d{2} /);
    // Verknüpft: nur eine Ebene – die verknüpfte Mappe hat selbst kein „Verknüpft“.
    const verkn = await rufe('PROPFIND', `/webdav/Ablage/Verträge/V-1 (${k(v1a.id)})/Verknüpft/`, { auth: A, depth: '1' });
    assert.deepEqual(namen(verkn).slice(1), ['Akte_ 7_']);
    const tiefer = await rufe('PROPFIND', `/webdav/Ablage/Verträge/V-1 (${k(v1a.id)})/Verknüpft/Akte_ 7_/`, { auth: A, depth: '1' });
    assert.deepEqual(namen(tiefer).slice(1), ['Belege', 'Briefe_Post']);
    assert.equal((await rufe('PROPFIND', `/webdav/Ablage/Verträge/V-1 (${k(v1a.id)})/Verknüpft/Akte_ 7_/Verknüpft/`, { auth: A, depth: '0' })).status, 404);
    // Groß/klein egal wie unter Windows.
    assert.equal((await rufe('PROPFIND', '/webdav/ablage/verträge/', { auth: A, depth: '0' })).status, 207);
  });

  it('Herunterladen nur mit Exportrecht E; ETag und If-None-Match', async () => {
    const { d, wd, rufe, A, anna, v1a, sicht, vt } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const pfad = `/webdav/Ablage/Verträge/V-1 (${v1a.id.replace(/-/g, '').slice(0, 6)})/Belege/Rechnung.pdf`;
    const r = await rufe('GET', pfad, { auth: A });
    assert.equal(r.status, 200);
    assert.equal(r.text, PDF('r1').toString());
    assert.match(r.koepfe['content-disposition'], /^attachment/);
    assert.match(r.koepfe.etag, /^"[0-9a-f]{32}"$/);
    assert.equal((await rufe('GET', pfad, { auth: A, kopf: { 'if-none-match': r.koepfe.etag } })).status, 304);
    const h = await rufe('HEAD', pfad, { auth: A });
    assert.equal(h.status, 200);
    assert.equal(h.body, undefined);
    // Exportrecht entziehen: Lesen (PROPFIND) geht weiter, Herunterladen nicht.
    // Der Mappentyp hat auch seine eigene Ansicht „Vertrag“ – überall entziehen.
    for (const s of (await d.listeSichten()).filter((x) => x.id === sicht.id || x.typen.includes(vt.id))) {
      await d.aendereSicht(s.id, { ...s, berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [{ id: 'e', name: 'kein Export', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { E: 'entziehen' }, stopp: false }] } });
    }
    assert.equal((await rufe('PROPFIND', pfad, { auth: A, depth: '0' })).status, 207);
    assert.equal((await rufe('GET', pfad, { auth: A })).status, 403);
  });

  it('Ablegen: Neue Post wird Post; im Register Dokument bzw. neue Version; ohne Versionierung kein Überschreiben', async () => {
    const { d, wd, rufe, A, anna, v1a, namen } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const post = await d.postTyp();
    const zahl = async () => (await d.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: `typ:${post.id}` })).gesamt;
    assert.equal(await zahl(), 0);
    // Wie der Finder: erst leer anlegen (und sperren), dann Inhalt.
    assert.equal((await rufe('PUT', '/webdav/Neue Post/Scan 1.pdf', { auth: A, body: '' })).status, 201);
    assert.equal(await zahl(), 0, 'leere Datei legt noch nichts an');
    assert.equal((await rufe('PUT', '/webdav/Neue Post/Scan 1.pdf', { auth: A, body: PDF('scan') })).status, 201);
    const p = (await d.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: `typ:${post.id}` })).mappen;
    assert.equal(p.length, 1);
    assert.equal(p[0].werte.kanal, 'WebDAV');
    assert.equal(p[0].werte.betreff, 'Scan 1');
    const doks = (await d.laufwerkMappe(p[0].id, await d.zugriff(anna))).dokumente;
    assert.deepEqual(doks.map((x) => [x.name, x.herkunft]), [['Scan 1.pdf', 'webdav']]);
    assert.deepEqual(namen(await rufe('PROPFIND', '/webdav/Neue Post/', { auth: A, depth: '1' })).slice(1), ['Scan 1.pdf']);
    // Register mit Versionierung: neues Dokument (201), gleicher Name → neue Version (204).
    const reg = `/webdav/Ablage/Verträge/V-1 (${v1a.id.replace(/-/g, '').slice(0, 6)})`;
    assert.equal((await rufe('PUT', `${reg}/Belege/Kündigung.pdf`, { auth: A, body: PDF('k1') })).status, 201);
    assert.equal((await rufe('PUT', `${reg}/Belege/rechnung.pdf`, { auth: A, body: PDF('r2') })).status, 204);
    const nach = (await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente;
    assert.deepEqual(nach.map((x) => [x.name, x.version ?? 1, x.herkunft]).sort(), [['Kündigung.pdf', 1, 'webdav'], ['Rechnung.pdf', 2, 'webdav']]);
    // Register ohne Versionierung: neu ja, gleicher Name 409.
    assert.equal((await rufe('PUT', `${reg}/Briefe_Post/Brief.pdf`, { auth: A, body: PDF('b1') })).status, 201);
    const wieder = await rufe('PUT', `${reg}/Briefe_Post/Brief.pdf`, { auth: A, body: PDF('b2') });
    assert.equal(wieder.status, 409);
    assert.match(wieder.text, /keine Versionierung/);
    // Nicht überall: Ablage, Mappe, Wurzel.
    assert.equal((await rufe('PUT', '/webdav/Ablage/x.pdf', { auth: A, body: PDF('x') })).status, 403);
    assert.equal((await rufe('PUT', `${reg}/x.pdf`, { auth: A, body: PDF('x') })).status, 403);
    assert.equal((await rufe('PUT', '/webdav/Gibts/nicht/x.pdf', { auth: A, body: PDF('x') })).status, 409);
  });

  it('Lese-Schlüssel darf nicht ablegen; Hilfsdateien werden still verworfen; Ändern in Stufe 1 gesperrt', async () => {
    const { d, wd, rufe, A, B, anna } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    assert.equal((await rufe('PUT', '/webdav/Neue Post/x.pdf', { auth: B, body: PDF('x') })).status, 403);
    for (const n of ['.DS_Store', '._x.pdf', 'Thumbs.db', 'desktop.ini', '~$Brief.docx']) {
      assert.equal((await rufe('PUT', `/webdav/Neue Post/${n}`, { auth: A, body: 'egal' })).status, 201, n);
      assert.equal((await rufe('PROPFIND', `/webdav/Neue Post/${n}`, { auth: A, depth: '0' })).status, 404, n);
      assert.equal((await rufe('PUT', `/webdav/Ablage/${n}`, { auth: A, body: 'egal' })).status, 201, `${n} überall`);
    }
    const post = await d.postTyp();
    assert.equal((await d.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: `typ:${post.id}` })).gesamt, 0);
    for (const m of ['MKCOL', 'DELETE', 'MOVE', 'COPY']) assert.equal((await rufe(m, '/webdav/Ablage/Verträge/neu/', { auth: A })).status, 403, m);
    assert.equal((await rufe('TRACE', '/webdav/', { auth: A })).status, 405);
    // PROPPATCH (Windows setzt Zeiten): Antwort 207, jede Eigenschaft 403 – nichts wird gespeichert.
    const pp = await rufe('PROPPATCH', '/webdav/Neue Post/', { auth: A, body: '<D:propertyupdate xmlns:D="DAV:" xmlns:Z="urn:schemas-microsoft-com:"><D:set><D:prop><Z:Win32LastModifiedTime>x</Z:Win32LastModifiedTime></D:prop></D:set></D:propertyupdate>' });
    assert.equal(pp.status, 207);
    assert.match(pp.text, /Win32LastModifiedTime xmlns:x0="urn:schemas-microsoft-com:"\/>.*403 Forbidden/);
  });

  it('LOCK/UNLOCK als Schein-Sperre nur, wo Ablegen erlaubt ist', async () => {
    const { wd, rufe, A, B, namen } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const l = await rufe('LOCK', '/webdav/Neue Post/Scan.pdf', { auth: A, body: '<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>' });
    assert.equal(l.status, 201);
    assert.match(l.koepfe['lock-token'], /^<opaquelocktoken:[0-9a-f-]{36}>$/);
    assert.match(l.text, /<D:activelock>/);
    // Erscheint als leere Datei, bis der Inhalt kommt.
    assert.deepEqual(namen(await rufe('PROPFIND', '/webdav/Neue Post/', { auth: A, depth: '1' })).slice(1), ['Scan.pdf']);
    assert.equal((await rufe('UNLOCK', '/webdav/Neue Post/Scan.pdf', { auth: A, kopf: { 'lock-token': l.koepfe['lock-token'] } })).status, 204);
    assert.equal((await rufe('LOCK', '/webdav/Ablage/x.pdf', { auth: A, body: '' })).status, 403);
    assert.equal((await rufe('LOCK', '/webdav/Neue Post/y.pdf', { auth: B, body: '' })).status, 403, 'Lese-Schlüssel');
    assert.equal((await rufe('LOCK', '/webdav/Neue Post/._y.pdf', { auth: B, body: '' })).status, 200, 'Hilfsdatei');
  });

  it('Ratenbegrenzung je Benutzer und letzte Zugriffe für die Werkbank', async () => {
    const { wd, rufe, A } = await aufbau({ grenze: 3 });
    await wd.speichere({ aktiv: true }, 'admin');
    for (let i = 0; i < 3; i++) assert.equal((await rufe('PROPFIND', '/webdav/', { auth: A, depth: '0' })).status, 207);
    const r = await rufe('PROPFIND', '/webdav/', { auth: A, depth: '0' });
    assert.equal(r.status, 429);
    assert.ok(Number(r.koepfe['retry-after']) > 0);
    const s = await wd.stand();
    assert.equal(s.zugriffe[0].status, 429, 'neueste zuerst');
    assert.equal(s.zugriffe[0].benutzer, 'anna@example.org');
    assert.equal(s.zugriffe[0].pfad, '/webdav/');
  });
  it('Sicherheit: nur Sitzungs-Cookie, deaktivierter Benutzer, abgelaufener Schlüssel, Dienstkonto → 401', async () => {
    const { wd, konten, rufe, A, anna, bert, auth, schluessel, schluesselRepo } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    // Sitzungs-Cookie allein öffnet das Laufwerk nicht (Basic mit API-Schlüssel nötig).
    const sitzung = await konten.anmelden({ email: 'admin@example.org', passwort: 'ein-langes-passwort' }, '10.1.1.1');
    assert.ok('schluessel' in sitzung && sitzung.schluessel);
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', kopf: { cookie: `dms_sitzung=${'schluessel' in sitzung ? sitzung.schluessel : ''}` } })).status, 401);
    // Abgelaufener Schlüssel.
    const alt = await schluessel.lege(bert, { name: 'Alt', recht: 'schreiben' });
    await schluesselRepo.aendere(alt.id, { name: 'Alt', recht: 'schreiben', ablauf: new Date(Date.now() - 60_000).toISOString(), passwoerter: false });
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('bert@example.org', alt.schluessel), ip: '10.1.1.2' })).status, 401);
    // Dienstkonto (#338): auch mit gültigem Schlüssel abgelehnt.
    const echt = konten.benutzerMitId.bind(konten);
    konten.benutzerMitId = async (id: string) => { const b = await echt(id); return b && ({ ...b, art: 'dienst' } as Benutzer); };
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: A, ip: '10.1.1.3' })).status, 401);
    konten.benutzerMitId = echt;
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: A, ip: '10.1.1.3' })).status, 207);
    // Deaktivierter Benutzer: Schlüssel gilt nicht mehr.
    await deaktiviere(konten, anna.id);
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: A, ip: '10.1.1.4' })).status, 401);
  });

  it('Anmeldeschutz: „bekannt“ nur für aktive Konten (#368); lange E-Mail gekürzt', async () => {
    const { wd, konten, rufe, auth, bert } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const aufrufe: Array<[string, boolean]> = [];
    const echt = konten.sperre.fehlschlag.bind(konten.sperre);
    konten.sperre.fehlschlag = async (email: string, ip: string, bekannt = false) => { aufrufe.push([email, bekannt]); return echt(email, ip, bekannt); };
    await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('anna@example.org', 'dms_falsch'), ip: '10.2.0.1' });
    await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('niemand@example.org', 'dms_falsch'), ip: '10.2.0.2' });
    await deaktiviere(konten, bert.id);
    await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth('bert@example.org', 'dms_falsch'), ip: '10.2.0.3' });
    const lang = `${'x'.repeat(1000)}@example.org`;
    assert.equal((await rufe('PROPFIND', '/webdav/', { depth: '0', auth: auth(lang, 'dms_falsch'), ip: '10.2.0.4' })).status, 401);
    assert.deepEqual(aufrufe.slice(0, 3), [['anna@example.org', true], ['niemand@example.org', false], ['bert@example.org', false]]);
    assert.equal(aufrufe[3][0].length, 254);
    assert.equal((await wd.stand()).zugriffe[0].benutzer.length, 254);
  });

  it('Rechte beim Ablegen: Register ohne U → 403, Neue Post ohne C → 403 (auch mit Schreib-Schlüssel)', async () => {
    const { d, wd, rufe, A, anna, v1a, vt } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const reg = `/webdav/Ablage/Verträge/V-1 (${v1a.id.replace(/-/g, '').slice(0, 6)})/Belege`;
    await d.aendereTyp(vt.id, { ...vt, berechtigungen: { grund: ALLES, regeln: [{ id: 'u', name: 'Anna ändert nicht', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { U: 'entziehen' }, stopp: false }] } });
    assert.equal((await rufe('PROPFIND', `${reg}/`, { auth: A, depth: '1' })).status, 207, 'lesen geht');
    assert.equal((await rufe('PUT', `${reg}/Neu.pdf`, { auth: A, body: PDF('n') })).status, 403);
    assert.equal((await rufe('PUT', `${reg}/Rechnung.pdf`, { auth: A, body: PDF('n') })).status, 403, 'auch keine neue Version');
    assert.equal((await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente.length, 1);
    // Post: Anlegen (C) am Post-Typ entziehen.
    const post = await d.postTyp();
    await d.aendereTyp(post.id, { ...post, berechtigungen: { grund: ALLES, regeln: [{ id: 'c', name: 'keine Post', wenn: [{ art: 'benutzer', benutzer: [anna.id] }], dann: { C: 'entziehen' }, stopp: false }] } });
    assert.equal((await rufe('PUT', '/webdav/Neue Post/Scan.pdf', { auth: A, body: PDF('s') })).status, 403);
    assert.equal((await d.seite({ id: anna.id, rolle: 'mitglied' }, { sicht: `typ:${post.id}` })).gesamt, 0);
  });

  it('neue Version landet per Id auf dem richtigen Dokument – auch bei gleichen oder kollidierenden Namen', async () => {
    const { d, wd, rufe, A, anna, v1a, namen } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const reg = `/webdav/Ablage/Verträge/V-1 (${v1a.id.replace(/-/g, '').slice(0, 6)})/Belege`;
    // Echte Duplikate: zweites „X.pdf“ (erst „X (2).pdf“, dann per neuer Version umbenannt).
    await d.ladeHoch(v1a.id, { register: 'belege', name: 'X.pdf' }, PDF('x1'), anna.id);
    const zweit = (await d.ladeHoch(v1a.id, { register: 'belege', name: 'X.pdf' }, PDF('x2'), anna.id)).dokument;
    assert.equal(zweit.name, 'X (2).pdf');
    await d.ersetzeDokument(zweit.id, { name: 'X.pdf' }, PDF('x2b'), anna.id);
    // Nach dem Bereinigen gleich: „a:b.pdf“ und „a_b.pdf“.
    await d.ladeHoch(v1a.id, { register: 'belege', name: 'a:b.pdf' }, PDF('ab1'), anna.id);
    await d.ladeHoch(v1a.id, { register: 'belege', name: 'a_b.pdf' }, PDF('ab2'), anna.id);
    const liste = await rufe('PROPFIND', `${reg}/`, { auth: A, depth: '1' });
    assert.deepEqual(namen(liste).slice(1).sort(), ['a_b (2).pdf', 'a_b.pdf', 'Rechnung.pdf', 'X (2).pdf', 'X.pdf'].sort());
    // Welches Dokument hinter welchem Laufwerksnamen steht: über den ETag (Id + Inhalt) im Listing.
    const vorher = (await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente;
    const hinter = (name: string) => {
      const m = new RegExp(`<D:displayname>${name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}</D:displayname>[\\s\\S]*?<D:getetag>&quot;([0-9a-f]{32})&quot;`).exec(liste.text);
      assert.ok(m, name);
      return vorher.find((x) => etagVon(x) === `"${m[1]}"`)!;
    };
    for (const name of ['X (2).pdf', 'X.pdf', 'a_b (2).pdf', 'a_b.pdf']) {
      const ziel = hinter(name);
      const stand = new Map((await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente.map((x) => [x.id, x.version ?? 1]));
      assert.equal((await rufe('PUT', `${reg}/${name}`, { auth: A, body: PDF(`neu ${name}`) })).status, 204, name);
      const nach = (await d.laufwerkMappe(v1a.id, await d.zugriff(anna))).dokumente;
      for (const x of nach) assert.equal(x.version ?? 1, (stand.get(x.id) ?? 1) + (x.id === ziel.id ? 1 : 0), `${name}: ${x.name}`);
      const z = nach.find((x) => x.id === ziel.id)!;
      assert.equal(z.name, ziel.name, 'Name bleibt');
      assert.equal(z.herkunft, 'webdav');
      assert.equal((await d.dokumentInhalt(z.id)).inhalt.toString(), PDF(`neu ${name}`).toString());
    }
  });

  it('Hilfsdateien werden nur gezählt; höchstens drei gleichzeitige Uploads je Benutzer (503 mit Retry-After)', async () => {
    const { wd, A, anna } = await aufbau();
    await wd.speichere({ aktiv: true }, 'admin');
    const put = (pfad: string, koerper: PassThrough | Buffer) => wd.anfrage({
      methode: 'PUT', url: pfad.split('/').map((t) => encodeURIComponent(t)).join('/'), ip: '10.3.0.1',
      kopf: (n) => (n === 'authorization' ? A : undefined), koerper,
    });
    // Hilfsdatei als Strom: wird leergelesen, nicht gepuffert.
    const h = new PassThrough();
    const hr = put('/webdav/Neue Post/.DS_Store', h);
    for (let i = 0; i < 10; i++) h.write(Buffer.alloc(64 * 1024));
    h.end();
    assert.equal((await hr).status, 201);
    // Drei laufende Uploads (Körper noch offen), der vierte wird abgewiesen.
    const stroeme = [new PassThrough(), new PassThrough(), new PassThrough()];
    const laufend = stroeme.map((st, i) => put(`/webdav/Neue Post/Scan ${i}.pdf`, st));
    const zaehler = () => (wd as unknown as { uploads: Map<string, number> }).uploads.get(anna.id) ?? 0;
    for (let i = 0; i < 200 && zaehler() < MAX_UPLOADS; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(zaehler(), MAX_UPLOADS);
    const voll = await put('/webdav/Neue Post/Scan 9.pdf', PDF('9'));
    assert.equal(voll.status, 503);
    assert.equal(voll.koepfe['retry-after'], '5');
    stroeme.forEach((st, i) => st.end(PDF(String(i))));
    for (const r of await Promise.all(laufend)) assert.equal(r.status, 201);
    assert.equal(zaehler(), 0);
    assert.equal((await put('/webdav/Neue Post/Scan 9.pdf', PDF('9'))).status, 201);
  });
});
