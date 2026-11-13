import './tokens.css';
import './basis.css';
import './styles.css';
import './startbild.css';
import { browserSprache, gemerkteSprache, ladeSprache, t } from './sprache';
import { antwortet, antwortGekommen, holeMitGrenze, startbildSpracheSetzen, zeigeKeineAntwort } from './startbild';
import { beobachteVeraltet, selbstNeuLaden } from './veraltet';

// Startbild (#1198): steht schon in index.html – hier nur die Sprache, in der es spricht.
startbildSpracheSetzen(gemerkteSprache() ?? browserSprache());

// Fehlende Dateien der Oberfläche (#933) schon vor dem ersten Bild erkennen – auch der Start selbst wird nachgeladen.
beobachteVeraltet();

/**
 * Start der Oberfläche. Zuerst die Sprache (#729): Der Server nennt die der angemeldeten Person, sonst die mitgeschickte
 * (zuletzt benutzte bzw. die des Browsers), sonst die der Installation. Erst danach kommen die übrigen Module – viele
 * bilden ihre Texte schon beim Laden. Höchstens START_WARTEN_MS (#1198); null, wenn der Server nicht (rechtzeitig) antwortet.
 */
async function sprachwahl(): Promise<string | null> {
  const vorschlag = gemerkteSprache() ?? browserSprache();
  try {
    const r = await holeMitGrenze('/api/sprache', { credentials: 'same-origin', cache: 'no-store', headers: { 'x-dms': '1', ...(vorschlag ? { 'x-sprache': vorschlag } : {}) } });
    if (r.ok) return ((await r.json()) as { sprache: string }).sprache;
  } catch { /* Server nicht erreichbar oder zu langsam: weiter mit dem Gemerkten */ }
  return null;
}

async function starte() {
  const gewaehlt = await sprachwahl();
  await ladeSprache(gewaehlt ?? gemerkteSprache() ?? 'de').catch(() => {});
  // Keine Antwort (#1198): Antwortet auch die Gesundheitsprüfung nicht, eine Meldung ohne React statt einer leeren Seite.
  if (gewaehlt === null && !(await antwortet())) {
    const wurzel = document.getElementById('root');
    if (wurzel) zeigeKeineAntwort(wurzel);
    return;
  }
  antwortGekommen();
  // Fehlt der Teil „start“, gehört diese Seite zu einem älteren Stand (#933): einmal selbst neu laden, sonst ein Satz
  // statt einer leeren Seite.
  const start = await import('./start').catch(() => undefined);
  if (start?.zeige) { start.zeige(); return; }
  if (selbstNeuLaden()) return;
  const wurzel = document.getElementById('root');
  if (wurzel) wurzel.textContent = t('oberflaeche.veraltet.nicht-geladen');
}
void starte();
