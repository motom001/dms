import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type Mappentyp, type Pruefergebnis, type Werte } from '../../shared/src/model';
import { pruefeMitAnzeige } from '../../shared/src/anzeige';
import { wirksameTypen, type Sicht } from '../../shared/src/sichten';
import { api, type Person, type Zaehler } from './api';
import { rettungsweg, wendeAn, type Design } from './design';
import { t } from './sprache';
import { useNachladen } from './nachladen-hook';

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
  /**
   * Sind die Zahlen der Ansichten da (#512)? Die Ablage erscheint ohne sie (geladen), die Zahlen
   * kommen danach. Beim Neuladen bleiben die alten stehen, bis die neuen da sind.
   */
  zahlenDa: boolean;
  geladen: boolean;
  fehler?: string;
  /** Zählt jedes Neuladen hoch; Ansichten können darauf reagieren. */
  stand: number;
  neuLaden(): Promise<void>;
  /**
   * Von selbst nachgeladen (#919): zählt hoch, wenn sich der Stand der Ablage geändert hat (`useAblageStand`). Die
   * Startseite lädt dann Termine und „Zuletzt geöffnet“ neu – anders als `stand` ohne Listen und Mappentypen.
   */
  frisch: number;
  /** Nur die Zahlen der Ansichten neu holen und `frisch` hochzählen (#919) – leise, die alten bleiben bis dahin stehen. */
  auffrischen(): void;
  typ(id: string | undefined): Mappentyp | undefined;
  /** Anzahl Mappen eines Typs (laut Server). */
  anzahl(typId: string): number;
  /** Anzeigename eines Benutzers (für „angelegt von“). */
  person(id: string | null | undefined): string;
  /** Alle Benutzer (für Erwähnungen und Aufgaben). */
  personen: Person[];
  /** Prüft Werte gegen die Definition (wie der Server; eindeutige Werte prüft nur der Server). */
  pruefe(mappentyp: Mappentyp, werte: Werte, typVon: (mappeId: string) => string | undefined): Pruefergebnis;
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
  const [zahlenDa, setZahlenDa] = useState(false);
  const zahlenNr = useRef(0);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [stand, setStand] = useState(0);
  const [frisch, setFrisch] = useState(0);
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
    // Zahlen der Ansichten nicht abwarten (#512): Sie kommen nach; nur die jüngste Antwort zählt.
    const nr = ++zahlenNr.current;
    const zahlen = api.sichten().then((z) => { if (nr === zahlenNr.current) { setZaehler(z); setZahlenDa(true); } });
    zahlen.catch(() => {});
    try {
      const [eintrag, r, p, s] = await Promise.all([api.typen(), api.sichtenRahmen(), api.personen(), api.sichtDefinitionen()]);
      setTypen(eintrag); setZaehler((z) => ({ ...z, ...r })); setPersonen(p); setSichten(s); setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setGeladen(true); setStand((s) => s + 1);
    }
  }, []);
  useEffect(() => { void neuLaden(); }, [neuLaden]);
  const auffrischen = useCallback(() => {
    const nr = ++zahlenNr.current;
    api.sichten().then((z) => { if (nr === zahlenNr.current) setZaehler((alt) => ({ ...alt, ...z })); }, () => {});
    setFrisch((n) => n + 1);
  }, []);

  const wert = useMemo<Daten>(() => {
    const typNachId = new Map<string, Mappentyp>(typen.map((mappentyp) => [mappentyp.id, mappentyp] as const));
    const sichtNachId = new Map<string, Sicht>(sichten.map((s) => [s.id, s] as const));
    return {
      typen, sichten, zaehler, zahlenDa,
      sicht: (id) => (id ? sichtNachId.get(id) : undefined),
      typDerSicht: (id) => {
        if (!id || id === 'eingang' || id === 'favoriten') return undefined;
        if (!sichtNachId.has(id)) return typNachId.get(id);
        const w = wirksameTypen(sichten, id, typNachId.keys());
        return w.length === 1 ? typNachId.get(w[0]) : undefined;
      }, geladen, fehler, stand, neuLaden, frisch, auffrischen, einstellungen, setzeEinstellung,
      designs: designs.designs, standardDesign: designs.standard, meinDesign, designsLaden,
      typ: (id) => (id ? typNachId.get(id) : undefined),
      anzahl: (typId) => zaehler.typen[typId]?.anzahl ?? 0,
      personen,
      person: (id) => (id ? personen.find((p) => p.id === id)?.name ?? t('oberflaeche.daten.geloeschter-benutzer') : 'unbekannt'),
      // Anzeige-Bedingungen (#1033): wie der Server – was nicht zu sehen ist, ist nicht Pflicht.
      pruefe: (mappentyp, werte, typVon) => pruefeMitAnzeige(mappentyp, werte, { typVon, doppelt: () => undefined, merkmale: zaehler.merkmale }),
    };
  }, [typen, sichten, zaehler, zahlenDa, personen, geladen, fehler, stand, neuLaden, frisch, auffrischen, einstellungen, setzeEinstellung, designs, meinDesign, designsLaden]);

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useDaten(): Daten {
  const d = useContext(Ctx);
  if (!d) throw new Error(t('oberflaeche.daten.datenprovider-fehlt'));
  return d;
}

/**
 * Solange die Ablage zu sehen ist (Seitenleiste mit Neue Post und Zu erledigen, Startseite): den Stand der Ablage
 * nachfragen und bei Änderung leise auffrischen (#919). Nur im sichtbaren Tab; zählt nicht als Aktivität.
 */
export function useAblageStand() {
  const d = useDaten();
  useNachladen(api.ablageStand, () => d.auffrischen());
}

const tag = (text: string) => { const [, m, d] = text.split('-'); return `${d}.${m}.`; };
/** „abwesend bis 15.11., vertreten durch Thomas“ – für Empfängerauswahl und Namen (#78). */
export function abwesenheitText(p: Person | undefined): string {
  const a = p?.abwesend;
  if (!a) return '';
  const wann = a.wirkt ? (a.bis ? t('oberflaeche.daten.abwesend-bis', { tag: tag(a.bis) }) : 'abwesend') : t('oberflaeche.daten.abwesend-ab', { tag: tag(a.von ?? ''), wert: a.bis ? t('oberflaeche.daten.bis', { tag: tag(a.bis) }) : '' });
  return `${wann}${a.vertreter ? `, vertreten durch ${a.vertreter}` : ''}`;
}
/** Name mit Abwesenheit, z. B. „Lena – abwesend bis 15.11., vertreten durch Jonas“. */
export const nameMitAbwesenheit = (p: Person) => (p.abwesend ? `${p.name} – ${abwesenheitText(p)}` : p.name);
