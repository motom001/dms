/**
 * Mitgelieferte Automatisierungen eines Pakets (#712): einschalten, Zeitpläne (#1082).
 */
import { bereinigeAutomatisierung, zeitplanText } from '../../../../shared/src/automatisierung';
import { istObjekt, type Paket, type PaketAutomatisierung } from './format';

/** Liste von Schlüsseln aus einer Eingabe (#712: anzuschaltende Automatisierungen); alles andere → leer. */
const schluesselListe = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string').slice(0, 200) : [];

/**
 * Welche mitgelieferten Automatisierungen beim Installieren eingeschaltet werden (#712, #1082): die angehakten, wenn die
 * Eingabe eine Liste nennt (auch leer = alle aus); ohne Angabe die mit `eingeschaltet: true`. Gilt nur für neue – ein
 * Update ändert an/aus einer vorhandenen nie (Automatisierungen.ausPaket).
 */
export function einzuschalten(eingabe: unknown, paket: Pick<Paket, 'automatisierungen'>): string[] {
  return Array.isArray(eingabe)
    ? schluesselListe(eingabe)
    : paket.automatisierungen.filter((a) => a.eingeschaltet === true).map((a) => a.schluessel);
}

/**
 * Mitgelieferte Zeitpläne eines Pakets für die Rechte-Vorschau (#1082): „Verträge täglich prüfen (täglich um 05:00)“ –
 * je Automatisierung mit der Karte „Paket nach Zeitplan ausführen“.
 */
export function paketZeitplaene(paket: Pick<Paket, 'automatisierungen'>): string[] {
  return paket.automatisierungen.flatMap((a) => {
    const z = paketZeitplan(a);
    return z ? [`${a.name} (${z})`] : [];
  });
}

/** Wann eine mitgelieferte Automatisierung das Paket ausführt (#1082), z. B. „täglich um 05:00“; null ohne die Karte. */
export function paketZeitplan(a: PaketAutomatisierung): string | null {
  if (!a.dann.some((k) => istObjekt(k) && k.art === 'paket')) return null;
  const w = bereinigeAutomatisierung({ name: a.name, wenn: a.wenn, dann: [] }).wenn;
  return w.art === 'zeitplan' ? zeitplanText(w) : null;
}
