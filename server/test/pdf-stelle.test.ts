/**
 * Gemeinsame PDF-Stelle (#541): pdf-lib wird nur in `server/src/pdf/` eingebunden. So trifft ein späterer
 * Austausch der Bibliothek (gepflegte Abspaltung, mehr über qpdf, anderes Werkzeug) nur diesen Ordner.
 * Diese Prüfung läuft in der CI – wie die Sperre gegen bunte Symbole (#425).
 *
 * Gesucht wird in Server, Weboberfläche und shared nach `from 'pdf-lib'`, `import('pdf-lib')` und
 * `require('pdf-lib')` (auch Unterpfade wie `pdf-lib/cjs/...`). Tests dürfen pdf-lib weiter nutzen, um die
 * erzeugten PDFs zu untersuchen – sie gehören nicht zum ausgelieferten Code.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const WURZEL = new URL('../..', import.meta.url).pathname;
const ORDNER = ['server/src', 'web/src', 'shared/src'].map((o) => join(WURZEL, o));
const STELLE = join(WURZEL, 'server/src/pdf') + '/';

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]pdf-lib(?:\/[^'"]*)?['"]/m;

export function bindetPdfLibEin(text: string): boolean {
  return text.split('\n').some((z) => IMPORT.test(z));
}

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === 'dist' ? [] : dateien(p);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(n) ? [p] : [];
  });
}

describe('Gemeinsame PDF-Stelle (#541)', () => {
  it('erkennt die Arten, pdf-lib einzubinden', () => {
    assert.ok(bindetPdfLibEin("import { PDFDocument } from 'pdf-lib';"));
    assert.ok(bindetPdfLibEin('import {\n  degrees,\n} from "pdf-lib";'));
    assert.ok(bindetPdfLibEin("const p = await import('pdf-lib');"));
    assert.ok(bindetPdfLibEin("const p = require('pdf-lib/cjs/api');"));
    assert.ok(bindetPdfLibEin("import 'pdf-lib';"));
    assert.ok(!bindetPdfLibEin(' * pdf-lib liest Bilder über DataView'));
    assert.ok(!bindetPdfLibEin("import { x } from './pdf';"));
  });

  it('pdf-lib nur in server/src/pdf/', () => {
    const funde = ORDNER.flatMap(dateien).filter((p) => !p.startsWith(STELLE) && bindetPdfLibEin(readFileSync(p, 'utf8')));
    assert.deepEqual(funde.map((p) => relative(WURZEL, p)), [], 'pdf-lib bitte nur über die PDF-Stelle server/src/pdf/ nutzen (#541).');
  });

  it('fontkit (#826) nur in der PDF-Stelle, mit fester Version', () => {
    const FONTKIT = /['"]@pdf-lib\/fontkit(?:\/[^'"]*)?['"]/;
    const funde = ORDNER.flatMap(dateien).filter((p) => !p.startsWith(STELLE) && FONTKIT.test(readFileSync(p, 'utf8')));
    assert.deepEqual(funde.map((p) => relative(WURZEL, p)), [], 'Schriften bitte nur über server/src/pdf/schrift.ts einbetten (#826).');
    const pk = JSON.parse(readFileSync(join(WURZEL, 'server/package.json'), 'utf8')) as { dependencies: Record<string, string> };
    assert.match(pk.dependencies['@pdf-lib/fontkit'], /^\d+\.\d+\.\d+$/, 'feste Version: Die Vorkehrungen in schrift.ts sind für 1.1.1 geprüft');
  });

  it('pdf-lib ist nur im Server eine Abhängigkeit', () => {
    for (const p of ['package.json', 'web/package.json', 'shared/package.json']) {
      let pk: { dependencies?: Record<string, string> };
      try { pk = JSON.parse(readFileSync(join(WURZEL, p), 'utf8')); } catch { continue; }
      assert.ok(!pk.dependencies?.['pdf-lib'], `${p}: pdf-lib gehört nur in server/package.json`);
    }
  });
});

/*
 * Grenzen prüfen (#823, Teil 2): Jede Stelle, die ein fremdes PDF öffnet, läuft im Arbeiter-Pool (#542) und lädt über
 * `ladePdf()` mit der Entpack-Grenze (0.164.2). Diese Prüfung hält beides fest – auch für neuen Code.
 */
const PDF_ORDNER = join(WURZEL, 'server/src/pdf');
const quelle = (n: string) => readFileSync(join(PDF_ORDNER, n), 'utf8');

/** Rumpf einer exportierten Funktion bzw. Konstante (bis zur nächsten Zeile, die mit `export`, `}` oder `/**` beginnt). */
export function rumpf(text: string, name: string): string | null {
  const m = new RegExp(`^export (?:async )?(?:function|const) ${name}\\b`, 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index);
  const ende = rest.slice(1).search(/\n(?:export |\/\*\*|\}\n)/);
  return ende < 0 ? rest : rest.slice(0, ende + 3);
}

/** Lädt dieser Code ein PDF (direkt oder über den eigenen Lade-Helfer eines Moduls)? */
export const laedtPdf = (code: string) => /\bladePdf\(|\blade\(|PDFDocument\.load\(/.test(code);

describe('Lesestellen nur im Arbeiter und über ladePdf() (#823)', () => {
  it('erkennt Laden und findet Rümpfe', () => {
    assert.ok(laedtPdf('const d = await ladePdf(x);'));
    assert.ok(laedtPdf('await PDFDocument.load(b)'));
    assert.ok(!laedtPdf('PDFDocument.create()'));
    assert.match(rumpf('export function a() {\n  return ladePdf(x);\n}\nexport function b() {}\n', 'a') ?? '', /ladePdf/);
    assert.ok(!(rumpf('export function a() {\n  return 1;\n}\nexport function b() { ladePdf(); }\n', 'a') ?? '').includes('ladePdf'));
  });

  it('PDFDocument.load nur in pdf/laden.ts – alle anderen laden über ladePdf()', () => {
    const funde = dateien(join(WURZEL, 'server/src')).filter((p) => !p.endsWith('/pdf/laden.ts') && /PDFDocument\s*\.\s*load\s*\(/.test(readFileSync(p, 'utf8')));
    assert.deepEqual(funde.map((p) => relative(WURZEL, p)), [], 'PDFs bitte nur über ladePdf() laden (#823): Es prüft vorher die Entpack-Grenze.');
  });

  it('außerhalb der PDF-Stelle nur Typen aus ihren Modulen – Vorgänge gehen über pdf/index.ts in den Arbeiter', () => {
    const MODUL = /(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s*['"](?:\.\.?\/)+(?:[\w-]+\/)*pdf\/(?!index['"])[\w-]+['"]/;
    const erlaubt = new Set([join(WURZEL, 'server/src/arbeit/vorgaenge.ts')]);
    const funde = dateien(join(WURZEL, 'server/src')).filter((p) => !p.startsWith(STELLE) && !erlaubt.has(p) && MODUL.test(readFileSync(p, 'utf8')));
    assert.deepEqual(funde.map((p) => relative(WURZEL, p)), [], 'Bitte Vorgänge der PDF-Stelle über ./pdf aufrufen (Arbeiter-Pool, #542), nicht direkt aus pdf/<modul>.');
  });

  it('pdf/index.ts gibt direkt nur Helfer weiter, die kein PDF laden; alles andere über arbeite()', () => {
    const index = quelle('index.ts');
    const weiter = [...index.matchAll(/^export \{([^}]*)\} from '\.\/([\w-]+)';/gm)];
    assert.ok(weiter.length > 3, 'Weitergaben gefunden');
    const funde: string[] = [];
    for (const [, namen, modul] of weiter) {
      const text = quelle(`${modul}.ts`);
      for (const roh of namen.split(',').map((x) => x.trim()).filter(Boolean)) {
        if (roh.startsWith('type ')) continue;
        const name = roh.split(/\s+as\s+/)[0].trim();
        const r = rumpf(text, name);
        if (r && laedtPdf(r)) funde.push(`${modul}.${name}`);
      }
    }
    assert.deepEqual(funde, [], 'Diese Funktionen laden ein PDF und laufen damit im Hauptfaden – bitte als Vorgang über arbeite() (#542).');
    // Jede Ladestelle der PDF-Stelle gehört zu einem Modul, das der Arbeiter kennt.
    const vorgaenge = readFileSync(join(WURZEL, 'server/src/arbeit/vorgaenge.ts'), 'utf8');
    const lader = readdirSync(PDF_ORDNER).filter((n) => n.endsWith('.ts') && n !== 'laden.ts' && n !== 'index.ts' && /\bladePdf\(/.test(quelle(n)));
    assert.ok(lader.length >= 6, `Ladestellen gefunden: ${lader.join(', ')}`);
    for (const n of lader) assert.ok(vorgaenge.includes(`'../pdf/${n.replace(/\.ts$/, '')}'`), `${n} lädt PDFs, kommt aber nicht in arbeit/vorgaenge.ts vor`);
  });
});

