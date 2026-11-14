import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import type { Hilfeort } from '../../../../shared/src/hilfe';
import { Hilfe } from '../../Hilfe';
import { Symbol, type SymbolName } from '../../Symbol';
import { t } from '../../sprache';
import s from './Feld.module.css';

/**
 * Feldrahmen (#967): umschließt genau ein Eingabeelement und setzt alles, was jedes Feld braucht – Beschriftung mit
 * `htmlFor`, Hilfesymbol an der Beschriftung, Hinweis, Fehlermeldung, `aria-invalid` und `aria-describedby`.
 * Reihen wie im Musterkatalog (#801, C4): Beschriftung, Eingabe, Fehler, Hinweis – der Fehler steht direkt unter der
 * Eingabe, wo der Blick ist; ein langer Hinweis schiebt ihn so nicht weg. Anleitung im Entwicklerhandbuch,
 * „Gestaltung und Bausteine → Feld“.
 *
 * Benannte Varianten statt Schalter: `Feld` (Beschriftung über der Eingabe), `HakenFeld` (ein Haken, Beschriftung
 * daneben) und `FeldGruppe` (mehrere Eingaben unter einer Beschriftung, als Gruppe).
 */

/** Was das Eingabeelement vom Rahmen bekommt. */
export interface FeldVerknuepfung {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** Ein Element (bekommt die Verknüpfung als Props) oder eine Funktion, die sie selbst weitergibt. */
export type FeldEingabe = ReactElement<Partial<FeldVerknuepfung>> | ((v: FeldVerknuepfung) => ReactNode);

interface Gemeinsam {
  /** Sichtbarer Name des Felds – kurz, ohne Doppelpunkt. */
  beschriftung: ReactNode;
  /** Ständige Erklärung unter der Eingabe; mehrere Einträge stehen untereinander. */
  hinweis?: ReactNode | ReactNode[];
  /** Was falsch ist und wie es richtig wird. Leer = kein Fehler. */
  fehler?: ReactNode;
  /** Stelle im Handbuch (shared/src/hilfe.ts): „?“ direkt hinter der Beschriftung. */
  hilfe?: Hilfeort;
  /** Kennzeichnet ein freiwilliges Feld mit „(optional)“. Pflicht ist der Normalfall und wird nicht markiert. */
  optional?: boolean;
  /**
   * Beschriftung nur für Screenreader (#1211): für Eingaben, deren Zweck die Umgebung schon zeigt – eine Zeile in einer
   * Tabelle, die Währung neben dem Betrag, ein Suchbegriff mit Lupe. Die Eingabe bleibt so benannt (`label`).
   */
  beschriftungVerbergen?: boolean;
  /** Rechts in der Kopfzeile, außerhalb der Beschriftung (gehört nicht zum Namen), z. B. die Art eines Verweises. */
  kopfZusatz?: ReactNode;
  /** Sprungziel für Rundgänge und Tests (`data-anker`). */
  anker?: string;
  className?: string;
}

export interface FeldProps extends Gemeinsam {
  /** Id der Eingabe; ohne Angabe die des Elements, sonst eine erzeugte. */
  id?: string;
  children: FeldEingabe;
}

/** Ids für Eingabe, Hinweis und Fehler und die Verknüpfung, die die Eingabe bekommt. */
function useVerknuepfung(vorgabe: string | undefined, { hinweis, fehler }: Pick<Gemeinsam, 'hinweis' | 'fehler'>, bisher?: string) {
  const basis = useId();
  const id = vorgabe ?? `${basis}e`;
  const hinweisId = `${id}-hinweis`;
  const fehlerId = `${id}-fehler`;
  const fehlerhaft = vorhanden(fehler);
  const beschrieben = [bisher, fehlerhaft ? fehlerId : null, hinweise(hinweis).length ? hinweisId : null].filter(Boolean).join(' ');
  const v: FeldVerknuepfung = { id, ...(beschrieben ? { 'aria-describedby': beschrieben } : {}), ...(fehlerhaft ? { 'aria-invalid': true } : {}) };
  return { v, hinweisId, fehlerId, fehlerhaft };
}

const vorhanden = (x: ReactNode) => x !== undefined && x !== null && x !== false && x !== '';
const hinweise = (h: Gemeinsam['hinweis']) => (Array.isArray(h) ? h : [h]).filter(vorhanden);

/** Die Eingabe mit der Verknüpfung versehen: Element klonen (eigene Props bleiben) oder die Funktion aufrufen. */
function verknuepfe(eingabe: FeldEingabe, v: FeldVerknuepfung): ReactNode {
  if (typeof eingabe === 'function') return eingabe(v);
  if (!isValidElement(eingabe)) return eingabe;
  const eigen = eingabe.props;
  return cloneElement(eingabe, { ...v, 'aria-invalid': v['aria-invalid'] ?? eigen['aria-invalid'] });
}

/**
 * Kopfzeile: Beschriftung samt „(optional)“, dahinter das Hilfesymbol – das „?“ steht immer an der Beschriftung (#801),
 * aber außerhalb von `<label>`, damit es nicht zum Namen der Eingabe gehört. Mit Hilfesymbol ist die Zeile am Handy
 * 44 px hoch (Tippfläche, #1027).
 */
function Kopf({ text, optional, hilfe, fuer, textId, className, verbergen, zusatz }: { text: ReactNode; optional?: boolean; hilfe?: Hilfeort; fuer?: string; textId?: string; className: string; verbergen?: boolean; zusatz?: ReactNode }) {
  const inhalt = <>{text}{optional && <span className={s.optional}> {t('oberflaeche.feld.optional')}</span>}</>;
  // Nur für Screenreader: ohne eigene Zeile, das „?“ und der Zusatz entfallen (die Umgebung erklärt die Eingabe).
  if (verbergen) return fuer ? <label htmlFor={fuer} className={s.sr}>{inhalt}</label> : <span id={textId} className={s.sr}>{inhalt}</span>;
  return (
    <div className={hilfe ? `${className} ${s.mitHilfe}` : className}>
      {fuer ? <label htmlFor={fuer} className={s.beschriftung}>{inhalt}</label> : <span id={textId} className={s.beschriftung}>{inhalt}</span>}
      {hilfe && <Hilfe ort={hilfe} />}
      {zusatz && <span className={s.kopfzusatz}>{zusatz}</span>}
    </div>
  );
}

/**
 * Fehler- und Hinweisreihe: erst der Fehler, dann der Hinweis – so wie sie auch vorgelesen werden (`aria-describedby`:
 * Fehler vor Hinweis). Der Fehlerbereich steht immer da (aria-live), damit eine neue Meldung angesagt wird.
 */
function Unterzeilen({ hinweis, fehler, hinweisId, fehlerId }: Pick<Gemeinsam, 'hinweis' | 'fehler'> & { hinweisId: string; fehlerId: string }) {
  const h = hinweise(hinweis);
  return (
    <>
      <p id={fehlerId} className={s.fehler} aria-live="polite">
        {vorhanden(fehler) && <><Symbol name="warnung" className={s.fehlersymbol} />{fehler}</>}
      </p>
      {h.length > 0 && <div id={hinweisId} className={s.hinweis}>{h.map((x, i) => <span key={i}>{x}</span>)}</div>}
    </>
  );
}

const klassen = (...k: Array<string | false | undefined>) => k.filter(Boolean).join(' ');
const eigeneId = (e: FeldEingabe) => (typeof e !== 'function' && isValidElement(e) ? e.props.id : undefined);
const eigeneBeschreibung = (e: FeldEingabe) => (typeof e !== 'function' && isValidElement(e) ? e.props['aria-describedby'] : undefined);

/** Ein Feld: Beschriftung über der Eingabe (Text, Zahl, Datum, Auswahlliste, mehrzeilig …). */
export function Feld({ beschriftung, hinweis, fehler, hilfe, optional, beschriftungVerbergen, kopfZusatz, anker, id, className, children }: FeldProps) {
  const { v, hinweisId, fehlerId, fehlerhaft } = useVerknuepfung(id ?? eigeneId(children), { hinweis, fehler }, eigeneBeschreibung(children));
  return (
    <div className={klassen(s.feld, fehlerhaft && s.fehlerhaft, className)} data-anker={anker}>
      <Kopf text={beschriftung} optional={optional} hilfe={hilfe} fuer={v.id} className={s.kopf} verbergen={beschriftungVerbergen} zusatz={kopfZusatz} />
      {verknuepfe(children, v)}
      <Unterzeilen hinweis={hinweis} fehler={fehler} hinweisId={hinweisId} fehlerId={fehlerId} />
    </div>
  );
}

/**
 * Ein Haken (Checkbox): steht in der Eingabezeile, die Beschriftung direkt daneben, das „?“ an der Beschriftung, die
 * Beschreibung in der Hinweiszeile (#801). Die Eingabe ist ein `<input type="checkbox">`.
 */
export function HakenFeld({ beschriftung, hinweis, fehler, hilfe, optional, anker, id, className, children }: FeldProps) {
  const { v, hinweisId, fehlerId, fehlerhaft } = useVerknuepfung(id ?? eigeneId(children), { hinweis, fehler }, eigeneBeschreibung(children));
  return (
    <div className={klassen(s.feld, s.haken, fehlerhaft && s.fehlerhaft, className)} data-anker={anker}>
      <div className={s.hakenzeile}>
        {verknuepfe(children, v)}
        <Kopf text={beschriftung} optional={optional} hilfe={hilfe} fuer={v.id} className={s.hakentext} />
      </div>
      <Unterzeilen hinweis={hinweis} fehler={fehler} hinweisId={hinweisId} fehlerId={fehlerId} />
    </div>
  );
}

export interface FeldGruppeProps extends Gemeinsam {
  /** Mehrere Eingaben, jede mit eigener Beschriftung (z. B. Haken mit `<label className="haken">`). */
  children: ReactNode;
}

/**
 * Mehrere Eingaben unter einer Beschriftung (Haken einer Mehrfachauswahl, Optionsknöpfe): eine Gruppe
 * (`role="group"`), benannt durch die Beschriftung. Hinweis und Fehler hängen an der Gruppe; `aria-invalid` gibt es für
 * Gruppen nicht, der Fehler steht im Text.
 */
export function FeldGruppe({ beschriftung, hinweis, fehler, hilfe, optional, beschriftungVerbergen, kopfZusatz, anker, className, children }: FeldGruppeProps) {
  const { v, hinweisId, fehlerId, fehlerhaft } = useVerknuepfung(undefined, { hinweis, fehler });
  const textId = `${v.id}-beschriftung`;
  return (
    <div role="group" aria-labelledby={textId} aria-describedby={v['aria-describedby']} className={klassen(s.feld, fehlerhaft && s.fehlerhaft, className)} data-anker={anker}>
      <Kopf text={beschriftung} optional={optional} hilfe={hilfe} textId={textId} className={s.kopf} verbergen={beschriftungVerbergen} zusatz={kopfZusatz} />
      <div className={s.gruppeninhalt}>{children}</div>
      <Unterzeilen hinweis={hinweis} fehler={fehler} hinweisId={hinweisId} fehlerId={fehlerId} />
    </div>
  );
}

export interface NurLesenFeldProps {
  /** Sichtbarer Name des Felds. */
  beschriftung: ReactNode;
  /** Der Wert, wie er angezeigt wird (Text, Liste, Link …); leer = „–“. */
  children?: ReactNode;
  /**
   * Woher der Wert kommt bzw. warum er sich hier nicht ändern lässt, z. B. „berechnet von Verträge“ (#1034) oder
   * „setzt sich zusammen aus Bereich, Zeitraum“ (#1050). Steht mit Symbol in der Hinweiszeile und wird mit vorgelesen.
   */
  herkunft?: ReactNode;
  /** Symbol vor der Herkunft; Standard: ein Schloss. */
  symbol?: SymbolName;
  /** Stelle im Handbuch: „?“ an der Beschriftung. */
  hilfe?: Hilfeort;
  /** Ganze Zeile (lange Texte). */
  breit?: boolean;
  className?: string;
  /** Anker für Tipps, Rundgänge und Tests (`data-anker`). */
  anker?: string;
  /** Unter der Herkunft, z. B. eine Übersetzung des Werts (#732). */
  unter?: ReactNode;
}

/**
 * Nur lesen (#1034, Hinweis Qualität): ein Aussehen für alles, was sich hier nicht ändern lässt – berechnete Felder,
 * zusammengesetzte (#1050), geschützte und Felder ohne Recht zum Bearbeiten. Der Wert steht gut lesbar in einem Rahmen
 * wie eine Eingabe mit `readonly` (gestrichelt, eingesenkt), darunter die Herkunft mit Symbol. Keine Eingabe, nichts zum
 * Anklicken außer Links im Wert selbst; die Gruppe ist nach der Beschriftung benannt und beschreibt sich mit der Herkunft.
 */
export function NurLesenFeld({ beschriftung, children, herkunft, symbol = 'schloss', hilfe, breit, className, anker, unter }: NurLesenFeldProps) {
  const basis = useId();
  const textId = `${basis}-beschriftung`;
  const hinweisId = `${basis}-hinweis`;
  const leer = !vorhanden(children as ReactNode);
  return (
    <div role="group" aria-labelledby={textId} aria-describedby={vorhanden(herkunft) ? hinweisId : undefined} data-anker={anker}
      className={klassen(s.feld, breit && s.breit, className)}>
      <Kopf text={beschriftung} hilfe={hilfe} textId={textId} className={s.kopf} />
      <div className={klassen(s.wert, leer && s.leer)}>{leer ? '–' : children}</div>
      {vorhanden(herkunft) && <p id={hinweisId} className={s.herkunft}><Symbol name={symbol} className={s.herkunftsymbol} /><span>{herkunft}</span></p>}
      {unter}
    </div>
  );
}
