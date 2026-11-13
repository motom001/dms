import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { geheZu } from '../../ort';
import { Symbol, type SymbolName } from '../../Symbol';
import { t } from '../../sprache';
import s from './Knopf.module.css';
import { hinweis, rueckfrage as stelleRueckfrage, type Rueckfrage } from '../../rueckfrage';
import { Erklaerung, type KnopfSperre } from './Erklaerung';

export type { KnopfSperre } from './Erklaerung';

/**
 * Baustein Knopf (#968, nachgeschärft #1210): feste Arten, gleiche Zustände, `aria` eingebaut. Anleitung im
 * Entwicklerhandbuch, „Gestaltung und Bausteine → Knopf“; die Leitsätze dort unter „Leitsätze“.
 *
 * - Arten: `haupt` (blau – Speichern, Anlegen nach dem Ausfüllen, Weiter, Übernehmen; höchstens einer je Bereich),
 *   `anlegen` (grün, nur „etwas Neues anfangen“: die Beschriftung beginnt mit „+“), `neben` (Rand – alles Übrige, auch
 *   „Verwerfen“), `gefahr` (wie `neben` mit Pflicht-Symbol, Schrift und Rand erst bei Hover und Fokus rot; stellt
 *   seine Rückfrage selbst), `link` (sieht aus wie ein Verweis – nur für Wege, z. B. „Zurück“, „Zur Liste“).
 * - Gesperrt in zwei Formen (Leitsatz 6): `gesperrt` (true) = blass, nichts zu tun; `gesperrt` mit Grund (Text oder
 *   `KnopfSperre`) = gestrichelt mit Schloss und ⓘ, bleibt erreichbar, Klick öffnet die Erklärung am Knopf.
 * - „läuft“ (`aria-busy`, kein zweiter Klick, Breite bleibt), Ergebnis am Knopf.
 * - Asynchrone Handler (#1011): `onClick` darf ein Promise liefern. Solange es läuft, zeigt der Knopf „läuft“;
 *   ein Fehler wird abgefangen und direkt am Knopf angezeigt, statt in der Konsole zu verschwinden. Liefert das Promise
 *   ein `KnopfErgebnis`, steht es ebenso am Knopf (#986, Muster B2: Ergebnis an der Stelle des Knopfs, nichts springt).
 *
 * Benannte Varianten statt Schalter: `Knopf` (ein `<button>`) und `KnopfLink` (ein Weg innerhalb von Ablago, der wie
 * ein Knopf aussieht, z. B. „+ Neu“ → `/…/neu`). Für `<summary>` und fremde Elemente gibt `knopfAussehen()` Klassen und
 * Datenattribut. Den rot gefüllten Bestätigungsknopf gibt es nur in der Rückfrage (`BestaetigenKnopf`, nicht in
 * index.ts).
 */

export type KnopfArt = 'anlegen' | 'haupt' | 'neben' | 'gefahr' | 'link';
export type KnopfGroesse = 'normal' | 'klein';
/** Aussehen samt dem Bestätigungsknopf der Rückfrage (`entscheidung`, rot gefüllt – nur dort). */
type Aussehen = KnopfArt | 'entscheidung';

/** Ergebnis einer Handlung, angezeigt direkt am Knopf – im Stil der Hinweise (B1/B6): ruhig, Ursache und Ausweg. */
export interface KnopfErgebnis {
  art: 'gut' | 'info' | 'warn' | 'schlecht';
  text: ReactNode;
}

/** Rückfrage eines Gefahr-Knopfs (Leitsatz 5): Titel als Frage, Folgen, Verb auf dem Bestätigungsknopf. */
export type GefahrRueckfrage = Omit<Rueckfrage, 'gefahr'>;

/**
 * Gesperrt: `true` = nichts zu tun (blass, ohne Erklärung); ein Grund (Text oder `KnopfSperre`) = gesperrt aus einem
 * Grund (gestrichelt, Schloss, ⓘ, Erklärung am Knopf). `false`, `''`, `null` = nicht gesperrt.
 */
export type KnopfGesperrt = boolean | string | KnopfSperre | null | undefined;

// Gefahr sieht auf der Seite aus wie Neben (Leitsatz 4); rot gefüllt nur die Entscheidung in der Rückfrage.
const KLASSEN: Record<Aussehen, string> = { anlegen: 'knopf gruen', haupt: 'knopf primaer', neben: 'knopf', gefahr: 'knopf', entscheidung: 'knopf gefahr', link: 'textknopf' };

const klassen = (...k: Array<string | false | undefined | null>) => k.filter(Boolean).join(' ');

/**
 * Aussehen eines Knopfs für Elemente, die kein `<button>` sind (z. B. `<summary>` einer Aufklappform): Klassen und
 * `data-knopf`. Die Rauchtests erkennen Anlege-Knöpfe an `data-knopf="anlegen"`.
 */
export function knopfAussehen({ art = 'neben', groesse = 'normal', className }: { art?: Exclude<KnopfArt, 'gefahr'>; groesse?: KnopfGroesse; className?: string } = {}) {
  return aussehen(art, groesse, className);
}

/** Klassen und `data-knopf` für jedes Aussehen (auch Gefahr und Entscheidung, die nur der Baustein selbst setzt). */
function aussehen(art: Aussehen, groesse: KnopfGroesse = 'normal', className?: string) {
  return { className: klassen(KLASSEN[art], groesse === 'klein' && 'klein', s.baustein, className), 'data-knopf': art };
}

/** Grund einer Sperre, sonst null (`true` ist „nichts zu tun“ und hat keinen Grund). */
export function sperreAus(g: KnopfGesperrt): KnopfSperre | null {
  if (typeof g === 'string') return g ? { grund: g } : null;
  return g && typeof g === 'object' ? g : null;
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

/**
 * Asynchroner Ereignis-Handler ohne Knopf (#1011) – für `onSubmit`, `onChange`, Ereignisse am Fenster und Ähnliches:
 * React bekommt kein Promise zurück, und ein Fehler geht an `zeige` (die Meldung, die die Seite ohnehin hat, z. B.
 * `setFehler` oder `text => setMeldung({ art: 'schlecht', text })`), statt still in der Konsole zu landen. Hat die
 * Stelle keine eigene Meldung, kommt der Fehler als Hinweisfenster (`hinweis`). Der Handler läuft sofort an –
 * `e.preventDefault()` am Anfang wirkt also wie gewohnt. Für Knöpfe den Baustein `Knopf` nehmen: Der zeigt „läuft“ und
 * den Fehler selbst am Knopf.
 */
export function abfangen<A extends unknown[]>(fn: (...a: A) => Promise<unknown> | void, zeige: (text: string) => void = alsHinweis): (...a: A) => void {
  return (...a: A) => {
    try {
      const r = fn(...a);
      if (r) r.then(undefined, (x: unknown) => zeige(fehlerText(x)));
    } catch (x) {
      zeige(fehlerText(x));
    }
  };
}

/** Fehler ohne eigene Meldung an der Stelle: als Hinweisfenster, wie andere Rückmeldungen ohne festen Platz. */
function alsHinweis(text: string) {
  void hinweis({ titel: t('oberflaeche.knopf.fehler'), text });
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
 * Ein neues Ergebnis ins Bild holen – nur, wenn es sich nach dem ersten Zeichnen ändert. Ein Ergebnis, das beim Öffnen
 * der Seite schon dasteht (von außen, z. B. ein fertiger Auftrag), ist nichts Neues: Sonst rollte die Seite gleich nach
 * dem Laden von selbst dorthin – auf der Musterseite sanft bis zum Bereich „Knopf“, mitten in die Messung der
 * Rauchtests (#1027).
 */
function useInsBild(ref: { current: HTMLElement | null }, anlass: unknown) {
  // Der Wert beim ersten Zeichnen (auch beim doppelten Effekt im StrictMode der Entwicklung): kein Anlass zum Rollen.
  const vorher = useRef(anlass);
  useEffect(() => {
    if (anlass && anlass !== vorher.current) insBild(ref.current);
    vorher.current = anlass;
  }, [anlass, ref]);
}

/**
 * Ergebnisbereich am Knopf: steht immer im Dokument (leer, ohne Platz), damit Screenreader ein neues Ergebnis ansagen
 * (`role="status"`, `aria-live="polite"`). In einer Knopfreihe (`.knoepfe`) steht es unter allen Knöpfen der Reihe,
 * sonst direkt unter dem Knopf.
 */
export function Ergebnis({ wert, id, className }: { wert?: KnopfErgebnis | null; id?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useInsBild(ref, wert);
  return (
    <span ref={ref} id={id} role="status" aria-live="polite" data-ergebnis={wert?.art} className={klassen(s.ergebnis, wert && s[wert.art], className)}>
      {wert && <><Symbol name={SYMBOL[wert.art]} className={s.ergebnissymbol} /><span>{wert.text}</span></>}
    </span>
  );
}

/**
 * Ausführliches Ergebnis unter einem Knopf, das kein einzelner Satz ist (z. B. eine Prüfliste oder Text mit
 * Einzelheiten): steht immer im Dokument (`aria-live`), rollt sanft ins Bild, wenn sich `anlass` ändert und es nicht
 * ganz zu sehen ist (nicht schon beim ersten Zeichnen). Für einfache Ergebnisse genügt der Knopf selbst (Rückgabe `KnopfErgebnis`).
 */
export function ErgebnisBlock({ anlass, className, children }: { anlass: unknown; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useInsBild(ref, anlass);
  return <div ref={ref} aria-live="polite" className={klassen(s.block, className)}>{children}</div>;
}

type Grundlage = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled' | 'children' | 'aria-label'>;

interface KnopfBasis extends Grundlage {
  groesse?: KnopfGroesse;
  /** Beschriftung. Bei `nurSymbol` das Symbol. */
  children: ReactNode;
  /** Gesperrt in zwei Formen (Leitsatz 6), siehe `KnopfGesperrt`. */
  gesperrt?: KnopfGesperrt;
  /** „läuft“ von außen (z. B. ein Auftrag im Hintergrund oder ein Formular, das gerade sendet). */
  laeuft?: boolean;
  /** Text während „läuft“; Vorgabe „Läuft …“. */
  laeuftText?: string;
  /** Ergebnis von außen (z. B. wenn ein Auftrag im Hintergrund fertig ist). Ein Klick blendet es aus. */
  ergebnis?: KnopfErgebnis | null;
  /** Knopf nur mit Symbol: Pflicht ist dann eine Beschriftung für Screenreader (und als Tooltip). */
  nurSymbol?: string;
  /** Symbol vor der Beschriftung (Lucide über `<Symbol>`); bei Gefahr Pflicht. */
  symbol?: SymbolName;
  /** Erklärung einer Sperre schon offen (nur für Musterseite und Bilder). */
  erklaerungOffen?: boolean;
  ref?: Ref<HTMLButtonElement>;
  /** Darf ein Promise liefern: „läuft“, Fehler und Ergebnis zeigt der Knopf (siehe oben). Bei Gefahr erst nach „Ja“. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

/**
 * Art `gefahr` (Leitsatz 4 und 5) nur mit Symbol und Rückfrage – ohne beides lässt die Typprüfung sie nicht zu. Der
 * Baustein stellt die Rückfrage selbst (Fokus startet auf „Abbrechen“) und ruft `onClick` erst nach „Ja“ auf.
 */
export type KnopfProps = KnopfBasis & (
  | { art?: Exclude<KnopfArt, 'gefahr'>; rueckfrage?: undefined }
  | { art: 'gefahr'; symbol: SymbolName; rueckfrage: GefahrRueckfrage }
);

/**
 * Der Klick samt asynchronem Handler: „läuft“ solange das Promise offen ist, kein zweiter Klick, Fehler und Ergebnis
 * gemerkt. Ein Ergebnis von außen (`ergebnis`) zeigt sich, bis der nächste Klick es ausblendet.
 */
function useHandlung(onClick: KnopfProps['onClick'], zu: boolean, ergebnis: KnopfErgebnis | null | undefined, frage?: GefahrRueckfrage) {
  const [laeuft, setLaeuft] = useState(false);
  const [eigen, setEigen] = useState<KnopfErgebnis | null>(null);
  const [ausgeblendet, setAusgeblendet] = useState(false);
  const sperre = useRef(false);
  // Ein neues Ergebnis von außen zeigt sich wieder, auch wenn ein Klick das vorige ausgeblendet hat.
  useEffect(() => { setAusgeblendet(false); }, [ergebnis]);

  async function klick(e: MouseEvent<HTMLButtonElement>) {
    // Gesperrt oder läuft: nichts tun – auch kein Absenden eines Formulars (Enter in einem Feld klickt den Knopf).
    if (zu || sperre.current) { e.preventDefault(); return; }
    if (frage) {
      // Gefahr (Leitsatz 5): erst die Rückfrage – solange sie offen ist, kein zweiter Klick und kein „läuft“.
      sperre.current = true;
      const ja = await stelleRueckfrage({ ...frage, gefahr: true }).finally(() => { sperre.current = false; });
      if (!ja) return;
    }
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

/** Beschriftung samt Symbol; während „läuft“ unsichtbar an ihrem Platz, darüber Kreisel und Text. */
function Beschriftung({ zeichen, busy, laeuftText, nurSymbol, children }: { zeichen?: SymbolName; busy: boolean; laeuftText?: string; nurSymbol: boolean; children: ReactNode }) {
  return (
    <span className={s.stapel}>
      <span className={s.text}>{zeichen && <Symbol name={zeichen} />}{children}</span>
      {busy && <Laeuft text={laeuftText} nurSymbol={nurSymbol} />}
    </span>
  );
}

/** Zustände und Verknüpfungen am `<button>`: gesperrt, läuft, Name bei nur Symbol, Grund und Ergebnis. */
function zustandsAttribute({ gesperrt, busy, grund, nurSymbol, title, beschrieben }: { gesperrt: KnopfGesperrt; busy: boolean; grund: boolean; nurSymbol?: string; title?: string; beschrieben?: string }) {
  return {
    // Nichts zu tun: disabled – außer während der Knopf selbst läuft (sonst verlöre er den Tastaturfokus).
    disabled: gesperrt === true && !busy,
    'aria-disabled': busy || grund || undefined,
    'aria-busy': busy || undefined,
    'aria-label': nurSymbol,
    title: title ?? nurSymbol,
    'aria-describedby': beschrieben || undefined,
  };
}

/**
 * Was der Knopf öffnet: Gefahr die Rückfrage (`aria-haspopup="dialog"`), gesperrt aus einem Grund die Erklärung
 * (`aria-expanded`, `aria-controls`; dazu eine feste `id`, auf die das ⓘ verweist). Sonst gilt, was von außen kommt.
 */
function oeffnet({ rueckfrage, sperre, offen, ids, type }: { rueckfrage: boolean; sperre: boolean; offen: boolean; ids: { knopf: string; erklaerung: string }; type: KnopfProps['type'] }) {
  // Gefahr und Sperre senden nie ein Formular ab: erst die Rückfrage bzw. die Erklärung.
  if (sperre) return { type: 'button' as const, id: ids.knopf, 'aria-expanded': offen, 'aria-controls': offen ? ids.erklaerung : undefined };
  return rueckfrage ? { type: 'button' as const, 'aria-haspopup': 'dialog' as const } : { type };
}

/** Eigener Verweis auf das `<button>` und der von außen (`ref`) zugleich. */
function useVerweise(aussen: Ref<HTMLButtonElement> | undefined): [RefObject<HTMLButtonElement | null>, (el: HTMLButtonElement | null) => void] {
  const eigen = useRef<HTMLButtonElement | null>(null);
  const setze = (el: HTMLButtonElement | null) => {
    eigen.current = el;
    if (typeof aussen === 'function') aussen(el); else if (aussen) aussen.current = el;
  };
  return [eigen, setze];
}

export function Knopf(props: KnopfProps) {
  const { art = 'neben', groesse, children, gesperrt, laeuft, laeuftText, ergebnis, nurSymbol, symbol, rueckfrage, erklaerungOffen, onClick, type = 'button', className, title, ref, ...rest } = props;
  const basis = useId();
  const sperre = sperreAus(gesperrt);
  const [offen, setOffen] = useState(!!erklaerungOffen);
  const [eigen, verweis] = useVerweise(ref);
  const h = useHandlung(onClick, !!laeuft || !!sperre, ergebnis, rueckfrage);
  const busy = !!laeuft || h.laeuft;
  const ids = { knopf: rest.id ?? `${basis}k`, grund: `${basis}g`, ergebnis: `${basis}e`, erklaerung: `${basis}x` };
  const beschrieben = klassen(rest['aria-describedby'], sperre && ids.grund, h.zeigen && ids.ergebnis);
  // Gesperrt aus einem Grund: Schloss statt des eigenen Symbols; der Klick öffnet die Erklärung.
  const zeichen = sperre ? 'schloss' : symbol;

  const knopf = (
    <button
      {...rest}
      ref={verweis}
      {...aussehen(art, groesse, klassen(nurSymbol && s.symbol, sperre && s.gesperrt, className))}
      {...zustandsAttribute({ gesperrt, busy, grund: !!sperre, nurSymbol, title, beschrieben })}
      {...oeffnet({ rueckfrage: !!rueckfrage, sperre: !!sperre, offen, ids, type })}
      onClick={(e) => { if (sperre && !busy) setOffen(!offen); else void h.klick(e); }}
    >
      <Beschriftung zeichen={zeichen} busy={busy} laeuftText={laeuftText} nurSymbol={!!nurSymbol}>{children}</Beschriftung>
    </button>
  );

  return (
    <>
      {sperre
        ? <Erklaerung sperre={sperre} knopf={knopf} knopfRef={eigen} knopfId={ids.knopf} grundId={ids.grund} erklaerungId={ids.erklaerung} offen={offen} setOffen={setOffen} />
        : knopf}
      {(!!onClick || ergebnis !== undefined) && <Ergebnis wert={h.zeigen} id={ids.ergebnis} />}
    </>
  );
}

/**
 * Bestätigungsknopf der Rückfrage (#1210, Leitsatz 5): rot gefüllt bei Gefahr, sonst blau. Nur für den Baustein
 * `Rueckfragen` – nicht in index.ts, damit es auf der Seite nichts Rotes gibt.
 */
export function BestaetigenKnopf({ gefahr, children, gesperrt, ref }: { gefahr?: boolean; children: ReactNode; gesperrt?: boolean; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type="submit" disabled={gesperrt} {...aussehen(gefahr ? 'entscheidung' : 'haupt')}>
      <span className={s.stapel}><span className={s.text}>{children}</span></span>
    </button>
  );
}

export interface KnopfLinkProps {
  /** Ziel innerhalb von Ablago, z. B. `/werkbank/benutzer/neu`. */
  to: string;
  art?: Exclude<KnopfArt, 'link' | 'gefahr'>;
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
  return <a href={to} onClick={klick} title={title} data-anker={anker} {...aussehen(art, groesse, className)}>{children}</a>;
}
