import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Dateispeicher } from '../dateien/dateispeicher';
import { erkenneAnzeigbar } from '../dokumente';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';
import { gebietsschema } from '../../../shared/src/sprache';
import { FEHLER_BILD_BYTES, MB } from '../grundlagen/grenzen';

/**
 * Fehlermeldungen von Benutzern an die Administratoren (#70): eigene Beschreibung, bis zu zwei
 * Screenshots und die technischen Angaben von Server und Gerät. Nur Administratoren sehen sie ganz.
 *
 * „Meine Meldungen“ (#1331): Der Melder sieht nur seine eigenen – Datum, Anfang des Textes und „offen“ oder „erledigt“.
 * Bewusst kein Ticketsystem: keine Antworten, kein „gelesen“, keine Benachrichtigung. Löscht die Verwaltung eine
 * Meldung, sind Text, Angaben und Bilder wirklich weg; für den Melder bleibt nur ein Rest mit Datum und „erledigt“.
 */
export interface FehlerBild {
  nr: number;
  name: string;
  mime: string;
  groesse: number;
  sha256: string;
}
export interface Fehlermeldung {
  id: string;
  benutzerId: string | null;
  erstellt: string;
  text: string;
  angaben: Record<string, unknown>;
  bilder: FehlerBild[];
  erledigt: string | null;
  erledigtVon: string | null;
}

/** Eine eigene Meldung in „Meine Meldungen“ (#1331): bei einer gelöschten ohne Text (`anfang: null`). */
export interface MeineFehlermeldung {
  id: string;
  erstellt: string;
  anfang: string | null;
  erledigt: string | null;
}

export interface FehlerRepo {
  lege(m: Fehlermeldung): Promise<void>;
  /** Nur die Meldungen dieser Person, neueste zuerst – auch die gelöschten (als erledigt, ohne Inhalt). */
  meine(benutzerId: string): Promise<MeineFehlermeldung[]>;
  liste(erledigt: boolean): Promise<Fehlermeldung[]>;
  hole(id: string): Promise<Fehlermeldung | undefined>;
  setzeErledigt(id: string, von: string | null): Promise<void>;
  /** Löschen (#1331): Inhalt entfernen; hat die Meldung einen Melder, bleibt ein Rest mit Datum und „erledigt“. */
  loesche(id: string): Promise<void>;
  /**
   * Person gelöscht (Entscheidung Thomas 18.11., Nachtrag zu #1331): ihre Reste gelöschter Meldungen mit weg. In Postgres
   * hat `ON DELETE SET NULL` den Melder dann schon geleert – darum zählen dort auch Reste ohne Melder (die es sonst nicht
   * gibt, denn eine Meldung ohne Melder wird beim Löschen ganz entfernt). Meldungen, die noch da sind, bleiben.
   */
  loescheResteVon(benutzerId: string): Promise<number>;
  zaehleOffen(): Promise<number>;
  shaInGebrauch(sha: string): Promise<boolean>;
}

export const FEHLER_TEXT_MAX = 5000;
/** So viel vom Text zeigt „Meine Meldungen“ (#1331). */
const FEHLER_ANFANG_MAX = 120;
const anfangVon = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > FEHLER_ANFANG_MAX ? `${t.slice(0, FEHLER_ANFANG_MAX - 1).trimEnd()}…` : t;
};
export const FEHLER_BILDER_MAX = 2;
export { FEHLER_BILD_BYTES };
const BILDTYPEN = new Set(['image/png', 'image/jpeg', 'image/webp']);
const log = protokoll.modul('system');

/** Nur einfache, kleine Werte aus den Angaben des Geräts übernehmen (keine Riesen-Objekte). */
function begrenze(v: unknown, tiefe = 0): unknown {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (tiefe > 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => begrenze(x, tiefe + 1));
  if (typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .slice(0, 60)
        .map(([k, x]) => [k.slice(0, 60), begrenze(x, tiefe + 1)]),
    );
  return undefined;
}

export class Fehlermeldungen {
  /** Nach dem Eingang (#677): Ereignis „Fehler gemeldet“ für Automatisierungen (start/pakete.ts verbindet mit dem Kern). */
  beimMelden?: (m: { id: string; benutzerId: string | null; erstellt: string }) => Promise<void>;
  constructor(
    private repo: FehlerRepo,
    private dateien: Dateispeicher,
  ) {}

  async melde(benutzerId: string | null, eingabe: unknown): Promise<{ id: string }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text.replace(/\r\n?/g, '\n').trim() : '';
    if (!text) throw new Fachfehler(422, t('meldungen.fehlermeldungen.bitte-beschreibe-kurz-was'));
    if (text.length > FEHLER_TEXT_MAX)
      throw new Fachfehler(
        422,
        t('meldungen.fehlermeldungen.hoechstens-zeichen', { FEHLER_TEXT_MAX: FEHLER_TEXT_MAX.toLocaleString(gebietsschema()) }),
      );
    const roh = Array.isArray(e.bilder) ? e.bilder : [];
    if (roh.length > FEHLER_BILDER_MAX) throw new Fachfehler(422, t('meldungen.fehlermeldungen.hoechstens-bilder', { FEHLER_BILDER_MAX }));
    const bilder: FehlerBild[] = [];
    for (const [i, b] of roh.entries()) {
      const x = (b ?? {}) as Record<string, unknown>;
      const inhalt = typeof x.daten === 'string' ? Buffer.from(x.daten.replace(/^data:[^,]*,/, ''), 'base64') : Buffer.alloc(0);
      if (!inhalt.length) throw new Fachfehler(422, t('meldungen.fehlermeldungen.ein-bild-ist-leer'));
      if (inhalt.length > FEHLER_BILD_BYTES)
        throw new Fachfehler(413, t('meldungen.fehlermeldungen.ein-bild-darf-hoechstens', { wert: FEHLER_BILD_BYTES / MB }));
      const mime = erkenneAnzeigbar(inhalt);
      if (!mime || !BILDTYPEN.has(mime)) throw new Fachfehler(422, t('meldungen.fehlermeldungen.bilder-bitte-als-png'));
      const sha256 = createHash('sha256').update(inhalt).digest('hex');
      await this.dateien.schreibe(sha256, inhalt);
      const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 120) : `Bild ${i + 1}`;
      bilder.push({ nr: i + 1, name, mime, groesse: inhalt.length, sha256 });
    }
    const id = randomUUID();
    const angaben = begrenze(e.angaben ?? {}) as Record<string, unknown>;
    const erstellt = new Date().toISOString();
    await this.repo.lege({ id, benutzerId, erstellt, text, angaben, bilder, erledigt: null, erledigtVon: null });
    log.info('Fehlermeldung eingegangen', { id, bilder: bilder.length });
    // Die Meldung ist gespeichert – scheitert das Ereignis, steht es nur im Protokoll.
    await this.beimMelden?.({ id, benutzerId, erstellt }).catch((x: Error) =>
      log.warn('Ereignis „Fehler gemeldet“ nicht ausgelöst', { fehler: x.message }),
    );
    return { id };
  }

  liste(erledigt = false) {
    return this.repo.liste(erledigt);
  }
  /** „Meine Meldungen“ (#1331): nur die eigenen. Ohne Person (z. B. Konsole) gibt es keine. */
  async meine(benutzerId: string | null): Promise<MeineFehlermeldung[]> {
    if (!benutzerId) return [];
    return (await this.repo.meine(benutzerId)).map((m) => ({ ...m, anfang: m.anfang === null ? null : anfangVon(m.anfang) }));
  }
  offen() {
    return this.repo.zaehleOffen();
  }

  async hole(id: string) {
    const m = await this.repo.hole(id);
    if (!m) throw new Fachfehler(404, t('meldungen.fehlermeldungen.diese-fehlermeldung-gibt-es'));
    return m;
  }

  async bild(id: string, nr: number) {
    const m = await this.hole(id);
    const b = m.bilder.find((x) => x.nr === nr);
    if (!b) throw new Fachfehler(404, t('meldungen.fehlermeldungen.dieses-bild-gibt-es'));
    return { bild: b, inhalt: await this.dateien.lies(b.sha256) };
  }

  async erledigt(id: string, erledigt: boolean, von: string | null) {
    await this.hole(id);
    await this.repo.setzeErledigt(id, erledigt ? von : null);
    log.info(erledigt ? 'Fehlermeldung erledigt' : 'Fehlermeldung wieder geöffnet', { id });
    return this.hole(id);
  }

  async loesche(id: string) {
    const m = await this.hole(id);
    await this.repo.loesche(id);
    for (const b of m.bilder) if (!(await this.repo.shaInGebrauch(b.sha256))) await this.dateien.loesche(b.sha256);
    log.info('Fehlermeldung gelöscht', { id });
  }

  /** Nach dem Löschen einer Person (Nachtrag zu #1331): Reste ihrer gelöschten Meldungen entfernen. */
  async vergissPerson(benutzerId: string) {
    const n = await this.repo.loescheResteVon(benutzerId);
    if (n) log.info('Reste gelöschter Fehlermeldungen einer gelöschten Person entfernt', { anzahl: n });
  }
}

/* ---------- Speicher ---------- */

const alsMeldung = (r: Record<string, unknown>): Fehlermeldung => ({
  id: r.id as string,
  benutzerId: (r.benutzer_id as string | null) ?? null,
  erstellt: new Date(r.erstellt as string).toISOString(),
  text: r.text as string,
  angaben: (r.angaben as Record<string, unknown>) ?? {},
  bilder: (r.bilder as FehlerBild[]) ?? [],
  erledigt: r.erledigt ? new Date(r.erledigt as string).toISOString() : null,
  erledigtVon: (r.erledigt_von as string | null) ?? null,
});

export function pgFehlerRepo(sql: postgres.Sql, haushaltId: string): FehlerRepo {
  return {
    async lege(m) {
      await sql`INSERT INTO fehlermeldungen (id, haushalt_id, benutzer_id, text, angaben, bilder)
        VALUES (${m.id}, ${haushaltId}, ${m.benutzerId}, ${m.text}, ${sql.json(m.angaben as postgres.JSONValue)}, ${sql.json(m.bilder as unknown as postgres.JSONValue)})`;
    },
    async meine(benutzerId) {
      // Nur der Anfang verlässt die Datenbank; der Rest einer gelöschten Meldung hat keinen Text mehr.
      const r = await sql`SELECT id, erstellt, erledigt, CASE WHEN geloescht IS NULL THEN left(text, ${FEHLER_ANFANG_MAX * 2}) END AS anfang
        FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND benutzer_id = ${benutzerId} ORDER BY erstellt DESC LIMIT 100`;
      return r.map((x) => ({
        id: x.id as string,
        erstellt: new Date(x.erstellt as string).toISOString(),
        anfang: (x.anfang as string | null) ?? null,
        erledigt: x.erledigt ? new Date(x.erledigt as string).toISOString() : null,
      }));
    },
    async liste(erledigt) {
      const r =
        await sql`SELECT * FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND geloescht IS NULL AND (erledigt IS NOT NULL) = ${erledigt} ORDER BY erstellt DESC LIMIT 200`;
      return r.map(alsMeldung);
    },
    async hole(id) {
      const [r] = await sql`SELECT * FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND id = ${id} AND geloescht IS NULL`;
      return r ? alsMeldung(r) : undefined;
    },
    async setzeErledigt(id, von) {
      await sql`UPDATE fehlermeldungen SET erledigt = ${von === null ? null : sql`now()`}, erledigt_von = ${von} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loesche(id) {
      await sql`DELETE FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND id = ${id} AND benutzer_id IS NULL`;
      await sql`UPDATE fehlermeldungen SET text = '', angaben = '{}'::jsonb, bilder = '[]'::jsonb, erledigt = COALESCE(erledigt, now()),
        erledigt_von = NULL, geloescht = now() WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheResteVon(benutzerId) {
      const r = await sql`DELETE FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND geloescht IS NOT NULL
        AND (benutzer_id = ${benutzerId} OR benutzer_id IS NULL)`;
      return r.count;
    },
    async zaehleOffen() {
      const [r] =
        await sql`SELECT count(*)::int AS n FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND erledigt IS NULL AND geloescht IS NULL`;
      return r.n as number;
    },
    async shaInGebrauch(sha) {
      const [r] =
        await sql`SELECT EXISTS (SELECT 1 FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND bilder @> ${sql.json([{ sha256: sha }])}) AS ja`;
      return r.ja as boolean;
    },
  };
}

export function speicherFehlerRepo(): FehlerRepo {
  const m = new Map<string, Fehlermeldung>();
  /** Reste gelöschter Meldungen (#1331): nur, was der Melder noch sieht. */
  const reste = new Map<string, MeineFehlermeldung & { benutzerId: string }>();
  const kopie = <T>(x: T): T => structuredClone(x);
  return {
    async lege(x) {
      m.set(x.id, kopie(x));
    },
    async meine(benutzerId) {
      const da = [...m.values()]
        .filter((x) => x.benutzerId === benutzerId)
        .map((x) => ({ id: x.id, erstellt: x.erstellt, anfang: x.text, erledigt: x.erledigt }));
      const weg = [...reste.values()]
        .filter((x) => x.benutzerId === benutzerId)
        .map((x) => ({ id: x.id, erstellt: x.erstellt, anfang: x.anfang, erledigt: x.erledigt }));
      return [...da, ...weg].sort((a, b) => b.erstellt.localeCompare(a.erstellt));
    },
    async liste(erledigt) {
      return [...m.values()]
        .filter((x) => !!x.erledigt === erledigt)
        .sort((a, b) => b.erstellt.localeCompare(a.erstellt))
        .map(kopie);
    },
    async hole(id) {
      const x = m.get(id);
      return x && kopie(x);
    },
    async setzeErledigt(id, von) {
      const x = m.get(id);
      if (x) m.set(id, { ...x, erledigt: von === null ? null : new Date().toISOString(), erledigtVon: von });
    },
    async loesche(id) {
      const x = m.get(id);
      if (x?.benutzerId)
        reste.set(id, {
          id,
          benutzerId: x.benutzerId,
          erstellt: x.erstellt,
          anfang: null,
          erledigt: x.erledigt ?? new Date().toISOString(),
        });
      m.delete(id);
    },
    async loescheResteVon(benutzerId) {
      let n = 0;
      for (const [k, x] of reste) if (x.benutzerId === benutzerId && reste.delete(k)) n++;
      // Wie `ON DELETE SET NULL` in Postgres: Meldungen, die noch da sind, verlieren nur ihren Melder.
      for (const [k, x] of m) if (x.benutzerId === benutzerId) m.set(k, { ...x, benutzerId: null });
      return n;
    },
    async zaehleOffen() {
      return [...m.values()].filter((x) => !x.erledigt).length;
    },
    async shaInGebrauch(sha) {
      return [...m.values()].some((x) => x.bilder.some((b) => b.sha256 === sha));
    },
  };
}
