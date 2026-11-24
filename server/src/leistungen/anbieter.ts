/**
 * Anbieter von Leistungen (#1569): wer eine Leistung erbringt – eingebaut (Ablago selbst, #1570) oder ein Paket
 * (#1572). Die Liste wählt je Auftrag genau einen: den gewählten (Werkbank, #1570), sonst den eingebauten, sonst den
 * ersten, der den Dateityp kann. Ausgeschaltete zählen nicht. Gibt es keinen, sagt sie warum.
 */
import type { Datei, KeinAnbieterGrund, Leistungsname } from '../../../shared/src/leistungen';
import { leistung } from '../../../shared/src/leistungen';

/** Was ein Anbieter für einen Auftrag bekommt: die geprüfte Eingabe, Dokumente schon als Datei. */
interface Arbeitsauftrag {
  leistung: Leistungsname;
  eingabe: Record<string, unknown>;
  signal: AbortSignal;
}
/** Was er zurückgibt: Daten nach dem Ausgabeschema, bei Leistungen mit Formaten die Datei. */
export interface Anbieterergebnis {
  daten: Record<string, unknown>;
  datei?: Datei;
}

export interface Anbieter {
  /** Kennung: eingebaut `ablago.<name>`, sonst die Paket-Id. */
  id: string;
  art: 'eingebaut' | 'paket';
  /** Leistungen, die er erbringt; je Leistung optional engere Dateitypen als der Katalog. */
  bietet: Partial<Record<Leistungsname, { dateitypen?: readonly string[] }>>;
  fuehreAus(a: Arbeitsauftrag): Promise<Anbieterergebnis>;
}

/** Passt ein Mime auf eine Liste (`typ/*` und `*\/*` als Gruppe)? Eine leere Liste nimmt nichts. */
function mimePasst(mime: string, liste: readonly string[]): boolean {
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

  /** Genau einen Anbieter für den Auftrag wählen – oder den Grund, warum es keinen gibt. */
  waehle(l: Leistungsname, mimes: readonly string[] = []): Wahl {
    const alle = this.fuer(l);
    if (!alle.length) return { grund: 'keiner' };
    const an = alle.filter((a) => this.an(a.id));
    if (!an.length) return { grund: 'aus' };
    const passend = an.filter((a) => this.kann(a, l, mimes));
    if (!passend.length) return { grund: 'dateityp' };
    const wunsch = this.gewaehlt(l);
    const a = passend.find((x) => x.id === wunsch) ?? passend.find((x) => x.art === 'eingebaut') ?? passend[0];
    return { anbieter: a };
  }
}
