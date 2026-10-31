/**
 * Prüft die kontextbezogene Hilfe (#110) gegen das gebaute Handbuch: Jede Seite und jeder Anker
 * aus shared/src/hilfe.ts muss existieren. Eine umbenannte Überschrift fällt so in der CI auf.
 *
 *   npx tsx docs/handbuch/werkzeuge/hilfe-pruefen.ts <site>     (<site>/admin, <site>/benutzer)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HILFE, type Handbuch } from '../../../shared/src/hilfe';

const site = process.argv[2] ?? 'site';
/** Seiten, auf die die Oberfläche ohne Anker verlinkt (Hilfe-Menü, Technik, Sicherung). */
const SEITEN: Array<[Handbuch, string]> = [['benutzer', ''], ['admin', ''], ['admin', 'technik/'], ['admin', 'sicherung/'], ['admin', 'neu/'], ['benutzer', 'neu/']];

const fehler: string[] = [];
const seite = (h: Handbuch, s: string) => {
  const p = join(site, h, s, 'index.html');
  if (!existsSync(p)) { fehler.push(`${h}/${s}: Seite fehlt (${p})`); return null; }
  return readFileSync(p, 'utf8');
};
for (const [h, s] of SEITEN) seite(h, s);
for (const [ort, z] of Object.entries(HILFE)) {
  const html = seite(z.handbuch, z.seite);
  if (html && 'anker' in z && z.anker && !new RegExp(`id=["']?${z.anker.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}["'\\s>]`).test(html)) {
    fehler.push(`${ort}: Anker #${z.anker} fehlt auf ${z.handbuch}/${z.seite}`);
  }
}
if (fehler.length) {
  for (const f of fehler) console.error(`::error title=Hilfe-Link::${f}`);
  process.exit(1);
}
console.log(`Hilfe-Links in Ordnung: ${Object.keys(HILFE).length} Stellen, ${SEITEN.length} Seiten.`);
