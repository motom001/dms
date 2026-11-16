/**
 * Konten-Ablage (#1278: aufgeteilt, die Tür bleibt hier): Schnittstelle und Hilfen in `konto-repo-schnittstelle.ts`,
 * Arbeitsspeicher (Tests) in `konto-repo-speicher.ts`, PostgreSQL in `konto-repo-pg.ts`.
 */
export {
  dienstEmail,
  systemEmail,
  zuletztListe,
  ZULETZT_RUHE_MS,
  type KontoRepo,
  type Link,
  type NeuerBenutzer,
  type Schutzpruefung,
  type SitzungIntern,
  type SitzungsInfo,
  type SitzungsVerwaltung,
  type ZuletztEintrag,
  type Zweck,
} from './konto-repo-schnittstelle';
export { speicherKontoRepo } from './konto-repo-speicher';
export { pgKontoRepo } from './konto-repo-pg';
