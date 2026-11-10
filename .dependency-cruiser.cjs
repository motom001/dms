/**
 * Abhängigkeiten zwischen den Teilen von Ablago (#899), geprüft mit dependency-cruiser: `npm run lint:abh`.
 *
 * - Keine Kreisläufe (nur Importe, die zur Laufzeit zählen; reine Typ-Importe nicht).
 * - shared/ bindet weder server/ noch web/ ein; web/ nie server/, server/ nie web/. Ausnahme: server/test/.
 * - Ordner mit index.ts nur über index.ts (heute pdf/ und arbeit/).
 * - Schichten „nur abwärts“: vorbereitet, aktiv mit dem Kern (#961) – siehe unten.
 *
 * Bestand: .dependency-cruiser-known-violations.json (wie eslint-suppressions.json: die Zahl darf nie steigen,
 * .github/werkzeuge/ausnahmen-zaehlen.mjs). Das Abhängigkeitsbild fürs Entwicklerhandbuch: `npm run abhaengigkeitsbild`.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'kein-kreislauf',
      severity: 'error',
      comment: 'Kreisläufe machen die Reihenfolge beim Laden zufällig und verhindern, dass sich Teile getrennt ändern lassen.',
      from: { pathNot: '^server/test/' },
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'shared-ohne-server-und-web',
      severity: 'error',
      comment: 'Gemeinsamer Code läuft in Server und Browser – er darf von keinem der beiden abhängen.',
      from: { path: '^shared/' },
      to: { path: '^(server|web)/' },
    },
    {
      name: 'web-ohne-server',
      severity: 'error',
      comment: 'Die Oberfläche spricht mit dem Server nur über die API; Gemeinsames liegt in shared/.',
      from: { path: '^web/' },
      to: { path: '^server/' },
    },
    {
      name: 'server-ohne-web',
      severity: 'error',
      comment: 'Der Server bindet keinen Code der Oberfläche ein (Tests unter server/test/ dürfen es).',
      from: { path: '^server/', pathNot: '^server/test/' },
      to: { path: '^web/' },
    },
    {
      name: 'pdf-nur-ueber-index',
      severity: 'error',
      comment: 'Die PDF-Stelle (#541) nur über pdf/index.ts. Ausnahme: arbeit/vorgaenge.ts führt die Vorgänge im Arbeiter-Faden aus (#542).',
      from: { path: '^server/src/', pathNot: ['^server/src/pdf/', '^server/src/arbeit/vorgaenge\\.ts$'] },
      to: { path: '^server/src/pdf/(?!index\\.ts$)' },
    },
    {
      name: 'arbeit-nur-ueber-index',
      severity: 'error',
      comment: 'Arbeiter-Pool (#542) nur über arbeit/index.ts.',
      from: { path: '^server/src/', pathNot: '^server/src/arbeit/' },
      to: { path: '^server/src/arbeit/(?!index\\.ts$)' },
    },
    // Vorbereitet für den Kern (#961), aktiv, sobald es server/src/kern/ und die Fachordner gibt. Dann die Liste der
    // Fachordner in FACH eintragen (z. B. 'suche|ablage|werkbank') und die beiden Regeln einkommentieren.
    // {
    //   name: 'kern-nur-abwaerts',
    //   severity: 'error',
    //   comment: 'Der Kern ruft keinen Fachbereich auf; Fachbereiche rufen nur nach unten (in den Kern).',
    //   from: { path: '^server/src/kern/' },
    //   to: { path: `^server/src/(${FACH})/` },
    // },
    // {
    //   name: 'fach-nur-ueber-index',
    //   severity: 'error',
    //   comment: 'Ein Fachbereich nutzt einen anderen nur über dessen index.ts.',
    //   from: { path: `^server/src/(${FACH})/` },
    //   to: { path: `^server/src/(${FACH})/(?!index\\.ts$)`, pathNot: '^server/src/$1/' },
    // },
  ],
  options: {
    includeOnly: '^(server/(src|test)|web/src|shared/src)/',
    exclude: { path: 'node_modules' },
    doNotFollow: { path: 'node_modules' },
    // Auch reine Typ-Importe sehen (für die Richtungsregeln); bei Kreisläufen zählen sie nicht (oben).
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      // Abhängigkeitsbild auf Ordner-Ebene (siehe .github/werkzeuge/abhaengigkeitsbild.mjs).
      mermaid: { minify: false },
    },
  },
};
