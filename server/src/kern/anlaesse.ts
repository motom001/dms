import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import type { Abwesenheit, Benutzer, Mappe, Mappentyp, Werte } from '../../../shared/src/model';

/**
 * Anschlusspunkte (#962): Was **sofort** zu einer Änderung gehört – in derselben Transaktion, ein Fehler rollt alles
 * zurück. Wer etwas ändert, meldet den Anlass mit `melde(…)`; die Empfänger laufen der Reihe nach. Später (mindestens
 * einmal, mit Wiederholung, Fehler nur im Protokoll) ist etwas anderes: dafür bleibt `kern.ereignis(…)` mit dem
 * Ausgangskorb.
 *
 * Regeln für Empfänger:
 * - Angemeldet wird an **einer** Stelle beim Zusammenbau (im Dienst), in fester Reihenfolge; danach ist die Liste zu.
 * - Nur Datenbank-Arbeit über `kern.repo` und `kern.danach(…)`. Bricht PostgreSQL wegen einer Verklemmung ab, wiederholt
 *   `inEinemZug` die ganze Änderung – samt Empfängern. Keine Zwischenspeicher, Mails oder Dateien direkt.
 * - Sofort werden nur Empfänger, die vor #962 schon direkt gerufen wurden. Alles Neue geht in den Ausgangskorb – sonst
 *   wächst die Transaktion leise.
 * - Ein Empfänger darf einen anderen Anlass melden (Tiefe höchstens 2), nie den eigenen.
 */

/** Mappe angelegt oder geändert (Anlegen, Ändern). `neu` sind die eingegebenen Werte, `mappe` der gespeicherte Stand. */
export interface MappeGeaendert {
  typ: Mappentyp;
  mappe: Mappe;
  alt: Werte;
  neu: Werte;
  von: string | null;
  angelegt: boolean;
  /** Demo-Mappe (#248): ohne Erwähnungen und Fristen. */
  demo: boolean;
}
/** Mappentyp geändert und gespeichert. */
export interface TypGeaendert { alt: Mappentyp; typ: Mappentyp }
/** Mappentyp angelegt; `sicht` = eigene Ansicht anlegen (#38, abwählbar). */
export interface TypAngelegt { typ: Mappentyp; sicht: boolean }
/** Benutzer-Mappe gespiegelt (Konto angelegt oder geändert); `abwesenheit`, wenn sich die Abwesenheit geändert hat. */
export interface BenutzerGespiegelt { benutzer: Benutzer; von: string | null; abwesenheit?: { vorher: Abwesenheit; wegen?: string } }

export type AnlassName = 'mappeGeaendert' | 'typGeaendert' | 'typAngelegt' | 'benutzerGespiegelt';
export type Empfaenger<E> = (e: E) => Promise<unknown>;

/** Wie tief Anlässe ineinander gemeldet werden dürfen: ein Empfänger meldet einen weiteren, mehr nicht. */
export const ANLASS_TIEFE = 2;
const EMPFAENGER = 'empfaenger';

/** Welche Empfänger gerade laufen (je Aufruf): Anlass und Empfänger, von außen nach innen. */
const laufend = new AsyncLocalStorage<ReadonlyArray<{ anlass: AnlassName; empfaenger: string }>>();

/**
 * Der `EventEmitter` ist hier **nur die Liste** der Empfänger (`on`, `listeners`). `emit()` ist verboten: Es ruft die
 * Empfänger, ohne auf sie zu warten – ein Fehler rollte nichts zurück, und die Reihenfolge der Arbeit wäre offen.
 */
class Empfaengerliste extends EventEmitter {
  override emit(): boolean { throw new Error('emit() ist an Anschlusspunkten verboten – melde() wartet die Empfänger der Reihe nach ab'); }
}

/** Ein Anschlusspunkt: Empfänger anmelden (beim Zusammenbau) und den Anlass melden (in einer Transaktion). */
export class Anschlusspunkt<E> {
  private readonly liste = new Empfaengerliste();
  private readonly namen = new WeakMap<object, string>();
  private zu = false;

  constructor(readonly name: AnlassName, private readonly inTransaktion: () => boolean) {}

  /** Einen Empfänger hinten anhängen; nur beim Zusammenbau. `empfaenger` = Fachbereich.Aufgabe, z. B. `aufgaben.fristen`. */
  anmelden(empfaenger: string, f: Empfaenger<E>): void {
    if (this.zu) throw new Error(`Anschlusspunkt „${this.name}“: Empfänger nur beim Zusammenbau anmelden („${empfaenger}“)`);
    if (this.empfaenger().includes(empfaenger)) throw new Error(`Anschlusspunkt „${this.name}“: „${empfaenger}“ ist schon angemeldet`);
    this.namen.set(f, empfaenger);
    // Nur abgelegt: Gerufen wird ausschließlich in melde(), dort abgewartet.
    this.liste.on(EMPFAENGER, f as (e: E) => void);
  }

  /** Liste schließen: Danach meldet sich niemand mehr an. */
  schliessen(): void { this.zu = true; }

  /** Die Empfänger in ihrer Reihenfolge. */
  empfaenger(): string[] { return this.liste.listeners(EMPFAENGER).map((f) => this.namen.get(f) ?? '?'); }

  /**
   * Den Anlass melden: alle Empfänger der Reihe nach, jeder abgewartet. Nur in einer Transaktion des Kerns – ein Fehler
   * geht an den Aufrufer und rollt die ganze Änderung zurück.
   */
  async melde(e: E): Promise<void> {
    if (!this.inTransaktion()) throw new Error(`Anschlusspunkt „${this.name}“ nur in einer Transaktion melden`);
    const kette = laufend.getStore() ?? [];
    const selbst = kette.find((x) => x.anlass === this.name);
    if (selbst) throw new Error(`Anschlusspunkt „${this.name}“ erneut gemeldet, während sein Empfänger „${selbst.empfaenger}“ läuft`);
    if (kette.length >= ANLASS_TIEFE) throw new Error(`Anschlusspunkt „${this.name}“: höchstens ${ANLASS_TIEFE} Anlässe ineinander (${kette.map((x) => x.anlass).join(' → ')})`);
    for (const f of this.liste.listeners(EMPFAENGER) as Array<Empfaenger<E>>) {
      await laufend.run([...kette, { anlass: this.name, empfaenger: this.namen.get(f) ?? '?' }], () => f(e));
    }
  }
}

/** Die vier Anschlusspunkte des Kerns (#962). */
export class Anlaesse {
  readonly mappeGeaendert: Anschlusspunkt<MappeGeaendert>;
  readonly typGeaendert: Anschlusspunkt<TypGeaendert>;
  readonly typAngelegt: Anschlusspunkt<TypAngelegt>;
  readonly benutzerGespiegelt: Anschlusspunkt<BenutzerGespiegelt>;

  constructor(inTransaktion: () => boolean) {
    this.mappeGeaendert = new Anschlusspunkt('mappeGeaendert', inTransaktion);
    this.typGeaendert = new Anschlusspunkt('typGeaendert', inTransaktion);
    this.typAngelegt = new Anschlusspunkt('typAngelegt', inTransaktion);
    this.benutzerGespiegelt = new Anschlusspunkt('benutzerGespiegelt', inTransaktion);
  }

  private alle(): Array<Anschlusspunkt<never>> {
    return [this.mappeGeaendert, this.typGeaendert, this.typAngelegt, this.benutzerGespiegelt] as Array<Anschlusspunkt<never>>;
  }

  /** Nach dem Anmelden beim Zusammenbau: alle Listen zu. */
  schliessen(): void { for (const a of this.alle()) a.schliessen(); }

  /** Anlass → Empfänger in ihrer Reihenfolge (Test und Liste im Entwicklerhandbuch). */
  liste(): Array<{ anlass: AnlassName; empfaenger: string[] }> { return this.alle().map((a) => ({ anlass: a.name, empfaenger: a.empfaenger() })); }
}
