/**
 * Abhängigkeiten zwischen den Teilen von Ablago (#899), geprüft mit dependency-cruiser: `npm run lint:abh`.
 *
 * - Keine Kreisläufe (`kein-kreislauf`), auch nicht über reine Typ-Importe (`import type`; shared/src/ und web/src/ seit
 *   #1278 Schritt 5a, server/src/ seit Schritt 5b): Auch ein Kreis nur über Typen verklebt die Teile – keiner lässt sich
 *   ohne den anderen verstehen oder verschieben. Tests sind ausgenommen: Sie binden ein, was sie prüfen, und werden
 *   selbst nicht eingebunden.
 * - shared/ bindet weder server/ noch web/ ein; web/ nie server/, server/ nie web/ (auch server/test/ nicht, #1282).
 *   Ausnahme: shared/test/ prüft Sprachdateien und Gemeinsames über alle Teile hinweg.
 * - Technische Ordner mit index.ts nur über index.ts (pdf/ und arbeit/, je mit eigener Ausnahme; repo/ über seine drei
 *   index.ts, #1278); die Ordner in shared/src/ (Fachmodell model/, erkennung/, pakete/, sichten/) nur über ihre
 *   index.ts, das Fachmodell auch über model/basis.ts (#1278, SHARED_ORDNER).
 * - Teile über dem Dienst (UEBER_DEM_DIENST), Nachbarn eines Fachordners (NACHBARN, #1278) und die Dateien, die aus
 *   server/src/ in ihren Ordner gezogen sind, aber noch keine Tür haben (OHNE_TUER, #1278), sind unten beschrieben.
 * - Hilfen der HTTP-Schicht (http/routen-hilfen.ts, http/routen-kontext.ts) nur in Routen (#961, Ergänzung von
 *   Sicherheit): Fachlogik bekommt den Benutzer übergeben und liest ihn nicht selbst aus der Anfrage.
 * - Eine Regel für alle Fachordner (#1072, `fachordner`; vorher je Ordner zwei, #961/#964): von außen nur über ihre
 *   index.ts, Schichten nur abwärts (SCHICHTEN unten). Routen (*.routen.ts) gehören zur HTTP-Schicht: http/routen.ts holt
 *   sie direkt, und sie dürfen den Dienst und ihren eigenen Fachordner einbinden.
 *
 * Bestand: .dependency-cruiser-known-violations.json (wie eslint-suppressions.json: die Zahl darf nie steigen,
 * .github/werkzeuge/ausnahmen-zaehlen.mjs). Das Abhängigkeitsbild fürs Entwicklerhandbuch: `npm run abhaengigkeitsbild`.
 */
/**
 * Dateien, die bis #1278 (Schritt 4a) direkt in server/src/ lagen und jetzt in ihrem Ordner liegen, aber noch keine Tür
 * haben: je Ordner ihre Namen (ohne .ts). Für die Regeln gelten sie wie vorher eine Datei direkt in server/src/: Jeder
 * darf sie direkt einbinden (`fachordner` prüft für sie nicht „nur über index.ts“), sie selbst binden ein, was sie
 * brauchen (die Schichten prüfen sie nicht), und Fachordner dürfen von ihnen nur, was BASIS, WERKZEUGE, NACHBARN und
 * UEBER_DEM_DIENST nennen – wie vorher. Wer eine Datei hinter die Tür ihres Ordners bringt, nimmt sie hier heraus.
 * Teile einer solchen Datei, die Schritt 4b aufgeteilt hat (dienst/bauteile, webdav/webdav-*, sicherung/sicherung-*,
 * sicherung/wiederherstellung-*, erkennung/erkennung-*, export/vollexport-*), stehen mit ihr hier.
 */
const OHNE_TUER = {
  anmeldung: 'anmeldesperre|zweifaktor|passkeys|oidc|apischluessel|passwort',
  aufgaben: 'aufgabenmail',
  ausgang: 'ausgabe',
  automatisierung: 'automatisierung-aussen|automatisierung-karten|automatisierung-werkbank',
  beispiele: 'beispiele|beispielablage',
  dateien:
    'dateispeicher|hochladen|verkleinern|schwaerzen|dateiumwandlung|archivfassung|entsperren|ersatzschriften|vorschau|pdfanzeige|pdfseiten|graubild|ordner|speicherplatz',
  datenbank: 'db|anbindung|mandant|erweiterungen|sperrverbindung|poolmessung|messung',
  datenschutz: 'abruf|auskunft',
  demo: 'demo|demo-dokumente|demo-text|zufall',
  dienst: 'dienst|bauteile',
  einrichtung: 'einrichtung|einrichtungscode|einrichtungsdatei|einrichtungsmodus|startmodus',
  einstellungen: 'einstellungen|region|betrieb',
  entdecken: 'entdecken|entdecken-werkbank',
  ereignisse: 'ereignisse',
  erkennung: 'erkennung|klassifizierung|erechnung|erkennung-hilfen|erkennung-basis|erkennung-positionen|erkennung-abgleich|erkennung-post',
  export:
    'export|vollexport|vollexport-pruefsummen|exportordner|vollexport-quelle|vollexport-formate|vollexport-schreiben|vollexport-verwaltung|vollexport-lauf|vollexport-tabellen|vollexport-ablage',
  formate: 'xlsx|zip|xml|schriftstueck',
  geheimnisse: 'geheimnisse|geheimnis-sperre|tresor',
  grundlagen: 'fehler|grenzen|uebergaenge',
  http: 'http|routen|koepfe|proxy|ueberlast',
  konten: 'konto-repo',
  lasttest: 'lasttestmodus|speicherart|protokollsammlung|abfragestatistik|prozessgruppen',
  loeschen: 'baum',
  mail: 'mail|mailsuche',
  mappen: 'aufkleber|erwaehnungen',
  notfall: 'notfall|notfallcode|notfallblatt|notfallqr',
  oberflaeche: 'oberflaeche|designs|hilfe',
  pakete: 'katalogsignatur|projektschluessel|lizenztexte|paketpruefung|umwandlung',
  post: 'postfach|postfach-typen|postfach-anhaenge|postfach-oauth|imap|eingangsordner|fotostapel',
  protokoll: 'protokoll|nachweisjournal',
  prozesse: 'prozesse|aufteilung|auftrag|beenden|hintergrund',
  sicherung:
    'sicherung|sicherung-entfernt|sicherungsformat|datenbankabzug|wiederherstellung|sicherung-hilfen|sicherung-basis|sicherung-anlegen|sicherung-extern|wiederherstellung-hilfen|wiederherstellung-basis|wiederherstellung-ausfuehren|wiederherstellung-einspielen',
  sprache: 'sprache|sprachpakete|sprachwahl|uebersetzung',
  suche: 'fragen|vektoren',
  system: 'system|systemlast|externmessung|fehlermeldungen|konsole',
  volltext: 'paketvolltext|texterkennung',
  wartung: 'wartung',
  webdav: 'webdav|webdav-baum|webdav-hilfen|webdav-basis|webdav-ordner|webdav-methoden',
  werkbank: 'verwaltung|verwaltungsbereiche|meldungen|werkbankzahlen',
  zeitplan: 'zeitplan|streuung',
  zwischenspeicher: 'zaehlerspeicher|lesespeicher|kurzzustand|zwischenspeicher',
};
/** Alle Dateien ohne Tür als ein Muster: Pfad ab server/src/ ohne .ts. */
const LOSE = Object.entries(OHNE_TUER)
  .map(([ordner, dateien]) => `${ordner}/(?:${dateien})`)
  .join('|');
/** Pfad einer Datei ohne Tür. */
const LOSE_DATEI = `^server/src/(?:${LOSE})\\.ts$`;

/**
 * Basis, auf der der Kern aufsetzt (#961): Repo, Datenbank, Protokoll, Texte, Einstellungen, Dateien, Zähler,
 * Fehler, Grenzen, Sperre für Geheimnisse (#1055), Nachweis-Journal (#1053, wie das Protokoll: viele Fachordner schreiben
 * hinein). Diese Module binden selbst keinen Dienst und keinen Fachbereich ein. Wie alle Dateilisten unten als Pfad ab
 * server/src/ ohne .ts (#1278: früher direkt in server/src/).
 */
const BASIS =
  'datenbank/db|protokoll/protokoll|sprache/sprache|einstellungen/einstellungen|dateien/dateispeicher|zwischenspeicher/zaehlerspeicher|zwischenspeicher/lesespeicher|zwischenspeicher/kurzzustand|grundlagen/fehler|grundlagen/grenzen|geheimnisse/geheimnis-sperre|protokoll/nachweisjournal';
/**
 * Basis als Ordner (#1278): das Repo – Schnittstelle in repo/index.ts, PostgreSQL in repo/pg/, Arbeitsspeicher in
 * repo/speicher/. Von außen nur über diese drei index.ts (`repo-nur-ueber-index`); wie die Basis bindet es selbst
 * keinen Dienst und keinen Fachbereich ein.
 */
const BASIS_ORDNER = 'repo';
/**
 * Was Fachordner außer Kern und BASIS einbinden dürfen (#1072): Messung der Rechteprüfung, Vektoren lesen (auch der
 * Paket-Läufer braucht sie, daher nicht in suche/) und die technischen Ordner PDF-Stelle und Arbeiter-Pool. Seit #1075
 * die Technik der Dateien, die Dokumente brauchen: Hochladen, Verkleinern, Fassungen (Umwandeln, Archivfassung,
 * Entsperren), Volltext aus Paketen und Ersatzschriften (#1329) – sie binden selbst nur die Basis, hintergrund.ts
 * und die PDF-Stelle ein.
 * Seit #1077 die Technik, die Post, Ausgang und PDF bearbeiten brauchen: Seiten und Seitenbilder (pdfseiten,
 * graubild), Schwärzen, Stempeln beim Weitergeben (ausgabe), Export-Dateien (export, xlsx, zip) und den Mailer (mail,
 * nur sein Typ) – auch sie binden nur die Basis, hintergrund.ts, zwischenspeicher.ts, die PDF-Stelle und einander ein.
 * Seit #1078 die Technik, die Löschen und Datenschutz brauchen: Baum über Verweise, Schriftstück (PDF des
 * Löschprotokolls), Auskunft und Vollexport (Format), Abrufcode, Hashes (passwort) und aus tresor.ts nur
 * `istVerschluesselt` – den Schlüssel selbst reicht der Dienst über den Anschluss herein. Auch sie binden nur die Basis,
 * geheimnisse.ts, die PDF-Stelle, den Arbeiter-Pool und die Werkzeuge oben ein.
 */
const WERKZEUGE = {
  dateien:
    'datenbank/messung|suche/vektoren|dateien/hochladen|dateien/verkleinern|dateien/dateiumwandlung|dateien/archivfassung|dateien/entsperren|volltext/paketvolltext|dateien/ersatzschriften',
  ausgang: 'dateien/pdfseiten|dateien/graubild|dateien/schwaerzen|ausgang/ausgabe|export/export|formate/xlsx|formate/zip|mail/mail',
  datenschutz:
    'loeschen/baum|formate/schriftstueck|datenschutz/auskunft|export/vollexport|datenschutz/abruf|anmeldung/passwort|geheimnisse/tresor',
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
  // ereignisse (#1078) brauchen nur Kern, Rechteprüfung und die Pakete am Mappentyp – und viele brauchen sie, auch
  // Mappen und Dokumente; Texterkennung und Rollen (Schicht 3) kommen über ihren Anschluss
  ['mappentypen', 'mappen', 'dokumente', 'berechtigungen', 'ereignisse'],
  // 3: alle übrigen Fachordner (sichten und volltext über Mappen und Dokumenten, #1076; post, ausgang und
  // pdf-bearbeiten ebenso, #1077; aufgaben, loeschen, datenschutz und werkbank, #1078; suche …)
];
/**
 * Ordner ohne Fachlogik: HTTP-Hilfen, PDF-Stelle, Arbeiter-Pool, Paket-Läufer. Für sie gilt `fachordner` nicht. Die
 * Fachlogik rund um PDFs liegt seit #1077 im Fachordner pdf-bearbeiten/ (Schicht 3) – nicht in pdf/, das so ein
 * Werkzeug ohne Kern, Mappen und Dokumente bleibt (pdf-lib nur dort, Vorgänge im Arbeiter). Dazu der Zusammenbau beim
 * Start (start/, #1278): die Abschnitte von ablago.ts, die alles verdrahten – sie bindet nur ablago.ts ein
 * (`start-nur-aus-ablago`).
 */
const TECHNIK = ['http', 'pdf', 'arbeit', 'laeufer', BASIS_ORDNER, 'start'];
/**
 * Teile eines Fachordners über dem Dienst (#1278): Paketverwaltung, Paketerstellung und der Motor der Automatisierungen
 * bekommen den ganzen Dienst (nur als Typ, `ueber-dem-dienst-typ`), der Dienst selbst bindet `pakete/index.ts` ein.
 * Damit kein Kreis über dienst/dienst.ts entsteht, hat jeder dieser Unterordner eine eigene Tür (seine index.ts).
 * Solange Katalogsignatur, Projektschlüssel, Entdecken und Lizenztexte – für den Motor Zeitplan, Systemstand,
 * Aufgaben-Mail und die Werkbank-Rechte des Systemkontos – keine Tür haben (OHNE_TUER), dürfen diese Teile sie direkt
 * einbinden (`dateien`).
 */
const UEBER_DEM_DIENST = {
  ordner: ['pakete/verwaltung', 'pakete/erstellung', 'automatisierung/motor'],
  dateien:
    'dienst/dienst|pakete/katalogsignatur|pakete/projektschluessel|entdecken/entdecken|entdecken/entdecken-werkbank|pakete/lizenztexte|zeitplan/zeitplan|system/system|aufgaben/aufgabenmail|automatisierung/automatisierung-werkbank',
};
const UNTERORDNER = UEBER_DEM_DIENST.ordner.join('|');
/**
 * Dateien ohne Tür (OHNE_TUER), die ein Fachordner einbinden darf (#1278) – sonst gilt für ihn `fachordner` wie für
 * jeden Ordner seiner Schicht.
 */
const NACHBARN = {
  konten: 'anmeldung/anmeldesperre|konten/konto-repo|anmeldung/zweifaktor|anmeldung/passkeys|anmeldung/oidc',
};
const MIT_NACHBARN = Object.keys(NACHBARN).join('|');

/**
 * Die Regel `fachordner` (#1072) – einmal beschrieben, für jeden Fachordner. dependency-cruiser kann Schichten nicht
 * vergleichen, daher eine Prüfung „nur über index.ts“ und je Schicht eine Prüfung „nur abwärts“, alle unter dem Namen
 * `fachordner`. Der Kern (Schicht 0) bindet nur sich selbst, shared/ und die BASIS ein, keine WERKZEUGE.
 */
function fachordner() {
  const name = 'fachordner';
  const genannt = SCHICHTEN.flat();
  const nichtFach = [...TECHNIK, ...genannt].join('|');
  const regeln = [
    {
      name,
      severity: 'error',
      comment:
        'Einen Fachordner nur über seine index.ts einbinden (#1072) – oder einen Teil über dem Dienst über dessen index.ts (UEBER_DEM_DIENST, #1278). Ausnahmen: Routen (*.routen.ts), die http/routen.ts sammelt, und Dateien ohne Tür (OHNE_TUER, #1278).',
      // $1: Ordner der importierenden Datei (für Dateien außerhalb von Ordnern ihr Name, für Tests „server“ usw.).
      from: { path: '^(?:server/src/)?([^/]+)' },
      to: {
        path: `^server/src/(?!(?:${TECHNIK.join('|')})/)(?!(?:${UNTERORDNER})/index\\.ts$)[^/]+/(?!index\\.ts$)`,
        pathNot: ['^server/src/$1/', '\\.routen\\.ts$', LOSE_DATEI],
      },
    },
  ];
  for (let i = 0; i <= SCHICHTEN.length; i++) {
    const hier = i < SCHICHTEN.length ? `^server/src/(${SCHICHTEN[i].join('|')})/` : `^server/src/(?!(?:${nichtFach})/)[^/]+/`;
    // Fachordner der eigenen und der unteren Schichten – ohne die Dateien ohne Tür (die nur, wenn eine Liste sie nennt).
    const keineLose = `(?!(?:${LOSE})\\.ts$)`;
    const erlaubt =
      i === 0
        ? ['^server/src/kern/', `^server/src/(${BASIS})\\.ts$`, `^server/src/(${BASIS_ORDNER})/`]
        : [
            i < SCHICHTEN.length
              ? `^server/src/${keineLose}(${SCHICHTEN.slice(0, i + 1)
                  .flat()
                  .join('|')})/`
              : `^server/src/${keineLose}(?!(?:${TECHNIK.join('|')})/)[^/]+/`,
            `^server/src/(${WERKZEUGE.ordner}|${BASIS_ORDNER})/`,
            `^server/src/(${BASIS}|${WERKZEUGE.dateien}|${WERKZEUGE.ausgang}|${WERKZEUGE.datenschutz})\\.ts$`,
          ];
    regeln.push({
      name,
      severity: 'error',
      comment:
        i === 0
          ? 'Der Kern ruft keinen Fachbereich auf (#961): nur sich selbst, shared/ und die Basis – nie dienst.ts, Routen oder Fachordner.'
          : `Schicht ${i} ruft nur nach unten (#1072): Fachordner bis Schicht ${i}, Kern, shared/, Basis und Werkzeuge – nie dienst.ts oder Dateien darüber. Routen (*.routen.ts) sind ausgenommen.`,
      from: {
        path: hier,
        pathNot: [
          '\\.routen\\.ts$',
          LOSE_DATEI,
          ...(i === SCHICHTEN.length ? [`^server/src/(?:${UNTERORDNER})/`, `^server/src/(?:${MIT_NACHBARN})/`] : []),
        ],
      },
      to: { path: '^server/src/', pathNot: erlaubt },
    });
    if (i === SCHICHTEN.length) {
      for (const [ordner, dateien] of Object.entries(NACHBARN)) {
        regeln.push({
          name,
          severity: 'error',
          comment: `${ordner}/ ruft wie Schicht ${i} nur nach unten, dazu seine Nachbarn ohne Tür (NACHBARN, #1278).`,
          from: { path: `^server/src/${ordner}/`, pathNot: ['\\.routen\\.ts$', LOSE_DATEI] },
          to: { path: '^server/src/', pathNot: [...erlaubt, `^server/src/(${dateien})\\.ts$`] },
        });
      }
      regeln.push({
        name,
        severity: 'error',
        comment: `Teile über dem Dienst (UEBER_DEM_DIENST, #1278) rufen wie Schicht ${i} nur nach unten, dazu dienst.ts und die genannten Dateien.`,
        from: { path: `^server/src/(?:${UNTERORDNER})/` },
        to: { path: '^server/src/', pathNot: [...erlaubt, `^server/src/(${UEBER_DEM_DIENST.dateien})\\.ts$`] },
      });
    }
  }
  regeln.push({
    name: 'ueber-dem-dienst-typ',
    severity: 'error',
    comment: 'Teile über dem Dienst (#1278) bekommen den Dienst übergeben und binden dienst.ts nur als Typ ein.',
    from: { path: `^server/src/(?:${UNTERORDNER})/` },
    to: { path: '^server/src/dienst/dienst\\.ts$', dependencyTypesNot: ['type-only'] },
  });
  return regeln;
}

/**
 * Ordner in shared/src/, die früher eine Datei waren (#1278): das Fachmodell model/ (vorher model.ts), erkennung/,
 * pakete/ und sichten/. Von außen nur über ihre Tür (`tueren`, sonst index.ts) – wie früher die eine Datei; die Teile
 * darin binden einander direkt ein. Das Fachmodell hat seit #1278 (Schritt 5) eine zweite Tür, model/basis.ts: die
 * Form von Feld, Mappentyp und Mappe ohne Prüfregeln und Werte – für die Teile, die das Modell selbst einbindet (über
 * index.ts entstünde ein Kreis). Je Ordner die Dateien in shared/src/, die einen Teil direkt einbinden dürfen, weil
 * über die Tür ein Kreis entstünde (`ausnahmen`): Das Fachmodell nennt den Typ `Feldbedingung` (sichten/bedingungen.ts,
 * ohne Laufzeit-Import des Modells), und die Bedingungen nennen die Feldart (model/feldtypen.ts, ganz unten im
 * Modell); die Feldformate prüfen die IBAN mit `istIban` (erkennung/angaben.ts).
 */
const SHARED_ORDNER = {
  model: { tueren: 'index|basis', ausnahmen: [['^shared/src/sichten/bedingungen\\.ts$', 'feldtypen']] },
  erkennung: { ausnahmen: [['^shared/src/feldformate\\.ts$', 'angaben']] },
  pakete: { ausnahmen: [] },
  sichten: { ausnahmen: [['^shared/src/model/', 'bedingungen']] },
};

/** Die Regel `shared-ordner-nur-ueber-index` (#1278), je Ordner in SHARED_ORDNER. */
function sharedOrdner() {
  const regeln = [];
  for (const [ordner, { tueren = 'index', ausnahmen }] of Object.entries(SHARED_ORDNER)) {
    regeln.push({
      name: 'shared-ordner-nur-ueber-index',
      severity: 'error',
      comment: `shared/src/${ordner}/ (#1278) von außen nur über seine Tür (${tueren.replaceAll('|', '.ts, ')}.ts) – wie früher die eine Datei ${ordner}.ts; die Teile darin binden einander direkt ein.`,
      from: { path: '^(server|web|shared)/', pathNot: [`^shared/src/${ordner}/`, ...ausnahmen.map(([von]) => von)] },
      to: { path: `^shared/src/${ordner}/(?!(?:${tueren})\\.ts$)` },
    });
    for (const [von, teil] of ausnahmen) {
      regeln.push({
        name: 'shared-ordner-nur-ueber-index',
        severity: 'error',
        comment: `Ausnahme für ${von} (#1278): nur der Teil ${ordner}/${teil}.ts, sonst die Tür.`,
        from: { path: von },
        to: { path: `^shared/src/${ordner}/(?!(?:${tueren}|${teil})\\.ts$)` },
      });
    }
  }
  return regeln;
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'kein-kreislauf',
      severity: 'error',
      comment:
        'Kreisläufe machen die Reihenfolge beim Laden zufällig und verhindern, dass sich Teile getrennt ändern lassen – auch über reine Typ-Importe (#1278, Schritt 5): Gemeinsame Typen in eine eigene Datei, die nichts zurück einbindet (z. B. shared/src/model/basis.ts, server/src/http/routen-typen.ts), oder die Abhängigkeit umdrehen (schmaler Anschluss statt der ganzen Klasse).',
      from: { pathNot: '^(server|web|shared)/test/' },
      to: { circular: true },
    },
    {
      name: 'shared-ohne-server-und-web',
      severity: 'error',
      comment: 'Gemeinsamer Code läuft in Server und Browser – er darf von keinem der beiden abhängen.',
      from: { path: '^shared/', pathNot: '^shared/test/' },
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
      comment:
        'Der Server bindet keinen Code der Oberfläche ein – auch seine Tests nicht: Tests der Oberfläche stehen unter web/test/ (#1282).',
      from: { path: '^server/' },
      to: { path: '^web/' },
    },
    {
      name: 'pdf-nur-ueber-index',
      severity: 'error',
      comment:
        'Die PDF-Stelle (#541) nur über pdf/index.ts. Ausnahme: arbeit/vorgaenge.ts führt die Vorgänge im Arbeiter-Faden aus (#542).',
      from: { path: '^server/src/', pathNot: ['^server/src/pdf/', '^server/src/arbeit/vorgaenge\\.ts$'] },
      to: { path: '^server/src/pdf/(?!index\\.ts$)' },
    },
    {
      name: 'repo-nur-ueber-index',
      severity: 'error',
      comment:
        'Das Repo (#1278) von außen nur über repo/index.ts (Schnittstelle), repo/pg/index.ts und repo/speicher/index.ts – die Teile darin setzt je index.ts zusammen.',
      from: { path: '^server/', pathNot: '^server/src/repo/' },
      to: { path: '^server/src/repo/(?!(?:pg/|speicher/)?index\\.ts$)' },
    },
    ...sharedOrdner(),
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
      comment:
        'http/routen-hilfen.ts und http/routen-kontext.ts nur aus *.routen.ts, http/routen.ts und den Gruppen http/routen-kontext-*.ts (#961, #1278): Fachlogik nutzt keine Hilfen der HTTP-Schicht (etwa ich(a)), sondern bekommt den Benutzer übergeben.',
      from: {
        path: '^(server|shared|web)/',
        // Die Gruppen des Routen-Kontexts (routen-kontext-*.ts, #1278) gehören zum Kontext; sein Charakterisierungstest prüft ihn direkt.
        pathNot: [
          '\\.routen\\.ts$',
          '^server/src/http/routen\\.ts$',
          '^server/src/http/routen-(hilfen|kontext)\\.ts$',
          '^server/src/http/routen-kontext-[a-z]+\\.ts$',
          '^server/test/routen-kontext-charakter\\.test\\.ts$',
        ],
      },
      to: { path: '^server/src/http/routen-(hilfen|kontext)\\.ts$' },
    },
    {
      name: 'start-nur-aus-ablago',
      severity: 'error',
      comment: 'Die Abschnitte des Starts (start/, #1278) ruft nur ablago.ts auf – sie verdrahten alles und gehören zu keinem Fachbereich.',
      from: { path: '^(server|shared|web)/', pathNot: ['^server/src/ablago\\.ts$', '^server/src/start/'] },
      to: { path: '^server/src/start/' },
    },
    ...fachordner(),
  ],
  options: {
    includeOnly: '^(server|web|shared)/(src|test)/',
    exclude: { path: 'node_modules' },
    doNotFollow: { path: 'node_modules' },
    // Auch reine Typ-Importe sehen (für die Richtungsregeln und für Kreise, oben).
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
