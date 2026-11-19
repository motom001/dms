/**
 * Benutzer von Ablago aus dem Datenordner (#1466): Wahl im Start-Skript (deploy/image/start-hilfen.sh), Übernahme mit
 * so wenig Änderungen wie möglich, Meldungen im Merker; dazu das Lesen im Server und die Startseite.
 *
 * Das Skript läuft hier mit dash gegen einen Ordner im Temp-Verzeichnis; welche Ordner „eingebunden“ sind, sagt eine
 * eigene mountinfo-Datei. Übernehmen und die Schreibprobe brauchen root (lokal); ohne root prüft der Test nur die Wahl.
 * Die echte Probe mit Docker steht in deploy/komplett-probe.sh (Schritt 2e) und in image.yml (image-probe).
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { aenderungText, kennungSatz, kennungVorschlag } from '../../shared/src/dienstbenutzer';
import { dienstbenutzer, rechtefehler, startseitenKennung } from '../src/einrichtung/dienstbenutzer';
import { startseiteHtml, type Startstand } from '../src/einrichtung/startfehler';
import { t } from '../src/sprache/sprache';

const HILFEN = join(import.meta.dirname, '../../deploy/image/start-hilfen.sh');
const ALS = join(import.meta.dirname, '../../deploy/image/ablago-als.sh');
const ROOT = process.getuid?.() === 0;
const DASH = spawnSync('dash', ['-c', 'true']).status === 0;
const SETPRIV = spawnSync('setpriv', ['--version']).status === 0;
const tmp = mkdtempSync(join(tmpdir(), 'dms-b-kenn-'));
// Die Schreibprobe läuft als 1026 bzw. 1000: Der Weg dorthin muss für sie offen sein.
chmodSync(tmp, 0o755);
after(() => rmSync(tmp, { recursive: true, force: true }));

let nr = 0;
interface Aufbau {
  /** Ordner unter data mit Besitzer und Rechten; eingehaengt: steht in der mountinfo. */
  ordner: Record<string, { uid: number; gid: number; modus?: number; eingehaengt?: boolean }>;
  dateien?: Record<string, { uid: number; gid: number; modus: number }>;
  /** /data selbst eingebunden. */
  wurzel?: { uid: number; gid: number };
  merker?: string;
}

function aufbau(a: Aufbau) {
  const w = join(tmp, `lauf-${++nr}`);
  const data = join(w, 'data');
  mkdirSync(data, { recursive: true });
  chmodSync(w, 0o755);
  const punkte: string[] = [];
  if (a.wurzel) {
    if (ROOT) chownSync(data, a.wurzel.uid, a.wurzel.gid);
    punkte.push(data);
  }
  for (const [name, o] of Object.entries(a.ordner)) {
    const d = join(data, name);
    mkdirSync(d, { recursive: true });
    chmodSync(d, o.modus ?? 0o755);
    if (ROOT) chownSync(d, o.uid, o.gid);
    if (o.eingehaengt !== false) punkte.push(d);
  }
  for (const [name, f] of Object.entries(a.dateien ?? {})) {
    const p = join(data, name);
    writeFileSync(p, 'x');
    chmodSync(p, f.modus);
    if (ROOT) chownSync(p, f.uid, f.gid);
  }
  const mountinfo = join(w, 'mountinfo');
  writeFileSync(
    mountinfo,
    [
      `22 1 0:21 / / rw,relatime - overlay overlay rw`,
      ...punkte.map((p, i) => `${30 + i} 22 8:1 /x ${p} rw,noatime - ext4 /dev/sda1 rw`),
    ].join('\n') + '\n',
  );
  const merker = a.merker ?? join(w, 'merker');
  return { w, data, mountinfo, merker };
}

/** start-hilfen.sh mit dash: Wahl, dann (als root) Übernahme. */
function starte(o: ReturnType<typeof aufbau>, env: Record<string, string> = {}, uebernehmen = true) {
  const skript = [
    'set -eu',
    'log() { echo "[t] $*"; }',
    '. "$HILFEN"',
    'benutzer_pruefen || { echo "WAHL-FEHLER"; exit 0; }',
    'echo "WAHL $PUID:$PGID $DMS_KENNUNG_HERKUNFT ${DMS_KENNUNG_GRUND:--}"',
    uebernehmen ? 'if ordner_uebernehmen; then echo ERGEBNIS-OK; else echo ERGEBNIS-FEHLT; fi' : 'true',
  ].join('\n');
  const r = spawnSync('dash', ['-c', skript], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HILFEN,
      DMS_DATEN_WURZEL: o.data,
      DMS_EINHAENGEPUNKTE: o.mountinfo,
      DMS_RECHTE_MERKER: o.merker,
      DMS_VORSTART: 'true',
      DMS_VORSTART_DATEI: join(o.w, 'vorstart'),
      DMS_WERKZEUG_WURZEL: join(o.w, 'werkzeuge'),
      ...env,
    },
  });
  assert.equal(r.status, 0, r.stderr);
  const wahl = /^WAHL (\S+) (\S+ \S+) (\S+)$/m.exec(r.stdout);
  return {
    aus: r.stdout,
    kennung: wahl?.[1] ?? null,
    herkunft: wahl?.[2] ?? null,
    grund: wahl?.[3] ?? null,
    ok: r.stdout.includes('ERGEBNIS-OK'),
    aenderungen: existsSync(join(o.merker, 'aenderungen')) ? readFileSync(join(o.merker, 'aenderungen'), 'utf8').trim().split('\n') : [],
  };
}
const besitzer = (p: string) => `${statSync(p).uid}:${statSync(p).gid}`;
const modus = (p: string) => (statSync(p).mode & 0o777).toString(8);

describe('Start-Skript: Benutzer aus dem Datenordner (#1466)', { skip: !DASH && 'dash fehlt' }, () => {
  const eigen = { uid: process.getuid?.() ?? 1000, gid: process.getgid?.() ?? 1000 };
  // Als root: der NAS-Benutzer 1026:100; sonst der eigene Benutzer (der Test kann nur ihm Ordner geben).
  const nas = ROOT ? { uid: 1026, gid: 100 } : eigen;

  it('ohne PUID/PGID: Besitzer des eingebundenen Ordners', () => {
    const o = aufbau({ ordner: { files: nas, geheim: nas, sicherung: nas } });
    const r = starte(o, {}, false);
    assert.equal(r.kennung, `${nas.uid}:${nas.gid}`);
    assert.equal(r.herkunft, 'daten daten');
    assert.match(r.aus, new RegExp(`Ablago läuft als Benutzer ${nas.uid} und Gruppe ${nas.gid} – wie der Besitzer des Datenordners`));
  });

  it('/data selbst eingebunden geht vor; der Ordner /data aus dem Image zählt nicht', () => {
    const o = aufbau({ wurzel: nas, ordner: { files: { ...nas, eingehaengt: false } } });
    assert.equal(starte(o, {}, false).herkunft, 'daten daten');
    const ohne = aufbau({ ordner: { files: { ...nas, eingehaengt: false } } });
    const r = starte(ohne, {}, false);
    assert.equal(r.kennung, '1000:1000');
    assert.equal(r.herkunft, 'vorgabe vorgabe');
    assert.equal(r.grund, 'ohne');
  });

  it('gesetzte PUID/PGID gehen immer vor; nur PUID: Gruppe 1000 wie bisher', () => {
    const o = aufbau({ ordner: { files: nas } });
    assert.deepEqual(
      [starte(o, { PUID: '1027', PGID: '1028' }, false).kennung, starte(o, { PUID: '1027', PGID: '1028' }, false).herkunft],
      ['1027:1028', 'gesetzt gesetzt'],
    );
    const nurPuid = starte(o, { PUID: '1027' }, false);
    assert.deepEqual([nurPuid.kennung, nurPuid.herkunft], ['1027:1000', 'gesetzt vorgabe']);
  });

  it('ungültige PUID: Fehler, Seite läuft mit 1000 (nie mit der kaputten Kennung)', () => {
    const o = aufbau({ ordner: {} });
    const r = starte(o, { PUID: 'abc' }, false);
    assert.match(r.aus, /WAHL-FEHLER/);
    assert.match(r.aus, /PUID und PGID müssen Zahlen sein/);
  });

  describe('nie 0, nie die Werkzeuge, nie postgres', { skip: !ROOT && 'braucht root' }, () => {
    for (const [uid, gid, grund] of [
      [0, 0, 'root'],
      [1026, 0, 'root'],
      [0, 100, 'root'],
      [61000, 61000, 'system'],
      [1026, 61000, 'system'],
    ] as const)
      it(`Ordner gehört ${uid}:${gid} → Vorgabe 1000:1000 (${grund})`, () => {
        const o = aufbau({ ordner: { files: { uid, gid } } });
        const r = starte(o, {}, false);
        assert.deepEqual([r.kennung, r.herkunft, r.grund], ['1000:1000', 'vorgabe vorgabe', grund]);
      });

    it('ein tauglicher Ordner weiter hinten wird genommen', () => {
      const o = aufbau({ ordner: { files: { uid: 0, gid: 0 }, geheim: { uid: 1026, gid: 100 } } });
      assert.equal(starte(o, {}, false).kennung, '1026:100');
    });
  });
});

describe(
  'Start-Skript: Übernahme mit so wenig Änderungen wie möglich (#1466)',
  { skip: (!ROOT || !DASH || !SETPRIV) && 'braucht root, dash und setpriv' },
  () => {
    it('Bind-Mount 1026:100 ohne PUID: läuft als 1026:100, nichts auf dem NAS umgeschrieben', () => {
      const o = aufbau({
        ordner: { files: { uid: 1026, gid: 100 }, geheim: { uid: 1026, gid: 100, modus: 0o750 }, sicherung: { uid: 1026, gid: 100 } },
        dateien: {
          'files/eigen.pdf': { uid: 1026, gid: 100, modus: 0o644 },
          'files/gruppe.pdf': { uid: 1026, gid: 1027, modus: 0o664 },
          'geheim/dms.schluessel': { uid: 1026, gid: 100, modus: 0o600 },
        },
      });
      const r = starte(o);
      assert.equal(r.kennung, '1026:100');
      assert.ok(r.ok, r.aus);
      assert.deepEqual(r.aenderungen, [], 'keine Änderung gemeldet');
      for (const [p, b, m] of [
        ['files', '1026:100', '755'],
        ['geheim', '1026:100', '750'],
        ['sicherung', '1026:100', '755'],
        ['files/eigen.pdf', '1026:100', '644'],
        ['files/gruppe.pdf', '1026:1027', '664'],
        ['geheim/dms.schluessel', '1026:100', '600'],
      ])
        assert.deepEqual([p, besitzer(join(o.data, p)), modus(join(o.data, p))], [p, b, m]);
      // export ist nicht eingebunden (liegt nur im Container): gehört jetzt Ablago, ohne Eintrag in den Änderungen.
      assert.equal(besitzer(join(o.data, 'export')), '1026:100');
      assert.equal(readFileSync(join(o.merker, 'kennung'), 'utf8').trim(), '1026:100 daten daten -');
      assert.equal(modus(join(o.merker, 'kennung')), '644', 'für ablago-als (docker exec) lesbar');
    });

    it('frisches Volume (root): 1000:1000, übernimmt nur, was root gehört, meldet es; zweiter Start ohne Hin und Her', () => {
      const o = aufbau({
        ordner: { files: { uid: 0, gid: 0 }, geheim: { uid: 0, gid: 0 }, sicherung: { uid: 0, gid: 0 } },
        dateien: { 'files/alt.pdf': { uid: 0, gid: 0, modus: 0o644 }, 'files/scanner.pdf': { uid: 1030, gid: 100, modus: 0o644 } },
      });
      const r = starte(o);
      assert.deepEqual([r.kennung, r.herkunft, r.grund], ['1000:1000', 'vorgabe vorgabe', 'root']);
      assert.ok(r.ok, r.aus);
      assert.equal(besitzer(join(o.data, 'files/alt.pdf')), '1000:1000');
      assert.equal(besitzer(join(o.data, 'files/scanner.pdf')), '1030:100', 'gehörte nicht root – bleibt');
      assert.match(r.aus, /übernehme .*\/files für Benutzer 1000 und Gruppe 1000/);
      assert.match(r.aus, /Hinweis: In .*\/files gehört nicht alles Ablago \(z\. B\. 1030:100/);
      assert.equal(modus(join(o.data, 'files')), '750', 'übernommen → o-rwx');
      const arten = r.aenderungen.map((z) => z.split(' ').slice(1, 4).join(' ').replace(o.data, '/data'));
      assert.ok(arten.includes('besitzer-root /data/files 2'), arten.join(' | '));
      assert.ok(arten.includes('rechte /data/files 1'), arten.join(' | '));
      // Zweiter Start: Der Ordner gehört jetzt 1000:1000 – die Herkunft bleibt „Vorgabe“, nichts Neues geändert.
      const zwei = starte(o);
      assert.deepEqual([zwei.kennung, zwei.herkunft, zwei.grund], ['1000:1000', 'vorgabe vorgabe', 'root']);
      assert.equal(zwei.aenderungen.length, r.aenderungen.length);
      assert.doesNotMatch(zwei.aus, /übernehme/);
    });

    it('Bestand aus 0.299.0 (alles 1000:1000, o-rwx): bleibt 1000:1000, nichts geändert', () => {
      const o = aufbau({
        ordner: {
          files: { uid: 1000, gid: 1000, modus: 0o750 },
          geheim: { uid: 1000, gid: 1000, modus: 0o750 },
          sicherung: { uid: 1000, gid: 1000, modus: 0o750 },
        },
        dateien: { 'files/a.pdf': { uid: 1000, gid: 1000, modus: 0o600 } },
      });
      const r = starte(o);
      assert.deepEqual([r.kennung, r.herkunft], ['1000:1000', 'daten daten']);
      assert.ok(r.ok, r.aus);
      assert.deepEqual(r.aenderungen, []);
    });

    it('PUID gesetzt: wie bisher alles für PUID:PGID, mit Meldung', () => {
      const o = aufbau({ ordner: { files: { uid: 1026, gid: 100 } }, dateien: { 'files/a.pdf': { uid: 1026, gid: 100, modus: 0o644 } } });
      const r = starte(o, { PUID: '1027', PGID: '1027' });
      assert.ok(r.ok, r.aus);
      assert.equal(besitzer(join(o.data, 'files/a.pdf')), '1027:1027');
      assert.ok(
        r.aenderungen.some((z) => z.includes(' besitzer ') && z.endsWith(' 1027:1027')),
        r.aenderungen.join(' | '),
      );
    });

    it('geheim: Schlüssel, die die Gruppe lesen könnte, nur noch für Ablago – gemeldet', () => {
      const o = aufbau({
        ordner: { geheim: { uid: 1026, gid: 100 } },
        dateien: { 'geheim/dms.schluessel': { uid: 1026, gid: 100, modus: 0o644 } },
      });
      const r = starte(o);
      assert.ok(r.ok, r.aus);
      assert.equal(modus(join(o.data, 'geheim/dms.schluessel')), '600');
      assert.equal(modus(join(o.data, 'geheim')), '755', 'der Ordner des NAS-Benutzers bleibt');
      assert.ok(
        r.aenderungen.some((z) => z.includes(' geheim ') && z.includes(' 1 ')),
        r.aenderungen.join(' | '),
      );
    });

    it('Schreibprobe scheitert: Ursache und fertige Zeilen mit den gesehenen Kennungen, im Protokoll und im Merker', () => {
      const o = aufbau({ ordner: { files: { uid: 1026, gid: 100 }, geheim: { uid: 1027, gid: 101, modus: 0o700 } } });
      const r = starte(o);
      assert.equal(r.kennung, '1026:100');
      assert.equal(r.ok, false);
      assert.equal(besitzer(join(o.data, 'geheim')), '1027:101', 'gehört einem anderen Benutzer – nicht umgeschrieben');
      assert.match(r.aus, /kann nicht in .*\/geheim schreiben\. Der Ordner gehört 1027:101 \(Rechte 700\)/);
      assert.match(r.aus, /PUID: "1027"/);
      assert.match(r.aus, /PGID: "101"/);
      assert.match(r.aus, /sudo chown -R 1026:100 <Ordner auf dem NAS>/);
      const env = { DMS_RECHTE_MERKER: o.merker };
      assert.deepEqual(rechtefehler(env), {
        fehler: [{ ordner: 'geheim', besitzer: '1027:101', rechte: '700', schreibgeschuetzt: false }],
        vorschlag: { puid: 1027, pgid: 101 },
      });
    });

    it('ablago-als nimmt die Kennung aus dem Merker (docker exec kennt PUID nicht)', () => {
      const o = aufbau({ ordner: { files: { uid: 1026, gid: 100 } } });
      starte(o);
      const aus = execFileSync('dash', [ALS, 'id', '-u'], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, DMS_RECHTE_MERKER: o.merker },
      });
      assert.equal(aus.trim(), '1026');
    });
  },
);

describe('Benutzer von Ablago im Server (#1466)', () => {
  const env = { DMS_KENNUNG_HERKUNFT: 'daten daten', DMS_RECHTE_MERKER: '/merker' };
  const lesen = (inhalt: Record<string, string>) => (p: string) => {
    const name = p.replace('/merker/', '');
    if (!(name in inhalt)) throw Object.assign(new Error('fehlt'), { code: 'ENOENT' });
    return inhalt[name]!;
  };

  it('liest Herkunft und Änderungen streng: Unbekanntes und fremde Pfade fallen weg', () => {
    const k = dienstbenutzer(
      env,
      lesen({
        aenderungen: [
          '1763560000 besitzer-root /data/files 12 1000:1000',
          '1763560001 rechte /data/files 1 1000:1000',
          '1763560002 loeschen /data/files 1 1000:1000',
          '1763560003 besitzer /etc/passwd 1 1000:1000',
          '1763560004 geheim /data/geheim 2 1000:x',
          'kaputt',
        ].join('\n'),
      }),
    );
    assert.deepEqual(k.herkunft, { benutzer: 'daten', gruppe: 'daten' });
    assert.deepEqual(
      k.aenderungen.map((a) => `${a.art} ${a.ordner} ${a.anzahl}`),
      ['besitzer-root /data/files 12', 'rechte /data/files 1'],
    );
  });

  it('ohne Wahl des Start-Skripts (Entwicklung, docker run --user): keine Herkunft, kein Satz', () => {
    const k = dienstbenutzer({}, lesen({}));
    assert.equal(k.herkunft, null);
    assert.equal(kennungSatz(k, t.frei), null);
  });

  it('Sätze: gleich, getrennt, Vorgabe mit Grund', () => {
    const basis = { benutzer: 1026, gruppe: 100, grund: null, aenderungen: [] };
    assert.equal(
      kennungSatz({ ...basis, herkunft: { benutzer: 'daten', gruppe: 'daten' } }, t.frei),
      'Ablago läuft als Benutzer 1026 und Gruppe 100 – wie der Besitzer des Datenordners.',
    );
    assert.equal(
      kennungSatz({ ...basis, benutzer: 1000, gruppe: 1000, grund: 'root', herkunft: { benutzer: 'vorgabe', gruppe: 'vorgabe' } }, t.frei),
      'Ablago läuft als Benutzer 1000 und Gruppe 1000 – Vorgabe, weil der Datenordner root gehört.',
    );
    assert.equal(
      kennungSatz({ ...basis, herkunft: { benutzer: 'gesetzt', gruppe: 'vorgabe' } }, t.frei),
      'Ablago läuft als Benutzer 1026 (aus PUID/PGID in der Compose-Datei) und Gruppe 100 (Vorgabe, weil kein eigener Datenordner eingebunden ist).',
    );
    assert.equal(
      aenderungText({ zeit: '', art: 'besitzer-root', ordner: '/data/files', anzahl: 3, nach: '1000:1000' }, t.frei),
      'Geändert: 3 Einträge in „files“ gehörten root und gehören jetzt 1000:1000.',
    );
  });

  it('Vorschlag für PUID/PGID nie 0 und nie die Werkzeuge', () => {
    assert.deepEqual(kennungVorschlag('1026:100'), { puid: 1026, pgid: 100 });
    for (const w of ['0:100', '1026:0', '61000:100', '1026:61000', '1026', 'a:b', '', null])
      assert.equal(kennungVorschlag(w), null, String(w));
  });
});

describe('Startseite: Benutzer von Ablago (#1466)', () => {
  const stand = (s: Partial<Startstand> = {}): Startstand => ({
    zustand: 'startet',
    schritt: 'rechte',
    nr: null,
    von: null,
    menge: null,
    seit: Date.parse('2026-11-19T12:00:00Z'),
    fehler: null,
    ...s,
  });
  const seite = (s: Startstand, inhalt: Record<string, string>, extra: Record<string, string> = {}) =>
    startseiteHtml(s, {
      dauer: '1 s',
      neuLadenS: 3,
      komplett: false,
      sprache: 'de',
      kennung: startseitenKennung(
        { DMS_KENNUNG_HERKUNFT: 'vorgabe vorgabe', DMS_KENNUNG_GRUND: 'root', DMS_RECHTE_MERKER: '/m', ...extra },
        (p) => {
          const n = p.replace('/m/', '');
          if (!(n in inhalt)) throw new Error('fehlt');
          return inhalt[n]!;
        },
      ),
    });
  const sek = Date.parse('2026-11-19T12:00:01Z') / 1000;

  it('beim Start: ein Satz, welcher Benutzer und warum, und was dabei geändert wurde – ohne Pfade', () => {
    const html = seite(stand(), {
      aenderungen: `${sek - 3600} besitzer-root /data/files 99 1000:1000\n${sek} besitzer-root /data/files 12 1000:1000\n${sek} rechte /data/files 1 1000:1000\n`,
    });
    assert.match(html, /Vorgabe, weil der Datenordner root gehört/);
    assert.match(html, /Geändert: 12 Einträge in „files“ gehörten root/);
    assert.match(html, /o-rwx/);
    assert.doesNotMatch(html, /99 Einträge/, 'nur Änderungen dieses Starts');
    assert.doesNotMatch(html, /\/data\//, 'keine Pfade vor der Anmeldung');
  });

  it('Schreibprobe gescheitert: gesehene Kennungen und fertige Zeilen (PUID/PGID, chown)', () => {
    const html = seite(stand({ zustand: 'fehler', fehler: { art: 'vorstart', grund: 'daten-rechte' } }), {
      fehler: 'geheim 1027:101 700 0\n',
      vorschlag: '1027:101\n',
    });
    assert.match(html, /Ordner „geheim“: gehört 1027:101 \(Rechte 700\)/);
    assert.match(html, /<pre> {4}environment:\n {6}PUID: &quot;1027&quot;\n {6}PGID: &quot;101&quot;<\/pre>/);
    assert.match(html, /sudo chown -R \d+:\d+ &lt;Ordner auf dem NAS, eingebunden als \/data\/geheim&gt;/);
  });

  it('schreibgeschützt eingebunden: „:ro“ entfernen, kein PUID-Vorschlag', () => {
    const html = seite(stand({ zustand: 'fehler', fehler: { art: 'vorstart', grund: 'daten-rechte' } }), {
      fehler: 'files 1026:100 755 1\n',
    });
    assert.match(html, /schreibgeschützt eingebunden/);
    assert.match(html, /- …:\/data\/files/);
    assert.doesNotMatch(html, /PUID: /);
  });
});
