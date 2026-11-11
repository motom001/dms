/**
 * Befehl `pakete-pruefen` (#1124): Paketordner mit dem echten Installer dieser Ablago-Version prüfen – ohne Datenbank-
 * Server, ohne Netz. Im Image: `docker run --rm -v "$PWD/pakete:/pakete:ro" ghcr.io/motom001/dms:<version> pakete-pruefen
 * /pakete/basis /pakete/vertraege`; im Repo nach `npm run build`: `node server/dist/pakete-pruefen.js <ordner…>`.
 * Exit-Code 0: alles in Ordnung; 1: mindestens ein Paket mit Fehler; 2: Aufruf falsch.
 */
import { writeFileSync } from 'node:fs';
import { protokoll, STUFEN } from './protokoll';
import { alsText, pruefePakete } from './paketpruefung';
import { mitSprache, t } from './sprache';
import { eigeneVersion } from './system';

interface Aufruf { ordner: string[]; version: string; beispiele: boolean; json: boolean; ergebnis: string | null; sprache: string; hilfe: boolean }

/** Argumente zerlegen; wirft bei unbekannten Schaltern (Exit-Code 2). */
function zerlegeAufruf(args: string[], version = eigeneVersion()): Aufruf {
  const a: Aufruf = { ordner: [], version, beispiele: true, json: false, ergebnis: null, sprache: 'de', hilfe: false };
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (x === '--') { a.ordner.push(...args.slice(i + 1)); break; }
    if (!x.startsWith('-')) { a.ordner.push(x); continue; }
    const [k, v] = x.split(/=(.*)/s, 2);
    const wert = () => { const w = v ?? args[++i]; if (w === undefined) throw new Error(t('meldungen.dms.braucht-einen-wert', { k: k.replace(/^-+/, '') })); return w; };
    if (k === '-h' || k === '--hilfe' || k === '--help') a.hilfe = true;
    else if (k === '--json') a.json = true;
    else if (k === '--ohne-beispiele') a.beispiele = false;
    else if (k === '--ablago') a.version = wert();
    else if (k === '--ergebnis') a.ergebnis = wert();
    else if (k === '--sprache') a.sprache = wert() === 'en' ? 'en' : 'de';
    else throw new Error(t('meldungen.pakete-pruefen.unbekannt', { schalter: k }));
  }
  return a;
}

async function main(args: string[]): Promise<number> {
  // Protokoll des Installers nur auf Wunsch (LOG_LEVEL): Die Ausgabe gehört dem Ergebnis, auch mit --json.
  if (!(STUFEN as readonly string[]).includes(process.env.LOG_LEVEL ?? '')) protokoll.setzeGrundstufe('fatal');
  let a: Aufruf;
  try { a = zerlegeAufruf(args); } catch (e) { process.stderr.write(`${(e as Error).message}\n\n${t('meldungen.pakete-pruefen.hilfe')}\n`); return 2; }
  if (a.hilfe || !a.ordner.length) {
    mitSprache(a.sprache, () => process[a.hilfe ? 'stdout' : 'stderr'].write(`${t('meldungen.pakete-pruefen.hilfe')}\n`));
    return a.hilfe ? 0 : 2;
  }
  const ergebnisse = await pruefePakete(a.ordner, { version: a.version, beispiele: a.beispiele, sprache: a.sprache });
  const ok = ergebnisse.every((e) => e.ok);
  const json = `${JSON.stringify({ ablago: a.version, ok, pakete: ergebnisse }, null, 2)}\n`;
  // Zusätzlich als Datei (z. B. für Anmerkungen in der CI), die Ausgabe bleibt Text.
  if (a.ergebnis) writeFileSync(a.ergebnis, json);
  if (a.json) process.stdout.write(json);
  else process.stdout.write(`${mitSprache(a.sprache, () => `${t('meldungen.pakete-pruefen.kopf', { version: a.version })}\n\n${alsText(ergebnisse)}`)}\n`);
  return ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => { process.stdout.write('', () => process.exit(code)); },
  (e: unknown) => { process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`); process.exit(1); },
);
