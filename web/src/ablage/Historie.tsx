import { useEffect, useRef, useState } from 'react';
import { t } from '../sprache';
import {
  HISTORIENARTEN,
  HISTORIENGRUPPEN,
  historiengruppenVon,
  type Historieneintrag,
  type Mappentyp,
  type Register,
} from '../../../shared/src/model';
import { mappenApi } from '../api/mappen';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { Person } from '../Person';
import { gebietsschema } from '../../../shared/src/sprache';
import { Eintragsliste, Etikett, HakenFeld, Knopf, type Listeneintrag } from '../bausteine';
import { einzelheiten } from './historie/einzelheiten';
import { beschrifte } from './historie/hilfen';

// Einzelheiten je Eintrag (#80) stehen in historie/ (#1279); der Test (#1010) holt sie weiter hier.
export { einzelheiten };

/** Änderungshistorie einer Mappe (#57): je Eintrag eine Zeile, Einzelheiten zum Aufklappen (#80). */
const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

function kurz(e: Historieneintrag, typ?: Pick<Mappentyp, 'felder'>): string {
  const d = e.daten;
  if (d.aenderungen?.length) return d.aenderungen.map((a) => beschrifte(a, typ)).join(', ');
  if (e.art === 'post_geteilt' && typeof d.text === 'string') return d.text;
  // #820: im Verwaltungsmodus geöffnet, heruntergeladen … – nie ausgeblendet.
  if (e.art === 'verwaltungsmodus') return t.frei(`mappen.historie.verwaltungsmodus.${typeof d.was === 'string' ? d.was : 'angesehen'}`);
  // Paket-Aktion (#1039): Aktion und Paket; wer sie ausgelöst hat, steht in der Spalte „wer“.
  if (e.art === 'paketaktion' && typeof d.text === 'string') return d.text;
  if (d.dokument) return d.dokument;
  if (d.feld) return d.feld;
  if (typeof d.text === 'string') return d.text;
  return '';
}

/** So viele Einträge lädt die Historie auf einmal (#800); „Weitere laden“ holt die nächsten. */
export const HISTORIE_SEITE = 100;

/**
 * Historie einer Mappe (#57). Seit #800 lädt sie erst, wenn man das Register öffnet, und seitenweise; sie zeigt, was
 * das Register „Historie“ zeigen soll (`register`, sonst die Vorauswahl). „Alles anzeigen“ zeigt jedem, der die Mappe
 * lesen darf, alle Einträge.
 */
export function Historie({
  mappeId,
  stand,
  typ,
  register,
}: {
  mappeId: string;
  stand?: string;
  typ?: Pick<Mappentyp, 'felder'>;
  register?: Pick<Register, 'key' | 'zeigt'>;
}) {
  const d = useDaten();
  const [liste, setListe] = useState<Historieneintrag[] | null>(null);
  const [weitere, setWeitere] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [alles, setAlles] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const lauf = useRef(0);
  const emailTyp = d.typen.find((mappentyp) => mappentyp.system === 'post')?.id;
  // Blendet das Register etwas aus? Dann gibt es „Alles anzeigen“.
  const gefiltert = !!register && historiengruppenVon(register).length < Object.keys(HISTORIENGRUPPEN).length;
  const filter = gefiltert && !alles ? register!.key : undefined;
  const lade = (vor?: number) => {
    const nr = ++lauf.current;
    setLaedt(true);
    mappenApi.historie(mappeId, { register: filter, max: HISTORIE_SEITE, vor }).then(
      (h) => {
        if (nr !== lauf.current) return;
        setListe((x) => (vor !== undefined && x ? [...x, ...h] : h));
        setWeitere(h.length === HISTORIE_SEITE);
        setFehler(undefined);
        setLaedt(false);
      },
      (e: Error) => {
        if (nr === lauf.current) {
          setFehler(e.message);
          setLaedt(false);
        }
      },
    );
  };
  useEffect(() => {
    lade();
  }, [mappeId, stand, filter]);
  if (fehler)
    return (
      <div className="hinweis schlecht">
        <p>{fehler}</p>
      </div>
    );
  if (!liste) return <p className="leise">{t('ablage.historie.lade')}</p>;
  const schalter = gefiltert && (
    <HakenFeld beschriftung={t('ablage.historie.alles-anzeigen')} className="historie-alles">
      <input type="checkbox" checked={alles} onChange={(e) => setAlles(e.target.checked)} />
    </HakenFeld>
  );
  if (!liste.length)
    return (
      <>
        {schalter}
        <p className="leise">{t('ablage.historie.noch-keine-eintraege-die')}</p>
      </>
    );
  const eintraege: Listeneintrag[] = liste.map((e) => {
    const x = einzelheiten(e, emailTyp, typ);
    return {
      id: e.id,
      wann: zeit(e.zeit),
      wer: <Person id={e.benutzerId} ersatz={typeof e.daten.system === 'string' ? e.daten.system : undefined} />,
      // Aus einer aufgelösten Post übernommen (#936): Eingang, Herkunft, Änderungen … der Post stehen jetzt hier.
      ...(typeof e.daten.ausPost === 'string'
        ? {
            zustand: <Etikett title={t('ablage.historie.aus-der-post-titel')}>{t('ablage.historie.aus-der-post')}</Etikett>,
          }
        : {}),
      was: (
        <>
          <strong>{HISTORIENARTEN[e.art] ?? e.art}</strong>
          {kurz(e, typ) ? `: ${kurz(e, typ)}` : ''}
          {e.art === 'email' && typeof e.daten.email === 'string' && emailTyp && (
            <>
              {' '}
              ·{' '}
              <Link to={`/ablage/${emailTyp}/${e.daten.email}`} className="verweis">
                {t('ablage.historie.oeffnen')}
              </Link>
            </>
          )}
        </>
      ),
      ...(x
        ? {
            mehr: x.hinweis,
            inhalt: x.inhalt,
            label: t('ablage.historie.aufklappbar', { wert: HISTORIENARTEN[e.art] ?? e.art, hinweis: x.hinweis }),
          }
        : {}),
    };
  });
  return (
    <>
      {schalter}
      <Eintragsliste eintraege={eintraege} />
      {weitere && (
        <p>
          <Knopf groesse="klein" laeuft={laedt} laeuftText={t('ablage.historie.lade')} onClick={() => lade(liste[liste.length - 1].id)}>
            {t('ablage.historie.weitere-laden')}
          </Knopf>
        </p>
      )}
    </>
  );
}
