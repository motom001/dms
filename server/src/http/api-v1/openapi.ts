/** OpenAPI-Beschreibung von /api/v1 aus der Tabelle (#1278, vorher in `http/api-v1.ts`). */
import { ref } from './schema-hilfen';
import type { Schema } from './typen';
import { V1_TABELLE } from './tabelle';
import { SCHEMAS } from './schemas';

const inhalt = (s: string | 'binaer') =>
  s === 'binaer'
    ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
    : { 'application/json': { schema: ref(s) } };

/** `info.version` der Beschreibung ohne Anmeldung (#1067): nur die Version der API, nicht die von Ablago. */
export const API_VERSION_OHNE_ANMELDUNG = '1';

export function openapi(version: string, serverUrl?: string): Schema {
  const paths: Record<string, Record<string, Schema>> = {};
  for (const e of V1_TABELLE) {
    const fehler: Record<string, Schema> = {
      401: { description: 'Nicht angemeldet oder Schlüssel ungültig', content: inhalt('Fehler') },
      403: {
        description: e.nichtGeaendert
          ? 'Nur bei Anmeldung mit Sitzung: Zwei-Faktor-Anmeldung ist vorgeschrieben, aber noch nicht eingerichtet'
          : `${e.gruppe === 'Werkbank' ? 'Werkbank: nie mit einem API-Schlüssel (#818), nur in der Oberfläche im Verwaltungsmodus; oder ' : ''}Schlüssel nur zum Lesen oder nur Zähler`,
        content: inhalt('Fehler'),
      },
    };
    if (e.nichtGeaendert) fehler[304] = { description: 'Nichts geändert: If-None-Match passt zum aktuellen ETag; ohne Inhalt' };
    if (e.parameter?.some((p) => p.wo === 'path')) fehler[404] = { description: 'Nicht gefunden', content: inhalt('Fehler') };
    if (e.body && e.body !== 'binaer')
      fehler[422] = { description: 'Eingaben ungültig (details: Prüfergebnis)', content: inhalt('Fehler') };
    if (e.methode === 'DELETE') fehler[409] = { description: 'Kann (noch) nicht gelöscht werden', content: inhalt('Fehler') };
    if (e.konflikt) fehler[409] = { description: e.konflikt, content: inhalt('Fehler') };
    const status = String(e.status ?? 200);
    (paths[e.pfad] ??= {})[e.methode.toLowerCase()] = {
      tags: [e.gruppe],
      summary: e.zusammenfassung,
      ...(e.beschreibung ? { description: e.beschreibung } : {}),
      operationId: `${e.methode.toLowerCase()}${e.pfad.replace(/\{(\w+)\}/g, 'Mit$1').replace(/(^|\/)(\w)/g, (_, _s, c: string) => c.toUpperCase())}`,
      ...(e.parameter || e.nichtGeaendert
        ? {
            parameters: [
              ...(e.parameter ?? []).map((p) => ({
                name: p.name,
                in: p.wo,
                required: !!p.pflicht,
                description: p.beschreibung,
                schema: { type: p.typ },
              })),
              ...(e.nichtGeaendert
                ? [
                    {
                      name: 'If-None-Match',
                      in: 'header',
                      required: false,
                      description: 'ETag des letzten Abrufs; passt es, kommt 304 ohne Inhalt',
                      schema: { type: 'string' },
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...(e.body ? { requestBody: { required: true, content: inhalt(e.body) } } : {}),
      responses: {
        [status]:
          e.antwort === null
            ? { description: 'Erledigt' }
            : {
                description: 'Erfolg',
                ...(e.antwort ? { content: inhalt(e.antwort) } : {}),
                ...(e.nichtGeaendert
                  ? { headers: { ETag: { description: 'Stand der Zahlen; mit If-None-Match zurückschicken', schema: { type: 'string' } } } }
                  : {}),
              },
        ...fehler,
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ablago API',
      version,
      description:
        'Schnittstelle von Ablago, selbst gehostet. Anmeldung mit einem API-Schlüssel aus dem Profil: `Authorization: Bearer dms_…`. Ein Schlüssel hat höchstens die Rechte seines Benutzers; Schlüssel „nur lesen“ erlauben nur GET und die Merker gesehen/ausgeblendet unter /entdecken (#1307), Schlüssel „nur Zähler“ nur GET /ich/zaehler (alles andere 403). Diese Beschreibung entsteht aus der installierten Version. Übergänge bis 1.0.0: Post mit von/an statt absender/fuer (#1042, siehe Werte).',
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    servers: [{ url: `${serverUrl?.replace(/\/$/, '') ?? ''}/api/v1` }],
    security: [{ apiSchluessel: [] }],
    tags: [
      { name: 'Konto', description: 'Wer ist angemeldet' },
      { name: 'Ablage', description: 'Mappentypen lesen, Mappen anlegen, lesen, ändern, löschen' },
      { name: 'Dokumente', description: 'Dateien an Mappen' },
      {
        name: 'Werkbank',
        description:
          'Nicht mit API-Schlüsseln: Sie bekommen nie Verwaltungsrechte (#818). Verwaltet wird in der Oberfläche im Verwaltungsmodus oder mit dem Befehl dms im Container.',
      },
    ],
    paths,
    components: {
      securitySchemes: {
        apiSchluessel: { type: 'http', scheme: 'bearer', bearerFormat: 'dms_…', description: 'API-Schlüssel aus dem Profil' },
      },
      schemas: SCHEMAS,
    },
  };
}
