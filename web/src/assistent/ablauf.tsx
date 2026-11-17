import { useState } from 'react';
import type { Sammelschritt } from '../../../shared/src/einrichtungsplan';
import { Knopf } from '../bausteine';
import { einrichtungApi } from '../api/einrichtung';
import { t } from '../sprache';
import { ausfuehren, STUFEN_JE_SCHRITT, stufenZuruecksetzen } from './ausfuehren';
import { NR, REIHE, VOR, zurSprache, type Leiste } from './rahmen';
import { holeStand, planAus, setzeSammlung, setzeStand, type Ansicht, type Sammlung } from './stand';

/** Ablauf beim Sammeln (#1279 aus Schritte.tsx gezogen): Schrittleiste, Weiter und Zurück, Navigation, Prüfen. */
/** Schrittleiste beim Sammeln: Code und Datenbank sind erledigt, alles ab „Neu oder Sicherung“ jederzeit anklickbar. */
export function sammelLeiste(s: Sammlung, zurWahl: () => void): Leiste {
  // Sprache ändern beim Sammeln: zurück zum ersten Schritt (Gesammeltes bleibt).
  return {
    erledigt: (i) => i < VOR.wahl + 1 || REIHE.some((a) => NR[a] === i && s.besucht.includes(a)),
    klick: (i) =>
      i === VOR.sprache
        ? zurSprache
        : i === VOR.wahl
          ? zurWahl
          : i >= NR.ablage && i <= NR.zusammenfassung
            ? () => setzeSammlung((x) => ({ ...x, ansicht: REIHE[i - NR.ablage] }))
            : null,
    gesperrt: (i) =>
      i === VOR.code
        ? t('einrichtung.gesperrt.code')
        : i === VOR.datenbank
          ? t('einrichtung.gesperrt.datenbank')
          : i === NR.fertig
            ? t('einrichtung.gesperrt.fertig')
            : null,
  };
}

/** Nach „Weiter“: nächster Schritt – nach „Ändern“ oder dem Laden der nächste, der nicht passt, sonst die Zusammenfassung. */
export function weiterVon(von: Ansicht) {
  const st = holeStand();
  if (st.aendern) {
    // Ändern während „Jetzt einrichten“ (nach einem Fehler): zurück zum Fortschritt, betroffene Stufen erneut.
    if (von !== 'zusammenfassung') stufenZuruecksetzen([...STUFEN_JE_SCHRITT[von]]);
    setzeStand((x) => ({
      ...x,
      aendern: null,
      sammlung: {
        ...x.sammlung,
        besucht: [...new Set([...x.sammlung.besucht, von])],
        probleme: { ...x.sammlung.probleme, [von]: undefined },
      },
    }));
    void ausfuehren();
    return;
  }
  setzeSammlung((s) => {
    const probleme = { ...s.probleme, [von]: undefined };
    const besucht = [...new Set([...s.besucht, von])];
    const naechster = s.zurZusammenfassung
      ? (REIHE.find((a) => a !== von && a !== 'zusammenfassung' && (probleme[a as Sammelschritt]?.length || !besucht.includes(a))) ??
        'zusammenfassung')
      : (REIHE[REIHE.indexOf(von) + 1] ?? 'zusammenfassung');
    return { ...s, probleme, besucht, ansicht: naechster };
  });
}

export function zurueckVon(von: Ansicht, zurWahl: () => void) {
  if (holeStand().aendern) {
    setzeStand((x) => ({ ...x, aendern: null }));
    return;
  }
  const i = REIHE.indexOf(von);
  if (i <= 0) zurWahl();
  else setzeSammlung((s) => ({ ...s, ansicht: REIHE[i - 1] }));
}

/** Navigation am Ende jedes Schritts – überall gleich: links „Zurück“, rechts „Weiter“. */
export function Navigation({
  zurueck,
  weiter,
  weiterText,
  sendet,
  fehler,
  kannWeiter = true,
}: {
  zurueck?: () => void;
  weiter: () => void;
  weiterText?: string;
  sendet?: boolean;
  fehler?: string;
  kannWeiter?: boolean;
}) {
  const aendern = !!holeStand().aendern;
  return (
    <>
      {fehler && (
        <p className="fehlertext" role="alert">
          {fehler}
        </p>
      )}
      <div className="knoepfe">
        {zurueck && (
          <Knopf symbol="pfeil-links" onClick={zurueck}>
            {aendern ? t('einrichtung.zurueck.lauf') : t('einrichtung.zurueck')}
          </Knopf>
        )}
        <Knopf
          art="haupt"
          type="submit"
          laeuft={sendet}
          laeuftText={t('einrichtung.pruefe')}
          gesperrt={!kannWeiter}
          onClick={(e) => {
            e.preventDefault();
            weiter();
          }}>
          {weiterText ?? (aendern ? t('einrichtung.uebernehmen.lauf') : t('einrichtung.weiter'))}
        </Knopf>
      </div>
    </>
  );
}

/** Gründe aus der Prüfung bzw. der Datei, oben im Schritt. */
export function Probleme({ liste }: { liste?: string[] }) {
  if (!liste?.length) return null;
  return (
    <div className="hinweis warn" role="status">
      <p>
        <strong>{t('einrichtung.probleme')}</strong>
      </p>
      <ul>
        {liste.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export function useSenden() {
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const los = async (f: () => Promise<void>) => {
    setSendet(true);
    setFehler(undefined);
    try {
      await f();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSendet(false);
    }
  };
  return { sendet, fehler, setFehler, los };
}

/** Prüft einen Schritt auf dem Server (ohne etwas anzulegen): die Gründe, leer = passt. */
export async function pruefeSchritt(s: Sammelschritt, passwort?: string): Promise<string[]> {
  const { probleme } = await einrichtungApi.einrichtungPruefen(planAus(holeStand().sammlung), passwort);
  return probleme[s] ?? [];
}
