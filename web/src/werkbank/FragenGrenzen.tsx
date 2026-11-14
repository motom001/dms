import { useEffect, useState } from 'react';
import { FRAGEN_BEREICH, FRAGEN_STANDARD, type FragenGrenzen } from '../../../shared/src/fragen';
import { ApiFehler } from '../api/anfrage';
import { sucheApi } from '../api/suche';
import { Feld, Knopf } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';

/**
 * Werkbank → Pakete → Paket mit dms:antworten (#444): Höchstmenge je Frage für „Frag deine Ablage“ –
 * wie viele Ausschnitte und wie viele Zeichen das DMS dem Paket höchstens mitgibt.
 */
export function FragenGrenzenBlock() {
  const [g, setG] = useState<FragenGrenzen | null>(null);
  const [eingabe, setEingabe] = useState<{ ausschnitte: string; zeichen: string }>({ ausschnitte: '', zeichen: '' });
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [laeuft, setLaeuft] = useState(false);
  const uebernimm = (x: FragenGrenzen) => { setG(x); setEingabe({ ausschnitte: String(x.ausschnitte), zeichen: String(x.zeichen) }); };
  useEffect(() => { sucheApi.fragenStand().then((s) => uebernimm(s.grenzen), (e) => setMeldung({ art: 'schlecht', text: (e as Error).message })); }, []);
  if (!g) return meldung ? <p className="fehlertext">{meldung.text}</p> : null;
  async function speichern() {
    setLaeuft(true); setFehler({}); setMeldung(undefined);
    try { const s = await sucheApi.fragenGrenzen({ ausschnitte: Number(eingabe.ausschnitte), zeichen: Number(eingabe.zeichen) }); uebernimm(s.grenzen); setMeldung({ art: 'gut', text: t('fragen.werkbank.gespeichert') }); }
    catch (e) {
      const ff = e instanceof ApiFehler ? (e.details as { felderFehler?: Record<string, string> } | undefined)?.felderFehler : undefined;
      if (ff) setFehler(ff);
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally { setLaeuft(false); }
  }
  const feld = (k: keyof FragenGrenzen, name: string) => (
    <Feld beschriftung={name} id={`fg-${k}`} fehler={fehler[k]} hinweis={t('fragen.werkbank.bereich', { min: FRAGEN_BEREICH[k].min, max: FRAGEN_BEREICH[k].max, standard: FRAGEN_STANDARD[k] })}>
      <input type="number" inputMode="numeric" min={FRAGEN_BEREICH[k].min} max={FRAGEN_BEREICH[k].max} value={eingabe[k]} onChange={(e) => setEingabe({ ...eingabe, [k]: e.target.value })} />
    </Feld>
  );
  return (
    <>
      <h2 className="h3">{t('fragen.werkbank.titel')} <Hilfe ort="pakete.fragen" /></h2>
      <p className="leise klein">{t('fragen.werkbank.text')}</p>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <div className="frag-grenzen">
        {feld('ausschnitte', t('fragen.werkbank.ausschnitte'))}
        {feld('zeichen', t('fragen.werkbank.zeichen'))}
      </div>
      <div className="knoepfe"><Knopf art="haupt" gesperrt={eingabe.ausschnitte === String(g.ausschnitte) && eingabe.zeichen === String(g.zeichen)} laeuft={laeuft} onClick={() => void speichern()}>{t('fragen.werkbank.speichern')}</Knopf></div>
    </>
  );
}
