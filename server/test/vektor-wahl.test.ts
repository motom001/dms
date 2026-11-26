/**
 * „Vektoren von“ (#1707): Mit zwei Paketen mit dms:vektoren wählt der Haushalts-Admin, welches rechnet. Ohne Wahl wie
 * bisher das erste nach Id; ein Wechsel rechnet den Bestand nach, die Suche bleibt so lange beim bisherigen Paket, danach
 * verschwinden dessen Vektoren. Der Paket-Läufer ist hier ohne Läufer-Prozess: `rufe` antwortet wie ein Paket.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/anmeldung/apischluessel';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { routen } from '../src/http/routen';
import type { Anfrage } from '../src/http/routen-typen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { speicherRepo } from '../src/repo/speicher';
import type { InstalliertesPaket } from '../../shared/src/pakete';

const ALT = 'ki_aehnlich';
const NEU = 'ki_genau';
const MODELL: Record<string, string> = { [ALT]: 'aehnlich/8', [NEU]: 'genau/8' };
const V = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  const l = new Paketlaeufer({
    dienst: d,
    konten,
    schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()),
    api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }),
    einstellungen: async () => ({}),
    speicher: { lies: async () => ({}), schreibe: async () => {} },
    grenzen: { sekunden: 5, speicherMB: 16 },
  });
  const x = l as unknown as Record<string, unknown>;
  x.laeuft = () => true;
  // Zustellen übernimmt hier `paketRechnet` – Schritt für Schritt.
  x.stelleZu = async () => {};
  // Wie ein Paket: „dms:vektor“ nennt das Modell des gefragten Pakets.
  x.rufe = async (paket: string) => ({ ok: true, text: JSON.stringify({ modell: MODELL[paket], vektor: Array.from(V) }), ms: 1 });
  const post = await d.post.legePostAn({ betreff: 'Strom' }, { id: null, name: 'Test' });
  const reg = (await d.systemausstattung.sicherstellen()).post.register.find((r) => r.art === 'dokumente')!.key;
  const dokument = async (name: string) => {
    const id = (await d.dokumente.ladeHoch(post.id, { register: reg, name }, Buffer.from(`%PDF-1.4 ${name}`), null)).dokument.id;
    await d.volltexte.schreibeVolltext(id, { text: `Text ${name}` }, { id: null as never, herkunft: 'Test', paket: false });
    return id;
  };
  const ids = [await dokument('a.pdf'), await dokument('b.pdf'), await dokument('c.pdf')];
  /** Installiert die Pakete (nach den Dokumenten: Volltext des Bestands holt sonst der Nachlauf). */
  const installiere = async (...pakete: string[]) => {
    for (const id of pakete)
      await d.kern.repo.speicherePaket({
        id,
        name: id === ALT ? 'KI lokal – Ähnlichkeit' : 'KI lokal – Ähnlichkeit genau',
        version: '1.0.0',
        beschreibung: '',
        lizenz: 'MIT',
        autor: { name: 'T', github: 't' },
        herkunft: { art: 'hochgeladen', von: null, am: '' },
        installiert: new Date().toISOString(),
        installiertVon: null,
        aktualisiert: null,
        aktualisiertVon: null,
        typen: {},
        sichten: {},
        abhaengigkeiten: {},
        code: true,
        laeufer: {
          sprache: 'c',
          ereignisse: ['volltext.fertig'],
          rechte: { lesen: ['*'], schreiben: [], dokumente: 'lesen', schnittstellen: ['dms:vektoren'] },
          netz: [],
          modul: { sha256: 'x', groesse: 1 },
        },
      } as unknown as InstalliertesPaket);
    // Was der Läufer sonst beim Abgleich liest – ohne Läufer-Prozess.
    x.pakete = (await d.kern.repo.listePakete()).filter((p) => p.laeufer);
    x.vektorWahl = await d.suche.vektorWahl();
  };
  /** Wie das Paket: offene „Volltext ist da“ abarbeiten und je Dokument einen Vektor seines Modells ablegen. */
  const paketRechnet = async (paket: string) => {
    while ((await d.ereignisse.verteile()) > 0);
    for (const e of await d.kern.repo.faelligeEreignisse(100)) {
      if (e.paketId !== paket) continue;
      await d.kern.repo.vektorSetze({ dokumentId: String(e.daten.dokument), paket, modell: MODELL[paket], vektor: V });
      await d.kern.repo.ereignisZugestellt(e.id);
    }
  };
  const offen = async (paket: string) => {
    // Der Verteiler arbeitet nicht blockierend: erst alles verteilen.
    while ((await d.ereignisse.verteile()) > 0);
    return (await d.kern.repo.ereignisStand())[paket]?.offen ?? 0;
  };
  return { d, konten, l, x, ids, dokument, installiere, paketRechnet, offen };
}

describe('Vektoren von (#1707)', () => {
  it('ohne Wahl wie bisher das erste nach Id; gewähltes Paket nur, solange es geladen ist', async () => {
    const { d, l, x, installiere, offen, dokument } = await aufbau();
    await installiere(NEU, ALT);
    assert.equal(l.vektorPaket(), ALT, 'erstes nach Id');
    assert.equal(l.vektorZiel(), ALT);
    assert.equal(await d.kern.einstellungen!.lies('vektoren'), null, 'ohne Wahl bleibt die Einstellung leer');
    // Ohne Wahl bekommen beide Pakete „Volltext ist da“ – wie vor #1707.
    await dokument('neu.pdf');
    assert.deepEqual([await offen(ALT), await offen(NEU)], [1, 1]);

    await assert.rejects(l.waehleVektorPaket('gibt_es_nicht'), /kann keine Vektoren liefern/);
    x.laeuft = () => false; // nur wählen, noch nicht nachrechnen
    await l.waehleVektorPaket(NEU);
    assert.equal(l.vektorZiel(), NEU, 'das gewählte rechnet');
    assert.equal(l.vektorPaket(), ALT, 'die Suche bleibt beim bisherigen');
    assert.deepEqual(await d.kern.einstellungen!.lies('vektoren'), { von: NEU, bisher: ALT });
    // Die Einstellung „Ähnliche Treffer in der Suche“ lässt die Wahl stehen und umgekehrt.
    await d.suche.setzeVektorEinstellung({ suche: false });
    assert.deepEqual(await d.kern.einstellungen!.lies('vektoren'), { suche: false, von: NEU, bisher: ALT });
    await d.suche.setzeVektorEinstellung({ suche: true });

    // Rückfall: Das gewählte Paket ist nicht geladen (Ladefehler, entfernt) – wie bisher das erste nach Id.
    (x.ladefehler as Map<string, string | null>).set(NEU, 'Modul abgelehnt');
    assert.equal(l.vektorZiel(), ALT);
    assert.equal(l.vektorPaket(), ALT);
    (x.ladefehler as Map<string, string | null>).delete(NEU);
    x.pakete = (x.pakete as InstalliertesPaket[]).filter((p) => p.id !== NEU);
    assert.equal(l.vektorZiel(), ALT);
    assert.equal(l.vektorPaket(), ALT);
  });

  it('Wechsel: Nachlauf des neuen Pakets, bis dahin sucht Ablago mit dem alten; danach sind dessen Vektoren weg', async () => {
    const { d, l, x, ids, installiere, paketRechnet, offen, dokument } = await aufbau();
    await installiere(ALT, NEU);
    // Bestand: alle drei Dokumente haben Vektoren des alten Pakets.
    for (const id of ids) await d.kern.repo.vektorSetze({ dokumentId: id, paket: ALT, modell: MODELL[ALT], vektor: V });
    await d.suche.merkeVektorModell(ALT, MODELL[ALT]);
    // Gemessene Zeit je Dokument des neuen Pakets (Median der letzten erfolgreichen „Volltext ist da“).
    await d.kern.repo.notiereVerlauf(
      [900, 1100, 1000, 50_000].map((ms, i) => ({
        paket: NEU,
        art: 'ereignis' as const,
        was: 'volltext.fertig',
        ergebnis: i === 3 ? ('zeit' as const) : ('ok' as const),
        ms,
        speicherMB: 30,
        text: '',
        bezug: null,
        netz: [],
      })),
    );
    let st = await d.suche.vektorStand();
    assert.deepEqual(
      st.pakete.map((p) => [p.id, p.msJeDokument]),
      [
        [ALT, null],
        [NEU, 1000],
      ],
    );
    assert.deepEqual([st.paket, st.gewaehlt, st.wechsel, st.mitVektor, st.mitVolltext], [ALT, null, null, 3, 3]);

    // Wählen – der Nachlauf beginnt sofort (im Hintergrund) und fragt das neue Paket nach seinem Modell.
    x.nachlaufLaeuft = true; // den Nachlauf hier Schritt für Schritt aufrufen
    await l.waehleVektorPaket(NEU);
    x.nachlaufLaeuft = false;
    await l.nachberechnen();
    assert.equal(await offen(NEU), 3, 'der Bestand geht an das neue Paket');
    assert.equal(await offen(ALT), 0);
    st = await d.suche.vektorStand();
    assert.deepEqual([st.paket, st.gewaehlt, st.mitVektor], [ALT, NEU, 3], 'die Suche nutzt weiter die Vektoren des alten');
    assert.deepEqual(st.wechsel, { von: ALT, nach: NEU, modell: MODELL[NEU], mitVektor: 0 });
    // Ein neues Dokument mitten im Wechsel bekommen beide – das alte bleibt für die Suche vollständig.
    await dokument('mitten.pdf');
    assert.deepEqual([await offen(ALT), await offen(NEU)], [1, 4]);
    await paketRechnet(ALT);
    // Das neue Paket rechnet; solange es etwas offen hat, schickt der Nachlauf nichts dazu.
    await paketRechnet(NEU);
    st = await d.suche.vektorStand();
    assert.deepEqual(st.wechsel, { von: ALT, nach: NEU, modell: MODELL[NEU], mitVektor: 4 }, 'Fortschritt: x von y');
    assert.equal(l.vektorPaket(), ALT, 'erst nach einem vollständigen Durchgang umschalten');

    // Nächster Durchgang findet nichts mehr: Wechsel fertig, alte Vektoren weg, Suche mit dem neuen Paket.
    await l.nachberechnen();
    assert.equal(l.vektorPaket(), NEU);
    assert.deepEqual(await d.kern.einstellungen!.lies('vektoren'), { von: NEU });
    st = await d.suche.vektorStand();
    assert.deepEqual(
      st.modelle.map((m) => [m.paket, m.modell, m.anzahl]),
      [[NEU, MODELL[NEU], 4]],
    );
    assert.deepEqual([st.paket, st.gewaehlt, st.wechsel, st.mitVektor, st.mitVolltext], [NEU, NEU, null, 4, 4]);

    // Mit Wahl rechnet das andere Paket nicht mehr nebenher.
    await dokument('danach.pdf');
    assert.deepEqual([await offen(ALT), await offen(NEU)], [0, 1]);
  });

  it('abgebrochener Wechsel: zurück zum bisherigen verwirft die halb gerechneten Vektoren', async () => {
    const { d, l, x, ids, installiere } = await aufbau();
    await installiere(ALT, NEU);
    x.laeuft = () => false;
    await l.waehleVektorPaket(NEU);
    await d.kern.repo.vektorSetze({ dokumentId: ids[0], paket: NEU, modell: MODELL[NEU], vektor: V });
    await l.waehleVektorPaket(ALT);
    assert.deepEqual(await d.kern.einstellungen!.lies('vektoren'), { von: ALT });
    assert.deepEqual([l.vektorZiel(), l.vektorPaket()], [ALT, ALT]);
    assert.deepEqual((await d.suche.vektorStand()).modelle, []);
  });

  it('Werkbank: PUT /api/werkbank/vektoren/paket wählt, prüft die Eingabe und liefert den Stand', async () => {
    const { d, konten, l, x, installiere } = await aufbau();
    await installiere(ALT, NEU);
    x.laeuft = () => false;
    const tabelle = routen(d, konten, { paketlaeufer: l });
    const r = tabelle.find((y) => y.methode === 'PUT' && y.pfad === '/api/werkbank/vektoren/paket')!;
    assert.equal(r.zugang, 'admin');
    const a = (body: unknown) =>
      ({ body, params: {}, query: {}, ip: '127.0.0.1', benutzer: { id: 'u1', email: 'lena@example.org' } }) as unknown as Anfrage;
    await assert.rejects(r.handler(a({})), (e: Error & { status?: number }) => e.status === 422);
    await assert.rejects(r.handler(a({ paket: 'gibt_es_nicht' })), (e: Error & { status?: number }) => e.status === 409);
    const st = (await r.handler(a({ paket: NEU }))).body as Awaited<ReturnType<typeof d.suche.vektorStand>>;
    assert.deepEqual([st.paket, st.gewaehlt, st.wechsel?.von, st.wechsel?.nach], [ALT, NEU, ALT, NEU]);
    assert.deepEqual(
      st.pakete.map((p) => p.name),
      ['KI lokal – Ähnlichkeit', 'KI lokal – Ähnlichkeit genau'],
    );
    // Ohne Paket-Läufer (Installation ohne Pakete mit Code): 404.
    const ohne = routen(d, konten, {}).find((y) => y.methode === 'PUT' && y.pfad === '/api/werkbank/vektoren/paket')!;
    await assert.rejects(ohne.handler(a({ paket: NEU })), (e: Error & { status?: number }) => e.status === 404);
  });
});
