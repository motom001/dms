/**
 * Zustand einer Mappenliste (#1279) als Hooks – in der Reihenfolge der Effekte von früher: Suche aus der Kopfzeile,
 * erste Mappe öffnen, Breite messen, nachladen, als gesehen melden, Auswahl, Probe für „Löschen“.
 */
import { useEffect, useRef, useState } from 'react';
import type { Mappentyp, Sortierung } from '../../../../shared/src/model';
import type { Hilfeort } from '../../../../shared/src/hilfe';
import type { ReactNode } from 'react';
import type { LoeschAnlass } from '../../../../shared/src/loeschprotokoll';
import { kontoApi } from '../../api/konto';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { geheZu } from '../../ort';
import type { useSeiten } from '../../seiten';
import { t } from '../../sprache';
import { useSucheImBereich } from '../kopfsuche';
import type { Auswahl } from './auswahl';
import { zahl } from './hilfen';

export interface ListeProps {
  sicht: string;
  typ?: Mappentyp;
  spaltenTyp?: Mappentyp;
  spalten?: string[];
  listenSpalten?: string[];
  titel: string;
  beschreibung?: string;
  offen?: string;
  neu?: boolean;
  leerText: string;
  /** Post (#192): „+ Post“ statt „+ Neu“. */
  post?: boolean;
  /** Kontextbezogene Hilfe (#110). */
  hilfe?: Hilfeort;
  /** Sprechender Link (#98): seine Parameter, der Zusatz für Adressen, Sortierung aus der Adresse, erste Mappe öffnen. */
  link?: string;
  anhang?: string;
  sortierungFest?: { wert: Sortierung | null; setze(n: Sortierung | null): void };
  zuerstOeffnen?: boolean;
  /** Mehrere Mappen auswählen (#149) – in Sichten, nicht im Eingang oder bei Favoriten. */
  auswahl?: boolean;
  /** Export erlaubt (#153: Recht E an der Sicht). */
  export?: boolean;
  /** Erweiterte Suche (#199): Chips unter dem Kopf. */
  kopf?: ReactNode;
  /** „Ansicht bearbeiten“ im Menü „⋯“ (#1285): Weg in die Werkbank, nur mit Recht. */
  bearbeiten?: string;
  /** Name im Chip des Suchfelds oben (#1218), wenn er nicht der Titel ist – z. B. „Vertrag“ statt „Alle Mappen: Vertrag“. */
  bereich?: string;
}

type Seiten = ReturnType<typeof useSeiten>;
type Daten = ReturnType<typeof useDaten>;
export type Ergebnis = { text: string; liste: Array<{ id: string; titel: string; grund: string }> };

/**
 * Suchfeld in der Kopfzeile (#1218): Die Liste meldet sich als Bereich an („in: Verträge“) und filtert mit dem Text
 * von dort. In der erweiterten Suche führt das Feld oben dorthin, die Liste selbst hat kein Suchfeld.
 */
export function useListenSuche(p: ListeProps) {
  const eingabe = useSucheImBereich(
    p.sicht === 'suche'
      ? null
      : { schluessel: `${p.sicht}?${p.link ?? ''}`, name: p.bereich ?? p.titel, typ: p.typ ? (p.typ.schluessel ?? p.typ.id) : undefined },
  );
  const [suche, setSuche] = useState('');
  // Suche erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => {
    const timer = setTimeout(() => setSuche(eingabe.trim()), 250);
    return () => clearTimeout(timer);
  }, [eingabe]);
  return suche;
}

/** Sortierung je Benutzer und Mappentyp (bzw. Eingang), auf dem Server gespeichert – oder fest aus der Adresse (#98). */
export function sortierungVon(p: ListeProps, d: Daten) {
  const sortSchluessel = `sortierung:${p.sicht}`;
  const sortierung = p.sortierungFest ? p.sortierungFest.wert : ((d.einstellungen[sortSchluessel] as Sortierung | undefined) ?? null);
  const setzeSortierung = (n: Sortierung | null) => (p.sortierungFest ? p.sortierungFest.setze(n) : d.setzeEinstellung(sortSchluessel, n));
  const sortiere = (spalte: string) => {
    const n: Sortierung | null =
      sortierung?.spalte === spalte ? { spalte, absteigend: !sortierung.absteigend } : { spalte, absteigend: false };
    setzeSortierung(n.spalte === '_titel' && !n.absteigend ? null : n);
  };
  return { sortierung, setzeSortierung, sortiere };
}

/** Link (#98): die erste Mappe öffnen – einmal, nicht nach „Zur Liste“. */
export function useZuerstOeffnen(p: ListeProps, s: Seiten, anhang: string) {
  const geoeffnet = useRef(false);
  useEffect(() => {
    if (p.offen) {
      geoeffnet.current = true;
      return;
    }
    if (p.zuerstOeffnen && !geoeffnet.current && s.mappen.length) {
      geoeffnet.current = true;
      geheZu(`/ablage/${p.sicht}/${s.mappen[0].id}${anhang}`, true);
    }
  }, [p.offen, p.zuerstOeffnen, s.mappen]); // eslint-disable-line react-hooks/exhaustive-deps -- erste Mappe nur öffnen, wenn sich Auswahl oder Liste ändern
}

/** Breite der Liste: schmal → kompakte Einträge, breit → Tabelle (#22). */
export function useBreite() {
  const mess = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(0);
  useEffect(() => {
    const el = mess.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return { mess, breite };
}

/** Ende der Liste erreicht → nächste Seite laden. */
export function useNachladen(s: Seiten, tabelle: boolean) {
  const ende = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const o = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) s.mehr();
      },
      { rootMargin: '300px' },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [s.mehr, s.mappen.length, tabelle]); // eslint-disable-line react-hooks/exhaustive-deps -- Beobachter nur neu, wenn sich Liste oder Darstellung ändern
  return ende;
}

/** Favorit = Abo (#422): Geöffnet = gesehen – Hervorhebung weg, Zähler (eine „Geändert“-Aufgabe erledigt sich) neu. */
export function useGesehen(p: ListeProps, s: Seiten, d: Daten) {
  useEffect(() => {
    if (!p.offen || !s.geaendert.has(p.offen)) return;
    const id = p.offen;
    s.gesehen([id]);
    void kontoApi
      .gesehen([id])
      .then(() => d.neuLaden())
      .catch(() => {});
  }, [p.offen, s.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- als gesehen melden nur bei anderer Mappe oder neuen Änderungen
  const geaenderteHier = s.mappen.filter((m) => s.geaendert.has(m.id)).map((m) => m.id);
  async function alleGesehen() {
    s.gesehen(geaenderteHier);
    try {
      await kontoApi.gesehen(geaenderteHier);
      await d.neuLaden();
    } catch {
      /* beim nächsten Laden wieder da */
    }
  }
  return { geaenderteHier, alleGesehen };
}

/**
 * Mehrere Mappen löschen (#150): Was sich löschen ließe, zählt die Probe schon beim Auswählen – so nennt die Rückfrage
 * des Gefahr-Knopfs (#1212, Leitsatz 5) Mappen, Dokumente und Ausgelassene; danach mit Grund (#470) löschen.
 */
export function useLoeschProbe(auswahl: boolean | undefined, w: Auswahl) {
  const [probe, setProbe] = useState<{
    ids: string;
    mappen: number;
    dokumente: number;
    ausgelassen: Array<{ id: string; titel: string; grund: string }>;
  } | null>(null);
  const gewaehltText = [...w.gewaehlt].join(',');
  useEffect(() => {
    if (!auswahl || !gewaehltText) {
      setProbe(null);
      return;
    }
    let aktuell = true;
    const z = setTimeout(() => {
      mappenApi.mappenLoeschen(gewaehltText.split(','), true).then(
        (r) => aktuell && setProbe({ ids: gewaehltText, ...r }),
        () => aktuell && setProbe(null),
      );
    }, 250);
    return () => {
      aktuell = false;
      clearTimeout(z);
    };
  }, [gewaehltText, auswahl]);
  return { probe, gewaehltText };
}

/** Die Auswahl löschen (#150, Grund #470) und das Ergebnis melden; ist die offene Mappe weg, zurück zur Liste. */
export async function loescheAuswahl(
  x: { p: ListeProps; w: Auswahl; d: Daten; korb: boolean; anhang: string; setErgebnis(e: Ergebnis | undefined): void },
  anlass?: LoeschAnlass,
) {
  const { p, w, d, korb, anhang, setErgebnis } = x;
  if (!anlass) return;
  setErgebnis(undefined);
  try {
    const ids = [...w.gewaehlt];
    const r = await mappenApi.mappenLoeschen(ids, false, anlass);
    w.leeren();
    await d.neuLaden();
    setErgebnis({
      text: t('ablage.ablage.mappen-4', {
        anzahl: r.geloescht,
        zahl: zahl(r.geloescht),
        wert: korb ? t('ablage.ablage.in-den-papierkorb-gelegt') : t('ablage.ablage.geloescht'),
        wert2: r.ausgelassen.length ? t('ablage.ablage.ausgelassen', { zahl: zahl(r.ausgelassen.length) }) : '',
      }),
      liste: r.ausgelassen,
    });
    if (p.offen && ids.includes(p.offen) && !r.ausgelassen.some((y) => y.id === p.offen)) geheZu(`/ablage/${p.sicht}${anhang}`);
  } catch (e) {
    setErgebnis({ text: (e as Error).message, liste: [] });
  }
}
