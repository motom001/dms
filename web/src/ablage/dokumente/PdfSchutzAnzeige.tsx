/** Geschütztes PDF (#827, #1279): Passwortfeld, solange es gesperrt ist; danach ein kurzer Vermerk. */
import { useState, type FormEvent } from 'react';
import type { Dokument } from '../../../../shared/src/model';
import { namensvorschlag } from '../../../../shared/src/entsperren';
import { t } from '../../sprache';
import { dokumenteApi } from '../../api/dokumente';
import { useKonto } from '../../konto';
import { Hilfe } from '../../Hilfe';
import { Symbol } from '../../Symbol';
import { Feld, HakenFeld, Knopf } from '../../bausteine';

/**
 * Geschütztes PDF (#827): Hinweis mit Passwortfeld, solange es gesperrt ist; danach ein kurzer Vermerk. Mit
 * „Für weitere Dokumente merken“ kommt das Passwort verschlüsselt in das eigene Konto (Mein Konto → Sicherheit).
 */
export function PdfSchutzAnzeige({ x, betreff, fertig }: { x: Dokument; betreff: string; fertig(): void }) {
  const s = x.pdfSchutz!;
  const { vertretung } = useKonto();
  const [passwort, setPasswort] = useState('');
  const [zeigen, setZeigen] = useState(false);
  const [merken, setMerken] = useState(false);
  const [name, setName] = useState(() => namensvorschlag(betreff));
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  if (s.entsperrt)
    return (
      <span className="ocrstand klein">
        <span className="chip">{t.frei(`mappen.entsperren.chip.${s.art}`)}</span>
        <span className="leise">
          {s.art === 'rechte'
            ? t('mappen.entsperren.rechte')
            : s.entsperrt.art === 'gemerkt'
              ? t('mappen.entsperren.entsperrt-gemerkt', { name: s.entsperrt.name ?? '' })
              : t('mappen.entsperren.entsperrt')}
        </span>
        <Hilfe ort="dokumente.entsperren" />
      </span>
    );
  if (s.art !== 'passwort') return null;
  async function absenden(e: FormEvent) {
    e.preventDefault();
    setSendet(true);
    setMeldung(undefined);
    try {
      const r = await dokumenteApi.dokumentEntsperren(x.id, passwort, merken ? { name } : undefined);
      setPasswort('');
      setMeldung({
        art: 'gut',
        text: r.hinweis
          ? t('mappen.entsperren.fertig-ohne-merken', { grund: r.hinweis })
          : r.gemerkt
            ? t('mappen.entsperren.fertig-gemerkt')
            : t('mappen.entsperren.fertig'),
      });
      fertig();
    } catch (f) {
      setMeldung({ art: 'schlecht', text: (f as Error).message });
    } finally {
      setSendet(false);
    }
  }
  return (
    <form className="hinweis info entsperren" onSubmit={(e) => void absenden(e)} onClick={(e) => e.stopPropagation()}>
      <p>
        <Symbol name="schloss" /> {t('mappen.entsperren.hinweis')} <Hilfe ort="dokumente.entsperren" />
      </p>
      <div className="passwort">
        <Feld id={`entsperren-${x.id}`} beschriftung={t('mappen.entsperren.passwort')} beschriftungVerbergen>
          <input
            type={zeigen ? 'text' : 'password'}
            value={passwort}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('mappen.entsperren.passwort')}
            onChange={(e) => setPasswort(e.target.value)}
          />
        </Feld>
        <Knopf
          groesse="klein"
          nurSymbol={zeigen ? t('mappen.entsperren.verbergen') : t('mappen.entsperren.anzeigen')}
          onClick={() => setZeigen(!zeigen)}>
          <Symbol name={zeigen ? 'auge-aus' : 'auge'} />
        </Knopf>
        <Knopf art="haupt" groesse="klein" type="submit" gesperrt={!passwort || (merken && !name.trim())} laeuft={sendet}>
          {t('mappen.entsperren.knopf')}
        </Knopf>
      </div>
      {!vertretung && (
        <HakenFeld beschriftung={t('mappen.entsperren.merken')} hinweis={t('mappen.entsperren.merken.hilfe')}>
          <input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
        </HakenFeld>
      )}
      {merken && (
        <Feld beschriftung={t('mappen.entsperren.name')}>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t('mappen.entsperren.name.beispiel')} />
        </Feld>
      )}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </form>
  );
}
