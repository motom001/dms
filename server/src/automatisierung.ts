import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import {
  AUTOMATISIERUNG_GRENZEN, ausloeserSchluessel, automatisierungsProbleme, bereinigeAutomatisierung, kontextTyp, kurzform, REIHENFOLGE,
  type Angehalten, type Automatisierung, type AutomatisierungAnsicht, type AutomatisierungDaten, type DannArt, type DannKarte,
  type Empfaenger, type Fassung, type Fehlschlag, type Herkunft, type Kontextdaten, type Lauf, type LaufZustand, type Schritt, type UndKarte, erreichteDaten,
  PERSONEN_IM_EREIGNIS,
} from '../../shared/src/automatisierung';
import { EREIGNISKATALOG, OHNE_WENN, type KatalogEreignis } from '../../shared/src/ereignisse';
import { tagVon, titelAus, type Benutzer, type Mappe, type Mappentyp } from '../../shared/src/model';
import { heuteIn, merkmalTrifft, verschiebe, type Bedingung } from '../../shared/src/sichten';
import { uebersetzer } from '../../shared/src/sprache';
import texte from '../../shared/src/sprachen/de/automatisierung.json';
import ereignisTexte from '../../shared/src/sprachen/de/ereignisse.json';
import type { Dienst, Zugriff } from './dienst';
import type { PaketAutomatisierung } from './pakete';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { faelligeTage, laufeFaellige, wochentagVon, type Merker } from './zeitplan';
import { feiertagAm, istBundesland } from '../../shared/src/feiertage';
import { wirksameZeit } from './aufgabenmail';
import { istUuid } from './repo';
import { datumsformat } from '../../shared/src/region';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Motor der Automatisierungen (#674): Wenn · Und · Dann, ausgeführt unter dem Systemkonto „Automatisierung“ (#673).
 *
 * - **Auslösen:** über den Ereigniskatalog (#670, Abnehmer „automatisierungen“) und den Zeitplan „Datum in N Tagen“.
 *   Je Automatisierung und Ereignis genau **ein Lauf** (eindeutig in der Datenbank): Kommt ein Ereignis noch einmal
 *   oder prüfen zwei Server denselben Tag, läuft nichts doppelt. Verpasste Tage holt der Zeitplan nach.
 * - **Reihenfolge:** Automatisierungen zu einem Ereignis laufen nacheinander nach `reihenfolge` (1–99, dann Name);
 *   jede liest den aktuellen Stand. Fehler einer stoppen die folgenden nicht; die Karte „Danach keine weiteren …“
 *   schon – nur für dieses eine Ereignis.
 * - **Schutz:** Eine Automatisierung löst sich nie selbst aus; Ketten höchstens {@link AUTOMATISIERUNG_GRENZEN}.tiefe
 *   tief; mehr als `laeufeJeMinute` Läufe je Minute halten sie an (Bremse). Demo-Daten, Import und Wiederherstellung
 *   lösen nichts aus (`ohneEreignisse`), in der Wartung ruht der Verteiler; nach einer Wiederherstellung sind alle
 *   angehalten, bis ein Admin sie wieder einschaltet.
 * - **Bearbeiten geht vor Automatisierung:** Passt eine Automatisierung nicht mehr (Mappentyp, Feld oder Ansicht
 *   gelöscht), wird sie rot und angehalten – sie blockiert nie das Arbeiten im DMS.
 * - **Nachvollziehbar:** Protokoll je Lauf mit Zustand je Schritt (Live-Fortschritt), Historie der Mappe „durch
 *   Automatisierung ‚…‘“, Trockenlauf, Wiederholen fehlgeschlagener Läufe, Änderungsverlauf je Automatisierung.
 *
 * Die Dann-Karten liegen in {@link DANN_AUSFUEHRER}; neue Karten melden sich dort an (`automatisierung-karten.ts`).
 */

const log = protokoll.modul('automatisierung');
const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
const t = uebersetzer({ automatisierung: texte, ereignisse: ereignisTexte });
/** Zeitplan „Datum in N Tagen“ und Aufräumen. */
const ZEITPLAN_MS = 60_000;
/** Ein Lauf, der so lange auf „läuft“ steht, gehört einem Server, der dabei gestorben ist. */
const HAENGT_MIN = 10;

/* ---------- Speicher ---------- */

export interface AutomatisierungRepo {
  liste(): Promise<Array<Automatisierung & { letzterTag: string | null }>>;
  hole(id: string): Promise<(Automatisierung & { letzterTag: string | null }) | undefined>;
  /** Neu anlegen (version 1) samt erster Fassung. */
  lege(a: Automatisierung): Promise<void>;
  /** Neue Fassung speichern; false, wenn inzwischen jemand anderes gespeichert hat (version ≠ erwartet). */
  speichere(id: string, d: AutomatisierungDaten & { aktiv: boolean }, von: string | null, erwartet: number): Promise<boolean>;
  /** Zustand ohne neue Fassung (an/aus von selbst, angehalten, letzter geprüfter Tag). */
  setze(id: string, d: { aktiv?: boolean; angehalten?: Angehalten | null; letzterTag?: string; herkunft?: Herkunft }): Promise<void>;
  loesche(id: string): Promise<void>;
  fassungen(id: string): Promise<Fassung[]>;
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
  const fassungen = new Map<string, Fassung[]>();
  const laeufe: Lauf[] = [];
  const jetzt = () => new Date(uhr()).toISOString();
  const daten = (a: AutomatisierungDaten & { aktiv: boolean }) => structuredClone({ name: a.name, beschreibung: a.beschreibung, reihenfolge: a.reihenfolge, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst, aktiv: a.aktiv });
  return {
    async liste() { return [...autos.values()].map((a) => structuredClone(a)).sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de')); },
    async hole(id) { const a = autos.get(id); return a && structuredClone(a); },
    async lege(a) {
      autos.set(a.id, { ...structuredClone(a), letzterTag: null });
      fassungen.set(a.id, [{ version: a.version, zeit: a.geaendert, von: a.geaendertVon, daten: daten(a) }]);
    },
    async speichere(id, d, von, erwartet) {
      const a = autos.get(id);
      if (!a || a.version !== erwartet) return false;
      Object.assign(a, structuredClone(d), { version: a.version + 1, geaendert: jetzt(), geaendertVon: von });
      fassungen.get(id)!.push({ version: a.version, zeit: a.geaendert, von, daten: daten(a) });
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
    async loesche(id) { autos.delete(id); fassungen.delete(id); for (let i = laeufe.length - 1; i >= 0; i--) if (laeufe[i].automatisierungId === id) laeufe.splice(i, 1); },
    async fassungen(id) { return structuredClone([...(fassungen.get(id) ?? [])].reverse()); },
    async beginne(l) {
      if (laeufe.some((x) => x.automatisierungId === l.automatisierungId && x.ereignisId === l.ereignisId)) return false;
      laeufe.push(structuredClone(l));
      return true;
    },
    async aktualisiere(id, d) { const l = laeufe.find((x) => x.id === id); if (l) Object.assign(l, structuredClone(d)); },
    async lauf(id) { const l = laeufe.find((x) => x.id === id); return l && structuredClone(l); },
    async laeufe(a, n) { return structuredClone(laeufe.filter((l) => l.automatisierungId === a).sort((x, y) => y.gestartet.localeCompare(x.gestartet)).slice(0, n)); },
    async letzte() {
      const m = new Map<string, Lauf>();
      for (const l of laeufe) { const x = m.get(l.automatisierungId); if (!x || x.gestartet <= l.gestartet) m.set(l.automatisierungId, structuredClone(l)); }
      return m;
    },
    async zaehleSeit(a, seit) { return laeufe.filter((l) => l.automatisierungId === a && l.gestartet >= seit && !l.test).length; },
    async fehlgeschlagene(a) { return structuredClone(laeufe.filter((l) => l.zustand === 'fehlgeschlagen' && !l.test && !l.nichtWiederholt && (!a || l.automatisierungId === a)).sort((x, y) => y.gestartet.localeCompare(x.gestartet))); },
    async nichtWiederholen(ids, von) {
      let n = 0;
      for (const l of laeufe) if (ids.includes(l.id) && l.zustand === 'fehlgeschlagen' && !l.nichtWiederholt) { l.nichtWiederholt = { von, zeit: jetzt() }; n++; }
      return n;
    },
    async raeumeAuf(tage, je, haengt) {
      const grenze = new Date(uhr() - tage * 86_400_000).toISOString();
      const alt = new Date(uhr() - haengt * 60_000).toISOString();
      for (const l of laeufe) if (l.zustand === 'laeuft' && l.gestartet < alt) Object.assign(l, { zustand: 'fehlgeschlagen', fehler: t('automatisierung.lauf.abgebrochen'), beendet: jetzt() });
      const vorher = laeufe.length;
      const zahl = new Map<string, number>();
      const sortiert = [...laeufe].sort((x, y) => y.gestartet.localeCompare(x.gestartet));
      const weg = new Set(sortiert.filter((l) => { const n = (zahl.get(l.automatisierungId) ?? 0) + 1; zahl.set(l.automatisierungId, n); return l.zustand !== 'laeuft' && (l.gestartet < grenze || n > je); }).map((l) => l.id));
      for (let i = laeufe.length - 1; i >= 0; i--) if (weg.has(laeufe[i].id)) laeufe.splice(i, 1);
      return vorher - laeufe.length;
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Zeilen aus der Datenbank, Spalten werden einzeln übernommen */
const iso = (d: any) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const alsAuto = (r: any): Gespeichert => ({
  ...(r.daten as AutomatisierungDaten), id: r.id, name: r.name, reihenfolge: r.reihenfolge, aktiv: r.aktiv, angehalten: r.angehalten ?? null,
  herkunft: r.herkunft as Herkunft, paketId: r.paket_id ?? null, version: r.version, erstellt: iso(r.erstellt)!, erstelltVon: r.erstellt_von ?? null,
  geaendert: iso(r.geaendert)!, geaendertVon: r.geaendert_von ?? null, letzterTag: r.letzter_tag ? (r.letzter_tag instanceof Date ? heuteIn(r.letzter_tag) : String(r.letzter_tag).slice(0, 10)) : null,
});
const alsLauf = (r: any): Lauf => ({
  id: r.id, automatisierungId: r.automatisierung_id, ereignisId: r.ereignis_id, art: r.art, daten: r.daten ?? {}, mappeId: r.mappe_id ?? null,
  zustand: r.zustand, trocken: r.trocken, test: r.test, schritte: r.schritte ?? [], fehler: r.fehler ?? null, wiederholtVon: r.wiederholt_von ?? null,
  gestartet: iso(r.gestartet)!, beendet: iso(r.beendet),
  nichtWiederholt: r.nicht_wiederholt_zeit ? { von: r.nicht_wiederholt_von ?? null, zeit: iso(r.nicht_wiederholt_zeit)! } : null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function pgAutomatisierungRepo(sql: postgres.Sql, haushaltId: string): AutomatisierungRepo {
  const json = (w: unknown) => sql.json(w as postgres.JSONValue);
  const nurDaten = (a: AutomatisierungDaten) => ({ beschreibung: a.beschreibung, wenn: a.wenn, und: a.und, dann: a.dann, sonst: a.sonst });
  const fassung = (a: AutomatisierungDaten & { aktiv: boolean }) => ({ name: a.name, reihenfolge: a.reihenfolge, aktiv: a.aktiv, ...nurDaten(a) });
  return {
    async liste() { return (await sql`SELECT * FROM automatisierungen WHERE haushalt_id = ${haushaltId} ORDER BY reihenfolge, name, id`).map(alsAuto); },
    async hole(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM automatisierungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAuto(r) : undefined;
    },
    async lege(a) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO automatisierungen (id, haushalt_id, name, reihenfolge, daten, aktiv, angehalten, herkunft, paket_id, version, erstellt, erstellt_von, geaendert, geaendert_von)
          VALUES (${a.id}, ${haushaltId}, ${a.name}, ${a.reihenfolge}, ${json(nurDaten(a))}, ${a.aktiv}, ${a.angehalten ? json(a.angehalten) : null}, ${a.herkunft}, ${a.paketId ?? null},
            ${a.version}, ${a.erstellt}, ${a.erstelltVon}, ${a.geaendert}, ${a.geaendertVon})`;
        await tx`INSERT INTO automatisierung_fassungen (automatisierung_id, version, daten, von, zeit) VALUES (${a.id}, ${a.version}, ${json(fassung(a))}, ${a.geaendertVon}, ${a.geaendert})`;
      });
    },
    async speichere(id, d, von, erwartet) {
      if (!istUuid(id)) return false;
      return sql.begin(async (tx) => {
        const [r] = await tx`UPDATE automatisierungen SET name = ${d.name}, reihenfolge = ${d.reihenfolge}, daten = ${json(nurDaten(d))}, aktiv = ${d.aktiv},
          version = version + 1, geaendert = now(), geaendert_von = ${von}
          WHERE haushalt_id = ${haushaltId} AND id = ${id} AND version = ${erwartet} RETURNING version`;
        if (!r) return false;
        await tx`INSERT INTO automatisierung_fassungen (automatisierung_id, version, daten, von) VALUES (${id}, ${r.version}, ${json(fassung(d))}, ${von})`;
        return true;
      });
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
    async loesche(id) { if (istUuid(id)) await sql`DELETE FROM automatisierungen WHERE haushalt_id = ${haushaltId} AND id = ${id}`; },
    async fassungen(id) {
      if (!istUuid(id)) return [];
      return (await sql`SELECT f.* FROM automatisierung_fassungen f JOIN automatisierungen a ON a.id = f.automatisierung_id
        WHERE a.haushalt_id = ${haushaltId} AND f.automatisierung_id = ${id} ORDER BY f.version DESC LIMIT 100`)
        .map((r) => ({ version: r.version, zeit: iso(r.zeit)!, von: r.von ?? null, daten: r.daten }));
    },
    async beginne(l) {
      const r = await sql`INSERT INTO automatisierung_laeufe (id, haushalt_id, automatisierung_id, ereignis_id, art, daten, mappe_id, zustand, trocken, test, schritte, fehler, wiederholt_von, gestartet)
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
      return (await sql`SELECT * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} ORDER BY gestartet DESC, id LIMIT ${n}`).map(alsLauf);
    },
    async letzte() {
      const r = await sql`SELECT DISTINCT ON (automatisierung_id) * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} ORDER BY automatisierung_id, gestartet DESC`;
      return new Map(r.map((x) => [x.automatisierung_id as string, alsLauf(x)]));
    },
    async zaehleSeit(a, seit) {
      const [r] = await sql`SELECT count(*)::int AS n FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND automatisierung_id = ${a} AND gestartet >= ${seit} AND NOT test`;
      return r.n as number;
    },
    async fehlgeschlagene(a) {
      return (await sql`SELECT * FROM automatisierung_laeufe WHERE haushalt_id = ${haushaltId} AND zustand = 'fehlgeschlagen' AND NOT test AND nicht_wiederholt_zeit IS NULL
        ${a && istUuid(a) ? sql`AND automatisierung_id = ${a}` : sql``} ORDER BY gestartet DESC LIMIT 500`).map(alsLauf);
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

/* ---------- Dann-Karten ---------- */

/** Was eine Dann-Karte zum Ausführen bekommt. */
export interface KartenKontext {
  dienst: Dienst;
  /** Zugriff des Kontos, unter dem die Automatisierung läuft (Systemkonto „Automatisierung“). */
  z: Zugriff;
  konto: Benutzer;
  automatisierung: Automatisierung;
  mappe: Mappe | null;
  typ: Mappentyp | null;
  /** Angaben des Ereignisses (nur Ids, Schlüssel, Datum). */
  daten: Record<string, unknown>;
  /** Nur beschreiben, was passieren würde. */
  trocken: boolean;
  /** Text mit Platzhaltern füllen (Werte mit den Rechten des Kontos). */
  fuelle(text: string): Promise<string>;
  /**
   * Text mit Platzhaltern für einen Empfänger füllen (#795): mit den Rechten des Kontos **und** des Empfängers (null =
   * Administratoren: nur die des Kontos). `verborgen`: Platzhalter, die er nicht sehen darf („(nicht sichtbar)“) –
   * mehr als beim Konto selbst; `mappe`: false, wenn er die Mappe gar nicht lesen darf.
   */
  fuelleFuer(text: string, an: string | null): Promise<{ text: string; verborgen: number; mappe: boolean }>;
  /** Personen hinter einem Empfänger (aktive Benutzer). */
  personen(e: Empfaenger): Promise<string[]>;
  /** Vermerk für die Historie der Mappe: „durch Automatisierung ‚…‘ (eingerichtet von …)“. */
  anlass: Record<string, unknown>;
}
/** Führt eine Karte aus (bzw. beschreibt sie im Trockenlauf) und liefert eine Zeile fürs Protokoll. */
export type DannAusfuehrer = (k: DannKarte, c: KartenKontext) => Promise<string>;
/** Ausführende Karten; „stopp“ erledigt der Motor selbst. */
export const DANN_AUSFUEHRER: Partial<Record<DannArt, DannAusfuehrer>> = {};

/* ---------- Motor ---------- */

export interface AutomatisierungDeps {
  dienst: Dienst;
  repo: AutomatisierungRepo;
  /** Läuft gerade eine Wartung oder Wiederherstellung? Dann ruht der Zeitplan (der Verteiler ruht von selbst). */
  pause?: () => string | null;
  uhr?: () => number;
}

/** Ereignis, wie der Motor es verarbeitet (aus dem Katalog oder vom Zeitplan). */
interface Anlass { id: string; art: string; daten: Record<string, unknown>; kette: number; ausloeser?: KatalogEreignis['ausloeser'] }

const uuidAus = (s: string) => { const h = createHash('sha256').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const UHR_FORMAT = () => datumsformat(gebietsschema(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Feste Id der beim Update übernommenen Vertretungs-Aufgabe (#712/#678). */
const UMZUG_VERTRETUNG = uuidAus('umzug|vertretung');
/** Feste Ids der beim Update übernommenen Benachrichtigungen (#678): Zusammenfassung, Favoriten, Anmeldeschutz. */
const UMZUG = {
  zusammenfassung: uuidAus('umzug|zusammenfassung'), favoriten: uuidAus('umzug|favoriten'),
  sammel: uuidAus('umzug|anmeldeschutz'), konto: uuidAus('umzug|kontosperre'),
} as const;
/** Welche übernommene Benachrichtigung eine mitgelieferte Automatisierung ersetzt (nach ihrer ersten Dann-Karte). */
function umzugFuer(d: AutomatisierungDaten): string | null {
  const k = d.dann[0];
  if (!k) return null;
  if (k.art === 'zusammenfassung') return UMZUG.zusammenfassung;
  if (k.art === 'favoriten') return UMZUG.favoriten;
  if (k.art === 'anmeldeschutz') return k.was === 'sammel' ? UMZUG.sammel : UMZUG.konto;
  return null;
}
const UMZUG_IDS = new Set<string>([UMZUG_VERTRETUNG, ...Object.values(UMZUG)]);

export class Automatisierungen {
  private uhr: ReturnType<typeof setInterval> | null = null;
  private zeitplanLauf: Promise<void> | null = null;
  /** Merker für den Zeitplan, wenn es keinen Einstellungsspeicher gibt (Tests). */
  private merkerOhneSpeicher = new Map<string, string>();
  constructor(private d: AutomatisierungDeps) {
    d.dienst.automatisierungenVon = async (kontoId) => {
      const konto = await this.konto().catch(() => null);
      return konto?.id === kontoId ? (await this.d.repo.liste()).filter((a) => a.herkunft !== 'paket').map((a) => ({ id: a.id, name: a.name, ...(a.aktiv && a.angehalten ? { angehalten: true } : {}) })) : [];
    };
    d.dienst.fristenUebernehmen = () => this.fristenUebernehmen();
    d.dienst.paketAutomatisierungen = (p, liste, ein) => this.ausPaket(p, liste, ein);
    // Vollexport: Automatisierungen mit ihrem Änderungsverlauf (die Läufe sind Protokoll und bleiben draußen).
    d.dienst.automatisierungenExport = async () => Promise.all((await this.d.repo.liste()).map(async (a) => ({ ...a, fassungen: await this.d.repo.fassungen(a.id) })));
  }
  private jetzt() { return this.d.uhr?.() ?? Date.now(); }
  private iso() { return new Date(this.jetzt()).toISOString(); }
  private konto() {
    if (!this.d.dienst.systemkonten) throw new Fachfehler(500, t('automatisierung.konto.fehlt'));
    return this.d.dienst.systemkonten('automatisierung');
  }

  /** Abnehmer anmelden und den Zeitplan starten (Start des Servers). */
  start() {
    this.d.dienst.ereignisse.abonniere('automatisierungen', (e) => this.ereignis(e));
    // #712: Erinnerungen am Feld werden zu Automatisierungen – erst die Fristen übernehmen; frühere Beispiele des Kerns räumen (#883).
    void this.fristenUebernehmen().catch((e) => log.warn('Erinnerungen nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.benachrichtigungenUebernehmen()).catch((e) => log.warn('Benachrichtigungen nicht übernommen', { fehler: (e as Error).message }))
      .then(() => this.raeumeBeispieleAuf()).catch((e) => log.warn('Frühere Beispiele nicht aufgeräumt', { fehler: (e as Error).message }));
    this.uhr ??= setInterval(() => { void this.zeitplan().catch((e) => log.error('Zeitplan fehlgeschlagen', { fehler: (e as Error).message })); }, ZEITPLAN_MS);
    this.uhr.unref?.();
  }
  stop() { if (this.uhr) clearInterval(this.uhr); this.uhr = null; this.d.dienst.ereignisse.abbestellen('automatisierungen'); }

  /**
   * Mitgelieferte Automatisierungen eines Pakets (#712, dms-registry #108): je Schlüssel eine mit fester Id, Herkunft
   * „aus Paket“, nach der Installation **aus** (eingeschaltet wird im Einrichtungsassistenten bzw. von Hand). Typen im
   * Paket als eigener Schlüssel oder `paket:typ` → Id. Bei einem Update ersetzt die neue Fassung die alte, solange
   * niemand sie geändert hat (an/aus bleibt); eine geänderte bleibt, wie sie ist. Was das Paket nicht mehr mitbringt,
   * fällt weg, wenn es unverändert und aus ist. `ein`: Schlüssel, die beim Installieren angehakt wurden – neu angelegte
   * davon sind gleich eingeschaltet. Gibt es für dasselbe Datumsfeld schon eine beim Update übernommene Erinnerung
   * (fristenUebernehmen), ersetzt die mitgelieferte sie, solange sie unverändert ist (an/aus bleibt); ist sie geändert,
   * bleibt sie und die mitgelieferte entsteht nicht – so erinnert nie etwas doppelt.
   */
  async ausPaket(p: InstalliertesPaket, liste: PaketAutomatisierung[], ein: string[] = []): Promise<number> {
    const pakete = await this.d.dienst.kern.repo.listePakete();
    const typId = (vw: unknown): string | null => {
      if (typeof vw !== 'string' || !vw) return null;
      const [pk, sl] = vw.includes(':') ? vw.split(':') : [p.id, vw];
      return (pk === p.id ? p.typen[sl] : pakete.find((x) => x.id === pk)?.typen[sl]) ?? null;
    };
    const vorhanden = (await this.d.repo.liste()).filter((a) => a.herkunft === 'paket' && a.paketId === p.id);
    const ids = new Set<string>();
    let neu = 0;
    for (const x of liste) {
      // Nach einem Umzug (#1084) behält eine mitgelieferte Automatisierung ihre Id aus der früheren Paket-Id.
      const id = [p.id, ...(p.frueher ?? [])].map((k) => uuidAus(`paket|${k}|${x.schluessel}`)).find((k) => vorhanden.some((a) => a.id === k)) ?? uuidAus(`paket|${p.id}|${x.schluessel}`);
      ids.add(id);
      const d = bereinigeAutomatisierung({ name: x.name, beschreibung: x.beschreibung, wenn: { ...x.wenn, typ: typId(x.wenn.typ) }, und: x.und, dann: x.dann });
      d.reihenfolge = REIHENFOLGE.paket;
      const da = vorhanden.find((a) => a.id === id);
      if (da) {
        if (da.geaendertVon === null) await this.d.repo.speichere(id, { ...d, aktiv: da.aktiv }, null, da.version);
        continue;
      }
      let aktiv = ein.includes(x.schluessel);
      const uebernommeneId = d.wenn.art === 'datum' ? uuidAus(`frist|${d.wenn.typ}|${d.wenn.feld}`) : d.wenn.art === 'benutzer.abwesenheit_gesetzt' ? UMZUG_VERTRETUNG : umzugFuer(d);
      if (uebernommeneId) {
        const alt = await this.d.repo.hole(uebernommeneId);
        if (alt && alt.geaendertVon !== null) { log.info('Mitgelieferte Automatisierung nicht angelegt: die übernommene Erinnerung wurde geändert', { paket: p.id, automatisierung: x.schluessel, bleibt: alt.id }); continue; }
        if (alt) { aktiv = alt.aktiv; await this.d.repo.loesche(alt.id); }
      }
      const a: Automatisierung = { ...d, id, aktiv, angehalten: null, herkunft: 'paket', paketId: p.id, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
      try { await this.d.repo.lege(a); neu++; } catch { /* ein anderer Server war schneller */ }
    }
    // Nicht mehr mitgeliefert: weg, wenn aus und unverändert – übernommene Erinnerungen am Feld bleiben.
    const uebernommen = (a: Automatisierung) => UMZUG_IDS.has(a.id) || (a.wenn.art === 'datum' && a.id === uuidAus(`frist|${a.wenn.typ}|${a.wenn.feld}`));
    for (const a of vorhanden) if (!ids.has(a.id) && !a.aktiv && a.geaendertVon === null && !uebernommen(a)) await this.d.repo.loesche(a.id);
    if (neu) log.info('Automatisierungen aus Paket angelegt (aus)', { paket: p.id, anzahl: neu });
    return neu;
  }

  /**
   * Erinnerungen am Feld → Automatisierungen (#712). Datumsfelder mit Frist legen keine Aufgaben mehr selbst an; für jede
   * Frist ohne passende Automatisierung („Datum erreicht“ mit demselben Typ und Feld) entsteht genau eine – mit
   * derselben Vorlaufzeit, demselben Empfänger und Text, eingeschaltet, damit sich nichts ändert. Feste Id je Typ und
   * Feld: mehrere Server legen sie nicht doppelt an. Einmal übernommen, entsteht sie nie wieder (auch nicht, wenn der
   * Admin sie löscht). Herkunft: das Paket des Mappentyps, sonst „eigen“. **Einmal** beim ersten Start nach dem Update
   * (Einstellung `fristen_umzug`): Danach legt ein Feld mit „ist eine Frist“ keine Automatisierung mehr an – Erinnerungen
   * bringen die Pakete mit (aus, beim Installieren wählbar) bzw. legt man selbst an. Die Werkbank sagt, was umgezogen ist.
   */
  async fristenUebernehmen(): Promise<number> {
    const einstSp = this.d.dienst.kern.einstellungen;
    if (await einstSp?.lies('fristen_umzug')) return 0;
    const k = await this.kontext();
    const pakete = await this.d.dienst.kern.repo.listePakete();
    const alle = await this.d.repo.liste();
    const einst = this.d.dienst.kern.einstellungen;
    const schon = new Set<string>(((await einst?.lies('fristen_uebernommen')) as string[] | null) ?? []);
    const vorher = schon.size;
    let neu = 0;
    for (const typ of k.typen) {
      for (const feld of typ.felder.filter((f) => f.typ === 'datum' && f.frist)) {
        const schluessel = `${typ.id}|${feld.key}`;
        if (schon.has(schluessel)) continue;
        schon.add(schluessel);
        if (alle.some((a) => a.wenn.art === 'datum' && a.wenn.typ === typ.id && a.wenn.feld === feld.key && a.herkunft !== 'dms')) continue;
        const fr = feld.frist!;
        const paket = pakete.find((p) => Object.values(p.typen).includes(typ.id));
        const text = fr.text.replace(/\{feld\}/g, feld.label);
        const d = bereinigeAutomatisierung({
          name: t('automatisierung.frist.name', { feld: feld.label, typ: typ.name }),
          beschreibung: t('automatisierung.frist.text'),
          wenn: { art: 'datum', typ: typ.id, feld: feld.key, vorlauf: fr.vorlauf, einheit: fr.einheit, uhrzeit: '07:00', wiederholung: fr.wiederholung },
          dann: [{ id: 'f1', art: 'aufgabe', als: 'aufgabe', empfaenger: [fr.empfaengerFeld ? { art: 'feld', feld: fr.empfaengerFeld, sonst: 'ersteller' } : { art: 'ersteller' }], text }],
        });
        d.reihenfolge = paket ? REIHENFOLGE.paket : REIHENFOLGE.eigen;
        const id = uuidAus(`frist|${typ.id}|${feld.key}`);
        const a: Automatisierung = { ...d, id, aktiv: true, angehalten: null, herkunft: paket ? 'paket' : 'eigen', paketId: paket?.id ?? null, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
        try { await this.d.repo.lege(a); neu++; } catch { continue; /* ein anderer Server war schneller */ }
        log.info('Erinnerung am Feld als Automatisierung übernommen', { typ: typ.name, feld: feld.key, automatisierung: id });
      }
    }
    if (schon.size !== vorher) await einst?.schreibe('fristen_uebernommen', [...schon].sort());
    // Vertretung (#712/#678): Der Kern legt keine Vertretungs-Aufgabe mehr an. In einer bestehenden Ablage (mehr als
    // ein Benutzer) übernimmt eine eingeschaltete Automatisierung das – gleicher Text, erledigt sich wie bisher.
    if (k.benutzer.filter((b) => b.aktiv !== false).length >= 2) {
      const d = bereinigeAutomatisierung({
        name: t('automatisierung.vertretung.name'), beschreibung: t('automatisierung.vertretung.beschreibung'),
        wenn: { art: 'benutzer.abwesenheit_gesetzt', typ: null },
        dann: [{ id: 'v1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ereignis', feld: 'vertreter' }], text: t('automatisierung.vertretung.text'), faellig: null }],
      });
      d.reihenfolge = REIHENFOLGE.eigen;
      const a: Automatisierung = { ...d, id: UMZUG_VERTRETUNG, aktiv: true, angehalten: null, herkunft: 'eigen', paketId: null, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
      try { await this.d.repo.lege(a); neu++; log.info('Vertretungs-Aufgabe als Automatisierung übernommen', { automatisierung: a.id }); } catch { /* ein anderer Server war schneller */ }
    }
    await einst?.schreibe('fristen_umzug', { am: this.iso(), anzahl: neu, gesehen: neu === 0 });
    return neu;
  }

  /**
   * Benachrichtigungen → Automatisierungen (#678): Tägliche Zusammenfassung, Favoriten benachrichtigen und die Meldungen
   * des Anmeldeschutzes macht der Kern nicht mehr von selbst. **Einmal** beim ersten Start nach dem Update (Einstellung
   * `benachrichtigungen_umzug`) entstehen in einer bestehenden Ablage dafür Automatisierungen mit den heutigen Werten –
   * eingeschaltet, wie die Einstellungen es waren. Das Paket „Benachrichtigungen“ ersetzt sie, solange sie unverändert
   * sind. Eine frische Installation bekommt sie über das Paket (im Einrichtungsassistenten vorausgewählt).
   */
  async benachrichtigungenUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    if (!einst || await einst.lies('benachrichtigungen_umzug')) return 0;
    const k = await this.kontext();
    let neu = 0;
    if (k.benutzer.length) {
      const mail = { aktiv: true, uhrzeit: '07:00', ...(((await einst.lies('aufgaben_mail')) ?? {}) as { aktiv?: boolean; uhrzeit?: string }) };
      const sperre = ((await einst.lies('anmeldesperre')) ?? {}) as { mail?: boolean; mailKonto?: boolean; mailGewaehlt?: boolean };
      const liste: Array<{ id: string; aktiv: boolean; name: string; wenn: Record<string, unknown>; dann: Record<string, unknown>[] }> = [
        { id: UMZUG.zusammenfassung, aktiv: mail.aktiv !== false, name: t('automatisierung.umzug.zusammenfassung'),
          wenn: { art: 'zeitplan', uhrzeit: mail.uhrzeit, tage: [1, 2, 3, 4, 5], feiertage: true, jeBenutzer: true, profilzeit: true }, dann: [{ id: 'z1', art: 'zusammenfassung' }] },
        { id: UMZUG.favoriten, aktiv: true, name: t('automatisierung.umzug.favoriten'), wenn: { art: 'favorit.geaendert', typ: null }, dann: [{ id: 'f1', art: 'favoriten' }] },
        { id: UMZUG.sammel, aktiv: sperre.mailGewaehlt === true && sperre.mail === true, name: t('automatisierung.umzug.anmeldeschutz'),
          wenn: { art: 'zeitplan', uhrzeit: '00:00', tage: [1, 2, 3, 4, 5, 6, 7], feiertage: false, jeBenutzer: false }, dann: [{ id: 'a1', art: 'anmeldeschutz', was: 'sammel' }] },
        { id: UMZUG.konto, aktiv: sperre.mailKonto === true, name: t('automatisierung.umzug.kontosperre'), wenn: { art: 'benutzer.gesperrt', typ: null }, dann: [{ id: 'k1', art: 'anmeldeschutz', was: 'konto' }] },
      ];
      for (const x of liste) {
        const d = bereinigeAutomatisierung({ name: x.name, beschreibung: t('automatisierung.umzug.beschreibung'), wenn: x.wenn, dann: x.dann });
        d.reihenfolge = REIHENFOLGE.eigen;
        const a: Automatisierung = { ...d, id: x.id, aktiv: x.aktiv, angehalten: null, herkunft: 'eigen', paketId: null, version: 1, erstellt: this.iso(), erstelltVon: null, geaendert: this.iso(), geaendertVon: null };
        try { await this.d.repo.lege(a); neu++; } catch { /* ein anderer Server war schneller */ }
      }
      log.info('Benachrichtigungen als Automatisierungen übernommen', { anzahl: neu });
    }
    await einst.schreibe('benachrichtigungen_umzug', { am: this.iso(), anzahl: neu });
    return neu;
  }

  /** Hinweis „umgezogen“ (#712) gelesen – verschwindet aus der Werkbank. */
  async umzugGesehen(): Promise<void> {
    const einst = this.d.dienst.kern.einstellungen;
    const u = (await einst?.lies('fristen_umzug')) as { am: string; anzahl: number; gesehen: boolean } | null;
    if (u && !u.gesehen) await einst?.schreibe('fristen_umzug', { ...u, gesehen: true });
  }

  /** Was beim Update aus Erinnerungen am Feld wurde (#712); null, wenn nichts oder schon gesehen. */
  async umzug(): Promise<{ am: string; anzahl: number } | null> {
    const u = (await this.d.dienst.kern.einstellungen?.lies('fristen_umzug')) as { am: string; anzahl: number; gesehen: boolean } | null;
    return u && !u.gesehen && u.anzahl > 0 ? { am: u.am, anzahl: u.anzahl } : null;
  }

  /**
   * Frühere Beispiele des Kerns (#675) entfallen (#883): Fachliche Automatisierungen kommen aus Paketen. Ein
   * unverändertes, nie eingeschaltetes Beispiel (Herkunft „von Ablago“) wird still entfernt; ein eingeschaltetes oder
   * geändertes bleibt und wird eine normale eigene Automatisierung (löschbar). Das Protokoll nennt beides.
   */
  async raeumeBeispieleAuf(): Promise<{ entfernt: string[]; uebernommen: string[] }> {
    const entfernt: string[] = [];
    const uebernommen: string[] = [];
    for (const a of (await this.d.repo.liste()).filter((x) => x.herkunft === 'dms')) {
      const nieEin = !a.aktiv && a.geaendertVon === null && !(await this.d.repo.fassungen(a.id)).some((f) => f.daten.aktiv);
      if (nieEin) { await this.d.repo.loesche(a.id); entfernt.push(a.name); }
      else { await this.d.repo.setze(a.id, { herkunft: 'eigen' }); uebernommen.push(a.name); }
    }
    if (entfernt.length || uebernommen.length) {
      log.info('Beispiel-Automatisierungen aus dem Kern aufgeräumt', { entfernt: entfernt.join(', ') || '–', alsEigeneUebernommen: uebernommen.join(', ') || '–' });
    }
    return { entfernt, uebernommen };
  }

  /* ---------- Verwalten ---------- */

  async kontext(): Promise<Kontextdaten> { return this.d.dienst.automatisierungKontext(); }

  private async ansicht(a: Automatisierung, k: Kontextdaten, letzte: Map<string, Lauf>, unlesbar: Set<string>, kontoId: string | null): Promise<AutomatisierungAnsicht> {
    const l = letzte.get(a.id);
    const ohne = { ...a } as Automatisierung & { letzterTag?: unknown };
    delete ohne.letzterTag;
    // Darf das Konto „Automatisierung“ den Mappentyp der Wenn-Karte gar nicht lesen, kann sie nie laufen (#709) – nur Hinweis.
    const typ = kontextTyp(a.wenn, k.typen);
    const rechte = typ && unlesbar.has(typ.id) ? { typId: typ.id, typ: typ.name, kontoId, text: t('automatisierung.rechte.warnung', { typ: typ.name }) } : null;
    return {
      ...ohne, kurz: kurzform(a, k, (art) => (art === 'datum' ? t('automatisierung.wenn.datum') : t.frei(`ereignisse.name.${art.replace(/_/g, '-')}`))), probleme: automatisierungsProbleme(a, k), ausloeser: ausloeserSchluessel(a.wenn),
      letzterLauf: l ? { id: l.id, zustand: l.zustand, gestartet: l.gestartet, fehler: l.fehler } : null,
      ...(rechte ? { rechte } : {}),
    };
  }

  /** Mappentypen, die das Konto „Automatisierung“ überhaupt nicht lesen darf (#709). */
  private async unlesbar(): Promise<{ typen: Set<string>; kontoId: string | null }> {
    const konto = await this.konto().catch(() => null);
    if (!konto) return { typen: new Set(), kontoId: null };
    const z = await this.d.dienst.zugriff(konto);
    const typen = new Set<string>();
    for (const typ of await this.d.dienst.listeTypen()) {
      const lesbar = z.typen.has(typ.id) && (!z.lesen || z.lesen.offen.includes(typ.id) || z.lesen.je.some((x) => x.typId === typ.id));
      if (!lesbar) typen.add(typ.id);
    }
    return { typen, kontoId: konto.id };
  }

  async uebersicht(): Promise<{ automatisierungen: AutomatisierungAnsicht[]; fehlgeschlagen: number; fehlschlaege: Fehlschlag[] }> {
    const [liste, k, letzte, fehl, u] = await Promise.all([this.d.repo.liste(), this.kontext(), this.d.repo.letzte(), this.d.repo.fehlgeschlagene(), this.unlesbar()]);
    const namen = new Map(liste.map((a) => [a.id, a.name]));
    // Welche Läufe fehlgeschlagen sind (#707): Automatisierung und Zeitpunkt, neueste zuerst; Probeläufe zählen nicht.
    const fehlschlaege = fehl.map((l) => ({ id: l.id, automatisierungId: l.automatisierungId, name: namen.get(l.automatisierungId) ?? '', gestartet: l.gestartet }));
    return { automatisierungen: await Promise.all(liste.map((a) => this.ansicht(a, k, letzte, u.typen, u.kontoId))), fehlgeschlagen: fehl.length, fehlschlaege };
  }

  async hole(id: string): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    const u = await this.unlesbar();
    return this.ansicht(a, await this.kontext(), await this.d.repo.letzte(), u.typen, u.kontoId);
  }

  /**
   * Mappen zum Ausprobieren (#709): nur vom Mappentyp der Wenn-Karte und nur solche, die das Konto „Automatisierung“
   * lesen darf. Die Werkbank ist nur für Administratoren – die Schnittmenge mit ihren Rechten ist damit diese Menge.
   */
  async testmappen(id: string, suche: unknown): Promise<{ mappen: Array<{ id: string; titel: string; typId: string }>; gesamt: number }> {
    const a = await this.gibt(id);
    const typ = kontextTyp(a.wenn, (await this.kontext()).typen);
    if (!typ) return { mappen: [], gesamt: 0 };
    const konto = await this.konto();
    const s = await this.d.dienst.seite(konto, { sicht: `typ:${typ.id}`, suche, anzahl: 20 }, await this.d.dienst.zugriff(konto), 20);
    return { mappen: s.mappen.map((m) => ({ id: m.id, titel: m.titel ?? '', typId: m.typId })), gesamt: s.gesamt };
  }

  private async gibt(id: string) {
    const a = await this.d.repo.hole(id);
    if (!a) throw new Fachfehler(404, t('automatisierung.nicht-gefunden'));
    return a;
  }

  /** Speichern geht nur mit gültigem Stand (Fehler mit Gründen); eine neue Automatisierung startet ausgeschaltet. */
  private async pruefe(d: AutomatisierungDaten) {
    const p = automatisierungsProbleme(d, await this.kontext());
    if (p.length) throw new Fachfehler(422, p[0], { probleme: p });
    for (const k of [...d.dann, ...d.sonst]) if (k.art !== 'stopp' && !DANN_AUSFUEHRER[k.art]) throw new Fachfehler(422, t('automatisierung.karte.unbekannt', { art: k.art }));
  }

  async lege(e: unknown, von: string | null, herkunft: Herkunft = 'eigen'): Promise<AutomatisierungAnsicht> {
    if ((await this.d.repo.liste()).length >= AUTOMATISIERUNG_GRENZEN.automatisierungen) throw new Fachfehler(422, t('automatisierung.zuviele', { anzahl: AUTOMATISIERUNG_GRENZEN.automatisierungen }));
    const d = bereinigeAutomatisierung(e);
    const roh = (e ?? {}) as Record<string, unknown>;
    if (roh.reihenfolge === undefined) d.reihenfolge = REIHENFOLGE[herkunft];
    await this.pruefe(d);
    const a: Automatisierung = { ...d, id: randomUUID(), aktiv: roh.aktiv === true, angehalten: null, herkunft, version: 1, erstellt: this.iso(), erstelltVon: von, geaendert: this.iso(), geaendertVon: von };
    await this.d.repo.lege(a);
    log.info('Automatisierung angelegt', { id: a.id, name: a.name });
    return this.hole(a.id);
  }

  async aendere(id: string, e: unknown, von: string | null): Promise<AutomatisierungAnsicht> {
    const alt = await this.gibt(id);
    const roh = (e ?? {}) as Record<string, unknown>;
    const d = bereinigeAutomatisierung({ ...alt, ...roh });
    await this.pruefe(d);
    const version = Number(roh.version ?? alt.version);
    const aktiv = typeof roh.aktiv === 'boolean' ? roh.aktiv : alt.aktiv;
    if (!(await this.d.repo.speichere(id, { ...d, aktiv }, von, version))) throw new Fachfehler(409, t('automatisierung.konflikt'));
    // Gespeichert mit gültigem Stand: „fehlerhaft“ ist damit behoben (Bremse und Wiederherstellung hebt nur „einschalten“ auf).
    if (alt.angehalten?.grund === 'fehlerhaft' || (aktiv && !alt.aktiv)) await this.d.repo.setze(id, { angehalten: null });
    return this.hole(id);
  }

  /** An/aus. Einschalten hebt ein Anhalten auf (Bremse, Wiederherstellung) – aber nur mit gültigem Stand. */
  async schalte(id: string, aktiv: boolean, von: string | null): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    if (aktiv) await this.pruefe(a);
    if (a.aktiv !== aktiv && !(await this.d.repo.speichere(id, { ...a, aktiv }, von, a.version))) throw new Fachfehler(409, t('automatisierung.konflikt'));
    if (aktiv) await this.d.repo.setze(id, { angehalten: null });
    log.info(aktiv ? 'Automatisierung eingeschaltet' : 'Automatisierung ausgeschaltet', { id, name: a.name });
    return this.hole(id);
  }

  async loesche(id: string): Promise<void> {
    const a = await this.gibt(id);
    if (a.herkunft !== 'eigen') throw new Fachfehler(409, t('automatisierung.loeschen.herkunft'));
    await this.d.repo.loesche(id);
    log.info('Automatisierung gelöscht', { id, name: a.name });
  }

  /** Kopie als eigene Automatisierung (ausgeschaltet) – z. B. für einen zweiten Auslöser. */
  async kopiere(id: string, von: string | null): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    return this.lege({ ...a, name: t('automatisierung.kopie', { name: a.name }).slice(0, AUTOMATISIERUNG_GRENZEN.name), aktiv: false, reihenfolge: a.reihenfolge }, von, 'eigen');
  }

  async fassungen(id: string): Promise<Fassung[]> { await this.gibt(id); return this.d.repo.fassungen(id); }

  /** Eine frühere Fassung wird die neueste (ausgeschaltet, wenn sie nicht mehr gültig ist). */
  async stelleWieder(id: string, version: number, von: string | null): Promise<AutomatisierungAnsicht> {
    const a = await this.gibt(id);
    const f = (await this.d.repo.fassungen(id)).find((x) => x.version === version);
    if (!f) throw new Fachfehler(404, t('automatisierung.fassung.fehlt'));
    const d = bereinigeAutomatisierung(f.daten);
    const gueltig = !automatisierungsProbleme(d, await this.kontext()).length;
    if (!(await this.d.repo.speichere(id, { ...d, aktiv: gueltig && f.daten.aktiv }, von, a.version))) throw new Fachfehler(409, t('automatisierung.konflikt'));
    return this.hole(id);
  }

  async laeufe(id: string, anzahl = 50): Promise<Lauf[]> { await this.gibt(id); return this.d.repo.laeufe(id, Math.max(1, Math.min(AUTOMATISIERUNG_GRENZEN.verlauf, anzahl))); }
  async lauf(id: string): Promise<Lauf> { const l = await this.d.repo.lauf(id); if (!l) throw new Fachfehler(404, t('automatisierung.lauf.fehlt')); return l; }

  /** Für die Werkbank-Übersicht: fehlgeschlagene Läufe und angehaltene Automatisierungen. */
  async warnungen(): Promise<{ fehlgeschlagen: number; angehalten: Array<{ id: string; name: string; grund: Angehalten['grund'] }>; umgezogen: { am: string; anzahl: number } | null; ohneBenachrichtigungen: boolean }> {
    const [fehl, liste] = await Promise.all([this.d.repo.fehlgeschlagene(), this.d.repo.liste()]);
    const aktiv = liste.filter((a) => a.aktiv);
    // Was nicht mehr passt (Feld oder Ansicht gelöscht), zählt sofort – nicht erst beim nächsten Lauf.
    const k = aktiv.some((a) => !a.angehalten) ? await this.kontext() : null;
    const angehalten = aktiv.flatMap((a) => (a.angehalten ? [{ id: a.id, name: a.name, grund: a.angehalten.grund }]
      : k && automatisierungsProbleme(a, k).length ? [{ id: a.id, name: a.name, grund: 'fehlerhaft' as const }] : []));
    // Ohne Paket „Benachrichtigungen“ (#678): Keine Automatisierung schickt die Tägliche Zusammenfassung.
    const ohneBenachrichtigungen = !liste.some((a) => a.dann.some((d) => d.art === 'zusammenfassung'));
    return { fehlgeschlagen: new Set(fehl.map((l) => l.automatisierungId)).size, angehalten, umgezogen: await this.umzug(), ohneBenachrichtigungen };
  }

  /** Nach einer Wiederherstellung: alle eingeschalteten anhalten, bis ein Admin sie wieder einschaltet. */
  async nachWiederherstellung(): Promise<number> {
    let n = 0;
    for (const a of await this.d.repo.liste()) {
      if (!a.aktiv || a.angehalten) continue;
      await this.d.repo.setze(a.id, { angehalten: { grund: 'wiederherstellung', text: t('automatisierung.angehalten.wiederherstellung'), zeit: this.iso() } });
      n++;
    }
    return n;
  }

  /* ---------- Testlauf und Wiederholen ---------- */

  /** Mit einer gewählten Mappe ausführen – trocken (zeigt nur, was passieren würde) oder echt. */
  async wiedergeben(id: string, mappeId: unknown, trocken: boolean): Promise<Lauf> {
    const a = await this.gibt(id);
    await this.pruefe(a);
    if (!istUuid(mappeId)) throw new Fachfehler(422, t('automatisierung.test.mappe'));
    const k = await this.kontext();
    const typ = kontextTyp(a.wenn, k.typen);
    // Rechte des Kontos „Automatisierung“, nicht die des Admins – die Meldung sagt das auch so (#709).
    const roh = await this.d.dienst.pruefeRecht(undefined, mappeId, 'R');
    const m = await this.d.dienst.pruefeRecht(await this.d.dienst.systemZugriff('automatisierung'), mappeId, 'R').catch((x: unknown) => {
      if (x instanceof Fachfehler && (x.status === 403 || x.status === 404)) throw new Fachfehler(403, t('automatisierung.test.rechte', { typ: k.typen.find((y) => y.id === roh.typId)?.name ?? '' }));
      throw x;
    });
    if (typ && m.typId !== typ.id) throw new Fachfehler(422, t('automatisierung.test.typ', { typ: typ.name }));
    const daten: Record<string, unknown> = { mappe: m.id, typ: m.typId, ...(a.wenn.art === 'datum' ? { feld: a.wenn.feld, datum: m.werte[a.wenn.feld] ?? null, tage: tageBis(m.werte[a.wenn.feld]) } : {}) };
    const l = await this.fuehreAus(a, { id: randomUUID(), art: a.wenn.art, daten, kette: 0 }, { trocken, test: true });
    return l ?? this.lauf(id);
  }

  /** Einen fehlgeschlagenen Lauf noch einmal (mit den Angaben des Ereignisses, gegen den heutigen Stand). */
  async wiederhole(laufId: string): Promise<Lauf> {
    const alt = await this.lauf(laufId);
    if (alt.zustand !== 'fehlgeschlagen') throw new Fachfehler(409, t('automatisierung.wiederholen.nicht'));
    const a = await this.gibt(alt.automatisierungId);
    await this.d.repo.aktualisiere(alt.id, { zustand: 'wiederholt' });
    const l = await this.fuehreAus(a, { id: randomUUID(), art: alt.art, daten: alt.daten, kette: 0 }, { trocken: alt.trocken, test: alt.test, wiederholtVon: alt.id });
    return l!;
  }

  /**
   * Fehlgeschlagene Läufe nicht wiederholen (#707): einer (`laufId`) oder alle (einer Automatisierung bzw. alle). Sie bleiben
   * im Verlauf als „fehlgeschlagen, nicht wiederholt“ mit Person und Zeit stehen; nichts wird gelöscht.
   */
  async nichtWiederholen(o: { laufId?: string; automatisierungId?: string }, von: string | null): Promise<{ anzahl: number }> {
    if (o.laufId) {
      const l = await this.lauf(o.laufId);
      if (l.zustand !== 'fehlgeschlagen') throw new Fachfehler(409, t('automatisierung.wiederholen.nicht'));
      return { anzahl: await this.d.repo.nichtWiederholen([l.id], von) };
    }
    const ids = (await this.d.repo.fehlgeschlagene(o.automatisierungId)).map((l) => l.id);
    return { anzahl: ids.length ? await this.d.repo.nichtWiederholen(ids, von) : 0 };
  }

  /** Alle fehlgeschlagenen Läufe (einer oder aller Automatisierungen) wiederholen. */
  async wiederholeAlle(id?: string): Promise<{ wiederholt: number }> {
    let n = 0;
    for (const l of (await this.d.repo.fehlgeschlagene(id)).reverse()) { await this.wiederhole(l.id).catch(() => null); n++; }
    return { wiederholt: n };
  }

  /* ---------- Auslösen ---------- */

  /** Abnehmer des Ereigniskatalogs: passende Automatisierungen nacheinander. Wirft nur, wenn die Datenbank streikt. */
  async ereignis(e: KatalogEreignis): Promise<void> {
    if (!(e.art in EREIGNISKATALOG) || OHNE_WENN.includes(EREIGNISKATALOG[e.art].gruppe) || e.ausloeser?.still) return;
    const alle = await this.d.repo.liste();
    const liste = alle.filter((a) => a.aktiv && !a.angehalten && a.wenn.art === e.art && this.passt(a, e));
    if (liste.length) await this.reihe(liste, { id: e.id, art: e.art, daten: e.daten, kette: e.ausloeser?.art === 'automatisierung' ? (e.ausloeser.kette ?? 1) : 0, ausloeser: e.ausloeser });
    if (e.art === 'mappe.angelegt' || e.art === 'mappe.geaendert') await this.datumImVorlauf(e, alle);
  }

  /**
   * „Datum erreicht“ auch beim Speichern (#712, wie früher die Erinnerung am Feld): Liegt das Datum einer gespeicherten
   * Mappe schon im Vorlauf (heute bis Datum), läuft die Automatisierung sofort – sonst würde ein Datum, das erst nach dem
   * Erinnerungstag eingetragen wird, nie erinnern. Dieselbe Ereignis-Id wie im Zeitplan: je Mappe und Datum genau einmal.
   */
  private async datumImVorlauf(e: KatalogEreignis, alle: Automatisierung[]) {
    const mappe = e.daten.mappe, typ = e.daten.typ;
    if (typeof mappe !== 'string' || typeof typ !== 'string') return;
    const geaendert = e.art === 'mappe.geaendert' ? alsListe(e.daten.felder) : null;
    const kandidaten = alle.filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'datum' && a.wenn.typ === typ && a.wenn.vorlauf > 0 && (!geaendert || geaendert.includes(a.wenn.feld)));
    if (!kandidaten.length) return;
    const heute = heuteIn(new Date(this.jetzt()));
    const gruppen = new Map<string, Automatisierung[]>();
    for (const a of kandidaten) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
    for (const liste of gruppen.values()) {
      const w = liste[0].wenn as Extract<WennDatum, { art: 'datum' }>;
      const datum = await this.d.dienst.datumVon(mappe, w.feld);
      // Nur im Vorlauf: Datum heute oder später, Erinnerungstag erreicht (auch heute – lief der Zeitplan schon, holt es das nach).
      if (!datum || datum < heute || verschiebe(datum, -w.vorlauf, w.einheit) > heute) continue;
      await this.reihe(liste, { id: uuidAus(`datum|${ausloeserSchluessel(w)}|${mappe}|${datum}`), art: 'datum', daten: { mappe, typ, feld: w.feld, datum, tage: tageBis(datum, heute) }, kette: 0 });
    }
  }

  private passt(a: Automatisierung, e: KatalogEreignis): boolean {
    const w = a.wenn;
    if (w.art === 'datum' || w.art === 'zeitplan') return false;
    if (EREIGNISKATALOG[w.art].gruppe !== 'benutzer' && w.typ && e.daten.typ !== w.typ) return false;
    if (w.art === 'mappe.geaendert' && w.felder?.length) { const g = alsListe(e.daten.felder); if (!w.felder.some((f) => g.includes(f))) return false; }
    return true;
  }

  /** Automatisierungen eines Ereignisses nacheinander; „Danach keine weiteren …“ beendet die Reihe. */
  private async reihe(liste: Automatisierung[], anlass: Anlass) {
    const sortiert = [...liste].sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
    let stopp: string | null = null;
    for (const a of sortiert) {
      // Keine Selbstauslösung: Änderungen einer Automatisierung lösen sie selbst nicht noch einmal aus.
      if (anlass.ausloeser?.art === 'automatisierung' && anlass.ausloeser.id === a.id) continue;
      if (stopp) { await this.vermerke(a, anlass, 'uebersprungen', t('automatisierung.lauf.gestoppt', { name: stopp })); continue; }
      const l = await this.fuehreAus(a, anlass, { trocken: false, test: false });
      if (l?.zustand === 'abgeschlossen' && l.schritte.some((s) => s.karte && s.zustand === 'ok' && a.dann.find((k) => k.id === s.karte)?.art === 'stopp')) stopp = a.name;
    }
  }

  /** Lauf ohne Ausführen festhalten (übersprungen: Kette, Bremse, Stopp, keine Leserechte). */
  private async vermerke(a: Automatisierung, anlass: Anlass, zustand: LaufZustand, text: string) {
    const mappeId = typeof anlass.daten.mappe === 'string' ? anlass.daten.mappe : typeof anlass.daten.benutzer === 'string' ? anlass.daten.benutzer : null;
    await this.d.repo.beginne({ id: randomUUID(), automatisierungId: a.id, ereignisId: anlass.id, art: anlass.art, daten: anlass.daten, mappeId, zustand, trocken: false, test: false,
      schritte: [{ teil: 'wenn', zustand: 'uebersprungen', text }], fehler: null, gestartet: this.iso(), beendet: this.iso() });
  }

  /** Eine Automatisierung für ein Ereignis ausführen; null, wenn es dazu schon einen Lauf gibt. */
  private async fuehreAus(a: Automatisierung, anlass: Anlass, o: { trocken: boolean; test: boolean; wiederholtVon?: string }): Promise<Lauf | null> {
    const mappeId = typeof anlass.daten.mappe === 'string' ? anlass.daten.mappe : typeof anlass.daten.benutzer === 'string' ? anlass.daten.benutzer : null;
    if (!o.test) {
      if (anlass.kette >= AUTOMATISIERUNG_GRENZEN.tiefe) { await this.vermerke(a, anlass, 'uebersprungen', t('automatisierung.lauf.kette', { tiefe: AUTOMATISIERUNG_GRENZEN.tiefe })); return null; }
      const seit = new Date(this.jetzt() - 60_000).toISOString();
      if (await this.d.repo.zaehleSeit(a.id, seit) >= AUTOMATISIERUNG_GRENZEN.laeufeJeMinute) {
        const text = t('automatisierung.angehalten.bremse', { anzahl: AUTOMATISIERUNG_GRENZEN.laeufeJeMinute });
        await this.d.repo.setze(a.id, { angehalten: { grund: 'bremse', text, zeit: this.iso() } });
        await this.vermerke(a, anlass, 'uebersprungen', text);
        log.warn('Automatisierung angehalten (Bremse)', { id: a.id, name: a.name });
        return null;
      }
    }
    const schritte: Schritt[] = [
      { teil: 'wenn', zustand: 'ok', text: anlass.art === 'datum' ? t('automatisierung.wenn.datum') : anlass.art === 'zeitplan' ? t('automatisierung.wenn.zeitplan') : t.frei(`ereignisse.name.${anlass.art.replace(/_/g, '-')}`) },
      { teil: 'und', zustand: 'offen' },
      ...a.dann.map((k): Schritt => ({ teil: 'dann', karte: k.id, zustand: 'offen' })),
    ];
    const l: Lauf = { id: randomUUID(), automatisierungId: a.id, ereignisId: anlass.id, art: anlass.art, daten: anlass.daten, mappeId, zustand: 'laeuft', trocken: o.trocken, test: o.test, schritte, fehler: null, gestartet: this.iso(), beendet: null, wiederholtVon: o.wiederholtVon ?? null };
    if (!(await this.d.repo.beginne(l))) return null;
    const ende = async (zustand: LaufZustand, fehler: string | null = null) => {
      Object.assign(l, { zustand, fehler, beendet: this.iso() });
      await this.d.repo.aktualisiere(l.id, { zustand, fehler, beendet: l.beendet, schritte: l.schritte });
      if (zustand === 'fehlgeschlagen') log.warn('Automatisierung fehlgeschlagen', { id: a.id, name: a.name, fehler });
      return l;
    };
    const schritt = async (i: number, s: Partial<Schritt>) => { Object.assign(l.schritte[i], s); await this.d.repo.aktualisiere(l.id, { schritte: l.schritte }); };
    try {
      // Passt die Automatisierung noch (Mappentyp, Felder, Ansichten)? Sonst rot und angehalten.
      const k = await this.kontext();
      const probleme = automatisierungsProbleme(a, k);
      if (probleme.length) {
        if (!o.test) await this.d.repo.setze(a.id, { angehalten: { grund: 'fehlerhaft', text: probleme.join(' '), zeit: this.iso() } });
        await schritt(1, { zustand: 'fehler', text: probleme[0] });
        return await ende('fehlgeschlagen', probleme.join(' '));
      }
      const typ = kontextTyp(a.wenn, k.typen);
      const konto = await this.konto();
      const z = await this.d.dienst.systemZugriff('automatisierung');
      // Mappe mit den Rechten des Systemkontos: Was es nicht lesen darf, sieht die Automatisierung nicht.
      let mappe: Mappe | null = null;
      if (mappeId) {
        try { mappe = await this.d.dienst.pruefeRecht(z, mappeId, 'R'); }
        catch (x) {
          if (x instanceof Fachfehler && x.status === 403) { await schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.nicht-lesbar') }); return await ende('uebersprungen'); }
          if (!(x instanceof Fachfehler && x.status === 404)) throw x;
        }
      }
      if (typ && mappe && mappe.typId !== typ.id) { await schritt(1, { zustand: 'uebersprungen', text: t('automatisierung.lauf.anderer-typ') }); return await ende('uebersprungen'); }
      const personen = async (e: Empfaenger): Promise<string[]> => {
        if (e.art === 'person') return [e.id];
        if (e.art === 'rolle') return this.d.dienst.mitgliederDerRolle(e.id);
        const ersteller = mappe?.erstelltVon && istUuid(mappe.erstelltVon) ? [mappe.erstelltVon] : [];
        if (e.art === 'ersteller') return ersteller;
        // Person aus dem Ereignis (#678/#712), z. B. der Vertreter bei „Abwesenheit gesetzt“.
        if (e.art === 'ereignis') return alsListe(anlass.daten[e.feld]).filter(istUuid);
        const imFeld = mappe ? alsListe(mappe.werte[e.feld]).filter(istUuid) : [];
        return imFeld.length || e.sonst !== 'ersteller' ? imFeld : ersteller;
      };
      // Und
      const und = await this.pruefeUnd(a.und.karten, a.und.modus, mappe, konto.id, personen);
      await schritt(1, { zustand: und.ok ? 'ok' : 'nein', text: und.text });
      if (!und.ok) {
        for (let i = 2; i < l.schritte.length; i++) l.schritte[i].zustand = 'uebersprungen';
        return await ende('unzutreffend');
      }
      // Dann
      const kontext: KartenKontext = {
        dienst: this.d.dienst, z, konto, automatisierung: a, mappe, typ, daten: anlass.daten, trocken: o.trocken, personen,
        fuelle: (text) => this.fuelle(text, { a, mappe, typ, z, daten: anlass.daten, art: anlass.art }),
        fuelleFuer: async (text, an) => {
          const c = { a, mappe, typ, z, daten: anlass.daten, art: anlass.art };
          const empf = an ? await this.d.dienst.zugriffVon(an) : null;
          if (!empf) return { text: await this.fuelle(text, c), verborgen: 0, mappe: true };
          const basis = await this.fuelleMit(text, c, null);
          const fuer = await this.fuelleMit(text, c, empf);
          return { text: fuer.text, verborgen: Math.max(0, fuer.verborgen - basis.verborgen), mappe: fuer.mappe };
        },
        anlass: { automatisierung: { id: a.id, name: a.name, eingerichtetVon: a.erstelltVon } },
      };
      const begonnen = this.jetzt();
      for (let i = 0; i < a.dann.length; i++) {
        const karte = a.dann[i];
        const si = i + 2;
        if (this.jetzt() - begonnen > AUTOMATISIERUNG_GRENZEN.laufzeitS * 1000) {
          await schritt(si, { zustand: 'fehler', text: t('automatisierung.lauf.zeit', { s: AUTOMATISIERUNG_GRENZEN.laufzeitS }) });
          return await ende('fehlgeschlagen', t('automatisierung.lauf.zeit', { s: AUTOMATISIERUNG_GRENZEN.laufzeitS }));
        }
        await schritt(si, { zustand: 'laeuft' });
        if (karte.art === 'stopp') { await schritt(si, { zustand: 'ok', text: t('automatisierung.karte.stopp.ergebnis') }); continue; }
        try {
          const art = (karte as DannKarte).art;
          const ausf = DANN_AUSFUEHRER[art];
          if (!ausf) throw new Fachfehler(422, t('automatisierung.karte.unbekannt', { art }));
          const text = await this.d.dienst.mitAusloeser({ art: 'automatisierung', id: a.id, konto: konto.id, kette: anlass.kette + 1 }, () => ausf(karte, kontext));
          await schritt(si, { zustand: 'ok', text });
        } catch (x) {
          const text = (x as Error).message;
          await schritt(si, { zustand: 'fehler', text });
          for (let j = si + 1; j < l.schritte.length; j++) l.schritte[j].zustand = 'uebersprungen';
          return await ende('fehlgeschlagen', text);
        }
      }
      return await ende('abgeschlossen');
    } catch (x) {
      return ende('fehlgeschlagen', (x as Error).message);
    }
  }

  /** Und-Bedingungen: jede umkehrbar, „alle“ oder „eine davon“, eine Ebene Gruppen. */
  private async pruefeUnd(karten: UndKarte[], modus: 'alle' | 'eine', mappe: Mappe | null, ich: string, personen: (e: Empfaenger) => Promise<string[]>): Promise<{ ok: boolean; text: string }> {
    if (!karten.length) return { ok: true, text: t('automatisierung.und.keine') };
    const flach: UndKarte[] = karten.flatMap((k) => (k.art === 'gruppe' ? k.karten : [k]));
    // Merkmal der Ablage (#1032): gilt ohne Mappe – auch bei Zeitplänen.
    const merkmal = (k: UndKarte) => k.art === 'bedingung' && k.bedingung.art === 'merkmal';
    if (!mappe && !flach.every(merkmal)) return { ok: false, text: t('automatisierung.und.ohne-mappe') };
    const merkmale = flach.some(merkmal) ? await this.d.dienst.merkmale() : undefined;
    const mitMappe = flach.filter((k) => !merkmal(k));
    const teile = await Promise.all(mitMappe.map(async (k) => k.art === 'bedingung' ? { art: 'bedingungen' as const, bedingungen: [k.bedingung as Bedingung] }
      : k.art === 'ansicht' ? { art: 'sicht' as const, sicht: k.sicht }
        : { art: 'favorit' as const, benutzer: k.art === 'favorit' ? await personen(k.von) : [] }));
    const erg = mappe && mitMappe.length ? await this.d.dienst.trifftTeile(mappe.id, teile, ich) : [];
    const trifft = (k: UndKarte) => (k.art === 'bedingung' && k.bedingung.art === 'merkmal' ? merkmalTrifft(k.bedingung, merkmale) : erg[mitMappe.indexOf(k)]);
    const wert = new Map(flach.map((k) => [k, trifft(k) !== (k.nicht === true)]));
    const verbinde = (liste: UndKarte[], m: 'alle' | 'eine'): boolean => {
      const w = liste.map((k) => (k.art === 'gruppe' ? verbinde(k.karten, k.modus) !== (k.nicht === true) : wert.get(k)!));
      return m === 'alle' ? w.every(Boolean) : w.some(Boolean);
    };
    const ok = verbinde(karten, modus);
    const treffer = [...wert.values()].filter(Boolean).length;
    return { ok, text: t('automatisierung.und.ergebnis', { treffer, anzahl: flach.length }) };
  }

  /** Platzhalter wie beim Mappentitel – Feldwerte mit den Rechten des Kontos; Passwörter nie. */
  async fuelle(text: string, c: { a: Automatisierung; mappe: Mappe | null; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown>; art?: string }): Promise<string> {
    return (await this.fuelleMit(text, c, null)).text;
  }

  /**
   * Platzhalter füllen (#795): mit den Rechten des Kontos und – mit `empf` – zusätzlich mit denen des Empfängers. Was er
   * nicht sehen darf, erscheint als „(nicht sichtbar)“: Darf er die Mappe nicht lesen, gilt das für Titel, Mappentyp,
   * Datum, Tage und alle Felder; sonst für Titel verknüpfter Mappen und Personen, die er nicht sehen darf.
   * `verborgen` zählt die Platzhalter mit verdecktem Inhalt.
   */
  async fuelleMit(text: string, c: { a: Automatisierung; mappe: Mappe | null; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown>; art?: string }, empf: Zugriff | null): Promise<{ text: string; verborgen: number; mappe: boolean }> {
    const { a, mappe, typ, z, daten } = c;
    const versteckt = t('automatisierung.platzhalter.nicht-sichtbar');
    const mappeSichtbar = !empf || !mappe || (await this.d.dienst.lesbare(empf, [mappe.id])).has(mappe.id);
    const refs = mappe && typ ? typ.felder.filter((f) => f.typ === 'referenz').flatMap((f) => alsListe(mappe.werte[f.key])).filter(istUuid) : [];
    const titel = refs.length ? await this.d.dienst.lesbareTitel(z, refs) : new Map<string, string>();
    if (empf && refs.length) { const ok = await this.d.dienst.lesbare(empf, refs); for (const id of [...titel.keys()]) if (!ok.has(id)) titel.delete(id); }
    const fest: Record<string, string> = {
      titel: mappe?.titel ?? '', mappentyp: typ?.name ?? '', heute: tagVon(new Date(this.jetzt()).toISOString()), automatisierung: a.name,
      datum: typeof daten.datum === 'string' ? tagVon(`${daten.datum}T12:00:00Z`) : '', tage: daten.tage === undefined ? '' : String(daten.tage),
    };
    const verdeckt = new Set<string>();
    // Ohne Leserecht an der Mappe: nichts, was aus ihr stammt.
    if (!mappeSichtbar) for (const k of ['titel', 'mappentyp', 'datum', 'tage']) if (fest[k]) { fest[k] = versteckt; verdeckt.add(k); }
    // Aus dem Ereignis (#678/#712): Personen mit Namen, Zeitraum einer Abwesenheit lesbar.
    const tag = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? tagVon(`${x}T12:00:00Z`) : '');
    const personen = (PERSONEN_IM_EREIGNIS[c.art ?? ''] ?? []).filter((k) => typeof daten[k] === 'string' && istUuid(daten[k] as string));
    const siehtPersonen = empf && personen.length ? await this.d.dienst.lesbare(empf, personen.map((k) => daten[k] as string)) : null;
    for (const k of personen) {
      const id = daten[k] as string;
      if (siehtPersonen && !siehtPersonen.has(id)) { fest[k] = versteckt; verdeckt.add(k); } else fest[k] = await this.d.dienst.name(id);
    }
    if ('von' in daten || 'bis' in daten) {
      fest.von = tag(daten.von); fest.bis = tag(daten.bis);
      fest.zeitraum = fest.von && fest.bis ? t('automatisierung.platzhalter.zeitraum.von-bis', { von: fest.von, bis: fest.bis }) : fest.von ? t('automatisierung.platzhalter.zeitraum.ab', { von: fest.von })
        : fest.bis ? t('automatisierung.platzhalter.zeitraum.bis', { bis: fest.bis }) : t('automatisierung.platzhalter.zeitraum.offen');
    }
    let verborgen = 0;
    const erg = text.replace(/\{([a-z][a-z0-9_]*)((?:\|[^{}|]*)*)\}/g, (ganz, key: string) => {
      if (key in fest) { if (verdeckt.has(key)) verborgen++; return fest[key]; }
      const f = typ?.felder.find((x) => x.key === key);
      if (!f || f.typ === 'passwort' || !mappe) return ganz;
      if (!mappeSichtbar) { verborgen++; return versteckt; }
      let fehlt = false;
      const w = titelAus({ felder: typ!.felder, titelVorlage: ganz }, mappe.werte, (id) => { const x = titel.get(id); if (x === undefined) fehlt = true; return x ?? versteckt; });
      if (fehlt) verborgen++;
      return w;
    });
    return { text: erg, verborgen, mappe: mappeSichtbar };
  }

  /* ---------- Zeitplan „Datum in N Tagen“ ---------- */

  /** Prüft fällige Tage (auch verpasste) und räumt auf. Mehrere Server: je Mappe und Tag genau ein Lauf (eindeutig). */
  async zeitplan(): Promise<void> {
    if (this.zeitplanLauf) return this.zeitplanLauf;
    this.zeitplanLauf = (async () => {
      if (this.d.pause?.()) return;
      const jetzt = new Date(this.jetzt());
      const heute = heuteIn(jetzt);
      const uhrzeit = UHR_FORMAT().format(jetzt);
      // Bearbeiten geht vor Automatisierung: Was nicht mehr passt, wird rot und angehalten (mit Grund).
      const k = await this.kontext();
      for (const a of await this.d.repo.liste()) {
        if (!a.aktiv || a.angehalten) continue;
        const p = automatisierungsProbleme(a, k);
        if (p.length) { await this.d.repo.setze(a.id, { angehalten: { grund: 'fehlerhaft', text: p.join(' '), zeit: this.iso() } }); log.warn('Automatisierung angehalten (passt nicht mehr)', { id: a.id, name: a.name, grund: p[0] }); }
      }
      const alle = (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'datum');
      // Gleiche Auslöser (Typ, Feld, Vorlauf) gemeinsam: Reihenfolge und „Danach keine weiteren …“ gelten auch hier.
      const gruppen = new Map<string, typeof alle>();
      for (const a of alle) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
      const ort = { datum: heute, uhr: uhrzeit };
      for (const liste of gruppen.values()) {
        for (const a of liste) {
          const w = a.wenn as Extract<WennDatum, { art: 'datum' }>;
          // Zeitplan-Baustein (#724): eine Regel zum Nachholen; neu eingeschaltet ab heute (nichts rückwirkend).
          for (const tag of faelligeTage(a.letzterTag, ort, { uhrzeit: w.uhrzeit, nachholenTage: AUTOMATISIERUNG_GRENZEN.nachholenTage })) {
            for (const ziel of erreichteDaten(tag, w.vorlauf, w.einheit)) {
              for (const mappe of await this.d.dienst.mappenMitDatum(w.typ, w.feld, ziel)) {
                const ereignis = uuidAus(`datum|${ausloeserSchluessel(w)}|${mappe}|${ziel}`);
                // Alle der Gruppe für diese Mappe und diesen Tag (die eigene Reihenfolge entscheidet).
                await this.reihe(liste.filter((x) => x.id === a.id || (x.letzterTag ? x.letzterTag < tag : tag === heute)), { id: ereignis, art: 'datum', daten: { mappe, typ: w.typ, feld: w.feld, datum: ziel, tage: tageBis(ziel, tag) }, kette: 0 });
              }
            }
            for (const x of liste) await this.d.repo.setze(x.id, { letzterTag: tag });
            for (const x of liste) x.letzterTag = tag;
          }
        }
      }
      await this.zeitplanKarten(ort);
      await this.d.repo.raeumeAuf(AUTOMATISIERUNG_GRENZEN.verlaufTage, AUTOMATISIERUNG_GRENZEN.verlauf, HAENGT_MIN);
    })().finally(() => { this.zeitplanLauf = null; });
    return this.zeitplanLauf;
  }

  /**
   * Wenn-Karte „Zeitplan“ (#678) über den Zeitplan-Baustein (#724): je Automatisierung – bzw. je Automatisierung und
   * Benutzer bei „für jeden Benutzer“ – ein Merker in den Einstellungen; verpasste Läufe holt er nur am selben Tag nach
   * (wie die Tägliche Zusammenfassung). Mehrere Server: Wer den Tag im Merker einträgt, macht den Lauf; dazu je Lauf eine
   * feste Ereignis-Id (genau einmal).
   */
  private async zeitplanKarten(ort: { datum: string; uhr: string }) {
    const alle = (await this.d.repo.liste()).filter((a) => a.aktiv && !a.angehalten && a.wenn.art === 'zeitplan');
    if (!alle.length) return;
    const einst = this.d.dienst.kern.einstellungen;
    const roh = ((await einst?.lies('aufgaben_mail')) ?? {}) as { bundesland?: unknown };
    const bundesland = istBundesland(roh.bundesland) ? roh.bundesland : null;
    const merker = (schluessel: string): Merker => {
      if (einst) return { lies: async () => { const v = await einst.lies(schluessel); return typeof v === 'string' ? v : null; }, beanspruche: async (alt, tag) => {
        if (einst.tausche) return einst.tausche(schluessel, alt, tag);
        if (((await einst.lies(schluessel)) ?? null) !== alt) return false;
        await einst.schreibe(schluessel, tag); return true;
      } };
      return { lies: async () => this.merkerOhneSpeicher.get(schluessel) ?? null, beanspruche: async (alt, tag) => { if ((this.merkerOhneSpeicher.get(schluessel) ?? null) !== alt) return false; this.merkerOhneSpeicher.set(schluessel, tag); return true; } };
    };
    const takt = (uhrzeit: string, tage: number[], feiertage: boolean) => ({ uhrzeit, an: (tag: string) => tage.includes(wochentagVon(tag)) && !(feiertage && feiertagAm(tag, bundesland)) });
    // Gleiche Auslöser gemeinsam (Reihenfolge, „Danach keine weiteren …“) – je Benutzer bzw. je Tag ein Ereignis.
    const gruppen = new Map<string, Automatisierung[]>();
    for (const a of alle) gruppen.set(ausloeserSchluessel(a.wenn), [...(gruppen.get(ausloeserSchluessel(a.wenn)) ?? []), a]);
    const k = await this.kontext();
    for (const [schluessel, liste] of gruppen) {
      const w = liste[0].wenn as WennZeitplan;
      const sk = createHash('sha256').update(schluessel).digest('hex').slice(0, 16);
      if (!w.jeBenutzer) {
        await laufeFaellige(merker(`zeitplan_zuletzt:${sk}`), ort, takt(w.uhrzeit, w.tage, w.feiertage), async (tag) => {
          await this.reihe(liste, { id: uuidAus(`zeitplan|${schluessel}|${tag}`), art: 'zeitplan', daten: { tag }, kette: 0 });
        });
        continue;
      }
      const wer = w.rolle ? new Set(await this.d.dienst.mitgliederDerRolle(w.rolle)) : null;
      for (const b of k.benutzer) {
        if (b.aktiv === false || (wer && !wer.has(b.id))) continue;
        let t_ = takt(w.uhrzeit, w.tage, w.feiertage);
        if (w.profilzeit) {
          // Wie bisher die Tägliche Zusammenfassung: Uhrzeit, Wochentage und Feiertage aus dem Profil, sonst die Karte.
          const z = wirksameZeit((await this.d.dienst.persoenlicheEinstellungen(b.id)).aufgaben_mail_zeit, { aktiv: true, uhrzeit: w.uhrzeit, bundesland });
          t_ = takt(z.uhrzeit, z.tage, z.feiertage);
        }
        await laufeFaellige(merker(`zeitplan_zuletzt:${sk}:${b.id}`), ort, t_, async (tag) => {
          await this.reihe(liste, { id: uuidAus(`zeitplan|${schluessel}|${b.id}|${tag}`), art: 'zeitplan', daten: { benutzer: b.id, tag }, kette: 0 });
        });
      }
    }
  }
}

type WennDatum = Automatisierung['wenn'];
type WennZeitplan = Extract<WennDatum, { art: 'zeitplan' }>;

/** Tage von `ab` (Vorgabe heute) bis zum Datum – Platzhalter {tage}; leer ohne Datum. */
function tageBis(datum: unknown, ab = heuteIn()): number | null {
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  return Math.round((Date.parse(`${datum}T12:00:00Z`) - Date.parse(`${ab}T12:00:00Z`)) / 86_400_000);
}
