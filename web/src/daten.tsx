import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pruefeMappe, type Mappentyp, type Pruefergebnis, type Werte } from '../../shared/src/model';
import { api, type Zaehler } from './api';

/**
 * Gemeinsame Daten der Oberfläche: Mappentypen, Personen und die Zähler der Sichten.
 * Mappen selbst werden nicht mehr alle geladen, sondern seitenweise je Sicht
 * (siehe useSeiten) und einzeln beim Öffnen.
 */
interface Daten {
  typen: Mappentyp[];
  zaehler: Zaehler;
  geladen: boolean;
  fehler?: string;
  /** Zählt jedes Neuladen hoch; Ansichten können darauf reagieren. */
  stand: number;
  neuLaden(): Promise<void>;
  typ(id: string | undefined): Mappentyp | undefined;
  /** Anzahl Mappen eines Typs (laut Server). */
  anzahl(typId: string): number;
  /** Anzeigename eines Benutzers (für „angelegt von“). */
  person(id: string | null | undefined): string;
  /** Prüft Werte gegen die Definition (wie der Server; eindeutige Werte prüft nur der Server). */
  pruefe(t: Mappentyp, werte: Werte, typVon: (mappeId: string) => string | undefined): Pruefergebnis;
}

const Ctx = createContext<Daten | null>(null);
const LEER: Zaehler = { typen: {}, eingang: 0 };

export function DatenProvider({ children }: { children: ReactNode }) {
  const [typen, setTypen] = useState<Mappentyp[]>([]);
  const [zaehler, setZaehler] = useState<Zaehler>(LEER);
  const [personen, setPersonen] = useState<Array<{ id: string; name: string }>>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [stand, setStand] = useState(0);

  const neuLaden = useCallback(async () => {
    try {
      const [t, z, p] = await Promise.all([api.typen(), api.sichten(), api.personen()]);
      setTypen(t); setZaehler(z); setPersonen(p); setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setGeladen(true); setStand((s) => s + 1);
    }
  }, []);
  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const wert = useMemo<Daten>(() => {
    const typNachId = new Map<string, Mappentyp>(typen.map((t) => [t.id, t] as const));
    return {
      typen, zaehler, geladen, fehler, stand, neuLaden,
      typ: (id) => (id ? typNachId.get(id) : undefined),
      anzahl: (typId) => zaehler.typen[typId]?.anzahl ?? 0,
      person: (id) => (id ? personen.find((p) => p.id === id)?.name ?? 'gelöschter Benutzer' : 'unbekannt'),
      pruefe: (t, werte, typVon) => pruefeMappe(t, werte, { typVon, doppelt: () => undefined }),
    };
  }, [typen, zaehler, personen, geladen, fehler, stand, neuLaden]);

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useDaten(): Daten {
  const d = useContext(Ctx);
  if (!d) throw new Error('DatenProvider fehlt');
  return d;
}
