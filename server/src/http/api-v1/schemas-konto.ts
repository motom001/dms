/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Konto. */
import type { Schema } from './typen';
import { uuid, zeit, weitereRollen, liste, ref } from './schema-hilfen';

/** Benutzer, Rollen, Konto, Zusammenfassung, Region, Abwesenheit, Entdecken, Zählerstand und „Wer bin ich?“. */
export const SCHEMAS_KONTO: Record<string, Schema> = {
  Benutzer: {
    type: 'object',
    properties: {
      id: uuid,
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      rolle: {
        type: 'string',
        enum: ['admin', 'mitglied'],
        description: 'Wirksame Rolle der Anfrage: admin nur im Verwaltungsmodus (#819), mit API-Schlüssel immer mitglied',
      },
      verwaltung: {
        type: 'array',
        items: { type: 'string' },
        description: 'Verwaltungsrecht an der Person (#818): leer, ["*"] = Gesamte Verwaltung, sonst Werkbank-Bereiche',
      },
      aktiv: { type: 'boolean' },
      hatPasswort: { type: 'boolean' },
      erstellt: zeit,
      letzteAnmeldung: { ...zeit, nullable: true },
      rollen: weitereRollen,
    },
  },
  BenutzerListe: liste('Benutzer'),
  BenutzerEingabe: {
    type: 'object',
    required: ['email'],
    properties: { email: { type: 'string', format: 'email' }, name: { type: 'string' }, rollen: weitereRollen },
  },
  BenutzerAenderung: { type: 'object', properties: { name: { type: 'string' }, aktiv: { type: 'boolean' }, rollen: weitereRollen } },
  RollenListe: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: uuid,
        name: { type: 'string' },
        system: { type: 'boolean', description: 'Systemrolle (Mitglied, Systemkonto, Paket)' },
      },
    },
  },
  LinkErgebnis: {
    type: 'object',
    properties: {
      benutzer: ref('Benutzer'),
      mailVerschickt: { type: 'boolean' },
      link: { type: 'string', description: 'Nur ohne E-Mail-Versand' },
    },
  },
  ZusammenfassungEingabe: {
    type: 'object',
    properties: {
      aktiv: { type: 'boolean' },
      uhrzeit: { type: 'string', nullable: true, example: '07:00' },
      tage: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } },
      feiertage: { type: 'boolean' },
    },
  },
  Region: {
    type: 'object',
    required: ['land', 'bundesland', 'zeitzone'],
    properties: {
      land: { type: 'string', description: 'ISO 3166-1, z. B. DE' },
      bundesland: { type: 'string', nullable: true, description: 'Kürzel, z. B. BY; null = ohne Feiertage' },
      zeitzone: { type: 'string', description: 'IANA, z. B. Europe/Berlin' },
      formate: {
        type: 'object',
        description: 'Formate der Region (#1610); null = wie die Sprache',
        properties: {
          datum: { type: 'string', nullable: true, enum: ['tt.mm.jjjj', 'jjjj-mm-tt', 'tt/mm/jjjj', 'mm/tt/jjjj'] },
          uhrzeit: { type: 'string', nullable: true, enum: ['24', '12'] },
          zahlen: { type: 'string', nullable: true, enum: ['1.234,56', '1,234.56', '1 234,56', '1’234.56'] },
          waehrungStellung: { type: 'string', nullable: true, enum: ['vorne', 'hinten'] },
          waehrung: { type: 'string', example: 'EUR' },
          telefon: { type: 'string', enum: ['kanonisch', 'din-international', 'din-national'] },
          vorwahl: { type: 'string', example: '49', description: 'Standard-Ländervorwahl ohne +' },
          arbeitstage: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } },
          wochenbeginn: { type: 'integer', nullable: true, enum: [1, 6, 7] },
        },
      },
    },
  },
  Zusammenfassung: {
    type: 'object',
    properties: {
      aktiv: { type: 'boolean' },
      uhrzeit: { type: 'string', nullable: true },
      tage: { type: 'array', items: { type: 'integer' } },
      feiertage: { type: 'boolean' },
      standard: {
        type: 'object',
        properties: {
          uhrzeit: { type: 'string' },
          tage: { type: 'array', items: { type: 'integer' } },
          bundesland: { type: 'string', nullable: true },
        },
      },
      versand: { type: 'boolean' },
    },
  },
  Abwesenheit: {
    type: 'object',
    required: ['an'],
    properties: {
      an: { type: 'boolean' },
      von: { type: 'string', format: 'date', nullable: true },
      bis: { type: 'string', format: 'date', nullable: true },
      vertreterId: { ...uuid, nullable: true },
    },
  },
  EntdeckenStand: {
    type: 'object',
    required: ['rundgaenge', 'tipps', 'tipp', 'tippsAn', 'starten'],
    properties: {
      rundgaenge: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            schluessel: { type: 'string' },
            herkunft: { type: 'string', description: 'ablago oder paket:<id>' },
            start: { type: 'string', enum: ['manuell', 'erste_anmeldung', 'nach_installation', 'nach_update'] },
            oeffne: { type: 'object', description: '{ seite } oder { mappe: <Mappentyp> } bzw. { neu: <Mappentyp> }' },
            ersatz: { type: 'string' },
            titel: { type: 'string' },
            beschreibung: { type: 'string' },
            ende: { type: 'string' },
            schritte: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  schluessel: { type: 'string' },
                  ziel: { type: 'array', items: { type: 'string' }, description: 'Anker; der erste sichtbare gilt' },
                  titel: { type: 'string' },
                  text: { type: 'string' },
                  textHandy: { type: 'string' },
                  ort: { type: 'string', description: 'Wo die Stelle steht (für Screenreader)' },
                },
              },
            },
          },
        },
      },
      tipps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            schluessel: { type: 'string' },
            herkunft: { type: 'string' },
            bereich: { type: 'string', enum: ['suche', 'post', 'fristen', 'mappen', 'konto', 'verwalten'] },
            text: { type: 'string' },
            ziel: {
              type: 'object',
              properties: {
                anker: { type: 'string' },
                seite: { type: 'string', description: 'Pfad in der Oberfläche, z. B. /ablage/start' },
                typ: { type: 'string', description: 'Ohne seite: Die Stelle liegt in einer Mappe dieses Typs' },
              },
            },
            rundgang: { type: 'string' },
            neu: { type: 'boolean' },
            ausgeblendet: { type: 'boolean' },
            clients: { type: 'boolean' },
          },
        },
      },
      tipp: {
        type: 'object',
        nullable: true,
        properties: { schluessel: { type: 'string' }, weitere: { type: 'integer', description: 'Weitere Neuheiten („und 2 weitere“)' } },
      },
      tippsAn: { type: 'boolean' },
      starten: { type: 'string', nullable: true },
    },
  },
  TippHandlung: {
    type: 'object',
    required: ['aktion'],
    properties: { aktion: { type: 'string', enum: ['gezeigt', 'erledigt', 'ausblenden', 'einblenden'] } },
  },
  RundgangMerker: { type: 'object', required: ['stand'], properties: { stand: { type: 'string', enum: ['gesehen', 'spaeter'] } } },
  AbwesenheitStand: {
    type: 'object',
    properties: { abwesenheit: { ...ref('Abwesenheit'), nullable: true }, offeneAufgaben: { type: 'integer' } },
  },
  Zaehlerstand: {
    type: 'object',
    required: ['neuePost', 'zuErledigen', 'ueberfaellig', 'stand', 'geaendert'],
    additionalProperties: false,
    properties: {
      neuePost: { type: 'integer', minimum: 0, description: 'Post im Stand „Neu“ für dich oder ohne „An“ (bis 0.241 „Für“)' },
      zuErledigen: { type: 'integer', minimum: 0, description: 'Mappen unter „Zu erledigen“' },
      ueberfaellig: { type: 'integer', minimum: 0, description: 'Offene Fristen, Erinnerungen und Aufgaben mit Datum vor heute' },
      stand: { type: 'integer', minimum: 1, description: 'Zählt hoch, sobald sich eine Zahl ändert' },
      geaendert: { ...zeit, description: 'Wann sich die Zahlen zuletzt geändert haben (beim Abruf bemerkt)' },
    },
    example: { neuePost: 2, zuErledigen: 5, ueberfaellig: 1, stand: 42, geaendert: '2026-11-03T07:15:00.000Z' },
  },
  Ich: {
    type: 'object',
    properties: {
      benutzer: ref('Benutzer'),
      schluessel: {
        type: 'object',
        nullable: true,
        properties: {
          name: { type: 'string' },
          recht: {
            type: 'string',
            enum: ['lesen', 'schreiben', 'zaehler'],
            description: 'zaehler = „nur Zähler“ (#625): nur GET /ich/zaehler',
          },
          passwoerter: { type: 'boolean', description: 'Recht „Passwörter lesen“' },
          ablauf: { ...zeit, nullable: true },
        },
      },
    },
  },
};
