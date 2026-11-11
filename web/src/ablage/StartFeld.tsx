import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Umschalter } from '../bausteine';
import { useDaten } from '../daten';
import { beiAnkerGesucht } from '../entdecken/stand';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';
import { FragAblage } from './FragAblage';
import { StartSuche } from './StartSuche';

/**
 * Das Feld oben auf der Startseite (#1002): genau ein Feld statt Suche und „Frag deine Ablage“ untereinander.
 *
 * - Ohne Paket mit dms:antworten: die Suche (`StartSuche`) mit „auch in Dokumenten“, daneben der Link „Erweiterte Suche“.
 * - Mit „Frag deine Ablage“: darüber der Umschalter „Fragen · Suchen“ (Baustein `Umschalter`), Vorgabe „Fragen“. Ablago
 *   merkt sich je Person, was zuletzt gewählt war (Einstellung `startseite_feld`: „suchen“, sonst Fragen – auf dem
 *   Server, wie die übrigen Einstellungen der Startseite, also auf jedem Gerät gleich). Der Text bleibt beim Umschalten
 *   stehen; wer mit Maus oder Finger umschaltet, bleibt im Feld (Fokus und Cursor am Ende), mit den Pfeiltasten bleibt
 *   der Fokus im Umschalter wie bei Optionsfeldern.
 * - Sucht ein Tipp oder Rundgang `startseite.suche` bzw. `startseite.fragen`, schaltet das Feld dorthin um – nur für den
 *   Moment, ohne es zu merken.
 *
 * `sonst` (Tipp des Tages, Kacheln, zuletzt geöffnet) steht darunter; beim Suchen nur ohne Suchbegriff.
 */
type Art = 'fragen' | 'suchen';
const EINSTELLUNG = 'startseite_feld';

export function StartFeld({ sonst, ohneFeld = false }: { sonst?: ReactNode; ohneFeld?: boolean }) {
  const d = useDaten();
  const [fragen, setFragen] = useState<{ verfuegbar: boolean; paket: string | null } | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [fuerDenMoment, setFuerDenMoment] = useState<Art | null>(null);
  const suchfeld = useRef<HTMLInputElement>(null);
  const fragfeld = useRef<HTMLTextAreaElement>(null);
  /** In dieses Feld, sobald es da ist: nach dem Umschalten mit Maus/Finger oder wenn das Feld vorher den Fokus hatte. */
  const insFeld = useRef<Art | null>(null);
  const perZeiger = useRef(false);
  const imFeld = () => !!document.activeElement && (document.activeElement === suchfeld.current || document.activeElement === fragfeld.current);

  useEffect(() => {
    let aktuell = true;
    api.fragenVerfuegbar().then((s) => {
      if (!aktuell) return;
      // Wer schon im Suchfeld tippt, bleibt im Feld, wenn „Fragen“ dazukommt.
      if (s.verfuegbar && imFeld()) insFeld.current = 'fragen';
      setFragen(s);
    }, () => { if (aktuell) setFragen({ verfuegbar: false, paket: null }); });
    return () => { aktuell = false; };
  }, []);
  useEffect(() => beiAnkerGesucht((anker) => {
    insFeld.current = null;
    if (anker.includes('startseite.suche')) setFuerDenMoment('suchen');
    else if (anker.includes('startseite.fragen')) setFuerDenMoment('fragen');
  }), []);

  const fragenDa = !!fragen?.verfuegbar;
  const gemerkt: Art = d.einstellungen[EINSTELLUNG] === 'suchen' ? 'suchen' : 'fragen';
  const art: Art = fragenDa ? fuerDenMoment ?? gemerkt : 'suchen';

  useEffect(() => {
    if (insFeld.current !== art) return;
    insFeld.current = null;
    const f = art === 'suchen' ? suchfeld.current : fragfeld.current;
    if (!f) return;
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
  });

  // Leere Ablage: erst die Einstiege, ohne Feld.
  if (ohneFeld) return <>{sonst}</>;

  const waehle = (neu: Art) => {
    insFeld.current = perZeiger.current || imFeld() ? neu : null;
    perZeiger.current = false;
    setFuerDenMoment(null);
    d.setzeEinstellung(EINSTELLUNG, neu === 'suchen' ? 'suchen' : null);
  };

  const erweitert = <Link to="/ablage/suche" className="verweis klein sf-erweitert">{t('ablage.startsuche.erweiterte-suche')}</Link>;
  return (
    <section className="ss-suche" aria-label={t('ablage.startsuche.schnell-finden')}>
      {/* Mit „Frag deine Ablage“: Umschalter und „Erweiterte Suche“ über dem Feld; ohne: der Link neben „auch in Dokumenten“. */}
      {fragenDa && (
        <div className="sf-kopf">
          <div className="sf-art" onPointerDownCapture={() => { perZeiger.current = true; }} onKeyDownCapture={() => { perZeiger.current = false; }}>
            <Umschalter wert={art} setze={waehle} beschriftung={t('ablage.startfeld.art')} anker="startseite.feld-art"
              wahlen={[{ wert: 'fragen', text: t('ablage.startfeld.fragen') }, { wert: 'suchen', text: t('ablage.startfeld.suchen') }]} />
            {art === 'fragen' && <Hilfe ort="ablage.fragen" />}
          </div>
          {erweitert}
        </div>
      )}
      {art === 'suchen'
        ? <StartSuche eingabe={eingabe} setEingabe={setEingabe} feldRef={suchfeld} sonst={sonst} daneben={fragenDa ? null : erweitert} />
        : <><FragAblage eingabe={eingabe} setEingabe={setEingabe} paket={fragen?.paket ?? null} feldRef={fragfeld} />{sonst}</>}
    </section>
  );
}
