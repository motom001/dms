/** Beispiel-Ablage (#988): Beispiele installierter Pakete nachträglich anlegen und wieder entfernen; Stand und Vorabprüfung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEISPIEL_NOETIG, BEISPIEL_PAKETE } from '../../shared/src/beispielablage';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { BeispielAblage } from '../src/beispielablage';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'markus@example.org' };

// Ein kleines Paket mit zwei Beispielen, eines verweist auf das andere (erfundene Namen, reservierte Domains).
const DATEIEN: Record<string, string> = {
  'manifest.yaml':
    'schema: 1\nid: haushalt\nname: Haushalt\nversion: 1.0.0\nbeschreibung: Beispiele der Familie.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.223.0"\nabhaengigkeiten: {}\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n  beispiele: inhalt/beispiele.yaml\n',
  'inhalt/mappentypen.yaml': [
    '- schluessel: firma',
    '  name: Firma',
    '  titelVorlage: "{name}"',
    '  felder:',
    '    - { key: name, label: Name, typ: text, pflicht: true }',
    '  register:',
    '    - { key: daten, name: Daten, art: felder, felder: [name] }',
    '- schluessel: vertrag',
    '  name: Vertrag',
    '  titelVorlage: "{nr}"',
    '  felder:',
    '    - { key: nr, label: Nummer, typ: text, pflicht: true }',
    '    - { key: firma, label: Firma, typ: referenz, ziel: firma }',
    '  register:',
    '    - { key: daten, name: Daten, art: felder, felder: [nr, firma] }',
    '',
  ].join('\n'),
  'inhalt/sichten.yaml': '- { schluessel: vertraege, name: Verträge, typen: [vertrag] }\n',
  'inhalt/beispiele.yaml':
    '- typ: firma\n  schluessel: strom\n  werte: { name: Stadtwerke Beispiel }\n- typ: vertrag\n  werte: { nr: SV-4711, firma: { beispiel: strom } }\n',
};
const zip = () =>
  zipPuffer(
    Object.entries(DATEIEN).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })),
    new Date('2026-01-01T12:00:00Z'),
  );

/** Paket ohne Beispiele installiert, dann als Katalogpaket vermerkt; `lade` liefert dasselbe Archiv (ohne Netz). */
async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const p = new Paketverwaltung(d, {
    version: () => '0.223.0',
    katalogUrl: 'https://katalog.test/katalog.json',
    abruf: async () => {
      throw new Error('ohne Netz');
    },
  });
  const h = await p.hochladen(zip(), ICH);
  await p.installiere({ upload: h.upload, bestaetigt: true, beispiele: false }, ICH);
  const inst = (await d.kern.repo.listePakete()).find((x) => x.id === 'haushalt')!;
  await d.kern.repo.speicherePaket({ ...inst, herkunft: { art: 'katalog', url: 'https://katalog.test/katalog.json' } });
  const geladen: string[] = [];
  (p as unknown as { lade: (id: string, v?: string) => Promise<unknown> }).lade = async (id, v) => {
    geladen.push(`${id}@${v}`);
    return { paket: liesPaket(liesZip(zip())) };
  };
  const typ = async (s: string) => (await d.mappentypen.listeTypen()).find((t) => t.schluessel === `haushalt:${s}`)!;
  return { d, p, geladen, typ };
}

describe('Beispiel-Ablage (#988): Beispiele installierter Pakete nachträglich', () => {
  it('legt sie aus derselben Version an, mit Verweisen und ohne Mappen-Ereignisse; ein zweites Mal passiert nichts', async () => {
    const { d, p, geladen, typ } = await aufbau();
    assert.deepEqual(await p.beispieleAnlegen('haushalt', ICH), { angelegt: 2 });
    assert.deepEqual(geladen, ['haushalt@1.0.0']);
    const firma = (await d.mappen.listeMappen((await typ('firma')).id))[0];
    const vertrag = (await d.mappen.listeMappen((await typ('vertrag')).id))[0];
    assert.equal(vertrag.werte.firma, firma.id, 'Verweis zwischen Beispielen aufgelöst');
    const inst = (await d.kern.repo.listePakete()).find((x) => x.id === 'haushalt')!;
    assert.equal(inst.beispielMappen?.length, 2);
    assert.deepEqual(inst.beispiele, { strom: firma.id });
    const ereignisse = await d.kern.repo.holeKatalogEreignisse(100, 1);
    assert.ok(!ereignisse.some((x) => x.art.startsWith('mappe.')), 'keine Automatisierungen, keine Benachrichtigungen');
    assert.deepEqual(await p.beispieleAnlegen('haushalt', ICH), { angelegt: 0 });
    assert.equal(geladen.length, 1, 'schon angelegt: kein zweiter Abruf');
  });

  it('hochgeladene Pakete lassen sich nicht erneut holen', async () => {
    const { d, p } = await aufbau();
    const inst = (await d.kern.repo.listePakete()).find((x) => x.id === 'haushalt')!;
    await d.kern.repo.speicherePaket({ ...inst, herkunft: { art: 'hochgeladen', von: null, am: '2026-11-15T10:00:00Z' } });
    await assert.rejects(p.beispieleAnlegen('haushalt', ICH), (e) => e instanceof Fachfehler && e.status === 409);
    await assert.rejects(p.beispieleAnlegen('gibtsnicht', ICH), (e) => e instanceof Fachfehler && e.status === 404);
  });

  it('Entfernen nimmt unveränderte Beispiele, eigene Mappen bleiben', async () => {
    const { d, p, typ } = await aufbau();
    await p.beispieleAnlegen('haushalt', ICH);
    const eigen = await d.mappen.legeMappeAn({ typId: (await typ('vertrag')).id, werte: { nr: 'EIGEN-1' } }, ICH.id);
    const ablage = new BeispielAblage(p, () => d.kern.repo.listePakete());
    assert.equal((await ablage.stand()).angelegt, 2);
    assert.deepEqual(await ablage.entfernen(ICH), { entfernt: 2, behalten: [] });
    assert.equal((await ablage.stand()).angelegt, 0);
    assert.ok(await d.eingangskanaele.gibtMappe(eigen.id), 'eigene Mappe bleibt');
  });
});

describe('Beispiel-Ablage (#988): Stand und Vorabprüfung', () => {
  const paket = (id: string, beispielMappen = 0) =>
    ({
      id,
      name: id.toUpperCase(),
      beispielMappen: Array.from({ length: beispielMappen }, (_, i) => ({ id: `${id}-${i}`, werte: '', dokumente: [] })),
    }) as unknown as InstalliertesPaket;
  const falsch = () => {
    throw new Error('nicht erwartet');
  };

  it('nennt fehlende nötige Pakete und legt dann nichts an', async () => {
    const ablage = new BeispielAblage({ beispieleAnlegen: falsch, beispieleEntfernen: falsch }, async () => [paket('basis')]);
    const st = await ablage.stand();
    assert.deepEqual(st.noetig, [
      { id: 'basis', name: 'BASIS', installiert: true },
      { id: 'haushalt', name: null, installiert: false },
      { id: 'vertraege', name: null, installiert: false },
    ]);
    await assert.rejects(ablage.anlegen(ICH), (e) => e instanceof Fachfehler && e.status === 409 && /haushalt, vertraege/.test(e.message));
  });

  it('legt in fester Reihenfolge an; scheitert ein Paket, bleiben die übrigen', async () => {
    const reihe: string[] = [];
    const da = [paket('fahrzeuge'), paket('vertraege'), paket('haushalt'), paket('basis'), paket('texterkennung')];
    const ablage = new BeispielAblage(
      {
        beispieleAnlegen: async (id) => {
          reihe.push(id);
          if (id === 'fahrzeuge') throw new Error('Katalog nicht erreichbar');
          return { angelegt: 3 };
        },
        beispieleEntfernen: falsch,
      },
      async () => da,
    );
    const r = await ablage.anlegen(ICH);
    assert.deepEqual(reihe, ['basis', 'haushalt', 'vertraege', 'fahrzeuge'], 'nur Pakete der Beispiel-Ablage, Abhängigkeiten zuerst');
    assert.deepEqual(r, { angelegt: 9, fehler: [{ id: 'fahrzeuge', name: 'FAHRZEUGE', meldung: 'Katalog nicht erreichbar' }] });
    assert.deepEqual(BEISPIEL_PAKETE.slice(0, BEISPIEL_NOETIG.length), [...BEISPIEL_NOETIG]);
  });
});
