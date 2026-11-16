/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Mappen und Dokumente. */
import type { Schema } from './typen';
import { POST_UEBERGANG } from './parameter';
import { uuid, ref, zeit, liste } from './schema-hilfen';
import { HERKUNFT } from '../../../../shared/src/model';

/** Werte, Mappen, Papierkorb, Löschen, Dokumente, Anlagen, Leerseiten und Versionen. */
export const SCHEMAS_MAPPEN: Record<string, Schema> = {
  Werte: {
    type: 'object',
    additionalProperties: true,
    description: `Werte je Feldschlüssel (Post: ${POST_UEBERGANG}): Text und Datum (JJJJ-MM-TT) als string, Zahl als number, Ja/Nein als boolean, Betrag als {betrag, waehrung} (negativ nur mit negativ am Feld, #1035), Prozent als number (19 für 19 %; „19 %“ als Text geht beim Schreiben auch), Zeitraum als {anzahl, einheit} mit anzahl 0–9999 und einheit tage|wochen|monate|jahre (beim Schreiben auch „P3M“ oder „3 Monate“), Auswahl als string (mehrfach: string[]), Verweis als Mappen-Id (mehrfach: string[]). Passwort: beim Lesen nur {gesetzt, lesbar} (Klartext mit ?passwoerter=anzeigen); zum Setzen ein Text oder {neu}, zum Entfernen null, unverändert lassen durch Weglassen. Zusammengesetzt (#1050): nur lesen – der Schlüssel als string, Verweise darin als Mappen-Id (den Text mit Titeln baut der Client aus vorlage, den Werten und bezuege; nicht lesbare Mappen sind dort verborgen); gesendete Werte übergeht Ablago und setzt das Feld aus seinen Teilen.`,
    example: {
      rechnungsnummer: 'R-2026-17',
      rechnungsdatum: '2026-10-01',
      betrag: { betrag: 49.9, waehrung: 'EUR' },
      steuersatz: 19,
      kuendigungsfrist: { anzahl: 3, einheit: 'monate' },
      bezahlt: false,
    },
  },
  Mappe: {
    type: 'object',
    properties: {
      id: uuid,
      typId: uuid,
      werte: ref('Werte'),
      titel: { type: 'string', description: 'Vom Server aus der Titel-Vorlage berechnet' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      geaendert: zeit,
      geaendertVon: { ...uuid, nullable: true },
      passt: { type: 'boolean', description: 'Passt zur aktuellen Definition des Typs' },
      problem: { type: 'string', nullable: true },
      demo: { type: 'boolean' },
      systemKennung: { type: 'string', nullable: true, description: 'Mappen, die das System pflegt, z. B. rolle:mitglied' },
      vorgabe: {
        type: 'string',
        description:
          'Vorgabe aus einem Paket (#1038): feste Kennung paket:<id>:<schluessel>. Fehlt bei allen anderen Mappen. Ein Paket ändert und löscht keine Vorgabe eines anderen Pakets und löscht keine Dokumente daran (403).',
      },
    },
  },
  MappeEingabe: { type: 'object', required: ['typId', 'werte'], properties: { typId: uuid, werte: ref('Werte') } },
  MappeAenderung: {
    type: 'object',
    required: ['werte'],
    properties: {
      werte: { ...ref('Werte'), description: 'Nur die Felder, die sich ändern sollen; fehlende Felder bleiben unverändert (#609)' },
      stand: {
        ...zeit,
        description:
          'Optional (#609): „geaendert“ der Mappe beim Lesen. Hat sich seitdem ein übergebenes Feld geändert und soll es anders lauten, kommt 409 statt Überschreiben.',
      },
    },
  },
  Mappenkonflikt: {
    type: 'object',
    description: 'Gleichzeitig bearbeiten (#609): details der 409-Antwort von PUT /mappen/{id}',
    properties: {
      stand: { ...zeit, description: 'Aktueller Stand der Mappe – mit ihm noch einmal senden, um die eigenen Werte zu übernehmen' },
      konflikte: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            feld: { type: 'string', description: 'Kennung des Felds' },
            label: { type: 'string' },
            deins: { type: 'string', description: 'Dein Wert, lesbar (leer bei Passwortfeldern)' },
            aktuell: { type: 'string', description: 'Jetziger Wert, lesbar (leer bei Passwortfeldern)' },
            wert: { description: 'Jetziger Wert wie in werte; fehlt bei Passwortfeldern' },
            geheim: { type: 'boolean', description: 'Passwortfeld' },
            von: { ...uuid, nullable: true, description: 'Wer zuletzt geändert hat; null = Ablago selbst' },
            name: { type: 'string' },
            zeit,
          },
        },
      },
    },
  },
  Bezug: { type: 'object', properties: { titel: { type: 'string' }, typId: uuid } },
  PapierkorbEintrag: {
    type: 'object',
    properties: {
      id: uuid,
      typId: uuid,
      titel: { type: 'string' },
      werte: ref('Werte'),
      demo: { type: 'boolean' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      geaendert: zeit,
      geaendertVon: { ...uuid, nullable: true },
      geloescht: zeit,
      geloeschtVon: { ...uuid, nullable: true },
      dokumente: { type: 'integer', description: 'Anzahl Dokumente, die mit ihr im Papierkorb liegen' },
      vorgang: { ...uuid, nullable: true, description: 'Mit verknüpften Mappen gelöscht (#424): gemeinsame Id des Vorgangs' },
      entkoppelt: {
        type: 'array',
        description: 'Verweise bleibender Mappen auf diese, die beim Löschen entfernt wurden (#424)',
        items: { type: 'object', properties: { quelleId: uuid, feldKey: { type: 'string' } } },
      },
      aufgeloestIn: {
        type: 'object',
        description:
          'Nur bei aufgelöster Post (#936): die Mappe, die aus ihr wurde; da = es gibt sie noch. Wiederherstellen geht dann nicht (409).',
        properties: { id: uuid, typId: uuid, titel: { type: 'string' }, da: { type: 'boolean' } },
      },
    },
  },
  PapierkorbListe: liste('PapierkorbEintrag'),
  Wiederhergestellt: {
    type: 'object',
    properties: {
      mappe: ref('Mappe'),
      verweiseEntfallen: { type: 'integer', description: 'Verweise auf Mappen, die es nicht mehr gibt' },
      teile: { type: 'integer', description: 'Teile (#1031), die mit der Mappe gelöscht wurden und mit ihr zurückkamen; fehlt ohne' },
    },
  },
  LoeschVorschau: {
    type: 'object',
    properties: {
      baum: ref('Baum'),
      kanten: { type: 'array', items: { type: 'object', properties: { quelleId: uuid, feldKey: { type: 'string' }, zielId: uuid } } },
      geteilt: { type: 'array', items: uuid },
      nichtLoeschbar: { type: 'object', additionalProperties: { type: 'string' } },
      vorschlag: { type: 'object', additionalProperties: { type: 'string', enum: ['loeschen', 'entkoppeln', 'behalten'] } },
      papierkorbTage: { type: 'integer' },
    },
  },
  LoeschAusfuehren: {
    type: 'object',
    required: ['auswahl'],
    properties: {
      auswahl: {
        type: 'object',
        additionalProperties: { type: 'string', enum: ['loeschen', 'entkoppeln', 'behalten'] },
        description: 'Mappen-Id → Aktion; fehlende Ids bleiben',
      },
      tiefe: { type: 'integer' },
      max: { type: 'integer' },
    },
  },
  LoeschErgebnis: {
    type: 'object',
    properties: {
      vorgang: uuid,
      endgueltig: { type: 'boolean', description: 'true = kein Papierkorb, sofort endgültig' },
      zahlen: {
        type: 'object',
        properties: {
          mappen: { type: 'integer' },
          dokumente: { type: 'integer' },
          frist: { type: 'integer' },
          ohneRecht: { type: 'integer' },
          verweise: { type: 'integer' },
          gehalten: { type: 'integer' },
          abgewaehlt: { type: 'integer' },
        },
      },
      loeschen: { type: 'array', items: uuid },
      entkoppeln: { type: 'array', items: { type: 'object' } },
      erinnerung: {
        type: 'object',
        nullable: true,
        description:
          'Erinnerung zum Fristende (#424): blieb die Start-Mappe wegen Mappen in der Aufbewahrungsfrist, eine Erinnerung für den Aufrufer an der Start-Mappe zum Tag nach dem spätesten Fristende',
        properties: { id: uuid, datum: { type: 'string', format: 'date' }, text: { type: 'string' } },
      },
    },
  },
  VorgangWiederhergestellt: {
    type: 'object',
    properties: {
      mappen: { type: 'integer' },
      verweiseWieder: { type: 'integer' },
      verweiseEntfallen: { type: 'integer' },
      startId: { ...uuid, nullable: true },
    },
  },
  Geloescht: { type: 'object', properties: { geloescht: { type: 'integer', description: 'Anzahl endgültig gelöschter Mappen' } } },
  Dokument: {
    type: 'object',
    properties: {
      id: uuid,
      mappeId: uuid,
      registerKey: { type: 'string' },
      name: { type: 'string' },
      mime: { type: 'string' },
      groesse: { type: 'integer' },
      sha256: { type: 'string' },
      anzeigbar: { type: 'boolean' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      sprache: {
        type: 'string',
        nullable: true,
        description:
          'Sprache des Volltexts (#400), Kennung wie fra; null = keine Angabe (Deutsch). Bei mehrsprachigen Dokumenten die Hauptsprache (#579).',
      },
      weitereSprachen: {
        type: 'array',
        items: { type: 'string' },
        description: 'Weitere Sprachen im Dokument (#579, „enthält auch“), nach Textmenge',
      },
      teilenAb: {
        type: 'integer',
        nullable: true,
        description:
          'Hinweis „Post teilen?“ (#579): ab dieser Seite beginnt vermutlich ein eigenes Schreiben (die Sprache wechselt ganz); null ohne Wechsel oder weggeklickt',
      },
      ocr: {
        type: 'object',
        description: 'Stand der Texterkennung',
        properties: {
          stand: {
            type: 'string',
            enum: ['keiner', 'wartet', 'laeuft', 'fertig', 'fehler', 'ausgelassen', 'paket'],
            description: 'paket (#458): Textebene gelesen, wartet auf das Paket für die Texterkennung',
          },
          info: { type: 'string', nullable: true },
          seiten: { type: 'integer', nullable: true },
          zeit: { ...zeit, nullable: true },
        },
      },
      version: { type: 'integer', description: 'Nummer der aktuellen Version (ohne Versionierung 1)' },
      herkunft: { type: 'string', nullable: true, enum: [...Object.keys(HERKUNFT), null], description: 'Woher die aktuelle Version kam' },
      archivnummer: { type: 'string', nullable: true, description: 'Archivnummer des Papieroriginals (#345)' },
      aeltere: { type: 'integer', description: 'Anzahl älterer Versionen' },
      leerseiten: {
        ...ref('Leerseiten'),
        nullable: true,
        description:
          'Leerseiten (#997): Markierung eines Pakets und Wahl je Seite; fehlt ohne Markierung. Gilt nur, solange sha256 gleich ist.',
      },
      anlageZu: {
        ...uuid,
        nullable: true,
        description:
          'Anlagen (#998): Id des Hauptdokuments, an dem dieses Dokument als Anlage hängt (gleiche Mappe, gleiches Register); fehlt bei eigenen Dokumenten',
      },
      anlageNr: { type: 'integer', nullable: true, description: 'Anlagen (#998): Reihenfolge ab 1 („Anlage 1“); nur mit anlageZu' },
      eingangNr: {
        type: 'integer',
        nullable: true,
        description:
          'E-Mail-Postfach (#999): Platz in der Eingangsreihenfolge der Post (1, 2, 3 … wie die Anhänge in der E-Mail stehen); fehlt bei allem, was nicht aus dem Postfach kam',
      },
      originalEmail: {
        type: 'boolean',
        description:
          'E-Mail-Postfach (#999): die abgeholte E-Mail selbst („Original-E-Mail“, .eml) – letzte Anlage am letzten Anhang oder, ohne Anhänge, das Hauptdokument; Erkennung und KI lassen sie weg. Fehlt sonst.',
      },
    },
  },
  Anlagen: {
    type: 'object',
    description: 'Ein Dokument und seine Anlagen (#998)',
    properties: { dokument: ref('Dokument'), anlagen: { type: 'array', items: ref('Dokument'), description: 'Anlage 1 zuerst' } },
  },
  AnlageAnhaengen: {
    type: 'object',
    required: ['dokument'],
    properties: {
      dokument: { ...uuid, description: 'Dokument derselben Mappe, das Anlage wird' },
      name: { type: 'string', maxLength: 200, description: 'Neuer Name (sonst bleibt seiner)' },
    },
  },
  AnlagenReihenfolge: {
    type: 'object',
    required: ['reihenfolge'],
    properties: { reihenfolge: { type: 'array', items: uuid, description: 'Alle Anlagen des Dokuments in neuer Reihenfolge' } },
  },
  AnlageName: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 200 } } },
  Leerseiten: {
    type: 'object',
    description: 'Markierung leerer Seiten (#997)',
    properties: {
      paket: { type: 'string', nullable: true, description: 'Id des Pakets, das markiert hat; null, wenn nur eine Person gewählt hat' },
      paketName: { type: 'string', nullable: true },
      sha256: { type: 'string', description: 'Prüfwert der Datei, für die die Markierung gilt' },
      seiten: { type: 'integer', description: 'Seitenzahl der Datei' },
      erkannt: { type: 'array', items: { type: 'integer' }, description: 'Vom Paket als leer erkannte Seiten' },
      behalten: { type: 'array', items: { type: 'integer' }, description: '„Doch behalten“: erkannte Seiten, die bleiben' },
      weglassen: {
        type: 'array',
        items: { type: 'integer' },
        description: '„Auch weglassen“: weitere Seiten, die beim Übernehmen wegfallen',
      },
      geaendert: zeit,
    },
  },
  LeerseitenStand: {
    type: 'object',
    properties: {
      dokument: uuid,
      sha256: { type: 'string' },
      seiten: { type: 'integer' },
      leerseiten: { ...ref('Leerseiten'), nullable: true },
      wegfallend: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Seiten, die beim Übernehmen wegfallen (erkannt ohne behalten, dazu weglassen)',
      },
    },
  },
  LeerseitenMarkieren: {
    type: 'object',
    required: ['sha256', 'seiten'],
    properties: {
      sha256: { type: 'string', description: 'Prüfwert der geprüften Datei (aus GET /mappen/{id} bzw. dem Ereignis)' },
      seiten: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 400, description: 'Leere Seiten (ab 1); leer = keine' },
    },
  },
  LeerseiteWahl: {
    type: 'object',
    required: ['weglassen'],
    properties: { weglassen: { type: 'boolean', description: 'true = fällt beim Übernehmen weg, false = bleibt' } },
  },
  DokumentVersion: {
    type: 'object',
    description: 'Eine ältere Version eines Dokuments',
    properties: {
      dokumentId: uuid,
      nummer: { type: 'integer' },
      name: { type: 'string' },
      mime: { type: 'string' },
      groesse: { type: 'integer' },
      sha256: { type: 'string' },
      anzeigbar: { type: 'boolean' },
      erstellt: zeit,
      erstelltVon: { ...uuid, nullable: true },
      herkunft: { type: 'string', nullable: true },
    },
  },
  Versionen: {
    type: 'object',
    properties: { aktuell: ref('Dokument'), aeltere: { type: 'array', items: ref('DokumentVersion'), description: 'neueste zuerst' } },
  },
};
