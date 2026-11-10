import { Document, isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import { BUNDESLAENDER } from '../../shared/src/feiertage';
import { HANDBUCH_BASIS } from '../../shared/src/hilfe';
import { EINRICHTUNG_FORMAT, PLAN_VERBINDUNGEN, VERWEIS_MUSTER, type DateiFehler, type Einrichtungsplan, type PlanMail } from '../../shared/src/einrichtungsplan';
import { Fachfehler } from './fehler';
import { t } from './sprache';
import { EINRICHTUNGSDATEI_MAX as DATEI_MAX, KB } from './grenzen';

/**
 * Einrichtung als Konfigurationsdatei (#806): YAML (JSON geht auch – gültiges JSON ist gültiges YAML), geprüft gegen
 * ein veröffentlichtes JSON Schema. Die Datei enthält keine Geheimnisse: Passwörter höchstens als Verweis auf eine
 * Umgebungsvariable, nie den Schlüssel. Speichern und Laden ergeben dieselbe Datei (Hin und Zurück).
 *
 * Seit #821 heißt der Abschnitt der Person, die einrichtet, `konto` („Dein Konto“). Dateien aus 0.191 und 0.192 mit
 * `administrator` lädt Ablago weiter (als `konto`); einen Abschnitt `erster-benutzer` übergeht es mit einem Hinweis –
 * weitere Personen lädt man nach der Einrichtung ein.
 */

export { DATEI_MAX };
export const SCHEMA_DATEI = `ablago-einrichtung-${EINRICHTUNG_FORMAT}.schema.json`;

type Schema = {
  $schema?: string; $id?: string; title?: string; description?: string;
  type?: 'object' | 'array' | 'string' | 'integer' | 'boolean';
  const?: unknown; enum?: readonly unknown[]; pattern?: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number;
  properties?: Record<string, Schema>; required?: readonly string[]; additionalProperties?: boolean | Schema; propertyNames?: Schema;
  items?: Schema; maxItems?: number;
};

const verweis = (wofuer: string): Schema => ({
  type: 'string', pattern: VERWEIS_MUSTER,
  description: `Nie das Passwort selbst: höchstens ein Verweis auf eine Umgebungsvariable, z. B. \${DMS_${wofuer}}. Fehlt das Feld, fragt der Assistent das Passwort ab.`,
});
const EMAIL: Schema = { type: 'string', minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+$' };

/** JSON Schema (2020-12) der Formatversion 1 – veröffentlicht im Administrator- und im Entwicklerhandbuch. */
export const SCHEMA: Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${HANDBUCH_BASIS}/admin/aktuell/einrichtungsdatei/${SCHEMA_DATEI}`,
  title: t('meldungen.einrichtungsdatei.einrichtung-von-ablago'),
  description: t('meldungen.einrichtungsdatei.was-der-einrichtungsassistent'),
  type: 'object', additionalProperties: false, required: ['ablago-einrichtung', 'ablage', 'konto'],
  properties: {
    'ablago-einrichtung': { const: EINRICHTUNG_FORMAT, description: t('meldungen.einrichtungsdatei.formatversion-dieser-datei') },
    datenbank: {
      type: 'object', additionalProperties: false, required: ['rechner', 'port', 'name', 'benutzer'],
      description: t('meldungen.einrichtungsdatei.verbindung-zu-postgresql-gilt'),
      properties: {
        rechner: { type: 'string', minLength: 1, maxLength: 255 },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        name: { type: 'string', minLength: 1, maxLength: 63 },
        benutzer: { type: 'string', minLength: 1, maxLength: 63 },
        passwort: verweis('DB_PASSWORT'),
      },
    },
    ablage: { type: 'string', minLength: 1, maxLength: 30, description: t('meldungen.einrichtungsdatei.name-der-ablage-z') },
    konto: {
      type: 'object', additionalProperties: false, required: ['email'],
      description: t('meldungen.einrichtungsdatei.dein-konto-die-person'),
      properties: { name: { type: 'string', maxLength: 100 }, email: EMAIL, passwort: verweis('KONTO_PASSWORT') },
    },
    pakete: {
      type: 'array', maxItems: 100, description: t('meldungen.einrichtungsdatei.pakete-aus-dem-offiziellen'),
      items: {
        type: 'object', additionalProperties: false, required: ['id'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z0-9][a-z0-9-]*$' },
          beispiele: { type: 'boolean', description: t('meldungen.einrichtungsdatei.beispiel-mappen-des-pakets') },
          automatisierungen: {
            type: 'object', description: t('meldungen.einrichtungsdatei.mitgelieferte-automatisierungen'),
            propertyNames: { pattern: '^[a-z0-9][a-z0-9_-]*$', maxLength: 64 }, additionalProperties: { type: 'boolean' },
          },
        },
      },
    },
    optionales: {
      type: 'object', additionalProperties: false,
      properties: {
        adresse: { type: 'string', minLength: 1, maxLength: 300, pattern: '^https?://', description: t('meldungen.einrichtungsdatei.adresse-von-ablago-fuer') },
        bundesland: { enum: Object.keys(BUNDESLAENDER), description: t('meldungen.einrichtungsdatei.fuer-die-feiertage-werkbank') },
        beispiele: { type: 'boolean', description: t('meldungen.einrichtungsdatei.beispiel-mappentypen-laden') },
        'e-mail': {
          type: 'object', additionalProperties: false, required: ['server'],
          properties: {
            aktiv: { type: 'boolean' },
            server: { type: 'string', minLength: 1, maxLength: 200 },
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            verbindung: { enum: PLAN_VERBINDUNGEN },
            benutzer: { type: 'string', maxLength: 200 },
            absender: { type: 'string', maxLength: 200 },
            selbstsigniert: { type: 'boolean' },
            passwort: verweis('MAIL_PASSWORT'),
          },
        },
      },
    },
  },
};

/* ---------- Prüfung gegen das Schema ---------- */

interface Verstoss { pfad: Array<string | number>; text: string; schluessel?: boolean; fehlt?: boolean }
const TYPNAMEN = { object: 'typ.abschnitt', array: 'typ.liste', string: 'typ.text', integer: 'typ.zahl', boolean: 'typ.janein' } as const;
const istTyp = (v: unknown, typ: NonNullable<Schema['type']>) => (typ === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v)
  : typ === 'array' ? Array.isArray(v) : typ === 'integer' ? Number.isInteger(v) : typeof v === typ);

/** Der Teil des JSON Schemas, den die Datei braucht: type, const, enum, pattern, Längen, Bereiche, Felder, Listen. */
function pruefe(v: unknown, s: Schema, pfad: Array<string | number>, aus: Verstoss[]) {
  const name = String(pfad.at(-1) ?? '');
  if (s.const !== undefined && v !== s.const) { aus.push({ pfad, text: t('einrichtung.datei.fehler.version', { version: String(s.const) }) }); return; }
  if (s.enum && !s.enum.includes(v)) { aus.push({ pfad, text: t('einrichtung.datei.fehler.auswahl', { werte: s.enum.join(', ') }) }); return; }
  if (s.type && !istTyp(v, s.type)) { aus.push({ pfad, text: t('einrichtung.datei.fehler.typ', { erwartet: t(`einrichtung.datei.${TYPNAMEN[s.type]}`) }) }); return; }
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) aus.push({ pfad, text: t('einrichtung.datei.fehler.leer') });
    else if (s.maxLength !== undefined && v.length > s.maxLength) aus.push({ pfad, text: t('einrichtung.datei.fehler.lang', { max: s.maxLength }) });
    else if (s.pattern && !new RegExp(s.pattern).test(v)) {
      aus.push({ pfad, text: name === 'passwort' ? t('einrichtung.datei.fehler.passwort') : name === 'email' ? t('einrichtung.datei.fehler.email')
        : name === 'adresse' ? t('einrichtung.datei.fehler.adresse') : t('einrichtung.datei.fehler.muster') });
    }
  }
  if (typeof v === 'number' && ((s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum))) {
    aus.push({ pfad, text: t('einrichtung.datei.fehler.bereich', { min: s.minimum ?? '', max: s.maximum ?? '' }) });
  }
  if (Array.isArray(v)) {
    if (s.maxItems !== undefined && v.length > s.maxItems) aus.push({ pfad, text: t('einrichtung.datei.fehler.viele', { max: s.maxItems }) });
    if (s.items) v.forEach((x, i) => pruefe(x, s.items!, [...pfad, i], aus));
  }
  if (s.type === 'object' && v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in o)) aus.push({ pfad: [...pfad, r], text: t('einrichtung.datei.fehler.pflicht'), fehlt: true });
    for (const [k, w] of Object.entries(o)) {
      const unter = s.properties?.[k];
      if (unter) { pruefe(w, unter, [...pfad, k], aus); continue; }
      if (s.additionalProperties === false || s.additionalProperties === undefined && s.properties) { aus.push({ pfad: [...pfad, k], text: t('einrichtung.datei.fehler.unbekannt'), schluessel: true }); continue; }
      if (s.propertyNames?.pattern && (!new RegExp(s.propertyNames.pattern).test(k) || k.length > (s.propertyNames.maxLength ?? Infinity))) { aus.push({ pfad: [...pfad, k], text: t('einrichtung.datei.fehler.muster'), schluessel: true }); continue; }
      if (typeof s.additionalProperties === 'object') pruefe(w, s.additionalProperties, [...pfad, k], aus);
    }
  }
}

const feldname = (pfad: Array<string | number>) => pfad.map((p, i) => (typeof p === 'number' ? `[${p}]` : i ? `.${p}` : p)).join('') || t('einrichtung.datei.ganz');

/** Zeile eines Felds: der Wert (bzw. der Schlüssel); fehlt das Feld, die Zeile des Abschnitts darüber. */
function zeileVon(doc: Document.Parsed, lc: LineCounter, pfad: Array<string | number>, schluessel = false): number | null {
  let knoten: Node | null = doc.contents as Node | null;
  let gefunden = knoten;
  for (let i = 0; i < pfad.length && knoten; i++) {
    const seg = pfad[i];
    let weiter: Node | null = null;
    if (isMap(knoten)) {
      const paar = knoten.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === seg);
      if (paar) weiter = (schluessel && i === pfad.length - 1 ? paar.key : paar.value ?? paar.key) as Node | null;
    } else if (isSeq(knoten) && typeof seg === 'number') weiter = (knoten.items[seg] as Node | undefined) ?? null;
    knoten = weiter;
    if (knoten) gefunden = knoten;
  }
  const start = gefunden?.range?.[0];
  return start === undefined ? null : lc.linePos(start).line;
}

/* ---------- Datei ⇄ Plan ---------- */

type Roh = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function planAus(o: Roh): Einrichtungsplan {
  const db = o.datenbank as Roh | undefined;
  const konto = o.konto as Roh;
  const opt = (o.optionales ?? {}) as Roh;
  const m = opt['e-mail'] as Roh | undefined;
  const mail: PlanMail | null = m ? {
    aktiv: m.aktiv !== false, host: str(m.server), port: typeof m.port === 'number' ? m.port : m.verbindung === 'ssl' ? 465 : m.verbindung === 'keine' ? 25 : 587,
    verbindung: (m.verbindung as PlanMail['verbindung']) ?? 'starttls', benutzer: str(m.benutzer), absender: str(m.absender), selbstsigniert: m.selbstsigniert === true,
    ...(typeof m.passwort === 'string' ? { passwort: m.passwort } : {}),
  } : null;
  return {
    datenbank: db ? { host: str(db.rechner), port: db.port as number, datenbank: str(db.name), benutzer: str(db.benutzer), ...(typeof db.passwort === 'string' ? { passwort: db.passwort } : {}) } : null,
    ablage: str(o.ablage).replace(/\s+/g, ' ').trim(),
    konto: { name: str(konto.name), email: str(konto.email), ...(typeof konto.passwort === 'string' ? { passwort: konto.passwort } : {}) },
    pakete: Array.isArray(o.pakete) ? (o.pakete as Roh[]).map((p) => ({ id: str(p.id), beispiele: p.beispiele === true, automatisierungen: { ...((p.automatisierungen ?? {}) as Record<string, boolean>) } })) : null,
    optional: { adresse: typeof opt.adresse === 'string' ? opt.adresse : null, bundesland: typeof opt.bundesland === 'string' ? opt.bundesland : null, beispiele: opt.beispiele === true, mail },
  };
}

/**
 * Ältere Dateien (0.191, 0.192): `administrator` gilt als `konto`, `erster-benutzer` fällt mit Hinweis weg. Liefert das
 * umgestellte Objekt und, unter welchem Namen der Abschnitt in der Datei steht (für Zeile und Feld der Fehler).
 */
function aelter(wert: unknown): { wert: unknown; kontoIn: string; hinweise: string[] } {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return { wert, kontoIn: 'konto', hinweise: [] };
  const o: Roh = { ...(wert as Roh) };
  const hinweise: string[] = [];
  let kontoIn = 'konto';
  if (!('konto' in o) && 'administrator' in o) { o.konto = o.administrator; delete o.administrator; kontoIn = 'administrator'; }
  if ('erster-benutzer' in o) {
    const e = o['erster-benutzer'] as Roh | null;
    const wer = e && typeof e === 'object' ? str(e.name) || str(e.email) : '';
    hinweise.push(t('einrichtung.datei.hinweis.benutzer', { wer: wer || '–' }));
    delete o['erster-benutzer'];
  }
  return { wert: o, kontoIn, hinweise };
}

/** Liest eine Konfigurationsdatei; bei Fehlern kein Plan, sondern die Fehler mit Zeile und Feld. */
export function liesEinrichtungsdatei(text: unknown): { plan: Einrichtungsplan | null; fehler: DateiFehler[]; hinweise: string[] } {
  if (typeof text !== 'string' || !text.trim()) return { plan: null, fehler: [{ zeile: null, feld: t('einrichtung.datei.ganz'), text: t('einrichtung.datei.fehler.leer.datei') }], hinweise: [] };
  if (Buffer.byteLength(text) > DATEI_MAX) throw new Fachfehler(413, t('einrichtung.datei.fehler.gross', { kb: DATEI_MAX / KB }));
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: true, uniqueKeys: true });
  if (doc.errors.length) {
    return { plan: null, fehler: doc.errors.map((e) => ({ zeile: e.linePos?.[0].line ?? null, feld: t('einrichtung.datei.ganz'), text: t('einrichtung.datei.fehler.syntax', { meldung: e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '') }) })), hinweise: [] };
  }
  const { wert, kontoIn, hinweise } = aelter(doc.toJS({ maxAliasCount: 0 }) as unknown);
  const v: Verstoss[] = [];
  pruefe(wert, SCHEMA, [], v);
  // Zeile und Feld so, wie es in der Datei steht (auch „administrator“ aus älteren Dateien).
  const inDatei = (pfad: Array<string | number>) => (pfad[0] === 'konto' ? [kontoIn, ...pfad.slice(1)] : pfad);
  if (v.length) {
    return {
      plan: null, hinweise,
      fehler: v.map((x) => { const p = inDatei(x.pfad); return { zeile: x.fehlt ? zeileVon(doc, lc, p.slice(0, -1), true) : zeileVon(doc, lc, p, x.schluessel), feld: feldname(p), text: x.text }; }),
    };
  }
  return { plan: planAus(wert as Roh), fehler: [], hinweise };
}

/** Kommentar über einem Abschnitt. */
const ueber = (doc: Document, schluessel: string, text: string) => {
  const p = (doc.contents as { items?: Array<{ key: unknown }> } | null)?.items?.find((x) => isScalar(x.key) && x.key.value === schluessel);
  if (p && isScalar(p.key)) p.key.commentBefore = ` ${text}`;
};

/** Schreibt einen Plan als YAML – mit kurzen Kommentaren, ohne Passwörter und ohne Schlüssel. */
export function schreibeEinrichtungsdatei(plan: Einrichtungsplan): string {
  const o: Roh = { 'ablago-einrichtung': EINRICHTUNG_FORMAT };
  if (plan.datenbank) {
    const d = plan.datenbank;
    o.datenbank = { rechner: d.host, port: d.port, name: d.datenbank, benutzer: d.benutzer, ...(d.passwort ? { passwort: d.passwort } : {}) };
  }
  o.ablage = plan.ablage;
  o.konto = { ...(plan.konto.name ? { name: plan.konto.name } : {}), email: plan.konto.email, ...(plan.konto.passwort ? { passwort: plan.konto.passwort } : {}) };
  if (plan.pakete) {
    o.pakete = plan.pakete.map((p) => ({
      id: p.id, ...(p.beispiele ? { beispiele: true } : {}),
      ...(Object.keys(p.automatisierungen).length ? { automatisierungen: Object.fromEntries(Object.entries(p.automatisierungen).sort(([a], [b]) => a.localeCompare(b))) } : {}),
    }));
  }
  const opt: Roh = {};
  if (plan.optional.adresse) opt.adresse = plan.optional.adresse;
  if (plan.optional.bundesland) opt.bundesland = plan.optional.bundesland;
  opt.beispiele = plan.optional.beispiele;
  const m = plan.optional.mail;
  if (m) opt['e-mail'] = { aktiv: m.aktiv, server: m.host, port: m.port, verbindung: m.verbindung, benutzer: m.benutzer, absender: m.absender, selbstsigniert: m.selbstsigniert, ...(m.passwort ? { passwort: m.passwort } : {}) };
  o.optionales = opt;

  const doc = new Document(o);
  doc.commentBefore = [
    ` ${t('einrichtung.datei.kommentar.kopf')}`,
    ` ${t('einrichtung.datei.kommentar.geheim')}`,
    ` ${t('einrichtung.datei.kommentar.schema', { url: SCHEMA.$id! })}`,
  ].join('\n');
  ueber(doc, 'datenbank', t('einrichtung.datei.kommentar.datenbank'));
  ueber(doc, 'ablage', t('einrichtung.datei.kommentar.ablage'));
  ueber(doc, 'konto', t('einrichtung.datei.kommentar.konto'));
  ueber(doc, 'pakete', t('einrichtung.datei.kommentar.pakete'));
  ueber(doc, 'optionales', t('einrichtung.datei.kommentar.optionales'));
  return doc.toString({ lineWidth: 0 });
}

/** Das veröffentlichte Schema als Datei (Handbücher). */
export const schemaText = () => `${JSON.stringify(SCHEMA, null, 2)}\n`;
