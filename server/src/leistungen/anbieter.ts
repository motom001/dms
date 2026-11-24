/**
 * Anbieter von Leistungen (#1569): wer eine Leistung erbringt – eingebaut (Ablago selbst, #1570) oder ein Paket
 * (#1572). Die Liste wählt je Auftrag genau einen: den gewählten (Werkbank, #1570), sonst den eingebauten, sonst den
 * ersten, der die Eingabe kann. Ausgeschaltete zählen nicht. Gibt es keinen, sagt sie warum.
 *
 * Was ein Anbieter kann, meldet er je Leistung (#1570): engere `dateitypen` und Einschränkungen der Eingabe aus dem
 * Katalog (`einschraenkungen`, z. B. `bereits-pdfa`). Eine Eingabe außerhalb seiner Meldung bekommt er nie.
 */
import type { Datei, Einschraenkung, KeinAnbieterGrund, Leistungsname, Meldung } from '../../../shared/src/leistungen';
import { leistung } from '../../../shared/src/leistungen';

/** Was ein Anbieter für einen Auftrag bekommt: die geprüfte Eingabe, Dokumente schon als Datei. */
interface Arbeitsauftrag {
  leistung: Leistungsname;
  eingabe: Record<string, unknown>;
  signal: AbortSignal;
  /** Nur von Ablago an eingebaute Anbieter (#1570), nie an Pakete. */
  intern?: Record<string, unknown>;
}
/** Was er zurückgibt: Daten nach dem Ausgabeschema, bei Leistungen mit Formaten die Datei. */
export interface Anbieterergebnis {
  daten: Record<string, unknown>;
  datei?: Datei;
  /** Nur eingebaute Anbieter, nur an Ablago selbst (#1570, `InternesErgebnis`). */
  intern?: Record<string, unknown>;
}

export interface Anbieter {
  /** Kennung: eingebaut `ablago.<name>`, sonst die Paket-Id. */
  id: string;
  art: 'eingebaut' | 'paket';
  /** Leistungen, die er erbringt, mit seiner Meldung (Dateitypen, Einschränkungen); ohne Angabe gilt der Katalog. */
  bietet: Partial<Record<Leistungsname, Meldung>>;
  /**
   * Zeitgrenze je Auftrag in ms (#1570), z. B. nach Seitenzahl; ohne: die des Katalogs. `null`: keine eigene – der
   * Aufrufer begrenzt selbst (eingebaute Anbieter, deren Aufrufer ihre Zeitgrenzen schon haben).
   */
  zeitgrenzeMs?: (l: Leistungsname, eingabe: Record<string, unknown>) => number | null;
  fuehreAus(a: Arbeitsauftrag): Promise<Anbieterergebnis>;
}

/** Erfüllen die Dateien der Eingabe eine Einschränkung? (Ablago prüft selbst, eingebaut.ts) */
export type Einschraenkungspruefung = (e: Einschraenkung, dateien: readonly Datei[]) => Promise<boolean>;

/** Passt ein Mime auf eine Liste (`typ/*` und `*\/*` als Gruppe)? Eine leere Liste nimmt nichts. */
export function mimePasst(mime: string, liste: readonly string[]): boolean {
  const m = mime.toLowerCase().split(';')[0].trim();
  return liste.some((x) => x === '*/*' || x === m || (x.endsWith('/*') && m.startsWith(x.slice(0, -1))));
}

export type Wahl = { anbieter: Anbieter } | { grund: KeinAnbieterGrund };

export class Anbieterliste {
  private liste: Anbieter[] = [];
  /** Ist der Anbieter eingeschaltet? (#1570: Schalter in der Werkbank; bis dahin alle an.) */
  an: (id: string) => boolean = () => true;
  /** Gewählter Anbieter je Leistung (#1570: „Wer macht das?“); null = Vorgabe. */
  gewaehlt: (l: Leistungsname) => string | null = () => null;

  /** Anbieter anmelden; eine schon bekannte Kennung wird ersetzt. */
  melde(a: Anbieter): void {
    this.liste = [...this.liste.filter((x) => x.id !== a.id), a];
  }

  entferne(id: string): void {
    this.liste = this.liste.filter((x) => x.id !== id);
  }

  /** Alle, die eine Leistung erbringen (auch ausgeschaltete). */
  fuer(l: Leistungsname): Anbieter[] {
    return this.liste.filter((a) => a.bietet[l]);
  }

  /** Kann der Anbieter alle diese Dateitypen? Ohne Dateien immer. */
  private kann(a: Anbieter, l: Leistungsname, mimes: readonly string[]): boolean {
    const typen = a.bietet[l]?.dateitypen ?? leistung(l).dateitypen;
    return mimes.every((m) => mimePasst(m, typen));
  }

  /**
   * Genau einen Anbieter für den Auftrag wählen – oder den Grund, warum es keinen gibt. Gemeldete Einschränkungen
   * prüft `pruefe` an den Dateien der Eingabe (ohne Prüfung gilt keine als erfüllt).
   */
  async waehle(l: Leistungsname, dateien: readonly Datei[] = [], pruefe?: Einschraenkungspruefung): Promise<Wahl> {
    const alle = this.fuer(l);
    if (!alle.length) return { grund: 'keiner' };
    const an = alle.filter((a) => this.an(a.id));
    if (!an.length) return { grund: 'aus' };
    const mimes = dateien.map((d) => d.mime);
    const typ = an.filter((a) => this.kann(a, l, mimes));
    if (!typ.length) return { grund: 'dateityp' };
    const passend: Anbieter[] = [];
    for (const a of typ) if (await erfuellt(a.bietet[l]?.einschraenkungen ?? [], dateien, pruefe)) passend.push(a);
    if (!passend.length) return { grund: 'eingabe' };
    const wunsch = this.gewaehlt(l);
    const a = passend.find((x) => x.id === wunsch) ?? passend.find((x) => x.art === 'eingebaut') ?? passend[0];
    return { anbieter: a };
  }
}

/** Erfüllt die Eingabe alle gemeldeten Einschränkungen? */
export async function erfuellt(
  es: readonly Einschraenkung[],
  dateien: readonly Datei[],
  pruefe?: Einschraenkungspruefung,
): Promise<boolean> {
  for (const e of es) if (!pruefe || !(await pruefe(e, dateien).catch(() => false))) return false;
  return true;
}
