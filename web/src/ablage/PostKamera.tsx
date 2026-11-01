import { useEffect, useRef, useState } from 'react';
import { darfPostAnlegen, fotoBetreff } from '../../../shared/src/model';
import { api } from '../api';
import { useDaten } from '../daten';
import { geheZu } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { titelOder } from '../seiten';
import { Symbol } from '../Symbol';

/**
 * Post fotografieren (#490): Mit einem Tipp in die Kamera (`capture`), nach jedem Foto „Weitere Seite“
 * (gehört zum selben Brief) oder „Fertig“ – aus allen Seiten wird ein PDF und eine Post. Danach gleich
 * „Nächsten Beleg fotografieren“ (Serie), ohne eine Mappe zu sehen. Wer die Kamera schließt, landet
 * wieder hier und nicht auf der Startseite. Dieselbe Maske hängt in einer Post Seiten an („Seite hinzufügen“).
 *
 * Jedes Foto wird gleich nach der Aufnahme verkleinert (längste Seite 2400 px, aufrecht) und in den
 * Fotostapel des Servers geladen; „Fertig“ schickt nur noch die Kennungen.
 */

export interface KameraZiel { mappeId: string; dokumentId?: string; titel: string; fertig?: () => void }
const KAMERA = 'dms:post-kamera';
let kameraEingabe: HTMLInputElement | null = null;

/** Startet „Post fotografieren“ (ohne Ziel) bzw. „Seite hinzufügen“ – muss aus einem Tipp heraus aufgerufen werden. */
export function postFotografieren(ziel?: KameraZiel) {
  dispatchEvent(new CustomEvent<KameraZiel | null>(KAMERA, { detail: ziel ?? null }));
  kameraEingabe?.click();
}

/** Gerät mit Fingerbedienung (Handy, Tablet): dort gibt es die Kamera-Einstiege. */
export const istTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const LAENGSTE = 2400;
export async function verkleinere(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const k = Math.min(1, LAENGSTE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return b && b.size < f.size ? b : f.type === 'image/jpeg' || f.type === 'image/png' ? f : b ?? f;
  } catch { return f; }
}

interface Seite { schluessel: number; url: string; id?: string; fehler?: string; laden: Promise<void> }
type Phase = 'zu' | 'aufnehmen' | 'speichert' | 'gespeichert' | 'ende';

export function PostKamera() {
  const d = useDaten();
  const postTyp = d.typen.find((t) => t.system === 'post');
  const [phase, setPhase] = useState<Phase>('zu');
  const [ziel, setZiel] = useState<KameraZiel | null>(null);
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [serie, setSerie] = useState<Array<{ id: string; typId: string; titel: string; seiten: number }>>([]);
  const [fehler, setFehler] = useState<string>();
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const zaehler = useRef(0);
  const seitenRef = useRef(seiten);
  seitenRef.current = seiten;

  useEffect(() => {
    kameraEingabe = kamera.current;
    const auf = (e: Event) => {
      const z = (e as CustomEvent<KameraZiel | null>).detail;
      setZiel(z); setFehler(undefined); setSeiten([]);
      setSerie((s) => (z ? [] : s));
      setPhase('aufnehmen');
    };
    addEventListener(KAMERA, auf);
    return () => { removeEventListener(KAMERA, auf); if (kameraEingabe === kamera.current) kameraEingabe = null; };
  }, []);
  // Bildschirm-Adressen der Vorschaubilder wieder freigeben.
  useEffect(() => () => seitenRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  function nimm(dateien: File[]) {
    if (!dateien.length) return;
    setFehler(undefined);
    for (const f of dateien) {
      const schluessel = ++zaehler.current;
      const url = URL.createObjectURL(f);
      const laden = (async () => {
        try {
          const { id } = await api.fotoAblegen(await verkleinere(f));
          setSeiten((s) => s.map((x) => (x.schluessel === schluessel ? { ...x, id } : x)));
        } catch (e) { setSeiten((s) => s.map((x) => (x.schluessel === schluessel ? { ...x, fehler: (e as Error).message } : x))); }
      })();
      setSeiten((s) => [...s, { schluessel, url, laden }]);
    }
  }

  async function fertig() {
    setPhase('speichert'); setFehler(undefined);
    await Promise.all(seitenRef.current.map((s) => s.laden));
    const alle = seitenRef.current;
    const kaputt = alle.find((s) => s.fehler);
    if (kaputt) { setFehler(`Eine Seite ließ sich nicht hochladen: ${kaputt.fehler} Nimm sie neu auf.`); setPhase('aufnehmen'); return; }
    const stapel = alle.map((s) => s.id!);
    try {
      if (ziel) {
        await api.fotosAnMappe(ziel.mappeId, { stapel, ...(ziel.dokumentId ? { dokument: ziel.dokumentId } : {}) });
        ziel.fertig?.();
        schliessen();
        return;
      }
      const r = await api.postAusFotos({ stapel, betreff: fotoBetreff() });
      alle.forEach((s) => URL.revokeObjectURL(s.url));
      setSeiten([]);
      setSerie((x) => [...x, { id: r.post.id, typId: r.post.typId, titel: titelOder(r.post.titel), seiten: r.seiten }]);
      setPhase('gespeichert');
      void d.neuLaden();
    } catch (e) { setFehler((e as Error).message); setPhase('aufnehmen'); }
  }

  function seiteWeg(schluessel: number) {
    setSeiten((s) => { const x = s.find((y) => y.schluessel === schluessel); if (x) URL.revokeObjectURL(x.url); return s.filter((y) => y.schluessel !== schluessel); });
  }
  function schliessen() {
    seitenRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setSeiten([]); setPhase('zu'); setZiel(null); setSerie([]);
  }
  async function abbrechen() {
    if (seiten.length && !(await rueckfrage({ titel: seiten.length === 1 ? 'Foto verwerfen?' : `${seiten.length} Fotos verwerfen?`, text: 'Daraus wird keine Post.', ja: 'Verwerfen', nein: 'Weiter fotografieren', gefahr: true }))) return;
    if (serie.length) { seitenRef.current.forEach((s) => URL.revokeObjectURL(s.url)); setSeiten([]); setPhase('ende'); } else schliessen();
  }
  const naechster = () => { setPhase('aufnehmen'); setSeiten([]); kamera.current?.click(); };

  const eingaben = <>
    <input ref={kamera} type="file" accept="image/*" capture="environment" hidden data-pk="kamera" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; nimm(f); }} />
    <input ref={galerie} type="file" accept="image/*" multiple hidden data-pk="galerie" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; nimm(f); }} />
  </>;
  // Die Eingaben stehen immer an derselben Stelle: Würden sie beim Öffnen neu eingehängt, ginge das Foto verloren.
  if (phase === 'zu' || (!ziel && !darfPostAnlegen(postTyp))) return <>{eingaben}{null}</>;
  const neuePostSicht = d.zaehler.neuePost;
  const letzte = serie.at(-1);
  const laedt = seiten.some((s) => !s.id && !s.fehler);

  return (
    <>
      {eingaben}
      <>
      <div className="pk-schleier" aria-hidden="true" />
      <section className="pk-blatt" role="dialog" aria-modal="true" aria-label={ziel ? 'Seite hinzufügen' : 'Post fotografieren'}>
        {phase === 'gespeichert' && letzte ? <>
          <p className="pk-titel pk-gut" role="status"><Symbol name="haken" /> Post gespeichert</p>
          <p className="leise">„{letzte.titel}“ – {letzte.seiten === 1 ? 'eine Seite' : `${letzte.seiten} Seiten`}. Zuordnen kannst du später.</p>
          <div className="pk-knoepfe">
            <button type="button" className="knopf gruen pk-gross" autoFocus onClick={naechster}><Symbol name="kamera" /> Nächsten Beleg fotografieren</button>
            <button type="button" className="knopf pk-gross" onClick={() => { schliessen(); geheZu(`/ablage/${letzte.typId}/${letzte.id}`); }}>Jetzt zuordnen</button>
            <button type="button" className="knopf pk-gross" onClick={() => setPhase('ende')}>Fertig</button>
          </div>
        </> : phase === 'ende' ? <>
          <p className="pk-titel pk-gut" role="status"><Symbol name="haken" /> {serie.length === 1 ? 'Ein Beleg erfasst' : `${serie.length} Belege erfasst`}</p>
          <p>{serie.length === 1 ? 'Er liegt' : 'Sie liegen'} unter {neuePostSicht ? <button type="button" className="textknopf verweis" onClick={() => { schliessen(); geheZu(`/ablage/${neuePostSicht}`); }}>Neue Post</button> : 'Neue Post'}. Zuordnen und Einordnen geht später – am Rechner oder über „Zu erledigen“.</p>
          <div className="pk-knoepfe"><button type="button" className="knopf primaer pk-gross" autoFocus onClick={schliessen}>Schließen</button></div>
        </> : <>
          <p className="pk-titel">{ziel ? `Seite hinzufügen: ${ziel.titel}` : seiten.length ? (seiten.length === 1 ? 'Eine Seite aufgenommen' : `${seiten.length} Seiten aufgenommen`) : 'Post fotografieren'}</p>
          {serie.length > 0 && !ziel && <p className="leise klein">{serie.length === 1 ? 'Ein Beleg' : `${serie.length} Belege`} schon gespeichert – das hier wird der nächste.</p>}
          {seiten.length > 0 && (
            <ol className="pk-seiten" aria-label="Aufgenommene Seiten">
              {seiten.map((s, i) => (
                <li key={s.schluessel} className={s.fehler ? 'pk-fehler' : ''}>
                  <img src={s.url} alt={`Seite ${i + 1}`} />
                  <span className="pk-nr">{s.fehler ? '!' : !s.id ? '…' : i + 1}</span>
                  <button type="button" className="pk-weg" aria-label={`Seite ${i + 1} verwerfen`} onClick={() => seiteWeg(s.schluessel)}>×</button>
                </li>
              ))}
            </ol>
          )}
          {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
          {seiten.length === 0 ? (
            <div className="pk-knoepfe">
              <button type="button" className="knopf gruen pk-gross" onClick={() => kamera.current?.click()}><Symbol name="kamera" /> Foto aufnehmen</button>
              <button type="button" className="knopf pk-gross" onClick={() => galerie.current?.click()}>Foto aus der Mediathek wählen</button>
              <button type="button" className="textknopf pk-gross" onClick={() => void abbrechen()}>{serie.length ? 'Fertig' : 'Abbrechen'}</button>
            </div>
          ) : (
            <div className="pk-knoepfe">
              <button type="button" className="knopf pk-gross" disabled={phase === 'speichert'} onClick={() => kamera.current?.click()}><Symbol name="kamera" /> Weitere Seite</button>
              <button type="button" className="knopf gruen pk-gross" disabled={phase === 'speichert'} onClick={() => void fertig()}>
                {phase === 'speichert' ? (laedt ? 'Lade Fotos hoch …' : 'Speichere …') : ziel ? 'Fertig – Seiten anhängen' : 'Fertig – als Post speichern'}
              </button>
              <button type="button" className="textknopf pk-gross" disabled={phase === 'speichert'} onClick={() => void abbrechen()}>Abbrechen</button>
            </div>
          )}
          <p className="leise klein">„Weitere Seite“ gehört zum selben Brief; ein neuer Brief wird nach „Fertig“ zum nächsten Beleg.</p>
        </>}
      </section>
      </>
    </>
  );
}
