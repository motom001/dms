#!/usr/bin/env node
/**
 * Bestandteile und Lizenzen im Release-Text (#1393).
 *
 * Aus den Stücklisten (SPDX von Trivy) der fertigen Images – je Variante (dms, dms-komplett) und Architektur (amd64,
 * arm64) – entstehen:
 *   bestandteile.md                  Abschnitt für den Release-Text (Stand, Änderungen, Lizenzen, Systemprogramme)
 *   ablago-bestandteile.csv          alle Bestandteile mit Quelle, Vergleichsgrundlage für das nächste Release
 *   ablago-bestandteile.spdx.json    zusammengeführte Stückliste (SPDX 2.3)
 *   ablago-bestandteile.cdx.json     dieselbe Liste als CycloneDX 1.5
 * Die Dateinamen tragen keine Versionsnummer: So führt …/releases/latest/download/<name> immer zur stabilen Version.
 *
 * Ergänzt wird, was ein Scanner im Image nicht als Paket erkennt: Node.js selbst, die in die Weboberfläche gebündelten
 * Bibliotheken (aus package-lock.json), die Schriften für Ablagos eigene PDFs, die Inhalte des Offline-Handbuchs und
 * Ablago selbst. „Wozu“ der Systemprogramme steht in bestandteile-wozu.json.
 *
 * Baum der Bestandteile (#1412): Jeder Bestandteil trägt seine Ebene (0 = Ablago selbst, 1 = direkt eingebunden,
 * 2+ = mitgebracht), die Pakete der Ebene 1, über die er kommt („Eingebracht durch“), seinen Einsatz (Betrieb =
 * im Image; Entwicklung und Test = nur beim Bauen und Prüfen, nicht im Image) und bei Ebene 1 den Zweck aus
 * bestandteile-wozu.json. npm kommt aus den Lockfiles, Alpine aus den Beziehungen DEPENDS_ON der Stückliste von Trivy
 * (Paketdatenbank im Image). SPDX und CycloneDX tragen die Abhängigkeiten als Beziehungen.
 *
 * Aufruf (release.yml):
 *   node .github/werkzeuge/bestandteile.mjs --stand <ordner> --tag v1.2.3 --commit <sha> --datum <ISO>
 *        --aus <ordner> [--vorher <csv> --vorher-tag v1.2.2]
 * <ordner> enthält je Variante stand-<variante>.json und <variante>-<arch>.spdx.json (Job image-zusammen).
 *
 * Handbuchseite „Aufbau aus Bestandteilen“ (Entwicklerhandbuch, de und en), aus Lockfiles und bestandteile-wozu.json:
 *   node .github/werkzeuge/bestandteile.mjs --handbuch            schreibt die beiden Seiten
 *   node .github/werkzeuge/bestandteile.mjs --handbuch-pruefen    Job „stil“: Fehler, wenn sich Ebene 1, Zweck oder
 *                                                                Einsatz geändert haben; nur Hinweis, wenn sich bloß
 *                                                                mitgebrachte Pakete geändert haben (Dependabot)
 *
 * Tests: node --test .github/werkzeuge/bestandteile.test.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const REPO = 'motom001/dms';
export const HANDBUCH = 'https://help.ablago.app/admin/aktuell/bestandteile/';
const AUFBAU_URL = 'https://help.ablago.app/entwickler/aktuell/bestandteile-aufbau/';
export const DATEIEN = {
  csv: 'ablago-bestandteile.csv',
  spdx: 'ablago-bestandteile.spdx.json',
  cdx: 'ablago-bestandteile.cdx.json',
};
const VARIANTEN = ['dms', 'dms-komplett'];
const ARCHITEKTUREN = ['amd64', 'arm64'];

/** Einsatz eines Bestandteils (#1412): nur „Betrieb“ steckt im Image. */
export const EINSATZ = ['Betrieb', 'Entwicklung', 'Test'];
/** Herkunft der Alpine-Pakete, die keins der eigens installierten Pakete braucht. */
export const BASIS = 'Basis-Image (node, Alpine)';
export const AUFBAU = {
  de: 'docs/handbuch/entwickler/docs/bestandteile-aufbau.md',
  en: 'docs/handbuch/entwickler/docs-en/bestandteile-aufbau.md',
};
const RAUCHTEST_LOCK = 'web/rauchtest/package-lock.json';

/** Lizenzen mit besonderen Pflichten (Copyleft): werden im Text einzeln genannt. */
const PFLICHTEN = /\b(A?GPL|LGPL|MPL|EPL|EUPL|CDDL|OSL|CPL|CC-BY-SA)-/;
const OHNE = new Set(['', 'NOASSERTION', 'NONE']);

// ---------------------------------------------------------------------------------------------------------------
// Lizenzen

/** LicenseRef-… durch den Namen aus hasExtractedLicensingInfos ersetzen (Trivy: „bzip-2-1.0.6“, „EUPL-1.1“ …). */
export function lizenzText(ausdruck, extrahiert = {}) {
  const roh = (ausdruck ?? '').trim();
  if (OHNE.has(roh)) return '';
  // Alpine schreibt „Public Domain“ ohne Anführungszeichen; Trivy macht daraus zwei Lizenzen „Public“ AND „Domain“
  // (bzw. „Public-Domain“). Nur die Ansicht fasst das zusammen, die SPDX-Anhänge behalten den Ausdruck von Trivy.
  return roh
    .replace(/LicenseRef-[A-Za-z0-9.-]+/g, (ref) => extrahiert[ref] ?? ref)
    .replace(/\bPublic AND Domain\b|\bPublic-Domain\b/g, 'Public Domain');
}

/** Einzelne Kennungen eines Ausdrucks, z. B. „GPL-2.0-or-later AND LGPL-2.1-or-later“ → zwei. */
export function lizenzKennungen(text) {
  return [
    ...new Set(
      text
        .replace(/[()]/g, ' ')
        .split(/\s+(?:AND|OR|WITH)\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** 'ohne' (keine erkannte Lizenz), 'pflichten' (Copyleft) oder 'frei'. */
export function einteilen(text) {
  if (!text) return 'ohne';
  return PFLICHTEN.test(` ${text}`) ? 'pflichten' : 'frei';
}

// ---------------------------------------------------------------------------------------------------------------
// Stückliste von Trivy lesen

function anmerkung(paket, schluessel) {
  const a = (paket.annotations ?? []).find((x) => x.comment?.startsWith(`${schluessel}: `));
  return a ? a.comment.slice(schluessel.length + 2) : '';
}

function purl(paket) {
  return (paket.externalRefs ?? []).find((r) => r.referenceType === 'purl')?.referenceLocator ?? '';
}

/** „v3.24“ aus „pkg:apk/alpine/busybox@1.37.0-r30?arch=x86_64&distro=3.24.4“. */
export function alpineZweig(p) {
  const m = /[?&]distro=(\d+)\.(\d+)/.exec(p);
  return m ? `v${m[1]}.${m[2]}` : '';
}

export function npmQuelle(name, version) {
  return `https://www.npmjs.com/package/${name}/v/${version}`;
}

function alpineQuelle(name, zweig) {
  return `https://pkgs.alpinelinux.org/packages?name=${encodeURIComponent(name)}&branch=${zweig || 'edge'}`;
}

function artAlpine(name) {
  return name.startsWith('font-') ? 'Schrift (Alpine)' : 'Alpine-Paket';
}

/**
 * Bestandteile einer Stückliste (eine Variante, eine Architektur). Image und Betriebssystem selbst zählen nicht.
 * Alpine-Pakete bekommen aus den Beziehungen DEPENDS_ON, was sie brauchen (`braucht`, als „name@version“).
 */
export function ausSpdx(doc, { variante, arch }) {
  const extrahiert = Object.fromEntries((doc.hasExtractedLicensingInfos ?? []).map((l) => [l.licenseId, l.name]));
  const liste = [];
  const alpine = new Map();
  for (const p of doc.packages ?? []) {
    const typ = anmerkung(p, 'PkgType');
    if (typ !== 'alpine' && typ !== 'node-pkg') continue;
    const roh = p.licenseDeclared ?? p.licenseConcluded ?? '';
    const lizenz = lizenzText(roh, extrahiert);
    const refs = Object.fromEntries((roh.match(/LicenseRef-[A-Za-z0-9.-]+/g) ?? []).map((r) => [r, extrahiert[r] ?? r]));
    const b = { name: p.name, version: p.versionInfo ?? '', lizenz, spdx: OHNE.has(roh.trim()) ? '' : roh, refs };
    Object.assign(b, { varianten: [variante], architekturen: [arch], einsatz: ['Betrieb'], braucht: [] });
    if (typ === 'alpine') {
      const herkunft = /^built package from: (\S+)/.exec(p.sourceInfo ?? '')?.[1] ?? p.name;
      Object.assign(b, { art: artAlpine(p.name), herkunft, quelle: alpineQuelle(herkunft, alpineZweig(purl(p))) });
      if (p.SPDXID) alpine.set(p.SPDXID, b);
    } else if (p.name.startsWith('@dms/')) {
      Object.assign(b, { art: 'Ablago selbst', herkunft: '', quelle: `https://github.com/${REPO}`, ebene: 0 });
    } else {
      Object.assign(b, { art: 'npm (Server)', herkunft: '', quelle: npmQuelle(p.name, b.version) });
    }
    liste.push(b);
  }
  for (const r of doc.relationships ?? []) {
    if (r.relationshipType !== 'DEPENDS_ON') continue;
    const von = alpine.get(r.spdxElementId);
    const zu = alpine.get(r.relatedSpdxElement);
    if (von && zu && von !== zu) von.braucht.push(`${zu.name}@${zu.version}`);
  }
  return liste;
}

// ---------------------------------------------------------------------------------------------------------------
// Baum der Bestandteile (#1412)

/** Name eines Lockfile-Eintrags: „node_modules/a/node_modules/@b/c“ → „@b/c“. */
function lockName(ort, e) {
  return e?.name ?? ort.slice(ort.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

/** Was ein installiertes Paket braucht, aufgelöst wie Node; nicht installierte (optionale) und Verweise fallen weg. */
function kinderVon(pakete, ort) {
  const e = pakete[ort];
  const namen = Object.keys({ ...e.dependencies, ...e.optionalDependencies, ...e.peerDependencies });
  return namen.map((n) => aufloesen(pakete, ort, n)).filter((k) => k && !pakete[k].link);
}

/**
 * Baum aus einem Lockfile: von jeder Wurzel (direkt eingebundenes Paket, `{ von, name }` mit `von` = Ort des
 * Arbeitsbereichs wie „server“) Schicht für Schicht. Ergebnis je „name@version“: kleinste Ebene (1 = Wurzel), die
 * Wurzeln, über die es kommt (`durch`, nur für Ebene 2+), und was es braucht (`braucht`).
 */
export function lockBaum(lock, wurzeln) {
  const pakete = lock.packages ?? {};
  const knoten = new Map();
  const id = (ort) => `${lockName(ort, pakete[ort])}@${pakete[ort].version}`;
  for (const { von, name } of wurzeln) {
    const start = aufloesen(pakete, von, name);
    if (!start || pakete[start].link) continue;
    const gesehen = new Set([start]);
    let schicht = [start];
    for (let ebene = 1; schicht.length; ebene++) {
      const naechste = [];
      for (const ort of schicht) {
        const e = pakete[ort];
        const k = knoten.get(id(ort)) ?? {
          name: lockName(ort, e),
          version: e.version,
          lizenz: lizenzText(typeof e.license === 'string' ? e.license : ''),
          ebene,
          durch: new Set(),
          braucht: new Set(),
        };
        knoten.set(id(ort), k);
        k.ebene = Math.min(k.ebene, ebene);
        if (ebene > 1) k.durch.add(name);
        for (const kind of kinderVon(pakete, ort)) {
          k.braucht.add(id(kind));
          if (!gesehen.has(kind)) (gesehen.add(kind), naechste.push(kind));
        }
      }
      schicht = naechste;
    }
  }
  for (const k of knoten.values()) if (k.ebene === 1) k.durch.clear();
  return knoten;
}

/** Ebene, Herkunft und Abhängigkeiten aus einem Baum (lockBaum) an die Bestandteile hängen. */
function mitBaum(b, baum) {
  const k = baum.get(`${b.name}@${b.version}`);
  if (!k) return { ...b, ebene: b.ebene ?? null, durch: b.durch ?? [], braucht: b.braucht ?? [] };
  return { ...b, ebene: k.ebene, durch: sortiert(k.durch), braucht: sortiert(k.braucht) };
}

/** Pakete der Ebene 1 im Server: `dependencies` des Arbeitsbereichs „server“ im Lockfile. */
export function serverWurzeln(lock) {
  return Object.keys(lock.packages?.server?.dependencies ?? {}).map((name) => ({ von: 'server', name }));
}

/** Npm-Pakete des Servers aus der Stückliste mit Ebene und Herkunft aus dem Lockfile. */
export function serverBaum(liste, lock) {
  const baum = lockBaum(lock, serverWurzeln(lock));
  return liste.map((b) => (b.art === 'npm (Server)' ? mitBaum(b, baum) : b));
}

/**
 * Ebenen der Alpine-Pakete einer Stückliste: Wurzeln sind die eigens installierten Pakete (`wurzeln`, aus „apk add“
 * bzw. bestandteile-wozu.json). Was keine Wurzel braucht, kommt mit dem Basis-Image (Ebene 2+, „Eingebracht durch“
 * BASIS).
 */
export function alpineEbenen(liste, wurzeln) {
  const alpine = liste.filter((b) => b.art === 'Alpine-Paket' || b.art === 'Schrift (Alpine)');
  const nachId = new Map(alpine.map((b) => [`${b.name}@${b.version}`, b]));
  const info = new Map(alpine.map((b) => [b, { ebene: Infinity, durch: new Set() }]));
  const laufen = (starts, ebeneStart, herkunft) => {
    for (const start of starts) {
      const gesehen = new Set([start]);
      let schicht = [start];
      for (let ebene = ebeneStart; schicht.length; ebene++) {
        const naechste = [];
        for (const b of schicht) {
          const i = info.get(b);
          i.ebene = Math.min(i.ebene, ebene);
          if (ebene > 1) i.durch.add(herkunft ?? start.name);
          for (const kind of b.braucht.map((x) => nachId.get(x)).filter(Boolean))
            if (!gesehen.has(kind) && (herkunft === undefined || info.get(kind).ebene === Infinity || info.get(kind).durch.has(herkunft)))
              (gesehen.add(kind), naechste.push(kind));
        }
        schicht = naechste;
      }
    }
  };
  laufen(
    alpine.filter((b) => wurzeln.includes(b.name)),
    1,
  );
  const uebrig = alpine.filter((b) => info.get(b).ebene === Infinity);
  const gebraucht = new Set(uebrig.flatMap((b) => b.braucht));
  const basisStarts = uebrig.filter((b) => !gebraucht.has(`${b.name}@${b.version}`));
  laufen(basisStarts.length ? basisStarts : uebrig, 2, BASIS);
  for (const b of alpine) {
    const i = info.get(b);
    if (i.ebene === Infinity) ((i.ebene = 2), i.durch.add(BASIS));
    Object.assign(b, { ebene: i.ebene, durch: i.ebene === 1 ? [] : sortiert(i.durch), braucht: sortiert(b.braucht) });
  }
  return liste;
}

/** Wurzeln der Alpine-Pakete einer Variante: alle Einträge in bestandteile-wozu.json außer Node.js selbst. */
export function alpineWurzeln(wozuPakete, variante) {
  return Object.entries(wozuPakete)
    .filter(([name, w]) => name !== 'node' && w.varianten.includes(variante))
    .map(([name]) => name);
}

/**
 * Werkzeuge für Entwicklung und Test (#1412, nicht im Image): devDependencies des Wurzelpakets und der Arbeitsbereiche
 * sowie das eigene Lockfile der Rauchtests. Einsatz je Wurzel aus bestandteile-wozu.json; was auch im Betrieb steckt
 * (gleicher Name, gleiche Version), zählt dort.
 */
export function werkzeuge({ lock, rauchLock, npmWozu, betrieb }) {
  const quellen = [
    [lock, ['', 'server', 'web']],
    [rauchLock, ['']],
  ];
  const alle = new Map();
  for (const [l, orte] of quellen) {
    if (!l) continue;
    const wurzeln = orte.flatMap((von) => Object.keys(l.packages?.[von]?.devDependencies ?? {}).map((name) => ({ von, name })));
    for (const [k, v] of lockBaum(l, wurzeln)) {
      const da = alle.get(k);
      if (da) {
        da.ebene = Math.min(da.ebene, v.ebene);
        for (const d of v.durch) da.durch.add(d);
        for (const d of v.braucht) da.braucht.add(d);
      } else alle.set(k, { ...v, durch: new Set(v.durch), braucht: new Set(v.braucht) });
    }
  }
  const einsatzVon = (name) => npmWozu[name]?.einsatz ?? 'Entwicklung';
  return [...alle]
    .filter(([k]) => !betrieb.has(k))
    .map(([, v]) => ({
      art: 'npm (Werkzeug)',
      name: v.name,
      version: v.version,
      lizenz: v.lizenz,
      varianten: [],
      architekturen: [],
      herkunft: '',
      quelle: npmQuelle(v.name, v.version),
      ebene: v.ebene,
      durch: v.ebene === 1 ? [] : sortiert(v.durch),
      braucht: sortiert(v.braucht),
      einsatz: sortiert(v.ebene === 1 ? [einsatzVon(v.name)] : [...v.durch].map(einsatzVon)),
    }));
}

// ---------------------------------------------------------------------------------------------------------------
// Ergänzungen

/** Paket im Lockfile so finden, wie Node es auflöst: erst im eigenen node_modules, dann weiter außen. */
function aufloesen(pakete, von, name) {
  let ort = von;
  for (;;) {
    const kandidat = `${ort ? `${ort}/` : ''}node_modules/${name}`;
    if (pakete[kandidat]) return kandidat;
    if (!ort) return null;
    const i = ort.lastIndexOf('/node_modules/');
    ort = i >= 0 ? ort.slice(0, i) : '';
  }
}

/** Bibliotheken der Weboberfläche (Abhängigkeiten von web/package.json mit allem, was sie brauchen). */
export function webBibliotheken(lock, webPaket) {
  const baum = lockBaum(
    lock,
    Object.keys(webPaket.dependencies ?? {}).map((name) => ({ von: 'web', name })),
  );
  return [...baum.values()].map((k) => ({
    name: k.name,
    version: k.version,
    lizenz: k.lizenz,
    art: 'npm (Oberfläche)',
    herkunft: '',
    quelle: npmQuelle(k.name, k.version),
    varianten: VARIANTEN,
    architekturen: ARCHITEKTUREN,
    einsatz: ['Betrieb'],
    ebene: k.ebene,
    durch: sortiert(k.durch),
    braucht: sortiert(k.braucht),
  }));
}

/** Version einer TrueType-Schrift aus der Tabelle „head“ (fontRevision, 16.16-Festkomma), z. B. „2.013“. */
export function schriftVersion(puffer) {
  const tabellen = puffer.readUInt16BE(4);
  for (let i = 0; i < tabellen; i++) {
    const s = 12 + i * 16;
    if (puffer.toString('latin1', s, s + 4) === 'head') {
      const wert = puffer.readInt32BE(puffer.readUInt32BE(s + 8) + 4) / 65536;
      return wert.toFixed(3);
    }
  }
  return '';
}

/** Version eines Pakets in requirements.txt („mkdocs-material==9.8.1 \“). */
export function pipVersion(text, name) {
  return new RegExp(`^${name}==([^\\s\\\\]+)`, 'm').exec(text)?.[1] ?? '';
}

/** Was kein Scanner im Image als Paket sieht. */
export function ergaenzungen({ commit, version, node, schriften, material }) {
  const alle = { varianten: VARIANTEN, architekturen: ARCHITEKTUREN, herkunft: '', einsatz: ['Betrieb'], ebene: 1, durch: [], braucht: [] };
  const liste = [
    {
      ...alle,
      art: 'Ablago selbst',
      name: 'Ablago',
      version,
      lizenz: 'Apache-2.0',
      quelle: `https://github.com/${REPO}/tree/${commit}`,
      ebene: 0,
      zweck: 'Ablago selbst: Server, Weboberfläche und gemeinsamer Code.',
    },
    {
      ...alle,
      art: 'Laufzeit',
      name: 'node',
      version: node || 'unbekannt',
      lizenz: 'MIT',
      quelle: node ? `https://nodejs.org/dist/v${node}/node-v${node}.tar.gz` : 'https://nodejs.org/dist/',
    },
    {
      ...alle,
      art: 'Handbuch',
      name: 'Offline-Handbuch (Texte und Bilder)',
      version,
      lizenz: 'Apache-2.0',
      quelle: `https://github.com/${REPO}/tree/${commit}/docs/handbuch`,
      zweck: 'Texte und Bilder des Offline-Handbuchs im Image.',
    },
    {
      ...alle,
      art: 'Handbuch',
      name: 'Material for MkDocs (Oberfläche des Handbuchs)',
      version: material,
      lizenz: 'MIT',
      quelle: `https://github.com/squidfunk/mkdocs-material/tree/${material}`,
      zweck: 'Gestaltung, Navigation und Suche des Offline-Handbuchs.',
    },
    {
      ...alle,
      art: 'Oberfläche',
      name: 'Lucide (Symbole, in web/src übernommen)',
      version: '',
      lizenz: 'ISC',
      quelle: 'https://lucide.dev',
      zweck: 'Symbole der Weboberfläche, als Quelltext übernommen.',
    },
  ];
  for (const s of schriften) {
    liste.push({
      ...alle,
      art: 'Schrift',
      name: s.name,
      version: s.version,
      lizenz: 'OFL-1.1',
      quelle: 'https://github.com/notofonts/latin-greek-cyrillic',
      zweck: 'Schrift für Ablagos eigene PDFs, eingebettet als Teilmenge.',
    });
  }
  return liste;
}

// ---------------------------------------------------------------------------------------------------------------
// Zusammenführen und vergleichen

const schluessel = (b) => `${b.art}\u0000${b.name}\u0000${b.version}\u0000${b.lizenz}`;
const sortiert = (a) => [...new Set(a)].sort();

const LISTEN = ['varianten', 'architekturen', 'einsatz', 'durch', 'braucht'];
const kleinste = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));

/**
 * Gleiche Bestandteile aus allen Varianten und Architekturen zu einer Zeile: Listen vereinigt, Ebene die kleinste
 * (#1412), Zweck der erste vorhandene. Ohne Angabe gilt Einsatz „Betrieb“.
 */
export function zusammenfuehren(listen) {
  const alle = new Map();
  for (const b of listen.flat()) {
    const k = schluessel(b);
    const da = alle.get(k);
    const neu = { ...b, einsatz: b.einsatz ?? ['Betrieb'] };
    if (da) {
      for (const f of LISTEN) da[f] = sortiert([...(da[f] ?? []), ...(neu[f] ?? [])]);
      da.ebene = kleinste(da.ebene, neu.ebene);
      da.zweck ||= neu.zweck;
    } else {
      const z = { ...neu, ebene: neu.ebene ?? null };
      for (const f of LISTEN) z[f] = sortiert(neu[f] ?? []);
      alle.set(k, z);
    }
  }
  // Ebene 1 hat keine Herkunft – auch wenn dasselbe Paket in einer anderen Variante mitgebracht wird.
  for (const b of alle.values()) if (b.ebene === 1) b.durch = [];
  return [...alle.values()].sort(
    (a, b) => a.art.localeCompare(b.art) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/**
 * Nur npm-Pakete, die wirklich installiert sind (#1393): Trivy liest jede package.json im Image, auch die von
 * Testdaten und Messprogrammen innerhalb eines Pakets (z. B. `pino/test/fixtures/transport`,
 * `secure-json-parse/benchmarks`). Das sind keine eigenen Pakete; sie gehören zum umgebenden Paket und dessen
 * Lizenz, und der Link auf npmjs.com zeigte auf ein fremdes Paket gleichen Namens. Maßgeblich ist das Lockfile, aus
 * dem `npm ci` das Image füllt.
 */
export function nurInstalliert(liste, lock) {
  const da = new Set();
  for (const [ort, e] of Object.entries(lock.packages ?? {})) {
    const i = ort.lastIndexOf('node_modules/');
    if (i >= 0) da.add(`${e.name ?? ort.slice(i + 'node_modules/'.length)}@${e.version}`);
  }
  return liste.filter((b) => b.art !== 'npm (Server)' || da.has(`${b.name}@${b.version}`));
}

/** Ablagos eigene Teile: ihre Version steigt mit jedem Release, für die Lizenzprüfung ändert sich dadurch nichts. */
const EIGEN = (b) => b.art === 'Ablago selbst' || b.name === 'Offline-Handbuch (Texte und Bilder)';

/** Steckt im Image (#1412); ältere Listen ohne Spalte „Einsatz“ kannten nur den Betrieb. */
export const imBetrieb = (b) => !b.einsatz?.length || b.einsatz.includes('Betrieb');

/** Zweck für die Pakete der Ebene 1 aus bestandteile-wozu.json, sofern noch keiner da ist. */
export function zweckEintragen(bestandteile, wozu) {
  for (const b of bestandteile) {
    if (b.ebene !== 1 || b.zweck) continue;
    const npm = b.art.startsWith('npm') ? wozu.npm?.[b.name] : undefined;
    b.zweck = npm?.wozu ?? (b.art.startsWith('npm') ? '' : (wozu.pakete?.[b.name]?.wozu ?? ''));
  }
  return bestandteile;
}

/** Neu, entfernt, neue Version, geänderte Lizenz – je Art und Name (eine Zeile je Name und Version). */
export function vergleiche(alt, neu) {
  const gruppe = (liste) => {
    const m = new Map();
    for (const b of liste) {
      if (EIGEN(b) || !imBetrieb(b)) continue;
      const k = `${b.art}\u0000${b.name}`;
      const e = m.get(k) ?? { art: b.art, name: b.name, versionen: new Set(), lizenzen: new Set() };
      e.versionen.add(b.version);
      e.lizenzen.add(b.lizenz);
      m.set(k, e);
    }
    return m;
  };
  const a = gruppe(alt);
  const n = gruppe(neu);
  const text = (s) => [...s].sort().join(', ');
  const ergebnis = { lizenz: [], neu: [], entfernt: [], version: [] };
  for (const [k, e] of n) {
    const v = a.get(k);
    if (!v) ergebnis.neu.push({ name: e.name, art: e.art, version: text(e.versionen), lizenz: text(e.lizenzen) });
    else {
      if (text(v.lizenzen) !== text(e.lizenzen))
        ergebnis.lizenz.push({ name: e.name, art: e.art, vorher: text(v.lizenzen), jetzt: text(e.lizenzen) });
      if (text(v.versionen) !== text(e.versionen))
        ergebnis.version.push({ name: e.name, art: e.art, vorher: text(v.versionen), jetzt: text(e.versionen) });
    }
  }
  for (const [k, e] of a) if (!n.has(k)) ergebnis.entfernt.push({ name: e.name, art: e.art, version: text(e.versionen) });
  return ergebnis;
}

// ---------------------------------------------------------------------------------------------------------------
// CSV

/** Spalten bis #1393; ältere Anhänge haben nur diese (Vergleich mit der Vorversion). */
const SPALTEN_1393 = ['Art', 'Name', 'Version', 'Lizenz', 'Varianten', 'Architekturen', 'Herkunftspaket', 'Quelle'];
export const SPALTEN = [...SPALTEN_1393, 'Ebene', 'Eingebracht durch', 'Einsatz', 'Zweck'];
const FELDER = [
  'art',
  'name',
  'version',
  'lizenz',
  'varianten',
  'architekturen',
  'herkunft',
  'quelle',
  'ebene',
  'durch',
  'einsatz',
  'zweck',
];
/** Trennzeichen je Listenfeld: Namen der Herkunft enthalten Leerzeichen und Kommas. */
const TRENNER = { varianten: ' ', architekturen: ' ', durch: '; ', einsatz: ', ' };

const feld = (w) => (/[",\n]/.test(w) ? `"${w.replace(/"/g, '""')}"` : w);

export function csv(bestandteile) {
  const zeilen = bestandteile.map((b) =>
    FELDER.map((f) => feld(Array.isArray(b[f]) ? b[f].join(TRENNER[f] ?? ' ') : String(b[f] ?? ''))).join(','),
  );
  return `${[SPALTEN.join(','), ...zeilen].join('\n')}\n`;
}

/** Zeilen einer CSV (RFC 4180, Anführungszeichen verdoppelt). */
function zerlegen(text) {
  const zeilen = [];
  let zeile = [];
  let w = '';
  let inZitat = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inZitat) {
      if (c === '"' && text[i + 1] === '"') ((w += '"'), i++);
      else if (c === '"') inZitat = false;
      else w += c;
    } else if (c === '"') inZitat = true;
    else if (c === ',') (zeile.push(w), (w = ''));
    else if (c === '\n') (zeile.push(w), zeilen.push(zeile), (zeile = []), (w = ''));
    else if (c !== '\r') w += c;
  }
  if (w || zeile.length) (zeile.push(w), zeilen.push(zeile));
  return zeilen;
}

/** Liest die eigene CSV, auch die ältere Form aus #1393 (ohne Ebene, Herkunft, Einsatz, Zweck). */
export function ausCsv(text) {
  const [kopf, ...zeilen] = zerlegen(text);
  const spalten = [SPALTEN, SPALTEN_1393].find((s) => kopf?.join(',') === s.join(','));
  if (!spalten) return null;
  return zeilen
    .filter((z) => z.length === spalten.length)
    .map((z) => {
      const b = Object.fromEntries(FELDER.slice(0, spalten.length).map((f, i) => [f, z[i]]));
      for (const [f, t] of Object.entries(TRENNER)) b[f] = (b[f] ?? '').split(t).filter(Boolean);
      if (spalten === SPALTEN) b.ebene = b.ebene === '' ? null : Number(b.ebene);
      else b.einsatz = ['Betrieb'];
      return b;
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Ausgabe: SPDX und CycloneDX

const kennung = (b) => createHash('sha256').update(schluessel(b)).digest('hex').slice(0, 16);

function purlFuer(b) {
  // npm-Namen tragen höchstens vorn ein „@“ (Scope); das wird im Purl zu %40, der Schrägstrich bleibt.
  if (b.art === 'npm (Server)' || b.art === 'npm (Oberfläche)') {
    const name = b.name.startsWith('@') ? `%40${b.name.slice(1)}` : b.name;
    return `pkg:npm/${name}@${b.version}`;
  }
  if (b.art === 'Alpine-Paket' || b.art === 'Schrift (Alpine)') return `pkg:apk/alpine/${b.name}@${b.version}`;
  return '';
}

/** Lizenz als SPDX-Ausdruck: von Trivy der ursprüngliche Ausdruck (mit LicenseRef-…), sonst der Text selbst. */
function spdxLizenz(b, refs) {
  for (const [ref, name] of Object.entries(b.refs ?? {})) refs.set(ref, name);
  return b.spdx || b.lizenz || 'NOASSERTION';
}

/** Gruppe, in der eine Abhängigkeit „name@version“ aufgelöst wird: npm nur in der eigenen Art, Alpine in Alpine. */
const gruppeVon = (art) => (art === 'Schrift (Alpine)' ? 'Alpine-Paket' : art);

/**
 * Kanten des Baums (#1412) als Paare von Bestandteilen: „braucht“ innerhalb der Gruppe, dazu Ablago → jedes Paket der
 * Ebene 1 im Betrieb. Werkzeuge (nicht im Image) hängen nicht an Ablago, sondern stehen als eigene Wurzeln da.
 */
export function kanten(bestandteile) {
  const nachId = new Map(bestandteile.map((b) => [`${gruppeVon(b.art)}\u0000${b.name}@${b.version}`, b]));
  const paare = [];
  for (const b of bestandteile)
    for (const id of b.braucht ?? []) {
      const ziel = nachId.get(`${gruppeVon(b.art)}\u0000${id}`);
      if (ziel && ziel !== b) paare.push([b, ziel]);
    }
  const ablago = bestandteile.find((b) => b.art === 'Ablago selbst' && b.name === 'Ablago');
  if (ablago) for (const b of bestandteile) if (b.ebene === 1 && imBetrieb(b)) paare.push([ablago, b]);
  return paare;
}

function kommentar(b) {
  const teile = [`Art: ${b.art}`, `Einsatz: ${(b.einsatz ?? []).join(', ')}`];
  if (imBetrieb(b)) teile.push(`Varianten: ${b.varianten.join(' ')}`, `Architekturen: ${b.architekturen.join(' ')}`);
  else teile.push('nicht im Image');
  if (b.ebene != null) teile.push(`Ebene: ${b.ebene}`);
  if (b.durch?.length) teile.push(`Eingebracht durch: ${b.durch.join(', ')}`);
  if (b.zweck) teile.push(`Zweck: ${b.zweck}`);
  return teile.join('; ');
}

export function spdxDokument({ bestandteile, stand, tag, commit, datum, trivy }) {
  const refs = new Map();
  const pakete = bestandteile.map((b) => {
    const p = {
      name: b.name,
      SPDXID: `SPDXRef-Package-${kennung(b)}`,
      versionInfo: b.version || 'NOASSERTION',
      downloadLocation: b.quelle || 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: spdxLizenz(b, refs),
      comment: kommentar(b),
    };
    const pu = purlFuer(b);
    if (pu) p.externalRefs = [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: pu }];
    return p;
  });
  const images = stand.flatMap((s) =>
    Object.entries(s.architekturen).map(([arch, digest]) => ({
      name: `${s.image}@${digest}`,
      SPDXID: `SPDXRef-Image-${s.variante}-${arch}`,
      versionInfo: tag,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      primaryPackagePurpose: 'CONTAINER',
      checksums: [{ algorithm: 'SHA256', checksumValue: digest.replace(/^sha256:/, '') }],
    })),
  );
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `Ablago ${tag} – Bestandteile`,
    documentNamespace: `https://github.com/${REPO}/releases/tag/${tag}/bestandteile-${commit}`,
    creationInfo: { created: datum, creators: ['Tool: ablago-bestandteile (#1393)', `Tool: trivy-${trivy || 'unbekannt'}`] },
    packages: [...images, ...pakete],
    hasExtractedLicensingInfos: [...refs].map(([licenseId, name]) => ({
      licenseId,
      name,
      extractedText: `This component is licensed under "${name}"`,
    })),
    relationships: [
      ...images.map((i) => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: i.SPDXID })),
      ...bestandteile
        .filter(imBetrieb)
        .map((b) => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: spdxId(b) })),
      ...kanten(bestandteile).map(([von, zu]) => ({
        spdxElementId: spdxId(von),
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: spdxId(zu),
      })),
      // Werkzeuge der Ebene 1: Entwicklung bzw. Test von Ablago, nicht im Image (#1412).
      ...(ablagoIn(bestandteile)
        ? bestandteile
            .filter((b) => !imBetrieb(b) && b.ebene === 1)
            .map((b) => ({
              spdxElementId: spdxId(b),
              relationshipType: b.einsatz.includes('Entwicklung') ? 'DEV_DEPENDENCY_OF' : 'TEST_DEPENDENCY_OF',
              relatedSpdxElement: spdxId(ablagoIn(bestandteile)),
            }))
        : []),
    ],
  };
}

const spdxId = (b) => `SPDXRef-Package-${kennung(b)}`;
const ablagoIn = (bestandteile) => bestandteile.find((b) => b.art === 'Ablago selbst' && b.name === 'Ablago');

function uuidAus(text) {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function cyclonedx({ bestandteile, tag, commit, datum, trivy }) {
  const abhaengig = new Map(bestandteile.map((b) => [kennung(b), new Set()]));
  for (const [von, zu] of kanten(bestandteile)) abhaengig.get(kennung(von)).add(kennung(zu));
  const ablago = ablagoIn(bestandteile);
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${uuidAus(`${tag}/${commit}`)}`,
    version: 1,
    metadata: {
      timestamp: datum,
      tools: {
        components: [
          { type: 'application', name: 'ablago-bestandteile' },
          { type: 'application', name: 'trivy', version: trivy || 'unbekannt' },
        ],
      },
      component: { type: 'container', name: 'Ablago', version: tag, 'bom-ref': 'ablago-image' },
    },
    components: bestandteile.map((b) => {
      const c = {
        type: b.art === 'Schrift' || b.art === 'Schrift (Alpine)' ? 'file' : 'library',
        'bom-ref': kennung(b),
        name: b.name,
        version: b.version,
        // „excluded“: gehört zum Projekt, wird aber nicht ausgeliefert (Werkzeuge für Entwicklung und Test, #1412).
        scope: imBetrieb(b) ? 'required' : 'excluded',
      };
      const pu = purlFuer(b);
      if (pu) c.purl = pu;
      if (b.spdx || b.lizenz) c.licenses = [{ expression: b.spdx || b.lizenz }];
      if (b.quelle) c.externalReferences = [{ type: 'distribution', url: b.quelle }];
      c.properties = [
        { name: 'ablago:art', value: b.art },
        { name: 'ablago:varianten', value: b.varianten.join(' ') },
        { name: 'ablago:architekturen', value: b.architekturen.join(' ') },
        { name: 'ablago:einsatz', value: (b.einsatz ?? []).join(', ') },
      ];
      if (b.herkunft) c.properties.push({ name: 'ablago:herkunftspaket', value: b.herkunft });
      if (b.ebene != null) c.properties.push({ name: 'ablago:ebene', value: String(b.ebene) });
      if (b.durch?.length) c.properties.push({ name: 'ablago:eingebracht-durch', value: b.durch.join('; ') });
      if (b.zweck) c.properties.push({ name: 'ablago:zweck', value: b.zweck });
      return c;
    }),
    dependencies: [
      { ref: 'ablago-image', dependsOn: ablago ? [kennung(ablago)] : [] },
      ...[...abhaengig].map(([ref, zu]) => ({ ref, dependsOn: [...zu].sort() })),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ausgabe: Abschnitt im Release-Text

const wo = (b) => (b.varianten.length === 1 ? ` (nur ${b.varianten[0]})` : '');

function abschnittStand({ tag, commit, datum, stand }) {
  const zeilen = [
    `- **Version:** ${tag} · **Datum:** ${datum.slice(0, 10)} · **Commit:** [\`${commit.slice(0, 8)}\`](https://github.com/${REPO}/commit/${commit})`,
    '',
    '| Image | Architektur | Digest |',
    '|---|---|---|',
  ];
  for (const s of stand) {
    zeilen.push(`| \`${s.image}\` | alle (Index) | \`${s.digest}\` |`);
    for (const [arch, d] of Object.entries(s.architekturen).sort(([a], [b]) => a.localeCompare(b)))
      zeilen.push(`| \`${s.image}\` | ${arch} | \`${d}\` |`);
  }
  return zeilen;
}

function abschnittAenderungen(aenderungen, vorherTag) {
  if (!aenderungen)
    return [`Kein Vergleich: ${vorherTag ? `${vorherTag} hat keine Liste der Bestandteile als Anhang.` : 'kein voriges Release.'}`];
  const { lizenz, neu, entfernt, version } = aenderungen;
  if (!lizenz.length && !neu.length && !entfernt.length && !version.length) return ['Keine Änderungen an Bestandteilen.'];
  const z = [];
  if (lizenz.length)
    z.push(`- **Geänderte Lizenz:** ${lizenz.map((e) => `${e.name} (${e.vorher || 'ohne'} → **${e.jetzt || 'ohne'}**)`).join('; ')}`);
  if (neu.length) z.push(`- **Neu:** ${neu.map((e) => `${e.name} ${e.version} (${e.lizenz || 'ohne erkannte Lizenz'})`).join('; ')}`);
  if (entfernt.length) z.push(`- **Entfernt:** ${entfernt.map((e) => `${e.name} ${e.version}`).join('; ')}`);
  if (version.length) z.push(`- **Neue Version:** ${version.map((e) => `${e.name} ${e.vorher} → ${e.jetzt}`).join('; ')}`);
  return z;
}

export function lizenzZaehlung(bestandteile) {
  const z = new Map();
  for (const b of bestandteile)
    for (const k of b.lizenz ? lizenzKennungen(b.lizenz) : ['ohne erkannte Lizenz']) z.set(k, (z.get(k) ?? 0) + 1);
  return [...z].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** „über poppler-utils“ für mitgebrachte Bestandteile (#1412). */
const ueber = (b) => (b.ebene > 1 && b.durch?.length ? ` – über ${b.durch.join(', ')}` : '');

/** Name und Version, direkt eingebundene fett. */
const benannt = (b) => (b.ebene === 1 ? `**${b.name}** ${b.version}` : `${b.name} ${b.version}`).trim();

function abschnittLizenzen(bestandteile) {
  const z = [];
  for (const [k, n] of lizenzZaehlung(bestandteile)) {
    const mit = bestandteile
      .filter((b) => (b.lizenz ? lizenzKennungen(b.lizenz).includes(k) : k === 'ohne erkannte Lizenz'))
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version));
    z.push(`<details><summary>${k} – ${n}</summary>`, '', mit.map(benannt).join(' · '), '', '</details>');
  }
  z.push('', '_Ein Bestandteil kann mehrere Lizenzen tragen und zählt dann bei jeder mit. Fett: direkt eingebunden._', '');
  const pflichten = bestandteile.filter((b) => einteilen(b.lizenz) === 'pflichten');
  z.push(`**Mit besonderen Pflichten (Copyleft, ${pflichten.length}):** Name, Version, Lizenz, Herkunft und Quelltext.`, '');
  for (const b of pflichten) z.push(`- ${b.name} ${b.version}${wo(b)} – ${b.lizenz}${ueber(b)} – [Quelltext](${b.quelle})`);
  const ohne = bestandteile.filter((b) => einteilen(b.lizenz) === 'ohne');
  z.push(
    '',
    `**Ohne erkannte Lizenz (${ohne.length}):** ${ohne.length ? ohne.map((b) => `${b.name} ${b.version} ([Quelle](${b.quelle}))`).join('; ') : 'keine'}`,
  );
  return z;
}

/** Wie viele Bestandteile ein Paket der Ebene 1 mitbringt (#1412). */
const mitgebracht = (bestandteile, name, arten) => bestandteile.filter((b) => arten.includes(b.art) && b.durch?.includes(name)).length;

const ALPINE = ['Alpine-Paket', 'Schrift (Alpine)'];

function abschnittWozu(bestandteile, wozu) {
  const z = [
    '<details><summary>Systemprogramme im Image und wozu sie da sind</summary>',
    '',
    '| Programm | Version | Lizenz | Wozu | Bringt mit | Issue | Variante |',
    '|---|---|---|---|---:|---|---|',
  ];
  for (const [name, w] of Object.entries(wozu.pakete ?? wozu)) {
    const treffer = bestandteile.filter((b) => b.name === name);
    const version = sortiert(treffer.map((b) => b.version)).join(', ') || '–';
    const lizenz = sortiert(treffer.map((b) => b.lizenz || 'ohne erkannte Lizenz')).join(', ') || '–';
    const issues = w.issues.map((i) => `#${i}`).join(', ');
    const mit = name === 'node' ? mitgebracht(bestandteile, BASIS, ALPINE) : mitgebracht(bestandteile, name, ALPINE);
    z.push(`| ${name} | ${version} | ${lizenz} | ${w.wozu} | ${mit} | ${issues} | ${w.varianten.join(', ')} |`);
  }
  z.push('', '_Bringt mit: Alpine-Pakete, die nur über dieses Programm ins Image kommen oder auch darüber; bei node das Basis-Image._');
  z.push('', '</details>', '');
  z.push(
    '<details><summary>Direkt eingebundene Bibliotheken und wozu sie da sind</summary>',
    '',
    '| Bibliothek | Version | Lizenz | Teil | Wozu | Bringt mit |',
    '|---|---|---|---|---|---:|',
  );
  for (const b of bestandteile.filter((x) => x.ebene === 1 && (x.art === 'npm (Server)' || x.art === 'npm (Oberfläche)'))) {
    const teil = b.art === 'npm (Server)' ? 'Server' : 'Oberfläche';
    z.push(
      `| ${b.name} | ${b.version} | ${b.lizenz || 'ohne erkannte Lizenz'} | ${teil} | ${b.zweck || '–'} | ${mitgebracht(bestandteile, b.name, [b.art])} |`,
    );
  }
  z.push('', '</details>');
  return z;
}

function abschnittNachpruefen(stand) {
  const s = stand[0];
  const ref = s ? `${s.image}@${s.digest}` : 'ghcr.io/motom001/dms@sha256:…';
  return [
    '<details><summary>So prüfst du die Liste nach</summary>',
    '',
    '1. **Herkunft, ohne das Image zu laden:** Stückliste und Herkunftsnachweis hängen signiert am Image.',
    '   ```sh',
    `   gh attestation verify oci://${ref} -R ${REPO}`,
    '   ```',
    '   Die Anhänge (CSV, SPDX, CycloneDX) tragen einen eigenen Herkunftsnachweis, z. B.',
    '   ```sh',
    `   gh attestation verify ablago-bestandteile.csv -R ${REPO}`,
    '   ```',
    '2. **Unabhängig:** das Image über den Digest in einer abgeschotteten Testumgebung laden, selbst eine Stückliste erzeugen und mit dem Anhang vergleichen, z. B.',
    '   ```sh',
    `   trivy image --platform linux/arm64 --format spdx-json ${ref}`,
    '   ```',
    '',
    `Einzelheiten im [Administratorhandbuch](${HANDBUCH}).`,
    '',
    '</details>',
  ];
}

export function markdown({ tag, commit, datum, stand, bestandteile: alle, aenderungen, vorherTag, wozu, trivy }) {
  const bestandteile = alle.filter(imBetrieb);
  const werkzeugZahl = alle.length - bestandteile.length;
  return [
    '## Bestandteile und Lizenzen',
    '',
    `Automatisch aus den fertigen Images erzeugt (Trivy ${trivy || 'unbekannt'}, ergänzt um Node.js, die Bibliotheken der Weboberfläche, Schriften und das Offline-Handbuch). ` +
      'Diese Übersicht ist eine **lesbare Ansicht**; den Nachweis liefert das **signierte Attest** am Image (Stückliste und Herkunftsnachweis), abrufbar über den Digest. ' +
      'Sie ist eine technische Auflistung und **keine rechtliche Bewertung**.',
    '',
    `Vollständige Liste mit Quelle je Bestandteil: Anhänge \`${DATEIEN.csv}\`, \`${DATEIEN.spdx}\` (SPDX) und \`${DATEIEN.cdx}\` (CycloneDX). Wie sie entsteht: [Administratorhandbuch](${HANDBUCH}).`,
    '',
    '### Stand',
    '',
    ...abschnittStand({ tag, commit, datum, stand }),
    '',
    `### Geändert gegenüber ${vorherTag || 'der Vorversion'}`,
    '',
    ...abschnittAenderungen(aenderungen, vorherTag),
    '',
    `### Lizenzen (${bestandteile.length} Bestandteile)`,
    '',
    ...abschnittLizenzen(bestandteile),
    '',
    `Nicht im Image und hier nicht gezählt: ${werkzeugZahl} Pakete für Entwicklung und Test (Anhänge, Einsatz „Entwicklung“ bzw. „Test“). Aufbau aus Bestandteilen: [Entwicklerhandbuch](${AUFBAU_URL}).`,
    '',
    ...abschnittWozu(bestandteile, wozu),
    '',
    ...abschnittNachpruefen(stand),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Handbuchseite „Aufbau aus Bestandteilen“ (#1412)

/** Ebene 1 eines Baums mit Lizenz und den Namen dessen, was jedes Paket mitbringt. */
function wurzelnMit(baum, namen) {
  const knoten = [...baum.values()];
  return sortiert(namen).map((name) => ({
    name,
    lizenz: knoten.find((k) => k.name === name && k.ebene === 1)?.lizenz ?? '',
    mit: sortiert(knoten.filter((k) => k.durch.has(name)).map((k) => k.name)),
  }));
}

/** Was die Seite zeigt, nur aus dem Repository (Lockfiles, bestandteile-wozu.json) – ohne fertiges Image. */
export function aufbauDaten({ lock, rauchLock, wozu }) {
  const server = lockBaum(lock, serverWurzeln(lock));
  const webNamen = Object.keys(lock.packages?.web?.dependencies ?? {});
  const web = lockBaum(
    lock,
    webNamen.map((name) => ({ von: 'web', name })),
  );
  const betrieb = new Set([...server.keys(), ...web.keys()]);
  const dev = (l, orte) => {
    const namen = [...new Set(orte.flatMap((von) => Object.keys(l?.packages?.[von]?.devDependencies ?? {})))];
    const wurzeln = orte.flatMap((von) => Object.keys(l?.packages?.[von]?.devDependencies ?? {}).map((name) => ({ von, name })));
    return { baum: l ? lockBaum(l, wurzeln) : new Map(), namen };
  };
  const haupt = dev(lock, ['', 'server', 'web']);
  const rauch = dev(rauchLock, ['']);
  const nurWerkzeug = new Set([...haupt.baum.keys(), ...rauch.baum.keys()].filter((k) => !betrieb.has(k)));
  const mitZweck = (liste) => liste.map((w) => ({ ...w, ...(wozu.npm?.[w.name] ?? {}) }));
  return {
    server: mitZweck(
      wurzelnMit(
        server,
        serverWurzeln(lock).map((w) => w.name),
      ),
    ),
    web: mitZweck(wurzelnMit(web, webNamen)),
    werkzeuge: mitZweck([...wurzelnMit(haupt.baum, haupt.namen), ...wurzelnMit(rauch.baum, rauch.namen)]).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    system: Object.entries(wozu.pakete ?? {}).map(([name, w]) => ({ name, ...w })),
    werkzeugZahl: nurWerkzeug.size,
  };
}

const SEITE = {
  de: {
    titel: 'Aufbau aus Bestandteilen',
    erzeugt:
      'Diese Seite entsteht aus den Lockfiles und `.github/werkzeuge/bestandteile-wozu.json` mit `node .github/werkzeuge/bestandteile.mjs --handbuch` – bitte dort ändern, nicht hier. Der Job `stil` schlägt fehl, wenn sich die direkt eingebundenen Pakete, ihr Zweck oder ihr Einsatz geändert haben, und weist nur darauf hin, wenn sich bloß Mitgebrachtes geändert hat.',
    einleitung:
      'Ablago bindet nur wenige Pakete **direkt** ein (**Ebene 1**). Was diese brauchen, kommt **mit** (**Ebene 2** und tiefer). Jedes Paket der Ebene 1 hat einen Zweck; ohne ihn schlägt die CI fehl. Welche Version mit welcher Lizenz in einem Release steckt, steht in den Anhängen am Release (Spalten *Ebene*, *Eingebracht durch*, *Einsatz*, *Zweck*), siehe [Bestandteile und Lizenzen](https://help.ablago.app/admin/aktuell/bestandteile/) im Administratorhandbuch. Warum wir neue Abhängigkeiten nur mit Begründung aufnehmen: [Abhängigkeiten](abhaengigkeiten.md).',
    betrieb: ['Im Betrieb (im Image)', 'im-betrieb-im-image'],
    server: ['Server', 'server'],
    web: ['Weboberfläche', 'weboberflaeche'],
    webHinweis:
      'Die Bibliotheken der Oberfläche bündelt Vite beim Bauen in eine Datei; im Image stehen sie nicht als eigene Pakete. Die Liste kommt deshalb aus `package-lock.json` und kann etwas mehr enthalten, als im Bündel landet.',
    system: ['Systemprogramme (Alpine)', 'systemprogramme-alpine'],
    systemHinweis:
      'Was die Systemprogramme ihrerseits mitbringen, zeigt erst das fertige Image: in der CSV am Release die Spalten *Ebene* und *Eingebracht durch*; Pakete, die keins dieser Programme braucht, kommen mit dem Basis-Image (`node` für Alpine).',
    weitere: ['Weitere Bestandteile', 'weitere-bestandteile'],
    weitereText: [
      '- **Node.js** als Laufzeit, aus dem offiziellen Image `node` für Alpine (Basis-Image).',
      '- **Noto Sans** und **Noto Sans Mono** (OFL-1.1) für Ablagos eigene PDFs, unter `server/schriften/`.',
      '- **Lucide** (ISC): Symbole der Oberfläche, als Quelltext übernommen.',
      '- **Offline-Handbuch** mit **Material for MkDocs** (MIT).',
    ],
    werkzeuge: ['Entwicklung und Test (nicht im Image)', 'entwicklung-und-test-nicht-im-image'],
    werkzeugeHinweis:
      'Diese Pakete braucht nur, wer Ablago baut oder prüft (`devDependencies` und das eigene Lockfile der Rauchtests in `web/rauchtest/`). Sie stecken **nicht im Image** und zählen in den Lizenzen des Release-Texts nicht mit.',
    zusammen: (n) => `Zusammen ${n} Pakete, die nur für Entwicklung und Test installiert werden.`,
    spalten: ['Paket', 'Wozu', 'Lizenz', 'Bringt mit'],
    spaltenWerkzeug: ['Paket', 'Einsatz', 'Wozu', 'Lizenz', 'Bringt mit'],
    spaltenSystem: ['Programm', 'Wozu', 'Variante'],
    bringt: (name, n) => `${name} bringt ${n} ${n === 1 ? 'Paket' : 'Pakete'} mit`,
    einsatz: { Entwicklung: 'Entwicklung', Test: 'Test', Betrieb: 'Betrieb' },
    wozu: (w) => w.wozu,
  },
  en: {
    titel: 'Composition from components',
    erzeugt:
      'This page is generated from the lockfiles and `.github/werkzeuge/bestandteile-wozu.json` with `node .github/werkzeuge/bestandteile.mjs --handbuch` – please change it there, not here. The `stil` job fails if the directly included packages, their purpose or their use have changed, and only points it out if just the transitive packages have changed.',
    einleitung:
      'Ablago includes only a few packages **directly** (**level 1**). What they need comes **along** (**level 2** and deeper). Every level-1 package has a purpose; without one, CI fails. Which version with which licence is in a release is listed in the release attachments (columns *Ebene* (level), *Eingebracht durch* (brought in by), *Einsatz* (use), *Zweck* (purpose)), see [Components and licences](https://help.ablago.app/admin/aktuell/en/bestandteile/) in the administrator manual. Why we only add new dependencies with a reason: [Dependencies](abhaengigkeiten.md).',
    betrieb: ['In operation (in the image)', 'im-betrieb-im-image'],
    server: ['Server', 'server'],
    web: ['Web interface', 'weboberflaeche'],
    webHinweis:
      'Vite bundles the web interface libraries into one file at build time; they are not separate packages in the image. The list therefore comes from `package-lock.json` and may contain a little more than ends up in the bundle.',
    system: ['System programs (Alpine)', 'systemprogramme-alpine'],
    systemHinweis:
      'What the system programs bring along in turn is only visible in the finished image: in the CSV attached to the release, columns *Ebene* and *Eingebracht durch*; packages that none of these programs needs come with the base image (`node` for Alpine).',
    weitere: ['Further components', 'weitere-bestandteile'],
    weitereText: [
      '- **Node.js** as the runtime, from the official `node` image for Alpine (base image).',
      "- **Noto Sans** and **Noto Sans Mono** (OFL-1.1) for Ablago's own PDFs, in `server/schriften/`.",
      '- **Lucide** (ISC): icons of the interface, adopted as source code.',
      '- **Offline manual** with **Material for MkDocs** (MIT).',
    ],
    werkzeuge: ['Development and test (not in the image)', 'entwicklung-und-test-nicht-im-image'],
    werkzeugeHinweis:
      'These packages are only needed by whoever builds or checks Ablago (`devDependencies` and the smoke tests’ own lockfile in `web/rauchtest/`). They are **not in the image** and are not counted in the licences of the release text.',
    zusammen: (n) => `Together ${n} packages that are installed only for development and test.`,
    spalten: ['Package', 'Purpose', 'Licence', 'Brings along'],
    spaltenWerkzeug: ['Package', 'Use', 'Purpose', 'Licence', 'Brings along'],
    spaltenSystem: ['Program', 'Purpose', 'Variant'],
    bringt: (name, n) => `${name} brings along ${n} ${n === 1 ? 'package' : 'packages'}`,
    einsatz: { Entwicklung: 'Development', Test: 'Test', Betrieb: 'Operation' },
    wozu: (w) => w.en,
  },
};

const ANFANG = '<!-- mitgebracht:anfang -->';
const ENDE = '<!-- mitgebracht:ende -->';
const tabelle = (spalten, zeilen) => [
  `| ${spalten.join(' | ')} |`,
  `|${spalten.map((s, i) => (i === spalten.length - 1 && /mit|along/.test(s) ? ' ---: ' : ' --- ')).join('|')}|`,
  ...zeilen.map((z) => `| ${z.join(' | ')} |`),
];

/** Zugeklappt, was die Pakete der Ebene 1 mitbringen (zwischen Markierungen, damit die Prüfung es abtrennen kann). */
function mitgebrachtBloecke(t, liste) {
  const mit = liste.filter((w) => w.mit.length);
  if (!mit.length) return [];
  return [ANFANG, '', ...mit.flatMap((w) => [`??? note "${t.bringt(w.name, w.mit.length)}"`, `    ${w.mit.join(', ')}`, '']), ENDE];
}

export function aufbauSeite(daten, sprache) {
  const t = SEITE[sprache];
  const h = ([text, anker], ebene = 2) => `${'#'.repeat(ebene)} ${text} { #${anker} }`;
  const zeile = (w) => [`\`${w.name}\``, t.wozu(w) ?? '–', w.lizenz || '–', String(w.mit.length)];
  return [
    `# ${t.titel} { #aufbau-aus-bestandteilen }`,
    '',
    `!!! note ""`,
    `    ${t.erzeugt}`,
    '',
    t.einleitung,
    '',
    h(t.betrieb),
    '',
    h(t.server, 3),
    '',
    ...tabelle(t.spalten, daten.server.map(zeile)),
    '',
    ...mitgebrachtBloecke(t, daten.server),
    '',
    h(t.web, 3),
    '',
    t.webHinweis,
    '',
    ...tabelle(t.spalten, daten.web.map(zeile)),
    '',
    ...mitgebrachtBloecke(t, daten.web),
    '',
    h(t.system, 3),
    '',
    ...tabelle(
      t.spaltenSystem,
      daten.system.map((w) => [`\`${w.name}\``, t.wozu(w), w.varianten.map((v) => `\`${v}\``).join(', ')]),
    ),
    '',
    t.systemHinweis,
    '',
    h(t.weitere, 3),
    '',
    ...t.weitereText,
    '',
    h(t.werkzeuge),
    '',
    t.werkzeugeHinweis,
    '',
    ...tabelle(
      t.spaltenWerkzeug,
      daten.werkzeuge.map((w) => [`\`${w.name}\``, t.einsatz[w.einsatz] ?? '–', t.wozu(w) ?? '–', w.lizenz || '–', String(w.mit.length)]),
    ),
    '',
    ANFANG,
    '',
    t.zusammen(daten.werkzeugZahl),
    '',
    ENDE,
    '',
    ...mitgebrachtBloecke(t, daten.werkzeuge),
    '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Kern einer Seite: ohne das Mitgebrachte (zwischen den Markierungen) und ohne die Spalte „Bringt mit“. Ändert sich nur
 * Mitgebrachtes (Updates von Dependabot), bleibt der Kern gleich.
 */
export function aufbauKern(text) {
  return text
    .replace(new RegExp(`${ANFANG}[\\s\\S]*?${ENDE}`, 'g'), '')
    .replace(/ \d+ \|$/gm, ' |')
    .replace(/\n{2,}/g, '\n');
}

/** Seiten schreiben bzw. prüfen; Ergebnis für die Prüfung: 'gleich', 'mitgebracht' (nur Hinweis) oder 'kern'. */
export function aufbauPruefen(daten, lesen) {
  let ergebnis = 'gleich';
  for (const [sprache, pfad] of Object.entries(AUFBAU)) {
    const soll = aufbauSeite(daten, sprache);
    const ist = lesen(pfad);
    if (ist === soll) continue;
    if (ist == null || aufbauKern(ist) !== aufbauKern(soll)) return 'kern';
    ergebnis = 'mitgebracht';
  }
  return ergebnis;
}

// ---------------------------------------------------------------------------------------------------------------
// Prüfung: jedes Paket aus „apk add“ im Dockerfile hat einen Eintrag „Wozu“

export function apkPakete(dockerfile) {
  const pakete = [];
  for (const m of dockerfile.matchAll(/apk add (?:--no-cache )?([^\n&|;]+)/g)) {
    for (const n of m[1].trim().split(/\s+/)) if (n && !n.startsWith('-') && !n.startsWith('$')) pakete.push(n);
  }
  return pakete;
}

// ---------------------------------------------------------------------------------------------------------------
// Aufruf

function argumente(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  return a;
}

function standLesen(ordner, wozuPakete) {
  const stand = [];
  const listen = [];
  let trivy = '';
  for (const variante of VARIANTEN) {
    const datei = join(ordner, `stand-${variante}.json`);
    if (!existsSync(datei)) throw new Error(`${datei} fehlt`);
    const s = JSON.parse(readFileSync(datei, 'utf8'));
    stand.push(s);
    for (const arch of Object.keys(s.architekturen)) {
      const doc = JSON.parse(readFileSync(join(ordner, `${variante}-${arch}.spdx.json`), 'utf8'));
      trivy ||= /trivy-([\d.]+)/.exec(doc.creationInfo?.creators?.join(' ') ?? '')?.[1] ?? '';
      listen.push(alpineEbenen(ausSpdx(doc, { variante, arch }), alpineWurzeln(wozuPakete, variante)));
    }
  }
  return { stand, listen, trivy };
}

const jsonLesen = (pfad) => JSON.parse(readFileSync(pfad, 'utf8'));
const wozuLesen = () => jsonLesen(new URL('./bestandteile-wozu.json', import.meta.url));
const rauchLockLesen = () => (existsSync(RAUCHTEST_LOCK) ? jsonLesen(RAUCHTEST_LOCK) : null);

function handbuch(argv) {
  const daten = aufbauDaten({ lock: jsonLesen('package-lock.json'), rauchLock: rauchLockLesen(), wozu: wozuLesen() });
  if (argv.includes('--handbuch')) {
    for (const [sprache, pfad] of Object.entries(AUFBAU)) writeFileSync(pfad, aufbauSeite(daten, sprache));
    console.log(`Geschrieben: ${Object.values(AUFBAU).join(', ')}`);
    return 0;
  }
  const ergebnis = aufbauPruefen(daten, (pfad) => (existsSync(pfad) ? readFileSync(pfad, 'utf8') : null));
  const befehl = 'node .github/werkzeuge/bestandteile.mjs --handbuch';
  if (ergebnis === 'kern') {
    console.log(
      `::error title=Aufbau aus Bestandteilen::Direkt eingebundene Pakete, Zweck oder Einsatz haben sich geändert. Bitte „${befehl}“ ausführen und die Seiten mit einchecken.`,
    );
    return 1;
  }
  if (ergebnis === 'mitgebracht')
    console.log(
      `::warning title=Aufbau aus Bestandteilen::Nur mitgebrachte Pakete haben sich geändert (z. B. durch Dependabot). Bei Gelegenheit „${befehl}“ ausführen.`,
    );
  else console.log('Aufbau aus Bestandteilen: aktuell.');
  return 0;
}

function schriftenLesen() {
  const ordner = 'server/schriften';
  const familien = new Map();
  for (const f of readdirSync(ordner).filter((d) => d.endsWith('.ttf'))) {
    const name = basename(f, '.ttf')
      .replace(/-.*$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
    familien.set(name, schriftVersion(readFileSync(join(ordner, f))));
  }
  return [...familien].map(([name, version]) => ({ name, version }));
}

export function main(argv) {
  if (argv[0] === '--handbuch' || argv[0] === '--handbuch-pruefen') return handbuch(argv);
  const a = argumente(argv);
  const wozu = wozuLesen();
  const { stand, listen, trivy } = standLesen(a.stand, wozu.pakete);
  const version = a.tag.replace(/^v/, '');
  const extra = ergaenzungen({
    commit: a.commit,
    version,
    node: stand.find((s) => s.node)?.node ?? '',
    schriften: schriftenLesen(),
    material: pipVersion(readFileSync('docs/handbuch/requirements.txt', 'utf8'), 'mkdocs-material'),
  });
  const lock = jsonLesen('package-lock.json');
  const web = webBibliotheken(lock, jsonLesen('web/package.json'));
  const betrieb = zusammenfuehren([...listen.map((l) => serverBaum(nurInstalliert(l, lock), lock)), extra, web]);
  const imImage = new Set(betrieb.filter((b) => b.art.startsWith('npm')).map((b) => `${b.name}@${b.version}`));
  const dazu = werkzeuge({ lock, rauchLock: rauchLockLesen(), npmWozu: wozu.npm ?? {}, betrieb: imImage });
  const bestandteile = zweckEintragen(zusammenfuehren([betrieb, dazu]), wozu);
  const alt = a.vorher && existsSync(a.vorher) ? ausCsv(readFileSync(a.vorher, 'utf8')) : null;
  const aenderungen = alt ? vergleiche(alt, bestandteile) : null;
  const daten = { tag: a.tag, commit: a.commit, datum: a.datum, stand, bestandteile, trivy };
  mkdirSync(a.aus, { recursive: true });
  writeFileSync(join(a.aus, 'bestandteile.md'), markdown({ ...daten, aenderungen, vorherTag: a['vorher-tag'], wozu }));
  writeFileSync(join(a.aus, DATEIEN.csv), csv(bestandteile));
  writeFileSync(join(a.aus, DATEIEN.spdx), `${JSON.stringify(spdxDokument(daten), null, 1)}\n`);
  writeFileSync(join(a.aus, DATEIEN.cdx), `${JSON.stringify(cyclonedx(daten), null, 1)}\n`);
  const n = bestandteile.filter(imBetrieb).length;
  console.log(
    `${n} Bestandteile im Image, ${bestandteile.length - n} Werkzeuge, ${aenderungen ? 'mit' : 'ohne'} Vergleich zur Vorversion.`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
