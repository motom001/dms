/** Was die Ablage aus der Adresse ableitet (#1279): Ansicht, Mappentyp, Spalten; das Formular der erweiterten Suche. */
import { useEffect, useState } from 'react';
import { typName } from '../../../../shared/src/beschriftung';
import { GEMISCHTE_SPALTEN, standardliste, type Mappentyp } from '../../../../shared/src/model';
import { spaltenDerSicht, wirksameTypen } from '../../../../shared/src/sichten';
import { liesDirektlink } from '../../../../shared/src/direktlink';
import type { useDaten } from '../../daten';
import { t } from '../../sprache';

type Daten = ReturnType<typeof useDaten>;

/** Alte Adresse (#725): die feste Liste „Favoriten“ ist jetzt eine Ansicht – deren Id, wenn es sie gibt. */
export const favoritenSichtVon = (d: Daten) =>
  d.zaehler.favoritenSicht && d.sicht(d.zaehler.favoritenSicht) ? d.zaehler.favoritenSicht : null;

/** Sprechender Link (#98): die Adresse ist der Link; beim Öffnen einer Mappe bleibt sie erhalten (auch bei der Suche). */
export function linkLage(d: Daten, sicht: string, suche: URLSearchParams) {
  const istLink = sicht === 'link';
  const anhang = istLink || sicht === 'suche' ? `?${suche.toString()}` : '';
  const link = istLink ? liesDirektlink(suche, d.typen) : null;
  return { anhang, link };
}

/** Der eine Mappentyp der Sicht (für Trefferliste, Sortierung, „+ Neu“); bei mehreren Typen keiner. */
export function sichtLage(d: Daten, sicht: string) {
  const verwaltet = d.sicht(sicht);
  const typ = d.typDerSicht(sicht);
  // Spalten (#75): Trefferliste der Sicht, sonst Standard; bei mehreren Typen nur Gemeinsames.
  // Liste eines Mappentyps ohne Ansicht (#888), z. B. nach einem Klick auf eine Erwähnung oder einen Verweis: klar als
  // „Alle Mappen: <Typ>“ – nie mit Namen, Bedingungen oder Export einer Ansicht, auch wenn eine gesperrte so heißt.
  const typListe = !verwaltet && typ ? t('ablage.typliste.titel', { name: typName(typ) }) : undefined;
  const sichtTypen = verwaltet
    ? wirksameTypen(
        d.sichten,
        verwaltet.id,
        d.typen.map((mappentyp) => mappentyp.id),
      )
        .map((text) => d.typ(text))
        .filter((eintrag): eintrag is Mappentyp => !!eintrag)
    : typ
      ? [typ]
      : [];
  const wahl = verwaltet
    ? spaltenDerSicht(sichtTypen, verwaltet.trefferliste)
    : typ
      ? { key: 'standard', spalten: standardliste(typ).spalten }
      : { key: null, spalten: GEMISCHTE_SPALTEN };
  return { verwaltet, typ, typListe, sichtTypen, wahl };
}

/** Erweiterte Suche (#199): am Handy erst das Formular, nach „Suchen“ die Treffer. */
export function useSuchformular(istSuche: boolean, suche: URLSearchParams) {
  const [formular, setFormular] = useState(() => !suche.toString());
  const leereSuche = istSuche && !suche.toString();
  useEffect(() => {
    if (leereSuche) setFormular(true);
  }, [leereSuche]);
  // Enter im Suchfeld oben (#1218): Mit einem neuen Begriff kommen gleich die Treffer, nicht das Formular.
  const volltextOben = istSuche ? (suche.get('volltext') ?? '') : '';
  useEffect(() => {
    if (volltextOben) setFormular(false);
  }, [volltextOben]);
  return { formular, setFormular };
}
