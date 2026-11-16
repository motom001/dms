/**
 * Charakterisierung von `legeIntern` (#1278, Schritt 6a): Vor dem Zerlegen hält dieser Test fest, was Installieren und
 * Aktualisieren eines Pakets in der Ablage hinterlassen – Typen (zweiter Durchgang, Tabelle, Quellen), Ansichten,
 * Beispiele, Wortlisten, Eintrag des Pakets – und was nach einem Fehler mitten im Anlegen zurückgerollt ist.
 *
 * Erwartung: `test/charakter/anlegen.json` (Ids durch Namen ersetzt, ohne Zeiten). Neu schreiben nur, wenn sich das
 * Verhalten bewusst ändert: `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/pakete-anlegen-charakter.test.ts`.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Paketverwaltung } from '../src/pakete/verwaltung/index';
import { speicherRepo } from '../src/repo/speicher';
import { zipPuffer } from '../src/formate/zip';

const DATEI = fileURLToPath(new URL('./charakter/anlegen.json', import.meta.url));
const BASIS = fileURLToPath(new URL('./pakete/basis', import.meta.url));
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };

function ordner(pfad: string, vor = ''): Record<string, string> {
  const erg: Record<string, string> = {};
  for (const n of readdirSync(pfad)) {
    const p = join(pfad, n);
    if (statSync(p).isDirectory()) Object.assign(erg, ordner(p, `${vor}${n}/`));
    else erg[`${vor}${n}`] = readFileSync(p, 'utf8');
  }
  return erg;
}
const alsZip = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })));

/** Paket „probe“: Akte und Vorgang verweisen aufeinander (zweiter Durchgang), Tabelle und Quelle über den Verweis. */
function probe(version: '1.0.0' | '1.1.0'): Buffer {
  const neu = version === '1.1.0';
  const manifest = [
    'schema: 1',
    'id: probe',
    'name: Probe',
    `version: ${version}`,
    'beschreibung: Probepaket für die Charakterisierung des Installers.',
    'autor: { name: Test, github: test }',
    'lizenz: MIT',
    'dms: ">=0.248.0"',
    'abhaengigkeiten: { basis: ">=1.0.0" }',
    'kurzanleitung: { de: [Erst eine Akte anlegen.] }',
    'inhalt:',
    '  mappentypen: inhalt/mappentypen.yaml',
    '  sichten: inhalt/sichten.yaml',
    '  beispiele: inhalt/beispiele.yaml',
    '  wortlisten: inhalt/wortlisten.yaml',
    '',
  ].join('\n');
  const typen = `
- schluessel: akte
  name: Akte
  beschreibung: Eine Akte
  titelVorlage: "{name}"
  beschriftungen: { en: { name: File } }
  felder:
    - { key: name, label: Name, typ: text, pflicht: true }
    - { key: vorgang, label: Letzter Vorgang, typ: referenz, ziel: vorgang, verweisart: bezug }
    - { key: stelle, label: Stelle, typ: referenz, ziel: "basis:organisation", verweisart: bezug }
    - { key: wer, label: Wer, typ: referenz, ziel: "dms:benutzer", verweisart: bezug }
    - { key: posten, label: Posten, typ: tabelle, quelle: { typ: vorgang, feld: akte } }
    - key: hinweis
      label: Hinweis
      typ: text
      anzeigen: { modus: alle, bedingungen: [{ art: verweistyp, feld: stelle, typ: "basis:organisation" }] }${
        neu
          ? `
    - { key: notiz, label: Notiz, typ: langtext }
    - { key: kennung, label: Kennung, typ: text, erkennung: { art: iban } }`
          : ''
      }
  register:
    - key: daten
      name: Daten
      art: felder
      felder: [name, vorgang, stelle, wer, posten, hinweis${neu ? ', notiz, kennung' : ''}]${
        neu ? '\n      abschnitte: [{ vor: stelle, titel: Beteiligte }]' : ''
      }
    - { key: vorgaenge, name: Vorgänge, art: verknuepfungen, quellen: [{ typ: vorgang, feld: akte }] }${
      neu ? '\n    - { key: protokoll, name: Verlauf, art: protokoll }' : ''
    }
  trefferliste: [name, stelle]
- schluessel: vorgang
  name: Vorgang
  beschreibung: Ein Vorgang einer Akte
  titelVorlage: "{titel}"
  gehoertZu: akte
  archiv: { jahre: 6 }
  felder:
    - { key: titel, label: Titel, typ: text, pflicht: true }
    - { key: akte, label: Akte, typ: referenz, ziel: akte, pflicht: true, verweisart: zugehoerigkeit }
    - { key: betrag, label: Betrag, typ: betrag }${neu ? '\n    - { key: datum, label: Datum, typ: datum }' : ''}
  register:
    - { key: daten, name: Daten, art: felder, felder: [titel, akte, betrag${neu ? ', datum' : ''}] }
    - { key: dok, name: Dokumente, art: dokumente }
`;
  const sichten = `
- { schluessel: akten, name: Akten, typen: [akte], symbol: folder }
- { schluessel: offene, name: Offene Vorgänge, eltern: akten, typen: [vorgang], bedingungen: [{ feld: betrag, operator: leer }] }
- { schluessel: mit_stelle, name: Mit Stelle, eltern: akten, typen: [akte, "basis:organisation"] }${
    neu ? '\n- { schluessel: neu, name: Neue Akten, eltern: akten, typen: [akte], bedingungen: [{ feld: notiz, operator: leer }] }' : ''
  }
`;
  const beispiele = `
- { typ: akte, schluessel: a1, werte: { name: Musterakte, hinweis: Probe } }
- { typ: vorgang, schluessel: v1, werte: { titel: Erster, akte: { beispiel: a1 }, betrag: { betrag: 12.5, waehrung: EUR } } }
`;
  const wortlisten = neu ? '- woerter: [Akte, Ordner, Mappe]\n' : '- woerter: [Akte, Ordner]\n';
  return alsZip({
    'manifest.yaml': manifest,
    'README.md': '# Probe\n',
    LICENSE: 'MIT\n',
    'CHANGELOG.md': `# Änderungen\n\n## ${version}\n\n- Probe.\n`,
    'inhalt/mappentypen.yaml': typen,
    'inhalt/sichten.yaml': sichten,
    'inhalt/beispiele.yaml': beispiele,
    'inhalt/wortlisten.yaml': wortlisten,
  });
}

function dms() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const p = new Paketverwaltung(d, {
    version: () => '0.290.13',
    katalogUrl: 'https://katalog.test/katalog.json',
    abruf: async () => {
      throw new Error('ohne Netz');
    },
  });
  return { d, p };
}

async function installiere(p: Paketverwaltung, zip: Buffer, beispiele = true) {
  const h = await p.hochladen(zip, ICH);
  return p.installiere({ upload: h.upload, bestaetigt: true, beispiele }, ICH);
}

/** Stand der Ablage ohne Ids und Zeiten: Typen über ihre Kennung, Ansichten über den Namen, Mappen über Typ und Nummer. */
async function stand(d: Dienst) {
  const alle = await d.mappentypen.listeTypen();
  // Systemtypen (Benutzer, Rolle, Post) und ihre Ansichten ändert kein Paket – sie stehen nur für die Namen da.
  const typen = alle.filter((t) => !t.system);
  const sichten = (await d.sichtenVerwaltung.listeSichten()).filter(
    (s) => !s.typen.length || s.typen.some((x) => typen.some((t) => t.id === x)),
  );
  const pakete = await d.kern.repo.listePakete();
  const mappen: Record<string, unknown[]> = {};
  for (const t of typen) mappen[t.schluessel ?? t.name] = await d.kern.repo.listeMappen(t.id);
  const synonyme: Record<string, unknown> = {};
  for (const p of pakete) synonyme[p.id] = await d.suche.paketSynonyme(p.id);
  const namen = new Map<string, string>();
  for (const t of alle) namen.set(t.id, `T(${t.schluessel ?? t.name})`);
  for (const s of sichten) namen.set(s.id, `S(${s.name})`);
  for (const [k, l] of Object.entries(mappen)) (l as Array<{ id: string }>).forEach((m, i) => namen.set(m.id, `M(${k}#${i})`));
  namen.set(ICH.id, 'ICH');
  const text = JSON.stringify({ typen, sichten, pakete, mappen, synonyme })
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (u) => namen.get(u) ?? 'ID')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, 'ZEIT')
    .replace(/"[0-9a-f]{64}"/g, '"PRUEFWERT"');
  return JSON.parse(text) as Record<string, unknown>;
}

/** Lässt die Methode `name` von `ziel` beim `mal`-ten Aufruf scheitern; gibt die ursprüngliche zurück. */
function scheitere<T extends object>(ziel: T, name: keyof T, mal = 1) {
  const vorher = ziel[name] as (...a: unknown[]) => Promise<unknown>;
  let n = 0;
  (ziel as Record<keyof T, unknown>)[name] = (...a: unknown[]) =>
    ++n === mal ? Promise.reject(new Error('Probefehler')) : vorher.apply(ziel, a);
  return () => ((ziel as Record<keyof T, unknown>)[name] = vorher);
}

/** Frische Ablage mit Basis. */
async function mitBasis() {
  const x = dms();
  await installiere(x.p, alsZip(ordner(BASIS)), false);
  return x;
}
const meldung = (p: Promise<unknown>) =>
  p.then(
    () => 'kein Fehler',
    (e: Error) => e.message,
  );

/**
 * Je Fall eine frische Ablage. Hinweis zum Stand nach einem Fehler: Akte und Vorgang verweisen aufeinander – ohne
 * Transaktion lässt sich keiner der beiden löschen, sie bleiben (so ist es heute; der Test hält es fest).
 */
async function lauf() {
  const erg: Record<string, unknown> = {};
  // 1. Fehler beim Speichern des Eintrags: Typen, Ansichten, Beispiele und Wortlisten sind schon geschrieben.
  {
    const { d, p } = await mitBasis();
    erg.vorher = await stand(d);
    scheitere(d.kern.repo, 'speicherePaket');
    erg.fehlerSpeichern = await meldung(installiere(p, probe('1.0.0')));
    erg.nachFehlerSpeichern = await stand(d);
  }
  // 2. Fehler im zweiten Durchgang der neuen Typen (Ergänzen um die Verweise).
  {
    const { d, p } = await mitBasis();
    scheitere(d.mappentypen, 'aendereTyp');
    erg.fehlerZweiterDurchgang = await meldung(installiere(p, probe('1.0.0')));
    erg.nachFehlerZweiterDurchgang = await stand(d);
  }
  // 3. Installieren mit Beispielen; Update mit Fehler beim Anlegen der neuen Ansicht, dann ohne Fehler.
  {
    const { d, p } = await mitBasis();
    await installiere(p, probe('1.0.0'));
    erg.installiert = await stand(d);
    const zurueck = scheitere(d.sichtenVerwaltung, 'legeSichtAn');
    erg.fehlerUpdate = await meldung(installiere(p, probe('1.1.0')));
    zurueck();
    erg.nachFehlerUpdate = await stand(d);
    await installiere(p, probe('1.1.0'));
    erg.aktualisiert = await stand(d);
  }
  return erg;
}

describe('legeIntern: Charakterisierung (#1278)', () => {
  it('Installieren, Aktualisieren und Zurückrollen wie festgehalten', async () => {
    const ist = await lauf();
    if (process.env.CHARAKTER_SCHREIBEN) {
      mkdirSync(dirname(DATEI), { recursive: true });
      writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
    }
    assert.ok(existsSync(DATEI), 'Erwartung fehlt');
    const soll = JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys(soll)) assert.deepEqual(ist[k], soll[k], k);
    assert.deepEqual(Object.keys(ist), Object.keys(soll));
  });
});
