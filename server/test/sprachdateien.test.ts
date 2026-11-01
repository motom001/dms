/**
 * Sprachdateien (#473) – diese Prüfung läuft in der CI (wie die Sperre gegen `confirm()` und die
 * Symbol-Prüfung): fehlende Schlüssel, ungenutzte Schlüssel, Platzhalter zwischen den Sprachen.
 * Schlägt sie fehl, steht in der Meldung Datei und Schlüssel. Anleitung im Entwicklerhandbuch,
 * „Aufbau → Texte und Sprachdateien“.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fuelle, platzhalter, setzeSprache, uebersetzer } from '../../shared/src/sprache';
import { pruefeSprachdateien, type Quelltext, type Sprachstand } from '../../shared/src/sprachpruefung';
import { textDritte } from '../../shared/src/anrede';
import { mailtexte } from '../src/mail';

const WURZEL = new URL('../..', import.meta.url).pathname;
const SPRACHEN = join(WURZEL, 'shared/src/sprachen');

function sprachstand(): Sprachstand {
  const stand: Sprachstand = {};
  for (const spr of readdirSync(SPRACHEN)) {
    if (!statSync(join(SPRACHEN, spr)).isDirectory()) continue;
    stand[spr] = {};
    for (const f of readdirSync(join(SPRACHEN, spr))) {
      if (f.endsWith('.json')) stand[spr][f.slice(0, -5)] = JSON.parse(readFileSync(join(SPRACHEN, spr, f), 'utf8'));
    }
  }
  return stand;
}

function quelltexte(): Quelltext[] {
  const aus = (ordner: string): Quelltext[] => readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return n === 'sprachen' || n === 'node_modules' ? [] : aus(p);
    return /\.(ts|tsx)$/.test(n) ? [{ datei: relative(WURZEL, p), text: readFileSync(p, 'utf8') }] : [];
  });
  return ['web/src', 'server/src', 'shared/src'].flatMap((o) => aus(join(WURZEL, o)));
}

describe('Sprachdateien (#473)', () => {
  it('Schlüssel und Platzhalter stimmen, nichts fehlt, nichts ist übrig', () => {
    const maengel = pruefeSprachdateien(sprachstand(), quelltexte());
    assert.deepEqual(maengel, [], `\n${maengel.join('\n')}`);
  });

  it('die Prüfung findet fehlende, übrige und abweichende Schlüssel', () => {
    const stand: Sprachstand = {
      de: { probe: { 'da': 'Da', 'gruss': 'Hallo {name}', 'rest': 'übrig', 'mappen_one': '{anzahl} Mappe', 'zahl_one': 'eins', 'Gross': 'x' } },
      en: { probe: { 'da': 'There', 'gruss': 'Hello {nam}', 'mehr': 'more' } },
    };
    const code = [{ datei: 'a.ts', text: "t('probe.da'); t('probe.fehlt'); t('probe.gruss', { name }); t('probe.mappen', { anzahl }); t('probe.zahl'); 'probe.Gross'" }];
    const m = pruefeSprachdateien(stand, code).join('\n');
    assert.match(m, /a\.ts:1: Schlüssel „probe\.fehlt“ fehlt in de\/probe\.json/);
    assert.match(m, /Schlüssel „rest“ wird nirgends benutzt/);
    assert.match(m, /en\/probe\.json: Schlüssel „rest“ fehlt/);
    assert.match(m, /en\/probe\.json: Schlüssel „mehr“ gibt es in „de“ nicht/);
    assert.match(m, /en\/probe\.json: „gruss“ hat die Platzhalter \{nam\}, in „de“ \{name\}/);
    assert.match(m, /„zahl“ hat Mehrzahlformen, aber kein „zahl_other“/);
    assert.match(m, /mappen“ hat Mehrzahlformen, aber kein „mappen_other“/);
    assert.match(m, /ungültiger Schlüssel „Gross“/);
    // Zusammengesetzte Schlüssel zählen über ihren festen Anfang als benutzt.
    assert.deepEqual(pruefeSprachdateien({ de: { w: { 'g.a': 'A', 'g.b': 'B' } } }, [{ datei: 'b.ts', text: 't.frei(`w.g.${x}`)' }]), []);
  });

  it('Platzhalter, Mehrzahl und Rückfall auf Deutsch', () => {
    const t = uebersetzer({ probe: { 'mappen_one': '{anzahl} Mappe', 'mappen_other': '{anzahl} Mappen', 'gruss': 'Hallo {name}', 'nur-de': 'nur deutsch' } },
      { en: { probe: { 'mappen_one': '{anzahl} folder', 'mappen_other': '{anzahl} folders', 'gruss': 'Hello {name}' } } });
    assert.equal(t('probe.mappen', { anzahl: 1 }), '1 Mappe');
    assert.equal(t('probe.mappen', { anzahl: 3 }), '3 Mappen');
    assert.equal(t('probe.mappen', { anzahl: 0 }), '0 Mappen');
    assert.equal(t('probe.gruss', { name: 'Lena' }), 'Hallo Lena');
    assert.equal(t('probe.gruss'), 'Hallo {name}');
    assert.equal(t.frei('probe.gibtsnicht'), 'probe.gibtsnicht');
    assert.ok(t.hat('probe.mappen') && !t.hat('probe.gibtsnicht'));
    try {
      setzeSprache('en');
      assert.equal(t('probe.mappen', { anzahl: 1 }), '1 folder');
      assert.equal(t('probe.gruss', { name: 'Lena' }), 'Hello Lena');
      assert.equal(t('probe.nur-de'), 'nur deutsch');
    } finally { setzeSprache('de'); }
    assert.deepEqual(platzhalter('{b} und {a} und {b}'), ['a', 'b']);
    assert.equal(fuelle('{a}{b}', { a: 1 }), '1{b}');
  });

  it('Pilot Anmeldung: Mails des Servers wie bisher, Mehrzahl in der Dauer', () => {
    const z1 = mailtexte.zuruecksetzen('', 'lena@example.org', 'https://dms/passwort/x', 1);
    assert.equal(z1.betreff, 'Passwort für das DMS zurücksetzen');
    assert.equal(z1.text, 'Hallo lena@example.org,\n\nfür deinen Zugang zum DMS wurde ein neues Passwort angefordert.\n\nLege hier ein neues Passwort fest (der Link ist 1 Stunde gültig und funktioniert nur einmal):\nhttps://dms/passwort/x\n\nFalls du das nicht warst, kannst du diese Nachricht ignorieren. Dein bisheriges Passwort bleibt dann gültig.\n');
    assert.match(mailtexte.zuruecksetzen('', 'x@y', 'l', 2).text, /der Link ist 2 Stunden gültig/);
    assert.match(mailtexte.einladung('Lena', 'x@y', 'l', 7).text, /^Hallo Lena,\n\nfür dich wurde ein Zugang zum DMS angelegt\.\n\nAnmeldung mit: x@y\n\nLege hier dein Passwort fest \(der Link ist 7 Tage gültig/);
  });

  it('Texte für Dritte (#474) passen ins neue Format: Mehrzahl beim Abruf-Link', () => {
    assert.equal(textDritte('du', 'mail.link.abrufe', { anzahl: 1 }), 'einmal');
    assert.equal(textDritte('sie', 'mail.link.abrufe', { anzahl: 3 }), 'höchstens 3-mal');
  });
});
