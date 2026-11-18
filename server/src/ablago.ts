/**
 * Ablago selbst (index.ts lädt diese Datei; eigener Bündel dist/ablago.js). Seit #1278 stehen die Abschnitte des Starts
 * in start/, je eine Funktion in der alten Reihenfolge: Sie bekommt, was sie von früher braucht, und gibt zurück, was
 * später gebraucht wird. Hier bleiben die Pfade relativ zu dieser Datei (`pfad`: ../migrations, ../../web/dist,
 * ../../data, Lasttest-Skript – aus src/ wie aus dist/), was mehrere Abschnitte gemeinsam verändern (Lasttest, App für
 * die Pakete), Paket-Läufer und Paketverwaltung, Werkbank-Aufgaben, WebDAV, die App, der Lasttest-Modus und das Beenden.
 */
import { Passkeys } from './anmeldung/passkeys';
import { Webdav } from './webdav/webdav';
// Dann-Karten „Feld ändern“ und „Aufgabe / Benachrichtigung“ (#676) melden sich beim Motor an.
import './automatisierung/automatisierung-karten';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitzungsstand } from './datenbank/poolmessung';
import { abfragenZuruecksetzen, teuersteAbfragen } from './lasttest/abfragestatistik';
import { baueApp } from './http/http';
import { extern } from './system/externmessung';
import { pgSystemQuelle } from './system/system';
import { beendeGeordnet } from './prozesse/beenden';
import { pgBetriebSpeicher } from './einstellungen/betrieb';
import { mandantNamen } from './datenbank/mandant';
import { Paketlaeufer } from './laeufer/verwaltung';
import { beendeArbeiter } from './arbeit';
import { liesErweiterungen } from './datenbank/erweiterungen';
import { Paketverwaltung } from './pakete/verwaltung/index';
import { Fachfehler } from './grundlagen/fehler';
import { t } from './sprache/sprache';
import { Notfallzugang } from './notfall/notfall';
import { Verwaltung } from './werkbank/verwaltung';
import { pgEinstellungen } from './einstellungen/einstellungen';
import { eigeneVersion } from './system/system';
import { createServer, type Server } from 'node:http';
import { Lasttestmodus, lasttestSkript, pruefeZiel } from './lasttest/lasttestmodus';
import { type GruppenStand } from './lasttest/prozessgruppen';
import { erkenneSpeicherart } from './lasttest/speicherart';
import { Fernlaeufer } from './laeufer/fern';
import type { PaketLaeufer } from './pakete/verwaltung/index';
import { paketSpeicher, setzePaketSpeicher } from './pakete/index';
import { vorbereiten } from './start/vorbereiten';
import { oeffneStartseite } from './start/startseite';
import { liesUmgebung } from './start/umgebung';
import { bindeDatenbankAn } from './start/anbindung';
import { teileVerbindungen } from './start/verbindungen';
import { verbindeDatenbank } from './start/datenbank';
import { richteBetriebEin } from './start/betrieb';
import { baueDienst } from './start/dienst';
import { richteAnmeldungEin } from './start/anmeldung';
import { richteSicherungEin } from './start/sicherung';
import { richteDokumenteEin } from './start/dokumente';
import { richteEingangEin } from './start/eingang';
import { richteZugaengeEin } from './start/zugaenge';
import { verbindePakete } from './start/pakete';
import { richteAutomatisierungenEin } from './start/automatisierungen';
import { zieheNach } from './start/nachziehen';
import { richteZeitplaeneEin } from './start/zeitplaene';
import { teileArbeitAuf } from './start/aufteilung';
import { starteHintergrund } from './start/hintergrund';
import { bedieneProzessgruppen } from './start/prozessgruppen';
import { laufe } from './start/laufen';

const pfad = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const env = process.env;
const { cfg, log, ordnerPruefung, ordner, version, prozessEinstellung, verbund, leiter, lasttest } = await vorbereiten({ env, pfad });
/** Grund, warum der Lasttest trotz DMS_LASTTEST nicht läuft (echte Ablage) – für die Werkbank-Übersicht. */
let lasttestAbbruch: string | null = null;
const { ohneDatenbankVolume, ABSTURZ_MS, start, beimStartfehler } = await oeffneStartseite({
  env,
  leiter,
  log,
  ordnerPruefung,
  ordner,
  cfg,
  verbund,
  lasttest,
});
const { einrichtungscode, umgebung } = liesUmgebung({ ordner, env, log });
const { db, datenbankUrl } = await bindeDatenbankAn({ ordner, log, umgebung, env, verbund, start, einrichtungscode, cfg });
const { verbindungsZahl, verbindungsteile, eigeneVerbindungen } = await teileVerbindungen({ env, verbund, leiter, log, datenbankUrl });
const { sql, sperren, pgVersion, verbindungswarten, datenbankpruefung, poolmessung, ueberlast, mandant, zustandDb, lebt, nurEiner } =
  await verbindeDatenbank({
    datenbankUrl,
    eigeneVerbindungen,
    leiter,
    cfg,
    start,
    db,
    verbindungsteile,
    verbindungsZahl,
    verbund,
    env,
    log,
    ordner,
    einrichtungscode,
  });
const { tresor, betrieb, messung, region, sprachen, spDeps, speicherplatz, hochladen } = await richteBetriebEin({
  sql,
  cfg,
  ordner,
  leiter,
  env,
  log,
  verbund,
  zustandDb,
  lebt,
});
const { dienst, konten, personenMitSprache, sprachpakete, wartung, anVerwaltendeVon } = await baueDienst({
  messung,
  sql,
  cfg,
  ordner,
  hochladen,
  tresor,
  zustandDb,
  log,
  betrieb,
  sprachen,
  spDeps,
});
// Notfallkontakte (#812): Info-Mail über den Versand von Ablago, Name der Ablage, eintragende Person.
dienst.notfallkontakte.verbinde({
  mailer: () => betrieb.mailer(),
  ablageName: async () =>
    (await mandantNamen(sql, cfg.haushalt)
      .name()
      .catch(() => '')) ||
    (await designs.marke().catch(() => null))?.schriftzug ||
    '',
  person: (id) => konten.benutzerMitId(id),
});
const { anmeldesperre } = richteAnmeldungEin({ spDeps, anVerwaltendeVon, sql, cfg, zustandDb, konten, dienst, tresor });
// Passkeys (#811): gebunden an die Adresse von Ablago (gepflegt, sonst die der Anfrage); Name auf dem Gerät = Schriftzug.
konten.verbindePasskeys(
  new Passkeys(pgEinstellungen(sql, cfg.haushalt), () => betrieb.adresseFuerLinks(), {
    zustand: zustandDb,
    name: async () => (await designs.marke())?.schriftzug || 'Ablago',
    gepflegt: () => betrieb.gepflegteAdresse(),
  }),
);
const notfall = new Notfallzugang(join(dirname(tresor.datei), 'RESCUE'), konten, pgBetriebSpeicher(sql, cfg.haushalt), anVerwaltendeVon());
const { sicherung, wiederherstellung } = await richteSicherungEin({
  ordner,
  cfg,
  tresor,
  sql,
  wartung,
  anVerwaltendeVon,
  datenbankUrl,
  pgVersion,
  konten,
  log,
  ganzBeenden,
  db,
  einrichtungscode,
  leiter,
  start,
});
const { texterkennung, vorschau, exporte } = await richteDokumenteEin({
  messung,
  sql,
  cfg,
  ordner,
  dienst,
  wartung,
  leiter,
  log,
  tresor,
  zustandDb,
});
const { aufgabenmail, designs, einrichtungNoetig, einrichtung, eingangsordner, postSperre } = await richteEingangEin({
  dienst,
  konten,
  betrieb,
  messung,
  sql,
  cfg,
  ordner,
  hochladen,
  leiter,
  einrichtungscode,
  db,
  sicherung,
  sperren,
  env,
  wartung,
  wiederherstellung,
});
const { postfachOAuth, postfaecher, anbindungVerwaltung, konsole, oidc, apiSchluessel, notfallcode } = richteZugaengeEin({
  sql,
  cfg,
  tresor,
  anVerwaltendeVon,
  zustandDb,
  betrieb,
  dienst,
  wartung,
  wiederherstellung,
  speicherplatz,
  postSperre,
  ordner,
  db,
  env,
  umgebung,
  ganzBeenden,
  ohneDatenbankVolume,
  verbund,
  konten,
  messung,
  sicherung,
});
let appFuerPakete: Awaited<ReturnType<typeof baueApp>> | null = null;
// Mehrere Prozesse (#745): genau einmal, im Leiter (er hält die API-Schlüssel der Pakete). Die anderen fragen ihn (Fernlaeufer).
const paketlaeufer: Paketlaeufer | null = !leiter
  ? null
  : new Paketlaeufer({
      dienst,
      konten,
      schluessel: apiSchluessel,
      api: async (q) => {
        if (!appFuerPakete) return { status: 503, kopf: {}, body: Buffer.from('Ablago startet noch.') };
        const r = await appFuerPakete.inject({
          method: q.methode as 'GET',
          url: q.pfad,
          headers: q.kopf,
          payload: q.body,
          remoteAddress: '127.0.0.1',
        });
        return {
          status: r.statusCode,
          kopf: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, String(v)])),
          body: r.rawPayload,
        };
      },
      einstellungen: (id): Promise<Record<string, unknown>> => pakete.einstellungenFuerPaket(id).catch(() => ({})),
      speicher: { lies: (id) => paketSpeicher(dienst.kern, id), schreibe: (id, w) => setzePaketSpeicher(dienst.kern, id, w) },
      pausiert: () => wartung.aktiv,
    });
const fernlaeufer = paketlaeufer ? null : new Fernlaeufer(verbund, dienst);
const laeufer = paketlaeufer ?? fernlaeufer!;
const pakete: Paketverwaltung = new Paketverwaltung(dienst, {
  version: eigeneVersion,
  benutzer: async () => (await konten.listeBenutzer()).filter((b) => b.aktiv !== false).map((b) => ({ id: b.id, name: b.name || b.email })),
  // Vorgaben (#1038): Werte in der Sprache der Installation; Ersteller ist das Dienstkonto des Pakets (Herkunft in der
  // Historie). Pakete ohne Code melden sich nie an – ihr Konto bleibt aus (wie nach dem Entfernen) und steht nur für die Herkunft.
  standardSprache: async () => (await sprachen.lies()).standard,
  dienstkonto: async (id, name, code) => (await konten.dienstkonto(id, name, code)).id,
  laeufer: laeufer as PaketLaeufer,
  // Mehrere Prozesse (#745): hochgeladene Pakete bis zur Installation neben den temporären Uploads (nicht in der Sicherung).
  ...(verbund.mehrere ? { uploadOrdner: join(ordner.dateien, 'hochladen', 'pakete') } : {}),
  // Sprachpakete (#731): sofort laden, Nutzung vor dem Entfernen, danach aus der Einstellung nehmen.
  sprachen: {
    geaendert: async () => {
      await sprachpakete.lade(true);
      await sprachen.lade();
    },
    nutzung: async (k) => ({ personen: await personenMitSprache(k), standard: (await sprachen.lies()).standard === k }),
    entfernt: async (k) => {
      await sprachen.ohne(k);
    },
    abdeckung: (k) => sprachpakete.abdeckung(k),
  },
  // Installieren, Aktualisieren, Entfernen (#405): nacheinander über alle Instanzen – Sperre in PostgreSQL, solange es läuft.
  // Seit #1198 auf der Sperrverbindung: Die Sperre hält keine Verbindung aus dem Pool, während installiert wird.
  sperre: async (f) => {
    const s = await sperren.versuche({ klasse: 4711405 }, 'pakete');
    if (!s) throw new Fachfehler(409, t('pakete.ablauf.fehler.belegt'));
    try {
      return await f();
    } finally {
      await s.gib().catch(() => {});
    }
  },
});
const { systemlast, fehlermeldungen, systemwerkbank } = verbindePakete({
  texterkennung,
  dienst,
  sicherung,
  paketlaeufer,
  wartung,
  laeufer,
  messung,
  sql,
  cfg,
  ordner,
});
const { automatisierungen } = richteAutomatisierungenEin({
  messung,
  sql,
  cfg,
  dienst,
  systemwerkbank,
  betrieb,
  wartung,
  wiederherstellung,
});
// Technische Aufgaben (#719, #818): gebündelte Mail an die Verwaltenden je Bereich, Hinweis ohne Einzelheiten außerhalb
// des Verwaltungsmodus. Jede Quelle liefert Punkte mit festem Schlüssel und Bereich; die Texte nur in der Mail.
const verwaltung = new Verwaltung({
  einstellungen: pgEinstellungen(sql, cfg.haushalt),
  personen: () => konten.listeBenutzer(),
  sende: async (an, betreff, text) => {
    await betrieb.mailer()?.sende(an, betreff, text);
  },
  adresse: () => betrieb.adresseFuerMails(),
  quellen: [
    async () => {
      const z = await sicherung.zustand();
      return [
        ...(z.fehler
          ? [
              {
                bereich: 'sicherung',
                schluessel: `sicherung-fehler:${z.fehler.am}`,
                text: t('werkbank.verwaltung.sicherung.fehler'),
                eigeneMail: true,
              },
            ]
          : []),
        ...(!z.fehler && z.planAktiv && z.zuAlt
          ? [
              {
                bereich: 'sicherung',
                schluessel: `sicherung-alt:${z.letzte?.ende ?? 'nie'}`,
                text: t('werkbank.verwaltung.sicherung.alt'),
                eigeneMail: true,
              },
            ]
          : []),
        ...(z.probe.ampel === 'rot'
          ? [{ bereich: 'sicherung', schluessel: `probe:${z.probe.letzte?.am ?? ''}`, text: t('werkbank.verwaltung.probe') }]
          : []),
      ];
    },
    async () =>
      tresor.zustand === 'vorhanden'
        ? []
        : [{ bereich: 'verschluesselung', schluessel: `tresor:${tresor.zustand}`, text: t('werkbank.verwaltung.tresor') }],
    // #797: Unverschlüsselte Exporte gingen mit jeder Kopie der Sicherung mit.
    async () =>
      exporte.imSicherungsordner
        ? [{ bereich: 'vollexport', schluessel: 'export-im-sicherungsordner', text: t('werkbank.verwaltung.export') }]
        : [],
    async () =>
      (await pakete.installierte())
        .filter((p) => p.einstellungenNoetig)
        .map((p) => ({ bereich: 'pakete', schluessel: `paket:${p.id}`, text: t('werkbank.verwaltung.paket', { name: p.name }) })),
    async () => {
      const w = await automatisierungen.warnungen();
      return [
        ...w.angehalten.map((a) => ({
          bereich: 'automatisierungen',
          schluessel: `automatisierung:${a.id}:${a.grund}`,
          text: t('werkbank.verwaltung.automatisierung', { name: a.name }),
        })),
        ...(w.fehlgeschlagen
          ? [
              {
                bereich: 'automatisierungen',
                schluessel: `automatisierung-fehler:${w.fehlgeschlagen}`,
                text: t('werkbank.verwaltung.automatisierung.fehler', { anzahl: w.fehlgeschlagen }),
              },
            ]
          : []),
      ];
    },
    // Angehaltene Mappen-Abläufe (#1044, Sicherheit): je Ablauf und Grund einmal gemeldet.
    async () =>
      (await dienst.ablaeufe.warnungen()).angehalten.map((a) => ({
        bereich: 'ablaufvorlagen',
        schluessel: `ablauf:${a.id}:${a.grund}`,
        text: t('werkbank.verwaltung.ablauf'),
      })),
    async () => {
      const z = (await speicherplatz.stand()).zustand;
      return z === 'ok'
        ? []
        : [{ bereich: 'systemzustand', schluessel: `speicher:${z}`, text: t('werkbank.verwaltung.speicher'), eigeneMail: true }];
    },
    async () =>
      (await postfaecher.anmeldungFehlt()).map((p) => ({
        bereich: 'postfaecher',
        schluessel: `postfach:${p.id}:${p.zustand}`,
        text: t('werkbank.verwaltung.postfach', { name: p.name }),
      })),
    async () => {
      const n = await fehlermeldungen.offen();
      return n
        ? [
            {
              bereich: 'fehlermeldungen',
              schluessel: `fehlermeldungen:${n}`,
              text: t('werkbank.verwaltung.fehlermeldungen', { anzahl: n }),
            },
          ]
        : [];
    },
    async () =>
      (await notfall.offen()).map((e) => ({ schluessel: `notfall:${e.id}`, text: t('werkbank.verwaltung.notfall'), eigeneMail: true })),
    async () => {
      const n = (await texterkennung.zaehler()).fehler;
      return n
        ? [{ bereich: 'texterkennung', schluessel: `texterkennung:${n}`, text: t('werkbank.verwaltung.texterkennung', { anzahl: n }) }]
        : [];
    },
    async () =>
      (await liesErweiterungen(sql)).some((e) => e.zustand !== 'ok')
        ? [{ bereich: 'systemzustand', schluessel: 'erweiterungen', text: t('werkbank.verwaltung.erweiterungen') }]
        : [],
    // Aufgaben bei Personen ohne Leserecht (#798): je Fall einmal gemeldet; der Alltags-Benutzer sieht nur „etwas liegt an“.
    async () =>
      Promise.all(
        (await dienst.ohneLeserecht.offeneFaelle()).map(async (f) => ({
          bereich: 'aufgaben',
          schluessel: `ohne-leserecht:${f.id}`,
          text: t('werkbank.verwaltung.ohne-leserecht', { name: await dienst.kern.name(f.benutzerId) }),
        })),
      ),
  ],
});
// WebDAV-Laufwerk (#346): Anmeldung mit API-Schlüssel, im Standard aus (Werkbank → WebDAV-Laufwerk).
const webdav = new Webdav({
  dienst,
  konten,
  schluessel: apiSchluessel,
  einstellungen: pgEinstellungen(sql, cfg.haushalt),
  adresse: () => betrieb.adresseFuerLinks(),
  wartung,
  zustand: zustandDb,
});
const app = await baueApp(dienst, konten, {
  webdav,
  automatisierungen,
  pakete,
  paketlaeufer: laeufer,
  konsole,
  oidc,
  einbetten: cfg.einbetten,
  webDir: cfg.web,
  sicher: () => betrieb.cookieNurHttps(),
  proxy: cfg.proxy.trust,
  messung,
  system: pgSystemQuelle(sql, cfg.haushalt),
  designs,
  einrichtung,
  anbindung: anbindungVerwaltung,
  mandantHinweis: mandant.hinweis,
  mandantName: () => mandantNamen(sql, cfg.haushalt).name(),
  apiSchluessel,
  betrieb,
  tresor,
  texterkennung,
  vorschau,
  aufgabenmail,
  region,
  sprachen,
  // Screenshots der Fehlermeldungen getrennt von den Dokumenten (#70).
  wartung,
  notfall,
  notfallcode,
  sicherung,
  exporte,
  wiederherstellung,
  speicherplatz,
  systemlast,
  ueberlast,
  verbindungen: verbindungswarten,
  // Gesundheitsprüfung mit Datenbank (#1198).
  datenbank: datenbankpruefung,
  poolmessung,
  sitzungen: () => sitzungsstand(sql),
  abfragen: { stand: (n: number) => teuersteAbfragen(sql, n), zuruecksetzen: () => abfragenZuruecksetzen(sql) },
  // #895: gemessen im Leiter – er kennt das Skript des Lasttests; so zählt die Rechenzeit an einer Stelle fortlaufend.
  prozessgruppen: () => verbund.rufe<GruppenStand>('prozessgruppen.stand', [], { ms: 5000 }),
  erweiterungen: () => liesErweiterungen(sql),
  eingangsordner,
  postfaecher,
  postfachOAuth,
  ordner: ordnerPruefung,
  lasttestAbbruch: () => lasttestAbbruch,
  fehlermeldungen,
  verwaltung,
  verbund,
  prozessEinstellung,
});
await zieheNach({ betrieb, leiter, log, start, dienst, konten, wartung, wiederherstellung, automatisierungen, version });
const { papierkorbLauf, abwesenheiten, fristen } = richteZeitplaeneEin({
  wartung,
  dienst,
  exporte,
  nurEiner,
  log,
  leiter,
  konten,
  aufgabenmail,
  anmeldesperre,
  zustandDb,
  einrichtungNoetig,
  cfg,
});

appFuerPakete = app;
const { aufteilung } = teileArbeitAuf({
  start,
  verbund,
  dienst,
  texterkennung,
  vorschau,
  sicherung,
  wiederherstellung,
  postfaecher,
  eingangsordner,
  paketlaeufer,
  fernlaeufer,
  tresor,
  betrieb,
  oidc,
  messung,
  sql,
  cfg,
  zustandDb,
  ueberlast,
  verbindungswarten,
  poolmessung,
});
await starteHintergrund({
  leiter,
  texterkennung,
  lebt,
  laeufer,
  log,
  nurEiner,
  notfall,
  sicherung,
  speicherplatz,
  eingangsordner,
  postfaecher,
  wartung,
  wiederherstellung,
  dienst,
  verwaltung,
  zustandDb,
  aufteilung,
});

// Lasttest-Modus (#612): Das DMS läuft nur intern (127.0.0.1, freier Port) – dorthin misst das Skript. Unter dem Port des
// Containers steht nur die Seite mit Fortschritt und Ergebnis. Vorher prüft das Skript ohne etwas anzulegen, ob dies eine
// frische oder eine eigene Test-Installation ist; sonst läuft das DMS normal weiter und meldet den Abbruch.
let lasttestSeite: Lasttestmodus | null = null;
let intern: Server | null = null;
/** Interner Server auf 127.0.0.1 – bei mehreren Prozessen teilen sie sich denselben freien Port (listen(0) unter cluster). */
const internerServer = async () => {
  await app.ready();
  const s = createServer(app.routing);
  // Wie der Server des DMS (Fastify): dieselben Wartezeiten für Verbindungen.
  s.keepAliveTimeout = app.server.keepAliveTimeout;
  s.requestTimeout = app.server.requestTimeout;
  s.headersTimeout = app.server.headersTimeout;
  await new Promise<void>((r) => s.listen({ port: 0, host: '127.0.0.1', backlog: 2048 }, () => r()));
  return s;
};
// Weitere Prozesse (#745): Misst der Leiter gerade, beantworten auch sie nur den internen Port.
const lasttestIntern = !leiter && (await verbund.rufe<boolean>('lasttest.intern').catch(() => false));
if (lasttestIntern) intern = await internerServer();
if (lasttest.wahl) {
  start.schritt('lasttest');
  const skript = lasttestSkript(env, [pfad('../../lasttest/lasttest.mjs'), pfad('../test/lasttest.mjs')]);
  if (!skript) lasttestAbbruch = t('meldungen.index.das-skript-des-lasttests');
  else {
    const s = await internerServer();
    intern = s;
    const adresse = s.address();
    const ziel = `http://127.0.0.1:${typeof adresse === 'object' && adresse ? adresse.port : 0}`;
    const skriptEnv = { ...env, DMS_GEHEIM: ordner.geheim };
    const p = await pruefeZiel(skript, ziel, skriptEnv);
    if (p.ok) {
      const daten = dirname(ordner.geheim);
      lasttestSeite = new Lasttestmodus({
        wahl: lasttest.wahl,
        dauer: lasttest.dauer,
        mappen: lasttest.mappen,
        speichern: lasttest.speichern,
        skript,
        ziel,
        ergebnisOrdner: join(daten, 'ergebnis'),
        env: skriptEnv,
        speicherart: erkenneSpeicherart(daten),
        port: cfg.port,
        host: cfg.host,
        webDir: cfg.web,
        proxy: cfg.proxy.trust,
        einbetten: cfg.einbetten,
        beenden: async () => {
          ganzBeenden('Lasttest beendet');
        },
      });
    } else {
      lasttestAbbruch = p.grund;
      await new Promise<void>((r) => {
        s.closeAllConnections();
        s.close(() => r());
      });
      intern = null;
    }
  }
  if (lasttestAbbruch)
    log.error(
      `DMS_LASTTEST ist gesetzt, der Lasttest startet aber nicht: ${lasttestAbbruch} Ablago läuft normal weiter – entferne die Variable.`,
    );
}
bedieneProzessgruppen({ verbund, lasttestSeite, lasttestIntern, leiter, env });

/** Ganz Ablago beenden – bei mehreren Prozessen alle (über den Hauptprozess), sonst diesen. */
function ganzBeenden(grund: string) {
  if (!verbund.beendeAlle(grund)) void beenden();
}

/**
 * Geordnet beenden (#1011, `beenden.ts`): Jeder Schritt läuft, auch wenn ein früherer scheitert; Fehler kommen ins
 * Protokoll. Danach endet der Prozess mit 0, oder mit 1, wenn ein Schritt gescheitert ist – spätestens nach der
 * Gesamtfrist (#1340, auch mit einem Prozess unter den 10 s von `docker stop`). Ein zweites Signal ändert nichts.
 */
let beendetSchon = false;
const beenden = async () => {
  if (beendetSchon) return;
  beendetSchon = true;
  log.info(leiter ? 'Ablago wird beendet' : `Prozess ${verbund.nr} wird beendet`);
  await beendeGeordnet(
    [
      { name: 'start.schliesse', f: () => start.schliesse() },
      { name: 'lasttestSeite.stop', f: () => lasttestSeite?.stop() },
      {
        name: 'interner Server',
        f: () => {
          if (intern) {
            const s = intern;
            return new Promise<void>((r) => {
              s.closeAllConnections();
              s.close(() => r());
            });
          }
        },
      },
      { name: 'texterkennung.stop', f: () => texterkennung.stop() },
      { name: 'paketlaeufer.stop', f: () => paketlaeufer?.stop() },
      { name: 'dienst.ereignisse.stoppe', f: () => dienst.ereignisse.stoppe() },
      { name: 'vorschau.stop', f: () => vorschau.stop() },
      { name: 'wartung.stop', f: () => wartung.stop() },
      { name: 'sicherung.stop', f: () => sicherung.stop() },
      { name: 'speicherplatz.stop', f: () => speicherplatz.stop() },
      { name: 'Konsole', f: () => leiter && konsole.entferne() },
      { name: 'app.close', f: () => app.close() },
      // Zusammenfassungen der letzten Minute (#920) noch ins Protokoll.
      { name: 'messung.leeren', f: () => messung.leeren() },
      { name: 'extern.schreibe', f: () => extern.schreibe() },
      { name: 'ueberlast.leeren', f: () => ueberlast.leeren() },
      { name: 'beendeArbeiter', f: () => beendeArbeiter() },
      { name: 'verbindungswarten.stop', f: () => verbindungswarten.stop() },
      { name: 'poolmessung.aus', f: () => poolmessung.aus() },
      { name: 'aufteilung.stop', f: () => aufteilung.stop() },
      { name: 'lebt.ende', f: () => lebt.ende() },
      { name: 'sperren.ende', f: () => sperren.ende() },
      { name: 'sql.end', f: () => sql.end({ timeout: 5 }) },
    ],
    { log, ende: (code) => process.exit(code) },
  );
};
const beendenSignal = () => void beenden();
process.on('SIGTERM', beendenSignal);
process.on('SIGINT', beendenSignal);
await laufe({
  start,
  lasttestSeite,
  lasttestIntern,
  app,
  cfg,
  beimStartfehler,
  verbund,
  ABSTURZ_MS,
  leiter,
  log,
  papierkorbLauf,
  abwesenheiten,
  fristen,
  intern,
  konsole,
});
