/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Abläufe und Bearbeiten. */
import type { Schema } from './typen';
import { uuid, zeit, liste, ref, beschriftungen } from './schema-hilfen';

/** Abläufe, Historie, Stempel, Volltext, Sichten, Zähler, Schwärzen, Verkleinern und Baum. */
export const SCHEMAS_BEARBEITEN: Record<string, Schema> = {
  MappenAblauf: {
    type: 'object',
    description: 'Geplanter Mappen-Ablauf (#1044; früher Erinnerung)',
    properties: {
      id: uuid,
      vorlage: { type: 'string', description: 'Kennung der Vorlage, z. B. erinnern oder benachrichtigungen:wiedervorlage' },
      vorlageName: { type: 'string' },
      mappeId: uuid,
      empfaengerId: { ...uuid, nullable: true },
      datum: { type: 'string', format: 'date', description: 'Wann er läuft' },
      text: { type: 'string' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true, description: 'Mit dessen Rechten er läuft' },
      angehalten: {
        type: 'object',
        nullable: true,
        properties: { grund: { type: 'string', enum: ['person', 'deaktiviert', 'leserecht', 'vorlage'] }, text: { type: 'string' }, zeit },
      },
      hinweis: { type: 'string', description: 'Wenn der Empfänger die Mappe nicht lesen darf' },
    },
  },
  VorlageZumAnwenden: {
    type: 'object',
    properties: {
      kennung: { type: 'string' },
      name: { type: 'string' },
      beschreibung: { type: 'string' },
      reihenfolge: { type: 'integer' },
      fragen: { type: 'array', items: { type: 'string', enum: ['empfaenger', 'datum', 'text'] } },
      wann: {
        type: 'object',
        properties: {
          art: { type: 'string', enum: ['sofort', 'datum', 'in'] },
          anzahl: { type: 'integer' },
          einheit: { type: 'string', enum: ['tage', 'wochen', 'monate'] },
        },
      },
    },
  },
  MappenAblaeufe: { type: 'object', properties: { geplant: liste('MappenAblauf'), vorlagen: liste('VorlageZumAnwenden') } },
  AblaufEingabe: {
    type: 'object',
    required: ['vorlage'],
    properties: {
      vorlage: { type: 'string', description: 'Kennung der Vorlage' },
      empfaengerId: { ...uuid, description: 'Antwort auf „Empfänger“; fehlt bei einer geplanten = der Benutzer des Schlüssels' },
      datum: { type: 'string', format: 'date', description: 'Antwort auf „Datum“' },
      text: { type: 'string', description: 'Antwort auf „Text“' },
    },
  },
  AblaufErgebnis: {
    type: 'object',
    properties: {
      aufgaben: liste('Aufgabe'),
      ablauf: { allOf: [ref('MappenAblauf')], nullable: true, description: 'Der geplante Ablauf; null, wenn die Vorlage sofort läuft' },
      hinweis: { type: 'string', description: 'Wenn der Empfänger die Mappe nicht lesen darf' },
    },
  },
  ErinnerungEingabe: {
    type: 'object',
    required: ['datum', 'text'],
    properties: {
      datum: { type: 'string', format: 'date' },
      text: { type: 'string' },
      empfaengerId: { ...uuid, description: 'Benutzer; fehlt = der Benutzer des Schlüssels' },
    },
  },
  Historie: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        mappeId: uuid,
        zeit: zeit,
        benutzerId: { ...uuid, nullable: true },
        art: { type: 'string' },
        daten: {
          type: 'object',
          additionalProperties: true,
          description: 'Je nach Art, z. B. aenderungen: [{feld, label, alt, neu}] oder dokument',
        },
      },
    },
  },
  StempelVorlagen: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        text: { type: 'string' },
        lage: { type: 'string', enum: ['diagonal', 'kopf', 'fuss', 'ecke', 'stempel'] },
        deckkraft: { type: 'number' },
        seiten: { type: 'string', enum: ['alle', 'erste'] },
        tinte: { type: 'boolean' },
        drehung: { type: 'integer' },
        x: { type: 'number' },
        y: { type: 'number' },
        farbe: { type: 'string', enum: ['rot', 'blau', 'gruen', 'schwarz'] },
        groesse: { type: 'integer' },
        umgestellt: { type: 'boolean' },
      },
    },
  },
  Volltext: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      ocr: { type: 'object' },
      sprache: {
        type: 'string',
        nullable: true,
        description:
          'Sprache des Texts (#400), z. B. fra; null = keine Angabe (Deutsch). Bei mehrsprachigen Dokumenten die Hauptsprache (#579).',
      },
      weitereSprachen: { type: 'array', items: { type: 'string' }, description: 'Weitere Sprachen im Dokument (#579, „enthält auch“)' },
      text: { type: 'string', nullable: true },
      seiten: {
        type: 'array',
        description: 'Nur wenn Ablago die Seiten kennt (#579: mehrsprachig oder gemischtes PDF): Text und Sprache(n) je Seite',
        items: {
          type: 'object',
          properties: { seite: { type: 'integer' }, sprachen: { type: 'array', items: { type: 'string' } }, text: { type: 'string' } },
        },
      },
    },
  },
  Sicht: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      beschreibung: { type: 'string' },
      beschriftungen: beschriftungen({ name: { type: 'string' }, beschreibung: { type: 'string' } }),
      elternId: { ...uuid, nullable: true },
      position: { type: 'integer' },
      typen: {
        type: 'array',
        items: uuid,
        description: 'Mappentypen, deren Mappen die Ansicht selbst zeigt; dazu kommen die ihrer Unteransichten',
      },
      bedingungen: {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
        description:
          'Gelten zusammen (UND): {art:"feld", feld, op, wert?, bis?}, {art:"dokumente"|"verknuepfungen", register, vergleich, anzahl}, {art:"dokumenteGesamt"|"verknuepfungenGesamt", vergleich, anzahl}, {art:"favorit"}',
      },
      trefferliste: { type: 'string', nullable: true, description: 'Kennung der Trefferliste; null = Standard' },
      rechte: {
        type: 'object',
        readOnly: true,
        properties: { R: { type: 'boolean' }, C: { type: 'boolean' } },
        description: 'Nur für Benutzer (#148): wirksame Rechte an der Ansicht. Verborgene Ansichten fehlen in der Liste.',
      },
    },
  },
  SichtListe: liste('Sicht'),
  Zaehler: {
    type: 'object',
    properties: {
      sichten: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Anzahl Mappen je Ansicht (mit Unteransichten)' },
      typen: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { anzahl: { type: 'integer' }, unpassend: { type: 'integer' }, demo: { type: 'integer' } },
        },
      },
      eingang: { type: 'integer' },
      favoriten: { type: 'integer', description: 'Eigene Favoriten' },
    },
  },
  SchwaerzenAnalyse: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      mime: { type: 'string' },
      sha256: { type: 'string' },
      seiten: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            breite: { type: 'number', description: 'pt, wie angezeigt' },
            hoehe: { type: 'number' },
            woerter: { type: 'array', description: '[Text, x, y, b, h], relativ zur Seite', items: { type: 'array', items: {} } },
          },
        },
      },
      quelle: { type: 'string', enum: ['textebene', 'texterkennung', 'gemischt', 'keine'] },
      erkannt: { type: 'integer', description: 'Seiten per Texterkennung' },
      versioniert: { type: 'boolean' },
      kopieName: { type: 'string' },
      muster: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
  Schwaerzen: {
    type: 'object',
    properties: {
      bereiche: {
        type: 'array',
        maxItems: 5000,
        items: {
          type: 'object',
          required: ['seite', 'x', 'y', 'b', 'h'],
          properties: {
            seite: { type: 'integer', minimum: 1 },
            x: { type: 'number', minimum: 0, maximum: 1 },
            y: { type: 'number', minimum: 0, maximum: 1 },
            b: { type: 'number', minimum: 0, maximum: 1 },
            h: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      begriffe: {
        type: 'array',
        maxItems: 50,
        items: { type: 'string', maxLength: 200 },
        description: 'Überall schwärzen, z. B. ein Name oder eine IBAN',
      },
      muster: {
        type: 'array',
        items: { type: 'string', enum: ['iban', 'steuerid', 'geburtsdatum', 'email', 'telefon'] },
        description: 'Alle Fundstellen dieser Muster schwärzen',
      },
      ziel: { type: 'string', enum: ['kopie', 'version'], description: 'Standard: kopie' },
    },
  },
  Geschwaerzt: {
    type: 'object',
    properties: {
      dokument: ref('Dokument'),
      ziel: { type: 'string' },
      stellen: { type: 'integer' },
      seiten: { type: 'integer', description: 'betroffene Seiten' },
      begriffe: {
        type: 'array',
        items: { type: 'object', properties: { gefunden: { type: 'integer' } } },
        description: 'je Suchbegriff (in der Reihenfolge der Eingabe, ohne doppelte und leere)',
      },
      meldung: { type: 'string' },
    },
  },
  VerkleinernSchaetzung: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      groesse: { type: 'integer' },
      seiten: { type: 'integer' },
      bilder: { type: 'integer' },
      hoechsteDpi: { type: 'integer', nullable: true },
      versioniert: { type: 'boolean' },
      papierkorb: { type: 'boolean' },
      mindestens: { type: 'number', description: 'Mindestersparnis (0.1)' },
      stufen: {
        type: 'object',
        description: 'je Stufe (bildschirm, standard, druck)',
        additionalProperties: {
          type: 'object',
          properties: {
            dpi: { type: 'integer' },
            geschaetzt: { type: 'integer' },
            lohnt: { type: 'boolean' },
            bilder: { type: 'integer', description: 'Bilder, die neu gerechnet würden' },
          },
        },
      },
    },
  },
  Verkleinern: {
    type: 'object',
    properties: {
      stufe: { type: 'string', enum: ['bildschirm', 'standard', 'druck'], description: 'Standard: standard' },
      bestaetigt: { type: 'boolean', description: 'Nötig ohne Versionierung' },
    },
  },
  Verkleinert: {
    type: 'object',
    properties: {
      dokument: ref('Dokument'),
      unveraendert: { type: 'boolean' },
      vorher: { type: 'integer' },
      nachher: { type: 'integer' },
      stufe: { type: 'string' },
      meldung: { type: 'string', description: 'z. B. „Verkleinert von 18,4 MB auf 2,1 MB (−89 %).“' },
    },
  },
  BaumKnoten: {
    type: 'object',
    properties: {
      id: uuid,
      typId: uuid,
      typ: { type: 'string' },
      titel: { type: 'string' },
      ebene: { type: 'integer', description: '0 = Start-Mappe' },
      ueber: {
        type: 'object',
        nullable: true,
        description: 'über welchen Verweis erreicht',
        properties: {
          vonId: uuid,
          richtung: { type: 'string', enum: ['verwiesenVon', 'verweistAuf'] },
          feldKey: { type: 'string' },
          feld: { type: 'string' },
          verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] },
        },
      },
      nurBezug: { type: 'boolean', description: 'mit nurZugehoerigkeit: nur über Bezug verbunden – Blatt, nicht weiterverfolgt' },
      auchUeber: { type: 'array', description: 'weitere Wege innerhalb des Baums (Kreise)', items: { type: 'object' } },
      dokumente: { type: 'integer' },
      aussen: {
        type: 'object',
        description:
          'Verweise zu Mappen außerhalb des Baums (je Richtung höchstens 20 einzeln, anzahl zählt alle); nicht lesbare ohne Titel',
        properties: {
          verweistAuf: { type: 'array', items: { type: 'object' } },
          verwiesenVon: { type: 'array', items: { type: 'object' } },
          anzahl: { type: 'object' },
        },
      },
      aufbewahrenBis: { type: 'string', format: 'date', nullable: true },
      gesperrt: {
        type: 'boolean',
        description: 'in der Aufbewahrungsfrist (#212) – auch ohne aufbewahrenBis, wenn die Frist noch nicht läuft (#1051)',
      },
      rechte: { type: 'object', description: 'C, R, U, D, P des Aufrufers' },
    },
  },
  Baum: {
    type: 'object',
    properties: {
      startId: uuid,
      optionen: { type: 'object' },
      knoten: { type: 'array', items: ref('BaumKnoten') },
      abgeschnitten: { type: 'boolean' },
      kreise: { type: 'integer' },
      verborgen: { type: 'integer' },
      tieferMoeglich: { type: 'boolean' },
    },
  },
};
