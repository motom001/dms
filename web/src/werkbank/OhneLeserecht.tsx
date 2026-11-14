import { useCallback, useEffect, useState } from 'react';
import type { FallOhneLeserecht } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { Knopf, KnopfLink } from '../bausteine';
import { Person } from '../Person';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import { t } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Aufgaben → Aufgaben bei Personen ohne Leserecht (#798). Grundsatz: Wer eine Aufgabe bekommt, darf die
 * Mappe lesen. Ablago blockiert die Arbeit nicht, zeigt aber, wo es anders ist – offene Fälle oben, darunter die
 * vergangenen mit Zeitraum, Person, Mappe und ob ein Leserecht auf Zeit gegeben wurde. Je Fall Sprung zur Mappe und
 * zum Testlauf der Rechte; bei offenen Fällen der Knopf für das Leserecht auf Zeit. Rechte vergibt nur der Admin.
 */
const tag = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema());

export function useOhneLeserecht(aktiv: boolean) {
  const [stand, setStand] = useState<{ offen: FallOhneLeserecht[]; vergangen: FallOhneLeserecht[] } | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await api.ohneLeserecht()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { stand, fehler, laden };
}

/** Sprünge je Fall: zur Mappe (wenn es sie noch gibt) und zum Testlauf der Rechte mit Person und Mappe. */
function Spruenge({ f }: { f: FallOhneLeserecht }) {
  if (!f.typId) return <span className="leise klein">{t('werkbank.ohne-leserecht.mappe-weg')}</span>;
  return (
    <span className="knoepfe">
      <KnopfLink to={`/ablage/${f.typId}/${f.mappeId}`} groesse="klein">{t('werkbank.ohne-leserecht.zur-mappe')}</KnopfLink>
      <KnopfLink to={`/werkbank/typen/${f.typId}?testkonto=${f.benutzerId}&testmappe=${f.mappeId}#testlauf`} groesse="klein">{t('werkbank.ohne-leserecht.zu-rechten')}</KnopfLink>
    </span>
  );
}

export function OhneLeserechtPanel({ nachher }: { nachher?: () => Promise<void> }) {
  const d = useDaten();
  const z = useOhneLeserecht(true);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState<string>();
  const name = (id: string) => d.person(id);
  const mappe = (f: FallOhneLeserecht) => (f.typId ? titelOder(f.mappeTitel) : t('werkbank.ohne-leserecht.mappe-weg'));

  async function geben(f: FallOhneLeserecht) {
    if (!(await rueckfrage({ titel: t('werkbank.ohne-leserecht.frage.titel', { name: name(f.benutzerId) }), text: t('werkbank.ohne-leserecht.frage.text', { name: name(f.benutzerId), mappe: mappe(f) }), ja: t('werkbank.ohne-leserecht.frage.ja') }))) return;
    setSendet(f.id); setMeldung(undefined);
    try {
      await api.leserechtAufZeit(f.id);
      setMeldung({ art: 'gut', text: t('werkbank.ohne-leserecht.gegeben.meldung', { name: name(f.benutzerId) }) });
      await z.laden(); await nachher?.();
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); await z.laden(); }
    finally { setSendet(undefined); }
  }

  const s = z.stand;
  return (
    <div className="einspaltig">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.bereich.aufgaben.name')}</p>
        <h1>{t('werkbank.ohne-leserecht.titel')}</h1>
        <p className="leise">{t('werkbank.ohne-leserecht.text')}</p>
      </div>
      {z.fehler && <div className="hinweis schlecht"><p>{z.fehler}</p></div>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      {!s ? <p className="leise">{t('werkbank.ohne-leserecht.lade')}</p> : <>
        <section className="blatt" aria-labelledby="ohne-leserecht-offen">
          <h2 className="h3" id="ohne-leserecht-offen">{s.offen.length ? t('werkbank.ohne-leserecht.offen', { anzahl: s.offen.length }) : t('werkbank.ohne-leserecht.keine')}</h2>
          {s.offen.length > 0 && (
            <ul className="mappenliste">
              {s.offen.map((f) => (
                <li key={f.id} className="stapel">
                  <span className="titel"><Person id={f.benutzerId} /> · {mappe(f)}</span>
                  <span className="unter">{t('werkbank.ohne-leserecht.aufgabe', { text: f.aufgabentext })}</span>
                  <span className="unter leise klein">{t('werkbank.ohne-leserecht.seit', { datum: tag(f.beginn) })}
                    {f.leserechtSeit && <> · {t('werkbank.ohne-leserecht.gegeben', { datum: tag(f.leserechtSeit), von: f.leserechtVon ? name(f.leserechtVon) : t('werkbank.ohne-leserecht.unbekannt') })}</>}</span>
                  <span className="knoepfe">
                    {!f.leserechtSeit && f.typId && <Knopf art="haupt" groesse="klein" laeuft={sendet === f.id} onClick={() => geben(f)}>{t('werkbank.ohne-leserecht.geben')}</Knopf>}
                    <Spruenge f={f} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="blatt" aria-labelledby="ohne-leserecht-vergangen">
          <h2 className="h3" id="ohne-leserecht-vergangen">{t('werkbank.ohne-leserecht.vergangen')}</h2>
          <p className="leise klein">{t('werkbank.ohne-leserecht.vergangen.text')}</p>
          {!s.vergangen.length ? <p className="leise klein">{t('werkbank.ohne-leserecht.vergangen.keine')}</p> : (
            <div className="tabellenrahmen">
              <table className="tabelle klein">
                <thead><tr>
                  <th>{t('werkbank.ohne-leserecht.spalte.zeitraum')}</th><th>{t('werkbank.ohne-leserecht.spalte.person')}</th>
                  <th>{t('werkbank.ohne-leserecht.spalte.mappe')}</th><th>{t('werkbank.ohne-leserecht.spalte.leserecht')}</th><th><span className="sr">{t('werkbank.ohne-leserecht.spalte.spruenge')}</span></th>
                </tr></thead>
                <tbody>
                  {s.vergangen.map((f) => (
                    <tr key={f.id}>
                      <td>{t('werkbank.ohne-leserecht.zeitraum', { von: tag(f.beginn), bis: tag(f.ende!) })}<br /><span className="leise">{t.frei(`werkbank.ohne-leserecht.ende.${f.endeGrund ?? 'erledigt'}`)}</span></td>
                      <td><Person id={f.benutzerId} /></td>
                      <td>{mappe(f)}<br /><span className="leise">{f.aufgabentext}</span></td>
                      <td>{f.leserechtSeit ? t('werkbank.ohne-leserecht.mit-recht') : t('werkbank.ohne-leserecht.ohne-recht')}</td>
                      <td><Spruenge f={f} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>}
    </div>
  );
}
