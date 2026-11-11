/**
 * KI-Dienste und Mappentypen (#796): KI-Pakete (Netz und Zugriff auf Inhalte) bekommen nur Inhalte aus Mappentypen,
 * die für KI-Dienste zugelassen sind – über die Läufer-API (Lesen), Ereignisse, Aufträge, Nachberechnung der
 * Vektoren, „Frag deine Ablage“, „Aus Dokument ausfüllen“ und Übersetzen. Neue Mappentypen sind gesperrt, bis der
 * Administrator sie zulässt; Migration 092 lässt bestehende zu. Namen und Texte sind erfunden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FRAGEN_STANDARD, type FrageZeile } from '../../shared/src/fragen';
import { HILFE } from '../../shared/src/hilfe';
import { EREIGNISSE, INHALT_EREIGNISSE, istKiPaket, liesCode, rechtePunkte, type InstalliertesPaket, type PaketCode } from '../../shared/src/pakete';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { pgEinstellungen, speicherEinstellungen } from '../src/einstellungen';
import type { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';

/** Uhr vorstellen (Bündelung der Ereignisse), danach zurück. */
async function spaeter<T>(ms: number, f: () => Promise<T>): Promise<T> {
  const echt = Date.now;
  Date.now = () => echt() + ms;
  try { return await f(); } finally { Date.now = echt; }
}

const code = (x: Record<string, unknown>): PaketCode => { const r = liesCode({ sprache: 'c', ...x }); assert.deepEqual(r.fehler, []); return r.code!; };
const paket = (id: string, c: PaketCode): InstalliertesPaket => ({
  id, name: id === 'wolke' ? 'KI Wolke' : 'Im Haus', version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.153.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: { ...c, modul: { sha256: 'x', groesse: 1 } },
});
/** Wie „KI lokal – Ähnlichkeit“, aber mit Netz: liest alles, bekommt volltext.fertig und Mappen-Ereignisse. */
const WOLKE = { ereignisse: ['volltext.fertig', 'mappe.angelegt', 'datei.volltext'], mappentypen: ['*'], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:antworten', 'dms:erkennen', 'dms:volltext', 'dms:vektoren'] }, volltext: ['application/rtf'], netz: ['https://ki.example.org/v1'] };
const IM_HAUS = { ...WOLKE, netz: [] };

async function aufbau(repo: Repo = speicherRepo()) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const register = [{ key: 'allgemein', name: 'Allgemein', art: 'felder' as const }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' as const }];
  const gesundheit = await d.mappentypen.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'titel', label: 'Titel', typ: 'text', erkennung: {} }], register });
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'titel', label: 'Titel', typ: 'text', erkennung: {} }, { key: 'bezug', label: 'Bezug', typ: 'referenz', zielTyp: gesundheit.id }], register });
  const befund = await d.legeMappeAn({ typId: gesundheit.id, werte: { titel: 'Befund Knie' } }, lena.id);
  const strom = await d.legeMappeAn({ typId: vertrag.id, werte: { titel: 'Stromvertrag', bezug: befund.id } }, lena.id);
  const dok = async (m: string, name: string, text: string) => {
    const x = (await d.ladeHoch(m, { register: 'dokumente', name, typ: 'application/pdf' }, Buffer.from(`%PDF-1.4 ${name}`), lena.id)).dokument;
    await d.schreibeVolltext(x.id, { text }, { id: lena.id, herkunft: 'Test', paket: false });
    return x.id;
  };
  const kniebrief = await dok(befund.id, 'knie.pdf', 'Diagnose: Meniskusriss im Knie. Versicherung zahlt die Behandlung.');
  const stromrechnung = await dok(strom.id, 'strom.pdf', 'Ihre Versicherung und Ihr Stromvertrag: Abschlag 80 Euro im Monat.');
  await d.kern.repo.speicherePaket(paket('wolke', code(WOLKE)));
  await d.kern.repo.speicherePaket(paket('imhaus', code(IM_HAUS)));
  const L = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const alsPaket = (id: string) => d.rechtepruefung.zugriff({ id: `konto-${id}`, rolle: 'mitglied', art: 'dienst', paketId: id });
  return { d, repo, konten, lena, gesundheit, vertrag, befund, strom, kniebrief, stromrechnung, L, alsPaket };
}

describe('KI-Dienste (#796): Was ist ein KI-Paket?', () => {
  it('Netz und Zugriff auf Inhalte; Pakete ohne Netz und die Kopie außer Haus nicht', () => {
    assert.equal(istKiPaket(code({ rechte: { schnittstellen: ['dms:antworten', 'dms:erkennen'] }, netz: ['https://ki.example.org'] })), true, 'wie KI-Assistent');
    assert.equal(istKiPaket(code({ rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:vektoren'] }, ereignisse: ['volltext.fertig'], netz: [] })), false, 'KI lokal rechnet im Haus');
    assert.equal(istKiPaket(code({ rechte: { schnittstellen: ['dms:sicherung-lesen'] }, ereignisse: ['sicherung.fertig'], netz: ['https://cloud.example.org'] })), false, 'Sicherung ist verschlüsselt');
    assert.equal(istKiPaket(code({ rechte: { lesen: ['notiz'] }, netz: ['https://api.example.org'] })), true, 'liest Mappen und darf ins Netz');
    assert.equal(istKiPaket(code({ rechte: {}, netz: ['https://api.example.org'] })), false, 'ohne Inhalte');
    // Nur Ereignisse, ohne Rechte (Sicherheit zu #796): Dateinamen, Ids und „Für“ sind Inhalt.
    assert.equal(istKiPaket(code({ rechte: {}, ereignisse: ['dokument.hochgeladen'], netz: ['https://api.example.org'] })), true, 'Dokument-Ereignis');
    assert.equal(istKiPaket(code({ rechte: {}, ereignisse: ['post.angelegt'], netz: ['https://api.example.org'] })), true, 'Post-Ereignis');
    assert.equal(istKiPaket(code({ rechte: {}, ereignisse: ['post.angelegt'], netz: [] })), false, 'ohne Netz nie');
    assert.ok(INHALT_EREIGNISSE.includes('volltext.fertig') && !INHALT_EREIGNISSE.includes('sicherung.fertig'));
    assert.deepEqual(Object.keys(EREIGNISSE).filter((e) => !INHALT_EREIGNISSE.includes(e as never)).sort(), ['paket.einstellungen_geaendert', 'sicherung.fertig', 'zeitplan.ausgefuehrt'], 'neue Ereignisarten zählen als Inhalt');
    // #1082: zeitplan.ausgefuehrt trägt nur Id der Automatisierung, Aufgabe, Datum und Zeitpunkt – bewusst ohne Inhalt.
    assert.equal(istKiPaket(code({ rechte: {}, ereignisse: ['zeitplan.ausgefuehrt'], netz: ['https://api.example.org'] })), false, 'Zeitplan');
  });

  it('Rechte-Vorschau nennt die Regel mit Handbuch-Stelle – nur bei KI-Paketen', () => {
    const name = (v: string) => v;
    assert.ok(rechtePunkte(code(WOLKE), name).some((p) => p.hilfe === 'pakete.ki' && /KI-Dienst/.test(p.text)));
    assert.ok(!rechtePunkte(code(IM_HAUS), name).some((p) => p.hilfe === 'pakete.ki'));
    assert.equal(HILFE['pakete.ki'].anker, 'ki-dienste');
    assert.equal(HILFE['pakete.netzprotokoll'].anker, 'netzaufrufe');
  });
});

describe('KI-Dienste (#796): Sperre im Kern', () => {
  it('neue Mappentypen sind gesperrt: das KI-Paket liest sie nicht (Läufer-API), das Paket ohne Netz schon; Zulassen wirkt sofort', async () => {
    const x = await aufbau();
    const wolke = await x.alsPaket('wolke');
    assert.equal(wolke.typen.size, 0, 'nichts zugelassen');
    await assert.rejects(x.d.rechtepruefung.pruefeRecht(wolke, x.befund.id, 'R'), (e: Fachfehler) => e.status === 404);
    const imHaus = await x.alsPaket('imhaus');
    assert.ok(imHaus.typen.has(x.gesundheit.id) && imHaus.typen.has(x.vertrag.id), 'ohne Netz wie bisher');
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, 'lena@example.org');
    const danach = await x.alsPaket('wolke');
    assert.ok(danach.typen.has(x.vertrag.id) && !danach.typen.has(x.gesundheit.id));
    await x.d.rechtepruefung.pruefeRecht(danach, x.strom.id, 'R');
    await assert.rejects(x.d.rechtepruefung.pruefeRecht(danach, x.befund.id, 'R'), (e: Fachfehler) => e.status === 404);
    // Übersicht für die Werkbank: Typen mit „zugelassen“, KI-Pakete mit dem, was sie bekommen.
    const k = await x.d.ki.kiUebersicht();
    assert.deepEqual(k.pakete.map((p) => [p.id, p.bekommt]), [['wolke', [x.vertrag.id]]], 'nur das KI-Paket');
    assert.ok(!k.typen.some((t) => t.system === 'benutzer'), 'Benutzer nie');
    assert.equal(k.hinweis, false, 'frische Installation: kein Hinweis');
    const benutzer = (await x.d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
    await assert.rejects(x.d.ki.setzeKiTyp(benutzer.id, true, null), (e: Fachfehler) => e.status === 422);
    await x.d.ki.setzeKiTyp(x.vertrag.id, false, null);
    assert.equal((await x.alsPaket('wolke')).typen.size, 0, 'wieder gesperrt');
  });

  it('Ereignisse: volltext.fertig und Mappen-Ereignisse zu gesperrten Typen gehen nicht an das KI-Paket (auch kein Dateiname)', async () => {
    const x = await aufbau();
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    await x.d.schreibeVolltext(x.kniebrief, { text: 'Neu: Knie operiert.' }, { id: x.lena.id, herkunft: 'Test', paket: false });
    await x.d.schreibeVolltext(x.stromrechnung, { text: 'Neu: Abschlag 85 Euro.' }, { id: x.lena.id, herkunft: 'Test', paket: false });
    await x.d.legeMappeAn({ typId: x.gesundheit.id, werte: { titel: 'Zahnarzt' } }, x.lena.id);
    const neuerVertrag = await x.d.legeMappeAn({ typId: x.vertrag.id, werte: { titel: 'Handy' } }, x.lena.id);
    await spaeter(10_000, () => x.d.ereignisse.verteile());
    const alle = await spaeter(30 * 60_000, () => x.repo.faelligeEreignisse(200));
    const wolke = alle.filter((e) => e.paketId === 'wolke');
    assert.ok(wolke.some((e) => e.art === 'volltext.fertig' && e.daten.dokument === x.stromrechnung));
    assert.ok(wolke.some((e) => e.art === 'mappe.angelegt' && e.daten.mappe === neuerVertrag.id));
    assert.ok(!wolke.some((e) => e.daten.mappe === x.befund.id || e.daten.typ === x.gesundheit.id), JSON.stringify(wolke.map((e) => [e.art, e.daten.typ])));
    const imHaus = alle.filter((e) => e.paketId === 'imhaus');
    assert.ok(imHaus.some((e) => e.art === 'volltext.fertig' && e.daten.dokument === x.kniebrief), 'ohne Netz wie bisher');
  });

  it('Paket mit Netz, nur „Dokument hochgeladen“, ohne Rechte: nichts aus gesperrten Typen, auch kein Dateiname', async () => {
    const x = await aufbau();
    await x.d.kern.repo.speicherePaket(paket('melder', code({ rechte: {}, ereignisse: ['dokument.hochgeladen'], netz: ['https://melder.example.org/v1'] })));
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    const hoch = (m: string, name: string) => x.d.ladeHoch(m, { register: 'dokumente', name, typ: 'application/pdf' }, Buffer.from(`%PDF-1.4 ${name}`), x.lena.id);
    await hoch(x.befund.id, 'roentgen-knie.pdf');
    const ok = (await hoch(x.strom.id, 'zaehlerstand.pdf')).dokument;
    await spaeter(10_000, () => x.d.ereignisse.verteile());
    const melder = (await spaeter(30 * 60_000, () => x.repo.faelligeEreignisse(200))).filter((e) => e.paketId === 'melder');
    assert.deepEqual(melder.map((e) => e.daten.dokument), [ok.id]);
    assert.ok(!JSON.stringify(melder).includes('roentgen'), 'kein Dateiname aus dem gesperrten Typ');
    // Übersicht: Es bekommt alle zugelassenen Typen (Ereignisse ohne Leserecht).
    assert.deepEqual((await x.d.ki.kiUebersicht()).pakete.find((p) => p.id === 'melder')?.bekommt, [x.vertrag.id]);
  });

  it('„Wohin gehört das?“ (#939): Ein KI-Paket mit dms:klassifizieren bekommt Text aus allen zugelassenen Typen – auch ohne Leserecht', async () => {
    const x = await aufbau();
    await x.d.kern.repo.speicherePaket(paket('sortierer', code({ rechte: { schnittstellen: ['dms:klassifizieren'] }, netz: ['https://ki.example.org/v1'] })));
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    assert.deepEqual((await x.d.ki.kiUebersicht()).pakete.find((p) => p.id === 'sortierer')?.bekommt, [x.vertrag.id], 'zugelassene Typen, nicht der gesperrte');
  });

  it('Aufträge (datei.volltext) und Nachberechnung der Vektoren: nichts aus gesperrten Typen', async () => {
    const x = await aufbau();
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    const vorher = (await x.repo.faelligeEreignisse(500)).length;
    assert.equal(await x.d.auftrag('wolke', 'datei.volltext', { dokument: x.kniebrief, mappe: x.befund.id }), 'gesperrt');
    assert.equal((await x.repo.faelligeEreignisse(500)).length, vorher, 'gesperrt: kein Auftrag');
    await x.d.auftrag('wolke', 'datei.volltext', { dokument: x.stromrechnung, mappe: x.strom.id });
    assert.equal((await x.repo.faelligeEreignisse(500)).length, vorher + 1);
    const ids = await x.d.vektorNachlauf('wolke', 'modell-a', 50, null);
    assert.ok(ids.includes(x.kniebrief) && ids.includes(x.stromrechnung), 'Stelle rückt über alle weiter');
    const nach = (await x.repo.faelligeEreignisse(500)).filter((e) => e.paketId === 'wolke' && e.daten.nachberechnung);
    assert.deepEqual(nach.map((e) => e.daten.dokument), [x.stromrechnung]);
  });

  it('„Frag deine Ablage“: Ausschnitte und Titel verknüpfter Mappen nur aus zugelassenen Typen', async () => {
    const x = await aufbau();
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    const eingaenge: Array<Record<string, unknown>> = [];
    x.d.fragen.anbieter = { paket: () => ({ id: 'wolke', name: 'KI Wolke' }), antworte: async (_p, e) => { eingaenge.push(e); return { text: 'Siehe [1].', ms: 1 }; } };
    const zeilen: FrageZeile[] = [];
    await x.d.fragen.frage(x.L, { frage: 'Was zahlt die Versicherung?' }, (z) => zeilen.push(z));
    const geschickt = JSON.stringify(eingaenge[0]);
    assert.match(geschickt, /Abschlag 80 Euro/);
    assert.ok(!/Meniskus|Befund Knie|Knie/.test(geschickt), geschickt);
    // Ohne Paket mit Netz (z. B. im Haus) wie bisher: auch Gesundheit.
    const alle = await x.d.fragen.ausschnitte(x.L, 'Was zahlt die Versicherung?', [], FRAGEN_STANDARD);
    assert.ok(alle.some((a) => a.mappe.id === x.befund.id));
  });

  it('„Aus Dokument ausfüllen“: Ziel oder Quelle gesperrt → nichts an das Paket, eingebaute Erkennung mit Hinweis', async () => {
    const x = await aufbau();
    const gerufen: Array<Record<string, unknown>> = [];
    x.d.erkennung.anbieter = { pakete: () => [{ id: 'wolke', name: 'KI Wolke', netz: true }], erkenne: async (_p, e) => { gerufen.push(e); return { text: '{"titel":{"wert":"Vom Paket"}}', ms: 1 }; } };
    await x.d.erkennung.setzeStandard({ paket: 'wolke', abfluss: true });
    await x.d.ki.setzeKiTyp(x.vertrag.id, true, null);
    const quelleGesperrt = await x.d.erkennung.fuerTyp(x.vertrag.id, { dokumente: [x.kniebrief] }, x.L);
    assert.deepEqual(quelleGesperrt.engine, { art: 'eingebaut' });
    assert.match(String(quelleGesperrt.hinweis), /Gesundheit/);
    const zielGesperrt = await x.d.erkennung.fuerTyp(x.gesundheit.id, { text: 'Befund vom Mai' }, x.L);
    assert.deepEqual(zielGesperrt.engine, { art: 'eingebaut' });
    assert.equal(gerufen.length, 0, 'nichts ging an das Paket');
    const ok = await x.d.erkennung.fuerTyp(x.vertrag.id, { dokumente: [x.stromrechnung] }, x.L);
    assert.deepEqual(ok.engine, { art: 'paket', id: 'wolke', name: 'KI Wolke' });
    assert.equal(gerufen.length, 1);
  });

  it('Routen: Werkbank liest und setzt; Hinweis „Verstanden“ über die Übersicht', async () => {
    const x = await aufbau();
    const tabelle = routen(x.d, x.konten, {});
    const r = (m: string, p: string) => tabelle.find((y) => y.methode === m && y.pfad === p)!;
    const ich = (await x.konten.listeBenutzer()).find((u) => u.id === x.lena.id)!;
    const a = (params: Record<string, string>, body: unknown = {}) => ({ body, params, query: {}, ip: '1', benutzer: ich });
    const g = (await r('PUT', '/api/werkbank/ki-typen/:typId').handler(a({ typId: x.gesundheit.id }, { zugelassen: true }))).body as { typen: Array<{ id: string; zugelassen: boolean }> };
    assert.equal(g.typen.find((t) => t.id === x.gesundheit.id)!.zugelassen, true);
    // Nach dem Update (Migration 092) steht „hinweis“ in der Einstellung – die Übersicht zeigt ihn, „Verstanden“ nimmt ihn weg.
    await x.d.kern.einstellungen!.schreibe('ki_typen', { zugelassen: [x.gesundheit.id], hinweis: true });
    const u1 = (await r('GET', '/api/werkbank/uebersicht').handler(a({}))).body as { kiTypen?: { pakete: Array<{ id: string }> } | null };
    assert.deepEqual(u1.kiTypen?.pakete.map((p) => p.id), ['wolke']);
    await r('POST', '/api/werkbank/uebersicht/erledigt').handler(a({}, { schluessel: 'ki.typen' }));
    const u2 = (await r('GET', '/api/werkbank/uebersicht').handler(a({}))).body as { kiTypen?: unknown };
    assert.equal(u2.kiTypen ?? null, null);
    assert.deepEqual([...(await x.d.ki.kiTypen()).zugelassen], [x.gesundheit.id], 'Zulassung bleibt');
  });
});

describe('KI-Dienste (#796): Migration 092 – PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('frische Installation: nichts zugelassen; nach dem Update bleiben bestehende Typen zugelassen, neue nicht', async () => {
    const db = await eigeneDatenbank('ki_typen');
    const { pgRepo } = await import('../src/repo-pg');
    const H = '00000000-0000-4000-8000-000000000001';
    try {
      assert.equal((await db.sql`SELECT 1 FROM einstellungen WHERE schluessel = 'ki_typen'`).length, 0, 'ohne Mappentypen keine Einstellung');
      const repo = pgRepo(db.sql, H) as never as Repo;
      const d = new Dienst(repo, speicherDateien(), { einstellungen: pgEinstellungen(db.sql, H) });
      const alt = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }] });
      const benutzer = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer');
      // So, als käme das Update jetzt: Migration 092 noch einmal ausführen.
      await db.sql.unsafe(readFileSync(`${MIGRATIONEN}/092_ki_typen.sql`, 'utf8'));
      const [e] = await db.sql<Array<{ wert: { zugelassen: string[]; hinweis: boolean } }>>`SELECT wert FROM einstellungen WHERE schluessel = 'ki_typen'`;
      assert.ok(e.wert.zugelassen.includes(alt.id));
      assert.equal(e.wert.hinweis, true);
      if (benutzer) assert.ok(!e.wert.zugelassen.includes(benutzer.id), 'Benutzer nie');
      const neu = await d.mappentypen.legeTypAn({ name: 'Gesundheit', felder: [{ key: 'titel', label: 'Titel', typ: 'text' }] });
      const [e2] = await db.sql<Array<{ wert: { zugelassen: string[] } }>>`SELECT wert FROM einstellungen WHERE schluessel = 'ki_typen'`;
      assert.ok(!e2.wert.zugelassen.includes(neu.id), 'neuer Typ gesperrt');
      // Noch einmal ausgeführt ändert nichts (ON CONFLICT).
      await db.sql.unsafe(readFileSync(`${MIGRATIONEN}/092_ki_typen.sql`, 'utf8'));
      const [e3] = await db.sql<Array<{ wert: { zugelassen: string[] } }>>`SELECT wert FROM einstellungen WHERE schluessel = 'ki_typen'`;
      assert.ok(!e3.wert.zugelassen.includes(neu.id));
    } finally { await db.ende(); }
  });
});
