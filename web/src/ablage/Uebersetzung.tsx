import { useId, useRef, useState, type ReactNode } from 'react';
import { sprachname } from '../../../shared/src/beschriftung';
import { kennzeichnung, type Uebersetzungsquelle } from '../../../shared/src/uebersetzung';
import { api } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { Symbol } from '../Symbol';
import { Knopf } from '../bausteine';
import { t } from '../sprache';

/**
 * „Übersetzung anzeigen“ (#732) an Feldern, Notizen und am Volltext: nur auf Knopfdruck, nur wenn ein Paket mit
 * dms:uebersetzen läuft, der Administrator es nicht abgeschaltet hat und die Person es nicht für sich abgeschaltet hat.
 *
 * - Die Übersetzung ist sichtbar gekennzeichnet („Maschinell übersetzt aus … – nicht verbindlich“); der Satz ist mit dem
 *   Text verbunden (aria-describedby), Vorlesen nennt ihn also mit.
 * - Das gespeicherte Original erscheint beim Darüberfahren mit der Maus, beim Antippen und über den Knopf
 *   „Original zeigen“ (Tastatur). „Zurück zum Original“ schaltet die Übersetzung mit einem Klick ab.
 * - Die Übersetzung ist nur zum Lesen da: Es gibt keinen Weg, sie als Wert zu übernehmen. Bearbeitet wird das Original.
 */

type Stand =
  | { art: 'aus' }
  | { art: 'laeuft'; teil: number; teile: number }
  | { art: 'fehler'; text: string }
  | { art: 'fertig'; text: string; von: string | null; nach: string; gleich: boolean; gekuerzt: boolean; netz: string[] | null; paket: string };

export function Uebersetzbar({ quelle, original, darstellen = (x) => x, ersetzen = true, children }: {
  quelle: Uebersetzungsquelle;
  /** Der gespeicherte Text – für die Anzeige des Originals. */
  original: string;
  /** Wie ein Text aussieht (z. B. formatiert oder als Volltext); Vorgabe: als Text. */
  darstellen?: (text: string) => ReactNode;
  /** true: Die Übersetzung steht anstelle des Originals (Notiz, Volltext); false: darunter (Feld im Formular). */
  ersetzen?: boolean;
  /** Das Original, wie es sonst erscheint. */
  children: ReactNode;
}) {
  const angebot = useKonto().uebersetzen;
  const [stand, setStand] = useState<Stand>({ art: 'aus' });
  const [fest, setFest] = useState(false);
  const [schwebt, setSchwebt] = useState(false);
  const lauf = useRef(0);
  const id = useId();
  if (!angebot || angebot.aus || !original.trim()) return <>{children}</>;
  const netz = angebot.netz;

  async function starte() {
    const nr = ++lauf.current;
    setFest(false); setSchwebt(false);
    setStand({ art: 'laeuft', teil: 0, teile: 1 });
    try {
      const erst = await api.uebersetzung(quelle, 0);
      let text = erst.text + erst.trenner;
      let von = erst.von;
      for (let i = 1; i < erst.teile; i++) {
        if (lauf.current !== nr) return;
        setStand({ art: 'laeuft', teil: i, teile: erst.teile });
        const r = await api.uebersetzung(quelle, i);
        // Das Original hat sich inzwischen geändert: lieber neu anfangen als zwei Fassungen mischen.
        if (r.pruefwert !== erst.pruefwert) throw new Error(t('ablage.uebersetzung.geaendert'));
        text += r.text + r.trenner;
        von ??= r.von;
      }
      if (lauf.current !== nr) return;
      setStand({ art: 'fertig', text: text.replace(/\s+$/u, ''), von, nach: erst.nach, gleich: !!erst.gleich, gekuerzt: !!erst.gekuerzt, netz: erst.netz, paket: erst.paket.name });
    } catch (e) {
      if (lauf.current === nr) setStand({ art: 'fehler', text: (e as Error).message });
    }
  }
  const zurueck = () => { lauf.current++; setStand({ art: 'aus' }); setFest(false); setSchwebt(false); };
  const ziele = (n: string[]) => n.join(', ');

  const knopf = (
    <Knopf art="link" groesse="klein" className="uebersetzen-knopf" symbol="uebersetzen" onClick={() => void starte()}
      title={netz ? t('ablage.uebersetzung.knopf.netz', { paket: angebot.paket.name, ziele: ziele(netz) }) : t('ablage.uebersetzung.knopf.titel', { paket: angebot.paket.name })}>
      {t('ablage.uebersetzung.anzeigen')}
    </Knopf>
  );

  if (stand.art === 'aus') return <>{children}<div className="uebersetzen-zeile">{knopf}</div></>;
  if (stand.art === 'laeuft') {
    return (
      <>{children}
        <div className="uebersetzen-zeile">
          <span className="leise klein" role="status">{stand.teile > 1 ? t('ablage.uebersetzung.abschnitt', { teil: stand.teil + 1, teile: stand.teile }) : t('ablage.uebersetzung.laeuft')}</span>
          <Knopf art="link" groesse="klein" onClick={zurueck}>{t('ablage.uebersetzung.abbrechen')}</Knopf>
        </div>
      </>
    );
  }
  if (stand.art === 'fehler') {
    return <>{children}<div className="uebersetzen-zeile"><span className="fehlertext klein" role="alert">{stand.text}</span>{knopf}</div></>;
  }
  if (stand.gleich) {
    return (
      <>{children}
        <div className="uebersetzen-zeile">
          <span className="leise klein" role="status">{t('ablage.uebersetzung.gleich', { sprache: sprachname(stand.nach) })}</span>
          <Knopf art="link" groesse="klein" onClick={zurueck}>{t('ablage.uebersetzung.ok')}</Knopf>
        </div>
      </>
    );
  }
  const originalSichtbar = fest || schwebt;
  const box = (
    <div className="uebersetzt" role="group" aria-labelledby={`${id}-k`}
      onMouseEnter={() => setSchwebt(true)} onMouseLeave={() => setSchwebt(false)}>
      <p className="uebersetzt-kennzeichnung" id={`${id}-k`}>
        <Symbol name="uebersetzen" /> <span>{kennzeichnung(stand.von, (s) => sprachname(s))}</span> <Hilfe ort="mappen.uebersetzen" />
      </p>
      {stand.netz && <p className="leise klein">{t('ablage.uebersetzung.netz', { paket: stand.paket, ziele: ziele(stand.netz) })}</p>}
      {/* Antippen zeigt das Original (am Handy gibt es kein Darüberfahren); die Tastatur nimmt den Knopf darunter. */}
      <div className="uebersetzt-text" lang={stand.nach} aria-describedby={`${id}-k`} onClick={() => setFest((x) => !x)}>
        {darstellen(stand.text)}
      </div>
      {stand.gekuerzt && <p className="leise klein">{t('ablage.uebersetzung.gekuerzt')}</p>}
      {originalSichtbar && (
        <div className="uebersetzt-original" id={`${id}-o`} lang={stand.von ?? undefined}>
          <p className="leise klein">{t('ablage.uebersetzung.original')}</p>
          {darstellen(original)}
        </div>
      )}
      <div className="uebersetzen-zeile">
        <Knopf art="link" groesse="klein" aria-expanded={originalSichtbar} aria-controls={`${id}-o`} onClick={() => setFest((x) => !x)}>
          {originalSichtbar ? t('ablage.uebersetzung.original-verbergen') : t('ablage.uebersetzung.original-zeigen')}
        </Knopf>
        <Knopf art="link" groesse="klein" onClick={zurueck}>{t('ablage.uebersetzung.zurueck')}</Knopf>
      </div>
    </div>
  );
  return ersetzen ? box : <>{children}{box}</>;
}
