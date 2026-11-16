/**
 * Warnungen und Fehler aus dem Protokoll aller Prozesse, zusammengefasst (#895) – für den Lasttest: Bericht, Ergebnisblock
 * und die Lasttest-Seite. Statt im Docker-Log nachzusehen, zählt Ablago gleiche Meldungen: Stufe (Warnung, Fehler),
 * Modul, Text, Art der Ausnahme, Anzahl, erster und letzter Zeitpunkt, in welchen Prozessen.
 *
 * Ohne Innenleben: Gezählt wird nur der Text der Meldung ohne Kontextobjekt (`daten`). Was im Text an Einzelheiten
 * steht – Pfade, Adressen, E-Mail-Adressen, Prüfsummen, Ids, Zahlen, Angaben in Anführungszeichen – ersetzt
 * {@link ohneEinzelheiten}. Aus einem Fehler im Kontextobjekt bleibt nur seine Art (`TypeError`, `Error ENOENT`),
 * nie die Nachricht oder der Stapel ({@link ausnahmeArt}).
 *
 * Dauer (#909): Bringt eine Meldung ihre Dauer im Kontext mit (`daten.dauerMs`, z. B. „Lange Anfrage“, „Langer
 * Datenbankzugriff“), steht im Text statt der Zahl `<Dauer>`; gezählt werden höchste Dauer, Summe und Anzahl – die
 * Anzeige macht daraus „dauerte bis 1.240 ms (Ø 610 ms)“. Nennt der Kontext das Routenmuster der Anfrage
 * (`daten.muster`, z. B. „GET /api/mappen/:id“), steht es statt des konkreten Pfads (`daten.anfrage`) im Text – es
 * kommt aus dem Code und enthält keine Ids.
 *
 * Zusammengefasst (#920): Lange Anfragen und Datenbankzugriffe schreibt Ablago je Minute und Art als eine Zeile mit
 * Anzahl (`daten.zusammengefasst`), höchster Dauer (`daten.dauerMs`), Summe (`daten.summeMs`) und erstem Auftreten
 * (`daten.seit`); der Zusatz im Text ({@link zusammenfassungZusatz}) gehört nicht zur Art. Die Sammlung zählt so
 * genau wie bei einzelnen Zeilen – nur ein wenig später.
 *
 * Lasttest-Modus (#909): Was nur die Mess-Sitzung im Verwaltungsmodus auslöst (Spur des Verwaltungsmodus, im Kontext
 * mit `imVerwaltungsmodus: true` gekennzeichnet – etwa „Im Verwaltungsmodus: fremde Mappe“), zählt die Sammlung dann
 * nicht mit ({@link setzeLasttestModus}); ins Protokoll kommt es weiter.
 *
 * Mit mehreren Prozessen schickt jeder seine Meldungen gebündelt an den Hauptprozess, der sie für alle sammelt
 * (prozesse.ts) – so überstehen sie auch den Absturz eines Prozesses. Mit einem Prozess sammelt er selbst. Die Sammlung
 * lebt nur im Arbeitsspeicher, ist klein ({@link ARTEN_MAX} Arten) und kostet ohne Warnungen nichts.
 */

export type SammelStufe = 'warn' | 'error' | 'fatal';
export const SAMMEL_STUFEN: readonly string[] = ['warn', 'error', 'fatal'];
/** Höchstens so viele verschiedene Meldungen; weitere zählen nur noch in `weitere`. */
export const ARTEN_MAX = 100;
/** Länge des Textes einer Meldung. */
export const TEXT_MAX = 160;

/** Dauer gleicher Meldungen (#909): höchste, Summe und Anzahl (für den Mittelwert) in ms. */
export interface Sammeldauer {
  max: number;
  summe: number;
  n: number;
}

/** Eine Meldung, wie sie zwischen Prozessen reist: schon ohne Einzelheiten. */
export interface Rohmeldung {
  stufe: SammelStufe;
  modul: string;
  text: string;
  ausnahme: string | null;
  anzahl: number;
  erste: string;
  letzte: string;
  dauer?: Sammeldauer | null;
  /** Routenmuster im Text (#909), damit es beim erneuten Bereinigen im Hauptprozess stehen bleibt. */
  muster?: string | null;
}

export interface Sammeleintrag extends Rohmeldung {
  /** Nummern der Prozesse, die sie meldeten (0 = Hauptprozess). */
  prozesse: number[];
}

export interface Sammelstand {
  /** Seit wann gesammelt wird (Start des sammelnden Prozesses). */
  seit: string;
  /** Alle gezählten Meldungen, auch die unter `weitere`. */
  gesamt: number;
  /** Meldungen von Arten, die nicht mehr in die Liste passten. */
  weitere: number;
  /** Häufigste zuerst, höchstens {@link ARTEN_MAX}. */
  eintraege: Sammeleintrag[];
}

/**
 * Einzelheiten aus einem Meldungstext entfernen: Adressen, E-Mail-Adressen, Pfade, Angaben in Anführungszeichen,
 * Ids und Prüfsummen, dann Zahlen. Leerraum zusammengezogen, höchstens {@link TEXT_MAX} Zeichen.
 */
export function ohneEinzelheiten(text: string): string {
  const t = String(text ?? '')
    .split('\n')[0]
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<Adresse>')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<E-Mail>')
    .replace(/„[^“\n]*“|"[^"\n]*"|«[^»\n]*»|»[^«\n]*«|`[^`\n]*`|'[^'\n]*'|‚[^‘\n]*‘/g, '„…“')
    .replace(/(^|[\s(=:,[])(?:[A-Za-z]:)?[/\\][^\s,;)\]]+/g, '$1<Pfad>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<Id>')
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, '<Prüfsumme>')
    .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g, '<Id>')
    .replace(/\d+(?:[.,]\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > TEXT_MAX ? `${t.slice(0, TEXT_MAX - 1).trimEnd()}…` : t;
}

/**
 * Art einer Ausnahme ohne ihre Nachricht: Name (`TypeError`) und Code von Node.js (`ENOENT`, `ERR_…`), z. B.
 * „Error ENOENT“. Aus einem Error oder aus einem Text, wie ihn das Protokoll unter `fehler` ablegt (Stapel oder
 * „Name: Nachricht“). null, wenn nichts davon erkennbar ist.
 */
export function ausnahmeArt(f: unknown): string | null {
  if (f === null || f === undefined) return null;
  let name: string | null = null;
  let code: string | null = null;
  if (f instanceof Error) {
    name = f.name || null;
    const c = (f as NodeJS.ErrnoException).code;
    if (typeof c === 'string' && /^(E[A-Z0-9]{2,}|ERR_[A-Z0-9_]+)$/.test(c)) code = c;
    if (!code) code = f.message.match(/\b(E[A-Z]{3,}|ERR_[A-Z0-9_]{3,})\b/)?.[1] ?? null;
  } else {
    const erste = String(f).split('\n')[0];
    name = erste.match(/^\s*((?:[A-Z][A-Za-z]*)?(?:Error|Exception))\b/)?.[1] ?? null;
    code = erste.match(/\b(E[A-Z]{3,}|ERR_[A-Z0-9_]{3,})\b/)?.[1] ?? null;
  }
  const teile = [name, code].filter(Boolean);
  return teile.length ? teile.join(' ') : null;
}

/** Platzhalter für die Dauer im Text (#909). */
export const DAUER_PLATZHALTER = '<Dauer>';
/** Routenmuster aus dem Code (#909): Methode und Pfad mit Platzhaltern, keine Ids, keine Anführungszeichen. */
const MUSTER = /^[A-Z]{3,9} \/[A-Za-z0-9_\-./:*]{0,120}$/;
const SPUR_MUSTER = '\u0001';

/** Zusatz im Text einer Zusammenfassung (#920): „ (längste von 120 in einer Minute, Ø 610 ms)“; bei einer leer. */
export function zusammenfassungZusatz(n: number, mittelMs: number): string {
  return n > 1 ? ` (längste von ${n} in einer Minute, Ø ${mittelMs} ms)` : '';
}
const ZUSATZ = / \(längste von \d+ in einer Minute, Ø \d+ ms\)$/;
const ZUSAMMEN_MAX = 1_000_000_000;

let lasttestModus = false;
/**
 * Lasttest-Modus (#909) für diesen Prozess: Meldungen der Spur des Verwaltungsmodus (`imVerwaltungsmodus: true`)
 * zählen nicht mit. Im Lasttest-Modus ist das Skript der einzige Nutzer – solche Meldungen löst nur seine
 * Mess-Sitzung aus (z. B. 528× „Im Verwaltungsmodus: fremde Mappe“), und sie verdecken die übrigen.
 */
export function setzeLasttestModus(an: boolean) {
  lasttestModus = an;
}

const dauerZahl = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);

/** Zwei Dauern zusammenführen (#909); ohne Angabe bleibt die andere. */
export function vereineDauer(a: Sammeldauer | null | undefined, b: Sammeldauer | null | undefined): Sammeldauer | null {
  const x = dauerAus(a),
    y = dauerAus(b);
  if (!x) return y;
  if (!y) return x;
  return { max: Math.max(x.max, y.max), summe: x.summe + y.summe, n: x.n + y.n };
}

/** Dauer aus einer Meldung eines anderen Prozesses: nur Zahlen. */
function dauerAus(d: Sammeldauer | null | undefined): Sammeldauer | null {
  if (!d || typeof d !== 'object') return null;
  const max = dauerZahl(d.max),
    summe = dauerZahl(d.summe),
    n = dauerZahl(d.n);
  return max === null || summe === null || !n ? null : { max, summe, n };
}

const schluessel = (m: Pick<Rohmeldung, 'stufe' | 'modul' | 'text' | 'ausnahme'>) =>
  `${m.stufe}\u0000${m.modul}\u0000${m.text}\u0000${m.ausnahme ?? ''}`;

/**
 * Aus einem Eintrag des Protokolls die Rohmeldung (ohne Einzelheiten); null unter Warnung und – im Lasttest-Modus –
 * für die Spur des Verwaltungsmodus (#909). Mit `daten.dauerMs` die Dauer, mit `daten.muster` das Routenmuster.
 */
export function rohAus(
  e: { stufe: string; modul: string; text: string; zeit: string; daten?: Record<string, unknown> },
  o: { lasttest?: boolean } = {},
): Rohmeldung | null {
  if (!SAMMEL_STUFEN.includes(e.stufe)) return null;
  const d = e.daten ?? {};
  if ((o.lasttest ?? lasttestModus) && d.imVerwaltungsmodus === true) return null;
  let text = String(e.text ?? '').split('\n')[0];
  // Zusammenfassung (#920): Anzahl und Summe aus dem Kontext, der Zusatz im Text gehört nicht zur Art.
  const n =
    typeof d.zusammengefasst === 'number' &&
    Number.isInteger(d.zusammengefasst) &&
    d.zusammengefasst >= 1 &&
    d.zusammengefasst <= ZUSAMMEN_MAX
      ? d.zusammengefasst
      : null;
  if (n !== null) text = text.replace(ZUSATZ, '');
  const muster = typeof d.muster === 'string' && MUSTER.test(d.muster) ? d.muster : null;
  if (muster && typeof d.anfrage === 'string' && d.anfrage && text.includes(d.anfrage)) text = text.replace(d.anfrage, muster);
  const ms = dauerZahl(d.dauerMs);
  if (ms !== null && text.includes(`${ms} ms`)) text = text.replace(`${ms} ms`, DAUER_PLATZHALTER);
  text = sauber(text, muster);
  const summe = n !== null ? dauerZahl(d.summeMs) : ms;
  const seit =
    n !== null && typeof d.seit === 'string' && !Number.isNaN(Date.parse(d.seit)) && d.seit <= e.zeit
      ? new Date(d.seit).toISOString()
      : e.zeit;
  return {
    stufe: e.stufe as SammelStufe,
    modul: e.modul,
    text,
    ausnahme: ausnahmeArt(d.fehler ?? d.err ?? d.error ?? null),
    anzahl: n ?? 1,
    erste: seit,
    letzte: e.zeit,
    ...(ms !== null && summe !== null && text.includes(DAUER_PLATZHALTER)
      ? { dauer: { max: ms, summe: Math.max(summe, ms), n: n ?? 1 } }
      : {}),
    ...(muster && text.includes(muster) ? { muster } : {}),
  };
}

/**
 * Text ohne Einzelheiten (#909): ein gültiges Routenmuster im Text bleibt stehen – vor dem Bereinigen durch ein
 * Zeichen ersetzt, das es übersteht, danach wieder eingesetzt. Ohne Muster wie {@link ohneEinzelheiten}.
 */
export function sauber(text: string, muster: unknown): string {
  const t = String(text ?? '');
  if (typeof muster !== 'string' || !MUSTER.test(muster) || !t.includes(muster)) return ohneEinzelheiten(t);
  const i = t.indexOf(muster);
  return ohneEinzelheiten(`${t.slice(0, i)}${SPUR_MUSTER}${t.slice(i + muster.length)}`)
    .replace(SPUR_MUSTER, muster)
    .replaceAll(SPUR_MUSTER, '');
}

/** Zählt gleiche Meldungen zusammen; mit `prozess` für die Sammlung aller Prozesse. */
export class Protokollsammlung {
  private arten = new Map<string, Sammeleintrag>();
  private gesamt = 0;
  private weitere = 0;
  constructor(
    private readonly seit = new Date().toISOString(),
    private readonly max = ARTEN_MAX,
  ) {}

  nimm(m: Rohmeldung, prozess: number) {
    const n = Math.max(1, Math.floor(Number(m.anzahl)) || 1);
    this.gesamt += n;
    const k = schluessel(m);
    const alt = this.arten.get(k);
    if (alt) {
      alt.anzahl += n;
      if (m.erste < alt.erste) alt.erste = m.erste;
      if (m.letzte > alt.letzte) alt.letzte = m.letzte;
      if (!alt.prozesse.includes(prozess)) alt.prozesse = [...alt.prozesse, prozess].sort((a, b) => a - b);
      const dauer = vereineDauer(alt.dauer, m.dauer);
      if (dauer) alt.dauer = dauer;
      return;
    }
    if (this.arten.size >= this.max) {
      this.weitere += n;
      return;
    }
    const dauer = dauerAus(m.dauer);
    this.arten.set(k, {
      stufe: m.stufe,
      modul: String(m.modul),
      text: sauber(m.text, m.muster),
      ausnahme: m.ausnahme ?? null,
      anzahl: n,
      erste: m.erste,
      letzte: m.letzte,
      prozesse: [prozess],
      ...(dauer ? { dauer } : {}),
    });
  }

  stand(): Sammelstand {
    const eintraege = [...this.arten.values()]
      .map((e) => ({ ...e, prozesse: [...e.prozesse], ...(e.dauer ? { dauer: { ...e.dauer } } : {}) }))
      .sort((a, b) => b.anzahl - a.anzahl || (a.erste < b.erste ? -1 : 1));
    return { seit: this.seit, gesamt: this.gesamt, weitere: this.weitere, eintraege };
  }
}

/**
 * Bündel für den Weg zum Hauptprozess (#895): gleiche Meldungen zusammengezählt, abgeschickt spätestens nach
 * `ms` – ein Fehler sofort, damit er auch einen Absturz übersteht.
 */
export class Buendel {
  private offen = new Map<string, Rohmeldung>();
  private uhr?: NodeJS.Timeout;
  constructor(
    private senden: (m: Rohmeldung[]) => void,
    private ms = 1000,
  ) {}

  nimm(m: Rohmeldung) {
    const k = schluessel(m);
    const alt = this.offen.get(k);
    if (alt) {
      alt.anzahl += m.anzahl;
      alt.letzte = m.letzte;
      const dauer = vereineDauer(alt.dauer, m.dauer);
      if (dauer) alt.dauer = dauer;
    } else this.offen.set(k, { ...m, ...(m.dauer ? { dauer: { ...m.dauer } } : {}) });
    if (m.stufe !== 'warn') {
      this.leeren();
      return;
    }
    if (!this.uhr) {
      this.uhr = setTimeout(() => this.leeren(), this.ms);
      this.uhr.unref?.();
    }
  }

  leeren() {
    if (this.uhr) {
      clearTimeout(this.uhr);
      this.uhr = undefined;
    }
    if (!this.offen.size) return;
    const m = [...this.offen.values()];
    this.offen.clear();
    try {
      this.senden(m);
    } catch {
      /* Hauptprozess weg: dann gibt es niemanden mehr, der sammelt */
    }
  }
}
