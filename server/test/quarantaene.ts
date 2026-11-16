/**
 * Quarantäne für wackelnde Tests (#900). In `quarantaene.json` stehen Tests mit Name, Issue und Fälligkeit. Sie laufen
 * weiter; schlagen sie fehl, bricht das die CI nicht ab, ihr Ergebnis steht aber in der Zusammenfassung des Laufs.
 * Ist die Fälligkeit überschritten, scheitert die CI – dann ist der Test behoben (Eintrag raus) oder bewusst verlängert.
 *
 * Aufruf in der CI nach `npm test … | tee test.log`:
 *   node --import tsx server/test/quarantaene.ts test.log <Exit-Code von npm test>
 * Ausgewertet wird das TAP-Protokoll: Ein Fehlschlag zählt, wenn er „unten“ im Baum liegt (keine fehlgeschlagenen
 * Untertests); Abschnitte darüber scheitern nur mit. In Quarantäne ist er, wenn er selbst oder ein Abschnitt darüber
 * auf der Liste steht.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface QuarantaeneEintrag {
  /** Name des Tests (oder eines Abschnitts: dann alle Tests darin), genau wie in `it(…)`/`describe(…)`. */
  name: string;
  /** Testdatei in server/test/, z. B. `hintergrund.test.ts`. */
  datei: string;
  /** Issue, in dem der Wackler behoben wird. */
  issue: number;
  /** Bis wann (JJJJ-MM-TT); danach scheitert die CI. */
  faellig: string;
  /** Kurz: warum er wackelt. */
  grund: string;
}

export interface TapErgebnis {
  name: string;
  ok: boolean;
  kinder: TapErgebnis[];
}

const ZEILE = /^( *)(not ok|ok) \d+(?: - (.*))?$/;

/** Ergebnisbaum aus dem TAP-Protokoll von `node --test --test-reporter=tap` (Untertests stehen vor ihrem Abschnitt). */
export function liesTap(text: string): TapErgebnis[] {
  const offen = new Map<number, TapErgebnis[]>();
  for (const zeile of text.split('\n')) {
    const m = ZEILE.exec(zeile.replace(/\r$/, ''));
    if (!m) continue;
    const ebene = Math.floor(m[1].length / 4);
    const name = (m[3] ?? '')
      .replace(/ (?<!\\)# (SKIP|TODO)\b.*$/i, '')
      .replace(/\\#/g, '#')
      .replace(/\\\\/g, '\\')
      .trim();
    const knoten: TapErgebnis = { name, ok: m[2] === 'ok', kinder: offen.get(ebene + 1) ?? [] };
    offen.delete(ebene + 1);
    offen.set(ebene, [...(offen.get(ebene) ?? []), knoten]);
  }
  return offen.get(0) ?? [];
}

export interface Auswertung {
  /** Fehlschläge außerhalb der Quarantäne (Pfad im Baum, mit „ › “ verbunden). */
  echt: string[];
  /** Je Eintrag: bestanden, fehlgeschlagen oder nicht gefunden; dazu überfällig ja/nein. */
  quarantaene: Array<QuarantaeneEintrag & { ergebnis: 'bestanden' | 'fehlgeschlagen' | 'nicht gefunden'; ueberfaellig: boolean }>;
  /** CI scheitert? */
  scheitert: boolean;
}

export function werteAus(baum: TapErgebnis[], liste: QuarantaeneEintrag[], heute: string, exitCode = 0): Auswertung {
  const echt: string[] = [];
  const gefunden = new Map<string, boolean>(); // Name → alles bestanden
  const gehe = (k: TapErgebnis, pfad: string[], inQuarantaene: string | null) => {
    const eigen = liste.find((e) => e.name === k.name)?.name ?? null;
    if (eigen) gefunden.set(eigen, (gefunden.get(eigen) ?? true) && k.ok);
    const q = inQuarantaene ?? eigen;
    const weg = [...pfad, k.name];
    if (!k.ok && !k.kinder.some((x) => !x.ok)) {
      if (q) gefunden.set(q, false);
      else echt.push(weg.join(' › '));
    }
    for (const x of k.kinder) gehe(x, weg, q);
  };
  for (const k of baum) gehe(k, [], null);
  const quarantaene = liste.map((e) => ({
    ...e,
    ergebnis: !gefunden.has(e.name)
      ? ('nicht gefunden' as const)
      : gefunden.get(e.name)
        ? ('bestanden' as const)
        : ('fehlgeschlagen' as const),
    ueberfaellig: heute > e.faellig,
  }));
  // Scheiterte der Lauf, ohne dass ein Fehlschlag im Protokoll steht (Absturz, Abbruch), zählt das als echter Fehler.
  if (exitCode !== 0 && !echt.length && !quarantaene.some((q) => q.ergebnis === 'fehlgeschlagen'))
    echt.push(`Testlauf mit Exit-Code ${exitCode} beendet, ohne Fehlschlag im Protokoll`);
  return { echt, quarantaene, scheitert: echt.length > 0 || quarantaene.some((q) => q.ueberfaellig) };
}

/** Zusammenfassung als Markdown (GitHub: Zusammenfassung des Laufs). */
export function zusammenfassung(a: Auswertung): string {
  const z: string[] = ['### Tests in Quarantäne (#900)', ''];
  if (!a.quarantaene.length) z.push('Keine Tests in Quarantäne.');
  else {
    z.push('| Test | Datei | Issue | fällig | Ergebnis |', '|---|---|---|---|---|');
    for (const q of a.quarantaene)
      z.push(
        `| ${q.name.replace(/[\\|]/g, (x) => `\\${x}`)} | ${q.datei} | #${q.issue} | ${q.faellig}${q.ueberfaellig ? ' **überfällig**' : ''} | ${q.ergebnis} |`,
      );
  }
  if (a.echt.length)
    z.push('', `**${a.echt.length} Fehlschlag/Fehlschläge außerhalb der Quarantäne:**`, '', ...a.echt.map((e) => `- ${e}`));
  return `${z.join('\n')}\n`;
}

export function liesListe(datei = new URL('./quarantaene.json', import.meta.url)): QuarantaeneEintrag[] {
  return (JSON.parse(readFileSync(datei, 'utf8')) as { tests: QuarantaeneEintrag[] }).tests;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [log, code] = process.argv.slice(2);
  const a = werteAus(liesTap(readFileSync(log, 'utf8')), liesListe(), new Date().toISOString().slice(0, 10), Number(code ?? 0));
  const text = zusammenfassung(a);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  for (const q of a.quarantaene) {
    if (q.ueberfaellig)
      console.log(
        `::error title=Quarantäne überfällig::„${q.name}“ (${q.datei}, #${q.issue}) steht seit ${q.faellig} zu lange in der Quarantäne – beheben oder die Fälligkeit bewusst verlängern (server/test/quarantaene.json).`,
      );
    else if (q.ergebnis === 'fehlgeschlagen')
      console.log(`::warning title=Quarantäne::„${q.name}“ (${q.datei}, #${q.issue}) ist fehlgeschlagen – zählt bis ${q.faellig} nicht.`);
    else if (q.ergebnis === 'nicht gefunden')
      console.log(`::warning title=Quarantäne::„${q.name}“ (${q.datei}) kam im Lauf nicht vor – Name geändert oder Eintrag überflüssig?`);
  }
  process.exit(a.scheitert ? 1 : 0);
}
