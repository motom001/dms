/**
 * Hauptversion von PostgreSQL beim Start (#1464).
 *
 * - **Getestet** wird nur noch mit PostgreSQL 18 (Entscheidung Thomas 21.11.2026, #1544): CI, Vorlagen und
 *   dms-komplett.
 * - **Mindestens 16:** Ablago nutzt keine Funktion, die erst 17 oder 18 mitbringen; auf 16 laufen die Entwicklung und
 *   die Messungen im Entwicklerhandbuch (Leistung), auf 17 bis 0.305 alle automatischen Tests. 15 und älter hat nie
 *   jemand geprüft – dort lehnt Ablago ab, statt später mit einem schwer verständlichen Fehler mitten im Betrieb.
 * - 16 und 17 starten, mit einem Hinweis im Protokoll: Umzug auf 18 über Sicherung und Wiederherstellung.
 */
import type postgres from 'postgres';
import { t } from '../sprache/sprache';

export const PG_MINDESTVERSION = 16;
export const PG_GETESTET = 18;

/** Datenbank mit einer zu alten Hauptversion – an `name` erkennt die Startseite den Fall (startfehler.ts). */
export class ZuAlteDatenbankFehler extends Error {
  constructor(readonly haupt: number) {
    super(t('meldungen.db.pg-zu-alt', { haupt, mindestens: PG_MINDESTVERSION, getestet: PG_GETESTET }));
    this.name = 'ZuAlteDatenbankFehler';
  }
}

/** `server_version_num` (z. B. 180001, 170012, 90624) → Hauptversion (18, 17, 9). */
export function hauptversion(num: string | number): number {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / 10000);
}

/** Urteil zur Hauptversion: zu alt (Abbruch), ungetestet (Hinweis) oder in Ordnung. */
export function pgUrteil(haupt: number): 'zu-alt' | 'ungetestet' | 'ok' {
  if (haupt < PG_MINDESTVERSION) return 'zu-alt';
  return haupt === PG_GETESTET ? 'ok' : 'ungetestet';
}

/**
 * Liest die Hauptversion und lehnt zu alte ab (vor den Migrationen, damit keine halbe Datenbank entsteht). Andere
 * als die getestete melden `hinweis` – älter: Umzug empfohlen; neuer: noch nicht geprüft.
 */
export async function pruefePgVersion(sql: postgres.Sql, hinweis: (text: string) => void): Promise<number> {
  const [{ v }] = await sql<{ v: string }[]>`SELECT current_setting('server_version_num') AS v`;
  const haupt = hauptversion(v);
  const urteil = pgUrteil(haupt);
  if (urteil === 'zu-alt') throw new ZuAlteDatenbankFehler(haupt);
  if (urteil === 'ungetestet')
    hinweis(
      t(haupt < PG_GETESTET ? 'meldungen.db.pg-aelter' : 'meldungen.db.pg-neuer', {
        haupt,
        mindestens: PG_MINDESTVERSION,
        getestet: PG_GETESTET,
      }),
    );
  return haupt;
}
