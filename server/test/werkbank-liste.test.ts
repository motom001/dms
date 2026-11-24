/**
 * Liste der Werkbank-Seiten (#1281): Eine neue Seite ist ein Eintrag in shared/src/werkbankansicht.ts, eine Komponente
 * (web/src/werkbank/rahmen/seiten.ts, geprüft in web/test/werkbank-liste.test.ts), Texte und eine Handbuchseite. Dieser
 * Test meldet, was fehlt: Texte de/en, Handbuchseite de/en samt Menü, Verwaltungsrecht (Routen) und Zähler.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BEREICHE, bereichHilfe, darfSeite, hatMitte, seitenRecht, ZAEHLER, type Bereichskennung } from '../../shared/src/werkbankansicht';
import { HILFE } from '../../shared/src/hilfe';
import { bereicheMitRoute, JEDER, NUR_GESAMT } from '../src/werkbank/verwaltungsbereiche';
import { werkbankZahlen } from '../src/werkbank/werkbankzahlen';

const wurzel = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const pfade = BEREICHE.map((b) => b.pfad as Bereichskennung);

/** Alle Texte des Bereichs „werkbank“ einer Sprache (Teildateien, #1279). */
function texte(sprache: string): Record<string, string> {
  const ordner = wurzel(`shared/src/sprachen/${sprache}/werkbank`);
  const alle: Record<string, string> = {};
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.json')))
    Object.assign(alle, JSON.parse(readFileSync(`${ordner}/${datei}`, 'utf8')) as Record<string, string>);
  return alle;
}

/** Handbuch je Sprache: Ordner der Seiten und Menü (Offline-Fassungen erben es mit INHERIT). */
const HANDBUCH = [
  { sprache: 'de', docs: 'docs/handbuch/admin/docs', menue: 'docs/handbuch/admin/mkdocs.yml' },
  { sprache: 'en', docs: 'docs/handbuch/admin/docs-en', menue: 'docs/handbuch/admin/mkdocs.en.yml' },
];

describe('Liste der Werkbank-Seiten (#1281)', () => {
  it('jede Seite hat Namen und „wann“ auf Deutsch und Englisch', () => {
    for (const sprache of ['de', 'en']) {
      const t = texte(sprache);
      const fehlt = pfade.flatMap((p) => ['name', 'wann'].map((k) => `bereich.${p}.${k}`)).filter((k) => !t[k]?.trim());
      assert.deepEqual(fehlt, [], `Texte fehlen in shared/src/sprachen/${sprache}/werkbank: ${fehlt.join(', ')}`);
    }
    // Die Übersicht ist immer da, ohne Eintrag in der Liste, aber mit Namen.
    for (const sprache of ['de', 'en']) assert.ok(texte(sprache)['bereich.uebersicht.name'], sprache);
  });

  it('jede Seite hat eine Hilfeseite im Administratorhandbuch, de und en, im Menü beider Sprachen', () => {
    const fehlt: string[] = [];
    for (const p of pfade) {
      const ziel = HILFE[bereichHilfe(p)];
      if (ziel.handbuch !== 'admin') fehlt.push(`${p}: Hilfe nicht im Administratorhandbuch`);
      const seite = `${ziel.seite.replace(/\/$/, '')}.md`;
      for (const h of HANDBUCH) {
        if (!existsSync(wurzel(`${h.docs}/${seite}`))) fehlt.push(`${p}: ${h.docs}/${seite} fehlt`);
        if (!new RegExp(`:\\s*${seite.replace('.', '\\.')}\\s*$`, 'm').test(readFileSync(wurzel(h.menue), 'utf8')))
          fehlt.push(`${p}: ${seite} nicht im Menü ${h.menue}`);
      }
    }
    assert.deepEqual(fehlt, [], fehlt.join('\n'));
  });

  it('jede Seite hat mindestens eine Route, und die Routen nennen nur Bereiche der Liste', () => {
    const mitRoute = bereicheMitRoute();
    assert.deepEqual(
      pfade.filter((p) => !mitRoute.has(p)),
      [],
      'Seite ohne Route in server/src/werkbank/verwaltungsbereiche.ts',
    );
    const bekannt = new Set<string>([...pfade, JEDER, NUR_GESAMT]);
    assert.deepEqual(
      [...mitRoute].filter((b) => !bekannt.has(b)),
      [],
    );
  });

  it('Recht auf eine Seite: die Seite selbst, dazu auchMit (#1184) – sonst nichts', () => {
    for (const p of pfade) for (const b of seitenRecht(p)) assert.ok(pfade.includes(b as Bereichskennung), `${p}: ${b}`);
    assert.deepEqual(seitenRecht('loeschprotokoll'), ['loeschkonzept', 'loeschprotokoll']);
    assert.deepEqual(seitenRecht('gibtesnicht'), ['gibtesnicht']);
    // Gleich wie die frühere Prüfung in Werkbank.tsx, für jede Seite und jede Auswahl mit einem Bereich.
    const frueher = (bereiche: string[] | null, pfad: string) =>
      bereiche === null ||
      pfad === 'uebersicht' ||
      pfad === 'ansicht' ||
      bereiche.includes(pfad) ||
      (pfad === 'loeschprotokoll' && bereiche.includes('loeschkonzept'));
    const auswahl: Array<string[] | null> = [null, [], ...pfade.map((p) => [p]), ['loeschkonzept', 'auskuenfte'], ['gibtesnicht']];
    for (const a of auswahl)
      for (const p of [...pfade, 'uebersicht', 'ansicht', 'gibtesnicht'])
        assert.equal(darfSeite(a, p), frueher(a, p), `${String(a)} → ${p}`);
  });

  it('Mitte und Zähler kommen aus der Liste', async () => {
    assert.ok(hatMitte('uebersicht') && hatMitte('typen') && !hatMitte('region'));
    assert.deepEqual(Object.keys(await werkbankZahlen({})).sort(), [...ZAEHLER].sort());
    // Seit #1585 hat jeder Bereich mit Zahl in der Leiste einen Zähler.
    assert.deepEqual([...ZAEHLER].sort(), [
      'ablaufvorlagen',
      'anmeldeschutz',
      'auskuenfte',
      'automatisierungen',
      'benutzer',
      'darfWeg',
      'nummernkreise',
      'pakete',
      'postfaecher',
      'rundgaenge',
      'stempel',
      'tipps',
      'woerter',
    ]);
  });
});
