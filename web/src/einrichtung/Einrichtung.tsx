import { useEffect, useRef, useState } from 'react';
import {
  FELDTYPEN, INDEXPLATZHALTER, istIndexplatzhalter, REGISTERARTEN, SYSTEMSPALTEN, type Systemspalte, schluesselAus, standardRegister, titelAus, VERWEISARTEN, vorlageFelder, wirksameVorlage,
  type Feld, type Mappe, type Mappentyp, type Register, type Registerart, type Werte,
} from '../../../shared/src/model';
import { api, ApiFehler, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link, loeseWache, useUngespeichert } from '../ort';
import { titelOder } from '../seiten';

/* ---------------------------------------------------------------- */

const ZAHLEN = ['minLen', 'maxLen', 'min', 'max', 'nachkomma'] as const;
type Zahlprop = (typeof ZAHLEN)[number];

/** Feld im Bearbeitungszustand: Zahlen als getippter Text, Merker für neue Felder. */
type EntwurfFeld = Omit<Feld, Zahlprop> & Record<Zahlprop, string> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean; _register: string };
/** Register im Bearbeitungszustand; welche Felder darauf liegen, steht am Feld (_register). */
type EntwurfRegister = Omit<Register, 'felder'> & { _uid: string; _neu?: boolean; _schluesselGetippt?: boolean };
/** Trefferliste im Entwurf: Systemspalten als _titel usw., Felder als feld:<_uid> – damit ein umbenannter Schlüssel nichts kaputt macht. */
interface Entwurf {
  id: string; name: string; beschreibung: string; titelVorlage: string; felder: EntwurfFeld[]; register: EntwurfRegister[]; trefferliste: string[];
  erstellenErlaubt: boolean; loeschenErlaubt: boolean;
}

function neueId(): string {
  // crypto.randomUUID gibt es nur über HTTPS oder localhost; im Heimnetz oft nicht.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const alsEntwurfRegister = ({ felder: _f, ...r }: Register): EntwurfRegister => ({ ...r, _uid: neueId() });

function entwurfAus(t?: Mappentyp): Entwurf {
  if (!t) return { id: neueId(), name: '', beschreibung: '', titelVorlage: '', felder: [], register: standardRegister([]).map(alsEntwurfRegister), trefferliste: [], erstellenErlaubt: true, loeschenErlaubt: true };
  const erstes = t.register.find((r) => r.art === 'felder')?.key ?? '';
  const e: Entwurf = {
    id: t.id, name: t.name, beschreibung: t.beschreibung, titelVorlage: t.titelVorlage ?? '',
    erstellenErlaubt: t.erstellenErlaubt !== false, loeschenErlaubt: t.loeschenErlaubt !== false,
    register: t.register.map(alsEntwurfRegister),
    felder: t.felder.map((f) => ({
      ...f, _uid: neueId(),
      _register: t.register.find((r) => r.art === 'felder' && r.felder?.includes(f.key))?.key ?? erstes,
      ...Object.fromEntries(ZAHLEN.map((p) => [p, f[p] == null ? '' : String(f[p]).replace('.', ',')])),
    }) as unknown as EntwurfFeld),
    trefferliste: [],
  };
  e.trefferliste = (t.trefferliste ?? []).flatMap((k) => {
    if (k.startsWith('_')) return [k];
    const f = e.felder.find((x) => x.key === k);
    return f ? [`feld:${f._uid}`] : [];
  });
  return e;
}

/** Für die Vorschau, solange es keine Mappe gibt. */
function beispielWerte(felder: Feld[]): Werte {
  const w: Werte = {};
  for (const f of felder) {
    switch (f.typ) {
      case 'zahl': w[f.key] = 42; break;
      case 'betrag': w[f.key] = { betrag: 123.45, waehrung: f.waehrung || 'EUR' }; break;
      case 'datum': w[f.key] = new Date().toISOString().slice(0, 10); break;
      case 'janein': w[f.key] = true; break;
      case 'auswahl': w[f.key] = f.optionen?.[0] ?? ''; break;
      case 'referenz': w[f.key] = 'beispiel'; break;
      case 'passwort': w[f.key] = null; break;
      default: w[f.key] = f.label || f.key;
    }
  }
  return w;
}

export function TypEditor({ typ }: { typ?: Mappentyp }) {
  const d = useDaten();
  const neu = !typ;
  const system = typ?.system;
  const [basis, setBasis] = useState(() => JSON.stringify(entwurfAus(typ)));
  const [e, setE] = useState<Entwurf>(() => JSON.parse(basis));
  const [offen, setOffen] = useState<number | null>(null);
  // Neue Typen bekommen eine eigene Sicht in der Ablage, außer man wählt das ab (#38).
  const [sichtAnlegen, setSichtAnlegen] = useState(true);
  const [fehler, setFehler] = useState<{ allgemein: string[]; felder: Record<string, string[]> } | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruende, setGruende] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  const geaendert = neu || JSON.stringify(e) !== basis;
  useUngespeichert(JSON.stringify(e) !== basis && (!neu || e.felder.length > 0 || e.name !== ''));

  const gespeichert = d.typ(e.id);
  const unpassend = gespeichert ? d.zaehler.typen[gespeichert.id]?.unpassend ?? 0 : 0;

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
      _register: e.register.find((r) => r.art === 'felder')?.key ?? '',
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
  async function entferne(i: number) {
    const f = e.felder[i];
    const n = gespeichert && d.anzahl(gespeichert.id) ? (await api.belegung(gespeichert.id).catch(() => ({} as Record<string, number>)))[f.key] ?? 0 : 0;
    const frage = n
      ? `${n} ${n === 1 ? 'Mappe hat' : 'Mappen haben'} in „${f.label}“ einen Wert. Die Werte bleiben gespeichert, werden aber nicht mehr angezeigt. Feld entfernen?`
      : `Feld „${f.label}“ entfernen?`;
    if (!confirm(frage)) return;
    setE((x) => ({ ...x, titelVorlage: x.titelVorlage.split(`{${f.key}}`).join('').trim(), felder: x.felder.filter((_, j) => j !== i) }));
    setOffen(null); setFehler(null);
  }

  async function speichern() {
    setSendet(true); setMeldung(undefined); setGruende([]);
    const daten = {
      ...e,
      felder: e.felder.map(({ _uid, _neu, _schluesselGetippt, _register, ...rest }) => rest),
      register: e.register.map(({ _uid, _neu, _schluesselGetippt, ...r }) =>
        (r.art === 'felder' ? { ...r, felder: e.felder.filter((f) => f._register === r.key).map((f) => f.key) } : r)),
      trefferliste: e.trefferliste.flatMap((k) => (k.startsWith('feld:') ? e.felder.filter((f) => `feld:${f._uid}` === k && f.typ !== 'passwort').map((f) => f.key) : [k])),
    };
    try {
      const t = neu ? await api.typAnlegen({ ...daten, sichtAnlegen }) : await api.typAendern(e.id, daten);
      const sauber = entwurfAus(t);
      setE(sauber); setBasis(JSON.stringify(sauber)); setFehler(null); setOffen(null);
      loeseWache();
      await d.neuLaden();
      if (neu) geheZu(`/werkbank/typen/${t.id}`);
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
    if (neu) { loeseWache(); geheZu('/werkbank/typen'); return; }
    if (!confirm(`Mappentyp „${e.name}“ endgültig löschen?`)) return;
    try {
      await api.typLoeschen(e.id);
      loeseWache(); await d.neuLaden(); geheZu('/werkbank/typen');
    } catch (err) {
      setMeldung((err as Error).message);
      setGruende((err as ApiFehler).gruende ?? []);
    }
  }

  const feldregister = e.register.filter((r) => r.art === 'felder');

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); void speichern(); }} noValidate>
      <div className="seitenkopf"><div>
        <p className="ueber">Mappentyp</p>
        <h1>{e.name || (neu ? 'Neuer Mappentyp' : 'Ohne Namen')}{system && <span className="chip">System</span>}</h1>
        {gespeichert && <p className="leise"><Link to={`/ablage/${gespeichert.id}`} className="verweis">{d.anzahl(gespeichert.id).toLocaleString('de-DE')} {d.anzahl(gespeichert.id) === 1 ? 'Mappe' : 'Mappen'} in der Ablage →</Link></p>}
      </div></div>

      {system && (
        <div className="hinweis info"><p>{system === 'benutzer'
          ? 'Systemmappentyp: Jeder Benutzer hat hier seine Mappe. Du kannst Felder und Register ergänzen; die Systemfelder sind fest und werden im Profil und in der Benutzerverwaltung gepflegt. Anlegen und Löschen geschieht nur in der Benutzerverwaltung.'
          : 'Systemmappentyp: Rollen, die Benutzer haben können. Du kannst Felder und Register ergänzen; das Systemfeld ist fest. Administrator und Mitglied sind Systemrollen und lassen sich nicht löschen.'}</p></div>
      )}
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
        </div>
        <div className="raster">
          <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={e.erstellenErlaubt} disabled={system === 'benutzer'} onChange={(ev) => setE({ ...e, erstellenErlaubt: ev.target.checked })} />
            <span>Neue Mappen erlauben<small className="hilfe">In der Ablage dürfen Mappen dieses Typs angelegt werden</small></span></label></div>
          <div className="eigenschaft unten"><label className="haken"><input type="checkbox" checked={e.loeschenErlaubt} disabled={system === 'benutzer'} onChange={(ev) => setE({ ...e, loeschenErlaubt: ev.target.checked })} />
            <span>Löschen erlauben<small className="hilfe">In der Ablage dürfen Mappen dieses Typs gelöscht werden</small></span></label></div>
        </div>
        {neu && <label className="haken"><input type="checkbox" checked={sichtAnlegen} onChange={(ev) => setSichtAnlegen(ev.target.checked)} />
          <span>Eigene Sicht in der Ablage anlegen<small className="hilfe">Abwählen, wenn die Mappen in einer bestehenden Sicht erscheinen sollen – das stellst du unter Werkbank → Sichten ein.</small></span></label>}
      </div>

      <TitelEditor e={e} setze={(titelVorlage) => setE((x) => ({ ...x, titelVorlage }))} />

      <TrefferlisteEditor e={e} setze={(trefferliste) => setE((x) => ({ ...x, trefferliste }))} />

      <div className="blatt">
        <div className="blattkopf">
          <h2 className="h3">Felder</h2>
          <p className="leise">Feld anklicken, um Datentyp und Eigenschaften festzulegen. Die Reihenfolge gilt auch im Formular.</p>
        </div>
        <div className="feldliste">
          {e.felder.length === 0 && <div className="leer"><p>Noch keine Felder. Füge das erste hinzu, etwa „Bezeichnung“ als Text.</p></div>}
          {e.felder.map((f, i) => (
            <FeldZeile key={f._uid} f={f} i={i} anzahl={e.felder.length} offen={offen === i} fehler={fehler?.felder[String(i)]}
              eigeneId={e.id} eigenerName={e.name} typen={d.typen} feldregister={feldregister}
              umschalten={() => setOffen(offen === i ? null : i)}
              verschiebe={(r) => verschiebe(i, r)} entferne={() => void entferne(i)}
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

      <RegisterEditor e={e} setE={setE} />

      <div className="speicherleiste">
        {system ? <span /> : <button type="button" className="textknopf gefahr" onClick={() => void loeschen()}>{neu ? 'Entwurf verwerfen' : 'Mappentyp löschen'}</button>}
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
  eigeneId: string; eigenerName: string; typen: Mappentyp[]; feldregister: EntwurfRegister[];
  umschalten(): void; verschiebe(r: number): void; entferne(): void; setze(patch: Partial<EntwurfFeld>): void;
}) {
  const { f, i, offen, fehler, setze } = p;
  const id = (x: string) => `f${i}-${x}`;
  const zielName = f.zielTyp === p.eigeneId ? (p.eigenerName || 'dieser Typ') : p.typen.find((t) => t.id === f.zielTyp)?.name ?? '–';

  const chips: string[] = [];
  if (f.system) chips.push('System');
  if (f.eindeutig && (f.typ === 'text' || f.typ === 'zahl')) chips.push('eindeutig');
  if (f.typ === 'referenz') chips.push(`→ ${zielName}`, VERWEISARTEN[f.verweisart ?? 'bezug']);
  if (f.typ === 'auswahl') chips.push(`${(f.optionen ?? []).length} Werte`);
  if (f.mehrfach && (f.typ === 'auswahl' || f.typ === 'referenz')) chips.push('mehrfach');
  if (p.feldregister.length > 1) chips.push(`Register: ${p.feldregister.find((r) => r.key === f._register)?.name ?? '–'}`);

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
  else if (f.typ === 'passwort') besonders = <p className="leise klein">Wird verschlüsselt gespeichert und erscheint nie im Titel, in der Trefferliste, in der Suche oder in Demo-Daten. Anzeigen lässt es sich nur einzeln über das Auge; das steht im Protokoll.</p>;
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
          {f.system && <p className="leise klein">Systemfeld: Bezeichnung, Hilfetext und Register lassen sich ändern, Datentyp und Eigenschaften sind fest.</p>}
          <div className="raster">
            <label className="eigenschaft" htmlFor={id('label')}><span>Bezeichnung</span><input id={id('label')} value={f.label} placeholder="z. B. Kündigung bis" onChange={(e) => setze({ label: e.target.value })} autoFocus={f._neu} /></label>
            {p.feldregister.length > 1 && (
              <label className="eigenschaft" htmlFor={id('reg')}><span>Register</span>
                <select id={id('reg')} value={f._register} onChange={(e) => setze({ _register: e.target.value })}>
                  {p.feldregister.map((r) => <option key={r._uid} value={r.key}>{r.name || r.key}</option>)}
                </select></label>
            )}
          </div>
          {/* Bei Systemfeldern sind Schlüssel, Datentyp und Eigenschaften fest. */}
          <fieldset className="ohnerahmen" disabled={f.system}>
          <div className="raster">
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
          </fieldset>
          <label className="eigenschaft" htmlFor={id('hilfe')}><span>Hilfetext</span><input id={id('hilfe')} placeholder="Erklärung, die beim Ausfüllen erscheint" value={f.hilfe ?? ''} onChange={(e) => setze({ hilfe: e.target.value })} /></label>
          <div className="feldfuss">
            {f.system ? <span className="leise klein">Systemfelder lassen sich nicht entfernen.</span> : <button type="button" className="textknopf gefahr" onClick={p.entferne}>Feld entfernen</button>}
            <button type="button" className="knopf klein" onClick={p.umschalten}>Fertig</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function TitelEditor({ e, setze }: { e: Entwurf; setze: (v: string) => void }) {
  const d = useDaten();
  const feld = useRef<HTMLInputElement>(null);
  // Beispiele für die Vorschau: die ersten Mappen dieses Typs.
  const [mappen, setMappen] = useState<Mappe[]>([]);
  const [bezuege, setBezuege] = useState<Bezuege>({});
  const [beispielId, setBeispielId] = useState<string>('');
  useEffect(() => {
    if (!d.anzahl(e.id)) return;
    api.seite(`typ:${e.id}`, 0, 50).then((s) => { setMappen(s.mappen); setBezuege(s.bezuege); setBeispielId((b) => b || s.mappen[0]?.id || ''); }).catch(() => {});
  }, [e.id, d.stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const felder = e.felder as unknown as Feld[];
  const v = e.titelVorlage;
  const unbekannt = vorlageFelder(v).filter((k) => !istIndexplatzhalter(k) && !felder.some((f) => f.key === k));
  const beispiel = mappen.find((m) => m.id === beispielId);
  const werte = beispiel ? beispiel.werte : beispielWerte(felder);
  const jetzt = new Date().toISOString();
  const vorschau = titelAus({ felder, titelVorlage: v }, werte, (id) => (id === 'beispiel' ? '‹verwiesene Mappe›' : titelOder(bezuege[id]?.titel)),
    beispiel ?? { erstellt: jetzt, geaendert: jetzt });
  const automatisch = wirksameVorlage({ felder, titelVorlage: '' });

  function einsetzen(key: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? v.length;
    const bis = el?.selectionEnd ?? von;
    const platz = `{${key}}`;
    setze(v.slice(0, von) + platz + v.slice(bis));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(von + platz.length, von + platz.length); });
  }

  return (
    <div className="blatt">
      <div className="blattkopf">
        <h2 className="h3">Titel einer Mappe</h2>
        <p className="leise">So heißt eine Mappe in Listen und Verweisen. Felder in geschweiften Klammern werden eingesetzt, alles andere bleibt stehen.</p>
      </div>
      <label className="eigenschaft" htmlFor="titel-vorlage"><span>Vorlage</span>
        <input id="titel-vorlage" ref={feld} className="mono" value={v} onChange={(ev) => setze(ev.target.value)}
          placeholder={automatisch ? `leer = ${automatisch}` : 'z. B. {verwendungszweck} vom {zahlungsdatum}'} /></label>
      <div className="chipwahl">
        <span className="leise klein">Einsetzen:</span>
        {/* Passwörter nie im Titel (#46). */}
        {felder.filter((f) => f.typ !== 'passwort').map((f) => <button key={f.key} type="button" className="chipknopf" onClick={() => einsetzen(f.key)}>{f.label || f.key}</button>)}
        {Object.entries(INDEXPLATZHALTER).map(([k, name]) => (
          <button key={k} type="button" className="chipknopf index" title={`Indexwert {${k}}: Datum, an dem die Mappe ${k === 'angelegt' ? 'angelegt' : 'zuletzt geändert'} wurde`} onClick={() => einsetzen(k)}>{name}</button>
        ))}
      </div>
      {unbekannt.length > 0 && <p className="fehlertext">Diese Platzhalter passen zu keinem Feld: {unbekannt.map((k) => `{${k}}`).join(', ')}</p>}
      <div className="vorschau">
        <span className="ueber">Vorschau</span>
        <strong className="vorschautitel">{vorschau || 'Ohne Titel'}</strong>
        {mappen.length > 0
          ? <label className="klein leise">mit den Werten von&nbsp;
              <select value={beispielId} onChange={(ev) => setBeispielId(ev.target.value)}>
                {mappen.map((m) => <option key={m.id} value={m.id}>{titelOder(m.titel)}</option>)}
              </select></label>
          : <span className="klein leise">mit Beispielwerten</span>}
      </div>
    </div>
  );
}

function RegisterEditor({ e, setE }: { e: Entwurf; setE: (f: (x: Entwurf) => Entwurf) => void }) {
  const d = useDaten();
  const setzeReg = (i: number, patch: Partial<EntwurfRegister>) =>
    setE((x) => ({ ...x, register: x.register.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const eindeutig = (basis: string, i: number) => {
    let k = basis || 'register'; let n = 2;
    while (e.register.some((r, j) => j !== i && r.key === k)) k = `${basis}_${n++}`.slice(0, 40);
    return k;
  };

  function hinzufuegen(art: Registerart) {
    const name = { felder: 'Weitere Angaben', dokumente: 'Dokumente', verknuepfungen: 'Verknüpfungen' }[art];
    const r: EntwurfRegister = { key: eindeutig(schluesselAus(name), -1), name, art, _uid: neueId(), _neu: true, ...(art === 'verknuepfungen' ? { quellen: [] } : {}) };
    setE((x) => ({ ...x, register: [...x.register, r] }));
  }
  function verschiebe(i: number, rueck: number) {
    const j = i + rueck;
    if (j < 0 || j >= e.register.length) return;
    setE((x) => { const rs = [...x.register]; [rs[i], rs[j]] = [rs[j], rs[i]]; return { ...x, register: rs }; });
  }
  function entferne(i: number) {
    const r = e.register[i];
    if (r.art === 'felder') {
      const ziel = e.register.find((x, j) => j !== i && x.art === 'felder');
      const betroffen = e.felder.filter((f) => f._register === r.key);
      if (betroffen.length && !ziel) { alert('Auf diesem Register liegen Felder, und es gibt kein anderes Feldregister. Lege zuerst ein weiteres an.'); return; }
      if (!confirm(betroffen.length ? `Register „${r.name}“ entfernen? Seine ${betroffen.length} Felder wandern auf „${ziel!.name}“.` : `Register „${r.name}“ entfernen?`)) return;
      setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i), felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: ziel!.key } : f)) }));
      return;
    }
    if (!confirm(`Register „${r.name}“ entfernen?${r.art === 'dokumente' ? ' Enthält es noch Dokumente, lässt sich der Mappentyp nicht speichern.' : ''}`)) return;
    setE((x) => ({ ...x, register: x.register.filter((_, j) => j !== i) }));
  }

  // Mögliche Quellen: jedes Referenzfeld, das auf diesen Mappentyp zeigt (auch aus ihm selbst).
  const quellen = [
    ...d.typen.filter((t) => t.id !== e.id).flatMap((t) => t.felder.filter((f) => f.typ === 'referenz' && f.zielTyp === e.id).map((f) => ({ typId: t.id, feldKey: f.key, text: `${t.name} › ${f.label}` }))),
    ...e.felder.filter((f) => f.typ === 'referenz' && f.zielTyp === e.id).map((f) => ({ typId: e.id, feldKey: f.key, text: `${e.name || 'Dieser Typ'} › ${f.label}` })),
  ];

  return (
    <div className="blatt">
      <div className="blattkopf">
        <h2 className="h3">Register</h2>
        <p className="leise">Die Trennblätter einer Mappe, in dieser Reihenfolge. Welche Felder auf welchem Feldregister liegen, stellst du am Feld ein.</p>
      </div>
      <div className="registerliste">
        {e.register.map((r, i) => {
          const anzahl = e.felder.filter((f) => f._register === r.key).length;
          const gewaehlt = r.quellen ?? [];
          return (
            <div key={r._uid} className={`registerzeile art-${r.art}`}>
              <div className="registerkopf">
                <span className="chip">{REGISTERARTEN[r.art]}</span>
                <input aria-label="Name des Registers" value={r.name} onChange={(ev) => {
                  const name = ev.target.value;
                  if (!r._neu) { setzeReg(i, { name }); return; }
                  const key = eindeutig(schluesselAus(name), i);
                  // Felder auf diesem Register wandern mit dem neuen Schlüssel mit.
                  setE((x) => ({
                    ...x,
                    register: x.register.map((y, j) => (j === i ? { ...y, name, key } : y)),
                    felder: x.felder.map((f) => (f._register === r.key ? { ...f, _register: key } : f)),
                  }));
                }} />
                <code className="fkey" title="Schlüssel">{r.key}</code>
                <div className="feldaktionen">
                  <button type="button" className="symbol" disabled={i === 0} onClick={() => verschiebe(i, -1)} aria-label="Register nach vorn">↑</button>
                  <button type="button" className="symbol" disabled={i === e.register.length - 1} onClick={() => verschiebe(i, 1)} aria-label="Register nach hinten">↓</button>
                  <button type="button" className="symbol" onClick={() => entferne(i)} aria-label={`Register ${r.name} entfernen`}>×</button>
                </div>
              </div>
              {r.art === 'felder' && <p className="leise klein">{anzahl ? `${anzahl} Feld${anzahl === 1 ? '' : 'er'}: ${e.felder.filter((f) => f._register === r.key).map((f) => f.label).join(', ')}` : 'Noch keine Felder.'}</p>}
              {r.art === 'dokumente' && <p className="leise klein">Hier werden Dateien hochgeladen; PDFs und Bilder sind direkt ansehbar.</p>}
              {r.art === 'verknuepfungen' && (
                quellen.length === 0
                  ? <p className="leise klein">Noch verweist kein Referenzfeld auf diesen Mappentyp. Das Register zeigt alle Verweise, sobald es welche gibt.</p>
                  : <fieldset className="wahl"><legend className="klein">Zeigt Mappen, die so hierher verweisen <span className="leise">(keine Auswahl = alle)</span></legend>
                      {quellen.map((q) => {
                        const an = gewaehlt.some((g) => g.typId === q.typId && g.feldKey === q.feldKey);
                        return <label key={`${q.typId}-${q.feldKey}`} className="haken"><input type="checkbox" checked={an}
                          onChange={() => setzeReg(i, { quellen: an ? gewaehlt.filter((g) => !(g.typId === q.typId && g.feldKey === q.feldKey)) : [...gewaehlt, { typId: q.typId, feldKey: q.feldKey }] })} />
                          <span>{q.text}</span></label>;
                      })}
                    </fieldset>
              )}
            </div>
          );
        })}
      </div>
      <div className="knoepfe">
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('felder')}>+ Feldregister</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('dokumente')}>+ Dokumentenregister</button>
        <button type="button" className="knopf klein" onClick={() => hinzufuegen('verknuepfungen')}>+ Verknüpfungsregister</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

/** Spalten der Trefferliste: auswählen und anordnen (#19). */
function TrefferlisteEditor({ e, setze }: { e: Entwurf; setze: (t: string[]) => void }) {
  const name = (k: string) => (k.startsWith('feld:') ? e.felder.find((f) => `feld:${f._uid}` === k)?.label || '(Feld ohne Namen)' : SYSTEMSPALTEN[k as Systemspalte] ?? k);
  // Spalten gelöschter Felder fallen weg.
  // Spalten gelöschter Felder und Passwortfelder (#46) fallen weg.
  const liste = e.trefferliste.filter((k) => !k.startsWith('feld:') || e.felder.some((f) => `feld:${f._uid}` === k && f.typ !== 'passwort'));
  const verfuegbar = [
    ...e.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ k: `feld:${f._uid}`, n: f.label || f.key })),
    ...(Object.keys(SYSTEMSPALTEN) as Systemspalte[]).filter((k) => k !== '_typ').map((k) => ({ k, n: SYSTEMSPALTEN[k] })),
  ].filter((x) => !liste.includes(x.k));
  const schiebe = (i: number, r: number) => {
    const j = i + r;
    if (j < 0 || j >= liste.length) return;
    const n = [...liste]; [n[i], n[j]] = [n[j], n[i]]; setze(n);
  };
  return (
    <div className="blatt">
      <div className="blattkopf">
        <h2 className="h3">Trefferliste</h2>
        <p className="leise">Spalten, wenn die Liste breit genug ist, in dieser Reihenfolge. In schmalen Ansichten bilden die ersten drei den kompakten Eintrag: die erste fett, die zweite und dritte darunter. Leer = Titel und zwei Felder wie bisher.</p>
      </div>
      {liste.length > 0 && (
        <ol className="spaltenliste">
          {liste.map((k, i) => (
            <li key={k} className={i < 3 ? 'kompakt' : ''}>
              <span className="nr">{i + 1}</span>
              <span className="nm">{name(k)}{k.startsWith('_') && <span className="chip">System</span>}</span>
              <span className="aktionen">
                <button type="button" className="symbol" disabled={i === 0} onClick={() => schiebe(i, -1)} aria-label={`${name(k)} nach vorn`}>↑</button>
                <button type="button" className="symbol" disabled={i === liste.length - 1} onClick={() => schiebe(i, 1)} aria-label={`${name(k)} nach hinten`}>↓</button>
                <button type="button" className="symbol" onClick={() => setze(liste.filter((x) => x !== k))} aria-label={`${name(k)} entfernen`}>×</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {verfuegbar.length > 0 && (
        <label className="eigenschaft schmal"><span>Spalte hinzufügen</span>
          <select value="" onChange={(ev) => { if (ev.target.value) setze([...liste, ev.target.value]); }}>
            <option value="">– wählen –</option>
            {verfuegbar.map((x) => <option key={x.k} value={x.k}>{x.n}{x.k.startsWith('_') ? ' (System)' : ''}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
