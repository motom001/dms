import { STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import { Feld, HakenFeld } from '../bausteine';
import { t } from '../sprache';

/**
 * „Verkleinert senden“ (#393) beim Weitergeben (Export, E-Mail, Herunterladen mit Stempel): PDFs gehen als
 * verkleinerte Kopie hinaus, das gespeicherte Dokument bleibt unverändert. null = nicht verkleinern.
 */
export function VerkleinertWahl({ wert, setze, wie = 'senden', id }: { wert: Stufe | null; setze(s: Stufe | null): void; wie?: 'senden' | 'exportieren' | 'herunterladen'; id: string }) {
  return (
    <div className="verkleinertwahl">
      <HakenFeld id={id} beschriftung={t(`ablage.verkleinertwahl.wie.${wie}`)} hinweis={t('ablage.verkleinertwahl.hinweis')} hilfe="versenden.verkleinert">
        <input type="checkbox" checked={!!wert} onChange={(e) => setze(e.target.checked ? 'standard' : null)} />
      </HakenFeld>
      {wert && (
        <Feld beschriftung={t('ablage.verkleinertwahl.stufe')}>
          <select value={wert} onChange={(e) => setze(e.target.value as Stufe)}>
            {STUFEN_LISTE.map((s) => <option key={s} value={s}>{t('ablage.verkleinertwahl.dpi', { name: STUFEN[s].name, dpi: STUFEN[s].dpi })}</option>)}
          </select>
        </Feld>
      )}
    </div>
  );
}
