/**
 * Abhängigkeiten zwischen den Teilen von Ablago (#899), geprüft mit dependency-cruiser: `npm run lint:abh`.
 *
 * - Keine Kreisläufe (nur Importe, die zur Laufzeit zählen; reine Typ-Importe nicht).
 * - shared/ bindet weder server/ noch web/ ein; web/ nie server/, server/ nie web/. Ausnahme: server/test/.
 * - Technische Ordner mit index.ts nur über index.ts (pdf/ und arbeit/, je mit eigener Ausnahme).
 * - Hilfen der HTTP-Schicht (http/routen-hilfen.ts, http/routen-kontext.ts) nur in Routen (#961, Ergänzung von
 *   Sicherheit): Fachlogik bekommt den Benutzer übergeben und liest ihn nicht selbst aus der Anfrage.
 * - Eine Regel für alle Fachordner (#1072, `fachordner`; vorher je Ordner zwei, #961/#964): von außen nur über ihre
 *   index.ts, Schichten nur abwärts (SCHICHTEN unten). Routen (*.routen.ts) gehören zur HTTP-Schicht: routen.ts holt
 *   sie direkt, und sie dürfen den Dienst und ihren eigenen Fachordner einbinden.
 *
 * Bestand: .dependency-cruiser-known-violations.json (wie eslint-suppressions.json: die Zahl darf nie steigen,
 * .github/werkzeuge/ausnahmen-zaehlen.mjs). Das Abhängigkeitsbild fürs Entwicklerhandbuch: `npm run abhaengigkeitsbild`.
 */
/**
 * Basis, auf der der Kern aufsetzt (#961): Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler,
 * Fehler, Grenzen, Sperre für Geheimnisse (#1055). Diese Module binden selbst keinen Dienst und keinen Fachbereich ein.
 */
const BASIS = 'repo|db|protokoll|sprache|einstellungen|dateispeicher|zaehlerspeicher|lesespeicher|kurzzustand|fehler|grenzen|geheimnis-sperre';
/**
 * Was Fachordner außer Kern und BASIS einbinden dürfen (#1072): Messung der Rechteprüfung, Vektoren lesen (auch der
 * Paket-Läufer braucht sie, daher nicht in suche/) und die technischen Ordner PDF-Stelle und Arbeiter-Pool. Seit #1075
 * die Technik der Dateien, die Dokumente brauchen: Hochladen, Verkleinern, Fassungen (Umwandeln, Archivfassung,
 * Entsperren) und Volltext aus Paketen – sie binden selbst nur die Basis, hintergrund.ts und die PDF-Stelle ein.
 */
const WERKZEUGE = {
  dateien: 'messung|vektoren|hochladen|verkleinern|dateiumwandlung|archivfassung|entsperren|paketvolltext',
  ordner: 'pdf|arbeit',
};

/**
 * Schichten der Fachordner unter server/src/ (#1072, Zielaufteilung): Aufrufe nur abwärts, in derselben Schicht
 * erlaubt (Kreisläufe verbietet `kein-kreislauf`). Jeder Ordner, der hier nicht steht und nicht technisch ist
 * (TECHNIK), gehört zu Schicht 3 – auch einer, den es noch nicht gibt. Ein Ordner wechselt die Schicht nur hier.
 */
const SCHICHTEN = [
  ['kern'], // 0: Repo, Transaktion, Ereignisse, Historie und Löschprotokoll schreiben (#961)
  ['zugriff'], // 1: Rechte prüfen (#1072)
  // 2; berechtigungen (#1076) braucht nur Kern und Rechteprüfung, und die Mappentypen prüfen damit ihre Regeln
  ['mappentypen', 'mappen', 'dokumente', 'berechtigungen'],
  // 3: alle übrigen Fachordner (sichten und volltext über Mappen und Dokumenten, #1076; suche, pdf-Fachlogik,
  // ausgang, aufgaben, post …)
];
/** Ordner ohne Fachlogik: HTTP-Hilfen, PDF-Stelle, Arbeiter-Pool, Paket-Läufer. Für sie gilt `fachordner` nicht. */
const TECHNIK = ['http', 'pdf', 'arbeit', 'laeufer'];

/**
 * Die Regel `fachordner` (#1072) – einmal beschrieben, für jeden Fachordner. dependency-cruiser kann Schichten nicht
 * vergleichen, daher eine Prüfung „nur über index.ts“ und je Schicht eine Prüfung „nur abwärts“, alle unter dem Namen
 * `fachordner`. Der Kern (Schicht 0) bindet nur sich selbst, shared/ und die BASIS ein, keine WERKZEUGE.
 */
function fachordner() {
  const name = 'fachordner';
  const genannt = SCHICHTEN.flat();
  const nichtFach = [...TECHNIK, ...genannt].join('|');
  const regeln = [{
    name,
    severity: 'error',
    comment: 'Einen Fachordner nur über seine index.ts einbinden (#1072). Ausnahme: Routen (*.routen.ts), die routen.ts sammelt.',
    // $1: Ordner der importierenden Datei (für Dateien außerhalb von Ordnern ihr Name, für Tests „server“ usw.).
    from: { path: '^(?:server/src/)?([^/]+)' },
    to: {
      path: `^server/src/(?!(?:${TECHNIK.join('|')})/)[^/]+/(?!index\\.ts$)`,
      pathNot: ['^server/src/$1/', '\\.routen\\.ts$'],
    },
  }];
  for (let i = 0; i <= SCHICHTEN.length; i++) {
    const hier = i < SCHICHTEN.length ? `^server/src/(${SCHICHTEN[i].join('|')})/` : `^server/src/(?!(?:${nichtFach})/)[^/]+/`;
    const erlaubt = i === 0
      ? ['^server/src/kern/', `^server/src/(${BASIS})\\.ts$`]
      : [
        i < SCHICHTEN.length ? `^server/src/(${SCHICHTEN.slice(0, i + 1).flat().join('|')})/` : `^server/src/(?!(?:${TECHNIK.join('|')})/)[^/]+/`,
        `^server/src/(${WERKZEUGE.ordner})/`,
        `^server/src/(${BASIS}|${WERKZEUGE.dateien})\\.ts$`,
      ];
    regeln.push({
      name,
      severity: 'error',
      comment: i === 0
        ? 'Der Kern ruft keinen Fachbereich auf (#961): nur sich selbst, shared/ und die Basis – nie dienst.ts, Routen oder Fachordner.'
        : `Schicht ${i} ruft nur nach unten (#1072): Fachordner bis Schicht ${i}, Kern, shared/, Basis und Werkzeuge – nie dienst.ts oder Dateien darüber. Routen (*.routen.ts) sind ausgenommen.`,
      from: { path: hier, pathNot: '\\.routen\\.ts$' },
      to: { path: '^server/src/', pathNot: erlaubt },
    });
  }
  return regeln;
}

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
      name: 'routen-hilfen-nur-in-routen',
      severity: 'error',
      comment: 'http/routen-hilfen.ts und http/routen-kontext.ts nur aus *.routen.ts und routen.ts (#961): Fachlogik nutzt keine Hilfen der HTTP-Schicht (etwa ich(a)), sondern bekommt den Benutzer übergeben.',
      from: { path: '^(server|shared|web)/', pathNot: ['\\.routen\\.ts$', '^server/src/routen\\.ts$', '^server/src/http/routen-(hilfen|kontext)\\.ts$'] },
      to: { path: '^server/src/http/routen-(hilfen|kontext)\\.ts$' },
    },
    ...fachordner(),
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
