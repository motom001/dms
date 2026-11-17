import { useState } from 'react';
import { betriebApi, type SicherungsPlan } from '../../api/betrieb';
import { t } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import { Speicherleiste, useEntwurf } from '../../Speicherleiste';
import { NOTFALLBLATT_SEITE } from '../../../../shared/src/werkbankansicht';
import { Feld, HakenFeld, Schalter, KnopfLink } from '../../bausteine';
import { TAGE } from './hilfen';

type SetzeP = (p: SicherungsPlan) => void;

export function Zeitplan({
  plan,
  notfallblatt,
  mitNotfallblatt,
  nurNeuesteMoeglich,
  gespeichert,
}: {
  plan: SicherungsPlan;
  notfallblatt: boolean;
  mitNotfallblatt: boolean;
  nurNeuesteMoeglich: boolean;
  gespeichert(): void;
}) {
  const [p, setP] = useState(plan);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const ent = useEntwurf(plan, p, {
    zuruecksetzen: () => {
      setP(plan);
      setMeldung(undefined);
    },
  });
  async function speichern() {
    setMeldung(undefined);
    setSendet(true);
    try {
      await betriebApi.sicherungPlan(p);
      setMeldung({ art: 'gut', text: t('werkbank.sicherung.gespeichert') });
      gespeichert();
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setSendet(false);
    }
  }
  return (
    <form
      className="blatt"
      id="zeitplan"
      onSubmit={(x) => {
        x.preventDefault();
        void speichern();
      }}
      onKeyDown={ent.tasten}>
      <h2 className="h3">
        {t('werkbank.sicherung.zeitplan-und-aufbewahrung')} <Hilfe ort="sicherung.zeitplan" />
      </h2>
      <Schalter
        an={p.aktiv}
        gesperrt={!p.aktiv && !notfallblatt}
        setze={(an) => setP({ ...p, aktiv: an })}
        beschriftung={t('werkbank.sicherung.schalter')}
      />
      {/* #993 (Thomas 10.11.2026): ohne das Wort „Notfallblatt“; der Link nur für die, die die Verschlüsselung verwalten. */}
      {!notfallblatt && !p.aktiv && (
        <p className="leise klein">
          {t('werkbank.sicherung.erst-wenn-verschluesselung-fertig')}{' '}
          {mitNotfallblatt ? (
            <KnopfLink to={NOTFALLBLATT_SEITE} groesse="klein">
              {t('werkbank.sicherung.zur-verschluesselung')}
            </KnopfLink>
          ) : (
            t('werkbank.sicherung.keine-berechtigung-verschluesselung')
          )}
        </p>
      )}
      {zeitFelder(p, setP)}
      {aufbewahrung(p, setP, nurNeuesteMoeglich)}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.sicherung.zeitplan')} sendet={sendet} />
    </form>
  );
}

/** Häufigkeit, Wochentag, Uhrzeit. */
function zeitFelder(p: SicherungsPlan, setP: SetzeP) {
  return (
    <div className="raster">
      <Feld beschriftung={t('werkbank.sicherung.haeufigkeit')}>
        <select value={p.haeufigkeit} onChange={(e) => setP({ ...p, haeufigkeit: e.target.value as SicherungsPlan['haeufigkeit'] })}>
          <option value="taeglich">{t('werkbank.sicherung.taeglich')}</option>
          <option value="woechentlich">{t('werkbank.sicherung.woechentlich')}</option>
        </select>
      </Feld>
      {p.haeufigkeit === 'woechentlich' && (
        <Feld beschriftung={t('werkbank.sicherung.wochentag')}>
          <select value={p.wochentag} onChange={(e) => setP({ ...p, wochentag: Number(e.target.value) })}>
            {TAGE.slice(1).map((text, i) => (
              <option key={text} value={i + 1}>
                {text}
              </option>
            ))}
          </select>
        </Feld>
      )}
      <Feld beschriftung={t('werkbank.sicherung.uhrzeit')}>
        <input type="time" value={p.uhrzeit} onChange={(e) => setP({ ...p, uhrzeit: e.target.value })} />
      </Feld>
    </div>
  );
}

/** Aufbewahrung: „Lokal nur die neueste“ (#1194), Zahl je Art, Mindest-Speicherplatz. */
function aufbewahrung(p: SicherungsPlan, setP: SetzeP, nurNeuesteMoeglich: boolean) {
  const a = p.aufbewahrung;
  // #1194: Nur mit erfolgreicher Kopie außer Haus wählbar und wirksam; ein schon gesetzter Haken lässt sich immer abwählen.
  const nurNeueste = !!p.nurNeueste && nurNeuesteMoeglich;
  const setA = (k: keyof typeof a, v: string) => setP({ ...p, aufbewahrung: { ...a, [k]: Math.max(0, Math.trunc(Number(v) || 0)) } });
  return (
    <>
      <p className="leise klein">{t('werkbank.sicherung.aufbewahrt-werden-die-neuesten')}</p>
      <HakenFeld
        beschriftung={t('werkbank.sicherung.extern.nurneueste')}
        hinweis={
          nurNeuesteMoeglich
            ? t('werkbank.sicherung.extern.nurneueste.hilfe')
            : [
                t('werkbank.sicherung.extern.nurneueste.hilfe'),
                <>
                  {t('werkbank.sicherung.extern.nurneueste.gesperrt')}{' '}
                  <a href="#ausser-haus" className="verweis">
                    {t('werkbank.sicherung.extern.nurneueste.dorthin')}
                  </a>
                </>,
              ]
        }>
        <input
          type="checkbox"
          checked={!!p.nurNeueste}
          disabled={!nurNeuesteMoeglich && !p.nurNeueste}
          onChange={(e) => setP({ ...p, nurNeueste: e.target.checked })}
        />
      </HakenFeld>
      {nurNeueste && <p className="leise klein">{t('werkbank.sicherung.extern.nurneueste.wirkt')}</p>}
      {!!p.nurNeueste && !nurNeuesteMoeglich && (
        <div className="hinweis warn">
          <p>{t('werkbank.sicherung.extern.nurneueste.wirkt-nicht')}</p>
        </div>
      )}
      <div className="raster">
        {p.haeufigkeit === 'taeglich' && (
          <Feld beschriftung={t('werkbank.sicherung.taegliche')}>
            <input
              type="number"
              min={0}
              max={366}
              value={a.taeglich}
              disabled={nurNeueste}
              onChange={(e) => setA('taeglich', e.target.value)}
            />
          </Feld>
        )}
        <Feld beschriftung={t('werkbank.sicherung.woechentliche')}>
          <input
            type="number"
            min={0}
            max={260}
            value={a.woechentlich}
            disabled={nurNeueste}
            onChange={(e) => setA('woechentlich', e.target.value)}
          />
        </Feld>
        <Feld beschriftung={t('werkbank.sicherung.monatliche')}>
          <input
            type="number"
            min={0}
            max={240}
            value={a.monatlich}
            disabled={nurNeueste}
            onChange={(e) => setA('monatlich', e.target.value)}
          />
        </Feld>
        <Feld
          beschriftung={t('werkbank.sicherung.mindest-speicherplatz-in-gb')}
          hinweis={t('werkbank.sicherung.darunter-beginnt-keine-sicherung')}>
          <input
            type="number"
            min={0}
            value={p.mindestFreiGB}
            onChange={(e) => setP({ ...p, mindestFreiGB: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          />
        </Feld>
      </div>
    </>
  );
}
