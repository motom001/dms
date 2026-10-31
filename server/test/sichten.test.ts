/**
 * Sichten (#38) mit Bedingungen auf Feldwerte (#40) und auf die Anzahl von Dokumenten
 * und Verknüpfungen (#41) – im Arbeitsspeicher; dieselben Fälle laufen in pg.test.ts gegen PostgreSQL.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { beschreibeBedingung, bedingungsfelder, bedingungsProblem, heuteIn, verschiebe, type Bedingung, type Operator } from '../../shared/src/sichten';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'admin' };

/** Repo für die Fälle: im Arbeitsspeicher oder – mit TEST_DATABASE_URL – in einer eigenen PostgreSQL-Datenbank. */
let neuesRepo: () => Promise<Repo> = async () => speicherRepo();

async function mitBeispielen() {
  const d = new Dienst(await neuesRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  await ladeBeispiele(d, null);
  const typen = await d.listeTypen();
  const typ = (n: string) => typen.find((t) => t.name === n)!;
  const mappen = await d.listeMappen();
  const mappe = (k: string, v: string) => mappen.find((m) => m.werte[k] === v)!;
  return { d, typ, mappe };
}
const titel = async (d: Dienst, sicht: string, extra: Record<string, unknown> = {}) =>
  (await d.seite(ICH, { sicht, anzahl: 500, ...extra })).mappen.map((m) => m.titel).sort();
async function sicht(d: Dienst, name: string, typen: string[], bedingungen: Bedingung[] = [], elternId: string | null = null) {
  return d.legeSichtAn({ name, typen, bedingungen, elternId });
}

function faelle() {
  describe('Hilfen für Bedingungen', () => {
    it('verschiebt Daten um Tage, Wochen, Monate und Jahre', () => {
      assert.equal(verschiebe('2026-01-31', 1, 'monate'), '2026-02-28');
      assert.equal(verschiebe('2024-02-29', 1, 'jahre'), '2025-02-28');
      assert.equal(verschiebe('2026-12-30', 2, 'tage'), '2027-01-01');
      assert.equal(verschiebe('2026-03-01', -1, 'wochen'), '2026-02-22');
      assert.match(heuteIn(), /^\d{4}-\d{2}-\d{2}$/);
    });

    it('bietet bei mehreren Typen nur gemeinsame Felder an und erkennt Probleme', async () => {
      const { typ } = await mitBeispielen();
      const r = typ('Rechnung'); const z = typ('Zahlung');
      assert.ok(bedingungsfelder([r]).some((f) => f.key === 'rechnungsdatum'));
      assert.deepEqual(bedingungsfelder([r, z]).filter((f) => !f.key.startsWith('_')).map((f) => f.key), ['betrag']);
      assert.match(bedingungsProblem({ art: 'feld', feld: 'gibtsnicht', op: 'leer' }, [r])!, /gibt es nicht/);
      assert.match(bedingungsProblem({ art: 'feld', feld: 'betrag', op: 'enthaelt', wert: { art: 'fest', wert: 'x' } }, [r])!, /passt nicht/);
      assert.match(bedingungsProblem({ art: 'feld', feld: 'rechnungsdatum', op: 'gleich', wert: { art: 'jahr' } }, [r])!, /im Zeitraum/);
      assert.match(bedingungsProblem({ art: 'dokumente', register: 'dokumente', vergleich: 'gleich', anzahl: 0 }, [r, z])!, /nicht in allen Mappentypen/);
      assert.equal(bedingungsProblem({ art: 'dokumente', register: 'dokumente', vergleich: 'gleich', anzahl: 0 }, [r]), null);
      assert.equal(beschreibeBedingung({ art: 'feld', feld: 'rechnungsdatum', op: 'zwischen', wert: { art: 'heute' }, bis: { art: 'heute', versatz: 90, einheit: 'tage' } }, [r]),
        'Rechnungsdatum zwischen heute und heute + 90 Tage');
    });
  });

  describe('Sichten verwalten (#38)', () => {
    it('legt je Mappentyp eine Sicht mit dessen Id an und zieht sie beim Umbenennen und Löschen mit', async () => {
      const { d, typ } = await mitBeispielen();
      // Nur die Ansichten der Beispiel-Mappentypen; System, Post und Ablageort (#168) bringen eigene mit.
      const beispiel = new Set(['Vertragspartner', 'Vertrag', 'Rechnung', 'Zahlung'].map((n) => typ(n).id));
      const sichten = (await d.listeSichten()).filter((s) => s.typen.length === 1 && beispiel.has(s.typen[0]));
      assert.deepEqual(sichten.map((s) => s.name), ['Vertragspartner', 'Vertrag', 'Rechnung', 'Zahlung'], 'in der Reihenfolge des Anlegens');
      assert.ok(sichten.every((s) => s.typen.length === 1 && s.id === s.typen[0]));
      const z = typ('Zahlung');
      await d.aendereTyp(z.id, { ...z, name: 'Überweisung' });
      assert.equal((await d.listeSichten()).find((s) => s.id === z.id)!.name, 'Überweisung');
      const ohne = await d.legeTypAn({ name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text' }], sichtAnlegen: false });
      assert.ok(!(await d.listeSichten()).some((s) => s.typen.includes(ohne.id)));
      const mit = await d.legeTypAn({ name: 'Gerät', felder: [{ key: 'name', label: 'Name', typ: 'text' }] });
      assert.ok((await d.listeSichten()).some((s) => s.id === mit.id));
      await d.loescheTyp(mit.id);
      assert.ok(!(await d.listeSichten()).some((s) => s.id === mit.id), 'die eigene Sicht verschwindet mit dem Typ');
    });

    it('ordnet Sichten als Baum; die Elternsicht zeigt alles ihrer Kinder ohne Doppelte', async () => {
      const { d, typ } = await mitBeispielen();
      const finanzen = await sicht(d, 'Finanzen', []);
      const rechnungen = await sicht(d, 'Rechnungen', [typ('Rechnung').id], [], finanzen.id);
      await sicht(d, 'Zahlungen', [typ('Zahlung').id], [], finanzen.id);
      const auchRechnungen = await sicht(d, 'Alle Rechnungen', [typ('Rechnung').id], [], rechnungen.id);
      const alle = await titel(d, finanzen.id);
      assert.equal(alle.length, 3, '2 Rechnungen + 1 Zahlung, nicht doppelt');
      const z = await d.zaehler(ICH);
      assert.equal(z.sichten[finanzen.id], 3);
      assert.equal(z.sichten[auchRechnungen.id], 2);
      // Kreise werden verhindert
      await assert.rejects(d.aendereSicht(finanzen.id, { ...finanzen, elternId: auchRechnungen.id }), /unter sich selbst/);
      await assert.rejects(d.aendereSicht(finanzen.id, { ...finanzen, elternId: finanzen.id }), /unter sich selbst/);
      // Löschen: Kinder rücken eine Ebene hoch, an die Stelle der Elternsicht
      await d.loescheSicht(rechnungen.id);
      const nachher = await d.listeSichten();
      assert.equal(nachher.find((s) => s.id === auchRechnungen.id)!.elternId, finanzen.id);
      assert.deepEqual(nachher.filter((s) => s.elternId === finanzen.id).sort((a, b) => a.position - b.position).map((s) => s.name), ['Alle Rechnungen', 'Zahlungen']);
    });

    it('verschiebt Sichten per Drag & Drop: umsortieren, umhängen, keine Kreise (#73)', async () => {
      const { d, typ } = await mitBeispielen();
      for (const s of await d.listeSichten()) await d.loescheSicht(s.id);
      const a = await sicht(d, 'A', [typ('Rechnung').id]);
      const b = await sicht(d, 'B', []);
      const c = await sicht(d, 'C', [], [], b.id);
      const namen = async (eltern: string | null) => (await d.listeSichten()).filter((s) => s.elternId === eltern).sort((x, y) => x.position - y.position).map((s) => s.name);
      await d.verschiebeSicht(b.id, null, 0);
      assert.deepEqual(await namen(null), ['B', 'A']);
      await d.verschiebeSicht(a.id, b.id, 0);
      assert.deepEqual(await namen(b.id), ['A', 'C']);
      await assert.rejects(d.verschiebeSicht(b.id, c.id, 0), /unter sich selbst/);
      await d.verschiebeSicht(b.id, null, 5);
      await d.verschiebeSicht(c.id, null, 99);
      assert.deepEqual(await namen(null), ['B', 'C']);
      assert.deepEqual(await namen(b.id), ['A'], 'Untersichten wandern mit');
    });

    it('ordnet Geschwister neu und lehnt unvollständige Reihenfolgen ab', async () => {
      const { d } = await mitBeispielen();
      const oben = (await d.listeSichten()).filter((s) => !s.elternId);
      const umgekehrt = oben.map((s) => s.id).reverse();
      const neu = await d.ordneSichten(null, umgekehrt);
      assert.deepEqual(neu.filter((s) => !s.elternId).map((s) => s.id), umgekehrt);
      await assert.rejects(d.ordneSichten(null, umgekehrt.slice(1)), Fachfehler);
    });

    it('kennt Sichten mit einem Typ (Sortierung nach Feldern) und Links auf Typen ohne Sicht', async () => {
      const { d, typ } = await mitBeispielen();
      const r = typ('Rechnung');
      const s = await sicht(d, 'Teure Rechnungen', [r.id], [{ art: 'feld', feld: 'betrag', op: 'groesser', wert: { art: 'fest', wert: 200 } }]);
      const sortiert = await d.seite(ICH, { sicht: s.id, sortierung: 'betrag', absteigend: 'true' });
      assert.equal(sortiert.mappen.length, 1);
      await d.loescheSicht(r.id);
      assert.equal((await d.seite(ICH, { sicht: r.id })).gesamt, 2, 'Typ-Id ohne Sicht: alle Mappen des Typs');
    assert.equal((await d.seite(ICH, { sicht: `typ:${r.id}` })).gesamt, 2, 'typ:<id>: alle Mappen, ohne Bedingungen');
    await d.aendereSicht(s.id, { ...s, id: undefined });
    assert.equal((await d.seite(ICH, { sicht: `typ:${r.id}` })).gesamt, 2);
    });
  });

  describe('Bedingungen auf Feldwerte (#40)', () => {
    it('filtert nach Text, Zahl, Betrag, Datum, Ja/Nein, Auswahl und Verweis', async () => {
      const { d, typ, mappe } = await mitBeispielen();
      const r = typ('Rechnung').id; const v = typ('Vertrag').id; const p = typ('Vertragspartner').id;
      const sw = mappe('name', 'Stadtwerke Musterstadt');
      const f = (feld: string, op: Operator, wert?: unknown, bis?: unknown): Bedingung =>
        ({ art: 'feld', feld, op, ...(wert !== undefined ? { wert: { art: 'fest', wert } } : {}), ...(bis !== undefined ? { bis: { art: 'fest', wert: bis } } : {}) } as Bedingung);
      const pruefe = async (typId: string, b: Bedingung[], erwartet: number, was: string) => {
        const s = await sicht(d, was, [typId], b);
        assert.equal((await d.seite(ICH, { sicht: s.id })).gesamt, erwartet, was);
        assert.equal((await d.zaehler(ICH)).sichten[s.id], erwartet, `${was} (Zähler)`);
      };
      await pruefe(p, [f('name', 'gleich', 'stadtwerke musterstadt')], 1, 'Text gleich, ohne Groß/klein');
      await pruefe(p, [f('name', 'enthaelt', 'bau')], 1, 'Text enthält');
      await pruefe(r, [f('betrag', 'groesser', 200)], 1, 'Betrag größer');
      await pruefe(r, [f('betrag', 'zwischen', 100, 200)], 1, 'Betrag zwischen');
      await pruefe(r, [f('betrag', 'ausserhalb', 100, 200)], 1, 'Betrag außerhalb');
      await pruefe(r, [f('rechnungsdatum', 'kleiner', '2026-02-01')], 1, 'Datum kleiner');
      await pruefe(r, [f('bezahlt', 'ja')], 1, 'Ja');
      await pruefe(r, [f('bezahlt', 'nein')], 1, 'Nein');
      await pruefe(v, [f('zahlungszyklus', 'einerVon', ['jährlich', 'halbjährlich'])], 1, 'Auswahl einer von');
      await pruefe(r, [f('aussteller', 'zeigtAuf', [sw.id])], 1, 'Verweis zeigt auf');
      await pruefe(r, [f('aussteller', 'nichtLeer'), f('bezahlt', 'nein')], 1, 'UND');
      await pruefe(p, [f('kundennummer', 'leer')], 0, 'leer');
    });

    it('löst heute, Jahr, Monat, aktuellen Benutzer und seine Rollen bei jeder Abfrage auf', async () => {
      const { d, typ } = await mitBeispielen();
      const r = typ('Rechnung');
      const heute = heuteIn();
      const neu = await d.legeMappeAn({ typId: r.id, werte: { rechnungsnummer: 'H-1', rechnungsdatum: heute, betrag: { betrag: 1, waehrung: 'EUR' } } }, ICH.id);
      const zaehle = async (b: Bedingung[]) => (await d.seite(ICH, { sicht: (await sicht(d, 'x', [r.id], b)).id })).gesamt;
      assert.equal(await zaehle([{ art: 'feld', feld: 'rechnungsdatum', op: 'gleich', wert: { art: 'heute' } }]), 1);
      assert.equal(await zaehle([{ art: 'feld', feld: 'rechnungsdatum', op: 'zwischen', wert: { art: 'heute', versatz: -7 }, bis: { art: 'heute', versatz: 7 } }]), 1);
      assert.equal(await zaehle([{ art: 'feld', feld: 'rechnungsdatum', op: 'imZeitraum', wert: { art: 'monat' } }]), 1);
      assert.equal(await zaehle([{ art: 'feld', feld: 'rechnungsdatum', op: 'imZeitraum', wert: { art: 'jahr', versatz: -50 } }]), 0);
      assert.equal(await zaehle([{ art: 'feld', feld: '_erstellt', op: 'imZeitraum', wert: { art: 'jahr' } }]), 3, 'Systemwert: angelegt im aktuellen Jahr');
      assert.equal(await zaehle([{ art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } }]), 1, 'von mir angelegt');
      assert.equal(await zaehle([{ art: 'feld', feld: '_erstelltVon', op: 'leer' }]), 2);
      assert.ok(neu.id);
    });

    it('ignoriert Bedingungen auf entfernte Felder, statt die Sicht zu leeren', async () => {
      const { d, typ } = await mitBeispielen();
      const p = typ('Vertragspartner');
      const s = await sicht(d, 'Mit Kundennummer', [p.id], [{ art: 'feld', feld: 'kundennummer', op: 'nichtLeer' }]);
      assert.equal((await d.seite(ICH, { sicht: s.id })).gesamt, 2);
      await d.aendereTyp(p.id, { ...p, felder: p.felder.filter((f) => f.key !== 'kundennummer') });
      assert.equal((await d.seite(ICH, { sicht: s.id })).gesamt, 2, 'Bedingung ignoriert');
    });

    it('zeigt in der Vorschau die Anzahl einer noch nicht gespeicherten Sicht', async () => {
      const { d, typ } = await mitBeispielen();
      const r = typ('Rechnung');
      assert.equal((await d.sichtVorschau(ICH, null, { name: 'x', typen: [r.id], bedingungen: [{ art: 'feld', feld: 'bezahlt', op: 'ja' }] })).anzahl, 1);
      assert.equal((await d.sichtVorschau(ICH, r.id, { name: 'Rechnung', typen: [r.id], bedingungen: [] })).anzahl, 2);
    });
  });

  describe('Trefferlisten (#75)', () => {
    it('speichert mehrere Trefferlisten am Typ und die Wahl an der Sicht', async () => {
      const { d, typ } = await mitBeispielen();
      const r = typ('Rechnung');
      const neu = await d.aendereTyp(r.id, { ...r, trefferliste: undefined, trefferlisten: [...(r.trefferlisten ?? []), { key: 'kurz', name: 'Kurz', spalten: ['_titel', 'betrag'] }] });
      assert.deepEqual(neu.trefferlisten!.map((l) => l.key), ['standard', 'kurz']);
      assert.deepEqual((await d.listeTypen()).find((t) => t.id === r.id)!.trefferlisten![1], { key: 'kurz', name: 'Kurz', spalten: ['_titel', 'betrag'] });
      const s = await sicht(d, 'Kurz', [r.id]);
      await d.aendereSicht(s.id, { ...s, trefferliste: 'kurz' });
      assert.equal((await d.listeSichten()).find((x) => x.id === s.id)!.trefferliste, 'kurz');
    });
  });

  describe('Bedingungen auf Anzahl Dokumente und Verknüpfungen (#41)', () => {
    it('zählt Dokumente je Register und Verknüpfungen wie im Register', async () => {
      const { d, typ, mappe } = await mitBeispielen();
      const r = typ('Rechnung'); const p = typ('Vertragspartner'); const v = typ('Vertrag');
      const rechnung = mappe('rechnungsnummer', 'R-2026-117');
      await d.ladeHoch(rechnung.id, { register: 'dokumente', name: 'r.pdf' }, Buffer.from('%PDF-1.4 a'), null);
      await d.ladeHoch(rechnung.id, { register: 'dokumente', name: 's.pdf' }, Buffer.from('%PDF-1.4 b'), null);
      const n = async (typId: string, b: Bedingung) => (await d.seite(ICH, { sicht: (await sicht(d, 'x', [typId], [b])).id })).gesamt;
      assert.equal(await n(r.id, { art: 'dokumente', register: 'dokumente', vergleich: 'gleich', anzahl: 0 }), 1, 'Rechnungen ohne Dokument');
      assert.equal(await n(r.id, { art: 'dokumente', register: 'dokumente', vergleich: 'mehr', anzahl: 1 }), 1);
      assert.equal(await n(r.id, { art: 'dokumente', register: 'dokumente', vergleich: 'weniger', anzahl: 2 }), 1);
      // Vertragspartner: Register „Rechnungen“ zählt nur Rechnungen über „Aussteller“
      assert.equal(await n(p.id, { art: 'verknuepfungen', register: 'rechnungen', vergleich: 'gleich', anzahl: 1 }), 2);
      assert.equal(await n(p.id, { art: 'verknuepfungen', register: 'vertraege', vergleich: 'mehr', anzahl: 0 }), 2);
      assert.equal(await n(v.id, { art: 'verknuepfungen', register: 'rechnungen', vergleich: 'gleich', anzahl: 0 }), 0, 'jeder Vertrag hat eine Rechnung');
    });

    it('zählt gemeinsame Register mehrerer Typen je Typ über die eigenen Quellen (#66)', async () => {
      const { d, typ } = await mitBeispielen();
      const p = typ('Vertragspartner'); const v = typ('Vertrag'); const r = typ('Rechnung');
      const n = async (typen: string[], b: Bedingung) => (await d.seite(ICH, { sicht: (await sicht(d, 'x', typen, [b])).id })).gesamt;
      const b: Bedingung = { art: 'verknuepfungen', register: 'rechnungen', vergleich: 'mehr', anzahl: 0 };
      assert.equal(bedingungsProblem(b, [p, v]), null);
      assert.equal(await n([p.id, v.id], b), await n([p.id], b) + await n([v.id], b));
      const dok: Bedingung = { art: 'dokumente', register: 'dokumente', vergleich: 'gleich', anzahl: 0 };
      assert.equal(await n([p.id, v.id, r.id], dok), await n([p.id], dok) + await n([v.id], dok) + await n([r.id], dok));
      assert.match(bedingungsProblem({ art: 'verknuepfungen', register: 'rechnungen', vergleich: 'mehr', anzahl: 0 }, [p, r])!, /nicht in allen/);
      assert.match(beschreibeBedingung(b, [p, v]), /Rechnungen/);
    });

    it('zählt Dokumente und Verknüpfungen insgesamt, auch über mehrere Typen (#67)', async () => {
      const { d, typ, mappe } = await mitBeispielen();
      const r = typ('Rechnung'); const z = typ('Zahlung'); const p = typ('Vertragspartner');
      const rechnung = mappe('rechnungsnummer', 'R-2026-117');
      await d.ladeHoch(rechnung.id, { register: 'dokumente', name: 'r.pdf' }, Buffer.from('%PDF-1.4 a'), null);
      const n = async (typen: string[], b: Bedingung) => (await d.seite(ICH, { sicht: (await sicht(d, 'x', typen, [b])).id })).gesamt;
      const alle = (await d.seite(ICH, { sicht: (await sicht(d, 'alle', [r.id, z.id])).id })).gesamt;
      const mit = await n([r.id, z.id], { art: 'dokumenteGesamt', vergleich: 'mehr', anzahl: 0 });
      const ohne = await n([r.id, z.id], { art: 'dokumenteGesamt', vergleich: 'gleich', anzahl: 0 });
      assert.equal(mit, 1); assert.equal(mit + ohne, alle);
      // Jeder Vertragspartner wird von mindestens einem Vertrag oder einer Rechnung verwiesen.
      assert.equal(await n([p.id], { art: 'verknuepfungenGesamt', vergleich: 'gleich', anzahl: 0 }), 0);
      assert.ok(await n([p.id], { art: 'verknuepfungenGesamt', vergleich: 'mehr', anzahl: 1 }) > 0);
      assert.equal(bedingungsProblem({ art: 'dokumenteGesamt', vergleich: 'mehr', anzahl: -1 }, [r]) !== null, true);
    });

    it('merkt Favoriten je Benutzer, zeigt sie als Sicht und hält sie über den Papierkorb (#62)', async () => {
      const { d, typ, mappe } = await mitBeispielen();
      const r = typ('Rechnung');
      const rechnung = mappe('rechnungsnummer', 'R-2026-117');
      const vorher = (await d.holeMappe(rechnung.id)).mappe.geaendert;
      await d.setzeFavorit(ICH, rechnung.id, true);
      await d.setzeFavorit(ICH, rechnung.id, true);
      assert.equal(await d.istFavorit(ICH, rechnung.id), true);
      assert.equal((await d.holeMappe(rechnung.id)).mappe.geaendert, vorher, 'persönlich: ändert „zuletzt geändert“ nicht');
      const fav = await d.seite(ICH, { sicht: 'favoriten' });
      assert.deepEqual(fav.mappen.map((m) => m.id), [rechnung.id]);
      assert.deepEqual(fav.favoriten, [rechnung.id]);
      assert.equal((await d.zaehler(ICH)).favoriten, 1);
      assert.equal((await d.seite(ICH, { sicht: (await sicht(d, 'f', [r.id], [{ art: 'favorit' }])).id })).gesamt, 1);
      const zahlung = (await d.listeMappen()).find((m) => m.typId === typ('Zahlung').id)!;
      await d.setzeFavorit(ICH, zahlung.id, true);
      assert.equal((await d.zaehler(ICH)).favoriten, 2);
      await d.setzePapierkorbTage(30);
      await d.loescheMappe(zahlung.id, ICH.id);
      assert.equal((await d.zaehler(ICH)).favoriten, 1, 'verschwindet beim Löschen');
      await d.stelleWiederHer(zahlung.id, ICH);
      assert.equal(await d.istFavorit(ICH, zahlung.id), true, 'kommt mit dem Wiederherstellen zurück');
      await d.setzeFavorit(ICH, zahlung.id, false);
      await d.setzeFavorit(ICH, rechnung.id, false);
      assert.equal((await d.seite(ICH, { sicht: 'favoriten' })).gesamt, 0);
    });
  });
}

describe('Sichten im Arbeitsspeicher', () => { faelle(); });

// Dieselben Fälle gegen PostgreSQL – prüft die Übersetzung der Bedingungen in SQL.
// Jede Beispielladung bekommt einen eigenen Haushalt in einer eigenen Datenbank.
const url = process.env.TEST_DATABASE_URL;
describe('Sichten in PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haupt: any; let sql: any;
  const db = `dms_sichten_${process.pid}`;
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    const { pgRepo } = await import('../src/repo-pg');
    const { randomUUID } = await import('node:crypto');
    // Der Benutzer, der in den Fällen Mappen anlegt (Fremdschlüssel erstellt_von).
    const h0 = randomUUID();
    await sql`INSERT INTO haushalte (id, name) VALUES (${h0}, 'Test')`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${h0}, 'ich@example.org', 'Ich', 'admin')`;
    neuesRepo = async () => {
      const h = randomUUID();
      await sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
      return pgRepo(sql, h);
    };
  });
  after(async () => {
    neuesRepo = async () => speicherRepo();
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });
  faelle();
});
