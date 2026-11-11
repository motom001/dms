/**
 * Unscharfe Suche (#356): Umlaute und ß, Bindestriche, gleichbedeutende Wörter (Werkbank und Wortlisten aus Paketen),
 * Tippfehler mit „Meintest du …?“ – im Arbeitsspeicher und (mit TEST_DATABASE_URL) in PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { aehnlichkeit, falte, liesWortgruppe, normal, suchbegriffe, variantenVon, vorschlagAus } from '../../shared/src/suche';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin', email: 'lena@example.org' };
const offen: Array<() => Promise<void>> = [];

async function repo(pg: boolean): Promise<{ r: Repo; sql?: import('postgres').Sql }> {
  if (!pg) return { r: speicherRepo() };
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_unscharf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(async () => {
    await sql.end();
    const admin = verbinde(alsUrl(a, 'postgres'));
    await admin.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
    await admin.end();
  });
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  return { r: pgRepo(sql, HAUSHALT) as never, sql };
}

describe('Unscharfe Suche (#356): Hilfsfunktionen', () => {
  it('faltet Umlaute, ß und Bindestriche', () => {
    assert.equal(falte('Özdemir Straße'), 'ozdemir strasse');
    assert.equal(normal('Kfz-Versicherung'), 'kfzversicherung');
  });
  it('erkennt einfache Suchen; Suchsyntax bleibt genau', () => {
    assert.deepEqual(suchbegriffe('Kfz Steuer'), ['Kfz', 'Steuer']);
    assert.equal(suchbegriffe('"Kfz Steuer"'), null);
    assert.equal(suchbegriffe('Strom -Gas'), null);
    assert.equal(suchbegriffe('Strom or Gas'), null);
  });
  it('liest Wortgruppen und bildet Varianten', () => {
    assert.deepEqual(liesWortgruppe('Kfz, Auto; PKW\nauto').woerter, ['Kfz', 'Auto', 'PKW']);
    assert.match(liesWortgruppe('Kfz').fehler ?? '', /mindestens zwei/);
    assert.match(liesWortgruppe(['a', 'Auto']).fehler ?? '', /zu kurz/);
    assert.deepEqual(variantenVon(['auto', 'Kfz-Steuer'], [['Kfz', 'Auto', 'PKW']]), { auto: ['Kfz', 'PKW'], 'kfz-steuer': ['KfzSteuer'] });
  });
  it('Ähnlichkeit wie pg_trgm und „Meintest du …?“', () => {
    assert.ok(aehnlichkeit('waschmaschiene', 'waschmaschine') > 0.6);
    assert.ok(aehnlichkeit('waschmaschine', 'wallbox') < 0.2);
    assert.equal(vorschlagAus(['Waschmaschiene', 'Garantie'], { waschmaschiene: ['waschmaschine'] }), 'waschmaschine Garantie');
    assert.equal(vorschlagAus(['Garantie'], {}), null);
  });
});

function faelle(pg: boolean) {
  describe(`Unscharfe Suche (#356)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
    async function aufbau() {
      const { r, sql } = await repo(pg);
      const d = new Dienst(r, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const typ = await d.mappentypen.legeTypAn({ name: 'Unterlage', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }, { key: 'von', label: 'Von', typ: 'text' }] });
      const lese = await d.mappentypen.legeTypAn({ name: 'Gesperrt', titelVorlage: '{titel}', felder: [{ key: 'titel', label: 'Titel', typ: 'text', pflicht: true }] });
      const mappe = async (titel: string, text?: string, von?: string, t = typ) => {
        const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { titel, ...(von ? { von } : {}) } });
        if (text !== undefined) {
          const { dokument } = await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: `${titel}.txt`, typ: 'text/plain' }, Buffer.from(titel), null);
          await r.ocrSetze(dokument.id, { stand: 'fertig', text });
        }
        return m;
      };
      const suche = async (s: string, volltext = true, sicht = `typ:${typ.id}`) => {
        // Neue Wörter kommen über den Eingang ins Wörterverzeichnis (#575); im Betrieb alle paar Sekunden.
        await d.suche.woerterEinarbeiten();
        const x = await d.sichten.seite(ICH, { sicht, suche: s, volltext: volltext ? 'true' : undefined }) as Awaited<ReturnType<Dienst['sichten']['seite']>> & { unscharf?: { statt: string; vorschlag: string | null } };
        return { titel: x.mappen.map((m) => m.titel).sort(), unscharf: x.unscharf ?? null };
      };
      return { d, r, sql, typ, lese, mappe, suche };
    }

    it('Umlaute, ß und Bindestriche in Titel, Werten und Volltext', async () => {
      const { mappe, suche } = await aufbau();
      await mappe('Brief', 'Sehr geehrter Herr Özdemir, die Gebühr für die Straße wird angepasst.');
      await mappe('Kfz-Versicherung 2026', 'Beitrag');
      await mappe('Police', 'Ihre Kfzversicherung beginnt am 1. März.');
      await mappe('Vermerk', undefined, 'Herr Özdemir');
      assert.deepEqual((await suche('Ozdemir')).titel, ['Brief', 'Vermerk']);
      assert.deepEqual((await suche('Strasse')).titel, ['Brief']);
      assert.deepEqual((await suche('Gebuhr')).titel, ['Brief']);
      assert.deepEqual((await suche('Kfzversicherung')).titel, ['Kfz-Versicherung 2026', 'Police']);
      assert.deepEqual((await suche('Kfz-Versicherung')).titel, ['Kfz-Versicherung 2026', 'Police']);
      // Ohne Volltext nur Titel und Werte
      assert.deepEqual((await suche('Kfzversicherung', false)).titel, ['Kfz-Versicherung 2026']);
    });

    it('gleichbedeutende Wörter aus der Werkbank, nicht bei Suchsyntax', async () => {
      const { d, mappe, suche } = await aufbau();
      await mappe('Auto-Werkstatt', 'Inspektion');
      await mappe('Steuer', 'Bescheid über die PKW-Steuer');
      await mappe('Garten', 'Rasen');
      const s = await d.suche.legeSynonymAn({ woerter: 'Kfz, Auto, PKW' }, ICH.email);
      assert.equal(s.synonyme.length, 1);
      await assert.rejects(d.suche.legeSynonymAn({ woerter: 'Kfz' }, ICH.email), /mindestens zwei/);
      assert.deepEqual((await suche('Kfz')).titel, ['Auto-Werkstatt', 'Steuer']);
      assert.deepEqual((await suche('"Kfz"')).titel, []);
      const id = s.synonyme[0].id;
      await d.suche.aendereSynonym(id, { woerter: 'Kfz, Auto' }, ICH.email);
      assert.deepEqual((await suche('Kfz')).titel, ['Auto-Werkstatt']);
      await d.suche.loescheSynonym(id, ICH.email);
      assert.deepEqual((await suche('Kfz')).titel, []);
    });

    it('Tippfehler: ohne genauen Treffer ähnliche Schreibweisen und „Meintest du …?“; genaue gehen vor', async () => {
      const { d, mappe, suche } = await aufbau();
      await mappe('Rechnung Haushaltsgerät', 'Lieferung einer Waschmaschine mit Garantie');
      await mappe('Garantieschein', 'Garantie für die Waschmaschine, 24 Monate');
      await mappe('Notiz', 'Waschmaschiene (so geschrieben)');
      // Genau geschrieben: nur genaue Treffer, kein Hinweis
      let x = await suche('Waschmaschine');
      assert.equal(x.unscharf, null);
      assert.deepEqual(x.titel, ['Garantieschein', 'Rechnung Haushaltsgerät']);
      // Tippfehler, den es genau so gibt: genauer Treffer geht vor
      x = await suche('Waschmaschiene');
      assert.deepEqual(x.titel, ['Notiz']);
      assert.equal(x.unscharf, null);
      // Tippfehler ohne genauen Treffer
      x = await suche('Waschmashine');
      assert.deepEqual(x.titel, ['Garantieschein', 'Notiz', 'Rechnung Haushaltsgerät']);
      assert.equal(x.unscharf?.statt, 'Waschmashine');
      assert.equal(x.unscharf?.vorschlag, 'waschmaschine');
      // Abschalten in der Werkbank
      await d.suche.setzeSuche({ unscharf: false }, ICH.email);
      assert.deepEqual((await suche('Waschmashine')).titel, []);
      assert.equal((await d.suche.sucheStand()).unscharf, false);
    });

    it('keine Treffer und kein Vorschlag aus Mappen ohne Leserecht', async () => {
      const { d, mappe, suche, lese, typ } = await aufbau();
      await mappe('Geheim', 'Das Wort Steuererklaerung steht nur hier', undefined, lese);
      await mappe('Offen', 'Kein passendes Wort');
      // Lesefilter nur auf „Unterlage“: Der Tippfehler findet nichts aus „Gesperrt“ und schlägt nichts von dort vor.
      const lesen = { offen: [typ.id], je: [] };
      const x = await d.sichten.seite(ICH, { sicht: 'suche', link: '', suche: 'Steuererklarung', volltext: 'true' }, { lesen } as never) as unknown as { gesamt: number; unscharf?: { vorschlag: string | null } };
      assert.equal(x.gesamt, 0);
      assert.equal(x.unscharf, undefined);
      // Ohne Filter (Administrator) findet sie es
      assert.deepEqual((await suche('Steuererklarung', true, 'suche')).titel, ['Geheim']);
    });

    it('Wortlisten aus Paketen: installieren, ersetzen, entfernen', async () => {
      const { d, suche, mappe } = await aufbau();
      await mappe('Abrechnung 2025', 'Die Betriebskosten für 2025');
      const paket = (version: string, liste: string) => zipPuffer(Object.entries({
        'manifest.yaml': `schema: 1\nid: wohnen\nname: Wohnen\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=0.127.0"\ninhalt:\n  wortlisten: inhalt/wortlisten.yaml\n`,
        'inhalt/wortlisten.yaml': liste,
      }).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));
      assert.throws(() => liesPaket(liesZip(paket('1.0.0', '- woerter: [Nebenkosten]\n'))), (e) => /wortlisten\[1\]: Eine Gruppe braucht/.test(JSON.stringify((e as { details?: unknown }).details)));
      const p = new Paketverwaltung(d, { version: () => '0.127.0', abruf: async () => { throw new Error('offline'); } });
      const h = await p.hochladen(paket('1.0.0', '- woerter: [Nebenkosten, Betriebskosten]\n'), { id: ICH.id, email: ICH.email });
      assert.ok(h.vorschau.hinweise.some((x) => /eine Gruppe gleichbedeutender Wörter/.test(x)));
      await p.installiere({ upload: h.upload, bestaetigt: true }, { id: ICH.id, email: ICH.email });
      assert.deepEqual((await suche('Nebenkosten')).titel, ['Abrechnung 2025']);
      const stand = await d.suche.sucheStand();
      assert.deepEqual(stand.synonyme.map((g) => [g.quelle, g.paketName, g.woerter]), [['wohnen', 'Wohnen', ['Nebenkosten', 'Betriebskosten']]]);
      // Werkbank ändert Paket-Gruppen nicht
      await assert.rejects(d.suche.loescheSynonym(stand.synonyme[0].id, ICH.email), /gehört zu einem Paket/);
      const h2 = await p.hochladen(paket('1.1.0', '- woerter: [Miete, Kaltmiete]\n'), { id: ICH.id, email: ICH.email });
      await p.installiere({ upload: h2.upload, bestaetigt: true }, { id: ICH.id, email: ICH.email });
      assert.deepEqual((await d.suche.sucheStand()).synonyme.map((g) => g.woerter), [['Miete', 'Kaltmiete']]);
      await p.entferne('wohnen', { id: ICH.id, email: ICH.email });
      assert.deepEqual((await d.suche.sucheStand()).synonyme, []);
    });

    if (pg) it('PostgreSQL: Suchindex per Trigger, Wörterverzeichnis, Papierkorb', async () => {
      const { r, sql, mappe, suche } = await aufbau();
      // unaccent liegt im eigenen Schema – das Wiederherstellen löscht das alte Schema public samt Inhalt.
      const [ext] = await sql!`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'`;
      assert.equal(ext?.nspname, 'erweiterungen_dms');
      const m = await mappe('Zettel', 'Wärmepumpe gewartet');
      const [dok] = await sql!`SELECT id, suchindex IS NOT NULL AS da FROM dokumente WHERE mappe_id = ${m.id}`;
      assert.equal(dok.da, true);
      // Erst im Eingang (#575), nach dem Einarbeiten im Verzeichnis.
      assert.equal((await sql!`SELECT 1 FROM suchwoerter WHERE wort = 'warmepumpe'`).length, 0);
      assert.ok((await sql!`SELECT 1 FROM suchwoerter_eingang WHERE wort = 'warmepumpe'`).length > 0);
      assert.ok(await r.woerterEinarbeiten() > 0);
      const [w] = await sql!`SELECT anzahl FROM suchwoerter WHERE wort = 'warmepumpe'`;
      assert.ok(w, 'Wort aus dem Volltext im Verzeichnis');
      assert.ok(await r.woerterNeu() > 0);
      // Dokument in den Papierkorb und zurück: Suchindex wieder da (Trigger), nicht aus dem JSON
      await r.legeDokumentInPapierkorb(dok.id as string, null);
      const [korb] = await sql!`SELECT dokument ? 'suchindex' AS mit FROM papierkorb_dokumente WHERE id = ${dok.id}`;
      assert.equal(korb.mit, false);
      assert.deepEqual((await suche('Warmepumpe')).titel, []);
      await r.stelleDokumentWiederHer(dok.id as string);
      assert.deepEqual((await suche('Warmepumpe')).titel, ['Zettel']);
    });
  });
}

faelle(false);
faelle(true);
after(async () => { for (const f of offen) await f(); });
