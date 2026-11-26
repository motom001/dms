import { BUNDESLAENDER, feiertage, istBundesland } from './feiertage';
import type { InstalliertesPaket } from './pakete';
import { feiertageAusRegeln, regionenAusRegeln, regionspaketFuer } from './regionspaket';

/**
 * Woher die Feiertage kommen (#1696): aus einem installierten Regionspaket (`inhalt.region`) oder – solange keines für
 * das Land der Ablage Regeln liefert – aus dem eingebauten Rechner `shared/src/feiertage.ts` wie bisher. Alle Nutzer
 * (Kalender in „Zu erledigen“, Zeitpläne „nicht an Feiertagen“, Vorschau in Werkbank → Region) gehen über diese Quelle.
 *
 * Das gewählte Bundesland bleibt die Einstellung „region“ des Kerns: Das Paket liefert nur Regeln und die Liste der
 * Regionen. Kennt das Paket die gewählte Region nicht, rechnet der Kern weiter selbst – nichts verschiebt sich still.
 * Ohne gewählte Region gibt es wie bisher keine Feiertage.
 */
export interface Feiertagsquelle {
  /** Das Paket, dessen Regeln gelten; null: der eingebaute Rechner. */
  paket: { id: string; name: string } | null;
  /** Wählbare Regionen (Kennung → Name): aus dem Paket für das Land, sonst die Bundesländer des Kerns. */
  regionen: Record<string, string>;
  /** Feiertage eines Jahres: Datum (JJJJ-MM-TT) → Name. */
  jahr(jahr: number): Map<string, string>;
  /** Name des Feiertags an diesem Tag oder null. */
  am(datum: string): string | null;
  /** Feiertage von … bis (je einschließlich) als Datum → Name. */
  zwischen(von: string, bis: string): Record<string, string>;
}

/** Die Quelle für Land und Region der Ablage. */
export function feiertagsquelle(pakete: readonly InstalliertesPaket[], r: { land: string; bundesland: string | null }): Feiertagsquelle {
  const rp = regionspaketFuer(pakete, r.land);
  const region = r.bundesland;
  const ausPaket = !!rp && (region === null || rp.region.regionen.some((x) => x.id === region));
  const jahr = (j: number): Map<string, string> => {
    if (!region) return new Map();
    if (ausPaket) return feiertageAusRegeln(rp.region, j, region);
    return istBundesland(region) ? feiertage(j, region) : new Map();
  };
  return {
    paket: ausPaket ? { id: rp.id, name: rp.name } : null,
    regionen: rp ? regionenAusRegeln(rp.region) : { ...BUNDESLAENDER },
    jahr,
    am: (datum) => jahr(Number(datum.slice(0, 4))).get(datum) ?? null,
    zwischen: (von, bis) => {
      const erg: Record<string, string> = {};
      for (let j = Number(von.slice(0, 4)); j <= Number(bis.slice(0, 4)); j++)
        for (const [d, n] of jahr(j)) if (d >= von && d <= bis) erg[d] = n;
      return erg;
    },
  };
}
