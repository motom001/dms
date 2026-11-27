/** OpenAPI-Schemas (#1278, vorher in `http/api-v1.ts`), Teil Typen. */
import type { Schema } from './typen';
import { SCHLUESSEL, TYP_KENNUNG } from '../../../../shared/src/kennungen';
import { FELDTYPEN, ZIELTYPEN_MAX, REGISTERARTEN, ABSCHNITT_TITEL_MAX, HISTORIENGRUPPEN } from '../../../../shared/src/model';
import { FELDART_BESCHREIBUNG, uuid, beschriftungen, ref, liste, zeit } from './schema-hilfen';
import { ERKENNUNGSARTEN } from '../../../../shared/src/erkennung';
import { FELDFORMATE } from '../../../../shared/src/feldformate';
import { VORLAGE_MAX } from '../../../../shared/src/zusammengesetzt';
import { ANZEIGE_BEDINGUNGEN_MAX } from '../../../../shared/src/anzeige';
import { MERKMALE } from '../../../../shared/src/merkmale';

/** Fehler, Prüfergebnis, Felder, Register, Mappentypen und ihre Fassungen. */
export const SCHEMAS_TYPEN: Record<string, Schema> = {
  Fehler: {
    type: 'object',
    required: ['fehler'],
    properties: {
      fehler: { type: 'string', description: 'Meldung auf Deutsch' },
      details: { description: 'Je nach Fehler, z. B. Prüfergebnis bei 422' },
    },
  },
  Pruefergebnis: {
    type: 'object',
    properties: {
      allgemein: { type: 'array', items: { type: 'string' } },
      felder: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
        description: 'Meldungen je Feldschlüssel',
      },
    },
  },
  Feld: {
    type: 'object',
    required: ['key', 'label', 'typ'],
    properties: {
      key: { type: 'string', pattern: SCHLUESSEL.source },
      label: { type: 'string' },
      typ: { type: 'string', enum: Object.keys(FELDTYPEN), description: FELDART_BESCHREIBUNG },
      pflicht: { type: 'boolean', description: 'Nie bei typ=tabelle und typ=zusammengesetzt' },
      eindeutig: {
        type: 'boolean',
        description:
          'Bei typ=text, zahl und zusammengesetzt (#1050: die Kombination; bei Doppelung 422 mit der Meldung am ersten beteiligten Feld)',
      },
      hilfe: { type: 'string' },
      minLen: { type: 'integer' },
      maxLen: { type: 'integer' },
      min: {
        oneOf: [{ type: 'number' }, { type: 'string' }],
        description: 'Zahl, Betrag und Prozent: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT – frühestes erlaubtes Datum',
      },
      max: {
        oneOf: [{ type: 'number' }, { type: 'string' }],
        description:
          'Zahl, Betrag und Prozent: Zahl. Datum (#535): „heute“ oder JJJJ-MM-TT – spätestes erlaubtes Datum, z. B. heute für einen Geburtstag',
      },
      nachkomma: { type: 'integer', description: 'Zahl und Prozent: höchstens so viele Nachkommastellen' },
      negativ: {
        type: 'boolean',
        description: 'Nur bei typ=betrag (#1035): negative Beträge erlaubt (Gutschrift, Erstattung). Fehlt = nein – dann gilt ≥ 0.',
      },
      standard: {
        oneOf: [{ type: 'string' }, { type: 'boolean' }],
        nullable: true,
        description: 'Standardwert für neue Mappen. Zeitraum (#1035) als P3M oder „3 Monate“ (gespeichert P3M), Prozent als Zahl („19“).',
      },
      muster: { type: 'string' },
      optionen: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Bei typ=auswahl: die festen Werte (#728). In der Mappe steht immer der feste Wert – auch über die API lesen und schreiben; die Beschriftung je Sprache steht in beschriftungen.<sprache>.optionen.',
      },
      system: {
        type: 'boolean',
        readOnly: true,
        description: 'Systemfeld eines Systemmappentyps: nicht entfernbar, nur Bezeichnung und Hilfetext änderbar',
      },
      mehrfach: { type: 'boolean' },
      zielTypen: {
        type: 'array',
        maxItems: ZIELTYPEN_MAX,
        items: { type: 'string' },
        description:
          'Bei typ=referenz (#1036): Ids der Ziel-Mappentypen – einer oder mehrere; ["*"] = jede Mappe (nur Systemfelder). Beim Speichern prüft Ablago, dass jede verwiesene Mappe einen dieser Typen hat. Leer nur, wenn zielOptional etwas nennt.',
      },
      zielTyp: {
        ...uuid,
        deprecated: true,
        description:
          'Veraltet (#1036), statt dessen zielTypen. Beim Lesen bei genau einem Zieltyp (oder "*") gesetzt, bei mehreren nicht; beim Schreiben gilt es nur ohne zielTypen.',
      },
      gleicherTyp: {
        type: 'boolean',
        description:
          'Bei typ=referenz mit mehrfach (#1036): alle gewählten Mappen vom selben Mappentyp – ist die erste ein Fahrzeug, dürfen die weiteren nur Fahrzeuge sein. Prüft Ablago beim Speichern.',
      },
      zielOptional: {
        type: 'array',
        maxItems: ZIELTYPEN_MAX,
        items: { type: 'string', pattern: TYP_KENNUNG.source },
        description:
          'Bei typ=referenz (#1036, aus Paketen): Kennungen paket:schluessel von Zieltypen anderer Pakete, von denen das Paket nicht abhängt. Sobald es einen davon gibt, steht seine Id in zielTypen.',
      },
      verweisart: { type: 'string', enum: ['zugehoerigkeit', 'bezug'] },
      waehrung: { type: 'string' },
      folgtAus: {
        type: 'object',
        nullable: true,
        required: ['feld', 'zielFeld'],
        description:
          'Bei typ=referenz (#886): Das Feld folgt aus einem anderen Verweisfeld dieser Mappe (feld, nur eine Mappe) über ein Verweisfeld der Mappe, auf die es zeigt (zielFeld, nur eine Mappe, auf denselben Zieltyp). Beispiel Person: organisation folgt aus niederlassung → organisation. Beim Anlegen und Ändern füllt Ablago ein leeres Feld, wenn die Quelle neu gesetzt oder geändert wird und die Anfrage das Feld nicht selbst nennt (auch nicht als null) – nur mit Mappen, die der Schlüssel lesen darf; ein vorhandener Wert wird nie überschrieben. Keine Kreise.',
        properties: { feld: { type: 'string' }, zielFeld: { type: 'string' } },
      },
      ausDatum: {
        type: 'object',
        nullable: true,
        required: ['datumFeld', 'zielFeld'],
        description:
          'Bei typ=referenz mit genau einem Zieltyp (#1648): aus einem Datumsfeld dieser Mappe ableiten – z. B. Steuerjahr aus „Bis“. datumFeld: Datumsfeld dieser Mappe; zielFeld: Feld des Zieltyps mit dem Jahr (Text oder Zahl wie „2012“, oder ein Datum im selben Jahr). Nur ein Vorschlag in der Oberfläche und bei „Aus Dokument ausfüllen“: genau eine passende Mappe wird vorgeschlagen, sonst „… anlegen“ angeboten. Speichern füllt nichts von selbst.',
        properties: { datumFeld: { type: 'string' }, zielFeld: { type: 'string' } },
      },
      auswahlReihenfolge: {
        type: 'object',
        nullable: true,
        required: ['feld'],
        description:
          'Bei typ=referenz (#1671): Reihenfolge der Auswahl in der Oberfläche – feld: ein Feld des Zieltyps, nach dem sich sortieren lässt (nur bei genau einem Zieltyp), oder _titel, _erstellt, _geaendert; absteigend: true für absteigend. Fehlt = Titel aufsteigend in natürlicher Reihenfolge (Zahlen als Zahlen). Beispiel Steuerjahr: { feld: jahr, absteigend: true }.',
        properties: { feld: { type: 'string' }, absteigend: { type: 'boolean' } },
      },
      vorbelegen: {
        type: 'array',
        maxItems: 50,
        description:
          'Bei typ=referenz (#1037): „beim Auswählen übernehmen“ – Paare von (Feld der Mappe, auf die verwiesen wird) → nach (Feld dieser Mappe), z. B. kuendigungsfrist → kuendigungsfrist. Wählt man eine Mappe, schlägt die Oberfläche deren Werte in leeren Feldern vor (sichtbar, änderbar, nie überschrieben); „Aus Dokument ausfüllen“ liefert sie als Vorschläge mit aus. Gleiche Feldart nötig (Text auch in Langtext, Mehrfachwerte nur in Mehrfachfelder, Auswahlwerte und Verweisziele enthalten); nie aus oder in Passwortfelder, nie in berechnete Felder; nur Werte, die der Schlüssel lesen darf. Mehrere Zieltypen: gilt für jeden, der das Feld von hat. Speichern füllt nichts von selbst.',
        items: { type: 'object', required: ['von', 'nach'], properties: { von: { type: 'string' }, nach: { type: 'string' } } },
      },
      erkennung: {
        type: 'object',
        nullable: true,
        description:
          'Aus Dokument füllen (#336, #391; bis #938 „Für die Erkennung nutzen“); vorhanden = an. Nur bei Text, Langtext, Zahl, Betrag, Datum, Auswahl, Verweis, Zeitraum und Prozent. art: was im Feld steht (fehlt = aus Feldart und Bezeichnung), hinweis: Erkennungshinweis, z. B. „Muster 100-####“ (# = Ziffer). art=code (#1723, Text und Langtext): der Inhalt eines QR-Codes oder Barcodes, den ein Paket mit dms:codes auf dem Dokument gelesen hat – nie aus dem Text.',
        properties: {
          art: { type: 'string', enum: Object.keys(ERKENNUNGSARTEN) },
          hinweis: { type: 'string', maxLength: 300 },
          endeVon: {
            type: 'string',
            description:
              'Nur am Datumsfeld für das Ende eines Zeitraums (#1646): Kennung des Datumsfelds für den Beginn. Steht im Dokument ein Zeitraum („vom 01.07.2012 – 31.07.2012“), bekommt der Beginn das erste und dieses Feld das zweite Datum. Fehlt = aus Kennung und Bezeichnung (Beginn/Ende, Von/Bis, Mietbeginn/Mietende …).',
          },
          muster: {
            type: 'string',
            maxLength: 200,
            description:
              'Nur mit art=code (#1723): regulärer Ausdruck, der auf den ganzen Inhalt passen muss, z. B. „https://www\\.kba-online\\.de/dub/#/zugriffsdaten/.+“ – mit denselben Grenzen wie das Prüfmuster an Textfeldern (höchstens 200 Zeichen, keine verschachtelten Wiederholungen, Inhalte bis 1000 Zeichen). Passen mehrere Codes, gewinnt der auf der früheren Seite; passt keiner, bleibt das Feld leer. Fehlt = jeder Code.',
          },
          codeart: {
            type: 'string',
            pattern: '^[a-z0-9]{1,20}$',
            description:
              'Nur mit art=code (#1723): Art des Codes als kurzer Bezeichner, z. B. qr, ean13, itf, aztec – so, wie das Paket, das Codes liest, sie nennt. Fehlt = jede.',
          },
        },
      },
      wiederfinden: {
        type: 'boolean',
        description:
          'Zum Wiederfinden nutzen (#938): Über diesen Wert findet Ablago vorhandene Mappen in Dokumenten wieder (z. B. Kundennummer, Vertragsnummer, Rechnungsnummer, Kennzeichen) – für Vorschläge mit Belegen und die Warnung vor Doppelten. Unabhängig von eindeutig. Nur bei Text, Zahl und Verweis; ohne die Angabe bleibt beim Speichern der bisherige Wert.',
      },
      format: {
        type: 'string',
        nullable: true,
        enum: [...FELDFORMATE],
        description: 'Nur bei typ=text (#535): Format der Angabe. Neue und geänderte Werte müssen passen, gespeicherte bleiben gültig.',
      },
      landFeld: {
        type: 'string',
        nullable: true,
        description:
          'Bei format=plz (#535): Kennung des Felds mit dem Land. Steht dort Deutschland (oder nichts), hat die PLZ genau 5 Ziffern.',
      },
      ausgeblendet: {
        type: 'boolean',
        description:
          'Ausgeblendet (#655): nicht im Formular und in der Mappenansicht der Oberfläche, nicht zur Auswahl für neue Spalten und Bedingungen. Werte bleiben gespeichert und sind über die API les- und schreibbar. Nie Pflicht (beim Ausblenden hebt Ablago Pflicht auf), nie an Systemfeldern. Liegt das Feld auf einem ausgeblendeten Register, gilt es ebenso als ausgeblendet. Ohne die Angabe bleibt beim Speichern der bisherige Wert.',
      },
      beschriftungen: beschriftungen({
        label: { type: 'string' },
        hilfe: { type: 'string' },
        optionen: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Fester Wert → Beschriftung; auch für de (sonst gilt der feste Wert)',
        },
      }),
      anzeigen: ref('Anzeigeregel'),
      quelle: {
        type: 'object',
        required: ['typId', 'feldKey'],
        description:
          'Nur bei typ=tabelle (#1030): Die Tabelle zeigt die Mappen vom Typ typId, die über das Verweisfeld feldKey hierher verweisen, mit den Spalten der Trefferliste trefferliste des anderen Typs (fehlt = Standard; Passwortfelder nie). neu beschriftet „+ Neu“ unter der Tabelle (höchstens 40 Zeichen, sonst „+ <Typname>“; andere Sprachen unter beschriftungen.<sprache>.neu). Eine Tabelle hat keinen eigenen Wert: nicht in werte, nicht im Export, nicht in Bedingungen, Spalten oder der Titel-Vorlage; nie Pflicht. Ihre Zeilen liefert GET /mappen/{id}/tabelle/{feld}.',
        properties: { typId: uuid, feldKey: { type: 'string' }, trefferliste: { type: 'string' }, neu: { type: 'string', maxLength: 40 } },
      },
      merkmal: {
        type: 'string',
        enum: ['eigeneOrganisation'],
        description:
          'Nur am Ja/Nein-Feld (#995): ja heißt, die Mappe ist eine eigene Organisation. Kommt aus dem Paket (Basis); beim Ändern des Mappentyps bleibt es, wie es ist.',
      },
      schreibschutz: {
        type: 'string',
        enum: ['verwaltung'],
        description:
          'Geschütztes Feld (#995): ändern nur im Verwaltungsmodus mit dem Bereich „Eigene Organisation“ oder mit einer dort freigegebenen Rolle, sonst 403. Kommt aus dem Paket; beim Ändern des Mappentyps bleibt es, wie es ist.',
      },
      vorlage: {
        type: 'string',
        maxLength: VORLAGE_MAX,
        example: '{von} · {rechnungsnummer}',
        description:
          'Nur bei typ=zusammengesetzt (#1050): Platzhalter und Filter wie titelVorlage, aus Feldern dieses Typs der Arten text, zahl, betrag, prozent, datum, zeitraum, janein, auswahl und referenz (ohne Nummernkreis). Ablago setzt den Wert beim Speichern: gespeichert wird ein Schlüssel ohne Sprache (Datum JJJJ-MM-TT, Zahlen mit Punkt, Auswahl als fester Wert, Verweise als Mappen-Id – nie ein Titel). Wird die Vorlage geändert, rechnet Ablago alle Mappen neu.',
      },
      berechnetVon: {
        type: 'string',
        nullable: true,
        description:
          'Berechnet (#1034): Id des Pakets, dessen Code den Wert schreibt (im Paketformat berechnet: true). In der Oberfläche nur lesbar; andere Schreiber bekommen 400. Setzen kann es nur die Paketverwaltung; null beim Ändern des Mappentyps gibt das Feld wieder frei („Feld wieder freigeben“, Werkbank).',
      },
    },
  },
  Anzeigeregel: {
    type: 'object',
    required: ['modus', 'bedingungen'],
    description:
      'Anzeigen, wenn … (#1033) an Feld oder Abschnitt: Das Formular der Oberfläche zeigt es nur, wenn die Regel zutrifft (Apps sollten es genauso halten). Nur Ordnung, kein Schutz – Werte bleiben gespeichert und sind über die API les- und schreibbar; Pflicht ist ein Feld nur, solange es zu sehen ist (der Server wertet dafür genauso aus wie die Oberfläche). Ein ausgeblendeter Abschnitt blendet alle Felder bis zum nächsten Abschnitt aus. Bedingungen mit Problem (Feld entfernt) zählen nicht; ohne gültige Bedingung ist alles zu sehen. Nie an Systemfeldern. Ohne die Angabe bleibt beim Speichern die bisherige Regel; null bzw. ohne Bedingung entfernt sie.',
    properties: {
      modus: { type: 'string', enum: ['alle', 'eine'], description: 'alle: jede Bedingung trifft zu; eine: mindestens eine' },
      bedingungen: {
        type: 'array',
        maxItems: ANZEIGE_BEDINGUNGEN_MAX,
        items: {
          type: 'object',
          required: ['art'],
          properties: {
            art: {
              type: 'string',
              enum: ['merkmal', 'feld', 'verweistyp', 'eigeneOrganisation'],
              description:
                'merkmal: Merkmal der Ablage (#1032); feld: Feldwert der Mappe wie eine Feldbedingung der Ansichten (nur feste Werte oder heute; „zeigt auf“ mit Mappen-Ids = Verweis zeigt auf eine bestimmte Mappe); verweistyp: ein Verweisfeld zeigt auf eine Mappe des Mappentyps typ; eigeneOrganisation (#995): ein Verweisfeld zeigt auf eine eigene Organisation',
            },
            nicht: { type: 'boolean', description: 'umgekehrt' },
            merkmal: { type: 'string', enum: [...MERKMALE] },
            bedingung: { type: 'object', description: 'Bei art=feld: { art: "feld", feld, op, wert?, bis? } wie in Ansichten' },
            feld: { type: 'string', description: 'Bei art=verweistyp und art=eigeneOrganisation: Kennung des Verweisfelds' },
            typ: { ...uuid, description: 'Bei art=verweistyp: Id des Mappentyps' },
          },
        },
      },
    },
  },
  Merkmale: {
    type: 'object',
    required: [...MERKMALE],
    description:
      'Merkmale der Ablage (#1032) – bewusst nur eines. beruflich: Die Ablage wird auch beruflich genutzt (Vorgabe nein). Nutzbar in Anzeige-Bedingungen und in Bedingungen von Rechten, Ansichten und Automatisierungen. Einstellen in Werkbank → Ablage aufbauen → Nutzung (nur Gesamte Verwaltung).',
    properties: { beruflich: { type: 'boolean' } },
  },
  Register: {
    type: 'object',
    required: ['key', 'name', 'art'],
    properties: {
      key: { type: 'string' },
      name: { type: 'string' },
      art: { type: 'string', enum: Object.keys(REGISTERARTEN) },
      beschriftungen: beschriftungen({ name: { type: 'string' } }),
      felder: { type: 'array', items: { type: 'string' } },
      abschnitte: {
        type: 'array',
        description:
          'Feldregister (#890): Abschnitte zwischen den Feldern – nur Darstellung, die Feldliste bleibt. Ab dem Feld vor beginnt eine neue Zeile; mit titel zeigt die Mappe eine Überschrift (Apps: gruppierte Liste), mit eingeklappt ist der Abschnitt beim Öffnen zu (Vorgabe; jede Person kann es sich anders merken). Ohne titel nur ein Umbruch (in schmaler Ansicht ohne Wirkung). Je Feld höchstens einer; Abschnitte vor Feldern anderer Register fallen weg. Ohne die Angabe bleiben beim Speichern die bisherigen.',
        items: {
          type: 'object',
          required: ['vor'],
          properties: {
            vor: { type: 'string', description: 'Kennung des Felds, mit dem der Abschnitt beginnt' },
            titel: { type: 'string', maxLength: ABSCHNITT_TITEL_MAX, example: 'Bankverbindung' },
            eingeklappt: { type: 'boolean', description: 'Nur mit titel' },
            beschriftungen: beschriftungen({ titel: { type: 'string' } }),
            anzeigen: ref('Anzeigeregel'),
          },
        },
      },
      ausgeblendet: {
        type: 'boolean',
        description:
          'Ausgeblendet (#655): Die Mappe zeigt das Register nicht, Felder darauf gelten als ausgeblendet; Werte bleiben. Nicht bei Dokumentenregistern und Registern mit Systemfeldern; ein Register muss sichtbar bleiben. Ohne die Angabe bleibt beim Speichern der bisherige Wert.',
      },
      zeigt: {
        type: 'array',
        items: { type: 'string', enum: Object.keys(HISTORIENGRUPPEN) },
        description: 'Register „Historie“ (#800): welche Gruppen von Einträgen es zeigt; fehlt = Vorauswahl ohne Abrufe',
      },
      quellen: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            typId: uuid,
            feldKey: { type: 'string' },
            trefferliste: {
              type: 'string',
              description: 'Kennung einer Trefferliste des Quelltyps; das Register zeigt dann deren Spalten',
            },
          },
        },
      },
    },
  },
  MappentypEingabe: {
    type: 'object',
    required: ['name', 'felder'],
    properties: {
      autoZuordnen: {
        type: 'boolean',
        description:
          'Post automatisch zuordnen (#337, #1639): Ob Ablago Post von sich aus zuordnet, entscheidet „Was Ablago darf“ für alle Mappentypen (nur bei „Alles erledigen, ich prüfe danach“). true = wie dort, false = „Hier nie automatisch zuordnen“. Zugeordnet wird nur, wenn die Erkennung sicher ist: Absender eindeutig (z. B. Kundennummer, IBAN) und genau eine passende Mappe dieses Typs; bei Archivmodus wirkungslos. Der Empfänger bekommt eine Aufgabe „Automatisch zugeordnet – bitte prüfen“ mit Rückgängig. Bestehende Installationen: false, solange der Schalter bisher aus war und niemand „Alle angleichen“ gewählt hat.',
      },
      ausDokument: {
        type: 'object',
        nullable: true,
        description:
          '„Aus Dokument ausfüllen“ (#391): eigene Beschriftung des Knopfs (höchstens 40 Zeichen) oder aus = true blendet ihn aus; null = Standard. Systemtypen haben den Knopf nie.',
        properties: { aus: { type: 'boolean' }, beschriftung: { type: 'string', example: 'Visitenkarte scannen' } },
      },
      beschriftungen: beschriftungen({
        name: { type: 'string' },
        beschreibung: { type: 'string' },
        erkennbarAn: { type: 'string', maxLength: 300 },
        mehrzahl: { type: 'string', maxLength: 80 },
      }),
      ausPost: {
        type: 'boolean',
        nullable: true,
        description:
          'Kann aus Post angelegt werden (#937): Der Typ steht beim Übernehmen von Post unter „Wohin gehört das?“ zur Wahl (für alle, die dort anlegen dürfen). null = Vorgabe: an, wenn der Typ ein Dokumentenregister hat. Systemtypen nie. Ohne die Angabe bleibt beim Speichern der bisherige Wert.',
      },
      erkennbarAn: {
        type: 'string',
        maxLength: 300,
        example: 'Enthält Rechnungsnummer, Betrag und Zahlungsziel; Absender ist ein Vertragspartner',
        description:
          'Woran man ihn erkennt (#937): kurzer Text für die Klassifizierung von Dokumenten; Übersetzungen unter beschriftungen.<sprache>.erkennbarAn. Bei Systemtypen immer leer. Ohne die Angabe bleibt beim Speichern der bisherige Text.',
      },
      name: { type: 'string' },
      mehrzahl: {
        type: 'string',
        maxLength: 80,
        example: 'Verträge',
        description:
          'Mehrzahl (#1446): Listen zeigen damit „12 Verträge“ statt „12 × Vertrag“; leer = keine. Übersetzungen unter beschriftungen.<sprache>.mehrzahl. Ohne die Angabe bleibt beim Speichern die bisherige.',
      },
      schluessel: {
        type: 'string',
        example: 'rechnung',
        description: 'Feste Kennung; beim Anlegen frei wählbar (sonst aus dem Namen), danach unveränderlich',
      },
      beschreibung: { type: 'string' },
      titelVorlage: { type: 'string', example: '{rechnungsnummer} vom {rechnungsdatum}' },
      felder: liste('Feld'),
      register: liste('Register'),
      trefferlisten: {
        type: 'array',
        description: 'Trefferlisten; genau eine ist Standard',
        items: {
          type: 'object',
          required: ['key', 'name', 'spalten'],
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            beschriftungen: beschriftungen({ name: { type: 'string' } }),
            spalten: {
              type: 'array',
              items: { type: 'string' },
              description: 'Feldschlüssel oder _titel, _erstellt, _erstelltVon, _geaendert, _geaendertVon',
            },
            standard: { type: 'boolean' },
          },
        },
      },
      trefferliste: {
        type: 'array',
        items: { type: 'string' },
        description: 'Spalten der Standard-Trefferliste (ältere Form); wenn angegeben, ersetzt sie deren Spalten',
      },
      archiv: {
        type: 'object',
        nullable: true,
        description:
          'Archivmodus (#212); null = aus. Frist bis Ende des Kalenderjahres des Stichtags + jahre; vorher kein Löschen (409). Die Versionierung der Dokumentenregister ist dann Pflicht.',
        properties: {
          jahre: { type: 'integer', minimum: 1, maximum: 30 },
          stichtag: { type: 'string', nullable: true, description: 'Kennung eines Datumsfelds; null = Anlagedatum' },
          leererStichtag: {
            type: 'string',
            enum: ['laeuftNicht'],
            description:
              'Ist der Stichtag leer (#1051): laeuftNicht = die Frist läuft noch nicht, die Mappe bleibt gesperrt, bis das Feld gefüllt ist. Fehlt = ab Anlagedatum (Vorgabe). Nur mit stichtag; „anlage“ wird beim Speichern weggelassen.',
          },
        },
      },
      erstellenErlaubt: {
        type: 'boolean',
        default: true,
        deprecated: true,
        description: 'Ohne Wirkung seit 0.32 – wer anlegen darf, regeln die Berechtigungen (Recht C)',
      },
      teilVon: {
        type: 'string',
        nullable: true,
        example: 'rechnung',
        description:
          'Ist Teil einer anderen Mappe (#1031): Kennung des Verweisfelds, über das jede Mappe dieses Typs zu ihrer übergeordneten Mappe gehört (Verweis auf genau einen anderen Mappentyp, eine Mappe, Pflicht, immer sichtbar; keine Ketten, nie an Systemtypen). Solche Mappen (Teile) erscheinen nicht in Ansichten, Trefferlisten über mehrere Typen, Volltext und erweiterter Suche, nicht unter „Zuletzt geöffnet“ und nicht bei „Wohin gehört das?“; der Typ bekommt keine eigene Ansicht. Über die Schnittstelle, den Export, die Sicherung und direkte Links bleiben sie erreichbar – Ausblenden ist kein Schutz, geschützt wird über Rechte. Beim Einschalten übernimmt ein Typ ohne eigene Berechtigungen einmal die Leserechte des übergeordneten Typs. Wird die übergeordnete Mappe gelöscht, gehen die Teile mit (ein Vorgang im Papierkorb; 403 mit Anzahl, wenn das Recht an einem Teil fehlt); wiederhergestellt ebenso. null = eigenständig. Ohne die Angabe bleibt beim Speichern die bisherige Einstellung.',
      },
      inSuche: {
        type: 'boolean',
        nullable: true,
        description:
          'In der allgemeinen Suche zeigen (#1220): false = Mappen dieses Typs fehlen in der erweiterten Suche ohne gewählten Mappentyp (Suchfeld in der Kopfzeile) und als Quelle von „Frag deine Ablage“ – z. B. für Listen, die nur Werte für ein Auswahlfeld liefern. Mit dem Typ als Filter findet die erweiterte Suche sie; Ansichten, Auswahl- und Verweisfelder, die Schnittstelle und der Export bleiben unverändert. null = Vorgabe (ja). Ohne die Angabe bleibt beim Speichern die bisherige Einstellung.',
      },
      doppelteBestaetigt: {
        type: 'boolean',
        writeOnly: true,
        description:
          'Nur beim Ändern (#1050): Hätten nach der Änderung eines eindeutigen zusammengesetzten Felds mehrere Mappen dieselbe Kombination, kommt ohne diese Angabe 409 mit details.zusammengesetzt (je Feld feld, label, anzahl) und nichts wird gespeichert. Mit true speichert Ablago trotzdem; die Mappen passen dann nicht zur Definition, bis man sie ändert.',
      },
      sichtAnlegen: {
        type: 'boolean',
        default: true,
        writeOnly: true,
        description: 'Nur beim Anlegen: eigene Ansicht in der Ablage anlegen',
      },
      stand: {
        ...zeit,
        writeOnly: true,
        description:
          'Nur beim Ändern, optional (#917): „geaendert“ des Mappentyps, so wie du ihn gelesen hast. Hat ihn seitdem jemand anderes gespeichert, kommt 409 und nichts wird überschrieben. Ohne stand keine Prüfung.',
      },
      loeschenErlaubt: {
        type: 'boolean',
        default: true,
        deprecated: true,
        description: 'Ohne Wirkung seit 0.32 – wer löschen darf, regeln die Berechtigungen (Recht D)',
      },
    },
  },
  Mappentyp: {
    allOf: [
      ref('MappentypEingabe'),
      {
        type: 'object',
        properties: {
          id: uuid,
          erstellt: zeit,
          geaendert: zeit,
          system: {
            type: 'string',
            enum: ['benutzer', 'rolle', 'post'],
            nullable: true,
            description: 'Systemmappentyp: lässt sich erweitern, aber nicht löschen',
          },
          berechnung: {
            type: 'object',
            description:
              'Nur beim Lesen, nur mit berechneten Feldern (#1034): je Paket-Id aus berechnetVon der Name und ob es noch rechnet (aktiv = false: „nicht mehr berechnet“, der letzte Wert bleibt)',
            additionalProperties: { type: 'object', properties: { name: { type: 'string' }, aktiv: { type: 'boolean' } } },
          },
          stempel: {
            type: 'object',
            nullable: true,
            description: 'Stempel beim Weitergeben (#394): vorschlag oder pflicht, mit Id der Vorlage; null = kein Stempel',
            properties: { modus: { type: 'string', enum: ['vorschlag', 'pflicht'] }, vorlage: { type: 'string', nullable: true } },
          },
        },
      },
    ],
  },
  MappentypListe: liste('Mappentyp'),
  Urheber: {
    type: 'object',
    required: ['art'],
    description: 'Wer gespeichert hat (#1006)',
    properties: {
      art: { type: 'string', enum: ['person', 'paket', 'automatisierung', 'update', 'system'] },
      id: { type: 'string', description: 'Person, Paket bzw. Automatisierung' },
      name: { type: 'string', nullable: true, description: 'Paket: Name' },
      version: { type: 'string', nullable: true, description: 'Paket bzw. Update: Version' },
      person: { type: 'string', nullable: true, description: 'Paket: wer es angestoßen hat' },
    },
  },
  Fassung: {
    type: 'object',
    required: ['nr', 'zeit', 'bis', 'urheber', 'wer', 'aenderungen', 'aktuell'],
    properties: {
      nr: { type: 'integer' },
      zeit: { ...zeit, description: 'Beginn' },
      bis: { ...zeit, description: 'Letzte Änderung (dieselbe Person innerhalb von 10 Minuten schreibt die Fassung fort)' },
      name: { type: 'string' },
      urheber: ref('Urheber'),
      wer: { type: 'string', description: 'Urheber lesbar' },
      wiederhergestellt: { type: 'integer', nullable: true, description: 'Aus welcher Fassung wiederhergestellt' },
      geloescht: {
        type: 'object',
        nullable: true,
        description: 'Löschvermerk',
        properties: { zeit, urheber: ref('Urheber'), wer: { type: 'string' } },
      },
      aenderungen: { type: 'array', items: { type: 'string' }, description: 'Lesbare Änderungen zur Fassung davor' },
      aktuell: { type: 'boolean' },
    },
  },
  FassungsListe: {
    type: 'object',
    properties: {
      fassungen: liste('Fassung'),
      stand: { type: 'string', nullable: true, description: 'Stand der neuesten Fassung – beim Wiederherstellen mitschicken' },
      gesamt: { type: 'integer' },
    },
  },
  FassungsVorschau: {
    type: 'object',
    properties: {
      nr: { type: 'integer' },
      aenderungen: { type: 'array', items: { type: 'string' } },
      hinweise: { type: 'array', items: { type: 'string' } },
      stand: { type: 'string', nullable: true },
    },
  },
  FassungWiederherstellen: {
    type: 'object',
    properties: {
      stand: { type: 'string', nullable: true },
      bestaetigt: { type: 'boolean', description: 'Danach dürfte niemand mehr lesen – trotzdem' },
      doppelteBestaetigt: { type: 'boolean', description: 'Zusammengesetzte Felder: Doppelte trotzdem' },
    },
  },
};
