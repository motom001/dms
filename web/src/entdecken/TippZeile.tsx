import { useEffect, useRef, useState } from 'react';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { tippHandlung, useAktiverRundgang, useEntdecken, zeigeZiel } from './stand';

/**
 * Tipp des Tages (#832): eine leise Zeile unter „Frag deine Ablage“ – normale Textfarbe, kein Symbol, kein Rahmen,
 * keine Bewegung. Der Satz selbst ist der Link (Stelle zeigen oder Rundgang starten); rechts nur ein kleines ×.
 * Nach dem × steht einmal „Ausgeblendet · Keine Tipps mehr zeigen“. Höchstens ein Tipp am Tag – das entscheidet der
 * Server (`tippDesTages`); er merkt sich je Person, was gezeigt, angeklickt und ausgeblendet wurde.
 */
export function TippZeile() {
  const { stand } = useEntdecken(true);
  const d = useDaten();
  const [weg, setWeg] = useState<'ausgeblendet' | 'aus' | 'erledigt' | null>(null);
  const gemeldet = useRef<string | null>(null);
  // Nicht neben dem Rundgang: Solange er läuft oder gleich von selbst startet, kommt kein Tipp (#831, #832).
  const rundgang = useAktiverRundgang();
  const x = stand?.tipp && !rundgang && !stand.starten ? stand.tipps.find((y) => y.schluessel === stand.tipp!.schluessel) : undefined;
  useEffect(() => {
    if (x && gemeldet.current !== x.schluessel) { gemeldet.current = x.schluessel; void tippHandlung(x.schluessel, 'gezeigt'); }
  }, [x]);
  if (weg === 'ausgeblendet') {
    return (
      <p className="tipp-zeile" data-anker="startseite.tipp" role="status">
        <span className="leise">{t('entdecken.zeile.ausgeblendet')}</span>{' · '}
        <button type="button" className="textknopf" onClick={() => { d.setzeEinstellung('tipps', false); setWeg('aus'); }}>{t('entdecken.zeile.keine-mehr')}</button>
      </p>
    );
  }
  if (!x || !stand?.tippsAn || d.einstellungen.tipps === false || weg) return null;
  const weitere = stand.tipp?.weitere ?? 0;
  return (
    <p className="tipp-zeile" data-anker="startseite.tipp">
      <span className="sr">{t('entdecken.zeile.titel')}: </span>
      <a href={x.ziel?.seite ?? '/entdecken'} className="tipp-satz" onClick={(e) => { e.preventDefault(); setWeg('erledigt'); void tippHandlung(x.schluessel, 'erledigt'); void zeigeZiel(x); }}>
        {x.neu ? t('entdecken.zeile.neu', { text: x.text }) : x.text}
      </a>
      {x.neu && weitere > 0 && <>{' '}<Link to="/entdecken" className="tipp-weitere">{t('entdecken.zeile.weitere', { anzahl: weitere })}</Link></>}
      <button type="button" className="tipp-weg" aria-label={t('entdecken.zeile.ausblenden')} title={t('entdecken.zeile.ausblenden')}
        onClick={() => { setWeg('ausgeblendet'); void tippHandlung(x.schluessel, 'ausblenden'); }}><Symbol name="schliessen" /></button>
    </p>
  );
}
