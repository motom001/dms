import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { OEFFNE_SEITEN, type Rundgang, type RundgangSchritt } from '../../../shared/src/entdecken';
import { geheZu } from '../ort';
import { t } from '../sprache';
import { Knopf } from '../bausteine';
import { DreiteilungBild } from './Bild';
import { beendeRundgang, findeAnker, istSchmal, useAktiverRundgang, warteAufAnker, wenigBewegung } from './stand';

/**
 * Rundgang (#831): zeigt Schritt für Schritt Stellen an der echten Oberfläche.
 *
 * - Ein modaler Dialog (`<dialog>`): Die Seite darunter lässt sich währenddessen nicht bedienen – nichts geht
 *   versehentlich kaputt. Tab bleibt im Dialog, Esc heißt „Später“, danach kehrt der Fokus dorthin zurück, wo er war.
 * - Das Ziel eines Schritts ist ein Anker (`data-anker`). Ein Rahmen hebt es hervor, der Rest wird abgedunkelt. Für
 *   Screenreader sagt jeder Schritt in Worten, wo die Stelle ist („ort“); Schritt, Titel und Text werden vorgelesen.
 * - Fehlt ein Ziel (z. B. am Handy ausgeblendet), fällt der Schritt still weg – nur ein Vermerk in der Konsole.
 * - Mit „Bewegung reduzieren“ springt alles ohne Übergang.
 */
export function RundgangAnzeige() {
  const aktiv = useAktiverRundgang();
  if (!aktiv) return null;
  return <Fuehrung key={`${aktiv.rundgang.herkunft}:${aktiv.rundgang.schluessel}`} rundgang={aktiv.rundgang} vonSelbst={aktiv.vonSelbst} />;
}

interface Ziel { schritt: RundgangSchritt; anker: string | null }

function Fuehrung({ rundgang, vonSelbst }: { rundgang: Rundgang; vonSelbst: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  const vorher = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const id = useId();
  const [schmal, setSchmal] = useState(istSchmal);
  const [schritte, setSchritte] = useState<Ziel[] | null>(null);
  const [nr, setNr] = useState(0);
  const [rechteck, setRechteck] = useState<DOMRect | null>(null);

  // Seite öffnen, dann prüfen, welche Ziele es gibt; Schritte ohne sichtbares Ziel fallen weg.
  useEffect(() => {
    let aus = false;
    if (rundgang.oeffne && location.pathname !== OEFFNE_SEITEN[rundgang.oeffne.seite]) geheZu(OEFFNE_SEITEN[rundgang.oeffne.seite]);
    void (async () => {
      const liste: Ziel[] = [];
      for (const s of rundgang.schritte) {
        if (!s.ziel.length) { liste.push({ schritt: s, anker: null }); continue; }
        const z = await warteAufAnker(s.ziel, liste.length ? 600 : 2500);
        if (z) liste.push({ schritt: s, anker: z.anker });
        else console.debug(`Rundgang „${rundgang.schluessel}“: Schritt „${s.schluessel}“ übersprungen – kein Ziel sichtbar (${s.ziel.join(', ')}).`);
      }
      if (aus) return;
      if (!liste.length) { beendeRundgang(null); return; }
      setSchritte(liste);
    })();
    return () => { aus = true; };
  }, [rundgang]);

  // Dialog öffnen; beim Schließen den Fokus zurückgeben.
  useEffect(() => {
    if (!schritte) return;
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    weiterKnopf.current?.focus();
    const zurueck = vorher.current;
    // Erst nachdem der Dialog weg ist: Sonst setzt der Browser den Fokus beim Entfernen wieder auf <body>. Gibt es das
    // Element nicht mehr (der Rundgang hat die Startseite geöffnet), kommt der Fokus an den Anfang des Inhalts.
    return () => {
      d?.close();
      setTimeout(() => {
        if (zurueck instanceof HTMLElement && zurueck.isConnected && zurueck !== document.body) { zurueck.focus(); return; }
        const inhalt = document.querySelector<HTMLElement>('main.rumpf');
        if (!inhalt) return;
        if (!inhalt.hasAttribute('tabindex')) inhalt.setAttribute('tabindex', '-1');
        inhalt.focus({ preventScroll: true });
      }, 0);
    };
  }, [schritte]);

  const aktuell = schritte?.[nr];
  // Ziel in den Blick holen und seine Lage verfolgen (Scrollen, Größe ändern).
  const messen = useCallback(() => {
    const el = aktuell?.anker ? findeAnker(aktuell.anker) : null;
    setRechteck(el ? el.getBoundingClientRect() : null);
    setSchmal(istSchmal());
  }, [aktuell]);
  useLayoutEffect(() => {
    const el = aktuell?.anker ? findeAnker(aktuell.anker) : null;
    el?.scrollIntoView({ block: 'center', behavior: wenigBewegung() ? 'auto' : 'smooth' });
    messen();
    let rahmen = 0;
    const neu = () => { cancelAnimationFrame(rahmen); rahmen = requestAnimationFrame(messen); };
    addEventListener('resize', neu); addEventListener('scroll', neu, true);
    const spaet = setTimeout(messen, 450);
    return () => { removeEventListener('resize', neu); removeEventListener('scroll', neu, true); cancelAnimationFrame(rahmen); clearTimeout(spaet); };
  }, [aktuell, messen]);

  if (!schritte || !aktuell) return null;
  const letzter = nr === schritte.length - 1;
  const s = aktuell.schritt;
  const text = schmal && s.textHandy ? s.textHandy : s.text;
  const ende = (stand: 'gesehen' | 'spaeter') => beendeRundgang(stand);
  const weiter = () => (letzter ? ende('gesehen') : setNr(nr + 1));
  const zurueck = () => setNr(Math.max(0, nr - 1));

  // Tab bleibt im Dialog (auch in Browsern, die den Fokus aus einem modalen Dialog herauslassen).
  const taste = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    if (!knoepfe.length) return;
    const erster = knoepfe[0], letzterK = knoepfe[knoepfe.length - 1];
    if (e.shiftKey && document.activeElement === erster) { e.preventDefault(); letzterK.focus(); }
    else if (!e.shiftKey && document.activeElement === letzterK) { e.preventDefault(); erster.focus(); }
  };

  const rand = 6;
  const licht: CSSProperties | undefined = rechteck ? { left: rechteck.left - rand, top: rechteck.top - rand, width: rechteck.width + rand * 2, height: rechteck.height + rand * 2 } : undefined;
  const karte = lageDerKarte(rechteck, schmal);

  return (
    <dialog ref={ref} className={`rundgang${rechteck ? ' mit-ziel' : ''}${schmal ? ' schmal' : ''}`} aria-labelledby={`${id}-t`} aria-describedby={`${id}-x`}
      onCancel={(e) => { e.preventDefault(); ende(vonSelbst ? 'spaeter' : 'gesehen'); }} onKeyDown={taste}>
      {licht && <div className="rg-licht" style={licht} aria-hidden="true" />}
      <div className="rg-karte" style={karte}>
        <p className="ueber rg-kopf"><span>{t('entdecken.fuehrung.titel', { titel: rundgang.titel })}</span><span>{t('entdecken.fuehrung.schritt', { nr: nr + 1, anzahl: schritte.length })}</span></p>
        <div className="rg-inhalt" aria-live="polite">
          <h2 id={`${id}-t`} className="h3">{s.titel}</h2>
          {s.bild === 'dreiteilung' && <DreiteilungBild schmal={schmal} />}
          <div id={`${id}-x`}>
            <p>{text}</p>
            {s.ort && <p className="sr">{s.ort}</p>}
            {letzter && rundgang.ende && <p className="rg-ende">{rundgang.ende}</p>}
          </div>
        </div>
        <div className="rg-knoepfe">
          <div className="rg-neben">
            {vonSelbst && <Knopf art="link" onClick={() => ende('spaeter')} title={t('entdecken.fuehrung.spaeter.titel')}>{t('entdecken.fuehrung.spaeter')}</Knopf>}
            {!letzter && <Knopf art="link" onClick={() => ende('gesehen')} title={t('entdecken.fuehrung.ueberspringen.titel')}>{t('entdecken.fuehrung.ueberspringen')}</Knopf>}
          </div>
          <div className="rg-haupt">
            {nr > 0 && <Knopf symbol="pfeil-links" onClick={zurueck}>{t('entdecken.fuehrung.zurueck')}</Knopf>}
            <Knopf ref={weiterKnopf} art="haupt" onClick={weiter}>{letzter ? t('entdecken.fuehrung.fertig') : t('entdecken.fuehrung.weiter')}</Knopf>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** Wo die Karte steht: unter dem Ziel, sonst darüber, sonst daneben; ohne Ziel in der Mitte. Am Handy unten oder oben. */
function lageDerKarte(r: DOMRect | null, schmal: boolean): CSSProperties | undefined {
  if (!r) return undefined;
  const abstand = 14;
  const hoehe = innerHeight;
  if (schmal) return r.top + r.height / 2 > hoehe / 2 ? { top: 16 } : { bottom: 16 };
  const breite = Math.min(440, innerWidth - 32);
  const links = Math.max(16, Math.min(r.left, innerWidth - breite - 16));
  if (hoehe - r.bottom > 260) return { top: r.bottom + abstand, left: links };
  if (r.top > 260) return { bottom: hoehe - r.top + abstand, left: links };
  // Hohes Ziel (z. B. eine ganze Spalte): daneben.
  return r.right + abstand + breite < innerWidth ? { top: Math.max(16, r.top), left: r.right + abstand } : { top: Math.max(16, r.top), left: Math.max(16, r.left - abstand - breite) };
}
