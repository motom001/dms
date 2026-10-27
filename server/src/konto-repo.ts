import type postgres from 'postgres';
import type { Benutzer, Rolle } from '../../shared/src/model';
import { istUuid } from './repo';

export type Zweck = 'einladung' | 'zuruecksetzen';
export interface NeuerBenutzer { id: string; email: string; name: string; rolle: Rolle; passwortHash: string | null }
export interface Link { benutzerId: string; zweck: Zweck; ablauf: Date; benutzt: Date | null }

/** Datenzugriff für Benutzer, Sitzungen und Passwort-Links. */
export interface KontoRepo {
  anzahlBenutzer(): Promise<number>;
  listeBenutzer(): Promise<Benutzer[]>;
  holeBenutzer(id: string): Promise<Benutzer | undefined>;
  holeHash(email: string): Promise<{ benutzer: Benutzer; hash: string | null } | undefined>;
  legeBenutzerAn(b: NeuerBenutzer): Promise<Benutzer>;
  aendereBenutzer(id: string, d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv'>>): Promise<Benutzer>;
  setzeHash(id: string, hash: string): Promise<void>;
  notiereAnmeldung(id: string): Promise<void>;
  loescheBenutzer(id: string): Promise<void>;

  legeSitzungAn(hash: string, benutzerId: string, ablauf: Date): Promise<void>;
  holeSitzung(hash: string): Promise<{ benutzerId: string; ablauf: Date } | undefined>;
  loescheSitzung(hash: string): Promise<void>;
  loescheSitzungenVon(benutzerId: string): Promise<void>;

  legeLinkAn(hash: string, benutzerId: string, zweck: Zweck, ablauf: Date): Promise<void>;
  holeLink(hash: string): Promise<Link | undefined>;
  /** Markiert den Link als benutzt; false, wenn er schon benutzt war. */
  verbraucheLink(hash: string): Promise<boolean>;
  loescheLinksVon(benutzerId: string): Promise<void>;
}

/* ---------------- Arbeitsspeicher (Tests) ---------------- */

export function speicherKontoRepo(): KontoRepo {
  const benutzer = new Map<string, Benutzer & { hash: string | null }>();
  const sitzungen = new Map<string, { benutzerId: string; ablauf: Date }>();
  const links = new Map<string, Link>();
  const ohneHash = ({ hash: _h, ...b }: Benutzer & { hash: string | null }): Benutzer => ({ ...b, hatPasswort: !!_h });

  return {
    async anzahlBenutzer() { return benutzer.size; },
    async listeBenutzer() { return [...benutzer.values()].map(ohneHash).sort((a, b) => a.name.localeCompare(b.name, 'de')); },
    async holeBenutzer(id) { const b = benutzer.get(id); return b && ohneHash(b); },
    async holeHash(email) {
      const b = [...benutzer.values()].find((x) => x.email.toLowerCase() === email.toLowerCase());
      return b && { benutzer: ohneHash(b), hash: b.hash };
    },
    async legeBenutzerAn(n) {
      if ([...benutzer.values()].some((x) => x.email.toLowerCase() === n.email.toLowerCase())) throw Object.assign(new Error('doppelt'), { code: '23505' });
      const b = { id: n.id, email: n.email, name: n.name, rolle: n.rolle, aktiv: true, hatPasswort: !!n.passwortHash, erstellt: new Date().toISOString(), letzteAnmeldung: null, hash: n.passwortHash };
      benutzer.set(n.id, b);
      return ohneHash(b);
    },
    async aendereBenutzer(id, d) { const b = { ...benutzer.get(id)!, ...d }; benutzer.set(id, b); return ohneHash(b); },
    async setzeHash(id, hash) { benutzer.get(id)!.hash = hash; },
    async notiereAnmeldung(id) { benutzer.get(id)!.letzteAnmeldung = new Date().toISOString(); },
    async loescheBenutzer(id) {
      benutzer.delete(id);
      for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k);
      for (const [k, l] of links) if (l.benutzerId === id) links.delete(k);
    },
    async legeSitzungAn(hash, benutzerId, ablauf) { sitzungen.set(hash, { benutzerId, ablauf }); },
    async holeSitzung(hash) { return sitzungen.get(hash); },
    async loescheSitzung(hash) { sitzungen.delete(hash); },
    async loescheSitzungenVon(id) { for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k); },
    async legeLinkAn(hash, benutzerId, zweck, ablauf) { links.set(hash, { benutzerId, zweck, ablauf, benutzt: null }); },
    async holeLink(hash) { return links.get(hash); },
    async verbraucheLink(hash) { const l = links.get(hash); if (!l || l.benutzt) return false; l.benutzt = new Date(); return true; },
    async loescheLinksVon(id) { for (const [k, l] of links) if (l.benutzerId === id) links.delete(k); },
  };
}

/* ---------------- PostgreSQL ---------------- */

type Zeile = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const alsBenutzer = (r: Zeile): Benutzer => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  rolle: r.rolle as Rolle,
  aktiv: r.aktiv as boolean,
  hatPasswort: r.passwort_hash != null,
  erstellt: iso(r.erstellt)!,
  letzteAnmeldung: iso(r.letzte_anmeldung),
});

export function pgKontoRepo(sql: postgres.Sql, haushaltId: string): KontoRepo {
  return {
    async anzahlBenutzer() {
      const [r] = await sql`SELECT count(*)::int AS n FROM benutzer`;
      return r.n as number;
    },
    async listeBenutzer() {
      return (await sql`SELECT * FROM benutzer WHERE haushalt_id = ${haushaltId} ORDER BY lower(name), lower(email)`).map(alsBenutzer);
    },
    async holeBenutzer(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`;
      return r ? alsBenutzer(r) : undefined;
    },
    async holeHash(email) {
      const [r] = await sql`SELECT * FROM benutzer WHERE lower(email) = lower(${email}) AND haushalt_id = ${haushaltId}`;
      return r ? { benutzer: alsBenutzer(r), hash: (r.passwort_hash as string | null) ?? null } : undefined;
    },
    async legeBenutzerAn(n) {
      const [r] = await sql`
        INSERT INTO benutzer (id, haushalt_id, email, name, rolle, passwort_hash)
        VALUES (${n.id}, ${haushaltId}, ${n.email}, ${n.name}, ${n.rolle}, ${n.passwortHash})
        RETURNING *`;
      return alsBenutzer(r);
    },
    async aendereBenutzer(id, d) {
      const [r] = await sql`
        UPDATE benutzer SET
          name = coalesce(${d.name ?? null}, name),
          rolle = coalesce(${d.rolle ?? null}, rolle),
          aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv)
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async setzeHash(id, hash) { await sql`UPDATE benutzer SET passwort_hash = ${hash} WHERE id = ${id}`; },
    async notiereAnmeldung(id) { await sql`UPDATE benutzer SET letzte_anmeldung = now() WHERE id = ${id}`; },
    async loescheBenutzer(id) { await sql`DELETE FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`; },

    async legeSitzungAn(hash, benutzerId, ablauf) {
      await sql`INSERT INTO sitzungen (schluessel_hash, benutzer_id, ablauf) VALUES (${hash}, ${benutzerId}, ${ablauf})`;
      // Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
      await sql`DELETE FROM sitzungen WHERE ablauf < now()`;
    },
    async holeSitzung(hash) {
      const [r] = await sql`SELECT benutzer_id, ablauf FROM sitzungen WHERE schluessel_hash = ${hash}`;
      return r ? { benutzerId: r.benutzer_id as string, ablauf: new Date(r.ablauf as string) } : undefined;
    },
    async loescheSitzung(hash) { await sql`DELETE FROM sitzungen WHERE schluessel_hash = ${hash}`; },
    async loescheSitzungenVon(id) { await sql`DELETE FROM sitzungen WHERE benutzer_id = ${id}`; },

    async legeLinkAn(hash, benutzerId, zweck, ablauf) {
      await sql`INSERT INTO passwort_links (schluessel_hash, benutzer_id, zweck, ablauf) VALUES (${hash}, ${benutzerId}, ${zweck}, ${ablauf})`;
    },
    async holeLink(hash) {
      const [r] = await sql`SELECT * FROM passwort_links WHERE schluessel_hash = ${hash}`;
      return r ? { benutzerId: r.benutzer_id as string, zweck: r.zweck as Zweck, ablauf: new Date(r.ablauf as string), benutzt: r.benutzt ? new Date(r.benutzt as string) : null } : undefined;
    },
    async verbraucheLink(hash) {
      const r = await sql`UPDATE passwort_links SET benutzt = now() WHERE schluessel_hash = ${hash} AND benutzt IS NULL RETURNING 1`;
      return r.length === 1;
    },
    async loescheLinksVon(id) { await sql`DELETE FROM passwort_links WHERE benutzer_id = ${id}`; },
  };
}
