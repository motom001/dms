/** Spalte links der Ablage (#507, #725; #1279 eigene Datei): feste Einträge, Ansichten als Baum, Hinweise ohne Typen. */
import { sichtName } from '../../../../shared/src/beschriftung';
import { kinderVon, type Sicht } from '../../../../shared/src/sichten';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { Link } from '../../ort';
import { t, tn } from '../../sprache';
import { Symbol, type SymbolName } from '../../Symbol';
import { AnsichtFilter, AnsichtWahl } from '../AnsichtWahl';
import { ZahlWarte } from '../ZahlWarte';
import { zahl } from '../liste/hilfen';
import { SichtBaum } from '../liste/SichtBaum';

type Daten = ReturnType<typeof useDaten>;

/** Feste Einträge links (#507, #725): Erweiterte Suche · Start · Zu erledigen · Neue Post · Favoriten · Papierkorb. */
function festeEintraege(d: Daten, sicht: string | undefined, istSuche: boolean, mitStart: boolean) {
  const neuePost = d.zaehler.neuePost ? d.sicht(d.zaehler.neuePost) : undefined;
  const favSicht = d.zaehler.favoritenSicht ? d.sicht(d.zaehler.favoritenSicht) : undefined;
  // Zahlen kommen nach (#512): bis dahin ein Platzhalter (warte) bei den Einträgen, die aus dem Zähler kommen.
  const warte = !d.zahlenDa;
  // `anker` (#831): fester Ankerpunkt für Rundgänge und Tipps.
  const feste: Array<{
    pfad: string;
    name: string;
    symbol: SymbolName;
    titel?: string;
    zahl?: number;
    warte?: boolean;
    hervor?: boolean;
    an: boolean;
    anker?: string;
  }> = [
    {
      pfad: '/ablage/suche',
      name: t('ablage.ablage.erweiterte-suche'),
      symbol: 'suche',
      titel: t('ablage.ablage.mappentypen-waehlen-in-feldern'),
      an: istSuche,
      anker: 'navigation.erweiterte-suche',
    },
    // „Zuletzt geöffnet“ (#940) gehört zur Startseite: dort bleibt „Start“ markiert.
    ...(mitStart
      ? [{ pfad: '/ablage/start', name: t('ablage.ablage.start'), symbol: 'haus' as const, an: sicht === 'start' || sicht === 'zuletzt' }]
      : []),
    {
      pfad: '/ablage/eingang',
      name: t('ablage.ablage.zu-erledigen'),
      symbol: 'erledigen',
      zahl: d.zaehler.eingang,
      warte,
      hervor: true,
      an: sicht === 'eingang',
      anker: 'navigation.zu-erledigen',
    },
    ...(neuePost
      ? [
          {
            pfad: `/ablage/${neuePost.id}`,
            name: sichtName(neuePost),
            symbol: 'posteingang' as const,
            titel: neuePost.beschreibung || undefined,
            zahl: d.zaehler.sichten?.[neuePost.id],
            warte,
            hervor: true,
            an: sicht === neuePost.id,
            anker: 'navigation.neue-post',
          },
        ]
      : []),
    // Favoriten (#725): die mitgelieferte Ansicht oben wie „Neue Post“; die feste Liste nur, wenn der Administrator sie gelöscht hat.
    favSicht
      ? {
          pfad: `/ablage/${favSicht.id}`,
          name: sichtName(favSicht),
          symbol: 'stern',
          titel: favSicht.beschreibung || undefined,
          zahl: d.zaehler.sichten?.[favSicht.id] ?? d.zaehler.favoriten,
          warte,
          an: sicht === favSicht.id,
          anker: 'navigation.favoriten',
        }
      : {
          pfad: '/ablage/favoriten',
          name: t('ablage.ablage.favoriten'),
          symbol: 'stern',
          zahl: d.zaehler.favoriten,
          warte,
          an: sicht === 'favoriten',
          anker: 'navigation.favoriten',
        },
    // Papierkorb (#43): sichtbar, solange er an ist oder noch etwas darin liegt.
    ...(!!d.zaehler.papierkorbTage || !!d.zaehler.papierkorb
      ? [
          {
            pfad: '/ablage/papierkorb',
            name: t('ablage.ablage.papierkorb'),
            symbol: 'geloescht' as const,
            zahl: d.zaehler.papierkorb,
            warte,
            an: sicht === 'papierkorb',
          },
        ]
      : []),
  ];
  return { feste, neuePost, favSicht };
}

/** Name der gewählten Ansicht im Knopf am Handy (#498). */
function aktuellerName(sicht: string | undefined, istSuche: boolean, name: string | undefined) {
  return sicht === 'start'
    ? t('ablage.ablage.start')
    : istSuche
      ? t('ablage.ablage.erweiterte-suche')
      : sicht === 'eingang'
        ? t('ablage.ablage.zu-erledigen')
        : sicht === 'favoriten'
          ? t('ablage.ablage.favoriten')
          : sicht === 'papierkorb'
            ? t('ablage.ablage.papierkorb')
            : sicht === 'zuletzt'
              ? t('ablage.startseite.zuletzt-geoeffnet')
              : (name ?? t('ablage.ablage.ansicht-waehlen'));
}

export function Seitenleiste({
  sicht,
  istSuche,
  mitStart,
  name,
}: {
  sicht: string | undefined;
  istSuche: boolean;
  mitStart: boolean;
  /** Name der verwalteten Ansicht bzw. „Alle Mappen: <Typ>“ (#888). */
  name: string | undefined;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  const { feste, neuePost, favSicht } = festeEintraege(d, sicht, istSuche, mitStart);
  return (
    <aside className="spalte sichten" aria-label={t('ablage.ablage.ansichten')} data-anker="navigation.ansichten">
      {/* Handy (#498): ein Knopf „<Ansicht> ▾“ mit Suche und Gruppen statt der Reiterleiste. */}
      <AnsichtWahl
        aktiv={sicht}
        aktuell={aktuellerName(sicht, istSuche, name)}
        feste={feste.map((f) => ({
          pfad: f.pfad,
          name: (
            <>
              <Symbol name={f.symbol} /> {f.name}
            </>
          ),
          text: f.name,
          zahl: f.zahl,
          warte: f.warte,
          hervor: f.hervor,
          an: f.an,
        }))}
        ohne={[neuePost?.id, favSicht?.id].filter((x): x is string => !!x)}
      />
      <h2 className="ueber aw-breit">{t('ablage.ablage.ansichten')}</h2>
      <nav className="sichtliste">
        {/* Feste Einträge (#507): immer mit Symbol, in fester Reihenfolge; darunter nur die eingerichteten Ansichten. */}
        {feste.map((f) => (
          <Link key={f.pfad} to={f.pfad} className={`sicht ${f.an ? 'an' : ''}`} title={f.titel} anker={f.anker}>
            <span className="nm">
              <Symbol name={f.symbol} className="fest-sym" /> {f.name}
            </span>
            {f.warte ? <ZahlWarte /> : !!f.zahl && <span className={f.hervor ? 'zaehler' : 'zahl'}>{zahl(f.zahl)}</span>}
          </Link>
        ))}
        {d.sichten.length > 0 && <hr />}
        <AnsichtFilter
          aktiv={sicht}
          baum={
            <SichtBaum
              aktiv={sicht}
              ohne={[neuePost, favSicht].filter((x): x is Sicht => !!x && !kinderVon(d.sichten, x.id).length).map((x) => x.id)}
            />
          }
        />
      </nav>
      {!d.typen.length && (
        <p className="leise klein">
          {tn('ablage.ablage.noch-keine-mappentypen', {
            wert:
              ich.rolle === 'admin' ? (
                <Link to="/werkbank/typen" className="verweis">
                  {t('ablage.ablage.zur-werkbank')}
                </Link>
              ) : (
                t('ablage.ablage.wer-ablago-verwaltet-muss')
              ),
          })}
        </p>
      )}
      {d.typen.length > 0 && !d.sichten.length && (
        <p className="leise klein">
          {tn('ablage.ablage.noch-keine-ansichten', {
            wert:
              ich.rolle === 'admin' ? (
                <Link to="/werkbank/sichten" className="verweis">
                  {t('ablage.ablage.ansichten-einrichten')}
                </Link>
              ) : (
                t('ablage.ablage.wer-ablago-verwaltet-muss')
              ),
          })}
        </p>
      )}
    </aside>
  );
}
