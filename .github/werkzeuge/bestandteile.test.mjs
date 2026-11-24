// Tests für bestandteile.mjs (#1393): node --test .github/werkzeuge/bestandteile.test.mjs (aus dem Wurzelordner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  alpineEbenen,
  AUFBAU,
  aufbauDaten,
  aufbauKern,
  aufbauPruefen,
  aufbauSeite,
  BASIS,
  EINSATZ,
  ergaenzungen,
  imBetrieb,
  kanten,
  lockBaum,
  serverWurzeln,
  werkzeuge,
  zweckEintragen,
  apkPakete,
  ausCsv,
  ausSpdx,
  csv,
  cyclonedx,
  DATEIEN,
  einteilen,
  lizenzKennungen,
  lizenzText,
  main,
  markdown,
  pipVersion,
  schriftVersion,
  spdxDokument,
  vergleiche,
  nurInstalliert,
  webBibliotheken,
  zusammenfuehren,
} from './bestandteile.mjs';

const anm = (...c) => c.map((comment) => ({ annotator: 'Tool: trivy-0.76.1', annotationType: 'OTHER', comment }));

/** Kleine Stückliste im Aufbau von Trivy 0.76 (SPDX 2.3). */
function stueckliste(extra = []) {
  return {
    spdxVersion: 'SPDX-2.3',
    creationInfo: { creators: ['Organization: aquasecurity', 'Tool: trivy-0.76.1'] },
    hasExtractedLicensingInfos: [{ licenseId: 'LicenseRef-abc', name: 'Public Domain' }],
    packages: [
      { name: 'ghcr.io/motom001/dms@sha256:aa', primaryPackagePurpose: 'CONTAINER', licenseDeclared: 'NOASSERTION' },
      { name: 'alpine', versionInfo: '3.24.4', primaryPackagePurpose: 'OPERATING-SYSTEM', annotations: anm('Class: os-pkgs') },
      {
        name: 'busybox-binsh',
        versionInfo: '1.37.0-r31',
        sourceInfo: 'built package from: busybox 1.37.0-r31',
        licenseDeclared: 'GPL-2.0-only',
        externalRefs: [{ referenceType: 'purl', referenceLocator: 'pkg:apk/alpine/busybox-binsh@1.37.0-r31?arch=x86_64&distro=3.24.4' }],
        annotations: anm('PkgID: busybox-binsh@1.37.0-r31', 'PkgType: alpine'),
      },
      {
        name: 'font-dejavu',
        versionInfo: '2.37-r6',
        sourceInfo: 'built package from: font-dejavu 2.37-r6',
        licenseDeclared: 'Bitstream-Vera',
        externalRefs: [{ referenceType: 'purl', referenceLocator: 'pkg:apk/alpine/font-dejavu@2.37-r6?arch=x86_64&distro=3.24.4' }],
        annotations: anm('PkgType: alpine'),
      },
      { name: '@dms/server', versionInfo: '1.2.3', licenseDeclared: 'Apache-2.0', annotations: anm('PkgType: node-pkg') },
      {
        name: 'xz-libs',
        versionInfo: '5.8.4-r0',
        licenseDeclared: 'GPL-2.0-or-later AND LicenseRef-abc',
        annotations: anm('PkgType: alpine'),
      },
      { name: 'transport', versionInfo: '0.0.1', licenseDeclared: 'NOASSERTION', annotations: anm('PkgType: node-pkg') },
      { name: 'nodemailer', versionInfo: '7.0.0', licenseDeclared: 'MIT-0', annotations: anm('PkgType: node-pkg') },
      ...extra,
    ],
  };
}

test('Lizenzen: LicenseRef aufgelöst, Kennungen nur an AND/OR/WITH getrennt, Copyleft erkannt', () => {
  assert.equal(
    lizenzText('GPL-2.0-or-later AND LicenseRef-abc', { 'LicenseRef-abc': 'Public Domain' }),
    'GPL-2.0-or-later AND Public Domain',
  );
  assert.equal(lizenzText('NOASSERTION'), '');
  assert.equal(
    lizenzText('ISC AND LicenseRef-p AND LicenseRef-d', { 'LicenseRef-p': 'Public', 'LicenseRef-d': 'Domain' }),
    'ISC AND Public Domain',
  );
  assert.equal(lizenzText('0BSD AND Public-Domain'), '0BSD AND Public Domain');
  assert.deepEqual(lizenzKennungen('(MIT OR Apache-2.0) AND Public Domain'), ['MIT', 'Apache-2.0', 'Public Domain']);
  assert.equal(einteilen('GPL-2.0-only'), 'pflichten');
  assert.equal(einteilen('MPL-2.0 AND MIT'), 'pflichten');
  assert.equal(einteilen('MIT OR EUPL-1.1'), 'pflichten');
  assert.equal(einteilen('LGPL-2.1-or-later'), 'pflichten');
  assert.equal(einteilen('MIT'), 'frei');
  assert.equal(einteilen('BlueOak-1.0.0'), 'frei');
  assert.equal(einteilen(''), 'ohne');
});

test('Stückliste: Alpine- und npm-Pakete mit Art und Quelle, Image und Betriebssystem fallen weg', () => {
  const liste = ausSpdx(stueckliste(), { variante: 'dms', arch: 'amd64' });
  assert.deepEqual(
    liste.map((b) => [b.art, b.name]),
    [
      ['Alpine-Paket', 'busybox-binsh'],
      ['Schrift (Alpine)', 'font-dejavu'],
      ['Ablago selbst', '@dms/server'],
      ['Alpine-Paket', 'xz-libs'],
      ['npm (Server)', 'transport'],
      ['npm (Server)', 'nodemailer'],
    ],
  );
  const bb = liste[0];
  assert.equal(bb.herkunft, 'busybox');
  assert.equal(bb.quelle, 'https://pkgs.alpinelinux.org/packages?name=busybox&branch=v3.24');
  assert.deepEqual([bb.varianten, bb.architekturen], [['dms'], ['amd64']]);
  assert.equal(liste[3].lizenz, 'GPL-2.0-or-later AND Public Domain');
  assert.equal(liste[3].spdx, 'GPL-2.0-or-later AND LicenseRef-abc');
  assert.equal(liste[4].lizenz, '');
  assert.equal(liste[5].quelle, 'https://www.npmjs.com/package/nodemailer/v/7.0.0');
});

test('Weboberfläche: Abhängigkeiten aus dem Lockfile, verschachtelt aufgelöst, Werkzeuge nicht', () => {
  const lock = {
    packages: {
      'node_modules/react': { version: '19.3.1', license: 'MIT' },
      'node_modules/qrcode': { version: '1.5.4', license: 'MIT', dependencies: { pngjs: '^5', yargs: '^15' } },
      'node_modules/pngjs': { version: '7.0.0', license: 'MIT' },
      'node_modules/qrcode/node_modules/pngjs': { version: '5.0.0', license: 'MIT' },
      'node_modules/yargs': { version: '15.4.1', license: 'MIT' },
      'node_modules/vite': { version: '7.0.0', license: 'MIT', dev: true },
    },
  };
  const web = webBibliotheken(lock, { dependencies: { react: '^19', qrcode: '^1' }, devDependencies: { vite: '^7' } });
  assert.deepEqual(web.map((b) => `${b.name}@${b.version}`).sort(), ['pngjs@5.0.0', 'qrcode@1.5.4', 'react@19.3.1', 'yargs@15.4.1']);
  assert.ok(web.every((b) => b.art === 'npm (Oberfläche)' && b.varianten.length === 2 && b.architekturen.length === 2));
});

test('Weboberfläche aus dem Bündel (#1470): nur, was Code ins Bündel bringt – yargs nicht, qrcode und react schon', () => {
  const lock = {
    packages: {
      'node_modules/react': { version: '19.3.1', license: 'MIT' },
      'node_modules/qrcode': { version: '1.5.4', license: 'MIT', dependencies: { dijkstrajs: '^1', pngjs: '^5', yargs: '^15' } },
      'node_modules/dijkstrajs': { version: '1.0.3', license: 'MIT' },
      'node_modules/pngjs': { version: '5.0.0', license: 'MIT' },
      'node_modules/yargs': { version: '15.4.1', license: 'MIT', dependencies: { cliui: '^6' } },
      'node_modules/cliui': { version: '6.0.0', license: 'ISC' },
    },
  };
  const buendel = {
    quelle: 'vite',
    pakete: [
      { name: 'dijkstrajs', version: '1.0.3' },
      { name: 'qrcode', version: '1.5.4' },
      { name: 'react', version: '19.3.1' },
    ],
  };
  const web = webBibliotheken(lock, { dependencies: { react: '^19', qrcode: '^1' } }, buendel);
  assert.deepEqual(web.map((b) => b.name).sort(), ['dijkstrajs', 'qrcode', 'react']);
  assert.ok(!web.some((b) => b.name === 'yargs' || b.name === 'cliui'));
  const qrcode = web.find((b) => b.name === 'qrcode');
  assert.deepEqual([qrcode.ebene, qrcode.lizenz, qrcode.herkunft], [1, 'MIT', 'im Bündel']);
  assert.deepEqual(qrcode.braucht, ['dijkstrajs@1.0.3'], 'nur, was auch im Bündel steckt');
  assert.deepEqual(web.find((b) => b.name === 'dijkstrajs').durch, ['qrcode']);
  // Ohne Bündel (Release von Hand) bleibt es beim Lockfile.
  assert.ok(webBibliotheken(lock, { dependencies: { react: '^19', qrcode: '^1' } }).some((b) => b.name === 'yargs'));
});

test('Schriften und Handbuch: Version aus der Schrift und aus requirements.txt', () => {
  assert.match(schriftVersion(readFileSync('server/schriften/NotoSans-Regular.ttf')), /^\d+\.\d{3}$/);
  assert.equal(pipVersion('mkdocs==1.6.1 \\\nmkdocs-material==9.8.1 \\\n    --hash=sha256:x', 'mkdocs-material'), '9.8.1');
  assert.equal(pipVersion('mkdocs-material==9.8.1 \\', 'mkdocs'), '');
});

test('Zusammenführen: gleiche Bestandteile aus allen Varianten und Architekturen in einer Zeile', () => {
  const doc = stueckliste();
  const komplett = stueckliste([
    { name: 'postgresql17', versionInfo: '17.12-r0', licenseDeclared: 'PostgreSQL', annotations: anm('PkgType: alpine') },
  ]);
  const alle = zusammenfuehren([
    ausSpdx(doc, { variante: 'dms', arch: 'amd64' }),
    ausSpdx(doc, { variante: 'dms', arch: 'arm64' }),
    ausSpdx(komplett, { variante: 'dms-komplett', arch: 'amd64' }),
  ]);
  const bb = alle.find((b) => b.name === 'busybox-binsh');
  assert.deepEqual(
    [bb.varianten, bb.architekturen],
    [
      ['dms', 'dms-komplett'],
      ['amd64', 'arm64'],
    ],
  );
  const pg = alle.find((b) => b.name === 'postgresql17');
  assert.deepEqual([pg.varianten, pg.architekturen], [['dms-komplett'], ['amd64']]);
  assert.equal(alle.filter((b) => b.name === 'busybox-binsh').length, 1);
});

test('Vergleich mit der Vorversion: neu, entfernt, neue Version, geänderte Lizenz', () => {
  const b = (name, version, lizenz) => ({ art: 'Alpine-Paket', name, version, lizenz });
  const alt = [
    b('busybox', '1.37.0-r30', 'GPL-2.0-only'),
    b('qpdf', '12.3.1-r0', 'Apache-2.0'),
    b('weg', '1.0', 'MIT'),
    b('gleich', '1', 'MIT'),
  ];
  const neu = [
    b('busybox', '1.37.0-r31', 'GPL-2.0-only'),
    b('qpdf', '12.3.1-r0', 'Apache-2.0 AND MIT'),
    b('dazu', '2.0', 'ISC'),
    b('gleich', '1', 'MIT'),
  ];
  const v = vergleiche(alt, neu);
  assert.deepEqual(v.version, [{ name: 'busybox', art: 'Alpine-Paket', vorher: '1.37.0-r30', jetzt: '1.37.0-r31' }]);
  assert.deepEqual(v.lizenz, [{ name: 'qpdf', art: 'Alpine-Paket', vorher: 'Apache-2.0', jetzt: 'Apache-2.0 AND MIT' }]);
  assert.deepEqual(v.neu, [{ name: 'dazu', art: 'Alpine-Paket', version: '2.0', lizenz: 'ISC' }]);
  assert.deepEqual(v.entfernt, [{ name: 'weg', art: 'Alpine-Paket', version: '1.0' }]);
  const leer = vergleiche(neu, neu);
  assert.equal(leer.neu.length + leer.entfernt.length + leer.version.length + leer.lizenz.length, 0);
});

test('Vergleich: Ablagos eigene Teile mit neuer Versionsnummer zählen nicht als Änderung', () => {
  const eigen = (v) => [
    { art: 'Ablago selbst', name: 'Ablago', version: v, lizenz: 'Apache-2.0' },
    { art: 'Ablago selbst', name: '@dms/server', version: v, lizenz: 'Apache-2.0' },
    { art: 'Handbuch', name: 'Offline-Handbuch (Texte und Bilder)', version: v, lizenz: 'Apache-2.0' },
  ];
  const v = vergleiche(eigen('1.0.0'), eigen('1.0.1'));
  assert.equal(v.neu.length + v.entfernt.length + v.version.length + v.lizenz.length, 0);
});

test('npm: nur Pakete aus dem Lockfile, keine package.json aus Testdaten oder Messprogrammen', () => {
  const lock = {
    packages: {
      '': { name: 'dms' },
      'node_modules/pino': { version: '10.4.0' },
      'node_modules/imapflow/node_modules/pino': { version: '10.3.1' },
      server: { name: '@dms/server', version: '1.2.3' },
    },
  };
  const b = (name, version, art = 'npm (Server)') => ({ art, name, version });
  const liste = [
    b('pino', '10.4.0'),
    b('pino', '10.3.1'),
    b('transport', '0.0.1'),
    b('benchmarks', '1.0.0'),
    b('busybox', '1', 'Alpine-Paket'),
  ];
  assert.deepEqual(
    nurInstalliert(liste, lock).map((x) => `${x.name}@${x.version}`),
    ['pino@10.4.0', 'pino@10.3.1', 'busybox@1'],
  );
});

test('CSV: Hin und zurück, auch mit Komma und Anführungszeichen', () => {
  const liste = [
    {
      art: 'Oberfläche',
      name: 'Lucide (Symbole, übernommen)',
      version: '',
      lizenz: 'ISC',
      varianten: ['dms'],
      architekturen: ['amd64', 'arm64'],
      herkunft: '',
      quelle: 'https://lucide.dev',
      ebene: 1,
      durch: [],
      einsatz: ['Betrieb'],
      zweck: 'Symbole, „übernommen“',
    },
    {
      art: 'npm (Server)',
      name: 'a"b',
      version: '1',
      lizenz: 'MIT OR Apache-2.0',
      varianten: ['dms', 'dms-komplett'],
      architekturen: ['arm64'],
      herkunft: '',
      quelle: 'x',
      ebene: 3,
      durch: ['Basis-Image (node, Alpine)', 'fastify'],
      einsatz: ['Entwicklung', 'Test'],
      zweck: '',
    },
  ];
  const zurueck = ausCsv(csv(liste));
  assert.deepEqual(zurueck, liste);
  assert.equal(ausCsv('Name,Version\nx,1\n'), null);
  // Anhang aus #1393 (ohne Baum): lesbar, alles gilt als Betrieb.
  const alt = ausCsv(
    'Art,Name,Version,Lizenz,Varianten,Architekturen,Herkunftspaket,Quelle\nAlpine-Paket,qpdf,12,Apache-2.0,dms,amd64,qpdf,x\n',
  );
  assert.deepEqual([alt[0].name, alt[0].einsatz, alt[0].durch], ['qpdf', ['Betrieb'], []]);
});

const STAND = [
  {
    variante: 'dms',
    image: 'ghcr.io/motom001/dms',
    digest: 'sha256:aaa',
    node: '24.11.1',
    architekturen: { amd64: 'sha256:a1', arm64: 'sha256:a2' },
  },
  {
    variante: 'dms-komplett',
    image: 'ghcr.io/motom001/dms-komplett',
    digest: 'sha256:bbb',
    node: '24.11.1',
    architekturen: { amd64: 'sha256:b1', arm64: 'sha256:b2' },
  },
];

test('Release-Text: Stand, Änderungen, Lizenzen, Hinweise auf Attest und „keine rechtliche Bewertung“', () => {
  const bestandteile = zusammenfuehren([ausSpdx(stueckliste(), { variante: 'dms', arch: 'amd64' })]);
  const wozu = { busybox: { wozu: 'Grundprogramme', issues: [321], varianten: ['dms'] } };
  const daten = {
    tag: 'v1.2.3',
    commit: 'abcdef1234567890',
    datum: '2026-11-17T10:00:00Z',
    stand: STAND,
    bestandteile,
    trivy: '0.76.1',
    wozu,
  };
  const text = markdown({ ...daten, aenderungen: vergleiche(bestandteile, bestandteile), vorherTag: 'v1.2.2' });
  for (const muss of [
    '## Bestandteile und Lizenzen',
    'keine rechtliche Bewertung',
    'signierte Attest',
    '`sha256:aaa`',
    '| arm64 | `sha256:b2` |',
    'Geändert gegenüber v1.2.2',
    'Keine Änderungen an Bestandteilen.',
    DATEIEN.csv,
    'gh attestation verify oci://ghcr.io/motom001/dms@sha256:aaa',
    'gh attestation verify ablago-bestandteile.csv -R motom001/dms',
  ]) {
    assert.ok(text.includes(muss), `fehlt: ${muss}`);
  }
  assert.match(text, /\*\*Mit besonderen Pflichten \(Copyleft, 2\):\*\*/);
  assert.match(
    text,
    /- busybox-binsh 1\.37\.0-r31 \(nur dms\) – GPL-2\.0-only – \[Quelltext\]\(https:\/\/pkgs\.alpinelinux\.org\/packages\?name=busybox&branch=v3\.24\)/,
  );
  assert.match(text, /\*\*Ohne erkannte Lizenz \(1\):\*\* transport 0\.0\.1/);
  assert.match(text, /<details><summary>Public Domain – 1<\/summary>\n\nxz-libs 5\.8\.4-r0\n\n<\/details>/);
  const erstes = markdown({ ...daten, aenderungen: null, vorherTag: 'v1.2.2' });
  assert.ok(erstes.includes('Kein Vergleich: v1.2.2 hat keine Liste der Bestandteile als Anhang.'));
});

test('SPDX und CycloneDX: gültiger Aufbau, eindeutige Kennungen, Images mit Digest', () => {
  const scoped = { name: '@zone-eu/mailsplit', versionInfo: '5.4.30', licenseDeclared: 'MIT', annotations: anm('PkgType: node-pkg') };
  const bestandteile = zusammenfuehren([ausSpdx(stueckliste([scoped]), { variante: 'dms', arch: 'amd64' })]);
  const daten = { tag: 'v1.2.3', commit: 'abc', datum: '2026-11-17T10:00:00Z', stand: STAND, bestandteile, trivy: '0.76.1' };
  const spdx = spdxDokument(daten);
  assert.equal(spdx.spdxVersion, 'SPDX-2.3');
  const ids = spdx.packages.map((p) => p.SPDXID);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(spdx.packages.filter((p) => p.primaryPackagePurpose === 'CONTAINER').length, 4);
  assert.ok(spdx.relationships.every((r) => r.relationshipType === 'DESCRIBES' && ids.includes(r.relatedSpdxElement)));
  assert.deepEqual(
    spdx.hasExtractedLicensingInfos.map((l) => l.licenseId),
    ['LicenseRef-abc'],
  );
  assert.equal(spdx.packages.find((p) => p.name === 'transport').licenseDeclared, 'NOASSERTION');
  const cdx = cyclonedx(daten);
  assert.equal(cdx.bomFormat, 'CycloneDX');
  assert.match(cdx.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(cdx.components.length, bestandteile.length);
  assert.equal(cdx.components.find((c) => c.name === 'nodemailer').purl, 'pkg:npm/nodemailer@7.0.0');
  assert.equal(cdx.components.find((c) => c.name === '@zone-eu/mailsplit').purl, 'pkg:npm/%40zone-eu/mailsplit@5.4.30');
  assert.equal(cdx.components.find((c) => c.name === 'transport').licenses, undefined);
});

test('Jedes Paket aus „apk add“ im Dockerfile hat einen Eintrag „Wozu“', () => {
  const pakete = apkPakete(readFileSync('Dockerfile', 'utf8'));
  assert.ok(pakete.includes('poppler-utils') && pakete.includes('postgresql18'), 'apk add im Dockerfile nicht gefunden');
  const wozu = JSON.parse(readFileSync('.github/werkzeuge/bestandteile-wozu.json', 'utf8')).pakete;
  assert.deepEqual(
    pakete.filter((p) => !wozu[p]),
    [],
  );
  for (const [name, w] of Object.entries(wozu)) {
    assert.ok(w.wozu && w.issues.length && w.varianten.length, `${name}: wozu, issues und varianten nötig`);
    assert.ok(!/[<>]/.test(w.wozu), `${name}: keine spitzen Klammern (GitHub liest sie als HTML)`);
  }
});

test('Gesamtlauf: aus dem Ordner der Stücklisten entstehen Text und drei Anhänge, mit Vergleich', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'bestandteile-'));
  for (const s of STAND) {
    writeFileSync(join(ordner, `stand-${s.variante}.json`), JSON.stringify(s));
    for (const arch of ['amd64', 'arm64']) writeFileSync(join(ordner, `${s.variante}-${arch}.spdx.json`), JSON.stringify(stueckliste()));
  }
  const aus = join(ordner, 'aus');
  const vorher = join(ordner, 'vorher.csv');
  writeFileSync(
    vorher,
    csv([
      {
        art: 'Alpine-Paket',
        name: 'busybox-binsh',
        version: '1.37.0-r30',
        lizenz: 'GPL-2.0-only',
        varianten: ['dms'],
        architekturen: ['amd64'],
        herkunft: 'busybox',
        quelle: '',
      },
    ]),
  );
  writeFileSync(
    join(ordner, 'bestandteile-buendel.json'),
    JSON.stringify({
      quelle: 'vite',
      pakete: [
        { name: 'qrcode', version: '1.5.4' },
        { name: 'react', version: '19.3.1' },
      ],
    }),
  );
  main([
    '--stand',
    ordner,
    '--tag',
    'v9.9.9',
    '--commit',
    'c0ffee',
    '--datum',
    '2026-11-17T10:00:00Z',
    '--aus',
    aus,
    '--vorher',
    vorher,
    '--vorher-tag',
    'v9.9.8',
  ]);
  const text = readFileSync(join(aus, 'bestandteile.md'), 'utf8');
  assert.match(text, /\*\*Neue Version:\*\* busybox-binsh 1\.37\.0-r30 → 1\.37\.0-r31/);
  assert.match(text, /\*\*Neu:\*\*.*react 19\./);
  const zeilen = ausCsv(readFileSync(join(aus, DATEIEN.csv), 'utf8'));
  for (const art of ['Ablago selbst', 'Laufzeit', 'Handbuch', 'Schrift', 'npm (Oberfläche)', 'Alpine-Paket'])
    assert.ok(
      zeilen.some((b) => b.art === art),
      `Art fehlt: ${art}`,
    );
  assert.equal(zeilen.find((b) => b.name === 'node').version, '24.11.1');
  const web = zeilen.filter((b) => b.art === 'npm (Oberfläche)');
  assert.ok(web.some((b) => b.name === 'qrcode') && web.some((b) => b.name === 'react'), 'qrcode und react aus dem Bündel');
  assert.ok(!web.some((b) => b.name === 'yargs'), 'yargs (Kommandozeile von qrcode) steckt nicht im Bündel');
  assert.ok(web.every((b) => b.herkunft === 'im Bündel'));
  assert.equal(JSON.parse(readFileSync(join(aus, DATEIEN.spdx), 'utf8')).spdxVersion, 'SPDX-2.3');
  assert.equal(JSON.parse(readFileSync(join(aus, DATEIEN.cdx), 'utf8')).specVersion, '1.5');
});

// ---------------------------------------------------------------------------------------------------------------
// Baum der Bestandteile (#1412)

const LOCK = {
  packages: {
    '': { devDependencies: { typescript: '^5', tsx: '^4' } },
    server: { dependencies: { fastify: '^5', 'pdf-lib': '^1' }, devDependencies: { tsx: '^4' } },
    web: { dependencies: { react: '^19' } },
    'node_modules/@dms/server': { resolved: 'server', link: true },
    'node_modules/fastify': { version: '5.0.0', license: 'MIT', dependencies: { pino: '^9', 'fast-json': '^1' } },
    'node_modules/pino': { version: '9.0.0', license: 'MIT', dependencies: { 'fast-json': '^1' } },
    'node_modules/fast-json': { version: '1.0.0', license: 'MIT' },
    'node_modules/pdf-lib': { version: '1.17.1', license: 'MIT', dependencies: { pako: '^1', tslib: '^1' } },
    'node_modules/pdf-lib/node_modules/tslib': { version: '1.14.1', license: '0BSD' },
    'node_modules/tslib': { version: '2.8.1', license: '0BSD' },
    'node_modules/pako': { version: '1.0.11', license: '(MIT AND Zlib)' },
    'node_modules/react': { version: '19.3.1', license: 'MIT' },
    'node_modules/typescript': { version: '5.9.3', license: 'Apache-2.0', dev: true },
    'node_modules/tsx': {
      version: '4.0.0',
      license: 'MIT',
      dev: true,
      dependencies: { esbuild: '^0.25', 'fast-json': '^1' },
      optionalDependencies: { fsevents: '^2' },
    },
    'node_modules/esbuild': { version: '0.25.0', license: 'MIT', dev: true },
  },
};
const RAUCH = {
  packages: {
    '': { devDependencies: { playwright: '1.64.1' } },
    'node_modules/playwright': { version: '1.64.1', license: 'Apache-2.0', dependencies: { 'playwright-core': '1.64.1' } },
    'node_modules/playwright-core': { version: '1.64.1', license: 'Apache-2.0' },
  },
};
const WOZU = {
  pakete: { 'poppler-utils': { wozu: 'PDF-Text', en: 'PDF text', issues: [45], varianten: ['dms'] } },
  npm: {
    fastify: { einsatz: 'Betrieb', teil: 'Server', wozu: 'HTTP-Server', en: 'HTTP server' },
    'pdf-lib': { einsatz: 'Betrieb', teil: 'Server', wozu: 'PDFs bauen', en: 'Building PDFs' },
    react: { einsatz: 'Betrieb', teil: 'Oberfläche', wozu: 'Oberfläche', en: 'Interface' },
    typescript: { einsatz: 'Entwicklung', teil: 'Werkzeug', wozu: 'Typen prüfen', en: 'Type checking' },
    tsx: { einsatz: 'Entwicklung', teil: 'Werkzeug', wozu: 'TypeScript ausführen', en: 'Running TypeScript' },
    playwright: { einsatz: 'Test', teil: 'Werkzeug', wozu: 'Browser steuern', en: 'Driving the browser' },
  },
};

test('Baum aus dem Lockfile: Ebene, Herkunft über Ebene 1, Abhängigkeiten, verschachtelt aufgelöst', () => {
  const baum = lockBaum(LOCK, serverWurzeln(LOCK));
  assert.deepEqual([...baum.keys()].sort(), [
    'fast-json@1.0.0',
    'fastify@5.0.0',
    'pako@1.0.11',
    'pdf-lib@1.17.1',
    'pino@9.0.0',
    'tslib@1.14.1',
  ]);
  const k = (id) => baum.get(id);
  assert.deepEqual([k('fastify@5.0.0').ebene, [...k('fastify@5.0.0').durch]], [1, []]);
  assert.deepEqual([k('pino@9.0.0').ebene, [...k('pino@9.0.0').durch]], [2, ['fastify']]);
  assert.equal(k('fast-json@1.0.0').ebene, 2, 'kleinste Ebene zählt');
  assert.deepEqual([...k('pdf-lib@1.17.1').braucht].sort(), ['pako@1.0.11', 'tslib@1.14.1']);
  assert.equal(k('pako@1.0.11').lizenz, '(MIT AND Zlib)');
});

test('Werkzeuge: Entwicklung und Test getrennt, nicht im Image, ohne Pakete, die auch im Betrieb stecken', () => {
  const betrieb = new Set([...lockBaum(LOCK, serverWurzeln(LOCK)).keys(), 'react@19.3.1']);
  const liste = werkzeuge({ lock: LOCK, rauchLock: RAUCH, npmWozu: WOZU.npm, betrieb });
  const nach = Object.fromEntries(liste.map((b) => [b.name, b]));
  assert.deepEqual(Object.keys(nach).sort(), ['esbuild', 'playwright', 'playwright-core', 'tsx', 'typescript']);
  assert.deepEqual([nach.esbuild.ebene, nach.esbuild.durch, nach.esbuild.einsatz], [2, ['tsx'], ['Entwicklung']]);
  assert.deepEqual([nach.playwright.ebene, nach['playwright-core'].einsatz], [1, ['Test']]);
  assert.ok(liste.every((b) => b.art === 'npm (Werkzeug)' && !b.varianten.length && !imBetrieb(b)));
});

/** Kleine Stückliste mit Beziehungen DEPENDS_ON, wie Trivy sie für Alpine schreibt. */
function alpineStueckliste() {
  const pkg = (name, version, lizenz) => ({
    name,
    SPDXID: `SPDXRef-Package-${name}`,
    versionInfo: version,
    licenseDeclared: lizenz,
    sourceInfo: `built package from: ${name} ${version}`,
    externalRefs: [{ referenceType: 'purl', referenceLocator: `pkg:apk/alpine/${name}@${version}?distro=3.24.4` }],
    annotations: anm('PkgType: alpine'),
  });
  const dep = (a, b) => ({
    spdxElementId: `SPDXRef-Package-${a}`,
    relationshipType: 'DEPENDS_ON',
    relatedSpdxElement: `SPDXRef-Package-${b}`,
  });
  return {
    packages: [
      pkg('poppler-utils', '25.12.0-r1', 'GPL-2.0-or-later'),
      pkg('poppler', '25.12.0-r1', 'GPL-2.0-or-later'),
      pkg('libpng', '1.6.50-r0', 'Libpng'),
      pkg('musl', '1.2.6-r3', 'MIT'),
      pkg('alpine-baselayout', '3.7.2-r1', 'GPL-2.0-only'),
      pkg('alpine-baselayout-data', '3.7.2-r1', 'GPL-2.0-only'),
    ],
    relationships: [
      dep('poppler-utils', 'poppler'),
      dep('poppler-utils', 'musl'),
      dep('poppler', 'libpng'),
      dep('libpng', 'musl'),
      dep('alpine-baselayout', 'alpine-baselayout-data'),
      dep('alpine-baselayout', 'musl'),
    ],
  };
}

test('Alpine: Ebene aus DEPENDS_ON, eigens Installiertes ist Ebene 1, der Rest kommt mit dem Basis-Image', () => {
  const liste = alpineEbenen(ausSpdx(alpineStueckliste(), { variante: 'dms', arch: 'amd64' }), ['poppler-utils']);
  const nach = Object.fromEntries(liste.map((b) => [b.name, [b.ebene, b.durch]]));
  assert.deepEqual(nach, {
    'poppler-utils': [1, []],
    poppler: [2, ['poppler-utils']],
    libpng: [3, ['poppler-utils']],
    musl: [2, ['poppler-utils']],
    'alpine-baselayout': [2, [BASIS]],
    'alpine-baselayout-data': [3, [BASIS]],
  });
  assert.deepEqual(liste.find((b) => b.name === 'poppler-utils').braucht, ['musl@1.2.6-r3', 'poppler@25.12.0-r1']);
});

/** Bestandteile wie im Gesamtlauf: Alpine, Server, Ergänzungen, Werkzeuge. */
function baumBestandteile() {
  const alpine = alpineEbenen(ausSpdx(alpineStueckliste(), { variante: 'dms', arch: 'amd64' }), ['poppler-utils']);
  const extra = ergaenzungen({ commit: 'abc', version: '1.2.3', node: '24.11.1', schriften: [], material: '9.8.1' });
  const betrieb = new Set([...lockBaum(LOCK, serverWurzeln(LOCK)).keys()]);
  const dazu = werkzeuge({ lock: LOCK, rauchLock: RAUCH, npmWozu: WOZU.npm, betrieb });
  return zweckEintragen(zusammenfuehren([alpine, extra, dazu]), WOZU);
}

test('Zweck: Ebene 1 aus bestandteile-wozu.json, Mitgebrachtes ohne', () => {
  const nach = Object.fromEntries(baumBestandteile().map((b) => [b.name, b.zweck ?? '']));
  assert.equal(nach['poppler-utils'], 'PDF-Text');
  assert.equal(nach.typescript, 'Typen prüfen');
  assert.equal(nach.poppler, '');
  assert.equal(nach.esbuild, '');
  assert.match(nach.Ablago, /Ablago selbst/);
});

test('SPDX und CycloneDX: Abhängigkeiten als Beziehungen, Werkzeuge als Entwicklung bzw. Test, nicht im Image', () => {
  const bestandteile = baumBestandteile();
  const daten = { tag: 'v1.2.3', commit: 'abc', datum: '2026-11-19T10:00:00Z', stand: STAND, bestandteile, trivy: '0.76.1' };
  const spdx = spdxDokument(daten);
  const name = Object.fromEntries(spdx.packages.map((p) => [p.SPDXID, p.name]));
  const bez = spdx.relationships.map(
    (r) => `${name[r.spdxElementId] ?? r.spdxElementId} ${r.relationshipType} ${name[r.relatedSpdxElement]}`,
  );
  for (const muss of [
    'poppler-utils DEPENDS_ON poppler',
    'poppler DEPENDS_ON libpng',
    'Ablago DEPENDS_ON poppler-utils',
    'Ablago DEPENDS_ON node',
    'tsx DEPENDS_ON esbuild',
    'typescript DEV_DEPENDENCY_OF Ablago',
    'playwright TEST_DEPENDENCY_OF Ablago',
    'SPDXRef-DOCUMENT DESCRIBES poppler',
  ])
    assert.ok(bez.includes(muss), `fehlt: ${muss}`);
  assert.ok(!bez.includes('SPDXRef-DOCUMENT DESCRIBES typescript'), 'Werkzeuge beschreibt das Dokument nicht als Teil des Images');
  assert.ok(!bez.includes('Ablago DEPENDS_ON poppler'), 'nur Ebene 1 hängt an Ablago');
  assert.match(
    spdx.packages.find((p) => p.name === 'esbuild').comment,
    /Einsatz: Entwicklung; nicht im Image; Ebene: 2; Eingebracht durch: tsx/,
  );
  const ids = spdx.packages.map((p) => p.SPDXID);
  assert.ok(spdx.relationships.every((r) => r.spdxElementId === 'SPDXRef-DOCUMENT' || ids.includes(r.spdxElementId)));

  const cdx = cyclonedx(daten);
  const ref = Object.fromEntries(cdx.components.map((c) => [c.name, c['bom-ref']]));
  const dep = Object.fromEntries(cdx.dependencies.map((d) => [d.ref, d.dependsOn]));
  assert.deepEqual(dep['ablago-image'], [ref.Ablago]);
  assert.ok(dep[ref['poppler-utils']].includes(ref.poppler));
  assert.ok(dep[ref.Ablago].includes(ref['poppler-utils']));
  assert.equal(cdx.components.find((c) => c.name === 'typescript').scope, 'excluded');
  assert.equal(cdx.components.find((c) => c.name === 'poppler').scope, 'required');
  const prop = (n, k) => cdx.components.find((c) => c.name === n).properties.find((p) => p.name === k)?.value;
  assert.deepEqual([prop('libpng', 'ablago:ebene'), prop('libpng', 'ablago:eingebracht-durch')], ['3', 'poppler-utils']);
  assert.equal(new Set(cdx.components.map((c) => c['bom-ref'])).size, cdx.components.length);
});

test('Vergleich und Release-Text zählen nur, was im Image steckt; Copyleft mit Herkunft, Namen je Lizenz', () => {
  const bestandteile = baumBestandteile();
  const ohneWerkzeuge = bestandteile.filter(imBetrieb);
  const v = vergleiche(ohneWerkzeuge, bestandteile);
  assert.equal(v.neu.length + v.entfernt.length + v.version.length + v.lizenz.length, 0);
  const text = markdown({
    tag: 'v1.2.3',
    commit: 'abcdef1234567890',
    datum: '2026-11-19T10:00:00Z',
    stand: STAND,
    bestandteile,
    aenderungen: v,
    vorherTag: 'v1.2.2',
    wozu: WOZU,
    trivy: '0.76.1',
  });
  assert.match(text, new RegExp(`### Lizenzen \\(${ohneWerkzeuge.length} Bestandteile\\)`));
  assert.match(text, /- poppler 25\.12\.0-r1 \(nur dms\) – GPL-2\.0-or-later – über poppler-utils – \[Quelltext\]/);
  assert.match(text, /- alpine-baselayout 3\.7\.2-r1 \(nur dms\) – GPL-2\.0-only – über Basis-Image \(node, Alpine\)/);
  assert.match(text, /<details><summary>GPL-2\.0-or-later – 2<\/summary>\n\npoppler 25\.12\.0-r1 · \*\*poppler-utils\*\* 25\.12\.0-r1\n/);
  assert.match(text, /Nicht im Image und hier nicht gezählt: 5 Pakete für Entwicklung und Test/);
  assert.match(text, /\| poppler-utils \| 25\.12\.0-r1 \| GPL-2\.0-or-later \| PDF-Text \| 3 \|/);
  assert.ok(!/typescript/.test(text), 'Werkzeuge stehen nicht im Release-Text');
});

test('Zweck: jedes direkt eingebundene npm-Paket hat Einsatz, Teil und Zweck auf Deutsch und Englisch', () => {
  const wozu = JSON.parse(readFileSync('.github/werkzeuge/bestandteile-wozu.json', 'utf8'));
  const dateien = ['package.json', 'server/package.json', 'web/package.json', 'shared/package.json', 'web/rauchtest/package.json'];
  const direkt = new Map();
  for (const d of dateien) {
    const p = JSON.parse(readFileSync(d, 'utf8'));
    for (const n of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) direkt.set(n, 'Betrieb');
    for (const n of Object.keys(p.devDependencies ?? {})) if (!direkt.has(n)) direkt.set(n, 'Werkzeug');
  }
  const fehlt = [...direkt.keys()].filter((n) => !wozu.npm[n]);
  assert.deepEqual(fehlt, [], `Bitte in .github/werkzeuge/bestandteile-wozu.json unter „npm“ eintragen: ${fehlt.join(', ')}`);
  assert.deepEqual(
    Object.keys(wozu.npm).filter((n) => !direkt.has(n)),
    [],
    'Einträge ohne Paket bitte entfernen',
  );
  for (const [name, w] of Object.entries(wozu.npm)) {
    assert.ok(EINSATZ.includes(w.einsatz), `${name}: Einsatz ${w.einsatz}`);
    assert.equal(w.einsatz === 'Betrieb', direkt.get(name) === 'Betrieb', `${name}: Betrieb genau für dependencies`);
    assert.ok(w.wozu && w.en && w.teil, `${name}: wozu, en und teil nötig`);
    assert.ok(!/[<>|]/.test(w.wozu + w.en), `${name}: keine spitzen Klammern oder senkrechten Striche`);
  }
  for (const [name, w] of Object.entries(wozu.pakete)) assert.ok(w.en && !/[<>|]/.test(w.en), `${name}: englischer Zweck nötig`);
});

test('Handbuchseite: Kern ohne Mitgebrachtes; geänderter Zweck ist ein Fehler, nur Mitgebrachtes ein Hinweis', () => {
  const daten = aufbauDaten({ lock: LOCK, rauchLock: RAUCH, wozu: WOZU });
  assert.deepEqual(
    daten.server.map((w) => [w.name, w.mit]),
    [
      ['fastify', ['fast-json', 'pino']],
      ['pdf-lib', ['pako', 'tslib']],
    ],
  );
  assert.deepEqual([daten.werkzeugZahl, daten.werkzeuge.map((w) => w.name)], [5, ['playwright', 'tsx', 'typescript']]);
  const de = aufbauSeite(daten, 'de');
  assert.match(de, /\| `fastify` \| HTTP-Server \| MIT \| 2 \|/);
  assert.match(de, /\?\?\? note "fastify bringt 2 Pakete mit"\n {4}fast-json, pino/);
  assert.match(de, /\| `playwright` \| Test \| Browser steuern \| Apache-2\.0 \| 1 \|/);
  assert.match(aufbauSeite(daten, 'en'), /\| `fastify` \| HTTP server \| MIT \| 2 \|/);
  const seiten = (d) => Object.fromEntries(Object.entries(AUFBAU).map(([sp, pfad]) => [pfad, aufbauSeite(d, sp)]));
  const ist = seiten(daten);
  assert.equal(
    aufbauPruefen(daten, (p) => ist[p]),
    'gleich',
  );
  const mehr = structuredClone(LOCK);
  mehr.packages['node_modules/pino'].dependencies.sonic = '^1';
  mehr.packages['node_modules/sonic'] = { version: '1.0.0', license: 'MIT' };
  assert.equal(aufbauKern(aufbauSeite(aufbauDaten({ lock: mehr, rauchLock: RAUCH, wozu: WOZU }), 'de')), aufbauKern(de));
  assert.equal(
    aufbauPruefen(aufbauDaten({ lock: mehr, rauchLock: RAUCH, wozu: WOZU }), (p) => ist[p]),
    'mitgebracht',
  );
  const anders = structuredClone(WOZU);
  anders.npm.fastify.wozu = 'Webserver';
  assert.equal(
    aufbauPruefen(aufbauDaten({ lock: LOCK, rauchLock: RAUCH, wozu: anders }), (p) => ist[p]),
    'kern',
  );
  assert.equal(
    aufbauPruefen(daten, () => null),
    'kern',
  );
});

test('Handbuchseite „Aufbau aus Bestandteilen“ im Repository passt zu Lockfiles und Zweck', () => {
  const lies = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const daten = aufbauDaten({
    lock: lies('package-lock.json'),
    rauchLock: lies('web/rauchtest/package-lock.json'),
    wozu: lies('.github/werkzeuge/bestandteile-wozu.json'),
  });
  const ergebnis = aufbauPruefen(daten, (p) => readFileSync(p, 'utf8'));
  assert.notEqual(ergebnis, 'kern', 'Bitte „node .github/werkzeuge/bestandteile.mjs --handbuch“ ausführen und die Seiten einchecken.');
});

test('Kanten nur zwischen vorhandenen Bestandteilen derselben Gruppe', () => {
  const bestandteile = baumBestandteile();
  for (const [von, zu] of kanten(bestandteile)) {
    assert.ok(bestandteile.includes(von) && bestandteile.includes(zu));
    assert.ok(von.art === 'Ablago selbst' || von.art.split(' ')[0] === zu.art.split(' ')[0] || zu.art === 'Schrift (Alpine)');
  }
});
