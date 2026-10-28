import { useEffect, useState, type ClipboardEvent } from 'react';
import { api, type Diagnose } from '../api';
import { useDaten } from '../daten';
import { geraeteAngaben } from '../diagnose';
import { leseSchrift, SCHRIFTEN } from '../design';
import { useKonto } from '../konto';

/**
 * Fehler melden (#70): eigene Beschreibung, bis zu zwei Screenshots und technische Angaben
 * von Server und Gerät – vor dem Absenden sichtbar; senden an die Administratoren oder kopieren.
 */
const MAX_BILDER = 2;
const MAX_BYTES = 10 * 1024 * 1024;

interface Bild { name: string; daten: string; groesse: number }

const alsDataUrl = (f: File) => new Promise<string>((ok, nein) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => nein(r.error); r.readAsDataURL(f); });

function alsText(text: string, angaben: Record<string, unknown>): string {
  const zeilen: string[] = [];
  const gehe = (v: unknown, tiefe: number, schluessel?: string) => {
    const ein = '  '.repeat(tiefe);
    if (v && typeof v === 'object' && !Array.isArray(v)) { if (schluessel) zeilen.push(`${ein}${schluessel}:`); for (const [k, x] of Object.entries(v)) gehe(x, schluessel ? tiefe + 1 : tiefe, k); }
    else if (Array.isArray(v)) { zeilen.push(`${ein}${schluessel}:${v.length ? '' : ' –'}`); for (const x of v) zeilen.push(`${ein}  - ${String(x)}`); }
    else zeilen.push(`${ein}${schluessel}: ${typeof v === 'boolean' ? (v ? 'ja' : 'nein') : v ?? '–'}`);
  };
  gehe(angaben, 0);
  return `Fehlermeldung DMS\n\n${text.trim()}\n\n--- Technische Angaben ---\n${zeilen.join('\n')}\n`;
}

export function FehlerMelden() {
  const { ich } = useKonto();
  const d = useDaten();
  const [text, setText] = useState('');
  const [bilder, setBilder] = useState<Bild[]>([]);
  const [server, setServer] = useState<Diagnose | { fehler: string } | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  useEffect(() => { api.diagnose().then(setServer, (e: Error) => setServer({ fehler: e.message })); }, []);

  const design = d.designs.find((x) => x.id === (d.einstellungen.design ?? d.standardDesign))?.name ?? null;
  const angaben = { Server: server ?? 'wird geladen', Gerät: { ...geraeteAngaben(SCHRIFTEN[leseSchrift(ich.id)].name), Design: design } };

  async function nimm(dateien: File[]) {
    setMeldung(undefined);
    const neu = [...bilder];
    for (const f of dateien) {
      if (neu.length >= MAX_BILDER) { setMeldung({ art: 'schlecht', text: `Höchstens ${MAX_BILDER} Bilder.` }); break; }
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setMeldung({ art: 'schlecht', text: `„${f.name}“ ist kein PNG, JPEG oder WebP.` }); continue; }
      if (f.size > MAX_BYTES) { setMeldung({ art: 'schlecht', text: `„${f.name}“ ist größer als 10 MB.` }); continue; }
      neu.push({ name: f.name || `Bild ${neu.length + 1}.png`, daten: await alsDataUrl(f), groesse: f.size });
    }
    setBilder(neu);
  }
  function einfuegen(e: ClipboardEvent) {
    const dateien = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (dateien.length) { e.preventDefault(); void nimm(dateien); }
  }
  async function senden() {
    setSendet(true); setMeldung(undefined);
    try {
      await api.fehlerMelden({ text, angaben, bilder: bilder.map((b) => ({ name: b.name, daten: b.daten })) });
      setGesendet(true);
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setSendet(false); }
  }
  async function kopieren() {
    try { await navigator.clipboard.writeText(alsText(text, angaben)); setMeldung({ art: 'gut', text: 'In die Zwischenablage kopiert.' }); }
    catch { setMeldung({ art: 'schlecht', text: 'Kopieren ging nicht – bitte die Angaben unten markieren und kopieren.' }); }
  }

  if (gesendet) return (
    <div className="einspaltig schmal">
      <div className="mappenkopf"><p className="ueber">Hilfe</p><h1>Fehler melden</h1></div>
      <div className="hinweis gut"><p><strong>Deine Meldung ist bei den Administratoren angekommen.</strong> Sie melden sich bei dir, falls sie Fragen haben.</p></div>
      <div className="knoepfe"><button type="button" className="knopf" onClick={() => { setGesendet(false); setText(''); setBilder([]); }}>Noch eine Meldung</button></div>
    </div>
  );

  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">Hilfe</p>
        <h1>Fehler melden</h1>
        <p className="leise">Beschreibe kurz, was passiert ist und was du erwartet hättest. Die technischen Angaben unten helfen den Administratoren beim Nachstellen. Passwörter, Inhalte von Mappen und Dokumente gehen nicht mit.</p>
      </div>
      <section className="blatt">
        <label className="eigenschaft"><span>Was ist passiert?</span>
          <textarea rows={6} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} onPaste={einfuegen}
            placeholder="z. B. Beim Speichern einer Rechnung kam „Fehler 500“, nachdem ich ein Dokument hinzugefügt hatte." /></label>
        <div className="eigenschaft">
          <span>Screenshots <small>bis zu zwei, PNG/JPEG/WebP, je höchstens 10 MB – auch per Einfügen (Strg+V) ins Textfeld</small></span>
          {bilder.length > 0 && <ul className="bildliste">{bilder.map((b, i) => (
            <li key={i}><img src={b.daten} alt={b.name} /><span className="leise klein">{b.name}</span>
              <button type="button" className="textknopf gefahr" onClick={() => setBilder(bilder.filter((_, j) => j !== i))}>Entfernen</button></li>
          ))}</ul>}
          {bilder.length < MAX_BILDER && <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { void nimm([...(e.target.files ?? [])]); e.target.value = ''; }} />}
        </div>
      </section>
      <section className="blatt">
        <details>
          <summary>Technische Angaben ansehen</summary>
          <pre className="angabentext">{alsText('', angaben).split('--- Technische Angaben ---\n')[1]}</pre>
        </details>
      </section>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <button type="button" className="knopf" disabled={!text.trim()} onClick={() => void kopieren()}>In die Zwischenablage kopieren</button>
        <button type="button" className="knopf primaer" disabled={!text.trim() || sendet || server === null} onClick={() => void senden()}>{sendet ? 'Wird gesendet …' : 'An die Administratoren senden'}</button>
      </div>
    </div>
  );
}
