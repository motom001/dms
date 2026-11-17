import { randomBytes, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { Benutzer } from '../../../shared/src/model';
import { Fachfehler } from '../grundlagen/fehler';
import { hasheSchluessel } from './passwort';
import { istUuid } from '../repo';
import { t } from '../sprache/sprache';

/**
 * API-Schlüssel (#20). Ein Schlüssel gehört einem Benutzer und hat höchstens
 * dessen Rechte; zusätzlich „nur lesen“, „lesen und schreiben“ oder „nur Zähler“ (#625) und ein
 * optionales Ablaufdatum. Der vollständige Schlüssel ist nur beim Erzeugen
 * sichtbar, danach nur sein Anfang. Gespeichert wird ein SHA-256-Hash.
 *
 * Verwendung: Header „Authorization: Bearer dms_…“ an /api/v1/….
 */
export type Recht = 'lesen' | 'schreiben' | 'zaehler';
/**
 * Stufe „nur Zähler“ (#625): darf nur GET /api/v1/ich/zaehler aufrufen (Zahlen ohne Inhalte), alles andere
 * – auch das Laufwerk und die internen Schnittstellen – beantwortet das DMS mit 403.
 */
export const NUR_ZAEHLER: Recht = 'zaehler';
/** Die einzige Adresse, die ein Schlüssel „nur Zähler“ aufrufen darf. */
export const ZAEHLER_PFAD = '/api/v1/ich/zaehler';
export interface ApiSchluessel {
  id: string;
  benutzerId: string;
  name: string;
  praefix: string;
  recht: Recht;
  /** Eigenes Recht „Passwörter lesen“ (#46): ?passwoerter=anzeigen liefert Passwortfelder im Klartext. */
  passwoerter: boolean;
  ablauf: string | null;
  erstellt: string;
  zuletztBenutzt: string | null;
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
  const name = String(x.name ?? '')
    .trim()
    .slice(0, 80);
  if (!name) throw new Fachfehler(422, t('meldungen.apischluessel.bitte-einen-namen-angeben'));
  const recht: Recht | null =
    x.recht === 'schreiben'
      ? 'schreiben'
      : x.recht === NUR_ZAEHLER
        ? NUR_ZAEHLER
        : x.recht === 'lesen' || x.recht === undefined
          ? 'lesen'
          : null;
  if (!recht) throw new Fachfehler(422, t('api.schluessel.recht-ungueltig'));
  let ablauf: string | null = null;
  if (x.ablauf) {
    const zahl = Date.parse(String(x.ablauf));
    if (Number.isNaN(zahl)) throw new Fachfehler(422, t('meldungen.apischluessel.ablaufdatum-ist-kein-gueltiges'));
    if (zahl < Date.now()) throw new Fachfehler(422, t('meldungen.apischluessel.das-ablaufdatum-liegt-in'));
    ablauf = new Date(zahl).toISOString();
  }
  // „Nur Zähler“ liest keine Mappen, also auch keine Passwörter.
  return { name, recht, ablauf, passwoerter: recht !== NUR_ZAEHLER && x.passwoerter === true };
}

const STUFE: Record<Recht, number> = { zaehler: 0, lesen: 1, schreiben: 2 };

/**
 * Braucht das Anlegen oder Ändern eine erneute Bestätigung (#1352)? Neu: jeder Schlüssel außer „nur Zähler“. Bestehend:
 * sobald er mehr darf als vorher – höheres Recht, Haken „Passwörter“ an, Ablauf entfernt oder später.
 */
export function brauchtBestaetigung(alt: ApiSchluessel | null, neu: Pick<ApiSchluessel, 'recht' | 'passwoerter' | 'ablauf'>): boolean {
  if (!alt) return neu.recht !== NUR_ZAEHLER;
  if (STUFE[neu.recht] > STUFE[alt.recht] || (neu.passwoerter && !alt.passwoerter)) return true;
  return alt.ablauf !== null && (neu.ablauf === null || Date.parse(neu.ablauf) > Date.parse(alt.ablauf));
}

export class ApiSchluesselDienst {
  private zuletzt = new Map<string, number>();
  constructor(private repo: ApiSchluesselRepo) {}

  liste(ich: Benutzer) {
    return this.repo.liste(ich.id);
  }

  /**
   * Liefert den vollständigen Schlüssel – nur dieses eine Mal. `bestaetigt` wirft, wenn die erneute Bestätigung fehlt
   * (#1352: die Route prüft die frische Anmeldung); aufgerufen nur, wenn der Schlüssel sie braucht.
   */
  async lege(ich: Benutzer, e: unknown, bestaetigt: () => void = () => {}) {
    // #128, #818: Über die API arbeitet die Person immer mit ihren Alltagsrechten – ein Schlüssel bekommt nie
    // Verwaltungsrechte (pruefeZugang), auch wenn sie ihn im Verwaltungsmodus anlegt.
    const d = daten(e);
    if (brauchtBestaetigung(null, d)) bestaetigt();
    if ((await this.repo.liste(ich.id)).length >= 50) throw new Fachfehler(409, t('meldungen.apischluessel.hoechstens-50-schluessel-je'));
    const schluessel = `${PRAEFIX}${randomBytes(30).toString('base64url')}`;
    const s: ApiSchluessel = {
      id: randomUUID(),
      benutzerId: ich.id,
      ...d,
      praefix: sichtbar(schluessel),
      erstellt: new Date().toISOString(),
      zuletztBenutzt: null,
    };
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
    await this.repo.lege({
      id: randomUUID(),
      benutzerId: b.id,
      name: t('meldungen.apischluessel.paket-laeufer'),
      praefix: sichtbar(schluessel),
      recht,
      passwoerter: false,
      ablauf: null,
      erstellt: new Date().toISOString(),
      zuletztBenutzt: null,
      hash: hasheSchluessel(schluessel),
    });
    return schluessel;
  }

  private async eigener(ich: Benutzer, id: string) {
    const s = istUuid(id) ? await this.repo.hole(id) : undefined;
    if (!s || s.benutzerId !== ich.id) throw new Fachfehler(404, t('meldungen.apischluessel.diesen-schluessel-gibt-es'));
    return s;
  }

  /** Ändern; bekommt der Schlüssel mehr Rechte (#1352), nur mit erneuter Bestätigung (`bestaetigt` wirft sonst). */
  async aendere(ich: Benutzer, id: string, e: unknown, bestaetigt: () => void = () => {}) {
    const alt = await this.eigener(ich, id);
    const d = daten(e);
    if (brauchtBestaetigung(alt, d)) bestaetigt();
    return this.repo.aendere(id, d);
  }

  async loesche(ich: Benutzer, id: string) {
    await this.eigener(ich, id);
    await this.repo.loesche(id);
  }

  /** Schlüssel aus dem Authorization-Header prüfen; undefined, wenn keiner angegeben ist. */
  async pruefe(kopf: string | undefined): Promise<ApiSchluessel | undefined> {
    const m = /^Bearer\s+(\S+)$/i.exec(kopf ?? '');
    if (!m) return undefined;
    if (!m[1].startsWith(PRAEFIX)) throw new Fachfehler(401, t('meldungen.apischluessel.unbekanntes-schluesselformat'));
    const s = await this.repo.zuHash(hasheSchluessel(m[1]));
    if (!s) throw new Fachfehler(401, t('meldungen.apischluessel.dieser-api-schluessel-ist'));
    if (s.ablauf && Date.parse(s.ablauf) < Date.now())
      throw new Fachfehler(401, t('meldungen.apischluessel.dieser-api-schluessel-ist-2', { ablauf: s.ablauf.slice(0, 10) }));
    // „Zuletzt benutzt“ höchstens einmal je Minute schreiben.
    if (Date.now() - (this.zuletzt.get(s.id) ?? 0) > 60_000) {
      this.zuletzt.set(s.id, Date.now());
      await this.repo.benutzt(s.id);
    }
    return s;
  }
}

/* ---------- Speicher ---------- */

export function speicherApiSchluesselRepo(): ApiSchluesselRepo {
  const liste = new Map<string, ApiSchluessel & { hash: string }>();
  const ohne = ({ hash: _h, ...s }: ApiSchluessel & { hash: string }): ApiSchluessel => ({ ...s });
  return {
    async liste(b) {
      return [...liste.values()].filter((s) => s.benutzerId === b).map(ohne);
    },
    async hole(id) {
      const s = liste.get(id);
      return s && ohne(s);
    },
    async zuHash(h) {
      const s = [...liste.values()].find((x) => x.hash === h);
      return s && ohne(s);
    },
    async lege(s) {
      liste.set(s.id, { ...s });
    },
    async aendere(id, d) {
      const s = { ...liste.get(id)!, ...d };
      liste.set(id, s);
      return ohne(s);
    },
    async loesche(id) {
      liste.delete(id);
    },
    async benutzt(id) {
      const s = liste.get(id);
      if (s) s.zuletztBenutzt = new Date().toISOString();
    },
  };
}

export function pgApiSchluesselRepo(sql: postgres.Sql): ApiSchluesselRepo {
  const iso = (v: unknown) => (v ? (v as Date).toISOString() : null);
  const als = (r: Record<string, unknown>): ApiSchluessel => ({
    id: r.id as string,
    benutzerId: r.benutzer_id as string,
    name: r.name as string,
    praefix: r.praefix as string,
    recht: r.recht as Recht,
    passwoerter: r.passwoerter === true,
    ablauf: iso(r.ablauf),
    erstellt: iso(r.erstellt)!,
    zuletztBenutzt: iso(r.zuletzt_benutzt),
  });
  return {
    async liste(b) {
      return istUuid(b) ? (await sql`SELECT * FROM api_schluessel WHERE benutzer_id = ${b} ORDER BY erstellt`).map(als) : [];
    },
    async hole(id) {
      const [r] = await sql`SELECT * FROM api_schluessel WHERE id = ${id}`;
      return r ? als(r) : undefined;
    },
    async zuHash(h) {
      const [r] = await sql`SELECT * FROM api_schluessel WHERE hash = ${h}`;
      return r ? als(r) : undefined;
    },
    async lege(s) {
      await sql`INSERT INTO api_schluessel (id, benutzer_id, name, praefix, hash, recht, passwoerter, ablauf)
        VALUES (${s.id}, ${s.benutzerId}, ${s.name}, ${s.praefix}, ${s.hash}, ${s.recht}, ${s.passwoerter}, ${s.ablauf})`;
    },
    async aendere(id, d) {
      const [r] =
        await sql`UPDATE api_schluessel SET name = ${d.name}, recht = ${d.recht}, passwoerter = ${d.passwoerter}, ablauf = ${d.ablauf} WHERE id = ${id} RETURNING *`;
      return als(r);
    },
    async loesche(id) {
      await sql`DELETE FROM api_schluessel WHERE id = ${id}`;
    },
    async benutzt(id) {
      await sql`UPDATE api_schluessel SET zuletzt_benutzt = now() WHERE id = ${id}`;
    },
  };
}
