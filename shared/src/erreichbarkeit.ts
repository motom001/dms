/**
 * Erreichbarkeit des DMS aus Sicht der Oberfläche (#122).
 *
 * Fällt der Server weg (Update, Neustart), antwortet der Reverse Proxy mit 502/503/504 oder der
 * Browser erreicht gar nichts. Statt „Fehler 502“ an jeder Stelle zeigt die Oberfläche dann eine
 * Leiste, fragt mit wachsendem Abstand nach und meldet, wenn das DMS wieder da ist. Läuft danach
 * ein anderer Stand (Version, Commit, Build), soll die Seite neu geladen werden.
 *
 * Hier steckt nur die Logik; Zeit, Timer und Abfrage kommen von außen (testbar ohne Browser).
 */

export type Stufe = 'ok' | 'weg' | 'zurueck';
export interface ErreichbarkeitsZustand {
  stufe: Stufe;
  /** Zeitpunkt (ms) des nächsten Versuchs, solange das DMS weg ist. */
  naechsterVersuch: number | null;
  /** Der Server läuft mit einem anderen Stand als beim Laden der Seite. */
  neueVersion: boolean;
}

export interface Gesundheit { ok?: boolean; stand?: string }
export interface Umgebung {
  /** GET /api/gesundheit; null, wenn das DMS nicht geantwortet hat. */
  gesundheit(): Promise<Gesundheit | null>;
  jetzt(): number;
  spaeter(f: () => void, ms: number): unknown;
  abbrechen(t: unknown): void;
}

/** So lange bleibt „Wieder erreichbar“ stehen. */
export const ZURUECK_MS = 8000;
/** Beim Zurückkehren ins Fenster höchstens so oft nachsehen, ob ein neuer Stand läuft. */
export const PRUEF_ABSTAND_MS = 60_000;
/** 2, 4, 8, 16, 30, 30 … Sekunden. */
export const wartezeit = (versuch: number) => Math.min(30_000, 2000 * 2 ** versuch);

/**
 * Kam die Antwort nicht vom DMS? Status 0 heißt: keine Verbindung. 502/503/504 ohne die
 * JSON-Antwort des DMS ({ fehler }) kommen vom Proxy – die 503 des Wartungsmodus bringt eine mit.
 */
export function istAusfall(status: number, daten: unknown): boolean {
  if (status === 0) return true;
  if (status !== 502 && status !== 503 && status !== 504) return false;
  return !(daten && typeof daten === 'object' && 'fehler' in daten);
}

export class Erreichbarkeit {
  private z: ErreichbarkeitsZustand = { stufe: 'ok', naechsterVersuch: null, neueVersion: false };
  /** Stand beim Laden der Seite. */
  private stand: string | null = null;
  private versuch = 0;
  private timer: unknown = null;
  private laeuft: Promise<void> | null = null;
  private zuletzt = Number.NEGATIVE_INFINITY;
  private hoerer = new Set<() => void>();

  constructor(private u: Umgebung, private wiederDa: () => void = () => {}) {}

  get zustand(): ErreichbarkeitsZustand { return this.z; }
  /** Für useSyncExternalStore. */
  abonniere = (h: () => void) => { this.hoerer.add(h); return () => { this.hoerer.delete(h); }; };

  private setze(n: Partial<ErreichbarkeitsZustand>) {
    this.z = { ...this.z, ...n };
    for (const h of this.hoerer) h();
  }
  private stoppe() {
    if (this.timer !== null) this.u.abbrechen(this.timer);
    this.timer = null;
  }
  private plane() {
    this.stoppe();
    const ms = wartezeit(this.versuch);
    this.setze({ naechsterVersuch: this.u.jetzt() + ms });
    this.timer = this.u.spaeter(() => { this.timer = null; void this.pruefe(); }, ms);
  }

  /** Eine Anfrage hat das DMS nicht erreicht. */
  ausfall() {
    if (this.z.stufe === 'weg') return;
    this.versuch = 0;
    this.setze({ stufe: 'weg' });
    this.plane();
  }

  /** Eine Anfrage kam beim DMS an: Läuft gerade ein Ausfall, sofort nachsehen. */
  antwort() {
    if (this.z.stufe === 'weg') void this.pruefe();
  }

  /** Ein Teil der Oberfläche ließ sich nicht nachladen – die Dateien gehören zu einem älteren Stand. */
  veraltet() {
    if (!this.z.neueVersion) this.setze({ neueVersion: true });
  }

  /** Fenster wieder im Vordergrund, Netz wieder da: nachsehen, wenn es länger her ist. */
  bedarf() {
    if (this.z.stufe === 'weg' || this.u.jetzt() - this.zuletzt >= PRUEF_ABSTAND_MS) void this.pruefe();
  }

  /** „Wieder erreichbar“ ausblenden. */
  schliessen() {
    if (this.z.stufe !== 'zurueck') return;
    this.stoppe();
    this.setze({ stufe: 'ok' });
  }

  /** Jetzt nachsehen (auch „Jetzt prüfen“); gleichzeitige Aufrufe teilen sich eine Abfrage. */
  pruefe(): Promise<void> {
    this.laeuft ??= this.pruefeJetzt().finally(() => { this.laeuft = null; });
    return this.laeuft;
  }

  private async pruefeJetzt() {
    const g = await this.u.gesundheit().catch(() => null);
    this.zuletzt = this.u.jetzt();
    if (!g?.ok) {
      if (this.z.stufe === 'weg') { this.versuch++; this.plane(); } else this.ausfall();
      return;
    }
    if (g.stand) {
      if (this.stand === null) this.stand = g.stand;
      else if (g.stand !== this.stand && !this.z.neueVersion) this.setze({ neueVersion: true });
    }
    if (this.z.stufe !== 'weg') return;
    this.stoppe();
    this.versuch = 0;
    this.setze({ stufe: 'zurueck', naechsterVersuch: null });
    this.wiederDa();
    this.timer = this.u.spaeter(() => { this.timer = null; if (this.z.stufe === 'zurueck') this.setze({ stufe: 'ok' }); }, ZURUECK_MS);
  }
}
