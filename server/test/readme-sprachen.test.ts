/**
 * Bilder der README je Sprache (#574): README.en.md bindet nur englische Grafiken ein (`name.en.svg`), README.md
 * nur deutsche. Ausnahme sind Bildschirmfotos der Oberfläche, solange es sie nur auf Deutsch gibt (#357) – dann
 * steht in README.en.md direkt darunter der Hinweis „German only“. Abzeichen tragen in jeder Fassung eigene
 * Beschriftungen. Regel: CONTRIBUTING.md / CONTRIBUTING.en.md → Grafiken und Bilder je Sprache.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const WURZEL = new URL('../../', import.meta.url);
const lies = (datei: string) => readFileSync(new URL(datei, WURZEL), 'utf8');

/** Bildschirmfotos der Oberfläche aus dem Handbuch-Workflow, die es noch nicht auf Englisch gibt. */
const NUR_DEUTSCH = ['bilder/readme.png', 'bilder/readme-dunkel.png'];
/** Abzeichen: Dienste, die das Bild selbst erzeugen (die Beschriftung steht in der Adresse). */
const ABZEICHEN = [
  /^https:\/\/img\.shields\.io\//,
  /^https:\/\/api\.scorecard\.dev\//,
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/workflows\/.+\/badge\.svg$/,
];

/** Alle Bilder einer Markdown-Datei: ![…](…), <img src>, <source srcset>. */
function bilder(md: string): string[] {
  const r: string[] = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) r.push(m[1]);
  for (const m of md.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) r.push(m[1]);
  for (const m of md.matchAll(/<source\b[^>]*\bsrcset="([^"]+)"/g)) r.push(m[1].split(/\s+/)[0]);
  return r;
}
const istAbzeichen = (u: string) => ABZEICHEN.some((a) => a.test(u));
const nurDeutsch = (u: string) => NUR_DEUTSCH.some((n) => u.endsWith(`/${n}`));
const istLokal = (u: string) => !/^[a-z]+:/i.test(u);

/** Beschriftung eines Abzeichens: label=… bei shields.io, sonst der erste Teil von /badge/<Text>-<Wert>-<Farbe>. */
function beschriftung(u: string): string | null {
  const url = new URL(u);
  if (url.searchParams.get('label')) return url.searchParams.get('label');
  const b = /^\/badge\/([^-]+(?:--[^-]+)*)-/.exec(url.pathname);
  return b ? decodeURIComponent(b[1]).replace(/--/g, '-').replace(/_/g, ' ') : null;
}

describe('README je Sprache (#574)', () => {
  const de = lies('README.md');
  const en = lies('README.en.md');

  it('README.en.md bindet nur englische Grafiken ein, Bildschirmfotos mit Hinweis „German only“', () => {
    // Logo aus marke/ (#687): der Name Ablago ist in jeder Sprache gleich.
    const falsch = bilder(en).filter(
      (u) => !istAbzeichen(u) && !nurDeutsch(u) && !u.startsWith('docs/marke/') && !/\.en\.(svg|png|jpe?g|webp|gif)$/i.test(u),
    );
    assert.deepEqual(
      falsch,
      [],
      'Grafiken ohne .en in README.en.md – englische Fassung anlegen (CONTRIBUTING: Grafiken und Bilder je Sprache)',
    );
    // Jedes deutsche Bildschirmfoto: im <picture> bzw. Absatz direkt darunter der Hinweis.
    for (const u of bilder(en).filter(nurDeutsch)) {
      const ende = Math.max(en.indexOf('</picture>', en.indexOf(u)), en.indexOf(u));
      // Der nächste Absatz nach dem Bild.
      const danach = en
        .slice(ende)
        .split(/\n\s*\n/)
        .slice(0, 2)
        .join('\n');
      assert.match(danach, /German only/, `${u}: Hinweis „German only“ fehlt direkt unter dem Bild`);
    }
    assert.ok(bilder(en).some(nurDeutsch), 'Bildschirmfoto der Ablage in README.en.md');
  });

  it('README.md bindet keine englischen Grafiken ein; jede lokale Grafik gibt es in beiden Sprachen', () => {
    assert.deepEqual(
      bilder(de).filter((u) => /\.en\.[a-z]+$/i.test(u)),
      [],
    );
    for (const u of bilder(en).filter((x) => istLokal(x) && /\.en\./.test(x))) {
      assert.ok(existsSync(new URL(u, WURZEL)), `${u} fehlt`);
      const deutsch = u.replace(/\.en\.([a-z]+)$/i, '.$1');
      assert.ok(existsSync(new URL(deutsch, WURZEL)), `${deutsch} fehlt`);
      assert.ok(bilder(de).includes(deutsch), `README.md zeigt ${deutsch}`);
    }
    for (const u of bilder(de).filter(istLokal)) assert.ok(existsSync(new URL(u, WURZEL)), `${u} fehlt`);
  });

  it('englische Grafiken sind englisch beschriftet', () => {
    for (const u of bilder(en).filter((x) => istLokal(x) && x.endsWith('.en.svg'))) {
      const svg = lies(u);
      const texte = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g), ...svg.matchAll(/<title>([^<]*)<\/title>/g)]
        .map((m) => m[1])
        .join(' ');
      assert.doesNotMatch(texte, /[äöüÄÖÜß]|\b(für|und|nicht|Stand|Stufe|Unternehmen)\b/, `${u}: deutscher Text`);
      assert.match(svg, /aria-label="[^"]+"/, `${u}: aria-label`);
    }
  });

  it('Abzeichen tragen in README.en.md keine deutschen Beschriftungen', () => {
    const labels = (md: string) =>
      bilder(md)
        .filter(istAbzeichen)
        .map(beschriftung)
        .filter((x): x is string => !!x);
    const deutsch = new Set(labels(de));
    // Eigennamen sind in beiden Sprachen gleich.
    const gleich = labels(en).filter((l) => deutsch.has(l) && !['Release'].includes(l));
    assert.deepEqual(gleich, [], 'deutsche Beschriftung in README.en.md');
    assert.ok(labels(en).length >= 5);
  });
});
