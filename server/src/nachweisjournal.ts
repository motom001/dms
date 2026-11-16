/**
 * Nachweis-Journal (#1053): was für die Nachweise eines Monats sonst nirgends dauerhaft steht – Fehlanmeldungen,
 * Rechteänderungen, Updates und Paket-Verlauf, Wartungszeiten, Läufe von „Alle Dateien prüfen“, geleerter Papierkorb,
 * erzeugte Datenschutzauskünfte. Das Protokoll hält nur 24 Stunden.
 *
 * Abgelegt in den Tabellen `nachweis_journal` (je Eintrag eine Zeile) und `nachweis_zaehler` (Migration 118, Teil der
 * Sicherung). Bis #1253 stand jeder Monat als ein JSON-Wert `nachweise:JJJJ-MM` in den Einstellungen: Jede
 * Fehlanmeldung las, kopierte und schrieb den ganzen Monat (bis 2000 Einträge) und verlor bei vielen gleichzeitigen
 * Versuchen Einträge. Jetzt kostet ein Eintrag eine Anweisung (Zähler hochzählen und, solange unter der Grenze,
 * einfügen); ein unbekanntes Konto nur das Hochzählen. Die alten Werte übernimmt der Server beim ersten Zugriff.
 *
 * Je Monat höchstens `JE_MONAT` Einträge, danach nur noch gezählt („weitere“); nach `MONATE` Monaten fällt ein Monat
 * weg. Nie Geheimnisse, nie volle IP-Adressen (Ergänzung Sicherheit: IPv4 /24, IPv6 /48 und „Heimnetz/außen“;
 * unbekannte Konten nur als Anzahl).
 */
import type postgres from 'postgres';
import { kuerzeIp, istPrivat } from './abruf';
import { ohneGeheimnisse } from './geheimnis-sperre';
import { protokoll } from './protokoll';
import type { Einstellungen } from './einstellungen';
import type { PaketdatenWert } from '../../shared/src/paketdaten';

const log = protokoll.modul('system');

/** Arten im Journal – die Kennung ist zugleich die Kennung des Nachweises. */
export type JournalArt =
  | 'zugang.fehlanmeldung'
  | 'zugang.rechte'
  | 'betrieb.update'
  | 'betrieb.paket'
  | 'betrieb.wartung'
  | 'unveraenderbarkeit.pruefung'
  | 'datenschutz.auskunft'
  | 'datenschutz.papierkorb';
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
    async raeume(bis) {
      for (const k of [...m.keys()]) if (k <= bis) m.delete(k);
    },
  };
}

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
      await sql`
        WITH z AS (
          INSERT INTO nachweis_zaehler (haushalt_id, monat, art, anzahl) VALUES (${haushaltId}, ${monat}, ${VERSUCHE}, 1)
          ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + 1 RETURNING anzahl
        )
        INSERT INTO nachweis_journal (haushalt_id, monat, art, zeit, daten)
        SELECT ${haushaltId}::uuid, ${monat}, ${e.art}, ${e.zeit}::timestamptz, ${sql.json(e.daten as postgres.JSONValue)} FROM z WHERE z.anzahl <= ${grenze}`;
    },
    async zaehle(monat, art) {
      await vorher();
      await sql`INSERT INTO nachweis_zaehler (haushalt_id, monat, art, anzahl) VALUES (${haushaltId}, ${monat}, ${art}, 1)
        ON CONFLICT (haushalt_id, monat, art) DO UPDATE SET anzahl = nachweis_zaehler.anzahl + 1`;
    },
    async raeume(bis) {
      await vorher();
      await sql`DELETE FROM nachweis_journal WHERE haushalt_id = ${haushaltId} AND monat <= ${bis}`;
      await sql`DELETE FROM nachweis_zaehler WHERE haushalt_id = ${haushaltId} AND monat <= ${bis}`;
    },
  };
}

export class Nachweisjournal {
  /** Monat, den dieser Prozess schon geräumt hat (einmal je Monat, wie früher beim ersten Eintrag). */
  private geraeumt: string | null = null;
  constructor(
    private readonly speicher: JournalSpeicher,
    private readonly jetzt: () => Date = () => new Date(),
  ) {}

  /** Monat lesen (`JJJJ-MM`). */
  async monat(monat: string): Promise<JournalMonat> {
    return this.speicher.monat(monat);
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

/** Fehlanmeldung: Konto nur, wenn es das Konto gibt; Adresse gekürzt, dazu Heimnetz oder außen. */
export function fehlanmeldung(email: string, ip: string, bekannt: boolean): Promise<void> {
  if (!aktiv) return Promise.resolve();
  if (!bekannt)
    return aktiv
      .zaehle('zugang.fehlanmeldung_unbekannt')
      .catch((e: Error) => log.warn('Nachweis nicht eingetragen', { art: 'zugang.fehlanmeldung_unbekannt', fehler: e.message }));
  return nachweis('zugang.fehlanmeldung', { konto: email, netz: kuerzeIp(ip), heimnetz: istPrivat(ip) });
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
