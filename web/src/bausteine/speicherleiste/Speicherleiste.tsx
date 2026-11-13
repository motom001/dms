import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { istGeaendert, leistenknoepfe, verwerfenSchritt } from '../../../../shared/src/entwurf';
import { geheZu, loeseWache, useUngespeichert } from '../../ort';
import { rueckfrage } from '../../rueckfrage';
import { t } from '../../sprache';
import type { SymbolName } from '../../Symbol';
import { Knopf, type GefahrRueckfrage, type KnopfSperre } from '../knopf/Knopf';
import s from './Speicherleiste.module.css';

/**
 * Baustein Speicherleiste (#370, aus Bausteinen seit #1210): ein Muster für alle Anlege-/Bearbeiten-Formulare.
 *
 *   const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(gespeichert), liste: '/werkbank/…' });
 *   <form onSubmit={…} onKeyDown={ent.tasten}>
 *     …
 *     <Speicherleiste ent={ent} gegenstand="Nummernkreis" />
 *   </form>
 *
 * `useEntwurf` fragt beim Verlassen mit ungespeicherten Änderungen nach (Rückfrage aus #355),
 * Esc im Formular verwirft (mit Rückfrage, wenn geändert). Nach erfolgreichem Speichern mit
 * anschließendem Seitenwechsel vorher `loeseWache()` aufrufen.
 *
 * Seit #1210 (Leitsätze 1, 3, 4, 6): Hauptknopf blau („<Gegenstand> speichern/anlegen“), „Verwerfen“ als Knopf mit
 * Rand (Art Neben, ohne Symbol, ohne Rückfrage – nur Esc mit Änderungen fragt), beide ohne Änderung blass (nichts zu
 * tun). Links ein fester Platz für „… löschen“ (`loeschen`): ein Gefahr-Knopf in normaler Größe mit Rückfrage, auf
 * einer Linie mit den anderen; gesperrt aus einem Grund gestrichelt mit Schloss und ⓘ.
 */

export interface Entwurf {
  neu: boolean;
  geaendert: boolean;
  /** Verwerfen: bei „Neu“ zurück zur Liste, sonst auf den gespeicherten Stand. */
  verwerfen(ausloeser?: 'knopf' | 'esc'): Promise<void>;
  /** Als `onKeyDown` an das Formular: Esc = Verwerfen. */
  tasten(e: KeyboardEvent): void;
}

/**
 * Neuer gespeicherter Stand von außen (z. B. eine wiederhergestellte Fassung, #1006): Ist im Entwurf nichts geändert,
 * gilt gleich der neue Stand; sonst bleibt der Entwurf, und „Verwerfen“ zeigt den neuen.
 */
export function useGespeichertNachziehen<T>(gespeichert: T, aktuell: T, setze: (x: T) => void) {
  const text = JSON.stringify(gespeichert);
  const vorher = useRef(text);
  useEffect(() => {
    if (vorher.current === text) return;
    if (JSON.stringify(aktuell) === vorher.current) setze(gespeichert);
    vorher.current = text;
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps -- nur, wenn sich der gespeicherte Stand ändert
}

export function useEntwurf<T>(gespeichert: T, aktuell: T, o: { neu?: boolean; zuruecksetzen(): void; liste?: string; aus?: boolean }): Entwurf {
  const neu = !!o.neu;
  const geaendert = !o.aus && istGeaendert(gespeichert, aktuell);
  useUngespeichert(geaendert);
  async function verwerfen(ausloeser: 'knopf' | 'esc' = 'knopf') {
    const s = verwerfenSchritt({ neu, geaendert }, ausloeser);
    if (s.aktion === 'nichts') return;
    if (s.rueckfrage && !(await rueckfrage({
      titel: neu ? t('oberflaeche.speicherleiste.entwurf-verwerfen') : t('oberflaeche.speicherleiste.aenderungen-verwerfen'),
      text: neu ? t('oberflaeche.speicherleiste.was-du-eingegeben-hast') : t('oberflaeche.speicherleiste.die-felder-gehen-auf'),
      ja: t('oberflaeche.speicherleiste.verwerfen'), nein: t('oberflaeche.speicherleiste.weiter-bearbeiten'), gefahr: true,
    }))) return;
    if (s.aktion === 'schliessen') {
      if (o.liste) { loeseWache(); geheZu(o.liste); } else o.zuruecksetzen();
    } else o.zuruecksetzen();
  }
  function tasten(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void verwerfen('esc');
  }
  return { neu, geaendert, verwerfen, tasten };
}

/** „… löschen“ in der Speicherleiste (#1210): Gefahr-Knopf mit Rückfrage am festen Platz links. */
export interface SpeicherleisteLoeschen {
  /** Beschriftung mit Gegenstand: „Nummernkreis löschen“. */
  text: string;
  rueckfrage: GefahrRueckfrage;
  /** Erst nach „Ja“ in der Rückfrage; darf ein Promise liefern („läuft“ und Fehler am Knopf). */
  onClick(): void | Promise<unknown>;
  /** Gesperrt aus einem Grund (z. B. noch verwendet): gestrichelt mit Schloss und ⓘ, Erklärung am Knopf. */
  gesperrt?: string | KnopfSperre | false | null;
  /** Symbol; Vorgabe Papierkorb. */
  symbol?: SymbolName;
}

export interface SpeicherleisteProps {
  ent: Entwurf;
  gegenstand?: string;
  sendet?: boolean;
  ungueltig?: boolean;
  /** Hauptknopf auch ohne Änderung aktiv. */
  speicherbar?: boolean;
  speichern?: () => void;
  /** Fester Platz links für „… löschen“ (#1210). */
  loeschen?: SpeicherleisteLoeschen;
  /** Weitere Knöpfe rechts, vor „Verwerfen“ (z. B. „Als Standard festlegen“). */
  weitere?: ReactNode;
  meldung?: { art: string; text: string };
  /** Eigene Beschriftung des Hauptknopfs (selten; sonst „<Gegenstand> anlegen/speichern“). */
  haupttext?: string;
  /**
   * `id` des Formulars, wenn die Leiste außerhalb davon steht (#1000): Editoren mit Bereichen haben unten eine Leiste
   * für alles, während Bereiche mit eigenen Sofortaktionen (eigene kleine Formulare) nicht im Formular liegen dürfen.
   */
  formular?: string;
}

/**
 * Aktionsleiste am unteren Rand des Formulars, bleibt beim Scrollen sichtbar (Vorbild: Ansichten- und
 * Mappentyp-Editor). Links „… löschen“, in der Mitte der Status, rechts „Verwerfen“ und der Hauptknopf mit dem
 * Gegenstand im Namen. Ohne `speichern` ist der Hauptknopf ein Submit-Knopf des umgebenden Formulars.
 */
export function Speicherleiste({ ent, gegenstand, sendet, ungueltig, speicherbar, speichern, loeschen, weitere, meldung, haupttext, formular }: SpeicherleisteProps) {
  const k = leistenknoepfe({ neu: ent.neu, geaendert: ent.geaendert, sendet, ungueltig, speicherbar }, gegenstand);
  // Beschriftung ohne „Speichere …“: Während des Sendens zeigt der Knopf „läuft“ mit diesem Text darüber.
  const ruhig = leistenknoepfe({ neu: ent.neu, geaendert: ent.geaendert, ungueltig, speicherbar }, gegenstand);
  return (
    <div className={`speicherleiste ${s.leiste}`}>
      {loeschen && (
        <Knopf art="gefahr" symbol={loeschen.symbol ?? 'geloescht'} rueckfrage={loeschen.rueckfrage} gesperrt={loeschen.gesperrt} onClick={loeschen.onClick} className={s.loeschen}>
          <span className={s.loeschtext}>{loeschen.text}</span>
        </Knopf>
      )}
      <span className={`status ${meldung?.art === 'schlecht' ? 'schlecht' : ''}`} role="status">{meldung?.text ?? k.status}</span>
      <div className={`knoepfe ${s.knoepfe}`}>
        {weitere}
        <Knopf gesperrt={!k.verwerfen.aktiv} title={k.verwerfen.aktiv ? k.verwerfen.titel : undefined} onClick={() => void ent.verwerfen()}>{k.verwerfen.text}</Knopf>
        <Knopf art="haupt" type={speichern ? 'button' : 'submit'} form={speichern ? undefined : formular} gesperrt={!k.haupt.aktiv && !sendet} laeuft={sendet} laeuftText={k.haupt.text} onClick={speichern}>
          {haupttext ?? ruhig.haupt.text}
        </Knopf>
      </div>
    </div>
  );
}
