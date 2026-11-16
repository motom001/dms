/** Gemeinsame Parameter und Beschreibungen der Tabelle /api/v1 (#1278, vorher in `http/api-v1.ts`). */
import { TEXTSPRACHEN } from '../../../../shared/src/textsprache';
import type { Parameter } from './typen';

/** Sprachkennungen für Dokumente (#400). */
export const SPRACHKENNUNGEN = Object.keys(TEXTSPRACHEN);

export const passwoerter: Parameter = {
  name: 'passwoerter',
  wo: 'query',
  typ: 'string',
  beschreibung:
    '„anzeigen“: Passwortfelder im Klartext statt nur {gesetzt, lesbar}. Nur mit einem API-Schlüssel mit dem Recht „Passwörter lesen“ (sonst 403); jeder Abruf steht im Protokoll.',
};
/** Stempel beim Herunterladen (#394). */
export const stempelParameter: Parameter[] = [
  {
    name: 'herunterladen',
    wo: 'query',
    typ: 'string',
    beschreibung:
      'Beliebiger Wert: als Datei herunterladen. Über einen API-Schlüssel ist jeder Abruf ein Herunterladen (Weitergeben); Pakete bekommen immer das Original.',
  },
  {
    name: 'vorlage',
    wo: 'query',
    typ: 'string',
    beschreibung: 'Id einer Stempel-Vorlage (GET /stempel/vorlagen); eigene Angaben unten gehen vor',
  },
  {
    name: 'stempel',
    wo: 'query',
    typ: 'string',
    beschreibung:
      'Text des Stempels (höchstens 300 Zeichen, bis zu 6 Zeilen, getrennt mit %0A) mit Platzhaltern {datum}, {empfänger}, {benutzer}, {mappe}, {seite}, {seiten}, {archivnummer}',
  },
  { name: 'empfaenger', wo: 'query', typ: 'string', beschreibung: 'Wert für {empfänger}; Pflicht, wenn der Text ihn nutzt' },
  {
    name: 'lage',
    wo: 'query',
    typ: 'string',
    beschreibung: 'diagonal (Wasserzeichen, Standard), kopf, fuss, ecke oder stempel (kleiner Stempel mit Rahmen, frei platzierbar, #799)',
  },
  { name: 'deckkraft', wo: 'query', typ: 'string', beschreibung: '0.1 bis 1, Standard 0.25 (ohne Vorlage)' },
  {
    name: 'tinte',
    wo: 'query',
    typ: 'boolean',
    beschreibung: '„Wie Tinte“ (#799): Mischmodus Multiplizieren – der Stempel färbt nur ein, Schrift darunter bleibt lesbar',
  },
  { name: 'drehung', wo: 'query', typ: 'integer', beschreibung: 'Drehung 0–359 Grad im Uhrzeigersinn (#799); nicht bei lage=diagonal' },
  { name: 'x', wo: 'query', typ: 'string', beschreibung: 'Nur lage=stempel: Mitte waagerecht, 0 (links) bis 1 (rechts)' },
  { name: 'y', wo: 'query', typ: 'string', beschreibung: 'Nur lage=stempel: Mitte senkrecht, 0 (oben) bis 1 (unten)' },
  { name: 'farbe', wo: 'query', typ: 'string', beschreibung: 'rot (Standard), blau, gruen oder schwarz' },
  { name: 'groesse', wo: 'query', typ: 'integer', beschreibung: 'Größe in Prozent, 50–200, Standard 100' },
  { name: 'seiten', wo: 'query', typ: 'string', beschreibung: 'alle (Standard) oder erste' },
  {
    name: 'seitenzahlen',
    wo: 'query',
    typ: 'boolean',
    beschreibung: 'Entfallen (#799), wirkt weiter: hängt die Zeile „Seite {seite} von {seiten}“ an den Text',
  },
  {
    name: 'archivnummer',
    wo: 'query',
    typ: 'boolean',
    beschreibung: 'Entfallen (#799), wirkt weiter: hängt die Zeile „{archivnummer}“ an den Text',
  },
];
export const VERKLEINERN_BESCHREIBUNG =
  ' Verkleinert (#393): Mit verkleinern=bildschirm|standard|druck (oder true = standard) kommt eine verkleinerte Kopie eines PDFs (Bilder auf ca. 100, 150 oder 300 dpi); das gespeicherte Dokument bleibt unverändert, die Antwort trägt den Kopf X-DMS-Verkleinert: <Bytes vorher>/<Bytes nachher>. Bringt es weniger als 10 %, kommt das Original (ohne diesen Kopf). Erst wird verkleinert, dann gestempelt. 422 bei anderen Dateitypen ohne Stempel.';
export const verkleinernParameter: Parameter = {
  name: 'verkleinern',
  wo: 'query',
  typ: 'string',
  beschreibung: 'bildschirm (≈ 100 dpi), standard (≈ 150 dpi) oder druck (≈ 300 dpi): verkleinerte Kopie eines PDFs (#393)',
};
export const STEMPEL_BESCHREIBUNG =
  ' Stempel (#394): Mit Stempel-Parametern entsteht eine gestempelte Kopie als PDF (Bilder werden zum PDF); das gespeicherte Original bleibt unverändert, die Historie der Mappe vermerkt die Weitergabe, die Antwort trägt den Kopf X-DMS-Stempel: 1. Verlangt der Mappentyp einen Stempel (Pflicht), wird ohne Parameter seine Vorlage verwendet. Der Stempel steht auf den Seiten des Dokuments selbst, nie auf einem eigenen Deckblatt (#799). 422, wenn sich die Datei nicht stempeln lässt (nur PDF, JPEG, PNG; nicht verschlüsselt) oder der Empfänger fehlt.';

export const id = (was: string): Parameter => ({ name: 'id', wo: 'path', typ: 'string', pflicht: true, beschreibung: `Id ${was} (UUID)` });

/**
 * Post: „von“ und „an“ (#1042) – Hinweis in der Beschreibung der Schnittstelle, solange der Übergang gilt (uebergaenge.ts).
 */
export const POST_UEBERGANG =
  'Die Systemfelder der Post heißen seit 0.242 von („Von“, bisher absender) und an („An“, Verweis auf einen Benutzer, bisher fuer); das frühere Textfeld an (Adressen einer versendeten E-Mail) heißt an_adresse. Übergang bis 1.0.0: absender und fuer werden beim Schreiben als von und an angenommen (der neue Name geht vor) und beim Lesen einer Post zusätzlich mit demselben Wert geliefert; das Ereignis post.angelegt trägt an und fuer. Das frühere an (Adresse) gibt es unter diesem Namen nicht mehr.';
