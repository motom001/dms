import { entferneSprache, registriereSprache } from '../../shared/src/sprache';
import { DEUTSCH } from '../../shared/src/deutsch';
import { abdeckung, passendeTexte, type Abdeckung, type SprachpaketInfo, type Sprachtexte } from '../../shared/src/sprachpaket';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import type { SprachpaketDaten } from './repo';
import { protokoll } from './protokoll';

const log = protokoll.modul('werkbank');

/**
 * Sprachpakete laden (#731): Die Texte installierter Sprachpakete stehen in der Datenbank (Tabelle paket_sprachen). Jeder
 * Prozess trägt sie beim Start und danach mit der Einstellung „sprachen“ jede Minute neu ein (`SprachDienst.lade`), aber
 * nur, wenn sich die installierten Sprachpakete geändert haben. Der Prozess, der installiert oder entfernt, lädt sofort.
 *
 * Was nach einem Update von Ablago nicht mehr passt (Schlüssel weg, andere Platzhalter), fällt beim Laden weg; die Texte
 * erscheinen dann auf Englisch, sonst auf Deutsch (Rückfall aus shared/src/sprache.ts).
 */
export interface SprachpaketQuelle {
  pakete(): Promise<InstalliertesPaket[]>;
  sprachpakete(): Promise<Array<SprachpaketDaten & { paketId: string }>>;
  /** Wie viele aktive Personen diese Sprache gewählt haben (Werkbank → Sprachen). */
  personen?(kennung: string): Promise<number>;
}

/** Ein installiertes Sprachpaket für Werkbank → Sprachen. */
export interface SprachpaketStand extends SprachpaketInfo {
  paket: string;
  name: string;
  version: string;
  /** Abdeckung gegen diese Ablago-Version. */
  abdeckung: Abdeckung;
  /** Aktive Personen, die die Sprache gewählt haben. */
  personen: number;
}

/** Texte einer Sprache für die Oberfläche (GET /api/sprache/texte/:kennung). */
export interface SprachTexteAntwort {
  kennung: string;
  gebietsschema: string;
  maschinell: boolean;
  texte: Sprachtexte;
}

interface Geladen {
  paket: InstalliertesPaket;
  info: SprachpaketInfo;
  texte: Sprachtexte;
  abdeckung: Abdeckung;
}

export class Sprachpakete {
  private stempel: string | null = null;
  private geladen = new Map<string, Geladen>();
  constructor(private q: SprachpaketQuelle) {}

  /** Trägt die Sprachen der installierten Sprachpakete ein; true, wenn sich etwas geändert hat. */
  async lade(erzwingen = false): Promise<boolean> {
    const pakete = (await this.q.pakete()).filter((p) => p.sprache);
    const stempel = pakete.map((p) => `${p.id}@${p.version}`).join(',');
    if (!erzwingen && stempel === this.stempel) return false;
    const daten = pakete.length ? await this.q.sprachpakete() : [];
    for (const k of this.geladen.keys()) entferneSprache(k);
    this.geladen.clear();
    for (const p of pakete) {
      const d = daten.find((x) => x.paketId === p.id);
      if (!d || !p.sprache || this.geladen.has(p.sprache.kennung)) continue;
      const texte = passendeTexte(DEUTSCH, d.texte);
      registriereSprache(p.sprache.kennung, texte, { maschinell: p.sprache.maschinell, gebietsschema: p.sprache.gebietsschema });
      this.geladen.set(p.sprache.kennung, { paket: p, info: p.sprache, texte, abdeckung: abdeckung(DEUTSCH, texte) });
    }
    if (this.stempel !== null || pakete.length) log.info('Sprachpakete geladen', { sprachen: [...this.geladen.keys()].join(', ') || '–' });
    this.stempel = stempel;
    return true;
  }

  /** Abdeckung einer geladenen Sprache in Prozent; null, wenn kein Sprachpaket sie bringt. */
  abdeckung(kennung: string): number | null {
    return this.geladen.get(kennung)?.abdeckung.prozent ?? null;
  }

  /** Kennungen der geladenen Sprachpakete. */
  kennungen(): string[] {
    return [...this.geladen.keys()];
  }

  /** Texte einer Sprache aus einem Sprachpaket; null, wenn es keins dafür gibt. */
  texte(kennung: string): SprachTexteAntwort | null {
    const g = this.geladen.get(kennung);
    return g ? { kennung, gebietsschema: g.info.gebietsschema, maschinell: g.info.maschinell, texte: g.texte } : null;
  }

  /** Stand für die Werkbank. */
  async stand(): Promise<SprachpaketStand[]> {
    return Promise.all(
      [...this.geladen.values()].map(async (g) => ({
        ...g.info,
        paket: g.paket.id,
        name: g.paket.name,
        version: g.paket.version,
        abdeckung: g.abdeckung,
        personen: (await this.q.personen?.(g.info.kennung).catch(() => 0)) ?? 0,
      })),
    );
  }
}
