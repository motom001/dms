/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Schnittstellen für Pakete. */
import type { Schema } from './typen';
import { liste, ref, zeit, uuid } from './schema-hilfen';
import { SPRACHKENNUNGEN } from './parameter';

/** Schnittstellen für Pakete: Einrichtung, Nachweise, Sicherung außer Haus, Archivfassung, Fassungen, Ähnliche, Volltext, Sprache; dazu Fundstellen, Papierkorb der Dokumente und Hochladen. */
export const SCHEMAS_PAKETE: Record<string, Schema> = {
  EinrichtungEintrag: {
    type: 'object',
    properties: {
      kennung: { type: 'string', description: 'Feste Art der Angabe, z. B. ablage.pflicht' },
      pfad: { type: 'string', description: 'Eindeutig im Bereich, z. B. ablage.pflicht:rechnung/betrag' },
      bezeichnung: { type: 'string' },
      wert: { description: 'Text, Zahl, ja/nein, null oder Liste von Texten' },
    },
  },
  EinrichtungStand: {
    type: 'object',
    description: 'Stand eines Bereichs der Einrichtung (#1053).',
    properties: {
      format: { type: 'integer', enum: [1] },
      art: { type: 'string', enum: ['einrichtung'] },
      bereich: { type: 'string' },
      version: { type: 'string' },
      eintraege: liste('EinrichtungEintrag'),
    },
  },
  EinrichtungVergleichEingabe: {
    type: 'object',
    properties: { vorher: { description: 'Früherer EinrichtungStand oder seine Einträge (höchstens 20.000)' } },
  },
  EinrichtungVergleich: {
    type: 'object',
    properties: {
      bereich: { type: 'string' },
      version: { type: 'string' },
      stand: ref('EinrichtungStand'),
      aenderungen: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kennung: { type: 'string' },
            pfad: { type: 'string' },
            bezeichnung: { type: 'string' },
            art: { type: 'string', enum: ['neu', 'geaendert', 'entfernt'] },
            vorher: {},
            nachher: {},
            satz: { type: 'string' },
          },
        },
      },
    },
  },
  NachweiseStand: {
    type: 'object',
    description: 'Nachweise eines Bereichs für einen Monat (#1053).',
    properties: {
      format: { type: 'integer', enum: [1] },
      art: { type: 'string', enum: ['nachweise'] },
      bereich: { type: 'string' },
      monat: { type: 'string' },
      stichtag: zeit,
      weitere: { type: 'integer', description: 'Einträge über der Grenze je Monat, nur gezählt' },
      eintraege: { type: 'array', items: { type: 'object', properties: { kennung: { type: 'string' }, zeit, daten: { type: 'object' } } } },
    },
  },
  SicherungSchlank: {
    type: 'object',
    description: 'Schlanke Metadaten einer Sicherung (#585) – so auch als <name>.json auf dem Ziel außer Haus.',
    properties: {
      name: { type: 'string', description: 'Name der Sicherung (ohne Endung)' },
      format: { type: 'integer' },
      schlank: { type: 'boolean', enum: [true] },
      datei: { type: 'string', description: '<name>.dms-sicherung' },
      groesse: { type: 'integer', description: 'Bytes' },
      sha256: { type: 'string', description: 'SHA-256 der Datei (hex)' },
      beginn: zeit,
      verschluesselung: { type: 'object', properties: { verfahren: { type: 'string' }, fingerabdruck: { type: 'string' } } },
    },
  },
  SicherungRueckmeldung: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['laeuft', 'hochgeladen', 'geprueft', 'fehlgeschlagen'] },
      pruefung: {
        type: 'string',
        enum: ['pruefsumme', 'stichprobe', 'groesse', 'keine'],
        description:
          'pruefsumme: SHA-256 vom Ziel bestätigt oder vollständig zurückgelesen; stichprobe: Größe und Stichproben; groesse: nur die Größe; keine: Ziel ohne Lesezugriff (z. B. Dateiablage)',
      },
      grund: { type: 'string', maxLength: 500, description: 'Verständlicher Grund, Pflicht bei fehlgeschlagen' },
      endgueltig: {
        type: 'boolean',
        description:
          'Nur bei fehlgeschlagen: Eine Wiederholung hilft nicht (z. B. Prüfsumme falsch, Anmeldung abgelehnt) – E-Mail an die Administratoren',
      },
      ziel: { type: 'string', maxLength: 200, description: 'Ziel in Worten, ohne Zugangsdaten' },
      bytes: { type: 'integer', description: 'Schon übertragen' },
      gesamt: { type: 'integer', description: 'Größe der Datei' },
    },
  },
  SicherungExtern: {
    type: 'object',
    description: 'Stand der Kopie außer Haus einer Sicherung für ein Paket (#585)',
    properties: {
      status: { type: 'string', enum: ['offen', 'laeuft', 'hochgeladen', 'geprueft', 'fehlgeschlagen'] },
      pruefung: { type: 'string' },
      grund: { type: 'string' },
      endgueltig: { type: 'boolean' },
      ziel: { type: 'string' },
      bytes: { type: 'integer' },
      gesamt: { type: 'integer' },
      seit: zeit,
      am: zeit,
    },
  },
  SicherungHolen: {
    type: 'object',
    description: 'Stand beim Zurückholen einer Sicherung (#976)',
    properties: {
      versatz: { type: 'integer', description: 'Bisher angekommene Bytes – ab hier das nächste Stück' },
      groesse: { type: 'integer' },
    },
  },
  ArchivfassungGesetzt: {
    type: 'object',
    properties: {
      dokument: uuid,
      archivfassung: {
        type: 'object',
        properties: {
          mime: { type: 'string' },
          groesse: { type: 'integer' },
          sha256: { type: 'string' },
          seiten: { type: 'integer' },
          pdfa: { type: 'object', properties: { teil: { type: 'integer' }, stufe: { type: 'string', nullable: true } } },
          paket: { type: 'object' },
          erstellt: zeit,
          signiert: { type: 'boolean' },
          erechnung: { type: 'boolean' },
          weggelassen: {
            type: 'boolean',
            description: 'Das Original enthielt externe Inhalte, JavaScript oder Aktionen, die nicht übernommen wurden',
          },
        },
      },
    },
  },
  Wortpositionen: {
    type: 'object',
    properties: {
      dokument: uuid,
      sha256: { type: 'string' },
      quelle: { type: 'string', enum: ['original', 'lesefassung'] },
      mime: { type: 'string' },
      vollstaendig: { type: 'boolean' },
      seiten: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            seite: { type: 'integer' },
            quelle: { type: 'string', enum: ['textebene', 'texterkennung', 'keine'] },
            breite: { type: 'number' },
            hoehe: { type: 'number' },
            woerter: { type: 'array', description: '[Text, x, y, b, h], relativ zur Seite', items: { type: 'array', items: {} } },
          },
        },
      },
    },
  },
  FassungGesetzt: {
    type: 'object',
    properties: {
      dokument: uuid,
      fassung: {
        type: 'object',
        properties: {
          mime: { type: 'string', enum: ['application/pdf', 'image/png', 'image/jpeg'] },
          groesse: { type: 'integer' },
          sha256: { type: 'string' },
          seiten: { type: ['integer', 'null'] },
          paket: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, version: { type: 'string' } } },
          erstellt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  VorschaubildGesetzt: { type: 'object', properties: { dokument: uuid, mime: { type: 'string' }, groesse: { type: 'integer' } } },
  VektorGeloescht: { type: 'object', properties: { entfernt: { type: 'integer' } } },
  AehnlicheAnfrage: {
    type: 'object',
    required: ['vektor'],
    properties: {
      modell: { type: 'string', description: 'ohne Angabe das aktuelle Modell' },
      vektor: { type: 'array', items: { type: 'number' } },
      anzahl: { type: 'integer', minimum: 1, maximum: 100 },
      schwelle: { type: 'number', minimum: -1, maximum: 1 },
    },
  },
  Aehnliche: {
    type: 'object',
    properties: {
      modell: { type: 'string' },
      treffer: {
        type: 'array',
        items: {
          type: 'object',
          properties: { dokumentId: uuid, mappeId: uuid, aehnlichkeit: { type: 'number', description: 'Kosinus, -1 bis 1' } },
        },
      },
    },
  },
  VolltextSchreiben: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', description: 'höchstens 5 000 000 Zeichen; Seiten dürfen durch Seitenvorschub (\\f) getrennt sein (#579)' },
      seiten: { type: 'integer', minimum: 1 },
      sprache: {
        type: 'string',
        nullable: true,
        enum: [...SPRACHKENNUNGEN, null],
        description:
          'Sprache des Texts (#400) bzw. Hauptsprache; fehlt oder null: Ablago erkennt sie (bei Seiten: die mit dem meisten Text)',
      },
      seitensprachen: {
        type: 'array',
        maxItems: 1000,
        description:
          'Sprache je Seite (#579), ein Eintrag je durch \\f getrennter Seite: ein bis zwei Kennungen (Mischseite) oder null (Ablago erkennt sie). Beispiel: [["deu"], ["fra"], ["deu", "fra"]]',
        items: { type: 'array', nullable: true, maxItems: 2, items: { type: 'string', enum: SPRACHKENNUNGEN } },
      },
      weitere: {
        type: 'array',
        items: { type: 'string', enum: SPRACHKENNUNGEN },
        description: 'Weitere Sprachen fürs ganze Dokument (#579), wenn das Paket die Seiten nicht kennt',
      },
      woerter: {
        type: 'array',
        nullable: true,
        maxItems: 1000,
        description:
          'Wortpositionen (#631) für die Archivfassung: je durch \\f getrennter Seite eine Liste [Text, x, y, b, h] (relativ zur Seite, wie GET …/seiten/{nr}/scan sie liefert, 0…1, Ursprung oben links) oder null (Seite ohne Angabe, z. B. Textebene). Höchstens 1,5 Millionen Wörter. Ohne Angabe nimmt ein Paket die bisherigen mit weg; null: entfernen.',
        items: { type: 'array', nullable: true, items: { type: 'array', minItems: 5, maxItems: 5, items: {} } },
      },
    },
  },
  SpracheSetzen: {
    type: 'object',
    required: ['sprache'],
    properties: {
      sprache: { type: 'string', nullable: true, enum: [...SPRACHKENNUNGEN, null] },
      weitere: {
        type: 'array',
        nullable: true,
        items: { type: 'string', enum: SPRACHKENNUNGEN },
        description: 'Weitere Sprachen (#579); fehlt: bleiben, [] oder null: keine',
      },
    },
  },
  TeilenHinweis: { type: 'object', properties: { id: uuid, teilenAb: { type: 'integer', nullable: true } } },
  DokumentSprache: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      sprache: { type: 'string', nullable: true },
      weitereSprachen: { type: 'array', items: { type: 'string' } },
      ocr: { type: 'object' },
    },
  },
  Gleiche: {
    type: 'object',
    required: ['pruefwerte'],
    properties: { pruefwerte: { type: 'array', maxItems: 100, items: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, ohneMappe: uuid },
  },
  Fundstellen: {
    type: 'object',
    properties: {
      fundstellen: {
        type: 'object',
        description: 'Je Prüfwert höchstens 5 Fundstellen',
        additionalProperties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mappeId: uuid,
              typId: uuid,
              titel: { type: 'string' },
              typ: { type: 'string' },
              register: { type: 'string' },
              name: { type: 'string' },
              erstellt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
  PapierkorbDokumente: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: uuid,
        art: { type: 'string', enum: ['dokument'] },
        mappeId: uuid,
        typId: uuid,
        mappeTitel: { type: 'string' },
        registerKey: { type: 'string' },
        register: { type: 'string' },
        name: { type: 'string' },
        mime: { type: 'string' },
        groesse: { type: 'integer' },
        sha256: { type: 'string' },
        versionen: { type: 'integer', description: 'ältere Versionen, die mitgegangen sind' },
        erstellt: { type: 'string', format: 'date-time' },
        erstelltVon: { type: 'string', nullable: true },
        geloescht: { type: 'string', format: 'date-time' },
        geloeschtVon: { type: 'string', nullable: true },
        mappe: { type: 'string', enum: ['da', 'papierkorb', 'weg'] },
      },
    },
  },
  DokumentWiederhergestellt: { type: 'object', properties: { dokument: ref('Dokument'), typId: uuid } },
  Hochgeladen: {
    type: 'object',
    properties: {
      dokument: ref('Dokument'),
      gleicherInhalt: {
        type: 'array',
        items: { type: 'object', properties: { mappeId: uuid, name: { type: 'string' }, titel: { type: 'string' }, typId: uuid } },
      },
    },
  },
};
