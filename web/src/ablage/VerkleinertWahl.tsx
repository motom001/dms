import { STUFEN, STUFEN_LISTE, type Stufe } from '../../../shared/src/verkleinern';
import { Hilfe } from '../Hilfe';

/**
 * „Verkleinert senden“ (#393) beim Weitergeben (Export, E-Mail, Herunterladen mit Stempel): PDFs gehen als
 * verkleinerte Kopie hinaus, das gespeicherte Dokument bleibt unverändert. null = nicht verkleinern.
 */
export function VerkleinertWahl({ wert, setze, wie = 'senden', id }: { wert: Stufe | null; setze(s: Stufe | null): void; wie?: 'senden' | 'exportieren' | 'herunterladen'; id: string }) {
  return (
    <div className="verkleinertwahl">
      <label className="haken" htmlFor={id}>
        <input id={id} type="checkbox" checked={!!wert} onChange={(e) => setze(e.target.checked ? 'standard' : null)} />
        <span>PDFs verkleinert {wie} <span className="leise klein">– Bilder heruntergerechnet, das gespeicherte Dokument bleibt, wie es ist</span></span>
      </label>
      {wert && (
        <label className="inline klein">Stufe{' '}
          <select value={wert} onChange={(e) => setze(e.target.value as Stufe)} aria-label="Stufe beim Verkleinern">
            {STUFEN_LISTE.map((s) => <option key={s} value={s}>{STUFEN[s].name} (≈ {STUFEN[s].dpi} dpi)</option>)}
          </select>
        </label>
      )}
      <Hilfe ort="versenden.verkleinert" />
    </div>
  );
}
