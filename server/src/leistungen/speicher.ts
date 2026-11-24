/**
 * Wo die Aufträge an Leistungen liegen (#1569): in der Datenbank (`pg.ts`, Tabelle `leistungsauftraege`), in Tests im
 * Arbeitsspeicher (hier). Mehrere Prozesse nehmen sich Aufträge mit Sperre (SKIP LOCKED) und einer Frist: Stirbt ein
 * Prozess, wird sein Auftrag nach Ablauf der Frist wieder frei – außer Aufträgen mit Wirkung nach außen, die werden
 * „unterbrochen“ (eine Mail ging vielleicht schon raus).
 */
import type { Auftragszustand, Fehlercode, Leistungsname, Ziel } from '../../../shared/src/leistungen';

/** Wer gefragt hat – so, wie der Zugriff daraus wieder entsteht. Ohne `ich`: Ablago selbst. */
export interface Fragender {
  art: 'person' | 'ablago' | 'paket' | 'automatisierung';
  ich?: { id: string; rolle: string; art?: 'dienst' | 'system'; paketId?: string; systemkonto?: string };
}

export interface Auftragszeile {
  id: string;
  leistung: Leistungsname;
  art: 'direkt' | 'hintergrund';
  zustand: Auftragszustand;
  /** Nur solange offen; abgeschlossene Aufträge behalten keine Inhalte. */
  eingabe: Record<string, unknown> | null;
  kontext: unknown;
  ziel: Ziel | null;
  wer: Fragender;
  /** Wirkt nach außen (`ergebnis: wirkung`): nach einem Neustart nicht wiederholen. */
  wirkung: boolean;
  zeitgrenzeS: number;
  anbieter: string | null;
  daten: Record<string, unknown> | null;
  dokument: string | null;
  fehler: { code: Fehlercode; text: string } | null;
  versuche: number;
  erstellt: string;
  begonnen: string | null;
  beendet: string | null;
}

type NeuerAuftrag = Pick<
  Auftragszeile,
  'id' | 'leistung' | 'art' | 'zustand' | 'eingabe' | 'kontext' | 'ziel' | 'wer' | 'wirkung' | 'zeitgrenzeS'
> &
  Partial<Pick<Auftragszeile, 'anbieter'>>;
type Abschluss = Pick<Auftragszeile, 'zustand'> & Partial<Pick<Auftragszeile, 'anbieter' | 'daten' | 'dokument' | 'fehler'>>;

export interface Auftragsspeicher {
  lege(a: NeuerAuftrag): Promise<void>;
  hole(id: string): Promise<Auftragszeile | undefined>;
  /** Den nächsten freien Auftrag nehmen (wartend oder mit abgelaufener Frist, ohne Wirkung). */
  naechster(): Promise<Auftragszeile | undefined>;
  /** Abschließen oder zurück auf „wartet“; abgeschlossen ohne Eingabe. */
  setze(id: string, s: Abschluss): Promise<void>;
  /** Beim Start: laufende zurück auf „wartet“, mit Wirkung auf „unterbrochen“. */
  zurueckstellen(): Promise<{ wiederholt: number; unterbrochen: number }>;
  /** Laufende mit Wirkung, deren Frist abgelaufen ist (Prozess gestorben): „unterbrochen“. */
  fristUnterbrechen(): Promise<number>;
  /** Abgeschlossene, die älter als so viele Stunden sind, löschen. */
  raeumeAuf(stunden: number): Promise<number>;
}

/** Frist eines laufenden Auftrags: Zeitgrenze und eine Minute Luft. */
const fristMs = (zeitgrenzeS: number) => (zeitgrenzeS + 60) * 1000;
const ABGESCHLOSSEN: readonly Auftragszustand[] = ['fertig', 'fehlgeschlagen', 'unterbrochen'];

/** Im Arbeitsspeicher (Tests). `jetzt` ist einstellbar. */
export function speicherAuftraege(jetzt: () => number = Date.now): Auftragsspeicher & { alle(): Auftragszeile[] } {
  const m = new Map<string, Auftragszeile & { bis: number }>();
  const iso = () => new Date(jetzt()).toISOString();
  return {
    alle: () => [...m.values()].map(({ bis: _, ...z }) => structuredClone(z)),
    async lege(a) {
      m.set(a.id, {
        anbieter: null,
        ...structuredClone(a),
        daten: null,
        dokument: null,
        fehler: null,
        versuche: 0,
        erstellt: iso(),
        begonnen: a.zustand === 'laeuft' ? iso() : null,
        beendet: null,
        bis: a.zustand === 'laeuft' ? jetzt() + fristMs(a.zeitgrenzeS) : 0,
      });
    },
    async hole(id) {
      const z = m.get(id);
      if (!z) return undefined;
      const { bis: _, ...rest } = z;
      return structuredClone(rest);
    },
    async naechster() {
      const frei = [...m.values()].find((z) => z.zustand === 'wartet' || (z.zustand === 'laeuft' && !z.wirkung && z.bis < jetzt()));
      if (!frei) return undefined;
      Object.assign(frei, { zustand: 'laeuft', begonnen: iso(), versuche: frei.versuche + 1, bis: jetzt() + fristMs(frei.zeitgrenzeS) });
      return this.hole(frei.id);
    },
    async setze(id, s) {
      const z = m.get(id);
      if (!z) return;
      const fertig = ABGESCHLOSSEN.includes(s.zustand);
      Object.assign(z, structuredClone(s), fertig ? { eingabe: null, beendet: iso() } : {});
    },
    async zurueckstellen() {
      let wiederholt = 0;
      let unterbrochen = 0;
      for (const z of m.values()) {
        if (z.zustand !== 'laeuft') continue;
        if (z.wirkung) {
          Object.assign(z, { zustand: 'unterbrochen', eingabe: null, beendet: iso() });
          unterbrochen++;
        } else {
          z.zustand = 'wartet';
          wiederholt++;
        }
      }
      return { wiederholt, unterbrochen };
    },
    async fristUnterbrechen() {
      let n = 0;
      for (const z of m.values())
        if (z.zustand === 'laeuft' && z.wirkung && z.bis < jetzt()) {
          Object.assign(z, { zustand: 'unterbrochen', eingabe: null, beendet: iso() });
          n++;
        }
      return n;
    },
    async raeumeAuf(stunden) {
      const grenze = jetzt() - stunden * 3_600_000;
      let n = 0;
      for (const [id, z] of m)
        if (z.beendet && Date.parse(z.beendet) < grenze) {
          m.delete(id);
          n++;
        }
      return n;
    },
  };
}
