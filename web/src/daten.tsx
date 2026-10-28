import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pruefeMappe, type Mappentyp, type Pruefergebnis, type Werte } from '../../shared/src/model';
import { wirksameTypen, type Sicht } from '../../shared/src/sichten';
import { api, type Zaehler } from './api';
import { rettungsweg, wendeAn, type Design } from './design';

/**
 * Gemeinsame Daten der Oberfläche: Mappentypen, Personen und die Zähler der Sichten.
 * Mappen selbst werden nicht mehr alle geladen, sondern seitenweise je Sicht
 * (siehe useSeiten) und einzeln beim Öffnen.
 */
interface Daten {
  typen: Mappentyp[];
  /** Verwaltete Sichten der Ablage (#38). */
  sichten: Sicht[];
  sicht(id: string | undefined): Sicht | undefined;
  /** Der eine Mappentyp, den eine Sicht (samt Untersichten) zeigt – oder für eine Typ-Id dieser Typ. Sonst undefined. */
  typDerSicht(id: string | undefined): Mappentyp | undefined;
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
  /** Alle Benutzer (für Erwähnungen und Aufgaben). */
  personen: Array<{ id: string; name: string; aktiv?: boolean }>;
  /** Prüft Werte gegen die Definition (wie der Server; eindeutige Werte prüft nur der Server). */
  pruefe(t: Mappentyp, werte: Werte, typVon: (mappeId: string) => string | undefined): Pruefergebnis;
  /** Persönliche Einstellungen (vom Server, für alle Geräte). */
  einstellungen: Record<string, unknown>;
  setzeEinstellung(schluessel: string, wert: unknown): void;
  /** Designs der Oberfläche und welches Standard ist (#21). */
  designs: Design[];
  standardDesign: string | null;
  /** Das Design, das gerade gilt (eigene Wahl, sonst Standard). */
  meinDesign: Design | null;
  designsLaden(): Promise<void>;
}

const Ctx = createContext<Daten | null>(null);
const LEER: Zaehler = { typen: {}, eingang: 0 };

export function DatenProvider({ children }: { children: ReactNode }) {
  const [typen, setTypen] = useState<Mappentyp[]>([]);
  const [sichten, setSichten] = useState<Sicht[]>([]);
  const [zaehler, setZaehler] = useState<Zaehler>(LEER);
  const [personen, setPersonen] = useState<Array<{ id: string; name: string; aktiv?: boolean }>>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [stand, setStand] = useState(0);
  const [einstellungen, setEinstellungen] = useState<Record<string, unknown>>({});
  const setzeEinstellung = useCallback((k: string, w: unknown) => {
    setEinstellungen((e) => { const n = { ...e }; if (w === null) delete n[k]; else n[k] = w; return n; });
    void api.einstellungSetzen(k, w).catch(() => {});
  }, []);
  useEffect(() => { api.einstellungen().then(setEinstellungen).catch(() => {}); }, []);
  const [designs, setDesigns] = useState<{ designs: Design[]; standard: string | null }>({ designs: [], standard: null });
  const designsLaden = useCallback(async () => { try { setDesigns(await api.designs()); } catch { /* altes bleibt */ } }, []);
  useEffect(() => { void designsLaden(); }, [designsLaden]);
  // Eigenes Design, sonst Standard; gelöschte Designs fallen auf den Standard zurück.
  const rettung = rettungsweg();
  const gewaehlt = rettung ? null : (einstellungen.design as string | undefined);
  const meinDesign = designs.designs.find((x) => x.id === gewaehlt) ?? designs.designs.find((x) => x.id === designs.standard) ?? null;
  useEffect(() => { if (meinDesign) wendeAn(meinDesign, !rettung); }, [meinDesign, rettung]);

  const neuLaden = useCallback(async () => {
    try {
      const [t, z, p, s] = await Promise.all([api.typen(), api.sichten(), api.personen(), api.sichtDefinitionen()]);
      setTypen(t); setZaehler(z); setPersonen(p); setSichten(s); setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setGeladen(true); setStand((s) => s + 1);
    }
  }, []);
  useEffect(() => { void neuLaden(); }, [neuLaden]);

  const wert = useMemo<Daten>(() => {
    const typNachId = new Map<string, Mappentyp>(typen.map((t) => [t.id, t] as const));
    const sichtNachId = new Map<string, Sicht>(sichten.map((s) => [s.id, s] as const));
    return {
      typen, sichten, zaehler,
      sicht: (id) => (id ? sichtNachId.get(id) : undefined),
      typDerSicht: (id) => {
        if (!id || id === 'eingang' || id === 'favoriten') return undefined;
        if (!sichtNachId.has(id)) return typNachId.get(id);
        const w = wirksameTypen(sichten, id);
        return w.length === 1 ? typNachId.get(w[0]) : undefined;
      }, geladen, fehler, stand, neuLaden, einstellungen, setzeEinstellung,
      designs: designs.designs, standardDesign: designs.standard, meinDesign, designsLaden,
      typ: (id) => (id ? typNachId.get(id) : undefined),
      anzahl: (typId) => zaehler.typen[typId]?.anzahl ?? 0,
      personen,
      person: (id) => (id ? personen.find((p) => p.id === id)?.name ?? 'gelöschter Benutzer' : 'unbekannt'),
      pruefe: (t, werte, typVon) => pruefeMappe(t, werte, { typVon, doppelt: () => undefined }),
    };
  }, [typen, sichten, zaehler, personen, geladen, fehler, stand, neuLaden, einstellungen, setzeEinstellung, designs, meinDesign, designsLaden]);

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useDaten(): Daten {
  const d = useContext(Ctx);
  if (!d) throw new Error('DatenProvider fehlt');
  return d;
}
