import { useState, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Feld, FeldGruppe, HakenFeld } from './Feld';
import s from '../muster.module.css';

/**
 * Feld auf der Musterseite (#967): jeder Zustand einmal, zum Ansehen und Ausprobieren. Die Rauchtests fotografieren
 * diesen Bereich und prüfen ihn mit axe (web/rauchtest/muster.mjs); `data-zustand` nutzen sie für Hover und Fokus.
 * Beispielwerte nur mit Persona-Namen und example.org.
 */

function Karte({ zustand, titel, children }: { zustand: string; titel: string; children: ReactNode }) {
  return (
    <div className={s.karte} data-zustand={zustand}>
      <h3 className={s.zustand}>{titel}</h3>
      {children}
    </div>
  );
}

const PLZ = /^\d{5}$/;

export function FeldMuster() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('lena@example.org');
  const [plz, setPlz] = useState('0106');
  const [gelesen, setGelesen] = useState(false);
  const [tage, setTage] = useState<string[]>(['mi']);
  const tag = (k: string) => (
    <label key={k} className="haken">
      <input type="checkbox" checked={tage.includes(k)} onChange={(e) => setTage(e.target.checked ? [...tage, k] : tage.filter((x) => x !== k))} />
      <span>{t.frei(`oberflaeche.muster.option.${k}`)}</span>
    </label>
  );
  return (
    <div className={s.raster}>
      <Karte zustand="leer" titel={t('oberflaeche.muster.zustand.leer')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.name')}><input type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></Feld>
      </Karte>
      <Karte zustand="gefuellt" titel={t('oberflaeche.muster.zustand.gefuellt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.email')}><input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Feld>
      </Karte>
      <Karte zustand="hinweis" titel={t('oberflaeche.muster.zustand.hinweis')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.kundennummer')} hinweis={t('oberflaeche.muster.hinweis.kundennummer')} hilfe="einrichtung.konto">
          <input type="text" autoComplete="off" defaultValue="" />
        </Feld>
      </Karte>
      <Karte zustand="optional" titel={t('oberflaeche.muster.zustand.optional')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.telefon')} optional><input type="tel" autoComplete="off" defaultValue="" /></Feld>
      </Karte>
      <Karte zustand="fehler" titel={t('oberflaeche.muster.zustand.fehler')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.plz')} fehler={PLZ.test(plz) ? null : t('oberflaeche.muster.fehler.plz')}>
          <input type="text" inputMode="numeric" autoComplete="off" value={plz} onChange={(e) => setPlz(e.target.value)} />
        </Feld>
      </Karte>
      <Karte zustand="gesperrt" titel={t('oberflaeche.muster.zustand.gesperrt')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.mappennummer')} hinweis={t('oberflaeche.muster.hinweis.mappennummer')}>
          <input type="text" disabled defaultValue="2027-0042" />
        </Feld>
      </Karte>
      <Karte zustand="nur-lesen" titel={t('oberflaeche.muster.zustand.nur-lesen')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.angelegt')}><input type="text" readOnly value="Jonas Beispiel" /></Feld>
      </Karte>
      <Karte zustand="auswahl" titel={t('oberflaeche.muster.zustand.auswahl')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.mappentyp')}>
          <select defaultValue="rechnung">
            <option value="rechnung">{t('oberflaeche.muster.option.rechnung')}</option>
            <option value="vertrag">{t('oberflaeche.muster.option.vertrag')}</option>
          </select>
        </Feld>
      </Karte>
      <Karte zustand="mehrzeilig" titel={t('oberflaeche.muster.zustand.mehrzeilig')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.notiz')} optional><textarea rows={3} defaultValue="" /></Feld>
      </Karte>
      <Karte zustand="haken" titel={t('oberflaeche.muster.zustand.haken')}>
        <HakenFeld beschriftung={t('oberflaeche.muster.beschriftung.erinnerung')} hinweis={t('oberflaeche.muster.hinweis.erinnerung')} hilfe="einrichtung.optional">
          <input type="checkbox" defaultChecked />
        </HakenFeld>
      </Karte>
      <Karte zustand="haken-fehler" titel={t('oberflaeche.muster.zustand.haken-fehler')}>
        <HakenFeld beschriftung={t('oberflaeche.muster.beschriftung.gelesen')} fehler={gelesen ? null : t('oberflaeche.muster.fehler.gelesen')}>
          <input type="checkbox" checked={gelesen} onChange={(e) => setGelesen(e.target.checked)} />
        </HakenFeld>
      </Karte>
      <Karte zustand="gruppe" titel={t('oberflaeche.muster.zustand.gruppe')}>
        <FeldGruppe beschriftung={t('oberflaeche.muster.beschriftung.wochentage')} hinweis={t('oberflaeche.muster.hinweis.wochentage')}>
          {['mo', 'mi', 'fr'].map(tag)}
        </FeldGruppe>
      </Karte>
      <Karte zustand="hover" titel={t('oberflaeche.muster.zustand.hover')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.ort')} hinweis={t('oberflaeche.muster.hinweis.ausprobieren')}><input type="text" autoComplete="off" defaultValue="" /></Feld>
      </Karte>
      <Karte zustand="fokus" titel={t('oberflaeche.muster.zustand.fokus')}>
        <Feld beschriftung={t('oberflaeche.muster.beschriftung.strasse')} hinweis={t('oberflaeche.muster.hinweis.ausprobieren')}><input type="text" autoComplete="off" defaultValue="" /></Feld>
      </Karte>
    </div>
  );
}
