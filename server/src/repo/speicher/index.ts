/**
 * Repo im Arbeitsspeicher (#1278) – für Tests und Oberflächenproben, nicht für den Betrieb. Zusammengesetzt wie das
 * PostgreSQL-Repo (`../pg/index.ts`): je Fachgebiet eine Datei, jeder Teil eine Fabrik über den gemeinsamen Zustand
 * (`kontext.ts`). Beide müssen sich gleich verhalten.
 */
import type { Repo } from '..';
import { schnappschuss, speicherKontext } from './kontext';
import { speicherAblaeufe, speicherAblaufvorlagen } from './ablaeufe';
import { speicherAufgaben, speicherFaelle } from './aufgaben';
import { speicherAuskunft } from './auskunft';
import { speicherDemo } from './demo';
import { speicherDateien, speicherDokumente, speicherVersionen } from './dokumente';
import { speicherEreignisse, speicherKatalog } from './ereignisse';
import { speicherErkennung } from './erkennung';
import { speicherFassungen } from './fassungen';
import { speicherFavoriten } from './favoriten';
import { speicherGeheimnisse } from './geheimnisse';
import { speicherHistorie, speicherUebertragen } from './historie';
import { speicherMappenLesen, speicherMappenSchreiben, speicherMappenTitel, speicherSystemmappen, speicherVerweise } from './mappen';
import { speicherNotfallkontakte } from './notfallkontakte';
import { speicherNotizen } from './notizen';
import { speicherNummern } from './nummern';
import { speicherPakete, speicherPaketVerlauf } from './pakete';
import { speicherDokumentPapierkorb, speicherLoeschprotokoll, speicherPapierkorb } from './papierkorb';
import { speicherKlauseln, speicherSeite, speicherZaehler } from './seite';
import { speicherSichten } from './sichten';
import { speicherTexterkennung, speicherVolltext } from './texterkennung';
import { speicherPassung, speicherTypen } from './typen';
import { speicherSynonyme, speicherWoerter } from './woerter';

/** Repo im Arbeitsspeicher – für Tests und Oberflächenproben, nicht für den Betrieb. */
export function speicherRepo(): Repo {
  const sp = speicherKontext();
  return {
    // Wie PostgreSQL (#1385): scheitert die Transaktion, ist der Speicher danach wie vorher.
    async transaktion(f) {
      const zurueck = schnappschuss(sp);
      try {
        return await f(this);
      } catch (e) {
        zurueck();
        throw e;
      }
    },
    ...speicherTypen(sp),
    ...speicherPassung(sp),
    ...speicherSichten(sp),
    ...speicherMappenLesen(sp),
    ...speicherMappenSchreiben(sp),
    ...speicherMappenTitel(sp),
    ...speicherSystemmappen(sp),
    ...speicherVerweise(sp),
    ...speicherSeite(sp),
    ...speicherZaehler(sp),
    ...speicherKlauseln(sp),
    ...speicherPakete(sp),
    ...speicherPaketVerlauf(sp),
    ...speicherEreignisse(sp),
    ...speicherKatalog(sp),
    ...speicherNummern(sp),
    ...speicherDokumente(sp),
    ...speicherVersionen(sp),
    ...speicherDateien(sp),
    ...speicherFavoriten(sp),
    ...speicherAuskunft(sp),
    ...speicherNotfallkontakte(sp),
    ...speicherPapierkorb(sp),
    ...speicherDokumentPapierkorb(sp),
    ...speicherLoeschprotokoll(sp),
    ...speicherDemo(sp),
    ...speicherTexterkennung(sp),
    ...speicherVolltext(sp),
    ...speicherErkennung(sp),
    ...speicherWoerter(sp),
    ...speicherSynonyme(sp),
    ...speicherAufgaben(sp),
    ...speicherFaelle(sp),
    ...speicherGeheimnisse(sp),
    ...speicherAblaeufe(sp),
    ...speicherAblaufvorlagen(sp),
    ...speicherNotizen(sp),
    ...speicherHistorie(sp),
    ...speicherUebertragen(sp),
    ...speicherFassungen(sp),
  };
}
