/**
 * Repo für PostgreSQL (#1278): Hier wird das Repo aus seinen Teilen zusammengesetzt – je Fachgebiet eine Datei in
 * diesem Ordner, jeder Teil eine Fabrik, die den gemeinsamen Kontext (`kontext.ts`) bekommt.
 */
import type postgres from 'postgres';
import type { Repo } from '..';
import { pgKontext } from './kontext';
import type { Sql } from './sql';
import { pgAblaeufe, pgAblaufvorlagen } from './ablaeufe';
import { pgAufgaben, pgFaelle } from './aufgaben';
import { pgAuskunft } from './auskunft';
import { pgDemo } from './demo';
import { pgDateien, pgDokumente, pgVersionen } from './dokumente';
import { pgErkennung } from './erkennung';
import { pgEreignisse, pgKatalog } from './ereignisse';
import { pgFassungen } from './fassungen';
import { pgFavoriten } from './favoriten';
import { pgGeheimnisse } from './geheimnisse';
import { pgHistorie, pgUebertragen } from './historie';
import { pgMappenLesen, pgMappenSchreiben, pgMappenTitel, pgSystemmappen, pgVerweise } from './mappen';
import { pgNotfallkontakte } from './notfallkontakte';
import { pgNotizen } from './notizen';
import { pgNummern } from './nummern';
import { pgPakete, pgPaketVerlauf } from './pakete';
import { pgDokumentPapierkorb, pgLoeschprotokoll, pgPapierkorb } from './papierkorb';
import { pgKlauseln, pgSeite, pgZaehler } from './seite';
import { pgSichten } from './sichten';
import { pgTexterkennung, pgVolltext } from './texterkennung';
import { pgPassung, pgTypen } from './typen';
import { pgSynonyme, pgWoerter } from './woerter';

export { DOKUMENT_SPALTEN, MAPPEN_SPALTEN, STATISTIK_SPALTEN } from './spalten';
export { ohneWarten } from './sql';

/**
 * Verbindung einer laufenden Transaktion, die sich wie `sql` benutzen lässt (#404): `begin` wird dort
 * zum Sicherungspunkt, damit die Methoden des Repos unverändert auch in einer Transaktion laufen.
 */
function inTransaktion(tx: postgres.TransactionSql): Sql {
  return new Proxy(tx, {
    get(ziel, prop, empfaenger) {
      if (prop === 'begin')
        return (...args: unknown[]) => ziel.savepoint(args[args.length - 1] as (s: postgres.TransactionSql) => Promise<unknown>);
      return Reflect.get(ziel, prop, empfaenger);
    },
  }) as unknown as Sql;
}

/**
 * PostgreSQL-Umsetzung für genau einen Haushalt.
 *
 * `imTx`: Repo innerhalb einer Transaktion – dort nie aus dem Lesespeicher (#741), denn die Transaktion sieht ihre
 * eigenen, noch nicht abgeschlossenen Änderungen, der Haushaltsstand zählt aber erst beim Abschluss.
 */
export function pgRepo(sql: Sql, haushaltId: string, imTx = false): Repo {
  const k = pgKontext(sql, haushaltId, imTx);
  return {
    transaktion(f) {
      return sql.begin((tx) => f(pgRepo(inTransaktion(tx), haushaltId, true))) as Promise<Awaited<ReturnType<typeof f>>>;
    },
    ...pgTypen(k),
    ...pgPassung(k),
    ...pgSichten(k),
    ...pgMappenLesen(k),
    ...pgMappenSchreiben(k),
    ...pgMappenTitel(k),
    ...pgSystemmappen(k),
    ...pgVerweise(k),
    ...pgSeite(k),
    ...pgZaehler(k),
    ...pgKlauseln(k),
    ...pgPakete(k),
    ...pgPaketVerlauf(k),
    ...pgEreignisse(k),
    ...pgKatalog(k),
    ...pgNummern(k),
    ...pgDokumente(k),
    ...pgVersionen(k),
    ...pgDateien(k),
    ...pgFavoriten(k),
    ...pgAuskunft(k),
    ...pgNotfallkontakte(k),
    ...pgPapierkorb(k),
    ...pgDokumentPapierkorb(k),
    ...pgLoeschprotokoll(k),
    ...pgDemo(k),
    ...pgTexterkennung(k),
    ...pgVolltext(k),
    ...pgErkennung(k),
    ...pgWoerter(k),
    ...pgSynonyme(k),
    ...pgAufgaben(k),
    ...pgFaelle(k),
    ...pgGeheimnisse(k),
    ...pgAblaeufe(k),
    ...pgAblaufvorlagen(k),
    ...pgNotizen(k),
    ...pgHistorie(k),
    ...pgUebertragen(k),
    ...pgFassungen(k),
  };
}
