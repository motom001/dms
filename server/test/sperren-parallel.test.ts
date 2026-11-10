/**
 * Grenzen für Fehlversuche halten auch bei gleichzeitigen Anfragen und über mehrere Prozesse (#956, Punkt 3).
 *
 * Jeder Versuch wird vorab gezählt – atomar im Kurzzustand, den sich alle Prozesse teilen. Hier stehen zwei
 * Instanzen mit demselben Kurzzustand für zwei Prozesse.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AbrufBremse } from '../src/abruf';
import { Einrichtungscode } from '../src/einrichtungscode';
import { PdfEntsperren } from '../src/entsperren';
import { speicherKurzzustand } from '../src/kurzzustand';
import { VERSUCHE_MAX } from '../../shared/src/entsperren';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Kurze Pause im Prüfschritt, damit sich gleichzeitige Anfragen wirklich überlappen (wie scrypt). */
const warte = () => new Promise((r) => setTimeout(r, 5));
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { return (e as { status?: number }).status ?? 500; } };

describe('Fehlversuche über Prozesse und gleichzeitige Anfragen (#956)', () => {
  it('Abruf-Link: 40 gleichzeitige falsche Codes auf zwei Prozessen – höchstens 5 werden geprüft', async () => {
    const zustand = speicherKurzzustand();
    const a = new AbrufBremse({ zustand, fehlerMax: 5 });
    const b = new AbrufBremse({ zustand, fehlerMax: 5 });
    let geprueft = 0;
    const versuch = async (x: AbrufBremse) => {
      const v = await x.versuch('203.0.113.0/24');
      if (!v) return 429;
      geprueft++;
      await warte();
      return 403; // falscher Code: der Versuch bleibt gezählt
    };
    const r = await Promise.all(Array.from({ length: 40 }, (_, i) => versuch(i % 2 ? a : b)));
    assert.equal(geprueft, 5);
    assert.equal(r.filter((x) => x === 429).length, 35);
    assert.equal(await a.gesperrt('203.0.113.0/24'), true);
    assert.equal(await b.gesperrt('203.0.113.0/24'), true);
  });

  it('Abruf-Link: ein richtiger Code nimmt seinen Versuch zurück', async () => {
    const zustand = speicherKurzzustand();
    const a = new AbrufBremse({ zustand, fehlerMax: 2 });
    for (let i = 0; i < 10; i++) { const v = await a.versuch('198.51.100.0/24'); assert.ok(v); await v!.zurueck(); await v!.zurueck(); }
    assert.equal(await a.gesperrt('198.51.100.0/24'), false);
    assert.equal((await zustand.lies('abruf-fehler', '198.51.100.0/24'))?.anzahl ?? 0, 0);
  });

  it('Erneute Bestätigung (gemerkte Passwörter): 30 gleichzeitige falsche Passwörter – höchstens VERSUCHE_MAX Prüfungen', async () => {
    const zustand = speicherKurzzustand();
    const p1 = new PdfEntsperren({ zustand } as never);
    const p2 = new PdfEntsperren({ zustand } as never);
    let geprueft = 0;
    const falsch = async () => { geprueft++; await warte(); throw Object.assign(new Error('Das Passwort stimmt nicht.'), { status: 403 }); };
    const r = await Promise.all(Array.from({ length: 30 }, (_, i) => status((i % 2 ? p1 : p2).bestaetige('konto-1', `sitzung-${i}`, falsch))));
    assert.equal(geprueft, VERSUCHE_MAX);
    assert.equal(r.filter((x) => x === 429).length, 30 - VERSUCHE_MAX);
    // Auch das richtige Passwort wartet jetzt das Fenster ab.
    assert.equal(await status(p1.bestaetige('konto-1', 'sitzung-x', async () => {})), 429);
    // Eine andere Person ist nicht betroffen; Erfolg setzt ihren Zähler zurück.
    assert.equal(await status(p2.bestaetige('konto-2', 'sitzung-y', falsch)), 403);
    assert.equal((await zustand.lies('dokumentpasswort-fehler', 'konto-2'))?.anzahl, 1);
    await p2.bestaetige('konto-2', 'sitzung-y', async () => {});
    assert.equal(await zustand.lies('dokumentpasswort-fehler', 'konto-2'), null);
  });

  it('Einrichtungscode: Fehlversuche zählen alle Prozesse zusammen, auch gleichzeitig', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'dms-code-'));
    try {
      const zustand = speicherKurzzustand();
      const leiter = new Einrichtungscode(ordner);
      const code = await leiter.bereitstellen();
      const zweiter = new Einrichtungscode(ordner);
      await zweiter.uebernimm();
      leiter.teileZaehler(zustand); zweiter.teileZaehler(zustand);
      const r = await Promise.all(Array.from({ length: 30 }, (_, i) => status((i % 2 ? leiter : zweiter).pruefeGeteilt('AAAA-BBBB-CCCC'))));
      assert.equal(r.filter((x) => x === 403).length, 10);
      assert.equal(r.filter((x) => x === 429).length, 20);
      // Gesperrt für beide – auch mit dem richtigen Code, bis das Fenster abläuft.
      assert.equal(await status(leiter.pruefeGeteilt(code)), 429);
      assert.equal(await status(zweiter.pruefeGeteilt(code)), 429);
    } finally { await rm(ordner, { recursive: true, force: true }); }
  });

  it('Einrichtungscode: der richtige Code setzt die Zähler zurück; ohne Datenbank wie bisher je Prozess', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'dms-code-'));
    try {
      const zustand = speicherKurzzustand();
      const c = new Einrichtungscode(ordner);
      const code = await c.bereitstellen();
      c.teileZaehler(zustand);
      for (let i = 0; i < 9; i++) assert.equal(await status(c.pruefeGeteilt('falsch')), 403);
      await c.pruefeGeteilt(code);
      assert.equal(await zustand.lies('einrichtungscode-fehler', 'code'), null);
      const ohne = new Einrichtungscode(ordner);
      await ohne.uebernimm();
      for (let i = 0; i < 10; i++) assert.equal(await status(ohne.pruefeGeteilt('falsch')), 403);
      assert.equal(await status(ohne.pruefeGeteilt(code)), 429);
    } finally { await rm(ordner, { recursive: true, force: true }); }
  });
});
