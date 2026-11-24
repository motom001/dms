/**
 * Startseite „Ablago startet …“ (#802, #1250): Schritte, Fehler und das HTML der Seite. Der Server dazu steht in
 * startmodus.ts; die Seite zeigen Ablago selbst und – in dms-komplett schon vor PostgreSQL – der Vorstart (vorstart.ts).
 *
 * Vor der Anmeldung verrät die Seite nur den Schritt (#1250): keine Version, keine Pfade, keine Rechnernamen, keine
 * Meldungstexte (die können Werte aus der Datenbank enthalten). Die genaue Meldung steht im Protokoll des Containers.
 */
import { HILFE, hilfeUrl } from '../../../shared/src/hilfe';
import { t } from '../sprache/sprache';
import { aenderungText, kennungSatz } from '../../../shared/src/dienstbenutzer';
import type { StartseitenKennung } from './dienstbenutzer';
import { PG_GETESTET, PG_MINDESTVERSION } from '../datenbank/pg-version';

/**
 * Letzte Version von Ablago, deren dms-komplett PostgreSQL 17 mitbringt (#1464). Die Startseite nennt sie fest, wenn
 * der Datenbank-Ordner noch von 17 stammt: Mit genau dieser Version zieht man die Sicherung für den Umzug. Der Test
 * `pg-umzug-version.test.ts` hält sie gleich mit den Release-Notizen (nach dem Merge) bzw. package.json (davor).
 */
export const LETZTE_VERSION_PG17 = '0.305.0';
/** Werte für die Texte der Startseite (Versionen stehen fest im Programm, nicht aus dem System gelesen). */
const FESTE_WERTE = { version: LETZTE_VERSION_PG17, mindestens: PG_MINDESTVERSION, getestet: PG_GETESTET };

export type Startschritt =
  /** Vorstart in dms-komplett (#1250): PostgreSQL anlegen, starten, dann Ablago starten. */
  | 'pg-anlegen'
  | 'pg-start'
  /** Ohne root (#1354): einmal nach dem Update die Ordner unter /data für den Benutzer von Ablago übernehmen. */
  | 'rechte'
  | 'ablago'
  | 'datenbank'
  /** Datenbank noch nicht erreichbar (#1250): neuer Versuch nr von von. */
  | 'datenbank-warten'
  /** Migrationen warten auf die Sperre einer anderen Ablago an derselben Datenbank (#1250). */
  | 'sperre'
  | 'migration'
  | 'schluessel'
  | 'suchindex'
  | 'ordner'
  | 'titel'
  | 'benutzer'
  | 'typen'
  | 'dienste'
  | 'lasttest';

/** Datenbank nach dem Start nicht erreichbar oder blockiert (#1250). */
export type DatenbankGrund = 'abgewiesen' | 'sperre' | 'platte' | 'verbindungen' | 'zu-alt';
/**
 * Fehler des Vorstarts in dms-komplett, bevor Ablago selbst läuft (#1250; Meldungen von deploy/komplett/start.sh).
 * `pg-17` (#1464): Der Datenbank-Ordner stammt noch von PostgreSQL 17, das Image bringt 18 mit.
 */
export type VorstartGrund = 'rechte' | 'pg-version' | 'pg-17' | 'nicht-leer' | 'pg-anlegen' | 'pg-beendet' | 'daten-rechte';
export const VORSTART_GRUENDE: readonly VorstartGrund[] = [
  'rechte',
  'pg-version',
  'pg-17',
  'nicht-leer',
  'pg-anlegen',
  'pg-beendet',
  'daten-rechte',
];

export type Startfehler =
  | { art: 'neuere-datenbank'; unbekannt: string[] }
  | { art: 'migration'; nr: number; von: number; datei: string; code: string }
  | { art: 'datenbank'; grund: DatenbankGrund }
  | { art: 'vorstart'; grund: VorstartGrund }
  | { art: 'allgemein'; schritt: Startschritt };

export interface Startstand {
  zustand: 'startet' | 'fehler';
  schritt: Startschritt;
  nr: number | null;
  von: number | null;
  menge: { fertig: number; gesamt: number } | null;
  /** Beginn des Starts (ms). */
  seit: number;
  fehler: Startfehler | null;
}

/** Nur diese Kennungen gehen nach außen; Dateinamen der Migrationen sind Teil des Programms, keine Daten. */
const MIGRATION = /^[\w.-]{1,120}$/;
const CODE = /^[0-9A-Z]{5}$/;

/**
 * Datenbank nicht erreichbar oder blockiert (#1250) – aus dem Fehlercode (PostgreSQL bzw. Node und postgres.js), nie
 * aus dem Text. null: kein solcher Fall.
 */
export function datenbankGrund(e: unknown): DatenbankGrund | null {
  const code = String((e as { code?: unknown } | null)?.code ?? (e as { errno?: unknown } | null)?.errno ?? '');
  if (['53100', 'ENOSPC'].includes(code)) return 'platte';
  if (['55P03', '40P01', '57014'].includes(code)) return 'sperre';
  if (['53300', '53400'].includes(code)) return 'verbindungen';
  if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'CONNECT_TIMEOUT',
      'CONNECTION_CLOSED',
      'CONNECTION_ENDED',
      'CONNECTION_DESTROYED',
      '57P01',
      '57P02',
      '57P03',
      '08000',
      '08001',
      '08003',
      '08006',
    ].includes(code)
  )
    return 'abgewiesen';
  return null;
}

/** Fehler beim Start → was die Seite zeigen darf (keine Meldungstexte, nur Art, Schritt, Datei und Fehlercode). */
export function startfehlerAus(e: unknown, stand: Pick<Startstand, 'schritt' | 'nr' | 'von'>, migration: string | null): Startfehler {
  // NeuereDatenbankFehler (datenbank/db.ts) am Namen erkannt: Der Vorstart soll die Datenbank-Schicht nicht mitbündeln.
  const neuer = e as { name?: unknown; unbekannt?: unknown } | null;
  if (neuer?.name === 'NeuereDatenbankFehler' && Array.isArray(neuer.unbekannt))
    return { art: 'neuere-datenbank', unbekannt: neuer.unbekannt.filter((n): n is string => typeof n === 'string' && MIGRATION.test(n)) };
  // Zu alte Hauptversion von PostgreSQL (#1464, datenbank/pg-version.ts), ebenfalls am Namen erkannt.
  if (neuer?.name === 'ZuAlteDatenbankFehler') return { art: 'datenbank', grund: 'zu-alt' };
  const grund = datenbankGrund(e);
  if (grund) return { art: 'datenbank', grund };
  if (stand.schritt === 'migration' && migration && MIGRATION.test(migration)) {
    const code = String((e as { code?: unknown } | null)?.code ?? '');
    return { art: 'migration', nr: stand.nr ?? 0, von: stand.von ?? 0, datei: migration, code: CODE.test(code) ? code : '–' };
  }
  return { art: 'allgemein', schritt: stand.schritt };
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Sprache der Seite aus Accept-Language (#1250: de/en wie das Startbild der Oberfläche). */
export function startseitenSprache(kopf: string | string[] | undefined): 'de' | 'en' {
  const erste = (Array.isArray(kopf) ? kopf[0] : (kopf ?? '')).split(',')[0]?.trim().toLowerCase() ?? '';
  return !erste || erste === '*' || erste === 'de' || erste.startsWith('de-') ? 'de' : 'en';
}

const schrittText = (s: Pick<Startstand, 'schritt' | 'nr' | 'von'>) =>
  t.frei(`start.schritt.${s.schritt}`, { nr: s.nr ?? '', von: s.von ?? '' });

/** Was du tun kannst (#1250, B3/B6): Schlüssel der Schritte je Fehler; das Protokoll kommt immer dazu. */
function auswege(f: Startfehler, komplett: boolean): string[] {
  const neustart = komplett ? 'start.fehler.tun.neustart.komplett' : 'start.fehler.tun.neustart.extern';
  if (f.art === 'datenbank')
    return {
      abgewiesen: [neustart],
      sperre: ['start.fehler.tun.sperre'],
      platte: ['start.fehler.tun.speicher'],
      verbindungen: ['start.fehler.tun.verbindungen'],
      'zu-alt': ['start.fehler.tun.pg-zu-alt'],
    }[f.grund];
  if (f.art === 'vorstart')
    return {
      rechte: ['start.fehler.tun.rechte'],
      'pg-version': ['start.fehler.tun.pg-version'],
      'pg-17': ['start.fehler.tun.pg-17', 'start.fehler.tun.pg-17-ordner'],
      'nicht-leer': ['start.fehler.tun.nicht-leer'],
      'pg-anlegen': ['start.fehler.tun.speicher', 'start.fehler.tun.rechte'],
      'pg-beendet': ['start.fehler.tun.speicher', 'start.fehler.tun.neustart.komplett'],
      'daten-rechte': ['start.fehler.tun.daten-rechte'],
    }[f.grund];
  if (f.art === 'neuere-datenbank') return ['start.fehler.neuere-datenbank.tun'];
  return [];
}

function grundText(f: Startfehler): string {
  if (f.art === 'neuere-datenbank')
    return t('start.fehler.neuere-datenbank', { anzahl: f.unbekannt.length, letzte: f.unbekannt[f.unbekannt.length - 1] ?? '–' });
  if (f.art === 'migration') return t('start.fehler.migration', { nr: f.nr, von: f.von, datei: f.datei, code: f.code });
  if (f.art === 'datenbank') return t.frei(`start.fehler.datenbank.${f.grund}`, FESTE_WERTE);
  if (f.art === 'vorstart') return t.frei(`start.fehler.vorstart.${f.grund}`, FESTE_WERTE);
  return t('start.fehler.allgemein', { schritt: schrittText({ schritt: f.schritt, nr: null, von: null }) });
}

/**
 * Benutzer von Ablago (#1466): ein Satz, welcher Benutzer und warum, und was das Start-Skript bei diesem Start
 * geändert hat – nur Kennungen und Ordnernamen, keine Pfade.
 */
function kennungTeile(s: Startstand, k: StartseitenKennung | null | undefined): string[] {
  const satz = k ? kennungSatz(k.stand, t.frei) : null;
  if (!k || !satz) return [];
  const neu = k.stand.aenderungen.filter((a) => Date.parse(a.zeit) >= s.seit - 2000);
  return [
    `<p class="leise">${html(satz)}</p>`,
    ...(neu.length ? [`<ul class="leise">${neu.map((a) => `<li>${html(aenderungText(a, t.frei))}</li>`).join('')}</ul>`] : []),
  ];
}

/**
 * Ablago kann nicht schreiben (#1466): was das Start-Skript gesehen hat und die Abhilfe als fertige Zeilen – mit den
 * Kennungen der Ordner. Pfade nur die festen im Container (/data/…), wie in der Compose-Datei.
 */
function rechteTeile(k: StartseitenKennung | null | undefined): string[] {
  if (!k?.fehler.length) return [];
  const jetzt = `${k.stand.benutzer ?? 1000}:${k.stand.gruppe ?? 1000}`;
  const gesehen = k.fehler.map((f) =>
    f.schreibgeschuetzt
      ? t('start.rechte.schreibgeschuetzt', { ordner: f.ordner })
      : t('start.rechte.gesehen', { ordner: f.ordner, besitzer: f.besitzer, rechte: f.rechte, jetzt }),
  );
  const ro = k.fehler.filter((f) => f.schreibgeschuetzt);
  const andere = k.fehler.filter((f) => !f.schreibgeschuetzt);
  const pre = (z: string) => `<pre>${html(z)}</pre>`;
  return [
    `<ul>${gesehen.map((g) => `<li>${html(g)}</li>`).join('')}</ul>`,
    ...(ro.length ? [`<p>${html(t('start.rechte.ro'))}</p>`, pre(ro.map((f) => `- …:/data/${f.ordner}`).join('\n'))] : []),
    ...(k.vorschlag
      ? [
          `<p>${html(t('start.rechte.puid'))}</p>`,
          pre(`    environment:\n      PUID: "${k.vorschlag.puid}"\n      PGID: "${k.vorschlag.pgid}"`),
        ]
      : []),
    ...(andere.length
      ? [
          `<p>${html(k.vorschlag ? t('start.rechte.chown.oder') : t('start.rechte.chown'))}</p>`,
          pre(andere.map((f) => `sudo chown -R ${jetzt} <${t('start.rechte.nas-ordner', { ordner: f.ordner })}>`).join('\n')),
        ]
      : []),
  ];
}

function laeuftTeile(s: Startstand, dauer: string, k?: StartseitenKennung | null): string[] {
  const anteil = s.menge && s.menge.gesamt > 0 ? s.menge.fertig / s.menge.gesamt : s.nr && s.von ? (s.nr - 1) / s.von : null;
  const menge = s.menge
    ? ` – ${html(t('start.menge', { fertig: s.menge.fertig.toLocaleString('de-DE'), gesamt: s.menge.gesamt.toLocaleString('de-DE') }))}`
    : '';
  // Warten auf die Datenbank: „Versuch n von m“ ist kein Fortschritt, also ein laufender Balken.
  const balken = s.schritt === 'datenbank-warten' ? null : anteil;
  return [
    `<h1>${html(t('start.titel'))}</h1>`,
    `<p class="schritt" role="status">${html(schrittText(s))}${menge}</p>`,
    balken === null ? '<progress></progress>' : `<progress max="100" value="${Math.round(balken * 100)}"></progress>`,
    `<p class="leise">${html(t('start.seit', { dauer }))}</p>`,
    ...kennungTeile(s, k),
    `<p>${html(t('start.beruhigung'))}</p>`,
    `<p class="leise">${html(t('start.weiter'))}</p>`,
  ];
}

function fehlerTeile(f: Startfehler, komplett: boolean, sprache: 'de' | 'en', k?: StartseitenKennung | null): string[] {
  const wege = auswege(f, komplett);
  return [
    `<h1>${html(t('start.fehler.titel'))}</h1>`,
    `<p class="schritt" role="alert">${html(grundText(f))}</p>`,
    ...(f.art === 'vorstart' && f.grund === 'daten-rechte' ? rechteTeile(k) : []),
    ...(wege.length
      ? [
          `<p class="zwischen">${html(t('start.fehler.was-tun'))}</p>`,
          `<ol>${wege.map((k) => `<li>${html(t.frei(k, FESTE_WERTE))}</li>`).join('')}</ol>`,
        ]
      : []),
    `<p>${html(t('start.fehler.tun'))}</p>`,
    ...(f.art === 'neuere-datenbank' ? [] : [`<p class="leise">${html(t('start.fehler.neustart'))}</p>`]),
    `<p><a href="${html(hilfeUrl(HILFE['start.fehler'], null, sprache === 'de' ? null : sprache))}">${html(t('start.fehler.hilfe'))}</a></p>`,
  ];
}

/** Die Seite selbst: schlicht, ohne Skript (Neuladen per meta refresh), Stil inline (CSP erlaubt nur das), nichts von Dritten. */
export function startseiteHtml(
  s: Startstand,
  o: { dauer: string; neuLadenS: number; komplett: boolean; sprache: 'de' | 'en'; kennung?: StartseitenKennung | null },
): string {
  const fehler = s.zustand === 'fehler' && s.fehler;
  const teile = fehler ? fehlerTeile(fehler, o.komplett, o.sprache, o.kennung) : laeuftTeile(s, o.dauer, o.kennung);
  return `<!doctype html>
<html lang="${o.sprache}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${fehler ? 30 : o.neuLadenS}"><meta name="robots" content="noindex">
<title>${html(fehler ? t('start.fehler.titel') : t('start.titel'))}</title>
<style>
:root{color-scheme:light dark;--grund:#f5f7f8;--karte:#fff;--text:#1c2328;--leise:#5b6670;--akzent:#00796b;--rand:#dde2e6;--fehler:#b3261e}
@media (prefers-color-scheme:dark){:root{--grund:#101417;--karte:#1a2025;--text:#e6eaed;--leise:#9aa5ae;--akzent:#4db6ac;--rand:#2c343a;--fehler:#f2b8b5}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--grund);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{box-sizing:border-box;width:min(560px,100% - 32px);background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:28px}
h1{margin:0 0 12px;font-size:1.4rem}
.schritt{font-weight:600}${fehler ? '.schritt{color:var(--fehler)}' : ''}
.zwischen{font-weight:600;margin-bottom:4px}
ol,ul{margin-top:0;padding-left:22px}
pre{background:var(--grund);border:1px solid var(--rand);border-radius:8px;padding:8px 12px;overflow-x:auto;font-size:.9rem}
.leise{color:var(--leise);font-size:.93rem}
progress{width:100%;height:10px;accent-color:var(--akzent)}
a{color:var(--akzent)}
</style></head>
<body><main>
${teile.join('\n')}
</main></body></html>
`;
}
