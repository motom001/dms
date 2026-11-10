import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { darfErstellen, darfPostAnlegen, MAX_DATEIGROESSE, type Mappentyp } from '../../../shared/src/model';
import { api, type Fundstelle } from '../api';
import { Fundstellen, fundstellenFuer } from './Doppelt';
import { useDaten } from '../daten';
import { useErreichbarkeit } from '../erreichbar';
import { geheZu, Link } from '../ort';
import { wartungAktiv } from '../wartung';
import { istTouch, postFotografieren } from './PostKamera';
import { Symbol } from '../Symbol';
import { t, tn } from '../sprache';
import { knopfAussehen } from '../bausteine';

/**
 * Neue Post von überall (#193): Dateien irgendwo ins Fenster ziehen oder über „+ Neu“ wählen –
 * daraus wird eine Post-Mappe mit allen Dateien, die sich danach öffnet. Auf einer geöffneten
 * Mappe mit Dokumentenregister gibt es zwei Ziele: in diese Mappe oder als neue Post.
 */

const NEUE_POST = 'dms:neue-post';
const ohneEndung = (n: string) => n.replace(/\.[^.]{1,8}$/, '').trim() || n;

/** Startet „neue Post“ mit diesen Dateien (Fortschritt und Fehler zeigt PostAblage). */
export function neuePost(dateien: File[]) {
  if (dateien.length) dispatchEvent(new CustomEvent<File[]>(NEUE_POST, { detail: dateien }));
}

/* ---------- Ziel „in diese Mappe“: meldet die geöffnete Mappe mit Dokumentenregister an ---------- */

/** `titel`/`text` (#934): eigene Beschriftung, z. B. „In diese Post“ auf der Seite „Dokument übernehmen“. */
export interface MappenZiel { name: string; nimm: (dateien: File[]) => void; titel?: string; text?: string }
let ziele: MappenZiel[] = [];
const zielHoerer = new Set<() => void>();
const zielGeaendert = () => zielHoerer.forEach((f) => f());

/** In der Dokumentenliste einer Mappe: solange sie zu sehen ist, ist sie ein Ziel beim Ablegen. */
export function useMappenZiel(ziel: MappenZiel | null) {
  const ref = useRef(ziel);
  ref.current = ziel;
  const aktiv = !!ziel;
  useEffect(() => {
    if (!aktiv) return;
    const eintrag: MappenZiel = { get name() { return ref.current?.name ?? ''; }, get titel() { return ref.current?.titel; }, get text() { return ref.current?.text; }, nimm: (d) => ref.current?.nimm(d) };
    ziele = [...ziele, eintrag];
    zielGeaendert();
    return () => { ziele = ziele.filter((z) => z !== eintrag); zielGeaendert(); };
  }, [aktiv]);
}

function useAktuellesZiel(): MappenZiel | null {
  const [, neu] = useState(0);
  useEffect(() => { const f = () => neu((n) => n + 1); zielHoerer.add(f); return () => { zielHoerer.delete(f); }; }, []);
  return ziele[0] ?? null;
}

const nurDateien = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const postTyp = (typen: Mappentyp[]) => typen.find((mappentyp) => mappentyp.system === 'post');

/** Fläche beim Ziehen, Fortschritt und Fehler beim Hochladen. Einmal in der App eingebunden. */
/**
 * Ablegen überall (#193). In der Werkbank (#649) legt eine hineingezogene Datei keine Post an – es erscheint nur der
 * Hinweis, dass Dokumente in der Ablage abgelegt werden, mit Link dorthin.
 */
export function PostAblage({ werkbank = false }: { werkbank?: boolean }) {
  const d = useDaten();
  const typ = postTyp(d.typen);
  const register = typ?.register.find((r) => r.art === 'dokumente')?.key;
  const erreichbar = useErreichbarkeit().stufe !== 'weg';
  const darf = darfPostAnlegen(typ) && !!register;
  const gesperrt = wartungAktiv() ? t('ablage.neuepost.im-wartungsmodus-lassen-sich') : !erreichbar ? t('ablage.neuepost.ablago-ist-gerade-nicht') : null;
  const ziel = useAktuellesZiel();
  const [zieht, setZieht] = useState(false);
  const [ueber, setUeber] = useState<'post' | 'mappe' | null>(null);
  const [laeuft, setLaeuft] = useState<string>();
  const [fehler, setFehler] = useState<string[]>([]);
  const [hinweis, setHinweis] = useState<string>();
  const zaehler = useRef(0);
  const [inWerkbank, setInWerkbank] = useState(false);
  const zustand = useRef({ darf, gesperrt, werkbank });
  zustand.current = { darf, gesperrt, werkbank };

  // Doppelte Dateien (#333): vor dem Anlegen fragen, je betroffener Datei.
  const [rueckfrage, setRueckfrage] = useState<{ dateien: File[]; doppelt: Array<{ datei: File; f: Fundstelle[] }>; trotzdem: Set<File> } | null>(null);
  async function pruefen(alle: File[]) {
    if (!typ || !register) return;
    setLaeuft(t('ablage.neuepost.pruefe-ob-es-die'));
    const m = await fundstellenFuer(alle.map((datei) => ({ datei })));
    setLaeuft(undefined);
    if (!m.size) { await anlegen(alle); return; }
    setRueckfrage({ dateien: alle, doppelt: [...m].map(([x, f]) => ({ datei: x.datei, f })), trotzdem: new Set() });
  }
  async function weiter() {
    const r = rueckfrage; setRueckfrage(null);
    if (!r) return;
    const doppelt = new Set(r.doppelt.map((x) => x.datei));
    const nehmen = r.dateien.filter((f) => !doppelt.has(f) || r.trotzdem.has(f));
    if (nehmen.length) await anlegen(nehmen);
  }

  async function anlegen(alle: File[]) {
    if (!typ || !register) return;
    const zuGross = alle.filter((f) => f.size > MAX_DATEIGROESSE);
    const leer = alle.filter((f) => f.size === 0);
    const dateien = alle.filter((f) => f.size > 0 && f.size <= MAX_DATEIGROESSE);
    const schief = [...zuGross.map((f) => t('ablage.neuepost.groesser-als-100-mb', { name: f.name })), ...leer.map((f) => t('ablage.neuepost.leer', { name: f.name }))];
    setFehler([]);
    if (!dateien.length) { setFehler(schief); return; }
    setLaeuft(t('ablage.neuepost.lege-post-an'));
    try {
      const m = await api.postAnlegen({ betreff: ohneEndung(dateien[0].name).slice(0, 250) });
      for (const [i, f] of dateien.entries()) {
        setLaeuft(t('ablage.neuepost.lade-hoch-von', { name: f.name, wert: i + 1, dateien: dateien.length }));
        try { await api.ladeHoch(m.id, register, f); } catch (e) { schief.push(`„${f.name}“: ${(e as Error).message}`); }
      }
      setFehler(schief);
      await d.neuLaden();
      geheZu(`/ablage/${typ.id}/${m.id}`);
    } catch (e) { setFehler([...schief, (e as Error).message]); } finally { setLaeuft(undefined); }
  }
  const pruefenRef = useRef(pruefen);
  pruefenRef.current = pruefen;

  useEffect(() => {
    const neu = (e: Event) => { if (!zustand.current.werkbank) void pruefenRef.current((e as CustomEvent<File[]>).detail); };
    const rein = (e: DragEvent) => {
      if (!nurDateien(e)) return;
      e.preventDefault();
      zaehler.current++;
      const { darf: ok } = zustand.current;
      if (zustand.current.werkbank) { setInWerkbank(true); return; }
      const zu = wartungAktiv() ? t('ablage.neuepost.im-wartungsmodus-lassen-sich') : zustand.current.gesperrt;
      if (zu) { setHinweis(zu); return; }
      if (ok) setZieht(true);
    };
    const raus = (e: DragEvent) => {
      if (!nurDateien(e)) return;
      zaehler.current = Math.max(0, zaehler.current - 1);
      if (zaehler.current === 0) { setZieht(false); setUeber(null); }
    };
    const ueberFenster = (e: DragEvent) => { if (nurDateien(e)) e.preventDefault(); };
    // Fallen außerhalb eines Ziels: nichts tun, aber den Browser die Datei nicht öffnen lassen.
    const fallen = (e: DragEvent) => { if (nurDateien(e)) { e.preventDefault(); zaehler.current = 0; setZieht(false); setUeber(null); } };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') { zaehler.current = 0; setZieht(false); setUeber(null); } };
    addEventListener(NEUE_POST, neu);
    addEventListener('dragenter', rein);
    addEventListener('dragleave', raus);
    addEventListener('dragover', ueberFenster);
    addEventListener('drop', fallen);
    addEventListener('keydown', taste);
    return () => {
      removeEventListener(NEUE_POST, neu);
      removeEventListener('dragenter', rein);
      removeEventListener('dragleave', raus);
      removeEventListener('dragover', ueberFenster);
      removeEventListener('drop', fallen);
      removeEventListener('keydown', taste);
    };
  }, []);
  useEffect(() => { if (!hinweis) return; const timer = setTimeout(() => setHinweis(undefined), 5000); return () => clearTimeout(timer); }, [hinweis]);
  useEffect(() => { if (!inWerkbank) return; const timer = setTimeout(() => setInWerkbank(false), 8000); return () => clearTimeout(timer); }, [inWerkbank]);
  useEffect(() => { if (!werkbank) setInWerkbank(false); }, [werkbank]);

  const ablegen = (wohin: 'post' | 'mappe') => (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zaehler.current = 0;
    setZieht(false); setUeber(null);
    const dateien = [...e.dataTransfer.files];
    if (wohin === 'mappe' && ziel) ziel.nimm(dateien); else void pruefen(dateien);
  };

  return (
    <>
      {zieht && (
        <div className={`ablageflaeche ${ziel ? 'zwei' : ''}`} role="dialog" aria-label={t('ablage.neuepost.dateien-ablegen')}>
          {ziel && (
            <div className={`ablageziel ${ueber === 'mappe' ? 'drauf' : ''}`} onDragOver={(e) => { e.preventDefault(); setUeber('mappe'); }} onDrop={ablegen('mappe')}>
              <strong>{ziel.titel ?? t('ablage.neuepost.in-diese-mappe')}</strong><span>{ziel.text ?? t('ablage.neuepost.register-uebernommen-mit-mappe', { name: ziel.name })}</span>
            </div>
          )}
          <div className={`ablageziel ${ueber === 'post' ? 'drauf' : ''}`} onDragOver={(e) => { e.preventDefault(); setUeber('post'); }} onDrop={ablegen('post')}>
            <strong>{ziel ? t('ablage.neuepost.als-neue-post') : t('ablage.neuepost.hier-neue-dokumente-ablegen')}</strong><span>{t('ablage.neuepost.alle-dateien-kommen-zusammen')}</span>
          </div>
        </div>
      )}
      {rueckfrage && (
        <div className="ablagestatus doppeltfrage" role="dialog" aria-label={t('ablage.neuepost.dateien-schon-vorhanden')}>
          <p><strong>{t('ablage.neuepost.dateien-gibt-es-schon', { anzahl: rueckfrage.doppelt.length })}</strong></p>
          <ul>{rueckfrage.doppelt.map(({ datei, f }) => (
            <li key={`${datei.name}-${datei.size}-${datei.lastModified}`}>
              <strong>{datei.name}</strong> – <Fundstellen f={f} beiKlick={() => setRueckfrage(null)} />
              <label className="haken klein"><input type="checkbox" checked={rueckfrage.trotzdem.has(datei)}
                onChange={(e) => { const set = new Set(rueckfrage.trotzdem); if (e.target.checked) set.add(datei); else set.delete(datei); setRueckfrage({ ...rueckfrage, trotzdem: set }); }} /><span>{t('ablage.neuepost.trotzdem-ablegen')}</span></label>
            </li>
          ))}</ul>
          {rueckfrage.dateien.length > rueckfrage.doppelt.length && <p className="leise klein">{t('ablage.neuepost.die-uebrigen-dateien-werden', { wert: rueckfrage.dateien.length - rueckfrage.doppelt.length })}</p>}
          <div className="knoepfe">
            <button type="button" className="knopf primaer klein" onClick={() => void weiter()}>{t('ablage.neuepost.weiter')}</button>
            <button type="button" className="knopf klein" onClick={() => setRueckfrage(null)}>{t('ablage.neuepost.abbrechen')}</button>
          </div>
        </div>
      )}
      {inWerkbank && (
        <div className="ablagestatus" role="status" id="werkbank-ablegen">
          <p>{t('werkbank.ablegen.hinweis')} <Link to="/ablage">{t('werkbank.ablegen.link')}</Link></p>
        </div>
      )}
      {(laeuft || fehler.length > 0 || hinweis) && (
        <div className="ablagestatus" role={fehler.length ? 'alert' : 'status'}>
          {laeuft && <p>{laeuft}</p>}
          {hinweis && <p>{hinweis}</p>}
          {fehler.length > 0 && <>
            <p><strong>{t('ablage.neuepost.nicht-abgelegt')}</strong></p>
            <ul>{fehler.map((x) => <li key={x}>{x}</li>)}</ul>
            <button type="button" className="knopf klein" onClick={() => setFehler([])}>{t('ablage.neuepost.schliessen')}</button>
          </>}
        </div>
      )}
    </>
  );
}

/** „+ Neu“ in der Kopfzeile: neue Post (Dateien, am Handy auch Kamera) oder neue Mappe eines Typs. */
export function NeuKnopf() {
  const d = useDaten();
  const typ = postTyp(d.typen);
  const post = darfPostAnlegen(typ) && !!typ?.register.some((r) => r.art === 'dokumente');
  const typen = d.typen.filter((mappentyp) => darfErstellen(mappentyp)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const [offen, setOffen] = useState(false);
  const [mappe, setMappe] = useState(false);
  const touch = istTouch();
  const eingabe = useRef<HTMLInputElement>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => { if (!rahmen.current?.contains(e.target as Node)) { setOffen(false); setMappe(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOffen(false); setMappe(false); } };
    addEventListener('mousedown', zu);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', zu); removeEventListener('keydown', esc); };
  }, [offen]);
  if (!post && !typen.length) return null;
  return (
    <div className="neuknopf" ref={rahmen}>
      <button type="button" {...knopfAussehen({ art: 'anlegen', groesse: 'klein' })} data-anker="neu" aria-haspopup="menu" aria-expanded={offen} onClick={() => { setOffen(!offen); setMappe(false); }}>{t('ablage.neuepost.neu')}</button>
      {offen && <div className="hy-schleier" aria-hidden="true" onClick={() => { setOffen(false); setMappe(false); }} />}
      {offen && (
        <div className="menue" role="menu">
          {!mappe ? <>
            {/* Handy (#490): erster Eintrag öffnet direkt die Kamera; „Datei oder Foto wählen“ bleibt für alles andere. */}
            {post && touch && <button type="button" className="menuepunkt" role="menuitem" onClick={() => { setOffen(false); postFotografieren(); }}>{tn('ablage.neuepost.post-fotografieren', { symbol: <Symbol name="kamera" /> })}</button>}
            {post && <button type="button" className="menuepunkt" role="menuitem" onClick={() => { setOffen(false); eingabe.current?.click(); }}>{touch ? <>{tn('ablage.neuepost.post', { span: <span className="leise klein">{t('ablage.neuepost.datei-oder-foto-waehlen')}</span> })}</> : <>{tn('ablage.neuepost.post', { span: <span className="leise klein">{t('ablage.neuepost.dateien-auswaehlen-oder')}</span> })}</>}</button>}
            {typen.length > 0 && <button type="button" className="menuepunkt" role="menuitem" onClick={() => setMappe(true)}>{tn('ablage.neuepost.mappe', { span: <span aria-hidden="true">›</span> })}</button>}
          </> : <>
            <p className="leise klein">{t('ablage.neuepost.neue-mappe-vom-mappentyp')}</p>
            {typen.map((mappentyp) => <button key={mappentyp.id} type="button" className="menuepunkt" role="menuitem" onClick={() => { setOffen(false); setMappe(false); geheZu(`/ablage/${mappentyp.id}/neu`); }}>{mappentyp.name}</button>)}
          </>}
        </div>
      )}
      {/* Ohne „capture“: Am Handy bietet die Auswahl Kamera und Dateien an. */}
      <input ref={eingabe} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; neuePost(f); }} />
    </div>
  );
}
