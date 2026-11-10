import { useMemo, useState } from 'react';
import { TIPP_BEREICHE, type TippAnzeige } from '../../../shared/src/entdecken';
import { useDaten } from '../daten';
import { t } from '../sprache';
import { starteRundgang, tippHandlung, useEntdecken, zeigeZiel } from './stand';

/**
 * Seite „Ablago entdecken“ (#832), erreichbar über das Benutzermenü: Neu seit dem letzten Besuch (nur, wenn es etwas
 * gibt), Rundgänge und alle Tipps nach Bereich mit kleiner Suche – nur, was die Person nutzen darf. Ausgeblendete Tipps
 * bleiben hier sichtbar, auch wenn die Tipp-Zeile auf der Startseite aus ist.
 */
export function Entdecken() {
  const { stand, fehler } = useEntdecken(true);
  const d = useDaten();
  const [such, setSuch] = useState('');
  const woerter = such.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tipps = useMemo(() => (stand?.tipps ?? []).filter((x) => woerter.every((w) => x.text.toLowerCase().includes(w) || t.frei(`entdecken.bereich.${x.bereich}`).toLowerCase().includes(w))), [stand, woerter.join(' ')]); // eslint-disable-line react-hooks/exhaustive-deps -- Suchwörter als Text verglichen, nicht als neues Feld bei jedem Zeichnen
  const neu = (stand?.tipps ?? []).filter((x) => x.neu);

  return (
    <div className="einspaltig schmal entdecken">
      <div className="mappenkopf">
        <h1>{t('entdecken.menue')}</h1>
        <p className="leise">{t('entdecken.seite.einleitung')}</p>
      </div>
      {!stand ? <p className="leise">{fehler ? t('entdecken.seite.fehler') : t('entdecken.seite.lade')}</p> : <>
        {neu.length > 0 && (
          <section className="blatt" aria-labelledby="ent-neu">
            <h2 id="ent-neu" className="h3">{t('entdecken.seite.neu')}</h2>
            <ul className="ent-tipps">{neu.map((x) => <TippEintrag key={x.schluessel} x={x} />)}</ul>
          </section>
        )}
        {stand.rundgaenge.length > 0 && (
          <section className="blatt" aria-labelledby="ent-rundgaenge" data-anker="entdecken.rundgaenge">
            <h2 id="ent-rundgaenge" className="h3">{t('entdecken.seite.rundgaenge')}</h2>
            <ul className="ent-rundgaenge">
              {stand.rundgaenge.map((r) => (
                <li key={`${r.herkunft}:${r.schluessel}`}>
                  <div><strong>{r.titel}</strong><span className="leise klein"> · {t('entdecken.seite.schritte', { anzahl: r.schritte.length })}</span><br /><span className="leise">{r.beschreibung}</span></div>
                  <button type="button" className="knopf" onClick={() => starteRundgang(r.schluessel)}>{t('entdecken.seite.starten')}</button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="blatt" aria-labelledby="ent-tipps">
          <h2 id="ent-tipps" className="h3">{t('entdecken.seite.tipps')}</h2>
          {d.einstellungen.tipps === false && <p className="leise klein">{t('entdecken.seite.aus')}</p>}
          {stand.tipps.length > 0 && (
            <label className="ent-suche"><span className="sr">{t('entdecken.seite.suche')}</span>
              <input type="search" value={such} onChange={(e) => setSuch(e.target.value)} placeholder={t('entdecken.seite.suche')} autoComplete="off" /></label>
          )}
          {!stand.tipps.length ? <p className="leise">{t('entdecken.seite.keine-tipps')}</p>
            : !tipps.length ? <p className="leise" role="status">{t('entdecken.seite.suche.leer', { such: such.trim() })}</p>
            : TIPP_BEREICHE.map((b) => {
              const hier = tipps.filter((x) => x.bereich === b);
              if (!hier.length) return null;
              return (
                <div key={b} className="ent-gruppe">
                  <h3 className="ueber">{t.frei(`entdecken.bereich.${b}`)}</h3>
                  <ul className="ent-tipps">{hier.map((x) => <TippEintrag key={x.schluessel} x={x} />)}</ul>
                </div>
              );
            })}
        </section>
      </>}
    </div>
  );
}

/** Ein Tipp: der Satz ist der Link (wie auf der Startseite); ausgeblendete tragen den Hinweis und „Wieder zeigen“. */
function TippEintrag({ x }: { x: TippAnzeige }) {
  return (
    <li className={x.ausgeblendet ? 'ent-aus' : undefined}>
      <a href={x.ziel?.seite ?? '/entdecken'} className="tipp-satz" onClick={(e) => { e.preventDefault(); void zeigeZiel(x); }}>{x.text}</a>
      {x.ausgeblendet && <>
        {' '}<span className="chip">{t('entdecken.seite.ausgeblendet')}</span>{' '}
        <button type="button" className="textknopf klein" title={t('entdecken.seite.einblenden.titel')} onClick={() => void tippHandlung(x.schluessel, 'einblenden')}>{t('entdecken.seite.einblenden')}</button>
      </>}
    </li>
  );
}
