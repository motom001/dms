import { FELDTYPEN, REGISTERARTEN, type Benutzer } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import type { Anfrage, Antwort, Route } from './routen';

/**
 * Öffentliche, stabile Schnittstelle /api/v1 (#20).
 *
 * Sie verwendet dieselben Funktionen wie die Oberfläche, hat aber eigene, feste
 * Adressen: Ändert sich die Oberfläche intern, bleibt /api/v1 gleich. Nur hier
 * gelten API-Schlüssel (Authorization: Bearer dms_…); eine Sitzung der
 * Oberfläche funktioniert ebenfalls. Die OpenAPI-Beschreibung entsteht aus
 * derselben Tabelle und passt damit immer zur installierten Version.
 */

type Schema = Record<string, unknown>;
interface Parameter { name: string; wo: 'path' | 'query'; typ: 'string' | 'integer' | 'boolean'; pflicht?: boolean; beschreibung: string }
interface V1 {
  methode: Route['methode'];
  pfad: string;
  gruppe: 'Konto' | 'Ablage' | 'Dokumente' | 'Werkbank';
  zusammenfassung: string;
  beschreibung?: string;
  /** Interne Route, deren Handler genutzt wird. */
  intern?: { methode: Route['methode']; pfad: string };
  /** Eigener Handler, wenn Parameter abweichen. */
  handler?: (a: Anfrage, intern: (m: Route['methode'], p: string) => Route) => Promise<Antwort>;
  parameter?: Parameter[];
  body?: string | 'binaer';
  antwort?: string | 'binaer' | null;
  status?: number;
}

const id = (was: string): Parameter => ({ name: 'id', wo: 'path', typ: 'string', pflicht: true, beschreibung: `Id ${was} (UUID)` });

export const V1_TABELLE: V1[] = [
  { methode: 'GET', pfad: '/ich', gruppe: 'Konto', zusammenfassung: 'Wer bin ich?', beschreibung: 'Benutzer und Rechte des verwendeten Schlüssels.', antwort: 'Ich',
    handler: async (a) => ({ body: { benutzer: a.benutzer, schluessel: a.apiSchluessel ? { name: a.apiSchluessel.name, recht: a.apiSchluessel.recht, ablauf: a.apiSchluessel.ablauf } : null } }) },

  { methode: 'GET', pfad: '/typen', gruppe: 'Ablage', zusammenfassung: 'Alle Mappentypen', beschreibung: 'Felder, Register, Titel-Vorlage und Trefferliste je Typ. Feldschlüssel sind die Namen in `werte` einer Mappe.', intern: { methode: 'GET', pfad: '/api/typen' }, antwort: 'MappentypListe' },
  { methode: 'GET', pfad: '/sichten', gruppe: 'Ablage', zusammenfassung: 'Anzahl Mappen je Typ und im Eingang', intern: { methode: 'GET', pfad: '/api/sichten' }, antwort: 'Zaehler' },
  {
    methode: 'GET', pfad: '/mappen', gruppe: 'Ablage', zusammenfassung: 'Mappen einer Sicht, seitenweise',
    beschreibung: 'Mappen eines Typs (oder des eigenen Eingangs), sortiert und seitenweise. `bezuege` enthält Titel und Typ der Mappen, auf die die gelieferten Mappen verweisen.',
    parameter: [
      { name: 'sicht', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Id eines Mappentyps oder „eingang“' },
      { name: 'von', wo: 'query', typ: 'integer', beschreibung: 'Erster Eintrag (ab 0), Standard 0' },
      { name: 'anzahl', wo: 'query', typ: 'integer', beschreibung: 'Anzahl, 1–500, Standard 100' },
      { name: 'suche', wo: 'query', typ: 'string', beschreibung: 'Text in Titel oder Werten' },
      { name: 'sortierung', wo: 'query', typ: 'string', beschreibung: 'Feldschlüssel oder _titel, _typ, _erstellt, _erstelltVon, _geaendert, _geaendertVon; Standard _titel' },
      { name: 'absteigend', wo: 'query', typ: 'boolean', beschreibung: 'true = absteigend' },
    ],
    antwort: 'Seite',
    handler: async (a, intern) => {
      if (!a.query.sicht) throw new Fachfehler(422, 'Bitte „sicht“ angeben: die Id eines Mappentyps oder „eingang“.');
      return intern('GET', '/api/mappen').handler(a);
    },
  },
  { methode: 'GET', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Eine Mappe mit Dokumenten und Rückverweisen', intern: { methode: 'GET', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], antwort: 'MappeDetails' },
  { methode: 'POST', pfad: '/mappen', gruppe: 'Ablage', zusammenfassung: 'Mappe anlegen', beschreibung: 'Die Werte werden wie in der Oberfläche geprüft (Pflichtfelder, Längen, eindeutige Werte, Verweise). Bei Fehlern: 422 mit `details` je Feld.', intern: { methode: 'POST', pfad: '/api/mappen' }, body: 'MappeEingabe', antwort: 'Mappe', status: 201 },
  { methode: 'PUT', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe ändern', beschreibung: 'Übergebene Werte ersetzen die bisherigen; Werte von Feldern, die es im Typ nicht mehr gibt, bleiben erhalten.', intern: { methode: 'PUT', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], body: 'MappeAenderung', antwort: 'Mappe' },
  { methode: 'DELETE', pfad: '/mappen/{id}', gruppe: 'Ablage', zusammenfassung: 'Mappe löschen', beschreibung: 'Samt ihrer Dokumente. 409, solange andere Mappen auf sie verweisen.', intern: { methode: 'DELETE', pfad: '/api/mappen/:id' }, parameter: [id('der Mappe')], antwort: null, status: 204 },

  {
    methode: 'POST', pfad: '/mappen/{id}/dokumente', gruppe: 'Dokumente', zusammenfassung: 'Dokument hochladen',
    beschreibung: 'Rohe Bytes der Datei als Body (Content-Type: application/octet-stream), höchstens 100 MB. Gleicher Inhalt wird nur einmal gespeichert.',
    intern: { methode: 'POST', pfad: '/api/mappen/:id/dokumente' },
    parameter: [id('der Mappe'),
      { name: 'register', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Schlüssel eines Dokumentenregisters des Mappentyps' },
      { name: 'name', wo: 'query', typ: 'string', pflicht: true, beschreibung: 'Dateiname' },
      { name: 'typ', wo: 'query', typ: 'string', beschreibung: 'MIME-Typ (nur Angabe; angezeigt werden PDF und Bilder anhand des Inhalts)' }],
    body: 'binaer', antwort: 'Hochgeladen', status: 201,
  },
  { methode: 'GET', pfad: '/dokumente/{id}/inhalt', gruppe: 'Dokumente', zusammenfassung: 'Inhalt eines Dokuments herunterladen', intern: { methode: 'GET', pfad: '/api/dokumente/:id/inhalt' }, parameter: [id('des Dokuments')], antwort: 'binaer' },
  { methode: 'DELETE', pfad: '/dokumente/{id}', gruppe: 'Dokumente', zusammenfassung: 'Dokument löschen', intern: { methode: 'DELETE', pfad: '/api/dokumente/:id' }, parameter: [id('des Dokuments')], antwort: null, status: 204 },

  { methode: 'POST', pfad: '/typen', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp anlegen (Administrator)', intern: { methode: 'POST', pfad: '/api/typen' }, body: 'MappentypEingabe', antwort: 'Mappentyp', status: 201 },
  { methode: 'PUT', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp ändern (Administrator)', beschreibung: 'Titel und Passung aller Mappen des Typs werden neu berechnet.', intern: { methode: 'PUT', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], body: 'MappentypEingabe', antwort: 'Mappentyp' },
  { methode: 'DELETE', pfad: '/typen/{id}', gruppe: 'Werkbank', zusammenfassung: 'Mappentyp löschen (Administrator)', beschreibung: 'Nur ohne Mappen und ohne Verweise anderer Typen.', intern: { methode: 'DELETE', pfad: '/api/typen/:id' }, parameter: [id('des Mappentyps')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Alle Benutzer (Administrator)', intern: { methode: 'GET', pfad: '/api/benutzer' }, antwort: 'BenutzerListe' },
  { methode: 'POST', pfad: '/benutzer', gruppe: 'Werkbank', zusammenfassung: 'Benutzer anlegen und einladen (Administrator)', intern: { methode: 'POST', pfad: '/api/benutzer' }, body: 'BenutzerEingabe', antwort: 'LinkErgebnis', status: 201 },
  { methode: 'PUT', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer ändern (Administrator)', intern: { methode: 'PUT', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], body: 'BenutzerAenderung', antwort: 'Benutzer' },
  { methode: 'DELETE', pfad: '/benutzer/{id}', gruppe: 'Werkbank', zusammenfassung: 'Benutzer löschen (Administrator)', beschreibung: 'Nur solange die Einladung nie angenommen wurde; wer sich schon angemeldet hat, wird über PUT mit aktiv=false deaktiviert.', intern: { methode: 'DELETE', pfad: '/api/benutzer/:id' }, parameter: [id('des Benutzers')], antwort: null, status: 204 },
  { methode: 'GET', pfad: '/rollen', gruppe: 'Werkbank', zusammenfassung: 'Alle Rollen (Administrator)', beschreibung: 'Systemrollen (Administrator, Mitglied) zuerst. Rollen selbst sind Mappen des Systemmappentyps „Rolle“ und werden wie andere Mappen angelegt, geändert und gelöscht.', intern: { methode: 'GET', pfad: '/api/rollen' }, antwort: 'RollenListe' },
];

/** Routen /api/v1/… aus der Tabelle; Handler und Zugang kommen von den internen Routen. */
export function v1Routen(intern: Route[]): Route[] {
  const finde = (m: Route['methode'], p: string) => {
    const r = intern.find((x) => x.methode === m && x.pfad === p);
    if (!r) throw new Error(`Interne Route fehlt: ${m} ${p}`);
    return r;
  };
  return V1_TABELLE.map((e) => {
    const basis = e.intern ? finde(e.intern.methode, e.intern.pfad) : undefined;
    return {
      methode: e.methode,
      pfad: `/api/v1${e.pfad.replace(/\{(\w+)\}/g, ':$1')}`,
      zugang: basis?.zugang ?? 'angemeldet',
      roh: basis?.roh,
      api: true,
      handler: e.handler ? (a: Anfrage) => e.handler!(a, finde) : basis!.handler,
    } satisfies Route;
  });
}

/* ---------- OpenAPI ---------- */

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const liste = (n: string) => ({ type: 'array', items: ref(n) });
const uuid = { type: 'string', format: 'uuid' };
const zeit = { type: 'string', format: 'date-time' };
const weitereRollen = { type: 'array', items: uuid, description: 'Weitere (fachliche) Rollen: Ids von Rollen-Mappen, ohne Administrator und Mitglied' };

const SCHEMAS: Record<string, Schema> = {
  Fehler: { type: 'object', required: ['fehler'], properties: { fehler: { type: 'string', description: 'Meldung auf Deutsch' }, details: { description: 'Je nach Fehler, z. B. Prüfergebnis bei 422' } } },
  Pruefergebnis: { type: 'object', properties: { allgemein: { type: 'array', items: { type: 'string' } }, felder: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, description: 'Meldungen je Feldschlüssel' } } },
  Feld: {
    type: 'object', required: ['key', 'label', 'typ'],
    properties: {
      key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,39}$' }, label: { type: 'string' }, typ: { type: 'string', enum: Object.keys(FELDTYPEN) },
      pflicht: { type: 'boolean' }, eindeutig: { type: 'boolean' }, hilfe: { type: 'string' }, minLen: { type: 'integer' }, maxLen: { type: 'integer' },
      min: { type: 'number' }, max: { type: 'number' }, nachkomma: { type: 'integer' }, muster: { type: 'string' }, optionen: { type: 'array', items: { type: 'string' } },
      system: { type: 'boolean', readOnly: true, description: 'Systemfeld eines Systemmappentyps: nicht entfernbar, nur Bezeichnung und Hilfetext änderbar' },
      mehrfach: { type: 'boolean' }, zielTyp: { ...uuid, description: 'Bei typ=referenz: Id des Ziel-Mappentyps' }, verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] }, waehrung: { type: 'string' },
    },
  },
  Register: { type: 'object', required: ['key', 'name', 'art'], properties: { key: { type: 'string' }, name: { type: 'string' }, art: { type: 'string', enum: Object.keys(REGISTERARTEN) }, felder: { type: 'array', items: { type: 'string' } }, quellen: { type: 'array', items: { type: 'object', properties: { typId: uuid, feldKey: { type: 'string' } } } } } },
  MappentypEingabe: {
    type: 'object', required: ['name', 'felder'],
    properties: { name: { type: 'string' }, beschreibung: { type: 'string' }, titelVorlage: { type: 'string', example: '{rechnungsnummer} vom {rechnungsdatum}' }, felder: liste('Feld'), register: liste('Register'), trefferliste: { type: 'array', items: { type: 'string' } },
      erstellenErlaubt: { type: 'boolean', default: true, description: 'Neue Mappen dieses Typs dürfen angelegt werden' },
      loeschenErlaubt: { type: 'boolean', default: true, description: 'Mappen dieses Typs dürfen gelöscht werden' } },
  },
  Mappentyp: { allOf: [ref('MappentypEingabe'), { type: 'object', properties: { id: uuid, erstellt: zeit, geaendert: zeit, system: { type: 'string', enum: ['benutzer', 'rolle'], nullable: true, description: 'Systemmappentyp: lässt sich erweitern, aber nicht löschen' } } }] },
  MappentypListe: liste('Mappentyp'),
  Werte: {
    type: 'object', additionalProperties: true,
    description: 'Werte je Feldschlüssel: Text und Datum (JJJJ-MM-TT) als string, Zahl als number, Ja/Nein als boolean, Betrag als {betrag, waehrung}, Auswahl als string (mehrfach: string[]), Verweis als Mappen-Id (mehrfach: string[]).',
    example: { rechnungsnummer: 'R-2026-17', rechnungsdatum: '2026-10-01', betrag: { betrag: 49.9, waehrung: 'EUR' }, bezahlt: false },
  },
  Mappe: {
    type: 'object',
    properties: {
      id: uuid, typId: uuid, werte: ref('Werte'), titel: { type: 'string', description: 'Vom Server aus der Titel-Vorlage berechnet' },
      erstellt: zeit, erstelltVon: { ...uuid, nullable: true }, geaendert: zeit, geaendertVon: { ...uuid, nullable: true },
      passt: { type: 'boolean', description: 'Passt zur aktuellen Definition des Typs' }, problem: { type: 'string', nullable: true }, demo: { type: 'boolean' },
      systemKennung: { type: 'string', nullable: true, description: 'Mappen, die das System pflegt, z. B. rolle:admin und rolle:mitglied' },
    },
  },
  MappeEingabe: { type: 'object', required: ['typId', 'werte'], properties: { typId: uuid, werte: ref('Werte') } },
  MappeAenderung: { type: 'object', required: ['werte'], properties: { werte: ref('Werte') } },
  Bezug: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } },
  Dokument: {
    type: 'object',
    properties: { id: uuid, mappeId: uuid, registerKey: { type: 'string' }, name: { type: 'string' }, mime: { type: 'string' }, groesse: { type: 'integer' }, sha256: { type: 'string' }, anzeigbar: { type: 'boolean' }, erstellt: zeit, erstelltVon: { ...uuid, nullable: true } },
  },
  MappeDetails: {
    type: 'object',
    properties: {
      mappe: ref('Mappe'), dokumente: liste('Dokument'), bezuege: { type: 'object', additionalProperties: ref('Bezug') },
      rueckverweise: { type: 'array', items: { type: 'object', properties: { quelleId: uuid, quelleTypId: uuid, feldKey: { type: 'string' }, titel: { type: 'string' } } } },
    },
  },
  Seite: { type: 'object', properties: { gesamt: { type: 'integer' }, von: { type: 'integer' }, mappen: liste('Mappe'), bezuege: { type: 'object', additionalProperties: ref('Bezug') } } },
  Zaehler: { type: 'object', properties: { typen: { type: 'object', additionalProperties: { type: 'object', properties: { anzahl: { type: 'integer' }, unpassend: { type: 'integer' }, demo: { type: 'integer' } } } }, eingang: { type: 'integer' } } },
  Hochgeladen: { type: 'object', properties: { dokument: ref('Dokument'), gleicherInhalt: { type: 'array', items: { type: 'object', properties: { mappeId: uuid, name: { type: 'string' }, titel: { type: 'string' }, typId: uuid } } } } },
  Benutzer: {
    type: 'object',
    properties: { id: uuid, email: { type: 'string', format: 'email' }, name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, aktiv: { type: 'boolean' }, hatPasswort: { type: 'boolean' }, erstellt: zeit, letzteAnmeldung: { ...zeit, nullable: true }, rollen: weitereRollen },
  },
  BenutzerListe: liste('Benutzer'),
  BenutzerEingabe: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' }, name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, rollen: weitereRollen } },
  BenutzerAenderung: { type: 'object', properties: { name: { type: 'string' }, rolle: { type: 'string', enum: ['admin', 'mitglied'] }, aktiv: { type: 'boolean' }, rollen: weitereRollen } },
  RollenListe: { type: 'array', items: { type: 'object', properties: { id: uuid, name: { type: 'string' }, system: { type: 'boolean', description: 'Administrator oder Mitglied' } } } },
  LinkErgebnis: { type: 'object', properties: { benutzer: ref('Benutzer'), mailVerschickt: { type: 'boolean' }, link: { type: 'string', description: 'Nur ohne E-Mail-Versand' } } },
  Ich: { type: 'object', properties: { benutzer: ref('Benutzer'), schluessel: { type: 'object', nullable: true, properties: { name: { type: 'string' }, recht: { type: 'string', enum: ['lesen', 'schreiben'] }, ablauf: { ...zeit, nullable: true } } } } },
};

const inhalt = (s: string | 'binaer') => (s === 'binaer'
  ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
  : { 'application/json': { schema: ref(s) } });

export function openapi(version: string, serverUrl?: string): Schema {
  const paths: Record<string, Record<string, Schema>> = {};
  for (const e of V1_TABELLE) {
    const fehler: Record<string, Schema> = {
      401: { description: 'Nicht angemeldet oder Schlüssel ungültig', content: inhalt('Fehler') },
      403: { description: e.gruppe === 'Werkbank' ? 'Nur für Administratoren; oder Schlüssel nur zum Lesen' : 'Schlüssel nur zum Lesen', content: inhalt('Fehler') },
    };
    if (e.parameter?.some((p) => p.wo === 'path')) fehler[404] = { description: 'Nicht gefunden', content: inhalt('Fehler') };
    if (e.body && e.body !== 'binaer') fehler[422] = { description: 'Eingaben ungültig (details: Prüfergebnis)', content: inhalt('Fehler') };
    if (e.methode === 'DELETE') fehler[409] = { description: 'Kann (noch) nicht gelöscht werden', content: inhalt('Fehler') };
    const status = String(e.status ?? 200);
    (paths[e.pfad] ??= {})[e.methode.toLowerCase()] = {
      tags: [e.gruppe],
      summary: e.zusammenfassung,
      ...(e.beschreibung ? { description: e.beschreibung } : {}),
      operationId: `${e.methode.toLowerCase()}${e.pfad.replace(/\{(\w+)\}/g, 'Mit$1').replace(/(^|\/)(\w)/g, (_, _s, c: string) => c.toUpperCase())}`,
      ...(e.parameter ? { parameters: e.parameter.map((p) => ({ name: p.name, in: p.wo, required: !!p.pflicht, description: p.beschreibung, schema: { type: p.typ } })) } : {}),
      ...(e.body ? { requestBody: { required: true, content: inhalt(e.body) } } : {}),
      responses: {
        [status]: e.antwort === null ? { description: 'Erledigt' } : { description: 'Erfolg', ...(e.antwort ? { content: inhalt(e.antwort) } : {}) },
        ...fehler,
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'DMS API',
      version,
      description: 'Schnittstelle des selbst gehosteten DMS. Anmeldung mit einem API-Schlüssel aus dem Profil: `Authorization: Bearer dms_…`. Ein Schlüssel hat höchstens die Rechte seines Benutzers; Schlüssel „nur lesen“ erlauben nur GET. Diese Beschreibung entsteht aus der installierten Version.',
      license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
    servers: [{ url: `${serverUrl?.replace(/\/$/, '') ?? ''}/api/v1` }],
    security: [{ apiSchluessel: [] }],
    tags: [
      { name: 'Konto', description: 'Wer ist angemeldet' }, { name: 'Ablage', description: 'Mappentypen lesen, Mappen anlegen, lesen, ändern, löschen' },
      { name: 'Dokumente', description: 'Dateien an Mappen' }, { name: 'Werkbank', description: 'Nur mit dem Schlüssel eines Administrators' },
    ],
    paths,
    components: {
      securitySchemes: { apiSchluessel: { type: 'http', scheme: 'bearer', bearerFormat: 'dms_…', description: 'API-Schlüssel aus dem Profil' } },
      schemas: SCHEMAS,
    },
  };
}

/** Für Protokoll und Anzeige: wer über welchen Schlüssel fragt. */
export const wer = (b: Benutzer | undefined, schluessel?: { name: string }) => (b ? (schluessel ? `${b.email} (API: ${schluessel.name})` : b.email) : undefined);
