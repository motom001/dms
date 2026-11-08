/**
 * Paket-Läufer bei mehreren Prozessen (#745): Er läuft genau einmal, im Leiter – er hält die API-Schlüssel der Pakete,
 * und die verlassen diesen Prozess nie. Die anderen Prozesse fragen ihn über den Verbund (`prozesse.ts`): Aktionen,
 * Vektoren für die Suche, „Frag deine Ablage“ (mit Teilen der Antwort), „Aus Dokument ausfüllen“, „Wohin gehört das?“ (#939), „Übersetzung anzeigen“ (#732), Übersicht für die
 * Werkbank. Was sie ohne Warten wissen müssen (welches Paket Vektoren, Antworten, Erkennen anbietet, Dienstkonten der
 * Pakete), schickt der Leiter bei jeder Änderung an alle ({@link LaeuferSchnappschuss}).
 */
import type { Dienst } from '../dienst';
import type { PaketLaeufer } from '../pakete';
import type { Verbund } from '../prozesse';
import type { Paketlaeufer } from './verwaltung';

/** Was die anderen Prozesse vom Läufer ohne Warten wissen müssen. */
export interface LaeuferSchnappschuss {
  vektorPaket: string | null;
  antworten: { id: string; name: string } | null;
  erkennen: Array<{ id: string; name: string; netz: boolean }>;
  /** „Wohin gehört das?“ (#939): geladene Pakete mit dms:klassifizieren. */
  klassifizieren?: Array<{ id: string; name: string; netz: boolean; vektoren: boolean }>;
  /** Inhalte übersetzen (#732): geladene Pakete mit dms:uebersetzen. */
  uebersetzen: Array<{ id: string; name: string; version: string; netz: boolean }>;
  /** Dienstkonto → Paket (auch entfernter Pakete, für die Herkunft von Änderungen). */
  paketKonten: Array<[string, string]>;
  pid: number | null;
}

const LEER: LaeuferSchnappschuss = { vektorPaket: null, antworten: null, erkennen: [], klassifizieren: [], uebersetzen: [], paketKonten: [], pid: null };
/** So oft vergleicht der Leiter den Schnappschuss und schickt ihn bei einer Änderung. */
export const SCHNAPPSCHUSS_MS = 2000;

/** Werkbank: was Routen vom Läufer brauchen – vom echten wie vom fernen. */
export interface LaeuferSicht {
  readonly pid: number | null;
  start(): Promise<void>;
  uebersicht(): ReturnType<Paketlaeufer['uebersicht']>;
  vektorenNeu(): Promise<{ entfernt: number }>;
}

export function schnappschuss(l: Paketlaeufer, d: Dienst): LaeuferSchnappschuss {
  return {
    vektorPaket: l.vektorPaket(), antworten: l.paketMit('dms:antworten'),
    erkennen: d.erkennung.anbieter?.pakete() ?? [], klassifizieren: d.erkennung.klassifizierung.anbieter?.pakete() ?? [], uebersetzen: d.uebersetzung.anbieter?.pakete() ?? [], paketKonten: [...d.paketKonten.entries()], pid: l.pid,
  };
}

/** Im Leiter: Aufrufe der anderen Prozesse ausführen, Änderungen am Schnappschuss melden. */
export function bedieneLaeufer(v: Verbund, l: Paketlaeufer, d: Dienst): void {
  v.bediene('laeufer.zustand', () => schnappschuss(l, d));
  v.bediene('laeufer.aktion', ([paket, aktion, einstellungen]) => l.aktion(String(paket), String(aktion), einstellungen as Record<string, unknown>));
  v.bediene('laeufer.codeGeaendert', () => l.codeGeaendert());
  v.bediene('laeufer.ereignis', ([paket, felder]) => l.ereignis(String(paket), 'paket.einstellungen_geaendert', felder as string[]));
  v.bediene('laeufer.vektorFuer', ([text, ms]) => l.vektorFuer(String(text), Number(ms)));
  v.bediene('laeufer.schnittstelle', ([paket, aktion, eingang, opt], teil) => {
    const o = opt as { bezeichnung: string; ms?: number; mitTeil?: boolean };
    return l.schnittstelle(String(paket), String(aktion), eingang as Record<string, unknown>, { bezeichnung: o.bezeichnung, ...(o.ms ? { ms: o.ms } : {}), ...(o.mitTeil ? { teil: (x: string) => teil(x) } : {}) });
  });
  v.bediene('laeufer.uebersicht', () => l.uebersicht());
  v.bediene('laeufer.vektorenNeu', () => l.vektorenNeu());
  v.hoere('laeufer.stelleZu', () => void l.stelleZu());
  if (!v.mehrere) return;
  let zuletzt = '';
  setInterval(() => {
    const z = schnappschuss(l, d);
    const j = JSON.stringify(z);
    if (j !== zuletzt) { zuletzt = j; v.melde('laeufer.zustand', z, 'andere'); }
  }, SCHNAPPSCHUSS_MS).unref();
}

/** In den anderen Prozessen: wie der Paket-Läufer, aber jeder Aufruf geht an den Leiter. */
export class Fernlaeufer implements PaketLaeufer, LaeuferSicht {
  private z: LaeuferSchnappschuss = LEER;

  constructor(private v: Verbund, private dienst: Dienst) {
    dienst.ereignisWecker = () => v.melde('laeufer.stelleZu');
    dienst.vektorAnbieter = {
      paket: () => this.z.vektorPaket,
      vektorFuer: (text, ms) => v.rufe('laeufer.vektorFuer', [text, ms], { ms: ms + 5000 }),
    };
    dienst.fragen.anbieter = {
      paket: () => this.z.antworten,
      antworte: (paket, eingang, teil) => v.rufe('laeufer.schnittstelle', [paket, 'dms:antworten', eingang, { bezeichnung: 'Frage beantwortet', mitTeil: true }], { teil: (x) => teil(String(x)) }),
    };
    dienst.erkennung.anbieter = {
      pakete: () => this.z.erkennen,
      erkenne: (paket, eingang, ms) => v.rufe('laeufer.schnittstelle', [paket, 'dms:erkennen', eingang, { bezeichnung: 'Felder erkannt', ms }], { ms: ms + 5000 }),
    };
    dienst.erkennung.klassifizierung.anbieter = {
      pakete: () => this.z.klassifizieren ?? [],
      klassifiziere: (paket, eingang, ms) => v.rufe('laeufer.schnittstelle', [paket, 'dms:klassifizieren', eingang, { bezeichnung: 'Mappentyp vorgeschlagen', ms }], { ms: ms + 5000 }),
    };
    dienst.uebersetzung.anbieter = {
      pakete: () => this.z.uebersetzen ?? [],
      uebersetze: (paket, eingang, ms) => v.rufe('laeufer.schnittstelle', [paket, 'dms:uebersetzen', eingang, { bezeichnung: 'Text übersetzt', ms }], { ms: ms + 5000 }),
    };
    v.hoere('laeufer.zustand', (z) => this.setze(z as LaeuferSchnappschuss));
  }

  private setze(z: LaeuferSchnappschuss) { this.z = z; this.dienst.paketKonten = new Map(z.paketKonten); }

  /** Beim Start den Stand des Leiters holen. */
  async start() { this.setze(await this.v.rufe<LaeuferSchnappschuss>('laeufer.zustand')); }

  get pid() { return this.z.pid; }
  aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>) { return this.v.rufe<string>('laeufer.aktion', [paket, aktion, einstellungen]); }
  async codeGeaendert() { await this.v.rufe('laeufer.codeGeaendert'); }
  ereignis(paket: string, _name: 'paket.einstellungen_geaendert', felder: string[]) { void this.v.rufe('laeufer.ereignis', [paket, felder]).catch(() => {}); }
  uebersicht() { return this.v.rufe<Awaited<ReturnType<Paketlaeufer['uebersicht']>>>('laeufer.uebersicht'); }
  vektorenNeu() { return this.v.rufe<{ entfernt: number }>('laeufer.vektorenNeu'); }
}
