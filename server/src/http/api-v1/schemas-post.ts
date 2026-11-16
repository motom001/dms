/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Post. */
import type { Schema } from './typen';
import { uuid, ref, zeit } from './schema-hilfen';

/** Post: zuordnen, abtrennen, Abgleich, Klassifizieren, Vorschläge, Erkennung, Fotos, E-Mail und Erinnerungen. */
export const SCHEMAS_POST: Record<string, Schema> = {
  PostEingabe: {
    type: 'object',
    properties: {
      betreff: { type: 'string', description: 'Standard „Neue Post“' },
      datum: { type: 'string', format: 'date' },
      von: {
        type: 'string',
        description: 'Wer die Post geschickt hat („Von“, #1042); ohne Angabe leer (bis 0.99: Name des Benutzers, #494)',
      },
      an: {
        ...uuid,
        description:
          'Id eines Benutzers („An“, #1042): Mit der Automatisierung „Post für dich“ (Paket Benachrichtigungen, #1001) bekommt er eine Aufgabe unter „Zu erledigen“, solange die Post neu ist.',
      },
      absender: { type: 'string', deprecated: true, description: 'Alter Name für von (bis 1.0.0, #1042); gilt nur ohne von' },
      fuer: { ...uuid, deprecated: true, description: 'Alter Name für an (bis 1.0.0, #1042); gilt nur ohne an' },
      nachricht: { type: 'string' },
      kanal: { type: 'string', enum: ['Hochgeladen', 'E-Mail', 'Scan', 'Ordner', 'Import', 'API', 'WebDAV'] },
      werte: { ...ref('Werte'), description: 'Werte weiterer Felder, die der Administrator am Typ Post ergänzt hat' },
    },
  },
  Zuordnen: {
    type: 'object',
    required: ['ziel'],
    properties: {
      ziel: { ...uuid, description: 'Id der Mappe, zu der die Post gehört' },
      register: { type: 'string', description: 'Kennung eines Dokumentenregisters der Zielmappe; Standard: das erste' },
      dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten der Post; Standard: alle' },
      kopieren: { type: 'boolean', description: 'true = Dokumente bleiben auch in der Post' },
      aufloesen: {
        type: 'boolean',
        description: 'Post auflösen (#936, #934): aus der Post wird die Zielmappe (neu oder bestehend); siehe Beschreibung',
      },
      originalEmail: {
        type: 'boolean',
        description:
          'Original-E-Mail (#999): geht mit dem Dokument, an dem sie hängt (Standard: ja); false – sie bleibt als eigenes Dokument in der Post, denn sie enthält alle Anhänge der Mail',
      },
      leerseiten: {
        type: 'string',
        enum: ['weglassen', 'behalten'],
        description:
          'Leerseiten (#997): weglassen (Standard) – markierte Seiten fallen weg, das Dokument in der Mappe ist eine neue Fassung ohne sie, das Original bleibt als frühere Version; behalten – alle Seiten bleiben',
      },
    },
  },
  Abtrennen: {
    type: 'object',
    required: ['dokumente'],
    properties: {
      dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten der Post, die als neue Post abgetrennt werden' },
    },
  },
  Abgetrennt: {
    type: 'object',
    properties: { post: ref('Mappe'), neu: { ...ref('Mappe'), description: 'Die neue Post mit den abgetrennten Dokumenten' } },
  },
  AbgleichEingabe: {
    type: 'object',
    properties: {
      dokumente: { type: 'array', items: uuid, description: 'Dokumente (höchstens 10)' },
      typ: { ...uuid, description: 'Gewählter Mappentyp: Vorschläge für seine Verweisfelder und die Warnung vor Doppelten' },
    },
  },
  Abgleich: {
    type: 'object',
    properties: {
      treffer: { type: 'array', items: ref('Abgleichtreffer'), description: 'Wiedergefundene Mappen, beste zuerst' },
      verweise: {
        type: 'object',
        additionalProperties: { type: 'array', items: ref('Abgleichtreffer') },
        description: 'Nur mit typ: je Verweisfeld die passenden Mappen, beste zuerst',
      },
      doppelt: {
        type: 'array',
        items: ref('Abgleichtreffer'),
        description: 'Nur mit typ: Mappen dieses Typs, deren Werte zum Wiederfinden alle im Dokument stehen',
      },
      dazu: {
        type: 'array',
        items: {
          allOf: [ref('Abgleichtreffer'), { type: 'object', properties: { feldKey: { type: 'string' }, feld: { type: 'string' } } }],
        },
        description:
          'Nur mit typ (#1043): Mappen anderer Typen mit eigenem starkem Beleg im Dokument, deren Verweisfeld feldKey auf diesen Typ zeigt und noch leer ist – z. B. der Lieferschein zur Rechnung',
      },
      eigene: {
        type: 'array',
        items: uuid,
        description: 'Treffer, die eigene Organisationen oder Personen des Haushalts sind (#1043) – nie als „von“ vorgeschlagen',
      },
      bezuege: { type: 'object', additionalProperties: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } } },
      ohneText: { type: 'array', items: uuid, description: 'Dokumente ohne Volltext' },
      typ: {
        type: 'object',
        nullable: true,
        description: 'Nur ohne typ: Vorschlag für „Wohin gehört das?“',
        properties: { typId: uuid, wort: { type: 'string' }, fundstelle: { type: 'string' } },
      },
    },
  },
  Abgleichtreffer: {
    type: 'object',
    properties: {
      mappeId: uuid,
      typId: uuid,
      sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
      unsicher: { type: 'boolean', description: 'Nur schwache Belege (z. B. nur der Name)' },
      punkte: { type: 'number' },
      belege: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mappeId: uuid,
            typId: uuid,
            feldKey: { type: 'string' },
            feld: { type: 'string' },
            wert: { type: 'string' },
            fundstelle: { type: 'string' },
            stark: { type: 'boolean' },
            ueber: {
              type: 'object',
              description: 'Über ein Verweisfeld geerbt',
              properties: { feldKey: { type: 'string' }, feld: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  Zugeordnet: {
    type: 'object',
    properties: {
      post: ref('Mappe'),
      ziel: ref('Mappe'),
      aufgeloest: {
        type: 'boolean',
        description:
          'true = die Post ist aufgelöst (#936); post zeigt ihren Stand vor dem Papierkorb; abgetrennt ist die neue Post mit den nicht gewählten Dokumenten (falls es welche gab)',
      },
      papierkorb: {
        type: 'boolean',
        description: 'Nur bei aufgeloest: true = die Post liegt im Papierkorb, false = sie ist endgültig gelöscht (Papierkorb aus)',
      },
      abgetrennt: ref('Mappe'),
      hinweis: {
        type: 'string',
        description: 'aufloesen war gewünscht, ging aber nicht (z. B. kein Recht zum Löschen der Post) – die Post ist nur zugeordnet',
      },
      leerseiten: { type: 'integer', description: 'Leerseiten (#997): so viele markierte Seiten sind weggelassen (fehlt ohne)' },
    },
  },
  KlassifizierenEingabe: {
    type: 'object',
    required: ['dokumente'],
    properties: { dokumente: { type: 'array', items: uuid, description: 'Dokumente (höchstens 10)' } },
  },
  Klassifizierung: {
    type: 'object',
    properties: {
      vorschlag: {
        ...ref('Typeinschaetzung'),
        nullable: true,
        description: 'Der eine Vorschlag (bester Typ ab Sicherheit 0,3) – null, wenn kein Weg genug fand',
      },
      typen: { type: 'array', items: ref('Typeinschaetzung'), description: 'Bis zu drei Typen, bester zuerst' },
      wege: {
        type: 'array',
        description: 'Wie jeder Weg gelaufen ist',
        items: {
          type: 'object',
          properties: {
            weg: { type: 'string', enum: ['ki', 'aehnlichkeit', 'kern', 'abgleich'] },
            stand: {
              type: 'string',
              enum: ['ok', 'leer', 'fehler', 'gesperrt', 'aus'],
              description: 'aus: Paket mit Netz, nicht als Standard gewählt; gesperrt: nichts ging hinaus (KI-Dienste, #796)',
            },
            paket: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            hinweis: { type: 'string' },
            verworfen: { type: 'integer', description: 'Angaben, die die Prüfung verworfen hat' },
          },
        },
      },
      ohneText: { type: 'array', items: uuid, description: 'Dokumente ohne Volltext' },
      bezuege: {
        type: 'object',
        additionalProperties: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } },
        description: 'Titel der Mappen aus Belegen des Abgleichs (nur lesbare)',
      },
    },
  },
  Typeinschaetzung: {
    type: 'object',
    properties: {
      typId: uuid,
      sicherheit: { type: 'number', minimum: 0, maximum: 1, description: 'Aus allen Wegen verbunden' },
      belege: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            weg: { type: 'string', enum: ['ki', 'aehnlichkeit', 'kern', 'abgleich'] },
            sicherheit: { type: 'number' },
            paket: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            begruendung: { type: 'string', description: 'Kurze Begründung des Pakets (reiner Text)' },
            zitat: { type: 'string', description: 'Wörtlich aus dem Dokument (geprüft)' },
            wort: { type: 'string', description: 'kern: Name des Typs im Text' },
            fundstelle: { type: 'string' },
            mappeId: { ...uuid, description: 'abgleich: wiedergefundene Mappe' },
            feld: { type: 'string', description: 'abgleich: Verweisfeld des Typs, das auf sie zeigt' },
            merkmal: { type: 'string', description: 'abgleich: Feld und Wert, an dem sie erkannt wurde' },
          },
        },
      },
    },
  },
  VorschlaegeEingabe: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text, z. B. von Fotos (höchstens 200.000 Zeichen)' },
      dokumente: { type: 'array', items: uuid, description: 'Dokumente mit Volltext (höchstens 10)' },
      mappe: { ...uuid, description: 'Mappe dieses Typs, die gefüllt wird' },
      positionen: {
        type: 'boolean',
        description: 'E-Rechnung (#1043): Positionen auch liefern, wenn die Mappe schon welche hat (sonst bleibt zeilen dann leer)',
      },
    },
  },
  TypVorschlaege: {
    type: 'object',
    properties: {
      engine: {
        type: 'object',
        description:
          'Womit erkannt wurde (#511): { art: eingebaut } oder { art: paket, id, name } – ein Paket mit dms:erkennen, gewählt in der Werkbank oder am Mappentyp',
        properties: { art: { type: 'string', enum: ['eingebaut', 'paket'] }, id: { type: 'string' }, name: { type: 'string' } },
      },
      hinweis: {
        type: 'string',
        description:
          'z. B. wenn das gewählte Paket nicht antwortete oder nichts Brauchbares lieferte und die eingebaute Erkennung übernahm',
      },
      gekuerzt: {
        type: 'boolean',
        enum: [true],
        description:
          'Nur vorhanden, wenn das Paket nur einen Teil des Texts gelesen hat (#564; ab 0.138.0) – der Kern schickt höchstens 50.000 Zeichen, ein Paket kann für seinen Dienst weiter kürzen',
      },
      vorschlaege: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            wert: { description: 'Wert im Format der Feldart (wie Werte)' },
            sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
            fundstelle: {
              type: 'string',
              description:
                'Textausschnitt, in dem der Wert steht; von einem Paket nur, wenn er wörtlich im Dokument steht (#939), sonst leer',
            },
            stelle: {
              type: 'object',
              description:
                'Nur mit dokumente (#939): wo die Fundstelle liegt – aus der Textebene bzw. der Texterkennung. Fehlt, wenn sie sich nicht finden ließ (Wert ohne Rahmen).',
              properties: {
                dokument: uuid,
                bereiche: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      seite: { type: 'integer', description: 'ab 1' },
                      x: { type: 'number' },
                      y: { type: 'number' },
                      b: { type: 'number' },
                      h: { type: 'number' },
                    },
                    description: 'Rahmen relativ zur Seite (0…1, Ursprung oben links), wie bei den Wortpositionen',
                  },
                },
              },
            },
            aus: {
              type: 'object',
              description:
                'Beim Auswählen übernehmen (#1037): Der Wert stammt aus der Mappe mappe, die für das Verweisfeld feld vorgeschlagen ist – nicht aus dem Dokument.',
              properties: { feld: { type: 'string' }, mappe: uuid },
            },
            hinweis: {
              type: 'string',
              description:
                'Hinweis des Kerns (#1043), z. B. „Gutschrift – als negativer Betrag übernommen“ oder „ausgehend? Bitte prüfen“ – nie aus einem Paket',
            },
          },
        },
        description: 'Je Feldkennung',
      },
      bezuege: {
        type: 'object',
        additionalProperties: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } },
        description: 'Titel der vorgeschlagenen Mappen in Verweisfeldern',
      },
      neu: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { typId: uuid, werte: { type: 'object', additionalProperties: { type: 'string' } }, fundstelle: { type: 'string' } },
        },
        description: 'Verweisfeld ohne passende Mappe: Vorschlag, eine neue (z. B. Organisation) mit diesen Werten anzulegen',
      },
      verworfen: { type: 'integer', description: 'Werte, die die Prüfung gegen die Feldtypen verworfen hat' },
      zeichen: { type: 'integer', description: 'Länge des gelesenen Texts' },
      erechnung: {
        type: 'object',
        description:
          'Nur, wenn eine E-Rechnung gelesen wurde (#1043; XRechnung UBL/CII als Datei bzw. Dokument, ZUGFeRD/Factur-X aus dem PDF-Anhang) – ihre Werte gehen vor',
        properties: {
          syntax: { type: 'string', enum: ['ubl', 'cii'] },
          gutschrift: { type: 'boolean' },
          profil: { type: 'string' },
          nummer: { type: 'string' },
        },
      },
      positionen: {
        type: 'object',
        description:
          'Nur mit E-Rechnung (#1043): Positionen für die Tabelle feld; je Zeile Werte für eine Mappe des Typs typId, deren Feld feldKey auf die neue Mappe zeigen soll. Nur, wenn der Schlüssel Mappen dieses Typs anlegen darf; angelegt wird nichts.',
        properties: {
          feld: { type: 'string' },
          typId: uuid,
          feldKey: { type: 'string' },
          zeilen: { type: 'array', items: { type: 'object', additionalProperties: true } },
          weitere: { type: 'integer', description: 'Positionen über der Grenze (500), nicht übernommen' },
          vorhanden: { type: 'integer', description: 'So viele lesbare Positionen hat die Mappe (mappe) schon' },
          zurueckgehalten: {
            type: 'integer',
            description:
              'Hat die Mappe schon Positionen und fehlt positionen: true in der Anfrage, bleibt zeilen leer – so viele wären es gewesen',
          },
        },
      },
      dazu: {
        type: 'array',
        description:
          'Gehört dazu (#1043): lesbare Mappen anderer Typen, die im Dokument stehen und über ihr leeres Verweisfeld feldKey zu einer Mappe dieses Typs gehören könnten (z. B. Lieferschein → Rechnung)',
        items: {
          type: 'object',
          properties: {
            mappeId: uuid,
            typId: uuid,
            titel: { type: 'string' },
            feldKey: { type: 'string' },
            feld: { type: 'string' },
            gruende: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      text: { type: 'string', description: 'Nur bei /datei: der gelesene Text' },
      info: { type: 'string', description: 'Nur bei /datei: wie gelesen wurde' },
    },
  },
  JsonSchema: { type: 'object', description: 'JSON Schema 2020-12', additionalProperties: true },
  Rueckgaengig: {
    type: 'object',
    properties: { post: ref('Mappe'), dokumente: { type: 'integer', description: 'Dokumente, die zurück in die Post kamen' } },
  },
  Erkennung: {
    type: 'object',
    properties: {
      zeit: { type: 'string', format: 'date-time' },
      dokumente: { type: 'integer', description: 'Dokumente der Post mit Volltext' },
      absender: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mappeId: uuid,
            typId: uuid,
            titel: { type: 'string' },
            stark: { type: 'boolean', description: 'an einem eindeutigen Merkmal erkannt (Kundennummer, IBAN, E-Mail …)' },
            punkte: { type: 'number' },
            gruende: { type: 'array', items: { type: 'string' }, description: 'z. B. „Kundennummer 100-4711“' },
          },
        },
      },
      eindeutig: { ...uuid, nullable: true, description: 'Eindeutig erkannter Absender' },
      angaben: {
        type: 'object',
        properties: {
          datum: {
            type: 'object',
            nullable: true,
            properties: {
              wert: { type: 'string', format: 'date' },
              sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
              fundstelle: { type: 'string' },
            },
          },
          betrag: {
            type: 'object',
            nullable: true,
            properties: {
              wert: { type: 'object', properties: { betrag: { type: 'number' }, waehrung: { type: 'string' } } },
              sicherheit: { type: 'string' },
              fundstelle: { type: 'string' },
            },
          },
          nummern: {
            type: 'array',
            items: { type: 'object', properties: { label: { type: 'string' }, wert: { type: 'string' }, fundstelle: { type: 'string' } } },
          },
          gutschrift: {
            type: 'object',
            description: '#1043: „Gutschrift“, „Erstattung“ oder „Rückzahlung“ im Kopf bzw. neben dem Betrag (wert = das Wort)',
            properties: { wert: { type: 'string' }, fundstelle: { type: 'string' } },
          },
        },
      },
      neuerAbsender: {
        type: 'object',
        nullable: true,
        properties: { typId: uuid, werte: { type: 'object', additionalProperties: { type: 'string' } }, fundstelle: { type: 'string' } },
      },
      ausgehend: {
        type: 'object',
        nullable: true,
        description:
          'Ausgehend? (#1043): In der Absenderzeile steht eine eigene Organisation bzw. Person des Haushalts – nur ein Hinweis, die Richtung ändert die Erkennung nie; solche Post wird nie automatisch zugeordnet. titel nur, wenn lesbar.',
        properties: { titel: { type: 'string' }, fundstelle: { type: 'string' } },
      },
      ziele: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mappeId: uuid,
            typId: uuid,
            titel: { type: 'string' },
            punkte: { type: 'number' },
            gruende: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
  FotoAbgelegt: { type: 'object', properties: { id: { ...uuid, description: 'Kennung des Fotos im Stapel' } } },
  PostFotos: {
    type: 'object',
    required: ['stapel'],
    properties: {
      stapel: { type: 'array', items: uuid, description: 'Kennungen aus POST /fotostapel, höchstens 50' },
      betreff: { type: 'string' },
      an: { ...uuid, description: 'Id eines Benutzers („An“, #1042)' },
      fuer: { ...uuid, deprecated: true, description: 'Alter Name für an (bis 1.0.0, #1042)' },
    },
  },
  FotosAnhaengen: {
    type: 'object',
    required: ['stapel'],
    properties: {
      stapel: { type: 'array', items: uuid },
      dokument: { ...uuid, description: 'PDF der Mappe, an das die Seiten kommen' },
      register: { type: 'string' },
    },
  },
  FotosAngehaengt: { type: 'object', properties: { dokument: ref('Dokument'), seiten: { type: 'integer' } } },
  Zusammenlegen: {
    type: 'object',
    required: ['quelle'],
    properties: { quelle: { ...uuid, description: 'Id der Post, deren Seiten angehängt werden' } },
  },
  PostAusFotos: { type: 'object', properties: { post: ref('Mappe'), dokument: ref('Dokument'), seiten: { type: 'integer' } } },
  EmailEingabe: {
    type: 'object',
    required: ['an', 'betreff'],
    properties: {
      an: { type: 'string', description: 'Eine oder mehrere Adressen, durch Komma getrennt' },
      betreff: { type: 'string' },
      nachricht: { type: 'string' },
      dokumente: { type: 'array', items: uuid, description: 'Ids von Dokumenten dieser Mappe' },
      mitAnlagen: { type: 'boolean', description: 'Anlagen (#998): hinter jedem gewählten Dokument seine Anlagen (Standard: ja)' },
      originalEmail: {
        type: 'boolean',
        description: 'Original-E-Mail (#999): geht als Anlage mit (Standard: ja); false lässt sie weg – sie enthält alle Anhänge der Mail',
      },
    },
  },
  EmailVersendet: { type: 'object', properties: { id: { ...uuid, description: 'Id der neuen E-Mail-Mappe' }, typId: uuid } },
  NotizEingabe: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  Erinnerung: {
    type: 'object',
    properties: {
      id: uuid,
      mappeId: uuid,
      empfaengerId: { ...uuid, nullable: true },
      datum: { type: 'string', format: 'date' },
      text: { type: 'string' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      hinweis: { type: 'string', description: 'Wenn der Empfänger die Mappe nicht lesen darf' },
    },
  },
};
