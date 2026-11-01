import { randomBytes, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Benutzer } from '../../shared/src/model';
import { Fachfehler } from './fehler';
import { hasheSchluessel } from './passwort';
import { istUuid } from './repo';

/**
 * API-Schlüssel (#20). Ein Schlüssel gehört einem Benutzer und hat höchstens
 * dessen Rechte; zusätzlich „nur lesen“ oder „lesen und schreiben“ und ein
 * optionales Ablaufdatum. Der vollständige Schlüssel ist nur beim Erzeugen
 * sichtbar, danach nur sein Anfang. Gespeichert wird ein SHA-256-Hash.
 *
 * Verwendung: Header „Authorization: Bearer dms_…“ an /api/v1/….
 */
export type Recht = 'lesen' | 'schreiben';
export interface ApiSchluessel {
  id: string; benutzerId: string; name: string; praefix: string; recht: Recht;
  /** Eigenes Recht „Passwörter lesen“ (#46): ?passwoerter=anzeigen liefert Passwortfelder im Klartext. */
  passwoerter: boolean;
  ablauf: string | null; erstellt: string; zuletztBenutzt: string | null;
}
export interface ApiSchluesselRepo {
  liste(benutzerId: string): Promise<ApiSchluessel[]>;
  hole(id: string): Promise<ApiSchluessel | undefined>;
  zuHash(hash: string): Promise<ApiSchluessel | undefined>;
  lege(s: ApiSchluessel & { hash: string }): Promise<void>;
  aendere(id: string, d: Pick<ApiSchluessel, 'name' | 'recht' | 'ablauf' | 'passwoerter'>): Promise<ApiSchluessel>;
  loesche(id: string): Promise<void>;
  benutzt(id: string): Promise<void>;
}

export const PRAEFIX = 'dms_';
const sichtbar = (s: string) => `${s.slice(0, PRAEFIX.length + 6)}…`;

function daten(e: unknown): Pick<ApiSchluessel, 'name' | 'recht' | 'ablauf' | 'passwoerter'> {
  const x = (e ?? {}) as Record<string, unknown>;
  const name = String(x.name ?? '').trim().slice(0, 80);
  if (!name) throw new Fachfehler(422, 'Bitte einen Namen angeben, z. B. „Scanner Büro“.');
  const recht = x.recht === 'schreiben' ? 'schreiben' : x.recht === 'lesen' || x.recht === undefined ? 'lesen' : null;
  if (!recht) throw new Fachfehler(422, 'Recht: „lesen“ oder „schreiben“.');
  let ablauf: string | null = null;
  if (x.ablauf) {
    const t = Date.parse(String(x.ablauf));
    if (Number.isNaN(t)) throw new Fachfehler(422, 'Ablaufdatum ist kein gültiges Datum.');
    if (t < Date.now()) throw new Fachfehler(422, 'Das Ablaufdatum liegt in der Vergangenheit.');
    ablauf = new Date(t).toISOString();
  }
  return { name, recht, ablauf, passwoerter: x.passwoerter === true };
}

export class ApiSchluesselDienst {
  private zuletzt = new Map<string, number>();
  constructor(private repo: ApiSchluesselRepo) {}

  liste(ich: Benutzer) { return this.repo.liste(ich.id); }

  /** Liefert den vollständigen Schlüssel – nur dieses eine Mal. */
  async lege(ich: Benutzer, e: unknown) {
    // #128: Über die API arbeitet nur ein normaler Benutzer – für ihn gelten die Berechtigungen.
    if (ich.rolle === 'admin') throw new Fachfehler(403, 'Administratoren bekommen keine API-Schlüssel. Lege für das Programm einen normalen Benutzer an und erzeuge den Schlüssel mit ihm.');
    const d = daten(e);
    if ((await this.repo.liste(ich.id)).length >= 50) throw new Fachfehler(409, 'Höchstens 50 Schlüssel je Benutzer.');
    const schluessel = `${PRAEFIX}${randomBytes(30).toString('base64url')}`;
    const s: ApiSchluessel = { id: randomUUID(), benutzerId: ich.id, ...d, praefix: sichtbar(schluessel), erstellt: new Date().toISOString(), zuletztBenutzt: null };
    await this.repo.lege({ ...s, hash: hasheSchluessel(schluessel) });
    return { ...s, schluessel };
  }

  /**
   * Schlüssel für ein Dienstkonto (#338): ersetzt alle bisherigen. Der Klartext bleibt nur im Speicher
   * des Läufers; nach einem Neustart gibt es einen neuen.
   */
  async fuerDienstkonto(b: Benutzer, recht: Recht): Promise<string> {
    if (b.art !== 'dienst') throw new Error('Nur für Dienstkonten.');
    for (const s of await this.repo.liste(b.id)) await this.repo.loesche(s.id);
    const schluessel = `${PRAEFIX}${randomBytes(30).toString('base64url')}`;
    await this.repo.lege({ id: randomUUID(), benutzerId: b.id, name: 'Paket-Läufer', praefix: sichtbar(schluessel), recht, passwoerter: false, ablauf: null, erstellt: new Date().toISOString(), zuletztBenutzt: null, hash: hasheSchluessel(schluessel) });
    return schluessel;
  }

  private async eigener(ich: Benutzer, id: string) {
    const s = istUuid(id) ? await this.repo.hole(id) : undefined;
    if (!s || s.benutzerId !== ich.id) throw new Fachfehler(404, 'Diesen Schlüssel gibt es nicht.');
    return s;
  }

  async aendere(ich: Benutzer, id: string, e: unknown) {
    await this.eigener(ich, id);
    return this.repo.aendere(id, daten(e));
  }

  async loesche(ich: Benutzer, id: string) {
    await this.eigener(ich, id);
    await this.repo.loesche(id);
  }

  /** Schlüssel aus dem Authorization-Header prüfen; undefined, wenn keiner angegeben ist. */
  async pruefe(kopf: string | undefined): Promise<ApiSchluessel | undefined> {
    const m = /^Bearer\s+(\S+)$/i.exec(kopf ?? '');
    if (!m) return undefined;
    if (!m[1].startsWith(PRAEFIX)) throw new Fachfehler(401, 'Unbekanntes Schlüsselformat. Erwartet: Authorization: Bearer dms_…');
    const s = await this.repo.zuHash(hasheSchluessel(m[1]));
    if (!s) throw new Fachfehler(401, 'Dieser API-Schlüssel ist ungültig oder wurde gelöscht.');
    if (s.ablauf && Date.parse(s.ablauf) < Date.now()) throw new Fachfehler(401, `Dieser API-Schlüssel ist am ${s.ablauf.slice(0, 10)} abgelaufen.`);
    // „Zuletzt benutzt“ höchstens einmal je Minute schreiben.
    if (Date.now() - (this.zuletzt.get(s.id) ?? 0) > 60_000) { this.zuletzt.set(s.id, Date.now()); await this.repo.benutzt(s.id); }
    return s;
  }
}

/* ---------- Speicher ---------- */

export function speicherApiSchluesselRepo(): ApiSchluesselRepo {
  const liste = new Map<string, ApiSchluessel & { hash: string }>();
  const ohne = ({ hash: _h, ...s }: ApiSchluessel & { hash: string }): ApiSchluessel => ({ ...s });
  return {
    async liste(b) { return [...liste.values()].filter((s) => s.benutzerId === b).map(ohne); },
    async hole(id) { const s = liste.get(id); return s && ohne(s); },
    async zuHash(h) { const s = [...liste.values()].find((x) => x.hash === h); return s && ohne(s); },
    async lege(s) { liste.set(s.id, { ...s }); },
    async aendere(id, d) { const s = { ...liste.get(id)!, ...d }; liste.set(id, s); return ohne(s); },
    async loesche(id) { liste.delete(id); },
    async benutzt(id) { const s = liste.get(id); if (s) s.zuletztBenutzt = new Date().toISOString(); },
  };
}

export function pgApiSchluesselRepo(sql: postgres.Sql): ApiSchluesselRepo {
  const iso = (v: unknown) => (v ? (v as Date).toISOString() : null);
  const als = (r: Record<string, unknown>): ApiSchluessel => ({
    id: r.id as string, benutzerId: r.benutzer_id as string, name: r.name as string, praefix: r.praefix as string,
    recht: r.recht as Recht, passwoerter: r.passwoerter === true, ablauf: iso(r.ablauf), erstellt: iso(r.erstellt)!, zuletztBenutzt: iso(r.zuletzt_benutzt),
  });
  return {
    async liste(b) { return istUuid(b) ? (await sql`SELECT * FROM api_schluessel WHERE benutzer_id = ${b} ORDER BY erstellt`).map(als) : []; },
    async hole(id) { const [r] = await sql`SELECT * FROM api_schluessel WHERE id = ${id}`; return r ? als(r) : undefined; },
    async zuHash(h) { const [r] = await sql`SELECT * FROM api_schluessel WHERE hash = ${h}`; return r ? als(r) : undefined; },
    async lege(s) {
      await sql`INSERT INTO api_schluessel (id, benutzer_id, name, praefix, hash, recht, passwoerter, ablauf)
        VALUES (${s.id}, ${s.benutzerId}, ${s.name}, ${s.praefix}, ${s.hash}, ${s.recht}, ${s.passwoerter}, ${s.ablauf})`;
    },
    async aendere(id, d) {
      const [r] = await sql`UPDATE api_schluessel SET name = ${d.name}, recht = ${d.recht}, passwoerter = ${d.passwoerter}, ablauf = ${d.ablauf} WHERE id = ${id} RETURNING *`;
      return als(r);
    },
    async loesche(id) { await sql`DELETE FROM api_schluessel WHERE id = ${id}`; },
    async benutzt(id) { await sql`UPDATE api_schluessel SET zuletzt_benutzt = now() WHERE id = ${id}`; },
  };
}
