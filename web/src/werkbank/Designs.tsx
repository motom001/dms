import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { designCss, GRUNDLAGEN, MARKE, palette, rettungsweg, wendeAn, type Design, type Grundlage } from '../design';
import { geheZu, Link, loeseWache } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { logoUrl, Marke } from '../Marke';
import { Listenkopf } from '../Listenkopf';
import { rueckfrage } from '../rueckfrage';
import { t, tn } from '../sprache';
import { KnopfLink } from '../bausteine';

/**
 * Designs in der Werkbank (#21): Mitte die Designs, rechts Bearbeiten mit Vorschau.
 * Beim Bearbeiten wird das Design sofort auf die eigene Ansicht angewendet;
 * beim Verlassen ohne Speichern gilt wieder das eigene Design.
 */
export function DesignListe({ offen }: { offen?: string }) {
  const d = useDaten();
  return (
    <>
      <Listenkopf titel={t('werkbank.designs.designs')} hilfe="werkbank.designs" beschreibung={t('werkbank.designs.farben-und-eigenes-css')}>
        <KnopfLink to="/werkbank/designs/neu" art="anlegen" groesse="klein">{t('werkbank.designs.neu')}</KnopfLink>
      </Listenkopf>
      <ul className="mappenliste">
        {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">{t('werkbank.designs.neues-design')}</span><span className="unter">{t('werkbank.designs.noch-nicht-gespeichert')}</span></span></li>}
        {d.designs.map((x) => (
          <li key={x.id}>
            <Link to={`/werkbank/designs/${x.id}`} className={`eintrag werk ${offen === x.id ? 'an' : ''}`}>
              <span className="titel">{x.name}{x.id === d.standardDesign && <span className="chip">{t('werkbank.designs.standard')}</span>}</span>
              <span className="unter"><Farbfelder d={x} /> {GRUNDLAGEN[x.grundlage]}{x.css.trim() ? t('werkbank.designs.eigenes-css') : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Farbfelder({ d }: { d: Pick<Design, 'primaer' | 'sekundaer' | 'grundlage'> }) {
  const p = palette(d.grundlage === 'automatisch' ? 'hell' : d.grundlage, d.primaer, d.sekundaer);
  return (
    <span className="farbfelder" aria-hidden="true">
      <span style={{ background: p.flaeche, borderColor: p['linie-stark'] }} />
      <span style={{ background: p.akzent }} />
      <span style={{ background: p.gruen }} />
    </span>
  );
}

const LEER: Omit<Design, 'id' | 'logo'> = { name: '', grundlage: 'automatisch', primaer: MARKE.blau, sekundaer: MARKE.gruen, css: '', schriftzug: null };

export function DesignEditor({ id }: { id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const vorhanden = d.designs.find((x) => x.id === id);
  const start = vorhanden ? { name: vorhanden.name, grundlage: vorhanden.grundlage, primaer: vorhanden.primaer, sekundaer: vorhanden.sekundaer, css: vorhanden.css, schriftzug: vorhanden.schriftzug ?? null } : LEER;
  const [e, setE] = useState(start);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const ent = useEntwurf(start, e, { neu, liste: '/werkbank/designs', zuruecksetzen: () => { setE(start); setMeldung(undefined); } });
  const { geaendert } = ent;
  const [sendet, setSendet] = useState(false);
  // Vorschau: das bearbeitete Design gilt sofort für die eigene Ansicht.
  useEffect(() => { wendeAn({ id: 'vorschau', ...e }); }, [e]);
  // Beim Verlassen wieder das eigene Design – das aktuelle, nicht das beim Öffnen gültige.
  const mein = useRef(d.meinDesign);
  mein.current = d.meinDesign;
  useEffect(() => () => { wendeAn(mein.current, !rettungsweg()); }, []);

  if (!neu && !vorhanden) return <div className="leer"><p>{t('werkbank.designs.dieses-design-gibt-es')}</p></div>;
  const standard = !neu && id === d.standardDesign;
  async function aktion(fn: () => Promise<unknown>, gut: string) {
    setMeldung(undefined);
    try { await fn(); setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const setze = (p: Partial<typeof e>) => setE((x) => ({ ...x, ...p }));

  return (
    <form className="einspaltig" onKeyDown={ent.tasten} onSubmit={(ev) => {
      ev.preventDefault();
      setSendet(true);
      void aktion(async () => {
        const r = neu ? await api.designAnlegen(e) : await api.designAendern(id, e);
        loeseWache(); await d.designsLaden();
        if (neu) geheZu(`/werkbank/designs/${r.id}`);
      }, t('werkbank.designs.design-gespeichert')).finally(() => setSendet(false));
    }}>
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.designs.design')}</p>
        <h1>{e.name || (neu ? t('werkbank.designs.neues-design') : t('werkbank.designs.ohne-namen'))}{standard && <span className="chip">{t('werkbank.designs.standard')}</span>}</h1>
        <p className="leise">{t('werkbank.designs.die-vorschau-gilt-schon', { wert: neu ? t('werkbank.designs.design-anlegen') : t('werkbank.designs.design-speichern') })}</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <div className="blatt">
        <div className="raster">
          <label className="eigenschaft"><span>{t('werkbank.designs.name')}</span><input value={e.name} onChange={(x) => setze({ name: x.target.value })} placeholder={t('werkbank.designs.z-b-waldgruen')} required /></label>
          <label className="eigenschaft"><span>{t('werkbank.designs.grundlage')}</span>
            <select value={e.grundlage} onChange={(x) => setze({ grundlage: x.target.value as Grundlage })}>
              {Object.entries(GRUNDLAGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <Farbwahl name={t('werkbank.designs.primaerfarbe')} hilfe={t('werkbank.designs.links-hauptknoepfe-markierungen')} wert={e.primaer} setze={(primaer) => setze({ primaer })} />
          <Farbwahl name={t('werkbank.designs.sekundaerfarbe')} hilfe={t('werkbank.designs.speichern-neu-geoeffnete-mappe')} wert={e.sekundaer} setze={(sekundaer) => setze({ sekundaer })} />
        </div>
        <p className="leise klein">{t('werkbank.designs.aus-beiden-farben-werden')}</p>
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.designs.logo-und-schriftzug')}</h2>
        <p className="leise">{t('werkbank.designs.stehen-oben-links-in')}</p>
        <div className="raster">
          <label className="eigenschaft"><span>{tn('werkbank.designs.schriftzug', { klein: <small>{t('werkbank.designs.hoechstens-30-zeichen-leer')}</small> })}</span>
            <input value={e.schriftzug ?? 'Ablago'} maxLength={30} onChange={(x) => setze({ schriftzug: x.target.value === 'Ablago' ? null : x.target.value })} /></label>
          <div className="eigenschaft"><span>{t('werkbank.designs.vorschau')}</span>
            <div className="markenvorschau marke"><Marke logo={logoUrl(vorhanden)} schriftzug={e.schriftzug === null || e.schriftzug === undefined ? 'Ablago' : e.schriftzug} /></div></div>
        </div>
        {neu ? <p className="leise klein">{t('werkbank.designs.ein-logo-laesst-sich')}</p> : (
          <div className="knoepfe links">
            <label className="knopf klein">{vorhanden?.logo ? t('werkbank.designs.anderes-logo-waehlen') : t('werkbank.designs.logo-hochladen')}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(x) => {
                const f = x.target.files?.[0]; x.target.value = '';
                if (f) void aktion(async () => { await api.designLogo(id, f); await d.designsLaden(); }, t('werkbank.designs.logo-gespeichert'));
              }} /></label>
            {vorhanden?.logo && <button type="button" className="textknopf" onClick={() => void aktion(async () => { await api.designLogoEntfernen(id); await d.designsLaden(); }, t('werkbank.designs.standard-logo-wiederhergestellt'))}>{t('werkbank.designs.standard-wiederherstellen')}</button>}
            <span className="leise klein">{t('werkbank.designs.png-jpeg-webp-oder')}</span>
          </div>
        )}
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.designs.vorschau')}</h2>
        <div className="designvorschau">
          <a className="verweis" href="#vorschau" onClick={(x) => x.preventDefault()}>{t('werkbank.designs.ein-verweis')}</a>
          <span className="chip gut">{t('werkbank.designs.bezahlt')}</span>
          <button type="button" className="knopf primaer klein">{t('werkbank.designs.hauptknopf')}</button>
          <button type="button" className="knopf gruen klein">{t('werkbank.designs.mappe-speichern')}</button>
          <span className="eintrag an vorschaueintrag"><span className="titel">{t('werkbank.designs.geoeffnete-mappe')}</span><span className="unter">{t('werkbank.designs.nebenzeile')}</span></span>
        </div>
      </div>
      <div className="blatt">
        <h2 className="h3">{t('werkbank.designs.eigenes-css-2')}</h2>
        <p className="leise">{tn('werkbank.designs.fuer-alles-was-farben', { span: <span className="mono">{'?design=standard'}</span> })}</p>
        <textarea className="mono" rows={8} value={e.css} onChange={(x) => setze({ css: x.target.value })} placeholder={'.kopf { border-bottom-width: 3px; }'} spellCheck={false} />
        <details><summary className="leise klein">{t('werkbank.designs.verfuegbare-farbwerte')}</summary><pre className="protokolldaten">{designCss({ ...e, css: '' })}</pre></details>
      </div>
      <Speicherleiste ent={ent} gegenstand={t('werkbank.designs.design')} sendet={sendet}
        links={!neu && !standard && <button type="button" className="textknopf gefahr" onClick={async () => {
          if (await rueckfrage({ titel: t('werkbank.designs.design-loeschen', { name: vorhanden!.name }), text: t('werkbank.designs.wer-es-nutzt-bekommt'), ja: t('werkbank.designs.loeschen'), gefahr: true })) {
            void aktion(async () => { await api.designLoeschen(id); loeseWache(); await d.designsLaden(); geheZu('/werkbank/designs'); }, t('werkbank.designs.geloescht'));
          }
        }}>{t('werkbank.designs.design-loeschen-2')}</button>}
        weitere={!neu && !standard && <button type="button" className="knopf" disabled={geaendert} title={geaendert ? t('werkbank.designs.erst-speichern') : undefined}
          onClick={() => void aktion(async () => { await api.designStandard(id); await d.designsLaden(); }, t('werkbank.designs.als-standard-festgelegt'))}>{t('werkbank.designs.als-standard-festlegen')}</button>} />
    </form>
  );
}

function Farbwahl({ name, hilfe, wert, setze }: { name: string; hilfe: string; wert: string; setze: (v: string) => void }) {
  const [text, setText] = useState(wert);
  useEffect(() => setText(wert), [wert]);
  return (
    <label className="eigenschaft"><span>{name} <small>{hilfe}</small></span>
      <span className="farbwahl">
        <input type="color" value={wert} onChange={(x) => setze(x.target.value.toUpperCase())} aria-label={t('werkbank.designs.waehlen', { name })} />
        <input className="mono" value={text} maxLength={7} onChange={(x) => { setText(x.target.value); if (/^#[0-9a-f]{6}$/i.test(x.target.value)) setze(x.target.value.toUpperCase()); }} />
      </span>
    </label>
  );
}
