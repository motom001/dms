import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { geheZu } from '../../ort';
import { Symbol } from '../../Symbol';
import { t } from '../../sprache';
import s from './Knopf.module.css';

/**
 * Baustein Knopf (#968): feste Arten, gleiche Zustände, `aria` eingebaut. Anleitung im Entwicklerhandbuch,
 * „Gestaltung und Bausteine → Knopf“.
 *
 * - Arten: `anlegen` (grün, „+ Neu“ oben rechts in einer Liste, #989), `haupt` (die Haupthandlung eines Formulars),
 *   `neben` (alles Übrige), `gefahr` (Löschen und Ähnliches), `link` (sieht aus wie ein Verweis – nur für Wege,
 *   z. B. „Zurück“, „Abbrechen“, „Zur Liste“).
 * - Zustände: gesperrt (mit sichtbarem Grund), „läuft“ (`aria-busy`, kein zweiter Klick, Breite bleibt), Ergebnis.
 * - Asynchrone Handler (#1011): `onClick` darf ein Promise liefern. Solange es läuft, zeigt der Knopf „läuft“;
 *   ein Fehler wird abgefangen und direkt am Knopf angezeigt, statt in der Konsole zu verschwinden. Liefert das Promise
 *   ein `KnopfErgebnis`, steht es ebenso am Knopf (#986, Muster B2: Ergebnis an der Stelle des Knopfs, nichts springt).
 *
 * Benannte Varianten statt Schalter: `Knopf` (ein `<button>`) und `KnopfLink` (ein Weg innerhalb von Ablago, der wie
 * ein Knopf aussieht, z. B. „+ Neu“ → `/…/neu`). Für `<summary>` und fremde Elemente gibt `knopfAussehen()` Klassen und
 * Datenattribut.
 */

export type KnopfArt = 'anlegen' | 'haupt' | 'neben' | 'gefahr' | 'link';
export type KnopfGroesse = 'normal' | 'klein';

/** Ergebnis einer Handlung, angezeigt direkt am Knopf – im Stil der Hinweise (B1/B6): ruhig, Ursache und Ausweg. */
export interface KnopfErgebnis {
  art: 'gut' | 'info' | 'warn' | 'schlecht';
  text: ReactNode;
}

const KLASSEN: Record<KnopfArt, string> = { anlegen: 'knopf gruen', haupt: 'knopf primaer', neben: 'knopf', gefahr: 'knopf gefahr', link: 'textknopf' };

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/**
 * Aussehen eines Knopfs für Elemente, die kein `<button>` sind (z. B. `<summary>` einer Aufklappform): Klassen und
 * `data-knopf`. Die Rauchtests erkennen Anlege-Knöpfe an `data-knopf="anlegen"`.
 */
export function knopfAussehen({ art = 'neben', groesse = 'normal', className }: { art?: KnopfArt; groesse?: KnopfGroesse; className?: string } = {}) {
  return { className: klassen(KLASSEN[art], groesse === 'klein' && 'klein', s.baustein, className), 'data-knopf': art };
}

/** Ist das ein KnopfErgebnis? (Ein Handler darf auch anderes liefern, etwa `true` – das zeigt der Knopf nicht an.) */
export function istKnopfErgebnis(x: unknown): x is KnopfErgebnis {
  return !!x && typeof x === 'object' && 'art' in x && 'text' in x && ['gut', 'info', 'warn', 'schlecht'].includes(String((x as KnopfErgebnis).art));
}

/** Text eines abgefangenen Fehlers – wie die übrigen Meldungen der Oberfläche (die API liefert lesbare Texte). */
export function fehlerText(x: unknown): string {
  if (x instanceof Error && x.message) return x.message;
  if (typeof x === 'string' && x) return x;
  return t('oberflaeche.knopf.fehler');
}

const SYMBOL = { gut: 'haken', info: 'info', warn: 'warnung', schlecht: 'warnung' } as const;

/** Liegt das Element nicht ganz im sichtbaren Bereich, sanft hinrollen – bei „Bewegung reduzieren“ ohne Animation. */
function insBild(el: HTMLElement | null) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight)) return;
  const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'nearest', behavior: ruhig ? 'auto' : 'smooth' });
}

/**
 * Ergebnisbereich am Knopf: steht immer im Dokument (leer, ohne Platz), damit Screenreader ein neues Ergebnis ansagen
 * (`role="status"`, `aria-live="polite"`). In einer Knopfreihe (`.knoepfe`) steht es unter allen Knöpfen der Reihe,
 * sonst direkt unter dem Knopf.
 */
export function Ergebnis({ wert, id, className }: { wert?: KnopfErgebnis | null; id?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (wert) insBild(ref.current); }, [wert]);
  return (
    <span ref={ref} id={id} role="status" aria-live="polite" data-ergebnis={wert?.art} className={klassen(s.ergebnis, wert && s[wert.art], className)}>
      {wert && <><Symbol name={SYMBOL[wert.art]} className={s.ergebnissymbol} /><span>{wert.text}</span></>}
    </span>
  );
}

/**
 * Ausführliches Ergebnis unter einem Knopf, das kein einzelner Satz ist (z. B. eine Prüfliste oder Text mit
 * Einzelheiten): steht immer im Dokument (`aria-live`), rollt sanft ins Bild, wenn sich `anlass` ändert und es nicht
 * ganz zu sehen ist. Für einfache Ergebnisse genügt der Knopf selbst (Rückgabe `KnopfErgebnis`).
 */
export function ErgebnisBlock({ anlass, className, children }: { anlass: unknown; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (anlass) insBild(ref.current); }, [anlass]);
  return <div ref={ref} aria-live="polite" className={klassen(s.block, className)}>{children}</div>;
}

type Grundlage = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'aria-label'>;

export interface KnopfProps extends Grundlage {
  /** Art des Knopfs; Vorgabe `neben`. */
  art?: KnopfArt;
  groesse?: KnopfGroesse;
  /** Beschriftung. Bei `nurSymbol` das Symbol. */
  children: ReactNode;
  /**
   * Gesperrt: `true` ohne Grund (der Grund steht ohnehin daneben), oder der Grund als Text – dann bleibt der Knopf
   * mit der Tastatur erreichbar (`aria-disabled`), und der Grund steht sichtbar darunter (`aria-describedby`).
   */
  gesperrt?: boolean | string;
  /** „läuft“ von außen (z. B. ein Auftrag im Hintergrund oder ein Formular, das gerade sendet). */
  laeuft?: boolean;
  /** Text während „läuft“; Vorgabe „Läuft …“. */
  laeuftText?: string;
  /** Ergebnis von außen (z. B. wenn ein Auftrag im Hintergrund fertig ist). Ein Klick blendet es aus. */
  ergebnis?: KnopfErgebnis | null;
  /** Knopf nur mit Symbol: Pflicht ist dann eine Beschriftung für Screenreader (und als Tooltip). */
  nurSymbol?: string;
  /** Darf ein Promise liefern: „läuft“, Fehler und Ergebnis zeigt der Knopf (siehe oben). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

/**
 * Der Klick samt asynchronem Handler: „läuft“ solange das Promise offen ist, kein zweiter Klick, Fehler und Ergebnis
 * gemerkt. Ein Ergebnis von außen (`ergebnis`) zeigt sich, bis der nächste Klick es ausblendet.
 */
function useHandlung(onClick: KnopfProps['onClick'], zu: boolean, ergebnis: KnopfErgebnis | null | undefined) {
  const [laeuft, setLaeuft] = useState(false);
  const [eigen, setEigen] = useState<KnopfErgebnis | null>(null);
  const [ausgeblendet, setAusgeblendet] = useState(false);
  const sperre = useRef(false);
  // Ein neues Ergebnis von außen zeigt sich wieder, auch wenn ein Klick das vorige ausgeblendet hat.
  useEffect(() => { setAusgeblendet(false); }, [ergebnis]);

  async function klick(e: MouseEvent<HTMLButtonElement>) {
    // Gesperrt oder läuft: nichts tun – auch kein Absenden eines Formulars (Enter in einem Feld klickt den Knopf).
    if (zu || sperre.current) { e.preventDefault(); return; }
    if (!onClick) return;
    setEigen(null);
    setAusgeblendet(true);
    const r = onClick(e);
    if (!r || typeof (r as Promise<unknown>).then !== 'function') return;
    sperre.current = true;
    setLaeuft(true);
    try {
      const wert = await r;
      if (istKnopfErgebnis(wert)) setEigen(wert);
    } catch (x) {
      setEigen({ art: 'schlecht', text: fehlerText(x) });
    } finally {
      sperre.current = false;
      setLaeuft(false);
    }
  }
  const zeigen = eigen ?? (ausgeblendet ? null : ergebnis ?? null);
  return { laeuft, zeigen, klick };
}

/** Über der unsichtbar stehenden Beschriftung: Kreisel und „Läuft …“ (bei nur Symbol nur der Kreisel). */
function Laeuft({ text, nurSymbol }: { text?: string; nurSymbol: boolean }) {
  return (
    <span className={s.laeuft} aria-hidden="true">
      <span className={s.kreisel} />
      {!nurSymbol && <span className={s.laeufttext}>{text ?? t('oberflaeche.knopf.laeuft')}</span>}
    </span>
  );
}

/** Zustände und Verknüpfungen am `<button>`: gesperrt, läuft, Name bei nur Symbol, Grund und Ergebnis. */
function zustandsAttribute({ gesperrt, busy, grund, nurSymbol, title, beschrieben }: { gesperrt: KnopfProps['gesperrt']; busy: boolean; grund: string | null; nurSymbol?: string; title?: string; beschrieben?: string }) {
  return {
    // Gesperrt ohne Grund: disabled – außer während der Knopf selbst läuft (sonst verlöre er den Tastaturfokus).
    disabled: gesperrt === true && !busy,
    'aria-disabled': busy || !!grund || undefined,
    'aria-busy': busy || undefined,
    'aria-label': nurSymbol,
    title: title ?? nurSymbol,
    'aria-describedby': beschrieben || undefined,
  };
}

export function Knopf({ art, groesse, children, gesperrt, laeuft, laeuftText, ergebnis, nurSymbol, onClick, type = 'button', className, title, ...rest }: KnopfProps) {
  const basis = useId();
  const grund = typeof gesperrt === 'string' && gesperrt ? gesperrt : null;
  const h = useHandlung(onClick, !!laeuft || !!grund, ergebnis);
  const busy = !!laeuft || h.laeuft;
  const grundId = `${basis}g`;
  const ergebnisId = `${basis}e`;
  const beschrieben = klassen(rest['aria-describedby'], grund && grundId, h.zeigen && ergebnisId);

  return (
    <>
      <button
        {...rest}
        type={type}
        {...knopfAussehen({ art, groesse, className: klassen(nurSymbol && s.symbol, className) })}
        {...zustandsAttribute({ gesperrt, busy, grund, nurSymbol, title, beschrieben })}
        onClick={(e) => void h.klick(e)}
      >
        <span className={s.stapel}>
          <span className={s.text}>{children}</span>
          {busy && <Laeuft text={laeuftText} nurSymbol={!!nurSymbol} />}
        </span>
      </button>
      {grund && <span id={grundId} className={s.grund}>{grund}</span>}
      {(!!onClick || ergebnis !== undefined) && <Ergebnis wert={h.zeigen} id={ergebnisId} />}
    </>
  );
}

export interface KnopfLinkProps {
  /** Ziel innerhalb von Ablago, z. B. `/werkbank/benutzer/neu`. */
  to: string;
  art?: Exclude<KnopfArt, 'link'>;
  groesse?: KnopfGroesse;
  className?: string;
  title?: string;
  /** Sprungziel für Rundgänge und Tests (`data-anker`), wie bei `Link`. */
  anker?: string;
  children: ReactNode;
}

/** Ein Weg innerhalb von Ablago, der wie ein Knopf aussieht – z. B. „+ Neu“, das die Seite zum Anlegen öffnet. */
export function KnopfLink({ to, art = 'neben', groesse = 'normal', className, title, anker, children }: KnopfLinkProps) {
  const klick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    geheZu(to);
  };
  return <a href={to} onClick={klick} title={title} data-anker={anker} {...knopfAussehen({ art, groesse, className })}>{children}</a>;
}
