#!/usr/bin/env node
/**
 * Versionsnummer erst beim Merge (#952).
 *
 * Ein Pull Request bringt statt einer Versionsnummer einen Notizschnipsel `docs/releases/neu/<name>.md` mit:
 *
 *   art: minor          ← patch, minor oder keine
 *
 *   ## Neu
 *   - **Etwas Neues** (#123): …
 *
 * - `node version.mjs pruefen <basis-sha>` (CI im Pull Request): Ändert der PR das Programm, braucht er genau
 *   einen Schnipsel mit gültiger Kopfzeile. Die alte Art (Version in package.json + docs/releases/vX.Y.Z.md) gilt
 *   im Übergang noch, mit Warnung.
 * - `node version.mjs vergeben` (Workflow „Version vergeben“ auf main): nächste Nummer aus der höchsten `art`,
 *   drei package.json und package-lock.json (#1272), Schnipsel zusammengefasst nach docs/releases/vX.Y.Z.md, Schnipsel gelöscht. Schreibt
 *   `version=` und `schnipsel=` nach $GITHUB_OUTPUT (bzw. stdout); ohne Schnipsel mit Programm-Art passiert nichts.
 *
 * Ohne Abhängigkeiten, damit es vor `npm ci` läuft.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ORDNER = 'docs/releases/neu';
export const PAKETE = ['package.json', 'server/package.json', 'web/package.json'];
/** Einträge im Lockfile, die die Version der eigenen Pakete tragen (Wurzel und Arbeitsbereiche, #1272). */
export const LOCK_EINTRAEGE = ['', 'server', 'web'];
const ARTEN = ['keine', 'patch', 'minor'];
/** Name eines Schnipsels: klein, ohne Pfad; README.md erklärt den Ordner und zählt nicht. */
const NAME = /^[a-z0-9][a-z0-9._-]{0,80}\.md$/;
/** Reihenfolge der Abschnitte in den Release-Notizen; Unbekannte folgen in der Reihenfolge ihres Auftretens. */
const ABSCHNITTE = ['Sicherheit', 'Neu', 'Geändert', 'Behoben', 'Entfernt'];

/** Kopfzeile und Text eines Schnipsels. Wirft mit verständlicher Meldung. */
export function liesSchnipsel(name, text) {
  if (!NAME.test(name)) throw new Error(`${ORDNER}/${name}: Dateiname nur aus a–z, 0–9, Punkt, Bindestrich, Unterstrich, Endung .md`);
  const zeilen = text.replace(/\r\n/g, '\n').split('\n');
  const kopf = /^art:\s*([a-z]+)\s*$/.exec(zeilen[0] ?? '');
  if (!kopf || !ARTEN.includes(kopf[1]))
    throw new Error(`${ORDNER}/${name}: erste Zeile muss „art: patch“, „art: minor“ oder „art: keine“ sein`);
  const inhalt = zeilen.slice(1).join('\n').trim();
  if (kopf[1] !== 'keine' && !inhalt) throw new Error(`${ORDNER}/${name}: Release-Notizen fehlen (unter der Kopfzeile)`);
  return { name, art: kopf[1], inhalt };
}

/** Nächste Version: minor → x.(y+1).0, patch → x.y.(z+1); `belegt` (Tags/Dateien) werden übersprungen. */
export function naechsteVersion(jetzt, art, belegt = () => false) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(jetzt);
  if (!m) throw new Error(`package.json: Version „${jetzt}“ ist nicht X.Y.Z`);
  let [x, y, z] = m.slice(1).map(Number);
  if (art === 'minor') {
    y += 1;
    z = 0;
  } else z += 1;
  let v = `${x}.${y}.${z}`;
  while (belegt(v)) {
    z += 1;
    v = `${x}.${y}.${z}`;
  }
  return v;
}

/** Fasst die Schnipsel zu Release-Notizen zusammen: gleiche Überschriften (## …) zusammen, feste Reihenfolge. */
export function zusammenfassen(schnipsel) {
  const teile = new Map();
  for (const s of schnipsel) {
    if (s.art === 'keine') continue;
    let ueber = 'Geändert';
    for (const zeile of s.inhalt.split('\n')) {
      const h = /^##\s+(.+?)\s*$/.exec(zeile);
      if (h) {
        ueber = h[1];
        continue;
      }
      if (!teile.has(ueber)) teile.set(ueber, []);
      teile.get(ueber).push(zeile);
    }
  }
  const reihe = [...ABSCHNITTE.filter((a) => teile.has(a)), ...[...teile.keys()].filter((a) => !ABSCHNITTE.includes(a))];
  return (
    reihe
      .map(
        (a) =>
          `## ${a}\n\n${teile
            .get(a)
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()}`,
      )
      .filter((x) => !/^## .+\n\n$/.test(x))
      .join('\n\n') + '\n'
  );
}

/** Setzt die Version in einer package.json, ohne sonst etwas am Text zu ändern. */
export function setzeVersion(text, version) {
  let ersetzt = false;
  const neu = text.replace(/("version"\s*:\s*")[^"]*(")/, (_, a, b) => {
    ersetzt = true;
    return `${a}${version}${b}`;
  });
  if (!ersetzt) throw new Error('package.json ohne "version"');
  return neu;
}

/**
 * Setzt die Version im Lockfile (oben, Wurzel und Arbeitsbereiche) wie npm es schreibt (#1272): Sonst ändert das
 * nächste `npm install` die Datei, ohne dass jemand etwas getan hat.
 */
export function setzeLockVersion(text, version) {
  const lock = JSON.parse(text);
  lock.version = version;
  for (const e of LOCK_EINTRAEGE) if (lock.packages?.[e]) lock.packages[e].version = version;
  return `${JSON.stringify(lock, null, 2)}\n`;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const ausgabe = (k, v) => (process.env.GITHUB_OUTPUT ? appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) : console.log(`${k}=${v}`));
const fehler = (t) => {
  console.log(`::error title=Release-Notiz (#952)::${t}`);
  process.exitCode = 1;
};

/** Gehört die Datei zum ausgelieferten Programm? Dann braucht der PR eine Release-Notiz. */
export function istProgramm(pfad) {
  if (/^(server|web|shared)\/(test|tests|e2e)\//.test(pfad) || /\.test\.[cm]?[jt]sx?$/.test(pfad)) return false;
  return /^(server|web|shared)\//.test(pfad) || pfad === 'Dockerfile' || /^docker\//.test(pfad);
}

function pruefen(basis) {
  if (!basis) return fehler('Aufruf: version.mjs pruefen <basis-sha>');
  const geaendert = git('diff', '--name-status', '--no-renames', basis, 'HEAD')
    .split('\n')
    .filter(Boolean)
    .map((z) => z.split('\t'));
  const programm = geaendert.filter(([s, p]) => s !== 'D' && istProgramm(p)).map(([, p]) => p);
  const neu = geaendert.filter(([s, p]) => s !== 'D' && p.startsWith(`${ORDNER}/`) && !p.endsWith('/README.md')).map(([, p]) => p);
  const alteArt = geaendert.some(([s, p]) => s === 'A' && /^docs\/releases\/v\d+\.\d+\.\d+\.md$/.test(p));
  for (const p of neu) {
    try {
      liesSchnipsel(p.slice(ORDNER.length + 1), readFileSync(p, 'utf8'));
    } catch (e) {
      fehler(e.message);
    }
  }
  if (neu.length > 1) fehler(`Ein Pull Request bringt genau einen Schnipsel mit, hier ${neu.length}: ${neu.join(', ')}`);
  if (alteArt && neu.length)
    fehler('Bitte entweder einen Schnipsel in docs/releases/neu/ oder (im Übergang) die alte Art mit Versionsnummer – nicht beides.');
  else if (alteArt)
    console.log(
      '::warning title=Release-Notiz (#952)::Alte Art (Versionsnummer im PR). Im Übergang noch erlaubt; bitte künftig einen Schnipsel in docs/releases/neu/ anlegen (Entwicklerhandbuch → Release).',
    );
  else if (programm.length && !neu.length)
    fehler(
      `Der Pull Request ändert das Programm (${programm.slice(0, 3).join(', ')}${programm.length > 3 ? ' …' : ''}), aber ohne Release-Notiz. Bitte docs/releases/neu/<name>.md mit „art: patch“, „art: minor“ oder „art: keine“ anlegen.`,
    );
  if (!process.exitCode) console.log(neu.length ? `Release-Notiz: ${neu[0]}` : 'Keine Release-Notiz nötig.');
}

function vergeben() {
  const namen = existsSync(ORDNER)
    ? readdirSync(ORDNER)
        .filter((n) => n.endsWith('.md') && n !== 'README.md')
        .sort()
    : [];
  const schnipsel = namen.map((n) => liesSchnipsel(n, readFileSync(join(ORDNER, n), 'utf8')));
  const art = schnipsel.reduce((a, s) => (ARTEN.indexOf(s.art) > ARTEN.indexOf(a) ? s.art : a), 'keine');
  if (art === 'keine') {
    console.log(schnipsel.length ? 'Nur Schnipsel mit „art: keine“ – kein Release.' : 'Keine Schnipsel – nichts zu tun.');
    return;
  }
  const jetzt = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const tags = new Set(git('tag', '--list', 'v*').split('\n').filter(Boolean));
  const version = naechsteVersion(jetzt, art, (v) => tags.has(`v${v}`) || existsSync(`docs/releases/v${v}.md`));
  for (const p of PAKETE) writeFileSync(p, setzeVersion(readFileSync(p, 'utf8'), version));
  if (existsSync('package-lock.json'))
    writeFileSync('package-lock.json', setzeLockVersion(readFileSync('package-lock.json', 'utf8'), version));
  writeFileSync(`docs/releases/v${version}.md`, zusammenfassen(schnipsel));
  for (const n of namen) unlinkSync(join(ORDNER, n));
  console.log(`Version ${jetzt} → ${version} (${art}) aus ${namen.join(', ')}`);
  ausgabe('version', version);
  ausgabe('schnipsel', namen.join(' '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [befehl, arg] = process.argv.slice(2);
  try {
    if (befehl === 'pruefen') pruefen(arg);
    else if (befehl === 'vergeben') vergeben();
    else fehler('Aufruf: version.mjs pruefen <basis-sha> | vergeben');
  } catch (e) {
    fehler(e.message);
  }
}
