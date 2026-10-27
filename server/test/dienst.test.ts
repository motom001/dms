import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ladeBeispiele } from '../src/beispiele';
import { Dienst } from '../src/dienst';
import { Fachfehler } from '../src/fehler';
import { speicherRepo } from '../src/repo-speicher';
import { speicherDateien } from '../src/dateispeicher';

async function wirft(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: unknown) => e instanceof Fachfehler && e.status === status);
}

describe('Mappentypen', () => {
  it('legt einen Typ an und lehnt doppelte Namen ab', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true }] });
    assert.equal(t.name, 'Vertrag');
    await wirft(d.legeTypAn({ name: ' vertrag ', felder: [] }), 422);
  });

  it('lehnt ungültige Felder ab', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await wirft(d.legeTypAn({ name: 'X', felder: [{ key: '1abc', label: 'A', typ: 'text' }] }), 422);
    await wirft(d.legeTypAn({ name: 'X', felder: [{ key: 'a', label: 'A', typ: 'text' }, { key: 'a', label: 'B', typ: 'text' }] }), 422);
    await wirft(d.legeTypAn({ name: 'X', felder: [{ key: 'r', label: 'R', typ: 'referenz' }] }), 422);
    await wirft(d.legeTypAn({ name: 'X', felder: [{ key: 'w', label: 'W', typ: 'auswahl', optionen: [] }] }), 422);
  });

  it('erlaubt einen Verweis auf den eigenen Typ (Hierarchie)', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const id = '11111111-1111-4111-8111-111111111111';
    const t = await d.legeTypAn({ id, name: 'Objekt', felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true },
      { key: 'teil_von', label: 'Teil von', typ: 'referenz', zielTyp: id, verweisart: 'zugehoerigkeit' },
    ] });
    assert.equal(t.id, id);
    const haus = await d.legeMappeAn({ typId: id, werte: { name: 'Haus' } });
    const heizung = await d.legeMappeAn({ typId: id, werte: { name: 'Heizung', teil_von: haus.id } });
    const { rueckverweise } = await d.holeMappe(haus.id);
    assert.deepEqual(rueckverweise.map((r) => r.quelleId), [heizung.id]);
  });

  it('löscht einen Typ nur, wenn nichts mehr daran hängt', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const partner = (await d.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    await wirft(d.loescheTyp(partner.id), 409);
  });
});

describe('Mappen', () => {
  it('prüft Pflichtfelder, Längen, Zahlen und Auswahlwerte', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const t = await d.legeTypAn({ name: 'Test', felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, maxLen: 5 },
      { key: 'anzahl', label: 'Anzahl', typ: 'zahl', min: 0, max: 10 },
      { key: 'farbe', label: 'Farbe', typ: 'auswahl', optionen: ['rot', 'blau'] },
      { key: 'preis', label: 'Preis', typ: 'betrag', waehrung: 'EUR' },
    ] });
    await wirft(d.legeMappeAn({ typId: t.id, werte: {} }), 422);
    await wirft(d.legeMappeAn({ typId: t.id, werte: { name: 'zu lang' } }), 422);
    await wirft(d.legeMappeAn({ typId: t.id, werte: { name: 'ok', anzahl: 11 } }), 422);
    await wirft(d.legeMappeAn({ typId: t.id, werte: { name: 'ok', farbe: 'grün' } }), 422);
    await wirft(d.legeMappeAn({ typId: t.id, werte: { name: 'ok', preis: { betrag: 3, waehrung: 'Euro' } } }), 422);
    const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'ok', anzahl: 3, farbe: 'rot', preis: { betrag: 9.99, waehrung: 'EUR' }, fremd: 'wird ignoriert' } });
    assert.equal(m.werte.anzahl, 3);
    assert.equal('fremd' in m.werte, false);
  });

  it('erzwingt eindeutige Werte je Typ, ohne Groß-/Kleinschreibung', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const t = await d.legeTypAn({ name: 'Partner', felder: [{ key: 'erp', label: 'ERP-Nummer', typ: 'text', eindeutig: true }] });
    const a = await d.legeMappeAn({ typId: t.id, werte: { erp: 'A-1' } });
    await wirft(d.legeMappeAn({ typId: t.id, werte: { erp: 'a-1' } }), 422);
    // Die Mappe selbst darf ihren Wert behalten.
    await d.aendereMappe(a.id, { werte: { erp: 'A-1' } });
  });

  it('prüft Referenzen auf Existenz und Zieltyp', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    const vertrag = typen.find((t) => t.name === 'Vertrag')!;
    const rechnung = typen.find((t) => t.name === 'Rechnung')!;
    const eineRechnung = (await d.listeMappen(rechnung.id))[0];
    await wirft(d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'X', vertragspartner: '99999999-9999-4999-8999-999999999999' } }), 422);
    await wirft(d.legeMappeAn({ typId: vertrag.id, werte: { bezeichnung: 'X', vertragspartner: eineRechnung.id } }), 422);
  });

  it('verhindert das Löschen einer Mappe, auf die noch verwiesen wird', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const partner = (await d.listeTypen()).find((t) => t.name === 'Vertragspartner')!;
    const stadtwerke = (await d.listeMappen(partner.id)).find((m) => m.werte.name === 'Stadtwerke Musterstadt')!;
    const { rueckverweise } = await d.holeMappe(stadtwerke.id);
    assert.equal(rueckverweise.length, 2); // Stromvertrag (Vertragspartner) und Jahresabrechnung (Aussteller)
    await wirft(d.loescheMappe(stadtwerke.id), 409);
  });

  it('behält Werte entfernter Felder und entfernt deren Verweise', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    const rechnung = typen.find((t) => t.name === 'Rechnung')!;
    const partner = typen.find((t) => t.name === 'Vertragspartner')!;
    const hb = (await d.listeMappen(partner.id)).find((m) => m.werte.name === 'Heizungsbau Beispiel GmbH')!;
    assert.equal((await d.holeMappe(hb.id)).rueckverweise.length, 2);

    await d.aendereTyp(rechnung.id, { ...rechnung, felder: rechnung.felder.filter((f) => f.key !== 'aussteller') });
    assert.equal((await d.holeMappe(hb.id)).rueckverweise.length, 1); // nur noch der Wartungsvertrag

    const r = (await d.listeMappen(rechnung.id)).find((m) => m.werte.rechnungsnummer === 'R-2026-117')!;
    const geaendert = await d.aendereMappe(r.id, { werte: { bezahlt: true } });
    assert.equal(geaendert.werte.aussteller, hb.id); // Wert bleibt erhalten
    assert.equal(geaendert.werte.bezahlt, true);
  });
});

describe('Register und Dokumente', () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const html = Buffer.from('<html><script>alert(1)</script></html>');

  async function aufbau() {
    const dateien = speicherDateien();
    const d = new Dienst(speicherRepo(), dateien);
    await ladeBeispiele(d);
    const typen = await d.listeTypen();
    const rechnung = typen.find((t) => t.name === 'Rechnung')!;
    const r = (await d.listeMappen(rechnung.id))[0];
    return { d, dateien, rechnung, r };
  }

  it('übernimmt Register und Titel-Vorlage der Beispiele', async () => {
    const { d, rechnung, r } = await aufbau();
    assert.deepEqual(rechnung.register.map((x) => x.art), ['felder', 'dokumente', 'verknuepfungen']);
    assert.equal(rechnung.register[0].felder!.length, rechnung.felder.length);
    const zahlung = (await d.listeTypen()).find((t) => t.name === 'Zahlung')!;
    assert.equal(zahlung.titelVorlage, '{verwendungszweck} vom {zahlungsdatum}');
    assert.ok(r);
  });

  it('lehnt unbekannte Platzhalter und doppelt vergebene Felder ab', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await wirft(d.legeTypAn({ name: 'X', titelVorlage: '{gibtsnicht}', felder: [{ key: 'a', label: 'A', typ: 'text' }] }), 422);
    await wirft(d.legeTypAn({ name: 'X', felder: [{ key: 'a', label: 'A', typ: 'text' }], register: [
      { key: 'eins', name: 'Eins', art: 'felder', felder: ['a'] }, { key: 'zwei', name: 'Zwei', art: 'felder', felder: ['a'] },
    ] }), 422);
    const t = await d.legeTypAn({ name: 'Y', felder: [{ key: 'a', label: 'A', typ: 'text' }, { key: 'b', label: 'B', typ: 'text' }], register: [
      { key: 'eins', name: 'Eins', art: 'felder', felder: ['a'] },
    ] });
    assert.deepEqual(t.register[0].felder, ['a', 'b']); // nicht zugeordnete Felder landen auf dem ersten Feldregister
  });

  it('lädt hoch, erkennt PDFs am Inhalt und speichert gleichen Inhalt nur einmal', async () => {
    const { d, dateien, r } = await aufbau();
    await wirft(d.ladeHoch(r.id, { register: 'zahlungen', name: 'x.pdf' }, pdf, null), 422);
    const a = await d.ladeHoch(r.id, { register: 'dokumente', name: '../../rechnung.pdf', typ: 'application/pdf' }, pdf, null);
    assert.equal(a.dokument.name, 'rechnung.pdf');
    assert.equal(a.dokument.anzeigbar, true);
    const b = await d.ladeHoch(r.id, { register: 'dokumente', name: 'kopie.pdf' }, pdf, null);
    assert.equal(b.gleicherInhalt.length, 1);
    assert.equal(dateien.anzahl(), 1);
    const h = await d.ladeHoch(r.id, { register: 'dokumente', name: 'boese.html', typ: 'text/html' }, html, null);
    assert.equal(h.dokument.anzeigbar, false);
    const falsch = await d.ladeHoch(r.id, { register: 'dokumente', name: 'tarnung.pdf', typ: 'application/pdf' }, html, null);
    assert.equal(falsch.dokument.anzeigbar, false); // Endung und Angabe zählen nicht, nur der Inhalt
    assert.equal((await d.holeMappe(r.id)).dokumente.length, 4);

    await d.loescheDokument(a.dokument.id);
    assert.equal(dateien.anzahl(), 2); // PDF wird noch von „kopie.pdf“ genutzt
    await d.loescheDokument(b.dokument.id);
    assert.equal(dateien.anzahl(), 1);
  });

  it('löscht Dokumente mit der Mappe und schützt Register mit Dokumenten', async () => {
    const { d, dateien, rechnung } = await aufbau();
    const ohneZahlung = (await d.listeMappen(rechnung.id)).find((m) => m.werte.rechnungsnummer === 'R-2026-117')!;
    await d.ladeHoch(ohneZahlung.id, { register: 'dokumente', name: 'r.pdf' }, pdf, null);
    await wirft(d.aendereTyp(rechnung.id, { ...rechnung, register: rechnung.register.filter((x) => x.art !== 'dokumente') }), 409);
    await d.loescheMappe(ohneZahlung.id);
    assert.equal(dateien.anzahl(), 0);
  });
});
