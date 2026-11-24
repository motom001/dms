/**
 * Hochrechnung des Speicherbedarfs der Sicherungen (#104, #1509) – an einer Stelle für Server (Werkbank → Sicherung,
 * „Speicherplatz“) und Oberfläche (Zeile unter der Aufbewahrung, rechnet beim Ändern der Zahlen mit). Jede Sicherung ist
 * vollständig; gezählt wird, wie viele die Aufbewahrung höchstens behält.
 */
export interface AufbewahrungsPlan {
  haeufigkeit: 'taeglich' | 'woechentlich';
  aufbewahrung: { taeglich: number; woechentlich: number; monatlich: number };
}

/** Höchstens so viele Sicherungen bleiben: tägliche nur bei täglichem Takt; „lokal nur die neueste“ (#1194) = 1. */
function aufbewahrteStueck(p: AufbewahrungsPlan, nurNeueste: boolean): number {
  if (nurNeueste) return 1;
  const a = p.aufbewahrung;
  return (p.haeufigkeit === 'taeglich' ? a.taeglich : 0) + a.woechentlich + a.monatlich;
}

/** Stückzahl und Speicherbedarf bei `groesseJe` Bytes je Sicherung (Dateien und Datenbank heute). */
export function hochrechnung(p: AufbewahrungsPlan, nurNeueste: boolean, groesseJe: number): { stueck: number; bytes: number } {
  const stueck = aufbewahrteStueck(p, nurNeueste);
  return { stueck, bytes: stueck * groesseJe };
}
