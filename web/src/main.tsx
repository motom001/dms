import './tokens.css';
import './basis.css';
import './styles.css';
import { browserSprache, gemerkteSprache, ladeSprache, t } from './sprache';
import { beobachteVeraltet, selbstNeuLaden } from './veraltet';

// Fehlende Dateien der Oberfläche (#933) schon vor dem ersten Bild erkennen – auch der Start selbst wird nachgeladen.
beobachteVeraltet();

/**
 * Start der Oberfläche. Zuerst die Sprache (#729): Der Server nennt die der angemeldeten Person, sonst die mitgeschickte
 * (zuletzt benutzte bzw. die des Browsers), sonst die der Installation. Erst danach kommen die übrigen Module – viele
 * bilden ihre Texte schon beim Laden.
 */
async function sprachwahl(): Promise<string> {
  const vorschlag = gemerkteSprache() ?? browserSprache();
  try {
    const r = await fetch('/api/sprache', { credentials: 'same-origin', cache: 'no-store', headers: { 'x-dms': '1', ...(vorschlag ? { 'x-sprache': vorschlag } : {}) } });
    if (r.ok) return ((await r.json()) as { sprache: string }).sprache;
  } catch { /* Server nicht erreichbar: weiter mit dem Gemerkten */ }
  return gemerkteSprache() ?? 'de';
}

async function starte() {
  await ladeSprache(await sprachwahl()).catch(() => {});
  // Fehlt der Teil „start“, gehört diese Seite zu einem älteren Stand (#933): einmal selbst neu laden, sonst ein Satz
  // statt einer leeren Seite.
  const start = await import('./start').catch(() => undefined);
  if (start?.zeige) { start.zeige(); return; }
  if (selbstNeuLaden()) return;
  const wurzel = document.getElementById('root');
  if (wurzel) wurzel.textContent = t('oberflaeche.veraltet.nicht-geladen');
}
void starte();
