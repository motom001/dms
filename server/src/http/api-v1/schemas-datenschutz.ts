/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Datenschutz und Seiten. */
import type { Schema } from './typen';
import { uuid, zeit, ref } from './schema-hilfen';

/** Datenschutz, Löschprotokoll, Auskunft, Aufträge, Seiten bearbeiten, Zusammenfügen, E-Mail an mehrere, Archivnummern und Vektoren. */
export const SCHEMAS_DATENSCHUTZ: Record<string, Schema> = {
  Datenschutz: {
    type: 'object',
    properties: {
      verantwortlicher: { type: 'string' },
      empfaenger: { type: 'string' },
      rechte: { type: 'string', description: 'Text auf dem Deckblatt; leer oder unverändert = Vorschlag in der eingestellten Anrede' },
      anrede: {
        type: 'string',
        enum: ['du', 'sie'],
        description:
          'Anrede in Unterlagen für Dritte (#474): Deckblatt, Übersicht, LIESMICH, Abrufseite, E-Mails an die Person. Vorgabe du; die Oberfläche bleibt bei du.',
      },
      typen: {
        type: 'object',
        description: 'Typ-Id → { person: boolean, zweck: string }',
        additionalProperties: { type: 'object', properties: { person: { type: 'boolean' }, zweck: { type: 'string' } } },
      },
    },
  },
  AuskunftStand: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      mappeId: uuid,
      titel: { type: 'string' },
      erstellt: zeit,
      bis: zeit,
      bytes: { type: 'integer' },
      mappen: { type: 'integer' },
      dokumente: { type: 'integer' },
      verschluesselt: { type: 'boolean' },
      von: { type: 'string' },
    },
  },
  DatenschutzStand: {
    type: 'object',
    properties: {
      einstellung: ref('Datenschutz'),
      auskuenfte: { type: 'array', items: ref('AuskunftStand') },
      tage: { type: 'integer' },
      links: {
        type: 'array',
        items: ref('AuskunftLink'),
        description: 'Abruf-Links (#455), neueste zuerst – auch nach dem Löschen der ZIP als Nachweis',
      },
      adresse: { type: 'string', description: 'Adresse von Ablago für Links' },
      oeffentlich: {
        type: 'boolean',
        description: 'Adresse sieht nach Internet aus (nicht localhost, kein privates Netz) – Vorschlag: Abruf-Link',
      },
      mail: { type: 'boolean', description: 'E-Mail-Versand eingerichtet' },
    },
  },
  LoeschEintrag: {
    type: 'object',
    description: 'Ein Schritt einer Löschung (#470) – ohne Titel, Feldwerte und Dateinamen',
    properties: {
      id: uuid,
      zeit,
      art: { type: 'string', enum: ['mappe', 'dokument'] },
      schritt: { type: 'string', enum: ['papierkorb', 'endgueltig', 'wiederhergestellt'] },
      weg: {
        type: 'string',
        description:
          'einzeln, mehrere, verknuepft, dokument, ersetzt, version, papierkorb, leeren, abmelden, ablauf, ausgeschaltet, zurueckgerollt, beispiele (Beispiele eines Pakets entfernt), aufgeloest (Post in eine Mappe aufgelöst, #936, #934)',
      },
      mappeId: uuid,
      typId: { ...uuid, nullable: true },
      typ: { type: 'string', description: 'Name des Mappentyps beim Löschen' },
      nummer: { type: 'string', nullable: true, description: 'Nummer aus dem Nummernkreis der Mappe' },
      archivnummer: { type: 'string', nullable: true },
      dokumentId: { ...uuid, nullable: true },
      version: { type: 'integer', nullable: true },
      sha256: { type: 'string', nullable: true },
      groesse: { type: 'integer', nullable: true },
      mime: { type: 'string', nullable: true },
      seiten: { type: 'integer', nullable: true },
      anzahl: {
        type: 'object',
        nullable: true,
        properties: {
          dokumente: { type: 'integer' },
          versionen: { type: 'integer' },
          notizen: { type: 'integer' },
          verweise: { type: 'integer' },
        },
      },
      vonId: { ...uuid, nullable: true },
      von: { type: 'string' },
      ausloeser: { type: 'string', enum: ['benutzer', 'api', 'paket', 'automatisch'] },
      grund: { type: 'string', nullable: true, enum: ['frist', 'verlangen', 'nicht_noetig', 'sonstiges'] },
      grundText: { type: 'string' },
      vorgang: { ...uuid, nullable: true },
      startId: { ...uuid, nullable: true },
    },
  },
  Loeschprotokoll: {
    type: 'object',
    properties: {
      eintraege: { type: 'array', items: ref('LoeschEintrag') },
      gesamt: { type: 'integer' },
      jahre: { type: 'integer', description: 'Aufbewahrung in Jahren' },
      max: { type: 'integer' },
    },
  },
  LoeschprotokollEinstellung: { type: 'object', properties: { jahre: { type: 'integer', minimum: 1, maximum: 30 } } },
  AuskunftLink: {
    type: 'object',
    properties: {
      id: uuid,
      auskunftId: uuid,
      mappeId: uuid,
      titel: { type: 'string' },
      empfaenger: { type: 'string', nullable: true },
      codeArt: { type: 'string', enum: ['erzeugt', 'eigen'] },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      ablauf: zeit,
      maxAbrufe: { type: 'integer' },
      abrufe: { type: 'integer' },
      fehlversuche: { type: 'integer' },
      gesperrt: { ...zeit, nullable: true, description: 'nach zu vielen falschen Abrufcodes' },
      widerrufen: { ...zeit, nullable: true },
      abgerufen: { ...zeit, nullable: true, description: 'zuletzt erfolgreich abgerufen' },
    },
  },
  AuskunftLinkEingabe: {
    type: 'object',
    properties: {
      tage: { type: 'integer', description: '1–90, Standard 30' },
      abrufe: { type: 'integer', description: '1–10, Standard 3' },
      code: {
        type: 'string',
        description: 'eigener Abrufcode (z. B. Vertragsnummer, mindestens 6 Zeichen); ohne Angabe erzeugt Ablago einen',
      },
      an: { type: 'string', format: 'email' },
      senden: { type: 'boolean', description: 'Link per E-Mail an „an“ schicken (ohne Code)' },
    },
  },
  AuskunftLinkNeu: {
    type: 'object',
    properties: {
      link: ref('AuskunftLink'),
      url: { type: 'string', description: 'nur jetzt im Klartext' },
      code: { type: 'string', description: 'Abrufcode, nur jetzt im Klartext – auf anderem Weg mitteilen' },
      gesendet: { type: 'boolean' },
    },
  },
  AuskunftEmail: {
    type: 'object',
    required: ['an'],
    properties: {
      an: { type: 'string', description: 'Adressen, durch Komma getrennt' },
      betreff: { type: 'string' },
      nachricht: { type: 'string' },
    },
  },
  AuskunftEmailErgebnis: { type: 'object', properties: { an: { type: 'array', items: { type: 'string' } } } },
  AuskunftVorschauEingabe: {
    type: 'object',
    required: ['mappeId'],
    properties: { mappeId: uuid, tiefe: { type: 'integer' }, richtungen: { type: 'array', items: { type: 'string' } } },
  },
  AuskunftVorschau: {
    type: 'object',
    properties: {
      baum: ref('Baum'),
      mappen: {
        type: 'object',
        description: 'Mappe-Id → { dokumente, notizen, historie, dritte, ohneFelder } (auch für Bezug-Mappen, falls man sie ganz aufnimmt)',
      },
      frist: { type: 'string', format: 'date' },
    },
  },
  AuskunftEingabe: {
    type: 'object',
    required: ['mappeId', 'auswahl', 'geprueft'],
    properties: {
      mappeId: uuid,
      tiefe: { type: 'integer' },
      richtungen: { type: 'array', items: { type: 'string' } },
      auswahl: {
        type: 'object',
        properties: {
          mappen: { type: 'array', items: uuid },
          dokumente: { type: 'array', items: uuid },
          notizen: { type: 'array', items: uuid },
          historie: { type: 'array', items: uuid, description: 'Mappen, deren Historie mitgeht' },
          ohneNotizen: { type: 'array', items: { type: 'object', properties: { id: uuid, grund: { type: 'string' } } } },
          erwaehnungen: {
            type: 'array',
            items: uuid,
            description:
              'Bezug-Mappen (nurBezug), die nur mit Art, Titel und Feld hinausgehen – ohne Dokumente, Notizen und übrige Werte (#472); ganz aufgenommene stehen in mappen',
          },
        },
      },
      geprueft: { type: 'boolean' },
      passwort: { type: 'string' },
      empfaenger: { type: 'string' },
      anmerkung: { type: 'string' },
    },
  },
  AuskunftFrist: {
    type: 'object',
    required: ['mappeId'],
    properties: { mappeId: uuid, eingang: { type: 'string', format: 'date', description: 'Eingang der Anfrage (Standard heute)' } },
  },
  Auftrag: {
    type: 'object',
    description: 'Hintergrundauftrag (#364)',
    properties: {
      id: uuid,
      art: { type: 'string' },
      titel: { type: 'string' },
      status: { type: 'string', enum: ['laeuft', 'fertig', 'fehler'] },
      fertig: { type: 'integer' },
      gesamt: { type: 'integer' },
      phase: { type: 'string', nullable: true },
      phasen: { type: 'array', items: { type: 'object' } },
      gestartet: zeit,
      beendet: zeit,
      ergebnis: { type: 'object' },
      fehler: { type: 'string' },
    },
  },
  VerkleinernViele: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: { type: 'array', items: uuid },
      stufe: { type: 'string', enum: ['bildschirm', 'standard', 'druck'] },
      ohneOriginal: { type: 'boolean' },
      bestaetigt: { type: 'boolean' },
    },
  },
  GrossePdfs: {
    type: 'object',
    properties: {
      stufe: { type: 'string' },
      ab: { type: 'number' },
      geschaetzteErsparnis: { type: 'integer' },
      mehr: { type: 'boolean' },
      eintraege: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: uuid,
            name: { type: 'string' },
            groesse: { type: 'integer' },
            mappeId: uuid,
            mappeTitel: { type: 'string' },
            version: { type: 'integer' },
            geschaetzt: { type: 'integer', nullable: true },
            lohnt: { type: 'boolean', nullable: true },
          },
        },
      },
    },
  },
  Seiten: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      version: { type: 'integer' },
      sha256: { type: 'string' },
      anzahl: { type: 'integer' },
      drehungen: { type: 'array', items: { type: 'integer', enum: [0, 90, 180, 270] } },
      bilderBis: { type: 'integer', description: 'Seitenbilder gibt es bis zu dieser Seite' },
    },
  },
  SeitenBearbeiten: {
    type: 'object',
    required: ['seiten'],
    properties: {
      seiten: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['nr'],
          properties: { nr: { type: 'integer', minimum: 1 }, drehung: { type: 'integer', enum: [0, 90, 180, 270] } },
        },
      },
      teile: {
        type: 'array',
        items: { type: 'integer', minimum: 0 },
        description: 'Positionen in seiten, an denen ein neuer Teil beginnt',
      },
      anlagen: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        description:
          'Anlagen (#998, nur Post): Positionen in seiten, an denen eine Anlage zum vorherigen Teil beginnt; Pakete brauchen dms:anlagen',
      },
      bestaetigt: { type: 'boolean', description: 'Ersetzen ohne Versionierung bestätigen' },
    },
  },
  SeitenErgebnis: {
    type: 'object',
    properties: {
      dokumente: { type: 'array', items: ref('Dokument') },
      posten: { type: 'array', items: ref('Mappe'), description: 'Neue Posts beim Teilen einer Post' },
    },
  },
  Zusammenfuegen: {
    type: 'object',
    required: ['dokumente'],
    properties: {
      dokumente: { type: 'array', minItems: 2, maxItems: 100, items: uuid },
      ziel: uuid,
      register: { type: 'string' },
      name: { type: 'string' },
      originaleEntfernen: { type: 'boolean' },
      bestaetigt: { type: 'boolean' },
    },
  },
  Zusammengefuegt: { type: 'object', properties: { dokument: ref('Dokument'), erledigtePost: { type: 'array', items: uuid } } },
  EmailMehrere: {
    type: 'object',
    required: ['ids', 'an', 'betreff'],
    properties: {
      ids: { type: 'array', minItems: 1, maxItems: 100, items: uuid },
      an: { type: 'string', description: 'Empfänger, mehrere durch Komma getrennt (höchstens 20)' },
      betreff: { type: 'string', maxLength: 250 },
      nachricht: { type: 'string' },
      angaben: { type: 'boolean', description: 'Angaben je Mappe als PDF (Standard: ja)' },
      dokumente: {
        oneOf: [
          { type: 'string', enum: ['alle'] },
          { type: 'array', items: uuid },
        ],
      },
      mitAnlagen: {
        type: 'boolean',
        description:
          'Anlagen (#998): hinter jedem gewählten Dokument seine Anlagen (Standard: ja); false mit dokumente=alle lässt Anlagen weg',
      },
      originalEmail: {
        type: 'boolean',
        description:
          'Original-E-Mail (#999): geht als Anlage mit (Standard: ja); false lässt sie weg – mit dokumente=alle auch eine Original-E-Mail ohne Anhänge; sie enthält alle Anhänge der Mail',
      },
    },
  },
  EmailMehrereVersendet: {
    type: 'object',
    properties: { id: { ...uuid, description: 'Id der Post' }, typId: uuid, mappen: { type: 'integer' }, anhaenge: { type: 'integer' } },
  },
  Archivnummer: {
    type: 'object',
    properties: { archivnummer: { type: 'string', nullable: true, maxLength: 40, description: 'leer oder null entfernt die Nummer' } },
  },
  ArchivnummerTreffer: { type: 'object', properties: { dokument: ref('Dokument'), mappeId: uuid, typId: uuid, titel: { type: 'string' } } },
  VektorSetzen: {
    type: 'object',
    required: ['modell', 'vektor'],
    properties: {
      modell: {
        type: 'string',
        pattern: '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,99}$',
        description: 'Kennung des Modells, z. B. „static-similarity-mrl-multilingual-v1/256“',
      },
      vektor: { type: 'array', items: { type: 'number' }, minItems: 8, maxItems: 4096 },
    },
  },
  VektorGesetzt: { type: 'object', properties: { dokument: uuid, modell: { type: 'string' }, dimension: { type: 'integer' } } },
};
