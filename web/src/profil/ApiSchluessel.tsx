import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type ApiSchluessel, type ApiSchluesselEingabe, type ApiSchluesselRecht } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { useKonto } from '../konto';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { knopfAussehen } from '../bausteine';

/** API-Schlüssel im eigenen Profil (#20): erzeugen, ändern, löschen; ganz sichtbar nur beim Erzeugen. */
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' }) : '–');
/** Stufen (#625: „nur Zähler“ für Hausautomatisierung und Anzeigen). */
const STUFEN: ApiSchluesselRecht[] = ['lesen', 'schreiben', 'zaehler'];
const stufe = (r: ApiSchluesselRecht) => t.frei(`api.stufe.${r}`);
const alsDatum = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const ausDatum = (text: string) => (text ? new Date(`${text}T23:59:59`).toISOString() : null);

export function ApiSchluesselBlatt() {
  const { ich, laufwerk } = useKonto();
  const [liste, setListe] = useState<ApiSchluessel[] | null>(null);
  const [neu, setNeu] = useState<(ApiSchluessel & { schluessel: string }) | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const laden = useCallback(async () => { try { setListe(await api.apiSchluessel()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function aktion(fn: () => Promise<unknown>) {
    setFehler(undefined);
    try { await fn(); await laden(); return true; } catch (e) { setFehler((e as Error).message); return false; }
  }

  return (
    <div className="blatt">
      <div className="blattkopf">
        <h2 className="h3">{t('profil.apischluessel.api-schluessel')}</h2>
        <p className="leise">{tn('profil.apischluessel.damit-greifen-andere-programme', { span: <span className="mono">{t('profil.apischluessel.authorization-bearer-dms')}</span>, link: <Link to="/api-doku" className="verweis">{t('profil.apischluessel.api-dokumentation')}</Link> })}</p>
        {/* #720: nur, wenn das Laufwerk eingeschaltet ist – sonst erwähnt die Oberfläche es nirgends. */}
        {laufwerk && <p className="leise klein">{tn('profil.apischluessel.auch-fuer-das-benutzername', { link: <Link to="/profil/laufwerk" className="verweis">{t('profil.apischluessel.laufwerk')}</Link>, hilfe: <Hilfe ort="profil.laufwerk" /> })}</p>}
      </div>
      {fehler && <div className="hinweis schlecht"><p>{fehler}</p></div>}
      {neu && <NeuerSchluessel s={neu} schliessen={() => setNeu(null)} />}
      {liste && liste.length > 0 && (
        <ul className="sitzungsliste">
          {liste.map((s) => bearbeite === s.id
            ? <li key={s.id}><SchluesselFormular start={s} knopf={t('profil.apischluessel.speichern')} abbrechen={() => setBearbeite(null)}
                senden={(d) => aktion(async () => { await api.apiSchluesselAendern(s.id, d); setBearbeite(null); })} /></li>
            : (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong> <span className="mono klein">{s.praefix}</span> <span className={`chip ${s.recht === 'schreiben' ? 'warn' : ''}`}>{stufe(s.recht)}</span>
                  {s.passwoerter && <> <span className="chip warn" title={t('profil.apischluessel.darf-mit-passwoerter-anzeigen')}>{t('profil.apischluessel.passwoerter-lesen')}</span></>}
                  {s.ablauf && Date.parse(s.ablauf) < Date.now() && <> <span className="chip stufe-error">{t('profil.apischluessel.abgelaufen')}</span></>}
                  <span className="leise klein blockzeile">{t('profil.apischluessel.erstellt-zuletzt-benutzt', { datum: datum(s.erstellt), datum2: datum(s.zuletztBenutzt), wert: s.ablauf ? t('profil.apischluessel.gueltig-bis', { datum: new Date(s.ablauf).toLocaleDateString(gebietsschema()) }) : t('profil.apischluessel.ohne-ablauf') })}</span>
                </div>
                <span className="zeilenaktionen">
                  <button type="button" className="textknopf" onClick={() => setBearbeite(s.id)}>{t('profil.apischluessel.aendern')}</button>
                  <button type="button" className="textknopf gefahr" onClick={async () => { if (await rueckfrage({ titel: t('profil.apischluessel.schluessel-loeschen', { name: s.name }), text: t('profil.apischluessel.programme-die-ihn-nutzen'), ja: t('profil.apischluessel.loeschen'), gefahr: true })) void aktion(() => api.apiSchluesselLoeschen(s.id)); }}>{t('profil.apischluessel.loeschen')}</button>
                </span>
              </li>
            ))}
        </ul>
      )}
      {liste && !liste.length && !neu && <p className="leise">{t('profil.apischluessel.noch-keine-schluessel')}</p>}
      {/* #818: Schlüssel bekommen nie Verwaltungsrechte – auch die von Personen, die verwalten. */}
      <details className="neuerschluessel">
        <summary {...knopfAussehen({ art: 'anlegen' })}>{t('profil.apischluessel.neuen-schluessel-erzeugen')}</summary>
        <SchluesselFormular knopf={t('profil.apischluessel.erzeugen')} senden={(d) => aktion(async () => setNeu(await api.apiSchluesselAnlegen(d)))} />
      </details>
    </div>
  );
}

function SchluesselFormular({ start, knopf, senden, abbrechen }: { start?: ApiSchluessel; knopf: string; senden: (d: ApiSchluesselEingabe) => Promise<boolean>; abbrechen?: () => void }) {
  const [name, setName] = useState(start?.name ?? '');
  const [recht, setRecht] = useState<ApiSchluesselRecht>(start?.recht ?? 'lesen');
  const [ablauf, setAblauf] = useState(alsDatum(start?.ablauf ?? null));
  const [passwoerter, setPasswoerter] = useState(start?.passwoerter ?? false);
  async function los(e: FormEvent) {
    e.preventDefault();
    if (await senden({ name, recht, passwoerter: recht !== 'zaehler' && passwoerter, ablauf: ausDatum(ablauf) }) && !start) { setName(''); setAblauf(''); setPasswoerter(false); }
  }
  return (
    <form className="raster schluesselformular" onSubmit={los}>
      <label className="eigenschaft"><span>{tn('profil.apischluessel.name', { klein: <small>{t('profil.apischluessel.z-b-scanner-buero')}</small> })}</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="eigenschaft"><span>{t('profil.apischluessel.rechte')}</span>
        <select value={recht} onChange={(e) => setRecht(e.target.value as ApiSchluesselRecht)} aria-describedby="schluessel-stufe-hilfe">
          {STUFEN.map((r) => <option key={r} value={r}>{stufe(r)}</option>)}
        </select></label>
      <label className="eigenschaft"><span>{tn('profil.apischluessel.gueltig-bis-2', { klein: <small>{t('profil.apischluessel.leer-ohne-ablauf')}</small> })}</span><input type="date" value={ablauf} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setAblauf(e.target.value)} /></label>
      <p id="schluessel-stufe-hilfe" className="eigenschaft breit hilfe">{t.frei(`api.stufe.hilfe.${recht}`)}</p>
      {recht !== 'zaehler' && <label className="haken breit"><input type="checkbox" checked={passwoerter} onChange={(e) => setPasswoerter(e.target.checked)} />
        <span>{tn('profil.apischluessel.passwoerter-lesen-2', { klein: <small className="hilfe">{tn('profil.apischluessel.mit-liefert-die-api', { span: <span className="mono">{'?passwoerter=anzeigen'}</span> })}</small> })}</span></label>}
      <div className="knoepfe">
        {abbrechen && <button type="button" className="knopf" onClick={abbrechen}>{t('profil.apischluessel.abbrechen')}</button>}
        <button className="knopf primaer">{knopf}</button>
      </div>
    </form>
  );
}

export function NeuerSchluessel({ s, schliessen }: { s: ApiSchluessel & { schluessel: string }; schliessen: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="hinweis warn stapel" role="status">
      <p>{tn('profil.apischluessel.kopiere-ihn-jetzt-er', { b: <strong>{t('profil.apischluessel.schluessel-erzeugt', { name: s.name })}</strong> })}</p>
      <input className="mono" readOnly value={s.schluessel} onFocus={(e) => e.target.select()} aria-label={t('profil.apischluessel.neuer-api-schluessel')} />
      <div className="knoepfe">
        <button type="button" className="knopf" onClick={() => void navigator.clipboard?.writeText(s.schluessel).then(() => setKopiert(true), () => {})}>{kopiert ? t('profil.apischluessel.kopiert') : t('profil.apischluessel.kopieren')}</button>
        <button type="button" className="knopf" onClick={schliessen}>{t('profil.apischluessel.habe-ihn-gesichert')}</button>
      </div>
    </div>
  );
}
