import type { ErkennungStand } from '../api/suche';
import { Hilfe } from '../Hilfe';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { HakenFeld } from '../bausteine';

/** Bestätigung des Datenabflusses (#511), wenn ein Paket mit Netzzugriff die Erkennung übernehmen soll. */
export async function abflussBestaetigen(paket: string): Promise<boolean> {
  return rueckfrage({ titel: t('erkennung.abfluss.titel'), text: t('erkennung.abfluss.text', { paket }), ja: t('erkennung.abfluss.ja') });
}

/**
 * Werkbank → Pakete → Paket mit dms:erkennen → Einstellungen (#511, #996 Feldart `erkennung_standard`): als Standard
 * für „Aus Dokument ausfüllen“ nutzen. Gespeichert wird mit dem Knopf des Reiters; ein Paket mit Netzzugriff erst nach
 * der Bestätigung des Datenabflusses (beim Speichern).
 */
export function ErkennungFeld({ paket, s, wert, setze }: { paket: string; s: ErkennungStand; wert: boolean; setze: (v: boolean) => void }) {
  const ich = s.pakete.find((p) => p.id === paket);
  return (
    <>
      <p className="leise klein">{t('erkennung.werkbank.text')} <Hilfe ort="pakete.erkennung" /></p>
      <HakenFeld beschriftung={t('erkennung.werkbank.standard')} hinweis={t('erkennung.werkbank.standard.hilfe')}>
        <input type="checkbox" checked={wert} onChange={(e) => setze(e.target.checked)} />
      </HakenFeld>
      {ich && !ich.laeuft && <p className="leise klein">{t('erkennung.werkbank.laeuft-nicht')}</p>}
    </>
  );
}

/**
 * Werkbank → Pakete → Paket mit dms:klassifizieren (#939): wann es bei „Wohin gehört das?“ mitredet. Ein Paket mit Netz
 * nur, wenn es oben als Standard für „Aus Dokument ausfüllen“ gewählt ist (mit bestätigtem Datenabfluss); ohne Netz immer.
 */
export function KlassifizierenBlock({ netz }: { netz: boolean }) {
  return (
    <>
      <h2 className="h3">{t('erkennung.klassifizieren.titel')} <Hilfe ort="pakete.klassifizieren" /></h2>
      <p className="leise klein">{netz ? t('erkennung.klassifizieren.netz') : t('erkennung.klassifizieren.lokal')}</p>
    </>
  );
}
