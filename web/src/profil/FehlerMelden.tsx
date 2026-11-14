import { t, tn } from '../sprache';
import { useEffect, useState, type ClipboardEvent } from 'react';
import { kontoApi, type Diagnose } from '../api/konto';
import { useDaten } from '../daten';
import { geraeteAngaben } from '../diagnose';
import { leseSchrift, SCHRIFTEN } from '../design';
import { useKonto } from '../konto';
import { Feld, FeldGruppe, Knopf } from '../bausteine';

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
  return t('profil.fehlermelden.fehlermeldung-ablago-technische', { text: text.trim(), zeilen: zeilen.join('\n') });
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
  useEffect(() => { kontoApi.diagnose().then(setServer, (e: Error) => setServer({ fehler: e.message })); }, []);

  const design = d.designs.find((x) => x.id === (d.einstellungen.design ?? d.standardDesign))?.name ?? null;
  const angaben = { Server: server ?? t('profil.fehlermelden.wird-geladen'), Gerät: { ...geraeteAngaben(SCHRIFTEN[leseSchrift(ich.id)].name), Design: design } };

  async function nimm(dateien: File[]) {
    setMeldung(undefined);
    const neu = [...bilder];
    for (const f of dateien) {
      if (neu.length >= MAX_BILDER) { setMeldung({ art: 'schlecht', text: t('profil.fehlermelden.hoechstens-bilder', { MAX_BILDER }) }); break; }
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setMeldung({ art: 'schlecht', text: t('profil.fehlermelden.ist-kein-png-jpeg', { name: f.name }) }); continue; }
      if (f.size > MAX_BYTES) { setMeldung({ art: 'schlecht', text: t('profil.fehlermelden.ist-groesser-als-10', { name: f.name }) }); continue; }
      neu.push({ name: f.name || t('profil.fehlermelden.bild-png', { wert: neu.length + 1 }), daten: await alsDataUrl(f), groesse: f.size });
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
      await kontoApi.fehlerMelden({ text, angaben, bilder: bilder.map((b) => ({ name: b.name, daten: b.daten })) });
      setGesendet(true);
    } catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); } finally { setSendet(false); }
  }
  async function kopieren() {
    try { await navigator.clipboard.writeText(alsText(text, angaben)); setMeldung({ art: 'gut', text: t('profil.fehlermelden.in-die-zwischenablage-kopiert') }); }
    catch { setMeldung({ art: 'schlecht', text: t('profil.fehlermelden.kopieren-ging-nicht-bitte') }); }
  }

  if (gesendet) return (
    <div className="einspaltig schmal">
      <div className="mappenkopf"><p className="ueber">{t('profil.fehlermelden.hilfe')}</p><h1>{t('profil.fehlermelden.fehler-melden')}</h1></div>
      <div className="hinweis gut"><p>{tn('profil.fehlermelden.sie-melden-sich-bei', { b: <strong>{t('profil.fehlermelden.deine-meldung-ist-angekommen')}</strong> })}</p></div>
      <div className="knoepfe"><Knopf onClick={() => { setGesendet(false); setText(''); setBilder([]); }}>{t('profil.fehlermelden.noch-eine-meldung')}</Knopf></div>
    </div>
  );

  return (
    <div className="einspaltig schmal">
      <div className="mappenkopf">
        <p className="ueber">{t('profil.fehlermelden.hilfe')}</p>
        <h1>{t('profil.fehlermelden.fehler-melden')}</h1>
        <p className="leise">{t('profil.fehlermelden.beschreibe-kurz-was-passiert')}</p>
      </div>
      <section className="blatt">
        <Feld beschriftung={t('profil.fehlermelden.was-ist-passiert')}>
          <textarea rows={6} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} onPaste={einfuegen}
            placeholder={t('profil.fehlermelden.z-b-beim-speichern')} /></Feld>
        <FeldGruppe className="bildgruppe" beschriftung={t('profil.fehlermelden.screenshots')} optional hinweis={t('profil.fehlermelden.bis-zu-zwei-png')}>
          {bilder.length > 0 && <ul className="bildliste">{bilder.map((b, i) => (
            <li key={i}><img src={b.daten} alt={b.name} /><span className="leise klein">{b.name}</span>
              <Knopf art="gefahr" symbol="geloescht" onClick={() => setBilder(bilder.filter((_, j) => j !== i))}
                rueckfrage={{ titel: t('profil.fehlermelden.entfernen.frage', { name: b.name }), ja: t('profil.fehlermelden.entfernen') }}>{t('profil.fehlermelden.entfernen')}</Knopf></li>
          ))}</ul>}
          {bilder.length < MAX_BILDER && <input type="file" aria-label={t('profil.fehlermelden.screenshots')} accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => { void nimm([...(e.target.files ?? [])]); e.target.value = ''; }} />}
        </FeldGruppe>
      </section>
      <section className="blatt">
        <details>
          <summary>{t('profil.fehlermelden.technische-angaben-ansehen')}</summary>
          <pre className="angabentext">{alsText('', angaben).split('--- Technische Angaben ---\n')[1]}</pre>
        </details>
      </section>
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <div className="knoepfe">
        <Knopf gesperrt={!text.trim()} onClick={kopieren}>{t('profil.fehlermelden.in-die-zwischenablage-kopieren')}</Knopf>
        <Knopf art="haupt" gesperrt={!text.trim() || server === null} laeuft={sendet} laeuftText={t('profil.fehlermelden.wird-gesendet')} onClick={senden}>{t('profil.fehlermelden.meldung-senden')}</Knopf>
      </div>
    </div>
  );
}
