/**
 * Eingangsordner (#195): fertige Dateien → neue Post, „Für“ aus Unterordnern, erledigt/fehler, keine Doppelten.
 * #915: „Für“ nur über die vollständige E-Mail-Adresse, Ordner je Person, erledigt/ je Person, Überwachung mit Warnungen.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { POST_KANAL } from '../../shared/src/model';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { Eingangsordner, eingangWarnungen, pruefeEingangEinstellung, EINGANG_STANDARD, type EingangKnoten } from '../src/eingangsordner';
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
  const { benutzer: thomas } = await konten.legeBenutzerAn({ email: 'thomas.m@example.org', name: 'Thomas Meißner' }, anna.id);
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
    const { e, ordner, posten, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'erledigt' });
    await writeFile(join(ordner, 'Scan_0042.pdf'), '%PDF-1.4 Scan');
    assert.equal(await e.pruefe(), 0, 'erste Prüfung: noch nicht fertig');
    assert.equal((await e.stand()).wartend, 1);
    assert.equal(await e.pruefe(), 1);
    const p = await posten();
    assert.equal(p.length, 1);
    assert.equal(p[0].m.werte.kanal, POST_KANAL.ordner);
    assert.equal(p[0].m.werte.betreff, 'Scan_0042');
    assert.equal(p[0].m.werte.von ?? null, null, 'kein „Von“ „Eingangsordner“ (#494)');
    assert.equal(p[0].docs.length, 1);
    assert.ok(existsSync(join(ordner, 'erledigt', 'Scan_0042.pdf')));
    assert.ok(!existsSync(join(ordner, 'Scan_0042.pdf')));
    assert.equal((await e.stand()).uebernommen[0].mappeId, p[0].m.id);
  });

  it('wachsende Datei wartet; Ordner mit der E-Mail-Adresse setzt „Für“; Löschen statt Verschieben', async () => {
    const { e, ordner, thomas, posten, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'loeschen' });
    // Groß-/Kleinschreibung zählt nicht (#915).
    await mkdir(join(ordner, 'Thomas.M@Example.org'));
    await writeFile(join(ordner, 'Thomas.M@Example.org', 'brief.pdf'), 'Teil 1');
    await e.pruefe();
    await writeFile(join(ordner, 'Thomas.M@Example.org', 'brief.pdf'), 'Teil 1 und Teil 2');
    assert.equal(await e.pruefe(), 0, 'Größe geändert: noch nicht fertig');
    assert.equal(await e.pruefe(), 1);
    const [p] = await posten();
    assert.equal(p.m.werte.an, thomas.id);
    assert.deepEqual(await readdir(join(ordner, 'Thomas.M@Example.org')), [], 'gelöscht');
  });

  it('#915: nur die vollständige E-Mail-Adresse – Vorname, Name und Teil vor dem @ zählen nicht; Hinweis in der Werkbank', async () => {
    const { e, ordner, posten, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'erledigt' });
    for (const o of ['thomas', 'Thomas Meißner', 'thomas.m', 'scanner']) {
      await mkdir(join(ordner, o));
      await writeFile(join(ordner, o, `${o}.pdf`), `%PDF ${o}`);
    }
    await e.pruefe(); assert.equal(await e.pruefe(), 4);
    for (const p of await posten()) assert.equal(p.m.werte.an ?? null, null, `${p.m.werte.betreff}: kein Raten`);
    // Wie der Hauptordner: gemeinsames erledigt/.
    assert.ok(existsSync(join(ordner, 'erledigt', 'thomas', 'thomas.pdf')));
    const s = await e.stand();
    assert.deepEqual([...s.ohnePerson].sort(), ['Thomas Meißner', 'scanner', 'thomas', 'thomas.m']);
    const m = await e.meldungen();
    assert.equal(m?.ohnePerson.length, 4, 'auch für die Übersicht');
    // Umbenannt in die E-Mail-Adresse: Der Hinweis verschwindet.
    const { rename } = await import('node:fs/promises');
    await rename(join(ordner, 'thomas.m'), join(ordner, 'thomas.m@example.org'));
    assert.ok(!(await e.stand()).ohnePerson.includes('thomas.m'));
  });

  it('#915: Unterordner erben die Person; erledigt/ je Person; tiefer als 5 Ebenen bleibt liegen', async () => {
    const { e, ordner, anna, posten, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'erledigt' });
    const datum = join(ordner, 'anna@example.org', '2026', '11');
    await mkdir(datum, { recursive: true });
    await writeFile(join(datum, 'scan.pdf'), '%PDF scan');
    // Personenordner unter einem anderen Ordner: der nächste darüber zählt.
    await mkdir(join(ordner, 'nas', 'anna@example.org'), { recursive: true });
    await writeFile(join(ordner, 'nas', 'anna@example.org', 'b.pdf'), '%PDF b');
    // Ebene 6: bleibt liegen.
    const tief = join(ordner, 'anna@example.org', 'a', 'b', 'c', 'd', 'e');
    await mkdir(tief, { recursive: true });
    await writeFile(join(tief, 'tief.pdf'), '%PDF tief');
    await e.pruefe(); assert.equal(await e.pruefe(), 2);
    for (const p of await posten()) assert.equal(p.m.werte.an, anna.id);
    assert.ok(existsSync(join(ordner, 'anna@example.org', 'erledigt', '2026', '11', 'scan.pdf')), 'erledigt/ der Person');
    assert.ok(existsSync(join(ordner, 'nas', 'anna@example.org', 'erledigt', 'b.pdf')));
    assert.ok(!existsSync(join(ordner, 'erledigt')), 'kein gemeinsames erledigt/');
    assert.ok(existsSync(join(tief, 'tief.pdf')), 'zu tief: bleibt liegen');
    const u = (await e.stand()).ueberblick!;
    assert.equal(u.zuTief, 1, 'erscheint in der Überwachung');
    assert.equal((await e.stand()).ohnePerson.length, 0, '„nas“ hat einen Personenordner darunter – kein Hinweis');
  });

  it('#915: Vorgabe „nach dem Übernehmen löschen“ für neue Eingangsordner, „verschieben“ bleibt bei vorhandenem erledigt/', async () => {
    const { e, ordner, einstellungen } = await aufbau();
    assert.equal((await e.einstellung()).nachher, 'loeschen');
    await e.pruefe();
    assert.equal(((await einstellungen.lies('eingangsordner')) as { nachher: string }).nachher, 'loeschen', 'festgehalten');
    await mkdir(join(ordner, 'erledigt'));
    assert.equal((await e.einstellung()).nachher, 'loeschen', 'ein später angelegtes erledigt/ stellt nicht um');
    const alt = await aufbau();
    await mkdir(join(alt.ordner, 'erledigt'));
    assert.equal((await alt.e.einstellung()).nachher, 'erledigt', 'bisherige Installation: wie bisher');
  });

  it('#915: Ordner für alle Benutzer anlegen, automatisch für neue, beim Ändern der E-Mail-Adresse umbenennen oder melden', async () => {
    const { d, ordner, einstellungen } = await aufbau();
    const leute = [
      { id: 'a', name: 'Lena', email: 'lena@example.org', aktiv: true },
      { id: 'b', name: 'Jonas', email: 'jonas@example.org', aktiv: true },
      { id: 'c', name: 'Markus', email: 'markus@example.org', aktiv: false },
      { id: 'd', name: 'Paket', email: 'paket-x@dienst.invalid', aktiv: true, art: 'dienst' },
    ];
    const e = new Eingangsordner(ordner, { dienst: d, einstellungen, benutzer: async () => leute });
    await mkdir(join(ordner, 'JONAS@example.org'));
    assert.equal((await e.stand()).ohneOrdner, 1);
    const r = await e.ordnerFuerAlle('admin@example.org');
    assert.deepEqual(r.angelegt, ['lena@example.org'], 'nur aktive Personen ohne Ordner');
    assert.equal(r.stand.ohneOrdner, 0);
    // E-Mail-Adresse geändert: Der selbst angelegte Ordner wandert mit.
    leute[0].email = 'lena.neu@example.org';
    await e.pruefe();
    assert.ok(existsSync(join(ordner, 'lena.neu@example.org')) && !existsSync(join(ordner, 'lena@example.org')));
    // Gibt es den neuen Ordner schon: melden statt überschreiben. Den von Hand angelegten (Jonas) fasst Ablago nicht an.
    await mkdir(join(ordner, 'lena.zwei@example.org'));
    leute[0].email = 'lena.zwei@example.org';
    leute[1].email = 'jonas.neu@example.org';
    await e.pruefe();
    assert.deepEqual((await e.stand()).umbenennen, [{ alt: 'lena.neu@example.org', neu: 'lena.zwei@example.org' }]);
    assert.ok(existsSync(join(ordner, 'JONAS@example.org')));
    assert.deepEqual((await e.meldungen())?.umbenennen.length, 1);
    // Automatisch für neue Personen.
    await e.speichere({ ordnerAutomatisch: true }, 'admin@example.org');
    leute.push({ id: 'e', name: 'Petra', email: 'petra@example.org', aktiv: true });
    await e.pruefe();
    assert.ok(existsSync(join(ordner, 'petra@example.org')));
  });

  it('#915: Überwachung – Warnungen bei alten, zu vielen, zu großen Dateien und bei fehler/, Baum je Ordner', async () => {
    const { e, ordner, einstellungen } = await aufbau();
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'erledigt', aktiv: false });
    await mkdir(join(ordner, 'erledigt', 'alt'), { recursive: true });
    await writeFile(join(ordner, 'erledigt', 'alt', 'brief.pdf'), 'x'.repeat(2000));
    const vor200 = new Date(Date.now() - 200 * 86_400_000);
    await utimes(join(ordner, 'erledigt', 'alt', 'brief.pdf'), vor200, vor200);
    await mkdir(join(ordner, 'fehler'));
    await writeFile(join(ordner, 'fehler', 'kaputt.pdf'), 'y');
    await writeFile(join(ordner, 'fehler', 'kaputt.pdf.grund.txt'), 'Grund');
    await mkdir(join(ordner, '@eaDir'));
    await writeFile(join(ordner, '@eaDir', 'vorschau.jpg'), 'z');
    // Ausgeschaltet: übernimmt nichts, die Überwachung läuft trotzdem.
    assert.equal(await e.pruefe(), 0);
    let s = await e.stand();
    const u = s.ueberblick!;
    assert.equal(u.dateien, 3, 'alles unter /eingang, auch erledigt/ und fehler/, ohne NAS-Ordner');
    assert.equal(u.fehler, 1, 'ohne die Textdatei mit dem Grund');
    assert.ok(Math.abs(Date.parse(u.aeltester!) - vor200.getTime()) < 1000, 'älteste Datei');
    assert.deepEqual(s.warnungen, ['alt', 'fehler']);
    const finde = (k: EingangKnoten, pfad: string): EingangKnoten | undefined => k.pfad === pfad ? k : k.kinder.map((c) => finde(c, pfad)).find(Boolean);
    assert.equal(finde(u.baum, 'erledigt/alt')?.dateien, 1);
    assert.equal(finde(u.baum, 'erledigt')?.bytes, 2000);
    assert.equal(finde(u.baum, 'fehler')?.dateien, 2);
    assert.equal(finde(u.baum, '@eaDir'), undefined);
    // Grenzen einstellbar; die nächste Prüfung rechnet nicht gleich neu (höchstens alle paar Minuten), „sofort“ schon.
    await e.speichere({ warnDateien: 2, warnGb: 0.000001, warnTage: 0 }, 'admin@example.org');
    s = await e.stand();
    assert.deepEqual(s.warnungen, ['groesse', 'fehler', 'anzahl']);
    await writeFile(join(ordner, 'neu.pdf'), 'n');
    await e.pruefe();
    assert.equal((await e.stand()).ueberblick!.berechnet, u.berechnet, 'nicht gleich neu berechnet');
    await e.pruefe(true);
    assert.equal((await e.stand()).ueberblick!.dateien, 4);
    // 0 schaltet ab; ungültige Grenzen werden abgelehnt.
    assert.deepEqual(eingangWarnungen(u, { ...EINGANG_STANDARD, warnTage: 0, warnGb: 0, warnDateien: 0 }), ['fehler']);
    assert.throws(() => pruefeEingangEinstellung({ warnTage: -1 }, EINGANG_STANDARD), (x) => x instanceof Fachfehler && x.status === 422);
    assert.throws(() => pruefeEingangEinstellung({ warnDateien: 1.5 }, EINGANG_STANDARD), (x) => x instanceof Fachfehler);
    const m = await e.meldungen();
    assert.equal(m?.grenzen.dateien, 2);
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
    await einstellungen.schreibe('eingangsordner', { ...EINGANG_STANDARD, nachher: 'erledigt' });
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
