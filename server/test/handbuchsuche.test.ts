import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ersteWorte, handbuchVerzeichnis, ohneHtml, sucheImHandbuch } from '../../shared/src/handbuchsuche';
import { handbuchSuchverzeichnisUrl } from '../../shared/src/hilfe';

/** Ausschnitt aus einem Suchverzeichnis, wie mkdocs (Plugin „search“) es baut. */
const ROH = {
  config: { lang: ['de'] },
  docs: [
    { location: '', title: 'Willkommen bei Ablago', text: '<p>Ablago ordnet deine Unterlagen.</p>' },
    { location: 'post/', title: 'Post', text: '<p>Neue Post kommt per Scan, Mail oder &bdquo;+ Neu&ldquo;.</p>' },
    { location: 'post/#dokument-ubernehmen', title: 'Dokument übernehmen', text: '<p>Klickst du in <strong>Neue Post</strong> eine Post an, öffnet sich die Seite &amp; mehr.</p>' },
    { location: 'post/#post-ab-hier-teilen', title: 'Post ab hier teilen', text: '<p>Hat eine Post mehrere Dokumente &#8211; etwa zwei Briefe &#x2013; teilst du sie.</p>' },
    { location: 'suchen/', title: 'Suchen', text: '<p>Das Suchfeld steht oben. Kuendigen findet kündigen.</p>' },
    { location: 42, title: 'kaputt' },
    { location: 'leer/', title: '   ' },
  ],
};

describe('Suche im Handbuch (#1219)', () => {
  it('liest das Suchverzeichnis: Text ohne HTML, Seite je Abschnitt; Kaputtes fällt weg', () => {
    const v = handbuchVerzeichnis(ROH);
    assert.equal(v.length, 5);
    const a = v.find((x) => x.adresse === 'post/#dokument-ubernehmen')!;
    assert.equal(a.seite, 'Post');
    assert.equal(a.istSeite, false);
    assert.equal(a.text, 'Klickst du in Neue Post eine Post an, öffnet sich die Seite & mehr.');
    assert.equal(v.find((x) => x.adresse === 'post/')!.seite, 'Post');
    assert.equal(v.find((x) => x.adresse === 'post/#post-ab-hier-teilen')!.text, 'Hat eine Post mehrere Dokumente – etwa zwei Briefe – teilst du sie.');
    assert.deepEqual(handbuchVerzeichnis(null), []);
    assert.deepEqual(handbuchVerzeichnis({ docs: 'nein' }), []);
  });

  it('sucht wie die Listen: Titel zuerst, alle Wörter, Umlaute; höchstens max Treffer', () => {
    const v = handbuchVerzeichnis(ROH);
    const r = sucheImHandbuch(v, 'post');
    assert.deepEqual(r.map((x) => x.abschnitt.adresse), ['post/', 'post/#post-ab-hier-teilen', 'post/#dokument-ubernehmen']);
    assert.ok(r[0].titel?.some((x) => x.treffer));
    assert.equal(sucheImHandbuch(v, 'post teilen').length, 1);
    assert.deepEqual(sucheImHandbuch(v, 'kündigen').map((x) => x.abschnitt.adresse), ['suchen/']);
    assert.deepEqual(sucheImHandbuch(v, '  '), []);
    assert.equal(sucheImHandbuch(v, 'post', 2).length, 2);
    // Ohne Fund im Text: die ersten Worte.
    const nurTitel = sucheImHandbuch(v, 'willkommen')[0];
    assert.deepEqual(nurTitel.ausschnitt, [{ text: 'Ablago ordnet deine Unterlagen.', treffer: false }]);
    // Fund im Text: Ausschnitt mit hervorgehobenem Wort.
    assert.ok(sucheImHandbuch(v, 'Scan')[0].ausschnitt.some((x) => x.treffer && x.text === 'Scan'));
  });

  it('Hilfen: HTML, erste Worte, Adresse des Verzeichnisses je Handbuch und Sprache', () => {
    assert.equal(ohneHtml('<p>a&nbsp;b &lt;c&gt; &unbekannt; &#0;</p>'), 'a b <c> &unbekannt;');
    assert.equal(ersteWorte('eins zwei drei', 12), 'eins zwei …');
    assert.equal(ersteWorte('kurz'), 'kurz');
    assert.equal(handbuchSuchverzeichnisUrl('benutzer', 'de'), '/hilfe/benutzer/search/search_index.json');
    assert.equal(handbuchSuchverzeichnisUrl('admin', 'en-GB'), '/hilfe/admin/en/search/search_index.json');
  });
});
