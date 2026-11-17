/** Konten-Ablage in PostgreSQL (#1278, vorher in `konten/konto-repo.ts`). */
import type postgres from 'postgres';
import type { Benutzer, Vertretung } from '../../../shared/src/model';
import {
  type SitzungIntern,
  type KontoRepo,
  systemEmail,
  type SitzungsVerwaltung,
  ZULETZT_RUHE_MS,
  type Zweck,
} from './konto-repo-schnittstelle';
import { istUuid, dienstEmail } from '../repo';
import { standSpalten, staendeAusZeile } from '../zwischenspeicher/lesespeicher';
import { ohneWarten } from '../repo/pg';

/* ---------------- PostgreSQL ---------------- */

type Zeile = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const alsBenutzer = (r: Zeile): Benutzer => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  // Gespeichert ist keine Rolle mehr (#818); `admin` setzt nur der Verwaltungsmodus einer Anfrage.
  rolle: 'mitglied',
  verwaltung: Array.isArray(r.verwaltung) ? (r.verwaltung as string[]) : [],
  aktiv: r.aktiv as boolean,
  hatPasswort: r.passwort_hash != null,
  erstellt: iso(r.erstellt)!,
  letzteAnmeldung: iso(r.letzte_anmeldung),
  entwicklermodus: !!r.entwicklermodus,
  sprache: (r.sprache as string | null | undefined) ?? null,
  // Übersetzen (#732): nur, wenn die Person es für sich abgeschaltet hat – sonst gilt die Vorgabe „an“.
  ...(r.uebersetzen === false ? { uebersetzen: false } : {}),
  abwesenheit: {
    an: !!r.abwesend,
    von: tag(r.abwesend_von),
    bis: tag(r.abwesend_bis),
    vertreterId: (r.vertreter_id as string | null) ?? null,
  },
  deaktiviert: iso(r.deaktiviert),
  ...(r.art === 'dienst' ? { art: 'dienst' as const, paketId: r.paket_id as string } : {}),
  ...(r.art === 'system' ? { art: 'system' as const, systemkonto: r.systemkonto as string } : {}),
});
/** date-Spalte als JJJJ-MM-TT (ohne Zeitzonenverschiebung). */
const tag = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};

const zeitOderNull = (v: unknown) => (v ? new Date(v as string) : null);
const alsSitzung = (r: Zeile): SitzungIntern => ({
  id: r.id as string,
  benutzerId: r.benutzer_id as string,
  ablauf: new Date(r.ablauf as string),
  zuletztAktiv: new Date(r.zuletzt_aktiv as string),
  vertretungId: (r.vertretung_id as string | null) ?? null,
  erstellt: r.erstellt ? new Date(r.erstellt as string) : undefined,
  anmeldungVoll: zeitOderNull(r.anmeldung_voll),
  verwaltungSeit: zeitOderNull(r.verwaltung_seit),
  verwaltungAktiv: zeitOderNull(r.verwaltung_aktiv),
  verwaltungBestaetigt: zeitOderNull(r.verwaltung_bestaetigt),
  frisch: zeitOderNull(r.frisch),
});

const alsVertretung = (r: Zeile): Vertretung => ({
  id: r.id as string,
  benutzerId: r.benutzer_id as string,
  adminId: (r.admin_id as string | null) ?? null,
  adminName: r.admin_name as string,
  beginn: iso(r.beginn)!,
  ende: iso(r.ende),
});

/** Die Ablage aus ihren Teilen (#1278, Schritt 6b-1: nach Fachgruppen zerlegt, Rümpfe unverändert). */
export function pgKontoRepo(sql: postgres.Sql, haushaltId: string): KontoRepo {
  return {
    ...pgPersonen(sql, haushaltId),
    ...pgAenderungen(sql, haushaltId),
    ...pgKontenOhneMensch(sql, haushaltId),
    ...pgSitzungen(sql, haushaltId),
    ...pgVerwaltungsmodus(sql, haushaltId),
    ...pgVertretungen(sql, haushaltId),
    ...pgLinksUndNotfall(sql, haushaltId),
  };
}

/** Personen: zählen, auflisten, holen, anlegen und löschen. */
function pgPersonen(sql: postgres.Sql, haushaltId: string) {
  return {
    async anzahlBenutzer() {
      const [r] = await sql`SELECT count(*)::int AS n FROM benutzer WHERE art = 'person'`;
      return r.n as number;
    },
    async listeBenutzer() {
      const r = await sql`
        SELECT b.*, (SELECT max(s.zuletzt_aktiv) FROM sitzungen s WHERE s.benutzer_id = b.id AND s.ablauf > now()) AS zuletzt_aktiv
        FROM benutzer b WHERE b.haushalt_id = ${haushaltId} AND b.art = 'person' ORDER BY lower(b.name), lower(b.email)`;
      return r.map((z) => ({ ...alsBenutzer(z), zuletztAktiv: iso(z.zuletzt_aktiv) }));
    },
    async holeBenutzer(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async holeHash(email) {
      const [r] = await sql`SELECT * FROM benutzer WHERE lower(email) = lower(${email}) AND haushalt_id = ${haushaltId} AND art = 'person'`;
      return r ? { benutzer: alsBenutzer(r), hash: (r.passwort_hash as string | null) ?? null } : undefined;
    },
    async legeBenutzerAn(n) {
      const [r] = await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, verwaltung)
        VALUES (${n.id}, ${haushaltId}, ${n.email}, ${n.name}, 'mitglied', ${n.passwortHash}, ${n.verwaltung ?? []}::text[])
        RETURNING *`;
      return alsBenutzer(r);
    },
    async loescheBenutzer(id) {
      await sql`DELETE FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`;
    },
  } satisfies Partial<KontoRepo>;
}

/** Änderungen an Personen: Angaben, geschützte Änderungen, Abwesenheit, Passwort und Anmeldung. */
function pgAenderungen(sql: postgres.Sql, haushaltId: string) {
  return {
    async aendereBenutzer(id, d) {
      const [r] = await sql`
        UPDATE benutzer SET
          name = coalesce(${d.name ?? null}, name),
          email = coalesce(${d.email ?? null}, email),
          aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv),
          entwicklermodus = coalesce(${d.entwicklermodus ?? null}::boolean, entwicklermodus),
          uebersetzen = coalesce(${d.uebersetzen ?? null}::boolean, uebersetzen),
          sprache = CASE WHEN ${d.sprache !== undefined}::boolean THEN ${d.sprache ?? null}::text ELSE sprache END,
          deaktiviert = CASE WHEN ${d.aktiv ?? null}::boolean IS NULL THEN deaktiviert
            WHEN ${d.aktiv ?? null}::boolean THEN NULL WHEN aktiv THEN now() ELSE deaktiviert END
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async aendereGeschuetzt(id, d, pruefe) {
      return sql.begin(async (tx) => {
        // Sperre über alle Personen der Ablage (#818, Bauvorgabe Sicherheit): Zwei Verwaltende, die sich gleichzeitig
        // gegenseitig das Recht nehmen, landen so nicht bei null – die zweite Prüfung sieht die erste Änderung.
        const zeilen = await tx`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'person' ORDER BY id FOR UPDATE`;
        const vorher = zeilen.map(alsBenutzer);
        const alle = vorher.map((b) =>
          b.id !== id
            ? b
            : { ...b, ...(d.verwaltung ? { verwaltung: d.verwaltung } : {}), ...(d.aktiv !== undefined ? { aktiv: d.aktiv } : {}) },
        );
        const grund = pruefe(alle, vorher);
        if (grund) return { grund };
        const [r] = await tx`
          UPDATE benutzer SET
            verwaltung = coalesce(${d.verwaltung ?? null}::text[], verwaltung),
            aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv),
            deaktiviert = CASE WHEN ${d.aktiv ?? null}::boolean IS NULL THEN deaktiviert
              WHEN ${d.aktiv ?? null}::boolean THEN NULL WHEN aktiv THEN now() ELSE deaktiviert END
          WHERE id = ${id} AND haushalt_id = ${haushaltId}
          RETURNING *`;
        return { benutzer: alsBenutzer(r) };
      }) as Promise<{ benutzer: Benutzer } | { grund: string }>;
    },
    async setzeAbwesenheit(id, a) {
      const [r] = await sql`
        UPDATE benutzer SET abwesend = ${a.an}, abwesend_von = ${a.von}::date, abwesend_bis = ${a.bis}::date,
          vertreter_id = ${istUuid(a.vertreterId) ? a.vertreterId : null}::uuid
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async setzeHash(id, hash) {
      await sql`UPDATE benutzer SET passwort_hash = ${hash} WHERE id = ${id}`;
    },
    async ersetzeHash(id, alt, neu) {
      const r = await sql`UPDATE benutzer SET passwort_hash = ${neu} WHERE id = ${id} AND passwort_hash = ${alt}`;
      return r.count === 1;
    },
    async notiereAnmeldung(id) {
      await sql`UPDATE benutzer SET letzte_anmeldung = now() WHERE id = ${id}`;
    },
  } satisfies Partial<KontoRepo>;
}

/** Dienstkonten der Pakete und Systemkonten. */
function pgKontenOhneMensch(sql: postgres.Sql, haushaltId: string) {
  return {
    async dienstkonto(paketId) {
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'dienst' AND paket_id = ${paketId}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async legeDienstkontoAn(d) {
      const [r] = await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, art, paket_id)
        VALUES (${d.id}, ${haushaltId}, ${dienstEmail(d.paketId, haushaltId)}, ${d.name}, 'mitglied', NULL, 'dienst', ${d.paketId})
        RETURNING *`;
      return alsBenutzer(r);
    },
    async listeDienstkonten() {
      return (await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'dienst' ORDER BY paket_id`).map(alsBenutzer);
    },
    async systemkonto(kennung) {
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' AND systemkonto = ${kennung}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async legeSystemkontoAn(d) {
      // Gleichzeitiger Start zweier Server: der eindeutige Index entscheidet, beide bekommen dasselbe Konto.
      await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash, art, systemkonto)
        VALUES (${d.id}, ${haushaltId}, ${systemEmail(d.kennung, haushaltId)}, ${d.name}, 'mitglied', NULL, 'system', ${d.kennung})
        ON CONFLICT DO NOTHING`;
      const [r] = await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' AND systemkonto = ${d.kennung}`;
      return alsBenutzer(r);
    },
    async listeSystemkonten() {
      return (await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} AND art = 'system' ORDER BY systemkonto`).map(alsBenutzer);
    },
  } satisfies Partial<KontoRepo>;
}

/** Sitzungen: anlegen, holen, berühren, auflisten und beenden. */
function pgSitzungen(sql: postgres.Sql, haushaltId: string) {
  return {
    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      await sql`
        INSERT INTO sitzungen (schluessel_hash, benutzer_id, ablauf, geraet, ip, vertretung_id, anmeldung_voll)
        VALUES (${hash}, ${benutzerId}, ${ablauf}, ${info.geraet.slice(0, 400)}, ${info.ip.slice(0, 64)}, ${info.vertretungId ?? null}, ${info.voll ? new Date() : null})`;
      // Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
      await sql`DELETE FROM sitzungen WHERE ablauf < now()`;
    },
    async holeSitzung(hash) {
      const [r] =
        await sql`SELECT id, benutzer_id, ablauf, zuletzt_aktiv, vertretung_id, erstellt, anmeldung_voll, verwaltung_seit, verwaltung_aktiv, verwaltung_bestaetigt, frisch FROM sitzungen WHERE schluessel_hash = ${hash}`;
      return r ? alsSitzung(r) : undefined;
    },
    async holeAnmeldung(hash) {
      // Gültigkeit der Sitzung, Haushalt, „aktiv“ und Art der Person in derselben Abfrage (Bedingung Sicherheit, #747);
      // dazu der Haushaltsstand für die Zwischenspeicher dieser Anfrage (#741).
      const [r] = await sql`
        SELECT b.*, s.id AS s_id, s.benutzer_id AS s_benutzer_id, s.ablauf AS s_ablauf, s.zuletzt_aktiv AS s_zuletzt_aktiv,
          s.vertretung_id AS s_vertretung_id, s.erstellt AS s_erstellt, s.anmeldung_voll AS s_anmeldung_voll,
          s.verwaltung_seit AS s_verwaltung_seit, s.verwaltung_aktiv AS s_verwaltung_aktiv,
          s.verwaltung_bestaetigt AS s_verwaltung_bestaetigt, s.frisch AS s_frisch, ${standSpalten(sql, haushaltId)}
        FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id AND b.haushalt_id = ${haushaltId}
        WHERE s.schluessel_hash = ${hash} AND s.ablauf > now() AND b.aktiv AND b.art IS DISTINCT FROM 'system'`;
      if (!r) return undefined;
      staendeAusZeile(sql, haushaltId, r);
      const s = Object.fromEntries(
        Object.entries(r)
          .filter(([k]) => k.startsWith('s_'))
          .map(([k, v]) => [k.slice(2), v]),
      );
      return { sitzung: alsSitzung(s), benutzer: alsBenutzer(r) };
    },
    async beruehreSitzung(hash) {
      await sql`UPDATE sitzungen SET zuletzt_aktiv = now() WHERE schluessel_hash = ${hash}`;
    },
    async listeSitzungen(benutzerId) {
      if (!istUuid(benutzerId)) return [];
      const r = await sql`SELECT * FROM sitzungen WHERE benutzer_id = ${benutzerId} AND ablauf > now() ORDER BY zuletzt_aktiv DESC`;
      return r.map((z) => ({
        hash: z.schluessel_hash as string,
        id: z.id as string,
        benutzerId,
        erstellt: iso(z.erstellt)!,
        zuletztAktiv: iso(z.zuletzt_aktiv)!,
        ablauf: iso(z.ablauf)!,
        geraet: z.geraet as string,
        ip: z.ip as string,
        vertretungId: (z.vertretung_id as string | null) ?? null,
      }));
    },
    async loescheSitzung(hash) {
      await sql`DELETE FROM sitzungen WHERE schluessel_hash = ${hash}`;
    },
    async loescheSitzungMitId(benutzerId, id) {
      if (!istUuid(id) || !istUuid(benutzerId)) return false;
      return (await sql`DELETE FROM sitzungen WHERE id = ${id} AND benutzer_id = ${benutzerId} RETURNING 1`).length === 1;
    },
    async loescheSitzungenVon(id) {
      await sql`DELETE FROM sitzungen WHERE benutzer_id = ${id}`;
    },
  } satisfies Partial<KontoRepo>;
}

/** Verwaltungsmodus der Sitzungen (#818). */
function pgVerwaltungsmodus(sql: postgres.Sql, haushaltId: string) {
  return {
    async sitzungenImVerwaltungsmodus() {
      // Wenige Zeilen (nur Sitzungen mit Modus); keine Historie – gelesen wird nur der Zustand der Sitzungen.
      const r = await sql`
        SELECT b.*, s.id AS s_id, s.benutzer_id AS s_benutzer_id, s.ablauf AS s_ablauf, s.zuletzt_aktiv AS s_zuletzt_aktiv,
          s.vertretung_id AS s_vertretung_id, s.verwaltung_seit AS s_verwaltung_seit, s.verwaltung_aktiv AS s_verwaltung_aktiv
        FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id AND b.haushalt_id = ${haushaltId}
        WHERE s.verwaltung_seit IS NOT NULL AND s.vertretung_id IS NULL AND s.ablauf > now() AND b.aktiv AND b.art = 'person'`;
      return r.map((z) => {
        const s = Object.fromEntries(
          Object.entries(z)
            .filter(([k]) => k.startsWith('s_'))
            .map(([k, v]) => [k.slice(2), v]),
        );
        return { benutzer: alsBenutzer(z), sitzung: alsSitzung(s) };
      });
    },
    async setzeSitzungsVerwaltung(hash, d) {
      const setze = (k: keyof SitzungsVerwaltung) => k in d;
      await sql`
        UPDATE sitzungen SET
          verwaltung_seit = CASE WHEN ${setze('verwaltungSeit')} THEN ${d.verwaltungSeit ?? null}::timestamptz ELSE verwaltung_seit END,
          verwaltung_aktiv = CASE WHEN ${setze('verwaltungAktiv')} THEN ${d.verwaltungAktiv ?? null}::timestamptz ELSE verwaltung_aktiv END,
          verwaltung_bestaetigt = CASE WHEN ${setze('verwaltungBestaetigt')} THEN ${d.verwaltungBestaetigt ?? null}::timestamptz ELSE verwaltung_bestaetigt END,
          frisch = CASE WHEN ${setze('frisch')} THEN ${d.frisch ?? null}::timestamptz ELSE frisch END
        WHERE schluessel_hash = ${hash}`;
    },
    async vergissVerwaltungVon(id) {
      if (!istUuid(id)) return;
      await sql`UPDATE sitzungen SET verwaltung_seit = NULL, verwaltung_aktiv = NULL, verwaltung_bestaetigt = NULL, frisch = NULL WHERE benutzer_id = ${id}`;
    },
  } satisfies Partial<KontoRepo>;
}

/** Vertretungen und persönliche Einstellungen. */
function pgVertretungen(sql: postgres.Sql, haushaltId: string) {
  return {
    async legeVertretungAn(v) {
      await sql`INSERT INTO vertretungen (id, benutzer_id, admin_id, admin_name) VALUES (${v.id}, ${v.benutzerId}, ${v.adminId}, ${v.adminName})`;
    },
    async beendeVertretung(id) {
      await sql`UPDATE vertretungen SET ende = now() WHERE id = ${id} AND ende IS NULL`;
    },
    async holeVertretung(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM vertretungen WHERE id = ${id}`;
      return r ? alsVertretung(r) : undefined;
    },
    async ungeseheneVertretungen(benutzerId) {
      return (await sql`SELECT * FROM vertretungen WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL ORDER BY beginn`).map(
        alsVertretung,
      );
    },
    async alleVertretungen() {
      return (
        await sql`SELECT v.* FROM vertretungen v JOIN benutzer b ON b.id = v.benutzer_id WHERE b.haushalt_id = ${haushaltId} ORDER BY v.beginn`
      ).map(alsVertretung);
    },
    async markiereGesehen(benutzerId) {
      await sql`UPDATE vertretungen SET gesehen = now() WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL`;
    },
    async einstellungen(id) {
      if (!istUuid(id)) return {};
      const r = await sql`SELECT schluessel, wert FROM benutzer_einstellungen WHERE benutzer_id = ${id}`;
      return Object.fromEntries(r.map((z) => [z.schluessel as string, z.wert]));
    },
    async setzeEinstellung(id, k, w) {
      if (w === null) {
        await sql`DELETE FROM benutzer_einstellungen WHERE benutzer_id = ${id} AND schluessel = ${k}`;
        return;
      }
      await sql`
        INSERT INTO benutzer_einstellungen (benutzer_id, schluessel, wert) VALUES (${id}, ${k}, ${sql.json(w as postgres.JSONValue)})
        ON CONFLICT (benutzer_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
    async merkeVorn(id, k, mappeId, max) {
      if (!istUuid(id)) return;
      // Ein Merkposten: Geht er bei einem Absturz verloren, fehlt nur ein Eintrag unter „Zuletzt geöffnet“. Ohne
      // Warten auf die Platte (ohneWarten) hält das Schreiben die Zeile kürzer – unter Last (#615) warteten sonst alle
      // Anfragen desselben Benutzers auf die Sperre.
      // Einträge: `{ id, am }` (#940) oder – von früher – nur die Id als Text.
      const am = new Date().toISOString();
      await sql`
        INSERT INTO benutzer_einstellungen AS b (benutzer_id, schluessel, wert)
        SELECT ${id}::uuid, ${k}::text, jsonb_build_array(jsonb_build_object('id', ${mappeId}::text, 'am', ${am}::text)) FROM ${ohneWarten(sql)}
        ON CONFLICT (benutzer_id, schluessel) DO UPDATE SET wert = (
          SELECT jsonb_agg(x.e ORDER BY x.n) FROM (
            SELECT jsonb_build_object('id', ${mappeId}::text, 'am', ${am}::text) AS e, 0::bigint AS n
            UNION ALL
            (SELECT e, n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.wert) = 'array' THEN b.wert ELSE '[]'::jsonb END) WITH ORDINALITY AS t(e, n)
              WHERE (jsonb_typeof(e) = 'string' AND e #>> '{}' <> ${mappeId}::text)
                 OR (jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'id') = 'string' AND e ->> 'id' <> ${mappeId}::text)
              ORDER BY n LIMIT ${max - 1})) x)
        WHERE NOT (jsonb_typeof(b.wert -> 0) = 'object' AND b.wert -> 0 ->> 'id' = ${mappeId}::text
          AND jsonb_typeof(b.wert -> 0 -> 'am') = 'string' AND (b.wert -> 0 ->> 'am')::timestamptz > ${am}::timestamptz - make_interval(secs => ${ZULETZT_RUHE_MS / 1000}))`;
    },
  } satisfies Partial<KontoRepo>;
}

/** Links zum Setzen des Passworts und der Notfallcode. */
function pgLinksUndNotfall(sql: postgres.Sql, haushaltId: string) {
  return {
    async legeLinkAn(hash, benutzerId, zweck, ablauf) {
      await sql`INSERT INTO passwort_links (schluessel_hash, benutzer_id, zweck, ablauf) VALUES (${hash}, ${benutzerId}, ${zweck}, ${ablauf})`;
    },
    async holeLink(hash) {
      const [r] = await sql`SELECT * FROM passwort_links WHERE schluessel_hash = ${hash}`;
      return r
        ? {
            benutzerId: r.benutzer_id as string,
            zweck: r.zweck as Zweck,
            ablauf: new Date(r.ablauf as string),
            benutzt: r.benutzt ? new Date(r.benutzt as string) : null,
          }
        : undefined;
    },
    async verbraucheLink(hash) {
      const r = await sql`UPDATE passwort_links SET benutzt = now() WHERE schluessel_hash = ${hash} AND benutzt IS NULL RETURNING 1`;
      return r.length === 1;
    },
    async loescheLinksVon(id) {
      await sql`DELETE FROM passwort_links WHERE benutzer_id = ${id}`;
    },
    async notfallcode() {
      const [r] = await sql`SELECT hash, erstellt FROM notfallcode WHERE haushalt_id = ${haushaltId} AND hash IS NOT NULL`;
      return r ? { hash: r.hash as string, erstellt: new Date(r.erstellt as string) } : null;
    },
    async setzeNotfallcode(hash) {
      await sql`
        INSERT INTO notfallcode (haushalt_id, hash, erstellt) VALUES (${haushaltId}, ${hash}, now())
        ON CONFLICT (haushalt_id) DO UPDATE SET hash = EXCLUDED.hash, erstellt = EXCLUDED.erstellt`;
    },
    async loeseNotfallcodeEin(erwartet, benutzerId, passwortHash) {
      if (!istUuid(benutzerId)) return false;
      return sql.begin(async (tx) => {
        // Sperre auf die Zeile des Codes: Eine zweite Anfrage mit demselben Code wartet hier und sieht danach keinen mehr.
        const [r] = await tx`SELECT hash FROM notfallcode WHERE haushalt_id = ${haushaltId} FOR UPDATE`;
        if (!r || r.hash !== erwartet) return false;
        const geaendert =
          await tx`UPDATE benutzer SET passwort_hash = ${passwortHash} WHERE id = ${benutzerId} AND haushalt_id = ${haushaltId} AND art = 'person' RETURNING 1`;
        if (geaendert.length !== 1) return false;
        await tx`UPDATE notfallcode SET hash = NULL WHERE haushalt_id = ${haushaltId}`;
        await tx`DELETE FROM sitzungen WHERE benutzer_id = ${benutzerId}`;
        await tx`DELETE FROM passwort_links WHERE benutzer_id = ${benutzerId}`;
        return true;
      }) as Promise<boolean>;
    },
  } satisfies Partial<KontoRepo>;
}
