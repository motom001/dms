/** Behobene CodeQL-Funde (#250): ReDoS bei SVG, eigenes CSS, Maskierungen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cssOhneSpitzeKlammer, markdownZelle } from '../../shared/src/maskieren';
import { speicherDateien } from '../src/dateispeicher';
import { Designs, istSvg, pruefeLogo, speicherDesignRepo } from '../src/designs';
import { Fachfehler } from '../src/fehler';

describe('CodeQL-Funde (#250)', () => {
  it('erkennt SVG nach XML-Deklaration und Kommentaren', () => {
    assert.equal(istSvg('<svg/>'), false, 'braucht Leerraum oder > nach svg');
    assert.equal(istSvg('<svg>'), true);
    assert.equal(istSvg('  <?xml version="1.0"?>\n<!-- a --> <!-- b -->\n<SVG viewBox="0 0 1 1">'), true);
    assert.equal(istSvg('<!-- offen <svg>'), false);
    assert.equal(istSvg('<?xml version="1.0"'), false);
    assert.equal(istSvg('<html><svg>'), false);
  });

  it('prüft präparierte SVGs schnell (kein ReDoS)', () => {
    const boese = '<!---->'.repeat(20000) + '<!--' + ' '.repeat(50000);
    const start = performance.now();
    assert.throws(() => pruefeLogo(Buffer.from(boese)), (e) => e instanceof Fachfehler && e.status === 422);
    assert.ok(performance.now() - start < 1000, 'unter einer Sekunde');
  });

  it('lehnt „<“ im eigenen CSS ab und maskiert es bei der Anzeige', async () => {
    const d = new Designs(speicherDesignRepo(), speicherDateien());
    const { designs } = await d.liste();
    const s = designs[0];
    for (const css of ['</style><script>alert(1)</script>', '<</style>/style>', 'a::before { content: "<" }'])
      await assert.rejects(d.aendere(s.id, { ...s, css }), (e) => e instanceof Fachfehler && e.status === 422, css);
    await d.aendere(s.id, { ...s, css: 'a::before { content: "\\3C " }' });
    assert.equal(cssOhneSpitzeKlammer('<</style>/style>'), '\\3C \\3C /style>/style>');
    assert.ok(!cssOhneSpitzeKlammer('x</style>').includes('<'));
  });

  it('maskiert Markdown-Zellen vollständig', () => {
    assert.equal(markdownZelle('a|b\\|c\nd'), 'a\\|b\\\\\\|c d');
  });
});
