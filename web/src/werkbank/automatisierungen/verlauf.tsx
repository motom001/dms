import { useCallback, useEffect, useState } from 'react';
import type { AutomatisierungAnsicht, Kontextdaten, Lauf, Schritt } from '../../../../shared/src/automatisierung';
import type { Mappentyp } from '../../../../shared/src/model';
import { MappenWahl } from '../../ablage/MappeFormular';
import { automatisierungApi } from '../../api/automatisierung';
import type { Bezuege } from '../../api/mappen';
import { Bereich, Eintragsliste, Etikett, etikettArt, HakenFeld, type Klappe, Knopf, type Listeneintrag } from '../../bausteine';
import { useDaten } from '../../daten';
import { t } from '../../sprache';
import { AufrufParameterZeile } from '../AutomatisierungAufruf';
import { ereignisName, ohneMappeWenn, vorratName, zeit, ZUSTAND_ART } from './hilfen';

/**
 * Wiedergeben (auch trocken) und Verlauf einer Automatisierung (#707; #1279 aus Automatisierungen.tsx gezogen): je
 * Schritt Karte, Ergebnis und Einzelheiten; ein laufender Durchgang ist aufgeklappt.
 */

/** Karte · Ergebnis · Einzelheiten je Schritt (#707) – für Verlauf, Live-Fortschritt und Ausprobieren gleich. */
function Schritte({ l, a }: { l: Lauf; a: AutomatisierungAnsicht }) {
  const name = (x: Schritt) =>
    x.teil === 'dann' || x.teil === 'sonst'
      ? `${x.teil === 'sonst' ? `${t('automatisierung.ui.sonst')}: ` : ''}${vorratName({ bereich: 'dann', art: a[x.teil].find((k) => k.id === x.karte)?.art ?? 'stopp' })}`
      : t.frei(`automatisierung.ui.${x.teil}`);
  return (
    <>
      <table className="aenderungen automatisierung-schritte">
        <thead>
          <tr>
            <th>{t('automatisierung.ui.schritte.karte')}</th>
            <th>{t('automatisierung.ui.schritte.ergebnis')}</th>
            <th>{t('automatisierung.ui.schritte.einzelheiten')}</th>
          </tr>
        </thead>
        <tbody>
          {l.schritte.map((x, i) => (
            <tr key={i} className={`laufschritt ${x.zustand}`}>
              <td>{name(x)}</td>
              <td>
                <Etikett art={etikettArt(SCHRITT_ART[x.zustand] ?? '')}>{t.frei(`automatisierung.ui.schritt.${x.zustand}`)}</Etikett>
              </td>
              <td className={x.text ? '' : 'leise'}>{x.text || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Aufruf von außen (#679): mitgeschickte Parameter (nur für Verwaltende von „Automatisierungen“). */}
      <AufrufParameterZeile l={l} />
    </>
  );
}

const SCHRITT_ART: Record<string, string> = {
  ok: 'gut',
  fehler: 'schlecht',
  laeuft: 'info',
  nein: 'leise',
  uebersprungen: 'leise',
  offen: 'leise',
};

export function Wiedergeben({
  a,
  typ,
  nachher,
  klappe,
}: {
  a: AutomatisierungAnsicht;
  typ: Mappentyp | null;
  nachher: () => void;
  klappe: Klappe;
}) {
  const [mappe, setMappe] = useState('');
  const [bekannt, setBekannt] = useState<Bezuege>({});
  const [trocken, setTrocken] = useState(true);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [fehler, setFehler] = useState<string>();
  // Auswahl wie ein Verweisfeld (#709); vorgeschlagen werden nur Mappen, die die Automatisierung sehen darf.
  const quelle = useCallback((suche: string) => automatisierungApi.automatisierungTestmappen(a.id, suche), [a.id]);
  return (
    <Bereich id="ausprobieren" titel={t('automatisierung.ui.wiedergeben')} klappe={klappe}>
      {/* Werkbank-Karten (#677): ohne Mappe, mit einer Beispielmeldung. */}
      <p className="leise klein">
        {ohneMappeWenn(a.wenn) ? t('automatisierung.ui.wiedergeben.beispiel') : t('automatisierung.ui.wiedergeben.text')}
      </p>
      <div className="zeile">
        {ohneMappeWenn(a.wenn) ? null : typ ? (
          <div className="feld">
            <label htmlFor="ausprobieren-mappe" className="sr">
              {t('automatisierung.ui.wiedergeben.suchen')}
            </label>
            <MappenWahl
              id="ausprobieren-mappe"
              ziel={typ}
              mehrfach={false}
              wert={mappe || undefined}
              bekannt={bekannt}
              ohneAnlegen
              merke={(id, x) => setBekannt((y) => ({ ...y, [id]: x }))}
              setze={(v) => setMappe(typeof v === 'string' ? v : '')}
              platzhalter={t('automatisierung.ui.wiedergeben.suchen')}
              quelle={quelle}
              leer={t('automatisierung.ui.wiedergeben.leer', { typ: typ.name })}
            />
          </div>
        ) : (
          <p className="leise klein">{t('automatisierung.ui.wiedergeben.ohne-typ')}</p>
        )}
        <HakenFeld beschriftung={t('automatisierung.ui.trocken')} hinweis={t('automatisierung.ui.trocken.hilfe')} className="klein">
          <input type="checkbox" checked={trocken} onChange={(x) => setTrocken(x.target.checked)} />
        </HakenFeld>
        <Knopf
          groesse="klein"
          gesperrt={!mappe && !ohneMappeWenn(a.wenn)}
          onClick={async () => {
            setFehler(undefined);
            try {
              setLauf(await automatisierungApi.automatisierungWiedergeben(a.id, mappe, trocken));
              nachher();
            } catch (e) {
              setFehler((e as Error).message);
            }
          }}>
          {t('automatisierung.ui.wiedergeben.los')}
        </Knopf>
      </div>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {lauf && <Schritte l={lauf} a={a} />}
    </Bereich>
  );
}

/** Wodurch ein Lauf ausgelöst wurde (#707): Ereignis, Probelauf, von Hand oder Wiederholung. */
function ausloeserText(l: Lauf): string {
  if (l.test) return l.trocken ? t('automatisierung.ui.trocken.kurz') : t('automatisierung.ui.verlauf.von-hand');
  if (l.wiederholtVon) return t('automatisierung.ui.verlauf.wiederholung');
  return ereignisName(l.art);
}

/**
 * Verlauf mit Live-Fortschritt (#707): dieselbe Darstellung wie die Historie einer Mappe; ein laufender Durchgang ist
 * aufgeklappt, noch nicht erreichte Karten stehen auf „wartet“. Solange der Editor offen ist, alle 2 s nachsehen
 * (mehrere Server: aus der Datenbank).
 */
export function Verlauf({ a, klappe }: { a: AutomatisierungAnsicht; k: Kontextdaten; d: unknown; klappe: Klappe }) {
  const d = useDaten();
  const [laeufe, setLaeufe] = useState<Lauf[] | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try {
      setLaeufe(await automatisierungApi.automatisierungLaeufe(a.id));
    } catch (e) {
      setFehler((e as Error).message);
    }
  }, [a.id]);
  useEffect(() => {
    void laden();
    const z = setInterval(() => void laden(), 2_000);
    return () => clearInterval(z);
  }, [laden]);
  const handle = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await laden();
    } catch (e) {
      setFehler((e as Error).message);
    }
  };
  const laufend = laeufe?.some((l) => l.zustand === 'laeuft');
  const eintraege: Listeneintrag[] = (laeufe ?? []).map((l) => {
    const offenFuerWiederholen = l.zustand === 'fehlgeschlagen' && !l.trocken && !l.nichtWiederholt;
    const zusammen =
      l.fehler ??
      l.schritte
        .filter((x) => (x.teil === 'dann' || x.teil === 'sonst') && x.text)
        .map((x) => x.text)
        .join(' · ');
    return {
      id: l.id,
      wann: zeit(l.gestartet),
      wer: ausloeserText(l),
      was: (
        <>
          {zusammen}
          {l.nichtWiederholt && (
            <span className="leise">
              {' '}
              {t('automatisierung.ui.verlauf.nicht-wiederholt', {
                wer: l.nichtWiederholt.von ? d.person(l.nichtWiederholt.von) : '–',
                zeit: zeit(l.nichtWiederholt.zeit),
              })}
            </span>
          )}
        </>
      ),
      zustand: <Etikett art={etikettArt(ZUSTAND_ART[l.zustand] ?? '')}>{t.frei(`automatisierung.ui.zustand.${l.zustand}`)}</Etikett>,
      mehr: t('automatisierung.ui.verlauf.karten', { anzahl: l.schritte.length }),
      label: t('automatisierung.ui.verlauf.eintrag', {
        zeit: zeit(l.gestartet),
        zustand: t.frei(`automatisierung.ui.zustand.${l.zustand}`),
      }),
      offen: l.zustand === 'laeuft',
      inhalt: (
        <>
          <Schritte l={l} a={a} />
          {offenFuerWiederholen && (
            <div className="knoepfe">
              <Knopf onClick={() => handle(() => automatisierungApi.automatisierungLaufWiederholen(l.id))}>
                {t('automatisierung.ui.wiederholen')}
              </Knopf>
              <Knopf onClick={() => handle(() => automatisierungApi.automatisierungLaufNichtWiederholen(l.id))}>
                {t('automatisierung.ui.nicht-wiederholen')}
              </Knopf>
            </div>
          )}
        </>
      ),
    };
  });
  return (
    <Bereich
      id="verlauf"
      titel={t('automatisierung.ui.verlauf')}
      klappe={klappe}
      kurz={
        laufend
          ? t('automatisierung.ui.verlauf.laeuft')
          : laeufe?.length
            ? t('automatisierung.ui.bereich.zuletzt', { zeit: zeit(laeufe[0].gestartet) })
            : t('automatisierung.ui.verlauf.leer')
      }>
      {fehler && <p className="fehlertext">{fehler}</p>}
      {laufend && (
        <p className="leise klein" role="status">
          {t('automatisierung.ui.verlauf.laeuft')}
        </p>
      )}
      {!laeufe ? (
        <p className="leise">{t('automatisierung.ui.lade')}</p>
      ) : !laeufe.length ? (
        <p className="leise">{t('automatisierung.ui.verlauf.leer')}</p>
      ) : (
        <Eintragsliste eintraege={eintraege} />
      )}
    </Bereich>
  );
}
