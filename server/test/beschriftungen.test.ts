/**
 * Auswahlfelder mit festen Werten und Beschriftungen je Sprache (#728): Gespeichert wird der feste Wert, gezeigt die
 * Beschriftung. Ansichten, Suche, Bedingungen, Automatisierungen, Export, API und Erkennung arbeiten mit dem festen
 * Wert. Bestehende Mappen ändern sich nicht. PostgreSQL (Migration 080) nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type postgres from 'postgres';
import { beschriftungsstand, bereinigeBeschriftungen, ergaenzeBeschriftungen, feldLabel, optionsGruppen, optionText, sichtName, typName, wertZuOption } from '../../shared/src/beschriftung';
import { pruefeVorschlaege, vorschlaegeAus } from '../../shared/src/erkennung';
import { abfrageAus } from '../../shared/src/erweitertesuche';
import { formatiere, POST_STAND, systemfelder, type Feld, type Mappentyp } from '../../shared/src/model';
import { beschreibeBedingung } from '../../shared/src/sichten';
import { typBild, typUnterschiede } from '../../shared/src/typvergleich';
import { speicherDateien } from '../src/dateispeicher';
import { behalteBeschriftungen, bereinigeTyp, Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { spaltenKopf, zeile } from '../src/export';
import { beschriftungenNeu, liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { Paketerstellung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin', email: 'lena@example.org' };
const offen: Array<() => Promise<void>> = [];
after(async () => { for (const f of offen) await f(); });

async function datenbank(): Promise<postgres.Sql> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_besch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return sql;
}

/** Feld „Art“ mit festen Werten; „Strom“ bekommt eine englische Beschriftung, „wasser“ eine deutsche. */
const ART: Feld = {
  key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Gas', 'wasser'],
  beschriftungen: { de: { optionen: { wasser: 'Wasser' } }, en: { label: 'Kind', optionen: { Strom: 'Electricity', wasser: 'Water' } } },
};

describe('Beschriftungen je Sprache (#728) – Grundlagen', () => {
  it('Beschriftung in der Sprache, sonst Deutsch, sonst der feste Wert', () => {
    assert.equal(optionText(ART, 'Strom', 'en'), 'Electricity');
    assert.equal(optionText(ART, 'Strom', 'de'), 'Strom');
    assert.equal(optionText(ART, 'Gas', 'en'), 'Gas');
    assert.equal(optionText(ART, 'wasser', 'de'), 'Wasser');
    assert.equal(optionText(ART, 'wasser', 'tr'), 'Wasser', 'ohne türkische Beschriftung die deutsche');
    assert.equal(feldLabel(ART, 'en'), 'Kind');
    assert.equal(feldLabel(ART, 'de'), 'Art');
    assert.equal(feldLabel(ART, 'tr'), 'Art', 'fehlt die Sprache, gilt der Ausgangstext');
    assert.equal(typName({ name: 'Zähler', beschriftungen: { en: { name: 'Meter' } } }, 'en'), 'Meter');
    assert.equal(sichtName({ name: 'Zähler', beschriftungen: null }, 'en'), 'Zähler');
  });

  it('Eingaben über Wert oder Beschriftung führen zum festen Wert', () => {
    assert.equal(wertZuOption(ART, 'Strom'), 'Strom');
    assert.equal(wertZuOption(ART, 'electricity'), 'Strom');
    assert.equal(wertZuOption(ART, 'Wasser'), 'wasser');
    assert.equal(wertZuOption(ART, 'water'), 'wasser');
    assert.equal(wertZuOption(ART, 'Öl'), undefined);
    assert.deepEqual(optionsGruppen([ART]), [['Strom', 'Electricity'], ['wasser', 'Wasser', 'Water']]);
  });

  it('formatiere zeigt die Beschriftung, gespeichert bleibt der Wert', () => {
    assert.equal(formatiere(ART, 'wasser'), 'Wasser');
    assert.equal(formatiere({ ...ART, mehrfach: true }, ['Strom', 'wasser']), 'Strom, Wasser');
    assert.equal(formatiere(ART, 'unbekannt'), 'unbekannt', 'alte Werte außerhalb der Liste erscheinen, wie sie sind');
  });

  it('Bereinigen: gültige Sprachen, bekannte Teile, Optionen nur für vorhandene Werte; Deutsch ist der Ausgangstext', () => {
    const b = bereinigeBeschriftungen<{ label?: string; hilfe?: string; optionen?: Record<string, string> }>({
      en: { label: ' Kind ', unbekannt: 'x', optionen: { Strom: 'Electricity', Weg: 'Gone', Gas: '' } },
      de: { label: 'Art (de)', optionen: { wasser: 'Wasser' } },
      'EN-gb': { label: 'falsch' }, tr: 'kein Objekt', 'pt-BR': { hilfe: 'Ajuda' },
    }, ['label', 'hilfe', 'optionen'], ART.optionen);
    assert.deepEqual(b, { en: { label: 'Kind', optionen: { Strom: 'Electricity' } }, de: { optionen: { wasser: 'Wasser' } }, 'pt-BR': { hilfe: 'Ajuda' } });
    assert.equal(bereinigeBeschriftungen({}, ['name']), undefined);
    assert.equal(bereinigeBeschriftungen(null, ['name']), undefined);
    // beschriftungen.de.label gilt als Bezeichnung.
    const t = bereinigeTyp({ name: 'Zähler', beschriftungen: { de: { name: 'Zählerstand' }, en: { name: 'Meter' } }, felder: [{ key: 'a', label: 'A', typ: 'text', beschriftungen: { de: { label: 'Ä' } } }] });
    assert.equal(t.name, 'Zählerstand');
    assert.deepEqual(t.beschriftungen, { en: { name: 'Meter' } });
    assert.equal(t.felder[0].label, 'Ä');
    assert.equal(t.felder[0].beschriftungen, undefined);
  });

  it('Stand je Sprache zählt beschriftbare Texte (Hinweis „12 von 14“)', () => {
    const typ = { name: 'Zähler', beschreibung: '', beschriftungen: { en: { name: 'Meter' } }, felder: [ART, { key: 'nr', label: 'Nummer', typ: 'text', hilfe: 'Auf dem Gerät' } as Feld],
      register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder' as const, beschriftungen: { en: { name: 'General' } } }], trefferlisten: [{ key: 'standard', name: 'Standard', spalten: [] }] };
    // Name, Art, 3 Optionen, Nummer, Hilfe, Register, Liste = 9; auf Englisch: Name, Art, Strom, wasser, Register = 5.
    assert.deepEqual(beschriftungsstand(typ, 'en'), { vorhanden: 5, gesamt: 9 });
    assert.deepEqual(beschriftungsstand(typ, 'tr'), { vorhanden: 0, gesamt: 9 });
  });

  it('Ergänzen beim Paket-Update: Vorhandenes bleibt', () => {
    const neu = ergaenzeBeschriftungen<{ label?: string; hilfe?: string; optionen?: Record<string, string> }>({ en: { label: 'Eigen', optionen: { Strom: 'Power' } } }, { en: { label: 'Kind', hilfe: 'Help', optionen: { Strom: 'Electricity', Gas: 'Gas' } }, tr: { label: 'Tür' } });
    assert.deepEqual(neu, { en: { label: 'Eigen', hilfe: 'Help', optionen: { Strom: 'Power', Gas: 'Gas' } }, tr: { label: 'Tür' } });
  });

  it('Bedingungen und Erkennung arbeiten mit dem festen Wert', () => {
    const typ = { id: 't', name: 'Zähler', felder: [ART], register: [] } as unknown as Mappentyp;
    assert.equal(beschreibeBedingung({ art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['wasser'] } }, [typ]), 'Art ist einer von „Wasser“');
    // Erweiterte Suche: Beschriftung eingegeben, fester Wert in der Bedingung.
    const r = abfrageAus({ typen: ['Zähler'], felder: { art: { werte: ['Water'] } }, volltext: '', inDokumenten: true, inNotizen: true }, [typ]);
    assert.deepEqual(r.fehler, []);
    assert.match(JSON.stringify(r.bedingungen), /"wert":\["wasser"\]/);
    // Erkennung: die Beschriftung steht im Text, gesetzt wird der feste Wert.
    const v = vorschlaegeAus({ felder: [{ ...ART, erkennung: {} }] }, 'Ihre Abrechnung für Wasser 2026');
    assert.equal(v.art?.wert, 'wasser');
    // Eine Engine darf die Beschriftung nennen.
    const a = pruefeVorschlaege({ felder: [{ ...ART, erkennung: {} }] }, { art: { wert: 'Electricity', sicherheit: 'hoch' } });
    assert.equal(a.vorschlaege.art?.wert, 'Strom');
  });

  it('Systemfelder: Texte aus der Sprachdatei, unverändert gegenüber vorher', () => {
    const post = systemfelder('post', 'r', 'b');
    assert.deepEqual(post.map((f) => f.label), ['Betreff', 'Stand', 'Kanal', 'Richtung', 'Datum', 'Von', 'An', 'An (Adresse)', 'Zugeordnet zu', 'Nachricht']);
    assert.equal(post.find((f) => f.key === 'stand')!.hilfe, 'Neu: noch nicht bearbeitet. Zugeordnet: liegt bei einer passenden Mappe. Erledigt: nichts mehr zu tun.');
    assert.deepEqual(post.find((f) => f.key === 'stand')!.optionen, ['Neu', 'Zugeordnet', 'Erledigt'], 'feste Werte unverändert');
    assert.deepEqual(systemfelder('benutzer', 'r', 'b').map((f) => f.label), ['Name', 'E-Mail-Adresse', 'Rollen', 'Aktiv', 'Abwesend', 'Abwesend von', 'Abwesend bis', 'Vertreter']);
  });

  it('Typvergleich (#653) meldet geänderte Beschriftungen', () => {
    const t = { id: 'x', name: 'A', beschreibung: '', titelVorlage: '', felder: [{ key: 'a', label: 'A', typ: 'text' }], register: [] } as unknown as Mappentyp;
    assert.equal(typUnterschiede(typBild(t), typBild({ ...t })), null);
    const u = typUnterschiede(typBild(t), typBild({ ...t, felder: [{ ...t.felder[0], beschriftungen: { en: { label: 'B' } } }] }))!;
    assert.match(u.liste.join(' '), /Beschriftungen/);
  });
});

/** Ein Dienst mit Mappentyp „Zähler“ und zwei Mappen – wie vor #728 angelegt. */
async function aufbau(repo: Repo = speicherRepo()) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const typ = await d.mappentypen.legeTypAn({ name: 'Zähler', titelVorlage: '{nr} {art}', felder: [
    { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true },
    { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Gas', 'Wasser'] },
    { key: 'mehr', label: 'Mehr', typ: 'auswahl', mehrfach: true, optionen: ['Keller', 'Garage'] },
  ] });
  const m1 = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Z-1', art: 'Strom', mehr: ['Keller'] } });
  const m2 = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'Z-2', art: 'Gas' } });
  return { d, typ, m1, m2 };
}
const beschriftet = (typ: Mappentyp) => ({
  ...typ, beschriftungen: { en: { name: 'Meter', beschreibung: 'Meters' } },
  felder: typ.felder.map((f) => (f.key === 'art' ? { ...f, beschriftungen: { en: { label: 'Kind', optionen: { Strom: 'Electricity', Wasser: 'Water' } } } } : f)),
  register: typ.register.map((r) => (r.key === 'allgemein' ? { ...r, beschriftungen: { en: { name: 'General' } } } : r)),
});

function dienstFaelle(pg: boolean) {
  describe(`Beschriftungen am Mappentyp (#728)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function repo(): Promise<{ r: Repo; sql?: postgres.Sql }> {
      if (!pg) return { r: speicherRepo() };
      const sql = await datenbank();
      const { pgRepo } = await import('../src/repo-pg');
      await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT}, ${ICH.email}, 'Lena', 'admin')`;
      return { r: pgRepo(sql, HAUSHALT), sql };
    }

    it('Migration ohne Änderung an gespeicherten Werten: vorhandene Mappen passen und behalten ihre Werte', async () => {
      const { r, sql } = await repo();
      const { d, typ, m1, m2 } = await aufbau(r);
      const vorher = JSON.stringify([(await d.holeMappe(m1.id)).mappe.werte, (await d.holeMappe(m2.id)).mappe.werte]);
      if (sql) {
        // Die Spalten der Migration 080 gibt es, und bisher steht dort nichts.
        const spalten = await sql`SELECT table_name FROM information_schema.columns WHERE column_name = 'beschriftungen' ORDER BY table_name`;
        assert.deepEqual(spalten.map((x) => x.table_name), ['mappentypen', 'sichten']);
        const [z] = await sql`SELECT beschriftungen FROM mappentypen WHERE id = ${typ.id}`;
        assert.equal(z.beschriftungen, null);
      }
      const neu = await d.mappentypen.aendereTyp(typ.id, beschriftet(typ));
      assert.deepEqual(neu.beschriftungen, { en: { name: 'Meter', beschreibung: 'Meters' } });
      assert.deepEqual(neu.felder.find((f) => f.key === 'art')!.beschriftungen, { en: { label: 'Kind', optionen: { Strom: 'Electricity', Wasser: 'Water' } } });
      assert.deepEqual(neu.register.find((r) => r.key === 'allgemein')!.beschriftungen, { en: { name: 'General' } });
      const nachher = JSON.stringify([(await d.holeMappe(m1.id)).mappe.werte, (await d.holeMappe(m2.id)).mappe.werte]);
      assert.equal(nachher, vorher, 'gespeicherte Werte unverändert');
      for (const m of [m1, m2]) assert.equal((await d.holeMappe(m.id)).mappe.passt, true);
      // Gespeichert wird weiter der feste Wert; eine Beschriftung ist kein gültiger Wert.
      await d.aendereMappe(m2.id, { werte: { nr: 'Z-2', art: 'Wasser' } });
      assert.equal((await d.holeMappe(m2.id)).mappe.werte.art, 'Wasser');
      await assert.rejects(d.aendereMappe(m2.id, { werte: { nr: 'Z-2', art: 'Water' } }), /Art/);
      // Neu gelesen (Datenbank) – alles noch da.
      const gelesen = (await d.mappentypen.listeTypen()).find((t) => t.id === typ.id)!;
      assert.deepEqual(gelesen.beschriftungen, neu.beschriftungen);
    });

    it('Speichern ohne Beschriftungen behält sie, null entfernt sie; entfernte Optionen verlieren ihre', async () => {
      const { r } = await repo();
      const { d, typ } = await aufbau(r);
      await d.mappentypen.aendereTyp(typ.id, beschriftet(typ));
      // Ein älteres Programm über die API: kennt beschriftungen nicht.
      const ohne = JSON.parse(JSON.stringify(typ, (k, v) => (k === 'beschriftungen' ? undefined : v)));
      const t2 = await d.mappentypen.aendereTyp(typ.id, { ...ohne, beschreibung: 'neu', felder: ohne.felder.map((f: Feld) => (f.key === 'art' ? { ...f, optionen: ['Strom', 'Gas', 'Wasser', 'Öl'] } : f)) });
      assert.deepEqual(t2.beschriftungen, { en: { name: 'Meter', beschreibung: 'Meters' } });
      assert.equal(t2.felder.find((f) => f.key === 'art')!.beschriftungen?.en?.optionen?.Strom, 'Electricity');
      assert.equal(t2.register.find((x) => x.key === 'allgemein')!.beschriftungen?.en?.name, 'General');
      // Option „Wasser“ fällt weg → ihre Beschriftung auch.
      const t3 = await d.mappentypen.aendereTyp(typ.id, { ...t2, felder: t2.felder.map((f) => (f.key === 'art' ? { ...f, optionen: ['Strom', 'Gas'] } : f)) });
      assert.deepEqual(t3.felder.find((f) => f.key === 'art')!.beschriftungen, { en: { label: 'Kind', optionen: { Strom: 'Electricity' } } });
      // Wie die Oberfläche: leer als null.
      const t4 = await d.mappentypen.aendereTyp(typ.id, { ...t3, beschriftungen: null, felder: t3.felder.map((f) => ({ ...f, beschriftungen: null })), register: t3.register.map((x) => ({ ...x, beschriftungen: null })) });
      assert.equal(t4.beschriftungen, undefined);
      assert.ok(t4.felder.every((f) => !f.beschriftungen));
      assert.ok(t4.register.every((x) => !x.beschriftungen));
      // Unmittelbar: behalteBeschriftungen ohne Angaben.
      const roh = { name: 'X', felder: [{ key: 'a', label: 'A', typ: 'text' }] };
      const b = behalteBeschriftungen(roh, bereinigeTyp(roh), { beschriftungen: { en: { name: 'Y' } }, felder: [{ key: 'a', label: 'A', typ: 'text', beschriftungen: { en: { label: 'B' } } }], register: [], trefferlisten: [] });
      assert.deepEqual([b.beschriftungen, b.felder[0].beschriftungen], [{ en: { name: 'Y' } }, { en: { label: 'B' } }]);
    });

    it('Ansichten: Name und Beschreibung je Sprache, Bedingungen mit dem festen Wert', async () => {
      const { r } = await repo();
      const { d, typ, m1 } = await aufbau(r);
      await d.mappentypen.aendereTyp(typ.id, beschriftet(typ));
      const s = await d.legeSichtAn({ name: 'Strom', beschriftungen: { en: { name: 'Electricity', beschreibung: 'Power meters' }, xx1: { name: 'ungültig' } }, typen: [typ.id],
        bedingungen: [{ art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Strom'] } }] });
      assert.deepEqual(s.beschriftungen, { en: { name: 'Electricity', beschreibung: 'Power meters' } });
      assert.deepEqual((await d.seite(ICH, { sicht: s.id })).mappen.map((m) => m.id), [m1.id]);
      // Ändern ohne Angabe behält, mit null entfernt.
      const s2 = await d.aendereSicht(s.id, { name: 'Strom!', typen: [typ.id], bedingungen: s.bedingungen });
      assert.equal(s2.beschriftungen?.en?.name, 'Electricity');
      const s3 = await d.aendereSicht(s.id, { ...s2, beschriftungen: null });
      assert.ok(!s3.beschriftungen);
    });

    it('Suche findet den festen Wert auch über seine Beschriftung; Titel und Export zeigen die Beschriftung', async () => {
      const { r } = await repo();
      const { d, typ, m1 } = await aufbau(r);
      const t = await d.mappentypen.aendereTyp(typ.id, {
        ...typ, felder: typ.felder.map((f) => (f.key === 'art' ? { ...f, beschriftungen: { de: { optionen: { Strom: 'Elektrizität' } }, en: { optionen: { Strom: 'Electricity' } } } } : f)),
      });
      const treffer = async (s: string) => (await d.seite(ICH, { sicht: `typ:${typ.id}`, suche: s })).mappen.map((m) => m.id);
      assert.deepEqual(await treffer('Electricity'), [m1.id]);
      assert.deepEqual(await treffer('Strom'), [m1.id]);
      // Der Titel ist die Beschriftung in der Sprache des Servers (Deutsch); der Wert bleibt.
      const m = (await d.holeMappe(m1.id)).mappe;
      assert.equal(m.titel, 'Z-1 Elektrizität');
      assert.equal(m.werte.art, 'Strom');
      assert.deepEqual(await treffer('Elektrizität'), [m1.id]);
      // Export (Excel, PDF): Beschriftung; Kopf mit der Bezeichnung.
      const q = { typen: new Map([[t.id, t]]), titel: (id: string | null | undefined) => id ?? '' };
      assert.deepEqual(zeile(m, ['nr', 'art'], q).text, ['Z-1', 'Elektrizität']);
      assert.equal(spaltenKopf('art', [t]), 'Art');
    });

    it('Systemtyp Post: Beschriftungen der festen Werte bleiben über einen Neustart', async () => {
      const { r } = await repo();
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      await d.sichereSystem();
      const post = (await d.mappentypen.listeTypen()).find((t) => t.system === 'post')!;
      const geaendert = await d.mappentypen.aendereTyp(post.id, { ...post, felder: post.felder.map((f) => (f.key === 'stand' ? { ...f, beschriftungen: { en: { label: 'Status', optionen: { [POST_STAND.neu]: 'New' } } } } : f)) });
      assert.equal(geaendert.felder.find((f) => f.key === 'stand')!.beschriftungen?.en?.optionen?.Neu, 'New');
      // Start: Systemfelder werden nachgezogen – die Beschriftungen bleiben.
      const neu = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      await neu.sichereSystem();
      const nachher = (await neu.mappentypen.listeTypen()).find((t) => t.system === 'post')!;
      // Eigene Beschriftungen bleiben; Lücken füllt der Start aus den Sprachdateien (#729).
      const en = nachher.felder.find((f) => f.key === 'stand')!.beschriftungen?.en;
      assert.equal(en?.label, 'Status');
      assert.deepEqual(en?.optionen, { Neu: 'New', Zugeordnet: 'Assigned', Erledigt: 'Done' });
      assert.deepEqual(nachher.felder.find((f) => f.key === 'stand')!.optionen, ['Neu', 'Zugeordnet', 'Erledigt']);
    });
  });
}
dienstFaelle(false);
dienstFaelle(true);

describe('Vollexport (#728)', () => {
  it('Struktur enthält die Beschriftungen, die Daten den festen Wert', async () => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const { vollexport } = await import('../src/vollexport');
    const { d, typ } = await aufbau();
    await d.mappentypen.aendereTyp(typ.id, beschriftet(typ));
    await d.legeSichtAn({ name: 'Alle Zähler', beschriftungen: { en: { name: 'Meters' } }, typen: [typ.id] });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    const quelle = d.vollexportQuelle({ mandant: 'Familie Test', version: '0.0.0', benutzer: () => konten.exportDaten(), designs: async () => [], protokoll: () => [] });
    const ziel = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'a728-export-'));
    try {
      const r = await vollexport(quelle, ziel, {});
      const typen = JSON.parse(await readFile(join(r.ordner, 'struktur/mappentypen.json'), 'utf8')) as Mappentyp[];
      const z = typen.find((t) => t.id === typ.id)!;
      assert.deepEqual(z.beschriftungen, { en: { name: 'Meter', beschreibung: 'Meters' } });
      assert.equal(z.felder.find((f) => f.key === 'art')!.beschriftungen?.en?.optionen?.Strom, 'Electricity');
      const sichten = JSON.parse(await readFile(join(r.ordner, 'struktur/sichten.json'), 'utf8')) as Array<{ name: string; beschriftungen?: unknown }>;
      assert.deepEqual(sichten.find((s) => s.name === 'Alle Zähler')!.beschriftungen, { en: { name: 'Meters' } });
      const csv = await readFile(join(r.ordner, `daten/${typ.schluessel}.csv`), 'utf8');
      assert.match(csv, /Z-1,[^\n]*Strom/);
      assert.doesNotMatch(csv, /Electricity/);
    } finally { await rm(ziel, { recursive: true, force: true }); }
  });
});

/* ---------- Pakete ---------- */

const MANIFEST = (version: string) => `schema: 1\nid: zaehler\nname: Zähler\nversion: ${version}\nbeschreibung: Zähler im Haushalt\nautor:\n  name: Test\n  github: test\nlizenz: MIT\ndms: ">=0.63.0"\nabhaengigkeiten: {}\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  sichten: inhalt/sichten.yaml\n`;
const TYP_ALT = `- schluessel: zaehler
  name: Zähler
  beschreibung: Strom, Gas und Wasser
  felder:
    - { key: nr, label: Nummer, typ: text, pflicht: true }
    - { key: art, label: Art, typ: auswahl, optionen: [Strom, Gas, Wasser] }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [nr, art] }
`;
const TYP_NEU = `- schluessel: zaehler
  name: Zähler
  beschreibung: Strom, Gas und Wasser
  beschriftungen:
    en: { name: Meter, beschreibung: "Electricity, gas and water" }
  felder:
    - { key: nr, label: Nummer, typ: text, pflicht: true, beschriftungen: { en: { label: Number } } }
    - key: art
      label: Art
      typ: auswahl
      optionen: [Strom, Gas, Wasser]
      beschriftungen:
        en: { label: Kind, optionen: { Strom: Electricity, Wasser: Water, Fehlt: Missing } }
  register:
    - { key: allgemein, name: Allgemein, art: felder, felder: [nr, art], beschriftungen: { en: { name: General } } }
`;
const SICHT = (mit: boolean) => `- { schluessel: strom, name: Stromzähler, typen: [zaehler], bedingungen: [{ feld: art, operator: einerVon, wert: [Strom] }]${mit ? ', beschriftungen: { en: { name: Electricity meters } }' : ''} }\n`;
const zip = (version: string, typen: string, sichten: string) => zipPuffer(Object.entries({ 'manifest.yaml': MANIFEST(version), 'inhalt/mappentypen.yaml': typen, 'inhalt/sichten.yaml': sichten })
  .map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));

describe('Paketformat mit Beschriftungen (#728)', () => {
  const dms = () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    return { d, p: new Paketverwaltung(d, { version: () => '0.199.0', katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => '0.199.0' }) };
  };
  const installiere = async (p: Paketverwaltung, z: Buffer) => { const h = await p.hochladen(z, ICH); return p.installiere({ upload: h.upload, bestaetigt: true }, ICH); };

  it('ältere Pakete mit reinen Textoptionen funktionieren unverändert', async () => {
    const { d, p } = dms();
    const inst = await installiere(p, zip('1.0.0', TYP_ALT, SICHT(false)));
    const typ = (await d.mappentypen.listeTypen()).find((t) => t.id === inst.typen.zaehler)!;
    assert.deepEqual(typ.felder.find((f) => f.key === 'art')!.optionen, ['Strom', 'Gas', 'Wasser']);
    assert.ok(!typ.beschriftungen && typ.felder.every((f) => !f.beschriftungen));
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1', art: 'Strom' } });
    assert.deepEqual((await d.seite(ICH, { sicht: inst.sichten.strom })).mappen.map((x) => x.id), [m.id]);
  });

  it('Paket mit Beschriftungen: Installation übernimmt sie; das Update ergänzt nur, was fehlt', async () => {
    const roh = liesPaket(liesZip(zip('1.1.0', TYP_NEU, SICHT(true))));
    assert.deepEqual(roh.typen[0].beschriftungen, { en: { name: 'Meter', beschreibung: 'Electricity, gas and water' } });
    assert.equal(roh.sichten[0].beschriftungen?.en?.name, 'Electricity meters');

    // Neu installiert.
    const a = dms();
    const inst = await installiere(a.p, zip('1.1.0', TYP_NEU, SICHT(true)));
    const typ = (await a.d.mappentypen.listeTypen()).find((t) => t.id === inst.typen.zaehler)!;
    assert.deepEqual(typ.beschriftungen, { en: { name: 'Meter', beschreibung: 'Electricity, gas and water' } });
    assert.deepEqual(typ.felder.find((f) => f.key === 'art')!.beschriftungen, { en: { label: 'Kind', optionen: { Strom: 'Electricity', Wasser: 'Water' } } }, 'Beschriftung eines unbekannten Werts fällt weg');
    assert.equal(typ.register[0].beschriftungen?.en?.name, 'General');
    assert.equal((await a.d.listeSichten()).find((s) => s.id === inst.sichten.strom)!.beschriftungen?.en?.name, 'Electricity meters');

    // Update von 1.0.0 (ohne) auf 1.1.0 (mit): Der Administrator hat „Strom“ schon selbst beschriftet.
    const b = dms();
    const alt = await installiere(b.p, zip('1.0.0', TYP_ALT, SICHT(false)));
    const t0 = (await b.d.mappentypen.listeTypen()).find((t) => t.id === alt.typen.zaehler)!;
    const m = await b.d.legeMappeAn({ typId: t0.id, werte: { nr: '1', art: 'Wasser' } });
    await b.d.mappentypen.aendereTyp(t0.id, { ...t0, felder: t0.felder.map((f) => (f.key === 'art' ? { ...f, beschriftungen: { en: { optionen: { Strom: 'Power' } } } } : f)) });
    const h = await b.p.hochladen(zip('1.1.0', TYP_NEU, SICHT(true)), ICH);
    const plan = h.vorschau.typen.find((x) => x.schluessel === 'zaehler')!;
    assert.equal(plan.beschriftungen, 6, 'Name, Beschreibung, Nummer, Art, Wasser, Register – „Strom“ bleibt beim Administrator');
    await b.p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    const t1 = (await b.d.mappentypen.listeTypen()).find((t) => t.id === t0.id)!;
    assert.deepEqual(t1.felder.find((f) => f.key === 'art')!.beschriftungen, { en: { optionen: { Strom: 'Power', Wasser: 'Water' }, label: 'Kind' } });
    assert.equal(t1.beschriftungen?.en?.name, 'Meter');
    assert.equal(t1.register[0].beschriftungen?.en?.name, 'General');
    assert.equal((await b.d.holeMappe(m.id)).mappe.werte.art, 'Wasser', 'Werte der Mappen unverändert');
    // Unmittelbar: nichts mehr zu ergänzen.
    assert.equal(beschriftungenNeu(liesPaket(liesZip(zip('1.1.0', TYP_NEU, ''))).typen[0], t1).anzahl, 0);
  });

  it('„Paket erstellen“ nimmt die Beschriftungen mit – und ein anderes Ablago liest sie wieder', async () => {
    const q = dms();
    const { typ } = await (async () => {
      const t = await q.d.mappentypen.legeTypAn({ name: 'Zähler', schluessel: 'zaehler', beschriftungen: { en: { name: 'Meter' } }, felder: [
        { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Gas'], beschriftungen: { en: { label: 'Kind', optionen: { Strom: 'Electricity' } } } },
      ], register: [{ key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['art'], beschriftungen: { en: { name: 'General' } } }] });
      return { typ: t };
    })();
    const s = await q.d.legeSichtAn({ name: 'Zähler', beschriftungen: { en: { name: 'Meters' } }, typen: [typ.id] });
    const z = await q.e.exportiere({ typen: [typ.id], sichten: [s.id], beispiele: [], id: 'meine_zaehler', name: 'Meine Zähler', version: '1.0.0', beschreibung: 'Zähler mit Beschriftungen auf Englisch.', autor: { name: 'Lena', github: 'lena' }, lizenz: 'MIT', dms: '>=0.86.0', aenderungen: '' }, ICH);
    const ziel = dms();
    const inst = await installiere(ziel.p, z.daten);
    const t = (await ziel.d.mappentypen.listeTypen()).find((x) => x.id === inst.typen.zaehler)!;
    assert.deepEqual(t.beschriftungen, { en: { name: 'Meter' } });
    assert.deepEqual(t.felder[0].beschriftungen, { en: { label: 'Kind', optionen: { Strom: 'Electricity' } } });
    assert.equal(t.register[0].beschriftungen?.en?.name, 'General');
    assert.equal(Object.values(inst.sichten).length, 1);
    assert.equal((await ziel.d.listeSichten()).find((x) => x.id === Object.values(inst.sichten)[0])!.beschriftungen?.en?.name, 'Meters');
  });
});
