/**
 * Anzeige von Telefonnummern (#1609) ohne die Vorwahldaten: Werte formatieren (`formatiere`) und der `tel:`-Link fragen
 * hier, `telefon.ts` (mit `libphonenumber-js`) meldet sich beim Laden an. So bleibt die Bibliothek aus allem heraus, was
 * telefon.ts nicht einbindet – etwa dem Paket-Läufer und den Arbeitern, die unter `node --permission` nur ihren eigenen
 * Ordner lesen dürfen. Server (Region, Suche) und Oberfläche (Kontostatus) binden telefon.ts ein.
 */
export interface Telefonanzeige {
  /** Gespeicherte Nummer im Format der Region; `erkannt: false`, wenn sie keine Telefonnummer ist. */
  anzeige(text: string): { text: string; erkannt: boolean };
  /** Wählbare Nummer für `tel:`. */
  wahl(text: string): string;
}
/** Ohne telefon.ts wie vor #1609: wie eingegeben, zum Wählen nur + und Ziffern. */
let jetzt: Telefonanzeige = { anzeige: (text) => ({ text, erkannt: true }), wahl: (text) => text.trim().replace(/[^\d+]/g, '') };
export const telefonanzeige = () => jetzt;
export function meldeTelefonanzeigeAn(a: Telefonanzeige) {
  jetzt = a;
}
