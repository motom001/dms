/**
 * Abhängigkeiten zwischen den Teilen von Ablago (#899), geprüft mit dependency-cruiser: `npm run lint:abh`.
 *
 * - Keine Kreisläufe (nur Importe, die zur Laufzeit zählen; reine Typ-Importe nicht).
 * - shared/ bindet weder server/ noch web/ ein; web/ nie server/, server/ nie web/. Ausnahme: server/test/.
 * - Ordner mit index.ts nur über index.ts (heute pdf/ und arbeit/).
 * - Schichten „nur abwärts“ (#961): Der Kern (server/src/kern/) bindet nur sich selbst, shared/ und die Basis ein
 *   (BASIS unten) – nie den Dienst, Routen oder Fachordner. Von außen nur über kern/index.ts.
 * - Hilfen der HTTP-Schicht (http/routen-hilfen.ts, http/routen-kontext.ts) nur in Routen (#961, Ergänzung von
 *   Sicherheit): Fachlogik bekommt den Benutzer übergeben und liest ihn nicht selbst aus der Anfrage.
 * - Fachordner mit eigener Fachlogik (#964, Probelauf: suche/) nur über ihre index.ts (Routen holt routen.ts direkt);
 *   sie binden nur sich selbst, den Kern, shared/ und die Basis ein – keinen anderen Fachbereich, nie den Dienst.
 *
 * Bestand: .dependency-cruiser-known-violations.json (wie eslint-suppressions.json: die Zahl darf nie steigen,
 * .github/werkzeuge/ausnahmen-zaehlen.mjs). Das Abhängigkeitsbild fürs Entwicklerhandbuch: `npm run abhaengigkeitsbild`.
 */
/**
 * Basis, auf der der Kern aufsetzt (#961): Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler,
 * Fehler, Grenzen. Diese Module binden selbst keinen Dienst und keinen Fachbereich ein.
 */
const BASIS = 'repo|db|protokoll|sprache|einstellungen|dateispeicher|zaehlerspeicher|lesespeicher|kurzzustand|fehler|grenzen';

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
    {
      name: 'kern-nur-abwaerts',
      severity: 'error',
      comment: 'Der Kern ruft keinen Fachbereich auf (#961): er bindet nur sich selbst, shared/ und die Basis ein – nie dienst.ts, Routen oder Fachordner.',
      from: { path: '^server/src/kern/' },
      to: { path: '^server/src/', pathNot: ['^server/src/kern/', `^server/src/(${BASIS})\\.ts$`] },
    },
    {
      name: 'kern-nur-ueber-index',
      severity: 'error',
      comment: 'Den Kern (#961) nur über kern/index.ts einbinden.',
      from: { path: '^(server|shared|web)/', pathNot: '^server/src/kern/' },
      to: { path: '^server/src/kern/(?!index\\.ts$)' },
    },
    {
      name: 'routen-hilfen-nur-in-routen',
      severity: 'error',
      comment: 'http/routen-hilfen.ts und http/routen-kontext.ts nur aus *.routen.ts und routen.ts (#961): Fachlogik nutzt keine Hilfen der HTTP-Schicht (etwa ich(a)), sondern bekommt den Benutzer übergeben.',
      from: { path: '^(server|shared|web)/', pathNot: ['\\.routen\\.ts$', '^server/src/routen\\.ts$', '^server/src/http/routen-(hilfen|kontext)\\.ts$'] },
      to: { path: '^server/src/http/routen-(hilfen|kontext)\\.ts$' },
    },
    {
      name: 'suche-nur-ueber-index',
      severity: 'error',
      comment: 'Die Suche (#964) nur über suche/index.ts einbinden. Ausnahme: routen.ts sammelt die Routen (suche.routen.ts).',
      from: { path: '^(server|shared|web)/', pathNot: ['^server/src/suche/', '^server/src/routen\\.ts$'] },
      to: { path: '^server/src/suche/(?!index\\.ts$)' },
    },
    {
      name: 'suche-nur-abwaerts',
      severity: 'error',
      comment: 'Die Suche (#964, Schicht 3) ruft nur nach unten: sich selbst, den Kern, shared/, die Basis und vektoren.ts – nie dienst.ts oder einen anderen Fachbereich. Routen (suche.routen.ts) sind ausgenommen.',
      from: { path: '^server/src/suche/', pathNot: '\\.routen\\.ts$' },
      to: { path: '^server/src/', pathNot: ['^server/src/(suche|kern)/', `^server/src/(${BASIS}|vektoren)\\.ts$`] },
    },
    // Später (wenn die Fachbereiche eigene Module mit index.ts haben): ein Fachbereich nutzt einen anderen nur über
    // dessen index.ts. FACH = Liste der Fachordner, z. B. 'mappen|mappentypen|dokumente'.
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
