/**
 * Text setzen (#1040): Platzhalter einsetzen (Werte sind Text, kein Markdown; ein Durchgang), Lücken, Briefkopf aus der
 * eigenen Organisation bzw. der Person, Anschrift aus „von“, nur lesbare Werte, nie Passwortfelder, Prüfstelle beim
 * Herunterladen, Ablegen mit Recht Bearbeiten, getaggtes PDF (Sprache, Titel, Lesereihenfolge) mit Paket und Vorlage
 * in den Metadaten, Grenzen. Namen sind erfunden (Personas). Läuft im Arbeitsspeicher und – mit TEST_DATABASE_URL –
 * gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString, PDFRef } from 'pdf-lib';
import { laufText, mdMaskiert, setzeVorlage, type BriefBlock, type TextGesetzt, type VorlagenListe } from '../../shared/src/textsatz';
import { zerlege } from '../../shared/src/markdown';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { TEXTSATZ_SEITEN } from '../src/grenzen';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { Paketverwaltung } from '../src/pakete';
import { Tresor } from '../src/tresor';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage, type Antwort } from '../src/routen';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

const fehler = (s: number, re?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!re || re.test(e.message));
const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));

const TYPEN = `- schluessel: organisation
  name: Organisation
  felder:
    - { key: name, label: Name, typ: text, pflicht: true, erkennung: { art: name } }
    - { key: eigene_organisation, label: Eigene Organisation, typ: janein, standard: false, merkmal: eigeneOrganisation, schreibschutz: verwaltung }
    - { key: kundennummer, label: Kundennummer, typ: text }
    - { key: kennwort, label: Kennwort, typ: passwort }
    - { key: strasse, label: Straße, typ: text, erkennung: { art: strasse } }
    - { key: hausnummer, label: Hausnummer, typ: text, erkennung: { art: hausnummer } }
    - { key: plz, label: PLZ, typ: text, erkennung: { art: plz } }
    - { key: ort, label: Ort, typ: text, erkennung: { art: ort } }
    - { key: email, label: E-Mail, typ: text, format: email, erkennung: { art: email } }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name, eigene_organisation, kundennummer, kennwort, strasse, hausnummer, plz, ort, email] }
- schluessel: person
  name: Person
  felder:
    - { key: vorname, label: Vorname, typ: text, erkennung: { art: vorname } }
    - { key: nachname, label: Nachname, typ: text, pflicht: true, erkennung: { art: nachname } }
    - { key: strasse, label: Straße, typ: text, erkennung: { art: strasse } }
    - { key: hausnummer, label: Hausnummer, typ: text, erkennung: { art: hausnummer } }
    - { key: plz, label: PLZ, typ: text, erkennung: { art: plz } }
    - { key: ort, label: Ort, typ: text, erkennung: { art: ort } }
  register:
    - { key: daten, name: Daten, art: felder, felder: [vorname, nachname, strasse, hausnummer, plz, ort] }
- schluessel: vertragsart
  name: Vertragsart
  titelVorlage: "{name}"
  felder:
    - { key: name, label: Name, typ: text, pflicht: true }
  register:
    - { key: daten, name: Daten, art: felder, felder: [name] }
    - { key: vorlagen, name: Vorlagen, art: dokumente }
- schluessel: vertrag
  name: Vertrag
  titelVorlage: "{bezeichnung}"
  felder:
    - { key: bezeichnung, label: Bezeichnung, typ: text, pflicht: true }
    - { key: von, label: Anbieter, typ: referenz, ziel: organisation }
    - { key: an, label: Kunde, typ: referenz, ziel: [organisation, person] }
    - { key: art, label: Vertragsart, typ: referenz, ziel: vertragsart }
    - { key: vertragsnummer, label: Vertragsnummer, typ: text }
    - { key: kuendigen_bis, label: Kündigen bis, typ: datum }
    - { key: betrag, label: Betrag, typ: betrag }
    - { key: zugang, label: Zugang, typ: passwort }
    - { key: notiz, label: Notiz, typ: langtext }
  register:
    - { key: daten, name: Daten, art: felder, felder: [bezeichnung, von, an, art, vertragsnummer, kuendigen_bis, betrag, zugang, notiz] }
    - { key: dokumente, name: Dokumente, art: dokumente }
    - { key: briefe, name: Briefe, art: dokumente }
`;
const KUENDIGUNG = `# Kündigung Vertrag {vertragsnummer}

Sehr geehrte Damen und Herren,

hiermit kündige ich den Vertrag **{bezeichnung}** zum {kuendigen_bis}.
Kundennummer bei Ihnen: {von.kundennummer}
Monatlich: {betrag}

- Notiz: {notiz}
- Art: {art}

Mit freundlichen Grüßen

Muster ohne Gewähr, keine Rechtsberatung – im Zweifel fachlich prüfen lassen.
`;
const PAKET = {
  'manifest.yaml': `schema: 1\nid: vertraege\nname: Verträge\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.238.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  vorgaben: inhalt/vorgaben.yaml\n`,
  'inhalt/mappentypen.yaml': TYPEN,
  'inhalt/vorgaben.yaml': '- kennung: miete\n  typ: vertragsart\n  werte: { name: Miete }\n  vorlagen: [{ datei: vorlagen/kuendigung.md, titel: Kündigung }]\n',
  'inhalt/vorlagen/kuendigung.md': KUENDIGUNG,
};

const absatzText = (b: BriefBlock | undefined) => (b?.art === 'absatz' ? laufText(b.laeufe) : '');

describe('Text setzen: Platzhalter und Markdown (#1040)', () => {
  it('Werte sind Text, kein Markdown – ein Durchgang, keine Platzhalter in Platzhaltern', () => {
    const boese = '**fett** [Link](https://example.org) {vertragsnummer} <b>x</b> ![b](https://example.org/p.png)';
    const g = setzeVorlage('# Betreff {a}\n\nText *{a}* und {b}.\n', (n) => (n === 'a' ? { text: boese } : { luecke: 'Vertragsnummer' }));
    assert.equal(laufText(g.betreff!), `Betreff ${boese}`);
    assert.equal(g.bloecke.length, 1);
    const absatz = g.bloecke[0];
    assert.equal(absatz.art, 'absatz');
    if (absatz.art !== 'absatz') return;
    assert.equal(laufText(absatz.laeufe), `Text ${boese} und [Vertragsnummer].`);
    // Der Wert bleibt ein Stück, kursiv wie drumherum – nichts darin wird fett oder Link.
    const wert = absatz.laeufe.find((l) => l.text === boese)!;
    assert.deepEqual(wert, { text: boese, kursiv: true });
    assert.ok(absatz.laeufe.some((l) => l.luecke && l.text === '[Vertragsnummer]'));
    // Im ausgefüllten Text sind Werte maskiert – auch er liest sie als Text.
    const nochmal = zerlege(g.text);
    assert.equal(JSON.stringify(nochmal).includes('"art":"fett"'), false);
    assert.equal(JSON.stringify(nochmal).includes('"art":"link"'), false);
    assert.ok(!/\{vertragsnummer\}/.test(g.text), 'kein Platzhalter im ausgefüllten Text');
    assert.ok(g.text.includes('\\[Vertragsnummer\\]'));
  });
  it('Zeichen aus dem privaten Bereich in der Vorlage können keine Marke vortäuschen', () => {
    const g = setzeVorlage('A 0 {x}', () => ({ text: 'W' }));
    assert.equal(absatzText(g.bloecke[0]), 'A 0 W');
  });
  it('maskiert Listen- und Überschriftenanfänge in mehrzeiligen Werten', () => {
    assert.equal(mdMaskiert('- a\n1. b\n# c'), '\\- a\n1\\. b\n\\# c');
    assert.equal(mdMaskiert('12.345,00 €'), '12.345,00 €');
  });
  it('Links werden Text mit Adresse', () => {
    const g = setzeVorlage('Siehe [Hilfe](https://example.org/h).', () => ({ text: '' }));
    assert.equal(absatzText(g.bloecke[0]), 'Siehe Hilfe (https://example.org/h).');
  });
});

/** Text der PDF-Seiten (poppler) – null, wenn pdftotext fehlt. */
function pdfText(pdf: Buffer): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'dms-brief-'));
  try {
    writeFileSync(join(dir, 'b.pdf'), pdf);
    return execFileSync('pdftotext', ['-enc', 'UTF-8', join(dir, 'b.pdf'), '-'], { encoding: 'utf8' });
  } catch { return null; } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Strukturbaum: Arten der Elemente unter Document in Reihenfolge. */
async function struktur(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const kat = doc.catalog;
  const wurzel = kat.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  const k = wurzel.lookup(PDFName.of('K'), PDFArray);
  const dokument = doc.context.lookup(k.get(0), PDFDict);
  const arten = dokument.lookup(PDFName.of('K'), PDFArray).asArray().map((r) => (doc.context.lookup(r as PDFRef, PDFDict).get(PDFName.of('S')) as PDFName).decodeText());
  return {
    arten, seiten: doc.getPageCount(), lang: (kat.lookup(PDFName.of('Lang')) as PDFString | PDFHexString | undefined)?.decodeText(),
    markiert: String(kat.lookup(PDFName.of('MarkInfo'), PDFDict).get(PDFName.of('Marked'))), titel: doc.getTitle(), betreff: doc.getSubject(),
    anzeigeTitel: String(kat.lookup(PDFName.of('ViewerPreferences'), PDFDict)?.get(PDFName.of('DisplayDocTitle'))),
    tabs: String(doc.getPage(0).node.get(PDFName.of('Tabs'))),
  };
}

for (const pg of [false, true]) {
  describe(`Text setzen: Brief aus Vorlage (#1040)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau(name: string) {
      const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
      const tresor = new Tresor(speicherEinstellungen(), join(mkdtempSync(join(tmpdir(), 'dms-satz-')), 'dms.schluessel'), () => null);
      await tresor.laden(); await tresor.erzeuge();
      const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
      const konten = new Konten(r.konto, () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
      d.verbindeKonten(konten.papierkorbHaken());
      const { benutzer: katrin } = await konten.einrichten({ email: 'katrin@example.org', name: 'Katrin', passwort: 'ein-langes-passwort' });
      const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, katrin.id)).benutzer;
      await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
      const p = new Paketverwaltung(d, { version: () => '0.238.0', abruf: async (u) => { throw new Error(`404 ${u}`); }, katalogUrl: 'https://katalog.test/katalog.json' });
      const ICH = { id: katrin.id, email: katrin.email };
      const h = await p.hochladen(archiv(PAKET), ICH);
      const inst = await p.installiere({ upload: h.upload, bestaetigt: true, rechteBestaetigt: true }, ICH);
      const tabelle = routen(d, konten, {});
      const route = (m: string, pfad: string) => { const x = tabelle.find((y) => y.methode === m && y.pfad === pfad); assert.ok(x, `${m} ${pfad}`); return x!; };
      const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
      const als = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}): Promise<Antwort> =>
        route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: { ...(await ich(b.id)), rolle: 'mitglied' } } as Anfrage);
      const verwaltend = async (b: { id: string }, m: string, pfad: string, x: Partial<Anfrage> = {}) =>
        route(m, pfad).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, verwaltungsmodus: true, benutzer: { ...(await ich(b.id)), rolle: 'admin' } } as Anfrage);
      const miete = (await d.kern.repo.mappenMitVorgabe('paket:vertraege:miete'))[0];
      const wir = ((await verwaltend(katrin, 'POST', '/api/mappen', { body: { typId: inst.typen.organisation, werte: {
        name: 'Tischlerei Brandt', eigene_organisation: true, kundennummer: 'EIGEN-1', strasse: 'Hauptstraße', hausnummer: '5', plz: '01067', ort: 'Dresden', email: 'info@example.org',
      } } })).body as { id: string }).id;
      const anbieter = (await d.mappen.legeMappeAn({ typId: inst.typen.organisation, werte: { name: 'Stadtwerke Musterstadt', kundennummer: 'K-4711', kennwort: 'streng-geheim', strasse: 'Am Werk', hausnummer: '1', plz: '12345', ort: 'Musterstadt' } }, katrin.id)).id;
      const vertrag = (await d.mappen.legeMappeAn({ typId: inst.typen.vertrag, werte: {
        bezeichnung: 'Wohnung **Lena**', von: anbieter, art: miete.id, vertragsnummer: 'V-{art}-42', kuendigen_bis: '2026-12-31', betrag: { betrag: 650, waehrung: 'EUR' },
        zugang: { neu: 'auch-geheim' }, notiz: '- erste Zeile\n[Link](https://example.org)',
      } }, katrin.id)).id;
      return { d, konten, katrin, jonas, inst, als, verwaltend, miete, wir, anbieter, vertrag };
    }

    it('findet die Vorlage an der Vertragsart, zeigt fehlende Angaben und legt PDF und Text ab', async () => {
      const x = await aufbau('textsatz_ablegen');
      const liste = (await x.als(x.katrin, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe;
      assert.equal(liste.vorlagen.length, 1);
      const v = liste.vorlagen[0];
      assert.deepEqual([v.name, v.quelle.mappeId, v.paket?.id, v.absender, v.empfaenger], ['Kündigung', x.miete.id, 'vertraege', 'Tischlerei Brandt', 'Stadtwerke Musterstadt']);
      assert.deepEqual(v.platzhalter.filter((p) => p.fehlt).map((p) => [p.name, p.beschriftung]), [], 'alles da');
      assert.deepEqual(liste.register.map((r) => r.key), ['dokumente', 'briefe']);
      assert.equal(liste.ablegen, true);

      const r = (await x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId }, body: { register: 'briefe' } }));
      assert.equal(r.status, 201);
      const e = r.body as TextGesetzt;
      assert.match(e.pdf.name, /^Kündigung \d{4}-\d{2}-\d{2}\.pdf$/);
      assert.deepEqual([e.pdf.registerKey, e.pdf.mime, e.pdf.herkunft, e.text.registerKey, e.text.mime, e.text.herkunft], ['briefe', 'application/pdf', 'vorlage', 'briefe', 'text/markdown', 'vorlage']);
      assert.deepEqual(e.luecken, []);
      const pdf = await x.d.kern.liesGanz(e.pdf.sha256);
      const md = (await x.d.kern.liesGanz(e.text.sha256)).toString('utf8');
      // Werte als Text: maskiert, kein Platzhalter aus dem Wert, kein Passwort.
      assert.ok(md.includes('Wohnung \\*\\*Lena\\*\\*'), md);
      assert.ok(md.includes('V-\\{art\\}-42'));
      assert.ok(md.includes('\\- erste Zeile'));
      for (const nie of ['streng-geheim', 'auch-geheim']) assert.ok(!md.includes(nie) && !pdf.includes(nie));
      // Getaggtes PDF: Sprache, Titel (im Fenster), Lesereihenfolge Absender, Rücksendeangabe, Anschrift, Datum, Betreff, Text.
      const s = await struktur(pdf);
      assert.equal(s.lang, 'de-DE');
      assert.equal(s.markiert, 'true');
      assert.equal(s.titel, 'Kündigung Vertrag V-{art}-42');
      assert.equal(s.anzeigeTitel, 'true');
      assert.equal(s.tabs, '/S');
      assert.equal(s.betreff, 'Erzeugt von Paket Verträge mit Vorlage „Kündigung“');
      assert.deepEqual(s.arten.slice(0, 5), ['P', 'P', 'P', 'P', 'H1']);
      assert.ok(s.arten.includes('L'));
      const text = pdfText(pdf);
      if (text !== null) {
        for (const soll of ['Tischlerei Brandt', 'Stadtwerke Musterstadt', 'Am Werk 1', '12345 Musterstadt', 'Kündigung Vertrag V-{art}-42', 'Wohnung **Lena**', '31.12.2026', 'K-4711', '650,00', 'Miete', '[Link](https://example.org)']) {
          assert.ok(text.includes(soll), `im PDF: ${soll}\n${text}`);
        }
        assert.match(text, /Dresden, \d{2}\.\d{2}\.\d{4}/);
        assert.ok(text.indexOf('Stadtwerke Musterstadt') < text.indexOf('Kündigung Vertrag'), 'Anschrift vor Betreff');
      }
      // Die Vorlage bleibt unverändert.
      const doks = await x.d.kern.repo.listeDokumente(x.miete.id);
      assert.equal((await x.d.kern.liesGanz(doks[0].sha256)).toString('utf8'), KUENDIGUNG);
    });

    it('nur lesbare Werte: ohne Leserecht an der Organisation bleiben Kundennummer und Anschrift Lücken', async () => {
      const x = await aufbau('textsatz_rechte');
      // Jonas darf Verträge und Vertragsarten lesen und bearbeiten, Organisationen nicht.
      await x.d.kern.repo.setzeBerechtigungen(x.inst.typen.organisation, { grund: { C: false, R: false, U: false, D: false, P: false }, regeln: [] });
      const liste = (await x.als(x.jonas, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe;
      const v = liste.vorlagen[0];
      assert.deepEqual(v.platzhalter.filter((p) => p.fehlt).map((p) => [p.name, p.beschriftung, p.feld]), [['von.kundennummer', 'Anbieter', 'von']]);
      assert.equal(v.empfaenger, null);
      assert.equal(v.absender, 'Tischlerei Brandt', 'Briefkopf aus der eigenen Organisation über die feste Liste (#995)');
      const e = (await x.als(x.jonas, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId } })).body as TextGesetzt;
      assert.deepEqual(e.luecken, ['von.kundennummer']);
      assert.equal(e.pdf.registerKey, 'dokumente', 'ohne Wahl das Register „Dokumente“');
      const pdf = await x.d.kern.liesGanz(e.pdf.sha256);
      for (const nie of ['K-4711', 'Am Werk', 'Stadtwerke', 'EIGEN-1']) assert.ok(!pdf.includes(nie));
      const text = pdfText(pdf);
      if (text !== null) {
        assert.ok(text.includes('Kundennummer bei Ihnen: [Anbieter]'), text);
        assert.ok(!text.includes('Stadtwerke'), 'Anschrift nur lesbar');
        assert.ok(!text.includes('EIGEN-1'), 'Briefkopf nur die feste Liste');
      }
    });

    it('Passwortfelder nie – eigene Vorlage im Register „Vorlagen“ mit {zugang} oder {von.kennwort} wird abgelehnt', async () => {
      const x = await aufbau('textsatz_passwort');
      for (const platz of ['{zugang}', '{von.kennwort}']) {
        const dok = (await x.d.dokumente.ladeHoch(x.miete.id, { register: 'vorlagen', name: `eigen-${platz.length}.md`, typ: 'text/markdown' }, Buffer.from(`Zugang: ${platz}`), x.katrin.id)).dokument;
        await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: dok.id } }), fehler(422, /Passwortfeld/));
      }
      // HTML, das nachträglich in eine Vorlage kam, ebenso.
      const html = (await x.d.dokumente.ladeHoch(x.miete.id, { register: 'vorlagen', name: 'html.md', typ: 'text/markdown' }, Buffer.from('Hallo <img src=x>'), x.katrin.id)).dokument;
      await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: html.id } }), fehler(422, /HTML/));
      // Ein Dokument, das keine Vorlage dieser Mappe ist: 404.
      const fremd = (await x.d.dokumente.ladeHoch(x.vertrag, { register: 'dokumente', name: 'notiz.md', typ: 'text/markdown' }, Buffer.from('Hallo'), x.katrin.id)).dokument;
      await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: fremd.id } }), fehler(404));
    });

    it('Herunterladen geht durch die Prüfstelle; Ablegen braucht Bearbeiten', async () => {
      const x = await aufbau('textsatz_ausgang');
      const v = ((await x.als(x.katrin, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe).vorlagen[0];
      const gefragt: string[][] = [];
      // Ohne Ansicht mit Recht E sagt die echte Prüfstelle nein – hier sagt sie ja und merkt sich die Frage.
      await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId }, body: { ziel: 'herunterladen' } }), fehler(403, /Exportrecht/));
      x.d.ausgang.pruefeAusgang = async (_ich, _z, weg, ids) => { gefragt.push([weg, ...ids]); };
      const r = await x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId }, body: { ziel: 'herunterladen' } });
      assert.deepEqual(gefragt, [['herunterladen', x.vertrag]]);
      assert.equal(r.datei?.mime, 'application/pdf');
      assert.match(String(r.datei?.name), /^Kündigung .*\.pdf$/);
      assert.equal((await x.d.kern.repo.listeDokumente(x.vertrag)).length, 0, 'nichts abgelegt');
      // Darf die Prüfstelle nicht, geht nichts hinaus.
      x.d.ausgang.pruefeAusgang = async () => { throw new Fachfehler(403, 'nein'); };
      await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId }, body: { ziel: 'herunterladen' } }), fehler(403));
      // Nur Lesen am Vertrag: Liste ja, Ablegen 403.
      await x.d.kern.repo.setzeBerechtigungen(x.inst.typen.vertrag, { grund: { C: false, R: true, U: false, D: false, P: false }, regeln: [] });
      const l = (await x.als(x.jonas, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe;
      assert.equal(l.ablegen, false);
      await assert.rejects(x.als(x.jonas, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId } }), fehler(403));
      // Ohne Lesen an der Mappe: 404.
      await x.d.kern.repo.setzeBerechtigungen(x.inst.typen.vertrag, { grund: { C: false, R: false, U: false, D: false, P: false }, regeln: [] });
      await assert.rejects(x.als(x.jonas, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } }), fehler(404));
    });

    it('Briefkopf aus der Person im Feld „an“; ohne eigene Organisation und ohne „an“ kein Briefkopf', async () => {
      const x = await aufbau('textsatz_an');
      const lena = (await x.d.mappen.legeMappeAn({ typId: x.inst.typen.person, werte: { vorname: 'Lena', nachname: 'Beispiel', strasse: 'Lindenweg', hausnummer: '3', plz: '01099', ort: 'Dresden' } }, x.katrin.id)).id;
      await x.d.mappen.aendereMappe(x.vertrag, { werte: { an: lena } }, x.katrin.id);
      const v = ((await x.als(x.katrin, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe).vorlagen[0];
      assert.equal(v.absender, 'Lena Beispiel');
      const e = (await x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId } })).body as TextGesetzt;
      const text = pdfText(await x.d.kern.liesGanz(e.pdf.sha256));
      if (text !== null) { assert.ok(text.includes('Lena Beispiel · Lindenweg 3 · 01099 Dresden'), text); assert.ok(!text.includes('Tischlerei'), text); }
    });

    it('Grenze: mehr Seiten als erlaubt ergibt 413', async () => {
      const x = await aufbau('textsatz_grenze');
      await x.d.mappen.aendereMappe(x.vertrag, { werte: { notiz: 'Zeile mit etwas Text, der den Brief lang macht.\n'.repeat(TEXTSATZ_SEITEN * 60) } }, x.katrin.id);
      const v = ((await x.als(x.katrin, 'GET', '/api/mappen/:id/vorlagen', { params: { id: x.vertrag } })).body as VorlagenListe).vorlagen[0];
      await assert.rejects(x.als(x.katrin, 'POST', '/api/mappen/:id/vorlagen/:dokument/setzen', { params: { id: x.vertrag, dokument: v.dokumentId } }), fehler(413, new RegExp(`${TEXTSATZ_SEITEN} Seiten`)));
    });
  });
}
