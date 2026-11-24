/** Zeitplan für „Alle Dateien prüfen“ (#1316): Plan, Abstand zur Sicherung, Fälligkeit, Fortsetzen, Ergebnis und Abbruch. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { speicherRepo } from '../src/repo/speicher';
import {
  bereinigePruefplan,
  DateienPruefplan,
  liesLauf,
  liesPruefplan,
  pruefplanText,
  PRUEFPLAN_STANDARD,
  speicherePruefplan,
} from '../src/werkbank/dateien-pruefplan';
import { liesDateienErgebnis } from '../src/mappen';
import { einrichtung } from '../src/paketdaten';

async function aufbau(anzahl = 3) {
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen });
  const t = await d.mappentypen.legeTypAn({
    name: 'Beleg',
    titelVorlage: '{name}',
    felder: [{ key: 'name', label: 'Name', typ: 'text' }],
    register: [
      { key: 'daten', name: 'Daten', art: 'felder' },
      { key: 'belege', name: 'Belege', art: 'dokumente' },
    ],
  });
  const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { name: 'Belege 2026' } });
  const shas: string[] = [];
  for (let i = 0; i < anzahl; i++)
    shas.push(
      (await d.dokumente.ladeHoch(m.id, { register: 'belege', name: `B${i}.pdf` }, Buffer.from(`%PDF-1.4 Beleg ${i}`), null)).dokument
        .sha256,
    );
  let jetzt = { datum: '2026-12-01', uhr: '03:30' };
  let beschaeftigt = false;
  const plan = new DateienPruefplan({
    einstellungen,
    pruefe: (von, opt) => d.mappenArchiv.pruefeDateien(von, opt),
    auftragLaeuft: async () => (await d.auftraege.stand())?.status === 'laeuft',
    beschaeftigt: () => beschaeftigt,
    sicherungsUhrzeit: async () => '02:00',
    ortszeit: () => jetzt,
    pauseMs: 0,
  });
  return {
    d,
    dateien,
    einstellungen,
    plan,
    shas: shas.sort(),
    setzeJetzt: (x: typeof jetzt) => {
      jetzt = x;
    },
    setzeBeschaeftigt: (b: boolean) => {
      beschaeftigt = b;
    },
  };
}

describe('„Alle Dateien prüfen“ nach Zeitplan (#1316)', () => {
  it('Plan: aus, monatlich, wöchentlich; nicht gleichzeitig mit der Sicherung; Einrichtung zeigt ihn', async () => {
    assert.deepEqual(PRUEFPLAN_STANDARD.takt, 'aus');
    assert.throws(() => bereinigePruefplan({ takt: 'taeglich' }, PRUEFPLAN_STANDARD, null), /monatlich/);
    assert.throws(() => bereinigePruefplan({ takt: 'monatlich', uhrzeit: '02:30' }, PRUEFPLAN_STANDARD, '02:00'), /mindestens 60 Minuten/);
    assert.throws(
      () => bereinigePruefplan({ takt: 'monatlich', uhrzeit: '23:30' }, PRUEFPLAN_STANDARD, '00:10'),
      /mindestens 60 Minuten/,
      'über Mitternacht',
    );
    assert.deepEqual(
      bereinigePruefplan({ takt: 'monatlich', uhrzeit: '02:30' }, PRUEFPLAN_STANDARD, null).uhrzeit,
      '02:30',
      'Sicherung aus: egal',
    );
    assert.equal(bereinigePruefplan({ takt: 'aus', uhrzeit: '02:00' }, PRUEFPLAN_STANDARD, '02:00').takt, 'aus');
    const e = speicherEinstellungen();
    await speicherePruefplan(e, { takt: 'woechentlich', wochentag: 6, uhrzeit: '04:30' }, '02:00', 'katrin@example.org');
    const p = await liesPruefplan(e);
    assert.equal(pruefplanText(p), 'woechentlich/6/04:30');
    const stand = await einrichtung('unveraenderbarkeit', {
      version: '0.305.0',
      dateienPruefplan: async () => pruefplanText(await liesPruefplan(e)),
    });
    assert.equal(stand.eintraege.find((x) => x.pfad === 'unveraenderbarkeit.zeitplan')?.wert, 'woechentlich/6/04:30');
    const ohne = await einrichtung('unveraenderbarkeit', { version: '0.305.0' });
    assert.equal(ohne.eintraege.find((x) => x.pfad === 'unveraenderbarkeit.zeitplan')?.wert, null);
  });

  it('monatlich am 1. zur Uhrzeit; Ergebnis gemerkt; nur einmal; mit Befund steht er im Ergebnis', async () => {
    const a = await aufbau();
    await speicherePruefplan(a.einstellungen, { takt: 'monatlich', uhrzeit: '03:30' }, '02:00', 'katrin@example.org');
    a.setzeJetzt({ datum: '2026-12-01', uhr: '03:29' });
    assert.equal(await a.plan.tick(), null, 'noch nicht');
    a.setzeJetzt({ datum: '2026-12-01', uhr: '03:30' });
    a.setzeBeschaeftigt(true);
    assert.equal(await a.plan.tick(), null, 'eine Sicherung läuft: warten');
    a.setzeBeschaeftigt(false);
    assert.ok(await a.plan.tick());
    await a.d.auftraege.warte();
    await new Promise((r) => setTimeout(r, 1100));
    assert.deepEqual(await liesDateienErgebnis(a.einstellungen).then((x) => x && { ...x, am: '' }), {
      am: '',
      dateien: 3,
      abweichungen: 0,
      fehlend: 0,
      zeitplan: true,
    });
    assert.equal(await liesLauf(a.einstellungen), null, 'Stand weggeräumt');
    assert.equal(await a.plan.tick(), null, 'nur einmal im Monat');
    a.setzeJetzt({ datum: '2026-12-02', uhr: '03:30' });
    assert.equal(await a.plan.tick(), null, 'nicht am 2.');
    // Befund im nächsten Monat.
    await a.dateien.schreibe(a.shas[1], Buffer.from('anders'));
    a.setzeJetzt({ datum: '2027-01-01', uhr: '04:00' });
    assert.ok(await a.plan.tick());
    await a.d.auftraege.warte();
    assert.equal((await liesDateienErgebnis(a.einstellungen))?.abweichungen, 1);
  });

  it('nach einem Neustart setzt ein angefangener Lauf fort und prüft nur den Rest', async () => {
    const a = await aufbau(4);
    await a.einstellungen.schreibe('dateien_pruefen_lauf', {
      beginn: '2026-12-01T02:30:00Z',
      ab: a.shas[1],
      abweichungen: [{ sha256: 'x'.repeat(64), grund: 'Datei fehlt' }],
      fehlend: ['x'.repeat(64)],
      geprueft: 2,
      dateien: 4,
    });
    assert.deepEqual(await liesLauf(a.einstellungen), { beginn: '2026-12-01T02:30:00Z', geprueft: 2, dateien: 4 });
    assert.ok(await a.plan.tick(), 'Plan ist aus – fortgesetzt wird trotzdem');
    const auftrag = await a.d.auftraege.warte();
    assert.equal(auftrag?.fertig, 4, 'Fortschritt zählt ab der Stelle weiter');
    const e = await liesDateienErgebnis(a.einstellungen);
    assert.deepEqual([e?.dateien, e?.abweichungen, e?.fehlend], [4, 1, 1], 'Befunde von vor dem Neustart bleiben');
  });

  it('abbrechen: der Lauf hört auf, der Stand ist weg, der nächste Termin beginnt neu', async () => {
    const a = await aufbau(30);
    await speicherePruefplan(a.einstellungen, { takt: 'monatlich', uhrzeit: '03:30' }, null, 'katrin@example.org');
    const id = await a.plan.tick();
    assert.ok(id);
    await a.d.auftraege.abbrechen(id);
    const auftrag = await a.d.auftraege.warte();
    assert.equal((auftrag?.ergebnis as { abgebrochen?: boolean }).abgebrochen, true);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(await liesLauf(a.einstellungen), null);
    assert.equal(await liesDateienErgebnis(a.einstellungen), null, 'abgebrochen zählt nicht als Ergebnis');
  });
});
