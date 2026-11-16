/**
 * Schnittstelle des Repos (#1278: nach Fachgebiet aufgeteilt, die Tür bleibt hier). `Repo` setzt die
 * Teil-Schnittstellen aus `schnittstelle/` zusammen; Typen, Fehler und Hilfen stehen in `schnittstelle/typen.ts`.
 * Importe von `…/repo` bleiben gleich. Umgesetzt in `pg/` (PostgreSQL) und `speicher/` (Arbeitsspeicher, Tests).
 */
import type { RepoAufgaben } from './schnittstelle/aufgaben';
import type { RepoDokumente } from './schnittstelle/dokumente';
import type { RepoMappen } from './schnittstelle/mappen';
import type { RepoPakete } from './schnittstelle/pakete';
import type { RepoPapierkorb } from './schnittstelle/papierkorb';
import type { RepoVolltext } from './schnittstelle/volltext';

export * from './schnittstelle/typen';

/**
 * Ein Teil eines Repos (#1278): Methoden eines Fachgebiets, zusammengesetzt in `pg/index.ts` bzw. `speicher/index.ts`.
 * `this` ist dort das ganze Repo.
 */
export type RepoTeil = Partial<Repo> & ThisType<Repo>;

export interface Repo extends RepoMappen, RepoPakete, RepoDokumente, RepoPapierkorb, RepoVolltext, RepoAufgaben {
  /**
   * Mehrere Änderungen ganz oder gar nicht (#404), z. B. eine Änderung samt Ereignis im Ausgangskorb:
   * `f` bekommt ein Repo, das in der Transaktion arbeitet. Im Speicher-Repo (Tests) ohne Zurückrollen.
   */
  transaktion<T>(f: (repo: Repo) => Promise<T>): Promise<T>;
}
