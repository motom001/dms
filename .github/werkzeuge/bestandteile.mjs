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
 * Aufruf (release.yml):
 *   node .github/werkzeuge/bestandteile.mjs --stand <ordner> --tag v1.2.3 --commit <sha> --datum <ISO>
 *        --aus <ordner> [--vorher <csv> --vorher-tag v1.2.2]
 * <ordner> enthält je Variante stand-<variante>.json und <variante>-<arch>.spdx.json (Job image-zusammen).
 *
 * Tests: node --test .github/werkzeuge/bestandteile.test.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const REPO = 'motom001/dms';
export const HANDBUCH = 'https://help.ablago.app/admin/aktuell/bestandteile/';
export const DATEIEN = {
  csv: 'ablago-bestandteile.csv',
  spdx: 'ablago-bestandteile.spdx.json',
  cdx: 'ablago-bestandteile.cdx.json',
};
const VARIANTEN = ['dms', 'dms-komplett'];
const ARCHITEKTUREN = ['amd64', 'arm64'];

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

/** Bestandteile einer Stückliste (eine Variante, eine Architektur). Image und Betriebssystem selbst zählen nicht. */
export function ausSpdx(doc, { variante, arch }) {
  const extrahiert = Object.fromEntries((doc.hasExtractedLicensingInfos ?? []).map((l) => [l.licenseId, l.name]));
  const liste = [];
  for (const p of doc.packages ?? []) {
    const typ = anmerkung(p, 'PkgType');
    if (typ !== 'alpine' && typ !== 'node-pkg') continue;
    const roh = p.licenseDeclared ?? p.licenseConcluded ?? '';
    const lizenz = lizenzText(roh, extrahiert);
    const refs = Object.fromEntries((roh.match(/LicenseRef-[A-Za-z0-9.-]+/g) ?? []).map((r) => [r, extrahiert[r] ?? r]));
    const b = { name: p.name, version: p.versionInfo ?? '', lizenz, spdx: OHNE.has(roh.trim()) ? '' : roh, refs };
    Object.assign(b, { varianten: [variante], architekturen: [arch] });
    if (typ === 'alpine') {
      const herkunft = /^built package from: (\S+)/.exec(p.sourceInfo ?? '')?.[1] ?? p.name;
      Object.assign(b, { art: artAlpine(p.name), herkunft, quelle: alpineQuelle(herkunft, alpineZweig(purl(p))) });
    } else if (p.name.startsWith('@dms/')) {
      Object.assign(b, { art: 'Ablago selbst', herkunft: '', quelle: `https://github.com/${REPO}` });
    } else {
      Object.assign(b, { art: 'npm (Server)', herkunft: '', quelle: npmQuelle(p.name, b.version) });
    }
    liste.push(b);
  }
  return liste;
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
  const pakete = lock.packages ?? {};
  const offen = Object.keys(webPaket.dependencies ?? {}).map((n) => ['web', n]);
  const gesehen = new Map();
  while (offen.length) {
    const [von, name] = offen.pop();
    const ort = aufloesen(pakete, von, name);
    if (!ort || gesehen.has(ort)) continue;
    const e = pakete[ort];
    gesehen.set(ort, { name, version: e.version, lizenz: lizenzText(e.license) });
    for (const d of Object.keys({ ...e.dependencies, ...e.optionalDependencies })) offen.push([ort, d]);
  }
  return [...gesehen.values()].map((b) => ({
    ...b,
    art: 'npm (Oberfläche)',
    herkunft: '',
    quelle: npmQuelle(b.name, b.version),
    varianten: VARIANTEN,
    architekturen: ARCHITEKTUREN,
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
  const alle = { varianten: VARIANTEN, architekturen: ARCHITEKTUREN, herkunft: '' };
  const liste = [
    { ...alle, art: 'Ablago selbst', name: 'Ablago', version, lizenz: 'Apache-2.0', quelle: `https://github.com/${REPO}/tree/${commit}` },
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
    },
    {
      ...alle,
      art: 'Handbuch',
      name: 'Material for MkDocs (Oberfläche des Handbuchs)',
      version: material,
      lizenz: 'MIT',
      quelle: `https://github.com/squidfunk/mkdocs-material/tree/${material}`,
    },
    {
      ...alle,
      art: 'Oberfläche',
      name: 'Lucide (Symbole, in web/src übernommen)',
      version: '',
      lizenz: 'ISC',
      quelle: 'https://lucide.dev',
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
    });
  }
  return liste;
}

// ---------------------------------------------------------------------------------------------------------------
// Zusammenführen und vergleichen

const schluessel = (b) => `${b.art}\u0000${b.name}\u0000${b.version}\u0000${b.lizenz}`;
const sortiert = (a) => [...new Set(a)].sort();

/** Gleiche Bestandteile aus allen Varianten und Architekturen zu einer Zeile. */
export function zusammenfuehren(listen) {
  const alle = new Map();
  for (const b of listen.flat()) {
    const k = schluessel(b);
    const da = alle.get(k);
    if (da) {
      da.varianten = sortiert([...da.varianten, ...b.varianten]);
      da.architekturen = sortiert([...da.architekturen, ...b.architekturen]);
    } else {
      alle.set(k, { ...b, varianten: sortiert(b.varianten), architekturen: sortiert(b.architekturen) });
    }
  }
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

/** Neu, entfernt, neue Version, geänderte Lizenz – je Art und Name (eine Zeile je Name und Version). */
export function vergleiche(alt, neu) {
  const gruppe = (liste) => {
    const m = new Map();
    for (const b of liste) {
      if (EIGEN(b)) continue;
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

export const SPALTEN = ['Art', 'Name', 'Version', 'Lizenz', 'Varianten', 'Architekturen', 'Herkunftspaket', 'Quelle'];
const FELDER = ['art', 'name', 'version', 'lizenz', 'varianten', 'architekturen', 'herkunft', 'quelle'];

const feld = (w) => (/[",\n]/.test(w) ? `"${w.replace(/"/g, '""')}"` : w);

export function csv(bestandteile) {
  const zeilen = bestandteile.map((b) => FELDER.map((f) => feld(Array.isArray(b[f]) ? b[f].join(' ') : String(b[f] ?? ''))).join(','));
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

export function ausCsv(text) {
  const [kopf, ...zeilen] = zerlegen(text);
  if (!kopf || kopf.join(',') !== SPALTEN.join(',')) return null;
  return zeilen
    .filter((z) => z.length === SPALTEN.length)
    .map((z) => {
      const b = Object.fromEntries(FELDER.map((f, i) => [f, z[i]]));
      b.varianten = b.varianten.split(' ').filter(Boolean);
      b.architekturen = b.architekturen.split(' ').filter(Boolean);
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
      comment: `Art: ${b.art}; Varianten: ${b.varianten.join(' ')}; Architekturen: ${b.architekturen.join(' ')}`,
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
      ...pakete.map((p) => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: p.SPDXID })),
    ],
  };
}

function uuidAus(text) {
  const h = createHash('sha256').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function cyclonedx({ bestandteile, tag, commit, datum, trivy }) {
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
      component: { type: 'container', name: 'Ablago', version: tag },
    },
    components: bestandteile.map((b) => {
      const c = { type: b.art === 'Schrift' || b.art === 'Schrift (Alpine)' ? 'file' : 'library', name: b.name, version: b.version };
      const pu = purlFuer(b);
      if (pu) c.purl = pu;
      if (b.spdx || b.lizenz) c.licenses = [{ expression: b.spdx || b.lizenz }];
      if (b.quelle) c.externalReferences = [{ type: 'distribution', url: b.quelle }];
      c.properties = [
        { name: 'ablago:art', value: b.art },
        { name: 'ablago:varianten', value: b.varianten.join(' ') },
        { name: 'ablago:architekturen', value: b.architekturen.join(' ') },
      ];
      if (b.herkunft) c.properties.push({ name: 'ablago:herkunftspaket', value: b.herkunft });
      return c;
    }),
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
    for (const [arch, d] of Object.entries(s.architekturen)) zeilen.push(`| \`${s.image}\` | ${arch} | \`${d}\` |`);
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

function abschnittLizenzen(bestandteile) {
  const z = ['| Lizenz | Bestandteile |', '|---|---:|'];
  for (const [k, n] of lizenzZaehlung(bestandteile)) z.push(`| ${k} | ${n} |`);
  z.push('', '_Ein Bestandteil kann mehrere Lizenzen tragen und zählt dann bei jeder mit._', '');
  const pflichten = bestandteile.filter((b) => einteilen(b.lizenz) === 'pflichten');
  z.push(`**Mit besonderen Pflichten (Copyleft, ${pflichten.length}):** Name, Version, Lizenz und Quelltext.`, '');
  for (const b of pflichten) z.push(`- ${b.name} ${b.version}${wo(b)} – ${b.lizenz} – [Quelltext](${b.quelle})`);
  const ohne = bestandteile.filter((b) => einteilen(b.lizenz) === 'ohne');
  z.push(
    '',
    `**Ohne erkannte Lizenz (${ohne.length}):** ${ohne.length ? ohne.map((b) => `${b.name} ${b.version} ([Quelle](${b.quelle}))`).join('; ') : 'keine'}`,
  );
  return z;
}

function abschnittWozu(bestandteile, wozu) {
  const z = [
    '<details><summary>Systemprogramme im Image und wozu sie da sind</summary>',
    '',
    '| Programm | Version | Lizenz | Wozu | Issue | Variante |',
    '|---|---|---|---|---|---|',
  ];
  for (const [name, w] of Object.entries(wozu)) {
    const treffer = bestandteile.filter((b) => b.name === name);
    const version = sortiert(treffer.map((b) => b.version)).join(', ') || '–';
    const lizenz = sortiert(treffer.map((b) => b.lizenz || 'ohne erkannte Lizenz')).join(', ') || '–';
    const issues = w.issues.map((i) => `#${i}`).join(', ');
    z.push(`| ${name} | ${version} | ${lizenz} | ${w.wozu} | ${issues} | ${w.varianten.join(', ')} |`);
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

export function markdown({ tag, commit, datum, stand, bestandteile, aenderungen, vorherTag, wozu, trivy }) {
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
    ...abschnittWozu(bestandteile, wozu),
    '',
    ...abschnittNachpruefen(stand),
    '',
  ].join('\n');
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

function standLesen(ordner) {
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
      listen.push(ausSpdx(doc, { variante, arch }));
    }
  }
  return { stand, listen, trivy };
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
  const a = argumente(argv);
  const { stand, listen, trivy } = standLesen(a.stand);
  const version = a.tag.replace(/^v/, '');
  const extra = ergaenzungen({
    commit: a.commit,
    version,
    node: stand.find((s) => s.node)?.node ?? '',
    schriften: schriftenLesen(),
    material: pipVersion(readFileSync('docs/handbuch/requirements.txt', 'utf8'), 'mkdocs-material'),
  });
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const web = webBibliotheken(lock, JSON.parse(readFileSync('web/package.json', 'utf8')));
  const bestandteile = zusammenfuehren([...listen.map((l) => nurInstalliert(l, lock)), extra, web]);
  const alt = a.vorher && existsSync(a.vorher) ? ausCsv(readFileSync(a.vorher, 'utf8')) : null;
  const aenderungen = alt ? vergleiche(alt, bestandteile) : null;
  const wozu = JSON.parse(readFileSync(new URL('./bestandteile-wozu.json', import.meta.url), 'utf8')).pakete;
  const daten = { tag: a.tag, commit: a.commit, datum: a.datum, stand, bestandteile, trivy };
  mkdirSync(a.aus, { recursive: true });
  writeFileSync(join(a.aus, 'bestandteile.md'), markdown({ ...daten, aenderungen, vorherTag: a['vorher-tag'], wozu }));
  writeFileSync(join(a.aus, DATEIEN.csv), csv(bestandteile));
  writeFileSync(join(a.aus, DATEIEN.spdx), `${JSON.stringify(spdxDokument(daten), null, 1)}\n`);
  writeFileSync(join(a.aus, DATEIEN.cdx), `${JSON.stringify(cyclonedx(daten), null, 1)}\n`);
  console.log(`${bestandteile.length} Bestandteile, ${aenderungen ? 'mit' : 'ohne'} Vergleich zur Vorversion.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
