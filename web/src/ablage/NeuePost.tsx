import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { darfErstellen, darfPostAnlegen, MAX_DATEIGROESSE, type Mappentyp } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { useErreichbarkeit } from '../erreichbar';
import { geheZu } from '../ort';
import { wartungAktiv } from '../wartung';

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

export interface MappenZiel { name: string; nimm: (dateien: File[]) => void }
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
    const eintrag: MappenZiel = { get name() { return ref.current?.name ?? ''; }, nimm: (d) => ref.current?.nimm(d) };
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
const postTyp = (typen: Mappentyp[]) => typen.find((t) => t.system === 'post');

/** Fläche beim Ziehen, Fortschritt und Fehler beim Hochladen. Einmal in der App eingebunden. */
export function PostAblage() {
  const d = useDaten();
  const typ = postTyp(d.typen);
  const register = typ?.register.find((r) => r.art === 'dokumente')?.key;
  const erreichbar = useErreichbarkeit().stufe !== 'weg';
  const darf = darfPostAnlegen(typ) && !!register;
  const gesperrt = wartungAktiv() ? 'Im Wartungsmodus lassen sich keine Dateien ablegen.' : !erreichbar ? 'Das DMS ist gerade nicht erreichbar – Dateien lassen sich nicht ablegen.' : null;
  const ziel = useAktuellesZiel();
  const [zieht, setZieht] = useState(false);
  const [ueber, setUeber] = useState<'post' | 'mappe' | null>(null);
  const [laeuft, setLaeuft] = useState<string>();
  const [fehler, setFehler] = useState<string[]>([]);
  const [hinweis, setHinweis] = useState<string>();
  const zaehler = useRef(0);
  const zustand = useRef({ darf, gesperrt });
  zustand.current = { darf, gesperrt };

  async function anlegen(alle: File[]) {
    if (!typ || !register) return;
    const zuGross = alle.filter((f) => f.size > MAX_DATEIGROESSE);
    const leer = alle.filter((f) => f.size === 0);
    const dateien = alle.filter((f) => f.size > 0 && f.size <= MAX_DATEIGROESSE);
    const schief = [...zuGross.map((f) => `„${f.name}“: größer als 100 MB`), ...leer.map((f) => `„${f.name}“: leer`)];
    setFehler([]);
    if (!dateien.length) { setFehler(schief); return; }
    setLaeuft('Lege Post an …');
    try {
      const m = await api.postAnlegen({ betreff: ohneEndung(dateien[0].name).slice(0, 250) });
      for (const [i, f] of dateien.entries()) {
        setLaeuft(`Lade hoch: ${f.name} (${i + 1} von ${dateien.length}) …`);
        try { await api.ladeHoch(m.id, register, f); } catch (e) { schief.push(`„${f.name}“: ${(e as Error).message}`); }
      }
      setFehler(schief);
      await d.neuLaden();
      geheZu(`/ablage/${typ.id}/${m.id}`);
    } catch (e) { setFehler([...schief, (e as Error).message]); } finally { setLaeuft(undefined); }
  }
  const anlegenRef = useRef(anlegen);
  anlegenRef.current = anlegen;

  useEffect(() => {
    const neu = (e: Event) => void anlegenRef.current((e as CustomEvent<File[]>).detail);
    const rein = (e: DragEvent) => {
      if (!nurDateien(e)) return;
      e.preventDefault();
      zaehler.current++;
      const { darf: ok } = zustand.current;
      const zu = wartungAktiv() ? 'Im Wartungsmodus lassen sich keine Dateien ablegen.' : zustand.current.gesperrt;
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
  useEffect(() => { if (!hinweis) return; const t = setTimeout(() => setHinweis(undefined), 5000); return () => clearTimeout(t); }, [hinweis]);

  const ablegen = (wohin: 'post' | 'mappe') => (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zaehler.current = 0;
    setZieht(false); setUeber(null);
    const dateien = [...e.dataTransfer.files];
    if (wohin === 'mappe' && ziel) ziel.nimm(dateien); else void anlegen(dateien);
  };

  return (
    <>
      {zieht && (
        <div className={`ablageflaeche ${ziel ? 'zwei' : ''}`} role="dialog" aria-label="Dateien ablegen">
          {ziel && (
            <div className={`ablageziel ${ueber === 'mappe' ? 'drauf' : ''}`} onDragOver={(e) => { e.preventDefault(); setUeber('mappe'); }} onDrop={ablegen('mappe')}>
              <strong>In diese Mappe</strong><span>Register „{ziel.name}“ – übernommen mit „Mappe speichern“</span>
            </div>
          )}
          <div className={`ablageziel ${ueber === 'post' ? 'drauf' : ''}`} onDragOver={(e) => { e.preventDefault(); setUeber('post'); }} onDrop={ablegen('post')}>
            <strong>{ziel ? 'Als neue Post' : 'Hier neue Dokumente ablegen'}</strong><span>Alle Dateien kommen zusammen in eine neue Post</span>
          </div>
        </div>
      )}
      {(laeuft || fehler.length > 0 || hinweis) && (
        <div className="ablagestatus" role={fehler.length ? 'alert' : 'status'}>
          {laeuft && <p>{laeuft}</p>}
          {hinweis && <p>{hinweis}</p>}
          {fehler.length > 0 && <>
            <p><strong>Nicht abgelegt:</strong></p>
            <ul>{fehler.map((x) => <li key={x}>{x}</li>)}</ul>
            <button type="button" className="knopf klein" onClick={() => setFehler([])}>Schließen</button>
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
  const typen = d.typen.filter((t) => darfErstellen(t)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const [offen, setOffen] = useState(false);
  const [mappe, setMappe] = useState(false);
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
      <button type="button" className="knopf gruen klein" aria-haspopup="menu" aria-expanded={offen} onClick={() => { setOffen(!offen); setMappe(false); }}>+ Neu</button>
      {offen && (
        <div className="menue" role="menu">
          {!mappe ? <>
            {post && <button type="button" className="menuepunkt" role="menuitem" onClick={() => { setOffen(false); eingabe.current?.click(); }}>Post <span className="leise klein">– Dateien auswählen{' '}oder fotografieren</span></button>}
            {typen.length > 0 && <button type="button" className="menuepunkt" role="menuitem" onClick={() => setMappe(true)}>Mappe … <span aria-hidden="true">›</span></button>}
          </> : <>
            <p className="leise klein">Neue Mappe vom Typ</p>
            {typen.map((t) => <button key={t.id} type="button" className="menuepunkt" role="menuitem" onClick={() => { setOffen(false); setMappe(false); geheZu(`/ablage/${t.id}/neu`); }}>{t.name}</button>)}
          </>}
        </div>
      )}
      {/* Ohne „capture“: Am Handy bietet die Auswahl Kamera und Dateien an. */}
      <input ref={eingabe} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; neuePost(f); }} />
    </div>
  );
}
