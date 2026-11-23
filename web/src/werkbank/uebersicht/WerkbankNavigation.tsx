import { useState } from 'react';
import { Link } from '../../ort';
import { t } from '../../sprache';
import { Knopf, Suchfeld, Zahl } from '../../bausteine';
import { HandyBereiche } from './HandyBereiche';
import { bereichPasst, GRUPPEN, type Gruppe } from '../../../../shared/src/werkbankansicht';

/* ---------- Leiste mit Gruppen (#68) ---------- */

export interface WerkbankEintrag {
  pfad: string;
  name: string;
  gruppe: Gruppe | null;
  zahl?: number;
  warn?: string | number;
  warnTitel?: string;
}

/**
 * Leiste der Werkbank. Ausgeblendete Bereiche (#281) fehlen – außer dem offenen und solchen mit Hinweis.
 * Unten: wie viele ausgeblendet sind, zum Aufklappen, und der Weg zu „Werkbank anpassen“.
 * `laedt`: Die gewählte Stufe und die Einblendungen (#987) kommen noch; die Leiste sagt das mit `aria-busy` (#1409).
 * Bis dahin steht nur die Übersicht da (sie ist immer sichtbar) und darunter eine leise Zeile – vorher zeigte die Leiste
 * kurz alle Bereiche und schrumpfte danach (#1418). So bleibt die Übersicht oben stehen; die Suche findet ohnehin auch
 * ausgeblendete Bereiche.
 * `handy` (#1204, schmaler Bildschirm): die Bereiche als eigener Schritt – Überschrift, Suche, oben der Handy-Schwerpunkt,
 * darunter „Alle Bereiche“ mit den Gruppen als Reiter (`HandyBereiche`); `gruppe` aus `?bereiche=<gruppe>`.
 */
export function WerkbankNavigation({
  bereich,
  eintraege,
  zeigen = () => true,
  benutzt: eingerichtet = [],
  laedt = false,
  handy = null,
}: {
  bereich: string;
  eintraege: WerkbankEintrag[];
  zeigen?: (pfad: string) => boolean;
  benutzt?: string[];
  laedt?: boolean;
  handy?: { gruppe: Gruppe | null } | null;
}) {
  const [alleZeigen, setAlleZeigen] = useState(false);
  // Werkbank-Suche (#725): findet Bereiche unter neuem und altem Namen, auch ausgeblendete.
  const [suche, setSuche] = useState('');
  const treffer = suche.trim() ? eintraege.filter((e) => bereichPasst(e.pfad, suche)) : null;
  const ausgeblendet = eintraege.filter((e) => e.pfad !== 'uebersicht' && !zeigen(e.pfad));
  const sichtbar = (e: WerkbankEintrag) => alleZeigen || zeigen(e.pfad) || e.pfad === bereich || !!e.warn;
  const liste = inDerLeiste(eintraege, laedt, sichtbar);
  const gruppen = (Object.keys(GRUPPEN) as Gruppe[]).filter((g) => liste.some((e) => e.gruppe === g));
  const eintrag = (e: WerkbankEintrag) => navEintrag(e, bereich, zeigen);
  const benutzt = ausgeblendet.filter((e) => eingerichtet.includes(e.pfad)).length;
  return (
    <>
      {handy && <h1 className="wb-bereiche-titel">{t('werkbank.uebersicht.bereiche-der-werkbank')}</h1>}
      <nav className="sichtliste werkbankleiste" aria-busy={laedt || undefined}>
        <Suchfeld
          className="werkbanksuche"
          wert={suche}
          setze={setSuche}
          platzhalter={t('werkbank.suche.platzhalter')}
          beschriftung={t('werkbank.suche.label')}
        />
        {treffer &&
          (treffer.length ? (
            <div className="wbgruppe">
              {treffer.map((e) => (
                <span key={e.pfad} className="wbtreffer">
                  {eintrag(e)}
                  {e.gruppe && <span className="leise klein">{GRUPPEN[e.gruppe]}</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="leise klein">{t('werkbank.suche.nichts')}</p>
          ))}
        {!treffer && handy && <HandyBereiche liste={liste} gruppe={handy.gruppe} eintrag={eintrag} />}
        {!treffer &&
          !handy &&
          liste
            .filter((e) => !e.gruppe)
            .map((e) => (
              <div key={e.pfad} className="wbgruppe ohne">
                {eintrag(e)}
              </div>
            ))}
        {ladezeile(laedt, treffer)}
        {!treffer &&
          !handy &&
          gruppen.map((g) => (
            <div key={g} className="wbgruppe">
              <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
              {liste.filter((e) => e.gruppe === g).map(eintrag)}
            </div>
          ))}
        <p className="ausgeblendet-fuss leise klein">
          {ausgeblendet.length > 0 && (
            <>
              <Knopf groesse="klein" aria-expanded={alleZeigen} onClick={() => setAlleZeigen(!alleZeigen)}>
                {alleZeigen
                  ? t('werkbank.uebersicht.ausgeblendete-verbergen')
                  : t('werkbank.uebersicht.bereiche-ausgeblendet', {
                      anzahl: ausgeblendet.length,
                      wert: benutzt ? t('werkbank.uebersicht.davon-eingerichtet', { benutzt }) : '',
                    })}
              </Knopf>
              {' · '}
            </>
          )}
          <Link to="/werkbank/ansicht" className="verweis" anker="werkbank.anpassen">
            {t('werkbank.uebersicht.werkbank-anpassen')}
          </Link>
        </p>
      </nav>
    </>
  );
}

/** Einträge der Leiste; solange die Stufe lädt (#1418), nur die Übersicht – sie ist immer sichtbar. */
function inDerLeiste(eintraege: WerkbankEintrag[], laedt: boolean, sichtbar: (e: WerkbankEintrag) => boolean) {
  return eintraege.filter(laedt ? (e) => e.pfad === 'uebersicht' : sichtbar);
}

/** Leise Zeile statt der Bereiche, solange die Stufe lädt (#1418) – nicht bei Suchtreffern. */
function ladezeile(laedt: boolean, treffer: WerkbankEintrag[] | null) {
  if (!laedt || treffer) return null;
  return <p className="leise klein werkbankleiste-laedt">{t('werkbank.uebersicht.bereiche-laden')}</p>;
}

/** Ein Bereich in der Leiste: Name, Hinweis oder Zahl; ausgeblendete mit Titel. */
function navEintrag(e: WerkbankEintrag, bereich: string, zeigen: (pfad: string) => boolean) {
  const aus = !zeigen(e.pfad);
  return (
    <Link
      key={e.pfad}
      anker={`werkbank.bereich:${e.pfad}`}
      to={e.pfad === 'uebersicht' ? '/werkbank' : `/werkbank/${e.pfad}`}
      className={`sicht ${bereich === e.pfad ? 'an' : ''} ${aus ? 'ausgeblendet' : ''}`}
      title={aus ? (e.warn ? t('werkbank.uebersicht.ausgeblendet-steht-hier-wegen') : t('werkbank.uebersicht.ausgeblendet')) : undefined}>
      <span className="nm">{e.name}</span>
      {/* Gelb nur für Warnungen; Mengen leise grau, auch die 0 (#1287, Leitsatz 9). */}
      {e.warn ? (
        <Zahl wert={e.warn} art="warnung" title={e.warnTitel} beschriftung={e.warnTitel ? `${e.warn} – ${e.warnTitel}` : undefined} />
      ) : e.zahl !== undefined ? (
        <Zahl wert={e.zahl} />
      ) : null}
    </Link>
  );
}
