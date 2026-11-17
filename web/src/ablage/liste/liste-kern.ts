/** Zustand einer Mappenliste (#1279): Hooks in der Reihenfolge von früher und was die Teile daraus brauchen. */
import { useState } from 'react';
import { GEMISCHTE_SPALTEN } from '../../../../shared/src/model';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { useSeiten } from '../../seiten';
import { useAuswahl } from './auswahl';
import {
  sortierungVon,
  useBreite,
  useGesehen,
  useListenSuche,
  useLoeschProbe,
  useNachladen,
  useZuerstOeffnen,
  type Ergebnis,
  type ListeProps,
} from './liste-hooks';

export function useListe(p: ListeProps) {
  const d = useDaten();
  // Favoriten benachrichtigen (#506): ohne Freigabe der Werkbank kein Schalter an den Favoriten.
  const { favoritenBenachrichtigung } = useKonto();
  const anhang = p.anhang ?? '';
  const suche = useListenSuche(p);
  const sort = sortierungVon(p, d);
  // Volltextsuche (#45): je Benutzer gemerkt.
  const volltext = d.einstellungen.suche_volltext === true;
  const inNotizen = d.einstellungen.suche_notizen === true;
  const s = useSeiten(p.sicht, suche, d.stand, sort.sortierung, volltext, inNotizen, p.link);
  useZuerstOeffnen(p, s, anhang);
  const { mess, breite } = useBreite();
  // Feste Sichten (Eingang, Favoriten): Systemspalten.
  const spalten = p.spalten ?? GEMISCHTE_SPALTEN;
  const tabelle = spalten.length > 0 && breite >= Math.max(560, spalten.length * 120);
  const ende = useNachladen(s, tabelle);
  const gesehen = useGesehen(p, s, d);
  const w = useAuswahl(s.mappen, s.gesamt, [p.sicht, suche, volltext, inNotizen, p.link ?? '']);
  const [ergebnis, setErgebnis] = useState<Ergebnis>();
  const [exportOffen, setExportOffen] = useState(false);
  const [emailOffen, setEmailOffen] = useState(false);
  async function alleWaehlen() {
    try {
      const r = await mappenApi.auswahl(p.sicht, suche, volltext, inNotizen, p.link);
      w.setze(r.ids, true);
    } catch (x) {
      setErgebnis({ text: (x as Error).message, liste: [] });
    }
  }
  const loesch = useLoeschProbe(p.auswahl, w);
  const korb = (d.zaehler.papierkorbTage ?? 0) > 0;
  return {
    ...{ p, d, favoritenBenachrichtigung, anhang, suche, ...sort, volltext, inNotizen, s, mess, spalten, tabelle, ende },
    ...{ ...gesehen, w, wahl: p.auswahl ? w : undefined, ergebnis, setErgebnis, exportOffen, setExportOffen, emailOffen },
    ...{ setEmailOffen, alleWaehlen, ...loesch, korb },
  };
}

export type ListeKern = ReturnType<typeof useListe>;
