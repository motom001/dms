import type { PostfachAnsicht, PostfachEreignis } from '../api/eingaenge';
import { Link } from '../ort';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { Bereich, Knopf, type Klappe, type KnopfErgebnis } from '../bausteine';
import { Symbol } from '../Symbol';

/**
 * Werkbank → Postfach → Stand (#196, #1186): oben der Zustand in einem Satz – „Läuft – zuletzt abgerufen …, nächster
 * Abruf …“ oder rot „Gestört seit … – n Versuche gescheitert: …“ mit dem Weg zum Bereich, in dem man es behebt.
 * Darunter „Jetzt abrufen“ (Sofortaktion), zuletzt Übernommenes und zugeklappt die früheren Störungen mit „behoben
 * am …“. Die aktuelle Störung sind die ersten `fehlerFolge` Einträge von `fehler` (neueste zuerst).
 */

const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });

/**
 * Bereiche des Postfachs, die der Stand öffnen kann, um eine Störung zu beheben (#1278, Schritt 5: nur diese zwei statt
 * aller Bereiche aus Postfaecher.tsx – so bindet der Stand das Postfach nicht ein).
 */
type Beheben = 'anbieter' | 'verbindung';

/** Aktuelle Störung: rot, mit Seit-Zeit, Zahl der Versuche, letztem Fehler, nächstem Versuch und dem Weg zur Abhilfe. */
function Gestoert({ p, aktuell, oeffne }: { p: PostfachAnsicht; aktuell: PostfachEreignis[]; oeffne: (b: Beheben) => void }) {
  const s = p.stand;
  // Wo man es behebt: abgelaufene oder fehlende OAuth-Anmeldung beim Anbieter, sonst die Verbindung.
  const beheben: Beheben = p.anmeldung === 'oauth' && p.oauth?.zustand !== 'ok' ? 'anbieter' : 'verbindung';
  const seit = aktuell[aktuell.length - 1]?.zeit;
  const laenger = s.fehlerFolge > 1 ? t('werkbank.postfaecher.nach-fehlern-mit-laengerem', { fehlerFolge: s.fehlerFolge }) : '';
  return (
    <div className="hinweis schlecht" data-zustand="gestoert">
      <p>
        <Symbol name="warnung" />{' '}
        {t('werkbank.postfaecher.zustand.gestoert', {
          seit: seit ? zeit(seit) : '–',
          anzahl: s.fehlerFolge,
          fehler: aktuell[0]?.fehler ?? '',
        })}
        {s.naechsterAbruf && <> {t('werkbank.postfaecher.zustand.naechster-versuch', { zeit: zeit(s.naechsterAbruf), laenger })}</>}
      </p>
      <Knopf onClick={() => oeffne(beheben)}>
        {beheben === 'anbieter' ? t('werkbank.postfaecher.zustand.zur-anmeldung') : t('werkbank.postfaecher.zustand.verbindung-pruefen')}
      </Knopf>
    </div>
  );
}

/** Ohne Störung: läuft (mit Zeiten), noch nicht abgerufen oder aus – in normaler Schrift. */
function Zustandssatz({ p }: { p: PostfachAnsicht }) {
  const s = p.stand;
  const naechster = s.naechsterAbruf ? zeit(s.naechsterAbruf) : undefined;
  if (!p.aktiv)
    return (
      <p className="zustandssatz" data-zustand="aus">
        {t('werkbank.postfaecher.zustand.aus')}
      </p>
    );
  if (!s.letzterAbruf)
    return (
      <p className="zustandssatz" data-zustand="neu">
        {naechster
          ? t('werkbank.postfaecher.zustand.noch-nicht-mit-naechstem', { naechster })
          : t('werkbank.postfaecher.zustand.noch-nicht')}
      </p>
    );
  return (
    <p className="zustandssatz" data-zustand="laeuft">
      <Symbol name="haken" />{' '}
      {naechster
        ? t('werkbank.postfaecher.zustand.laeuft-mit-naechstem', { zeit: zeit(s.letzterAbruf), naechster })
        : t('werkbank.postfaecher.zustand.laeuft', { zeit: zeit(s.letzterAbruf) })}
    </p>
  );
}

/** Kurzinfo im zugeklappten Bereich. */
function kurz(p: PostfachAnsicht, seit: string | undefined) {
  const s = p.stand;
  if (s.fehlerFolge > 0 && seit) return t('werkbank.postfaecher.zustand.gestoert-kurz', { seit: zeit(seit) });
  return s.letzterAbruf
    ? t('werkbank.postfaecher.zuletzt', { zeit: zeit(s.letzterAbruf) })
    : t('werkbank.postfaecher.noch-nicht-abgerufen');
}

export function PostfachStand({
  p,
  klappe,
  geaendert,
  abrufen,
  oeffne,
}: {
  p: PostfachAnsicht;
  klappe: Klappe;
  geaendert: boolean;
  abrufen: () => Promise<KnopfErgebnis | undefined>;
  oeffne: (b: Beheben) => void;
}) {
  const s = p.stand;
  const aktuell = s.fehler.slice(0, s.fehlerFolge);
  const frueher = s.fehler.slice(s.fehlerFolge);
  return (
    <Bereich id="stand" titel={t('werkbank.postfaecher.stand')} klappe={klappe} kurz={kurz(p, aktuell[aktuell.length - 1]?.zeit)}>
      {s.fehlerFolge > 0 ? <Gestoert p={p} aktuell={aktuell} oeffne={oeffne} /> : <Zustandssatz p={p} />}
      <div className="knoepfe">
        <Knopf
          gesperrt={geaendert && t('werkbank.postfaecher.erst-speichern')}
          onClick={abrufen}
          laeuftText={t('werkbank.postfaecher.rufe-ab')}>
          {t('werkbank.postfaecher.jetzt-abrufen')}
        </Knopf>
      </div>
      {s.uebernommen.length > 0 && (
        <>
          <h3 className="h4">{t('werkbank.postfaecher.zuletzt-uebernommen')}</h3>
          <ul>
            {s.uebernommen.map((u) => (
              <li key={`${u.zeit}-${u.mappeId}`}>
                {zeit(u.zeit)}:{' '}
                {u.mappeId ? (
                  <Link to={`/ablage/eingang/${u.mappeId}`} className="verweis">
                    {u.betreff || t('werkbank.postfaecher.ohne-betreff')}
                  </Link>
                ) : (
                  u.betreff
                )}{' '}
                <span className="leise">– {u.absender}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {frueher.length > 0 && (
        <details className="fruehere-stoerungen">
          <summary className="leise tippziel">{t('werkbank.postfaecher.fruehere-stoerungen', { anzahl: frueher.length })}</summary>
          <ul className="leise klein">
            {frueher.map((f) => (
              <li key={f.zeit}>
                {zeit(f.zeit)}: {f.fehler} –{' '}
                {f.behobenAm
                  ? t('werkbank.postfaecher.behoben-am', { zeit: zeit(f.behobenAm) })
                  : t('werkbank.postfaecher.seitdem-behoben')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Bereich>
  );
}
