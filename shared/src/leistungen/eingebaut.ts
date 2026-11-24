/**
 * Eingebaute Anbieter (#1570): Was Ablago selbst mit Dokumenten tut, erscheint wie ein mitgeliefertes Paket – mit
 * Meldung, welche Leistungen es erbringt, für welche Dateitypen und mit welchen Einschränkungen. Die Arbeit selbst
 * steht im Server (server/src/leistungen/eingebaut.ts); diese Beschreibung nutzen auch die Werkbank und die Ausgabe je
 * Release. Anzeigename unter `pakete.anbieter.name.<id>`.
 */
import type { Einschraenkung, Leistungsname } from './katalog';

/** Was ein Anbieter je Leistung meldet; ohne Angabe gilt, was der Katalog beschreibt. */
export interface Meldung {
  dateitypen?: readonly string[];
  einschraenkungen?: readonly Einschraenkung[];
}

const PDF = 'application/pdf';

export const EINGEBAUTE_ANBIETER = {
  // Nur die Textebene von PDFs; Scans und Bilder erkennt ein Paket (#459).
  'ablago.text': { 'dokument.lesen.text@1': { dateitypen: [PDF] } },
  // Ablago erzeugt kein PDF/A, es übernimmt Originale, die schon gültiges PDF/A sind.
  'ablago.archiv': { 'dokument.umwandeln.pdfa@1': { dateitypen: [PDF], einschraenkungen: ['bereits-pdfa'] } },
  'ablago.umwandeln': { 'dokument.umwandeln.pdf@1': { dateitypen: ['image/jpeg', 'image/png'] } },
  'ablago.pdf': {
    'dokument.bearbeiten.seiten@1': {},
    'dokument.bearbeiten.zusammenfuegen@1': {},
    'dokument.bearbeiten.verkleinern@1': {},
    'dokument.bearbeiten.schwaerzen@1': {},
  },
  'ablago.briefsatz': { 'dokument.erstellen.aus-text@1': {}, 'dokument.erstellen.aus-vorlage@1': {} },
  'ablago.erechnung': { 'dokument.lesen.erechnung@1': {} },
} as const satisfies Record<string, Partial<Record<Leistungsname, Meldung>>>;

export type EingebauterAnbieter = keyof typeof EINGEBAUTE_ANBIETER;
/** Schlüssel des Anzeigenamens eines eingebauten Anbieters (Bereich `pakete`). */
export const anbieterSchluessel = (id: string) => `pakete.anbieter.name.${id}`;
