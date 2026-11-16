/**
 * Vergleich zweier Stände der Einrichtung (#1053): Änderungen als Liste mit Kennung, vorher, nachher und einem
 * lesbaren Satz mit Beschriftungen. Verglichen wird über den Pfad; Zeitstempel kommen in den Einträgen nicht vor,
 * also gibt es kein Rauschen. Das Paket schickt seinen gemerkten Stand, der Kern vergleicht mit dem jetzigen.
 */
import { ohneGeheimnisse } from '../geheimnisse/geheimnis-sperre';
import { t } from '../sprache/sprache';
import type { EinrichtungEintrag, PaketdatenAenderung, PaketdatenWert } from '../../../shared/src/paketdaten';

/** Höchstzahl Einträge eines mitgeschickten Stands (Schutz vor sehr großen Anfragen). */
export const VERGLEICH_MAX = 20_000;

/** Ein Wert lesbar: ja/nein, „–“ für leer, Listen mit Komma. */
export function wertText(w: PaketdatenWert): string {
  if (w === null || w === '' || (Array.isArray(w) && !w.length)) return '–';
  if (w === true) return t('pakete.daten.ja');
  if (w === false) return t('pakete.daten.nein');
  return Array.isArray(w) ? w.join(', ') : String(w);
}

const gleich = (a: PaketdatenWert, b: PaketdatenWert) => JSON.stringify(a) === JSON.stringify(b);
const wertOk = (w: unknown): w is PaketdatenWert =>
  w === null || ['string', 'number', 'boolean'].includes(typeof w) || (Array.isArray(w) && w.every((x) => typeof x === 'string'));

/** Mitgeschickte Einträge prüfen: nur bekannte Felder und flache Werte – alles andere fällt weg. */
export function liesEintraege(roh: unknown): EinrichtungEintrag[] {
  const liste = Array.isArray(roh)
    ? roh
    : roh && typeof roh === 'object' && Array.isArray((roh as { eintraege?: unknown }).eintraege)
      ? (roh as { eintraege: unknown[] }).eintraege
      : null;
  if (!liste) return [];
  return liste.slice(0, VERGLEICH_MAX).flatMap((x): EinrichtungEintrag[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    if (typeof o.kennung !== 'string' || typeof o.pfad !== 'string' || !wertOk(o.wert)) return [];
    return [
      {
        kennung: o.kennung.slice(0, 200),
        pfad: o.pfad.slice(0, 500),
        bezeichnung: typeof o.bezeichnung === 'string' ? o.bezeichnung.slice(0, 500) : o.pfad.slice(0, 500),
        wert: o.wert,
      },
    ];
  });
}

/** Änderungen von `vorher` nach `nachher`, sortiert nach Pfad. Die Bezeichnung kommt aus dem neueren Stand. */
export function vergleiche(vorher: EinrichtungEintrag[], nachher: EinrichtungEintrag[]): PaketdatenAenderung[] {
  const alt = new Map(vorher.map((x) => [x.pfad, x] as const));
  const neu = new Map(nachher.map((x) => [x.pfad, x] as const));
  const aus: PaketdatenAenderung[] = [];
  for (const pfad of [...new Set([...alt.keys(), ...neu.keys()])].sort()) {
    const a = alt.get(pfad),
      n = neu.get(pfad);
    if (a && n && gleich(a.wert, n.wert)) continue;
    const x = (n ?? a)!;
    const art = !a ? 'neu' : !n ? 'entfernt' : 'geaendert';
    const v = a?.wert ?? null,
      w = n?.wert ?? null;
    const werte = { bezeichnung: x.bezeichnung, vorher: wertText(v), nachher: wertText(w) };
    const satz =
      art === 'neu'
        ? t('pakete.daten.satz.neu', werte)
        : art === 'entfernt'
          ? t('pakete.daten.satz.entfernt', werte)
          : t('pakete.daten.satz.geaendert', werte);
    aus.push({ kennung: x.kennung, pfad, bezeichnung: x.bezeichnung, art, vorher: v, nachher: w, satz });
  }
  return ohneGeheimnisse(aus);
}
