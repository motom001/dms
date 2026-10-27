import { useEffect, useState } from 'react';
import { FELDTYPEN, istLeer, istOk, schluesselAus, VERWEISARTEN, type Feld, type Mappentyp } from '../../../shared/src/model';
import { api, ApiFehler } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';

/**
 * Einrichtung: hier wird festgelegt, welche Mappentypen es gibt und welche
 * Felder sie haben.
 *
 * /einrichtung          ersten Typ öffnen
 * /einrichtung/neu      neuer Mappentyp
 * /einrichtung/:typId   Mappentyp bearbeiten
 */
export function Einrichtung({ typId }: { typId?: string }) {
  const d = useDaten();
  const [laedt, setLaedt] = useState(false);
  const [meldung, setMeldung] = useState<string>();
  const typ = d.typ(typId);

  useEffect(() => {
    if (!typId && d.typen.length) geheZu(`/einrichtung/${d.typen[0].id}`, true);
  }, [typId, d.typen]);

  async function beispieleLaden() {
    setLaedt(true); setMeldung(undefined);
    try { await api.beispiele(); await d.neuLaden(); geheZu('/einrichtung', true); }
    catch (e) { setMeldung((e as Error).message); }
    finally { setLaedt(false); }
  }

  let inhalt;
  if (typId === 'neu') inhalt = <TypEditor key="neu" />;
  else if (typ) inhalt = <TypEditor key={typ.id} typ={typ} />;
  else if (typId) inhalt = <div className="leer"><p>Diesen Mappentyp gibt es nicht (mehr).</p></div>;
  else inhalt = (
    <div className="leer">
      <h2>Noch keine Mappentypen</h2>
      <p>Ein Mappentyp legt fest, welche Felder eine Mappe hat – etwa „Vertrag“ mit „Kündigung bis“ und „Zahlungszyklus“. Lege den ersten an oder lade vier Beispieltypen mit ein paar Mappen.</p>
      <div className="knoepfe">
        <Link to="/einrichtung/neu" className="knopf primaer">Ersten Mappentyp anlegen</Link>
        <button className="knopf" disabled={laedt} onClick={() => void beispieleLaden()}>{laedt ? 'Lade …' : 'Beispiele laden'}</button>
      </div>
      {meldung && <p className="fehlertext">{meldung}</p>}
    </div>
  );

  return (
    <div className="zweispaltig">
      <aside className="leiste">
        <div className="leistenkopf">
          <h2 className="ueber">Mappentypen</h2>
          <Link to="/einrichtung/neu" className="knopf klein">+ Neu</Link>
        </div>
        <nav className="typliste" aria-label="Mappentypen">
          {typId === 'neu' && <span className="typeintrag an"><span className="nm">Neuer Mappentyp</span><span className="chip warn">neu</span></span>}
          {d.typen.map((t) => (
            <Link key={t.id} to={`/einrichtung/${t.id}`} className={`typeintrag ${typ?.id === t.id ? 'an' : ''}`}>
              <span className="nm">{t.name}</span><span className="zahl">{t.felder.length} Felder</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="inhalt">{inhalt}</section>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const ZAHLEN = ['minLen', 'maxLen', 'min', 'max', 'nachkomma'] as const;
type Zahlprop = (typeof ZAHLEN)[number];

/** Feld im Bearbeitungszustand: Zahlen als getippter Text, Merker für neue Felder. */
type EntwurfFeld = Omit<Feld, Zahlprop> & Record<Zahlprop, string> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean };
interface Entwurf { id: string; name: string; beschreibung: string; titelFeld: string; felder: EntwurfFeld[] }

function neueId(): string {
  // crypto.randomUUID gibt es nur über HTTPS oder localhost; im Heimnetz oft nicht.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function entwurfAus(t?: Mappentyp): Entwurf {
  if (!t) return { id: neueId(), name: '', beschreibung: '', titelFeld: '', felder: [] };
  return {
    id: t.id, name: t.name, beschreibung: t.beschreibung, titelFeld: t.titelFeld,
    felder: t.felder.map((f) => ({ ...f, _uid: neueId(), ...Object.fromEntries(ZAHLEN.map((p) => [p, f[p] == null ? '' : String(f[p]).replace('.', ',')])) }) as unknown as EntwurfFeld),
  };
}

function TypEditor({ typ }: { typ?: Mappentyp }) {
  const d = useDaten();
  const neu = !typ;
  const [basis, setBasis] = useState(() => JSON.stringify(entwurfAus(typ)));
  const [e, setE] = useState<Entwurf>(() => JSON.parse(basis));
  const [offen, setOffen] = useState<number | null>(null);
  const [fehler, setFehler] = useState<{ allgemein: string[]; felder: Record<string, string[]> } | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruende, setGruende] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const geaendert = neu || JSON.stringify(e) !== basis;
  useUngespeichert(JSON.stringify(e) !== basis && (!neu || e.felder.length > 0 || e.name !== ''));

  const gespeichert = d.typ(e.id);
  const unpassend = gespeichert ? d.mappenVon(gespeichert.id).filter((m) => !istOk(d.pruefe(gespeichert, m.werte, m.id))).length : 0;

  const setzeFeld = (i: number, patch: Partial<EntwurfFeld>) => setE((x) => {
    const felder = x.felder.map((f, j) => (j === i ? { ...f, ...patch } : f));
    return { ...x, felder };
  });
  const eindeutigerSchluessel = (basisKey: string, i: number, felder = e.felder) => {
    let k = basisKey; let n = 2;
    while (felder.some((g, j) => j !== i && g.key === k)) k = `${basisKey}_${n++}`.slice(0, 40);
    return k;
  };

  function feldHinzufuegen() {
    const i = e.felder.length;
    const f: EntwurfFeld = {
      key: eindeutigerSchluessel('neues_feld', i), label: 'Neues Feld', typ: 'text', pflicht: false, eindeutig: false, hilfe: '', standard: '',
      minLen: '', maxLen: '', min: '', max: '', nachkomma: '', muster: '', optionen: [], mehrfach: false, zielTyp: '', verweisart: 'bezug', waehrung: 'EUR', _uid: neueId(), _neu: true,
    };
    setE((x) => ({ ...x, felder: [...x.felder, f] }));
    setOffen(i);
  }
  function verschiebe(i: number, r: number) {
    const j = i + r;
    if (j < 0 || j >= e.felder.length) return;
    setE((x) => { const fs = [...x.felder]; [fs[i], fs[j]] = [fs[j], fs[i]]; return { ...x, felder: fs }; });
    setOffen((o) => (o === i ? j : o === j ? i : o));
    setFehler(null);
  }
  function entferne(i: number) {
    const f = e.felder[i];
    const n = gespeichert ? d.mappenVon(gespeichert.id).filter((m) => !istLeer(m.werte[f.key])).length : 0;
    const frage = n
      ? `${n} ${n === 1 ? 'Mappe hat' : 'Mappen haben'} in „${f.label}“ einen Wert. Die Werte bleiben gespeichert, werden aber nicht mehr angezeigt. Feld entfernen?`
      : `Feld „${f.label}“ entfernen?`;
    if (!confirm(frage)) return;
    setE((x) => ({ ...x, titelFeld: x.titelFeld === f.key ? '' : x.titelFeld, felder: x.felder.filter((_, j) => j !== i) }));
    setOffen(null); setFehler(null);
  }

  async function speichern() {
    setSendet(true); setMeldung(undefined); setGruende([]);
    const daten = { ...e, felder: e.felder.map(({ _uid, _neu, _schluesselGetippt, ...rest }) => rest) };
    try {
      const t = neu ? await api.typAnlegen(daten) : await api.typAendern(e.id, daten);
      const sauber = entwurfAus(t);
      setE(sauber); setBasis(JSON.stringify(sauber)); setFehler(null); setOffen(null);
      loeseWache();
      await d.neuLaden();
      if (neu) geheZu(`/einrichtung/${t.id}`);
      else setMeldung('Mappentyp gespeichert.');
    } catch (err) {
      const f = err as ApiFehler;
      if (f.pruefung) {
        setFehler(f.pruefung);
        const erstes = Object.keys(f.pruefung.felder)[0];
        if (erstes !== undefined) setOffen(Number(erstes));
      }
      setMeldung(f.message);
    } finally { setSendet(false); }
  }

  async function loeschen() {
    if (neu) { loeseWache(); geheZu('/einrichtung'); return; }
    if (!confirm(`Mappentyp „${e.name}“ endgültig löschen?`)) return;
    try {
      await api.typLoeschen(e.id);
      loeseWache(); await d.neuLaden(); geheZu('/einrichtung');
    } catch (err) {
      setMeldung((err as Error).message);
      setGruende((err as ApiFehler).gruende ?? []);
    }
  }

  const titelOptionen = e.felder.filter((f) => ['text', 'zahl', 'datum'].includes(f.typ) || (f.typ === 'auswahl' && !f.mehrfach));

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">Mappentyp</p>
        <h1>{e.name || (neu ? 'Neuer Mappentyp' : 'Ohne Namen')}</h1>
        {gespeichert && <p className="leise"><Link to={`/ablage/${gespeichert.id}`} className="verweis">{d.mappenVon(gespeichert.id).length} Mappen in der Ablage →</Link></p>}
      </div></div>

      {unpassend > 0 && (
        <div className="hinweis warn"><p>{unpassend} {unpassend === 1 ? 'Mappe passt' : 'Mappen passen'} nicht zur aktuellen Definition. Sie sind in der Ablage markiert.</p></div>
      )}
      {fehler?.allgemein.length ? <div className="hinweis schlecht"><p>{fehler.allgemein.join(' ')}</p></div> : null}
      {gruende.length > 0 && <div className="hinweis warn"><ul>{gruende.map((g) => <li key={g}>{g}</li>)}</ul></div>}

      <div className="blatt">
        <h2 className="h3">Grunddaten</h2>
        <div className="raster">
          <label className="eigenschaft"><span>Name</span><input value={e.name} placeholder="z. B. Vertrag" onChange={(ev) => setE({ ...e, name: ev.target.value })} autoFocus={neu} /></label>
          <label className="eigenschaft"><span>Beschreibung</span><input value={e.beschreibung} placeholder="Wofür ist dieser Typ?" onChange={(ev) => setE({ ...e, beschreibung: ev.target.value })} /></label>
          <label className="eigenschaft"><span>Titel einer Mappe <small>welches Feld sie benennt</small></span>
            <select value={e.titelFeld} onChange={(ev) => setE({ ...e, titelFeld: ev.target.value })}>
              <option value="">Erstes Textfeld (automatisch)</option>
              {titelOptionen.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="blatt">
        <div className="blattkopf">
          <h2 className="h3">Felder</h2>
          <p className="leise">Feld anklicken, um Datentyp und Eigenschaften festzulegen. Die Reihenfolge gilt auch im Formular.</p>
        </div>
        <div className="feldliste">
          {e.felder.length === 0 && <div className="leer"><p>Noch keine Felder. Füge das erste hinzu, etwa „Bezeichnung“ als Text.</p></div>}
          {e.felder.map((f, i) => (
            <FeldZeile key={f._uid} f={f} i={i} anzahl={e.felder.length} offen={offen === i} fehler={fehler?.felder[String(i)]}
              eigeneId={e.id} eigenerName={e.name} typen={d.typen}
              umschalten={() => setOffen(offen === i ? null : i)}
              verschiebe={(r) => verschiebe(i, r)} entferne={() => entferne(i)}
              setze={(patch) => {
                const p = { ...patch };
                if ('label' in p && f._neu && !f._schluesselGetippt) p.key = eindeutigerSchluessel(schluesselAus(p.label ?? ''), i);
                if ('key' in p) p._schluesselGetippt = true;
                if ('typ' in p) p.standard = p.typ === 'janein' ? false : '';
                setzeFeld(i, p);
              }} />
          ))}
        </div>
        <div><button type="button" className="knopf" onClick={feldHinzufuegen}>+ Feld hinzufügen</button></div>
      </div>

      <div className="speicherleiste">
        <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>{neu ? 'Entwurf verwerfen' : 'Mappentyp löschen'}</button>
        <span className={`status ${fehler ? 'schlecht' : ''}`} role="status">{meldung ?? (geaendert && !neu ? 'Ungespeicherte Änderungen' : '')}</span>
        <div className="knoepfe">
          {!neu && <button type="button" className="knopf" disabled={!geaendert || sendet} onClick={() => { setE(JSON.parse(basis)); setFehler(null); setMeldung(undefined); setOffen(null); }}>Verwerfen</button>}
          <button type="submit" className="knopf primaer" disabled={sendet}>{sendet ? 'Speichere …' : 'Mappentyp speichern'}</button>
        </div>
      </div>
    </form>
  );
}

function FeldZeile(p: {
  f: EntwurfFeld; i: number; anzahl: number; offen: boolean; fehler?: string[];
  eigeneId: string; eigenerName: string; typen: Mappentyp[];
  umschalten(): void; verschiebe(r: number): void; entferne(): void; setze(patch: Partial<EntwurfFeld>): void;
}) {
  const { f, i, offen, fehler, setze } = p;
  const id = (x: string) => `f${i}-${x}`;
  const zielName = f.zielTyp === p.eigeneId ? (p.eigenerName || 'dieser Typ') : p.typen.find((t) => t.id === f.zielTyp)?.name ?? '–';

  const chips: string[] = [];
  if (f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) chips.push('eindeutig');
  if (f.typ === 'referenz') chips.push(`→ ${zielName}`, VERWEISARTEN[f.verweisart ?? 'bezug']);
  if (f.typ === 'auswahl') chips.push(`${(f.optionen ?? []).length} Werte`);
  if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) chips.push('mehrfach');

  const zahl = (prop: Zahlprop, label: string, platzhalter: string) => (
    <label className="eigenschaft" htmlFor={id(prop)}><span>{label}</span>
      <input id={id(prop)} inputMode="decimal" placeholder={platzhalter} value={f[prop]} onChange={(e) => setze({ [prop]: e.target.value } as Partial<EntwurfFeld>)} /></label>
  );
  const haken = (prop: 'pflicht' | 'eindeutig' | 'mehrfach', label: string, hilfe: string) => (
    <label className="haken"><input type="checkbox" checked={!!f[prop]} onChange={(e) => setze({ [prop]: e.target.checked })} /><span>{label}<small className="hilfe">{hilfe}</small></span></label>
  );

  let besonders = null;
  if (f.typ === 'text' || f.typ === 'langtext') besonders = <div className="raster">
    {zahl('minLen', 'Mindestlänge', 'keine')}{zahl('maxLen', 'Höchstlänge', 'keine')}
    {f.typ === 'text' && <label className="eigenschaft" htmlFor={id('muster')}><span>Muster <small>regulärer Ausdruck</small></span><input id={id('muster')} className="mono" placeholder="z. B. [A-Z]{2}-\d+" value={f.muster ?? ''} onChange={(e) => setze({ muster: e.target.value })} /></label>}
  </div>;
  else if (f.typ === 'zahl') besonders = <div className="raster">{zahl('min', 'Minimum', 'keins')}{zahl('max', 'Maximum', 'keins')}{zahl('nachkomma', 'Nachkommastellen', 'beliebig')}</div>;
  else if (f.typ === 'betrag') besonders = <div className="raster">{zahl('min', 'Minimum', 'keins')}{zahl('max', 'Maximum', 'keins')}
    <label className="eigenschaft" htmlFor={id('waehrung')}><span>Standardwährung</span><input id={id('waehrung')} className="mono" maxLength={3} value={f.waehrung ?? 'EUR'} onChange={(e) => setze({ waehrung: e.target.value.toUpperCase() })} /></label></div>;
  else if (f.typ === 'auswahl') besonders = <div className="raster">
    <label className="eigenschaft" htmlFor={id('optionen')}><span>Auswahlwerte <small>einer pro Zeile</small></span>
      <textarea id={id('optionen')} rows={4} defaultValue={(f.optionen ?? []).join('\n')} onBlur={(e) => setze({ optionen: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} /></label>
    <div className="eigenschaft unten">{haken('mehrfach', 'Mehrfachauswahl', 'Mehrere Werte gleichzeitig wählbar')}</div>
  </div>;
  else if (f.typ === 'referenz') besonders = <div className="raster">
    <label className="eigenschaft" htmlFor={id('ziel')}><span>Verweist auf Mappen vom Typ</span>
      <select id={id('ziel')} value={f.zielTyp ?? ''} onChange={(e) => setze({ zielTyp: e.target.value })}>
        <option value="">– bitte wählen –</option>
        {p.typen.filter((t) => t.id !== p.eigeneId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value={p.eigeneId}>{p.eigenerName || 'Dieser Typ'} (dieser Typ)</option>
      </select>
      <small className="hilfe">„Dieser Typ“ ergibt eine Hierarchie, z. B. Heizung → Haus.</small></label>
    <fieldset className="wahl"><legend>Art des Verweises</legend>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart === 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'zugehoerigkeit' })} /><span>Zugehörigkeit<small className="hilfe">„gehört zu“ – zählt bei „alles zu X“ mit</small></span></label>
      <label className="haken"><input type="radio" name={id('va')} checked={f.verweisart !== 'zugehoerigkeit'} onChange={() => setze({ verweisart: 'bezug' })} /><span>Bezug<small className="hilfe">nur verknüpft, z. B. Aussteller</small></span></label>
    </fieldset>
    <div className="eigenschaft unten">{haken('mehrfach', 'Mehrere Mappen erlaubt', 'z. B. eine Zahlung für mehrere Rechnungen')}</div>
  </div>;

  let standard = null;
  if (f.typ === 'text' || f.typ === 'langtext' || f.typ === 'zahl' || f.typ === 'betrag')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert</span><input id={id('std')} placeholder="leer" value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'datum')
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert</span><input id={id('std')} type="date" value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })} /></label>;
  else if (f.typ === 'janein')
    standard = <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={f.standard === true} onChange={(e) => setze({ standard: e.target.checked })} /><span>Standardmäßig „Ja“</span></label></div>;
  else if (f.typ === 'auswahl' && !f.mehrfach)
    standard = <label className="eigenschaft" htmlFor={id('std')}><span>Standardwert</span><select id={id('std')} value={String(f.standard ?? '')} onChange={(e) => setze({ standard: e.target.value })}>
      <option value="">– keiner –</option>{(f.optionen ?? []).map((o) => <option key={o}>{o}</option>)}</select></label>;

  return (
    <div className={`feldzeile ${offen ? 'offen' : ''} ${fehler ? 'fehlerhaft' : ''}`}>
      <div className="feldsumme">
        <button type="button" className="feldkopfknopf" aria-expanded={offen} onClick={p.umschalten}>
          <span className="flabel">{f.label || 'Ohne Bezeichnung'}{f.pflicht && <span className="pflicht">*</span>}</span>
          <code className="fkey">{f.key}</code>
          <span className="ftyp">{FELDTYPEN[f.typ]}</span>
          {chips.length > 0 && <span className="chips">{chips.map((c) => <span key={c} className="chip">{c}</span>)}</span>}
        </button>
        <div className="feldaktionen">
          <button type="button" className="symbol" disabled={i === 0} onClick={() => p.verschiebe(-1)} aria-label="Feld nach oben">↑</button>
          <button type="button" className="symbol" disabled={i === p.anzahl - 1} onClick={() => p.verschiebe(1)} aria-label="Feld nach unten">↓</button>
        </div>
      </div>
      {fehler && !offen && <p className="fehlertext eingerueckt">{fehler.join(' ')}</p>}
      {offen && (
        <div className="feldeditor">
          {fehler && <div className="hinweis schlecht"><p>{fehler.join(' ')}</p></div>}
          <div className="raster">
            <label className="eigenschaft" htmlFor={id('label')}><span>Bezeichnung</span><input id={id('label')} value={f.label} placeholder="z. B. Kündigung bis" onChange={(e) => setze({ label: e.target.value })} autoFocus={f._neu} /></label>
            <label className="eigenschaft" htmlFor={id('key')}><span>Schlüssel <small>{f._neu ? 'wird nach dem Speichern fest' : 'fest – schützt gespeicherte Werte'}</small></span>
              <input id={id('key')} className="mono" value={f.key} disabled={!f._neu} onChange={(e) => setze({ key: e.target.value })} /></label>
            <label className="eigenschaft" htmlFor={id('typ')}><span>Datentyp</span>
              <select id={id('typ')} value={f.typ} onChange={(e) => setze({ typ: e.target.value as Feld['typ'] })}>
                {Object.entries(FELDTYPEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <div className="raster">
            <div className="eigenschaft unten">{haken('pflicht', 'Pflichtfeld', 'Mappe lässt sich ohne Wert nicht speichern')}</div>
            {(f.typ === 'text' || f.typ === 'zahl') && <div className="eigenschaft unten">{haken('eindeutig', 'Eindeutig', 'Wert darf je Mappentyp nur einmal vorkommen')}</div>}
            {standard}
          </div>
          {besonders && <><h3 className="zwischen">Eigenschaften für {FELDTYPEN[f.typ]}</h3>{besonders}</>}
          <label className="eigenschaft" htmlFor={id('hilfe')}><span>Hilfetext</span><input id={id('hilfe')} placeholder="Erklärung, die beim Ausfüllen erscheint" value={f.hilfe ?? ''} onChange={(e) => setze({ hilfe: e.target.value })} /></label>
          <div className="feldfuss">
            <button type="button" className="textknopf gefahr" onClick={p.entferne}>Feld entfernen</button>
            <button type="button" className="knopf klein" onClick={p.umschalten}>Fertig</button>
          </div>
        </div>
      )}
    </div>
  );
}
