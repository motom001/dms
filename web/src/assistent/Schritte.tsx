import { useState } from 'react';
import { FeldGruppe, Knopf } from '../bausteine';
import { t, wechsleSprache } from '../sprache';
import { EINGEBAUTE_SPRACHEN, sprache } from '../../../shared/src/sprache';
import { sprachname } from '../../../shared/src/beschriftung';
import { ausfuehren, neuerLauf } from './ausfuehren';
import { sammelLeiste } from './ablauf';
import { Abschluss, LaufAnsicht } from './Abschluss';
import { DarfSchritt } from './DarfSchritt';
import { PaketeSchritt, OptionalSchritt } from './PaketeOptional';
import { NR, Rahmen, VOR, type Leiste } from './rahmen';
import { AblageSchritt, KontoSchritt, NutzungSchritt } from './SammelSchritte';
import { setzeStand, STUFEN, useAssistent } from './stand';
import { Zusammenfassung } from './Zusammenfassung';

/**
 * Einrichtungsassistent (#119, #804): Sprache, dann sammeln, Zusammenfassung, „Jetzt einrichten“ und Abschluss. Seit
 * #1279 in Teilen: Rahmen und Schrittleiste (rahmen.tsx), Ablauf beim Sammeln (ablauf.tsx), die Schritte
 * (SammelSchritte.tsx, DarfSchritt.tsx, PaketeOptional.tsx mit PaketeVorschlag.tsx, Zusammenfassung.tsx) und Fortschritt
 * mit Abschluss (Abschluss.tsx).
 * Diese Datei bleibt die Tür für einrichtung.tsx.
 */
export { Rahmen, VOR, zurSprache, type Leiste } from './rahmen';

/* ---------- Sprache (#729) ---------- */

/**
 * Erster Schritt (#729): In welcher Sprache richtest du ein? Sie wird die Sprache der Installation und deine eigene;
 * weitere Sprachen erlaubst du danach in der Werkbank. Ein Wechsel lädt die Seite neu – Gesammeltes bleibt erhalten.
 */
export function SprachSchritt({ leiste }: { leiste: Leiste }) {
  const [wahl, setWahl] = useState(EINGEBAUTE_SPRACHEN.includes(sprache() as never) ? sprache() : 'de');
  const weiter = () => {
    setzeStand((x) => ({ ...x, spracheGewaehlt: true }));
    wechsleSprache(wahl);
  };
  return (
    <Rahmen aktiv={VOR.sprache} titel={t('einrichtung.sprache.titel')} unter={t('einrichtung.sprache.unter')} leiste={leiste}>
      <form
        className="stapel"
        onSubmit={(e) => {
          e.preventDefault();
          weiter();
        }}>
        <FeldGruppe beschriftung={t('einrichtung.sprache.titel')} beschriftungVerbergen hinweis={t('einrichtung.sprache.spaeter')}>
          <div className="wahlkarten">
            {EINGEBAUTE_SPRACHEN.map((s) => (
              <label key={s} className={`wahlkarte${wahl === s ? ' gewaehlt' : ''}`} lang={s}>
                <input type="radio" name="sprache" value={s} checked={wahl === s} onChange={() => setWahl(s)} />
                <strong>{sprachname(s, s)}</strong>
              </label>
            ))}
          </div>
        </FeldGruppe>
        <div className="knoepfe">
          <Knopf art="haupt" type="submit">
            {t('einrichtung.weiter')}
          </Knopf>
        </div>
      </form>
    </Rahmen>
  );
}

/* ---------- Ganzer Ablauf nach „Neu einrichten“ ---------- */

/**
 * Sammeln, Zusammenfassung, Fortschritt und Abschluss – vor und nach dem Anlegen des eigenen Kontos dieselbe
 * Oberfläche, der Stand liegt außerhalb der Komponente (stand.ts). `zurWahl` führt zurück zu „Neu oder Sicherung“.
 */
export function Sammelassistent({
  zurWahl,
  abschliessen,
  version = null,
  imEinrichtungsmodus,
}: {
  zurWahl: () => void;
  abschliessen: () => Promise<void>;
  version?: string | null;
  imEinrichtungsmodus?: boolean;
}) {
  const st = useAssistent();
  const s = st.sammlung;
  if (st.lauf && !st.aendern) return st.lauf.fertig ? <Abschluss abschliessen={abschliessen} version={version} /> : <LaufAnsicht />;
  const leiste: Leiste = st.aendern
    ? { erledigt: (i) => i < NR.zusammenfassung, gesperrt: () => t('einrichtung.gesperrt.lauf') }
    : sammelLeiste(s, zurWahl);
  const ansicht = st.aendern ?? s.ansicht;
  const p = { s, zurWahl, leiste };
  const k = `${ansicht}-${st.aendern ?? ''}`;
  if (ansicht === 'ablage') return <AblageSchritt key={k} {...p} datei={st.aendern ? undefined : { imEinrichtungsmodus }} />;
  if (ansicht === 'konto') return <KontoSchritt key={k} {...p} />;
  if (ansicht === 'nutzung') return <NutzungSchritt key={k} {...p} />;
  if (ansicht === 'darf') return <DarfSchritt key={k} {...p} />;
  if (ansicht === 'pakete') return <PaketeSchritt key={k} {...p} />;
  if (ansicht === 'optional') return <OptionalSchritt key={k} {...p} />;
  return <Zusammenfassung key={k} {...p} />;
}

/** Nach dem Anmelden ohne gespeicherten Stand (anderer Browser, alter Assistent): nur noch Schlüssel und Notfallblatt. */
export function unterbrochenerLauf() {
  const l = neuerLauf();
  for (const s of STUFEN) if (s !== 'schluessel') l.stufen[s] = { zustand: 'ausgelassen' };
  setzeStand((x) => ({ ...x, neu: true, lauf: { ...l, unterbrochen: true } }));
  void ausfuehren();
}
