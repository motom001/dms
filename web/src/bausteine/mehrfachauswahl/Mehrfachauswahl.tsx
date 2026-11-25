import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Knopf } from '../knopf/Knopf';
import { legeFest } from '../menue/lage';
import s from './Mehrfachauswahl.module.css';

/** Ein gewählter Eintrag: Inhalt (Text oder Link), optional ein Zusatz (z. B. ein Hinweis) und weitere Aktionen vor ✕. */
export interface GewaehlterEintrag {
  id: string;
  inhalt: ReactNode;
  zusatz?: ReactNode;
  aktionen?: ReactNode;
  /** Name des Knopfs ✕ für Bildschirmleser (und als Tooltip), z. B. „Halter entfernen“. */
  entfernenText: string;
}
/** Ein Vorschlag; mit `gruppe` (#1036) stehen Vorschläge derselben Gruppe unter einer Überschrift, in der Reihenfolge ihres ersten Auftretens. */
export interface Vorschlag {
  id: string;
  text: ReactNode;
  gruppe?: string;
}

/** Vorschläge nach Gruppe, in der Reihenfolge ihres ersten Auftretens; ohne Gruppen eine einzige ohne Namen. */
function gruppiert(v: Vorschlag[]): Array<{ name: string | null; eintraege: Vorschlag[] }> {
  if (!v.some((x) => x.gruppe)) return [{ name: null, eintraege: v }];
  const aus = new Map<string, Vorschlag[]>();
  for (const x of v) {
    const g = x.gruppe ?? '';
    aus.set(g, [...(aus.get(g) ?? []), x]);
  }
  return [...aus].map(([name, eintraege]) => ({ name: name || null, eintraege }));
}

export interface MehrfachauswahlProps {
  /** id des Suchfelds (für ein <label htmlFor>). */
  id?: string;
  /** Name der Liste der gewählten Einträge und der Vorschlagsliste (für Screenreader). */
  name: string;
  platzhalter: string;
  /** Beschriftung des Suchfelds, wenn kein <label> darauf zeigt. */
  eingabeLabel?: string;
  eingabe: string;
  setEingabe(v: string): void;
  offen: boolean;
  setOffen(v: boolean): void;
  /** Zusätzlich beim Schließen (Escape, Fokus verlässt das Feld). */
  schliessen?: () => void;
  vorschlaege: Vorschlag[] | null;
  /** Satz, wenn es keine Vorschläge gibt (leise), z. B. „Vertrag „xyz“ nicht gefunden“. */
  leerText: string;
  /** Unter den Vorschlägen, z. B. „… insgesamt – tippe, um einzugrenzen“. */
  fuss?: ReactNode;
  /**
   * Einträge zum Anlegen (#1288), immer als letzte der Liste – auch wenn es Treffer gibt: „+ Vertrag anlegen …“. Sie
   * lassen sich wie Vorschläge mit den Pfeiltasten erreichen; `legeAn` bekommt ihre id.
   */
  anlegen?: Vorschlag[];
  legeAn?(id: string): void;
  waehle(id: string): void;
  gewaehlt: GewaehlterEintrag[];
  entferne(id: string): void;
  /** Suchfeld ausblenden (Einzelwahl mit gesetztem Wert). */
  ohneSuche?: boolean;
  /** Unter der Auswahl, z. B. die Meldung „… angelegt“. */
  darunter?: ReactNode;
  className?: string;
  /** Vorschläge im Fluss statt fest im Fenster (nur Musterseite und Bilder, wie `offenZeigen` beim Datum). */
  imFluss?: boolean;
}

/** Eine Option der Liste: Vorschlag oder Eintrag zum Anlegen. */
type Option = { id: string; neu: boolean };

/**
 * Aktive Option für die Tastatur (#1288): Pfeiltasten wandern durch Vorschläge und Anlegen-Einträge, Enter wählt die
 * aktive (ohne aktive den ersten Vorschlag), Esc schließt. Der Fokus bleibt im Suchfeld (`aria-activedescendant`).
 */
function useAktiv(optionen: Option[], listeId: string) {
  const [aktiv, setAktiv] = useState(-1);
  const gueltig = aktiv >= 0 && aktiv < optionen.length ? aktiv : -1;
  const optionId = (i: number) => `${listeId}-o${i}`;
  useEffect(() => {
    if (gueltig >= 0) document.getElementById(optionId(gueltig))?.scrollIntoView?.({ block: 'nearest' });
  }, [gueltig]); // eslint-disable-line react-hooks/exhaustive-deps -- optionId hängt nur an listeId, die sich nicht ändert
  const wandere = (schritt: 1 | -1) => {
    if (!optionen.length) return;
    setAktiv(gueltig < 0 ? (schritt > 0 ? 0 : optionen.length - 1) : (gueltig + schritt + optionen.length) % optionen.length);
  };
  return { aktiv: gueltig, setAktiv, wandere, optionId };
}

/** Die Vorschlagsliste: Vorschläge (in Gruppen), „Nicht gefunden“, der Fuß und zuletzt die Einträge zum Anlegen. */
function Liste({
  p,
  listeId,
  aktiv,
  optionId,
  nimm,
}: {
  p: MehrfachauswahlProps;
  listeId: string;
  aktiv: number;
  optionId(i: number): string;
  nimm(o: Option): void;
}) {
  let i = 0;
  const option = (v: Vorschlag, neu: boolean) => {
    const nr = i++;
    return (
      <button
        key={`${neu ? 'n' : 'v'}${v.id}`}
        id={optionId(nr)}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={nr === aktiv}
        className={[s.option, neu && s.neu, nr === aktiv && 'an'].filter(Boolean).join(' ')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => nimm({ id: v.id, neu })}>
        {v.text}
      </button>
    );
  };
  return (
    <div id={listeId} className="wahlliste" role="listbox" aria-label={p.name}>
      {p.vorschlaege === null ? (
        <p className="leise klein">{t('felder.auswahl.lade')}</p>
      ) : (
        <>
          {!p.vorschlaege.length && <p className="leise klein">{p.leerText}</p>}
          {gruppiert(p.vorschlaege).map((g, j) => {
            const knoepfe = g.eintraege.map((v) => option(v, false));
            return g.name === null ? (
              <span key={j} className="wahlgruppe-ohne">
                {knoepfe}
              </span>
            ) : (
              <div key={j} role="group" aria-label={g.name} className="wahlgruppe">
                <p className="wahlgruppe-titel" aria-hidden="true">
                  {g.name}
                </p>
                {knoepfe}
              </div>
            );
          })}
          {p.vorschlaege.length > 0 && p.fuss}
          {(p.anlegen ?? []).map((v) => option(v, true))}
        </>
      )}
    </div>
  );
}

/** Die gewählten Einträge, je mit einem kleinen Knopf ✕ (Name für Bildschirmleser: `entfernenText`). */
function Gewaehlt({ p, entferne }: { p: MehrfachauswahlProps; entferne(id: string): void }) {
  if (!p.gewaehlt.length) return null;
  return (
    <ul className="gewaehlt" aria-label={p.name}>
      {p.gewaehlt.map((x) => (
        <li key={x.id}>
          <span className="gewaehlt-inhalt">{x.inhalt}</span>
          {x.zusatz}
          <span className="verweisaktionen">
            {x.aktionen}
            <Knopf groesse="klein" nurSymbol={x.entfernenText} onClick={() => entferne(x.id)}>
              <Symbol name="schliessen" />
            </Knopf>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Höchste Höhe der Vorschläge wie `.wahlliste` in gemeinsam-listen.css; was darüber hinausgeht, rollt in der Liste. */
const LISTE_HOECHSTENS = 280;

/** Die offene Vorschlagsliste unter bzw. über das Suchfeld legen (#1670), so breit wie das Feld. */
function legeVorschlaege(wahl: HTMLElement | null) {
  const liste = wahl?.querySelector<HTMLElement>(':scope > .wahlliste');
  if (!wahl || !liste) return;
  liste.style.width = `${wahl.getBoundingClientRect().width}px`;
  legeFest(liste, wahl, true, LISTE_HOECHSTENS);
}

/**
 * Lage der Vorschläge (#1670) nach der Regel der Menüs (`menue/lage.ts`): unter dem Suchfeld, wenn dort Platz ist,
 * sonst darüber; höchstens 280 px hoch und nie über den Fensterrand – der Rest rollt in der Liste. Neu bei jedem Aufbau
 * (andere Vorschläge, andere Höhe), bei jedem Rollen und jeder neuen Größe. Anders als beim Menü auch am Handy: Die
 * Liste gehört zum Suchfeld, ein Blatt von unten verdeckte es.
 */
function useVorschlagLage(an: boolean, wahl: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    if (an) legeVorschlaege(wahl.current);
  });
  useLayoutEffect(() => {
    if (!an) return;
    const setze = () => legeVorschlaege(wahl.current);
    addEventListener('resize', setze);
    document.addEventListener('scroll', setze, true);
    return () => {
      removeEventListener('resize', setze);
      document.removeEventListener('scroll', setze, true);
    };
  }, [an]); // eslint-disable-line react-hooks/exhaustive-deps -- der Ref ist fest
}

/** Nach ✕ den Fokus ins (dann leere) Suchfeld – ohne die Vorschläge gleich aufzuklappen. */
function useFokusNachEntfernen(eingabe: RefObject<HTMLInputElement | null>) {
  const [fokus, setFokus] = useState(false);
  const still = useRef(false);
  useEffect(() => {
    if (!fokus) return;
    setFokus(false);
    still.current = true;
    eingabe.current?.focus();
    still.current = false;
  }, [fokus, eingabe]);
  return { still, nachEntfernen: () => setFokus(true) };
}

/**
 * Baustein Mehrfachauswahl (#602, seit #1211 unter den Bausteinen): einen oder mehrere Einträge aus einer Liste wählen,
 * überall mit derselben Bedienung – in Verweisfeldern der Mappen (`MappenWahl`), bei den Mappentypen der Erweiterten
 * Suche (`TypWahl`) und in der Werkbank. Die Beschriftung setzt der Aufrufer (`Feld` mit `id`, sonst `eingabeLabel`).
 *
 * - Suchfeld als Combobox mit Vorschlagsliste; Klick oder Pfeil nach unten öffnet sie, Pfeiltasten wandern durch die
 *   Vorschläge und die Einträge zum Anlegen (#1288), Enter wählt den aktiven (sonst den ersten Vorschlag). Esc bei
 *   offener Liste schließt nur sie (#1311): Fokus und Eingabe bleiben, der Tastendruck geht nicht weiter an
 *   Speicherleiste oder Fenster; erst bei geschlossener Liste wirkt Esc wie überall.
 * - Ohne Treffer steht oben leise `leerText`; die Einträge zum Anlegen (`anlegen`) stehen immer zuletzt.
 * - Die gewählten Einträge stehen **unter** dem Suchfeld, je mit einem kleinen Knopf ✕. So bleibt das Suchfeld direkt
 *   unter der Beschriftung und auf einer Höhe mit Nachbarfeldern. Nach ✕ steht der Fokus im Suchfeld.
 * - Vorschläge mit `gruppe` (#1036, z. B. je Mappentyp) stehen unter einer Überschrift; die Liste nennt keine Anzahl.
 * - Die Vorschläge klappen wie die Menüs auf (#1670, `menue/lage.ts`): nach unten, wenn dort Platz ist, sonst nach oben;
 *   höchstens 280 px hoch und immer im Fenster, der Rest rollt in der Liste. Tastatur und Bildschirmleser wie gehabt.
 * - Das Suchfeld hat die Lupe wie der Baustein `Suche` (C16). ✕ ist leise, nicht rot: Das Feld ändert sich erst beim
 *   Speichern (Leitsatz 5).
 *
 * Eingabe und „offen“ hält der Aufrufer, weil er davon abhängig Vorschläge lädt oder filtert.
 * `vorschlaege === null` heißt: lädt noch.
 */
export function Mehrfachauswahl(p: MehrfachauswahlProps) {
  const { offen, setOffen, vorschlaege } = p;
  const listeId = useId();
  const eingabeRef = useRef<HTMLInputElement>(null);
  const wahlRef = useRef<HTMLDivElement>(null);
  useVorschlagLage(offen && !p.ohneSuche && !p.imFluss, wahlRef);
  const optionen: Option[] =
    vorschlaege === null
      ? []
      : [
          ...gruppiert(vorschlaege).flatMap((g) => g.eintraege.map((v) => ({ id: v.id, neu: false }))),
          ...(p.anlegen ?? []).map((v) => ({ id: v.id, neu: true })),
        ];
  const { aktiv, setAktiv, wandere, optionId } = useAktiv(offen ? optionen : [], listeId);
  const { still, nachEntfernen } = useFokusNachEntfernen(eingabeRef);
  const zu = () => {
    setOffen(false);
    setAktiv(-1);
    p.schliessen?.();
  };
  const nimm = (o: Option) => {
    setAktiv(-1);
    if (o.neu) {
      setOffen(false);
      p.legeAn?.(o.id);
    } else p.waehle(o.id);
  };
  function taste(e: KeyboardEvent<HTMLInputElement>) {
    // Esc (#1311): Ist die Liste offen, schließt es nur sie – Fokus und Eingabe bleiben, und der Tastendruck erreicht
    // weder die Speicherleiste („Verwerfen“) noch ein Fenster. Erst bei geschlossener Liste wirkt Esc wie überall.
    if (e.key === 'Escape') {
      if (offen && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        zu();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!offen) setOffen(true);
      else wandere(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const erster = optionen.find((o) => !o.neu);
      if (aktiv >= 0) nimm(optionen[aktiv]);
      else if (erster) nimm(erster);
    }
  }
  return (
    <div className={`refbox mehrfachauswahl${p.className ? ` ${p.className}` : ''}`}>
      {!p.ohneSuche && (
        <div
          ref={wahlRef}
          className="wahl"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) zu();
          }}>
          <Symbol name="suche" className={s.lupe} />
          <input
            ref={eingabeRef}
            id={p.id}
            className={s.eingabe}
            type="search"
            role="combobox"
            aria-expanded={offen}
            aria-controls={offen ? listeId : undefined}
            aria-activedescendant={offen && aktiv >= 0 ? optionId(aktiv) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            aria-label={p.eingabeLabel}
            placeholder={p.platzhalter}
            value={p.eingabe}
            onFocus={() => !still.current && setOffen(true)}
            onClick={() => setOffen(true)}
            onChange={(e) => {
              p.setEingabe(e.target.value);
              setAktiv(-1);
              setOffen(true);
            }}
            onKeyDown={taste}
          />
          {offen && <Liste p={p} listeId={listeId} aktiv={aktiv} optionId={optionId} nimm={nimm} />}
        </div>
      )}
      <Gewaehlt
        p={p}
        entferne={(id) => {
          p.entferne(id);
          nachEntfernen();
        }}
      />
      {p.darunter}
    </div>
  );
}
