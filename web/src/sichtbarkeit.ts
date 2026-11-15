import { useEffect, useSyncExternalStore } from 'react';
import { SICHTBARKEIT_MAX, type Sichtbarkeit } from '../../shared/src/sichtbarkeit';
import { mappenApi, type Verweis } from './api/mappen';

/**
 * Sichtbarkeit verwiesener Mappen in der Oberfläche (#888): Fehlt ein Benutzer in den lesbaren Personen, fragt
 * `useSichtbarkeit` den Server, ob es ihn noch gibt („nicht sichtbar“) oder nicht („gelöscht“). Alle Fragen eines
 * Augenblicks gehen gesammelt in einer Anfrage hinaus; die Antworten bleiben, bis `vergissSichtbarkeit` sie verwirft
 * (Neuladen der Daten, Wechsel des Verwaltungsmodus). Für #889 dieselbe Stelle für die Titel erwähnter Mappen.
 */
/** Eine Sammelstelle: Fragen eines Augenblicks gehen gesammelt hinaus, Antworten bleiben bis zum Verwerfen. */
function sammelstelle<T>(frageServer: (ids: string[]) => Promise<Record<string, T>>) {
  const bekannt = new Map<string, T>();
  const offen = new Set<string>();
  const gefragt = new Set<string>();
  const hoerer = new Set<() => void>();
  /** Zählt bei jedem Verwerfen hoch: Antworten auf ältere Fragen gelten nicht mehr. */
  let runde = 0;
  let geplant = false;
  const melde = () => { for (const f of hoerer) f(); };
  async function frage() {
    geplant = false;
    const ids = [...offen].slice(0, SICHTBARKEIT_MAX);
    for (const id of ids) offen.delete(id);
    if (offen.size) plane();
    if (!ids.length) return;
    const fuer = runde;
    try {
      const r = await frageServer(ids);
      // Inzwischen verworfen: die Antwort gilt für einen alten Stand.
      if (fuer !== runde) return;
      for (const id of ids) if (r[id]) bekannt.set(id, r[id]);
      melde();
    } catch { /* ohne Antwort bleibt es bei der neutralen Anzeige; beim nächsten Verwerfen wird neu gefragt */ }
  }
  function plane() {
    if (geplant) return;
    geplant = true;
    queueMicrotask(() => void frage());
  }
  const abonniere = (f: () => void) => { hoerer.add(f); return () => { hoerer.delete(f); }; };
  return {
    vergiss() { runde++; bekannt.clear(); gefragt.clear(); offen.clear(); melde(); },
    use(id: string | null | undefined, fragen: boolean): T | undefined {
      const wert = useSyncExternalStore(abonniere, () => (id ? bekannt.get(id) : undefined));
      const aktuell = useSyncExternalStore(abonniere, () => runde);
      useEffect(() => {
        if (!id || !fragen || bekannt.has(id) || gefragt.has(id)) return;
        gefragt.add(id); offen.add(id); plane();
      }, [id, fragen, aktuell]);
      return fragen ? wert : undefined;
    },
  };
}

const sichtbarkeiten = sammelstelle((ids) => mappenApi.sichtbarkeit(ids));
/** Erwähnte Mappen (#889): aktueller Titel und Typ, wenn lesbar – sonst nur verborgen bzw. gelöscht. */
const verweise = sammelstelle((ids) => mappenApi.verweise(ids));

/** Alle Antworten verwerfen (nach Neuladen der Daten oder Wechsel des Verwaltungsmodus). */
export function vergissSichtbarkeit() {
  sichtbarkeiten.vergiss();
  verweise.vergiss();
}

/**
 * Sichtbarkeit einer Mappe (bzw. Benutzer-Mappe); `undefined`, solange die Antwort aussteht oder nicht gefragt wird.
 * `fragen`: nur dann den Server fragen – z. B. erst, wenn die Person nicht unter den lesbaren ist.
 */
export function useSichtbarkeit(id: string | null | undefined, fragen: boolean): Sichtbarkeit | undefined {
  return sichtbarkeiten.use(id, fragen);
}

/** Erwähnte Mappe (#889): Sichtbarkeit, bei lesbaren dazu aktueller Titel und Typ. */
export function useVerweis(id: string | null | undefined, fragen: boolean): Verweis | undefined {
  return verweise.use(id, fragen);
}
