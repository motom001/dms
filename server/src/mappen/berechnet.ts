/**
 * Berechnete Felder schützen (#1034): Nur das Paket, das ein Feld berechnet, schreibt seinen Wert. Die eine Prüfstelle
 * für alle Wege, die über `legeMappeAn`/`aendereMappe` gehen – Oberfläche, Schnittstelle (API v1, auch andere Pakete),
 * Automatisierungen („Feld ändern“, Systemkonto), „Aus Dokument ausfüllen“ und Erkennung (die Oberfläche speichert
 * über dieselbe Route), Frist weiterschieben, Mehrfach ändern und künftige Vorschläge aus der verwiesenen Mappe (#1037).
 * Das WebDAV-Laufwerk schreibt keine Feldwerte (PROPPATCH ändert nichts). Interne Wege ohne Zugriff (Beispiele beim
 * Installieren, Umzüge der Paketverwaltung) gehen wie bisher ohne Prüfung. Schicht 2.
 */
import { berechneteFelder } from '../../../shared/src/berechnet';
import { istLeer, type Feld, type Mappentyp, type Werte } from '../../../shared/src/model';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import { t } from '../sprache';

/** Was die 400-Antwort je Feld nennt (`details.berechnet`). */
export interface BerechnetAbgelehnt { feld: string; label: string; paket: string; paketName: string }

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (istLeer(a as Werte[string]) && istLeer(b as Werte[string]));

/**
 * Berechnete Felder, die diese Anfrage ändern will (gesendet und anders als bisher). Beim Anlegen zählt jeder nicht
 * leere Wert (Ja/Nein: nur „ja“ – „nein“ ist die Vorgabe jeder neuen Mappe).
 */
export function geaenderteBerechnete(typ: Mappentyp, alt: Werte, neu: Werte, gesendet: Set<string>): Feld[] {
  return berechneteFelder(typ).filter((f) => gesendet.has(f.key) && !gleich(alt[f.key], neu[f.key]) && !(f.typ === 'janein' && !(f.key in alt) && neu[f.key] === false));
}

/**
 * Darf dieser Zugriff die berechneten Felder so schreiben? Nur das Dienstkonto des Pakets, das sie berechnet – sonst 400
 * mit dem Namen des Pakets (Ergänzung Sicherheit). Ohne Zugriff (intern) keine Prüfung. Liefert die Felder, die das
 * Paket selbst geschrieben hat (für die Historie).
 */
export async function pruefeBerechnete(kern: Kern, typ: Mappentyp, w: { alt: Werte; neu: Werte; gesendet: Set<string> }, z: Zugriff | undefined): Promise<Feld[]> {
  const felder = geaenderteBerechnete(typ, w.alt, w.neu, w.gesendet);
  if (!felder.length || !z) return felder;
  const fremd = felder.filter((f) => z.paket?.id !== f.berechnetVon);
  if (!fremd.length) return felder;
  const pakete = await kern.repo.listePakete();
  const name = (id: string) => pakete.find((p) => p.id === id)?.name ?? id;
  const abgelehnt: BerechnetAbgelehnt[] = fremd.map((f) => ({ feld: f.key, label: f.label, paket: f.berechnetVon!, paketName: name(f.berechnetVon!) }));
  const namen = [...new Set(abgelehnt.map((a) => a.paketName))];
  throw new Fachfehler(400, t('meldungen.berechnet.nur-paket', { felder: abgelehnt.map((a) => `„${a.label}“`).join(', '), paket: namen.join(', '), anzahl: abgelehnt.length }), { berechnet: abgelehnt });
}
