import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useDaten } from '../daten';
import { designCss, GRUNDLAGEN, palette, rettungsweg, wendeAn, type Design, type Grundlage } from '../design';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { logoUrl, Marke } from '../Marke';
import { Hilfe } from '../Hilfe';

/**
 * Designs in der Werkbank (#21): Mitte die Designs, rechts Bearbeiten mit Vorschau.
 * Beim Bearbeiten wird das Design sofort auf die eigene Ansicht angewendet;
 * beim Verlassen ohne Speichern gilt wieder das eigene Design.
 */
export function DesignListe({ offen }: { offen?: string }) {
  const d = useDaten();
  return (
    <>
      <div className="listenkopf">
        <div><h1>Designs</h1><p className="leise klein">Farben und eigenes CSS der Oberfläche. Jeder Benutzer wählt sein Design im Profil. <Hilfe ort="werkbank.designs" /></p></div>
        <Link to="/werkbank/designs/neu" className="knopf primaer klein">+ Neu</Link>
      </div>
      <ul className="mappenliste">
        {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">Neues Design</span><span className="unter">noch nicht gespeichert</span></span></li>}
        {d.designs.map((x) => (
          <li key={x.id}>
            <Link to={`/werkbank/designs/${x.id}`} className={`eintrag werk ${offen === x.id ? 'an' : ''}`}>
              <span className="titel">{x.name}{x.id === d.standardDesign && <span className="chip">Standard</span>}</span>
              <span className="unter"><Farbfelder d={x} /> {GRUNDLAGEN[x.grundlage]}{x.css.trim() ? ' · eigenes CSS' : ''}</span>
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

const LEER: Omit<Design, 'id' | 'logo'> = { name: '', grundlage: 'automatisch', primaer: '#1D5A8A', sekundaer: '#2B7656', css: '', schriftzug: null };

export function DesignEditor({ id }: { id: string }) {
  const d = useDaten();
  const neu = id === 'neu';
  const vorhanden = d.designs.find((x) => x.id === id);
  const start = vorhanden ? { name: vorhanden.name, grundlage: vorhanden.grundlage, primaer: vorhanden.primaer, sekundaer: vorhanden.sekundaer, css: vorhanden.css, schriftzug: vorhanden.schriftzug ?? null } : LEER;
  const [e, setE] = useState(start);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const geaendert = JSON.stringify(e) !== JSON.stringify(start);
  useUngespeichert(geaendert);
  // Vorschau: das bearbeitete Design gilt sofort für die eigene Ansicht.
  useEffect(() => { wendeAn({ id: 'vorschau', ...e }); }, [e]);
  // Beim Verlassen wieder das eigene Design – das aktuelle, nicht das beim Öffnen gültige.
  const mein = useRef(d.meinDesign);
  mein.current = d.meinDesign;
  useEffect(() => () => { wendeAn(mein.current, !rettungsweg()); }, []);

  if (!neu && !vorhanden) return <div className="leer"><p>Dieses Design gibt es nicht (mehr).</p></div>;
  const standard = !neu && id === d.standardDesign;
  async function aktion(fn: () => Promise<unknown>, gut: string) {
    setMeldung(undefined);
    try { await fn(); setMeldung({ art: 'gut', text: gut }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  const setze = (p: Partial<typeof e>) => setE((x) => ({ ...x, ...p }));

  return (
    <form className="einspaltig" onSubmit={(ev) => {
      ev.preventDefault();
      void aktion(async () => {
        const r = neu ? await api.designAnlegen(e) : await api.designAendern(id, e);
        loeseWache(); await d.designsLaden();
        if (neu) geheZu(`/werkbank/designs/${r.id}`);
      }, 'Design gespeichert.');
    }}>
      <div className="mappenkopf">
        <p className="ueber">Design</p>
        <h1>{e.name || (neu ? 'Neues Design' : 'Ohne Namen')}{standard && <span className="chip">Standard</span>}</h1>
        <p className="leise">Die Vorschau gilt schon jetzt für deine Ansicht; gespeichert wird mit „Design speichern“.</p>
      </div>
      {meldung && <div className={`hinweis ${meldung.art}`}><p>{meldung.text}</p></div>}
      <div className="blatt">
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={e.name} onChange={(x) => setze({ name: x.target.value })} placeholder="z. B. Waldgrün" required /></label>
          <label className="eigenschaft"><span>Grundlage</span>
            <select value={e.grundlage} onChange={(x) => setze({ grundlage: x.target.value as Grundlage })}>
              {Object.entries(GRUNDLAGEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <Farbwahl name="Primärfarbe" hilfe="Links, Hauptknöpfe, Markierungen" wert={e.primaer} setze={(primaer) => setze({ primaer })} />
          <Farbwahl name="Sekundärfarbe" hilfe="Speichern, „+ Neu“, geöffnete Mappe" wert={e.sekundaer} setze={(sekundaer) => setze({ sekundaer })} />
        </div>
        <p className="leise klein">Aus beiden Farben werden Abstufungen abgeleitet (zarte Hintergründe, lesbare Schrift auf der Farbe). Auf dunklen Grundlagen werden zu dunkle Farben automatisch aufgehellt, damit sie lesbar bleiben.</p>
      </div>
      <div className="blatt">
        <h2 className="h3">Logo und Schriftzug</h2>
        <p className="leise">Stehen oben links in der Kopfzeile, im Titel und Symbol des Browser-Tabs und – beim Standard-Design – auf der Anmeldeseite. Wähle zu jedem Design ein Logo, das auf seinem Hintergrund gut zu sehen ist. In E-Mails erscheinen sie nicht.</p>
        <div className="raster">
          <label className="eigenschaft"><span>Schriftzug <small>höchstens 30 Zeichen; leer = nur das Logo</small></span>
            <input value={e.schriftzug ?? 'DMS'} maxLength={30} onChange={(x) => setze({ schriftzug: x.target.value === 'DMS' ? null : x.target.value })} /></label>
          <div className="eigenschaft"><span>Vorschau</span>
            <div className="markenvorschau marke"><Marke logo={logoUrl(vorhanden)} schriftzug={e.schriftzug === null || e.schriftzug === undefined ? 'DMS' : e.schriftzug} /></div></div>
        </div>
        {neu ? <p className="leise klein">Ein Logo lässt sich hochladen, sobald das Design gespeichert ist.</p> : (
          <div className="knoepfe links">
            <label className="knopf klein">{vorhanden?.logo ? 'Anderes Logo wählen' : 'Logo hochladen'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(x) => {
                const f = x.target.files?.[0]; x.target.value = '';
                if (f) void aktion(async () => { await api.designLogo(id, f); await d.designsLaden(); }, 'Logo gespeichert.');
              }} /></label>
            {vorhanden?.logo && <button type="button" className="textknopf" onClick={() => void aktion(async () => { await api.designLogoEntfernen(id); await d.designsLaden(); }, 'Standard-Logo wiederhergestellt.')}>Standard wiederherstellen</button>}
            <span className="leise klein">PNG, JPEG, WebP oder SVG, höchstens 1 MB</span>
          </div>
        )}
      </div>
      <div className="blatt">
        <h2 className="h3">Vorschau</h2>
        <div className="designvorschau">
          <a className="verweis" href="#vorschau" onClick={(x) => x.preventDefault()}>Ein Verweis</a>
          <span className="chip gut">bezahlt</span>
          <button type="button" className="knopf primaer klein">Hauptknopf</button>
          <button type="button" className="knopf gruen klein">Mappe speichern</button>
          <span className="eintrag an vorschaueintrag"><span className="titel">Geöffnete Mappe</span><span className="unter">Nebenzeile</span></span>
        </div>
      </div>
      <div className="blatt">
        <h2 className="h3">Eigenes CSS</h2>
        <p className="leise">Für alles, was Farben allein nicht abdecken. Macht ein CSS die Oberfläche unbedienbar: an die Adresse <span className="mono">?design=standard</span> anhängen – dann lädt das Standard-Design ohne eigenes CSS.</p>
        <textarea className="mono" rows={8} value={e.css} onChange={(x) => setze({ css: x.target.value })} placeholder={'.kopf { border-bottom-width: 3px; }'} spellCheck={false} />
        <details><summary className="leise klein">Verfügbare Farbwerte</summary><pre className="protokolldaten">{designCss({ ...e, css: '' })}</pre></details>
      </div>
      <div className="speicherleiste">
        {!neu && !standard ? <button type="button" className="textknopf gefahr" onClick={() => {
          if (confirm(`Design „${vorhanden!.name}“ löschen? Wer es nutzt, bekommt das Standard-Design.`)) {
            void aktion(async () => { await api.designLoeschen(id); loeseWache(); await d.designsLaden(); geheZu('/werkbank/designs'); }, 'Gelöscht.');
          }
        }}>Design löschen</button> : <span />}
        <div className="knoepfe">
          {!neu && !standard && <button type="button" className="knopf" disabled={geaendert} title={geaendert ? 'Erst speichern' : undefined}
            onClick={() => void aktion(async () => { await api.designStandard(id); await d.designsLaden(); }, 'Als Standard festgelegt.')}>Als Standard festlegen</button>}
          {geaendert && <button type="button" className="knopf" onClick={() => setE(start)}>Änderungen verwerfen</button>}
          <button className="knopf gruen" disabled={!geaendert && !neu}>Design speichern</button>
        </div>
      </div>
    </form>
  );
}

function Farbwahl({ name, hilfe, wert, setze }: { name: string; hilfe: string; wert: string; setze: (v: string) => void }) {
  const [text, setText] = useState(wert);
  useEffect(() => setText(wert), [wert]);
  return (
    <label className="eigenschaft"><span>{name} <small>{hilfe}</small></span>
      <span className="farbwahl">
        <input type="color" value={wert} onChange={(x) => setze(x.target.value.toUpperCase())} aria-label={`${name} wählen`} />
        <input className="mono" value={text} maxLength={7} onChange={(x) => { setText(x.target.value); if (/^#[0-9a-f]{6}$/i.test(x.target.value)) setze(x.target.value.toUpperCase()); }} />
      </span>
    </label>
  );
}
