import { useState } from 'react';
import { sucheApi } from '../../api/suche';
import { Feld, Knopf } from '../../bausteine';
import { t } from '../../sprache';
import type { TexterkennungZustand } from './zustand';

/** Vorgabe wie auf dem Server (volltext/texterkennung.ts, OCR_STANDARD). */
const VORGABE = { minuten: 5, jeSeiteSekunden: 30 };

/**
 * Zeitgrenze je Auftrag (#1550): Grundwert in Minuten plus Sekunden je Seite. Läuft ein Auftrag länger, bricht Ablago
 * ihn ab („fehlgeschlagen – Zeitgrenze“, mit „Erneut versuchen“), und der nächste startet.
 */
export function Zeitgrenze({ t: eintrag }: { t: TexterkennungZustand }) {
  const s = eintrag.stand!;
  const gespeichert = s.einstellungen.zeitgrenze ?? VORGABE;
  const [z, setZ] = useState(gespeichert);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const zahl = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));
  return (
    <form
      className="blatt stapel"
      id="zeitgrenze"
      onSubmit={(e) => {
        e.preventDefault();
        setSendet(true);
        setMeldung(undefined);
        sucheApi
          .texterkennungSpeichern({ ...s.einstellungen, zeitgrenze: z })
          .then((neu) => {
            eintrag.setStand(neu);
            setMeldung({ art: 'gut', text: t('werkbank.texterkennung.zeitgrenze.gespeichert') });
          })
          .catch((x: Error) => setMeldung({ art: 'schlecht', text: x.message }))
          .finally(() => setSendet(false));
      }}>
      <h2 className="h3">{t('werkbank.texterkennung.zeitgrenze')}</h2>
      <p className="leise klein">{t('werkbank.texterkennung.zeitgrenze.text')}</p>
      <div className="raster">
        <Feld beschriftung={t('werkbank.texterkennung.zeitgrenze.minuten')}>
          <input type="number" min={1} max={240} value={z.minuten} onChange={(e) => setZ({ ...z, minuten: zahl(e.target.value) })} />
        </Feld>
        <Feld beschriftung={t('werkbank.texterkennung.zeitgrenze.je-seite')}>
          <input
            type="number"
            min={0}
            max={600}
            value={z.jeSeiteSekunden}
            onChange={(e) => setZ({ ...z, jeSeiteSekunden: zahl(e.target.value) })}
          />
        </Feld>
      </div>
      <div className="knoepfe">
        <Knopf type="submit" laeuft={sendet}>
          {t('werkbank.texterkennung.zeitgrenze.speichern')}
        </Knopf>
      </div>
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </form>
  );
}
