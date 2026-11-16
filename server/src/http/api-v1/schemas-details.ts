/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Mappe mit Einzelheiten. */
import type { Schema } from './typen';
import { uuid, ref, zeit, liste } from './schema-hilfen';

/** Vorlagen, Text setzen, Paket-Aktionen, Hinweise, Mappe mit Einzelheiten, Tabellen, Seiten, Aufgaben, Sammelaktionen, Erwähnungen und Notizen. */
export const SCHEMAS_DETAILS: Record<string, Schema> = {
  VorlagenListe: {
    type: 'object',
    description: 'Text-Vorlagen einer Mappe (#1040)',
    properties: {
      vorlagen: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dokumentId: uuid,
            name: { type: 'string' },
            quelle: { type: 'object', properties: { mappeId: uuid, titel: { type: 'string' } } },
            paket: { type: 'object', nullable: true, properties: { id: { type: 'string' }, name: { type: 'string' } } },
            platzhalter: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  beschriftung: { type: 'string' },
                  fehlt: { type: 'boolean' },
                  feld: { type: 'string', description: 'Feld der Mappe (erster Teil des Platzhalters)' },
                },
              },
            },
            absender: { type: 'string', nullable: true, description: 'Name im Briefkopf' },
            empfaenger: { type: 'string', nullable: true, description: 'Name in der Anschrift' },
          },
        },
      },
      register: {
        type: 'array',
        items: { type: 'object', properties: { key: { type: 'string' }, name: { type: 'string' } } },
        description: 'Dokumentenregister zum Ablegen',
      },
      ablegen: { type: 'boolean', description: 'Recht Bearbeiten an der Mappe' },
      herunterladen: { type: 'boolean', description: 'Lesen und Exportrecht E' },
    },
  },
  TextSetzen: {
    type: 'object',
    properties: {
      ziel: { type: 'string', enum: ['ablegen', 'herunterladen'], description: 'Standard: ablegen' },
      register: { type: 'string', description: 'Kennung eines Dokumentenregisters (nur ablegen)' },
      lauf: {
        type: 'string',
        description: 'Paket-Aktion mit dms:vorlage (#1039): nur Vorlagen dieses Pakets; Historie nennt Person und Paket',
      },
    },
  },
  TextGesetzt: {
    type: 'object',
    description: 'Abgelegt (#1040); mit ziel = herunterladen kommt stattdessen das PDF (application/pdf)',
    properties: {
      pdf: ref('Dokument'),
      text: ref('Dokument'),
      luecken: { type: 'array', items: { type: 'string' }, description: 'Platzhalter, die als Lücke im Brief stehen' },
    },
  },
  AktionenAnMappe: {
    type: 'object',
    description: 'Aktionen von Paketen an einer Mappe (#1039)',
    properties: {
      aktionen: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            paket: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            schluessel: { type: 'string' },
            name: { type: 'string' },
            beschreibung: { type: 'string' },
            rechte: {
              type: 'array',
              items: { type: 'string', enum: ['lesen', 'dokument_hinzufuegen', 'aendern', 'mappen_anlegen', 'herausgeben'] },
            },
            dialog: { type: 'string', enum: ['dms:vorlage'] },
            gesperrt: { type: 'string', description: 'Grund, solange die Bedingung nicht zutrifft' },
          },
        },
      },
      eingebautAus: { type: 'array', items: { type: 'string', enum: ['aufgabe', 'erinnern', 'email', 'drucken', 'link'] } },
    },
  },
  AktionsSchritt: {
    type: 'object',
    description: 'Antwort eines Schritts (#1039): dialog, ergebnis oder kern',
    properties: {
      lauf: { type: 'string' },
      paket: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      aktion: { type: 'string' },
      name: { type: 'string' },
      schritt: { type: 'integer' },
      dialog: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          knopf: { type: 'string' },
          gefahr: { type: 'boolean' },
          felder: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                art: { type: 'string', enum: ['text', 'auswahl', 'haken', 'textfeld', 'datum'] },
                schluessel: { type: 'string' },
                name: { type: 'string' },
                text: { type: 'string' },
                hilfe: { type: 'string' },
                optionen: { type: 'array', items: { type: 'object', properties: { wert: { type: 'string' }, name: { type: 'string' } } } },
                mehrfach: { type: 'boolean' },
                pflicht: { type: 'boolean' },
              },
            },
          },
        },
      },
      ergebnis: {
        type: 'object',
        properties: {
          meldung: { type: 'string' },
          dokument: { type: 'object', properties: { id: uuid, name: { type: 'string' }, registerKey: { type: 'string' } } },
          geaendert: { type: 'array', items: { type: 'string' } },
          mappen: { type: 'array', items: { type: 'object', properties: { id: uuid, typId: uuid, titel: { type: 'string' } } } },
          datei: { type: 'object', properties: { name: { type: 'string' }, groesse: { type: 'integer' } } },
        },
      },
      kern: { type: 'string', enum: ['dms:vorlage'] },
    },
  },
  AktionsAntworten: { type: 'object', properties: { antworten: { type: 'object', additionalProperties: true } } },
  HinweisEingabe: {
    type: 'object',
    required: ['text'],
    properties: { text: { type: 'string', maxLength: 300, description: 'Nur Text, ohne HTML, Markdown und Links' } },
  },
  PaketHinweis: {
    type: 'object',
    description: 'Hinweis eines Pakets an einer Mappe (#1034)',
    properties: {
      paket: { type: 'string', description: 'Id des Pakets' },
      paketName: { type: 'string' },
      schluessel: { type: 'string' },
      text: { type: 'string' },
      gesetzt: zeit,
    },
  },
  MappeDetails: {
    type: 'object',
    properties: {
      hinweise: {
        type: 'array',
        items: ref('PaketHinweis'),
        description: 'Hinweise von Paketen (#1034), älteste zuerst – für alle, die die Mappe lesen',
      },
      vorgabe: {
        type: 'object',
        description: 'Vorgabe aus einem Paket (#1038), solange es installiert ist: Id und Name des Pakets',
        properties: { paket: { type: 'string' }, paketName: { type: 'string' } },
      },
      erinnerungen: {
        type: 'array',
        items: ref('MappenAblauf'),
        description: 'Geplante Mappen-Abläufe (#1044; bis 0.255 nur Erinnerungen) – der Bereich „Geplant“',
      },
      ablaufvorlagen: {
        type: 'array',
        items: ref('VorlageZumAnwenden'),
        description: 'Automatisierungsvorlagen, die man an dieser Mappe anwenden kann (#1044, Menü „Mappe“)',
      },
      mappe: ref('Mappe'),
      favorit: { type: 'boolean', description: 'Favorit des Benutzers dieses Schlüssels' },
      dokumente: liste('Dokument'),
      notizen: liste('Notiz'),
      aufgaben: liste('Aufgabe'),
      bezuege: { type: 'object', additionalProperties: ref('Bezug') },
      rueckverweise: {
        type: 'array',
        items: {
          type: 'object',
          properties: { quelleId: uuid, quelleTypId: uuid, feldKey: { type: 'string' }, titel: { type: 'string' } },
        },
      },
      aufbewahrenBis: {
        type: 'string',
        format: 'date',
        nullable: true,
        description: 'Archivmodus (#212): Ende der Aufbewahrungsfrist (JJJJ-12-31); vorher antwortet Löschen mit 409',
      },
      fristBeginntMit: {
        type: 'string',
        description:
          'Archivmodus mit „Ist der Stichtag leer: läuft noch nicht ab“ (#1051) und leerem Stichtag: Beschriftung des Stichtag-Felds. Die Frist läuft noch nicht (aufbewahrenBis ist null), Löschen antwortet trotzdem mit 409. Fehlt sonst.',
      },
      unpassend: {
        type: 'object',
        additionalProperties: { type: 'array', items: uuid },
        description:
          'Je Verweisfeld die gewählten Mappen, die nicht (mehr) zum Auswahlfilter des Felds passen oder zu einem Feld, das aus ihm folgt (#172, #886). Bleiben gültig.',
      },
      konflikte: {
        type: 'array',
        description:
          'Verweis passt nicht (#887): je Verweisfeld (feld) die eigenen Felder, mit denen es nicht zusammenpasst (eigeneFelder: Werte des Auswahlfilters aus dieser Mappe oder Felder, die aus ihm folgen); regel = passt nur nicht zu den festen Bedingungen des Auswahlfilters. Ein Hinweis wie in der Oberfläche („Achtung: Niederlassung passt nicht zur Organisation.“), kein Fehler – Speichern bleibt möglich.',
        items: {
          type: 'object',
          properties: {
            feld: { type: 'string' },
            eigeneFelder: { type: 'array', items: { type: 'string' } },
            regel: { type: 'boolean' },
            ids: { type: 'array', items: uuid },
          },
        },
      },
      loeschbar: {
        type: 'object',
        description:
          'Ob die Mappe gelöscht werden kann; sonst Grund und die Mappen, die das verhindern. Teile (#1031) verhindern nichts – sie gehen beim Löschen mit (teile: ihre Anzahl; fehlt das Recht an einem, antwortet DELETE mit 403).',
        properties: {
          ok: { type: 'boolean' },
          teile: { type: 'integer' },
          grund: { type: 'string' },
          rueckverweise: {
            type: 'array',
            items: {
              type: 'object',
              properties: { quelleId: uuid, quelleTypId: uuid, feldKey: { type: 'string' }, titel: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  Tabellenseite: {
    type: 'object',
    description: 'Zeilen einer Tabelle (#1030): nur lesbare Mappen, auch gesamt zählt nur sie.',
    properties: {
      typId: uuid,
      spalten: { type: 'array', items: { type: 'string' }, description: 'Spalten der Trefferliste des anderen Typs, ohne Passwortfelder' },
      gesamt: { type: 'integer' },
      verborgen: {
        type: 'integer',
        description:
          'Seit #1208: Zahl der Zeilen, die es gibt, die der Aufrufer aber nicht lesen darf – nur die Zahl, keine Titel, Werte oder Ids. Mit vollem Leserecht 0.',
      },
      von: { type: 'integer' },
      mappen: { ...liste('Mappe'), description: 'Je Mappe nur die Werte der Spalten' },
      bezuege: { type: 'object', additionalProperties: ref('Bezug') },
    },
  },
  Seite: {
    type: 'object',
    properties: {
      gesamt: { type: 'integer' },
      von: { type: 'integer' },
      mappen: liste('Mappe'),
      bezuege: { type: 'object', additionalProperties: ref('Bezug') },
      aufgaben: {
        type: 'object',
        description: 'Nur unter „Zu erledigen“: offene Aufgaben je Mappen-Id',
        additionalProperties: { type: 'string' },
      },
      favoriten: { type: 'array', items: uuid, description: 'Ids der gelieferten Mappen, die Favoriten des Benutzers sind' },
      ausschnitte: {
        type: 'object',
        description:
          'Nur mit volltext=true (bzw. bei Funden in Teilen, #1031): Fundstelle je Mappen-Id; Treffer zwischen den Steuerzeichen U+0002 und U+0003. Mit teil stand der Begriff in einem Teil dieser Mappe (z. B. einer Rechnungsposition), den der Schlüssel lesen darf; dokument und text sind dann die Fundstelle im Teil (leer, wenn er in seinen Feldern steht).',
        additionalProperties: {
          type: 'object',
          properties: {
            dokument: { type: 'string' },
            text: { type: 'string' },
            teil: { type: 'object', properties: { id: uuid, typId: uuid, titel: { type: 'string' } } },
          },
        },
      },
      unscharf: {
        type: 'object',
        description:
          'Unscharfe Suche (#356): Gab es keinen genauen Treffer, sucht Ablago mit ähnlich geschriebenen Wörtern aus dem Wörterverzeichnis weiter (Werkbank → Suche); dann stehen hier der gesuchte Text (statt), „Meintest du …?“ (vorschlag, oder null) und die ähnlichen Wörter je Begriff. Fehlt bei genauen Treffern – außer mit „Meintest du …? auch bei Treffern“ (#1191): Findet die Suche mit einer ähnlichen Schreibweise mehr, stehen hier statt, vorschlag und treffer (so viele Mappen findet der Vorschlag); die Treffer bleiben die genauen, begriffe ist leer.',
        properties: {
          statt: { type: 'string' },
          vorschlag: { type: 'string', nullable: true },
          begriffe: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          treffer: { type: 'integer' },
        },
      },
      aehnlich: {
        type: 'array',
        description:
          'Ähnliche Treffer (#442), nur mit sicht=suche ohne Feldbedingungen, volltext=true, von=0 und einem Paket mit „dms:vektoren“: Mappen, die nicht in mappen stehen, deren Dokument dem Suchbegriff ähnlich ist (Kosinus). Fehlt, wenn es keine gibt.',
        items: {
          type: 'object',
          properties: {
            id: uuid,
            titel: { type: 'string' },
            typId: uuid,
            dokument: { type: 'object', properties: { id: uuid, name: { type: 'string' } } },
            aehnlichkeit: { type: 'number' },
          },
        },
      },
    },
  },
  Aufgabe: {
    type: 'object',
    properties: {
      id: uuid,
      mappeId: uuid,
      empfaengerId: { ...uuid, nullable: true, description: 'null = ohne Empfänger (sieht, wer verwaltet oder sie im Alltag bekommt)' },
      art: {
        type: 'string',
        enum: ['passung', 'erwaehnung', 'manuell', 'vertretung', 'frist', 'erinnerung', 'post', 'auskunft', 'aenderung'],
      },
      text: { type: 'string' },
      feldKey: { type: 'string', nullable: true },
      datum: { type: 'string', format: 'date', nullable: true, description: 'Frist und Erinnerung: das Datum, um das es geht' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      erledigt: { ...zeit, nullable: true },
      erledigtVon: { ...uuid, nullable: true },
      mappeTitel: { type: 'string' },
      typId: uuid,
    },
  },
  AufgabenListe: liste('Aufgabe'),
  AufgabeEingabe: { type: 'object', required: ['empfaengerId', 'text'], properties: { empfaengerId: uuid, text: { type: 'string' } } },
  Favorit: { type: 'object', properties: { favorit: { type: 'boolean' } } },
  Delegieren: { type: 'object', required: ['empfaengerId'], properties: { empfaengerId: uuid } },
  SammelAuswahl: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: uuid, maxItems: 1000 } } },
  SammelWeitergabe: {
    type: 'object',
    required: ['ids', 'empfaengerId'],
    properties: { ids: { type: 'array', items: uuid, maxItems: 1000 }, empfaengerId: uuid },
  },
  SammelErgebnis: {
    type: 'object',
    properties: {
      weitergegeben: { type: 'array', items: uuid, description: 'nur bei /aufgaben/weitergeben' },
      erledigt: { type: 'array', items: uuid, description: 'nur bei /aufgaben/erledigt' },
      nicht: { type: 'array', items: { type: 'object', properties: { id: uuid, grund: { type: 'string' } } } },
    },
  },
  Erwaehnungen: {
    type: 'object',
    description: 'Erwähnungen einer Mappe (#889)',
    properties: {
      erwaehnt: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: uuid,
            sichtbarkeit: { type: 'string', enum: ['sichtbar', 'verborgen', 'geloescht'] },
            titel: { type: 'string' },
            typId: uuid,
          },
        },
      },
      erwaehntIn: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mappeId: uuid,
            titel: { type: 'string' },
            typId: uuid,
            stelle: { type: 'string', enum: ['notiz', 'feld'] },
            feld: { type: 'string', description: 'Beschriftung des Felds bei stelle „feld“' },
            am: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  Notiz: {
    type: 'object',
    properties: {
      id: uuid,
      mappeId: uuid,
      text: { type: 'string', description: 'Markdown' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      geaendert: zeit,
      geaendertVon: { ...uuid, nullable: true },
    },
  },
  NotizListe: liste('Notiz'),
};
