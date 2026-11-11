/**
 * Passwörter und Geheimnisse gibt Ablago nie heraus (#1055).
 *
 * Der Test legt eine Ablage mit bekannten Testgeheimnissen an (Konto, Passwortfeld, E-Mail-Versand, Postfach mit
 * OAuth, Webhook, API-Schlüssel, Zwei-Faktor, Tresor, Sitzung) und durchsucht jede Ausgabe danach – roh, Base64,
 * Base64url, URL-kodiert und hexadezimal, dazu verschlüsselte Werte (`dms1$`) und Passwort-Hashes (`scrypt$`).
 *
 * Geprüft werden alle GET-Routen der Oberfläche und der API v1 (als Person mit „Gesamte Verwaltung“ im
 * Verwaltungsmodus) und die Exporte in `EXPORTE` unten. **Neue Exporte, Einrichtung, Nachweise und Vergleiche
 * (#1053) tragen sich in `EXPORTE` ein**; der letzte Test zählt die Routen, die nach Export aussehen, und schlägt
 * fehl, wenn eine weder geprüft noch mit Grund ausgenommen ist.
 *
 * Bewusst ausgenommen sind die beiden Wege für Menschen (admin/export.md): `passwoerter.csv` im Vollexport mit
 * ausdrücklicher Bestätigung und das Passwortfeld in der Mappe mit dem Recht „Passwörter sehen“ – beide mit frischer
 * Anmeldung und Protokoll. Ebenso das Notfallblatt (trägt den Schlüssel, nur mit „Verschlüsselung“).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { Betrieb, speicherBetrieb } from '../src/betrieb';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Einrichtung } from '../src/einrichtung';
import { speicherEinstellungen } from '../src/einstellungen';
import { findeGeheimnisse, GEHEIM_MUSTER, ohneGeheimnisse } from '../src/geheimnis-sperre';
import { GB } from '../src/grenzen';
import { Konten } from '../src/konten';
import { liesZip } from '../src/pakete';
import { Protokoll } from '../src/protokoll';
import { Postfaecher } from '../src/postfach';
import { PostfachOAuth } from '../src/postfach-oauth';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { vollexport } from '../src/vollexport';
import { Webhooks, speicherWebhookRepo } from '../src/webhook';
import { Zweifaktor } from '../src/zweifaktor';

type App = { inject(o: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }): Promise<{ statusCode: number; body: string; rawPayload: Buffer; headers: Record<string, string | string[]> }>; close(): Promise<void> };

/** Bekannte Testgeheimnisse: feste Werte und solche, die Ablago beim Anlegen erzeugt (unten ergänzt). */
const G: Record<string, string> = {
  kontoPasswort: 'Konto-Geheim-7f3a9c2e5b',
  passwortfeld: 'Feld-Geheim-91b0d4a6c3',
  mailPasswort: 'Mail-Geheim-4c8e21f0a9',
  postfachPasswort: 'Postfach-Geheim-6d2fb1e8',
  oauthRefresh: 'Refresh-Geheim-3a7c9e1d5f',
  oauthZugriff: 'Zugriff-Geheim-8b2d4f6a0c',
  oauthClientSecret: 'Client-Geheim-5e9a1c3b7d',
};

/**
 * Exporte, Einrichtung, Nachweise und Vergleiche: Name → erzeugt den Inhalt (Text oder Dateien). Routen, die einen
 * dieser Wege ausliefern, stehen in `routen`. Neue Wege (#1053) bitte hier eintragen.
 */
interface Export { routen: string[]; erzeuge(): Promise<string> }
let EXPORTE: Record<string, Export> = {};

/** Routen, die nach Export aussehen, aber keiner sind oder anders geschützt (mit Grund). */
const AUSGENOMMEN: Record<string, string> = {
  'GET /api/werkbank/export/:name/zip': 'liefert die Dateien des Vollexports aus – geprüft über „vollexport“',
  'GET /api/konto/export/zip': 'liefert die Dateien des persönlichen Exports – geprüft über „persoenlicher-export“',
  'GET /api/werkbank/export': 'Liste der Exporte (Name, Größe, Stand) – geprüft mit allen GET-Routen',
  'GET /api/konto/export': 'Stand des persönlichen Exports – geprüft mit allen GET-Routen',
  'GET /api/werkbank/einrichtung': 'Stand des Einrichtungsassistenten – geprüft mit allen GET-Routen',
  'POST /api/werkbank/pakete/erstellen/export': 'Paket aus der Paketerstellung: Inhalt kommt von der Person, keine Daten der Ablage',
  'GET /api/werkbank/pakete/selbst/:id/zip': 'selbst erstelltes Paket: Inhalt kommt von der Person, keine Daten der Ablage',
  'GET /api/sicherungen/:name/datei': 'Sicherungsdatei (verschlüsselt) für Pakete mit dms:sicherung-lesen – trägt bewusst alles',
  'GET /api/v1/sicherungen/:name/datei': 'Sicherungsdatei (verschlüsselt) für Pakete mit dms:sicherung-lesen – trägt bewusst alles',
  'GET /api/werkbank/loeschprotokoll/datei': 'Löschprotokoll (Titel, Zeit, Person) – geprüft mit allen GET-Routen',
  'GET /api/v1/werkbank/loeschprotokoll/datei': 'Löschprotokoll – geprüft mit allen GET-Routen',
};

/** Pfade, die nach Export, Einrichtung, Nachweis, Vergleich oder Diagnose aussehen. */
const EXPORTARTIG = /\/(export|auskunft|einrichtung|nachweise?|vergleich|diagnose|fehlermeldung|loeschprotokoll|compliance)\b|\/(zip|datei)$/;

/** Alle Fundstellen eines Inhalts. */
const funde = (text: string) => findeGeheimnisse(text, Object.values(G)).map((f) => f.replace(/^Geheimnis (\d+)/, (_, i: string) => Object.keys(G)[Number(i) - 1]));

describe('Geheimnisse gibt Ablago nie heraus (#1055)', () => {
  let app: App;
  let cookie = '';
  let alle: Array<{ methode: string; pfad: string; zugang: string; lesend?: boolean }> = [];
  const ids: Record<string, string> = {};
  const ordner: string[] = [];
  const rufe = (method: string, url: string, payload?: unknown, kopf: Record<string, string> = {}) => app.inject({ method, url, ...(payload !== undefined ? { payload } : {}), headers: { cookie, 'x-dms': '1', ...kopf } });

  before(async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dms-geheim-'));
    ordner.push(tmp);
    const einstellungen = speicherEinstellungen();
    const tresor = new Tresor(einstellungen, join(tmp, 'dms.schluessel'), () => null);
    await tresor.erzeuge();
    G.tresor = tresor.alsText()!;
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen, tresor });
    const kontoRepo = speicherKontoRepo();
    const konten = new Konten(kontoRepo, null, 'http://nas', d.systemtypen.benutzerspiegel());
    const zweifaktor = new Zweifaktor(einstellungen, (k) => tresor.verschluessele(k), (w) => tresor.entschluessele(w));
    konten.verbindeZweifaktor(zweifaktor);
    const lena = (await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: G.kontoPasswort })).benutzer;
    G.kontoHash = (await kontoRepo.holeHash(lena.email))!.hash!;

    const apiSchluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    G.apiSchluessel = (await apiSchluessel.lege(lena, { name: 'Laufwerk', recht: 'lesen' })).schluessel;

    const betrieb = new Betrieb(speicherBetrieb(), 'http://nas', tresor);
    await betrieb.laden();
    await betrieb.speichereMail({ host: 'smtp.example.org', port: 587, sicherheit: 'starttls', benutzer: 'versand@example.org', passwort: G.mailPasswort, absender: 'versand@example.org' }, lena.email);

    const webhooks = new Webhooks({ repo: speicherWebhookRepo(), einstellungen, verschluessele: (k) => tresor.verschluessele(k), entschluessele: (w) => tresor.entschluessele(w), zahlen: async () => ({}) as never, benutzer: async () => lena });
    await webhooks.setzeZiele(['https://hooks.example.org'], lena.email);
    const hook = await webhooks.lege(lena, { name: 'Zähler', url: 'https://hooks.example.org/a' });
    G.webhook = hook.geheimnis;
    ids.webhook = hook.id;

    // Postfächer (#196, #358): eins mit Passwort, eins mit OAuth (App mit Client-Geheimnis, Token wie nach der Anmeldung).
    const verschluessele = (k: string) => tresor.verschluessele(k);
    const entschluessele = (w: string) => tresor.entschluessele(w);
    const postfachOAuth = new PostfachOAuth({ einstellungen, verschluessele, entschluessele });
    await postfachOAuth.speichereApp('microsoft', { clientId: 'app-1', clientSecret: G.oauthClientSecret, tenant: 'common' }, lena.email);
    const postfaecher = new Postfaecher({ dienst: d, einstellungen, verbinde: async () => { throw new Error('ohne Netz'); }, lies: async () => { throw new Error('ohne Netz'); }, verschluessele, entschluessele, oauth: postfachOAuth });
    const [pfPw] = await postfaecher.speichere({ name: 'Büro', server: 'imap.example.org', benutzer: 'buero@example.org', passwort: G.postfachPasswort }, null, lena.email);
    const liste = await postfaecher.speichere({ name: 'Firma', server: 'outlook.office365.com', benutzer: 'dms@firma.example', anmeldung: 'oauth', anbieter: 'microsoft' }, null, lena.email);
    const pfOAuth = liste.find((x) => x.name === 'Firma')!;
    await einstellungen.schreibe(`postfach_oauth_${pfOAuth.id}`, { anbieter: 'microsoft', zugriff: verschluessele(G.oauthZugriff), aktualisierung: verschluessele(G.oauthRefresh), ablauf: new Date(Date.now() + 3600_000).toISOString(), oeffentlich: false, angemeldet: new Date().toISOString(), von: lena.email, zustand: 'ok', fehler: null, gemeldet: false, kennung: 'k1' });
    ids.postfach = pfPw.id; ids.postfachOAuth = pfOAuth.id; ids.anbieter = 'microsoft';

    const einrichtung = new Einrichtung({ konten, code: null, einstellungen, mandant: { name: async () => 'Familie Brandt', umbenennen: async () => {} } });

    const typ = await d.mappentypen.legeTypAn({ name: 'Zugang', titelVorlage: '{name}', felder: [{ key: 'name', label: 'Name', typ: 'text' }, { key: 'pw', label: 'Passwort', typ: 'passwort' }] });
    const mappe = await d.legeMappeAn({ typId: typ.id, werte: { name: 'Portal', pw: G.passwortfeld } }, lena.id);
    ids.typ = typ.id; ids.mappe = mappe.id; ids.benutzer = lena.id;

    const { baueApp } = await import('../src/http');
    app = await baueApp(d, konten, { tresor, betrieb, apiSchluessel, webhooks, einrichtung, postfaecher, postfachOAuth }) as unknown as App;
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email: lena.email, passwort: G.kontoPasswort }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    cookie = ([] as string[]).concat(r.headers['set-cookie'])[0].split(';')[0];
    G.sitzung = decodeURIComponent(cookie.split('=')[1]);
    assert.equal((await rufe('POST', '/api/konto/verwaltung', {})).statusCode, 200);

    // Zwei-Faktor einrichten: das TOTP-Geheimnis steht in der Antwort von „beginnen“ (nur dort, einmal).
    const z = await zweifaktor.beginne(lena);
    G.totp = (z as unknown as { geheimnis: string }).geheimnis;

    alle = routen(d, konten, { tresor, betrieb, apiSchluessel, webhooks, einrichtung, postfaecher, postfachOAuth });

    EXPORTE = {
      vollexport: {
        routen: ['POST /api/werkbank/export', 'GET /api/werkbank/export/:name/zip'],
        erzeuge: async () => {
          const ziel = await mkdtemp(join(tmpdir(), 'dms-geheim-export-'));
          ordner.push(ziel);
          const quelle = d.vollexportQuelle({ mandant: 'Familie Brandt', version: '0.0.0', benutzer: () => konten.exportDaten(), designs: async () => [], protokoll: () => [] });
          const e = await vollexport(quelle, ziel, {});
          return dateienAls(e.ordner);
        },
      },
      'persoenlicher-export': {
        routen: ['POST /api/konto/export', 'GET /api/konto/export/zip', 'POST /api/export'],
        erzeuge: async () => JSON.stringify(await konten.exportDatenVon(lena.id)),
      },
      einrichtungsdatei: {
        routen: ['POST /api/einrichtung/datei/schreiben'],
        // Wie der Assistent den Plan schickt: Passwörter im Klartext (sie werden beim Einrichten gebraucht).
        erzeuge: async () => {
          const mail = { aktiv: true, host: 'smtp.example.org', port: 587, benutzer: 'versand@example.org', passwort: G.mailPasswort, absender: 'versand@example.org' };
          const { text } = einrichtung.dateiSchreiben({ ablage: 'Familie Brandt', konto: { email: 'lena@example.org', name: 'Lena', passwort: G.kontoPasswort }, datenbank: { host: 'db', port: 5432, datenbank: 'ablago', benutzer: 'ablago', passwort: G.mailPasswort }, optional: { mail } });
          assert.match(text, /lena@example\.org[\s\S]*smtp\.example\.org/, 'Datei wirklich geschrieben');
          return text;
        },
      },
      diagnose: {
        routen: ['GET /api/konto/diagnose'],
        erzeuge: async () => { const r = await rufe('GET', '/api/konto/diagnose'); assert.equal(r.statusCode, 200, r.body); return r.body; },
      },
      auskunft: {
        routen: ['POST /api/werkbank/auskunft', 'POST /api/v1/werkbank/auskunft', 'GET /api/werkbank/auskunft/:id/zip', 'GET /api/v1/werkbank/auskunft/:id/zip'],
        // Auskunft über die Mappe mit Passwortfeld (#455): Inhalt der ZIP.
        erzeuge: async () => {
          const sich = await mkdtemp(join(tmpdir(), 'dms-geheim-auskunft-'));
          ordner.push(sich);
          const tabelle = routen(d, konten, { betrieb, tresor, sicherung: { ordner: sich } as never, exporte: { pfad: join(sich, 'export'), imSicherungsordner: false, volume: null } });
          const rufeH = async (m: string, pfad: string, x: Partial<Anfrage> = {}) => tabelle.find((r) => r.methode === m && r.pfad === pfad)!.handler({ body: {}, params: {}, query: {}, ip: '203.0.113.5', ...x, benutzer: { ...(await konten.listeBenutzer()).find((b) => b.id === lena.id)!, rolle: 'admin' } } as Anfrage);
          await rufeH('POST', '/api/werkbank/auskunft', { body: { mappeId: mappe.id, auswahl: { mappen: [mappe.id], dokumente: [], notizen: [], historie: [] }, geprueft: true, passwort: '' } });
          const f = await d.auftraege.warte();
          assert.equal(f?.status, 'fertig', f?.fehler);
          const id = (f!.ergebnis as { id: string }).id;
          const inhalt = (await rufeH('GET', '/api/werkbank/auskunft/:id/zip', { params: { id } })).datei!.inhalt as unknown as AsyncIterable<Buffer> | Buffer;
          const t: Buffer[] = [];
          if (Buffer.isBuffer(inhalt)) t.push(inhalt); else for await (const c of inhalt) t.push(c);
          const text = alsText(Buffer.concat(t));
          assert.match(text, /Portal/, 'Auskunft enthält die Mappe');
          return text;
        },
      },
      'ohne-geheimnisse': {
        routen: [],
        // Die zentrale Sperre selbst: was sie zurückgibt, enthält kein Geheimnis mehr.
        erzeuge: async () => JSON.stringify(ohneGeheimnisse({ passwort: G.kontoPasswort, liste: [{ token: G.oauthRefresh, clientSecret: G.oauthClientSecret }], wert: tresor.verschluessele(G.passwortfeld), hash: G.kontoHash })),
      },
    };
  });

  after(async () => { await app?.close(); for (const o of ordner) await rm(o, { recursive: true, force: true }); });

  it('die Testgeheimnisse sind echt angelegt', () => {
    for (const [k, v] of Object.entries(G)) assert.ok(typeof v === 'string' && v.length >= 10, `${k}: ${String(v)}`);
  });

  it('findeGeheimnisse erkennt roh, Base64, Base64url, URL- und Hex-Kodierung sowie dms1$ und scrypt$', () => {
    const s = 'Ein-Test/Geheimnis+mit=Zeichen';
    for (const k of [s, Buffer.from(s).toString('base64'), Buffer.from(s).toString('base64url'), encodeURIComponent(s), Buffer.from(s).toString('hex')]) {
      assert.equal(findeGeheimnisse(`vor ${k} nach`, [s]).length, 1, k);
    }
    assert.equal(findeGeheimnisse('{"w":"dms1$c2FsejEyMzQ1Ng:Z2VoZWltMTIzNDU2"}', []).length, 1);
    assert.equal(findeGeheimnisse('{"h":"scrypt$16384$8$1$c2Fseg==$aGFzaA=="}', []).length, 1);
    assert.deepEqual(findeGeheimnisse('nichts Geheimes hier', [s]), []);
    assert.ok(GEHEIM_MUSTER.length >= 2);
  });

  it('ohneGeheimnisse lässt nur „eingerichtet: ja/nein“ stehen', () => {
    const r = ohneGeheimnisse({ name: 'Postfach', passwort: 'x', clientSecret: '', tiefer: [{ refreshToken: 'y', wert: 'dms1$a:b' }], sha256: 'abc' }) as Record<string, unknown>;
    assert.deepEqual(r, { name: 'Postfach', passwort: { eingerichtet: true }, clientSecret: { eingerichtet: false }, tiefer: [{ refreshToken: { eingerichtet: true }, wert: { eingerichtet: true } }], sha256: 'abc' });
  });

  it('Systemprotokoll: Daten eines Eintrags ohne Geheimnisse', () => {
    const p = new Protokoll('info', () => {});
    p.schreibe('info', 'konto', 'Test', { passwort: G.kontoPasswort, wert: `dms1$${'a'.repeat(12)}:${'b'.repeat(12)}`, email: 'lena@example.org' });
    const e = p.eintraege({}).at(-1)!;
    assert.deepEqual(e.daten, { passwort: { eingerichtet: true }, wert: { eingerichtet: true }, email: 'lena@example.org' });
  });

  it('keine GET-Route liefert ein Geheimnis (Oberfläche und API v1, Gesamte Verwaltung)', async () => {
    const auffaellig: string[] = [];
    const kandidaten = Object.values(ids);
    let ok = 0;
    for (const r of alle.filter((x) => x.methode === 'GET')) {
      const urls = r.pfad.includes(':') ? kandidaten.map((id) => r.pfad.replace(/:[a-z]\w*/gi, encodeURIComponent(id))) : [r.pfad];
      for (const url of urls) {
        const a = await rufe('GET', url);
        if (a.statusCode === 200) ok++;
        if (process.env.GEHEIM_LOG) console.log(a.statusCode, url);
        const f = funde(alsText(a.rawPayload));
        if (f.length) auffaellig.push(`${r.methode} ${r.pfad} (${url}): ${f.join(', ')}`);
      }
    }
    assert.deepEqual(auffaellig, []);
    assert.ok(ok >= 140, `nur ${ok} GET-Routen mit 200 – Anmeldung oder Verwaltungsmodus fehlt?`);
  });

  it('kein Export, keine Einrichtung, kein Nachweis liefert ein Geheimnis', async () => {
    const auffaellig: string[] = [];
    for (const [name, e] of Object.entries(EXPORTE)) {
      const f = funde(await e.erzeuge());
      if (f.length) auffaellig.push(`${name}: ${f.join(', ')}`);
    }
    assert.deepEqual(auffaellig, []);
  });

  it('jede Route, die nach Export aussieht, ist geprüft oder mit Grund ausgenommen', () => {
    const geprueft = new Set(Object.values(EXPORTE).flatMap((e) => e.routen));
    const offen = alle.map((r) => `${r.methode} ${r.pfad}`).filter((k) => EXPORTARTIG.test(k.split(' ')[1]) && (k.startsWith('GET ') || /\/(export|datei\/schreiben|nachweise?|vergleich)$/.test(k)))
      .filter((k) => !geprueft.has(k) && !(k in AUSGENOMMEN) && !k.startsWith('GET '));
    assert.deepEqual(offen, [], 'Neuer Export? In EXPORTE eintragen (oder mit Grund in AUSGENOMMEN)');
    for (const k of [...geprueft, ...Object.keys(AUSGENOMMEN)]) assert.ok(alle.some((r) => `${r.methode} ${r.pfad}` === k), `${k} gibt es nicht mehr`);
  });
});

/** Inhalt als Text für die Suche; ZIP-Archive entpackt (alle Dateien hintereinander). */
function alsText(b: Buffer): string {
  if (b.subarray(0, 2).toString('latin1') !== 'PK') return b.toString('latin1');
  return [...liesZip(b, { dateien: 100_000, entpackt: GB }).values()].map((x) => alsText(x)).join('\n');
}

/** Alle Dateien eines Ordners als ein Text (für die Suche). */
async function dateienAls(o: string): Promise<string> {
  const teile: string[] = [];
  for (const e of await readdir(o, { recursive: true })) {
    const p = join(o, String(e));
    if ((await stat(p)).isFile()) teile.push(alsText(await readFile(p)));
  }
  return teile.join('\n');
}
