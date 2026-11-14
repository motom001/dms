import { useId, type ReactNode } from 'react';
import { t } from '../../sprache';
import { Symbol } from '../../Symbol';
import { Knopf } from '../knopf/Knopf';
import s from './Mehrfachauswahl.module.css';

/** Ein gewählter Eintrag: Inhalt (Text oder Link), optional ein Zusatz (z. B. ein Hinweis) und weitere Aktionen vor „Entfernen“. */
export interface GewaehlterEintrag { id: string; inhalt: ReactNode; zusatz?: ReactNode; aktionen?: ReactNode; entfernenText: string }
/** Ein Vorschlag; mit `gruppe` (#1036) stehen Vorschläge derselben Gruppe unter einer Überschrift, in der Reihenfolge ihres ersten Auftretens. */
export interface Vorschlag { id: string; text: ReactNode; gruppe?: string }

/** Vorschläge nach Gruppe, in der Reihenfolge ihres ersten Auftretens; ohne Gruppen eine einzige ohne Namen. */
function gruppiert(v: Vorschlag[]): Array<{ name: string | null; eintraege: Vorschlag[] }> {
  if (!v.some((x) => x.gruppe)) return [{ name: null, eintraege: v }];
  const aus = new Map<string, Vorschlag[]>();
  for (const x of v) { const g = x.gruppe ?? ''; aus.set(g, [...(aus.get(g) ?? []), x]); }
  return [...aus].map(([name, eintraege]) => ({ name: name || null, eintraege }));
}

/**
 * Baustein Mehrfachauswahl (#602, seit #1211 unter den Bausteinen): mehrere Einträge aus einer Liste wählen, überall mit
 * derselben Bedienung – in Verweisfeldern der Mappen (`MappenWahl`), bei den Mappentypen der Erweiterten Suche
 * (`TypWahl`) und in der Werkbank. Die Beschriftung setzt der Aufrufer (`Feld` mit `id`, sonst `eingabeLabel`).
 *
 * - Suchfeld als Combobox mit Vorschlagsliste; Enter übernimmt den ersten Vorschlag, Escape schließt die Liste,
 *   Klick oder Pfeil nach unten öffnet sie wieder.
 * - Die gewählten Einträge stehen **unter** dem Suchfeld, je mit „Entfernen“. So bleibt das Suchfeld direkt unter
 *   der Beschriftung und auf einer Höhe mit Nachbarfeldern; die Auswahl schiebt nur, was darunter kommt.
 * - Vorschläge mit `gruppe` (#1036, z. B. je Mappentyp) stehen unter einer Überschrift; die Liste nennt keine Anzahl.
 *   Enter nimmt weiter den ersten Vorschlag.
 * - Das Suchfeld hat die Lupe wie der Baustein `Suche` (C16). „Entfernen“ ist ein leiser Knopf, nicht rot: Das Feld
 *   ändert sich erst beim Speichern (Leitsatz 5).
 *
 * Eingabe und „offen“ hält der Aufrufer, weil er davon abhängig Vorschläge lädt oder filtert.
 * `vorschlaege === null` heißt: lädt noch.
 */
export function Mehrfachauswahl({ id, name, platzhalter, eingabeLabel, eingabe, setEingabe, offen, setOffen, schliessen, vorschlaege, leerText, fuss, waehle, gewaehlt, entferne, ohneSuche, darunter, className }: {
  /** id des Suchfelds (für ein <label htmlFor>). */
  id?: string;
  /** Name der Liste der gewählten Einträge und der Vorschlagsliste (für Screenreader). */
  name: string;
  platzhalter: string;
  /** Beschriftung des Suchfelds, wenn kein <label> darauf zeigt. */
  eingabeLabel?: string;
  eingabe: string; setEingabe(v: string): void;
  offen: boolean; setOffen(v: boolean): void;
  /** Zusätzlich beim Schließen (Escape, Fokus verlässt das Feld). */
  schliessen?: () => void;
  vorschlaege: Vorschlag[] | null;
  leerText: string;
  /** Unter den Vorschlägen, z. B. „… insgesamt – tippe, um einzugrenzen“. */
  fuss?: ReactNode;
  waehle(id: string): void;
  gewaehlt: GewaehlterEintrag[];
  entferne(id: string): void;
  /** Suchfeld ausblenden (Einzelwahl mit gesetztem Wert). */
  ohneSuche?: boolean;
  /** Unter der Auswahl, z. B. „+ … anlegen“. */
  darunter?: ReactNode;
  className?: string;
}) {
  const listeId = useId();
  const zu = () => { setOffen(false); schliessen?.(); };
  return (
    <div className={`refbox mehrfachauswahl${className ? ` ${className}` : ''}`}>
      {!ohneSuche && (
        <div className="wahl" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) zu(); }}>
          <Symbol name="suche" className={s.lupe} />
          <input id={id} className={s.eingabe} type="search" role="combobox" aria-expanded={offen} aria-controls={offen ? listeId : undefined} aria-autocomplete="list" autoComplete="off"
            aria-label={eingabeLabel} placeholder={platzhalter} value={eingabe}
            onFocus={() => setOffen(true)} onClick={() => setOffen(true)} onChange={(e) => { setEingabe(e.target.value); setOffen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') zu();
              if (e.key === 'ArrowDown' && !offen) { e.preventDefault(); setOffen(true); }
              if (e.key === 'Enter') { e.preventDefault(); if (vorschlaege?.[0]) waehle(vorschlaege[0].id); }
            }} />
          {offen && (
            <div id={listeId} className="wahlliste" role="listbox" aria-label={name}>
              {vorschlaege === null ? <p className="leise klein">{t('felder.auswahl.lade')}</p>
                : !vorschlaege.length ? <p className="leise klein">{leerText}</p>
                : <>
                    {gruppiert(vorschlaege).map((g, i) => {
                      const knoepfe = g.eintraege.map((v) => <button key={v.id} type="button" role="option" aria-selected={false} onClick={() => waehle(v.id)}>{v.text}</button>);
                      return g.name === null ? <span key={i} className="wahlgruppe-ohne">{knoepfe}</span>
                        : <div key={i} role="group" aria-label={g.name} className="wahlgruppe"><p className="wahlgruppe-titel" aria-hidden="true">{g.name}</p>{knoepfe}</div>;
                    })}
                    {fuss}
                  </>}
            </div>
          )}
        </div>
      )}
      {gewaehlt.length > 0 && (
        <ul className="gewaehlt" aria-label={name}>
          {gewaehlt.map((x) => (
            <li key={x.id}>
              <span className="gewaehlt-inhalt">{x.inhalt}</span>
              {x.zusatz}
              <span className="verweisaktionen">
                {x.aktionen}
                <Knopf art="link" groesse="klein" aria-label={x.entfernenText} title={x.entfernenText} onClick={() => entferne(x.id)}>{t('felder.auswahl.entfernen')}</Knopf>
              </span>
            </li>
          ))}
        </ul>
      )}
      {darunter}
    </div>
  );
}
