import { randomUUID } from 'node:crypto';
import { Fachfehler } from './fehler';

/**
 * Lange Arbeiten (z. B. tausende Demo-Mappen) laufen im Hintergrund, damit ein
 * Reverse-Proxy die Anfrage nicht nach seiner Wartezeit abbricht (Fehler 504).
 * Die Oberfläche fragt den Stand regelmäßig ab. Es läuft immer nur ein Auftrag.
 */
export interface Auftrag {
  id: string;
  art: string;
  titel: string;
  status: 'laeuft' | 'fertig' | 'fehler';
  fertig: number;
  gesamt: number;
  gestartet: string;
  beendet?: string;
  ergebnis?: unknown;
  fehler?: string;
}

export class Auftraege {
  private letzter?: Auftrag;

  constructor(private log: (m: string) => void = () => {}) {}

  aktuell(): Auftrag | null { return this.letzter ?? null; }

  starte(art: string, titel: string, arbeit: (fortschritt: (fertig: number, gesamt: number) => void) => Promise<unknown>): Auftrag {
    if (this.letzter?.status === 'laeuft') throw new Fachfehler(409, `Es läuft bereits: ${this.letzter.titel}. Bitte warten, bis das fertig ist.`);
    const a: Auftrag = { id: randomUUID(), art, titel, status: 'laeuft', fertig: 0, gesamt: 0, gestartet: new Date().toISOString() };
    this.letzter = a;
    const beginn = Date.now();
    void (async () => {
      try {
        a.ergebnis = await arbeit((fertig, gesamt) => { a.fertig = fertig; a.gesamt = gesamt; });
        a.status = 'fertig';
        this.log(`${titel}: fertig nach ${Date.now() - beginn} ms`);
      } catch (e) {
        a.status = 'fehler';
        a.fehler = e instanceof Error ? e.message : String(e);
        this.log(`${titel}: Fehler – ${a.fehler}`);
      } finally {
        a.beendet = new Date().toISOString();
      }
    })();
    return a;
  }

  /** Wartet, bis der aktuelle Auftrag beendet ist (für Tests). */
  async warte(): Promise<Auftrag | null> {
    while (this.letzter?.status === 'laeuft') await new Promise((r) => setTimeout(r, 10));
    return this.aktuell();
  }
}
