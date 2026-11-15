/**
 * Suche über alle Handbücher (#841): docs/handbuch/start/suche.mjs läuft ohne Bau auf help.ablago.app und in der Hilfe
 * im Programm. Ihr Kern soll genauso finden wie die Suche im Assistenten (shared/src/handbuchsuche.ts) – hier verglichen.
 * Dazu: Startseite und Seite „nicht gefunden“ binden denselben Baustein ein, offline.py passt die 404-Seite für /hilfe/ an.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { handbuchVerzeichnis, sucheImHandbuch, type HandbuchAbschnitt, type HandbuchTreffer } from '../../shared/src/handbuchsuche';

type Teil = { text: string; treffer: boolean };
interface StartTreffer { handbuch: string; abschnitt: HandbuchAbschnitt; titel?: Teil[]; ausschnitt: Teil[] }
interface StartSuche {
  handbuchVerzeichnis(roh: unknown): HandbuchAbschnitt[];
  sucheInHandbuechern(v: Array<{ handbuch: string; abschnitte: HandbuchAbschnitt[] }>, suche: string, max?: number): StartTreffer[];
}

const START = join(import.meta.dirname, '..', '..', 'docs', 'handbuch', 'start');
const laden = async () => (await import(pathToFileURL(join(START, 'suche.mjs')).href)) as StartSuche;

const lang = 'Wer Ablago ohne Internet betreibt, legt vorher das Image mit docker save ab. Danach geht die Wiederherstellung ohne Download, und die Pakete kommen samt Code aus der Sicherung zurück.';
const ROH = {
  config: { lang: ['de'] },
  docs: [
    { location: 'sicherung/', title: 'Sicherung', text: '<p>Was eine Sicherung enthält: Datenbank, Dokumente &amp; Logos.</p>' },
    { location: 'sicherung/#zeitplan', title: 'Zeitplan und Aufbewahrung', text: '<p>Jede Nacht um 02:00.</p>' },
    { location: 'wiederherstellen/', title: 'Wiederherstellen', text: `<p>${lang}</p>` },
    { location: 'wiederherstellen/#ohne-internet', title: 'Wiederherstellen ohne Internet', text: '<p>Schlüssel vom Notfallblatt bereithalten.</p>' },
    { location: 'gebuehren/', title: 'Gebühren und Straße', text: '<p>Kündigen bis zum Monatsende.</p>' },
    { location: 'kaputt/', title: '', text: 'ohne Titel' },
  ],
};

const vergleichbar = (t: HandbuchTreffer | StartTreffer) => ({ adresse: t.abschnitt.adresse, titel: t.titel, ausschnitt: t.ausschnitt });

describe('Suche über alle Handbücher (#841)', () => {
  it('findet wie die Suche im Assistenten: Umlaute, ae/oe/ue, ß, Groß/klein, mehrere Wörter, Ausschnitt', async () => {
    const k = await laden();
    const abschnitte = handbuchVerzeichnis(ROH);
    assert.deepEqual(k.handbuchVerzeichnis(ROH), abschnitte);
    for (const suche of ['sicherung', 'SICHERUNG', 'gebuhr', 'gebuehren', 'strasse', 'kuendigen', 'ohne internet', 'docker save', 'notfallblatt schlüssel', 'gibt es nicht', ' ']) {
      assert.deepEqual(k.sucheInHandbuechern([{ handbuch: 'admin', abschnitte }], suche, 8).map(vergleichbar), sucheImHandbuch(abschnitte, suche, 8).map(vergleichbar), suche);
    }
  });

  it('mehrere Handbücher: Titeltreffer zuerst, je mit Handbuch; höchstens zehn', async () => {
    const k = await laden();
    const abschnitte = handbuchVerzeichnis(ROH);
    const benutzer = handbuchVerzeichnis({ docs: [{ location: 'post/', title: 'Post', text: 'Eine Sicherung der Post gibt es auch.' }, { location: 'sicherung/', title: 'Sicherung für dich', text: '' }] });
    const t = k.sucheInHandbuechern([{ handbuch: 'benutzer', abschnitte: benutzer }, { handbuch: 'admin', abschnitte }], 'sicherung');
    assert.deepEqual(t.map((x) => `${x.handbuch}:${x.abschnitt.adresse}`), ['benutzer:sicherung/', 'admin:sicherung/', 'benutzer:post/', 'admin:wiederherstellen/']);
    const viele = handbuchVerzeichnis({ docs: Array.from({ length: 30 }, (_, i) => ({ location: `s${i}/`, title: `Seite ${i}`, text: 'Sicherung' })) });
    assert.equal(k.sucheInHandbuechern([{ handbuch: 'admin', abschnitte: viele }], 'sicherung').length, 10);
  });

  it('Startseite und Seite „nicht gefunden“ nutzen denselben Baustein; 404 mit Umleitung alter Adressen und Meldelink', () => {
    const start = readFileSync(join(START, 'index.html'), 'utf8');
    const en = readFileSync(join(START, 'en', 'index.html'), 'utf8');
    const seite = readFileSync(join(START, '404.html'), 'utf8');
    for (const html of [start, en, seite]) {
      assert.match(html, /starteSuche\(/);
      assert.match(html, /data-ordner="aktuell\/"/);
    }
    assert.match(seite, /<base href="\/">/);
    assert.match(seite, /data-version=""/);
    assert.match(seite, /Diese Seite gibt es hier nicht/);
    assert.match(seite, /issues\/new\?template=kaputter-link\.yml/);
    // Umleitung alter Adressen (#846) bleibt vor der Anzeige.
    assert.match(seite, /v\\d\+\\\.\\d\+\$/);
    // Nichts von außen (#698): kein fremdes Skript, kein fremdes Stylesheet.
    assert.doesNotMatch(seite, /<(script|link)[^>]+(src|href)="https?:/);
  });

  it('Issue-Vorlage „Kaputter Link“: Feld-Ids, die die Seite vorausfüllt', () => {
    const vorlage = readFileSync(join(import.meta.dirname, '..', '..', '.github', 'ISSUE_TEMPLATE', 'kaputter-link.yml'), 'utf8');
    for (const id of ['adresse', 'herkunft', 'herkunft_genau', 'version', 'client']) assert.match(vorlage, new RegExp(`id: ${id}\\n`));
    assert.match(vorlage, /labels: \["kaputter-link", "bug"\]/);
  });
});
