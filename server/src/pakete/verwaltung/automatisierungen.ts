/**
 * Mitgelieferte Automatisierungen eines Pakets (#712): einschalten, Zeitpläne (#1082), Feld in verknüpfter Mappe (#1557).
 */
import {
  bereinigeAutomatisierung,
  bereinigeVerknuepft,
  istNurWenn,
  NUR_WENN,
  verknuepfteTypen,
  verknuepftProbleme,
  zeitplanText,
} from '../../../../shared/src/automatisierung';
import type { Mappentyp } from '../../../../shared/src/model';
import { istObjekt, paketZiele, type Paket, type PaketAutomatisierung, type PaketFeld, type PaketTyp } from './format';

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

/**
 * „Feld in verknüpfter Mappe setzen“ im Paket (#1557, für `pakete-pruefen` und die Installation): `nur_wenn` gültig,
 * Werte vorhanden; ist der Auslöser ein eigener Typ, ist `ueber` ein Verweisfeld, und für jeden eigenen Zieltyp gibt es
 * die Zielfelder, sie sind nicht berechnet und die Feldarten passen – dieselbe Prüfung wie im Editor. Zieltypen anderer
 * Pakete kennt das Paket nicht; dort prüft Ablago beim Installieren (die Automatisierung zeigt dann ein Problem).
 */
export function verknuepftFehler(a: Record<string, unknown>, typen: PaketTyp[], paketId: string, wo: string): string[] {
  const karten = (Array.isArray(a.dann) ? a.dann : []).filter(istObjekt).filter((k) => k.art === 'feld_verknuepft');
  if (!karten.length) return [];
  const eigen = (vw: string) => {
    const [p, s] = vw.includes(':') ? vw.split(':') : [paketId, vw];
    return p === paketId ? s : null;
  };
  // Eigene Typen in der Form des Editors: Schlüssel als Id, Ziele nur eigene, „berechnet“ wie berechnetVon.
  const alsTyp = (x: PaketTyp): Mappentyp =>
    ({
      id: x.schluessel,
      name: x.name,
      felder: x.felder.map((f) => ({
        ...f,
        zielTypen: paketZiele(f)
          .map(eigen)
          .filter((s): s is string => !!s),
        ...(f.berechnet ? { berechnetVon: paketId } : {}),
      })),
    }) as unknown as Mappentyp;
  const alle = typen.map(alsTyp);
  const vw = istObjekt(a.wenn) && typeof a.wenn.typ === 'string' ? a.wenn.typ : '';
  const quelle = vw && eigen(vw) ? alle.find((x) => x.id === eigen(vw)) : undefined;
  const fehler: string[] = [];
  for (const k of karten) {
    const w = `${wo}, dann feld_verknuepft`;
    const nw = k.nur_wenn ?? k.nurWenn;
    if (nw !== undefined && !istNurWenn(nw)) fehler.push(`${w}: nur_wenn „${String(nw)}“ – erlaubt: ${NUR_WENN.join(', ')}.`);
    if (!vw) fehler.push(`${w}: braucht wenn.typ (der Mappentyp mit dem Verweisfeld).`);
    if (!quelle) continue;
    const d = bereinigeVerknuepft(k, 'k', (v) => (typeof v === 'string' ? v : ''), 2000);
    const feld = quelle.felder.find((f) => f.key === d.ueber);
    // Nur Zieltypen anderer Pakete: deren Felder kennt das Paket nicht.
    if (feld?.typ === 'referenz' && !verknuepfteTypen(d, quelle, alle).ziele.length && paketZiele(feld as PaketFeld).length) continue;
    for (const p of verknuepftProbleme(d, quelle, alle)) fehler.push(`${w}: ${p}`);
  }
  return fehler;
}
