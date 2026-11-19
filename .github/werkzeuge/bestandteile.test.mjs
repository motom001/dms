// Tests für bestandteile.mjs (#1393): node --test .github/werkzeuge/bestandteile.test.mjs (aus dem Wurzelordner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
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
    },
  ];
  const zurueck = ausCsv(csv(liste));
  assert.deepEqual(zurueck, liste);
  assert.equal(ausCsv('Name,Version\nx,1\n'), null);
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
  assert.match(text, /\| Public Domain \| 1 \|/);
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
  assert.equal(JSON.parse(readFileSync(join(aus, DATEIEN.spdx), 'utf8')).spdxVersion, 'SPDX-2.3');
  assert.equal(JSON.parse(readFileSync(join(aus, DATEIEN.cdx), 'utf8')).specVersion, '1.5');
});
