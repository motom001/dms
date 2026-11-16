/**
 * Speicher der Automatisierungen und Läufe (#674, #1278): Schnittstelle, Arbeitsspeicher, PostgreSQL und das Repo mit
 * Fassungen (#1006).
 */
import type postgres from 'postgres';
import type { Automatisierung, AutomatisierungDaten, Angehalten, Herkunft, Lauf } from '../../../../shared/src/automatisierung';
import { t } from './gemeinsam';
import { heuteIn } from '../../../../shared/src/sichten';
import { istUuid } from '../../repo';
import type { Dienst } from '../../dienst/dienst';

/* ---------- Speicher ---------- */

export interface AutomatisierungRepo {
  liste(): Promise<Array<Automatisierung & { letzterTag: string | null }>>;
  hole(id: string): Promise<(Automatisierung & { letzterTag: string | null }) | undefined>;
  /** Neu anlegen (version 1). Die Fassungen (#1006) hält `Automatisierungen` fest, nicht das Repo. */
  lege(a: Automatisierung): Promise<void>;
  /** Speichern; false, wenn inzwischen jemand anderes gespeichert hat (version ≠ erwartet). */
  speichere(id: string, d: AutomatisierungDaten & { aktiv: boolean }, von: string | null, erwartet: number): Promise<boolean>;
  /** Zustand (an/aus von selbst, angehalten, letzter geprüfter Tag). */
  setze(id: string, d: { aktiv?: boolean; angehalten?: Angehalten | null; letzterTag?: string; herkunft?: Herkunft }): Promise<void>;
  loesche(id: string): Promise<void>;
  /** Lauf anlegen; null, wenn es zu dieser Automatisierung und diesem Ereignis schon einen gibt. */
  beginne(l: Lauf): Promise<boolean>;
  aktualisiere(id: string, d: Partial<Pick<Lauf, 'zustand' | 'schritte' | 'fehler' | 'beendet' | 'mappeId'>>): Promise<void>;
  lauf(id: string): Promise<Lauf | undefined>;
  laeufe(automatisierungId: string, anzahl: number): Promise<Lauf[]>;
  /** Letzter Lauf je Automatisierung. */
  letzte(): Promise<Map<string, Lauf>>;
  /** Läufe einer Automatisierung seit diesem Zeitpunkt (Bremse). */
  zaehleSeit(automatisierungId: string, seit: string): Promise<number>;
  /** Fehlgeschlagene echte Läufe, die noch wiederholt werden können (ohne Probeläufe und ohne „nicht wiederholen“, #707). */
  fehlgeschlagene(automatisierungId?: string): Promise<Lauf[]>;
  /** Fehlgeschlagene Läufe aus dem Hinweis nehmen (#707); liefert die Anzahl. */
  nichtWiederholen(ids: string[], von: string | null): Promise<number>;
  /** Alte Läufe entfernen, hängende als fehlgeschlagen markieren. */
  raeumeAuf(tage: number, jeAutomatisierung: number, haengtMin: number): Promise<number>;
}

type Gespeichert = Automatisierung & { letzterTag: string | null };

export function speicherAutomatisierungRepo(uhr: () => number = Date.now): AutomatisierungRepo {
  const autos = new Map<string, Gespeichert>();
  const laeufe: Lauf[] = [];
  const jetzt = () => new Date(uhr()).toISOString();
  return {
    async liste() {
      return [...autos.values()]
        .map((a) => structuredClone(a))
        .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'));
    },
    async hole(id) {
      const a = autos.get(id);
      return a && structuredClone(a);
    },
    async lege(a) {
      autos.set(a.id, { ...structuredClone(a), letzterTag: null });
    },
    async speichere(id, d, von, erwartet) {
      const a = autos.get(id);
      if (!a || a.version !== erwartet) return false;
      Object.assign(a, structuredClone(d), { version: a.version + 1, geaendert: jetzt(), geaendertVon: von });
      return true;
    },
    async setze(id, d) {
      const a = autos.get(id);
      if (!a) return;
      if (d.aktiv !== undefined) a.aktiv = d.aktiv;
      if (d.angehalten !== undefined) a.angehalten = structuredClone(d.angehalten);
      if (d.letzterTag !== undefined) a.letzterTag = d.letzterTag;
      if (d.herkunft !== undefined) a.herkunft = d.herkunft;
    },
    async loesche(id) {
      autos.delete(id);
      for (let i = laeufe.length - 1; i >= 0; i--) if (laeufe[i].automatisierungId === id) laeufe.splice(i, 1);
    },
    async beginne(l) {
      if (laeufe.some((x) => x.automatisierungId === l.automatisierungId && x.ereignisId === l.ereignisId)) return false;
      laeufe.push(structuredClone(l));
      return true;
    },
    async aktualisiere(id, d) {
      const l = laeufe.find((x) => x.id === id);
      if (l) Object.assign(l, structuredClone(d));
    },
    async lauf(id) {
      const l = laeufe.find((x) => x.id === id);
      return l && structuredClone(l);
    },
    async laeufe(a, n) {
      return structuredClone(
        laeufe
          .filter((l) => l.automatisierungId === a)
          .sort((x, y) => y.gestartet.localeCompare(x.gestartet))
          .slice(0, n),
      );
    },
    async letzte() {
      const m = new Map<string, Lauf>();
      for (const l of laeufe) {
        const x = m.get(l.automatisierungId);
        if (!x || x.gestartet <= l.gestartet) m.set(l.automatisierungId, structuredClone(l));
      }
      return m;
    },
    async zaehleSeit(a, seit) {
      return laeufe.filter((l) => l.automatisierungId === a && l.gestartet >= seit && !l.test).length;
    },
    async fehlgeschlagene(a) {
      return structuredClone(
        laeufe
          .filter((l) => l.zustand === 'fehlgeschlagen' && !l.test && !l.nichtWiederholt && (!a || l.automatisierungId === a))
          .sort((x, y) => y.gestartet.localeCompare(x.gestartet)),
      );
    },
    async nichtWiederholen(ids, von) {
      let n = 0;
      for (const l of laeufe)
        if (ids.includes(l.id) && l.zustand === 'fehlgeschlagen' && !l.nichtWiederholt) {
          l.nichtWiederholt = { von, zeit: jetzt() };
          n++;
        }
      return n;
    },
    async raeumeAuf(tage, je, haengt) {
      const grenze = new Date(uhr() - tage * 86_400_000).toISOString();
      const alt = new Date(uhr() - haengt * 60_000).toISOString();
      for (const l of laeufe)
        if (l.zustand === 'laeuft' && l.gestartet < alt)
          Object.assign(l, { zustand: 'fehlgeschlagen', fehler: t('automatisierung.lauf.abgebrochen'), beendet: jetzt() });
      const vorher = laeufe.length;
      const zahl = new Map<string, number>();
      const sortiert = [...laeufe].sort((x, y) => y.gestartet.localeCompare(x.gestartet));
      const weg = new Set(
        sortiert
          .filter((l) => {
            const n = (zahl.get(l.automatisierungId) ?? 0) + 1;
            zahl.set(l.automatisierungId, n);
            return l.zustand !== 'laeuft' && (l.gestartet < grenze || n > je);
          })
          .map((l) => l.id),
      );
      for (let i = laeufe.length - 1; i >= 0; i--) if (weg.has(laeufe[i].id)) laeufe.splice(i, 1);
      return vorher - laeufe.length;
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Zeilen aus der Datenbank, Spalten werden einzeln übernommen */
const iso = (d: any) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const alsAuto = (r: any): Gespeichert => ({
  ...(r.daten as AutomatisierungDaten),
  id: r.id,
  name: r.name,
  reihenfolge: r.reihenfolge,
  aktiv: r.aktiv,
  angehalten: r.angehalten ?? null,
  herkunft: r.herkunft as Herkunft,
  paketId: r.paket_id ?? null,
  version: r.version,
  erstellt: iso(r.erstellt)!,
  erstelltVon: r.erstellt_von ?? null,
  geaendert: iso(r.geaendert)!,
  geaendertVon: r.geaendert_von ?? null,
  letzterTag: r.letzter_tag ? (r.letzter_tag instanceof Date ? heuteIn(r.letzter_tag) : String(r.letzter_tag).slice(0, 10)) : null,
});
const alsLauf = (r: any): Lauf => ({
  id: r.id,
  automatisierungId: r.automatisierung_id,
  ereignisId: r.ereignis_id,
  art: r.art,
  daten: r.daten ?? {},
  mappeId: r.mappe_id ?? null,
  zustand: r.zustand,
  trocken: r.trocken,
  test: r.test,
  schritte: r.schritte ?? [],
  fehler: r.fehler ?? null,
  wiederholtVon: r.wiederholt_von ?? null,
  gestartet: iso(r.gestartet)!,
  beendet: iso(r.beendet),
  nichtWiederholt: r.nicht_wiederholt_zeit ? { von: r.nicht_wiederholt_von ?? null, zeit: iso(r.nicht_wiederholt_zeit)! } : null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function pgAutomatisierungRepo(sql: postgres.Sql, haushaltId: string): AutomatisierungRepo {
  const json = (w: unknown) => sql.json(w as postgres.JSONValue);
  const nurDaten = (a: AutomatisierungDaten) => ({ beschreibung: a.beschreibung, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst });
  return {
    async liste() {
      return (await sql`SELECT * FROM automatisierungen WHERE haushalt_id = ${haushaltId} ORDER BY reihenfolge, name, id`).map(alsAuto);
    },
    async hole(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAuto(r) : undefined;
    },
    async lege(a) {
      await sql`INSERT INTO automatisierungen (id, haushalt_id, name, reihenfolge, daten, aktiv, angehalten, herkunft, paket_id, version, erstellt, erstellt_von, geaendert, geaendert_von)
        VALUES (${a.id}, ${haushaltId}, ${a.name}, ${a.reihenfolge}, ${json(nurDaten(a))}, ${a.aktiv}, ${a.angehalten ? json(a.angehalten) : null}, ${a.herkunft}, ${a.paketId ?? null},
          ${a.version}, ${a.erstellt}, ${a.erstelltVon}, ${a.geaendert}, ${a.geaendertVon})`;
    },
    async speichere(id, d, von, erwartet) {
      if (!istUuid(id)) return false;
      const [r] =
        await sql`UPDATE automatisierungen SET name = ${d.name}, reihenfolge = ${d.reihenfolge}, daten = ${json(nurDaten(d))}, aktiv = ${d.aktiv},
        version = version + 1, geaendert = now(), geaendert_von = ${von}
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND version = ${erwartet} RETURNING version`;
      return !!r;
    },
    async setze(id, d) {
      if (!istUuid(id)) return;
      await sql`UPDATE automatisierungen SET
        aktiv = ${d.aktiv === undefined ? sql`aktiv` : d.aktiv},
        angehalten = ${d.angehalten === undefined ? sql`angehalten` : d.angehalten === null ? null : json(d.angehalten)},
        letzter_tag = ${d.letzterTag === undefined ? sql`letzter_tag` : d.letzterTag},
        herkunft = ${d.herkunft === undefined ? sql`herkunft` : d.herkunft}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loesche(id) {
      if (istUuid(id)) await sql`DELETE FROM automatisierungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async beginne(l) {
      const r =
        await sql`INSERT INTO automatisierung_laeufe (id, haushalt_id, automatisierung_id, ereignis_id, art, daten, mappe_id, zustand, trocken, test, schritte, fehler, wiederholt_von, gestartet)
        VALUES (${l.id}, ${haushaltId}, ${l.automatisierungId}, ${l.ereignisId}, ${l.art}, ${json(l.daten)}, ${istUuid(l.mappeId) ? l.mappeId : null}, ${l.zustand},
          ${l.trocken}, ${l.test}, ${json(l.schritte)}, ${l.fehler}, ${l.wiederholtVon ?? null}, ${l.gestartet})
        ON CONFLICT (automatisierung_id, ereignis_id) DO NOTHING RETURNING id`;
      return r.length > 0;
    },
    async aktualisiere(id, d) {
      await sql`UPDATE automatisierung_laeufe SET
        zustand = ${d.zustand ?? sql`zustand`}, schritte = ${d.schritte ? json(d.schritte) : sql`schritte`},
        fehler = ${d.fehler === undefined ? sql`fehler` : d.fehler}, beendet = ${d.beendet === undefined ? sql`beendet` : d.beendet},
        mappe_id = ${d.mappeId === undefined ? sql`mappe_id` : istUuid(d.mappeId) ? d.mappeId : null}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async lauf(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsLauf(r) : undefined;
    },
    async laeufe(a, n) {
      if (!istUuid(a)) return [];
      return (
        await sql`SELECT * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} ORDER BY gestartet DESC, id LIMIT ${n}`
      ).map(alsLauf);
    },
    async letzte() {
      const r =
        await sql`SELECT DISTINCT ON (automatisierung_id) * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} ORDER BY automatisierung_id, gestartet DESC`;
      return new Map(r.map((x) => [x.automatisierung_id as string, alsLauf(x)]));
    },
    async zaehleSeit(a, seit) {
      const [r] =
        await sql`SELECT count(*)::int AS n FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} AND gestartet >= ${seit} AND NOT test`;
      return r.n as number;
    },
    async fehlgeschlagene(a) {
      return (
        await sql`SELECT * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND zustand = 'fehlgeschlagen' AND NOT test AND nicht_wiederholt_zeit IS NULL
        ${a && istUuid(a) ? sql`AND automatisierung_id = ${a}` : sql``} ORDER BY gestartet DESC LIMIT 500`
      ).map(alsLauf);
    },
    async nichtWiederholen(ids, von) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return 0;
      const r = await sql`UPDATE automatisierung_laeufe SET nicht_wiederholt_von = ${von}, nicht_wiederholt_zeit = now()
        WHERE haushalt_id = ${haushaltId} AND id IN ${sql(gueltig)} AND zustand = 'fehlgeschlagen' AND nicht_wiederholt_zeit IS NULL`;
      return r.count;
    },
    async raeumeAuf(tage, je, haengt) {
      await sql`UPDATE automatisierung_laeufe SET zustand = 'fehlgeschlagen', fehler = ${t('automatisierung.lauf.abgebrochen')}, beendet = now()
        WHERE haushalt_id = ${haushaltId} AND zustand = 'laeuft' AND gestartet < now() - make_interval(mins => ${haengt})`;
      const r = await sql`DELETE FROM automatisierung_laeufe l USING (
          SELECT id, row_number() OVER (PARTITION BY automatisierung_id ORDER BY gestartet DESC) AS nr, gestartet FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId}
        ) x WHERE l.id = x.id AND l.zustand <> 'laeuft' AND (x.nr > ${je} OR x.gestartet < now() - make_interval(days => ${tage}))`;
      return r.count;
    },
  };
}

/** Das Repo mit Fassungen (#1006): nach Anlegen, Speichern und an/aus festhalten, beim Löschen mit Vermerk. */
export function mitFassungen(repo: AutomatisierungRepo, dienst: Dienst): AutomatisierungRepo {
  const halte = (id: string) => dienst.kern.fassungen.halte('automatisierung', id);
  return {
    ...repo,
    async lege(a) {
      await repo.lege(a);
      await halte(a.id);
    },
    async speichere(id, d, von, erwartet) {
      const ok = await repo.speichere(id, d, von, erwartet);
      if (ok) await halte(id);
      return ok;
    },
    async setze(id, d) {
      await repo.setze(id, d);
      if (d.aktiv !== undefined) await halte(id);
    },
    async loesche(id) {
      await dienst.kern.fassungen.geloescht('automatisierung', id, () => repo.loesche(id));
    },
  };
}
