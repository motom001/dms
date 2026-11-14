import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { FilterHaken, Fundstellen, Hervorgehoben, KeineTreffer, ListenSuche, PaketFilter, Suchfeld, useListenSuche } from './Suche';
import { KopfSuche } from './KopfSuche';
import s from '../muster.module.css';

/**
 * Suche auf der Musterseite (#978, #994): Suchfeld leer und gefüllt, das Muster „Suchfeld oben, Filter darunter“ mit
 * einer kleinen Liste zum Ausprobieren (Fundstellen, Paketfilter) und der leere Zustand. Beispiele ohne echte Daten.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

interface Beispiel { id: string; name: string; feld: string; hilfe: string; paket: string | null }
const beispiele = (): Beispiel[] => [
  { id: 'vertrag', name: t('oberflaeche.muster.suche.vertrag'), feld: t('oberflaeche.muster.suche.kuendigen'), hilfe: t('oberflaeche.muster.suche.kuendigen.hilfe'), paket: 'haushalt' },
  { id: 'rechnung', name: t('oberflaeche.muster.suche.rechnung'), feld: t('oberflaeche.muster.suche.faellig'), hilfe: t('oberflaeche.muster.suche.faellig.hilfe'), paket: null },
];

function Liste() {
  const liste = beispiele();
  const z = useListenSuche(liste, {
    quellen: (b) => [{ wo: '', text: b.name, titel: true }, { wo: t('oberflaeche.muster.suche.feld'), text: b.feld }, { wo: t('oberflaeche.muster.suche.hilfetext', { name: b.feld }), text: b.hilfe }],
    herkunft: (b) => b.paket,
  });
  const [nurAktive, setNurAktive] = useState(false);
  return (
    <>
      <ListenSuche wert={z.eingabe} setze={z.setEingabe} beschriftung={t('oberflaeche.muster.suche.beschriftung')} platzhalter={t('oberflaeche.muster.suche.platzhalter')}
        treffer={z.treffer.length} aktiv={z.aktiv || nurAktive} anzahl={t('oberflaeche.muster.suche.anzahl', { anzahl: liste.length })}
        filter={<>
          <PaketFilter wert={z.paket} setze={z.setPaket} pakete={[{ id: 'haushalt', name: t('oberflaeche.muster.suche.paket') }]} eigene={z.eigeneDa} />
          <FilterHaken an={nurAktive} setze={setNurAktive}>{t('oberflaeche.muster.suche.haken')}</FilterHaken>
        </>} />
      {!z.treffer.length ? <KeineTreffer zuruecksetzen={() => { z.zuruecksetzen(); setNurAktive(false); }} /> : (
        <ul className="mappenliste">
          {z.treffer.map((x) => (
            <li key={x.eintrag.id}><span className="eintrag werk">
              <span className="titel"><Hervorgehoben teile={x.titel} text={x.eintrag.name} /></span>
              <Fundstellen funde={x.funde} />
            </span></li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Suchfeld der Kopfzeile (#1218): ohne Bereich und in einer Ansicht mit Chip und „Suchen in ▾“. */
function KopfMuster() {
  const [wert, setWert] = useState('');
  const [inAnsicht, setInAnsicht] = useState('');
  const [bereich, setBereich] = useState(true);
  const [haken, setHaken] = useState({ text: true, notizen: false });
  return (
    <>
      <Karte zustand="kopf-leer" titel={t('oberflaeche.muster.suche.kopf')}>
        <KopfSuche wert={wert} setze={setWert} beschriftung={t('oberflaeche.muster.suche.kopf.beschriftung')} platzhalter={t('oberflaeche.muster.suche.kopf.platzhalter')} tastenkuerzel={false} />
      </Karte>
      <Karte zustand="kopf-bereich" titel={t('oberflaeche.muster.suche.kopf.bereich')}>
        <KopfSuche wert={inAnsicht} setze={setInAnsicht} tastenkuerzel={false}
          beschriftung={bereich ? t('oberflaeche.muster.suche.kopf.bereich-beschriftung') : t('oberflaeche.muster.suche.kopf.beschriftung')}
          platzhalter={bereich ? t('oberflaeche.muster.suche.kopf.bereich-platzhalter') : t('oberflaeche.muster.suche.kopf.platzhalter')}
          bereich={bereich ? { text: t('oberflaeche.muster.suche.kopf.chip'), weg: () => setBereich(false) } : null}
          suchenIn={bereich ? { text: t('oberflaeche.muster.suche.kopf.suchen-in'), inhalt: <>
            <FilterHaken an={haken.text} setze={(an) => setHaken({ ...haken, text: an })}>{t('oberflaeche.muster.suche.kopf.text')}</FilterHaken>
            <FilterHaken an={haken.notizen} setze={(an) => setHaken({ ...haken, notizen: an })}>{t('oberflaeche.muster.suche.kopf.notizen')}</FilterHaken>
          </> } : null} />
      </Karte>
    </>
  );
}

export function SucheMuster() {
  const [leer, setLeer] = useState('');
  const [voll, setVoll] = useState(t('oberflaeche.muster.suche.wort'));
  return (
    <div className={s.raster}>
      <Karte zustand="suche-leer" titel={t('oberflaeche.muster.zustand.leer')}>
        <Suchfeld wert={leer} setze={setLeer} beschriftung={t('oberflaeche.muster.suche.beschriftung')} platzhalter={t('oberflaeche.muster.suche.platzhalter')} />
      </Karte>
      <Karte zustand="suche-gefuellt" titel={t('oberflaeche.muster.suche.gefuellt')}>
        <Suchfeld wert={voll} setze={setVoll} beschriftung={t('oberflaeche.muster.suche.beschriftung')} platzhalter={t('oberflaeche.muster.suche.platzhalter')} />
      </Karte>
      <Karte zustand="suche-liste" titel={t('oberflaeche.muster.suche.liste')}>
        <Liste />
      </Karte>
      <Karte zustand="suche-keine" titel={t('oberflaeche.muster.suche.keine')}>
        <KeineTreffer zuruecksetzen={() => {}} />
      </Karte>
      <KopfMuster />
    </div>
  );
}
