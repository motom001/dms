import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Dateispeicher } from './dateispeicher';
import { erkenneAnzeigbar } from './dienst';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Fehlermeldungen von Benutzern an die Administratoren (#70): eigene Beschreibung, bis zu zwei
 * Screenshots und die technischen Angaben von Server und Gerät. Nur Administratoren sehen sie;
 * eine Rückmeldung an den Benutzer gibt es im DMS bewusst nicht.
 */
export interface FehlerBild { nr: number; name: string; mime: string; groesse: number; sha256: string }
export interface Fehlermeldung {
  id: string; benutzerId: string | null; erstellt: string; text: string;
  angaben: Record<string, unknown>; bilder: FehlerBild[]; erledigt: string | null; erledigtVon: string | null;
}

export interface FehlerRepo {
  lege(m: Fehlermeldung): Promise<void>;
  liste(erledigt: boolean): Promise<Fehlermeldung[]>;
  hole(id: string): Promise<Fehlermeldung | undefined>;
  setzeErledigt(id: string, von: string | null): Promise<void>;
  loesche(id: string): Promise<void>;
  zaehleOffen(): Promise<number>;
  shaInGebrauch(sha: string): Promise<boolean>;
}

export const FEHLER_TEXT_MAX = 5000;
export const FEHLER_BILDER_MAX = 2;
export const FEHLER_BILD_BYTES = 10 * 1024 * 1024;
const BILDTYPEN = new Set(['image/png', 'image/jpeg', 'image/webp']);
const log = protokoll.modul('system');

/** Nur einfache, kleine Werte aus den Angaben des Geräts übernehmen (keine Riesen-Objekte). */
function begrenze(v: unknown, tiefe = 0): unknown {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (tiefe > 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => begrenze(x, tiefe + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 60).map(([k, x]) => [k.slice(0, 60), begrenze(x, tiefe + 1)]));
  return undefined;
}

export class Fehlermeldungen {
  constructor(private repo: FehlerRepo, private dateien: Dateispeicher) {}

  async melde(benutzerId: string | null, eingabe: unknown): Promise<{ id: string }> {
    const e = (eingabe ?? {}) as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text.replace(/\r\n?/g, '\n').trim() : '';
    if (!text) throw new Fachfehler(422, 'Bitte beschreibe kurz, was passiert ist.');
    if (text.length > FEHLER_TEXT_MAX) throw new Fachfehler(422, `Höchstens ${FEHLER_TEXT_MAX.toLocaleString('de-DE')} Zeichen.`);
    const roh = Array.isArray(e.bilder) ? e.bilder : [];
    if (roh.length > FEHLER_BILDER_MAX) throw new Fachfehler(422, `Höchstens ${FEHLER_BILDER_MAX} Bilder.`);
    const bilder: FehlerBild[] = [];
    for (const [i, b] of roh.entries()) {
      const x = (b ?? {}) as Record<string, unknown>;
      const inhalt = typeof x.daten === 'string' ? Buffer.from(x.daten.replace(/^data:[^,]*,/, ''), 'base64') : Buffer.alloc(0);
      if (!inhalt.length) throw new Fachfehler(422, 'Ein Bild ist leer.');
      if (inhalt.length > FEHLER_BILD_BYTES) throw new Fachfehler(413, `Ein Bild darf höchstens ${FEHLER_BILD_BYTES / 1024 / 1024} MB groß sein.`);
      const mime = erkenneAnzeigbar(inhalt);
      if (!mime || !BILDTYPEN.has(mime)) throw new Fachfehler(422, 'Bilder bitte als PNG, JPEG oder WebP.');
      const sha256 = createHash('sha256').update(inhalt).digest('hex');
      await this.dateien.schreibe(sha256, inhalt);
      const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 120) : `Bild ${i + 1}`;
      bilder.push({ nr: i + 1, name, mime, groesse: inhalt.length, sha256 });
    }
    const id = randomUUID();
    const angaben = begrenze(e.angaben ?? {}) as Record<string, unknown>;
    await this.repo.lege({ id, benutzerId, erstellt: new Date().toISOString(), text, angaben, bilder, erledigt: null, erledigtVon: null });
    log.info('Fehlermeldung eingegangen', { id, bilder: bilder.length });
    return { id };
  }

  liste(erledigt = false) { return this.repo.liste(erledigt); }
  offen() { return this.repo.zaehleOffen(); }

  async hole(id: string) {
    const m = await this.repo.hole(id);
    if (!m) throw new Fachfehler(404, 'Diese Fehlermeldung gibt es nicht.');
    return m;
  }

  async bild(id: string, nr: number) {
    const m = await this.hole(id);
    const b = m.bilder.find((x) => x.nr === nr);
    if (!b) throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
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
}

/* ---------- Speicher ---------- */

const alsMeldung = (r: Record<string, unknown>): Fehlermeldung => ({
  id: r.id as string, benutzerId: (r.benutzer_id as string | null) ?? null,
  erstellt: new Date(r.erstellt as string).toISOString(), text: r.text as string,
  angaben: (r.angaben as Record<string, unknown>) ?? {}, bilder: (r.bilder as FehlerBild[]) ?? [],
  erledigt: r.erledigt ? new Date(r.erledigt as string).toISOString() : null, erledigtVon: (r.erledigt_von as string | null) ?? null,
});

export function pgFehlerRepo(sql: postgres.Sql, haushaltId: string): FehlerRepo {
  return {
    async lege(m) {
      await sql`INSERT INTO fehlermeldungen (id, haushalt_id, benutzer_id, text, angaben, bilder)
        VALUES (${m.id}, ${haushaltId}, ${m.benutzerId}, ${m.text}, ${sql.json(m.angaben as postgres.JSONValue)}, ${sql.json(m.bilder as unknown as postgres.JSONValue)})`;
    },
    async liste(erledigt) {
      const r = await sql`SELECT * FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND (erledigt IS NOT NULL) = ${erledigt} ORDER BY erstellt DESC LIMIT 200`;
      return r.map(alsMeldung);
    },
    async hole(id) {
      const [r] = await sql`SELECT * FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsMeldung(r) : undefined;
    },
    async setzeErledigt(id, von) {
      await sql`UPDATE fehlermeldungen SET erledigt = ${von === null ? null : sql`now()`}, erledigt_von = ${von} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loesche(id) { await sql`DELETE FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async zaehleOffen() {
      const [r] = await sql`SELECT count(*)::int AS n FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND erledigt IS NULL`;
      return r.n as number;
    },
    async shaInGebrauch(sha) {
      const [r] = await sql`SELECT EXISTS (SELECT 1 FROM fehlermeldungen WHERE haushalt_id = ${haushaltId} AND bilder @> ${sql.json([{ sha256: sha }])}) AS ja`;
      return r.ja as boolean;
    },
  };
}

export function speicherFehlerRepo(): FehlerRepo {
  const m = new Map<string, Fehlermeldung>();
  const kopie = <T>(x: T): T => structuredClone(x);
  return {
    async lege(x) { m.set(x.id, kopie(x)); },
    async liste(erledigt) { return [...m.values()].filter((x) => !!x.erledigt === erledigt).sort((a, b) => b.erstellt.localeCompare(a.erstellt)).map(kopie); },
    async hole(id) { const x = m.get(id); return x && kopie(x); },
    async setzeErledigt(id, von) { const x = m.get(id); if (x) m.set(id, { ...x, erledigt: von === null ? null : new Date().toISOString(), erledigtVon: von }); },
    async loesche(id) { m.delete(id); },
    async zaehleOffen() { return [...m.values()].filter((x) => !x.erledigt).length; },
    async shaInGebrauch(sha) { return [...m.values()].some((x) => x.bilder.some((b) => b.sha256 === sha)); },
  };
}
