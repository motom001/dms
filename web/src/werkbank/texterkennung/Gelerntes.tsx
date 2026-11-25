import { useEffect, useState } from 'react';
import { datumText } from '../../../../shared/src/archiv';
import { typName } from '../../../../shared/src/beschriftung';
import type { GelerntFuerWerkbank } from '../../../../shared/src/gelerntes';
import { sucheApi } from '../../api/suche';
import { Aufklapper, Feld, Knopf } from '../../bausteine';
import { useDaten } from '../../daten';
import { Link } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';

/**
 * Gelerntes (#1681): was die Erkennung aus Korrekturen gelernt hat – je Absender, mit Zusammenhang (was, wann, von wem,
 * aus welcher Mappe), Filter, Löschen je Eintrag und „Alles für diesen Absender vergessen“. Zurückgenommenes (von selbst
 * verlernt) steht mit Datum dabei. Zugeklappt; geladen wird erst beim Aufklappen.
 */
export function Gelerntes() {
  const d = useDaten();
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<GelerntFuerWerkbank[] | null>(null);
  const [filter, setFilter] = useState('');
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const laden = () => sucheApi.gelerntes().then(setListe, (x: Error) => setMeldung({ art: 'schlecht', text: x.message }));
  useEffect(() => {
    if (offen && liste === null) void laden();
  }, [offen, liste]);
  const absenderName = (g: GelerntFuerWerkbank) => g.absenderTitel ?? t('werkbank.texterkennung.gelerntes.absender-verborgen');
  const passt = (g: GelerntFuerWerkbank) => {
    const f = filter.trim().toLocaleLowerCase('de-DE');
    const typ = d.typ(g.typId);
    return !f || [absenderName(g), typ ? typName(typ) : '', g.kennwort ?? ''].some((x) => x.toLocaleLowerCase('de-DE').includes(f));
  };
  const gruppen = new Map<string, GelerntFuerWerkbank[]>();
  for (const g of (liste ?? []).filter(passt)) gruppen.set(g.absender, [...(gruppen.get(g.absender) ?? []), g]);
  async function loesche(g: GelerntFuerWerkbank) {
    setMeldung(undefined);
    try {
      await sucheApi.gelerntLoeschen(g.id);
      setMeldung({ art: 'gut', text: t('werkbank.texterkennung.gelerntes.geloescht') });
      await laden();
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function vergiss(absender: string, name: string) {
    if (
      !(await rueckfrage({
        titel: t('werkbank.texterkennung.gelerntes.vergessen-frage', { absender: name }),
        text: t('werkbank.texterkennung.gelerntes.vergessen-text'),
        ja: t('werkbank.texterkennung.gelerntes.vergessen'),
      }))
    )
      return;
    setMeldung(undefined);
    try {
      const r = await sucheApi.gelerntVergessen(absender);
      setMeldung({ art: 'gut', text: t('werkbank.texterkennung.gelerntes.vergessen-fertig', { anzahl: r.geloescht }) });
      await laden();
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  const was = (g: GelerntFuerWerkbank) => {
    const typ = d.typ(g.typId);
    const name = typ ? typName(typ) : '';
    if (g.art === 'typ') return t('werkbank.texterkennung.gelerntes.was-typ', { typ: name });
    const feld = typ?.felder.find((f) => f.key === g.feld)?.label ?? g.feld ?? '';
    return t('werkbank.texterkennung.gelerntes.was-feld', { feld, typ: name, kennwort: g.kennwort ?? '' });
  };
  return (
    <section className="aufklappbereich" id="gelerntes">
      <Aufklapper offen={offen} steuert="gelerntes-inhalt" umschalten={() => setOffen(!offen)}>
        <span>{t('werkbank.texterkennung.gelerntes.titel')}</span>
        <span className="leise klein">{t('werkbank.texterkennung.gelerntes.kurz')}</span>
      </Aufklapper>
      {offen && (
        <div id="gelerntes-inhalt" className="aufklappinhalt">
          <p className="leise klein">{t('werkbank.texterkennung.gelerntes.text')}</p>
          <Feld beschriftung={t('werkbank.texterkennung.gelerntes.filter')}>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </Feld>
          {liste !== null && !gruppen.size && <p className="leise">{t('werkbank.texterkennung.gelerntes.leer')}</p>}
          {[...gruppen].map(([absender, eintraege]) => {
            const name = absenderName(eintraege[0]);
            return (
              <div key={absender}>
                <h3>{name}</h3>
                <ul>
                  {eintraege.map((g) => (
                    <li key={g.id}>
                      {was(g)}{' '}
                      <span className="leise klein">
                        {t('werkbank.texterkennung.gelerntes.wann', { datum: datumText(g.am.slice(0, 10)), von: d.person(g.von) })}
                        {g.zurueck && ` · ${t('werkbank.texterkennung.gelerntes.zurueck', { datum: datumText(g.zurueck.slice(0, 10)) })}`}
                      </span>{' '}
                      {g.post && g.mappeTitel !== undefined && (
                        <Link to={`/ablage/mappe/${g.post}`} className="verweis">
                          {titelOder(g.mappeTitel)}
                        </Link>
                      )}{' '}
                      <Knopf groesse="klein" onClick={() => void loesche(g)}>
                        {t('werkbank.texterkennung.gelerntes.loeschen')}
                      </Knopf>
                    </li>
                  ))}
                </ul>
                <Knopf groesse="klein" onClick={() => void vergiss(absender, name)}>
                  {t('werkbank.texterkennung.gelerntes.vergessen')}
                </Knopf>
              </div>
            );
          })}
          {meldung && (
            <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
              {meldung.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
