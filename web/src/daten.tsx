import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatiere, pruefeMappe, titelFeld, type Mappe, type Mappentyp, type MappenKontext, type Pruefergebnis } from '../../shared/src/model';
import { api } from './api';

interface Daten {
  typen: Mappentyp[];
  mappen: Mappe[];
  geladen: boolean;
  fehler?: string;
  /** Zählt jedes Neuladen hoch; Ansichten können darauf reagieren. */
  stand: number;
  neuLaden(): Promise<void>;
  typ(id: string | undefined): Mappentyp | undefined;
  mappe(id: string | undefined): Mappe | undefined;
  mappenVon(typId: string): Mappe[];
  titel(m: Mappe | undefined): string;
  /** Prüft eine Mappe gegen die aktuelle Definition ihres Typs (wie der Server). */
  pruefe(t: Mappentyp, werte: Mappe['werte'], eigeneId?: string): Pruefergebnis;
}

const Ctx = createContext<Daten | null>(null);

export function DatenProvider({ children }: { children: ReactNode }) {
  const [typen, setTypen] = useState<Mappentyp[]>([]);
  const [mappen, setMappen] = useState<Mappe[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [stand, setStand] = useState(0);

  const neuLaden = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([api.typen(), api.mappen()]);
      setTypen(t); setMappen(m); setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setGeladen(true); setStand((s) => s + 1);
    }
  }, []);
  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const wert = useMemo<Daten>(() => {
    const typNachId = new Map<string, Mappentyp>(typen.map((t) => [t.id, t] as const));
    const mappeNachId = new Map<string, Mappe>(mappen.map((m) => [m.id, m] as const));
    const titel = (m: Mappe | undefined, tiefe = 0): string => {
      if (!m) return '(gelöscht)';
      const t = typNachId.get(m.typId);
      const f = titelFeld(t);
      const s = f ? formatiere(f, m.werte[f.key], (id) => (tiefe < 2 ? titel(mappeNachId.get(id), tiefe + 1) : '…')) : '';
      return s || 'Ohne Titel';
    };
    const sortiert = (liste: Mappe[]) => [...liste].sort((a, b) => titel(a).localeCompare(titel(b), 'de'));
    return {
      typen, mappen, geladen, fehler, stand, neuLaden,
      typ: (id) => (id ? typNachId.get(id) : undefined),
      mappe: (id) => (id ? mappeNachId.get(id) : undefined),
      mappenVon: (typId) => sortiert(mappen.filter((m) => m.typId === typId)),
      titel: (m) => titel(m),
      pruefe: (t, werte, eigeneId) => {
        const ctx: MappenKontext = {
          typVon: (id) => mappeNachId.get(id)?.typId,
          doppelt: (key, v) => {
            const w = String(v).trim().toLowerCase();
            const d = mappen.find((m) => m.id !== eigeneId && m.typId === t.id && m.werte[key] != null && String(m.werte[key]).trim().toLowerCase() === w);
            return d ? titel(d) : undefined;
          },
        };
        return pruefeMappe(t, werte, ctx);
      },
    };
  }, [typen, mappen, geladen, fehler, stand, neuLaden]);

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useDaten(): Daten {
  const d = useContext(Ctx);
  if (!d) throw new Error('DatenProvider fehlt');
  return d;
}
