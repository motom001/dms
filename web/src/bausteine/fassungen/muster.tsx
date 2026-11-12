import type { ReactNode } from 'react';
import type { FassungEintrag, FassungsListe, GeloeschterEintrag } from '../../../../shared/src/fassungen';
import { t } from '../../sprache';
import { Fassungen, GeloeschteEintraege, type FassungenQuelle } from './Fassungen';
import s from '../muster.module.css';

/**
 * Fassungen auf der Musterseite (#1006): eine Liste mit drei Fassungen (eine aus einem Paket, eine wiederhergestellt),
 * eine leere Liste und die gelöschten Einträge – ohne Server, mit einer festen Quelle. Wiederherstellen ändert nichts.
 */

const MARKUS = { art: 'person' as const, id: 'markus' };
const fassung = (nr: number, zeit: string, wer: string, aenderungen: string[], x: Partial<FassungEintrag> = {}): FassungEintrag =>
  ({ nr, zeit, bis: zeit, name: 'Vertrag', urheber: MARKUS, wer, wiederhergestellt: null, geloescht: null, aenderungen, aktuell: false, ...x });

const liste = (): FassungsListe => ({
  stand: '3@2026-11-12T09:14:00.000Z', gesamt: 3,
  fassungen: [
    fassung(3, '2026-11-12T09:14:00.000Z', 'Markus', [t('oberflaeche.muster.fassungen.wieder'), t('oberflaeche.muster.fassungen.feld-weg')], { wiederhergestellt: 1, aktuell: true }),
    fassung(2, '2026-11-12T08:02:00.000Z', 'Petra', [t('oberflaeche.muster.fassungen.feld-dazu'), t('oberflaeche.muster.fassungen.pflicht'), t('oberflaeche.muster.fassungen.spalte')]),
    fassung(1, '2026-11-10T07:30:00.000Z', t('oberflaeche.muster.fassungen.paket'), [t('oberflaeche.muster.fassungen.angelegt')], { urheber: { art: 'paket', id: 'vertraege', name: 'Verträge', version: '1.4.0' } }),
  ],
});
const GELOESCHT: GeloeschterEintrag[] = [{ art: 'typ', eintrag: 'alt', name: 'Kfz', nr: 4, geloescht: { zeit: '2026-11-11T16:20:00.000Z', urheber: MARKUS, wer: 'Markus' } }];

/** Feste Quelle: immer dieselben Fassungen; Vergleich und Vorschau nennen die Änderungen der Musterdaten. */
const QUELLE: FassungenQuelle = {
  liste: async (_a, e) => (e === 'leer' ? { fassungen: [], stand: null, gesamt: 0 } : liste()),
  vergleich: async (_a, _e, von, bis) => ({ von, bis, aenderungen: [t('oberflaeche.muster.fassungen.feld-dazu'), t('oberflaeche.muster.fassungen.pflicht')] }),
  vorschau: async (_a, _e, nr) => ({ nr, aenderungen: [t('oberflaeche.muster.fassungen.feld-dazu')], hinweise: [], stand: liste().stand }),
  wiederherstellen: async () => liste(),
  geloescht: async () => GELOESCHT,
};

const FEST = { offen: true, umschalten: () => {}, fest: true };

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

export function FassungenMuster() {
  return (
    <div className={s.raster}>
      <Karte zustand="fassungen-liste" titel={t('oberflaeche.muster.fassungen.liste')}>
        <Fassungen id="muster-fassungen" titel={t('oberflaeche.muster.fassungen.liste')} art="typ" eintrag="vertrag" klappe={FEST} nachher={() => {}} quelle={QUELLE} />
      </Karte>
      <Karte zustand="fassungen-leer" titel={t('oberflaeche.muster.fassungen.leer')}>
        <Fassungen id="muster-fassungen-leer" titel={t('oberflaeche.muster.fassungen.leer')} art="sicht" eintrag="leer" klappe={FEST} nachher={() => {}} quelle={QUELLE} />
      </Karte>
      <Karte zustand="fassungen-geloescht" titel={t('oberflaeche.muster.fassungen.geloescht')}>
        <GeloeschteEintraege art="typ" quelle={QUELLE} />
      </Karte>
    </div>
  );
}
