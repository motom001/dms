/** Eingangsordner (#195): fertige Dateien → neue Post, „Für“ aus Unterordnern, erledigt/fehler, keine Doppelten. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { POST_KANAL } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Eingangsordner, pruefeEingangEinstellung, EINGANG_STANDARD } from '../src/eingangsordner';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

async function aufbau(pause: () => string | null = () => null) {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna Muster', passwort: 'ein-langes-passwort' });
  const { benutzer: thomas } = await konten.legeBenutzerAn({ email: 'thomas.m@example.org', name: 'Thomas Meißner', rolle: 'mitglied' }, anna.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ordner = await mkdtemp(join(tmpdir(), 'dms-eingang-'));
  const einstellungen = speicherEinstellungen();
  const e = new Eingangsordner(ordner, { dienst: d, einstellungen, benutzer: () => konten.listeBenutzer(), pause });
  const posten = async () => {
    const post = await d.postTyp();
    return Promise.all((await d.listeMappen(post.id)).map(async (m) => ({ m, docs: (await d.holeMappe(m.id)).dokumente })));
  };
  return { d, e, ordner, anna, thomas, einstellungen, posten };
}

describe('Eingangsordner (#195)', () => {
  it('übernimmt erst fertige Dateien, je Datei eine Post, und verschiebt nach erledigt/', async () => {
    const { e, ordner, posten } = await aufbau();
    await writeFile(join(ordner, 'Scan_0042.pdf'), '%PDF-1.4 Scan');
    assert.equal(await e.pruefe(), 0, 'erste Prüfung: noch nicht fertig');
    assert.equal((await e.stand()).wartend, 1);
    assert.equal(await e.pruefe(), 1);
    const p = await posten();
    assert.equal(p.length, 1);
    assert.equal(p[0].m.werte.kanal, POST_KANAL.ordner);
    assert.equal(p[0].m.werte.betreff, 'Scan_0042');
    assert.equal(p[0].m.werte.absender, 'Eingangsordner');
    assert.equal(p[0].docs.length, 1);
    assert.ok(existsSync(join(ordner, 'erledigt', 'Scan_0042.pdf')));
    assert.ok(!existsSync(join(ordner, 'Scan_0042.pdf')));
    assert.equal((await e.stand()).uebernommen[0].mappeId, p[0].m.id);
  });

  it('wachsende Datei wartet; Unterordner setzt „Für“; Löschen statt Verschieben', async () => {
    const { e, ordner, thomas, posten, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'loeschen' });
    await mkdir(join(ordner, 'Thomas'));
    await writeFile(join(ordner, 'Thomas', 'brief.pdf'), 'Teil 1');
    await e.pruefe();
    await writeFile(join(ordner, 'Thomas', 'brief.pdf'), 'Teil 1 und Teil 2');
    assert.equal(await e.pruefe(), 0, 'Größe geändert: noch nicht fertig');
    assert.equal(await e.pruefe(), 1);
    const [p] = await posten();
    assert.equal(p.m.werte.fuer, thomas.id);
    assert.deepEqual(await readdir(join(ordner, 'Thomas')), [], 'gelöscht');
  });

  it('überspringt Temporäres und NAS-Ordner; lehnt leere Dateien mit Grund ab', async () => {
    const { e, ordner, posten } = await aufbau();
    for (const n of ['.versteckt', '~$entwurf.docx', 'scan.tmp', 'teil.part', 'Thumbs.db', 'desktop.ini']) await writeFile(join(ordner, n), 'x');
    await mkdir(join(ordner, '@eaDir'));
    await writeFile(join(ordner, '@eaDir', 'vorschau.jpg'), 'x');
    await writeFile(join(ordner, 'leer.pdf'), '');
    await e.pruefe(); await e.pruefe();
    assert.equal((await posten()).length, 0);
    assert.ok(existsSync(join(ordner, 'fehler', 'leer.pdf')));
    assert.match(await readFile(join(ordner, 'fehler', 'leer.pdf.grund.txt'), 'utf8'), /leer/);
    assert.equal((await e.stand()).fehler[0].datei, 'eingang/leer.pdf');
    assert.ok(existsSync(join(ordner, 'scan.tmp')), 'temporäre Datei bleibt liegen');
  });

  it('Neustart mitten im Übernehmen: keine doppelte Post', async () => {
    const { d, e, ordner, einstellungen, posten } = await aufbau();
    await writeFile(join(ordner, 'Rechnung.pdf'), '%PDF-1.4 Rechnung');
    await e.pruefe();
    // Abbruch nach dem Anlegen der Post, vor dem Verschieben: Journal mit Mappe liegt noch da.
    const post = await d.legePostAn({ betreff: 'Rechnung' }, { id: null, name: 'Eingangsordner' }, undefined, POST_KANAL.ordner);
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update('%PDF-1.4 Rechnung').digest('hex');
    await einstellungen.schreibe('eingangsordner_journal', { pfad: join(ordner, 'Rechnung.pdf'), sha256: sha, groesse: 17, seit: new Date(0).toISOString(), mappeId: post.id });
    const neu = new Eingangsordner(ordner, { dienst: d, einstellungen, benutzer: async () => [] });
    assert.equal(await neu.pruefe(), 0);
    const p = await posten();
    assert.equal(p.length, 1, 'nur die eine Post');
    assert.equal(p[0].docs.length, 1, 'Dokument nachgeholt');
    assert.ok(existsSync(join(ordner, 'erledigt', 'Rechnung.pdf')));
    assert.equal(await einstellungen.lies('eingangsordner_journal'), null);
    void e;
  });

  it('ruht im Wartungsmodus und prüft die Einstellungen', async () => {
    const { e, ordner, posten } = await aufbau(() => 'Wartungsmodus');
    await writeFile(join(ordner, 'a.pdf'), 'x');
    await e.pruefe(); await e.pruefe();
    assert.equal((await posten()).length, 0);
    assert.equal((await e.stand()).pausiert, 'Wartungsmodus');
    assert.throws(() => pruefeEingangEinstellung({ abstand: 1 }, EINGANG_STANDARD), (x) => x instanceof Fachfehler && x.status === 422);
    assert.throws(() => pruefeEingangEinstellung({ nachher: 'weg' }, EINGANG_STANDARD), (x) => x instanceof Fachfehler);
  });
});
