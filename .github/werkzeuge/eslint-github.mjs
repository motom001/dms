/**
 * ESLint-Ausgabe als Anmerkungen für GitHub Actions (#899): `eslint -f ./.github/werkzeuge/eslint-github.mjs …`.
 * Jede Meldung erscheint im Pull Request an der Zeile (Fehler als error, Warnungen als warning).
 */
const ersetze = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export default function (ergebnisse, kontext) {
  const zeilen = [];
  for (const e of ergebnisse) {
    const datei = e.filePath.startsWith(kontext.cwd) ? e.filePath.slice(kontext.cwd.length + 1) : e.filePath;
    for (const m of e.messages) {
      const art = m.severity === 2 ? 'error' : 'warning';
      zeilen.push(`::${art} file=${datei},line=${m.line ?? 1},col=${m.column ?? 1},title=${m.ruleId ?? 'ESLint'}::${ersetze(m.message)}`);
    }
  }
  return zeilen.join('\n');
}
