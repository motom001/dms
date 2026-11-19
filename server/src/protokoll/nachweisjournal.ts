/**
 * Nachweis-Journal (#1053): was für die Nachweise eines Monats sonst nirgends dauerhaft steht – Fehlanmeldungen,
 * Rechteänderungen, Updates und Paket-Verlauf, Wartungszeiten, Läufe von „Alle Dateien prüfen“, geleerter Papierkorb,
 * erzeugte Datenschutzauskünfte, fehlgeschlagene Sicherungen (#1308). Das Protokoll hält nur 24 Stunden.
 *
 * Abgelegt in den Tabellen `nachweis_journal` (je Eintrag eine Zeile) und `nachweis_zaehler` (Migration 118, Teil der
 * Sicherung). Bis #1253 stand jeder Monat als ein JSON-Wert `nachweise:JJJJ-MM` in den Einstellungen: Jede
 * Fehlanmeldung las, kopierte und schrieb den ganzen Monat (bis 2000 Einträge) und verlor bei vielen gleichzeitigen
 * Versuchen Einträge. Jetzt kostet ein Eintrag eine Anweisung (Zähler hochzählen und, solange unter der Grenze,
 * einfügen); ein unbekanntes Konto nur das Hochzählen. Die alten Werte übernimmt der Server beim ersten Zugriff.
 *
 * Je Monat höchstens `JE_MONAT` Einträge, danach nur noch gezählt („weitere“); nach `MONATE` Monaten fällt ein Monat
 * weg. Was sich wiederholen kann (fehlgeschlagene Sicherungen, #1308), steht als **ein** Eintrag je Tag und Merkmalen
 * mit Anzahl ({@link Nachweisjournal.vermerkeJeTag}): Ein Zeitplan, der jede Nacht scheitert, flutet das Journal nicht. Nie Geheimnisse, nie volle IP-Adressen (Ergänzung Sicherheit: IPv4 /24, IPv6 /48 und „Heimnetz/außen“;
 * unbekannte Konten nur als Anzahl).
 *
 * Fehlanmeldungen gesammelt (#1415): Jede Fehlanmeldung zählte eine Zeile je Monat hoch (Versuche bzw. unbekannte
 * Konten). Bei vielen gleichzeitigen Versuchen warteten alle auf diese eine Zeile und belegten dabei Verbindungen, die
 * den übrigen Anfragen fehlten (auf dem NAS fast die ganze Rechenzeit der Datenbank). Im Betrieb sammelt jeder Prozess
 * Fehlanmeldungen darum bis zu `SAMMELN_MS` (oder bis `SAMMELN_HOECHSTENS`) und schreibt sie in **einer** Anweisung:
 * Zähler um die Anzahl hochzählen, Einträge einfügen, solange der Monat unter der Grenze bleibt. Neu ist nur diese
 * Verzögerung: Andere Prozesse sehen eine Fehlanmeldung bis zu `SAMMELN_MS` später, der eigene beim Lesen sofort
 * (`monat` schreibt vorher, was gesammelt ist). Beim Beenden schreibt `leeren` den Rest; nur ein Absturz verliert die
 * Fehlanmeldungen der letzten Sekunden dieses Prozesses (vorher die gerade laufenden Anweisungen). Mehrere Prozesse
 * zählen zusammen richtig – jede Anweisung zählt atomar um ihre Anzahl hoch.
 */
import type postgres from 'postgres';
import { kuerzeIp, istPrivat } from '../datenschutz/abruf';
import { eigeneGateways } from '../http/gateway';
import { ohneGeheimnisse } from '../geheimnisse/geheimnis-sperre';
import { protokoll } from './protokoll';
import type { Einstellungen } from '../einstellungen/einstellungen';
import type { PaketdatenWert } from '../../../shared/src/paketdaten';

const log = protokoll.modul('system');

/** „Heimnetz“ im Nachweis (#1053): private Adresse, aber kein Gateway des eigenen Netzes (#1355, nicht bestimmbar). */
const heimnetzAngabe = (ip: string) => istPrivat(ip) && !eigeneGateways.ist(ip);

/** Arten im Journal – die Kennung ist zugleich die Kennung des Nachweises. */
export type JournalArt =
  | 'zugang.fehlanmeldung'
  | 'zugang.rechte'
  | 'betrieb.update'
  | 'betrieb.paket'
  | 'betrieb.wartung'
  | 'unveraenderbarkeit.pruefung'
  | 'datenschutz.auskunft'
  | 'datenschutz.papierkorb'
  | 'sicherung.fehlgeschlagen';
/** Nur gezählt (ohne Einzelheiten): Fehlanmeldungen mit unbekanntem Konto. */
export type JournalZaehler = 'zugang.fehlanmeldung_unbekannt';

export interface JournalEintrag {
  art: JournalArt;
  zeit: string;
  daten: Record<string, PaketdatenWert>;
}
export interface JournalMonat {
  eintraege: JournalEintrag[];
  weitere: number;
  zaehler: Partial<Record<JournalZaehler, number>>;
}

export const JE_MONAT = 2000;
/** Fehlanmeldungen so lange sammeln, bevor dieser Prozess sie schreibt (#1415; im Betrieb, siehe `start/dienst.ts`). */
export const SAMMELN_MS = 2000;
/** Spätestens bei so vielen gesammelten Fehlanmeldungen gleich schreiben – begrenzt Speicher und Größe der Anweisung. */
export const SAMMELN_HOECHSTENS = 500;
export const MONATE = 25;
export const monatVon = (d: Date) => d.toISOString().slice(0, 7);
function monatMinus(monat: string, n: number): string {
  const [j, m] = monat.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1 - n, 1));
  return monatVon(d);
}

/**
 * Ablage des Journals. `trageEin` und `zaehle` sind je eine kurze, atomare Änderung – unabhängig davon, wie viele
 * Einträge der Monat schon hat, und ohne Vergleichen und Tauschen (nichts geht bei gleichzeitigen Versuchen verloren).
 */
export interface JournalSpeicher {
  monat(monat: string): Promise<JournalMonat>;
  /** Eintrag anfügen; ab `grenze` Einträgen im Monat nur noch „weitere“ hochzählen. */
  trageEin(monat: string, e: JournalEintrag, grenze: number): Promise<void>;
  zaehle(monat: string, art: JournalZaehler): Promise<void>;
  /**
   * Gesammelte Fehlanmeldungen eines Monats (#1415) in einer Änderung: wie `trageEin` je Eintrag (in dieser Reihenfolge)
   * und `zaehle` je Zähler, nur auf einmal. Der Zähler der Versuche steigt um alle Einträge, eingefügt wird nur, was
   * unter `grenze` bleibt.
   */
  sammle(monat: string, eintraege: JournalEintrag[], zaehler: Partial<Record<JournalZaehler, number>>, grenze: number): Promise<void>;
  /**
   * Eintrag je Tag (#1308): Gibt es im Monat schon einen Eintrag derselben Art, dessen Daten `gleich` enthalten, zählt
   * er dort `anzahl` hoch und setzt `letzte` auf die Zeit von `e` – ohne neuen Eintrag und ohne den Zähler des Monats.
   * Sonst wie `trageEin`. Auch mit mehreren Prozessen an einer Datenbank genau ein Eintrag (Sperre je Art und Monat).
   */
  vermerke(monat: string, e: JournalEintrag, gleich: Record<string, PaketdatenWert>, grenze: number): Promise<void>;
  /** Alle Monate bis einschließlich `bis` löschen. */
  raeume(bis: string): Promise<void>;
}

/** Im Arbeitsspeicher (Tests, Entwicklung ohne Datenbank). */
export function speicherJournal(): JournalSpeicher {
  const m = new Map<string, { eintraege: JournalEintrag[]; versuche: number; zaehler: Partial<Record<JournalZaehler, number>> }>();
  const hol = (k: string) => {
    let x = m.get(k);
    if (!x) m.set(k, (x = { eintraege: [], versuche: 0, zaehler: {} }));
    return x;
  };
  return {
    async monat(k) {
      const x = m.get(k);
      return x
        ? { eintraege: structuredClone(x.eintraege), weitere: x.versuche - x.eintraege.length, zaehler: { ...x.zaehler } }
        : { eintraege: [], weitere: 0, zaehler: {} };
    },
    async trageEin(k, e, grenze) {
      const x = hol(k);
      if (++x.versuche <= grenze) x.eintraege.push(structuredClone(e));
    },
    async zaehle(k, art) {
      const x = hol(k);
      x.zaehler[art] = (x.zaehler[art] ?? 0) + 1;
    },
    async sammle(k, eintraege, zaehler, grenze) {
      const x = hol(k);
      for (const e of eintraege) if (++x.versuche <= grenze) x.eintraege.push(structuredClone(e));
      for (const [art, n] of Object.entries(zaehler) as [JournalZaehler, number][]) x.zaehler[art] = (x.zaehler[art] ?? 0) + n;
    },
    async vermerke(k, e, gleich, grenze) {
      const x = hol(k);
      const da = x.eintraege.find((y) => y.art === e.art && enthaelt(y.daten, gleich));
      if (!da) {
        if (++x.versuche <= grenze) x.eintraege.push(structuredClone(e));
        return;
      }
      da.daten.anzahl = (typeof da.daten.anzahl === 'number' ? da.daten.anzahl : 1) + 1;
      da.daten.letzte = e.zeit;
    },
    async raeume(bis) {
      for (const k of [...m.keys()]) if (k <= bis) m.delete(k);
    },
  };
}

/** Enthalten die Daten alle Werte von `gleich` (wie `@>` in PostgreSQL)? */
const enthaelt = (daten: Record<string, PaketdatenWert>, gleich: Record<string, PaketdatenWert>) =>
  Object.entries(gleich).every(([k, v]) => JSON.stringify(daten[k] ?? null) === JSON.stringify(v));

/** Klasse der Sitzungssperre für `vermerke` (#1308), daneben ein Hash aus Haushalt, Art und Monat. */
const VERMERK_SPERRE = 4711308;

/** Zählerzeile „alle Versuche einzutragen“ je Monat; die übrigen Zeilen sind `JournalZaehler`. */
const VERSUCHE = 'eintraege';

/** Alte Monatswerte übernehmen (siehe `pgJournal`); gibt die Zahl der übernommenen Monate zurück. */
async function uebernimmAltesJournal(sql: postgres.Sql, haushaltId: string): Promise<number> {
  const [r] = await sql<{ monate: number }[]>`
    WITH alt AS (
      DELETE FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel ~ '^nachweise:[0-9]{4}-[0-9]{2}$'
      RETURNING substr(schluessel, 11) AS monat, wert
    ), liste AS (
      SELECT monat, wert, CASE WHEN jsonb_typeof(wert->'eintraege') = 'array' THEN wert->'eintraege' ELSE '[]'::jsonb END AS eintraege FROM alt
    ), e AS (
      INSERT INTO nachweis_journal (haushalt_id, monat, art, zeit, daten)
      SELECT ${haushaltId}::uuid, l.monat, x.e->>'art', (x.e->>'zeit')::timestamptz, coalesce(x.e->'daten', '{}'::jsonb)
      FROM liste l CROSS JOIN LATERAL jsonb_array_elements(l.eintraege) WITH ORDINALITY AS x(e, i)
      ORDER BY l.monat, x.i
      RETURNING 1
    ), z AS (
      INSERT INTO nachweis_zaehler (haushalt_id, monat, art, anzahl)
      SELECT ${haushaltId}::uuid, monat, ${VERSUCHE}, jsonb_array_length(eintraege) + CASE WHEN jsonb_typeof(wert->'weitere') = 'number' THEN (wert->>'weitere')::bigint ELSE 0 END FROM liste
      UNION ALL
      SELECT ${haushaltId}::uuid, l.monat, k.key, (k.value #>> '{}')::bigint FROM liste l
        CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(l.wert->'zaehler') = 'object' THEN l.wert->'zaehler' ELSE '{}'::jsonb END) AS k
        WHERE jsonb_typeof(k.value) = 'number' AND k.key <> ${VERSUCHE}
      ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + EXCLUDED.anzahl
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM alt)::int AS monate, (SELECT count(*) FROM e)::int AS eintraege, (SELECT count(*) FROM z)::int AS zaehler`;
  return r.monate;
}

/** Ein Eintrag: Zähler des Monats hochzählen und, solange unter der Grenze, einfügen – in einer Anweisung. */
function fuegeEin(sql: postgres.Sql | postgres.TransactionSql, haushaltId: string, monat: string, e: JournalEintrag, grenze: number) {
  return sql`
    WITH z AS (
      INSERT INTO nachweis_zaehler (haushalt_id, monat, art, anzahl) VALUES (${haushaltId}, ${monat}, ${VERSUCHE}, 1)
      ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + 1 RETURNING anzahl
    )
    INSERT INTO nachweis_journal (haushalt_id, monat, art, zeit, daten)
    SELECT ${haushaltId}::uuid, ${monat}, ${e.art}, ${e.zeit}::timestamptz, ${sql.json(e.daten as postgres.JSONValue)} FROM z WHERE z.anzahl <= ${grenze}`;
}

/**
 * Gesammelte Fehlanmeldungen (#1415) in einer Anweisung: alle Zähler des Monats um ihre Anzahl hochzählen (Versuche um
 * die Zahl der Einträge) und die Einträge in ihrer Reihenfolge einfügen, solange der Monat unter der Grenze bleibt – der
 * neue Stand der Versuche minus die eigenen ergibt, wie viele es vorher waren.
 */
function sammleIn(
  sql: postgres.Sql,
  haushaltId: string,
  monat: string,
  x: { eintraege: JournalEintrag[]; zaehler: Partial<Record<JournalZaehler, number>>; grenze: number },
) {
  const { eintraege, zaehler, grenze } = x;
  const zeilen = [...(eintraege.length ? [[VERSUCHE, eintraege.length] as const] : []), ...Object.entries(zaehler)]
    .filter(([, n]) => !!n)
    .map(([art, n]) => ({ haushalt_id: haushaltId, monat, art, anzahl: n }));
  if (!zeilen.length) return Promise.resolve();
  return sql`
    WITH z AS (
      INSERT INTO nachweis_zaehler ${sql(zeilen, 'haushalt_id', 'monat', 'art', 'anzahl')}
      ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + EXCLUDED.anzahl RETURNING art, anzahl
    )
    INSERT INTO nachweis_journal (haushalt_id, monat, art, zeit, daten)
    SELECT ${haushaltId}::uuid, ${monat}, x.e->>'art', (x.e->>'zeit')::timestamptz, coalesce(x.e->'daten', '{}'::jsonb)
    FROM z CROSS JOIN LATERAL jsonb_array_elements(${sql.json(eintraege as unknown as postgres.JSONValue)}::jsonb) WITH ORDINALITY AS x(e, i)
    WHERE z.art = ${VERSUCHE} AND z.anzahl - ${eintraege.length}::bigint + x.i <= ${grenze}::bigint
    ORDER BY x.i`;
}

/**
 * In PostgreSQL. Vor dem ersten Zugriff übernimmt es die alten Monatswerte `nachweise:JJJJ-MM` aus den Einstellungen
 * (nach dem Update und nach dem Einspielen einer älteren Sicherung) – in einer Anweisung: Löschen und Einfügen
 * gelingen zusammen oder gar nicht. Starten mehrere Prozesse zugleich, findet der zweite nichts mehr vor.
 */
export function pgJournal(sql: postgres.Sql, haushaltId: string): JournalSpeicher & { uebernimm(): Promise<void> } {
  const uebernimm = () => uebernimmAltesJournal(sql, haushaltId);
  let bereit: Promise<void> | null = null;
  const vorher = () =>
    (bereit ??= uebernimm().then(
      (n) => {
        if (n) log.info('Nachweis-Journal übernommen', { monate: n });
      },
      (e: Error) => log.warn('Altes Nachweis-Journal nicht übernommen – es bleibt in den Einstellungen', { fehler: e.message }),
    ));
  return {
    /** Beim Start anstoßen (sonst beim ersten Zugriff); scheitert nie, höchstens mit Warnung. */
    uebernimm: vorher,
    async monat(monat) {
      await vorher();
      const [eintraege, zaehler] = await Promise.all([
        sql<{ art: JournalArt; zeit: Date; daten: Record<string, PaketdatenWert> }[]>`SELECT art, zeit, daten FROM nachweis_journal
          WHERE haushalt_id = ${haushaltId} AND monat = ${monat} ORDER BY nr`,
        sql<
          { art: string; anzahl: string }[]
        >`SELECT art, anzahl FROM nachweis_zaehler WHERE haushalt_id = ${haushaltId} AND monat = ${monat}`,
      ]);
      const versuche = Number(zaehler.find((z) => z.art === VERSUCHE)?.anzahl ?? 0);
      return {
        eintraege: eintraege.map((e) => ({ art: e.art, zeit: new Date(e.zeit).toISOString(), daten: e.daten })),
        weitere: Math.max(0, versuche - eintraege.length),
        zaehler: Object.fromEntries(zaehler.filter((z) => z.art !== VERSUCHE).map((z) => [z.art, Number(z.anzahl)])),
      };
    },
    async trageEin(monat, e, grenze) {
      await vorher();
      await fuegeEin(sql, haushaltId, monat, e, grenze);
    },
    async vermerke(monat, e, gleich, grenze) {
      await vorher();
      // Selten (eine gescheiterte Sicherung), darum genügt eine Sperre je Art und Monat: Zwei Prozesse, die zugleich
      // vermerken, finden so nacheinander den Eintrag des anderen – kein doppelter Eintrag, keine verlorene Zählung.
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(${VERMERK_SPERRE}, hashtext(${`${haushaltId}:${e.art}:${monat}`}))`;
        const [da] = await tx<{ nr: string }[]>`
          UPDATE nachweis_journal SET daten = daten || jsonb_build_object(
            'anzahl', CASE WHEN jsonb_typeof(daten->'anzahl') = 'number' THEN (daten->>'anzahl')::bigint ELSE 1 END + 1,
            'letzte', ${e.zeit}::text)
          WHERE nr = (SELECT nr FROM nachweis_journal WHERE haushalt_id = ${haushaltId} AND monat = ${monat} AND art = ${e.art}
            AND daten @> ${tx.json(gleich as postgres.JSONValue)} ORDER BY nr LIMIT 1)
          RETURNING nr`;
        if (!da) await fuegeEin(tx, haushaltId, monat, e, grenze);
      });
    },
    async zaehle(monat, art) {
      await vorher();
      await sql`INSERT INTO nachweis_zaehler (haushalt_id, monat, art, anzahl) VALUES (${haushaltId}, ${monat}, ${art}, 1)
        ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + 1`;
    },
    async sammle(monat, eintraege, zaehler, grenze) {
      await vorher();
      await sammleIn(sql, haushaltId, monat, { eintraege, zaehler, grenze });
    },
    async raeume(bis) {
      await vorher();
      await sql`DELETE FROM nachweis_journal WHERE haushalt_id = ${haushaltId} AND monat <= ${bis}`;
      await sql`DELETE FROM nachweis_zaehler WHERE haushalt_id = ${haushaltId} AND monat <= ${bis}`;
    },
  };
}

/** Gesammelte Fehlanmeldungen eines Monats (#1415) und wer darauf wartet. */
interface Sammlung {
  eintraege: JournalEintrag[];
  zaehler: Partial<Record<JournalZaehler, number>>;
  warten: Array<{ ja: () => void; nein: (e: Error) => void }>;
}

export class Nachweisjournal {
  /** Monat, den dieser Prozess schon geräumt hat (einmal je Monat, wie früher beim ersten Eintrag). */
  private geraeumt: string | null = null;
  /** Gesammelte Fehlanmeldungen je Monat (#1415), ihre Zahl und die Uhr bis zum Schreiben. */
  private sammlung = new Map<string, Sammlung>();
  private gesammelt = 0;
  private uhr: ReturnType<typeof setTimeout> | null = null;
  /** Gerade laufendes Schreiben – `leeren` wartet auch darauf. */
  private laufend = new Set<Promise<void>>();
  /**
   * `sammelnMs` (#1415): Fehlanmeldungen so lange sammeln und dann gesammelt schreiben; 0 (Vorgabe, Tests) schreibt
   * jede sofort wie bisher.
   */
  constructor(
    private readonly speicher: JournalSpeicher,
    private readonly jetzt: () => Date = () => new Date(),
    private readonly sammelnMs = 0,
  ) {}

  /** Monat lesen (`JJJJ-MM`) – vorher schreiben, was dieser Prozess gesammelt hat. */
  async monat(monat: string): Promise<JournalMonat> {
    await this.leeren();
    return this.speicher.monat(monat);
  }

  /** Fehlanmeldung (#1415): gesammelt oder – ohne `sammelnMs` – sofort. Konto nur, wenn es das Konto gibt. */
  fehlanmeldung(email: string, ip: string, bekannt: boolean): Promise<void> {
    if (!this.sammelnMs) {
      return bekannt
        ? this.schreibe('zugang.fehlanmeldung', { konto: email, netz: kuerzeIp(ip), heimnetz: heimnetzAngabe(ip) })
        : this.zaehle('zugang.fehlanmeldung_unbekannt');
    }
    const jetzt = this.jetzt();
    const monat = monatVon(jetzt);
    let s = this.sammlung.get(monat);
    if (!s) this.sammlung.set(monat, (s = { eintraege: [], zaehler: {}, warten: [] }));
    if (bekannt) {
      const daten = ohneGeheimnisse({ konto: email, netz: kuerzeIp(ip), heimnetz: heimnetzAngabe(ip) });
      s.eintraege.push({ art: 'zugang.fehlanmeldung', zeit: jetzt.toISOString(), daten });
    } else s.zaehler['zugang.fehlanmeldung_unbekannt'] = (s.zaehler['zugang.fehlanmeldung_unbekannt'] ?? 0) + 1;
    const fertig = new Promise<void>((ja, nein) => s.warten.push({ ja, nein }));
    if (++this.gesammelt >= SAMMELN_HOECHSTENS) void this.leeren();
    // Die Uhr hält den Prozess bewusst wach (kein unref): Was gesammelt ist, wird auch ohne `leeren` noch geschrieben.
    else this.uhr ??= setTimeout(() => void this.leeren(), this.sammelnMs);
    return fertig;
  }

  /**
   * Alles Gesammelte jetzt schreiben und auf laufendes Schreiben warten (#1415; beim Beenden und vor dem Lesen).
   * Scheitert nie; wer auf eine Fehlanmeldung wartet, erfährt den Fehler.
   */
  async leeren(): Promise<void> {
    if (this.uhr) clearTimeout(this.uhr);
    this.uhr = null;
    const alle = [...this.sammlung];
    this.sammlung = new Map();
    this.gesammelt = 0;
    for (const [monat, s] of alle) {
      const p = this.speicher.sammle(monat, s.eintraege, s.zaehler, JE_MONAT).then(
        () => {
          for (const w of s.warten) w.ja();
          this.raeume(monat);
        },
        (e: Error) => {
          for (const w of s.warten) w.nein(e);
        },
      );
      this.laufend.add(p);
      void p.finally(() => this.laufend.delete(p));
    }
    await Promise.all([...this.laufend]);
  }

  /** Den Monat räumen, der jetzt zu alt ist – einmal je Monat und Prozess, nebenher. */
  private raeume(monat: string) {
    if (this.geraeumt === monat) return;
    this.geraeumt = monat;
    void this.speicher.raeume(monatMinus(monat, MONATE)).catch((e: Error) => {
      this.geraeumt = null;
      log.warn('Alte Nachweise nicht geräumt', { fehler: e.message });
    });
  }

  async schreibe(art: JournalArt, daten: Record<string, PaketdatenWert>): Promise<void> {
    const jetzt = this.jetzt();
    const monat = monatVon(jetzt);
    await this.speicher.trageEin(monat, { art, zeit: jetzt.toISOString(), daten: ohneGeheimnisse(daten) }, JE_MONAT);
    this.raeume(monat);
  }

  /**
   * Ein Eintrag je Tag (UTC) und Merkmalen (#1308): `merkmale` samt `tag` bestimmen den Eintrag; wiederholt sich das
   * am selben Tag, zählt `anzahl` hoch und `letzte` nennt die letzte Zeit. `zeit` bleibt die erste.
   */
  async vermerkeJeTag(art: JournalArt, merkmale: Record<string, PaketdatenWert>): Promise<void> {
    const jetzt = this.jetzt();
    const zeit = jetzt.toISOString();
    const monat = monatVon(jetzt);
    const gleich = ohneGeheimnisse({ tag: zeit.slice(0, 10), ...merkmale });
    await this.speicher.vermerke(monat, { art, zeit, daten: { ...gleich, anzahl: 1, letzte: zeit } }, gleich, JE_MONAT);
    this.raeume(monat);
  }

  async zaehle(art: JournalZaehler): Promise<void> {
    const monat = monatVon(this.jetzt());
    await this.speicher.zaehle(monat, art);
    this.raeume(monat);
  }
}

/* ---------- Eine Stelle für alle Aufrufer (wie das Protokoll: ein Mandant je Prozess) ---------- */

let aktiv: Nachweisjournal | null = null;
/** Vom Start bzw. von Tests gesetzt. */
export function setzeNachweisjournal(j: Nachweisjournal | null) {
  aktiv = j;
}
export const nachweisjournal = () => aktiv;

/** Eintragen, ohne den Aufrufer aufzuhalten oder scheitern zu lassen. Gibt das Versprechen für Tests zurück. */
export function nachweis(art: JournalArt, daten: Record<string, PaketdatenWert>): Promise<void> {
  if (!aktiv) return Promise.resolve();
  return aktiv.schreibe(art, daten).catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art, fehler: e.message }));
}

/** Wie `nachweis`, aber ein Eintrag je Tag und Merkmalen mit Anzahl (#1308). */
export function nachweisJeTag(art: JournalArt, merkmale: Record<string, PaketdatenWert>): Promise<void> {
  if (!aktiv) return Promise.resolve();
  return aktiv.vermerkeJeTag(art, merkmale).catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art, fehler: e.message }));
}

/**
 * Fehlanmeldung: Konto nur, wenn es das Konto gibt; Adresse gekürzt, dazu Heimnetz oder außen. Im Betrieb gesammelt
 * geschrieben (#1415, `SAMMELN_MS`); das Versprechen erfüllt sich, sobald sie geschrieben ist.
 */
export function fehlanmeldung(email: string, ip: string, bekannt: boolean): Promise<void> {
  if (!aktiv) return Promise.resolve();
  const art = bekannt ? 'zugang.fehlanmeldung' : 'zugang.fehlanmeldung_unbekannt';
  return aktiv.fehlanmeldung(email, ip, bekannt).catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art, fehler: e.message }));
}

/**
 * Update-Verlauf: Läuft eine andere Version als beim letzten Start, steht das Update im Journal – genau einmal, auch
 * wenn mehrere Prozesse zugleich starten (`tausche`). Der erste Start überhaupt zählt nicht als Update.
 */
export async function merkeVersion(einst: Einstellungen, version: string): Promise<void> {
  const alt = (await einst.lies('nachweise_version')) ?? null;
  if (alt === version) return;
  const getauscht = einst.tausche
    ? await einst.tausche('nachweise_version', alt, version)
    : (await einst.schreibe('nachweise_version', version), true);
  if (getauscht && typeof alt === 'string') await nachweis('betrieb.update', { von: alt, nach: version });
}
