/**
 * Ansichten aus Paketen mit Prüfwert (#1125, wie Vorgaben #1038): Ein Update ersetzt eine Ansicht des Pakets durch die
 * Fassung im Paket, solange sie noch so ist, wie das Paket sie geschrieben hat. Was der Administrator geändert hat,
 * bleibt – mit Hinweis in der Vorschau und der Wahl, sie trotzdem zu ersetzen.
 *
 * Der Stand zählt, was eine Ansicht zeigt: Name, Beschreibung, Elternsicht, Mappentypen, Bedingungen, Trefferliste und
 * Symbol. Nicht dazu gehören Reihenfolge (Verschieben im Baum), Rechte an der Ansicht (#148, Sache des Administrators;
 * sie bleiben beim Ersetzen) und Beschriftungen (die ergänzen auch Sprachpakete).
 *
 * Ein Umbau (#1041) leitet Ansichten auf den Zieltyp um – das ist keine Änderung des Administrators: Der Stand zieht mit
 * (`standNachUmbau`), damit das nächste Update des Pakets die Ansicht ersetzen kann.
 */
import type { InstalliertesPaket, SichtStand, SichtZustand } from '../../../shared/src/pakete';
import type { SichtDaten } from '../../../shared/src/sichten';
import { pruefwert } from './vorgaben';

/** Was an einer Ansicht zählt (siehe oben). */
function sichtBild(s: Pick<SichtDaten, 'name' | 'beschreibung' | 'elternId' | 'typen' | 'bedingungen' | 'trefferliste' | 'symbol'>) {
  return { name: s.name, beschreibung: s.beschreibung ?? '', elternId: s.elternId ?? null, typen: [...s.typen].sort(), bedingungen: s.bedingungen, trefferliste: s.trefferliste ?? null, symbol: s.symbol ?? null };
}

/** Prüfwert einer Ansicht in Ablago. */
export const sichtPruefwert = (s: Parameters<typeof sichtBild>[0]): string => pruefwert(sichtBild(s));

/** Prüfwert einer Ansicht im Paket (wie gelesen) – ändert er sich, bringt das Paket eine neue Fassung. */
export const sichtFassung = (s: object): string => pruefwert(s);

/**
 * Zustand einer vorhandenen Ansicht beim Update. `jetzt` = die Ansicht in Ablago (fehlt: gelöscht); `wieImPaket` = so
 * sähe die Fassung im Paket hier aus (nur nötig ohne Stand, also bei Installationen vor #1125).
 */
export function sichtZustand(x: { stand?: SichtStand; fassung: string; jetzt?: Parameters<typeof sichtBild>[0]; wieImPaket?: Parameters<typeof sichtBild>[0] | null }): SichtZustand {
  if (!x.jetzt) return 'geloescht';
  if (!x.stand) return x.wieImPaket && sichtPruefwert(x.wieImPaket) === sichtPruefwert(x.jetzt) ? 'gleich' : 'unbekannt';
  if (x.stand.fassung === x.fassung) return 'gleich';
  return sichtPruefwert(x.jetzt) === x.stand.stand ? 'aktualisiert' : 'geaendert';
}

/** Ansichten, die ein Umbau geändert hat: Id → Prüfwert vorher (vor dem ersten Schritt) und nachher. */
export type SichtAenderungen = Map<string, { vorher: string; nachher: string }>;

/** Eine Änderung durch den Umbau merken – über mehrere Schritte gilt der erste Vorher-Stand. */
export function merkeSichtAenderung(m: SichtAenderungen, id: string, vorher: string, nachher: string) {
  m.set(id, { vorher: m.get(id)?.vorher ?? vorher, nachher });
}

/**
 * Stand der Ansichten eines Pakets nach dem Umbau: Was das Paket so geschrieben hatte und nur der Umbau geändert hat,
 * gilt weiter als unverändert. true = etwas hat sich geändert (der Eintrag muss gespeichert werden).
 */
export function standNachUmbau(p: Pick<InstalliertesPaket, 'sichten' | 'sichtStand'>, m: SichtAenderungen): boolean {
  let anders = false;
  for (const [k, id] of Object.entries(p.sichten)) {
    const st = p.sichtStand?.[k];
    const a = m.get(id);
    if (!st || !a || st.stand !== a.vorher || a.vorher === a.nachher) continue;
    p.sichtStand![k] = { ...st, stand: a.nachher };
    anders = true;
  }
  return anders;
}

/**
 * Stand aller Ansichten des Pakets nach Installation bzw. Update: Angelegte und ersetzte (`geschrieben`) so, wie sie jetzt
 * sind; die übrigen behalten ihren Stand (ein Umbau zieht ihn mit); ohne Stand (vor #1125) bekommen nur die einen, die
 * genau der Fassung im Paket entsprechen (`gleich`). Was die neue Version nicht mehr nennt, behält seinen Stand.
 */
export function sichtStandNach(x: {
  sichten: Array<{ schluessel: string }>; alt: Pick<InstalliertesPaket, 'sichtStand'> | null; ids: Record<string, string>;
  geschrieben: Set<string>; zustand: (schluessel: string) => SichtZustand | undefined;
  jetzt: Array<Parameters<typeof sichtBild>[0] & { id: string }>; umbau?: SichtAenderungen;
}): Record<string, SichtStand> {
  const erg: Record<string, SichtStand> = { ...x.alt?.sichtStand };
  if (x.umbau) standNachUmbau({ sichten: x.ids, sichtStand: erg }, x.umbau);
  for (const s of x.sichten) {
    const v = x.jetzt.find((y) => y.id === x.ids[s.schluessel]);
    if (!v) continue;
    if (x.geschrieben.has(s.schluessel) || (!erg[s.schluessel] && x.zustand(s.schluessel) === 'gleich')) erg[s.schluessel] = { stand: sichtPruefwert(v), fassung: sichtFassung(s) };
  }
  return erg;
}
