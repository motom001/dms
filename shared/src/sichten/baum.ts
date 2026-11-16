/** Sichten (#1278 aus sichten.ts): Sichten als Baum und ihre Mappentypen. */
import type { Bedingung } from './bedingungen';
import type { RegelBedingung, Wirkung } from '../model/basis';
import { ALLE_TYPEN } from '../kennungen';

/* ---------- Berechtigungen an einer Sicht (#148) – nur die Form; ausgewertet in sichtrechte.ts ---------- */

/** Rechte an einer Sicht: sehen, anlegen und E für alles, was Daten hinausgibt (Export, PDF; #153). */
export const SICHT_RECHTE = { R: 'Sehen', C: 'Anlegen', E: 'Exportieren' } as const;
export type SichtRecht = keyof typeof SICHT_RECHTE;
export type SichtRechte = Record<SichtRecht, boolean>;
/** Bedingungen nur über den Benutzer: hat Rolle, ist Benutzer – jeweils auch verneint. */
export type SichtBedingung = Extract<RegelBedingung, { art: 'rolle' | 'benutzer' }>;
export interface SichtRegel {
  id: string;
  name: string;
  wenn: SichtBedingung[];
  dann: Partial<Record<SichtRecht, Wirkung>>;
  stopp: boolean;
}
export interface SichtRegelwerk {
  grund: SichtRechte;
  regeln: SichtRegel[];
}

/* ---------- Sichten ---------- */

export interface SichtDaten {
  name: string;
  beschreibung: string;
  /** Elternsicht im Baum; null = oberste Ebene. */
  elternId: string | null;
  /** Reihenfolge unter Geschwistern. */
  position: number;
  /** Mappentypen, deren Mappen diese Sicht selbst zeigt; leer = nur zum Gruppieren. */
  typen: string[];
  /** Gelten zusammen (UND), für die eigenen Mappentypen dieser Sicht. */
  bedingungen: Bedingung[];
  /** Schlüssel der Trefferliste (#75); null/fehlt = Standard. */
  trefferliste?: string | null;
  /** Berechtigungen an der Sicht (#148); null/fehlt = keine eigenen Regeln. */
  berechtigungen?: SichtRegelwerk | null;
  /** Symbol (#428): Lucide-Name aus `ANSICHT_SYMBOLE` (ansichtsymbole.ts); null/fehlt = ohne Symbol. */
  symbol?: string | null;
  /** Name und Beschreibung in weiteren Sprachen (#728); fehlt etwas, gilt der Ausgangstext. */
  beschriftungen?: import('../model/basis').Beschriftungen<import('../model/basis').TypTeile> | null;
}
export interface Sicht extends SichtDaten {
  id: string;
  erstellt: string;
  geaendert: string;
  /** Nur für Benutzer (#148): wirksame Rechte an der Sicht; die Regeln selbst sehen nur Administratoren. */
  rechte?: SichtRechte;
}

/** Kinder einer Sicht in ihrer Reihenfolge. */
export function kinderVon(alle: Sicht[], id: string | null): Sicht[] {
  return alle.filter((s) => (s.elternId ?? null) === id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
}

/** Die Sicht und alle Nachkommen (Tiefensuche, ohne Kreise). */
export function mitNachkommen(alle: Sicht[], id: string): Sicht[] {
  const erg: Sicht[] = [];
  const gesehen = new Set<string>();
  const besuche = (sid: string) => {
    if (gesehen.has(sid)) return;
    gesehen.add(sid);
    const s = alle.find((x) => x.id === sid);
    if (!s) return;
    erg.push(s);
    for (const k of kinderVon(alle, sid)) besuche(k.id);
  };
  besuche(id);
  return erg;
}

/** Würde `elternId` als Elternsicht von `id` einen Kreis ergeben? */
export function waereKreis(alle: Sicht[], id: string, elternId: string | null): boolean {
  if (!elternId) return false;
  if (elternId === id) return true;
  return mitNachkommen(alle, id).some((s) => s.id === elternId);
}

/** Zeigt die Ansicht Mappen aller Mappentypen? */
export const zeigtAlleTypen = (s: Pick<SichtDaten, 'typen'>) => s.typen.includes(ALLE_TYPEN);

/** Die Mappentypen einer Ansicht selbst, „alle“ aufgelöst gegen die vorhandenen. */
export function typenDerSicht(s: Pick<SichtDaten, 'typen'>, vorhanden: Iterable<string>): string[] {
  return zeigtAlleTypen(s) ? [...vorhanden] : s.typen;
}

/** Alle Mappentypen, die eine Sicht samt Kindern zeigt; „alle“ wird gegen `vorhanden` aufgelöst (ohne: entfällt). */
export function wirksameTypen(alle: Sicht[], id: string, vorhanden: Iterable<string> = []): string[] {
  const liste = [...vorhanden];
  return [...new Set(mitNachkommen(alle, id).flatMap((s) => typenDerSicht(s, liste).filter((t) => t !== ALLE_TYPEN)))];
}
