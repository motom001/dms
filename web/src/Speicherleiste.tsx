import type { KeyboardEvent, ReactNode } from 'react';
import { istGeaendert, leistenknoepfe, verwerfenSchritt } from '../../shared/src/entwurf';
import { geheZu, loeseWache, useUngespeichert } from './ort';
import { rueckfrage } from './rueckfrage';

/**
 * Werkbank-Formulare (#370): ein Muster für alle Anlege-/Bearbeiten-Formulare.
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
 */

export interface Entwurf {
  neu: boolean;
  geaendert: boolean;
  /** Verwerfen: bei „Neu“ zurück zur Liste, sonst auf den gespeicherten Stand. */
  verwerfen(ausloeser?: 'knopf' | 'esc'): Promise<void>;
  /** Als `onKeyDown` an das Formular: Esc = Verwerfen. */
  tasten(e: KeyboardEvent): void;
}

export function useEntwurf<T>(gespeichert: T, aktuell: T, o: { neu?: boolean; zuruecksetzen(): void; liste?: string; aus?: boolean }): Entwurf {
  const neu = !!o.neu;
  const geaendert = !o.aus && istGeaendert(gespeichert, aktuell);
  useUngespeichert(geaendert);
  async function verwerfen(ausloeser: 'knopf' | 'esc' = 'knopf') {
    const s = verwerfenSchritt({ neu, geaendert }, ausloeser);
    if (s.aktion === 'nichts') return;
    if (s.rueckfrage && !(await rueckfrage({
      titel: neu ? 'Entwurf verwerfen?' : 'Änderungen verwerfen?',
      text: neu ? 'Was du eingegeben hast, wird nicht angelegt.' : 'Die Felder gehen auf den gespeicherten Stand zurück.',
      ja: 'Verwerfen', nein: 'Weiter bearbeiten', gefahr: true,
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

/**
 * Aktionsleiste am unteren Rand des Formulars, bleibt beim Scrollen sichtbar (Vorbild:
 * Ansichten- und Mappentyp-Editor). Links Platz z. B. für „Löschen“, in der Mitte der Status,
 * rechts „Verwerfen“ als Textknopf und der Hauptknopf mit dem Gegenstand im Namen.
 * Ohne `speichern` ist der Hauptknopf ein Submit-Knopf des umgebenden Formulars.
 */
export function Speicherleiste({ ent, gegenstand, sendet, ungueltig, speicherbar, speichern, links, weitere, meldung, haupttext }: {
  ent: Entwurf;
  gegenstand?: string;
  sendet?: boolean;
  ungueltig?: boolean;
  /** Hauptknopf auch ohne Änderung aktiv. */
  speicherbar?: boolean;
  speichern?: () => void;
  links?: ReactNode;
  /** Weitere Knöpfe rechts, vor „Verwerfen“ (z. B. „Als Standard festlegen“). */
  weitere?: ReactNode;
  meldung?: { art: string; text: string };
  /** Eigene Beschriftung des Hauptknopfs (selten; sonst „<Gegenstand> anlegen/speichern“). */
  haupttext?: string;
}) {
  const k = leistenknoepfe({ neu: ent.neu, geaendert: ent.geaendert, sendet, ungueltig, speicherbar }, gegenstand);
  return (
    <div className="speicherleiste">
      {links}
      <span className={`status ${meldung?.art === 'schlecht' ? 'schlecht' : ''}`} role="status">{meldung?.text ?? k.status}</span>
      <div className="knoepfe">
        {weitere}
        <button type="button" className="textknopf" disabled={!k.verwerfen.aktiv} title={k.verwerfen.titel} onClick={() => void ent.verwerfen()}>{k.verwerfen.text}</button>
        <button type={speichern ? 'button' : 'submit'} className="knopf primaer" disabled={!k.haupt.aktiv} onClick={speichern}>{sendet || !haupttext ? k.haupt.text : haupttext}</button>
      </div>
    </div>
  );
}
