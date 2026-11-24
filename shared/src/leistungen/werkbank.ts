/**
 * Mitgeliefert in der Werkbank (#1570): Was Ablago selbst mit Dokumenten tut, steht unter Werkbank → Pakete → „Von
 * Ablago mitgeliefert“ – je eingebautem Anbieter eine Zeile mit Schalter, dazu „Wer macht das?“ für Tätigkeiten, die
 * mehr als einer kann. Gespeichert als Einstellung `leistungen_anbieter`; ohne Einstellung ist alles an und die Vorgabe
 * gilt (eingebaut, wenn vorhanden) – so ändert sich für bestehende Installationen nichts.
 */
import type { EingebauterAnbieter } from './eingebaut';
import type { Leistungsname } from './katalog';

/** Gespeicherte Wahl: ausgeschaltete Anbieter und je Leistung der gewählte (fehlt = Vorgabe). */
export interface Anbieterwahl {
  aus: string[];
  wahl: Partial<Record<Leistungsname, string>>;
}
export const ANBIETERWAHL_LEER: Anbieterwahl = { aus: [], wahl: {} };

/** Wer eine Tätigkeit macht: eingebaut („Ablago“) oder ein Paket. */
export interface Macher {
  id: string;
  art: 'eingebaut' | 'paket';
  name: string;
  an: boolean;
}

/** Eine Tätigkeit eines Anbieters, wie die Werkbank sie zeigt. */
interface Taetigkeit {
  leistung: Leistungsname;
  /** Anzeigename als Verb („Text lesen“). */
  name: string;
  dateitypen: readonly string[];
  /** Was der Anbieter nur kann (Einschränkungen seiner Meldung), mit Text. */
  nur: string[];
  /** Adresse im Katalog: dort steht, welche Pakete es auch können. */
  katalog: string;
  /** Wer es sonst noch kann und eingeschaltet ist. */
  ersatz: Macher[];
}

export interface MitgelieferterAnbieter {
  id: EingebauterAnbieter;
  name: string;
  an: boolean;
  taetigkeiten: Taetigkeit[];
}

/** „Wer macht das?“ für eine Tätigkeit: alle, die es können, und die Wahl (null = Vorgabe). */
export interface Taetigkeitswahl {
  leistung: Leistungsname;
  name: string;
  dateitypen: readonly string[];
  macher: Macher[];
  gewaehlt: string | null;
}

/** Antwort von `GET /api/werkbank/leistungen/anbieter`. */
export interface MitgeliefertStand {
  mitgeliefert: MitgelieferterAnbieter[];
  /** Alle Tätigkeiten mit mindestens einem, der sie kann; „Wer macht das?“ zeigt nur die mit mehr als einem. */
  taetigkeiten: Taetigkeitswahl[];
}

/** Tätigkeiten, für die „Wer macht das?“ erscheint: nur mit mehr als einem, der sie kann (#1570). */
export const zurWahl = (s: Pick<MitgeliefertStand, 'taetigkeiten'>): Taetigkeitswahl[] => s.taetigkeiten.filter((x) => x.macher.length > 1);

/** Liest eine gespeicherte Wahl; Unbekanntes fällt weg, ohne Wert gilt „alles an, Vorgabe“. */
export function liesAnbieterwahl(v: unknown, istLeistung: (n: string) => n is Leistungsname): Anbieterwahl {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const aus = Array.isArray(o.aus) ? [...new Set(o.aus.filter((x): x is string => typeof x === 'string'))] : [];
  const wahl: Anbieterwahl['wahl'] = {};
  if (o.wahl && typeof o.wahl === 'object')
    for (const [k, w] of Object.entries(o.wahl as Record<string, unknown>)) if (istLeistung(k) && typeof w === 'string') wahl[k] = w;
  return { aus, wahl };
}
