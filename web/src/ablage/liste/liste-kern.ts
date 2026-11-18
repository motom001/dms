/** Zustand einer Mappenliste (#1279): Hooks in der Reihenfolge von früher und was die Teile daraus brauchen. */
import { useState } from 'react';
import { GEMISCHTE_SPALTEN } from '../../../../shared/src/model';
import { mappenApi } from '../../api/mappen';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { useSeiten } from '../../seiten';
import { useAuswahl } from './auswahl';
import { einheitlicherTyp, ohneTypSpalte } from './hilfen';
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
  // Ein Mappentyp für die ganze Liste (#1285): Dann fehlt die Spalte „Mappentyp“, und die Anzahl nennt den Typ.
  const einTyp = einheitlicherTyp(p.typ, s.mappen, (id) => d.typ(id));
  const spalten = ohneTypSpalte(p.spalten ?? GEMISCHTE_SPALTEN, einTyp);
  const tabelle = spalten.length > 0 && breite >= Math.max(560, spalten.length * 120);
  const ende = useNachladen(s, tabelle);
  const gesehen = useGesehen(p, s, d);
  const w = useAuswahl(s.mappen, s.gesamt, [p.sicht, suche, volltext, inNotizen, p.link ?? '']);
  const [ergebnis, setErgebnis] = useState<Ergebnis>();
  // Exportieren (#1285): alle Treffer über „⋯“ im Kopf oder die Auswahl über die Auswahlleiste.
  const [exportOffen, setExportOffen] = useState<false | 'alle' | 'auswahl'>(false);
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
    ...{ p, d, favoritenBenachrichtigung, anhang, suche, ...sort, volltext, inNotizen, s, mess, einTyp, spalten, tabelle, ende },
    ...{ ...gesehen, w, wahl: p.auswahl ? w : undefined, ergebnis, setErgebnis, exportOffen, setExportOffen, emailOffen },
    ...{ setEmailOffen, alleWaehlen, ...loesch, korb },
  };
}

export type ListeKern = ReturnType<typeof useListe>;
