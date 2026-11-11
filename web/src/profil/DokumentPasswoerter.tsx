import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { GemerktesPasswort } from '../../../shared/src/entsperren';
import { passkeysImBrowser, passkeyVerwenden } from '../passkey';
import { Knopf } from '../bausteine';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { gebietsschema } from '../../../shared/src/sprache';

const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });

/**
 * Passwörter für Dokumente (#827): gemerkte Passwörter geschützter PDFs – nur für die eigene Person, nicht in einer
 * Vertretung. Anzeigen und Ändern des Passworts erst nach erneuter Bestätigung (Ablago-Passwort oder Code der
 * Zwei-Faktor-Anmeldung); sie gilt einige Minuten für diesen Bereich.
 */
export function DokumentPasswoerter() {
  const { vertretung } = useKonto();
  const [stand, setStand] = useState<Awaited<ReturnType<typeof api.dokumentPasswoerter>> | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [klartext, setKlartext] = useState<Record<string, string>>({});
  const [aendern, setAendern] = useState<{ id: string; name: string; passwort: string } | null>(null);
  const [bestaetigen, setBestaetigen] = useState<null | (() => Promise<void>)>(null);
  const [geheim, setGeheim] = useState('');
  const laden = useCallback(async () => {
    try { setStand(await api.dokumentPasswoerter()); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }, []);
  useEffect(() => { if (!vertretung) void laden(); }, [laden, vertretung]);

  const bestaetigt = () => !!stand?.bestaetigtBis && new Date(stand.bestaetigtBis).getTime() > Date.now();
  /** Erst bestätigen lassen, dann ausführen. */
  const mitBestaetigung = (f: () => Promise<void>) => { setMeldung(undefined); if (bestaetigt()) void f().catch((e: Error) => setMeldung({ art: 'schlecht', text: e.message })); else { setGeheim(''); setBestaetigen(() => f); } };

  /** Bestätigen (Passwort, Code oder Passkey), dann die gemerkte Handlung ausführen. */
  async function bestaetigtMit(angaben: Parameters<typeof api.dokumentPasswoerterBestaetigen>[0]) {
    const r = await api.dokumentPasswoerterBestaetigen(angaben);
    setStand((s) => (s ? { ...s, bestaetigtBis: r.bestaetigtBis } : s));
    setGeheim('');
    const f = bestaetigen;
    setBestaetigen(null);
    await f?.();
  }
  async function bestaetige(e: FormEvent) {
    e.preventDefault();
    const code = geheim.replace(/\s/g, '');
    try { await bestaetigtMit(stand?.zweifaktor && /^\d{6}$/.test(code) ? { code } : { passwort: geheim }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  /** Passkey (#811): eigene Herausforderung für diesen Zweck, dann wie Passwort und Code. */
  async function mitPasskey() {
    setMeldung(undefined);
    const o = await api.passkeyBestaetigenOptionen('dokumentpasswoerter');
    await bestaetigtMit({ passkey: { kennung: o.kennung, antwort: await passkeyVerwenden(o.optionen) } });
  }

  const zeige = (p: GemerktesPasswort) => {
    if (klartext[p.id] !== undefined) { setKlartext(({ [p.id]: _weg, ...rest }) => rest); return; }
    mitBestaetigung(async () => { const r = await api.dokumentPasswortZeigen(p.id); setKlartext((k) => ({ ...k, [p.id]: r.passwort })); });
  };

  async function speichere(e: FormEvent) {
    e.preventDefault();
    if (!aendern) return;
    const a = aendern;
    const tu = async () => {
      await api.dokumentPasswortAendern(a.id, { name: a.name, ...(a.passwort ? { passwort: a.passwort } : {}) });
      setAendern(null); setKlartext({});
      setMeldung({ art: 'gut', text: t('profil.dokpw.gespeichert') });
      await laden();
    };
    if (a.passwort) mitBestaetigung(tu); else await tu().catch((x: Error) => setMeldung({ art: 'schlecht', text: x.message }));
  }

  async function loesche(p: GemerktesPasswort) {
    if (!(await rueckfrage({ titel: t('profil.dokpw.loeschen.frage', { name: p.name }), text: t('profil.dokpw.loeschen.text'), ja: t('profil.dokpw.loeschen'), gefahr: true }))) return;
    try { await api.dokumentPasswortLoeschen(p.id); setMeldung({ art: 'gut', text: t('profil.dokpw.geloescht') }); await laden(); } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
  }

  return (
    <div className="blatt">
      <h2 className="h3">{t('profil.dokpw.titel')} <Hilfe ort="profil.dokumentpasswoerter" /></h2>
      <p className="hinweis info">{t('profil.dokpw.keine-verwaltung')}</p>
      {vertretung ? <p className="leise">{t('profil.dokpw.vertretung')}</p> : stand === null ? <p className="leise">{t('profil.dokpw.lade')}</p> : !stand.eintraege.length ? (
        <p className="leise">{t('profil.dokpw.leer')}</p>
      ) : (
        <ul className="sitzungsliste">
          {stand.eintraege.map((p) => (
            <li key={p.id}>
              {aendern?.id === p.id ? (
                <form className="raster" onSubmit={(e) => void speichere(e)}>
                  <label className="eigenschaft"><span>{t('profil.dokpw.name')}</span><input value={aendern.name} maxLength={80} onChange={(e) => setAendern({ ...aendern, name: e.target.value })} required /></label>
                  <label className="eigenschaft"><span>{t('profil.dokpw.neu')} <small>{t('profil.dokpw.neu.hilfe')}</small></span><input type="password" autoComplete="off" value={aendern.passwort} onChange={(e) => setAendern({ ...aendern, passwort: e.target.value })} /></label>
                  <div className="knoepfe"><button className="knopf primaer klein" disabled={!aendern.name.trim()}>{t('profil.dokpw.speichern')}</button><button type="button" className="textknopf" onClick={() => setAendern(null)}>{t('profil.dokpw.abbrechen')}</button></div>
                </form>
              ) : (
                <>
                  <div>
                    <strong>{p.name}</strong>
                    <span className="passwort blockzeile">
                      <span className="festwert mono" aria-live="polite">{klartext[p.id] ?? '••••••••'}</span>
                      <button type="button" className="knopf klein" onClick={() => zeige(p)} title={klartext[p.id] === undefined ? t('profil.dokpw.anzeigen') : t('profil.dokpw.verbergen')} aria-label={klartext[p.id] === undefined ? t('profil.dokpw.anzeigen') : t('profil.dokpw.verbergen')}><Symbol name={klartext[p.id] === undefined ? 'auge' : 'auge-aus'} /></button>
                      <button type="button" className="knopf klein" onClick={() => setAendern({ id: p.id, name: p.name, passwort: '' })}>{t('profil.dokpw.aendern')}</button>
                    </span>
                    <span className="leise klein blockzeile">{p.zuletzt ? t('profil.dokpw.zuletzt', { datum: datum(p.zuletzt) }) : t('profil.dokpw.nie')}</span>
                  </div>
                  <button type="button" className="textknopf gefahr klein" onClick={() => void loesche(p)} title={t('profil.dokpw.loeschen')} aria-label={t('profil.dokpw.loeschen.von', { name: p.name })}><Symbol name="schliessen" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {bestaetigen && (
        <form className="raster" onSubmit={(e) => void bestaetige(e)}>
          {stand?.passkey && passkeysImBrowser() && <div className="anmelden-passkey">
            <Knopf id="dokpw-passkey" laeuftText={t('anmeldung.passkey.warte')} onClick={mitPasskey}><Symbol name="passkey" /> {t('profil.dokpw.bestaetigen.passkey')}</Knopf>
            <p className="trenner">{t('profil.dokpw.bestaetigen.oder')}</p>
          </div>}
          <p className="leise">{stand?.zweifaktor ? t('profil.dokpw.bestaetigen.mit-code') : t('profil.dokpw.bestaetigen.text')}</p>
          <label className="eigenschaft"><span>{stand?.zweifaktor ? t('profil.dokpw.bestaetigen.feld-code') : t('profil.dokpw.bestaetigen.feld')}</span>
            <input type="password" autoComplete="current-password" value={geheim} onChange={(e) => setGeheim(e.target.value)} autoFocus required /></label>
          <div className="knoepfe"><button className="knopf primaer klein" disabled={!geheim}>{t('profil.dokpw.bestaetigen')}</button><button type="button" className="textknopf" onClick={() => setBestaetigen(null)}>{t('profil.dokpw.abbrechen')}</button></div>
        </form>
      )}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
    </div>
  );
}
