import { randomUUID } from 'node:crypto';
import { Fachfehler } from './fehler';
import { meldeFortschritt, neuerStand, schliessePhasen, type Auftrag, type Fortschritt, type PhasenPlan } from '../../shared/src/auftrag';

export type { Auftrag, AuftragPhase, Fortschritt, PhasenPlan } from '../../shared/src/auftrag';

/**
 * Lange Arbeiten (z. B. tausende Demo-Mappen) laufen im Hintergrund, damit ein
 * Reverse-Proxy die Anfrage nicht nach seiner Wartezeit abbricht (Fehler 504).
 * Die Oberfläche fragt den Stand regelmäßig ab. Es läuft immer nur ein Auftrag.
 * Seit #364 mit Phasen und Einheit (`phasen`), `fertig`/`gesamt` sind die Summe.
 */
export class Auftraege {
  private letzter?: Auftrag;

  constructor(private log: (m: string) => void = () => {}) {}

  aktuell(): Auftrag | null { return this.letzter ?? null; }

  starte(art: string, titel: string, arbeit: (fortschritt: Fortschritt) => Promise<unknown>, phasen: PhasenPlan[] = []): Auftrag {
    if (this.letzter?.status === 'laeuft') throw new Fachfehler(409, `Es läuft bereits: ${this.letzter.titel}. Bitte warten, bis das fertig ist.`);
    const a: Auftrag = { id: randomUUID(), art, titel, status: 'laeuft', ...neuerStand(phasen), gestartet: new Date().toISOString() };
    this.letzter = a;
    const beginn = Date.now();
    void (async () => {
      try {
        a.ergebnis = await arbeit((fertig, gesamt, phase) => meldeFortschritt(a, fertig, gesamt, phase));
        a.status = 'fertig';
        schliessePhasen(a);
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
