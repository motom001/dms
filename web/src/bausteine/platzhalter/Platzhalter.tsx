import { useRef } from 'react';
import { t } from '../../sprache';
import { Knopf } from '../knopf/Knopf';
import s from './Platzhalter.module.css';

/**
 * Baustein Platzhalter (#1177): Platzhalter zum Anklicken – überall gleich, wo ein Text Platzhalter kennt (Titel-Vorlage
 * und „Zusammengesetzt“ im Mappentyp, Karten der Automatisierungen, Ablaufvorlagen). Anleitung im Entwicklerhandbuch,
 * „Gestaltung und Bausteine → Platzhalter“.
 *
 * - Je Platzhalter ein kleiner Knopf mit verständlichem Namen („Kündigungsfrist“); beim Überfahren der technische
 *   Platzhalter (`{kuendigung}`).
 * - Gruppiert: „Allgemein“ und je Mappentyp eine Gruppe – so sieht man, woher Platzhalter kommen. `zusatz` sagt z. B.
 *   „nur bei Vertrag“, wenn ein Feld nicht in allen gewählten Mappentypen steht.
 * - Ein Klick setzt an der **Schreibmarke** ein (`usePlatzhalterEinsetzen`), nicht nur ans Ende – im zuletzt benutzten
 *   Feld, sonst im zuletzt angemeldeten am Ende.
 */
export interface PlatzhalterEintrag {
  /** Der Schlüssel ohne Klammern: `kuendigung` → `{kuendigung}`. */
  key: string;
  /** Verständlicher Name, z. B. die Feldbeschriftung. */
  text: string;
  /** Kurz dahinter, z. B. „nur bei Vertrag“. */
  zusatz?: string;
  /** Tooltip; Vorgabe der technische Platzhalter. */
  titel?: string;
}
export interface PlatzhalterGruppe { name?: string; eintraege: PlatzhalterEintrag[] }

export interface PlatzhalterProps {
  gruppen: PlatzhalterGruppe[];
  /** Einsetzen – meist `einsetzen` aus `usePlatzhalterEinsetzen`. */
  einsetzen(key: string): void;
  /** Name der Gruppe für Screenreader und sichtbar davor; Vorgabe „Platzhalter einsetzen“. */
  beschriftung?: string;
  className?: string;
}

export function Platzhalter({ gruppen, einsetzen, beschriftung, className }: PlatzhalterProps) {
  const name = beschriftung ?? t('oberflaeche.platzhalter.einsetzen');
  const da = gruppen.filter((g) => g.eintraege.length);
  if (!da.length) return null;
  return (
    <div role="group" aria-label={name} className={[s.platzhalter, className].filter(Boolean).join(' ')}>
      <span className={s.name} aria-hidden="true">{name}</span>
      {da.map((g, i) => (
        <div key={g.name ?? i} className={s.gruppe} role={g.name ? 'group' : undefined} aria-label={g.name}>
          {g.name && <span className={s.gruppenname} aria-hidden="true">{g.name}</span>}
          <span className={s.chips}>
            {g.eintraege.map((e) => (
              <Knopf key={e.key} groesse="klein" title={e.titel ?? `{${e.key}}`} onClick={() => einsetzen(e.key)}>
                {e.text}{e.zusatz && <span className={s.zusatz}>{e.zusatz}</span>}
              </Knopf>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

type Eingabe = HTMLInputElement | HTMLTextAreaElement;
interface Ziel { el: Eingabe | null; wert: string; setze(v: string): void; benutzt: boolean }

/**
 * Einsetzen an der Schreibmarke (#1177). `feld(name, wert, setze)` an jede Eingabe hängen, die Platzhalter annimmt
 * (`{...feld('text', karte.text, (v) => …)}`), `einsetzen(key)` an den Baustein Platzhalter. Ziel ist das zuletzt
 * benutzte Feld an seiner Schreibmarke (bzw. Markierung, die ersetzt wird); war noch keins dran, das zuletzt
 * angemeldete am Ende. `trenner` (z. B. „ · “) kommt davor, wenn am Ende eines nicht leeren Texts eingesetzt wird.
 */
export function usePlatzhalterEinsetzen(o: { trenner?: string } = {}) {
  const ziele = useRef(new Map<string, Ziel>());
  const letztes = useRef<string | null>(null);
  function feld(name: string, wert: string, setze: (v: string) => void) {
    const alt = ziele.current.get(name);
    ziele.current.set(name, { el: alt?.el ?? null, wert, setze, benutzt: alt?.benutzt ?? false });
    return {
      ref: (el: Eingabe | null) => { const z = ziele.current.get(name); if (z) z.el = el; },
      onFocus: () => { letztes.current = name; const z = ziele.current.get(name); if (z) z.benutzt = true; },
    };
  }
  function einsetzen(key: string) {
    const da = [...ziele.current.entries()].filter(([, z]) => z.el?.isConnected);
    const [, z] = da.find(([n]) => n === letztes.current) ?? da[da.length - 1] ?? [];
    if (!z) return;
    const el = z.el!;
    const von = z.benutzt ? el.selectionStart ?? z.wert.length : z.wert.length;
    const bis = z.benutzt ? el.selectionEnd ?? von : von;
    const davor = o.trenner && von === z.wert.length && von === bis && z.wert.trim() ? o.trenner : '';
    const vorn = davor ? z.wert.trimEnd() : z.wert.slice(0, von);
    const platz = `${davor}{${key}}`;
    z.setze(vorn + platz + z.wert.slice(bis));
    z.benutzt = true;
    letztes.current = [...ziele.current.entries()].find(([, x]) => x === z)?.[0] ?? null;
    const ende = vorn.length + platz.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ende, ende); });
  }
  return { feld, einsetzen };
}
