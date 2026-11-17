import { useEffect, useState } from 'react';
import { Knopf, KnopfLink } from '../../bausteine';
import { Kopf } from '../Kopf';
import { DateienPruefen } from '../Archiv';
import { NummernNachtragen } from '../Nummernkreise';
import { FormateUnpassend } from '../FormateUnpassend';
import { AbsenderBereinigen } from '../AbsenderBereinigen';
import type { Auftrag as HintergrundAuftrag } from '../../../../shared/src/auftrag';
import { betriebApi } from '../../api/betrieb';
import { Hilfe } from '../../Hilfe';
import { rueckfrage } from '../../rueckfrage';
import { TEXTERKENNUNG_PAKET } from '../../../../shared/src/volltext';
import { fortschrittText } from '../../../../shared/src/auftrag';
import { t as tx, t } from '../../sprache';
import type { TexterkennungZustand } from './zustand';
import { PauseHinweis, Warteschlange, zahl } from './teile';

/* ---------- Wartungsoperationen ---------- */

export function WartungPanel({ t: eintrag, wartungAn, abschnitt }: { t: TexterkennungZustand; wartungAn?: boolean; abschnitt?: boolean }) {
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.texterkennung.wartungsoperationen')} abschnitt={abschnitt} id="operationen" hilfe="werkbank.wartung">
        <p className="leise">{t('werkbank.texterkennung.arbeiten-am-ganzen-bestand')}</p>
      </Kopf>
      <VolltextNeu t={eintrag} wartungAn={wartungAn} />
      <VorschauNachholen />
      <DateienPruefen />
      <NummernNachtragen />
      <AbsenderBereinigen />
      <FormateUnpassend />
    </div>
  );
}

/**
 * „Volltext neu erzeugen“ (#458): für Dokumente ohne Text oder für alle (mit Rückfrage und Anzahl), als Auftrag mit
 * Fortschritt, abbrechbar. Ersetzt „Volltext nachholen“ (das sind die Dokumente ohne Text).
 */
function VolltextNeu({ t: eintrag, wartungAn }: { t: TexterkennungZustand; wartungAn?: boolean }) {
  const s = eintrag.stand;
  const laden = eintrag.laden;
  const [auftrag, setAuftrag] = useState<HintergrundAuftrag | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  // Läuft schon einer (z. B. nach dem Neuladen der Seite)? Dann seinen Stand zeigen.
  useEffect(() => {
    void betriebApi.auftrag().then(
      (a) => {
        if (a?.art === 'volltext-neu') setAuftrag(a);
      },
      () => {},
    );
  }, []);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const x = setInterval(
      () =>
        void betriebApi.auftrag().then((a) => {
          setAuftrag(a);
          if (a?.status !== 'laeuft') void laden();
        }),
      1000,
    );
    return () => clearInterval(x);
  }, [auftrag?.status, laden]);
  async function starte(umfang: 'ohne' | 'alle') {
    setMeldung(undefined);
    try {
      const { anzahl } = await betriebApi.volltextNeuAnzahl(umfang);
      if (!anzahl) {
        setMeldung({ art: 'gut', text: tx('volltext.neu.nichts') });
        return;
      }
      if (
        umfang === 'alle' &&
        !(await rueckfrage({
          titel: tx('volltext.neu.rueckfrage.titel'),
          text: tx('volltext.neu.rueckfrage.text', { anzahl }),
          ja: tx('volltext.neu.rueckfrage.ja'),
        }))
      )
        return;
      setAuftrag(await betriebApi.volltextNeu(umfang));
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  async function abbrechen() {
    if (!auftrag) return;
    try {
      setAuftrag(await betriebApi.auftragAbbrechen(auftrag.id));
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  const laeuft = auftrag?.status === 'laeuft';
  return (
    <section className="blatt" id="volltext">
      <h2 className="h3">
        {tx('volltext.neu.titel')} <Hilfe ort="werkbank.wartung.volltext" />
      </h2>
      <p className="leise">{tx('volltext.neu.text')}</p>
      {s?.paket ? (
        <p className="leise klein">{tx('volltext.neu.dauer')}</p>
      ) : (
        s && (
          <div className="hinweis warn hinweiszeile" role="status">
            <p>{tx('volltext.werkbank.paket.fehlt')}</p>
            <KnopfLink to={`/werkbank/pakete/${TEXTERKENNUNG_PAKET}`}>{tx('volltext.werkbank.paket.installieren')}</KnopfLink>
          </div>
        )
      )}
      {s && <PauseHinweis t={eintrag} wartungAn={wartungAn} />}
      {s && <Warteschlange s={s} />}
      {stand(auftrag, meldung)}
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={laeuft} onClick={() => starte('ohne')}>
          {tx('volltext.neu.ohne')}
        </Knopf>
        <Knopf gesperrt={laeuft} onClick={() => starte('alle')}>
          {tx('volltext.neu.alle')}
        </Knopf>
        {laeuft && (
          <Knopf
            art="gefahr"
            symbol="verboten"
            laeuft={auftrag.abgebrochen}
            laeuftText={tx('volltext.neu.laeuft')}
            onClick={abbrechen}
            rueckfrage={{
              titel: tx('volltext.neu.abbrechen.frage'),
              text: tx('volltext.neu.abbrechen.text'),
              ja: tx('volltext.neu.abbrechen.ja'),
            }}>
            {tx('volltext.neu.abbrechen')}
          </Knopf>
        )}
      </div>
    </section>
  );
}

/** Stand des Auftrags: Fortschritt, Ergebnis, Fehler, Meldung. */
function stand(auftrag: HintergrundAuftrag | null, meldung: { art: 'gut' | 'schlecht'; text: string } | undefined) {
  const laeuft = auftrag?.status === 'laeuft';
  const e = auftrag?.status === 'fertig' ? (auftrag.ergebnis as { dokumente: number; erledigt: number; abgebrochen: boolean }) : null;
  return (
    <>
      {laeuft && (
        <p className="leise" role="status">
          {fortschrittText(auftrag, t('werkbank.texterkennung.dokumente'))}
          {auftrag.abgebrochen ? ` · ${tx('volltext.neu.abgebrochen', { erledigt: auftrag.fertig, dokumente: auftrag.gesamt })}` : ''}
        </p>
      )}
      {e && (
        <p className="gutertext" role="status">
          {e.abgebrochen
            ? tx('volltext.neu.abgebrochen', { erledigt: e.erledigt, dokumente: e.dokumente })
            : tx('volltext.neu.fertig', { erledigt: e.erledigt, dokumente: e.dokumente })}
        </p>
      )}
      {auftrag?.status === 'fehler' && <p className="fehlertext">{auftrag.fehler}</p>}
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
    </>
  );
}

/** Vorschaubilder der ersten Seite für vorhandene Dokumente erzeugen (#332). */
function VorschauNachholen() {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  async function nachholen() {
    setLaeuft(true);
    setMeldung(undefined);
    try {
      const r = await betriebApi.vorschauNachholen();
      setMeldung({
        art: 'gut',
        text: r.eingereiht
          ? t('werkbank.texterkennung.fuer-dateien-entstehen-jetzt', { anzahl: r.eingereiht, zahl: zahl(r.eingereiht) })
          : t('werkbank.texterkennung.nichts-nachzuholen-alle-pdfs'),
      });
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <section className="blatt" id="vorschau">
      <h2 className="h3">{t('werkbank.texterkennung.vorschaubilder-nachholen')}</h2>
      <p className="leise">{t('werkbank.texterkennung.neben-jedem-pdf-und')}</p>
      {meldung && (
        <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">
          {meldung.text}
        </p>
      )}
      <div className="knoepfe">
        <Knopf laeuft={laeuft} laeuftText={t('werkbank.texterkennung.stelle-ein')} onClick={() => void nachholen()}>
          {t('werkbank.texterkennung.vorschaubilder-nachholen')}
        </Knopf>
      </div>
    </section>
  );
}
