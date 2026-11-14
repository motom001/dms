import { t } from '../sprache';
import { useEffect, useState } from 'react';
import { BUNDESLAENDER, type Bundesland } from '../../../shared/src/feiertage';
import { api, type Zusammenfassung } from '../api';
import { Feld, FeldGruppe, HakenFeld, Schalter } from '../bausteine';

/** Profil: tägliche Zusammenfassung der Aufgaben – an/aus, Uhrzeit, Wochentage, Feiertage (#54, #92, #94). */
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const UHRZEITEN = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

export function ZusammenfassungEinstellen() {
  const [z, setZ] = useState<Zusammenfassung | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [gespeichert, setGespeichert] = useState(false);
  useEffect(() => { api.zusammenfassung().then(setZ, (e: Error) => setFehler(e.message)); }, []);
  async function setze(n: Partial<Zusammenfassung>) {
    if (!z) return;
    const neu = { ...z, ...n };
    setZ(neu); setFehler(undefined); setGespeichert(false);
    try { setZ(await api.zusammenfassungSetzen({ aktiv: neu.aktiv, uhrzeit: neu.uhrzeit, tage: neu.tage, feiertage: neu.feiertage })); setGespeichert(true); }
    catch (e) { setFehler((e as Error).message); setZ(z); }
  }
  if (!z) return fehler ? <p className="fehlertext">{fehler}</p> : <p className="leise">{t('profil.zusammenfassung.lade')}</p>;
  const land = z.standard.bundesland ? BUNDESLAENDER[z.standard.bundesland as Bundesland] : null;
  return (
    <>
      <Schalter an={z.aktiv} setze={(an) => setze({ aktiv: an })} beschriftung={t('profil.zusammenfassung.taegliche-zusammenfassung-meiner')} />
      {z.aktiv && <div className="zusammenfassung">
        <Feld className="schmal" beschriftung={t('profil.zusammenfassung.uhrzeit')}>
          <select value={z.uhrzeit ?? ''} onChange={(e) => void setze({ uhrzeit: e.target.value || null })}>
            <option value="">{t('profil.zusammenfassung.standard-uhr', { uhrzeit: z.standard.uhrzeit })}</option>
            {UHRZEITEN.map((u) => <option key={u} value={u}>{t('profil.zusammenfassung.uhr', { u })}</option>)}
          </select></Feld>
        <FeldGruppe className="tagewahl" beschriftung={t('profil.zusammenfassung.wochentage')}>
          {TAGE.map((text, i) => (
            <label key={text} className="haken"><input type="checkbox" checked={z.tage.includes(i + 1)}
              onChange={(e) => void setze({ tage: e.target.checked ? [...z.tage, i + 1].sort() : z.tage.filter((x) => x !== i + 1) })} /><span>{text}</span></label>
          ))}
        </FeldGruppe>
        {!z.tage.length && <p className="hinweis warn klein">{t('profil.zusammenfassung.kein-wochentag-gewaehlt-die')}</p>}
        <HakenFeld beschriftung={t('profil.zusammenfassung.nicht-an-feiertagen')} hinweis={land ? t('profil.zusammenfassung.gesetzliche-feiertage-in', { land }) : t('profil.zusammenfassung.dafuer-muss-in-der')}>
          <input type="checkbox" disabled={!land} checked={!!land && z.feiertage} onChange={(e) => void setze({ feiertage: e.target.checked })} /></HakenFeld>
        {!z.versand && <p className="leise klein">{t('profil.zusammenfassung.der-e-mail-versand')}</p>}
      </div>}
      {fehler && <p className="fehlertext">{fehler}</p>}
      {gespeichert && <p className="gutertext" role="status">{t('profil.zusammenfassung.gespeichert')}</p>}
    </>
  );
}
