import { useState } from 'react';
import { DARF_VORGABE, PAKETE_GRENZEN, SELBST_STUFEN, ueberHoechstwert, type Darf } from '../../../shared/src/darf';
import { t } from '../sprache';
import { DarfFrage } from '../werkbank/uebersicht/DarfFrage';
import { Navigation, Probleme, pruefeSchritt, useSenden, weiterVon, zurueckVon } from './ablauf';
import { NR, Rahmen, type Leiste } from './rahmen';
import { setzeSammlung, type Sammlung } from './stand';

/**
 * „Was darf Ablago?“ (#1566) vor den Paketen: die beiden Fragen aus #1562 mit demselben Bedienelement wie die Karte in
 * der Werkbank-Übersicht – eine Zeile je Antwort, der Satz nur unter der gewählten, „Das heißt für euch“ in einem Satz.
 * Vorausgewählt sind die empfohlenen Antworten; Höchstwerte des Anbieters aus der Konfigurationsdatei sperren, was
 * darüber liegt. Gespeichert wird erst mit „Jetzt einrichten“. Ändert sich die Antwort auf Frage 1, wählt Ablago die
 * Pakete im nächsten Schritt neu.
 */
export function DarfSchritt({ s, zurWahl, leiste }: { s: Sammlung; zurWahl: () => void; leiste: Leiste }) {
  const hoechstens = s.darf?.hoechstens ?? {};
  // Vorgabe, aber nie über dem Höchstwert des Anbieters.
  const [wahl, setWahl] = useState<Darf>(() => {
    const pakete = s.darf?.pakete ?? DARF_VORGABE.pakete;
    const selbst = s.darf?.selbst ?? DARF_VORGABE.selbst;
    return {
      pakete: hoechstens.pakete && ueberHoechstwert(hoechstens, { pakete }) ? hoechstens.pakete : pakete,
      selbst: hoechstens.selbst && ueberHoechstwert(hoechstens, { selbst }) ? hoechstens.selbst : selbst,
    };
  });
  const [probleme, setProbleme] = useState<string[] | undefined>(s.probleme.darf);
  const x = useSenden();
  const merke = () =>
    setzeSammlung((a) => {
      const anders = !!a.pakete && (a.darf?.pakete ?? DARF_VORGABE.pakete) !== wahl.pakete;
      return {
        ...a,
        darf: { ...wahl, ...(Object.keys(hoechstens).length ? { hoechstens } : {}) },
        // Andere Grenze: Die bisherige Auswahl passt vielleicht nicht mehr – Ablago wählt im nächsten Schritt neu.
        ...(anders ? { pakete: null, paketeAuswahl: undefined, besucht: a.besucht.filter((b) => b !== 'pakete') } : {}),
      };
    });
  return (
    <Rahmen aktiv={NR.darf} titel={t('einrichtung.darf.titel')} unter={t('einrichtung.darf.unter')} leiste={leiste}>
      <form className="stapel" onSubmit={(e) => e.preventDefault()}>
        <Probleme liste={probleme} />
        <DarfFrage
          name="darf-pakete"
          frage={t('werkbank.darf.frage.pakete')}
          antworten={PAKETE_GRENZEN}
          bereich="pakete"
          wert={wahl.pakete}
          vorgabe={DARF_VORGABE.pakete}
          gesperrt={(a) => ueberHoechstwert(hoechstens, { pakete: a })}
          heisst={t.frei(`werkbank.darf.pakete.${wahl.pakete}.heisst`)}
          setze={(pakete) => setWahl((w) => ({ ...w, pakete }))}
        />
        <DarfFrage
          name="darf-selbst"
          frage={t('werkbank.darf.frage.selbst')}
          antworten={SELBST_STUFEN}
          bereich="selbst"
          wert={wahl.selbst}
          vorgabe={DARF_VORGABE.selbst}
          gesperrt={(a) => ueberHoechstwert(hoechstens, { selbst: a })}
          heisst={t('werkbank.darf.selbst.heisst')}
          setze={(selbst) => setWahl((w) => ({ ...w, selbst }))}
        />
        <p className="leise klein">{t('einrichtung.darf.spaeter')}</p>
        <Navigation
          sendet={x.sendet}
          fehler={x.fehler}
          zurueck={() => {
            merke();
            zurueckVon('darf', zurWahl);
          }}
          weiter={() =>
            void x.los(async () => {
              merke();
              const p = await pruefeSchritt('darf');
              setProbleme(p);
              if (!p.length) weiterVon('darf');
            })
          }
        />
      </form>
    </Rahmen>
  );
}
