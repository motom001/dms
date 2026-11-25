/**
 * Erkennung lernt aus Korrekturen (#1681): Typ je Absender, Kennwort je Absender und Feld, verlernt von selbst nach zwei
 * Ablehnungen in Folge, Übersicht mit Löschen und „Alles vergessen“, Begründung, Vollexport. Firmen und Texte sind
 * erfunden (Personas Lena und Jonas Muster, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kennwortVor, lerne, VERLERNEN_NACH, wertNachKennwort, type Gelernt, type Lernanlass } from '../../shared/src/gelerntes';
import type { Feld, Register } from '../../shared/src/model';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { routen } from '../src/http/routen';
import { vollexport } from '../src/export/vollexport';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FELDER: Register = { key: 'allgemein', name: 'Allgemein', art: 'felder' };
const DOKS: Register = { key: 'dokumente', name: 'Dokumente', art: 'dokumente' };
const text = (key: string): Feld => ({ key, label: key, typ: 'text' }) as Feld;

const BRIEF = (konto: string) => `Stadtwerke Beispielstadt · Postfach 9 · 01067 Musterstadt
Lena Muster, Lindenweg 4, 01234 Beispielort

Ihre Abschlagszahlung
Kundennummer   K-4711        Vertragskonto: ${konto}
Bitte zahlen Sie 58,00 EUR. Fragen: service@example.org`;

describe('Gelerntes (rein, #1681)', () => {
  it('Kennwort vor dem Wert und Wert hinter dem Kennwort', () => {
    const t = BRIEF('8800-123');
    assert.equal(kennwortVor(t, text('vk'), '8800-123'), 'Vertragskonto:');
    assert.equal(kennwortVor(t, text('vk'), 'steht-nicht-da'), null);
    assert.deepEqual(wertNachKennwort(BRIEF('8800-999'), text('vk'), 'Vertragskonto:'), {
      wert: '8800-999',
      fundstelle: 'Vertragskonto: 8800-999',
    });
    assert.equal(wertNachKennwort('kein Kennwort hier', text('vk'), 'Vertragskonto:'), null);
  });

  it('Korrektur lernt den Typ; zweimal in Folge abgelehnt nimmt ihn zurück; bestätigt setzt zurück', () => {
    let n = 0;
    const l = (typId: string, korrektur: boolean, am: string): Lernanlass => ({
      absender: 'a',
      typId,
      post: 'p',
      von: 'u',
      am,
      korrektur,
      neueId: () => `id${++n}`,
    });
    let liste: Gelernt[] = lerne([], l('vertrag', false, '2026-11-01'));
    assert.equal(liste.length, 0, 'ohne Korrektur nichts gelernt');
    liste = lerne(liste, l('vertrag', true, '2026-11-02'));
    assert.deepEqual(
      liste.map((g) => [g.art, g.typId, g.abgelehnt]),
      [['typ', 'vertrag', 0]],
    );
    liste = lerne(liste, l('rechnung', false, '2026-11-03'));
    assert.equal(liste[0].abgelehnt, 1);
    liste = lerne(liste, l('vertrag', false, '2026-11-04'));
    assert.equal(liste[0].abgelehnt, 0, 'bestätigt: wieder von vorn');
    for (let i = 0; i < VERLERNEN_NACH; i++) liste = lerne(liste, l('rechnung', false, `2026-11-1${i}`));
    assert.equal(liste[0].zurueck, '2026-11-11', 'von selbst zurückgenommen');
  });
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena Muster', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const firma = await d.mappentypen.legeTypAn({
    name: 'Organisation',
    felder: [{ key: 'name', label: 'Name', typ: 'text', erkennung: { art: 'name' }, wiederfinden: true }],
    register: [{ ...FELDER, felder: ['name'] }, DOKS],
  });
  const abschlag = await d.mappentypen.legeTypAn({
    name: 'Abschlag',
    felder: [{ key: 'vk', label: 'Vertragskonto', typ: 'text', erkennung: {} }],
    register: [{ ...FELDER, felder: ['vk'] }, DOKS],
  });
  const rechnung = await d.mappentypen.legeTypAn({
    name: 'Rechnung',
    felder: [{ key: 'nr', label: 'Rechnungsnummer', typ: 'text' }],
    register: [{ ...FELDER, felder: ['nr'] }, DOKS],
  });
  const A = await d.rechtepruefung.zugriff({ id: lena.id, rolle: 'admin' });
  const werke = await d.mappen.legeMappeAn({ typId: firma.id, werte: { name: 'Stadtwerke Beispielstadt' } }, lena.id);
  /** Neue Post dieses Absenders mit einem Brief. */
  const post = async (inhalt: string) => {
    const p = await d.post.legePostAn({ betreff: 'Brief' }, { id: lena.id, name: 'Lena Muster' });
    const dok = (
      await d.dokumente.ladeHoch(
        p.id,
        { register: 'dokumente', name: 'brief.pdf', typ: 'application/pdf' },
        Buffer.from('%PDF-1.4 x'),
        lena.id,
      )
    ).dokument;
    await d.volltexte.schreibeVolltext(dok.id, { text: inhalt }, { id: lena.id, herkunft: 'Test', paket: false });
    await d.kern.repo.erkennungSchreibe(p.id, { eindeutig: werke.id }, werke.id);
    return { post: p, dok: dok.id };
  };
  /** Wie die Oberfläche: neue Mappe anlegen, Post zuordnen und auflösen, dabei lernen. */
  const zuordnen = async (p: { post: { id: string }; dok: string }, typId: string, werte: Record<string, unknown>, lernen: unknown) => {
    const g = d.erkennung.gelerntes;
    const absender = await g.absenderVon(p.post.id);
    const ziel = await d.mappen.legeMappeAn({ typId, werte }, lena.id);
    const e = { ziel: ziel.id, dokumente: [p.dok], aufloesen: true, lernen };
    await d.post.ordneZu(p.post.id, e, lena.id, A);
    await g.lerneAusZuordnen(absender, p.post.id, e, lena.id);
    return ziel;
  };
  return { d, konten, lena, A, werke, abschlag, rechnung, post, zuordnen };
}

describe('Gelerntes im Kern (#1681)', () => {
  it('Typ: aus einer Korrektur ein starker Beleg mit Begründung; Feld: Wert hinter dem gelernten Kennwort', async () => {
    const x = await aufbau();
    // Ablago schlug „Rechnung“ vor, Lena wählt „Abschlag“ und holt das Vertragskonto vom Dokument.
    const erste = await x.post(BRIEF('8800-123'));
    const ziel = await x.zuordnen(
      erste,
      x.abschlag.id,
      { vk: '8800-123' },
      {
        vorgeschlagen: { typId: x.rechnung.id, sicherheit: 0.4 },
        felder: [{ feld: 'vk', wert: '8800-123' }],
        bestaetigt: [],
      },
    );
    const zweite = await x.post(BRIEF('8800-456'));
    const k = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [zweite.dok] }, x.A);
    assert.equal(k.vorschlag?.typId, x.abschlag.id);
    const b = k.vorschlag!.belege.find((y) => y.weg === 'gelernt')!;
    assert.equal(b.sicherheit, 0.8);
    assert.equal(b.mappeId, ziel.id, 'aus welcher Mappe gelernt');
    assert.ok(k.bezuege[ziel.id]);
    assert.equal(b.gelernt?.von, x.lena.id);
    const f = await x.d.erkennung.fuerTyp(x.abschlag.id, { dokumente: [zweite.dok] }, x.A);
    assert.equal(f.vorschlaege.vk?.wert, '8800-456');
    assert.match(String(f.vorschlaege.vk?.hinweis), /gelernt aus einer Korrektur vom .*Vertragskonto:/);
    // Nur Kennwort, kein Wert aus dem Dokument im Gelernten.
    assert.doesNotMatch(JSON.stringify(await x.d.erkennung.gelerntes.alle()), /8800/);
  });

  it('verlernt von selbst nach zwei Ablehnungen in Folge; Übersicht, Löschen und „Alles vergessen“', async () => {
    const x = await aufbau();
    const lerne = { vorgeschlagen: { typId: x.rechnung.id, sicherheit: 0.9 }, felder: [], bestaetigt: [] };
    await x.zuordnen(await x.post(BRIEF('1')), x.abschlag.id, {}, lerne);
    // Zweimal „Rechnung“ gewählt, obwohl „Abschlag“ gelernt war.
    for (let i = 0; i < 2; i++)
      await x.zuordnen(
        await x.post(BRIEF('2')),
        x.rechnung.id,
        { nr: `R-${i}` },
        {
          vorgeschlagen: { typId: x.abschlag.id, sicherheit: 0.8 },
          felder: [],
          bestaetigt: [],
        },
      );
    const l = await x.d.erkennung.gelerntes.liste(x.A);
    const ab = l.find((g) => g.typId === x.abschlag.id)!;
    assert.ok(ab.zurueck, 'zurückgenommen');
    assert.equal(ab.absenderTitel, 'Stadtwerke Beispielstadt');
    const k = await x.d.erkennung.klassifizierung.klassifiziere({ dokumente: [(await x.post(BRIEF('3'))).dok] }, x.A);
    assert.ok(!k.typen.some((t) => t.typId === x.abschlag.id && t.belege.some((y) => y.weg === 'gelernt')));
    // Löschen je Eintrag und alles für den Absender.
    await x.d.erkennung.gelerntes.loesche(ab.id, 'lena@example.org');
    assert.ok(!(await x.d.erkennung.gelerntes.alle()).some((g) => g.id === ab.id));
    await assert.rejects(x.d.erkennung.gelerntes.loesche(ab.id, 'lena@example.org'), (e: { status?: number }) => e.status === 404);
    const rest = (await x.d.erkennung.gelerntes.alle()).length;
    assert.equal((await x.d.erkennung.gelerntes.vergiss(x.werke.id, 'lena@example.org')).geloescht, rest);
    assert.equal((await x.d.erkennung.gelerntes.alle()).length, 0);
    // Routen der Werkbank: nur mit Verwaltungsrecht.
    const r = routen(x.d, x.konten, {}).filter((y) => y.pfad.startsWith('/api/werkbank/erkennung/gelerntes'));
    assert.deepEqual(
      r.map((y) => `${y.methode} ${y.zugang}`),
      ['GET admin', 'DELETE admin', 'DELETE admin'],
    );
  });

  it('Gelerntes steht im Vollexport (struktur/gelerntes.json)', async () => {
    const x = await aufbau();
    const lernen = { vorgeschlagen: { typId: x.rechnung.id, sicherheit: 0.9 }, felder: [], bestaetigt: [] };
    await x.zuordnen(await x.post(BRIEF('1')), x.abschlag.id, {}, lernen);
    const quelle = x.d.vollexport.vollexportQuelle({
      mandant: 'Familie Muster',
      version: '0.0.0',
      benutzer: () => x.konten.exportDaten(),
      designs: async () => [],
      protokoll: () => [],
      gelerntes: () => x.d.erkennung.gelerntes.alle(),
    });
    const ordner = await mkdtemp(join(tmpdir(), 'k49k-gelernt-'));
    try {
      const r = await vollexport(quelle, ordner, {});
      const g = JSON.parse(await readFile(join(r.ordner, 'struktur/gelerntes.json'), 'utf8')) as Array<{ typId: string }>;
      assert.deepEqual(
        g.map((y) => y.typId),
        [x.abschlag.id],
      );
    } finally {
      await rm(ordner, { recursive: true, force: true });
    }
  });
});
