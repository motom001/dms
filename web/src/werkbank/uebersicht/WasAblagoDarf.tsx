import { useState } from 'react';
import { t } from '../../sprache';
import { Knopf } from '../../bausteine';
import { betriebApi } from '../../api/betrieb';
import { ApiFehler } from '../../api/anfrage';
import { useKonto } from '../../konto';
import { hatGesamt } from '../../../../shared/src/verwaltungsrecht';
import { DARF_VORGABE, PAKETE_GRENZEN, SELBST_STUFEN, ueberHoechstwert, type Darf, type DarfStand } from '../../../../shared/src/darf';
import type { UebersichtZustand } from './zustand';
import { DarfFrage } from './DarfFrage';
import { Feinabstimmung } from './Feinabstimmung';

/** Paket über der neuen Grenze, wie der Server es beim Senken nennt (#1562, #1563). */
interface Betroffen {
  id: string;
  name: string;
  grund: string;
}

/**
 * Karte „Was Ablago darf“ (#1562) ganz oben in der Übersicht: die beiden gewählten Antworten als zwei Sätze, dazu
 * „Ändern …“ mit denselben zwei Fragen. Je Frage eine Optionsgruppe, eine Zeile je Antwort; der erklärende Satz steht
 * nur unter der gewählten, darunter „Das heißt für euch“. Antworten über dem Höchstwert des Anbieters sind gesperrt.
 * Keine Stufennummern – nur Antworten in Worten. Bei „Auch Helfer, die Dienste im Netz nutzen“ darunter aufklappbar die
 * Feinabstimmung (#1635): welche Bereiche nicht an Dienste im Netz gehen.
 */
export function WasAblagoDarf({ u }: { u: UebersichtZustand }) {
  const d = u.stand?.darf;
  // Ältere Server ohne „Was Ablago darf“: keine Karte.
  return d ? <DarfKarte d={d} u={u} /> : null;
}

function DarfKarte({ d, u }: { d: DarfStand; u: UebersichtZustand }) {
  const { ich } = useKonto();
  const [offen, setOffen] = useState(false);
  return (
    <section id="was-ablago-darf" className="blatt darf-karte" aria-labelledby="was-ablago-darf-titel" data-anker="werkbank.darf">
      <h2 id="was-ablago-darf-titel" className="h3">
        {t('werkbank.darf.titel')}
      </h2>
      {offen ? (
        <DarfAendern d={d} u={u} schliessen={() => setOffen(false)} />
      ) : (
        <>
          <p>
            {t.frei(`werkbank.darf.pakete.${d.pakete}.satz`)} {t.frei(`werkbank.darf.selbst.${d.selbst}.satz`)}
          </p>
          {hatGesamt(ich) && (
            <div className="knoepfe">
              <Knopf groesse="klein" onClick={() => setOffen(true)}>
                {t('werkbank.darf.aendern')}
              </Knopf>
            </div>
          )}
          {d.pakete === 'netz' && hatGesamt(ich) && <Feinabstimmung />}
        </>
      )}
    </section>
  );
}

/** „Ändern …“: beide Fragen, Speichern und Abbrechen; beim Senken vorher die Pakete, die nicht mehr passen. */
function DarfAendern({ d, u, schliessen }: { d: DarfStand; u: UebersichtZustand; schliessen(): void }) {
  const [wahl, setWahl] = useState<Darf>({ pakete: d.pakete, selbst: d.selbst });
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const [betroffen, setBetroffen] = useState<Betroffen[] | null>(null);
  const speichern = async () => {
    setSendet(true);
    setFehler(undefined);
    try {
      // Senken (#1563): erst die Liste, dann mit Bestätigung anhalten und speichern.
      await betriebApi.darfSetzen({ ...wahl, ...(betroffen ? { bestaetigt: true } : {}) });
      await u.laden();
      schliessen();
    } catch (e) {
      const b = e instanceof ApiFehler ? (e.details as { betroffen?: Betroffen[] } | undefined)?.betroffen : undefined;
      if (b?.length) setBetroffen(b);
      else setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  };
  return (
    <form
      className="stapel"
      onSubmit={(e) => {
        e.preventDefault();
        void speichern();
      }}>
      <p className="leise klein">{t('werkbank.darf.unter')}</p>
      <DarfFrage
        name="darf-pakete"
        frage={t('werkbank.darf.frage.pakete')}
        antworten={PAKETE_GRENZEN}
        bereich="pakete"
        wert={wahl.pakete}
        vorgabe={DARF_VORGABE.pakete}
        gesperrt={(a) => ueberHoechstwert(d.hoechstens, { pakete: a })}
        heisst={t.frei(`werkbank.darf.pakete.${wahl.pakete}.heisst`)}
        setze={(pakete) => {
          setBetroffen(null);
          setWahl((w) => ({ ...w, pakete }));
        }}
      />
      <DarfFrage
        name="darf-selbst"
        frage={t('werkbank.darf.frage.selbst')}
        antworten={SELBST_STUFEN}
        bereich="selbst"
        wert={wahl.selbst}
        vorgabe={DARF_VORGABE.selbst}
        gesperrt={(a) => ueberHoechstwert(d.hoechstens, { selbst: a })}
        heisst={t('werkbank.darf.selbst.heisst')}
        setze={(selbst) => setWahl((w) => ({ ...w, selbst }))}
      />
      {betroffen && (
        <div className="hinweis warn" role="alert">
          <p>
            <strong>{t('werkbank.darf.senken.titel')}</strong>
          </p>
          <ul>
            {betroffen.map((x) => (
              <li key={x.id}>{x.grund}</li>
            ))}
          </ul>
          <p>{t('werkbank.darf.senken.anhalten')}</p>
        </div>
      )}
      {fehler && <p className="fehlertext">{fehler}</p>}
      <div className="knoepfe">
        <Knopf art="haupt" type="submit" laeuft={sendet}>
          {betroffen ? t('werkbank.darf.senken.bestaetigen') : t('werkbank.darf.speichern')}
        </Knopf>
        <Knopf onClick={schliessen}>{t('werkbank.darf.abbrechen')}</Knopf>
      </div>
    </form>
  );
}
