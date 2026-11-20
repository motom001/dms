/**
 * Zustand der Werkbank-Seite „Pakete“ (#188): installierte Pakete, abgerufene Kataloge, Hochgeladenes (#1278, Schritt
 * 5; vorher in Pakete.tsx). Eigene Datei, weil auch die Teile der Seite (PaketeAlle.tsx, PaketeVerfuegbar.tsx) ihn
 * bekommen und Pakete.tsx diese Teile zeigt.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { neueVersionen, type HerkunftPruefung, type InstalliertesPaket, type Katalog, type KatalogPaket } from '../../../shared/src/pakete';
import type { SelbstErstellt } from '../../../shared/src/paketerstellung';
import { paketeApi, type PaketQuelle, type PaketVorschau, type Sammeldatei } from '../api/pakete';

type Abruf = { url: string; offiziell: boolean; katalog: Katalog | null; fehler: string | null; pruefung?: HerkunftPruefung | null };
export function usePakete(offen: boolean) {
  const [stand, setStand] = useState<{ installiert: InstalliertesPaket[]; katalogUrl: string; quellen: PaketQuelle[]; dms: string } | null>(
    null,
  );
  const [kataloge, setKataloge] = useState<{ liste: Abruf[]; abgerufen: string } | null>(null);
  const [upload, setUpload] = useState<{ upload: string; vorschau: PaketVorschau; datei: string } | null>(null);
  const [sammel, setSammel] = useState<{ sammeldatei: Sammeldatei; datei: string } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);
  // Selbst erstellte Pakete (#652) stehen unter „Installiert“ mit dem Zeichen „selbst erstellt“.
  const [selbst, setSelbst] = useState<SelbstErstellt[] | null>(null);
  const laden = useCallback(async () => {
    try {
      const [st, se] = await Promise.all([paketeApi.pakete(), paketeApi.selbstErstellt()]);
      setStand(st);
      setSelbst(se);
      setFehler(undefined);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);
  // Abgefragt werden der offizielle Katalog und die eingeschalteten weiteren Quellen (#369);
  // der Link aus der Katalog-Webseite (#191) fragt nur den offiziellen ab (alle = false).
  const abrufen = useCallback(async (alle = true) => {
    setLaedt(true);
    setFehler(undefined);
    try {
      const k = await paketeApi.paketKatalog(alle);
      setKataloge({ liste: k.kataloge, abgerufen: k.abgerufen });
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
    }
  }, []);
  // Neuere Versionen (#1167): aus den abgerufenen Katalogen und dem Stand der Installation abgeleitet, nicht gemerkt –
  // nach einem Update stimmt der Merker sofort, ohne erneut zu prüfen.
  // Gemerkt, solange sich beides nicht ändert (#1508): Das Ergebnis am Knopf „Nach neuen Versionen suchen“ hängt daran.
  const updates = useMemo(() => neueVersionen(stand?.installiert ?? [], kataloge?.liste ?? []), [stand, kataloge]);
  /** Katalogpaket aus einer Quelle (ohne Angabe: offizieller Katalog). */
  const paketAus = (id: string, quelle?: string): { kp: KatalogPaket; url: string; offiziell: boolean } | undefined => {
    const k = kataloge?.liste.find((x) => (quelle ? x.url === quelle : x.offiziell));
    // Umgezogen (#1084): unter der neuen Id, die die installierte unter `ersetzt` nennt.
    const kp = k?.katalog?.pakete.find((p) => p.id === id) ?? k?.katalog?.pakete.find((p) => p.ersetzt?.includes(id));
    return kp && k ? { kp, url: k.url, offiziell: k.offiziell } : undefined;
  };
  /** Hat ein Katalog ein Paket mit derselben Id wie ein selbst erstelltes (#652)? */
  const konflikt = (id: string) => !!kataloge?.liste.some((k) => k.katalog?.pakete.some((p) => p.id === id));
  return {
    stand,
    selbst,
    kataloge,
    updates,
    upload,
    setUpload,
    sammel,
    setSammel,
    fehler,
    laedt,
    laden,
    abrufen,
    paketAus,
    setStand,
    konflikt,
  };
}
export type PaketeZustand = ReturnType<typeof usePakete>;
