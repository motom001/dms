import { useCallback, useEffect, useState } from 'react';
import { Feld, FeldGruppe, Schalter } from '../bausteine';
import { setzeErlaubteSprachen, sprachname } from '../../../shared/src/beschriftung';
import { AUSGANGSSPRACHE, EINGEBAUTE_SPRACHEN, sprache } from '../../../shared/src/sprache';
import { Link } from '../ort';
import { api, ApiFehler, type SprachenStand, type UebersetzenStand } from '../api';
import { rueckfrage } from '../rueckfrage';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Einstellungen → Sprachen (#729): welche Sprachen es in der Ablage gibt und welche für alle gilt, die nichts
 * gewählt haben. Fest eingebaut sind Deutsch und Englisch; weitere kommen als Sprachpaket (#731). Deutsch ist die
 * Ausgangssprache und bleibt immer erlaubt.
 */
export function useSprachen(offen: boolean) {
  const [stand, setStand] = useState<SprachenStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.sprachen()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, laden, setStand };
}
export type SprachenZustand = ReturnType<typeof useSprachen>;

type Einstellung = SprachenStand['einstellung'];

export function SprachenPanel({ z }: { z: SprachenZustand }) {
  const s = z.stand;
  const [e, setE] = useState<Einstellung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (s && !e) setE(s.einstellung); }, [s, e]);
  const ent = useEntwurf(s?.einstellung ?? null, e, { aus: !e, zuruecksetzen: () => { setE(s?.einstellung ?? null); setMeldung(undefined); } });
  if (!s || !e) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.sprachen.lade')}</p>;
  async function speichern() {
    setSendet(true);
    try {
      const n = await api.sprachenSetzen(e!);
      z.setStand(n); setE(n.einstellung); setzeErlaubteSprachen(n.einstellung.erlaubt);
      setMeldung({ art: 'gut', text: t('werkbank.sprachen.gespeichert') });
    } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); } finally { setSendet(false); }
  }
  const schalte = (spr: string, an: boolean) => setE({ ...e, erlaubt: s.verfuegbar.filter((x) => (x === spr ? an : e.erlaubt.includes(x))) });
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.sprachen.name')} ueber={t('werkbank.sprachen.ueber')} hilfe="werkbank.sprachen">
        <p className="leise">{t('werkbank.sprachen.einleitung')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      <form className="blatt" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <FeldGruppe beschriftung={t('werkbank.sprachen.erlaubt')}>
          <div className="haken-untereinander">
          {s.verfuegbar.map((spr) => {
            const fest = spr === AUSGANGSSPRACHE || spr === e.standard;
            return (
              <label key={spr} className="haken">
                <input type="checkbox" id={`sprache-${spr}`} checked={e.erlaubt.includes(spr)} disabled={fest} onChange={(x) => schalte(spr, x.target.checked)} />
                <span lang={spr}>{sprachname(spr, spr)}</span>
                <small className="leise">{(EINGEBAUTE_SPRACHEN as readonly string[]).includes(spr) ? t('werkbank.sprachen.eingebaut') : t('werkbank.sprachen.paket')}
                  {spr === AUSGANGSSPRACHE ? ` · ${t('werkbank.sprachen.ausgang')}` : spr === e.standard ? ` · ${t('werkbank.sprachen.ist-standard')}` : ''}</small>
              </label>
            );
          })}
          </div>
        </FeldGruppe>
        <Feld beschriftung={t('werkbank.sprachen.standard')} hinweis={t('werkbank.sprachen.standard.hinweis')}>
          <select id="sprachen-standard" value={e.standard} onChange={(x) => setE({ ...e, standard: x.target.value, erlaubt: e.erlaubt.includes(x.target.value) ? e.erlaubt : [...e.erlaubt, x.target.value] })}>
            {e.erlaubt.map((spr) => <option key={spr} value={spr}>{sprachname(spr)}</option>)}
          </select>
        </Feld>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.bereich.sprachen.name')} sendet={sendet} />
      </form>
      <InhalteUebersetzen />
      <section className="blatt">
        <h2 className="h3">{t('werkbank.sprachen.weitere')}</h2>
        {/* Installierte Sprachpakete (#731): Abdeckung gegen diese Version, für welche Version gemacht, maschinell/geprüft. */}
        {(s.pakete ?? []).length > 0 ? (
          <ul className="stapel" aria-label={t('werkbank.sprachen.pakete')}>
            {(s.pakete ?? []).map((p) => (
              <li key={p.paket}>
                <strong lang={p.kennung}>{sprachname(p.kennung, p.kennung)}</strong>{p.kennung !== sprache() && <span className="leise"> · {sprachname(p.kennung)}</span>}
                {' '}<Link to={`/werkbank/pakete/${p.paket}`} className="verweis klein">{t('werkbank.sprachen.paket.name', { name: p.name, version: p.version })}</Link>
                <div className="leise klein">
                  {[
                    t('werkbank.sprachen.paket.abdeckung', { prozent: p.abdeckung.prozent }),
                    t('werkbank.sprachen.paket.fuer', { ablago: p.ablago }),
                    p.geprueftVon ? t('werkbank.sprachen.paket.geprueft', { wer: p.geprueftVon }) : p.maschinell ? t('werkbank.sprachen.paket.maschinell') : t('werkbank.sprachen.paket.menschlich'),
                    t('werkbank.sprachen.paket.personen', { anzahl: p.personen }),
                  ].join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="leise">{t('werkbank.sprachen.weitere.text')}</p>}
        <p><Link to="/werkbank/pakete" className="verweis">{t('werkbank.sprachen.pakete.holen')}</Link></p>
        <p className="leise klein">{t('werkbank.sprachen.rueckfall')}</p>
      </section>
    </div>
  );
}

/**
 * Inhalte übersetzen (#732): an oder aus für alle und welches Paket übersetzt. Ohne Paket mit dem Recht
 * „Inhalte übersetzen“ nur ein Hinweis. Ein Paket mit Netz gilt erst nach der ausdrücklichen Bestätigung, dass Texte an
 * seinen Dienst gehen (#701); ohne Wahl nimmt Ablago nur ein Paket, das auf dem Gerät übersetzt.
 */
function InhalteUebersetzen() {
  const [s, setS] = useState<UebersetzenStand | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { void api.uebersetzenStand().then(setS, (e) => setMeldung({ art: 'schlecht', text: (e as Error).message })); }, []);
  async function setze(e: Partial<UebersetzenStand['einstellung']>) {
    setSendet(true); setMeldung(undefined);
    try { setS(await api.uebersetzenSetzen(e)); setMeldung({ art: 'gut', text: t('werkbank.uebersetzen.gespeichert') }); }
    catch (x) {
      const d = x instanceof ApiFehler && x.status === 409 ? x.details as { abfluss?: boolean; paket?: string; ziele?: string[] } | undefined : undefined;
      if (d?.abfluss && await rueckfrage({ titel: t('werkbank.uebersetzen.abfluss.titel'), text: t('werkbank.uebersetzen.abfluss.text', { paket: d.paket ?? '', ziele: (d.ziele ?? []).join(', ') }), ja: t('werkbank.uebersetzen.abfluss.ja') })) {
        await setze({ ...e, abfluss: true });
        return;
      }
      if (!d?.abfluss) setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally { setSendet(false); }
  }
  return (
    <section className="blatt" aria-labelledby="uebersetzen-titel">
      <h2 className="h3" id="uebersetzen-titel">{t('werkbank.uebersetzen.titel')} <Hilfe ort="werkbank.uebersetzen" /></h2>
      <p className="leise">{t('werkbank.uebersetzen.einleitung')}</p>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {s && !s.pakete.length && <p className="leise">{t('werkbank.uebersetzen.kein-paket')}</p>}
      {s && s.pakete.length > 0 && <>
        <Schalter id="uebersetzen-an" an={s.einstellung.an} gesperrt={sendet} setze={(an) => setze({ an })} beschriftung={t('werkbank.uebersetzen.an')} />
        <Feld beschriftung={t('werkbank.uebersetzen.paket')}>
          <select id="uebersetzen-paket" value={s.einstellung.paket ?? ''} disabled={sendet || !s.einstellung.an} onChange={(x) => void setze({ paket: x.target.value || null, abfluss: false })}>
            <option value="">{t('werkbank.uebersetzen.automatisch')}</option>
            {s.pakete.map((p) => <option key={p.id} value={p.id}>{p.netz ? t('werkbank.uebersetzen.mit-netz', { name: p.name, ziele: p.netz.join(', ') }) : p.name}</option>)}
          </select>
        </Feld>
        <p className="leise klein">{s.wirksam
          ? t('werkbank.uebersetzen.wirksam', { name: s.wirksam.name })
          : s.einstellung.an ? t('werkbank.uebersetzen.keins-wirksam') : t('werkbank.uebersetzen.aus')}</p>
      </>}
    </section>
  );
}
