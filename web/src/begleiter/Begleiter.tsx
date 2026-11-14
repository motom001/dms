import { useEffect, useId, useRef, useState } from 'react';
import { sucheApi } from '../api/suche';
import { FragAblage } from '../ablage/FragAblage';
import { Knopf, Umschalter } from '../bausteine';
import { useDaten } from '../daten';
import { beiAnkerGesucht, useAktiverRundgang, useEntdecken } from '../entdecken/stand';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { Figur } from './Figur';
import { HandbuchSuche } from './Handbuch';
import { TippKarte } from './Tipps';
import s from './Begleiter.module.css';

/**
 * Assistent unten rechts (#1219), auf jeder Seite: ein runder Knopf mit der Mappe als Figur, der ein kleines Fenster
 * öffnet – **Fragen · Tipps · Handbuch** (Baustein `Umschalter`).
 *
 * - Öffnet sich **nie von selbst**, springt nicht, winkt nicht. Ein Punkt am Knopf zeigt nur, dass ein neuer Tipp des
 *   Tages da ist; er verschwindet, sobald die Tipps angesehen wurden (der Server merkt sich „gezeigt“).
 * - **Fragen** gibt es nur mit einem Paket für „Frag deine Ablage“ (#444); das Gespräch bleibt beim Seitenwechsel
 *   erhalten, bis zum Neuladen.
 * - **Handbuch**: in der Ablage das Benutzerhandbuch, in der Werkbank das Admin-Handbuch – aus dem Suchverzeichnis des
 *   mitgelieferten Handbuchs, ohne Netz nach draußen.
 * - Tastatur: Der Knopf ist erreichbar; beim Öffnen geht der Fokus ins Fenster, mit „×“ oder Esc zurück zum Knopf.
 * - Sucht ein Tipp oder Rundgang eine Stelle im Fenster (`startseite.fragen`, `startseite.tipp`,
 *   `startseite.feld-art`), öffnet es sich dafür – nur, weil die Person den Tipp angeklickt hat.
 * - Am Handy liegt das Fenster als Blatt unten über die volle Breite; der Knopf hat schmal einen eigenen Streifen unten
 *   (verdeckt weder Inhalt noch die Speicherleiste), breit ebenso, sobald eine Speicherleiste da ist.
 */
type Reiter = 'fragen' | 'tipps' | 'handbuch';

/** Gibt es „Frag deine Ablage“? Einmal je Laden der Seite gefragt. */
let fragenStand: Promise<{ verfuegbar: boolean; paket: string | null }> | null = null;
function useFragen() {
  const [x, setX] = useState<{ verfuegbar: boolean; paket: string | null } | null>(null);
  useEffect(() => {
    let aktuell = true;
    fragenStand ??= sucheApi.fragenVerfuegbar().catch(() => ({ verfuegbar: false, paket: null }));
    void fragenStand.then((y) => { if (aktuell) setX(y); });
    return () => { aktuell = false; };
  }, []);
  return x;
}

/** Punkt am Knopf: ein neuer Tipp des Tages – nicht neben einem Rundgang und nicht, wenn Tipps aus sind. */
function useNeuerTipp() {
  const d = useDaten();
  const { stand } = useEntdecken();
  const rundgang = useAktiverRundgang();
  if (!stand?.tipp || stand.tipp.gesehen || !stand.tippsAn || stand.starten) return false;
  return d.einstellungen.tipps !== false && !rundgang;
}

/** Welcher Reiter im Fenster: gewählt, sonst „Fragen“ (wenn es sie gibt), sonst „Tipps“. */
const reiterVon = (gewaehlt: Reiter | null, fragenDa: boolean): Reiter =>
  gewaehlt === 'fragen' && !fragenDa ? 'tipps' : gewaehlt ?? (fragenDa ? 'fragen' : 'tipps');

/** Tipp oder Rundgang sucht eine Stelle im Fenster (#1002-Muster): welcher Reiter – null = irgendeiner. */
const reiterFuerAnker = (anker: readonly string[]): Reiter | null | undefined =>
  anker.includes('startseite.fragen') ? 'fragen' : anker.includes('startseite.tipp') ? 'tipps' : anker.includes('startseite.feld-art') ? null : undefined;

export function Begleiter({ werkbank, imKopf = false }: { werkbank: boolean; /** In der Kopfzeile (Werkbank): am Handy ein Knopf darin. */ imKopf?: boolean }) {
  const fragen = useFragen();
  const neuerTipp = useNeuerTipp();
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Reiter | null>(null);
  const [eingabe, setEingabe] = useState('');
  const knopf = useRef<HTMLButtonElement>(null);
  const fenster = useRef<HTMLDivElement>(null);
  const titelId = useId();
  const fragenDa = !!fragen?.verfuegbar;
  const reiter = reiterVon(gewaehlt, fragenDa);

  // Am Handy ist der Knopf unter dem Blatt ausgeblendet – erst nach dem Schließen bekommt er den Fokus zurück.
  const zurueck = useRef(false);
  const schliesse = () => { zurueck.current = true; setOffen(false); };
  // Fokus zurück zum Knopf erst nach dem Abbau des Fensters (am Handy ist der Knopf bis dahin ausgeblendet) – und
  // noch einmal im nächsten Bild, falls der Browser den Fokus beim Entfernen auf <body> gesetzt hat.
  useEffect(() => {
    if (offen || !zurueck.current) return;
    zurueck.current = false;
    knopf.current?.focus();
    const bild = requestAnimationFrame(() => { if (document.activeElement !== knopf.current) knopf.current?.focus(); });
    return () => cancelAnimationFrame(bild);
  }, [offen]);
  // Fokus ins Fenster, sobald es offen ist.
  useEffect(() => { if (offen) fenster.current?.focus(); }, [offen]);
  useEffect(() => beiAnkerGesucht((anker) => {
    const r = reiterFuerAnker(anker);
    if (r === undefined) return;
    if (r) setGewaehlt(r);
    setOffen(true);
  }), []);

  const wahlen = [
    ...(fragenDa ? [{ wert: 'fragen' as const, text: t('oberflaeche.begleiter.fragen') }] : []),
    { wert: 'tipps' as const, text: <>{t('oberflaeche.begleiter.tipps')}{neuerTipp && <><span className={s.punktKlein} aria-hidden="true" /><span className="sr"> {t('oberflaeche.begleiter.neu')}</span></>}</> },
    { wert: 'handbuch' as const, text: t('oberflaeche.begleiter.handbuch') },
  ];
  const knopfText = neuerTipp ? t('oberflaeche.begleiter.oeffnen-neu') : offen ? t('oberflaeche.begleiter.schliessen') : t('oberflaeche.begleiter.oeffnen');

  return (
    <div className={[s.begleiter, offen && s.offen, imKopf && s.imKopf].filter(Boolean).join(' ')} data-begleiter="">
      {offen && (
        <div ref={fenster} className={s.fenster} role="dialog" aria-labelledby={titelId} tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); schliesse(); } }}>
          <h2 id={titelId} className="sr">{t('oberflaeche.begleiter.titel')}</h2>
          <div className={s.kopf}>
            <Umschalter wert={reiter} setze={setGewaehlt} wahlen={wahlen} beschriftung={t('oberflaeche.begleiter.titel')} anker="startseite.feld-art" />
            <Knopf art="link" nurSymbol={t('oberflaeche.begleiter.schliessen')} className={s.zu} onClick={schliesse}><Symbol name="schliessen" /></Knopf>
          </div>
          <div className={s.inhalt}>
            {reiter === 'fragen' && <FragAblage eingabe={eingabe} setEingabe={setEingabe} paket={fragen?.paket ?? null} />}
            {reiter === 'tipps' && <TippKarte schliessen={() => setOffen(false)} />}
            {reiter === 'handbuch' && <HandbuchSuche handbuch={werkbank ? 'admin' : 'benutzer'} />}
          </div>
        </div>
      )}
      <div className={s.ort} data-anker="assistent">
        <Knopf ref={knopf} art="link" className={s.knopf} aria-expanded={offen} aria-haspopup="dialog" nurSymbol={knopfText}
          onClick={() => (offen ? schliesse() : setOffen(true))}>
          <Figur />
        </Knopf>
        {neuerTipp && <span className={s.punkt} aria-hidden="true" />}
      </div>
    </div>
  );
}
