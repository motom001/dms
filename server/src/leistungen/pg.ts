/** Aufträge an Leistungen in PostgreSQL (#1569, Migration 125): Tabelle `leistungsauftraege`, Sperre wie die Texterkennung. */
import type postgres from 'postgres';
import type { Auftragszeile, Auftragsspeicher } from './speicher';

type Zeile = Record<string, unknown>;
const iso = (x: unknown) => (x instanceof Date ? x.toISOString() : x == null ? null : String(x));

function alsAuftrag(r: Zeile): Auftragszeile {
  return {
    id: r.id as string,
    leistung: r.leistung as Auftragszeile['leistung'],
    art: r.art as Auftragszeile['art'],
    zustand: r.zustand as Auftragszeile['zustand'],
    eingabe: (r.eingabe as Auftragszeile['eingabe']) ?? null,
    kontext: r.kontext ?? undefined,
    ziel: (r.ziel as Auftragszeile['ziel']) ?? null,
    wer: r.wer as Auftragszeile['wer'],
    wirkung: r.wirkung as boolean,
    zeitgrenzeS: r.zeitgrenze_s as number,
    anbieter: (r.anbieter as string | null) ?? null,
    daten: (r.daten as Auftragszeile['daten']) ?? null,
    dokument: (r.dokument as string | null) ?? null,
    fehler: (r.fehler as Auftragszeile['fehler']) ?? null,
    versuche: r.versuche as number,
    erstellt: iso(r.erstellt)!,
    begonnen: iso(r.begonnen),
    beendet: iso(r.beendet),
  };
}

export function pgAuftraege(sql: postgres.Sql, haushaltId: string): Auftragsspeicher {
  const json = (x: unknown) => (x === undefined || x === null ? null : sql.json(x as postgres.JSONValue));
  return {
    async lege(a) {
      await sql`
        INSERT INTO leistungsauftraege (id, haushalt_id, leistung, art, zustand, eingabe, kontext, ziel, wer, wirkung, zeitgrenze_s, anbieter, begonnen, gesperrt_bis)
        VALUES (${a.id}, ${haushaltId}, ${a.leistung}, ${a.art}, ${a.zustand}, ${json(a.eingabe)}, ${json(a.kontext)}, ${json(a.ziel)},
          ${json(a.wer)}, ${a.wirkung}, ${a.zeitgrenzeS}, ${a.anbieter ?? null},
          ${a.zustand === 'laeuft' ? sql`now()` : null}, ${a.zustand === 'laeuft' ? sql`now() + ${a.zeitgrenzeS + 60} * interval '1 second'` : null})`;
    },
    async hole(id) {
      const [r] = await sql`SELECT * FROM leistungsauftraege WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAuftrag(r) : undefined;
    },
    async naechster() {
      // SKIP LOCKED: zwei Prozesse nehmen sich nie denselben Auftrag; mit abgelaufener Frist ist er wieder frei.
      const [r] = await sql`
        UPDATE leistungsauftraege SET zustand = 'laeuft', begonnen = now(), versuche = versuche + 1,
          gesperrt_bis = now() + (zeitgrenze_s + 60) * interval '1 second'
        WHERE id = (
          SELECT id FROM leistungsauftraege
          WHERE haushalt_id = ${haushaltId}
            AND (zustand = 'wartet' OR (zustand = 'laeuft' AND NOT wirkung AND gesperrt_bis < now()))
          ORDER BY erstellt, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`;
      return r ? alsAuftrag(r) : undefined;
    },
    async setze(id, s) {
      const fertig = s.zustand === 'fertig' || s.zustand === 'fehlgeschlagen' || s.zustand === 'unterbrochen';
      await sql`
        UPDATE leistungsauftraege SET zustand = ${s.zustand}, gesperrt_bis = NULL
          ${s.anbieter !== undefined ? sql`, anbieter = ${s.anbieter}` : sql``}
          ${s.daten !== undefined ? sql`, daten = ${json(s.daten)}` : sql``}
          ${s.dokument !== undefined ? sql`, dokument = ${s.dokument}` : sql``}
          ${s.fehler !== undefined ? sql`, fehler = ${json(s.fehler)}` : sql``}
          ${fertig ? sql`, eingabe = NULL, beendet = now()` : sql``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async zurueckstellen() {
      const u = await sql`
        UPDATE leistungsauftraege SET zustand = 'unterbrochen', eingabe = NULL, beendet = now(), gesperrt_bis = NULL
        WHERE haushalt_id = ${haushaltId} AND zustand = 'laeuft' AND wirkung`;
      const w = await sql`
        UPDATE leistungsauftraege SET zustand = 'wartet', gesperrt_bis = NULL
        WHERE haushalt_id = ${haushaltId} AND zustand = 'laeuft' AND NOT wirkung`;
      return { wiederholt: w.count, unterbrochen: u.count };
    },
    async fristUnterbrechen() {
      const r = await sql`
        UPDATE leistungsauftraege SET zustand = 'unterbrochen', eingabe = NULL, beendet = now(), gesperrt_bis = NULL
        WHERE haushalt_id = ${haushaltId} AND zustand = 'laeuft' AND wirkung AND gesperrt_bis < now()`;
      return r.count;
    },
    async raeumeAuf(stunden) {
      const r = await sql`
        DELETE FROM leistungsauftraege
        WHERE haushalt_id = ${haushaltId} AND beendet IS NOT NULL AND beendet < now() - ${stunden} * interval '1 hour'`;
      return r.count;
    },
  };
}
