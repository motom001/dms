import { useState } from 'react';
import { Aufklapper, HakenFeld } from '../../bausteine';
import type { EntfallPlan, TeilPlan } from '../../../../shared/src/pakete';
import type { PaketVorschau } from '../../api/pakete';
import { t } from '../../sprache';
import type { VorschauZustand } from './zustand';

type Typ = PaketVorschau['typen'][number];
type Z = Pick<VorschauZustand, 'typErsetzen' | 'setTypErsetzen' | 'behalten' | 'setBehalten'>;

/** „Was“ eines Teils in Worten, z. B. „Titel-Vorlage, Beschreibung“. */
const was = (a: TeilPlan) => a.was.map((w) => t.frei(`werkbank.pakete.update.was.${w}`)).join(', ');
/** Ein Teil in Worten: „Mappentyp (Titel-Vorlage)“, „Feld „Datum“ (Beschriftung, Hilfe)“, „Register „Allgemein“ (Reihenfolge)“. */
const teil = (a: TeilPlan) => t.frei(`werkbank.pakete.update.teil.${a.art}`, { name: a.name, was: was(a) });

/** Ein entfallendes Feld in einem Satz (Kommentar Entwicklung an #1658: ohne Rückfrage, Werte in die Notiz). */
function entfallText(e: EntfallPlan): string {
  if (e.nach) return t('werkbank.pakete.update.umbenannt', { feld: e.label, nach: e.nach.label, anzahl: e.anzahl });
  return e.anzahl
    ? t('werkbank.pakete.update.entfaellt-werte', { feld: e.label, anzahl: e.anzahl })
    : t('werkbank.pakete.update.entfaellt', { feld: e.label });
}

const umschalten = (liste: string[], k: string, an: boolean) => (an ? [...liste, k] : liste.filter((x) => x !== k));

/**
 * Update eines vorhandenen Mappentyps (#1658): was sich ändert und was entfällt, je ein Satz; was die Verwaltung geändert
 * hat, bleibt – mit „Trotzdem …“. „Feld behalten“ gibt es nur aufgeklappt (Kommentar Entwicklung: für Fortgeschrittene).
 */
export function TypUpdateZeilen({ eintrag, z }: { eintrag: Typ; z: Z }) {
  const [offen, setOffen] = useState(false);
  const aen = eintrag.aenderungen ?? [];
  const weg = eintrag.entfaellt ?? [];
  if (!aen.length && !weg.length) return null;
  const neu = aen.filter((a) => a.zustand === 'aktualisiert');
  const entfaellt = weg.filter((e) => e.zustand === 'aktualisiert');
  const bleibt = [...aen.filter((a) => a.zustand !== 'aktualisiert'), ...weg.filter((e) => e.zustand !== 'aktualisiert')];
  const kennung = `typ-update-${eintrag.schluessel}`;
  return (
    <div className="stapel klein">
      {neu.length > 0 && <p>{t('werkbank.pakete.update.aendert', { liste: neu.map(teil).join('; ') })}</p>}
      {entfaellt.map((e) => (
        <p key={e.teil}>{entfallText(e)}</p>
      ))}
      {bleibt.map((b) => {
        const feld = 'key' in b;
        return (
          <div key={b.teil} className="stapel">
            <span className="leise">
              {t(b.zustand === 'geaendert' ? 'werkbank.pakete.update.bleibt' : 'werkbank.pakete.update.bleibt-unbekannt', {
                teil: feld ? t('werkbank.pakete.update.teil.entfaellt', { name: b.label }) : teil(b),
              })}
            </span>
            <HakenFeld beschriftung={feld ? t('werkbank.pakete.update.trotzdem-entfernen') : t('werkbank.pakete.update.trotzdem-ersetzen')}>
              <input
                type="checkbox"
                checked={z.typErsetzen.includes(b.teil)}
                onChange={(e) => z.setTypErsetzen(umschalten(z.typErsetzen, b.teil, e.target.checked))}
              />
            </HakenFeld>
          </div>
        );
      })}
      {entfaellt.length > 0 && (
        <section className="aufklappbereich">
          <Aufklapper offen={offen} steuert={kennung} umschalten={() => setOffen(!offen)}>
            <span>{t('werkbank.pakete.update.behalten-titel')}</span>
          </Aufklapper>
          {offen && (
            <div id={kennung} className="aufklappinhalt stapel">
              <p className="leise">{t('werkbank.pakete.update.behalten-text')}</p>
              {entfaellt.map((e) => (
                <HakenFeld key={e.teil} beschriftung={t('werkbank.pakete.update.behalten', { feld: e.label })}>
                  <input
                    type="checkbox"
                    checked={z.behalten.includes(e.teil)}
                    onChange={(ev) => z.setBehalten(umschalten(z.behalten, e.teil, ev.target.checked))}
                  />
                </HakenFeld>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
