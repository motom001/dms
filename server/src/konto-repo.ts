import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Benutzer, Rolle, Sitzung, Vertretung } from '../../shared/src/model';
import { istUuid } from './repo';

export type Zweck = 'einladung' | 'zuruecksetzen';
export interface NeuerBenutzer { id: string; email: string; name: string; rolle: Rolle; passwortHash: string | null }
export interface Link { benutzerId: string; zweck: Zweck; ablauf: Date; benutzt: Date | null }
export interface SitzungsInfo { geraet: string; ip: string; vertretungId?: string | null }
export interface SitzungIntern { id: string; benutzerId: string; ablauf: Date; zuletztAktiv: Date; vertretungId: string | null }

/** Datenzugriff für Benutzer, Sitzungen und Passwort-Links. */
export interface KontoRepo {
  anzahlBenutzer(): Promise<number>;
  listeBenutzer(): Promise<Benutzer[]>;
  holeBenutzer(id: string): Promise<Benutzer | undefined>;
  holeHash(email: string): Promise<{ benutzer: Benutzer; hash: string | null } | undefined>;
  legeBenutzerAn(b: NeuerBenutzer): Promise<Benutzer>;
  aendereBenutzer(id: string, d: Partial<Pick<Benutzer, 'name' | 'rolle' | 'aktiv' | 'email'>>): Promise<Benutzer>;
  setzeHash(id: string, hash: string): Promise<void>;
  notiereAnmeldung(id: string): Promise<void>;
  loescheBenutzer(id: string): Promise<void>;

  legeSitzungAn(hash: string, benutzerId: string, ablauf: Date, info: SitzungsInfo): Promise<void>;
  holeSitzung(hash: string): Promise<SitzungIntern | undefined>;
  /** Letzte Aktivität auf jetzt setzen. */
  beruehreSitzung(hash: string): Promise<void>;
  /** Gültige Sitzungen eines Benutzers, neueste Aktivität zuerst. */
  listeSitzungen(benutzerId: string): Promise<Array<Sitzung & { hash: string }>>;
  loescheSitzung(hash: string): Promise<void>;
  loescheSitzungMitId(benutzerId: string, id: string): Promise<boolean>;
  loescheSitzungenVon(benutzerId: string): Promise<void>;

  legeVertretungAn(v: { id: string; benutzerId: string; adminId: string; adminName: string }): Promise<void>;
  beendeVertretung(id: string): Promise<void>;
  holeVertretung(id: string): Promise<Vertretung | undefined>;
  /** Vertretungen, die der Benutzer noch nicht gesehen hat. */
  ungeseheneVertretungen(benutzerId: string): Promise<Vertretung[]>;
  markiereGesehen(benutzerId: string): Promise<void>;

  legeLinkAn(hash: string, benutzerId: string, zweck: Zweck, ablauf: Date): Promise<void>;
  holeLink(hash: string): Promise<Link | undefined>;
  /** Markiert den Link als benutzt; false, wenn er schon benutzt war. */
  verbraucheLink(hash: string): Promise<boolean>;
  loescheLinksVon(benutzerId: string): Promise<void>;
}

/* ---------------- Arbeitsspeicher (Tests) ---------------- */

export function speicherKontoRepo(): KontoRepo {
  const benutzer = new Map<string, Benutzer & { hash: string | null }>();
  const sitzungen = new Map<string, SitzungIntern & { erstellt: Date; geraet: string; ip: string }>();
  const vertretungen = new Map<string, Vertretung & { gesehen: Date | null }>();
  const links = new Map<string, Link>();
  const ohneHash = ({ hash: _h, ...b }: Benutzer & { hash: string | null }): Benutzer => ({ ...b, hatPasswort: !!_h });

  return {
    async anzahlBenutzer() { return benutzer.size; },
    async listeBenutzer() {
      const zuletzt = (id: string) => {
        const t = [...sitzungen.values()].filter((x) => x.benutzerId === id && x.ablauf.getTime() > Date.now()).map((x) => x.zuletztAktiv.getTime());
        return t.length ? new Date(Math.max(...t)).toISOString() : null;
      };
      return [...benutzer.values()].map((b) => ({ ...ohneHash(b), zuletztAktiv: zuletzt(b.id) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
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
    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      sitzungen.set(hash, { id: randomUUID(), benutzerId, ablauf, zuletztAktiv: new Date(), erstellt: new Date(), geraet: info.geraet, ip: info.ip, vertretungId: info.vertretungId ?? null });
    },
    async holeSitzung(hash) { const x = sitzungen.get(hash); return x && { ...x }; },
    async beruehreSitzung(hash) { const x = sitzungen.get(hash); if (x) x.zuletztAktiv = new Date(); },
    async listeSitzungen(benutzerId) {
      return [...sitzungen].filter(([, x]) => x.benutzerId === benutzerId && x.ablauf.getTime() > Date.now())
        .map(([hash, x]) => ({ hash, id: x.id, benutzerId, erstellt: x.erstellt.toISOString(), zuletztAktiv: x.zuletztAktiv.toISOString(), ablauf: x.ablauf.toISOString(), geraet: x.geraet, ip: x.ip, vertretungId: x.vertretungId }))
        .sort((a, b) => b.zuletztAktiv.localeCompare(a.zuletztAktiv));
    },
    async loescheSitzung(hash) { sitzungen.delete(hash); },
    async loescheSitzungMitId(benutzerId, id) {
      for (const [k, x] of sitzungen) if (x.id === id && x.benutzerId === benutzerId) { sitzungen.delete(k); return true; }
      return false;
    },
    async legeVertretungAn(v) { vertretungen.set(v.id, { ...v, beginn: new Date().toISOString(), ende: null, gesehen: null }); },
    async beendeVertretung(id) { const v = vertretungen.get(id); if (v && !v.ende) v.ende = new Date().toISOString(); },
    async holeVertretung(id) { const v = vertretungen.get(id); return v && { id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende }; },
    async ungeseheneVertretungen(benutzerId) {
      return [...vertretungen.values()].filter((v) => v.benutzerId === benutzerId && !v.gesehen)
        .map((v) => ({ id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende }));
    },
    async markiereGesehen(benutzerId) { for (const v of vertretungen.values()) if (v.benutzerId === benutzerId && !v.gesehen) v.gesehen = new Date(); },
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

const alsVertretung = (r: Zeile): Vertretung => ({
  id: r.id as string, benutzerId: r.benutzer_id as string, adminId: (r.admin_id as string | null) ?? null,
  adminName: r.admin_name as string, beginn: iso(r.beginn)!, ende: iso(r.ende),
});

export function pgKontoRepo(sql: postgres.Sql, haushaltId: string): KontoRepo {
  return {
    async anzahlBenutzer() {
      const [r] = await sql`SELECT count(*)::int AS n FROM benutzer`;
      return r.n as number;
    },
    async listeBenutzer() {
      const r = await sql`
        SELECT b.*, (SELECT max(s.zuletzt_aktiv) FROM sitzungen s WHERE s.benutzer_id = b.id AND s.ablauf > now()) AS zuletzt_aktiv
        FROM benutzer b WHERE b.haushalt_id = ${haushaltId} ORDER BY lower(b.name), lower(b.email)`;
      return r.map((z) => ({ ...alsBenutzer(z), zuletztAktiv: iso(z.zuletzt_aktiv) }));
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
          email = coalesce(${d.email ?? null}, email),
          rolle = coalesce(${d.rolle ?? null}, rolle),
          aktiv = coalesce(${d.aktiv ?? null}::boolean, aktiv)
        WHERE id = ${id} AND haushalt_id = ${haushaltId}
        RETURNING *`;
      return alsBenutzer(r);
    },
    async setzeHash(id, hash) { await sql`UPDATE benutzer SET passwort_hash = ${hash} WHERE id = ${id}`; },
    async notiereAnmeldung(id) { await sql`UPDATE benutzer SET letzte_anmeldung = now() WHERE id = ${id}`; },
    async loescheBenutzer(id) { await sql`DELETE FROM benutzer WHERE id = ${id} AND haushalt_id = ${haushaltId}`; },

    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      await sql`
        INSERT INTO sitzungen (schluessel_hash, benutzer_id, ablauf, geraet, ip, vertretung_id)
        VALUES (${hash}, ${benutzerId}, ${ablauf}, ${info.geraet.slice(0, 400)}, ${info.ip.slice(0, 64)}, ${info.vertretungId ?? null})`;
      // Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
      await sql`DELETE FROM sitzungen WHERE ablauf < now()`;
    },
    async holeSitzung(hash) {
      const [r] = await sql`SELECT id, benutzer_id, ablauf, zuletzt_aktiv, vertretung_id FROM sitzungen WHERE schluessel_hash = ${hash}`;
      return r ? {
        id: r.id as string, benutzerId: r.benutzer_id as string, ablauf: new Date(r.ablauf as string),
        zuletztAktiv: new Date(r.zuletzt_aktiv as string), vertretungId: (r.vertretung_id as string | null) ?? null,
      } : undefined;
    },
    async beruehreSitzung(hash) { await sql`UPDATE sitzungen SET zuletzt_aktiv = now() WHERE schluessel_hash = ${hash}`; },
    async listeSitzungen(benutzerId) {
      if (!istUuid(benutzerId)) return [];
      const r = await sql`SELECT * FROM sitzungen WHERE benutzer_id = ${benutzerId} AND ablauf > now() ORDER BY zuletzt_aktiv DESC`;
      return r.map((z) => ({
        hash: z.schluessel_hash as string, id: z.id as string, benutzerId, erstellt: iso(z.erstellt)!, zuletztAktiv: iso(z.zuletzt_aktiv)!,
        ablauf: iso(z.ablauf)!, geraet: z.geraet as string, ip: z.ip as string, vertretungId: (z.vertretung_id as string | null) ?? null,
      }));
    },
    async loescheSitzung(hash) { await sql`DELETE FROM sitzungen WHERE schluessel_hash = ${hash}`; },
    async loescheSitzungMitId(benutzerId, id) {
      if (!istUuid(id) || !istUuid(benutzerId)) return false;
      return (await sql`DELETE FROM sitzungen WHERE id = ${id} AND benutzer_id = ${benutzerId} RETURNING 1`).length === 1;
    },
    async legeVertretungAn(v) {
      await sql`INSERT INTO vertretungen (id, benutzer_id, admin_id, admin_name) VALUES (${v.id}, ${v.benutzerId}, ${v.adminId}, ${v.adminName})`;
    },
    async beendeVertretung(id) { await sql`UPDATE vertretungen SET ende = now() WHERE id = ${id} AND ende IS NULL`; },
    async holeVertretung(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM vertretungen WHERE id = ${id}`;
      return r ? alsVertretung(r) : undefined;
    },
    async ungeseheneVertretungen(benutzerId) {
      return (await sql`SELECT * FROM vertretungen WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL ORDER BY beginn`).map(alsVertretung);
    },
    async markiereGesehen(benutzerId) { await sql`UPDATE vertretungen SET gesehen = now() WHERE benutzer_id = ${benutzerId} AND gesehen IS NULL`; },
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
